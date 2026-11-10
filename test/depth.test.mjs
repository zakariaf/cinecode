// Depth (DESIGN §10): one projection for things off the stage (actors, anchors, effect pieces), a camera that moves
// through depth (camera "z" / "zTo"), layers scaled by it, a depth sort of actors and effect pieces together, the near
// cull and fade, framing at depth, and frameInfo / validation. A camera at depth 0 draws today's frames exactly.
//   node --test test/depth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo, gradeFocus } from '../engine/film/frame.mjs';
import { depthScale, depthFade, project, LENS, NEAR_FADE, PASS, PASS_FADE } from '../engine/film/camera.mjs';
import { OVERLAY_LAYERS } from '../engine/film/validate.mjs';
import { makeSet } from '../engine/set/set.mjs';
import { registerKit } from '../engine/set/kits/index.mjs';

// A plain stage: one far layer (k 0.5) with a red mark at world (1700, 700), the ground (k 1), a near layer (k 1.5);
// anchors on the stage and two off it (far: z 900, near: z −400).
const mark = (k, x, y, col) => ({ k, ...(k > 1 ? { front: true } : {}), paint(c) { c.fillStyle = col; c.fillRect(x - 15, y - 15, 30, 30); } });
const zstage = () => makeSet({
  id: 'zstage', W: 3000, H: 1600, refX: 1500, refY: 800, area: { x0: 0, x1: 3000, y0: 0, y1: 1600 }, horizon: 400, laneY: 1000, baseS: 1,
  layers: [mark(0.5, 1700, 700, '#ff0000'), { k: 1, paint(c) { c.fillStyle = '#7a8a5a'; c.fillRect(0, 900, 3000, 700); } }, mark(1.5, 1400, 900, '#0000ff')],
  props: [], anchors: { a: { x: 1200, y: 1000 }, b: { x: 1800, y: 1000 }, far: { x: 1500, y: 1000, z: 900 }, near: { x: 1300, y: 1000, z: -400 } },
  ambience: { day: 'meadow-day', night: 'meadow-night' },
});
registerKit('zstage', zstage);

function tiny({ set = 'meadow', actors, shots, cast = {}, W = 480, H = 270, overlays }) {
  return {
    title: 'Depth', format: { width: W, height: H, fps: 24, captions: 'none' }, voices: {},
    cast: { hare: { rig: 'hare' }, fox: { rig: 'fox' }, ...cast }, sets: { m: { kit: set } },
    scenes: [{ id: 's1', set: 'm', time: 'morning', actors, shots, ...(overlays ? { overlays } : {}) }],
  };
}
const shotOf = (plan, id) => plan.shots.find(s => s.id === id);
const pixels = (plan, t) => { const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'); drawFrame(x, plan, t); return x.getImageData(0, 0, plan.W, plan.H).data; };
const boxH = b => b[3] - b[1];

// ───────────── the projection ─────────────
test('projection: p = (D − c)/(D + z − c); the stage is 1 for any camera depth; behind or too near the lens is culled, then faded', () => {
  const cam = { cx: 1000, cy: 600, zoom: 2, z: 500, lens: 2000 };
  assert.equal(depthScale(cam, 0), 1);
  assert.equal(depthScale({ cx: 0, cy: 0, zoom: 1 }, 0), 1);
  assert.ok(Math.abs(depthScale(cam, 1000) - 1500 / 2500) < 1e-12);
  assert.ok(Math.abs(depthScale(cam, -1000) - 1500 / 500) < 1e-12);
  assert.equal(depthScale(cam, -1600), 0);                             // behind the lens
  // a point off the stage lands nearer the frame centre when it is farther (and its scale is zoom × p)
  const [sx, sy, s] = project(cam, 800, 400, 1200, 600, 1000);
  assert.ok(Math.abs(sx - (400 + 200 * 2 * 0.6)) < 1e-9 && Math.abs(sy - 200) < 1e-9 && Math.abs(s - 1.2) < 1e-12);
  // a stage point projects exactly as the 2D camera always did
  assert.deepEqual(project({ cx: 1000, cy: 600, zoom: 1.7 }, 800, 400, 1234, 567).slice(0, 2), [(1234 - 1000) * 1.7 + 400, (567 - 600) * 1.7 + 200]);
  // the near cull and fade (distance d = D + z − c from the lens): a thing passes the lens
  assert.equal(depthFade(cam, 0), 1);
  assert.equal(depthFade(cam, -1500 + PASS * 2000 - 1), 0);
  assert.equal(depthFade(cam, -1500 + PASS_FADE * 2000 + 1), 1);
  const mid = depthFade(cam, -1500 + ((PASS + PASS_FADE) / 2) * 2000);
  assert.ok(mid > 0.3 && mid < 0.7, `half way through the fade: ${mid}`);
  assert.equal(depthFade({ cx: 0, cy: 0, zoom: 1 }, 0), 1);
  assert.equal(LENS, 2304);
});

// ───────────── layers ─────────────
test('layers: a camera moved through depth scales each about the frame centre by (D − c)/(D − k·c); at depth 0 they are as painted', () => {
  const S = zstage(), W = 640, H = 360;
  const centroid = (cam, front, rgb) => {
    const c = createCanvas(W, H), x = c.getContext('2d'), z = cam.zoom;
    x.setTransform(z, 0, 0, z, W / 2 - cam.cx * z, H / 2 - cam.cy * z);
    (front ? S.drawFront : S.drawBack)(x, cam, {});
    const d = x.getImageData(0, 0, W, H).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < W * H; i++) if (d[i * 4 + rgb] > 200 && d[i * 4 + (rgb ? 0 : 2)] < 60 && d[i * 4 + 1] < 60) { n++; sx += i % W; sy += Math.floor(i / W); }
    return n ? { x: sx / n + 0.5, y: sy / n + 0.5, n } : null;
  };
  const cam = { cx: 1500, cy: 800, zoom: 1 };
  const flat = centroid(cam, false, 0), deep = centroid({ ...cam, z: 1000, lens: 2304 }, false, 0);
  assert.ok(Math.abs(flat.x - (W / 2 + 200)) < 0.6 && Math.abs(flat.y - (H / 2 - 100)) < 0.6, JSON.stringify(flat));
  const r = (2304 - 1000) / (2304 - 0.5 * 1000);
  assert.ok(Math.abs(deep.x - (W / 2 + 200 * r)) < 0.8 && Math.abs(deep.y - (H / 2 - 100 * r)) < 0.8, `far layer at r ${r.toFixed(3)}: ${JSON.stringify(deep)}`);
  assert.ok(Math.abs(deep.n / flat.n - r * r) < 0.08, 'and drawn that much smaller');
  // a near layer grows more than the stage (r > 1), and fades out as the camera reaches it (D/k − c under NEAR × D)
  const nf = centroid(cam, true, 2), nd = centroid({ ...cam, z: 600, lens: 2304 }, true, 2), rn = (2304 - 600) / (2304 - 1.5 * 600);
  assert.ok(Math.abs(nd.x - (W / 2 + (nf.x - W / 2) * rn)) < 0.8, `near layer at r ${rn.toFixed(3)}: ${JSON.stringify([nf, nd])}`);
  assert.equal(centroid({ ...cam, z: 2304 / 1.5 - 0.05 * 2304, lens: 2304 }, true, 2), null, 'a near layer the camera has reached is not drawn');
});

// ───────────── a camera at depth 0 is today's camera ─────────────
test('a camera at depth 0 (with z and lens) and an actor at z 0 draw byte-identical frames', async () => {
  const film = tiny({ actors: { hare: { at: 'x:1300,y:1060', face: 'right' }, fox: { at: 'x:1600,y:1080', face: 'left' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare', 'fox'] }, dur: 2, beats: [] }] });
  const plan = compile(await loadFilm(film)), t = 1;
  assert.equal(shotOf(plan, 'a').cameraAt(t).z, undefined, 'a scene without depth keeps its cameras as they were');
  const before = pixels(plan, t);
  const s = shotOf(plan, 'a'), was = s.cameraAt;
  s.cameraAt = u => ({ ...was(u), z: 0, lens: LENS });
  const states = plan.actorsAt;
  plan.actorsAt = (...a) => states(...a).map(st => ({ ...st, z: 0 }));
  assert.ok(Buffer.from(pixels(plan, t)).equals(Buffer.from(before)));
  // and with "z": 0 written in the storyboard
  const zero = compile(await loadFilm(tiny({ actors: { hare: { at: 'x:1300,y:1060', face: 'right', z: 0 }, fox: { at: 'x:1600,y:1080', face: 'left' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare', 'fox'], z: 0, zTo: 0 }, dur: 2, beats: [] }] })));
  assert.ok(Buffer.from(pixels(zero, t)).equals(Buffer.from(before)));
});

// ───────────── the depth sort ─────────────
test('the depth sort: an effect piece behind an actor is hidden by it, one in front covers it; actors sort by z before their key', async () => {
  const film = tiny({ W: 640, H: 360, actors: { hare: { at: 'x:1300,y:1060', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare'] }, dur: 1, beats: [] }] });
  const plan = compile(await loadFilm(film)), t = 0.5, W = plan.W, H = plan.H;
  // the hare's silhouette (as the frame draws it), and a red square centred on its body, behind it or in front of it
  const mask = createCanvas(W, H);
  let mode = null;
  const def = { layer: 'depth', draw(ctx, api) {
    api.silhouette(mask.getContext('2d'), 'hare');
    if (!mode) return;
    const b = api.actor('hare').box, x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2, z = mode === 'behind' ? 300 : -300, h = (b[3] - b[1]) * 0.3;
    api.item([x, y, z], c => { c.fillStyle = '#ff0000'; c.fillRect(x - h, y - h, 2 * h, 2 * h); });
  } };
  plan.overlays.push({ scene: 's1', name: 'sq', params: {}, layer: 'depth', def, seed: 1, t0: 0, t1: plan.duration });
  const none = pixels(plan, t);
  mode = 'behind'; const behind = pixels(plan, t);
  mode = 'front'; const front = pixels(plan, t);
  const m = mask.getContext('2d').getImageData(0, 0, W, H).data;
  let inHare = 0, hiddenOK = 0, covered = 0, shownOut = 0;
  for (let i = 0; i < W * H; i++) {
    const j = i * 4, red = f => f[j] > 60 && f[j] > 3 * f[j + 1] && f[j] > 3 * f[j + 2];
    if (m[j + 3] === 255) { inHare++; if (behind[j] === none[j] && behind[j + 1] === none[j + 1] && behind[j + 2] === none[j + 2]) hiddenOK++; if (red(front)) covered++; }
    else if (m[j + 3] === 0 && red(behind)) shownOut++;
  }
  assert.ok(inHare > 500, `the hare is drawn (${inHare} px)`);
  assert.ok(hiddenOK / inHare > 0.995, `behind it, the hare hides the square: ${hiddenOK} / ${inHare}`);
  assert.ok(covered > 200, `in front, the square covers the hare (${covered} px)`);
  assert.ok(shownOut > 200, `behind it, the square shows around the hare (${shownOut} px)`);
  // an item handed over on another layer is a mistake, said so
  const bad = compile(await loadFilm(film));
  bad.overlays.push({ scene: 's1', name: 'x', params: {}, layer: 'world', def: { layer: 'world', draw: (c, api) => api.item([0, 0, 0], () => {}) }, seed: 1, t0: 0, t1: bad.duration });
  assert.throws(() => pixels(bad, t), /only an overlay or custom beat on the "depth" layer/);
  // actors: farther first, whatever their key (the fox stands nearer the lens by its ground y, but 500 behind)
  const two = compile(await loadFilm(tiny({ actors: { hare: { at: 'x:1300,y:1040', face: 'right' }, fox: { at: 'x:1500,y:1100', face: 'left', z: 500 } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'] }, dur: 1, beats: [] }] })));
  assert.deepEqual(two.actorsAt(0.5).map(a => [a.id, a.z]), [['fox', 500], ['hare', 0]]);
});

// ───────────── actors and places off the stage ─────────────
test('actors off the stage: a scene actor\'s z, an anchor\'s z, a beat\'s z eased over a move, a set with a dur; framed by their size at depth', async () => {
  const film = tiny({ set: 'zstage', actors: { hare: { at: 'far', face: 'right' }, fox: { at: 'a', face: 'right', z: -300 } },
    shots: [
      { id: 'a', camera: { size: 'full', on: ['hare'] }, dur: 2, beats: [] },
      { id: 'b', camera: { size: 'full', on: ['fox'] }, beats: [{ do: 'walk', who: 'fox', to: 'b', z: 300 }, { do: 'set', who: 'hare', z: 0, dur: 1.5 }] },
      { id: 'c', camera: { size: 'full', on: ['hare'] }, dur: 1, beats: [{ do: 'place', who: 'hare', to: 'near' }] },
    ] });
  const plan = compile(await loadFilm(film)), a = shotOf(plan, 'a'), b = shotOf(plan, 'b'), c = shotOf(plan, 'c');
  const z = (id, t) => plan.actorsAt(t).find(s => s.id === id).z;
  assert.equal(z('hare', a.t0 + 0.5), 900, 'from its starting anchor');
  assert.equal(z('fox', a.t0 + 0.5), -300, 'its own');
  // the walk takes the fox from −300 to 300 over the walk; the set (after it) takes the hare to 0 over 1.5 s
  const [walk, set] = plan._scenes[0].shots.find(s => s.id === 'b').beats, mid = z('fox', (walk.t0 + walk.t1) / 2);
  assert.ok(mid > -250 && mid < 250, `easing: ${mid}`);
  assert.ok(Math.abs(z('fox', walk.t1) - 300) < 1e-9, 'the walk ends at its z');
  assert.ok(Math.abs(set.t1 - set.t0 - 1.5) < 1e-9, 'a set with a z takes its dur');
  assert.ok(Math.abs(z('hare', set.t1) - 0) < 1e-9 && Math.abs(z('hare', (set.t0 + set.t1) / 2) - 450) < 1e-6, 'and eases over it');
  assert.equal(z('hare', c.t0 + 0.5), -400, 'placed at an anchor with a z');
  // a camera framing an actor off the stage frames it by its size there: a full shot fills 60% of the height, as on
  // the stage (the camera's stage zoom differs by p)
  const info = frameInfo(plan, a.t0 + 1), h = info.actors.find(q => q.id === 'hare');
  assert.equal(h.z, 900);
  assert.ok(Math.abs(boxH(h.screenBox) / plan.H - 0.6) < 0.03, `full at depth 900: ${(boxH(h.screenBox) / plan.H).toFixed(3)}`);
  assert.ok(Math.abs(h.zoom - info.camera.zoom * depthScale(info.camera, 900)) < 1e-9, 'its zoom is the stage zoom × p');
  assert.equal(info.camera.lens, LENS, 'cameras of a scene with depth carry the lens');
  // the screen box is where the actor is drawn: its contact projects through the same camera
  const [sx, sy] = project(info.camera, plan.W, plan.H, h.x, h.y, 900);
  assert.ok(Math.abs(h.contact.screen[0] - sx) < 1e-6 && Math.abs(h.contact.screen[1] - sy) < 1e-6);
});

// ───────────── a camera moving through depth ─────────────
test('camera z / zTo: a dolly keeps its axis and grows the stage by (D − z)/(D − c); a push-in to a size composes its end at zTo', async () => {
  const actors = { hare: { at: 'x:1400,y:1060', face: 'right' } };
  const film = tiny({ actors, shots: [
    { id: 'still', camera: { size: 'wide', on: ['hare'] }, dur: 3, beats: [] },
    { id: 'dolly', camera: { size: 'wide', on: ['hare'], zTo: 900, moveAt: 0.5, moveDur: 2 }, dur: 3, beats: [] },
    { id: 'zolly', camera: { size: 'full', on: ['hare'], move: 'push-in', to: 'full', zTo: -1200 }, dur: 3, beats: [] },
    { id: 'full', camera: { size: 'full', on: ['hare'] }, dur: 3, beats: [] },
  ] });
  const plan = compile(await loadFilm(film)), S = shotOf(plan, 'still'), d = shotOf(plan, 'dolly'), D = LENS;
  const c0 = d.cameraAt(d.t0 + 0.2), c1 = d.cameraAt(d.t1 - 1e-3), s0 = S.cameraAt(S.t0 + 1);
  assert.equal(c0.z, 0); assert.equal(c1.z, 900);
  assert.ok(Math.abs(c0.zoom - s0.zoom) < 1e-9 && Math.abs(c0.cx - s0.cx) < 1e-9, 'before the move it is the still framing');
  assert.ok(Math.abs(c1.zoom / c0.zoom - D / (D - 900)) < 1e-9, `stage zoom × D/(D − 900): ${c1.zoom / c0.zoom}`);
  assert.ok(Math.abs(c1.cx - c0.cx) < 1e-9 && Math.abs(c1.cy - c0.cy) < 1e-9, 'along its axis');
  // eased: halfway through the window it is halfway there, and it moves smoothly (no jumps between frames)
  assert.ok(Math.abs(d.cameraAt(d.t0 + 1.5).z - 450) < 1e-6);
  let jump = 0; for (let t = d.t0; t < d.t1 - 1 / 24; t += 1 / 24) jump = Math.max(jump, Math.abs(d.cameraAt(t + 1 / 24).z - d.cameraAt(t).z));
  assert.ok(jump < 900 / 2 / 24 * 1.6 + 1e-9, `largest step ${jump}`);
  // the dolly-zoom: the subject stays framed full while the camera pulls back 1200 (the stage zoom changes)
  const z = shotOf(plan, 'zolly'), f = shotOf(plan, 'full');
  const hz = frameInfo(plan, z.t1 - 1e-3).actors[0], hf = frameInfo(plan, f.t0 + 1).actors[0];
  assert.ok(Math.abs(z.cameraAt(z.t1 - 1e-3).z + 1200) < 0.01);
  assert.ok(Math.abs(boxH(hz.screenBox) / boxH(hf.screenBox) - 1) < 0.02, `the end is full: ${boxH(hz.screenBox)} vs ${boxH(hf.screenBox)}`);
  // a camera's depth is clamped: it never reaches the stage's fade
  // (one past the check: compiled anyway)
  const loaded = await loadFilm(tiny({ actors, shots: [{ id: 'x', camera: { size: 'wide', on: ['hare'], zTo: 1000 }, dur: 1, beats: [] }] }));
  loaded.scenes[0].shots[0].camera.zTo = 5000;
  assert.ok(shotOf(compile(loaded), 'x').cameraAt(0.99).z < (1 - NEAR_FADE) * D);
});

test('the near cull: an actor the camera flies past fades and leaves the picture (and frameInfo)', async () => {
  const film = tiny({ actors: { hare: { at: 'x:1400,y:1060', face: 'right' }, fox: { at: 'x:1250,y:1060', face: 'right', z: -1200 } },
    shots: [{ id: 'fly', camera: { size: 'wide', on: ['hare'], zTo: 1150 }, dur: 4, beats: [] }] });
  const plan = compile(await loadFilm(film)), s = shotOf(plan, 'fly');
  const fox = t => frameInfo(plan, t).actors.find(a => a.id === 'fox');
  assert.ok(fox(0.01) && fox(0.01).alpha === 1, 'at first it is whole');
  // d = D − 1200 − c: fades from PASS_FADE·D, gone under PASS·D
  const tc = t => s.cameraAt(t).z, seen = [];
  for (let t = 0; t < 4; t += 1 / 24) { const a = fox(t), d = LENS - 1200 - tc(t); seen.push([d, a ? a.alpha : 0]); }
  for (const [d, a] of seen) {
    if (d > PASS_FADE * LENS + 1) assert.equal(a, 1);
    if (d < PASS * LENS - 1) assert.equal(a, 0);
  }
  assert.ok(seen.some(([, a]) => a > 0.05 && a < 0.95), 'and fades in between');
});

// ───────────── validation ─────────────
test('validation: camera z / zTo under 3/4 of the lens, numeric z on actors and beats, the depth layer', async () => {
  const base = tiny({ actors: { hare: { at: 'x:1400,y:1060', face: 'right', z: 'far' } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'], zTo: 1800, z: 'x' }, dur: 1, beats: [{ do: 'walk', who: 'hare', to: 'x:1500', z: 'deep' }, { do: 'look', who: 'hare', to: 'left', z: 30 }] }] });
  const film = await loadFilm(base).catch(e => e);
  const msgs = (film.problems || []).map(p => `${p.path}: ${p.message}`).join('\n');
  assert.match(msgs, /actors\.hare\.z: must be a depth/);
  assert.match(msgs, /camera\.zTo: must stay under 1728/);
  assert.match(msgs, /camera\.z: must be a depth/);
  assert.match(msgs, /beats\[0\]\.z: must be a depth/);
  const ok = await loadFilm(tiny({ actors: { hare: { at: 'x:1400,y:1060', face: 'right', z: 300 } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'], z: -500, zTo: 1700 }, dur: 1, beats: [{ do: 'look', who: 'hare', to: 'left', z: 30 }] }] }));
  assert.ok(ok.warnings.some(w => /z: ignored: only walk, run, hop, fly, enter, exit, place, set/.test(`${w.path}: ${w.message}`)), JSON.stringify(ok.warnings));
  assert.ok(OVERLAY_LAYERS.includes('depth'), 'overlays and custom beats may draw on the depth layer');
});

// ───────────── review fixes ─────────────
// A set with no painted stage (no ground layer, no props): only a far backdrop.
registerKit('zspace', () => makeSet({
  id: 'zspace', W: 3000, H: 1600, refX: 1500, refY: 800, area: { x0: 0, x1: 3000, y0: 0, y1: 1600 }, horizon: 400, laneY: 1000, baseS: 1,
  layers: [mark(0.5, 1700, 700, '#ff0000')], props: [], anchors: { a: { x: 1200, y: 1000 }, b: { x: 1800, y: 1000 } },
  ambience: { day: 'meadow-day', night: 'meadow-night' },
}));
const footX = a => a.contact.screen[0];
const actorAt = (plan, t, id) => frameInfo(plan, t).actors.find(a => a.id === id);

test('framing at depth is exact for every framing: a track, a pan and a zoom show a subject off the stage as they show it on the stage', async () => {
  // the same staging on the stage and 900 behind it (a walker, then a pan from it to the fox, then a zoom about it)
  const mk = z => tiny({ set: 'zspace', W: 960, H: 540, actors: { hare: { at: 'a', face: 'right', ...(z ? { z } : {}) }, fox: { at: 'b', face: 'left', ...(z ? { z } : {}) } },
    shots: [
      { id: 'still', camera: { size: 'full', on: ['fox'] }, dur: 1, beats: [] },
      { id: 'pan', camera: { size: 'full', on: ['hare', 'fox'], move: 'pan' }, dur: 3, beats: [] },
      { id: 'zoom', camera: { size: 'full', on: ['hare'], move: 'push-in', zoomTo: 2, offset: [0.2, 0] }, dur: 2, beats: [] },
      { id: 'track', camera: { size: 'full', on: ['hare'], move: 'track' }, beats: [{ do: 'walk', who: 'hare', to: 'x:2300' }] },
    ] });
  const flat = compile(await loadFilm(mk(0))), deep = compile(await loadFilm(mk(900)));
  const pan = shotOf(deep, 'pan'), still = shotOf(deep, 'still');
  assert.ok(Math.abs(footX(actorAt(deep, pan.t1 - 1e-3, 'fox')) - footX(actorAt(deep, still.t0 + 0.5, 'fox'))) < 0.5, 'a pan ends where a still shot of its last subject has it');
  // the subject keeps its place on screen: as on the stage (the depth only changes the stage's zoom), within a pixel
  // or two over a track, and exactly where a zoom closes in on it
  for (const id of ['track', 'zoom', 'pan']) {
    const a = shotOf(flat, id), b = shotOf(deep, id), who = id === 'pan' ? 'fox' : 'hare';
    let worst = 0;
    for (let u = 0; u <= 1; u += 1 / 16) { const t = u * (a.t1 - a.t0 - 1e-3); worst = Math.max(worst, Math.abs(footX(actorAt(flat, a.t0 + t, who)) - footX(actorAt(deep, b.t0 + t, who)))); }
    assert.ok(worst < (id === 'pan' ? 0.02 * deep.W : 2), `${id}: ${who} off the stage is where it is on the stage (worst ${worst.toFixed(1)} px)`);
  }
  assert.ok(actorAt(deep, shotOf(deep, 'track').t0 + 1, 'hare').z === 900, 'a walk to a point keeps the depth');
});

// Big marks on a far layer (k 0.5: z 2304), the ground (k 1) and a front layer (k 1.5: z −768).
registerKit('zlayers', () => makeSet({
  id: 'zlayers', W: 2000, H: 1200, refX: 1000, refY: 600, area: { x0: 0, x1: 2000, y0: 0, y1: 1200 }, horizon: 300, laneY: 900, baseS: 1,
  layers: [{ k: 0.5, paint(c) { c.fillStyle = '#ff0000'; c.fillRect(920, 420, 160, 160); } }, { k: 1, paint(c) { c.fillStyle = '#7a8a5a'; c.fillRect(0, 700, 2000, 500); } },
    { k: 1.5, front: true, paint(c) { c.fillStyle = '#0000ff'; c.fillRect(620, 570, 160, 160); } }],
  props: [], anchors: { a: { x: 1500, y: 900 } }, ambience: { day: 'meadow-day', night: 'meadow-night' },
}));
test('layers sort with what is off the stage: a backdrop hides what is beyond it, a front layer what is behind it; the stage\'s ground is a floor', async () => {
  const film = tiny({ set: 'zlayers', W: 640, H: 384, actors: { hare: { at: 'a', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'establishing' }, dur: 1, beats: [] }] });
  const plan = compile(await loadFilm(film)), t = 0.5, W = plan.W, H = plan.H, cam = shotOf(plan, 'a').cameraAt(t), z = cam.zoom;
  let item = null;
  plan.overlays.push({ scene: 's1', name: 'sq', params: {}, layer: 'depth', seed: 1, t0: 0, t1: plan.duration, def: { layer: 'depth', draw(ctx, api) {
    if (!item) return;
    // a green square 40 px across centred on the screen point item.at, at depth item.z
    const [, , s] = api.project([0, 0, item.z]), x = api.cam.cx + (item.at[0] - W / 2) / s, y = api.cam.cy + (item.at[1] - H / 2) / s, h = 20 / s;
    api.item([x, y, item.z], c => { c.fillStyle = '#00ff00'; c.fillRect(x - h, y - h, 2 * h, 2 * h); });
  } } });
  // where a layer with parallax k draws its point (u, v) (DESIGN §3)
  const on = (k, u, v) => [Math.round(W / 2 + z * (u + (cam.cx - 1000) * (1 - k) - cam.cx)), Math.round(H / 2 + z * (v + (cam.cy - 600) * (1 - k) * 0.4 - cam.cy))];
  const red = on(0.5, 1000, 500), blue = on(1.5, 700, 650), ground = on(1, cam.cx - 0.35 * W / z, 1000);
  for (const p of [red, blue, ground]) assert.ok(p[0] > 20 && p[0] < W - 20 && p[1] > 20 && p[1] < H - 20, `in frame: ${p}`);
  const plain = pixels(plan, t);
  const seen = (at, d) => { item = { at, z: d }; const p = pixels(plan, t), j = (at[1] * W + at[0]) * 4; return p[j + 1] > 50 && p[j + 1] > 2.5 * p[j] && p[j + 1] > 2.5 * p[j + 2]; };
  assert.ok(!seen(red, 3200), 'beyond the far layer (z 2304): hidden by its paint');
  assert.ok(seen(red, 1500), 'nearer than it: drawn over it');
  assert.ok(!seen(blue, -500), 'behind the front layer (z −768): hidden by its paint');
  assert.ok(seen(blue, -1100), 'nearer than it: drawn over it');
  assert.ok(seen(ground, 1500), 'between the stage and the backdrop: over the stage\'s ground (a floor reaches back to the backdrop)');
  assert.ok(!seen(ground, 3200), 'beyond the backdrop: the ground in front of it hides it');
  // nothing off the stage: the layers are drawn as before (the frame is the plain one)
  item = null; assert.ok(Buffer.from(pixels(plan, t)).equals(Buffer.from(plain)));
});

test('standing off the stage on a set with painted ground is warned about; a flier, or a set with no ground, is not', async () => {
  const warns = async (set, actors) => compile(await loadFilm(tiny({ set, cast: { flit: { rig: 'butterfly' } }, actors, shots: [{ id: 'a', camera: { size: 'wide', on: Object.keys(actors) }, dur: 1, beats: [] }] }))).warnings.filter(w => / at z /.test(w));
  const w = await warns('zstage', { hare: { at: 'a', face: 'right', z: 500 } });
  assert.equal(w.length, 1); assert.match(w[0], /hare stands on the ground at z 500 .* slides over the ground .* drawn behind everything on the stage/);
  assert.deepEqual(await warns('zstage', { flit: { at: 'a', face: 'right', height: 200, z: 500 } }), [], 'a flier in the air');
  assert.deepEqual(await warns('zspace', { hare: { at: 'a', face: 'right', z: 500 } }), [], 'no painted ground');
  assert.deepEqual(await warns('zstage', { hare: { at: 'a', face: 'right' } }), [], 'on the stage');
});

test('depth follows a rider on and off its carrier smoothly; a place takes the depth of where it is', async () => {
  const film = tiny({ set: 'zstage', W: 960, H: 540, cast: { shell: { rig: 'tortoise' } },
    actors: { shell: { at: 'b', face: 'left', z: 700 }, hare: { at: 'a', face: 'right' }, fox: { at: 'far', face: 'right' } },
    shots: [
      { id: 'on', camera: { size: 'wide', on: ['shell', 'hare'] }, beats: [{ do: 'hop', who: 'hare', to: 'on:shell' }, { wait: 0.5 }] },
      { id: 'off', camera: { size: 'wide', on: ['shell', 'hare'] }, beats: [{ do: 'hop', who: 'hare', to: 'a' }, { wait: 0.5 }] },
      { id: 'places', camera: { size: 'wide', on: ['fox'] }, beats: [{ do: 'walk', who: 'fox', to: 'x:1700' }, { do: 'place', who: 'fox', to: 'a' }, { wait: 0.5 }] },
    ] });
  const plan = compile(await loadFilm(film)), fps = plan.fps;
  for (const id of ['on', 'off']) {
    const s = shotOf(plan, id); let prev = null, dz = 0, dh = 0;
    for (let f = Math.ceil(s.t0 * fps); f / fps < s.t1; f++) {
      const a = actorAt(plan, f / fps, 'hare'); if (!a) continue;
      if (prev) { dz = Math.max(dz, Math.abs(a.z - prev.z)); dh = Math.max(dh, Math.abs(boxH(a.screenBox) / boxH(prev.screenBox) - 1)); }
      prev = a;
    }
    assert.ok(dz < 120, `${id}: the depth eases (largest step ${dz.toFixed(0)})`);
    assert.ok(dh < 0.2, `${id}: no jump in size (largest step ${(100 * dh).toFixed(0)}%)`);
  }
  const z = (id, t) => plan.actorsAt(t).find(a => a.id === id).z, on = shotOf(plan, 'on'), off = shotOf(plan, 'off'), pl = shotOf(plan, 'places');
  assert.equal(z('hare', on.t1 - 0.01), 700, 'riding: the carrier\'s depth');
  assert.equal(z('hare', off.t1 - 0.01), 0, 'hopped off to an anchor without a z: on the stage');
  const [walk, place] = plan._scenes[0].shots.find(s => s.id === 'places').beats;
  assert.equal(z('fox', walk.t1 - 0.05), 900, 'a walk to a point keeps its depth');
  assert.equal(z('fox', place.t1 + 0.1), 0, 'placed at an anchor without a z: on the stage');
});

test('an exit or entrance at a side leaves and enters off screen as its depth shows it', async () => {
  const film = tiny({ set: 'zspace', W: 960, H: 540, actors: { hare: { at: 'a', face: 'right' }, fox: { at: 'b', face: 'right', z: 1200 } },
    shots: [
      { id: 'out', camera: { size: 'full', on: ['hare'] }, beats: [{ do: 'exit', who: 'fox', to: 'right' }] },
      { id: 'in', camera: { size: 'full', on: ['hare'] }, beats: [{ do: 'enter', who: 'fox', from: 'left', to: 'x:1250' }, { wait: 0.5 }] },
    ] });
  const plan = compile(await loadFilm(film)), fps = plan.fps, W = plan.W;
  const seen = id => { const s = shotOf(plan, id), out = []; for (let f = Math.ceil(s.t0 * fps); f / fps < s.t1; f++) { const a = actorAt(plan, f / fps, 'fox'); if (a) out.push(a); } return out; };
  const ex = seen('out'), en = seen('in');
  assert.ok(ex.length && en.length, 'the fox is in both shots');
  assert.ok(ex[ex.length - 1].screenBox[0] >= W - 1, `the exit leaves the frame before it ends (last box ${ex[ex.length - 1].screenBox.map(Math.round)})`);
  assert.ok(en[0].screenBox[2] <= 1, `the entrance starts out of frame (first box ${en[0].screenBox.map(Math.round)})`);
  assert.ok(en.every(a => a.z === 1200), 'at its depth all the way');
});

test('the grade\'s focus on a close shot holds the head as its depth draws it', async () => {
  const film = tiny({ set: 'zspace', W: 960, H: 540, actors: { hare: { at: 'a', face: 'right', z: 900 } }, shots: [{ id: 'c', camera: { size: 'close', on: ['hare'] }, dur: 1, beats: [] }] });
  const plan = compile(await loadFilm(film)), s = shotOf(plan, 'c'), t = s.t0 + 0.5, cam = s.cameraAt(t), a = actorAt(plan, t, 'hare');
  const st = plan.actorsAt(t).find(q => q.id === 'hare'), g = gradeFocus(s, [st], new Map([['hare', { head: a.head }]]), cam.zoom, cam), b = a.headBox;
  assert.ok(Math.abs(g.r - 0.5 * Math.hypot(b[2] - b[0], b[3] - b[1]) * 1.6) < 1e-6, `focus radius ${g.r.toFixed(1)} from the head as drawn`);
});
