(() => {
  const style=document.createElement('style');
  style.textContent=`
    #pauseButton{position:fixed!important;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));top:auto!important;width:auto!important;min-width:92px;height:46px;padding:0 16px;border-radius:14px;z-index:46;background:linear-gradient(180deg,rgba(22,31,40,.94),rgba(7,11,17,.94));border:1px solid rgba(220,242,255,.30);color:#f4fbff;font:800 11px/1 system-ui,sans-serif;letter-spacing:.10em;box-shadow:0 10px 30px rgba(0,0,0,.42),0 0 18px rgba(100,220,255,.08);backdrop-filter:blur(10px)}
    #pauseButton::after{content:'  PAUSA'}
    .touch-control--brake,.touch-control--handbrake{display:none!important}
    .touch-zone--center{display:none!important}
    @media(max-width:760px){#pauseButton{right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));min-width:78px;height:42px;font-size:9px;padding:0 12px}}
  `;document.head.appendChild(style);
  document.querySelector('.touch-control--brake')?.remove();
  document.querySelector('.touch-control--handbrake')?.remove();

  const baseGameUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    if(this.finished)return baseGameUpdate.call(this,dt);
    const before=this.camera.shake||0;
    baseGameUpdate.call(this,dt);
    const after=Math.min(this.camera.shake||0,8);
    if(after>before+.15)this._shakeLife=2;
    this._shakeLife=Math.max(0,(this._shakeLife||0)-dt);
    if(this._shakeLife<=0)this.camera.shake=0;
    else this.camera.shake=Math.min(8,after*Math.pow(.18,dt));
    if(!this.finished&&this.cops&&this.cops.length===0){this.catch=0;this.end(true);if(ui.resultCopy)ui.resultCopy.textContent='Tutte le pattuglie sono state eliminate. Via libera: il bottino è salvo.';}
  };
  const basePlayerUpdate=Game.prototype.updatePlayer;
  Game.prototype.updatePlayer=function(dt){basePlayerUpdate.call(this,dt);const accelerating=keys.has('ArrowUp')||keys.has('KeyW');if(accelerating&&this.player.speed>0)this.player.speed=Math.min(228,this.player.speed+42*dt);if(this.player.speed>182)this.player.speed=Math.min(228,this.player.speed);};
  function samePoint(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<3;}
  function tangent(path,atStart){const pts=path.points;if(!pts||pts.length<2)return{x:0,y:-1};const a=atStart?pts[0]:pts[pts.length-2],b=atStart?pts[1]:pts[pts.length-1],l=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/l,y:(b.y-a.y)/l};}
  function chooseContinuation(car,endPoint,heading){const road=game?.road;if(!road)return null;const candidates=(road.paths||[]).filter(p=>p!==car.path&&p.points?.length>1&&(samePoint(p.points[0],endPoint)||samePoint(p.points[p.points.length-1],endPoint)));let best=null,bestScore=-Infinity;for(const p of candidates){const atStart=samePoint(p.points[0],endPoint),t=tangent(p,atStart),dir=atStart?1:-1;const score=t.x*heading.x*dir+t.y*heading.y*dir+(p.kind==='highway'?.12:p.kind==='state'?.06:0)+Math.random()*.08;if(score>bestScore){bestScore=score;best={path:p,direction:dir,t:dir>0?.015:.985};}}return best;}
  TrafficCar.prototype.update=function(dt){if(!this.path?.points?.length)return;if(!this._speedBoosted){this.baseSpeed*=1.24;this._speedBoosted=true;}const delta=(this.baseSpeed*dt/Math.max(1,this.path.length))*this.direction;let nextT=this.t+delta;if(nextT>1||nextT<0){const pts=this.path.points,endPoint=nextT>1?pts[pts.length-1]:pts[0];const curTan=tangent(this.path,nextT<0),heading={x:curTan.x*this.direction,y:curTan.y*this.direction};const next=chooseContinuation(this,endPoint,heading);if(next){this.path=next.path;this.direction=next.direction;this.t=next.t;}else{this.direction*=-1;this.t=nextT>1?.985:.015;}}else this.t=nextT;const center=samplePath(this.path,this.t),travel=center.angle+(this.direction<0?Math.PI:0);this._laneHeading??=travel;this._laneHeading=angleLerp(this._laneHeading,travel,clamp(dt*14,0,.32));let offset=clamp((this.path.width||150)*.245,30,58);if(this.path.kind==='highway')offset=clamp((this.path.width||150)*.255,42,62);const rx=-Math.sin(this._laneHeading),ry=Math.cos(this._laneHeading);this.x=center.x+rx*offset;this.y=center.y+ry*offset;this.angle=this._laneHeading;this.speed=this.baseSpeed*this.direction;this.laneOffset=offset;};
  const baseCopUpdate=Game.prototype.updateCops;
  Game.prototype.updateCops=function(dt){baseCopUpdate.call(this,dt);for(const c of this.cops||[]){if(!c._finalSpeedBoost){c._finalSpeedBoost=true;c.speed*=1.08;}if(c.speed>0)c.speed=Math.min(c.speed*1.002,208);}};
})();