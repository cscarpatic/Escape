(() => {
  const viewRotation = () => game && state !== 'menu' ? (-Math.PI / 2 - game.player.angle) : 0;
  window.viewRotation = viewRotation;
  window.viewVehicleScreenAngle = angle => angle + Math.PI / 2 + viewRotation();

  worldToScreen = function (x, y, camera = game?.camera) {
    if (!camera || !game || state === 'menu') return { x:W/2 + x, y:H/2 + y };
    const dx = x - camera.x, dy = y - camera.y;
    const r = viewRotation(), c = Math.cos(r), s = Math.sin(r);
    return {
      x: W / 2 + dx * c - dy * s,
      y: H * .58 + dx * s + dy * c,
    };
  };

  drawGroundTexture = function (g) {
    const cam = g.camera, step = 180, span = 1700;
    const x0 = Math.floor((cam.x - span) / step) * step;
    const x1 = cam.x + span;
    const y0 = Math.floor((cam.y - span) / step) * step;
    const y1 = cam.y + span;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.014)';
    ctx.lineWidth = 1;
    for (let x=x0; x<=x1; x+=step) {
      const a=worldToScreen(x,y0), b=worldToScreen(x,y1);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    for (let y=y0; y<=y1; y+=step) {
      const a=worldToScreen(x0,y), b=worldToScreen(x1,y);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.restore();
  };

  function drawBlockPolygon(b) {
    const pts=[
      worldToScreen(b.left,b.top), worldToScreen(b.right,b.top),
      worldToScreen(b.right,b.bottom), worldToScreen(b.left,b.bottom),
    ];
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.closePath();
    ctx.fillStyle='rgba(5,8,11,.97)';ctx.fill();
    ctx.strokeStyle='rgba(215,226,233,.30)';ctx.lineWidth=4;ctx.stroke();
  }

  drawProps = function (g) {
    if (g.env.propMode === 'city') {
      ctx.save();
      for (const b of g.road.cityBlocks || []) {
        if (b.bottom < g.player.y-1400 || b.top > g.player.y+1400) continue;
        drawBlockPolygon(b);
      }
      ctx.restore();
    }

    for (const p of g.road.props) {
      if (Math.abs(p.y-g.player.y)>1100) continue;
      const s=worldToScreen(p.x,p.y), h=hash(p.seed*7);
      if(s.x<-180||s.x>W+180||s.y<-180||s.y>H+180)continue;
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(viewRotation());
      if(p.mode==='city'){
        const bw=45+h*45,bh=70+hash(p.seed*11)*110;
        ctx.fillStyle=`rgba(${25+Math.floor(h*20)},${31+Math.floor(h*20)},${40+Math.floor(h*24)},.98)`;
        ctx.fillRect(-bw/2,-bh/2,bw,bh);
        ctx.strokeStyle='rgba(150,170,184,.20)';ctx.strokeRect(-bw/2,-bh/2,bw,bh);
        for(let wy=-bh/2+12;wy<bh/2-8;wy+=16){for(let wx=-bw/2+9;wx<bw/2-6;wx+=14){if(hash(p.seed+wx*3+wy*5)>.7){ctx.fillStyle=hash(p.seed+wx)>.55?'rgba(92,225,255,.42)':'rgba(255,196,89,.40)';ctx.fillRect(wx,wy,4,6);}}}
      } else if(p.mode==='industrial'){
        const w=62+60*h,hh=22+18*hash(p.seed*4);ctx.fillStyle=hash(p.seed*9)>.5?'#572d27':'#243c48';ctx.fillRect(-w/2,-hh/2,w,hh);ctx.strokeStyle='rgba(255,255,255,.10)';ctx.strokeRect(-w/2,-hh/2,w,hh);
      } else if(p.mode==='alpine'){
        ctx.fillStyle='#0e1715';ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(-22,18);ctx.lineTo(22,18);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(0,-28);ctx.lineTo(-28,34);ctx.lineTo(28,34);ctx.closePath();ctx.fill();
      } else {
        ctx.fillStyle='rgba(66,46,35,.78)';ctx.beginPath();ctx.ellipse(0,0,18+30*h,8+12*hash(p.seed*8),hash(p.seed)*3,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  };

  function signalState(node) {
    const m=/^C(\d+)_(\d+)$/.exec(node?.id||'');
    const row=m?+m[1]:0,col=m?+m[2]:0;
    const phase=(performance.now()/1000+(row+col)*.63)%6;
    return phase<2.7?'green':phase<3.2?'amber':'red';
  }

  function drawSignals(g) {
    if (g.env.propMode!=='city' || !g.road.trafficLights) return;
    for(const n of g.road.trafficLights){
      if(Math.abs(n.y-g.player.y)>1200)continue;
      const s=worldToScreen(n.x,n.y);if(s.x<-60||s.x>W+60||s.y<-60||s.y>H+60)continue;
      const st=signalState(n), col=st==='green'?'#50ff99':st==='amber'?'#ffc24a':'#ff4050';
      ctx.save();ctx.shadowBlur=18;ctx.shadowColor=col;ctx.fillStyle=col;ctx.beginPath();ctx.arc(s.x,s.y,5,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.strokeStyle='rgba(235,240,242,.65)';ctx.lineWidth=1;ctx.strokeRect(s.x-7,s.y-12,14,24);ctx.restore();
    }
  }

  drawRoads = function (g) {
    const near=g.road.nearbyPaths(g.player.y,1500);
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const p of near){
      const pts=p.points.map(q=>worldToScreen(q.x,q.y));
      const city=g.env.propMode==='city';
      const shoulder = p.kind==='highway' ? (city?'#5c6268':'#313940') : city ? '#687077' : g.env.shoulder;
      const road = p.kind==='highway' ? (city?'#252f38':'#171e24') : city ? '#26333d' : g.env.road;
      const edgeExtra=p.kind==='highway'?24:18;
      strokePath(pts,shoulder,p.width+edgeExtra);
      strokePath(pts,road,p.width);
      ctx.save();ctx.globalAlpha=city?.24:.16;strokePath(pts,'rgba(160,190,205,.55)',Math.max(8,p.width-18));ctx.restore();
      ctx.save();ctx.setLineDash(p.kind==='highway'?[38,28]:[30,30]);ctx.lineDashOffset=(performance.now()*.008)%68;strokePath(pts,city?'rgba(235,239,241,.90)':g.env.lane,p.kind==='highway'?3:2.4);ctx.restore();
      if(city){
        ctx.save();ctx.globalAlpha=.72;strokePath(pts,'rgba(225,231,235,.62)',2);ctx.restore();
      }
    }
    drawSignals(g);
  };

  drawVehicle = function (car, palette, police=false) {
    const s=worldToScreen(car.x,car.y);if(s.x<-120||s.x>W+120||s.y<-120||s.y>H+120)return;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(window.viewVehicleScreenAngle(car.angle));
    ctx.fillStyle='rgba(0,0,0,.50)';ctx.beginPath();ctx.ellipse(3,7,car.width*.72,car.length*.58,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=palette.body;roundRect(ctx,-car.width/2,-car.length/2,car.width,car.length,6);ctx.fill();
    ctx.fillStyle=palette.glass;roundRect(ctx,-car.width*.36,-car.length*.23,car.width*.72,car.length*.22,3);ctx.fill();
    ctx.fillStyle=palette.glass;roundRect(ctx,-car.width*.36,car.length*.04,car.width*.72,car.length*.17,3);ctx.fill();
    ctx.fillStyle='#eafcff';ctx.fillRect(-car.width*.34,-car.length*.5-1,6,3);ctx.fillRect(car.width*.34-6,-car.length*.5-1,6,3);
    ctx.fillStyle='#ff364f';ctx.fillRect(-car.width*.34,car.length*.5-2,6,3);ctx.fillRect(car.width*.34-6,car.length*.5-2,6,3);
    if(police){
      const flash=Math.sin(performance.now()*.017+car.flash)>0;ctx.fillStyle=flash?'#2ea6ff':'#ff3556';ctx.fillRect(-9,-2,18,5);ctx.shadowBlur=18;ctx.shadowColor=ctx.fillStyle;ctx.globalAlpha=.82;ctx.fillRect(-9,-2,18,5);ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle='rgba(255,255,255,.82)';ctx.fillRect(-2,-car.length*.36,4,car.length*.58);
    }
    ctx.restore();
  };

  addLight = function (d,car,length,width,power) {
    const s=worldToScreen(car.x,car.y),a=car.angle+viewRotation(),fx=Math.cos(a),fy=Math.sin(a),sx=-fy,sy=fx;
    for(let layer=0;layer<6;layer++){
      const k=layer/5,L=length*(1-k*.08),WW=width*(1-k*.5);d.globalAlpha=power*(.05+.1*(1-k));d.beginPath();d.moveTo(s.x+sx*9,s.y+sy*9);d.lineTo(s.x+fx*L+sx*WW,s.y+fy*L+sy*WW);d.lineTo(s.x+fx*L-sx*WW,s.y+fy*L-sy*WW);d.closePath();d.fillStyle='#fff';d.fill();
    }
    const grd=d.createRadialGradient(s.x,s.y,2,s.x,s.y,65);grd.addColorStop(0,`rgba(255,255,255,${.5*power})`);grd.addColorStop(1,'rgba(255,255,255,0)');d.globalAlpha=1;d.fillStyle=grd;d.beginPath();d.arc(s.x,s.y,65,0,Math.PI*2);d.fill();
  };
})();
