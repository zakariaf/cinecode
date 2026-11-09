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

// ───────────────────────── round 2 (DESIGN §9.2) ─────────────────────────
import { readFileSync } from 'node:fs';
const FILM = JSON.parse(readFileSync(new URL('../films/seventy-six-summers/film.json', import.meta.url), 'utf8'));
const NELL = FILM.cast.nell.params, YOUNG = FILM.cast.young_nell.params;
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * t);
const pixDiff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; };
// Head close-up (zoom z) of a look, returning the pixels.
function face(params, st = {}, z = 8, W = 480) {
  const [c, x] = canvas(W, W); x.fillStyle = '#fff'; x.fillRect(0, 0, W, W);
  const sk = skeleton(POSES.stand, params);
  rig.draw(x, W / 2 - sk.head[0] * z, W / 2 - sk.head[1] * z, z, 1, { params, shadow: false, ...st });
  return x.getImageData(0, 0, W, W).data;
}
const hasColour = (d, hex, tol = 18) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) < tol) n++; return n; };

test('the film\'s two Nells resolve to valid looks', () => {
  const n = look(NELL), y = look(YOUNG);
  assert.equal(n.age, 'elder'); assert.equal(n.build, 'slight'); assert.equal(n.hairStyle, 'bun');
  assert.equal(n.glasses, '#b08a3a', 'brass frames'); assert.equal(n.scarf, '#5e7b3f');
  assert.equal(n.bottom, 'skirt'); assert.equal(n.skirt, '#5f6f8c', 'the skirt takes the dress colour'); assert.ok(n.hem > 1.4, 'an elder\'s skirt is long');
  assert.equal(n.shoes, '#4a3a2c');
  assert.equal(y.age, 'child'); assert.equal(y.hairStyle, 'braids'); assert.equal(y.hair, '#3b2a20');
  assert.equal(y.shoes, null, 'barefoot'); assert.equal(y.bottom, 'dress'); assert.equal(y.dress, '#d9a441'); assert.equal(y.dressStyle, 'smock');
  assert.equal(y.scarf, '#5e7b3f');
  for (const p of [NELL, YOUNG]) for (const [k, v] of Object.entries(p)) assert.ok(k in rig.params, `${k} is a documented param`);
});

test('look(): glasses true = default frame, a colour = that frame; tear, build slight, barefoot, skirt colour, hem, scarfLength', () => {
  assert.match(look({ glasses: true }).glasses, /^#[0-9a-f]{6}$/);
  assert.equal(look({ glasses: '#b08a3a' }).glasses, '#b08a3a');
  assert.equal(look({}).glasses, false);
  assert.equal(look({ tear: 3 }).tear, 1); assert.equal(look({ tear: 'x' }).tear, 0);
  for (const s of [null, false, 'none']) assert.equal(look({ shoes: s }).shoes, null, `shoes ${s} = barefoot`);
  assert.match(look({}).shoes, /^#[0-9a-f]{6}$/, 'shoes by default');
  assert.equal(look({ bottom: 'skirt', pants: '#334455' }).skirt, '#334455', 'a skirt without a dress colour uses pants');
  assert.equal(look({ bottom: 'skirt', dress: '#5f6f8c' }).skirt, '#5f6f8c');
  assert.ok(look({ age: 'elder', bottom: 'skirt' }).hem > look({ age: 'child', bottom: 'skirt' }).hem);
  assert.equal(look({ hem: 1.5 }).hem, 1.5);
  assert.equal(look({ age: 'adult', bottom: 'dress' }).dressStyle, 'fitted');
  assert.equal(look({ age: 'elder', hairStyle: 'nonsense' }).hairStyle, 'short');
  // slight: narrower, thinner limbs and a little shorter than average
  const sl = metrics({ age: 'elder', build: 'slight' }), av = metrics({ age: 'elder' });
  assert.ok(sl.chest < av.chest * 0.85 && sl.limb < av.limb && sl.H < av.H && sl.H > av.H * 0.9);
  assert.ok(rig.sizes({ age: 'elder', build: 'slight' }).width < rig.sizes({ age: 'elder' }).width);
});

test('draw(null) returns the same anchors and bounds without drawing', () => {
  const [c, x] = canvas(600, 600);
  for (const params of [NELL, YOUNG, ...VARIANTS]) for (const pose of [POSES.stand, POSES['sit-ground'], GAITS.walk(0.3), GESTURES['jump-for-joy'].at(0.5)]) {
    const st = { pose, params, t: 1.1, tilt: 0.6, talk: 0.3 };
    const a = rig.draw(null, 300, 500, 1.4, -1, st), b = rig.draw(x, 300, 500, 1.4, -1, st);
    assert.deepEqual(a.bounds, b.bounds); assert.deepEqual(a.head, b.head); assert.deepEqual(a.mouth, b.mouth);
  }
  // a probe between two real draws leaves no state behind (line weight, light side, caches)
  const px = () => { const [c2, x2] = canvas(200, 200); rig.draw(x2, 100, 190, 0.8, 1, { params: NELL, t: 0.3 }); return Buffer.from(x2.getImageData(0, 0, 200, 200).data); };
  const first = px();
  rig.draw(null, 40, 60, 7, -1, { params: { ...YOUNG, apron: true }, pose: POSES['sit-ground'], t: 4, tilt: -1 });
  assert.ok(first.equals(px()), 'probing does not disturb the next real draw');
});

test('jump-for-joy sets pose.lift (units), takes off and lands smoothly', () => {
  const G = GESTURES['jump-for-joy'];
  assert.equal(G.at(0, POSES.stand).lift || 0, 0); assert.ok(Math.abs(G.at(1, POSES.stand).lift || 0) < 1e-9);
  assert.ok(G.at(0.5, POSES.stand).lift > 25, 'airborne at the apex');
  let prev = G.at(0, POSES.stand);
  for (let i = 1; i <= 60; i++) {
    const q = G.at(i / 60, POSES.stand);
    for (const k of ['lift', 'hipF', 'kneeF', 'shF', 'lean', 'plF']) assert.ok(Math.abs((q[k] ?? 0) - (prev[k] ?? 0)) < (k === 'lift' ? 4 : 0.45), `${k} jumps at u=${i / 60}`);
    prev = q;
  }
  for (const age of AGES) assert.ok(skeleton(G.at(0.5), { age }).lift > 25);
});

test('st.tilt pitches the head up / down for every age, and the eyes follow', () => {
  for (const age of AGES) {
    const sk0 = skeleton(POSES.stand, { age }), up = skeleton(POSES.stand, { age }, { tilt: 1 }), dn = skeleton(POSES.stand, { age }, { tilt: -1 });
    const nose = s => s.mouth;
    assert.ok(nose(up)[1] < nose(sk0)[1] - 2, `${age}: chin up raises the mouth`);
    assert.ok(nose(dn)[1] > nose(sk0)[1] + 2, `${age}: chin down lowers it`);
    assert.deepEqual(up.hip, sk0.hip, 'the body does not move');
    const p = { age }; assert.ok(pixDiff(face(p), face(p, { tilt: 1 })) > 400, `${age}: tilt changes the face`);
  }
  // sitting on the ground and looking at the sky
  const sit = skeleton(POSES['sit-ground'], NELL), sky = skeleton(POSES['sit-ground'], NELL, { tilt: 1 });
  assert.ok(sky.mouth[1] < sit.mouth[1]);
});

test('glasses: a frame colour and one glint on the near lens', () => {
  const plain = face({ age: 'elder' }), brass = face({ age: 'elder', glasses: '#b08a3a' });
  assert.ok(hasColour(brass, '#b08a3a', 40) > 80, 'brass frame pixels');
  assert.equal(hasColour(plain, '#b08a3a', 40) < 10, true);
  // the glint: near-white pixels inside the near lens that are absent without glasses
  const sk = skeleton(POSES.stand, { age: 'elder' }), z = 8, W = 480;
  const eye = rig.draw(canvas(W, W)[1], W / 2 - sk.head[0] * z, W / 2 - sk.head[1] * z, z, 1, { params: { age: 'elder' }, shadow: false }).eye;
  const whiteNear = d => { let n = 0; for (let y = Math.round(eye[1] - 40); y < eye[1] + 10; y++) for (let x = Math.round(eye[0] - 40); x < eye[0] + 10; x++) { const i = (y * W + x) * 4; if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) n++; } return n; };
  assert.ok(whiteNear(face({ age: 'elder', glasses: '#b08a3a' }, { blink: 1 })) > whiteNear(face({ age: 'elder' }, { blink: 1 })) + 5, 'a glint on the near lens');
});

test('tear adds a wet highlight on the lower lid (open, happy and laughing eyes, close and far)', () => {
  for (const params of [NELL, YOUNG]) for (const expr of ['neutral', 'happy', 'laughing', 'sad']) {
    const d = pixDiff(face(params, { expr }), face({ ...params, tear: 1 }, { expr }));
    assert.ok(d > 25, `${params.age} ${expr}: tear visible (${d})`);
  }
  assert.ok(pixDiff(face(NELL, { expr: 'happy' }, 1.6, 200), face({ ...NELL, tear: 1 }, { expr: 'happy' }, 1.6, 200)) > 0, 'small on screen');
  assert.ok(pixDiff(face(NELL), face({ ...NELL, tear: 0 })) === 0, 'tear 0 = no change');
});

test('braids: two plaits that hang below the head, sway with time, and are inside the bounds', () => {
  const b = rig.bbox(POSES.stand, 1, YOUNG), b0 = rig.bbox(POSES.stand, 1, { ...YOUNG, hairStyle: 'short' });
  assert.ok(b[3] >= b0[3] - 1e-9 && b.every(Number.isFinite));
  const a = face(YOUNG, { t: 0 }, 5), c = face(YOUNG, { t: 0.9 }, 5), s = face({ ...YOUNG, hairStyle: 'short' }, { t: 0 }, 5);
  assert.ok(pixDiff(a, s) > 800, 'braids are drawn');
  assert.ok(pixDiff(a, c) > 20, 'and sway');
  const noScarf = { ...YOUNG, scarf: false };
  assert.ok(hasColour(face(noScarf, {}, 6), '#c8443a', 60) > 10 && hasColour(face({ ...noScarf, hairStyle: 'short' }, {}, 6), '#c8443a', 60) === 0, 'tied with a red band when there is no scarf to match');
});

test('barefoot: skin feet, no shoe or sock colours', () => {
  const draw = params => { const [c, x] = canvas(300, 300); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); rig.draw(x, 150, 290, 1.8, 1, { params, shadow: false }); return x.getImageData(0, 250, 300, 50).data; };
  const shod = draw({ ...YOUNG, shoes: '#c0504a' }), bare = draw(YOUNG);
  assert.ok(hasColour(shod, '#c0504a', 30) > 100 && hasColour(bare, '#c0504a', 30) === 0);
  assert.ok(hasColour(shod, '#f2ede2', 12) > 20 && hasColour(bare, '#f2ede2', 12) === 0, 'socks only with shoes');
  assert.ok(hasColour(bare, '#c99a72', 20) > 100, 'skin-coloured feet');
});

test('skirt and dress use the dress colour and cover the legs to the hem', () => {
  const px = params => { const [c, x] = canvas(300, 420); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 420); rig.draw(x, 150, 410, 1.8, 1, { params, shadow: false }); return x.getImageData(0, 0, 300, 420).data; };
  assert.ok(hasColour(px(NELL), '#5f6f8c', 30) > 2000, 'dusty-blue skirt');
  assert.ok(hasColour(px(YOUNG), '#d9a441', 30) > 2000, 'ochre smock');
  const long = rig.bbox(POSES.stand, 1, NELL), short = rig.bbox(POSES.stand, 1, { ...NELL, hem: 0.8 });
  assert.ok(long.every(Number.isFinite) && short.every(Number.isFinite));
});

test('scarf: a child in the same scarf sitting on the ground trails it in the grass', () => {
  const sit = rig.bbox(POSES['sit-ground'], 1, YOUNG), none = rig.bbox(POSES['sit-ground'], 1, { ...YOUNG, scarf: false });
  assert.ok(sit[0] < none[0] - 3, `the long end lies on the ground behind her (${sit[0]} vs ${none[0]})`);
  const shortScarf = rig.bbox(POSES['sit-ground'], 1, { ...YOUNG, scarfLength: 0.5 });
  assert.ok(shortScarf[0] > sit[0], 'scarfLength shortens it');
  const low = lowestPixel(x => rig.draw(x, 350, 470, 1.5, 1, { pose: POSES['sit-ground'], params: YOUNG, shadow: false }));
  assert.ok(Math.abs(low - 470) <= 3, 'nothing sinks into the ground');
});

// Frame counts: the screenplay's stand → crouch (1.2 s) → sit-ground (1.3 s) and 2 s rise at 24 fps.
test('pose blends stand → crouch → sit-ground and back never pop, keep the feet on the ground, and bend the knees forward', () => {
  const looks = [...AGES.map(age => ({ age })), NELL, YOUNG];
  const joints = sk => [sk.hip, sk.neck, sk.head, sk.front.leg.knee, sk.front.leg.ankle, sk.back.leg.knee, sk.back.leg.ankle, sk.front.hand, sk.back.hand];
  for (const params of looks) for (const [a, b, frames] of [['stand', 'crouch', 29], ['crouch', 'sit-ground', 31], ['sit-ground', 'stand', 48], ['stand', 'sit-ground', 60]]) {
    const H0 = skeleton(POSES.stand, params).metrics.H; let prev = null;
    for (let i = 0; i <= frames; i++) {
      const sk = skeleton(mixPose(POSES[a], POSES[b], ease(i / frames)), params), P = joints(sk), tag = `${params.age} ${a}→${b} frame ${i}`;
      if (prev) for (let j = 0; j < P.length; j++) assert.ok(Math.hypot(P[j][0] - prev[j][0], P[j][1] - prev[j][1]) < H0 * 0.045, `${tag}: joint ${j} pops`);
      prev = P;
      for (const l of [sk.front.leg, sk.back.leg]) {
        assert.ok(Math.abs(Math.max(l.heel[1], l.toe[1])) < 0.6, `${tag}: foot off the ground (${Math.max(l.heel[1], l.toe[1]).toFixed(2)})`);
        const d = [l.ankle[0] - l.hip[0], l.ankle[1] - l.hip[1]], k = [l.knee[0] - l.hip[0], l.knee[1] - l.hip[1]];
        assert.ok(d[0] * k[1] - d[1] * k[0] < 0.5, `${tag}: knee bends backward`);
      }
      assert.ok(sk.hip[1] < 0, `${tag}: hip above the ground`);
    }
  }
});

test('mixPose: exact at the ends; a direct sit ↔ stand leans over the feet on the way; other blends lerp', () => {
  const s = POSES.stand, g = POSES['sit-ground'];
  assert.deepEqual(mixPose(s, g, 0), mixPose(s, s, 0.3)); assert.equal(mixPose(s, g, 1).seat, 1);
  for (const [a, b] of [[s, g], [g, s]]) {
    const m = mixPose(a, b, 0.5);
    assert.ok(m.lean > 0.6, 'leans forward mid-way');
    for (const v of Object.values(m)) assert.ok(Number.isFinite(v));
  }
  const c = mixPose(s, POSES.crouch, 0.25); assert.ok(Math.abs(c.lean - lerpN(s.lean, POSES.crouch.lean, 0.25)) < 1e-9);
  // mid-blend frames are grounded in pixels (the screenplay's 2.5 s sit-down and 2 s rise; the frame counts above are those
  // durations at 24 fps — the film core decides the real blend length, see the continuity test below for any length)
  for (const [a, b] of [['stand', 'crouch'], ['crouch', 'sit-ground'], ['sit-ground', 'stand']]) for (const u of [0.2, 0.5, 0.8]) {
    const low = lowestPixel(x => rig.draw(x, 350, 470, 1.5, 1, { pose: mixPose(POSES[a], POSES[b], u), params: NELL, shadow: false }));
    assert.ok(Math.abs(low - 470) <= 3, `${a}→${b} ${u}: lowest pixel ${low}`);
  }
});
const lerpN = (a, b, u) => a + (b - a) * u;

test('the two Nells draw in every state the film uses', () => {
  const [c, x] = canvas(500, 500);
  const states = [{ pose: POSES['sit-ground'], tilt: 1 }, { pose: GESTURES.gasp.at(0.5, POSES['sit-ground']), expr: 'surprised' }, { pose: GESTURES.laugh.at(0.5, POSES['sit-ground']), expr: 'laughing', talk: 0.7 },
    { pose: GESTURES.point.at(0.5, POSES['sit-ground']), expr: 'angry' }, { pose: POSES.crouch }, { pose: GAITS.walk(0.4) }, { pose: POSES['sit-ground'], expr: 'happy', tear: 1 }];
  for (const params of [NELL, YOUNG]) for (const st of states) for (const s of [0.5, 1.5, 5]) {
    const r = rig.draw(x, 250, 480, s, -1, { ...st, params: { ...params, tear: st.tear || 0 }, t: 2.2, blink: 0.1 });
    assert.ok(r.bounds.every(Number.isFinite) && r.head.every(Number.isFinite));
  }
});

// ───────────────────────── review fixes: planted feet, hands on the floor, continuity, bounds, accessory names ─────────────────────────
const LOOKS = [...AGES.map(age => ({ age })), NELL, YOUNG];

test('the anchored stand is exactly the plain FK stand (the foot lock changes nothing when the feet are already home)', () => {
  for (const params of [...LOOKS, { age: 'adult', build: 'sturdy' }, { age: 'elder', build: 'slight', height: 1.2 }]) {
    const a = skeleton(POSES.stand, params), b = skeleton({ ...POSES.stand, anchor: 0 }, params);
    for (const k of ['hip', 'neck', 'head']) assert.deepEqual(a[k], b[k], `${params.age} ${k}`);
    assert.deepEqual(a.front, b.front); assert.deepEqual(a.back, b.back);
  }
});

test('crouch is a squat over the standing feet; sit-ground puts the hips behind the contact point, feet ahead', () => {
  for (const params of LOOKS) {
    const st = skeleton(POSES.stand, params), cr = skeleton(POSES.crouch, params), sg = skeleton(POSES['sit-ground'], params), L = st.metrics.L;
    for (const e of ['heel', 'toe']) assert.ok(Math.abs(cr.front.leg[e][0] - st.front.leg[e][0]) < 0.3, `${params.age}: crouch front ${e} where she stood`);
    assert.ok(Math.abs(cr.back.leg.toe[0] - st.back.leg.toe[0]) < 0.3 && cr.back.leg.heel[1] < -2, `${params.age}: far heel lifts, toe stays`);
    assert.ok(cr.hip[0] < st.hip[0] - 0.15 * L, `${params.age}: hips go back`);
    for (const l of [cr.front.leg, cr.back.leg]) assert.ok(l.knee[0] > l.ankle[0], `${params.age}: knees forward of the ankles`);
    assert.ok(sg.hip[0] < -0.2 * L && sg.front.leg.ankle[0] > 0, `${params.age}: seated hips behind the contact, feet ahead`);
  }
});

test('weight-bearing feet stay planted through stand ↔ crouch ↔ sit-ground and the rise (no skating)', () => {
  // [from, to, u range where the feet carry the weight]
  const spans = [['stand', 'crouch', 0, 1], ['crouch', 'stand', 0, 1], ['crouch', 'sit-ground', 0, 0.4], ['sit-ground', 'crouch', 0.6, 1],
    ['sit-ground', 'stand', 0.5, 1], ['stand', 'sit-ground', 0, 0.5], ['idle-weight-shift', 'crouch', 0, 1]];
  for (const params of LOOKS) for (const [a, b, u0, u1] of spans) {
    const H = skeleton(POSES.stand, params).metrics.H, seen = {};
    for (let i = 0; i <= 60; i++) {
      const sk = skeleton(mixPose(POSES[a], POSES[b], u0 + ((u1 - u0) * i) / 60), params, { t: i * 0.05 });
      for (const [side, l] of [['near', sk.front.leg], ['far', sk.back.leg]]) for (const [end, q] of [['heel', l.heel], ['toe', l.toe]]) {
        assert.ok(q[1] < 0.6, `${params.age} ${a}→${b}: ${side} ${end} below the floor`);
        if (q[1] > -0.6) (seen[`${side} ${end}`] ??= []).push(q[0]);          // on the floor: it must not move
      }
    }
    assert.ok(seen['near heel'] && seen['far toe'], `${params.age} ${a}→${b}: feet on the floor`);
    for (const [k, xs] of Object.entries(seen)) {
      const drift = Math.max(...xs) - Math.min(...xs);
      assert.ok(drift < H * 0.004, `${params.age} ${a}→${b}: ${k} slides ${drift.toFixed(2)} units`);
    }
  }
  // seated, the feet may slide (drawn in to stand up, stretched out on sitting down) — but they do reach the anchor
  const st = skeleton(POSES.stand, NELL), mid = skeleton(mixPose(POSES['sit-ground'], POSES.stand, 0.5), NELL);
  assert.ok(Math.abs(mid.front.leg.heel[0] - st.front.leg.heel[0]) < 0.3, 'the feet are home by the time the hips lift');
});

test('hands rest on the floor, never through it (reaching down mid-rise, crouching, gesturing while seated)', () => {
  for (const params of LOOKS) {
    const hr = metrics(look(params)).hand * 0.6;
    const frames = [];
    for (const [a, b] of [['sit-ground', 'stand'], ['stand', 'sit-ground'], ['stand', 'crouch'], ['crouch', 'sit-ground']]) for (let i = 0; i <= 40; i++) frames.push([`${a}→${b} ${i / 40}`, mixPose(POSES[a], POSES[b], i / 40)]);
    for (const g of ['laugh', 'gasp', 'point', 'clap', 'shrug']) for (const u of [0.2, 0.5, 0.8]) frames.push([`${g} seated ${u}`, GESTURES[g].at(u, POSES['sit-ground'])]);
    for (const [tag, pose] of frames) {
      const sk = skeleton(pose, params);
      for (const h of [sk.front.hand, sk.back.hand]) assert.ok(h[1] + hr < 0.3, `${params.age} ${tag}: hand ${(h[1] + hr).toFixed(2)} below the floor`);
    }
  }
  // in pixels: a hand cut flat by the ground clip shows its skin fill on the ground line; a resting hand shows its ink edge
  const skin = ['#c99a72', '#ad8462', '#9a6f62'], Y = 420, s = 4;
  for (const u of [0.3, 0.4, 0.45, 0.5, 0.6]) {
    const [c, x] = canvas(900, 460); rig.draw(x, 450, Y, s, 1, { pose: mixPose(POSES['sit-ground'], POSES.stand, u), params: NELL, shadow: false, t: 0.5 });
    const d = x.getImageData(0, Y - 1, 900, 6).data;
    const n = skin.reduce((acc, h) => acc + hasColour(d, h, 24), 0);
    assert.ok(n < 6, `rise ${u}: ${n} skin pixels on the ground line`);
  }
});

test('blends are continuous: refining the sampling shrinks every joint step (no pops), the seated dangle included', () => {
  const ease2 = t => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const J = sk => [sk.hip, sk.head, sk.front.leg.knee, sk.front.leg.ankle, sk.front.leg.toe, sk.back.leg.knee, sk.back.leg.ankle, sk.back.leg.toe, sk.front.hand, sk.back.hand];
  const maxStep = (a, b, n, st) => { let prev = null, m = 0; for (let i = 0; i <= n; i++) { const P = J(skeleton(mixPose(a, b, ease2(i / n)), NELL, st)); if (prev) P.forEach((q, j) => { m = Math.max(m, Math.hypot(q[0] - prev[j][0], q[1] - prev[j][1])); }); prev = P; } return m; };
  const cases = [['sit-seat', 'stand', { seatHeight: 140 }], ['stand', 'sit-seat', { seatHeight: 140 }], ['sit-seat', 'stand', {}], ['sit-ground', 'stand', {}], ['crouch', 'sit-ground', {}],
    ['stand', 'crouch', {}], ['stand', 'walk', {}], ['walk', 'stand', {}], ['stand', 'hands-on-hips', {}]];
  for (const [a, b, st] of cases) {
    const A = a === 'walk' ? GAITS.walk(0.5) : POSES[a], B = b === 'walk' ? GAITS.walk(0) : POSES[b];
    const coarse = maxStep(A, B, 300, st), fine = maxStep(A, B, 4800, st);
    // smooth paths shrink ~16x, a straightening knee (IK near full reach) ~4x; a pop keeps its size
    assert.ok(fine < coarse / 3 && fine < 1.2, `${a}→${b} ${JSON.stringify(st)}: ${coarse.toFixed(2)} → ${fine.toFixed(2)}`);
  }
});

test('painted pixels stay inside draw() bounds: skirts, dresses and aprons flare past the legs', () => {
  const looks = [NELL, YOUNG, { age: 'elder', bottom: 'skirt' }, { age: 'adult', bottom: 'dress', dress: '#d9894a' }, { age: 'adult', apron: true }, { age: 'teen', bottom: 'skirt', apron: '#f2ede2' }];
  const poses = [POSES.stand, GAITS.walk(0.3), GAITS.run(0.6), POSES['sit-ground'], POSES.crouch, GESTURES.bow.at(0.5)];
  const W = 760, Hc = 620, s = 2, X = 380, Y = 560;
  for (const params of looks) for (const pose of poses) for (const face of [1, -1]) {
    const [c, x] = canvas(W, Hc), r = rig.draw(x, X, Y, s, face, { pose, params, shadow: false, t: 1.3 }), d = x.getImageData(0, 0, W, Hc).data;
    let x0 = W, x1 = -1;
    for (let yy = 0; yy < Hc; yy++) for (let xx = 0; xx < W; xx++) if (d[(yy * W + xx) * 4 + 3] > 60) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; }
    const over = Math.max(r.bounds[0] - x0, x1 - r.bounds[2]) / s;
    assert.ok(over < 2, `${JSON.stringify(params).slice(0, 60)} face ${face}: paint ${over.toFixed(1)} units past the bounds`);
  }
});

test('accessories: false / null / "none" = not worn; material names (brass, gold, silver …) map to colours; unknown names use the default, not grey', () => {
  for (const k of ['glasses', 'scarf', 'hat', 'apron', 'backpack']) for (const v of ['none', 'no', false, null, '']) assert.equal(look({ [k]: v })[k], false, `${k} ${JSON.stringify(v)}`);
  assert.equal(look({ glasses: 'brass' }).glasses, '#b08a3a', 'the screenplay\'s round brass glasses');
  const metals = ['gold', 'silver', 'copper'].map(m => look({ glasses: m, age: 'elder' }).glasses);
  assert.equal(new Set(metals).size, 3); for (const m of metals) assert.match(m, /^#[0-9a-f]{6}$/);
  assert.equal(look({ scarf: 'moss' }).scarf, '#5e7b3f');
  assert.equal(look({ glasses: 'unobtainium' }).glasses, look({ glasses: true }).glasses, 'unknown name → default frame');
  assert.equal(look({ scarf: 'zzz' }).scarf, look({ scarf: true }).scarf);
  assert.notEqual(look({ glasses: 'gold' }).glasses, '#888888');
  assert.equal(pixDiff(face({ age: 'elder' }), face({ age: 'elder', glasses: 'none' })), 0, 'glasses "none" draws no glasses');
});
