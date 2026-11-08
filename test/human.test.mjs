// Human rig: contract, proportions, determinism, grounding (nothing floats or sinks), gait foot planting, lip-sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvas } from '../engine/core/lib.mjs';
import rig, { POSES, GAITS, GESTURES, EXPR, skeleton, metrics, look, mixPose, sheetSection } from '../engine/cast/human.mjs';

const AGES = ['child', 'teen', 'adult', 'elder'];
const REQUIRED_POSES = ['stand', 'idle-weight-shift', 'sit-ground', 'sit-seat', 'crouch', 'kneel', 'lie', 'sleep', 'look-up', 'hands-on-hips', 'arms-crossed', 'reach-up', 'carry', 'hold-hand-out'];
const REQUIRED_GESTURES = ['wave', 'nod', 'shake-head', 'shrug', 'laugh', 'jump-for-joy', 'point', 'bow', 'gasp', 'beckon', 'clap'];
const REQUIRED_EXPR = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'sleepy', 'worried', 'laughing'];
const VARIANTS = [
  { age: 'child' }, { age: 'child', bottom: 'dress', hairStyle: 'ponytail', scarf: true },
  { age: 'teen', hairStyle: 'long', bottom: 'skirt', backpack: true }, { age: 'adult', build: 'sturdy', beard: 'full', hairStyle: 'cap' },
  { age: 'adult', build: 'slim', hairStyle: 'bun', apron: true, glasses: true }, { age: 'elder', hairStyle: 'bald', beard: 'short', hat: '#c8a85a' },
  { age: 'elder', hairStyle: 'curly', sleeves: 'short', bottom: 'shorts' },
];

// Lowest painted row in a column band (alpha > 40), with the ground shadow turned off.
function lowestPixel(draw, W = 700, H = 520) {
  const [c, x] = canvas(W, H); draw(x);
  const d = x.getImageData(0, 0, W, H).data;
  for (let y = H - 1; y >= 0; y--) for (let i = 0; i < W; i++) if (d[(y * W + i) * 4 + 3] > 40) return y;
  return -1;
}

test('rig contract fields', () => {
  assert.equal(rig.kind, 'human');
  assert.equal(typeof rig.label, 'string');
  for (const k of ['height', 'headHeight', 'width']) assert.ok(Number.isFinite(rig[k]) && rig[k] > 0, k);
  assert.ok(rig.speeds.walk > 0 && rig.speeds.run > rig.speeds.walk);
  assert.ok(rig.stride.walk > 0 && rig.stride.run > rig.stride.walk);
  assert.equal(typeof rig.params, 'object');
  for (const p of REQUIRED_POSES) assert.ok(rig.poses[p], `pose ${p}`);
  for (const g of ['walk', 'run']) assert.equal(typeof rig.gaits[g], 'function');
  for (const g of REQUIRED_GESTURES) { assert.ok(rig.gestures[g].dur > 0, g); assert.equal(typeof rig.gestures[g].at, 'function'); }
  for (const e of REQUIRED_EXPR) assert.ok(rig.expressions.includes(e), e);
  assert.equal(rig.perch, false); assert.equal(rig.flies, false);
  assert.equal(typeof rig.draw, 'function'); assert.equal(typeof rig.bbox, 'function');
});

test('poses, gait and gesture frames are plain numbers', () => {
  const frames = [...Object.values(POSES), ...[0, 0.3, 0.7].flatMap(u => [GAITS.walk(u), GAITS.run(u), ...Object.values(GESTURES).map(g => g.at(u, POSES.stand))])];
  for (const f of frames) for (const [k, v] of Object.entries(f)) assert.ok(typeof v === 'number' && Number.isFinite(v), `${k}=${v}`);
  const m = mixPose(POSES.stand, POSES.crouch, 0.5);
  assert.ok(Math.abs(m.lean - (POSES.stand.lean + POSES.crouch.lean) / 2) < 1e-9);
});

test('proportions: child is about 1.4x a sitting hare (~100 units); ages ordered; per-actor sizes', () => {
  const S = Object.fromEntries(AGES.map(a => [a, rig.sizes({ age: a })]));
  assert.ok(S.child.height > 125 && S.child.height < 160, `child ${S.child.height}`);
  assert.ok(S.child.height < S.teen.height && S.teen.height < S.adult.height, 'child < teen < adult');
  assert.ok(S.elder.height < S.adult.height, 'elder stoops');
  assert.ok(S.elder.speeds.walk < S.adult.speeds.walk, 'elder walks slower');
  assert.ok(S.child.stride.walk < S.adult.stride.walk);
  assert.ok(rig.sizes({ age: 'adult', height: 1.2 }).height > S.adult.height * 1.15, 'height multiplier');
  for (const a of AGES) assert.ok(S[a].headHeight > 30 && S[a].headHeight < 60);
});

test('bbox sanity for every pose and age, and mirroring', () => {
  for (const age of AGES) for (const [name, pose] of Object.entries(POSES)) {
    const b = rig.bbox(pose, 1, { age });
    assert.ok(b.every(Number.isFinite), `${age} ${name}`);
    assert.ok(b[0] < b[2] && b[1] < b[3], `${age} ${name} ordered`);
    if (name === 'sit-seat') { const sh = skeleton(pose, { age }).seatHeight; assert.ok(Math.abs(b[3] - sh) < 6, `${age} seat: feet ${b[3]} vs seat height ${sh}`); }
    else assert.ok(b[3] >= -1 && b[3] < 12, `${age} ${name} bottom at the contact (${b[3]})`);
    const m = rig.bbox(pose, -1, { age });
    assert.ok(Math.abs(m[0] + b[2]) < 1e-9 && Math.abs(m[2] + b[0]) < 1e-9);
  }
  const st = rig.bbox(POSES.stand, 1, { age: 'adult' }), ly = rig.bbox(POSES.lie, 1, { age: 'adult' });
  assert.ok(-st[1] > 180, 'standing adult is tall');
  assert.ok(ly[2] - ly[0] > -ly[1] * 2, 'lying adult is long and low');
  const jump = GESTURES['jump-for-joy'].at(0.5, POSES.stand);
  assert.ok(skeleton(jump, { age: 'child' }).lift > 15, 'jump lifts off');
});

test('every pose, gait phase, gesture and expression draws for every look', () => {
  const [c, x] = canvas(400, 400);
  for (const params of VARIANTS) {
    const frames = [...Object.values(POSES), GAITS.walk(0.1), GAITS.walk(0.6), GAITS.run(0.2), GAITS.run(0.45), ...Object.values(GESTURES).flatMap(g => [0.2, 0.5, 0.8].map(u => g.at(u, POSES.stand)))];
    for (const pose of frames) {
      const r = rig.draw(x, 200, 380, 1, 1, { pose, params, t: 1.7, breath: 0.3, blink: 0.2, look: -0.5, talk: 0.4, expr: 'happy' });
      for (const k of ['head', 'mouth']) assert.ok(r[k].every(Number.isFinite), k);
      assert.ok(r.bounds.every(Number.isFinite));
    }
    for (const expr of [...REQUIRED_EXPR, 'curious', 'scared', 'no-such-expr']) for (const s of [0.4, 6]) rig.draw(x, 200, 380, s, -1, { params, expr, talk: 0.7, blink: 1 });
    rig.draw(x, 200, 380, 1, 1, { params, pose: 'sit-seat', seatHeight: 30 });
  }
});

test('deterministic: the same frame renders identical pixels', () => {
  const render = () => { const [c, x] = canvas(360, 420); x.fillStyle = '#fff'; x.fillRect(0, 0, 360, 420); rig.draw(x, 180, 400, 1.6, 1, { pose: GAITS.walk(0.37), params: VARIANTS[1], t: 2.3, breath: 0.4, expr: 'happy', talk: 0.5 }); return Buffer.from(x.getImageData(0, 0, 360, 420).data); };
  assert.ok(render().equals(render()));
});

test('grounded: feet (or seat, or body) touch the contact line; nothing floats or sinks', () => {
  const Y = 470;
  for (const age of AGES) for (const name of ['stand', 'crouch', 'kneel', 'sit-ground', 'lie', 'sleep', 'reach-up', 'hands-on-hips']) {
    const low = lowestPixel(x => rig.draw(x, 350, Y, 1.5, 1, { pose: POSES[name], params: { age }, shadow: false }));
    assert.ok(Math.abs(low - Y) <= 3, `${age} ${name}: lowest pixel ${low} vs ground ${Y}`);
  }
  for (const ph of [0, 0.13, 0.25, 0.4, 0.62, 0.8]) {
    const low = lowestPixel(x => rig.draw(x, 350, Y, 1.5, 1, { pose: GAITS.walk(ph), params: { age: 'adult' }, shadow: false }));
    assert.ok(Math.abs(low - Y) <= 3, `walk ${ph}: ${low}`);
  }
  // sitting on a seat: the seat surface is the contact; the feet reach the ground seatHeight below
  for (const age of ['teen', 'adult']) {
    const seatHeight = 50, low = lowestPixel(x => rig.draw(x, 350, 300, 1.5, 1, { pose: POSES['sit-seat'], seatHeight, params: { age }, shadow: false }));
    assert.ok(Math.abs(low - (300 + seatHeight * 1.5)) <= 4, `${age} sit-seat feet at ${low}`);
  }
});

test('walk and run keep the stance foot planted (no foot sliding)', () => {
  for (const age of ['child', 'adult', 'elder']) for (const [g, q0, q1] of [['walk', 0.18, 0.52], ['run', 0.06, 0.3]]) {
    const stride = rig.sizes({ age }).stride[g], xs = [];
    for (let q = q0; q <= q1; q += 0.04) { const sk = skeleton(GAITS[g](q), { age }); xs.push(stride * q + sk.front.leg.toe[0]); }
    const spread = Math.max(...xs) - Math.min(...xs);
    assert.ok(spread < stride * 0.02 + 0.5, `${age} ${g}: stance toe drifts ${spread.toFixed(2)} of stride ${stride}`);
  }
});

test('lip sync and blink change the face', () => {
  const face = st => { const [c, x] = canvas(500, 500); x.fillStyle = '#fff'; x.fillRect(0, 0, 500, 500); const sk = skeleton(POSES.stand, { age: 'adult' }); rig.draw(x, 250 - sk.head[0] * 8, 250 - sk.head[1] * 8, 8, 1, { params: { age: 'adult' }, ...st }); return x.getImageData(0, 0, 500, 500).data; };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) > 40) n++; return n; };
  const shut = face({ talk: 0 }), half = face({ talk: 0.5 }), open = face({ talk: 1 });
  assert.ok(diff(shut, half) > 200, 'talk 0.5 opens the mouth');
  assert.ok(diff(shut, open) > diff(shut, half), 'talk 1 opens wider');
  assert.ok(diff(face({ blink: 0 }), face({ blink: 1 })) > 200, 'blink closes the eyes');
  assert.ok(diff(face({ expr: 'happy' }), face({ expr: 'sad' })) > 200, 'expressions differ');
  assert.ok(diff(face({}), face({ look: 1 })) > 100, 'look turns the head');
});

test('look() normalises params and metrics scale with age', () => {
  const lk = look({ age: 'nonsense', hair: 'red', scarf: true, glasses: true, beard: 'full' });
  assert.equal(lk.age, 'child'); assert.equal(lk.beard, 'none', 'children have no beard');
  assert.match(lk.hair, /^#[0-9a-f]{6}$/); assert.match(lk.scarf, /^#[0-9a-f]{6}$/);
  assert.ok(metrics({ age: 'adult' }).L > metrics({ age: 'child' }).L);
  for (const k of Object.keys(EXPR)) assert.ok(EXPR[k].mouth && EXPR[k].brow, k);
});

test('sheet section renders', () => {
  const c = sheetSection('faces', 1200);
  assert.ok(c.width === 1200 && c.height > 200);
});
