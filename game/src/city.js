// Port Vesper — procedural harbor city (fresh code, rebuild #3).
// Grid streets, varied buildings, sidewalks, street lights, docks + sea on the
// east side, warehouses and harbor cranes. Also owns the road graph used by
// traffic / police / mission markers.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, PALETTE } from './util.js';

export const BLOCK = 34;        // block pitch (building + street)
export const STREET = 12;       // street width
export const GRID = 7;          // blocks per side (city spans -119..119)
export const HALF = (GRID * BLOCK) / 2; // 119
export const SEA_X = HALF + 26; // sea starts east of the docks

function windowTexture(rng, base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + base.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) for (let x = 5; x < 58; x += 11) {
    const lit = rng() < 0.42;
    g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9be8ff') : '#14181f';
    g.fillRect(x, y, 7, 8);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
}

export function buildCity(scene, rng) {
  const colliders = [];   // {x,z,r} circles + {x,z,hx,hz} boxes
  const roads = [];       // road centre lines for AI: {x,z,axis:'x'|'z'}
  const lamps = [];
  const group = new THREE.Group(); group.name = 'city'; scene.add(group);

  // Ground base
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 160, HALF * 2 + 60),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.9, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(20, -0.05, 0);
  ground.receiveShadow = true; group.add(ground);

  // Streets (dark asphalt strips) + sidewalks
  const asphalt = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.55, metalness: 0.35 });
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 0.85 });
  for (let i = 0; i <= GRID; i++) {
    const p = -HALF + i * BLOCK;
    for (const [w, h, mat, y] of [[STREET, HALF * 2, asphalt, 0], [STREET + 5, HALF * 2, walkMat, -0.02]]) {
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      s1.rotation.x = -Math.PI / 2; s1.position.set(p, y, 0); s1.receiveShadow = true; group.add(s1);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(h, w), mat);
      s2.rotation.x = -Math.PI / 2; s2.position.set(0, y, p); s2.receiveShadow = true; group.add(s2);
    }
    roads.push({ x: p, z: 0, axis: 'z' }, { x: 0, z: p, axis: 'x' });
  }

  // Buildings: one per block cell, varied height / colour / roof sign
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const winTex = PALETTE.building.map((c) => windowTexture(rng, c));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.9 });
  for (let ix = 0; ix < GRID; ix++) for (let iz = 0; iz < GRID; iz++) {
    const cx = -HALF + BLOCK / 2 + ix * BLOCK, cz = -HALF + BLOCK / 2 + iz * BLOCK;
    if (rng() < 0.08) { // plaza / empty lot with a tree cluster
      const tree = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 7),
        new THREE.MeshStandardMaterial({ color: 0x1d4a2a, roughness: 0.9 }));
      tree.position.set(cx, 3, cz); group.add(tree); continue;
    }
    const w = 16 + rng() * 7, d = 16 + rng() * 7, h = 8 + rng() * rng() * 46;
    const ci = Math.floor(rng() * PALETTE.building.length);
    const mat = new THREE.MeshStandardMaterial({ map: winTex[ci], roughness: 0.75, metalness: 0.05 });
    const b = new THREE.Mesh(boxGeo, mat);
    b.scale.set(w, h, d); b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true;
    group.add(b);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.6, d + 0.6); roof.position.set(cx, h + 0.3, cz); group.add(roof);
    if (rng() < 0.35) { // neon roof sign
      const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.neon[Math.floor(rng() * 5)], emissiveIntensity: 2.2 }));
      sign.position.set(cx, h + 1.4, cz - d / 2 - 0.2); group.add(sign);
    }
    colliders.push({ x: cx, z: cz, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
  }

  // Street lights along every road
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc978, emissiveIntensity: 2.5 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (let i = 0; i <= GRID; i++) {
    const p = -HALF + i * BLOCK;
    for (let j = -HALF + 8; j < HALF; j += BLOCK) {
      for (const [x, z] of [[p + STREET / 2 + 1.4, j], [j, p + STREET / 2 + 1.4]]) {
        const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, 3.25, z); group.add(pole);
        const head = new THREE.Mesh(headGeo, lampMat); head.position.set(x, 6.6, z); group.add(head);
        const light = new THREE.PointLight(0xffc978, 14, 26, 1.8); light.position.set(x, 6.4, z);
        if (lamps.length < 8) { group.add(light); lamps.push(light); }
      }
    }
  }

  // ---- Harbor: docks east of the city, sea beyond ----
  const dockMat = new THREE.MeshStandardMaterial({ color: PALETTE.dock, roughness: 0.85 });
  const dock = new THREE.Mesh(new THREE.BoxGeometry(52, 1.2, HALF * 2 + 40), dockMat);
  dock.position.set(HALF + 26, 0.55, 0); dock.receiveShadow = true; group.add(dock);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, HALF * 2 + 220),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.15, metalness: 0.6 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(SEA_X + 130, 0.15, 0); group.add(sea);

  // Warehouses along the dock
  const whMat = new THREE.MeshStandardMaterial({ color: 0x6e5a3a, roughness: 0.8, metalness: 0.2 });
  const whMat2 = new THREE.MeshStandardMaterial({ color: 0x4a5a6e, roughness: 0.8, metalness: 0.2 });
  for (let i = 0; i < 5; i++) {
    const z = -96 + i * 48;
    const wh = new THREE.Mesh(boxGeo, i % 2 ? whMat : whMat2);
    wh.scale.set(20, 10, 26); wh.position.set(HALF + 12, 5, z); wh.castShadow = true; group.add(wh);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 26, 12, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.7, metalness: 0.3 }));
    roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
    roof.scale.set(1, 1, 0.78); roof.position.set(HALF + 12, 10, z); group.add(roof);
    colliders.push({ x: HALF + 12, z, hx: 10.5, hz: 13.5 });
  }
  // Shipping containers (colourful stacks)
  const contCols = [0xb03a2e, 0x2e86c1, 0x28b463, 0xd4ac0d, 0x7d3c98];
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: contCols[i % 5], roughness: 0.7, metalness: 0.3 }));
    const x = HALF + 22 + rng() * 22, z = -HALF + 10 + rng() * (HALF * 2 - 20);
    c.scale.set(6, 2.6, 2.6); c.position.set(x, 1.3 + (rng() < 0.3 ? 2.6 : 0), z);
    c.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2; c.castShadow = true; group.add(c);
    colliders.push({ x, z, hx: 3.4, hz: 3.4 });
  }
  // Harbor cranes (tall, with jib + hook block)
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6, metalness: 0.4 });
  for (const z of [-70, 10, 80]) {
    const cr = new THREE.Group(); cr.position.set(HALF + 40, 0, z);
    const mast = new THREE.Mesh(boxGeo, craneMat); mast.scale.set(3, 34, 3); mast.position.y = 17; mast.castShadow = true; cr.add(mast);
    const jib = new THREE.Mesh(boxGeo, craneMat); jib.scale.set(26, 1.6, 1.6); jib.position.set(-6, 33, 0); cr.add(jib);
    const cab = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x222222 })); cab.scale.set(4, 3, 3.4); cab.position.set(2, 30, 0); cr.add(cab);
    const hook = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x111111 })); hook.scale.set(1.6, 1.6, 1.6); hook.position.set(-16, 22, 0); cr.add(hook);
    group.add(cr);
    colliders.push({ x: HALF + 40, z, hx: 2, hz: 2 });
  }
  // Moored boats
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5 });
  for (const z of [-40, 45]) {
    const boat = new THREE.Group(); boat.position.set(SEA_X + 22, 0.4, z);
    const hull = new THREE.Mesh(boxGeo, boatMat); hull.scale.set(6, 2, 18); hull.position.y = 1; boat.add(hull);
    const cab2 = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2e86c1 })); cab2.scale.set(4, 2.4, 5); cab2.position.set(0, 3, -2); boat.add(cab2);
    group.add(boat);
  }
  // Rain: one Points cloud recycled in the animate loop
  const rainCount = 900;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = -HALF + rng() * (HALF * 2 + 80);
    rainPos[i * 3 + 1] = rng() * 40;
    rainPos[i * 3 + 2] = -HALF + rng() * (HALF * 2);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fc4ff, size: 0.28, transparent: true, opacity: 0.55 }));
  rain.name = 'rain'; scene.add(rain);

  return { group, colliders, roads, rain, rainCount };
}

// Circle-vs-box collision resolve: push (x,z) out of any collider box.
// Returns true when a push happened. `r` is the mover radius.
export function collide(colliders, pos, r) {
  let hit = false;
  for (const c of colliders) {
    if (c.hx !== undefined) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const px = c.hx + r - Math.abs(dx), pz = c.hz + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        hit = true;
        if (px < pz) pos.x = c.x + Math.sign(dx || 1) * (c.hx + r);
        else pos.z = c.z + Math.sign(dz || 1) * (c.hz + r);
      }
    } else if (c.r !== undefined) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.r + r && d > 0.001) { pos.x = c.x + (dx / d) * (c.r + r); pos.z = c.z + (dz / d) * (c.r + r); hit = true; }
    }
  }
  return hit;
}
export function inBounds(x, z) {
  return x > -HALF - 4 && x < SEA_X + 22 && z > -HALF - 4 && z < HALF + 4;
}
export function nearestRoadPoint(roads, x, z) {
  // Snap to the closest street centre line.
  let best = null, bd = Infinity;
  for (const r of roads) {
    const d = r.axis === 'x' ? Math.abs(z - r.z) : Math.abs(x - r.x);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
export function randomRoadPoint(rng, roads) {
  const r = roads[Math.floor(rng() * roads.length)];
  const t = -HALF + rng() * HALF * 2;
  return r.axis === 'x' ? { x: t, z: r.z } : { x: r.x, z: t };
}
