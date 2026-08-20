(() => {
  const input = window.NightDriveInput = window.NightDriveInput || { steer:0, throttle:0, reverse:0 };
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);
  const ASSIST = {
    intentMs: 1000,
    manualShare: .36,
    lookAheadMin: 105,
    lookAheadMax: 245,
    routeTriggerMin: 255,
  };
  const DRIFT_CODES = ['ShiftLeft', 'ShiftRight', 'KeyX'];

  const meter = document.getElementById('driftMeter') || (() => {
    const el = document.createElement('div');
    el.id = 'driftMeter';
    el.className = 'drift-meter hidden';
    el.innerHTML = '<span>DERAPATA</span><div class="drift-meter__track"><i></i><b></b></div><strong>90°</strong>';
    document.body.appendChild(el);
    return el;
  })();
  const meterFill = meter.querySelector('i');
  const meterMark = meter.querySelector('b');
  const meterText = meter.querySelector('strong');

  function smooth(t) { return t * t * (3 - 2 * t); }
  function driftRotation(hold) {
    if (hold <= .29) return (Math.PI / 2) * smooth(clamp(hold / .29, 0, 1));
    const t = smooth(clamp((hold - .29) / .61, 0, 1));
    return Math.PI / 2 + (Math.PI / 2) * t;
  }
  function isDriftHeld() { return DRIFT_CODES.some(code => keys.has(code)); }

  function pathMap(road) {
    if (!road._driveV3PathMap || road._driveV3PathMapSize !== road.paths.length) {
      road._driveV3PathMap = new Map((road.paths || []).map(p => [p.id, p]));
      road._driveV3PathMapSize = road.paths.length;
    }
    return road._driveV3PathMap;
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

  function travelDirection(info, angle) {
    const tangent=Math.atan2(info.ty,info.tx);
    return Math.cos(angleWrap(tangent-angle)) >= 0 ? 1 : -1;
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
    const start=d.dir>0 ? path.points[0] : path.points[path.points.length-1];
    const index=d.dir>0 ? 0 : Math.max(0,path.points.length-2);
    const next=d.dir>0 ? path.points[Math.min(1,path.points.length-1)] : path.points[Math.max(0,path.points.length-2)];
    const dx=next.x-start.x,dy=next.y-start.y,len=Math.hypot(dx,dy)||1;
    return pointAhead(path,{x:start.x,y:start.y,tx:dx/len,ty:dy/len,index,path},d.dir,distance);
  }

  function allowedAtCurrentLevel(g,path) {
    const level=g.player?._roadLevel||0;
    if(path.feature==='elevated-ramp') return level===0 ? path.rampDirection==='up' : path.rampDirection==='down';
    return (path.level||0)===level;
  }

  function outgoingCandidates(g,current,nodeId) {
    const node=g.road.nodeMap?.get(nodeId);
    if (!node?.edges?.length) return [];
    const byId=pathMap(g.road), out=[];
    for (const id of node.edges) {
      const path=byId.get(id);
      if (!path || path.id===current?.id || path.kind==='service' || !allowedAtCurrentLevel(g,path)) continue;
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
    if (!candidates.length) return null;
    const normal=candidates.filter(c=>c.path.feature!=='elevated-ramp');
    const straightPool=normal.length?normal:candidates;
    const straight=[...straightPool].sort((a,b)=>Math.abs(a.rel)-Math.abs(b.rel))[0];
    if (!intent) return {...straight, matchedIntent:false, automatic:true};
    const side=candidates.filter(c=>Math.sign(c.rel)===intent.dir && Math.abs(c.rel)>.18);
    if (side.length) {
      const desired=lerp(.35,1.45,clamp(intent.strength,0,1));
      side.sort((a,b)=>Math.abs(Math.abs(a.rel)-desired)-Math.abs(Math.abs(b.rel)-desired));
      return {...side[0], matchedIntent:true, automatic:false, intentDir:intent.dir};
    }
    return {...straight, matchedIntent:false, automatic:true, blockedIntent:true, intentDir:intent.dir};
  }

  function assistHeading(g, dt, info, steer) {
    const p=g.player;
    if (window.NightDriveMode==='manual' || p._drift?.active || keys.has('Space') || p.speed<12 || p.speed<0) {
      if (p._roadAssist && window.NightDriveMode==='manual') { p._roadAssist.route=null; p._roadAssist.intent=null; }
      return;
    }
    if (!info?.path) return;
    const width=info.path.width||g.env.roadWidth;
    if (info.d>width*.94) return;

    p._roadAssist ||= {route:null,intent:null};
    const assist=p._roadAssist;
    const now=performance.now(), manual=Math.abs(steer);
    if (manual>.09) assist.intent={dir:Math.sign(steer),strength:clamp(manual,0,1),expires:now+ASSIST.intentMs};
    else if (assist.intent && now>assist.intent.expires) assist.intent=null;

    let working=info;
    const dir=travelDirection(working,p.angle);
    const nodeId=dir>0 ? working.path.nodeB : working.path.nodeA;
    const node=nodeId ? g.road.nodeMap?.get(nodeId) : null;
    const nodeDistance=node ? Math.hypot(p.x-node.x,p.y-node.y) : Infinity;
    const trigger=Math.max(ASSIST.routeTriggerMin,width*1.32,Math.abs(p.speed)*1.35);
    const activeIntent=assist.intent && now<assist.intent.expires ? assist.intent : null;

    if (node && nodeDistance<trigger) {
      const currentRouteValid=assist.route && assist.route.nodeId===nodeId && now<assist.route.expires;
      const intentChanged=currentRouteValid && activeIntent && assist.route.intentDir && assist.route.intentDir!==activeIntent.dir;
      if (!currentRouteValid || intentChanged || (activeIntent && assist.route?.automatic)) {
        const chosen=chooseOutgoing(g,working.path,nodeId,activeIntent);
        if (chosen) {
          assist.route={...chosen,expires:now+2600};
          if (chosen.matchedIntent) assist.intent=null;
        }
      }
    }

    if (assist.route) {
      const routeInfo=nearestOnPath(assist.route.path,p.x,p.y);
      const routeNode=g.road.nodeMap?.get(assist.route.nodeId);
      const routeNodeDistance=routeNode?Math.hypot(p.x-routeNode.x,p.y-routeNode.y):Infinity;
      const routeWidth=assist.route.path.width||width;
      if (routeInfo && routeInfo.d<routeWidth*.62 && routeNodeDistance>90) {
        working=routeInfo;
        if (routeInfo.d<routeWidth*.20 && routeNodeDistance>140) assist.route=null;
      } else if (now>assist.route.expires && routeNodeDistance>trigger*1.10) {
        assist.route=null;
      }
    }

    const speedFactor=clamp(Math.abs(p.speed)/210,0,1);
    const lookAhead=lerp(ASSIST.lookAheadMin,ASSIST.lookAheadMax,speedFactor);
    const currentDir=travelDirection(working,p.angle);
    let target=pointAhead(working.path,working,currentDir,lookAhead);
    let routeInfluence=0;

    if (assist.route) {
      const routeNode=g.road.nodeMap?.get(assist.route.nodeId);
      if (routeNode) {
        const d=Math.hypot(p.x-routeNode.x,p.y-routeNode.y);
        const proximity=1-clamp(d/trigger,0,1);
        const chosenTarget=pointFromNode(assist.route.path,assist.route.nodeId,lerp(26,lookAhead*.88,proximity));
        if (chosenTarget) {
          routeInfluence=clamp(.18+proximity*.82,0,1);
          const blend=smooth(routeInfluence);
          target={x:lerp(target.x,chosenTarget.x,blend),y:lerp(target.y,chosenTarget.y,blend)};
        }
      }
    }

    const desired=Math.atan2(target.y-p.y,target.x-p.x);
    const error=Math.abs(angleWrap(desired-p.angle));
    const playerAuthority=ASSIST.manualShare*manual;
    const correctionRate=lerp(5.5,3.15,playerAuthority);
    p.angle=angleLerp(p.angle,desired,clamp(dt*correctionRate,0,.12));

    if ((routeInfluence>.16 || error>.56) && p.speed>128) {
      const safe=lerp(118,164,clamp(1-error/1.35,0,1));
      if (p.speed>safe) p.speed=lerp(p.speed,safe,Math.min(1,dt*1.55));
    }
  }

  Game.prototype.updatePlayer = function(dt) {
    const p=this.player;
    const keyThrottle=keys.has('ArrowUp')||keys.has('KeyW');
    const keyBrake=keys.has('ArrowDown')||keys.has('KeyS');
    const keyReverse=keys.has('KeyZ');
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const hand=keys.has('Space');
    const keyboardSteer=(right?1:0)-(left?1:0);
    const steer=clamp(keyboardSteer || input.steer || 0,-1,1);
    const throttle=keyThrottle ? 1 : clamp(input.throttle||0,0,1);
    const reversePower=keyReverse ? 1 : clamp(input.reverse||0,0,1);
    const reversing=reversePower>.06;

    let info=this.road.nearestInfo(p.x,p.y);
    const roadWidth=info?.path?.width || this.env.roadWidth;
    const onRoad=!!info && info.d < roadWidth*.57;
    p.offroad=lerp(p.offroad,onRoad?0:1,Math.min(1,dt*4.6));

    const accel=onRoad?118:68;
    const top=onRoad?228:(this.env.offroadMax||112);
    if (reversing) {
      if (p.speed>2) p.speed=Math.max(0,p.speed-lerp(145,215,reversePower)*dt);
      else p.speed-=lerp(48,94,reversePower)*dt;
    } else {
      if (throttle>.025) p.speed+=accel*throttle*dt;
      else if (p.speed>0) p.speed=Math.max(0,p.speed-22*dt);
      else if (p.speed<0) p.speed=Math.min(0,p.speed+34*dt);
      if (keyBrake) {
        if (p.speed>0) p.speed=Math.max(0,p.speed-176*dt);
        else if (p.speed<0) p.speed=Math.min(0,p.speed+120*dt);
      }
    }
    if (hand) p.speed*=Math.pow(.70,dt*8);
    p.speed=clamp(p.speed,reversing?-52:-18,top);

    const driftHeld=isDriftHeld();
    p._drift ||= {active:false,hold:0,dir:0,startAngle:0,startSpeed:0};
    const drift=p._drift;
    if (driftHeld && !drift.active && Math.abs(p.speed)>28) {
      const dir=steer || (Math.abs(p.steer)>.10?Math.sign(p.steer):0);
      if (dir) {
        drift.active=true; drift.hold=0; drift.dir=Math.sign(dir);
        drift.startAngle=p.angle; drift.startSpeed=Math.abs(p.speed);
        audio.burst?.(145,.045,'sawtooth');
      }
    }

    const speedAbs=Math.abs(p.speed);
    const steerStrength=(1.62-clamp(speedAbs/285,0,.58))*(hand?1.42:1);
    const response=1-Math.exp(-dt*(drift.active?15:10.5));
    p.steer=lerp(p.steer,steer,response);

    if (drift.active && driftHeld) {
      drift.hold=Math.min(.90,drift.hold+dt);
      const rotation=driftRotation(drift.hold);
      p.angle=drift.startAngle+drift.dir*rotation;
      const progress=clamp(drift.hold/.90,0,1);
      const minimum=Math.min(drift.startSpeed||72,66+progress*10);
      p.speed=Math.sign(p.speed||1)*Math.max(minimum,Math.abs(p.speed)*Math.pow(.75,dt));
      p.steer=lerp(p.steer,drift.dir,Math.min(1,dt*10));
      this.camera.shake=Math.max(this.camera.shake,2+progress*3.2);
      if (Math.abs(p.speed)>35 && Math.random()<dt*(24+progress*26)) {
        const bx=p.x-Math.cos(p.angle)*23, by=p.y-Math.sin(p.angle)*23;
        this.spawnSmoke(bx+Math.sin(p.angle)*9,by-Math.cos(p.angle)*9);
        this.spawnSmoke(bx-Math.sin(p.angle)*9,by+Math.cos(p.angle)*9);
      }
      const deg=Math.round(rotation*180/Math.PI);
      meter.classList.remove('hidden');
      meterFill.style.width=`${(progress*100).toFixed(1)}%`;
      meterMark.style.left=`${(.29/.90*100).toFixed(1)}%`;
      meterText.textContent=`${deg}°`;
      meter.classList.toggle('drift-meter--uturn',deg>=135);
    } else {
      if (drift.active) {
        if (drift.hold>.18) audio.burst?.(drift.hold>=.58?250:205,.05,'sine');
        drift.active=false; drift.hold=0; drift.dir=0;
      }
      meter.classList.add('hidden'); meter.classList.remove('drift-meter--uturn');
      p.angle+=p.steer*steerStrength*dt*(p.speed/100);
      assistHeading(this,dt,info,steer);
    }

    if (!onRoad) {
      p.speed*=Math.pow(.64,dt);
      if (Math.abs(p.speed)>48 && Math.random()<dt*12) this.spawnDust(p.x,p.y);
    }

    const vx=Math.cos(p.angle)*p.speed, vy=Math.sin(p.angle)*p.speed;
    p.x+=vx*dt; p.y+=vy*dt;
    if (!reversing && p.speed>0) this.distance+=p.speed*dt*METERS_PER_UNIT;
    this.maxSpeed=Math.max(this.maxSpeed,Math.abs(p.speed)*1.42);
    if (hand && Math.abs(p.speed)>70 && Math.random()<dt*22) {
      this.spawnSmoke(p.x-Math.cos(p.angle)*24,p.y-Math.sin(p.angle)*24);
    }
  };

  const baseHud=Game.prototype.updateHud;
  Game.prototype.updateHud=function(minCop){
    baseHud.call(this,minCop);
    if(this.player.speed<-2)ui.speed.textContent=`R ${Math.round(Math.abs(this.player.speed)*1.42)}`;
  };

  const baseEnd=Game.prototype.end;
  Game.prototype.end=function(win){
    if(!win && this.catch>=.72 && this.catch<1.15)return;
    return baseEnd.call(this,win);
  };

  const clearDrivingKeys=()=>DRIFT_CODES.forEach(code=>keys.delete(code));
  window.addEventListener('blur',clearDrivingKeys);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearDrivingKeys();});
})();
