const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const darknessCanvas = document.createElement('canvas');
const darknessCtx = darknessCanvas.getContext('2d');

const ui = {
  menu: document.getElementById('menu'),
  envGrid: document.getElementById('environmentGrid'),
  start: document.getElementById('startButton'),
  hud: document.getElementById('hud'),
  speed: document.getElementById('speedValue'),
  distance: document.getElementById('distanceValue'),
  progress: document.getElementById('escapeProgress'),
  objective: document.getElementById('objectiveText'),
  heat: document.getElementById('heatBar'),
  heatText: document.getElementById('heatText'),
  copDistance: document.getElementById('copDistance'),
  junctionHint: document.getElementById('junctionHint'),
  junctionText: document.getElementById('junctionText'),
  pauseButton: document.getElementById('pauseButton'),
  pausePanel: document.getElementById('pausePanel'),
  resumeButton: document.getElementById('resumeButton'),
  result: document.getElementById('resultPanel'),
  resultEyebrow: document.getElementById('resultEyebrow'),
  resultTitle: document.getElementById('resultTitle'),
  resultCopy: document.getElementById('resultCopy'),
  resultDistance: document.getElementById('resultDistance'),
  resultSpeed: document.getElementById('resultSpeed'),
  resultOvertakes: document.getElementById('resultOvertakes'),
  retry: document.getElementById('retryButton'),
  menuButton: document.getElementById('menuButton'),
  toast: document.getElementById('toast'),
};

const ENVIRONMENTS = [
  {
    id: 'neon', number: '01', name: 'Neon District', difficulty: 'ACCESSIBILE',
    blurb: 'Viali larghi, pioggia, molto traffico.', accent: '#66f7ff', stars: 1,
    roadWidth: 176, branchSpread: 250, curve: 100, traffic: 0.9, oncoming: 0.25,
    cops: 2, copPower: 0.92, visibility: 1.05, escapeKm: 6.5, fog: 0.04, rain: 0.72,
    ground: '#060b11', road: '#171d24', shoulder: '#272e35', lane: '#80909d',
    skyGlow: [56, 208, 255], propMode: 'city', heat: 0.50,
  },
  {
    id: 'docks', number: '02', name: 'Container Docks', difficulty: 'NORMALE',
    blurb: 'Corsie strette, mezzi pesanti e ostacoli.', accent: '#ffb65c', stars: 2,
    roadWidth: 158, branchSpread: 280, curve: 145, traffic: 1.02, oncoming: 0.34,
    cops: 3, copPower: 1.0, visibility: 0.98, escapeKm: 7.5, fog: 0.08, rain: 0.32,
    ground: '#0a0a09', road: '#1d1d1c', shoulder: '#34312b', lane: '#9b8f7b',
    skyGlow: [255, 154, 74], propMode: 'industrial', heat: 0.62,
  },
  {
    id: 'alpine', number: '03', name: 'Black Ridge', difficulty: 'DIFFICILE',
    blurb: 'Curve cieche, carreggiata stretta, nebbia.', accent: '#d9f2ff', stars: 3,
    roadWidth: 142, branchSpread: 310, curve: 205, traffic: 0.8, oncoming: 0.48,
    cops: 3, copPower: 1.08, visibility: 0.88, escapeKm: 8.5, fog: 0.16, rain: 0.08,
    ground: '#07090b', road: '#181b1d', shoulder: '#292d2d', lane: '#c1c9c6',
    skyGlow: [194, 226, 255], propMode: 'alpine', heat: 0.70,
  },
  {
    id: 'storm', number: '04', name: 'Dust Run', difficulty: 'ESTREMO',
    blurb: 'Visibilità minima, incroci veloci, polizia aggressiva.', accent: '#ff635f', stars: 4,
    roadWidth: 148, branchSpread: 345, curve: 235, traffic: 1.12, oncoming: 0.60,
    cops: 4, copPower: 1.17, visibility: 0.78, escapeKm: 9.5, fog: 0.20, rain: 0,
    ground: '#100b09', road: '#221b19', shoulder: '#4b3429', lane: '#c7a683',
    skyGlow: [255, 93, 71], propMode: 'desert', heat: 0.82,
  },
];

let selectedEnv = 0;
let W = 1280, H = 720, DPR = 1;
let state = 'menu';
let game = null;
let raf = 0;
let last = performance.now();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleWrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const angleLerp = (a, b, t) => a + angleWrap(b - a) * t;
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
const randRange = (seed, a, b) => lerp(a, b, hash(seed));

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  darknessCanvas.width = Math.floor(W * DPR); darknessCanvas.height = Math.floor(H * DPR);
  darknessCtx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize); resize();

function buildMenu() {
  ui.envGrid.innerHTML = '';
  ENVIRONMENTS.forEach((env, i) => {
    const card = document.createElement('button');
    card.className = 'environment-card' + (i === selectedEnv ? ' active' : '');
    card.style.setProperty('--env-accent', env.accent);
    card.innerHTML = `
      <div class="environment-top"><span class="environment-number">${env.number}</span><span class="difficulty">${env.difficulty}</span></div>
      <h3>${env.name}</h3><p>${env.blurb}</p>
      <div class="environment-bar">${[1,2,3,4].map(s => `<i class="${s <= env.stars ? 'on' : ''}"></i>`).join('')}</div>`;
    card.addEventListener('click', () => { selectedEnv = i; buildMenu(); audio.uiClick(); });
    ui.envGrid.appendChild(card);
  });
}
buildMenu();

class AudioEngine {
  constructor(){ this.ctx = null; this.engine = null; this.siren = null; this.master = null; }
  init(){
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = .22; this.master.connect(this.ctx.destination);
    const engOsc = this.ctx.createOscillator();
    const engGain = this.ctx.createGain();
    const engFilter = this.ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 420;
    engOsc.type = 'sawtooth'; engOsc.frequency.value = 45; engGain.gain.value = 0;
    engOsc.connect(engFilter); engFilter.connect(engGain); engGain.connect(this.master); engOsc.start();
    this.engine = { osc: engOsc, gain: engGain, filter: engFilter };
    const sirA = this.ctx.createOscillator(), sirB = this.ctx.createOscillator(), sirGain = this.ctx.createGain();
    sirA.type='sine'; sirB.type='sine'; sirA.frequency.value=640; sirB.frequency.value=880; sirGain.gain.value=0;
    sirA.connect(sirGain); sirB.connect(sirGain); sirGain.connect(this.master); sirA.start(); sirB.start();
    this.siren = { a:sirA,b:sirB,gain:sirGain };
  }
  update(speed, copDist, running){
    if (!this.ctx || !this.engine) return;
    const now = this.ctx.currentTime;
    const s = Math.abs(speed);
    this.engine.osc.frequency.setTargetAtTime(42 + s * .45, now, .07);
    this.engine.filter.frequency.setTargetAtTime(340 + s * 5, now, .08);
    this.engine.gain.gain.setTargetAtTime(running ? .035 + s*.00035 : 0, now, .08);
    const proximity = running ? clamp(1 - copDist / 500, 0, 1) : 0;
    const wave = .5 + .5*Math.sin(performance.now()*.0065);
    this.siren.a.frequency.setTargetAtTime(570 + wave*190, now, .02);
    this.siren.b.frequency.setTargetAtTime(820 - wave*170, now, .02);
    this.siren.gain.gain.setTargetAtTime(proximity*.035, now, .08);
  }
  hit(){ this.burst(80, .09, 'square'); }
  uiClick(){ this.burst(360, .025, 'sine'); }
  burst(freq=.02, duration=.06, type='sine'){
    if (!this.ctx || !this.master) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=.08; o.connect(g); g.connect(this.master);
    const now=this.ctx.currentTime; g.gain.exponentialRampToValueAtTime(.001, now+duration); o.start(now); o.stop(now+duration+.01);
  }
}
const audio = new AudioEngine();
