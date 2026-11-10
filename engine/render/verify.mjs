// Quality gates for a piece built for a film: a rig, a set kit, an effect. Each runs automatic contract checks and
// writes review images that must be looked at before the piece goes into a film (the CLI's verify-rig, verify-kit
// and verify-effect print the checks and exit 1 when one fails).
//   verifyRig(rig) → [{ name, ok, detail }]                 rigReview(rig, outDir) → [image paths]
//   verifyKit(kit, name) → [{ name, ok, detail }]           kitReview(name, outDir) → [image paths]
//   verifyEffects(film, plan, names) → [{ name, ok, detail }] effectReview(plan, effects, outPath) → path
// Rendering is deterministic and stateless, so every check that compares pixels compares exact pixels.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { castSheet } from '../cast/sheet.mjs';
import { getRig } from '../cast/index.mjs';
import { clampCamera, pointInPoly, inEllipse, SKY_TIMES, MAX_VIEW } from '../set/set.mjs';
import { getKit } from '../set/kits/index.mjs';
import { renderSet, setSheet } from '../set/sheet.mjs';
import { hasLight } from '../film/grade.mjs';
import { AMBIENCE_NAMES } from '../audio/sfx.mjs';
import { parseTarget } from '../film/util.mjs';

const finite = v => typeof v === 'number' && Number.isFinite(v);
const check = (name, problems, detail = '') => ({ name, ok: problems.length === 0, detail: problems.length ? problems.slice(0, 6).join('; ') + (problems.length > 6 ? `; … ${problems.length - 6} more` : '') : detail });
const attempt = (name, fn) => { try { return fn(); } catch (e) { return { name, ok: false, detail: `threw: ${e.message}` }; } };
const LAYERS = ['sky', 'back', 'depth', 'world', 'front', 'grade', 'screen'];   // as validate.mjs OVERLAY_LAYERS

// ───────────── rigs ─────────────

// Every drawable state of a rig: poses, 4 phases of each gait, each gesture's key frames.
function bodyStates(rig) {
  const S = [], base = rig.poses.stand;
  for (const [n, p] of Object.entries(rig.poses)) S.push([n, { pose: p }]);
  for (const [g, fn] of Object.entries(rig.gaits || {})) for (const ph of [0, 0.25, 0.5, 0.75]) S.push([`${g}@${ph}`, { pose: fn(ph) }]);
  for (const [g, G] of Object.entries(rig.gestures || {})) for (const u of (G.keys?.length ? G.keys : [0.25, 0.5, 0.75])) S.push([`${g}@${u}`, { pose: G.at(u, base) }]);
  return S;
}
// Draw a state on its own canvas, the contact point at integer (x, y), with room around the tracked bounds.
function paintAt(rig, st, s, face, frame = null) {
  const b = frame || rig.draw(null, 0, 0, s, face, st).bounds, pad = Math.ceil(16 + 0.25 * Math.max(b[2] - b[0], b[3] - b[1]));
  const x = Math.round(pad - b[0]), y = Math.round(pad - b[1]), w = Math.ceil(b[2] - b[0]) + 2 * pad, h = Math.ceil(b[3] - b[1]) + 2 * pad;
  const cv = createCanvas(w, h), ctx = cv.getContext('2d'), res = rig.draw(ctx, x, y, s, face, st);
  return { w, h, x, y, res, data: ctx.getImageData(0, 0, w, h).data };
}
function inkBox({ data, w, h }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (data[(j * w + i) * 4 + 3] > 2) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
// The lowest painted row (alpha > 40) below the contact point, in units (+ = under the ground).
function sink(rig, pose, s) { const R = paintAt(rig, { pose, shadow: false, t: 0.5 }, s, 1); let low = -1; for (let j = R.h - 1; j >= 0 && low < 0; j--) for (let i = 0; i < R.w; i++) if (R.data[(j * R.w + i) * 4 + 3] > 40) { low = j; break; } return (low + 1 - R.y) / s; }
// Pixels that differ between two same-sized renders, optionally only inside a box.
function diff(a, b, box = null) {
  const [x0, y0, x1, y1] = box ? box.map(Math.round) : [0, 0, a.w, a.h];
  let n = 0;
  for (let j = Math.max(0, y0); j < Math.min(a.h, y1); j++) for (let i = Math.max(0, x0); i < Math.min(a.w, x1); i++) {
    const k = (j * a.w + i) * 4, d = a.data, e = b.data;
    if (Math.abs(d[k] - e[k]) + Math.abs(d[k + 1] - e[k + 1]) + Math.abs(d[k + 2] - e[k + 2]) + Math.abs(d[k + 3] - e[k + 3]) > 12) n++;
  }
  return n;
}

/** Contract checks for a rig object (DESIGN.md §2): → [{ name, ok, detail }]. */
export function verifyRig(rig) {
  const out = [];
  // contract fields
  const c = [];
  if (typeof rig?.kind !== 'string' || !rig.kind) c.push('kind must be a non-empty string');
  if (typeof rig?.draw !== 'function' || typeof rig?.bbox !== 'function') c.push('draw() and bbox() are required (makeRig gives both)');
  if (c.length) return [check('contract', c)];
  if (typeof rig.label !== 'string') c.push('label must be a string');
  for (const f of ['height', 'headHeight', 'width']) if (!finite(rig[f]) || rig[f] <= 0) c.push(`${f} must be a number > 0`);
  if (rig.headHeight > rig.height + 1e-9) c.push('headHeight is larger than height');
  if (!rig.params || typeof rig.params !== 'object') c.push('params must be an object');
  if (!rig.poses?.stand) c.push('poses.stand is required');
  for (const [n, p] of Object.entries(rig.poses || {})) for (const [k, v] of Object.entries(p)) if (!finite(v)) c.push(`pose ${n}.${k} is not a number`);
  if (typeof rig.gaits?.walk !== 'function' && typeof rig.gaits?.fly !== 'function') c.push('gaits.walk (or fly, for a flier) is required: moves use it');
  for (const g of Object.keys(rig.gaits || {})) {
    if (typeof rig.gaits[g] !== 'function') c.push(`gait ${g} must be a function of the phase`);
    if (!(rig.speeds?.[g] > 0) || !(rig.stride?.[g] > 0)) c.push(`gait ${g} needs speeds.${g} and stride.${g} > 0`);
  }
  for (const [n, G] of Object.entries(rig.gestures || {})) {
    if (!(G.dur > 0) || typeof G.at !== 'function') { c.push(`gesture ${n} needs dur > 0 and at(u, base)`); continue; }
    for (const u of [0, 0.5, 1]) for (const [k, v] of Object.entries(G.at(u, rig.poses.stand))) if (!finite(v)) c.push(`gesture ${n}(${u}).${k} is not a number`);
  }
  if (!Array.isArray(rig.expressions) || !rig.expressions.includes('neutral')) c.push('expressions must be an array that includes "neutral"');
  if (typeof rig.perch !== 'boolean' || typeof rig.flies !== 'boolean') c.push('perch and flies must be booleans');
  out.push(check('contract', c, `${Object.keys(rig.poses).length} poses, ${Object.keys(rig.gaits).length} gaits, ${Object.keys(rig.gestures || {}).length} gestures, ${rig.expressions.length} expressions`));
  if (c.length) return out;

  const stand = rig.poses.stand, states = bodyStates(rig), face = rig.expressions.length > 1;
  const S = 120 / Math.max(rig.height, rig.width);

  // anchors, bbox, declared size
  out.push(attempt('size', () => {
    const p = [], r = rig.draw(null, 100, 200, 2, 1, { pose: stand, shadow: false }), b = rig.bbox(stand);
    for (const q of [r.head, r.mouth]) if (!Array.isArray(q) || !q.every(finite)) p.push('draw() must return head and mouth points');
    const [x0, y0, x1, y1] = r.bounds, m = 8;
    for (const [nm, q] of [['head', r.head], ['mouth', r.mouth]]) if (!(q[0] >= x0 - m && q[0] <= x1 + m && q[1] >= y0 - m && q[1] <= y1 + m)) p.push(`the ${nm} anchor is outside the drawing`);
    for (let i = 0; i < 4; i++) if (Math.abs((r.bounds[i] - [100, 200, 100, 200][i]) / 2 - b[i]) > 0.6) { p.push('bbox(pose) is not the drawing at scale 1'); break; }
    const low = sink(rig, stand, S);
    if (Math.abs(low) > Math.max(2 / S, 0.85)) p.push(`stand: the lowest painted point is ${Math.abs(low).toFixed(2)} units ${low < 0 ? 'above' : 'below'} the contact point (the feet must touch it)`);
    const drawn = -b[1];
    if (Math.abs(drawn - rig.height) / rig.height > 0.12) p.push(`height ${rig.height} but stand is drawn ${drawn.toFixed(1)} tall (framing uses height)`);
    const l = rig.draw(null, 0, 0, 2, 1, { pose: stand, lift: 10, shadow: false }).bounds;
    if (Math.abs(l[3] - (b[3] * 2 - 20)) > 1.2) p.push('st.lift does not raise the drawing');
    return check('size', p, `stand ${(b[2] - b[0]).toFixed(1)} × ${drawn.toFixed(1)} units (height ${rig.height}, width ${rig.width})`);
  }));

  // everything drawn lies inside the bounds draw() reports, both facings (framing, captions and lint read them)
  out.push(attempt('bounds', () => {
    const p = [], extra = face ? [...rig.expressions.map(e => [e, { pose: stand, expr: e }]), ['talk', { pose: stand, talk: 1 }], ['blink', { pose: stand, blink: 1 }]] : [];
    let n = 0;
    for (const f of [1, -1]) for (const [nm, st0] of [...states, ...extra]) {
      const st = { shadow: false, t: 0.5, ...st0 }, R = paintAt(rig, st, S, f), ink = inkBox(R), b = R.res.bounds;
      n++;
      if (!ink) { p.push(`${nm}${f < 0 ? ' (face -1)' : ''} draws nothing`); continue; }
      const tol = 2.5 + 0.02 * (b[2] - b[0] + b[3] - b[1]);
      if (ink[0] < b[0] - tol || ink[1] < b[1] - tol || ink[2] > b[2] + tol || ink[3] > b[3] + tol) p.push(`${nm}${f < 0 ? ' (face -1)' : ''} paints outside its bounds (pixels ${ink.map(Math.round)} vs bounds ${b.map(Math.round)})`);
    }
    return check('bounds', p, `${n} states, both facings: every pixel inside the reported bounds`);
  }));

  // nothing goes through the ground (hangPoses drape below the contact on purpose; a seat pose sits on a seat)
  out.push(attempt('ground', () => {
    const p = [], tol = Math.max(2 / S, 0.85), low = (nm, pose) => { const d = sink(rig, pose, S); if (d > tol) p.push(`${nm} ${d.toFixed(2)} units below the ground`); };
    for (const [n, q] of Object.entries(rig.poses)) if (!(rig.hangPoses || []).includes(n) && !(q.seat > 0)) low(n, q);
    for (const [g, fn] of Object.entries(rig.gaits)) for (let i = 0; i < 16; i++) low(`${g}@${i / 16}`, fn(i / 16));
    for (const [g, G] of Object.entries(rig.gestures || {})) for (let i = 0; i <= 12; i++) low(`${g}@${(i / 12).toFixed(2)}`, G.at(i / 12, stand));
    return check('ground', p, 'every pose, gait phase and gesture frame stays on or above the ground');
  }));

  // facing -1 is the mirror image: mirrored bounds, mirrored silhouette
  out.push(attempt('flip', () => {
    const p = [];
    for (const [nm, st0] of states) {
      const st = { shadow: false, t: 0.5, ...st0 }, b = rig.bbox(st.pose, 1), bm = rig.bbox(st.pose, -1);
      if ([-b[2], b[1], -b[0], b[3]].some((v, i) => Math.abs(v - bm[i]) > 1e-6)) { p.push(`${nm}: bbox(pose, -1) is not the mirror of bbox(pose, 1)`); continue; }
      const A = paintAt(rig, st, S, 1), B = paintAt(rig, st, S, -1);
      let un = 0, xo = 0;
      for (let j = 0; j < A.h; j++) for (let i = 0; i < A.w; i++) {
        const a = A.data[(j * A.w + i) * 4 + 3] > 40, bi = B.x + (A.x - i - 1), bj = j - A.y + B.y;
        const bb = bi >= 0 && bi < B.w && bj >= 0 && bj < B.h && B.data[(bj * B.w + bi) * 4 + 3] > 40;
        if (a || bb) un++; if (a !== bb) xo++;
      }
      if (un && xo / un > 0.06) p.push(`${nm}: face -1 is not the mirror image (${(100 * xo / un).toFixed(1)}% of the silhouette differs)`);
    }
    return check('flip', p, `${states.length} states: face -1 mirrors face 1`);
  }));

  // the same state draws the same pixels, whatever was drawn before (frames are drawn out of order)
  out.push(attempt('deterministic', () => {
    const st = { pose: stand, t: 1.25, breath: 0.4, look: 0.3, shadow: false }, other = states[states.length - 1][1];
    const box = rig.draw(null, 0, 0, S, 1, st).bounds, a = paintAt(rig, st, S, 1, box);
    paintAt(rig, { ...other, expr: rig.expressions.at(-1), talk: 0.7, t: 3.3, shadow: false }, S, -1);
    const b = paintAt(rig, st, S, 1, box);
    return check('deterministic', diff(a, b) ? ['the same state drew different pixels (Math.random, Date.now or state kept between calls?)'] : [], 'identical pixels for the same state, before and after drawing others');
  }));

  // the face: every expression reads, talking moves the mouth, a blink closes the eyes
  if (!face) out.push({ name: 'face', ok: true, detail: 'no face (expressions: ["neutral"]): talk, blink and expressions not checked' });
  else out.push(attempt('face', () => {
    const p = [], s = Math.min(90 / rig.headHeight, 600 / Math.max(rig.height, rig.width)), base = { pose: stand, shadow: false, t: 0.5 };
    const frame = rig.draw(null, 0, 0, s, 1, { ...base, talk: 1 }).bounds, f2 = rig.draw(null, 0, 0, s, 1, base).bounds;
    const box = [Math.min(frame[0], f2[0]), Math.min(frame[1], f2[1]), Math.max(frame[2], f2[2]), Math.max(frame[3], f2[3])];
    const N = paintAt(rig, base, s, 1, box), hh = rig.headHeight * s;
    const head = [N.res.head[0] - hh * 0.75, N.res.head[1] - hh * 0.75, N.res.head[0] + hh * 0.75, N.res.head[1] + hh * 0.75];
    const mouth = [N.res.mouth[0] - hh * 0.4, N.res.mouth[1] - hh * 0.4, N.res.mouth[0] + hh * 0.4, N.res.mouth[1] + hh * 0.4];
    const need = Math.max(6, Math.round(hh * hh * 0.002)), seen = [];
    for (const e of rig.expressions.filter(e => e !== 'neutral')) {
      const d = diff(paintAt(rig, { ...base, expr: e }, s, 1, box), N, head);
      seen.push(`${e} ${d}`);
      if (d < need) p.push(`expression "${e}" looks like neutral (${d} px changed in the head)`);
    }
    const t = diff(paintAt(rig, { ...base, talk: 1 }, s, 1, box), N, mouth), b = diff(paintAt(rig, { ...base, blink: 1 }, s, 1, box), N, head);
    if (t < need) p.push(`talk 1 does not move the mouth region (${t} px)`);
    if (b < need) p.push(`blink 1 does not close the eyes (${b} px changed in the head)`);
    return check('face', p, `px changed vs neutral: talk ${t}, blink ${b}, ${seen.join(', ')}`);
  }));

  // gaits loop and plant their feet; gestures start and end on the pose they are given
  out.push(attempt('motion', () => {
    const p = [];
    for (const [g, fn] of Object.entries(rig.gaits)) {
      const a = fn(0), b = fn(1);
      for (const k of Object.keys(a)) if (Math.abs(a[k] - b[k]) > 1e-6) { p.push(`gait ${g}: phase 0 and 1 differ on ${k} (it must loop)`); break; }
      if (!rig.feet || ['fly', 'glide'].includes(g)) continue;
      const st = rig.stride[g], N = 120;
      for (let i = 0; i < N; i++) {
        const F = rig.feet(fn(i / N)), F2 = rig.feet(fn((i + 1) / N));
        F.forEach(([x, y, c], j) => { if (c && F2[j][2] && Math.abs(F2[j][0] - x + st / N) > 1e-3) p.push(`gait ${g}@${(i / N).toFixed(2)}: planted foot ${j} slides`); });
      }
      if (!rig.steps?.[g]) p.push(`gait ${g}: steps.${g} (phases where a foot lands, for footsteps) is missing`);
    }
    // a gesture's first and last frames draw like the pose it is given (else the actor pops into and out of it)
    for (const [n, G] of Object.entries(rig.gestures || {})) {
      if (G.keys?.includes(1)) continue;                    // one-way on purpose
      for (const bn of ['stand', 'sit', 'rest']) {
        const b = rig.poses[bn]; if (!b) continue;
        const B = paintAt(rig, { pose: b, shadow: false, t: 0.5 }, S, 1), box = B.res.bounds.map((v, i) => v - [B.x, B.y][i % 2]);
        let ink = 0; for (let k = 3; k < B.data.length; k += 4) if (B.data[k] > 40) ink++;
        for (const u of [0, 1]) { const d = diff(paintAt(rig, { pose: G.at(u, b), shadow: false, t: 0.5 }, S, 1, box), B); if (d > 0.03 * ink) p.push(`gesture ${n} does not ${u ? 'end' : 'start'} on ${bn} (${Math.round((100 * d) / ink)}% of the drawing differs)`); }
      }
    }
    return check('motion', [...new Set(p)], 'gaits loop (and planted feet hold still); gestures start and end on their base pose');
  }));
  return out;
}

/** Review images for a rig: its cast sheet with the debug overlay, and a size line-up with hare and human. */
export async function rigReview(rig, outDir) {
  mkdirSync(outDir, { recursive: true });
  const sheet = join(outDir, `${rig.kind}.jpg`), lineup = join(outDir, `${rig.kind}-lineup.jpg`);
  await castSheet([rig.kind], sheet, { debug: true });
  // everyone at scale 1.3 (a lane in the meadow) on one ground line: the new rig facing both ways, then references
  const refs = ['hare', 'human', 'mouse'].filter(k => getRig(k) && k !== rig.kind).map(getRig), s = 1.3;
  const cast = [[rig, 1], [rig, -1], ...refs.map(r => [r, 1])], H = Math.ceil(Math.max(...cast.map(([r]) => r.height)) * s + 90);
  const ws = cast.map(([r]) => Math.max(r.width, 40) * s + 40), W = Math.ceil(ws.reduce((a, b) => a + b, 0) + 40);
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.fillStyle = '#f4eee0'; ctx.fillRect(0, 0, W, H);
  const gy = H - 40;
  ctx.strokeStyle = 'rgba(120,100,80,.5)'; ctx.beginPath(); ctx.moveTo(10, gy + 0.5); ctx.lineTo(W - 10, gy + 0.5); ctx.stroke();
  let x = 20;
  ctx.font = '12px Georgia, serif'; ctx.fillStyle = '#4a3a44';
  cast.forEach(([r, f], i) => { const cx = x + ws[i] / 2; r.draw(ctx, cx, gy, s, f, { pose: r.poses.stand, t: 0.5 }); ctx.fillStyle = '#4a3a44'; ctx.fillText(`${r.kind}${f < 0 ? ' ←' : ''}`, cx - 20, H - 14); x += ws[i]; });
  writeFileSync(lineup, await cv.encode('jpeg', 88));
  return [sheet, lineup];
}

// ───────────── set kits ─────────────

// What check says when a film puts an actor at an anchor whose name it reads as something else (validate.mjs's
// checkTarget, on parseTarget): "left" and "right" are the sides actors enter and exit by, "x:…" a position, "near:…"
// and the like a place by an actor, and a name is letters, digits, _ . and - only. → that message | null (a usable name)
function reservedName(n) {
  const T = parseTarget(n);
  if (T.kind === 'name') return null;
  if (T.kind === 'side') return `"${n}" is only valid for enter/exit; use an anchor or "x:…" here`;
  if (T.kind === 'bad') return `not a place: ${JSON.stringify(n)} (use an anchor name, "x:1500", "x:1500,y:1060", "near:<actor>", "left-of:<actor>", "right-of:<actor>" or, for hop / place, "on:<actor>")`;
  return `"${n}" is read as ${T.kind === 'x' || T.kind === 'xy' ? 'a position' : `a place by "${T.who}"`}, never as this anchor`;
}

/** Contract checks for a kit function (DESIGN.md §3): → [{ name, ok, detail }]. */
export function verifyKit(kit, name = 'kit') {
  if (typeof kit !== 'function') return [check('contract', ['the default export must be a function (params) => set (use makeSet from cinecode/set)'])];
  let S;
  try { S = kit({}); } catch (e) { return [check('contract', [`calling the kit threw: ${e.message}`])]; }
  const out = [], c = [];
  for (const m of ['build', 'anchor', 'anchors', 'isWalkable', 'route', 'scaleAt', 'drawSky', 'drawBack', 'propsSorted', 'drawFront', 'colliders']) if (typeof S?.[m] !== 'function') c.push(`the set has no ${m}() (build it with makeSet)`);
  out.push(check('contract', c, `${S?.anchorNames?.length ?? 0} anchors, ${S?.props?.length ?? 0} props`));
  if (c.length) return out;

  out.push(attempt('anchors', () => {
    const p = [];
    if (S.anchorNames.length < 4) p.push(`${S.anchorNames.length} anchors: a kit needs at least 4`);
    for (const n of S.anchorNames) { const why = reservedName(n); if (why) p.push(`${n}: a reserved name, rename the anchor (check: ${why})`); }
    for (const a of S.anchors()) {
      if (!['ground', 'surface', 'perch', 'hollow', 'view'].includes(a.type)) p.push(`${a.name}: unknown type ${a.type}`);
      for (const f of ['x', 'y', 's', 'depth']) if (!finite(a[f])) p.push(`${a.name}.${f} is ${a[f]}`);
      if (!(a.s > 0.2 && a.s < 4)) p.push(`${a.name}: scale ${a.s?.toFixed?.(2)} (an actor there would be ${a.s < 1 ? 'tiny' : 'huge'})`);
      if (a.type === 'ground' && !S.isWalkable(a.x, a.y)) p.push(`${a.name} (${a.x}, ${a.y}) is not on walkable ground`);
      if (a.type === 'hollow' && !(Array.isArray(a.clip) && pointInPoly(a.clip, a.x, a.y - 4))) p.push(`${a.name}: the contact point is not inside its clip`);
      if (a.type === 'perch' && !(a.x >= a.range[0] && a.x <= a.range[1])) p.push(`${a.name}: not on its branch`);
    }
    return check('anchors', p, S.anchors().map(a => `${a.name} ${a.type[0]} s${a.s.toFixed(2)}`).join(', '));
  }));

  out.push(attempt('world', () => {
    const p = [];
    // a kit with times of its own (makeSet times) is checked on those, any other on Earth's eight; every time has a light
    for (const t of S.def.times ? [] : SKY_TIMES) if (!S.skyNames.includes(t)) p.push(`no ${t} sky`);
    for (const t of S.skyNames) if (!hasLight(t)) p.push(`the ${t} sky has no light (declare it: times: { ${t}: { grade, sun } })`);
    for (const k of ['day', 'night']) if (!AMBIENCE_NAMES.includes(S.ambience[k])) p.push(`ambience.${k} "${S.ambience[k]}" is not one of ${AMBIENCE_NAMES.join(', ')}`);
    if (!(S.area.x1 - S.area.x0 >= MAX_VIEW.w && S.area.y1 - S.area.y0 >= MAX_VIEW.h)) p.push(`area ${S.area.x1 - S.area.x0} × ${S.area.y1 - S.area.y0} is smaller than the widest view (${MAX_VIEW.w} × ${MAX_VIEW.h})`);
    const V = S.view, A = S.area;
    if (V.x0 < A.x0 || V.x1 > A.x1 || V.y0 < A.y0 || V.y1 > A.y1) p.push('view reaches outside the painted area');
    // ground: the scale grows toward the viewer, the lane lies inside the walk region
    for (const x of [V.x0, (V.x0 + V.x1) / 2, V.x1]) {
      const y0 = S.ridge ? S.groundAt(x) : S.horizon + 60;
      if (!finite(y0)) { p.push(`ground at x ${x} is ${y0}`); continue; }
      let prev = 0;
      for (let y = y0; y < y0 + (S.ridge ? S.walk.band : 700); y += 10) { const s = S.scaleAt(x, y); if (!(s > 0 && s >= prev - 1e-9)) { p.push(`scaleAt is not growing toward the viewer at ${x}, ${y}`); break; } prev = s; }
    }
    // the ground line (a ridge set's ground(x), or the main lane `x:` stands on) is inside the picture, below the horizon
    for (let i = 0; i <= 20; i++) {
      const x = V.x0 + ((V.x1 - V.x0) * i) / 20, ly = S.laneAt(x), s = S.scaleAt(x, ly);
      if (!finite(ly) || ly < A.y0 || ly > A.y1 || !(s > 0.2 && s < 4)) { p.push(`the ${S.ridge ? 'ground' : 'lane'} at x ${Math.round(x)} is y ${finite(ly) ? Math.round(ly) : ly} (scale ${finite(s) ? s.toFixed(2) : s})`); break; }
    }
    // the camera never shows past the painted world and every parallax layer covers the frame
    const W = 1920, H = 1080;
    for (const zoom of [0.6, 1, 2]) for (const cx of [V.x0, S.refX, V.x1]) for (const cy of [V.y0, S.refY, V.y1]) {
      const cam = clampCamera(S, { cx, cy, zoom }, W, H), hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom;
      for (const ly of S.def.layers) {
        const E = S.layerExtent(ly.k), dx = (cam.cx - S.refX) * (1 - ly.k), dy = (cam.cy - S.refY) * (1 - ly.k) * 0.4;
        if (!(E.x0 + dx <= cam.cx - hw + 1e-6 && E.x1 + dx >= cam.cx + hw - 1e-6 && E.y0 + dy <= cam.cy - hh + 1e-6)) p.push(`layer k=${ly.k} leaves a gap at zoom ${zoom}, camera (${Math.round(cam.cx)}, ${Math.round(cam.cy)})`);
      }
    }
    return check('world', [...new Set(p)], `area ${A.x1 - A.x0} × ${A.y1 - A.y0}, view x ${V.x0}–${V.x1}, ${S.ridge ? 'ridge ground' : `horizon ${S.horizon}, lane ${S.laneY}`}, ambience ${S.ambience.day} / ${S.ambience.night}`);
  }));

  out.push(attempt('walk', () => {
    const p = [];
    for (const k of S.colliders()) if (S.isWalkable(k.x, k.y)) p.push(`collider ${k.id ?? ''} centre is walkable`);
    for (const P of S.walk.water) { const x = P.reduce((a, q) => a + q[0], 0) / P.length, y = P.reduce((a, q) => a + q[1], 0) / P.length; if (!S.onStone(x, y) && S.isWalkable(x, y)) p.push('the middle of a water polygon is walkable'); }
    const pts = S.anchors().filter(a => a.type === 'ground');
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], R = S.route(a.name, b.name);
      if (R.length < 2) { p.push(`no route ${a.name} → ${b.name}`); continue; }
      if (R.blocked) p.push(`the route ${a.name} → ${b.name} is blocked`);
      for (let k = 1; k < R.length; k++) {
        if (R.stones?.includes(k) || R.stones?.includes(k - 1)) continue;
        for (let q = 0; q <= 20; q++) {
          const x = R[k - 1][0] + ((R[k][0] - R[k - 1][0]) * q) / 20, y = R[k - 1][1] + ((R[k][1] - R[k - 1][1]) * q) / 20;
          if (!S.isWalkable(x, y) || S.colliders().some(cl => inEllipse(cl, x, y))) { p.push(`route ${a.name} → ${b.name} crosses unwalkable ground at ${Math.round(x)}, ${Math.round(y)}`); q = 21; k = R.length; }
        }
      }
    }
    return check('walk', p, `${pts.length} ground anchors, every route between them on walkable ground`);
  }));

  out.push(attempt('paint', () => {
    const p = [], small = { W: 480, H: 270, debug: false };
    S.build();
    for (const q of S.props) if (q.clipped) p.push(`prop ${q.id} is clipped by its paint canvas (widen its bounds)`);
    const frames = {}, times = S.def.times ? S.skyNames : SKY_TIMES, ref = times.includes('morning') ? 'morning' : S.defaultSky;
    for (const t of times) {
      const d = renderSet(S, { ...small, sky: t }).canvas.getContext('2d').getImageData(0, 0, 480, 270).data;
      let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 24) lit++;
      if (lit < 480 * 270 * 0.9) p.push(`${t}: ${Math.round(100 - (100 * lit) / (480 * 270))}% of the frame is unpainted (black)`);
      frames[t] = d;
    }
    const again = kit({}).build(), d2 = renderSet(again, { ...small, sky: ref }).canvas.getContext('2d').getImageData(0, 0, 480, 270).data;
    let n = 0; for (let i = 0; i < d2.length; i++) if (d2[i] !== frames[ref][i]) n++;
    if (n) p.push('two builds of the kit paint different pixels (Math.random or Date.now in a paint function?)');
    return check('paint', p, `every time of day paints the whole frame; two builds paint the same pixels`);
  }));
  return out;
}

/** Review images for a registered kit: the debug set sheet (anchors, walk region, colliders, a route) and a strip of
 *  every time of day (a kit with times of its own: those; the sheet under its default; each of its own times graded as
 *  the film grades it: renderSet). */
export async function kitReview(name, outDir) {
  mkdirSync(outDir, { recursive: true });
  const sheet = join(outDir, `${name}.jpg`), times = join(outDir, `${name}-times.jpg`);
  const S = getKit(name)({}), list = S.def.times ? S.skyNames : SKY_TIMES;
  setSheet([name], sheet, { debug: true, cols: 1, cellW: 1600 });
  const tw = 480, th = 270, cols = Math.min(4, list.length), cv = createCanvas(tw * cols, th * Math.ceil(list.length / cols)), ctx = cv.getContext('2d');
  list.forEach((t, i) => {
    const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
    ctx.drawImage(renderSet(S, { W: tw, H: th, sky: t }).canvas, x, y);
    ctx.fillStyle = 'rgba(10,10,20,.7)'; ctx.fillRect(x, y, 110, 22); ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif'; ctx.fillText(t, x + 6, y + 16);
  });
  writeFileSync(times, await cv.encode('jpeg', 88));
  return [sheet, times];
}

// ───────────── effects ─────────────

// The film's own effects (custom beats, overlays, sounds from custom.mjs and effects/), with where each is used.
export function filmEffects(film, plan, names = []) {
  const want = n => !names.length || names.includes(n), C = film.custom || {}, E = [];
  for (const [n, def] of Object.entries(C.overlays || {})) if (want(n)) E.push({ kind: 'overlay', name: n, def, uses: (plan.overlays || []).filter(o => o.name === n && o.def === def) });
  for (const [n, def] of Object.entries(C.custom || {})) if (want(n)) E.push({ kind: 'beat', name: n, def, uses: (plan.custom || []).filter(c => c.name === n) });
  for (const [n, fn] of Object.entries(C.sounds || {})) if (want(n)) E.push({ kind: 'sound', name: n, def: fn, uses: [] });
  return E;
}
// Three times, early, middle and late, across stretches of film time [[t0, t1], …] taken as one.
const spread = spans => {
  const all = spans.reduce((n, [a, b]) => n + b - a, 0);
  return [0.15, 0.5, 0.85].map(k => { let d = all * k; for (const [a, b] of spans) { if (d < b - a) return a + d; d -= b - a; } return spans[spans.length - 1][1]; });
};
// Where an effect is looked at: three times inside its first use. A beat's use is its span; an overlay's, its scene,
// or the shots it names ("shots"). An overlay that draws nothing there may keep to some shots by itself (its draw reads
// api.shot): verifyEffects then looks in the shots it draws in and remembers them here for effectReview.
const looked = new WeakMap();   // plan → Map(effect def → times)
function timesOf(e, plan) {
  const u = e.uses[0]; if (!u) return [];
  const seen = looked.get(plan)?.get(e.def); if (seen) return seen;
  const t0 = u.t0 ?? 0, t1 = u.t1 ?? t0 + 1, named = e.kind === 'overlay' && Array.isArray(u.shots) ? (plan.shots || []).filter(s => s.scene === u.scene && u.shots.includes(s.id)) : [];
  return spread(named.length ? named.map(s => [s.t0, s.t1]) : [[t0, t1]]);
}

/** Checks for a film's own effects: → [{ name, ok, detail }]. */
export async function verifyEffects(film, plan, names = []) {
  const { drawFrame } = await import('../film/frame.mjs');
  const out = [], E = filmEffects(film, plan, names);
  if (!E.length) return [check('effects', [names.length ? `no custom effect named ${names.join(', ')}` : 'the film has no custom effects'])];
  const W = plan.W, H = plan.H;
  const frame = t => { const cv = createCanvas(W, H), ctx = cv.getContext('2d'); drawFrame(ctx, plan, t); return ctx.getImageData(0, 0, W, H).data; };
  const same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  // the frame with an effect switched off, and how many pixels an effect changes
  const off = (e, t) => { const draw = e.def.draw; try { e.def.draw = () => {}; return frame(t); } finally { e.def.draw = draw; } };
  const moved = (a, b) => { let n = 0; for (let k = 0; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 12) n++; return n; };
  for (const e of E) {
    out.push(await (async () => {
      const p = [], label = `${e.kind} ${e.name}`;
      if (e.kind === 'sound') {
        const a = e.def({ seed: 7, dur: 1.5, params: {} }), b = e.def({ seed: 7, dur: 1.5, params: {} });
        if (!(a instanceof Float32Array) || !a.length) return check(label, ['must return a non-empty Float32Array (48 kHz mono)']);
        let peak = 0, bad = 0; for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i])) bad++; else peak = Math.max(peak, Math.abs(a[i])); }
        if (bad) p.push(`${bad} samples are not finite`);
        if (peak >= 1) p.push(`peak ${peak.toFixed(2)}: keep it well under 1 (the mixer does not normalise)`);
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) p.push('two calls with the same seed differ (Math.random?)');
        return check(label, p, `${(a.length / 48000).toFixed(2)} s, peak ${peak.toFixed(2)}`);
      }
      if (typeof e.def?.draw !== 'function') return check(label, ['needs a draw() function']);
      if (e.def.layer && !LAYERS.includes(e.def.layer)) p.push(`layer "${e.def.layer}" is not one of ${LAYERS.join(', ')}`);
      if (!e.uses.length) return check(label, p, 'not used in film.json: only its shape was checked');
      // what it adds: the same frames with the effect switched off
      let ts = timesOf(e, plan), fwd = ts.map(frame), changed = Math.max(...ts.map((t, i) => moved(off(e, t), fwd[i])));
      // an overlay that keeps to some shots by itself: looked at in the shots of its scene it draws in (each shot's
      // middle frame drawn with and without it)
      const u = e.uses[0], hunt = !changed && e.kind === 'overlay' && !Array.isArray(u.shots);
      if (hunt) {
        const drawn = (plan.shots || []).filter(s => { const t = (s.t0 + s.t1) / 2; return s.scene === u.scene && moved(off(e, t), frame(t)) > 0; });
        if (drawn.length) { ts = spread(drawn.map(s => [s.t0, s.t1])); fwd = ts.map(frame); changed = Math.max(...ts.map((t, i) => moved(off(e, t), fwd[i]))); }
      }
      if (!looked.has(plan)) looked.set(plan, new Map());
      looked.get(plan).set(e.def, ts);
      const back = [...ts].reverse().map(frame).reverse();
      ts.forEach((t, i) => { if (!same(fwd[i], back[i])) p.push(`the frame at ${t.toFixed(2)} s changes with the drawing order (state kept between calls, or Math.random?)`); });
      if (changed === 0) p.push(`draws nothing at ${ts.map(t => t.toFixed(2)).join(', ')} s${hunt ? ` (nor in the middle of any shot of ${u.scene})` : ''}`);
      const at = [...new Set(ts.map(t => plan.shotAt?.(t)?.id).filter(Boolean))];
      return check(label, p, `${e.uses.length} use${e.uses.length > 1 ? 's' : ''} (${[u.scene, u.shot].filter(Boolean).join(' ')}), looked at in shot${at.length > 1 ? 's' : ''} ${at.join(', ')}: deterministic in any order, changes up to ${(100 * changed / (W * H)).toFixed(1)}% of the frame`);
    })().catch(err => ({ name: `${e.kind} ${e.name}`, ok: false, detail: `threw: ${err.message}` })));
  }
  return out;
}

/** Review strip: three frames from the first use of each drawn effect (where verifyEffects looked at it), labelled. */
export async function effectReview(film, plan, names, outPath) {
  const { contactSheet } = await import('./sheet.mjs');
  const { drawFrame } = await import('../film/frame.mjs');
  const times = filmEffects(film, plan, names).filter(e => e.kind !== 'sound').flatMap(e => timesOf(e, plan));
  if (!times.length) return null;
  mkdirSync(dirname(outPath), { recursive: true });
  await contactSheet({ plan, drawFrame, outPath, times, cols: 3, tileW: 560, title: `${plan.title}: effects ${names.join(', ')}` });
  return outPath;
}
