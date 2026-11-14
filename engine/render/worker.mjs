// Frame worker (child_process.fork). Builds its own frame source once, then encodes the segments it is given (a range
// of frames, one x264 file each), reporting progress. It says when a segment's last frame is handed to x264, and the
// next segment is drawn while x264 finishes that one (x264 holds about 2 s of frames in its lookahead).
//
// parent → { type: 'start', module, args, width, height, fps, encoder } · { type: 'segment', range: [a, b], outPath } · { type: 'stop' }
// worker → { type: 'ready', ms, duration } · { type: 'progress', start, drawn, encoded } · { type: 'drawn', start }
//          · { type: 'segment', start, frames, ms } · { type: 'error', message, stack, range }
import { pathToFileURL } from 'node:url';
import { renameSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { encodeRange } from './encode.mjs';

/**
 * Import a frame-source module and build { plan, drawFrame } from it (named `createSource`, or the default export).
 * A source that draws no canvas returns { plan, pixels(t) } (encode.mjs encodeRange); `size` ({ width, height }: the
 * frames wanted) is its second argument.
 */
export async function loadSource(module, args = {}, size = {}) {
  const href = /^(file|data|node):/.test(module) ? module : pathToFileURL(isAbsolute(module) ? module : resolve(module)).href;
  const m = await import(href);
  const make = m.createSource || m.default;
  if (typeof make !== 'function') throw new Error(`${module} does not export createSource(args) → { plan, drawFrame } or { plan, pixels }`);
  const src = await make(args, size);
  if (!src?.plan || (typeof src.drawFrame !== 'function' && typeof src.pixels !== 'function')) throw new Error(`${module}: createSource() must return { plan, drawFrame } or { plan, pixels }`);
  return src;
}

async function start(msg) {
  const t0 = performance.now();
  const src = await loadSource(msg.module, msg.args, { width: msg.width, height: msg.height });
  process.send({ type: 'ready', ms: performance.now() - t0, duration: src.plan.duration });
  return { src, msg };
}

// a segment is written beside its name and given it once it is whole, so a segment file is never half a segment
async function segment({ src, msg: { width, height, fps, encoder } }, { range, outPath }) {
  const start = range[0];
  let last = 0, drawn = 0, encoded = 0;
  const tick = () => { const now = performance.now(); if (now - last > 200) { last = now; process.send({ type: 'progress', start, drawn, encoded }); } };
  const r = await encodeRange({
    plan: src.plan, drawFrame: src.drawFrame, pixels: src.pixels, range, width, height, fps, outPath: `${outPath}.part.mp4`, encoder,
    onFrame: n => { drawn = n; if (n === range[1] - start) process.send({ type: 'drawn', start }); tick(); },
    onEncoded: n => { encoded = n; tick(); },
  });
  renameSync(`${outPath}.part.mp4`, outPath);
  process.send({ type: 'segment', start, frames: r.frames, ms: r.ms });
}

if (process.send && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failed = (e, range) => process.send({ type: 'error', message: e?.message || String(e), stack: e?.stack, range }, () => process.exit(1));
  let source;   // a promise of the frame source and the encoder settings
  process.on('message', msg => {
    if (msg?.type === 'start') (source = start(msg)).catch(failed);
    else if (msg?.type === 'segment') source.then(src => segment(src, msg)).catch(e => failed(e, msg.range));
    else if (msg?.type === 'stop') process.exit(0);
  });
  process.on('disconnect', () => process.exit(1));   // parent died or cancelled
}
