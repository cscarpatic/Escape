(() => {
  const PreviousRoadNetwork = RoadNetwork;
  const cityNode = id => { const m=/^C(\d+)_(\d+)$/.exec(id||''); return m?{row:+m[1],col:+m[2]}:null; };

  // Easier opening level: less traffic, slower pursuit, more initial breathing room.
  Object.assign(ENVIRONMENTS[0], { traffic:.46, oncoming:.06, copPower:.70, startGap:470, steerAssist:1.30, offroadMax:118 });

  RoadNetwork = class RoadNetwork extends PreviousRoadNetwork {
    constructor(env){
      super(env);
      this.boundaries=[];
      if(env.propMode==='city') this.makeCityReadable();
    }

    makeCityReadable(){
      // Keep the three continuous avenues, but only one cross street every four rows.
      // All other short city fragments are removed. Motorway/interchanges remain peripheral.
      this.paths=this.paths.filter(p=>{
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        if(!a||!b) return p.kind==='highway'||p.feature==='interchange';
        if(a.col===b.col) return a.col>=1&&a.col<=3;
        if(a.row===b.row){
          const lo=Math.min(a.col,b.col),hi=Math.max(a.col,b.col);
          return a.row%4===0&&lo>=1&&hi<=3;
        }
        return false;
      });

      // Wide, forgiving roads.
      for(const p of this.paths){
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        if(a&&b&&p.kind==='city') p.width*=1.16;
        if(a&&b&&p.kind==='state') p.width*=1.10;
      }

      const valid=new Set(this.paths.map(p=>p.id));
      for(const n of this.nodes) n.edges=(n.edges||[]).filter(id=>valid.has(id));
      this.trafficLights=this.nodes.filter(n=>{
        const q=cityNode(n.id);return q&&q.col>=1&&q.col<=3&&q.row%4===0&&n.edges.length>=3;
      });

      // Rebuild visible curb/bollard boundaries along the blocks. We leave generous gaps
      // around intersections, so the player is guided rather than trapped.
      for(const p of this.paths){
        const a=cityNode(p.nodeA),b=cityNode(p.nodeB);
        if(!a||!b||p.kind==='highway') continue;
        const step=105;
        for(let d=step;d<p.length-step;d+=step){
          const t=d/p.length;
          if(t<.18||t>.82) continue;
          const s=samplePath(p,t),a2=samplePath(p,Math.min(.995,t+.01));
          const dx=a2.x-s.x,dy=a2.y-s.y,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
          const off=p.width*.56+14;
          this.boundaries.push({x:s.x+nx*off,y:s.y+ny*off,r:8});
          this.boundaries.push({x:s.x-nx*off,y:s.y-ny*off,r:8});
        }
      }

      for(const s of this.stages){
        const candidates=this.paths.filter(p=>p.stage===s.index&&p.kind!=='highway');
        if(candidates.length){candidates.sort((a,b)=>a.midX-b.midX);s.left=candidates[0];s.right=candidates[candidates.length-1];}
      }
    }
  };

  function pushFromBoundary(car,b,soft=false){
    const dx=car.x-b.x,dy=car.y-b.y,d=Math.hypot(dx,dy),min=(car.width||28)*.46+b.r;
    if(d>=min||d<.001) return false;
    const nx=dx/d,ny=dy/d,push=min-d+1;
    car.x+=nx*push;car.y+=ny*push;car.speed*=soft?.78:.58;return true;
  }

  const baseUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    baseUpdate.call(this,dt);
    if(this.finished||this.env.propMode!=='city'||!this.road.boundaries) return;
    for(const b of this.road.boundaries){
      if(Math.abs(b.y-this.player.y)>520||Math.abs(b.x-this.player.x)>760) continue;
      if(pushFromBoundary(this.player,b,false)) this.camera.shake=Math.max(this.camera.shake,3.5);
      for(const c of this.cops) if(Math.abs(c.y-b.y)<150&&Math.abs(c.x-b.x)<150) pushFromBoundary(c,b,true);
    }
  };

  function drawBoundaries(g){
    if(g.env.propMode!=='city'||!g.road.boundaries) return;
    for(const b of g.road.boundaries){
      if(Math.abs(b.y-g.player.y)>850) continue;
      const s=worldToScreen(b.x,b.y);if(s.x<-30||s.x>W+30||s.y<-30||s.y>H+30) continue;
      ctx.save();
      ctx.fillStyle='rgba(8,11,14,.96)';ctx.strokeStyle='rgba(225,235,240,.42)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(s.x,s.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(255,202,76,.72)';ctx.fillRect(s.x-1.5,s.y-4,3,3);
      ctx.restore();
    }
  }

  const baseDrawRoads=drawRoads;
  drawRoads=function(g){
    baseDrawRoads(g);
    if(g.env.propMode==='city'){
      // Strong road-edge contrast: a light curb line on each side of local roads.
      for(const p of g.road.nearbyPaths(g.player.y,1150)){
        if(p.kind==='highway') continue;
        const pts=p.points;
        for(let side of [-1,1]){
          const out=[];
          for(let i=0;i<pts.length;i++){
            const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;
            const nx=-dy/l,ny=dx/l,off=p.width*.52+5;
            out.push(worldToScreen(pts[i].x+nx*off*side,pts[i].y+ny*off*side));
          }
          ctx.save();ctx.globalAlpha=.52;strokePath(out,'rgba(226,233,238,.72)',2);ctx.restore();
        }
      }
      drawBoundaries(g);
    }
  };
})();