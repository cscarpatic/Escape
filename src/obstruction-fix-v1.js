(() => {
  function nearestOpenOnPath(path, x, y, best) {
    if (!path?.points?.length || path.closed) return best;
    const pts = path.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / len2, 0, 1);
      const px = a.x + vx * t, py = a.y + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best.d) {
        const len = Math.sqrt(len2);
        best = { d, x:px, y:py, tx:vx / len, ty:vy / len, path };
      }
    }
    return best;
  }

  const baseNearestInfo = RoadNetwork.prototype.nearestInfo;
  if (typeof baseNearestInfo === 'function' && !baseNearestInfo._openRoadFallback) {
    const wrappedNearestInfo = function(x, y) {
      const primary = baseNearestInfo.call(this, x, y);
      if (!primary?.path?.closed) return primary;

      let best = { d:Infinity, x, y, tx:0, ty:-1, path:null };
      const nearby = this.nearbyPaths?.(y, 620) || this.paths || [];
      for (const path of nearby) best = nearestOpenOnPath(path, x, y, best);

      const primaryWidth = primary.path?.width || this.env?.roadWidth || 150;
      // Prefer an open road whenever it is plausibly the road under the car. This specifically
      // fixes intersections where a closed crossing was a few pixels closer than the open lane.
      if (best.path && best.d < primaryWidth * .82) return best;
      return primary;
    };
    wrappedNearestInfo._openRoadFallback = true;
    RoadNetwork.prototype.nearestInfo = wrappedNearestInfo;
  }

  function vehicleLevel(vehicle) {
    if (!vehicle) return 0;
    if (Number.isFinite(vehicle._roadLevel)) return vehicle._roadLevel;
    if (Number.isFinite(vehicle.path?.level)) return vehicle.path.level;
    return 0;
  }

  function sameRoadLevel(player, traffic) {
    const a = vehicleLevel(player), b = vehicleLevel(traffic);
    if (a === b) return true;
    // Ramps can visually overlap both levels while transitioning, so only allow collisions
    // there when the player is explicitly on a ramp too.
    const playerRamp = player?._onRamp || player?._roadFeature === 'elevated-ramp';
    const trafficRamp = traffic?.path?.feature === 'elevated-ramp';
    return !!(playerRamp && trafficRamp);
  }

  Game.prototype.handleCollisions = function() {
    const p = this.player;
    if (!p) return;

    if (this.hitCooldown <= 0) {
      let hit = null;
      let hitDist = Infinity;

      for (const t of this.traffic || []) {
        if (!sameRoadLevel(p, t)) continue;
        const dx = p.x - t.x, dy = p.y - t.y;
        if (Math.abs(dx) > 72 || Math.abs(dy) > 72) continue;
        const d = Math.hypot(dx, dy);
        const radius = clamp(((p.width || 28) + (t.width || 28)) * .52, 27, 38);
        if (d < radius && d < hitDist) {
          hit = t;
          hitDist = d;
        }
      }

      if (hit) {
        this.hitCooldown = .92;
        this._recoveryGrace = Math.max(this._recoveryGrace || 0, 1.05);
        this.catch = Math.min(this.catch || 0, .04);

        // A collision should cost momentum, but never glue the player to the other vehicle.
        const incoming = Math.abs(p.speed || 0);
        p.speed *= incoming > 95 ? .70 : .82;
        if (Math.abs(p.speed) < 24 && incoming > 36) p.speed = Math.sign(p.speed || 1) * 24;

        let dx = p.x - hit.x, dy = p.y - hit.y;
        let d = Math.hypot(dx, dy);
        if (d < .001) {
          dx = -Math.sin(p.angle);
          dy = Math.cos(p.angle);
          d = 1;
        }
        const nx = dx / d, ny = dy / d;
        const separation = clamp(44 - d, 14, 28);
        p.x += nx * separation;
        p.y += ny * separation;

        // Small forward nudge prevents the next frame from re-entering the same overlap zone.
        const forward = Math.sign(p.speed || 1) * 6;
        p.x += Math.cos(p.angle) * forward;
        p.y += Math.sin(p.angle) * forward;

        this.camera.shake = Math.max(this.camera.shake, 9);
        this.heat = clamp(this.heat + .06, 0, 1);
        this.spawnSparks?.((p.x + hit.x) / 2, (p.y + hit.y) / 2, 12);
        audio.hit?.();
      }
    }

    for (const t of this.traffic || []) {
      if (t.direction > 0 && !t.overtaken && p.y < t.y - 55) {
        t.overtaken = true;
        this.overtakes++;
      }
    }
  };

  window.NightHeistObstructionFix = 'v1-open-road-level-aware-collision';
})();
