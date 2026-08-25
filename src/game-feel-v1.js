(() => {
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const RUN_TUNING = [
    { km:4.8, cops:1, near:106, far:142, label:'FUGA RAPIDA' },
    { km:5.6, cops:2, near:110, far:146, label:'PRESSIONE MEDIA' },
    { km:6.3, cops:3, near:113, far:151, label:'TECNICA' },
    { km:7.0, cops:4, near:116, far:156, label:'ALTA PRESSIONE' },
  ];

  ENVIRONMENTS.forEach((env, index) => {
    const tuning = RUN_TUNING[index] || RUN_TUNING[RUN_TUNING.length - 1];
    env.escapeKm = tuning.km;
    env.cops = tuning.cops;
    env.runTuning = tuning;
  });
  if (typeof buildMenu === 'function') buildMenu();

  const baseHandleCollisions = Game.prototype.handleCollisions;
  Game.prototype.handleCollisions = function() {
    const before = this.hitCooldown || 0;
    baseHandleCollisions.call(this);
    if ((this.hitCooldown || 0) > before + .2) {
      this._recoveryGrace = 1.05;
      this.catch = Math.min(this.catch || 0, .04);
    }
  };

  const baseGameState = Game.prototype.updateGameState;
  Game.prototype.updateGameState = function(dt) {
    if ((this._recoveryGrace || 0) > 0) {
      this._recoveryGrace = Math.max(0, this._recoveryGrace - dt);
      this.catch = 0;
    }
    baseGameState.call(this, dt);
    if ((this._recoveryGrace || 0) > 0 && !this.finished) {
      this.catch = Math.min(this.catch || 0, .06);
    }
  };

  const baseUpdateCops = Game.prototype.updateCops;
  Game.prototype.updateCops = function(dt) {
    const before = new Map((this.cops || []).map(c => [c, { x:c.x, y:c.y }]));
    baseUpdateCops.call(this, dt);
    if (this.finished || !(this.cops || []).length) return;

    const tuning = this.env.runTuning || RUN_TUNING[ENVIRONMENTS.indexOf(this.env)] || RUN_TUNING[1];
    const exit = this._escapeExit || window.NightHeistExitPoint;
    const exitMeters = exit ? Math.hypot(this.player.x - exit.x, this.player.y - exit.y) * METERS_PER_UNIT : Infinity;
    const finishPressure = exitMeters < 900 ? (1 - clamp(exitMeters / 900, 0, 1)) * 5 : 0;
    const recovery = (this._recoveryGrace || 0) > 0;

    for (const cop of this.cops || []) {
      const prev = before.get(cop);
      if (!prev || cop._weaponDisabled > 0) continue;

      const moved = Math.hypot(cop.x - prev.x, cop.y - prev.y);
      const currentMotion = dt > .0001 ? moved / dt : Math.max(0, cop.speed || 0);
      const distance = Math.hypot(cop.x - this.player.x, cop.y - this.player.y);
      const catchup = clamp((distance - 80) / 620, 0, 1);
      let desired = lerp(tuning.near, tuning.far, catchup) + finishPressure;

      // After a traffic impact, the player gets a short readable recovery window instead
      // of being captured because a cop happened to overlap the crash animation.
      if (recovery) desired *= .80;

      // Cops remain slower than the player's maximum speed; they win through lines, traffic
      // and mistakes rather than invisible rubber-banding.
      desired = Math.min(tuning.far + 6, desired);
      const extraSpeed = Math.max(0, desired - currentMotion);
      const extraMove = Math.min(extraSpeed * dt, 2.7);
      if (extraMove > 0) {
        cop.x += Math.cos(cop.angle) * extraMove;
        cop.y += Math.sin(cop.angle) * extraMove;
      }
      cop.speed = Math.max(cop.speed || 0, desired);
    }
  };

  const baseStartGame = typeof startGame === 'function' ? startGame : null;
  // Existing button listeners keep their original startGame reference, so this block is only
  // useful for callers that invoke startGame after this script. Per-run setup also happens lazily.
  if (baseStartGame) {
    startGame = function() {
      baseStartGame();
      if (game) game._feelRunStarted = performance.now();
    };
  }

  const baseUpdate = Game.prototype.update;
  Game.prototype.update = function(dt) {
    if (!this._feelRunStarted) this._feelRunStarted = performance.now();
    baseUpdate.call(this, dt);
  };

  window.NightHeistGameFeel = 'v1-short-runs-recovery-pressure';
})();
