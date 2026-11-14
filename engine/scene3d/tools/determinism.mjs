// Same input, same picture: render the given frames in separate processes, once more
// in reverse order, and compare hashes of the raw pixels.
//   node engine/scene3d/tools/determinism.mjs engine/scene3d/scenes/zero.mjs 30,100,200 [1280x720] [blur]
// blur: none, vector or moments:N for every frame (default: what each shot chooses).
// With a fifth argument "child" it is one of those processes: it prints {frame: hash}.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [sceneFile, list, size = '1280x720', blur = 'shot', child] = process.argv.slice(2);
const frames = list.split(',').map(Number);
if (child) {
  const { open } = await import('./scene.mjs');
  const src = await open(sceneFile, size, blur === 'shot' ? {} : { blur });
  const out = {};
  for (const f of frames) out[f] = crypto.createHash('sha256').update(await src.pixels(f / src.fps)).digest('hex');
  console.log(JSON.stringify(out));
  src.close();
} else {
  const run = (order) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), sceneFile, order.join(','), size, blur, 'child'], { encoding: 'utf8' }).trim().split('\n').pop());
  const a = run(frames), b = run(frames), c = run([...frames].reverse());
  let same = true;
  console.log(`scene ${sceneFile}, ${size}, blur ${blur}, frames ${frames.join(', ')}`);
  console.log('sha256 of the raw RGBA pixels of each frame:');
  for (const f of frames) {
    const ok = a[f] === b[f] && a[f] === c[f]; same &&= ok;
    console.log(`frame ${f}\n  process 1 (order ${frames.join(',')}):          ${a[f]}\n  process 2 (order ${frames.join(',')}):          ${b[f]}\n  process 3 (reverse order ${[...frames].reverse().join(',')}): ${c[f]}\n  ${ok ? 'IDENTICAL' : 'DIFFERENT'}`);
  }
  console.log(same ? 'RESULT: identical in every process and in either order.' : 'RESULT: NOT identical.');
  process.exitCode = same ? 0 : 1;
}
