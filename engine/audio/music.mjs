// Procedural film score: theory → form → phrase-structured melody → arrangement → humanised performance → mix.
//
//   composeCue({ dur, mood, intensity, key, tempo, seed, theme, motif, downbeat }) → { L, R, info }
//   scoreFilm(plan, { seed }) → { L, R, cues }   plan.music = [{ t0, t1, mood, intensity, motif?, motifVoice?, hold?,
//                                                downbeat?, tempo?, key? } | { t0, t1, mood: 'none' } | { t, sting }]
//                                                plan.score = { key: 'C', motif: 'G4:1 E4:0.5 G4:0.5 A4:2 C5:3' }
//   makeSting(name, { key, seed }) → { L, R, hit }   name: one of STING_NAMES
//   MOOD_NAMES, STING_NAMES, MOTIF_VOICES, parseMotif(text | array) → [{ note, midi, beats }]
//
// How a cue is built:
//  1. Form. Bars are grouped in 4-bar phrases; phrases pair into periods (antecedent ending on a half cadence,
//     consequent answering with an authentic cadence). The tempo is nudged (±13%) so that a whole number of
//     phrases lands its final tonic chord ~3 s before the cue ends, leaving room for the chord to ring.
//  2. Harmony. Each mood has 8-bar progressions in Roman numerals; sections alternate A / B / A.
//     Chords are voice-led to the nearest inversion.
//  3. Melody. A film-wide motif (interval shape from `theme`) gets a mood-specific rhythm. Bars 1–2 state and
//     sequence the motif, bar 3 climbs to the phrase peak, bar 4 cadences. Strong beats are chord tones,
//     weak beats move by step, leaps are recovered.
//  4. Arrangement. Layers enter with intensity (pad → accompaniment → melody → bass → counter-line →
//     percussion → doublings), at phrase boundaries, so low intensity is sparse and high is full.
//  5. Performance. Seeded timing / velocity humanisation, rolled chords, phrase dynamics, a ritardando
//     into the last cadence. Rendered with synth.mjs voices, a shared hall reverb, gain staging and a limiter.
//
// The film motif (plan.score). `motif` is a list of "note:beats" tokens written in `key` (major, or minor with
// 'm' / 'minor'). It is stored as scale degrees, so a cue in a minor mood states it in the minor mode (the A of
// a C-major motif becomes A-flat in C minor); a chromatic note (outside the written key) keeps its written
// interval from the tonic in every mode. With a score, every cue is in the score key (unless the cue sets
// `key`), and the procedural melodies are built from the motif's opening intervals (all but its last note,
// which is kept for real statements). A cue with:
//  - motif: n        (true = all) states the first n notes on `motifVoice` (bassoon | flute | cello | horn | celesta | violin |
//                    strings | music-box | tutti; default by mood) from the cue's first bar, at the cue's `tempo`
//                    (or the mood's). The last stated note sustains to the end of the statement's bars, then the
//                    cue's own phrases continue. The bars under the statement are re-harmonised so that every
//                    long or strong motif note is a chord tone (no rubs): G E G | A in C is I | IV.
//  - hold: true      sustains the last stated note to the cue's end (a held pedal, e.g. violas on A): no melody,
//                    accompaniment only above intensity 0.45, and a slow progression of chords that all contain the
//                    held note, arriving on the plainest one (IV for an A in C) where the cue is cut.
//                    Strings re-bow in two staggered desks (seamless), solo strings change bow, winds breathe,
//                    celesta / music box re-strike once a bar.
//  - downbeat: true  bar 1 starts exactly at the cue's t0 with no fade-in lead; the previous cue is cut there
//                    (30 ms), and bar 1 is a struck chord (fast-bowed strings, horns, timpani, bass drum, cymbal).
//    A cue whose motif statement enters on a cut starts exactly at t0 too; the outgoing cue overlaps it instead,
//    holding its final chord into the statement only if that chord fits the statement's opening (no semitone rub).
//  - mood: 'none'    the score fades out over 0.3 s at its t0 and stays silent until its t1 (the cue before it is
//                    composed past the cut, so it is cut mid-flight rather than ending early). A gap after a cue in
//                    plan.music (what compile leaves for a scene with music: "none") is treated the same way.
import * as S from './synth.mjs';
import { rng, noise1 } from '../core/lib.mjs';

const { SR, mtof } = S;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mod = (a, n) => ((a % n) + n) % n;
const smoothstep = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const pickR = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// ================================================================ theory

export const NOTE_PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10], hungarian: [0, 2, 3, 6, 7, 8, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10],
};
/** Tonic pitch class of a key name ('D', 'Eb', 'F#m', 'A minor' → the mode comes from the mood). */
export function keyPc(key) {
  const m = /^\s*([A-Ga-g])([#b]?)/.exec(String(key || ''));
  if (!m) throw new Error(`bad key ${key}`);
  return NOTE_PC[m[1].toUpperCase() + m[2]];
}
/** 'minor' for 'Am', 'A min', 'A minor', 'A aeolian'; otherwise 'major'. */
export function keyMode(key) {
  const rest = String(key || '').replace(/^\s*[A-Ga-g][#b]?/, '').trim().toLowerCase();
  return rest === 'm' || rest.startsWith('min') || rest === 'aeolian' ? 'minor' : 'major';
}
/** MIDI number of a note name ('C4' = 60, 'F#3', 'Bb5'). */
export function noteMidi(name) {
  const m = /^\s*([A-Ga-g])([#b]?)(-?\d)\s*$/.exec(String(name));
  if (!m) throw new Error(`bad note ${JSON.stringify(name)}`);
  return 12 * (Number(m[3]) + 1) + NOTE_PC[m[1].toUpperCase() + m[2]];
}
/**
 * Parse a motif: "G4:1 E4:0.5 G4:0.5 A4:2 C5:3" (beats default to 1), or an array of such tokens,
 * [note, beats] pairs or { note, beats } objects. → [{ note, midi, beats }]
 */
export function parseMotif(src) {
  if (src == null || src === '') return [];
  const toks = Array.isArray(src) ? src : String(src).trim().split(/\s+/);
  return toks.map(tk => {
    let note, beats;
    if (typeof tk === 'string') { const [a, b] = tk.split(':'); note = a; beats = b === undefined || b === '' ? 1 : Number(b); }
    else if (Array.isArray(tk)) [note, beats = 1] = tk;
    else if (tk && typeof tk === 'object') ({ note, beats = 1 } = tk);
    beats = Number(beats);
    if (!(beats > 0) || !Number.isFinite(beats)) throw new Error(`bad motif token ${JSON.stringify(tk)}`);
    return { note: String(note).trim(), midi: noteMidi(note), beats };
  });
}
/**
 * Motif notes → scale degrees of `key` ({ d: 7·octave + degree from the tonic in octave 4, acc: semitones above
 * that degree (0 = diatonic), rel: semitones from the tonic in octave 4 }).
 */
export function motifDegrees(notes, key = 'C') {
  const ref = SCALES[keyMode(key) === 'minor' ? 'minor' : 'major'], base = 60 + keyPc(key);
  return notes.map(nt => {
    const rel = nt.midi - base, oct = Math.floor(rel / 12), s = rel - 12 * oct;
    let i = 6; while (i > 0 && ref[i] > s) i--;
    return { ...nt, d: 7 * oct + i, acc: s - ref[i], rel };
  });
}
/** The interval shape the procedural melodies borrow: diatonic steps between the motif's notes, all but the last. */
function motifSteps(deg) {
  const use = deg.length >= 4 ? deg.slice(0, -1) : deg, steps = [];
  for (let k = 1; k < use.length; k++) steps.push(clamp(use[k].d - use[k - 1].d, -4, 4));
  return steps.some(x => x !== 0) ? steps : null;
}
const ROMAN = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const QUAL = { '': null, maj7: [11], 7: [10], m7: [10], 6: [9], add9: [2], sus2: 'sus2', sus4: 'sus4', o: 'dim', o7: 'dim7', 'ø7': 'hdim', '+': 'aug' };
/**
 * Parse a Roman-numeral chord relative to the tonic (0). Upper case = major, lower = minor; 'b'/'#' alter the root;
 * suffix maj7 | 7 | m7 | 6 | add9 | sus2 | sus4 | o | o7 | ø7 | +; '/3' '/5' '/7' put that chord member in the bass.
 * → { sym, root, pcs (relative to tonic, root first), degs (the scale degree 0..6 each tone spells), bass }
 */
const DEG_OF = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };
export function chord(sym) {
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(maj7|m7|7|6|add9|sus2|sus4|o7|o|ø7|\+)?(?:\/(\d))?$/.exec(sym);
  if (!m) throw new Error(`bad chord symbol ${sym}`);
  const minor = m[2] === m[2].toLowerCase(), q = QUAL[m[3] || ''];
  const root = mod(ROMAN[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0), 12);
  let iv = minor ? [0, 3, 7] : [0, 4, 7];
  if (q === 'sus2') iv = [0, 2, 7]; else if (q === 'sus4') iv = [0, 5, 7]; else if (q === 'dim') iv = [0, 3, 6];
  else if (q === 'dim7') iv = [0, 3, 6, 9]; else if (q === 'hdim') iv = [0, 3, 6, 10]; else if (q === 'aug') iv = [0, 4, 8];
  else if (Array.isArray(q)) iv = [...iv, q[0]];
  const pcs = iv.map(x => mod(root + x, 12));
  // spelling: stacked thirds above the numeral's degree (added 6th = +5, 9th / sus2 = +1, sus4 = +3, dim7's 7th = +6)
  const r0 = DEG_OF[m[2].toUpperCase()];
  const off = x => ({ 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: q === 'dim7' ? 6 : 5, 10: 6, 11: 6 })[x];
  const degs = iv.map(x => (r0 + off(x)) % 7);
  const inv = m[4] ? { 3: 1, 5: 2, 7: 3 }[m[4]] ?? 0 : 0;
  return { sym, root, pcs, degs, bass: pcs[Math.min(inv, pcs.length - 1)] };
}
/**
 * The chord-scale: the mood scale with each chord tone written into the scale degree it spells
 * (e.g. II in a major key raises the 4th; V in minor raises the 7th; bVI lowers the 6th).
 */
export function chordScale(scale, ch) {
  const cs = scale.slice();
  if (ch.degs) ch.pcs.forEach((pc, k) => { cs[ch.degs[k]] = pc; });
  for (let i = 1; i < 7; i++) if (cs[i] <= cs[i - 1]) return scale.slice();
  return cs;
}
/**
 * Voice a chord near the previous voicing: searches every set of `voices` distinct chord tones inside [lo, hi]
 * that contains the root, the third (and the seventh of a 7th chord), and keeps the one with the least total
 * motion from `prev` (or nearest the middle of the range), with penalties for wide gaps between upper voices,
 * close intervals down low (mud) and a doubled third.
 */
export function voiceLead(prev, pcs, { lo = 52, hi = 76, voices = 4, tonic = 0 } = {}) {
  const pool = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(mod(m - tonic, 12))) pool.push(m);
  const need = [pcs[0], pcs[1], ...(pcs.length >= 4 ? [pcs[3]] : [])];
  let best = null, bs = Infinity;
  const pick = [], rec = start => {
    if (pick.length === voices) {
      const pc = pick.map(m => mod(m - tonic, 12));
      if (!need.every(x => pc.includes(x))) return;
      if (voices >= pcs.length && !pcs.every(x => pc.includes(x))) return;
      let s = 0;
      if (prev && prev.length === voices) for (let k = 0; k < voices; k++) s += Math.abs(pick[k] - prev[k]);
      else s = Math.abs(pick.reduce((a, b) => a + b, 0) / voices - (lo + hi) / 2) * 2;
      for (let k = 1; k < voices; k++) { const g = pick[k] - pick[k - 1]; if (g > 7 && k > 1) s += (g - 7) * 1.5; if (pick[k] < 55 && g < 4) s += 3; }
      if (pc.filter(x => x === pcs[1]).length > 1) s += 2;
      if (s < bs) { bs = s; best = pick.slice(); }
      return;
    }
    for (let i = start; i < pool.length; i++) { pick.push(pool[i]); rec(i + 1); pick.pop(); }
  };
  rec(0);
  return best || pcs.slice(0, voices).map(pc => lo + mod(pc + tonic - lo, 12)).sort((a, b) => a - b);
}

// ================================================================ moods

// Rhythm cells (beats; negative = rest) per meter and style.
const RH = {
  4: {
    sparse: [[4], [2, 2], [3, 1], [2, 1, 1]],
    medium: [[1, 1, 2], [2, 1, 1], [1.5, 0.5, 2], [1, 1, 1, 1], [3, 1], [1, 0.5, 0.5, 2]],
    dense: [[0.5, 0.5, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 2], [1.5, 0.5, 1, 1], [1, 0.5, 0.5, 0.5, 0.5, 1]],
    bouncy: [[0.5, -0.5, 0.5, 0.5, 1, 1], [1, -0.5, 0.5, 1, 1], [0.5, 0.5, 1, -1, 1], [0.5, 0.5, 0.5, 0.5, 1, -1], [0.75, 0.25, 0.5, -0.5, 1, 1]],
    run: [[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 0.5, 1, 1], [1, 0.5, 0.5, 0.5, 0.5, 1]],
    fanfare: [[1.5, 0.5, 2], [0.75, 0.25, 1, 2], [1, 1, 2], [1.5, 0.5, 1, 1], [2, 1, 1], [0.5, 0.5, 1, 2]],
  },
  3: {
    sparse: [[3], [2, 1]],
    medium: [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [1, 2]],
    dense: [[0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 0.5, 1]],
    bouncy: [[1, -0.5, 0.5, 1], [0.5, 0.5, 1, -1], [1, 0.5, 0.5, -1]],
    run: [[0.5, 0.5, 0.5, 0.5, 1]],
    fanfare: [[1.5, 0.5, 1], [2, 1], [1, 1, 1], [0.75, 0.25, 2]],
  },
};
const CAD = {
  4: { ante: [[1, 1, 2], [2, 2], [1.5, 0.5, 2]], cons: [[3, -1], [2, 1, -1]], final: [[4]] },
  3: { ante: [[1, 2], [2, 1]], cons: [[2, -1], [3]], final: [[3]] },
};

/**
 * Mood table. tempo (bpm), meter (beats per bar), keys (preferred tonics), scale (mode), progs (8-bar periods,
 * two chords in a bar as "IV V"), roles → instruments, rhythm style by intensity, rit (ritardando amount),
 * level (dB trim), reverb settings.
 */
export const MOODS = {
  wonder: {
    tempo: 74, meter: 4, keys: ['D', 'Eb', 'C'], scale: 'major', rit: 0.18, level: 0,
    progs: [['Imaj7', 'II', 'IVmaj7', 'V', 'Imaj7', 'II', 'IV Vsus4', 'I'], ['vi7', 'IVmaj7', 'Imaj7', 'II', 'vi7', 'IVmaj7', 'iv6 V', 'Imaj7']],
    melody: ['celesta', 'flute', 'strings'], accomp: 'harp-arp', dense: 0.3, pad: 'strings', pad2: 'choir', pad2Min: 0.45, bass: 'cello', counter: 'flute',
    sparkle: 'glock', sparkleMin: 0.25, perc: 'swells', gliss: 0.45,
    style: i => (i < 0.35 ? 'sparse' : 'medium'), reverb: { decay: 3.2, wet: 0.34 },
  },
  pastoral: {
    tempo: 100, meter: 3, keys: ['G', 'F', 'D'], scale: 'major', rit: 0.12, level: 0,
    progs: [['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'], ['vi', 'IV', 'I', 'V', 'vi', 'ii7', 'V7', 'I'], ['I', 'iii', 'IV', 'V', 'IV', 'I/3', 'ii V', 'I']],
    melody: ['flute', 'clarinet', 'flute'], accomp: 'guitar-waltz', pad: 'strings', bass: 'pizz', counter: 'clarinet', perc: 'pastoral',
    style: i => (i < 0.3 ? 'sparse' : i < 0.75 ? 'medium' : 'dense'), reverb: { decay: 2.2, wet: 0.26 },
  },
  tender: {
    tempo: 66, meter: 3, keys: ['Eb', 'F', 'Ab'], scale: 'major', rit: 0.2, level: -1.5,
    progs: [['I', 'V/3', 'vi', 'V', 'IV', 'I/3', 'ii7 Vsus4', 'I'], ['IV', 'V', 'iii', 'vi', 'ii7', 'V/3', 'IVmaj7 V', 'I']],
    melody: ['piano', 'strings', 'piano'], accomp: 'piano-broken', pad: 'strings', bass: 'none', counter: 'cello', perc: 'none',
    style: i => (i < 0.4 ? 'sparse' : 'medium'), reverb: { decay: 2.6, wet: 0.3 },
  },
  playful: {
    tempo: 116, meter: 4, keys: ['C', 'Bb', 'F'], scale: 'major', rit: 0.06, level: 0,
    progs: [['I', 'vi', 'ii7', 'V7', 'I', 'vi', 'ii7 V7', 'I'], ['IV', 'I', 'II7', 'V', 'IV', 'I/5', 'ii7 V7', 'I']],
    melody: ['clarinet', 'flute', 'clarinet'], accomp: 'pizz-offbeat', pad: 'none', bass: 'pizz2', counter: 'glock-double', perc: 'playful',
    style: () => 'bouncy', staccato: true, reverb: { decay: 1.7, wet: 0.2 },
  },
  // suspense: slow harmony over a tonic pedal, a low pulse, a 5–b6 semitone motif, a tremolo cluster, a heartbeat drum
  tension: {
    tempo: 84, meter: 4, keys: ['D', 'C#', 'E'], scale: 'minor', rit: 0, level: -0.5,
    progs: [['i', 'i', 'bVI', 'bVI', 'i', 'i', 'bII', 'V'], ['iv', 'iv', 'i', 'i', 'bVI', 'bVI', 'bII', 'V']],
    melody: ['tension', 'tension', 'tension'], accomp: 'strings-pulse', accMin: 0, pad: 'strings-trem', cluster: true, bass: 'pedal', bassMin: 0, counter: 'none', perc: 'tension',
    style: () => 'sparse', reverb: { decay: 2.8, wet: 0.3 }, unresolved: true,
  },
  // drive: 8th-note ostinati from the lowest intensity, accented 3+3+2, kick on 1 and 3, marcato melody
  chase: {
    tempo: 144, meter: 4, keys: ['E', 'D', 'F'], scale: 'minor', rit: 0, level: 1.5,
    progs: [['i', 'bVI', 'bVII', 'i', 'i', 'bVI', 'iv', 'V'], ['i', 'bVII', 'bVI', 'V', 'iv', 'bVI', 'V', 'i']],
    melody: ['strings', 'flute', 'strings'], accomp: 'strings-ostinato', accMin: 0, pad: 'none', bass: 'ostinato', bassMin: 0, counter: 'horn', perc: 'chase', articulation: 0.92, octaves: true,
    style: i => (i < 0.4 ? 'medium' : 'run'), reverb: { decay: 1.8, wet: 0.2 },
  },
  sad: {
    tempo: 54, meter: 4, keys: ['D', 'A', 'G'], scale: 'minor', rit: 0.2, level: -1.5,
    progs: [['i', 'iv', 'bVI', 'V', 'i', 'iv', 'i/5 V', 'i'], ['iv', 'i', 'bVI', 'V', 'iv7', 'i', 'iv V7', 'i']],
    melody: ['cello', 'piano', 'strings'], accomp: 'piano-sparse', pad: 'strings', bass: 'cello', counter: 'cello', perc: 'none',
    style: i => (i < 0.5 ? 'sparse' : 'medium'), reverb: { decay: 3.0, wet: 0.32 },
  },
  // heroic: horns in thirds on a fanfare (interval-expanded) version of the theme, marcato string chords, timpani
  triumph: {
    tempo: 100, meter: 4, keys: ['C', 'D', 'Bb'], scale: 'major', rit: 0.1, level: 0.5,
    progs: [['I', 'V', 'vi', 'IV', 'I', 'IV', 'Vsus4 V', 'I'], ['IV', 'V', 'iii', 'vi', 'IV', 'V', 'bVI bVII', 'I']],
    melody: ['horn', 'strings', 'horn'], horns2: true, fanfare: true, velBoost: 0.12, accomp: 'strings-block', blockMin: 0.3, pad: 'strings', bass: 'cello', counter: 'strings-high',
    perc: 'triumph', gliss: 0.5,
    style: () => 'fanfare', reverb: { decay: 2.6, wet: 0.28 },
  },
  // lullaby: slow 3/4, music-box celesta with an echo, warm pad, slow harp
  night: {
    tempo: 56, meter: 3, keys: ['Ab', 'F', 'Db'], scale: 'major', rit: 0.2, level: -2,
    progs: [['Imaj7', 'vi7', 'IVmaj7', 'V', 'Imaj7', 'vi7', 'ii7 V7', 'I'], ['IVmaj7', 'iii7', 'vi7', 'V', 'IVmaj7', 'iv6', 'I', 'I']],
    melody: ['celesta', 'flute', 'celesta'], accomp: 'harp-slow', pad: 'pad', bass: 'harp-low', counter: 'flute-low', perc: 'none', echo: ['celesta'],
    style: i => (i < 0.5 ? 'sparse' : 'medium'), reverb: { decay: 3.4, wet: 0.36 },
  },
  // eerie: Hungarian-minor colour (#4, augmented seconds), slow harmony over a tonic drone, a harp 1-5-b6-5 cell, choir
  mystery: {
    tempo: 66, meter: 4, keys: ['E', 'B', 'D'], scale: 'hungarian', rit: 0.1, level: -1,
    progs: [['i', 'i', 'bVI', 'bVI', 'iv', 'iv', 'V', 'V'], ['bII', 'bII', 'i', 'i', 'bVI', 'iv', 'V', 'i']],
    melody: ['flute', 'clarinet', 'flute'], accomp: 'mystery-ostinato', accMin: 0, pad: 'choir', bass: 'pedal', bassMin: 0, counter: 'none', sparkle: 'bell', perc: 'mystery', echo: ['harp'],
    style: i => (i < 0.5 ? 'sparse' : 'medium'), reverb: { decay: 3.6, wet: 0.38 },
  },
};
export const MOOD_NAMES = Object.keys(MOODS);

// melody / line registers [lo, hi] (MIDI)
const RANGE = {
  celesta: [72, 89], flute: [67, 89], 'flute-low': [62, 79], clarinet: [55, 79], horn: [55, 77], oboe: [62, 84], strings: [64, 86],
  'strings-low': [48, 67], 'strings-high': [72, 91], cello: [48, 65], piano: [64, 86], glock: [79, 98], harp: [60, 84],
};

// ================================================================ instruments (render + mix settings)

const pitchPan = (lo, hi, a, b) => m => a + (b - a) * clamp((m - lo) / (hi - lo), 0, 1);
const INSTR = {
  harp: { fn: (f, d, o) => S.pluck(f, d, { body: 'harp', bright: 0.4, ...o }), gain: 1.15, pan: pitchPan(40, 90, -0.55, -0.15), send: 0.32 },
  guitar: { fn: (f, d, o) => S.pluck(f, d, { body: 'guitar', bright: 0.35, t60: clamp(3.2 * Math.pow(196 / f, 0.5), 0.8, 5), ...o }), gain: 1.05, pan: -0.25, send: 0.22 },
  pizz: { fn: (f, d, o) => S.pluck(f, d, { body: 'pizz', bright: 0.3, t60: clamp(1.1 * Math.pow(196 / f, 0.3), 0.4, 1.6), mute: true, release: 0.18, pos: 0.25, ...o }), gain: 1.5, pan: pitchPan(36, 84, 0.3, -0.2), send: 0.3 },
  bassPizz: { fn: (f, d, o) => S.pluck(f, d, { body: 'bass', bright: 0.25, t60: 1.6, mute: true, release: 0.25, pos: 0.3, ...o }), gain: 1.7, pan: 0.25, send: 0.2 },
  piano: { fn: (f, d, o) => S.piano(f, d, o), gain: 2.1, pan: pitchPan(36, 90, -0.3, 0.3), send: 0.26 },
  celesta: { fn: (f, d, o) => S.celesta(f, d, o), gain: 1.0, pan: 0.3, send: 0.36 },
  glock: { fn: (f, d, o) => S.glock(f, d, o), gain: 0.3, pan: 0.35, send: 0.4 },
  bell: { fn: (f, d, o) => S.bell(f, d, o), gain: 0.55, pan: 0.05, send: 0.42 },
  strings: { fn: (f, d, o) => S.strings(f, d, o), gain: 0.5, pan: pitchPan(40, 84, 0.35, -0.35), send: 0.3 },
  stringsShort: { fn: (f, d, o) => S.strings(f, d, { short: true, voices: 4, ...o }), gain: 0.6, pan: pitchPan(36, 84, 0.3, -0.3), send: 0.22 },
  stringsTrem: { fn: (f, d, o) => S.strings(f, d, { tremolo: 11, ...o }), gain: 0.42, pan: pitchPan(40, 84, 0.3, -0.3), send: 0.32 },
  pad: { fn: (f, d, o) => S.pad(f, d, { attack: 1.2, release: 1.6, ...o }), gain: 0.4, pan: pitchPan(40, 84, -0.3, 0.3), send: 0.38 },
  choir: { fn: (f, d, o) => S.pad(f, d, { vowel: 'oo', attack: 1.0, release: 1.4, ...o }), gain: 0.5, pan: pitchPan(48, 80, -0.3, 0.3), send: 0.42 },
  flute: { line: 'flute', gain: 1.15, pan: 0.12, send: 0.3 },
  clarinet: { line: 'clarinet', gain: 1.2, pan: -0.08, send: 0.28 },
  horn: { line: 'horn', gain: 1.3, pan: -0.15, send: 0.36 },
  oboe: { line: 'oboe', gain: 0.85, pan: 0.05, send: 0.28 },
  kick: { fn: (f, d, o) => S.kick(o.vel, o), gain: 0.75, pan: 0, send: 0.1 },
  concert: { fn: (f, d, o) => S.kick(o.vel, { ...o, tone: 'concert' }), gain: 0.65, pan: 0.05, send: 0.25 },
  timpani: { fn: (f, d, o) => S.timpani(f, o.vel, o), gain: 0.9, pan: 0.2, send: 0.25 },
  timpaniRoll: { fn: (f, d, o) => S.timpaniRoll(f, d, o), gain: 0.9, pan: 0.2, send: 0.25 },
  shaker: { fn: (f, d, o) => S.shaker(o.vel, o), gain: 0.32, pan: 0.3, send: 0.15 },
  brush: { fn: (f, d, o) => S.brush(o.vel, o), gain: 0.5, pan: -0.1, send: 0.18 },
  woodblock: { fn: (f, d, o) => S.woodblock(f, o.vel, o), gain: 0.5, pan: 0.35, send: 0.2 },
  swell: { fn: (f, d, o) => S.swell(d, o.vel, o), gain: 0.45, pan: 0, send: 0.35 },
  cymbal: { fn: (f, d, o) => S.cymbal(o.vel, o), gain: 0.55, pan: 0.12, send: 0.3 },
  cymbalRoll: { fn: (f, d, o) => S.cymbalRoll(d, o), gain: 0.55, pan: 0.05, send: 0.32 },
  musicBox: { fn: (f, d, o) => S.musicBox(f, d, o), gain: 1.6, pan: 0.18, send: 0.4 },
  bassoon: { line: 'bassoon', gain: 1.25, pan: -0.12, send: 0.26 },
  brass: { line: 'brass', gain: 1.1, pan: -0.05, send: 0.3 },
  cello: { bowed: 'cello', gain: 1.45, pan: 0.18, send: 0.28 },
  viola: { bowed: 'viola', gain: 1.2, pan: 0.08, send: 0.3 },
  violin: { bowed: 'violin', gain: 1.1, pan: -0.15, send: 0.32 },
};

// motif voices: written-octave shift, comfortable range (MIDI) and how a long note is sustained
export const MOTIF_VOICES = ['bassoon', 'flute', 'cello', 'horn', 'celesta', 'violin', 'strings', 'music-box', 'tutti'];
const MOTIF_VOICE = {
  bassoon: { shift: -12, range: [43, 69], sustain: 'breath' },
  flute: { shift: 0, range: [62, 93], sustain: 'breath' },
  cello: { shift: -12, range: [43, 72], sustain: 'bow' },
  horn: { shift: 0, range: [50, 74], sustain: 'breath' },
  celesta: { shift: 12, range: [65, 96], sustain: 'strike' },
  violin: { shift: 0, range: [55, 93], sustain: 'bow' },
  strings: { shift: 0, range: [50, 84], sustain: 'section' },
  'music-box': { shift: 12, range: [67, 98], sustain: 'strike' },
  tutti: { shift: 0, range: [55, 81], sustain: 'section' },
};
const DEFAULT_MOTIF_VOICE = { wonder: 'celesta', pastoral: 'bassoon', tender: 'cello', playful: 'bassoon', tension: 'strings', chase: 'horn', sad: 'cello', triumph: 'tutti', night: 'celesta', mystery: 'flute' };
// chords the motif harmoniser may use, with a small cost (plainer first)
const HARM_CANDS = {
  major: [['I', 0], ['IV', 0.1], ['V', 0.15], ['vi', 0.2], ['ii', 0.3], ['ii7', 0.35], ['IVmaj7', 0.35], ['V7', 0.4], ['Vsus4', 0.5], ['iii', 0.55], ['vi7', 0.6], ['Imaj7', 0.6], ['IVadd9', 0.6], ['I6', 0.7]],
  minor: [['i', 0], ['iv', 0.1], ['V', 0.15], ['bVI', 0.2], ['bVII', 0.3], ['bIII', 0.35], ['V7', 0.4], ['iv7', 0.45], ['bVImaj7', 0.45], ['i7', 0.6], ['iio', 0.6]],
};
// borrowed and secondary chords, offered only for a chromatic motif note they contain (see harmCands)
const BORROWED = ['I', 'i', 'I7', 'II', 'II7', 'ii', 'bII', 'III', 'III7', 'iii', 'bIII', 'IV', 'iv', 'V', 'v', 'VI', 'VI7', 'vi', 'bVI', 'VII', 'VII7', 'vii', 'bVII'];
const semis = (a, b) => Math.abs(mod(a - b + 6, 12) - 6);

// ================================================================ form and time

/**
 * Beat → seconds. Tempo factor per beat: a ritardando over the two bars before `landing`, a slow seeded rubato
 * (±2 %), and a small breath (up to 6 % slower) across the last beat of every 4-bar phrase.
 * If `landAt` is given the map is scaled so the landing beat falls exactly at that time.
 */
function timeMap(beatSec, landing, meter, rit, { intro = 0, seed = 1, landAt = null } = {}) {
  const res = 48, total = landing + meter * 2 + 64, tab = new Float64Array(total * res + 1), nz = noise1(seed % 9973), P = 4 * meter;
  const r0 = landing - 2 * meter;
  for (let k = 1; k < tab.length; k++) {
    const b = (k - 0.5) / res, pb = b - intro * meter;
    let f = (1 + rit * smoothstep((b - r0) / (2 * meter))) * (1 + 0.04 * (nz(b / 6) - 0.5));
    if (pb >= 0 && b < landing) f *= 1 + 0.06 * smoothstep(mod(pb, P) - (P - 1));
    tab[k] = tab[k - 1] + beatSec * f / res;
  }
  if (landAt != null && landing > 0) { const sc = landAt / tab[landing * res]; for (let k = 0; k < tab.length; k++) tab[k] *= sc; }
  const fn = b => { const x = clamp(b, 0, total) * res, i = Math.floor(x), fr = x - i; return i >= tab.length - 1 ? tab[tab.length - 1] : tab[i] + (tab[i + 1] - tab[i]) * fr; };
  return fn;
}
/**
 * Choose a form (intro bars + whole phrases, or a short 'mini' cadence, or a single 'swell' chord) and a tempo
 * close to the mood tempo such that the final chord lands with ~3 s left to ring.
 * With a motif statement the intro is the statement's bars ('motif' = the statement then the final chord);
 * with a held pedal ('pedal') nothing lands: just enough bars at the given tempo to cover the cue.
 * `landAt` (s) puts the final chord there instead (with a fixed tempo: the longest form that lands by then).
 */
function chooseForm(dur, M, fixedTempo, { introBars = null, hold = false, landAt = null } = {}) {
  const meter = M.meter, base = fixedTempo || M.tempo, barSec = meter * 60 / base;
  if (hold) {
    const total = Math.max(introBars || 1, Math.ceil(dur / barSec) + 1);
    return { kind: 'pedal', intro: introBars || 0, P: 0, before: total, landing: total * meter, Q: total * meter, tempo: base };
  }
  const ring = clamp(barSec * 1.1, 3.4, 5), opts = [];
  const add = (kind, intro, P, before) => {
    const landing = before * meter, r0 = Math.max(0, landing - 2 * meter);
    const Q = landing + M.rit * (landing - r0) / 2;            // beats, including the ritardando stretch
    opts.push({ kind, intro, P, before, landing, Q });
  };
  if (introBars != null) {          // the statement's bars, then 0–2 bars where it hangs over the accompaniment
    for (const e of [0, 1, 2]) {
      add('motif', introBars + e, 0, introBars + e);
      for (let P = 1; P <= 200; P++) add('full', introBars + e, P, introBars + e + 4 * P - 1);
    }
  } else {
    add('swell', 0, 0, 0); add('mini', 0, 0, 1);
    for (let P = 1; P <= 200; P++) for (const intro of [0, 1, 2]) if (!(intro === 2 && P < 3)) add('full', intro, P, intro + 4 * P - 1);
  }
  const fallback = introBars != null ? { kind: 'motif', intro: introBars, P: 0, before: introBars, landing: introBars * meter, tempo: base }
    : { kind: 'swell', intro: 0, P: 0, before: 0, landing: 0, tempo: base };
  if (fixedTempo) {   // fixed tempo: the longest form whose final chord still has 2.2 s to ring
    const fit = opts.filter(o => (landAt != null ? 60 / base * o.Q <= landAt : 60 / base * o.Q + 3 <= dur)).sort((a, b) => b.landing - a.landing || a.intro - b.intro);
    return fit.length ? { ...fit[0], tempo: base } : fallback;
  }
  let best = null;
  for (const o of opts) {
    const avail = landAt ?? dur - ring;
    if (avail <= 0) break;
    const T = o.Q > 0 ? 60 * o.Q / avail : base, f = T / base;
    if (f < 0.87 || f > 1.15) continue;
    const extra = introBars == null ? o.intro : o.intro - introBars;
    const score = Math.abs(Math.log(f)) + (extra === 2 ? 0.04 : 0) + (introBars == null && o.intro === 0 && o.P > 1 ? 0.06 : 0) + (o.kind !== 'full' ? 0.3 : 0);
    if (!best || score < best.score) best = { ...o, tempo: T, score, landAt: avail };
  }
  return best || fallback;
}

// ================================================================ composition

/** Film-wide motif: the interval shape (diatonic steps) that every mood re-voices. */
function makeTheme(seed) {
  const r = rng(S.mixSeed(seed, 'theme')), steps = [];
  let last = 0;
  for (let k = 0; k < 10; k++) {
    let s;
    if (Math.abs(last) >= 3) s = -Math.sign(last) * (r() < 0.7 ? 1 : 2);          // recover a leap by step
    else if (k === 1 && r() < 0.6) s = pickR(r, [3, 4, -3]);                       // one characteristic leap
    else s = pickR(r, [1, 1, 2, -1, -1, -2, 1, 0]);
    steps.push(s); last = s;
  }
  return { steps, seed };
}

function degToMidi(deg, cs, tonicMidi) { return tonicMidi + 12 * Math.floor(deg / 7) + cs[mod(deg, 7)]; }
function midiToDeg(m, cs, tonicMidi) {
  const oct = Math.floor((m - tonicMidi) / 12), rel = m - tonicMidi - 12 * oct;
  let bi = 0, bd = 99;
  for (let i = 0; i < 7; i++) { const d = Math.abs(cs[i] - rel); if (d < bd) { bd = d; bi = i; } }
  if (Math.abs(12 - rel) < bd) return 7 * (oct + 1);
  return 7 * oct + bi;
}

class Cue {
  constructor({ dur, mood, intensity, key, tempo, seed, theme, themeSteps, motif, downbeat, cut, landAt }) {
    this.M = MOODS[mood];
    if (!this.M) throw new Error(`unknown mood ${mood}`);
    this.mood = mood; this.dur = dur; this.seed = seed;
    this.r = rng(S.mixSeed(seed, mood, dur));
    this.I = typeof intensity === 'function' ? intensity : () => intensity;
    this.tonic = key != null ? keyPc(key) : NOTE_PC[this.M.keys[0]];
    this.tonicMidi = 60 + this.tonic;                // C4..B4
    this.scale = SCALES[this.M.scale];
    this.theme = themeSteps && themeSteps.length ? { steps: Array.from({ length: 10 }, (_, k) => themeSteps[k % themeSteps.length]), seed: theme ?? seed } : makeTheme(theme ?? seed);
    this.meter = this.M.meter;
    this.downbeat = !!downbeat;
    this.cut = cut ?? null;                          // s: where the score will cut this cue (scoreFilm)
    this.motif = this.prepareMotif(motif, key);
    const mo = this.motif;
    this.form = chooseForm(dur, this.M, tempo, mo ? { introBars: mo.R, hold: mo.hold, landAt } : { landAt });
    this.tempo = this.form.tempo;
    const rit = this.form.kind === 'pedal' ? 0 : this.M.rit;
    this.tm = timeMap(60 / this.tempo, this.form.landing, this.meter, rit, { intro: this.form.intro, seed: S.mixSeed(seed, mood, 'rubato'), landAt: this.form.landAt ?? null });
    this.ev = [];
    this.lineId = 0;
  }
  /** Motif statement: the stated notes as cue-scale pitches on beats, how many bars they take, the voice. */
  prepareMotif(motif, key) {
    if (!motif || !motif.notes) return null;
    const notes = typeof motif.notes === 'string' || !motif.notes.every?.(x => x && x.d != null) ? motifDegrees(parseMotif(motif.notes), motif.key ?? key ?? this.M.keys[0]) : motif.notes;
    const n = clamp(Math.round(motif.n ?? notes.length), 0, notes.length);
    if (!n) return null;
    const voice = MOTIF_VOICE[motif.voice] ? motif.voice : DEFAULT_MOTIF_VOICE[this.mood] || 'strings';
    const evs = [];
    let beat = 0;
    for (const nt of notes.slice(0, n)) {
      // a diatonic note follows the cue's mode by scale degree; a chromatic one keeps its written interval from the
      // tonic (a borrowed Bb stays Bb in a minor mood, where the 7th is already flat)
      const midi = this.tonicMidi + (nt.acc ? nt.rel : 12 * Math.floor(nt.d / 7) + this.scale[mod(nt.d, 7)]);
      evs.push({ beat, len: nt.beats, midi, pc: mod(midi - this.tonicMidi, 12) });
      beat += nt.beats;
    }
    const hold = !!motif.hold, meter = this.meter;
    const R = hold ? Math.max(1, Math.ceil(beat / meter - 1e-9)) : Math.ceil((beat + 1) / meter - 1e-9);
    const last = evs[evs.length - 1];
    if (!hold) last.len = Math.max(last.len, R * meter - 0.35 - last.beat);      // the last note hangs to the end of the statement
    return { evs, R, hold, voice, beats: beat };
  }
  t(beat) { return this.tm(beat); }
  /** How long a note starting at `beat` may sustain in the final chord: it releases ~2.3 s before the cue ends, so the hall can ring out. */
  ringSec(beat) { return Math.max(0.8, this.dur - this.t(beat) - 2.3); }
  /** Intensity at a beat (sampled at that time in the cue). */
  iAt(beat) { return clamp(this.I(this.t(beat)), 0, 1); }

  // ---------------------------------------------------------------- harmony plan
  plan() {
    const { M, form, meter } = this, bars = [];
    const progA = M.progs[0], progsB = M.progs.slice(1);
    const pushBar = (syms, section, phrase, pos, type, { lens: given, ...extra } = {}) => {
      const parts = syms.split(/\s+/), chords = [];
      const lens = given || (parts.length === 1 ? [meter] : meter === 3 ? [2, 1] : parts.map(() => meter / parts.length));
      let at = bars.length * meter;
      parts.forEach((p, k) => { chords.push({ at, len: lens[k], ch: chord(p) }); at += lens[k]; });
      bars.push({ i: bars.length, start: (bars.length) * meter, chords, section, phrase, pos, type, ...extra });
    };
    if (this.motif) {
      this.harmonizeMotif().forEach(({ syms, lens }, k) => pushBar(syms, 'motif', -1, k, 'intro', { lens }));
      if (form.kind === 'pedal') this.pedalChords(form.before - this.motif.R).forEach((syms, k) => pushBar(syms, 'pedal', -1, k, 'pedal'));
      else for (let k = this.motif.R; k < form.intro; k++) pushBar(progA[0], 'intro', -1, k, 'intro');     // the statement hangs
      if (form.kind === 'motif') pushBar(M.unresolved ? progA[0] : M.scale === 'major' ? 'I' : 'i', 'A', 0, 3, 'final', { landing: true });
    }
    if (this.motif && form.kind !== 'full') { /* planned above */ }
    else if (form.kind === 'swell') pushBar(M.unresolved ? progA[0] : M.scale === 'major' ? 'I' : 'i', 'end', 0, 3, 'final', { landing: true });
    else if (form.kind === 'mini') {
      pushBar(progA[6].split(' ').pop(), 'A', 0, 2, 'cons');
      pushBar(progA[7], 'A', 0, 3, 'final', { landing: true });
    } else {
      if (!this.motif) for (let k = 0; k < form.intro; k++) pushBar(progA[0], 'intro', -1, k, 'intro');
      const P = form.P;
      for (let ph = 0; ph < P; ph++) {
        const period = Math.floor(ph / 2), half = ph % 2;
        const last = ph === P - 1;
        // A B A B … ; the last period always returns to A so the cue ends on the main theme
        const isB = period % 2 === 1 && !(last && P % 2 === 1) && Math.floor((P - 1) / 2) !== period;
        const prog = isB ? progsB[Math.floor(period / 2) % progsB.length] : progA;
        // an odd final phrase uses the consequent half (it must cadence)
        const useHalf = last && half === 0 ? 1 : half;
        for (let b = 0; b < 4; b++) pushBar(prog[useHalf * 4 + b], isB ? 'B' : period >= 1 ? 'A2' : 'A', ph, b, last ? 'final' : useHalf === 0 ? 'ante' : 'cons', { landing: last && b === 3 });
      }
    }
    this.bars = bars;
    // final landing: the final cadence bar must be the tonic (unless the mood stays unresolved)
    const lb = bars[bars.length - 1];
    if (lb.landing && !M.unresolved && lb.chords.length === 1 && lb.chords[0].ch.root !== 0) lb.chords[0].ch = chord(M.scale === 'major' ? 'I' : 'i');
    this.phrases = [];
    for (const b of bars) if (b.phrase >= 0) (this.phrases[b.phrase] ||= []).push(b);
  }
  /**
   * Chords the harmoniser may use in this mood: the scale's plain chords plus the mood's own progressions, plus,
   * for each motif note that none of those contains (a chromatic note, or Hungarian minor's #4), the borrowed /
   * secondary chords that contain it and are otherwise made of tones the mood already uses (a Bb in C major: bVII,
   * v, I7; an F#: II, II7, vii).
   */
  harmCands() {
    if (this._cands) return this._cands;
    const sc = this.scale, inProg = new Set(this.M.progs.flat().flatMap(x => x.split(/\s+/)));
    const list = (sc[2] === 4 ? HARM_CANDS.major : HARM_CANDS.minor).filter(([sym]) => { const ch = chord(sym); return ch.pcs.every(pc => sc.includes(pc)) || inProg.has(sym); });
    for (const sym of inProg) if (!list.some(([x]) => x === sym)) list.push([sym, 0.45]);
    const vocab = new Set([...sc, ...list.flatMap(([sym]) => chord(sym).pcs)]);
    const chrom = new Set((this.motif?.evs || []).map(e => e.pc).filter(pc => !list.some(([sym]) => chord(sym).pcs.includes(pc))));
    if (chrom.size) for (const sym of BORROWED) {
      const ch = chord(sym);
      if (!list.some(([x]) => x === sym) && ch.pcs.some(pc => chrom.has(pc)) && ch.pcs.every(pc => vocab.has(pc) || chrom.has(pc))) list.push([sym, 0.65]);
    }
    return (this._cands = list.map(([sym, pref]) => ({ sym, pref, ch: chord(sym) })));
  }
  /**
   * Harmonise the motif statement bar by bar (one chord, or two: 2+2 or 3+1 in 4/4, 2+1 in 3/4). Long and strong
   * motif notes must be chord tones; short weak notes may pass. A chord tone a semitone from a sustained motif note
   * (a rub) is penalised; keeping the previous chord while it fits is preferred; bar 1 prefers the tonic.
   * → per bar { syms: 'I IV', lens: [2, 2] }
   */
  harmonizeMotif() {
    const { meter } = this, mo = this.motif, notes = mo.evs, cands = this.harmCands(), out = [];
    const cost = (c, a, l, prev, first) => {
      let k = c.pref;
      for (const nt of notes) {
        const end = mo.hold && nt === notes[notes.length - 1] ? Infinity : nt.beat + nt.len;
        const o0 = Math.max(a, nt.beat), o1 = Math.min(a + l, end);
        if (o1 <= o0 + 1e-6) continue;
        const onBeat = Math.abs(nt.beat - a) < 1e-6, longNote = nt.len >= 1, w = (o1 - o0) * (onBeat ? 1.5 : 1) * (longNote ? 1.2 : 0.7);
        if (!c.ch.pcs.includes(nt.pc)) k += w * (!longNote && !onBeat ? 0.8 : 3.5);
        if (longNote && c.ch.pcs.some(pc => semis(pc, nt.pc) === 1)) k += 1.5 * (o1 - o0) / l;
        if (longNote && nt.pc === 0 && c.ch.root === 0 && nt.beat >= a - 1e-6) k -= 0.4;             // a long tonic note: tonic chord
      }
      if (first && c.ch.root === 0) k -= 0.35;
      if (prev && prev.sym === c.sym) k -= 0.25;
      return k;
    };
    let prev = null;
    for (let b = 0; b < mo.R; b++) {
      const s0 = b * meter, half = meter === 3 ? 2 : meter / 2;
      let best = null;
      const options = [[[s0, meter]], [[s0, half], [s0 + half, meter - half]]];
      if (meter === 4) options.push([[s0, 3], [s0 + 3, 1]]);                     // a change on beat 4, for a long note there
      for (const segs of options) {
        let tot = segs.length === 1 ? 0 : segs[0][1] === half ? 0.45 : 0.6, p = prev;
        const picks = [];
        for (const [a, l] of segs) {
          let bc = null, bk = Infinity;
          for (const c of cands) { const k = cost(c, a, l, p, a === 0); if (k < bk) { bk = k; bc = c; } }
          tot += bk; picks.push(bc); p = bc;
        }
        if (!best || tot < best.tot - 1e-9) best = { tot, picks, lens: segs.map(([, l]) => l) };
      }
      const syms = best.picks.map(c => c.sym);
      out.push(syms.length === 2 && syms[0] === syms[1] ? { syms: syms[0], lens: [meter] } : { syms: syms.join(' '), lens: best.lens });
      prev = best.picks[best.picks.length - 1];
    }
    this.motifLastChord = prev;
    return out;
  }
  /**
   * Chords under a held pedal note: every chord contains the held pitch and no other tone within a whole step of
   * it (no friction under a long note); one per root, plainest first (for an A in C: IV, vi, ii). They change every two bars, never repeat back to back, and
   * the plainest one (IV) arrives two bars before the cut (or the end), so the cue is cut on it.
   */
  pedalChords(nBars) {
    if (nBars <= 0) return [];
    const held = this.motif.evs[this.motif.evs.length - 1].pc, cycle = [];
    const fits = maxRub => this.harmCands().filter(c => c.ch.pcs.includes(held) && !c.ch.pcs.some(pc => pc !== held && semis(pc, held) <= maxRub)).sort((a, b) => a.pref - b.pref);
    for (const c of fits(2).length >= 2 ? fits(2) : fits(1)) if (!cycle.some(x => x.ch.root === c.ch.root)) cycle.push(c);
    if (!cycle.length) cycle.push(this.motifLastChord);
    const meter = this.meter, R = this.motif.R, tCut = this.cut ?? this.dur;
    let cutBars = 0;
    while (cutBars < nBars && this.t((R + cutBars) * meter) < tCut - 1e-3) cutBars++;
    const finalStart = Math.max(0, cutBars - 2), fin = cycle[0], out = [];
    let k = cycle.length > 1 && cycle[0].sym === this.motifLastChord?.sym ? 1 : 0, cur = null;
    for (let b = 0; b < nBars; b++) {
      if (b >= finalStart) cur = fin;
      else if (b % 2 === 0) {
        let c = cycle[k % cycle.length];
        if (cycle.length > 1 && (c.sym === cur?.sym || (b + 2 >= finalStart && c.sym === fin.sym))) c = cycle[++k % cycle.length];
        if (cycle.length > 2 && c.sym === fin.sym && b + 2 >= finalStart) c = cycle[++k % cycle.length];
        cur = c; k++;
      }
      out.push(cur.sym);
    }
    return out;
  }
  /** Beat at a time in seconds (inverse of the time map). */
  beatAt(sec) {
    let lo = 0, hi = (this.bars?.length || 1) * this.meter + 64;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (this.t(mid) < sec) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  chordAt(beat) {
    const b = this.bars[clamp(Math.floor(beat / this.meter), 0, this.bars.length - 1)];
    for (let k = b.chords.length - 1; k >= 0; k--) if (beat >= b.chords[k].at - 1e-6) return b.chords[k].ch;
    return b.chords[0].ch;
  }
  /** Event: inst, beat, len (beats), midi, vel, extra opts. Time is computed now; sustains can be given in seconds. */
  note(inst, beat, lenBeats, midi, vel, o = {}) {
    const t0 = this.t(beat), t1 = o.sec ? t0 + o.sec : this.t(beat + lenBeats);
    this.ev.push({ inst, t: t0, dur: Math.max(0.03, t1 - t0), midi, vel: clamp(vel, 0.05, 1), line: o.line, slur: o.slur, opts: o.opts, roll: o.roll || 0, beat });
  }

  // ---------------------------------------------------------------- melody
  melodyFor(phraseBars, inst, motif, prevDeg) {
    const { meter, r, scale, tonicMidi } = this, [lo, hi] = RANGE[inst] || RANGE.flute;
    const loD = midiToDeg(lo, scale, tonicMidi), hiD = midiToDeg(hi, scale, tonicMidi), center = Math.round((loD + hiD) / 2);
    const type = phraseBars[0].type, out = [];
    const peak = type === 'ante' ? 2 + Math.floor(r() * 2) : 4 + Math.floor(r() * 2);
    const [uP, end] = type === 'ante' ? [0.55, center] : [0.62, center - 2];
    const contour = u => (u < uP ? center - 1 + peak * (u / uP) : center - 1 + peak + (end - (center - 1 + peak)) * ((u - uP) / (1 - uP)));
    let prev = prevDeg ?? center, lastLeap = 0;
    const isCT = (deg, ch) => ch.pcs.includes(chordScale(scale, ch)[mod(deg, 7)]);
    const inRange = d => d >= loD && d <= hiD;
    const nearestCT = (target, ch, near = prev, maxJump = 5) => {
      let best = target, bs = Infinity;
      for (let d = target - 4; d <= target + 4; d++) {
        if (!inRange(d) || !isCT(d, ch)) continue;
        const s = Math.abs(d - target) + 0.6 * Math.max(0, Math.abs(d - near) - 2) + (Math.abs(d - near) > maxJump ? 4 : 0);
        if (s < bs) { bs = s; best = d; }
      }
      return best;
    };
    const choose = (target, ch, structural) => {
      let best = prev, bs = Infinity;
      for (let d = prev - 5; d <= prev + 5; d++) {
        if (!inRange(d)) continue;
        const iv = Math.abs(d - prev), ct = isCT(d, ch);
        let s = Math.abs(d - target) * 0.55 + [0.9, 0, 0.45, 1.3, 1.8, 2.6][iv];
        if (structural && !ct) s += 4;
        if (!structural && !ct && iv !== 1) s += 1.6;
        if (Math.abs(lastLeap) >= 3 && Math.sign(d - prev) === Math.sign(lastLeap)) s += 1.8;
        const mi = Math.abs(degToMidi(d, chordScale(scale, ch), tonicMidi) - degToMidi(prev, chordScale(scale, ch), tonicMidi));
        if (mi === 6 || mi === 11) s += 3;                                                  // no tritone / major-7th leaps
        s += r() * 0.7;
        if (s < bs) { bs = s; best = d; }
      }
      return best;
    };
    const cadKind = type === 'final' ? 'final' : type;
    const rh = [motif.rhythm, motif.rhythm2, motif.rhythmC, pickR(r, CAD[meter][phraseBars[3].landing ? 'final' : cadKind])];
    let motifStart = null;
    for (let b = 0; b < 4; b++) {
      const bar = phraseBars[b];
      let beat = bar.start;
      const notes = rh[b].map(x => ({ len: Math.abs(x), rest: x < 0 }));
      const playing = notes.filter(x => !x.rest).length;
      let j = 0;
      for (const nt of notes) {
        const ch = this.chordAt(beat), u = (beat - phraseBars[0].start) / (4 * meter), inBar = beat - bar.start;
        if (nt.rest) { beat += nt.len; continue; }
        const structural = inBar < 1e-6 || (meter === 4 && Math.abs(inBar - 2) < 1e-6) || nt.len >= 1.5;
        let d;
        if (b <= 1 && motif.steps) {
          if (j === 0) {
            d = b === 0 ? nearestCT(Math.round(contour(u)), ch, prev, 4) : nearestCT(motifStart + motif.seq, ch, motifStart + motif.seq, 3);
            if (b === 0) motifStart = d;
          } else d = prev + motif.steps[(j - 1) % motif.steps.length];
          if (!inRange(d)) d = choose(Math.round(contour(u)), ch, structural);
          if (structural && !isCT(d, ch)) d = nearestCT(d, ch, prev, 3);
        } else if (b === 3 && j === 0 && (cadKind !== 'ante')) {
          d = nearestCT(Math.round(contour(1)), ch, prev, 3);                               // land: tonic or third, by step if possible
          const tonicDeg = [d - mod(d, 7), d - mod(d, 7) + 7].reduce((a, c) => (Math.abs(c - prev) < Math.abs(a - prev) ? c : a));
          if (inRange(tonicDeg) && Math.abs(tonicDeg - prev) <= 2) d = tonicDeg;
        } else if (b === 3 && j === playing - 1 && cadKind === 'ante') {
          d = nearestCT(prev, ch, prev, 2);                                                  // half cadence: rest on a V chord tone
        } else if (b === 2 && j === playing - 1 && cadKind !== 'ante') {
          // approach the landing tonic by step: leading tone, supertonic or dominant
          const cands = []; for (let x = prev - 4; x <= prev + 4; x++) if (inRange(x) && [1, 6, 4].includes(mod(x, 7)) && isCT(x, ch)) cands.push(x);
          d = cands.length ? cands.reduce((a, c) => (Math.abs(c - prev) < Math.abs(a - prev) ? c : a)) : choose(Math.round(contour(u)), ch, structural);
        } else d = choose(Math.round(contour(u)), ch, structural);
        lastLeap = d - prev; prev = d;
        const cs = chordScale(scale, this.chordAt(beat));
        out.push({ beat, len: nt.len, midi: degToMidi(d, cs, tonicMidi), deg: d, u, strong: inBar < 1e-6, rh: b });
        beat += nt.len; j++;
      }
    }
    return { notes: out, last: prev };
  }
  makeMotif(style, seedTag) {
    const r = rng(S.mixSeed(this.theme.seed, this.mood, seedTag)), lib = RH[this.meter][style] || RH[this.meter].medium;
    const rhythm = pickR(r, lib);
    const rhythm2 = r() < 0.6 ? rhythm : pickR(r, lib);
    let rhythmC = pickR(r, lib); if (rhythmC === rhythm && lib.length > 1) rhythmC = lib[(lib.indexOf(rhythm) + 1) % lib.length];
    let steps = seedTag === 'B' ? this.theme.steps.map(s => -s) : this.theme.steps;
    if (this.M.fanfare) steps = steps.map(s => (s === 0 ? 0 : Math.sign(s) * Math.min(4, Math.abs(s) + 1)));   // widen steps into leaps
    return { rhythm, rhythm2, rhythmC, steps, seq: pickR(r, [1, 2, -1, 1]) };
  }

  // ---------------------------------------------------------------- arrangement
  arrange() {
    const { M, bars, meter } = this;
    const motifs = {};
    // --- pad: voice-led sustained chords; a voice that keeps its pitch is tied, not re-bowed
    let voicing = null, bassPrev = null, melPrev = null;
    const padInst = { strings: 'strings', 'strings-trem': 'stringsTrem', pad: 'pad', choir: 'choir' }[M.pad];
    const slots = [];
    const held = this.motif?.hold ? this.motif.evs[this.motif.evs.length - 1] : null;   // the pad leaves a held note to its player
    for (const bar of bars) for (const c of bar.chords) {
      if (held && c.at >= held.beat - 1e-6) {
        // under a held note the middle stays clear: the harmony moves low and open (root and fifth), the held note completes it
        const root = 48 + mod(this.tonic + c.ch.root - 48, 12), fifth = c.ch.pcs.some(pc => mod(pc - c.ch.root, 12) === 7) ? root + 7 : root + mod(c.ch.pcs[1] - c.ch.root, 12);
        voicing = [root, fifth];
      } else voicing = voiceLead(voicing && voicing.length === 4 ? voicing : null, c.ch.pcs, { lo: 55, hi: 76, voices: 4, tonic: this.tonic });
      // under a statement the pads step back (a solo moment); under a held pedal a little
      const under = bar.section === 'motif' ? (this.motif.voice === 'tutti' ? 0.8 : 0.6) : bar.section === 'pedal' ? 0.5 : 1;
      slots.push({ at: c.at, len: c.len, v: voicing.slice(), I: this.iAt(c.at), last: !!bar.landing, intro: bar.section === 'intro', ch: c.ch, under, pedal: !!held && c.at >= held.beat - 1e-6 });
    }
    const sustain = (inst, pitchOf, velOf, opts, gate = () => true) => {
      let cur = null;
      const flush = () => { if (cur) this.note(inst, cur.at, cur.end - cur.at + 0.08, cur.m, cur.vel, { sec: cur.last ? this.ringSec(cur.at) : undefined, opts: cur.opts }); cur = null; };
      for (const sl of slots) {
        const m = gate(sl) ? pitchOf(sl) : null;
        if (m == null) { flush(); continue; }
        if (cur && cur.m === m && !sl.last) { cur.end = sl.at + sl.len; continue; }
        if (cur && cur.m === m && sl.last) { cur.end = sl.at + sl.len; cur.last = true; continue; }
        flush();
        cur = { at: sl.at, end: sl.at + sl.len, m, vel: velOf(sl), last: sl.last, opts: typeof opts === 'function' ? opts(sl) : opts };
      }
      flush();
    };
    // under a held pedal the pads chorus less (detuned unisons beat against a long note)
    const padOpts = sl => (padInst === 'strings' ? { voices: 5, expr: 0.3, ...(sl.pedal ? { detune: 4 } : {}) } : { expr: 0.3, ...(sl.pedal ? { detune: 2.5, bright: 0.12 } : {}) });
    if (padInst) for (let k = 0; k < 4; k++) sustain(padInst, sl => sl.v[k], sl => (0.28 + 0.3 * sl.I) * (k === 3 ? 1.05 : 0.95) * sl.under, padOpts);
    // octave doublings of the upper voices; none under a held pedal (its voicing is only root and fifth, and the
    // middle stays clear for the held note, which a choir or high strings would double in a beating unison)
    if (padInst && M.pad2) for (let k = 1; k < 4; k++) sustain('choir', sl => sl.v[k] + 12, sl => 0.22 + 0.2 * sl.I, { expr: 0.3 }, sl => sl.I >= (M.pad2Min ?? 0.55) && !sl.intro && !sl.pedal);
    if (M.cluster) sustain('stringsTrem', sl => 62 + mod(this.tonic + 8 - 62, 12), sl => 0.28 + 0.22 * sl.I, { expr: 0.4 });  // b6 rubbing against the 5th
    if (padInst === 'strings') sustain('strings', sl => sl.v[3] + 12, sl => 0.3 + 0.2 * sl.I, { voices: 5 }, sl => sl.I >= 0.75 && !sl.pedal);
    // --- bass
    const bassInst = M.bass;
    const bassOf = sl => {
      if (bassInst === 'pedal') return 36 + mod(this.tonic - 36, 12);
      const target = bassPrev ?? 43;
      let bm = 36 + mod(this.tonic + sl.ch.bass - 36, 12);
      while (bm + 12 <= 50 && Math.abs(bm + 12 - target) < Math.abs(bm - target)) bm += 12;
      return (bassPrev = bm);
    };
    const bassMin = M.bassMin ?? 0.25;
    if (bassInst === 'cello' || bassInst === 'pedal') sustain('strings', bassOf, sl => 0.4 + 0.3 * sl.I, { voices: 4, expr: 0.25 }, sl => sl.I >= bassMin || sl.last);
    else if (bassInst !== 'none') for (const sl of slots) {
      if (sl.I < bassMin && !sl.last) continue;
      const bm = bassOf(sl), v = 0.4 + 0.3 * sl.I, fifth = bm + 7 > 52 ? bm - 5 : bm + 7;
      if (bassInst === 'harp-low') this.note('harp', sl.at, sl.len, bm, v, { opts: sl.last ? undefined : { mute: true, release: 0.45 } });   // damped at the chord change
      else if (bassInst === 'pizz' || bassInst === 'pizz2') {
        this.note('bassPizz', sl.at, 1, bm, v + 0.1);
        if (!sl.last && meter === 4 && sl.len >= 4 && (bassInst === 'pizz2' || sl.I >= 0.5)) this.note('bassPizz', sl.at + 2, 1, fifth, v - (bassInst === 'pizz2' ? 0 : 0.08));
      } else if (bassInst === 'ostinato') {
        if (sl.last) { this.note('strings', sl.at, sl.len, bm, v + 0.1, { sec: this.ringSec(sl.at) }); continue; }
        for (let b = 0; b < sl.len; b += 0.5) {
          const acc = [0, 1.5, 3].includes(b % 4) ? 0.15 : 0;
          this.note('stringsShort', sl.at + b, 0.5, bm, v * 0.8 + acc);
          this.note('bassPizz', sl.at + b, 0.5, bm, (v + acc) * 0.75);                                // pizzicato bite under the spiccato
        }
      }
    }
    // --- accompaniment (a statement is a solo moment: pads and bass only; under a held pedal only when loud)
    for (const bar of bars) {
      const I = this.iAt(bar.start);
      if (bar.section === 'motif' || (bar.section === 'pedal' && I < 0.45)) continue;
      this.accomp(bar, I);
    }
    if (this.motif) this.playMotif();
    if (this.downbeat) this.downbeatHit();
    // --- melody, phrase by phrase
    for (let p = 0; p < this.phrases.length; p++) {
      const pb = this.phrases[p], sec = pb[0].section, I = this.iAt(pb[0].start);
      if (pb.length < 4) { if (pb.length === 2) this.miniMelody(pb, I); continue; }   // a 1-bar 'swell' has no tune
      if (M.melody[0] === 'tension') { if (I >= 0.2 || pb[0].type === 'final') this.tensionLine(pb, I); continue; }
      if (I < 0.18 && pb[0].type !== 'final') continue;              // very quiet: no tune, just the bed
      if (I < 0.3 && p % 2 === 1 && pb[0].type !== 'final') continue; // quiet: tune in every other phrase
      const style = M.style(I), tag = sec === 'B' ? 'B' : 'A', key = `${tag}-${style}`;
      motifs[key] ||= this.makeMotif(style, tag);
      const inst = M.melody[sec === 'B' ? 1 : sec === 'A2' ? 2 : 0];
      const mel = this.melodyFor(pb, inst, motifs[key], melPrev && melPrev.inst === inst ? melPrev.deg : null);
      melPrev = { inst, deg: mel.last };
      this.playMelody(mel.notes, inst, I, pb);
      // doubling / counter-line at higher intensity
      if (I >= 0.62 && M.counter !== 'none') this.counter(pb, I, mel.notes);
    }
    // --- percussion and sparkle (none under a held pedal; bar 1 of a downbeat cue has its own hit)
    for (const bar of bars) {
      const I = this.iAt(bar.start);
      if (bar.section === 'pedal' || (this.downbeat && bar.i === 0) || (bar.section === 'motif' && I < 0.6)) continue;
      this.perc(bar, I);
    }
    if (bars[bars.length - 1].landing) this.ending();
  }
  /** Event at a time in seconds (for sustains that are laid out in real time: re-bowing, breaths, re-strikes). */
  noteSec(inst, t, dur, midi, vel, o = {}) {
    this.ev.push({ inst, t, dur: Math.max(0.03, dur), midi, vel: clamp(vel, 0.05, 1), line: o.line, slur: o.slur, opts: o.opts, roll: 0, beat: this.beatAt(t), tag: o.tag });
  }
  /**
   * The motif statement on its voice, from bar 1: short notes slurred, long notes freshly bowed / tongued, a
   * dynamic arc rising to the longest note. The last note sustains (to the end of the statement, or with hold to
   * the end of the cue), laid out the way that instrument really sustains.
   */
  playMotif() {
    const mo = this.motif, V = MOTIF_VOICE[mo.voice], I = this.iAt(0);
    let shift = V.shift;
    const lo = Math.min(...mo.evs.map(e => e.midi)), hi = Math.max(...mo.evs.map(e => e.midi));
    while (hi + shift > V.range[1] && lo + shift - 12 >= V.range[0] - 5) shift -= 12;
    while (lo + shift < V.range[0] && hi + shift + 12 <= V.range[1] + 5) shift += 12;
    let peakK = 0; mo.evs.forEach((e, k) => { if (e.len >= mo.evs[peakK].len) peakK = k; });
    const base = 0.56 + 0.3 * I, N = mo.evs.length, endSec = this.dur + 0.5;
    const notes = mo.evs.map((e, k) => {
      const arc = k <= peakK ? 0.88 + 0.14 * k / Math.max(1, peakK) : 1.02 - 0.08 * (k - peakK) / Math.max(1, N - 1 - peakK);
      const t0 = this.t(e.beat), last = k === N - 1;
      const t1 = last && mo.hold ? endSec : this.t(e.beat + e.len);
      return { t0, t1, midi: e.midi + shift, vel: base * arc, slur: k > 0 && e.len < 1, last };
    });
    // a long last note: how this voice sustains it
    const out = [];
    for (const nt of notes) {
      const d = nt.t1 - nt.t0;
      if (!nt.last || d < 6.5 || V.sustain === 'section') { out.push(nt); continue; }
      if (V.sustain === 'strike') {                                                       // re-strike once a bar, fading
        const bar = this.meter * 60 / this.tempo;
        for (let t = nt.t0, j = 0; t < nt.t1 - 0.3; t += bar, j++) out.push({ ...nt, t0: t, t1: Math.min(nt.t1, t + bar), vel: nt.vel * Math.max(0.55, Math.pow(0.86, j)), slur: false, strike: j > 0 });
        continue;
      }
      // solo bow changes every ~5 s (contiguous, unslurred); winds breathe every ~6 s (a 0.25 s gap)
      const seg = V.sustain === 'bow' ? 5 : 6, gap = V.sustain === 'bow' ? 0 : 0.25, r = rng(S.mixSeed(this.seed, 'sustain'));
      let t = nt.t0, j = 0;
      while (t < nt.t1 - 0.5) {
        const e = Math.min(nt.t1, t + seg * (0.85 + 0.3 * r()));
        out.push({ ...nt, t0: t, t1: nt.t1 - e < 1.5 ? nt.t1 : e - gap, vel: nt.vel * (j ? 0.9 + 0.1 * r() : 1), slur: false });
        if (nt.t1 - e < 1.5) break;
        t = e; j++;
      }
    }
    const line = ++this.lineId, play = (inst, nt, dm, vel, o = {}) => this.noteSec(inst, nt.t0, nt.t1 - nt.t0 + (o.legato ?? 0), nt.midi + dm, vel, { ...o, tag: 'motif' });
    const section = (nt, dm, vel, voices) => {                                            // strings: staggered desks on long notes
      const d = nt.t1 - nt.t0;
      if (d < 6.5) { play('strings', nt, dm, vel, { legato: 0.06, opts: { voices, attack: nt.slur ? 0.08 : 0.16 } }); return; }
      const r = rng(S.mixSeed(this.seed, 'desks', dm));
      for (let desk = 0; desk < 2; desk++) {
        let t = nt.t0, j = 0;
        if (desk === 1) { play('strings', { ...nt, t1: nt.t0 + 2.2 + r() }, dm, vel * 0.8, { opts: { voices: Math.ceil(voices / 2), attack: 0.16 } }); t = nt.t0 + 1.6 + r(); }
        while (t < nt.t1 - 0.4) {
          const e = Math.min(nt.t1, t + 4.2 + 1.8 * r()), endT = nt.t1 - e < 1.2 ? nt.t1 : e + 0.7;
          play('strings', { ...nt, t0: t, t1: endT }, dm, vel * (0.78 + 0.12 * r()), { opts: { voices: Math.ceil(voices / 2), attack: j || desk ? 0.9 : 0.16, release: 0.9, expr: 0.15 } });
          if (endT >= nt.t1) break;
          t = e; j++;
        }
      }
    };
    // strings: a divisi section of real bowed lines (viola / violin / cello by register); on a long note each player
    // changes bow on their own schedule, so the section never breathes at once
    const divisi = (nt, dm, vel, players = 3) => {
      const m = nt.midi + dm, timbre = m < 55 ? 'cello' : m <= 76 ? 'viola' : 'violin', d = nt.t1 - nt.t0, r = rng(S.mixSeed(this.seed, 'divisi', dm));
      for (let p = 0; p < players; p++) {
        const lid = `${line}d${p}`, off = p * 0.011, pv = vel * 0.62 * (p === 1 ? 0.9 : 1);
        if (d < 6.5) { play(timbre, { ...nt, t0: nt.t0 + off }, dm, pv, { line: lid, slur: nt.slur }); continue; }
        let t = nt.t0 + off, j = 0;
        const first = 2.2 + 1.7 * p + r(), breathe = u => 1 - 0.16 * Math.sin(Math.PI * Math.min(1, u / 0.85));   // eases back, then swells to the cut
        while (t < nt.t1 - 0.5) {
          const e = Math.min(nt.t1, t + (j ? 4 + 2 * r() : first)), end = nt.t1 - e < 1.5 ? nt.t1 : e;
          play(timbre, { ...nt, t0: t, t1: end }, dm, pv * (j ? 0.94 + 0.06 * r() : 1) * breathe((t - nt.t0) / Math.max(1, Math.min(nt.t1, this.cut ?? nt.t1) - nt.t0)), { line: lid, slur: false });
          if (end >= nt.t1) break;
          t = e; j++;
        }
      }
    };
    // a bell-like voice cannot hold: under its re-strikes, two violas sustain the held note very softly
    const struck = out.filter(nt => nt.strike);
    if (struck.length) { const first = out.find(nt => nt.last); divisi({ ...first, t0: first.t0 + 0.15, t1: struck[struck.length - 1].t1, slur: false }, first.midi > 76 ? -12 : 0, first.vel * 0.45, 2); }
    for (const nt of out) {
      const v = nt.vel;
      switch (mo.voice) {
        case 'bassoon': play('bassoon', nt, 0, v, { line, slur: nt.slur }); break;
        case 'flute': play('flute', nt, 0, v * 0.95, { line, slur: nt.slur }); break;
        case 'horn': play('horn', nt, 0, v, { line, slur: nt.slur }); play('horn', { ...nt, t0: nt.t0 + 0.015 }, -12, v * 0.6, { line: `${line}8vb`, slur: nt.slur }); break;   // broad: doubled an octave below (a synthetic unison only phases)
        case 'cello': play('cello', nt, 0, v, { line, slur: nt.slur }); break;
        case 'violin': play('violin', nt, 0, v, { line, slur: nt.slur }); break;
        case 'celesta': play('celesta', nt, 0, v * 0.95); if (I >= 0.5 && !nt.strike) play('glock', nt, 12, v * 0.35); break;
        case 'music-box': play('musicBox', nt, 0, v * 0.95); break;
        case 'strings': divisi(nt, 0, v); break;
        case 'tutti':
          play('horn', nt, 0, v, { line, slur: nt.slur }); play('horn', { ...nt, t0: nt.t0 + 0.015 }, -12, v * 0.6, { line: `${line}8vb`, slur: nt.slur });
          section(nt, 0, v * 0.9, 6); section(nt, 12, v * 0.8, 6);
          if (nt.midi + 12 <= 96) play('flute', nt, 12, v * 0.75, { line: `${line}fl`, slur: nt.slur });
          break;
      }
    }
  }
  /** Bar 1 of a downbeat cue: a struck chord (fast-bowed strings, horns on the lower chord tones), timpani, bass drum, cymbal. */
  downbeatHit() {
    const I = this.iAt(0), c0 = this.bars[0].chords[0], ch = c0.ch, sec = Math.max(0.6, this.t(this.motif ? 1 : c0.len) + 0.15);
    const tones = ch.pcs.map(pc => mod(pc + this.tonic, 12)), v = 0.48 + 0.4 * I;
    const rootLow = 36 + mod(this.tonic + ch.root - 36, 12);
    const top = this.motif ? Math.min(79, this.motif.evs[0].midi - 2) : 79;            // the struck chord sits under the tune
    const voicing = voiceLead(null, ch.pcs, { lo: Math.min(55, top - 12), hi: top, voices: 4, tonic: this.tonic });
    for (const m of voicing) this.note('strings', 0, c0.len, m, v, { sec, opts: { attack: 0.025, release: 0.7, voices: 5 } });
    for (const m of [rootLow, rootLow + 12]) this.note('strings', 0, c0.len, m, v * 0.9, { sec, opts: { attack: 0.03, release: 0.8, voices: 4 } });
    if (I >= 0.4) {
      const hornNotes = []; for (let m = 48; m <= 62 && hornNotes.length < 3; m++) if (tones.includes(mod(m, 12)) && (!hornNotes.length || m - hornNotes[hornNotes.length - 1] >= 3)) hornNotes.push(m);
      hornNotes.forEach((m, k) => this.note('horn', 0, c0.len, m, v * (this.motif ? 0.6 : 0.85), { line: `db${k}`, sec }));
    }
    const timp = rootLow < 41 ? rootLow + 12 : rootLow;
    this.note('timpani', 0, 1, 0, 0.6 + 0.35 * I, { opts: { f: mtof(timp) } });
    this.note('concert', 0, 1, 0, 0.5 + 0.3 * I);
    if (I >= 0.4) this.note('cymbal', 0, 1, 0, 0.35 + 0.4 * I, { opts: { decay: 3.2 } });
  }
  /** Suspense line: the dominant and its upper semitone (5–b6) in the low clarinet, answered a minor third higher. */
  tensionLine(pb, I) {
    const base = 50 + mod(this.tonic - 50, 12), shift = (pb[0].phrase % 2) * 3, line = ++this.lineId, v = 0.36 + 0.3 * I;
    const fig = I >= 0.6 ? [[1, 7], [1, 8], [1, 7], [1, 8]] : [[2, 7], [2, 8]];
    for (const bar of pb) {
      let b = bar.start;
      if (bar.pos === 3) { this.note('clarinet', b, this.meter + 0.3, base + 7 + shift, v, { line, sec: bar.landing ? this.ringSec(b) : undefined }); continue; }
      const rise = bar.pos === 2 ? 1 : 0;
      for (const [len, iv] of fig) { this.note('clarinet', b, len, base + iv + shift + rise, v * (iv === 8 ? 1.1 : 0.92), { line, slur: true }); b += len; }
    }
    if (I >= 0.55) for (const bar of pb) this.note('strings', bar.start, this.meter, base + 7 + shift - 12 + (bar.pos === 2 ? 1 : 0), 0.3 + 0.2 * I, { opts: { voices: 4, expr: 0.4 } });
  }
  /** The 2-bar 'mini' form: a supertonic over the dominant that resolves to the tonic. */
  miniMelody(pb, I) {
    const inst = this.M.melody[0], [lo, hi] = RANGE[inst] || RANGE.flute, mid = (lo + hi) / 2;
    let tonicM = this.tonicMidi; while (tonicM < mid - 6) tonicM += 12; while (tonicM > mid + 6) tonicM -= 12;
    const cs = chordScale(this.scale, pb[0].chords[pb[0].chords.length - 1].ch);
    const notes = [{ beat: pb[0].start, len: this.meter, midi: tonicM + cs[1], u: 0.5, strong: true, rh: 2 }, { beat: pb[1].start, len: this.meter, midi: tonicM, u: 1, strong: true, rh: 3 }];
    this.playMelody(notes, inst, Math.max(I, 0.35), [pb[0], pb[0], pb[0], pb[1]]);
  }
  playMelody(notes, inst, I, pb) {
    const M = this.M, base = 0.42 + 0.33 * I + (M.velBoost || 0), line = ++this.lineId, real = inst === 'strings-low' || inst === 'cello' ? 'strings' : inst;
    for (let k = 0; k < notes.length; k++) {
      const n = notes[k], nx = notes[k + 1];
      const arc = 0.88 + 0.16 * Math.sin(Math.PI * clamp(n.u / 0.8, 0, 1));
      let v = base * arc * (n.strong ? 1.06 : 0.97);
      if (pb[3].landing && n.rh === 3) v *= 0.9;
      const contiguous = nx && Math.abs(nx.beat - (n.beat + n.len)) < 1e-6;
      let len = n.len, sec;
      if (M.staccato && n.len <= 1) len = n.len * 0.5;
      else if (M.articulation && n.len <= 1) len = n.len * M.articulation;
      else if (!nx || !contiguous) len += 0.3;                                         // let phrase ends breathe
      if (n.rh === 3 && pb[3].landing && k === notes.length - 1) sec = this.ringSec(n.beat);
      const legato = INSTR[real].line || real === 'strings';
      if (legato && contiguous && !M.staccato) len += 0.02;
      this.note(real, n.beat, len, n.midi, v, { line: INSTR[real].line ? line : undefined, slur: k > 0 && !n.strong && !M.staccato, sec, opts: real === 'strings' ? { voices: 6, attack: 0.12 + 0.12 * (1 - I) } : undefined });
      // doublings
      if (I >= 0.8 && (M.melody[0] === 'horn' || this.mood === 'chase') && real !== 'strings') this.note('strings', n.beat, len, n.midi + 12, v * 0.8, { sec, opts: { voices: 6, attack: 0.1 } });
      if (M.octaves && real === 'strings' && I >= 0.5) this.note('strings', n.beat, len, n.midi - 12, v * 0.75, { sec, opts: { voices: 5, attack: 0.06 } });   // violas an octave below
      if (I >= 0.72 && this.mood === 'wonder' && real === 'celesta') this.note('flute', n.beat, len, n.midi - 12, v * 0.75, { line: `${line}fl`, slur: k > 0 && !n.strong, sec });
      if (I >= 0.6 && this.M.counter === 'glock-double' && n.len <= 1.5) this.note('glock', n.beat, len, n.midi + 12, v * 0.7);
      if (M.horns2 && real === 'horn') this.note('horn', n.beat, len, n.midi, v * 0.8, { line: `${line}a2`, slur: k > 0 && !n.strong, sec, opts: { cents: 7 } });
      if (M.horns2 && real === 'horn' && I >= 0.45 && n.deg != null) {
        const m2 = degToMidi(n.deg - 2, chordScale(this.scale, this.chordAt(n.beat)), this.tonicMidi);
        this.note('horn', n.beat, len, m2, v * 0.85, { line: `${line}h2`, slur: k > 0 && !n.strong, sec });
      }
    }
  }
  counter(pb, I, mel) {
    const M = this.M, kind = M.counter;
    if (kind === 'glock-double') return;
    const inst = { flute: 'flute', clarinet: 'clarinet', cello: 'strings', 'flute-low': 'flute', horn: 'horn', 'strings-high': 'strings' }[kind] || 'strings';
    const [lo, hi] = RANGE[kind === 'cello' ? 'cello' : kind] || RANGE.cello;
    const line = ++this.lineId;
    let prev = this.counterPrev ?? Math.round((lo + hi) / 2);
    for (const bar of pb) {
      for (const c of bar.chords) {
        // guide tones: the chord's 3rd or 7th nearest the previous note, avoiding the melody's pitch
        const pcs = [c.ch.pcs[1], c.ch.pcs[3] ?? c.ch.pcs[2]];
        let best = prev, bs = 1e9;
        for (let m = lo; m <= hi; m++) {
          if (!pcs.includes(mod(m - this.tonic, 12))) continue;
          const clash = mel.some(n => n.beat >= c.at && n.beat < c.at + c.len && Math.abs(n.midi - m) < 3);
          const s = Math.abs(m - prev) + (clash ? 6 : 0);
          if (s < bs) { bs = s; best = m; }
        }
        prev = best;
        const sec = bar.landing ? this.ringSec(c.at) : undefined;
        this.note(inst, c.at, c.len, best, 0.3 + 0.25 * I, { line: INSTR[inst].line ? line : undefined, slur: true, sec, opts: inst === 'strings' ? { voices: 4 } : undefined });
      }
    }
    this.counterPrev = prev;
  }
  accomp(bar, I) {
    const { M, meter, tonic } = this, kind = M.accomp, last = bar.landing;
    if (I < (M.accMin ?? 0.12) && !last) return;
    const ring = last ? this.ringSec(bar.start) : undefined;
    for (const c of bar.chords) {
      const root = 36 + mod(tonic + c.ch.root - 36, 12) + 12 * (mod(tonic + c.ch.root - 36, 12) < 7 ? 1 : 0); // 43..54
      const tones = c.ch.pcs.map(pc => mod(pc + tonic, 12));
      const up = []; for (let m = root; m <= root + 26; m++) if (tones.includes(mod(m, 12))) up.push(m);
      const dense = I >= (M.dense ?? 0.42), v = 0.36 + 0.28 * I;
      if (kind === 'harp-arp' || kind === 'harp-slow') {
        const step = kind === 'harp-slow' || !dense ? 1 : 0.5, n = Math.round(c.len / step);
        const seq = []; for (let k = 0; k < Math.min(up.length, 6); k++) seq.push(up[k]);
        const path = seq.concat(seq.slice(1, -1).reverse());
        for (let k = 0; k < n; k++) {
          if (last && k > 0) break;
          if (last) { up.slice(0, 7).forEach((m, q) => this.note('harp', c.at, c.len, m, v, { roll: q * 0.045 })); break; }
          this.note('harp', c.at + k * step, step, path[k % path.length], v * (k === 0 ? 1.1 : 0.92));
        }
      } else if (kind === 'guitar-waltz') {
        this.note('guitar', c.at, 1, root - 12 >= 40 ? root - 12 : root, v * 1.05);
        const chordTones = up.filter(m => m >= root + 7).slice(0, 3);
        if (last) { up.slice(0, 6).forEach((m, q) => this.note('guitar', c.at, c.len, m, v, { roll: q * 0.03 })); continue; }
        for (let b = 1; b < c.len; b++) chordTones.forEach((m, q) => this.note('guitar', c.at + b, 1, m, v * 0.75, { roll: q * 0.012 }));
        if (dense && c.len === 3) this.note('guitar', c.at + 2.5, 0.5, chordTones[chordTones.length - 1] + 0, v * 0.6);
      } else if (kind === 'piano-broken') {
        const R = root - 12 >= 36 ? root - 12 : root;
        const ct = iv => { let best = R, bd = 99; for (let m = R; m <= R + 24; m++) if (tones.includes(mod(m, 12)) && Math.abs(m - R - iv) < bd) { bd = Math.abs(m - R - iv); best = m; } return best; };
        const lh = meter === 3 ? [R, ct(7), ct(16), ct(7), ct(12), ct(7)] : [R, ct(7), ct(16), ct(7)];
        const step = dense ? 0.5 : 1, n = Math.round(c.len / step);
        for (let k = 0; k < n; k++) {
          const sec = last ? ring : this.t(c.at + c.len) - this.t(c.at + k * step) + 0.05;   // pedalled: held to the chord change
          this.note('piano', c.at + k * step, step, lh[(dense ? k : k * 2) % lh.length], v * (k === 0 ? 1 : 0.8), { sec });
          if (last) break;
        }
      } else if (kind === 'piano-sparse') {
        const sec = last ? ring : this.t(c.at + c.len) - this.t(c.at) + 0.05;
        [up[0] - 12 >= 33 ? up[0] - 12 : up[0], up[1], up[2]].forEach((m, q) => this.note('piano', c.at, c.len, m, v * 0.85, { roll: q * 0.03, sec }));
        if (!last && c.len >= 4 && I >= 0.35) [up[2], up[3] ?? up[1] + 12].forEach((m, q) => this.note('piano', c.at + 2, 2, m, v * 0.7, { roll: q * 0.03, sec: this.t(c.at + c.len) - this.t(c.at + 2) + 0.05 }));
      } else if (kind === 'pizz-offbeat') {
        const ch = up.filter(m => m >= 55).slice(0, 3);
        if (last) { ch.forEach((m, q) => this.note('pizz', c.at, 1, m, v, { roll: q * 0.01 })); continue; }
        for (let b = 1; b < c.len; b += 2) ch.forEach((m, q) => this.note('pizz', c.at + b, 0.5, m, v * 0.85, { roll: q * 0.008 }));
        if (dense) for (let b = 1.5; b < c.len; b += 2) this.note('pizz', c.at + b, 0.5, ch[ch.length - 1], v * 0.6);
      } else if (kind === 'strings-ostinato') {
        const pat = [up[1], up[2], up[1], up[3] ?? up[1] + 12];
        for (let b = 0; b < c.len; b += 0.5) {
          if (last) { up.slice(1, 4).forEach(m => this.note('strings', c.at, c.len, m, v, { sec: ring })); break; }
          const acc = [0, 1.5, 3].includes(b % 4) ? 0.14 : 0, m = pat[(b * 2) % pat.length];
          this.note('stringsShort', c.at + b, 0.5, m, v + acc);
          if (I >= 0.6) this.note('stringsShort', c.at + b, 0.5, m + 12, (v + acc) * 0.7);
        }
      } else if (kind === 'strings-pulse') {
        const lowRoot = 38 + mod(tonic - 38, 12);
        for (let b = 0; b < c.len; b += I >= 0.4 ? 0.5 : 1) {
          if (last) { this.note('strings', c.at, c.len, lowRoot, v, { sec: ring }); break; }
          const sw = 0.8 + 0.4 * (((c.at + b) % (2 * meter)) / (2 * meter));             // pulse swells over two bars
          this.note('stringsShort', c.at + b, 0.5, lowRoot, v * sw);
          if (b % 1 === 0) this.note('bassPizz', c.at + b, 0.5, lowRoot, v * sw * 0.8);
          if (I >= 0.7) this.note('stringsShort', c.at + b, 0.5, lowRoot + 12, v * sw * 0.6);
          if (I >= 0.4 && b % 1 === 0.5) this.note('pizz', c.at + b, 0.25, lowRoot + 36, 0.3 + 0.2 * I);       // the clock ticks
        }
      } else if (kind === 'mystery-ostinato') {
        let r0 = 57 + mod(tonic + c.ch.root - 57, 12);
        const cell = [0, 7, 8, 7], step = I >= 0.45 ? 0.5 : 1;
        for (let b = 0; b < c.len; b += step) {
          if (last) { [r0 - 12, r0 - 5, r0, r0 + 3, r0 + 7].forEach((m, q) => this.note('harp', c.at, c.len, m, v, { roll: q * 0.06 })); break; }
          const k = Math.round(b / step);
          this.note('harp', c.at + b, step, r0 + cell[k % 4], v * (k % 4 === 0 ? 1 : 0.8));
        }
      } else if (kind === 'strings-block') {
        const ch = up.filter(m => m >= 50).slice(0, 4);
        if (I < (M.blockMin ?? 0.45) || last) { if (last) ch.forEach(m => this.note('strings', c.at, c.len, m, v, { sec: ring })); continue; }
        for (let b = 0; b < c.len; b += 1) ch.forEach(m => this.note('strings', c.at + b, 0.8, m, v * (b === 0 ? 1.08 : 0.85), { opts: { attack: 0.045, release: 0.22, voices: 4 } }));
      }
    }
  }
  perc(bar, I) {
    const { M, meter, tonic } = this, kind = M.perc, s = bar.start, last = bar.landing, root = 36 + mod(tonic - 36, 12) + (mod(tonic - 36, 12) < 4 ? 12 : 0);
    const timpF = mtof(root < 41 ? root + 12 : root), fifthF = mtof((root < 41 ? root + 12 : root) - 5);
    const firstOfSection = bar.pos === 0 && bar.phrase >= 0 && (bar.phrase % 2 === 0);
    if (kind === 'swells' && firstOfSection && I >= 0.35 && bar.phrase > 0) this.note('swell', s - meter, meter, 0, 0.35 + 0.3 * I);
    if (M.gliss && bar.pos === 0 && bar.phrase > 0 && I >= M.gliss) {                     // harp glissando into the phrase
      const sc = this.scale, notes = [];
      for (let m = 55; m <= 86; m++) if (sc.includes(mod(m - tonic, 12))) notes.push(m);
      notes.forEach((m, k) => this.note('harp', s - 0.9 + 0.9 * k / notes.length, 0.5, m, 0.3 + 0.35 * k / notes.length));
    }
    if (kind === 'pastoral' && I >= 0.55 && !last) for (let b = 0; b < meter; b += 0.5) this.note('shaker', s + b, 0.5, 0, (b === 0 ? 0.55 : 0.32) * (0.6 + 0.5 * I));
    if (kind === 'playful' && !last) {
      if (I >= 0.4) for (let b = 1; b < meter; b += 2) this.note('woodblock', s + b, 0.5, b === 1 ? 81 : 76, 0.45);
      if (I >= 0.6) for (let b = 0; b < meter; b += 0.5) this.note('shaker', s + b, 0.5, 0, b % 1 ? 0.3 : 0.45);
      if (I >= 0.7) this.note('kick', s, 1, 0, 0.5);
    }
    if (kind === 'chase') {
      if (last) { this.note('timpani', s, 1, 0, 0.85, { opts: { f: timpF } }); this.note('concert', s, 1, 0, 0.7); return; }
      if (I >= 0.1) this.note('concert', s, 1, 0, 0.5 + 0.2 * I);
      if (I >= 0.3) for (const b of [0, 1.5, 3]) this.note('timpani', s + b, 1, 0, (b ? 0.45 : 0.62) + 0.2 * I, { opts: { f: b === 3 ? fifthF : timpF } });
      if (I >= 0.4) for (let b = 1; b < meter; b += 2) this.note('brush', s + b, 1, 0, 0.5);
      if (I >= 0.6) for (let b = 0.5; b < meter; b += 1) this.note('brush', s + b, 0.5, 0, 0.22);
      if (I >= 0.75 && bar.pos === 2 && bar.type !== 'ante') this.note('timpaniRoll', s + 2, 2, 0, 0, { opts: { f: fifthF, v0: 0.2, v1: 0.6 } });
    }
    if (kind === 'tension') {
      if (last) { this.note('concert', s, 1, 0, 0.5); return; }
      if (I >= 0.2) { this.note('concert', s, 1, 0, 0.42 + 0.3 * I); this.note('concert', s + 0.42, 1, 0, 0.3 + 0.25 * I); }
      if (I >= 0.5 && bar.pos === 3) this.note('timpaniRoll', s, meter, 0, 0, { opts: { f: timpF, v0: 0.08, v1: 0.45 } });
      if (I >= 0.7 && firstOfSection && bar.phrase > 0) this.note('swell', s - meter, meter, 0, 0.4);
    }
    if (kind === 'triumph') {
      if (last) {
        this.note('timpani', s, 1, 0, 0.9, { opts: { f: timpF } }); this.note('concert', s, 1, 0, 0.7);
        this.note('swell', s - 1, 1, 0, 0.5, { opts: { decay: 3 } });
        return;
      }
      if (I >= 0.3) this.note('timpani', s, 1, 0, 0.55 + 0.25 * I, { opts: { f: timpF } });
      if (I >= 0.7 && meter === 4) this.note('timpani', s + 2, 1, 0, 0.45, { opts: { f: fifthF } });
      if (I >= 0.5 && bar.pos === 0) this.note('concert', s, 1, 0, 0.5);
      if (I >= 0.6 && bar.pos === 2 && bar.type !== 'ante') this.note('timpaniRoll', s + 2, 2, 0, 0, { opts: { f: fifthF, v0: 0.15, v1: 0.65 } });
      if (I >= 0.5 && firstOfSection && bar.phrase > 0) this.note('swell', s - meter, meter, 0, 0.45);
    }
    if (kind === 'mystery') {
      if (I >= 0.4 && bar.pos === 0 && !last) this.note('timpani', s, 1, 0, 0.3, { opts: { f: timpF } });
      if (I >= 0.55 && firstOfSection && bar.phrase > 0) this.note('swell', s - meter, meter, 0, 0.3);
    }
    // sparkle: glockenspiel / bell flourishes at phrase starts
    if (M.sparkle && bar.pos === 0 && bar.phrase >= 0 && I >= (M.sparkleMin ?? 0.35) && !last) {
      const ch = this.chordAt(s), tones = ch.pcs.map(pc => mod(pc + tonic, 12));
      const hi = []; for (let m = 84; m <= 100; m++) if (tones.includes(mod(m, 12))) hi.push(m);
      if (M.sparkle === 'glock') hi.slice(0, 4).forEach((m, k) => this.note('glock', s + k * (meter === 3 ? 1 / 3 : 0.25), 0.5, m, 0.38 + 0.2 * I));
      else if (bar.phrase % 2 === 0) this.note('bell', s, meter, hi[0] - 12, 0.3 + 0.2 * I);
    }
  }
  ending() {
    const { M, bars, tonic } = this, lb = bars[bars.length - 1], ch = lb.chords[0].ch, s = lb.start, I = this.iAt(s);
    const tones = ch.pcs.map(pc => mod(pc + tonic, 12));
    if (['wonder', 'night', 'mystery', 'triumph'].includes(this.mood)) {
      const hi = []; for (let m = 79; m <= 96; m++) if (tones.includes(mod(m, 12))) hi.push(m);
      const inst = this.mood === 'triumph' ? 'bell' : this.mood === 'mystery' ? 'bell' : 'celesta';
      if (inst === 'bell') this.note('bell', s, 2, hi[0], 0.45);
      else hi.slice(0, 4).forEach((m, k) => this.note('celesta', s + 0.5 + k * 0.5, 1, m, 0.42 - k * 0.04));
    }
    if (this.form.kind === 'swell') {
      this.note('swell', Math.max(0, s - 0), 1.5, 0, 0.3, { sec: 1.5 });
    }
  }

  // ---------------------------------------------------------------- performance + render
  render({ normalize = true } = {}) {
    const n = Math.max(1, Math.round(this.dur * SR)), dry = S.stereo(n), send = S.stereo(n);
    const hr = rng(S.mixSeed(this.seed, 'human', this.mood));
    const lines = new Map(), echo = this.M.echo ? S.stereo(n) : null, meter = this.meter;
    for (const e of this.ev) {
      const I = INSTR[e.inst];
      // humanise: timing scatter by instrument family, velocity scatter, metric accents, rolled chords
      const legato = I.line || I.bowed;
      let sig = legato ? 0.012 : ['kick', 'concert', 'shaker', 'brush', 'woodblock', 'timpani', 'cymbal'].includes(e.inst) ? 0.005 : 0.01;
      if (this.downbeat && e.beat < 0.01) sig = 0.003;                                       // the struck downbeat is tight
      e.t = Math.max(0, e.t + S.gauss(hr) * sig + e.roll);
      const inBar = mod(e.beat + 1e-6, meter) - 1e-6;
      const acc = e.dur > 1.2 || legato ? 1 : inBar < 0.01 ? 1.07 : meter === 4 && Math.abs(inBar - 2) < 0.01 ? 1.0 : Math.abs(inBar - Math.round(inBar)) < 0.01 ? 0.94 : 0.86;
      e.vel = clamp(e.vel * acc * (1 + S.gauss(hr) * 0.1), 0.05, 1);
      if (legato) { const k = `${e.inst}:${e.line}`; if (!lines.has(k)) lines.set(k, []); lines.get(k).push(e); continue; }
      const f = e.opts?.f ?? mtof(e.midi);
      const maxDur = Math.max(0.05, this.dur - e.t);
      const buf = I.fn(f, Math.min(e.dur, maxDur), { vel: e.vel, seed: S.mixSeed(this.seed, e.inst, e.t, e.midi), ...(e.opts || {}) });
      const pan = typeof I.pan === 'function' ? I.pan(e.midi || 60) : I.pan;
      S.mixInto(dry, buf, e.t * SR, I.gain, pan);
      S.mixInto(send, buf, e.t * SR, I.gain * I.send, pan);
      if (echo && this.M.echo.includes(e.inst)) S.mixInto(echo, buf, e.t * SR, I.gain, pan);
    }
    for (const [k, evs] of lines) {
      evs.sort((a, b) => a.t - b.t);
      const t0 = evs[0].t, I = INSTR[evs[0].inst];
      // never let two notes of a monophonic line overlap after humanising
      const notes = evs.map(e => ({ t: e.t - t0, dur: e.dur, freq: mtof(e.midi) * Math.pow(2, (e.opts?.cents || 0) / 1200), vel: e.vel, slur: e.slur }));
      for (let j = 0; j + 1 < notes.length; j++) if (notes[j].t + notes[j].dur > notes[j + 1].t) notes[j].dur = Math.max(0.03, notes[j + 1].t - notes[j].t);
      const buf = I.bowed ? S.bowedLine(notes, { timbre: I.bowed, seed: S.mixSeed(this.seed, k) }) : S.windLine(notes, { timbre: I.line, seed: S.mixSeed(this.seed, k) });
      S.mixInto(dry, buf, t0 * SR, I.gain, I.pan);
      S.mixInto(send, buf, t0 * SR, I.gain * I.send, I.pan);
    }
    if (echo) { const d = S.delay(echo, { time: 0.75 * 60 / this.tempo, feedback: 0.38, lp: 2800 }); S.mixStereo(dry, d, 0, 0.32); S.mixStereo(send, d, 0, 0.3); }
    const rv = this.M.reverb, wet = S.reverb(send, { decay: rv.decay, hfDecay: 0.42, predelay: 0.025, lowCut: 240 });
    S.mixStereo(dry, wet, 0, rv.wet * 2.2);
    // master: rumble filter, gain staging to a target loudness that follows intensity and mood, limiter, edge fades
    for (const ch of [dry.L, dry.R]) {
      S.biquad(ch, 'highpass', 40, 0.54); S.biquad(ch, 'highpass', 40, 1.31);                       // 4th-order Butterworth rumble filter
      S.biquad(ch, 'peaking', 260, 0.8, -2.5); S.biquad(ch, 'highshelf', 3500, 0.7, 2);              // less boxy, a little more air
    }
    const Iavg = this.bars.reduce((a, b) => a + this.iAt(b.start), 0) / this.bars.length;
    const target = -25 + 8 * Iavg + (this.M.level || 0), now = S.rmsDb(dry);
    const g = now > -120 && normalize ? S.db(clamp(target - now, -30, 30)) : 1;
    for (const ch of [dry.L, dry.R]) for (let i = 0; i < n; i++) ch[i] *= g;
    S.limiter(dry, { ceilingDb: -1.3 });
    S.fade(dry.L, 0.004, 2.2); S.fade(dry.R, 0.004, 2.2);
    return dry;
  }
}

/**
 * Compose a cue without rendering it: the form, bars (chords, sections, phrase positions), tempo and the note
 * events (inst, t, dur, midi, vel, beat). Same arguments as composeCue, plus landAt (s: where the final chord lands
 * instead of ~3 s before the end; scoreFilm's last cue under an end card). Useful for tests, sheets and debugging.
 */
export function planCue({ dur, mood = 'pastoral', intensity = 0.5, key, tempo, seed = 1, theme, themeSteps, motif, downbeat, cut, landAt } = {}) {
  if (!(dur > 0)) throw new Error('composeCue: dur must be > 0');
  const C = new Cue({ dur, mood, intensity, key, tempo, seed, theme, themeSteps, motif, downbeat, cut, landAt });
  C.plan(); C.arrange();
  return C;
}

/**
 * Compose and render one cue.
 * dur (s), mood (see MOODS), intensity 0..1 (or a function of cue time → 0..1), key (tonic name; mode comes
 * from the mood; default the mood's first key), tempo (bpm; default the mood tempo, nudged to fit the length),
 * seed (variation), theme (film-wide motif seed; default = seed), themeSteps (diatonic steps for the melodies'
 * motif, overriding the seeded theme), motif ({ notes: "G4:1 E4:0.5 …" | parsed, key: the key it is written in,
 * n: notes to state, voice: one of MOTIF_VOICES, hold: sustain the last stated note to the end}), downbeat (bar 1
 * is a struck chord at t = 0), cut (s: where the caller will cut the cue; a held pedal arrives on its last chord
 * there).
 * → { L, R, info: { mood, key, tonic, tempo, meter, bars, form, events } }
 */
export function composeCue({ dur, mood = 'pastoral', intensity = 0.5, key, tempo, seed = 1, theme, themeSteps, motif, downbeat, cut } = {}) {
  const C = planCue({ dur, mood, intensity, key, tempo, seed, theme, themeSteps, motif, downbeat, cut });
  const out = C.render();
  out.info = { mood, key: Object.keys(NOTE_PC).find(k => NOTE_PC[k] === C.tonic && k.length <= 2 && !k.includes('#')) || C.tonic, tonic: C.tonic, tempo: C.tempo, meter: C.meter, bars: C.bars.length, form: C.form.kind, events: C.ev.length };
  return out;
}

// ================================================================ stings

export const STING_NAMES = ['surprise', 'sad', 'triumph', 'magic', 'plunk', 'stab', 'swell'];
// loudness (RMS dBFS) each sting is normalised to, and how much the score dips around it (s before / after, dB)
const STING_LEVEL = { plunk: -26, stab: -18, swell: -27 };
const STING_DIP = { plunk: { pre: 0.03, post: 0.45, db: -3 }, stab: { pre: 0.05, post: 1.3, db: -9 }, swell: { pre: 2.2, post: 0, db: -3 } };

/**
 * Short accents. → { L, R, hit } where `hit` is the time (s) of the accent inside the buffer, so it can be
 * placed exactly on a story beat. name: one of STING_NAMES:
 * surprise (harp run into a bright pizzicato hit), sad (iv → i sigh), triumph (horn fanfare on a timpani roll),
 * magic (celesta shimmer, bell, choir), plunk (one low pizzicato pluck, a comic full stop), stab (timpani + brass
 * sforzando on open fifths, fits a major or a minor cue), swell (a 2.2 s soft-mallet cymbal roll, timpani roll and
 * strings in octaves on the tonic, cresting at `hit` with the roll's last stroke: place it on a downbeat).
 */
export function makeSting(name, { key = 'C', seed = 1 } = {}) {
  const tonic = keyPc(key), base = 60 + tonic, r = rng(S.mixSeed(seed, name));
  const ev = [], add = (inst, t, dur, midi, vel, opts) => ev.push({ inst, t, dur, midi, vel, opts });
  let hit = 0, len = 3.5, rv = { decay: 2.6, wet: 0.32 };
  const low = m => (m < 40 ? m + 12 : m);
  if (name === 'surprise') {
    hit = 0.32;
    const run = [0, 2, 4, 7, 9, 12, 14, 16];
    run.forEach((x, k) => add('harp', hit - 0.3 + k * 0.036, 0.3, base + x, 0.45 + k * 0.04));
    [base - 12, base - 5, base, base + 4, base + 7].forEach(m => add('pizz', hit, 0.3, m, 0.85));
    [base + 4, base + 7, base + 12].forEach(m => add('stringsShort', hit, 0.3, m, 0.75));
    add('glock', hit, 0.4, base + 26, 0.6); add('glock', hit + 0.18, 0.4, base + 31, 0.45);
    add('concert', hit, 0.5, 0, 0.45);
    len = 2.6;
  } else if (name === 'sad') {
    hit = 0.05; len = 4.2;
    [base - 12 + 5, base + 5 - 12 + 3 + 12, base + 8].forEach(m => add('strings', 0.05, 2.0, m, 0.4));           // iv chord swell
    [base - 12, base + 3, base + 7].forEach(m => add('strings', 2.0, 1.8, m, 0.38));                             // → i
    add('piano', 0.25, 0.9, base + 20, 0.42); add('piano', 1.15, 1.6, base + 19, 0.38);                          // b6 → 5 sigh
    add('piano', 2.05, 1.6, base + 15, 0.36);
    rv = { decay: 3, wet: 0.36 };
  } else if (name === 'triumph') {
    hit = 0.62; len = 4;
    add('timpaniRoll', 0, 0.6, 0, 0, { f: mtof(base - 17), v0: 0.15, v1: 0.6 });
    add('swell', 0, 0.62, 0, 0.5, { decay: 2.5 });
    const fan = [[-0.36, 7 - 12], [-0.24, 7 - 12], [-0.12, 0], [0, 4], [0, 7]];
    fan.forEach(([dt, x], k) => add('horn', hit + dt - 0.02 + (k === 4 ? 0.0 : 0), k >= 3 ? 2.4 : 0.11, base + x, 0.75));
    [base - 12, base - 5, base, base + 4, base + 7, base + 12].forEach(m => add('strings', hit, 2.2, m, 0.6, { attack: 0.05 }));
    add('timpani', hit, 1, 0, 0.9, { f: mtof(base - 24 + 12) }); add('concert', hit, 1, 0, 0.7);
    add('bell', hit, 2, base + 24, 0.5);
  } else if (name === 'magic') {
    hit = 0.8; len = 4;
    add('swell', 0, 0.8, 0, 0.45, { decay: 2 });
    const arp = [0, 4, 7, 11, 14, 18, 19, 23, 24];                                                               // maj7 #11 shimmer
    arp.forEach((x, k) => add('celesta', 0.1 + k * 0.08, 0.5, base + 12 + x, 0.45 + 0.03 * k));
    add('bell', hit, 2, base + 24, 0.45);
    [base, base + 4, base + 7, base + 11].forEach(m => add('choir', hit - 0.4, 2.4, m, 0.4));
    add('glock', hit, 0.5, base + 31, 0.5);
    rv = { decay: 3.4, wet: 0.4 };
  } else if (name === 'plunk') {
    hit = 0.01; len = 1.8;
    const root = base - 24 >= 33 ? base - 24 : base - 12;
    add('bassPizz', hit, 0.35, root, 0.7, { bright: 0.45 });
    add('pizz', hit + 0.006, 0.3, root + 12, 0.75, { t60: 0.9, bright: 0.5 });
    rv = { decay: 1.8, wet: 0.24 };
  } else if (name === 'stab') {
    hit = 0.03; len = 3.2;
    [low(base - 24), base - 17, base - 12, base - 5].forEach((m, k) => add('brass', hit + k * 0.004, 0.26, m, 0.95));
    [base - 5, base].forEach((m, k) => add('horn', hit + 0.006 * k, 0.3, m, 0.9));
    [base - 12, base - 5, base, base + 7].forEach(m => add('stringsShort', hit, 0.25, m, 0.9));
    add('timpani', hit, 1, 0, 0.95, { f: mtof(low(base - 24)) });
    add('concert', hit, 1, 0, 0.5); add('cymbal', hit, 1, 0, 0.55, { decay: 2.2 });
    rv = { decay: 2.4, wet: 0.3 };
  } else if (name === 'swell') {
    hit = 2.2; len = 3.4;
    add('cymbalRoll', 0, hit, 0, 0, { v0: 0.04, v1: 0.75, decay: 1.4 });
    add('timpaniRoll', 0.1, hit - 0.1, 0, 0, { f: mtof(low(base - 24)), v0: 0.06, v1: 0.5 });
    [base - 12, base].forEach(m => add('strings', 0.05, hit + 0.02, m, 0.6, { attack: hit * 1.15, release: 0.3, voices: 5 }));   // still rising at the hit
    add('timpani', hit, 1, 0, 0.75, { f: mtof(low(base - 24)) });                                                              // the roll's terminal stroke
    add('concert', hit, 1, 0, 0.5);
    rv = { decay: 2.6, wet: 0.32 };
  } else throw new Error(`unknown sting ${name}`);
  const n = Math.round(len * SR), dry = S.stereo(n), send = S.stereo(n);
  const lines = [];
  for (const e of ev) {
    const I = INSTR[e.inst], t = Math.max(0, e.t + S.gauss(r) * 0.004);
    if (I.line) { lines.push({ ...e, t }); continue; }
    const buf = I.fn(e.opts?.f ?? mtof(e.midi), e.dur, { vel: e.vel, seed: S.mixSeed(seed, name, e.t, e.midi), ...(e.opts || {}) });
    const pan = typeof I.pan === 'function' ? I.pan(e.midi || 60) : I.pan;
    S.mixInto(dry, buf, t * SR, I.gain, pan); S.mixInto(send, buf, t * SR, I.gain * I.send, pan);
  }
  if (lines.length) {
    lines.sort((a, b) => a.t - b.t);
    const groups = [];                                   // simultaneous horn notes become separate lines (chords)
    for (const e of lines) { const g = groups.find(g => g[g.length - 1].t + g[g.length - 1].dur <= e.t + 1e-3); if (g) g.push(e); else groups.push([e]); }
    for (const g of groups) {
      const t0 = g[0].t, I = INSTR[g[0].inst];
      const buf = S.windLine(g.map(e => ({ t: e.t - t0, dur: e.dur, freq: mtof(e.midi), vel: e.vel })), { timbre: I.line, seed: S.mixSeed(seed, name, t0) });
      S.mixInto(dry, buf, t0 * SR, I.gain, I.pan); S.mixInto(send, buf, t0 * SR, I.gain * I.send, I.pan);
    }
  }
  const wet = S.reverb(send, { decay: rv.decay, hfDecay: 0.42, predelay: 0.02 });
  S.mixStereo(dry, wet, 0, rv.wet * 2.2);
  for (const ch of [dry.L, dry.R]) S.biquad(ch, 'highpass', { plunk: 62, stab: 48 }[name] ?? 32, 0.7);
  const now = S.rmsDb(dry), g = S.db(clamp((STING_LEVEL[name] ?? -21) - now, -30, 30));
  for (const ch of [dry.L, dry.R]) for (let i = 0; i < n; i++) ch[i] *= g;
  S.limiter(dry, { ceilingDb: -1.3 });
  S.fade(dry.L, 0.002, 0.5); S.fade(dry.R, 0.002, 0.5);
  dry.hit = hit;
  return dry;
}

// ================================================================ film score

const XF = 1.5;          // cue crossfade length (s)
const CUT_FADE = 0.03;   // a downbeat cuts the previous cue with this fade (s)
const NONE_FADE = 0.3;   // music 'none' fades the score out over this (s)
const OVERRUN = 6;       // a cue that will be cut is composed this much longer, so it is cut mid-flight (s)
const HOLD_INTO = 1.2;   // a final chord is held this far into the statement that follows it (s), if it fits
const CLASH_TAIL = 0.2;  // ... or, if it would clash, is gone this soon after the statement enters (s)
// The film's last cue, when it plays under the end card, lands its final chord as the card comes up (or, for a card
// shorter than 2.2 s or a cue that cannot reach the card's start in tempo, END_FADE + 1 s before the end), is
// composed END_RING s past the film's end so the chord still sounds at the end (its notes release END_RING before the
// composed end, see ringSec), and fades out with the picture's fade to black (END_FADE, as frame.mjs). Plan P4 4.5; false = the final chord lands ~3 s before the end.
const LAND_ON_END_CARD = true;
const END_RING = 2.3, END_FADE = 1.2;
const FIFTHS = pc => mod(pc * 7, 12);
const fifthsDist = (a, b) => { const d = mod(FIFTHS(a) - FIFTHS(b), 12); return Math.min(d, 12 - d); };
const keyName = pc => Object.keys(NOTE_PC).find(n => NOTE_PC[n] === pc);
// pitch classes (absolute) sounding at `sec` in a planned cue: its chord there, and a held pedal note
const tonesAt = (C, sec) => {
  const b = C.beatAt(sec), pcs = C.chordAt(b).pcs.slice(), held = C.motif?.hold && C.motif.evs[C.motif.evs.length - 1];
  if (held && b >= held.beat) pcs.push(held.pc);
  return pcs.map(pc => mod(pc + C.tonic, 12));
};
// pitch classes (absolute) a statement opens with: its chords and its notes in the first HOLD_INTO seconds
const entryTones = C => {
  const pcs = [...C.bars[0].chords.filter(c => C.t(c.at) < HOLD_INTO).flatMap(c => c.ch.pcs), ...C.motif.evs.filter(e => C.t(e.beat) < HOLD_INTO).map(e => e.pc)];
  return [...new Set(pcs.map(pc => mod(pc + C.tonic, 12)))];
};
// a tone of `a` a semitone from a tone of `b` that `b` does not share (Eb under E, F under E, C under B)
const clashes = (a, b) => a.some(p => !b.includes(p) && b.some(q => semis(p, q) === 1));

/**
 * Score a compiled film plan (see the header for the cue fields). Consecutive plain cues of the same mood merge
 * into one continuous cue (the theme keeps going and the arrangement follows the intensity changes); different
 * moods crossfade over 1.5 s with equal-power curves; without a score key, keys are chosen from each mood's
 * preferred tonics to stay close on the circle of fifths to the previous cue. Motif cues start exactly on their
 * t0; the outgoing cue lands its final chord just before and holds it 1.2 s into the statement if it fits the
 * statement's opening chord, and fades it out by t0 + 0.2 s if it would clash (a C-minor cue into a C-major
 * statement: Eb under E). Downbeat cues cut the previous cue at their t0, 'none' fades the score out over 0.3 s
 * and keeps it silent; stings land their accent exactly on t with the score dipped underneath. A last cue that plays
 * into the end card (plan.cards) rings to the film's end and fades out with the picture (LAND_ON_END_CARD).
 * → { L, R, cues: [{ t0, t1, mood, tonic, tempo, form, motif, downbeat, themeSteps }] } (cues: where each was
 * placed, for inspection; themeSteps: the diatonic steps its melodies were built on)
 */
export function scoreFilm(plan, { seed = 1 } = {}) {
  const dur = Math.max(0, plan.duration || 0), n = Math.max(1, Math.round(dur * SR)), out = S.stereo(n);
  const entries = plan.music || [];
  const scoreKey = plan.score?.key ?? null, home = scoreKey != null ? keyPc(scoreKey) : null;
  const motifNotes = plan.score?.motif ? motifDegrees(parseMotif(plan.score.motif), scoreKey ?? 'C') : null;
  const themeSteps = motifNotes ? motifSteps(motifNotes) : null;
  const clip = e => ({ ...e, t0: Math.max(0, e.t0), t1: Math.min(dur, e.t1) });
  const silent = entries.filter(e => e.mood === 'none' && e.t1 > e.t0).map(clip).filter(e => e.t1 > e.t0);
  const cues = entries.filter(e => e.mood && e.mood !== 'none' && MOODS[e.mood] && e.t1 > e.t0).map(clip)
    .filter(e => e.t1 - e.t0 > 0.05).sort((a, b) => a.t0 - b.t0);
  // a gap after a cue is a 'none' too (compile leaves a gap where a scene sets music: "none")
  cues.forEach((c, k) => {
    const nx = cues.slice(k + 1).find(o => o.t0 > c.t0), end = nx ? nx.t0 : dur;
    if (end - c.t1 >= 0.3 && !cues.some(o => o !== c && o.t0 <= c.t1 + 0.05 && o.t1 > c.t1 + 0.05) && !silent.some(z => Math.abs(z.t0 - c.t1) < 0.3)) silent.push({ t0: c.t1, t1: end });
  });
  const special = c => (c.motif > 0 && motifNotes) || c.hold || c.downbeat;
  const merged = [];
  for (const c of cues) {
    const p = merged[merged.length - 1], I = c.intensity ?? 0.5;
    if (p && p.mood === c.mood && c.t0 - p.t1 < 0.3 && !special(c) && !p.hold && (c.tempo ?? null) === (p.tempo ?? null) && (c.key ?? null) === (p.key ?? null)) { p.t1 = Math.max(p.t1, c.t1); p.pts.push([c.t0, I]); }
    else merged.push({ ...c, pts: [[c.t0, I]] });
  }
  let prevTonic = null;
  const jobs = [], endCard = (plan.cards || []).find(x => x.kind === 'end');
  for (let k = 0; k < merged.length; k++) {
    const c = merged[k], prev = merged[k - 1], next = merged[k + 1];
    const touchPrev = prev && c.t0 - prev.t1 < 0.3, touchNext = next && next.t0 - c.t1 < 0.3;
    const hasMotif = c.motif > 0 && !!motifNotes;
    // entry: a downbeat or a motif statement starts exactly on t0; otherwise centre a crossfade on the join
    let s0 = c.t0, fin = 0;
    if (touchPrev && !c.downbeat) { if (hasMotif) fin = 0.08; else { s0 = Math.max(0, c.t0 - XF / 2); fin = c.t0 - s0 > 0.01 ? 2 * (c.t0 - s0) : 0; } }
    // exit: cut by a downbeat or by silence, or overlap the next cue, or end on our own
    const none = silent.find(z => z.t0 > c.t0 + 0.05 && z.t0 < c.t1 + 0.3);
    let s1 = c.t1, fout = 0, cut = null, over = 0, into = false, landAt;
    if (touchNext && next.downbeat) { cut = next.t0; fout = CUT_FADE; }
    else if (none) { cut = none.t0; fout = NONE_FADE; }
    else if (touchNext && next.motif > 0 && motifNotes) {
      // the statement enters on the cut: our final chord lands just before it and is still sounding as it enters
      s1 = Math.min(dur, next.t0 + HOLD_INTO); fout = s1 - Math.max(c.t0, next.t0 - 0.3); over = next.t0 + 2.6 - s1; into = true;
    }
    else if (touchNext) { s1 = Math.min(dur, c.t1 + XF / 2); fout = s1 - Math.max(c.t0, c.t1 - XF / 2); over = 1.2; }   // final chord still held as the crossfade starts
    else if (LAND_ON_END_CARD && !next && !c.hold && endCard && c.t0 < endCard.t0 && c.t1 >= dur - 0.05) { over = END_RING; fout = Math.min(END_FADE, c.t1 - c.t0); landAt = Math.min(endCard.t0, dur - END_FADE - 1) - s0; }
    if (cut != null) s1 = Math.min(dur, cut + fout);
    if (s1 - s0 < 0.05) continue;
    const keys = MOODS[c.mood].keys.map(keyPc);
    const tonic = c.key != null ? keyPc(c.key) : home != null ? home : prevTonic == null ? keys[0] : keys.reduce((a, b) => (fifthsDist(b, prevTonic) < fifthsDist(a, prevTonic) ? b : a));
    prevTonic = tonic;
    // intensity as a function of cue time: steps between scene values, smoothed over ~2 s
    const pts = c.pts.map(([t, v]) => [t - s0, v]);
    const iFn = t => {
      let v = pts[0][1];
      for (let j = 1; j < pts.length; j++) { const [tj, vj] = pts[j]; v += (vj - v) * smoothstep((t - tj + 1) / 2); }
      return v;
    };
    const motif = hasMotif ? { notes: motifNotes, n: c.motif === true ? motifNotes.length : c.motif, voice: c.motifVoice ?? DEFAULT_MOTIF_VOICE[c.mood], hold: !!c.hold } : null;
    const args = {
      dur: s1 - s0 + (cut != null ? OVERRUN : over), mood: c.mood, intensity: pts.length > 1 ? iFn : pts[0][1], key: keyName(tonic), tempo: c.tempo,
      seed: S.mixSeed(seed, k, c.mood), theme: seed, themeSteps, motif, downbeat: !!c.downbeat, cut: cut != null ? cut - s0 : null, landAt,
    };
    let C = planCue(args);
    // a motif statement too long to land as the card comes up lands by END_FADE + 1 s before the end instead, if it can
    if (landAt != null && s0 + C.t(C.form.landing) > dur - END_FADE - 1 + 0.01) C = planCue({ ...args, landAt: dur - END_FADE - 1 - s0 });
    jobs[k] = { c, C, s0, s1, fin, fout, into, tonic, motif };
  }
  // every cue is planned before any is rendered, so a final chord held into a statement can be checked against the
  // statement's opening: if a tone of it would rub a semitone against the statement (the outgoing cue's Eb under the
  // incoming C-major E), it is faded out by the time the statement is under way instead of held into it
  const placed = [];
  jobs.forEach((j, k) => {
    const nx = jobs[k + 1];
    if (j.into && nx && clashes(tonesAt(j.C, nx.s0 - j.s0 - 0.05), entryTones(nx.C))) {
      j.s1 = Math.min(dur, nx.s0 + CLASH_TAIL); j.fout = j.s1 - Math.max(j.c.t0, nx.s0 - 0.35);
    }
    const { s0, s1, fin, fout, C } = j, cue = C.render();
    const a = Math.round(s0 * SR), len = Math.min(cue.L.length, Math.round((s1 - s0) * SR)), fi = Math.round(fin * SR), fo = Math.round(fout * SR);
    for (let i = 0; i < len && a + i < n; i++) {
      let g = 1;
      if (i < fi) g *= Math.sin(0.5 * Math.PI * i / fi);
      if (i >= len - fo) g *= Math.sin(0.5 * Math.PI * (len - i) / fo);
      out.L[a + i] += cue.L[i] * g; out.R[a + i] += cue.R[i] * g;
    }
    const motif = j.motif;
    placed.push({ t0: s0, t1: s1, mood: j.c.mood, tonic: j.tonic, tempo: C.tempo, form: C.form.kind, motif: motif ? { n: motif.n, voice: motif.voice, hold: motif.hold } : null, downbeat: !!j.c.downbeat, themeSteps: C.theme.steps.slice() });
  });
  // 'none': silence after the 0.3 s fade, until the next cue
  for (const z of silent) for (let i = Math.round((z.t0 + NONE_FADE) * SR); i < Math.min(n, Math.round(z.t1 * SR)); i++) { out.L[i] = 0; out.R[i] = 0; }
  // stings: key of the cue under them; dip the score around the accent
  for (const e of entries.filter(e => e.sting && e.t != null)) {
    const under = placed.find(p => e.t >= p.t0 && e.t <= p.t1);
    const st = makeSting(e.sting, { key: keyName(under ? under.tonic : home ?? 0), seed: S.mixSeed(seed, 'sting', e.t) });
    const dip = STING_DIP[e.sting] || { pre: 0.25, post: 1.6, db: -6 };
    const at = Math.round((e.t - st.hit) * SR), d0 = Math.round((e.t - dip.pre) * SR), d1 = Math.round((e.t + dip.post) * SR), ramp = Math.round(0.2 * SR), depth = 1 - S.db(dip.db);
    if (under) for (let i = Math.max(0, d0 - ramp); i < Math.min(n, d1 + ramp); i++) {
      const u = i < d0 ? (i - (d0 - ramp)) / ramp : i > d1 ? 1 - (i - d1) / ramp : 1, g = 1 - depth * smoothstep(u);
      out.L[i] *= g; out.R[i] *= g;
    }
    S.mixStereo(out, st, at, 1);
  }
  S.limiter(out, { ceilingDb: -1.2 });
  out.cues = placed;
  return out;
}
