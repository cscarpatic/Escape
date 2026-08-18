(()=>{
  const old=drawRoads;
  function pts(p){return p.points.map(q=>worldToScreen(q.x,q.y))}
  function stroke(a,c,w,dash=null,alpha=1){
    if(!a.length)return;ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='butt';ctx.lineJoin='round';ctx.strokeStyle=c;ctx.lineWidth=w;
    if(dash)ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(a[0].x,a[0].y);for(let i=1;i<a.length;i++)ctx.lineTo(a[i].x,a[i].y);ctx.stroke();ctx.restore();
  }
  function signalState(n){const m=/^C(\d+)_(\d+)$/.exec(n?.id||'');const r=m?+m[1]:0,c=m?+m[2]:0,p=(performance.now()/1000+(r+c)*.63)%6;return p<2.7?'green':p<3.2?'amber':'red'}
  function junctionDetails(g){
    for(const n of g.road.trafficLights||[]){
      if(Math.abs(n.y-g.player.y)>1250)continue;const s=worldToScreen(n.x,n.y),rot=window.viewRotation?window.viewRotation():0;
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(rot);ctx.fillStyle='rgba(245,247,244,.76)';for(let i=-3;i<=3;i++){ctx.fillRect(i*10-3,-38,6,15);ctx.fillRect(i*10-3,23,6,15)}ctx.restore();
      const st=signalState(n),col=st==='green'?'#35c96f':st==='amber'?'#f0ad31':'#e83d49';ctx.save();ctx.fillStyle='#222b2e';ctx.fillRect(s.x-7,s.y-13,14,26);ctx.fillStyle=col;ctx.shadowBlur=11;ctx.shadowColor=col;ctx.beginPath();ctx.arc(s.x,s.y,4.5,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }
  function drawGround(roads,g){
    for(const x of roads)stroke(x.a,g.env.shoulder,x.p.width+(x.p.kind==='highway'?24:18));
    for(const x of roads)stroke(x.a,g.env.road,x.p.width);
    for(const x of roads)stroke(x.a,window.NightHeistLighting==='day'?'#fff':'rgba(160,190,205,.55)',Math.max(8,x.p.width-18),null,window.NightHeistLighting==='day'?.08:.16);
    for(const x of roads)stroke(x.a,g.env.lane,x.p.kind==='highway'?3:2.4,x.p.kind==='highway'?[38,28]:x.p.feature==='diagonal'?[24,26]:[30,30]);
  }
  function drawSupports(path){
    if(path.feature!=='elevated')return;
    for(let i=2;i<path.points.length-2;i+=5){
      const s=worldToScreen(path.points[i].x,path.points[i].y);
      ctx.save();ctx.fillStyle='rgba(28,34,38,.62)';ctx.strokeStyle='rgba(190,199,203,.42)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x+7,s.y+9,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
    }
  }
  function drawElevated(roads){
    const day=window.NightHeistLighting==='day';
    for(const x of roads){
      drawSupports(x.p);
      const shadow=x.a.map(q=>({x:q.x+8,y:q.y+10}));stroke(shadow,'rgba(0,0,0,.38)',x.p.width+28,null,.72);
    }
    for(const x of roads){
      const edge=day?'#aeb5b8':'#747d83',asphalt=day?'#53636e':'#31404b';
      stroke(x.a,edge,x.p.width+18);stroke(x.a,asphalt,x.p.width);
      stroke(x.a,day?'rgba(255,255,255,.12)':'rgba(173,204,218,.14)',Math.max(8,x.p.width-18));
      stroke(x.a,'#f2f3ed',2.8,[32,26],.90);
      stroke(x.a,day?'rgba(235,239,238,.72)':'rgba(190,207,214,.58)',x.p.width+7,null,.28);
    }
  }
  drawRoads=function(g){
    if(g.env.propMode!=='city')return old(g);
    const all=g.road.nearbyPaths(g.player.y,1700).map(p=>({p,a:pts(p)}));
    const ground=all.filter(x=>(x.p.level||0)===0&&x.p.feature!=='elevated-ramp');
    const fly=all.filter(x=>x.p.feature==='elevated'||x.p.feature==='elevated-ramp');
    drawGround(ground,g);junctionDetails(g);drawElevated(fly);
  };
})();
