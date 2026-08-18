const keys=new Set();
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.code==='KeyP' && (state==='playing'||state==='paused')) togglePause();
  if(e.code==='KeyR' && state==='result') startGame();
});
addEventListener('keyup',e=>keys.delete(e.code));

ui.start.addEventListener('click',startGame);
ui.retry.addEventListener('click',startGame);
ui.menuButton.addEventListener('click',showMenu);
ui.pauseButton.addEventListener('click',togglePause);
ui.resumeButton.addEventListener('click',togglePause);

function startGame(){
  audio.init(); audio.uiClick();
  game=new Game(ENVIRONMENTS[selectedEnv]); state='playing'; last=performance.now();
  ui.menu.classList.add('hidden'); ui.result.classList.add('hidden'); ui.pausePanel.classList.add('hidden'); ui.hud.classList.remove('hidden');
  toast(`${ENVIRONMENTS[selectedEnv].name.toUpperCase()} · ${ENVIRONMENTS[selectedEnv].difficulty}`);
}
function showMenu(){
  state='menu'; game=null; ui.result.classList.add('hidden'); ui.hud.classList.add('hidden'); ui.pausePanel.classList.add('hidden'); ui.menu.classList.remove('hidden');
}
function togglePause(){
  if(state==='playing'){state='paused';ui.pausePanel.classList.remove('hidden');}
  else if(state==='paused'){state='playing';ui.pausePanel.classList.add('hidden');last=performance.now();}
}
let toastTimer=0;
function toast(text){ clearTimeout(toastTimer); ui.toast.textContent=text; ui.toast.classList.remove('hidden'); toastTimer=setTimeout(()=>ui.toast.classList.add('hidden'),1800); }

function worldToScreen(x,y,camera=game?.camera){
  if(!camera)return{x:W/2+x,y:H/2+y};
  return {x:(x-camera.x)+W/2, y:(y-camera.y)+H*.58};
}

function render(){
  if(!game){ renderMenuBackdrop(); return; }
  const g=game, env=g.env;
  ctx.save();
  ctx.fillStyle=env.ground; ctx.fillRect(0,0,W,H);
  const shakeX=(Math.random()-.5)*g.camera.shake,shakeY=(Math.random()-.5)*g.camera.shake;
  ctx.translate(shakeX,shakeY);
  drawGroundTexture(g);
  drawProps(g);
  drawRoads(g);
  drawParticles(g,false);
  drawTraffic(g);
  drawCops(g);
  drawPlayer(g);
  drawParticles(g,true);
  ctx.restore();
  drawNightMask(g);
  drawWeather(g);
  drawSpeedFX(g);
}

function renderMenuBackdrop(){
  const env=ENVIRONMENTS[selectedEnv];
  ctx.fillStyle=env.ground;ctx.fillRect(0,0,W,H);
  const t=performance.now()*.00005;
  ctx.save();ctx.translate(W*.5,H*.58);ctx.rotate(-.12);
  for(let i=-4;i<5;i++){
    const x=i*190+Math.sin(t*9+i)*20;
    ctx.fillStyle=i%2?'#111820':'#16191d';ctx.fillRect(x-72,-H,144,H*2);
    ctx.strokeStyle='rgba(255,255,255,.08)';ctx.setLineDash([20,34]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x, -H);ctx.lineTo(x,H);ctx.stroke();
  }
  ctx.restore();
  const grd=ctx.createRadialGradient(W*.55,H*.4,0,W*.55,H*.4,Math.max(W,H)*.7);
  grd.addColorStop(0,`rgba(${env.skyGlow.join(',')},.09)`);grd.addColorStop(1,'rgba(0,0,0,.92)');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
}

function drawGroundTexture(g){
  const env=g.env, cam=g.camera;
  const step=95;
  ctx.lineWidth=1;
  for(let gx=Math.floor((cam.x-W/2)/step)*step;gx<cam.x+W/2+step;gx+=step){
    const s=worldToScreen(gx,0); ctx.strokeStyle='rgba(255,255,255,.012)';ctx.beginPath();ctx.moveTo(s.x,0);ctx.lineTo(s.x,H);ctx.stroke();
  }
  if(env.propMode==='desert'){
    for(let i=0;i<45;i++){const seed=i+Math.floor(-cam.y/400)*47;const x=randRange(seed,-W*.6,W*.6)+W*.5;const y=(hash(seed*3)*H+performance.now()*.006)%H;ctx.fillStyle='rgba(229,159,99,.08)';ctx.fillRect(x,y,30+hash(seed)*70,1);}
  }
}

function drawRoads(g){
  const env=g.env, near=g.road.nearbyPaths(g.player.y,1200);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const p of near){
    const pts=p.points.map(q=>worldToScreen(q.x,q.y));
    strokePath(pts,env.shoulder,p.width+18);
    strokePath(pts,env.road,p.width);
    ctx.save();ctx.globalAlpha=.35;strokePath(pts,'rgba(255,255,255,.06)',p.width-14);ctx.restore();
    ctx.save();ctx.setLineDash([26,34]);ctx.lineDashOffset=(performance.now()*.01)%60;strokePath(pts,env.lane,2);ctx.restore();
    if(env.propMode==='city'){
      ctx.save();ctx.globalAlpha=.14;ctx.setLineDash([3,8]);strokePath(pts,env.accent,1);ctx.restore();
    }
  }
}
function strokePath(pts,color,width){ ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke(); }
