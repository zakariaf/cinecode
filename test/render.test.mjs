import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, cpSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { srtTime, wrapText, toSrt, subtitleCues } from '../engine/render/srt.mjs';
import { gridRanges, segmentFrames, frameCount, renderVideo, verifyVideo, lockOutput } from '../engine/render/video.mjs';
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
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');

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

test('gridRanges cuts a range on the grid counted from frame 0, whatever the range', () => {
  assert.deepEqual(gridRanges([0, 100], 48), [[0, 48], [48, 96], [96, 100]]);
  assert.deepEqual(gridRanges([50, 150], 48), [[50, 96], [96, 144], [144, 150]]);
  assert.deepEqual(gridRanges([48, 96], 48), [[48, 96]]);
  assert.deepEqual(gridRanges([5, 5], 48), []);
  assert.equal(segmentFrames(24), 96, 'a segment is two keyframe intervals: 4 s'); assert.equal(segmentFrames(12), 48);
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
  const src = createSource({ duration: 5 });
  const tone = Float32Array.from({ length: Math.round(48000 * 2.4) }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / 48000));
  writeWav(join(OUT, 'tone.wav'), [tone, tone], 48000);
  const events = [];
  const r = await renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 5 }, outPath: join(OUT, 'two.mp4'), jobs: 2,
    audio: join(OUT, 'tone.wav'), captions: src.plan.captions, onProgress: p => events.push(p) });
  assert.equal(r.segments, 2); assert.equal(r.jobs, 2);
  assert.equal(r.probe.video.frames, 120);
  assert.ok(Math.abs(r.probe.duration - 5) <= 1 / 24, `duration ${r.probe.duration}`);
  assert.equal(r.probe.audio.codec, 'aac'); assert.equal(r.probe.audio.sampleRate, 48000); assert.equal(r.probe.audio.channels, 2);
  assert.ok(Math.abs(r.probe.audio.duration - 5) < 0.06, `audio ${r.probe.audio.duration}`);
  assert.equal(r.probe.subtitles, 1);
  assert.deepEqual(await decodeFrames(r.path), seq(0, 120));
  const frames = events.filter(e => e.phase === 'frames');
  assert.ok(frames.length > 0 && frames.at(-1).done === 120, 'progress reaches the total');
  assert.ok(frames.every(e => e.done <= e.drawn && e.drawn <= 120));
  assert.deepEqual([...new Set(events.map(e => e.phase))], ['frames', 'join', 'mux', 'verify']);
  // soft subtitles survive the mux with the right text
  const { stdout } = await ffmpeg(['-i', r.path, '-map', '0:s:0', '-f', 'srt', 'pipe:1']);
  assert.match(stdout.toString(), /Caption 1: a moving square\./);
});

test('renderVideo: three workers, a sub-range, and half-size output', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 5, width: 128, height: 72 });
  const r = await renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 5, width: 128, height: 72 }, outPath: join(OUT, 'three.mp4'),
    jobs: 3, range: [6, 106], width: 64, height: 36 });
  assert.equal(r.segments, 2, 'frames 6–105 on the 96-frame grid → [6, 96) and [96, 106)');
  assert.equal(r.probe.video.frames, 100); assert.equal(r.probe.video.width, 64);
  assert.deepEqual(await decodeFrames(r.path), seq(6, 106));
  const r3 = await renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 5, width: 128, height: 72 }, outPath: join(OUT, 'three-b.mp4'), jobs: 3 });
  assert.equal(r3.segments, 2);
  assert.deepEqual(await decodeFrames(r3.path, 128, 72), seq(0, 120));
});

test('renderVideo with resume: a render stopped part way goes on from its whole segments and gives the same bytes', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 10 }), args = { ...src, workerModule: CARD, workerArgs: { duration: 10 }, jobs: 2, resume: 'film v1' };
  const whole = await renderVideo({ ...args, outPath: join(OUT, 'resume-a.mp4') });
  assert.equal(whole.segments, 3, '240 frames → segments of 96, 96 and 48');
  assert.ok(!existsSync(join(OUT, '.resume-a.mp4.parts')), 'segment folder removed once done');
  // stopped as soon as its first segment is whole: that segment is kept
  const out = join(OUT, 'resume-b.mp4'), seg0 = join(OUT, '.resume-b.mp4.parts', 'seg-0-96.mp4'), stop = new AbortController();
  await assert.rejects(renderVideo({ ...args, outPath: out, signal: stop.signal, onProgress: () => { if (existsSync(seg0)) stop.abort(new Error('stopped')); } }), /stopped/);
  assert.ok(existsSync(seg0) && !existsSync(out));
  const events = [];
  await renderVideo({ ...args, outPath: out, onProgress: p => events.push(p) });
  assert.ok(events.filter(e => e.phase === 'frames').every(e => e.done >= 96), 'the kept segment is not drawn again');
  assert.equal(sha(out), sha(whole.path));
  assert.deepEqual(await decodeFrames(out), seq(0, 240));
  // another key (the film changed) draws everything again
  const again = [];
  await renderVideo({ ...args, resume: 'film v2', outPath: join(OUT, 'resume-c.mp4'), keep: true });
  await renderVideo({ ...args, resume: 'film v3', outPath: join(OUT, 'resume-c.mp4'), onProgress: p => again.push(p) });
  assert.equal(again.find(e => e.phase === 'frames').done < 96, true, 'segments of another key are not kept');
});

test('renderVideo: the same bytes in one process and with 2 or 3 workers; a range on the grid is the whole render\'s segments', { skip: !FF && 'ffmpeg not installed' }, async () => {
  const src = createSource({ duration: 12, width: 128, height: 72 }), args = { ...src, workerModule: CARD, workerArgs: { duration: 12, width: 128, height: 72 } };
  const one = await renderVideo({ ...args, jobs: 1, outPath: join(OUT, 'j1.mp4') });
  const two = await renderVideo({ ...args, jobs: 2, outPath: join(OUT, 'j2.mp4') });
  const three = await renderVideo({ ...args, jobs: 3, outPath: join(OUT, 'j3.mp4') });
  assert.equal(one.jobs, 1); assert.equal(two.jobs, 2); assert.equal(three.jobs, 3);
  assert.equal(sha(two.path), sha(one.path)); assert.equal(sha(three.path), sha(one.path));
  // frames 96–191 rendered on their own: the very packets of the whole render's frames 96–191
  const part = await renderVideo({ ...args, jobs: 2, range: [96, 192], outPath: join(OUT, 'j-part.mp4') });
  const packets = async p => (await ffmpeg(['-i', p, '-map', '0:v:0', '-c', 'copy', '-f', 'framemd5', 'pipe:1'])).stdout.toString().split('\n').filter(l => /^0,/.test(l)).map(l => l.split(',').at(-1).trim());
  assert.deepEqual(await packets(part.path), (await packets(one.path)).slice(96, 192));
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
  const src = createSource({ duration: 5 });
  writeFileSync(join(OUT, 'fail.mp4'), 'previous render');
  await assert.rejects(
    renderVideo({ ...src, workerModule: CARD, workerArgs: { duration: 5, failAt: 100 }, outPath: join(OUT, 'fail.mp4'), jobs: 2 }),
    /worker [01] \(frames 96–119\): test card: failing at frame 100/);
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

test('sheet: stills under the title and end cards are labelled as the cards; a long title does not run into the stats', async () => {
  const { plan, drawFrame } = createSource({ width: 320, height: 180, duration: 2, shots: 2 });
  const carded = { ...plan, cards: [{ kind: 'open', t0: 0, t1: 0.5 }, { kind: 'end', t0: 1.5, t1: 2 }] };
  assert.deepEqual(sheetItems(carded, [0.1, 1, 1.9]).map(i => i.shot.id), ['title card', 'tc-02', 'end card']);
  // the header's ink: the title and the stats are apart, side by side (a blank of at least 20 columns) or one under the
  // other (blank rows between them); the rule under them is left out
  for (const [title, cols] of [['The Very Long Title of a Film About a Hare and a Tortoise', 1], ['Seventy-Six Summers', 1], ['Seventy-Six Summers', 3]]) {
    const outPath = join(OUT, `sheet-title-${cols}-${title.length}.jpg`);
    const r = await contactSheet({ plan, drawFrame, outPath, cols, tileW: 480, times: [0.5, 1, 1.5], title });
    const L = sheetLayout({ n: 3, cols, tileW: 480, W: 320, H: 180 }), img = await loadImage(readFileSync(r.path));
    const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const w = img.width - 2 * L.margin, h = L.header - 4, d = x.getImageData(L.margin, L.margin, w, h).data;
    const ink = (i, y) => { const p = (y * w + i) * 4; return d[p] + d[p + 1] + d[p + 2] < 3 * 180; };
    const rows = [...Array(h).keys()].filter(y => { let n = 0; for (let i = 0; i < w; i++) n += ink(i, y); return n > 0 && n < 0.9 * w; });
    const columns = [...Array(w).keys()].filter(i => rows.some(y => ink(i, y)));
    const widest = list => Math.max(0, ...list.slice(1).map((v, k) => v - list[k] - 1));
    assert.ok(widest(columns) >= 20 || widest(rows) >= 3, `${title} (${cols} columns): blank columns ${widest(columns)}, blank rows ${widest(rows)}`);
  }
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

// ───────────── the CLI on a small film of the real engine ─────────────

// a hare walking with a misspelled field ("speeed"), placed on a perch its rig cannot use
const probeFilm = (edit = j => j) => edit({ title: 'Probe', format: { width: 1920, height: 1080, fps: 24, captions: 'dialogue' },
  voices: { hare: { voice: 'Puck' } }, cast: { hare: { rig: 'hare', voice: 'hare' } }, sets: { meadow: { kit: 'meadow' } },
  scenes: [{ id: 's1', set: 'meadow', actors: { hare: { at: 'low_branch' } }, shots: [{ id: 'a', beats: [{ do: 'walk', who: 'hare', to: 'x:1500', speeed: 2 }] }] }] });
function probeDir(name, film, custom = null) {
  const dir = join(OUT, 'probe', name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'film.json'), JSON.stringify(film));
  if (custom) writeFileSync(join(dir, 'custom.mjs'), custom);
  return dir;
}

test('check and plan print the film\'s and the plan\'s warnings; --strict fails on them', () => {
  const dir = probeDir('warn', probeFilm()), env = { GEMINI_API_KEY: '' };
  const typo = /warning:? +scenes\[0\]\.shots\[0\]\.beats\[0\]\.speeed: unknown field "speeed"/, perch = /hare.*perch "low_branch".*cannot perch|"low_branch" is a perch, and rig "hare" can neither perch/;
  const c = cli(['check', dir], ROOT, env), co = c.stdout + c.stderr;
  assert.match(co, typo); assert.match(co, perch);
  const p = cli(['plan', dir], ROOT, env), po = p.stdout + p.stderr;
  assert.match(po, typo); assert.match(po, perch);
  // only the typo (on a meadow anchor): valid, unless --strict
  const plain = probeDir('strict', probeFilm(j => { j.scenes[0].actors.hare.at = 'meadow_centre'; return j; }));
  const pp = cli(['plan', plain], ROOT, env), ppo = pp.stdout + pp.stderr;
  assert.ok(ppo.search(typo) >= 0 && ppo.search(typo) < ppo.search(/^shot +set +size/m), 'the warnings come before the shot table');
  const ok = cli(['check', plain], ROOT, env);
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /valid/); assert.match(ok.stdout, typo);
  const strict = cli(['check', plain, '--strict'], ROOT, env);
  assert.equal(strict.status, 1); assert.match(strict.stderr, /1 warning \(--strict makes them errors\)/);
  // a failed check says its warnings too
  const bad = cli(['check', probeDir('bad', probeFilm(j => { j.cast.hare.rig = 'dragon'; return j; }))], ROOT, env);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /cast\.hare\.rig/); assert.match(bad.stderr, /warning: scenes\[0\]\.shots\[0\]\.beats\[0\]\.speeed: unknown field/);
});

test('verify-effect fails a film-made sound that is mostly rumble below 20 Hz, or silent', () => {
  const tone = (hz, k) => `({ dur = 1.5 }) => Float32Array.from({ length: Math.round(48000 * dur) }, (_, i) => 0.3 * Math.exp(-${k} * i / 48000) * Math.sin(2 * Math.PI * ${hz} * i / 48000))`;
  const dir = probeDir('rumble', probeFilm(j => { j.scenes[0].actors.hare.at = 'meadow_centre'; return j; }), `export const sounds = { rumble: ${tone(8, 0)}, bell: ${tone(880, 3)}, hush: () => new Float32Array(48000) };\n`);
  const r = cli(['verify-effect', dir, '-o', join(OUT, 'probe', 'rumble.jpg')], ROOT, { GEMINI_API_KEY: '' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL +sound rumble +below 20 Hz it is only 0\.\d dB under its whole band/);
  assert.match(r.stdout, /ok +sound bell .*below 20 Hz \d+ dB under/);
  assert.match(r.stdout, /FAIL +sound hush +it is silent/);
  assert.match(r.stderr, /2 checks failed \(sound rumble, sound hush\)/);
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
    captions: lines.map(l => ({ t0: l.t0, t1: l.t1, text: l.text, style: l.narrator ? 'narration' : 'dialogue' })), sfx: [], ambience: [], music: [], actorsAt: () => [],
    warnings: [1, 2, 3, 4].map(i => 'stand-in warning ' + i) };
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
  // the warnings: their count and the first three
  assert.match(r.stdout, /warnings +4, the first 3 below/); assert.match(r.stdout, /warning +stand-in warning 3/); assert.doesNotMatch(r.stdout, /stand-in warning 4/);
  assert.match(r.stdout, /^music .*music\.wav \(/m); assert.match(r.stdout, /^mix .*\(master/m);
  assert.match(readFileSync(join(out, 'demo.mp4'), 'latin1'), /subme=8 /, 'a whole film is encoded "slow"');
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

  // a part: widened to whole 4 s segments, encoded "medium" (unless --preset says), and the music and mix are kept
  const mix0 = sha(join(out, 'mix.wav')), music0 = sha(join(out, 'music.wav'));
  const part = cmd(['render', 'films/demo', '--from=1.1', '--to=1.6', '-j', '1']);
  assert.equal(part.status, 0, part.stderr);
  assert.match(part.stdout, /range +0:00\.0 → 0:04\.0/);
  assert.match(part.stdout, /mix\.wav and .*music\.wav are up to date/); assert.doesNotMatch(part.stdout, /^music .*music\.wav \(|\(master/m);
  assert.deepEqual(await decodeFrames(join(out, 'demo-0s.mp4')), seq(0, Math.min(96, info.video.frames)));
  assert.match(readFileSync(join(out, 'demo-0s.mp4'), 'latin1'), /subme=7 /, 'a part is encoded "medium"');
  const slow = cmd(['render', 'films/demo', '--from=2', '--to=3', '--preset=slow', '-o', 'films/demo/out/slow-part.mp4']);
  assert.equal(slow.status, 0, slow.stderr); assert.match(readFileSync(join(out, 'slow-part.mp4'), 'latin1'), /subme=8 /);
  // the film's files or the engine's sound code changed: the music and the mix are made again, the same bytes
  for (const f of [join(root, 'films', 'demo', 'film.json'), join(root, 'engine', 'audio', 'mix.mjs')]) {
    const t = new Date(Date.now() + 5000); utimesSync(f, t, t);
    const again = cmd(['render', 'films/demo', '--from=2', '--to=3']);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /^music .*music\.wav \(/m); assert.match(again.stdout, /^mix .*\(master/m);
    assert.equal(sha(join(out, 'mix.wav')), mix0); assert.equal(sha(join(out, 'music.wav')), music0);
  }
  // `mix` makes the same bytes and marks them as made for these files: render keeps them
  const m = cmd(['mix', 'films/demo']);
  assert.equal(m.status, 0, m.stderr); assert.equal(sha(join(out, 'mix.wav')), mix0);
  const after = cmd(['render', 'films/demo', '--from=2', '--to=3']);
  assert.match(after.stdout, /are up to date/);

  writeFileSync(join(root, 'films', 'demo', 'film.json'), JSON.stringify({ title: 'Broken', format: { width: 64, height: 36, fps: 24 }, scenes: [] }));
  const bad = cmd(['check', 'films/demo']);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /1 problem:\n  - scenes: at least one scene is required/);
});

// ───────────── one render per output, and the session row ─────────────
test('a second render of the same output is refused while the first runs; a lock left by a dead process is taken over', () => {
  const dir = join(ROOT, 'out', 'test-lock'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const out = join(dir, 'film.mp4'), lock = join(dir, '.film.mp4.lock');
  const release = lockOutput(out);
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
  assert.throws(() => lockOutput(out), /another render of film\.mp4 is already running \(pid \d+\)/);
  assert.doesNotThrow(() => lockOutput(join(dir, 'animatic.mp4'))(), 'another output is not blocked');
  release();
  assert.ok(!existsSync(lock), 'released');
  // a crashed render leaves its lock behind: its pid is no longer running
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
  writeFileSync(lock, gone);
  const again = lockOutput(out);
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
  again();
  rmSync(dir, { recursive: true, force: true });
});

test('renderVideo refuses to start while another render holds the output, and leaves its parts alone', async () => {
  const dir = join(ROOT, 'out', 'test-lock2'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const out = join(dir, 'clip.mp4'), parts = join(dir, '.clip.mp4.parts');
  mkdirSync(parts); writeFileSync(join(parts, 'seg-000.mp4'), 'in progress');
  const release = lockOutput(out);
  await assert.rejects(renderVideo({ plan: { W: 64, H: 36, fps: 12, duration: 1 }, drawFrame: () => {}, outPath: out, verify: false }), /already running/);
  assert.equal(readFileSync(join(parts, 'seg-000.mp4'), 'utf8'), 'in progress', 'the running render\'s segments are untouched');
  release(); rmSync(dir, { recursive: true, force: true });
});

test('setup says whether anyone can answer: headless runs (claude -p, the SDK) are told to skip the checkpoint', () => {
  const headless = cli(['setup', '--check'], ROOT, { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' });
  assert.match(headless.stdout, /session\s+nobody can answer questions in this run .*sdk-cli.*Skip the checkpoint/);
  const person = cli(['setup', '--check'], ROOT, { CLAUDE_CODE_ENTRYPOINT: 'cli' });
  assert.match(person.stdout, /session\s+interactive: a person can answer the checkpoint/);
  const plain = cli(['setup', '--check'], ROOT, { CLAUDE_CODE_ENTRYPOINT: '' });
  assert.doesNotMatch(plain.stdout, /session/, 'outside Claude Code there is no session row');
});
