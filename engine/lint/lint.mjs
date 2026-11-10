// Staging and editing checks: the things that make a film look wrong even when every frame renders.
//   lintPlan(plan, { step = 1/6 }) → { errors, warnings, kept, stats }
//   writeLintReport(plan, result, outDir) → { json, jpg }   (see report.mjs)
//
// Kept warnings: a shot's "lint": { "allow": [rule names], "note": "why" } marks its warnings of those rules as
// intended. They are reported in `kept` (each with the note, no fix tried), not in `warnings`; errors are never kept.
// lintPlan throws a ValidationError when a shot's lint block is malformed (allowProblems).
//
// Rigs without a face (faceless(): only the 'neutral' expression, or the rig's own `faceless: true`): their head point
// is only where close shots frame them. The rules about heads and faces skip them (edge-cut's head cut near the eyes,
// halo, caption-face); the rest judge them by their body (a sliver, a tangent) or by what the camera frames (the
// framed region of subject-size and offscreen-speaker, named without "head" or "face").
//
// The film is sampled on real frame times (every `step` seconds, every beat and line boundary, and the first and
// last frame of each shot). Each sample reads frameInfo() (screen boxes, heads, contacts, captions) and the set
// instance (walk region, water, stones, solid footprints, anchors, perspective). Teleports are checked on every
// frame. Consecutive hits of the same rule, actor and shot merge into one issue spanning t0–t1, reported at its
// worst moment `t`; a framing fault (edge-cut, tangent, halo) is an issue only when it is held edgeHold seconds in one
// stretch. Its message ends with a fix that was tried: the film recompiled with the camera change or the staging,
// and the shot linted again, must lose the fault and gain no other framing fault (else the message says so).
//
// Riding, wading and cast scale (DESIGN §9.4): a rider (contact kind 'mount') stands on its carrier, so it is not
// floating while that carrier is there, never collides with it, and is judged at the carrier's ground depth for
// scale; a carrier may be framed together with its riders (one figure) and is never hidden by them. An actor on a
// wade route may stand in water. A wading actor (or a rider sunk with its carrier) is judged by its visible box, the
// part above the waterline, for being on screen, for being seen while speaking (a line from under the water is an
// offscreen-speaker error) and for being too big or absent; too small is judged on the whole body, so sinking out of
// sight on purpose is not a framing fault. Scale divides out the cast scale; a cast member scaled below 1 that even
// the closest zoom cannot fill is judged at scale 1. Scene overlays, marks, fx, music and sfx beats are drawings,
// sounds and instants, not actors: they hide no one and bring no one together. A push-in / pull-out that ends at
// another size or zoom ("to", "toOn", "zoomTo") is judged at its starting size.
//
// Issue: { rule, severity, t, t0, t1, frame, shot, scene, actor?, other?, message, note?, box?, marks?, frames?, samples }
//   t, frame  the worst moment (seconds, and the frame index t·fps); t0–t1 the span the hits cover
//   box     the offending actor's screen box [x0, y0, x1, y1] at t (plan W×H pixels)
//   marks   what the report draws: { kind: 'box' | 'ellipse' | 'point' | 'caption', box | [cx, cy, rx, ry] | [x, y], label }
//   frames  two times for issues about a cut (cut-jump, axis, continuity): the frame before and the frame after
//   note    a kept warning's reason (its shot's "lint" note)
import { createCanvas } from '@napi-rs/canvas';
import { frameInfo } from '../film/frame.mjs';
import * as FRAME from '../film/frame.mjs';
import { compile } from '../film/compile.mjs';
import { ValidationError } from '../film/load.mjs';
import { regionOf, SIZE_SPEC, ZMAX, LOOSER } from '../film/camera.mjs';
import { profile, rigSizes, probe, parseTarget } from '../film/util.mjs';
import { SKY_STYLE, SKY_TIMES, SKY_W, SKY_H } from '../paint/sky.mjs';

// Each rule: its severity, what it catches and how to fix it (the report's rule table; lint.json "fixes").
export const RULES = {
  floating: { severity: 'error', catches: 'contact point not on the ground, an anchor surface or a perch, and not airborne by action',
    fix: 'send the actor to an anchor or a point inside the walk region (see the set sheet); don\'t hold a pose or lift that leaves the ground' },
  'inside-solid': { severity: 'error', catches: 'contact point inside a solid prop footprint (walking through a tree, stump, rock)',
    fix: 'move the target off the prop\'s footprint (the red ellipse on the set sheet), or stop beside it with near:<actor> or an anchor' },
  'in-water': { severity: 'error', catches: 'contact point in water, not on a stone, and the rig cannot swim',
    fix: 'stand on a stepping stone or the bank, or make the walk "wade": true' },
  collision: { severity: 'error', catches: 'two actors\' footprints overlap at similar depth (a warning when a beat makes them interact)',
    fix: 'move one along x or to another depth (y); "near:<actor>" stops beside someone instead of on them' },
  'offscreen-speaker': { severity: 'error', catches: 'a speaking actor (not vo) is less than 60% visible',
    fix: 'put the speaker in "on" (or a looser size), bring them out from behind what hides them, or mark the line "vo": true' },
  'subject-size': { severity: 'warning', catches: 'the framed subject\'s screen height is outside the range for the shot size',
    fix: 'follow the cause in the message: frame the subject alone or stage the others closer; for a subject that grows later in the shot (a pose, a rider), make that change at the end of the shot before; at the closest zoom use a looser size. "zoom" never clears it (the range scales with it); a push-in or pull-out is judged at its start' },
  'edge-cut': { severity: 'warning', catches: 'a head cut by the frame edge (its eyes at or past the edge; not for a rig with no face), or a sliver of an actor (under 25% of it in frame, head out; a walker only at the top or bottom) held for 0.5 s or more',
    fix: 'apply the change in the message, tried on the recompiled film: a camera change ("offset" or "size") that frames the actor in or out without a new edge-cut, tangent or halo, else a staging (move where the actor stands as the shot starts and where it goes in it)' },
  tangent: { severity: 'warning', catches: 'an actor\'s outline just touching a frame edge (an ear or a tail tip against the top, feet just above the bottom; measured on the part of the drawing facing the frame) for 0.5 s or more',
    fix: 'apply the change in the message, tried on the recompiled film: a camera change ("offset" or "zoom") that clears the edge or lets it cut clearly without a new framing fault, else a staging (move where the actor stands as the shot starts and where it goes in it)' },
  halo: { severity: 'warning', catches: 'the sun or moon disc of the sky touching or behind a head (of a rig with a face) for 0.5 s or more',
    fix: 'apply the change in the message, tried on the recompiled film: a camera change ("offset", "angle", "size", "zoom") or a staging that moves the head off the disc without a new framing fault; else re-block the scene under a clear sky' },
  'caption-face': { severity: 'warning', catches: 'the caption box overlaps a speaker\'s face (a rig with a face)',
    fix: 'stage the speaker higher in frame (an "offset" or the "high" angle), or a tighter size' },
  'cut-jump': { severity: 'warning', catches: 'consecutive shots of the same set with nearly identical framing',
    fix: 'change the size (a zoom ratio of at least 1.2), the subject or the angle between the two shots, or make them one shot' },
  continuity: { severity: 'warning', catches: 'an actor\'s pose (lying, low: sitting or crouching, standing, raised: sitting or rearing up) or place changes across a cut in the same set (or a dissolve to a shot too short to pass time) without the change being seen',
    fix: 'let the change happen on screen (a walk, a pose with a "dur") before or after the cut, start the shot where the last one left them, or cut away first' },
  axis: { severity: 'warning', catches: 'the left/right order of two talking actors flips across a cut',
    fix: 'keep each talker on their side for the whole conversation, or show the crossing inside a shot' },
  teleport: { severity: 'error', catches: 'an actor moves more than 40 px (rig units) between two frames inside a shot',
    fix: 'walk there instead of placing, or place while the actor is off screen' },
  scale: { severity: 'warning', catches: 'actor scale differs from set.scaleAt by more than 15% (perched actors use the anchor depth)',
    fix: 'usually an engine bug or a custom kit\'s anchor with a wrong depth: check the anchor on the set sheet' },
  timing: { severity: 'warning', catches: 'overlapping dialogue, shots seen on their own (after a dissolve or fade) for under 1.2 s, captions faster than 20 characters per second',
    fix: 'hold the shot longer ("hold", "dur") so it plays 1.2 s on its own after a dissolve or fade, space the lines ("after"), or shorten the caption' },
};

export const LIMITS = {
  minVisible: 0.6,        // offscreen-speaker
  minShot: 1.2,           // timing: seconds
  maxCps: 20,             // timing: caption characters per second
  scaleTol: 0.15,         // scale
  teleport: 40,           // rig units per frame at 24 fps
  captionFace: 0.2,       // caption-face: overlap of the caption and the face zone (fraction of the smaller)
  cutZoom: 1.2,           // cut-jump: zoom ratio below which two framings are "the same size"
  cutShift: 0.15,         // cut-jump: centre shift (fraction of the frame) below which they are "the same place"
  dialogueOverlap: 0.05,  // timing: seconds of overlap tolerated between two lines
  mergeGap: 1,            // hits of one rule/actor/shot less than this many seconds apart make one issue
  edgeHold: 0.5,          // edge-cut, tangent, halo: seconds a framing fault must last without a break
  headCut: 0.3,           // edge-cut: eyes (head point) closer than this many head heights to an edge, or past it
  sliver: 0.25,           // edge-cut: less than this fraction of an actor's drawing in frame (its head out)
  tangent: 0.03,          // tangent: outline within this fraction of the frame height of an edge, on either side
  halo: 0.5,              // halo: the disc's edge within this many disc radii of the head box,
  haloHead: 0.3,          //   or, over its crown, within this many head heights of it
  cutPose: 1.3,           // continuity: drawn height ratio across a cut that changes the pose class
  cutMove: 0.5,           // continuity: contact point moved more than this × the rig's size across a cut
};
const SWIMMERS = new Set(['frog']);
const REGION_NAME = { wide: 'body', full: 'body', medium: 'waist-up region', close: 'head and shoulders', 'extreme-close': 'face' };
// ... of a rig with no face: the camera frames it the same way, around its head point
const BARE_NAME = { wide: 'body', full: 'body', medium: 'upper part', close: 'head-point region', 'extreme-close': 'head-point region' };
/** A rig with no face: its own `faceless` (true / false) when it says, else only the 'neutral' expression. */
export const faceless = R => (typeof R?.faceless === 'boolean' ? R.faceless : !(R?.expressions?.length > 1));
const regionName = (size, R) => (faceless(R) ? BARE_NAME : REGION_NAME)[size];
// The rules a shot may keep (warnings; a collision is one while a beat brings the two together).
const KEEPABLE = Object.keys(RULES).filter(r => RULES[r].severity === 'warning' || r === 'collision');
const MOVES = new Set(['walk', 'run', 'hop', 'fly', 'enter', 'exit']);
const ORDER = Object.keys(RULES);
const HELD = new Set(['edge-cut', 'tangent', 'halo']);   // rules whose faults must last LIMITS.edgeHold
// a run of hits that is an issue: a framing fault held for edgeHold s in one stretch of consecutive samples
const held = r => !HELD.has(r.rule) || r.hold >= LIMITS.edgeHold - 1e-6;
const STOP = new Error('stop');   // (a check of a fix gives up at its first held fault)

/**
 * Lint a compiled plan. opts: { step = 1/6 s, occlusion = true (props/front layers hide speakers), rules: [names] }
 * A plan compiled from a film (plan.film) gets framing fixes tried on the real camera: the film is recompiled with
 * each candidate camera change and the shot linted again (see hint()).
 */
export function lintPlan(plan, opts = {}) {
  const bad = allowProblems(plan.film);
  if (bad.length) throw new ValidationError(bad);
  return new Linter(plan, opts).run();
}

/**
 * A shot's lint block, "lint": { "allow": [rule names], "note": "why" }, checked on the film JSON: allow is a
 * non-empty list of rules that can warn, note says why. → problems [{ path, message }] as validateFilm lists them.
 */
export function allowProblems(film) {
  const out = [], P = (path, m) => out.push({ path, message: `${path}: ${m}` });
  (Array.isArray(film?.scenes) ? film.scenes : []).forEach((sc, i) => (Array.isArray(sc?.shots) ? sc.shots : []).forEach((sh, j) => {
    const L = sh?.lint, p = `scenes[${i}].shots[${j}].lint`;
    if (L === undefined) return;
    if (!L || typeof L !== 'object' || Array.isArray(L)) { P(p, 'must be an object { "allow": [rule names], "note": "why" }'); return; }
    for (const k of Object.keys(L)) if (k !== 'allow' && k !== 'note') P(`${p}.${k}`, 'unknown field (a shot\'s lint block takes "allow" and "note")');
    if (!Array.isArray(L.allow) || !L.allow.length) P(`${p}.allow`, `must be a non-empty array of rule names (${KEEPABLE.join(', ')})`);
    else L.allow.forEach((r, k) => {
      if (!KEEPABLE.includes(r)) P(`${p}.allow[${k}]`, RULES[r] ? `"${r}" is an error: errors are never kept, fix it` : `unknown rule ${JSON.stringify(r)} (one of ${KEEPABLE.join(', ')})`);
    });
    if (typeof L.note !== 'string' || !L.note.trim()) P(`${p}.note`, 'say why the warning is intended ("note": "…")');
  }));
  return out;
}

// ───────────── geometry ─────────────
const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const inter = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const frac = (b, W, H) => { const A = area(b); return A > 0 ? area(inter(b, [0, 0, W, H])) / A : 0; };
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
const pct = v => `${Math.round(v * 100)}%`;
const sec = t => `${t.toFixed(1)} s`, sec2 = t => `${t.toFixed(2)} s`;
const pt = (x, y) => `(${Math.round(x)}, ${Math.round(y)})`;
function pointInPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToPoly(P, x, y) {
  let d = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    d = Math.min(d, Math.hypot(ax + dx * u - x, ay + dy * u - y));
  }
  return d;
}
// inside the set's walk region (or its painted area when it has none), within tol px of its edge
function inRegion(S, x, y, tol = 3) {
  if (S.region) return pointInPoly(S.region, x, y) || distToPoly(S.region, x, y) <= tol;
  const A = S.area; return x >= A.x0 - tol && x <= A.x1 + tol && y >= A.y0 - tol && y <= A.y1 + tol;
}
// An actor's figure on screen at a sample: its box with whoever rides it.
function figureOf(c, a) { let b = a.screenBox; for (const r of c.actors) if (r.carrier === a.id && r.alpha > 0.05) b = union(b, r.screenBox); return b; }
// A fix for a framing fault: candidate moves of the picture [dx, dy, what] (screen px, in order of preference), of
// the actor (stage: [mx, my, text], world px) and a fallback; over an issue's samples each candidate keeps the largest
// move it needs (same direction).
function mergeFix(a, b) {
  if (!a || !b) return a || b;
  const most = (A = [], B = []) => A.map((m, i) => { const n = B[i]; return n && Math.hypot(n[0], n[1]) > Math.hypot(m[0], m[1]) && Math.sign(n[0]) * Math.sign(m[0]) >= 0 && Math.sign(n[1]) * Math.sign(m[1]) >= 0 ? n : m; });
  return { ...a, moves: most(a.moves, b.moves), stage: most(a.stage, b.stage) };
}
// The shift nearest 0 in direction sg (±1) that falls in none of the forbidden open intervals [a, b].
function firstFree(bad, sg) {
  let v = 0;
  for (let moved = true; moved;) { moved = false; for (const [a, b] of bad) if (v > a && v < b) { v = sg > 0 ? b : a; moved = true; } }
  return v;
}
// What a drawn height (over the rig's standing height) looks like: the pose class for continuity.
const posture = h => (h < 0.55 ? 'lying' : h < 0.85 ? 'low' : h <= 1.15 ? 'standing' : 'raised');
const ellipseD = (c, x, y) =>Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry);
const toScreen = (cam, W, H, x, y) => [(x - cam.cx) * cam.zoom + W / 2, (y - cam.cy) * cam.zoom + H / 2];
const ellipseMark = (cam, W, H, c, label) => { const [x, y] = toScreen(cam, W, H, c.x, c.y); return { kind: 'ellipse', ellipse: [x, y, c.rx * cam.zoom, c.ry * cam.zoom], label }; };
const union = (A, B) => [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
// What the audience sees of an actor: the box above the waterline when it wades (or rides a wading carrier).
const shown = a => a.visibleBox ?? a.screenBox;
const seen = a => (a.visibleBox ? { ...a, screenBox: a.visibleBox } : a);

// Ids of the actors a beat brings together: moves, places, gestures and custom beats that name another actor
// (to: "near:fox", to: "on:pebble", at: "fox", actors: [...]), and any beat with an explicit touch/contact. Looks,
// lines, fx, marks and sfx don't count.
const CONTACT_DO = new Set(['walk', 'run', 'hop', 'fly', 'enter', 'exit', 'place', 'gesture', 'custom', 'pose']);
function beatRefs(b, cast) {
  const out = new Set(), explicit = b.touch !== undefined || b.contact !== undefined;
  if (!explicit && !CONTACT_DO.has(b.do)) return out;
  const add = v => {
    if (Array.isArray(v)) return v.forEach(add);
    if (typeof v !== 'string') return;
    const m = /^(?:near|left-of|right-of|behind|front-of|on):\s*([\w.-]+)$/.exec(v.trim());
    const id = m ? m[1] : v.trim();
    if (cast[id]) out.add(id);
  };
  for (const k of ['who', 'to', 'from', 'at', 'on', 'target', 'actors', 'touch', 'contact']) add(b[k]);
  return out;
}

// The actors a carrier carries, directly or through another rider (states by id).
function ridersOf(states, id) {
  const out = new Set([id]);
  for (let grew = true; grew;) { grew = false; for (const b of states.values()) if (b.carrier && out.has(b.carrier) && !out.has(b.id)) { out.add(b.id); grew = true; } }
  out.delete(id);
  return out;
}
// The carrier an actor rides on at the bottom of a riding chain (itself when it rides nothing).
function baseOf(states, a) {
  let b = a;
  for (let i = 0; i < 8 && b?.carrier && states.get(b.carrier); i++) b = states.get(b.carrier);
  return b;
}

// ───────────── visibility (frame edges, props, other actors and front layers in front) ─────────────
const MASK = 128;
let maskCanvas = null;
function maskCtx(w, h) {
  if (!maskCanvas || maskCanvas.width < w || maskCanvas.height < h) maskCanvas = createCanvas(Math.max(w, maskCanvas?.width ?? 0), Math.max(h, maskCanvas?.height ?? 0));
  const x = maskCanvas.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
  x.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  return x;
}
function covered(x, w, h) {
  const d = x.getImageData(0, 0, w, h).data; let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 64) n++;
  return n;
}
/**
 * How much of an actor's drawing is visible at time t, within `region` (a screen box, default the whole drawing;
 * a close shot only needs the head and shoulders). → { frac, frame, blockers: [{ id, frac }] }: `frame` is the
 * part inside the frame, blockers what hides the rest (props, other actors, 'front' for the foreground layers).
 * A wading actor counts only its part above the waterline; its riders never hide a carrier; overlays hide nothing.
 */
export function visibleFraction(plan, shot, t, info, a, st, states, { occlusion = true, region = null } = {}) {
  const W = plan.W, H = plan.H, cam = info.camera, z = cam.zoom, S = shot.set, alpha = st.alpha ?? 1, box = shown(a);
  const mb = region ? inter(region, box) : box, [x0, y0, x1, y1] = mb, bw = x1 - x0, bh = y1 - y0;
  const inFrame = frac(mb, W, H) * alpha;
  if (!(bw > 0 && bh > 0) || inFrame <= 0 || !occlusion) return { frac: inFrame, frame: inFrame, blockers: [] };
  const k = Math.min(1, MASK / Math.max(bw, bh)), cw = Math.ceil(bw * k) + 2, ch = Math.ceil(bh * k) + 2;
  const x = maskCtx(cw, ch);
  const screen = () => x.setTransform(k, 0, 0, k, 1 - x0 * k, 1 - y0 * k);
  const world = () => x.setTransform(k * z, 0, 0, k * z, (W / 2 - cam.cx * z - x0) * k + 1, (H / 2 - cam.cy * z - y0) * k + 1);
  const clipPath = s => { s.clip.forEach(([px, py], i) => { const q = toScreen(cam, W, H, px, py); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath(); };
  // as drawFrame draws it: squashed in a turn, sunk by a wade and hidden below its waterline
  const drawActor = (s, clipped = true) => {
    const sx = (s.x - cam.cx) * z + W / 2, sy = (s.y - cam.cy) * z + H / 2, q = s.squash ?? 1;
    x.save(); screen();
    if (clipped && s.clip) { x.beginPath(); clipPath(s); x.clip(); }
    if (clipped && s.waterY != null) { x.beginPath(); x.rect(-1e6, -1e6, 2e6, (s.waterY - cam.cy) * z + H / 2 + 1e6); x.clip(); }
    if (q !== 1) { x.translate(sx, sy); x.scale(q, 1); x.translate(-sx, -sy); }
    s.R.draw(x, sx, sy + (s.sink || 0) * z, s.s * z, s.face, { ...s.st, shadow: false });
    x.restore();
  };
  const cut = (bx0, by0, bx1, by1) => { screen(); x.fillStyle = '#000'; x.beginPath(); x.rect(-1e6, -1e6, 2e6, 2e6); x.rect(bx0, by0, bx1 - bx0, by1 - by0); x.fill('evenodd'); };
  drawActor(st, false);                     // the whole drawing: a hollow's edge hides part of it like any occluder
  x.globalCompositeOperation = 'destination-out';
  cut(x0, y0, x1, y1);
  const total = covered(x, cw, ch);
  if (!total) { x.globalCompositeOperation = 'source-over'; return { frac: inFrame, frame: inFrame, blockers: [] }; }
  cut(0, 0, W, H);
  let left = covered(x, cw, ch);
  const frame = left / total, blockers = [];
  const step = (id, draw) => { if (!left) return; draw(); const n = covered(x, cw, ch); if (n < left) blockers.push({ id, frac: (left - n) / total }); left = n; };
  if (st.clip) step(`inside:${st.anchor || 'a hollow'}`, () => { screen(); x.fillStyle = '#000'; x.beginPath(); x.rect(-1e6, -1e6, 2e6, 2e6); clipPath(st); x.fill('evenodd'); });
  // the region in world space, to skip props that cannot cover it
  const wb = [(x0 - W / 2) / z + cam.cx, (y0 - H / 2) / z + cam.cy, (x1 - W / 2) / z + cam.cx, (y1 - H / 2) / z + cam.cy];
  const items = [], mine = ridersOf(states, st.id);
  for (const p of S.propsSorted()) if (p.y > st.key) items.push({ key: p.y, id: p.id, draw: () => { world(); p.draw(x); }, box: p.bounds });
  for (const b of states.values()) if (b.id !== st.id && !mine.has(b.id) && b.visible && b.mode !== 'off' && b.alpha > 0.5 && b.key > st.key) items.push({ key: b.key, id: b.id, draw: () => drawActor(b) });
  for (const it of items.sort((p, q) => p.key - q.key)) {
    if (it.box) { const [bx0, by0, bx1, by1] = it.box, m = 0.25 * Math.max(bx1 - bx0, by1 - by0); if (bx0 - m > wb[2] || bx1 + m < wb[0] || by0 - m > wb[3] || by1 + m < wb[1]) continue; }
    step(it.id, it.draw);
  }
  step('front', () => { world(); S.drawFront(x, cam, { t }); });
  x.globalCompositeOperation = 'source-over';
  return { frac: (left / total) * alpha, frame: frame * alpha, blockers: blockers.sort((p, q) => q.frac - p.frac) };
}

// The part of an actor a shot size frames (screen box): the whole body for wide/full, waist up for medium,
// head and shoulders for close, the face for extreme-close.
export function framedRegion(a, size) {
  const spec = SIZE_SPEC[size];
  if (!spec?.region || spec.region === 'body') return a.screenBox;
  return regionOf({ box: a.screenBox, head: a.head, hh: a.hh ?? (a.headBox[2] - a.headBox[0]) / 1.2 }, size);
}

// ───────────── silhouettes (edge-cut, tangent) ─────────────
const SIL = 160;
/**
 * An actor's own drawing at time t as drawFrame draws it (squashed in a turn, turned on a slope, sunk by a wade and
 * hidden below its waterline or outside its hollow), with nothing in front of it, measured on a mask of about SIL
 * cells across. → { box: [x0, y0, x1, y1] (screen px, the drawn outline) | null, frac (the part inside the frame),
 * inside: the in-frame part's box | null, area: its in-frame area (screen px²), edges: { left, right, top, bottom }:
 * how far the outline ends inside each edge (negative: past it), measured on the part of the drawing facing it (for
 * the top and bottom, the part within the frame's width; for the sides, within its height; Infinity: none) }
 */
export function silhouette(plan, info, a, st) {
  const W = plan.W, H = plan.H, b = shown(a), m = 0.04 * Math.max(b[2] - b[0], b[3] - b[1]);
  const M = drawnMask(plan, info, st, [b[0] - m, b[1] - m, b[2] + m, b[3] + m]);
  if (!M) return { box: null, frac: 0, inside: null, area: 0, edges: { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity } };
  let n = 0, nin = 0, B = null, I = null;
  const E = { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity };
  M.each((px, py, c) => {                                    // the cell's screen rect: [px, py, px + c, py + c]
    n++; B = B ? [Math.min(B[0], px), Math.min(B[1], py), Math.max(B[2], px + c), Math.max(B[3], py + c)] : [px, py, px + c, py + c];
    const mx = px + c / 2, my = py + c / 2, ix = mx >= 0 && mx < W, iy = my >= 0 && my < H;
    if (ix) { E.top = Math.min(E.top, py); E.bottom = Math.min(E.bottom, H - py - c); }
    if (iy) { E.left = Math.min(E.left, px); E.right = Math.min(E.right, W - px - c); }
    if (ix && iy) { nin++; I = I ? [Math.min(I[0], px), Math.min(I[1], py), Math.max(I[2], px + c), Math.max(I[3], py + c)] : [px, py, px + c, py + c]; }
  });
  return { box: B, frac: n ? (nin / n) * (st.alpha ?? 1) : 0, inside: I, area: nin * M.c * M.c, edges: E };
}
// The actor's drawing (as above) inside a screen box, on a mask of about SIL cells across → { c (cell size, px),
// each(fn(px, py, c)) over the covered cells (px, py: a cell's top-left, screen px) } | null
export function drawnMask(plan, info, st, [x0, y0, x1, y1]) {
  const W = plan.W, H = plan.H, cam = info.camera, z = cam.zoom, bw = x1 - x0, bh = y1 - y0;
  if (!(bw > 0 && bh > 0)) return null;
  const k = Math.min(1, SIL / Math.max(bw, bh)), cw = Math.ceil(bw * k) + 2, ch = Math.ceil(bh * k) + 2;
  const x = maskCtx(cw, ch);
  x.save(); x.setTransform(k, 0, 0, k, 1 - x0 * k, 1 - y0 * k);
  const sx = (st.x - cam.cx) * z + W / 2, sy = (st.y - cam.cy) * z + H / 2, cy = sy + (st.sink || 0) * z, q = st.squash ?? 1;
  if (st.clip) { x.beginPath(); st.clip.forEach(([px, py], i) => { const p = toScreen(cam, W, H, px, py); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); x.clip(); }
  if (st.waterY != null) { x.beginPath(); x.rect(-1e6, -1e6, 2e6, (st.waterY - cam.cy) * z + H / 2 + 1e6); x.clip(); }
  if (st.pitch) { x.translate(sx, cy); x.rotate(st.pitch); x.translate(-sx, -cy); }
  if (q !== 1) { x.translate(sx, sy); x.scale(q, 1); x.translate(-sx, -sy); }
  st.R.draw(x, sx, cy, st.s * z, st.face, { ...st.st, shadow: false });
  x.restore();
  const d = x.getImageData(0, 0, cw, ch).data, c = 1 / k;
  return { c, each: fn => { for (let j = 0, p = 3; j < ch; j++) for (let i = 0; i < cw; i++, p += 4) if (d[p] > 64) fn(x0 + (i - 1) * c, y0 + (j - 1) * c, c); } };
}

// ───────────── the sky's discs (halo) ─────────────
// The sun and moon discs of a set's built-in skies where S.drawSky paints them (the same screen mapping: the sky image
// a little larger than the frame, shifted slightly with the camera), each weighted by how much of it the sky
// crossfade shows. A kit's own sky painter (def.skies) has no known disc. → [{ kind: 'sun' | 'moon', x, y, r, a }]
export function skyDiscs(S, cam, sky, W, H) {
  const list = !sky ? [[S.defaultSky, 1]] : typeof sky === 'string' ? [[sky, 1]] : sky;
  const zoom = cam.zoom ?? 1, s = Math.max(W / 1920, H / 1080) * (1 + Math.max(-0.4, Math.min(3, zoom - 1)) * 0.04), w = SKY_W * s, h = SKY_H * s;
  const mx = (w - W) / 2, my = (h - H) / 2, cl = (v, a) => Math.max(-a, Math.min(a, v));
  const x0 = (W - w) / 2 - cl((cam.cx - S.refX) * 0.05 * s, mx), y0 = (H - h) / 2 - cl((cam.cy - S.refY) * 0.06 * s, my);
  const side = (S.light?.[0] ?? -0.6) < 0 ? -1 : 1, moonSide = S.def?.moonSide ?? side, sx = (f, sd) => (sd < 0 ? f : 1 - f) * SKY_W;
  // each sky is drawn over the ones before it at alpha a / (sum so far): what each one ends up showing
  const shown_ = list.map(() => 0); let acc = 0;
  list.forEach(([, a], i) => { if (!(a > 0)) return; acc += a; const k = a / acc; for (let j = 0; j < i; j++) shown_[j] *= 1 - k; shown_[i] = k; });
  const out = [];
  list.forEach(([name], i) => {
    if (!(shown_[i] > 0) || typeof S.def?.skies?.[name] === 'function') return;
    const st = SKY_STYLE[SKY_TIMES.includes(name) ? name : S.defaultSky] || SKY_STYLE.morning;
    if (st.sun?.r > 0) out.push({ kind: 'sun', x: x0 + sx(st.sun.x, side) * s, y: y0 + st.sun.y * SKY_H * s, r: st.sun.r * s, a: shown_[i] });
    if (st.moon?.r > 0) out.push({ kind: 'moon', x: x0 + sx(st.moon.x, moonSide) * s, y: y0 + st.moon.y * SKY_H * s, r: st.moon.r * s, a: shown_[i] });
  });
  // the same disc in two crossfaded skies (night into twilight) is one disc
  const merged = [];
  for (const d of out) { const o = merged.find(e => e.kind === d.kind && Math.hypot(e.x - d.x, e.y - d.y) < 1); if (o) o.a += d.a; else merged.push({ ...d }); }
  return merged;
}

// ───────────── transitions (timing, continuity) ─────────────
// frame.mjs's transition lengths (seconds), read from it when it exports them (a dissolve: dissolveLen(plan, i))
const DISSOLVE = FRAME.DISSOLVE ?? 0.8, SCENE_FADE = FRAME.SCENE_FADE ?? 0.35, START_FADE = FRAME.START_FADE ?? 0.8, END_FADE = FRAME.END_FADE ?? 1.2;
/**
 * The parts of a shot that are blended with another picture or with black, as drawFrame draws them: a dissolve or a
 * fade into its scene, a fade out of it, the film's opening and closing fades, the shot's own fadeIn / fadeOut.
 * → { clean (seconds seen on its own), parts: [{ what, t0, t1 }] }
 */
export function blended(plan, shot) {
  const scenes = plan.scenes || plan._scenes || [], i = scenes.findIndex(s => s.id === shot.scene), rec = scenes[i], next = scenes[i + 1];
  const cards = plan.cards || [], parts = [];
  const add = (what, t0, t1) => { t0 = Math.max(t0, shot.t0); t1 = Math.min(t1, shot.t1); if (t1 > t0 + 1e-6) parts.push({ what, t0, t1 }); };
  if (rec) {
    if (i === 0 && !cards.some(c => c.kind === 'open')) add('the fade in from black', rec.t0, rec.t0 + START_FADE);
    if (i > 0 && rec.transition === 'dissolve') add(`the dissolve from ${scenes[i - 1].id}`, rec.t0, rec.t0 + (typeof FRAME.dissolveLen === 'function' ? FRAME.dissolveLen(plan, i) : DISSOLVE));
    if (i > 0 && rec.transition === 'fade') add('the fade in from black', rec.t0, rec.t0 + SCENE_FADE);
    if (next && next.transition === 'fade') add('the fade to black', rec.t1 - SCENE_FADE, rec.t1);
    if (!next && !cards.some(c => c.kind === 'end')) add('the fade to black', rec.t1 - END_FADE, rec.t1);
  }
  if (shot.fadeIn > 0) add('its fade in', shot.t0, shot.t0 + shot.fadeIn);
  if (shot.fadeOut > 0) add('its fade out', shot.t1 - shot.fadeOut, shot.t1);
  // the union of the blended parts
  let covered_ = 0, end = -Infinity;
  for (const p of parts.slice().sort((a, b) => a.t0 - b.t0)) { const a = Math.max(p.t0, end); if (p.t1 > a) covered_ += p.t1 - a; end = Math.max(end, p.t1); }
  return { clean: shot.t1 - shot.t0 - covered_, parts };
}

// ───────────── the linter ─────────────
class Linter {
  constructor(plan, opts) {
    this.plan = plan; this.W = plan.W; this.H = plan.H; this.fps = plan.fps || 24;
    this.step = Number(opts.step) > 0 ? Number(opts.step) : 1 / 6;
    this.occlusion = opts.occlusion !== false;
    this.only = opts.rules ? new Set(opts.rules) : null;
    this.shotsOnly = opts.shots ? new Set(opts.shots) : null;   // (internal) sample only these shots
    this.hints = opts.hints !== false;                           // (internal) false: no fixes tried (a check of one)
    this.stop = opts.stop || null;                               // (internal) key → true: stop sampling once it is held
    this.runs = []; this.open = new Map(); this.si = 0; this.samples = 0;
    this.cast = plan.cast || plan.film?.cast || {};
    // shot records (camera spec, beats with times) when the plan carries them
    this.srec = new Map();
    for (const sc of plan._scenes || []) for (const s of sc.shots || []) this.srec.set(s.id, s);
    // beats that make two actors interact: [{ t0, t1, refs }]
    this.contacts = [];
    for (const s of this.srec.values()) for (const b of s.beats || []) {
      const refs = beatRefs(b.beat || {}, this.cast);
      if (refs.size >= 2) this.contacts.push({ t0: b.t0 - 0.25, t1: b.t1 + 0.5, refs });
    }
    // talking actors per scene, continuity groups (same set, joined by cuts)
    this.talkers = new Map();
    for (const L of plan.lines || []) if (!L.narrator && L.who && L.who !== 'narrator') {
      if (!this.talkers.has(L.scene)) this.talkers.set(L.scene, new Set());
      this.talkers.get(L.scene).add(L.who);
    }
    this.group = new Map(); let g = 0, prev = null;
    for (const sc of plan.scenes || []) { if (!prev || prev.set !== sc.set || (sc.transition && sc.transition !== 'cut')) g++; this.group.set(sc.id, g); prev = sc; }
    this.order = new Map();
    this.anchors = new WeakMap();
  }
  on(rule) { return !this.only || this.only.has(rule); }
  anchor(S, name) {
    if (!name) return null;
    let m = this.anchors.get(S); if (!m) this.anchors.set(S, (m = new Map()));
    if (!m.has(name)) m.set(name, S.anchorNames?.includes(name) ? S.anchor(name) : null);
    return m.get(name);
  }

  // A hit at the current sample. Consecutive hits with the same key extend one run; hold is its longest stretch of
  // consecutive hits (seconds).
  hit(c, h) {
    if (!this.on(h.rule)) return;
    const key = [h.rule, h.variant ?? '', h.actor ?? '', h.other ?? '', c.shot.id].join('|');
    const severity = h.severity ?? RULES[h.rule].severity;
    let run = this.open.get(key);
    // a run keeps the severity of its first sample (actors that came together on purpose stay a warning)
    if (run && run.last === c.si) { if ((h.metric ?? 0) > run.worst.metric) run.worst = { ...h, t: c.t, metric: h.metric ?? 0, c, fix: mergeFix(run.worst.fix, h.fix) }; return; }
    // a run that stopped less than mergeGap seconds ago in the same shot picks up again (no flicker around a limit),
    // but its hold starts again: touches that come and go are not one held fault
    const next = run && run.last === c.si - 1;
    if (run && !next && run.shot === c.shot.id && c.t - run.t1 <= LIMITS.mergeGap) { run.last = c.si - 1; run.seg = c.t; }
    if (!run || run.last !== c.si - 1) {
      run = { rule: h.rule, key, shot: c.shot.id, scene: c.shot.scene, actor: h.actor, other: h.other, t0: c.t, t1: c.t, n: 0, seg: c.t, hold: 0, severity, worst: { ...h, t: c.t, metric: h.metric ?? 0, c } };
      this.runs.push(run); this.open.set(key, run);
    }
    run.last = c.si; run.t1 = c.t; run.n++; run.hold = Math.max(run.hold, c.t - run.seg);
    if (this.stop && HELD.has(run.rule) && held(run) && this.stop(key)) throw STOP;
    // a fix must hold for every sample of the issue: each candidate move keeps the largest it needs
    const fix = mergeFix(run.worst.fix, h.fix);
    if ((h.metric ?? 0) > run.worst.metric) run.worst = { ...h, t: c.t, metric: h.metric ?? 0, c };
    run.worst.fix = fix;
  }
  // A one-off issue (plan-level rules).
  issue(h) {
    if (!this.on(h.rule)) return;
    this.runs.push({ rule: h.rule, shot: h.shot, scene: h.scene, actor: h.actor, other: h.other, t0: h.t0 ?? h.t, t1: h.t1 ?? h.t, n: 1, severity: h.severity ?? RULES[h.rule].severity, worst: { ...h, metric: h.metric ?? 0 } });
  }

  // Frames to sample in a shot: every `step`, every beat/line boundary, first and last frame.
  framesFor(shot) {
    const fps = this.fps, f0 = Math.round(shot.t0 * fps), f1 = Math.max(f0, Math.round(shot.t1 * fps) - 1);
    const set = new Set([f0, f1]), k = Math.max(1, Math.round(this.step * fps));
    for (let f = f0; f <= f1; f += k) set.add(f);
    const add = t => { if (!Number.isFinite(t)) return; for (const f of [Math.floor(t * fps + 1e-6), Math.ceil(t * fps - 1e-6)]) if (f >= f0 && f <= f1) set.add(f); };
    for (const b of this.srec.get(shot.id)?.beats || []) { add(b.t0); add(b.t1); }
    for (const L of this.plan.lines || []) if (L.t1 > shot.t0 && L.t0 < shot.t1) { add(L.t0); add(L.t1 - 1e-4); }
    return [...set].sort((a, b) => a - b);
  }

  run() {
    const t0 = performance.now();
    this.sample();
    this.teleports();
    this.cutJumps();
    this.continuity();
    this.timing();
    return this.finish(performance.now() - t0);
  }
  // The per-frame rules on every sample of every shot (of opts.shots).
  sample() {
    const plan = this.plan;
    for (const shot of plan.shots || []) {
      if (this.shotsOnly && !this.shotsOnly.has(shot.id)) continue;
      for (const f of this.framesFor(shot)) {
        const t = f / this.fps, info = frameInfo(plan, t);
        if (info.shot !== shot.id || !info.camera) continue;
        const states = new Map(plan.actorsAt(t).map(a => [a.id, a]));
        // frameInfo boxes already include a turn's squash and a wade's sink; vis is the on-screen part above water
        const actors = info.actors.filter(a => states.has(a.id)).map(a => ({ ...a, st: states.get(a.id), vis: frac(shown(a), this.W, this.H) }));
        const c = { t, f, si: this.si++, shot, info, states, actors, byId: new Map(actors.map(a => [a.id, a])), S: shot.set, cam: info.camera };
        this.samples++;
        this.actorRules(c);
        this.collisions(c);
        this.speakers(c);
        this.captionFace(c);
        this.subjectSize(c);
        this.edges(c);
        this.halo(c);
        this.axis(c);
      }
    }
  }

  // ── floating, inside-solid, in-water, scale ──
  actorRules(c) {
    if (!['floating', 'inside-solid', 'in-water', 'scale'].some(r => this.on(r))) return;
    const { S, cam, shot } = c, W = this.W, H = this.H;
    for (const a of c.actors) {
      if (a.vis <= 0.02 || a.alpha < 0.05) continue;           // not on screen: nothing to see
      const st = a.st, R = st.R, aloft = !!a.airborne, moving = MOVES.has(st.action), k = a.scale || 1;
      const where = pt(a.x, a.y), mark = { kind: 'point', point: a.contact.screen, label: a.mode };
      const wading = !!(a.wade ?? st.wade), wet = !!S.inWater?.(a.x, a.y);
      const cid = a.mode === 'mount' ? a.carrier ?? st.carrier : null, carrier = cid ? c.states.get(cid) : null;
      // floating
      if (!aloft) {
        let why = null;
        if (a.mode === 'ground') { if (!inRegion(S, a.x, a.y) && !S.onStone?.(a.x, a.y) && !(wading && wet)) why = `stands on air at ${where}: outside the walkable ground of ${shot.setId}`; }
        else if (a.mode === 'air') why = `hangs in the air at ${where} without flying or jumping`;
        else if (a.mode === 'mount') { if (!carrier || !carrier.visible || carrier.mode === 'off') why = `rides ${cid ?? 'a carrier'} at ${where}, but it is not there`; }
        else if (a.mode === 'surface' || a.mode === 'perch' || a.mode === 'hollow') {
          const an = this.anchor(S, a.anchor), tol = Math.max(4, 3 * a.s);
          let ok = a.mode === 'surface' && S.onStone?.(a.x, a.y);
          if (!ok && an) ok = an.topAt && an.range ? a.x >= an.range[0] - tol && a.x <= an.range[1] + tol && Math.abs(a.y - an.topAt(a.x)) <= tol : Math.hypot(a.x - an.x, a.y - an.y) <= tol;
          if (!ok) why = an ? `is ${Math.round(Math.hypot(a.x - an.x, a.y - an.y))} px away from the ${a.mode} "${a.anchor}" it is supposed to be on` : `is in ${a.mode} mode at ${where} but on no stone or anchor`;
        }
        if (!why && !moving && !String(st.action).startsWith('gesture:') && (a.mode === 'ground' || a.mode === 'surface' || a.mode === 'perch')) {
          // the drawing itself: feet well above the contact point (a pose or lift that leaves the ground)
          const gap = (a.contact.screen[1] - a.screenBox[3]) / (a.s * cam.zoom), h = rigSizes(R, st.st?.params || {}).height || 40;
          if (gap > Math.max(4, 0.08 * h)) why = `is drawn ${Math.round(gap)} units above its contact point without jumping or flying (its pose or lift leaves the ${a.mode === 'ground' ? 'ground' : a.mode === 'perch' ? 'branch' : 'surface'})`;
        }
        if (why) this.hit(c, { rule: 'floating', actor: a.id, metric: 1, message: `${a.id} ${why}`, box: a.screenBox, marks: [{ kind: 'box', box: a.screenBox, label: a.id }, mark] });
      }
      if (aloft || a.mode === 'air') continue;
      // inside a solid prop footprint
      if (a.mode === 'ground') {
        for (const col of c.info.colliders) {
          const d = ellipseD(col, a.x, a.y);
          if (d < 0.95) this.hit(c, { rule: 'inside-solid', actor: a.id, metric: 1 - d, message: `${a.id} stands inside the solid footprint of ${col.id} at ${where} (${pct(1 - d)} of the way to its centre)`, box: a.screenBox, marks: [{ kind: 'box', box: a.screenBox, label: a.id }, ellipseMark(cam, W, H, col, col.id), mark] });
        }
      }
      // in water (a wade route may cross it; a rider is carried)
      if ((a.mode === 'ground' || a.mode === 'surface') && wet && !wading && !S.onStone?.(a.x, a.y) && !(R.swims || SWIMMERS.has(R.kind))) {
        this.hit(c, { rule: 'in-water', actor: a.id, metric: 1, message: `${a.id} (${R.kind}) stands in the water at ${where}; ${R.kind}s can't swim (use a stone, the bank or a "wade": true walk)`, box: a.screenBox, marks: [{ kind: 'box', box: a.screenBox, label: a.id }, mark] });
      }
      // perspective scale (cast scale divided out; perched actors use their anchor's depth, riders their carrier's)
      if (this.on('scale')) {
        const an = a.mode !== 'ground' && a.mode !== 'mount' ? this.anchor(S, a.anchor) : null;
        const want = carrier ? carrier.s / (carrier.scale || 1) : an ? an.s : S.scaleAt(a.x, st.ground ?? a.y), got = a.s / k;
        if (want > 0 && Math.abs(got / want - 1) > LIMITS.scaleTol) {
          const at = carrier ? `its carrier ${carrier.id}'s depth` : an ? `"${a.anchor}" (depth ${Math.round(an.depth)})` : where;
          this.hit(c, { rule: 'scale', actor: a.id, metric: Math.abs(got / want - 1), message: `${a.id} is drawn at ${(got / want).toFixed(2)}× the set's scale at ${at}: ${got.toFixed(2)} instead of ${want.toFixed(2)}${k !== 1 ? ` (cast scale ${k} divided out)` : ''}`, box: a.screenBox, marks: [{ kind: 'box', box: a.screenBox, label: a.id }] });
        }
      }
    }
  }

  // ── collision: footprints overlapping at similar depth ──
  // A rider stands at its carrier's depth (its contact point is up on the carrier's back).
  footprint(a, states) {
    const R = a.st.R, params = a.st.st?.params || {}, b = profile(R, 'stand', params).box, w = rigSizes(R, params).width || (b[2] - b[0]);
    const cx = a.x + (a.face < 0 ? -1 : 1) * ((b[0] + b[2]) / 2) * a.s, base = baseOf(states, a.st);
    return { cx, y: base === a.st ? a.y : base.y, key: base === a.st ? a.key : base.key, hl: Math.max(2, ((b[2] - b[0]) / 2) * a.s * 0.75), rd: Math.max(2, 0.15 * w * a.s) };
  }
  interacting(t, A, B) { return this.contacts.some(c => t >= c.t0 && t <= c.t1 && c.refs.has(A) && c.refs.has(B)); }
  collisions(c) {
    if (!this.on('collision')) return;
    const list = c.actors.filter(a => a.vis > 0.02 && a.alpha > 0.3 && !a.airborne && a.mode !== 'air' && a.mode !== 'hollow');
    const fp = list.map(a => this.footprint(a, c.states)), rides = list.map(a => ridersOf(c.states, a.id));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      // a rider sits on its carrier (and on whatever that carrier rides)
      if (rides[i].has(list[j].id) || rides[j].has(list[i].id)) continue;
      const A = fp[i], B = fp[j];
      const dx = (A.cx - B.cx) / (A.hl + B.hl), dy = Math.max(Math.abs(A.y - B.y), Math.abs(A.key - B.key)) / (A.rd + B.rd);
      const e = Math.hypot(dx, dy);
      if (e >= 0.9) continue;
      const [a, b] = [list[i], list[j]].sort((p, q) => (p.id < q.id ? -1 : 1));
      // an overlap that started during a beat bringing them together stays deliberate while it lasts
      const prev = this.open.get(['collision', '', a.id, b.id, c.shot.id].join('|'));
      const inter_ = prev && prev.last === c.si - 1 ? prev.severity === 'warning' : this.interacting(c.t, a.id, b.id), ov = Math.max(0, Math.min(A.cx + A.hl, B.cx + B.hl) - Math.max(A.cx - A.hl, B.cx - B.hl)) / (2 * Math.min(A.hl, B.hl));
      this.hit(c, { rule: 'collision', actor: a.id, other: b.id, severity: inter_ ? 'warning' : 'error', metric: 1 - e,
        message: `${a.id} and ${b.id} overlap at the same depth (${pct(Math.min(1, ov))} of the smaller footprint)${inter_ ? ' while a beat makes them interact' : ''}; move one along x or to a different depth`,
        box: [Math.min(a.screenBox[0], b.screenBox[0]), Math.min(a.screenBox[1], b.screenBox[1]), Math.max(a.screenBox[2], b.screenBox[2]), Math.max(a.screenBox[3], b.screenBox[3])],
        marks: [{ kind: 'box', box: a.screenBox, label: a.id }, { kind: 'box', box: b.screenBox, label: b.id }] });
    }
  }

  // ── offscreen-speaker ──
  speakers(c) {
    if (!this.on('offscreen-speaker')) return;
    for (const L of this.plan.lines || []) {
      if (L.narrator || L.vo || !(c.t >= L.t0 && c.t < L.t1)) continue;
      const a = c.byId.get(L.who), st = c.states.get(L.who);
      const text = L.text.length > 40 ? `${L.text.slice(0, 38)}…` : L.text;
      if (!a || !st) {
        const why = !st ? 'is not in this scene' : st.mode === 'off' || !st.visible ? 'is off stage' : 'is invisible';
        this.hit(c, { rule: 'offscreen-speaker', actor: L.who, metric: 1, message: `${L.who} speaks "${text}" but ${why} (mark the line "vo": true or bring them on)`, marks: [] });
        continue;
      }
      // what has to be seen depends on the shot size: the body in a wide shot, the head in a close-up (of the part
      // above the water when wading)
      const size = c.shot.size, region = framedRegion(seen(a), size);
      if (area(a.screenBox) > 0 && area(shown(a)) <= 0) {
        this.hit(c, { rule: 'offscreen-speaker', actor: a.id, metric: 1, message: `${a.id} speaks "${text}" from under the water (mark the line "vo": true or let them surface first)`, box: a.screenBox.map(r1), marks: [{ kind: 'box', box: a.screenBox, label: a.id }] });
        continue;
      }
      const v = visibleFraction(this.plan, c.shot, c.t, c.info, a, a.st, c.states, { occlusion: this.occlusion, region });
      if (v.frac >= LIMITS.minVisible) continue;
      const parts = [], what = regionName(size, a.st.R) ? `${regionName(size, a.st.R)} ` : '';
      if (v.frame < 0.995) parts.push(`${pct(1 - v.frame)} is outside the frame`);
      for (const b of v.blockers) if (b.frac >= 0.05) parts.push(`${pct(b.frac)} is hidden ${b.id === 'front' ? 'behind the foreground' : b.id.startsWith('inside:') ? `inside ${b.id.slice(7)}` : `behind ${b.id}`}`);
      this.hit(c, { rule: 'offscreen-speaker', actor: a.id, metric: 1 - v.frac,
        message: v.frame <= 0 ? `${a.id} speaks "${text}" from outside the frame (mark the line "vo": true or frame the speaker)`
          : `${a.id} speaks "${text}" but only ${pct(v.frac)} of their ${what || 'body '}is visible${parts.length ? `: ${parts.join(', ')}` : ''}`,
        box: region.map(r1), marks: [{ kind: 'box', box: region, label: a.id }] });
    }
  }

  // ── caption-face: a burned-in caption over a speaker's eyes or mouth ──
  // The face zone is the middle of the head box; the score is how much of the smaller of (visible face zone,
  // caption) the other covers, so a caption across a close-up face and a caption hiding a small face both count.
  // A rig with no face has none to cover.
  captionFace(c) {
    if (!this.on('caption-face')) return;
    const W = this.W, H = this.H;
    for (const cap of c.info.captions || []) for (const a of c.actors) {
      if (!a.speaking || faceless(a.st.R)) continue;
      const hh = a.hh ?? (a.headBox[2] - a.headBox[0]) / 1.2, [hx, hy] = a.head;
      const zone = inter([hx - 0.45 * hh, hy - 0.4 * hh, hx + 0.45 * hh, hy + 0.4 * hh], [0, 0, W, H]);
      const za = area(zone), ca = area(cap.box);
      if (!za || !ca) continue;
      const f = area(inter(cap.box, zone)) / Math.min(za, ca);
      if (f > LIMITS.captionFace) this.hit(c, { rule: 'caption-face', actor: a.id, metric: f, message: `the caption "${cap.text.length > 36 ? `${cap.text.slice(0, 34)}…` : cap.text}" sits over ${a.id}'s face while they speak (${pct(f)} overlap)`, box: a.headBox, marks: [{ kind: 'caption', box: cap.box }, { kind: 'box', box: a.headBox, label: `${a.id}'s face` }] });
    }
  }

  // ── subject-size ──
  // How the shot's subjects move (world px): extent of their contact points and their fastest horizontal speed.
  motion(shot) {
    this._motion ||= new Map();
    if (this._motion.has(shot.id)) return this._motion.get(shot.id);
    const fps = this.fps, ids = new Set(shot.on || []), P = new Map();
    for (let f = Math.round(shot.t0 * fps); f < Math.round(shot.t1 * fps); f++) for (const a of this.plan.actorsAt(f / fps)) if (ids.has(a.id) && a.visible && a.mode !== 'off') { if (!P.has(a.id)) P.set(a.id, []); P.get(a.id).push([a.x, a.y - (a.st?.lift || 0) * a.s]); }
    const out = new Map(), n = Math.max(1, Math.round(0.15 * fps));
    for (const [id, X] of P) {
      let v = 0; for (let i = n; i + n < X.length; i++) v = Math.max(v, Math.abs(X[i + n][0] - X[i - n][0]) / ((2 * n) / fps));
      out.set(id, { dx: Math.max(...X.map(p => p[0])) - Math.min(...X.map(p => p[0])), dy: Math.max(...X.map(p => p[1])) - Math.min(...X.map(p => p[1])), v });
    }
    this._motion.set(shot.id, out);
    return out;
  }
  subjectSize(c) {
    if (!this.on('subject-size')) return;
    const { shot } = c, size = shot.size, spec = SIZE_SPEC[size], W = this.W, H = this.H;
    if (!spec || size === 'establishing') return;
    let ids = (shot.on || []).filter(id => this.cast[id]);
    if (!ids.length) return;
    const u = (c.t - shot.t0) / Math.max(1e-6, shot.t1 - shot.t0);
    if (shot.move === 'pan' && ids.length > 1) {                        // a pan holds on[0], moves, then holds on[last]
      if (u > 0.12 && u < 0.88) return;
      ids = [u <= 0.12 ? ids[0] : ids[ids.length - 1]];
    }
    const live = ids.map(id => c.states.get(id)).filter(s => s && s.visible && s.mode !== 'off' && s.alpha > 0.05);
    if (!live.length) return;                                          // off stage or gone: nothing to frame
    // a push-in / pull-out that ends at another size or zoom is judged at its starting size: the fill at that zoom
    const cs = this.srec.get(shot.id)?.def?.camera || {}, fr = shot.frames || {};
    const resized = (shot.move === 'push-in' || shot.move === 'pull-out') && !!(cs.to || cs.toOn || cs.zoomTo) && fr.from?.zoom > 0;
    const zk = resized ? fr.from.zoom / c.cam.zoom : 1, fill = g => ((g[3] - g[1]) / H) * zk;
    const f = spec.f * (cs.zoom ?? 1), lo = 0.5 * f, hi = Math.min(1.35 * f, 1.15);
    // Each subject as the camera frames it: alone, or a carrier together with its riders (one figure), whichever is
    // nearer the size (the camera frames riders that stay on for most of the shot). g: the whole body, gv: the part
    // above the water (what the audience sees of a wading subject).
    const figure = a => {
      let box = a.screenBox, vis = shown(a);
      for (const r of ridersOf(c.states, a.id)) { const b = c.byId.get(r); if (b && b.alpha > 0.05) { box = union(box, b.screenBox); vis = union(vis, shown(b)); } }
      return box === a.screenBox ? a : { ...a, screenBox: box, visibleBox: vis };
    };
    const subs = live.map(s => c.byId.get(s.id)).filter(Boolean).map(a => {
      const fig = figure(a), near = x => Math.abs(Math.log(Math.max(1e-4, fill(framedRegion(x, size))) / f));
      const x = fig !== a && near(fig) < near(a) ? fig : a;
      return { a, g: framedRegion(x, size), gv: framedRegion(seen(x), size) };
    });
    if (!subs.length) return;
    const what = R => { const n = regionName(size, R); return n === 'body' || n.endsWith('region') || faceless(R) ? n : `${n} region`; };
    if (!subs.some(s => frac(s.gv, W, H) >= 0.5)) {
      // entering or leaving, a wade going under (in frame, below the waterline), or a move toward other subjects
      const under = subs.some(s => frac(s.g, W, H) >= 0.5);
      if (!under && !live.some(s => s.action === 'enter' || s.action === 'exit') && !(resized && cs.toOn)) {
        const s0 = subs[0];
        this.hit(c, { rule: 'subject-size', variant: 'absent', actor: s0.a.id, metric: 1, message: `${size} shot on ${ids.join(' + ')}, but ${subs.length > 1 ? 'none of their' : `${s0.a.id}'s`} ${what(s0.a.st.R)}${subs.length > 1 ? 's is' : ' is not'} in frame`, box: s0.gv, marks: [{ kind: 'box', box: s0.gv, label: s0.a.id }] });
      }
      return;
    }
    // the tallest framed region sets the zoom (also for subjects still walking in from off screen); too big is what
    // is seen, too small is the whole body (a wade sinking out of sight is not a framing fault)
    let best = null, U = null, V = null;
    for (const { a, g, gv } of subs) {
      const m = fill(g);
      if (!best || m > best.m) best = { a, g, gv, m, mv: fill(gv) };
      U = U ? [Math.min(U[0], a.screenBox[0]), Math.max(U[1], a.screenBox[2])] : [a.screenBox[0], a.screenBox[2]];
      V = V ? [Math.min(V[0], g[1]), Math.max(V[1], g[3])] : [g[1], g[3]];
    }
    const big = best.mv > hi;
    if (!big && best.m >= lo) return;
    const hfit = spec.region === 'head' || spec.region === 'face' ? 0.94 : 0.86;
    if (!big) {
      if (live.length < ids.length) return;                            // someone not on yet: framed at their destination
      if (subs.length > 1 && (U[1] - U[0]) / W > 0.55 * spec.wmax) return;   // a two-shot fitted to the width
      if (subs.length > 1 && ((V[1] - V[0]) / H) * zk > 0.55 * hfit) return;   // ... or to the height (one above the other)
      if (shot.move === 'track') { const v = Math.max(0, ...[...this.motion(shot).values()].map(m => m.v)); if (v > 1 && c.cam.zoom <= (1.05 * W / v) * 1.03) return; }   // fast runners framed looser on purpose
    }
    const zmax = ZMAX * Math.max(1, Math.min(W, H) / 1080) * 0.98;
    const capped = !big && Math.max(c.cam.zoom, fr.from?.zoom ?? 0, fr.to?.zoom ?? 0) >= zmax;
    // a cast member scaled down on purpose (cast scale < 1) that even the closest zoom can't enlarge: judged at scale 1
    const k = best.a.scale || 1;
    if (capped && k < 1 && best.m / k >= lo) return;
    // a subject crossing a static frame makes the camera frame the whole move
    const bodyW = (best.a.screenBox[2] - best.a.screenBox[0]) / c.cam.zoom;
    let rover = null;
    for (const [id, mo] of this.motion(shot)) if (!rover || Math.max(mo.dx, mo.dy) > rover.d) rover = { id, d: Math.max(mo.dx, mo.dy) };
    const roams = !big && shot.move !== 'track' && rover && rover.d > 1.5 * bodyW;
    // a subject that grows later in the shot (sits up, a rider climbs on): the frame is composed for that taller
    // figure from the first frame, so it reads small until then
    const tall = this.shotSubjects(shot).get(best.a.id)?.hmax ?? 0, now = (figureOf(c, best.a)[3] - figureOf(c, best.a)[1]) / c.cam.zoom;
    const grows = !big && !capped && !roams && tall > 1.2 * now;
    const m = big ? best.mv : best.m, box = big ? best.gv : best.g;
    this.hit(c, { rule: 'subject-size', variant: big ? 'big' : 'small', actor: best.a.id, metric: big ? m / hi - 1 : 1 - m / lo,
      message: `${size} shot: ${best.a.id}'s ${what(best.a.st.R)} fills ${pct(m)} of the frame height${resized ? ` at the move's starting zoom` : ''} (expected ${pct(lo)}–${pct(hi)})${capped ? `; the camera is already at its closest zoom, so the rig is too small for this size${k !== 1 ? ` (cast scale ${k})` : ''}` : roams ? `; ${rover.id} travels ${Math.round(rover.d)} px during the shot and the camera frames the whole move (try "move": "track")` : grows ? `; the shot is framed for ${best.a.id}'s ${(tall / now).toFixed(1)}× taller figure later in it (a pose, a rider), so it reads small until then: put that pose change at the end of the shot before, so this one starts in it; "zoom" won't help, the range scales with it` : ''}`,
      box, marks: [{ kind: 'box', box, label: best.a.id }] });
  }

  // The tallest each of a shot's subjects gets over the shot (8 samples; a carrier with its riders, world px): the
  // figure its camera is composed for. → Map id → { hmax }
  shotSubjects(shot) {
    this._subs ||= new Map();
    if (this._subs.has(shot.id)) return this._subs.get(shot.id);
    const on = new Set(shot.on || []), out = new Map(), N = 8;
    for (let i = 0; i < N; i++) {
      const info = frameInfo(this.plan, shot.t0 + ((shot.t1 - shot.t0) * (i + 0.5)) / N);
      if (info.shot !== shot.id) continue;
      for (const a of info.actors) {
        if (!on.has(a.id) || !(a.alpha > 0.05)) continue;
        let fig = a.worldBox; for (const r of info.actors) if (r.carrier === a.id && r.alpha > 0.05) fig = union(fig, r.worldBox);
        out.set(a.id, { hmax: Math.max(out.get(a.id)?.hmax ?? 0, fig[3] - fig[1]) });
      }
    }
    this._subs.set(shot.id, out);
    return out;
  }

  // ── framing fixes, tried on the real camera ──
  // A framing fault (edge-cut, tangent, halo) carries fix: { moves: [[dx, dy, what, 'side'?]] (moves of the picture,
  // screen px, at the issue's worst moment), alt: [[camera change, text]] (other camera blocks to try), fallback (the
  // staging advice) }. A camera change is tried by recompiling the film with it (the same compile path: the shot's
  // move, "to", "zoomTo", "moveAt", the set's clamp) and linting the shot again with the framing rules on: it is the
  // hint when the issue is gone and no new framing issue came (moves marked 'side' are tried smallest first, then the
  // others in order, then alt); else the fallback.
  hint(r) {
    const w = r.worst, fix = w.fix;
    if (!this.hints) return fix.fallback;
    const order = fix.moves.map((m, i) => ({ m, k: m[3] === 'side' ? Math.abs(m[0]) : 1e9 + i })).sort((p, q) => p.k - q.k).map(o => o.m);
    for (const [dx, dy, what] of order) {
      if (!(Math.abs(dx) + Math.abs(dy) > 0) || !Number.isFinite(dx + dy)) continue;
      const f = this.offsetFor(w.c, dx, dy, w.P);
      if (f && this.clears(r, this.view(w.c.shot, f.cam))) return `${f.text} ${what}`;
    }
    for (const [edit, text] of fix.alt || []) {
      const cam = this.recamera(w.c.shot, edit);
      if (cam && this.clears(r, this.view(w.c.shot, cam))) return text;
    }
    const a = w.c.byId.get(r.actor);
    for (const [mx, my, text] of fix.stage || []) {
      if (a && this.staged(r, a, mx, my)) return text;
    }
    return fix.fallback;
  }
  // The camera "offset" that moves the shot's picture by (dx, dy) screen px at the issue's moment (measured at the
  // world point P), in the shot's own form (frame fractions, or world px when the shot gives world px or is an
  // establishing shot), found on the real camera by a secant search per axis. → { text, cam } | null when the camera
  // won't follow it (the set's edge, or the composition keeping its subjects in frame, holds it there).
  offsetFor(c, dx, dy, P) {
    const shot = c.shot, W = this.W, H = this.H, z = c.cam.zoom, spec = this.camSpec(shot), want = [dx, dy];
    const o0 = Array.isArray(spec.offset) && spec.offset.length === 2 ? spec.offset : null;
    const px = (o0 && (Math.abs(o0[0]) > 2 || Math.abs(o0[1]) > 2)) || (shot.size || 'wide') === 'establishing';
    const unit = px ? [-1 / z, -1 / z] : [1 / W, 1 / H], round = v => (px ? Math.round(v) : r3(v));
    const tol = want.map(v => Math.max(2, 0.1 * Math.abs(v), px ? 0.6 * z : 0)), [sx, sy] = toScreen(c.cam, W, H, P[0], P[1]);
    let prev = { o: o0 || [0, 0], p: [0, 0] }, o = [0, 1].map(k => round(prev.o[k] + want[k] * unit[k])), best = null;
    // (when the camera stops short, the furthest it went is tried if it covers most of the move: the margins may spare it)
    const short = () => (best && best.u >= 0.6 ? best : null), W2 = want[0] ** 2 + want[1] ** 2;
    for (let i = 0; i < 5; i++) {
      const cam = this.recamera(shot, { offset: o });
      if (!cam) return short();
      const q = toScreen(cam.cameraAt(c.t), W, H, P[0], P[1]), p = [q[0] - sx, q[1] - sy], err = [want[0] - p[0], want[1] - p[1]];
      const u = (p[0] * want[0] + p[1] * want[1]) / W2, text = `"offset": [${o[0]}, ${o[1]}]`;
      if (Math.abs(err[0]) <= tol[0] && Math.abs(err[1]) <= tol[1]) return { text, cam };
      if (!best || u > best.u) best = { u, text, cam };
      const next = [0, 1].map(k => {
        if (Math.abs(err[k]) <= tol[k]) return o[k];
        const asked = (o[k] - prev.o[k]) / unit[k], gain = Math.abs(asked) > 1e-9 ? (p[k] - prev.p[k]) / asked : 1;
        return gain > 0.15 ? round(o[k] + (err[k] / gain) * unit[k]) : NaN;   // (the picture hardly follows: held)
      });
      if (next.some(Number.isNaN) || (!px && next.some(v => Math.abs(v) > 1)) || (next[0] === o[0] && next[1] === o[1])) return short();
      prev = { o, p }; o = next;
    }
    return short();
  }
  // Does the shot, in this changed plan, lose the issue without a new framing issue (edge-cut, tangent, halo)? (The
  // check stops at the first one held.)
  clears(r, plan) {
    const shot = r.worst.c.shot, before = new Set(this.runs.filter(q => q.shot === shot.id && HELD.has(q.rule) && held(q)).map(q => q.key));
    const L = new Linter(plan, { step: this.step, occlusion: this.occlusion, rules: [...HELD].filter(x => this.on(x)), shots: [shot.id], hints: false, stop: k => k === r.key || !before.has(k) });
    try { L.sample(); } catch (e) { if (e === STOP) return false; throw e; }
    return true;
  }
  // The plan with one shot filmed by another camera ({ cameraAt, frames }); the actors as they are, but one moved
  // during the shot ({ id, base, p }: by as much as the recompiled plan p moves it from the plain recompile base).
  view(shot, cam, moved = null) {
    const plan = this.plan, v = Object.create(plan), s1 = { ...shot, cameraAt: cam.cameraAt, frames: cam.frames };
    v.shots = plan.shots.map(s => (s === shot ? s1 : s));
    v.shotAt = t => { const s = plan.shotAt(t); return s === shot ? s1 : s; };
    v.captionMode = 'none';
    if (moved) {
      const at = (q, t, sc) => q.actorsAt(t, sc).find(x => x.id === moved.id);
      v.actorsAt = (t, sc) => plan.actorsAt(t, sc).map(a => {
        if (a.id !== moved.id || t < shot.t0 || t >= shot.t1) return a;
        const A = at(moved.base, t, sc), B = at(moved.p, t, sc);
        return A && B ? { ...a, x: a.x + B.x - A.x, y: a.y + B.y - A.y, key: a.key + B.key - A.key, s: a.s * (B.s / A.s) } : a;
      });
    }
    return v;
  }
  // The film recompiled with one scene replaced (scene2: its JSON; null: as it is), with the plan's voice lengths →
  // the plan | null. Just that scene is compiled (at its own times) when that gives its shots the cameras the whole
  // film gives them; the unchanged scene is remembered.
  recompile(sceneId, scene2 = null) {
    const film = this.plan.film, sc = film?.resolved && Array.isArray(film.scenes) ? film.scenes.find(s => s.id === sceneId) : null;
    if (!sc) return null;
    const T0 = (this.plan.scenes || []).find(s => s.id === sceneId)?.t0 ?? 0;
    this._voices ||= new Map((this.plan.lines || []).filter(L => !L.estimated).map(L => [L.id, { dur: L.t1 - L.t0, trimEnd: L.trimEnd ?? 0 }]));
    const build = (scene, alone) => {
      const f = alone ? { ...film, titles: T0 > 0 ? { open: { title: '·', dur: T0 } } : {}, scenes: [scene] } : { ...film, scenes: film.scenes.map(s => (s === sc ? scene : s)) };
      Object.defineProperty(f, 'resolved', { value: film.resolved });
      try { return compile(f, { voices: this._voices }); } catch { return null; }
    };
    this._alone ||= new Map();
    if (!this._alone.has(sceneId)) {
      const p = build(sc, true), mine = (this.plan.shots || []).filter(s => s.scene === sceneId);
      const same = !!p && mine.every(shot => { const s2 = p.shots.find(s => s.id === shot.id); return s2 && Math.abs(s2.t0 - shot.t0) < 1e-6 && Math.abs(s2.t1 - shot.t1) < 1e-6 && [0, 0.5, 0.999].every(u => {
        const t = shot.t0 + u * (shot.t1 - shot.t0), A = s2.cameraAt(t), B = shot.cameraAt(t);
        return Math.abs(A.cx - B.cx) + Math.abs(A.cy - B.cy) < 1e-3 && Math.abs(A.zoom / B.zoom - 1) < 1e-6;
      }); });
      this._alone.set(sceneId, { alone: same, base: same ? p : build(sc, false) });
    }
    const { alone, base } = this._alone.get(sceneId);
    return scene2 ? build(scene2, alone) : base;
  }
  // The shot's camera with its camera block changed (edit merged into it) → the recompiled shot ({ cameraAt, frames,
  // … }) | null (no film to recompile, or the change moves the shot in time)
  recamera(shot, edit) {
    const sc = this.plan.film?.scenes?.find?.(s => s.id === shot.scene);
    const p = sc && this.recompile(shot.scene, { ...sc, shots: sc.shots.map(sh => (sh.id === shot.id ? { ...sh, camera: { ...(sh.camera || {}), ...edit } } : sh)) });
    const s2 = p?.shots.find(s => s.id === shot.id);
    return s2 && Math.abs(s2.t0 - shot.t0) < 1e-6 && Math.abs(s2.t1 - shot.t1) < 1e-6 ? s2 : null;
  }
  // Does staging the actor (mx, my) world px away for the shot clear the issue? Where it stands when the shot starts
  // (its last move or place before the shot, else its starting place in the scene) and every place it goes to in the
  // shot are moved (coordinates, a lane, a ground anchor) and the film recompiled: the actor must land where it was
  // moved to (compile moves an actor off solid props and other actors), no shot of the scene may change its length by
  // more than a tenth (a walk at another depth takes a little more or less time; a detour much more), and the shot,
  // with the actor where the recompiled film puts it and filmed by its recompiled camera, must lose the issue without
  // a new framing issue.
  staged(r, a, mx, my) {
    const shot = r.worst.c.shot, S = shot.set, sc = this.plan.film?.scenes?.find?.(s => s.id === shot.scene), recs = this.plan._scenes?.find(x => x.id === shot.scene)?.shots;
    if (!sc || !recs || a.mode !== 'ground' || !(Math.abs(mx) + Math.abs(my) > 0)) return false;
    const mine = b => b.who === a.id && b.to !== undefined && ['walk', 'run', 'hop', 'fly', 'place', 'enter'].includes(b.do);
    const earlier = recs.filter(sr => sr.t0 < shot.t0 - 1e-6).flatMap(sr => sr.beats).filter(b => mine(b.beat) && b.t0 < shot.t0 - 1e-6);
    const lead = earlier.length ? earlier.reduce((p, q) => (q.t0 >= p.t0 ? q : p)).beat : null;
    const moved = new Set([lead, ...(recs.find(sr => sr.id === shot.id)?.beats || []).filter(b => mine(b.beat)).map(b => b.beat)].filter(Boolean));
    let bad = false;
    const move = v => {
      const T = parseTarget(v), an = T.kind === 'name' && S.anchorNames?.includes(T.name) ? S.anchor(T.name) : null;
      const p = T.kind === 'xy' ? [T.x, T.y] : T.kind === 'x' ? [T.x, S.laneAt(T.x)] : an && an.type === 'ground' ? [an.x, an.y] : null;
      if (!p) { bad = true; return v; }
      return `x:${r1(p[0] + mx)},y:${r1(p[1] + my)}`;
    };
    const at0 = !lead && sc.actors?.[a.id]?.at !== undefined;
    const sc2 = { ...sc, actors: { ...sc.actors, [a.id]: { ...sc.actors?.[a.id], ...(at0 ? { at: move(sc.actors[a.id].at) } : {}) } },
      shots: sc.shots.map(sh => ({ ...sh, beats: (sh.beats || []).map(b => (moved.has(b) ? { ...b, to: move(b.to) } : b)) })) };
    if (bad || !(at0 || moved.size)) return false;
    const base = this.recompile(shot.scene), p = this.recompile(shot.scene, sc2), s2 = p?.shots.find(s => s.id === shot.id);
    if (!base || !s2) return false;
    const len = (q, id) => { const x = q.shots.find(s => s.id === id); return x ? x.t1 - x.t0 : NaN; };
    if (sc.shots.some(sh => !(Math.abs(len(p, sh.id) - len(base, sh.id)) <= Math.max(0.25, 0.1 * len(base, sh.id))))) return false;
    // it lands where it was moved to: at the scene's start (its starting place moved) and where each moved move or
    // place ends inside its shot (the same beat in both films), while on the ground
    const at = (q, t) => q.actorsAt(t, shot.scene).find(x => x.id === a.id);
    const RA = base._scenes?.find(x => x.id === shot.scene), RB = p._scenes?.find(x => x.id === shot.scene);
    if (!RA || !RB) return false;
    const pairs = at0 ? [[RA.t0, RB.t0]] : [];
    RA.shots.forEach((sr, i) => sr.beats.forEach((b, j) => {
      const sq = RB.shots[i], q = sq?.beats[j];
      if (moved.has(b.beat) && q && b.t1 <= sr.t1 + 1e-6 && q.t1 <= sq.t1 + 1e-6) pairs.push([Math.min(b.t1, sr.t1 - 1e-3), Math.min(q.t1, sq.t1 - 1e-3)]);
    }));
    let n = 0;
    for (const [ta, tb] of pairs) {
      const A = at(base, ta), B = at(p, tb);
      if (!A || !B || A.mode !== 'ground' || A.airborne) continue;
      if (Math.hypot(B.x - A.x - mx, B.y - A.y - my) > Math.max(2, 0.1 * Math.hypot(mx, my))) return false;
      n++;
    }
    if (!n) return false;
    // the shot as the recompiled film has it (when the plan is the film's own: its actors where the film puts them),
    // else (a plan changed by hand) filmed by the recompiled camera with the actor moved as the recompile moves it
    const own = [0, 0.5, 0.99].every(u => { const t = shot.t0 + u * (shot.t1 - shot.t0), A = at(base, t), B = at(this.plan, t); return !!A === !!B && (!A || Math.abs(A.x - B.x) + Math.abs(A.y - B.y) < 1e-6); });
    if (own) { const v = Object.create(p); v.captionMode = 'none'; return this.clears(r, v); }
    return Math.abs(s2.t0 - shot.t0) < 1e-6 && Math.abs(s2.t1 - shot.t1) < 1e-6 && this.clears(r, this.view(shot, s2, { id: a.id, base, p }));
  }
  camSpec(shot) { return this.srec.get(shot.id)?.def?.camera || {}; }
  // A screen point in world px at a sample.
  world(c, [x, y]) { const cam = c.cam; return [(x - this.W / 2) / cam.zoom + cam.cx, (y - this.H / 2) / cam.zoom + cam.cy]; }
  // Moving an actor that isn't framed (not in "on") moves only it. Sideways a screen px is 1 / zoom world px; up and
  // down, a point h units above the contact point also shrinks or grows with the depth, so a move back lifts it less
  // (a tall figure's head hardly at all: then it leaves sideways, by the nearer side). → [mx, my, "stage <id> about
  // …"] (world px)
  stage(c, a, dx, dy, h = 0) {
    const z = c.cam.zoom, S = c.S, W = this.W, s0 = S.scaleAt?.(a.x, a.y) || 1, ds = (S.scaleAt?.(a.x, a.y + 1) ?? s0) - s0;
    let mx = Math.round(dx / z), my = 0;
    if (dy) {
      const f = 1 - (h * ds) / s0;     // h: world px above the contact point of what has to move
      if (f > 0.3) my = Math.round(dy / (z * f));
      else { const out = Math.min(a.screenBox[2], W - a.screenBox[0]) + 0.02 * W; mx = Math.round(((a.screenBox[0] + a.screenBox[2]) / 2 < W / 2 ? -1 : 1) * out / z); }
    }
    const parts = [];
    if (mx) parts.push(`${Math.abs(mx)} px ${mx < 0 ? 'left' : 'right'} (x ${mx < 0 ? '−' : '+'} ${Math.abs(mx)})`);
    if (my) parts.push(`${Math.abs(my)} px ${my < 0 ? 'further back' : 'nearer'} (y ${my < 0 ? '−' : '+'} ${Math.abs(my)})`);
    return [mx, my, `stage ${a.id} about ${parts.join(' and ')} for this shot`];
  }

  // ── edge-cut and tangent: what the frame's edges do to each actor ──
  // edge-cut: a head the edge cuts through near the eyes (the head point closer than headCut head heights to an edge,
  // or past it with some of the head still in; not for a rig with no face), or a sliver: under `sliver` of the drawing
  // in frame, its head out (a carrier under its riders is their ground, not a sliver). tangent: the drawn outline ends
  // within `tangent` of the frame height of an edge, inside or outside it (a tip just touching, feet just above the
  // bottom), for a figure at least half in frame, measured on the part of the drawing facing that edge (a tail leaving
  // by the side is not at the bottom). Actors walking in or out are not judged at the side edges; both rules need
  // edgeHold seconds.
  // Each fix moves the picture (or stages the actor) at the moment that needs the biggest move, so it holds for the
  // whole span: a head framed in, or the whole drawing taken out; an outline clear of the edge, or cut clearly by it.
  edges(c) {
    const cut = this.on('edge-cut'), tan = this.on('tangent');
    if (!cut && !tan) return;
    const W = this.W, H = this.H, T = LIMITS.tangent * H, z = c.cam.zoom, subj = new Set(c.shot.on || []), size = c.shot.size || 'wide', zk = this.camSpec(c.shot).zoom || 1;
    const side = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    // how far the picture moves toward edge e to take the in-frame box I out of frame (a little past it)
    const outOf = (e, I) => ({ left: I[2] + 0.02 * W, right: W - I[0] + 0.02 * W, top: I[3] + 0.02 * H, bottom: H - I[1] + 0.02 * H })[e];
    for (const a of c.actors) {
      if (a.alpha < 0.5 || area(inter(shown(a), [0, 0, W, H])) <= 0) continue;
      const st = a.st, moving = MOVES.has(st.action), sides = moving ? ['top', 'bottom'] : ['left', 'right', 'top', 'bottom'], own = subj.has(a.id);
      const hb = a.headBox, hh = (hb[2] - hb[0]) / 1.2, [hx, hy] = a.head, P = this.world(c, a.head), bare = faceless(st.R);
      const dist = { left: hx, right: W - hx, top: hy, bottom: H - hy }, up = y => (a.contact.screen[1] - y) / z;
      let sil = null;
      // a head cut near its eyes (a rig with no face has no eyes to cut: its body is judged below)
      if (cut && hh > 0 && !bare) {
        const e = sides.reduce((m, k) => (dist[k] < dist[m] ? k : m), sides[0]), d = dist[e], hin = frac(hb, W, H);
        if (d < LIMITS.headCut * hh && hin >= 0.08) {
          // frame the head in (the picture moves away from every edge it is near: out of a corner too) or the whole
          // drawing out (toward the nearest edge): the smaller move first; a subject only in
          sil = silhouette(this.plan, c.info, a, st);
          // (a carrier's body under its riders is their ground: its head alone goes out)
          const carries = [...ridersOf(c.states, a.id)].some(r => c.byId.get(r)?.vis > 0.3);
          const [ux, uy] = side[e], I = carries ? hb : sil.inside || hb, need = k => (sides.includes(k) ? Math.max(0, 0.62 * hh + 0.02 * H - dist[k]) : 0);
          const ix = need('left') - need('right'), iy = need('top') - need('bottom'), inn = Math.hypot(ix, iy), out = outOf(e, I);
          const moves = own ? [[ix, iy, 'brings it into frame']] : [[ix, iy, 'brings it into frame'], [ux * out, uy * out, 'takes it out of frame']];
          if (!own && out < inn) moves.reverse();
          const sIn = this.stage(c, a, ix, iy, up(hy)), sOut = this.stage(c, a, ux * out, uy * out, up(uy < 0 ? I[3] : I[1]));
          sIn[2] += ' to bring it into frame'; sOut[2] += ' to take it out of frame';
          const stage = own ? [sIn] : Math.hypot(sIn[0], sIn[1]) <= Math.hypot(sOut[0], sOut[1]) ? [sIn, sOut] : [sOut, sIn];
          const alt = own && LOOSER[size] !== size ? [[{ size: LOOSER[size] }, `"size": "${LOOSER[size]}" brings it into frame`]] : [];
          const fallback = `no "offset"${alt.length ? ', looser size' : ''} or simple move of ${a.id} clears it here: re-block the shot so ${a.id}'s head stays clear of the ${e} edge`;
          this.hit(c, { rule: 'edge-cut', variant: 'head', actor: a.id, metric: Math.min(inn, out), P, fix: { moves, alt, stage, fallback },
            message: `${d >= 0 ? `${a.id}'s head is cut by the ${e} edge of the frame, ${Math.round(d)} px from its eyes` : `only ${pct(hin)} of ${a.id}'s head is in frame, cut off at the ${e} edge`}`,
            box: hb, marks: [{ kind: 'box', box: hb, label: `${a.id}'s head` }] });
          continue;
        }
      }
      // (a drawing whose box stays well inside the frame touches no edge)
      const bx = shown(a);
      if (bx[0] > T && bx[1] > T && bx[2] < W - T && bx[3] < H - T) continue;
      sil ||= silhouette(this.plan, c.info, a, st);
      if (!sil.box) continue;
      // a sliver: a little of a big drawing, its head out of frame (a walker's only at the top or bottom)
      if (cut && sil.frac < LIMITS.sliver && sil.area >= 0.001 * W * H && !(hx >= 0 && hx <= W && hy >= 0 && hy <= H)
        && ![...ridersOf(c.states, a.id)].some(r => c.byId.get(r)?.vis > 0.3)) {
        const I = sil.inside, e = Object.keys(side).reduce((m, k) => { const g = { left: I[0], right: W - I[2], top: I[1], bottom: H - I[3] }; return g[k] < g[m] ? k : m; }, 'left');
        if (!sides.includes(e)) continue;
        // the whole drawing out (toward the edge), or for a subject all of it in (away from it)
        const B = sil.box, [ux, uy] = side[e], mv = own ? { left: -B[0], right: B[2] - W, top: -B[1], bottom: B[3] - H }[e] + 0.02 * (ux ? W : H) : outOf(e, I);
        const [sx, sy, what, to] = own ? [-ux * mv, -uy * mv, 'brings it into frame', 'bring it into frame'] : [ux * mv, uy * mv, 'takes it out of frame', 'take it out of frame'];
        const sMove = this.stage(c, a, sx, sy, up(own ? (uy < 0 ? B[1] : B[3]) : uy < 0 ? I[3] : I[1])); sMove[2] += ` to ${to}`;
        const alt = own && LOOSER[size] !== size ? [[{ size: LOOSER[size] }, `"size": "${LOOSER[size]}" frames it`]] : [];
        const fallback = `no "offset"${alt.length ? ', looser size' : ''} or simple move of ${a.id} clears it here: re-block the shot so ${a.id} stays out of frame or comes well into it`;
        this.hit(c, { rule: 'edge-cut', variant: 'sliver', actor: a.id, metric: mv, P, fix: { moves: [[sx, sy, what]], alt, stage: [sMove], fallback },
          message: `only a sliver of ${a.id} is in frame (${pct(sil.frac)} of it, at the ${e} edge${bare ? '' : ', its head out'})`,
          box: I, marks: [{ kind: 'box', box: I, label: a.id }] });
        continue;
      }
      // a tangent: the outline just touching an edge
      if (!tan || sil.frac < 0.5 || sil.box[3] - sil.box[1] < 0.05 * H) continue;
      const B = sil.box, gap = sil.edges;
      const e = sides.filter(k => gap[k] >= -T && gap[k] <= T).sort((p, q) => Math.abs(gap[p]) - Math.abs(gap[q]))[0];
      if (!e) continue;
      // the picture moves away from the edge until the outline clears it, or toward it until the edge cuts it clearly
      const g = gap[e], [ux, uy] = side[e], clear = T - g + 0.01 * H, cross = g + T + 0.01 * H;
      const where = { top: 'below', bottom: 'above', left: 'inside', right: 'inside' }[e];
      const h = up(e === 'top' ? g : H - g), sClear = this.stage(c, a, -ux * clear, -uy * clear, h), sCross = this.stage(c, a, ux * cross, uy * cross, h);
      sClear[2] += ' to clear it'; sCross[2] += ' to let the edge cut it clearly';
      const alt = own ? [0.9, 0.8].map(k => [{ zoom: r3(zk * k) }, `"zoom": ${r3(zk * k)} clears it`]) : [];
      const fallback = `no "offset"${alt.length ? ', looser "zoom"' : ''} or simple move of ${a.id} clears it here: re-block the shot so ${a.id}'s outline stays clear of the ${e} edge or crosses it well`;
      this.hit(c, { rule: 'tangent', variant: e, actor: a.id, metric: clear, P, fix: { moves: [[-ux * clear, -uy * clear, 'clears it'], [ux * cross, uy * cross, 'lets the edge cut it clearly']], alt, stage: [sClear, sCross], fallback },
        message: `${a.id}'s outline ${g >= 0 ? `ends ${Math.round(g)} px ${where} the ${e} edge of the frame` : `crosses the ${e} edge of the frame by only ${Math.round(-g)} px`} (a tangent)`,
        box: B, marks: [{ kind: 'box', box: B, label: a.id }] });
    }
  }

  // ── halo: the sun or moon of the sky touching or behind a head (a rig with no face has no head to crown) ──
  halo(c) {
    if (!this.on('halo')) return;
    const W = this.W, H = this.H, S = c.S, discs = skyDiscs(S, c.cam, c.shot.skyAt?.(c.t), W, H).filter(d => d.a >= 0.35);
    if (!discs.length) return;
    for (const d of discs) {
      if (d.x < -d.r || d.x > W + d.r || d.y < -d.r || d.y > H + d.r) continue;
      for (const a of c.actors) {
        if (a.alpha < 0.5 || faceless(a.st.R)) continue;
        // the drawn head (its drawing inside the head box): how far the disc is from it, and whether the disc stands
        // over its crown (a big head reads a disc a little above it as its halo, one off to the side does not)
        const hb = a.headBox, hh = (hb[2] - hb[0]) / 1.2, wide = Math.max(LIMITS.halo * d.r, LIMITS.haloHead * hh);
        const bx = Math.max(hb[0] - d.x, 0, d.x - hb[2]), by = Math.max(hb[1] - d.y, 0, d.y - hb[3]);
        if (Math.hypot(bx, by) - d.r > wide) continue;
        const M = drawnMask(this.plan, c.info, a.st, [hb[0], hb[1] - 0.15 * hh, hb[2], hb[3]]);
        let near = Infinity, top = Infinity, xs = [Infinity, -Infinity];
        M?.each((px, py, cs) => { near = Math.min(near, Math.hypot(Math.max(px - d.x, 0, d.x - px - cs), Math.max(py - d.y, 0, d.y - py - cs))); top = Math.min(top, py); });
        M?.each((px, py, cs) => { if (py < top + 0.25 * hh) { xs[0] = Math.min(xs[0], px); xs[1] = Math.max(xs[1], px + cs); } });
        if (!(near < Infinity)) continue;
        const crown = d.y < top && d.x >= xs[0] && d.x <= xs[1], tol = crown ? wide : LIMITS.halo * d.r, gap = near - d.r;
        if (gap > tol || this.discHidden(c, d)) continue;
        // the smallest move of the picture (sideways either way, or down) after which the head neither touches the
        // disc nor has it over its crown: each head cell forbids the shifts that bring it near the disc
        const cells = []; M.each((px, py, cs) => cells.push(px + cs / 2, py + cs / 2));
        const Rn = d.r * (1.75 + LIMITS.halo), over = top - d.y - d.r <= wide + 0.25 * d.r;
        const shiftX = sg => { const bad = []; for (let i = 0; i < cells.length; i += 2) { const v = cells[i + 1] - d.y; if (Math.abs(v) < Rn) { const w = Math.sqrt(Rn * Rn - v * v); bad.push([d.x - cells[i] - w, d.x - cells[i] + w]); } } if (over) bad.push([d.x - xs[1] - 0.25 * d.r, d.x - xs[0] + 0.25 * d.r]); return firstFree(bad, sg); };
        const shiftY = () => { const bad = []; for (let i = 0; i < cells.length; i += 2) { const u = cells[i] - d.x; if (Math.abs(u) < Rn) { const w = Math.sqrt(Rn * Rn - u * u); bad.push([d.y - cells[i + 1] - w, d.y - cells[i + 1] + w]); } } if (d.x >= xs[0] - 0.25 * d.r && d.x <= xs[1] + 0.25 * d.r) bad.push([-Infinity, d.y + d.r + wide + 0.25 * d.r - top]); return firstFree(bad, 1); };
        const sl = shiftX(-1), sr = shiftX(1), moves = [[sl, 0, `moves ${a.id} away from it`, 'side'], [sr, 0, `moves ${a.id} away from it`, 'side'], [0, shiftY(), `moves ${a.id} down, away from it`]];
        // other framings: another angle, a looser size
        const cs = this.camSpec(c.shot), size = c.shot.size || 'wide', alt = ['low', 'high', 'eye'].filter(g => g !== (cs.angle || 'eye')).map(g => [{ angle: g }, `"angle": "${g}" moves ${a.id} away from it`]);
        if (LOOSER[size] !== size) alt.push([{ size: LOOSER[size] }, `"size": "${LOOSER[size]}" moves ${a.id} away from it`]);
        // ... or a looser "zoom" that makes room for the picture to move down (a head at the top of a full composition)
        const o0 = Array.isArray(cs.offset) && cs.offset.length === 2 ? cs.offset : [0, 0], opx = Math.abs(o0[0]) > 2 || Math.abs(o0[1]) > 2 || size === 'establishing';
        for (const k of [0.05, 0.1]) {
          const o = opx ? [o0[0], Math.round(o0[1] - (k * H) / (0.85 * c.cam.zoom))] : [o0[0], r3(o0[1] + k)], zk = r3((cs.zoom || 1) * 0.85);
          alt.push([{ zoom: zk, offset: o }, `"zoom": ${zk} with "offset": [${o[0]}, ${o[1]}] moves ${a.id} down, away from it`]);
        }
        const stage = [sl, sr].sort((p, q) => Math.abs(p) - Math.abs(q)).map(v => { const m = this.stage(c, a, v, 0); m[2] += ' to move it from under the ' + d.kind; return m; });
        this.hit(c, { rule: 'halo', actor: a.id, metric: Math.min(Math.abs(sl), Math.abs(sr)), P: this.world(c, a.head),
          fix: { moves, alt, stage, fallback: `no "offset", "angle", looser size or simple move of ${a.id} clears it here: re-block the scene so the sky over ${a.id}'s head is clear` },
          message: `the ${d.kind} ${gap <= 0 ? 'sits on' : crown ? 'stands just over' : 'touches'} ${a.id}'s head like a halo (${gap <= 0 ? `${Math.round(-gap)} px into it` : `${Math.round(gap)} px away`})`,
          box: union(hb, [d.x - d.r, d.y - d.r, d.x + d.r, d.y + d.r]), marks: [{ kind: 'box', box: hb, label: `${a.id}'s head` }, { kind: 'ellipse', ellipse: [d.x, d.y, d.r, d.r], label: d.kind }] });
      }
    }
  }
  // Is most of a sky disc hidden behind the set (its back layers and props) at this sample?
  discHidden(c, d) {
    const W = this.W, H = this.H, cam = c.cam, z = cam.zoom, S = c.S, n = 48, k = n / (2 * d.r), x0 = d.x - d.r, y0 = d.y - d.r;
    const key = `${c.si}|${Math.round(d.x)}|${Math.round(d.y)}`;
    if (this._disc?.key === key) return this._disc.hidden;
    const x = maskCtx(n, n);
    const world = () => x.setTransform(k * z, 0, 0, k * z, (W / 2 - cam.cx * z - x0) * k, (H / 2 - cam.cy * z - y0) * k);
    world(); S.drawBack(x, cam, { t: c.t });
    for (const p of S.propsSorted()) { world(); p.draw(x); }
    const D = x.getImageData(0, 0, n, n).data; let all = 0, hid = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { if (Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) > n / 2) continue; all++; if (D[(j * n + i) * 4 + 3] > 128) hid++; }
    const hidden = hid > 0.6 * all;
    this._disc = { key, hidden };
    return hidden;
  }

  // ── axis: talking pairs keep their left/right order across cuts ──
  // The camera never mirrors the set, so a flip is always a move: fine when it happens inside a shot (a walk or a
  // hop the audience follows), a continuity jump when it happens at a cut (a place, the next scene's blocking).
  axis(c) {
    if (!this.on('axis')) return;
    const talk = this.talkers.get(c.shot.scene); if (!talk || talk.size < 2) return;
    const g = this.group.get(c.shot.scene), ids = [...talk].sort(), W = this.W;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = `${g}|${ids[i]}|${ids[j]}`;
      let o = this.order.get(key); if (!o) this.order.set(key, (o = { seen: null, world: 0, shot: null, cut: false }));
      // their order in the set, followed at every sample while both are on stage
      const sa = c.states.get(ids[i]), sb = c.states.get(ids[j]);
      if (sa && sb && sa.mode !== 'off' && sb.mode !== 'off') {
        const w = Math.abs(sa.x - sb.x) > 2 ? Math.sign(sa.x - sb.x) : o.world;
        if (o.world && w !== o.world && o.shot !== c.shot.id) o.cut = true;
        o.world = w; o.shot = c.shot.id;
      }
      const A = c.byId.get(ids[i]), B = c.byId.get(ids[j]);
      if (!A || !B || A.vis < 0.4 || B.vis < 0.4) continue;
      const dx = A.contact.screen[0] - B.contact.screen[0];
      if (Math.abs(dx) < 0.03 * W) continue;
      const last = o.seen, sign = Math.sign(dx);
      if (last && last.shot !== c.shot.id && last.sign !== sign && o.cut) {
        const side = s => (s < 0 ? 'left' : 'right');
        this.hit(c, { rule: 'axis', actor: A.id, other: B.id, metric: 1, frames: [last.t, c.t],
          message: `${A.id} and ${B.id} swap sides across the cut: ${A.id} was ${side(last.sign)} of ${B.id} in ${last.shot}, now ${side(sign)} in ${c.shot.id}`,
          box: A.screenBox, marks: [{ kind: 'box', box: A.screenBox, label: A.id }, { kind: 'box', box: B.screenBox, label: B.id }] });
      }
      o.seen = { sign, shot: c.shot.id, t: c.t }; o.cut = false;
    }
  }

  // ── teleport: every frame of every shot ──
  teleports() {
    if (!this.on('teleport')) return;
    const fps = this.fps, thr = LIMITS.teleport * 24 / fps, W = this.W, H = this.H, plan = this.plan;
    for (const shot of plan.shots || []) {
      const f0 = Math.round(shot.t0 * fps), f1 = Math.round(shot.t1 * fps) - 1, prev = new Map();
      for (let f = f0; f <= f1; f++) {
        const t = f / fps, cam = shot.cameraAt(t), seen = new Set();
        for (const a of plan.actorsAt(t)) {
          if (!a.visible || a.mode === 'off' || !(a.alpha > 0.05)) continue;
          seen.add(a.id);
          const p = { x: a.x, y: a.y - (a.st?.lift || 0) * a.s, s: a.s, f };
          const q = prev.get(a.id); prev.set(a.id, { ...p, v: q && q.f === f - 1 ? [p.x - q.x, p.y - q.y] : [0, 0] });
          if (!q || q.f !== f - 1) continue;
          const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) / q.s, jerk = Math.hypot(dx - q.v[0], dy - q.v[1]) / q.s;
          if (d <= thr || jerk <= thr) continue;
          const sp = toScreen(cam, W, H, p.x, p.y), sq = toScreen(cam, W, H, q.x, q.y), m = 0.1 * W;
          const on = ([x, y]) => x > -m && x < W + m && y > -m && y < H + m;
          if (!on(sp) && !on(sq)) continue;
          const info = frameInfo(plan, t), fa = info.actors.find(b => b.id === a.id);
          this.issue({ rule: 'teleport', shot: shot.id, scene: shot.scene, actor: a.id, t, t0: t - 1 / fps, t1: t, metric: d,
            message: `${a.id} jumps ${Math.round(Math.hypot(dx, dy))} px (${Math.round(d)} units) between two frames at ${sec(t)}, from ${pt(q.x, q.y)} to ${pt(p.x, p.y)}`,
            box: fa?.screenBox, marks: [...(fa ? [{ kind: 'box', box: fa.screenBox, label: a.id }] : []), { kind: 'point', point: sq, label: 'was' }, { kind: 'point', point: sp, label: 'now' }] });
        }
        for (const id of [...prev.keys()]) if (!seen.has(id)) prev.delete(id);
      }
    }
  }

  // ── cut-jump: consecutive shots with nearly the same framing (and someone in it) ──
  cutJumps() {
    if (!this.on('cut-jump')) return;
    const shots = this.plan.shots || [], fps = this.fps, W = this.W, H = this.H;
    for (let i = 1; i < shots.length; i++) {
      const A = shots[i - 1], B = shots[i];
      if (A.setId !== B.setId || this.group.get(A.scene) !== this.group.get(B.scene)) continue;
      const ta = Math.max(A.t0, Math.round(A.t1 * fps) / fps - 1 / fps), tb = B.t0, a = A.cameraAt(ta), b = B.cameraAt(tb);
      const zr = Math.max(a.zoom / b.zoom, b.zoom / a.zoom), z = Math.min(a.zoom, b.zoom);
      const sx = Math.abs(a.cx - b.cx) * z / W, sy = Math.abs(a.cy - b.cy) * z / H;
      // the same empty view on both sides (a time-lapse running into a title, scenery only) is no jump: nothing moves
      const empty = t => !frameInfo(this.plan, t).actors.some(x => x.alpha > 0.05 && frac(shown(x), W, H) > 0.02);
      if (zr < LIMITS.cutZoom && sx < LIMITS.cutShift && sy < LIMITS.cutShift && !(empty(ta) && empty(tb))) {
        this.issue({ rule: 'cut-jump', shot: B.id, scene: B.scene, t: tb, metric: 1 / zr, frames: [ta, tb],
          message: `the cut ${A.id} → ${B.id} joins two nearly identical framings (zoom ×${zr.toFixed(2)}, shift ${pct(Math.max(sx, sy))} of the frame): change the size, the subject or the angle` });
      }
    }
  }

  // ── continuity: an actor's pose or place changing across a cut without the change being seen ──
  // Consecutive shots in one set joined by a cut (inside a scene, or into a scene of the same set and time of day that
  // cuts in), or by a dissolve into a shot that plays less than minShot on its own (too short to read as time
  // passing). An actor seen on both sides (the last frame before the cut and the first after it) must keep its pose
  // class (its drawn height over its standing height: lying, low, standing, up; changed by at least cutPose×) and its
  // place (moved at most cutMove × its size; riders go with their carrier). One issue per cut, at the frame after it.
  continuity() {
    if (!this.on('continuity')) return;
    const plan = this.plan, shots = plan.shots || [], fps = this.fps, W = this.W, H = this.H, scenes = new Map((plan.scenes || []).map(s => [s.id, s]));
    for (let i = 1; i < shots.length; i++) {
      const A = shots[i - 1], B = shots[i];
      if (A.setId !== B.setId) continue;
      let how = `the cut ${A.id} → ${B.id}`;
      if (A.scene !== B.scene) {
        const sa = scenes.get(A.scene), sb = scenes.get(B.scene);
        if (!sa || !sb || JSON.stringify(sa.time) !== JSON.stringify(sb.time)) continue;
        if (sb.transition === 'dissolve') {
          const { clean } = blended(plan, B);
          if (clean >= LIMITS.minShot - 1e-6) continue;
          how = `the dissolve ${A.id} → ${B.id} (too short to pass time: ${B.id} plays ${clean.toFixed(2)} s on its own)`;
        } else if (sb.transition && sb.transition !== 'cut') continue;
      }
      const tb = B.t0, ta = Math.max(A.t0, tb - 1 / fps), fa = frameInfo(plan, ta), fb = frameInfo(plan, tb);
      if (fa.shot !== A.id || fb.shot !== B.id) continue;
      const sa = new Map(plan.actorsAt(ta, A.scene).map(a => [a.id, a])), sb = new Map(plan.actorsAt(tb, B.scene).map(a => [a.id, a]));
      const seenIn = (a, f) => a.alpha >= 0.5 && frac(shown(a), W, H) >= 0.5 && (a.screenBox[3] - a.screenBox[1]) >= 0.03 * H && f.camera;
      const changes = [];
      for (const b of fb.actors) {
        const a = fa.actors.find(x => x.id === b.id), A_ = sa.get(b.id), B_ = sb.get(b.id);
        if (!a || !A_ || !B_ || !seenIn(a, fa) || !seenIn(b, fb)) continue;
        const R = B_.R, params = B_.st?.params || {}, stand = profile(R, 'stand', params).box, sh = Math.max(1, stand[3] - stand[1]);
        // the drawn height in its pose (not turned on a slope nor squashed in a turn), over its standing height
        const hu = x => { const r = probe(x.R, 0, 0, 1, 1, { ...x.st, shadow: false }).bounds; return (r[3] - r[1]) / sh; };
        const ha = hu(A_), hb = hu(B_), pa = posture(ha), pb = posture(hb);
        const pose = !a.airborne && !b.airborne && pa !== pb && Math.max(ha / hb, hb / ha) >= LIMITS.cutPose;
        const z = rigSizes(R, params), size = Math.max(z.width || 0, z.height || 0) || Math.max(stand[2] - stand[0], sh);
        const moved = Math.hypot(b.x - a.x, b.y - a.y) / ((a.s + b.s) / 2), place = b.mode !== 'mount' && a.mode !== 'mount' && moved > LIMITS.cutMove * size;
        if (!pose && !place) continue;
        const what = [];
        if (pose) what.push(`goes from ${pa} (drawn at ${ha.toFixed(2)}× its standing height) to ${pb} (${hb.toFixed(2)}×)`);
        if (place) what.push(`moves ${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px (${(moved / size).toFixed(1)}× its size)`);
        changes.push({ id: b.id, box: b.screenBox, metric: (pose ? Math.max(ha / hb, hb / ha) : 1) + (place ? moved / size : 0), text: `${b.id} ${what.join(' and ')}` });
      }
      if (!changes.length) continue;
      changes.sort((p, q) => q.metric - p.metric);
      this.issue({ rule: 'continuity', shot: B.id, scene: B.scene, actor: changes[0].id, t: tb, metric: changes[0].metric, frames: [ta, tb], box: changes[0].box,
        message: `across ${how}, ${changes.map(c => c.text).join('; ')}, and the change is never seen`,
        marks: changes.map(c => ({ kind: 'box', box: c.box, label: c.id })) });
    }
  }

  // ── timing: short shots, overlapping dialogue, fast captions ──
  timing() {
    if (!this.on('timing')) return;
    const plan = this.plan;
    for (const s of plan.shots || []) {
      const d = s.t1 - s.t0;
      if (d < LIMITS.minShot - 1e-6) { this.issue({ rule: 'timing', shot: s.id, scene: s.scene, t: (s.t0 + s.t1) / 2, t0: s.t0, t1: s.t1, metric: 1 - d / LIMITS.minShot, message: `shot ${s.id} lasts ${d.toFixed(2)} s (shorter than ${LIMITS.minShot} s)` }); continue; }
      // a shot long enough on paper that a dissolve or a fade leaves too little of on its own
      const { clean, parts } = blended(plan, s);
      if (clean < LIMITS.minShot - 1e-6) {
        // the length that plays minShot on its own (a dissolve grows with the shot it opens)
        const cleanAt = d2 => { const s2 = { ...s, t1: s.t0 + d2 }, p2 = Object.create(plan); p2.shots = plan.shots.map(x => (x === s ? s2 : x)); p2.scenes = (plan.scenes || []).map(q => (q.id === s.scene && Math.abs(q.t1 - s.t1) < 1e-6 ? { ...q, t1: s2.t1 } : q)); return blended(p2, s2).clean; };
        let d2 = d; while (cleanAt(d2) < LIMITS.minShot - 1e-6 && d2 < d + 10) d2 += 0.01;
        const why = parts.map(p => `${sec2(p.t1 - p.t0)} of ${p.what}`).join(' and '), more = d2 - d;
        this.issue({ rule: 'timing', shot: s.id, scene: s.scene, t: Math.min(s.t1 - 1e-3, Math.max(...parts.map(p => p.t1), s.t0)), t0: s.t0, t1: s.t1, metric: 1 - clean / LIMITS.minShot,
          message: `shot ${s.id} lasts ${d.toFixed(2)} s, but ${why} leave${parts.length > 1 ? '' : 's'} it only ${clean.toFixed(2)} s on its own (at least ${LIMITS.minShot} s): hold it ${more.toFixed(2)} s longer ("dur": ${d2.toFixed(2)})` });
      }
    }
    const lines = (plan.lines || []).slice().sort((a, b) => a.t0 - b.t0);
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length && lines[j].t0 < lines[i].t1; j++) {
      const A = lines[i], B = lines[j], o = Math.min(A.t1, B.t1) - B.t0;
      if (o <= LIMITS.dialogueOverlap) continue;
      const q = L => `${L.who} "${L.text.length > 28 ? `${L.text.slice(0, 26)}…` : L.text}"`;
      this.issue({ rule: 'timing', shot: B.shot, scene: B.scene, actor: B.who === 'narrator' ? undefined : B.who, t: B.t0 + Math.min(o, 0.3), t0: B.t0, t1: B.t0 + o, metric: o, message: `dialogue overlaps for ${o.toFixed(2)} s: ${q(A)} and ${q(B)}` });
    }
    const seen = new Set();
    for (const cap of plan.captions || []) {
      if (cap.style === 'title' || !cap.text) continue;
      const n = String(cap.text).replace(/\s+/g, ' ').trim().length, d = cap.t1 - cap.t0, cps = n / Math.max(1e-3, d);
      if (cps <= LIMITS.maxCps) continue;
      const k = cap.line ?? cap.text; if (seen.has(k)) continue; seen.add(k);
      const shot = plan.shotAt?.(cap.t0);
      this.issue({ rule: 'timing', shot: shot?.id ?? null, scene: shot?.scene ?? null, actor: cap.who && cap.who !== 'narrator' ? cap.who : undefined, t: Math.min(cap.t1 - 1e-3, cap.t0 + d / 2), t0: cap.t0, t1: cap.t1, metric: cps / LIMITS.maxCps - 1,
        message: `caption "${n > 40 ? `${cap.text.slice(0, 38)}…` : cap.text}" needs ${cps.toFixed(1)} characters per second (${n} characters in ${d.toFixed(2)} s; at most ${LIMITS.maxCps})` });
    }
  }

  finish(ms) {
    // framing faults that pass in a moment (a move sweeping through, a figure turning) are not issues; a warning its
    // shot allows ("lint": { "allow": [rule], "note" }) is kept, with the note and no fix tried
    const kept = new Set();
    const out = this.runs.filter(held).map(r => {
      const w = r.worst, span = r.t1 - r.t0 > 1e-6 && r.n > 1;
      const t = w.t ?? r.t0, L = r.shot != null ? this.srec.get(r.shot)?.def?.lint : null;
      const keep = r.severity === 'warning' && Array.isArray(L?.allow) && L.allow.includes(r.rule);
      const issue = { rule: r.rule, severity: r.severity, t, t0: r.t0, t1: r.t1, frame: Math.round(t * this.fps), shot: r.shot ?? null, scene: r.scene ?? null };
      if (r.actor) issue.actor = r.actor;
      if (r.other) issue.other = r.other;
      const msg = w.fix && !keep ? `${w.message}: ${this.hint(r)}` : w.message;
      issue.message = span && !w.frames ? `${msg} (${r.t0.toFixed(1)}–${r.t1.toFixed(1)} s)` : msg;
      if (keep) { issue.note = L.note; kept.add(issue); }
      if (w.box) issue.box = w.box.map(r1);
      if (w.marks?.length) issue.marks = w.marks.map(m => ({ ...m, ...(m.box ? { box: m.box.map(r1) } : {}), ...(m.ellipse ? { ellipse: m.ellipse.map(r1) } : {}), ...(m.point ? { point: m.point.map(r1) } : {}) }));
      if (w.frames) issue.frames = w.frames.slice();
      issue.samples = r.n;
      return issue;
    }).sort((a, b) => a.t - b.t || ORDER.indexOf(a.rule) - ORDER.indexOf(b.rule) || String(a.actor).localeCompare(String(b.actor)));
    const errors = out.filter(i => i.severity === 'error'), warnings = out.filter(i => i.severity !== 'error' && !kept.has(i));
    const byRule = Object.fromEntries(ORDER.map(r => [r, out.filter(i => i.rule === r && !kept.has(i)).length]).filter(([, n]) => n));
    return { errors, warnings, kept: out.filter(i => kept.has(i)), stats: { samples: this.samples, step: r3(this.step), ms: Math.round(ms), byRule } };
  }
}

export { writeLintReport } from './report.mjs';
