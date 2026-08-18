(() => {
  Object.assign(ENVIRONMENTS[0], { cops:2, copPower:.72, startGap:460 });
  Object.assign(ENVIRONMENTS[1], { cops:3, copPower:.84, startGap:390 });

  function candidateSamples(g, minDistance, maxDistance) {
    const out = [];
    for (const path of g.road.paths || []) {
      if (!path.points?.length || path.feature === 'roundabout' || path.kind === 'service') continue;
      for (const t of [.12,.28,.45,.62,.80,.92]) {
        const q = samplePath(path,t);
        const dx=q.x-g.player.x,dy=q.y-g.player.y,d=Math.hypot(dx,dy);
        if (d < minDistance || d > maxDistance) continue;
        out.push({path,t,q,d,angle:Math.atan2(dy,dx)});
      }
    }
    return out;
  }

  function sectorLabel(relative) {
    const a = angleWrap(relative);
    if (Math.abs(a) < Math.PI*.28) return 'DAVANTI';
    if (Math.abs(a) > Math.PI*.72) return 'DA DIETRO';
    return a > 0 ? 'DA DESTRA' : 'DA SINISTRA';
  }

  function makeCop(g, desiredRelative, index) {
    const gap = g.env.startGap || 360;
    const desiredWorld = g.player.angle + desiredRelative;
    const samples = candidateSamples(g, gap*.68, gap*1.55);
    let pick = null;
    let best = Infinity;
    for (const s of samples) {
      const angleScore = Math.abs(angleWrap(s.angle - desiredWorld));
      const distanceScore = Math.abs(s.d-gap)/Math.max(1,gap) * .5;
      const score = angleScore + distanceScore;
      if (score < best) { best=score; pick=s; }
    }

    let x,y,angle;
    if (pick) {
      x=pick.q.x;y=pick.q.y;
      angle=pick.q.angle;
      if (Math.cos(angleWrap(Math.atan2(g.player.y-y,g.player.x-x)-angle)) < 0) angle += Math.PI;
    } else {
      x=g.player.x+Math.cos(desiredWorld)*gap;
      y=g.player.y+Math.sin(desiredWorld)*gap;
      angle=Math.atan2(g.player.y-y,g.player.x-x);
    }
    const c=new Car(x,y,angle,'cop');
    c.speed=46+index*3;c.flash=index*1.71;c._arrivalLabel=sectorLabel(desiredRelative);
    return c;
  }

  Game.prototype.spawnCops = function () {
    this.cops=[];
    this._pendingCops=[];
    const count=Math.max(1,this.env.cops||1);
    const sectors=[Math.PI, -Math.PI/2, Math.PI/2, 0, Math.PI*.72, -Math.PI*.72];
    this.cops.push(makeCop(this,sectors[0],0));
    for(let i=1;i<count;i++){
      const baseDelay=this.env.id==='neon'?9.5:this.env.id==='docks'?6.5:5.0;
      this._pendingCops.push({delay:baseDelay*i + hash(i*47)*2.4,sector:sectors[i%sectors.length],index:i});
    }
  };

  const baseUpdate = Game.prototype.update;
  Game.prototype.update = function (dt) {
    if (!this.finished && this._pendingCops?.length) {
      const elapsed=(performance.now()-this.startedAt)/1000;
      for(let i=this._pendingCops.length-1;i>=0;i--){
        const r=this._pendingCops[i];
        if(elapsed<r.delay)continue;
        const c=makeCop(this,r.sector,r.index);
        this.cops.push(c);
        this._pendingCops.splice(i,1);
        if(typeof toast==='function') toast(`RINFORZI POLIZIA ${c._arrivalLabel}`);
      }
    }
    baseUpdate.call(this,dt);
  };

  const baseSpawnTraffic=Game.prototype.spawnTraffic;
  Game.prototype.spawnTraffic=function(){
    baseSpawnTraffic.call(this);
    const eligible=(this.road.paths||[]).filter(p=>
      p.length>220 && p.stage>=1 && p.kind!=='service' && p.feature!=='roundabout' && (p.trafficWeight??.3)>.12
    );
    if(!eligible.length)return;
    const target=this.env.propMode==='industrial'?7:this.env.propMode==='city'?5:3;
    const used=new Set();
    for(let i=0;i<target;i++){
      let path=null;
      for(let attempt=0;attempt<eligible.length;attempt++){
        const idx=Math.floor(hash(800+i*61+attempt*17)*eligible.length)%eligible.length;
        const candidate=eligible[idx];
        if(!used.has(candidate.id)){path=candidate;used.add(candidate.id);break;}
      }
      path ||= eligible[i%eligible.length];
      const garbage=this.env.propMode==='city' && i%3===0;
      const direction=hash(910+i*29)<.14?-1:1;
      const speed=garbage?randRange(1000+i,20,31):path.kind==='highway'?randRange(1100+i,38,55):randRange(1200+i,27,43);
      const t=clamp(.16+hash(1300+i*17)*.72,.12,.88);
      const heavy=new TrafficCar(path,t,direction,speed,garbage?'#6f8c73':'#b7a886');
      heavy.vehicleKind=garbage?'garbage':'truck';
      heavy.width=garbage?40:38;
      heavy.length=garbage?72:82;
      heavy.baseSpeed=speed;
      this.traffic.push(heavy);
    }
  };

  function drawHeavy(t){
    const s=worldToScreen(t.x,t.y);
    if(s.x<-140||s.x>W+140||s.y<-140||s.y>H+140)return;
    const a=window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(t.angle):t.angle+Math.PI/2;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(a);
    ctx.fillStyle='rgba(0,0,0,.30)';ctx.beginPath();ctx.ellipse(4,8,t.width*.70,t.length*.56,0,0,Math.PI*2);ctx.fill();
    if(t.vehicleKind==='garbage'){
      ctx.fillStyle='#738a75';roundRect(ctx,-t.width/2,-t.length*.20,t.width,t.length*.62,5);ctx.fill();
      ctx.fillStyle='#d8ddd8';roundRect(ctx,-t.width*.46,-t.length*.48,t.width*.92,t.length*.30,4);ctx.fill();
      ctx.fillStyle='#40535b';ctx.fillRect(-t.width*.31,-t.length*.43,t.width*.62,9);
      ctx.fillStyle='#ffb23e';ctx.shadowBlur=10;ctx.shadowColor='#ffb23e';ctx.fillRect(-4,-t.length*.20,8,4);ctx.shadowBlur=0;
    }else{
      ctx.fillStyle='#9b927d';roundRect(ctx,-t.width/2,-t.length*.05,t.width,t.length*.47,3);ctx.fill();
      ctx.fillStyle='#d0d7dc';roundRect(ctx,-t.width*.47,-t.length*.49,t.width*.94,t.length*.42,5);ctx.fill();
      ctx.fillStyle='#42515b';ctx.fillRect(-t.width*.32,-t.length*.44,t.width*.64,10);
      ctx.strokeStyle='rgba(55,58,55,.45)';ctx.lineWidth=2;ctx.strokeRect(-t.width*.42,0,t.width*.84,t.length*.34);
    }
    ctx.fillStyle='#fff4cf';ctx.fillRect(-t.width*.34,-t.length*.5,7,4);ctx.fillRect(t.width*.34-7,-t.length*.5,7,4);
    ctx.fillStyle='#ff334d';ctx.fillRect(-t.width*.34,t.length*.48-3,7,4);ctx.fillRect(t.width*.34-7,t.length*.48-3,7,4);
    ctx.restore();
  }

  drawTraffic=function(g){
    for(const t of g.traffic){
      if(Math.abs(t.y-g.player.y)>=1150)continue;
      if(t.vehicleKind==='truck'||t.vehicleKind==='garbage') drawHeavy(t);
      else drawVehicle(t,{body:t.color,glass:'#111a21'});
    }
  };

  const baseHandle=Game.prototype.handleCollisions;
  Game.prototype.handleCollisions=function(){
    if(this.hitCooldown<=0){
      for(const t of this.traffic){
        if(!t.vehicleKind)continue;
        if(Math.abs(t.y-this.player.y)>95||Math.abs(t.x-this.player.x)>95)continue;
        if(dist2(t,this.player)<46){
          this.hitCooldown=.75;this.player.speed*=.42;this.camera.shake=Math.max(this.camera.shake,15);this.heat=clamp(this.heat+.07,0,1);
          this.spawnSparks((this.player.x+t.x)/2,(this.player.y+t.y)/2,18);audio.hit();
          const a=Math.atan2(this.player.y-t.y,this.player.x-t.x);this.player.x+=Math.cos(a)*16;this.player.y+=Math.sin(a)*16;break;
        }
      }
    }
    baseHandle.call(this);
  };
})();
