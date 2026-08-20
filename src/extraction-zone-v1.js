(() => {
  const baseEnd=Game.prototype.end;
  const baseUpdate=Game.prototype.update;

  function ensureExtraction(g){
    if(g._extraction)return g._extraction;
    const stages=g.road?.stages||[];
    const last=stages[stages.length-1];
    let path=last?.left||last?.right||g.road?.paths?.[g.road.paths.length-1];
    if(!path?.points?.length)return null;
    // Put the escape point near the far end of the final road, not exactly on the map boundary.
    const q=samplePath(path,.82);
    g._extraction={x:q.x,y:q.y,angle:q.angle,radius:58,reached:false,pulse:0};
    return g._extraction;
  }

  // Any legacy "win by distance" or "win because no cops remain" is ignored.
  // A loss still ends immediately. A win is valid only after physically entering extraction.
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
      this.camera.shake=Math.min(5,Math.max(this.camera.shake||0,4));
      toast('PUNTO DI ESTRAZIONE RAGGIUNTO');
      baseEnd.call(this,true);
      if(ui.resultCopy)ui.resultCopy.textContent='Hai raggiunto il punto di estrazione. Le pattuglie hanno perso il contatto: fuga completata.';
      return;
    }
    if(ui.objective){
      const meters=Math.max(0,Math.round(d*.78));
      ui.objective.textContent=`ESTRAZIONE · ${meters} m`;
    }
  };

  function drawExtraction(g){
    const e=ensureExtraction(g);if(!e||e.reached||state==='menu')return;
    const s=worldToScreen(e.x,e.y),t=performance.now()*.004;
    const onScreen=s.x>-120&&s.x<W+120&&s.y>-120&&s.y<H+120;
    if(onScreen){
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(e.angle):e.angle+Math.PI/2);ctx.globalCompositeOperation='screen';
      const pulse=.72+.28*Math.sin(t);
      ctx.shadowBlur=28;ctx.shadowColor='#49ffd0';ctx.strokeStyle=`rgba(73,255,208,${.72+.18*pulse})`;ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(-58,0);ctx.lineTo(58,0);ctx.stroke();
      ctx.shadowBlur=14;ctx.lineWidth=2;ctx.strokeStyle='rgba(235,255,248,.95)';
      for(let x=-50;x<=50;x+=20){ctx.beginPath();ctx.moveTo(x,-13);ctx.lineTo(x,13);ctx.stroke();}
      ctx.rotate(-(window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(e.angle):e.angle+Math.PI/2));
      ctx.font='800 11px system-ui';ctx.textAlign='center';ctx.fillStyle='#dffff5';ctx.shadowBlur=12;ctx.shadowColor='#49ffd0';ctx.fillText('ESTRAZIONE',0,-28);ctx.restore();
    } else {
      // Edge indicator points toward the extraction zone when it is outside the viewport.
      const cx=W/2,cy=H/2,dx=s.x-cx,dy=s.y-cy,a=Math.atan2(dy,dx),margin=54;
      const scale=Math.min((W/2-margin)/Math.max(1,Math.abs(dx)),(H/2-margin)/Math.max(1,Math.abs(dy)));
      const x=cx+dx*scale,y=cy+dy*scale;
      ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalCompositeOperation='screen';ctx.fillStyle='#66ffd8';ctx.shadowBlur=16;ctx.shadowColor='#49ffd0';ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(-10,-9);ctx.lineTo(-6,0);ctx.lineTo(-10,9);ctx.closePath();ctx.fill();ctx.restore();
    }
  }

  const baseRender=render;
  render=function(){baseRender();if(game&&state!=='menu')drawExtraction(game);};
})();