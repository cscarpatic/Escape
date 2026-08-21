(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{steer:0,throttle:0,reverse:0};
  const manualUpdatePlayer=Game.prototype.updatePlayer;
  const METERS_PER_UNIT=window.NIGHT_HEIST_METERS_PER_UNIT||(1.42/3.6);
  const DRIFT_CODES=['ShiftLeft','ShiftRight','KeyX'];

  function isAssist(){return window.NightDriveMode!=='manual';}
  function requestedSteer(){
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const keyboard=(right?1:0)-(left?1:0);
    return clamp(keyboard||input.steer||0,-1,1);
  }
  function driftHeld(){return DRIFT_CODES.some(code=>keys.has(code));}

  Game.prototype.updatePlayer=function(dt){
    if(!isAssist())return manualUpdatePlayer.call(this,dt);

    const p=this.player;
    if(!p)return;

    // ASSIST FREE DRIVE: this path intentionally does not call nearestInfo(), route assist,
    // lane assist, branch selection or any road-centering code. Roads are scenery/navigation
    // only. The car keeps its current heading until the player explicitly steers.
    if(p._roadAssist){p._roadAssist.route=null;p._roadAssist.intent=null;}
    if(p._drift){p._drift.active=false;p._drift.hold=0;p._drift.dir=0;}
    p._activeRampId=null;
    p._rampType=null;
    if(this.road){this.road._activeRampId=null;this.road._preferredLevel=0;}

    const steer=requestedSteer();
    const keyThrottle=keys.has('ArrowUp')||keys.has('KeyW');
    const keyBrake=keys.has('ArrowDown')||keys.has('KeyS');
    const keyReverse=keys.has('KeyZ');
    const hand=keys.has('Space');
    const drift=driftHeld();
    const throttle=keyThrottle?1:clamp(input.throttle||0,0,1);
    const reversePower=keyReverse?1:clamp(input.reverse||0,0,1);
    const reversing=reversePower>.06;

    // Same acceleration everywhere: leaving a lane or road has no hidden penalty in ASSIST.
    if(reversing){
      if(p.speed>2)p.speed=Math.max(0,p.speed-190*dt);
      else p.speed-=lerp(52,96,reversePower)*dt;
    }else{
      if(throttle>.025)p.speed+=122*throttle*dt;
      else if(p.speed>0)p.speed=Math.max(0,p.speed-18*dt);
      else if(p.speed<0)p.speed=Math.min(0,p.speed+32*dt);
      if(keyBrake){
        if(p.speed>0)p.speed=Math.max(0,p.speed-180*dt);
        else if(p.speed<0)p.speed=Math.min(0,p.speed+120*dt);
      }
    }
    if(hand)p.speed*=Math.pow(.72,dt*8);
    if(drift&&Math.abs(steer)>.08)p.speed*=Math.pow(.88,dt*5);
    p.speed=clamp(p.speed,reversing?-52:-18,228);

    const turning=Math.abs(steer)>.055;
    if(turning){
      // Direction changes are explicit and perfectly symmetric. A/Left is negative,
      // D/Right is positive. Reversing naturally flips the steering direction.
      const response=1-Math.exp(-dt*16);
      if(Math.sign(p.steer||0)!==Math.sign(steer))p.steer=steer*.82;
      p.steer=lerp(p.steer,steer,response);
      const speedFactor=clamp(Math.abs(p.speed)/115,.38,1.55);
      const turnRate=(hand?2.05:drift?2.25:1.62)*speedFactor;
      const motionSign=p.speed>=0?1:-1;
      p.angle+=p.steer*turnRate*dt*motionSign;
      if((hand||drift)&&Math.abs(p.speed)>45&&Math.random()<dt*18){
        this.spawnSmoke?.(p.x-Math.cos(p.angle)*22,p.y-Math.sin(p.angle)*22);
      }
    }else{
      // No steering command means exactly that: hold the heading. No road tangent, no lane
      // centre and no previous branch may rotate the car after the player releases the control.
      p.steer=lerp(p.steer,0,clamp(dt*18,0,1));
      if(Math.abs(p.steer)<.015)p.steer=0;
    }

    const vx=Math.cos(p.angle)*p.speed;
    const vy=Math.sin(p.angle)*p.speed;
    p.x+=vx*dt;
    p.y+=vy*dt;

    if(!reversing&&p.speed>0)this.distance+=p.speed*dt*METERS_PER_UNIT;
    this.maxSpeed=Math.max(this.maxSpeed,Math.abs(p.speed)*1.42);
    p.offroad=0;
  };

  window.NightHeistAssistStyle='free-drive-independent-v6';
})();
