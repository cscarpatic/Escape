class Game {
  constructor(env){
    this.env=env; this.road=new RoadNetwork(env);
    this.player=new Car(0,130,-Math.PI/2,'player');
    this.player.speed=62;
    this.camera={x:0,y:-70,shake:0};
    this.cops=[]; this.traffic=[]; this.particles=[];
    this.distance=0; this.maxSpeed=0; this.overtakes=0; this.heat=env.heat; this.catch=0;
    this.startedAt=performance.now(); this.lastJunction=-1; this.finished=false; this.hitCooldown=0;
    this.spawnCops(); this.spawnTraffic();
  }
  spawnCops(){
    for(let i=0;i<this.env.cops;i++){
      const c=new Car((i-(this.env.cops-1)/2)*42, 250+i*46, -Math.PI/2,'cop');
      c.speed=68+i*2; c.flash=i*1.7; this.cops.push(c);
    }
  }
  spawnTraffic(){
    const colors=['#d8dfe6','#62788d','#d9b267','#7b8087','#a34b4b','#54735f'];
    for(const p of this.road.paths){
      if(p.stage<1) continue;
      const base = p.trait==='clear' ? .32 : p.trait==='slow' ? 1.35 : p.trait==='oncoming' ? 1.25 : .75;
      const count=Math.max(0,Math.round(base*this.env.traffic + hash(p.stage*19+p.branch)*1.2));
      for(let j=0;j<count;j++){
        const direction = p.trait==='oncoming' && (j%2===0 || hash(j+p.stage) < this.env.oncoming) ? -1 : 1;
        const speed = direction<0 ? randRange(p.stage*91+j,75,115) : p.trait==='slow' ? randRange(p.stage*73+j,25,52) : randRange(p.stage*65+j,50,78);
        const t=clamp(.2+(j+1)/(count+2)*.65+randRange(j*15+p.stage,-.08,.08),.08,.92);
        this.traffic.push(new TrafficCar(p,t,direction,speed,colors[(p.stage+j+p.branch)%colors.length]));
      }
    }
  }
  update(dt){
    if(this.finished) return;
    dt=Math.min(dt,.033);
    this.hitCooldown=Math.max(0,this.hitCooldown-dt);
    this.updatePlayer(dt);
    this.traffic.forEach(t=>t.update(dt));
    this.updateCops(dt);
    this.handleCollisions();
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.updateGameState(dt);
  }
  updatePlayer(dt){
    const p=this.player;
    const up=keys.has('ArrowUp')||keys.has('KeyW');
    const down=keys.has('ArrowDown')||keys.has('KeyS');
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const hand=keys.has('Space');
    const roadInfo=this.road.nearestInfo(p.x,p.y);
    const onRoad=roadInfo.d < this.env.roadWidth*.54;
    p.offroad=lerp(p.offroad,onRoad?0:1,Math.min(1,dt*5));
    const accel=onRoad?95:45;
    const max=onRoad?182:78;
    if(up) p.speed += accel*dt;
    else p.speed -= 28*dt;
    if(down) p.speed -= (p.speed>0?140:55)*dt;
    if(hand) p.speed *= Math.pow(.79,dt*8);
    p.speed=clamp(p.speed,-32,max);
    const steerInput=(right?1:0)-(left?1:0);
    const steerStrength=(1.8-clamp(Math.abs(p.speed)/210,0,.62))*(hand?1.5:1);
    p.steer=lerp(p.steer,steerInput,1-Math.pow(.001,dt));
    p.angle += p.steer*steerStrength*dt*(p.speed/95);
    if(!onRoad){ p.speed *= Math.pow(.38,dt); if(Math.abs(p.speed)>54 && Math.random()<dt*12) this.spawnDust(p.x,p.y); }
    const vx=Math.cos(p.angle)*p.speed, vy=Math.sin(p.angle)*p.speed;
    p.x+=vx*dt; p.y+=vy*dt;
    const forwardProgress=Math.max(0,-vy*dt);
    this.distance+=forwardProgress;
    this.maxSpeed=Math.max(this.maxSpeed,Math.abs(p.speed)*1.42);
    if(hand && Math.abs(p.speed)>70 && Math.random()<dt*24) this.spawnSmoke(p.x-Math.cos(p.angle)*24,p.y-Math.sin(p.angle)*24);
  }
  updateCops(dt){
    const p=this.player;
    this.cops.forEach((c,i)=>{
      const info=this.road.nearestInfo(c.x,c.y);
      const direct=Math.atan2(p.y-c.y,p.x-c.x);
      let tangent=Math.atan2(info.ty,info.tx);
      if(Math.sin(tangent)>0) tangent+=Math.PI;
      const off=info.d>this.env.roadWidth*.5;
      const roadTarget=off ? Math.atan2(info.y-c.y,info.x-c.x) : tangent;
      let target=angleLerp(roadTarget,direct,off?.28:.55);
      target += (i-(this.cops.length-1)/2)*.015;
      const delta=angleWrap(target-c.angle);
      c.angle += clamp(delta,-1.45*dt,1.45*dt);
      const d=dist2(c,p);
      const catchup=clamp((d-55)/320,0,1);
      const targetSpeed=(165+catchup*35)*this.env.copPower;
      c.speed=lerp(c.speed,targetSpeed,dt*.6);
      if(off)c.speed*=Math.pow(.54,dt);
      c.x+=Math.cos(c.angle)*c.speed*dt; c.y+=Math.sin(c.angle)*c.speed*dt;
    });
  }
  handleCollisions(){
    const p=this.player;
    if(this.hitCooldown<=0){
      for(const t of this.traffic){
        if(Math.abs(t.y-p.y)>75||Math.abs(t.x-p.x)>75) continue;
        if(dist2(t,p)<35){
          this.hitCooldown=.65; p.speed*=.54; this.camera.shake=Math.max(this.camera.shake,13); this.heat=clamp(this.heat+.08,0,1);
          this.spawnSparks((p.x+t.x)/2,(p.y+t.y)/2,16); audio.hit();
          const a=Math.atan2(p.y-t.y,p.x-t.x); p.x+=Math.cos(a)*12; p.y+=Math.sin(a)*12; break;
        }
      }
    }
    for(const t of this.traffic){
      if(t.direction>0 && !t.overtaken && p.y<t.y-55){ t.overtaken=true; this.overtakes++; }
    }
  }
  updateParticles(dt){
    for(let i=this.particles.length-1;i>=0;i--){
      const q=this.particles[i]; q.life-=dt; if(q.life<=0){this.particles.splice(i,1);continue;}
      q.x+=q.vx*dt; q.y+=q.vy*dt; q.vx*=Math.pow(.2,dt); q.vy*=Math.pow(.2,dt); q.size+=q.grow*dt;
    }
  }
  updateCamera(dt){
    const look=160+clamp(this.player.speed,0,180)*.55;
    const tx=this.player.x+Math.cos(this.player.angle)*look*.28;
    const ty=this.player.y+Math.sin(this.player.angle)*look;
    this.camera.x=lerp(this.camera.x,tx,1-Math.pow(.0009,dt));
    this.camera.y=lerp(this.camera.y,ty,1-Math.pow(.0009,dt));
    this.camera.shake*=Math.pow(.02,dt);
  }
  updateGameState(dt){
    const minCop=Math.min(...this.cops.map(c=>dist2(c,this.player)));
    const danger=clamp(1-minCop/550,0,1);
    this.heat=clamp(lerp(this.heat,.35+danger*.65,dt*.15),0,1);
    if(minCop<42){ this.catch+=dt; } else this.catch=Math.max(0,this.catch-dt*1.8);
    const stage=this.road.stageAtY(this.player.y);
    if(stage && stage.index!==this.lastJunction){
      const toSplit=Math.abs(this.player.y-stage.startY);
      if(toSplit<190 && stage.index>0){
        this.lastJunction=stage.index;
        const L=traitLabel(stage.left.trait),R=traitLabel(stage.right.trait);
        ui.junctionText.textContent=`SINISTRA: ${L}  ·  DESTRA: ${R}`;
        ui.junctionHint.classList.remove('hidden');
        setTimeout(()=>ui.junctionHint.classList.add('hidden'),2400);
      }
    }
    if(this.catch>.72) this.end(false);
    if(this.distance>=this.env.escapeKm*1000) this.end(true);
    this.updateHud(minCop);
  }
  updateHud(minCop){
    const kmh=Math.round(Math.abs(this.player.speed)*1.42);
    ui.speed.textContent=kmh;
    ui.distance.textContent=(this.distance/1000).toFixed(1)+' km';
    const pct=clamp(this.distance/(this.env.escapeKm*1000),0,1);
    ui.progress.style.width=(pct*100).toFixed(1)+'%';
    ui.objective.textContent=`${(this.distance/1000).toFixed(1)} / ${this.env.escapeKm.toFixed(1)} km`;
    ui.heat.style.width=(this.heat*100).toFixed(0)+'%';
    const stars=Math.round(1+this.heat*4); ui.heatText.textContent='★'.repeat(stars)+'☆'.repeat(5-stars);
    ui.copDistance.textContent=`PATTUGLIA: ${Math.max(0,Math.round(minCop*.78))} m`;
    audio.update(this.player.speed,minCop,state==='playing');
  }
  spawnSparks(x,y,n){
    for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2,s=40+Math.random()*160; this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.18+Math.random()*.35,size:1+Math.random()*2,grow:-.5,type:'spark'}); }
  }
  spawnSmoke(x,y){ this.particles.push({x,y,vx:(Math.random()-.5)*15,vy:(Math.random()-.5)*15,life:.45+Math.random()*.5,size:5+Math.random()*6,grow:18,type:'smoke'}); }
  spawnDust(x,y){ this.particles.push({x,y,vx:(Math.random()-.5)*28,vy:(Math.random()-.5)*28,life:.35+Math.random()*.4,size:4+Math.random()*6,grow:14,type:'dust'}); }
  end(win){
    if(this.finished)return; this.finished=true; state='result';
    ui.hud.classList.add('hidden'); ui.result.classList.remove('hidden');
    ui.resultEyebrow.textContent=win?'FUGA COMPLETATA':'FINE CORSA';
    ui.resultTitle.textContent=win?'SEI SPARITO NEL BUIO.':'BLOCCATO.';
    ui.resultCopy.textContent=win?'Le pattuglie hanno perso il contatto. Il bottino è salvo.':'Una pattuglia ti ha chiuso la strada e ti ha raggiunto.';
    ui.resultDistance.textContent=(this.distance/1000).toFixed(1)+' km';
    ui.resultSpeed.textContent=Math.round(this.maxSpeed)+' km/h';
    ui.resultOvertakes.textContent=this.overtakes;
    audio.burst(win?520:92,.22,win?'sine':'square');
  }
}

function traitLabel(t){ return ({clear:'LIBERA',slow:'TRAFFICO LENTO',oncoming:'CONTROMANO',tight:'CURVE STRETTE'})[t]||t; }
