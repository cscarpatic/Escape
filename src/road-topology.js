(() => {
  // Coherent road graph: every normal junction is a shared node. Roads only cross
  // without connecting when an explicit bridge/underpass level is assigned.
  const KINDS = {
    highway:{label:'AUTOSTRADA',width:1.18,traffic:1.12},
    state:{label:'STATALE',width:.84,traffic:.82},
    city:{label:'CITTADINA',width:.58,traffic:.48},
    alley:{label:'VICOLO',width:.34,traffic:.10},
    ramp:{label:'RAMPA',width:.44,traffic:.22},
  };
  const FEATURE_LABEL={roundabout:'ROTATORIA',interchange:'SVINCOLO',bridge:'PONTE',underpass:'SOTTOPASSO',tjunction:'INCROCIO A T',fourway:'INCROCIO A 4 VIE',oneway:'SENSO UNICO',alley:'VICOLO'};

  class TopologyRoadNetwork {
    constructor(env){
      this.env=env;this.paths=[];this.props=[];this.stages=[];this.nodes=[];this.nodeMap=new Map();this.edgeId=0;
      this.generate();
    }
    node(id,x,y,meta={}){
      if(this.nodeMap.has(id)) return this.nodeMap.get(id);
      const n={id,x,y,level:meta.level||0,type:meta.type||'junction',edges:[]};
      this.nodeMap.set(id,n);this.nodes.push(n);return n;
    }
    edge(a,b,opt={}){
      if(typeof a==='string')a=this.nodeMap.get(a);if(typeof b==='string')b=this.nodeMap.get(b);if(!a||!b)return null;
      const kind=opt.kind||'city',spec=KINDS[kind]||KINDS.city;
      let anchors=opt.via?[a,...opt.via,b]:[a,b];
      const pts=[];
      for(let s=1;s<anchors.length;s++){
        const p0=anchors[s-1],p3=anchors[s],dx=p3.x-p0.x,dy=p3.y-p0.y,len=Math.max(1,Math.hypot(dx,dy));
        const nx=-dy/len,ny=dx/len;
        const bend=(opt.curve===0?0:randRange((this.edgeId+1)*97+s*19,-(opt.curve??(kind==='highway'?34:kind==='state'?48:18)),opt.curve??(kind==='highway'?34:kind==='state'?48:18)));
        const p1={x:p0.x+dx*.33+nx*bend,y:p0.y+dy*.33+ny*bend};
        const p2={x:p0.x+dx*.67-nx*bend*.45,y:p0.y+dy*.67-ny*bend*.45};
        const samples=Math.max(4,Math.ceil(len/26));
        for(let i=s===1?0:1;i<=samples;i++)pts.push(cubic(p0,p1,p2,p3,i/samples));
      }
      let length=0;for(let i=1;i<pts.length;i++)length+=dist2(pts[i-1],pts[i]);
      const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
      const trafficTrait=opt.trafficTrait||this.traitFor(kind,this.edgeId);
      const path={
        id:`E${this.edgeId++}`,stage:opt.stage||0,branch:this.edgeId,kind,trafficTrait,
        trait:`${FEATURE_LABEL[opt.feature]||spec.label} · ${trafficTrait.toUpperCase()}`,
        points:pts,length,width:this.env.roadWidth*spec.width,
        minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),midX:(a.x+b.x)/2,
        trafficWeight:opt.trafficWeight??spec.traffic,feature:opt.feature||null,oneWay:opt.oneWay||0,level:opt.level||0,
        nodeA:a.id,nodeB:b.id,topology:true,
      };
      this.paths.push(path);a.edges.push(path.id);b.edges.push(path.id);return path;
    }
    traitFor(kind,seed){
      const h=hash(seed*47+11);
      if(kind==='highway')return h<.64?'clear':h<.86?'slow':'tight';
      if(kind==='alley'||kind==='ramp')return 'clear';
      if(kind==='city')return h<.35?'clear':h<.68?'slow':h<.86?'oncoming':'tight';
      return h<.46?'clear':h<.70?'slow':h<.88?'tight':'oncoming';
    }
    generate(){
      const env=this.env;
      const step=440,total=env.escapeKm*1000+3000,rows=Math.max(14,Math.ceil(total/step));
      const Y=r=>260-r*step;
      const H=[],W=[],E=[],FW=[],FE=[];
      for(let r=0;r<=rows;r++){
        const y=Y(r),hx=Math.sin(r*.53)*110+Math.sin(r*.19)*55;
        H[r]=this.node(`H${r}`,hx,y,{type:'highway'});
        W[r]=this.node(`W${r}`,-650+Math.sin(r*.41+1.2)*105,y+Math.sin(r*.35)*24,{type:'state'});
        E[r]=this.node(`E${r}`,650+Math.sin(r*.37+2.0)*110,y+Math.sin(r*.31+1)*24,{type:'state'});
        FW[r]=this.node(`FW${r}`,hx-205+Math.sin(r*.29)*28,y,{type:'frontage'});
        FE[r]=this.node(`FE${r}`,hx+205+Math.sin(r*.27+2)*28,y,{type:'frontage'});
      }
      for(let r=0;r<rows;r++){
        this.edge(H[r],H[r+1],{kind:'highway',stage:r,feature:r%7===4?'bridge':null,curve:30});
        this.edge(W[r],W[r+1],{kind:'state',stage:r,curve:44});
        this.edge(E[r],E[r+1],{kind:'state',stage:r,curve:44});
        this.edge(FW[r],FW[r+1],{kind:'city',stage:r,curve:20,trafficWeight:.34});
        this.edge(FE[r],FE[r+1],{kind:'city',stage:r,curve:20,trafficWeight:.34});
      }

      // Cross-state roads. At interchange rows the crossing is explicitly an underpass;
      // otherwise roads terminate at frontage T-junctions instead of magically crossing the motorway.
      for(let r=1;r<rows;r+=2){
        const interchange=r%6===3;
        if(interchange){
          const ul=this.node(`UL${r}`,H[r].x-235,H[r].y,{level:-1,type:'underpass'});
          const ur=this.node(`UR${r}`,H[r].x+235,H[r].y,{level:-1,type:'underpass'});
          this.edge(W[r],ul,{kind:'state',stage:r,feature:'interchange'});
          this.edge(ul,ur,{kind:'state',stage:r,feature:'underpass',level:-1,curve:0});
          this.edge(ur,E[r],{kind:'state',stage:r,feature:'interchange'});
          // Four ramps: the only connections between motorway and cross road.
          const n=Math.max(0,r-1),s=Math.min(rows,r+1);
          this.edge(ul,H[n],{kind:'ramp',stage:r,feature:'interchange',oneWay:1,curve:78,trafficWeight:.16});
          this.edge(H[s],ul,{kind:'ramp',stage:r,feature:'interchange',oneWay:1,curve:78,trafficWeight:.16});
          this.edge(ur,H[s],{kind:'ramp',stage:r,feature:'interchange',oneWay:1,curve:78,trafficWeight:.16});
          this.edge(H[n],ur,{kind:'ramp',stage:r,feature:'interchange',oneWay:1,curve:78,trafficWeight:.16});
        }else{
          this.edge(W[r],FW[r],{kind:'state',stage:r,feature:'tjunction',curve:18});
          this.edge(FE[r],E[r],{kind:'state',stage:r,feature:'tjunction',curve:18});
        }
      }

      // Alternating urban/industrial districts: rectangular blocks with a real roundabout
      // replacing the central four-way intersection. All approaches end on the ring ports.
      for(let r=2;r<rows-2;r+=4){
        const west=((r/4)|0)%2===0;
        this.makeDistrict(r,west?W:FE,west?FW:E,west?'W':'E');
      }

      // Extra T-junction escape roads out toward the map edges.
      for(let r=2;r<rows-1;r+=3){
        const west=hash(r*73)>.5,anchor=west?W[r]:E[r],side=west?-1:1;
        const end=this.node(`DEAD${r}`,anchor.x+side*(360+hash(r*29)*180),anchor.y+randRange(r*31,-65,65),{type:'deadend'});
        this.edge(anchor,end,{kind:env.propMode==='city'?'city':'state',stage:r,feature:'tjunction',trafficWeight:.18,curve:25});
      }

      // Stage metadata for the existing HUD/junction logic.
      for(let r=0;r<rows;r++){
        const left=this.paths.find(p=>p.nodeA===W[r].id&&p.nodeB===W[r+1].id)||this.paths[0];
        const right=this.paths.find(p=>p.nodeA===E[r].id&&p.nodeB===E[r+1].id)||left;
        this.stages.push({index:r,startY:Y(r)+90,endY:Y(r+1)-90,centerX:H[r].x,endX:H[r+1].x,left,right,midY:(Y(r)+Y(r+1))/2});
      }
      this.generateProps(rows,Y,W,E);
    }
    makeDistrict(r,outer,inner,tag){
      const yTop=outer[r].y,yMid=outer[r+1].y,yBottom=outer[r+2].y;
      const xTop=(outer[r].x+inner[r].x)/2,xMid=(outer[r+1].x+inner[r+1].x)/2,xBottom=(outer[r+2].x+inner[r+2].x)/2;
      const CT=this.node(`D${tag}${r}T`,xTop,yTop,{type:'fourway'});
      const CB=this.node(`D${tag}${r}B`,xBottom,yBottom,{type:'fourway'});
      const cx=xMid,cy=yMid,rad=58;
      const RN=this.node(`D${tag}${r}RN`,cx,cy-rad,{type:'roundabout'}),RE=this.node(`D${tag}${r}RE`,cx+rad,cy,{type:'roundabout'}),RS=this.node(`D${tag}${r}RS`,cx,cy+rad,{type:'roundabout'}),RW=this.node(`D${tag}${r}RW`,cx-rad,cy,{type:'roundabout'});
      // Top and bottom city streets share actual junction nodes.
      this.edge(outer[r],CT,{kind:'city',stage:r,feature:'fourway',curve:0});this.edge(CT,inner[r],{kind:'city',stage:r,feature:'fourway',curve:0});
      this.edge(outer[r+2],CB,{kind:'city',stage:r+1,feature:'fourway',curve:0});this.edge(CB,inner[r+2],{kind:'city',stage:r+1,feature:'fourway',curve:0});
      // Central approaches terminate at the ring, not at an overlapping center point.
      const leftSide=outer[r+1].x<inner[r+1].x;
      this.edge(outer[r+1],leftSide?RW:RE,{kind:'city',stage:r+1,feature:'roundabout',curve:0});
      this.edge(leftSide?RE:RW,inner[r+1],{kind:'city',stage:r+1,feature:'roundabout',curve:0});
      this.edge(CT,RN,{kind:'city',stage:r,feature:'roundabout',curve:0});this.edge(RS,CB,{kind:'city',stage:r+1,feature:'roundabout',curve:0});
      // Ring itself is four directed arcs, making a genuine circular junction.
      this.edge(RN,RE,{kind:'city',stage:r+1,feature:'roundabout',oneWay:1,via:[{x:cx+rad*.72,y:cy-rad*.72}],curve:0,trafficWeight:.22});
      this.edge(RE,RS,{kind:'city',stage:r+1,feature:'roundabout',oneWay:1,via:[{x:cx+rad*.72,y:cy+rad*.72}],curve:0,trafficWeight:.22});
      this.edge(RS,RW,{kind:'city',stage:r+1,feature:'roundabout',oneWay:1,via:[{x:cx-rad*.72,y:cy+rad*.72}],curve:0,trafficWeight:.22});
      this.edge(RW,RN,{kind:'city',stage:r+1,feature:'roundabout',oneWay:1,via:[{x:cx-rad*.72,y:cy-rad*.72}],curve:0,trafficWeight:.22});
      // A narrow one-way alley runs around the outside of the block, never through another road.
      const side=outer[r].x<inner[r].x?-1:1;
      const A=this.node(`D${tag}${r}A`,outer[r].x+side*150,yTop,{type:'alley'}),B=this.node(`D${tag}${r}B2`,outer[r+2].x+side*150,yBottom,{type:'alley'});
      this.edge(outer[r],A,{kind:'alley',stage:r,feature:'alley',oneWay:1,curve:0,trafficWeight:.05});
      this.edge(A,B,{kind:'alley',stage:r,feature:'oneway',oneWay:1,curve:16,trafficWeight:.07});
      this.edge(B,outer[r+2],{kind:'alley',stage:r+1,feature:'alley',oneWay:1,curve:0,trafficWeight:.05});
    }
    generateProps(rows,Y,W,E){
      const cityish=this.env.propMode==='city'||this.env.propMode==='industrial';
      for(let r=0;r<rows;r++){
        const y=Y(r)-210;
        for(let j=0;j<(cityish?18:10);j++){
          const side=hash(r*101+j*17)>.5?1:-1;
          const outer=side<0?W[r].x:E[r].x;
          const x=outer+side*randRange(r*211+j,170,520);
          this.props.push({x,y:y+randRange(r*223+j,-180,180),side,seed:r*100+j,mode:this.env.propMode});
        }
      }
    }
    nearbyPaths(y,range=1000){return this.paths.filter(p=>p.minY<=y+range&&p.maxY>=y-range);}
    nearestInfo(x,y){
      let best={d:Infinity,x:0,y:0,tx:0,ty:-1,path:null,index:0};
      for(const p of this.nearbyPaths(y,1150)){
        if(x<p.minX-800||x>p.maxX+800)continue;
        for(let i=1;i<p.points.length;i++){
          const a=p.points[i-1],b=p.points[i],vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy||1;
          const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/len2,0,1),px=a.x+vx*t,py=a.y+vy*t,d=Math.hypot(x-px,y-py);
          if(d<best.d){const l=Math.sqrt(len2);best={d,x:px,y:py,tx:vx/l,ty:vy/l,path:p,index:i-1};}
        }
      }
      return best;
    }
    stageAtY(y){return this.stages.find(s=>y<=s.startY&&y>=s.endY)||this.stages.reduce((a,b)=>Math.abs(a.midY-y)<Math.abs(b.midY-y)?a:b,this.stages[0]);}
  }

  RoadNetwork=TopologyRoadNetwork;

  // Traffic is placed only on sensible edges. Short connector/ramp traffic is sparse,
  // and one-way edges enforce their direction.
  Game.prototype.spawnTraffic=function(){
    const colors=['#d8dfe6','#62788d','#d9b267','#7b8087','#a34b4b','#54735f','#554f78','#b7a7a2'];
    let spawned=0,cap=Math.round(54+this.env.traffic*24);
    for(const p of this.road.paths){
      if(spawned>=cap||p.stage<1||p.length<120)continue;
      const weight=p.trafficWeight??.4,roll=hash(p.branch*37+p.stage*19);
      if(roll>Math.min(.82,this.env.traffic*weight*.54))continue;
      const count=(p.kind==='highway'&&roll<.18)?2:1;
      for(let j=0;j<count&&spawned<cap;j++){
        const direction=p.oneWay||((hash(p.branch*53+j*7)<(p.trafficTrait==='oncoming'?.66:this.env.oncoming*.32))?-1:1);
        const speed=direction<0?randRange(p.branch*91+j,68,116):p.kind==='highway'?randRange(p.branch*73+j,82,130):p.trafficTrait==='slow'?randRange(p.branch*67+j,24,50):randRange(p.branch*65+j,45,82);
        const t=clamp(.16+hash(p.branch*43+j*29)*.68,.08,.92);
        this.traffic.push(new TrafficCar(p,t,direction,speed,colors[(p.stage+j+p.branch)%colors.length]));spawned++;
      }
    }
  };

  // Draw by elevation: underpasses first, surface network second, bridges last.
  function drawEdge(g,p){
    const pts=p.points.map(q=>worldToScreen(q.x,q.y)),env=g.env;
    const shoulder=p.kind==='highway'?22:p.kind==='state'?14:p.kind==='alley'?4:8;
    if(p.level>0||p.feature==='bridge'){
      ctx.save();ctx.translate(7,9);ctx.globalAlpha=.55;strokePath(pts,'rgba(0,0,0,.9)',p.width+shoulder+16);ctx.restore();
    }
    strokePath(pts,env.shoulder,p.width+shoulder);strokePath(pts,env.road,p.width);
    ctx.save();
    if(p.kind==='highway'){ctx.setLineDash([30,28]);strokePath(pts,'rgba(220,231,238,.85)',2.2);}
    else if(p.kind==='state'){ctx.setLineDash([20,28]);strokePath(pts,env.lane,1.8);}
    else if(p.kind==='alley'){ctx.globalAlpha=.34;ctx.setLineDash([3,10]);strokePath(pts,'rgba(235,240,245,.62)',1);}
    else{ctx.globalAlpha=.58;ctx.setLineDash([10,18]);strokePath(pts,'rgba(220,228,235,.72)',1.25);}
    ctx.restore();
    if(p.oneWay){const sp=samplePath(p,.52),s=worldToScreen(sp.x,sp.y);ctx.save();ctx.translate(s.x,s.y);ctx.rotate(sp.angle+(p.oneWay<0?Math.PI:0));ctx.fillStyle='rgba(245,250,253,.64)';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-8,-6);ctx.lineTo(-4,0);ctx.lineTo(-8,6);ctx.closePath();ctx.fill();ctx.restore();}
    if(p.level>0||p.feature==='bridge'){
      ctx.save();ctx.globalAlpha=.38;strokePath(pts,'rgba(210,225,235,.72)',p.width+4);ctx.restore();
    }
  }
  drawRoads=function(g){
    const near=g.road.nearbyPaths(g.player.y,1250);
    ctx.lineCap='round';ctx.lineJoin='round';
    near.filter(p=>p.level<0).forEach(p=>{ctx.save();ctx.globalAlpha=.72;drawEdge(g,p);ctx.restore();});
    near.filter(p=>p.level===0&&p.feature!=='bridge').forEach(p=>drawEdge(g,p));
    // Roundabout islands are drawn once per district using the ring node bounds.
    const rings=new Map();
    for(const p of near.filter(p=>p.feature==='roundabout')){
      const cx=(p.minX+p.maxX)/2,cy=(p.minY+p.maxY)/2,key=`${Math.round(cx/40)}:${Math.round(cy/40)}`;
      if(!rings.has(key))rings.set(key,{cx,cy});
    }
    for(const r of rings.values()){
      const s=worldToScreen(r.cx,r.cy);ctx.save();ctx.fillStyle='rgba(8,14,15,.95)';ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,23,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
    }
    near.filter(p=>p.level>0||p.feature==='bridge').forEach(p=>drawEdge(g,p));
  };

  // Context labels identify meaningful topology rather than generic random forks.
  const oldState=Game.prototype.updateGameState;
  Game.prototype.updateGameState=function(dt){
    oldState.call(this,dt);if(this.finished)return;
    const info=this.road.nearestInfo(this.player.x,this.player.y),f=info.path?.feature;
    if(!f){this._topologyHint=null;return;}
    if(f!==this._topologyHint&&info.d<(info.path.width||this.env.roadWidth)*.48){
      this._topologyHint=f;const label=FEATURE_LABEL[f];if(label){ui.junctionText.textContent=label;ui.junctionHint.classList.remove('hidden');clearTimeout(this._topologyTimer);this._topologyTimer=setTimeout(()=>ui.junctionHint.classList.add('hidden'),1450);}
    }
  };
})();
