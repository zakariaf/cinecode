// The 3D picture's light and tone. The light of a shot is a row of numbers (engine/scene3d/light.mjs); every row
// must be complete and take on a stage with no GPU. With a GPU, a frame of Scene Zero must keep its tone (real
// darks, none crushed, contrast, little clipped) and the dust in the sun must last a long film.
//   node --test test/scene3d-picture.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const gpu = spawnSync(process.execPath, ['--input-type=module', '-e', `process.exit((await (await import(${JSON.stringify(new URL('../engine/scene3d/host-node.mjs', import.meta.url).href)})).hasAdapter()) ? 0 : 1)`], { stdio: 'ignore' }).status === 0;

test('every hour in LIGHTS is complete and a stage takes it with no GPU', { skip: no3d }, async () => {
  const { LIGHTS, sunDir } = await import('../engine/scene3d/light.mjs');
  const { createStage } = await import('../engine/scene3d/stage.mjs');
  for (const name of ['morning', 'noon', 'golden', 'twilight', 'night']) assert.ok(LIGHTS[name], name);
  const stage = await createStage({ width: 64, height: 36 });
  for (const [name, L] of Object.entries(LIGHTS)) {
    for (const k of ['sun', 'sky', 'shade', 'ground', 'outdoor']) assert.ok(Number.isFinite(L[k].power) && Number.isInteger(L[k].color), `${name}.${k}`);
    for (const k of ['az', 'el']) assert.ok(Number.isFinite(L.sun[k]), `${name}.sun.${k}`);
    assert.ok(Number.isFinite(L.bounce) && Number.isFinite(L.air.density), name);
    for (const k of ['exposure', 'contrast', 'saturation', 'bloom', 'glow']) assert.ok(Number.isFinite(L.grade[k]), `${name}.grade.${k}`);
    assert.equal(L.grade.shadows.length, 3); assert.equal(L.grade.lights.length, 3);
    const d = sunDir(L.sun.az, L.sun.el);
    assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9 && d[1] < 0, `${name}: the sun shines down`);
    stage.setLight(name);
    assert.equal(stage.light, L);
  }
  stage.close();
});

// The soft shadow's search for what shades a point reaches 32 pixels of the shadow picture, but never more than 12 cm:
// over a garden (1 cm a pixel) it reached 32 cm, mixed a beard with a tree's crown in one estimate, and drew ragged,
// stippled blotches on a shirt ("Dad's Home" 3.1); in a room it is unchanged.
test('a soft shadow\'s widest edge is 12 cm over a garden and 32 pixels in a room', { skip: no3d }, async () => {
  const { createStage } = await import('../engine/scene3d/stage.mjs');
  const { shadowUniforms } = await import('../engine/scene3d/materials.mjs');
  const stage = await createStage({ width: 64, height: 36 });
  stage.setLight('golden');
  stage.setSun({ box: [[-16, -0.1, -21], [20, 9, 4]], depth: 8 });
  const yard = { r: shadowUniforms.maxRadius.value, cm: shadowUniforms.maxRadius.value * shadowUniforms.texel.value * 100 };
  stage.setSun({ box: [[-4.9, 0, -2.6], [2.9, 2.9, 6.3]], depth: 14 });
  const room = shadowUniforms.maxRadius.value;
  stage.close();
  assert.ok(yard.r < 32 && Math.abs(yard.cm - 12) < 0.01, `garden: ${yard.r.toFixed(1)} px, ${yard.cm.toFixed(2)} cm`);
  assert.equal(room, 32);
});

test('Scene Zero frame 222 keeps its tone: real darks without crushing, contrast, little clipped', { skip: gpu ? false : 'no WebGPU adapter on this machine' }, async () => {
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const src = await openScene((await import('../engine/scene3d/scenes/zero.mjs')).default, { width: 960, height: 540 });
  const px = await src.pixels(222 / src.fps), n = px.length / 4;
  src.close();
  let dark = 0, clip = 0, s = 0, s2 = 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    if (l < 16) dark++;
    if (Math.max(px[i], px[i + 1], px[i + 2]) >= 250) clip++;
    s += l; s2 += l * l; hist[Math.round(l)]++;
  }
  let c = 0, p1 = 0;
  while ((c += hist[p1]) < 0.01 * n) p1++;
  const rms = Math.sqrt(s2 / n - (s / n) ** 2);
  assert.ok(dark / n < 0.02, `near black ${(100 * dark / n).toFixed(2)} %`);
  assert.ok(clip / n < 0.03, `clipped ${(100 * clip / n).toFixed(2)} %`);
  assert.ok(rms >= 58, `RMS contrast ${rms.toFixed(1)} (flat under 58)`);
  assert.ok(p1 >= 15 && p1 <= 45, `1st percentile of luma ${p1} (15 to 45: real darks, none crushed)`);
});

// The dust in the sun is laid out in the openings and sinks through half a metre, fading in and out, again and
// again: a long film has as much of it at every minute as at the start (it used to sink out of the room for good
// in about 4 minutes). Counted as the pixels the specks light, with the dust shown and hidden.
test('the dust in the sun is still there at 10 and 30 minutes', { skip: gpu ? false : 'no WebGPU adapter on this machine' }, async () => {
  const { createStage } = await import('../engine/scene3d/stage.mjs');
  const { buildRoom, dustMotes } = await import('../engine/scene3d/room.mjs');
  const stage = await createStage({ width: 960, height: 540, rays: true });
  buildRoom(stage);
  const dust = dustMotes(stage); stage.air.add(dust.mesh);
  stage.setCamera({ pos: [0.12, 1.42, 7.45], target: [0.12, 1.12, 0], fov: 25 });
  const lit = [];
  for (const t of [0, 600, 1800]) {
    dust.update(t);
    dust.mesh.visible = true; const a = Buffer.from(await stage.render(0));
    dust.mesh.visible = false; const b = await stage.render(0);
    let k = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) k++;
    lit.push(k);
  }
  stage.close();
  assert.ok(lit[0] >= 50, `dust at the start: ${lit[0]} pixels`);
  for (const [i, t] of [[1, 600], [2, 1800]]) assert.ok(lit[i] >= 0.6 * lit[0], `dust at ${t} s: ${lit[i]} pixels, ${lit[0]} at the start`);
});

// A speck that drifts near the lens is drawn no bigger than 1.5 mm for each metre away and fades out nearer than 2.5 m:
// one a metre from the camera came out a soft white disc like a floating ping-pong ball ("Dad's Home" 1.1). From inside
// the shaft at the window, the largest speck (the biggest patch of touching pixels the dust lights) was 143 px.
test('a dust speck near the lens stays a speck', { skip: gpu ? false : 'no WebGPU adapter on this machine' }, async () => {
  const { createStage } = await import('../engine/scene3d/stage.mjs');
  const { buildRoom, dustMotes } = await import('../engine/scene3d/room.mjs');
  const W = 960, H = 540, stage = await createStage({ width: W, height: H, rays: true });
  buildRoom(stage);
  const dust = dustMotes(stage); stage.air.add(dust.mesh);
  stage.setCamera({ pos: [-1.2, 1.2, 0.2], target: [-2.0, 1.0, -2.5], fov: 50 });
  const out = [];
  for (const t of [7, 20]) {
    dust.update(t);
    dust.mesh.visible = true; const a = Buffer.from(await stage.render(0));
    dust.mesh.visible = false; const b = await stage.render(0);
    const lit = new Uint8Array(W * H), seen = new Uint8Array(W * H), stack = [];
    let n = 0, big = 0;
    for (let i = 0; i < W * H; i++) { const j = i * 4; if (Math.abs(a[j] - b[j]) + Math.abs(a[j + 1] - b[j + 1]) + Math.abs(a[j + 2] - b[j + 2]) > 6) { lit[i] = 1; n++; } }
    for (let i = 0; i < W * H; i++) if (lit[i] && !seen[i]) {
      let k = 0; seen[i] = 1; stack.push(i);
      while (stack.length) { const p = stack.pop(), x = p % W; k++; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < W * H && lit[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }
      big = Math.max(big, k);
    }
    out.push({ t, n, big });
  }
  stage.close();
  for (const o of out) {
    assert.ok(o.n >= 40, `dust at ${o.t} s: ${o.n} pixels`);
    assert.ok(o.big <= 30, `the largest speck at ${o.t} s: ${o.big} px`);
  }
});

// three.js only logs what the GPU reports as wrong (a validation error, a lost device), and the frame came back black:
// a render of a picture wider than the GPU's textures (twice 4200 px) returned 1 MB of near-black and exited 0
test('a GPU error fails the frame instead of giving a wrong picture', { skip: gpu ? false : 'no WebGPU adapter on this machine', timeout: 120000 }, () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const { createStage } = await import(${JSON.stringify(new URL('../engine/scene3d/stage.mjs', import.meta.url).href)});
    const s = await createStage({ width: 4200, height: 64 });
    try { await s.render(0); console.log('RETURNED'); } catch (e) { console.log('THREW ' + e.message); } s.close();`], { encoding: 'utf8' });
  assert.match(r.stdout, /THREW the GPU reported an error \(GPUValidationError\): Texture size/);
});
