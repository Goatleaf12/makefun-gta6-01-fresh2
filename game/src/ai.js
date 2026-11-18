// Port Vesper — traffic AI, pedestrians, police AI (fresh code, rebuild #3).
import * as THREE from '../vendor/three.module.min.js';
import { clamp, angleLerp, mulberry32 } from './util.js';
import { collide, inBounds, randomRoadPoint, nearestRoadPoint, HALF, BLOCK } from './city.js';
import { makeCar } from './player.js';

// ---------- Traffic ----------
export function spawnTraffic(scene, rng, roads, colliders, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(rng, roads);
    const road = nearestRoadPoint(roads, p.x, p.z);
    const heading = road.axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const car = makeCar(p.x, p.z, heading, [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x7d3c98, 0x95a5a6][i % 5], { driver: 'traffic' });
    car.ai = { road, speed: 6 + rng() * 4, wait: 0, lane: rng() < 0.5 ? 2.2 : -2.2 };
    scene.add(car.mesh); cars.push(car);
  }
  return cars;
}

export function updateTraffic(cars, dt, colliders, playerCar, policeCars) {
  for (const c of cars) {
    if (c.dead || c.driver !== 'traffic') continue;
    const ai = c.ai;
    if (ai.wait > 0) { ai.wait -= dt; c.speed = 0; }
    else {
      // cruise along current road axis; at intersections sometimes turn
      const dirX = Math.sin(c.heading), dirZ = Math.cos(c.heading);
      const aheadX = c.x + dirX * 7, aheadZ = c.z + dirZ * 7;
      let blocked = false;
      for (const o of cars) {
        if (o === c || o.dead) continue;
        const dx = o.x - aheadX, dz = o.z - aheadZ;
        if (dx * dx + dz * dz < 30) { blocked = true; break; }
      }
      if (!blocked && playerCar) {
        const dx = playerCar.x - aheadX, dz = playerCar.z - aheadZ;
        if (dx * dx + dz * dz < 30) blocked = true;
      }
      if (blocked) { c.speed = Math.max(0, c.speed - 12 * dt); }
      else c.speed = clamp(c.speed + 3 * dt, 0, ai.speed);
      // intersection: snap-turn onto a crossing road occasionally
      const nearX = Math.abs(c.x - Math.round(c.x / BLOCK) * BLOCK) < 1.2;
      if (Math.abs(c.z) < HALF && Math.abs(c.x) < HALF) {
        const onCross = Math.abs(((c.x + HALF) % BLOCK)) < 1.4 || Math.abs(((c.z + HALF) % BLOCK)) < 1.4;
        if (onCross && Math.random() < dt * 0.12) {
          c.heading = Math.round((c.heading + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)) / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      if (!inBounds(c.x, c.z)) { // respawn on the far side
        c.x = -c.x * 0.9; c.z = -c.z * 0.9; c.heading += Math.PI;
      }
      collide(colliders, c, 2.0);
    }
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
  }
}

// ---------- Pedestrians ----------
const PED_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22];
export function spawnPeds(scene, rng, count) {
  const peds = [];
  const bodyGeo = new THREE.BoxGeometry(0.55, 0.8, 0.32);
  const headGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.22);
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: PED_COLORS[i % PED_COLORS.length], roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 1.0; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xd9a986 })); head.position.y = 1.66; g.add(head);
    const l1 = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x222222 })); l1.position.set(-0.14, 0.3, 0); g.add(l1);
    const l2 = l1.clone(); l2.position.x = 0.14; g.add(l2);
    const x = -HALF + rng() * HALF * 2, z = -HALF + rng() * HALF * 2;
    g.position.set(x, 0, z); scene.add(g);
    peds.push({ mesh: g, leg1: l1, leg2: l2, x, z, heading: rng() * Math.PI * 2, speed: 1.2 + rng() * 1.2, phase: rng() * 6, flee: 0, hp: 30, dead: false, wait: rng() * 3 });
  }
  return peds;
}

export function updatePeds(peds, dt, colliders, danger) {
  // danger: {x,z,r} — peds inside flee away from it
  for (const p of peds) {
    if (p.dead) continue;
    const dx = p.x - danger.x, dz = p.z - danger.z, d = Math.hypot(dx, dz);
    if (d < danger.r) { p.flee = 1.5; p.heading = Math.atan2(dx, dz); }
    if (p.flee > 0) {
      p.flee -= dt; p.speed = 5;
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
    } else if (p.wait > 0) { p.wait -= dt; }
    else {
      p.speed = 1.6;
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      if (Math.random() < dt * 0.15) p.heading += (Math.random() - 0.5) * 1.6;
      if (Math.random() < dt * 0.05) p.wait = 1 + Math.random() * 2;
    }
    p.x = clamp(p.x, -HALF, HALF); p.z = clamp(p.z, -HALF, HALF);
    collide(colliders, p, 0.45);
    p.phase += p.speed * dt * 2.2;
    const sw = Math.sin(p.phase) * 0.5;
    p.leg1.rotation.x = sw; p.leg2.rotation.x = -sw;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
}

// ---------- Police ----------
export function spawnPolice(scene, x, z, heading) {
  const car = makeCar(x, z, heading, 0x111111, { police: true, driver: 'police' });
  scene.add(car.mesh);
  return car;
}

export function updatePolice(cars, dt, target, colliders, allCars) {
  // target: {x,z} player position (on foot or in car). Police chase + ram.
  for (const c of cars) {
    if (c.dead) continue;
    const dx = target.x - c.x, dz = target.z - c.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    c.heading = angleLerp(c.heading, want, Math.min(1, dt * 1.6));
    const desired = d > 60 ? 24 : d > 12 ? 20 : 8;
    c.speed = clamp(c.speed + (desired - c.speed) * dt * 0.8, 0, 26);
    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
    if (collide(colliders, c, 2.0)) c.speed *= 0.5;
    for (const o of allCars) {
      if (o === c || o.dead || o.driver === 'police') continue;
      const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz);
      if (od < 4.4 && od > 0.01) { c.x = o.x + (ox / od) * 4.4; c.z = o.z + (oz / od) * 4.4; c.speed *= 0.5; }
    }
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
    if (c.mesh.userData.lightbar) {
      const m = c.mesh.userData.lightbar.material;
      m.emissive.setHex(Math.floor(performance.now() / 280) % 2 ? 0xff0000 : 0x0044ff);
    }
  }
}
export { mulberry32 };
