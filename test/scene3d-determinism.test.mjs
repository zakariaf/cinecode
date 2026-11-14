// The 3D picture is the same on every run on this machine: frames of Scene Zero rendered in two fresh processes
// have the same bytes. Needs a GPU; skipped when the webgpu package or an adapter is missing.
//   node --test test/scene3d-determinism.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const at = p => fileURLToPath(new URL('../engine/scene3d/' + p, import.meta.url));
const gpu = spawnSync(process.execPath, ['--input-type=module', '-e', `process.exit((await (await import(${JSON.stringify(new URL('../engine/scene3d/host-node.mjs', import.meta.url).href)})).hasAdapter()) ? 0 : 1)`], { stdio: 'ignore' }).status === 0;
const skip = gpu ? false : 'no WebGPU adapter on this machine';

test('frames 30, 100 and 200 of Scene Zero at 1280x720 hash the same in two fresh processes', { skip }, async () => {
  const run = () => new Promise((res, rej) => execFile(process.execPath, [at('tools/determinism.mjs'), at('scenes/zero.mjs'), '30,100,200', '1280x720', 'shot', 'child'],
    { encoding: 'utf8' }, (e, out) => (e ? rej(e) : res(JSON.parse(out.trim().split('\n').pop())))));
  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual(Object.keys(a), ['30', '100', '200']);
  for (const f of [30, 100, 200]) assert.match(a[f], /^[0-9a-f]{64}$/);
  assert.equal(new Set(Object.values(a)).size, 3, 'three different frames');
  assert.deepEqual(a, b);
});

test('pixels(t) gives width x height RGBA bytes, opaque, and close() lets the process end', { skip }, async () => {
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const W = 320, H = 180;
  const src = await openScene((await import('../engine/scene3d/scenes/zero.mjs')).default, { width: W, height: H });
  const px = await src.pixels(5);
  src.close();
  assert.equal(px.length, W * H * 4);
  let r = 0, b = 0, opaque = true;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; b += px[i + 2]; opaque &&= px[i + 3] === 255; }
  assert.ok(opaque, 'alpha is 255 everywhere');
  assert.ok(r > b * 1.15, `a warm evening room has more red than blue (red ${(r / (W * H)).toFixed(0)}, blue ${(b / (W * H)).toFixed(0)}): the bytes are RGBA, not BGRA`);
});
