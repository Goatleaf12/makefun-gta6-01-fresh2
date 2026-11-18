// Port Vesper — main game loop (fresh code, rebuild #3).
// Third-person open-world: walk / drive / steal / wanted / 5 chained missions.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, clamp } from './util.js';
import { buildCity, HALF, SEA_X, BLOCK } from './city.js';
import { makePlayer, makeCar, updatePlayer, updateDrive, CAR_COLORS } from './player.js';
import { spawnTraffic, updateTraffic, spawnPeds, updatePeds, spawnPolice, updatePolice } from './ai.js';
import { MISSIONS, createMissionState, missionObjective, createWanted, addHeat, updateWanted } from './missions.js';
import { buildHud, drawMinimap, updateHud, buildOverlays, createAudio, loadSave, writeSave } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = Number(params.get('seed') || 1);

const rng = mulberry32(1337 + SEED * 97);

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e16);
scene.fog = new THREE.Fog(0x0b0e16, 55, 260);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);

scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2018, 1.25));
const moon = new THREE.DirectionalLight(0xbfd0ff, 1.5);
moon.position.set(-60, 90, 40); moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -160; moon.shadow.camera.right = 160;
moon.shadow.camera.top = 160; moon.shadow.camera.bottom = -160;
scene.add(moon);

const city = buildCity(scene, rng);

// ---------- world state ----------
const player = makePlayer(scene);
const parked = [];
const PARK_STREETS = [-119, -85, -51, -17, 17];
for (let i = 0; i < 10; i++) {
  const x = PARK_STREETS[i % 5] + 3.5, z = -90 + Math.floor(i / 5) * 55;
  const c = makeCar(x, z, (i % 2 ? 0 : Math.PI), CAR_COLORS[i % CAR_COLORS.length], { parked: true });
  scene.add(c.mesh); parked.push(c);
}
const traffic = spawnTraffic(scene, rng, city.roads, city.colliders, 12);
const peds = spawnPeds(scene, rng, 24);
const police = [];
const roadblocks = [];

const state = {
  screen: 'start', // start | play | pause | over
  money: 0, missionIndex: 0, missionsDone: 0, bestMoney: 0,
  wanted: createWanted(), ms: createMissionState(),
  camYaw: 0.6, camPitch: 0.32, camDist: 9,
  message: '', messageT: 0, overReason: '', shotMode: SHOT,
  time: 0, policeSpawnT: 0, saveT: 0, muzzleT: 0,
};
const saved = loadSave();
if (saved) {
  state.money = saved.money || 0; state.missionIndex = saved.missionIndex || 0;
  state.missionsDone = saved.missionsDone || 0; state.bestMoney = saved.bestMoney || 0;
  state.ms.index = state.missionIndex;
}

// mission marker beacon
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(2.2, 2.2, 30, 20, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
beacon.visible = false; scene.add(beacon);
const marker = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4),
  new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0xffd400, emissiveIntensity: 0.9 }));
marker.visible = false; scene.add(marker);
// muzzle flash
const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
muzzle.visible = false; scene.add(muzzle);

const hud = buildHud();
const overlays = buildOverlays();
const audio = createAudio();
if (saved) overlays.start.querySelector('#save-line').textContent =
  `Save found: $${saved.money} · mission ${Math.min(saved.missionIndex + 1, 5)} of 5 · ${new Date(saved.savedAt).toLocaleDateString()}`;

function say(text, secs = 4) { state.message = text; state.messageT = secs; }
function missionTarget() {
  if (!state.ms.started || state.ms.done) return null;
  const m = MISSIONS[state.ms.index];
  return m.point;
}

// ---------- input ----------
const input = { keys: {}, mouseDX: 0, mouseDY: 0 };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys[e.code] = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') startMission();
  if (e.code === 'KeyH') { const m = audio.toggleMute(); say(m ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyE') tryEnterExit();
  if (e.code === 'KeyF') punch();
  if (e.code === 'Enter' && state.screen === 'start') startGame();
  if (e.code === 'Enter' && state.screen === 'over') retry();
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; });
canvas.addEventListener('click', () => {
  if (state.screen === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.();
  else if (state.screen === 'play') shoot();
});
document.addEventListener('pointerlockchange', () => { /* lock lost = fine, drag still works */ });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || e.buttons) {
    input.mouseDX += e.movementX; input.mouseDY += e.movementY;
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
overlays.start.querySelector('#btn-start').addEventListener('click', startGame);
overlays.pause.querySelector('#btn-resume').addEventListener('click', togglePause);
overlays.over.querySelector('#btn-retry').addEventListener('click', retry);

function startGame() {
  audio.ensure();
  overlays.start.style.display = 'none';
  overlays.over.style.display = 'none';
  state.screen = 'play';
  say('Welcome to Port Vesper, Nia. Press M to start Mission 1.', 5);
}
function togglePause() {
  if (state.screen === 'play') { state.screen = 'pause'; overlays.pause.style.display = 'flex'; document.exitPointerLock?.(); }
  else if (state.screen === 'pause') { state.screen = 'play'; overlays.pause.style.display = 'none'; }
}
function gameOver(title, text) {
  state.screen = 'over'; state.overReason = title;
  overlays.over.querySelector('#over-title').textContent = title;
  overlays.over.querySelector('#over-text').textContent = text;
  overlays.over.style.display = 'flex';
  document.exitPointerLock?.();
  writeSave(state);
}
function retry() {
  player.hp = 100; player.x = 0; player.z = 8; player.y = 0; player.inCar = null;
  state.wanted = createWanted();
  for (const c of police) { scene.remove(c.mesh); }
  police.length = 0;
  for (const r of roadblocks) scene.remove(r.mesh);
  roadblocks.length = 0;
  overlays.over.style.display = 'none';
  state.screen = 'play';
  say('Back on the streets. Stay sharp, Nia.');
}

// ---------- cars: enter / exit / steal ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of [...parked, ...traffic, ...police]) {
    if (c.dead || c.driver === 'player') continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function tryEnterExit() {
  if (state.screen !== 'play') return;
  if (player.inCar) {
    const car = player.inCar;
    car.driver = null; player.inCar = null;
    player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
    player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
    player.mesh.position.set(player.x, 0, player.z);
    say('Out of the car.');
    return;
  }
  const car = nearestCar(4.5);
  if (!car) { say('No car close enough.'); return; }
  const stolen = car.parked || car.driver === 'traffic';
  if (car.driver === 'traffic') { car.driver = null; }
  if (car.police) { say('You cannot steal a police cruiser — too hot.'); return; }
  car.driver = 'player'; car.parked = false; player.inCar = car;
  player.mesh.visible = false;
  if (stolen && !car.stolen) {
    car.stolen = true;
    const m = addHeat(state.wanted, 18, 'Wanted level ' + state.wanted.level + ' — car stolen!');
    if (m) say(m + ' — the cops saw that.');
    else say('Car stolen. Keep it quiet…');
    audio.blip(660);
  } else say('Behind the wheel.');
}

// ---------- combat ----------
function punch() {
  if (state.screen !== 'play' || player.inCar) return;
  audio.blip(220, 0.1);
  let hit = false;
  for (const p of peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < 2.2) {
      p.hp -= 20; p.flee = 2;
      p.x += Math.sin(p.heading) * 1.5; p.z += Math.cos(p.heading) * 1.5;
      hit = true;
      if (p.hp <= 0) { p.dead = true; p.mesh.visible = false; addHeat(state.wanted, 25, 'Wanted level ' + state.wanted.level); say('Pedestrian down. The city saw that.'); }
    }
  }
  for (const c of police) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < 3) { c.hp -= 10; hit = true; addHeat(state.wanted, 10); }
  }
  if (hit) say('You throw a punch.');
}
function shoot() {
  if (state.screen !== 'play' || player.inCar) return;
  audio.shot(); state.muzzleT = 0.08;
  muzzle.position.set(player.x + Math.sin(player.heading) * 1.2, 1.4, player.z + Math.cos(player.heading) * 1.2);
  muzzle.visible = true;
  const dirX = Math.sin(player.heading), dirZ = Math.cos(player.heading);
  let hit = false;
  for (const p of peds) {
    if (p.dead) continue;
    const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
    if (d < 30 && (dx * dirX + dz * dirZ) / (d || 1) > 0.92) {
      p.hp -= 35; p.flee = 2; hit = true;
      if (p.hp <= 0) { p.dead = true; p.mesh.visible = false; addHeat(state.wanted, 25); }
    }
  }
  for (const c of police) {
    const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
    if (d < 30 && (dx * dirX + dz * dirZ) / (d || 1) > 0.92) { c.hp -= 25; hit = true; addHeat(state.wanted, 12); if (c.hp <= 0) { c.dead = true; c.mesh.visible = false; } }
  }
  if (hit) say('Shot fired — hit!');
  else addHeat(state.wanted, 4);
}

// ---------- missions ----------
function startMission() {
  if (state.screen !== 'play') return;
  if (state.ms.done) { say('All five missions are done. Port Vesper is yours.'); return; }
  if (state.ms.started) { say('Mission already running: ' + MISSIONS[state.ms.index].title); return; }
  const m = MISSIONS[state.ms.index];
  state.ms.started = true; state.ms.timer = 0; state.ms.escapeTimer = 0;
  say(`Mission ${m.id}: ${m.title} — ${m.briefing}`, 6);
  audio.blip(990, 0.2);
  if (m.kind === 'steal') {
    // mark a red coupe as the target car
    const target = parked.find((c) => c.color === 0xc0392b) || parked[0];
    target.target = true;
    say('Target car: the red coupe. Steal it and drive it to the garage marker in the south-west.', 6);
  }
  if (m.kind === 'chase') {
    const t = makeCar(-40, -40, 0, 0x555555, { driver: 'traffic' });
    t.ai = { road: null, speed: 11, wait: 0 };
    scene.add(t.mesh); traffic.push(t);
    state.chaseCar = t;
    say('The grey sedan is running. Ram it until it stops!', 5);
  }
  if (m.kind === 'escape') {
    addHeat(state.wanted, 45, 'Wanted level 3 — the whole harbor is after you!');
    say('Heat is on! Survive 45 seconds, then reach the hideout.', 5);
  }
}
function completeMission() {
  const m = MISSIONS[state.ms.index];
  state.money += m.reward;
  state.bestMoney = Math.max(state.bestMoney, state.money);
  state.missionsDone++; state.missionIndex++;
  state.ms.started = false; state.ms.index++;
  say(`Mission complete: ${m.title} — +$${m.reward}!`, 6);
  audio.blip(1320, 0.3);
  if (state.ms.index >= MISSIONS.length) {
    state.ms.done = true;
    say('ALL MISSIONS COMPLETE — Nia Kessler owns Port Vesper. +$1,000 bonus banked.', 8);
    state.money += 1000;
  }
  writeSave(state);
}
function updateMissions(dt) {
  const ms = state.ms;
  if (!ms.started || ms.done) return;
  const m = MISSIONS[ms.index];
  const pl = player.inCar || player;
  const d = Math.hypot(pl.x - m.point.x, pl.z - m.point.z);
  if (m.kind === 'goto' || m.kind === 'deliver') {
    if (d < 5) completeMission();
  } else if (m.kind === 'steal') {
    const target = parked.find((c) => c.target);
    if (target && player.inCar === target && d < 6) completeMission();
    else if (target && target.stolen && !player.inCar) say('Get back in the red coupe and drive it to the garage marker.');
  } else if (m.kind === 'chase') {
    const t = state.chaseCar;
    if (t) {
      // target car flees from the player
      const dx = t.x - pl.x, dz = t.z - pl.z, dd = Math.hypot(dx, dz) || 1;
      t.heading += Math.sin(t.heading - Math.atan2(dx, dz)) * 0; // keep road heading, flee along it
      t.x += Math.sin(t.heading) * 11 * dt; t.z += Math.cos(t.heading) * 11 * dt;
      t.mesh.position.set(t.x, 0, t.z); t.mesh.rotation.y = t.heading;
      if (Math.hypot(t.x - pl.x, t.z - pl.z) < 4.6 && Math.abs((player.inCar?.speed || 0)) > 4) {
        t.hp -= 30 * dt * 2; ms.chaseHp = t.hp;
        if (t.hp <= 0) { t.dead = true; t.mesh.visible = false; completeMission(); }
      }
      if (Math.abs(t.x) > HALF + 20 || Math.abs(t.z) > HALF + 20) { say('The target escaped the city. Mission failed — press M to retry.'); ms.started = false; }
    }
  } else if (m.kind === 'escape') {
    ms.escapeTimer += dt;
    if (state.wanted.level >= 2 && ms.escapeTimer > 45) {
      if (d < 6) completeMission();
      else if (ms.escapeTimer > 45) say('You survived the heat — now reach the hideout marker!');
    } else if (ms.escapeTimer > 45 && state.wanted.level < 2) {
      if (d < 6) completeMission();
    }
  }
}

// ---------- police director + roadblocks ----------
function updatePoliceDirector(dt) {
  const w = state.wanted;
  const want = w.level === 0 ? 0 : w.level === 1 ? 1 : w.level === 2 ? 2 : w.level === 3 ? 3 : 4;
  state.policeSpawnT -= dt;
  if (police.length < want && state.policeSpawnT <= 0) {
    state.policeSpawnT = 3;
    const a = Math.random() * Math.PI * 2;
    const px = clamp(player.x + Math.sin(a) * 45, -HALF, HALF);
    const pz = clamp(player.z + Math.cos(a) * 45, -HALF, HALF);
    police.push(spawnPolice(scene, px, pz, 0));
    say('Police cruiser joining the chase!');
  }
  while (police.length > want) {
    const c = police.pop(); scene.remove(c.mesh);
  }
  // roadblocks at wanted >= 3: two parked cruisers ahead of the player
  if (w.level >= 3 && roadblocks.length === 0) {
    for (const off of [-6, 6]) {
      const fx = player.x + Math.sin(state.camYaw) * -30, fz = player.z + Math.cos(state.camYaw) * -30;
      const rb = makeCar(fx + off, fz, state.camYaw, 0x111111, { police: true });
      rb.driver = 'roadblock';
      scene.add(rb.mesh); roadblocks.push(rb);
    }
    say('ROADBLOCK ahead! Wanted level ' + w.level);
  }
  if (w.level < 3 && roadblocks.length) {
    for (const r of roadblocks) scene.remove(r.mesh);
    roadblocks.length = 0;
  }
  const target = player.inCar || player;
  updatePolice(police, dt, target, city.colliders, [...traffic, ...parked]);
  // busted: police very close while on foot and slow
  if (!player.inCar && police.length) {
    const near = police.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 3.2 && Math.abs(c.speed) < 4);
    if (near && w.level >= 1) gameOver('BUSTED', 'The Vesper PD caught Nia on foot. The harbor keeps its secrets — for now.');
  }
  // player run over by police at speed = hurt
  if (player.inCar) {
    for (const c of police) {
      if (Math.hypot(c.x - player.inCar.x, c.z - player.inCar.z) < 4 && Math.abs(c.speed) > 10) {
        player.inCar.hp -= 20 * dt * 4;
        if (player.inCar.hp <= 0) {
          player.inCar.dead = true; player.inCar.mesh.visible = false;
          player.inCar = null; player.mesh.visible = true;
          say('Your car is wrecked! Run!');
        }
      }
    }
  }
}

// ---------- camera ----------
function updateCamera(dt) {
  state.camYaw -= input.mouseDX * 0.0042;
  state.camPitch = clamp(state.camPitch + input.mouseDY * 0.003, -0.15, 0.9);
  input.mouseDX = 0; input.mouseDY = 0;
  const focus = player.inCar || player;
  const dist = player.inCar ? 12 : state.camDist;
  const cx = focus.x - Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
  const cz = focus.z - Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
  const cy = 2.2 + Math.sin(state.camPitch) * dist + (player.inCar ? 1.5 : 0);
  camera.position.set(cx, cy, cz);
  camera.lookAt(focus.x, (player.inCar ? 1.5 : 1.4) + player.y, focus.z);
}

// ---------- rain ----------
function updateRain(dt) {
  const pos = city.rain.geometry.attributes.position;
  const focus = player.inCar || player;
  for (let i = 0; i < city.rainCount; i++) {
    let y = pos.getY(i) - dt * 34;
    if (y < 0) {
      y = 30 + Math.random() * 10;
      pos.setX(i, focus.x + (Math.random() - 0.5) * 90);
      pos.setZ(i, focus.z + (Math.random() - 0.5) * 90);
    }
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  if (state.screen !== 'play') { renderer.render(scene, camera); return; }
  state.time += dt;
  if (state.messageT > 0) { state.messageT -= dt; if (state.messageT <= 0) state.message = ''; }
  if (state.muzzleT > 0) { state.muzzleT -= dt; if (state.muzzleT <= 0) muzzle.visible = false; }

  // player / driving
  if (player.inCar) {
    updateDrive(player.inCar, input, dt, city.colliders, [...traffic, ...parked, ...police],
      (spd) => { addHeat(state.wanted, 6, 'Wanted level ' + state.wanted.level + ' — reckless driving!'); audio.blip(180, 0.15); });
    audio.setEngine(player.inCar.speed, true);
  } else {
    updatePlayer(player, input, state.camYaw, dt, city.colliders, [...traffic, ...parked, ...police]);
    audio.setEngine(0, false);
  }
  // AI
  updateTraffic(traffic, dt, city.colliders, player.inCar, police);
  const danger = player.inCar
    ? { x: player.inCar.x, z: player.inCar.z, r: Math.abs(player.inCar.speed) > 8 ? 12 : 4 }
    : { x: player.x, z: player.z, r: 3 };
  updatePeds(peds, dt, city.colliders, danger);
  // car-vs-ped hits while driving
  if (player.inCar && Math.abs(player.inCar.speed) > 5) {
    for (const p of peds) {
      if (p.dead) continue;
      if (Math.hypot(p.x - player.inCar.x, p.z - player.inCar.z) < 2.6) {
        p.dead = true; p.mesh.visible = false;
        addHeat(state.wanted, 22, 'Wanted level ' + state.wanted.level + ' — pedestrian hit!');
        say('You hit a pedestrian! The city is watching.');
      }
    }
  }
  // wanted decay + police
  const nearestPolice = police.length ? Math.min(...police.map((c) => Math.hypot(c.x - player.x, c.z - player.z))) : Infinity;
  updateWanted(state.wanted, dt, nearestPolice < 40, !!player.inCar);
  updatePoliceDirector(dt);
  updateMissions(dt);

  // mission beacon
  const tgt = missionTarget();
  if (tgt) {
    beacon.visible = true; marker.visible = true;
    beacon.position.set(tgt.x, 15, tgt.z);
    marker.position.set(tgt.x, 4 + Math.sin(state.time * 3) * 0.5, tgt.z);
    marker.rotation.y = state.time;
  } else { beacon.visible = false; marker.visible = false; }

  // audio siren + camera + rain + HUD
  audio.setSiren(state.wanted.level >= 1);
  updateCamera(dt);
  updateRain(dt);
  updateHud(hud, {
    wanted: state.wanted.level, money: state.money,
    objective: missionObjective(state.ms), message: state.message,
    inCar: !!player.inCar, speed: player.inCar ? player.inCar.speed : 0,
  });
  drawMinimap(hud, {
    traffic, peds, police, player, camYaw: state.camYaw,
    missionTarget: tgt,
  });
  // autosave
  state.saveT += dt;
  if (state.saveT > 15) { state.saveT = 0; writeSave(state); }
  renderer.render(scene, camera);
}

// ---------- screenshot staging (?shot=...) ----------
function stageShot(name) {
  // Deterministic staged scenes for screenshots — real game state, no fake canvas.
  if (name === 'start') { state.screen = 'start'; return; }
  state.screen = 'play';
  overlays.start.style.display = 'none';
  if (name === 'walk') {
    player.x = -17; player.z = 20; player.heading = 2.4;
    state.camYaw = 2.4; state.camPitch = 0.3;
    for (let i = 0; i < 8; i++) { peds[i].x = -17 + (i % 4) * 4; peds[i].z = 14 + Math.floor(i / 4) * 6; }
    say('');
  } else if (name === 'drive') {
    const car = parked[2]; car.driver = 'player'; player.inCar = car; player.mesh.visible = false;
    car.x = 116; car.z = -60; car.heading = 0; car.speed = 20;
    // clear the lane ahead so the chase reads at speed
    for (const t of traffic) { if (Math.abs(t.x - 116) < 9 && t.z > -70 && t.z < 30) { t.z = -105; t.x = 85; } }
    addHeat(state.wanted, 45);
    police.push(spawnPolice(scene, 116, -92, 0));
    police.push(spawnPolice(scene, 113, -80, 0));
    state.camYaw = 0;
    say('Police chase — lose them!');
  } else if (name === 'mission') {
    state.ms.started = true; state.ms.index = 3;
    addHeat(state.wanted, 45);
    police.push(spawnPolice(scene, -10, 70, 0));
    police.push(spawnPolice(scene, 0, 40, 0));
    player.x = 17; player.z = 51; player.heading = -1.18;
    state.camYaw = -1.18;
    say('Mission 4: Heat Wave — survive the chase, reach the hideout!');
  }
  // settle one frame of AI so the scene is alive
  updateCamera(0.016);
  renderer.render(scene, camera);
}

if (SHOT) stageShot(SHOT);
updateCamera(0.016);
renderer.render(scene, camera);
requestAnimationFrame(frame);
window.__portVesper = { state, player, MISSIONS, renderer, scene };
