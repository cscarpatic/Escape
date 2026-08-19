(() => {
  // Render two distinct front lamps and stronger rear lamps on every vehicle.
  // The player/getaway car therefore keeps two clearly readable red taillights at night.
  const baseDrawVehicle = drawVehicle;

  drawVehicle = function (car, palette, police = false) {
    baseDrawVehicle(car, palette, police);

    const s = worldToScreen(car.x, car.y);
    if (s.x < -120 || s.x > W + 120 || s.y < -120 || s.y > H + 120) return;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(window.viewVehicleScreenAngle(car.angle));

    const lampX = car.width * .31;
    const frontY = -car.length * .5 - 1;
    const rearY = car.length * .5 - 1;

    // Two separate headlights.
    ctx.shadowBlur = 11;
    ctx.shadowColor = 'rgba(235,252,255,.95)';
    ctx.fillStyle = '#f4fdff';
    for (const x of [-lampX, lampX]) {
      ctx.beginPath();
      ctx.ellipse(x, frontY, 3.3, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Two clearly visible rear lights, especially important on the getaway car.
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(255,38,55,.95)';
    ctx.fillStyle = '#ff2637';
    for (const x of [-lampX, lampX]) {
      ctx.beginPath();
      ctx.ellipse(x, rearY, 3.7, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };
})();
