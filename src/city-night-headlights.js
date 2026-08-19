(() => {
  const baseNightMask = drawNightMask;

  function buildingRects(g) {
    const out=[];
    for(const p of g.road.props||[]){
      if(p.mode!=='city'||Math.abs(p.y-g.player.y)>1350)continue;
      const h=hash(p.seed*7);
      const bw=45+h*45, bh=70+hash(p.seed*11)*110;
      out.push({left:p.x-bw*.56,right:p.x+bw*.56,top:p.y-bh*.56,bottom:p.y+bh*.56});
    }
    return out;
  }

  function rayRectDistance(ox,oy,dx,dy,r,maxDist){
    let t0=0,t1=maxDist;
    if(Math.abs(dx)<1e-7){ if(ox<r.left||ox>r.right)return Infinity; }
    else{
      let a=(r.left-ox)/dx,b=(r.right-ox)/dx;if(a>b){const q=a;a=b;b=q;}
      t0=Math.max(t0,a);t1=Math.min(t1,b);if(t1<t0)return Infinity;
    }
    if(Math.abs(dy)<1e-7){ if(oy<r.top||oy>r.bottom)return Infinity; }
    else{
      let a=(r.top-oy)/dy,b=(r.bottom-oy)/dy;if(a>b){const q=a;a=b;b=q;}
      t0=Math.max(t0,a);t1=Math.min(t1,b);if(t1<t0)return Infinity;
    }
    return t1>=Math.max(0,t0)?Math.max(0,t0):Infinity;
  }

  function castDistance(ox,oy,angle,maxDist,rects){
    const dx=Math.cos(angle),dy=Math.sin(angle);
    let best=maxDist;
    for(const r of rects){
      if(ox>r.left&&ox<r.right&&oy>r.top&&oy<r.bottom)continue;
      const hit=rayRectDistance(ox,oy,dx,dy,r,best);
      if(hit<best)best=Math.max(8,hit-3);
    }
    return best;
  }

  function nearbyRects(car,rects,maxDist){
    const pad=maxDist+150;
    return rects.filter(r=>!(r.right<car.x-pad||r.left>car.x+pad||r.bottom<car.y-pad||r.top>car.y+pad));
  }

  // One continuous beam. The polygon only describes visibility/occlusion; illumination
  // itself comes from a single smooth gradient, so there are no visible light bands.
  function occludedCone(d,g,car,maxDist,halfAngle,power,rects,rays=81){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle);
    const nose=Math.min(22,car.length*.40);
    const ox=car.x+fx*nose,oy=car.y+fy*nose;
    const local=nearbyRects(car,rects,maxDist);
    const origin=worldToScreen(ox,oy);
    const edge=[];

    for(let i=0;i<=rays;i++){
      const f=i/rays;
      const centered=Math.sin(f*Math.PI);
      const ang=car.angle-halfAngle+f*halfAngle*2;
      // Rounded cone tip: central rays reach furthest, side rays end sooner.
      const naturalTip=.72+.28*Math.pow(centered,.58);
      const limit=maxDist*naturalTip;
      const hit=castDistance(ox,oy,ang,limit,local);
      edge.push(worldToScreen(ox+Math.cos(ang)*hit,oy+Math.sin(ang)*hit));
    }

    const tip=worldToScreen(ox+fx*maxDist,oy+fy*maxDist);
    const screenAngle=Math.atan2(tip.y-origin.y,tip.x-origin.x);

    d.save();
    d.beginPath();
    d.moveTo(origin.x,origin.y);
    for(const p of edge)d.lineTo(p.x,p.y);
    d.closePath();
    d.clip();

    // Continuous fade along the whole beam: bright near the headlights and smoothly
    // disappearing before the rounded tip, with no discrete zones.
    const beam=d.createLinearGradient(origin.x,origin.y,tip.x,tip.y);
    beam.addColorStop(0.00,`rgba(255,255,255,${.30*power})`);
    beam.addColorStop(0.10,`rgba(255,255,255,${.27*power})`);
    beam.addColorStop(0.28,`rgba(255,255,255,${.20*power})`);
    beam.addColorStop(0.50,`rgba(255,255,255,${.125*power})`);
    beam.addColorStop(0.70,`rgba(255,255,255,${.065*power})`);
    beam.addColorStop(0.86,`rgba(255,255,255,${.025*power})`);
    beam.addColorStop(1.00,'rgba(255,255,255,0)');
    d.fillStyle=beam;
    d.fillRect(0,0,W,H);

    // Soft continuous bloom at the source. It removes the hard triangular origin without
    // introducing another visible region because it fades radially to zero.
    const halo=d.createRadialGradient(origin.x,origin.y,0,origin.x,origin.y,105);
    halo.addColorStop(0,`rgba(255,255,255,${.22*power})`);
    halo.addColorStop(.34,`rgba(255,255,255,${.11*power})`);
    halo.addColorStop(1,'rgba(255,255,255,0)');
    d.fillStyle=halo;
    d.beginPath();d.arc(origin.x,origin.y,105,0,Math.PI*2);d.fill();

    // Very subtle lateral feather on the cone edges, still continuous. The blur is drawn
    // inside the occlusion clip, so it cannot illuminate through buildings.
    d.save();
    d.translate(origin.x,origin.y);
    d.rotate(screenAngle);
    const span=Math.max(110,maxDist*Math.tan(halfAngle));
    const side=d.createLinearGradient(0,-span,0,span);
    side.addColorStop(0,'rgba(255,255,255,0)');
    side.addColorStop(.16,`rgba(255,255,255,${.025*power})`);
    side.addColorStop(.50,`rgba(255,255,255,${.055*power})`);
    side.addColorStop(.84,`rgba(255,255,255,${.025*power})`);
    side.addColorStop(1,'rgba(255,255,255,0)');
    d.fillStyle=side;
    d.fillRect(0,-span,maxDist,span*2);
    d.restore();

    d.restore();
  }

  drawNightMask=function(g){
    if(window.NightHeistLighting!=='night'||g.env.propMode!=='city')return baseNightMask(g);

    const d=darknessCtx,env=g.env;
    d.setTransform(DPR,0,0,DPR,0,0);
    d.clearRect(0,0,W,H);
    d.globalCompositeOperation='source-over';
    d.fillStyle=`rgba(0,2,7,${.90+env.fog*.18})`;
    d.fillRect(0,0,W,H);
    d.globalCompositeOperation='destination-out';

    const rects=buildingRects(g);
    // Extra-wide urban headlights with a single continuous fade.
    occludedCone(d,g,g.player,580*env.visibility,.92,1,rects,91);
    for(const c of g.cops){
      if(Math.abs(c.y-g.player.y)<950)occludedCone(d,g,c,380*env.visibility,.66,.64,rects,49);
    }
    for(const t of g.traffic){
      if(Math.abs(t.y-g.player.y)<800)occludedCone(d,g,t,270*env.visibility,.50,.32,rects,29);
    }

    d.globalAlpha=1;
    d.globalCompositeOperation='source-over';
    ctx.drawImage(darknessCanvas,0,0,W,H);
    drawEmergencyGlow(g);
  };
})();
