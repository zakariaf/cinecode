// The library pieces of the 3D engine: the shape language (shape.mjs) and its props, the car (car/), the place
// "home" (home/). They build with no GPU, the same meshes in fresh processes, the car rolls without skating and is a
// pure function of time, the house's door too, the house has every anchor and camera its docs name, and a film can
// cut between its inside and its outside.
//   node --test test/scene3d-pieces.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../engine/scene3d/', import.meta.url);
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const noGpu = () => typeof GPUBufferUsage === 'undefined' && globalThis.navigator?.gpu === undefined
  && !process.report.getReport().sharedObjects.some(f => /webgpu|dawn/i.test(f));
const mod = f => import(new URL(f, ROOT));
const PROPS = ['props/chair.mjs', 'props/armchair.mjs', 'props/mailbox.mjs'];
const HOUSE = ['wingFront', 'windowSeat', 'lantern', 'chimney', 'doorstep'];

// Same program, same mesh: each piece built in two fresh processes from scratch (no mesh cache) and once from the
// cache gives the same digest (sha256 over every part's name, placement, joint, points, normals and triangles).
test('the shape pieces give the same meshes in fresh processes, with and without the cache', { skip: no3d }, () => {
  const code = `const { build } = await import(${JSON.stringify(new URL('shape.mjs', ROOT).href)});
    const parts = await import(${JSON.stringify(new URL('home/parts.mjs', ROOT).href)}), out = {};
    for (const f of ${JSON.stringify(PROPS)}) out[f] = build((await import(new URL(f, ${JSON.stringify(ROOT.href)}))).default()).digest;
    for (const n of ${JSON.stringify(HOUSE)}) out[n] = build(parts[n]()).digest;
    const { buildCar } = await import(${JSON.stringify(new URL('car/car.mjs', ROOT).href)}), car = buildCar();
    out.car = car.obj.digest; out.carTriangles = car.triangles;
    console.log(JSON.stringify(out));`;
  const run = nocache => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, ...(nocache && { SHAPE_NOCACHE: '1' }) } }).trim().split('\n').pop());
  const a = run(true), b = run(true), c = run(false);
  assert.deepEqual(b, a, 'two builds from scratch');
  assert.deepEqual(c, a, 'and one from the cache');
  assert.ok(a.carTriangles < 120000, `the car is ${a.carTriangles} triangles`);
});

test('the pieces build and pose with no GPU; a hinge and the marks are where the prop says', { skip: no3d }, async () => {
  const { build } = await mod('shape.mjs');
  const mb = build((await mod('props/mailbox.mjs')).default());
  assert.deepEqual(Object.keys(mb.joints).sort(), ['flag', 'flap']);
  mb.pose({ flap: 1, flag: 1 });
  for (const [name, n] of Object.entries(mb.triangles)) assert.ok(n > 20 && n < 100000, `${name}: ${n} triangles`);
  const { buildCar } = await mod('car/car.mjs');
  const car = buildCar();
  assert.ok(car.joints.door && car.joints.wheel_fl && car.joints.steer_fl && car.marks['body.seat'], 'door, wheels, steering, the seat mark');
  car.set({ door: 1, steer: { fl: 0.3, fr: 0.3 }, wheels: { fl: 1, fr: 1, rl: 1, rr: 1 }, head: 1, tail: 1 });
  const { openScene } = await mod('index.mjs');
  process.env.HOME_CAR = process.env.HOME_CAST = '1';
  const src = await openScene((await mod('scenes/home.mjs')).default, { width: 64, height: 36 });
  delete process.env.HOME_CAR; delete process.env.HOME_CAST;
  for (const t of [0, 3, 9, 12]) src.built.update(t);
  src.close();
  assert.ok(noGpu(), 'no GPU after building the car and the house');
});

// The car rolls: the point of each tyre touching the road stands still (the hub's velocity plus the wheel's spin
// crossed with the radius down to the road), along the way it rolls and across it, at 240 Hz over a drive with a
// bend and a stop.
test('the car\'s wheels do not skate', { skip: no3d }, async () => {
  const THREE = await import('three/webgpu');
  const { createCar } = await mod('car/drive.mjs');
  const { CAR } = await mod('car/car.mjs');
  const car = createCar({ at: [24, -13.8], yaw: -Math.PI / 2 });
  const stop = car.driveTo([[16, -13.8], [10.8, -13.4], [7.1, -9.6], [6.5, -5.4]], { speed: 6, rolling: true });
  const end = car.where(stop + 1), p = car.poseAt(stop + 1);
  assert.ok(Math.hypot(end[0] - 6.5, end[1] + 5.4) < 0.005 && p.steer.fl === 0 && p.wheel === 0, `it stops on its last mark (${end}), its wheels straight`);
  const names = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'], dt = 1 / 240;
  const read = t => { car.apply(t); car.group.updateMatrixWorld(true); return names.map(n => { const g = car.mesh.parts[n].parent; return { p: g.getWorldPosition(new THREE.Vector3()), q: g.getWorldQuaternion(new THREE.Quaternion()) }; }); };
  let prev = read(0), along = 0, across = 0, vmax = 0;
  for (let t = dt; t <= stop + 0.5; t += dt) {
    const cur = read(t);
    names.forEach((n, k) => {
      const v = cur[k].p.clone().sub(prev[k].p).divideScalar(dt);
      const dq = cur[k].q.clone().multiply(prev[k].q.clone().invert()); if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
      const w = new THREE.Vector3(dq.x, dq.y, dq.z), ang = 2 * Math.atan2(w.length(), dq.w); if (w.lengthSq() > 0) w.normalize().multiplyScalar(ang / dt);
      const vc = v.clone().add(w.clone().cross(new THREE.Vector3(0, -CAR.wheelR, 0)));
      const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(car.group.getWorldQuaternion(new THREE.Quaternion()));
      if (k < 2) axle.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.poseAt(t).steer[n.slice(-2)]);
      across = Math.max(across, Math.abs(vc.dot(axle))); along = Math.max(along, vc.clone().sub(axle.clone().multiplyScalar(vc.dot(axle))).length());
      vmax = Math.max(vmax, v.length());
    });
    prev = cur;
  }
  assert.ok(vmax > 5, `it drives (${vmax.toFixed(2)} m/s)`);
  assert.ok(along < 0.01 && across < 0.01, `contact points: along ${(along * 1000).toFixed(2)} mm/s, across ${(across * 1000).toFixed(2)} mm/s`);
});

test('the car and the house\'s door are pure functions of time', { skip: no3d }, async () => {
  const { createCar } = await mod('car/drive.mjs');
  const make = () => {
    const car = createCar({ at: [-15, 1.7], yaw: Math.PI / 2 });
    car.engine(true, { t0: 0 });
    const stop = car.driveTo([[-7.5, 1.7], [-2.2, 1.0], [0.8, -3.0], [1.5, -5.6], [2.3, -8.1]], { t0: 0, speed: 6, rolling: true });
    car.engine(false, { t0: stop + 0.7 }); car.door(1, { t0: stop + 1.6, dur: 0 }); car.door(0, { t0: stop + 2 });
    return car;
  };
  const ts = [0.5, 3.1, 6.2, 7.0, 8.3, 9.1, 12];
  const a = make(), b = make(), state = car => { car.group.updateMatrixWorld(true); const out = []; car.group.traverse(o => out.push(...o.matrixWorld.elements.map(v => +v.toFixed(9)))); return out; };
  const fwd = ts.map(t => (a.apply(t), state(a))), back = [...ts].reverse().map(t => (b.apply(t), state(b))).reverse();
  assert.deepEqual(back, fwd, 'every matrix of the car at a time, posed in either order');
  assert.ok(fwd[3].some((v, i) => v !== fwd[2][i]), 'and it moves');
  const { doorSwing } = await mod('home/home.mjs');
  const swing = doorSwing([{ t: 0.5, to: 0.85 }, { t: 3.2, to: 0 }]);
  const v = [1, 2, 3.5, 4, 7].map(swing);
  assert.deepEqual([7, 4, 3.5, 2, 1].map(swing).reverse(), v);
  assert.ok(v[0] > 0.8 && [4.1, 5, 6, 8, 60].every(t => swing(t) === 0), `it flings open and latches shut (${v.map(x => x.toFixed(3))})`);
});

test('the house has every anchor and camera home/README names, clear of its doors', { skip: no3d }, async () => {
  const { KITS } = await mod('library.mjs');
  const K = KITS.home;
  const anchors = ['centre', 'rug', 'sofa', 'window_seat', 'window', 'hall', 'door_inside', 'door', 'step', 'path', 'gate', 'lawn', 'pavement', 'street_left', 'street_right', 'drive', 'drive_door'];
  const cameras = ['room_wide', 'window', 'window_seat_out', 'behind_milo', 'to_door', 'hall', 'lawn_wide', 'street', 'door_close', 'window_in', 'drive', 'car_door', 'scale', 'step_out'];
  for (const a of anchors) {
    const p = K.anchors[a];
    assert.ok(p && p.every(Number.isFinite), `anchor ${a}`);
    assert.ok(p[0] >= K.floor.x0 && p[0] <= K.floor.x1 && p[1] >= K.floor.z0 && p[1] <= K.floor.z1, `${a} is on the floor`);
    assert.equal(K.heightAt(...p) > 0, a === 'sofa' || a === 'window_seat', `${a}: what stands there`);
  }
  for (const c of cameras) assert.ok(K.cameras[c] && ['inside', 'outside'].includes(K.side(c)), `camera ${c}`);
  assert.deepEqual(Object.keys(K.areas).sort(), ['inside', 'outside']);
  // the front door's leaf passes at least half a metre from door_inside at every pose (knee height)
  const THREE = await import('three/webgpu');
  const { build } = await mod('shape.mjs'), { wingFront, D } = await mod('home/parts.mjs'), { HOME } = await mod('home/home.mjs');
  const wing = build(wingFront()); wing.group.rotation.y = Math.PI; wing.group.position.set((HOME.wing.x0 + HOME.wing.x1) / 2, 0, HOME.front - 0.06 + D.wall / 2);
  const leaf = wing.parts.door.children[0], di = K.anchors.door_inside, v = new THREE.Vector3();
  let near = Infinity;
  for (let k = 0; k <= 20; k++) {
    wing.pose({ door: k / 20 }); wing.group.updateMatrixWorld(true);
    const pos = leaf.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(leaf.matrixWorld); if (Math.abs(v.y - 0.5) < 0.1) near = Math.min(near, Math.hypot(v.x - di[0], v.z - di[1])); }
  }
  assert.ok(near > 0.45, `the leaf comes ${near.toFixed(2)} m from door_inside`);
  // the arched leaf hangs behind the wall and laps the doorway: at no pose is any of it inside the wall's thickness
  // (hung in the arch's depth, its top corner turned through the arch as it swung), and shut it covers the opening
  const own = build(wingFront()), ownLeaf = own.parts.door.children[0], inv = new THREE.Matrix4();
  let deepest = -Infinity, x0 = Infinity, x1 = -Infinity, top = -Infinity;
  for (let k = 0; k <= 20; k++) {
    own.pose({ door: k / 20 }); own.group.updateMatrixWorld(true); inv.copy(own.group.matrixWorld).invert();
    const pos = ownLeaf.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(ownLeaf.matrixWorld).applyMatrix4(inv);       // (in the wing's own frame: +z is the street)
      deepest = Math.max(deepest, v.z + D.wall / 2);
      if (k === 0) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); top = Math.max(top, v.y); }
    }
  }
  assert.ok(deepest < 0, `the leaf reaches ${(deepest * 1000).toFixed(1)} mm into the wall`);
  assert.ok(x1 - x0 > D.doorW + 0.02 && top > own.group.children[0].position.y + D.doorH + 0.01, `shut, it laps the doorway (${(x1 - x0).toFixed(3)} m wide)`);
  // the car parked on the drive: its open driver's door stays off the fence and clear of drive_door
  const { createCar } = await mod('car/drive.mjs');
  const car = createCar({ at: K.anchors.drive, yaw: 0 });
  car.door(1, { t0: 0, dur: 0 }); car.apply(1); car.group.updateMatrixWorld(true);
  const door = car.mesh.parts.door.children[0], dp = door.geometry.attributes.position, dd = K.anchors.drive_door;
  let xMax = -Infinity, toMan = Infinity;
  for (let i = 0; i < dp.count; i += 5) { v.fromBufferAttribute(dp, i).applyMatrix4(door.matrixWorld); xMax = Math.max(xMax, v.x); toMan = Math.min(toMan, Math.hypot(v.x - dd[0], v.z - dd[1])); }
  assert.ok(xMax < HOME.fence.x - 0.2 && toMan > 0.6, `the open door reaches x ${xMax.toFixed(2)} (fence ${HOME.fence.x}) and comes ${toMan.toFixed(2)} m from drive_door`);
});

test('a film cuts between the house\'s inside and outside; an area the kit lacks fails by name', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { compileScene } = await mod('compile.mjs');
  const { openScene } = await mod('index.mjs');
  const j = {
    title: 'Home', format: { width: 1920, height: 1080, fps: 24, engine: '3d' },
    cast: { man: { rig: 'man', name: 'Dad' } },
    sets: { in: { kit: 'home', area: 'inside' }, out: { kit: 'home', area: 'outside' } },
    scenes: [
      { id: 's01', set: 'in', time: 'golden', actors: { man: { at: 'rug', face: 'right' } }, shots: [{ id: 's01-01', camera: { size: 'wide', on: ['man'] }, beats: [{ do: 'walk', who: 'man', to: 'hall', at: 0 }] }] },
      { id: 's02', set: 'out', time: 'twilight', transition: 'cut', actors: { man: { at: 'path', face: 'left' } }, shots: [{ id: 's02-01', camera: { size: 'full', on: ['man'] }, beats: [{ do: 'walk', who: 'man', to: 'step', at: 0 }] }] },
    ],
  };
  const plan = compile(await loadFilm(j, { dir: process.cwd() }));
  const src = await openScene(compileScene(plan), { width: 64, height: 36 });
  const [a, b] = src.built.scenes, cam = sc => { const t = (sc.t0 + sc.t1) / 2; src.built.update(t); return sc.camera(t - sc.t0).pos; };
  assert.deepEqual([a.area, b.area], ['inside', 'outside']);
  assert.ok(cam(a)[2] > -2.2 && cam(b)[2] < -2.6, `the inside is filmed from the room (${cam(a)}), the outside from the garden (${cam(b)})`);
  assert.equal(src.stage.light.sun.el, 3, 'the twilight outside is lit as the place lights it');
  src.close();
  const bad = structuredClone(j); bad.sets.out.area = 'garage';
  await assert.rejects(loadFilm(bad, { dir: process.cwd() }), e => e.problems.some(p => /^sets\.out\.area: the kit "home" has the areas inside, outside \(got "garage"\)$/.test(p.message)) || assert.fail(e.problems.map(p => p.message).join('\n')));
});
