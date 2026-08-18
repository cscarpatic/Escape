(() => {
  const touchControls = document.getElementById('touchControls');
  const orientationHint = document.getElementById('orientationHint');
  if (!touchControls) return;

  const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!isTouchDevice) return;

  document.body.classList.add('touch-device');
  const heldPointers = new Map();

  function setControlState(button, pressed) {
    button.classList.toggle('is-pressed', pressed);
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  }

  function releasePointer(pointerId) {
    const entry = heldPointers.get(pointerId);
    if (!entry) return;
    heldPointers.delete(pointerId);
    const stillHeld = [...heldPointers.values()].some(item => item.code === entry.code);
    if (!stillHeld) keys.delete(entry.code);
    const sameButtonHeld = [...heldPointers.values()].some(item => item.button === entry.button);
    if (!sameButtonHeld) setControlState(entry.button, false);
  }

  function bindHold(button) {
    const code = button.dataset.code;
    if (!code) return;
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      if (state !== 'playing') return;
      heldPointers.set(event.pointerId, { code, button });
      keys.add(code);
      setControlState(button, true);
      button.setPointerCapture?.(event.pointerId);
      if (navigator.vibrate) navigator.vibrate(code === 'ShiftLeft' ? 14 : 8);
    }, { passive: false });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
      button.addEventListener(type, event => {
        event.preventDefault();
        releasePointer(event.pointerId);
      }, { passive: false });
    });
  }

  touchControls.querySelectorAll('[data-code]').forEach(bindHold);

  function releaseAll() {
    heldPointers.clear();
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyX', 'KeyZ'].forEach(code => keys.delete(code));
    touchControls.querySelectorAll('[data-code]').forEach(button => setControlState(button, false));
  }

  function syncVisibility() {
    const gameVisible = !ui.hud.classList.contains('hidden');
    touchControls.classList.toggle('hidden', !gameVisible);
    orientationHint?.classList.toggle('hidden', !gameVisible);
    document.body.classList.toggle('game-active', gameVisible);
    if (!gameVisible || state !== 'playing') releaseAll();
  }

  new MutationObserver(syncVisibility).observe(ui.hud, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => {
    if (!ui.pausePanel.classList.contains('hidden')) releaseAll();
  }).observe(ui.pausePanel, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('pagehide', releaseAll);
  touchControls.addEventListener('contextmenu', event => event.preventDefault());

  const stopGesture = event => { if (state === 'playing') event.preventDefault(); };
  document.addEventListener('gesturestart', stopGesture, { passive: false });
  document.addEventListener('gesturechange', stopGesture, { passive: false });
  document.addEventListener('gestureend', stopGesture, { passive: false });
  syncVisibility();
})();