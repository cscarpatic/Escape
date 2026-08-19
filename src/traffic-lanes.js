(() => {
  const baseTrafficUpdate=TrafficCar.prototype.update;

  function laneOffsetFor(car){
    const width=car.path?.width||150;
    let offset=clamp(width*.245,30,58);
    if(car.path?.kind==='highway')offset=clamp(width*.255,42,62);
    if(car.vehicleKind==='truck'||car.vehicleKind==='garbage')offset=Math.min(offset+2,width*.31);
    return offset;
  }

  TrafficCar.prototype.update=function(dt){
    baseTrafficUpdate.call(this,dt);
    if(!this.path?.points?.length)return;

    const center=samplePath(this.path,this.t);
    const travelAngle=center.angle+(this.direction<0?Math.PI:0);
    this._laneHeading ??= travelAngle;
    this._laneHeading=angleLerp(this._laneHeading,travelAngle,clamp(dt*14,0,.32));

    // Right-hand traffic in screen/world coordinates (Y grows downward on canvas).
    const offset=laneOffsetFor(this);
    const rx=-Math.sin(this._laneHeading),ry=Math.cos(this._laneHeading);
    this.x=center.x+rx*offset;
    this.y=center.y+ry*offset;
    this.angle=this._laneHeading;
    this.laneOffset=offset;
  };
})();
