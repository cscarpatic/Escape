(() => {
  Game.prototype.updateCamera = function (dt) {
    const p = this.player;
    const desiredLook = 145 + clamp(Math.abs(p.speed), 0, 180) * .42;
    const look = Math.min(desiredLook, Math.max(78, H * .23));
    const tx = p.x + Math.cos(p.angle) * look;
    const ty = p.y + Math.sin(p.angle) * look;
    this.camera.x = lerp(this.camera.x, tx, 1 - Math.pow(.0009, dt));
    this.camera.y = lerp(this.camera.y, ty, 1 - Math.pow(.0009, dt));
    this.camera.shake *= Math.pow(.02, dt);
  };

  function drawTrafficAwareness(g) {
    if (!g || state === 'menu') return;
    const px = g.player.x, py = g.player.y;
    const fx = Math.cos(g.player.angle), fy = Math.sin(g.player.angle);

    for (const t of g.traffic) {
      const dx = t.x - px, dy = t.y - py;
      const distance = Math.hypot(dx, dy);
      if (distance > 560) continue;
      if (dx * fx + dy * fy < -90) continue;

      const s = worldToScreen(t.x, t.y);
      if (s.x < -70 || s.x > W + 70 || s.y < -70 || s.y > H + 70) continue;
      const stopped = Math.abs(t.speed) < 12;

      ctx.save();
      ctx.translate(s.x, s.y);
      const rotation = window.viewVehicleScreenAngle ? window.viewVehicleScreenAngle(t.angle) : t.angle + Math.PI / 2;
      ctx.rotate(rotation);

      ctx.strokeStyle = stopped ? 'rgba(255,105,118,.92)' : 'rgba(220,235,242,.70)';
      ctx.lineWidth = stopped ? 2.6 : 1.8;
      ctx.shadowBlur = stopped ? 20 : 10;
      ctx.shadowColor = stopped ? '#ff4057' : '#c9e7f2';
      roundRect(ctx, -t.width / 2 - 3, -t.length / 2 - 3, t.width + 6, t.length + 6, 8);
      ctx.stroke();

      const lampY = t.length * .5 + 1;
      ctx.fillStyle = stopped ? '#ff2d45' : '#ff5a66';
      ctx.shadowBlur = stopped ? 26 : 15;
      ctx.shadowColor = '#ff3048';
      ctx.fillRect(-t.width * .34, lampY - 3, 7, 4);
      ctx.fillRect(t.width * .34 - 7, lampY - 3, 7, 4);

      if (stopped) {
        ctx.globalAlpha = .22;
        const glow = ctx.createRadialGradient(0, lampY, 2, 0, lampY, 44);
        glow.addColorStop(0, 'rgba(255,50,70,.95)');
        glow.addColorStop(1, 'rgba(255,50,70,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();ctx.arc(0, lampY, 44, 0, Math.PI * 2);ctx.fill();
      }
      ctx.restore();
    }
  }

  const previousRender = render;
  render = function () {
    previousRender();
    if (game && state !== 'menu') drawTrafficAwareness(game);
  };

  const lightingScript = document.createElement('script');
  lightingScript.src = 'src/day-mode.js';
  lightingScript.defer = true;
  document.body.appendChild(lightingScript);
})();
