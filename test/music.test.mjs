// Tests for engine/audio/synth.mjs and engine/audio/music.mjs. No network. Run: node --test test/music.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../engine/audio/synth.mjs';
import { composeCue, planCue, scoreFilm, makeSting, chord, chordScale, voiceLead, keyPc, keyMode, noteMidi, parseMotif, motifDegrees, SCALES, MOODS, MOOD_NAMES, STING_NAMES, MOTIF_VOICES } from '../engine/audio/music.mjs';

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
// a slurred step, a bow change and a held note (seconds; for the bowed-line voices)
const BOWLINE = f => [{ t: 0, dur: 0.4, freq: f, vel: 0.6 }, { t: 0.4, dur: 0.3, freq: f * 2 ** (-3 / 12), vel: 0.6, slur: true }, { t: 0.7, dur: 1.2, freq: f * 2 ** (2 / 12), vel: 0.7 }];
const MOTIF = 'G4:1 E4:0.5 G4:0.5 A4:2 C5:3';
function rmsAt(x, a, b) { let s = 0; const i0 = Math.round(a * SR), i1 = Math.round(b * SR); for (let i = i0; i < i1; i++) s += x.L[i] * x.L[i] + x.R[i] * x.R[i]; return 10 * Math.log10(s / (2 * (i1 - i0)) + 1e-20); }
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
    bassoon: () => S.flute(196, 1, { timbre: 'bassoon' }), brass: () => S.flute(131, 0.3, { vel: 0.95, timbre: 'brass' }),
    cello: () => S.bowedLine(BOWLINE(196), { timbre: 'cello' }), viola: () => S.bowedLine(BOWLINE(330), { timbre: 'viola' }), violin: () => S.bowedLine(BOWLINE(440), { timbre: 'violin' }),
    musicBox: () => S.musicBox(784, 0.4), cymbal: () => S.cymbal(0.7, { decay: 1.5 }), cymbalRoll: () => S.cymbalRoll(0.8, { decay: 1 }),
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

// ---------------------------------------------------------------- round 2: new voices
test('bowed lines, bassoon and music box are in tune; bowed lines vibrate (delayed) and change bow without clicks', () => {
  const m = S.mtof;
  for (const [timbre, midi] of [['cello', 45], ['viola', 57], ['violin', 69]]) {
    const x = S.bowedLine([{ t: 0, dur: 2.5, freq: m(midi), vel: 0.6 }], { timbre, seed: 3 });
    assert.ok(Math.abs(centsOff(x, m(midi), Math.round(0.8 * SR), Math.round(2.4 * SR))) <= 4, `${timbre} in tune`);
    // vibrato: pitch deviation is small right after the onset and larger once it has set in
    const dev = (a, b) => { let lo = 0, hi = 0; for (let t = a; t < b; t += 0.05) { const c = centsOff(x, m(midi), Math.round(t * SR), Math.round((t + 0.06) * SR)); lo = Math.min(lo, c); hi = Math.max(hi, c); } return hi - lo; };
    assert.ok(dev(1.4, 2.3) > dev(0.02, 0.12) + 4, `${timbre} vibrato is delayed (${dev(0.02, 0.12)} → ${dev(1.4, 2.3)} c)`);
  }
  assert.ok(Math.abs(centsOff(S.flute(S.mtof(55), 2, { timbre: 'bassoon', seed: 2 }), S.mtof(55), 24000, 72000)) <= 4, 'bassoon in tune');
  assert.ok(Math.abs(centsOff(S.musicBox(S.mtof(79), 0.5, { seed: 1 }), S.mtof(79), 2400, 24000)) <= 6, 'music box within its few cents of charm');
  assert.ok(same(S.bowedLine(BOWLINE(220), { seed: 4 }), S.bowedLine(BOWLINE(220), { seed: 4 })), 'deterministic');
});

test('cymbal roll is made of strokes: louder as it crescendos, and it rings after the last stroke', () => {
  const x = S.cymbalRoll(1.6, { v0: 0.05, v1: 0.8, decay: 1.2, seed: 2 }), r = (a, b) => rmsAt({ L: x, R: x }, a, b);
  assert.ok(r(1.3, 1.6) > r(0.1, 0.4) + 10, 'crescendo');
  assert.ok(r(1.7, 1.9) > -60, 'rings on');
  assert.ok(x.every(Number.isFinite));
});

// ---------------------------------------------------------------- round 2: motif theory
test('parseMotif / noteMidi / keyMode / motifDegrees', () => {
  assert.deepEqual(parseMotif(MOTIF).map(n => [n.midi, n.beats]), [[67, 1], [64, 0.5], [67, 0.5], [69, 2], [72, 3]]);
  assert.deepEqual(parseMotif('Bb3 F#4:2').map(n => [n.midi, n.beats]), [[58, 1], [66, 2]]);
  assert.deepEqual(parseMotif([['C4', 2], { note: 'D4', beats: 0.5 }, 'E4:1']).map(n => n.midi), [60, 62, 64]);
  assert.deepEqual(parseMotif(''), []);
  assert.throws(() => parseMotif('H4:1')); assert.throws(() => parseMotif('C4:0')); assert.throws(() => parseMotif('C4:x'));
  assert.equal(noteMidi('A4'), 69); assert.equal(noteMidi('C-1'), 0);
  assert.equal(keyMode('Am'), 'minor'); assert.equal(keyMode('A minor'), 'minor'); assert.equal(keyMode('C major'), 'major'); assert.equal(keyMode('Eb'), 'major');
  assert.deepEqual(motifDegrees(parseMotif(MOTIF), 'C').map(n => [n.d, n.acc]), [[4, 0], [2, 0], [4, 0], [5, 0], [7, 0]]);
  assert.deepEqual(motifDegrees(parseMotif('A4 C5 E5 A3'), 'Am').map(n => n.d), [0, 2, 4, -7]);   // degrees from the tonic in octave 4
});

test('STING_NAMES: every sting renders, lands its accent and stays under the ceiling', () => {
  assert.deepEqual(STING_NAMES, ['surprise', 'sad', 'triumph', 'magic', 'plunk', 'stab', 'swell']);
  for (const name of ['plunk', 'stab', 'swell']) {
    const s = makeSting(name, { key: 'C', seed: 2 }), st = stats(s), hit = s.hit;
    assert.equal(st.nan, 0, name); assert.ok(st.peak <= CEIL, `${name} peak`);
    assert.ok(worstClick(s.L) < 15, `${name} no clicks`);
    // the loudest moment is at the hit (a swell crests into it), and the sting clears out after it
    let best = 0, bt = 0; for (let t = 0; t + 0.1 < s.L.length / SR; t += 0.05) { const r = rmsAt(s, t, t + 0.1); if (r > best || !bt) { best = r; bt = t; } }
    assert.ok(bt >= hit - 0.4 && bt <= hit + 0.3, `${name} loudest at ${bt.toFixed(2)} s, hit at ${hit} s`);
    assert.ok(rmsAt(s, hit, hit + 0.15) > rmsAt(s, hit + 0.8, hit + 1) + 4, `${name} louder at the hit than in its tail`);
  }
  assert.ok(makeSting('plunk').L.length < 2 * SR, 'plunk is short');
  const sw = makeSting('swell', { key: 'D' });
  assert.ok(rmsAt(sw, sw.hit - 0.3, sw.hit) > rmsAt(sw, 0, 0.3) + 12, 'swell crescendos into its crest');
});

// ---------------------------------------------------------------- round 2: motif statements
const motifCue = ({ motif = {}, ...o } = {}) => planCue({ dur: 14, mood: 'tender', intensity: 0.4, key: 'C', seed: 3, motif: { notes: MOTIF, key: 'C', n: 4, voice: 'cello', ...motif }, ...o });
const motifEvents = C => C.ev.filter(e => e.tag === 'motif').sort((a, b) => a.t - b.t);

test('a motif cue states the first n notes from bar 1 at the cue tempo, on its voice, in its octave', () => {
  const C = motifCue({ tempo: 60 });
  assert.equal(C.tempo, 60);
  const ev = motifEvents(C).filter(e => e.inst === 'cello');
  assert.deepEqual(ev.map(e => e.midi), [55, 52, 55, 57], 'G3 E3 G3 A3: the cello plays it an octave down');
  const onsets = ev.map(e => e.t);
  [0, 1, 1.5, 2].forEach((b, k) => assert.ok(Math.abs(onsets[k] - b) < 0.08, `note ${k + 1} on beat ${b} (${onsets[k].toFixed(3)} s)`));
  assert.ok(ev[3].t + ev[3].dur > C.t(C.motif.R * C.meter) - 0.6, 'the A hangs to the end of the statement');
  assert.ok(!C.ev.some(e => e.tag !== 'motif' && ['piano', 'strings', 'flute', 'clarinet', 'celesta'].includes(e.inst) && e.t < C.t(C.motif.R * C.meter) - 0.3 && e.line), 'no other melody line under the statement');
  // voices and octaves
  const first = voice => motifEvents(motifCue({ motif: { voice } }))[0];
  assert.equal(first('bassoon').inst, 'bassoon'); assert.equal(first('bassoon').midi, 55);
  assert.equal(first('flute').midi, 67); assert.equal(first('violin').inst, 'violin'); assert.equal(first('violin').midi, 67);
  assert.equal(first('celesta').midi, 79); assert.equal(first('music-box').inst, 'musicBox');
  assert.equal(first('strings').inst, 'viola', 'strings = a divisi section of bowed violas in this register');
  const tutti = motifEvents(motifCue({ motif: { voice: 'tutti', n: 5 } }));
  for (const inst of ['horn', 'strings', 'flute']) assert.ok(tutti.some(e => e.inst === inst), `tutti has ${inst}`);
  assert.equal(MOTIF_VOICES.length, 9);
});

test('the statement is harmonised: every long or strong motif note is a chord tone, in every mood (A over IV, not I)', () => {
  for (const mood of MOOD_NAMES) for (const n of [4, 5]) {
    const C = planCue({ dur: 16, mood, intensity: 0.5, key: 'C', seed: 1, motif: { notes: MOTIF, key: 'C', n, voice: 'strings' } });
    for (const e of C.motif.evs) {
      if (e.len < 1 && Math.abs(e.beat - Math.round(e.beat)) > 1e-6) continue;
      for (let b = e.beat; b < e.beat + Math.min(e.len, C.motif.R * C.meter - e.beat); b += 0.5) assert.ok(C.chordAt(b + 1e-6).pcs.includes(e.pc), `${mood}: motif pc ${e.pc} at beat ${b} over ${C.chordAt(b + 1e-6).sym}`);
    }
  }
  const C = planCue({ dur: 16, mood: 'pastoral', intensity: 0.5, key: 'C', seed: 1, motif: { notes: MOTIF, key: 'C', n: 4 } });
  assert.equal(C.chordAt(2.01).sym, 'IV', 'G E G | A → I | IV');
  const minor = planCue({ dur: 16, mood: 'sad', key: 'C', seed: 1, motif: { notes: MOTIF, key: 'C', n: 4 } });
  assert.equal(minor.motif.evs[3].pc, 8, 'in a minor mood the A of a C-major motif is A-flat');
});

test('hold: the last stated note sustains to the end over chords that all contain it, no melody, no friction', () => {
  const C = planCue({ dur: 24, mood: 'night', intensity: 0.3, key: 'C', seed: 2, motif: { notes: MOTIF, key: 'C', n: 4, voice: 'strings', hold: true }, cut: 20 });
  assert.equal(C.form.kind, 'pedal');
  const ev = motifEvents(C), lastEnd = Math.max(...ev.map(e => e.t + e.dur));
  assert.ok(lastEnd >= 24, 'the A is held past the end of the cue');
  assert.ok(ev.filter(e => e.t > 3).every(e => e.midi === 69), 'only the held A after the statement');
  const pedal = C.bars.filter(b => b.section === 'pedal');
  assert.ok(pedal.length >= 4);
  for (const b of pedal) for (const c of b.chords) {
    assert.ok(c.ch.pcs.includes(9), `${c.ch.sym} contains A`);
    assert.ok(!c.ch.pcs.some(pc => pc !== 9 && Math.abs(((pc - 9 + 18) % 12) - 6) <= 2), `${c.ch.sym} has no tone within a whole step of A`);
  }
  assert.ok(new Set(pedal.map(b => b.chords[0].ch.sym)).size >= 2, 'the harmony moves under the pedal');
  const cutBar = pedal.find(b => C.t(b.start) <= 20 && C.t(b.start + C.meter) > 20);
  assert.equal(cutBar.chords[0].ch.sym, 'IV', 'arrives on IV where it is cut');
  assert.ok(!C.ev.some(e => e.tag !== 'motif' && e.line != null && e.t > C.t(C.motif.R * C.meter)), 'no melody lines over the pedal');
  // the held note can be heard: A4 dominates its neighbours in the last seconds of the rendered cue
  const x = composeCue({ dur: 14, mood: 'night', intensity: 0.3, key: 'C', seed: 2, motif: { notes: MOTIF, key: 'C', n: 4, voice: 'strings', hold: true } });
  const a = Math.round(8 * SR), b = Math.round(11 * SR), mono = x.L.map((v, i) => v + x.R[i]);
  assert.ok(goertzel(mono, 440, a, b) > 4 * Math.max(goertzel(mono, 415.3, a, b), goertzel(mono, 466.2, a, b)), 'held A4 is clearly there');
  // a struck voice re-strikes once a bar and is shadowed by soft violas
  const cel = planCue({ dur: 16, mood: 'tender', intensity: 0.2, key: 'C', seed: 2, motif: { notes: MOTIF, key: 'C', n: 4, voice: 'celesta', hold: true } });
  const ce = motifEvents(cel);
  assert.ok(ce.filter(e => e.inst === 'celesta' && e.midi === 81).length >= 3 && ce.some(e => e.inst === 'viola'));
});

test('downbeat: bar 1 is a struck chord exactly at t = 0 (timpani, bass drum, fast strings)', () => {
  const C = planCue({ dur: 16, mood: 'triumph', intensity: 0.75, key: 'C', seed: 4, downbeat: true, motif: { notes: MOTIF, key: 'C', n: 5, voice: 'tutti' } });
  for (const inst of ['timpani', 'concert', 'cymbal']) assert.ok(C.ev.some(e => e.inst === inst && e.t < 0.005), `${inst} on the downbeat`);
  assert.ok(C.ev.some(e => e.inst === 'strings' && e.t === 0 && e.opts?.attack <= 0.03), 'fast-bowed chord');
  assert.equal(C.chordAt(0).root, 0, 'lands on the tonic');
  const x = C.render();
  assert.ok(rmsAt(x, 0, 0.15) > -24, 'loud from the first instant');
});

test('every motif voice renders cleanly in a cue', () => {
  for (const voice of MOTIF_VOICES) {
    const x = composeCue({ dur: 7, mood: voice === 'tutti' ? 'triumph' : 'tender', intensity: 0.5, key: 'C', seed: 5, motif: { notes: MOTIF, key: 'C', n: 5, voice, hold: voice === 'celesta' } });
    const st = stats(x);
    assert.equal(st.nan, 0, voice); assert.ok(st.peak <= CEIL, `${voice} peak`);
    assert.ok(worstClick(x.L) < 15, `${voice} no clicks (z=${worstClick(x.L).toFixed(1)})`);
  }
});

// ---------------------------------------------------------------- round 2: scoreFilm
test('scoreFilm with a score: one key, motif cues start on t0, downbeat cuts, none fades out, no dropouts', () => {
  const plan = {
    duration: 40, score: { key: 'C', motif: MOTIF },
    music: [
      { t0: 0, t1: 9, mood: 'pastoral', intensity: 0.4, motif: 4, motifVoice: 'bassoon' },
      { t0: 9, t1: 17, mood: 'tender', intensity: 0.35, motif: 4, motifVoice: 'cello' },
      { t0: 17, t1: 25, mood: 'night', intensity: 0.3, motif: 4, motifVoice: 'strings', hold: true },
      { t0: 25, t1: 33, mood: 'triumph', intensity: 0.75, motif: true, motifVoice: 'tutti', downbeat: true },
      { t0: 33, t1: 36, mood: 'none' },
      { t0: 36, t1: 40, mood: 'playful', intensity: 0.4 },
      { t: 25, sting: 'swell' },
    ],
  };
  const x = scoreFilm(plan, { seed: 3 });
  assert.equal(x.L.length, 40 * SR);
  assert.ok(x.cues.every(c => c.tonic === 0), 'every cue in the score key');
  assert.equal(x.cues[1].t0, 9); assert.equal(x.cues[2].t0, 17); assert.equal(x.cues[3].t0, 25);
  assert.ok(Math.abs(x.cues[0].t1 - 10.2) < 1e-6 && Math.abs(x.cues[1].t1 - 18.2) < 1e-6, 'same mode: the final chord is held 1.2 s into the next statement');
  assert.deepEqual(x.cues[3].motif, { n: 5, voice: 'tutti', hold: false });
  const st = stats(x); assert.equal(st.nan, 0); assert.ok(st.peak <= CEIL);
  // no dropout across the motif entries (the outgoing cue's last chord still sounds)
  for (const t0 of [9, 17]) for (let t = t0 - 1.5; t < t0 + 1; t += 0.1) assert.ok(rmsAt(x, t, t + 0.1) > -42, `no dropout at ${t.toFixed(1)} s`);
  // the downbeat: the held pedal is still there just before, and the tutti hits at t0
  assert.ok(rmsAt(x, 24.6, 24.95) > -40, 'pedal sounds up to the cut');
  assert.ok(rmsAt(x, 25, 25.12) > rmsAt(x, 24.4, 24.5) + 4, 'the downbeat lands');
  // none: still playing right up to the cut (not ended early), then 0.3 s fade, then digital silence
  assert.ok(rmsAt(x, 32.2, 32.9) > -35, 'music up to the none cut');
  let tail = 0; for (let i = Math.round(33.31 * SR); i < 36 * SR - 1; i++) tail = Math.max(tail, Math.abs(x.L[i]), Math.abs(x.R[i]));
  assert.equal(tail, 0, 'silent after the fade');
  assert.ok(worstClick(x.L.subarray(24 * SR, 26 * SR)) < 15 && worstClick(x.L.subarray(32 * SR, 34 * SR)) < 15, 'cuts are click-free');
  const y = scoreFilm(plan, { seed: 3 });
  assert.ok(same(x.L, y.L), 'deterministic');
});

test('plain mood crossfades no longer dip into silence', () => {
  const x = scoreFilm({ duration: 26, music: [{ t0: 0, t1: 13, mood: 'pastoral', intensity: 0.4 }, { t0: 13, t1: 26, mood: 'tender', intensity: 0.4 }] }, { seed: 3 });
  let lo = 0; for (let t = 10.5; t < 14.5; t += 0.2) lo = Math.min(lo, rmsAt(x, t, t + 0.2));
  assert.ok(lo > -34, `quietest 0.2 s around the join: ${lo.toFixed(1)} dB`);
});

test('the score motif shapes the procedural melodies (its opening intervals, not the withheld last note)', () => {
  const film = (score, key) => scoreFilm({ duration: 6, ...(score ? { score } : {}), music: [{ t0: 0, t1: 6, mood: 'wonder', intensity: 0.4, key }] }, { seed: 1 }).cues[0];
  const withScore = film({ key: 'C', motif: MOTIF });
  assert.equal(withScore.tonic, 0);
  // G E G A | C: degrees 4 2 4 5 (the last note withheld) → steps -2 +2 +1, repeated through the cue's theme
  assert.deepEqual(withScore.themeSteps.slice(0, 7), [-2, 2, 1, -2, 2, 1, -2], 'scoreFilm hands the motif steps to the cue');
  assert.deepEqual(film({ key: 'C', motif: 'C4:1 D4:1 E4:1 G4:1 C5:2' }).themeSteps.slice(0, 3), [1, 1, 2], 'derived from the motif, not fixed');
  assert.notDeepEqual(film(null, 'C').themeSteps.slice(0, 7), withScore.themeSteps.slice(0, 7), 'without a score the theme is the seeded one');
  // and the steps reach the tunes: the same cue with and without them has different melody notes
  const mel = o => planCue({ dur: 30, mood: 'wonder', intensity: 0.5, key: 'C', seed: 1, ...o }).ev.filter(e => e.inst === 'celesta').map(e => e.midi);   // wonder's tune
  const C = planCue({ dur: 20, mood: 'wonder', themeSteps: [-2, 2, 1] });
  assert.deepEqual(C.theme.steps.slice(0, 4), [-2, 2, 1, -2]);
  assert.ok(mel({}).length > 8);
  assert.notDeepEqual(mel({ themeSteps: [-2, 2, 1] }), mel({}), 'the steps change the melodies');
});

// ---------------------------------------------------------------- round 2 fixes
test('a held pedal at high intensity stays finite in every mood (no octave doublings of the open pedal voicing)', () => {
  const hold = (mood, intensity) => planCue({ dur: 12, mood, intensity, key: 'C', seed: 2, motif: { notes: MOTIF, key: 'C', n: 4, voice: 'strings', hold: true } });
  for (const [mood, I] of [...MOOD_NAMES.map(m => [m, 0.8]), ['wonder', 0.5]]) {
    const C = hold(mood, I), bad = C.ev.filter(e => !Number.isFinite(e.midi) || !Number.isFinite(e.t) || !Number.isFinite(e.dur));
    assert.equal(bad.length, 0, `${mood} I=${I}: ${bad.slice(0, 3).map(e => `${e.inst}@${e.t.toFixed(2)} midi=${e.midi}`).join(', ')}`);
    const pedalStart = C.t(C.motif.R * C.meter);
    assert.ok(!C.ev.some(e => e.inst === 'choir' && e.t >= pedalStart + 0.01 && C.M.pad !== 'choir'), `${mood}: no choir doubling over the pedal`);
  }
  for (const [mood, I] of [['tender', 0.8], ['wonder', 0.5]]) {
    const x = composeCue({ dur: 9, mood, intensity: I, key: 'C', seed: 2, motif: { notes: MOTIF, key: 'C', n: 4, voice: 'strings', hold: true } });
    assert.equal(stats(x).nan, 0, `${mood} I=${I} renders finite samples`);
  }
});

test('motif accidentals: diatonic notes follow the mode, chromatic notes keep their written pitch', () => {
  const NM = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const stated = (notes, mood, key = 'C') => planCue({ dur: 12, mood, intensity: 0.4, key: 'C', seed: 1, motif: { notes, key, n: 5, voice: 'flute' } }).motif.evs.map(e => NM[e.pc]).join(' ');
  assert.equal(stated('C4:1 Eb4:1 G4:1 Bb4:2', 'sad'), 'C Eb G Bb', 'a minor-7th arpeggio stays one in minor');
  assert.equal(stated('C4:1 Eb4:1 G4:1 Bb4:2', 'pastoral'), 'C Eb G Bb');
  for (const mood of ['sad', 'tension', 'mystery']) assert.equal(stated('G4:1 E4:0.5 G4:0.5 Bb4:2 C5:3', mood), 'G Eb G Bb C', `${mood}: Bb stays Bb`);
  assert.equal(stated('C4:1 E4:1 G4:1 F#4:2', 'mystery'), 'C Eb G F#', 'F# stays F# in Hungarian minor');
  assert.equal(stated('C4:1 Eb4:1 G4:1 B4:2', 'pastoral', 'Cm'), 'C E G B', 'a minor-key leading tone stays the leading tone in major');
  assert.equal(stated(MOTIF, 'sad'), 'G Eb G Ab C', 'diatonic notes still follow the mode');
  assert.deepEqual(motifDegrees(parseMotif('Bb3 C4 F#4'), 'C').map(n => n.rel), [-2, 0, 6]);
  // and the harmoniser can still make each long chromatic note a chord tone (I7 / bVII for a Bb, II / VII for an F#)
  for (const m of ['G4:1 E4:0.5 G4:0.5 Bb4:2 C5:3', 'C4:1 E4:1 G4:1 F#4:2']) for (const mood of MOOD_NAMES) {
    const C = planCue({ dur: 16, mood, intensity: 0.5, key: 'C', seed: 1, motif: { notes: m, key: 'C', n: 5, voice: 'strings' } });
    for (const e of C.motif.evs) {
      if (e.len < 1) continue;
      for (let b = e.beat; b < e.beat + Math.min(e.len, C.motif.R * C.meter - e.beat); b += 0.5) assert.ok(C.chordAt(b + 1e-6).pcs.includes(e.pc), `${m} in ${mood}: ${NM[e.pc]} at beat ${b} over ${C.chordAt(b + 1e-6).sym}`);
    }
  }
});

test('a statement entering after a cue in the other mode: the outgoing third is gone, not held under it', () => {
  const band = (x, pc, a, b) => { const m = x.L.map((v, i) => v + x.R[i]); let e = 0; for (let oct = 2; oct <= 6; oct++) e += goertzel(m, 440 * 2 ** ((12 * (oct + 1) + pc - 69) / 12), Math.round(a * SR), Math.round(b * SR)) ** 2; return 10 * Math.log10(e + 1e-20); };
  // [outgoing mood, statement mood, outgoing third pc, incoming third pc]: C minor into C major (Eb under E), and back
  for (const [a, b, out3, in3] of [['sad', 'tender', 3, 4], ['night', 'sad', 4, 3]]) {
    const x = scoreFilm({ duration: 20, score: { key: 'C', motif: MOTIF }, music: [{ t0: 0, t1: 10, mood: a, intensity: 0.35 }, { t0: 10, t1: 20, mood: b, intensity: 0.3, motif: 4, motifVoice: 'cello' }] }, { seed: 4 });
    assert.ok(Math.abs(x.cues[0].t1 - 10.2) < 1e-6, `${a} → ${b}: the outgoing cue ends 0.2 s into the statement (${x.cues[0].t1})`);
    const before = band(x, out3, 9.4, 9.9), under = band(x, out3, 10.05, 10.6);
    assert.ok(before - under > 18, `${a} → ${b}: outgoing third drops ${(before - under).toFixed(1)} dB across the entry`);
    if (a === 'sad') assert.ok(band(x, in3, 10.05, 10.6) - under > 12, 'the outgoing Eb is far below the statement\'s E');
    for (let t = 8.5; t < 11; t += 0.1) assert.ok(rmsAt(x, t, t + 0.1) > -42, `${a} → ${b}: no dropout at ${t.toFixed(1)} s`);
    assert.ok(worstClick(x.L.subarray(9 * SR, 11 * SR)) < 15, `${a} → ${b}: click-free`);
  }
});

test('a gap after a cue (compile\'s music: "none") cuts the score like an explicit none', () => {
  const x = scoreFilm({ duration: 16, music: [{ t0: 0, t1: 9, mood: 'chase', intensity: 0.5 }, { t0: 12, t1: 16, mood: 'mystery', intensity: 0.3 }] }, { seed: 2 });
  assert.ok(rmsAt(x, 8.4, 8.95) > -32, 'still playing right up to the cut');
  let tail = 0; for (let i = Math.round(9.31 * SR); i < 12 * SR - 1; i++) tail = Math.max(tail, Math.abs(x.L[i]));
  assert.equal(tail, 0, 'silent in the gap');
  assert.ok(rmsAt(x, 12.5, 14) > -45, 'the next cue plays');
});
