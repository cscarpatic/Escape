(() => {
  function polygonForBlock(b) {
    return [
      worldToScreen(b.left,b.top), worldToScreen(b.right,b.top),
      worldToScreen(b.right,b.bottom), worldToScreen(b.left,b.bottom),
    ];
  }

  function fillPolygon(pts,fill,stroke=null,width=1) {
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }

  const previousDrawProps=drawProps;
  drawProps=function(g){
    previousDrawProps(g);
    if(g.env.propMode!=='city'||!g.road.cityBlocks) return;

    for(const b of g.road.cityBlocks){
      if(b.bottom<g.player.y-1400||b.top>g.player.y+1400) continue;
      if(b.type==='buildings') continue;
      const pts=polygonForBlock(b);
      ctx.save();
      if(b.type==='park'){
        fillPolygon(pts,'rgba(17,38,31,.78)','rgba(103,151,123,.22)',2);
        for(let i=0;i<5;i++){
          const tx=lerp(b.left+35,b.right-35,hash(b.seed*19+i));
          const ty=lerp(b.top+45,b.bottom-45,hash(b.seed*23+i+7));
          const s=worldToScreen(tx,ty);
          ctx.fillStyle='rgba(38,73,55,.95)';ctx.beginPath();ctx.arc(s.x,s.y,10+hash(i+b.seed)*7,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(110,155,112,.55)';ctx.beginPath();ctx.arc(s.x-3,s.y-3,4,0,Math.PI*2);ctx.fill();
        }
      } else if(b.type==='parking'){
        fillPolygon(pts,'rgba(27,34,39,.88)','rgba(164,176,182,.22)',2);
        const a=worldToScreen((b.left+b.right)/2,(b.top+b.bottom)/2);
        const rot=window.viewRotation?window.viewRotation():0;
        ctx.translate(a.x,a.y);ctx.rotate(rot);
        const w=b.right-b.left,h=b.bottom-b.top;
        ctx.strokeStyle='rgba(210,218,221,.35)';ctx.lineWidth=1.4;
        for(let x=-w*.34;x<=w*.34;x+=34){ctx.beginPath();ctx.moveTo(x,-h*.30);ctx.lineTo(x+12,-h*.17);ctx.stroke();}
        ctx.font='800 22px system-ui,sans-serif';ctx.textAlign='center';ctx.fillStyle='rgba(130,213,255,.48)';ctx.fillText('P',0,8);
      }
      ctx.restore();
    }
  };

  function drawCrosswalk(node) {
    const s=worldToScreen(node.x,node.y),rot=window.viewRotation?window.viewRotation():0;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(rot);
    ctx.fillStyle='rgba(235,239,240,.52)';
    for(let i=-3;i<=3;i++){
      ctx.fillRect(i*10-3,-34,6,16);
      ctx.fillRect(i*10-3,18,6,16);
    }
    ctx.restore();
  }

  function drawRoundaboutIsland(rb) {
    const s=worldToScreen(rb.x,rb.y);
    ctx.save();
    ctx.fillStyle='rgba(12,26,22,.98)';ctx.strokeStyle='rgba(214,220,220,.72)';ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(s.x,s.y,rb.island,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,202,76,.58)';ctx.lineWidth=2;ctx.setLineDash([7,7]);
    ctx.beginPath();ctx.arc(s.x,s.y,rb.island+8,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(48,92,63,.94)';ctx.beginPath();ctx.arc(s.x,s.y,rb.island-7,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  const previousDrawRoads=drawRoads;
  drawRoads=function(g){
    previousDrawRoads(g);
    if(g.env.propMode!=='city') return;
    for(const n of g.road.trafficLights||[]) {
      if(Math.abs(n.y-g.player.y)<1200) drawCrosswalk(n);
    }
    for(const rb of g.road.roundabouts||[]) {
      if(Math.abs(rb.y-g.player.y)<1300) drawRoundaboutIsland(rb);
    }
  };
})();
