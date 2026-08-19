(() => {
  const BaseRoadNetwork = RoadNetwork;
  const MODE_SEED = {city:11000, industrial:22000, alpine:33000, desert:44000};
  const EXTRA_TRAFFIC = {city:18, industrial:16, alpine:10, desert:13};
  const COP_TOP_SPEED = 126;
  ENVIRONMENTS.forEach(env=>{env.copPower=.62;});

  const recalcPath = p => {
    if (!p?.points?.length) return;
    let length=0;
    for(let i=1;i<p.points.length;i++) length+=Math.hypot(p.points[i].x-p.points[i-1].x,p.points[i].y-p.points[i-1].y);
    const xs=p.points.map(q=>q.x),ys=p.points.map(q=>q.y);
    p.length=Math.max(1,length);p.minX=Math.min(...xs);p.maxX=Math.max(...xs);p.minY=Math.min(...ys);p.maxY=Math.max(...ys);
    p.midX=(p.points[0].x+p.points[p.points.length-1].x)/2;
  };

  function warpX(mode,x,y){
    const fade=clamp((-y+120)/1500,0,1);
    if(mode==='alpine') return x*.76 + fade*(Math.sin(-y/920)*220 + Math.sin(-y/410)*72);
    if(mode==='desert') return x*1.28 + fade*Math.sin(-y/1900)*72;
    return x;
  }

  function warpRect(mode,obj){
    if(!obj||obj.left==null||obj.right==null||obj.top==null||obj.bottom==null)return;
    const cy=(obj.top+obj.bottom)/2,l=warpX(mode,obj.left,cy),r=warpX(mode,obj.right,cy);
    obj.left=Math.min(l,r);obj.right=Math.max(l,r);
  }

  function applyMapSignature(road,mode){
    if(mode!=='alpine'&&mode!=='desert')return;

    for(const n of road.nodes||[]) n.x=warpX(mode,n.x,n.y);
    for(const p of road.paths||[]){for(const q of p.points||[])q.x=warpX(mode,q.x,q.y);recalcPath(p);}
    for(const p of road.props||[]) p.x=warpX(mode,p.x,p.y);
    for(const s of road.stages||[]){s.centerX=warpX(mode,s.centerX||0,s.startY||s.midY||0);s.endX=warpX(mode,s.endX||0,s.endY||s.midY||0);}
    for(const b of road.environmentBlocks||[]) warpRect(mode,b);
    for(const o of road.lightOccluders||[]){
      if(o.polygon?.length){for(const q of o.polygon)q.x=warpX(mode,q.x,q.y);const xs=o.polygon.map(q=>q.x),ys=o.polygon.map(q=>q.y);o.left=Math.min(...xs);o.right=Math.max(...xs);o.top=Math.min(...ys);o.bottom=Math.max(...ys);} else warpRect(mode,o);
    }
    for(const l of road.trafficLights||[]) if(l?.x!=null)l.x=warpX(mode,l.x,l.y||0);
  }

  function pruneCrossRoads(road,mode){
    const shouldKeep=p=>{
      if((p.stage??0)<2)return true;
      if(mode==='industrial'&&p.feature==='dock-cross')return p.stage%2===0;
      if(mode==='alpine'&&p.feature==='mountain-cross')return p.stage%3===0;
      if(mode==='desert'&&p.feature==='desert-cross')return p.stage%4===0;
      return true;
    };
    road.paths=(road.paths||[]).filter(shouldKeep);
    const ids=new Set(road.paths.map(p=>p.id));
    for(const n of road.nodes||[]) if(Array.isArray(n.edges))n.edges=n.edges.filter(id=>ids.has(id));
  }

  function closureCandidate(p,mode){
    if(!p||p.stage<2||p.kind==='highway'||p.feature==='interchange'||p.length<170)return false;
    if(mode==='city')return p.kind==='city'||p.kind==='service';
    if(mode==='industrial')return p.kind==='city'||p.kind==='service'||p.feature==='dock-cross';
    if(mode==='alpine')return p.feature==='mountain-cross'||p.feature==='mountain-cut';
    if(mode==='desert')return p.feature==='desert-cross'||p.kind==='city';
    return false;
  }

  function oneWayCandidate(p,mode){
    if(!p||p.closed||p.stage<1||p.kind==='highway'||p.feature==='interchange')return false;
    if(mode==='city'||mode==='industrial')return p.kind==='city'||p.kind==='service';
    if(mode==='alpine')return p.feature==='mountain-cut'||p.feature==='mountain-cross';
    if(mode==='desert')return p.kind==='city'||p.feature==='desert-cross'||p.feature==='desert-bypass';
    return false;
  }

  function applyRoadRules(road,mode){
    const seed=MODE_SEED[mode]||55000;
    const closures=(road.paths||[]).filter(p=>closureCandidate(p,mode)).sort((a,b)=>hash(seed+a.branch*17)-hash(seed+b.branch*17));
    const wanted=Math.min(closures.length, mode==='city'?6:mode==='industrial'?7:mode==='alpine'?5:5);
    for(let i=0;i<wanted;i++){
      const p=closures[i];p.closed=true;p.closedAt=.34+hash(seed+p.branch*41)*.32;p.trafficWeight=0;
    }

    const oneWays=(road.paths||[]).filter(p=>oneWayCandidate(p,mode));
    const chance=mode==='industrial'?.31:mode==='city'?.24:mode==='alpine'?.20:.22;
    let count=0;
    for(const p of oneWays){
      if(p.oneWay){p.roadRuleOneWay=true;count++;continue;}
      if(hash(seed+p.branch*59)>chance)continue;
      p.oneWay=hash(seed+p.branch*71)<.5?1:-1;p.roadRuleOneWay=true;count++;
    }
    if(!count&&oneWays.length){const p=oneWays[0];p.oneWay=1;p.roadRuleOneWay=true;}
  }

  RoadNetwork = class DiverseRoadNetwork extends BaseRoadNetwork {
    constructor(env){
      super(env);
      applyMapSignature(this,env.propMode);
      pruneCrossRoads(this,env.propMode);
      applyRoadRules(this,env.propMode);
    }
  };

  Object.assign(ENVIRONMENTS[0],{blurb:'Griglia metropolitana fitta, cantieri e sensi unici.',mapIdentity:'CITTÀ · GRIGLIA FITTA E CANTIERI'});
  Object.assign(ENVIRONMENTS[1],{blurb:'Corridoi merci larghi, banchine, mezzi pesanti e sensi unici.',mapIdentity:'PORTO · CORRIDOI MERCI E BANCHINE'});
  Object.assign(ENVIRONMENTS[2],{blurb:'Valle sinuosa, pochi attraversamenti e passi alternativi.',mapIdentity:'MONTAGNA · VALLE SINUOSA E PASSI'});
  Object.assign(ENVIRONMENTS[3],{blurb:'Highway aperta, grandi distanze, bypass e incroci radi.',mapIdentity:'DESERTO · HIGHWAY APERTA E BYPASS'});
  if(typeof buildMenu==='function')buildMenu();

  const baseSpawnTraffic=Game.prototype.spawnTraffic;
  Game.prototype.spawnTraffic=function(){
    baseSpawnTraffic.call(this);
    this.traffic=(this.traffic||[]).filter(t=>!t.path?.closed);
    for(const t of this.traffic){if(t.path?.oneWay)t.direction=t.path.oneWay;}

    const mode=this.env.propMode,extra=EXTRA_TRAFFIC[mode]||10;
    const eligible=(this.road.paths||[]).filter(p=>!p.closed&&p.stage>=1&&p.length>170&&(p.trafficWeight??.25)>.08&&p.kind!=='service');
    if(!eligible.length)return;
    const colors=['#d8dfe6','#62788d','#d9b267','#7b8087','#a34b4b','#54735f','#554f78','#b7a7a2','#8c9aa4','#b98a63'];
    const seed=MODE_SEED[mode]||55000;
    for(let i=0;i<extra;i++){
      const p=eligible[Math.floor(hash(seed+i*83)*eligible.length)%eligible.length];
      const direction=p.oneWay||(hash(seed+i*97)<this.env.oncoming*.34?-1:1);
      const speed=p.kind==='highway'?randRange(seed+i*101,78,118):p.trafficTrait==='slow'?randRange(seed+i*103,25,47):randRange(seed+i*107,42,76);
      let t=.08+hash(seed+i*109)*.84;
      const q=samplePath(p,t);
      if(Math.hypot(q.x-this.player.x,q.y-this.player.y)<180)t=clamp(t+.27,.08,.92);
      const car=new TrafficCar(p,t,direction,speed,colors[i%colors.length]);
      if(i%6===0&&mode!=='alpine'){car.width=31;car.length=58;car.vehicleKind='van';}
      this.traffic.push(car);
    }
  };

  function nearestOnPath(path,x,y){
    let best={d:Infinity,x,y,tx:0,ty:-1};
    const pts=path?.points||[];
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],vx=b.x-a.x,vy=b.y-a.y,l2=vx*vx+vy*vy||1;
      const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/l2,0,1),qx=a.x+vx*t,qy=a.y+vy*t,d=Math.hypot(x-qx,y-qy);
      if(d<best.d){const l=Math.sqrt(l2);best={d,x:qx,y:qy,tx:vx/l,ty:vy/l};}
    }
    return best;
  }

  function chooseRoute(g,c,targetX,targetY,index){
    const occupied=new Set((g.cops||[]).filter(o=>o!==c&&o._routePathId).map(o=>o._routePathId));
    let best=null,bestScore=Infinity;
    for(const path of g.road.paths||[]){
      if(path.closed||path.kind==='service'||path.length<140)continue;
      if(targetY<path.minY-900||targetY>path.maxY+900)continue;
      const from=nearestOnPath(path,c.x,c.y);if(from.d>470)continue;
      const to=nearestOnPath(path,targetX,targetY);if(to.d>820)continue;
      let score=from.d*.72+to.d;
      if(occupied.has(path.id))score+=1250;
      if(path.kind==='highway')score+=index===3?-90:85;
      if(path.trafficTrait==='slow')score+=55;
      score+=hash((path.branch||1)*67+index*131)*42;
      if(score<bestScore){bestScore=score;best=path;}
    }
    return best;
  }

  Game.prototype.updateCops=function(dt){
    const player=this.player,cops=this.cops||[];
    const fx=Math.cos(player.angle),fy=Math.sin(player.angle),rx=-fy,ry=fx;
    const roles=[
      {side:0,lead:70},
      {side:-250,lead:185},
      {side:250,lead:185},
      {side:0,lead:390},
    ];

    cops.forEach((c,i)=>{
      const role=roles[i%roles.length];
      let targetX=player.x+fx*role.lead+rx*role.side;
      let targetY=player.y+fy*role.lead+ry*role.side;
      let nearestMate=Infinity;
      for(const other of cops){
        if(other===c)continue;
        const dx=c.x-other.x,dy=c.y-other.y,d=Math.hypot(dx,dy);nearestMate=Math.min(nearestMate,d);
        if(d>0&&d<175){const push=(175-d)*1.6;targetX+=dx/d*push;targetY+=dy/d*push;}
      }

      c._routeTimer=(c._routeTimer??0)-dt;
      let route=(this.road.paths||[]).find(p=>p.id===c._routePathId&&!p.closed);
      if(!route||c._routeTimer<=0){
        route=chooseRoute(this,c,targetX,targetY,i);
        c._routePathId=route?.id||null;
        c._routeTimer=2.0+hash(i*97+Math.floor((performance.now()-this.startedAt)/1000))*1.6;
      }

      let routeInfo=route?nearestOnPath(route,c.x,c.y):this.road.nearestInfo(c.x,c.y);
      const direct=Math.atan2(targetY-c.y,targetX-c.x);
      let roadTarget=direct;
      if(routeInfo&&Number.isFinite(routeInfo.d)){
        let tangent=Math.atan2(routeInfo.ty,routeInfo.tx);
        if(route?.oneWay)tangent+=route.oneWay<0?Math.PI:0;
        else if(Math.cos(tangent)*(targetX-routeInfo.x)+Math.sin(tangent)*(targetY-routeInfo.y)<0)tangent+=Math.PI;
        if(routeInfo.d>(route?.width||this.env.roadWidth)*.48)roadTarget=Math.atan2(routeInfo.y-c.y,routeInfo.x-c.x);
        else roadTarget=angleLerp(tangent,direct,.18);
      }
      const target=angleLerp(roadTarget,direct,routeInfo?.d>(route?.width||this.env.roadWidth)*.55?.08:.20);
      const delta=angleWrap(target-c.angle);c.angle+=clamp(delta,-1.62*dt,1.62*dt);

      const dPlayer=dist2(c,player),catchup=clamp((dPlayer-95)/470,0,1);
      let targetSpeed=94+catchup*31+(Math.abs(role.side)>0?2:0);
      if(routeInfo?.d>(route?.width||this.env.roadWidth)*.62)targetSpeed*=.76;
      if(nearestMate<82)targetSpeed*=.82;
      targetSpeed=Math.min(COP_TOP_SPEED,targetSpeed);
      c.speed=lerp(Math.min(c.speed,COP_TOP_SPEED),targetSpeed,clamp(dt*.78,0,.20));
      c.x+=Math.cos(c.angle)*c.speed*dt;c.y+=Math.sin(c.angle)*c.speed*dt;
    });
  };

  function pathMarkerPoint(path,t){
    const q=samplePath(path,t),q2=samplePath(path,clamp(t+.015,0,1));
    let dx=q2.x-q.x,dy=q2.y-q.y,l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
    return {q,dx,dy,nx:-dy,ny:dx};
  }

  const baseDrawRoads=drawRoads;
  drawRoads=function(g){
    baseDrawRoads(g);
    const near=(g.road.paths||[]).filter(p=>p.maxY>=g.player.y-1250&&p.minY<=g.player.y+1250);
    for(const p of near){
      if(p.closed){
        const m=pathMarkerPoint(p,p.closedAt||.5),half=Math.min((p.width||120)*.38,62);
        const a=worldToScreen(m.q.x+m.nx*half,m.q.y+m.ny*half),b=worldToScreen(m.q.x-m.nx*half,m.q.y-m.ny*half);
        ctx.save();ctx.lineCap='butt';ctx.lineWidth=11;ctx.strokeStyle='rgba(238,239,232,.96)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        ctx.lineWidth=7;ctx.strokeStyle='#d4493f';ctx.setLineDash([15,11]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.restore();
      }else if(p.oneWay){
        const m=pathMarkerPoint(p,.52),dir=p.oneWay<0?-1:1,ux=m.dx*dir,uy=m.dy*dir,nx=-uy,ny=ux;
        const tip=worldToScreen(m.q.x+ux*24,m.q.y+uy*24),l=worldToScreen(m.q.x-ux*15+nx*11,m.q.y-uy*15+ny*11),r=worldToScreen(m.q.x-ux*15-nx*11,m.q.y-uy*15-ny*11);
        ctx.save();ctx.fillStyle='rgba(245,247,238,.72)';ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(l.x,l.y);ctx.lineTo(r.x,r.y);ctx.closePath();ctx.fill();ctx.restore();
      }
    }
  };

  const baseHandleCollisions=Game.prototype.handleCollisions;
  Game.prototype.handleCollisions=function(){
    baseHandleCollisions.call(this);
    this._closureCooldown=Math.max(0,(this._closureCooldown||0)-.033);
    const player=this.player;
    for(const p of this.road.paths||[]){
      if(!p.closed||Math.abs((p.minY+p.maxY)/2-player.y)>1000)continue;
      const m=pathMarkerPoint(p,p.closedAt||.5),dx=player.x-m.q.x,dy=player.y-m.q.y,d=Math.hypot(dx,dy);
      const hitRadius=Math.min(50,(p.width||120)*.31);
      if(d>=hitRadius)continue;
      const l=d||1,push=hitRadius+7;player.x=m.q.x+dx/l*push;player.y=m.q.y+dy/l*push;player.speed*=-.12;this.camera.shake=Math.max(this.camera.shake,10);
      if(this._closureCooldown<=0){audio.hit();this.spawnSparks(m.q.x,m.q.y,10);this._closureCooldown=.35;}break;
    }
  };
})();
