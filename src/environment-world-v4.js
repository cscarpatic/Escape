(() => {
  const baseDrawProps=drawProps;

  function screenPoly(poly){return poly.map(p=>worldToScreen(p.x,p.y));}
  function polygon(points,fill,stroke='rgba(255,255,255,.08)',lineWidth=1){
    if(!points?.length)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function blockPoly(b){return screenPoly([{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.right,y:b.bottom},{x:b.left,y:b.bottom}]);}

  function palettes(mode,day){
    if(mode==='industrial')return day?{base:'#9da49f',edge:'#66706e',warehouse:'#737c7c',container:['#a95345','#4f7182','#807348','#63725e'],yard:'#858d8b'}:{base:'#101719',edge:'#39474a',warehouse:'#242f32',container:['#69382f','#294553','#514827','#35483e'],yard:'#1a2325'};
    if(mode==='alpine')return day?{base:'#7f927d',edge:'#637164',rock:'#777a72',forest:'#49674a',hut:'#8a755f'}:{base:'#0c130f',edge:'#263329',rock:'#30342f',forest:'#14261a',hut:'#3b3028'};
    return day?{base:'#c39a70',edge:'#9a7454',mesa:'#9d6243',building:'#b78e68',station:'#d0b48a'}:{base:'#18100c',edge:'#4c3023',mesa:'#4a261b',building:'#51382b',station:'#604b35'};
  }

  function drawBlockBase(g,b,pal){
    const pts=blockPoly(b),day=window.NightHeistLighting==='day';
    let fill=pal.base;
    if(b.type==='truck-yard'||b.type==='clearing'||b.type==='open-desert'||b.type==='open-route')fill=day?'rgba(180,185,178,.50)':'rgba(25,31,29,.72)';
    polygon(pts,fill,pal.edge,2);
    if(b.diagonal){
      const a=worldToScreen(b.left,b.bottom),z=worldToScreen(b.right,b.top);ctx.save();ctx.strokeStyle=day?'rgba(255,255,255,.28)':'rgba(180,218,224,.12)';ctx.setLineDash([12,14]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();ctx.restore();
    }
  }

  function drawOccluder(g,o,pal,index){
    const pts=screenPoly(o.polygon),day=window.NightHeistLighting==='day';let fill='#333';
    if(o.type==='warehouse')fill=pal.warehouse;
    else if(o.type==='container-stack')fill=pal.container[index%pal.container.length];
    else if(o.type==='dock-office')fill=pal.warehouse;
    else if(o.type==='rock-face')fill=pal.rock;
    else if(o.type==='dense-forest')fill=pal.forest;
    else if(o.type==='mountain-hut')fill=pal.hut;
    else if(o.type==='mesa')fill=pal.mesa;
    else if(o.type==='desert-building')fill=pal.building;
    else if(o.type==='gas-station')fill=pal.station;
    polygon(pts,fill,day?'rgba(45,50,48,.34)':'rgba(210,225,228,.10)',2);

    const c=worldToScreen((o.left+o.right)/2,(o.top+o.bottom)/2),w=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),h=Math.hypot(pts[2].x-pts[1].x,pts[2].y-pts[1].y);
    ctx.save();ctx.translate(c.x,c.y);ctx.rotate(window.viewRotation?window.viewRotation():0);
    if(o.type==='container-stack'){
      ctx.strokeStyle=day?'rgba(255,255,255,.42)':'rgba(255,255,255,.14)';ctx.lineWidth=1;for(let x=-w*.38;x<w*.38;x+=15){ctx.beginPath();ctx.moveTo(x,-h*.34);ctx.lineTo(x,h*.34);ctx.stroke();}
    }else if(o.type==='warehouse'||o.type==='desert-building'||o.type==='dock-office'){
      ctx.strokeStyle=day?'rgba(255,255,255,.38)':'rgba(255,255,255,.10)';ctx.lineWidth=1.5;ctx.strokeRect(-w*.36,-h*.32,w*.72,h*.64);
    }else if(o.type==='dense-forest'){
      ctx.fillStyle=day?'rgba(42,84,46,.72)':'rgba(30,68,37,.78)';for(let i=0;i<6;i++){const x=(hash(o.seed*17+i)-.5)*w*.62,y=(hash(o.seed*23+i)-.5)*h*.58;ctx.beginPath();ctx.arc(x,y,5+hash(o.seed+i)*6,0,Math.PI*2);ctx.fill();}
    }else if(o.type==='rock-face'||o.type==='mesa'){
      ctx.strokeStyle=day?'rgba(255,235,205,.22)':'rgba(255,210,180,.08)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-w*.3,-h*.15);ctx.lineTo(w*.28,h*.18);ctx.stroke();
    }
    ctx.restore();
  }

  drawProps=function(g){
    if(!g||g.env.propMode==='city'||!g.road.environmentBlocks?.length)return baseDrawProps(g);
    const day=window.NightHeistLighting==='day',pal=palettes(g.env.propMode,day);
    for(const b of g.road.environmentBlocks){if(b.bottom<g.player.y-1600||b.top>g.player.y+1600)continue;drawBlockBase(g,b,pal);}
    (g.road.lightOccluders||[]).forEach((o,i)=>{if(o.bottom<g.player.y-1600||o.top>g.player.y+1600)return;drawOccluder(g,o,pal,i);});
  };

  function pointInPoly(x,y,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/((b.y-a.y)||1e-9)+a.x);if(hit)inside=!inside;}return inside;}
  function nearestEdgePoint(x,y,poly){let best=null,bestD=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],vx=b.x-a.x,vy=b.y-a.y,l2=vx*vx+vy*vy||1,t=clamp(((x-a.x)*vx+(y-a.y)*vy)/l2,0,1),qx=a.x+vx*t,qy=a.y+vy*t,d=Math.hypot(x-qx,y-qy);if(d<bestD){bestD=d;best={x:qx,y:qy,d};}}return best;}

  const baseHandle=Game.prototype.handleCollisions;
  Game.prototype.handleCollisions=function(){
    baseHandle.call(this);if(this.env.propMode==='city'||!this.road.lightOccluders?.length)return;
    this._worldBlockCooldown=Math.max(0,(this._worldBlockCooldown||0)-.033);const p=this.player;
    for(const o of this.road.lightOccluders){
      if(p.x<o.left-45||p.x>o.right+45||p.y<o.top-45||p.y>o.bottom+45)continue;
      if(!pointInPoly(p.x,p.y,o.polygon))continue;
      const q=nearestEdgePoint(p.x,p.y,o.polygon);if(!q)continue;
      let dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);if(len<.001){dx=1;dy=0;len=1;}
      const margin=p.width*.72+5;p.x=q.x+dx/len*margin;p.y=q.y+dy/len*margin;p.speed*=.42;this.camera.shake=Math.max(this.camera.shake,9);
      if(this._worldBlockCooldown<=0){audio.hit();this.spawnSparks(q.x,q.y,8);this._worldBlockCooldown=.35;}break;
    }
  };
})();