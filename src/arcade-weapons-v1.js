(() => {
  const style=document.createElement('style');
  style.textContent=`
    .weapon-stack{position:fixed;left:max(14px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);z-index:35;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
    .weapon-btn{width:82px;min-height:58px;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:linear-gradient(180deg,rgba(18,28,36,.92),rgba(6,10,15,.92));color:#eefaff;font:800 10px/1.1 system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 8px 28px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.10);backdrop-filter:blur(10px);touch-action:manipulation}
    .weapon-btn strong{display:block;font-size:21px;margin-bottom:4px}.weapon-btn small{display:block;opacity:.65;font-size:8px;margin-top:4px}.weapon-btn.ready{box-shadow:0 0 0 1px rgba(135,238,255,.25),0 0 24px rgba(92,225,255,.13),0 8px 28px rgba(0,0,0,.42)}
    .weapon-btn.cooldown{opacity:.45;filter:saturate(.55)}
    body:not(.night-mode) .weapon-btn{background:linear-gradient(180deg,rgba(30,42,48,.88),rgba(10,18,22,.88))}
    @media(max-width:760px){.weapon-stack{top:43%;left:max(8px,env(safe-area-inset-left))}.weapon-btn{width:68px;min-height:52px;font-size:8px}.weapon-btn strong{font-size:18px}}
  `;
  document.head.appendChild(style);

  const controls=document.createElement('div');controls.className='weapon-stack hidden';controls.innerHTML=`
    <button class="weapon-btn ready" data-weapon="missile" aria-label="Spara missile"><strong>➤</strong>MISSILE<small>Q</small></button>
    <button class="weapon-btn ready" data-weapon="spikes" aria-label="Rilascia chiodi"><strong>✦</strong>CHI0DI<small>E</small></button>`;
  document.body.appendChild(controls);

  const fx={missiles:[],spikes:[],bursts:[],flash:0};
  const cooldown={missile:0,spikes:0};
  const CD={missile:2.2,spikes:4.2};

  function ensureVisible(){controls.classList.toggle('hidden',state!=='playing');}
  function fireMissile(){
    if(!game||state!=='playing'||cooldown.missile>0)return;
    const p=game.player,fxd=Math.cos(p.angle),fyd=Math.sin(p.angle);
    fx.missiles.push({x:p.x+fxd*31,y:p.y+fyd*31,angle:p.angle,speed:430,life:1.65,trail:[]});
    cooldown.missile=CD.missile;game.camera.shake=Math.max(game.camera.shake,5);fx.flash=.08;
    audio.burst?.(160,.08,'sawtooth');navigator.vibrate?.(18);
  }
  function dropSpikes(){
    if(!game||state!=='playing'||cooldown.spikes>0)return;
    const p=game.player,fxd=Math.cos(p.angle),fyd=Math.sin(p.angle);
    fx.spikes.push({x:p.x-fxd*34,y:p.y-fyd*34,angle:p.angle,life:8,armed:.18});
    cooldown.spikes=CD.spikes;game.camera.shake=Math.max(game.camera.shake,3);navigator.vibrate?.([10,18,10]);
  }
  function trigger(kind){kind==='missile'?fireMissile():dropSpikes();}
  controls.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-weapon]');if(!b)return;e.preventDefault();trigger(b.dataset.weapon);});
  addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='KeyQ')fireMissile();if(e.code==='KeyE')dropSpikes();});

  const baseUpdateCops=Game.prototype.updateCops;
  Game.prototype.updateCops=function(dt){
    const frozen=(this.cops||[]).filter(c=>c._weaponDisabled>0).map(c=>({c,x:c.x,y:c.y,angle:c.angle}));
    baseUpdateCops.call(this,dt);
    for(const f of frozen){f.c.x=f.x;f.c.y=f.y;f.c.angle=f.angle;f.c.speed=0;f.c._weaponDisabled=Math.max(0,f.c._weaponDisabled-dt);}
  };

  const baseUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    baseUpdate.call(this,dt);
    if(this.finished)return;
    cooldown.missile=Math.max(0,cooldown.missile-dt);cooldown.spikes=Math.max(0,cooldown.spikes-dt);
    updateWeapons(this,Math.min(dt,.033));updateButtons();ensureVisible();
  };

  function burst(g,x,y,type='impact'){
    fx.bursts.push({x,y,life:.48,max:.48,type});
    g.camera.shake=Math.max(g.camera.shake,type==='impact'?18:11);fx.flash=Math.max(fx.flash,type==='impact'?.22:.12);
    for(let i=0;i<(type==='impact'?26:14);i++)g.spawnSparks?.(x,y,1);
  }
  function updateWeapons(g,dt){
    for(let i=fx.missiles.length-1;i>=0;i--){
      const m=fx.missiles[i];m.life-=dt;m.trail.push({x:m.x,y:m.y,life:.22});if(m.trail.length>12)m.trail.shift();
      m.x+=Math.cos(m.angle)*m.speed*dt;m.y+=Math.sin(m.angle)*m.speed*dt;
      let hit=null,best=Infinity;
      for(const c of g.cops||[]){const d=Math.hypot(c.x-m.x,c.y-m.y);if(d<34&&d<best){hit=c;best=d;}}
      if(hit){hit._weaponDisabled=2.7;hit.speed=0;burst(g,m.x,m.y,'impact');fx.missiles.splice(i,1);audio.hit?.();continue;}
      if(m.life<=0)fx.missiles.splice(i,1);
    }
    for(const s of fx.spikes){s.life-=dt;s.armed=Math.max(0,s.armed-dt);if(s.armed<=0){
      for(const c of g.cops||[]){if(c._spikeStamp===s)continue;if(Math.hypot(c.x-s.x,c.y-s.y)<43){c._spikeStamp=s;c._weaponDisabled=Math.max(c._weaponDisabled||0,3.6);burst(g,s.x,s.y,'spikes');}}
    }}
    fx.spikes=fx.spikes.filter(s=>s.life>0);for(const b of fx.bursts)b.life-=dt;fx.bursts=fx.bursts.filter(b=>b.life>0);fx.flash=Math.max(0,fx.flash-dt);
  }
  function updateButtons(){for(const b of controls.querySelectorAll('[data-weapon]')){const k=b.dataset.weapon,on=cooldown[k]<=0;b.classList.toggle('ready',on);b.classList.toggle('cooldown',!on);b.querySelector('small').textContent=on?(k==='missile'?'Q':'E'):`${cooldown[k].toFixed(1)}s`;}}

  function screenAngle(a){return window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(a):a+Math.PI/2;}
  function drawPoliceBeacons(g){
    const t=performance.now()*.012;
    for(const c of g.cops||[]){
      const s=worldToScreen(c.x,c.y);if(s.x<-120||s.x>W+120||s.y<-120||s.y>H+120)continue;
      const a=screenAngle(c.angle),pulse=.55+.45*Math.sin(t+c.flash),swap=Math.sin(t*1.35+c.flash)>0;
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(a);ctx.globalCompositeOperation='screen';
      const cols=swap?['#ff2448','#2da8ff']:['#2da8ff','#ff2448'];
      for(let i=0;i<2;i++){const x=i?7:-7;ctx.fillStyle=cols[i];ctx.shadowColor=cols[i];ctx.shadowBlur=20+12*pulse;ctx.globalAlpha=.88;ctx.fillRect(x-5,-3,10,6);ctx.globalAlpha=.16+.16*pulse;ctx.beginPath();ctx.arc(x,0,30+14*pulse,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
  }
  function drawMissile(m){
    for(let i=0;i<m.trail.length;i++){const q=m.trail[i],s=worldToScreen(q.x,q.y),a=(i+1)/m.trail.length;ctx.fillStyle=`rgba(255,176,68,${a*.34})`;ctx.beginPath();ctx.arc(s.x,s.y,2+5*a,0,Math.PI*2);ctx.fill();}
    const s=worldToScreen(m.x,m.y);ctx.save();ctx.translate(s.x,s.y);ctx.rotate(screenAngle(m.angle)-Math.PI/2);ctx.globalCompositeOperation='screen';ctx.shadowBlur=18;ctx.shadowColor='#ff9b35';ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-8,-4);ctx.lineTo(-5,0);ctx.lineTo(-8,4);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawSpike(s){const p=worldToScreen(s.x,s.y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(screenAngle(s.angle));ctx.strokeStyle='rgba(210,230,236,.9)';ctx.lineWidth=2;ctx.shadowBlur=7;ctx.shadowColor='#9eeeff';for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(i*7,-14);ctx.lineTo(i*7+4,0);ctx.lineTo(i*7,14);ctx.stroke();}ctx.restore();}
  function drawBursts(){for(const b of fx.bursts){const p=worldToScreen(b.x,b.y),k=1-b.life/b.max,r=18+k*(b.type==='impact'?100:65);ctx.save();ctx.globalCompositeOperation='screen';ctx.lineWidth=5*(1-k)+1;ctx.strokeStyle=`rgba(255,190,70,${(1-k)*.8})`;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=`rgba(92,225,255,${(1-k)*.45})`;ctx.beginPath();ctx.arc(p.x,p.y,r*.72,0,Math.PI*2);ctx.stroke();ctx.restore();}}
  function drawFX(g){drawPoliceBeacons(g);for(const s of fx.spikes)drawSpike(s);for(const m of fx.missiles)drawMissile(m);drawBursts();if(fx.flash>0){ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=`rgba(255,220,160,${fx.flash*.55})`;ctx.fillRect(0,0,W,H);ctx.restore();}}

  const baseRender=render;
  render=function(){baseRender();if(game&&state!=='menu')drawFX(game);ensureVisible();};
  const baseShowMenu=showMenu;showMenu=function(){controls.classList.add('hidden');fx.missiles.length=fx.spikes.length=fx.bursts.length=0;baseShowMenu();};
})();
