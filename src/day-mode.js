(() => {
  const DAY_PALETTES = {
    neon:   { ground:'#aebcb2', road:'#4b555d', shoulder:'#c8c7c0', lane:'#fff8e8', skyGlow:[255,226,170], fog:.01, rain:.12 },
    docks:  { ground:'#b9b19e', road:'#55534f', shoulder:'#cfc5b1', lane:'#fff4df', skyGlow:[255,218,160], fog:.025, rain:.08 },
    alpine: { ground:'#93a18f', road:'#4b5050', shoulder:'#b8beb6', lane:'#f6f8f3', skyGlow:[218,235,255], fog:.07, rain:.02 },
    storm:  { ground:'#c9a984', road:'#5a514b', shoulder:'#d4b890', lane:'#fff2d9', skyGlow:[255,218,170], fog:.035, rain:0 },
  };

  const nightPalettes = new Map(ENVIRONMENTS.map(env => [env.id, {
    ground: env.ground, road: env.road, shoulder: env.shoulder, lane: env.lane,
    skyGlow: [...env.skyGlow], fog: env.fog, rain: env.rain,
  }]));

  let lightingMode = 'day';

  const style = document.createElement('style');
  style.textContent = `
    .time-mode-selector{display:flex;gap:8px;align-items:center;margin:0 0 18px;padding:7px;border:1px solid rgba(255,255,255,.14);border-radius:13px;background:rgba(0,0,0,.24);width:max-content;max-width:100%;position:relative;z-index:2}
    .time-mode-selector span{padding:0 8px;color:#a9b7c5;font-size:9px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}
    .time-mode-button{min-width:104px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(255,255,255,.055);color:#d3dfeb;font:900 10px/1 system-ui,sans-serif;letter-spacing:.10em;cursor:pointer}
    .time-mode-button.active{color:#081018;background:#f3fbfd;border-color:#fff;box-shadow:0 5px 20px rgba(255,240,185,.24)}
    body.day-mode{--bg:#c5cec6}
    body.day-mode #game{background:#aebcb2}
    body.day-mode #vignette{background:radial-gradient(circle at 50% 44%,transparent 52%,rgba(34,45,45,.05) 78%,rgba(24,31,33,.20) 130%)}
    body.day-mode #scanlines{opacity:.025}
    body.day-mode .panel{background:linear-gradient(145deg,rgba(17,25,29,.88),rgba(19,28,32,.76));box-shadow:0 30px 90px rgba(25,35,35,.25),inset 0 1px rgba(255,255,255,.08)}
    body.day-mode .environment-card{background:rgba(255,255,255,.045)}
    body.day-mode .hud{filter:drop-shadow(0 2px 2px rgba(0,0,0,.14))}
    @media (max-width:880px){.time-mode-selector{position:sticky;top:0;width:100%;justify-content:center;background:rgba(8,14,17,.94);backdrop-filter:blur(12px)}}
    @media (max-width:560px){.time-mode-selector span{display:none}.time-mode-button{flex:1;min-width:0}}
  `;
  document.head.appendChild(style);

  const subtitle = document.querySelector('#menu .subtitle');
  if (subtitle) subtitle.textContent = 'Scegli Giorno o Notte e trova la via di fuga tra viali, isolati, rotatorie e traffico.';
  const eyebrow = document.querySelector('#menu .eyebrow');
  if (eyebrow) eyebrow.textContent = 'GETAWAY / DAY & NIGHT PURSUIT';

  const grid = document.getElementById('environmentGrid');
  let selector = document.getElementById('timeModeSelector');
  if (!selector) {
    selector = document.createElement('div');
    selector.className = 'time-mode-selector';
    selector.id = 'timeModeSelector';
    selector.innerHTML = '<span>ILLUMINAZIONE</span><button class="time-mode-button" data-light="day" aria-pressed="false">☀ GIORNO</button><button class="time-mode-button" data-light="night" aria-pressed="false">☾ NOTTE</button>';
    if (grid?.parentNode) grid.parentNode.insertBefore(selector, grid);
  }

  function applyPalette(env) {
    if (!env) return;
    const palette = lightingMode === 'day' ? DAY_PALETTES[env.id] : nightPalettes.get(env.id);
    if (!palette) return;
    env.ground = palette.ground;
    env.road = palette.road;
    env.shoulder = palette.shoulder;
    env.lane = palette.lane;
    env.skyGlow = [...palette.skyGlow];
    env.fog = palette.fog;
    env.rain = palette.rain;
  }

  function applyPalettes() {
    ENVIRONMENTS.forEach(applyPalette);
    if (game) applyPalette(game.env);
  }

  function syncUI() {
    document.body.classList.toggle('day-mode', lightingMode === 'day');
    document.body.classList.toggle('night-mode', lightingMode === 'night');
    selector.querySelectorAll('[data-light]').forEach(button => {
      const active = button.dataset.light === lightingMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', lightingMode === 'day' ? '#aebcb2' : '#05070b');
  }

  function setLighting(next, announce=false) {
    if (next !== 'day' && next !== 'night') return;
    lightingMode = next;
    window.NightHeistLighting = lightingMode;
    applyPalettes();
    syncUI();
    if (announce && typeof toast === 'function') toast(lightingMode === 'day' ? 'MODALITÀ GIORNO' : 'MODALITÀ NOTTE');
  }

  selector.addEventListener('click', event => {
    const button = event.target.closest('[data-light]');
    if (!button) return;
    setLighting(button.dataset.light, state !== 'menu');
  });

  [ui.start, ui.retry].forEach(button => button?.addEventListener('click', () => {
    queueMicrotask(() => { applyPalettes(); syncUI(); });
  }));

  const baseNightMask = drawNightMask;
  drawNightMask = function(g) {
    if (lightingMode === 'night') return baseNightMask(g);

    const previousFog = g.env.fog;
    g.env.fog = -4.1363636364;
    try { baseNightMask(g); } finally { g.env.fog = previousFog; }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sun = ctx.createLinearGradient(0, 0, W, H);
    sun.addColorStop(0, 'rgba(255,247,211,.10)');
    sun.addColorStop(.55, 'rgba(255,255,255,.025)');
    sun.addColorStop(1, 'rgba(184,222,255,.035)');
    ctx.fillStyle = sun;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  };

  const baseDrawProps = drawProps;

  function polygon(points, fill, stroke, width=1) {
    if (!points.length) return;
    ctx.beginPath();ctx.moveTo(points[0].x, points[0].y);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();ctx.fillStyle = fill;ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function blockPoints(b) {
    return [worldToScreen(b.left,b.top), worldToScreen(b.right,b.top), worldToScreen(b.right,b.bottom), worldToScreen(b.left,b.bottom)];
  }

  function drawDayCity(g) {
    for (const b of g.road.cityBlocks || []) {
      if (b.bottom < g.player.y-1500 || b.top > g.player.y+1500) continue;
      const pts = blockPoints(b);
      const fill = b.type === 'park' ? '#8dab78' : b.type === 'parking' ? '#aeb6b7' : '#d2d0c7';
      polygon(pts, fill, 'rgba(77,88,88,.38)', 2);
      if (b.type === 'park') {
        for (let i=0;i<6;i++) {
          const x=lerp(b.left+35,b.right-35,hash(b.seed*29+i));
          const y=lerp(b.top+40,b.bottom-40,hash(b.seed*31+i+7));
          const s=worldToScreen(x,y);
          ctx.fillStyle='#496f45';ctx.beginPath();ctx.arc(s.x,s.y,10+hash(b.seed+i)*6,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(157,193,110,.75)';ctx.beginPath();ctx.arc(s.x-3,s.y-3,4,0,Math.PI*2);ctx.fill();
        }
      } else if (b.type === 'parking') {
        ctx.save();ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=1.5;
        for(let x=b.left+35;x<b.right-35;x+=38){
          const a=worldToScreen(x,b.top+42), z=worldToScreen(x+18,b.top+72);
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (const p of g.road.props || []) {
      if (p.mode !== 'city' || Math.abs(p.y-g.player.y)>1200) continue;
      const s=worldToScreen(p.x,p.y), h=hash(p.seed*7);
      if(s.x<-180||s.x>W+180||s.y<-180||s.y>H+180)continue;
      const bw=45+h*45, bh=70+hash(p.seed*11)*110;
      const hue=hash(p.seed*13);
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(window.viewRotation ? window.viewRotation() : 0);
      ctx.fillStyle = hue<.33 ? '#d7c9ab' : hue<.66 ? '#b8c8cc' : '#c9bbb5';
      ctx.strokeStyle='rgba(57,67,71,.48)';ctx.lineWidth=2;
      ctx.fillRect(-bw/2,-bh/2,bw,bh);ctx.strokeRect(-bw/2,-bh/2,bw,bh);
      ctx.fillStyle='rgba(68,89,99,.60)';
      for(let wy=-bh/2+12;wy<bh/2-8;wy+=16){for(let wx=-bw/2+9;wx<bw/2-6;wx+=14){if(hash(p.seed+wx*3+wy*5)>.52) ctx.fillRect(wx,wy,5,7);}}
      ctx.restore();
    }
  }

  drawProps = function(g) {
    if (lightingMode === 'day' && g.env.propMode === 'city' && g.road.cityBlocks) return drawDayCity(g);
    return baseDrawProps(g);
  };

  const baseBackdrop = renderMenuBackdrop;
  renderMenuBackdrop = function() {
    if (lightingMode === 'night') return baseBackdrop();
    const env = ENVIRONMENTS[selectedEnv];
    ctx.fillStyle = env.ground;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.translate(W*.5,H*.54);ctx.rotate(-.10);
    for(let i=-4;i<=4;i++){
      const x=i*195;
      ctx.strokeStyle='#c9c7bf';ctx.lineWidth=122;ctx.beginPath();ctx.moveTo(x,-H);ctx.lineTo(x,H);ctx.stroke();
      ctx.strokeStyle='#515a60';ctx.lineWidth=98;ctx.beginPath();ctx.moveTo(x,-H);ctx.lineTo(x,H);ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;ctx.setLineDash([22,28]);ctx.beginPath();ctx.moveTo(x,-H);ctx.lineTo(x,H);ctx.stroke();
    }
    ctx.restore();
    const glow=ctx.createLinearGradient(0,0,W,H);
    glow.addColorStop(0,'rgba(255,244,201,.20)');glow.addColorStop(1,'rgba(126,184,214,.06)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
  };

  setLighting('day', false);
})();
