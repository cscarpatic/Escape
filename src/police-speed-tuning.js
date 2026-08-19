(() => {
  // Pursuit difficulty comes from the number/position of patrols, not superhuman top speed.
  const COP_POWER = .62;
  const COP_TOP_SPEED = 126; // world units/s ~= 179 km/h with the HUD conversion.

  ENVIRONMENTS.forEach(env => { env.copPower = COP_POWER; });

  const baseUpdateCops = Game.prototype.updateCops;
  Game.prototype.updateCops = function(dt) {
    this.env.copPower = COP_POWER;

    // Prevent a patrol that was already accelerating from carrying an old high speed
    // into the newly softened pursuit model.
    for (const cop of this.cops || []) {
      if (cop.speed > COP_TOP_SPEED) {
        cop.speed = lerp(cop.speed, COP_TOP_SPEED, Math.min(1, dt * 5));
      }
    }

    baseUpdateCops.call(this, dt);

    for (const cop of this.cops || []) {
      cop.speed = Math.min(cop.speed, COP_TOP_SPEED);
    }
  };
})();
