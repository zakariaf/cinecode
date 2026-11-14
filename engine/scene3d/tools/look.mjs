// The look gate, in numbers:
//   node engine/scene3d/tools/look.mjs engine/scene3d/scenes/zero.mjs [30,100,153,222] [100-110] [1920x1080] [--save DIR]
// 1. Tone, for each listed frame: the share of pixels that are near black (luma under 16 of 255) and the share
//    that are clipped (any channel at 250 or more), the 1st, 10th, 50th and 90th percentile of luma, the RMS
//    contrast (the standard deviation of luma) and the mean saturation ((max - min) / max, in percent).
// 2. Flicker, over the frame range, first with the grain off and then as delivered: the picture is cut into a
//    16 x 9 grid of tiles. A tile is "still" when nothing in it moves over the range (with the grain off, its mean
//    luma stays within 1.5, and the first frame differs from the last by no more than frames next to each other
//    do; judged once, without the grain, so the grain's own change cannot hide a slow movement, such as a long
//    shadow on a wall swaying with the man who casts it). For the still tiles: the mean absolute change of a
//    pixel's luma from one frame to the next (worst tile, and mean).
// Exit code 1 when a gate fails: 2 percent near black, 3 percent clipped, RMS contrast under 58 (flat), the 1st
// percentile of luma outside 15 to 45 (no real darks, or crushed ones), 1.0 luma of flicker.
import path from 'node:path';
import fs from 'node:fs';
import { open } from './scene.mjs';
import { saveImage } from '../img.mjs';

const args = process.argv.slice(2), si = args.indexOf('--save'), save = si >= 0 ? args.splice(si, 2)[1] : null;
const [sceneFile, list = '30,100,153,222', range = '100-110', size = '1920x1080'] = args;
const src = await open(sceneFile, size), W = src.width, H = src.height, n = W * H;
const luma = (px) => { const l = new Float32Array(n); for (let i = 0; i < n; i++) l[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]; return l; };
let ok = true;
if (save) fs.mkdirSync(save, { recursive: true });

console.log(`${sceneFile} at ${size}\nframe  near-black%  clipped%   luma p1 p10 p50 p90   rms   saturation%`);
for (const f of list.split(',').map(Number)) {
  const px = await src.pixels(f / src.fps), l = luma(px), hist = new Uint32Array(256);
  let dark = 0, clip = 0, sat = 0, s = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], mx = Math.max(r, g, b);
    if (l[i] < 16) dark++;
    if (mx >= 250) clip++;
    if (mx > 0) sat += (mx - Math.min(r, g, b)) / mx;
    hist[Math.round(l[i])]++; s += l[i]; s2 += l[i] * l[i];
  }
  const pct = (q) => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= q * n) return v; } return 255; };
  const d = 100 * dark / n, c = 100 * clip / n, rms = Math.sqrt(s2 / n - (s / n) ** 2), p1 = pct(0.01);
  if (d >= 2 || c >= 3 || rms < 58 || p1 < 15 || p1 > 45) ok = false;
  console.log(`${String(f).padStart(5)}  ${d.toFixed(2).padStart(10)}  ${c.toFixed(2).padStart(8)}   ${[0.01, 0.1, 0.5, 0.9].map((q) => String(pct(q)).padStart(4)).join('')}  ${rms.toFixed(1).padStart(5)}   ${(100 * sat / n).toFixed(1).padStart(8)}`);
  if (save) saveImage(path.join(save, `f_${String(f).padStart(4, '0')}.jpg`), px, W, H);
}

// flicker: with the grain off (which also finds the still tiles), then as delivered (with the scene's grain)
const [f0, f1] = range.split('-').map(Number), GX = 16, GY = 9, tw = Math.floor(W / GX), th = Math.floor(H / GY), T = GX * GY;
const grain = src.stage.look.grain.value;
let still = null;
for (const g of [0, grain]) {
  src.stage.look.grain.value = g;
  const lo = new Float32Array(T).fill(1e9), hi = new Float32Array(T).fill(-1e9), change = new Float64Array(T), far = new Float64Array(T);
  let prev = null, first = null;
  for (let f = f0; f <= f1; f++) {
    const l = luma(await src.pixels(f / src.fps));
    first ??= l;
    for (let t = 0; t < T; t++) {
      const x0 = (t % GX) * tw, y0 = Math.floor(t / GX) * th;
      let s = 0, d = 0, e = 0;
      for (let y = y0; y < y0 + th; y++) for (let x = x0, i = y * W + x0; x < x0 + tw; x++, i++) { s += l[i]; if (prev) d += Math.abs(l[i] - prev[i]); e += Math.abs(l[i] - first[i]); }
      s /= tw * th; lo[t] = Math.min(lo[t], s); hi[t] = Math.max(hi[t], s); change[t] += d / (tw * th) / (f1 - f0);
      if (f === f1) far[t] = e / (tw * th);
    }
    prev = l;
  }
  // moving: the tile's brightness drifts, or the change from the first frame to the last is much more than from one frame to the next
  still ??= Array.from({ length: T }, (_, t) => hi[t] - lo[t] < 1.5 && far[t] < 1.5 * change[t] + 0.4);
  let worst = 0, at = 0, sum = 0, n = 0;
  for (let t = 0; t < T; t++) if (still[t]) { n++; sum += change[t]; if (change[t] > worst) { worst = change[t]; at = t; } }
  console.log(`flicker, frames ${f0}-${f1}, grain ${g}: ${n} of ${T} tiles are still; mean change of a pixel's luma between frames: worst tile ${worst.toFixed(3)} (column ${at % GX}, row ${Math.floor(at / GX)}), mean of still tiles ${(sum / Math.max(n, 1)).toFixed(3)}`);
  let row = '';
  for (let t = 0; t < T; t++) { row += still[t] ? change[t].toFixed(1).padStart(5) : '    .'; if (t % GX === GX - 1) { console.log(row); row = ''; } }
  if (worst >= 1 || !n) ok = false;
}
console.log(ok ? 'RESULT: within the gate.' : 'RESULT: OUTSIDE the gate.');
src.close();
process.exitCode = ok ? 0 : 1;
