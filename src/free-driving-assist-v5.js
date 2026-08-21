(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{steer:0,throttle:0,reverse:0};
  const baseUpdatePlayer=Game.prototype.updatePlayer;

  function isAssist(){return window.NightDriveMode!=='manual';}
  function requestedSteer(){
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const keyboard=(right?1:0)-(left?1:0);
    return clamp(keyboard||input.steer||0,-1,1);
  }

  Game.prototype.updatePlayer=function(dt){
    if(!isAssist())return baseUpdatePlayer.call(this,dt);

    const p=this.player;
    if(!p)return baseUpdatePlayer.call(this,dt);

    const steer=requestedSteer();
    const turning=Math.abs(steer)>.08;
    const angleBefore=p.angle;
    const savedMode=window.NightDriveMode;
    const road=this.road;
    const originalNearest=road?.nearestInfo;

    // ASSIST is now free driving: roads are visual/navigation cues, not invisible rails.
    // Disable route selection and lane/road heading correction for the whole physics step.
    if(p._roadAssist){p._roadAssist.route=null;p._roadAssist.intent=null;}
    window.NightDriveMode='manual';

    // Keep normal asphalt acceleration everywhere in ASSIST so leaving a lane/road does not
    // suddenly slow the car down. We preserve the nearest path data for ramps and other systems,
    // but report zero lateral distance only during the driving physics step.
    if(road&&typeof originalNearest==='function'){
      road.nearestInfo=function(x,y){
        const info=originalNearest.call(road,x,y);
        return info?.path?{...info,d:0}:info;
      };
    }

    // A new turn command should respond immediately instead of carrying steering inertia from
    // the previous direction.
    if(turning&&Math.sign(p.steer||0)!==Math.sign(steer))p.steer=steer*.86;

    try{
      baseUpdatePlayer.call(this,dt);
    }finally{
      window.NightDriveMode=savedMode;
      if(road&&typeof originalNearest==='function')road.nearestInfo=originalNearest;
    }

    if(p._roadAssist){p._roadAssist.route=null;p._roadAssist.intent=null;}

    if(turning&&!p._drift?.active&&!keys.has('Space')&&Math.abs(p.speed)>8){
      // Explicit steering belongs entirely to the player. Guarantee a minimum turn response
      // in either direction so left and right remain perfectly symmetric.
      const motionSign=p.speed>=0?1:-1;
      const requestedDir=Math.sign(steer)*motionSign;
      const speedScale=clamp(Math.abs(p.speed)/105,.34,1.55);
      const minimum=Math.abs(steer)*1.18*speedScale*dt;
      const actual=angleWrap(p.angle-angleBefore);
      if((requestedDir<0&&actual>-minimum)||(requestedDir>0&&actual<minimum)){
        p.angle=angleBefore+requestedDir*minimum;
      }
    }else if(!p._drift?.active&&!keys.has('Space')&&p.speed>=0){
      // No turn command: hold the current heading and quickly centre the virtual steering.
      // The car therefore keeps going forward cleanly until the player explicitly turns again.
      p.angle=angleLerp(p.angle,angleBefore,clamp(dt*11,0,.30));
      p.steer=lerp(p.steer,0,clamp(dt*13,0,1));
    }

    p.offroad=lerp(p.offroad,0,clamp(dt*8,0,1));
  };

  window.NightHeistAssistStyle='free-drive';
})();
