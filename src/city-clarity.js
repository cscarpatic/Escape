(() => {
  const PreviousRoadNetwork = RoadNetwork;
  const cityNode = id => { const m=/^C(\d+)_(\d+)$/.exec(id||''); return m?{row:+m[1],col:+m[2]}:null; };

  RoadNetwork = class RoadNetwork extends PreviousRoadNetwork {
    constructor(env){
      super(env);
      if(env.propMode==='city') this.applyCityClarity();
    }

    applyCityClarity(){
      // Keep three continuous avenues and only one cross street every eight original rows.
      this.paths=this.paths.filter(p=>{
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        if(!a||!b) return p.kind==='highway'||p.feature==='interchange';
        if(a.col===b.col) return a.col>=1&&a.col<=3;
        if(a.row===b.row){
          const lo=Math.min(a.col,b.col),hi=Math.max(a.col,b.col);
          return a.row%8===0&&lo>=1&&hi<=3;
        }
        return false;
      });

      // Bright, wide urban carriageways. The middle road is the main boulevard.
      for(const p of this.paths){
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        if(!a||!b) continue;
        const central=(a.col===2&&b.col===2);
        if(p.kind==='city') p.width=Math.max(p.width,central?190:176);
        else p.width=Math.max(p.width,central?218:194);
      }
      this.env.road='#202a33';
      this.env.shoulder='#4a5157';
      this.env.lane='#d7dde1';

      const valid=new Set(this.paths.map(p=>p.id));
      for(const n of this.nodes) n.edges=(n.edges||[]).filter(id=>valid.has(id));
      this.boundaries=[];
      this.trafficLights=this.nodes.filter(n=>{
        const q=cityNode(n.id);return q&&q.col>=1&&q.col<=3&&q.row%8===0&&n.edges.length>=3;
      });

      this.buildCityBlocks();
      this.regenerateBuildings();

      for(const s of this.stages){
        const candidates=this.paths.filter(p=>p.stage===s.index&&p.kind!=='highway');
        if(candidates.length){candidates.sort((a,b)=>a.midX-b.midX);s.left=candidates[0];s.right=candidates[candidates.length-1];}
      }
    }

    widthForCol(col){
      const p=this.paths.find(p=>{
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        return a&&b&&a.col===col&&b.col===col;
      });
      return p?.width||180;
    }

    buildCityBlocks(){
      this.cityBlocks=[];
      const cols=[1,2,3];
      const xs=cols.map(c=>this.nodeMap.get(`C0_${c}`)?.x).filter(Number.isFinite);
      if(xs.length!==3) return;
      const crossRows=[...new Set(this.paths.flatMap(p=>{
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        return a&&b&&a.row===b.row?[a.row]:[];
      }))].sort((a,b)=>a-b);
      if(!crossRows.length) return;
      const maxRow=Math.max(...this.nodes.map(n=>cityNode(n.id)?.row??0));
      const rows=[0,...crossRows.filter(r=>r>0&&r<maxRow),maxRow];
      const unique=[...new Set(rows)].sort((a,b)=>a-b);
      for(let k=0;k<unique.length-1;k++){
        const r1=unique[k],r2=unique[k+1];
        const y1=this.nodeMap.get(`C${r1}_2`)?.y,y2=this.nodeMap.get(`C${r2}_2`)?.y;
        if(!Number.isFinite(y1)||!Number.isFinite(y2)) continue;
        const crossHalf=104;
        const top=Math.min(y1,y2)+crossHalf+22;
        const bottom=Math.max(y1,y2)-crossHalf-22;
        if(bottom-top<130) continue;
        for(let c=0;c<2;c++){
          const leftX=xs[c]+this.widthForCol(cols[c])*.5+24;
          const rightX=xs[c+1]-this.widthForCol(cols[c+1])*.5-24;
          if(rightX-leftX<60) continue;
          this.cityBlocks.push({left:leftX,right:rightX,top,bottom});
        }
      }
    }

    regenerateBuildings(){
      this.props=[];
      let seed=9000;
      for(const b of this.cityBlocks){
        const cx=(b.left+b.right)/2;
        for(let y=b.top+110;y<b.bottom-90;y+=260){
          this.props.push({x:cx+randRange(seed,-16,16),y:y+randRange(seed+1,-26,26),side:0,seed:seed++,mode:'city'});
        }
      }
    }
  };

  function pushOutRect(car,b,player,game){
    const pad=player?18:15;
    const left=b.left-pad,right=b.right+pad,top=b.top-pad,bottom=b.bottom+pad;
    if(car.x<=left||car.x>=right||car.y<=top||car.y>=bottom) return false;
    const dl=Math.abs(car.x-left),dr=Math.abs(right-car.x),dt=Math.abs(car.y-top),db=Math.abs(bottom-car.y),m=Math.min(dl,dr,dt,db);
    if(m===dl) car.x=left; else if(m===dr) car.x=right; else if(m===dt) car.y=top; else car.y=bottom;
    car.speed*=player?.48:.68;
    if(player){game.camera.shake=Math.max(game.camera.shake,5);if((game._curbHit||0)<=0){game._curbHit=.25;audio.hit();}}
    return true;
  }

  const previousUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    previousUpdate.call(this,dt);
    if(this.finished||this.env.propMode!=='city'||!this.road.cityBlocks) return;
    this._curbHit=Math.max(0,(this._curbHit||0)-dt);
    for(const b of this.road.cityBlocks){
      if(this.player.y<b.top-120||this.player.y>b.bottom+120||this.player.x<b.left-120||this.player.x>b.right+120) continue;
      if(!b.driveThrough && !(this.player._roadLevel===1 && b.underElevated)) pushOutRect(this.player,b,true,this);
      if(!b.driveThrough) for(const c of this.cops) {
        if(c._roadLevel===1 && b.underElevated) continue;
        pushOutRect(c,b,false,this);
      }
    }
  };

  function drawBlocks(g){
    for(const b of g.road.cityBlocks||[]){
      if(b.bottom<g.player.y-1100||b.top>g.player.y+1100) continue;
      const a=worldToScreen(b.left,b.top),z=worldToScreen(b.right,b.bottom);
      const x=Math.min(a.x,z.x),y=Math.min(a.y,z.y),w=Math.abs(z.x-a.x),h=Math.abs(z.y-a.y);
      if(x>W+80||x+w<-80||y>H+80||y+h<-80) continue;
      ctx.save();
      ctx.fillStyle='rgba(6,10,14,.96)';
      ctx.strokeStyle='rgba(205,216,224,.34)';
      ctx.lineWidth=5;
      ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
      ctx.strokeStyle='rgba(255,204,86,.35)';ctx.lineWidth=1;ctx.setLineDash([10,18]);ctx.strokeRect(x+8,y+8,Math.max(0,w-16),Math.max(0,h-16));
      ctx.restore();
    }
  }

  function drawRoadClarity(g){
    for(const p of g.road.nearbyPaths(g.player.y,1200)){
      if(p.kind==='highway') continue;
      const pts=p.points.map(q=>worldToScreen(q.x,q.y));
      ctx.save();ctx.globalAlpha=.22;strokePath(pts,'rgba(126,147,160,.75)',Math.max(8,p.width-22));ctx.restore();
      ctx.save();ctx.setLineDash([34,30]);ctx.globalAlpha=.72;strokePath(pts,'rgba(229,235,238,.86)',2.4);ctx.restore();
    }
  }

  const previousDrawRoads=drawRoads;
  drawRoads=function(g){
    if(g.env.propMode==='city') drawBlocks(g);
    previousDrawRoads(g);
    if(g.env.propMode==='city') drawRoadClarity(g);
  };
})();
