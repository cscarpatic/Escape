(() => {
  const isCoarse = matchMedia('(pointer:coarse)').matches;
  const MAX_DPR = isCoarse ? 1.35 : 1.5;
  const previousNightMask = drawNightMask;

  function applyResolutionCap(){
    const target=Math.min(MAX_DPR,window.devicePixelRatio||1);
    W=innerWidth;H=innerHeight;DPR=target;
    const cw=Math.max(1,Math.floor(W*DPR)),ch=Math.max(1,Math.floor(H*DPR));
    if(canvas.width!==cw||canvas.height!==ch){
      canvas.width=cw;canvas.height=ch;
      canvas.style.width=W+'px';canvas.style.height=H+'px';
    }
    ctx.setTransform(DPR,0,0,DPR,0,0);
    if(darknessCanvas.width!==cw||darknessCanvas.height!==ch){
      darknessCanvas.width=cw;darknessCanvas.height=ch;
    }
    darknessCtx.setTransform(DPR,0,0,DPR,0,0);
  }
  addEventListener('resize',()=>requestAnimationFrame(applyResolutionCap));
  applyResolutionCap();

  function rectPoly(left,top,right,bottom){return[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];}
  function buildCityOccluders(road){
    if(road._perfCityOccluders)return road._perfCityOccluders;
    const out=[];
    for(const p of road.props||[]){
      if(p.mode!=='city')continue;
      const h=hash(p.seed*7),bw=45+h*45,bh=70+hash(p.seed*11)*110;
      const left=p.x-bw*.55,right=p.x+bw*.55,top=p.y-bh*.55,bottom=p.y+bh*.55;
      out.push({polygon:rectPoly(left,top,right,bottom),left,right,top,bottom});
    }
    road._perfCityOccluders=out;
    return out;
  }
  function occludersFor(g){
    const road=g.road,y=g.player.y,bucket=Math.floor(y/280);
    if(road._perfNearLightBucket===bucket&&road._perfNearLightOccluders)return road._perfNearLightOccluders;
    const source=g.env.propMode==='city'?buildCityOccluders(road):(road.lightOccluders||[]);
    const pad=900,out=[];
    for(const o of source){if(o?.polygon?.length>=3&&o.bottom>y-pad&&o.top<y+pad)out.push(o);}
    road._perfNearLightBucket=bucket;road._perfNearLightOccluders=out;
    return out;
  }
  function pointInPoly(x,y,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/((b.y-a.y)||1e-9)+a.x);if(hit)inside=!inside;}return inside;}
  function raySegment(ox,oy,dx,dy,a,b,maxDist){
    const sx=b.x-a.x,sy=b.y-a.y,den=dx*sy-dy*sx;if(Math.abs(den)<1e-8)return Infinity;
    const ax=a.x-ox,ay=a.y-oy,t=(ax*sy-ay*sx)/den,u=(ax*dy-ay*dx)/den;
    return t>=0&&t<=maxDist&&u>=0&&u<=1?t:Infinity;
  }
  function cast(ox,oy,angle,maxDist,local){
    const dx=Math.cos(angle),dy=Math.sin(angle);let best=maxDist;
    for(const o of local){
      if(pointInPoly(ox,oy,o.polygon))continue;
      const poly=o.polygon;
      for(let i=0;i<poly.length;i++){
        const hit=raySegment(ox,oy,dx,dy,poly[i],poly[(i+1)%poly.length],best);
        if(hit<best)best=Math.max(8,hit-3);
      }
    }
    return best;
  }
  function localOccluders(x,y,all,maxDist){
    const pad=maxDist+60,out=[];
    for(const o of all){if(!(o.right<x-pad||o.left>x+pad||o.bottom<y-pad||o.top>y+pad))out.push(o);}
    return out;
  }
  function beamPolygon(car,length,halfAngle,rays,all,occluded){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle),nose=Math.min(23,car.length*.42);
    const ox=car.x+fx*nose,oy=car.y+fy*nose,origin=worldToScreen(ox,oy),edge=[];
    const local=occluded?localOccluders(ox,oy,all,length):null;
    for(let i=0;i<=rays;i++){
      const f=i/rays,ang=car.angle-halfAngle+f*halfAngle*2;
      const natural=.88+.12*Math.sin(f*Math.PI),limit=length*natural;
      const reach=occluded?cast(ox,oy,ang,limit,local):limit;
      edge.push(worldToScreen(ox+Math.cos(ang)*reach,oy+Math.sin(ang)*reach));
    }
    return {origin,edge,ox,oy,fx,fy};
  }
  function paintBeam(d,shape,length,power){
    d.save();d.beginPath();d.moveTo(shape.origin.x,shape.origin.y);for(const p of shape.edge)d.lineTo(p.x,p.y);d.closePath();d.clip();
    const end=worldToScreen(shape.ox+shape.fx*length,shape.oy+shape.fy*length);
    const grad=d.createLinearGradient(shape.origin.x,shape.origin.y,end.x,end.y);
    grad.addColorStop(0,`rgba(255,250,232,${.48*power})`);
    grad.addColorStop(.36,`rgba(255,250,232,${.28*power})`);
    grad.addColorStop(.72,`rgba(255,250,232,${.10*power})`);
    grad.addColorStop(1,'rgba(255,250,232,0)');
    d.fillStyle=grad;d.fillRect(shape.origin.x-length,shape.origin.y-length,length*2,length*2);d.restore();
  }
  function drawTailGlow(car,power=1){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle),x=car.x-fx*car.length*.48,y=car.y-fy*car.length*.48,s=worldToScreen(x,y);
    if(s.x<-80||s.x>W+80||s.y<-80||s.y>H+80)return;
    const g=ctx.createRadialGradient(s.x,s.y,1,s.x,s.y,22);
    g.addColorStop(0,`rgba(255,42,62,${.72*power})`);g.addColorStop(1,'rgba(255,42,62,0)');
    ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x,s.y,22,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function nearbyCops(g,maxDist,maxCount){
    const max2=maxDist*maxDist,out=[];
    for(const c of g.cops||[]){const dx=c.x-g.player.x,dy=c.y-g.player.y;if(dx*dx+dy*dy<max2){out.push(c);if(out.length>=maxCount)break;}}
    return out;
  }
  function nearestTraffic(g,maxDist,maxCount){
    const max2=maxDist*maxDist,out=[];
    for(const t of g.traffic||[]){
      const dx=t.x-g.player.x,dy=t.y-g.player.y,d2=dx*dx+dy*dy;if(d2>=max2)continue;
      let pos=out.length;while(pos>0&&out[pos-1].d2>d2)pos--;
      out.splice(pos,0,{car:t,d2});if(out.length>maxCount)out.pop();
    }
    return out.map(x=>x.car);
  }

  drawNightMask=function(g){
    if(window.NightHeistLighting!=='night')return previousNightMask(g);
    const d=darknessCtx,env=g.env,all=occludersFor(g);
    d.setTransform(DPR,0,0,DPR,0,0);d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
    d.fillStyle=`rgba(0,2,7,${clamp(.87+env.fog*.17,.86,.95)})`;d.fillRect(0,0,W,H);d.globalCompositeOperation='destination-out';

    const playerRange=(env.propMode==='city'?620:env.propMode==='industrial'?585:env.propMode==='alpine'?530:600)*env.visibility;
    const playerHalf=env.propMode==='alpine'?.42:env.propMode==='industrial'?.46:.49;
    const playerRays=isCoarse?17:23;
    const playerCore=beamPolygon(g.player,playerRange,playerHalf,playerRays,all,true);
    const playerFeather=beamPolygon(g.player,playerRange*1.03,playerHalf*1.18,Math.max(9,Math.floor(playerRays*.55)),all,false);
    paintBeam(d,playerFeather,playerRange*1.03,.20);paintBeam(d,playerCore,playerRange,1);

    const cops=nearbyCops(g,820,3);
    for(const c of cops){const length=320*env.visibility;paintBeam(d,beamPolygon(c,length,.34,7,all,false),length,.32);}

    const traffic=nearestTraffic(g,620,isCoarse?4:6);
    for(const t of traffic){const length=215*env.visibility;paintBeam(d,beamPolygon(t,length,.27,5,all,false),length,.16);}

    d.globalCompositeOperation='source-over';d.globalAlpha=1;ctx.drawImage(darknessCanvas,0,0,W,H);
    drawEmergencyGlow(g);drawTailGlow(g.player,1);for(const c of cops)drawTailGlow(c,.55);
  };

  window.NightHeistPerformance={mode:'smooth',maxDpr:MAX_DPR,playerLightRays:isCoarse?17:23};
})();
