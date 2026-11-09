// The final mix: dialogue, sound effects, ambience beds and a ducked music score → stereo 48 kHz,
// then mastering to −16 LUFS integrated / −1.5 dBTP with ffmpeg's two-pass loudnorm.
//
// mixFilm(plan, { voices, music, sfxGain, sounds, … }) → { L, R }
// writeMaster(path, mix, { lufs, tp, … }) → { path, lufs, truePeak, preGainDb, measured, result, linear }
//
// Effects come from sfx.mjs, or from the film's own `custom.mjs` sounds (compile copies them to plan.sounds;
// opts.sounds is a fallback): ({ seed, dur, params }) → Float32Array, 48 kHz mono. An event's `dur` and `params` reach
// the generator. Lines with no voice yet are skipped (one warning), so a film mixes before it is voiced. Each line plays
// its own cut (voiceFor): two lines with the same words share a voice entry but may have different trimEnds. A hum is a
// voice: the score ducks under it as under dialogue (params.duck: false to opt out, true to duck under any effect).
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readWav, resample, writeWav, SAMPLE_RATE as SR } from './wav.mjs';
import { makeSfx, ambience, loudness, truePeak, reverb, filt, hashStr } from './sfx.mjs';
import { voiceFor } from './voice.mjs';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const db = g => Math.pow(10, g / 20);

/** Mix levels and dynamics. Everything is overridable through mixFilm's options. */
export const MIX_DEFAULTS = {
  dialogueLufs: -20,  // each line is normalized to this (mono loudness), so every speaker sits at the same level
  musicLufs: -27,     // the score's integrated loudness before ducking (null keeps the score's own level)
  sfxGain: 1,         // multiplies every effect (effects are calibrated in sfx.mjs to sit under dialogue)
  sfxReverb: 0.12,    // send from effects into a short outdoor reverb, so they sit in the same air as the beds
  ambienceGain: 1,
  ambienceFade: 1,    // seconds; beds cross-fade with equal power
  duck: { depth: -10, attack: 0.15, release: 0.4, threshold: -42, hold: 0.25, lookahead: 0.1 },
  ambienceDuck: -3,   // beds dip a little under dialogue too
  dialoguePan: 0.3,   // max pan for on-screen speakers (0 = always centre)
  bus: { threshold: -18, ratio: 2, knee: 8, attack: 0.015, release: 0.25 },
  ceiling: -1,        // dBFS sample peak after the bus limiter
};

// ───────────────────────────── loading and placing ─────────────────────────────

/**
 * Mono 48 kHz samples from a voice entry: { wav: path | Float32Array | parsed wav, sampleRate? } (voice.mjs gives
 * { wav: Float32Array, sampleRate, path, … }), or the same under path/file/samples, or the audio itself.
 */
export function voiceSamples(v) {
  const entry = v && typeof v === 'object' && !ArrayBuffer.isView(v) && !v.channels && !v.L;
  let src = entry ? (v.wav ?? v.path ?? v.file ?? v.samples) : v;
  if (typeof src === 'string') src = readWav(src);
  if (!src) return null;
  if (src instanceof Float32Array) return entry && v.sampleRate && v.sampleRate !== SR ? resample(src, v.sampleRate, SR) : src;
  if (src.L) return Float32Array.from(src.L, (x, i) => (x + src.R[i]) / 2);
  if (src.channels) {
    const ch = src.channels, n = ch[0].length, m = new Float32Array(n);
    for (const c of ch) for (let i = 0; i < n; i++) m[i] += c[i] / ch.length;
    return src.sampleRate === SR ? m : resample(m, src.sampleRate, SR);
  }
  throw new Error('voice entry has no usable audio');
}
/** Equal-power pan gains (pan −1..1); centre is −3 dB per side, so mono loudness carries over to stereo. */
const panGains = p => { const th = ((clamp(p, -1, 1) + 1) * Math.PI) / 4; return [Math.cos(th), Math.sin(th)]; };
function place(bus, x, at, pan, gain, send, sendGain = 0) {
  const [gl, gr] = panGains(pan), i0 = Math.round(at * SR), n = bus.L.length;
  for (let i = Math.max(0, -i0); i < x.length && i0 + i < n; i++) {
    const v = x[i] * gain, j = i0 + i;
    bus.L[j] += v * gl; bus.R[j] += v * gr;
    if (send) { send.L[j] += v * gl * sendGain; send.R[j] += v * gr * sendGain; }
  }
}
const stereo = n => ({ L: new Float32Array(n), R: new Float32Array(n) });

/**
 * A slight pan from the speaker's screen position, when the plan can tell us where they are.
 * Assumes shot.cameraAt(t) → { cx, cy, zoom } maps world x to screen x as (x − cx)·zoom + W/2.
 */
export function linePan(plan, line, maxPan = MIX_DEFAULTS.dialoguePan) {
  if (Number.isFinite(line.pan)) return clamp(line.pan, -1, 1);
  if (!maxPan || line.narrator || line.vo || line.who === 'narrator') return 0;
  try {
    const tm = (line.t0 + (line.t1 ?? line.t0)) / 2, shot = plan.shots?.find(s => tm >= s.t0 && tm < s.t1);
    const a = plan.actorsAt?.(tm)?.find(x => x.id === line.who);
    if (!shot?.cameraAt || !a || a.visible === false || !plan.W) return 0;
    const cam = shot.cameraAt(tm), sx = (a.x - cam.cx) * (cam.zoom ?? 1) + plan.W / 2;
    return clamp((sx / plan.W - 0.5) * 2 * maxPan, -maxPan, maxPan);
  } catch { return 0; }
}

// ───────────────────────────── dynamics ─────────────────────────────

/**
 * Sidechain gain for ducking, computed from the dialogue itself (no realtime constraint, so it can look ahead).
 * Speech is detected per 10 ms block (RMS above threshold dBFS), held across word gaps, started `lookahead`
 * early, and the gain glides in dB: `attack` / `release` are the times to cover 90 % of the move.
 * Returns { gain: Float32Array (linear), db: Float32Array (dB ≤ 0) }.
 */
export function duckGain(dia, { depth = -10, attack = 0.15, release = 0.4, threshold = -42, hold = 0.25, lookahead = 0.1 } = {}) {
  const n = dia.length, B = 480, nb = Math.ceil(n / B), on = new Uint8Array(nb), act = new Uint8Array(nb);
  for (let b = 0; b < nb; b++) {
    let s = 0; const e = Math.min(n, (b + 1) * B);
    for (let i = b * B; i < e; i++) s += dia[i] * dia[i];
    on[b] = 10 * Math.log10(s / Math.max(1, e - b * B) + 1e-20) > threshold ? 1 : 0;
  }
  const hb = Math.round((hold * SR) / B), lb = Math.round((lookahead * SR) / B);
  for (let b = 0; b < nb; b++) if (on[b]) for (let k = Math.max(0, b - lb); k <= Math.min(nb - 1, b + hb); k++) act[k] = 1;
  const kA = 1 - Math.exp(-2.303 / (attack * SR)), kR = 1 - Math.exp(-2.303 / (release * SR));
  const gain = new Float32Array(n), dB = new Float32Array(n);
  let cur = 0;
  for (let i = 0; i < n; i++) {
    const tgt = act[(i / B) | 0] ? depth : 0;
    cur += (tgt - cur) * (tgt < cur ? kA : kR);
    dB[i] = cur; gain[i] = db(cur);
  }
  return { gain, db: dB };
}
/** Gentle stereo-linked bus compressor (RMS detector, soft knee). In place. */
export function busCompress(L, R, { threshold = -18, ratio = 2, knee = 8, attack = 0.015, release = 0.25 } = {}) {
  const kd = Math.exp(-1 / (0.01 * SR)), kA = Math.exp(-1 / (attack * SR)), kR = Math.exp(-1 / (release * SR)), slope = 1 - 1 / ratio;
  let ms = 0, gr = 0, g = 1;
  for (let i = 0; i < L.length; i++) {
    ms = kd * ms + (1 - kd) * Math.max(L[i] * L[i], R[i] * R[i]);
    if ((i & 3) === 0) {
      const over = 10 * Math.log10(ms + 1e-12) + 3 - threshold; // +3: RMS of a sine → its peak-ish level
      const red = 2 * over <= -knee ? 0 : 2 * over >= knee ? over * slope : (slope * (over + knee / 2) ** 2) / (2 * knee);
      gr = red > gr ? kA ** 4 * gr + (1 - kA ** 4) * red : kR ** 4 * gr + (1 - kR ** 4) * red;
      g = db(-gr);
    }
    L[i] *= g; R[i] *= g;
  }
}
/**
 * Look-ahead peak limiter. The gain reaches its target before each peak (sliding minimum + ramp), never after,
 * so no sample exceeds `ceiling` (linear). Returns new { L, R }.
 */
export function limit(L, R, ceiling, { lookahead = 0.005, release = 0.08 } = {}) {
  const n = L.length, la = Math.max(1, Math.round(lookahead * SR)), need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = p > ceiling ? ceiling / p : 1; }
  const h = new Float32Array(n), dq = new Int32Array(n + 1);
  let head = 0, tail = 0;
  for (let j = 0; j < n + la; j++) {
    if (j < n) { while (tail > head && need[dq[tail - 1]] >= need[j]) tail--; dq[tail++] = j; }
    const i = j - la;
    if (i < 0) continue;
    while (dq[head] < i) head++;
    h[i] = need[dq[head]];
  }
  const kr = 1 - Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) { g = h[i] < g ? h[i] : g + (h[i] - g) * kr; h[i] = g; }
  const out = { L: new Float32Array(n), R: new Float32Array(n) };
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += h[i]; if (i > la) sum -= h[i - la - 1];
    const gg = Math.min(h[i], sum / Math.min(i + 1, la + 1));
    out.L[i] = L[i] * gg; out.R[i] = R[i] * gg;
  }
  return out;
}

// ───────────────────────────── the mix ─────────────────────────────

/** Merge back-to-back segments of the same bed so it plays on continuously across cuts. */
function mergeBeds(list = []) {
  const segs = list.filter(s => s && s.name && s.name !== 'none' && s.name !== 'auto' && s.t1 > s.t0).map(s => ({ ...s })).sort((a, b) => a.t0 - b.t0);
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.name === s.name && s.t0 - last.t1 < 0.1) last.t1 = Math.max(last.t1, s.t1);
    else out.push(s);
  }
  return out;
}
const warned = new Set();
const warnOnce = (k, msg) => { if (!warned.has(k)) { warned.add(k); console.warn(`[mix] ${msg}`); } };
/** Effects that are voices: the score ducks under them as it does under dialogue. */
const VOCAL_SFX = new Set(['hum']);

/** A film's own sound (custom.mjs `sounds`): called with { seed, dur, params }, sanity-checked, edges softened. */
function customSound(fn, name, seed, dur, params) {
  const y = fn({ seed, dur, params });
  if (!y || typeof y.length !== 'number' || (!ArrayBuffer.isView(y) && !Array.isArray(y))) throw new Error(`custom sound "${name}" must return a Float32Array (48 kHz mono)`);
  const x = Float32Array.from(y, v => (Number.isFinite(v) ? v : 0));
  const a = Math.min(x.length >> 1, 96), b = Math.min(x.length >> 1, 240); // 2 ms in, 5 ms out: no clicks at the edges
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

/**
 * Mix the film's audio.
 * plan: { duration, W?, lines: [{ id, who, t0, t1, narrator?, vo?, pan? }], sfx: [{ t, name, gain?, pan?, dur?, params?, seed? }],
 *         ambience: [{ t0, t1, name }], sounds?: { name: ({ seed, dur, params }) → Float32Array }, shots?, actorsAt? }
 * voices: Map lineId → { wav (path | Float32Array | parsed), dur } ; music: { L, R } at 48 kHz (optional);
 * sounds: custom sounds when the plan carries none.
 */
export function mixFilm(plan, opts = {}) {
  const o = { ...MIX_DEFAULTS, ...opts, duck: { ...MIX_DEFAULTS.duck, ...(opts.duck || {}) }, bus: { ...MIX_DEFAULTS.bus, ...(opts.bus || {}) } };
  const voices = o.voices instanceof Map ? o.voices : new Map(Object.entries(o.voices || {}));
  const N = Math.max(1, Math.round((plan.duration || 0) * SR));
  const dia = stereo(N), fx = stereo(N), send = stereo(N), amb = stereo(N), mus = stereo(N), diaMono = new Float32Array(N);

  // dialogue: high-passed, each line normalized, placed at its time with a slight pan by screen position
  const unvoiced = (plan.lines || []).filter(l => !voiceFor(voices, l));
  if (unvoiced.length) warnOnce(`voices:${unvoiced.map(l => l.id).join()}`, `${unvoiced.length} of ${plan.lines.length} line${plan.lines.length > 1 ? 's have' : ' has'} no voice yet and ${unvoiced.length > 1 ? 'are' : 'is'} skipped: ${unvoiced.slice(0, 4).map(l => `${l.id} ${l.who}`).join(', ')}${unvoiced.length > 4 ? ', …' : ''}`);
  for (const line of plan.lines || []) {
    const v = voiceFor(voices, line);
    if (!v) continue;
    const x = filt(Float32Array.from(voiceSamples(v)), 'hp', 70, 0.7);
    const lu = loudness([x]), g = Number.isFinite(lu) ? clamp(db(o.dialogueLufs - lu), db(-12), db(18)) : 1, pan = linePan(plan, line, o.dialoguePan);
    place(dia, x, line.t0, pan, g);
    const i0 = Math.round(line.t0 * SR);
    for (let i = Math.max(0, -i0); i < x.length && i0 + i < N; i++) diaMono[i0 + i] += x[i] * g;
  }

  // effects: synthesized per event (seeded by name, time and owner so editing one event leaves the others alone)
  const sounds = { ...(o.sounds || {}), ...(plan.sounds || {}) };
  for (const e of plan.sfx || []) {
    if (!e || !e.name || !Number.isFinite(e.t)) continue;
    let x;
    const seed = e.seed ?? hashStr(`${e.name}|${e.t.toFixed(3)}|${e.shot ?? ''}|${e.who ?? ''}`), params = { ...(e.dur != null ? { dur: e.dur } : {}), ...(e.params || {}) };
    try {
      x = typeof sounds[e.name] === 'function' ? customSound(sounds[e.name], e.name, seed, params.dur, params) : makeSfx(e.name, { seed, ...params });
    } catch (err) { warnOnce(`sfx:${e.name}`, err.message); continue; }
    let bad = 0; // one broken sample would poison the reverb, the limiter and everything after it
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) { x[i] = 0; bad++; }
    if (bad) warnOnce(`nan:${e.name}`, `sfx "${e.name}" made ${bad} non-finite samples (silenced)`);
    const g = (e.gain ?? 1) * o.sfxGain;
    place(fx, x, e.t, e.pan ?? 0, g, send, o.sfxReverb);
    if (params.duck ?? VOCAL_SFX.has(e.name)) { // a sung or hummed voice: the music makes room for it too
      const i0 = Math.round(e.t * SR);
      for (let i = Math.max(0, -i0); i < x.length && i0 + i < N; i++) diaMono[i0 + i] += x[i] * g;
    }
  }
  if (o.sfxReverb > 0 && (plan.sfx || []).length) {
    const wet = reverb(send.L, send.R, { room: 0.55, damp: 0.5 });
    for (let i = 0; i < N; i++) { fx.L[i] += wet.L[i]; fx.R[i] += wet.R[i]; }
  }

  // ambience: continuous beds with equal-power fades that overlap across a change of bed
  const F = o.ambienceFade, dur = N / SR;
  for (const s of mergeBeds(plan.ambience)) {
    const a0 = Math.max(0, s.t0 - F / 2), a1 = Math.min(dur, s.t1 + F / 2);
    if (a1 - a0 < 0.05) continue;
    let bed;
    try { bed = ambience(s.name, a1 - a0, { seed: hashStr(s.name) ^ Math.round(s.t0 * 1000) }); } catch (err) { warnOnce(`amb:${s.name}`, err.message); continue; }
    const n = bed.L.length, nf = Math.min(Math.round(F * SR), n >> 1), i0 = Math.round(a0 * SR);
    for (let i = 0; i < n && i0 + i < N; i++) {
      const fi = i < nf ? Math.sin((Math.PI / 2) * (i / nf)) : 1, fo = i >= n - nf ? Math.sin((Math.PI / 2) * ((n - 1 - i) / nf)) : 1, g = fi * fo * o.ambienceGain;
      amb.L[i0 + i] += bed.L[i] * g; amb.R[i0 + i] += bed.R[i] * g;
    }
  }

  // music: normalized, then ducked under the dialogue
  if (o.music?.L) {
    const n = Math.min(N, o.music.L.length);
    for (let i = 0; i < n; i++) { mus.L[i] = o.music.L[i]; mus.R[i] = o.music.R[i]; }
    const lu = o.musicLufs == null ? NaN : loudness([mus.L, mus.R]);
    if (Number.isFinite(lu)) { const g = db(o.musicLufs - lu); for (let i = 0; i < N; i++) { mus.L[i] *= g; mus.R[i] *= g; } }
  }
  const duck = duckGain(diaMono, o.duck), ka = o.duck.depth ? o.ambienceDuck / o.duck.depth : 0;
  const L = new Float32Array(N), R = new Float32Array(N);
  let ga = 1;
  for (let i = 0; i < N; i++) {
    if ((i & 15) === 0) ga = ka ? db(duck.db[i] * ka) : 1; // the beds' gentler dip (the curve moves slowly)
    const gm = duck.gain[i];
    L[i] = dia.L[i] + fx.L[i] + amb.L[i] * ga + mus.L[i] * gm;
    R[i] = dia.R[i] + fx.R[i] + amb.R[i] * ga + mus.R[i] * gm;
  }
  busCompress(L, R, o.bus);
  return limit(L, R, db(o.ceiling));
}

// ───────────────────────────── mastering ─────────────────────────────

function defaultRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd} failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}: ${(r.stderr || '').slice(-600)}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
/** The JSON block loudnorm prints at the end of stderr. */
export function parseLoudnorm(stderr) {
  const a = stderr.lastIndexOf('{'), b = stderr.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('loudnorm: no JSON in ffmpeg output');
  return JSON.parse(stderr.slice(a, b + 1));
}
/**
 * Master the mix: a JS pre-gain to the target and a true-peak limiter (so loudnorm's second pass can stay a pure,
 * linear gain instead of falling back to its dynamic mode), a temp 24-bit WAV, then ffmpeg loudnorm two-pass
 * to `lufs` integrated / `tp` dBTP, written as 48 kHz 24-bit PCM. `run(cmd, args)` can be injected for tests.
 * Synchronous (spawnSync); returns { path, lufs, truePeak, preGainDb, measured, result, linear }.
 */
export function writeMaster(path, mix, { lufs = -16, tp = -1.5, ffmpeg = 'ffmpeg', run = defaultRun, keepTemp = false } = {}) {
  const lu = loudness([mix.L, mix.R]), pre = Number.isFinite(lu) ? lufs - lu : 0, g = db(pre);
  let L = Float32Array.from(mix.L, v => v * g), R = Float32Array.from(mix.R, v => v * g);
  const goal = db(tp - 0.3);
  let ceil = db(tp - 0.6);
  for (let k = 0; k < 4; k++) {
    ({ L, R } = limit(L, R, ceil));
    const p = truePeak([L, R]);
    if (p <= goal) break;
    ceil *= goal / p;
  }
  const tmp = join(dirname(path), `.${basename(path)}.premaster.wav`);
  writeWav(tmp, [L, R], SR, 24);
  const exact = loudness([L, R]); // BS.1770-4, matches ffmpeg's ebur128 meter
  try {
    const base = `I=${lufs}:TP=${tp}`;
    const r1 = run(ffmpeg, ['-hide_banner', '-nostats', '-i', tmp, '-af', `loudnorm=${base}:LRA=11:print_format=json`, '-f', 'null', '-']);
    const m = parseLoudnorm(r1.stderr);
    if (!Number.isFinite(+m.input_i)) { // silence: nothing to normalize
      run(ffmpeg, ['-y', '-hide_banner', '-nostats', '-i', tmp, '-ar', String(SR), '-c:a', 'pcm_s24le', path]);
      return { path, lufs: -Infinity, truePeak: -Infinity, preGainDb: pre, measured: m, result: null, linear: true };
    }
    // loudnorm's first pass can mis-measure the integrated level (by ~1 LU on short programmes, its 3 s window);
    // the exact BS.1770 reading of the same file is used instead, the other first-pass values are kept
    const mI = Number.isFinite(exact) ? exact.toFixed(2) : m.input_i;
    // a film mix has a wide loudness range; a target LRA below the measured one would force dynamic mode
    const lra = clamp(Math.ceil(Math.max(11, +m.input_lra + 1)), 1, 50);
    const af = `loudnorm=${base}:LRA=${lra}:measured_I=${mI}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json`;
    const r2 = run(ffmpeg, ['-y', '-hide_banner', '-nostats', '-i', tmp, '-af', af, '-ar', String(SR), '-c:a', 'pcm_s24le', path]);
    const out = parseLoudnorm(r2.stderr);
    return { path, lufs: +out.output_i, truePeak: +out.output_tp, preGainDb: pre, measured: { ...m, exact_i: exact }, result: out, linear: out.normalization_type === 'linear' };
  } finally {
    if (!keepTemp) try { unlinkSync(tmp); } catch {}
  }
}
