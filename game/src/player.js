// Port Vesper — player character + car entities (fresh code, rebuild #3).
import * as THREE from '../vendor/three.module.min.js';
import { clamp, angleLerp } from './util.js';
import { collide, inBounds } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x7d3c98, 0x1abc9c, 0xe67e22, 0x95a5a6, 0x922b21];

export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: police ? 0x1a1a1a : color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.15, metalness: 0.7 }));
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff0000, emissiveIntensity: 1.6 }));
    bar.position.set(0, 1.5, -0.2); g.add(bar);
    g.userData.lightbar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    stripe.position.y = 0.72; g.add(stripe);
  } else {
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe9a8, emissiveIntensity: 1.2 }));
    light.position.set(0, 0.62, 2.22); g.add(light);
  }
  return g;
}

export function makeCar(x, z, heading, color, opts = {}) {
  const mesh = makeCarMesh(color, !!opts.police);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  return {
    mesh, x, z, heading, speed: 0, color,
    police: !!opts.police, parked: !!opts.parked, stolen: false,
    target: !!opts.target, // mission target car
    driver: opts.driver || null, // 'traffic' | 'police' | 'player' | null
    ai: null, // traffic waypoint state
    r: 2.4, hp: 100, dead: false,
  };
}

export function makePlayer(scene) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x8e2f4a, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), coat);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, 1.4), dark);
  hair.position.y = 1.78; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), dark); legL.position.set(-0.16, 0.31, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), coat); armL.position.set(-0.4, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  scene.add(g);
  return {
    mesh: g, legL, legR, armL, armR,
    x: 0, z: 8, y: 0, vy: 0, heading: 0, onGround: true,
    speed: 0, walkPhase: 0, hp: 100, inCar: null,
  };
}

// Foot movement: WASD relative to camera yaw. Returns speed.
export function updatePlayer(p, input, camYaw, dt, colliders, cars) {
  if (p.inCar) return 0;
  const run = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
  const max = run ? 9.5 : 4.6;
  let fx = 0, fz = 0;
  if (input.keys['KeyW']) fz -= 1;
  if (input.keys['KeyS']) fz += 1;
  if (input.keys['KeyA']) fx -= 1;
  if (input.keys['KeyD']) fx += 1;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len; fz /= len;
  // rotate input by camera yaw
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  const mx = fx * cos - fz * sin, mz = fx * sin + fz * cos;
  const target = (fx || fz) ? max : 0;
  p.speed = clamp(p.speed + (target - p.speed) * Math.min(1, dt * 8), 0, 10);
  if (p.speed > 0.2) {
    p.heading = angleLerp(p.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    p.x += mx * p.speed * dt; p.z += mz * p.speed * dt;
  }
  // jump
  if (input.keys['Space'] && p.onGround) { p.vy = 7.5; p.onGround = false; }
  if (!p.onGround) {
    p.vy -= 22 * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  }
  // stay in the city + out of buildings
  if (!inBounds(p.x, p.z)) { p.x = clamp(p.x, -118, 165); p.z = clamp(p.z, -118, 118); }
  collide(colliders, p, 0.5);
  // soft push from cars (not the one being entered)
  for (const c of cars) {
    if (c.dead) continue;
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
    if (d < 2.6 && d > 0.01) { p.x = c.x + (dx / d) * 2.6; p.z = c.z + (dz / d) * 2.6; }
  }
  // animate limbs
  p.walkPhase += p.speed * dt * 1.6;
  const sw = Math.sin(p.walkPhase) * clamp(p.speed / 9, 0, 1) * 0.7;
  p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw; p.armR.rotation.x = sw;
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.heading;
  return p.speed;
}

// Car driving: W/S accel & brake/reverse, A/D steer. Simple circle collisions.
export function updateDrive(car, input, dt, colliders, cars, onCrash) {
  const fwd = (input.keys['KeyW'] || input.keys['ArrowUp']) ? 1 : 0;
  const back = (input.keys['KeyS'] || input.keys['ArrowDown']) ? 1 : 0;
  const steer = ((input.keys['KeyA'] || input.keys['ArrowLeft']) ? 1 : 0) - ((input.keys['KeyD'] || input.keys['ArrowRight']) ? 1 : 0);
  const accel = fwd ? 14 : back ? -10 : 0;
  car.speed += accel * dt;
  car.speed *= Math.max(0, 1 - (fwd || back ? 0.25 : 1.4) * dt);
  car.speed = clamp(car.speed, -9, 26);
  if (Math.abs(car.speed) > 0.3) car.heading += steer * 1.9 * dt * clamp(car.speed / 8, -1, 1) * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = nx; car.z = nz;
  if (!inBounds(car.x, car.z)) { car.x = clamp(car.x, -118, 165); car.z = clamp(car.z, -118, 118); car.speed *= 0.4; }
  const now = performance.now();
  const bumped = now - (car._bumpT || 0) > 800;
  if (collide(colliders, car, 2.0)) {
    if (bumped) {
      car._bumpT = now;
      if (Math.abs(car.speed) > 6 && onCrash) onCrash(Math.abs(car.speed));
      car.speed *= -0.25;
    }
  }
  for (const o of cars) {
    if (o === car || o.dead) continue;
    const dx = car.x - o.x, dz = car.z - o.z, d = Math.hypot(dx, dz);
    if (d < 4.4 && d > 0.01) {
      car.x = o.x + (dx / d) * 4.4; car.z = o.z + (dz / d) * 4.4;
      if (now - (car._bumpT || 0) > 800) {
        car._bumpT = now;
        if (Math.abs(car.speed) > 7 && onCrash) onCrash(Math.abs(car.speed));
        car.speed *= 0.4; o.speed = (o.speed || 0) + car.speed * 0.3;
      }
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}
export { CAR_COLORS };
