(() => {
  const input=window.NightDriveInput=window.NightDriveInput||{};
  const baseUpdatePlayer=Game.prototype.updatePlayer;
  const baseUpdateCops=Game.prototype.updateCops;

  function pathProgress(path,x,y){
    if(!path?.points?.length)return 0;
    let bestD=Infinity,best=0,total=0,lengths=[];
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],len=Math.hypot(b.x-a.x,b.y-a.y);lengths.push(len);total+=len;
    }
    let before=0;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy||1;
      const t=clamp(((x-a.x)*vx+(y-a.y)*vy)/len2,0,1),px=a.x+vx*t,py=a.y+vy*t,d=Math.hypot(x-px,y-py);
      if(d<bestD){bestD=d;best=(before+lengths[i-1]*t)/Math.max(1,total);}before+=lengths[i-1];
    }
    return best;
  }

  Game.prototype.updatePlayer=function(dt){
    const p=this.player;
    p._roadLevel ??= 0;
    if(this.road) this.road._preferredLevel=p._roadLevel;
    const previousLevel=p._roadLevel;

    baseUpdatePlayer.call(this,dt);

    if(this.env.propMode==='city'&&this.road?.nearestInfoAny){
      const any=this.road.nearestInfoAny(p.x,p.y);
      const path=any?.path;
      if(path&&any.d<(path.width||150)*.70){
        if(path.feature==='elevated') p._roadLevel=1;
        else if(path.feature==='elevated-ramp'){
          const progress=pathProgress(path,p.x,p.y);
          if(path.rampDirection==='up'&&progress>.16)p._roadLevel=1;
          if(path.rampDirection==='down'&&progress>.68)p._roadLevel=0;
        } else if(p._roadLevel===1){
          const elevatedNear=(this.road.paths||[]).some(q=>(q.level||0)===1&&q.points?.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<190));
          if(!elevatedNear&&any.d<70)p._roadLevel=0;
        }
      }

      if(p._roadLevel===1&&p.speed>0){
        const throttle=clamp(input.throttle||0,0,1);
        if(throttle>.03)p.speed=Math.min(218,p.speed+34*throttle*dt);
      }
      this.road._preferredLevel=p._roadLevel;
    }

    if(previousLevel!==p._roadLevel&&typeof toast==='function'){
      if(p._roadLevel===1)toast('SOPRAELEVATA · VIA RAPIDA');
      else toast('RITORNO ALLA VIABILITÀ URBANA');
    }
  };

  Game.prototype.updateCops=function(dt){
    if(this.env.propMode!=='city'||!this.road){baseUpdateCops.call(this,dt);return;}
    const playerLevel=this.player?._roadLevel||0;
    this.road._preferredLevel=0;
    for(const c of this.cops)c._roadLevel=0;
    baseUpdateCops.call(this,dt);
    this.road._preferredLevel=playerLevel;
  };
})();
