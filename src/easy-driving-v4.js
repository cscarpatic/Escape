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

  Game.prototype.updatePlayer=function(dt){
    // Never intercept or rewrite keyboard steering. A/Left and D/Right must reach the
    // unified controller exactly as pressed so branch selection stays perfectly symmetric.
    baseUpdatePlayer.call(this,dt);
    if(!isAssist())return;

    const p=this.player;
    if(!p||p._drift?.active||keys.has('Space')||p.speed<0||(input.reverse||0)>.06||keys.has('KeyZ'))return;

    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const keyboard=(right?1:0)-(left?1:0);
    const rawSteer=keyboard||clamp(input.steer||0,-1,1);
    const manual=Math.abs(rawSteer);

    const info=this.road?.nearestInfo?.(p.x,p.y);
    if(!info?.path)return;
    const width=info.path.width||this.env.roadWidth||160;
    const onRamp=!!p._activeRampId;

    // When the player is actively steering, do not fight the requested turn.
    // Assistance only recentres after release or during very small corrections.
    if(manual<.12&&!onRamp){
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

    // Keep short taps useful for branch selection without changing their direction.
    if(manual>.08&&p._roadAssist?.intent){
      p._roadAssist.intent.expires=Math.max(p._roadAssist.intent.expires||0,performance.now()+1150);
    }
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
