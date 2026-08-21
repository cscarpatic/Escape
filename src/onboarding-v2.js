(() => {
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const style=document.createElement('style');
  style.textContent=`
    .drive-mode-help{margin:8px 0 0;color:rgba(230,242,250,.72);font:650 11px/1.45 system-ui,sans-serif;letter-spacing:.02em}
    .drive-mode-help strong{color:#fff}
    .controls-card .controls-grid{gap:7px}
    .guide-rule{display:grid!important;grid-template-columns:84px 1fr;align-items:center;gap:10px;padding:9px 10px!important;border:1px solid rgba(174,224,255,.12);border-radius:10px;background:rgba(255,255,255,.025)}
    .guide-rule b{color:#8de1ff;font:900 10px/1 system-ui,sans-serif;letter-spacing:.10em;white-space:nowrap}
    .guide-rule em{color:rgba(240,248,252,.86);font:700 11px/1.35 system-ui,sans-serif;font-style:normal}
    .guide-rule--goal{border-color:rgba(134,255,187,.17);background:rgba(66,180,112,.055)}
    .guide-rule--goal b{color:#8ef2b5}
    .guide-extra{display:block!important;margin-top:3px;padding:5px 4px!important;color:rgba(225,238,246,.56)!important;font:650 9px/1.35 system-ui,sans-serif!important;letter-spacing:.03em!important}
    .play-coach{position:fixed;left:50%;top:max(84px,calc(env(safe-area-inset-top) + 70px));transform:translateX(-50%);z-index:58;width:min(470px,calc(100vw - 28px));padding:12px 16px;border:1px solid rgba(175,225,255,.34);border-radius:15px;background:linear-gradient(180deg,rgba(7,14,22,.96),rgba(4,8,13,.93));box-shadow:0 14px 42px rgba(0,0,0,.42),0 0 28px rgba(70,195,255,.09);backdrop-filter:blur(12px);text-align:center;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
    .play-coach.hidden{opacity:0;transform:translate(-50%,-8px);pointer-events:none}
    .play-coach span{display:block;color:#7fdaff;font:900 9px/1 system-ui,sans-serif;letter-spacing:.18em;margin-bottom:6px}
    .play-coach strong{display:block;color:#fff;font:950 17px/1.15 system-ui,sans-serif;letter-spacing:.035em}
    .play-coach small{display:block;margin-top:7px;color:rgba(232,244,252,.76);font:700 11px/1.4 system-ui,sans-serif}
    .coach-help{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(74px,calc(env(safe-area-inset-bottom) + 68px));z-index:47;border:1px solid rgba(220,242,255,.24);border-radius:11px;background:rgba(7,13,20,.86);color:#eaf8ff;padding:9px 12px;font:850 9px/1 system-ui,sans-serif;letter-spacing:.09em;cursor:pointer}
    .coach-help.hidden{display:none}
    .capture-alert{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.96);z-index:57;min-width:250px;padding:13px 18px;border:1px solid rgba(255,80,105,.62);border-radius:14px;background:rgba(53,6,13,.86);box-shadow:0 0 40px rgba(255,35,70,.20);color:#fff;text-align:center;font:950 14px/1.1 system-ui,sans-serif;letter-spacing:.08em;opacity:0;pointer-events:none;transition:opacity .10s linear,transform .10s linear}
    .capture-alert.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
    .capture-alert small{display:block;margin-top:6px;color:#ffbcc7;font:800 9px/1.2 system-ui,sans-serif;letter-spacing:.06em}
    @media(max-width:760px){.guide-rule{grid-template-columns:72px 1fr;gap:8px;padding:8px!important}.guide-rule b{font-size:9px}.guide-rule em{font-size:10px}.play-coach{top:max(68px,calc(env(safe-area-inset-top) + 54px));width:min(400px,calc(100vw - 20px));padding:10px 12px}.play-coach strong{font-size:15px}.play-coach small{font-size:10px}.coach-help{right:max(10px,env(safe-area-inset-right));bottom:max(58px,calc(env(safe-area-inset-bottom) + 54px));padding:8px 10px}.capture-alert{min-width:220px;font-size:12px}}
  `;
  document.head.appendChild(style);

  const coarse=()=>document.body.classList.contains('touch-device') || matchMedia('(pointer:coarse)').matches;
  const modeBox=document.querySelector('.drive-mode-selector');
  const modeHelp=document.createElement('p');
  modeHelp.className='drive-mode-help';
  function syncModeHelp(){
    const manual=window.NightDriveMode==='manual';
    modeHelp.innerHTML=manual
      ? '<strong>FULL MANUAL</strong> · tutto lo sterzo è nelle tue mani.'
      : '<strong>ASSIST · consigliato</strong> · tu scegli la direzione, l’auto ti aiuta a seguire la strada.';
  }
  if(modeBox){modeBox.appendChild(modeHelp);modeBox.addEventListener('click',()=>setTimeout(syncModeHelp,0));syncModeHelp();}

  const coach=document.createElement('div');
  coach.className='play-coach hidden';
  coach.innerHTML='<span>TI AIUTO IO</span><strong></strong><small></small>';
  document.body.appendChild(coach);
  const coachKicker=coach.querySelector('span'),coachTitle=coach.querySelector('strong'),coachCopy=coach.querySelector('small');

  const help=document.createElement('button');
  help.type='button';help.className='coach-help hidden';help.textContent='? COMANDI';
  help.setAttribute('aria-label','Mostra i comandi essenziali');document.body.appendChild(help);

  const capture=document.createElement('div');
  capture.className='capture-alert';capture.innerHTML='QUASI BLOCCATO!<small>GAS + STERZA · E = CHIODI</small>';
  document.body.appendChild(capture);

  const coreSteps=[
    {
      title:'1 · VAI!',
      desktop:'Tieni premuto W / ↑ per accelerare.',
      touch:'Spingi il joystick verso l’alto.',
      done:g=>Math.abs(g?.player?.speed||0)>82
    },
    {
      title:'2 · SCEGLI',
      desktop:'Al bivio tocca A o D. In ASSIST basta indicare la direzione.',
      touch:'Al bivio sposta il joystick a sinistra o destra.',
      done:()=>keys.has('KeyA')||keys.has('KeyD')||keys.has('ArrowLeft')||keys.has('ArrowRight')||Math.abs(window.NightDriveInput?.steer||0)>.22
    }
  ];

  let run=null,coreIndex=0,coreActive=false,stepStarted=0,coachUntil=0,manualHelp=false;
  const keyCore='nightHeistTutorialV3',keySpikes='nightHeistHintSpikesV3',keyMissile='nightHeistHintMissileV3';
  function getFlag(key){try{return localStorage.getItem(key)==='1'}catch{return false}}
  function setFlag(key){try{localStorage.setItem(key,'1')}catch{}}
  function setCoach(kicker,title,copy,duration=0){
    coachKicker.textContent=kicker;coachTitle.textContent=title;coachCopy.textContent=copy;coach.classList.remove('hidden');
    coachUntil=duration?performance.now()+duration:0;
  }
  function hideCoach(){coach.classList.add('hidden');coachUntil=0;manualHelp=false;}
  function showCore(){
    const s=coreSteps[coreIndex];
    if(!s){coreActive=false;setFlag(keyCore);hideCoach();return;}
    setCoach('2 COSE PER PARTIRE',s.title,coarse()?s.touch:s.desktop);stepStarted=performance.now();
  }
  function nextCore(){coreIndex++;showCore();}
  function startCore(){coreIndex=0;coreActive=true;manualHelp=false;showCore();}

  function showCommands(){
    coreActive=false;manualHelp=true;
    const copy=coarse()
      ? 'JOYSTICK = guida · DRIFT = curva stretta · MISSILE davanti · CHIODI dietro.'
      : 'W/↑ = gas · A/D = direzione · SHIFT = drift · Q = missile · E = chiodi.';
    setCoach('COMANDI ESSENZIALI','SCAPPA. SCEGLI. DIFENDITI.',copy,6500);
  }
  help.addEventListener('click',showCommands);

  addEventListener('keydown',e=>{
    if(e.code==='KeyE')setFlag(keySpikes);
    if(e.code==='KeyQ')setFlag(keyMissile);
  });
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest?.('[data-weapon]');if(!b)return;
    if(b.dataset.weapon==='spikes')setFlag(keySpikes);
    if(b.dataset.weapon==='missile')setFlag(keyMissile);
  },true);

  function nearestCopMeters(g){
    let best=Infinity;
    for(const c of g?.cops||[])best=Math.min(best,Math.hypot(c.x-g.player.x,c.y-g.player.y)*METERS_PER_UNIT);
    return best;
  }
  function copAhead(g){
    let best=Infinity;
    for(const c of g?.cops||[]){
      const dx=c.x-g.player.x,dy=c.y-g.player.y,d=Math.hypot(dx,dy)*METERS_PER_UNIT;
      if(d<90||d>360)continue;
      const rel=Math.abs(angleWrap(Math.atan2(dy,dx)-g.player.angle));
      if(rel<.48)best=Math.min(best,d);
    }
    return best;
  }
  function maybeContextHint(g){
    if(coreActive||manualHelp||coachUntil>performance.now())return;
    if(!getFlag(keySpikes)&&nearestCopMeters(g)<175){
      setFlag(keySpikes);
      setCoach('POLIZIA MOLTO VICINA','CHIODI DIETRO!',coarse()?'Tocca CHIODI per rallentare chi ti insegue.':'Premi E per rallentare chi ti insegue.',4300);
      return;
    }
    if(!getFlag(keyMissile)&&Number.isFinite(copAhead(g))){
      setFlag(keyMissile);
      setCoach('PATTUGLIA DAVANTI','MISSILE!',coarse()?'Tocca MISSILE quando hai una pattuglia davanti.':'Premi Q quando hai una pattuglia davanti.',4000);
    }
  }

  function tick(){
    const playing=state==='playing'&&game;
    help.classList.toggle('hidden',!playing);
    if(!playing){coach.classList.add('hidden');capture.classList.remove('show');run=null;requestAnimationFrame(tick);return;}

    if(run!==game){
      run=game;coreIndex=0;coachUntil=0;manualHelp=false;
      coreActive=!getFlag(keyCore);
      if(coreActive)showCore();else coach.classList.add('hidden');
    }

    if(coreActive&&coreSteps[coreIndex]){
      const s=coreSteps[coreIndex];
      const completed=!!s.done?.(game);
      const timedOut=performance.now()-stepStarted>9000;
      if(completed||timedOut)nextCore();
    }else if(coachUntil&&performance.now()>coachUntil){
      hideCoach();
    }

    maybeContextHint(game);

    const catchRatio=clamp((game.catch||0)/1.15,0,1);
    capture.classList.toggle('show',catchRatio>.18);
    capture.style.opacity=catchRatio>.18?String(.58+.42*catchRatio):'';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
