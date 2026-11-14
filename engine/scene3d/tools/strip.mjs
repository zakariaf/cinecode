// Contact strip of a scene:
//   node engine/scene3d/tools/strip.mjs engine/scene3d/scenes/zero.mjs FILE.jpg --times 0,0.5,1 | --range 0-8 --n 16 [--cols 8] [--cell 480x400] [--follow man] [--size 960x540]
import * as THREE from 'three/webgpu';
import { open } from './scene.mjs';
import { saveImage, tile } from '../img.mjs';
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const src = await open(args[0], opt('size', '960x540')), W = src.width, H = src.height;
let times;
if (opt('times')) times = opt('times').split(',').map(Number);
else { const [a, b] = opt('range', `0-${src.duration}`).split('-').map(Number), n = Number(opt('n', '16')); times = Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); }
const cols = Number(opt('cols', '8'));
const follow = opt('follow', null);
const anchor = Number(opt('anchor', '0.6'));   // how far down the cell the hips sit
const [cw, ch] = (opt('cell', `${W}x${H}`)).split('x').map(Number);
const cells = [];
for (const t of times) {
  const px = await src.pixels(t);
  if (follow) {
    const bones = src.built.cast[follow].ch.bones;
    const p = (bones.pelvis ?? bones.hips).getWorldPosition(new THREE.Vector3()).project(src.stage.camera);
    const cx = Math.round((p.x * 0.5 + 0.5) * W - cw / 2), cy = Math.round((0.5 - p.y * 0.5) * H - ch * anchor);
    const x = Math.max(0, Math.min(W - cw, cx)), y = Math.max(0, Math.min(H - ch, cy));
    cells.push(tile([px], W, H, 1, { x, y, w: cw, h: ch }).px);
  } else cells.push(px);
}
const s = follow ? tile(cells, cw, ch, cols) : tile(cells, W, H, cols);
saveImage(args[1], s.px, s.w, s.h, { scaleTo: Number(opt('max', '2000')) });
src.close();
