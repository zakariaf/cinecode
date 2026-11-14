// Stills of the place "home" (home/kit.mjs) from its named viewpoints, tiled into a sheet, with the time each took.
//   node engine/scene3d/tools/views.mjs <golden|twilight> OUT.jpg [--size 960x540] [--cols 3] [--door 0] [--t 10] [--save DIR] [--stats] [view ...]
// A view is a camera's name (all of them when none is given), or pos@target@fov ("-12,2,-9@0,2,-1@40", lit as
// outside). --stats: the look gate's tone numbers for each view (as tools/look.mjs counts them). --door: the front
// door's pose (0 shut .. 1 open). --save DIR: also each view at full size. (scenes/home.mjs puts the car and the
// cast in it, for the other tools.)
import fs from 'node:fs';
import path from 'node:path';
import { HOME_KIT as K } from '../home/kit.mjs';
import { createStage } from '../stage.mjs';
import { saveImage, tile } from '../img.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? (args.splice(i, 1), true) : false; };
const [w, h] = opt('size', '960x540').split('x').map(Number), cols = Number(opt('cols', 3)), doorPose = Number(opt('door', 0)), T = Number(opt('t', 10)), save = opt('save', null);
const stats = flag('stats');
if (save) fs.mkdirSync(save, { recursive: true });
const [time, out, ...names] = args;
const views = names.length ? names : Object.keys(K.cameras);

const stage = await createStage({ width: w, height: h, ...K.stageOptions });
const place = K.build(stage);
place.update(T);
place.home.door.pose({ door: doorPose });
const cells = [], ms = [];
for (const name of views) {
  // a view is a camera's name, or pos@target@fov ("-12,2,-9@0,2,-1@40"), seen as from outside
  const c = K.cameras[name] ?? (([p, q, f]) => ({ pos: p.split(',').map(Number), target: q.split(',').map(Number), fov: Number(f) }))(name.split('@'));
  place.light(time, K.cameras[name] ? K.side(name) : 'outside');
  stage.setCamera(c);
  stage.look.focus.value = Math.hypot(...c.pos.map((v, i) => v - c.target[i]));
  await stage.render(Math.round(T * 24));               // the first render of a light builds what it needs
  const t0 = performance.now(), px = await stage.render(Math.round(T * 24));
  ms.push(performance.now() - t0);
  cells.push(px);
  if (stats) {      // the look gate's tone numbers (engine tools/look.mjs): p1, p50, RMS contrast, clipped %
    const N = w * h, hist = new Uint32Array(256); let s1 = 0, s2 = 0, clip = 0;
    for (let i = 0; i < N; i++) { const l = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]; hist[Math.round(l)]++; s1 += l; s2 += l * l; if (Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) >= 250) clip++; }
    const pct = (q) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= q * N) return v; } return 255; };
    const rms = Math.sqrt(s2 / N - (s1 / N) ** 2), p1 = pct(0.01), c = 100 * clip / N;
    console.log(`  tone ${name}: p1 ${p1} p50 ${pct(0.5)} rms ${rms.toFixed(1)} clipped ${c.toFixed(2)}% ${p1 >= 15 && p1 <= 45 && rms >= 58 && c < 3 ? 'PASS' : 'FAIL'}`);
  }
  if (save) saveImage(path.join(save, `${time}-${name.replace(/[@,]/g, '_')}.jpg`), px, w, h);
  console.log(`${name}: ${ms.at(-1).toFixed(1)} ms`);
}
const s = tile(cells, w, h, cols);
saveImage(out, s.px, s.w, s.h);
stage.close();
console.log('wrote', out);
