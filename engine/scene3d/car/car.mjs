// The car as meshes: the kit's parts (car/shape.mjs) built, regrouped into what the suspension carries and what
// stays on the road, and given what the kit has no solid for: see-through glass, the painted seams, lamps that
// light up, and a soft shadow on the ground under it. No GPU is started here.
//
//   const car = buildCar({ color: 0x3e9c9a });
//   stage.scene.add(car.group);
//   car.set({ ... })            // see set() below; drive.mjs calls it from the plan at any time t
import * as THREE from 'three/webgpu';
import { float, vec3, color, mix, smoothstep, abs, max, min, uniform, positionLocal, normalView, positionViewDirection, pow, saturate, sin, length, vec2 } from 'three/tsl';
import { paint, colourPassOnly } from '../materials.mjs';
import { build } from '../shape.mjs';
import carShape, { CAR, COLORS, skin } from './shape.mjs';

const C = CAR;

// ───────────── glass ─────────────
// A pane of glass `inset` inside the skin, over a rectangle bigger than its window (the wall hides the edges):
// `axis` 0 (a side window, seen from sign x) or 2 (windscreen +1, back window -1); the rectangle spans [a0, a1] x
// [b0, b1] over the other two axes (z, y for a side; x, y for the front and back). Points are found by walking in
// from outside along the axis; only where `on(point)` says the glass belongs to this window. → BufferGeometry
// in the car's coordinates.
function pane(f, axis, sign, [a0, a1], [b0, b1], on, inset = 0.028, n = [22, 14]) {
  const [ia, ib] = axis === 0 ? [2, 1] : [0, 1], pos = [], nrm = [], idx = [], miss = [], e = 1e-3;
  for (let j = 0; j <= n[1]; j++) for (let i = 0; i <= n[0]; i++) {
    const p = [0, 0, 0];
    p[ia] = a0 + (a1 - a0) * i / n[0]; p[ib] = b0 + (b1 - b0) * j / n[1];
    let lo = 0, hi = 2.2;                         // depth along the axis from outside: bisect for f = -inset
    const at = (s) => { p[axis] = sign * (2.2 - s); return f(...p) + inset; };
    let s = 0; while (s < hi && at(s) > 0) s += 0.01;
    miss.push(s >= hi || !on(p));   // (a ray past the shell, or one that met it away from this window: no glass there)
    lo = Math.max(0, s - 0.01); hi = s;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (at(m) > 0) lo = m; else hi = m; }
    at(hi);
    const g = [0, 1, 2].map((q) => { const a = [...p], b = [...p]; a[q] += e; b[q] -= e; return f(...a) - f(...b); }), gl = Math.hypot(...g) || 1;
    pos.push(...p); nrm.push(...g.map((v) => v / gl));
  }
  const w = n[0] + 1;
  for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    if (!miss[a] && !miss[b] && !miss[c] && !miss[d]) idx.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}
const bbox = (outline, g = 0.05) => {
  const zs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  return [[Math.min(...zs) - g, Math.max(...zs) + g], [Math.min(...ys) - g, Math.max(...ys) + g]];
};

// Glass: a pale sky sheen, more of it where the pane is seen edge-on, and two soft diagonal streaks of light; the
// rest lets through what is behind it.
function glassMaterial() {
  const m = paint({ color: 0x9fb8c8, mottle: 0, scatter: 0, rim: 0.6, brush: 0 });
  const p = positionLocal, edge = pow(saturate(float(1).sub(abs(normalView.dot(positionViewDirection)))), 2.5);
  const u = p.y.add(p.z.mul(0.55)).add(p.x.mul(0.55)).mul(2.2);
  const streak = smoothstep(0.86, 0.97, sin(u.mul(3.1)).mul(0.5).add(0.5)).mul(smoothstep(0.3, 0.9, sin(u.mul(0.7).add(1.3)).mul(0.5).add(0.5)));
  m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide;
  m.colorNode = mix(color(0x9fb8c8), color(0xe8f4f8), streak);
  m.opacityNode = colourPassOnly(min(float(0.06).add(edge.mul(0.3)).add(streak.mul(0.22)), 0.6));
  m.alphaTest = 0.005;
  return m;
}

// ───────────── seams ─────────────
// Corners of an outline rounded by their radius, as a polyline.
function rounded(outline, k = 5) {
  const out = [], n = outline.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = outline[i], A = outline[(i + n - 1) % n], B = outline[(i + 1) % n];
    if (!r) { out.push([x, y]); continue; }
    const la = Math.hypot(A[0] - x, A[1] - y), lb = Math.hypot(B[0] - x, B[1] - y);
    const a = [x + (A[0] - x) / la * r, y + (A[1] - y) / la * r], b = [x + (B[0] - x) / lb * r, y + (B[1] - y) / lb * r];
    for (let j = 0; j <= k; j++) { const s = j / k, q = [(1 - s) * a[0] + s * x, (1 - s) * a[1] + s * y], w = [(1 - s) * x + s * b[0], (1 - s) * y + s * b[1]]; out.push([(1 - s) * q[0] + s * w[0], (1 - s) * q[1] + s * w[1]]); }
  }
  return out;
}
// distance (node) from the point (u, v) to a closed polyline
function polyDist(u, v, pts) {
  let d = float(1e3);
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9;
    const t = saturate(u.sub(ax).mul(ex).add(v.sub(ay).mul(ey)).div(l2));
    d = min(d, length(vec2(u.sub(ax).sub(t.mul(ex)), v.sub(ay).sub(t.mul(ey)))));
  }
  return d;
}
// The body's paint: the colour, with the seams of the doors, the bonnet and the hatch drawn as fine dark lines. It
// keeps its hue in shade (paint keepHue): under the golden hour's blue-violet fill a mid teal went navy.
function bodyMaterial(hex) {
  const door = rounded(C.door);
  return paint({
    color: hex, mottle: 0.05, scatter: 0.2, rim: 1.1, keepHue: true,
    pattern: (_p, c) => {
      const p = positionLocal, ax = abs(p.x), w = 0.007;
      const side = smoothstep(0.5, 0.6, ax);
      // the passenger's door (the driver's is a real gap, drawn by the ink)
      let d = polyDist(p.z, p.y, door).div(side.mul(smoothstep(0, -0.02, p.x)).max(1e-3));
      d = min(d, abs(p.z.sub(C.bonnet)).add(smoothstep(0.92, 0.88, p.y)).add(smoothstep(0.7, 0.75, ax)));          // bonnet: across the cowl
      d = min(d, abs(ax.sub(0.66)).add(smoothstep(C.bonnet - 0.02, C.bonnet + 0.02, p.z).oneMinus()).add(smoothstep(0.8, 0.76, p.y)));  // and along the wings
      d = min(d, abs(ax.sub(0.72)).add(smoothstep(-1.72, -1.78, p.z).oneMinus()).add(smoothstep(0.5, 0.46, p.y)));      // hatch: its sides
      d = min(d, abs(p.y.sub(0.48)).add(smoothstep(-1.82, -1.86, p.z).oneMinus()).add(smoothstep(0.72, 0.76, ax)));      // and its foot
      const line = smoothstep(w, w * 0.35, d);
      return mix(c, c.mul(vec3(0.42, 0.45, 0.5)), line.mul(0.85));
    },
  });
}

// ───────────── lamps and shadow ─────────────
function lampMaterial(hex, glow, on) {
  const m = paint({ color: hex, mottle: 0.02, scatter: 0, rim: 2, brush: 0 });
  m.emissiveNode = color(glow).mul(on);
  return m;
}
// A soft dark pool on the ground under the car, darkest under its middle and at each tyre: the sky the car hides.
function groundShadow(strength = 0.42) {
  const L = C.len / 2 + 0.25, W = C.wid / 2 + 0.25;
  const geo = new THREE.PlaneGeometry(2 * L, 2 * W); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 2);
  const m = new THREE.MeshBasicNodeMaterial();
  const p = positionLocal;
  // a rounded box the size of the car's footprint, soft-edged
  const qx = max(abs(p.x).sub(C.wid / 2 - 0.35), 0), qz = max(abs(p.z).sub(C.len / 2 - 0.5), 0);
  const body = smoothstep(0.62, 0.0, length(vec2(qx, qz)));
  let tyres = float(0);
  for (const z of [C.axleF, C.axleR]) for (const s of [1, -1]) tyres = max(tyres, smoothstep(0.42, 0.05, length(vec2(p.x.sub(s * C.track).mul(1.6), p.z.sub(z)))));
  m.colorNode = color(0x2a1f30);
  m.opacityNode = colourPassOnly(max(body.mul(0.7), tyres).mul(strength));
  m.transparent = true; m.depthWrite = false; m.alphaTest = 0.002;
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = 0.004; mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = -1;
  return mesh;
}

const TAIL = 0x9c2622;
const WHEELS = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
const UNSPRUNG = ['steer_fl', 'steer_fr', 'wheel_rl', 'wheel_rr'];

/** The car's meshes. → { group (stand it on the road: position, rotation.y), body (the sprung part: pitch, roll,
 * heave about `pivot`), parts, marks, triangles, set(state), lights }. */
export function buildCar({ color: hex = COLORS.body } = {}) {
  const obj = build(carShape());
  const group = new THREE.Group(); group.name = 'car';
  const lifted = obj.group.children[0];            // the kit's group, lifted so the tyres stand on y = 0
  // what the springs carry: everything but the wheels and their knuckles
  // (the body part sits at the object's origin, so moving the wheels' pivots out of it keeps them where they are)
  const sprung = new THREE.Group(); sprung.name = 'car body';
  const pivot = new THREE.Vector3(0, 0.62, (C.axleF + C.axleR) / 2);       // the body pitches and rolls about here
  for (const h of [...lifted.children]) sprung.add(h);
  lifted.add(sprung);
  for (const n of UNSPRUNG) lifted.add(obj.parts[n].parent);
  group.add(obj.group);
  // materials the kit cannot make
  const paintBody = bodyMaterial(hex);
  for (const n of ['body', 'door', 'pod_l', 'pod_r']) obj.parts[n].children[0].material = paintBody;
  const on = { head: uniform(0), tail: uniform(0) };
  // (the tail lenses are a deeper red than the kit's, and glow hot: a red already near white in the sun showed no
  // change when the brakes came on)
  const head = lampMaterial(COLORS.lens, 0xffe2a8, on.head.mul(1.8)), tail = lampMaterial(TAIL, 0xff6a40, on.tail.mul(1.4));
  for (const n of ['headlight_l', 'headlight_r']) obj.parts[n].children[0].material = head;
  for (const n of ['taillight_l', 'taillight_r']) obj.parts[n].children[0].material = tail;
  // glass: windscreen, back window, the side windows (the driver's front one rides on the door)
  const f = skin(), glass = glassMaterial();
  const add = (parent, geo) => { const m = new THREE.Mesh(geo, glass); m.castShadow = false; m.receiveShadow = false; parent.add(m); return m; };
  const [fz, fy] = bbox(C.frontWin), [rz, ry] = bbox(C.rearWin);
  const within = (v, [lo, hi]) => v >= lo && v <= hi, [[z0, y0], [z1, y1]] = C.frontWin;
  const side = (p) => within(Math.abs(p[0]), [0.5, 1.0]), back = (p) => within(-p[2], [-C.back.b[0] - 0.25, -C.back.a[0] + 0.25]);
  // the windscreen wraps round into the pillars, but not past them into the side windows
  const front = (p) => within(p[2], [C.screen.top - 0.1, C.screen.front + 0.1]) && p[2] > z0 + (z1 - z0) * (p[1] - y0) / (y1 - y0) + C.screen.pillar / 2;
  add(obj.parts.body, pane(f, 0, -1, fz, fy, side));
  add(obj.parts.door, pane(f, 0, 1, fz, fy, side));
  add(obj.parts.body, pane(f, 0, 1, rz, ry, side)); add(obj.parts.body, pane(f, 0, -1, rz, ry, side));
  add(obj.parts.body, pane(f, 2, 1, [-0.9, 0.9], [C.screen.foot - 0.06, 1.9], front, 0.028, [30, 16]));
  add(obj.parts.body, pane(f, 2, -1, [-C.back.half - 0.06, C.back.half + 0.06], [C.back.a[1] - 0.06, C.back.b[1] + 0.06], back));
  const shadow = groundShadow(); group.add(shadow);
  // (its door, for the motion checks: checks.mjs doorSweep)
  group.userData.doors = [{ name: 'the car door', leaf: obj.parts.door.children[0], root: group }];
  const floor = lifted.position.y;
  const tris = Object.values(obj.triangles).reduce((a, b) => a + b, 0);
  return {
    group, body: sprung, pivot, obj, parts: obj.parts, marks: obj.marks, joints: obj.joints, triangles: tris, floor, lights: on, shadow,
    /** Pose: body { pitch, roll, heave } (radians, metres; pitch > 0 dips the nose), wheels { fl, fr, rl, rr }
     * (radians turned), steer { fl, fr } (radians, > 0 turns toward +x), wheel (the steering wheel, radians),
     * door 0 shut .. 1 open, head / tail lamp strength. */
    set({ body: b, wheels, steer, wheel, door, head: hl, tail: tl } = {}) {
      if (b) {
        sprung.position.set(0, 0, 0); sprung.rotation.set(0, 0, 0);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(b.pitch ?? 0, 0, b.roll ?? 0, 'ZXY'));
        const off = pivot.clone().sub(pivot.clone().applyQuaternion(q));
        sprung.quaternion.copy(q); sprung.position.copy(off).add(new THREE.Vector3(0, b.heave ?? 0, 0));
      }
      const pose = {};
      if (wheels) for (const [k, v] of Object.entries(wheels)) pose['wheel_' + k] = v;
      if (steer) for (const [k, v] of Object.entries(steer)) pose['steer_' + k] = (v * 180 / Math.PI + 40) / 80;
      if (wheel !== undefined) pose.steering = wheel;
      if (door !== undefined) pose.door = door;
      obj.pose(pose);
      if (hl !== undefined) on.head.value = hl;
      if (tl !== undefined) on.tail.value = tl;
    },
  };
}
export { CAR, COLORS, WHEELS };
