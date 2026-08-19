(() => {
  const baseNightMask=drawNightMask;

  function rectPoly(left,top,right,bottom){return[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];}
  function cityOccluders(g){
    const out=[];
    for(const p of g.road.props||[]){
      if(p.mode!=='city'||Math.abs(p.y-g.player.y)>1500)continue;
      const h=hash(p.seed*7),bw=45+h*45,bh=70+hash(p.seed*11)*110;
      const left=p.x-bw*.55,right=p.x+bw*.55,top=p.y-bh*.55,bottom=p.y+bh*.55;
      out.push({polygon:rectPoly(left,top,right,bottom),left,right,top,bottom,type:'building'});
    }
    return out;
  }
  function occludersFor(g){
    if(g.env.propMode==='city')return cityOccluders(g);
    return (g.road.lightOccluders||[]).filter(o=>o?.polygon?.length>=3);
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
        if(hit<best)best=Math.max(7,hit-3);
      }
    }
    return best;
  }
  function nearby(x,y,all,maxDist){
    const pad=maxDist+100;return all.filter(o=>!(o.right<x-pad||o.left>x+pad||o.bottom<y-pad||o.top>y+pad));
  }
  function clipBeam(d,origin,edge){d.beginPath();d.moveTo(origin.x,origin.y);for(const p of edge)d.lineTo(p.x,p.y);d.closePath();d.clip();}

  function beamShape(car,maxDist,halfAngle,all,rays,lateral=0,angleScale=1,occlusionSoft=0){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle),rx=-fy,ry=fx;
    const nose=Math.min(23,car.length*.42);
    const ox=car.x+fx*nose+rx*lateral,oy=car.y+fy*nose+ry*lateral;
    const local=nearby(ox,oy,all,maxDist),origin=worldToScreen(ox,oy),edge=[];
    for(let i=0;i<=rays;i++){
      const f=i/rays,center=Math.sin(f*Math.PI),ang=car.angle-halfAngle*angleScale+f*halfAngle*angleScale*2;
      const natural=.84+.16*Math.pow(center,.62),limit=maxDist*natural;
      const hit=cast(ox,oy,ang,limit,local),reach=Math.min(limit,hit+occlusionSoft);
      edge.push(worldToScreen(ox+Math.cos(ang)*reach,oy+Math.sin(ang)*reach));
    }
    return {origin,edge};
  }

  function paintBeam(d,shape,maxDist,power,alpha){
    d.save();clipBeam(d,shape.origin,shape.edge);
    const g=d.createRadialGradient(shape.origin.x,shape.origin.y,10,shape.origin.x,shape.origin.y,maxDist);
    g.addColorStop(0,`rgba(255,250,232,${.58*power*alpha})`);
    g.addColorStop(.16,`rgba(255,250,232,${.48*power*alpha})`);
    g.addColorStop(.38,`rgba(255,250,232,${.31*power*alpha})`);
    g.addColorStop(.62,`rgba(255,250,232,${.16*power*alpha})`);
    g.addColorStop(.82,`rgba(255,250,232,${.055*power*alpha})`);
    g.addColorStop(1,'rgba(255,250,232,0)');
    d.fillStyle=g;d.fillRect(shape.origin.x-maxDist,shape.origin.y-maxDist,maxDist*2,maxDist*2);d.restore();
  }

  // Each car has two physical lamps. Every lamp gets three overlapping visibility cones:
  // a bright core plus two wider, weaker shells. This removes the hard side boundary while
  // keeping building occlusion, where the expanded shells form a soft penumbra.
  function dualHeadlights(d,car,maxDist,halfAngle,power,all,rays){
    const spacing=Math.max(6,car.width*.25);
    for(const side of [-1,1]){
      const lateral=side*spacing;
      const outer=beamShape(car,maxDist*1.015,halfAngle,all,Math.max(25,Math.floor(rays*.70)),lateral,1.24,25);
      const feather=beamShape(car,maxDist*1.008,halfAngle,all,Math.max(31,Math.floor(rays*.82)),lateral,1.13,14);
      const core=beamShape(car,maxDist,halfAngle,all,rays,lateral,1,0);
      paintBeam(d,outer,maxDist*1.015,power,.13);
      paintBeam(d,feather,maxDist*1.008,power,.27);
      paintBeam(d,core,maxDist,power,.42);
    }
  }

  function screenVehicleAngle(car){return window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(car.angle):car.angle+Math.PI/2;}
  function drawLampHardware(car,isPlayer=false){
    const s=worldToScreen(car.x,car.y);
    if(s.x<-100||s.x>W+100||s.y<-100||s.y>H+100)return;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(screenVehicleAngle(car));
    const x=Math.max(6,car.width*.29),front=-car.length*.5-1,rear=car.length*.5-1;

    ctx.globalCompositeOperation='screen';
    ctx.shadowBlur=isPlayer?18:12;ctx.shadowColor='rgba(230,249,255,.95)';ctx.fillStyle='rgba(245,253,255,.98)';
    for(const lx of [-x,x]){ctx.beginPath();ctx.ellipse(lx,front,3.2,2.0,0,0,Math.PI*2);ctx.fill();}

    ctx.shadowBlur=isPlayer?24:15;ctx.shadowColor='rgba(255,24,42,.98)';ctx.fillStyle=isPlayer?'#ff2035':'#ff364f';
    for(const lx of [-x,x]){ctx.beginPath();ctx.ellipse(lx,rear,isPlayer?4.2:3.5,isPlayer?2.8:2.2,0,0,Math.PI*2);ctx.fill();}

    if(isPlayer){
      ctx.shadowBlur=0;ctx.globalAlpha=.34;
      for(const lx of [-x,x]){
        const glow=ctx.createRadialGradient(lx,rear,1,lx,rear,23);glow.addColorStop(0,'rgba(255,32,52,.95)');glow.addColorStop(1,'rgba(255,32,52,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(lx,rear,23,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }

  drawNightMask=function(g){
    if(window.NightHeistLighting!=='night')return baseNightMask(g);
    const d=darknessCtx,env=g.env,all=occludersFor(g);
    d.setTransform(DPR,0,0,DPR,0,0);d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
    d.fillStyle=`rgba(0,2,7,${clamp(.87+env.fog*.17,.86,.95)})`;d.fillRect(0,0,W,H);d.globalCompositeOperation='destination-out';

    const playerRange=(env.propMode==='city'?650:env.propMode==='industrial'?610:env.propMode==='alpine'?550:630)*env.visibility;
    const playerHalf=env.propMode==='alpine'?.43:env.propMode==='industrial'?.47:.50;
    dualHeadlights(d,g.player,playerRange,playerHalf,1,all,79);
    for(const c of g.cops){if(Math.hypot(c.x-g.player.x,c.y-g.player.y)<1050)dualHeadlights(d,c,390*env.visibility,.36,.62,all,35);}
    for(const t of g.traffic){if(Math.hypot(t.x-g.player.x,t.y-g.player.y)<850)dualHeadlights(d,t,270*env.visibility,.28,.28,all,21);}

    d.globalCompositeOperation='source-over';d.globalAlpha=1;ctx.drawImage(darknessCanvas,0,0,W,H);drawEmergencyGlow(g);

    // Draw the physical lamps after the darkness overlay so the getaway car's rear lamps
    // remain visibly red instead of being dimmed by the night mask.
    drawLampHardware(g.player,true);
    for(const c of g.cops){if(Math.hypot(c.x-g.player.x,c.y-g.player.y)<1050)drawLampHardware(c,false);}
    for(const t of g.traffic){if(Math.hypot(t.x-g.player.x,t.y-g.player.y)<750)drawLampHardware(t,false);}
  };
})();
