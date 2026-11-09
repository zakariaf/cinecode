import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImage } from '@napi-rs/canvas';
import { srtTime, wrapText, toSrt, subtitleCues } from '../engine/render/srt.mjs';
import { splitRanges, frameCount, renderVideo, verifyVideo } from '../engine/render/video.mjs';
import { ffmpeg, hasFfmpeg, probe, run, FFPROBE } from '../engine/render/ffmpeg.mjs';
import { frameGrabber, pixelOrder } from '../engine/render/encode.mjs';
import { createSource, decodeFrameNumber } from '../engine/render/testcard.mjs';
import { contactSheet, sheetLayout, sheetItems } from '../engine/render/sheet.mjs';
import { parseArgs, UsageError, COMMANDS, main, helpText } from '../engine/render/cli.mjs';
import { fmtDur, parseTime, clock } from '../engine/render/progress.mjs';
import { writeWav } from '../engine/audio/wav.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'out', 'test-render');
const CARD = join(ROOT, 'engine', 'render', 'testcard.mjs');
const BIN = join(ROOT, 'bin', 'cinecode.mjs');
const FF = hasFfmpeg();
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

/** Decode every frame of a video back to the frame numbers drawn by the test card. */
async function decodeFrames(path, W = 64, H = 36) {
  const { stdout } = await ffmpeg(['-i', path, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const size = W * H * 3, nums = [];
  for (let o = 0; o + size <= stdout.length; o += size) nums.push(decodeFrameNumber(stdout.subarray(o, o + size), W, H));
  return nums;
}
const seq = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

// ───────────── subtitles ─────────────

test('srtTime formats hours, minutes, seconds and milliseconds', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(1.5), '00:00:01,500');
  assert.equal(srtTime(3661.0425), '01:01:01,043');
  assert.equal(srtTime(59.9996), '00:01:00,000');
  assert.equal(srtTime(-2), '00:00:00,000');
});

test('wrapText keeps short lines, balances long ones into two', () => {
  assert.deepEqual(wrapText('Hello?'), ['Hello?']);
  const lines = wrapText('At the edge of an old forest, where the moss grew thick and the brook ran slow');
  assert.equal(lines.length, 2);
  for (const l of lines) assert.ok(l.length <= 42, l);
  assert.ok(Math.abs(lines[0].length - lines[1].length) < 12, lines.join(' | '));
  assert.deepEqual(wrapText('  spaced \n  out  '), ['spaced out']);
});

test('toSrt numbers cues, separates them with blank lines and wraps', () => {
  const srt = toSrt([{ t0: 0.5, t1: 2.25, text: 'Hello?' }, { t0: 3, t1: 6.004, text: 'At the edge of an old forest, where the moss grew thick and the brook ran slow' }]);
  const blocks = srt.trimEnd().split('\n\n');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], '1\n00:00:00,500 --> 00:00:02,250\nHello?');
  const b = blocks[1].split('\n');
  assert.equal(b[0], '2'); assert.equal(b[1], '00:00:03,000 --> 00:00:06,004'); assert.equal(b.length, 4);
  assert.ok(srt.endsWith('\n'));
});

test('subtitleCues prefers captions, falls back to lines, sorts, shifts and clips', () => {
  const plan = { captions: [{ t0: 5, t1: 6, text: 'B' }, { t0: 1, t1: 2, text: 'A' }, { t0: 3, t1: 4, text: '  ' }], lines: [{ t0: 0, t1: 1, text: 'L' }] };
  assert.deepEqual(subtitleCues(plan).map(c => c.text), ['A', 'B']);
  assert.deepEqual(subtitleCues({ captions: [], lines: plan.lines }).map(c => c.text), ['L']);
  const shifted = subtitleCues(plan, { offset: 1.5, duration: 4 });
  assert.deepEqual(shifted, [{ t0: 0, t1: 0.5, text: 'A' }, { t0: 3.5, t1: 4, text: 'B' }]);
});

// ───────────── frame ranges ─────────────

test('splitRanges covers the range contiguously with balanced parts', () => {
  assert.deepEqual(splitRanges([0, 48], 2), [[0, 24], [24, 48]]);
  const r = splitRanges([10, 1000], 7);
  assert.equal(r.length, 7); assert.equal(r[0][0], 10); assert.equal(r.at(-1)[1], 1000);
  for (let i = 1; i < r.length; i++) assert.equal(r[i][0], r[i - 1][1]);
  const sizes = r.map(([a, b]) => b - a); assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  assert.equal(splitRanges([0, 30], 8, 12).length, 2, 'minFrames caps the number of segments');
  assert.deepEqual(splitRanges([0, 3], 10), [[0, 1], [1, 2], [2, 3]]);
  assert.deepEqual(splitRanges([5, 5], 4), []);
  assert.equal(frameCount({ duration: 2.01, fps: 24 }), 48);
});

test('frame grabber: opaque pixels at the plan size, resampled to a smaller output', () => {
  assert.ok(['rgba', 'bgra'].includes(pixelOrder()));
  const { plan, drawFrame } = createSource({ width: 64, height: 36 });
  const full = frameGrabber(plan, drawFrame).pixels(0);
  assert.equal(full.length, 64 * 36 * 4);
  for (let i = 3; i < full.length; i += 4) assert.equal(full[i], 255);
  const half = frameGrabber(plan, drawFrame, 32, 18);
  assert.equal(half.pixels(0.5).length, 32 * 18 * 4);
  assert.equal(half.canvas.width, 32);
});

// ───────────── video ─────────────

test('renderVideo in-process: exact frame count, duration and frame order', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 2 });
  const r = await renderVideo({ ...src, outPath: join(OUT, 'one.mp4'), jobs: 1 });
  assert.equal(r.segments, 1); assert.equal(r.frames, 48);
  assert.equal(r.probe.video.frames, 48);
  assert.ok(Math.abs(r.probe.duration - 2) <= 1 / 24);
  assert.equal(r.probe.video.width, 64); assert.equal(r.probe.video.height, 36);
  assert.deepEqual(await decodeFrames(r.path), seq(0, 48));
  assert.ok(!existsSync(join(OUT, '.one.mp4.parts')), 'segment folder removed');
});

test('renderVideo with 2 workers: segments concat without duplicated or missing frames; audio + subtitles muxed', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 2 });
  const tone = Float32Array.from({ length: Math.round(48000 * 2.4) }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / 48000));
  writeWav(join(OUT, 'tone.wav'), [tone, tone], 48000);
  const events = [];
  const r = await renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 2 }, outPath: join(OUT, 'two.mp4'), jobs: 2,
    audio: join(OUT, 'tone.wav'), captions: src.plan.captions, onProgress: p => events.push(p) });
  assert.equal(r.segments, 2);
  assert.equal(r.probe.video.frames, 48);
  assert.ok(Math.abs(r.probe.duration - 2) <= 1 / 24, `duration ${r.probe.duration}`);
  assert.equal(r.probe.audio.codec, 'aac'); assert.equal(r.probe.audio.sampleRate, 48000); assert.equal(r.probe.audio.channels, 2);
  assert.ok(Math.abs(r.probe.audio.duration - 2) < 0.06, `audio ${r.probe.audio.duration}`);
  assert.equal(r.probe.subtitles, 1);
  assert.deepEqual(await decodeFrames(r.path), seq(0, 48));
  const frames = events.filter(e => e.phase === 'frames');
  assert.ok(frames.length > 0 && frames.at(-1).done === 48, 'progress reaches the total');
  assert.ok(frames.every(e => e.done <= e.drawn && e.drawn <= 48));
  assert.deepEqual([...new Set(events.map(e => e.phase))], ['frames', 'join', 'mux', 'verify']);
  // soft subtitles survive the mux with the right text
  const { stdout } = await ffmpeg(['-i', r.path, '-map', '0:s:0', '-f', 'srt', 'pipe:1']);
  assert.match(stdout.toString(), /Caption 1: a moving square\./);
});

test('renderVideo: three workers, a sub-range, and half-size output', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 3, width: 128, height: 72 });
  const r = await renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 3, width: 128, height: 72 }, outPath: join(OUT, 'three.mp4'),
    jobs: 3, range: [6, 66], width: 64, height: 36 });
  assert.equal(r.segments, 2, '60 frames at ≥ 24 per segment → 2 segments');
  assert.equal(r.probe.video.frames, 60); assert.equal(r.probe.video.width, 64);
  assert.deepEqual(await decodeFrames(r.path), seq(6, 66));
  const r3 = await renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 3, width: 128, height: 72 }, outPath: join(OUT, 'three-b.mp4'), jobs: 3 });
  assert.equal(r3.segments, 3);
  assert.deepEqual(await decodeFrames(r3.path, 128, 72), seq(0, 72));
});

test('renderVideo: colours survive the RGB → BT.709 → RGB round trip and are tagged', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const colours = ['#c06030', '#3a6fb0', '#e8d9b2', '#2a2130'];
  const plan = { W: 64, H: 32, fps: 24, duration: 4 / 24, title: 'swatches' };
  const drawFrame = (ctx, p, t) => { ctx.fillStyle = colours[Math.round(t * 24)]; ctx.fillRect(0, 0, 64, 32); };
  const r = await renderVideo({ plan, drawFrame, outPath: join(OUT, 'swatch.mp4') });
  const { stdout } = await ffmpeg(['-i', r.path, '-vf', 'scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  colours.forEach((hex, f) => {
    const want = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), px = (f * 64 * 32 + 16 * 64 + 32) * 3;
    want.forEach((v, c) => assert.ok(Math.abs(stdout[px + c] - v) <= 4, `${hex} channel ${c}: ${stdout[px + c]} vs ${v}`));
  });
  const { stdout: tags } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=color_space,color_primaries,color_transfer,color_range', '-of', 'csv=p=0', r.path]);
  assert.equal(tags.toString().trim(), 'tv,bt709,bt709,bt709');
});

test('renderVideo: a failing worker rejects with its error, cleans up, and keeps the previous output', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 2 });
  writeFileSync(join(OUT, 'fail.mp4'), 'previous render');
  await assert.rejects(
    renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 2, failAt: 30 }, outPath: join(OUT, 'fail.mp4'), jobs: 2 }),
    /worker 1 \(frames 24–47\): test card: failing at frame 30/);
  assert.ok(!existsSync(join(OUT, '.fail.mp4.parts')));
  assert.equal(readFileSync(join(OUT, 'fail.mp4'), 'utf8'), 'previous render');
});

test('renderVideo: an AbortSignal stops the workers and removes partial output', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 4 }), ac = new AbortController();
  const t0 = performance.now();
  await assert.rejects(
    renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 4 }, outPath: join(OUT, 'abort.mp4'), jobs: 2, signal: ac.signal,
      onProgress: p => { if (p.drawn > 4) ac.abort(new Error('stop please')); } }),
    /stop please/);
  assert.ok(performance.now() - t0 < 10000);
  assert.ok(!existsSync(join(OUT, '.abort.mp4.parts')) && !existsSync(join(OUT, 'abort.mp4')));
  await assert.rejects(renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 3 }, outPath: join(OUT, 'mismatch.mp4'), jobs: 2 }),
    /built a different plan \(3 s, expected 4 s\)/);
  const one = new AbortController(); one.abort(new Error('already'));
  await assert.rejects(renderVideo({ ...src, outPath: join(OUT, 'abort1.mp4'), jobs: 1, signal: one.signal }), /already/);
});

test('verifyVideo rejects a frame-count mismatch', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const p = join(OUT, 'one.mp4');
  if (!existsSync(p)) return;
  await assert.rejects(verifyVideo(p, { frames: 47, fps: 24 }), /frame count 48, expected 47/);
  await assert.rejects(verifyVideo(p, { frames: 48, fps: 24, audio: true }), /no audio stream/);
  const info = await probe(p); assert.equal(info.audio, null);
});

// ───────────── contact sheet ─────────────

test('time helpers', () => {
  assert.equal(parseTime('12'), 12); assert.equal(parseTime('1:05.5'), 65.5); assert.equal(parseTime('01:02:03'), 3723);
  assert.throws(() => parseTime('abc'));
  assert.equal(clock(65.54), '1:05.5'); assert.equal(clock(3723), '1:02:03.0'); assert.equal(clock(59.97), '1:00.0');
  assert.equal(fmtDur(3.21), '3.2 s'); assert.equal(fmtDur(312), '5m 12s'); assert.equal(fmtDur(3725), '1h 02m');
});

test('sheetItems: the middle frame of each shot, or the given times', () => {
  const { plan } = createSource({ duration: 2, shots: 4 });
  const items = sheetItems(plan);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map(i => i.shot.id), ['tc-01', 'tc-02', 'tc-03', 'tc-04']);
  assert.ok(items.every(i => i.t >= i.shot.t0 && i.t < i.shot.t1 && Math.abs(i.t * 24 - Math.round(i.t * 24)) < 1e-9), 'on frame boundaries');
  assert.match(items[0].caption, /Caption 1/);
  const at = sheetItems(plan, [0.1, 1.9, 99]);
  assert.deepEqual(at.map(i => i.shot.id), ['tc-01', 'tc-04', 'tc-04']);
  assert.ok(at[2].t < plan.duration);
});

test('contactSheet writes a JPEG with the layout\'s dimensions', async () => {
  const { plan, drawFrame } = createSource({ width: 320, height: 180, duration: 2, shots: 5 });
  const outPath = join(OUT, 'sheet.jpg');
  const r = await contactSheet({ plan, drawFrame, outPath, cols: 3, tileW: 200 });
  const L = sheetLayout({ n: 5, cols: 3, tileW: 200, W: 320, H: 180 });
  assert.equal(L.rows, 2); assert.equal(L.tileH, 113);
  const img = await loadImage(readFileSync(outPath));
  assert.equal(img.width, L.width); assert.equal(img.height, L.height);
  assert.equal(r.width, L.width); assert.equal(r.items.length, 5);
  assert.equal(readFileSync(outPath).subarray(0, 2).toString('hex'), 'ffd8');
  const r2 = await contactSheet({ plan, drawFrame, outPath: join(OUT, 'sheet-t.jpg'), times: [0.5, 1.5], cols: 4, tileW: 240 });
  assert.equal(r2.items.length, 2);
  assert.equal(r2.width, sheetLayout({ n: 2, cols: 4, tileW: 240, W: 320, H: 180 }).width, 'columns shrink to the number of stills');
});

// ───────────── CLI ─────────────

test('parseArgs: forms, aliases, types and errors', () => {
  const spec = COMMANDS.render.options;
  assert.deepEqual(parseArgs(['films/x', '--jobs=3', '--keep', '--from', '1:30', '--to=95.5'], spec), { _: ['films/x'], jobs: 3, keep: true, from: 90, to: 95.5 });
  assert.deepEqual(parseArgs(['-j', '4', 'films/x'], spec), { _: ['films/x'], jobs: 4 });
  assert.deepEqual(parseArgs(['-j6', '--no-keep', '-o=a.mp4'], spec), { _: [], jobs: 6, keep: false, out: 'a.mp4' });
  assert.deepEqual(parseArgs(['films/x', '--', '--not-an-option'], spec), { _: ['films/x', '--not-an-option'] });
  assert.equal(parseArgs(['-h'], spec).help, true);
  assert.deepEqual(parseArgs(['f', '--t=1.5,0:03,10'], COMMANDS.sheet.options).t, [1.5, 3, 10]);
  assert.throws(() => parseArgs(['--jobs=0'], spec), UsageError);
  assert.throws(() => parseArgs(['--jobs=two'], spec), /positive integer/);
  assert.throws(() => parseArgs(['--bogus'], spec), /unknown option --bogus/);
  assert.throws(() => parseArgs(['-z'], spec), /unknown option -z/);
  assert.throws(() => parseArgs(['--jobs'], spec), /needs a value/);
  assert.throws(() => parseArgs(['--keep=maybe'], spec), /is a flag/);
});

const cli = (args, cwd = ROOT, env = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

test('cli: --help lists every command; each command has --help; bad input exits 2', () => {
  const h = cli(['--help']);
  assert.equal(h.status, 0);
  for (const c of ['new', 'check', 'plan', 'voice', 'sheet', 'lint', 'music', 'mix', 'animatic', 'render', 'cast-sheet', 'set-sheet']) {
    assert.match(h.stdout, new RegExp(`^  ${c} `, 'm'), c);
    assert.match(helpText(c), new RegExp(`^usage: cinecode ${c} `), c);
  }
  const rh = cli(['render', '-h']); assert.equal(rh.status, 0); assert.match(rh.stdout, /usage: cinecode render <film>/); assert.match(rh.stdout, /--jobs=N/);
  assert.equal(cli(['help', 'sheet']).status, 0);
  assert.equal(cli([]).status, 2);
  const bad = cli(['rendr']); assert.equal(bad.status, 2); assert.match(bad.stderr, /did you mean "render"/);
  const opt = cli(['render', 'films/x', '--jobs=nope']); assert.equal(opt.status, 2); assert.match(opt.stderr, /positive integer/);
  assert.equal(cli(['sheet']).status, 2, 'missing <film> is a usage error');
});

test('cli: new scaffolds a valid film.json and refuses to overwrite', () => {
  const cwd = join(OUT, 'cli'); mkdirSync(cwd, { recursive: true });
  const r = cli(['new', 'lantern-moth'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /new done in/);
  const film = JSON.parse(readFileSync(join(cwd, 'films', 'lantern-moth', 'film.json'), 'utf8'));
  assert.equal(film.title, 'Lantern Moth');
  assert.ok(film.format && film.scenes.length && film.scenes[0].shots.length && film.cast && film.sets && film.voices);
  for (const s of film.scenes) for (const sh of s.shots) assert.ok(Array.isArray(sh.beats) && sh.beats.length);
  const again = cli(['new', 'lantern-moth'], cwd);
  assert.equal(again.status, 1); assert.match(again.stderr, /already exists/);
  assert.equal(cli(['new', 'lantern-moth', '--force', '--title=The Lantern Moth'], cwd).status, 0);
  assert.equal(JSON.parse(readFileSync(join(cwd, 'films', 'lantern-moth', 'film.json'), 'utf8')).title, 'The Lantern Moth');
});

test('cli: new copies every template, fills in the title, and the starter film passes check', () => {
  const cwd = join(OUT, 'cli-tpl'); rmSync(cwd, { recursive: true, force: true }); mkdirSync(cwd, { recursive: true });
  const r = cli(['new', 'films/the-moth', '--title=The "Moth" & $& Co'], cwd);
  assert.equal(r.status, 0, r.stderr);
  const dir = join(cwd, 'films', 'the-moth');
  for (const f of ['film.json', 'screenplay.md', 'custom.mjs']) {
    assert.ok(existsSync(join(dir, f)), f);
    assert.ok(!readFileSync(join(dir, f), 'utf8').includes('{{title}}'), `${f}: placeholder left`);
  }
  assert.match(r.stdout, /custom\.mjs, film\.json, screenplay\.md/);
  const film = JSON.parse(readFileSync(join(dir, 'film.json'), 'utf8'));
  assert.equal(film.title, 'The "Moth" & $& Co');
  assert.equal(film.titles.open.title, 'The "Moth" & $& Co');
  assert.match(readFileSync(join(dir, 'screenplay.md'), 'utf8'), /^# The "Moth" & \$& Co\n/);
  // the template's own layout is kept (one beat per line), not re-serialized
  assert.equal(readFileSync(join(dir, 'film.json'), 'utf8').split('\n').length, readFileSync(join(ROOT, 'templates', 'film.json'), 'utf8').split('\n').length);
  const c = cli(['check', 'films/the-moth'], cwd);
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /valid/); assert.match(c.stdout, /custom\.mjs/);
});

test('cli: a missing film fails with exit 1; voice without a key fails clearly', async () => {
  const r = cli(['plan', 'films/does-not-exist']);
  assert.equal(r.status, 1); assert.match(r.stderr, /no film\.json/);
  const cwd = join(OUT, 'cli');
  if (!existsSync(join(cwd, 'films', 'lantern-moth'))) cli(['new', 'lantern-moth'], cwd);
  const v = cli(['voice', 'films/lantern-moth'], cwd, { GEMINI_API_KEY: '' });
  assert.equal(v.status, 1); assert.match(v.stderr, /GEMINI_API_KEY/);
  // main() returns exit codes without spawning
  const sink = { write() {}, isTTY: false };
  assert.equal(await main(['--help'], { out: sink, err: sink, signals: false }), 0);
  assert.equal(await main(['nope'], { out: sink, err: sink, signals: false }), 2);
});

// ───────────── end to end: the CLI against stand-in engine modules ─────────────
// The film, voice, music, mix and lint modules belong to other parts of the engine. To test the commands' wiring
// on their own, copy the CLI and render modules into a scratch tree and put small stand-ins beside them.

const STANDINS = {
  'engine/film/load.mjs': `
import { readFileSync } from 'node:fs'; import { join } from 'node:path';
export class ValidationError extends Error { constructor(problems) { super('invalid film'); this.name = 'ValidationError'; this.problems = problems; } }
export async function loadFilm(dir) {
  const film = JSON.parse(readFileSync(join(dir, 'film.json'), 'utf8'));
  if (!film.scenes?.length) throw new ValidationError(['scenes: at least one scene is required']);
  return { ...film, dir };
}`,
  'engine/film/compile.mjs': `
export function compile(film, { voices } = {}) {
  const { width: W, height: H, fps } = film.format; let t = 0; const shots = [], lines = [];
  for (const sc of film.scenes) for (const sh of sc.shots) {
    const t0 = t;
    for (const b of sh.beats) if (b.say) {
      const id = (b.say + ':' + b.text).replace(/[^a-z]/gi, '').slice(0, 16).toLowerCase(), v = voices?.get(id);
      const dur = v ? v.dur : b.text.split(' ').length / 2.6 + 0.3;
      lines.push({ id, who: b.say, voice: b.say, text: b.text, tone: b.tone, t0: t, t1: t + dur, shot: sh.id, narrator: b.say === 'narrator' }); t += dur;
    }
    t = Math.round((t + (sh.hold ?? 0.5)) * fps) / fps;
    shots.push({ id: sh.id, scene: sc.id, t0, t1: t, size: sh.camera?.size, set: { id: sc.set } });
  }
  return { W, H, fps, duration: t, title: film.title, scenes: film.scenes.map(s => ({ id: s.id, set: s.set })), shots, lines,
    captions: lines.map(l => ({ t0: l.t0, t1: l.t1, text: l.text, style: l.narrator ? 'narration' : 'dialogue' })), sfx: [], ambience: [], music: [], actorsAt: () => [] };
}`,
  'engine/film/frame.mjs': `export { drawFrame } from '../render/testcard.mjs';`,
  'engine/audio/voice.mjs': `
import { existsSync } from 'node:fs'; import { join } from 'node:path'; import { readWav, writeWav } from './wav.mjs';
export const resolveLine = (film, line) => line;
export async function voiceLine(L, { cacheDir, apiKey }) {
  const p = join(cacheDir, L.id + '.wav');
  if (!existsSync(p)) {
    if (!apiKey) throw new Error('line ' + L.id + ' is not in the cache');
    const n = 48000 * (0.5 + L.text.length / 40), x = Float32Array.from({ length: Math.round(n) }, (_, i) => 0.3 * Math.sin(i * 0.06));
    writeWav(p, [x], 48000);
  }
  const wav = readWav(p).channels[0];
  return { wav, dur: wav.length / 48000, env: [], qa: { wer: 0 } };
}
export async function voiceLines(film, plan, opts) {
  const { mkdirSync } = await import('node:fs'); mkdirSync(opts.cacheDir, { recursive: true });
  const m = new Map(); for (const l of plan.lines) { m.set(l.id, await voiceLine(l, opts)); opts.onProgress?.({ id: l.id, done: m.size, total: plan.lines.length }); } return m;
}`,
  'engine/audio/music.mjs': `
export function scoreFilm(plan) { const n = Math.round(plan.duration * 48000), L = Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin(i * 0.02)); return { L, R: L }; }`,
  'engine/audio/mix.mjs': `
import { writeWav } from './wav.mjs';
export function mixFilm(plan, { voices, music }) {
  const L = Float32Array.from(music.L);
  for (const l of plan.lines) { const v = voices.get(l.id); if (v) { const o = Math.round(l.t0 * 48000); for (let i = 0; i < v.wav.length && o + i < L.length; i++) L[o + i] += v.wav[i]; } }
  return { L, R: L };
}
export async function writeMaster(path, mix) { writeWav(path, [mix.L, mix.R], 48000); return { lufs: -16 }; }`,
  'engine/lint/lint.mjs': `
import { writeFileSync } from 'node:fs'; import { join } from 'node:path';
export function lintPlan(plan) { return { errors: [{ rule: 'floating', severity: 'error', t: 0.5, shot: plan.shots[0].id, actor: 'hare', message: 'feet 12 px above the ground' }], warnings: [] }; }
export function writeLintReport(plan, r, outDir) { writeFileSync(join(outDir, 'lint.json'), JSON.stringify(r)); }`,
};

function fakeRoot() {
  const root = join(OUT, 'root');
  rmSync(root, { recursive: true, force: true });
  for (const d of ['bin', 'engine/render', 'engine/audio', 'engine/film', 'engine/lint']) mkdirSync(join(root, d), { recursive: true });
  for (const f of ['bin/cinecode.mjs', 'package.json', 'engine/audio/wav.mjs']) cpSync(join(ROOT, f), join(root, f));
  cpSync(join(ROOT, 'engine/render'), join(root, 'engine/render'), { recursive: true });
  for (const [f, src] of Object.entries(STANDINS)) writeFileSync(join(root, f), src.trimStart());
  const film = { title: 'Demo', format: { width: 64, height: 36, fps: 24, captions: 'dialogue' },
    scenes: [{ id: 's01', set: 'meadow', shots: [
      { id: 's01-01', camera: { size: 'wide' }, beats: [{ say: 'narrator', text: 'Once upon a time.' }] },
      { id: 's01-02', camera: { size: 'close' }, beats: [{ say: 'hare', text: 'Hello there!' }, { say: 'hare', text: 'Is anybody home?' }] }] }] };
  mkdirSync(join(root, 'films', 'demo'), { recursive: true });
  writeFileSync(join(root, 'films', 'demo', 'film.json'), JSON.stringify(film));
  return root;
}

test('cli end to end: voice → plan → render (2 jobs) → sheet → lint → animatic', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const root = fakeRoot(), bin = join(root, 'bin', 'cinecode.mjs');
  const cmd = (args, env = {}) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CINECODE_DEBUG: '1', ...env } });
  const out = join(root, 'films', 'demo', 'out');

  const noKey = cmd(['render', 'films/demo'], { GEMINI_API_KEY: '' });
  assert.equal(noKey.status, 1, noKey.stderr);
  assert.match(noKey.stderr, /3 lines have no cached voice/); assert.match(noKey.stderr, /cinecode voice films\/demo/);

  const v = cmd(['voice', 'films/demo'], { GEMINI_API_KEY: 'test-key' });
  assert.equal(v.status, 0, v.stderr); assert.match(v.stdout, /3 lines ready/);

  const p = cmd(['plan', 'demo']);
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /s01-02\s+meadow\s+close/); assert.match(p.stdout, /hare: "Hello there!" \(\+1\)/); assert.match(p.stdout, /3 lines \(0 estimated/);

  const r = cmd(['render', 'films/demo', '--jobs=2'], { GEMINI_API_KEY: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /voices\s+3 cached/); assert.match(r.stdout, /render done in/);
  const info = await probe(join(out, 'demo.mp4'));
  const { compile } = await import(join(root, 'engine/film/compile.mjs'));
  const { loadFilm } = await import(join(root, 'engine/film/load.mjs'));
  const { voiceLines } = await import(join(root, 'engine/audio/voice.mjs'));
  const film = await loadFilm(join(root, 'films', 'demo')), draft = compile(film);
  const plan = compile(film, { voices: await voiceLines(film, draft, { cacheDir: join(root, 'films/demo/voices') }) });
  assert.equal(info.video.frames, Math.round(plan.duration * 24));
  assert.ok(info.audio && info.subtitles === 1);
  assert.deepEqual(await decodeFrames(join(out, 'demo.mp4')), seq(0, info.video.frames));
  const srt = readFileSync(join(out, 'demo.srt'), 'utf8');
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nOnce upon a time\.\n\n2\n/);
  assert.ok(existsSync(join(out, 'mix.wav')) && existsSync(join(out, 'music.wav')));

  const s = cmd(['sheet', 'films/demo', '--cols=2', '--tile=160']);
  assert.equal(s.status, 0, s.stderr); assert.match(s.stdout, /sheet\.jpg \(2 stills/);
  const img = await loadImage(readFileSync(join(out, 'sheet.jpg')));
  assert.equal(img.width, sheetLayout({ n: 2, cols: 2, tileW: 160, W: 64, H: 36 }).width);

  const l = cmd(['lint', 'films/demo']);
  assert.equal(l.status, 1); assert.match(l.stdout, /error\s+floating\s+s01-01/); assert.match(l.stderr, /lint found 1 error/);

  const a = cmd(['animatic', 'films/demo', '-j', '2']);
  assert.equal(a.status, 0, a.stderr);
  const ai = await probe(join(out, 'animatic.mp4'));
  assert.equal(ai.video.width, 32); assert.equal(ai.video.fps, 12); assert.ok(ai.audio);
  assert.equal(ai.video.frames, Math.round(plan.duration * 12));

  const part = cmd(['render', 'films/demo', '--from=1', '--to=2', '-j', '1']);
  assert.equal(part.status, 0, part.stderr);
  assert.deepEqual(await decodeFrames(join(out, 'demo-1s.mp4')), seq(24, 48));

  writeFileSync(join(root, 'films', 'demo', 'film.json'), JSON.stringify({ title: 'Broken', format: { width: 64, height: 36, fps: 24 }, scenes: [] }));
  const bad = cmd(['check', 'films/demo']);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /1 problem:\n  - scenes: at least one scene is required/);
});
