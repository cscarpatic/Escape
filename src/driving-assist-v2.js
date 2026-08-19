(() => {
  const input = window.NightDriveInput = window.NightDriveInput || { steer:0, throttle:0, reverse:0 };

  // Same handling in every level. Difficulty is the number of police cars, not steering.
  // The player expresses intent; the assistant performs most of the lane/turn geometry.
  ENVIRONMENTS.forEach(env => Object.assign(env, {
    steerAssist:3.20,
    laneAssist:1.72,
    cornerAssist:1.62,
    followAssist:1.86,
    manualShare:.20,
    offroadMax:118,
  }));

  function pathMap(road) {
    if (!road._assistPathMap || road._assistPathMapSize !== road.paths.length) {
      road._assistPathMap = new Map((road.paths || []).map(p => [p.id, p]));
      road._assistPathMapSize = road.paths.length;
    }
    return road._assistPathMap;
  }

  function nearestOnPath(path, x, y) {
    if (!path?.points?.length) return null;
    let best = { d:Infinity, x:0, y:0, tx:0, ty:-1, index:0, path };
    for (let i=1; i<path.points.length; i++) {
      const a=path.points[i-1], b=path.points[i];
      const vx=b.x-a.x, vy=b.y-a.y, len2=vx*vx+vy*vy;
      const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/(len2||1),0,1);
      const px=a.x+vx*t, py=a.y+vy*t;
      const d=Math.hypot(x-px,y-py);
      if (d<best.d) {
        const len=Math.sqrt(len2)||1;
        best={d,x:px,y:py,tx:vx/len,ty:vy/len,index:i-1,path};
      }
    }
    return best;
  }

  function travelDirection(info, carAngle) {
    const tangent=Math.atan2(info.ty,info.tx);
    return Math.cos(angleWrap(tangent-carAngle)) >= 0 ? 1 : -1;
  }

  function pointAhead(path, info, dir, distance) {
    if (!path?.points?.length || !info) return {x:info?.x||0,y:info?.y||0};
    let x=info.x, y=info.y, remaining=Math.max(0,distance);
    let i=dir>0 ? info.index+1 : info.index;
    while (remaining>0 && i>=0 && i<path.points.length) {
      const q=path.points[i];
      const seg=Math.hypot(q.x-x,q.y-y);
      if (seg>=remaining) {
        const t=remaining/Math.max(.001,seg);
        return {x:lerp(x,q.x,t),y:lerp(y,q.y,t)};
      }
      remaining-=seg; x=q.x; y=q.y; i+=dir;
    }
    return {x,y};
  }

  function directionFromNode(path,nodeId) {
    if (!path?.points?.length) return null;
    if (path.nodeA===nodeId) {
      const a=path.points[0], b=path.points[Math.min(3,path.points.length-1)];
      return {dir:1,angle:Math.atan2(b.y-a.y,b.x-a.x)};
    }
    if (path.nodeB===nodeId) {
      const n=path.points.length-1;
      const a=path.points[n], b=path.points[Math.max(0,n-3)];
      return {dir:-1,angle:Math.atan2(b.y-a.y,b.x-a.x)};
    }
    return null;
  }

  function pointFromNode(path,nodeId,distance) {
    const d=directionFromNode(path,nodeId);
    if (!d) return null;
    const index=d.dir>0 ? 0 : path.points.length-2;
    const start=d.dir>0 ? path.points[0] : path.points[path.points.length-1];
    const next=d.dir>0 ? path.points[Math.min(1,path.points.length-1)] : path.points[Math.max(0,path.points.length-2)];
    const dx=next.x-start.x,dy=next.y-start.y,len=Math.hypot(dx,dy)||1;
    const fake={x:start.x,y:start.y,tx:dx/len,ty:dy/len,index,path};
    return pointAhead(path,fake,d.dir,distance);
  }

  function upcomingNode(g,info,dir) {
    const path=info?.path;
    if (!path?.nodeA || !path?.nodeB || !g.road?.nodeMap) return null;
    const nodeId=dir>0 ? path.nodeB : path.nodeA;
    const node=g.road.nodeMap.get(nodeId);
    if (!node) return null;
    return {nodeId,node,distance:Math.hypot(g.player.x-node.x,g.player.y-node.y)};
  }

  function allowedAtCurrentLevel(g,path) {
    const level=g.player?._roadLevel||0;
    if(path.feature==='elevated-ramp') {
      if(level===0) return path.rampDirection==='up';
      return path.rampDirection==='down';
    }
    return (path.level||0)===level;
  }

  function outgoingCandidates(g,current,nodeId) {
    const node=g.road.nodeMap?.get(nodeId);
    if (!node?.edges?.length) return [];
    const byId=pathMap(g.road);
    const out=[];
    for (const id of node.edges) {
      const path=byId.get(id);
      if (!path || path===current || path.id===current?.id || path.kind==='service') continue;
      if (!allowedAtCurrentLevel(g,path)) continue;
      const d=directionFromNode(path,nodeId);
      if (!d) continue;
      const rel=angleWrap(d.angle-g.player.angle);
      if (Math.abs(rel)>2.50) continue;
      out.push({path,nodeId,dir:d.dir,rel});
    }
    return out;
  }

  function chooseOutgoing(g,current,nodeId,intent) {
    const candidates=outgoingCandidates(g,current,nodeId);
    if(!candidates.length)return null;

    // Do not enter a flyover automatically when the ground road continues normally.
    const normal=candidates.filter(c=>c.path.feature!=='elevated-ramp');
    const straightPool=normal.length?normal:candidates;
    const straight=[...straightPool].sort((a,b)=>Math.abs(a.rel)-Math.abs(b.rel))[0];
    if(!intent)return {...straight,matchedIntent:false,automatic:true};

    const side=candidates.filter(c=>Math.sign(c.rel)===intent.dir && Math.abs(c.rel)>.20);
    if(side.length){
      const desired=lerp(.38,1.38,clamp(intent.strength,0,1));
      side.sort((a,b)=>Math.abs(Math.abs(a.rel)-desired)-Math.abs(Math.abs(b.rel)-desired));
      return {...side[0],matchedIntent:true,automatic:false,intentDir:intent.dir};
    }

    // Asked for a road that is not there: keep the safest continuation.
    return {...straight,matchedIntent:false,automatic:true,blockedIntent:true,intentDir:intent.dir};
  }

  function routeTarget(route,lookAhead) {
    if (!route?.path || !route.nodeId) return null;
    return pointFromNode(route.path,route.nodeId,lookAhead);
  }

  const baseUpdatePlayer = Game.prototype.updatePlayer;
  Game.prototype.updatePlayer = function(dt) {
    const p=this.player;
    const before={x:p.x,y:p.y,distance:this.distance};
    baseUpdatePlayer.call(this,dt);

    if (p.speed>0) {
      const travelled=Math.hypot(p.x-before.x,p.y-before.y);
      const already=Math.max(0,this.distance-before.distance);
      if (travelled>already) this.distance+=travelled-already;
    }

    if (p._drift?.active || keys.has('Space') || p.speed<10 || (input.reverse||0)>.05) return;

    const keyboard=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-
                   (keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
    const rawTouch=input.steer||0;
    const touch=Math.sign(rawTouch)*Math.pow(Math.abs(rawTouch),1.16);
    const steer=keyboard||touch;
    const manual=Math.abs(steer);
    const now=performance.now();

    let info=this.road.nearestInfo(p.x,p.y);
    if (!info?.path) return;
    const width=info.path.width||this.env.roadWidth;
    if (info.d>width*1.04) return;

    p._roadAssist ||= {route:null,intent:null};
    const assist=p._roadAssist;

    // A small nudge is enough: remember the requested direction for the next junction.
    if(manual>.060){
      assist.intent={dir:Math.sign(steer),strength:clamp(manual,0,1),expires:now+2200};
    } else if(assist.intent && now>assist.intent.expires){
      assist.intent=null;
    }

    const dir=travelDirection(info,p.angle);
    const upcoming=upcomingNode(this,info,dir);
    const trigger=Math.max(300,width*1.55,Math.abs(p.speed)*1.72);
    const activeIntent=assist.intent && now<assist.intent.expires ? assist.intent : null;

    if (upcoming && upcoming.distance<trigger) {
      const currentRouteValid=assist.route && assist.route.nodeId===upcoming.nodeId && now<assist.route.expires;
      const intentChanged=currentRouteValid && activeIntent && assist.route.intentDir && assist.route.intentDir!==activeIntent.dir;
      const shouldRechoose=!currentRouteValid || intentChanged || (activeIntent && assist.route?.automatic);

      if(shouldRechoose){
        const chosen=chooseOutgoing(this,info.path,upcoming.nodeId,activeIntent);
        if(chosen){
          assist.route={...chosen,expires:now+3600};
          if(chosen.matchedIntent) assist.intent=null;
        }
      }
    }

    if (assist.route) {
      const routeInfo=nearestOnPath(assist.route.path,p.x,p.y);
      const node=this.road.nodeMap?.get(assist.route.nodeId);
      const nodeDistance=node?Math.hypot(p.x-node.x,p.y-node.y):Infinity;
      const routeWidth=assist.route.path.width||width;
      const onChosen=routeInfo && routeInfo.d<routeWidth*.66;

      if (onChosen && nodeDistance>105) {
        info=routeInfo;
        if(routeInfo.d<routeWidth*.24 && nodeDistance>155) assist.route=null;
      } else if (now>assist.route.expires && nodeDistance>trigger*1.15) {
        assist.route=null;
      }
    }

    const laneAssist=this.env.laneAssist||1.7;
    const followAssist=this.env.followAssist||1.8;
    const manualShare=clamp(this.env.manualShare??.20,.12,.55);
    const autoShare=1-manualShare;
    const currentDir=travelDirection(info,p.angle);
    const speedFactor=clamp(Math.abs(p.speed)/155,0,1);
    const lookAhead=lerp(112,265,speedFactor);

    let target=pointAhead(info.path,info,currentDir,lookAhead);
    let routeInfluence=0;

    if (assist.route) {
      const node=this.road.nodeMap?.get(assist.route.nodeId);
      if (node) {
        const d=Math.hypot(p.x-node.x,p.y-node.y);
        const proximity=1-clamp(d/trigger,0,1);
        const intoTurn=lerp(32,lookAhead*.90,proximity);
        const chosenTarget=routeTarget(assist.route,intoTurn);
        if (chosenTarget) {
          routeInfluence=clamp(.24+proximity*.76,0,1);
          const blend=routeInfluence*routeInfluence*(3-2*routeInfluence);
          target={x:lerp(target.x,chosenTarget.x,blend),y:lerp(target.y,chosenTarget.y,blend)};
        }
      }
    }

    const roadDesired=Math.atan2(target.y-p.y,target.x-p.x);
    const blocked=assist.route?.blockedIntent;
    const directManualShare=assist.route?.matchedIntent ? manualShare*.08 : blocked ? manualShare*.08 : manualShare;
    const manualAngle=steer*.30*directManualShare;
    const desiredAngle=roadDesired+manualAngle;

    const baseAngle=Math.atan2(info.ty,info.tx);
    const tx=Math.cos(baseAngle),ty=Math.sin(baseAngle);
    const oriented=Math.cos(angleWrap(baseAngle-p.angle))>=0?1:-1;
    const ox=tx*oriented,oy=ty*oriented,nx=-oy,ny=ox;
    const crossTrack=(p.x-info.x)*nx+(p.y-info.y)*ny;
    const edgeRatio=Math.abs(crossTrack)/Math.max(1,width*.5);

    // Most correction is heading-based (smooth), not teleport-like lateral movement.
    const headingRate=(3.8+followAssist*4.55)*(1+autoShare*.26);
    p.angle=angleLerp(p.angle,desiredAngle,clamp(dt*headingRate,0,.155));

    const manualRelax=assist.route?.matchedIntent ? .93 : lerp(1,.86,manual);
    const pullMax=edgeRatio>.72?.054:.038;
    const pull=clamp(dt*laneAssist*(1.18+edgeRatio*1.72)*(1+autoShare*.26)*manualRelax,0,pullMax);
    p.x=lerp(p.x,info.x,pull);
    p.y=lerp(p.y,info.y,pull);

    const headingError=Math.abs(angleWrap(roadDesired-p.angle));
    if ((routeInfluence>.12 || headingError>.30) && p.speed>62) {
      const safe=lerp(62,108,clamp(1-headingError/1.24,0,1));
      if (p.speed>safe) p.speed=lerp(p.speed,safe,Math.min(1,dt*(4.6+(this.env.cornerAssist||1.5)*2.8)));
    }

    if (assist.route && manual<.10) p.steer=lerp(p.steer,0,Math.min(1,dt*9));
  };
})();