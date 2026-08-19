(() => {
  const PreviousRoadNetwork = RoadNetwork;
  const METERS_PER_UNIT = window.NIGHT_HEIST_METERS_PER_UNIT || (1.42 / 3.6);

  const worldLength = (env,extra=2200) => env.escapeKm*1000/METERS_PER_UNIT + extra;

  function reset(road){
    road.paths=[];road.props=[];road.stages=[];road.nodes=[];road.nodeMap=new Map();road.edgeId=0;
    road.boundaries=[];road.trafficLights=[];road.cityBlocks=[];road.roundabouts=[];road.elevatedRoutes=[];
    road.environmentBlocks=[];road.lightOccluders=[];road.diagonalCells=new Set();road._preferredLevel=0;
  }

  function rectPoly(left,top,right,bottom){
    return [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
  }

  function addOccluder(road,left,top,right,bottom,type,seed){
    if(right-left<18||bottom-top<18)return null;
    const o={polygon:rectPoly(left,top,right,bottom),left,top,right,bottom,type,seed,solid:true};
    road.lightOccluders.push(o);return o;
  }

  function stage(road,index,a,b,left,right){
    road.stages.push({index,startY:a.y+80,endY:b.y-80,centerX:(a.x+b.x)/2,endX:b.x,left,right,midY:(a.y+b.y)/2});
  }

  RoadNetwork = class EnvironmentRoadNetworkV4 extends PreviousRoadNetwork {
    constructor(env){
      super(env);
      if(env.propMode==='industrial')this.buildPortGrid();
      else if(env.propMode==='alpine')this.buildAlpineGrid();
      else if(env.propMode==='desert')this.buildDesertGrid();
    }

    addRoad(a,b,opt={},width=null){
      const p=this.edge(a,b,opt);if(width)p.width=width;if(opt.trafficWeight!==undefined)p.trafficWeight=opt.trafficWeight;return p;
    }

    buildReadableGrid(cfg){
      reset(this);
      const total=worldLength(this.env,cfg.extra||2200),rows=Math.max(cfg.minRows||14,Math.ceil(total/cfg.step));
      const cols=cfg.baseXs.length,Y=r=>260-r*cfg.step,grid=[];
      const shift=r=>cfg.rowShift?cfg.rowShift(r):0;
      for(let r=0;r<=rows;r++){
        const row=[];
        for(let c=0;c<cols;c++)row.push(this.node(`${cfg.prefix}${r}_${c}`,cfg.baseXs[c]+shift(r),Y(r),cfg.nodeType));
        grid.push(row);
      }

      const vertical=Array.from({length:rows},()=>Array(cols));
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const width=cfg.verticalWidths[c];
        vertical[r][c]=this.addRoad(grid[r][c],grid[r+1][c],{
          kind:cfg.verticalKinds?.[c]||((c===Math.floor(cols/2))?'state':'city'),stage:r,
          curve:cfg.verticalCurve?cfg.verticalCurve(r,c):0,
          trafficWeight:cfg.verticalTraffic?.[c]??.28,
          trafficTrait:cfg.verticalTrait?cfg.verticalTrait(r,c):undefined,
          feature:cfg.verticalFeature||null,level:0
        },width);
      }

      const crossWidths=[];
      for(let r=0;r<=rows;r++){
        const width=cfg.crossWidth(r);crossWidths[r]=width;
        for(let c=0;c<cols-1;c++)this.addRoad(grid[r][c],grid[r][c+1],{
          kind:width>=cfg.arterialCross?'state':'city',stage:Math.max(0,Math.min(rows-1,r-1)),curve:0,
          trafficWeight:width>=cfg.arterialCross?.34:.20,trafficTrait:r<2?'clear':undefined,
          feature:cfg.crossFeature||'junction',level:0
        },width);
      }

      for(let r=cfg.diagonalStart||2,k=0;r<rows-1;r+=cfg.diagonalEvery||6,k++){
        const right=k%2===1,c=right?cols-2:0,toC=right?cols-2:1,fromC=right?cols-1:0;
        const a=grid[r][fromC],b=grid[r+1][toC];
        this.addRoad(a,b,{kind:'city',stage:r,curve:0,trafficWeight:.12,trafficTrait:'clear',feature:cfg.diagonalFeature,level:0},cfg.diagonalWidth);
        this.diagonalCells.add(`${r}:${c}`);
      }

      for(let r=0;r<rows;r++)for(let c=0;c<cols-1;c++){
        const left=Math.max(grid[r][c].x,grid[r+1][c].x)+cfg.verticalWidths[c]/2+cfg.blockGap;
        const right=Math.min(grid[r][c+1].x,grid[r+1][c+1].x)-cfg.verticalWidths[c+1]/2-cfg.blockGap;
        const top=Math.min(Y(r),Y(r+1))+crossWidths[r+1]/2+cfg.blockGap;
        const bottom=Math.max(Y(r),Y(r+1))-crossWidths[r]/2-cfg.blockGap;
        if(right-left<90||bottom-top<120)continue;
        const diagonal=this.diagonalCells.has(`${r}:${c}`);
        const block={left,right,top,bottom,row:r,col:c,seed:cfg.seedBase+r*100+c,env:this.env.propMode,diagonal,type:diagonal?'open-route':cfg.blockType(r,c)};
        this.environmentBlocks.push(block);
        if(!diagonal)cfg.populateBlock(this,block);
      }

      for(let r=0;r<rows;r++)stage(this,r,grid[r][Math.floor(cols/2)],grid[r+1][Math.floor(cols/2)],vertical[r][1]||vertical[r][0],vertical[r][cols-2]||vertical[r][cols-1]);
      this._layoutGrid=grid;this._layoutRows=rows;
    }

    buildPortGrid(){
      const cfg={
        prefix:'P',nodeType:'dock-junction',baseXs:[-780,-390,0,390,780],step:640,minRows:16,extra:2400,
        verticalWidths:[154,132,194,138,166],verticalKinds:['city','city','state','city','state'],verticalTraffic:[.26,.20,.48,.22,.38],
        verticalCurve:(r,c)=>(c===2?Math.sin(r*.55)*8:0),verticalTrait:(r,c)=>r%5===2&&c!==2?'slow':'clear',
        crossWidth:r=>r%4===0?188:r%2===0?158:138,arterialCross:180,crossFeature:'dock-cross',blockGap:28,
        diagonalStart:3,diagonalEvery:7,diagonalFeature:'truck-diagonal',diagonalWidth:136,seedBase:52000,
        blockType:(r,c)=>{const h=hash(r*73+c*29);return h<.48?'container-yard':h<.80?'warehouse':'truck-yard'},
        populateBlock:(road,b)=>{
          const w=b.right-b.left,h=b.bottom-b.top,pad=26;
          if(b.type==='warehouse'){
            addOccluder(road,b.left+pad,b.top+pad,b.right-pad,b.bottom-pad,'warehouse',b.seed);
          }else if(b.type==='container-yard'){
            const rows=4,gap=(h-2*pad)/rows;
            for(let j=0;j<rows;j++){
              const y=b.top+pad+j*gap+gap*.16;
              addOccluder(road,b.left+pad,y,b.right-pad,y+gap*.48,'container-stack',b.seed*10+j);
            }
          }else{
            const ww=Math.min(120,w*.34),hh=Math.min(105,h*.24);
            addOccluder(road,b.right-pad-ww,b.top+pad,b.right-pad,b.top+pad+hh,'dock-office',b.seed);
          }
        }
      };
      this.buildReadableGrid(cfg);this.env.mapIdentity='PORTO · ISOLATI CONTAINER E BANCHINE';
      this.env.blurb='Griglia portuale leggibile: assi principali, blocchi container e banchine.';
    }

    buildAlpineGrid(){
      const cfg={
        prefix:'M',nodeType:'mountain-junction',baseXs:[-620,-205,205,620],step:590,minRows:17,extra:2500,
        rowShift:r=>Math.sin(r*.58)*135+Math.sin(r*.19)*55,
        verticalWidths:[124,148,140,122],verticalKinds:['city','state','state','city'],verticalTraffic:[.10,.25,.25,.10],
        verticalCurve:(r,c)=>(c<2?-1:1)*(18+hash(r*41+c)*24),verticalTrait:(r,c)=>r%4===2?'tight':'clear',verticalFeature:'mountain-road',
        crossWidth:r=>r%3===0?142:122,arterialCross:140,crossFeature:'mountain-cross',blockGap:34,
        diagonalStart:2,diagonalEvery:6,diagonalFeature:'mountain-cut',diagonalWidth:116,seedBase:62000,
        blockType:(r,c)=>{const h=hash(r*83+c*47);return h<.46?'rock-mass':h<.82?'forest':'clearing'},
        populateBlock:(road,b)=>{
          const w=b.right-b.left,h=b.bottom-b.top,pad=30;
          if(b.type==='rock-mass'){
            addOccluder(road,b.left+pad,b.top+pad,b.left+pad+w*.46,b.bottom-pad,'rock-face',b.seed);
            addOccluder(road,b.right-pad-w*.34,b.top+pad+h*.18,b.right-pad,b.bottom-pad-h*.12,'rock-face',b.seed+1);
          }else if(b.type==='forest'){
            const cw=Math.min(110,w*.28),ch=Math.min(150,h*.30);
            for(let j=0;j<3;j++){
              const x=lerp(b.left+pad,b.right-pad-cw,.12+j*.36),y=lerp(b.top+pad,b.bottom-pad-ch,.18+(j%2)*.42);
              addOccluder(road,x,y,x+cw,y+ch,'dense-forest',b.seed*10+j);
            }
          }else{
            const rw=Math.min(86,w*.22),rh=Math.min(74,h*.18);
            addOccluder(road,b.right-pad-rw,b.bottom-pad-rh,b.right-pad,b.bottom-pad,'mountain-hut',b.seed);
          }
        }
      };
      this.buildReadableGrid(cfg);this.env.mapIdentity='MONTAGNA · VALLE, TORNANTI E PASSAGGI';
      this.env.blurb='Rete di valle leggibile, curve più ampie, pareti rocciose e passaggi alternativi.';
    }

    buildDesertGrid(){
      const cfg={
        prefix:'X',nodeType:'desert-junction',baseXs:[-900,-450,0,450,900],step:780,minRows:14,extra:2800,
        rowShift:r=>Math.sin(r*.34)*85,
        verticalWidths:[158,136,220,142,166],verticalKinds:['city','city','highway','city','state'],verticalTraffic:[.12,.12,.46,.12,.24],
        verticalCurve:(r,c)=>c===2?Math.sin(r*.7)*12:0,verticalTrait:()=> 'clear',verticalFeature:'desert-road',
        crossWidth:r=>r%4===0?176:146,arterialCross:170,crossFeature:'desert-cross',blockGap:36,
        diagonalStart:2,diagonalEvery:5,diagonalFeature:'desert-bypass',diagonalWidth:154,seedBase:72000,
        blockType:(r,c)=>{const h=hash(r*89+c*53);return h<.42?'mesa':h<.68?'compound':'open-desert'},
        populateBlock:(road,b)=>{
          const w=b.right-b.left,h=b.bottom-b.top,pad=38;
          if(b.type==='mesa'){
            const insetX=w*.17,insetY=h*.14;
            addOccluder(road,b.left+insetX,b.top+insetY,b.right-insetX,b.bottom-insetY,'mesa',b.seed);
          }else if(b.type==='compound'){
            const bw=Math.min(145,w*.34),bh=Math.min(120,h*.22);
            addOccluder(road,b.left+pad,b.top+pad,b.left+pad+bw,b.top+pad+bh,'desert-building',b.seed);
            addOccluder(road,b.right-pad-bw,b.bottom-pad-bh,b.right-pad,b.bottom-pad,'desert-building',b.seed+1);
          }else if(hash(b.seed)<.36){
            const rw=Math.min(105,w*.24),rh=Math.min(90,h*.16);
            addOccluder(road,b.right-pad-rw,b.top+pad,b.right-pad,b.top+pad+rh,'gas-station',b.seed);
          }
        }
      };
      this.buildReadableGrid(cfg);this.env.mapIdentity='DESERTO · HIGHWAY, BLOCCHI E BYPASS';
      this.env.blurb='Assi lunghi e chiari, incroci distanziati, canyon e bypass diagonali.';
    }
  };

  Object.assign(ENVIRONMENTS[0],{blurb:'Griglia urbana, isolati reali e sopraelevate con accessi dedicati.'});
  if(typeof buildMenu==='function')buildMenu();
})();