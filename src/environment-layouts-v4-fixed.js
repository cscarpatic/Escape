(() => {
  const Prev=RoadNetwork,MU=window.NIGHT_HEIST_METERS_PER_UNIT||(1.42/3.6);
  const rect=(l,t,r,b)=>[{x:l,y:t},{x:r,y:t},{x:r,y:b},{x:l,y:b}];
  function reset(g){g.paths=[];g.props=[];g.stages=[];g.nodes=[];g.nodeMap=new Map();g.edgeId=0;g.boundaries=[];g.trafficLights=[];g.cityBlocks=[];g.roundabouts=[];g.elevatedRoutes=[];g.environmentBlocks=[];g.lightOccluders=[];g.diagonalCells=new Set();g._preferredLevel=0;}
  function occ(g,l,t,r,b,type,seed){if(r-l<18||b-t<18)return;g.lightOccluders.push({polygon:rect(l,t,r,b),left:l,top:t,right:r,bottom:b,type,seed,solid:true});}

  RoadNetwork=class EnvironmentGridV4 extends Prev{
    constructor(env){super(env);if(env.propMode==='industrial')this.makePort();else if(env.propMode==='alpine')this.makeAlpine();else if(env.propMode==='desert')this.makeDesert();}
    road(a,b,opt,width){const p=this.edge(a,b,opt);p.width=width;if(opt.trafficWeight!==undefined)p.trafficWeight=opt.trafficWeight;return p;}
    build(c){
      reset(this);const rows=Math.max(c.minRows,Math.ceil((this.env.escapeKm*1000/MU+c.extra)/c.step)),cols=c.xs.length,Y=r=>260-r*c.step,shift=r=>c.shift?c.shift(r):0,grid=[];
      for(let r=0;r<=rows;r++){grid[r]=[];for(let k=0;k<cols;k++)grid[r][k]=this.node(`${c.prefix}${r}_${k}`,c.xs[k]+shift(r),Y(r),c.nodeType);}
      const vertical=Array.from({length:rows},()=>Array(cols)),cross=[];
      for(let r=0;r<rows;r++)for(let k=0;k<cols;k++)vertical[r][k]=this.road(grid[r][k],grid[r+1][k],{kind:c.vKinds[k],stage:r,curve:c.vCurve(r,k),trafficWeight:c.vTraffic[k],trafficTrait:c.vTrait(r,k),feature:c.vFeature,level:0},c.vWidths[k]);
      for(let r=0;r<=rows;r++){const w=c.crossWidth(r);cross[r]=w;for(let k=0;k<cols-1;k++)this.road(grid[r][k],grid[r][k+1],{kind:w>=c.arterial?'state':'city',stage:Math.max(0,Math.min(rows-1,r-1)),curve:0,trafficWeight:w>=c.arterial?.34:.20,trafficTrait:r<2?'clear':undefined,feature:c.crossFeature,level:0},w);}
      for(let r=c.diagStart,k=0;r<rows-1;r+=c.diagEvery,k++){
        const right=k%2===1,from=right?cols-1:0,to=right?cols-2:1,cell=right?cols-2:0;
        this.road(grid[r][from],grid[r+1][to],{kind:'city',stage:r,curve:0,trafficWeight:.12,trafficTrait:'clear',feature:c.diagFeature,level:0},c.diagWidth);this.diagonalCells.add(`${r}:${cell}`);
      }
      for(let r=0;r<rows;r++)for(let k=0;k<cols-1;k++){
        const l=Math.max(grid[r][k].x,grid[r+1][k].x)+c.vWidths[k]/2+c.gap,rr=Math.min(grid[r][k+1].x,grid[r+1][k+1].x)-c.vWidths[k+1]/2-c.gap,t=Math.min(Y(r),Y(r+1))+cross[r+1]/2+c.gap,b=Math.max(Y(r),Y(r+1))-cross[r]/2-c.gap;
        if(rr-l<90||b-t<120)continue;const diagonal=this.diagonalCells.has(`${r}:${k}`),block={left:l,right:rr,top:t,bottom:b,row:r,col:k,seed:c.seed+r*100+k,env:this.env.propMode,diagonal,type:diagonal?'open-route':c.blockType(r,k)};this.environmentBlocks.push(block);if(!diagonal)c.populate(this,block);
      }
      for(let r=0;r<rows;r++){const mid=Math.floor(cols/2),a=grid[r][mid],b=grid[r+1][mid];this.stages.push({index:r,startY:a.y+80,endY:b.y-80,centerX:a.x,endX:b.x,left:vertical[r][1]||vertical[r][0],right:vertical[r][cols-2]||vertical[r][cols-1],midY:(a.y+b.y)/2});}
    }
    makePort(){
      this.build({prefix:'P',nodeType:'dock-junction',xs:[-780,-390,0,390,780],step:640,minRows:16,extra:2400,shift:null,vWidths:[154,132,194,138,166],vKinds:['city','city','state','city','state'],vTraffic:[.26,.20,.48,.22,.38],vCurve:(r,k)=>k===2?Math.sin(r*.55)*8:0,vTrait:(r,k)=>r%5===2&&k!==2?'slow':'clear',vFeature:'dock-road',crossWidth:r=>r%4===0?188:r%2===0?158:138,arterial:180,crossFeature:'dock-cross',diagStart:3,diagEvery:7,diagFeature:'truck-diagonal',diagWidth:136,gap:28,seed:52000,blockType:(r,k)=>{const h=hash(r*73+k*29);return h<.48?'container-yard':h<.80?'warehouse':'truck-yard'},populate:(g,b)=>{const w=b.right-b.left,h=b.bottom-b.top,p=26;if(b.type==='warehouse')occ(g,b.left+p,b.top+p,b.right-p,b.bottom-p,'warehouse',b.seed);else if(b.type==='container-yard'){const rows=4,d=(h-2*p)/rows;for(let j=0;j<rows;j++){const y=b.top+p+j*d+d*.16;occ(g,b.left+p,y,b.right-p,y+d*.48,'container-stack',b.seed*10+j);}}else{const ww=Math.min(120,w*.34),hh=Math.min(105,h*.24);occ(g,b.right-p-ww,b.top+p,b.right-p,b.top+p+hh,'dock-office',b.seed);}}});
      this.env.mapIdentity='PORTO · ISOLATI CONTAINER E BANCHINE';this.env.blurb='Griglia portuale leggibile: assi principali, blocchi container e banchine.';
    }
    makeAlpine(){
      this.build({prefix:'M',nodeType:'mountain-junction',xs:[-620,-205,205,620],step:590,minRows:17,extra:2500,shift:r=>Math.sin(r*.58)*135+Math.sin(r*.19)*55,vWidths:[124,148,140,122],vKinds:['city','state','state','city'],vTraffic:[.10,.25,.25,.10],vCurve:(r,k)=>(k<2?-1:1)*(18+hash(r*41+k)*24),vTrait:r=>r%4===2?'tight':'clear',vFeature:'mountain-road',crossWidth:r=>r%3===0?142:122,arterial:140,crossFeature:'mountain-cross',diagStart:2,diagEvery:6,diagFeature:'mountain-cut',diagWidth:116,gap:34,seed:62000,blockType:(r,k)=>{const h=hash(r*83+k*47);return h<.46?'rock-mass':h<.82?'forest':'clearing'},populate:(g,b)=>{const w=b.right-b.left,h=b.bottom-b.top,p=30;if(b.type==='rock-mass'){occ(g,b.left+p,b.top+p,b.left+p+w*.46,b.bottom-p,'rock-face',b.seed);occ(g,b.right-p-w*.34,b.top+p+h*.18,b.right-p,b.bottom-p-h*.12,'rock-face',b.seed+1);}else if(b.type==='forest'){const cw=Math.min(110,w*.28),ch=Math.min(150,h*.30);for(let j=0;j<3;j++){const x=lerp(b.left+p,b.right-p-cw,.12+j*.36),y=lerp(b.top+p,b.bottom-p-ch,.18+(j%2)*.42);occ(g,x,y,x+cw,y+ch,'dense-forest',b.seed*10+j);}}else{const rw=Math.min(86,w*.22),rh=Math.min(74,h*.18);occ(g,b.right-p-rw,b.bottom-p-rh,b.right-p,b.bottom-p,'mountain-hut',b.seed);}}});
      this.env.mapIdentity='MONTAGNA · VALLE, TORNANTI E PASSAGGI';this.env.blurb='Rete di valle leggibile, pareti rocciose e pochi passaggi alternativi.';
    }
    makeDesert(){
      this.build({prefix:'X',nodeType:'desert-junction',xs:[-900,-450,0,450,900],step:780,minRows:14,extra:2800,shift:r=>Math.sin(r*.34)*85,vWidths:[158,136,220,142,166],vKinds:['city','city','highway','city','state'],vTraffic:[.12,.12,.46,.12,.24],vCurve:(r,k)=>k===2?Math.sin(r*.7)*12:0,vTrait:()=> 'clear',vFeature:'desert-road',crossWidth:r=>r%4===0?176:146,arterial:170,crossFeature:'desert-cross',diagStart:2,diagEvery:5,diagFeature:'desert-bypass',diagWidth:154,gap:36,seed:72000,blockType:(r,k)=>{const h=hash(r*89+k*53);return h<.42?'mesa':h<.68?'compound':'open-desert'},populate:(g,b)=>{const w=b.right-b.left,h=b.bottom-b.top,p=38;if(b.type==='mesa'){const ix=w*.17,iy=h*.14;occ(g,b.left+ix,b.top+iy,b.right-ix,b.bottom-iy,'mesa',b.seed);}else if(b.type==='compound'){const bw=Math.min(145,w*.34),bh=Math.min(120,h*.22);occ(g,b.left+p,b.top+p,b.left+p+bw,b.top+p+bh,'desert-building',b.seed);occ(g,b.right-p-bw,b.bottom-p-bh,b.right-p,b.bottom-p,'desert-building',b.seed+1);}else if(hash(b.seed)<.36){const rw=Math.min(105,w*.24),rh=Math.min(90,h*.16);occ(g,b.right-p-rw,b.top+p,b.right-p,b.top+p+rh,'gas-station',b.seed);}}});
      this.env.mapIdentity='DESERTO · HIGHWAY, BLOCCHI E BYPASS';this.env.blurb='Assi lunghi e chiari, incroci distanziati, canyon e bypass diagonali.';
    }
  };
  Object.assign(ENVIRONMENTS[0],{blurb:'Griglia urbana, isolati reali e sopraelevate con accessi dedicati.'});if(typeof buildMenu==='function')buildMenu();
})();