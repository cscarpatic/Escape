(() => {
  // The HUD uses km/h = worldSpeed * 1.42. Therefore one world unit is
  // (1.42 / 3.6) real metres if distance and speed are to describe the same motion.
  const METERS_PER_UNIT = 1.42 / 3.6;
  window.NIGHT_HEIST_METERS_PER_UNIT = METERS_PER_UNIT;

  const proto = RoadNetwork.prototype;
  const wrapScale = name => {
    const base = proto[name];
    if (typeof base !== 'function' || base._realDistanceScaled) return;
    const wrapped = function (...args) {
      const original = this.env.escapeKm;
      this.env.escapeKm = original / METERS_PER_UNIT;
      try { return base.apply(this, args); }
      finally { this.env.escapeKm = original; }
    };
    wrapped._realDistanceScaled = true;
    proto[name] = wrapped;
  };

  // These methods calculate how many world units of road are generated.
  // Scale them so a 5.2 km objective contains at least 5.2 real kilometres of road.
  ['generateCity', 'generateIndustrial', 'generateRegional', 'buildBlockCity'].forEach(wrapScale);
})();
