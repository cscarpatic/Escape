(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{steer:0,throttle:0,reverse:0};
  const baseUpdatePlayer=Game.prototype.updatePlayer;
  const baseHandleCollisions=Game.prototype.handleCollisions;

  function isAssist(){return window.NightDriveMode!=='manual';}
  function orientedRoadAngle(info,carAngle){
    let angle=Math.atan2(info.ty,info.tx);
    if(Math.cos(angleWrap(angle-carAngle))<0)angle+=Math.PI;
    return angle;
  }

  function requestedSteer(){
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const keyboard=(right?1:0)-(left?1:0);
    return clamp(keyboard||input.steer||0,-1,1);
  }

  Game.prototype.updatePlayer=function(dt){
    const assistMode=isAssist();
    const steerBefore=requestedSteer();
    const activeSteer=Math.abs(steerBefore)>.10;
    const savedMode=window.NightDriveMode;

    // While the player is actively steering in ASSIST, temporarily suspend road-heading
    // correction. The unified controller still applies the real steering physics, but it
    // cannot pull the car back toward a previously selected route in the same frame.
    if(assistMode&&activeSteer)window.NightDriveMode='manual';
    try{
      baseUpdatePlayer.call(this,dt);
    }finally{
      if(assistMode&&activeSteer)window.NightDriveMode=savedMode;
    }
    if(!assistMode)return;

    const p=this.player;
    if(!p||p._drift?.active||keys.has('Space')||p.speed<0||(input.reverse||0)>.06||keys.has('KeyZ'))return;

    const rawSteer=requestedSteer();
    const manual=Math.abs(rawSteer);

    // Recreate branch intent after the temporary manual frame. This means a held or tapped
    // A/Left always requests the left branch and D/Right always requests the right branch.
    if(manual>.08){
      p._roadAssist ||= {route:null,intent:null};
      p._roadAssist.intent={
        dir:Math.sign(rawSteer),
        strength:clamp(manual,0,1),
        expires:performance.now()+1250
      };
      // Do not let an automatic route chosen before the key press keep fighting the player.
      if(p._roadAssist.route?.automatic)p._roadAssist.route=null;
    }

    const info=this.road?.nearestInfo?.(p.x,p.y);
    if(!info?.path)return;
    const width=info.path.width||this.env.roadWidth||160;
    const onRamp=!!p._activeRampId;

    // Recovery assistance acts only after steering is released. It never opposes A/Left,
    // D/Right or the touch joystick while the player is asking for a turn.
    if(manual<.10&&!onRamp){
      const roadAngle=orientedRoadAngle(info,p.angle);
      if(info.d<width*.76){
        const edge=clamp((info.d-width*.38)/(width*.38),0,1);
        if(edge>0){
          p.angle=angleLerp(p.angle,roadAngle,clamp(dt*lerp(.45,2.15,edge),0,.045));
          const pull=clamp(dt*lerp(.06,.72,edge),0,.014);
          p.x=lerp(p.x,info.x,pull);
          p.y=lerp(p.y,info.y,pull);
        }
      }else if(info.d<width*.98){
        const centreBearing=Math.atan2(info.y-p.y,info.x-p.x);
        const recoveryAngle=angleLerp(roadAngle,centreBearing,.18);
        p.angle=angleLerp(p.angle,recoveryAngle,clamp(dt*1.55,0,.045));
      }
    }

    if(manual<.04)p.steer=lerp(p.steer,0,clamp(dt*8.5,0,1));
  };

  Game.prototype.handleCollisions=function(){
    if(!isAssist())return baseHandleCollisions.call(this);
    const beforeSpeed=this.player?.speed||0;
    const beforeCooldown=this.hitCooldown||0;
    baseHandleCollisions.call(this);
    const justHit=beforeCooldown<=0&&(this.hitCooldown||0)>0;
    if(justHit&&beforeSpeed>35&&this.player){
      this.player.speed=Math.max(this.player.speed,beforeSpeed*.68);
    }
  };
})();