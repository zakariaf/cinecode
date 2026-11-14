// Draw a contiguous range of frames and pipe them, raw, into one x264 encode.
// Used in-process (one job) and by worker.mjs (parallel jobs) with identical encoder settings.
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { FFMPEG, FfmpegError, x264Args } from './ffmpeg.mjs';

let ORDER;
/** Byte order of `canvas.data()` on this platform: 'rgba' or 'bgra'. */
export function pixelOrder() {
  if (ORDER) return ORDER;
  const c = createCanvas(1, 1), x = c.getContext('2d');
  x.fillStyle = '#ff0000'; x.fillRect(0, 0, 1, 1);
  const d = c.data();
  return (ORDER = d[0] === 255 && d[2] === 0 ? 'rgba' : 'bgra');
}

/**
 * A frame grabber: draws plan time t at the plan's size and returns opaque raw pixels at width × height.
 * If the output size differs from the plan size the full frame is drawn, then resampled down.
 */
export function frameGrabber(plan, drawFrame, width = plan.W, height = plan.H) {
  const full = createCanvas(plan.W, plan.H), fx = full.getContext('2d');
  const scaled = width !== plan.W || height !== plan.H;
  const out = scaled ? createCanvas(width, height) : full, ox = out.getContext('2d');
  if (scaled) { ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; }
  return {
    canvas: out,
    draw(t) {
      fx.save();
      fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalAlpha = 1; fx.globalCompositeOperation = 'source-over'; fx.filter = 'none';
      fx.fillStyle = '#000'; fx.fillRect(0, 0, plan.W, plan.H);
      fx.restore();
      fx.save(); drawFrame(fx, plan, t); fx.restore();
      if (scaled) { ox.fillStyle = '#000'; ox.fillRect(0, 0, width, height); ox.drawImage(full, 0, 0, width, height); }
      return out;
    },
    pixels(t) { return this.draw(t).data(); },   // a copy; safe to hand to a pipe
  };
}

/**
 * Encode frames [range[0], range[1]) of a frame source into `outPath` (H.264 in MP4).
 * Frame i is drawn at plan time i / fps. A source that draws no canvas (a 3D film: engine/scene3d/source.mjs) gives
 * `pixels(t)` instead of drawFrame: the finished frame's raw bytes at width × height, in pixelOrder(), or a promise of them.
 * onFrame(drawn) is called after each frame is handed to the encoder; onEncoded(encoded) as x264 reports progress
 * (it buffers ~50 frames of lookahead, so "drawn" runs ahead of "encoded"). An aborted `signal` stops it.
 * → { frames, ms }
 */
export async function encodeRange({ plan, drawFrame, pixels, range, width = plan.W, height = plan.H, fps = plan.fps, outPath, encoder = {}, onFrame, onEncoded, signal }) {
  if (width % 2 || height % 2) throw new Error(`video size must be even, got ${width}×${height}`);
  const [a, b] = range, grab = pixels ? { pixels } : frameGrabber(plan, drawFrame, width, height), start = performance.now();
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-progress', 'pipe:1', '-stats_period', '0.25',
    '-f', 'rawvideo', '-pix_fmt', pixelOrder(), '-s', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0',
    ...x264Args(fps, encoder), '-an', '-movflags', '+faststart', outPath];
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', progress = '', failed = null;
  ff.stderr.on('data', d => { stderr += d; if (stderr.length > 65536) stderr = stderr.slice(-32768); });
  ff.stdout.on('data', d => {
    const lines = (progress + d).split('\n'); progress = lines.pop();
    for (const l of lines) if (l.startsWith('frame=')) onEncoded?.(Number(l.slice(6)));
  });
  const closed = new Promise((resolve, reject) => {
    ff.on('error', e => reject(failed = e.code === 'ENOENT' ? new Error(`${FFMPEG} not found on PATH (install ffmpeg)`) : e));
    ff.on('close', code => code === 0 ? resolve() : reject(failed = new FfmpegError(FFMPEG, args, code, stderr)));
  });
  closed.catch(() => {});
  ff.stdin.on('error', () => {});            // EPIPE surfaces through `closed`
  const drain = () => new Promise(r => {
    const done = () => { ff.stdin.off('drain', done); ff.off('close', done); r(); };
    ff.stdin.on('drain', done); ff.on('close', done);
  });
  try {
    for (let i = a; i < b && !failed; i++) {
      signal?.throwIfAborted();
      if (!ff.stdin.write(await grab.pixels(i / fps))) await drain();
      onFrame?.(i - a + 1);
    }
  } catch (e) {
    ff.kill('SIGKILL');
    throw e;
  }
  ff.stdin.end();
  await closed;
  onEncoded?.(b - a);
  return { frames: b - a, ms: performance.now() - start };
}
