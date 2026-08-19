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

  // The visibility polygon only clips the beam against buildings. Illumination is one
  // single two-stop gradient: no bands, no stacked halos and no secondary light regions.
  function occludedCone(d,g,car,maxDist,halfAngle,power,rects,rays=101){
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
      // Rounded cone end: side rays fade sooner geometrically rather than forming
      // a horizontal cutoff line at the maximum range.
      const naturalTip=.68+.32*Math.pow(centered,.62);
      const limit=maxDist*naturalTip;
      const hit=castDistance(ox,oy,ang,limit,local);
      edge.push(worldToScreen(ox+Math.cos(ang)*hit,oy+Math.sin(ang)*hit));
    }

    const tip=worldToScreen(ox+fx*maxDist,oy+fy*maxDist);

    d.save();
    d.beginPath();
    d.moveTo(origin.x,origin.y);
    for(const p of edge)d.lineTo(p.x,p.y);
    d.closePath();
    d.clip();

    // Exactly two stops. Canvas interpolates every pixel between them continuously.
    const beam=d.createLinearGradient(origin.x,origin.y,tip.x,tip.y);
    beam.addColorStop(0,`rgba(255,255,255,${.36*power})`);
    beam.addColorStop(1,'rgba(255,255,255,0)');
    d.globalAlpha=1;
    d.fillStyle=beam;
    d.fillRect(0,0,W,H);
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
    // Wide beams; all of them use the same single-gradient model.
    occludedCone(d,g,g.player,600*env.visibility,.96,1,rects,121);
    for(const c of g.cops){
      if(Math.abs(c.y-g.player.y)<950)occludedCone(d,g,c,390*env.visibility,.68,.62,rects,61);
    }
    for(const t of g.traffic){
      if(Math.abs(t.y-g.player.y)<800)occludedCone(d,g,t,275*env.visibility,.52,.30,rects,41);
    }

    d.globalAlpha=1;
    d.globalCompositeOperation='source-over';
    ctx.drawImage(darknessCanvas,0,0,W,H);
    drawEmergencyGlow(g);
  };
})();
