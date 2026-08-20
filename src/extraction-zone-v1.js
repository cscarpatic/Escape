(() => {
  const baseEnd=Game.prototype.end;
  const baseUpdate=Game.prototype.update;

  function ensureExtraction(g){
    if(g._extraction)return g._extraction;
    const stages=g.road?.stages||[];
    const last=stages[stages.length-1];
    let path=last?.left||last?.right||g.road?.paths?.[g.road.paths.length-1];
    if(!path?.points?.length)return null;
    const q=samplePath(path,.82);
    g._extraction={x:q.x,y:q.y,angle:q.angle,radius:58,reached:false,pulse:0};
    return g._extraction;
  }

  Game.prototype.end=function(win){
    if(win&&!this._extractionReached)return;
    baseEnd.call(this,win);
    if(win&&ui.resultCopy)ui.resultCopy.textContent='Hai raggiunto il punto di estrazione. Le pattuglie hanno perso il contatto: fuga completata.';
  };

  Game.prototype.update=function(dt){
    baseUpdate.call(this,dt);
    if(this.finished||state!=='playing')return;
    const e=ensureExtraction(this);if(!e)return;
    e.pulse=(e.pulse+dt)%1;
    const d=Math.hypot(this.player.x-e.x,this.player.y-e.y);
    if(d<=e.radius){
      e.reached=true;this._extractionReached=true;
      this.camera.shake=Math.min(4,Math.max(this.camera.shake||0,3));
      toast('PUNTO DI ESTRAZIONE RAGGIUNTO');
      baseEnd.call(this,true);
      if(ui.resultCopy)ui.resultCopy.textContent='Hai raggiunto il punto di estrazione. Le pattuglie hanno perso il contatto: fuga completata.';
      return;
    }
    // Keep the central HUD clean: distance guidance is rendered by floating arrows.
    if(ui.objective)ui.objective.textContent='RAGGIUNGI L’USCITA';
  };

  function drawFloatingArrow(x,y,angle,meters,near=false){
    const bob=Math.sin(performance.now()*.005)*4;
    ctx.save();ctx.translate(x,y+bob);ctx.rotate(angle);ctx.globalCompositeOperation='screen';
    const pulse=.72+.28*Math.sin(performance.now()*.007);
    ctx.shadowColor='#6ef0ff';ctx.shadowBlur=near?22:15;
    ctx.fillStyle=`rgba(96,232,255,${.72+.22*pulse})`;
    ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-7,-10);ctx.lineTo(-3,-3);ctx.lineTo(-18,-3);ctx.lineTo(-18,3);ctx.lineTo(-3,3);ctx.lineTo(-7,10);ctx.closePath();ctx.fill();
    ctx.rotate(-angle);ctx.shadowBlur=10;ctx.textAlign='center';ctx.font='800 10px system-ui';ctx.fillStyle='rgba(226,252,255,.96)';ctx.fillText(`${meters} m`,0,near?28:25);ctx.font='700 8px system-ui';ctx.fillStyle='rgba(176,239,248,.80)';ctx.fillText('USCITA',0,near?39:36);ctx.restore();
  }

  function drawExtractionGate(s,e){
    const t=performance.now()*.004;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(e.angle):e.angle+Math.PI/2);ctx.globalCompositeOperation='screen';
    const pulse=.72+.28*Math.sin(t);
    ctx.shadowBlur=36;ctx.shadowColor='#49ffd0';ctx.strokeStyle=`rgba(73,255,208,${.74+.2*pulse})`;ctx.lineWidth=8;
    ctx.beginPath();ctx.moveTo(-76,0);ctx.lineTo(76,0);ctx.stroke();
    ctx.shadowBlur=15;ctx.lineWidth=2.5;ctx.strokeStyle='rgba(235,255,248,.98)';
    for(let x=-64;x<=64;x+=16){ctx.beginPath();ctx.moveTo(x,-18);ctx.lineTo(x,18);ctx.stroke();}
    ctx.restore();
  }

  function drawExtraction(g){
    const e=ensureExtraction(g);if(!e||e.reached||state==='menu')return;
    const s=worldToScreen(e.x,e.y);
    const d=Math.hypot(g.player.x-e.x,g.player.y-e.y),meters=Math.max(0,Math.round(d*.78));
    const onScreen=s.x>70&&s.x<W-70&&s.y>70&&s.y<H-70;

    if(onScreen){
      drawExtractionGate(s,e);
      const ps=worldToScreen(g.player.x,g.player.y),a=Math.atan2(s.y-ps.y,s.x-ps.x);
      const mx=lerp(ps.x,s.x,.58),my=lerp(ps.y,s.y,.58);
      drawFloatingArrow(mx,my,a,meters,true);
      return;
    }

    const cx=W/2,cy=H*.52,dx=s.x-cx,dy=s.y-cy,a=Math.atan2(dy,dx),marginX=58,marginY=74;
    const sx=(W/2-marginX)/Math.max(1,Math.abs(dx)),sy=(H/2-marginY)/Math.max(1,Math.abs(dy));
    const scale=Math.min(sx,sy),x=cx+dx*scale,y=cy+dy*scale;
    drawFloatingArrow(x,y,a,meters,false);
  }

  const baseRender=render;
  render=function(){baseRender();if(game&&state!=='menu')drawExtraction(game);};
})();