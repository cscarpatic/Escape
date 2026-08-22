(() => {
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const EXIT_RADIUS_METERS = 78;
  const EXIT_RADIUS_WORLD = EXIT_RADIUS_METERS / METERS_PER_UNIT;
  const START_Y = 130;
  const GREEN = '#73ff9d';

  const objectiveLabel = document.querySelector('.objective-label');
  const radar = document.getElementById('policeRadar');
  const radarLabel = document.querySelector('.police-radar-label');
  const escapeRemaining = document.getElementById('escapeRemaining');
  const escapeSafety = document.getElementById('escapeSafety');

  const legend = document.querySelector('.hud-bottom-left');
  if (legend && !legend.querySelector('[data-exit-legend]')) {
    const item = document.createElement('div');
    item.className = 'mini-legend';
    item.dataset.exitLegend = '1';
    item.innerHTML = '<span class="dot" style="background:#73ff9d;box-shadow:0 0 10px #73ff9d"></span> USCITA';
    legend.appendChild(item);
  }

  function fmtDistance(meters) {
    if (!Number.isFinite(meters)) return '--';
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
    return `${Math.max(0, Math.round(meters))} m`;
  }

  function pathPenalty(path) {
    if (!path || path.closed) return 100000;
    let score = 0;
    if (path.kind === 'service') score += 4200;
    if (path.feature === 'roundabout') score += 2800;
    if (path.feature === 'elevated-ramp') score += 1700;
    if (path.kind === 'highway') score -= 260;
    else if (path.kind === 'state') score -= 130;
    return score;
  }

  function ensureExit(g) {
    if (!g?.player || !g.road) return null;
    if (g._escapeExit) return g._escapeExit;

    const targetWorld = Math.max(1, (g.env.escapeKm || 1) * 1000 / METERS_PER_UNIT);
    const desiredY = START_Y - targetWorld;
    let best = null;
    let bestScore = Infinity;

    for (const path of g.road.paths || []) {
      if (!path?.points?.length || path.closed) continue;
      const penalty = pathPenalty(path);
      for (let i = 0; i < path.points.length; i++) {
        const point = path.points[i];
        const forward = START_Y - point.y;
        if (forward < targetWorld * .72) continue;

        const prev = path.points[Math.max(0, i - 1)];
        const next = path.points[Math.min(path.points.length - 1, i + 1)];
        const dx = next.x - prev.x, dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const score = Math.abs(point.y - desiredY) + penalty + Math.abs(point.x) * .012;
        if (score < bestScore) {
          bestScore = score;
          best = { x:point.x, y:point.y, tx:dx / len, ty:dy / len, path };
        }
      }
    }

    if (!best) {
      const points = (g.road.paths || []).flatMap(path => (path.points || []).map(point => ({ point, path })));
      points.sort((a, b) => a.point.y - b.point.y);
      const fallback = points[0];
      if (!fallback) return null;
      best = { x:fallback.point.x, y:fallback.point.y, tx:0, ty:-1, path:fallback.path };
    }

    best.radius = EXIT_RADIUS_WORLD;
    best.radiusMeters = EXIT_RADIUS_METERS;
    best.id = `${g.env.id || 'run'}-escape`;
    g._escapeExit = best;
    window.NightHeistExitPoint = best;
    return best;
  }

  function exitMeters(g) {
    const exit = ensureExit(g);
    if (!exit) return Infinity;
    return Math.hypot(g.player.x - exit.x, g.player.y - exit.y) * METERS_PER_UNIT;
  }

  function syncStaticCopy() {
    document.querySelectorAll('.guide-rule--goal em').forEach(el => {
      el.textContent = 'raggiungi USCITA verde indicata sulla mappa';
    });
    if (objectiveLabel) objectiveLabel.textContent = 'RAGGIUNGI L’USCITA VERDE';
  }
  syncStaticCopy();

  const baseUpdate = Game.prototype.update;
  Game.prototype.update = function(dt) {
    ensureExit(this);
    if (!this._exitIntroShown && state === 'playing') {
      this._exitIntroShown = true;
      toast('OBIETTIVO · RAGGIUNGI IL SIMBOLO VERDE “USCITA” SULLA MAPPA');
    }
    baseUpdate.call(this, dt);
    if (this.finished) return;

    const meters = exitMeters(this);
    if (escapeRemaining) escapeRemaining.textContent = `USCITA · ${fmtDistance(meters)}`;
    if (escapeSafety) escapeSafety.textContent = meters < 300
      ? 'ENTRA NEL CERCHIO VERDE'
      : 'SEGUI IL SIMBOLO VERDE SULLA MAPPA';

    if (meters <= EXIT_RADIUS_METERS) {
      this._exitReached = true;
      this.end(true);
    }
  };

  const baseEnd = Game.prototype.end;
  Game.prototype.end = function(win) {
    if (!win) return baseEnd.call(this, false);
    const meters = exitMeters(this);
    if (meters > EXIT_RADIUS_METERS) {
      if (!this._exitGoalAnnounced) {
        this._exitGoalAnnounced = true;
        toast(`DISTANZA COMPLETATA · ORA RAGGIUNGI L’USCITA VERDE (${fmtDistance(meters)})`);
      }
      return;
    }
    this._exitReached = true;
    return baseEnd.call(this, true);
  };

  const baseHud = Game.prototype.updateHud;
  Game.prototype.updateHud = function(minCop) {
    baseHud.call(this, minCop);
    const meters = exitMeters(this);
    const target = Math.max(1, (this.env.escapeKm || 1) * 1000);
    const travelPct = clamp(this.distance / target, 0, 1);
    const nearExit = meters < 700;

    if (objectiveLabel) objectiveLabel.textContent = nearExit ? 'USCITA DAVANTI' : 'RAGGIUNGI L’USCITA VERDE';
    if (ui.objective) ui.objective.textContent = `USCITA · ${fmtDistance(meters)}`;
    if (ui.progress) ui.progress.style.width = `${Math.min(98, travelPct * 98).toFixed(1)}%`;
  };

  function drawWorldExit(g) {
    const exit = ensureExit(g);
    if (!exit || state === 'menu' || state === 'result') return;
    const meters = exitMeters(g);
    if (meters > 950) return;

    const s = worldToScreen(exit.x, exit.y);
    const pulse = .5 + .5 * Math.sin(performance.now() * .0065);
    const onScreen = s.x > -120 && s.x < W + 120 && s.y > -140 && s.y < H + 140;
    if (!onScreen) return;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 22 + pulse * 14;
    ctx.strokeStyle = `rgba(115,255,157,${.65 + pulse * .25})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 34 + pulse * 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 58 + pulse * 13, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(115,255,157,.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 30 + pulse * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(17, 0);
    ctx.lineTo(0, 19);
    ctx.lineTo(-17, 0);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#eaffef';
    ctx.shadowColor = 'rgba(0,0,0,.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(`USCITA · ${fmtDistance(meters)}`, 0, -54 - pulse * 6);
    ctx.restore();
  }

  function radarLocalPoint(g, x, y, scale, cx, cy) {
    const dx = x - g.player.x, dy = y - g.player.y, a = g.player.angle;
    const right = dx * (-Math.sin(a)) + dy * Math.cos(a);
    const forward = dx * Math.cos(a) + dy * Math.sin(a);
    return { x:cx + right * scale, y:cy - forward * scale };
  }

  function drawRadarExit(g) {
    if (!radar || radar.classList.contains('hidden') || !g) return;
    const exit = ensureExit(g);
    if (!exit) return;

    const rect = radar.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rctx = radar.getContext('2d');
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = rect.width / 2, cy = rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2 - 4;
    const rangeWorld = 800 / METERS_PER_UNIT;
    const scale = (radius - 11) / rangeWorld;
    const meters = exitMeters(g);
    let q = radarLocalPoint(g, exit.x, exit.y, scale, cx, cy);
    const sx = q.x - cx, sy = q.y - cy;
    const screenDist = Math.hypot(sx, sy);
    const edge = radius - 14;
    const outside = screenDist > edge;
    if (outside && screenDist > .001) q = { x:cx + sx / screenDist * edge, y:cy + sy / screenDist * edge };

    const pulse = .5 + .5 * Math.sin(performance.now() * .009);
    rctx.save();
    rctx.translate(q.x, q.y);
    if (outside) rctx.rotate(Math.atan2(sy, sx) + Math.PI / 2);
    rctx.shadowColor = GREEN;
    rctx.shadowBlur = 14 + pulse * 9;
    rctx.fillStyle = GREEN;
    rctx.strokeStyle = '#eaffef';
    rctx.lineWidth = 1.3;

    if (outside) {
      rctx.beginPath();
      rctx.moveTo(0, -10 - pulse * 2);
      rctx.lineTo(8, 7);
      rctx.lineTo(0, 4);
      rctx.lineTo(-8, 7);
      rctx.closePath();
    } else {
      rctx.beginPath();
      rctx.moveTo(0, -8 - pulse * 2);
      rctx.lineTo(8 + pulse, 0);
      rctx.lineTo(0, 8 + pulse * 2);
      rctx.lineTo(-8 - pulse, 0);
      rctx.closePath();
    }
    rctx.fill();
    rctx.stroke();
    rctx.restore();

    if (radarLabel) {
      const threat = window.NightHeistThreat || 0;
      radarLabel.textContent = threat > .45
        ? `USCITA ${fmtDistance(meters)} · POLIZIA VICINA`
        : `MAPPA FUGA · USCITA ${fmtDistance(meters)}`;
      radarLabel.style.color = threat > .45 ? '' : GREEN;
    }
    radar.setAttribute('aria-label', `Radar di fuga. Uscita a ${fmtDistance(meters)}. Il simbolo verde indica la destinazione.`);
  }

  const baseRender = render;
  render = function() {
    baseRender();
    if (!game) return;
    drawWorldExit(game);
    drawRadarExit(game);
  };

  window.NightHeistEnsureExit = ensureExit;
})();
