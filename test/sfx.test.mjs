import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSfx, ambience, SFX_NAMES, SFX_ALIASES, SFX_LEVELS, AMBIENCE_NAMES, AMBIENCE_LUFS, loudness, peakLoudness, truePeak, hashStr, parseNotes, filt } from '../engine/audio/sfx.mjs';

const SR = 48000;
const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const finite = x => x.every(Number.isFinite);
const mean = x => x.reduce((a, v) => a + v, 0) / x.length;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
/** Spectral centroid (Hz) by a coarse DFT over 64 bins up to 12 kHz, on a 4096-sample frame at the loudest point. */
function centroid(x) {
  let at = 0, best = 0;
  for (let i = 0; i + 4096 < x.length; i += 1024) { let s = 0; for (let j = 0; j < 4096; j++) s += x[i + j] ** 2; if (s > best) { best = s; at = i; } }
  let num = 0, den = 0;
  for (let k = 1; k <= 64; k++) {
    const f = (k / 64) * 12000; let re = 0, im = 0;
    for (let j = 0; j < 4096 && at + j < x.length; j++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / 4096), a = (2 * Math.PI * f * j) / SR; re += x[at + j] * w * Math.cos(a); im += x[at + j] * w * Math.sin(a); }
    const m = Math.hypot(re, im); num += f * m; den += m;
  }
  return num / den;
}

test('every effect renders: finite, soft edges, no DC, peak under −3 dBFS, sensible length', () => {
  for (const name of SFX_NAMES) for (const seed of [1, 2]) {
    const x = makeSfx(name, { seed });
    assert.ok(x instanceof Float32Array, name);
    assert.ok(finite(x), `${name}: NaN/Inf`);
    assert.ok(x.length >= 0.1 * SR && x.length <= 12 * SR, `${name}: length ${x.length / SR}s`);
    assert.ok(peak(x) <= 0.7001, `${name}: peak ${peak(x)}`);
    assert.ok(peak(x) > 0.01, `${name}: silent`);
    assert.ok(Math.abs(x[0]) < 1e-3 && Math.abs(x[x.length - 1]) < 1e-3, `${name}: edges not faded`);
    assert.ok(Math.abs(mean(x)) < 2e-3, `${name}: DC ${mean(x)}`);
  }
});

test('deterministic per seed, varied across seeds', () => {
  for (const name of SFX_NAMES) {
    const a = makeSfx(name, { seed: 7 }), b = makeSfx(name, { seed: 7 }), c = makeSfx(name, { seed: 8 });
    assert.ok(same(a, b), `${name}: not deterministic`);
    assert.ok(!same(a, c), `${name}: seeds 7 and 8 identical`);
  }
});

test('effects are calibrated to their level table (±2.5 LU, or quieter when peak-capped)', () => {
  const continuous = new Set(['wind', 'stream', 'fire', 'cricket']);
  for (const name of SFX_NAMES) {
    const x = makeSfx(name, { seed: 3 }), target = SFX_LEVELS[name];
    const L = continuous.has(name) ? loudness([x]) : peakLoudness(x);
    if (peak(x) >= 0.699) assert.ok(L <= target + 2.5, `${name}: ${L.toFixed(1)} vs ${target}`);
    else assert.ok(Math.abs(L - target) <= 2.5, `${name}: ${L.toFixed(1)} vs ${target}`);
  }
});

test('continuous effects honour dur; aliases resolve; unknown names throw', () => {
  for (const name of ['wind', 'stream', 'fire', 'cricket']) assert.equal(makeSfx(name, { dur: 2.5 }).length, 2.5 * SR, name);
  assert.ok(same(makeSfx('squeak', { seed: 4 }), makeSfx('mouse-squeak', { seed: 4 })));
  assert.ok(same(makeSfx('footstep', { seed: 4 }), makeSfx('footstep-grass', { seed: 4 })));
  assert.throws(() => makeSfx('laser-blast'), /unknown sfx/);
});

test('bird species are distinct: doves coo low, tits sing high', () => {
  const dove = centroid(makeSfx('birdsong', { seed: 1, species: 'dove' })), tit = centroid(makeSfx('birdsong', { seed: 1, species: 'tit' }));
  assert.ok(dove < 1500, `dove centroid ${dove}`);
  assert.ok(tit > 3500, `tit centroid ${tit}`);
  for (const sp of ['sparrow', 'tit', 'chaffinch', 'robin', 'blackbird', 'warbler', 'dove', 'cuckoo', 'lark']) assert.ok(finite(makeSfx('birdsong', { species: sp, seed: 2 })), sp);
  // the default picks a species from the seed: several seeds give several different songs
  const lens = new Set([1, 2, 3, 4, 5, 6].map(seed => makeSfx('birdsong', { seed }).length));
  assert.ok(lens.size >= 3);
});

test('footstep weight makes a longer, darker step', () => {
  const light = makeSfx('footstep-wood', { seed: 5, weight: 0.1 }), heavy = makeSfx('footstep-wood', { seed: 5, weight: 0.95 });
  assert.ok(heavy.length > light.length);
  assert.ok(centroid(heavy) < centroid(light), `${centroid(heavy)} vs ${centroid(light)}`);
});

test('ambience beds: stereo, exact length, calibrated, decorrelated, seamless, deterministic', () => {
  for (const name of AMBIENCE_NAMES) {
    const a = ambience(name, 5, { seed: 2 });
    assert.equal(a.L.length, 5 * SR, name); assert.equal(a.R.length, 5 * SR, name);
    assert.ok(finite(a.L) && finite(a.R), `${name}: NaN`);
    // beds are levelled on their steady loudness: the median 3 s short-term reading (here 3 windows)
    const st = [0, 1, 2].map(k => loudness([a.L.subarray(k * SR, (k + 3) * SR), a.R.subarray(k * SR, (k + 3) * SR)])).sort((p, q) => p - q);
    assert.ok(Math.abs(st[1] - AMBIENCE_LUFS[name]) < 0.05, `${name}: ${st[1].toFixed(2)} LUFS vs ${AMBIENCE_LUFS[name]}`);
    const li = loudness([a.L, a.R]); // passing birds/owls sit on top of the steady level, never under it by much
    assert.ok(li > AMBIENCE_LUFS[name] - 1.5 && li < AMBIENCE_LUFS[name] + 4, `${name}: integrated ${li.toFixed(1)} vs ${AMBIENCE_LUFS[name]}`);
    assert.ok(!same(a.L, a.R), `${name}: mono`);
    let jump = 0; for (let i = 1; i < a.L.length; i++) jump = Math.max(jump, Math.abs(a.L[i] - a.L[i - 1]));
    assert.ok(jump < 0.25, `${name}: sample jump ${jump}`);
    assert.ok(Math.max(peak(a.L), peak(a.R)) < 0.5, `${name}: peak`);
    const b = ambience(name, 5, { seed: 2 });
    assert.ok(same(a.L, b.L) && same(a.R, b.R), `${name}: not deterministic`);
  }
  assert.ok(!same(ambience('stream', 2, { seed: 1 }).L, ambience('stream', 2, { seed: 2 }).L));
  assert.throws(() => ambience('moon-base', 2), /unknown ambience/);
});

test('ambience never loops: distant stretches of a long bed are uncorrelated', () => {
  const a = ambience('meadow-night', 24, { seed: 3 }), n = 4 * SR;
  const corr = (p, q) => { let s = 0, sp = 0, sq = 0; for (let i = 0; i < n; i++) { s += a.L[p + i] * a.L[q + i]; sp += a.L[p + i] ** 2; sq += a.L[q + i] ** 2; } return s / Math.sqrt(sp * sq); };
  for (const lag of [5, 10, 17]) assert.ok(Math.abs(corr(SR, (1 + lag) * SR)) < 0.2, `lag ${lag}s`);
  // a long bed is levelled on its steady (median short-term) loudness, so passing events don't pull it down
  const st3 = []; for (let s = 0; s + 3 * SR <= a.L.length; s += SR) st3.push(loudness([a.L.subarray(s, s + 3 * SR), a.R.subarray(s, s + 3 * SR)]));
  st3.sort((p, q) => p - q);
  assert.ok(Math.abs(st3[st3.length >> 1] - AMBIENCE_LUFS['meadow-night']) < 0.05);
  // and it keeps living: the 2 s loudness varies, but within a calm range (no holes, no bursts)
  const st = []; for (let s = 0; s + 2 * SR <= a.L.length; s += SR) st.push(loudness([a.L.subarray(s, s + 2 * SR), a.R.subarray(s, s + 2 * SR)]));
  assert.ok(Math.max(...st) - Math.min(...st) < 12, `short-term range ${Math.min(...st)}..${Math.max(...st)}`);
});

test('loudness and true peak meters match BS.1770 references', () => {
  const sine = Float32Array.from({ length: 5 * SR }, (_, i) => Math.sin((2 * Math.PI * 997 * i) / SR));
  assert.ok(Math.abs(loudness([sine]) - -3.01) < 0.1, `${loudness([sine])}`);
  assert.ok(Math.abs(loudness([sine, sine]) - 0) < 0.1);
  const isp = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * i) / 4 + Math.PI / 4)); // samples at ±0.707, true peak 1
  assert.ok(Math.abs(truePeak([isp]) - 1) < 0.03, `${truePeak([isp])}`);
  assert.equal(loudness([new Float32Array(SR)]), -Infinity);
});

test('hashStr is stable', () => {
  assert.equal(hashStr('owl-hoot'), hashStr('owl-hoot'));
  assert.notEqual(hashStr('owl-hoot'), hashStr('owl-hoop'));
});

// ───────────── DESIGN §9.3: voices, water, wind swell, music box ─────────────

const energy = (x, t0, t1) => { let e = 0; for (let i = Math.max(0, Math.round(t0 * SR)); i < Math.min(x.length, Math.round(t1 * SR)); i++) e += x[i] * x[i]; return e; };
const midiHz = m => 440 * 2 ** ((m - 69) / 12);
/** F0 (Hz) by normalized autocorrelation over [t0, t1], searching lo–hi Hz, refined by a parabola. */
function pitch(x, t0, t1, lo = 70, hi = 1100) {
  const a = Math.round(t0 * SR), n = Math.round((t1 - t0) * SR), c = L => { let s = 0, p = 0, q = 0; for (let i = a; i < a + n; i++) { s += x[i] * x[i + L]; p += x[i] ** 2; q += x[i + L] ** 2; } return s / Math.sqrt(p * q + 1e-20); };
  let best = 0, bl = 0; const r = [];
  for (let L = Math.floor(SR / hi); L <= Math.ceil(SR / lo); L++) { r[L] = c(L); if (r[L] > best) { best = r[L]; bl = L; } }
  // prefer the shortest lag that is nearly as good (no octave errors)
  for (let L = Math.floor(SR / hi); L < bl; L++) if (r[L] > 0.9 * best && r[L] >= (r[L - 1] ?? 0) && r[L] >= (r[L + 1] ?? 0)) { bl = L; break; }
  const y0 = c(bl - 1), y1 = c(bl), y2 = c(bl + 1), d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return SR / (bl + d);
}
const cents = (f, m) => 1200 * Math.log2(f / midiHz(m));

test('round 2 effects are registered; gate-creak is a door creak; laughs are not synthesized', () => {
  for (const n of ['hum', 'music-box', 'gasp', 'sniff', 'snore', 'breath', 'slosh', 'bubbles', 'wind-swell', 'drip']) assert.ok(SFX_NAMES.includes(n), n);
  assert.equal(SFX_ALIASES['gate-creak'], 'door-creak');
  assert.ok(same(makeSfx('gate-creak', { seed: 3 }), makeSfx('door-creak', { seed: 3 })));
  assert.ok(!SFX_NAMES.includes('laugh') && !('laugh' in SFX_ALIASES));
  assert.throws(() => makeSfx('laugh'), /unknown sfx/);
});

test('parseNotes reads note:beats tokens, accidentals and rests', () => {
  assert.deepEqual(parseNotes('G4:1 E4:0.5 C5'), [{ midi: 67, beats: 1 }, { midi: 64, beats: 0.5 }, { midi: 72, beats: 1 }]);
  assert.deepEqual(parseNotes(['F#3:0.25', 'Bb2:2', 'r:1']), [{ midi: 54, beats: 0.25 }, { midi: 46, beats: 2 }, { midi: null, beats: 1 }]);
  assert.throws(() => parseNotes('H4:1'), /bad note/);
  assert.throws(() => parseNotes('G4:0'), /bad note/);
});

test('hum: Young Nell hums the motif in time and in tune (child, 100 bpm)', () => {
  const x = makeSfx('hum', { seed: 1, notes: 'G4:1 E4:0.5 G4:0.5 A4:2 C5:3', tempo: 100, voice: 'child' });
  const beat = 0.6, lead = 0.35, mids = [67, 64, 67, 69, 72], beats = [1, 0.5, 0.5, 2, 3];
  let b = 0;
  mids.forEach((m, i) => {
    const tc = lead + (b + beats[i] / 2) * beat, half = Math.min(0.06, beats[i] * beat * 0.2); b += beats[i];
    const f = pitch(x, tc - half, tc + half);
    assert.ok(Math.abs(cents(f, m)) < 60, `note ${i + 1}: ${f.toFixed(1)} Hz vs ${midiHz(m).toFixed(1)}`);
  });
  assert.ok(Math.abs(x.length / SR - (lead + 7 * beat + 0.26 + 0.5)) < 0.3, `length ${x.length / SR}`);
  // breath in before the first note (audible, but well under the voice)
  const inhale = energy(x, 0.05, 0.3), voice = energy(x, 0.6, 0.85);
  assert.ok(inhale > 0 && inhale < voice / 10);
});

test('hum: an old voice hums in her own range, wobbles, and the closed lips keep it dark', () => {
  const notes = 'G4:1 E4:0.5 G4:0.5 A4:2', elder = makeSfx('hum', { seed: 2, notes, tempo: 72, voice: 'elder' });
  const lead = 0.56, beat = 60 / 72, tA = lead + 3 * beat; // the held A
  assert.ok(Math.abs(cents(pitch(elder, tA, tA + 0.1, 70, 600), 57)) < 70, 'A3: an octave below the written A4');
  const asWritten = makeSfx('hum', { seed: 2, notes, tempo: 72, voice: 'elder', transpose: 0 });
  assert.ok(Math.abs(cents(pitch(asWritten, tA, tA + 0.1, 70, 900), 69)) < 70, 'transpose: 0 keeps A4');
  assert.ok(Math.abs(cents(pitch(makeSfx('hum', { seed: 2, notes, voice: 'child' }), 0.5, 0.6), 67)) < 70, 'a child hums it where it is written');
  // a living voice: the held note's pitch moves (vibrato, drift), but stays on the note
  const fs = []; for (let t = tA + 0.3; t < tA + 1.3; t += 0.04) fs.push(cents(pitch(elder, t, t + 0.04, 150, 400), 57));
  const mean = fs.reduce((a, v) => a + v, 0) / fs.length, sd = Math.sqrt(fs.reduce((a, v) => a + (v - mean) ** 2, 0) / fs.length);
  assert.ok(sd > 5 && sd < 60 && Math.abs(mean) < 60, `held A3: mean ${mean.toFixed(0)}, sd ${sd.toFixed(1)} cents`);
  // closed lips: little energy above 4 kHz for every voice
  for (const voice of ['child', 'adult', 'elder']) {
    const h = makeSfx('hum', { seed: 4, voice }), hp = filt(Float32Array.from(h), 'hp', 4000, 0.7);
    assert.ok(10 * Math.log10(energy(hp, 0, 9) / energy(h, 0, 9)) < -20, voice);
  }
  // humans never hum the same way twice
  assert.ok(!same(makeSfx('hum', { seed: 5, voice: 'child' }), makeSfx('hum', { seed: 6, voice: 'child' })));
  assert.throws(() => makeSfx('hum', { voice: 'robot' }), /unknown voice/);
});

test('music box: plays the notes up an octave and the spring runs down (slow)', () => {
  const p = { seed: 1, notes: 'G4:1 E4:0.5 G4:0.5 A4:2', tempo: 92 };
  const even = makeSfx('music-box', { ...p, slow: 0 }), tired = makeSfx('music-box', { ...p, slow: 0.6 });
  assert.ok(tired.length - even.length > 0.3 * SR, 'the last pluck comes later as the tempo falls');
  const g = filt(Float32Array.from(even.subarray(0, 0.4 * SR)), 'bp', midiHz(79), 30), g0 = filt(Float32Array.from(even.subarray(0, 0.4 * SR)), 'bp', midiHz(67), 30);
  assert.ok(energy(g, 0, 0.4) > 10 * energy(g0, 0, 0.4), 'G5, not G4');
  const low = makeSfx('music-box', { ...p, octave: 0 }), h = filt(Float32Array.from(low.subarray(0, 0.4 * SR)), 'bp', midiHz(67), 30);
  assert.ok(energy(h, 0, 0.4) > energy(g0, 0, 0.4) * 10, 'octave: 0 plays as written');
});

test('snore: a low reedy in-breath, whole breaths fitted into dur', () => {
  const x = makeSfx('snore', { seed: 1, dur: 2 });
  assert.equal(x.length, Math.round(2.3 * SR));
  const f = pitch(x, 0.5, 0.75, 35, 200);
  assert.ok(f > 40 && f < 80, `reed ${f.toFixed(1)} Hz`);
  const two = makeSfx('snore', { seed: 1, dur: 5 });
  assert.ok(energy(two, 2.6, 3.5) > 4 * energy(two, 2.3, 2.45), 'a second snore follows a pause');
});

test('gasp is an in-breath that builds and stops; sniffs; breathing; wind swell rises', () => {
  for (const seed of [1, 2, 3]) { const g = makeSfx('gasp', { seed }); assert.ok(energy(g, 0.15, 0.29) > energy(g, 0.01, 0.14), `gasp ${seed} builds`); assert.ok(g.length < 1.2 * SR); }
  assert.ok(makeSfx('sniff', { seed: 1, count: 1 }).length < makeSfx('sniff', { seed: 1 }).length, 'count');
  const heavy = makeSfx('breath', { seed: 1, heavy: 1 }), calm = makeSfx('breath', { seed: 1 });
  assert.ok(heavy.length > calm.length, 'heavy breathing: several quick breaths');
  assert.ok(makeSfx('breath', { seed: 1, heavy: 1, count: 5 }).length > heavy.length);
  const w = makeSfx('wind-swell', { seed: 1, dur: 2 });
  assert.equal(w.length, Math.round(2.08 * SR));
  assert.ok(energy(w, 1.6, 2) > 30 * energy(w, 0, 0.4), 'swells to its loudest at the end');
});

test('water: slosh and bubbles honour dur; drip honours count', () => {
  assert.equal(makeSfx('slosh', { seed: 1, dur: 3 }).length, Math.round(3.7 * SR));
  assert.equal(makeSfx('bubbles', { seed: 1, dur: 1 }).length, Math.round(1.5 * SR));
  const one = makeSfx('drip', { seed: 1, count: 1, dur: 1 }), many = makeSfx('drip', { seed: 1, count: 6, dur: 1 });
  assert.ok(energy(many, 0.12, 1.2) > 10 * energy(one, 0.12, 1.2), 'more drops after the first');
});

test('no effect makes NaN from a zero or negative dur (snore, wind-swell, rustle divided by it)', () => {
  for (const name of SFX_NAMES) for (const dur of [0, -1]) {
    const x = makeSfx(name, { seed: 3, dur });
    assert.ok(x.length > 0 && finite(x), `${name} dur ${dur}`);
  }
});
