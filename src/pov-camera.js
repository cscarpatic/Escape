(() => {
  Game.prototype.updateCamera = function (dt) {
    const p = this.player;
    // Keep the player in a stable lower-screen position on phones and tablets.
    const desiredLook = 145 + clamp(Math.abs(p.speed), 0, 180) * .42;
    const look = Math.min(desiredLook, Math.max(78, H * .23));
    const tx = p.x + Math.cos(p.angle) * look;
    const ty = p.y + Math.sin(p.angle) * look;
    this.camera.x = lerp(this.camera.x, tx, 1 - Math.pow(.0009, dt));
    this.camera.y = lerp(this.camera.y, ty, 1 - Math.pow(.0009, dt));
    this.camera.shake *= Math.pow(.02, dt);
  };
})();
