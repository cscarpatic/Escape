(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{};
  const baseUpdatePlayer=Game.prototype.updatePlayer;
  const baseUpdateCops=Game.prototype.updateCops;
  const originalNearestInfo=RoadNetwork.prototype.nearestInfo;

  function projectOnPath(path,x,y){
    if(!path?.points?.length)return {d:Infinity,progress:0};
    let bestD=Infinity,bestProgress=0,total=0,lengths=[];
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],len=Math.hypot(b.x-a.x,b.y-a.y);
      lengths.push(len);total+=len;
    }
    let before=0;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy||1;
      const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/len2,0,1);
      const px=a.x+vx*t,py=a.y+vy*t,d=Math.hypot(x-px,y-py);
      if(d<bestD){bestD=d;bestProgress=(before+lengths[i-1]*t)/Math.max(1,total);}
      before+=lengths[i-1];
    }
    return {d:bestD,progress:bestProgress};
  }

  function pathStartAngle(path){
    if(!path?.points?.length)return 0;
    const a=path.points[0],b=path.points[Math.min(2,path.points.length-1)];
    return Math.atan2(b.y-a.y,b.x-a.x);
  }

  function pathById(road,id){
    return (road.paths||[]).find(p=>p.id===id)||null;
  }

  // Strict level separation. A road on another elevation is never a candidate simply
  // because it happens to overlap the player on screen. A ramp is considered only while
  // it is explicitly active.
  RoadNetwork.prototype.nearestInfo=function(x,y){
    if(this.env?.propMode!=='city'||typeof this._nearestInfoLevel!=='function'){
      return originalNearestInfo.call(this,x,y);
    }
    const active=this._activeRampId;
    if(active){
      const ramp=this._nearestInfoLevel(x,y,p=>p.id===active);
      if(ramp?.path)return ramp;
    }
    const level=this._preferredLevel||0;
    const sameLevel=this._nearestInfoLevel(x,y,p=>(p.level||0)===level&&p.feature!=='elevated-ramp');
    if(sameLevel?.path)return sameLevel;
    return originalNearestInfo.call(this,x,y);
  };

  function setRamp(g,path,type){
    if(!path)return false;
    const p=g.player;
    p._activeRampId=path.id;
    p._rampType=type;
    g.road._activeRampId=path.id;
    return true;
  }

  function routeRequestsRamp(g,type){
    const path=g.player?._roadAssist?.route?.path;
    return path?.feature==='elevated-ramp'&&path.rampDirection===type?path:null;
  }

  function groundEntryCandidate(g){
    const p=g.player;
    const requested=routeRequestsRamp(g,'up');
    if(requested){
      const node=g.road.nodeMap?.get(requested.groundNode);
      if(node&&Math.hypot(p.x-node.x,p.y-node.y)<185)return requested;
    }

    // Manual entry is possible only right at a physical ramp entrance and while pointing
    // into it. Passing underneath the deck can never satisfy these conditions.
    let best=null,bestScore=Infinity;
    for(const route of g.road.elevatedRoutes||[]){
      const ramp=route.up,node=g.road.nodeMap?.get(ramp.groundNode);
      if(!node)continue;
      const nodeD=Math.hypot(p.x-node.x,p.y-node.y);
      if(nodeD>112)continue;
      const proj=projectOnPath(ramp,p.x,p.y);
      if(proj.d>(ramp.width||122)*.62||proj.progress>.30)continue;
      const alignment=Math.cos(angleWrap(pathStartAngle(ramp)-p.angle));
      if(alignment<.52)continue;
      const score=nodeD+proj.d*1.3-alignment*30;
      if(score<bestScore){bestScore=score;best=ramp;}
    }
    return best;
  }

  function elevatedExitCandidate(g){
    const p=g.player;
    const requested=routeRequestsRamp(g,'down');
    if(requested)return requested;

    // A flyover has no intersections: when the car reaches its real end node, guide it
    // onto the connected down ramp. No other ground road is considered while still above.
    let best=null,bestD=Infinity;
    for(const route of g.road.elevatedRoutes||[]){
      const ramp=route.down,node=g.road.nodeMap?.get(ramp.elevatedNode);
      if(!node)continue;
      const d=Math.hypot(p.x-node.x,p.y-node.y);
      if(d<175&&d<bestD){bestD=d;best=ramp;}
    }
    return best;
  }

  function prepareLevelState(g){
    const p=g.player,road=g.road;
    p._roadLevel ??= 0;
    p._activeRampId ??= null;
    p._rampType ??= null;

    if(!p._activeRampId){
      if(p._roadLevel===0){
        const up=groundEntryCandidate(g);
        if(up)setRamp(g,up,'up');
      }else{
        const down=elevatedExitCandidate(g);
        if(down)setRamp(g,down,'down');
      }
    }

    road._preferredLevel=p._roadLevel;
    road._activeRampId=p._activeRampId;
  }

  function finishRampState(g){
    const p=g.player,road=g.road;
    if(!p._activeRampId){
      road._preferredLevel=p._roadLevel||0;
      road._activeRampId=null;
      return;
    }
    const ramp=pathById(road,p._activeRampId);
    if(!ramp){p._activeRampId=null;p._rampType=null;road._activeRampId=null;return;}
    const proj=projectOnPath(ramp,p.x,p.y);
    const type=p._rampType;

    // Stay locked to the ramp until its far end. This is the only legal elevation change.
    if(type==='up'&&proj.progress>=.76&&p._roadLevel===0){
      p._roadLevel=1;
      if(typeof toast==='function')toast('SOPRAELEVATA · VIA RAPIDA');
    }
    if(type==='down'&&proj.progress>=.76&&p._roadLevel===1){
      p._roadLevel=0;
      if(typeof toast==='function')toast('RITORNO ALLA VIABILITÀ URBANA');
    }

    if(proj.progress>=.93){
      p._activeRampId=null;p._rampType=null;road._activeRampId=null;
      if(p._roadAssist){p._roadAssist.route=null;p._roadAssist.intent=null;}
    }else if(proj.progress<.08&&proj.d>(ramp.width||122)*.85){
      // Player backed away from the entrance before committing to the ramp.
      p._activeRampId=null;p._rampType=null;road._activeRampId=null;
    }

    road._preferredLevel=p._roadLevel||0;
    road._activeRampId=p._activeRampId;
  }

  Game.prototype.updatePlayer=function(dt){
    const p=this.player;
    if(this.env.propMode==='city'&&this.road?.elevatedRoutes){
      prepareLevelState(this);
    }

    baseUpdatePlayer.call(this,dt);

    if(this.env.propMode==='city'&&this.road?.elevatedRoutes){
      finishRampState(this);
      if((p._roadLevel||0)===1&&p.speed>0){
        const throttle=clamp(input.throttle||0,0,1);
        if(throttle>.03)p.speed=Math.min(218,p.speed+34*throttle*dt);
      }
    }
  };

  Game.prototype.updateCops=function(dt){
    if(this.env.propMode!=='city'||!this.road){baseUpdateCops.call(this,dt);return;}
    const level=this.road._preferredLevel||0,active=this.road._activeRampId||null;
    this.road._preferredLevel=0;
    this.road._activeRampId=null;
    for(const c of this.cops)c._roadLevel=0;
    baseUpdateCops.call(this,dt);
    this.road._preferredLevel=level;
    this.road._activeRampId=active;
  };
})();