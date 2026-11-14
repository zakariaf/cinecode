// Shapes described as blobs, turned into smooth meshes.
//
// A shape is an ordered list of operations on simple solids (ellipsoid, rounded cone,
// rounded box). "add" melts a solid into the shape with a soft join of width k,
// "sub" carves it out, "clip" keeps one side of a plane, "line" keeps what is above (or
// below) a line drawn round a head (a hairline), "ridge" combs fine ridges into what is
// there so far (hair strands). The result is a distance
// field: a function that says how far any point is from the surface. meshShape()
// walks a grid through that field and produces a triangle mesh whose points sit exactly
// on the surface, with smooth normals taken from the field itself.
//
// Each added solid can name a bone and a tint. The mesh records, for every point,
// which solids it is near; that gives skin weights (which bones move it) and a
// per-vertex colour for free.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BIG = 1e3;

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);

// Rotation matrix (row-major 3x3) from Euler angles applied X then Y then Z.
function rotXYZ([ex = 0, ey = 0, ez = 0] = []) {
  const cx = Math.cos(ex), sx = Math.sin(ex), cy = Math.cos(ey), sy = Math.sin(ey), cz = Math.cos(ez), sz = Math.sin(ez);
  // R = Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

// Turn a solid's description into { d(x,y,z), lo, hi } (distance function and bounds).
export function compileSolid(s) {
  const grow = s.grow ?? 0;
  if (s.type === 'ell' || s.type === 'box') {
    const [cx, cy, cz] = s.c, [rx, ry, rz] = s.r;
    const R = rotXYZ(s.rot);
    const rad = s.type === 'box' ? (s.round ?? 0) : 0;
    const ext = Math.hypot(rx, ry, rz) + grow;
    const lo = [cx - ext, cy - ext, cz - ext], hi = [cx + ext, cy + ext, cz + ext];
    if (!s.rot) { // tight bounds when not rotated
      lo[0] = cx - rx - grow; lo[1] = cy - ry - grow; lo[2] = cz - rz - grow;
      hi[0] = cx + rx + grow; hi[1] = cy + ry + grow; hi[2] = cz + rz + grow;
    }
    const d = s.type === 'ell'
      ? (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        // into the solid's own axes (transpose of R)
        const lx = R[0] * px + R[3] * py + R[6] * pz, ly = R[1] * px + R[4] * py + R[7] * pz, lz = R[2] * px + R[5] * py + R[8] * pz;
        const ax = lx / rx, ay = ly / ry, az = lz / rz;
        const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
        if (k0 < 1e-9) return -Math.min(rx, ry, rz) - grow;
        const bx = ax / rx, by = ay / ry, bz = az / rz;
        const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
        return k0 * (k0 - 1) / k1 - grow;
      }
      : (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const lx = R[0] * px + R[3] * py + R[6] * pz, ly = R[1] * px + R[4] * py + R[7] * pz, lz = R[2] * px + R[5] * py + R[8] * pz;
        const qx = Math.abs(lx) - (rx - rad), qy = Math.abs(ly) - (ry - rad), qz = Math.abs(lz) - (rz - rad);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
        return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rad - grow;
      };
    return { d, lo, hi };
  }
  if (s.type === 'torus') { // a ring: R is the ring's radius, r the thickness; flat in its own x-z plane
    const [cx, cy, cz] = s.c, R0 = s.R, r0 = s.r, R = rotXYZ(s.rot), ext = R0 + r0 + grow;
    const d = (x, y, z) => {
      const px = x - cx, py = y - cy, pz = z - cz;
      const lx = R[0] * px + R[3] * py + R[6] * pz, ly = R[1] * px + R[4] * py + R[7] * pz, lz = R[2] * px + R[5] * py + R[8] * pz;
      return Math.hypot(Math.hypot(lx, lz) - R0, ly) - r0 - grow;
    };
    return { d, lo: [cx - ext, cy - ext, cz - ext], hi: [cx + ext, cy + ext, cz + ext] };
  }
  if (s.type === 'cone') { // rounded cone: a capsule whose two ends may have different radii
    const [ax, ay, az] = s.a, [bx, by, bz] = s.b, ra = s.ra, rb = s.rb ?? s.ra;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const l2 = ux * ux + uy * uy + uz * uz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
    const rm = Math.max(ra, rb) + grow;
    const lo = [Math.min(ax, bx) - rm, Math.min(ay, by) - rm, Math.min(az, bz) - rm];
    const hi = [Math.max(ax, bx) + rm, Math.max(ay, by) + rm, Math.max(az, bz) + rm];
    const d = (x, y, z) => {
      const px = x - ax, py = y - ay, pz = z - az;
      const yy = px * ux + py * uy + pz * uz, zz = yy - l2;
      const wx = px * l2 - ux * yy, wy = py * l2 - uy * yy, wz = pz * l2 - uz * yy;
      const x2 = wx * wx + wy * wy + wz * wz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb - grow;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra - grow;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra - grow;
    };
    return { d, lo, hi };
  }
  throw new Error('unknown solid type ' + s.type);
}

// A line drawn round a head, seen from its centre c: pts are [compass degrees (0 front, 90 side, 180 back),
// degrees above the level of c (90 is the crown, negative is below)], the same on both sides. Negative where
// a point is on the kept side: above the line (hair), or below it (a beard).
function headLine({ c, pts, side = 'above' }) {
  const sg = side === 'below' ? -1 : 1;
  const at = (deg) => {
    if (deg <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (deg <= pts[i][0]) { const u = (deg - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u * u * (3 - 2 * u); }
    return pts[pts.length - 1][1];
  };
  return (x, y, z) => {
    const dx = x - c[0], dy = y - c[1], dz = z - c[2], r = Math.hypot(dx, dy, dz) || 1e-6;
    return sg * (at(Math.atan2(Math.abs(dx), dz) * 180 / Math.PI) * Math.PI / 180 - Math.asin(dy / r)) * r;
  };
}
// Strand ridges: a wave of height amp, n ridges round the vertical through c (they run down the head from the
// crown), a little uneven. They fade out near the crown, where they would all crowd into one point.
// With `axis` and `r` (a bun: its centre c, the way it stands out of the head, its radius) the ridges wind round
// that axis instead, turning as they go (hair twisted into a bun), and only within 1.3 r of c.
function ridges({ c, n, amp = 0.0015, wobble = 0.5, axis, r }) {
  if (axis) {
    const [ax, ay, az] = axis, e = Math.abs(ay) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const d1 = e[0] * ax + e[1] * ay + e[2] * az, u = [e[0] - ax * d1, e[1] - ay * d1, e[2] - az * d1], ul = Math.hypot(...u);
    u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const w = [ay * u[2] - az * u[1], az * u[0] - ax * u[2], ax * u[1] - ay * u[0]];
    return (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2], l = Math.hypot(px, py, pz);
      if (l > 1.3 * r) return 0;
      const h = px * ax + py * ay + pz * az, a = Math.atan2(px * w[0] + py * w[1] + pz * w[2], px * u[0] + py * u[1] + pz * u[2]);
      const s = Math.sin(Math.round(n) * a + 2.2 * h / r), side = Math.min(Math.max((Math.sqrt(Math.max(l * l - h * h, 0)) / (l || 1) - 0.2) / 0.35, 0), 1);
      const near = Math.min(Math.max((1.3 * r - l) / (0.3 * r), 0), 1) * Math.min(Math.max((h / r + 0.6) / 0.4, 0), 1);   // none at the foot, under the tie
      return amp * side * side * (3 - 2 * side) * near * (s * 0.6 + 0.4 * s * s * s);
    };
  }
  return (x, y, z) => {
    const a = Math.atan2(x - c[0], z - c[2]), s = Math.sin(Math.round(n) * a + wobble * (Math.sin(y * 61 + a * 3) + Math.sin(a * 7 + y * 23)));
    const side = Math.hypot(x - c[0], z - c[2]) / (Math.hypot(x - c[0], y - c[1], z - c[2]) || 1), fade = Math.min(Math.max((side - 0.25) / 0.3, 0), 1);
    return amp * fade * fade * (3 - 2 * fade) * (s * 0.6 + 0.4 * s * s * s);
  };
}

// ops: [{ op:'add'|'sub'|'clip'|'line'|'ridge', ...solid | n, d | c, pts, side | c, n, amp; k, bone, tint }]
export function compileShape(ops) {
  const list = ops.map((o) => {
    const op = o.op ?? 'add';
    if (op === 'line') return { op: 'clip', k: o.k ?? 0, d: headLine(o), lo: null, hi: null };
    if (op === 'ridge') return { op, d: ridges(o), lo: null, hi: null };
    if (op === 'clip') {
      const [nx, ny, nz] = o.n; const il = 1 / Math.hypot(nx, ny, nz);
      return { op, k: o.k ?? 0, d: (x, y, z) => (nx * x + ny * y + nz * z) * il - o.d * il, lo: null, hi: null };
    }
    return { op, k: o.k ?? 0.03, ...compileSolid(o), bone: o.bone, tint: o.tint, soft: o.soft };
  });
  const f = (x, y, z) => {
    let d = BIG;
    for (const o of list) {
      const v = o.d(x, y, z);
      if (o.op === 'add') d = smin(d, v, o.k);
      else if (o.op === 'sub') d = smax(d, -v, o.k);
      else if (o.op === 'ridge') d -= v;
      else d = smax(d, v, o.k); // clip: keep where plane distance < 0
    }
    return d;
  };
  return { list, f };
}

// Where a ray from `from` along the unit direction `dir` first meets the surface of f, and the surface's
// direction there: { p, n }, or null if it misses within `far` metres. Used to stand things on a head.
export function hitSurface(f, from, dir, far = 1) {
  let t = 0;
  for (let i = 0; i < 200 && t < far; i++) {
    const x = from[0] + dir[0] * t, y = from[1] + dir[1] * t, z = from[2] + dir[2] * t, d = f(x, y, z);
    if (d < 1e-5) {
      const e = 1e-4, n = [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)], l = Math.hypot(...n) || 1;
      return { p: [x, y, z], n: n.map((v) => v / l) };
    }
    t += Math.max(d * 0.8, 2e-5);
  }
  return null;
}

// Naive surface nets over a regular grid of cell size h.
export function meshShape(ops, h = 0.01) {
  const shape = compileShape(ops);
  const { list, f } = shape;
  const pad = 3 * h;
  const lo = [BIG, BIG, BIG], hi = [-BIG, -BIG, -BIG];
  for (const o of list) if (o.op === 'add') for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.lo[i]); hi[i] = Math.max(hi[i], o.hi[i]); }
  for (let i = 0; i < 3; i++) { lo[i] = Math.floor((lo[i] - pad) / h) * h; hi[i] += pad; }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const g = new Float32Array(nx * ny * nz).fill(BIG);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (const o of list) {
    let i0 = 0, i1 = nx - 1, j0 = 0, j1 = ny - 1, k0 = 0, k1 = nz - 1;
    if (o.lo) {
      const m = (o.k ?? 0) + pad;
      i0 = Math.max(0, Math.floor((o.lo[0] - m - lo[0]) / h)); i1 = Math.min(nx - 1, Math.ceil((o.hi[0] + m - lo[0]) / h));
      j0 = Math.max(0, Math.floor((o.lo[1] - m - lo[1]) / h)); j1 = Math.min(ny - 1, Math.ceil((o.hi[1] + m - lo[1]) / h));
      k0 = Math.max(0, Math.floor((o.lo[2] - m - lo[2]) / h)); k1 = Math.min(nz - 1, Math.ceil((o.hi[2] + m - lo[2]) / h));
    }
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = o.d(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h), q = idx(i, j, k);
      g[q] = o.op === 'add' ? smin(g[q], v, o.k) : o.op === 'sub' ? smax(g[q], -v, o.k) : o.op === 'ridge' ? g[q] - v : smax(g[q], v, o.k);
    }
  }
  // one vertex per cell the surface passes through
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = g[idx(i + cx[c], j + cy[c], k + cz[c])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += cx[a] + t * (cx[b] - cx[a]); sy += cy[a] + t * (cy[b] - cy[a]); sz += cz[a] + t * (cz[b] - cz[a]); n++;
    }
    cellV[idx(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  // one quad per grid edge the surface crosses
  const tris = [];
  const quad = (a, b, c, d, flip) => { if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = g[idx(i, j, k)] < 0;
    if (v0 !== (g[idx(i + 1, j, k)] < 0)) quad(cellV[idx(i, j - 1, k - 1)], cellV[idx(i, j, k - 1)], cellV[idx(i, j, k)], cellV[idx(i, j - 1, k)], !v0);
    if (v0 !== (g[idx(i, j + 1, k)] < 0)) quad(cellV[idx(i - 1, j, k - 1)], cellV[idx(i - 1, j, k)], cellV[idx(i, j, k)], cellV[idx(i, j, k - 1)], !v0);
    if (v0 !== (g[idx(i, j, k + 1)] < 0)) quad(cellV[idx(i - 1, j - 1, k)], cellV[idx(i, j - 1, k)], cellV[idx(i, j, k)], cellV[idx(i - 1, j, k)], !v0);
  }
  // pull every vertex onto the true surface; normal = direction the distance grows
  const nv = pos.length / 3;
  const position = new Float32Array(pos), normal = new Float32Array(nv * 3);
  const e = h * 0.25;
  for (let v = 0; v < nv; v++) {
    let x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
    let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z); gy = f(x, y + e, z) - f(x, y - e, z); gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (it < 2) { const st = Math.max(-h, Math.min(h, d)); x -= gx * st; y -= gy * st; z -= gz * st; }
    }
    position[v * 3] = x; position[v * 3 + 1] = y; position[v * 3 + 2] = z;
    normal[v * 3] = gx; normal[v * 3 + 1] = gy; normal[v * 3 + 2] = gz;
  }
  return { position, normal, index: new Uint32Array(tris), shape };
}

// For every vertex: which bones move it (up to 4) and what tint it has.
// boneIndex: name -> index; near: name -> Set of bone names it may share a vertex with.
// helpers: [{ name, a, b }] joints that turn half-way between bones a and b (see character.mjs): a point shared by
// a and b gives half of what they share to the helper, so a deep bend neither pinches nor (all of it) folds
// over itself in an armpit. Half kept 96 to 99 percent of the volume in a deep crouch and with an arm raised,
// where plain skinning kept 89 to 96 and the whole share swelled to 110.
export function skinShape(mesh, boneIndex, near, { soft = 0.03, tintSoft = 0.02, helpers = [] } = {}) {
  const adds = mesh.shape.list.filter((o) => o.op === 'add');
  const nv = mesh.position.length / 3;
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4), color = new Float32Array(nv * 3);
  const bw = new Map();
  for (let v = 0; v < nv; v++) {
    const x = mesh.position[v * 3], y = mesh.position[v * 3 + 1], z = mesh.position[v * 3 + 2];
    bw.clear();
    let best = null, bestD = BIG, tr = 0, tg = 0, tb = 0, tw = 0;
    const ds = adds.map((o) => o.d(x, y, z));
    for (let i = 0; i < adds.length; i++) if (ds[i] < bestD) { bestD = ds[i]; best = adds[i]; }
    for (let i = 0; i < adds.length; i++) {
      const o = adds[i], dd = Math.max(ds[i] - bestD, 0);
      const wt = Math.exp(-dd / tintSoft);
      const t = o.tint ?? [1, 1, 1];
      tr += wt * t[0]; tg += wt * t[1]; tb += wt * t[2]; tw += wt;
      if (!o.bone) continue;
      if (o.bone !== best.bone && near && !(near.get(best.bone)?.has(o.bone))) continue;
      const w = Math.exp(-dd / (o.soft ?? soft));
      if (w > (bw.get(o.bone) ?? 0)) bw.set(o.bone, w);
    }
    color[v * 3] = tr / tw; color[v * 3 + 1] = tg / tw; color[v * 3 + 2] = tb / tw;
    for (const h of helpers) {
      const m = Math.min(bw.get(h.a) ?? 0, bw.get(h.b) ?? 0);
      if (m > 0) { bw.set(h.name, m); bw.set(h.a, bw.get(h.a) - m / 2); bw.set(h.b, bw.get(h.b) - m / 2); }
    }
    const top = [...bw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const [, w] of top) sum += w;
    for (let i = 0; i < 4; i++) {
      skinIndex[v * 4 + i] = i < top.length ? boneIndex.get(top[i][0]) : 0;
      skinWeight[v * 4 + i] = i < top.length ? top[i][1] / sum : 0;
    }
  }
  return { skinIndex, skinWeight, color };
}

// Meshing takes a second or two for a whole character, so results are kept on disk,
// keyed by the exact description. The cache is only a shortcut: with or without it the
// numbers are the same. It lives in the OS temp folder, shared by every film, in a folder
// named by this file's own source (the code that meshes and skins): a change here never
// serves an old mesh, and the first mesh the new code writes clears the old folders out.
const root = path.join(os.tmpdir(), 'cinecode-scene3d');
const dir = path.join(root, crypto.createHash('sha1').update(fs.readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12));
export function cached(key, build) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(key)).digest('hex').slice(0, 16);
  const file = path.join(dir, hash + '.bin');
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    const headLen = buf.readUInt32LE(0);
    const head = JSON.parse(buf.subarray(4, 4 + headLen).toString());
    let off = 4 + headLen; const out = {};
    for (const [name, type, len] of head) {
      const T = { f32: Float32Array, u32: Uint32Array, u16: Uint16Array }[type];
      const bytes = len * T.BYTES_PER_ELEMENT;
      out[name] = new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + bytes));
      off += bytes;
    }
    return out;
  }
  const out = build();
  const head = [], parts = [];
  for (const [name, arr] of Object.entries(out)) {
    const type = arr instanceof Float32Array ? 'f32' : arr instanceof Uint32Array ? 'u32' : 'u16';
    head.push([name, type, arr.length]);
    parts.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  }
  const hb = Buffer.from(JSON.stringify(head));
  const lenb = Buffer.alloc(4); lenb.writeUInt32LE(hb.length, 0);
  if (!fs.existsSync(dir)) {
    for (const f of fs.existsSync(root) ? fs.readdirSync(root) : []) if (f !== path.basename(dir)) fs.rmSync(path.join(root, f), { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, Buffer.concat([lenb, hb, ...parts]));
  fs.renameSync(tmp, file);
  return out;
}
