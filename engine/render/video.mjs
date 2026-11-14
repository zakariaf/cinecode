// Parallel video rendering: the frames are cut into short segments on a fixed grid (counted from frame 0), handed out
// one at a time to long-lived worker processes, each segment one x264 file → concat (-c copy) → mux master audio (AAC)
// and soft subtitles (mov_text) → verify with ffprobe.
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdirSync, rmSync, writeFileSync, renameSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg, probe } from './ffmpeg.mjs';
import { encodeRange } from './encode.mjs';
import { toSrt } from './srt.mjs';

const WORKER = fileURLToPath(new URL('./worker.mjs', import.meta.url));
// x264 threads of every segment: fixed, so a segment's bytes depend neither on -j nor on the machine's cores
const THREADS = 2;
export const defaultJobs = () => Math.max(1, availableParallelism() - 1);

/** Frames in a segment: two keyframe intervals (x264Args' -g is 2 s), 4 s. */
export const segmentFrames = fps => Math.round(fps * 4);

/** Frames [a, b) cut on the grid of `size` frames counted from frame 0: [[a, …], …, […, b]]. */
export function gridRanges([a, b], size) {
  const out = [];
  for (let s = a; s < b;) { const e = Math.min(b, (Math.floor(s / size) + 1) * size); out.push([s, e]); s = e; }
  return out;
}

/** Total output frames for a plan at a given fps. */
export const frameCount = (plan, fps = plan.fps) => Math.max(1, Math.round(plan.duration * fps));

const even = v => Math.max(2, Math.round(v / 2) * 2);

/**
 * Render a frame source to an MP4.
 *
 *   plan, drawFrame        in-process frame source (always used for timing; drawn from when jobs = 1)
 *   workerModule, workerArgs  module whose createSource(workerArgs) rebuilds { plan, drawFrame } in each worker;
 *                          required for jobs > 1 (functions can't cross process boundaries)
 *   outPath, jobs, range   range = [startFrame, endFrame) in output frames (default: the whole plan)
 *   width, height, fps     output size and rate (default: the plan's)
 *   encoder                { crf = 17, preset = 'slow', threads = 2 }
 *   audio                  WAV path muxed as AAC 192k / 48 kHz (trimmed or padded to the video)
 *   captions               [{ t0, t1, text }] in plan time → soft subtitles (mov_text), shifted to the range
 *   title, keep (keep the segment files), verify (default true), signal (AbortSignal: stops workers and encoders)
 *   resume                 a key naming what is drawn (the film's files): a segment once whole is kept, so a render
 *                          stopped part way (killed, Ctrl-C, a crash) and started again with the same key and options
 *                          draws only what it is missing
 *   onProgress({ phase: 'frames' | 'join' | 'mux' | 'verify', done, drawn, total, fps, eta, elapsed, jobs })
 *                          done = frames encoded, drawn = frames drawn (x264 lookahead keeps drawn ahead of done)
 *   audio may also be a promise of the WAV's path (made beside the picture): it is awaited before the mux.
 *
 * The frames are cut into segments of segmentFrames(fps) on a grid counted from frame 0 and encoded with the same
 * settings whatever the jobs, so the bytes do not depend on -j, and a range on the grid gives the very segments of the
 * whole film's render (it can be spliced into it).
 *
 * → { path, frames, duration, segments, jobs, probe, ms }
 */
export async function renderVideo(opts) {
  const { plan, drawFrame, workerModule, workerArgs = {}, outPath, audio = null, captions = null, title = plan?.title, onProgress, keep = false, verify = true, signal, resume = null } = opts;
  if (!plan) throw new Error('renderVideo: plan is required');
  const fps = opts.fps ?? plan.fps, width = even(opts.width ?? plan.W), height = even(opts.height ?? plan.H);
  const encoder = { crf: 17, preset: 'slow', threads: THREADS, ...opts.encoder };
  const total = frameCount(plan, fps), range = opts.range ? [Math.max(0, opts.range[0]), Math.min(total, opts.range[1])] : [0, total];
  if (range[1] <= range[0]) throw new Error(`renderVideo: empty frame range ${range.join('–')}`);
  if (typeof audio === 'string' && !existsSync(audio)) throw new Error(`renderVideo: audio file not found: ${audio}`);
  const n = range[1] - range[0], start = performance.now();

  let jobs = Math.max(1, Math.floor(opts.jobs ?? (workerModule ? defaultJobs() : 1)));
  if (!workerModule) jobs = 1;
  if (typeof drawFrame !== 'function' && !workerModule) throw new Error('renderVideo: drawFrame or workerModule is required');
  const ranges = gridRanges(range, segmentFrames(fps));
  const here = jobs === 1 && typeof drawFrame === 'function';   // drawn in this process
  const lanes = here ? 1 : Math.min(jobs, ranges.length);        // the processes that draw

  const out = resolve(outPath), dir = dirname(out);
  mkdirSync(dir, { recursive: true });
  const release = lockOutput(out);
  const tmp = join(dir, `.${basename(out)}.parts`);
  const segs = ranges.map(([a, b]) => join(tmp, `seg-${a}-${b}.mp4`));
  let ok = false;

  try {
    // a resumed render keeps the whole segments of the one before, if it drew the same thing the same way
    const stamp = resume && JSON.stringify({ resume, width, height, fps, encoder }), stampFile = join(tmp, 'resume.json');
    if (!(resume && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp)) {
      rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
      if (resume) writeFileSync(stampFile, stamp);
    }
    const todo = ranges.map((r, i) => ({ range: r, outPath: segs[i] })).filter(s => !existsSync(s.outPath));
    const skipped = n - todo.reduce((s, { range: [a, b] }) => s + b - a, 0);

    // progress: the frames of whole segments, and those of the segments being drawn or encoded (by their first frame)
    let whole = skipped;
    const live = new Map(), sum = k => [...live.values()].reduce((s, v) => s + v[k], whole);
    const report = (phase = 'frames') => {
      if (!onProgress) return;
      const d = sum('encoded'), el = (performance.now() - start) / 1000, rate = (d - skipped) / Math.max(el, 1e-3);
      onProgress({ phase, done: d, drawn: sum('drawn'), total: n, fps: rate, eta: phase === 'frames' && rate > 0 ? (n - d) / rate : 0, elapsed: el, jobs: lanes });
    };
    const update = (first, m) => {
      if (m.segment != null) { live.delete(first); whole += m.segment; }
      else { const v = live.get(first) ?? { drawn: 0, encoded: 0 }; v.drawn = m.drawn ?? v.drawn; v.encoded = Math.min(m.encoded ?? v.encoded, v.drawn); live.set(first, v); }
      report();
    };

    if (here) {
      // each segment is written beside its name and given it once it is whole, as a worker does
      for (const s of todo) {
        await encodeRange({ plan, drawFrame, range: s.range, width, height, fps, outPath: `${s.outPath}.part.mp4`, encoder, signal,
          onFrame: d => update(s.range[0], { drawn: d }), onEncoded: e => update(s.range[0], { encoded: e }) });
        renameSync(`${s.outPath}.part.mp4`, s.outPath);
        update(s.range[0], { segment: s.range[1] - s.range[0] });
      }
    } else if (todo.length) {
      await runWorkers({ module: workerModule, args: workerArgs, queue: todo, lanes: Math.min(lanes, todo.length), width, height, fps, encoder, onProgress: update, signal, duration: plan.duration });
    }
    signal?.throwIfAborted();
    report('join');

    // join (one segment too: the concat puts the parameter sets before each keyframe, so a segment's packets are the
    // same in any render it is part of)
    const video = join(tmp, 'video.mp4'), list = join(tmp, 'segments.txt');
    writeFileSync(list, segs.map(s => `file '${basename(s)}'`).join('\n') + '\n');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);

    // mux into the scratch folder; the finished file replaces `out` only once it has been verified
    report('mux');
    const final = join(tmp, 'final.mp4');
    const dur = n / fps, t0 = range[0] / fps, wav = await audio;
    if (wav && !existsSync(wav)) throw new Error(`renderVideo: audio file not found: ${wav}`);
    const args = ['-i', video], maps = ['-map', '0:v:0'];
    if (wav) { args.push('-ss', t0.toFixed(6), '-i', wav); maps.push('-map', '1:a:0'); }
    const cues = captions ? captions.map(c => ({ ...c, t0: c.t0 - t0, t1: Math.min(c.t1 - t0, dur) })).filter(c => c.t1 > 0 && c.t0 < dur).map(c => ({ ...c, t0: Math.max(0, c.t0) })) : [];
    if (cues.length) {
      const srt = join(tmp, 'subs.srt'); writeFileSync(srt, toSrt(cues));
      args.push('-i', srt); maps.push('-map', `${wav ? 2 : 1}:s:0`);
    }
    await ffmpeg([...args, ...maps, '-c:v', 'copy',
      ...(wav ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-af', 'apad'] : []),
      ...(cues.length ? ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-disposition:s:0', '0'] : []),
      ...(title ? ['-metadata', `title=${title}`] : []),
      '-t', dur.toFixed(6), '-movflags', '+faststart', final]);

    if (verify) report('verify');
    const info = verify ? await verifyVideo(final, { frames: n, fps, width, height, audio: !!wav, subtitles: cues.length > 0 }) : null;
    renameSync(final, out);
    ok = true;
    return { path: out, frames: n, duration: dur, segments: ranges.length, jobs: lanes, probe: info, ms: performance.now() - start };
  } finally {
    if (!keep && (ok || !resume)) rmSync(tmp, { recursive: true, force: true });   // (a resumable render that stopped keeps its segments)
    release();
  }
}

// One render at a time per output file: a second render of the same film would clear the first one's segment folder
// mid-encode and both would fail. The lock holds the owner's pid; a lock whose process is gone (a crash, a kill) is
// stale and taken over. → release()
export function lockOutput(out) {
  const lock = join(dirname(out), `.${basename(out)}.lock`), me = String(process.pid);
  for (let tries = 0; tries < 3; tries++) {
    try {
      writeFileSync(lock, me, { flag: 'wx' });
      return () => { try { if (readFileSync(lock, 'utf8') === me) unlinkSync(lock); } catch { /* already gone */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0;
      try { pid = Number(readFileSync(lock, 'utf8')); } catch { continue; }   // removed meanwhile: try again
      if (pid > 0 && isAlive(pid)) throw new Error(`another render of ${basename(out)} is already running (pid ${pid}). Wait for it to finish (run renders in the background and wait for them), or stop that process, before starting another`);
      rmSync(lock, { force: true });   // stale
    }
  }
  throw new Error(`could not lock ${basename(out)} for rendering (${lock})`);
}
const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** ffprobe the result: exact frame count, duration within ±1 frame, size, audio/subtitle streams. Throws on mismatch. */
export async function verifyVideo(path, { frames, fps, width, height, audio = false, subtitles = false }) {
  const p = await probe(path), bad = [];
  if (!p.video) bad.push('no video stream');
  else {
    if (frames != null && p.video.frames !== frames) bad.push(`frame count ${p.video.frames}, expected ${frames}`);
    if (width && (p.video.width !== width || p.video.height !== height)) bad.push(`size ${p.video.width}×${p.video.height}, expected ${width}×${height}`);
    if (fps && Math.abs(p.video.fps - fps) > 1e-3) bad.push(`frame rate ${p.video.fps}, expected ${fps}`);
  }
  if (frames != null && fps && Math.abs(p.duration - frames / fps) > 1 / fps + 1e-3) bad.push(`duration ${p.duration.toFixed(3)} s, expected ${(frames / fps).toFixed(3)} s`);
  if (audio && !p.audio) bad.push('no audio stream');
  if (audio && p.audio && Math.abs(p.audio.duration - frames / fps) > 1 / fps + 0.05) bad.push(`audio duration ${p.audio.duration.toFixed(3)} s, expected ${(frames / fps).toFixed(3)} s`);
  if (subtitles && !p.subtitles) bad.push('no subtitle stream');
  if (bad.length) throw new Error(`video check failed: ${bad.join('; ')}`);
  return p;
}

/** Fork `lanes` workers and hand them the segments of `queue` ([{ range, outPath }]) one at a time: the next to a worker
 *  that has handed its segment's last frame to x264 (it draws the next while x264 finishes); resolves when all are
 *  encoded, rejects (and stops the rest) on the first failure. onProgress(first frame of a segment, message) */
function runWorkers({ module, args, queue, lanes, width, height, fps, encoder, onProgress, signal, duration }) {
  return new Promise((resolve, reject) => {
    const kids = [];
    let next = 0, left = queue.length, failed = false;
    const fail = err => { if (failed) return; failed = true; for (const k of kids) if (k.exitCode === null) k.kill('SIGKILL'); reject(err); };
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => fail(signal.reason), { once: true });
    for (let i = 0; i < lanes; i++) {
      const k = fork(WORKER, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'advanced' });
      kids.push(k);
      let log = '';
      const held = new Map();   // first frame → the segment, while it is drawn or encoded
      const keep = d => { log += d; if (log.length > 16384) log = log.slice(-8192); };
      const frames = r => (r ? ` (frames ${r[0]}–${r[1] - 1})` : '');
      const give = () => {
        const seg = queue[next];
        if (seg) { next++; held.set(seg.range[0], seg); k.send({ type: 'segment', ...seg }); }
        else if (!held.size) k.send({ type: 'stop' });
      };
      k.stdout.on('data', keep); k.stderr.on('data', keep);
      k.on('message', m => {
        if (failed) return;
        if (m.type === 'ready') {
          if (duration != null && Math.abs(m.duration - duration) > 1e-6) fail(new Error(`worker ${i} built a different plan (${m.duration} s, expected ${duration} s): the frame source must be deterministic`));
          else give();
        } else if (m.type === 'progress') onProgress(m.start, m);
        else if (m.type === 'drawn') give();
        else if (m.type === 'segment') {
          held.delete(m.start);
          onProgress(m.start, { segment: m.frames });
          if (--left === 0) { resolve(); for (const o of kids) if (o !== k && o.exitCode === null) o.kill(); }   // (the others are idle or still starting)
          if (!held.size) give();
        } else if (m.type === 'error') fail(Object.assign(new Error(`worker ${i}${frames(m.range)}: ${m.message}`), { workerStack: m.stack, log }));
      });
      k.on('error', fail);
      k.on('close', (code, sig) => {   // after 'exit' and after its IPC messages have been delivered
        if (failed || left === 0) return;
        if (code !== 0 || held.size) fail(new Error(`worker ${i}${frames([...held.values()][0]?.range)} exited with ${sig || code}${log.trim() ? `\n${log.trim().split('\n').slice(-12).join('\n')}` : ''}`));
      });
      k.send({ type: 'start', module, args, width, height, fps, encoder });
    }
  });
}
