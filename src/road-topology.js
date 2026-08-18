(() => {
  // Clear, hierarchical road network. The city is a real street grid made of shared
  // intersections; regional maps use continuous state roads plus a peripheral highway.
  const ROAD = {
    highway:{label:'AUTOSTRADA',width:1.18,traffic:1.05},
    state:{label:'STATALE',width:.82,traffic:.76},
    city:{label:'STRADA CITTADINA',width:.54,traffic:.46},
    service:{label:'STRADA DI SERVIZIO',width:.42,traffic:.22},
  };

  class ClearRoadNetwork {
    constructor(env){
      this.env=env;this.paths=[];this.props=[];this.stages=[];this.nodes=[];this.nodeMap=new Map();this.edgeId=0;
      if(env.propMode==='city') this.generateCity();
      else if(env.propMode==='industrial') this.generateIndustrial();
      else this.generateRegional();
    }

    node(id,x,y,type='junction'){
      if(this.nodeMap.has(id)) return this.nodeMap.get(id);
      const n={id,x,y,type,edges:[]};this.nodeMap.set(id,n);this.nodes.push(n);return n;
    }

    edge(a,b,opt={}){
      const kind=opt.kind||'city',spec=ROAD[kind]||ROAD.city;
      const curve=opt.curve||0,dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy));
      const nx=-dy/len,ny=dx/len;
      const p0={x:a.x,y:a.y},p3={x:b.x,y:b.y};
      const p1={x:a.x+dx*.33+nx*curve,y:a.y+dy*.33+ny*curve};
      const p2={x:a.x+dx*.67-nx*curve*.35,y:a.y+dy*.67-ny*curve*.35};
      const samples=Math.max(5,Math.ceil(len/28)),points=[];
      for(let i=0;i<=samples;i++) points.push(cubic(p0,p1,p2,p3,i/samples));
      let length=0;for(let i=1;i<points.length;i++) length+=dist2(points[i-1],points[i]);
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y),trafficTrait=opt.trafficTrait||this.trait(kind,this.edgeId);
      const p={
        id:`R${this.edgeId++}`,branch:this.edgeId,stage:opt.stage||0,kind,trafficTrait,
        trait:`${spec.label} · ${trafficTrait.toUpperCase()}`,points,length,width:this.env.roadWidth*spec.width,
        minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),midX:(a.x+b.x)/2,
        nodeA:a.id,nodeB:b.id,trafficWeight:opt.trafficWeight??spec.traffic,feature:opt.feature||null,oneWay:opt.oneWay||0,level:opt.level||0,topology:true,
      };
      this.paths.push(p);a.edges.push(p.id);b.edges.push(p.id);return p;
    }

    trait(kind,seed){
      const h=hash(seed*61+17);
      if(kind==='highway') return h<.70?'clear':h<.90?'slow':'tight';
      if(kind==='state') return h<.52?'clear':h<.78?'slow':h<.92?'tight':'oncoming';
      if(kind==='service') return h<.72?'clear':'slow';
      return h<.48?'clear':h<.78?'slow':h<.90?'tight':'oncoming';
    }

    generateCity(){
      const step=340,total=this.env.escapeKm*1000+2400,rows=Math.max(18,Math.ceil(total/step));
      const xs=[-720,-360,0,360,720],grid=[];
      const Y=r=>260-r*step;

      // Five continuous avenues and a street at every block row: a readable city grid.
      for(let r=0;r<=rows;r++){
        const row=[];
        for(let c=0;c<xs.length;c++) row.push(this.node(`C${r}_${c}`,xs[c],Y(r),'city-junction'));
        grid.push(row);
      }
      for(let r=0;r<rows;r++){
        for(let c=0;c<xs.length;c++){
          const kind=(c===2||c===0||c===4)?'state':'city';
          this.edge(grid[r][c],grid[r+1][c],{kind,stage:r,curve:0,trafficWeight:kind==='state'?.72:.42});
        }
      }
      for(let r=0;r<=rows;r++){
        const arterial=r%4===0;
        for(let c=0;c<xs.length-1;c++){
          this.edge(grid[r][c],grid[r][c+1],{kind:arterial?'state':'city',stage:Math.max(0,r-1),curve:0,trafficWeight:arterial?.64:.36,feature:'fourway'});
        }
      }

      // A single peripheral motorway east of the city. It does not cut through blocks.
      const hx=1080,H=[];
      for(let r=0;r<=rows;r++) H[r]=this.node(`CH${r}`,hx,Y(r),'highway');
      for(let r=0;r<rows;r++) this.edge(H[r],H[r+1],{kind:'highway',stage:r,curve:12});

      // Only a few explicit city-to-highway connections, so the map remains understandable.
      for(let r=3;r<rows;r+=6){
        this.edge(grid[r][4],H[r],{kind:'state',stage:r,curve:-42,feature:'interchange',trafficWeight:.42});
      }

      // Service lanes exist only along selected outer blocks, never through the middle of intersections.
      for(let r=2;r<rows-1;r+=5){
        const west=hash(r*37)>.5,side=west?-1:1,base=west?grid[r][0]:grid[r][4];
        const n1=this.node(`CS${r}a`,base.x+side*180,base.y,'service');
        const n2=this.node(`CS${r}b`,base.x+side*180,grid[r+1][0].y,'service');
        this.edge(base,n1,{kind:'service',stage:r,curve:0,feature:'tjunction',trafficWeight:.08});
        this.edge(n1,n2,{kind:'service',stage:r,curve:0,oneWay:1,trafficWeight:.08});
        this.edge(n2,west?grid[r+1][0]:grid[r+1][4],{kind:'service',stage:r,curve:0,trafficWeight:.08});
      }

      for(let r=0;r<rows;r++){
        const left=this.paths.find(p=>p.nodeA===grid[r][1].id&&p.nodeB===grid[r+1][1].id)||this.paths[0];
        const right=this.paths.find(p=>p.nodeA===grid[r][3].id&&p.nodeB===grid[r+1][3].id)||left;
        this.stages.push({index:r,startY:Y(r)+70,endY:Y(r+1)-70,centerX:0,endX:0,left,right,midY:(Y(r)+Y(r+1))/2});
      }
      this.generateCityProps(grid,rows);
    }

    generateIndustrial(){
      const step=410,total=this.env.escapeKm*1000+2600,rows=Math.max(16,Math.ceil(total/step)),xs=[-640,-320,0,320,640],grid=[];
      const Y=r=>260-r*step;
      for(let r=0;r<=rows;r++){
        const row=[];for(let c=0;c<xs.length;c++) row.push(this.node(`I${r}_${c}`,xs[c],Y(r),'industrial-junction'));grid.push(row);
      }
      for(let r=0;r<rows;r++) for(let c=0;c<xs.length;c++) this.edge(grid[r][c],grid[r+1][c],{kind:c===2?'state':'city',stage:r,curve:c===2?10:0});
      for(let r=0;r<=rows;r+=2) for(let c=0;c<xs.length-1;c++) this.edge(grid[r][c],grid[r][c+1],{kind:'city',stage:Math.max(0,r-1),curve:0,feature:'fourway'});
      this.addPeripheralHighway(grid,rows,Y,960,7);
      for(let r=0;r<rows;r++){
        const left=this.paths.find(p=>p.nodeA===grid[r][1].id&&p.nodeB===grid[r+1][1].id)||this.paths[0];
        const right=this.paths.find(p=>p.nodeA===grid[r][3].id&&p.nodeB===grid[r+1][3].id)||left;
        this.stages.push({index:r,startY:Y(r)+80,endY:Y(r+1)-80,centerX:0,endX:0,left,right,midY:(Y(r)+Y(r+1))/2});
      }
      this.generateRegionalProps(rows,Y,-640,640);
    }

    generateRegional(){
      const step=460,total=this.env.escapeKm*1000+2600,rows=Math.max(16,Math.ceil(total/step)),Y=r=>260-r*step;
      const cols=[-560,0,560],grid=[];
      for(let r=0;r<=rows;r++){
        const row=[];
        for(let c=0;c<cols.length;c++){
          const wobble=c===1?Math.sin(r*.42)*55:Math.sin(r*.31+c)*80;
          row.push(this.node(`R${r}_${c}`,cols[c]+wobble,Y(r),c===1?'state':'secondary'));
        }
        grid.push(row);
      }
      for(let r=0;r<rows;r++) for(let c=0;c<cols.length;c++) this.edge(grid[r][c],grid[r+1][c],{kind:'state',stage:r,curve:(c-1)*16});
      // Cross roads only every few kilometres, always ending at real T/four-way nodes.
      for(let r=2;r<rows;r+=3){
        this.edge(grid[r][0],grid[r][1],{kind:'state',stage:r,curve:12,feature:'tjunction'});
        this.edge(grid[r][1],grid[r][2],{kind:'state',stage:r,curve:-12,feature:'tjunction'});
      }
      this.addPeripheralHighway(grid,rows,Y,980,6);
      for(let r=0;r<rows;r++){
        const left=this.paths.find(p=>p.nodeA===grid[r][0].id&&p.nodeB===grid[r+1][0].id)||this.paths[0];
        const right=this.paths.find(p=>p.nodeA===grid[r][2].id&&p.nodeB===grid[r+1][2].id)||left;
        this.stages.push({index:r,startY:Y(r)+85,endY:Y(r+1)-85,centerX:grid[r][1].x,endX:grid[r+1][1].x,left,right,midY:(Y(r)+Y(r+1))/2});
      }
      this.generateRegionalProps(rows,Y,-560,560);
    }

    addPeripheralHighway(grid,rows,Y,x,spacing){
      const H=[];for(let r=0;r<=rows;r++) H[r]=this.node(`PH${r}`,x,Y(r),'highway');
      for(let r=0;r<rows;r++) this.edge(H[r],H[r+1],{kind:'highway',stage:r,curve:16});
      for(let r=3;r<rows;r+=spacing){
        const source=grid[r][grid[r].length-1];
        this.edge(source,H[r],{kind:'state',stage:r,curve:-34,feature:'interchange',trafficWeight:.34});
      }
    }

    generateCityProps(grid,rows){
      // Buildings live inside blocks, not on top of the roads.
      for(let r=0;r<rows;r++){
        for(let c=0;c<grid[r].length-1;c++){
          const a=grid[r][c],b=grid[r][c+1],d=grid[r+1][c];
          for(let j=0;j<3;j++){
            const x=lerp(a.x,b.x,.22+j*.28)+randRange(r*311+c*47+j,-34,34);
            const y=lerp(a.y,d.y,.25+hash(r*401+c*31+j)*.5)+randRange(r*313+c*53+j,-24,24);
            this.props.push({x,y,side:0,seed:r*1000+c*10+j,mode:this.env.propMode});
          }
        }
      }
    }

    generateRegionalProps(rows,Y,minX,maxX){
      const count=this.env.propMode==='alpine'?10:12;
      for(let r=0;r<rows;r++) for(let j=0;j<count;j++){
        const side=hash(r*97+j*17)>.5?1:-1;
        const x=side<0?minX-randRange(r*211+j,170,480):maxX+randRange(r*223+j,170,480);
        this.props.push({x,y:Y(r)-randRange(r*227+j,60,400),side,seed:r*100+j,mode:this.env.propMode});
      }
    }

    nearbyPaths(y,range=1000){return this.paths.filter(p=>p.minY<=y+range&&p.maxY>=y-range);}
    nearestInfo(x,y){
      let best={d:Infinity,x:0,y:0,tx:0,ty:-1,path:null,index:0};
      for(const p of this.nearbyPaths(y,1150)){
        if(x<p.minX-700||x>p.maxX+700) continue;
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

  RoadNetwork=ClearRoadNetwork;

  // Traffic follows the road hierarchy: lots on motorway/state roads, less on local streets.
  Game.prototype.spawnTraffic=function(){
    const colors=['#d8dfe6','#62788d','#d9b267','#7b8087','#a34b4b','#54735f','#554f78','#b7a7a2'];
    let spawned=0,cap=Math.round(50+this.env.traffic*24);
    for(const p of this.road.paths){
      if(spawned>=cap||p.stage<1||p.length<150) continue;
      const chance=Math.min(.72,this.env.traffic*(p.trafficWeight||.35)*.52);
      if(hash(p.branch*43+p.stage*19)>chance) continue;
      const direction=p.oneWay||((hash(p.branch*53)<(p.trafficTrait==='oncoming'?.62:this.env.oncoming*.28))?-1:1);
      const speed=direction<0?randRange(p.branch*91,68,112):p.kind==='highway'?randRange(p.branch*73,84,128):p.trafficTrait==='slow'?randRange(p.branch*67,24,50):randRange(p.branch*65,46,82);
      const t=clamp(.16+hash(p.branch*31)*.68,.08,.92);
      this.traffic.push(new TrafficCar(p,t,direction,speed,colors[(p.stage+p.branch)%colors.length]));spawned++;
    }
  };

  function drawRoad(g,p){
    const pts=p.points.map(q=>worldToScreen(q.x,q.y)),env=g.env;
    if(p.kind==='highway'){
      strokePath(pts,'rgba(15,19,24,.98)',p.width+24);strokePath(pts,env.road,p.width);
      ctx.save();ctx.setLineDash([30,28]);strokePath(pts,'rgba(235,240,244,.74)',2.2);ctx.restore();
      // motorway edge lines make it visually unmistakable
      ctx.save();ctx.globalAlpha=.34;strokePath(pts,'rgba(255,211,106,.9)',p.width-7);ctx.restore();
    }else if(p.kind==='state'){
      strokePath(pts,env.shoulder,p.width+14);strokePath(pts,env.road,p.width);
      ctx.save();ctx.setLineDash([22,28]);strokePath(pts,env.lane,1.8);ctx.restore();
    }else if(p.kind==='service'){
      strokePath(pts,'rgba(25,29,33,.9)',p.width+6);strokePath(pts,'#171b20',p.width);
      ctx.save();ctx.globalAlpha=.4;ctx.setLineDash([5,12]);strokePath(pts,'rgba(220,230,236,.6)',1);ctx.restore();
    }else{
      // City streets: clear curbs + compact carriageway, visibly distinct from state roads.
      strokePath(pts,'rgba(94,103,112,.52)',p.width+12);strokePath(pts,'#151b21',p.width);
      ctx.save();ctx.globalAlpha=.58;ctx.setLineDash([10,18]);strokePath(pts,'rgba(205,216,224,.68)',1.2);ctx.restore();
    }
  }

  drawRoads=function(g){
    const near=g.road.nearbyPaths(g.player.y,1250);ctx.lineCap='round';ctx.lineJoin='round';
    near.filter(p=>p.kind==='highway').forEach(p=>drawRoad(g,p));
    near.filter(p=>p.kind==='state').forEach(p=>drawRoad(g,p));
    near.filter(p=>p.kind==='city'||p.kind==='service').forEach(p=>drawRoad(g,p));

    // Make urban intersections and blocks legible when illuminated.
    for(const n of g.road.nodes){
      if(n.type!=='city-junction'&&n.type!=='industrial-junction') continue;
      if(Math.abs(n.y-g.player.y)>1100) continue;
      const s=worldToScreen(n.x,n.y);if(s.x<-80||s.x>W+80||s.y<-80||s.y>H+80) continue;
      ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#171d23';ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(235,242,247,.22)';ctx.lineWidth=1;
      for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(-18+i*5,-23);ctx.lineTo(-18+i*5,-16);ctx.stroke();ctx.beginPath();ctx.moveTo(18+i*5,16);ctx.lineTo(18+i*5,23);ctx.stroke();}
      ctx.restore();
    }
  };
})();