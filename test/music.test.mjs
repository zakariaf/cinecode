// Tests for engine/audio/synth.mjs and engine/audio/music.mjs. No network. Run: node --test test/music.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../engine/audio/synth.mjs';
import { composeCue, planCue, scoreFilm, makeSting, chord, chordScale, voiceLead, keyPc, SCALES, MOODS, MOOD_NAMES } from '../engine/audio/music.mjs';

const SR = S.SR, CEIL = S.db(-1);   // -1 dBFS

// ---------------------------------------------------------------- helpers
function goertzel(x, f, a = 0, b = x.length) {
  const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w); let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (b - a);
}
/** Detected pitch offset in cents (scan ±50 c around f0). */
function centsOff(x, f0, a, b) { let best = 0, bc = 0; for (let c = -50; c <= 50; c += 0.25) { const m = goertzel(x, f0 * 2 ** (c / 1200), a, b); if (m > best) { best = m; bc = c; } } return bc; }
/** Click detector: largest second-difference spike relative to the local RMS of the second difference. */
function worstClick(c) {
  const n = c.length, W = 1024, d2 = new Float32Array(n); let worst = 0;
  for (let i = 2; i < n; i++) d2[i] = c[i] - 2 * c[i - 1] + c[i - 2];
  for (let w = W; w + 2 * W <= n; w += W) {
    let s = 0; for (let i = w - W; i < w + 2 * W; i++) s += d2[i] * d2[i];
    const rms = Math.sqrt(s / (3 * W)) + 1e-5;
    for (let i = w; i < w + W; i++) worst = Math.max(worst, Math.abs(d2[i]) / rms);
  }
  return worst;
}
function stats(x) {
  let nan = 0, pk = 0, sum = 0;
  for (const c of [x.L, x.R]) for (let i = 0; i < c.length; i++) { const v = c[i]; if (!Number.isFinite(v)) nan++; else { pk = Math.max(pk, Math.abs(v)); sum += v; } }
  return { nan, peak: pk, dc: sum / (2 * x.L.length), rmsDb: S.rmsDb(x) };
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function aliasDb(x, f) {   // power that is not at a harmonic of f, relative to the total
  let tot = 0; for (const v of x) tot += v * v; tot /= x.length;
  let h = 0; for (let k = 1; k * f < SR / 2; k++) h += 2 * goertzel(x, k * f) ** 2;
  return 10 * Math.log10(Math.max(1e-12, tot - h) / tot);
}

// ---------------------------------------------------------------- synth
test('oscillators are band-limited (polyBLEP/BLAMP beat naive waveforms)', () => {
  const f = 2489, n = SR;
  const naiveSaw = new Float32Array(n); let p = 0;
  for (let i = 0; i < n; i++) { naiveSaw[i] = 2 * p - 1; p += f / SR; p -= Math.floor(p); }
  assert.ok(aliasDb(S.osc('saw', f, n), f) < aliasDb(naiveSaw, f) - 10, 'saw aliasing at least 10 dB lower than naive');
  assert.ok(aliasDb(S.osc('square', f, n), f) < -25);
  assert.ok(aliasDb(S.osc('triangle', f, n), f) < -45);
});

test('Karplus-Strong pluck is in tune (±2 cents) and deterministic', () => {
  for (const f of [110, 440, 1760]) {
    const x = S.pluck(f, 1, { seed: 5, t60: 3 });
    assert.ok(Math.abs(centsOff(x, f, 4800, 28800)) <= 2, `pluck ${f} Hz in tune`);
  }
  assert.ok(same(S.pluck(220, 1, { seed: 9 }), S.pluck(220, 1, { seed: 9 })));
  assert.ok(!same(S.pluck(220, 1, { seed: 9 }), S.pluck(220, 1, { seed: 10 })));
});

test('every voice is finite, starts and ends silently, and has no clicks', () => {
  const voices = {
    harp: () => S.pluck(330, 0.5), pizz: () => S.pluck(220, 0.2, { body: 'pizz', mute: true, t60: 1, release: 0.18 }),
    piano: () => S.piano(262, 0.8), celesta: () => S.celesta(1046, 0.4), bell: () => S.bell(523, 1), epiano: () => S.epiano(330, 0.5),
    glock: () => S.glock(1568, 0.3), flute: () => S.flute(660, 1), horn: () => S.flute(349, 1, { timbre: 'horn' }),
    strings: () => S.strings(440, 1), trem: () => S.strings(220, 1, { tremolo: 11 }), pad: () => S.pad(220, 1), choir: () => S.pad(330, 1, { vowel: 'oo' }),
    kick: () => S.kick(0.7), timpani: () => S.timpani(98, 0.7), shaker: () => S.shaker(0.5), brush: () => S.brush(0.5), wood: () => S.woodblock(880, 0.5), swell: () => S.swell(1),
  };
  for (const [name, fn] of Object.entries(voices)) {
    const b = fn(), x = new Float32Array(b.length + 9600); x.set(b, 4800);   // padded with silence, as in a mix
    assert.ok(b.every(Number.isFinite), `${name} finite`);
    assert.ok(Math.abs(b[0]) < 0.02 && Math.abs(b[b.length - 1]) < 1e-3, `${name} starts/ends near zero`);
    assert.ok(S.peak(b) < 1, `${name} below full scale`);
    assert.ok(worstClick(x) < 14, `${name} has no click (z=${worstClick(x).toFixed(1)})`);
  }
});

test('adsr: curved segments, release from the reached level, ends at zero', () => {
  const e = S.adsr(SR, { a: 0.1, d: 0.1, s: 0.5, r: 0.2, gate: 0.05 });   // released during the attack
  assert.equal(e[0], 0);
  assert.ok(Math.max(...e) < 1);
  assert.equal(e[Math.round(0.3 * SR)], 0);
  for (let i = 1; i < e.length; i++) assert.ok(Math.abs(e[i] - e[i - 1]) < 0.01, 'no steps');
});

test('limiter holds the ceiling without gain steps', () => {
  const n = SR, x = { L: new Float32Array(n), R: new Float32Array(n) };
  for (let i = 0; i < n; i++) { const v = Math.sin(2 * Math.PI * 220 * i / SR) * (i > SR / 2 ? 2.5 : 0.3); x.L[i] = v; x.R[i] = v; }
  const before = Float32Array.from(x.L);
  S.limiter(x, { ceilingDb: -1.2 });
  assert.ok(S.peak(x) <= S.db(-1.2) + 1e-6);
  let maxStep = 0;   // gain trajectory sampled at waveform peaks must move smoothly
  for (let i = 1; i < n; i++) if (Math.abs(before[i]) > 0.25) maxStep = Math.max(maxStep, Math.abs(x.L[i] / before[i] - x.L[i - 1] / (before[i - 1] || 1e-9)) * (Math.abs(before[i - 1]) > 0.25 ? 1 : 0));
  assert.ok(maxStep < 0.02, `gain moves smoothly (${maxStep})`);
});

test('reverb tail is finite, decorrelated and decays', () => {
  const imp = new Float32Array(SR * 4); imp[100] = 1;
  const w = S.reverb(imp, { decay: 1.5 });
  assert.ok(w.L.every(Number.isFinite) && w.R.every(Number.isFinite));
  const e = (c, a, b) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return s; };
  assert.ok(e(w.L, SR * 3, SR * 4) < e(w.L, 0, SR) * 1e-3, 'decays by > 30 dB within 3 s for RT60 1.5 s');
  assert.ok(!same(w.L, w.R), 'stereo output is decorrelated');
});

// ---------------------------------------------------------------- theory
test('chord parsing and chord-scales spell alterations correctly', () => {
  assert.deepEqual(chord('V7').pcs, [7, 11, 2, 5]);
  assert.deepEqual(chord('iv6').pcs, [5, 8, 0, 2]);
  assert.equal(chord('V/3').bass, 11);
  assert.deepEqual(chordScale(SCALES.major, chord('II')), [0, 2, 4, 6, 7, 9, 11]);    // raised 4th, not a lowered 5th
  assert.deepEqual(chordScale(SCALES.minor, chord('V')), [0, 2, 3, 5, 7, 8, 11]);    // raised leading tone
  assert.deepEqual(chordScale(SCALES.major, chord('bVI')), [0, 2, 3, 5, 7, 8, 11]);
  assert.equal(keyPc('Eb'), 3); assert.equal(keyPc('F#m'), 6);
});

test('voice leading moves to the nearest inversion', () => {
  const C = voiceLead(null, chord('I').pcs, { lo: 55, hi: 76 }), F = voiceLead(C, chord('IV').pcs, { lo: 55, hi: 76 });
  const motion = C.reduce((a, m, k) => a + Math.abs(m - F[k]), 0);
  assert.ok(motion <= 5, `I → IV moves ${motion} semitones in total`);
  assert.ok(F.every(m => m >= 55 && m <= 76));
});

// ---------------------------------------------------------------- cues
test('composeCue: exact length, finite, peak ≤ -1 dBFS, sensible level, no DC, deterministic', () => {
  const a = composeCue({ dur: 9, mood: 'pastoral', intensity: 0.6, seed: 4 });
  const b = composeCue({ dur: 9, mood: 'pastoral', intensity: 0.6, seed: 4 });
  const c = composeCue({ dur: 9, mood: 'pastoral', intensity: 0.6, seed: 5 });
  assert.equal(a.L.length, 9 * SR);
  const st = stats(a);
  assert.equal(st.nan, 0);
  assert.ok(st.peak <= CEIL, `peak ${st.peak}`);
  assert.ok(st.rmsDb > -32 && st.rmsDb < -14, `rms ${st.rmsDb}`);
  assert.ok(Math.abs(st.dc) < 1e-3);
  assert.ok(same(a.L, b.L) && same(a.R, b.R), 'same seed → identical samples');
  assert.ok(!same(a.L, c.L), 'different seed → different music');
});

test('every mood renders cleanly', () => {
  for (const mood of MOOD_NAMES) {
    const x = composeCue({ dur: 8, mood, intensity: 0.7, seed: 2 });
    const st = stats(x);
    assert.equal(st.nan, 0, mood);
    assert.ok(st.peak <= CEIL, `${mood} peak`);
    assert.ok(st.rmsDb > -34 && st.rmsDb < -12, `${mood} rms ${st.rmsDb}`);
    assert.ok(worstClick(x.L) < 15, `${mood} no clicks (z=${worstClick(x.L).toFixed(1)})`);
  }
});

test('short and odd durations, explicit key and tempo, intensity as a function', () => {
  for (const dur of [0.4, 2, 5]) {
    const x = composeCue({ dur, mood: 'wonder', seed: 1 });
    assert.equal(x.L.length, Math.round(dur * SR));
    assert.equal(stats(x).nan, 0);
  }
  const k = composeCue({ dur: 12, mood: 'sad', key: 'A', tempo: 60, seed: 1, intensity: t => 0.2 + t / 20 });
  assert.equal(k.info.tempo, 60); assert.equal(k.info.tonic, 9);
  assert.throws(() => composeCue({ dur: 5, mood: 'nope' }));
});

test('planCue: phrase structure, tonic landing, events inside the cue and in range', () => {
  const C = planCue({ dur: 40, mood: 'tender', intensity: 0.6, seed: 3 });
  const last = C.bars[C.bars.length - 1];
  assert.ok(last.landing && last.chords[0].ch.root === 0, 'final bar is the tonic');
  const ante = C.bars.find(b => b.type === 'ante' && b.pos === 3);
  assert.ok(ante && [7, 5].includes(ante.chords[ante.chords.length - 1].ch.root), 'antecedent ends on a half cadence (V or IV)');
  for (const e of C.ev) { assert.ok(e.t >= 0 && e.t < 40, 'event inside the cue'); assert.ok(e.midi >= 0 && e.midi <= 108); }
  const land = C.t(last.start);
  assert.ok(40 - land >= 3 && 40 - land <= 6, `final chord leaves room to ring (${(40 - land).toFixed(2)} s)`);
  for (const mood of MOOD_NAMES) assert.ok(MOODS[mood].tempo > 40 && MOODS[mood].progs.every(p => p.length === 8), mood);
});

test('stings place their accent and stay below the ceiling', () => {
  for (const name of ['surprise', 'sad', 'triumph', 'magic']) {
    const s = makeSting(name, { key: 'D', seed: 1 });
    assert.ok(s.hit >= 0 && s.hit < s.L.length / SR, name);
    assert.equal(stats(s).nan, 0);
    assert.ok(S.peak(s) <= CEIL, `${name} peak`);
  }
  assert.throws(() => makeSting('nope'));
});

test('scoreFilm: film length, silence without cues, smooth crossfades, merged cues, stings, deterministic', () => {
  const plan = { duration: 30, music: [
    { t0: 0, t1: 8, mood: 'wonder', intensity: 0.5 }, { t0: 8, t1: 14, mood: 'wonder', intensity: 0.8 },   // merged
    { t0: 14, t1: 21, mood: 'tension', intensity: 0.6 }, { t: 16, sting: 'surprise' },
    { t0: 21, t1: 25, mood: 'none' },
  ] };
  const a = scoreFilm(plan, { seed: 2 }), b = scoreFilm(plan, { seed: 2 });
  assert.equal(a.L.length, 30 * SR);
  assert.ok(same(a.L, b.L), 'deterministic');
  const st = stats(a);
  assert.equal(st.nan, 0);
  assert.ok(st.peak <= CEIL);
  let tail = 0; for (let i = 21.8 * SR; i < 30 * SR; i++) tail = Math.max(tail, Math.abs(a.L[i]), Math.abs(a.R[i]));
  assert.equal(tail, 0, 'silence where there is no cue');
  assert.ok(worstClick(a.L.subarray(12 * SR, 16 * SR)) < 15, 'crossfade at 14 s has no click');
  let e = 0; for (let i = 13 * SR; i < 15 * SR; i++) e += a.L[i] * a.L[i];
  assert.ok(e / (2 * SR) > 1e-6, 'music continues through the crossfade');
  const empty = scoreFilm({ duration: 2, music: [] });
  assert.equal(empty.L.length, 2 * SR); assert.equal(S.peak(empty), 0);
});
