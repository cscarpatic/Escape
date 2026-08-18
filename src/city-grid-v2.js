(() => {
  const PreviousRoadNetwork = RoadNetwork;

  const CITY_XS = [-760, -380, 0, 380, 760];
  const BLOCK_H = 660;
  const ROUNDABOUT_RADIUS = 96;
  const ROUNDABOUT_ROAD_WIDTH = 126;

  const normalId = (r,c) => `C${r}_${c}`;
  const roundId = (r,c,d) => `CRA${r}_${c}_${d}`;

  RoadNetwork = class RoadNetwork extends PreviousRoadNetwork {
    constructor(env) {
      super(env);
      if (env.propMode === 'city') this.buildBlockCity();
    }

    buildBlockCity() {
      this.paths = [];
      this.props = [];
      this.stages = [];
      this.nodes = [];
      this.nodeMap = new Map();
      this.edgeId = 0;
      this.boundaries = [];
      this.cityBlocks = [];
      this.roundabouts = [];
      this.trafficLights = [];

      const total = this.env.escapeKm * 1000 + 1700;
      const rows = Math.max(10, Math.ceil(total / BLOCK_H));
      const Y = r => 260 - r * BLOCK_H;
      this.cityRows = rows;
      this.cityXs = [...CITY_XS];
      this.cityY = Y;

      // Deliberately sparse and readable: only a few roundabouts in the whole level.
      const roundaboutSet = new Set();
      [[2,1],[5,3],[8,1]].forEach(([r,c]) => { if (r < rows) roundaboutSet.add(`${r}:${c}`); });
      const isRoundabout = (r,c) => roundaboutSet.has(`${r}:${c}`);

      // Build all junctions first. A roundabout replaces the normal intersection with
      // four real entry nodes, so no road ever passes through its central island.
      for (let r=0; r<=rows; r++) {
        for (let c=0; c<CITY_XS.length; c++) {
          const x=CITY_XS[c], y=Y(r);
          if (isRoundabout(r,c)) {
            this.node(roundId(r,c,'N'), x, y-ROUNDABOUT_RADIUS, 'roundabout-entry');
            this.node(roundId(r,c,'E'), x+ROUNDABOUT_RADIUS, y, 'roundabout-entry');
            this.node(roundId(r,c,'S'), x, y+ROUNDABOUT_RADIUS, 'roundabout-entry');
            this.node(roundId(r,c,'W'), x-ROUNDABOUT_RADIUS, y, 'roundabout-entry');
            this.roundabouts.push({r,c,x,y,radius:ROUNDABOUT_RADIUS,island:35});
          } else {
            this.node(normalId(r,c), x, y, 'city-junction');
          }
        }
      }

      const port = (r,c,d) => isRoundabout(r,c)
        ? this.nodeMap.get(roundId(r,c,d))
        : this.nodeMap.get(normalId(r,c));

      const add = (a,b,opt={}) => {
        const p=this.edge(a,b,opt);
        if (opt.width) p.width=opt.width;
        if (opt.trafficWeight !== undefined) p.trafficWeight=opt.trafficWeight;
        return p;
      };

      const vertical = Array.from({length:rows},()=>Array(CITY_XS.length));

      // Five continuous north/south streets. The centre is the main boulevard;
      // the two outer streets are larger urban arterials; the others are local streets.
      for (let r=0; r<rows; r++) {
        for (let c=0; c<CITY_XS.length; c++) {
          const arterial = c===0 || c===2 || c===4;
          vertical[r][c] = add(
            port(r,c,'S'), port(r+1,c,'N'),
            {
              kind: arterial ? 'state' : 'city',
              stage:r,
              curve:0,
              width:c===2 ? 188 : arterial ? 174 : 154,
              trafficWeight:c===2 ? .42 : arterial ? .34 : .22,
              trafficTrait:r<2?'clear':undefined,
            }
          );
        }
      }

      // One coherent cross street per block row. Every third one is a broader avenue.
      for (let r=0; r<=rows; r++) {
        const arterial = r % 3 === 0;
        for (let c=0; c<CITY_XS.length-1; c++) {
          add(
            port(r,c,'E'), port(r,c+1,'W'),
            {
              kind: arterial ? 'state' : 'city',
              stage:Math.max(0,Math.min(rows-1,r-1)),
              curve:0,
              width:arterial ? 176 : 152,
              trafficWeight:arterial ? .34 : .20,
              trafficTrait:r<2?'clear':undefined,
              feature:'fourway',
            }
          );
        }
      }

      // True circular roundabouts. Roads terminate at their entry nodes and the four
      // quarter-circle edges are the only way around the central island.
      for (const rb of this.roundabouts) {
        const n=this.nodeMap.get(roundId(rb.r,rb.c,'N'));
        const e=this.nodeMap.get(roundId(rb.r,rb.c,'E'));
        const s=this.nodeMap.get(roundId(rb.r,rb.c,'S'));
        const w=this.nodeMap.get(roundId(rb.r,rb.c,'W'));
        this.addRoundaboutArc(n,e,rb,-Math.PI/2,0);
        this.addRoundaboutArc(e,s,rb,0,Math.PI/2);
        this.addRoundaboutArc(s,w,rb,Math.PI/2,Math.PI);
        this.addRoundaboutArc(w,n,rb,Math.PI,Math.PI*1.5);
      }

      // A motorway stays outside the blocks. Only two or three explicit junctions connect
      // it to the eastern city avenue, so it never slices through the neighbourhoods.
      const hx=1180, highway=[];
      for (let r=0;r<=rows;r++) highway[r]=this.node(`CH${r}`,hx,Y(r),'highway');
      for (let r=0;r<rows;r++) add(highway[r],highway[r+1],{
        kind:'highway',stage:r,curve:10,width:222,trafficWeight:.58,trafficTrait:'clear'
      });
      for (let r=3;r<rows;r+=4) {
        add(port(r,4,'E'),highway[r],{
          kind:'state',stage:Math.max(0,r-1),curve:-46,width:164,
          trafficWeight:.24,trafficTrait:'clear',feature:'interchange'
        });
      }

      // Blocks are derived from the finished roads, never the other way around.
      // This makes it geometrically impossible for a building to sit on a carriageway.
      for (let r=0;r<rows;r++) {
        const yTop=Y(r), yBottom=Y(r+1);
        const topHalf=(r%3===0?176:152)/2;
        const bottomHalf=((r+1)%3===0?176:152)/2;
        for (let c=0;c<CITY_XS.length-1;c++) {
          const leftWidth=(c===0||c===2||c===4)?(c===2?188:174):154;
          const rightCol=c+1;
          const rightWidth=(rightCol===0||rightCol===2||rightCol===4)?(rightCol===2?188:174):154;
          const left=CITY_XS[c]+leftWidth/2+28;
          const right=CITY_XS[c+1]-rightWidth/2-28;
          const top=Math.min(yTop,yBottom)+topHalf+30;
          const bottom=Math.max(yTop,yBottom)-bottomHalf-30;
          if (right-left<90 || bottom-top<130) continue;
          const h=hash(r*97+c*31+17);
          const type=h<.14?'park':h<.24?'parking':'buildings';
          const block={left,right,top,bottom,row:r,col:c,type,seed:r*100+c};
          this.cityBlocks.push(block);
          if (type==='buildings') this.populateBlock(block);
        }
      }

      // Traffic lights only on actual normal intersections, never on a roundabout.
      this.trafficLights=this.nodes.filter(n=>{
        const m=/^C(\d+)_(\d+)$/.exec(n.id||'');
        if(!m) return false;
        const r=+m[1],c=+m[2];
        return r>0 && r<rows && c>0 && c<CITY_XS.length-1 && r%2===0 && n.edges.length>=3;
      });

      for (let r=0;r<rows;r++) {
        this.stages.push({
          index:r,
          startY:Y(r)+90,
          endY:Y(r+1)-90,
          centerX:0,
          endX:0,
          left:vertical[r][1]||vertical[r][0],
          right:vertical[r][3]||vertical[r][4],
          midY:(Y(r)+Y(r+1))/2,
        });
      }

      // Brighter asphalt/curbs for the night level.
      this.env.road='#26343f';
      this.env.shoulder='#6c747a';
      this.env.lane='#eef2f4';
    }

    addRoundaboutArc(a,b,rb,start,end) {
      const points=[];
      const samples=12;
      for(let i=0;i<=samples;i++){
        const t=i/samples,ang=lerp(start,end,t);
        points.push({x:rb.x+Math.cos(ang)*rb.radius,y:rb.y+Math.sin(ang)*rb.radius});
      }
      let length=0;for(let i=1;i<points.length;i++)length+=dist2(points[i-1],points[i]);
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      const id=`R${this.edgeId++}`;
      const p={
        id,branch:this.edgeId,stage:Math.max(0,rb.r-1),kind:'city',trafficTrait:'clear',
        trait:'ROTATORIA · LIBERA',points,length,width:ROUNDABOUT_ROAD_WIDTH,
        minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),midX:rb.x,
        nodeA:a.id,nodeB:b.id,trafficWeight:.001,feature:'roundabout',oneWay:1,level:0,topology:true,
      };
      this.paths.push(p);a.edges.push(id);b.edges.push(id);return p;
    }

    populateBlock(block) {
      const w=block.right-block.left,h=block.bottom-block.top;
      const cols=w>250?2:1;
      const rows=h>360?2:1;
      let k=0;
      for(let iy=0;iy<rows;iy++) for(let ix=0;ix<cols;ix++) {
        const x=lerp(block.left,block.right,(ix+1)/(cols+1));
        const y=lerp(block.top,block.bottom,(iy+1)/(rows+1));
        this.props.push({
          x:x+randRange(block.seed*37+k,-18,18),
          y:y+randRange(block.seed*41+k,-24,24),
          side:0,seed:12000+block.seed*10+k,mode:'city'
        });
        k++;
      }
    }
  };

  function pushFromRoundaboutIsland(car,rb,player,g) {
    const dx=car.x-rb.x,dy=car.y-rb.y,d=Math.hypot(dx,dy),min=rb.island+(car.width||28)*.52;
    if(d>=min) return false;
    const nx=d>.001?dx/d:1,ny=d>.001?dy/d:0;
    car.x=rb.x+nx*(min+1);car.y=rb.y+ny*(min+1);
    car.speed*=player?.60:.76;
    if(player) g.camera.shake=Math.max(g.camera.shake,3.5);
    return true;
  }

  const previousUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    previousUpdate.call(this,dt);
    if(this.finished||this.env.propMode!=='city'||!this.road.roundabouts) return;
    for(const rb of this.road.roundabouts){
      if(Math.abs(rb.y-this.player.y)>850) continue;
      pushFromRoundaboutIsland(this.player,rb,true,this);
      for(const cop of this.cops) pushFromRoundaboutIsland(cop,rb,false,this);
    }
  };
})();
