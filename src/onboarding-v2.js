(() => {
  const style=document.createElement('style');
  style.textContent=`
    .drive-mode-help{margin:8px 0 0;color:rgba(230,242,250,.72);font:650 11px/1.45 system-ui,sans-serif;letter-spacing:.02em}
    .drive-mode-help strong{color:#fff}
    .play-coach{position:fixed;left:50%;top:max(84px,calc(env(safe-area-inset-top) + 70px));transform:translateX(-50%);z-index:58;width:min(520px,calc(100vw - 28px));padding:12px 16px;border:1px solid rgba(175,225,255,.30);border-radius:14px;background:linear-gradient(180deg,rgba(7,14,22,.94),rgba(4,8,13,.91));box-shadow:0 14px 42px rgba(0,0,0,.40),0 0 28px rgba(70,195,255,.08);backdrop-filter:blur(12px);text-align:center;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
    .play-coach.hidden{opacity:0;transform:translate(-50%,-8px);pointer-events:none}
    .play-coach span{display:block;color:#7fdaff;font:900 9px/1 system-ui,sans-serif;letter-spacing:.18em;margin-bottom:6px}
    .play-coach strong{display:block;color:#fff;font:900 15px/1.2 system-ui,sans-serif;letter-spacing:.04em}
    .play-coach small{display:block;margin-top:6px;color:rgba(232,244,252,.72);font:650 11px/1.35 system-ui,sans-serif}
    .coach-help{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(74px,calc(env(safe-area-inset-bottom) + 68px));z-index:47;border:1px solid rgba(220,242,255,.24);border-radius:11px;background:rgba(7,13,20,.86);color:#eaf8ff;padding:9px 12px;font:800 9px/1 system-ui,sans-serif;letter-spacing:.10em;cursor:pointer}
    .coach-help.hidden{display:none}
    .capture-alert{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.96);z-index:57;min-width:260px;padding:13px 18px;border:1px solid rgba(255,80,105,.62);border-radius:14px;background:rgba(53,6,13,.84);box-shadow:0 0 40px rgba(255,35,70,.20);color:#fff;text-align:center;font:950 14px/1.1 system-ui,sans-serif;letter-spacing:.09em;opacity:0;pointer-events:none;transition:opacity .10s linear,transform .10s linear}
    .capture-alert.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
    .capture-alert small{display:block;margin-top:6px;color:#ffbcc7;font:800 9px/1 system-ui,sans-serif;letter-spacing:.08em}
    @media(max-width:760px){.play-coach{top:max(68px,calc(env(safe-area-inset-top) + 54px));width:min(420px,calc(100vw - 20px));padding:10px 12px}.play-coach strong{font-size:13px}.play-coach small{font-size:10px}.coach-help{right:max(10px,env(safe-area-inset-right));bottom:max(58px,calc(env(safe-area-inset-bottom) + 54px));padding:8px 10px}.capture-alert{min-width:220px;font-size:12px}}
  `;
  document.head.appendChild(style);

  const modeBox=document.querySelector('.drive-mode-selector');
  const modeHelp=document.createElement('p');
  modeHelp.className='drive-mode-help';
  function syncModeHelp(){
    const manual=window.NightDriveMode==='manual';
    modeHelp.innerHTML=manual
      ? '<strong>FULL MANUAL</strong> · sterzo libero, nessuna correzione automatica.'
      : '<strong>ASSIST · consigliato</strong> · scegli la direzione; l’auto ti aiuta a restare sulla strada senza toglierti il volante.';
  }
  if(modeBox){modeBox.appendChild(modeHelp);modeBox.addEventListener('click',()=>setTimeout(syncModeHelp,0));syncModeHelp();}

  const coach=document.createElement('div');
  coach.className='play-coach hidden';
  coach.innerHTML='<span>GUIDA RAPIDA</span><strong></strong><small></small>';
  document.body.appendChild(coach);
  const coachTitle=coach.querySelector('strong'),coachCopy=coach.querySelector('small');

  const help=document.createElement('button');
  help.type='button';help.className='coach-help hidden';help.textContent='? GUIDA';
  help.setAttribute('aria-label','Riapri la guida rapida');document.body.appendChild(help);

  const capture=document.createElement('div');
  capture.className='capture-alert';capture.innerHTML='TI STANNO BLOCCANDO!<small>ACCELERA, DRIFTA O USA I CHIODI</small>';
  document.body.appendChild(capture);

  const steps=[
    {title:'ACCELERA',copy:'W / ↑ oppure spingi il joystick in avanti.',done:g=>Math.abs(g?.player?.speed||0)>82},
    {title:'SCEGLI LA STRADA',copy:'A / D o joystick: dai un colpo nella direzione che vuoi. In ASSIST il sistema completa la traiettoria.',done:()=>keys.has('KeyA')||keys.has('KeyD')||keys.has('ArrowLeft')||keys.has('ArrowRight')||Math.abs(window.NightDriveInput?.steer||0)>.24},
    {title:'DRIFT CONTROLLATO',copy:'Tieni SHIFT / X + sterzo. Circa 0,29 s = 90°, 0,90 s = 180°.',done:g=>!!g?.player?._drift?.active},
    {title:'CHIODI DIETRO',copy:'E rilascia i chiodi: usali quando una pattuglia ti è addosso.',event:'spikes'},
    {title:'MISSILE DAVANTI',copy:'Q spara in avanti. Elimina le pattuglie, ma prima di metà fuga possono arrivare rinforzi.',event:'missile'}
  ];

  let run=null,index=0,stepStarted=0,eventFlags={spikes:false,missile:false},forceTutorial=false;
  function seen(){try{return localStorage.getItem('nightHeistTutorialV2')==='1'}catch{return false}}
  function markSeen(){try{localStorage.setItem('nightHeistTutorialV2','1')}catch{}}
  function showStep(){
    const s=steps[index];if(!s){coach.classList.add('hidden');markSeen();return;}
    coachTitle.textContent=s.title;coachCopy.textContent=s.copy;coach.classList.remove('hidden');stepStarted=performance.now();
  }
  function startTutorial(){index=0;eventFlags={spikes:false,missile:false};forceTutorial=true;showStep();}
  function nextStep(){index++;if(index>=steps.length){coach.classList.add('hidden');markSeen();forceTutorial=false;return;}showStep();}

  addEventListener('keydown',e=>{if(e.code==='KeyE')eventFlags.spikes=true;if(e.code==='KeyQ')eventFlags.missile=true;});
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest?.('[data-weapon]');if(!b)return;
    if(b.dataset.weapon==='spikes')eventFlags.spikes=true;
    if(b.dataset.weapon==='missile')eventFlags.missile=true;
  },true);
  help.addEventListener('click',startTutorial);

  function tick(){
    const playing=state==='playing'&&game;
    help.classList.toggle('hidden',!playing);
    if(!playing){coach.classList.add('hidden');capture.classList.remove('show');run=null;requestAnimationFrame(tick);return;}

    if(run!==game){
      run=game;index=0;eventFlags={spikes:false,missile:false};forceTutorial=!seen();
      if(forceTutorial)showStep();else coach.classList.add('hidden');
    }

    if(forceTutorial&&steps[index]){
      const s=steps[index];
      const completed=s.event?!!eventFlags[s.event]:!!s.done?.(game);
      const timedOut=performance.now()-stepStarted>7500;
      if(completed||timedOut)nextStep();
    }

    const catchRatio=clamp((game.catch||0)/1.15,0,1);
    capture.classList.toggle('show',catchRatio>.16);
    capture.style.opacity=catchRatio>.16?String(.58+.42*catchRatio):'';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
