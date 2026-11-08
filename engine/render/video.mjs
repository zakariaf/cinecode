// Parallel video rendering: contiguous frame ranges → one x264 segment per worker → concat (-c copy)
// → mux master audio (AAC) and soft subtitles (mov_text) → verify with ffprobe.
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdirSync, rmSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg, probe } from './ffmpeg.mjs';
import { encodeRange } from './encode.mjs';
import { toSrt } from './srt.mjs';

const WORKER = fileURLToPath(new URL('./worker.mjs', import.meta.url));
export const defaultJobs = () => Math.max(1, availableParallelism() - 1);

/** Split frames [a, b) into at most `jobs` contiguous, nearly equal ranges of at least `minFrames` each. */
export function splitRanges([a, b], jobs, minFrames = 1) {
  const n = b - a; if (n <= 0) return [];
  const k = Math.max(1, Math.min(jobs, Math.floor(n / Math.max(1, minFrames)) || 1));
  const out = [];
  for (let i = 0; i < k; i++) out.push([a + Math.floor((n * i) / k), a + Math.floor((n * (i + 1)) / k)]);
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
 *   encoder                { crf = 17, preset = 'slow' }
 *   audio                  WAV path muxed as AAC 192k / 48 kHz (trimmed or padded to the video)
 *   captions               [{ t0, t1, text }] in plan time → soft subtitles (mov_text), shifted to the range
 *   title, keep (keep the segment files), verify (default true), signal (AbortSignal: stops workers and encoders)
 *   onProgress({ phase: 'frames' | 'join' | 'mux' | 'verify', done, drawn, total, fps, eta, elapsed, jobs })
 *                          done = frames encoded, drawn = frames drawn (x264 lookahead keeps drawn ahead of done)
 *
 * → { path, frames, duration, segments, probe, ms }
 */
export async function renderVideo(opts) {
  const { plan, drawFrame, workerModule, workerArgs = {}, outPath, audio = null, captions = null, title = plan?.title, onProgress, keep = false, verify = true, signal } = opts;
  if (!plan) throw new Error('renderVideo: plan is required');
  const fps = opts.fps ?? plan.fps, width = even(opts.width ?? plan.W), height = even(opts.height ?? plan.H);
  const encoder = { crf: 17, preset: 'slow', ...opts.encoder };
  const total = frameCount(plan, fps), range = opts.range ? [Math.max(0, opts.range[0]), Math.min(total, opts.range[1])] : [0, total];
  if (range[1] <= range[0]) throw new Error(`renderVideo: empty frame range ${range.join('–')}`);
  if (audio && !existsSync(audio)) throw new Error(`renderVideo: audio file not found: ${audio}`);
  const n = range[1] - range[0], start = performance.now();

  let jobs = Math.max(1, Math.floor(opts.jobs ?? (workerModule ? defaultJobs() : 1)));
  if (!workerModule) jobs = 1;
  if (typeof drawFrame !== 'function' && !workerModule) throw new Error('renderVideo: drawFrame or workerModule is required');
  const ranges = splitRanges(range, jobs, Math.max(12, Math.round(fps)));
  // Same encoder threads for every segment keeps the streams identical in structure.
  encoder.threads ??= ranges.length > 1 ? Math.max(1, Math.ceil(availableParallelism() / ranges.length)) : 0;

  const out = resolve(outPath), dir = dirname(out);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(out)}.parts`);
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const segs = ranges.map((_, i) => join(tmp, `seg-${String(i).padStart(3, '0')}.mp4`));

  // progress
  const drawn = ranges.map(() => 0), encoded = ranges.map(() => 0), sum = a => a.reduce((s, v) => s + v, 0);
  const report = (phase = 'frames') => {
    if (!onProgress) return;
    const d = sum(encoded), el = (performance.now() - start) / 1000, rate = d / Math.max(el, 1e-3);
    onProgress({ phase, done: d, drawn: sum(drawn), total: n, fps: rate, eta: phase === 'frames' && rate > 0 ? (n - d) / rate : 0, elapsed: el, jobs: ranges.length });
  };
  const update = (i, m) => { if (m.drawn != null) drawn[i] = m.drawn; if (m.encoded != null) encoded[i] = Math.min(m.encoded, drawn[i] || m.encoded); report(); };

  try {
    if (ranges.length === 1 && typeof drawFrame === 'function') {
      await encodeRange({ plan, drawFrame, range: ranges[0], width, height, fps, outPath: segs[0], encoder, signal,
        onFrame: d => update(0, { drawn: d }), onEncoded: e => update(0, { encoded: e }) });
    } else {
      await runWorkers({ module: workerModule, args: workerArgs, ranges, segs, width, height, fps, encoder, onProgress: update, signal, duration: plan.duration });
    }
    signal?.throwIfAborted();
    report('join');

    // join
    const video = join(tmp, 'video.mp4');
    if (segs.length === 1) renameSync(segs[0], video);
    else {
      const list = join(tmp, 'segments.txt');
      writeFileSync(list, segs.map(s => `file '${basename(s)}'`).join('\n') + '\n');
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
    }

    // mux into the scratch folder; the finished file replaces `out` only once it has been verified
    report('mux');
    const final = join(tmp, 'final.mp4');
    const dur = n / fps, t0 = range[0] / fps;
    const args = ['-i', video], maps = ['-map', '0:v:0'];
    if (audio) { args.push('-ss', t0.toFixed(6), '-i', audio); maps.push('-map', '1:a:0'); }
    const cues = captions ? captions.map(c => ({ ...c, t0: c.t0 - t0, t1: Math.min(c.t1 - t0, dur) })).filter(c => c.t1 > 0 && c.t0 < dur).map(c => ({ ...c, t0: Math.max(0, c.t0) })) : [];
    if (cues.length) {
      const srt = join(tmp, 'subs.srt'); writeFileSync(srt, toSrt(cues));
      args.push('-i', srt); maps.push('-map', `${audio ? 2 : 1}:s:0`);
    }
    await ffmpeg([...args, ...maps, '-c:v', 'copy',
      ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-af', 'apad'] : []),
      ...(cues.length ? ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-disposition:s:0', '0'] : []),
      ...(title ? ['-metadata', `title=${title}`] : []),
      '-t', dur.toFixed(6), '-movflags', '+faststart', final]);

    if (verify) report('verify');
    const info = verify ? await verifyVideo(final, { frames: n, fps, width, height, audio: !!audio, subtitles: cues.length > 0 }) : null;
    renameSync(final, out);
    return { path: out, frames: n, duration: dur, segments: ranges.length, probe: info, ms: performance.now() - start };
  } finally {
    if (!keep) rmSync(tmp, { recursive: true, force: true });
  }
}

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

/** Fork one worker per range; resolves when all segments are encoded, rejects (and stops the rest) on the first failure. */
function runWorkers({ module, args, ranges, segs, width, height, fps, encoder, onProgress, signal, duration }) {
  return new Promise((resolve, reject) => {
    const kids = [];
    let left = ranges.length, failed = false;
    const fail = err => { if (failed) return; failed = true; for (const k of kids) if (k.exitCode === null) k.kill('SIGKILL'); reject(err); };
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => fail(signal.reason), { once: true });
    ranges.forEach((range, i) => {
      const k = fork(WORKER, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'advanced' });
      kids.push(k);
      let log = '', finished = false;
      const keep = d => { log += d; if (log.length > 16384) log = log.slice(-8192); };
      k.stdout.on('data', keep); k.stderr.on('data', keep);
      k.on('message', m => {
        if (m.type === 'ready' && duration != null && Math.abs(m.duration - duration) > 1e-6) fail(new Error(`worker ${i} built a different plan (${m.duration} s, expected ${duration} s): the frame source must be deterministic`));
        else if (m.type === 'progress') onProgress(i, m);
        else if (m.type === 'done') { finished = true; onProgress(i, { drawn: m.frames, encoded: m.frames }); }
        else if (m.type === 'error') fail(Object.assign(new Error(`worker ${i} (frames ${range[0]}–${range[1] - 1}): ${m.message}`), { workerStack: m.stack, log }));
      });
      k.on('error', fail);
      k.on('close', (code, sig) => {   // after 'exit' and after its IPC messages have been delivered
        if (failed) return;
        if (code !== 0 || !finished) return fail(new Error(`worker ${i} (frames ${range[0]}–${range[1] - 1}) exited with ${sig || code}${log.trim() ? `\n${log.trim().split('\n').slice(-12).join('\n')}` : ''}`));
        if (--left === 0) resolve();
      });
      k.send({ type: 'start', module, args, range, width, height, fps, outPath: segs[i], encoder });
    });
  });
}
