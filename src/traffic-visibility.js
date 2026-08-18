(() => {
  function drawTrafficAwareness(g) {
    if (!g || state === 'menu') return;
    const px = g.player.x, py = g.player.y;
    const fx = Math.cos(g.player.angle), fy = Math.sin(g.player.angle);

    for (const t of g.traffic) {
      const dx = t.x - px, dy = t.y - py;
      const distance = Math.hypot(dx, dy);
      if (distance > 520) continue;
      if (dx * fx + dy * fy < -90) continue;

      const s = worldToScreen(t.x, t.y);
      if (s.x < -70 || s.x > W + 70 || s.y < -70 || s.y > H + 70) continue;
      const stopped = Math.abs(t.speed) < 12;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(t.angle + Math.PI / 2);

      // Reflective outline that remains visible after the night mask.
      ctx.strokeStyle = stopped ? 'rgba(255,105,118,.88)' : 'rgba(210,225,234,.62)';
      ctx.lineWidth = stopped ? 2.4 : 1.6;
      ctx.shadowBlur = stopped ? 18 : 9;
      ctx.shadowColor = stopped ? '#ff4057' : '#c9e7f2';
      roundRect(ctx, -t.width / 2 - 3, -t.length / 2 - 3, t.width + 6, t.length + 6, 8);
      ctx.stroke();

      // Rear lamps: much brighter when a car is stopped at a red light.
      const lampY = t.length * .5 + 1;
      ctx.fillStyle = stopped ? '#ff2d45' : '#ff5a66';
      ctx.shadowBlur = stopped ? 24 : 14;
      ctx.shadowColor = '#ff3048';
      ctx.fillRect(-t.width * .34, lampY - 3, 7, 4);
      ctx.fillRect(t.width * .34 - 7, lampY - 3, 7, 4);

      if (stopped) {
        ctx.globalAlpha = .20;
        const glow = ctx.createRadialGradient(0, lampY, 2, 0, lampY, 42);
        glow.addColorStop(0, 'rgba(255,50,70,.95)');
        glow.addColorStop(1, 'rgba(255,50,70,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, lampY, 42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const previousRender = render;
  render = function () {
    previousRender();
    if (game && state !== 'menu') drawTrafficAwareness(game);
  };
})();
