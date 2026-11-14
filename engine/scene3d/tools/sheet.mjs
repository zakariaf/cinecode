// A hard object's turntable: 8 views every 45 degrees at eye height, two from above, two from low down, in a warm
// late light on a pale ground, the ink on. Prints the build time, the triangles per part and the digest.
//   node engine/scene3d/tools/sheet.mjs car OUT.jpg [--pose door=1,steer=0.4,head=1,tail=1] [--cell 640x400]
//   node engine/scene3d/tools/sheet.mjs engine/scene3d/props/mailbox.mjs OUT.jpg [--pose flap=0.5,flag=1]
// A prop is a file whose default export returns a shape.mjs root part; `car` is car/car.mjs buildCar (its pose is
// buildCar's set(): door, steer, head, tail, spin).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStage } from '../stage.mjs';
import { slab } from '../sets.mjs';
import { paint } from '../materials.mjs';
import { saveImage, tile } from '../img.mjs';
import { LIGHTS } from '../light.mjs';
import { build } from '../shape.mjs';
import { buildCar } from '../car/car.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const P = Object.fromEntries(opt('pose', '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; }));
const [cw, ch] = opt('cell', '640x400').split('x').map(Number);
const [what, out] = args;
const t0 = performance.now();
let obj;
if (what === 'car') {
  const car = buildCar(), s = P.steer ?? 0, w = P.spin ?? 0;
  car.set({ door: P.door ?? 0, steer: { fl: s, fr: s }, wheel: s * 3, head: P.head ?? 0, tail: P.tail ?? 0, wheels: { fl: w, fr: w, rl: w, rr: w } });
  obj = { group: car.group, shell: car.obj.group, triangles: car.obj.triangles, digest: car.obj.digest };   // (framed by its parts, not its ground shadow)
} else {
  obj = build((await import(pathToFileURL(path.resolve(what)).href)).default());
  obj.pose(P);
}
const tris = Object.values(obj.triangles).reduce((a, b) => a + b, 0);
console.log(`${path.basename(what)}: built in ${(performance.now() - t0).toFixed(0)} ms, ${tris} triangles, digest ${obj.digest} (${Object.entries(obj.triangles).map(([k, v]) => `${k} ${v}`).join(', ')})`);

const stage = await createStage({ width: cw, height: ch });
const { THREE } = stage;
stage.scene.add(obj.group);
obj.group.updateMatrixWorld(true);
const bb = new THREE.Box3().setFromObject(obj.shell ?? obj.group), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
obj.group.position.x -= c.x; obj.group.position.z -= c.z;
stage.scene.background = new THREE.Color(0x8f9ab8);
stage.scene.add(slab(60, 0.2, 60, paint({ color: 0xcdb48e, mottle: 0.08, mottleScale: 1.5, rim: 0 }), [0, -0.1, 0]));
const G = LIGHTS.golden, R = Math.max(Math.hypot(size.x, size.z) * 0.525, size.y * 0.7);
stage.setLight({ ...G, sky: { ...G.sky, power: 0.5 }, shade: { ...G.shade, power: 0.6 }, ground: { ...G.ground, power: 0.3 } });
stage.setSun({ dir: [0.55, -0.42, -0.72], center: [0, c.y, 0], extent: R * 1.8, depth: 30 });
stage.look.ink.value = 0.9;
const fov = 26, dist = R / Math.tan(fov / 2 * Math.PI / 180) * 1.08, cy = size.y * 0.47;
const views = [...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ az: i * 45, el: 12 })), { az: 30, el: 55 }, { az: 210, el: 80 }, { az: 35, el: 1.5, low: true }, { az: 235, el: 1.5, low: true }];
const cells = [];
for (const v of views) {
  const a = v.az * Math.PI / 180, e = v.el * Math.PI / 180, d = v.low ? dist * 0.9 : dist;
  stage.setCamera({ pos: [Math.sin(a) * d * Math.cos(e), v.low ? size.y * 0.2 : cy + d * Math.sin(e), Math.cos(a) * d * Math.cos(e)], target: [0, v.low ? size.y * 0.42 : cy, 0], fov });
  cells.push(await stage.render(0));
}
const s = tile(cells, cw, ch, 4);
saveImage(out, s.px, s.w, s.h);
stage.close();
console.log('wrote', out);
