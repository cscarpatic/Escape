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
      const poly=o.polygon;for(let i=0;i<poly.length;i++){const hit=raySegment(ox,oy,dx,dy,poly[i],poly[(i+1)%poly.length],best);if(hit<best)best=Math.max(7,hit-3);}
    }
    return best;
  }
  function nearby(car,all,maxDist){
    const pad=maxDist+100;return all.filter(o=>!(o.right<car.x-pad||o.left>car.x+pad||o.bottom<car.y-pad||o.top>car.y+pad));
  }

  function buildBeamEdge(car,maxDist,halfAngle,all,rays,soften=0){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle),nose=Math.min(23,car.length*.42);
    const ox=car.x+fx*nose,oy=car.y+fy*nose,origin=worldToScreen(ox,oy),local=nearby(car,all,maxDist),edge=[];
    for(let i=0;i<=rays;i++){
      const f=i/rays,center=Math.sin(f*Math.PI),ang=car.angle-halfAngle+f*halfAngle*2;
      const limit=maxDist*(.955+.045*Math.pow(center,.65));
      const hit=cast(ox,oy,ang,limit,local);
      const softened=Math.min(limit,hit+soften);
      edge.push(worldToScreen(ox+Math.cos(ang)*softened,oy+Math.sin(ang)*softened));
    }
    return {origin,edge};
  }

  function clipBeam(d,origin,edge){
    d.beginPath();d.moveTo(origin.x,origin.y);for(const p of edge)d.lineTo(p.x,p.y);d.closePath();d.clip();
  }

  // Multi-stop radial falloff gives a visibly stronger hotspot near the lamps,
  // a broad usable mid-field, and a gentle fade in the far field.
  // A second, slightly expanded low-power pass creates a soft penumbra around
  // building edges instead of a razor-sharp shadow boundary.
  function occludedBeam(d,car,maxDist,halfAngle,power,all,rays){
    const hard=buildBeamEdge(car,maxDist,halfAngle,all,rays,0);
    const soft=buildBeamEdge(car,maxDist,halfAngle*1.018,all,Math.max(19,Math.floor(rays*.72)),18);

    d.save();clipBeam(d,soft.origin,soft.edge);
    const halo=d.createRadialGradient(soft.origin.x,soft.origin.y,20,soft.origin.x,soft.origin.y,maxDist*1.03);
    halo.addColorStop(0,`rgba(255,248,226,${.13*power})`);
    halo.addColorStop(.34,`rgba(255,248,226,${.09*power})`);
    halo.addColorStop(.72,`rgba(255,248,226,${.035*power})`);
    halo.addColorStop(1,'rgba(255,248,226,0)');
    d.fillStyle=halo;d.fillRect(soft.origin.x-maxDist,soft.origin.y-maxDist,maxDist*2,maxDist*2);d.restore();

    d.save();clipBeam(d,hard.origin,hard.edge);
    const beam=d.createRadialGradient(hard.origin.x,hard.origin.y,14,hard.origin.x,hard.origin.y,maxDist);
    beam.addColorStop(0,`rgba(255,250,232,${.54*power})`);
    beam.addColorStop(.12,`rgba(255,250,232,${.48*power})`);
    beam.addColorStop(.32,`rgba(255,250,232,${.34*power})`);
    beam.addColorStop(.56,`rgba(255,250,232,${.20*power})`);
    beam.addColorStop(.78,`rgba(255,250,232,${.085*power})`);
    beam.addColorStop(1,'rgba(255,250,232,0)');
    d.fillStyle=beam;d.fillRect(hard.origin.x-maxDist,hard.origin.y-maxDist,maxDist*2,maxDist*2);d.restore();
  }

  drawNightMask=function(g){
    if(window.NightHeistLighting!=='night')return baseNightMask(g);
    const d=darknessCtx,env=g.env,all=occludersFor(g);
    d.setTransform(DPR,0,0,DPR,0,0);d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
    d.fillStyle=`rgba(0,2,7,${clamp(.87+env.fog*.17,.86,.95)})`;d.fillRect(0,0,W,H);d.globalCompositeOperation='destination-out';

    const playerRange=(env.propMode==='city'?650:env.propMode==='industrial'?610:env.propMode==='alpine'?550:630)*env.visibility;
    const playerWidth=env.propMode==='alpine'?.82:env.propMode==='industrial'?.92:.98;
    occludedBeam(d,g.player,playerRange,playerWidth,1,all,107);
    for(const c of g.cops){if(Math.hypot(c.x-g.player.x,c.y-g.player.y)<1050)occludedBeam(d,c,390*env.visibility,.68,.64,all,41);}
    for(const t of g.traffic){if(Math.hypot(t.x-g.player.x,t.y-g.player.y)<850)occludedBeam(d,t,270*env.visibility,.50,.30,all,23);}

    d.globalCompositeOperation='source-over';d.globalAlpha=1;ctx.drawImage(darknessCanvas,0,0,W,H);drawEmergencyGlow(g);
  };
})();
