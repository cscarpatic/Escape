(() => {
  // Dedicated reverse gear. KeyZ/mobile RETRO is separate from the normal brake.
  Game.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const up = keys.has('ArrowUp') || keys.has('KeyW');
    const down = keys.has('ArrowDown') || keys.has('KeyS');
    const reverse = keys.has('KeyZ');
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const hand = keys.has('Space');
    const roadInfo = this.road.nearestInfo(p.x, p.y);
    const onRoad = roadInfo.d < this.env.roadWidth * .56;
    p.offroad = lerp(p.offroad, onRoad ? 0 : 1, Math.min(1, dt * 4));

    const accel = onRoad ? 100 : 62;
    const max = onRoad ? 184 : (this.env.offroadMax || 96);
    if (up && !reverse) p.speed += accel * dt;
    else if (!reverse) p.speed -= 24 * dt;

    // Brake remains a brake first; it can still creep backwards if held.
    if (down && !reverse) p.speed -= (p.speed > 0 ? 128 : 48) * dt;

    // Dedicated reverse has stronger low-speed torque and a useful reversing speed.
    if (reverse) {
      p.speed -= (p.speed > 6 ? 175 : 86) * dt;
      if (p.speed > 0 && p.speed < 5) p.speed = 0;
    }

    if (hand) p.speed *= Math.pow(.82, dt * 8);
    p.speed = clamp(p.speed, reverse ? -48 : -34, max);

    const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
    const steerStrength = (1.42 - clamp(Math.abs(p.speed) / 230, 0, .50)) * (hand ? 1.34 : 1);
    const steerResponse = 1 - Math.pow(.035, dt);
    p.steer = lerp(p.steer, steerInput, steerResponse);
    p.angle += p.steer * steerStrength * dt * (p.speed / 98);

    if (onRoad && Math.abs(steerInput) < .01 && p.speed > 34) {
      const roadAngle = Math.atan2(roadInfo.ty, roadInfo.tx);
      const assist = this.env.steerAssist || 0;
      p.angle = angleLerp(p.angle, roadAngle, clamp(dt * assist, 0, .045));
    }

    if (!onRoad) {
      p.speed *= Math.pow(.62, dt);
      if (Math.abs(p.speed) > 48 && Math.random() < dt * 12) this.spawnDust(p.x, p.y);
    }

    const vx = Math.cos(p.angle) * p.speed;
    const vy = Math.sin(p.angle) * p.speed;
    p.x += vx * dt;
    p.y += vy * dt;
    this.distance += Math.max(0, -vy * dt);
    this.maxSpeed = Math.max(this.maxSpeed, Math.abs(p.speed) * 1.42);
    if (hand && Math.abs(p.speed) > 70 && Math.random() < dt * 24) {
      this.spawnSmoke(p.x - Math.cos(p.angle) * 24, p.y - Math.sin(p.angle) * 24);
    }
  };

  const previousHud = Game.prototype.updateHud;
  Game.prototype.updateHud = function (minCop) {
    previousHud.call(this, minCop);
    if (this.player.speed < -2) ui.speed.textContent = `R ${Math.round(Math.abs(this.player.speed) * 1.42)}`;
  };

  const clearReverse = () => keys.delete('KeyZ');
  window.addEventListener('blur', clearReverse);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearReverse(); });
  if (ui?.hud) new MutationObserver(() => { if (ui.hud.classList.contains('hidden')) clearReverse(); })
    .observe(ui.hud, { attributes:true, attributeFilter:['class'] });
})();
