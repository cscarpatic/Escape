(() => {
  const input=window.NightDriveInput||{steer:0};
  const TAP_MAX=260, TAP_THRESHOLD=.22, RELEASE_THRESHOLD=.10;
  let keyDownAt={left:0,right:0},touchSide=0,touchDownAt=0;

  function laneOffset(path){
    const w=path?.width||150;
    if(path?.kind==='highway') return clamp(w*.24,38,58);
    if(path?.kind==='state') return clamp(w*.225,34,52);
    return clamp(w*.215,30,46);
  }
  function requestLane(dir){
    if(!game||state!=='playing'||!game.player)return;
    const p=game.player;p._laneState ||= {side:1,target:1,lastPath:null};
    p._laneState.target=dir<0?-1:1;
  }
  addEventListener('keydown',e=>{
    if(e.repeat)return;
    if(e.code==='ArrowLeft'||e.code==='KeyA')keyDownAt.left=performance.now();
    if(e.code==='ArrowRight'||e.code==='KeyD')keyDownAt.right=performance.now();
  },true);
  addEventListener('keyup',e=>{
    const now=performance.now();
    if((e.code==='ArrowLeft'||e.code==='KeyA')&&keyDownAt.left&&now-keyDownAt.left<=TAP_MAX)requestLane(-1);
    if((e.code==='ArrowRight'||e.code==='KeyD')&&keyDownAt.right&&now-keyDownAt.right<=TAP_MAX)requestLane(1);
    if(e.code==='ArrowLeft'||e.code==='KeyA')keyDownAt.left=0;
    if(e.code==='ArrowRight'||e.code==='KeyD')keyDownAt.right=0;
  },true);

  const baseUpdate=Game.prototype.updatePlayer;
  Game.prototype.updatePlayer=function(dt){
    baseUpdate.call(this,dt);
    const p=this.player;if(!p||p._drift?.active||p.speed<8)return;

    // Touch/joystick: a quick nudge and release changes lane once.
    const raw=input.steer||0,side=Math.abs(raw)>TAP_THRESHOLD?Math.sign(raw):0,now=performance.now();
    if(side&&touchSide===0){touchSide=side;touchDownAt=now;}
    if(touchSide&&Math.abs(raw)<RELEASE_THRESHOLD){if(now-touchDownAt<=TAP_MAX)requestLane(touchSide);touchSide=0;touchDownAt=0;}
    if(touchSide&&side&&side!==touchSide){touchSide=side;touchDownAt=now;}

    const info=this.road.nearestInfo(p.x,p.y);if(!info?.path)return;
    const width=info.path.width||this.env.roadWidth;if(info.d>width*.72)return;
    p._laneState ||= {side:1,target:1,lastPath:null};
    const lane=p._laneState;

    // Preserve the chosen physical side of the carriageway when entering a connected road.
    if(lane.lastPath!==info.path.id){lane.lastPath=info.path.id;if(lane.side!==-1&&lane.side!==1)lane.side=1;}
    lane.side=lerp(lane.side,lane.target,clamp(dt*5.8,0,.18));

    const baseAngle=Math.atan2(info.ty,info.tx);
    const oriented=Math.cos(angleWrap(baseAngle-p.angle))>=0?1:-1;
    const ox=Math.cos(baseAngle)*oriented,oy=Math.sin(baseAngle)*oriented;
    const nx=-oy,ny=ox,off=laneOffset(info.path)*lane.side;
    const tx=info.x+nx*off,ty=info.y+ny*off;

    // Strong enough to keep the car in-lane, still continuous enough to look like a real lane change.
    const lateral=clamp(dt*(4.6+Math.min(Math.abs(p.speed),220)/90),0,.16);
    p.x=lerp(p.x,tx,lateral);p.y=lerp(p.y,ty,lateral);
    const aheadDist=80+clamp(Math.abs(p.speed),0,220)*.55;
    const pts=info.path.points,idx=clamp(info.index+oriented*3,0,pts.length-1),ahead=pts[Math.round(idx)];
    if(ahead){
      const ax=ahead.x+nx*off,ay=ahead.y+ny*off,desired=Math.atan2(ay-p.y,ax-p.x);
      p.angle=angleLerp(p.angle,desired,clamp(dt*5.2,0,.12));
    }
  };
})();