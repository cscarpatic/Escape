(() => {
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const RANGE_METERS = 800;
  const RANGE_WORLD = RANGE_METERS / METERS_PER_UNIT;

  const radar = document.createElement('canvas');
  radar.id = 'policeRadar';
  radar.className = 'police-radar hidden';
  radar.setAttribute('aria-label','Minimappa radar pattuglie');
  document.body.appendChild(radar);

  const label = document.createElement('div');
  label.className = 'police-radar-label hidden';
  label.textContent = `RADAR POLIZIA · ${RANGE_METERS} m`;
  document.body.appendChild(label);

  const rctx = radar.getContext('2d');

  function sizeRadar() {
    const rect = radar.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width*dpr));
    const h = Math.max(1, Math.round(rect.height*dpr));
    if (radar.width !== w || radar.height !== h) { radar.width=w; radar.height=h; }
    rctx.setTransform(dpr,0,0,dpr,0,0);
    return {w:rect.width,h:rect.height};
  }

  function localPoint(g,x,y,scale,cx,cy) {
    const dx=x-g.player.x,dy=y-g.player.y,a=g.player.angle;
    const right=dx*(-Math.sin(a))+dy*Math.cos(a);
    const forward=dx*Math.cos(a)+dy*Math.sin(a);
    return {x:cx+right*scale,y:cy-forward*scale};
  }

  function drawRoadMap(g,cx,cy,radius,scale) {
    rctx.save();
    rctx.beginPath();rctx.arc(cx,cy,radius-3,0,Math.PI*2);rctx.clip();
    rctx.lineCap='round';rctx.lineJoin='round';
    const nearby=g.road.nearbyPaths ? g.road.nearbyPaths(g.player.y,RANGE_WORLD*1.15) : (g.road.paths||[]);
    for(const path of nearby){
      if(!path.points?.length)continue;
      const near=path.points.some(p=>Math.hypot(p.x-g.player.x,p.y-g.player.y)<RANGE_WORLD*1.35);
      if(!near)continue;
      rctx.beginPath();
      let started=false;
      for(const p of path.points){
        const q=localPoint(g,p.x,p.y,scale,cx,cy);
        if(!started){rctx.moveTo(q.x,q.y);started=true;}else rctx.lineTo(q.x,q.y);
      }
      rctx.strokeStyle=path.feature==='roundabout'?'rgba(207,228,234,.34)':'rgba(195,214,221,.22)';
      rctx.lineWidth=path.kind==='highway'?3.2:path.kind==='state'?2.5:1.7;
      rctx.stroke();
    }
    rctx.restore();
  }

  function drawCopDot(g,cop,index,cx,cy,radius,scale) {
    const dx=cop.x-g.player.x,dy=cop.y-g.player.y;
    const worldDist=Math.hypot(dx,dy);
    let q=localPoint(g,cop.x,cop.y,scale,cx,cy);
    const sx=q.x-cx,sy=q.y-cy,screenDist=Math.hypot(sx,sy);
    const edge=radius-10;
    const outside=screenDist>edge;
    if(outside && screenDist>.001){q={x:cx+sx/screenDist*edge,y:cy+sy/screenDist*edge};}
    const flash=Math.sin(performance.now()*.018+(cop.flash||index))>0;
    const color=flash?'#35aaff':'#ff3556';
    rctx.save();
    rctx.shadowBlur=10;rctx.shadowColor=color;rctx.fillStyle=color;
    rctx.beginPath();rctx.arc(q.x,q.y,outside?4.8:5.6,0,Math.PI*2);rctx.fill();
    rctx.shadowBlur=0;
    if(outside){rctx.strokeStyle='rgba(255,255,255,.72)';rctx.lineWidth=1;rctx.beginPath();rctx.arc(q.x,q.y,7.5,0,Math.PI*2);rctx.stroke();}
    rctx.restore();
  }

  function drawRadar(g) {
    const visible=g && (state==='playing'||state==='paused');
    radar.classList.toggle('hidden',!visible);label.classList.toggle('hidden',!visible);
    if(!visible)return;
    const {w,h}=sizeRadar(),cx=w/2,cy=h/2,radius=Math.min(w,h)/2-4,scale=(radius-11)/RANGE_WORLD;
    rctx.clearRect(0,0,w,h);
    const grd=rctx.createRadialGradient(cx,cy,4,cx,cy,radius);
    grd.addColorStop(0,'rgba(18,34,42,.78)');grd.addColorStop(1,'rgba(4,9,14,.93)');
    rctx.fillStyle=grd;rctx.beginPath();rctx.arc(cx,cy,radius,0,Math.PI*2);rctx.fill();
    rctx.strokeStyle='rgba(117,235,244,.18)';rctx.lineWidth=1;
    for(const f of [.34,.67,1]){rctx.beginPath();rctx.arc(cx,cy,radius*f,0,Math.PI*2);rctx.stroke();}
    rctx.beginPath();rctx.moveTo(cx,cy-radius+6);rctx.lineTo(cx,cy+radius-6);rctx.moveTo(cx-radius+6,cy);rctx.lineTo(cx+radius-6,cy);rctx.stroke();
    drawRoadMap(g,cx,cy,radius,scale);
    (g.cops||[]).forEach((c,i)=>drawCopDot(g,c,i,cx,cy,radius,scale));
    rctx.save();rctx.translate(cx,cy);rctx.fillStyle='#6ff6ff';rctx.shadowBlur=10;rctx.shadowColor='#6ff6ff';
    rctx.beginPath();rctx.moveTo(0,-8);rctx.lineTo(6,7);rctx.lineTo(0,4);rctx.lineTo(-6,7);rctx.closePath();rctx.fill();rctx.restore();
  }

  const baseRender=render;
  render=function(){baseRender();drawRadar(game);};
  window.addEventListener('resize',()=>{ if(!radar.classList.contains('hidden')) sizeRadar(); });
})();
