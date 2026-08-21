(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{steer:0,throttle:0,reverse:0};
  const baseUpdatePlayer=Game.prototype.updatePlayer;
  const baseHandleCollisions=Game.prototype.handleCollisions;

  const LEFT_CODES=['ArrowLeft','KeyA'];
  const RIGHT_CODES=['ArrowRight','KeyD'];

  function isAssist(){return window.NightDriveMode!=='manual';}
  function keyHeld(codes){return codes.some(code=>keys.has(code));}
  function orientedRoadAngle(info,carAngle){
    let angle=Math.atan2(info.ty,info.tx);
    if(Math.cos(angleWrap(angle-carAngle))<0)angle+=Math.PI;
    return angle;
  }
  function restoreKeys(removed){for(const code of removed)keys.add(code);}

  Game.prototype.updatePlayer=function(dt){
    if(!isAssist())return baseUpdatePlayer.call(this,dt);

    const p=this.player;
    const beforeSpeed=p.speed;
    const left=keyHeld(LEFT_CODES),right=keyHeld(RIGHT_CODES);
    const keyboard=(right?1:0)-(left?1:0);
    const rawTouch=clamp(input.steer||0,-1,1);
    const rawSteer=keyboard||rawTouch;

    // ASSIST treats left/right as an intention, not as an instant full-lock steering command.
    // The faster the car goes, the softer the steering becomes, while low-speed manoeuvres
    // remain responsive enough to dodge traffic and choose a branch.
    const speedFactor=clamp(Math.abs(p.speed)/220,0,1);
    const steerScale=lerp(.88,.58,speedFactor);
    const assistedSteer=rawSteer*steerScale;

    // The unified controller gives keyboard input priority over the analog value. Temporarily
    // route keyboard steering through the analog channel so both keyboard and touch receive
    // exactly the same speed-sensitive filtering.
    const removed=[];
    if(keyboard){
      for(const code of [...LEFT_CODES,...RIGHT_CODES]){
        if(keys.has(code)){keys.delete(code);removed.push(code);}
      }
    }
    const previousInputSteer=input.steer;
    input.steer=assistedSteer;
    try{
      baseUpdatePlayer.call(this,dt);
    }finally{
      input.steer=previousInputSteer;
      restoreKeys(removed);
    }

    if(!p||p._drift?.active||keys.has('Space')||p.speed<0||(input.reverse||0)>.06||keys.has('KeyZ'))return;

    const info=this.road?.nearestInfo?.(p.x,p.y);
    if(!info?.path)return;
    const width=info.path.width||this.env.roadWidth||160;
    const manual=Math.abs(rawSteer);
    const onRamp=!!p._activeRampId;
    const roadAngle=orientedRoadAngle(info,p.angle);

    // Soft shoulder: crossing the old gameplay boundary no longer feels like falling off a
    // cliff. Up to ~76% of road width the car keeps most of its momentum and gets a gentle
    // recovery cue instead of an abrupt punishment.
    if(info.d<width*.76){
      const edge=clamp((info.d-width*.34)/(width*.42),0,1);
      if(edge>0&&!onRamp){
        const headingRate=lerp(.55,3.0,edge)*(1-manual*.48);
        p.angle=angleLerp(p.angle,roadAngle,clamp(dt*headingRate,0,.060));

        // Position assistance is intentionally almost invisible near the centre and becomes
        // noticeable only near the shoulder. The player can still deliberately leave the road.
        const pullRate=lerp(.10,1.55,edge)*(1-manual*.36);
        const pull=clamp(dt*pullRate,0,.030);
        p.x=lerp(p.x,info.x,pull);
        p.y=lerp(p.y,info.y,pull);
      }

      if(info.d>width*.57&&p.speed>0){
        const shoulderFloor=Math.max(0,beforeSpeed-18*dt);
        p.speed=Math.max(p.speed,shoulderFloor);
      }
    }else if(info.d<width*1.02&&!onRamp){
      // If the player really leaves the asphalt, point the nose back toward a recoverable line
      // without teleporting the car. This turns a small mistake into a correction, not a reset.
      const centreBearing=Math.atan2(info.y-p.y,info.x-p.x);
      const recoveryAngle=angleLerp(roadAngle,centreBearing,.24);
      p.angle=angleLerp(p.angle,recoveryAngle,clamp(dt*2.65,0,.072));
      if(beforeSpeed>0)p.speed=Math.max(p.speed,Math.min(145,beforeSpeed*.90));
    }

    // When the player releases the steering, remove residual lock quickly. This is especially
    // important on keyboard where A/D otherwise feel more binary than a real arcade wheel.
    if(manual<.04)p.steer=lerp(p.steer,0,clamp(dt*8.5,0,1));

    // A short tap should reliably select the next branch. Extend only an already-created
    // intent, so normal driving does not invent turns the player did not request.
    if(manual>.08&&p._roadAssist?.intent){
      p._roadAssist.intent.expires=Math.max(p._roadAssist.intent.expires||0,performance.now()+1250);
    }
  };

  Game.prototype.handleCollisions=function(){
    if(!isAssist())return baseHandleCollisions.call(this);
    const beforeSpeed=this.player?.speed||0;
    const beforeCooldown=this.hitCooldown||0;
    baseHandleCollisions.call(this);
    const justHit=beforeCooldown<=0&&(this.hitCooldown||0)>0;
    if(justHit&&beforeSpeed>35&&this.player){
      // Collisions still matter, but a single traffic tap no longer kills the whole run.
      this.player.speed=Math.max(this.player.speed,beforeSpeed*.68);
    }
  };
})();
