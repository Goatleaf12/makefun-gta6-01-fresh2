// Port Vesper — 5 chained missions, wanted system, HUD, audio, save
// (fresh code, rebuild #3). Missions are data + a small state machine.
import { HALF, SEA_X } from './city.js';

// Mission chain. Each: id, title, briefing, target point, reward, kind.
// kind: 'goto' | 'steal' | 'chase' | 'escape' | 'deliver'
export const MISSIONS = [
  { id: 1, title: 'Night Courier', briefing: 'Pick up the sealed package at Pier 3, east docks.', kind: 'goto', point: { x: HALF + 26, z: -40 }, reward: 150 },
  { id: 2, title: 'Hot Wheels', briefing: 'Steal the red coupe and bring it to the garage in the south-west.', kind: 'steal', point: { x: -100, z: 100 }, reward: 300 },
  { id: 3, title: 'Tail the Fixer', briefing: 'Chase the grey sedan — ram it until it stops. Do not let it escape.', kind: 'chase', point: { x: -40, z: -40 }, reward: 450 },
  { id: 4, title: 'Heat Wave', briefing: 'The cops are on you. Survive the chase, then reach the hideout in the south-west.', kind: 'escape', point: { x: -100, z: 100 }, reward: 600 },
  { id: 5, title: 'Last Run', briefing: 'Final delivery: take the package to the end of the east pier. No mistakes.', kind: 'deliver', point: { x: HALF + 48, z: 100 }, reward: 1000 },
];

export function createMissionState() {
  return { index: 0, active: false, started: false, timer: 0, chaseHp: 100, escapeTimer: 0, done: false, message: '', messageT: 0 };
}

export function missionObjective(ms) {
  if (ms.done) return 'All missions complete — Port Vesper is yours, Nia.';
  if (!ms.started) return 'Press M to start Mission 1: Night Courier';
  const m = MISSIONS[ms.index];
  return `M${m.id} ${m.title} — ${m.briefing}`;
}

// ---------- Wanted ----------
export function createWanted() { return { level: 0, heat: 0, hidden: 0 }; }
export function addHeat(w, n, msg) {
  w.heat = Math.min(100, w.heat + n);
  const lvl = w.heat <= 0 ? 0 : w.heat < 20 ? 1 : w.heat < 40 ? 2 : w.heat < 60 ? 3 : w.heat < 85 ? 4 : 5;
  const up = lvl > w.level;
  w.level = lvl;
  return up ? msg || ('Wanted level ' + lvl) : null;
}
export function updateWanted(w, dt, policeNear, inCar) {
  if (w.level === 0) return;
  if (policeNear) { w.hidden = 0; }
  else {
    w.hidden += dt;
    if (w.hidden > 6) w.heat = Math.max(0, w.heat - dt * 2.2); // cooling off while hidden
    const lvl = w.heat <= 0 ? 0 : w.heat < 20 ? 1 : w.heat < 40 ? 2 : w.heat < 60 ? 3 : w.heat < 85 ? 4 : 5;
    w.level = lvl;
  }
}
