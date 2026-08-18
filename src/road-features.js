(() => {
  const PreviousRoadNetwork = RoadNetwork;

  const featureLabel = {
    roundabout: 'ROTATORIA',
    interchange: 'SVINCOLO',
    overpass: 'PONTE / CAVALCAVIA',
    underpass: 'SOTTOPASSO',
    alley: 'VICOLO',
    oneway: 'SENSO UNICO',
    tjunction: 'INCROCIO A T',
    fourway: 'INCROCIO A 4 VIE',
  };

  function pathFromPoints(net, points, options = {}) {
    const kind = options.kind || 'city';
    const widthScale = options.widthScale ?? (kind === 'highway' ? 1.18 : kind === 'state' ? .86 : .68);
    const dense = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(2, Math.ceil(len / 24));
      for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
        const t = k / steps;
        dense.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      }
    }
    let length = 0;
    for (let i = 1; i < dense.length; i++) length += dist2(dense[i - 1], dense[i]);
    const xs = dense.map(p => p.x), ys = dense.map(p => p.y);
    const feature = options.feature || null;
    return {
      stage: options.stage ?? 0,
      branch: 20000 + net.paths.length,
      kind,
      trafficTrait: options.trafficTrait || 'clear',
      trait: feature ? `${featureLabel[feature] || feature} · ${(options.trafficTrait || 'clear').toUpperCase()}` : (options.trafficTrait || 'clear'),
      points: dense,
      length,
      width: net.env.roadWidth * widthScale,
      minY: Math.min(...ys), maxY: Math.max(...ys),
      minX: Math.min(...xs), maxX: Math.max(...xs),
      midX: (Math.min(...xs) + Math.max(...xs)) / 2,
      trafficWeight: options.trafficWeight ?? (kind === 'highway' ? 1.05 : kind === 'state' ? .72 : .42),
      feature,
      oneWay: options.oneWay || 0,
      level: options.level || 0,
      special: true,
    };
  }

  function circlePoints(cx, cy, radius, start = 0, turns = 1, samples = 42) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const a = start + turns * Math.PI * 2 * (i / samples);
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
    return pts;
  }

  function arcPoints(cx, cy, radius, a0, a1, samples = 24) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const a = lerp(a0, a1, i / samples);
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
    return pts;
  }

  function rowsOf(net) {
    const rows = new Map();
    for (const n of net.nodes || []) {
      if (!rows.has(n.row)) rows.set(n.row, []);
      rows.get(n.row).push(n);
    }
    for (const row of rows.values()) row.sort((a, b) => a.col - b.col);
    return rows;
  }

  RoadNetwork = class RoadNetwork extends PreviousRoadNetwork {
    constructor(env) {
      super(env);
      this.specials = [];
      this.addAdvancedRoadFeatures();
    }

    addSpecial(path) {
      this.paths.push(path);
      this.specials.push(path);
      return path;
    }

    addAdvancedRoadFeatures() {
      const rows = rowsOf(this);
      const rowIds = [...rows.keys()].sort((a, b) => a - b);
      if (rowIds.length < 5) return;
      const city = this.env.propMode === 'city';
      const centerCol = Math.floor(rows.get(rowIds[0]).length / 2);

      // Real roundabouts: circular road + four physical approaches.
      const roundEvery = city ? 3 : 5;
      for (let ri = 2; ri < rowIds.length - 2; ri += roundEvery) {
        const r = rowIds[ri], row = rows.get(r);
        const c = clamp(centerCol + (hash(r * 17) > .5 ? 1 : -1), 1, row.length - 2);
        const n = row[c];
        const radius = city ? 74 : 92;
        const kind = city ? 'city' : 'state';
        this.addSpecial(pathFromPoints(this, circlePoints(n.x, n.y, radius), {
          kind, widthScale: city ? .57 : .72, stage: r, feature: 'roundabout', oneWay: 1, trafficWeight: .48,
        }));
        const north = rows.get(rowIds[ri + 1])?.[c];
        const south = rows.get(rowIds[ri - 1])?.[c];
        const west = row[c - 1], east = row[c + 1];
        const approaches = [
          [north, {x:n.x, y:n.y-radius}],
          [south, {x:n.x, y:n.y+radius}],
          [west, {x:n.x-radius, y:n.y}],
          [east, {x:n.x+radius, y:n.y}],
        ];
        approaches.forEach(([outer, inner], idx) => {
          if (!outer) return;
          this.addSpecial(pathFromPoints(this, [outer, inner], {
            kind, widthScale: city ? .56 : .70, stage:r, feature: idx < 2 ? 'fourway' : 'roundabout', trafficWeight:.5,
          }));
        });
      }

      // T junctions and dead-end escape streets near the edges.
      for (let ri = 1; ri < rowIds.length - 1; ri += city ? 2 : 4) {
        const r = rowIds[ri], row = rows.get(r);
        const side = hash(r * 39) > .5 ? 1 : -1;
        const anchor = side > 0 ? row[row.length - 2] : row[1];
        const len = city ? 360 : 460;
        const end = { x: anchor.x + side * len, y: anchor.y + randRange(r * 43, -60, 60) };
        this.addSpecial(pathFromPoints(this, [anchor, end], {
          kind: city ? 'city' : 'state', widthScale: city ? .52 : .68, stage:r, feature:'tjunction', trafficWeight:.28,
        }));
        if (city && hash(r * 71) > .35) {
          const alleyEnd = { x:end.x, y:end.y - 230 };
          this.addSpecial(pathFromPoints(this, [end, alleyEnd], {
            kind:'city', widthScale:.34, stage:r, feature:'alley', trafficWeight:.10,
          }));
        }
      }

      // One-way urban shortcuts between blocks.
      if (city) {
        for (let ri = 1; ri < rowIds.length - 1; ri += 2) {
          const r=rowIds[ri], row=rows.get(r);
          for (let c=1;c<row.length-2;c+=2) {
            if (hash(r*101+c*23) < .42) continue;
            const a=row[c], b=row[c+1];
            const bend={x:(a.x+b.x)/2, y:(a.y+b.y)/2 + (hash(r*17+c)>.5?70:-70)};
            this.addSpecial(pathFromPoints(this,[a,bend,b],{
              kind:'city',widthScale:.44,stage:r,feature:'oneway',oneWay:hash(r*13+c)>.5?1:-1,trafficWeight:.24,
            }));
          }
        }
      }

      // Highway interchanges: overpass + clover-like ramps around the central motorway.
      for (let ri = 3; ri < rowIds.length - 2; ri += 6) {
        const r=rowIds[ri], row=rows.get(r), mid=row[centerCol];
        const span = city ? 620 : 760;
        const overA={x:mid.x-span/2,y:mid.y}, overB={x:mid.x+span/2,y:mid.y};
        this.addSpecial(pathFromPoints(this,[overA,overB],{
          kind:'state',widthScale:.82,stage:r,feature:'overpass',level:1,trafficWeight:.72,
        }));
        const rad=city?115:135;
        const quadrants=[
          [Math.PI,Math.PI*1.5,-1,-1], [Math.PI*1.5,Math.PI*2,1,-1],
          [0,Math.PI*.5,1,1], [Math.PI*.5,Math.PI,-1,1],
        ];
        quadrants.forEach((q,idx)=>{
          const [a0,a1,sx,sy]=q;
          const cx=mid.x+sx*rad, cy=mid.y+sy*rad;
          const arc=arcPoints(cx,cy,rad,a0,a1,22);
          this.addSpecial(pathFromPoints(this,arc,{
            kind:'state',widthScale:.50,stage:r,feature:'interchange',oneWay:1,trafficWeight:.38,
          }));
        });
      }

      // Occasional underpasses on secondary roads.
      for (let ri = 4; ri < rowIds.length - 1; ri += 7) {
        const r=rowIds[ri], row=rows.get(r);
        if (row.length < 4) continue;
        const a=row[1], b=row[row.length-2];
        const y=(a.y+b.y)/2+55;
        this.addSpecial(pathFromPoints(this,[{x:a.x,y},{x:b.x,y}],{
          kind:'state',widthScale:.68,stage:r,feature:'underpass',level:-1,trafficWeight:.52,
        }));
      }
    }
  };

  // Respect one-way roads for AI traffic generated by the existing spawner.
  const previousSpawnTraffic = Game.prototype.spawnTraffic;
  Game.prototype.spawnTraffic = function () {
    previousSpawnTraffic.call(this);
    for (const t of this.traffic) {
      if (t.path?.oneWay) {
        t.direction = t.path.oneWay;
        const p = samplePath(t.path, t.t);
        t.angle = p.angle + (t.direction < 0 ? Math.PI : 0);
      }
    }
  };

  const previousDrawRoads = drawRoads;
  drawRoads = function (g) {
    previousDrawRoads(g);
    const near = (g.road.specials || []).filter(p => p.minY <= g.player.y + 1200 && p.maxY >= g.player.y - 1200);
    for (const p of near) {
      const pts=p.points.map(q=>worldToScreen(q.x,q.y));
      if (p.feature === 'overpass') {
        ctx.save();
        ctx.globalAlpha=.55; ctx.translate(5,7); strokePath(pts,'rgba(0,0,0,.8)',p.width+18); ctx.restore();
        strokePath(pts,g.env.shoulder,p.width+13); strokePath(pts,g.env.road,p.width);
        ctx.save();ctx.setLineDash([24,26]);strokePath(pts,'rgba(230,238,244,.8)',2);ctx.restore();
        ctx.save();ctx.globalAlpha=.75;strokePath(pts,'rgba(190,210,220,.45)',p.width+5);ctx.restore();
      }
      if (p.feature === 'underpass') {
        ctx.save();ctx.globalAlpha=.45;strokePath(pts,'rgba(0,0,0,.92)',p.width+20);ctx.restore();
        ctx.save();ctx.globalAlpha=.6;ctx.setLineDash([8,14]);strokePath(pts,'rgba(255,255,255,.38)',1.5);ctx.restore();
      }
      if (p.feature === 'roundabout') {
        const c=p.points[Math.floor(p.points.length/4)];
        const center={x:(p.minX+p.maxX)/2,y:(p.minY+p.maxY)/2};
        const s=worldToScreen(center.x,center.y);
        const r=Math.max(20,(p.maxX-p.minX)/2-p.width*.62);
        ctx.save();ctx.fillStyle='rgba(10,16,16,.92)';ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      }
      if (p.oneWay) {
        const sample=samplePath(p,.52), s=worldToScreen(sample.x,sample.y);
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(sample.angle+(p.oneWay<0?Math.PI:0));ctx.fillStyle='rgba(235,245,250,.62)';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-8,-6);ctx.lineTo(-4,0);ctx.lineTo(-8,6);ctx.closePath();ctx.fill();ctx.restore();
      }
      if (p.feature === 'alley') {
        ctx.save();ctx.globalAlpha=.25;ctx.setLineDash([3,10]);strokePath(pts,'rgba(255,255,255,.45)',1);ctx.restore();
      }
    }
  };

  // Surface special-road choices contextually without covering the road all the time.
  const previousUpdateGameState = Game.prototype.updateGameState;
  Game.prototype.updateGameState = function (dt) {
    previousUpdateGameState.call(this, dt);
    if (this.finished) return;
    const info=this.road.nearestInfo(this.player.x,this.player.y);
    const feature=info.path?.feature;
    if (!feature) { this._lastRoadFeature=null; return; }
    if (feature !== this._lastRoadFeature && info.d < (info.path.width||this.env.roadWidth)*.48) {
      this._lastRoadFeature=feature;
      const label=featureLabel[feature];
      if (label) {
        ui.junctionText.textContent = label;
        ui.junctionHint.classList.remove('hidden');
        clearTimeout(this._featureHintTimer);
        this._featureHintTimer=setTimeout(()=>ui.junctionHint.classList.add('hidden'),1500);
      }
    }
  };
})();
