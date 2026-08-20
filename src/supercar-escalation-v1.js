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
  // Grafica del giocatore volutamente non sovrascritta: usa drawPlayer originale di game-5.js.
})();