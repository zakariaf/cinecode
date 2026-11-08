// Frame worker (child_process.fork). Builds its own frame source, encodes one contiguous range, reports progress.
//
// parent → { type: 'start', module, args, range: [a, b], width, height, fps, outPath, encoder }
// worker → { type: 'ready', ms, duration } · { type: 'progress', drawn, encoded } · { type: 'done', frames, ms } · { type: 'error', message, stack }
import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { encodeRange } from './encode.mjs';

/** Import a frame-source module and build { plan, drawFrame } from it (named `createSource`, or the default export). */
export async function loadSource(module, args = {}) {
  const href = /^(file|data|node):/.test(module) ? module : pathToFileURL(isAbsolute(module) ? module : resolve(module)).href;
  const m = await import(href);
  const make = m.createSource || m.default;
  if (typeof make !== 'function') throw new Error(`${module} does not export createSource(args) → { plan, drawFrame }`);
  const src = await make(args);
  if (!src?.plan || typeof src.drawFrame !== 'function') throw new Error(`${module}: createSource() must return { plan, drawFrame }`);
  return src;
}

async function work(msg) {
  const t0 = performance.now();
  const { plan, drawFrame } = await loadSource(msg.module, msg.args);
  process.send({ type: 'ready', ms: performance.now() - t0, duration: plan.duration });
  let last = 0, drawn = 0, encoded = 0;
  const tick = () => { const now = performance.now(); if (now - last > 200) { last = now; process.send({ type: 'progress', drawn, encoded }); } };
  const r = await encodeRange({
    plan, drawFrame, range: msg.range, width: msg.width, height: msg.height, fps: msg.fps, outPath: msg.outPath, encoder: msg.encoder,
    onFrame: n => { drawn = n; tick(); },
    onEncoded: n => { encoded = n; tick(); },
  });
  await new Promise(res => process.send({ type: 'done', frames: r.frames, ms: performance.now() - t0 }, res));
}

if (process.send && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.once('message', msg => {
    if (msg?.type !== 'start') return;
    work(msg).then(() => process.exit(0), e => {
      process.send({ type: 'error', message: e?.message || String(e), stack: e?.stack }, () => process.exit(1));
    });
  });
  process.on('disconnect', () => process.exit(1));   // parent died or cancelled
}
