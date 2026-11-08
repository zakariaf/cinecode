import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mixFilm, writeMaster, duckGain, limit, linePan, parseLoudnorm, voiceSamples, MIX_DEFAULTS } from '../engine/audio/mix.mjs';
import { loudness } from '../engine/audio/sfx.mjs';
import { writeWav, readWav } from '../engine/audio/wav.mjs';

const SR = 48000;
const tone = (f, dur, amp = 0.3, sr = SR) => Float32Array.from({ length: Math.round(dur * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.min(1, i / (0.02 * sr), (dur * sr - i) / (0.02 * sr)));
/** Speech-like: a 1 kHz tone gated into 4 syllables per second (with short gaps the duck must bridge). */
const speechy = dur => tone(1000, dur, 0.3).map((v, i) => v * (((i / SR) * 4) % 1 < 0.8 ? 1 : 0.02));
/** Amplitude of frequency f in x over [t0, t1] (Goertzel). */
function level(x, f, t0, t1) {
  const a = Math.round(t0 * SR), b = Math.round(t1 * SR), w = (2 * Math.PI * f) / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2)) / (b - a);
}
const db = g => 20 * Math.log10(g);
const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const music = dur => { const x = tone(200, dur, 0.2); return { L: x, R: Float32Array.from(x) }; };

test('length follows plan.duration; output finite and under the ceiling', () => {
  const plan = { duration: 3.5, lines: [], sfx: [{ t: 0.5, name: 'thud' }, { t: 1.2, name: 'splash', pan: 0.6 }], ambience: [{ t0: 0, t1: 3.5, name: 'stream' }] };
  const m = mixFilm(plan, { music: music(3.5) });
  assert.equal(m.L.length, 3.5 * SR); assert.equal(m.R.length, 3.5 * SR);
  assert.ok(m.L.every(Number.isFinite) && m.R.every(Number.isFinite));
  assert.ok(Math.max(peak(m.L), peak(m.R)) <= Math.pow(10, MIX_DEFAULTS.ceiling / 20) + 1e-6);
  assert.equal(mixFilm({ duration: 0.5 }).L.length, 0.5 * SR); // an empty plan is silence, not an error
});

test('music ducks about 10 dB under dialogue, smoothly, and comes back', () => {
  const voices = new Map([['l1', { wav: speechy(2), dur: 2 }]]);
  const plan = { duration: 8, lines: [{ id: 'l1', who: 'narrator', narrator: true, t0: 3, t1: 5 }], sfx: [], ambience: [] };
  const m = mixFilm(plan, { voices, music: music(8) });
  const before = level(m.L, 200, 1, 2.5), during = level(m.L, 200, 3.4, 4.8), after = level(m.L, 200, 6.5, 7.8);
  const dip = db(during / before);
  assert.ok(dip < -8 && dip > -12, `dip ${dip.toFixed(1)} dB`);
  assert.ok(Math.abs(db(after / before)) < 1, `recovery ${db(after / before).toFixed(2)} dB`);
  assert.ok(level(m.L, 1000, 3.4, 4.8) > 4 * level(m.L, 200, 3.4, 4.8), 'dialogue on top of the music');
});

test('duckGain: look-ahead start, holds through word gaps, attack/release times', () => {
  const x = new Float32Array(6 * SR);
  x.set(speechy(2), 2 * SR);
  const { gain, db: d } = duckGain(x, { depth: -10, attack: 0.15, release: 0.4, lookahead: 0.1, hold: 0.25 });
  assert.equal(gain.length, x.length);
  assert.ok(Math.abs(d[Math.round(1.5 * SR)]) < 1e-6, 'unity well before speech');
  assert.ok(d[Math.round(2 * SR)] < -1, 'already dipping when speech starts (look-ahead)');
  assert.ok(d[Math.round(1.9 * SR) + Math.round(0.15 * SR)] < -8.5, '90 % of the dip within the attack time');
  const mid = d.slice(Math.round(2.5 * SR), Math.round(3.9 * SR));
  assert.ok(Math.max(...mid) < -9.5, 'no release in the gaps between syllables');
  const end = 4 + 0.25; // speech end + hold
  assert.ok(d[Math.round((end + 0.4) * SR)] > -1.5, 'released after the release time');
  for (let i = 1; i < d.length; i++) assert.ok(Math.abs(d[i] - d[i - 1]) < 0.01, 'gain moves smoothly'); // no steps
});

test('limiter: nothing exceeds the ceiling and quiet material is untouched', () => {
  const L = Float32Array.from({ length: SR }, (_, i) => (i > 24000 && i < 24100 ? 1.6 : 0.1) * Math.sin(i / 7)), R = Float32Array.from(L);
  const o = limit(L, R, 0.89);
  assert.ok(peak(o.L) <= 0.89 + 1e-6);
  assert.ok(Math.abs(o.L[1000] - L[1000]) < 1e-6, 'far from the peak the gain is 1');
});

test('effects land at their time, panned', () => {
  const m = mixFilm({ duration: 2, sfx: [{ t: 1.0, name: 'knock', pan: 0.8 }] }, { sfxReverb: 0 });
  const onset = m.R.findIndex(v => Math.abs(v) > 1e-4);
  assert.ok(Math.abs(onset / SR - 1.0) < 0.01, `onset ${onset / SR}`);
  let eL = 0, eR = 0; for (let i = 0; i < m.L.length; i++) { eL += m.L[i] ** 2; eR += m.R[i] ** 2; }
  assert.ok(eR > 4 * eL, 'panned right');
  // unknown effects are skipped with a warning, not fatal
  assert.doesNotThrow(() => mixFilm({ duration: 1, sfx: [{ t: 0.2, name: 'no-such-sound' }] }));
});

test('ambience beds fade in, cross-fade and continue across back-to-back segments', () => {
  const plan = { duration: 6, ambience: [{ t0: 0, t1: 2, name: 'meadow-day' }, { t0: 2, t1: 4, name: 'meadow-day' }, { t0: 4, t1: 6, name: 'stream' }] };
  const m = mixFilm(plan);
  assert.ok(Math.abs(m.L[0]) < 1e-4, 'starts from silence');
  const rmsAt = t => { let s = 0; const a = Math.round(t * SR); for (let i = a; i < a + 4800; i++) s += m.L[i] ** 2; return Math.sqrt(s / 4800); };
  assert.ok(rmsAt(1.9) > 0.002 && rmsAt(2.0) > 0.002 && rmsAt(4.0) > 0.002, 'no hole at the joins');
});

test('voices: WAV paths at 24 kHz are resampled, normalized and centred for the narrator', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-mix-'));
  try {
    const p = join(dir, 'l1.wav');
    const take = tone(1000, 2, 0.06, 24000).map((v, i) => v * (((i / 24000) * 4) % 1 < 0.8 ? 1 : 0.02));
    writeWav(p, [take], 24000); // a quiet take at 24 kHz
    assert.equal(voiceSamples({ wav: p }).length, 2 * SR);
    assert.equal(voiceSamples({ wav: tone(440, 1, 0.3, 24000), sampleRate: 24000 }).length, SR, 'voice.mjs-style entry at another rate');
    const m = mixFilm({ duration: 3, lines: [{ id: 'l1', who: 'narrator', narrator: true, t0: 0.5, t1: 2.5 }] }, { voices: new Map([['l1', { wav: p, dur: 2 }]]) });
    const lu = loudness([m.L.subarray(0.5 * SR, 2.5 * SR), m.R.subarray(0.5 * SR, 2.5 * SR)]);
    assert.ok(Math.abs(lu - MIX_DEFAULTS.dialogueLufs) < 1.5, `dialogue at ${lu.toFixed(1)} LUFS`);
    assert.ok(Math.abs(level(m.L, 1000, 1, 2) - level(m.R, 1000, 1, 2)) < 1e-4, 'narrator centred');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('linePan follows the speaker on screen; narration stays centred', () => {
  const plan = { W: 1920, shots: [{ t0: 0, t1: 10, cameraAt: () => ({ cx: 1000, cy: 800, zoom: 1 }) }], actorsAt: () => [{ id: 'fox', x: 1700, visible: true }, { id: 'owl', x: 300 }] };
  assert.ok(linePan(plan, { who: 'fox', t0: 1, t1: 2 }) > 0.2);
  assert.ok(linePan(plan, { who: 'owl', t0: 1, t1: 2 }) < -0.2);
  assert.equal(linePan(plan, { who: 'narrator', narrator: true, t0: 1, t1: 2 }), 0);
  assert.equal(linePan(plan, { who: 'fox', vo: true, t0: 1, t1: 2 }), 0);
  assert.equal(linePan({}, { who: 'fox', t0: 1, t1: 2 }), 0);
  assert.equal(linePan(plan, { who: 'fox', t0: 1, t1: 2, pan: -0.5 }), -0.5);
});

test('mixFilm is deterministic', () => {
  const plan = { duration: 3, sfx: [{ t: 0.3, name: 'footstep-grass' }, { t: 0.8, name: 'birdsong', pan: -0.4 }, { t: 1.5, name: 'owl-hoot' }], ambience: [{ t0: 0, t1: 3, name: 'forest-night' }] };
  const a = mixFilm(plan, { music: music(3) }), b = mixFilm(plan, { music: music(3) });
  assert.ok(a.L.every((v, i) => v === b.L[i]) && a.R.every((v, i) => v === b.R[i]));
});

test('writeMaster: two-pass loudnorm call shape (mocked ffmpeg), temp file cleaned up', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-master-'));
  try {
    const calls = [], measured = { input_i: '-17.20', input_tp: '-2.10', input_lra: '14.50', input_thresh: '-27.60', target_offset: '0.30' };
    const run = (cmd, args) => {
      calls.push([cmd, args]);
      const json = calls.length === 1 ? measured : { ...measured, output_i: '-16.01', output_tp: '-1.80', normalization_type: 'linear' };
      return { status: 0, stderr: `ffmpeg noise\n[Parsed_loudnorm_0 @ 0x1]\n${JSON.stringify(json, null, 2)}\n` };
    };
    const mix = mixFilm({ duration: 2, sfx: [{ t: 0.2, name: 'bell' }] }), out = join(dir, 'master.wav');
    const info = writeMaster(out, mix, { run });
    assert.equal(calls.length, 2);
    const [c1, a1] = calls[0], [, a2] = calls[1];
    assert.equal(c1, 'ffmpeg');
    assert.ok(a1.includes('-af') && a1[a1.indexOf('-af') + 1] === 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json');
    assert.deepEqual(a1.slice(-3), ['-f', 'null', '-']);
    const af2 = a2[a2.indexOf('-af') + 1];
    for (const k of ['I=-16', 'TP=-1.5', 'LRA=16', 'measured_TP=-2.10', 'measured_LRA=14.50', 'measured_thresh=-27.60', 'offset=0.30', 'linear=true']) assert.ok(af2.includes(k), `${k} in ${af2}`);
    // pass 1 said −17.2 but the pre-normalized file is exactly −16 by BS.1770: the exact reading wins
    assert.match(af2, /measured_I=-1(5\.[89]|6\.[01])\d/);
    assert.equal(a2[a2.indexOf('-ar') + 1], '48000');
    assert.equal(a2[a2.indexOf('-c:a') + 1], 'pcm_s24le');
    assert.equal(a2[a2.length - 1], out);
    assert.ok(a1.indexOf('-i') >= 0 && a1[a1.indexOf('-i') + 1] === a2[a2.indexOf('-i') + 1], 'both passes read the same temp file');
    assert.equal(readdirSync(dir).length, 0, 'temp WAV removed');
    assert.equal(info.linear, true);
    assert.ok(Number.isFinite(info.preGainDb));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('parseLoudnorm reads the last JSON block', () => {
  assert.equal(parseLoudnorm('x {"a":1}\nmore\n{\n "input_i" : "-20.0"\n}\n').input_i, '-20.0');
  assert.throws(() => parseLoudnorm('no json'), /no JSON/);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('writeMaster with real ffmpeg: 48 kHz 24-bit at −16 LUFS, under −1.5 dBTP', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-master-'));
  try {
    const voices = new Map([['l1', { wav: speechy(2), dur: 2 }]]);
    const plan = { duration: 6, lines: [{ id: 'l1', who: 'narrator', narrator: true, t0: 1, t1: 3 }], sfx: [{ t: 4, name: 'splash' }], ambience: [{ t0: 0, t1: 6, name: 'meadow-day' }] };
    const out = join(dir, 'master.wav'), info = writeMaster(out, mixFilm(plan, { voices, music: music(6) }));
    assert.ok(existsSync(out));
    const buf = readFileSync(out), w = readWav(out);
    assert.equal(w.sampleRate, 48000); assert.equal(w.channels.length, 2);
    assert.equal(buf.readUInt16LE(34), 24, 'bits per sample');
    assert.ok(Math.abs(w.channels[0].length / 48000 - 6) < 0.01);
    assert.ok(info.linear, 'loudnorm stayed linear (pure gain)');
    assert.ok(Math.abs(info.lufs + 16) < 0.3, `output ${info.lufs} LUFS`);
    assert.ok(+info.result.output_tp <= -1.4, `true peak ${info.result.output_tp}`);
    assert.ok(Math.abs(loudness(w.channels) + 16) < 0.7);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
