// Motion blur in the 3D picture. With no GPU: which moments of the shutter a frame is posed at (they stay inside
// the shot, so the blur never reaches across a cut). With a GPU: a blurred frame is the same in two fresh processes.
//   node --test test/scene3d-picture-blur.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const at = p => fileURLToPath(new URL('../engine/scene3d/' + p, import.meta.url));
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const gpu = spawnSync(process.execPath, ['--input-type=module', '-e', `process.exit((await (await import(${JSON.stringify(new URL('../engine/scene3d/host-node.mjs', import.meta.url).href)})).hasAdapter()) ? 0 : 1)`], { stdio: 'ignore' }).status === 0;
const skip = gpu ? false : 'no WebGPU adapter on this machine';

// a scene that only records the times it is posed at; stage.render is replaced, so no GPU starts
async function posedAt(t, { shot, blur } = {}) {
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const times = [];
  const src = await openScene({ fps: 24, duration: 10, build: () => ({ update: (x) => times.push(x), ...(shot && { shot: () => shot }) }) }, { width: 64, height: 36, blur });
  let mode;
  src.stage.render = async (frame, o) => {
    mode = o.blur;
    if (o.blur === 'vector') { o.pose(-o.shutter); o.pose(0); }
    else if (o.blur.startsWith('moments:')) { const n = Number(o.blur.slice(8)); for (let i = 0; i < n; i++) o.pose(((i + 0.5) / n - 0.5) * o.shutter); }
    else o.pose(0);
  };
  await src.pixels(t);
  src.close();
  return { mode, times };
}

test('a frame is posed inside its shot: the vector pose half a frame before, or after when the shot has just begun', { skip: no3d }, async () => {
  const s = 0.5 / 24, near = (a, b) => assert.ok(a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9), `${a} vs ${b}`);
  let r = await posedAt(5);
  assert.equal(r.mode, 'vector', 'a scene without shots blurs by vector');
  near(r.times, [5 - s, 5]);
  r = await posedAt(2.001, { shot: { blur: 'vector', t0: 2, t1: 4 } });
  near(r.times, [2.001 + s, 2.001]);
  r = await posedAt(3.99, { shot: { blur: 'moments:4', t0: 2, t1: 4 } });
  assert.equal(r.mode, 'moments:4');
  assert.ok(r.times.every((x) => x >= 2 && x < 4), `${r.times}`);
  r = await posedAt(3, { shot: { blur: 'moments:4', t0: 2, t1: 4 }, blur: 'none' });
  assert.equal(r.mode, 'none', 'openScene({ blur }) overrides the shot');
  near(r.times, [3]);
});

test('vector and moments:2 blur: frame 40 of Scene Zero hashes the same in two fresh processes, and differs from no blur', { skip }, async () => {
  const run = (blur) => new Promise((res, rej) => execFile(process.execPath, [at('tools/determinism.mjs'), at('scenes/zero.mjs'), '40', '640x360', blur, 'child'],
    { encoding: 'utf8' }, (e, out) => (e ? rej(e) : res(JSON.parse(out.trim().split('\n').pop())[40]))));
  const [v1, v2, m1, m2, none] = await Promise.all([run('vector'), run('vector'), run('moments:2'), run('moments:2'), run('none')]);
  assert.equal(v1, v2);
  assert.equal(m1, m2);
  assert.notEqual(v1, none, 'the man walking at frame 40 is blurred');
  assert.notEqual(m1, none);
});
