(() => {
  // Render two distinct front lamps and stronger rear lamps on every vehicle.
  const baseDrawVehicle = drawVehicle;

  drawVehicle = function (car, palette, police = false) {
    baseDrawVehicle(car, palette, police);
    const s = worldToScreen(car.x, car.y);
    if (s.x < -120 || s.x > W + 120 || s.y < -120 || s.y > H + 120) return;
    ctx.save();ctx.translate(s.x, s.y);ctx.rotate(window.viewVehicleScreenAngle(car.angle));
    const lampX = car.width * .31, frontY = -car.length * .5 - 1, rearY = car.length * .5 - 1;
    ctx.shadowBlur = 11;ctx.shadowColor = 'rgba(235,252,255,.95)';ctx.fillStyle = '#f4fdff';
    for (const x of [-lampX, lampX]) {ctx.beginPath();ctx.ellipse(x, frontY, 3.3, 2.1, 0, 0, Math.PI * 2);ctx.fill();}
    ctx.shadowBlur = 14;ctx.shadowColor = 'rgba(255,38,55,.95)';ctx.fillStyle = '#ff2637';
    for (const x of [-lampX, lampX]) {ctx.beginPath();ctx.ellipse(x, rearY, 3.7, 2.4, 0, 0, Math.PI * 2);ctx.fill();}
    ctx.restore();
  };

  // Load the arcade gameplay/effects module only after every legacy override has loaded,
  // so police beacons and weapon rendering remain the final visual pass.
  addEventListener('load', () => {
    if (document.querySelector('script[data-arcade-weapons]')) return;
    const s=document.createElement('script');s.src='src/arcade-weapons-v1.js?v=20260819-1';s.dataset.arcadeWeapons='1';document.body.appendChild(s);
  }, {once:true});
})();
