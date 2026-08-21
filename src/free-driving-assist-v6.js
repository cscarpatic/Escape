(() => {
  const input = window.NightDriveInput = window.NightDriveInput || { steer:0, throttle:0, reverse:0 };
  const manualUpdatePlayer = Game.prototype.updatePlayer;
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const DRIFT_CODES = ['ShiftLeft', 'ShiftRight', 'KeyX'];
  const OFFROAD_HINT_KEY = 'nightHeistOffroadHintV1';

  const meter = document.getElementById('driftMeter');
  const meterFill = meter?.querySelector('i');
  const meterMark = meter?.querySelector('b');
  const meterText = meter?.querySelector('strong');

  function isAssist() {
    return window.NightDriveMode !== 'manual';
  }

  function isCoarsePointer() {
    return document.body.classList.contains('touch-device') ||
      (window.matchMedia && matchMedia('(pointer:coarse)').matches);
  }

  function requestedSteer() {
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const keyboard = (right ? 1 : 0) - (left ? 1 : 0);
    if (keyboard) return keyboard;

    // The touch joystick is deliberately soft around centre. Re-expand it a little here
    // so small thumb movements still produce a useful, predictable steering response.
    const raw = clamp(input.steer || 0, -1, 1);
    return Math.sign(raw) * Math.pow(Math.abs(raw), .78);
  }

  function driftHeld() {
    return DRIFT_CODES.some(code => keys.has(code));
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function driftRotation(hold) {
    if (hold <= .34) return (Math.PI / 2) * smooth(clamp(hold / .34, 0, 1));
    const t = smooth(clamp((hold - .34) / .66, 0, 1));
    return Math.PI / 2 + (Math.PI / 2) * t;
  }

  function nearestOnPath(path, x, y, best) {
    const pts = path?.points || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / len2, 0, 1);
      const px = a.x + vx * t, py = a.y + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best.d) {
        const len = Math.sqrt(len2);
        best = { d, x:px, y:py, tx:vx / len, ty:vy / len, path };
      }
    }
    return best;
  }

  function nearestRoad(g, x, y) {
    let best = { d:Infinity, x, y, tx:0, ty:-1, path:null };
    const primary = g.road?.nearestInfo?.(x, y);
    if (primary?.path) best = primary;

    const primaryWidth = best.path?.width || g.env.roadWidth || 150;
    if (best.path && best.d < primaryWidth * .78) return best;

    // Fallback also sees elevated/ramp paths. It is only used when the normal nearest-road
    // query is too far away, so it does not add much work during ordinary driving.
    const candidates = g.road?.nearbyPaths?.(y, 760) || g.road?.paths || [];
    for (const path of candidates) {
      if (!path?.points?.length) continue;
      best = nearestOnPath(path, x, y, best);
    }
    return best;
  }

  function showOffroadHint(g) {
    if (g._arcadeOffroadWarned || g._arcadeOffroadTime < 1.05 || Math.abs(g.player.speed) < 45) return;

    let seen = false;
    try { seen = localStorage.getItem(OFFROAD_HINT_KEY) === '1'; } catch {}
    g._arcadeOffroadWarned = true;
    if (seen) return;
    try { localStorage.setItem(OFFROAD_HINT_KEY, '1'); } catch {}

    toast(isCoarsePointer()
      ? 'FUORI STRADA · TORNA SULL’ASFALTO PER FARE PROGRESSI'
      : 'FUORI STRADA · TORNA SULL’ASFALTO: QUI NON AVANZI NELLA FUGA');
  }

  function syncGuideCopy() {
    const assistButton = document.querySelector('[data-drive-mode="assist"]');
    const manualButton = document.querySelector('[data-drive-mode="manual"]');
    if (assistButton) assistButton.textContent = 'ARCADE';
    if (manualButton) manualButton.textContent = 'MANUALE';

    const footer = document.querySelector('.menu-footer span');
    if (footer) footer.textContent = window.NightDriveMode === 'manual' ? 'MANUALE' : 'ARCADE consigliato';

    const help = document.querySelector('.drive-mode-help');
    if (help) {
      help.innerHTML = window.NightDriveMode === 'manual'
        ? '<strong>MANUALE</strong> · più tecnico: nessuna facilitazione extra.'
        : '<strong>ARCADE · consigliato</strong> · sterzo libero; sull’asfalto vai forte e fai progressi.';
    }

    const rules = [...document.querySelectorAll('.guide-rule')];
    for (const rule of rules) {
      const title = rule.querySelector('b');
      const copy = rule.querySelector('em');
      if (!title || !copy) continue;
      if (title.textContent.includes('2 ·')) {
        title.textContent = '2 · STERZA';
        copy.innerHTML = isCoarsePointer()
          ? 'al bivio entra nella strada che vuoi'
          : '<kbd>A</kbd>/<kbd>D</kbd> sterza · al bivio entra nella strada che vuoi';
      }
    }

    const extras = document.querySelectorAll('.guide-extra');
    extras.forEach(extra => {
      if (extra.dataset.arcadeRoadRule) return;
      extra.dataset.arcadeRoadRule = '1';
      extra.insertAdjacentHTML('beforeend', ' · <strong>Fuori strada rallenti e non fai progressi.</strong>');
    });
  }

  function patchCoachCopy() {
    const coach = document.querySelector('.play-coach');
    if (!coach || coach.classList.contains('hidden')) return;
    const title = coach.querySelector('strong');
    const copy = coach.querySelector('small');
    if (!title || !copy) return;

    if (title.textContent === '2 · SCEGLI' || title.textContent === '2 · STERZA') {
      title.textContent = '2 · STERZA';
      const desired = isCoarsePointer()
        ? 'Sterza col joystick. Al bivio entra fisicamente nella strada che vuoi.'
        : 'Sterza con A / D. Al bivio entra fisicamente nella strada che vuoi.';
      if (copy.textContent !== desired) copy.textContent = desired;
    }
  }

  syncGuideCopy();
  const coach = document.querySelector('.play-coach');
  if (coach) new MutationObserver(patchCoachCopy).observe(coach, { childList:true, subtree:true, characterData:true, attributes:true });

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-drive-mode]')) return;
    setTimeout(() => {
      syncGuideCopy();
      patchCoachCopy();
    }, 0);
  });

  Game.prototype.updatePlayer = function(dt) {
    if (!isAssist()) return manualUpdatePlayer.call(this, dt);

    dt = Math.min(dt, .033);
    const p = this.player;
    if (!p) return;

    // Keep the default mode completely independent from lane/route steering. The road is
    // gameplay again, but only through speed/progress rules, never through invisible rotation.
    if (p._roadAssist) {
      p._roadAssist.route = null;
      p._roadAssist.intent = null;
    }
    if (this.road) {
      this.road._activeRampId = null;
      this.road._preferredLevel = 0;
    }

    const steer = requestedSteer();
    const keyThrottle = keys.has('ArrowUp') || keys.has('KeyW');
    const keyBrake = keys.has('ArrowDown') || keys.has('KeyS');
    const keyReverse = keys.has('KeyZ');
    const hand = keys.has('Space');
    const throttle = keyThrottle ? 1 : clamp(input.throttle || 0, 0, 1);
    const reversePower = keyReverse ? 1 : clamp(input.reverse || 0, 0, 1);
    const reversing = reversePower > .06;

    const roadInfo = nearestRoad(this, p.x, p.y);
    const roadWidth = roadInfo.path?.width || this.env.roadWidth || 150;
    const roadOpen = roadInfo.path && !roadInfo.path.closed;
    const onRoad = !!roadOpen && roadInfo.d < roadWidth * .62;
    p.offroad = lerp(p.offroad || 0, onRoad ? 0 : 1, Math.min(1, dt * 5.5));

    // Forgiving arcade acceleration on asphalt; leaving the road is recoverable but costly.
    if (reversing) {
      if (p.speed > 2) p.speed = Math.max(0, p.speed - 190 * dt);
      else p.speed -= lerp(52, 96, reversePower) * dt;
    } else {
      const accel = onRoad ? 124 : 72;
      if (throttle > .025) p.speed += accel * throttle * dt;
      else if (p.speed > 0) p.speed = Math.max(0, p.speed - 19 * dt);
      else if (p.speed < 0) p.speed = Math.min(0, p.speed + 32 * dt);

      if (keyBrake) {
        if (p.speed > 0) p.speed = Math.max(0, p.speed - 185 * dt);
        else if (p.speed < 0) p.speed = Math.min(0, p.speed + 120 * dt);
      }
    }

    if (hand) p.speed *= Math.pow(.74, dt * 8);
    p.speed = clamp(p.speed, reversing ? -52 : -18, 228);

    if (!onRoad && p.speed > 0) {
      p.speed *= Math.pow(.56, dt);
      if (p.speed > 118) p.speed = lerp(p.speed, 118, Math.min(1, dt * 3.1));
      if (Math.abs(p.speed) > 48 && Math.random() < dt * 12) this.spawnDust?.(p.x, p.y);
      this._arcadeOffroadTime = (this._arcadeOffroadTime || 0) + dt;
    } else {
      this._arcadeOffroadTime = 0;
    }
    showOffroadHint(this);

    p._drift ||= { active:false, hold:0, dir:0, startAngle:0, startSpeed:0 };
    const drift = p._drift;
    const wantsDrift = driftHeld();

    if (wantsDrift && !drift.active && Math.abs(p.speed) > 42 && Math.abs(steer) > .07) {
      drift.active = true;
      drift.hold = 0;
      drift.dir = Math.sign(steer);
      drift.startAngle = p.angle;
      drift.startSpeed = Math.abs(p.speed);
      audio.burst?.(145, .045, 'sawtooth');
    }

    const speedT = clamp(Math.abs(p.speed) / 228, 0, 1);
    const motion = clamp(Math.abs(p.speed) / 46, .26, 1);
    const response = 1 - Math.exp(-dt * (drift.active ? 16 : 12.5));
    p.steer = lerp(p.steer || 0, steer, response);

    if (drift.active && wantsDrift) {
      drift.hold = Math.min(1, drift.hold + dt);
      const rotation = driftRotation(drift.hold);
      const progress = clamp(drift.hold, 0, 1);
      p.angle = drift.startAngle + drift.dir * rotation;

      const minDriftSpeed = Math.min(drift.startSpeed || 74, 68 + progress * 10);
      p.speed = Math.sign(p.speed || 1) * Math.max(minDriftSpeed, Math.abs(p.speed) * Math.pow(.80, dt));
      p.steer = lerp(p.steer, drift.dir, Math.min(1, dt * 10));

      this.camera.shake = Math.max(this.camera.shake, 2 + progress * 3.4);
      if (Math.abs(p.speed) > 38 && Math.random() < dt * (24 + progress * 26)) {
        const bx = p.x - Math.cos(p.angle) * 23;
        const by = p.y - Math.sin(p.angle) * 23;
        this.spawnSmoke?.(bx + Math.sin(p.angle) * 9, by - Math.cos(p.angle) * 9);
        this.spawnSmoke?.(bx - Math.sin(p.angle) * 9, by + Math.cos(p.angle) * 9);
      }

      const deg = Math.round(rotation * 180 / Math.PI);
      meter?.classList.remove('hidden');
      if (meterFill) meterFill.style.width = `${(progress * 100).toFixed(1)}%`;
      if (meterMark) meterMark.style.left = '34%';
      if (meterText) meterText.textContent = `${deg}°`;
      meter?.classList.toggle('drift-meter--uturn', deg >= 135);
    } else {
      if (drift.active) {
        if (drift.hold > .18) audio.burst?.(drift.hold >= .62 ? 250 : 205, .05, 'sine');
        drift.active = false;
        drift.hold = 0;
        drift.dir = 0;
      }
      meter?.classList.add('hidden');
      meter?.classList.remove('drift-meter--uturn');

      if (Math.abs(steer) > .035 && Math.abs(p.speed) > 1) {
        // More steering authority at low/medium speed, calmer at maximum speed.
        const turnRate = lerp(1.52, .92, speedT) * motion * (hand ? 1.42 : 1);
        const motionSign = p.speed >= 0 ? 1 : -1;
        p.angle += p.steer * turnRate * dt * motionSign;
      } else {
        p.steer = lerp(p.steer, 0, Math.min(1, dt * 17));
        if (Math.abs(p.steer) < .012) p.steer = 0;
      }
    }

    const vx = Math.cos(p.angle) * p.speed;
    const vy = Math.sin(p.angle) * p.speed;
    p.x += vx * dt;
    p.y += vy * dt;

    // Escape progress only comes from useful forward travel on the road. Diagonal bends count
    // fully; driving sideways, backwards or cross-country no longer wins the mission.
    if (!reversing && p.speed > 0 && onRoad) {
      const northShare = clamp((-vy) / Math.max(1, p.speed * .35), 0, 1);
      this.distance += p.speed * dt * METERS_PER_UNIT * northShare;
    }

    this.maxSpeed = Math.max(this.maxSpeed, Math.abs(p.speed) * 1.42);
  };

  window.NightHeistAssistStyle = 'arcade-road-aware-v1';
  syncGuideCopy();
})();