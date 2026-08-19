(() => {
  const BaseRoadNetwork = RoadNetwork;
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);

  function worldLength(env, extra=1800) {
    return env.escapeKm * 1000 / METERS_PER_UNIT + extra;
  }

  function resetNetwork(road) {
    road.paths=[]; road.props=[]; road.stages=[]; road.nodes=[]; road.nodeMap=new Map();
    road.edgeId=0; road.boundaries=[]; road.trafficLights=[]; road.cityBlocks=[];
    road.roundabouts=[]; road.elevatedRoutes=[]; road._preferredLevel=0;
  }

  function setWidth(path,width,weight) {
    if (!path) return path;
    path.width=width;
    if (weight !== undefined) path.trafficWeight=weight;
    return path;
  }

  function stageFrom(road,index,y0,y1,left,right,centerX=0) {
    road.stages.push({
      index,startY:y0+70,endY:y1-70,centerX,endX:centerX,left,right,
      midY:(y0+y1)/2
    });
  }

  RoadNetwork = class EnvironmentRoadNetwork extends BaseRoadNetwork {
    constructor(env) {
      super(env);
      if (env.propMode==='industrial') this.buildDocksLayout();
      else if (env.propMode==='alpine') this.buildAlpineLayout();
      else if (env.propMode==='desert') this.buildDesertLayout();
    }

    addRoad(a,b,opt={},width=null,weight=null) {
      const p=this.edge(a,b,opt);
      return setWidth(p,width ?? p.width,weight);
    }

    buildDocksLayout() {
      resetNetwork(this);
      const total=worldLength(this.env,2200), step=560;
      const rows=Math.max(18,Math.ceil(total/step));
      const xs=[-720,-360,0,360,720];
      const Y=r=>260-r*step;
      const grid=[];

      for(let r=0;r<=rows;r++){
        const row=[];
        for(let c=0;c<xs.length;c++) row.push(this.node(`D${r}_${c}`,xs[c],Y(r),'dock-junction'));
        grid.push(row);
      }
      const verticalWidths=[132,150,184,146,170];
      for(let r=0;r<rows;r++){
        for(let c=0;c<xs.length;c++){
          const freight=c===2||c===4;
          this.addRoad(grid[r][c],grid[r+1][c],{
            kind:freight?'state':'city',stage:r,curve:freight?8:0,
            trafficWeight:freight?.52:.25,trafficTrait:r%5===2?'slow':'clear'
          },verticalWidths[c]);
        }
      }
      for(let r=0;r<=rows;r+=2){
        const width=r%6===0?182:142;
        for(let c=0;c<xs.length-1;c++){
          this.addRoad(grid[r][c],grid[r][c+1],{
            kind:r%6===0?'state':'city',stage:Math.max(0,r-1),curve:0,
            feature:'dock-cross',trafficWeight:r%6===0?.40:.19
          },width);
        }
      }

      for(let r=3;r<rows-2;r+=6){
        const side=(r/3)%2===1?-1:1;
        const c=side<0?0:4, base=grid[r][c], back=grid[r+2][c];
        const x=base.x+side*235;
        const q1=this.node(`DQ${r}A`,x,base.y,'quay');
        const q2=this.node(`DQ${r}B`,x,back.y,'quay');
        this.addRoad(base,q1,{kind:'service',stage:r,curve:0,feature:'quay-entry',trafficWeight:.05},112);
        this.addRoad(q1,q2,{kind:'service',stage:r+1,curve:0,feature:'quay',trafficWeight:.08},118);
        this.addRoad(q2,back,{kind:'service',stage:r+1,curve:0,feature:'quay-exit',trafficWeight:.05},112);
      }

      for(let r=0;r<rows;r++){
        for(let c=0;c<xs.length-1;c++){
          if(r%2===0) continue;
          const x0=xs[c]+verticalWidths[c]/2+45;
          const x1=xs[c+1]-verticalWidths[c+1]/2-45;
          if(x1-x0<90) continue;
          for(let j=0;j<3;j++){
            this.props.push({
              x:lerp(x0,x1,.20+j*.30),
              y:lerp(Y(r),Y(r+1),.28+.20*(j%2)),
              side:0,seed:21000+r*100+c*10+j,mode:'industrial'
            });
          }
        }
      }

      for(let r=0;r<rows;r++) stageFrom(this,r,Y(r),Y(r+1),
        this.paths.find(p=>p.nodeA===grid[r][1].id&&p.nodeB===grid[r+1][1].id),
        this.paths.find(p=>p.nodeA===grid[r][3].id&&p.nodeB===grid[r+1][3].id),
        xs[2]
      );
      this.env.mapIdentity='PORTO · CORRIDOI CONTAINER';
    }

    buildAlpineLayout() {
      resetNetwork(this);
      const total=worldLength(this.env,2400), step=430;
      const rows=Math.max(20,Math.ceil(total/step));
      const Y=r=>260-r*step;
      const main=[];

      for(let r=0;r<=rows;r++){
        const phase=r*.74;
        const x=Math.sin(phase)*430 + Math.sin(r*.22)*105;
        main[r]=this.node(`A${r}`,x,Y(r),'mountain-junction');
      }
      const mainPaths=[];
      for(let r=0;r<rows;r++){
        const bend=(r%2===0?1:-1)*(55+hash(r*31)*45);
        mainPaths[r]=this.addRoad(main[r],main[r+1],{
          kind:'state',stage:r,curve:bend,trafficWeight:.24,
          trafficTrait:r%4===2?'tight':'clear',feature:'switchback'
        },r%5===0?154:136);
      }

      for(let r=3;r+3<rows;r+=7){
        const side=hash(r*77)>.5?1:-1;
        const midY=(Y(r)+Y(r+3))/2;
        const shoulderX=((main[r].x+main[r+3].x)/2)+side*500;
        const p1=this.node(`AP${r}A`,shoulderX,Y(r)-step*.55,'mountain-pass');
        const p2=this.node(`AP${r}B`,shoulderX+side*80,midY-step*.20,'mountain-pass');
        this.addRoad(main[r],p1,{kind:'state',stage:r,curve:side*65,feature:'pass-entry',trafficWeight:.10,trafficTrait:'tight'},124);
        this.addRoad(p1,p2,{kind:'state',stage:r+1,curve:-side*35,feature:'mountain-pass',trafficWeight:.09,trafficTrait:'clear'},126);
        this.addRoad(p2,main[r+3],{kind:'state',stage:r+2,curve:side*72,feature:'pass-exit',trafficWeight:.10,trafficTrait:'tight'},124);
      }

      for(let r=0;r<rows;r++){
        const center=(main[r].x+main[r+1].x)/2;
        for(let j=0;j<10;j++){
          const side=j%2?1:-1;
          this.props.push({
            x:center+side*randRange(r*701+j,250,620),
            y:Y(r)-randRange(r*709+j,35,step-35),
            side,seed:31000+r*100+j,mode:'alpine'
          });
        }
      }

      for(let r=0;r<rows;r++) stageFrom(this,r,Y(r),Y(r+1),mainPaths[r],mainPaths[r],main[r].x);
      this.env.mapIdentity='MONTAGNA · TORNANTI E PASSI';
    }

    buildDesertLayout() {
      resetNetwork(this);
      const total=worldLength(this.env,2600), step=690;
      const rows=Math.max(16,Math.ceil(total/step));
      const Y=r=>260-r*step;
      const spine=[];

      for(let r=0;r<=rows;r++){
        const x=Math.sin(r*.31)*150;
        spine[r]=this.node(`S${r}`,x,Y(r),'desert-crossroad');
      }
      const spinePaths=[];
      for(let r=0;r<rows;r++){
        spinePaths[r]=this.addRoad(spine[r],spine[r+1],{
          kind:r%4===0?'highway':'state',stage:r,curve:Math.sin(r*.8)*24,
          trafficWeight:r%4===0?.48:.30,trafficTrait:'clear',feature:'desert-spine'
        },r%4===0?214:176);
      }

      for(let r=2;r+4<rows;r+=5){
        const side=(Math.floor(r/5)%2===0)?1:-1;
        const outerX=side*820;
        const n1=this.node(`SB${r}A`,outerX,Y(r+1),'desert-bypass');
        const n2=this.node(`SB${r}B`,outerX+side*80,Y(r+3),'desert-bypass');
        this.addRoad(spine[r],n1,{kind:'state',stage:r,curve:side*28,feature:'diagonal-bypass',trafficWeight:.16,trafficTrait:'clear'},158);
        this.addRoad(n1,n2,{kind:'highway',stage:r+1,curve:0,feature:'desert-bypass',trafficWeight:.22,trafficTrait:'clear'},188);
        this.addRoad(n2,spine[r+4],{kind:'state',stage:r+3,curve:-side*28,feature:'diagonal-bypass',trafficWeight:.16,trafficTrait:'clear'},158);
      }

      for(let r=4;r<rows;r+=6){
        const left=this.node(`SX${r}L`,-980,Y(r),'desert-road');
        const right=this.node(`SX${r}R`,980,Y(r),'desert-road');
        this.addRoad(left,spine[r],{kind:'state',stage:r,curve:0,feature:'crossroad',trafficWeight:.10},152);
        this.addRoad(spine[r],right,{kind:'state',stage:r,curve:0,feature:'crossroad',trafficWeight:.10},152);
      }

      for(let r=0;r<rows;r++){
        for(let j=0;j<12;j++){
          const side=j%2?1:-1;
          this.props.push({
            x:spine[r].x+side*randRange(r*811+j,330,920),
            y:Y(r)-randRange(r*821+j,40,step-40),
            side,seed:41000+r*100+j,mode:'desert'
          });
        }
      }

      for(let r=0;r<rows;r++) stageFrom(this,r,Y(r),Y(r+1),spinePaths[r],spinePaths[r],spine[r].x);
      this.env.mapIdentity='DESERTO · RETTILINEI E BYPASS DIAGONALI';
    }
  };

  Object.assign(ENVIRONMENTS[0], {blurb:'Griglia urbana, sopraelevate e traffico metropolitano.', mapIdentity:'CITTÀ · VIALI E SOPRAELEVATE'});
  Object.assign(ENVIRONMENTS[1], {blurb:'Corridoi container, banchine e mezzi pesanti.'});
  Object.assign(ENVIRONMENTS[2], {blurb:'Tornanti continui, passi alternativi e nebbia.'});
  Object.assign(ENVIRONMENTS[3], {blurb:'Rettilinei aperti, grandi diagonali e incroci radi.'});
  if(typeof buildMenu==='function') buildMenu();
})();