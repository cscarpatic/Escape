(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{steer:0,throttle:0,reverse:0};
  const baseUpdatePlayer=Game.prototype.updatePlayer;
  const baseHandleCollisions=Game.prototype.handleCollisions;

  function isAssist(){return window.NightDriveMode!=='manual';}
  function requestedSteer(){
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const keyboard=(right?1:0)-(left?1:0);
    return clamp(keyboard||input.steer||0,-1,1);
  }
  function orientedRoadAngle(info,carAngle){
    let angle=Math.atan2(info.ty,info.tx);
    if(Math.cos(angleWrap(angle-carAngle))<0)angle+=Math.PI;
    return angle;
  }

  Game.prototype.updatePlayer=function(dt){
    const p=this.player;
    const assistMode=isAssist();
    const steer=requestedSteer();
    const activeSteer=Math.abs(steer)>.08;
    const angleBefore=p?.angle||0;

    // A manual request must always override an automatic route. Keep the requested branch
    // available to the central controller, but never let an old automatic route fight it.
    if(assistMode&&activeSteer&&p){
      p._roadAssist ||= {route:null,intent:null};
      p._roadAssist.intent={
        dir:Math.sign(steer),
        strength:clamp(Math.abs(steer),0,1),
        expires:performance.now()+1350
      };
      if(p._roadAssist.route?.automatic)p._roadAssist.route=null;
    }

    baseUpdatePlayer.call(this,dt);
    if(!assistMode||!p)return;

    // Hard guarantee: while steering, the car angle must actually move in the requested
    // direction. This runs after every other driving module, so road assist, route selection
    // and steering smoothing cannot cancel a left (or right) command.
    if(activeSteer&&!p._drift?.active&&!keys.has('Space')&&Math.abs(p.speed)>8){
      const motionSign=p.speed>=0?1:-1;
      const requestedDir=Math.sign(steer)*motionSign;
      const speedScale=clamp(Math.abs(p.speed)/100,.32,1.75);
      const minMagnitude=Math.abs(steer)*1.22*speedScale*dt;
      const minDelta=requestedDir*minMagnitude;
      const actualDelta=angleWrap(p.angle-angleBefore);

      if((requestedDir<0&&actualDelta>minDelta)||(requestedDir>0&&actualDelta<minDelta)){
        p.angle=angleBefore+minDelta;
      }

      // Remove opposite residual steering immediately. A previous right turn must never
      // delay a new left command (and vice versa).
      if(Math.sign(p.steer||0)!==Math.sign(steer))p.steer=steer*.72;
    }

    const rawSteer=requestedSteer();
    const manual=Math.abs(rawSteer);
    if(p._drift?.active||keys.has('Space')||p.speed<0||(input.reverse||0)>.06||keys.has('KeyZ'))return;

    const info=this.road?.nearestInfo?.(p.x,p.y);
    if(!info?.path)return;
    const width=info.path.width||this.env.roadWidth||160;
    const onRamp=!!p._activeRampId;

    // Recovery only after release: it cannot oppose an active turn.
    if(manual<.08&&!onRamp){
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
