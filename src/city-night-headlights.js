(() => {
  const baseNightMask = drawNightMask;

  function buildingRects(g) {
    const out=[];
    for(const p of g.road.props||[]){
      if(p.mode!=='city'||Math.abs(p.y-g.player.y)>1250)continue;
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
      const d=rayRectDistance(ox,oy,dx,dy,r,best);
      if(d<best)best=Math.max(8,d-3);
    }
    return best;
  }

  function nearbyRects(car,rects,maxDist){
    const pad=maxDist+130;
    return rects.filter(r=>!(r.right<car.x-pad||r.left>car.x+pad||r.bottom<car.y-pad||r.top>car.y+pad));
  }

  function occludedCone(d,g,car,maxDist,halfAngle,power,rects,rays=31){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle);
    const ox=car.x+fx*Math.min(20,car.length*.38),oy=car.y+fy*Math.min(20,car.length*.38);
    const local=nearbyRects(car,rects,maxDist);
    const layers=[
      {range:1,angle:1,alpha:.28},
      {range:.94,angle:.82,alpha:.23},
      {range:.86,angle:.60,alpha:.22},
      {range:.72,angle:.38,alpha:.20},
    ];
    const origin=worldToScreen(ox,oy);
    for(const layer of layers){
      const aSpan=halfAngle*layer.angle;
      d.beginPath();d.moveTo(origin.x,origin.y);
      for(let i=0;i<=rays;i++){
        const f=i/rays,ang=car.angle-aSpan+f*aSpan*2;
        const limit=maxDist*layer.range;
        const hit=castDistance(ox,oy,ang,limit,local);
        const wx=ox+Math.cos(ang)*hit,wy=oy+Math.sin(ang)*hit;
        const s=worldToScreen(wx,wy);
        d.lineTo(s.x,s.y);
      }
      d.closePath();
      d.globalAlpha=power*layer.alpha;d.fillStyle='#fff';d.fill();
    }
  }

  drawNightMask=function(g){
    if(window.NightHeistLighting!=='night'||g.env.propMode!=='city')return baseNightMask(g);

    const d=darknessCtx,env=g.env;
    d.setTransform(DPR,0,0,DPR,0,0);d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
    d.fillStyle=`rgba(0,2,7,${.90+env.fog*.18})`;d.fillRect(0,0,W,H);
    d.globalCompositeOperation='destination-out';

    const rects=buildingRects(g);
    // Wide urban beams: visibility opens up on avenues, but façades cast real shadows.
    occludedCone(d,g,g.player,430*env.visibility,.60,1,rects,39);
    for(const c of g.cops){
      if(Math.abs(c.y-g.player.y)<900)occludedCone(d,g,c,315*env.visibility,.50,.66,rects,19);
    }
    for(const t of g.traffic){
      if(Math.abs(t.y-g.player.y)<760)occludedCone(d,g,t,225*env.visibility,.40,.34,rects,13);
    }
    d.globalAlpha=1;d.globalCompositeOperation='source-over';
    ctx.drawImage(darknessCanvas,0,0,W,H);
    drawEmergencyGlow(g);
  };
})();
