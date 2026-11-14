// The living room: a real box of walls with a window hole in the back wall, so the sun
// truly shines through it and draws its shape on the floor. Furniture is built from
// boxes, turned shapes and soft blobs; every surface is painted by code.
//
// Room axes: x left to right, y up, z toward the camera. The floor is y = 0, the back
// wall's face is z = -2.2, the right wall's face is x = 2.5.
import * as THREE from 'three/webgpu';
import { paint, shadowUniforms, lookUniforms } from './materials.mjs';
import { woodFloor, slab } from './sets.mjs';
import { softMesh } from './soft.mjs';
import { rnd } from './motion.mjs';
import {
  float, vec2, vec3, color, mix, smoothstep, fract, floor, abs, sin, length, max, min, step, positionWorld, positionLocal,
  mx_noise_float, mx_fractal_noise_float, uniform, atan, dot, clamp as clampNode,
  uv, attribute, cross, normalize, transformNormalToView, cameraPosition,
} from 'three/tsl';

export const ROOM = {
  back: -2.2, right: 2.5, left: -4.6, top: 3.2,
  win: { x0: -3.6, x1: -1.2, y0: 0.32, y1: 2.9 },
  // tall windows in the left wall, out of sight: a low sun from the front left (the golden hour) comes through them
  // and lays broad bands across the floor and up the back wall
  side: { y0: 0.35, y1: 3.05, z: [[-1.5, -0.4], [0.05, 1.15], [1.6, 2.7], [3.15, 4.25], [4.7, 5.8]] },
  sofa: { x: 0.25, z: -1.66, seatY: 0.43 },
  rug: { x: 0.4, z: -0.1, r: 1.5 },
};

/** Where a two-legged actor whose legs are `leg` long sits on the sofa from a mark on or just in front of it: { on:
 * [x, y, z] under its hips, front: [x, z] where it stands first }, or null away from the sofa. */
export function sofaSeat(x, z, leg) {
  const S = ROOM.sofa;
  if (Math.abs(x - S.x) > 0.95 || z < S.z - 0.45 || z > S.z + 1.2) return null;
  const cx = Math.min(S.x + 0.6, Math.max(S.x - 0.6, x)), on = Math.max(S.z + 0.05, S.z + 0.48 - 0.5 * leg);
  return { on: [cx, S.seatY + 0.01, on], front: [cx, on + 0.5 * leg + 0.15] };
}

const box = (w, h, d, mat, pos, shadow = true) => { const m = slab(w, h, d, mat, pos); m.castShadow = shadow; return m; };
// a box given by its two corners
const span = (x0, x1, y0, y1, z0, z1, mat, shadow = true) => box(x1 - x0, y1 - y0, z1 - z0, mat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], shadow);

// Painted wall: a soft wash, long brush marks, and a faint wallpaper of small motifs.
export function wallPaint(base = 0xeedcb4) {
  return paint({
    color: base, mottle: 0, scatter: 0, rim: 0, brush: 0.02,
    pattern: (_p, c) => {
      const p = positionWorld;
      const h = p.x.add(p.z);                                   // runs along either wall
      const wash = mx_fractal_noise_float(vec3(h.mul(0.55), p.y.mul(0.55), 1.7), 4, 2.0, 0.55).mul(0.5).add(0.5);
      const strokes = mx_noise_float(vec3(h.mul(11), p.y.mul(1.3), 4.2)).mul(0.5).add(0.5);
      const fine = mx_noise_float(vec3(h.mul(46), p.y.mul(46), 2.2)).mul(0.5).add(0.5);
      // wallpaper: small diamonds on a staggered grid, barely darker than the wall
      const g = vec2(h.div(0.3), p.y.div(0.3));
      const row = floor(g.y);
      const q = fract(vec2(g.x.add(row.mul(0.5)), g.y)).sub(0.5);
      const diamond = smoothstep(0.17, 0.13, abs(q.x).add(abs(q.y)));
      let col = c.mul(mix(float(0.86), float(1.08), wash)).mul(mix(float(0.965), float(1.03), strokes)).mul(mix(float(0.975), float(1.025), fine));
      col = col.mul(vec3(mix(float(0.96), float(1.03), wash), 1.0, mix(float(1.07), float(0.95), wash)));
      col = mix(col, col.mul(vec3(0.86, 0.8, 0.78)), diamond.mul(0.5));
      // a little darker toward the ceiling and the floor, as a painter would grade a wall
      return col.mul(mix(float(0.78), float(1.0), smoothstep(3.3, 1.8, p.y)));
    },
  });
}

// Painted boards (the panelling under the rail, window frame, picture frame).
export function boards(base, { width = 0.22, along = 'h' } = {}) {
  return paint({
    color: base, mottle: 0, scatter: 0, rim: 0.4, brush: 0.03,
    pattern: (_p, c) => {
      const p = positionWorld;
      const h = along === 'h' ? p.x.add(p.z) : p.y;
      const u = h.div(width);
      const tone = fract(sin(floor(u).mul(91.7)).mul(43758.5453));
      const groove = smoothstep(0.0, 0.035, abs(fract(u).sub(0.5)).mul(-1).add(0.5));
      const wash = mx_fractal_noise_float(vec3(h.mul(1.4), p.y.mul(1.4), 9.0), 3, 2.0, 0.5).mul(0.5).add(0.5);
      const grain = mx_noise_float(vec3(h.mul(40), p.y.mul(3), 5)).mul(0.5).add(0.5);
      return c.mul(mix(float(0.93), float(1.05), tone)).mul(mix(float(0.9), float(1.07), wash)).mul(mix(float(0.97), float(1.03), grain)).mul(mix(float(0.72), float(1.0), groove));
    },
  });
}

// A round woven rug: rings of colour, a wavy border, thread noise.
function rugPaint(cx, cz, R) {
  return paint({
    color: 0xffffff, mottle: 0, scatter: 0.1, rim: 0.2, brush: 0.05, brushScale: 60,
    pattern: () => {
      const p = positionWorld;
      const d = vec2(p.x.sub(cx), p.z.sub(cz));
      const r = length(d).div(R);
      const ang = atan(d.y, d.x);
      const cream = color(0xe6d0b0), terra = color(0xc9654a), teal = color(0x3f8c8e), mustard = color(0xdba23e), plum = color(0x7b4a68);
      const wav = sin(ang.mul(14)).mul(0.012);
      const rr = r.add(wav);
      let c = cream;
      c = mix(c, terra, smoothstep(0.2, 0.215, rr).mul(smoothstep(0.305, 0.29, rr)));
      c = mix(c, mustard, smoothstep(0.34, 0.35, rr).mul(smoothstep(0.38, 0.37, rr)));
      c = mix(c, teal, smoothstep(0.55, 0.565, rr).mul(smoothstep(0.71, 0.695, rr)));
      // a ring of dots inside the teal band
      const dots = smoothstep(0.55, 0.3, length(vec2(fract(ang.mul(22 / 6.2832)).sub(0.5), r.sub(0.63).mul(11))));
      c = mix(c, cream, dots.mul(0.9));
      c = mix(c, plum, smoothstep(0.86, 0.875, rr).mul(smoothstep(0.945, 0.93, rr)));
      c = mix(c, terra, smoothstep(0.09, 0.075, rr));
      // woven threads: fine rings and spokes
      const thread = mx_noise_float(vec3(r.mul(150), ang.mul(40), 1)).mul(0.5).add(0.5);
      const cloud = mx_fractal_noise_float(vec3(p.x.mul(1.6), p.z.mul(1.6), 7.0), 3, 2.0, 0.5).mul(0.5).add(0.5);
      return c.mul(mix(float(0.9), float(1.06), thread)).mul(mix(float(0.88), float(1.08), cloud));
    },
  });
}

// The little painting on the wall: a hill, a sun, a tree. u, v run 0..1 across the canvas.
function picturePaint(x0, y0, w, h) {
  return paint({
    color: 0xffffff, mottle: 0, scatter: 0, rim: 0, brush: 0.02,
    pattern: () => {
      const p = positionWorld;
      const u = p.x.sub(x0).div(w), v = p.y.sub(y0).div(h);
      let c = mix(color(0xf3c98a), color(0x8fb9c9), smoothstep(0.35, 1.0, v));                  // sky
      c = mix(c, color(0xfff0c0), smoothstep(0.13, 0.11, length(vec2(u.sub(0.68).mul(w / h), v.sub(0.66)))));   // sun
      const hill1 = v.sub(float(0.42).add(sin(u.mul(5.0).add(1.0)).mul(0.07)));
      c = mix(c, color(0x6f9a78), smoothstep(0.012, -0.012, hill1));
      const hill2 = v.sub(float(0.28).add(sin(u.mul(3.2).add(4.0)).mul(0.09)));
      c = mix(c, color(0x3f7466), smoothstep(0.012, -0.012, hill2));
      c = mix(c, color(0x2c4d4a), smoothstep(0.1, 0.085, length(vec2(u.sub(0.27).mul(w / h), v.sub(0.5).mul(0.75)))));  // tree crown
      c = mix(c, color(0x4a3328), smoothstep(0.012, 0.006, abs(u.sub(0.27))).mul(step(v, 0.45)).mul(step(0.2, v)));        // trunk
      const dab = mx_noise_float(vec3(u.mul(30), v.mul(22), 3)).mul(0.5).add(0.5);
      return c.mul(mix(float(0.88), float(1.08), dab));
    },
  });
}

// The garden seen through the window, painted by formula on three flat cards at
// different distances (so they slide against each other when the camera moves):
// sky, clouds and far hills; a rolling field with round trees; a hedge and one near tree.
// They give off their own light (it is day out there) and are lit from behind, as the
// sun is on their far side: dark masses with bright upper edges.
function outside(scene, outdoor) {
  const n1 = (x, y, z = 0) => mx_noise_float(vec3(x, y, z)).mul(0.5).add(0.5);
  const card = (z, w, h, y, colorNode, opacityNode) => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = colorNode.mul(outdoor);      // as bright as the hour makes the world outside (the light's `outdoor`)
    if (opacityNode) { m.opacityNode = opacityNode; m.alphaTest = 0.5; }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.set(-3, y, z); scene.add(mesh);
  };
  const p = positionWorld, x = p.x, y = p.y;
  // far: sky, clouds, hazy hills
  {
    const up = smoothstep(-1, 16, y);
    let c = mix(color(0xffe3a8).mul(1.25), color(0x9fd0ea).mul(1.05), up);
    c = mix(c, color(0xfff0c8).mul(1.35), smoothstep(34, 6, length(vec2(x.add(34), y.sub(4).mul(2.2)))));   // the bright part of the sky, toward the sun
    const cl = mx_fractal_noise_float(vec3(x.mul(0.045), y.mul(0.17), 5.0), 4, 2.0, 0.5).mul(0.5).add(0.5);
    c = mix(c, color(0xffe9cf).mul(1.3), smoothstep(0.52, 0.66, cl).mul(smoothstep(3, 9, y)).mul(0.85));
    const ridge = float(1.2).add(sin(x.mul(0.07).add(1.0)).mul(1.3)).add(n1(x.mul(0.2), 2.0).mul(1.0));
    c = mix(c, mix(color(0x8fb7b0), color(0xb6d3bd), smoothstep(-2, 3, y)), smoothstep(0.12, -0.12, y.sub(ridge)));
    card(-46, 120, 60, 12, c);
  }
  // middle: a field that rolls, with round trees standing on it
  {
    const hill = (xx) => float(0.55).add(sin(xx.mul(0.17).add(2.2)).mul(0.7)).add(sin(xx.mul(0.43).add(0.4)).mul(0.2));
    const h = hill(x), d = y.sub(h);
    let c = mix(color(0x4f8f55), color(0xa9cf6a), smoothstep(-2.2, 0.0, d));          // lighter toward the lit crest
    c = c.mul(mix(float(0.9), float(1.08), n1(x.mul(0.9), y.mul(2.5), 1.0)));
    let a = smoothstep(0.03, -0.03, d);
    for (const [tx, r] of [[-13.5, 1.1], [-10.4, 0.8], [-8.9, 1.25], [-4.6, 0.75], [0.4, 1.1], [3.2, 0.85]]) {
      const ty = 0.55 + Math.sin(tx * 0.17 + 2.2) * 0.7 + Math.sin(tx * 0.43 + 0.4) * 0.2;
      const q = vec2(x.sub(tx), y.sub(ty + r * 1.25));
      const wob = n1(x.mul(2.2), y.mul(2.2), tx).sub(0.5).mul(0.28 * r);
      const crown = smoothstep(0.03, -0.03, length(q.mul(vec2(1.0, 0.92))).sub(r).add(wob));
      const trunk = smoothstep(0.02, -0.02, abs(x.sub(tx)).sub(0.07 * r)).mul(step(y, ty + r)).mul(step(ty - 0.1, y));
      const lit = smoothstep(-0.2, 0.9, q.y.div(r).sub(q.x.div(r).mul(0.6)));          // sun from the upper left, behind
      const tc = mix(color(0x2f6248), color(0x8fbf5e), lit.mul(0.8)).mul(mix(float(0.88), float(1.1), n1(x.mul(3.5), y.mul(3.5), 4.0)));
      c = mix(c, color(0x5a4034), trunk); c = mix(c, tc, crown);
      a = max(a, max(crown, trunk));
    }
    card(-17, 60, 24, 4, c, a);
  }
  // near: a clipped hedge with flowers, and the tree in the garden
  {
    const top = float(0.62).add(n1(x.mul(2.6), 3.0).mul(0.14)).add(n1(x.mul(9.0), 7.0).mul(0.05));
    const d = y.sub(top);
    let c = mix(color(0x2a5a44), color(0x6fa85a), smoothstep(-0.5, 0.0, d)).mul(mix(float(0.85), float(1.1), n1(x.mul(7), y.mul(7), 2.0)));
    const cell = vec2(x.mul(5.5), y.mul(5.5)), id = floor(cell), f = fract(cell).sub(0.5);
    const rnd = fract(sin(dot(id, vec2(127.1, 311.7))).mul(43758.5453));
    const flower = smoothstep(0.17, 0.11, length(f.add(vec2(rnd.sub(0.5).mul(0.5), fract(rnd.mul(7.3)).sub(0.5).mul(0.5))))).mul(step(0.62, rnd)).mul(step(d, -0.06));
    c = mix(c, mix(color(0xf2a6b8), color(0xf6d98a), step(0.8, rnd)).mul(0.9), flower);
    let a = smoothstep(0.012, -0.012, d);
    const tx = -4.55, base = 0.8;
    const trunk = smoothstep(0.012, -0.012, abs(x.sub(tx).sub(y.sub(1.6).mul(0.06))).sub(float(0.085).sub(y.mul(0.012)))).mul(step(y, 2.8));
    c = mix(c, color(0x4a3328).mul(mix(float(0.85), float(1.2), n1(x.mul(30), y.mul(4), 6.0))), trunk.mul(step(top, y)));
    let crown = float(0);
    for (const [cx, cy, r] of [[-4.7, 3.0, 0.7], [-4.0, 2.8, 0.58], [-5.35, 2.75, 0.55], [-4.4, 3.55, 0.6], [-3.6, 3.3, 0.45], [-5.1, 3.45, 0.5]]) {
      const wob = n1(x.mul(4.5), y.mul(4.5), cx).sub(0.5).mul(0.22);
      crown = max(crown, smoothstep(0.015, -0.015, length(vec2(x.sub(cx), y.sub(cy))).sub(r).add(wob)));
    }
    const leaf = n1(x.mul(6), y.mul(6), 8.0);
    const cc = mix(color(0x2c5f48), color(0x86b85a), smoothstep(0.35, 0.8, leaf.mul(0.6).add(smoothstep(2.6, 4.2, y).mul(0.5))));
    c = mix(c, cc, crown);
    a = max(a, max(trunk, crown));
    card(-6.2, 16, 9, 3.4, c, a);
  }
  // the lawn
  const lawn = new THREE.MeshBasicNodeMaterial();
  lawn.colorNode = mix(color(0x6fa85a), color(0xa9cf6a), n1(p.x.mul(0.8), p.z.mul(0.8), 1.0)).mul(outdoor);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), lawn); g.rotation.x = -Math.PI / 2; g.position.set(-3, -0.02, -27.3); scene.add(g);
}

// Small furniture built from turned shapes and blobs.
function sideTable() {
  const g = new THREE.Group();
  const wood = paint({ color: 0x8a5a3a, mottle: 0.12, mottleScale: 9, rim: 0.8 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 48), wood, 0, 0.56, 0);
  add(new THREE.CylinderGeometry(0.25, 0.24, 0.035, 48), wood, 0, 0.53, 0);
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; const leg = add(new THREE.CylinderGeometry(0.02, 0.014, 0.54, 12), wood, Math.cos(a) * 0.17, 0.265, Math.sin(a) * 0.17); leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); }
  // a jug with three tulips
  g.add(softMesh([
    { type: 'ell', c: [0, 0.66, 0], r: [0.075, 0.09, 0.075], k: 0.02 },
    { type: 'cone', a: [0, 0.72, 0], b: [0, 0.8, 0], ra: 0.04, rb: 0.05, k: 0.03 },
    { op: 'sub', type: 'cone', a: [0, 0.74, 0], b: [0, 0.9, 0], ra: 0.03, rb: 0.045, k: 0.01 },
    { type: 'torus', c: [0.085, 0.68, 0], R: 0.045, r: 0.012, rot: [Math.PI / 2, 0, 0], k: 0.01 },
  ], { h: 0.006, material: { color: 0xe9e2d4, mottle: 0.06, scatter: 0.2, rim: 1.2, pattern: (p, c) => mix(c, color(0x3f6f9e), smoothstep(0.012, 0.006, abs(p.y.sub(0.665))).add(smoothstep(0.006, 0.003, abs(p.y.sub(0.7)))).min(1)) } }));
  const stems = [], heads = [];
  for (const [dx, dz, hgt, lean] of [[-0.02, 0.01, 1.02, -0.07], [0.02, -0.01, 1.1, 0.03], [0.0, 0.02, 0.96, 0.1]]) {
    stems.push({ type: 'cone', a: [dx, 0.76, dz], b: [dx + lean, hgt, dz], ra: 0.006, rb: 0.005, k: 0.004 });
    heads.push({ type: 'ell', c: [dx + lean * 1.08, hgt + 0.03, dz], r: [0.03, 0.042, 0.03], k: 0.006 });
    stems.push({ type: 'ell', c: [dx + lean * 0.4 + 0.035, 0.86, dz + 0.01], r: [0.045, 0.012, 0.018], rot: [0, 0, 0.9], k: 0.004 });
  }
  g.add(softMesh(stems, { h: 0.004, material: { color: 0x5f9a4e, mottle: 0.08, scatter: 0.5, scatterColor: 0xd8ff7a } }));
  g.add(softMesh(heads, { h: 0.004, material: { color: 0xf2647a, mottle: 0.08, scatter: 0.6, scatterColor: 0xffb08a } }));
  return g;
}

// A big-leafed plant in a pot.
function plant() {
  const g = new THREE.Group();
  g.add(softMesh([
    { type: 'cone', a: [0, 0.05, 0], b: [0, 0.34, 0], ra: 0.13, rb: 0.17, k: 0.02 },
    { type: 'torus', c: [0, 0.35, 0], R: 0.17, r: 0.022, k: 0.01 },
    { op: 'clip', n: [0, -1, 0], d: 0 },
  ], { h: 0.009, material: { color: 0xc46f4a, mottle: 0.14, mottleScale: 8, scatter: 0.2 } }));
  const leaves = [], stalks = [];
  const L = [[0.0, 1.5, 0.1, 0.5, 0.0], [1.1, 1.25, 0.34, 0.42, 0.5], [2.3, 1.38, 0.3, 0.46, 0.4], [3.4, 1.12, 0.4, 0.4, 0.7], [4.4, 1.3, 0.36, 0.44, 0.55], [5.4, 0.98, 0.42, 0.36, 0.8], [0.6, 0.86, 0.38, 0.32, 0.9], [2.9, 0.8, 0.4, 0.3, 0.95]];
  for (const [az, top, out, len, droop] of L) {
    const dx = Math.cos(az), dz = Math.sin(az);
    const tip = [dx * out, top, dz * out];
    stalks.push({ type: 'cone', a: [dx * 0.03, 0.34, dz * 0.03], b: [tip[0] * 0.75, top - len * 0.35, tip[2] * 0.75], ra: 0.012, rb: 0.008, k: 0.01 });
    leaves.push({ type: 'ell', c: [tip[0], top - 0.1 * droop, tip[2]], r: [len * 0.36, 0.014, len * 0.5], rot: [droop * 0.9 * dz + 0.2, -az + Math.PI / 2, -droop * 0.9 * dx], k: 0.008 });
  }
  g.add(softMesh([...stalks, ...leaves], { h: 0.008, material: { color: 0x3f7f55, mottle: 0.14, mottleScale: 10, scatter: 0.5, scatterColor: 0xc8ff70, rim: 1.4, through: 0.6, throughColor: 0xd8ff8a,
    pattern: (p, c) => c.mul(mix(float(0.8), float(1.12), smoothstep(0.3, 0.7, mx_noise_float(p.mul(vec3(9, 2.5, 9))).mul(0.5).add(0.5)))) } }));
  return g;
}

// A shelf of books on the wall.
function shelf() {
  const g = new THREE.Group();
  const wood = paint({ color: 0x7a5238, mottle: 0.1, rim: 0.6 });
  g.add(box(1.1, 0.035, 0.2, wood, [0, 0, 0.1]));
  for (const x of [-0.42, 0.42]) g.add(box(0.03, 0.12, 0.16, wood, [x, -0.07, 0.085]));
  const cols = [0xc9654a, 0x3f8c8e, 0xdba23e, 0x7b4a68, 0xe9dcc4, 0x4f6f9e, 0xb5844f, 0x86a876];
  let x = -0.5;
  for (let i = 0; i < 9; i++) {
    const w = 0.035 + 0.03 * rnd(i, 21), h = 0.2 + 0.1 * rnd(i, 22), lean = i === 5 ? 0.22 : 0;
    const b = box(w, h, 0.14, paint({ color: cols[Math.floor(rnd(i, 23) * cols.length)], mottle: 0.1, mottleScale: 20, rim: 0.5 }), [x + w / 2 + lean * h * 0.5, 0.0175 + h / 2 * Math.cos(lean), 0.09]);
    b.rotation.z = -lean; g.add(b);
    x += w + 0.004 + lean * h;
    if (x > 0.18) break;
  }
  // a little pot at the end of the shelf
  g.add(softMesh([{ type: 'cone', a: [0.36, 0.03, 0.1], b: [0.36, 0.12, 0.1], ra: 0.045, rb: 0.06, k: 0.01 }, { type: 'ell', c: [0.36, 0.2, 0.1], r: [0.085, 0.075, 0.08], k: 0.03 }, { type: 'ell', c: [0.31, 0.25, 0.12], r: [0.05, 0.05, 0.05], k: 0.03 }],
    { h: 0.006, material: { color: 0x5f9a5e, mottle: 0.16, mottleScale: 14, scatter: 0.4, pattern: (p, c) => mix(color(0xd9b08a), c, smoothstep(0.125, 0.14, p.y)) } }));
  return g;
}

function sofa() {
  const g = new THREE.Group();
  const W = 1.06, D = 0.44;                           // half width, half depth
  const body = [
    { type: 'box', c: [0, 0.2, 0], r: [W, 0.13, D], round: 0.07, k: 0.02 },                                  // base
    { type: 'box', c: [0, 0.56, -D + 0.1], r: [W, 0.33, 0.12], round: 0.11, rot: [-0.12, 0, 0], k: 0.05 },   // back
    { type: 'box', c: [-W + 0.02, 0.4, 0.02], r: [0.13, 0.24, D + 0.02], round: 0.12, k: 0.05 },             // arms
    { type: 'box', c: [W - 0.02, 0.4, 0.02], r: [0.13, 0.24, D + 0.02], round: 0.12, k: 0.05 },
    { type: 'cone', a: [-W + 0.02, 0.62, -D + 0.1], b: [-W + 0.02, 0.62, D], ra: 0.135, k: 0.04 },           // rolled arm tops
    { type: 'cone', a: [W - 0.02, 0.62, -D + 0.1], b: [W - 0.02, 0.62, D], ra: 0.135, k: 0.04 },
  ];
  const cushions = [];
  for (const s of [-1, 1]) {
    cushions.push({ type: 'box', c: [s * 0.455, 0.365, 0.07], r: [0.445, 0.075, 0.385], round: 0.07, k: 0.012 });        // seat
    cushions.push({ type: 'box', c: [s * 0.455, 0.67, -D + 0.25], r: [0.44, 0.235, 0.085], round: 0.085, rot: [-0.2, 0, 0], k: 0.012 }); // back
  }
  const teal = { color: 0x3c8f92, scatter: 0.2, mottle: 0.1, mottleScale: 4, brush: 0.07, brushScale: 30 };
  g.add(softMesh(body, { h: 0.014, material: { ...teal, color: 0x35868a } }));
  g.add(softMesh(cushions, { h: 0.012, material: teal }));
  // a loose cushion, plump in the middle and thin at the seams, in a striped cream cloth, leaning in the middle
  // of the seat (a plain slab of colour at the right end read as part of the man's hip where he stands in front of it), and four turned feet
  const rot = [-0.3, 0.25, 0.08], c = [0.2, 0.64, -0.04];
  g.add(softMesh([{ type: 'box', c, r: [0.19, 0.18, 0.025], round: 0.025, rot, k: 0.01 }, { type: 'ell', c, r: [0.16, 0.15, 0.075], rot, k: 0.06 }], { h: 0.008, material: { color: 0xf1e2c8, mottle: 0.08, mottleScale: 9, scatter: 0.3,
    pattern: (p, base) => { const u = fract(p.y.mul(9).add(p.x.mul(3))); return mix(mix(base, color(0xc8603f), smoothstep(0.16, 0.2, u).mul(smoothstep(0.42, 0.38, u))), color(0x3f8c8e), smoothstep(0.62, 0.65, u).mul(smoothstep(0.74, 0.71, u))); } } }));
  const wood = paint({ color: 0x6b4630, mottle: 0.1 });
  for (const [x, z] of [[-W + 0.1, D - 0.08], [W - 0.1, D - 0.08], [-W + 0.1, -D + 0.1], [W - 0.1, -D + 0.1]]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.09, 20), wood); f.position.set(x, 0.045, z); f.castShadow = f.receiveShadow = true; g.add(f);
  }
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const brass = paint({ color: 0xa9813f, mottle: 0.08, rim: 1.6 });
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.035, 48), brass, 0.0175);
  add(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 16), brass, 0.78);
  add(new THREE.SphereGeometry(0.03, 20, 14), brass, 0.9);
  // the shade is turned from its profile; the lamp is off, so it is only lit by the room
  const pts = [[0.15, 0.16], [0.17, 0.155], [0.275, -0.16], [0.26, -0.165]].map(([r, y]) => new THREE.Vector2(r, y));
  const shade = add(new THREE.LatheGeometry(pts, 64), paint({ color: 0xd8c2a6, mottle: 0.06, scatter: 0.2, side: THREE.DoubleSide, through: 0.6,
    pattern: (_p, c) => c.mul(mix(float(0.93), float(1.04), smoothstep(0.35, 0.5, abs(fract(atan(positionLocal.z, positionLocal.x).mul(28 / 6.2832)).sub(0.5))))) }), 1.6);
  shade.castShadow = true;
  return g;
}

// garden: false leaves out the painted garden behind the window (a place with a real one: home/home.mjs). door
// { z0, z1, h }: a doorway in the right wall (the wall, its panelling, rail and skirting stop at its sides; the wall
// closes over it at h).
export function buildRoom(stage, { garden = true, door = null } = {}) {
  const { scene } = stage;
  const R = ROOM, W = R.win;
  const set = new THREE.Group(); set.name = 'room'; scene.add(set);
  // a piece along the right wall, from z0 to the room's end, round the doorway if there is one
  const right = (x0, x1, y0, y1, z0, mat) => {
    if (!door) return set.add(span(x0, x1, y0, y1, z0, 9.5, mat));
    set.add(span(x0, x1, y0, y1, z0, door.z0, mat), span(x0, x1, y0, y1, door.z1, 9.5, mat));
    if (y1 > door.h) set.add(span(x0, x1, door.h, y1, door.z0, door.z1, mat));
  };
  const wall = wallPaint(), trim = paint({ color: 0xf5ecdc, mottle: 0.05, rim: 0.5 }), panel = boards(0x9db09a), dark = paint({ color: 0x5a3d2c, mottle: 0.1 });
  scene.background = new THREE.Color(0x30283a);

  // floor, ceiling
  set.add(span(R.left - 0.2, R.right + 0.2, -0.2, 0, R.back - 0.2, 9.5, woodFloor({ color: 0xc9935f, board: 0.17 })));
  set.add(span(R.left - 0.2, R.right + 0.2, R.top, R.top + 0.2, R.back - 0.2, 9.5, paint({ color: 0xd8ccbc, mottle: 0.05, rim: 0 })));
  // back wall: four pieces round the window hole
  const zb0 = R.back - 0.2, zb1 = R.back;
  set.add(span(R.left - 0.2, W.x0, 0, R.top, zb0, zb1, wall));
  set.add(span(W.x1, R.right + 0.2, 0, R.top, zb0, zb1, wall));
  set.add(span(W.x0, W.x1, 0, W.y0, zb0, zb1, wall));
  set.add(span(W.x0, W.x1, W.y1, R.top, zb0, zb1, wall));
  // side walls; the left one (out of sight) has the tall windows, each with a cross of glazing bars whose shadows
  // fall inside the bands of sun
  right(R.right, R.right + 0.2, 0, R.top, zb0, wall);
  const S = R.side, xl0 = R.left - 0.2, xl1 = R.left;
  let zl = zb0;
  for (const [z0, z1] of S.z) {
    set.add(span(xl0, xl1, 0, R.top, zl, z0, wall));
    set.add(span(xl0, xl1, 0, S.y0, z0, z1, wall)); set.add(span(xl0, xl1, S.y1, R.top, z0, z1, wall));
    set.add(span(xl0 + 0.08, xl0 + 0.12, S.y0, S.y1, (z0 + z1) / 2 - 0.025, (z0 + z1) / 2 + 0.025, trim));
    for (const f of [1 / 3, 2 / 3]) { const y = S.y0 + (S.y1 - S.y0) * f; set.add(span(xl0 + 0.08, xl0 + 0.12, y - 0.025, y + 0.025, z0, z1, trim)); }
    zl = z1;
  }
  set.add(span(xl0, xl1, 0, R.top, zl, 9.5, wall));

  // panelling under a rail, on both visible walls
  const ph = 0.92, pt = 0.025;
  set.add(span(R.left, W.x0 - 0.07, 0, ph, zb1, zb1 + pt, panel));
  set.add(span(W.x1 + 0.07, R.right, 0, ph, zb1, zb1 + pt, panel));
  set.add(span(W.x0 - 0.07, W.x1 + 0.07, 0, W.y0 - 0.06, zb1, zb1 + pt, panel));
  right(R.right - pt, R.right, 0, ph, zb1, panel);
  const rail = (x0, x1, z0, z1) => set.add(span(x0, x1, ph, ph + 0.05, z0, z1, trim));
  rail(R.left, W.x0 - 0.07, zb1, zb1 + 0.045); rail(W.x1 + 0.07, R.right, zb1, zb1 + 0.045); right(R.right - 0.045, R.right, ph, ph + 0.05, zb1, trim);
  const skirt = (x0, x1, z0, z1) => set.add(span(x0, x1, 0, 0.11, z0, z1, trim));
  skirt(R.left, R.right, zb1, zb1 + 0.04); right(R.right - 0.04, R.right, 0, 0.11, zb1, trim);
  // a moulding where the walls meet the ceiling
  set.add(span(R.left, R.right, R.top - 0.09, R.top, zb1, zb1 + 0.06, trim));
  set.add(span(R.right - 0.06, R.right, R.top - 0.09, R.top, zb1, 9.5, trim));

  // window: frame, sill, glazing bars (their shadows fall into the patch of sun)
  const fz0 = zb0 + 0.04, fz1 = zb1 + 0.03, fw = 0.075;
  set.add(span(W.x0 - 0.02, W.x0 + fw, W.y0, W.y1, fz0, fz1, trim));
  set.add(span(W.x1 - fw, W.x1 + 0.02, W.y0, W.y1, fz0, fz1, trim));
  set.add(span(W.x0 - 0.02, W.x1 + 0.02, W.y1 - fw, W.y1 + 0.02, fz0, fz1, trim));
  set.add(span(W.x0 - 0.02, W.x1 + 0.02, W.y0 - 0.02, W.y0 + fw, fz0, fz1, trim));
  set.add(span(W.x0 - 0.09, W.x1 + 0.09, W.y0 - 0.06, W.y0 - 0.015, zb0 + 0.02, zb1 + 0.13, trim));          // sill
  const bz0 = zb0 + 0.09, bz1 = zb0 + 0.14, bw = 0.02, mx = (W.x0 + W.x1) / 2;
  set.add(span(mx - bw, mx + bw, W.y0, W.y1, bz0, bz1, trim));
  for (const f of [1 / 3, 2 / 3]) { const y = W.y0 + (W.y1 - W.y0) * f; set.add(span(W.x0, W.x1, y - bw, y + bw, bz0, bz1, trim)); }
  if (garden) outside(scene, stage.look.outdoor);

  // picture
  const px = 0.25, py = 1.92, pw = 0.98, phh = 0.7;
  set.add(span(px - pw / 2, px + pw / 2, py - phh / 2, py + phh / 2, zb1, zb1 + 0.035, dark));
  set.add(span(px - pw / 2 + 0.055, px + pw / 2 - 0.055, py - phh / 2 + 0.055, py + phh / 2 - 0.055, zb1 + 0.03, zb1 + 0.04, picturePaint(px - pw / 2 + 0.055, py - phh / 2 + 0.055, pw - 0.11, phh - 0.11), false));

  // rug
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(R.rug.r, R.rug.r, 0.014, 128), rugPaint(R.rug.x, R.rug.z, R.rug.r));
  rug.position.set(R.rug.x, 0.007, R.rug.z); rug.receiveShadow = true; rug.castShadow = false; set.add(rug);

  const sf = sofa(); sf.position.set(R.sofa.x, 0, R.sofa.z); set.add(sf);
  const lp = lamp(); lp.position.set(1.72, 0, -1.78); set.add(lp);
  const pl = plant(); pl.position.set(2.14, 0, -1.72); set.add(pl);
  const tb = sideTable(); tb.position.set(-1.12, 0, -1.78); set.add(tb);
  const sh = shelf(); sh.position.set(1.55, 2.05, zb1); set.add(sh);
  // a round clock on the side wall
  {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 48), paint({ color: 0xf4ead8, mottle: 0.04, rim: 0.3,
      pattern: (_p, c) => {
        const q = vec2(positionLocal.z, positionLocal.x), r = length(q), ang = atan(q.y, q.x);
        const ticks = smoothstep(0.35, 0.2, abs(fract(ang.mul(12 / 6.2832)).sub(0.5))).mul(smoothstep(0.15, 0.155, r)).mul(smoothstep(0.18, 0.175, r));
        const hand = (a, len, w) => { const d = vec2(Math.cos(a), Math.sin(a)); const t = clampNode(dot(q, d), 0, len); return smoothstep(w, w * 0.6, length(q.sub(d.mul(t)))); };
        const ink = max(max(ticks.oneMinus().oneMinus(), hand(2.2, 0.1, 0.012)), max(hand(-0.5, 0.15, 0.008), smoothstep(0.02, 0.016, r)));
        return mix(c, color(0x3a2a2a), ink.mul(step(positionLocal.y, -0.014).oneMinus().mul(0).add(1)));
      } }));
    face.rotation.z = Math.PI / 2; face.position.set(R.right - 0.02, 2.2, -1.1); face.castShadow = true; set.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 12, 48), paint({ color: 0x8a5a3a, mottle: 0.1, rim: 1.2 }));
    ring.rotation.y = Math.PI / 2; ring.position.set(R.right - 0.035, 2.2, -1.1); ring.castShadow = true; set.add(ring);
  }

  // curtain rod
  const brass = paint({ color: 0x8a6a3a, mottle: 0.08, rim: 1.5 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 3.3, 12), brass); rod.rotation.z = Math.PI / 2; rod.position.set((W.x0 + W.x1) / 2, 3.05, zb1 + 0.13); rod.castShadow = true; set.add(rod);
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), brass); k.position.set((W.x0 + W.x1) / 2 + s * 1.67, 3.05, zb1 + 0.13); set.add(k); }

  // the light: late afternoon until the scene says otherwise; the sunlit floor and back wall throw the sun back,
  // the windows let the sky in; the lamp's bulb is under its shade
  const z1 = 6.3;
  stage.setSun({ box: [[R.left, 0, R.back - 0.05], [R.right + 0.05, R.top, z1]], depth: 3, air: [[R.left, 0, R.back - 0.05], [R.right + 0.05, R.top, 2]] });
  stage.setLight('golden');
  stage.bounceColor.set(0xe0c4a8);
  stage.setBounce({
    box: [[R.left, 0, R.back], [R.right, R.top, z1]],
    patches: [{ p0: [R.left, 0, R.back], du: [0, 0, z1 - R.back], dv: [R.right - R.left, 0, 0] }, { p0: [R.left, 0, R.back], du: [R.right - R.left, 0, 0], dv: [0, R.top, 0] }],
    portals: openings().map(({ p0, du, dv }) => ({ p0, du, dv })),
  });
  stage.lamp.position.set(1.72, 1.56, -1.78);
  return set;
}

// A hanging curtain. It is a grid of points, and every point is placed by a formula of
// time: fixed folds from the gathering at the rod, plus a slow billow that travels down
// the cloth, so the hem follows the top a moment late.
// The formula runs on the GPU (in the vertex stage) from one number, the time. Nothing
// is re-sent each frame: sending a changed vertex buffer every frame turned out not to
// be repeatable on this GPU when other programs were using it (see API.md, "Keeping the picture repeatable").
function curtain({ x0, x1, top = 3.03, bottom = 0.07, z = -2.07, folds = 5, seed = 1, material }) {
  const nu = 56, nv = 44, TAU = 2 * Math.PI;
  const geo = new THREE.PlaneGeometry(1, 1, nu, nv);      // only its uv (u across, v up from the hem) is used
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (top + bottom) / 2, z), Math.hypot(x1 - x0, top - bottom) / 2 + 0.3);
  const ph = rnd(1, seed) * 6.283, ph2 = rnd(2, seed) * 6.283;
  const time = uniform(0);
  // where the cloth point (u across 0..1, v down from the rod 0..1) is at this time
  const at = (u, v) => {
    const lag = v.mul(1.5), v2 = v.mul(v);
    const gust = sin(time.mul(TAU / 7.3).add(ph)).mul(0.5).add(0.5);
    const push = v2.mul(sin(time.mul(TAU * 0.31).sub(lag.mul(2.1)).add(ph)).mul(0.075).add(sin(time.mul(TAU * 0.74).sub(lag.mul(3.3)).add(ph2)).mul(0.035))).mul(gust.mul(0.45).add(0.55)).add(v2.mul(0.03));
    const side = v2.mul(0.03).mul(sin(time.mul(TAU * 0.23).sub(lag.mul(1.7)).add(ph2)));
    const fold = sin(u.mul(TAU * folds).add(ph).add(sin(v.mul(3).add(ph2)).mul(0.35))).mul(v.mul(0.022).add(0.028)).add(sin(u.mul(TAU * folds * 2.3).add(ph2)).mul(0.012).mul(v));
    const ripple = v.mul(0.012).mul(sin(time.mul(TAU * 0.9).sub(u.mul(9)).sub(lag.mul(4)).add(ph)));
    return vec3(u.mul(x1 - x0).add(x0).add(side.mul(u.mul(0.6).add(0.4))), v.mul(bottom - top).add(top), float(z).add(fold).add(push.mul(sin(u.mul(Math.PI)).mul(0.4).add(0.6))).add(ripple));
  };
  const mat = material ?? paint({
    color: 0xf6ead8, side: THREE.DoubleSide, mottle: 0.05, scatter: 0.5, through: 0.95, throughColor: 0xffdcae, rim: 0.4,
    pattern: (_p, c) => mix(c, color(0xd9785a), smoothstep(0.2, 0.215, positionWorld.y).mul(smoothstep(0.34, 0.325, positionWorld.y)).mul(0.85)),   // a coral band near the hem
  });
  const u = uv().x, v = float(1).sub(uv().y), e = 0.004;
  const P = at(u, v);
  mat.positionNode = P;
  // the cloth's facing direction, from two nearby points on it
  mat.normalNode = transformNormalToView(normalize(cross(at(u, v.add(e)).sub(P), at(u.add(e), v).sub(P))));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { mesh, update: (t) => { time.value = t; } };
}

// The room's openings, as rectangles { p0, du, dv } whose du x dv points into the room, and n, that direction:
// the window in the back wall, then the windows in the left wall.
function openings() {
  const W = ROOM.win, S = ROOM.side;
  return [{ p0: [W.x0, W.y0, ROOM.back], du: [W.x1 - W.x0, 0, 0], dv: [0, W.y1 - W.y0, 0], n: [0, 0, 1] },
    ...S.z.map(([z0, z1]) => ({ p0: [ROOM.left, S.y0, z0], du: [0, S.y1 - S.y0, 0], dv: [0, 0, z1 - z0], n: [1, 0, 0] }))];
}

// Dust in the shafts of sun: small bright specks that drift. Each lives in "window space" (a point on one of the
// room's openings and a share of the way from there to the floor along the sun), so it is always inside the light,
// whatever the hour; the specks of an opening the sun does not come in by are out. Each sinks slowly through
// half a metre, fading in at the top and out at the bottom, and starts again (every 42 s, at its own phase), so
// there is as much dust at any minute of a long film as at the start. Like the curtain, the drifting is worked
// out on the GPU from the time alone; the specks' starting data is sent once.
// They go in stage.air (drawn without a depth test) and fade as they near a surface.
export function dustMotes(stage, { count = 300, seed = 7 } = {}) {
  const TAU = 2 * Math.PI, FALL = 0.5, RATE = 0.012, holes = openings();
  const base = new THREE.IcosahedronGeometry(1, 1), nb = base.attributes.position.count;
  const pos = new Float32Array(count * nb * 3), ma = new Float32Array(count * nb * 4), mb = new Float32Array(count * nb * 4), mc = new Float32Array(count * nb * 4), mn = new Float32Array(count * nb * 2);
  for (let i = 0; i < count; i++) {
    const r = (k) => rnd(i * 10 + k, seed), h = holes[i % holes.length];
    const u = 0.1 + 0.8 * r(0), v = 0.12 + 0.76 * r(1), at = h.p0.map((p, j) => p + h.du[j] * u + h.dv[j] * v);
    const m = { at, size: 0.003 + 0.005 * r(3) * r(3), f: [0.05 + 0.1 * r(4), 0.04 + 0.09 * r(5), 0.3 + 0.9 * r(6)], ph: [r(7) * 6.283, r(8) * 6.283, r(9) * 6.283], s: r(2), fall: rnd(i, seed + 1) };
    for (let k = 0; k < nb; k++) {
      const o = i * nb + k;
      pos.set([base.attributes.position.getX(k), base.attributes.position.getY(k), base.attributes.position.getZ(k)], o * 3);
      ma.set([...m.at, m.size], o * 4); mb.set([m.f[0], m.f[1], m.f[2], m.ph[0]], o * 4); mc.set([m.ph[1], m.ph[2], m.s, m.fall], o * 4); mn.set([h.n[0], h.n[2]], o * 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const [k, a, n] of [['ma', ma, 4], ['mb', mb, 4], ['mc', mc, 4], ['mn', mn, 2]]) geo.setAttribute(k, new THREE.BufferAttribute(a, n));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 12);
  const time = uniform(0);
  const a = attribute('ma', 'vec4'), b = attribute('mb', 'vec4'), c = attribute('mc', 'vec4'), n = attribute('mn', 'vec2');
  const along = shadowUniforms.axisD;       // the way the sun shines now, so the specks stay in the shaft at any hour
  const fall = fract(time.mul(RATE / FALL).add(c.w));        // 0..1 through its fall
  const mat = new THREE.MeshBasicNodeMaterial();
  // as bright as the sun of the hour; only where the sun comes in; fading in and out at the ends of the fall
  mat.colorNode = stage.look.dust.mul(stage.softDepth(0.06)).mul(smoothstep(0.05, 0.25, dot(along, vec3(n.x, 0, n.y)))).mul(sin(fall.mul(Math.PI)));
  mat.transparent = true; mat.blending = THREE.AdditiveBlending; mat.depthWrite = false; mat.depthTest = false;
  const wx = sin(time.mul(b.x).mul(TAU).add(b.w)).mul(0.07).add(sin(time.mul(b.y).mul(2.3 * TAU).add(c.x)).mul(0.03));
  const wy = sin(time.mul(b.y).mul(TAU).add(c.x)).mul(0.06).add(fall.sub(0.5).mul(-FALL));
  const ws = sin(time.mul(b.x).mul(0.7 * TAU).add(c.y)).mul(0.1);
  const tw = sin(time.mul(b.z).mul(TAU).add(c.y)).mul(0.45).add(0.55);      // a flake turning in the light
  // how far along the sun: a share of the way down to a hand's breadth above the floor, at most 6 m
  const reach = min(a.y.sub(FALL / 2 + 0.1).div(max(along.y.negate(), 0.05)), 6);
  const s = c.z.mul(reach.sub(0.15)).add(0.15).add(ws);
  const centre = vec3(a.x, a.y.add(wy), a.z).add(along.mul(s)).add(vec3(wx, 0, 0));
  // Near the lens a speck is drawn no bigger than 1.5 mm for each metre away (about 7 px across at 1080 lines through a
  // 25 degree lens, wherever it is) and fades out closer than 2.5 m: a speck that drifted out past the room's open side
  // to a metre or two from the camera came out a soft white disc 60 px wide (and the depth of field spread it further)
  const away = length(centre.sub(cameraPosition));
  mat.positionNode = centre.add(positionLocal.mul(min(a.w, away.mul(0.0015))).mul(tw));
  mat.colorNode = mat.colorNode.mul(smoothstep(1.5, 2.5, away));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
  return { mesh, update: (t) => { time.value = t; } };
}

// The living room as Scene Zero and the storyboards' kits "room" and "home" dress it: the room (opts: buildRoom's),
// its two curtains, the dust in the sun, and the finish (light ramp, brush, depth of field, paper). → { update(t) }
// (the curtains and the dust move)
export function livingRoom(stage, opts) {
  const W = ROOM.win;
  buildRoom(stage, opts);
  lookUniforms.rampHi.value = 0.3;
  stage.look.paint.value = 0.85; stage.look.blur.value = 3.0; stage.look.paper.value = 0.05;
  const curtains = [curtain({ x0: W.x0 - 0.42, x1: W.x0 + 0.1, folds: 4, seed: 3 }), curtain({ x0: W.x1 - 0.3, x1: W.x1 + 0.34, folds: 5, seed: 5 })];
  for (const c of curtains) stage.scene.add(c.mesh);
  const dust = dustMotes(stage); stage.air.add(dust.mesh);
  return { update(t) { for (const c of curtains) c.update(t); dust.update(t); } };
}
