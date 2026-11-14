// The place "home": the engine's living room inside a small house, with its front garden, the drive, the street
// and the neighbourhood round it, built so a film can cut between indoors and outdoors and a camera indoors can
// watch the garden through the big window.
//
// Axes are the living room's (room.mjs): x left to right as seen from the room's camera, y up, z toward that camera.
// The room's back wall is the house front: its outer face is z = -2.52 and the garden, the drive and the street lie
// toward -z. The entrance wing stands to the right of the room (x 2.7 to 4.8): a hall reached through an opening in
// the room's right wall, and the front door. The ground is y = 0 everywhere a foot goes.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  float, vec2, vec3, color, mix, smoothstep, fract, floor, abs, sin, length, max, min, step, positionWorld, normalize,
  mx_noise_float, mx_fractal_noise_float, uniform, dot, cross, exp, cameraPosition, attribute, pow, normalWorld,
} from 'three/tsl';
import { paint } from '../materials.mjs';
import { livingRoom, ROOM, wallPaint, boards } from '../room.mjs';
import { slab } from '../sets.mjs';
import { softMesh } from '../soft.mjs';
import { rnd } from '../motion.mjs';
import { LIGHTS, sunDir } from '../light.mjs';
import { build } from '../shape.mjs';
import mailbox from '../props/mailbox.mjs';
import { wingFront, windowSeat, lantern, chimney, doorstep, D as P } from './parts.mjs';

const W = ROOM.win, S = ROOM.side;
export const HOME = {
  front: -2.52, left: -4.92, right: 2.82, eave: 3.45, ridge: { z: 1.5, y: 6.55 }, back: 9.5,
  wing: { x0: 2.72, x1: 4.8, z1: 1.4, eave: 2.85, ridge: 3.85 },
  hall: { x0: 2.7, x1: 4.6, z0: -2.36, z1: 1.2, top: 2.75 },
  opening: { z0: -0.25, z1: 0.85, h: 2.1 },            // from the room into the hall, in the room's right wall
  door: { x: 3.76 },                                    // the front door's middle
  seat: { x: -2.5, z: -1.97, top: 0.39 },               // the window seat (between the curtains)
  path: { x0: 3.31, x1: 4.21, z0: -9.75, z1: -3.15 },
  drive: { x0: 5.0, x1: 8.6, z0: -11.15, z1: -2.2 },      // wide enough for the car with its driver's door (+x) open
  bed: { x0: -4.85, x1: 2.65, z0: -3.35, z1: -2.52 },
  hedge: { z: -9.35, x0: -7.6, x1: 3.15, side: -7.6 },
  fence: { x: 9.2, z0: -9.75, z1: 2.0 },
  pavement: [-11.15, -9.75], kerb: [-11.3, -11.15], road: [-17.3, -11.3], farKerb: [-17.45, -17.3], farPavement: [-18.9, -17.45],
};
const H = HOME;

// ───────────── paint ─────────────
const n3 = (p, s, o) => mx_noise_float(vec3(p.x.mul(s), p.y.mul(s), p.z.mul(s)).add(o)).mul(0.5).add(0.5);
const rectMask = (x, z, x0, x1, z0, z1, e = 0.02) => smoothstep(x0 - e, x0 + e, x).mul(smoothstep(x1 + e, x1 - e, x)).mul(smoothstep(z0 - e, z0 + e, z)).mul(smoothstep(z1 + e, z1 - e, z));

// The house's outside: a warm lime render washed with soft clouds of tone and long brush marks, on a plinth of
// rounded grey stones (the plinth only on outside faces: inside the hall the wall is plain).
function renderPaint(base) {
  return paint({
    color: base, mottle: 0, scatter: 0.15, rim: 0.3, brush: 0.03,
    pattern: (_p, c) => {
      const p = positionWorld, h = p.x.add(p.z);
      const wash = mx_fractal_noise_float(vec3(h.mul(0.5), p.y.mul(0.5), 3.1), 4, 2.0, 0.55).mul(0.5).add(0.5);
      const strokes = mx_noise_float(vec3(h.mul(9), p.y.mul(1.4), 6.2)).mul(0.5).add(0.5);
      // (the wash only darkens: its light end is the render's own colour, so a sunlit wall does not clip in spots)
      let col = c.mul(mix(float(0.86), float(1.0), wash)).mul(mix(float(0.96), float(1.0), strokes));
      col = col.mul(vec3(mix(float(0.97), float(1.0), wash), 1.0, mix(float(1.05), float(0.97), wash)));
      // stones: staggered rounded blocks, 0.15 high, mortar between
      const g = vec2(h.div(0.32), p.y.div(0.15)), row = floor(g.y), q = fract(vec2(g.x.add(row.mul(0.5)), g.y)).sub(0.5);
      const tone = fract(sin(floor(vec2(g.x.add(row.mul(0.5)), g.y)).dot(vec2(12.9898, 78.233))).mul(43758.5453));
      const stone = color(0xb3a99f).mul(mix(float(0.85), float(1.1), tone)).mul(mix(float(0.92), float(1.05), n3(p, 7, 2)));
      const mortar = smoothstep(0.43, 0.48, max(abs(q.x), abs(q.y)));
      const inHall = rectMask(p.x, p.z, H.hall.x0 - 0.01, H.hall.x1 + 0.01, H.hall.z0 - 0.01, H.hall.z1 + 0.01, 0.001);
      const plinth = smoothstep(0.47, 0.44, p.y).mul(inHall.oneMinus());
      col = mix(col, mix(stone, color(0x8f8378), mortar), plinth);
      return col.mul(mix(float(0.8), float(1.0), smoothstep(0.0, 0.6, p.y)));      // a little grime at the foot
    },
  });
}

// Roof tiles: rows along the eaves, each tile with a rounded foot over the row below; `along` is the axis the
// rows run along.
function tilePaint(base, along) {
  return paint({
    color: base, mottle: 0, scatter: 0.2, rim: 0.6, brush: 0.05,
    pattern: (_p, c) => {
      const p = positionWorld, a = along === 'x' ? p.x : p.z;
      const v = p.y.div(0.12), row = floor(v), u = a.div(0.22).add(row.mul(0.5)), f = fract(v), g = fract(u).sub(0.5);
      const foot = float(0.32).mul(float(1).sub(pow(max(float(1).sub(g.mul(g).mul(4)), 0.0), 0.5)));
      const gap = smoothstep(foot.add(0.06), foot, f);                 // the shadowed lip under each tile
      const tone = fract(sin(floor(u).mul(17.3).add(row.mul(91.7))).mul(43758.5453));
      const wash = mx_fractal_noise_float(vec3(a.mul(0.4), p.y.mul(0.4), 8.0), 3, 2.0, 0.5).mul(0.5).add(0.5);
      const tiles = c.mul(mix(float(0.86), float(1.1), tone)).mul(mix(float(0.85), float(1.08), wash)).mul(mix(float(1), float(0.55), gap)).mul(mix(float(0.95), float(1.04), f));
      // the underside of the eaves is plain boarding, not tiles
      return mix(color(0xeadcc4).mul(mix(float(0.9), float(1.0), wash)), tiles, smoothstep(-0.25, 0.1, normalWorld.y));
    },
  });
}

// The ground: lawn, beds, the gravel drive, paving and the road, by where a point is; grass far away pales.
function groundPaint() {
  return paint({
    color: 0xffffff, mottle: 0, scatter: 0.12, rim: 0, brush: 0.04,
    pattern: () => {
      const p = positionWorld, x = p.x, z = p.z;
      const n = (s, o) => mx_noise_float(vec3(x.mul(s), z.mul(s), o)).mul(0.5).add(0.5);
      const clump = mx_fractal_noise_float(vec3(x.mul(0.9), z.mul(0.9), 1.0), 3, 2.0, 0.5).mul(0.5).add(0.5), fine = n(7, 2.0);
      let grass = mix(color(0x4c7440), color(0x84a45e), clump.mul(0.75).add(fine.mul(0.25)));
      const lawn = rectMask(x, z, H.hedge.side, H.drive.x0, H.hedge.z, H.front);
      const stripe = smoothstep(0.35, 0.65, abs(fract(x.div(1.3)).sub(0.5)).mul(2));
      grass = grass.mul(mix(float(1), mix(float(0.93), float(1.06), stripe), lawn));
      // big soft patches a few metres across: drier, yellower grass in some, lusher and darker in others (a lawn
      // in one even green read as a computer's); and darker, longer grass where it meets the house, the beds and the
      // drive's edging, where no mower reaches
      const patch = smoothstep(0.3, 0.75, mx_fractal_noise_float(vec3(x.mul(0.22), z.mul(0.22), 11.0), 3, 2.0, 0.5).mul(0.5).add(0.5));
      grass = mix(grass.mul(vec3(0.86, 0.9, 0.86)), grass.mul(vec3(1.1, 1.05, 0.8)), patch);
      const edge = max(max(smoothstep(-3.9, -3.35, z).mul(step(x, 2.7)), smoothstep(-2.95, -2.6, z)), max(smoothstep(H.drive.x0 - 0.45, H.drive.x0 - 0.05, x).mul(step(x, H.drive.x0)), smoothstep(H.path.x0 - 0.35, H.path.x0, x).mul(smoothstep(H.path.x1 + 0.35, H.path.x1, x)).mul(step(z, H.front)).mul(step(H.hedge.z, z))));
      grass = grass.mul(mix(float(1), float(0.84), edge.mul(lawn)));
      const far = smoothstep(22, 70, length(vec2(x, z.add(5))));
      let c = mix(grass, color(0x8fb37f), far.mul(0.7));
      const soil = color(0x6e5040).mul(mix(float(0.8), float(1.1), n(5, 3.0)));
      c = mix(c, soil, rectMask(x, z, H.bed.x0, H.bed.x1, H.bed.z0, H.bed.z1, 0.06).mul(smoothstep(0.25, 0.55, n(3, 9.0).mul(0.4).add(0.6))));
      // the gravel, pressed darker in two tracks where the car's wheels run up the drive
      const tracks = max(smoothstep(0.32, 0.12, abs(x.sub(6.6 - 0.8))), smoothstep(0.32, 0.12, abs(x.sub(6.6 + 0.8)))).mul(smoothstep(-11.4, -10.2, z)).mul(smoothstep(-2.6, -4.0, z));
      const gravel = mix(color(0xb9a68c), color(0xe3d4b8), n(38, 4.0)).mul(mix(float(0.85), float(1.05), n(4, 5.0))).mul(mix(float(1), float(0.86), tracks.mul(n(2.5, 12.0).mul(0.5).add(0.5))));
      c = mix(c, gravel, rectMask(x, z, H.drive.x0, H.drive.x1, H.drive.z0, H.drive.z1, 0.03));
      // paving slabs on both pavements
      const sl = fract(vec2(x.div(0.75), z.div(0.7))).sub(0.5), joint = smoothstep(0.45, 0.49, max(abs(sl.x), abs(sl.y)));
      const slabs = color(0xc9c1b8).mul(mix(float(0.9), float(1.06), n(1.4, 6.0))).mul(mix(float(1), float(0.72), joint));
      const pav = rectMask(x, z, -200, 200, H.pavement[0], H.pavement[1]).add(rectMask(x, z, -200, 200, H.farPavement[0], H.farPavement[1]));
      c = mix(c, slabs, pav.mul(rectMask(x, z, H.drive.x0, H.drive.x1, -200, 200).mul(0.6).oneMinus()));
      const asphalt = color(0x75707d).mul(mix(float(0.88), float(1.07), mx_fractal_noise_float(vec3(x.mul(0.6), z.mul(0.6), 7.0), 3, 2.0, 0.5).mul(0.5).add(0.5))).mul(mix(float(0.95), float(1.04), n(30, 8.0)));
      const mid = (H.road[0] + H.road[1]) / 2;
      const dash = smoothstep(0.07, 0.05, abs(z.sub(mid))).mul(step(fract(x.div(4)), 0.5));
      c = mix(c, mix(asphalt, color(0xe8dcc0), dash.mul(0.7)), rectMask(x, z, -200, 200, H.road[0], H.road[1], 0.01));
      return c;
    },
  });
}

// Leaves: soft clumps, darker in their hollows, glowing a little where the sun is behind them.
const leafy = (base, s = 5) => ({
  color: base, mottle: 0.1, mottleScale: 2.5, scatter: 0.45, scatterColor: 0xd8ff7a, rim: 1.0, through: 0.35, throughColor: 0xd0ff80,
  pattern: (p, c) => {
    const clumps = mx_fractal_noise_float(p.mul(s), 3, 2.0, 0.5).mul(0.5).add(0.5);
    return c.mul(mix(float(0.74), float(1.1), smoothstep(0.25, 0.75, clumps)));
  },
});

// ───────────── building blocks ─────────────
const span = (x0, x1, y0, y1, z0, z1, mat) => slab(x1 - x0, y1 - y0, z1 - z0, mat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);

// A slab whose underside is the parallelogram p0 + s du + t dv and which is t thick above it, sagging `sag` in its
// middle (a storybook roof is never quite straight).
function roofSlab(p0, du, dv, thick, mat, sag = 0.05) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 24, 1, 16), a = geo.attributes.position;
  const U = new THREE.Vector3(...du), V = new THREE.Vector3(...dv), N = V.clone().cross(U).normalize();
  if (N.y < 0) N.negate();
  const o = new THREE.Vector3(...p0), q = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    const s = a.getX(i) + 0.5, t = a.getZ(i) + 0.5, h = a.getY(i) + 0.5;
    q.copy(o).addScaledVector(U, s).addScaledVector(V, t).addScaledVector(N, h * thick - sag * Math.sin(Math.PI * s) * Math.sin(Math.PI * Math.min(1, t * 1.2)));
    a.setXYZ(i, q.x, q.y, q.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  return m;
}

// A flat shape [[u, v], ...] pushed `depth` thick, laid in the world by the basis (eu, ev, ew) at `origin`.
function prism(pts, depth, origin, eu, ev, ew, mat) {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...eu), new THREE.Vector3(...ev), new THREE.Vector3(...ew)).setPosition(...origin));
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  return m;
}

// A plank from a to b (its middle line), w wide toward `up`, t thick.
function plank(a, b, w, t, mat, up = [0, 1, 0]) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), ex = B.clone().sub(A), len = ex.length(); ex.normalize();
  const ez = ex.clone().cross(new THREE.Vector3(...up)).normalize(), ey = ez.clone().cross(ex);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, t), mat);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez)); m.position.copy(A).add(B).multiplyScalar(0.5);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Many small static pieces as one mesh: each { geo, at: [x, y, z], rot: [x, y, z], scale, color, glow }.
function merged(pieces, mat) {
  const geos = pieces.map(({ geo, at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], color: c = 0xffffff, glow = 0 }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...[scale].flat().length === 1 ? [scale, scale, scale] : scale)));
    const n = g.attributes.position.count, col = new THREE.Color(c), cols = new Float32Array(n * 3), gl = new Float32Array(n).fill(glow);
    for (let i = 0; i < n; i++) cols.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true;
  return m;
}

// ───────────── the house ─────────────
function house(g, M) {
  const F = H.front, Fw = F - 0.06, E = H.eave, Lx = H.left, Rx = H.right, Wg = H.wing, Hl = H.hall;
  // the front's skin round the big window (the room's back wall is behind it)
  g.add(span(Lx, W.x0, 0, E, F, -2.4, M.ext), span(W.x1, Wg.x0, 0, E, F, -2.4, M.ext), span(W.x0, W.x1, 0, W.y0, F, -2.4, M.ext), span(W.x0, W.x1, W.y1, E, F, -2.4, M.ext));
  // the left side's skin round the five tall windows, and the main block's right side behind the wing
  let zl = F;
  for (const [z0, z1] of S.z) { g.add(span(Lx, -4.8, 0, E, zl, z0, M.ext), span(Lx, -4.8, 0, S.y0, z0, z1, M.ext), span(Lx, -4.8, S.y1, E, z0, z1, M.ext)); zl = z1; }
  g.add(span(Lx, -4.8, 0, E, zl, H.back, M.ext), span(2.7, Rx, 0, E, Wg.z1, H.back, M.ext));
  // the house's back wall (the room's far wall, backWall, is in front of it indoors)
  g.add(span(Lx, Rx, 0, E, H.back, H.back + 0.2, M.ext));
  // window trims outside: the big window's frame and sill, the side windows' frames
  const t = 0.12, fz = F - 0.04;
  g.add(span(W.x0 - t, W.x0, W.y0 - 0.02, W.y1 + t, fz, F, M.trim), span(W.x1, W.x1 + t, W.y0 - 0.02, W.y1 + t, fz, F, M.trim), span(W.x0 - t, W.x1 + t, W.y1, W.y1 + t, fz, F, M.trim));
  g.add(span(W.x0 - 0.2, W.x1 + 0.2, W.y0 - 0.07, W.y0, F - 0.16, F, M.trim));
  for (const [z0, z1] of S.z) g.add(span(Lx - 0.04, Lx, S.y0 - 0.02, S.y1 + 0.1, z0 - 0.1, z0, M.trim), span(Lx - 0.04, Lx, S.y0 - 0.02, S.y1 + 0.1, z1, z1 + 0.1, M.trim), span(Lx - 0.04, Lx, S.y1, S.y1 + 0.1, z0, z1, M.trim), span(Lx - 0.12, Lx, S.y0 - 0.06, S.y0, z0 - 0.12, z1 + 0.12, M.trim));
  // shutters beside the big window
  for (const x of [W.x0 - t - 0.62, W.x1 + t + 0.02]) g.add(merged([0, 1, 2, 3, 4].map((i) => ({ geo: new RoundedBoxGeometry(0.11, 2.5, 0.04, 2, 0.015), at: [x + 0.06 + i * 0.12, W.y0 + 1.3, F - 0.018], color: i % 2 ? 0x3f8c8e : 0x45969a })), M.vc));
  frontDressing(g, M);

  // the entrance wing: hall floor and ceiling, its right and back walls (the room's right wall is its left)
  g.add(span(Hl.x0, Hl.x1, -0.2, 0, Hl.z0, Hl.z1, M.hallFloor), span(Hl.x0, Wg.x1, Hl.top, Hl.top + 0.1, Hl.z0, Wg.z1, M.ceiling));
  g.add(span(Hl.x1, Wg.x1, 0, Wg.eave, Fw + P.wall, Wg.z1, M.ext), span(Wg.x0, Hl.x1, 0, Wg.eave, Hl.z1, Wg.z1, M.ext));
  // the wing's gable over the door (its foot reaches down over the wall's rounded top edge, so no crease shows)
  g.add(prism([[Wg.x0, Wg.eave - 0.06], [Wg.x1, Wg.eave - 0.06], [Wg.x1, Wg.eave], [(Wg.x0 + Wg.x1) / 2, Wg.ridge], [Wg.x0, Wg.eave]], 0.24, [0, 0, Fw], [1, 0, 0], [0, 1, 0], [0, 0, 1], M.ext));
  // the main block's side gables (the ridge runs along x; the front slope is the steep one)
  for (const x of [-4.8, Rx]) g.add(prism([[F, E], [H.ridge.z, H.ridge.y], [H.back, E]], 0.12, [x, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], M.ext));

  // roofs: the main one (front slope, back slope, ridge), the wing's two slopes, fascia boards and bargeboards
  const k1 = (H.ridge.y - E) / (H.ridge.z - F), over = 0.45, rx0 = Lx - 0.38, rx1 = Rx + 0.04;
  g.add(roofSlab([rx0, E - over * k1, F - over], [rx1 - rx0, 0, 0], [0, H.ridge.y - E + over * k1, H.ridge.z - F + over], 0.16, M.roof, 0.06));
  const k2 = (H.ridge.y - E) / (H.back - H.ridge.z);
  g.add(roofSlab([rx0, H.ridge.y, H.ridge.z], [rx1 - rx0, 0, 0], [0, -(H.ridge.y - E) - 0.4 * k2, H.back - H.ridge.z + 0.4], 0.16, M.roof, 0.04));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, rx1 - rx0 + 0.1, 16), M.roofDark);
  cap.rotation.z = Math.PI / 2; cap.position.set((rx0 + rx1) / 2, H.ridge.y + 0.14, H.ridge.z); cap.castShadow = true; g.add(cap);
  g.add(plank([rx0, E - over * k1 - 0.02, F - over - 0.02], [rx1, E - over * k1 - 0.02, F - over - 0.02], 0.22, 0.05, M.trim));
  const kw = (Wg.ridge - Wg.eave) / ((Wg.x1 - Wg.x0) / 2), wo = 0.35, xm = (Wg.x0 + Wg.x1) / 2, wz0 = Fw - 0.4, wz1 = Wg.z1 + 0.2;
  g.add(roofSlab([Wg.x1 + wo, Wg.eave - wo * kw, wz0], [0, 0, wz1 - wz0], [xm - Wg.x1 - wo, Wg.ridge - Wg.eave + wo * kw, 0], 0.12, M.roofW, 0.03));
  g.add(roofSlab([2.78, Wg.ridge - (xm - 2.78) * kw, wz0], [0, 0, wz1 - wz0], [xm - 2.78, (xm - 2.78) * kw, 0], 0.12, M.roofW, 0.03));
  g.add(plank([Wg.x1 + wo, Wg.eave - wo * kw + 0.02, wz0 - 0.03], [xm, Wg.ridge + 0.08, wz0 - 0.03], 0.2, 0.05, M.trim), plank([2.78, Wg.ridge - (xm - 2.78) * kw + 0.02, wz0 - 0.03], [xm, Wg.ridge + 0.08, wz0 - 0.03], 0.2, 0.05, M.trim));
  // a little block where the two bargeboards meet at the apex
  const boss = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.26, 0.09, 2, 0.02), M.trim); boss.position.set(xm, Wg.ridge + 0.06, wz0 - 0.04); boss.castShadow = true; g.add(boss);

  // the kit pieces: the wing's front with the door, the lantern, the chimney, the step, the window seat
  const wing = build(wingFront()); wing.group.rotation.y = Math.PI; wing.group.position.set(xm, 0, Fw + P.wall / 2);
  wing.parts.wing.children[0].material = M.ext; g.add(wing.group);
  const lamp = build(lantern()); lamp.group.rotation.y = Math.PI; lamp.group.position.set(Wg.x1 - 0.27, 1.62, Fw); g.add(lamp.group);
  const chim = build(chimney()); chim.group.position.set(1.0, 5.25, 0.55); chim.group.rotation.z = 0.04; g.add(chim.group);
  // the doorstep is set flush (its top 3 mm above the lawn): people walk at y = 0 and do not climb
  const st = build(doorstep()); st.group.position.set(H.door.x, 0.003 - P.stepH, Fw - P.stepD / 2 + 0.02); st.group.rotation.y = 0.03; g.add(st.group);
  const seat = build(windowSeat()); seat.group.position.set(H.seat.x, 0, ROOM.back + P.seatD / 2 + 0.005); g.add(seat.group);
  // the hall's own dressing: a casing round the opening on the room side, a coat rack, a runner
  const o = H.opening;
  g.add(span(2.44, 2.5, 0, o.h + 0.1, o.z0 - 0.1, o.z0, M.trim), span(2.44, 2.5, 0, o.h + 0.1, o.z1, o.z1 + 0.1, M.trim), span(2.44, 2.5, o.h, o.h + 0.1, o.z0, o.z1, M.trim));
  g.add(span(Hl.x1 - 0.05, Hl.x1, 1.55, 1.65, -0.9, 0.2, M.wood));
  g.add(merged([-0.75, -0.4, -0.05].map((z) => ({ geo: new THREE.SphereGeometry(0.03, 10, 8), at: [Hl.x1 - 0.08, 1.6, z], color: 0xc9a24a })), M.vc));
  g.add(span(3.36, 4.16, 0, 0.012, -2.1, 0.9, M.runner));
  return { wing, lamp };
}

// The front between the big window's shutters and the entrance wing (x -0.44 to 2.72) was 3 m of blank render, a
// third of the frame in the shots by the door. It gets a small window with shutters, a sill and glazing bars, its
// panes lit warm at dusk like the neighbours' (it is a panel on the wall's outer face: the room inside is unchanged),
// and a climbing rose from the bed by the wing's corner, its canes fanning up and arching over the window under the
// eave. (round 3: the dusk shot 3.2 read as an unfinished set)
function frontDressing(g, M) {
  const F = H.front, wx = 1.05, wy = 1.6, parts = [], leaves = [];
  parts.push({ geo: new RoundedBoxGeometry(1.05, 1.2, 0.08, 2, 0.025), at: [wx, wy, F - 0.03], color: 0xf3ead8 });
  parts.push({ geo: new RoundedBoxGeometry(0.85, 1.0, 0.06, 1, 0.015), at: [wx, wy, F - 0.055], color: 0x8aa0bc, glow: 1 });
  parts.push({ geo: new THREE.BoxGeometry(0.05, 1.0, 0.04), at: [wx, wy, F - 0.09], color: 0xf3ead8 });
  parts.push({ geo: new THREE.BoxGeometry(0.85, 0.05, 0.04), at: [wx, wy + 0.08, F - 0.09], color: 0xf3ead8 });
  parts.push({ geo: new RoundedBoxGeometry(1.25, 0.08, 0.2, 1, 0.02), at: [wx, wy - 0.62, F - 0.1], color: 0xf3ead8 });
  for (const k of [-1, 1]) parts.push({ geo: new RoundedBoxGeometry(0.45, 1.15, 0.05, 2, 0.015), at: [wx + k * 0.78, wy, F - 0.03], color: k < 0 ? 0x3f8c8e : 0x45969a });
  g.add(merged(parts, M.cottage));
  // the rose: three canes from one root by the wing's corner, the last arching along under the eave over the window
  const root = [2.45, 0], tips = [[2.55, 2.9], [2.0, 3.15], [0.2, 2.95]];
  tips.forEach(([tx, ty], c) => {
    const n = c === 2 ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, k = 300 + c * 50 + i, bend = c === 2 ? Math.min(1, u * 1.6) : u;
      const cx = root[0] + (tx - root[0]) * (c === 2 ? Math.max(0, u * 1.6 - 0.6) : u) + (rnd(k, 91) - 0.5) * 0.2;
      const cy = root[1] + 0.35 + (ty - root[1] - 0.35) * bend + (rnd(k, 92) - 0.5) * 0.18, r = 0.13 + rnd(k, 93) * 0.1 + (1 - u) * 0.05;
      leaves.push({ geo: new THREE.SphereGeometry(1, 10, 8), at: [cx, cy, F - 0.07], scale: [r, r * 0.85, r * 0.45], color: [0x4f7f45, 0x5b8c4c, 0x46743f, 0x6a9a52][k % 4] });
      if (rnd(k, 94) < 0.5) leaves.push({ geo: new THREE.IcosahedronGeometry(0.04, 1), at: [cx + (rnd(k, 96) - 0.5) * r, cy + (rnd(k, 95) - 0.5) * r, F - 0.07 - r * 0.42], color: [0xf2a6b8, 0xe8736a, 0xfff2f2][k % 3] });
    }
  });
  g.add(merged(leaves, M.vcSoft));
}

// The room's far wall, facing the window: the reverse angle of the room and the end of the view in through the
// window. The engine's cameras for this room stand behind it (toward +z, the room's open side), so it and everything
// on it are drawn only for a camera in front of it (maskNode), like a stage's fourth wall. Its wallpaper and
// panelling are the room's.
export const BACK = { z: 4.4, door: { x0: 1.25, x1: 2.2, h: 2.15 }, shelf: { x0: -4.45, x1: -2.85, h: 2.05, d: 0.34 } };
function backWall(g) {
  const R = ROOM, Z = BACK.z, dr = BACK.door, sh = BACK.shelf;
  const front = cameraPosition.z.lessThan(Z - 0.02);
  const masked = (m) => { m.maskNode = front; return m; };
  const wall = masked(wallPaint()), panel = masked(boards(0x9db09a)), vc = masked(paint({ vertexColors: true, mottle: 0.06, scatter: 0.2, rim: 0.5 }));
  // the wall, with the doorway to the kitchen
  g.add(span(R.left, dr.x0, 0, R.top, Z, Z + 0.15, wall), span(dr.x1, R.right, 0, R.top, Z, Z + 0.15, wall), span(dr.x0, dr.x1, dr.h, R.top, Z, Z + 0.15, wall));
  // panelling under the rail, either side of the door
  g.add(span(R.left, dr.x0 - 0.08, 0, 0.92, Z - 0.025, Z, panel), span(dr.x1 + 0.08, R.right, 0, 0.92, Z - 0.025, Z, panel));
  const P = [], piece = (x0, x1, y0, y1, z0, z1, c) => P.push({ geo: new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color: c });
  const TRIM = 0xf5ecdc, WOOD = 0x8a5c3c;
  for (const [x0, x1] of [[R.left, dr.x0 - 0.08], [dr.x1 + 0.08, R.right]]) { piece(x0, x1, 0.92, 0.97, Z - 0.045, Z, TRIM); piece(x0, x1, 0, 0.11, Z - 0.04, Z, TRIM); }
  piece(R.left, R.right, R.top - 0.09, R.top, Z - 0.06, Z, TRIM);
  // the kitchen door: casing, a panelled leaf (shut), a knob
  piece(dr.x0 - 0.08, dr.x0, 0, dr.h + 0.08, Z - 0.04, Z, TRIM); piece(dr.x1, dr.x1 + 0.08, 0, dr.h + 0.08, Z - 0.04, Z, TRIM); piece(dr.x0 - 0.08, dr.x1 + 0.08, dr.h, dr.h + 0.08, Z - 0.04, Z, TRIM);
  piece(dr.x0, dr.x1, 0, dr.h, Z + 0.02, Z + 0.06, 0x6f9a8e);
  for (const [y0, y1] of [[0.2, 0.95], [1.15, 1.95]]) piece(dr.x0 + 0.12, dr.x1 - 0.12, y0, y1, Z + 0.005, Z + 0.02, 0x7cab9e);
  P.push({ geo: new THREE.SphereGeometry(0.035, 12, 8), at: [dr.x0 + 0.12, 1.02, Z - 0.0], color: 0xc9a24a });
  // a bookcase in the corner, full of books
  piece(sh.x0, sh.x0 + 0.04, 0, sh.h, Z - sh.d, Z, WOOD); piece(sh.x1 - 0.04, sh.x1, 0, sh.h, Z - sh.d, Z, WOOD);
  piece(sh.x0, sh.x1, sh.h - 0.04, sh.h, Z - sh.d - 0.02, Z, WOOD); piece(sh.x0 + 0.04, sh.x1 - 0.04, 0, sh.h, Z - 0.02, Z, 0x6a4430);
  const BOOKS = [0xc8553f, 0x3f8c8e, 0xd9a441, 0x7b4a68, 0xe8dcc0, 0x4f6f9e, 0x8aa05a, 0xd2785a];
  for (let k = 0; k < 5; k++) {
    const y = 0.06 + k * 0.4;
    piece(sh.x0 + 0.04, sh.x1 - 0.04, y - 0.03, y, Z - sh.d, Z - 0.02, WOOD);
    if (k === 4) break;
    for (let x = sh.x0 + 0.07, i = 0; x < sh.x1 - 0.12; i++) {
      const bw = 0.03 + 0.03 * rnd(i, 300 + k), bh = 0.22 + 0.1 * rnd(i, 310 + k), lean = i % 9 === 8 && x < sh.x1 - 0.3;
      if (rnd(i, 320 + k) < 0.07) { x += 0.12; continue; }        // a gap now and then
      P.push({ geo: new THREE.BoxGeometry(bw, bh, 0.22), at: [x + bw / 2, y + bh / 2, Z - 0.15], rot: [0, 0, lean ? 0.25 : 0], color: BOOKS[(i * 5 + k * 3) % BOOKS.length] });
      x += bw + 0.004 + (lean ? 0.05 : 0);
    }
  }
  // a framed picture over a low chest
  piece(-1.15, 0.15, 1.35, 2.25, Z - 0.035, Z, 0x5a3d2c); piece(-1.08, 0.08, 1.42, 2.18, Z - 0.04, Z - 0.035, 0xeedfc0);
  piece(-0.98, -0.02, 1.52, 2.08, Z - 0.045, Z - 0.04, 0x9cc0b0); piece(-0.98, -0.02, 1.52, 1.7, Z - 0.05, Z - 0.045, 0x6f9a5e); piece(-0.6, -0.3, 1.86, 2.0, Z - 0.05, Z - 0.045, 0xf2d48a);
  piece(-1.4, 0.4, 0, 0.62, Z - 0.48, Z, WOOD); piece(-1.45, 0.45, 0.62, 0.66, Z - 0.5, Z, 0x9a6a48);
  for (const x of [-0.95, -0.05]) P.push({ geo: new THREE.SphereGeometry(0.03, 10, 8), at: [x, 0.42, Z - 0.49], color: 0xc9a24a });
  g.add(merged(P, vc));
}

// ───────────── the garden and the street ─────────────
// A tree: a leaning trunk with two limbs and a crown of soft clumps. Built round its foot.
function tree({ seed, h = 5, r = 2, trunkR = 0.2, colorLeaf = 0x55804a }) {
  const g = new THREE.Group(), R = (k) => rnd(k, seed);
  const lean = [(R(1) - 0.5) * 0.4, (R(2) - 0.5) * 0.4], top = [lean[0], h * 0.55, lean[1]];
  g.add(softMesh([
    { type: 'cone', a: [0, -0.1, 0], b: top, ra: trunkR, rb: trunkR * 0.65, k: 0.05 },
    { type: 'cone', a: [0, -0.05, 0], b: [0, 0.25, 0], ra: trunkR * 1.5, rb: trunkR, k: 0.1 },
    { type: 'cone', a: [top[0] * 0.8, h * 0.45, top[2] * 0.8], b: [top[0] + r * 0.45, h * 0.68, top[2] + 0.2], ra: trunkR * 0.5, rb: trunkR * 0.3, k: 0.06 },
    { type: 'cone', a: [top[0] * 0.8, h * 0.48, top[2] * 0.8], b: [top[0] - r * 0.4, h * 0.72, top[2] - 0.25], ra: trunkR * 0.5, rb: trunkR * 0.3, k: 0.06 },
  ], { h: Math.max(0.02, trunkR / 5), material: { color: 0x6a4a38, mottle: 0.15, mottleScale: 6, scatter: 0.2 } }));
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4 + R(10 + i) * 0.8, rr = r * (0.45 + 0.55 * R(30 + i)), up = (R(50 + i) - 0.3) * r * 0.75;
    const s = r * (0.36 + 0.24 * R(70 + i));
    blobs.push({ type: 'ell', c: [top[0] + Math.cos(a) * rr * 0.75, h - r * 0.85 + up, top[2] + Math.sin(a) * rr * 0.75], r: [s, s * 0.85, s], k: r * 0.25 });
  }
  blobs.push({ type: 'ell', c: [top[0], h - r * 0.6, top[2]], r: [r * 0.8, r * 0.62, r * 0.8], k: r * 0.25 });
  g.add(softMesh(blobs, { h: Math.max(0.04, r / 45), material: leafy(colorLeaf, 2.2 / r * 2) }));
  return g;
}

// A clipped hedge from a to b on the ground: a soft box with lumpy sides and top.
function hedge(a, b, { h = 1.22, d = 0.75, seed = 3 } = {}) {      // h: from 0.22 under the lawn to the top
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), ops = [];
  ops.push({ type: 'box', c: [len / 2, h / 2, 0], r: [len / 2, h / 2, d / 2], round: 0.22, k: 0.1 });
  for (let i = 0; i < Math.ceil(len / 0.45); i++) {
    const x = 0.2 + i * 0.45 + (rnd(i, seed) - 0.5) * 0.2;
    if (x > len - 0.2) break;
    ops.push({ type: 'ell', c: [x, h - 0.1 + rnd(i, seed + 1) * 0.08, (rnd(i, seed + 2) - 0.5) * 0.25], r: [0.32, 0.2, 0.3], k: 0.12 });
    for (const s of [-1, 1]) ops.push({ type: 'ell', c: [x + 0.2, 0.55 + rnd(i, seed + 3 + s) * 0.45, s * (d / 2 - 0.12)], r: [0.28, 0.26, 0.18], k: 0.12 });
  }
  // darker toward its foot, where little light gets in (it also keeps the sun's soft edge from lighting a rim there)
  const L = leafy(0x4d7a46, 9), m = softMesh(ops, { h: 0.035, material: { ...L, pattern: (q, c) => L.pattern(q, c).mul(mix(float(0.4), float(1), smoothstep(0.0, 0.35, positionWorld.y))) } });
  m.position.set(a[0], -0.22, a[1]); m.rotation.y = yaw;      // sunk by its rounding, so a low sun cannot shine in under it
  return m;
}

function garden(g, M) {
  // the ground, and the kerbs (dropped at the drive)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 96), M.ground); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.004; ground.receiveShadow = true; g.add(ground);
  const kerbs = [];
  for (const [z0, z1] of [H.kerb, H.farKerb]) for (let x = -60; x < 60; x += 1.2) {
    const drop = z0 === H.kerb[0] && x + 1.2 > H.drive.x0 && x < H.drive.x1;
    kerbs.push({ geo: new RoundedBoxGeometry(1.18, drop ? 0.05 : 0.14, z1 - z0, 2, 0.02), at: [x + 0.6, drop ? 0 : 0.03, (z0 + z1) / 2], color: drop ? 0xb8b0a8 : 0xd2cbc2 });
  }
  g.add(merged(kerbs, M.stone));
  // stepping stones up the path, edging along the drive
  const stones = [];
  for (let i = 0, z = H.path.z1 - 0.3; z > H.path.z0 + 0.2; i++, z -= 0.56) {
    stones.push({ geo: new RoundedBoxGeometry(0.62 + rnd(i, 41) * 0.16, 0.04, 0.42 + rnd(i, 42) * 0.06, 2, 0.015), at: [H.door.x + (rnd(i, 43) - 0.5) * 0.12, -0.017, z], rot: [0, (rnd(i, 44) - 0.5) * 0.25, 0], color: [0xd8cfc4, 0xc8bfb6, 0xe0d6c8][i % 3] });
  }
  for (const x of [H.drive.x0, H.drive.x1]) for (let z = H.drive.z1; z > H.pavement[1]; z -= 0.8) stones.push({ geo: new RoundedBoxGeometry(0.1, 0.06, 0.78, 2, 0.02), at: [x, 0, z - 0.4], color: 0xbdb5ab });
  g.add(merged(stones, M.stone));

  // hedges along the front and the left, gate posts at the path, the mailbox, the fence along the drive
  g.add(hedge([H.hedge.x0, H.hedge.z], [H.hedge.x1, H.hedge.z]), hedge([H.hedge.side, -1.2], [H.hedge.side, H.hedge.z - 0.3], { seed: 9 }));
  const posts = [];
  for (const x of [H.path.x0 - 0.12, H.path.x1 + 0.12]) {
    posts.push({ geo: new RoundedBoxGeometry(0.28, 1.15, 0.28, 3, 0.05), at: [x, 0.575, H.hedge.z], color: 0xd9cfc3 });
    posts.push({ geo: new THREE.SphereGeometry(0.11, 16, 12), at: [x, 1.25, H.hedge.z], color: 0xd9cfc3 });
  }
  g.add(merged(posts, M.stone));
  const mb = build(mailbox()); mb.group.rotation.y = Math.PI; mb.group.position.set(H.path.x1 + 0.55, 0, H.hedge.z - 0.1); g.add(mb.group);
  const fence = [];
  for (let z = H.fence.z0; z < H.fence.z1; z += 0.16) fence.push({ geo: new RoundedBoxGeometry(0.03, 0.8, 0.08, 2, 0.012), at: [H.fence.x, 0.4, z], color: 0xf4ecdc });
  for (const y of [0.25, 0.62]) fence.push({ geo: new RoundedBoxGeometry(0.03, 0.07, H.fence.z1 - H.fence.z0, 1, 0.012), at: [H.fence.x + 0.03, y, (H.fence.z0 + H.fence.z1) / 2], color: 0xeae0cc });
  g.add(merged(fence, M.vc));

  // flower bed along the house front: low bushes and dots of flowers
  const bushes = [], flowers = [];
  for (let i = 0; i < 9; i++) {
    const x = H.bed.x0 + 0.4 + i * ((H.bed.x1 - H.bed.x0 - 0.8) / 8);
    if (x > W.x0 - 0.3 && x < W.x1 + 0.3 && i % 2) continue;
    bushes.push({ type: 'ell', c: [x, 0.18, -2.95 + (rnd(i, 61) - 0.5) * 0.2], r: [0.34, 0.3 + rnd(i, 62) * 0.15, 0.3], k: 0.1 });
  }
  g.add(softMesh(bushes, { h: 0.025, material: leafy(0x4f8f4a, 6) }));
  const cols = [0xf2a6b8, 0xf6d98a, 0xffffff, 0xe8736a, 0xc98ae0];
  // flowers sit in clusters on the bushes' fronts and tops
  bushes.forEach((b, j) => { for (let i = 0; i < 22; i++) {
    const a = rnd(j * 40 + i, 71) * Math.PI - Math.PI, e = rnd(j * 40 + i, 72) * 1.2, r = b.r[0] * 0.98;
    flowers.push({ geo: new THREE.IcosahedronGeometry(0.028, 1), at: [b.c[0] + Math.sin(a) * Math.cos(e) * r, b.c[1] + Math.sin(e) * b.r[1] * 0.95, b.c[2] - Math.abs(Math.cos(a)) * Math.cos(e) * b.r[2]], scale: [1, 0.75, 1], color: cols[(j + (i % 3 === 0 ? 1 : 0)) % cols.length] });
  } });
  g.add(merged(flowers, M.vcSoft));

  // trees: the big one on the lawn, one at the end of the drive, three behind the house showing over the roof
  for (const [x, z, o] of [[10.8, -7.2, { seed: 2, h: 6.2, r: 2.3, trunkR: 0.24 }], [-6.2, -7.5, { seed: 17, h: 2.9, r: 1.15, trunkR: 0.11, colorLeaf: 0x7a9a50 }], [6.8, 1.6, { seed: 5, h: 5.2, r: 1.8, colorLeaf: 0x648a4c }],
    [-6.5, 7, { seed: 7, h: 8.5, r: 2.8, colorLeaf: 0x4f8a52 }], [3.0, 7.8, { seed: 11, h: 7.6, r: 2.4 }], [-1.5, 13, { seed: 13, h: 9.5, r: 3.2, colorLeaf: 0x55905a }]]) {
    const t = tree(o); t.position.set(x, 0, z); g.add(t);
  }
}

// ───────────── the neighbourhood and the sky ─────────────
// A neighbour's cottage, as one mesh: walls on a darker plinth, a gabled roof with a fascia, a door in a frame,
// windows with sills and glazing bars (the panes glow at dusk), a chimney on the ridge.
// Its gable ends have two windows each with shutters, a drainpipe runs down a front corner, and `climber` (-1 or 1:
// the side, as x) grows a climbing rose up that end. → { parts, leaves } (leaves: for the foliage's mesh)
function cottage({ x, z, w, d, h, roofH, wall, roof, door, face = -1, shutter = 0x5f8f7a, climber = 0 }) {
  const parts = [], leaves = [], fz = z + face * d / 2, wallC = new THREE.Color(wall), plinth = wallC.clone().multiplyScalar(0.78).getHex();
  for (const s of [-1, 1]) {
    const sx = x + s * w / 2;
    for (const u of [-0.22, 0.22]) {
      const wz = z + u * d;
      parts.push({ geo: new RoundedBoxGeometry(0.12, 1.1, 1.2, 2, 0.03), at: [sx, 1.55, wz], color: 0xf3ead8 });
      parts.push({ geo: new RoundedBoxGeometry(0.12, 0.9, 1.0, 1, 0.02), at: [sx + s * 0.02, 1.55, wz], color: 0x8aa0bc, glow: 1 });
      parts.push({ geo: new THREE.BoxGeometry(0.06, 0.9, 0.05), at: [sx + s * 0.07, 1.55, wz], color: 0xf3ead8 });
      parts.push({ geo: new THREE.BoxGeometry(0.06, 0.05, 1.0), at: [sx + s * 0.07, 1.55, wz], color: 0xf3ead8 });
      parts.push({ geo: new RoundedBoxGeometry(0.2, 0.08, 1.35, 1, 0.02), at: [sx + s * 0.08, 0.97, wz], color: 0xf3ead8 });
      for (const k of [-1, 1]) parts.push({ geo: new RoundedBoxGeometry(0.05, 1.12, 0.5, 2, 0.015), at: [sx + s * 0.04, 1.55, wz + k * 0.88], color: shutter });
    }
    // a drainpipe from the eave's gutter down the front corner, with a shoe at its foot
    const px = sx - s * 0.12, pz = fz + face * 0.1;
    parts.push({ geo: new THREE.CylinderGeometry(0.045, 0.045, h + 0.05, 10), at: [px, h / 2, pz], color: 0xe8e0d2 });
    parts.push({ geo: new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), at: [px, h * 0.55, pz], color: 0xd8cfc0 });
    parts.push({ geo: new RoundedBoxGeometry(0.16, 0.08, 0.16, 1, 0.02), at: [px, 0.04, pz + face * 0.03], color: 0xd8cfc0 });
    // the climbing rose: a stem and clumps up the wall by the front window, with pink dots
    if (s === climber) {
      // three canes fanning up from one root by the front corner, the last arching along under the eave; small
      // leafy clumps along them (flat against the wall), a few roses among the leaves
      const root = [fz - face * 0.5, 0], tips = [[fz - face * 0.25, h - 0.35], [fz - face * 1.0, h - 0.3], [fz - face * 2.6, h - 0.4]];
      tips.forEach(([tz, ty], c) => {
        const n = c === 2 ? 16 : 10;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n, k = c * 50 + i, bend = c === 2 ? Math.min(1, u * 1.6) : u;
          const cz = root[0] + (tz - root[0]) * (c === 2 ? Math.max(0, u * 1.6 - 0.6) / 1.0 : u) + (rnd(k, 91) - 0.5) * 0.2;
          const cy = root[1] + 0.2 + (ty - root[1] - 0.2) * bend + (rnd(k, 92) - 0.5) * 0.18, r = 0.13 + rnd(k, 93) * 0.1 + (1 - u) * 0.05;
          leaves.push({ geo: new THREE.SphereGeometry(1, 10, 8), at: [sx + s * 0.07, cy, cz], scale: [r * 0.45, r * 0.85, r], color: [0x4f7f45, 0x5b8c4c, 0x46743f, 0x6a9a52][k % 4] });
          if (rnd(k, 94) < 0.45) leaves.push({ geo: new THREE.IcosahedronGeometry(0.038, 1), at: [sx + s * (0.07 + r * 0.42), cy + (rnd(k, 95) - 0.5) * r, cz + (rnd(k, 96) - 0.5) * r], color: [0xf2a6b8, 0xe8736a, 0xfff2f2][k % 3] });
        }
      });
    }
  }
  parts.push({ geo: new RoundedBoxGeometry(w, h, d, 2, 0.06), at: [x, h / 2, z], color: wall });
  parts.push({ geo: new RoundedBoxGeometry(w + 0.08, 0.4, d + 0.08, 2, 0.03), at: [x, 0.2, z], color: plinth });
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.4, 0), new THREE.Vector2(d / 2 + 0.4, 0), new THREE.Vector2(0, roofH)]);
  const rg = new THREE.ExtrudeGeometry(tri, { depth: w + 0.6, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  rg.translate(0, 0, -(w + 0.6) / 2); rg.rotateY(Math.PI / 2);
  parts.push({ geo: rg, at: [x, h - 0.05, z], color: roof });
  parts.push({ geo: new RoundedBoxGeometry(w + 0.7, 0.14, 0.08, 1, 0.02), at: [x, h - 0.08, fz + face * 0.44], color: 0xf3ead8 });
  const dx = x - w * 0.18;
  parts.push({ geo: new RoundedBoxGeometry(1.15, 2.2, 0.1, 2, 0.03), at: [dx, 1.1, fz], color: 0xf3ead8 });
  parts.push({ geo: new RoundedBoxGeometry(0.92, 2.02, 0.1, 2, 0.03), at: [dx, 1.01, fz + face * 0.03], color: door });
  for (const u of [0.2, -0.42]) {
    const wx = x + u * w;
    if (Math.abs(wx - dx) < 1.1) continue;
    parts.push({ geo: new RoundedBoxGeometry(1.2, 1.1, 0.12, 2, 0.03), at: [wx, 1.55, fz], color: 0xf3ead8 });
    parts.push({ geo: new RoundedBoxGeometry(1.0, 0.9, 0.12, 1, 0.02), at: [wx, 1.55, fz + face * 0.02], color: 0x8aa0bc, glow: 1 });
    parts.push({ geo: new THREE.BoxGeometry(0.05, 0.9, 0.06), at: [wx, 1.55, fz + face * 0.07], color: 0xf3ead8 });
    parts.push({ geo: new THREE.BoxGeometry(1.0, 0.05, 0.06), at: [wx, 1.55, fz + face * 0.07], color: 0xf3ead8 });
    parts.push({ geo: new RoundedBoxGeometry(1.35, 0.08, 0.2, 1, 0.02), at: [wx, 0.97, fz + face * 0.08], color: 0xf3ead8 });
  }
  parts.push({ geo: new RoundedBoxGeometry(0.75, 2.0, 0.75, 2, 0.06), at: [x + w * 0.3, h + roofH * 0.62, z + d * 0.12], color: 0xb87258 });
  parts.push({ geo: new RoundedBoxGeometry(0.9, 0.14, 0.9, 2, 0.04), at: [x + w * 0.3, h + roofH * 0.62 + 1.0, z + d * 0.12], color: 0xe2d6c4 });
  return { parts, leaves };
}

function neighbourhood(g, M) {
  const P0 = [], L0 = [], A = (o) => { const c = cottage(o); P0.push(...c.parts); L0.push(...c.leaves); };
  // beside us (facing the street) and across the street (facing us); the one on the right shows its whole side to the
  // drive (shots there look across the fence at it), so it is a warm apricot render, not a sage that the low sun on
  // that end washed to a near-white lime, with a rose climbing it
  A({ x: -15, z: 1, w: 8, d: 8, h: 3.2, roofH: 3.2, wall: 0xe9c9a0, roof: 0xa4b0cc, door: 0x3f8c8e, climber: 1 });
  A({ x: 16.5, z: 0, w: 7.5, d: 8, h: 3.0, roofH: 2.8, wall: 0xd9b48c, roof: 0xd8866c, door: 0xdba23e, shutter: 0x4f8a8c, climber: -1 });
  A({ x: -14, z: -26, w: 8.5, d: 7, h: 3.3, roofH: 3.0, wall: 0xf0d9b5, roof: 0xcc806a, door: 0x4f6f9e, face: 1 });
  A({ x: -1, z: -27, w: 7, d: 7, h: 3.0, roofH: 3.4, wall: 0xe6d8c0, roof: 0xb88aa4, door: 0xc9654a, face: 1 });
  A({ x: 12, z: -26.5, w: 8, d: 7, h: 3.2, roofH: 2.9, wall: 0xf2e2c4, roof: 0x9cb8a2, door: 0xd2493a, face: 1 });
  A({ x: 26, z: -27, w: 7, d: 7, h: 3.0, roofH: 3.0, wall: 0xe6c4b0, roof: 0xa4b0cc, door: 0x3f8c8e, face: 1 });
  A({ x: -27, z: -26, w: 7, d: 7, h: 3.1, roofH: 3.1, wall: 0xdfe6cf, roof: 0xd8866c, door: 0xdba23e, face: 1 });
  g.add(merged(P0, M.cottage));
  // hedges and low walls in front of the far houses
  const front = [];
  for (const [x0, x1] of [[-30, -16.5], [-12, -2.5], [0.5, 10.5], [13.5, 30]]) front.push({ geo: new RoundedBoxGeometry(x1 - x0, 0.8, 0.6, 2, 0.25), at: [(x0 + x1) / 2, 0.4, -20.5], color: 0x52784a });
  g.add(merged(front, M.vcSoft));
  // trees round about: round crowns on short trunks, a few taller ones
  const trees = [];
  const ring = [];
  for (let i = 0; i < 26; i++) ring.push([-34 + i * 2.7 + rnd(i, 81) * 1.5, -33 - rnd(i, 82) * 6]);
  for (let i = 0; i < 18; i++) ring.push([-30 + i * 3.6 + rnd(i, 83) * 2, 16 + rnd(i, 84) * 12]);
  for (let i = 0; i < 10; i++) ring.push([-26 - rnd(i, 85) * 6, -14 + i * 3.4]);
  for (let i = 0; i < 10; i++) ring.push([24 + rnd(i, 86) * 6, -14 + i * 3.4]);
  ring.push([-20.5, -21], [-8, -21.5], [6, -21.5], [19, -21.2], [-10, 8], [11, 9], [-21, 5], [22, 4]);
  // (none on the street: the pavements, the kerbs and the road run from z -20 to -9.5 the whole width)
  ring.forEach(([x, z], i) => {
    if (z > -20.3 && z < -9.4) return;
    const s = 1.4 + rnd(i, 87) * 1.6, hh = s * (1.2 + rnd(i, 88) * 0.6), c = [0x587f50, 0x678f58, 0x739a60, 0x52784f][i % 4];
    trees.push({ geo: new THREE.CylinderGeometry(0.12 * s, 0.18 * s, hh, 8), at: [x, hh / 2, z], color: 0x6a4a38 });
    trees.push({ geo: new THREE.SphereGeometry(1, 20, 14), at: [x, hh + s * 0.55, z], scale: [s, s * (1.05 + rnd(i, 89) * 0.4), s], color: c });
    trees.push({ geo: new THREE.SphereGeometry(1, 16, 12), at: [x + s * 0.5, hh + s * 0.2, z + 0.3], scale: [s * 0.7, s * 0.65, s * 0.7], color: c });
  });
  // (the round crowns take no shadows: on their coarse facets a low sun's shadow picture drew stripes, and nothing
  // near them throws one that would show)
  const far = merged([...trees, ...L0], M.foliage); far.receiveShadow = false; g.add(far);
  // The distance: two rings of long, low rises (a near one, greener, with a row of trees along each crest; a far one
  // paler behind it), each rise a flat half-ellipsoid turned along the ring, overlapping its neighbours so the skyline
  // undulates instead of standing up as one dome. The air fades them toward the hour's haze (buildHome).
  const hills = [];
  const RINGS = [{ R: 60, n: 14, rx: [16, 26], ry: [3.2, 5.5], c: [0x7ea278, 0x88aa7c, 0x759c72], trees: true, k: 0 }, { R: 74, n: 12, rx: [22, 32], ry: [5, 8.5], c: [0x97b8a2, 0x9fbfaa, 0x8fb39c], trees: false, k: 1 }];
  for (const { R, n, rx: [a0, a1], ry: [b0, b1], c, trees: wood, k } of RINGS) for (let i = 0; i < n; i++) {
    const ang = (i + 0.5 * k + (rnd(i, 101 + k) - 0.5) * 0.4) / n * Math.PI * 2, rr = R + (rnd(i, 103 + k) - 0.5) * 8;
    const x = Math.sin(ang) * rr, z = -6 + Math.cos(ang) * rr, rx = a0 + (a1 - a0) * rnd(i, 105 + k), ry = b0 + (b1 - b0) * rnd(i, 107 + k), yaw = ang;      // (long along the ring)
    hills.push({ geo: new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), at: [x, -0.3, z], rot: [0, yaw, 0], scale: [rx, ry, rx * 0.35], color: c[i % c.length] });
    if (!wood) continue;
    // trees along the crest, darker than the grass, a few in a clump
    // (two or three clumps of overlapping low crowns, sunk into the slope: a woodland edge, not a row of lollipops)
    for (let j = 0; j < 12; j++) {
      const clump = (Math.floor(j / 4) - 1) * 0.45 + (rnd(i, 113) - 0.5) * 0.2, u = clump + (rnd(i * 12 + j, 109) - 0.5) * 0.22;
      const ty = ry * Math.sqrt(Math.max(0, 1 - u * u)) - 0.3, s = 0.9 + rnd(i * 12 + j, 111) * 0.9;      // (the crest there)
      const tx = x + Math.cos(yaw) * u * rx, tz = z - Math.sin(yaw) * u * rx;
      hills.push({ geo: new THREE.SphereGeometry(1, 12, 8), at: [tx, ty + s * 0.35, tz], scale: [s * 1.3, s * 0.9, s * 1.3], color: [0x5a7f55, 0x618a5a, 0x6a915e][j % 3] });
    }
  }
  g.add(merged(hills, M.hill));
}

// The sky: a dome painted by formula from the direction looked in: deep at the top, pale and warm at the horizon,
// brightest toward the sun, with a few soft clouds. Its colours are the hour's (set by light()).
function sky(g, U) {
  const C = new THREE.Vector3(0, 0, -6), mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const d = normalize(positionWorld.sub(vec3(C.x, C.y, C.z))), up = max(d.y, 0);
  let c = mix(U.horizon, U.zenith, smoothstep(0.0, 0.55, pow(up, 0.8)));
  const toSun = max(dot(d, U.sunDir.negate()), 0);
  c = c.add(U.glow.mul(pow(toSun, 6.0).mul(0.6).add(pow(toSun, 60.0).mul(0.8))).mul(smoothstep(-0.05, 0.25, d.y).oneMinus().mul(0.6).add(0.4)));
  const pl = vec2(d.x, d.z).div(max(d.y, 0.06));            // a flat layer of cloud above
  const cl = mx_fractal_noise_float(vec3(pl.x.mul(0.6), pl.y.mul(1.4), 2.0), 4, 2.0, 0.5).mul(0.5).add(0.5);
  const puff = smoothstep(0.58, 0.72, cl).mul(smoothstep(0.03, 0.12, d.y)).mul(smoothstep(0.9, 0.5, d.y));
  const lit = mx_noise_float(vec3(pl.x.mul(1.2).add(0.3), pl.y.mul(2.8), 5.0)).mul(0.5).add(0.5);
  c = mix(c, mix(U.cloudShade, U.cloudLit, smoothstep(0.35, 0.75, lit.mul(0.6).add(toSun.mul(0.6)))), puff.mul(0.9));
  mat.colorNode = c;
  mat.depthWrite = true;
  const m = new THREE.Mesh(new THREE.SphereGeometry(85, 64, 32), mat); m.position.copy(C); m.castShadow = m.receiveShadow = false;
  g.add(m);
}

// ───────────── light ─────────────
// One sun for the place: late, low, from the front left as seen from the garden, so it rakes across the house front
// and comes in at the big window (and the room's side windows) in broad shafts. Indoors keeps the room's tuned
// fills; outdoors has more sky. At twilight the lamp in the room and the lantern by the door are lit.
const G = LIGHTS.golden, T = LIGHTS.twilight;
const sunGolden = { ...G.sun, az: 58, el: 13 }, sunTwilight = { ...T.sun, az: 58, el: 3, power: 0.55 };
// (outdoors the grades were set against the engine's look gate, tools/look.mjs; see README "Tone")
export const HOME_LIGHTS = {
  golden: {
    // (indoors the fills are cream, not the engine's lilac: the room read lilac-grey against the reference)
    inside: { ...G, sun: sunGolden, sky: { color: 0xf0dcc8, power: 0.24 }, shade: { color: 0xf0dcc8, power: 0.5 }, bounce: 1.0,
      air: { ...G.air, density: 0.04 }, grade: { ...G.grade, shadows: [1.0, 0.97, 0.94] } },
    // (the sky fill a soft lavender and stronger than it was (0xa9c2f2 at 0.5): what faces up in shade, a car's bonnet,
    // the lawn under a tree, is lit by the whole sky outdoors; the light in the air, now the garden's, gives the low
    // sun its warm veil and the trees' shadows soft shafts)
    outside: { ...G, sun: { ...sunGolden, power: 2.3 }, sky: { color: 0xb4bce8, power: 0.7 }, shade: { color: 0xe8d8c4, power: 0.75 }, ground: { color: 0xd8d0a0, power: 0.36 },
      air: { ...G.air, density: 0.008 }, grade: { ...G.grade, contrast: 1.1, exposure: 0.62 } },
    sky: { zenith: 0x6f9fdc, horizon: 0xf6dcb0, glow: 0xffd49a, cloudLit: 0xfff0d8, cloudShade: 0xc8b4c8 }, porch: 0, haze: { color: 0xeedcbc, amount: 1 },
  },
  twilight: {
    inside: { ...T, sun: sunTwilight, sky: { ...T.sky, power: 0.3 }, shade: { ...T.shade, power: 0.3 }, ground: { ...T.ground, power: 0.15 },
      lamp: { color: 0xffb468, power: 2.4 }, grade: { ...T.grade, contrast: 0.85, glow: 0.12 } },
    // (outdoors at dusk: slate-blue fills that lean grey, not violet, a dark green ground, a cool lift, the sun too
    // weak to throw a hard shadow, and the room's lamp amber and strong enough that the lit window reads warm; the
    // sky fill and the gentle curve keep the house, the garden and the car readable: the ending measured median luma
    // 31 against the darkest reference's 40 with contrast 1.4 and a warm lift that turned the dark teal car olive)
    outside: { ...T, sun: { ...sunTwilight, power: 0.08 }, sky: { color: 0x5a6a90, power: 0.8 }, shade: { color: 0x7a6860, power: 0.85 }, ground: { color: 0x34462e, power: 0.3 },
      lamp: { color: 0xffa04a, power: 5 }, air: { ...T.air, density: 0 },      // (the air glows by its own colour, not the sun's strength: at dusk over the garden it was a pink fog)
      grade: { ...T.grade, exposure: 1.9, contrast: 0.9, saturation: 1.0, shadows: [1.0, 0.98, 1.0], lift: 0x12111a, glow: 0.12 } },
    sky: { zenith: 0x5a6cc0, horizon: 0xffcca0, glow: 0xffc080, cloudLit: 0xffd8b8, cloudShade: 0x5a5a9a }, porch: 1, haze: { color: 0x3e4462, amount: 0.8 },
  },
};
const ROOM_BOX = [[ROOM.left, 0, ROOM.back - 0.05], [ROOM.right + 0.05, ROOM.top, 6.3]];
// outdoors the sun's shadow picture covers the garden, the drive, the street both ways and the far pavement (a
// surface off its edge sampled past the picture and showed a long false shadow)
const YARD_BOX = [[-16, -0.1, -21], [20, 9, 4]];
// the room's lamp: indoors it is the floor lamp's bulb; seen from the garden it is cheated to just inside the big
// window, above and in front of anyone standing at it (the floor lamp stands far to the side of it), so the window
// glows and the faces in it are lit warm, not by the blue dusk
const LAMP = { inside: [1.72, 1.56, -1.78], outside: [-2.1, 2.2, -1.5] };
const AIR = [[ROOM.left, 0, ROOM.back - 0.05], [ROOM.right + 0.05, ROOM.top, 2]];
// outdoors the light in the air is the garden's and the street's, in front of the house (the sun under the trees and
// past the house's corner draws soft warm shafts; the room seen through the window stays clear)
const YARD_AIR = [[-16, 0, -21], [20, 7, H.front - 0.1]];

// ───────────── the door ─────────────
/** The door's swing as a pure function of time: cues [{ t, to, w, z }] (to: 0 shut, 1 fully open; w: how fast, in
 * radians a second; z: damping, below 1 overshoots). Opening defaults to a fling that bangs on its stop and
 * settles; shutting to a soft close that just taps the frame. → (t) → pose value 0..1. */
export function doorSwing(cues = []) {
  const list = [...cues].sort((a, b) => a.t - b.t);
  const resp = (tau, w, z) => { if (tau <= 0) return 0; const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + z * w / wd * Math.sin(wd * tau)); };
  const at = (t, n) => {
    if (n === 0) return 0;
    const c = list[n - 1], from = at(c.t, n - 1), opening = c.to > from, w = c.w ?? (opening ? 11 : 5), z = c.z ?? (opening ? 0.42 : 0.8);
    // shut: from the moment it first reaches the frame, the latch holds it
    if (c.to === 0 && !opening && z < 1 && t - c.t >= (Math.PI - Math.atan2(w * Math.sqrt(1 - z * z), z * w)) / (w * Math.sqrt(1 - z * z))) return 0;
    return Math.min(1, Math.max(0, from + (c.to - from) * resp(t - c.t, w, z)));      // the stop behind it; the frame in front of it
  };
  return (t) => at(t, list.filter((c) => c.t <= t).length);
}

// ───────────── the whole place ─────────────
/** Builds the place on a stage: the living room as the engine dresses it, plus the house, the garden, the street,
 * the neighbourhood and the sky. door: cues for doorSwing. → { update(t), light(time, side), door, anchors, ... } */
export function buildHome(stage, { door = [] } = {}) {
  // the room without its painted garden (this place has a real one), with the doorway into the hall
  const room = livingRoom(stage, { garden: false, door: H.opening });

  const U = {
    zenith: uniform(new THREE.Color()), horizon: uniform(new THREE.Color()), glow: uniform(new THREE.Color()), cloudLit: uniform(new THREE.Color()), cloudShade: uniform(new THREE.Color()),
    sunDir: uniform(new THREE.Vector3(0, -1, 0)), porch: uniform(0), haze: uniform(new THREE.Color()), hazeK: uniform(1),
  };
  const vc = paint({ vertexColors: true, mottle: 0.06, scatter: 0.2, rim: 0.5 });
  const M = {
    ext: renderPaint(0xe2caa2), trim: paint({ color: 0xf5ecdc, mottle: 0.05, rim: 0.5 }), roof: tilePaint(0xb5604a, 'x'), roofW: tilePaint(0xb5604a, 'z'), roofDark: paint({ color: 0x8a4a3c, mottle: 0.08 }),
    ceiling: paint({ color: 0xe6dccb, mottle: 0.04, rim: 0 }), wood: paint({ color: 0x7a5238, mottle: 0.1 }), runner: paint({ color: 0x7b4a68, mottle: 0.12, mottleScale: 9 }),
    hallFloor: paint({ color: 0xffffff, mottle: 0.05, rim: 0.2, pattern: () => { const p = positionWorld, q = floor(p.x.div(0.3)).add(floor(p.z.div(0.3))); return mix(color(0xeadfcc), color(0xc08a70), fract(q.mul(0.5)).mul(2)); } }),
    ground: groundPaint(), stone: paint({ vertexColors: true, mottle: 0.1, mottleScale: 8, scatter: 0.1, rim: 0.4 }), vc,
    vcSoft: paint({ vertexColors: true, mottle: 0.08, scatter: 0.5, rim: 0.8 }),
    foliage: paint({ vertexColors: true, ...leafy(0xffffff, 1.2) }),
    hill: paint({ vertexColors: true, mottle: 0.12, mottleScale: 0.09, scatter: 0.1, rim: 0.2 }),
    cottage: paint({ vertexColors: true, mottle: 0.06, scatter: 0.15, rim: 0.4 }),
  };
  M.cottage.emissiveNode = color(0xffb060).mul(attribute('glow', 'float')).mul(U.porch).mul(1.2);
  // the air between: far things go toward the hour's haze (light.haze: by day the pale of the sky's horizon, at dusk a
  // dark blue-grey) with distance, the hills most and the trees round about a little, so the distance reads as
  // distance and not as painted shapes standing up against the sky
  for (const [m, near, far, most] of [[M.hill, 25, 80, 0.62], [M.foliage, 25, 70, 0.3]]) {
    const haze = smoothstep(near, far, length(positionWorld.sub(cameraPosition))).mul(most).mul(U.hazeK);
    m.colorNode = m.colorNode.mul(haze.oneMinus()); m.emissiveNode = U.haze.mul(haze);
  }
  const g = new THREE.Group(); g.name = 'home'; stage.scene.add(g);
  const { wing, lamp } = house(g, M);
  backWall(g);
  garden(g, M);
  neighbourhood(g, M);
  sky(g, U);
  // the lantern glows at dusk: its glass, and a soft halo in the air round it
  const glass = lamp.parts.glass.children[0];
  glass.material = paint({ color: 0xffe2a8, mottle: 0.02, rim: 1 }); glass.material.emissiveNode = color(0xffc070).mul(U.porch).mul(2.2);
  const lampAt = new THREE.Vector3(); lamp.group.updateMatrixWorld(true); glass.getWorldPosition(lampAt); lampAt.y += 0.1;
  const halo = new THREE.MeshBasicNodeMaterial(); halo.transparent = true; halo.blending = THREE.AdditiveBlending; halo.depthWrite = false; halo.depthTest = false;
  const ray = normalize(positionWorld.sub(cameraPosition)), rel = vec3(lampAt.x, lampAt.y, lampAt.z).sub(cameraPosition), dd = length(cross(rel, ray));
  halo.colorNode = color(0xffb060).mul(exp(dd.div(0.32).pow(2).negate()).mul(0.55).add(exp(dd.div(0.09).pow(2).negate()).mul(0.6))).mul(U.porch).mul(stage.softDepth(0.15)).mul(step(cameraPosition.z, H.front));      // (seen from outside only: indoors it shone through the door)
  const haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), halo); haloMesh.position.copy(lampAt); haloMesh.frustumCulled = false; stage.air.add(haloMesh);

  // (the doors that swing, for the motion checks: checks.mjs doorSweep)
  g.userData.doors = [{ name: 'the front door', leaf: wing.parts.door.children[0], root: wing.group }];
  const swing = doorSwing(door);
  function light(time = 'golden', side = 'inside') {
    const L = HOME_LIGHTS[time];
    if (!L) throw new Error(`home: no light "${time}" (it has ${Object.keys(HOME_LIGHTS).join(', ')})`);
    stage.setLight(L[side]);
    stage.setSun(side === 'inside' ? { box: ROOM_BOX, depth: 14, air: AIR } : { box: YARD_BOX, depth: 8, air: YARD_AIR });
    for (const k of ['zenith', 'horizon', 'glow', 'cloudLit', 'cloudShade']) U[k].value.set(L.sky[k]);
    U.sunDir.value.set(...sunDir(L[side].sun.az, L[side].sun.el));
    U.porch.value = L.porch; U.haze.value.set(L.haze.color); U.hazeK.value = L.haze.amount;
    stage.lamp.position.set(...LAMP[side]);
  }
  light('golden', 'inside');
  return {
    group: g, door: wing, lantern: lamp, light, swing,
    update(t) { room.update(t); wing.pose({ door: swing(t) }); },
  };
}
