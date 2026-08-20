(() => {
  const style=document.createElement('style');
  style.textContent=`
    #junctionHint{display:none!important}
    .hud-center{background:transparent!important;border:0!important;box-shadow:none!important;backdrop-filter:none!important}
    .hud-center .objective-label{opacity:.72}
  `;
  document.head.appendChild(style);

  function labelFor(path){
    const t=path?.trafficTrait||path?.trait||'clear';
    const text=String(t).toLowerCase();
    if(text.includes('slow'))return 'TRAFFICO';
    if(text.includes('tight'))return 'CURVE';
    if(text.includes('oncoming'))return 'CONTROMANO';
    if(path?.kind==='highway')return 'AUTOSTRADA';
    if(path?.kind==='state')return 'STATALE';
    return 'LIBERA';
  }

  function upcoming(g){
    const stages=g.road?.stages||[];
    let best=null,bestD=Infinity;
    for(const s of stages){
      const d=Math.abs(g.player.y-s.startY);
      if(d<bestD&&d<520){best=s;bestD=d;}
    }
    if(!best||best.index<=0)return null;
    return {stage:best,d:bestD};
  }

  function arrow(x,y,dir,label,meters,accent){
    const bob=Math.sin(performance.now()*.006+(dir<0?0:1.3))*3.5;
    ctx.save();ctx.translate(x,y+bob);ctx.globalCompositeOperation='screen';
    const pulse=.70+.30*Math.sin(performance.now()*.008+(dir<0?0:1.8));
    ctx.shadowBlur=14;ctx.shadowColor=accent;
    ctx.fillStyle=`rgba(205,238,255,${.74+.18*pulse})`;
    ctx.beginPath();
    if(dir<0){ctx.moveTo(-20,0);ctx.lineTo(-3,-12);ctx.lineTo(-3,-5);ctx.lineTo(16,-5);ctx.lineTo(16,5);ctx.lineTo(-3,5);ctx.lineTo(-3,12);}else{ctx.moveTo(20,0);ctx.lineTo(3,-12);ctx.lineTo(3,-5);ctx.lineTo(-16,-5);ctx.lineTo(-16,5);ctx.lineTo(3,5);ctx.lineTo(3,12);}
    ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.textAlign='center';ctx.fillStyle='rgba(236,248,255,.96)';ctx.font='800 10px system-ui';ctx.fillText(label,0,25);ctx.fillStyle='rgba(179,214,230,.88)';ctx.font='700 9px system-ui';ctx.fillText(`${meters} m`,0,37);ctx.restore();
  }

  function drawHints(g){
    if(state!=='playing')return;
    const u=upcoming(g);if(!u)return;
    const meters=Math.max(0,Math.round(u.d*.78));
    if(meters>340)return;
    const fade=1-clamp((meters-250)/90,0,1);
    if(fade<=0)return;
    ctx.save();ctx.globalAlpha=.45+.55*fade;
    const y=H*.43;
    arrow(Math.max(72,W*.15),y,-1,labelFor(u.stage.left),meters,'rgba(99,188,255,.85)');
    arrow(Math.min(W-72,W*.85),y,1,labelFor(u.stage.right),meters,'rgba(170,135,255,.85)');
    ctx.restore();
  }

  const baseRender=render;
  render=function(){baseRender();if(game)drawHints(game);};
})();