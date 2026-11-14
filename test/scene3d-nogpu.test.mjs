// The 3D engine (engine/scene3d) keeps its GPU behind one file, host-node.mjs. Everything else (characters, rigs,
// performers, the stage, the scene files) must load, build and pose with no GPU device, so plans and motion checks
// run on any machine.
//   node --test test/scene3d-nogpu.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../engine/scene3d/', import.meta.url);
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
// no WebGPU globals (the host installs them), no device on navigator, and Dawn's binary was never loaded
const noGpu = () => typeof GPUBufferUsage === 'undefined' && globalThis.navigator?.gpu === undefined
  && !process.report.getReport().sharedObjects.some(f => /webgpu|dawn/i.test(f));

test('every scene3d module but the host imports without starting a GPU', { skip: no3d }, async () => {
  const files = ['', 'cast/', 'scenes/', 'car/', 'home/', 'props/'].flatMap(d => readdirSync(fileURLToPath(new URL(d, ROOT))).filter(f => f.endsWith('.mjs') && f !== 'host-node.mjs').map(f => d + f));
  assert.ok(files.includes('performer.mjs') && files.includes('stage.mjs') && files.includes('scenes/zero.mjs'), 'the modules are where API.md says');
  for (const f of files) await import(new URL(f, ROOT));
  assert.ok(noGpu(), 'no GPU after importing ' + files.join(', '));
});

test('Scene Zero opens and poses with no GPU', { skip: no3d }, async () => {
  const { openScene } = await import(new URL('index.mjs', ROOT));
  const src = await openScene((await import(new URL('scenes/zero.mjs', ROOT))).default, { width: 64, height: 36 });
  assert.deepEqual(Object.keys(src.built.cast), ['man', 'girl', 'cat']);
  const head = t => { src.built.update(t); return src.built.cast.man.ch.bones.head.getWorldPosition(new src.stage.THREE.Vector3()).toArray(); };
  const a = head(1), b = head(5);
  assert.ok([...a, ...b].every(Number.isFinite), 'the man is posed');
  assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) > 1, 'and has walked between 1 s and 5 s');
  assert.deepEqual(head(1), a, 'the pose at a time does not depend on what was posed before');
  src.close();
  assert.ok(noGpu(), 'no GPU after building and posing');
});

test('the mesh cache is kept per version of the meshing code, and an old version is cleared out', { skip: no3d }, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cc3d-')), root = join(tmp, 'cinecode-scene3d');
  mkdirSync(join(root, 'old'), { recursive: true }); writeFileSync(join(root, 'old', 'a.bin'), ''); writeFileSync(join(root, 'legacy.bin'), '');
  const code = createHash('sha1').update(readFileSync(new URL('sdf.mjs', ROOT))).digest('hex').slice(0, 12);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `const { cached } = await import(${JSON.stringify(new URL('sdf.mjs', ROOT).href)});
    let n = 0; const a = cached({ t: 1 }, () => (n++, { p: new Float32Array([1, 2]) })), b = cached({ t: 1 }, () => (n++, { p: new Float32Array([3]) }));
    console.log(JSON.stringify({ n, a: [...a.p], b: [...b.p] }));`], { env: { ...process.env, TMPDIR: tmp }, encoding: 'utf8' });
  try {
    assert.deepEqual(JSON.parse(out), { n: 1, a: [1, 2], b: [1, 2] }, 'built once, then read back');
    assert.deepEqual(readdirSync(root), [code], 'one folder, named by sdf.mjs');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
