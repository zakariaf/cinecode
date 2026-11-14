// Command line: render a scene to frames and a clip (one still or a strip of them: tools/strip.mjs).
//   node engine/scene3d/tools/render.mjs engine/scene3d/scenes/zero.mjs --size 1280x720 --out DIR [--frames 0-191] [--video FILE.mp4]
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { open } from './scene.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const size = opt('size', '1280x720');
const outDir = opt('out', null), video = opt('video', null);

const src = await open(args[0], size);
const { fps } = src;
const [f0, f1] = (opt('frames', `0-${Math.round(src.duration * fps) - 1}`)).split('-').map(Number);

fs.mkdirSync(outDir, { recursive: true });
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', size, '-i', '-', '-compression_level', '1', '-threads', '6', '-start_number', String(f0), path.join(outDir, 'f_%04d.png')], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = performance.now(); let renderMs = 0;
for (let f = f0; f <= f1; f++) {
  const a = performance.now();
  const px = await src.pixels(f / fps);
  renderMs += performance.now() - a;
  if (!ff.stdin.write(px)) await new Promise((r) => ff.stdin.once('drain', r));
}
await new Promise((r) => { ff.on('close', r); ff.stdin.end(); });
console.log(`frames ${f0}-${f1}: ${(renderMs / (f1 - f0 + 1)).toFixed(1)} ms/frame pose+render+readback, ${((performance.now() - t0) / 1000).toFixed(1)} s with png writing`);
if (video) {
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-start_number', String(f0), '-i', path.join(outDir, 'f_%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-r', String(fps), video], { stdio: 'inherit' })
    .on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  console.log('wrote', video);
}
src.close();
