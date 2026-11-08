import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSfx, ambience, SFX_NAMES, SFX_LEVELS, AMBIENCE_NAMES, AMBIENCE_LUFS, loudness, peakLoudness, truePeak, hashStr } from '../engine/audio/sfx.mjs';

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
