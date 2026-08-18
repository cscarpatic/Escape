(() => {
  const baseTrafficUpdate = TrafficCar.prototype.update;

  function isSignalNode(g,node) {
    return !!node && Array.isArray(g?.road?.trafficLights) && g.road.trafficLights.includes(node);
  }

  function isRed(node) {
    const m=/^C(\d+)_(\d+)$/.exec(node?.id||'');
    const row=m?+m[1]:0,col=m?+m[2]:0;
    const phase=(performance.now()/1000 + (row+col)*.63) % 6;
    return phase >= 3.2;
  }

  TrafficCar.prototype.update = function(dt) {
    const g=game;
    if (g?.env?.propMode==='city' && this.path?.nodeA && this.path?.nodeB) {
      const targetId=this.direction>0?this.path.nodeB:this.path.nodeA;
      const node=g.road.nodeMap?.get(targetId);
      const approaching=this.direction>0?this.t>.79:this.t<.21;
      if (approaching && isSignalNode(g,node) && isRed(node)) {
        this.speed=lerp(this.speed,0,Math.min(1,dt*9));
        return;
      }
    }
    baseTrafficUpdate.call(this,dt);
  };
})();