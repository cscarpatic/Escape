(() => {
  function carScreenAngle(a){
    return window.viewVehicleScreenAngle ? window.viewVehicleScreenAngle(a) : a + Math.PI/2;
  }

  function drawSupercar(g){
    const p=g.player;
    const s=worldToScreen(p.x,p.y);
    if(s.x<-120||s.x>W+120||s.y<-120||s.y>H+120)return;

    // Visually longer, lower and wider than the old rounded car.
    const L=72, Wd=34;
    ctx.save();
    ctx.translate(s.x,s.y);
    ctx.rotate(carScreenAngle(p.angle));

    // Ground shadow: narrow and elongated, not oval/bug-like.
    ctx.fillStyle='rgba(0,0,0,.42)';
    ctx.beginPath();
    ctx.moveTo(-Wd*.62,-L*.48);ctx.lineTo(Wd*.62,-L*.48);
    ctx.lineTo(Wd*.74,L*.34);ctx.lineTo(Wd*.52,L*.56);
    ctx.lineTo(-Wd*.52,L*.56);ctx.lineTo(-Wd*.74,L*.34);ctx.closePath();ctx.fill();

    // Main wedge silhouette: pointed nose, pinched waist, broad rear haunches.
    const body=ctx.createLinearGradient(0,-L*.55,0,L*.55);
    body.addColorStop(0,'#25d7e4');
    body.addColorStop(.42,'#087d96');
    body.addColorStop(1,'#063e57');
    ctx.fillStyle=body;
    ctx.strokeStyle='rgba(180,252,255,.55)';
    ctx.lineWidth=1.4;
    ctx.beginPath();
    ctx.moveTo(0,-L*.56);
    ctx.lineTo(Wd*.44,-L*.46);
    ctx.lineTo(Wd*.66,-L*.22);
    ctx.lineTo(Wd*.73,L*.12);
    ctx.lineTo(Wd*.58,L*.42);
    ctx.lineTo(Wd*.36,L*.53);
    ctx.lineTo(-Wd*.36,L*.53);
    ctx.lineTo(-Wd*.58,L*.42);
    ctx.lineTo(-Wd*.73,L*.12);
    ctx.lineTo(-Wd*.66,-L*.22);
    ctx.lineTo(-Wd*.44,-L*.46);
    ctx.closePath();ctx.fill();ctx.stroke();

    // Carbon splitter and sharp front intakes.
    ctx.fillStyle='#081015';
    ctx.beginPath();ctx.moveTo(0,-L*.60);ctx.lineTo(Wd*.48,-L*.49);ctx.lineTo(Wd*.34,-L*.44);ctx.lineTo(0,-L*.50);ctx.lineTo(-Wd*.34,-L*.44);ctx.lineTo(-Wd*.48,-L*.49);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(3,12,17,.9)';
    ctx.beginPath();ctx.moveTo(-Wd*.48,-L*.35);ctx.lineTo(-Wd*.22,-L*.28);ctx.lineTo(-Wd*.38,-L*.13);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(Wd*.48,-L*.35);ctx.lineTo(Wd*.22,-L*.28);ctx.lineTo(Wd*.38,-L*.13);ctx.closePath();ctx.fill();

    // Long low canopy, clearly rear-biased like a mid-engine supercar.
    ctx.fillStyle='#07151d';
    ctx.strokeStyle='rgba(117,224,242,.32)';
    ctx.beginPath();
    ctx.moveTo(-Wd*.30,-L*.16);ctx.lineTo(Wd*.30,-L*.16);
    ctx.lineTo(Wd*.39,L*.15);ctx.lineTo(Wd*.24,L*.30);
    ctx.lineTo(-Wd*.24,L*.30);ctx.lineTo(-Wd*.39,L*.15);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(80,170,194,.22)';
    ctx.beginPath();ctx.moveTo(-Wd*.25,-L*.12);ctx.lineTo(Wd*.25,-L*.12);ctx.lineTo(Wd*.29,.5);ctx.lineTo(-Wd*.29,.5);ctx.closePath();ctx.fill();

    // Sculpted side channels.
    ctx.strokeStyle='rgba(190,255,255,.20)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(-Wd*.55,-L*.20);ctx.lineTo(-Wd*.44,L*.25);ctx.lineTo(-Wd*.28,L*.43);ctx.stroke();
    ctx.beginPath();ctx.moveTo(Wd*.55,-L*.20);ctx.lineTo(Wd*.44,L*.25);ctx.lineTo(Wd*.28,L*.43);ctx.stroke();
    ctx.fillStyle='rgba(3,15,20,.78)';
    ctx.fillRect(-Wd*.64,L*.05,Wd*.14,L*.22);ctx.fillRect(Wd*.50,L*.05,Wd*.14,L*.22);

    // Rear engine deck vents.
    ctx.strokeStyle='rgba(8,20,25,.92)';ctx.lineWidth=2;
    for(let y=L*.30;y<L*.43;y+=5){ctx.beginPath();ctx.moveTo(-Wd*.23,y);ctx.lineTo(Wd*.23,y);ctx.stroke();}

    // Fixed wing, visually separate from body.
    ctx.fillStyle='#070d12';
    ctx.fillRect(-Wd*.55,L*.47,Wd*1.10,4);
    ctx.fillRect(-Wd*.42,L*.40,3,L*.09);
    ctx.fillRect(Wd*.39,L*.40,3,L*.09);

    // Two thin angular headlights.
    ctx.save();ctx.globalCompositeOperation='screen';
    ctx.shadowBlur=13;ctx.shadowColor='#dfffff';ctx.strokeStyle='#eaffff';ctx.lineWidth=2.4;
    ctx.beginPath();ctx.moveTo(-Wd*.45,-L*.39);ctx.lineTo(-Wd*.15,-L*.47);ctx.stroke();
    ctx.beginPath();ctx.moveTo(Wd*.45,-L*.39);ctx.lineTo(Wd*.15,-L*.47);ctx.stroke();

    // Wide twin red tail signatures.
    ctx.shadowColor='#ff2a48';ctx.shadowBlur=12;ctx.strokeStyle='#ff3a57';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(-Wd*.46,L*.39);ctx.lineTo(-Wd*.16,L*.44);ctx.stroke();
    ctx.beginPath();ctx.moveTo(Wd*.46,L*.39);ctx.lineTo(Wd*.16,L*.44);ctx.stroke();
    ctx.restore();

    // Center exhaust / diffuser details.
    ctx.fillStyle='#02070a';
    ctx.beginPath();ctx.moveTo(-Wd*.28,L*.48);ctx.lineTo(Wd*.28,L*.48);ctx.lineTo(Wd*.18,L*.56);ctx.lineTo(-Wd*.18,L*.56);ctx.closePath();ctx.fill();
    ctx.fillStyle='#161d22';ctx.beginPath();ctx.arc(-5,L*.49,2.2,0,Math.PI*2);ctx.arc(5,L*.49,2.2,0,Math.PI*2);ctx.fill();

    ctx.restore();
  }

  // Final visual override: keep gameplay/collision geometry untouched.
  drawPlayer=function(g){drawSupercar(g);};
})();