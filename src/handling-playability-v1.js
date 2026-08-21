(() => {
  const input = window.NightDriveInput = window.NightDriveInput || {};
  const TIP_KEY = 'nightHeistPlayabilityTipsV1';

  function applyModeTuning() {
    const manual = window.NightDriveMode === 'manual';
    for (const env of ENVIRONMENTS) {
      if (manual) {
        Object.assign(env, {
          steerAssist: 0,
          laneAssist: .0001,
          followAssist: -.835164835,
          cornerAssist: 0,
          manualShare: .55,
          offroadMax: 118,
        });
      } else {
        Object.assign(env, {
          steerAssist: 1.05,
          laneAssist: .72,
          followAssist: .62,
          cornerAssist: .25,
          manualShare: .55,
          offroadMax: 125,
        });
      }
    }
  }

  function syncGuideCopy() {
    const assistBtn = document.querySelector('[data-drive-mode="assist"]');
    const manualBtn = document.querySelector('[data-drive-mode="manual"]');
    if (assistBtn) assistBtn.textContent = 'ARCADE';
    if (manualBtn) manualBtn.textContent = 'MANUALE';

    const footer = document.querySelector('.menu-footer span');
    if (footer) footer.textContent = window.NightDriveMode === 'manual' ? 'Guida: MANUALE' : 'Guida: ARCADE';

    const desktop = document.querySelector('.desktop-control-note');
    if (desktop && !desktop.dataset.playabilityCopy) {
      desktop.dataset.playabilityCopy = '1';
      desktop.innerHTML = [
        '<span><kbd>W</kbd>/<kbd>↑</kbd> accelera</span>',
        '<span><kbd>S</kbd>/<kbd>↓</kbd> frena</span>',
        '<span><kbd>Z</kbd> retromarcia</span>',
        '<span><kbd>A</kbd>/<kbd>D</kbd> sterza · al bivio scegli la strada</span>',
        '<span><kbd>SPAZIO</kbd> freno a mano</span>',
        '<span><kbd>SHIFT</kbd>/<kbd>X</kbd> derapata</span>',
        '<span><kbd>Q</kbd> missile</span>',
        '<span><kbd>E</kbd> chiodi</span>',
      ].join('');
    }

    const mobile = document.querySelector('.mobile-control-note');
    if (mobile && !mobile.dataset.playabilityCopy) {
      mobile.dataset.playabilityCopy = '1';
      mobile.innerHTML = [
        '<span>JOYSTICK A DESTRA: sterzo + gas + retro</span>',
        '<span>AL BIVIO: spingi verso la strada che vuoi prendere</span>',
        '<span>FRENO · DRIFT · FRENO A MANO</span>',
        '<span>MISSILE + CHIODI a sinistra</span>',
      ].join('');
    }
  }

  function nextJunctionDistance(g) {
    const p = g?.player;
    const info = p && g.road?.nearestInfo?.(p.x, p.y);
    const path = info?.path;
    if (!path?.nodeA || !path?.nodeB || !g.road?.nodeMap) return Infinity;
    const tangent = Math.atan2(info.ty, info.tx);
    const forward = Math.cos(angleWrap(tangent - p.angle)) >= 0;
    const node = g.road.nodeMap.get(forward ? path.nodeB : path.nodeA);
    return node ? Math.hypot(p.x - node.x, p.y - node.y) : Infinity;
  }

  function effectiveSteer() {
    const keyboard =
      (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
      (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    if (keyboard) return keyboard;
    const raw = clamp(input.steer || 0, -1, 1);
    return Math.sign(raw) * Math.pow(Math.abs(raw), .82);
  }

  applyModeTuning();
  syncGuideCopy();

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-drive-mode]')) return;
    setTimeout(() => {
      applyModeTuning();
      syncGuideCopy();
    }, 0);
  });

  const baseUpdatePlayer = Game.prototype.updatePlayer;
  Game.prototype.updatePlayer = function(dt) {
    const p = this.player;
    if (!p) return baseUpdatePlayer.call(this, dt);

    const mode = window.NightDriveMode === 'manual' ? 'manual' : 'assist';
    const beforeSpeed = p.speed;
    const beforeInfo = this.road?.nearestInfo?.(p.x, p.y);
    const beforeWidth = beforeInfo?.path?.width || this.env.roadWidth || 150;
    const wasOnRoad = !!beforeInfo?.path && beforeInfo.d < beforeWidth * .62;
    const steer = effectiveSteer();

    // Make the wheel answer sooner, without making high-speed steering twitchy.
    if (mode === 'assist' && Math.abs(steer) > .015 && !p._drift?.active) {
      const response = 1 - Math.exp(-Math.min(dt, .033) * 12.5);
      p.steer = lerp(p.steer || 0, steer, response);
    }

    baseUpdatePlayer.call(this, dt);

    const reversing = (input.reverse || 0) > .06 || keys.has('KeyZ') || p.speed < -1;
    const handbrake = keys.has('Space');
    const braking = keys.has('ArrowDown') || keys.has('KeyS');
    const drifting = !!p._drift?.active;
    const explicitSlow = reversing || handbrake || braking || drifting;

    if (mode === 'assist' && !explicitSlow && p.speed > 8) {
      // Give steering a small direct component so the car follows the player,
      // while the route assistant still handles junction geometry.
      const speedT = clamp((Math.abs(p.speed) - 45) / 150, 0, 1);
      const directRate = lerp(.54, .28, speedT);
      p.angle += steer * directRate * Math.min(dt, .033);
      if (p._assistSmoothAngle !== undefined) p._assistSmoothAngle = p.angle;

      // The assistant may slow for a bend, but never slam an invisible brake.
      if (wasOnRoad && beforeSpeed > 0) {
        const maxPassiveLoss = 46 * Math.min(dt, .033);
        p.speed = Math.max(p.speed, beforeSpeed - maxPassiveLoss);
      }
    }

    // A lane correction made seconds earlier must not silently choose the next road.
    if (mode === 'assist' && p._roadAssist?.intent) {
      const choiceWindow = Math.max(330, Math.abs(p.speed) * 1.95);
      if (nextJunctionDistance(this) > choiceWindow) p._roadAssist.intent = null;
    }
  };

  function showFirstRunTips() {
    let seen = false;
    try { seen = localStorage.getItem(TIP_KEY) === '1'; } catch {}
    if (seen) return;
    try { localStorage.setItem(TIP_KEY, '1'); } catch {}

    const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    setTimeout(() => {
      if (state !== 'playing') return;
      toast(touch
        ? 'JOYSTICK = GUIDA · AL BIVIO SPINGI VERSO LA STRADA'
        : 'A / D = STERZA · AL BIVIO TIENI LA DIREZIONE CHE VUOI');
    }, 2100);
    setTimeout(() => {
      if (state !== 'playing') return;
      toast(touch ? 'MISSILE + CHIODI SONO A SINISTRA' : 'Q = MISSILE · E = CHIODI');
    }, 4700);
  }

  ui.start?.addEventListener('click', showFirstRunTips);
  ui.retry?.addEventListener('click', () => {
    applyModeTuning();
    syncGuideCopy();
  });
})();