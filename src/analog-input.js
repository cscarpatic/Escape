(() => {
  const input = window.NightDriveInput = window.NightDriveInput || {};
  input.steer ??= 0;
  input.reverse ??= 0;
  input.vertical ??= 0;

  const joystick = document.getElementById('steeringJoystick');
  const knob = joystick?.querySelector('.joystick-knob');
  let pointerId = null;

  function shapedAxis(raw, dead=.10, exponent=1.45) {
    const a=Math.abs(raw);
    if(a<=dead)return 0;
    const mag=(a-dead)/(1-dead);
    return Math.sign(raw)*Math.pow(clamp(mag,0,1),exponent);
  }

  function setJoystickFromPointer(event) {
    if (!joystick || !knob) return;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * .36;
    let rawX = (event.clientX - cx) / radius;
    let rawY = (event.clientY - cy) / radius;
    const mag = Math.hypot(rawX,rawY);
    if(mag>1){ rawX/=mag; rawY/=mag; }

    input.steer = shapedAxis(rawX,.11,1.48);
    input.vertical = rawY;
    const reverseRaw = clamp((rawY-.28)/.72,0,1);
    input.reverse = Math.pow(reverseRaw,1.12);

    knob.style.transform = `translate(calc(-50% + ${rawX*radius}px), calc(-50% + ${rawY*radius}px))`;
    joystick.classList.toggle('is-active', Math.abs(input.steer)>.02 || input.reverse>.02);
    joystick.classList.toggle('is-reverse', input.reverse>.08);
    joystick.setAttribute('aria-valuenow',String(Math.round(input.steer*100)));
    joystick.setAttribute('aria-valuetext',input.reverse>.08 ? `Retromarcia ${Math.round(input.reverse*100)}%, sterzo ${Math.round(input.steer*100)}%` : `Sterzo ${Math.round(input.steer*100)}%`);
  }

  function resetJoystick() {
    pointerId = null;
    input.steer = 0;
    input.reverse = 0;
    input.vertical = 0;
    if (knob) knob.style.transform = 'translate(-50%,-50%)';
    joystick?.classList.remove('is-active','is-reverse');
    joystick?.setAttribute('aria-valuenow','0');
    joystick?.setAttribute('aria-valuetext','Sterzo 0%');
  }

  if (joystick) {
    joystick.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || state !== 'playing') return;
      event.preventDefault();
      pointerId = event.pointerId;
      joystick.setPointerCapture?.(event.pointerId);
      setJoystickFromPointer(event);
      navigator.vibrate?.(7);
    }, { passive:false });
    joystick.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      setJoystickFromPointer(event);
    }, { passive:false });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => joystick.addEventListener(type, event => {
      if (pointerId !== null && event.pointerId !== pointerId) return;
      event.preventDefault();
      resetJoystick();
    }, { passive:false }));
  }

  window.addEventListener('blur', resetJoystick);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetJoystick(); });

  Game.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const up = keys.has('ArrowUp') || keys.has('KeyW');
    const brake = keys.has('ArrowDown') || keys.has('KeyS');
    const keyReverse = keys.has('KeyZ');
    const reversePower = keyReverse ? 1 : clamp(input.reverse || 0,0,1);
    const reverse = reversePower > .06;
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const hand = keys.has('Space');
    const keyboardSteer = (right ? 1 : 0) - (left ? 1 : 0);
    const steerInput = keyboardSteer || input.steer || 0;

    const roadInfo = this.road.nearestInfo(p.x, p.y);
    const roadWidth = roadInfo.path?.width || this.env.roadWidth;
    const onRoad = roadInfo.d < roadWidth * .56;
    p.offroad = lerp(p.offroad, onRoad ? 0 : 1, Math.min(1, dt * 4));

    const accel = onRoad ? 100 : 62;
    const max = onRoad ? 184 : (this.env.offroadMax || 96);

    if (reverse) {
      if (p.speed > 1.5) {
        p.speed = Math.max(0, p.speed - lerp(125,205,reversePower) * dt);
      } else {
        p.speed -= lerp(42,92,reversePower) * dt;
      }
    } else {
      if (up) p.speed += accel * dt;
      else if (p.speed > 0) p.speed = Math.max(0, p.speed - 24 * dt);
      else if (p.speed < 0) p.speed = Math.min(0, p.speed + 30 * dt);

      if (brake) {
        if (p.speed > 0) p.speed = Math.max(0, p.speed - 145 * dt);
        else if (p.speed < 0) p.speed = Math.min(0, p.speed + 105 * dt);
      }
    }

    if (hand) p.speed *= Math.pow(.82, dt * 8);
    const reverseLimit = -lerp(22,52,reversePower);
    p.speed = clamp(p.speed, reverse ? reverseLimit : -20, max);

    const steerStrength = (1.30 - clamp(Math.abs(p.speed) / 245, 0, .46)) * (hand ? 1.36 : 1);
    const steerResponse = 1 - Math.pow(.07, dt);
    p.steer = lerp(p.steer, steerInput, steerResponse);
    p.angle += p.steer * steerStrength * dt * (p.speed / 100);

    if (onRoad && Math.abs(steerInput) < .025 && p.speed > 34) {
      let roadAngle = Math.atan2(roadInfo.ty, roadInfo.tx);
      if (Math.cos(angleWrap(roadAngle - p.angle)) < 0) roadAngle += Math.PI;
      p.angle = angleLerp(p.angle, roadAngle, clamp(dt * (this.env.steerAssist || 0), 0, .04));
    }

    if (!onRoad) {
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
})();