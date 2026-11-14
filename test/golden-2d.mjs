#!/usr/bin/env node
// golden-2d: the golden check for the 2D films (plan P0). Frame hashes at fixed samples, the hashes of music.wav
// and mix.wav, stills sheets, a before/after comparison and short motion strips, so an engine change can show it
// changed only what it was meant to. Not a node:test file ("npm test" only runs test/*.test.mjs).
//
// The engine is loaded from the tree given with --engine (dynamic imports of <tree>/engine/...), so one copy of this
// file can measure main, a working tree or any other checkout. Films are <tree>/films/* with a film.json, minus
// 3D films ("format": { "engine": "3d" }). Voices come only from each film's cached takes (no API key is read or
// needed; run with GEMINI_API_KEY unset). Nothing is written into the engine tree: --out may not be inside a tree
// (or hold one), nor overlap --base.
//
//   node test/golden-2d.mjs record  --engine <tree> --out <dir> [--film <slug>]... [--jobs 3] [--chunk 16] [--keep-audio]
//   node test/golden-2d.mjs compare --engine <tree> --base <dir> --out <dir> [--film <slug>]... [--jobs 3] [--chunk 16]
//                                   [--allow <file>] [--allow-shots film:shot,film:shot,...] [--keep-audio] [--no-sound]
//   node test/golden-2d.mjs strips  --engine <tree> --out <dir> [--base-engine <tree2>] [--film <slug>]...
//                                   [--moment <id or id prefix>]... [--jobs 3]
//   node test/golden-2d.mjs moments                     (prints the named moments table)
//
// record   For every film, the samples are: the middle frame of every shot ("mid:<shot>"), the middle of every
//          title/end card ("card:<kind>:<i>"), and every frame of the named moments below ("moment:<id>:f<n>"),
//          which include the 44 head snaps of the motion audit. Frame n is drawn at t = n / fps, as the renderer
//          does. Each sample's hash is the SHA-256 of the decoded pixels (canvas.data(), film resolution, byte order
//          in index.json) — never of an encoded file. A pseudo-film "_rigs" holds rig sheets (a rig drawn over its
//          gait cycle, see RIG_SHEETS) for rig glitches the films never show on screen.
//          music.wav and mix.wav are made by the engine's own scoreFilm / mixFilm / writeMaster into <dir>/<film>/,
//          hashed (SHA-256 of the file), then deleted unless --keep-audio.
//          Writes <dir>/index.json (with the node, canvas and ffmpeg versions), <dir>/<film>/manifest.json (sorted
//          keys, so two runs can be diffed), <dir>/<film>/frames/f<n>.png (lossless, the "before" images for
//          compare), <dir>/<film>/stills.jpg (thumbnails of every sample with shot id, frame and reason),
//          <dir>/run.json (timings and machine load: not part of the comparison) and <dir>/logs/ (each worker's
//          output, e.g. the engine's warnings). On an error, the half-made film folders are removed and no
//          index.json is written.
// compare  Records the same samples from --engine into --out (manifests, stills, but PNGs only for changed frames)
//          and compares with --base, a folder made by record. Lists every changed frame grouped by film and shot
//          (share of pixels changed, largest channel difference, changed box), writes <out>/<film>/diff/f<n>.jpg
//          (before | after | difference amplified, and below them the changed area enlarged) and says whether
//          music.wav and mix.wav changed (--no-sound skips the sound: pictures only, and says so). Writes
//          <out>/changes.json in every case (with "error" on an error). Exit 0 when nothing changed or every change
//          is allowed, 1 when something unexpected changed, 2 on an error.
//          Unexpected too: a change in which lines have no cached voice, and a base film missing from the tree.
//          Base films left out with --film are listed as not checked. A different node / canvas / ffmpeg version
//          from the base's is printed as a warning.
//          --allow-shots / --allow <file> (a JSON array of strings, or one per line, "#" comments) name the expected
//          changes: "film:shot" (a shot id, or "card:open" / "card:end"; "_rigs:<sheet id>" for a rig sheet),
//          "film:*" (anything in that film), "film:music", "film:mix", "film:sound" (both) or "film:voices".
//          An allowed shot that did not change is reported too.
//          A shot whose timing moved has its middle sample matched by shot id and reported as moved.
// strips   For every named moment, a row of up to 12 frames around it, for each of the moment's crops:
//            body  around the character's whole box over the strip (full frame when it is large or off screen);
//            feet  the ground under the character at 1:1 or an integer enlargement, framed on a fixed world point
//                  (the character's ground point at the moment's first frame, a cyan cross), so a foot that
//                  slides moves against the cross and the ground; each cell gives the root's offset from it;
//            head  the head at 1:1 or an integer enlargement, framed on the body's root point (so the head's own
//                  moves show), never the full frame. Heads or feet over 540 px tall are shown at 540 px.
//          Labelled with film, shot, frame, and the character's facing and action. The moment's own frames have a
//          yellow border. --base-engine puts the before row (that tree) above the after row (--engine), with one
//          crop for both. Writes <dir>/<film>/<moment>.<crop>.jpg and <dir>/strips.json (which also lists strips
//          that were not made, e.g. a head that is off screen).
//
// --jobs N   at most N worker processes at once (default 3). Each worker renders one fixed chunk of a film's samples
//            (--chunk frames, default 16) or one film's sound; the chunks do not depend on --jobs.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, loadavg } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

// ───────────── the named moments (PLAN-2D.md items 1.1, 1.2, 1.3, 1.7, P5, P7 and the table in section 4) ─────────────
// frames: [first, last] are hashed (every frame between them); strip: [first, last] for `strips` (default: 4 before
// to 5 after), step: every n-th frame in the strip (default 1; at most 12 cells); who: the actor id the strip is
// cropped around; crops: the strips made (default ['body']; see `strips` above).
const MOMENTS = {
  _test: [
    { id: 's01-05-hare', frames: [445, 446], who: 'hare', why: 'P1 1.1+1.2: hare mirror-flips and snaps to standing between two runs (s01-05 f445->446)' },
    { id: 's01-08-wren-takeoff', frames: [641, 642], who: 'wren', why: 'P1 1.1: wren take-off flips at 26.74 s (f641->642); off screen in the film (see _rigs songbird-fly)' },
    { id: 's01-08-wren-flight', frames: [680, 681], strip: [675, 686], who: 'wren', why: 'P5 5.1: songbird wing snaps open every beat (wren flight in s01-08); off screen in the film (see _rigs songbird-fly)' },
    { id: 's02-04-fox-sit', frames: [1004, 1020], strip: [1002, 1022], step: 2, who: 'fox', why: 'P5 5.3: fox tail turns into a box while it sits (the sit runs f1004-f1019 in s02-04)' },
    { id: 's02-05-fox-exit', frames: [1119, 1120], who: 'fox', why: 'P1 1.1: fox exit flips at 46.6 s (f1119->1120); off screen in the film (the fox is on screen only f1223-f1376)' },
  ],
  glim: [
    { id: '1.4-tilly', frames: [405, 406], who: 'tilly', why: 'P1 1.1: Tilly turns round on a nearly vertical hop at her den (1.4 f406)' },
  ],
  kite: [
    { id: '1.1-kite-cut', frames: [60, 61], who: 'kite', why: 'P1 1.1: flip at 2.51 s falls on the cut 1.1 (should not show)' },
    { id: '1.4-june', frames: [328, 329], who: 'june', why: 'P1 1.1+1.2: kite 1.4 at 13.7 s (June starts running at f329)' },
    { id: '1.6-grandpa-stop', frames: [474, 475], who: 'grandpa', crops: ['body', 'feet'], why: 'P7: walk stop in kite 1.6 (section 4 table; grandpa stops at f475)' },
  ],
  'storm-shelter': [
    { id: '1.1-badger-start', frames: [52, 53], who: 'bramble', crops: ['body', 'feet'], why: 'P7: the badger starts running at 2.2 s (feet skate)' },
    { id: '1.2-cut', frames: [129, 130], who: 'bramble', why: 'P1 1.1: flip at 5.417 s falls on the cut 1.1->1.2 (should not show)' },
    { id: '1.2-badger-stop', frames: [210, 211], who: 'bramble', crops: ['body', 'feet'], why: 'P7: the badger stops at 8.77 s (feet skate)' },
  ],
  'strawberry-race': [
    { id: '1.3-plink-talk', frames: [245, 246], who: 'plink', why: 'P5 5.2: the frog starts talking in 1.3 (throat sac pops)' },
    { id: '1.4-burr-run', frames: [321, 322], who: 'burr', why: 'P1 table: strawberry-race 1.4 (the plan names the shot only; Burr starts running at f322)' },
    { id: '1.7-plink-talk', frames: [640, 641], who: 'plink', why: 'P5 5.2: the frog starts talking in 1.7 (throat sac pops)' },
  ],
  'seventy-six-summers': [
    { id: '2.6-owl-sleep', frames: [1285, 1286], who: 'hollis', why: 'P1 1.3: the owl\'s head pops up level as it nods off (2.6 f1285->1286)' },
    { id: '3.1-frog', frames: [1511, 1515], strip: [1490, 1534], step: 4, who: 'frog', why: 'P5 5.2: the frog sits idle through 3.1 (no breath yet; on screen f1454-f1572, about 40 px)' },
    { id: '4.3-tail-set', frames: [2038, 2039], who: 'fidget', why: 'P1 1.7: the tail drops 170 px in one frame on a set (4.3 f2038->2039)' },
    { id: '5.2-pebble-stop', frames: [2462, 2463], who: 'pebble', crops: ['body', 'feet'], why: 'P7: Pebble\'s walk stops in 5.2 (section 4 table)' },
    { id: '5.3-fidget-a', frames: [2531, 2532], who: 'fidget', why: 'P1 1.1+1.2: Fidget herding, flip and snap between runs (5.3 f2531->2532)' },
    { id: '5.3-fidget-b', frames: [2546, 2547], who: 'fidget', why: 'P1 1.1+1.2: Fidget herding, flip and snap between runs (5.3 f2546->2547)' },
    { id: '5.3-fidget-c', frames: [2560, 2561], who: 'fidget', why: 'P1 1.1+1.2: Fidget herding, flip and snap between runs (5.3 f2560->2561)' },
    { id: '6.2-pebble-stop', frames: [2675, 2676], who: 'pebble', crops: ['body', 'feet'], why: 'P7: Pebble\'s walk ends in a nod in 6.2 (section 4 table)' },
    { id: '6.4-fidget', frames: [2763, 2764], who: 'fidget', why: 'P1 1.1: Fidget flips as a hop sets off (6.4 f2764)' },
    { id: '7.3-pebble-stop', frames: [3289, 3290], who: 'pebble', crops: ['body', 'feet'], why: 'P7: Pebble\'s walk (7.1-7.3, the plan\'s "7.2") stops in 7.3 (f3289->3290)' },
    { id: '8.3-nell-crouch', frames: [3572, 3573], who: 'nell', why: 'P1 1.3: Nell\'s head snaps as she starts to crouch (8.3 f3572->3573)' },
    { id: '8.3-fidget', frames: [3608, 3609], who: 'fidget', why: 'P1 1.1: Fidget flips as a run sets off (8.3 f3609)' },
    { id: '9.1-fidget', frames: [3700, 3701], who: 'fidget', why: 'P1 1.1: Fidget flips as a run sets off (9.1 f3701)' },
    { id: '9.12-fidget', frames: [4800, 4801], who: 'fidget', why: 'P1 1.1: Fidget flips as a hop sets off (9.12 f4801)' },
  ],
  'solar-system': [
    { id: '0.9-nell-flip', frames: [1275, 1276], who: 'nell', crops: ['body', 'feet'], why: 'P1 1.1: Nell flips as her walk sets off (0.9 f1276); P7 walk start' },
    { id: '0.9-nell-feet', frames: [1297, 1303], strip: [1294, 1305], who: 'nell', crops: ['feet', 'body'], why: 'P7: Nell\'s feet skate 60-90 px as her walk stops (0.9 f1297-1303)' },
    { id: '12.1-close', frames: [21011, 21012], who: 'nell', why: 'P1 1.1: Nell and Gran flip in a close shot (12.1 f21012)' },
    { id: '12.2-gran-start', frames: [21204, 21205], who: 'gran', why: 'P1 table: solar-system 12.2 (Gran starts walking at f21205)' },
  ],
};

// The 44 head snaps of the motion audit (P1 1.3; scratch/audit2d/motion/out/headsnap.txt): [film, actor, shot, t of
// the audit, f], where f -> f+1 is the frame pair with the largest look + tilt change near t (the audit stepped
// 1/96 s from each scene's start, which is not on the frame grid; found by golden2d/repair/probe/headsnap-frames.mjs).
// off: the head is off screen at f+1, so the film cannot show a change there.
const HEAD_SNAPS = [
  ['seventy-six-summers', 'young_nell', '1.2', 7.781, 186], ['seventy-six-summers', 'hollis', '2.6', 53.562, 1285],
  ['seventy-six-summers', 'fidget', '4.3', 82.729, 1986], ['seventy-six-summers', 'pebble', '4.5', 94.313, 2263],
  ['seventy-six-summers', 'pebble', '5.3', 106.063, 2545], ['seventy-six-summers', 'fidget', '6.3', 113.396, 2722],
  ['seventy-six-summers', 'fidget', '6.4', 115.156, 2763], ['seventy-six-summers', 'pebble', '7.3', 137.635, 3302],
  ['seventy-six-summers', 'fidget', '7.3', 137.635, 3302], ['seventy-six-summers', 'nell', '8.2', 144.135, 3459, 'off'],
  ['seventy-six-summers', 'nell', '8.3', 148.854, 3572], ['seventy-six-summers', 'fidget', '8.3', 148.854, 3572, 'off'],
  ['seventy-six-summers', 'nell', '8.3', 149.76, 3593], ['seventy-six-summers', 'fidget', '8.3', 149.76, 3593],
  ['seventy-six-summers', 'pebble', '9.2', 160.781, 3858], ['seventy-six-summers', 'pebble', '9.2', 161.99, 3887],
  ['seventy-six-summers', 'nell', '10.3', 215.562, 5173, 'off'], ['seventy-six-summers', 'fidget', '10.3', 215.562, 5173],
  ['_test', 'tortoise', 's01-07', 24.25, 581], ['_test', 'pip', 's01-07', 24.25, 581, 'off'],
  ['_test', 'hare', 's02-04', 43.844, 1051], ['_test', 'fox', 's02-04', 43.844, 1051],
  ['_test', 'hare', 's02-04', 44.74, 1073], ['_test', 'hare', 's02-05', 47.448, 1138, 'off'],
  ['storm-shelter', 'fern', '1.4', 16.01, 384], ['storm-shelter', 'bramble', '1.4', 16.01, 384, 'off'],
  ['storm-shelter', 'bramble', '1.5', 19.792, 474], ['storm-shelter', 'fern', '1.5', 19.906, 477],
  ['storm-shelter', 'fern', '1.7', 25.771, 618], ['storm-shelter', 'bramble', '1.7', 25.771, 618, 'off'],
  ['strawberry-race', 'berry', '1.5', 18.49, 443], ['strawberry-race', 'burr', '1.7', 26.198, 628],
  ['strawberry-race', 'burr', '1.7', 32.635, 783], ['strawberry-race', 'plink', '1.7', 32.635, 783],
  ['strawberry-race', 'berry', '1.7', 32.635, 783, 'off'],
  ['glim', 'tilly', '1.4', 16.906, 405], ['glim', 'glim', '1.4', 16.906, 405],
  ['glim', 'glim', '1.6', 20.219, 485, 'off'], ['glim', 'glim', '1.6', 21.073, 506],
  ['kite', 'june', '1.6', 19.927, 478], ['kite', 'kite', '1.6', 19.927, 478, 'off'],
  ['kite', 'grandpa', '1.6', 20.729, 497], ['kite', 'june', '1.6', 21.427, 514], ['kite', 'june', '1.7', 24.656, 592],
];
// A head snap on the same actor and frames as a moment above adds a head strip to that moment instead of a new one.
for (const [film, who, shot, t, f, off] of HEAD_SNAPS) {
  const list = (MOMENTS[film] ??= []), same = list.find(m => m.who === who && m.frames[0] === f && m.frames[1] >= f + 1);
  const why = `P1 1.3: ${who}'s head snaps in ${shot} (f${f}->f${f + 1}, audit t ${t} s)${off ? '; the head is off screen there' : ''}`;
  if (same) { same.crops = [...new Set([...(same.crops ?? ['body']), 'head'])]; same.why += `; ${why}`; continue; }
  list.push({ id: `head-${shot}-${who}-f${f}`, frames: [f, f + 1], strip: [f - 3, f + 4], who, crops: ['head'], why, ...(off ? { offScreen: true } : {}) });
}
for (const list of Object.values(MOMENTS)) list.sort((a, b) => a.frames[0] - b.frames[0] || (a.id < b.id ? -1 : 1));

// Rig sheets: a rig drawn over a gait cycle on a fixed 1920x1080 sheet, hashed like a frame (pseudo-film "_rigs").
// For rig glitches that no film shows on screen (the _test wren flies only off screen in s01-08).
const RIG_SHEETS = [
  { id: 'songbird-fly', rig: 'songbird', gait: 'fly', n: 24, cols: 8, why: 'P5 5.1: the songbird flight cycle in 24 steps (the wings snap open at the end of each beat)' },
];
const RIGS = '_rigs', RIG_W = 1920, RIG_H = 1080;

// ───────────── small helpers ─────────────

const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
const writeJson = (path, v) => writeFileSync(path, `${JSON.stringify(sortKeys(v), null, 2)}\n`);
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { e.message = `${path}: ${e.message}`; throw e; } };
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const fname = f => `f${String(f).padStart(6, '0')}`;
const round = (x, n = 6) => Math.round(x * 10 ** n) / 10 ** n;
const secs = ms => `${(ms / 1000).toFixed(1)} s`;
const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
class UsageError extends Error {}

function parseArgs(argv) {
  const o = { _: [], film: [], moment: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    if (k === 'keep-audio') { o.keepAudio = true; continue; }
    if (k === 'no-sound') { o.noSound = true; continue; }
    const v = inline ?? argv[++i];
    if (v == null) throw new UsageError(`--${k} needs a value`);
    if (k === 'film' || k === 'moment') o[k].push(...v.split(','));
    else if (['engine', 'out', 'base', 'base-engine', 'allow', 'allow-shots', 'jobs', 'chunk'].includes(k)) o[k] = v;
    else throw new UsageError(`unknown option --${k}`);
  }
  return o;
}

/** The real path of p, also when p (or its end) does not exist yet. */
function realish(p) {
  p = resolve(p);
  if (existsSync(p)) return realpathSync(p);
  const parent = dirname(p);
  return parent === p ? p : join(realish(parent), basename(p));
}
const within = (a, b) => a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
/** Refuses an --out that is inside (or holds) an engine tree or the base folder: record, compare and strips delete
 *  <out>/<film> folders, which in a tree's films/ folder would be the film sources. */
function guardOut(out, trees, base) {
  const o = realish(out);
  for (const t of trees) {
    const r = realish(t);
    if (within(o, r) || within(r, o)) throw new UsageError(`--out ${out} must not be inside the engine tree ${t}, nor hold it`);
  }
  if (base) { const b = realish(base); if (within(o, b) || within(b, o)) throw new UsageError(`--out ${out} must not be inside the --base folder ${base}, nor hold it`); }
}

/** The engine modules of a tree, and its canvas package. */
async function engine(tree) {
  const imp = rel => import(pathToFileURL(join(tree, rel)).href);
  const [FS, F, E] = await Promise.all([imp('engine/render/film-source.mjs'), imp('engine/film/frame.mjs'), imp('engine/render/encode.mjs')]);
  return { FS, F, E, imp, canvas: createRequire(join(tree, 'package.json'))('@napi-rs/canvas') };
}

function filmList(tree, only) {
  const dir = join(tree, 'films');
  const all = readdirSync(dir).filter(s => existsSync(join(dir, s, 'film.json')))
    .filter(s => readJson(join(dir, s, 'film.json'))?.format?.engine !== '3d').sort();
  for (const s of only) if (s !== RIGS && !all.includes(s)) throw new UsageError(`no 2D film "${s}" in ${dir}`);
  return { all, films: only.length ? all.filter(s => only.includes(s)) : all, rigs: !only.length || only.includes(RIGS) };
}

function gitState(tree) {
  const git = args => spawnSync('git', ['--no-optional-locks', '-C', tree, ...args], { encoding: 'utf8' });
  const head = git(['rev-parse', 'HEAD']), st = git(['status', '--porcelain', '--', 'engine']);
  return { commit: head.status === 0 ? head.stdout.trim() : null, engineDirty: st.status === 0 ? st.stdout.split('\n').filter(Boolean).length : null };
}

/** The versions a baseline depends on besides the engine: node, the canvas package (and its native build), ffmpeg. */
function versions(tree) {
  const req = createRequire(join(tree, 'package.json')), pkg = name => { try { return req(`${name}/package.json`).version; } catch { return null; } };
  const native = `@napi-rs/canvas-${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`;
  let canvasPath = null;
  try { canvasPath = realpathSync(dirname(req.resolve('@napi-rs/canvas/package.json'))); } catch { /* not installed */ }
  const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return { node: process.version, canvas: pkg('@napi-rs/canvas'), canvasNative: { [native]: pkg(native) }, canvasPath,
    ffmpeg: ff.status === 0 ? ff.stdout.split('\n')[0].trim() : null };
}

// ───────────── samples ─────────────

/** Every sample of a film: one entry per frame, with every reason it is in the list. */
function samplesFor(slug, plan) {
  const fps = plan.fps, last = Math.round(plan.duration * fps) - 1, byFrame = new Map(), skipped = [];
  const add = (frame, key, why) => {
    if (frame < 0 || frame > last) { skipped.push(`${key} (f${frame} is past the film's last frame f${last})`); return; }
    let e = byFrame.get(frame);
    if (!e) byFrame.set(frame, (e = { frame, keys: [], why: [] }));
    e.keys.push(key); if (!e.why.includes(why)) e.why.push(why);
  };
  for (const s of plan.shots) add(Math.floor(((s.t0 + s.t1) / 2) * fps), `mid:${s.id}`, `middle of shot ${s.id}`);
  plan.cards.forEach((c, i) => add(Math.floor(((c.t0 + c.t1) / 2) * fps), `card:${c.kind}:${i}`, `middle of the ${c.kind} card`));
  for (const m of MOMENTS[slug] || []) for (let f = m.frames[0]; f <= m.frames[1]; f++) add(f, `moment:${m.id}:f${f}`, m.why);
  const list = [...byFrame.values()].sort((a, b) => a.frame - b.frame);
  for (const e of list) {
    const t = e.frame / fps, card = plan.cards.find(c => t >= c.t0 && t < c.t1);
    e.t = round(t); e.shot = plan.shotAt(t)?.id ?? (card ? `card:${card.kind}` : null);
  }
  return { list, skipped };
}

const rigSamples = () => RIG_SHEETS.map((s, i) => ({ frame: i, t: 0, shot: s.id, keys: [`rig:${s.id}`], why: [s.why] }));

// ───────────── worker processes ─────────────

async function runTasks(tasks, { jobs, work, logs }) {
  mkdirSync(work, { recursive: true }); mkdirSync(logs, { recursive: true });
  const queue = [...tasks].sort((a, b) => b.est - a.est || (a.id < b.id ? -1 : 1)), results = {}, errors = [];
  let done = 0;
  const one = task => new Promise(res => {
    const tf = join(work, `${task.id}.task.json`), rf = join(work, `${task.id}.result.json`), lf = join(logs, `${task.id}.log`);
    writeFileSync(tf, JSON.stringify(task)); rmSync(rf, { force: true });
    const out = createWriteStream(lf), t0 = performance.now();
    const p = spawn(process.execPath, [SELF, '__worker', tf, rf], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.pipe(out, { end: false }); p.stderr.pipe(out, { end: false });
    p.on('close', code => {
      out.end();
      const ms = performance.now() - t0;
      if (code === 0 && existsSync(rf)) results[task.id] = { ...readJson(rf), wallMs: Math.round(ms) };
      else errors.push(`${task.id} failed (exit ${code}); see ${lf}`);
      log(`  [${++done}/${tasks.length}] ${task.id} ${code === 0 ? 'done' : 'FAILED'} in ${secs(ms)}`);
      res();
    });
  });
  const lanes = Array.from({ length: Math.max(1, jobs) }, async () => { while (queue.length) await one(queue.shift()); });
  await Promise.all(lanes);
  if (errors.length) throw new Error(errors.join('\n'));
  return results;
}

/** Hash each sample's pixels; keep the PNG (record) and a thumbnail; in compare draw the before/after image. */
async function keepSamples(task, canvas, draw, W, H) {
  const thumb = canvas.createCanvas(TW, TH), tx = thumb.getContext('2d');
  tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
  const dir = join(task.out, task.slug), out = [];
  for (const s of task.frames) {
    const a = performance.now(), c = draw(s), px = c.data(), hash = sha256(px), drawMs = performance.now() - a;
    const r = { frame: s.frame, hash, drawMs: Math.round(drawMs) };
    const changed = s.base && s.base.hash !== hash;
    if (task.mode === 'record' || changed) writeFileSync(join(dir, 'frames', `${fname(s.frame)}.png`), await c.encode('png'));
    tx.drawImage(c, 0, 0, TW, TH);
    writeFileSync(join(dir, 'thumbs', `${fname(s.frame)}.jpg`), await thumb.encode('jpeg', 85));
    if (changed) r.diff = await diffImage(canvas, join(task.base, task.slug, 'frames', `${fname(s.base.frame)}.png`), c, px, W, H,
      join(dir, 'diff', `${fname(s.frame)}.jpg`), `${task.slug} ${s.shot ?? ''} f${s.frame}${s.base.frame !== s.frame ? ` (before: f${s.base.frame})` : ''}`);
    r.totalMs = Math.round(performance.now() - a);
    out.push(r);
  }
  return out;
}

/** A rig drawn over its gait cycle at a fixed scale (from the rig's nominal size, not its drawing, so a fix to the
 *  drawing does not move the whole sheet). No text: the pixels are hashed. */
function rigSheet(canvas, getRig, sh) {
  const R = getRig(sh.rig), rows = Math.ceil(sh.n / sh.cols), cw = RIG_W / sh.cols, ch = RIG_H / rows;
  const s = Math.min(cw / (R.width * 2.4), ch / (R.height * 2.4));
  const c = canvas.createCanvas(RIG_W, RIG_H), x = c.getContext('2d');
  x.fillStyle = '#f3ead8'; x.fillRect(0, 0, RIG_W, RIG_H);
  for (let i = 0; i < sh.n; i++) {
    const X = (i % sh.cols) * cw, Y = Math.floor(i / sh.cols) * ch;
    x.fillStyle = '#d9cdb5'; x.fillRect(X, Y + ch - 2, cw, 2); x.fillRect(X + cw - 2, Y, 2, ch);
    x.fillStyle = '#b8a888'; x.fillRect(X + 6, Y + 6, Math.round((cw - 12) * i / sh.n) + 2, 4);   // the phase, as a bar
    x.save(); R.draw(x, X + cw / 2, Y + ch * 0.8, s, 1, { pose: R.gaits[sh.gait](i / sh.n), t: 0, shadow: false }); x.restore();
  }
  return c;
}

const WORKERS = {
  // Render a chunk of samples.
  async frames(task) {
    const { FS, F, E, canvas } = await engine(task.tree);
    const t0 = performance.now(), { plan } = await FS.loadPlan(task.filmDir), loadMs = performance.now() - t0;
    const grab = E.frameGrabber(plan, F.drawFrame);
    return { frames: await keepSamples(task, canvas, s => grab.draw(s.frame / plan.fps), plan.W, plan.H), loadMs: Math.round(loadMs) };
  },

  // The rig sheets.
  async rigs(task) {
    const { imp, canvas } = await engine(task.tree), { getRig } = await imp('engine/cast/index.mjs');
    return { frames: await keepSamples(task, canvas, s => rigSheet(canvas, getRig, RIG_SHEETS[s.frame]), RIG_W, RIG_H), loadMs: 0 };
  },

  // The film's music.wav and mix.wav, made like `cinecode mix` does, hashed.
  async sound(task) {
    const { FS, imp } = await engine(task.tree);
    const [{ scoreFilm }, { mixFilm, writeMaster }, { writeWav, SAMPLE_RATE }] = await Promise.all(['engine/audio/music.mjs', 'engine/audio/mix.mjs', 'engine/audio/wav.mjs'].map(imp));
    const { film, plan, voices } = await FS.loadPlan(task.filmDir);
    const dir = join(task.out, task.slug), music = join(dir, 'music.wav'), mixPath = join(dir, 'mix.wav'), ms = {};
    let a = performance.now();
    const m = await scoreFilm(plan, film.seed != null ? { seed: film.seed } : {});
    writeWav(music, [m.L, m.R], SAMPLE_RATE, 24);
    ms.music = Math.round(performance.now() - a); a = performance.now();
    const mix = await mixFilm(plan, { voices, music: m, sounds: film?.custom?.sounds });
    writeMaster(mixPath, mix);
    ms.mix = Math.round(performance.now() - a);
    const info = p => { const b = readFileSync(p); return { sha256: sha256(b), bytes: b.length }; };
    const r = { music: info(music), mix: info(mixPath), ms };
    if (!task.keepAudio) { rmSync(music); rmSync(mixPath); }
    return r;
  },

  // Strip frames: full frames as JPEG cells, the camera, and where the wanted actors are.
  async strip(task) {
    const { FS, F, E } = await engine(task.tree);
    const { plan } = await FS.loadPlan(task.filmDir), grab = E.frameGrabber(plan, F.drawFrame), out = {};
    const last = Math.round(plan.duration * plan.fps) - 1, dir = join(task.cells, task.tag, task.slug);
    mkdirSync(dir, { recursive: true });
    for (const f of task.frames) {
      if (f < 0 || f > last) { out[f] = { frame: f, missing: true }; continue; }
      const t = f / plan.fps, c = grab.draw(t), info = F.frameInfo(plan, t), file = join(dir, `${fname(f)}.jpg`);
      writeFileSync(file, await c.encode('jpeg', 95));
      const actors = {};
      for (const a of info.actors) if (task.whos.includes(a.id)) {
        actors[a.id] = { box: a.screenBox, headBox: a.headBox, root: a.contact.screen, x: a.x, y: a.y, za: a.zoom,
          face: a.face, action: a.action, squash: round(a.squash, 3), tilt: round(a.tilt, 3) };
      }
      out[f] = { frame: f, file, shot: info.shot ?? (info.card ? `card:${info.card}` : null),
        cam: info.camera ? { cx: info.camera.cx, cy: info.camera.cy, zoom: info.camera.zoom } : null, actors };
    }
    return { frames: out, W: plan.W, H: plan.H };
  },
};

async function worker(taskFile, resultFile) {
  const task = readJson(taskFile);
  const r = await WORKERS[task.kind](task);
  writeFileSync(resultFile, JSON.stringify(r));
}

// ───────────── images ─────────────

const TW = 384, TH = 216;

/** Before | after | difference (amplified), and the changed area enlarged below. → stats */
async function diffImage(canvas, basePng, after, ap, W, H, outPath, label) {
  if (!existsSync(basePng)) return { note: `no before image (${basePng} is missing)` };
  const before = canvas.createCanvas(W, H);
  before.getContext('2d').drawImage(await canvas.loadImage(readFileSync(basePng)), 0, 0);
  const bp = before.data(), diff = canvas.createCanvas(W, H), dx = diff.getContext('2d'), img = dx.createImageData(W, H), d = img.data;
  let n = 0, max = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < bp.length; i += 4, p++) {
    const m = Math.max(Math.abs(bp[i] - ap[i]), Math.abs(bp[i + 1] - ap[i + 1]), Math.abs(bp[i + 2] - ap[i + 2]));
    d[i + 3] = 255;
    if (!m) continue;
    n++; if (m > max) max = m;
    const x = p % W, y = (p / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const v = Math.min(255, 64 + m * 12);            // even a 1-level change shows
    d[i] = v; d[i + 1] = v >> 1; d[i + 2] = v;
  }
  dx.putImageData(img, 0, 0);
  const stats = { changedShare: round(n / (W * H), 6), changedPixels: n, maxDelta: max, box: n ? [x0, y0, x1 + 1, y1 + 1] : null };
  if (!n) return { ...stats, note: 'the hashes differ but the before PNG decodes to the same pixels (PNG round trip not exact?)' };
  // the changed area, padded, at 16:9
  let cw = Math.max(x1 + 1 - x0 + 48, 240), ch = Math.max(y1 + 1 - y0 + 48, 135);
  if (cw / ch < 16 / 9) cw = ch * 16 / 9; else ch = cw * 9 / 16;
  cw = Math.min(cw, W); ch = Math.min(ch, H);
  const cx = Math.min(Math.max((x0 + x1 + 1) / 2 - cw / 2, 0), W - cw), cy = Math.min(Math.max((y0 + y1 + 1) / 2 - ch / 2, 0), H - ch);
  const pw = W / 2, ph = H / 2, lh = 30, out = canvas.createCanvas(pw * 3, (ph + lh) * 2 + lh), x = out.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, out.width, out.height);
  x.fillStyle = '#fff'; x.font = '18px Menlo, monospace'; x.textBaseline = 'middle';
  x.fillText(`${label}   changed ${(stats.changedShare * 100).toFixed(3)}% of pixels (${n}), largest channel difference ${max}, box ${stats.box.join(',')}`, 8, lh / 2);
  const panels = [[before, 'before'], [after, 'after'], [diff, 'difference (amplified)']];
  panels.forEach(([src, name], i) => {
    const X = i * pw, Y = lh;
    x.fillStyle = '#ccc'; x.fillText(name, X + 8, Y + lh / 2);
    x.drawImage(src, 0, 0, W, H, X, Y + lh, pw, ph);
    x.strokeStyle = '#ff2050'; x.lineWidth = 2; x.strokeRect(X + cx / 2, Y + lh + cy / 2, cw / 2, ch / 2);
    const Y2 = Y + lh + ph;
    x.fillStyle = '#ccc'; x.fillText(`${name}, area ${Math.round(cx)},${Math.round(cy)} ${Math.round(cw)}x${Math.round(ch)}`, X + 8, Y2 + lh / 2);
    x.imageSmoothingEnabled = cw < pw ? false : true;
    x.drawImage(src, cx, cy, cw, ch, X, Y2 + lh, pw, ph);
    x.imageSmoothingEnabled = true;
  });
  writeFileSync(outPath, await out.encode('jpeg', 90));
  return { ...stats, image: outPath };
}

/** A stills sheet from the thumbnails. marked: frames to outline in red (changed in compare). */
async function stillsSheet(canvas, { title, list, dir, outPath, marked = new Set() }) {
  const cols = 6, lh = 46, gap = 8, m = 16, head = 44, rows = Math.ceil(list.length / cols);
  const c = canvas.createCanvas(m * 2 + cols * TW + (cols - 1) * gap, m * 2 + head + rows * (TH + lh) + (rows - 1) * gap), x = c.getContext('2d');
  x.fillStyle = '#f1e8d6'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#2a2130'; x.font = 'bold 24px Georgia, serif'; x.textBaseline = 'top';
  x.fillText(title, m, m);
  for (const [i, s] of list.entries()) {
    const X = m + (i % cols) * (TW + gap), Y = m + head + Math.floor(i / cols) * (TH + lh + gap);
    const p = join(dir, `${fname(s.frame)}.jpg`);
    if (existsSync(p)) x.drawImage(await canvas.loadImage(readFileSync(p)), X, Y, TW, TH);
    if (marked.has(s.frame)) { x.strokeStyle = '#e0103a'; x.lineWidth = 6; x.strokeRect(X + 3, Y + 3, TW - 6, TH - 6); }
    x.fillStyle = '#2a2130'; x.font = 'bold 15px Menlo, monospace';
    x.fillText(`${s.shot ?? '-'}  f${s.frame}  ${s.t.toFixed(2)}s${marked.has(s.frame) ? '  CHANGED' : ''}`, X, Y + TH + 4);
    x.fillStyle = '#5a4c54'; x.font = '13px Menlo, monospace';
    const why = s.keys.some(k => k.startsWith('moment:')) ? s.keys.filter(k => k.startsWith('moment:')).map(k => k.split(':')[1]).join(' ') : s.why[0];
    x.fillText(why.length > 48 ? `${why.slice(0, 47)}…` : why, X, Y + TH + 24);
  }
  writeFileSync(outPath, await c.encode('jpeg', 85));
}

// ───────────── record and compare ─────────────

function allowList(o) {
  const items = [];
  if (o['allow-shots']) items.push(...o['allow-shots'].split(','));
  if (o.allow) {
    const text = readFileSync(resolve(o.allow), 'utf8');
    try { items.push(...JSON.parse(text)); }
    catch { items.push(...text.split('\n').map(l => l.replace(/#.*/, '').trim())); }
  }
  return new Set(items.map(s => String(s).trim()).filter(Boolean));
}
const allowed = (allow, film, what) => allow.has(`${film}:${what}`) || allow.has(`${film}:*`)
  || ((what === 'music' || what === 'mix') && allow.has(`${film}:sound`));
const SPECIAL = ['*', 'music', 'mix', 'sound', 'voices'];

/** The films a base folder holds: its index.json, else its folders with a manifest. */
function baseFilms(base) {
  if (existsSync(join(base, 'index.json'))) return Object.keys(readJson(join(base, 'index.json')).films || {}).sort();
  return readdirSync(base).filter(s => existsSync(join(base, s, 'manifest.json'))).sort();
}

async function recordOrCompare(mode, o) {
  if (!o.engine || !o.out) throw new UsageError(`${mode} needs --engine <tree> and --out <dir>`);
  if (mode === 'compare' && !o.base) throw new UsageError('compare needs --base <dir> (a folder made by record)');
  if (mode === 'record' && o.noSound) throw new UsageError('record needs the sound (a baseline without music.wav and mix.wav could not check them); --no-sound is for compare');
  const tree = resolve(o.engine), out = resolve(o.out), base = o.base ? resolve(o.base) : null;
  guardOut(out, [tree], base);
  mkdirSync(out, { recursive: true });
  for (const f of ['index.json', 'run.json', 'changes.json']) rmSync(join(out, f), { force: true });   // a stale result must not outlive a failed run
  const made = [];
  try {
    if (base && !existsSync(join(base, 'index.json'))) throw new UsageError(`--base ${base} is not a folder made by record (no index.json)`);
    return await recordOrCompareIn(mode, o, { tree, out, base, made });
  } catch (e) {
    rmSync(join(out, '.work'), { recursive: true, force: true });
    for (const d of made) rmSync(d, { recursive: true, force: true });
    if (mode === 'compare') writeJson(join(out, 'changes.json'), { base, engine: tree, error: e instanceof UsageError ? e.message : String(e.stack ?? e), changed: null, unexpected: null });
    throw e;
  }
}

async function recordOrCompareIn(mode, o, { tree, out, base, made }) {
  const jobs = Math.max(1, +(o.jobs ?? 3)), chunk = Math.max(1, +(o.chunk ?? 16)), allow = allowList(o), noSound = !!o.noSound;
  const started = performance.now(), load0 = loadavg();
  const eng = await engine(tree), { all: treeFilms, films, rigs } = filmList(tree, o.film), info = {}, tasks = [];
  const slugs = [...films, ...(rigs ? [RIGS] : [])];
  log(`${mode}: ${films.length} films${rigs ? ' and the rig sheets' : ''} from ${tree} → ${out}${noSound ? ' (no sound)' : ''}`);
  const baseIndex = base && existsSync(join(base, 'index.json')) ? readJson(join(base, 'index.json')) : null;
  for (const slug of slugs) {
    const dir = join(out, slug);
    const bm = base && existsSync(join(base, slug, 'manifest.json')) ? readJson(join(base, slug, 'manifest.json')) : null;
    let list, plan;
    if (slug === RIGS) {
      list = rigSamples();
      info[slug] = { list, skipped: [], plan: { title: 'Rig sheets', W: RIG_W, H: RIG_H }, voicesMissing: null, lines: null, baseManifest: bm };
    } else {
      const filmDir = join(tree, 'films', slug), r = await eng.FS.loadPlan(filmDir);
      plan = r.plan;
      const s = samplesFor(slug, plan);
      list = s.list;
      info[slug] = { list, skipped: s.skipped, plan: { title: plan.title, W: plan.W, H: plan.H, fps: plan.fps, duration: round(plan.duration), shots: plan.shots.length, cards: plan.cards.length },
        voicesMissing: [...new Set(r.missing.map(l => l.id))].sort(), lines: new Set((plan.lines || []).map(l => l.id)).size, baseManifest: bm };
    }
    rmSync(dir, { recursive: true, force: true });
    made.push(dir);
    for (const d of ['frames', 'thumbs', ...(mode === 'compare' ? ['diff'] : [])]) mkdirSync(join(dir, d), { recursive: true });
    const frames = list.map(s => { const b = baseOfSample(bm, s); return { frame: s.frame, shot: s.shot, base: b ? { frame: b.frame, hash: b.hash } : null }; });
    if (slug === RIGS) { tasks.push({ kind: 'rigs', id: `${RIGS}.sheets`, est: 2, tree, slug, out, base, mode, frames }); continue; }
    const filmDir = join(tree, 'films', slug);
    for (let i = 0; i < frames.length; i += chunk) {
      const part = frames.slice(i, i + chunk);
      tasks.push({ kind: 'frames', id: `${slug}.frames.${String(i / chunk).padStart(2, '0')}`, est: part.length * (plan.duration > 200 ? 1.5 : 1), tree, filmDir, slug, out, base, mode, frames: part });
    }
    if (!noSound) tasks.push({ kind: 'sound', id: `${slug}.sound`, est: 5 + plan.duration * 0.2, tree, filmDir, slug, out, keepAudio: !!o.keepAudio });
  }
  const loaded = performance.now();
  const results = await runTasks(tasks, { jobs, work: join(out, '.work'), logs: join(out, 'logs') });
  rmSync(join(out, '.work'), { recursive: true, force: true });

  const git = gitState(tree), order = eng.E.pixelOrder(), vers = versions(tree);
  const index = { tool: 'golden-2d', engine: { tree, ...git }, pixelOrder: order, versions: vers, films: {} };
  const run = { mode, jobs, chunk, cpus: cpus().length, node: process.version, loadavgStart: load0.map(v => round(v, 2)), noSound, films: {} };
  const changes = { base, engine: tree, films: {}, allow: [...allow].sort(), sound: noSound ? 'not checked (--no-sound)' : 'checked' };
  let unexpected = 0, anyChange = false;
  for (const slug of slugs) {
    const I = info[slug], dir = join(out, slug), got = new Map(), timing = { frameMs: [], drawMs: [], loadMs: [] };
    for (const [id, r] of Object.entries(results)) if (id.startsWith(`${slug}.frames.`) || id === `${slug}.sheets`) {
      for (const f of r.frames) got.set(f.frame, f);
      timing.loadMs.push(r.loadMs); timing.frameMs.push(...r.frames.map(f => f.totalMs)); timing.drawMs.push(...r.frames.map(f => f.drawMs));
    }
    const snd = results[`${slug}.sound`] ?? null, isRigs = slug === RIGS;
    const samples = I.list.map(s => ({ frame: s.frame, t: s.t, shot: s.shot, keys: s.keys, why: s.why, hash: got.get(s.frame).hash }));
    writeJson(join(dir, 'manifest.json'), isRigs ? { film: slug, ...I.plan, sheets: RIG_SHEETS, samples }
      : { film: slug, ...I.plan, voices: { lines: I.lines, missing: I.voicesMissing }, sound: snd ? { music: snd.music, mix: snd.mix } : null, samples, skipped: I.skipped });
    index.films[slug] = isRigs ? { samples: samples.length }
      : { samples: samples.length, music: snd?.music.sha256 ?? null, mix: snd?.mix.sha256 ?? null, voicesMissing: I.voicesMissing.length };
    const sumMs = timing.frameMs.reduce((a, b) => a + b, 0);
    run.films[slug] = { samples: samples.length, frameMsMean: Math.round(sumMs / samples.length), drawMsMean: Math.round(timing.drawMs.reduce((a, b) => a + b, 0) / samples.length), frameMsMax: Math.max(...timing.frameMs), planLoadMs: timing.loadMs, ...(snd ? { soundMs: snd.ms, soundWallMs: snd.wallMs } : {}) };

    let marked = new Set();
    if (mode === 'compare') {
      const bm = I.baseManifest, C = { changed: [], dropped: [], unchangedAllowed: [], sound: {} };
      if (!bm) C.note = `no base manifest for ${slug} in ${base}`;
      for (const s of I.list) {
        const r = got.get(s.frame), b = baseOfSample(bm, s);
        if (!b) { C.changed.push({ frame: s.frame, shot: s.shot, keys: s.keys, why: s.why, added: true, after: r.hash }); continue; }
        if (b.hash === r.hash && b.frame === s.frame) continue;
        if (b.hash === r.hash) { C.changed.push({ frame: s.frame, shot: s.shot, keys: s.keys, why: s.why, movedFrom: b.frame, samePixels: true, before: b.hash, after: r.hash }); continue; }
        C.changed.push({ frame: s.frame, shot: s.shot, keys: s.keys, why: s.why, ...(b.frame !== s.frame ? { movedFrom: b.frame } : {}), before: b.hash, after: r.hash, ...(r.diff || {}) });
      }
      const seenBase = new Set(I.list.map(s => baseOfSample(bm, s)?.frame));
      for (const b of bm?.samples || []) if (!seenBase.has(b.frame)) C.dropped.push({ frame: b.frame, shot: b.shot, keys: b.keys });
      if (!isRigs) {
        for (const k of ['music', 'mix']) {
          if (noSound) { C.sound[k] = { checked: false }; continue; }
          const before = bm?.sound?.[k]?.sha256 ?? null, after = snd[k].sha256;
          C.sound[k] = { changed: before !== after, before, after, allowed: allowed(allow, slug, k) };
          if (before !== after) { anyChange = true; if (!C.sound[k].allowed) unexpected++; }
        }
        if (bm && JSON.stringify(bm.voices?.missing) !== JSON.stringify(I.voicesMissing)) {
          C.voicesMissingChanged = { before: bm.voices?.missing, after: I.voicesMissing, allowed: allowed(allow, slug, 'voices') };
          anyChange = true; if (!C.voicesMissingChanged.allowed) unexpected++;
        }
      }
      for (const c of [...C.changed, ...C.dropped]) {
        c.allowed = allowed(allow, slug, c.shot);
        anyChange = true; if (!c.allowed) unexpected++;
      }
      for (const a of allow) {
        const [f, what] = a.split(/:(.*)/s);
        if (f === slug && !SPECIAL.includes(what) && !C.changed.some(c => c.shot === what)) C.unchangedAllowed.push(what);
      }
      marked = new Set(C.changed.map(c => c.frame));
      changes.films[slug] = C;
    }
    await stillsSheet(eng.canvas, { title: `${I.plan.title} (${slug}) · ${samples.length} samples · ${mode} of ${tree}${git.commit ? ` @ ${git.commit.slice(0, 9)}` : ''}`,
      list: I.list, dir: join(dir, 'thumbs'), outPath: join(dir, 'stills.jpg'), marked });
    rmSync(join(dir, 'thumbs'), { recursive: true, force: true });
    if (mode === 'compare' && !readdirSync(join(dir, 'frames')).length) rmSync(join(dir, 'frames'), { recursive: true });
    if (mode === 'compare' && !readdirSync(join(dir, 'diff')).length) rmSync(join(dir, 'diff'), { recursive: true });
  }
  if (mode === 'compare') {
    // the base's films that this run did not check: left out on purpose (--film), or gone from the tree (unexpected)
    changes.notChecked = []; changes.missingFromTree = [];
    for (const bf of baseFilms(base)) {
      if (slugs.includes(bf)) continue;
      if (bf === RIGS || treeFilms.includes(bf)) changes.notChecked.push(bf);
      else { changes.missingFromTree.push(bf); anyChange = true; if (!allowed(allow, bf, '*')) unexpected++; }
    }
    // versions the base depended on
    const bv = baseIndex?.versions;
    changes.versions = { base: bv ?? null, now: vers, differ: bv ? Object.keys(vers).filter(k => JSON.stringify(bv[k]) !== JSON.stringify(vers[k])) : ['(the base records no versions)'] };
  }
  writeJson(join(out, 'index.json'), index);
  run.loadavgEnd = loadavg().map(v => round(v, 2));
  run.planListMs = Math.round(loaded - started);
  run.wallMs = Math.round(performance.now() - started);
  writeJson(join(out, 'run.json'), run);
  log(`${mode}: ${Object.values(index.films).reduce((a, f) => a + f.samples, 0)} samples in ${secs(run.wallMs)} (load average ${load0.map(v => v.toFixed(1)).join(' ')} at the start, ${run.loadavgEnd.join(' ')} at the end)`);
  if (mode !== 'compare') return 0;
  changes.unexpected = unexpected; changes.changed = anyChange;
  writeJson(join(out, 'changes.json'), changes);
  printChanges(changes);
  return unexpected ? 1 : 0;
}

/** A sample's "before" in the base: the same frame, or (a shot whose timing moved) the base sample with a shared key. */
function baseOfSample(bm, s) {
  if (!bm) return null;
  return bm.samples.find(b => b.frame === s.frame) ?? bm.samples.find(b => b.keys.some(k => s.keys.includes(k))) ?? null;
}

function printChanges(ch) {
  const p = s => process.stdout.write(`${s}\n`);
  p(`compare ${ch.engine}\n   with ${ch.base}`);
  if (ch.versions.differ.length) p(`WARNING: versions differ from the base's (${ch.versions.differ.join(', ')}): ${ch.versions.differ.map(k => `${k} ${JSON.stringify(ch.versions.base?.[k] ?? null)} -> ${JSON.stringify(ch.versions.now[k])}`).join('; ')}`);
  if (ch.sound !== 'checked') p(`sound ${ch.sound}`);
  for (const [slug, C] of Object.entries(ch.films)) {
    const snd = Object.entries(C.sound).map(([k, v]) => `${k}.wav ${v.checked === false ? 'not checked' : v.changed ? `CHANGED${v.allowed ? ' (allowed)' : ''}` : 'same'}`).join(', ');
    p(`\n${slug}: ${C.changed.length ? `${C.changed.length} changed frame${C.changed.length > 1 ? 's' : ''}` : 'no frame changed'}${snd ? `; ${snd}` : ''}${C.note ? `; ${C.note}` : ''}`);
    const byShot = new Map();
    for (const c of C.changed) { if (!byShot.has(c.shot)) byShot.set(c.shot, []); byShot.get(c.shot).push(c); }
    for (const [shot, list] of byShot) {
      p(`  shot ${shot}${list[0].allowed ? ' (allowed)' : ''}`);
      for (const c of list) {
        const size = c.added ? 'new sample' : c.samePixels ? `same pixels, moved from f${c.movedFrom}` : c.changedPixels != null
          ? `${(c.changedShare * 100).toFixed(3)}% of pixels, largest channel difference ${c.maxDelta}${c.movedFrom != null ? `, moved from f${c.movedFrom}` : ''}` : (c.note ?? '');
        p(`    f${c.frame}  ${size}  [${c.keys.join(' ')}]${c.image ? `  ${c.image}` : ''}`);
      }
    }
    for (const d of C.dropped) p(`  dropped sample f${d.frame} (${d.shot}) [${d.keys.join(' ')}]${d.allowed ? ' (allowed)' : ''}`);
    if (C.unchangedAllowed.length) p(`  allowed but unchanged: ${C.unchangedAllowed.join(', ')}`);
    if (C.voicesMissingChanged) p(`  the lines without a cached voice CHANGED${C.voicesMissingChanged.allowed ? ' (allowed)' : ''}: ${C.voicesMissingChanged.before?.length} before, ${C.voicesMissingChanged.after.length} after`);
  }
  for (const f of ch.missingFromTree) p(`\n${f}: in the base but MISSING from the tree (not checked)`);
  if (ch.notChecked.length) p(`\nnot checked (left out with --film): ${ch.notChecked.join(', ')}`);
  p(`\n${ch.changed ? `${ch.unexpected} unexpected change${ch.unexpected === 1 ? '' : 's'}` : 'nothing changed'}${ch.notChecked.length ? ` in the ${Object.keys(ch.films).length} checked` : ''}`);
}

// ───────────── strips ─────────────

function stripFrames(m) {
  const [a, b] = m.strip ?? [m.frames[0] - 4, m.frames[1] + 5], step = m.step ?? 1, list = [];
  for (let f = a; f <= b && list.length < 12; f += step) list.push(f);
  return list;
}
const cropsOf = m => m.crops ?? ['body'];

async function strips(o) {
  if (!o.engine || !o.out) throw new UsageError('strips needs --engine <tree> and --out <dir>');
  const out = resolve(o.out), jobs = Math.max(1, +(o.jobs ?? 3)), started = performance.now(), load0 = loadavg();
  const trees = [...(o['base-engine'] ? [{ tag: 'before', tree: resolve(o['base-engine']) }] : []), { tag: 'after', tree: resolve(o.engine) }];
  guardOut(out, trees.map(t => t.tree), null);
  const pick = m => !o.moment.length || o.moment.some(q => m.id === q || m.id.startsWith(q));
  const films = filmList(trees.at(-1).tree, o.film.filter(s => s !== RIGS)).films.filter(s => (MOMENTS[s] || []).some(pick));
  const cells = join(out, '.cells'), tasks = [], made = [];
  const canvas = createRequire(join(trees.at(-1).tree, 'package.json'))('@napi-rs/canvas');
  const moments = Object.fromEntries(films.map(s => [s, MOMENTS[s].filter(pick)]));
  // the off-screen head snaps make no strip (nothing to see); everything else is rendered once per frame
  for (const { tag, tree } of trees) for (const slug of films) {
    const ms = moments[slug].filter(m => !(m.offScreen && cropsOf(m).every(c => c === 'head')));
    const frames = [...new Set(ms.flatMap(stripFrames))].sort((a, b) => a - b), whos = [...new Set(ms.map(m => m.who))].sort();
    for (let i = 0; i < frames.length; i += 12) {
      const part = frames.slice(i, i + 12);
      tasks.push({ kind: 'strip', id: `${tag}.${slug}.${String(i / 12).padStart(2, '0')}`, est: part.length, tag, tree, slug, filmDir: join(tree, 'films', slug), cells, frames: part, whos });
    }
  }
  log(`strips: ${films.length} films, ${trees.length === 2 ? 'before and after' : 'one tree'} → ${out}`);
  mkdirSync(out, { recursive: true });
  const results = await runTasks(tasks, { jobs, work: join(out, '.work'), logs: join(out, 'logs') });
  rmSync(join(out, '.work'), { recursive: true, force: true });
  for (const slug of films) {
    rmSync(join(out, slug), { recursive: true, force: true });
    mkdirSync(join(out, slug), { recursive: true });
    const data = Object.fromEntries(trees.map(({ tag }) => {
      const r = Object.entries(results).filter(([id]) => id.startsWith(`${tag}.${slug}.`)).map(([, v]) => v);
      return [tag, { W: r[0]?.W, H: r[0]?.H, frames: Object.assign({}, ...r.map(v => v.frames)) }];
    }));
    for (const m of moments[slug]) {
      const list = stripFrames(m);
      for (const kind of cropsOf(m)) {
        const entry = { film: slug, moment: m.id, crop: kind, frames: [list[0], list.at(-1)] };
        if (m.offScreen && kind === 'head') { made.push({ ...entry, skipped: `${m.who}'s head is off screen at f${m.frames[1]}` }); continue; }
        const rows = trees.map(({ tag, tree }) => ({ tag, tree, frames: list.map(f => data[tag].frames[f]) }));
        const { W, H } = data[trees.at(-1).tag], view = cropView(kind, m, rows, W, H);
        if (view.skip) { made.push({ ...entry, skipped: view.skip }); continue; }
        const path = join(out, slug, `${m.id}.${kind}.jpg`);
        await stripImage(canvas, { slug, m, rows, view, W, H, path });
        made.push({ ...entry, view: view.title, image: path });
      }
    }
  }
  rmSync(cells, { recursive: true, force: true });
  writeJson(join(out, 'strips.json'), { trees: trees.map(t => ({ ...t, ...gitState(t.tree) })), strips: made });
  const n = made.filter(s => s.image).length;
  log(`strips: ${n} strips (${made.length - n} not made, see strips.json) in ${secs(performance.now() - started)} (load average ${load0.map(v => v.toFixed(1)).join(' ')} at the start)`);
  return 0;
}

const onScreen = (b, W, H) => b && b[2] > 0 && b[0] < W && b[3] > 0 && b[1] < H;
/** Integer enlargement up to a 300 px tall cell; 1:1 up to 540 px; shrunk to 540 px above that. */
const cellScale = ch => ch <= 300 ? Math.max(1, Math.floor(300 / ch)) : ch <= 540 ? 1 : 540 / ch;

/** How a strip is cropped: { title, k (cell px per frame px), cw, ch (crop size), rect(row, i) → [sx, sy], marks(row, i), note(row, i) }. */
function cropView(kind, m, rows, W, H) {
  if (kind === 'body') return bodyView(m, rows, W, H);
  // the reference frame: the moment's first frame in the first row that has the actor (else any frame with it)
  const all = rows.flatMap(r => r.frames).filter(f => f && !f.missing);
  const ref = all.find(f => f.frame === m.frames[0] && f.actors[m.who]) ?? all.find(f => f.actors[m.who]);
  if (!ref) return { skip: `${m.who} is not in any frame of the strip` };
  const A = ref.actors[m.who], [bx0, by0, bx1, by1] = A.box;
  let cw, ch, k, centre, title, marks = () => [], note;
  if (kind === 'feet') {
    // a band along the bottom of the body (both ends of a quadruped), at 1:1 or an integer enlargement; world-fixed:
    // the band keeps its place on the ground point the actor had at the reference frame, wherever the camera goes
    cw = Math.min(Math.max(1.2 * (bx1 - bx0) + 40, 160), 1900); ch = Math.min(Math.max(0.38 * (by1 - by0) + 20, 48), 540);
    k = Math.max(1, Math.min(Math.floor(200 / ch), Math.floor(1900 / cw)));
    const wx = A.x, wy = A.y, dx = (bx0 + bx1) / 2 - A.root[0];
    const mark = f => {
      const a = f.actors[m.who];
      if (a) return [a.root[0] + (wx - a.x) * a.za, a.root[1] + (wy - a.y) * a.za];
      if (f.cam) return [(wx - f.cam.cx) * A.za / ref.cam.zoom * f.cam.zoom + W / 2, (wy - f.cam.cy) * A.za / ref.cam.zoom * f.cam.zoom + H / 2];
      return null;
    };
    centre = f => { const p = mark(f); return p && [p[0] + dx, p[1] - 0.3 * ch]; };
    marks = f => { const p = mark(f), a = f.actors[m.who]; return [...(p ? [{ kind: 'cross', x: p[0], y: p[1] }] : []), ...(a ? [{ kind: 'dot', x: a.root[0], y: a.root[1] }] : [])]; };
    note = f => { const a = f.actors[m.who]; return a ? `root ${((a.x - wx) * a.za >= 0 ? '+' : '')}${((a.x - wx) * a.za).toFixed(1)} px from the cross` : ''; };
    title = `feet, framed on ${m.who}'s ground point at f${ref.frame} (cyan cross; magenta dot = root)`;
  } else {
    const hb = A.headBox;
    if (!hb) return { skip: `${m.who} has no head box` };
    if (!all.some(f => onScreen(f.actors[m.who]?.headBox, W, H))) return { skip: `${m.who}'s head is off screen in every frame of the strip` };
    // the union of the head boxes over the strip, each taken relative to its frame's root point (a turn moves the head)
    let u = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of all) {
      const a = f.actors[m.who], b = a?.headBox; if (!b) continue;
      const s = A.za / a.za, r = [(b[0] - a.root[0]) * s, (b[1] - a.root[1]) * s, (b[2] - a.root[0]) * s, (b[3] - a.root[1]) * s];
      u = [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[2], r[2]), Math.max(u[3], r[3])];
    }
    const pad = 0.15 * (hb[3] - hb[1]);
    ch = Math.max(u[3] - u[1] + 2 * pad, (u[2] - u[0] + 2 * pad) * 9 / 16, 60); cw = ch * 16 / 9;
    k = cellScale(ch);
    const off = [(u[0] + u[2]) / 2, (u[1] + u[3]) / 2];
    centre = f => { const a = f.actors[m.who]; return a && [a.root[0] + off[0] * a.za / A.za, a.root[1] + off[1] * a.za / A.za]; };
    note = f => { const a = f.actors[m.who]; return a ? `tilt ${a.tilt}` : ''; };
    title = `head, framed on ${m.who}'s root point (the head's own moves show; the crop holds every frame's head)`;
  }
  // a frame without the actor takes the crop of the nearest frame that has one
  const rect = (r, i) => {
    for (let d = 0; d < r.frames.length; d++) for (const j of [i - d, i + d]) {
      const f = r.frames[j], c = f && !f.missing ? centre(f) : null;
      if (c) return [c[0] - cw / 2, c[1] - ch / 2];
    }
    return [0, 0];
  };
  return { title: `${title}, crop ${Math.round(cw)}x${Math.round(ch)} at ${k >= 1 ? `${k}:1` : `${k.toFixed(2)}:1 (shrunk)`}`, k, cw, ch, rect, marks, note: note ?? (() => '') };
}

/** One crop for all rows: around the actor's whole box when it is small on screen, else the full frame. */
function bodyView(m, rows, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rows) for (const f of r.frames) {
    const b = f?.actors?.[m.who]?.box;
    if (!onScreen(b, W, H)) continue;
    x0 = Math.min(x0, Math.max(0, b[0])); y0 = Math.min(y0, Math.max(0, b[1])); x1 = Math.max(x1, Math.min(W, b[2])); y1 = Math.max(y1, Math.min(H, b[3]));
  }
  const full = why => ({ title: `full frame (${why})`, k: 300 / H, cw: W, ch: H, rect: () => [0, 0], marks: () => [], note: () => '' });
  if (x1 < x0) return full('the actor is not on screen');
  let w = (x1 - x0) * 1.5 + 80, h = (y1 - y0) * 1.5 + 80;
  if (w / h < W / H) w = h * W / H; else h = w * H / W;
  if (w >= 0.8 * W) return full('the actor is large in frame');
  const x = Math.min(Math.max((x0 + x1) / 2 - w / 2, 0), W - w), y = Math.min(Math.max((y0 + y1) / 2 - h / 2, 0), H - h);
  return { title: `crop ${x.toFixed(0)},${y.toFixed(0)} ${w.toFixed(0)}x${h.toFixed(0)} around ${m.who}`, k: 300 / h, cw: w, ch: h, rect: () => [x, y], marks: () => [], note: () => '' };
}

async function stripImage(canvas, { slug, m, rows, view, W, H, path }) {
  // frames left to right, one row per tree; cells wider than 700 px go top to bottom instead, one column per tree
  const n = rows[0].frames.length, cw = Math.round(view.cw * view.k), ch = Math.round(view.ch * view.k), down = cw > 700;
  const gap = 6, mg = 12, head = 62, lab = 62, treeHead = rows.length > 1 ? 28 : 0;
  const [nx, ny] = down ? [rows.length, n] : [n, rows.length];
  const width = mg * 2 + nx * cw + (nx - 1) * (down ? 16 : gap), height = mg * 2 + head + treeHead * (down ? 1 : ny) + ny * (ch + lab) + (ny - 1) * (down ? gap : 12);
  const c = canvas.createCanvas(Math.max(width, 900), height), x = c.getContext('2d');
  x.fillStyle = '#16141a'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.font = 'bold 20px Menlo, monospace'; x.textBaseline = 'top';
  x.fillText(`${slug} · ${m.id} · f${rows[0].frames[0].frame}-f${rows[0].frames.at(-1).frame}${m.step > 1 ? ` every ${m.step}` : ''}`, mg, mg);
  x.font = '14px Menlo, monospace'; x.fillStyle = '#ddd';
  x.fillText(view.title, mg, mg + 24);
  x.fillStyle = '#bbb'; x.fillText(m.why, mg, mg + 42);
  const top = mg + head;
  for (const [ri, r] of rows.entries()) {
    if (treeHead) {
      const [hx, hy] = down ? [mg + ri * (cw + 16), top] : [mg, top + ri * (treeHead + ch + lab + 12)];
      x.fillStyle = r.tag === 'before' ? '#9cf' : '#fc9'; x.font = 'bold 16px Menlo, monospace'; x.fillText(`${r.tag}: ${r.tree}`, hx, hy + 4);
    }
    for (const [i, f] of r.frames.entries()) {
      const X = down ? mg + ri * (cw + 16) : mg + i * (cw + gap);
      const Y = down ? top + treeHead + i * (ch + lab + gap) : top + ri * (treeHead + ch + lab + 12) + treeHead;
      x.fillStyle = '#333'; x.fillRect(X, Y, cw, ch);
      if (f && !f.missing) {
        // the part of the crop that is inside the frame (the rest stays grey), enlarged without smoothing
        const [sx, sy] = view.rect(r, i), ix0 = Math.max(0, sx), iy0 = Math.max(0, sy), ix1 = Math.min(W, sx + view.cw), iy1 = Math.min(H, sy + view.ch);
        if (ix1 > ix0 && iy1 > iy0) {
          x.imageSmoothingEnabled = !Number.isInteger(view.k);
          x.drawImage(await canvas.loadImage(readFileSync(f.file)), ix0, iy0, ix1 - ix0, iy1 - iy0, X + (ix0 - sx) * view.k, Y + (iy0 - sy) * view.k, (ix1 - ix0) * view.k, (iy1 - iy0) * view.k);
          x.imageSmoothingEnabled = true;
        }
        x.save(); x.beginPath(); x.rect(X, Y, cw, ch); x.clip();
        for (const mk of view.marks(f)) {
          const px = X + (mk.x - sx) * view.k, py = Y + (mk.y - sy) * view.k;
          if (mk.kind === 'cross') { x.strokeStyle = '#00e5ff'; x.lineWidth = 2; x.beginPath(); x.moveTo(px - 14, py); x.lineTo(px + 14, py); x.moveTo(px, py - 14); x.lineTo(px, py + 6); x.stroke(); }
          else { x.fillStyle = '#ff2bd6'; x.beginPath(); x.arc(px, py, 3.5, 0, Math.PI * 2); x.fill(); }
        }
        x.restore();
      }
      if (f && f.frame >= m.frames[0] && f.frame <= m.frames[1]) { x.strokeStyle = '#ffd400'; x.lineWidth = 4; x.strokeRect(X + 2, Y + 2, cw - 4, ch - 4); }
      x.fillStyle = '#fff'; x.font = 'bold 14px Menlo, monospace';
      x.fillText(f?.missing ? `f${f.frame} (past the end)` : `f${f.frame}  ${f.shot ?? '-'}`, X + 2, Y + ch + 4);
      x.fillStyle = '#bbb'; x.font = '13px Menlo, monospace';
      const a = f?.actors?.[m.who];
      x.fillText(a ? `${m.who} ${a.face > 0 ? '→' : '←'} ${a.action}${a.squash !== 1 ? ` sq${a.squash}` : ''}` : `${m.who} not in frame`, X + 2, Y + ch + 22);
      if (f && !f.missing) x.fillText(view.note(f), X + 2, Y + ch + 40);
    }
  }
  writeFileSync(path, await c.encode('jpeg', 90));
}

// ───────────── main ─────────────

async function main(argv) {
  if (argv[0] === '__worker') { await worker(argv[1], argv[2]); return 0; }
  const o = parseArgs(argv), cmd = o._[0];
  if (cmd === 'record' || cmd === 'compare') return recordOrCompare(cmd, o);
  if (cmd === 'strips') return strips(o);
  if (cmd === 'moments') {
    for (const [slug, list] of Object.entries(MOMENTS)) for (const m of list) {
      const s = stripFrames(m);
      process.stdout.write(`${slug.padEnd(20)} ${m.id.padEnd(30)} f${m.frames[0]}-${m.frames[1]}  strip f${s[0]}-${s.at(-1)}${m.step > 1 ? `/${m.step}` : ''}  ${m.who.padEnd(10)} ${cropsOf(m).join('+').padEnd(10)} ${m.why}\n`);
    }
    for (const s of RIG_SHEETS) process.stdout.write(`${RIGS.padEnd(20)} ${s.id.padEnd(30)} ${s.rig} gait "${s.gait}" in ${s.n} steps  ${s.why}\n`);
    return 0;
  }
  throw new UsageError('usage: golden-2d.mjs record|compare|strips|moments --engine <tree> --out <dir> … (see the comment at the top of the file)');
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => {
    process.stderr.write(`golden-2d: ${e instanceof UsageError ? '' : 'error: '}${e.stack && !(e instanceof UsageError) ? e.stack : e.message}\n`);
    process.exitCode = 2;
  });
}
