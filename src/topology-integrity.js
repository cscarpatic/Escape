(() => {
  const BaseRoadNetwork=RoadNetwork;
  const priority=p=>{
    let n=p.kind==='highway'?100:p.kind==='state'?80:p.kind==='ramp'?68:p.kind==='city'?48:25;
    if(p.feature==='roundabout')n+=45;if(p.feature==='interchange')n+=18;if(p.feature==='bridge'||p.feature==='underpass')n+=12;
    return n;
  };
  const levelOf=p=>p.feature==='bridge'?1:(p.level||0);
  const sharesNode=(a,b)=>a.nodeA===b.nodeA||a.nodeA===b.nodeB||a.nodeB===b.nodeA||a.nodeB===b.nodeB;
  const bboxHit=(a,b)=>!(a.maxX<b.minX||b.maxX<a.minX||a.maxY<b.minY||b.maxY<a.minY);
  function cross(a,b,c,d){
    const ax=b.x-a.x,ay=b.y-a.y,bx=d.x-c.x,by=d.y-c.y,den=ax*by-ay*bx;
    if(Math.abs(den)<1e-6)return false;
    const cx=c.x-a.x,cy=c.y-a.y,t=(cx*by-cy*bx)/den,u=(cx*ay-cy*ax)/den;
    return t>.035&&t<.965&&u>.035&&u<.965;
  }
  function pathsCross(a,b){
    if(!bboxHit(a,b))return false;
    for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++)if(cross(a.points[i-1],a.points[i],b.points[j-1],b.points[j]))return true;
    return false;
  }

  RoadNetwork=class RoadNetwork extends BaseRoadNetwork{
    constructor(env){super(env);this.integrity={removedBypasses:0,removedCrossings:0,components:0};this.enforceTopology();}
    enforceTopology(){
      const remove=new Set();
      const groups=new Map();
      for(const n of this.nodes.filter(n=>n.type==='roundabout')){
        const key=n.id.replace(/R[NEWS]$/,'');if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(n.id);
      }
      for(const ring of groups.values()){
        const external=new Set();
        for(const p of this.paths){
          const a=ring.has(p.nodeA),b=ring.has(p.nodeB);
          if(a&&!b)external.add(p.nodeB);if(b&&!a)external.add(p.nodeA);
        }
        const ext=[...external];
        for(let i=0;i<ext.length;i++)for(let j=i+1;j<ext.length;j++){
          for(const p of this.paths){
            if(p.feature==='roundabout')continue;
            if((p.nodeA===ext[i]&&p.nodeB===ext[j])||(p.nodeA===ext[j]&&p.nodeB===ext[i])){remove.add(p.id);this.integrity.removedBypasses++;}
          }
        }
      }
      const candidates=this.paths.filter(p=>!remove.has(p.id));
      for(let i=0;i<candidates.length;i++){
        const a=candidates[i];if(remove.has(a.id))continue;
        for(let j=i+1;j<candidates.length;j++){
          const b=candidates[j];if(remove.has(b.id)||sharesNode(a,b)||levelOf(a)!==levelOf(b))continue;
          if(a.kind==='ramp'&&b.kind==='ramp'&&a.stage===b.stage)continue;
          if(!pathsCross(a,b))continue;
          const pa=priority(a),pb=priority(b);
          const loser=pa===pb?(a.length<b.length?a:b):(pa<pb?a:b);
          remove.add(loser.id);this.integrity.removedCrossings++;
          if(loser===a)break;
        }
      }
      if(remove.size)this.paths=this.paths.filter(p=>!remove.has(p.id));
      const valid=new Set(this.paths.map(p=>p.id));
      for(const n of this.nodes)n.edges=n.edges.filter(id=>valid.has(id));
      const byId=new Map(this.paths.map(p=>[p.id,p]));
      const seen=new Set();let components=0;
      for(const n of this.nodes){
        if(seen.has(n.id)||!n.edges.length)continue;components++;const q=[n];seen.add(n.id);
        while(q.length){const cur=q.pop();for(const eid of cur.edges){const p=byId.get(eid);if(!p)continue;const other=this.nodeMap.get(p.nodeA===cur.id?p.nodeB:p.nodeA);if(other&&!seen.has(other.id)){seen.add(other.id);q.push(other);}}}
      }
      this.integrity.components=components;
    }
  };
})();
