(() => {
  const previousDrawRoads = drawRoads;

  function screenPoints(path) {
    return (path.points || []).map(p => worldToScreen(p.x, p.y));
  }

  function stroke(points, color, width, dash=null, alpha=1) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function worldPatch(node, half) {
    return [
      worldToScreen(node.x-half,node.y-half),
      worldToScreen(node.x+half,node.y-half),
      worldToScreen(node.x+half,node.y+half),
      worldToScreen(node.x-half,node.y+half),
    ];
  }

  function fillPatch(node, size, color) {
    const q=worldPatch(node,size*.5);
    ctx.save();
    ctx.fillStyle=color;
    ctx.beginPath();ctx.moveTo(q[0].x,q[0].y);
    for(let i=1;i<q.length;i++)ctx.lineTo(q[i].x,q[i].y);
    ctx.closePath();ctx.fill();ctx.restore();
  }

  function trimPolyline(points, amount) {
    if(!points?.length || points.length<2 || amount<=0) return points||[];
    const cutFront=(arr,cut)=>{
      const out=arr.map(p=>({x:p.x,y:p.y}));
      let left=cut;
      while(out.length>1 && left>0){
        const a=out[0],b=out[1],d=Math.hypot(b.x-a.x,b.y-a.y);
        if(d<=left){out.shift();left-=d;continue;}
        const t=left/Math.max(.001,d);
        out[0]={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};left=0;
      }
      return out;
    };
    let out=cutFront(points,amount);
    out=cutFront(out.slice().reverse(),amount).reverse();
    return out;
  }

  function incidentPaths(g,node,pathById) {
    return (node.edges||[]).map(id=>pathById.get(id)).filter(Boolean);
  }

  function visibleNode(g,node) {
    const s=worldToScreen(node.x,node.y);
    return s.x>-260 && s.x<W+260 && s.y>-260 && s.y<H+260;
  }

  function laneDash(path) {
    if(path.kind==='highway') return [42,28];
    if(path.feature==='truck-diagonal'||path.feature==='mountain-cut'||path.feature==='desert-bypass') return [24,24];
    return [30,30];
  }

  function drawContinuousNetwork(g) {
    const env=g.env;
    const paths=(g.road.nearbyPaths?g.road.nearbyPaths(g.player.y,1900):(g.road.paths||[]))
      .filter(p=>p?.points?.length>1 && (p.level||0)===0);
    const data=paths.map(p=>({p,pts:screenPoints(p)}));
    const pathById=new Map((g.road.paths||[]).map(p=>[p.id,p]));
    const nodes=(g.road.nodes||[]).filter(n=>visibleNode(g,n));

    // PASS 1 — shoulders. All segments are painted together with flat ends.
    for(const x of data) stroke(x.pts,env.shoulder,x.p.width+(x.p.kind==='highway'?24:18));

    // Join the shoulder around real graph nodes so separate edges become one physical junction.
    for(const n of nodes){
      const incident=incidentPaths(g,n,pathById).filter(p=>(p.level||0)===0);
      if(incident.length<2) continue;
      const maxWidth=Math.max(...incident.map(p=>p.width||env.roadWidth));
      fillPatch(n,maxWidth+(incident.some(p=>p.kind==='highway')?24:18),env.shoulder);
    }

    // PASS 2 — one continuous asphalt surface.
    for(const x of data) stroke(x.pts,env.road,x.p.width);
    for(const n of nodes){
      const incident=incidentPaths(g,n,pathById).filter(p=>(p.level||0)===0);
      if(incident.length<2) continue;
      const maxWidth=Math.max(...incident.map(p=>p.width||env.roadWidth));
      fillPatch(n,maxWidth,env.road);
    }

    // Very subtle road-body variation, still in a full-network pass rather than edge-by-edge caps.
    for(const x of data){
      const inner=Math.max(10,x.p.width-18);
      stroke(x.pts,window.NightHeistLighting==='day'?'rgba(255,255,255,.055)':'rgba(172,198,207,.10)',inner,null,1);
    }

    // PASS 3 — markings. Trim both ends so centre lines stop before intersections.
    for(const x of data){
      const p=x.p;
      const raw=trimPolyline(p.points,Math.min(58,Math.max(34,p.width*.26)));
      if(raw.length<2) continue;
      const pts=raw.map(q=>worldToScreen(q.x,q.y));
      stroke(pts,env.lane,p.kind==='highway'?3:2.3,laneDash(p),.90);

      // Wide roads get faint edge guides, which makes the carriageway width readable without
      // turning each segment into a bordered capsule.
      if(p.width>=170){
        stroke(pts,window.NightHeistLighting==='day'?'rgba(255,255,255,.18)':'rgba(225,235,238,.13)',Math.max(1,p.width-22),null,.16);
      }
    }
  }

  drawRoads=function(g){
    if(!g || g.env.propMode==='city' || !g.road.environmentBlocks?.length) return previousDrawRoads(g);
    drawContinuousNetwork(g);
  };
})();
