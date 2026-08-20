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

  function drawSupercar(g){
    const p=g.player,s=worldToScreen(p.x,p.y);if(s.x<-120||s.x>W+120||s.y<-120||s.y>H+120)return;
    const a=window.viewVehicleScreenAngle?window.viewVehicleScreenAngle(p.angle):p.angle+Math.PI/2;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(a);
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(4,8,23,36,0,0,Math.PI*2);ctx.fill();
    const body=ctx.createLinearGradient(-20,-34,20,34);body.addColorStop(0,'#15d6e7');body.addColorStop(.45,'#087d98');body.addColorStop(1,'#062e42');ctx.fillStyle=body;
    ctx.beginPath();ctx.moveTo(-19,28);ctx.lineTo(-23,8);ctx.lineTo(-21,-20);ctx.quadraticCurveTo(-16,-34,0,-39);ctx.quadraticCurveTo(16,-34,21,-20);ctx.lineTo(23,8);ctx.lineTo(19,28);ctx.quadraticCurveTo(12,35,0,36);ctx.quadraticCurveTo(-12,35,-19,28);ctx.fill();
    ctx.fillStyle='#04131a';ctx.beginPath();ctx.moveTo(-13,-18);ctx.lineTo(-9,-29);ctx.lineTo(9,-29);ctx.lineTo(13,-18);ctx.lineTo(10,-6);ctx.lineTo(-10,-6);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(126,248,255,.22)';ctx.fillRect(-2,-33,4,59);
    ctx.fillStyle='#021017';ctx.fillRect(-18,4,7,15);ctx.fillRect(11,4,7,15);
    ctx.fillStyle='#07141d';ctx.fillRect(-21,26,42,4);ctx.fillRect(-26,22,6,3);ctx.fillRect(20,22,6,3);
    ctx.fillStyle='#dffcff';ctx.shadowBlur=12;ctx.shadowColor='#9ef9ff';ctx.fillRect(-15,-36,9,3);ctx.fillRect(6,-36,9,3);
    ctx.fillStyle='#ff2d45';ctx.shadowColor='#ff2d45';ctx.shadowBlur=14;ctx.fillRect(-15,31,10,3);ctx.fillRect(5,31,10,3);
    ctx.shadowBlur=0;ctx.strokeStyle='rgba(203,252,255,.8)';ctx.lineWidth=1.2;ctx.strokeRect(-17,-1,34,25);
    ctx.restore();
  }
  const baseRender=render;render=function(){baseRender();if(game&&state!=='menu')drawSupercar(game);};
})();