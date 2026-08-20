(() => {
  const style=document.createElement('style');
  style.textContent=`
    #pauseButton{position:fixed!important;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));top:auto!important;width:auto!important;min-width:92px;height:46px;padding:0 16px;border-radius:14px;z-index:46;background:linear-gradient(180deg,rgba(22,31,40,.94),rgba(7,11,17,.94));border:1px solid rgba(220,242,255,.30);color:#f4fbff;font:800 11px/1 system-ui,sans-serif;letter-spacing:.10em;box-shadow:0 10px 30px rgba(0,0,0,.42),0 0 18px rgba(100,220,255,.08);backdrop-filter:blur(10px)}
    #pauseButton::after{content:'  PAUSA'}
    @media(max-width:760px){#pauseButton{right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));min-width:78px;height:42px;font-size:9px;padding:0 12px}}
  `;
  document.head.appendChild(style);

  function spawnEmergencyCop(g){
    if(!g?.player)return;
    const p=g.player,gap=Math.max(360,g.env.startGap||430);
    const rawX=p.x-Math.cos(p.angle)*gap,rawY=p.y-Math.sin(p.angle)*gap;
    const info=g.road?.nearestInfo?.(rawX,rawY);
    const x=info?.x??rawX,y=info?.y??rawY;
    const angle=Math.atan2(p.y-y,p.x-x);
    const c=new Car(x,y,angle,'cop');
    c.speed=Math.min(168,Math.max(92,p.speed*.78));
    c.flash=performance.now()*.0017;
    c._arrivalLabel='DA DIETRO';
    c._emergencyBackup=true;
    g.cops.push(c);
    g.heat=clamp(Math.max(g.heat,.58),0,1);
    if(typeof toast==='function')toast('RINFORZI IN ARRIVO · RIPARTI!');
    audio.burst?.(360,.05,'square');
  }

  const baseGameUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    if(this.finished)return baseGameUpdate.call(this,dt);
    baseGameUpdate.call(this,dt);
    if(this.finished)return;

    const active=(this.cops||[]).length;
    const pending=(this._pendingCops||[]).length;
    const target=Math.max(1,(this.env.escapeKm||1)*1000);
    const progress=clamp(this.distance/target,0,1);

    if(active===0){
      this.catch=0;
      if(pending>0 && !this._pendingClearAdjusted){
        const elapsed=(performance.now()-this.startedAt)/1000;
        for(const reinforcement of this._pendingCops) reinforcement.delay=Math.min(reinforcement.delay,elapsed+6.5);
        this._pendingClearAdjusted=true;
      }
      if(pending===0 && progress>=.50){
        this.end(true);
        if(ui.resultCopy)ui.resultCopy.textContent='Hai superato metà fuga ed eliminato tutte le pattuglie. Nessun rinforzo rimasto: via libera.';
        return;
      }
      if(pending===0 && progress<.50){
        this._policeClearTimer=(this._policeClearTimer||0)+Math.min(dt,.033);
        if(this._policeClearTimer>=6.5){
          this._policeClearTimer=0;
          spawnEmergencyCop(this);
        }
      }else{
        this._policeClearTimer=0;
      }
    }else{
      this._policeClearTimer=0;
      this._pendingClearAdjusted=false;
    }
  };

  function samePoint(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<3;}
  function tangent(path,atStart){
    const pts=path.points;if(!pts||pts.length<2)return{x:0,y:-1};
    const a=atStart?pts[0]:pts[pts.length-2],b=atStart?pts[1]:pts[pts.length-1],l=Math.hypot(b.x-a.x,b.y-a.y)||1;
    return{x:(b.x-a.x)/l,y:(b.y-a.y)/l};
  }
  function chooseContinuation(car,endPoint,heading){
    const road=game?.road;if(!road)return null;
    const candidates=(road.paths||[]).filter(p=>p!==car.path&&p.points?.length>1&&(samePoint(p.points[0],endPoint)||samePoint(p.points[p.points.length-1],endPoint)));
    let best=null,bestScore=-Infinity;
    for(const p of candidates){
      const atStart=samePoint(p.points[0],endPoint),t=tangent(p,atStart),dir=atStart?1:-1;
      const score=t.x*heading.x*dir+t.y*heading.y*dir+(p.kind==='highway'?.12:p.kind==='state'?.06:0)+Math.random()*.08;
      if(score>bestScore){bestScore=score;best={path:p,direction:dir,t:dir>0?.015:.985};}
    }
    return best;
  }

  TrafficCar.prototype.update=function(dt){
    if(!this.path?.points?.length)return;
    if(!this._speedBoosted){this.baseSpeed*=1.24;this._speedBoosted=true;}
    const delta=(this.baseSpeed*dt/Math.max(1,this.path.length))*this.direction;
    let nextT=this.t+delta;
    if(nextT>1||nextT<0){
      const pts=this.path.points,endPoint=nextT>1?pts[pts.length-1]:pts[0];
      const curTan=tangent(this.path,nextT<0),heading={x:curTan.x*this.direction,y:curTan.y*this.direction};
      const next=chooseContinuation(this,endPoint,heading);
      if(next){this.path=next.path;this.direction=next.direction;this.t=next.t;}
      else{this.direction*=-1;this.t=nextT>1?.985:.015;}
    }else this.t=nextT;
    const center=samplePath(this.path,this.t),travel=center.angle+(this.direction<0?Math.PI:0);
    this._laneHeading ??= travel;this._laneHeading=angleLerp(this._laneHeading,travel,clamp(dt*14,0,.32));
    let offset=clamp((this.path.width||150)*.245,30,58);if(this.path.kind==='highway')offset=clamp((this.path.width||150)*.255,42,62);
    const rx=-Math.sin(this._laneHeading),ry=Math.cos(this._laneHeading);
    this.x=center.x+rx*offset;this.y=center.y+ry*offset;this.angle=this._laneHeading;this.speed=this.baseSpeed*this.direction;this.laneOffset=offset;
  };

  const baseCopUpdate=Game.prototype.updateCops;
  Game.prototype.updateCops=function(dt){
    baseCopUpdate.call(this,dt);
    for(const c of this.cops||[]){
      if(!c._finalSpeedBoost){c._finalSpeedBoost=true;c.speed*=1.08;}
      if(c.speed>0)c.speed=Math.min(c.speed*1.002,208);
    }
  };
})();
