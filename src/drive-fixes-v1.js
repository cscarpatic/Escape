(() => {
  const input = window.NightDriveInput = window.NightDriveInput || {};
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const baseUpdatePlayer = Game.prototype.updatePlayer;

  function byId(road) {
    if (!road._driveFixPathMap || road._driveFixPathMapSize !== road.paths.length) {
      road._driveFixPathMap = new Map((road.paths || []).map(p => [p.id, p]));
      road._driveFixPathMapSize = road.paths.length;
    }
    return road._driveFixPathMap;
  }

  function directionFromNode(path, nodeId) {
    if (!path?.points?.length) return null;
    if (path.nodeA === nodeId) {
      const a = path.points[0], b = path.points[Math.min(2, path.points.length - 1)];
      return Math.atan2(b.y - a.y, b.x - a.x);
    }
    if (path.nodeB === nodeId) {
      const n = path.points.length - 1;
      const a = path.points[n], b = path.points[Math.max(0, n - 2)];
      return Math.atan2(b.y - a.y, b.x - a.x);
    }
    return null;
  }

  function roundaboutAt(g, car) {
    if (g.env.propMode !== 'city' || !g.road.roundabouts?.length) return null;
    let best = null, bestD = Infinity;
    for (const rb of g.road.roundabouts) {
      const d = Math.hypot(car.x - rb.x, car.y - rb.y);
      if (d < rb.radius + 185 && d < bestD) { best = rb; bestD = d; }
    }
    return best ? { rb:best, d:bestD } : null;
  }

  function nodeIdForSide(rb, side) { return `CRA${rb.r}_${rb.c}_${side}`; }

  function closestEntrySide(rb, p) {
    const sides = [
      ['N', rb.x, rb.y - rb.radius], ['E', rb.x + rb.radius, rb.y],
      ['S', rb.x, rb.y + rb.radius], ['W', rb.x - rb.radius, rb.y]
    ];
    sides.sort((a,b) => Math.hypot(p.x-a[1],p.y-a[2]) - Math.hypot(p.x-b[1],p.y-b[2]));
    return sides[0][0];
  }

  function externalExit(g, rb, side, incomingPath) {
    const nodeId = nodeIdForSide(rb, side);
    const node = g.road.nodeMap?.get(nodeId);
    if (!node) return null;
    const map = byId(g.road);
    for (const id of node.edges || []) {
      const path = map.get(id);
      if (!path || path === incomingPath || path.feature === 'roundabout' || path.kind === 'service') continue;
      const angle = directionFromNode(path, nodeId);
      if (angle !== null) return { side, nodeId, path, angle };
    }
    return null;
  }

  function chooseExit(g, rb, entrySide, incomingPath) {
    const intent = g.player._roadAssist?.intent;
    const raw = input.steer || 0;
    const dir = Math.abs(raw) > .07 ? Math.sign(raw) : (intent?.dir || 0);
    const strength = Math.max(Math.abs(raw), intent?.strength || 0);
    const exits = ['N','E','S','W']
      .filter(s => s !== entrySide)
      .map(s => externalExit(g, rb, s, incomingPath))
      .filter(Boolean)
      .map(e => ({...e, rel:angleWrap(e.angle - g.player.angle)}));
    if (!exits.length) return null;

    if (dir) {
      const side = exits.filter(e => Math.sign(e.rel) === dir && Math.abs(e.rel) > .30);
      if (side.length) {
        const desired = lerp(.70, 1.55, clamp(strength, 0, 1));
        side.sort((a,b) => Math.abs(Math.abs(a.rel)-desired) - Math.abs(Math.abs(b.rel)-desired));
        return side[0];
      }
    }
    exits.sort((a,b) => Math.abs(a.rel) - Math.abs(b.rel));
    return exits[0];
  }

  function buildRoundaboutState(g, rb, incomingPath) {
    const entrySide = closestEntrySide(rb, g.player);
    const exit = chooseExit(g, rb, entrySide, incomingPath);
    if (!exit) return null;
    const entryAngles = {E:0,S:Math.PI/2,W:Math.PI,N:Math.PI*1.5};
    const start = entryAngles[entrySide];
    const finish = entryAngles[exit.side];
    const clockwiseTravel = ((finish - start) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
    return {
      rb, entrySide, exit, startAngle:start, targetTravel:clockwiseTravel,
      lastRadial:start, accumulated:0, onRing:false, exiting:false,
      startedAt:performance.now()
    };
  }

  function updateRoundabout(g, state, dt) {
    const p = g.player, rb = state.rb;
    const dx = p.x - rb.x, dy = p.y - rb.y;
    const radial = Math.atan2(dy, dx);
    const d = Math.hypot(dx,dy) || 1;

    if (!state.onRing) {
      const entryX = rb.x + Math.cos(state.startAngle) * rb.radius;
      const entryY = rb.y + Math.sin(state.startAngle) * rb.radius;
      const targetAngle = Math.atan2(entryY-p.y, entryX-p.x);
      p.angle = angleLerp(p.angle, targetAngle, clamp(dt*5.8,0,.14));
      if (Math.abs(d-rb.radius) < 30) {
        state.onRing = true;
        state.lastRadial = radial;
      }
      return true;
    }

    if (!state.exiting) {
      let delta = radial - state.lastRadial;
      while (delta < -Math.PI) delta += Math.PI*2;
      while (delta > Math.PI) delta -= Math.PI*2;
      if (delta > 0) state.accumulated += delta;
      state.lastRadial = radial;

      const tangent = radial + Math.PI/2; // follows the actual clockwise roundabout arcs
      p.angle = angleLerp(p.angle, tangent, clamp(dt*7.2,0,.18));

      // Radial-only correction: stay on the asphalt ring without being pulled toward the island.
      const radialError = d - rb.radius;
      const pull = clamp(dt*4.2,0,.10);
      p.x -= Math.cos(radial) * radialError * pull;
      p.y -= Math.sin(radial) * radialError * pull;
      if (p.speed > 78) p.speed = lerp(p.speed, 78, Math.min(1,dt*5));

      if (state.accumulated >= state.targetTravel - .18) state.exiting = true;
      return true;
    }

    const exitNode = g.road.nodeMap?.get(state.exit.nodeId);
    if (!exitNode) return false;
    const outward = state.exit.angle;
    const targetX = exitNode.x + Math.cos(outward) * 145;
    const targetY = exitNode.y + Math.sin(outward) * 145;
    const desired = Math.atan2(targetY-p.y,targetX-p.x);
    p.angle = angleLerp(p.angle, desired, clamp(dt*6.8,0,.17));

    if (Math.hypot(p.x-rb.x,p.y-rb.y) > rb.radius + 105) {
      if (p._roadAssist) {
        p._roadAssist.route = null;
        p._roadAssist.intent = null;
      }
      return false;
    }
    return true;
  }

  Game.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const before = {x:p.x,y:p.y,angle:p.angle,speed:p.speed,distance:this.distance};
    baseUpdatePlayer.call(this, dt);

    // Correct the old unit mismatch. This integrates actual forward speed in real metres,
    // so 5.2 km now agrees with the km/h shown on screen.
    const avgForward = Math.max(0, (Math.max(0,before.speed) + Math.max(0,p.speed)) * .5);
    const reversing = (input.reverse || 0) > .05 || keys.has('KeyZ');
    this.distance = before.distance + (reversing ? 0 : avgForward * dt * METERS_PER_UNIT);

    if (p._drift?.active || keys.has('Space') || reversing) {
      p._assistSmoothAngle = p.angle;
      p._roundaboutFix = null;
      return;
    }

    const near = roundaboutAt(this,p);
    if (near && !p._roundaboutFix && near.d < near.rb.radius + 120) {
      const incoming = this.road.nearestInfo(before.x,before.y)?.path;
      p._roundaboutFix = buildRoundaboutState(this,near.rb,incoming);
    }
    if (p._roundaboutFix) {
      if (!updateRoundabout(this,p._roundaboutFix,dt)) p._roundaboutFix = null;
      p._assistSmoothAngle = p.angle;
      return;
    }

    // Smooth only the assistant correction. The car still reacts immediately to the joystick,
    // but abrupt nearest-path changes at junctions no longer create visible micro-snaps.
    if (p._assistSmoothAngle === undefined) p._assistSmoothAngle = before.angle;
    const wanted = p.angle;
    const alpha = 1 - Math.exp(-dt * 11.5);
    p._assistSmoothAngle = angleLerp(p._assistSmoothAngle, wanted, alpha);
    p.angle = p._assistSmoothAngle;

    // Limit impossible one-frame position jumps caused by a path switch at an intersection.
    const dx = p.x-before.x, dy=p.y-before.y, moved=Math.hypot(dx,dy);
    const plausible = (Math.max(Math.abs(before.speed),Math.abs(p.speed)) + 50) * dt * 1.18 + .8;
    if (moved > plausible && moved > .001) {
      const k = plausible / moved;
      p.x = before.x + dx*k;
      p.y = before.y + dy*k;
    }
  };
})();
