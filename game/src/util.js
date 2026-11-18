// Port Vesper — small shared helpers (fresh code, written for rebuild #3).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export const PALETTE = {
  asphalt: 0x2e323c, sidewalk: 0x3a3f47, ground: 0x1a1d24,
  sea: 0x0a2e3f, dock: 0x4a4238, building: [0x5a5f6e, 0x6e5a4a, 0x4a5a6e, 0x715a6e, 0x5a6e5a, 0x7a6a3a],
  neon: [0xff2d78, 0x00e5ff, 0xffc400, 0x7cff00, 0xff6a00],
};
