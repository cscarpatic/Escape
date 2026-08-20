(() => {
  async function requestGameFullscreen(){
    const el=document.documentElement;
    try{
      if(document.fullscreenElement)return true;
      if(el.requestFullscreen){await el.requestFullscreen({navigationUI:'hide'});return true;}
      if(el.webkitRequestFullscreen){el.webkitRequestFullscreen();return true;}
    }catch(_e){}
    // iOS Safari does not expose standard fullscreen for arbitrary web pages.
    // Keep the viewport as immersive as possible instead.
    try{window.scrollTo(0,1);}catch(_e){}
    return false;
  }

  const originalStartGame=window.startGame;
  if(typeof originalStartGame==='function'){
    window.startGame=function(){
      // requestFullscreen must be triggered directly from a user gesture,
      // so request it first and start the game immediately afterwards.
      requestGameFullscreen();
      return originalStartGame.apply(this,arguments);
    };
  }

  // Existing listeners may already reference the old function, so capture the
  // start button click before those listeners run and request fullscreen there too.
  const start=document.getElementById('startButton');
  if(start){
    start.addEventListener('pointerdown',()=>{requestGameFullscreen();},{capture:true});
  }

  document.addEventListener('fullscreenchange',()=>{
    document.body.classList.toggle('game-fullscreen',!!document.fullscreenElement);
  });
})();