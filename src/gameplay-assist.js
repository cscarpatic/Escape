(() => {
  // Easier early-game tuning and a softer, more forgiving driving model.
  Object.assign(ENVIRONMENTS[0], {
    difficulty: 'FACILE', roadWidth: 198, branchSpread: 220, curve: 72,
    traffic: 0.65, oncoming: 0.12, cops: 1, copPower: 0.78,
    visibility: 1.16, escapeKm: 5.2, heat: 0.30,
    startGap: 390, steerAssist: 1.15, offroadMax: 112,
  });
  Object.assign(ENVIRONMENTS[1], {
    difficulty: 'FACILE +', roadWidth: 174, branchSpread: 250, curve: 110,
    traffic: 0.82, oncoming: 0.22, cops: 2, copPower: 0.88,
    visibility: 1.07, escapeKm: 6.4, heat: 0.44,
    startGap: 320, steerAssist: 0.78, offroadMax: 105,
  });
  Object.assign(ENVIRONMENTS[2], {
    startGap: 265, steerAssist: 0.38, offroadMax: 98,
  });
  Object.assign(ENVIRONMENTS[3], {
    startGap: 225, steerAssist: 0.18, offroadMax: 94,
  });
  buildMenu();

  Game.prototype.spawnCops = function () {
    const gap = this.env.startGap || 240;
    for (let i = 0; i < this.env.cops; i++) {
      const c = new Car(
        (i - (this.env.cops - 1) / 2) * 46,
        this.player.y + gap + i * 58,
        -Math.PI / 2,
        'cop'
      );
      c.speed = 54 + i * 2;
      c.flash = i * 1.7;
      this.cops.push(c);
    }
  };

  Game.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const up = keys.has('ArrowUp') || keys.has('KeyW');
    const down = keys.has('ArrowDown') || keys.has('KeyS');
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const hand = keys.has('Space');
    const roadInfo = this.road.nearestInfo(p.x, p.y);
    const onRoad = roadInfo.d < this.env.roadWidth * .56;
    p.offroad = lerp(p.offroad, onRoad ? 0 : 1, Math.min(1, dt * 4));

    const accel = onRoad ? 100 : 62;
    const max = onRoad ? 184 : (this.env.offroadMax || 96);
    if (up) p.speed += accel * dt;
    else p.speed -= 24 * dt;
    if (down) p.speed -= (p.speed > 0 ? 128 : 50) * dt;
    if (hand) p.speed *= Math.pow(.82, dt * 8);
    p.speed = clamp(p.speed, -30, max);

    const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
    const steerStrength = (1.42 - clamp(Math.abs(p.speed) / 230, 0, .50)) * (hand ? 1.34 : 1);
    const steerResponse = 1 - Math.pow(.035, dt);
    p.steer = lerp(p.steer, steerInput, steerResponse);
    p.angle += p.steer * steerStrength * dt * (p.speed / 98);

    // Gentle road-centering on the first levels when the player is not steering.
    if (onRoad && Math.abs(steerInput) < .01 && p.speed > 34) {
      const roadAngle = Math.atan2(roadInfo.ty, roadInfo.tx);
      const assist = this.env.steerAssist || 0;
      p.angle = angleLerp(p.angle, roadAngle, clamp(dt * assist, 0, .045));
    }

    if (!onRoad) {
      // Off-road is still slower, but no longer feels like hitting glue.
      p.speed *= Math.pow(.62, dt);
      if (Math.abs(p.speed) > 48 && Math.random() < dt * 12) this.spawnDust(p.x, p.y);
    }

    const vx = Math.cos(p.angle) * p.speed;
    const vy = Math.sin(p.angle) * p.speed;
    p.x += vx * dt;
    p.y += vy * dt;
    this.distance += Math.max(0, -vy * dt);
    this.maxSpeed = Math.max(this.maxSpeed, Math.abs(p.speed) * 1.42);
    if (hand && Math.abs(p.speed) > 70 && Math.random() < dt * 24) {
      this.spawnSmoke(p.x - Math.cos(p.angle) * 24, p.y - Math.sin(p.angle) * 24);
    }
  };

  const baseUpdateHud = Game.prototype.updateHud;
  Game.prototype.updateHud = function (minCop) {
    baseUpdateHud.call(this, minCop);
    ui.copDistance.textContent = `POLIZIA PIÙ VICINA: ${Math.max(0, Math.round(minCop * .78))} m`;
  };

  function drawPoliceMarker(x, y, angle, distance, onScreen, index) {
    const pulse = .72 + .28 * Math.sin(performance.now() * .009 + index * 1.9);
    const flash = Math.sin(performance.now() * .018 + index * 2.3) > 0;
    const primary = flash ? '#2ea6ff' : '#ff3556';
    const secondary = flash ? '#ff3556' : '#2ea6ff';

    ctx.save();
    ctx.translate(x, y);
    if (!onScreen) ctx.rotate(angle);
    ctx.shadowBlur = 20;
    ctx.shadowColor = primary;
    ctx.lineWidth = 3;
    ctx.strokeStyle = primary;
    ctx.fillStyle = 'rgba(4,8,14,.78)';

    if (onScreen) {
      ctx.beginPath();
      ctx.arc(0, 0, 38 + pulse * 4, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = secondary;
      ctx.beginPath();
      ctx.arc(0, 0, 38 + pulse * 4, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 8;
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('POLIZIA', 0, -49);
      ctx.font = '800 8px system-ui, sans-serif';
      ctx.fillStyle = '#ffcfda';
      ctx.fillText(`${distance} m`, 0, 55);
    } else {
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -13);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, 13);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-angle);
      ctx.shadowBlur = 8;
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(`POLIZIA ${distance} m`, 0, -22);
    }
    ctx.restore();
  }

  function drawPoliceAwareness(g) {
    if (!g || state === 'menu') return;
    const playerScreen = worldToScreen(g.player.x, g.player.y);
    const edge = 74;
    const topSafe = 76;
    const bottomSafe = H - (document.body.classList.contains('touch-device') ? 120 : 65);

    g.cops.forEach((cop, index) => {
      const s = worldToScreen(cop.x, cop.y);
      const distance = Math.max(0, Math.round(dist2(cop, g.player) * .78));
      const onScreen = s.x > edge && s.x < W - edge && s.y > topSafe && s.y < bottomSafe;

      if (onScreen) {
        drawPoliceMarker(s.x, s.y, 0, distance, true, index);
        return;
      }

      const dx = s.x - playerScreen.x;
      const dy = s.y - playerScreen.y;
      const angle = Math.atan2(dy, dx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const maxX = Math.max(80, W / 2 - edge);
      const maxY = Math.max(80, (bottomSafe - topSafe) / 2 - 10);
      const scale = Math.min(
        maxX / Math.max(.001, Math.abs(cos)),
        maxY / Math.max(.001, Math.abs(sin))
      );
      const cx = W / 2;
      const cy = (topSafe + bottomSafe) / 2;
      const mx = clamp(cx + cos * scale, edge, W - edge);
      const my = clamp(cy + sin * scale, topSafe, bottomSafe);
      drawPoliceMarker(mx, my, angle, distance, false, index);
    });
  }

  const baseRender = render;
  render = function () {
    baseRender();
    if (game && state !== 'menu') drawPoliceAwareness(game);
  };
})();
