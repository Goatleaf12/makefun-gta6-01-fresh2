// Port Vesper — HUD (DOM + live minimap), generative WebAudio, save.
// Fresh code, rebuild #3.
import { HALF, SEA_X } from './city.js';

// ---------- HUD ----------
export function buildHud() {
  const hud = document.createElement('div'); hud.id = 'hud';
  hud.innerHTML = `
    <div id="hud-top">
      <div id="stars" aria-label="wanted level"></div>
      <div id="money">$0</div>
    </div>
    <div id="objective"></div>
    <div id="msg"></div>
    <div id="speed"></div>
    <canvas id="minimap" width="180" height="180"></canvas>
    <div id="hint">WASD move · Shift run · Space jump · E enter car · F punch · Click shoot · M mission · P pause</div>
    <div id="crosshair">+</div>`;
  document.body.appendChild(hud);
  return {
    root: hud,
    stars: hud.querySelector('#stars'),
    money: hud.querySelector('#money'),
    objective: hud.querySelector('#objective'),
    msg: hud.querySelector('#msg'),
    speed: hud.querySelector('#speed'),
    map: hud.querySelector('#minimap'),
    hint: hud.querySelector('#hint'),
  };
}

export function drawMinimap(hud, world) {
  const ctx = hud.map.getContext('2d');
  const S = 180, span = HALF * 2 + 90;
  const px = (x) => ((x + HALF + 10) / span) * S;
  const pz = (z) => ((z + HALF + 10) / span) * S;
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#0a2e3f'; ctx.fillRect(px(SEA_X - 10), 0, S - px(SEA_X - 10), S); // sea
  ctx.fillStyle = '#2a2f38';
  for (let i = 0; i <= 7; i++) { ctx.fillRect(px(-HALF + i * 34) - 2, 0, 4, S); ctx.fillRect(0, pz(-HALF + i * 34) - 2, S, 4); }
  ctx.fillStyle = '#4a4238'; ctx.fillRect(px(HALF), 0, px(HALF + 52) - px(HALF), S); // docks
  const dot = (x, z, color, r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px(x), pz(z), r, 0, 7); ctx.fill(); };
  for (const c of world.traffic) if (!c.dead) dot(c.x, c.z, '#cccccc', 2);
  for (const p of world.peds) if (!p.dead) dot(p.x, p.z, '#7cff00', 1.5);
  for (const c of world.police) dot(c.x, c.z, '#3a86ff', 3);
  if (world.missionTarget) dot(world.missionTarget.x, world.missionTarget.z, '#ffd400', 5);
  const pl = world.player;
  const pxp = pl.inCar ? pl.inCar : pl;
  dot(pxp.x, pxp.z, '#ff2d78', 4);
  // view wedge
  ctx.strokeStyle = '#ff2d78'; ctx.beginPath();
  ctx.moveTo(px(pxp.x), pz(pxp.z));
  ctx.lineTo(px(pxp.x + Math.sin(world.camYaw) * -14), pz(pxp.z + Math.cos(world.camYaw) * -14));
  ctx.stroke();
}

export function updateHud(hud, state) {
  hud.stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  hud.stars.style.color = state.wanted ? '#ff3b30' : '#888';
  hud.money.textContent = '$' + state.money.toLocaleString('en-US');
  hud.objective.textContent = '◆ ' + state.objective;
  if (state.message) {
    hud.msg.textContent = state.message; hud.msg.style.opacity = '1';
  } else hud.msg.style.opacity = '0';
  hud.speed.textContent = state.inCar ? Math.round(Math.abs(state.speed) * 3.2) + ' km/h' : '';
}

// ---------- Overlays ----------
export function buildOverlays() {
  const mk = (id, html) => {
    const d = document.createElement('div'); d.id = id; d.className = 'overlay'; d.innerHTML = html;
    document.body.appendChild(d); return d;
  };
  const start = mk('start-screen', `
    <h1>PORT VESPER</h1><p class="tag">A rain-slick harbor city. One courier. Five jobs. No way out but through.</p>
    <p class="sub">You are <b>Nia Kessler</b>, night courier of Port Vesper. Steal cars, dodge the law,
    run five chained missions and earn your way out of the harbor.</p>
    <button id="btn-start">START ENGINE</button>
    <p class="controls">WASD move/drive · Mouse orbit · Shift run · Space jump · E enter/exit car<br>
    F punch · Click shoot · M start mission · P pause · H mute</p>
    <p class="save" id="save-line"></p>`);
  const pause = mk('pause-screen', `<h1>PAUSED</h1><p>Port Vesper waits in the rain.</p><button id="btn-resume">RESUME</button>`);
  const over = mk('over-screen', `<h1 id="over-title">BUSTED</h1><p id="over-text"></p><button id="btn-retry">TRY AGAIN</button>`);
  pause.style.display = 'none'; over.style.display = 'none';
  return { start, pause, over };
}

// ---------- Audio (generative WebAudio, no files) ----------
export function createAudio() {
  const a = { ctx: null, muted: false, engineOsc: null, engineGain: null, musicTimer: null, sirenOsc: null };
  a.ensure = function () {
    if (a.ctx) { if (a.ctx.state === 'suspended') a.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    a.ctx = new AC();
    // engine: two detuned saws through a lowpass
    a.engineOsc = a.ctx.createOscillator(); a.engineOsc.type = 'sawtooth'; a.engineOsc.frequency.value = 55;
    const o2 = a.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 28;
    a.engineGain = a.ctx.createGain(); a.engineGain.gain.value = 0;
    const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    a.engineOsc.connect(lp); o2.connect(lp); lp.connect(a.engineGain); a.engineGain.connect(a.ctx.destination);
    a.engineOsc.start(); o2.start();
    // siren: alternating two-tone
    a.sirenOsc = a.ctx.createOscillator(); a.sirenOsc.type = 'sine'; a.sirenOsc.frequency.value = 700;
    const sg = a.ctx.createGain(); sg.gain.value = 0;
    a.sirenOsc.connect(sg); sg.connect(a.ctx.destination); a.sirenOsc.start();
    a.sirenGain = sg;
    // music: slow minor bassline + rain-noise pad, scheduled
    const notes = [55, 55, 65.41, 49, 55, 82.41, 73.42, 65.41];
    let step = 0;
    a.musicTimer = setInterval(() => {
      if (!a.ctx || a.muted) return;
      const t = a.ctx.currentTime;
      const o = a.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = notes[step % notes.length];
      const g = a.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(a.ctx.destination); o.start(t); o.stop(t + 1);
      step++;
    }, 450);
  };
  a.setEngine = function (speed, driving) {
    if (!a.ctx || a.muted) return;
    const f = 50 + Math.abs(speed) * 6;
    a.engineOsc.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.1);
    a.engineGain.gain.setTargetAtTime(driving ? 0.05 : 0.015, a.ctx.currentTime, 0.2);
  };
  a.setSiren = function (on) {
    if (!a.ctx) return;
    a.sirenGain.gain.setTargetAtTime(on && !a.muted ? 0.035 : 0, a.ctx.currentTime, 0.3);
    if (on) a.sirenOsc.frequency.setTargetAtTime(Math.floor(performance.now() / 400) % 2 ? 700 : 950, a.ctx.currentTime, 0.1);
  };
  a.blip = function (freq = 880, dur = 0.12) {
    if (!a.ctx || a.muted) return;
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.ctx.destination); o.start(t); o.stop(t + dur);
  };
  a.shot = function () {
    if (!a.ctx || a.muted) return;
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(a.ctx.destination); o.start(t); o.stop(t + 0.15);
  };
  a.toggleMute = function () {
    a.muted = !a.muted;
    if (a.ctx) a.ctx.resume();
    return a.muted;
  };
  return a;
}

// ---------- Save ----------
const SAVE_KEY = 'port-vesper-save-v1';
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && typeof s.money === 'number') ? s : null;
  } catch { return null; }
}
export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money, missionIndex: state.missionIndex, missionsDone: state.missionsDone,
      bestMoney: state.bestMoney, savedAt: Date.now(),
    }));
  } catch { /* storage unavailable — game continues */ }
}
