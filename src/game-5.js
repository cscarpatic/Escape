function drawProps(g){
  const env=g.env;
  for(const p of g.road.props){
    if(Math.abs(p.y-g.player.y)>900)continue; const s=worldToScreen(p.x,p.y); const h=hash(p.seed*7);
    if(s.x<-120||s.x>W+120||s.y<-120||s.y>H+120)continue;
    ctx.save();ctx.translate(s.x,s.y);
    if(p.mode==='city'){
      const bw=45+h*45,bh=70+hash(p.seed*11)*110;ctx.fillStyle=`rgba(${18+Math.floor(h*18)},${23+Math.floor(h*20)},${31+Math.floor(h*22)},.95)`;ctx.fillRect(-bw/2,-bh/2,bw,bh);
      for(let wy=-bh/2+12;wy<bh/2-8;wy+=16){for(let wx=-bw/2+9;wx<bw/2-6;wx+=14){if(hash(p.seed+wx*3+wy*5)>.7){ctx.fillStyle=hash(p.seed+wx)>.55?'rgba(92,225,255,.36)':'rgba(255,196,89,.34)';ctx.fillRect(wx,wy,4,6);}}}
    } else if(p.mode==='industrial'){
      const w=62+60*h,hh=22+18*hash(p.seed*4);ctx.fillStyle=hash(p.seed*9)>.5?'#572d27':'#243c48';ctx.fillRect(-w/2,-hh/2,w,hh);ctx.strokeStyle='rgba(255,255,255,.08)';ctx.strokeRect(-w/2,-hh/2,w,hh);
    } else if(p.mode==='alpine'){
      ctx.fillStyle='#0e1715';ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(-22,18);ctx.lineTo(22,18);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(0,-28);ctx.lineTo(-28,34);ctx.lineTo(28,34);ctx.closePath();ctx.fill();
    } else {
      ctx.fillStyle='rgba(66,46,35,.75)';ctx.beginPath();ctx.ellipse(0,0,18+30*h,8+12*hash(p.seed*8),hash(p.seed)*3,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

function drawVehicle(car, palette, police=false){
  const s=worldToScreen(car.x,car.y); if(s.x<-100||s.x>W+100||s.y<-100||s.y>H+100)return;
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(car.angle+Math.PI/2);
  ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(3,7,car.width*.72,car.length*.58,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=palette.body; roundRect(ctx,-car.width/2,-car.length/2,car.width,car.length,6);ctx.fill();
  ctx.fillStyle=palette.glass;roundRect(ctx,-car.width*.36,-car.length*.23,car.width*.72,car.length*.22,3);ctx.fill();
  ctx.fillStyle=palette.glass;roundRect(ctx,-car.width*.36,car.length*.04,car.width*.72,car.length*.17,3);ctx.fill();
  ctx.fillStyle='#eafcff';ctx.fillRect(-car.width*.34,-car.length*.5-1,6,3);ctx.fillRect(car.width*.34-6,-car.length*.5-1,6,3);
  ctx.fillStyle='#ff364f';ctx.fillRect(-car.width*.34,car.length*.5-2,6,3);ctx.fillRect(car.width*.34-6,car.length*.5-2,6,3);
  if(police){
    const flash=Math.sin(performance.now()*.017+car.flash)>0;ctx.fillStyle=flash?'#2ea6ff':'#ff3556';ctx.fillRect(-9,-2,18,5);
    ctx.shadowBlur=18;ctx.shadowColor=ctx.fillStyle;ctx.globalAlpha=.75;ctx.fillRect(-9,-2,18,5);ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.fillStyle='rgba(255,255,255,.8)';ctx.fillRect(-2,-car.length*.36,4,car.length*.58);
  }
  ctx.restore();
}
function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function drawPlayer(g){ drawVehicle(g.player,{body:'#0d9eae',glass:'#07131a'}); const s=worldToScreen(g.player.x,g.player.y);ctx.save();ctx.translate(s.x,s.y);ctx.strokeStyle='rgba(126,248,255,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,31+Math.sin(performance.now()*.006)*2,0,Math.PI*2);ctx.stroke();ctx.restore(); }
function drawCops(g){ g.cops.forEach(c=>drawVehicle(c,{body:'#e8edf2',glass:'#101923'},true)); }
function drawTraffic(g){ g.traffic.forEach(t=>{ if(Math.abs(t.y-g.player.y)<950)drawVehicle(t,{body:t.color,glass:'#111a21'}); }); }

function drawParticles(g, glow){
  for(const p of g.particles){
    const isGlow=p.type==='spark';if(isGlow!==glow)continue; const s=worldToScreen(p.x,p.y);ctx.save();ctx.globalAlpha=clamp(p.life*2,0,1);
    if(p.type==='spark'){ctx.fillStyle='#ffd98c';ctx.shadowColor='#ff8b3e';ctx.shadowBlur=10;ctx.fillRect(s.x,s.y,p.size,p.size);}else{ctx.fillStyle=p.type==='dust'?'rgba(172,116,80,.24)':'rgba(190,210,222,.16)';ctx.beginPath();ctx.arc(s.x,s.y,p.size,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}

function drawNightMask(g){
  const d=darknessCtx,env=g.env;d.setTransform(DPR,0,0,DPR,0,0);d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
  d.fillStyle=`rgba(0,2,7,${.91+env.fog*.22})`;d.fillRect(0,0,W,H);
  d.globalCompositeOperation='destination-out';
  addLight(d,g.player,280*env.visibility,118,1);
  for(const c of g.cops){if(Math.abs(c.y-g.player.y)<800)addLight(d,c,220*env.visibility,92,.72);}
  for(const t of g.traffic){if(Math.abs(t.y-g.player.y)<680)addLight(d,t,155*env.visibility,64,.38);}
  d.globalCompositeOperation='source-over';
  ctx.drawImage(darknessCanvas,0,0,W,H);
  drawEmergencyGlow(g);
}
function addLight(d,car,length,width,power){
  const s=worldToScreen(car.x,car.y); const a=car.angle; const fx=Math.cos(a),fy=Math.sin(a); const sx=-fy,sy=fx;
  for(let layer=0;layer<6;layer++){
    const k=layer/5;const L=length*(1-k*.08),WW=width*(1-k*.5);d.globalAlpha=power*(.05+.1*(1-k));d.beginPath();d.moveTo(s.x+sx*9,s.y+sy*9);d.lineTo(s.x+fx*L+sx*WW,s.y+fy*L+sy*WW);d.lineTo(s.x+fx*L-sx*WW,s.y+fy*L-sy*WW);d.closePath();d.fillStyle='#fff';d.fill();
  }
  const grd=d.createRadialGradient(s.x,s.y,2,s.x,s.y,65);grd.addColorStop(0,`rgba(255,255,255,${.5*power})`);grd.addColorStop(1,'rgba(255,255,255,0)');d.globalAlpha=1;d.fillStyle=grd;d.beginPath();d.arc(s.x,s.y,65,0,Math.PI*2);d.fill();
}
function drawEmergencyGlow(g){
  for(const c of g.cops){
    if(Math.abs(c.y-g.player.y)>850)continue;const s=worldToScreen(c.x,c.y);const flash=Math.sin(performance.now()*.017+c.flash)>0;const color=flash?'46,166,255':'255,53,86';
    const grd=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,105);grd.addColorStop(0,`rgba(${color},.17)`);grd.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=grd;ctx.fillRect(s.x-105,s.y-105,210,210);
  }
}

function drawWeather(g){
  const env=g.env,t=performance.now();
  if(env.rain>0){
    ctx.save();ctx.strokeStyle=`rgba(180,220,245,${.08+.13*env.rain})`;ctx.lineWidth=1;const n=Math.floor(70*env.rain);
    for(let i=0;i<n;i++){const seed=i*47;const x=(hash(seed)*W+t*.18*(1+hash(seed+3)))%W;const y=(hash(seed+9)*H+t*.42*(1+hash(seed+11)))%H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+21);ctx.stroke();}
    ctx.restore();
  }
  if(env.fog>0){const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,`rgba(180,205,220,${env.fog*.22})`);grd.addColorStop(.5,'rgba(120,145,160,0)');grd.addColorStop(1,`rgba(90,110,120,${env.fog*.08})`);ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);}
}
function drawSpeedFX(g){
  const s=clamp((Math.abs(g.player.speed)-110)/80,0,1);if(s<=0)return;ctx.save();ctx.strokeStyle=`rgba(210,240,255,${s*.08})`;ctx.lineWidth=1;
  for(let i=0;i<22;i++){const a=hash(i*7)*Math.PI*2,r=120+hash(i*13)*Math.max(W,H)*.55,x=W/2+Math.cos(a)*r,y=H*.58+Math.sin(a)*r;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*26*s,y+Math.sin(a)*26*s);ctx.stroke();}
  ctx.restore();
}

function loop(now){
  const dt=(now-last)/1000;last=now;
  if(state==='playing'&&game)game.update(dt);
  render();
  raf=requestAnimationFrame(loop);
}
raf=requestAnimationFrame(loop);
