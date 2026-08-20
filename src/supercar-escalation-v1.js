(() => {
  const clamp01=v=>Math.max(0,Math.min(1,v));
  function makeCop(g,armored=false,boost=0){
    const p=g.player,side=(Math.random()<.5?-1:1),back=260+Math.random()*260;
    const c=new Car(p.x+side*(70+Math.random()*130),p.y+back,-Math.PI/2,'cop');
    c.speed=142+boost+Math.random()*18;c.flash=Math.random()*8;
    if(armored){c._armoredVan=true;c.width=38;c.length=70;c._missileHP=2;c.speed*=.94;}
    g.cops.push(c);return c;
  }
  function addRoadblock(g,stageIndex){
    const api=window.NightHeistRoadblocks;if(!api?.roadblocks)return;
    const stages=g.road?.stages||[],s=stages[stageIndex];if(!s)return;
    const p=(Math.random()<.5?s.left:s.right)||s.left||s.right;if(!p?.points?.length)return;
    const q=samplePath(p,.48+.12*Math.random()),a=q.angle,nx=-Math.sin(a),ny=Math.cos(a);
    api.roadblocks.push({x:q.x,y:q.y,angle:a,barriers:[-38,0,38].map(o=>({x:q.x+nx*o,y:q.y+ny*o,hp:2,maxHp:2}))});
  }
  const baseUpdatePlayer=Game.prototype.updatePlayer;
  Game.prototype.updatePlayer=function(dt){
    baseUpdatePlayer.call(this,dt);
    const p=this.player,accelerating=keys.has('ArrowUp')||keys.has('KeyW')||(window.NightDriveInput?.throttle||0)>.08;
    if(accelerating&&p.speed>0)p.speed=Math.min(268,p.speed+58*dt);
    if(p.speed>228)p.speed=Math.min(268,p.speed);
  };
  const baseUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    baseUpdate.call(this,dt);if(this.finished||state!=='playing')return;
    this._escalation ||= {tier:-1};
    const goal=Math.max(1,(this.env.escapeKm||8)*1000),progress=clamp01((this.distance||0)/goal);
    const tier=Math.min(4,Math.floor(progress*5));
    if(tier>this._escalation.tier){
      for(let t=this._escalation.tier+1;t<=tier;t++){
        const normal=1+(t>=2?1:0),armored=t>=1?1:0;
        for(let i=0;i<normal;i++)makeCop(this,false,t*5);
        for(let i=0;i<armored;i++)makeCop(this,true,t*4);
        const stages=this.road?.stages||[];if(stages.length)addRoadblock(this,Math.min(stages.length-2,2+t*3));
        if(t>0)toast(`PRESSIONE POLIZIA +${normal+armored}`);
      }
      this._escalation.tier=tier;
    }
    const desired=3+Math.round(progress*5);
    while(this.cops.length<desired&&this.cops.length<9)makeCop(this,this.cops.length%3===2,progress*18);
  };

  function supercarAngle(p){return window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(p.angle):p.angle+Math.PI/2;}
  function drawWheel(x,y,w=5,h=13){ctx.fillStyle='#030609';ctx.fillRect(x-w/2,y-h/2,w,h);ctx.fillStyle='#283038';ctx.fillRect(x-w/2+1,y-h/2+2,w-2,h-4);}
  function drawSupercar(g){
    const p=g.player,s=worldToScreen(p.x,p.y);if(s.x<-120||s.x>W+120||s.y<-120||s.y>H+120)return;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(supercarAngle(p));ctx.globalCompositeOperation='source-over';

    // Long, low supercar proportions: visibly longer than wide, with a pointed nose and broad tail.
    ctx.fillStyle='rgba(0,0,0,.48)';ctx.beginPath();ctx.ellipse(3,7,22,43,0,0,Math.PI*2);ctx.fill();
    drawWheel(-22,-22);drawWheel(22,-22);drawWheel(-23,24);drawWheel(23,24);

    const body=ctx.createLinearGradient(-24,-46,24,42);body.addColorStop(0,'#20e3f2');body.addColorStop(.34,'#0aa8c2');body.addColorStop(.68,'#08708f');body.addColorStop(1,'#06344d');ctx.fillStyle=body;
    ctx.beginPath();
    ctx.moveTo(0,-48);
    ctx.lineTo(-10,-43);ctx.lineTo(-18,-33);ctx.lineTo(-21,-15);
    ctx.lineTo(-24,-3);ctx.lineTo(-25,18);ctx.lineTo(-22,34);
    ctx.lineTo(-16,41);ctx.lineTo(0,44);
    ctx.lineTo(16,41);ctx.lineTo(22,34);ctx.lineTo(25,18);
    ctx.lineTo(24,-3);ctx.lineTo(21,-15);ctx.lineTo(18,-33);ctx.lineTo(10,-43);
    ctx.closePath();ctx.fill();

    // Carbon splitter and sharp nose details.
    ctx.fillStyle='#02070a';ctx.beginPath();ctx.moveTo(0,-50);ctx.lineTo(-20,-43);ctx.lineTo(-15,-39);ctx.lineTo(0,-43);ctx.lineTo(15,-39);ctx.lineTo(20,-43);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(185,250,255,.55)';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-17,-32);ctx.lineTo(-8,-39);ctx.lineTo(0,-42);ctx.lineTo(8,-39);ctx.lineTo(17,-32);ctx.stroke();

    // Rear-biased canopy, much smaller than the body so the silhouette reads as a supercar.
    const glass=ctx.createLinearGradient(0,-18,0,18);glass.addColorStop(0,'#0b2630');glass.addColorStop(1,'#02090d');ctx.fillStyle=glass;
    ctx.beginPath();ctx.moveTo(-12,-17);ctx.lineTo(-8,-27);ctx.lineTo(8,-27);ctx.lineTo(13,-16);ctx.lineTo(11,9);ctx.lineTo(7,17);ctx.lineTo(-7,17);ctx.lineTo(-11,9);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(93,214,230,.32)';ctx.lineWidth=1;ctx.stroke();

    // Sculpted doors and deep side intakes.
    ctx.strokeStyle='rgba(150,246,255,.42)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-18,-8);ctx.lineTo(-15,18);ctx.lineTo(-9,27);ctx.moveTo(18,-8);ctx.lineTo(15,18);ctx.lineTo(9,27);ctx.stroke();
    ctx.fillStyle='#011016';ctx.beginPath();ctx.moveTo(-22,4);ctx.lineTo(-14,8);ctx.lineTo(-13,22);ctx.lineTo(-20,27);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(22,4);ctx.lineTo(14,8);ctx.lineTo(13,22);ctx.lineTo(20,27);ctx.closePath();ctx.fill();

    // Rear engine cover and vents.
    ctx.fillStyle='#07141b';ctx.fillRect(-12,20,24,13);ctx.strokeStyle='rgba(180,238,245,.3)';ctx.lineWidth=1;for(let y=22;y<32;y+=3){ctx.beginPath();ctx.moveTo(-10,y);ctx.lineTo(10,y);ctx.stroke();}

    // Wide carbon diffuser and detached rear wing.
    ctx.fillStyle='#020507';ctx.beginPath();ctx.moveTo(-21,34);ctx.lineTo(-18,43);ctx.lineTo(18,43);ctx.lineTo(21,34);ctx.lineTo(12,38);ctx.lineTo(-12,38);ctx.closePath();ctx.fill();
    ctx.fillRect(-29,38,58,4);ctx.fillRect(-22,35,3,6);ctx.fillRect(19,35,3,6);

    // Angular front light signatures.
    ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='#eaffff';ctx.shadowColor='#b7fbff';ctx.shadowBlur=14;ctx.lineWidth=2.7;
    ctx.beginPath();ctx.moveTo(-16,-39);ctx.lineTo(-9,-43);ctx.lineTo(-4,-42);ctx.stroke();ctx.beginPath();ctx.moveTo(16,-39);ctx.lineTo(9,-43);ctx.lineTo(4,-42);ctx.stroke();

    // Thin, wide rear lamps.
    ctx.strokeStyle='#ff304f';ctx.shadowColor='#ff304f';ctx.shadowBlur=15;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-17,35);ctx.lineTo(-5,38);ctx.stroke();ctx.beginPath();ctx.moveTo(17,35);ctx.lineTo(5,38);ctx.stroke();ctx.restore();

    // Central spine / highlight makes the long wedge shape clearer.
    ctx.strokeStyle='rgba(220,255,255,.24)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-42);ctx.lineTo(0,35);ctx.stroke();
    ctx.restore();
  }

  // Replace the stock player renderer instead of drawing a second car on top of it.
  drawPlayer=function(g){drawSupercar(g);};
})();