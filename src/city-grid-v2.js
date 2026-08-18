(() => {
  const PreviousRoadNetwork = RoadNetwork;

  const CITY_XS = [-760, -380, 0, 380, 760];
  const BLOCK_H = 660;
  const normalId = (r,c) => `C${r}_${c}`;

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
      this.elevatedRoutes = [];
      this.diagonalCells = new Set();
      this.trafficLights = [];
      this._preferredLevel = 0;

      const total = this.env.escapeKm * 1000 + 1700;
      const rows = Math.max(10, Math.ceil(total / BLOCK_H));
      const Y = r => 260 - r * BLOCK_H;
      this.cityRows = rows;
      this.cityXs = [...CITY_XS];
      this.cityY = Y;

      for (let r=0; r<=rows; r++) {
        for (let c=0; c<CITY_XS.length; c++) {
          this.node(normalId(r,c), CITY_XS[c], Y(r), 'city-junction');
        }
      }

      const add = (a,b,opt={}) => {
        const p=this.edge(a,b,opt);
        if (opt.width) p.width=opt.width;
        if (opt.trafficWeight !== undefined) p.trafficWeight=opt.trafficWeight;
        if (opt.level !== undefined) p.level=opt.level;
        if (opt.feature) p.feature=opt.feature;
        return p;
      };

      const verticalWidths = [190, 150, 214, 162, 184];
      const vertical = Array.from({length:rows},()=>Array(CITY_XS.length));

      // Five coherent continuous axes, deliberately different in width.
      for (let r=0; r<rows; r++) {
        for (let c=0; c<CITY_XS.length; c++) {
          const arterial = c===0 || c===2 || c===4;
          vertical[r][c] = add(
            this.nodeMap.get(normalId(r,c)), this.nodeMap.get(normalId(r+1,c)),
            {
              kind: arterial ? 'state' : 'city', stage:r, curve:0,
              width:verticalWidths[c],
              trafficWeight:c===2 ? .42 : arterial ? .32 : .20,
              trafficTrait:r<2?'clear':undefined,
              level:0,
            }
          );
        }
      }

      // Cross streets have a consistent hierarchy: avenue, collector, local street.
      for (let r=0; r<=rows; r++) {
        const width = r%4===0 ? 194 : r%2===0 ? 166 : 146;
        const arterial = width>=190;
        for (let c=0; c<CITY_XS.length-1; c++) {
          add(
            this.nodeMap.get(normalId(r,c)), this.nodeMap.get(normalId(r,c+1)),
            {
              kind:arterial?'state':'city',
              stage:Math.max(0,Math.min(rows-1,r-1)), curve:0, width,
              trafficWeight:arterial?.34:width>150?.25:.18,
              trafficTrait:r<2?'clear':undefined,
              feature:'fourway', level:0,
            }
          );
        }
      }

      // Occasional single-block diagonals. They always connect two real junctions and never
      // cross another same-level road except at their endpoints.
      const diagonalSpecs=[];
      for(let r=2, k=0; r<rows-1; r+=5, k++) {
        const c = k%2===0 ? 0 : 3;
        const toC = k%2===0 ? 1 : 2;
        const a=this.nodeMap.get(normalId(r,c));
        const b=this.nodeMap.get(normalId(r+1,toC));
        const p=add(a,b,{
          kind:'city', stage:r, curve:0, width:138, trafficWeight:.14,
          trafficTrait:'clear', feature:'diagonal', level:0,
        });
        diagonalSpecs.push(p);
        this.diagonalCells.add(`${r}:${Math.min(c,toC)}`);
      }

      // Elevated express shortcuts. They cross the city on level 1; all ordinary roads remain
      // on level 0 and continue underneath. Only the two ramps connect the two levels.
      const elevatedMain=[];
      let flyIndex=0;
      for(let r=3; r+4<=rows; r+=7, flyIndex++) {
        const fromC=flyIndex%2===0?1:3;
        const toC=flyIndex%2===0?3:1;
        const groundA=this.nodeMap.get(normalId(r,fromC));
        const groundB=this.nodeMap.get(normalId(r+4,toC));
        if(!groundA||!groundB) continue;

        const dx=groundB.x-groundA.x,dy=groundB.y-groundA.y,len=Math.hypot(dx,dy)||1;
        const ux=dx/len,uy=dy/len;
        const elevatedA=this.node(`EL${flyIndex}A`,groundA.x+ux*185,groundA.y+uy*185,'elevated');
        const elevatedB=this.node(`EL${flyIndex}B`,groundB.x-ux*185,groundB.y-uy*185,'elevated');

        const up=add(groundA,elevatedA,{
          kind:'state',stage:r,curve:18,width:122,trafficWeight:.025,
          trafficTrait:'clear',feature:'elevated-ramp',level:1,
        });
        up.rampDirection='up';up.groundNode=groundA.id;up.elevatedNode=elevatedA.id;

        const deck=add(elevatedA,elevatedB,{
          kind:'state',stage:r+1,curve:flyIndex%2===0?34:-34,width:148,trafficWeight:.055,
          trafficTrait:'clear',feature:'elevated',level:1,
        });
        deck.elevatedIndex=flyIndex;
        elevatedMain.push(deck);

        const down=add(elevatedB,groundB,{
          kind:'state',stage:r+3,curve:-18,width:122,trafficWeight:.025,
          trafficTrait:'clear',feature:'elevated-ramp',level:1,
        });
        down.rampDirection='down';down.groundNode=groundB.id;down.elevatedNode=elevatedB.id;

        this.elevatedRoutes.push({index:flyIndex,up,deck,down,from:groundA,to:groundB});
      }

      // Peripheral motorway remains separate from the city.
      const hx=1180, highway=[];
      for (let r=0;r<=rows;r++) highway[r]=this.node(`CH${r}`,hx,Y(r),'highway');
      for (let r=0;r<rows;r++) add(highway[r],highway[r+1],{
        kind:'highway',stage:r,curve:10,width:226,trafficWeight:.58,trafficTrait:'clear',level:0
      });
      for (let r=3;r<rows;r+=4) {
        add(this.nodeMap.get(normalId(r,4)),highway[r],{
          kind:'state',stage:Math.max(0,r-1),curve:-46,width:168,
          trafficWeight:.24,trafficTrait:'clear',feature:'interchange',level:0
        });
      }

      const passesElevated = block => elevatedMain.some(path => {
        if(path.maxX<block.left-90||path.minX>block.right+90||path.maxY<block.top-90||path.minY>block.bottom+90) return false;
        return path.points.some(q=>q.x>block.left-75&&q.x<block.right+75&&q.y>block.top-75&&q.y<block.bottom+75);
      });

      // Blocks derive from the finished ground network. Diagonal cells become open/parking
      // blocks so the diagonal is physically driveable; blocks below flyovers are kept flat.
      for (let r=0;r<rows;r++) {
        const yTop=Y(r), yBottom=Y(r+1);
        const topWidth=r%4===0?194:r%2===0?166:146;
        const bottomWidth=(r+1)%4===0?194:(r+1)%2===0?166:146;
        for (let c=0;c<CITY_XS.length-1;c++) {
          const left=CITY_XS[c]+verticalWidths[c]/2+28;
          const right=CITY_XS[c+1]-verticalWidths[c+1]/2-28;
          const top=Math.min(yTop,yBottom)+topWidth/2+30;
          const bottom=Math.max(yTop,yBottom)-bottomWidth/2-30;
          if (right-left<90 || bottom-top<130) continue;
          const diagonal=this.diagonalCells.has(`${r}:${c}`);
          const block={left,right,top,bottom,row:r,col:c,seed:r*100+c};
          const underElevated=passesElevated(block);
          const h=hash(r*97+c*31+17);
          block.underElevated=underElevated;
          block.driveThrough=diagonal;
          block.type=(diagonal||underElevated)?'parking':h<.14?'park':h<.24?'parking':'buildings';
          this.cityBlocks.push(block);
          if (block.type==='buildings') this.populateBlock(block);
        }
      }

      this.trafficLights=this.nodes.filter(n=>{
        const m=/^C(\d+)_(\d+)$/.exec(n.id||'');
        if(!m) return false;
        const r=+m[1],c=+m[2];
        return r>0 && r<rows && c>0 && c<CITY_XS.length-1 && r%2===0 && n.edges.length>=3;
      });

      for (let r=0;r<rows;r++) {
        this.stages.push({
          index:r,startY:Y(r)+90,endY:Y(r+1)-90,centerX:0,endX:0,
          left:vertical[r][1]||vertical[r][0],right:vertical[r][3]||vertical[r][4],
          midY:(Y(r)+Y(r+1))/2,
        });
      }

      this.env.road='#26343f';
      this.env.shoulder='#6c747a';
      this.env.lane='#eef2f4';
    }

    populateBlock(block) {
      const w=block.right-block.left,h=block.bottom-block.top;
      const cols=w>250?2:1,rows=h>360?2:1;
      let k=0;
      for(let iy=0;iy<rows;iy++) for(let ix=0;ix<cols;ix++) {
        const x=lerp(block.left,block.right,(ix+1)/(cols+1));
        const y=lerp(block.top,block.bottom,(iy+1)/(rows+1));
        this.props.push({
          x:x+randRange(block.seed*37+k,-18,18),y:y+randRange(block.seed*41+k,-24,24),
          side:0,seed:12000+block.seed*10+k,mode:'city'
        });
        k++;
      }
    }

    _nearestInfoLevel(x,y,filter) {
      let best={d:Infinity,x:0,y:0,tx:0,ty:-1,path:null,index:0};
      for(const p of this.nearbyPaths(y,1400)) {
        if(filter&&!filter(p)) continue;
        if(x<p.minX-700||x>p.maxX+700) continue;
        for(let i=1;i<p.points.length;i++) {
          const a=p.points[i-1],b=p.points[i],vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy||1;
          const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/len2,0,1),px=a.x+vx*t,py=a.y+vy*t,d=Math.hypot(x-px,y-py);
          if(d<best.d){const l=Math.sqrt(len2);best={d,x:px,y:py,tx:vx/l,ty:vy/l,path:p,index:i-1};}
        }
      }
      return best;
    }

    nearestInfoAny(x,y) { return this._nearestInfoLevel(x,y,null); }

    nearestInfo(x,y) {
      if(this.env.propMode!=='city') return super.nearestInfo(x,y);
      const level=this._preferredLevel||0;
      const best=this._nearestInfoLevel(x,y,p=>p.feature==='elevated-ramp'||(p.level||0)===level);
      return best.path?best:this._nearestInfoLevel(x,y,null);
    }
  };
})();
