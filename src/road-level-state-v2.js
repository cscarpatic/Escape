(() => {
  const baseUpdatePlayer = Game.prototype.updatePlayer;

  function project(path, x, y) {
    if (!path?.points?.length) return null;
    let best = { d:Infinity, progress:0, x, y, tx:0, ty:-1, path };
    let total = 0;
    const segs = [];
    for (let i=1;i<path.points.length;i++) {
      const a=path.points[i-1], b=path.points[i];
      const len=Math.hypot(b.x-a.x,b.y-a.y);
      segs.push(len); total += len;
    }
    let before=0;
    for (let i=1;i<path.points.length;i++) {
      const a=path.points[i-1], b=path.points[i];
      const vx=b.x-a.x, vy=b.y-a.y, len2=vx*vx+vy*vy||1;
      const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/len2,0,1);
      const px=a.x+vx*t, py=a.y+vy*t, d=Math.hypot(x-px,y-py);
      if (d<best.d) {
        const len=Math.sqrt(len2)||1;
        best={d,progress:(before+segs[i-1]*t)/Math.max(1,total),x:px,y:py,tx:vx/len,ty:vy/len,path};
      }
      before += segs[i-1];
    }
    return best;
  }

  function pathLevel(path) { return Number.isFinite(path?.level) ? path.level : 0; }

  function nearestCompatible(g, x, y) {
    const p=g.player;
    const activeId=p?._activeRampId || null;
    const level=Number.isFinite(p?._roadLevel) ? p._roadLevel : 0;
    let best={d:Infinity,x,y,tx:0,ty:-1,path:null};
    const candidates=g.road?.nearbyPaths?.(y,900) || g.road?.paths || [];

    for (const path of candidates) {
      if (!path?.points?.length || path.closed) continue;
      if (activeId) {
        if (path.id!==activeId) continue;
      } else {
        if (path.feature==='elevated-ramp') continue;
        if (pathLevel(path)!==level) continue;
      }
      const info=project(path,x,y);
      if (info && info.d<best.d) best=info;
    }
    return best;
  }

  function nodeDistance(g, nodeId) {
    const node=g.road?.nodeMap?.get(nodeId);
    return node ? Math.hypot(g.player.x-node.x,g.player.y-node.y) : Infinity;
  }

  function headingIntoRamp(path, p, fromStart=true) {
    const pts=path?.points||[];
    if (pts.length<2) return false;
    const a=fromStart?pts[0]:pts[pts.length-1];
    const b=fromStart?pts[Math.min(2,pts.length-1)]:pts[Math.max(0,pts.length-3)];
    const ang=Math.atan2(b.y-a.y,b.x-a.x);
    return Math.cos(angleWrap(ang-p.angle))>.35;
  }

  function findRampEntry(g) {
    const p=g.player;
    const routes=g.road?.elevatedRoutes||[];
    if (!routes.length) return null;

    if ((p._roadLevel||0)===0) {
      let best=null,bestScore=Infinity;
      for (const route of routes) {
        const ramp=route.up;
        if (!ramp || ramp.closed) continue;
        const nd=nodeDistance(g,ramp.groundNode);
        if (nd>135 || !headingIntoRamp(ramp,p,true)) continue;
        const info=project(ramp,p.x,p.y);
        if (!info || info.d>(ramp.width||122)*.68 || info.progress>.34) continue;
        const score=nd+info.d;
        if (score<bestScore) { bestScore=score; best={ramp,type:'up'}; }
      }
      return best;
    }

    let best=null,bestScore=Infinity;
    for (const route of routes) {
      const ramp=route.down;
      if (!ramp || ramp.closed) continue;
      const nd=nodeDistance(g,ramp.elevatedNode);
      if (nd>170) continue;
      const info=project(ramp,p.x,p.y);
      if (!info || info.d>(ramp.width||122)*.80) continue;
      const score=nd+info.d;
      if (score<bestScore) { bestScore=score; best={ramp,type:'down'}; }
    }
    return best;
  }

  function beginRamp(g, entry) {
    if (!entry) return;
    const p=g.player;
    p._activeRampId=entry.ramp.id;
    p._rampType=entry.type;
    p._roadFeature='elevated-ramp';
  }

  function updateRampState(g) {
    const p=g.player;
    p._roadLevel = Number.isFinite(p._roadLevel) ? p._roadLevel : 0;

    if (!p._activeRampId) beginRamp(g,findRampEntry(g));
    if (!p._activeRampId) {
      p._roadFeature=null;
      return;
    }

    const ramp=(g.road.paths||[]).find(path=>path.id===p._activeRampId);
    if (!ramp) {
      p._activeRampId=null; p._rampType=null; p._roadFeature=null;
      return;
    }

    const info=project(ramp,p.x,p.y);
    if (!info) return;

    // Elevation changes only after the vehicle has physically travelled along the ramp.
    if (p._rampType==='up' && p._roadLevel===0 && info.progress>=.68) p._roadLevel=1;
    if (p._rampType==='down' && p._roadLevel===1 && info.progress>=.68) p._roadLevel=0;

    if (info.progress>=.94) {
      p._activeRampId=null; p._rampType=null; p._roadFeature=null;
    } else if (info.progress<.10 && info.d>(ramp.width||122)*.90) {
      p._activeRampId=null; p._rampType=null; p._roadFeature=null;
    }
  }

  Game.prototype.updatePlayer=function(dt) {
    const p=this.player;
    if (!p || this.env?.propMode!=='city' || !(this.road?.elevatedRoutes||[]).length) {
      return baseUpdatePlayer.call(this,dt);
    }

    updateRampState(this);

    // The arcade controller resets RoadNetwork's preferred level internally. Give it a
    // per-run nearestInfo that ignores that reset and derives candidates from player state.
    const road=this.road;
    const originalInstanceNearest=road.nearestInfo;
    road.nearestInfo=(x,y)=>nearestCompatible(this,x,y);
    try {
      baseUpdatePlayer.call(this,dt);
    } finally {
      road.nearestInfo=originalInstanceNearest;
    }

    updateRampState(this);
    road._preferredLevel=p._roadLevel||0;
    road._activeRampId=p._activeRampId||null;
  };

  const baseHandleCollisions=Game.prototype.handleCollisions;
  Game.prototype.handleCollisions=function() {
    // Preserve current level/ramp state for collision code loaded earlier.
    const p=this.player;
    if (p) {
      p._roadLevel=Number.isFinite(p._roadLevel)?p._roadLevel:0;
      p._onRamp=!!p._activeRampId;
    }
    baseHandleCollisions.call(this);
    if (p) p._onRamp=false;
  };

  window.NightHeistRoadLevelState='v2-persistent-elevation';
})();