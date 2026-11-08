// Procedural sound effects and ambience beds for a storybook film.
// Everything is synthesized from seeded noise, oscillators and resonators: physical-ish models
// (Minnaert bubbles, modal plates, stick-slip friction, pulse-train calls) rather than samples.
// makeSfx(name, { seed, dur, ...params }) → Float32Array (mono, 48 kHz, level-calibrated)
// ambience(name, dur, { seed }) → { L, R } (stereo bed, non-repeating, calibrated loudness)
import { rng, noise1, clamp } from '../core/lib.mjs';

export const SR = 48000;
const TAU = Math.PI * 2;

// ───────────────────────────── small DSP kit ─────────────────────────────

/** FNV-1a string hash → uint32 (seeds from names). */
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const nlen = sec => Math.max(1, Math.round(sec * SR));
const buf = sec => new Float32Array(nlen(sec));
const lerp = (a, b, t) => a + (b - a) * t;
const between = (r, a, b) => a + (b - a) * r();
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const expRand = (r, a, b) => a * Math.pow(b / a, r());
/** Smooth onset then exponential decay. t in s. */
const strike = (t, att, dec) => (t < 0 ? 0 : t < att ? Math.sin((Math.PI / 2) * (t / att)) ** 2 : Math.exp(-(t - att) / dec));
const hann = u => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2);
const ramp = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : Math.sin((Math.PI / 2) * ((t - a) / (b - a))) ** 2);

/** Slow non-repeating wander in ~[0, 1] (three value-noise octaves at incommensurate rates). */
function wander(seed, rate) {
  const a = noise1(seed), b = noise1(seed + 7), c = noise1(seed + 13);
  return t => a(t * rate) * 0.55 + b(t * rate * 2.137 + 3.1) * 0.3 + c(t * rate * 0.413 + 7.7) * 0.15;
}

const white = r => () => r() * 2 - 1;
/** Pink noise (Paul Kellet's refined filter), roughly unit RMS·0.3. */
function pink(r) {
  const b = new Float64Array(7);
  return () => {
    const w = r() * 2 - 1;
    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759; b[2] = 0.969 * b[2] + w * 0.153852;
    b[3] = 0.8665 * b[3] + w * 0.3104856; b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
    const o = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362; b[6] = w * 0.115926;
    return o * 0.11;
  };
}
/** Brown (red) noise with a leak so it never drifts. */
function brown(r) { const y = new Float64Array(1); return () => (y[0] = (y[0] + 0.02 * (r() * 2 - 1)) * 0.998) * 3.2; }

/** RBJ biquad coefficients. type: lp hp bp(0 dB peak) peak ls hs. */
function coefs(type, f, q = 0.707, db = 0) {
  f = clamp(f, 10, SR * 0.45);
  const w = (TAU * f) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else if (type === 'ls' || type === 'hs') {
    const sq = 2 * Math.sqrt(A) * al, sg = type === 'ls' ? 1 : -1;
    b0 = A * ((A + 1) - sg * (A - 1) * c + sq); b1 = sg * 2 * A * ((A - 1) - sg * (A + 1) * c); b2 = A * ((A + 1) - sg * (A - 1) * c - sq);
    a0 = (A + 1) + sg * (A - 1) * c + sq; a1 = -sg * 2 * ((A - 1) + sg * (A + 1) * c); a2 = (A + 1) + sg * (A - 1) * c - sq;
  } else throw new Error(`unknown filter ${type}`);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/** Filter a buffer in place (or into `out` when given). */
export function filt(x, type, f, q, db, out = x) {
  const [b0, b1, b2, a1, a2] = coefs(type, f, q, db);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; out[i] = y; }
  return out;
}
/** A per-sample biquad (for building small filter graphs). */
function biq(type, f, q, db) {
  const c = Float64Array.from(coefs(type, f, q, db)), z = new Float64Array(2);
  return v => { const y = c[0] * v + z[0]; z[0] = c[1] * v - c[3] * y + z[1]; z[1] = c[2] * v - c[4] * y; return y; };
}
/** Zavalishin TPT state-variable filter: stable under fast modulation. bp has 0 dB peak. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.a1 = 0; this.a2 = 0; this.a3 = 0; this.k = 1; this.lp = 0; this.bp = 0; this.hp = 0; }
  set(f, q) { const g = Math.tan((Math.PI * clamp(f, 10, SR * 0.45)) / SR); this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; return this; }
  tick(x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; this.lp = v2; this.bp = v1 * this.k; this.hp = x - this.k * v1 - v2; return v2;
  }
}
const svf = () => new SVF();
function dcBlock(x, fc = 18) {
  const R = 1 - (TAU * fc) / SR; let x1 = 0, y1 = 0;
  for (let i = 0; i < x.length; i++) { const y = x[i] - x1 + R * y1; x1 = x[i]; y1 = y; x[i] = y; }
  return x;
}
function fadeEdges(x, a = 0.002, b = 0.012) {
  const na = Math.min(x.length >> 1, nlen(a)), nb = Math.min(x.length >> 1, nlen(b));
  for (let i = 0; i < na; i++) x[i] *= Math.sin((Math.PI / 2) * (i / na)) ** 2;
  for (let i = 0; i < nb; i++) x[x.length - 1 - i] *= Math.sin((Math.PI / 2) * (i / nb)) ** 2;
  return x;
}
const peak = x => { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; };
const scale = (x, g) => { for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
function addAt(dst, src, at, g = 1) {
  const i0 = Math.round(at * SR);
  for (let i = Math.max(0, -i0); i < src.length && i0 + i < dst.length; i++) dst[i0 + i] += src[i] * g;
}

/** Poisson events with a time-varying rate (events / s). */
function scatter(r, t0, t1, rate, fn) {
  const dt = 0.0005;
  for (let t = t0; t < t1; t += dt) { const k = rate(t) * dt; if (k > 0 && r() < k) fn(t + r() * dt); }
}
/** A burst of band-passed noise (crackle, grit, leaf tick). Includes the filter's ring-out. */
function grain(x, t0, dur, fc, q, amp, r) {
  const n = nlen(dur), ring = Math.min(nlen(0.04), Math.round((5 * q * SR) / (Math.PI * fc))), i0 = Math.round(t0 * SR);
  const f = biq('bp', fc, q), g = amp * Math.sqrt(q);
  for (let i = 0; i < n + ring && i0 + i < x.length; i++) {
    const v = f(i < n ? (r() * 2 - 1) * hann((i + 0.5) / n) : 0);
    if (i0 + i >= 0) x[i0 + i] += v * g;
  }
}
/** Minnaert bubble (van den Doel): rising sine with exponential decay. xi sets the pitch rise. */
function bubble(x, t0, f0, amp, xi = 0.1, slow = 1) {
  const beta = (0.043 * f0 + 0.0014 * Math.pow(f0, 1.5)) / slow, sigma = xi * beta, dec = Math.exp(-beta / SR);
  const n = nlen(Math.min(1.5, 5.5 / beta)), i0 = Math.round(t0 * SR), att = 40;
  // phasor oscillator; the rotation is refreshed every 16 samples as the pitch rises
  let c = 1, s = 0, e = amp, cw = 1, sw = 0;
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    if ((i & 15) === 0) { const f = f0 * (1 + sigma * ((i + 8) / SR)); if (f > SR * 0.45) break; const w = (TAU * f) / SR; cw = Math.cos(w); sw = Math.sin(w); }
    const c2 = c * cw - s * sw; s = s * cw + c * sw; c = c2;
    if (i0 + i >= 0) x[i0 + i] += (i < att ? Math.sin((Math.PI / 2) * (i / att)) ** 2 : 1) * e * s;
    e *= dec;
  }
}
/** Catmull-Rom curve through evenly spaced points, u ∈ [0, 1]. */
function curve(pts) {
  const n = pts.length;
  if (n === 1) return () => pts[0];
  return u => {
    const p = clamp(u) * (n - 1), i = Math.min(n - 2, Math.floor(p)), t = p - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}
/**
 * A tonal note: frequency contour f (array of Hz or function u→Hz), amplitude contour a (array or fn),
 * smooth attack/release in s, harmonics h = [1, h2, h3…], vibrato [rate Hz, depth fraction], wob(t) → pitch multiplier.
 */
function note(x, { t, d, f, a = [1], amp = 1, att = 0.01, rel = 0.02, h = [1], vib = null, wob = null, ph = 0 }) {
  const n = nlen(d), i0 = Math.round(t * SR), fF = typeof f === 'function' ? f : curve(f), aF = typeof a === 'function' ? a : curve(a);
  const na = Math.max(8, nlen(att)), nr = Math.max(8, nlen(rel));
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    const u = i / n, tt = i / SR;
    let fr = fF(u);
    if (vib) fr *= 1 + vib[1] * Math.sin(TAU * vib[0] * tt);
    if (wob) fr *= wob(t + tt);
    ph += (TAU * fr) / SR;
    const e = (i < na ? Math.sin((Math.PI / 2) * (i / na)) ** 2 : 1) * (i > n - nr ? Math.sin((Math.PI / 2) * ((n - i) / nr)) ** 2 : 1);
    let s = 0;
    for (let k = 0; k < h.length; k++) if (h[k] && fr * (k + 1) < SR * 0.45) s += h[k] * Math.sin(ph * (k + 1));
    if (i0 + i >= 0) x[i0 + i] += amp * e * aF(u) * s;
  }
  return ph;
}
/** Sum of exponentially decaying sine partials (struck metal / wood) with a soft mallet onset. */
function partials(x, t0, list, onset = 0.0015) {
  const i0 = Math.round(t0 * SR), na = Math.max(4, nlen(onset));
  for (const [f, amp, dec, ph0 = 0] of list) {
    if (f >= SR * 0.45) continue;
    const n = nlen(Math.min(8, dec * 7)), w = (TAU * f) / SR, k = Math.exp(-1 / (dec * SR));
    let e = amp;
    for (let i = 0; i < n && i0 + i < x.length; i++) {
      const on = i < na ? Math.sin((Math.PI / 2) * (i / na)) ** 2 : 1;
      if (i0 + i >= 0) x[i0 + i] += e * on * Math.sin(w * i + ph0);
      e *= k;
    }
  }
}
/** Resonator bank fed by an excitation buffer: modes [[f, decay s, gain]]. Returns a new buffer. */
function resonate(ex, modes) {
  const y = new Float32Array(ex.length), tmp = new Float32Array(ex.length);
  for (const [f, dec, g] of modes) {
    if (f >= SR * 0.45) continue;
    filt(ex, 'bp', f, Math.max(0.5, Math.PI * f * dec), 0, tmp);
    for (let i = 0; i < y.length; i++) y[i] += tmp[i] * g;
  }
  return y;
}

/** Freeverb (Jezar), stereo in → stereo wet out. */
export function reverb(inL, inR, { room = 0.7, damp = 0.45, width = 1 } = {}) {
  const sc = SR / 44100, n = inL.length, spread = Math.round(23 * sc);
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const run = off => {
    const out = new Float32Array(n);
    const combs = combT.map(t => ({ b: new Float32Array(Math.round((t + off) * sc)), i: 0, s: 0 }));
    const aps = apT.map(t => ({ b: new Float32Array(Math.round((t + off) * sc)), i: 0 }));
    for (let j = 0; j < n; j++) {
      const inp = (inL[j] + inR[j]) * 0.015;
      let acc = 0;
      for (let c = 0; c < 8; c++) {
        const C = combs[c], o = C.b[C.i];
        C.s = o * d2 + C.s * d1; C.b[C.i] = inp + C.s * fb; if (++C.i >= C.b.length) C.i = 0; acc += o;
      }
      for (let a = 0; a < 4; a++) {
        const A = aps[a], bo = A.b[A.i], o = -acc + bo; A.b[A.i] = acc + bo * 0.5; if (++A.i >= A.b.length) A.i = 0; acc = o;
      }
      out[j] = acc;
    }
    return out;
  };
  const wl = run(0), wr = run(spread / sc), w1 = width / 2 + 0.5, w2 = (1 - width) / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let j = 0; j < n; j++) { L[j] = wl[j] * w1 + wr[j] * w2; R[j] = wr[j] * w1 + wl[j] * w2; }
  return { L, R };
}

// ───────────────────────────── loudness (ITU-R BS.1770-4) ─────────────────────────────

function kweight(x) {
  // 48 kHz coefficients from BS.1770: high shelf (+4 dB) then RLB high-pass.
  const y = new Float64Array(x.length);
  let z1 = 0, z2 = 0, w1 = 0, w2 = 0;
  const [b0, b1, b2, a1, a2] = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
  const [c1, c2] = [-1.99004745483398, 0.99007225036621];
  for (let i = 0; i < x.length; i++) {
    const v = x[i], s = b0 * v + z1; z1 = b1 * v - a1 * s + z2; z2 = b2 * v - a2 * s;
    const h = s + w1; w1 = -2 * s - c1 * h + w2; w2 = s - c2 * h; y[i] = h;
  }
  return y;
}
/** Cumulative sum of K-weighted power across channels (for windowed loudness). */
function powerCum(chs) {
  const n = chs[0].length, cum = new Float64Array(n + 1);
  const k = chs.map(kweight);
  for (let i = 0; i < n; i++) { let p = 0; for (const c of k) p += c[i] * c[i]; cum[i + 1] = cum[i] + p; }
  return cum;
}
const lufsOf = p => (p > 0 ? -0.691 + 10 * Math.log10(p) : -Infinity);
/** Integrated loudness in LUFS of an array of channels (mono: [x]; stereo: [L, R]). Gated as in BS.1770-4. */
export function loudness(chs) {
  if (!Array.isArray(chs)) chs = chs.L ? [chs.L, chs.R] : [chs];
  const n = chs[0].length, cum = powerCum(chs), B = Math.round(0.4 * SR), H = Math.round(0.1 * SR), ps = [];
  if (n < B) ps.push((cum[n] - cum[0]) / Math.max(1, n));
  else for (let s = 0; s + B <= n; s += H) ps.push((cum[s + B] - cum[s]) / B);
  const g1 = ps.filter(p => lufsOf(p) > -70);
  if (!g1.length) return -Infinity;
  const rel = lufsOf(g1.reduce((a, b) => a + b, 0) / g1.length) - 10, g2 = g1.filter(p => lufsOf(p) > rel);
  return lufsOf(g2.reduce((a, b) => a + b, 0) / g2.length);
}
/** Loudest short window (default 200 ms) in LUFS — how loud a short effect feels at its peak. */
export function peakLoudness(x, win = 0.2) {
  const chs = Array.isArray(x) ? x : x.L ? [x.L, x.R] : [x];
  const n = chs[0].length, cum = powerCum(chs), B = Math.min(n, Math.round(win * SR)), H = Math.round(0.005 * SR);
  let best = 0;
  for (let s = 0; s + B <= n; s += H) best = Math.max(best, (cum[s + B] - cum[s]) / B);
  return lufsOf(best);
}
/** Estimated true peak (4× oversampled, windowed-sinc) of channels, linear. */
export function truePeak(chs) {
  if (!Array.isArray(chs)) chs = chs.L ? [chs.L, chs.R] : [chs];
  const T = 12, K = [0.25, 0.5, 0.75].map(fr => {
    const k = [];
    for (let j = -T + 1; j <= T; j++) { const d = j - fr, s = Math.sin(Math.PI * d) / (Math.PI * d), w = 0.5 + 0.5 * Math.cos((Math.PI * d) / T); k.push(s * w); }
    return k;
  });
  let best = 0;
  for (const x of chs) {
    const sp = peak(x), th = sp * 0.6;
    best = Math.max(best, sp);
    for (let i = T; i < x.length - T; i++) {
      if (Math.abs(x[i]) < th && Math.abs(x[i + 1]) < th) continue;
      for (const k of K) { let acc = 0; for (let j = 0; j < k.length; j++) acc += k[j] * x[i - T + 1 + j]; best = Math.max(best, Math.abs(acc)); }
    }
  }
  return best;
}

// ───────────────────────────── ground contacts ─────────────────────────────

/** Crackle shower: band-passed noise grains with a power-law loudness (a few loud snaps, many faint). */
function crackles(x, r, rate, amp, { f = [1200, 6000], q = [1.5, 4], d = [0.0005, 0.003], pw = 3, t0 = 0, t1 = x.length / SR - 0.03 } = {}) {
  scatter(r, t0, t1, rate, t => grain(x, t, between(r, d[0], d[1]), expRand(r, f[0], f[1]), between(r, q[0], q[1]), amp(t) * (0.08 + 0.92 * r() ** pw), r));
}
/**
 * One footfall: a heel strike that rolls onto the ball of the foot (or paw). P(t) is the rolling pressure
 * (drives crunch and grit), K(t) the impact (drives thumps and resonances). w = weight 0..1 (mouse → badger).
 */
function footfall(r, w, lag = 0) {
  const th = lag + 0.004 + r() * 0.004, tb = th + (0.06 + 0.07 * w) * between(r, 0.8, 1.2), ab = between(r, 0.45, 0.85);
  const dh = 0.03 + 0.03 * w, db = 0.045 + 0.04 * w;
  return {
    P: t => strike(t - th, 0.006, dh) + ab * strike(t - tb + 0.02, 0.025, db),
    K: t => strike(t - th, 0.003, 0.012 + 0.01 * w) + ab * 0.4 * strike(t - tb, 0.006, 0.015),
    end: tb + db * 5,
  };
}
const SURFACE = {
  grass(x, r, P, K, w) { // a soft low pad thump, then the crunch of blades bending and snapping
    const nz = white(r), lo = svf().set(90 + 90 * (1 - w), 0.7), sw = svf().set(2600, 0.8);
    for (let i = 0; i < x.length; i++) { const t = i / SR, n = nz(); lo.tick(n); sw.tick(n); x[i] += K(t) * lo.lp * (0.3 + w) * 2.5 + P(t) ** 2 * sw.bp * 0.05; }
    crackles(x, r, t => 420 * P(t), t => Math.sqrt(P(t)), { f: [1000, 6500], q: [1.2, 3], d: [0.0006, 0.004], pw: 2.5 });
    filt(x, 'lp', 9000, 0.7);
  },
  dirt(x, r, P, K, w) { // packed earth: a duller thump and gritty little crunches
    const nz = white(r), lo = svf().set(120 + 80 * (1 - w), 0.8), sc = svf().set(800, 0.8);
    for (let i = 0; i < x.length; i++) { const t = i / SR, n = nz(); lo.tick(n); sc.tick(n); x[i] += K(t) * lo.lp * (0.5 + w) * 3 + P(t) ** 2 * sc.bp * 0.06; }
    crackles(x, r, t => 650 * P(t), t => Math.sqrt(P(t)), { f: [600, 3800], q: [1, 2.5], d: [0.0003, 0.0018], pw: 3 });
    filt(x, 'lp', 7000, 0.7);
  },
  wood(x, r, P, K, w) { // boards: the impact rings a few plank modes and a hollow cavity under them
    const nz = white(r), ex = new Float32Array(x.length), lp = svf().set(900 + 900 * (1 - w), 0.7), sc = svf().set(1500, 0.9);
    for (let i = 0; i < x.length; i++) { lp.tick(nz()); ex[i] = lp.lp * K(i / SR); }
    const f0 = (105 + 40 * r()) * (1.25 - 0.4 * w), d = between(r, 0.8, 1.2);
    const plank = resonate(ex, [
      [f0, 0.075 * d, 1], [f0 * 2.31, 0.06 * d, 0.85], [f0 * 3.93, 0.045 * d, 0.65], [f0 * 5.4, 0.033 * d, 0.45],
      [f0 * 7.2, 0.024 * d, 0.3], [f0 * 9.6, 0.017 * d, 0.2], [190 + 30 * r(), 0.03, 0.9],
    ]);
    for (let i = 0; i < x.length; i++) { sc.tick(nz()); x[i] += plank[i] * 2.2 + ex[i] * 0.25 + sc.bp * P(i / SR) ** 2 * 0.03; }
  },
  stone(x, r, P, K, w) { // a hard, short tock and a little grit scraping under the pad
    const nz = white(r), tap = svf().set(1000 + 700 * (1 - w), 1.2), lo = svf().set(130, 0.7), sc = svf().set(3200, 0.9);
    for (let i = 0; i < x.length; i++) { const t = i / SR, n = nz(); tap.tick(n); lo.tick(n); sc.tick(n); x[i] += K(t) * (tap.bp * 0.6 + lo.lp * 2 * (0.3 + w)) + sc.bp * P(t) ** 2 * 0.04; }
    const fk = between(r, 2500, 4000);
    partials(x, 0.006, [[fk, 0.04, 0.008], [fk * 1.53, 0.02, 0.005]], 0.0012);
    crackles(x, r, t => 220 * P(t), t => 0.5 * Math.sqrt(P(t)), { f: [2500, 8000], q: [1.5, 3], d: [0.0002, 0.0008], pw: 3 });
  },
};
function footstep(kind) {
  return (r, p) => {
    const w = clamp(p.weight ?? 0.5), f = footfall(r, w), x = buf(f.end + 0.05);
    SURFACE[kind](x, r, f.P, f.K, w);
    return x;
  };
}
/** Low body thump with a gently falling pitch (landings, heavy things). */
function thump(x, t0, f1, f0, fall, dec, amp) {
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < x.length - i0; i++) {
    const t = i / SR, e = strike(t, 0.005, dec);
    if (t > 0.01 && e < 1e-4) break;
    ph += (TAU * (f0 + (f1 - f0) * Math.exp(-t / fall))) / SR;
    x[i0 + i] += amp * e * Math.sin(ph);
  }
}

// ───────────────────────────── motion and air ─────────────────────────────

function whoosh(r, p) { // air pushed past: a wide band of noise sweeping up and back down (Doppler-ish), no low growl
  const dur = p.dur ?? between(r, 0.5, 0.8), x = buf(dur + 0.1), nz = pink(r), bp = svf(), turb = wander(Math.floor(r() * 1e6), 6);
  const lo0 = (p.pitch ?? 1) * between(r, 380, 520), hi = lo0 * between(r, 3.5, 5), pk = between(r, 0.4, 0.55);
  let tb = 1;
  for (let i = 0; i < x.length; i++) {
    const u = i / (dur * SR), sh = u < pk ? Math.sin((Math.PI / 2) * (u / pk)) ** 2 : u < 1 ? Math.cos((Math.PI / 2) * ((u - pk) / (1 - pk))) ** 1.5 : 0;
    if (i % 16 === 0) { bp.set(lo0 * Math.pow(hi / lo0, sh), 0.6); tb = 0.85 + 0.3 * turb(i / SR); }
    bp.tick(nz());
    x[i] = bp.bp * sh * tb;
  }
  filt(x, 'hp', 250, 0.6);
  return filt(x, 'lp', 6000, 0.6);
}
function wingFlap(r, p) { // each downstroke pushes a round "whup" of air; feathers whisper at its peak
  const n = p.flaps ?? 2 + Math.floor(r() * 3), per = between(r, 0.17, 0.24) * (p.size ?? 1), x = buf(n * per + 0.3), nz = pink(r), bp = svf(), fe = svf().set(4000, 0.8);
  const E = t => { const k = Math.floor(t / per), u = t / per - k; return k < n ? hann(Math.min(1, u / 0.85)) ** 0.8 * (1 - (0.3 * k) / n) : 0; };
  for (let i = 0; i < x.length; i++) {
    const e = E(i / SR);
    if (i % 16 === 0) bp.set(380 + 900 * e, 0.55);
    const v = nz(); bp.tick(v); fe.tick(v);
    x[i] = bp.bp * e + fe.bp * e ** 4 * 0.06;
  }
  filt(x, 'hp', 200, 0.6);
  return filt(x, 'lp', 5000, 0.6);
}
function hop(r, p) { // the push-off: a light brush of the ground and a breath of air
  const w = clamp(p.weight ?? 0.4), x = buf(0.45), f = footfall(r, w * 0.6);
  SURFACE[p.surface ?? 'grass'](x, r, t => f.P(t) * 0.6, t => f.K(t) * 0.4, w * 0.6);
  addAt(x, filt(whoosh(r, { dur: 0.25, pitch: 0.9 }), 'lp', 2500, 0.7), 0.03, 0.9);
  const tone = p.tone ?? 0.12; // a whisper of a cartoon "bwip" under the air (0 to remove)
  if (tone > 0) {
    const f0 = between(r, 260, 320) / (0.6 + w);
    note(x, { t: 0.025, d: 0.14, f: u => f0 * Math.pow(2.1, Math.pow(u, 0.7)), att: 0.012, rel: 0.09, amp: tone * 0.35, h: [1, 0.12] });
  }
  return x;
}
function land(r, p) { // arriving from a jump: a soft body whump and the ground cover crushed and rustling
  const w = clamp(p.weight ?? 0.6), x = buf(0.8), nz = white(r), lo = svf().set(140 + 80 * (1 - w), 0.8), surf = p.surface ?? 'grass';
  const sw = svf().set(1800, 0.6), Ts = between(r, 0.08, 0.14);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, n = nz(); lo.tick(n); sw.tick(nz());
    x[i] += lo.lp * strike(t - 0.004, 0.012, 0.05 + 0.05 * w) * (1.5 + 2.5 * w) + (surf === 'grass' ? sw.bp * strike(t - 0.006, 0.02, Ts) * 0.08 : 0);
  }
  thump(x, 0.006, 80, 55, 0.025, 0.04 + 0.05 * w, 0.04 + 0.07 * w);
  if (surf === 'grass') crackles(x, r, t => 700 * strike(t - 0.005, 0.015, Ts), t => 0.25 * strike(t - 0.005, 0.015, Ts), { f: [900, 4500], q: [0.7, 1.6], d: [0.0008, 0.004], pw: 1.2 });
  else if (surf === 'dirt') crackles(x, r, t => 700 * strike(t, 0.006, 0.05), () => 0.5, { f: [600, 3500], q: [1, 2.2], d: [0.0004, 0.002], pw: 3 });
  else { const f = footfall(r, w); SURFACE[surf](x, r, f.P, t => f.K(t) * 1.6, w); }
  return filt(x, 'lp', 8000, 0.7);
}
function thud(r, p) { // something heavy meets soft ground: a dull, darkening body of noise and a little crunch
  const w = clamp(p.weight ?? 0.7), x = buf(0.7), nz = white(r), lo = svf(), knock = svf().set(between(r, 180, 320), 1.4);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, n = nz();
    if (i % 16 === 0) lo.set(110 + 400 * Math.exp(-t / 0.02), 0.9);
    lo.tick(n); knock.tick(n);
    x[i] += lo.lp * strike(t, 0.004, 0.06 + 0.04 * w) * 3 + knock.bp * strike(t, 0.002, 0.03) * 0.35;
  }
  thump(x, 0.003, 85, 55, 0.04, 0.08 + 0.06 * w, 0.12);
  crackles(x, r, t => 300 * strike(t, 0.003, 0.04), () => 0.4, { f: [600, 3000], q: [1, 2], d: [0.0004, 0.002] });
  return x;
}
function rustle(r, p) { // leaves and twigs moving: papery ticks following a few pushes of motion
  const dur = p.dur ?? between(r, 0.7, 1.1), x = buf(dur + 0.08), k = 2 + Math.floor(r() * 3), bumps = [];
  for (let i = 0; i < k; i++) bumps.push(p.soft ? [between(r, 0, 0.3) * dur, between(r, 0.15, 0.4) * dur, between(r, 0.5, 1)] : [between(r, 0.1, 0.8) * dur, between(r, 0.08, 0.25) * dur, between(r, 0.5, 1)]);
  const M = t => Math.min(1.2, bumps.reduce((s, [c, wd, a]) => s + a * Math.exp(-(((t - c) / wd) ** 2)), 0)) * ramp(t, 0, 0.03) * (1 - ramp(t, dur - 0.05, dur));
  const nz = white(r), sw = svf().set(3200, 0.6), sw2 = svf().set(900, 0.8);
  for (let i = 0; i < x.length; i++) { const t = i / SR, n = nz(); sw.tick(n); sw2.tick(n); x[i] += M(t) * (sw.bp * 0.15 + sw2.bp * 0.07); }
  crackles(x, r, t => 2600 * M(t), M, { f: [1800, 8000], q: [0.7, 2], d: [0.0005, 0.003], pw: 1.2, t1: dur });
  crackles(x, r, t => 9 * M(t), t => 0.25 * M(t), { f: [500, 1400], q: [3, 6], d: [0.0008, 0.0023], pw: 0, t1: dur });
  return x;
}
function pop(r, p) { // a cork or cheek pop: a puff of air ringing a low, rising, hollow resonance
  const x = buf(0.22), k = p.pitch ?? 1, nz = white(r), res = svf(), air = svf().set(2500, 0.7), f0 = k * between(r, 300, 420);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if (i % 8 === 0) res.set(f0 * (1 + 0.9 * (1 - Math.exp(-t / 0.015))), 9);
    const n = nz(), ex = n * strike(t, 0.002, 0.006); res.tick(ex); air.tick(n);
    x[i] = res.bp * 3 + air.bp * strike(t, 0.002, 0.008) * 0.06;
  }
  return x;
}

// ───────────────────────────── water ─────────────────────────────

/**
 * Splash: water thrown up and falling back is a dense shower of tiny droplet ticks under a soft swell (no hard slap —
 * a sharp onset reads as a snapping branch), a low whump of displaced water, a quiet fast-rising "plunk",
 * a few bubbles and the last drips. Big, slowly rising bubbles are avoided: they read as squeaks.
 */
function splash(r, p) {
  const size = clamp(p.size ?? 0.6), x = buf(1.4 + 0.6 * size), nz = white(r), lo = svf().set(240, 0.8), sw = svf().set(2200, 0.6), sw2 = svf().set(800, 0.8);
  const Tw = 0.16 + 0.22 * size, E = t => ramp(t, 0, 0.03) * Math.exp(-Math.max(0, t - 0.03) / Tw);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, n = nz(); lo.tick(n); sw.tick(n); sw2.tick(n);
    x[i] += lo.lp * strike(t, 0.008, 0.06 + 0.05 * size) * (1 + size) + E(t) * (sw.bp * 0.1 + sw2.bp * 0.06);
  }
  crackles(x, r, t => 4200 * E(t), E, { f: [900, 7000], q: [0.8, 2.5], d: [0.0004, 0.003], pw: 2, t1: 1.2 });
  bubble(x, 0.03 + 0.02 * r(), between(r, 300, 460) / (0.7 + 0.6 * size), 0.1 + 0.08 * size, between(r, 0.9, 1.3), 1.4);
  for (let i = 0, nb = Math.round(20 + 30 * size); i < nb; i++) {
    const t = between(r, 0.04, 0.5 + 0.3 * size), f0 = expRand(r, 700, 2600);
    bubble(x, t, f0, (0.04 + 0.12 * r() ** 2) * Math.exp(-t * 2), between(r, 0.15, 0.5));
  }
  for (let i = 0, nd = Math.round(8 + 12 * size); i < nd; i++) {
    const t = between(r, 0.35, 1.0 + 0.4 * size);
    grain(x, t, 0.0008, between(r, 2500, 5000), 1, 0.05 * r(), r);
    bubble(x, t + 0.002, expRand(r, 1500, 3500), 0.04 * r(), between(r, 0.2, 0.5));
  }
  return filt(x, 'lp', 9000, 0.7);
}
function plop(r, p) {
  const x = buf(0.45), f0 = (p.pitch ?? 1) * between(r, 280, 460);
  grain(x, 0.0, 0.002, 1400, 0.8, 0.08, r);
  bubble(x, 0.003, f0, 0.8, between(r, 0.8, 1.3), 1.6);
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) bubble(x, between(r, 0.04, 0.16), expRand(r, 900, 2200), 0.12, 0.3);
  return x;
}
/** Running water into one channel: a soft wash under a babble of Minnaert bubbles and the odd glug. */
function waterInto(x, r, { busy = 1, seed = 1 } = {}) {
  const nz = pink(r), lo = svf(), bp = svf(), g1 = wander(seed, 4), g2 = wander(seed + 3, 0.12), T = x.length / SR;
  let amp = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) { const t = i / SR; lo.set(350 + 250 * g1(t), 0.7); bp.set(1000 + 800 * g1(t + 5), 0.7); amp = (0.7 + 0.6 * g1(t * 1.9)) * (0.8 + 0.4 * g2(t)); }
    const n = nz(); lo.tick(n); bp.tick(n);
    x[i] += (lo.lp * 0.35 + bp.bp * 0.08) * amp;
  }
  scatter(r, 0, T, t => 220 * busy * (0.6 + 0.8 * g2(t)), t => {
    const f0 = expRand(r, 300, 2200);
    bubble(x, t, f0, (0.015 + 0.07 * r() ** 2.5) * Math.pow(700 / f0, 0.5), between(r, 0.05, 0.35));
  });
  scatter(r, 0, T, () => 3 * busy, t => bubble(x, t, expRand(r, 150, 330), 0.06 + 0.06 * r(), between(r, 0.4, 0.8), 1.5));
}
function stream(r, p) { const x = buf(p.dur ?? 4); waterInto(x, r, { busy: p.busy ?? 1, seed: Math.floor(r() * 1e6) }); return x; }

// ───────────────────────────── wind, fire ─────────────────────────────

/**
 * Wind into one channel. gust(t) in 0..1 is shared between channels so gusts move as one.
 * Moving air is a soft broad body plus two narrow resonances that moan and glide with each gust;
 * what we hear outdoors is mostly what the wind moves, so foliage is a shower of leaf ticks whose density follows the gust.
 */
function windInto(x, r, gust, { strength = 0.5, leafy = 0.3, whistle = 0.2, seed = 1 } = {}) {
  const nz = pink(r), bz = brown(r), lo = svf(), body = svf(), h1 = svf(), h2 = svf(), wh = svf(), sh = svf(), d1 = wander(seed + 5, 0.09), d2 = wander(seed + 11, 0.07), T = x.length / SR;
  const q1 = 4 + 14 * strength, q2 = 5 + 18 * strength, howl = clamp((strength - 0.1) / 0.5) ** 1.5; // a breeze doesn't moan
  let g = 0, s = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) {
      const t = i / SR; g = clamp(gust(t)); s = strength * (0.15 + 0.85 * g);
      lo.set(90 + 120 * s, 0.6); body.set(300 + 500 * g, 0.7); sh.set(3500 + 2500 * g, 0.6);
      h1.set((190 + 520 * g) * (0.75 + 0.5 * d1(t)), q1); h2.set((420 + 900 * g) * (0.75 + 0.5 * d2(t)), q2);
      wh.set((900 + 900 * d1(t * 1.3)) * (0.85 + 0.35 * g), 30);
    }
    const n = nz(); lo.tick(bz()); body.tick(n); h1.tick(n); h2.tick(n); wh.tick(n); sh.tick(n);
    x[i] += lo.lp * s * 0.08 + body.bp * s * 0.12 + (h1.bp * 6 + h2.bp * 3.5) * s * s * howl + wh.bp * whistle * Math.max(0, g - 0.5) ** 2 * 10 + sh.bp * leafy * g * g * 0.006;
  }
  if (leafy > 0) crackles(x, r, t => leafy * 900 * clamp(gust(t)) ** 2.5, t => leafy * (0.2 + 0.8 * clamp(gust(t))) * 0.25, { f: [1400, 7000], q: [0.8, 2.2], d: [0.0003, 0.002], pw: 2.5, t1: T - 0.01 });
}
function wind(r, p) {
  const x = buf(p.dur ?? 4), seed = Math.floor(r() * 1e6), g1 = wander(seed, 0.18), g2 = wander(seed + 1, 1.3);
  windInto(x, r, t => 0.4 + (g1(t) - 0.5) * 1.1 + (g2(t) - 0.5) * 0.45, { strength: p.strength ?? 0.6, leafy: p.leafy ?? 0, whistle: p.whistle ?? 0.35, seed });
  return filt(x, 'lp', 8000, 0.6);
}
function fire(r, p) { // a soft breathy roar and hiss under clusters of sharp crackles and the odd pop
  const x = buf(p.dur ?? 4), T = x.length / SR, nz = white(r), bz = brown(r), lo = svf().set(160, 0.6), hs = svf().set(3500, 0.5);
  const slow = wander(Math.floor(r() * 1e6), 0.4), slow2 = wander(Math.floor(r() * 1e6), 1.1);
  let a1 = 0, a2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) { const t = i / SR; a1 = (0.5 + 0.5 * slow(t)) * 0.12; a2 = 0.012 * (0.6 + 0.8 * slow2(t)); }
    const n = nz(); lo.tick(bz()); hs.tick(n);
    x[i] += lo.lp * a1 + hs.bp * a2;
  }
  scatter(r, 0, T - 0.05, t => 14 * (0.4 + slow(t * 1.7)), t => {
    for (let k = 0, n = 1 + Math.floor(r() ** 2 * 9); k < n; k++)
      grain(x, t + k * between(r, 0.003, 0.03), between(r, 0.0002, 0.0009), expRand(r, 1500, 7000), between(r, 0.7, 1.6), 0.12 + 0.4 * r() ** 2.5, r);
  });
  scatter(r, 0, T - 0.1, () => 0.6, t => { grain(x, t, 0.0025, between(r, 700, 1400), 3, 0.7, r); grain(x, t + 0.002, 0.0006, 4000, 1, 0.4, r); });
  return filt(x, 'lp', 9500, 0.7);
}

// ───────────────────────────── wood and metal ─────────────────────────────

/** Stick-slip hinge friction: an irregular pulse train whose rate follows the door's speed, ringing many narrow wood modes. */
function doorCreak(r, p) {
  const dur = p.dur ?? between(r, 1.0, 1.6), x = buf(dur + 0.4), ex = new Float32Array(x.length), walk = wander(Math.floor(r() * 1e6), 3);
  const base = between(r, 18, 30), top = between(r, 140, 260), pk = between(r, 0.3, 0.6);
  const V = u => (u <= 0 || u >= 1 ? 0 : u < pk ? Math.sin((Math.PI / 2) * (u / pk)) : Math.cos((Math.PI / 2) * ((u - pk) / (1 - pk))));
  for (let t = 0.01; t < dur;) {
    const v = V(t / dur);
    if (v > 0.03) {
      const i = Math.round(t * SR), a = Math.sqrt(v) * between(r, 0.6, 1.4);
      for (let j = -3; j <= 3; j++) if (i + j >= 0 && i + j < ex.length) ex[i + j] += a * hann((j + 4) / 8);
    }
    t += (1 / (base + (top - base) * Math.pow(v, 1.3) * (0.6 + 0.8 * walk(t)))) * (1 + (r() - 0.5) * 0.15);
  }
  const modes = [[between(r, 180, 260), 0.025, 0.5]];
  for (let k = 0; k < 16; k++) { const f = expRand(r, 380, 4200), Q = between(r, 15, 50); modes.push([f, Q / (Math.PI * f), between(r, 0.3, 1) * (f < 1500 ? 1 : 0.6)]); }
  const y = resonate(ex, modes);
  for (let i = 0; i < x.length; i++) x[i] = y[i];
  if (p.close) addAt(x, knocks(r, { count: 1 }), dur, 0.5);
  return x;
}
/** Knuckles on a door (or, far away and slower, someone hammering): a hollow panel ringing under a hard tap. */
function knocks(r, p) {
  const n = p.count ?? 2 + Math.floor(r() * 3), per = p.per ?? between(r, 0.17, 0.26), x = buf(n * per + 0.35), ex = new Float32Array(x.length), nz = white(r), lp = svf().set(3000, 0.7);
  const hits = Array.from({ length: n }, (_, k) => [k * per * between(r, 0.94, 1.06) + 0.003, (k === n - 1 ? 0.85 : 1) * between(r, 0.85, 1.1)]);
  for (let i = 0; i < x.length; i++) { const t = i / SR; let e = 0; for (const [t0, a] of hits) e += a * strike(t - t0, 0.0005, 0.0015); lp.tick(nz()); ex[i] = lp.lp * e; }
  const f1 = between(r, 140, 200);
  const y = resonate(ex, [[f1, 0.04, 1], [f1 * 2.1, 0.03, 0.8], [between(r, 480, 560), 0.02, 0.7], [between(r, 850, 950), 0.015, 0.5], [between(r, 1400, 1600), 0.01, 0.35], [between(r, 2400, 2800), 0.006, 0.25]]);
  for (let i = 0; i < x.length; i++) x[i] = y[i] * 3 + ex[i] * 0.4;
  return x;
}
/** A smith at work: hammer strikes on an anvil, bright ringing partials with a short clank, in a working rhythm. */
function anvil(r, p) {
  const n = p.count ?? 3 + Math.floor(r() * 4), per = p.per ?? between(r, 0.45, 0.65), f = between(r, 900, 1300), x = buf(n * per + 1.6);
  for (let k = 0; k < n; k++) {
    const t = k * per * between(r, 0.97, 1.03) + 0.003, a = (k % 3 === 2 ? 0.6 : 1) * between(r, 0.85, 1);
    partials(x, t, [[f, a, 0.7], [f * 2.31, a * 0.6, 0.35], [f * 3.87, a * 0.4, 0.2], [f * 5.1, a * 0.25, 0.1], [f * 1.003 + 1.1, a * 0.4, 0.6]], 0.0003);
    grain(x, t, 0.003, 3000, 0.9, 0.4 * a, r);
  }
  return x;
}
/** Church/hand bell: minor-third bell partials; the upper ones flare at the strike and die fast, the hum lingers. */
function bellSound(r, p) {
  const f0 = p.f0 ?? (p.pitch ?? 1) * between(r, 470, 560), count = p.count ?? 1, gap = p.gap ?? 1.8, size = p.size ?? 1;
  const P = [[0.5, 0.45, 3.2], [1, 0.6, 2.4], [1.183, 0.5, 1.8], [1.506, 0.28, 1.2], [2, 0.75, 1.4], [2.514, 0.35, 0.7], [2.662, 0.3, 0.6], [3.011, 0.25, 0.45], [4.166, 0.18, 0.25], [5.433, 0.12, 0.15], [6.796, 0.09, 0.1], [8.2, 0.06, 0.06]];
  const x = buf((count - 1) * gap + 3.5 * size + 0.5);
  for (let c = 0; c < count; c++) {
    const t0 = c * gap + 0.003, a = c ? between(r, 0.85, 1) : 1, list = [];
    for (const [rt, amp, dec] of P) {
      const f = f0 * rt * (1 + (r() - 0.5) * 0.002);
      list.push([f, amp * a, dec * size, r() * TAU], [f + between(r, 0.2, 0.8), amp * a * 0.3, dec * size * 0.9, r() * TAU]);
    }
    partials(x, t0, list, 0.0003);
    grain(x, t0, 0.004, 4000, 0.8, 0.3 * a, r); grain(x, t0, 0.002, 2000, 1, 0.2 * a, r);
  }
  return x;
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
/** Struck chime tubes: a little pentatonic run with a metallic strike and shimmering, inharmonic partials. */
function chime(r, p) {
  const pent = [0, 2, 4, 7, 9], n = p.notes ?? 3 + Math.floor(r() * 2), base = p.base ?? 79 + Math.floor(r() * 5), up = p.down ? -1 : 1, x = buf(n * 0.26 + 3.2);
  let deg = Math.floor(r() * 4), t = 0.003;
  for (let i = 0; i < n; i++) {
    const d = ((deg % 5) + 5) % 5, f = mtof(base + Math.floor(deg / 5) * 12 + pent[d]), a = between(r, 0.7, 1);
    partials(x, t, [[f, a, 2.2, r() * TAU], [f * 1.0007 + 0.6, a * 0.35, 2, r() * TAU], [f * 2.756, a * 0.55, 0.9], [f * 5.404, a * 0.3, 0.35], [f * 8.933, a * 0.12, 0.15]], 0.0004);
    grain(x, t, 0.0015, 6000, 0.8, 0.08 * a, r);
    t += between(r, 0.15, 0.26); deg += up * (1 + (r() < 0.35 ? 1 : 0));
  }
  const wet = reverb(x, x, { room: 0.55, damp: 0.4 });
  for (let i = 0; i < x.length; i++) x[i] += (wet.L[i] + wet.R[i]) * 0.25;
  return x;
}
/** Magic twinkle: a quick, slightly uneven rising run of celesta-like pings on a bright chord, an airy shimmer, reverb. */
function sparkle(r, p) {
  const n = p.count ?? 9 + Math.floor(r() * 6), x = buf(n * 0.07 + 1.6), nz = white(r), hs = svf().set(9000, 0.7), pent = [0, 2, 4, 7, 9];
  let deg = Math.floor(r() * 5), t = 0.003, span = 0;
  for (let i = 0; i < n; i++) {
    const m = 81 + Math.floor(deg / 5) * 12 + pent[deg % 5], f = mtof(m) * (1 + (r() - 0.5) * 0.003), a = between(r, 0.55, 1) * (1 - (0.4 * i) / n);
    partials(x, t, [[f, a, between(r, 0.35, 0.6), r() * TAU], [f * 1.0006 + 0.7, a * 0.3, 0.5], [f * 2.756, a * 0.3, 0.12], [f * 5.404, a * 0.1, 0.04]], 0.0005);
    grain(x, t, 0.0008, 7000, 0.8, 0.05 * a, r);
    span = t; t += between(r, 0.035, 0.075); deg += 1 + (r() < 0.25 ? 1 : 0);
  }
  for (let i = 0; i < x.length; i++) { hs.tick(nz()); x[i] += hs.bp * 0.012 * hann(i / SR / (span + 0.6)); }
  const wet = reverb(x, x, { room: 0.7, damp: 0.35 });
  for (let i = 0; i < x.length; i++) x[i] += (wet.L[i] + wet.R[i]) * 0.5;
  return x;
}

// ───────────────────────────── creatures ─────────────────────────────

/** Render a list of tonal notes into a fresh buffer sized to fit. */
function sing(notes, extra = 0.05) {
  const end = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0), x = buf(end + extra);
  for (const n of notes) note(x, n);
  return x;
}
/** Bird species: each returns notes in Hz (scaled by the individual's pitch k). */
const BIRDS = {
  sparrow(r, k) { // cheerful chirrups
    const out = []; let t = 0;
    for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) {
      const d = between(r, 0.05, 0.085), top = k * between(r, 5000, 6200), lo = k * between(r, 2900, 3500);
      out.push({ t, d, f: [lo * 1.15, top, top * 0.9, lo], h: [1, 0.3, 0.08], att: 0.005, rel: 0.012, amp: between(r, 0.7, 1) });
      t += d + between(r, 0.1, 0.22);
    }
    return out;
  },
  tit(r, k) { // great tit "tea-cher tea-cher"
    const out = [], hi = k * between(r, 6000, 6800), lo = k * between(r, 4000, 4600), reps = 3 + Math.floor(r() * 3), per = between(r, 0.28, 0.34);
    for (let i = 0; i < reps; i++) {
      const t = i * per;
      out.push({ t, d: 0.085, f: [hi * 1.02, hi, hi * 0.95], h: [1, 0.06], att: 0.008, rel: 0.02, amp: 0.85 });
      out.push({ t: t + 0.115, d: 0.1, f: [lo * 1.06, lo, lo * 0.96], h: [1, 0.08], att: 0.008, rel: 0.025, amp: 1 });
    }
    return out;
  },
  chaffinch(r, k) { // descending trill phrases ending in a flourish
    const out = []; let t = 0;
    for (let i = 0, n = 5 + Math.floor(r() * 3); i < n; i++) { const f = k * (5600 - i * 60); out.push({ t, d: 0.035, f: [f, f * 0.74], h: [1, 0.1], att: 0.004, rel: 0.01, amp: 0.6 + i * 0.05 }); t += 0.068; }
    for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) { const f = k * (4300 - i * 90); out.push({ t, d: 0.045, f: [f, f * 0.72], h: [1, 0.1], att: 0.005, rel: 0.012, amp: 0.9 }); t += 0.088; }
    out.push({ t: t + 0.02, d: 0.22, f: [3000 * k, 4900 * k, 5600 * k, 3500 * k, 2600 * k], h: [1, 0.12], att: 0.01, rel: 0.03, amp: 1 });
    return out;
  },
  robin(r, k) { // wistful, varied warble with thin high notes and a little trill
    const out = []; let t = 0, fc = k * between(r, 3500, 5200);
    for (let i = 0, n = 7 + Math.floor(r() * 6); i < n; i++) {
      fc = clamp(fc * Math.pow(2, (r() - 0.5) * 1.2), 2600 * k, 6400 * k);
      if (r() < 0.12) { // mini trill
        for (let j = 0; j < 3 + Math.floor(r() * 3); j++) { out.push({ t, d: 0.035, f: [fc * 0.92, fc * 1.12, fc * 0.95], h: [1, 0.05], att: 0.005, rel: 0.01, amp: 0.6 }); t += 0.055; }
        t += 0.03; continue;
      }
      const d = between(r, 0.05, 0.16), sh = Math.floor(r() * 4);
      const f = [[fc * 0.85, fc * 1.15], [fc * 1.2, fc * 0.85], [fc * 0.9, fc * 1.22, fc * 0.86], [fc, fc * 1.01, fc]][sh];
      out.push({ t, d, f, h: [1, 0.05], att: 0.008, rel: 0.02, amp: between(r, 0.5, 1), vib: sh === 3 ? [between(r, 30, 60), 0.03] : null });
      t += d + between(r, 0.02, 0.07);
    }
    return out;
  },
  blackbird(r, k) { // a slow, mellow, fluted melody with slurs, then a quiet high twitter
    const out = []; let t = 0, fc = k * between(r, 1900, 2500);
    for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++) {
      fc = clamp(fc * Math.pow(2, (r() - 0.5) * 0.6), 1600 * k, 3000 * k);
      const d = between(r, 0.18, 0.36), sh = Math.floor(r() * 3);
      const f = [[fc * 0.95, fc * 1.08, fc * 0.98], [fc, fc * 1.18], [fc * 1.15, fc * 1.04, fc * 0.92]][sh];
      out.push({ t, d, f, h: [1, 0.08, 0.015], att: 0.045, rel: 0.08, amp: between(r, 0.75, 1), vib: [between(r, 5, 8), 0.006] });
      t += d + between(r, 0.04, 0.1);
    }
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) { const fc2 = k * between(r, 4800, 6200), d = between(r, 0.025, 0.045); out.push({ t, d, f: [fc2, fc2 * 0.85], att: 0.004, rel: 0.01, amp: 0.2 }); t += d + 0.03; }
    return out;
  },
  warbler(r, k) { // willow warbler: a soft cascade of upslurred notes falling in pitch
    const out = [], n = 10 + Math.floor(r() * 6); let t = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), fc = k * lerp(5600, 3300, u) * (1 + (r() - 0.5) * 0.08), d = between(r, 0.055, 0.075);
      out.push({ t, d, f: [fc * 0.86, fc * 1.12, fc * 1.04], h: [1, 0.06], att: 0.006, rel: 0.015, amp: 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.3)) });
      t += d + between(r, 0.02, 0.035);
    }
    return out;
  },
  dove(r, k) { // collared dove "coo-COOO-coo"
    const f0 = (k * between(r, 470, 520)) / 1.6;
    return [
      { t: 0, d: 0.24, f: [f0, f0 * 1.02, f0 * 0.97], h: [1, 0.25, 0.08], att: 0.05, rel: 0.08, amp: 0.7 },
      { t: 0.34, d: 0.56, f: [f0 * 1.06, f0 * 1.09, f0 * 1.04, f0 * 0.95], h: [1, 0.28, 0.09], att: 0.06, rel: 0.1, amp: 1 },
      { t: 1.02, d: 0.32, f: [f0 * 0.99, f0 * 0.95, f0 * 0.9], h: [1, 0.22, 0.06], att: 0.04, rel: 0.09, amp: 0.75 },
    ];
  },
  cuckoo(r, k) { // "cu-coo", a falling third, hooty and soft-edged
    const f1 = k * between(r, 620, 700), f2 = f1 * between(r, 0.8, 0.84), out = [];
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const t = i * between(r, 0.8, 0.95);
      out.push({ t, d: 0.15, f: [f1 * 0.97, f1, f1 * 0.99], h: [1, 0.12, 0.03], att: 0.025, rel: 0.05, amp: 0.85 });
      out.push({ t: t + 0.25, d: 0.28, f: [f2 * 1.01, f2, f2 * 0.96], h: [1, 0.12, 0.03], att: 0.03, rel: 0.1, amp: 1 });
    }
    return out;
  },
  lark(r, k, dur = 6) { // skylark: an unbroken, rapid, high twittering
    const out = []; let t = 0, fc = k * 4200;
    while (t < dur) {
      fc = clamp(fc * Math.pow(2, (r() - 0.5) * 0.9), 2800 * k, 6800 * k);
      const d = between(r, 0.02, 0.07), sh = Math.floor(r() * 3);
      out.push({ t, d, f: [[fc * 0.9, fc * 1.12], [fc * 1.15, fc * 0.88], [fc, fc * 1.18, fc * 0.92]][sh], h: [1, 0.05], att: 0.004, rel: 0.008, amp: (0.5 + 0.5 * r()) * (0.7 + 0.3 * Math.sin(t * 1.3)), vib: r() < 0.25 ? [between(r, 40, 70), 0.04] : null });
      t += d + between(r, 0.006, 0.03);
    }
    return out;
  },
};
const BIRD_POOL = ['sparrow', 'tit', 'chaffinch', 'robin', 'blackbird', 'warbler', 'dove', 'cuckoo'];
/** Living syrinx: a tiny, fast pitch flutter shared by every note of one song. */
const flutter = (r, depth = 0.006, rate = 30) => { const w = wander(Math.floor(r() * 1e6), rate); return t => 1 + depth * (w(t) - 0.5) * 2; };
function birdsong(r, p) {
  const sp = p.species ?? pick(r, BIRD_POOL), k = p.pitch ?? between(r, 0.93, 1.07);
  if (!BIRDS[sp]) throw new Error(`unknown bird species "${sp}"`);
  const wob = flutter(r), notes = BIRDS[sp](r, k, p.dur).map(n => ({ wob, ...n }));
  const x = sing(notes);
  return filt(x, 'lp', sp === 'cuckoo' || sp === 'dove' ? 2400 : 8500, 0.7);
}
function tweet(r, p) {
  const k = p.pitch ?? between(r, 0.9, 1.1), out = [];
  for (let i = 0, n = p.count ?? 1 + Math.floor(r() * 2); i < n; i++) out.push({ t: i * 0.17, d: between(r, 0.08, 0.11), f: [2600 * k, 4700 * k, 5300 * k, 4400 * k], h: [1, 0.1], att: 0.006, rel: 0.02, wob: flutter(r) });
  return filt(sing(out), 'lp', 8500, 0.7);
}
function squeak(r, p) { // a mouse: thin, nasal, harmonic-rich squeaks with a rough edge
  const k = p.pitch ?? between(r, 0.9, 1.15), out = [];
  for (let i = 0, n = p.count ?? 1 + Math.floor(r() * 3); i < n; i++) {
    const d = between(r, 0.07, 0.13), f = [3000, 4300, 4700, 4000].map(v => v * k * (1 + (r() - 0.5) * 0.12));
    out.push({ t: i * between(r, 0.16, 0.22), d, f, h: [1, 0.4, 0.2, 0.08], att: 0.006, rel: 0.02, wob: flutter(r, 0.012, 25), amp: i ? 0.8 : 1 });
  }
  const x = sing(out), nz = white(r), hs = svf().set(4200 * k, 3);
  for (let i = 0; i < x.length; i++) { hs.tick(nz()); x[i] += hs.bp * Math.abs(x[i]) * 0.12; }
  return filt(x, 'lp', 9000, 0.7);
}
/** Owl hoots: soft breathy tones near 300–500 Hz with gentle pitch arcs. kind: horned | tawny | simple. */
function owl(r, p) {
  const kind = p.kind ?? pick(r, ['horned', 'tawny', 'simple']), f0 = (p.pitch ?? 1) * (kind === 'horned' ? between(r, 290, 360) : between(r, 380, 470));
  const wob = flutter(r, 0.012, 7);
  const H = (t, d, fr, amp, o = {}) => ({ t, d, f: [fr * 0.94, fr * 1.03, fr, fr * 0.93], h: [1, 0.14, 0.04], att: o.att ?? Math.min(0.08, d * 0.3), rel: o.rel ?? Math.min(0.15, d * 0.4), amp, vib: o.vib ?? null, wob });
  let notes;
  if (kind === 'horned') notes = [H(0, 0.24, f0, 0.7), H(0.38, 0.1, f0 * 1.02, 0.5), H(0.52, 0.5, f0 * 1.05, 1), H(1.22, 0.36, f0 * 0.98, 0.75), H(1.72, 0.42, f0 * 0.96, 0.7)];
  else if (kind === 'tawny') {
    notes = [H(0, 0.75, f0, 1)];
    let t = 2.1;
    notes.push(H(t, 0.1, f0 * 0.97, 0.45)); t += 0.32;
    for (let i = 0; i < 4; i++) { notes.push(H(t, 0.06, f0 * (0.96 + i * 0.01), 0.5, { att: 0.012, rel: 0.02 })); t += 0.11; }
    notes.push(H(t, 0.95, f0 * 1.01, 0.95, { vib: [between(r, 9, 13), 0.025], rel: 0.25 }));
  } else notes = [H(0, 0.42, f0, 1), H(0.62, 0.5, f0 * 0.97, 0.85)];
  const lead = 0.05; for (const n of notes) n.t += lead;
  const x = sing(notes, 0.3), nz = white(r), br = svf().set(f0 * 2, 1.2), hh = svf().set(900, 0.7), env = new Float32Array(x.length), hEnv = new Float32Array(x.length);
  // breath: noise riding the tone's own envelope, plus a soft "h" that starts just before each hoot
  for (const n of notes) {
    const i0 = Math.round(n.t * SR), m = nlen(n.d), h0 = i0 - nlen(0.04);
    for (let i = 0; i < m && i0 + i < env.length; i++) env[i0 + i] += n.amp * (0.3 + 0.7 * strike(i / SR, 0.03, 0.1)) * hann(i / m * 0.5 + 0.25);
    for (let i = 0; i < nlen(0.09); i++) if (h0 + i >= 0) hEnv[h0 + i] += n.amp * hann(i / nlen(0.09));
  }
  for (let i = 0; i < x.length; i++) { const v = nz(); br.tick(v); hh.tick(v); x[i] += br.bp * env[i] * 0.2 + hh.lp * hEnv[i] * 0.12; }
  return filt(x, 'lp', 2600, 0.7);
}
/** One cricket: carrier-tone pulses grouped into chirps (field) or long pulsed trills (tree). */
function cricketInto(x, r, { kind = 'field', carrier, rate, t0 = 0, active = () => 1 } = {}) {
  const T = x.length / SR;
  if (kind === 'field') {
    const fc = carrier ?? between(r, 4500, 5200), per = 1 / (rate ?? between(r, 2.2, 3.4)), np = 3 + Math.floor(r() * 2), drift = wander(Math.floor(r() * 1e6), 0.2);
    for (let t = t0 + r() * per; t < T - 0.2; t += per * (1 + (r() - 0.5) * 0.16) * (0.9 + 0.2 * drift(t))) {
      const a = active(t); if (a < 0.02 || r() < 0.05) continue;
      const m = np - (r() < 0.15 ? 1 : 0);
      for (let k = 0; k < m; k++) {
        const j = 1 + (r() - 0.5) * 0.012, sp = between(r, 0.026, 0.03);
        note(x, { t: t + k * sp, d: between(r, 0.015, 0.018), f: [fc * 1.008 * j, fc * j, fc * 0.975 * j], h: [1, 0.05], att: 0.005, rel: 0.009, amp: a * (k === 0 ? 0.7 : 1) * between(r, 0.8, 1.1) });
      }
    }
  } else {
    const fc = carrier ?? between(r, 2600, 3100), pr = rate ?? between(r, 45, 60);
    let t = t0;
    while (t < T - 0.3) {
      const len = between(r, 1.5, 4), end = Math.min(T - 0.2, t + len);
      for (let s = t; s < end; s += 1 / pr) {
        const a = active(s) * Math.min(1, (s - t) / 0.3, (end - s) / 0.3); if (a < 0.02) continue;
        note(x, { t: s, d: 0.55 / pr, f: [fc, fc * 0.985], att: 0.003, rel: 0.004, amp: a * (0.9 + 0.2 * r()) });
      }
      t = end + between(r, 0.4, 1.4);
    }
  }
}
function cricket(r, p) { const x = buf(p.dur ?? 3); cricketInto(x, r, { kind: p.kind ?? (r() < 0.7 ? 'field' : 'tree'), t0: 0.05 }); return x; }
/** Frogs: a glottal-like pulse train through two formants and a throat resonance. */
function frog(r, p) {
  const size = clamp(p.size ?? between(r, 0.3, 0.7)), kind = p.kind ?? (r() < 0.6 ? 'ribbit' : 'croak'), lo = 1.35 - 0.6 * size;
  const syl = kind === 'ribbit' // a raspy "rib-bit": slow pulses ringing high, nasal formants
    ? [{ t: 0, d: between(r, 0.08, 0.11), pr: between(r, 48, 60), f1: 950 * lo, f2: 2100 * lo, rel: 0.02 }, { t: between(r, 0.15, 0.19), d: between(r, 0.09, 0.12), pr: between(r, 58, 70), f1: 1150 * lo, f2: 2400 * lo, rel: 0.008 }]
    : Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => ({ t: i * between(r, 0.3, 0.42), d: between(r, 0.18, 0.28), pr: between(r, 28, 40) * (1.3 - 0.4 * size), f1: 420 * lo, f2: 1150 * lo, rel: 0.04 }));
  const end = syl[syl.length - 1].t + syl[syl.length - 1].d, y = buf(end + 0.25);
  for (const s of syl) {
    const ex = new Float32Array(y.length);
    for (let t = s.t; t < s.t + s.d; t += (1 / (s.pr * (1 + 0.15 * ((t - s.t) / s.d)))) * (1 + (r() - 0.5) * 0.08)) {
      const u = (t - s.t) / s.d, a = Math.min(1, u / 0.25) * Math.min(1, ((1 - u) * s.d) / s.rel) * (0.8 + 0.4 * r()), i = Math.round(t * SR);
      for (let j = -10; j <= 10; j++) if (i + j >= 0 && i + j < ex.length) ex[i + j] += a * hann((j + 11) / 22);
    }
    const v = resonate(ex, [[s.f1, 0.01, 1], [s.f2, 0.006, 0.6], [240 * lo, 0.02, 0.5], [s.f1 * 1.6, 0.006, 0.3]]);
    for (let i = 0; i < y.length; i++) y[i] += v[i];
  }
  return y;
}

// ───────────────────────────── registry ─────────────────────────────

const GEN = {
  'footstep-grass': footstep('grass'), 'footstep-dirt': footstep('dirt'), 'footstep-wood': footstep('wood'), 'footstep-stone': footstep('stone'),
  hop, land, whoosh, splash, plop, rustle, thud, pop, chime, sparkle, 'owl-hoot': owl, birdsong, cricket, 'frog-croak': frog,
  wind, stream, fire, 'door-creak': doorCreak, bell: bellSound, 'mouse-squeak': squeak, 'songbird-tweet': tweet, 'wing-flap': wingFlap,
  knock: knocks, woodpecker, anvil,
};
const ALIAS = { footstep: 'footstep-grass', squeak: 'mouse-squeak', tweet: 'songbird-tweet', flap: 'wing-flap', hoot: 'owl-hoot', croak: 'frog-croak', creak: 'door-creak', leaves: 'rustle', bird: 'birdsong' };
/**
 * Calibrated level of each effect: loudest 200 ms window in LUFS (continuous sounds: integrated LUFS).
 * Dialogue sits at about −20 LUFS in the mix, so these keep effects natural and under the voices.
 */
const LEVEL = {
  'footstep-grass': -33, 'footstep-dirt': -32, 'footstep-wood': -30, 'footstep-stone': -32, hop: -31, land: -27, whoosh: -29,
  splash: -23, plop: -28, rustle: -30, thud: -25, pop: -29, chime: -27, sparkle: -29, 'owl-hoot': -27, birdsong: -28,
  cricket: -33, 'frog-croak': -28, wind: -30, stream: -28, fire: -29, 'door-creak': -27, bell: -24, 'mouse-squeak': -29,
  'songbird-tweet': -28, 'wing-flap': -30, knock: -27, woodpecker: -29, anvil: -27,
};
const CONTINUOUS = new Set(['wind', 'stream', 'fire', 'cricket']);
export const SFX_NAMES = Object.keys(GEN);
export const SFX_ALIASES = { ...ALIAS };
/** Calibrated level per effect (LUFS of its loudest 200 ms; continuous effects: integrated). */
export const SFX_LEVELS = { ...LEVEL };

/** Raw, level-calibrated effect without edge processing (used by ambience too). */
function render(key, seed, params) {
  const g = GEN[key];
  const r = rng((hashStr(key) ^ Math.imul((seed >>> 0) || 1, 2654435761)) >>> 0);
  const x = dcBlock(g(r, params));
  const target = LEVEL[key] + (params.level ?? 0) + (r() - 0.5) * 1.5, L = CONTINUOUS.has(key) && x.length > SR ? loudness([x]) : peakLoudness(x);
  if (Number.isFinite(L)) scale(x, Math.pow(10, (target - L) / 20));
  const pk = peak(x);
  if (pk > 0.7) scale(x, 0.7 / pk);
  return x;
}
/**
 * Synthesize a named effect. Deterministic for a given (name, seed, params).
 * Common params: weight (0..1, footsteps/hop/land), surface (hop/land), pitch (multiplier), dur (continuous
 * effects, whoosh, rustle, door-creak), species (birdsong), kind (owl-hoot, cricket, frog-croak), size (splash,
 * frog-croak, bell), count, f0 (bell), close (door-creak), level (dB trim).
 */
export function makeSfx(name, { seed = 1, ...params } = {}) {
  const key = ALIAS[name] ?? name;
  if (!GEN[key]) throw new Error(`unknown sfx "${name}" (known: ${SFX_NAMES.join(', ')})`);
  const x = render(key, seed, params);
  return fadeEdges(x, 0.002, 0.015);
}

// ───────────────────────────── ambience ─────────────────────────────

/** Mono event placed in the stereo bed with distance cues: level, air absorption (low-pass) and reverb send. */
function placer(L, R, sL, sR) {
  return (x, t, pan, dist, gain = 1) => {
    const y = Float32Array.from(x), fc = 14000 / (1 + 4 * dist * dist);
    filt(y, 'lp', fc, 0.6); filt(y, 'lp', fc * 1.4, 0.6);
    const g = gain / (1 + 3 * dist), th = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4, gl = Math.cos(th) * g, gr = Math.sin(th) * g, send = 0.25 + 0.9 * dist;
    const i0 = Math.round(t * SR);
    for (let i = Math.max(0, -i0); i < y.length && i0 + i < L.length; i++) {
      const v = y[i]; L[i0 + i] += v * gl; R[i0 + i] += v * gr; sL[i0 + i] += v * gl * send; sR[i0 + i] += v * gr * send;
    }
  };
}
/** Individual singers with bouts of song and silence, each at its own spot. */
function birds(ctx, pool, count, { dist = [0.3, 0.9], gap = [2.5, 7], bout = [15, 50], rest = [8, 35], gain = 1 } = {}) {
  const { r, T, put } = ctx;
  for (let b = 0; b < count; b++) {
    const sp = pick(r, pool), k = between(r, 0.94, 1.06), pan = between(r, -0.9, 0.9), d = between(r, dist[0], dist[1]), seed = Math.floor(r() * 1e9);
    let t = -between(r, 0, 20), on = r() < 0.7, until = t + between(r, ...(on ? bout : rest)), i = 0;
    while (t < T) {
      if (t >= until) { on = !on; until = t + between(r, ...(on ? bout : rest)); }
      if (on) {
        const x = render('birdsong', seed + i++, { species: sp, pitch: k * between(r, 0.98, 1.02), dur: sp === 'lark' ? between(r, 5, 12) : undefined });
        if (t + x.length / SR > 0) put(x, t, pan + (r() - 0.5) * 0.06, d, gain * between(r, 0.8, 1.1));
        t += x.length / SR + between(r, ...gap);
      } else t = until;
    }
  }
}
function owls(ctx, { every = 30, dist = [0.55, 0.9], kind } = {}) {
  const { r, T, put } = ctx, k = between(r, 0.95, 1.05), pan = between(r, -0.8, 0.8), d = between(r, ...dist), kd = kind ?? pick(r, ['horned', 'tawny']);
  let i = 0;
  for (let t = between(r, 2, every * 0.8); t < T; t += every * between(r, 0.6, 1.5)) put(render('owl-hoot', Math.floor(r() * 1e9) + i++, { kind: kd, pitch: k }), t, pan, d);
}
function crickets(ctx, n, { kind = 'field', dist = [0.35, 0.95], gain = 1 } = {}) {
  const { r, T, put } = ctx;
  for (let c = 0; c < n; c++) {
    const x = buf(T), on = wander(Math.floor(r() * 1e6), 0.03), th = between(r, 0.2, 0.4);
    const active = t => clamp((on(t) - th) / 0.08);
    const k = c % 4 === 3 && kind === 'field' ? 'tree' : kind;
    cricketInto(x, rng(Math.floor(r() * 1e9)), { kind: k, active });
    put(x, 0, between(r, -0.9, 0.9), between(r, ...dist), gain * between(r, 0.12, 0.2) * (k === 'tree' && kind === 'field' ? 0.45 : 1));
  }
}
/** Occasional sounds from a generator, e.g. distant knocks, a far bell, twig snaps. */
function every(ctx, name, mean, params, { dist = [0.5, 0.9], gain = 1, pan } = {}) {
  const { r, T, put } = ctx;
  for (let t = between(r, 0, mean); t < T; t += mean * between(r, 0.5, 1.6))
    put(render(name, Math.floor(r() * 1e9), typeof params === 'function' ? params(r) : params), t, pan ?? between(r, -0.85, 0.85), between(r, ...dist), gain);
}
/** A woodpecker drumming: a fast, even "drrrrr" of hollow wooden toks on a dead branch, speeding up slightly. */
function woodpecker(r) {
  const n = 12 + Math.floor(r() * 8), rate = between(r, 13, 17), x = buf(n / rate + 0.3), ex = new Float32Array(x.length), nz = white(r), lp = svf().set(3000, 0.7);
  let t = 0.003;
  for (let i = 0; i < n; i++) {
    const a = (1 - (i / n) * 0.3) * between(r, 0.85, 1.1) * Math.min(1, 0.6 + i * 0.2), i0 = Math.round(t * SR);
    for (let j = 0; j < 96 && i0 + j < ex.length; j++) { lp.tick(nz()); ex[i0 + j] += lp.lp * a * strike(j / SR, 0.0003, 0.0007); }
    t += (1 / rate) * (1 - 0.12 * (i / n)) * between(r, 0.93, 1.07);
  }
  const f = between(r, 380, 520);
  const y = resonate(ex, [[f, 0.009, 1], [f * 2.4, 0.007, 0.8], [f * 4.1, 0.005, 0.5], [between(r, 2600, 3200), 0.003, 0.3]]);
  for (let i = 0; i < x.length; i++) x[i] = y[i] * 3 + ex[i] * 0.15;
  return x;
}
function windBed(ctx, o) {
  const { L, R, r } = ctx, seed = Math.floor(r() * 1e6), gw = wander(seed, o.gustRate ?? 0.12), base = o.base ?? 0.25, span = o.span ?? 0.9;
  windInto(L, rng(seed + 1), t => base + gw(t) * span, { ...o, seed });
  windInto(R, rng(seed + 2), t => base + gw(t + 0.7) * span, { ...o, seed: seed + 9 });
  if (o.gain !== undefined) { scale(L, o.gain); scale(R, o.gain); }
}
const AMB = {
  'meadow-day': { lufs: -33, room: 0.45, build(c) {
    windBed(c, { strength: 0.22, leafy: 0.2, whistle: 0, base: 0.2, span: 0.8, gain: 1.1 });
    birds(c, ['lark'], 1, { dist: [0.8, 0.92], gap: [4, 10], bout: [20, 50], rest: [20, 60], gain: 0.45 });
    birds(c, ['tit', 'chaffinch', 'warbler', 'sparrow', 'robin'], 3, { dist: [0.35, 0.85] });
  } },
  'meadow-night': { lufs: -35, room: 0.5, build(c) {
    windBed(c, { strength: 0.18, leafy: 0.3, whistle: 0, base: 0.15, span: 0.7 });
    crickets(c, 7, { kind: 'field' });
    owls(c, { every: 32 });
  } },
  'forest-day': { lufs: -33, room: 0.82, build(c) {
    windBed(c, { strength: 0.25, leafy: 0.45, whistle: 0, base: 0.2, span: 1, gustRate: 0.09, gain: 0.8 });
    birds(c, ['robin', 'blackbird', 'warbler', 'chaffinch', 'tit'], 4, { dist: [0.3, 0.95] });
    birds(c, ['cuckoo'], 1, { dist: [0.8, 0.95], bout: [10, 25], rest: [40, 120], gap: [1, 2] });
    every(c, 'woodpecker', 70, {}, { dist: [0.65, 0.9] });
  } },
  'forest-night': { lufs: -36, room: 0.85, build(c) {
    windBed(c, { strength: 0.2, leafy: 0.4, whistle: 0, base: 0.15, span: 0.8, gustRate: 0.08 });
    crickets(c, 4, { kind: 'tree', dist: [0.5, 0.95] });
    owls(c, { every: 22, kind: 'tawny' });
    every(c, 'rustle', 28, r => ({ dur: between(r, 0.3, 0.6) }), { dist: [0.4, 0.8], gain: 0.6 });
  } },
  stream: { lufs: -29, room: 0.6, build(c) {
    const s = c.r() * 1e6 | 0, l = new Float32Array(c.L.length), rr = new Float32Array(c.L.length);
    waterInto(l, rng(s + 1), { busy: 1, seed: s }); waterInto(rr, rng(s + 2), { busy: 1, seed: s + 17 });
    for (let i = 0; i < l.length; i++) { c.L[i] += (l[i] + 0.35 * rr[i]) * 0.8; c.R[i] += (rr[i] + 0.35 * l[i]) * 0.8; }
    windBed(c, { strength: 0.18, leafy: 0.4, whistle: 0, base: 0.15, span: 0.7, gain: 0.5 });
    birds(c, ['warbler', 'robin', 'tit'], 2, { dist: [0.5, 0.9], gain: 0.8 });
  } },
  'village-day': { lufs: -33, room: 0.6, build(c) {
    windBed(c, { strength: 0.2, leafy: 0.25, whistle: 0, base: 0.15, span: 0.8, gain: 1.1 });
    birds(c, ['sparrow'], 1, { dist: [0.35, 0.7], gap: [3, 9] });
    birds(c, ['tit', 'robin', 'blackbird', 'chaffinch'], 2, { dist: [0.5, 0.9] });
    every(c, 'anvil', 35, {}, { dist: [0.8, 0.95], gain: 0.7 }); // the smithy down the lane
    every(c, 'thud', 50, r => ({ weight: between(r, 0.6, 0.9) }), { dist: [0.85, 0.97], gain: 0.6 }); // someone at work, far off
    every(c, 'bell', 120, r => ({ f0: between(r, 260, 330), count: 3, gap: 2.2, size: 1.2 }), { dist: [0.9, 0.98], gain: 0.7 });
  } },
  'village-night': { lufs: -37, room: 0.6, build(c) {
    windBed(c, { strength: 0.12, leafy: 0.2, whistle: 0, base: 0.1, span: 0.7 });
    crickets(c, 4, { kind: 'field', dist: [0.5, 0.95] });
    owls(c, { every: 45, dist: [0.75, 0.95] });
    every(c, 'door-creak', 70, r => ({ dur: between(r, 0.5, 0.9) }), { dist: [0.7, 0.9], gain: 0.5 });
  } },
  'wind-hill': { lufs: -29, room: 0.35, build(c) {
    windBed(c, { strength: 0.62, leafy: 0.08, whistle: 0.55, base: 0.4, span: 0.65, gustRate: 0.2 });
    birds(c, ['lark'], 1, { dist: [0.85, 0.95], bout: [20, 40], rest: [30, 80], gain: 0.6 });
  } },
};
export const AMBIENCE_NAMES = Object.keys(AMB);
/** Steady loudness each bed is rendered at (median 3 s short-term LUFS; integrated for beds under 5 s). */
export const AMBIENCE_LUFS = Object.fromEntries(Object.entries(AMB).map(([k, v]) => [k, v.lufs]));

/**
 * The steady level of a bed: the median of its 3 s short-term loudness, so a passing owl or a bell toll in one
 * segment doesn't pull the whole bed down (the same bed then sits at the same level in every scene).
 */
function bedLoudness({ L, R }) {
  const W = 3 * SR, H = SR;
  if (L.length < W + 2 * H) return loudness([L, R]);
  const v = [];
  for (let s = 0; s + W <= L.length; s += H) { const x = loudness([L.subarray(s, s + W), R.subarray(s, s + W)]); if (Number.isFinite(x)) v.push(x); }
  if (!v.length) return -Infinity;
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}
/**
 * A stereo ambience bed of `dur` seconds. Nothing loops: every layer is a continuous seeded process,
 * and a 4 s pre-roll means the bed starts mid-life (filters warm, a bird may be mid-song).
 */
export function ambience(name, dur, { seed = 1 } = {}) {
  const A = AMB[name];
  if (!A) throw new Error(`unknown ambience "${name}" (known: ${AMBIENCE_NAMES.join(', ')})`);
  const pre = 4, T = dur + pre, n = nlen(T), L = new Float32Array(n), R = new Float32Array(n), sL = new Float32Array(n), sR = new Float32Array(n);
  const r = rng((hashStr(name) ^ Math.imul((seed >>> 0) || 1, 2246822519)) >>> 0);
  A.build({ r, T, L, R, put: placer(L, R, sL, sR) });
  const wet = reverb(sL, sR, { room: A.room, damp: 0.5, width: 1 });
  const k = nlen(pre), m = nlen(dur), out = { L: new Float32Array(m), R: new Float32Array(m) };
  for (let i = 0; i < m; i++) { out.L[i] = L[k + i] + wet.L[k + i] * 0.6; out.R[i] = R[k + i] + wet.R[k + i] * 0.6; }
  dcBlock(out.L); dcBlock(out.R);
  const lu = bedLoudness(out);
  if (Number.isFinite(lu)) { const g = Math.pow(10, (A.lufs - lu) / 20); scale(out.L, g); scale(out.R, g); }
  return out;
}
