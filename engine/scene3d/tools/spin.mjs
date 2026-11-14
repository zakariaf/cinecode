// Spin test (a gate): each character, frozen in one pose, turns 360 degrees in 1 degree steps before a fixed camera,
// and the change from each frame to the next is measured in boxes round the head, the neck, the shoulders and the
// upper arms (the cat: head and tail) and round the whole figure. A smooth turn changes about as much from one degree
// to the next as from the degrees round it; a part that jumps (a shoulder poking through a sleeve, an arm or a line
// that appears or vanishes) stands out above them. The spike ratio of a pair is its change over the median of the
// ten pairs round it. Gate: under 1.4 in every box (the spin study, scratchpad/spin: clean renders gave at most 1.29;
// a 1 cm lift of the arm at the shoulder, switched on in one frame, gave 1.44 to 1.69).
// The studio of the character sheets (tools/studio.mjs) with the film's ink line on; no motion blur, the same grain
// in every frame (render(0)), so only the turn changes the picture.
// The moving spins (MOVES): each character turns by its own verbs instead of being turned, 90 degrees at a time
// through a whole turn, from standing and out of a walk (the cat: on the spot and out of a trot), filmed from a
// fixed camera close on the upper body (the cat: on the whole cat) 120 times a second; the boxes follow the
// bones. The face is held still (blinks and eye darts are meant to be quick: here only the body is judged). The
// same spike ratio (see spikes) and the same gate.
//   node engine/scene3d/tools/spin.mjs OUT_DIR [man-stand girl-run man-turn ...]   (default: all twenty spins and ten moving spins; the boy's and dad's (the man in work clothes) take their names)
//   → OUT_DIR/<spin>.mp4 (720x720, 360 frames; a moving spin: its length at 24 fps, every fifth frame), OUT_DIR/<spin>.jpg
//     (a moving spin's strip, every 0.25 s), OUT_DIR/worst.jpg (each spin's worst pair: frame k, k+1, their
//     difference x4); the numbers on stdout; exit 1 if a box is at or above the gate
import fs from 'node:fs';
import path from 'node:path';
import { studio } from './studio.mjs';
import { buildCharacter } from '../character.mjs';
import { createBiped, defaultPose } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
import { createQuadruped, createCritter } from '../quadruped.mjs';
import { saveImage, tile, encoder } from '../img.mjs';
import { RIGS, descOf } from '../library.mjs';

const GATE = 1.4, W = 720, H = 720, FOV = 20, N = 360;
// (cast entries, as a storyboard's: dad is the man in his work clothes, his case hanging from his hand)
const CAST = { man: { rig: 'man' }, girl: { rig: 'girl' }, cat: { rig: 'cat' }, boy: { rig: 'boy' }, dad: { rig: 'man', params: { wardrobe: 'work' } } };
const SPINS = {
  'man-stand': ['man', 'stand', 'full'], 'man-walk': ['man', 'walk', 'full'], 'man-wave': ['man', 'wave', 'full'],
  'girl-stand': ['girl', 'stand', 'full'], 'girl-run': ['girl', 'run', 'full'], 'cat-stand': ['cat', 'stand', 'full'],
  'cat-sit': ['cat', 'sit', 'full'], 'man-walk-close': ['man', 'walk', 'close'], 'girl-run-close': ['girl', 'run', 'close'],
  'boy-stand': ['boy', 'stand', 'full'], 'boy-run': ['boy', 'run', 'full'], 'boy-run-close': ['boy', 'run', 'close'], 'boy-wave': ['boy', 'wave', 'full'],
  'dad-stand': ['dad', 'stand', 'full'], 'dad-walk': ['dad', 'walk', 'full'], 'dad-walk-close': ['dad', 'walk', 'close'],
  // the bent poses, where clothes come apart from the body if they are going to
  'boy-sit': ['boy', 'sit', 'full'], 'boy-sit-close': ['boy', 'sit', 'close'], 'boy-jump': ['boy', 'jumpclap', 'full'],
  'dad-crouch': ['dad', 'crouch', 'full'], 'dad-crouch-close': ['dad', 'crouch', 'close'],
};
const MOVES = {
  'man-turn': ['man', 'stand'], 'man-walk-turn': ['man', 'walk'], 'girl-turn': ['girl', 'stand'], 'girl-walk-turn': ['girl', 'walk'],
  'cat-turn': ['cat', 'stand'], 'cat-trot-turn': ['cat', 'trot'],
  'boy-turn': ['boy', 'stand'], 'boy-walk-turn': ['boy', 'walk'], 'dad-turn': ['dad', 'stand'], 'dad-walk-turn': ['dad', 'walk'],
};
// a performer for CAST[who], with its rig's own options (a film's: compile.mjs performerOf)
const performer = (who, ch, o) => createPerformer(createBiped(ch), { ...RIGS[CAST[who].rig].performer, ...o });
const RATE = 120;
const [outDir, ...asked] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const stage = await studio(W, H), { THREE, camera } = stage;
stage.look.ink.value = 0.9;

// the time in [a, b] at which the left arm is furthest forward of the right
const mostSwung = (act, a, b) => { let best = a, s = -1e9; for (let t = a; t <= b; t += 0.005) { const p = act.poseAt(t).pose, d = p.armL.swing - p.armR.swing; if (d > s) { s = d; best = t; } } return best; };
// pose the character at one frozen time with the motion system's own verbs; → the vertical axis it turns about, its size
function pose(ch, who, kind) {
  ch.group.position.set(0, 0, 0); ch.group.rotation.set(0, 0, 0);
  if (ch.desc.kind === 'quadruped') { createCritter(createQuadruped(ch), { at: [0, 0, 0], yaw: 0, sit: kind === 'sit' ? 1 : 0 }).apply(0.4); return { axis: [0, 0], size: 1 }; }
  const R = RIGS[CAST[who].rig], act = performer(who, ch, { at: [0, -3], yaw: 0 });
  let t = 0.4;
  if (kind === 'walk') { act.walkTo([0, 3], { t0: 0.2, ...R.walk }); t = mostSwung(act, 1.6, 3.0); }   // at its film pace (the man's is Scene Zero's walk)
  if (kind === 'run') { act.runTo([0, 3], { t0: 0.2, ...R.run }); t = mostSwung(act, 1.0, 2.0); }     // (the girl's, Scene Zero's run)
  if (kind === 'wave') { act.wave({ t0: 0.5, dur: 3 }); t = 1.5; }
  if (kind === 'sit') { act.sit({ t0: 0.2 }); t = 2; }
  if (kind === 'crouch') { act.crouch({ t0: 0.2, amount: 0.8 }); t = 2; }
  if (kind === 'jumpclap') { act.jump({ t0: 0.5 }); act.clap({ t0: 0.4, dur: 1.6 }); t = 0.95; }
  act.apply(t);
  const p = ch.bones.pelvis.getWorldPosition(new THREE.Vector3());
  return { axis: [p.x, p.z], size: act.opts.size, note: `t = ${t.toFixed(3)} s` };
}
function setYaw(ch, axis, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  ch.group.rotation.set(0, yaw, 0);
  ch.group.position.set(-(axis[0] * c + axis[1] * s), 0, -(-axis[0] * s + axis[1] * c));
  ch.group.updateMatrixWorld(true);
}
// every skinned vertex relative to the axis, and apart the ones carried mostly by the bones of each group
function posedPoints(ch, axis, groups) {
  const v = new THREE.Vector3(), all = [], sub = Object.fromEntries(Object.keys(groups).map((g) => [g, []]));
  for (const mesh of Object.values(ch.meshes)) {
    const g = mesh.geometry.attributes, sw = g.skinWeight;
    for (let i = 0; i < g.position.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); all.push(v.x - axis[0], v.y, v.z - axis[1]);
      let b = 0; for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, b)) b = j;
      const bone = ch.skeleton.bones[g.skinIndex.getComponent(i, b)].name;
      for (const k in groups) if (groups[k].test(bone)) sub[k].push(v.x - axis[0], v.y, v.z - axis[1]);
    }
  }
  return { all, ...sub };
}
const VP = new THREE.Matrix4();
function setCam(cy, d) {
  stage.setCamera({ pos: [0, cy + d * 0.12 / 3.6, d], target: [0, cy, 0], fov: FOV });
  camera.updateMatrixWorld(true);
  VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}
// a point (relative to the axis) turned by yaw → [x, y] pixels and pixels per metre at its depth
function project(x, y, z, yaw) {
  const e = VP.elements, cs = Math.cos(yaw), sn = Math.sin(yaw), X = x * cs + z * sn, Z = -x * sn + z * cs;
  const w = e[3] * X + e[7] * y + e[11] * Z + e[15];
  return [((e[0] * X + e[4] * y + e[8] * Z + e[12]) / w * 0.5 + 0.5) * W, (0.5 - (e[1] * X + e[5] * y + e[9] * Z + e[13]) / w * 0.5) * H, (H / 2) * camera.projectionMatrix.elements[5] / w];
}
const box = (x0, y0, x1, y1) => [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))];
function bboxOf(pts, yaw, step = 1, pad = 3) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 3 * step) { const [x, y] = project(pts[i], pts[i + 1], pts[i + 2], yaw); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return box(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
}
// a fixed camera in which pts, over the whole turn, fill `fill` of the frame
function fit(pts, fill) {
  let cy = 1, d = 6;
  for (let it = 0; it < 14; it++) {
    setCam(cy, d);
    let u = [1e9, 1e9, -1e9, -1e9];
    for (let k = 0; k < 360; k += 5) { const b = bboxOf(pts, k * Math.PI / 180, 5, 0); u = [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]; }
    cy -= (((u[1] + u[3]) / 2 - H / 2) / (H / 2)) * d * Math.tan(FOV * Math.PI / 360);
    d *= Math.max((u[2] - u[0]) / W, (u[3] - u[1]) / H) / fill;
  }
  setCam(cy, d);
}
// mean absolute difference of R, G, B inside a box
function boxMad(a, b, [x0, y0, x1, y1]) {
  let s = 0;
  for (let y = y0; y < y1; y++) for (let i = (y * W + x0) * 4, e = (y * W + x1) * 4; i < e; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  const n = (x1 - x0) * (y1 - y0) * 3;
  return n > 0 ? s / n : 0;
}
const median = (v) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pair = (k) => `${String(k).padStart(3, '0')}->${String((k + 1) % N).padStart(3, '0')}`;

const rows = [];
let worstAll = 0;
// the worst spike of each box: a change over the median of the ten changes round it (round the ends for a whole turn).
// A moving spin also holds still between its turns, where the changes round a pair are next to nothing (breathing):
// there a change is measured against a fifth of the box's usual change while it moves (its 90th percentile), not the
// near-nothing round it. And as a turn sets off, every change grows from that near-nothing for a few frames: so in a
// moving spin a change is a spike only above both the changes before it and the changes after it (the larger of the
// two medians of five).
function spikes(d, n, cyclic) {
  let worst = { ratio: 0 };
  const line = [];
  for (const [r, v] of Object.entries(d)) {
    let top = { ratio: 0 };
    const floor = cyclic ? 1e-9 : 0.2 * [...v].sort((a, b) => a - b)[Math.floor(0.9 * v.length)];
    v.forEach((x, k) => {
      if (!cyclic && (k < 5 || k >= n - 5)) return;
      const nb = []; for (let j = -5; j <= 5; j++) if (j) nb.push(v[(k + j + n) % n]);
      const ref = cyclic ? median(nb) : Math.max(median(nb.slice(0, 5)), median(nb.slice(5)));
      const ratio = x / Math.max(ref, floor); if (ratio > top.ratio) top = { ratio, k, r };
    });
    line.push(`${r} ${top.ratio.toFixed(2)}@${cyclic ? pair(top.k) : top.k}`);
    if (top.ratio > worst.ratio) worst = top;
  }
  return { worst, line };
}
const mark = (imgs, [x0, y0, x1, y1]) => { for (const img of imgs) { for (let x = x0; x < x1; x++) for (const y of [y0, y1 - 1]) img.set([255, 40, 40], (y * W + x) * 4); for (let y = y0; y < y1; y++) for (const x of [x0, x1 - 1]) img.set([255, 40, 40], (y * W + x) * 4); } };
const diffOf = (a, b) => { const diff = Buffer.alloc(W * H * 4, 255); for (let i = 0; i < diff.length; i += 4) for (let c = 0; c < 3; c++) diff[i + c] = Math.min(255, 4 * Math.abs(a[i + c] - b[i + c])); return diff; };

// A moving spin: the plan, then every 1/RATE s a frame and the boxes round the bones.
async function moving(name) {
  const [who, kind] = MOVES[name], ch = buildCharacter(descOf(CAST[who])), four = ch.desc.kind === 'quadruped';
  ch.group.position.set(0, 0, 0); ch.group.rotation.set(0, 0, 0);
  stage.scene.add(ch.group);
  let act, size = 1;
  if (four) {
    act = createCritter(createQuadruped(ch), { at: [0, 0, -0.25], yaw: 0 });
    act.wait(0.4);
    if (kind === 'stand') for (let k = 1; k <= 4; k++) { act.turnTo(k * Math.PI / 2); act.wait(0.5); }
    else for (const p of [[0, 0, 0.25], [0.5, 0, 0.25], [0.5, 0, -0.25], [0, 0, -0.25]]) { act.trotTo(p); act.wait(0.3); }
  } else {
    // (walking: round a square from one corner, turning out of each side's last step)
    const h = 0.45 * createPerformer(createBiped(ch)).opts.size;
    act = performer(who, ch, { at: kind === 'stand' ? [0, 0] : [-h, -h], yaw: 0 });
    size = act.opts.size;
    act.wait(0.4);
    if (kind === 'stand') for (let k = 1; k <= 4; k++) { act.turnTo(k * Math.PI / 2); act.wait(0.5); }
    // (at the pace a film walks it: library.mjs RIGS; the performer's default stride, 0.5 m, is too long for the girl)
    else { [[-h, h], [h, h], [h, -h], [-h, -h]].forEach((p, k) => act.walkTo(p, { face: (k + 1) * Math.PI / 2, ...RIGS[CAST[who].rig].walk })); act.wait(0.6); }
  }
  const T = act.time, N = Math.round(T * RATE);
  const at = (j) => ch.bones[j].getWorldPosition(new THREE.Vector3());
  const J = four ? ['head', 'chest', 'hips', 'tail3', 'tail5'] : ['head', 'neck', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'chest'];
  // a fixed camera: everything those bones reach over the whole plan (and, above the waist, a head's height)
  const pts = [];
  for (let k = 0; k <= N; k += 6) { act.apply(k / RATE); for (const j of J) { const p = at(j); pts.push(p.x, p.y, p.z); if (j === 'head') pts.push(p.x, p.y + (four ? 0.08 : 0.25 * size), p.z); } if (four) for (const j of ['fPawL', 'hFootR']) { const p = at(j); pts.push(p.x, 0, p.z); } }
  fit(pts, 0.8);
  const boxes = () => {
    const pj = Object.fromEntries(J.map((j) => { const p = at(j); return [j, project(p.x, p.y, p.z, 0)]; })), f = {};
    if (four) {
      const hd = pj.head, r = 0.08 * hd[2];
      f.head = box(hd[0] - r, hd[1] - r, hd[0] + r, hd[1] + r);
      f.tail = box(Math.min(pj.tail3[0], pj.tail5[0]) - 0.04 * hd[2], Math.min(pj.tail3[1], pj.tail5[1]) - 0.04 * hd[2], Math.max(pj.tail3[0], pj.tail5[0]) + 0.04 * hd[2], Math.max(pj.tail3[1], pj.tail5[1]) + 0.04 * hd[2]);
      return f;
    }
    const n = pj.neck, hd = pj.head, S = size;
    f.head = box(hd[0] - 0.17 * S * hd[2], hd[1] - 0.3 * S * hd[2], hd[0] + 0.17 * S * hd[2], hd[1] + 0.04 * S * hd[2]);
    f.neck = box(n[0] - 0.17 * S * n[2], n[1] - 0.11 * S * n[2], n[0] + 0.17 * S * n[2], n[1] + 0.11 * S * n[2]);
    for (const s of ['L', 'R']) {
      const sh = pj['upperArm' + s], el = pj['foreArm' + s], r = 0.15 * S * sh[2], pad = 0.13 * S * sh[2];
      f['shoulder' + s] = box(sh[0] - r, sh[1] - r, sh[0] + r, sh[1] + r);
      f['upperArm' + s] = box(Math.min(sh[0], el[0]) - pad, Math.min(sh[1], el[1]) - pad, Math.max(sh[0], el[0]) + pad, Math.max(sh[1], el[1]) + pad);
    }
    return f;
  };
  const frame = async (k) => { act.apply(k / RATE); ch.face.set(defaultPose().face); ch.group.updateMatrixWorld(true); return Buffer.from(await stage.render(0)); };
  const video = encoder(path.join(outDir, name + '.mp4'), W, H, 24), d = {}, strip = [];
  let prev = null, prevBoxes = null, ms = 0;
  for (let k = 0; k <= N; k++) {
    const t0 = performance.now(), px = await frame(k), b = boxes();
    if (k) ms += performance.now() - t0;
    if (k % 5 === 0) await video.write(px);
    if (k % 30 === 0) strip.push(px);
    if (prev) for (const [r, bx] of Object.entries(prevBoxes)) (d[r] ??= [])[k - 1] = boxMad(prev, px, bx);
    prev = px; prevBoxes = b;
  }
  await video.end();
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(d));   // (every box's change, pair by pair)
  const again = await frame(0);
  const { worst, line } = spikes(d, N, false);
  console.log(`${name.padEnd(15)} worst ${worst.ratio.toFixed(2)} (${worst.r} ${worst.k}->${worst.k + 1}, ${(worst.k / RATE).toFixed(3)} s)  ${(ms / N).toFixed(1)} ms/frame  ${N + 1} frames  repeat diff ${boxMad(strip[0], again, [0, 0, W, H]).toFixed(4)}\n    ${line.join('  ')}`);
  const s = tile(strip, W, H, 8);
  saveImage(path.join(outDir, name + '.jpg'), s.px, s.w, s.h, { scaleTo: 2400 });
  const a = await frame(worst.k), bx = boxes()[worst.r], b2 = await frame(worst.k + 1), diff = diffOf(a, b2);
  mark([a, b2, diff], bx);
  rows.push(a, b2, diff);
  stage.scene.remove(ch.group);
  return worst.ratio;
}

for (const name of asked.length ? asked.filter((n) => MOVES[n]) : Object.keys(MOVES)) worstAll = Math.max(worstAll, await moving(name));
for (const name of asked.length ? asked.filter((n) => SPINS[n]) : Object.keys(SPINS)) {
  const [who, kind, framing] = SPINS[name], ch = buildCharacter(descOf(CAST[who])), four = ch.desc.kind === 'quadruped';
  stage.scene.add(ch.group);
  const top = Math.max(...Object.values(ch.rest).map((v) => v.y)) * (four ? 1.75 : 1.17);
  stage.aim([0, top / 2, 0], top);
  const P = pose(ch, who, kind), PP = posedPoints(ch, P.axis, four ? { head: /^(head|ear[LR])$/, tail: /^tail\d$/ } : { head: /^(head|bun[LR])$/ });
  const waist = ch.bones.spine.getWorldPosition(new THREE.Vector3()).y;
  fit(framing === 'close' ? PP.all.filter((_, i, a) => a[i - (i % 3) + 1] >= waist) : PP.all, framing === 'close' ? 0.9 : 0.85);
  const J = four ? {} : Object.fromEntries(['neck', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR'].map((j) => { const p = ch.bones[j].getWorldPosition(new THREE.Vector3()); return [j, [p.x - P.axis[0], p.y, p.z - P.axis[1]]]; }));
  // the boxes of frame k
  const boxes = (yaw) => {
    const f = { figure: bboxOf(PP.all, yaw), head: bboxOf(PP.head, yaw) };
    if (four) { f.tail = bboxOf(PP.tail, yaw); return f; }
    const pj = Object.fromEntries(Object.entries(J).map(([n, p]) => [n, project(...p, yaw)])), S = P.size, n = pj.neck;
    f.neck = box(n[0] - 0.17 * S * n[2], n[1] - 0.11 * S * n[2], n[0] + 0.17 * S * n[2], n[1] + 0.11 * S * n[2]);
    for (const s of ['L', 'R']) {
      const sh = pj['upperArm' + s], el = pj['foreArm' + s], r = 0.15 * S * sh[2], pad = 0.13 * S * sh[2];
      f['shoulder' + s] = box(sh[0] - r, sh[1] - r, sh[0] + r, sh[1] + r);
      f['upperArm' + s] = box(Math.min(sh[0], el[0]) - pad, Math.min(sh[1], el[1]) - pad, Math.max(sh[0], el[0]) + pad, Math.max(sh[1], el[1]) + pad);
    }
    return f;
  };
  const frame = async (k) => { setYaw(ch, P.axis, k * Math.PI / 180); return Buffer.from(await stage.render(0)); };
  const video = encoder(path.join(outDir, name + '.mp4'), W, H, 24), d = {};
  let first = null, prev = null, ms = 0;
  for (let k = 0; k <= N; k++) {
    const t0 = performance.now(), px = k < N ? await frame(k) : first;
    if (k > 0 && k < N) ms += performance.now() - t0;
    if (k < N) await video.write(px);
    if (prev) for (const [r, b] of Object.entries(boxes((k - 1) * Math.PI / 180))) (d[r] ??= [])[k - 1] = boxMad(prev, px, b);
    first ??= px; prev = px;
  }
  await video.end();
  const again = await frame(0), repeat = boxMad(first, again, [0, 0, W, H]);
  // spike ratios, and the worst box of the spin
  const { worst, line } = spikes(d, N, true);
  worstAll = Math.max(worstAll, worst.ratio);
  console.log(`${name.padEnd(15)} worst ${worst.ratio.toFixed(2)} (${worst.r} ${pair(worst.k)})  ${(ms / (N - 1)).toFixed(1)} ms/frame  repeat diff ${repeat.toFixed(4)}  ${P.note ?? ''}\n    ${line.join('  ')}`);
  // its worst pair, and how they differ (x4)
  const a = await frame(worst.k), b = await frame((worst.k + 1) % N), diff = diffOf(a, b);
  mark([a, b, diff], boxes(worst.k * Math.PI / 180)[worst.r]);
  rows.push(a, b, diff);
  stage.scene.remove(ch.group);
}
const s = tile(rows, W, H, 3);
saveImage(path.join(outDir, 'worst.jpg'), s.px, s.w, s.h, { scaleTo: 1440 });
console.log(`worst spike ratio ${worstAll.toFixed(2)} (gate ${GATE})`);
stage.close();
process.exit(worstAll < GATE ? 0 : 1);
