(() => {
  function ensureFx(g){g._cornerFx ||= [];return g._cornerFx;}
  function pushSmoke(g,x,y,vx,vy,size,life,alpha){ensureFx(g).push({type:'smoke',x,y,vx,vy,size,life,maxLife:life,alpha,rot:Math.random()*Math.PI*2,spin:(Math.random()-.5)*1.8});}
  function pushSpark(g,x,y,vx,vy){ensureFx(g).push({type:'spark',x,y,vx,vy,size:1.2+Math.random()*1.5,life:.18+Math.random()*.16,maxLife:.34,alpha:.9,rot:0,spin:0});}

  const baseUpdatePlayer=Game.prototype.updatePlayer;
  Game.prototype.updatePlayer=function(dt){
    const p=this.player,oldAngle=p.angle;
    baseUpdatePlayer.call(this,dt);
    const speed=Math.abs(p.speed||0),turnRate=Math.abs(angleWrap(p.angle-oldAngle))/Math.max(dt,.001);
    const steerMag=Math.abs(p.steer||0);
    const hardCorner=speed>135&&(turnRate>.34||steerMag>.28||p._drift?.active);
    if(hardCorner){
      const intensity=clamp((speed-135)/110,0,1)*clamp((turnRate-.22)/1.2+.35,0,1);
      const fx=Math.cos(p.angle),fy=Math.sin(p.angle),rx=-fy,ry=fx;
      const rearX=p.x-fx*28,rearY=p.y-fy*28;
      const count=1+Math.floor(intensity*3);
      for(let side of [-1,1]){
        const wx=rearX+rx*side*15,wy=rearY+ry*side*15;
        for(let i=0;i<count;i++){
          const spread=(Math.random()-.5)*24;
          pushSmoke(this,wx+rx*spread*.2,wy+ry*spread*.2,-fx*(25+Math.random()*28)+rx*spread,-fy*(25+Math.random()*28)+ry*spread,7+Math.random()*7+intensity*5,.38+Math.random()*.38,.18+.22*intensity);
        }
        if(intensity>.55&&Math.random()<dt*(8+intensity*12))pushSpark(this,wx,wy,-fx*(45+Math.random()*55)+rx*(Math.random()-.5)*38,-fy*(45+Math.random()*55)+ry*(Math.random()-.5)*38);
      }
    }
  };

  const baseUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    baseUpdate.call(this,dt);
    const list=ensureFx(this);
    for(let i=list.length-1;i>=0;i--){const q=list[i];q.life-=dt;if(q.life<=0){list.splice(i,1);continue;}q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=Math.pow(.24,dt);q.vy*=Math.pow(.24,dt);q.rot+=q.spin*dt;if(q.type==='smoke')q.size+=18*dt;}
  };

  function drawFx(g){
    const list=ensureFx(g);if(!list.length)return;
    for(const q of list){const s=worldToScreen(q.x,q.y),k=clamp(q.life/Math.max(.001,q.maxLife),0,1);ctx.save();ctx.translate(s.x,s.y);ctx.rotate(q.rot);ctx.globalAlpha=q.alpha*k;
      if(q.type==='smoke'){
        const grd=ctx.createRadialGradient(0,0,1,0,0,q.size);grd.addColorStop(0,'rgba(205,214,220,.48)');grd.addColorStop(.55,'rgba(120,132,140,.24)');grd.addColorStop(1,'rgba(70,78,84,0)');ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,q.size,0,Math.PI*2);ctx.fill();
      }else{
        ctx.strokeStyle='rgba(255,205,120,.95)';ctx.shadowBlur=7;ctx.shadowColor='rgba(255,130,50,.8)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-q.vx*.035,-q.vy*.035);ctx.stroke();
      }ctx.restore();}
  }

  const baseRender=render;
  render=function(){baseRender();if(game&&state!=='menu')drawFx(game);};
})();