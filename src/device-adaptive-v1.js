(() => {
  const body = document.body;
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!touch) return;

  const gate = document.createElement('div');
  gate.className = 'landscape-gate';
  gate.setAttribute('role','status');
  gate.setAttribute('aria-live','polite');
  gate.innerHTML = '<div class="landscape-gate__card"><span class="landscape-gate__icon">▭</span><strong>RUOTA IN ORIZZONTALE</strong><small>Night Heist è ottimizzato per la guida in landscape. Ruota iPhone o iPad per continuare.</small></div>';
  document.body.appendChild(gate);

  const ua = navigator.userAgent || '';
  const isIPadUA = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIPhoneUA = /iPhone|iPod/i.test(ua);
  const startButton = document.getElementById('startButton');
  let lastClass = '';

  function viewport() {
    const vv = window.visualViewport;
    return {
      w: Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth),
      h: Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight),
    };
  }

  function classify() {
    const {w,h} = viewport();
    const short = Math.min(w,h), long = Math.max(w,h);
    const ipad = isIPadUA || (!isIPhoneUA && short >= 700);
    let cls;
    if (ipad) cls = short >= 900 || long >= 1250 ? 'device-ipad-large' : 'device-ipad-compact';
    else if (short <= 390 || long <= 740) cls = 'device-phone-small';
    else if (short >= 430 || long >= 900) cls = 'device-phone-large';
    else cls = 'device-phone';

    ['device-phone-small','device-phone','device-phone-large','device-ipad-compact','device-ipad-large'].forEach(c => body.classList.remove(c));
    body.classList.add(cls);
    body.dataset.deviceClass = cls.replace('device-','');
    body.dataset.appleMobile = isIPadUA ? 'ipad' : isIPhoneUA ? 'iphone' : 'touch';
    lastClass = cls;
    return {w,h,cls};
  }

  function syncOrientation() {
    const {w,h} = classify();
    const landscape = w > h;
    body.classList.toggle('is-landscape', landscape);
    body.classList.toggle('is-portrait', !landscape);
    gate.setAttribute('aria-hidden', landscape ? 'true' : 'false');

    // Never let the car continue driving behind the rotate overlay.
    if (!landscape && window.state === 'playing') {
      const pause = document.getElementById('pauseButton');
      if (pause && !pause.disabled) pause.click();
    }

    // Keep Safari's dynamic viewport settled after chrome/orientation changes.
    document.documentElement.style.setProperty('--app-width', `${w}px`);
    document.documentElement.style.setProperty('--app-height', `${h}px`);
    setTimeout(() => window.scrollTo?.(0,1), 30);
  }

  async function enterFullscreenLandscape() {
    if (!touch) return;
    const root = document.documentElement;
    try {
      if (!document.fullscreenElement && root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI:'hide' });
      } else if (!document.webkitFullscreenElement && root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      }
    } catch {}

    try {
      if (screen.orientation?.lock) await screen.orientation.lock('landscape');
    } catch {}

    // Safari fallback: when true fullscreen is unavailable this still removes avoidable page chrome.
    window.scrollTo?.(0,1);
    syncOrientation();
  }

  // Capture phase keeps the fullscreen request tied to the user's PARTI gesture.
  startButton?.addEventListener('pointerup', () => { enterFullscreenLandscape(); }, { capture:true });
  startButton?.addEventListener('click', () => { enterFullscreenLandscape(); }, { capture:true });

  document.addEventListener('fullscreenchange', syncOrientation);
  document.addEventListener('webkitfullscreenchange', syncOrientation);
  window.addEventListener('orientationchange', () => setTimeout(syncOrientation, 80));
  window.addEventListener('resize', syncOrientation, { passive:true });
  window.visualViewport?.addEventListener('resize', syncOrientation, { passive:true });

  // Installed iOS/Android web apps already run without browser chrome; expose this for layout/debugging.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  body.classList.toggle('is-standalone', !!standalone);
  body.classList.add('adaptive-touch-ui');
  syncOrientation();

  window.NightHeistDeviceProfile = () => ({
    className:lastClass,
    apple:isIPadUA?'ipad':isIPhoneUA?'iphone':'touch',
    standalone:!!standalone,
    ...viewport(),
  });
})();
