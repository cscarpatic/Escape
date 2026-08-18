(() => {
  const ROAD_KIND = {
    highway: { label: 'AUTOSTRADA', width: 1.18, shoulder: 22, traffic: 1.15 },
    state:   { label: 'STATALE', width: .86, shoulder: 14, traffic: .88 },
    city:    { label: 'CITTÀ', width: .68, shoulder: 8, traffic: .72 },
  };

  const trafficLabel = t => ({clear:'LIBERA', slow:'TRAFFICO', oncoming:'CONTROMANO', tight:'CURVE'})[t] || t;

  RoadNetwork = class RoadNetwork {
    constructor(env) {
      this.env = env;
      this.paths = [];
      this.props = [];
      this.stages = [];
      this.nodes = [];
      this.generate();
    }

    generate() {
      const env = this.env;
      const rowStep = env.propMode === 'city' ? 430 : 500;
      const total = env.escapeKm * 1000 + 2800;
      const rows = Math.max(12, Math.ceil(total / rowStep));
      const columns = env.propMode === 'city' ? [-820,-540,-270,0,270,540,820] : [-760,-380,0,380,760];
      const nodeRows = [];

      for (let r = 0; r <= rows; r++) {
        const y = 280 - r * rowStep;
        const row = columns.map((baseX, c) => ({
          x: baseX + randRange(r * 83 + c * 17 + 5, -95, 95),
          y: y + randRange(r * 61 + c * 29 + 7, -38, 38),
          row: r,
          col: c,
        }));
        nodeRows.push(row);
        this.nodes.push(...row);
      }

      let branchId = 0;

      for (let r = 0; r < rows; r++) {
        const row = nodeRows[r], next = nodeRows[r + 1];
        const stagePaths = [];

        for (let c = 0; c < columns.length; c++) {
          const driftChoice = hash(r * 211 + c * 37);
          let targetCol = c;
          if (driftChoice > .78 && c < columns.length - 1) targetCol++;
          else if (driftChoice < .18 && c > 0) targetCol--;

          let kind;
          const central = Math.abs(c - (columns.length - 1) / 2);
          if (central < .7) kind = 'highway';
          else if (env.propMode === 'city' && central > 1.4) kind = 'city';
          else kind = hash(r * 43 + c * 13) > .62 ? 'city' : 'state';
          if (env.propMode === 'alpine' && kind === 'city') kind = 'state';
          if (env.propMode === 'desert' && kind === 'city') kind = 'state';

          const trait = this.pickTrafficTrait(r, c, kind);
          const p = this.makeRoad(r, branchId++, row[c], next[targetCol], kind, trait, r * 307 + c * 41);
          this.paths.push(p); stagePaths.push(p);
        }

        const rampCount = env.propMode === 'city' ? 3 : 2;
        for (let k = 0; k < rampCount; k++) {
          const c = Math.floor(hash(r * 149 + k * 73 + 9) * (columns.length - 1));
          const reverse = hash(r * 191 + k * 31) > .5;
          const a = reverse ? row[c + 1] : row[c];
          const b = reverse ? next[c] : next[c + 1];
          const kind = hash(r * 79 + k * 23) > .55 ? 'state' : 'city';
          const trait = this.pickTrafficTrait(r + 3, c + k, kind);
          const p = this.makeRoad(r, branchId++, a, b, kind, trait, r * 401 + k * 97 + 11, .72);
          this.paths.push(p); stagePaths.push(p);
        }

        if (r > 0) {
          const crossYBias = randRange(r * 113, -85, 85);
          for (let c = 0; c < columns.length - 1; c++) {
            if (hash(r * 97 + c * 53) < (env.propMode === 'city' ? .92 : .68)) {
              const a = { ...row[c], y: row[c].y + crossYBias };
              const b = { ...row[c + 1], y: row[c + 1].y + crossYBias + randRange(r * 59 + c, -35, 35) };
              const kind = env.propMode === 'city' ? (c % 3 === 1 ? 'state' : 'city') : 'state';
              const trait = this.pickTrafficTrait(r + 5, c + 2, kind);
              const p = this.makeRoad(r, branchId++, a, b, kind, trait, r * 503 + c * 89 + 17, .42);
              this.paths.push(p); stagePaths.push(p);
            }
          }
        }

        if (r % 2 === 1) {
          const side = hash(r * 67) > .5 ? 1 : -1;
          const base = side > 0 ? columns.length - 2 : 1;
          const a0 = row[base], b0 = next[base];
          const offset = 145 * side;
          const a = { x: a0.x + offset, y: a0.y + 60, row:r, col:base };
          const b = { x: b0.x + offset, y: b0.y - 40, row:r+1, col:base };
          const p = this.makeRoad(r, branchId++, a, b, 'city', this.pickTrafficTrait(r + 9, base, 'city'), r * 607 + 23, .28);
          this.paths.push(p); stagePaths.push(p);
        }

        const centerX = row[Math.floor(row.length / 2)].x;
        const leftChoices = stagePaths.filter(p => p.midX < centerX).sort((a,b)=>b.width-a.width);
        const rightChoices = stagePaths.filter(p => p.midX >= centerX).sort((a,b)=>b.width-a.width);
        const left = leftChoices[0] || stagePaths[0];
        const right = rightChoices[0] || stagePaths[stagePaths.length - 1];
        this.stages.push({
          index:r,
          startY:Math.max(...row.map(n=>n.y)) + 90,
          endY:Math.min(...next.map(n=>n.y)) - 90,
          centerX,
          endX:next[Math.floor(next.length/2)].x,
          left,
          right,
          midY:(row[0].y + next[0].y) / 2,
        });

        this.generatePropsForRow(r, row, rowStep);
      }
    }

    pickTrafficTrait(r, c, kind) {
      const h = hash(r * 71 + c * 19 + (kind === 'highway' ? 2 : kind === 'city' ? 7 : 4));
      if (kind === 'highway') return h < .55 ? 'clear' : h < .78 ? 'slow' : h < .91 ? 'tight' : 'oncoming';
      if (kind === 'city') return h < .28 ? 'clear' : h < .62 ? 'slow' : h < .83 ? 'oncoming' : 'tight';
      return h < .38 ? 'clear' : h < .62 ? 'slow' : h < .82 ? 'tight' : 'oncoming';
    }

    makeRoad(stage, branch, start, end, kind, trafficTrait, seed, bendScale = 1) {
      const dx = end.x - start.x, dy = end.y - start.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len, ny = dx / len;
      const baseCurve = kind === 'highway' ? 50 : kind === 'state' ? 92 : 58;
      const bend = randRange(seed, -baseCurve, baseCurve) * bendScale;
      const p0 = {x:start.x,y:start.y}, p3 = {x:end.x,y:end.y};
      const p1 = {x:start.x + dx*.33 + nx*bend, y:start.y + dy*.33 + ny*bend};
      const p2 = {x:start.x + dx*.67 - nx*bend*.48, y:start.y + dy*.67 - ny*bend*.48};
      const samples = clamp(Math.round(len / 22), 18, 52);
      const points = [];
      for (let i=0;i<=samples;i++) points.push(cubic(p0,p1,p2,p3,i/samples));
      let length = 0;
      for (let i=1;i<points.length;i++) length += dist2(points[i-1],points[i]);
      const spec = ROAD_KIND[kind];
      const width = this.env.roadWidth * spec.width;
      const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
      return {
        stage, branch, kind, trafficTrait,
        trait:`${spec.label} · ${trafficLabel(trafficTrait)}`,
        points, length, width,
        minY:Math.min(...ys), maxY:Math.max(...ys),
        minX:Math.min(...xs), maxX:Math.max(...xs),
        midX:(start.x+end.x)/2,
        trafficWeight:spec.traffic,
      };
    }

    generatePropsForRow(stage, row, rowStep) {
      const count = this.env.propMode === 'city' ? 24 : 14;
      const minX = Math.min(...row.map(n=>n.x)), maxX = Math.max(...row.map(n=>n.x));
      const yBase = row[0].y;
      for (let j=0;j<count;j++) {
        const outside = hash(stage*101+j*7) > .35;
        const side = hash(stage*131+j*17) > .5 ? 1 : -1;
        let x;
        if (outside) x = side > 0 ? maxX + randRange(stage*211+j,160,440) : minX - randRange(stage*223+j,160,440);
        else x = randRange(stage*227+j,minX,maxX);
        const y = yBase + randRange(stage*233+j,-rowStep*.45,rowStep*.45);
        this.props.push({x,y,side,seed:stage*100+j,mode:this.env.propMode});
      }
    }

    nearbyPaths(y, range=1000) {
      return this.paths.filter(p => p.minY <= y + range && p.maxY >= y - range);
    }

    nearestInfo(x,y) {
      let best={d:Infinity,x:0,y:0,tx:0,ty:-1,path:null,index:0};
      const paths=this.nearbyPaths(y,1100);
      for(const p of paths){
        if (x < p.minX - 900 || x > p.maxX + 900) continue;
        for(let i=1;i<p.points.length;i++){
          const a=p.points[i-1], b=p.points[i];
          const vx=b.x-a.x, vy=b.y-a.y, len2=vx*vx+vy*vy;
          const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/(len2||1),0,1);
          const px=a.x+vx*t, py=a.y+vy*t;
          const d=Math.hypot(x-px,y-py);
          if(d<best.d){ const l=Math.sqrt(len2)||1; best={d,x:px,y:py,tx:vx/l,ty:vy/l,path:p,index:i-1}; }
        }
      }
      return best;
    }

    stageAtY(y) {
      return this.stages.find(s => y <= s.startY && y >= s.endY) ||
        this.stages.reduce((best,s)=>Math.abs(s.midY-y)<Math.abs(best.midY-y)?s:best,this.stages[0]);
    }
  };

  Game.prototype.spawnTraffic = function () {
    const colors=['#d8dfe6','#62788d','#d9b267','#7b8087','#a34b4b','#54735f','#554f78','#b7a7a2'];
    let spawned = 0;
    const cap = Math.round(62 + this.env.traffic * 28);
    for (const p of this.road.paths) {
      if (p.stage < 1 || spawned >= cap) continue;
      const density = this.env.traffic * (p.trafficWeight || .8);
      const roll = hash(p.stage*19+p.branch*7);
      let count = roll < density*.42 ? 1 : 0;
      if (p.kind === 'highway' && roll < density*.18) count++;
      if (p.trafficTrait === 'clear') count = Math.min(count,1);
      if (p.trafficTrait === 'slow' && roll < .5) count++;
      for (let j=0;j<count && spawned<cap;j++) {
        const oncomingChance = p.trafficTrait === 'oncoming' ? .7 : this.env.oncoming * .42;
        const direction = hash(p.branch*31+j*11) < oncomingChance ? -1 : 1;
        const speed = direction<0 ? randRange(p.branch*91+j,72,122) :
          p.kind==='highway' ? randRange(p.branch*73+j,82,132) :
          p.trafficTrait==='slow' ? randRange(p.branch*67+j,24,52) : randRange(p.branch*65+j,48,82);
        const t=clamp(.14+hash(p.branch*43+j*29)*.74,.08,.92);
        this.traffic.push(new TrafficCar(p,t,direction,speed,colors[(p.stage+j+p.branch)%colors.length]));
        spawned++;
      }
    }
  };

  Game.prototype.updatePlayer = function (dt) {
    const p=this.player;
    const up=keys.has('ArrowUp')||keys.has('KeyW');
    const down=keys.has('ArrowDown')||keys.has('KeyS');
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const hand=keys.has('Space');
    const roadInfo=this.road.nearestInfo(p.x,p.y);
    const roadWidth=(roadInfo.path?.width || this.env.roadWidth);
    const onRoad=roadInfo.d < roadWidth*.54;
    p.offroad=lerp(p.offroad,onRoad?0:1,Math.min(1,dt*4));
    const accel=onRoad?100:62;
    const max=onRoad?184:(this.env.offroadMax||96);
    if(up)p.speed+=accel*dt; else p.speed-=24*dt;
    if(down)p.speed-=(p.speed>0?128:50)*dt;
    if(hand)p.speed*=Math.pow(.82,dt*8);
    p.speed=clamp(p.speed,-30,max);
    const steerInput=(right?1:0)-(left?1:0);
    const steerStrength=(1.36-clamp(Math.abs(p.speed)/235,0,.48))*(hand?1.34:1);
    p.steer=lerp(p.steer,steerInput,1-Math.pow(.045,dt));
    p.angle+=p.steer*steerStrength*dt*(p.speed/100);
    if(onRoad&&Math.abs(steerInput)<.01&&p.speed>34){
      let roadAngle=Math.atan2(roadInfo.ty,roadInfo.tx);
      if(Math.cos(angleWrap(roadAngle-p.angle))<0) roadAngle+=Math.PI;
      p.angle=angleLerp(p.angle,roadAngle,clamp(dt*(this.env.steerAssist||0),0,.04));
    }
    if(!onRoad){p.speed*=Math.pow(.62,dt);if(Math.abs(p.speed)>48&&Math.random()<dt*12)this.spawnDust(p.x,p.y);}
    const vx=Math.cos(p.angle)*p.speed,vy=Math.sin(p.angle)*p.speed;
    p.x+=vx*dt;p.y+=vy*dt;
    this.distance+=Math.max(0,p.speed)*dt;
    this.maxSpeed=Math.max(this.maxSpeed,Math.abs(p.speed)*1.42);
    if(hand&&Math.abs(p.speed)>70&&Math.random()<dt*24)this.spawnSmoke(p.x-Math.cos(p.angle)*24,p.y-Math.sin(p.angle)*24);
  };

  drawRoads = function(g) {
    const env=g.env, near=g.road.nearbyPaths(g.player.y,1350);
    ctx.lineCap='round';ctx.lineJoin='round';
    const ordered=[...near].sort((a,b)=>b.width-a.width);
    for(const p of ordered){
      const pts=p.points.map(q=>worldToScreen(q.x,q.y));
      const kind=p.kind||'state';
      const shoulder=kind==='highway'?24:kind==='state'?14:8;
      const roadColor=kind==='highway'?'#151b21':kind==='city'?'#20242a':env.road;
      strokePath(pts,env.shoulder,p.width+shoulder);
      strokePath(pts,roadColor,p.width);
      ctx.save();ctx.globalAlpha=kind==='city'?.23:.34;strokePath(pts,'rgba(255,255,255,.065)',Math.max(4,p.width-12));ctx.restore();
      ctx.save();
      if(kind==='highway'){
        ctx.setLineDash([30,28]);ctx.lineDashOffset=(performance.now()*.012)%58;strokePath(pts,'#c7d1d8',2.2);
        ctx.globalAlpha=.45;ctx.setLineDash([]);strokePath(pts,'rgba(255,211,106,.75)',1);
      } else if(kind==='state'){
        ctx.setLineDash([20,28]);ctx.lineDashOffset=(performance.now()*.009)%48;strokePath(pts,env.lane,1.8);
      } else {
        ctx.setLineDash([9,18]);ctx.globalAlpha=.6;strokePath(pts,'rgba(220,228,235,.7)',1.3);
      }
      ctx.restore();
      if(kind==='city'&&env.propMode==='city'){
        ctx.save();ctx.globalAlpha=.12;ctx.setLineDash([3,8]);strokePath(pts,env.accent,1);ctx.restore();
      }
    }
  };

  function drawBeaconReveal(d, cop, radius, angle) {
    const s=worldToScreen(cop.x,cop.y);
    d.save();d.translate(s.x,s.y);d.rotate(angle);
    const grad=d.createLinearGradient(0,0,radius,0);
    grad.addColorStop(0,'rgba(255,255,255,.34)');grad.addColorStop(.48,'rgba(255,255,255,.14)');grad.addColorStop(1,'rgba(255,255,255,0)');
    d.fillStyle=grad;d.globalAlpha=.8;
    d.beginPath();d.moveTo(0,0);d.lineTo(radius,-radius*.34);d.lineTo(radius,radius*.34);d.closePath();d.fill();d.restore();
  }

  function drawBeaconColor(g) {
    const now=performance.now();
    for(const c of g.cops){
      if(Math.abs(c.y-g.player.y)>1100) continue;
      const s=worldToScreen(c.x,c.y);
      const base=now*.0028+c.flash;
      const beams=[{a:base,color:'46,166,255'},{a:base+Math.PI,color:'255,53,86'}];
      ctx.save();
      for(const beam of beams){
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(beam.a);
        const L=210,Wb=86;
        const grad=ctx.createLinearGradient(0,0,L,0);
        grad.addColorStop(0,`rgba(${beam.color},.26)`);grad.addColorStop(.55,`rgba(${beam.color},.11)`);grad.addColorStop(1,`rgba(${beam.color},0)`);
        ctx.fillStyle=grad;ctx.globalCompositeOperation='screen';
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(L,-Wb);ctx.lineTo(L,Wb);ctx.closePath();ctx.fill();
        ctx.restore();
      }
      const flash=Math.sin(now*.018+c.flash)>0;
      const col=flash?'46,166,255':'255,53,86';
      const glow=ctx.createRadialGradient(s.x,s.y,2,s.x,s.y,86);
      glow.addColorStop(0,`rgba(${col},.32)`);glow.addColorStop(1,`rgba(${col},0)`);
      ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.fillRect(s.x-86,s.y-86,172,172);
      ctx.restore();
    }
  }

  drawNightMask = function(g) {
    const d=darknessCtx,env=g.env;d.setTransform(DPR,0,0,DPR,0,0);d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
    d.fillStyle=`rgba(0,2,7,${.91+env.fog*.22})`;d.fillRect(0,0,W,H);
    d.globalCompositeOperation='destination-out';
    addLight(d,g.player,280*env.visibility,118,1);
    const now=performance.now();
    for(const c of g.cops){
      if(Math.abs(c.y-g.player.y)<1050){
        addLight(d,c,230*env.visibility,96,.78);
        const a=now*.0028+c.flash;
        drawBeaconReveal(d,c,230,a);drawBeaconReveal(d,c,230,a+Math.PI);
        const s=worldToScreen(c.x,c.y);const rg=d.createRadialGradient(s.x,s.y,2,s.x,s.y,92);rg.addColorStop(0,'rgba(255,255,255,.34)');rg.addColorStop(1,'rgba(255,255,255,0)');d.fillStyle=rg;d.globalAlpha=1;d.beginPath();d.arc(s.x,s.y,92,0,Math.PI*2);d.fill();
      }
    }
    for(const t of g.traffic){if(Math.abs(t.y-g.player.y)<680)addLight(d,t,155*env.visibility,64,.38);}
    d.globalCompositeOperation='source-over';ctx.drawImage(darknessCanvas,0,0,W,H);
    drawBeaconColor(g);
  };
})();