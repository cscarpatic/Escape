(() => {
  const BaseRoadNetwork = RoadNetwork;

  function cityNodeParts(id) {
    const m = /^C(\d+)_(\d+)$/.exec(id || '');
    return m ? { row:+m[1], col:+m[2] } : null;
  }

  RoadNetwork = class RoadNetwork extends BaseRoadNetwork {
    constructor(env) {
      super(env);
      if (env.propMode === 'city') this.refineCity();
    }

    refineCity() {
      // Keep three continuous N/S axes (local / arterial / local), and one E/W street
      // every two block rows. This removes roughly half the previous city-road density.
      this.paths = this.paths.filter(p => {
        const a = cityNodeParts(p.nodeA), b = cityNodeParts(p.nodeB);
        if (!a || !b) return p.kind === 'highway' || p.feature === 'interchange';

        if (a.col === b.col) return a.col >= 1 && a.col <= 3;
        if (a.row === b.row) {
          const minCol = Math.min(a.col,b.col), maxCol = Math.max(a.col,b.col);
          return a.row % 2 === 0 && minCol >= 1 && maxCol <= 3;
        }
        return false;
      });

      // City streets become generous two-way streets; the central axis remains the
      // wider urban arterial. Motorway width is unchanged.
      for (const p of this.paths) {
        if (p.kind === 'city') p.width *= 1.38;
        if (p.kind === 'state' && cityNodeParts(p.nodeA) && cityNodeParts(p.nodeB)) p.width *= 1.14;
      }

      const valid = new Set(this.paths.map(p => p.id));
      for (const n of this.nodes) n.edges = (n.edges || []).filter(id => valid.has(id));

      this.trafficLights = this.nodes.filter(n => {
        const q = cityNodeParts(n.id);
        return q && q.col >= 1 && q.col <= 3 && q.row % 2 === 0 && n.edges.length >= 3;
      });

      // Refresh the generic stage choices so HUD hints reference roads that still exist.
      for (const s of this.stages) {
        const candidates = this.paths.filter(p => p.stage === s.index && p.kind !== 'highway');
        if (candidates.length) {
          candidates.sort((a,b) => a.midX - b.midX);
          s.left = candidates[0];
          s.right = candidates[candidates.length - 1];
        }
      }
    }
  };

  function buildingBounds(prop) {
    if (prop.mode !== 'city') return null;
    const h = hash(prop.seed * 7);
    return {
      left: prop.x - (45 + h * 45) / 2,
      right: prop.x + (45 + h * 45) / 2,
      top: prop.y - (70 + hash(prop.seed * 11) * 110) / 2,
      bottom: prop.y + (70 + hash(prop.seed * 11) * 110) / 2,
    };
  }

  function pushCarOutOfBuilding(car, prop, game, player=false) {
    const b = buildingBounds(prop); if (!b) return false;
    const pad = player ? 17 : 15;
    const left=b.left-pad,right=b.right+pad,top=b.top-pad,bottom=b.bottom+pad;
    if (car.x <= left || car.x >= right || car.y <= top || car.y >= bottom) return false;

    const dl=Math.abs(car.x-left), dr=Math.abs(right-car.x), dt=Math.abs(car.y-top), db=Math.abs(bottom-car.y);
    const m=Math.min(dl,dr,dt,db);
    if (m===dl) car.x=left;
    else if (m===dr) car.x=right;
    else if (m===dt) car.y=top;
    else car.y=bottom;

    car.speed *= player ? .30 : .55;
    if (player) {
      game.camera.shake=Math.max(game.camera.shake,8);
      if ((game._buildingHitCooldown||0)<=0) {
        game._buildingHitCooldown=.35;
        game.spawnSparks(car.x,car.y,8);
        audio.hit();
      }
    }
    return true;
  }

  const baseGameUpdate = Game.prototype.update;
  Game.prototype.update = function(dt) {
    baseGameUpdate.call(this,dt);
    if (this.finished || this.env.propMode !== 'city') return;
    this._buildingHitCooldown=Math.max(0,(this._buildingHitCooldown||0)-dt);
    const near=this.road.props.filter(p => p.mode==='city' && Math.abs(p.y-this.player.y)<520 && Math.abs(p.x-this.player.x)<900);
    for (const prop of near) pushCarOutOfBuilding(this.player,prop,this,true);
    for (const cop of this.cops) {
      if (Math.abs(cop.y-this.player.y)>850) continue;
      for (const prop of near) pushCarOutOfBuilding(cop,prop,this,false);
    }
  };

  function signalState(node) {
    const q=cityNodeParts(node.id)||{row:0,col:0};
    const phase=(performance.now()/1000 + (q.row+q.col)*.63) % 6;
    return phase < 2.7 ? 'green' : phase < 3.2 ? 'amber' : 'red';
  }

  function drawSignalHeads(g, glowOnly=false) {
    if (!g || g.env.propMode !== 'city' || !g.road.trafficLights) return;
    for (const n of g.road.trafficLights) {
      if (Math.abs(n.y-g.player.y)>850) continue;
      const s=worldToScreen(n.x,n.y), state=signalState(n);
      if (s.x<-50||s.x>W+50||s.y<-50||s.y>H+50) continue;
      const color=state==='green'?'77,255,154':state==='amber'?'255,194,72':'255,64,78';
      if (glowOnly) {
        ctx.save();ctx.globalCompositeOperation='screen';
        const rg=ctx.createRadialGradient(s.x,s.y,1,s.x,s.y,34);rg.addColorStop(0,`rgba(${color},.24)`);rg.addColorStop(1,`rgba(${color},0)`);
        ctx.fillStyle=rg;ctx.fillRect(s.x-34,s.y-34,68,68);ctx.restore();
        continue;
      }
      ctx.save();
      const offsets=[[-18,-18],[18,18]];
      for (const [ox,oy] of offsets) {
        ctx.fillStyle='rgba(7,10,13,.95)';ctx.fillRect(s.x+ox-5,s.y+oy-10,10,20);
        ctx.fillStyle=state==='red'?'#ff404e':'#5a1e25';ctx.beginPath();ctx.arc(s.x+ox,s.y+oy-6,2.7,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=state==='amber'?'#ffc248':'#594620';ctx.beginPath();ctx.arc(s.x+ox,s.y+oy,2.7,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=state==='green'?'#4dff9a':'#1c4e35';ctx.beginPath();ctx.arc(s.x+ox,s.y+oy+6,2.7,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }

  const baseDrawRoads = drawRoads;
  drawRoads = function(g) {
    baseDrawRoads(g);
    drawSignalHeads(g,false);
  };

  const baseRender = render;
  render = function() {
    baseRender();
    if (game) drawSignalHeads(game,true);
  };
})();