// The Sun's living surface, painted on a `planet` actor with body 'sun' (`who`), at its depth and with its spin:
// boiling granulation (small bright cells parted by dark lanes, each cell swelling, brightening and fading in its own
// rhythm), limb darkening to deep orange at the edge with bright faculae near it, sunspot groups (dark umbra, lighter
// penumbra) turning with the globe, and at the limb a fine fringe of spicules and glowing prominence loops that slowly
// change shape. Gouache and ink: flat warm paint, an inked limb, never a photograph.
//
// An overlay (the whole scene, or its "shots") or a custom beat ("at": 0, "dur" at least the shot's, "scope": "shot"),
// as sunglow is. The face is drawn from film time alone, so it carries on unchanged across cuts and between the beat and
// the overlay. Params: who (the Sun actor, required); cells (granules across the diameter, default 60); boil (how fast
// they churn, default 1); spots (sunspot groups facing us at a time, default 3: twice as many go round the globe);
// proms (prominences round the limb, default 3: one at the left limb a little above the middle, one upper right, one
// lower left; they keep their places on the limb rather than turning with the spin); a (strength 0..1, default 1).
//
// Layer `depth`: one piece at the Sun's own depth and ground y, drawn after the actor, so what is nearer hides it and
// effects at the same depth laid after it are drawn over it. sizerow's row of Earths is drawn over the face when
// sunface comes first: as a scene overlay it always does (overlays come before beats); as a beat, list it before the
// sizerow beat in the shot, or the row is hidden under the face. A sunglow on top (who: sun) adds its light over the
// whole disc: give it "a" 0.2 to 0.3 (at its default of 1 its white core turns any face, and the row, white).
// Cost: about 25 to 90 ms a frame at 1080p, the most when the Sun fills the frame (most cells in view).
import { clamp, ell, ink, smooth } from 'cinecode/lib';
import { lineScaleFor } from 'cinecode/style';
import { globeOf } from 'cinecode/paint/planets';

const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
// an integer hash → [0, 1) and a smooth value noise on it (no tables: thousands of cells cost nothing to set up)
const hash = n => { n |= 0; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const vn = (k, x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(k * 7919 + i) * (1 - u) + hash(k * 7919 + i + 1) * u; };
// 3-D value noise (on the sphere: no seam)
const vn3 = (x, y, z) => {
  const i = Math.floor(x), j = Math.floor(y), l = Math.floor(z), sm = f => f * f * (3 - 2 * f), u = sm(x - i), v = sm(y - j), w = sm(z - l);
  const h = (a, b, e) => hash(a * 73856093 ^ b * 19349663 ^ e * 83492791);
  const L = (b, e) => h(i, b, e) * (1 - u) + h(i + 1, b, e) * u, M = e => L(j, e) * (1 - v) + L(j + 1, e) * v;
  return M(l) * (1 - w) + M(l + 1) * w;
};

// ── the palette: warm golds in the middle, deep orange at the limb (q = 1 − mu: 0 at the centre, 1 at the limb) ──
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const css = (c, al = 1) => `rgba(${c.map(v => Math.round(v)).join(',')},${al})`;
const limbU = q => Math.pow(clamp(q), 1.6);
const CELL_C = [[250, 176, 72], [255, 212, 118]], CELL_L = [[212, 92, 32], [240, 138, 56]];   // [dim, bright] cells
const LANE_C = [214, 114, 38], LANE_L = [146, 44, 20];                                        // the dark lanes
const NL = 20, NB = 6, SUB = 6, PASS = (5 + Math.sqrt(5)) / 10;
const CELL = Array.from({ length: NL }, (_, l) => Array.from({ length: NB }, (_, b) => {
  const u = limbU(l / (NL - 1)), w = b / (NB - 1);
  return css(mix(mix(CELL_C[0], CELL_C[1], w), mix(CELL_L[0], CELL_L[1], w), u));
}));
const LANE = Array.from({ length: NL }, (_, l) => css(mix(LANE_C, LANE_L, limbU(l / (NL - 1)))));
const LANE_AT = [0, 0.4, 0.6, 0.75, 0.85, 0.92, 0.96, 0.985, 1].map(r => [r, css(mix(LANE_C, LANE_L, limbU(1 - Math.sqrt(1 - r * r))))]);
const UMBRA = '#3e150d', PENUMBRA = '#9a4018', SPOT_INK = '#5c1f12', LIMB_INK = '#7e2410';

// a point on the globe (lam from the central meridian, phi latitude; axis tilt Bo): [x, y, mu], in globe radii
const onGlobe = (lam, phi, Bo) => {
  const cp = Math.cos(phi), sp = Math.sin(phi), cl = Math.cos(lam);
  return [cp * Math.sin(lam), -sp * Math.cos(Bo) + cp * cl * Math.sin(Bo), cp * cl * Math.cos(Bo) + sp * Math.sin(Bo)];
};
// a rounded blob on the points V: their polygon with its corners cut (one round of Chaikin's), in straight segments,
// since a path of thousands of curves fills many times slower than the same path in lines
function blobPath(c, V) {
  const n = V.length;
  for (let k = 0; k < n; k++) {
    const [x, y] = V[k], [nx, ny] = V[(k + 1) % n];
    if (k) c.lineTo(x * 0.75 + nx * 0.25, y * 0.75 + ny * 0.25); else c.moveTo(x * 0.75 + nx * 0.25, y * 0.75 + ny * 0.25);
    c.lineTo(x * 0.25 + nx * 0.75, y * 0.25 + ny * 0.75);
  }
  c.closePath();
}
// the outline of a small round thing on the sphere at (x, y) (globe units × R), radius r, foreshortened by mu toward
// the limb, its edge wobbled by noise key k at time tn: n wobbling radii round it, joined by a smooth curve (Catmull-Rom)
// sampled m times between each two, so a big one on the screen is a smooth outline of the same shape (m = 1: the n points)
function onDisc(X, Y, x, y, mu, r, n, k, tn, amp, m = 1) {
  const L = Math.hypot(x, y) || 1, nx = x / L, ny = y / L, V = [], w = [];
  for (let j = 0; j < n; j++) w.push(r * (1 - amp + 2 * amp * vn(k + j, tn + j * 0.37)));
  for (let q = 0; q < n * m; q++) {
    const j = Math.floor(q / m), f = (q % m) / m, p0 = w[(j + n - 1) % n], p1 = w[j], p2 = w[(j + 1) % n], p3 = w[(j + 2) % n];
    const rr = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    const a = (q / (n * m)) * TAU, lx = Math.cos(a) * rr, ly = Math.sin(a) * rr * mu;
    V.push([X - ny * lx + nx * ly, Y + nx * lx + ny * ly]);
  }
  return V;
}

function sunface(ctx, api) {
  const p = api.params || {}, g = globeOf(api, p.who);
  if (!g || !(g.fade > 0)) return;
  const t = api.t, B = g.B, R = g.R, [cx, cy] = g.c, dir = g.a.face < 0 ? -1 : 1, Bo = B.axis || 0;
  const ph = t * (B.spin || 0) * TAU, boil = p.boil ?? 1, cellsN = Math.max(8, p.cells ?? 60), alpha = clamp(p.a ?? 1);
  if (alpha <= 0) return;
  api.item([cx, g.a.key, g.z], (c, P) => {
    c.globalAlpha *= alpha;
    const px = 1 / P.s, m = c.getTransform();                    // a screen pixel in world px here; the frame in world px
    const fx0 = -m.e / m.a, fx1 = (api.W - m.e) / m.a, fy0 = -m.f / m.d, fy1 = (api.H - m.f) / m.d;
    const lw = 1.3 * (R / 50) * lineScaleFor(R / 50) * 0.8;
    const disc = ell(cx, cy, R * 1.004, R * 1.004 * (g.ob || 1), 17, R * 0.004);

    // ── at and beyond the limb, behind the disc: the chromosphere's thin red rim, spicules, prominences ──
    c.save();
    c.globalCompositeOperation = 'lighter';
    const ch = c.createRadialGradient(cx, cy, R * 0.99, cx, cy, R * 1.035);
    ch.addColorStop(0, 'rgba(255,96,48,0.85)'); ch.addColorStop(0.35, 'rgba(240,70,40,0.4)'); ch.addColorStop(1, 'rgba(220,50,30,0)');
    c.fillStyle = ch; c.beginPath(); c.arc(cx, cy, R * 1.035, 0, TAU); c.moveTo(cx + R * 0.985, cy); c.arc(cx, cy, R * 0.985, 0, TAU, true); c.fill();
    // spicules: a fine flickering fringe of short jets, each a thin tapering flame leaning a little, most short, a few tall
    const nsp = 1100, wb = Math.max(R * 0.0026, px * 0.7);   // (a fixed count: one that followed the size would reshuffle them in a dolly)
    for (const [col, k0] of [['rgba(226,74,40,0.5)', 0], ['rgba(255,140,84,0.42)', 1]]) {
      c.beginPath();
      for (let i = k0; i < nsp; i += 2) {
        const th = ((i + hash(i * 3 + 1) * 0.8) / nsp) * TAU, lean = (hash(i * 3 + 2) - 0.5) * 0.5 + (vn(i + 700, t * 0.5) - 0.5) * 0.3;
        const tall = hash(i * 3 + 5) < 0.12 ? 2.2 : 1;
        const len = R * (0.004 + 0.012 * vn(i + 300, t * 0.9 * boil + hash(i) * 9)) * (0.6 + 0.6 * hash(i * 3 + 7)) * tall;
        const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux, w = wb * (0.7 + 0.6 * hash(i * 3 + 9));
        const x0 = cx + ux * R * 0.994, y0 = cy + uy * R * 0.994, bx = lean * len, tx = x0 + ux * len + vx * bx, ty = y0 + uy * len + vy * bx;
        if (Math.max(x0, tx) < fx0 - wb || Math.min(x0, tx) > fx1 + wb || Math.max(y0, ty) < fy0 - wb || Math.min(y0, ty) > fy1 + wb) continue;
        const mx = x0 + ux * len * 0.5 + vx * bx * 0.25, my = y0 + uy * len * 0.5 + vy * bx * 0.25;
        c.moveTo(x0 - vx * w, y0 - vy * w);
        c.quadraticCurveTo(mx - vx * w * 0.6, my - vy * w * 0.6, tx, ty);
        c.quadraticCurveTo(mx + vx * w * 0.6, my + vy * w * 0.6, x0 + vx * w, y0 + vy * w);
        c.closePath();
      }
      c.fillStyle = col; c.fill();
    }
    // prominences: arcades of glowing plasma rooted on the limb, slowly changing shape: a dozen and more fine strands
    // laid one over another in light, each an arch from the limb and back, the low ones narrow and the high ones wide,
    // so they gather into a fibrous loop, brightest where they cross; a soft glow under them; a smaller loop leaning out
    // of one foot. Feet, heights, lean and the strands' paths wander with slow noise.
    const proms = Math.max(0, Math.round(p.proms ?? 3));
    const BASE = [[Math.PI + 0.34, 0.11, 0.18], [-0.6, 0.08, 0.21], [Math.PI * 0.62, 0.13, 0.13]];   // [angle, half width, height / R]
    for (let j = 0; j < proms; j++) {
      const [th0, hw0, hh0] = j < BASE.length ? BASE[j] : [(j * GOLDEN * 1.7) % TAU, 0.07 + 0.06 * hash(j * 11 + 1), 0.11 + 0.08 * hash(j * 11 + 2)];
      const tw = t * 0.07 + j * 7.3;
      // its whole reach, to skip it when it is out of the frame
      const ex = cx + Math.cos(th0) * R * (1 + hh0), ey = cy + Math.sin(th0) * R * (1 + hh0), reach = R * (hw0 * 1.6 + hh0 * 1.4);
      if (ex + reach < fx0 || ex - reach > fx1 || ey + reach < fy0 || ey - reach > fy1) continue;
      for (let l = 0; l < 2; l++) {
        const k0 = j * 100 + l * 50, loop = l === 1, ns = loop ? 7 : 16;
        const hw = hw0 * (loop ? 0.4 : 1) * (0.88 + 0.24 * vn(k0 + 1, tw * 0.8)), hh = R * hh0 * (loop ? 0.8 : 1) * (0.8 + 0.4 * vn(k0 + 2, tw));
        const mid = th0 + (loop ? hw0 * 0.75 : 0) + (vn(k0 + 3, tw * 0.6) - 0.5) * hw0 * 0.25, lean = (vn(k0 + 4, tw * 0.9) - 0.5) * hw * (loop ? 1.5 : 0.6);
        const thick = hh * 0.2, n = 28, arch = (hs, ws, k, sh) => {
          const Q = [];
          for (let q = 0; q <= n; q++) {
            const u = q / n, th = mid + sh - ws * Math.cos(Math.PI * u) + lean * hs * Math.sin(Math.PI * u) + (vn(k + 5, u * 2.5 + tw * 1.4) - 0.5) * hw * 0.3;
            const H = hh * hs * Math.pow(Math.sin(Math.PI * u), 0.8) * (0.85 + 0.3 * vn(k + 6, u * 3 - tw * 1.2));
            Q.push([cx + Math.cos(th) * (R * 0.985 + H), cy + Math.sin(th) * (R * 0.985 + H)]);
          }
          return Q;
        };
        // the glow, in soft dabs along the outer arch
        const O = arch(1, hw, k0, 0);
        c.globalAlpha = alpha * P.a;
        for (let q = 2; q < n - 1; q += 2) {
          const [x, y] = O[q], r = thick * (2 + 0.8 * hash(k0 * 37 + q)), gr = c.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(255,96,40,0.2)'); gr.addColorStop(1, 'rgba(255,86,30,0)');
          c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        // the strands
        for (let s = 0; s < ns; s++) {
          const f = (s + 0.5) / ns, k = k0 + 6 + s * 3, hs = 0.3 + 0.7 * Math.pow(f, 0.6) * (0.9 + 0.2 * vn(k + 1, tw * 1.5));
          const ws = hw * (0.45 + 0.55 * hs), sh = (hash(k + 2) - 0.5) * hw * 0.3, hot = hs > 0.75 && hash(k + 3) < 0.45;
          c.globalAlpha = alpha * P.a * (hot ? 0.36 : 0.18 + 0.13 * hash(k + 4));
          ink(c, arch(hs, ws, k, sh), Math.max(thick * (0.14 + 0.22 * hash(k + 5)), px * 1.1), { closed: false, color: hot ? 'rgb(255,176,100)' : 'rgb(236,80,40)', seed: k });
        }
      }
    }
    c.restore();

    // ── the disc: the lanes' colour, darkening to the limb, then the cells, spots, limb shade and faculae over it ──
    c.save();
    c.beginPath(); disc.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    const lane = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.004);
    for (const [r, col] of LANE_AT) lane.addColorStop(r, col);
    c.fillStyle = lane; c.fill();   // (no clip: an antialiased clip makes every fill under it many times slower; cells
    // near the limb are foreshortened flat against it and the inked limb covers their edge)

    // granulation: cells laid evenly over the whole sphere (a Fibonacci lattice, jittered), turning with the spin; each
    // swells and brightens, then shrinks and fades in its own rhythm, its edge wobbling, so the surface boils
    const N = Math.round(3.63 * cellsN * cellsN), d = 2 / cellsN, rho = 0.6 * d * R;
    if (rho * P.s >= 0.9) {
      // (each cell's outline: K points round it, foreshortened toward the limb, their radii wobbling; kept in flat
      // arrays, as thousands of small arrays a frame cost more than drawing them)
      const K = 9, CA = [], SA = [], tb = t * boil, tn = tb * 0.55, mx = rho * 1.4;
      for (let k = 0; k < K; k++) { CA.push(Math.cos((k / K) * TAU)); SA.push(Math.sin((k / K) * TAU)); }
      const CX = new Float64Array(N), CY = new Float64Array(N), CS = new Float64Array(N), OFF = new Float64Array(N * K * 2), lists = Array.from({ length: NL * NB * SUB }, () => []);
      let nv = 0;
      for (let i = 0; i < N; i++) {
        const z = 1 - (2 * i + 1) / N, phi0 = Math.asin(z), h1 = hash(i * 8 + 1), h2 = hash(i * 8 + 2);
        const phi = phi0 + (h1 - 0.5) * 0.44 * d, lam = dir * ((i * GOLDEN + (h2 - 0.5) * 0.44 * d / Math.max(0.15, Math.cos(phi0))) - ph);
        const [gx, gy, mu] = onGlobe(lam, phi, Bo);
        if (mu <= 0.02) continue;
        const X = cx + gx * R, Y = cy + gy * R;
        if (X < fx0 - mx || X > fx1 + mx || Y < fy0 - mx || Y > fy1 + mx) continue;
        // a life: it swells up out of a lane, lives, then sinks and fades (a new one rises in its place)
        const per = 2.2 + 2.8 * hash(i * 8 + 3), s = (tb / per + hash(i * 8 + 4)) % 1, e = clamp(s / 0.22) * clamp((1 - s) / 0.28);
        const ee = e * e * (3 - 2 * e), size = rho * (0.5 + 0.5 * ee) * (0.72 + 0.5 * hash(i * 8 + 5));
        // brighter and dimmer patches a few cells across (supergranulation), drifting slowly
        const l0 = i * GOLDEN, cp = Math.cos(phi) * 5, sg = vn3(cp * Math.cos(l0), cp * Math.sin(l0), Math.sin(phi) * 5 + t * 0.04);
        const br = clamp(ee * (0.2 + 0.6 * hash(i * 8 + 6)) + (sg - 0.5) * 0.6), hb = hash(i * 8 + 7) * 40;
        const L = Math.hypot(gx, gy) || 1, nx = gx / L, ny = gy / L;
        for (let k = 0; k < K; k++) {
          const rr = size * (1 + 0.15 * Math.sin(tn * (0.9 + 0.13 * k) + hb + k * 2.1)), lx = CA[k] * rr, ly = SA[k] * rr * mu, o = (nv * K + k) * 2;
          OFF[o] = -ny * lx + nx * ly; OFF[o + 1] = nx * lx + ny * ly;
        }
        CX[nv] = X; CY[nv] = Y; CS[nv] = size;
        lists[(Math.min(NL - 1, Math.round((1 - mu) * (NL - 1))) * NB + Math.min(NB - 1, Math.round(br * (NB - 1)))) * SUB + ((((i * PASS) % 1) * SUB) | 0)].push(nv++);
      }
      // (big on the screen, their corners are cut once, so they read as soft rounded cells, not cut stones; the lanes
      // under them keep the corners, which widens the lanes where three cells meet)
      const soft = rho * P.s >= 7, path = (L, grow) => {
        c.beginPath();
        for (const v of L) {
          const X = CX[v], Y = CY[v], f = 1 + grow / CS[v], o = v * K * 2;
          if (!soft || grow) {
            c.moveTo(X + OFF[o] * f, Y + OFF[o + 1] * f);
            for (let k = 1; k < K; k++) c.lineTo(X + OFF[o + 2 * k] * f, Y + OFF[o + 2 * k + 1] * f);
          } else {
            for (let k = 0; k < K; k++) {
              const a = o + 2 * k, b = o + 2 * ((k + 1) % K), ax = OFF[a] * f, ay = OFF[a + 1] * f, bx = OFF[b] * f, by = OFF[b + 1] * f;
              if (k) c.lineTo(X + ax * 0.75 + bx * 0.25, Y + ay * 0.75 + by * 0.25); else c.moveTo(X + ax * 0.75 + bx * 0.25, Y + ay * 0.75 + by * 0.25);
              c.lineTo(X + ax * 0.25 + bx * 0.75, Y + ay * 0.25 + by * 0.75);
            }
          }
          c.closePath();
        }
      };
      // each cell laid on a slightly bigger one in the lanes' colour, so overlapping cells part along a dark lane like
      // packed granules (two fills: a stroke of thousands of outlines rasterises several times slower); when the cells
      // are only a few pixels across the lanes are the gaps between them. A lane parts a cell only from cells of earlier
      // passes (two overlapping cells in one fill fuse into one blob), so each colour's cells go in SUB passes, cell i in
      // pass ⌊SUB·frac(i·PASS)⌋: on this lattice a cell's neighbours are i ± a Fibonacci number F, and every F·PASS is at
      // least 0.17 from a whole number (it tends to a fifth or two fifths), more than 1/SUB, so no two neighbours ever
      // share a pass (and a cell's pass never changes, so nothing flickers)
      const laneW = 0.075 * d * R * smooth(2.5, 6, rho * P.s);   // (eased in with the size, so a dolly shows no step)
      lists.forEach((L, k) => {
        if (!L.length) return;
        const l = Math.floor(k / (NB * SUB)), b = Math.floor(k / SUB) % NB;
        if (laneW > 0.15 * px) { path(L, laneW); c.fillStyle = LANE[l]; c.fill(); }
        path(L, 0); c.fillStyle = CELL[l][b]; c.fill();
      });
    }

    // sunspots: groups in the active belts (two latitudes north and south), each a leader, a follower and pores
    const groups = 2 * Math.max(0, Math.round(p.spots ?? 3)), spots = [];
    for (let j = 0; j < groups; j++) {
      const lon0 = (j / groups) * TAU + (hash(j * 17 + 1) - 0.5) * 0.7, lat0 = (j % 2 ? -1 : 1) * (0.2 + 0.28 * hash(j * 17 + 2));
      const big = R * (0.022 + 0.016 * hash(j * 17 + 3)), span = 0.1 + 0.08 * hash(j * 17 + 4), np = 3 + Math.floor(hash(j * 17 + 5) * 4);
      spots.push([lon0, lat0, big, j * 40]);
      spots.push([lon0 - span, lat0 + Math.sign(lat0) * 0.03, big * (0.55 + 0.3 * hash(j * 17 + 6)), j * 40 + 10]);
      for (let k = 0; k < np; k++) spots.push([lon0 - span * (0.25 + 0.6 * hash(j * 17 + 7 + k)), lat0 + (hash(j * 17 + 20 + k) - 0.5) * 0.08, big * (0.18 + 0.2 * hash(j * 17 + 30 + k)), j * 40 + 20 + k, true]);
    }
    const seen = [];
    for (const [lon, lat, r, k, pore] of spots) {
      const [gx, gy, mu] = onGlobe(dir * (lon - ph), lat, Bo);
      if (mu <= 0.03) continue;
      const X = cx + gx * R, Y = cy + gy * R, rp = pore ? r * 1.7 : r * 2.2;
      if (X < fx0 - rp || X > fx1 + rp || Y < fy0 - rp || Y > fy1 + rp) continue;
      // (about a point per screen pixel of radius, so a spot seen close is a smooth curve, not a polygon)
      const tn = t * 0.05 + k, sp = clamp(Math.round((rp * P.s) / 11), 1, 12), su = clamp(Math.round((r * P.s) / 9), 1, 12);
      seen.push({ X, Y, gx, gy, mu, r, rp, k, pore, fade: clamp((mu - 0.03) / 0.12), Vp: onDisc(X, Y, gx, gy, mu, rp, 11, k * 13 + 5000, tn, 0.16, sp), Vu: onDisc(X, Y, gx, gy, mu, r, 9, k * 13 + 6000, tn * 1.3, 0.2, su) });
    }
    for (const S of seen) { c.globalAlpha = P.a * alpha * S.fade; c.fillStyle = PENUMBRA; c.beginPath(); blobPath(c, S.Vp); c.fill(); }
    for (const S of seen) {
      if (S.pore || S.rp * P.s < 10) continue;
      // the penumbra's filaments: fine light and dark threads running out from the umbra
      const { X, Y, gx, gy, mu, r, rp, k } = S, L = Math.hypot(gx, gy) || 1, nx = gx / L, ny = gy / L;
      const at = (a, rr) => { const ox = Math.cos(a) * rr, oy = Math.sin(a) * rr * mu; return [X - ny * ox + nx * oy, Y + nx * ox + ny * oy]; };
      c.save(); c.globalAlpha = P.a * alpha * S.fade;
      c.lineWidth = Math.max(px * 0.7, rp * 0.035); c.lineCap = 'round';
      for (let q = 0; q < 44; q++) {
        const a = (q / 44) * TAU + (hash(k * 31 + q) - 0.5) * 0.12, bend = (hash(k * 37 + q) - 0.5) * 0.25;
        const [x0, y0] = at(a, r * (0.85 + 0.1 * hash(k * 41 + q))), [x1, y1] = at(a + bend, rp * (0.68 + 0.16 * hash(k * 43 + q))), [xm, ym] = at(a + bend * 0.3, (r + rp) * 0.5);
        c.strokeStyle = q % 2 ? 'rgba(206,112,52,0.4)' : 'rgba(96,30,14,0.3)';
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(xm, ym, x1, y1); c.stroke();
      }
      c.restore();
    }
    for (const S of seen) { c.globalAlpha = P.a * alpha * S.fade; c.fillStyle = UMBRA; c.beginPath(); blobPath(c, S.Vu); c.fill(); }
    for (const S of seen) {
      if (S.pore || S.rp * P.s < 6) continue;
      c.globalAlpha = P.a * alpha * S.fade * 0.5; ink(c, S.Vp, Math.max(px * 0.9, S.rp * 0.04), { color: SPOT_INK, seed: S.k + 3 });
    }
    c.globalAlpha = P.a * alpha;

    // limb darkening: the whole face warmed and deepened toward the edge
    const ld = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.004);
    ld.addColorStop(0.5, 'rgba(190,60,20,0)'); ld.addColorStop(0.55, 'rgba(190,60,20,0.01)'); ld.addColorStop(0.8, 'rgba(180,54,18,0.14)');
    ld.addColorStop(0.93, 'rgba(170,46,16,0.32)'); ld.addColorStop(1, 'rgba(150,36,14,0.55)');
    c.fillStyle = ld; c.beginPath(); disc.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.moveTo(cx + R * 0.5, cy); c.arc(cx, cy, R * 0.5, 0, TAU, true); c.fill();   // (an annulus: inside half the radius it adds nothing)

    // faculae: clusters of small bright flecks in the active belts, strung out a little, seen only near the limb
    const nf = Math.round(cellsN * 3), fbuck = [[], [], []];
    for (let i = 0; i < nf; i++) {
      const band = i % 2 ? -1 : 1, lat0 = band * (0.08 + 0.55 * hash(i * 5 + 1)), lon0 = hash(i * 5 + 2) * TAU, bend = (hash(i * 5 + 3) - 0.5) * 2;
      const flecks = 3 + Math.floor(hash(i * 5 + 4) * 4);
      for (let q = 0; q < flecks; q++) {
        const v = q - (flecks - 1) / 2, lon = lon0 + v * 0.6 * d * Math.cos(bend) + (hash(i * 71 + q) - 0.5) * 0.7 * d, lat = lat0 + v * 0.6 * d * Math.sin(bend) + (hash(i * 61 + q) - 0.5) * 0.7 * d;
        const [gx, gy, mu] = onGlobe(dir * (lon - ph), lat, Bo);
        if (mu <= 0.03 || mu > 0.5) continue;
        const X = cx + gx * R, Y = cy + gy * R, r = R * d * (0.26 + 0.24 * hash(i * 67 + q));
        if (X < fx0 - r || X > fx1 + r || Y < fy0 - r || Y > fy1 + r) continue;
        const k = clamp((0.5 - mu) / 0.3) * clamp((mu - 0.03) / 0.08) * (0.55 + 0.45 * vn(i * 9 + q + 9000, t * 0.35 * boil));
        if (k < 0.15) continue;
        fbuck[Math.min(2, Math.floor(k * 3))].push(onDisc(X, Y, gx, gy, mu, r, 6, (i * 9 + q) * 7 + 7000, t * 0.4 * boil, 0.3));
      }
    }
    fbuck.forEach((L, q) => { if (!L.length) return; c.fillStyle = `rgba(255,226,152,${(0.32 + 0.2 * q).toFixed(2)})`; c.beginPath(); for (const V of L) blobPath(c, V); c.fill(); });
    c.restore();

    // the inked limb, warm
    c.save(); c.globalAlpha *= 0.85; ink(c, disc, Math.max(lw, px * 1.2), { color: LIMB_INK, seed: 23 }); c.restore();
  });
}

export const overlays = { sunface: { layer: 'depth', draw: sunface } };
export const custom = { sunface: { layer: 'depth', draw: (ctx, u, api) => sunface(ctx, api) } };
