(() => {
  const input = window.NightDriveInput = window.NightDriveInput || { steer:0 };
  const pathById = road => new Map((road?.paths || []).map(p => [p.id, p]));

  Object.assign(ENVIRONMENTS[0], { steerAssist: 2.05, laneAssist: 1.0, cornerAssist: 1.0 });
  Object.assign(ENVIRONMENTS[1], { steerAssist: 1.55, laneAssist: .88, cornerAssist: .92 });
  Object.assign(ENVIRONMENTS[2], { steerAssist: .92, laneAssist: .64, cornerAssist: .72 });
  Object.assign(ENVIRONMENTS[3], { steerAssist: .58, laneAssist: .46, cornerAssist: .54 });

  function orientedRoadAngle(info, carAngle) {
    let a = Math.atan2(info.ty, info.tx);
    if (Math.cos(angleWrap(a - carAngle)) < 0) a += Math.PI;
    return a;
  }

  function directionFromNode(path, nodeId) {
    if (!path?.points?.length) return null;
    if (path.nodeA === nodeId) {
      const a = path.points[0], b = path.points[Math.min(2, path.points.length - 1)];
      return { angle:Math.atan2(b.y-a.y,b.x-a.x), x:b.x, y:b.y };
    }
    if (path.nodeB === nodeId) {
      const n = path.points.length - 1;
      const a = path.points[n], b = path.points[Math.max(0, n - 2)];
      return { angle:Math.atan2(b.y-a.y,b.x-a.x), x:b.x, y:b.y };
    }
    return null;
  }

  function findAssistedTurn(g, info, steer) {
    const path = info.path;
    if (!path?.nodeA || !path?.nodeB || !g.road?.nodeMap || Math.abs(steer) < .16) return null;

    const rawAngle = Math.atan2(info.ty, info.tx);
    const fwdX = Math.cos(g.player.angle), fwdY = Math.sin(g.player.angle);
    const pathForward = fwdX * Math.cos(rawAngle) + fwdY * Math.sin(rawAngle) >= 0;
    const nodeId = pathForward ? path.nodeB : path.nodeA;
    const node = g.road.nodeMap.get(nodeId);
    if (!node?.edges?.length) return null;

    const distance = Math.hypot(g.player.x - node.x, g.player.y - node.y);
    const trigger = Math.max(155, (path.width || g.env.roadWidth) * 1.05);
    if (distance > trigger) return null;

    const byId = pathById(g.road);
    const desired = Math.sign(steer) * lerp(.42, 1.48, Math.min(1, Math.abs(steer)));
    let best = null;

    for (const edgeId of node.edges) {
      const candidate = byId.get(edgeId);
      if (!candidate || candidate.id === path.id || candidate.feature === 'roundabout') continue;
      const d = directionFromNode(candidate, nodeId);
      if (!d) continue;
      const rel = angleWrap(d.angle - g.player.angle);
      if (Math.abs(rel) > 2.35) continue;
      const wrongSide = Math.sign(rel) !== Math.sign(steer) && Math.abs(rel) > .18;
      const score = Math.abs(rel - desired) + (wrongSide ? 2.2 : 0) + (Math.abs(rel) < .18 ? .35 : 0);
      if (!best || score < best.score) best = { ...d, rel, score, node, distance, trigger, path:candidate };
    }
    return best;
  }

  const baseUpdatePlayer = Game.prototype.updatePlayer;
  Game.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const before = { x:p.x, y:p.y, distance:this.distance };
    baseUpdatePlayer.call(this, dt);

    if (p.speed > 0) {
      const travelled = Math.hypot(p.x - before.x, p.y - before.y);
      const alreadyCounted = Math.max(0, this.distance - before.distance);
      if (travelled > alreadyCounted) this.distance += travelled - alreadyCounted;
    }

    if (p._drift?.active || keys.has('Space') || Math.abs(p.speed) < 18) return;

    const keyboard = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
                     (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    const touchSteer = Math.sign(input.steer || 0) * Math.pow(Math.abs(input.steer || 0), 1.18);
    const steer = keyboard || touchSteer;
    const info = this.road.nearestInfo(p.x, p.y);
    if (!info?.path) return;

    const width = info.path.width || this.env.roadWidth;
    if (info.d > width * .72) return;

    const laneAssist = this.env.laneAssist || .5;
    const roadAngle = orientedRoadAngle(info, p.angle);
    const tx = Math.cos(roadAngle), ty = Math.sin(roadAngle);
    const nx = -ty, ny = tx;
    const crossTrack = (p.x - info.x) * nx + (p.y - info.y) * ny;
    const centreCorrection = clamp(-crossTrack / Math.max(42, width * .38), -1, 1) * .38;
    let targetAngle = roadAngle + centreCorrection;

    const turn = findAssistedTurn(this, info, steer);
    if (turn) {
      const proximity = 1 - clamp(turn.distance / turn.trigger, 0, 1);
      const turnIntent = clamp((Math.abs(steer) - .12) / .88, 0, 1);
      const blend = proximity * turnIntent * (this.env.cornerAssist || .7);
      targetAngle = angleLerp(targetAngle, turn.angle, clamp(.22 + blend * .70, 0, .92));

      if (Math.abs(turn.rel) > .55 && turn.distance < 118) {
        const safe = lerp(82, 118, clamp(turn.distance / 118, 0, 1));
        if (p.speed > safe) p.speed = lerp(p.speed, safe, Math.min(1, dt * 5.5));
      }
    }

    const manual = clamp(Math.abs(steer), 0, 1);
    const straighten = lerp(1.0, .25, manual);
    const assistRate = (this.env.steerAssist || .8) * laneAssist * straighten;
    p.angle = angleLerp(p.angle, targetAngle, clamp(dt * (2.2 + assistRate * 2.6), 0, .115));

    if (manual < .22 && Math.abs(crossTrack) > 3) {
      const pull = clamp(dt * laneAssist * 1.15, 0, .035) * clamp(Math.abs(p.speed) / 65, .25, 1);
      p.x -= nx * crossTrack * pull;
      p.y -= ny * crossTrack * pull;
    }
  };
})();
