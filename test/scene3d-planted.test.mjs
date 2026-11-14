// Planted feet and paws do not slide in Scene Zero (engine/scene3d/checks.mjs). Posing only: no GPU.
//   node --test test/scene3d-planted.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const [{ openScene }, { feetSlide, pawSlide }, { default: zero }] = no3d ? [{}, {}, {}] : await Promise.all([
  import('../engine/scene3d/index.mjs'),
  import('../engine/scene3d/checks.mjs'),
  import('../engine/scene3d/scenes/zero.mjs'),
]);

const src = no3d ? null : await openScene(zero, { width: 64, height: 36 });

for (const who of ['man', 'girl']) {
  test(`${who}: a planted foot stays where it was put`, { skip: no3d }, () => {
    const r = feetSlide(src, who);
    assert.ok(r.n > 100, `${r.n} planted foot-frames checked`);
    assert.ok(r.worst < 1e-5, `largest movement of a planted sole between frames: ${(r.worst * 1000).toFixed(3)} mm at ${r.at.toFixed(2)} s`);
  });
}

test('cat: a planted paw stays within 2 mm', { skip: no3d }, () => {
  const r = pawSlide(src, 'cat');
  assert.ok(r.n > 500, `${r.n} planted paw-frames checked`);
  assert.ok(r.worst < 2e-3, `largest movement of a planted paw between frames: ${(r.worst * 1000).toFixed(3)} mm (paw ${r.paw} at ${r.at.toFixed(2)} s)`);
});

test('none of it started a GPU', { skip: no3d }, () => {
  assert.equal(typeof GPUBufferUsage, 'undefined');
  assert.equal(globalThis.navigator?.gpu, undefined);
});
