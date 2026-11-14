// Hard objects (furniture, vehicles, buildings, props) written by name. The manual is docs/scene3d-shapes.md.
//
// A solid is a distance field in its own space (metres; origin at the centre of its base, y up, front +z). Solids
// are set on each other's named faces with at(); part() melts a list of solids into one painted mesh (surface nets
// over the field, as the characters are meshed in sdf.mjs), kept on disk by its exact description. build() turns
// the parts into a three.js group whose joints (hinge, spin) motion code turns by name with pose().
import * as THREE from 'three/webgpu';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { attribute, dot, mix, float, smoothstep, mx_noise_float } from 'three/tsl';
import { paint } from './materials.mjs';
import { cached } from './sdf.mjs';

const SRC = crypto.createHash('sha1').update(fs.readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12);
const BIG = 1e3, RAD = Math.PI / 180, AX = { x: 0, y: 1, z: 2 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const M4 = () => new THREE.Matrix4();
const V3 = (a) => new THREE.Vector3(...a);
const softRound = (thin) => Math.min(0.3 * thin, 0.05);       // the default rounding: generous, never razor-sharp
// a rounded join of an inner 2D distance a (already offset by r) and an axial distance b
const cap = (a, b, r) => Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - r;

// ───────────── shapes, faces, frames ─────────────
class Shape {
  constructor() { this.parent = null; this.rel = M4(); this.kids = []; this.marks = {}; }
  world() { return this.parent ? this.parent.world().multiply(this.rel) : this.rel.clone(); }
  get top() { return new Frame(this, 1, 1); }
  get bottom() { return new Frame(this, 1, -1); }
  get right() { return new Frame(this, 0, 1); }
  get left() { return new Frame(this, 0, -1); }
  get front() { return new Frame(this, 2, 1); }
  get back() { return new Frame(this, 2, -1); }
  get center() { return new Frame(this, -1, 0); }
}

// A place on a shape: a face (axis 0/1/2, sign ±1; u, v across it from -1 to 1, in x-y-z order of the other two
// axes) whose point is where a ray from outside the box meets the surface; the centre (u, v, w across the box);
// or a fixed point (a mark). `off` moves it in the owner's axes; `spin` turns what is set on it about its normal.
class Frame {
  constructor(owner, axis, sign, uvw = [0, 0, 0], off = [0, 0, 0], spin = null, pt = null) {
    Object.assign(this, { owner, axis, sign, uvw, off, spin, pt });
  }
  at(u = 0, v = 0, w = 0) {
    if (this.pt) throw new Error('at(): a mark is one point; use move() to shift it');
    return new Frame(this.owner, this.axis, this.sign, [u, v, w], this.off, this.spin);
  }
  move(dx = 0, dy = 0, dz = 0) { return new Frame(this.owner, this.axis, this.sign, this.uvw, [this.off[0] + dx, this.off[1] + dy, this.off[2] + dz], this.spin, this.pt); }
  local() {         // the point in the owner's space
    const p = this.pt ?? faceHit(this.owner.field(), this.axis, this.sign, this.uvw);
    return [p[0] + this.off[0], p[1] + this.off[1], p[2] + this.off[2]];
  }
  get u() { return this.uvw[0]; }
  get v() { return this.uvw[1]; }
  normal() { const n = [0, 0, 0]; if (this.axis >= 0) n[this.axis] = this.sign; return n; }
}

// Where a ray from outside the box, along -sign on `axis`, first meets the surface of the field (or the box face
// if it misses); or the point at uvw across the box for the centre.
function faceHit({ f, lo, hi }, axis, sign, [u, v, w], missNull = false) {
  const mid = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2), half = [0, 1, 2].map((i) => (hi[i] - lo[i]) / 2);
  if (axis < 0) return [mid[0] + u * half[0], mid[1] + v * half[1], mid[2] + w * half[2]];
  const [b, c] = [0, 1, 2].filter((i) => i !== axis), m = 0.01 + 1e-3 * Math.max(...half);
  const p = [0, 0, 0];
  p[axis] = sign > 0 ? hi[axis] + m : lo[axis] - m; p[b] = mid[b] + u * half[b]; p[c] = mid[c] + v * half[c];
  const len = hi[axis] - lo[axis] + 2 * m, start = p[axis];
  for (let t = 0, prev = 0, i = 0; i < 400 && t <= len; i++) {
    p[axis] = start - sign * t;
    const d = f(p[0], p[1], p[2]);
    if (d < 2e-5) {        // a few halvings back to the crossing
      let a = prev, z = t;
      for (let k = 0; k < 20; k++) { const mm = (a + z) / 2; p[axis] = start - sign * mm; if (f(p[0], p[1], p[2]) > 0) a = mm; else z = mm; }
      p[axis] = start - sign * z;
      return p;
    }
    prev = t; t += Math.max(d * 0.8, 1e-4);
  }
  if (missNull) return null;
  p[axis] = sign > 0 ? hi[axis] : lo[axis];
  return p;
}

// ───────────── solids ─────────────
class Solid extends Shape {
  constructor(kind, args, o, allowed, { d, lo, hi, thin, round }) {
    super();
    allowed = [...allowed, 'hollow', 'blend'];
    for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`${kind}: unknown option "${k}" (it takes ${allowed.join(', ')})`);
    if (o.hollow) { const t = o.hollow, d0 = d; d = (x, y, z) => { const v = d0(x, y, z); return Math.max(v, -v - t); }; thin = Math.min(thin, t); }
    Object.assign(this, { kind, spec: [kind, args, o], d, lo, hi, thin, round, op: 'add', k: o.blend ?? 0.015, part: null });
    const ext = [0, 1, 2].map((i) => hi[i] - lo[i]);
    this.long = ext.indexOf(Math.max(...ext));          // the wood grain runs along the longest side
  }
  field() { return { f: this.d, lo: this.lo, hi: this.hi }; }
}
const checkRound = (kind, r, thin) => { if (r > thin / 2) throw new Error(`${kind}: round ${r} is more than half its thinnest side (${thin})`); return r; };

/** A box w (x) by h (y) by d (z), standing on its origin. round: edge radius; bulge: faces swell out (not the base); taper: the top this share narrower (negative: wider). */
export function box(w, h, d, o = {}) {
  const rx = w / 2, ry = h / 2, rz = d / 2, thin = Math.min(w, h, d);
  const r = checkRound('box', o.round ?? softRound(thin), thin), b = o.bulge ?? r * 0.3, t = o.taper ?? 0;
  return new Solid('box', [w, h, d], o, ['round', 'bulge', 'taper'], {
    thin, round: r, lo: [-rx * Math.max(1, 1 - t) - b, 0, -rz * Math.max(1, 1 - t) - b], hi: [rx * Math.max(1, 1 - t) + b, h + b, rz * Math.max(1, 1 - t) + b],
    d(x, y, z) {
      y -= ry;
      const s = 1 - t * (y / ry + 1) / 2;
      x /= s; z /= s;
      const qx = Math.abs(x) - rx + r, qy = Math.abs(y) - ry + r, qz = Math.abs(z) - rz + r;
      let dd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
      if (b) {
        const ax = Math.min(Math.abs(x) / rx, 1), ay = Math.min(Math.abs(y) / ry, 1), az = Math.min(Math.abs(z) / rz, 1);
        const sw = ax >= ay && ax >= az ? (1 - ay * ay) * (1 - az * az) : ay >= az ? (y > 0 ? (1 - ax * ax) * (1 - az * az) : 0) : (1 - ax * ax) * (1 - ay * ay);
        dd -= b * sw;
      }
      return dd * s;
    },
  });
}

/** An upright cylinder of radius r and height h on its origin. taper: the top radius this share smaller (negative: larger). */
export function cyl(r, h, o = {}) {
  const thin = Math.min(2 * r, h), rr = checkRound('cyl', o.round ?? softRound(thin), thin), t = o.taper ?? 0;
  return new Solid('cyl', [r, h], o, ['round', 'taper'], {
    thin, round: rr, lo: [-r * Math.max(1, 1 - t), 0, -r * Math.max(1, 1 - t)], hi: [r * Math.max(1, 1 - t), h, r * Math.max(1, 1 - t)],
    d(x, y, z) {
      const rad = r * (1 - t * clamp(y / h, 0, 1));
      return cap(Math.hypot(x, z) - rad + rr, Math.abs(y - h / 2) - h / 2 + rr, rr);
    },
  });
}

/** A ball of radius r (or an egg with radii rx, ry, rz) resting on its origin. */
export function ball(rx, ry = rx, rz = rx, o = {}) {
  if (typeof ry === 'object') { o = ry; ry = rz = rx; }
  return new Solid('ball', [rx, ry, rz], o, [], {
    thin: 2 * Math.min(rx, ry, rz), round: Math.min(rx, ry, rz), lo: [-rx, 0, -rz], hi: [rx, 2 * ry, rz],
    d(x, y, z) {
      y -= ry;
      if (rx === ry && ry === rz) return Math.hypot(x, y, z) - rx;
      const k0 = Math.hypot(x / rx, y / ry, z / rz), k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
      return k0 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
    },
  });
}

/** Half an egg of radius r and height h sitting on its flat base. round: the base edge. */
export function dome(r, h = r, o = {}) {
  const thin = Math.min(2 * r, h), rr = checkRound('dome', o.round ?? softRound(thin) * 0.5, thin);
  return new Solid('dome', [r, h], o, ['round'], {
    thin, round: rr, lo: [-r, 0, -r], hi: [r, h, r],
    d(x, y, z) {
      const k0 = Math.hypot(x / r, y / h, z / r), k1 = Math.hypot(x / (r * r), y / (h * h), z / (r * r));
      return smax(k0 < 1e-9 ? -Math.min(r, h) : k0 * (k0 - 1) / k1, -y, rr);
    },
  });
}

/** A ring of radius R and thickness r standing in the x-y plane, centred on its origin; arc: degrees kept, centred on the top. */
export function torus(R, r, o = {}) {
  const an = (o.arc ?? 360) * RAD / 2, sc = [Math.sin(an), Math.cos(an)];
  return new Solid('torus', [R, r], o, ['arc'], {
    thin: 2 * r, round: r, lo: [-R - r, -R - r, -r], hi: [R + r, R + r, r],
    d(x, y, z) {
      if (an >= Math.PI) return Math.hypot(Math.hypot(x, y) - R, z) - r;
      const px = Math.abs(x), k = sc[1] * px > sc[0] * y ? px * sc[0] + y * sc[1] : Math.hypot(px, y);
      return Math.sqrt(Math.max(px * px + y * y + z * z + R * R - 2 * R * k, 0)) - r;
    },
  });
}

// Monotone cubic through (xs, ys): no overshoot between the given values.
function pchip(xs, ys) {
  const n = xs.length, dx = [], m = [], t = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  if (n === 2) t[0] = t[1] = m[0];
  else {
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  return (x) => {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const s = clamp((x - xs[i]) / dx[i], 0, 1), s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * dx[i] * t[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * dx[i] * t[i + 1];
  };
}

/** A body lofted front to back (along z) through sections { z, w, h, y = 0, n = 2.5 }: each a rounded box-ellipse
 * (superellipse of power n) w wide and h tall whose bottom is at y. round: the end edges. */
export function loft(sections, o = {}) {
  if (sections.length < 2) throw new Error('loft: give at least two sections');
  for (let i = 1; i < sections.length; i++) if (!(sections[i].z > sections[i - 1].z)) throw new Error('loft: sections must go from back to front, z increasing');
  const zs = sections.map((s) => s.z), z0 = zs[0], z1 = zs[zs.length - 1];
  const W = pchip(zs, sections.map((s) => s.w / 2)), H = pchip(zs, sections.map((s) => s.h / 2));
  const Y = pchip(zs, sections.map((s) => (s.y ?? 0) + s.h / 2)), N = pchip(zs, sections.map((s) => s.n ?? 2.5));
  const thin = Math.min(z1 - z0, ...sections.map((s) => Math.min(s.w, s.h))), rr = checkRound('loft', o.round ?? softRound(thin), thin);
  const sec = (z) => [W(z), H(z), Y(z), N(z)];
  return new Solid('loft', [sections], o, ['round'], {
    thin, round: rr,
    lo: [-Math.max(...sections.map((s) => s.w / 2)), Math.min(...sections.map((s) => s.y ?? 0)), z0],
    hi: [Math.max(...sections.map((s) => s.w / 2)), Math.max(...sections.map((s) => (s.y ?? 0) + s.h)), z1],
    d(x, y, z) {
      const zc = clamp(z, z0, z1), [a, b, cy, n] = sec(zc), e = 1e-3, [a2, b2, cy2] = sec(Math.min(zc + e, z1 + e));
      const X = Math.abs(x) / a, Yv = Math.abs(y - cy) / b, F = (X ** n + Yv ** n) ** (1 / n);
      let d2;
      if (F < 1e-6) d2 = -Math.min(a, b);
      else { const g = F ** (1 - n), gx = X ** (n - 1) * g / a, gy = Yv ** (n - 1) * g / b; d2 = Math.max((F - 1) / Math.hypot(gx, gy), -Math.min(a, b)); }
      const slope = (Math.abs(a2 - a) + Math.abs(b2 - b) + Math.abs(cy2 - cy)) / e;      // the walls lean: shrink the distance to match
      return cap(d2 / Math.sqrt(1 + slope * slope) + rr, Math.max(z0 - z, z - z1) + rr, rr);
    },
  });
}

// An outline [[x, y, r?], ...] with each corner rounded by its own r (or rDef): the points of the rounded path.
function filleted(pts, closed, rDef, keepAxis) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i], r = P[2] ?? rDef;
    if ((!closed && (i === 0 || i === n - 1)) || r <= 0 || (keepAxis && P[0] === 0)) { out.push([P[0], P[1]]); continue; }
    const A = pts[(i + n - 1) % n], C = pts[(i + 1) % n];
    const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lc = Math.hypot(C[0] - P[0], C[1] - P[1]);
    const u = [(A[0] - P[0]) / la, (A[1] - P[1]) / la], w = [(C[0] - P[0]) / lc, (C[1] - P[1]) / lc];
    const th = Math.acos(clamp(u[0] * w[0] + u[1] * w[1], -1, 1));
    if (th > Math.PI - 1e-3 || th < 1e-3) { out.push([P[0], P[1]]); continue; }
    const t = Math.min(r / Math.tan(th / 2), la * 0.5, lc * 0.5), rr = t * Math.tan(th / 2);
    const bl = Math.hypot(u[0] + w[0], u[1] + w[1]), bis = [(u[0] + w[0]) / bl, (u[1] + w[1]) / bl], dc = rr / Math.sin(th / 2);
    const c = [P[0] + bis[0] * dc, P[1] + bis[1] * dc], T1 = [P[0] + u[0] * t, P[1] + u[1] * t], T2 = [P[0] + w[0] * t, P[1] + w[1] * t];
    const a1 = Math.atan2(T1[1] - c[1], T1[0] - c[0]);
    let da = Math.atan2(T2[1] - c[1], T2[0] - c[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const k = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 16)));
    for (let j = 0; j <= k; j++) out.push([c[0] + rr * Math.cos(a1 + da * j / k), c[1] + rr * Math.sin(a1 + da * j / k)]);
  }
  return out;
}
// Signed distance to a closed polygon, or distance to an open path.
function pathDist(pts, closed) {
  const n = pts.length;
  return (x, y) => {
    let d = Infinity, s = 1;
    for (let i = closed ? 0 : 1, j = closed ? n - 1 : 0; i < n; j = i, i++) {
      const [ax, ay] = pts[i], ex = pts[j][0] - ax, ey = pts[j][1] - ay, wx = x - ax, wy = y - ay;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1), qx = wx - ex * t, qy = wy - ey * t;
      d = Math.min(d, qx * qx + qy * qy);
      if (closed) { const c1 = y >= ay, c2 = y < pts[j][1], c3 = ex * wy > ey * wx; if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s; }
    }
    return s * Math.sqrt(d);
  };
}
// how thick a closed outline is, about (2 x area / perimeter: the thickness of a long strip, half the side of a square)
function outlineThin(pts) {
  let A = 0, P = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) { A += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; P += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); }
  return Math.abs(A) / P;
}
const bounds2 = (pts, grow) => [Math.min(...pts.map((p) => p[0])) - grow, Math.min(...pts.map((p) => p[1])) - grow, Math.max(...pts.map((p) => p[0])) + grow, Math.max(...pts.map((p) => p[1])) + grow];

/** A body turned round the y axis from a profile [[r, y, fillet?], ...] that starts and ends on the axis (r = 0);
 * with thick, the profile is an open line given that thickness (a shade, a bowl, a pot's wall). round: corner fillet. */
export function revolve(profile, o = {}) {
  const closed = !o.thick, raw = closed ? outlineThin(profile) : o.thick, rDef = o.round ?? Math.min(0.25 * raw, 0.03);
  const pts = filleted(profile, closed, rDef, closed), dist = pathDist(pts, closed), g = closed ? 0 : o.thick / 2;
  const [, y0, r1, y1] = bounds2(pts, g);
  return new Solid('revolve', [profile], o, ['thick', 'round'], {
    thin: raw, round: closed ? rDef || raw / 2 : raw / 2, lo: [-r1, y0, -r1], hi: [r1, y1, r1],     // (a line's bends do not need finer cells than its thickness)
    d: (x, y, z) => dist(Math.hypot(x, z), y) - g,
  });
}

/** A flat outline [[x, y, fillet?], ...] drawn in x-y pushed `depth` along z (centred on z = 0); with thick, the
 * outline is an open line given that thickness (a handle, a bent strip). round: the front and back edges. */
export function extrude(outline, depth, o = {}) {
  const closed = !o.thick, raw = closed ? outlineThin(outline) : o.thick, thin = Math.min(depth, raw);
  const rr = checkRound('extrude', o.round ?? softRound(thin), thin), pts = filleted(outline, closed, rr, false), dist = pathDist(pts, closed), g = closed ? 0 : o.thick / 2;
  const [x0, y0, x1, y1] = bounds2(pts, g);
  return new Solid('extrude', [outline, depth], o, ['thick', 'round'], {
    thin, round: rr, lo: [x0, y0, -depth / 2], hi: [x1, y1, depth / 2],
    d: (x, y, z) => cap(dist(x, y) - g + rr, Math.abs(z) - depth / 2 + rr, rr),
  });
}

/** Carve this solid out of what comes before it in its part. */
export function cut(s) { s.op = 'cut'; if (s.spec[2].blend === undefined) s.k = 0.008; return s; }
/** Keep only what comes before it inside this solid. */
export function keep(s) { s.op = 'keep'; if (s.spec[2].blend === undefined) s.k = 0.008; return s; }

// ───────────── placing ─────────────
const rotBox = (lo, hi, R) => {
  const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity], v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]).applyMatrix4(R);
    for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], v.getComponent(k)); b[k] = Math.max(b[k], v.getComponent(k)); }
  }
  return [a, b];
};
// a field moved by the matrix L (its own space → this space)
function moved({ f, lo, hi }, L) {
  const e = M4().copy(L).invert().elements;
  const [a, b] = rotBox(lo, hi, L);
  return { f: (x, y, z) => f(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]), lo: a, hi: b };
}

/** Set x on a frame: x is turned (turn: [x, y, z] degrees, about its own origin), then moved so that the point of x
 * that sticks out furthest toward the frame (the middle of that face, if it is flat) lands on the frame point (on a
 * centre frame: the middle of x's box goes there).
 * flush: line x up by the same u, v of its own face instead of centring it (u = -1: bottoms level, and so on). x keeps the axes of
 * the shape it is set on and moves with it from then on. Returns x. */
export function at(x, frame, { turn = [0, 0, 0], flush = false } = {}) {
  if (!(frame instanceof Frame)) throw new Error('at(): the second argument must be a frame such as seat.top or seat.top.at(0.5, 0)');
  for (let o = frame.owner; o; o = o.parent) if (o === x) throw new Error('at(): a shape cannot be set on itself or on something set on it');
  const R = M4().makeRotationFromEuler(new THREE.Euler(turn[0] * RAD, turn[1] * RAD, turn[2] * RAD));
  if (frame.spin) R.premultiply(frame.spin);
  R.multiply(M4().extractRotation(x.rel));         // a shape turned with turn() stays turned
  const p = frame.local(), turned = moved(x.field(), R);
  const c = [0, 1, 2].map((i) => (turned.lo[i] + turned.hi[i]) / 2);
  if (frame.axis >= 0) {
    // the point of x that sticks out furthest toward the frame: a 9 x 9 grid of rays; the middle of the rays that
    // reach within a tenth of its depth of that (a flat or nearly flat face), or, if only one does, a search round it for the very tip
    const a = frame.axis, sg = -frame.sign, [b, e] = [0, 1, 2].filter((i) => i !== a), N = 9, hits = [];
    const ray = (u, v) => { const q = faceHit(turned, a, sg, [u, v], true); return q && { q, u, v, out: sg * q[a] }; };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const h = ray(-1 + (2 * i + 1) / N, -1 + (2 * j + 1) / N); if (h) hits.push(h); }
    if (hits.length) {
      let best = hits.reduce((m, h) => (h.out > m.out ? h : m));
      const top = hits.filter((h) => h.out >= best.out - 0.001 - 0.1 * (turned.hi[a] - turned.lo[a]));
      if (top.length === 1) {
        for (let step = 1 / N; step > 1e-3; step /= 2) for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const h = ray(best.u + du * step, best.v + dv * step);
          if (h && h.out > best.out) best = h;
        }
        c[b] = best.q[b]; c[e] = best.q[e];
      } else { c[b] = top.reduce((m, h) => m + h.q[b], 0) / top.length; c[e] = top.reduce((m, h) => m + h.q[e], 0) / top.length; }
      c[a] = best.q[a];
    } else c[a] = sg > 0 ? turned.hi[a] : turned.lo[a];
    if (flush) [b, e].forEach((i, k) => { c[i] = (turned.lo[i] + turned.hi[i]) / 2 + frame.uvw[k] * (turned.hi[i] - turned.lo[i]) / 2; });
  }
  x.rel = M4().makeTranslation(p[0] - c[0], p[1] - c[1], p[2] - c[2]).multiply(R);
  if (x.parent) x.parent.kids.splice(x.parent.kids.indexOf(x), 1);
  x.parent = frame.owner; frame.owner.kids.push(x);
  return x;
}

/** Turn x in place about its own origin by [x, y, z] degrees (for a first solid that should lie another way). */
export function turn(x, [ax = 0, ay = 0, az = 0]) {
  x.rel.multiply(M4().makeRotationFromEuler(new THREE.Euler(ax * RAD, ay * RAD, az * RAD)));
  return x;
}

/** Frames in a grid of nu x nv across a face, spread over ±su and ±sv of its half-size. */
export function grid(face, nu, nv = 1, su = 0.8, sv = su) {
  const out = [], step = (n, s, i, c) => (n === 1 ? c : -s + 2 * s * i / (n - 1));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) out.push(face.at(step(nu, su, i, face.uvw[0]), step(nv, sv, j, face.uvw[1])));
  return out;
}

/** n frames on a circle of radius r (metres) round the middle of a face, the first at `start` degrees; each turns
 * what is set on it so that its +x points out from the circle (its +y on the left and right faces). */
export function ring(face, n, r, start = 0) {
  const { lo, hi } = face.owner.field(), [b, c] = [0, 1, 2].filter((i) => i !== face.axis), out = [];
  const nrm = V3(face.normal()), eb = V3([0, 0, 0].map((_, i) => (i === b ? 1 : 0)));
  for (let i = 0; i < n; i++) {
    const a = (start + 360 * i / n) * RAD, outDir = V3([0, 0, 0].map((_, k) => (k === b ? Math.cos(a) : k === c ? Math.sin(a) : 0)));
    const th = Math.atan2(eb.clone().cross(outDir).dot(nrm), eb.dot(outDir));
    const f = face.at(face.uvw[0] + r * Math.cos(a) / ((hi[b] - lo[b]) / 2), face.uvw[1] + r * Math.sin(a) / ((hi[c] - lo[c]) / 2));
    f.spin = M4().makeRotationAxis(nrm, th);
    out.push(f);
  }
  return out;
}

/** Name a frame on a shape: afterwards shape.<name> is that point (and build() lists it as "<part>.<name>"). */
export function mark(shape, name, frame) {
  if (name in shape) throw new Error(`mark(): "${name}" is already a name on this shape`);
  const W = M4().copy(shape.world()).invert().multiply(frame.owner.world());
  const p = V3(frame.local()).applyMatrix4(W), n = V3(frame.normal()).transformDirection(W);
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(n.getComponent(i)) > Math.abs(n.getComponent(m)) ? i : m), 0);
  const f = new Frame(shape, frame.axis < 0 ? -1 : k, Math.sign(n.getComponent(k)) || 1, [0, 0, 0], [0, 0, 0], null, p.toArray());
  shape.marks[name] = f;
  Object.defineProperty(shape, name, { get: () => f, configurable: true });
  return shape;
}

// ───────────── parts ─────────────
class Part extends Shape {
  constructor(name, look, items) { super(); Object.assign(this, { name, look, items, joint: null }); }
  // its solids in its own space
  list() {
    const Wi = M4().copy(this.world()).invert();
    return this.items.map((s) => { const L = Wi.clone().multiply(s.world()); return { s, L, ...moved(s.field(), L) }; });
  }
  field() {
    const list = this.list(), adds = list.filter((o) => o.s.op === 'add'), keeps = list.filter((o) => o.s.op === 'keep');
    const lo = [0, 1, 2].map((i) => Math.max(Math.min(...adds.map((o) => o.lo[i])), ...keeps.map((o) => o.lo[i])));
    const hi = [0, 1, 2].map((i) => Math.min(Math.max(...adds.map((o) => o.hi[i])), ...keeps.map((o) => o.hi[i])));
    return { f: combine(list), lo, hi, list };
  }
}
// the solids in order: add melts in, cut carves, keep intersects; a solid whose box is too far to matter is skipped
function combine(list) {
  const boxDist = (o, x, y, z) => Math.hypot(Math.max(o.lo[0] - x, 0, x - o.hi[0]), Math.max(o.lo[1] - y, 0, y - o.hi[1]), Math.max(o.lo[2] - z, 0, z - o.hi[2]));
  return (x, y, z) => {
    let d = BIG;
    for (const o of list) {
      const k = o.s.k;
      if (o.s.op === 'add') { if (boxDist(o, x, y, z) <= d + k) d = smin(d, o.f(x, y, z), k); }
      else if (o.s.op === 'cut') { if (boxDist(o, x, y, z) < k - d) d = smax(d, -o.f(x, y, z), k); }
      else d = smax(d, o.f(x, y, z), k);
    }
    return d;
  };
}

/** One painted mesh named `name`, melted from the solids listed (arrays are flattened). look: a colour (0xrrggbb)
 * or { color, finish } with finish 'paint' (default), 'wood', 'cloth', 'metal', 'rubber' or 'glass'. */
export function part(name, look, ...items) {
  items = items.flat();
  if (!items.length) throw new Error(`part ${name}: no solids`);
  const p = new Part(name, typeof look === 'number' ? { color: look } : look, items);
  if (!FINISH[p.look.finish ?? 'paint']) throw new Error(`part ${name}: unknown finish "${p.look.finish}" (${Object.keys(FINISH).join(', ')})`);
  if (items[0].op !== 'add') throw new Error(`part ${name}: the first solid must be added, not cut or kept`);
  for (const s of items) {
    if (!(s instanceof Solid)) throw new Error(`part ${name}: ${s?.name ? 'part ' + s.name : s} is not a solid (place parts with at(), do not list them)`);
    if (s.part) throw new Error(`part ${name}: a ${s.kind} is already in part ${s.part.name}`);
    s.part = p;
    if (!s.parent) { s.parent = p; p.kids.push(s); }
  }
  return p;
}

const AXV = (a) => (typeof a === 'string' ? [0, 0, 0].map((_, i) => (i === AX[a] ? 1 : 0)) : a);
function joint(p, kind, frame, axis, range) {
  if (!(p instanceof Part)) throw new Error(`${kind}(): the first argument must be a part`);
  const W = M4().copy(p.world()).invert().multiply(frame.owner.world());
  p.joint = { kind, at: V3(frame.local()).applyMatrix4(W).toArray(), axis: AXV(axis), range, sign: 1 };
  return p;
}
/** The part turns about the line through the frame along axis ('x', 'y' or 'z'), from lo to hi degrees; pose 0..1. */
export const hinge = (p, frame, axis, [lo, hi]) => joint(p, 'hinge', frame, axis, [lo, hi]);
/** The part turns freely about the line through the frame along axis (a wheel on its axle); pose in radians. */
export const spin = (p, frame, axis) => joint(p, 'spin', frame, axis, null);

/** A mirror image of a solid, or of a part and everything set on it, across the plane x = 0 (or y = 0, z = 0) of
 * the object. A mirrored solid still has to be listed in a part; a mirrored part hangs on what the original hangs on. */
export function mirror(x, axis = 'x') {
  const S = M4().makeScale(...AXV(axis).map((v) => (v ? -1 : 1)));
  if (x instanceof Solid) {
    const c = cloneSolid(x);
    c.parent = x.parent; x.parent?.kids.push(c);
    c.rel = M4().copy(x.parent ? x.parent.world() : M4()).invert().multiply(S).multiply(x.world());
    return c;
  }
  const map = new Map();
  const copyPart = (P, parent) => {
    const W = S.clone().multiply(P.world()).multiply(S), Q = new Part(P.name, P.look, []);
    map.set(P, Q); Q.parent = parent; parent?.kids.push(Q);
    Q.rel = M4().copy(parent ? parent.world() : M4()).invert().multiply(W);
    const Wi = W.clone().invert();
    for (const s of P.items) {
      const c = cloneSolid(s); c.part = Q; c.parent = Q; Q.kids.push(c); Q.items.push(c); map.set(s, c);
      c.rel = Wi.clone().multiply(S).multiply(s.world());
    }
    if (P.joint) Q.joint = { ...P.joint, at: V3(P.joint.at).applyMatrix4(S).toArray(), axis: V3(P.joint.axis).applyMatrix4(S).toArray(), sign: -P.joint.sign };
    for (const [n, f] of Object.entries(P.marks)) mark(Q, n, new Frame(Q, f.axis, f.axis === AX[axis] ? -f.sign : f.sign, [0, 0, 0], [0, 0, 0], null, V3(f.pt).applyMatrix4(S).toArray()));
    // what hangs on it: parts set on it or on its solids, and parts whose solids were set there
    for (const k of [P, ...P.items].flatMap((n) => n.kids)) {
      const kp = k instanceof Part ? k : k.part;
      if (kp && kp !== P && !map.has(kp)) copyPart(kp, map.get(kp.parent) ?? (kp.parent ? null : Q));
    }
    return Q;
  };
  return copyPart(x, x.parent);
}
function cloneSolid(s) {
  const c = Object.assign(Object.create(Solid.prototype), s);
  Object.assign(c, { parent: null, rel: M4(), kids: [], marks: {}, part: null });
  return c;
}

// ───────────── meshing ─────────────
// Naive surface nets (as sdf.mjs meshShape), evaluated near the surface only: the field is first read on a coarse
// grid of 4 x 4 x 4 blocks, and blocks whose corners are all far from the surface on one side are filled, not read.
function meshField(f, list, lo0, hi0, h) {
  const B = 4, pad = 3 * h, lo = lo0.map((v) => Math.floor((v - pad) / h) * h);
  const [nx, ny, nz] = [0, 1, 2].map((i) => Math.ceil((hi0[i] + pad - lo[i]) / h / B) * B + 1);
  const idx = (i, j, k) => i + nx * (j + ny * k), at = (i, j, k) => f(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  const g = new Float32Array(nx * ny * nz), done = new Uint8Array(nx * ny * nz);
  const [cx, cy, cz] = [(nx - 1) / B + 1, (ny - 1) / B + 1, (nz - 1) / B + 1], c = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) c[i + cx * (j + cy * k)] = at(i * B, j * B, k * B);
  const far = 2.2 * B * h * Math.sqrt(3);
  for (let bk = 0; bk < cz - 1; bk++) for (let bj = 0; bj < cy - 1; bj++) for (let bi = 0; bi < cx - 1; bi++) {
    let mn = Infinity, pos = 0;
    for (let q = 0; q < 8; q++) { const v = c[bi + (q & 1) + cx * (bj + ((q >> 1) & 1) + cy * (bk + (q >> 2)))]; mn = Math.min(mn, Math.abs(v)); if (v > 0) pos++; }
    const isFar = mn > far && (pos === 0 || pos === 8);
    for (let k = bk * B; k <= bk * B + B; k++) for (let j = bj * B; j <= bj * B + B; j++) for (let i = bi * B; i <= bi * B + B; i++) {
      const q = idx(i, j, k);
      if (done[q]) continue;
      if (isFar) g[q] = pos ? BIG : -BIG; else { g[q] = at(i, j, k); done[q] = 1; }
    }
  }
  const cellV = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const ox = [0, 1, 0, 1, 0, 1, 0, 1], oy = [0, 0, 1, 1, 0, 0, 1, 1], oz = [0, 0, 0, 0, 1, 1, 1, 1];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let m = 0;
    for (let q = 0; q < 8; q++) { cv[q] = g[idx(i + ox[q], j + oy[q], k + oz[q])]; if (cv[q] < 0) m |= 1 << q; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += ox[a] + t * (ox[b] - ox[a]); sy += oy[a] + t * (oy[b] - oy[a]); sz += oz[a] + t * (oz[b] - oz[a]); n++;
    }
    cellV[idx(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const tris = [], quad = (a, b, cc, d, flip) => { if (flip) tris.push(a, cc, b, a, d, cc); else tris.push(a, b, cc, a, cc, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = g[idx(i, j, k)] < 0;
    if (v0 !== (g[idx(i + 1, j, k)] < 0)) quad(cellV[idx(i, j - 1, k - 1)], cellV[idx(i, j, k - 1)], cellV[idx(i, j, k)], cellV[idx(i, j - 1, k)], !v0);
    if (v0 !== (g[idx(i, j + 1, k)] < 0)) quad(cellV[idx(i - 1, j, k - 1)], cellV[idx(i - 1, j, k)], cellV[idx(i, j, k)], cellV[idx(i, j, k - 1)], !v0);
    if (v0 !== (g[idx(i, j, k + 1)] < 0)) quad(cellV[idx(i - 1, j - 1, k)], cellV[idx(i, j - 1, k)], cellV[idx(i, j, k)], cellV[idx(i - 1, j, k)], !v0);
  }
  // every point pulled onto the surface; its normal is the way the distance grows; its grain runs along the
  // longest side of the solid it lies on
  const nv = pos.length / 3, position = new Float32Array(pos), normal = new Float32Array(nv * 3), grain = new Float32Array(nv * 3), e = h * 0.25;
  const adds = list.filter((o) => o.s.op === 'add').map((o) => ({ o, dir: V3([0, 1, 2].map((i) => (i === o.s.long ? 1 : 0))).transformDirection(o.L) }));
  for (let v = 0; v < nv; v++) {
    let x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2], gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z); gy = f(x, y + e, z) - f(x, y - e, z); gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (it < 2) { const st = clamp(d, -h, h); x -= gx * st; y -= gy * st; z -= gz * st; }
    }
    position.set([x, y, z], v * 3); normal.set([gx, gy, gz], v * 3);
    let best = adds[0], bd = Infinity;
    for (const a of adds) { const d = a.o.f(x, y, z); if (d < bd) { bd = d; best = a; } }
    grain.set([Math.abs(best.dir.x), Math.abs(best.dir.y), Math.abs(best.dir.z)], v * 3);
  }
  return { position, normal, grain, index: new Uint32Array(tris) };
}

// Fewer triangles where the surface is flat or gently curved: surface nets cut every square metre into the same
// 5 000 triangles at 2 cm cells. A vertex is folded into a neighbour (it and its triangles go; the neighbour keeps
// its place, normal and grain) in order of how far the surface would move (the area-weighted mean of the squared
// distances to the planes of the triangles it stands for: Garland and Heckbert's quadrics), while that stays under
// tol. A fold that would turn a triangle over or pinch the surface is skipped.
function simplify({ position: P, normal, grain, index }, tol) {
  const nv = P.length / 3, F = Int32Array.from(index), nf = F.length / 3;
  const Q = new Float64Array(nv * 10), area = new Float64Array(nv), vf = Array.from({ length: nv }, () => []);
  const cr = (a, b, c) => { const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2]; return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx]; };
  for (let f = 0; f < nf; f++) {
    const [a, b, c] = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]], n = cr(a, b, c), l = Math.hypot(...n);
    for (const v of [a, b, c]) vf[v].push(f);
    if (l < 1e-12) continue;
    const [x, y, z] = n.map((k) => k / l), d = -(x * P[a * 3] + y * P[a * 3 + 1] + z * P[a * 3 + 2]), w = l / 2;
    const q = [x * x, x * y, x * z, x * d, y * y, y * z, y * d, z * z, z * d, d * d];
    for (const v of [a, b, c]) { for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k] * w; area[v] += w; }
  }
  const cost = (a, b) => {
    const x = P[b * 3], y = P[b * 3 + 1], z = P[b * 3 + 2], q = (k) => Q[a * 10 + k] + Q[b * 10 + k];
    return (q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9)) / (area[a] + area[b]);
  };
  // a binary heap of folds a → b, each stamped with the versions of a and b it was costed at
  let hc = new Float64Array(1 << 16), hi = new Int32Array(3 << 16), n = 0;
  const ver = new Int32Array(nv), dead = new Uint8Array(nv);
  const set = (i, c, a, b, v) => { hc[i] = c; hi[i * 3] = a; hi[i * 3 + 1] = b; hi[i * 3 + 2] = v; };
  const push = (a, b) => {
    const c = cost(a, b);
    if (!(c <= tol * tol)) return;
    if (n === hc.length) { const c2 = new Float64Array(n * 2), i2 = new Int32Array(n * 6); c2.set(hc); i2.set(hi); hc = c2; hi = i2; }
    let i = n++;
    for (; i > 0; ) { const p = (i - 1) >> 1; if (hc[p] <= c) break; set(i, hc[p], hi[p * 3], hi[p * 3 + 1], hi[p * 3 + 2]); i = p; }
    set(i, c, a, b, ver[a] * 65536 + ver[b]);
  };
  const pop = () => {
    const top = [hi[0], hi[1], hi[2]], c = hc[--n], a = hi[n * 3], b = hi[n * 3 + 1], v = hi[n * 3 + 2];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = -1, mc = c;
      if (l < n && hc[l] < mc) { m = l; mc = hc[l]; }
      if (r < n && hc[r] < mc) m = r;
      if (m < 0) break;
      set(i, hc[m], hi[m * 3], hi[m * 3 + 1], hi[m * 3 + 2]); i = m;
    }
    set(i, c, a, b, v);
    return top;
  };
  const live = (v) => vf[v].filter((f) => F[f * 3] >= 0);
  const ring = (v) => { const s = new Set(); for (const f of live(v)) for (let k = 0; k < 3; k++) if (F[f * 3 + k] !== v) s.add(F[f * 3 + k]); return s; };
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) { const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3]; if (a < b) { push(a, b); push(b, a); } }   // (each edge is in two triangles)
  while (n) {
    const [a, b, v] = pop();
    if (dead[a] || dead[b] || v !== ver[a] * 65536 + ver[b]) continue;
    const fa = live(a), shared = fa.filter((f) => F[f * 3] === b || F[f * 3 + 1] === b || F[f * 3 + 2] === b);
    // the edge has a triangle on each side and the two rings meet only at those triangles' far corners
    if (shared.length !== 2) continue;
    const rb = ring(b); let common = 0;
    for (const u of ring(a)) if (rb.has(u)) common++;
    if (common !== 2) continue;
    // no triangle turns over (or more than about 70 degrees) or shrinks to nothing
    let ok = true;
    for (const f of fa) {
      if (shared.includes(f)) continue;
      const t = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]], n0 = cr(...t), n1 = cr(...t.map((u) => (u === a ? b : u)));
      const l0 = Math.hypot(...n0), l1 = Math.hypot(...n1);
      if (l1 < 1e-12 || n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.35 * l0 * l1) { ok = false; break; }
    }
    if (!ok) continue;
    for (const f of fa) {
      if (shared.includes(f)) { F[f * 3] = F[f * 3 + 1] = F[f * 3 + 2] = -1; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === a) F[f * 3 + k] = b;
      vf[b].push(f);
    }
    for (let k = 0; k < 10; k++) Q[b * 10 + k] += Q[a * 10 + k];
    area[b] += area[a]; dead[a] = 1; ver[b]++;
    for (const u of ring(b)) { push(b, u); push(u, b); }
  }
  // what is left, renumbered
  const map = new Int32Array(nv).fill(-1), keep = [];
  const out = [];
  for (let f = 0; f < nf; f++) if (F[f * 3] >= 0) for (let k = 0; k < 3; k++) { const v = F[f * 3 + k]; if (map[v] < 0) { map[v] = keep.length; keep.push(v); } out.push(map[v]); }
  const pick = (A) => { const B = new Float32Array(keep.length * 3); keep.forEach((v, i) => B.set(A.subarray(v * 3, v * 3 + 3), i * 3)); return B; };
  return { position: pick(P), normal: pick(normal), grain: pick(grain), index: new Uint32Array(out) };
}

// The cell size: 1/3.5 of the thinnest solid and two thirds of the smallest rounding, 2.5 mm to 2 cm, and no more
// than 16 million cells.
function cellSize(P, lo, hi) {
  const sol = P.items, thin = Math.min(...sol.map((s) => s.thin)), round = Math.min(...sol.map((s) => s.round || Infinity));
  let h = clamp(Math.min(thin / 3.5, round / 1.5), 0.0025, 0.02);
  const cells = (lo.reduce((a, _, i) => a * (hi[i] - lo[i] + 6 * h), 1)) / h ** 3;
  if (cells > 16e6) {
    h *= Math.cbrt(cells / 16e6);
    console.warn(`part ${P.name}: too big for its finest detail; cells of ${(h * 1000).toFixed(1)} mm will blur solids thinner than ${(h * 2.5 * 100).toFixed(1)} cm (put small things in parts of their own)`);
  }
  return h;
}

function meshPart(P) {
  const { f, lo, hi, list } = P.field(), h = cellSize(P, lo, hi);
  const key = { kit: SRC, h, items: list.map((o) => [o.s.spec, o.s.op, o.s.k, Array.from(o.L.elements)]) };
  const make = () => simplify(meshField(f, list, lo, hi, h), h / 20);
  return { h, ...(process.env.SHAPE_NOCACHE ? make() : cached(key, make)) };
}

// ───────────── paint ─────────────
const FINISH = {
  paint: { mottle: 0.06, scatter: 0.2, rim: 1 },
  wood: { mottle: 0.1, mottleScale: 9, scatter: 0.15, rim: 0.8 },
  cloth: { mottle: 0.1, mottleScale: 4, scatter: 0.25, brush: 0.07, brushScale: 30 },
  metal: { mottle: 0.08, scatter: 0.1, rim: 1.6 },
  rubber: { mottle: 0.04, scatter: 0, rim: 0.4 },
  glass: { mottle: 0.02, scatter: 0, rim: 2 },
};
// wood: long soft streaks along each solid's longest side
const woodGrain = (p, c) => {
  const gdir = attribute('grain', 'vec3'), along = dot(p, gdir), across = p.sub(gdir.mul(along));
  const n = mx_noise_float(across.mul(70).add(gdir.mul(along.mul(2.5)))).mul(0.5).add(0.5);
  const n2 = mx_noise_float(across.mul(18).add(gdir.mul(along.mul(0.8))).add(4.2)).mul(0.5).add(0.5);
  return c.mul(mix(float(0.86), float(1.07), smoothstep(0.25, 0.75, n))).mul(mix(float(0.92), float(1.05), n2));
};
function material(look, cache) {
  const key = JSON.stringify(look);
  if (!cache.has(key)) {
    const fin = look.finish ?? 'paint';
    cache.set(key, paint({ color: look.color ?? 0xffffff, ...FINISH[fin], ...(fin === 'wood' ? { pattern: woodGrain } : {}) }));
  }
  return cache.get(key);
}

// ───────────── building ─────────────
/** Turn the parts set on the given root(s) into the engine's meshes, standing on y = 0: → { group, pose(values),
 * joints, marks, parts, triangles, digest, ms }. */
export function build(...roots) {
  const t0 = performance.now(), parts = [], seen = new Set();
  const visit = (n) => {
    const p = n instanceof Part ? n : n.part;
    if (p && !seen.has(p)) { seen.add(p); parts.push(p); }
    for (const k of n.kids) visit(k);
  };
  roots.flat().forEach(visit);
  for (const P of parts) for (const s of P.items) {          // every solid must hang, through what it is set on, from a part
    let r = s; while (r.parent) r = r.parent;
    if (!(r instanceof Part)) throw new Error(`part ${P.name}: a ${s.kind} is set on a ${r.kind} that is in no part (set it on a solid of a part, or list that solid too)`);
  }
  const partOf = (n) => { for (; n; n = n.parent) { const p = n instanceof Part ? n : n.part; if (p) return p; } return null; };
  // whose motion a part follows: what it was set on, or what its first outside-set solid was set on
  const mover = (P) => {
    if (P.parent) return partOf(P.parent);
    for (const s of P.items) { for (let n = s.parent; n; n = n.parent) { const q = n instanceof Part ? n : n.part; if (q && q !== P) return q; } }
    return null;
  };
  const used = new Map(), name = (n) => { const c = (used.get(n) ?? 0) + 1; used.set(n, c); return c === 1 ? n : `${n}.${c}`; };
  const group = new THREE.Group(), holders = new Map(), mats = new Map(), joints = {}, pivots = {}, triangles = {}, groups = {}, marks = {};
  const hash = crypto.createHash('sha256');
  const order = [], placed = new Set(), place = (P) => { if (placed.has(P)) return; const m = mover(P); if (m && seen.has(m)) place(m); placed.add(P); order.push(P); };
  parts.forEach(place);
  for (const P of order) {
    const nm = name(P.name), mp = mover(P), Wp = P.world(), Wrel = mp ? M4().copy(mp.world()).invert().multiply(Wp) : Wp;
    if (Wrel.determinant() < 0) throw new Error(`part ${nm}: its placement is mirrored; use mirror() on parts`);
    const data = meshPart(P);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geo.setAttribute('grain', new THREE.BufferAttribute(data.grain, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    const mesh = new THREE.Mesh(geo, material(P.look, mats));
    mesh.name = nm; mesh.castShadow = mesh.receiveShadow = true;
    const inner = new THREE.Group(); inner.name = nm; inner.matrixAutoUpdate = false; inner.add(mesh);
    const holder = mp && holders.has(mp) ? holders.get(mp) : group;
    if (P.joint) {
      const J = P.joint, piv = V3(J.at).applyMatrix4(Wrel), axis = V3(J.axis).transformDirection(Wrel);
      const pivot = new THREE.Group(); pivot.position.copy(piv); holder.add(pivot); pivot.add(inner);
      inner.matrix.makeTranslation(-piv.x, -piv.y, -piv.z).multiply(Wrel);
      joints[nm] = J.kind === 'hinge' ? { kind: 'hinge', min: J.range[0], max: J.range[1] } : { kind: 'spin' };
      pivots[nm] = { pivot, axis, J };
      hash.update(JSON.stringify([J.kind, J.range, piv.toArray(), axis.toArray(), J.sign]));
    } else { inner.matrix.copy(Wrel); holder.add(inner); }
    holders.set(P, inner); groups[nm] = inner;
    triangles[nm] = data.index.length / 3;
    if (triangles[nm] > 100000) console.warn(`part ${nm}: ${triangles[nm]} triangles (cells of ${(data.h * 1000).toFixed(1)} mm, set by its thinnest solid or wall); thicken it, or put the thin pieces in a part of their own`);
    hash.update(nm); hash.update(new Float32Array(Wrel.elements));
    for (const k of ['position', 'normal', 'index']) hash.update(Buffer.from(data[k].buffer, data[k].byteOffset, data[k].byteLength));
    for (const [mn, f] of [...Object.entries(P.marks), ...P.items.flatMap((s) => Object.entries(s.marks))]) {
      const W = f.owner.world();
      marks[`${nm}.${mn}`] = { p: V3(f.local()).applyMatrix4(W).toArray(), n: V3(f.normal()).transformDirection(W).toArray() };
    }
  }
  function pose(values = {}) {
    for (const [n, v] of Object.entries(values)) {
      const j = pivots[n];
      if (!j) throw new Error(`pose(): no joint "${n}" (joints: ${Object.keys(pivots).join(', ') || 'none'})`);
      const a = j.J.kind === 'hinge' ? (j.J.range[0] + clamp(v, 0, 1) * (j.J.range[1] - j.J.range[0])) * RAD : v;
      j.pivot.quaternion.setFromAxisAngle(j.axis, a * j.J.sign);
    }
  }
  pose(Object.fromEntries(Object.entries(joints).map(([n, j]) => [n, 0])));
  // the object stands on the floor: its lowest point (at rest) on y = 0
  group.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(group).min.y;
  const outer = new THREE.Group(); outer.add(group); group.position.y = -floor;
  for (const m of Object.values(marks)) m.p[1] -= floor;
  return { group: outer, pose, joints, marks, parts: groups, triangles, digest: hash.digest('hex').slice(0, 16), ms: performance.now() - t0 };
}
