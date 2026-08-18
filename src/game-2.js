class RoadNetwork {
  constructor(env) {
    this.env = env;
    this.paths = [];
    this.props = [];
    this.stages = [];
    this.generate();
  }
  generate(){
    const env = this.env;
    let centerX = 0;
    let y = 260;
    const stageLen = 660;
    const count = Math.ceil((env.escapeKm*1000 + 2000)/stageLen);
    for(let i=0;i<count;i++){
      const y2 = y-stageLen;
      const drift = randRange(i*17+2, -env.curve, env.curve);
      const endX = clamp(centerX + drift, -900, 900);
      const spread = env.branchSpread * randRange(i*21+8, .72, 1.15);
      const leftBias = -spread, rightBias = spread;
      const traits = this.pickTraits(i);
      const left = this.makePath(i, 0, {x:centerX,y}, {x:endX,y:y2}, leftBias, traits[0]);
      const right = this.makePath(i, 1, {x:centerX,y}, {x:endX,y:y2}, rightBias, traits[1]);
      this.paths.push(left,right);
      this.stages.push({index:i, startY:y, endY:y2, centerX, endX, left, right, midY:(y+y2)/2});
      this.generateProps(i, centerX, endX, y, y2, spread);
      centerX=endX; y=y2;
    }
  }
  pickTraits(i){
    const options = ['clear','slow','oncoming','tight'];
    let a = options[Math.floor(hash(i*8+1)*options.length)];
    let b = options[Math.floor(hash(i*8+5)*options.length)];
    if(a===b) b = a==='clear' ? 'oncoming' : 'clear';
    if(i<1){ a='clear'; b='slow'; }
    return [a,b];
  }
  makePath(stage, branch, start, end, bias, trait){
    const bend = randRange(stage*31+branch*9+3, -.5, .5)*this.env.curve;
    const p0=start, p3=end;
    const p1={x:start.x+bias*.72+bend, y:lerp(start.y,end.y,.32)};
    const p2={x:end.x+bias*.72-bend*.4, y:lerp(start.y,end.y,.68)};
    const points=[]; const samples=34;
    for(let i=0;i<=samples;i++) points.push(cubic(p0,p1,p2,p3,i/samples));
    let length=0; for(let i=1;i<points.length;i++) length += dist2(points[i-1],points[i]);
    return {stage,branch,trait,points,length,width:this.env.roadWidth};
  }
  generateProps(stage, sx, ex, y0, y1, spread){
    const count = this.env.propMode==='city' ? 16 : 11;
    for(let j=0;j<count;j++){
      const t = (j+.3)/count;
      const y=lerp(y0,y1,t);
      const cx=lerp(sx,ex,t);
      const side = hash(stage*101+j*7)>.5?1:-1;
      const distance = spread + this.env.roadWidth*.75 + randRange(stage*51+j, 45, 220);
      this.props.push({x:cx+side*distance,y,side,seed:stage*100+j,mode:this.env.propMode});
    }
  }
  nearbyPaths(y, range=1000){ return this.paths.filter(p => p.points[p.points.length-1].y < y+range && p.points[0].y > y-range); }
  nearestInfo(x,y){
    let best={d:Infinity,x:0,y:0,tx:0,ty:-1,path:null,index:0};
    const paths=this.nearbyPaths(y,950);
    for(const p of paths){
      for(let i=1;i<p.points.length;i++){
        const a=p.points[i-1], b=p.points[i];
        const vx=b.x-a.x, vy=b.y-a.y, len2=vx*vx+vy*vy;
        const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/len2,0,1);
        const px=a.x+vx*t, py=a.y+vy*t;
        const d=Math.hypot(x-px,y-py);
        if(d<best.d){ const l=Math.sqrt(len2)||1; best={d,x:px,y:py,tx:vx/l,ty:vy/l,path:p,index:i-1}; }
      }
    }
    return best;
  }
  stageAtY(y){
    return this.stages.find(s => y<=s.startY && y>=s.endY) || this.stages[this.stages.length-1];
  }
}

class Car {
  constructor(x,y,angle,type='player'){
    this.x=x; this.y=y; this.angle=angle; this.speed=0; this.type=type;
    this.width=28; this.length=52; this.steer=0; this.hit=0; this.flash=Math.random()*10;
    this.offroad=0; this.catchTimer=0;
  }
}

class TrafficCar extends Car {
  constructor(path,t,direction,speed,color){
    const p=samplePath(path,t);
    super(p.x,p.y,p.angle+(direction<0?Math.PI:0),'traffic');
    this.path=path; this.t=t; this.direction=direction; this.baseSpeed=speed; this.color=color; this.overtaken=false;
  }
  update(dt){
    this.t += (this.baseSpeed*dt/this.path.length)*this.direction;
    if(this.t>1) this.t=0.02; if(this.t<0) this.t=.98;
    const p=samplePath(this.path,this.t); this.x=p.x; this.y=p.y; this.angle=p.angle+(this.direction<0?Math.PI:0); this.speed=this.baseSpeed*this.direction;
  }
}

function samplePath(path,t){
  t=clamp(t,0,1); const f=t*(path.points.length-1); const i=Math.min(path.points.length-2,Math.floor(f)); const q=f-i;
  const a=path.points[i],b=path.points[i+1];
  return {x:lerp(a.x,b.x,q),y:lerp(a.y,b.y,q),angle:Math.atan2(b.y-a.y,b.x-a.x)};
}
