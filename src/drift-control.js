(() => {
  const DRIFT_CODES = ['ShiftLeft', 'ShiftRight', 'KeyX'];
  const isDriftHeld = () => DRIFT_CODES.some(code => keys.has(code));

  const meter = document.createElement('div');
  meter.id = 'driftMeter';
  meter.className = 'drift-meter hidden';
  meter.innerHTML = '<span>DERAPATA</span><div class="drift-meter__track"><i></i><b></b></div><strong>90°</strong>';
  document.body.appendChild(meter);
  const meterFill = meter.querySelector('i');
  const meterMark = meter.querySelector('b');
  const meterText = meter.querySelector('strong');

  function smooth(t) { return t * t * (3 - 2 * t); }
  function targetRotation(hold) {
    // ~0.32 s = 90 degrees. From there to 1.05 s it grows continuously to 180.
    if (hold <= .32) return (Math.PI / 2) * smooth(clamp(hold / .32, 0, 1));
    const t = smooth(clamp((hold - .32) / .73, 0, 1));
    return Math.PI / 2 + (Math.PI / 2) * t;
  }
  function driftProgress(hold) { return clamp(hold / 1.05, 0, 1); }

  const baseUpdatePlayer = Game.prototype.updatePlayer;
  Game.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
    const driftHeld = isDriftHeld();

    if (!p._drift) p._drift = { active:false, hold:0, dir:0, startAngle:0 };
    const d = p._drift;

    if (driftHeld && !d.active && Math.abs(p.speed) > 24) {
      const dir = steerInput || (Math.abs(p.steer) > .12 ? Math.sign(p.steer) : 0);
      if (dir) {
        d.active = true;
        d.hold = 0;
        d.dir = dir;
        d.startAngle = p.angle;
        d.startSpeed = Math.abs(p.speed);
        audio.burst(145, .045, 'sawtooth');
      }
    }

    // Keep the normal acceleration/road/off-road model, then impose the controlled drift arc.
    baseUpdatePlayer.call(this, dt);

    if (d.active && driftHeld) {
      d.hold = Math.min(1.05, d.hold + dt);
      const rotation = targetRotation(d.hold);
      p.angle = d.startAngle + d.dir * rotation;

      // Short-radius arcade drift: lose some speed, but never feel as if the car pivots in place.
      const progress = driftProgress(d.hold);
      const minimum = Math.min(d.startSpeed || 70, 62 + progress * 8);
      p.speed = Math.sign(p.speed || 1) * Math.max(minimum, Math.abs(p.speed) * Math.pow(.72, dt));
      p.steer = lerp(p.steer, d.dir, Math.min(1, dt * 9));
      this.camera.shake = Math.max(this.camera.shake, 2 + progress * 3.5);

      if (Math.abs(p.speed) > 35 && Math.random() < dt * (22 + progress * 28)) {
        const backX = p.x - Math.cos(p.angle) * 23;
        const backY = p.y - Math.sin(p.angle) * 23;
        this.spawnSmoke(backX + Math.sin(p.angle) * 9, backY - Math.cos(p.angle) * 9);
        this.spawnSmoke(backX - Math.sin(p.angle) * 9, backY + Math.cos(p.angle) * 9);
      }

      const deg = Math.round(rotation * 180 / Math.PI);
      meter.classList.remove('hidden');
      meterFill.style.width = `${(progress * 100).toFixed(1)}%`;
      meterMark.style.left = `${(0.32 / 1.05 * 100).toFixed(1)}%`;
      meterText.textContent = `${deg}°`;
      meter.classList.toggle('drift-meter--uturn', deg >= 135);
    } else if (d.active) {
      // Release at any point: the current angle is retained, so hold duration determines the turn.
      if (d.hold > .18) audio.burst(d.hold >= .72 ? 250 : 205, .05, 'sine');
      d.active = false;
      d.hold = 0;
      d.dir = 0;
      meter.classList.add('hidden');
      meter.classList.remove('drift-meter--uturn');
    } else {
      meter.classList.add('hidden');
    }
  };

  // Avoid a stuck drift key if the window/app loses focus.
  const clearDrift = () => DRIFT_CODES.forEach(code => keys.delete(code));
  window.addEventListener('blur', clearDrift);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearDrift(); });
})();