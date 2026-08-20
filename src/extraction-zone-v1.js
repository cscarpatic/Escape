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

  function drawSideIndicator(side,meters){
    const left=side<0;
    const x=left?28:W-28,y=H*.42;
    ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='screen';
    const pulse=.72+.28*Math.sin(performance.now()*.006);
    ctx.fillStyle=`rgba(82,255,211,${.88+.1*pulse})`;ctx.shadowColor='#49ffd0';ctx.shadowBlur=18;
    ctx.beginPath();
    if(left){ctx.moveTo(-14,0);ctx.lineTo(2,-11);ctx.lineTo(2,-5);ctx.lineTo(14,-5);ctx.lineTo(14,5);ctx.lineTo(2,5);ctx.lineTo(2,11);}else{ctx.moveTo(14,0);ctx.lineTo(-2,-11);ctx.lineTo(-2,-5);ctx.lineTo(-14,-5);ctx.lineTo(-14,5);ctx.lineTo(-2,5);ctx.lineTo(-2,11);}
    ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='rgba(235,255,248,.96)';ctx.font='800 10px system-ui';ctx.textAlign=left?'left':'right';ctx.fillText(`USCITA ${meters} m`,left?20:-20,4);ctx.restore();
  }

  function drawExtraction(g){
    const e=ensureExtraction(g);if(!e||e.reached||state==='menu')return;
    const s=worldToScreen(e.x,e.y),t=performance.now()*.004;
    const d=Math.hypot(g.player.x-e.x,g.player.y-e.y),meters=Math.max(0,Math.round(d*.78));
    const onScreen=s.x>-90&&s.x<W+90&&s.y>-90&&s.y<H+90;
    if(onScreen){
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(e.angle):e.angle+Math.PI/2);ctx.globalCompositeOperation='screen';
      const pulse=.72+.28*Math.sin(t);
      ctx.shadowBlur=34;ctx.shadowColor='#49ffd0';ctx.strokeStyle=`rgba(73,255,208,${.78+.18*pulse})`;ctx.lineWidth=7;
      ctx.beginPath();ctx.moveTo(-72,0);ctx.lineTo(72,0);ctx.stroke();
      ctx.shadowBlur=16;ctx.lineWidth=3;ctx.strokeStyle='rgba(235,255,248,.98)';
      for(let x=-60;x<=60;x+=20){ctx.beginPath();ctx.moveTo(x,-16);ctx.lineTo(x,16);ctx.stroke();}
      ctx.rotate(-(window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(e.angle):e.angle+Math.PI/2));
      ctx.font='900 13px system-ui';ctx.textAlign='center';ctx.fillStyle='#eafff9';ctx.shadowBlur=14;ctx.shadowColor='#49ffd0';ctx.fillText('USCITA / ESTRAZIONE',0,-34);ctx.restore();
    }else{
      const side=s.x<W/2?-1:1;
      drawSideIndicator(side,meters);
    }
  }

  const baseRender=render;
  render=function(){baseRender();if(game&&state!=='menu')drawExtraction(game);};
})();