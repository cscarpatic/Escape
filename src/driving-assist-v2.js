(() => {
  const input = window.NightDriveInput = window.NightDriveInput || { steer:0, throttle:0, reverse:0 };

  // Driving difficulty is intentionally identical in every environment.
  // For now, level difficulty is defined by the number of pursuing police cars.
  ENVIRONMENTS.forEach(env => Object.assign(env, {
    steerAssist:2.55,
    laneAssist:1.45,
    cornerAssist:1.34,
    followAssist:1.42,
    manualShare:.35,
    offroadMax:108,
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

  function outgoingCandidates(g,current,nodeId) {
    const node=g.road.nodeMap?.get(nodeId);
    if (!node?.edges?.length) return [];
    const byId=pathMap(g.road);
    const out=[];
    for (const id of node.edges) {
      const path=byId.get(id);
      if (!path || path===current || path.id===current?.id || path.kind==='service') continue;
      const d=directionFromNode(path,nodeId);
      if (!d) continue;
      const rel=angleWrap(d.angle-g.player.angle);
      if (Math.abs(rel)>2.45) continue;
      out.push({path,nodeId,dir:d.dir,rel});
    }
    return out;
  }

  function chooseOutgoing(g,current,nodeId,intent) {
    const candidates=outgoingCandidates(g,current,nodeId);
    if(!candidates.length)return null;
    const straight=[...candidates].sort((a,b)=>Math.abs(a.rel)-Math.abs(b.rel))[0];
    if(!intent)return {...straight,matchedIntent:false,automatic:true};

    const side=candidates.filter(c=>Math.sign(c.rel)===intent.dir && Math.abs(c.rel)>.28);
    if(side.length){
      const desired=lerp(.48,1.42,clamp(intent.strength,0,1));
      side.sort((a,b)=>Math.abs(Math.abs(a.rel)-desired)-Math.abs(Math.abs(b.rel)-desired));
      return {...side[0],matchedIntent:true,automatic:false,intentDir:intent.dir};
    }

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

    if (p._drift?.active || keys.has('Space') || p.speed<14 || (input.reverse||0)>.05) return;

    const keyboard=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-
                   (keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
    const rawTouch=input.steer||0;
    const touch=Math.sign(rawTouch)*Math.pow(Math.abs(rawTouch),1.10);
    const steer=keyboard||touch;
    const manual=Math.abs(steer);
    const now=performance.now();

    let info=this.road.nearestInfo(p.x,p.y);
    if (!info?.path) return;
    const width=info.path.width||this.env.roadWidth;
    if (info.d>width*.98) return;

    p._roadAssist ||= {route:null,intent:null};
    const assist=p._roadAssist;

    if(manual>.085){
      assist.intent={dir:Math.sign(steer),strength:clamp(manual,0,1),expires:now+1800};
    } else if(assist.intent && now>assist.intent.expires){
      assist.intent=null;
    }

    const dir=travelDirection(info,p.angle);
    const upcoming=upcomingNode(this,info,dir);
    const trigger=Math.max(235,width*1.35,Math.abs(p.speed)*1.35);
    const activeIntent=assist.intent && now<assist.intent.expires ? assist.intent : null;

    if (upcoming && upcoming.distance<trigger) {
      const currentRouteValid=assist.route && assist.route.nodeId===upcoming.nodeId && now<assist.route.expires;
      const intentChanged=currentRouteValid && activeIntent && assist.route.intentDir && assist.route.intentDir!==activeIntent.dir;
      const shouldRechoose=!currentRouteValid || intentChanged || (activeIntent && assist.route?.automatic);

      if(shouldRechoose){
        const chosen=chooseOutgoing(this,info.path,upcoming.nodeId,activeIntent);
        if(chosen){
          assist.route={...chosen,expires:now+3000};
          if(chosen.matchedIntent) assist.intent=null;
        }
      }
    }

    if (assist.route) {
      const routeInfo=nearestOnPath(assist.route.path,p.x,p.y);
      const node=this.road.nodeMap?.get(assist.route.nodeId);
      const nodeDistance=node?Math.hypot(p.x-node.x,p.y-node.y):Infinity;
      const onChosen=routeInfo && routeInfo.d<(assist.route.path.width||width)*.58;

      if (onChosen && nodeDistance>92) {
        info=routeInfo;
        assist.route=null;
      } else if (now>assist.route.expires && nodeDistance>trigger*1.1) {
        assist.route=null;
      }
    }

    const laneAssist=this.env.laneAssist||.7;
    const followAssist=this.env.followAssist||.8;
    const manualShare=clamp(this.env.manualShare??.35,.2,.75);
    const autoShare=1-manualShare;
    const currentDir=travelDirection(info,p.angle);
    const speedFactor=clamp(Math.abs(p.speed)/150,0,1);
    const lookAhead=lerp(90,215,speedFactor);

    let target=pointAhead(info.path,info,currentDir,lookAhead);
    let routeInfluence=0;

    if (assist.route) {
      const node=this.road.nodeMap?.get(assist.route.nodeId);
      if (node) {
        const d=Math.hypot(p.x-node.x,p.y-node.y);
        const proximity=1-clamp(d/trigger,0,1);
        const intoTurn=lerp(24,lookAhead*.82,proximity);
        const chosenTarget=routeTarget(assist.route,intoTurn);
        if (chosenTarget) {
          routeInfluence=clamp(.30+proximity*.70,0,1);
          target={x:lerp(target.x,chosenTarget.x,routeInfluence),y:lerp(target.y,chosenTarget.y,routeInfluence)};
        }
      }
    }

    const roadDesired=Math.atan2(target.y-p.y,target.x-p.x);
    const blocked=assist.route?.blockedIntent;
    const directManualShare=assist.route?.matchedIntent ? manualShare*.10 : blocked ? manualShare*.16 : manualShare;
    const manualAngle=steer*.46*directManualShare;
    const desiredAngle=roadDesired+manualAngle;

    const baseAngle=Math.atan2(info.ty,info.tx);
    const tx=Math.cos(baseAngle),ty=Math.sin(baseAngle);
    const oriented=Math.cos(angleWrap(baseAngle-p.angle))>=0?1:-1;
    const ox=tx*oriented,oy=ty*oriented,nx=-oy,ny=ox;
    const crossTrack=(p.x-info.x)*nx+(p.y-info.y)*ny;
    const edgeRatio=Math.abs(crossTrack)/Math.max(1,width*.5);

    const headingRate=(3.15+followAssist*4.25)*(1+autoShare*.30);
    p.angle=angleLerp(p.angle,desiredAngle,clamp(dt*headingRate,0,.18));

    const manualRelax=assist.route?.matchedIntent ? .88 : lerp(1,.78,manual);
    const pull=clamp(dt*laneAssist*(1.55+edgeRatio*2.15)*(1+autoShare*.40)*manualRelax,0,.075);
    p.x=lerp(p.x,info.x,pull);
    p.y=lerp(p.y,info.y,pull);

    const headingError=Math.abs(angleWrap(roadDesired-p.angle));
    if ((routeInfluence>.18 || headingError>.38) && p.speed>70) {
      const safe=lerp(68,114,clamp(1-headingError/1.30,0,1));
      if (p.speed>safe) p.speed=lerp(p.speed,safe,Math.min(1,dt*(3.8+(this.env.cornerAssist||.7)*3.0)));
    }

    if (assist.route && manual<.12) p.steer=lerp(p.steer,0,Math.min(1,dt*8));
  };
})();