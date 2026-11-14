// The character format (docs/scene3d-characters.md): the cast follows it, a broken description says what is
// wrong, and the springy parts are a pure function of time. Building and posing only: no GPU.
//   node --test test/scene3d-bodies.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const [{ buildCharacter, STANDARD }, { createBiped }, { createPerformer }, { man }, { girl }, { cat }] = no3d ? [{}, {}, {}, {}, {}, {}] : await Promise.all([
  import('../engine/scene3d/character.mjs'),
  import('../engine/scene3d/biped.mjs'),
  import('../engine/scene3d/performer.mjs'),
  import('../engine/scene3d/cast/man.mjs'),
  import('../engine/scene3d/cast/girl.mjs'),
  import('../engine/scene3d/cast/cat.mjs'),
]);

const flip = (n) => n.replace(/L$/, 'R');

for (const desc of no3d ? [{ name: 'man' }, { name: 'girl' }, { name: 'cat' }] : [man, girl, cat]) {
  test(`${desc.name}: has the standard joints of a ${desc.kind}, and builds`, { skip: no3d }, () => {
    for (const n of STANDARD[desc.kind]) for (const m of [n, flip(n)]) assert.ok(desc.joints[m], `joint ${m}`);
    const ch = buildCharacter(desc);
    for (const [part, n] of Object.entries(ch.triangles)) assert.ok(n > 1000, `${part}: ${n} triangles`);
  });
}

test('the people have fingers, a face and hair', { skip: no3d }, () => {
  for (const desc of [man, girl]) {
    const ch = buildCharacter(desc);
    for (const f of ['thumb1L', 'index1L', 'index2L', 'middle1R', 'pinky2R']) assert.ok(ch.bones[f], `${desc.name}: ${f}`);
    assert.ok(ch.extras.eyeL && ch.extras.eyeR && ch.extras.browL, `${desc.name}: eyes and brows`);
    assert.ok(ch.meshes.hair, `${desc.name}: hair`);
  }
});

// A brow is bent onto the forehead: the gap under each end of it (the outer fifth) is under 0.22 of its thickness
// (bent: the man 4.1 mm, the girl 1.3 mm; a straight bar of the same size: 8.2 and 2.3 mm, and it floats in profile).
test('the brows lie on the head', { skip: no3d }, async () => {
  const { compileShape } = await import('../engine/scene3d/sdf.mjs');
  for (const desc of [man, girl]) {
    const ch = buildCharacter(desc); ch.group.updateMatrixWorld(true);
    const f = compileShape(desc.parts.find((p) => p.name === 'skin').ops).f, b = ch.extras.browL, P = b.geometry.attributes.position, L = desc.face.brows.size[0] / 2;
    for (const end of [1, -1]) {
      let gap = Infinity;
      for (let i = 0; i < P.count; i++) if (P.getX(i) * end > 0.8 * L) { const v = b.localToWorld(b.position.clone().set(P.getX(i), P.getY(i), P.getZ(i))); gap = Math.min(gap, f(v.x, v.y, v.z)); }
      assert.ok(gap < 0.22 * desc.face.brows.size[1], `${desc.name}: an end of the brow stands ${(gap * 1000).toFixed(1)} mm off the skin`);
    }
  }
});

test('a broken description says what is wrong', { skip: no3d }, () => {
  const { thighR, ...joints } = girl.joints;
  assert.throws(() => buildCharacter({ ...girl, joints }), /needs the joint "thighR"/);
  assert.throws(() => buildCharacter({ ...girl, kind: 'snake' }), /kind must be "biped" or "quadruped"/);
  const parts = girl.parts.map((p) => (p.name === 'shoes' ? { ...p, ops: [{ type: 'ell', c: [0, 0, 0], r: [0.1, 0.1, 0.1], bone: 'heelL' }] } : p));
  assert.throws(() => buildCharacter({ ...girl, parts }), /tied to "heelL", which is not a joint/);
  const ch = buildCharacter(girl);
  assert.throws(() => ch.face.set({ expr: { cross: 1 } }), /no expression "cross"/);
  assert.throws(() => ch.face.set({ mouth: { grin: 1 } }), /no mouth shape "grin"/);
});

// The buns, the skirt, the quiff and the belly follow late on springs stepped from t = 0. Asking for the frames
// in any order, in a fresh performer or not, must give the same bones.
test('loose parts are a pure function of time', { skip: no3d }, () => {
  const read = (ch, names) => names.map((n) => [...ch.bones[n].matrix.elements, ...ch.bones[n].matrixWorld.elements].map((v) => v.toFixed(9)).join()).join('|');
  for (const [desc, names] of [[girl, ['bunL', 'bunR', 'skirt']], [man, ['belly', 'quiff']]]) {
    const ch = buildCharacter(desc), rig = createBiped(ch);
    const plan = () => { const a = createPerformer(rig, { at: [0, 0] }); const t = a.run({ t0: 0.3, to: [0, 2.5] }); a.jump({ t0: t + 0.3, height: 0.15 }); return a; };
    const fresh = plan(); fresh.apply(2.2); const want = read(ch, names);
    const busy = plan(); for (const t of [3.9, 0.7, 2.9, 1.4]) busy.apply(t); busy.apply(2.2);
    assert.equal(read(ch, names), want, `${desc.name}: frame 2.2 s after other frames`);
    plan().apply(0); const still = read(ch, names); fresh.apply(2.2);
    assert.notEqual(still, want, `${desc.name}: the parts moved`);
  }
});
