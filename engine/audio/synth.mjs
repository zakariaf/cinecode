// DSP building blocks for the score. Everything is 48 kHz Float32Array (mono) or { L, R } (stereo).
// Deterministic: every noise source is seeded through rng() from engine/core/lib.mjs.
//
//  basics      SR, mtof, ftom, db, mixSeed, gauss, stereo, mixInto, panGains, fade, peak, rmsDb
//  oscillators polyBlep, polyBlamp, osc (sine / triangle / saw / square, band-limited), noise (white / pink / brown)
//  envelopes   adsr (curved segments), follower
//  filters     Biquad (RBJ: lowpass, highpass, bandpass, notch, peaking, lowshelf, highshelf), biquad, OnePole, smooth, dcBlock
//  voices      pluck (Karplus-Strong harp / guitar / pizzicato), fm (2-op FM), celesta, bell, epiano, glock, musicBox,
//              piano (additive with hammer noise), windLine / flute (breathy legato wind line: flute, clarinet, horn, oboe,
//              bassoon, brass), bowedLine (solo legato violin / viola / cello), strings (detuned saw ensemble),
//              pad (warm pad or formant choir)
//  percussion  kick, timpani, timpaniRoll, shaker, brush, woodblock, swell (noise swell), cymbal (soft-mallet strokes), cymbalRoll
//  effects     delay (ping-pong), reverb (diffused 8-line FDN), softClip, limiter
import { rng, noise1 } from '../core/lib.mjs';

export const SR = 48000;
const TAU = Math.PI * 2;
const CENT = Math.LN2 / 1200;                       // 2^(c/1200) ≈ 1 + c*CENT for small c
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = f => 69 + 12 * Math.log2(f / 440);
export const db = x => Math.pow(10, x / 20);
const len = s => Math.max(1, Math.round(s * SR));

/** Stable 32-bit seed from any mix of numbers and strings. */
export function mixSeed(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    const s = typeof x === 'string' ? x : String(Math.round(Number(x) * 1000));
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  }
  return (h >>> 0) || 1;
}
/** Approximately normal deviate (σ ≈ 1) from a uniform rng. */
export const gauss = r => (r() + r() + r() + r() - 2) * 1.732;

// ---------------------------------------------------------------- buffers, panning, mixing

export const stereo = n => ({ L: new Float32Array(n), R: new Float32Array(n) });
/** Equal-power pan: pos -1 (left) .. 1 (right) → [gainL, gainR]. */
export function panGains(pos = 0) {
  const a = (clamp(pos, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(a), Math.sin(a)];
}
/** Add a mono buffer into a stereo bus at sample offset `at` with gain and equal-power pan. */
export function mixInto(bus, buf, at = 0, gain = 1, pan = 0) {
  const [gl, gr] = panGains(pan), L = bus.L, R = bus.R, n = L.length;
  const a = Math.round(at), i0 = Math.max(0, -a), i1 = Math.min(buf.length, n - a);
  for (let i = i0; i < i1; i++) { const v = buf[i] * gain; L[a + i] += v * gl; R[a + i] += v * gr; }
  return bus;
}
/** Add a stereo buffer into a stereo bus. */
export function mixStereo(bus, src, at = 0, gain = 1) {
  const a = Math.round(at), n = bus.L.length, i0 = Math.max(0, -a), i1 = Math.min(src.L.length, n - a);
  for (let i = i0; i < i1; i++) { bus.L[a + i] += src.L[i] * gain; bus.R[a + i] += src.R[i] * gain; }
  return bus;
}
/** In-place raised-cosine fade in / out (seconds). */
export function fade(buf, fin = 0.003, fout = 0.01) {
  const n = buf.length, a = Math.min(n, len(fin)), b = Math.min(n, len(fout));
  for (let i = 0; i < a; i++) buf[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
  for (let i = 0; i < b; i++) buf[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  return buf;
}
export function peak(x) {
  let p = 0;
  for (const c of x.L ? [x.L, x.R] : [x]) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; }
  return p;
}
export function rmsDb(x) {
  let s = 0, n = 0;
  for (const c of x.L ? [x.L, x.R] : [x]) { for (let i = 0; i < c.length; i++) s += c[i] * c[i]; n += c.length; }
  return 10 * Math.log10(Math.max(1e-20, s / Math.max(1, n)));
}

// ---------------------------------------------------------------- oscillators

/** PolyBLEP residual for a unit-normalised phase t and phase increment dt (jump of 2). */
export function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/** PolyBLAMP residual (integrated polyBLEP), for slope discontinuities. */
export function polyBlamp(t, dt) {
  if (t < dt) { t = t / dt - 1; return -t * t * t / 3; }
  if (t > 1 - dt) { t = (t - 1) / dt + 1; return t * t * t / 3; }
  return 0;
}
/**
 * Band-limited oscillator. `freq` is a number or a per-sample Float32Array (Hz).
 * type: 'sine' | 'triangle' | 'saw' | 'square'. Output range ±1.
 */
export function osc(type, freq, n, { phase = 0 } = {}) {
  const out = new Float32Array(n), arr = typeof freq !== 'number';
  let p = ((phase % 1) + 1) % 1;
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.49, (arr ? freq[i] : freq) / SR);
    let v;
    if (type === 'sine') v = Math.sin(TAU * p);
    else if (type === 'saw') v = 2 * p - 1 - polyBlep(p, dt);
    else if (type === 'square') { const q = p + 0.5 - Math.floor(p + 0.5); v = (p < 0.5 ? 1 : -1) + polyBlep(p, dt) - polyBlep(q, dt); }
    else { const q = p + 0.5 - Math.floor(p + 0.5); v = 4 * Math.abs(p - 0.5) - 1 - 4 * dt * polyBlamp(p, dt) + 4 * dt * polyBlamp(q, dt); }
    out[i] = v;
    p += dt; if (p >= 1) p -= 1;
  }
  return out;
}
/** Seeded noise. color: 'white' | 'pink' (Kellet) | 'brown'. Roughly ±1. */
export function noise(n, seed = 1, color = 'white') {
  const r = rng(seed), out = new Float32Array(n);
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let y = 0;
    for (let i = 0; i < n; i++) { y = (y + 0.02 * (r() * 2 - 1)) / 1.02; out[i] = y * 3.5; }
  } else for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

// ---------------------------------------------------------------- envelopes

const curve = (u, c) => (Math.abs(c) < 1e-3 ? u : (1 - Math.exp(-c * u)) / (1 - Math.exp(-c)));
/**
 * ADSR envelope of n samples with curved (exponential-like) segments.
 * gate = seconds the note is held; release starts from whatever level was reached, so short notes never click.
 * curve > 0 bends segments like an analog envelope (fast start, slow approach).
 */
export function adsr(n, { a = 0.01, d = 0.2, s = 0.7, r = 0.3, gate = Infinity, curve: c = 4, peak: pk = 1 } = {}) {
  const env = new Float32Array(n), A = Math.max(1, Math.round(a * SR)), D = Math.max(1, Math.round(d * SR)), R = Math.max(1, Math.round(r * SR));
  const G = Math.max(0, Math.min(n, Math.round(gate * SR)));
  // each segment follows (1 - e^(-c·u)) / (1 - e^(-c)), computed with a running exponential (no exp() per sample)
  const seg = (i0, i1, len, from, to, cc) => {
    if (Math.abs(cc) < 1e-3) { for (let i = i0; i < i1; i++) env[i] = from + (to - from) * ((i - i0) / len); return; }
    const k = Math.exp(-cc / len), norm = 1 / (1 - Math.exp(-cc));
    let e = Math.exp(-cc * 0);
    for (let i = i0; i < i1; i++) { env[i] = from + (to - from) * (1 - e) * norm; e *= k; }
  };
  const aEnd = Math.min(G, A), dEnd = Math.min(G, A + D);
  seg(0, aEnd, A, 0, pk, c * 0.4);
  seg(A, dEnd, D, pk, s * pk, c);
  for (let i = A + D; i < G; i++) env[i] = s * pk;
  const lvl = G > 0 ? env[G - 1] : 0;
  seg(G, Math.min(n, G + R), R, lvl, 0, c);
  return env;
}

// ---------------------------------------------------------------- filters

/** RBJ-cookbook biquad (direct form I, double precision state; safe to retune per block). */
export class Biquad {
  constructor(type = 'lowpass', f = 1000, q = 0.707, gain = 0) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, gain); }
  set(type, f, q = 0.707, gain = 0) {
    const w = TAU * clamp(f, 5, SR * 0.49) / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, gain / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'bandpass': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'peaking': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
      case 'lowshelf': { const k = 2 * Math.sqrt(A) * al;
        b0 = A * ((A + 1) - (A - 1) * cw + k); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - k);
        a0 = (A + 1) + (A - 1) * cw + k; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - k; break; }
      case 'highshelf': { const k = 2 * Math.sqrt(A) * al;
        b0 = A * ((A + 1) + (A - 1) * cw + k); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - k);
        a0 = (A + 1) - (A - 1) * cw + k; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - k; break; }
      default: throw new Error(`unknown biquad type ${type}`);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  process(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]); return buf; }
}
/** Filter a buffer in place. */
export const biquad = (buf, type, f, q = 0.707, gain = 0) => new Biquad(type, f, q, gain).process(buf);
/** One-pole smoother / lowpass (and complementary highpass). */
export class OnePole {
  constructor(hz = 10, y = 0) { this.y = y; this.set(hz); }
  set(hz) { this.a = Math.exp(-TAU * hz / SR); return this; }
  lp(x) { return (this.y = x + (this.y - x) * this.a); }
  hp(x) { return x - this.lp(x); }
}
/** One-pole smoothing of a buffer (in place). */
export function smooth(buf, hz) { const f = new OnePole(hz, buf[0] || 0); for (let i = 0; i < buf.length; i++) buf[i] = f.lp(buf[i]); return buf; }
/** DC blocker (in place), ~15 Hz corner. */
export function dcBlock(buf, R = 0.998) {
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i], y = x - x1 + R * y1; x1 = x; y1 = y; buf[i] = y; }
  return buf;
}
/** Envelope follower toward a target signal with separate attack / release times (seconds). */
export function follower(target, att = 0.03, rel = 0.1) {
  const out = new Float32Array(target.length), ka = Math.exp(-1 / (att * SR)), kr = Math.exp(-1 / (rel * SR));
  let y = 0;
  for (let i = 0; i < target.length; i++) { const x = target[i], k = x > y ? ka : kr; y = x + (y - x) * k; out[i] = y; }
  return out;
}

// ---------------------------------------------------------------- plucked strings (Karplus–Strong, extended)

const BODIES = {
  harp: [['highpass', 55, 0.7], ['peaking', 160, 0.9, 3], ['peaking', 420, 1.2, 1.5], ['peaking', 2800, 1.0, -3], ['lowpass', 6500, 0.6]],
  guitar: [['highpass', 70, 0.7], ['peaking', 105, 1.6, 3.5], ['peaking', 230, 1.4, 2], ['peaking', 3000, 1, -2.5], ['lowpass', 6000, 0.6]],
  pizz: [['highpass', 45, 0.7], ['peaking', 120, 1.0, 2.5], ['peaking', 290, 1.0, 3.5], ['peaking', 950, 1.4, 1.5], ['peaking', 3000, 1, -3], ['lowpass', 4000, 0.6]],
  bass: [['highpass', 35, 0.7], ['peaking', 90, 1.2, 3], ['lowpass', 2200, 0.6]],
};
function apPhaseDelay(C, w) {
  const ph = Math.atan2(-Math.sin(w), C + Math.cos(w)) - Math.atan2(-C * Math.sin(w), 1 + C * Math.cos(w));
  let d = -ph / w; if (d < 0) d += TAU / w;
  return d;
}
/**
 * Karplus–Strong plucked string with a tuned one-pole loss filter, fractional-delay allpass,
 * pluck-position comb and body EQ. dur = how long the note is held (only matters with mute: true).
 * t60: decay of the fundamental (s); t60hi: decay at ~2.5 kHz (s); pos: pluck position (0..0.5).
 */
export function pluck(freq, dur = 1, { vel = 0.7, seed = 1, t60, t60hi, pos = 0.17, bright = 0.5, mute = false, release = 0.1, body = 'harp', maxLen = 9 } = {}) {
  freq = clamp(freq, 25, 4000);
  const P = SR / freq;
  t60 = t60 ?? clamp(5.5 * Math.pow(196 / freq, 0.55), 0.7, 10);
  t60hi = Math.min(t60, t60hi ?? t60 * (0.05 + 0.25 * bright));
  const fRef = Math.min(SR * 0.45, Math.max(2500, freq * 3)), wr = TAU * fRef / SR, w0 = TAU * freq / SR;
  const g0 = Math.pow(10, -3 / (t60 * freq)), gr = Math.pow(10, -3 / (t60hi * freq));
  // one-pole loss filter G(1-p)/(1-p z^-1) solved so the loop gain is exactly g0 at the fundamental and gr at fRef
  let p = 0;
  const c0 = Math.cos(w0), cr = Math.cos(wr);
  if (gr < g0) { const rho = (gr / g0) ** 2, A = c0 - rho * cr, B = 1 - rho; p = (A - Math.sqrt(Math.max(0, A * A - B * B))) / B; }
  const G0 = Math.min(0.99999, g0 * Math.sqrt(1 - 2 * p * c0 + p * p) / (1 - p));
  const tLp = Math.atan2(p * Math.sin(w0), 1 - p * Math.cos(w0)) / w0;
  const D = P - tLp, L = Math.max(2, Math.floor(D - 0.6)), want = D - L;
  let dd = want, C = (1 - dd) / (1 + dd);
  for (let k = 0; k < 4; k++) { dd += want - apPhaseDelay(C, w0); C = (1 - dd) / (1 + dd); }

  const total = len(mute ? Math.min(maxLen, dur + release * 1.3 + 0.03) : Math.min(maxLen, Math.max(dur, t60 * 0.9)));
  const out = new Float32Array(total), r = rng(seed);
  // excitation: the string's initial displacement over one period: a triangle with its apex at the pluck point
  // (harmonics fall as sin(πkβ)/k², like a finger pluck) plus a little seeded noise for flesh / nail, softened by
  // a velocity-dependent lowpass. It is then windowed and de-meaned so it starts and ends at exactly zero and has
  // no DC: what re-enters the loop one period later continues the waveform seamlessly (no click).
  const E = Math.max(4, Math.round(P)), ex = new Float64Array(E), apex = clamp(pos, 0.05, 0.5) * E;
  const lpE = new Biquad('lowpass', clamp(500 + 6500 * vel * vel * (0.35 + bright), 300, 9000), 0.6);
  for (let k = 0; k < 2; k++) for (let i = 0; i < E; i++) {               // run twice: the second pass is periodic
    const tri = i < apex ? i / apex : (E - i) / (E - apex);
    ex[i] = lpE.tick(tri - 0.5 + (r() * 2 - 1) * 0.12 * (0.4 + bright));
  }
  const win = new Float64Array(E);
  let sw = 0, sx = 0;
  for (let i = 0; i < E; i++) { win[i] = Math.sin(Math.PI * (i + 0.5) / E); sw += win[i]; sx += win[i] * ex[i]; }
  const k0 = sx / sw;
  let m = 1e-9;
  for (let i = 0; i < E; i++) { ex[i] = win[i] * (ex[i] - k0); m = Math.max(m, Math.abs(ex[i])); }
  const ex2 = ex, amp = 0.5 * Math.pow(vel, 1.3) / m;
  const buf = new Float64Array(L);
  let idx = 0, lp = 0, apx = 0, apy = 0, g = G0;
  const G = Math.round(dur * SR), gm = mute ? G0 * Math.pow(10, -3 / (release * freq)) / g0 : G0, kg = Math.exp(-1 / (0.012 * SR));
  for (let i = 0; i < total; i++) {
    if (mute && i > G) g = gm + (g - gm) * kg;
    const d = buf[idx];
    lp = (1 - p) * g * d + p * lp;
    const ap = C * lp + apx - C * apy; apx = lp; apy = ap;
    const y = (i < E ? ex2[i] * amp : 0) + ap;
    buf[idx] = y; idx = idx + 1 === L ? 0 : idx + 1;
    out[i] = y;
  }
  for (const [t, f, q, gn] of BODIES[body] || []) biquad(out, t, f, q, gn || 0);
  dcBlock(out);
  return fade(out, 0, 0.03);
}

// ---------------------------------------------------------------- FM and mallet voices

/**
 * Two-operator FM: carrier at freq, modulator at freq*ratio (+fixed Hz), index decaying from `index`
 * to index*indexSustain with time constant indexDecay. Amplitude: attack, exponential decay (t60), release after gate.
 * The index is clamped (Carson's rule) so sidebands stay below ~0.45·SR: no aliasing.
 */
export function fm(freq, dur = 1, { vel = 0.7, ratio = 1, fixed = 0, index = 1.5, indexDecay = 0.4, indexSustain = 0.2, t60 = 2.5, attack = 0.002, release = 0.3, maxLen = 8, phase = 0 } = {}) {
  const fmod = freq * ratio + fixed, Imax = Math.max(0, (SR * 0.42 - freq) / Math.max(1, fmod) - 1);
  const I0 = Math.min(index * (0.5 + 0.5 * vel), Imax);
  const n = len(Math.min(maxLen, Math.max(dur + release, Math.min(t60, dur + t60)) + 0.02));
  const out = new Float32Array(n), dc = Math.pow(10, -3 / (t60 * SR)), di = Math.exp(-1 / (Math.max(1e-3, indexDecay) * SR));
  const A = len(attack), G = dur * SR, kr = Math.exp(-1 / (Math.max(0.01, release) / 6.9 * SR));
  let pc = phase, pm = 0, e = 1, ie = 1, rel = 1;
  const wc = freq / SR, wm = fmod / SR;
  for (let i = 0; i < n; i++) {
    const I = I0 * (indexSustain + (1 - indexSustain) * ie);
    const a = i < A ? 0.5 - 0.5 * Math.cos(Math.PI * i / A) : 1;
    if (i > G) rel *= kr;
    out[i] = Math.sin(TAU * pc + I * Math.sin(TAU * pm)) * e * a * rel;
    pc += wc; pm += wm; if (pc > 1) pc -= 1; if (pm > 1) pm -= 1;
    e *= dc; ie *= di;
  }
  return fade(out, 0, 0.02);
}
const addInto = (a, b, g = 1) => { for (let i = 0; i < Math.min(a.length, b.length); i++) a[i] += b[i] * g; return a; };

/** Celesta: warm 1:1 FM body plus a brief inharmonic 'ting' of the struck bar. */
export function celesta(freq, dur = 0.5, { vel = 0.6, seed = 1 } = {}) {
  const t60 = clamp(2.6 * Math.pow(880 / freq, 0.5), 0.7, 4);
  const body = fm(freq, dur, { vel, ratio: 1, index: 0.7, indexDecay: 0.1, indexSustain: 0.08, t60, attack: 0.0015, release: t60 });
  const th = noise(len(0.04), seed + 3); biquad(th, 'lowpass', 380, 0.7);
  for (let i = 0; i < th.length; i++) body[i] += th[i] * 0.35 * vel * Math.exp(-i / SR / 0.008);
  addInto(body, fm(freq, 0.05, { vel, ratio: 3.98, index: 0.6, indexDecay: 0.03, indexSustain: 0, t60: 0.22, attack: 0.001, release: 0.2, maxLen: 0.3 }), 0.22 * vel);
  addInto(body, fm(freq * 4.02, 0.05, { vel, ratio: 1, index: 0.2, t60: 0.12, attack: 0.001, release: 0.1, maxLen: 0.2 }), 0.06 * vel);
  for (let i = 0; i < body.length; i++) body[i] *= 0.45 * Math.pow(vel, 1.2);
  biquad(body, 'peaking', 3500, 0.9, -4);
  return body;
}
/** Bell (Chowning-style inharmonic FM, long ring). */
export function bell(freq, dur = 1, { vel = 0.6, seed = 1, t60 = 5 } = {}) {
  const b = fm(freq, dur, { vel, ratio: 1.4, index: 2.2, indexDecay: t60 * 0.25, indexSustain: 0.05, t60, attack: 0.001, release: t60 });
  addInto(b, fm(freq * 2.01, dur, { vel, ratio: 1, index: 0.3, t60: t60 * 0.4, attack: 0.001, release: t60 * 0.4 }), 0.25);
  for (let i = 0; i < b.length; i++) b[i] *= 0.3 * Math.pow(vel, 1.1);
  return b;
}
/** Soft electric piano (Rhodes-like 1:1 FM with a quick tine component). */
export function epiano(freq, dur = 1, { vel = 0.6, seed = 1 } = {}) {
  const t60 = clamp(4.5 * Math.pow(262 / freq, 0.4), 1, 7);
  const b = fm(freq, dur, { vel, ratio: 1, index: 0.9 + 1.4 * vel, indexDecay: 0.6, indexSustain: 0.15, t60, attack: 0.002, release: 0.35 });
  addInto(b, fm(freq, dur, { vel, ratio: 14, index: 0.6 * vel, indexDecay: 0.02, indexSustain: 0, t60: 0.3, attack: 0.001, release: 0.1, maxLen: 0.4 }), 0.18);
  for (let i = 0; i < b.length; i++) b[i] *= 0.4 * Math.pow(vel, 1.2);
  return b;
}
/** Glockenspiel: additive free-bar modes with a mallet click. */
export function glock(freq, dur = 0.5, { vel = 0.6, seed = 1 } = {}) {
  const modes = [[1, 1, 2.6], [2.76, 0.22, 0.6], [5.4, 0.07, 0.22], [8.93, 0.03, 0.1]];
  const n = len(2.8), out = new Float32Array(n);
  for (const [ratio, a, t] of modes) {
    const f = freq * ratio; if (f > SR * 0.45) continue;
    const w = TAU * f / SR, cw = Math.cos(w), sw = Math.sin(w), d = Math.pow(10, -3 / (t * Math.pow(1200 / freq, 0.3) * SR));
    let c = 1, s = 0, e = a;
    for (let i = 0; i < n && e > 1e-5; i++) { out[i] += s * e; const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc; e *= d; }
  }
  const click = noise(len(0.004), seed); biquad(click, 'highpass', 3000, 0.7);
  for (let i = 0; i < click.length; i++) out[i] += click[i] * 0.04 * Math.sin(Math.PI * i / click.length);
  for (let i = 0; i < n; i++) out[i] *= 0.4 * Math.pow(vel, 1.2);
  return fade(out, 0.0008, 0.03);
}

/**
 * Music box: a plucked steel comb tine. Clamped-free bar modes (1 : 6.27 : 17.55), a weak pair of bending modes a
 * fraction of a hertz apart (the slow shimmer of a real tine), a hard little pin 'tick', the box's small wooden body,
 * and each tine a few cents out of tune.
 */
export function musicBox(freq, dur = 1, { vel = 0.6, seed = 1, detune = 1 } = {}) {
  const r = rng(seed), f0 = freq * (1 + (r() - 0.5) * 9 * detune * CENT);
  const t60 = clamp(3.4 * Math.pow(523 / f0, 0.55), 0.9, 5.5), n = len(Math.max(dur, t60) + 0.05), out = new Float32Array(n);
  const modes = [[1, 1, t60], [1 + 0.9 / f0, 0.18, t60 * 0.8], [6.27, 0.22, t60 * 0.14], [17.55, 0.05, t60 * 0.05], [2.0, 0.025, t60 * 0.35]];
  for (const [ratio, a, t] of modes) {
    const f = f0 * ratio; if (f > SR * 0.45) continue;
    const w = TAU * f / SR, cw = Math.cos(w), sw = Math.sin(w), d = Math.pow(10, -3 / (t * SR));
    let c = 1, s = 0, e = a * (ratio > 3 ? 0.6 + 0.6 * vel : 1);
    for (let i = 0; i < n && e > 1e-5; i++) { out[i] += s * e; const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc; e *= d; }
  }
  const tick = noise(len(0.006), seed + 2); biquad(tick, 'highpass', 3500, 0.7); biquad(tick, 'peaking', 6500, 2, 6);
  for (let i = 0; i < tick.length; i++) out[i] += tick[i] * 0.2 * vel * Math.exp(-i / (0.0015 * SR));
  biquad(out, 'peaking', 420, 1.2, 4); biquad(out, 'peaking', 1300, 1.5, 2.5); biquad(out, 'highpass', 180, 0.7);
  const A = len(0.0006);
  for (let i = 0; i < n; i++) out[i] *= 0.38 * Math.pow(vel, 1.15) * (i < A ? i / A : 1);
  return fade(out, 0, 0.04);
}

// ---------------------------------------------------------------- piano (additive)

/**
 * Additive piano: inharmonic partials (stretched by B), each a pair of slightly detuned components with
 * prompt and aftersound decays (double decay, unison beating), velocity-dependent brightness, hammer
 * noise and soundboard thump, damper release after `dur` (set pedal: true to let it ring).
 */
export function piano(freq, dur = 1, { vel = 0.6, seed = 1, pedal = false, maxLen = 7 } = {}) {
  const midi = ftom(freq), r = rng(seed);
  const B = clamp(1.1e-4 * Math.pow(2, (midi - 48) / 13), 3e-5, 4e-3);
  const t60 = clamp(17 * Math.pow(130 / freq, 0.55), 1.0, 28), rate1 = 1 / t60;
  const tDamp = midi > 88 ? 0.8 : clamp(0.09 + 0.25 * (60 - midi) / 36, 0.07, 0.3);
  const gateS = pedal ? Math.min(maxLen, t60) : Math.min(dur, maxLen);
  const n = len(Math.min(maxLen, gateS + tDamp * 6.9 + 0.02)), out = new Float32Array(n);
  const p = 2.5 - 1.2 * vel, cutoff = 1000 + 4200 * vel * vel, fmax = Math.min(SR * 0.45, 11000);
  const parts = [];
  for (let k = 1; k <= 48; k++) {
    const fk = k * freq * Math.sqrt(1 + B * k * k) / Math.sqrt(1 + B);
    if (fk > fmax) break;
    let a = Math.pow(k, -p) * (0.2 + 0.8 * Math.abs(Math.sin(Math.PI * k * 0.118))) / (1 + (fk / cutoff) ** 2);
    if (k === 1 && freq < 160) a *= 0.45 + 0.55 * freq / 160;
    if (a < 0.002) continue;
    parts.push([fk, a, rate1 * (1 + 0.22 * (k - 1)) + 0.5 * (fk / 3000) ** 2]);
  }
  let norm = 0; for (const q of parts) norm += q[1] * q[1];
  const gain = 0.22 * Math.pow(vel, 1.25) / Math.sqrt(norm || 1);
  const lim = 1e-5;
  for (const [fk, a, rate] of parts) {
    const det = (0.2 + r() * 0.5) * CENT, ph = r() * TAU;
    for (const [mul, amp, rt] of [[1 + det, 0.6, rate * 2.6], [1 - det, 0.4, rate]]) {
      const w = TAU * fk * mul / SR, cw = Math.cos(w), sw = Math.sin(w), dk = Math.pow(10, -3 * rt / SR);
      let c = Math.cos(ph), s = Math.sin(ph), e = a * amp * gain;
      for (let i = 0; i < n && e > lim; i++) { out[i] += s * e; const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc; e *= dk; }
    }
  }
  // hammer: short band-passed noise burst + low soundboard thump
  const hn = len(0.03), h = noise(hn, seed + 7), th = noise(hn * 2, seed + 11);
  biquad(h, 'bandpass', clamp(freq * 3, 900, 5000), 0.8); biquad(th, 'lowpass', 220, 0.7);
  const hg = gain * 0.9 * vel, tg = gain * 1.6 * vel;
  for (let i = 0; i < hn * 2 && i < n; i++) {
    const t = i / SR;
    out[i] += (i < hn ? h[i] * hg * Math.exp(-t / (0.004 + 0.006 * (1 - vel))) : 0) + th[i] * tg * Math.exp(-t / 0.018);
  }
  // attack ramp and damper release
  const A = len(0.0015 + 0.002 * (1 - vel)), G = Math.round(gateS * SR), kd = Math.exp(-1 / (tDamp * SR));
  let rel = 1;
  for (let i = 0; i < n; i++) {
    if (i < A) out[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / A);
    if (i > G) { rel *= kd; out[i] *= rel; }
  }
  return fade(out, 0, 0.02);
}

// ---------------------------------------------------------------- wind (breathy legato line)

// harmonic amplitudes at full dynamic, how strongly upper harmonics fade at soft dynamics, breath level,
// attack/release (s), vibrato depth (cents) and rate (Hz), glide (s), extra tone shaping
export const TIMBRES = {
  flute: { h: [1, 0.55, 0.25, 0.12, 0.06, 0.03], soft: 1.0, breath: 0.22, chiff: 0.5, att: 0.06, rel: 0.22, vib: 14, trem: 0.12, rate: 5.0, glide: 0.03, lp: 7000, nf: 2600, swell: 0.14 },
  clarinet: { h: [1, 0.03, 0.42, 0.04, 0.2, 0.03, 0.09, 0.02, 0.04], soft: 1.6, breath: 0.05, chiff: 0.15, att: 0.05, rel: 0.2, vib: 3, trem: 0.02, rate: 5.0, glide: 0.035, lp: 2900, nf: 1500, swell: 0.05 },
  oboe: { h: [0.6, 1, 0.75, 0.5, 0.42, 0.25, 0.16, 0.1, 0.06], soft: 1.0, breath: 0.04, chiff: 0.12, att: 0.05, rel: 0.1, vib: 10, trem: 0.06, rate: 5.4, glide: 0.035, lp: 5000, nf: 2000, swell: 0.08 },
  horn: { h: [1, 0.85, 0.66, 0.48, 0.34, 0.24, 0.16, 0.11, 0.07, 0.05, 0.03], soft: 1.7, breath: 0.03, chiff: 0.1, att: 0.07, rel: 0.3, vib: 2.5, trem: 0.02, rate: 4.8, glide: 0.06, lp: 2700, nf: 700, swell: 0.2, scoop: 35 },
  // double reed: a weak fundamental, a dense harmonic series and fixed formants (~500 Hz and ~1.15 kHz) give the
  // dark, nasal, slightly buzzy bassoon colour in every register
  bassoon: { h: [0.8, 1, 0.78, 0.62, 0.5, 0.42, 0.34, 0.27, 0.21, 0.16, 0.12, 0.09, 0.07, 0.05], soft: 1.9, breath: 0.06, chiff: 0.45, att: 0.055, rel: 0.16, vib: 9, trem: 0.04, rate: 5.2, glide: 0.04, lp: 3000, nf: 1100, swell: 0.06, gain: 0.55,
    formants: [['peaking', 300, 1.2, 2.5], ['peaking', 480, 1.4, 6], ['peaking', 1100, 2.2, 2.5], ['peaking', 2500, 1.5, -5], ['highpass', 70, 0.7]] },
  // trombone-like brass for hits: very bright at forte, a hard tongued attack and a lip scoop; negative swell = fp decay
  brass: { h: [1, 0.95, 0.9, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45, 0.38, 0.32, 0.27, 0.22, 0.18, 0.15, 0.12, 0.1, 0.08], soft: 2.6, breath: 0.02, chiff: 0.4, att: 0.02, rel: 0.2, vib: 0, trem: 0, rate: 5, glide: 0.04, lp: 7000, nf: 1100, swell: -0.45, scoop: 45, gain: 0.2,
    formants: [['peaking', 1250, 1.1, 5], ['peaking', 2600, 1.6, 3], ['peaking', 520, 1.5, 2]] },
};
/**
 * Monophonic legato wind line. notes: [{ t, dur, freq, vel, slur }] (seconds from the line start, sorted).
 * Consecutive notes closer than 60 ms are joined: slurred notes glide, others get a soft tongued dip.
 * Model: phase-continuous harmonic tone (Chebyshev recursion) whose brightness follows the dynamic,
 * delayed-onset vibrato with matching tremolo, pitched + broadband breath noise and an attack 'chiff'.
 */
export function windLine(notes, { timbre = 'flute', seed = 1 } = {}) {
  const T = TIMBRES[timbre] || TIMBRES.flute;
  if (!notes.length) return new Float32Array(1);
  const last = notes[notes.length - 1], n = len(last.t + last.dur + T.rel * 3 + 0.05);
  const fT = new Float32Array(n), aT = new Float32Array(n), vibT = new Float32Array(n), chiff = new Float32Array(n), scoopT = new Float32Array(n);
  for (let j = 0; j < notes.length; j++) {
    const nt = notes[j], nx = notes[j + 1], s = Math.round(nt.t * SR);
    let e = Math.round((nt.t + nt.dur) * SR);
    const joined = nx && nx.t - (nt.t + nt.dur) < 0.06;
    if (joined) e = Math.round(nx.t * SR);
    const tongue = j > 0 && !nt.slur && notes[j - 1].t + notes[j - 1].dur > nt.t - 0.06;
    for (let i = Math.max(0, s); i < Math.min(n, e); i++) {
      const u = (i - s) / SR;
      fT[i] = nt.freq; aT[i] = nt.vel * (1 - T.swell + T.swell * clamp(u / Math.max(0.2, nt.dur), 0, 1));
      vibT[i] = nt.dur > 0.35 ? clamp((u - 0.22) / 0.45, 0, 1) : 0;
    }
    if (tongue) for (let i = Math.max(0, s - len(0.018)); i < Math.min(n, s + len(0.004)); i++) aT[i] *= 0.45;
    const fresh = j === 0 || !(notes[j - 1].t + notes[j - 1].dur > nt.t - 0.06);
    if (fresh || tongue) for (let i = 0; i < len(0.06) && s + i < n; i++) chiff[s + i] = nt.vel * Math.exp(-i / (0.018 * SR)) * (fresh ? 1 : 0.5);
    // brass players lip up into a fresh note: start a little flat and rise within ~50 ms
    if (T.scoop && (fresh || tongue)) for (let i = 0; i < len(0.12) && s + i < n; i++) scoopT[s + i] = -T.scoop * Math.exp(-i / (0.025 * SR));
  }
  // fill frequency gaps (rests) with the next note's pitch so attacks never glide from far away
  let nextF = notes[0].freq;
  for (let i = n - 1; i >= 0; i--) { if (fT[i] > 0) nextF = fT[i]; else fT[i] = nextF; }
  const amp = follower(aT, T.att / 3, T.rel / 3), ampN = follower(aT, T.att / 6, T.rel / 4), vib = smooth(vibT, 3);
  const lf = new Float64Array(n); { const k = Math.exp(-1 / (T.glide / 3 * SR)); let y = Math.log2(fT[0]); for (let i = 0; i < n; i++) { const x = Math.log2(fT[i]); y = x + (y - x) * k; lf[i] = y; } }
  const r = rng(seed), drift = noise1(seed % 9973), wob = noise1((seed + 3) % 9973);
  const out = new Float32Array(n), H = T.h, nh = H.length;
  let ph = 0, vph = r() * TAU;
  const bp = new Biquad('bandpass', 440, 9), bp2 = new Biquad('bandpass', 880, 9), hiss = new Biquad('bandpass', T.nf, 0.6), w = noise(n, seed + 1);
  let rate = T.rate, dr = 0, bstep = 1;
  for (let i = 0; i < n; i++) {
    const a = amp[i];
    if ((i & 31) === 0) {
      const t = i / SR;
      rate = T.rate * (1 + 0.05 * (wob(t * 0.7) - 0.5)); dr = 4 * (drift(t * 0.5) - 0.5);
      bstep = Math.sqrt(Math.pow(clamp(a, 0.02, 1), T.soft));          // each harmonic up is this much softer at low dynamics
    }
    vph += TAU * rate / SR; if (vph > TAU) vph -= TAU;
    const cents = T.vib * vib[i] * Math.sin(vph) + dr + scoopT[i];
    const f = Math.pow(2, lf[i]) * (1 + cents * CENT);
    ph += f / SR; if (ph > 1) ph -= 1;
    const x = TAU * ph, s1 = Math.sin(x), c2 = 2 * Math.cos(x);
    let sk1 = s1, sk2 = 0, tone = 0, bk = 1;
    for (let k = 1; k <= nh; k++) {
      if (k * f > SR * 0.45) break;
      tone += H[k - 1] * bk * sk1; bk *= bstep;
      const sk = c2 * sk1 - sk2; sk2 = sk1; sk1 = sk;
    }
    if ((i & 31) === 0) { bp.set('bandpass', f, 9); bp2.set('bandpass', Math.min(SR * 0.4, 2 * f), 9); }
    const nz = w[i], hs = hiss.tick(nz);
    // breath follows a faster envelope than the tone, so the air is heard just before the note speaks
    const breath = T.breath * ampN[i] * (1.8 * bp.tick(nz) + 0.9 * bp2.tick(nz) + 0.5 * hs) + T.breath * T.chiff * chiff[i] * hs;
    const trem = 1 + T.trem * vib[i] * Math.sin(vph + 0.6);
    out[i] = 0.3 * tone * a * trem + breath;
  }
  biquad(out, 'lowpass', T.lp, 0.6);
  for (const [type, f, q, g] of T.formants || []) biquad(out, type, f, q, g || 0);
  if (T.gain) for (let i = 0; i < n; i++) out[i] *= T.gain;
  dcBlock(out);
  return fade(out, 0.002, 0.03);
}
/** A single breathy flute note. */
export const flute = (freq, dur = 1, { vel = 0.6, seed = 1, timbre = 'flute' } = {}) => windLine([{ t: 0, dur, freq, vel }], { timbre, seed });

// ---------------------------------------------------------------- solo bowed strings (legato line)

// body: wood and air resonances [Hz, Q, dB] plus a sparse 'body impulse response' (size scales its taps): together an
// irregular comb of peaks and dips. Vibrato sweeps each harmonic across them, so every partial flickers at the
// vibrato rate: the shimmer that separates a real violin or cello from a filtered saw. vib (cents) / rate (Hz),
// attack / release (s), glide (s, stepwise slurs), port (s, slurred leaps: an audible expressive shift), hp / lp (Hz),
// noise (rosin level), bright (how far the tone opens with bow pressure)
export const BOWED = {
  violin: { body: [[285, 8, 5], [410, 7, -4], [480, 8, 4], [560, 9, 4], [700, 6, -3], [860, 7, 2], [1060, 6, 2.5], [1320, 7, -3], [1650, 5, 2], [2100, 4, 2.5], [2700, 3, 2], [3500, 4, -4], [4600, 3, -6]],
    size: 1, hp: 190, lp: 6200, vib: 17, rate: 5.6, att: 0.09, rel: 0.4, glide: 0.028, port: 0.1, noise: 0.06, bright: 0.72 },
  viola: { body: [[230, 7, 5], [330, 7, -4], [395, 8, 4], [470, 8, 3], [590, 6, -3], [730, 7, 2.5], [900, 6, 2.5], [1120, 6, -3], [1400, 5, 2], [1800, 4, 2.5], [2350, 3, 2], [3100, 4, -4], [4200, 3, -6]],
    size: 1.25, hp: 120, lp: 5500, vib: 16, rate: 5.4, att: 0.1, rel: 0.45, glide: 0.032, port: 0.11, noise: 0.06, bright: 0.68 },
  cello: { body: [[100, 5, 5], [150, 6, 3], [205, 7, 4], [250, 7, -3], [315, 6, 4], [410, 5, -2.5], [530, 5, 3], [690, 5, -3], [880, 4, 2], [1180, 4, 2.5], [1600, 3, 2], [2300, 3, -4], [3300, 3, -7]],
    size: 2.3, hp: 58, lp: 4600, vib: 15, rate: 5.2, att: 0.11, rel: 0.5, glide: 0.035, port: 0.13, noise: 0.065, bright: 0.66 },
};
const BODY_IR = new Map();
/** Sparse body impulse response for a timbre: [delay (samples), gain] taps, fixed per instrument. */
function bodyIR(name, size) {
  if (BODY_IR.has(name)) return BODY_IR.get(name);
  const r = rng(mixSeed('body', name)), taps = [];
  let norm = 1;
  for (let k = 0; k < 14; k++) {
    const ms = (0.12 + 5.2 * Math.pow(r(), 1.4)) * size, g = (r() < 0.5 ? -1 : 1) * 0.5 * Math.exp(-ms / (1.9 * size)) * (0.55 + 0.45 * r());
    taps.push([Math.max(1, Math.round(ms * SR / 1000)), g]); norm += g * g;
  }
  const out = { taps, g0: 1 / Math.sqrt(norm), max: Math.max(...taps.map(t => t[0])) + 1 };
  BODY_IR.set(name, out);
  return out;
}
/**
 * Monophonic legato bowed line (solo violin / viola / cello). notes: [{ t, dur, freq, vel, slur }] (seconds, sorted).
 * Slurred notes keep the bow moving (finger glide for steps, a slower expressive shift for leaps); unslurred
 * contiguous notes get a bow change (a soft dip, a little scratch and rosin). Model: band-limited Helmholtz saw with
 * a drifting bow-position comb; a scratchy, slightly unstable onset while the Helmholtz motion establishes; cycle
 * jitter and bow-pressure flutter; brightness that follows bow pressure; pitch-synchronous rosin noise; per-note
 * vibrato (delayed, its own rate and depth, slightly asymmetric) that deepens with the dynamic; intonation drift;
 * then the instrument's body (resonances + sparse body response) and a ringing release.
 */
export function bowedLine(notes, { timbre = 'cello', seed = 1 } = {}) {
  const T = BOWED[timbre] || BOWED.cello;
  if (!notes.length) return new Float32Array(1);
  const last = notes[notes.length - 1], n = len(last.t + last.dur + T.rel * 2.5 + 0.08), rn = rng(seed + 31);
  const fT = new Float32Array(n), aT = new Float32Array(n), vibT = new Float32Array(n), glT = new Float32Array(n).fill(T.glide), bite = new Float32Array(n), scoopT = new Float32Array(n);
  const vRate = new Float32Array(n).fill(1), vDep = new Float32Array(n).fill(1);
  for (let j = 0; j < notes.length; j++) {
    const nt = notes[j], nx = notes[j + 1], pv = notes[j - 1], s = Math.round(nt.t * SR);
    let e = Math.round((nt.t + nt.dur) * SR);
    if (nx && nx.t - (nt.t + nt.dur) < 0.05) e = Math.round(nx.t * SR);
    const joined = pv && pv.t + pv.dur > nt.t - 0.05, fresh = !joined, change = joined && !nt.slur;
    const leap = joined && Math.abs(12 * Math.log2(nt.freq / pv.freq)) >= 3;
    const delay = 0.12 + 0.16 * rn(), rf = 1 + (rn() - 0.5) * 0.1, df = 0.75 + 0.5 * rn();
    // a long note swells a little and eases off (messa di voce); the bow speed carries the dynamic
    for (let i = Math.max(0, s); i < Math.min(n, e); i++) {
      const u = (i - s) / SR, w = clamp(u / Math.max(0.3, nt.dur), 0, 1);
      fT[i] = nt.freq; aT[i] = nt.vel * (nt.dur > 0.8 ? 0.88 + 0.16 * Math.sin(Math.PI * w) - 0.06 * w : 1);
      vibT[i] = nt.dur > 0.3 ? clamp((u - delay) / 0.45, 0, 1) : 0; vRate[i] = rf; vDep[i] = df;
    }
    // slurred leap: the finger slides (portamento) over the first part of the new note
    if (joined && nt.slur && leap) for (let i = Math.max(0, s - len(0.02)); i < Math.min(n, s + len(T.port)); i++) glT[i] = T.port;
    if (change) for (let i = Math.max(0, s - len(0.045)); i < Math.min(n, s + len(0.01)); i++) aT[i] *= 0.72;
    if (fresh || change) for (let i = 0; i < len(0.1) && s + i < n; i++) bite[s + i] = Math.max(bite[s + i], nt.vel * Math.exp(-i / (0.022 * SR)) * (fresh ? 1 : 0.5));
    if (fresh) for (let i = 0; i < len(0.12) && s + i < n; i++) scoopT[s + i] = -12 * Math.exp(-i / (0.035 * SR));
  }
  let nextF = notes[0].freq;
  for (let i = n - 1; i >= 0; i--) { if (fT[i] > 0) nextF = fT[i]; else fT[i] = nextF; }
  const amp = follower(aT, T.att / 3, T.rel / 2.5), vib = smooth(vibT, 3), vr = smooth(vRate, 4), vd = smooth(vDep, 2);
  const r = rng(seed), drift = noise1(seed % 9973), wob = noise1((seed + 5) % 9973), dep = noise1((seed + 11) % 9973), bpos = noise1((seed + 17) % 9973);
  const jit = noise1((seed + 23) % 9973), flut = noise1((seed + 29) % 9973), scr = noise1((seed + 37) % 9973);
  const out = new Float32Array(n), w = noise(n, seed + 1), hiss = new Biquad('bandpass', 2400, 0.7), rosin = new Biquad('bandpass', 3600, 0.9);
  const lpA = new Biquad('lowpass', 3000, 0.6), lpB = new Biquad('lowpass', 3000, 0.55);
  let lf = Math.log2(fT[0]), ph = r(), vph = r() * TAU, rate = T.rate, depth = T.vib, dr = 0, beta = 0.11;
  for (let i = 0; i < n; i++) {
    const t = i / SR, b = bite[i];
    if ((i & 31) === 0) {
      rate = T.rate * vr[i] * (1 + 0.06 * (wob(t * 0.7) - 0.5)); depth = T.vib * vd[i] * (0.8 + 0.4 * dep(t * 0.5)); dr = 5 * (drift(t * 0.35) - 0.5);
      beta = 0.085 + 0.05 * bpos(t * 0.3);
      const fc = Math.min(T.lp, Math.pow(2, lf) * (2 + 8 * T.bright * Math.pow(clamp(amp[i], 0, 1), 0.8)) + 600 + 1500 * b);
      lpA.set('lowpass', fc, 0.6); lpB.set('lowpass', fc * 1.25, 0.55);
    }
    const a = amp[i] * (1 + 0.025 * (flut(t * 31) - 0.5));
    const x = Math.log2(fT[i]), k = Math.exp(-1 / (glT[i] / 3 * SR));
    lf = x + (lf - x) * k;
    vph += TAU * rate / SR; if (vph > TAU) vph -= TAU;
    const vv = Math.sin(vph) + 0.12 * Math.sin(2 * vph + 0.7);
    const cents = depth * (0.7 + 0.5 * Math.min(1, amp[i] * 1.4)) * vib[i] * vv + dr + 3.2 * (jit(t * 85) - 0.5) + scoopT[i] + 40 * b * (scr(t * 260) - 0.5);
    const f = Math.pow(2, lf) * (1 + cents * CENT), dt = Math.min(0.49, f / SR);
    ph += dt; if (ph >= 1) ph -= 1;
    const q = ph + beta - Math.floor(ph + beta);
    const saw = 2 * ph - 1 - polyBlep(ph, dt), saw2 = 2 * q - 1 - polyBlep(q, dt);
    const src = saw - 0.32 * saw2;                                              // bow-position comb
    const slip = ph < 0.12 ? 1 : 0.18, nz = w[i], hs = hiss.tick(nz);
    const noiseOut = T.noise * a * (rosin.tick(nz) * slip * 1.6 + 0.22 * hs) + T.noise * 4 * b * hs;
    out[i] = lpB.tick(lpA.tick(src)) * a * 0.32 + noiseOut;
  }
  // body: sparse impulse response (in place, from the end so taps read unmodified input), then resonances
  const ir = bodyIR(timbre, T.size), tp = ir.taps;
  for (let i = n - 1; i >= 0; i--) { let y = out[i]; for (let k = 0; k < tp.length; k++) { const j = i - tp[k][0]; if (j >= 0) y += tp[k][1] * out[j]; } out[i] = y * ir.g0; }
  for (const [f, q, g] of T.body) biquad(out, 'peaking', f, q, g);
  biquad(out, 'highpass', T.hp, 0.7); biquad(out, 'lowpass', T.lp * 1.15, 0.7); dcBlock(out);
  return fade(out, 0.002, 0.03);
}

// ---------------------------------------------------------------- bowed string ensemble and pads

/**
 * String section note: detuned band-limited saws with independent vibrato and drift (ensemble chorus),
 * slow bowed attack, a 24 dB lowpass that opens with the bow, bow noise, optional tremolo.
 * short: true gives a spiccato / staccato stroke.
 */
export function strings(freq, dur = 1, { vel = 0.6, seed = 1, attack, release, voices = 5, detune = 9, bright = 1, tremolo = 0, short = false, vibrato = 1, expr = 0 } = {}) {
  attack = attack ?? (short ? 0.012 : 0.22 + 0.25 * (1 - vel));
  release = release ?? (short ? 0.12 : 0.45);
  const gate = short ? Math.min(dur, 0.16) : dur;
  const n = len(gate + release * 1.4 + 0.07), r = rng(seed), out = new Float32Array(n), envSum = new Float32Array(n);
  // each player bows a little late or early, with their own attack speed, level, vibrato and intonation drift
  for (let v = 0; v < voices; v++) {
    const det = ((voices > 1 ? v / (voices - 1) : 0.5) - 0.5) * 2 * detune + (r() - 0.5) * 4;
    const vr = 4.6 + r() * 1.3, vd = (6 + r() * 7) * vibrato, dr = noise1(mixSeed(seed, v) % 9973), tph = r();
    const off = Math.round(r() * (short ? 0.006 : 0.03) * SR), lvl = 0.8 + 0.35 * r(), von = 0.2 + r() * 0.25, scoop = short ? 0 : 4 + r() * 8;
    const env = adsr(n, { a: attack * (0.75 + 0.55 * r()), d: short ? 0.08 : 0.4, s: short ? 0.5 : 0.85, r: release * (0.85 + 0.3 * r()), gate: gate - off / SR, curve: 3 });
    let p = r(), q = tph, drift = 0;
    const ph0 = r() * TAU, cw = Math.cos(TAU * vr / SR), sw = Math.sin(TAU * vr / SR);
    let vc = Math.cos(ph0), vs = Math.sin(ph0);
    const trate = tremolo ? tremolo * (0.9 + r() * 0.2) / SR : 0;
    for (let i = off; i < n; i++) {
      const j = i - off, e = env[j] * lvl;
      if ((j & 31) === 0) drift = det + 9 * (dr(j / SR * 0.8) - 0.5);
      const nv = vs * cw + vc * sw; vc = vc * cw - vs * sw; vs = nv;
      const von2 = j / SR - von, c = drift - scoop * Math.exp(-j / (0.07 * SR)) + (von2 > 0 ? vd * Math.min(1, von2 * 2) * vs : 0);
      const dt = freq * (1 + c * CENT) / SR;
      let x = 2 * p - 1 - polyBlep(p, dt);
      if (trate) { q += trate; if (q >= 1) q -= 1; x *= 0.45 + 0.55 * Math.sqrt(Math.sin(Math.PI * q)); }
      out[i] += x * e; envSum[i] += e;
      p += dt; if (p >= 1) p -= 1;
    }
  }
  const base = Math.min(7500, freq * (2.2 + 3 * vel * bright) + 500 + 900 * bright);
  const f1 = new Biquad('lowpass', base, 0.6), f2 = new Biquad('lowpass', base, 0.55), hp = new Biquad('highpass', Math.min(90, freq * 0.6), 0.7);
  const bow = noise(n, seed + 99), bf = new Biquad('bandpass', 2600, 0.7), pres = noise1(mixSeed(seed, 77) % 9973);
  const g = 0.5 / Math.sqrt(voices) * Math.pow(vel, 1.1), A = attack * SR * 1.6, inv = 1 / (voices * 0.85), GS = gate * SR;
  for (let i = 0; i < n; i++) {
    const e = envSum[i] * inv;
    if (expr) { const u = Math.min(1, i / GS); envSum[i] = 1 + expr * (Math.sin(Math.PI * u) - 0.5); }
    if ((i & 63) === 0) { const fc = base * (0.45 + 0.55 * Math.min(1, e)); f1.set('lowpass', fc, 0.6); f2.set('lowpass', fc, 0.55); }
    // rosin / bow noise: strong while the bow bites in, then a faint, slowly varying hiss
    const bn = bf.tick(bow[i]) * (i < A ? (short ? 0.32 : 0.16) * (1 - i / A) + 0.045 : 0.045) * (0.6 + 0.8 * pres(i / SR * 3));
    out[i] = (hp.tick(f2.tick(f1.tick(out[i]))) + bn * e) * g * (expr ? envSum[i] : 1);
  }
  // irregular wooden body resonances (violin family; scaled down for the cello / bass register): this uneven
  // comb of peaks and dips is what separates a bowed string from a smooth synth saw
  const k = freq < 180 ? 0.55 : freq < 300 ? 0.75 : 1;
  for (const [f, q, gdb] of [[275, 2, 3], [430, 2.2, -2], [690, 2.5, 2], [1120, 2, -1.5], [1650, 2.5, 2], [2450, 2, 1], [3300, 1.5, -3.5]]) biquad(out, 'peaking', f * k, q, gdb);
  return fade(out, 0.002, 0.02);
}

const VOWELS = { oo: [[320, 1], [800, 0.3], [2500, 0.08]], oh: [[450, 1], [800, 0.45], [2830, 0.1]], ah: [[730, 1], [1090, 0.5], [2440, 0.18]] };
/**
 * Soft pad. vowel: null → warm detuned saw/triangle pad with a slowly breathing lowpass;
 * 'oo' | 'oh' | 'ah' → formant 'choir' pad. detune: cents between the oscillators (default 6 for the pad, 4 for
 * the choir; smaller is calmer, e.g. under a held melody note).
 */
export function pad(freq, dur = 2, { vel = 0.5, seed = 1, attack = 0.9, release = 1.2, vowel = null, bright = 0.5, expr = 0, detune = null } = {}) {
  const n = len(dur + release * 1.3 + 0.05), r = rng(seed), src = new Float32Array(n);
  const env = adsr(n, { a: attack, d: 0.6, s: 0.9, r: release, gate: dur, curve: 2.5 });
  if (expr) { const GS = dur * SR; for (let i = 0; i < n; i++) env[i] *= 1 + expr * (Math.sin(Math.PI * Math.min(1, i / GS)) - 0.5); }
  const V = vowel ? 6 : 3;
  for (let v = 0; v < V; v++) {
    const dz = detune ?? (vowel ? 4 : 6), det = (v - (V - 1) / 2) * dz + (r() - 0.5) * 3 * dz / 6, vr = 4.4 + r() * 1.4, vd = vowel ? 7 + r() * 8 : 0, von = 0.2 + r() * 0.6;
    const sh = vowel ? 'saw' : v === 1 ? 'triangle' : 'saw', dr = noise1(mixSeed(seed, v, 3) % 9973);
    let p = r(), drift = 0;
    const ph0 = r() * TAU, cw = Math.cos(TAU * vr / SR), sw = Math.sin(TAU * vr / SR), saw = sh === 'saw';
    let vc = Math.cos(ph0), vs = Math.sin(ph0);
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) drift = det + dz * (dr(i / SR * 0.5) - 0.5);
      const nv = vs * cw + vc * sw; vc = vc * cw - vs * sw; vs = nv;
      const dt = freq * (1 + (drift + (vd ? vd * vs * clamp(i / SR - von, 0, 1) : 0)) * CENT) / SR;
      src[i] += saw ? 2 * p - 1 - polyBlep(p, dt) : (4 * Math.abs(p - 0.5) - 1) * 1.4;
      p += dt; if (p >= 1) p -= 1;
    }
  }
  const out = new Float32Array(n);
  if (vowel) {
    const fs = VOWELS[vowel] || VOWELS.oo;
    const br = noise(n, seed + 5);
    for (let k = 0; k < fs.length; k++) {
      const [ff, g] = fs[k], b = new Biquad('bandpass', ff, ff / 90 + 2), wan = noise1(mixSeed(seed, k, 41) % 9973);
      for (let i = 0; i < n; i++) {
        if ((i & 63) === 0) b.set('bandpass', ff * (1 + 0.08 * (wan(i / SR * 0.35) - 0.5)), ff / 90 + 2);
        out[i] += b.tick(src[i] + br[i] * 0.35) * g;
      }
    }
    for (let i = 0; i < n; i++) out[i] = out[i] * 1.2 * env[i] * 0.5 * vel / Math.sqrt(V);
    biquad(out, 'highpass', 120, 0.7);
  } else {
    const lp = new Biquad('lowpass', 800, 0.7), lp2 = new Biquad('lowpass', 800, 0.6), lfo = r() * TAU;
    const base = Math.min(5000, freq * 2 + 300 + 1400 * bright);
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) { const fc = base * (0.75 + 0.25 * Math.sin(lfo + TAU * 0.11 * i / SR)) * (0.6 + 0.4 * env[i]); lp.set('lowpass', fc, 0.7); lp2.set('lowpass', fc, 0.6); }
      out[i] = lp2.tick(lp.tick(src[i])) * env[i] * 0.5 * vel / Math.sqrt(V);
    }
  }
  return fade(out, 0.005, 0.03);
}

// ---------------------------------------------------------------- percussion (soft, orchestral)

/** Soft kick / concert bass drum (tone: 'soft' | 'concert'). */
export function kick(vel = 0.7, { seed = 1, tone = 'soft' } = {}) {
  const concert = tone === 'concert', n = len(concert ? 1.6 : 0.7), out = new Float32Array(n);
  const f0 = concert ? 90 : 115, f1 = concert ? 52 : 50, tp = concert ? 0.05 : 0.035, ta = concert ? 0.5 : 0.2;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / tp);
    ph += f / SR;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t / ta) * (1 - Math.exp(-t / 0.002));
  }
  const nz = noise(len(concert ? 0.5 : 0.08), seed); biquad(nz, 'lowpass', concert ? 160 : 900, 0.7);
  for (let i = 0; i < nz.length; i++) out[i] += nz[i] * (concert ? 0.5 : 0.25) * Math.exp(-i / SR / (concert ? 0.12 : 0.008));
  for (let i = 0; i < n; i++) out[i] *= 0.6 * Math.pow(vel, 1.3);
  return fade(out, 0.0005, 0.05);
}
/** Timpani stroke: tuned membrane modes with a small strike pitch glide and mallet noise. */
export function timpani(freq, vel = 0.7, { seed = 1, len: L = 2.6 } = {}) {
  const modes = [[0.628, 0.9, 0.22], [1, 1.2, 2.4], [1.504, 0.5, 1.4], [1.742, 0.25, 1.0], [2.0, 0.3, 0.9], [2.245, 0.15, 0.6], [2.494, 0.12, 0.5], [2.8, 0.06, 0.35]];
  const n = len(L), out = new Float32Array(n), r = rng(seed);
  for (const [ratio, a, t60] of modes) {
    let ph = r(), e = a, i = 0;
    const d = Math.pow(10, -3 / (t60 * SR)), gEnd = Math.min(n, len(0.4)), kg = Math.exp(-1 / (0.06 * SR));
    let gl = 0.04 * vel;
    for (; i < gEnd && e > 1e-5; i++) { ph += freq * ratio * (1 + gl) / SR; gl *= kg; out[i] += Math.sin(TAU * ph) * e; e *= d; }
    const w = TAU * freq * ratio * (1 + gl) / SR, cw = Math.cos(w), sw = Math.sin(w);
    let c = Math.cos(TAU * ph), s = Math.sin(TAU * ph);
    for (; i < n && e > 1e-5; i++) { const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc; out[i] += s * e; e *= d; }
  }
  const nz = noise(len(0.06), seed + 1); biquad(nz, 'lowpass', 700 + 900 * vel, 0.7);
  for (let i = 0; i < nz.length; i++) out[i] += nz[i] * 0.5 * Math.exp(-i / SR / 0.01);
  const A = len(0.002);
  for (let i = 0; i < n; i++) out[i] *= 0.32 * Math.pow(vel, 1.3) * (i < A ? i / A : 1);
  return fade(out, 0, 0.05);
}
/** Timpani roll: alternating strokes ~16 per second with a velocity ramp from v0 to v1. */
export function timpaniRoll(freq, dur = 1.5, { seed = 1, v0 = 0.15, v1 = 0.7 } = {}) {
  const n = len(dur + 2.6), out = new Float32Array(n), r = rng(seed);
  for (let t = 0, k = 0; t < dur; t += 1 / (15 + r() * 2), k++) {
    const u = t / dur, v = (v0 + (v1 - v0) * u * u) * (k % 2 ? 0.85 : 1) * (0.9 + 0.2 * r());
    addInto(out.subarray(Math.round(t * SR)), timpani(freq, v, { seed: seed + k, len: 1.2 }), 0.55);
  }
  return out;
}
/** Shaker grain (len = seconds of the shake). */
export function shaker(vel = 0.5, { seed = 1, len: L = 0.09 } = {}) {
  const n = len(L + 0.06), out = noise(n, seed), r = rng(seed + 1);
  biquad(out, 'highpass', 4200, 0.7); biquad(out, 'bandpass', 7800, 1.1);
  const A = L * 0.35, grain = new OnePole(900);
  let gr = 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = t < A ? Math.pow(t / A, 1.5) : Math.exp(-(t - A) / (L * 0.4));
    if (i % 48 === 0) gr = 0.55 + 0.45 * r();
    out[i] *= e * grain.lp(gr) * 0.9 * vel;
  }
  return fade(out, 0.001, 0.01);
}
/** Brush on a snare: a tap or a sweep. */
export function brush(vel = 0.5, { seed = 1, sweep = false, len: L } = {}) {
  L = L ?? (sweep ? 0.45 : 0.12);
  const n = len(L + 0.1), out = noise(n, seed, 'white');
  biquad(out, 'bandpass', sweep ? 2600 : 3400, 0.6); biquad(out, 'lowpass', 9000, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = sweep ? Math.sin(Math.PI * clamp(t / L, 0, 1)) ** 1.5 : (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / 0.045);
    out[i] *= e * 0.8 * vel;
  }
  return fade(out, 0.001, 0.02);
}
/** Wood block / temple-block knock. */
export function woodblock(freq = 880, vel = 0.5, { seed = 1 } = {}) {
  const n = len(0.18), out = new Float32Array(n);
  for (const [ratio, a, tau] of [[1, 1, 0.035], [2.71, 0.3, 0.015], [4.9, 0.06, 0.008]]) {
    const w = TAU * freq * ratio / SR;
    for (let i = 0; i < n; i++) out[i] += Math.sin(w * i) * a * Math.exp(-i / SR / tau);
  }
  const nz = noise(len(0.004), seed); biquad(nz, 'bandpass', 3000, 0.8);
  for (let i = 0; i < nz.length; i++) out[i] += nz[i] * 0.3 * Math.sin(Math.PI * i / nz.length);
  for (let i = 0; i < n; i++) out[i] *= 0.35 * Math.pow(vel, 1.2);
  return fade(out, 0.002, 0.02);
}
/** Soft-mallet suspended-cymbal swell reaching its peak at `dur`, then a gentle decay. */
export function swell(dur = 1.5, vel = 0.5, { seed = 1, decay = 1.2 } = {}) {
  const n = len(dur + decay * 1.5), out = noise(n, seed);
  biquad(out, 'highpass', 2200, 0.7); biquad(out, 'peaking', 6500, 0.8, 5); biquad(out, 'lowpass', 12000, 0.7);
  const shim = noise(n, seed + 2); biquad(shim, 'bandpass', 9500, 3);
  // metallic shimmer: a cluster of inharmonic partials with slow beating, like the bronze modes of a cymbal
  const r = rng(seed + 9), metal = new Float32Array(n);
  for (let k = 0; k < 28; k++) {
    const f = 2600 * Math.pow(4.2, r()), w = TAU * f / SR, am = 0.5 + r(), ar = 0.5 + r() * 3, ph = r() * TAU, cw = Math.cos(w), sw = Math.sin(w);
    let c = Math.cos(ph), s = Math.sin(ph), g = am;
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) g = am * (0.7 + 0.3 * Math.sin(TAU * ar * i / SR + ph));
      metal[i] += s * g; const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc;
    }
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = t < dur ? Math.pow(t / dur, 2.4) : Math.exp(-(t - dur) / (decay / 3));
    out[i] = (out[i] + shim[i] * 0.6 + metal[i] * 0.012) * e * 0.35 * vel;
  }
  return fade(out, 0.01, 0.05);
}

/**
 * Suspended cymbal struck with soft mallets. A bank of ~90 inharmonic bronze modes (log-spread 300 Hz–12 kHz, the
 * highs dying sooner, each split into a slowly beating pair) is excited by every stroke in `strokes`
 * ([[t (s), vel], …]; default one stroke at 0), plus a felt-mallet thump and a little high wash per stroke.
 * decay = seconds for the body to die away. A single stroke is a soft crash; a dense train is a roll.
 */
export function cymbal(vel = 0.6, { seed = 1, decay = 3, strokes = null, attack = 0.006 } = {}) {
  strokes = strokes || [[0, vel]];
  const tEnd = Math.max(...strokes.map(s => s[0])), n = len(tEnd + decay * 1.25 + 0.1), out = new Float32Array(n), r = rng(seed + 9);
  const hits = new Float32Array(n);
  for (const [t, v] of strokes) { const i = Math.round(t * SR); if (i < n) hits[i] += Math.pow(clamp(v, 0, 1), 1.2); }
  const A = Math.max(1, len(attack)), lastHit = Math.round(tEnd * SR);
  for (let k = 0; k < 90; k++) {
    const f = 300 * Math.pow(40, Math.pow(r(), 0.8)), am = (0.35 + r()) * Math.pow(f / 2000, -0.15) * (f < 900 ? 0.5 : 1);
    if (f > SR * 0.45) continue;
    const tk = decay * (0.35 + 0.65 * r()) * Math.pow(1800 / f, 0.45), dk = Math.pow(10, -3 / (tk * SR)), beat = 0.3 + 2.2 * r();
    for (const [mul, g0] of [[1, 1], [1 + beat / f, 0.6]]) {
      const w = TAU * f * mul / SR, cw = Math.cos(w), sw = Math.sin(w);
      let c = Math.cos(r() * TAU), sn = Math.sin(r() * TAU), e = 0, ex = 0;
      for (let i = 0; i < n; i++) {
        if (hits[i]) ex += hits[i] * am * g0;
        if (ex > 0) { const take = ex / A * 2; e += take; ex = Math.max(0, ex - take); }   // the mallet pushes energy in over `attack`
        if (e > 1e-6) out[i] += sn * e; else if (i > lastHit + A) break;
        const nc = c * cw - sn * sw; sn = sn * cw + c * sw; c = nc; e *= dk;
      }
    }
  }
  // felt thump and a breath of high wash on each stroke
  const thump = noise(n, seed + 3), wash = noise(n, seed + 4);
  biquad(thump, 'lowpass', 380, 0.7); biquad(wash, 'highpass', 6500, 0.7);
  const kt = Math.exp(-1 / (0.02 * SR)), kw = Math.exp(-1 / (0.25 * SR));
  let et = 0, ew = 0;
  for (let i = 0; i < n; i++) { if (hits[i]) { et += hits[i]; ew += hits[i]; } out[i] = out[i] * 0.02 + thump[i] * et * 0.25 + wash[i] * ew * 0.06; et *= kt; ew *= kw; }
  biquad(out, 'highpass', 160, 0.7);
  for (let i = 0; i < n; i++) out[i] *= 1.1;
  return fade(out, 0.001, 0.08);
}
/** Soft-mallet cymbal roll: alternating strokes ~14 per second, velocity rising v0 → v1 over `dur`, then ringing. */
export function cymbalRoll(dur = 1.5, { seed = 1, v0 = 0.08, v1 = 0.7, decay = 2.5 } = {}) {
  const r = rng(seed + 1), strokes = [];
  for (let t = 0, k = 0; t < dur; t += 1 / (13 + 3 * r()), k++) { const u = t / dur; strokes.push([t, (v0 + (v1 - v0) * u * u) * (k % 2 ? 0.88 : 1) * (0.9 + 0.2 * r())]); }
  return cymbal(1, { seed, decay, strokes, attack: 0.008 });
}

// ---------------------------------------------------------------- effects

/** Ping-pong stereo delay. Returns the wet signal only. */
export function delay(input, { time = 0.375, feedback = 0.35, lp = 3500, spread = 1 } = {}) {
  const inL = input.L || input, inR = input.R || input, n = inL.length, D = len(time);
  const out = stereo(n), bL = new Float32Array(D), bR = new Float32Array(D), fL = new OnePole(lp), fR = new OnePole(lp);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const dl = bL[j], dr = bR[j];
    out.L[i] = dl; out.R[i] = dr;
    const m = (inL[i] + inR[i]) * 0.5;
    bL[j] = fL.lp(m * (1 - spread * 0.5) + dr * feedback);
    bR[j] = fR.lp(m * spread * 0.5 + dl * feedback);
    j = j + 1 === D ? 0 : j + 1;
  }
  return out;
}

/**
 * Algorithmic hall: band-limited input → pre-delay → 4 allpass diffusers per channel → 8-line feedback delay
 * network (Hadamard mixing, per-line damping tuned to decay (RT60) and hfDecay, slow delay modulation to avoid
 * metallic ringing) → decorrelated stereo taps. Returns the wet signal only, same length as the input.
 */
export function reverb(input, { decay = 2.4, hfDecay = 0.45, predelay = 0.02, size = 1, lowCut = 160, highCut = 7000, mod = 1 } = {}) {
  const inL = input.L || input, inR = input.R || input, n = inL.length, out = stereo(n);
  const pre = Math.max(1, len(predelay)), pL = new Float32Array(pre), pR = new Float32Array(pre);
  const hL = new Biquad('highpass', lowCut, 0.6), hR = new Biquad('highpass', lowCut, 0.6), lL = new Biquad('lowpass', highCut, 0.6), lR = new Biquad('lowpass', highCut, 0.6);
  const mkAp = (ms) => ({ b: new Float32Array(Math.max(1, Math.round(ms * SR / 1000))), i: 0 });
  const apsL = [4.77, 3.59, 12.73, 9.31].map(mkAp), apsR = [4.93, 3.71, 13.07, 8.87].map(mkAp);
  const ap = (a, x, g) => { const d = a.b[a.i], y = -g * x + d; a.b[a.i] = x + g * y; a.i = a.i + 1 === a.b.length ? 0 : a.i + 1; return y; };
  const ms = [31.3, 37.1, 41.9, 47.3, 53.9, 61.1, 67.3, 73.7].map(x => x * size);
  const N = 8, lines = [], gains = [], poles = [], lens = [];
  for (let k = 0; k < N; k++) {
    const L = Math.round(ms[k] * SR / 1000) + 16;
    lines.push(new Float32Array(L + 32)); lens.push(L);
    const g0 = Math.pow(10, -3 * L / (SR * decay)), gp = Math.pow(10, -3 * L / (SR * decay * hfDecay));
    gains.push(g0); poles.push((g0 - gp) / (g0 + gp));
  }
  const st = new Float64Array(N), o = new Float64Array(N), wi = new Int32Array(N);
  const mrate = [0.31, 0.47, 0.53, 0.71, 0.37, 0.59, 0.43, 0.67], mdep = 9 * mod;
  let pi = 0;
  for (let i = 0; i < n; i++) {
    let xl = lL.tick(hL.tick(inL[i])), xr = lR.tick(hR.tick(inR[i]));
    const dl = pL[pi], dr = pR[pi]; pL[pi] = xl; pR[pi] = xr; pi = pi + 1 === pre ? 0 : pi + 1;
    xl = dl; xr = dr;
    for (const a of apsL) xl = ap(a, xl, 0.62);
    for (const a of apsR) xr = ap(a, xr, 0.62);
    for (let k = 0; k < N; k++) {
      const buf = lines[k], Lb = buf.length;
      const dly = lens[k] - (k < 4 ? mdep * (1 + Math.sin(TAU * mrate[k] * i / SR + k)) : 0);
      let rp = wi[k] - dly; while (rp < 0) rp += Lb;
      const i0 = Math.floor(rp), fr = rp - i0, a0 = buf[i0 % Lb], a1 = buf[(i0 + 1) % Lb];
      const v = a0 + (a1 - a0) * fr;
      st[k] = v * gains[k] * (1 - poles[k]) + poles[k] * st[k];
      o[k] = st[k];
    }
    // 8-point fast Hadamard transform, normalised
    for (let h = 1; h < N; h <<= 1) for (let a = 0; a < N; a += h << 1) for (let b = a; b < a + h; b++) { const x = o[b], y = o[b + h]; o[b] = x + y; o[b + h] = x - y; }
    const nrm = 0.35355339059327373;
    for (let k = 0; k < N; k++) {
      const buf = lines[k];
      buf[wi[k]] = o[k] * nrm + (k & 1 ? xr : xl) * (k & 2 ? -0.5 : 0.5);
      wi[k] = wi[k] + 1 === buf.length ? 0 : wi[k] + 1;
    }
    out.L[i] = (st[0] - st[2] + st[4] - st[6] + 0.5 * (st[1] + st[5])) * 0.5;
    out.R[i] = (st[1] - st[3] + st[5] - st[7] + 0.5 * (st[0] + st[4])) * 0.5;
  }
  return out;
}

/** Smooth saturating soft clip (unity slope at 0, approaches ±1). */
export const softClip = x => (x > 1.5 ? 1 : x < -1.5 ? -1 : x - (4 / 27) * x * x * x);

/**
 * Offline look-ahead peak limiter (in place). The gain curve is a sliding minimum followed by a box average
 * of the same width, so the gain is already down when a peak arrives and never steps (no clicks);
 * then an exponential release. Guarantees |out| ≤ ceiling.
 */
export function limiter(x, { ceilingDb = -1.2, lookahead = 0.004, release = 0.15 } = {}) {
  const L = x.L, R = x.R || x.L, n = L.length, c = db(ceilingDb), W = Math.max(1, len(lookahead));
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); req[i] = p > c ? c / p : 1; }
  // sliding minimum over [i - W, i + W] (monotone deque)
  const mn = new Float32Array(n), dq = new Int32Array(n + 2 * W + 2);
  let h = 0, t = 0;
  for (let j = 0; j < n + W; j++) {
    if (j < n) { while (t > h && req[dq[t - 1]] >= req[j]) t--; dq[t++] = j; }
    const i = j - W;
    if (i >= 0) { while (dq[h] < i - W) h++; mn[i] = req[dq[h]]; }
  }
  // box average over [i - W/2, i + W/2]
  const half = W >> 1, avg = new Float32Array(n);
  let s = 0, cnt = 0;
  for (let j = -half; j < n; j++) {
    const add = j + half; if (add < n) { s += mn[add]; cnt++; }
    const rem = j - half - 1; if (rem >= 0) { s -= mn[rem]; cnt--; }
    if (j >= 0) avg[j] = s / cnt;
  }
  const kr = Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = Math.min(avg[i], 1 - (1 - g) * kr);
    L[i] *= g; if (x.R) R[i] *= g;
    if (Math.abs(L[i]) > c) L[i] = Math.sign(L[i]) * c;
    if (x.R && Math.abs(R[i]) > c) R[i] = Math.sign(R[i]) * c;
  }
  return x;
}
