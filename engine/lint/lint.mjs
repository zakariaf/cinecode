// Staging and editing checks: the things that make a film look wrong even when every frame renders.
//   lintPlan(plan, { step = 1/6 }) → { errors, warnings, stats }
//   writeLintReport(plan, result, outDir) → { json, jpg }   (see report.mjs)
//
// The film is sampled on real frame times (every `step` seconds, every beat and line boundary, and the first and
// last frame of each shot). Each sample reads frameInfo() (screen boxes, heads, contacts, captions) and the set
// instance (walk region, water, stones, solid footprints, anchors, perspective). Teleports are checked on every
// frame. Consecutive hits of the same rule, actor and shot merge into one issue spanning t0–t1, reported at its
// worst moment `t`.
//
// Issue: { rule, severity, t, t0, t1, frame, shot, scene, actor?, other?, message, box?, marks?, frames?, samples }
//   t, frame  the worst moment (seconds, and the frame index t·fps); t0–t1 the span the hits cover
//   box     the offending actor's screen box [x0, y0, x1, y1] at t (plan W×H pixels)
//   marks   what the report draws: { kind: 'box' | 'ellipse' | 'point' | 'caption', box | [cx, cy, rx, ry] | [x, y], label }
//   frames  two times for issues about a cut (cut-jump, axis): the frame before and the frame after
import { createCanvas } from '@napi-rs/canvas';
import { frameInfo } from '../film/frame.mjs';
import { regionOf, SIZE_SPEC, ZMAX } from '../film/camera.mjs';
import { profile, rigSizes } from '../film/util.mjs';

export const RULES = {
  floating: { severity: 'error', catches: 'contact point not on the ground, an anchor surface or a perch, and not airborne by action' },
  'inside-solid': { severity: 'error', catches: 'contact point inside a solid prop footprint (walking through a tree, stump, rock)' },
  'in-water': { severity: 'error', catches: 'contact point in water, not on a stone, and the rig cannot swim' },
  collision: { severity: 'error', catches: 'two actors\' footprints overlap at similar depth (a warning when a beat makes them interact)' },
  'offscreen-speaker': { severity: 'error', catches: 'a speaking actor (not vo) is less than 60% visible' },
  'subject-size': { severity: 'warning', catches: 'the framed subject\'s screen height is outside the range for the shot size' },
  'caption-face': { severity: 'warning', catches: 'the caption box overlaps a speaker\'s head' },
  'cut-jump': { severity: 'warning', catches: 'consecutive shots of the same set with nearly identical framing' },
  axis: { severity: 'warning', catches: 'the left/right order of two talking actors flips across a cut' },
  teleport: { severity: 'error', catches: 'an actor moves more than 40 px (rig units) between two frames inside a shot' },
  scale: { severity: 'warning', catches: 'actor scale differs from set.scaleAt by more than 15% (perched actors use the anchor depth)' },
  timing: { severity: 'warning', catches: 'overlapping dialogue, shots under 1.2 s, captions faster than 20 characters per second' },
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
};
const SWIMMERS = new Set(['frog']);
const REGION_NAME = { wide: 'body', full: 'body', medium: 'waist-up region', close: 'head and shoulders', 'extreme-close': 'face' };
const MOVES = new Set(['walk', 'run', 'hop', 'fly', 'enter', 'exit']);
const ORDER = Object.keys(RULES);

/** Lint a compiled plan. opts: { step = 1/6 s, occlusion = true (props/front layers hide speakers), rules: [names] } */
export function lintPlan(plan, opts = {}) {
  return new Linter(plan, opts).run();
}

// ───────────── geometry ─────────────
const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const inter = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const frac = (b, W, H) => { const A = area(b); return A > 0 ? area(inter(b, [0, 0, W, H])) / A : 0; };
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
const pct = v => `${Math.round(v * 100)}%`;
const sec = t => `${t.toFixed(1)} s`;
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
const ellipseD = (c, x, y) => Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry);
const toScreen = (cam, W, H, x, y) => [(x - cam.cx) * cam.zoom + W / 2, (y - cam.cy) * cam.zoom + H / 2];
const ellipseMark = (cam, W, H, c, label) => { const [x, y] = toScreen(cam, W, H, c.x, c.y); return { kind: 'ellipse', ellipse: [x, y, c.rx * cam.zoom, c.ry * cam.zoom], label }; };

// Ids of the actors a beat brings together: moves, places, gestures and custom beats that name another actor
// (to: "near:fox", at: "fox", actors: [...]), and any beat with an explicit touch/contact. Looks and lines don't count.
const CONTACT_DO = new Set(['walk', 'run', 'hop', 'fly', 'enter', 'exit', 'place', 'gesture', 'custom', 'pose']);
function beatRefs(b, cast) {
  const out = new Set(), explicit = b.touch !== undefined || b.contact !== undefined;
  if (!explicit && !CONTACT_DO.has(b.do)) return out;
  const add = v => {
    if (Array.isArray(v)) return v.forEach(add);
    if (typeof v !== 'string') return;
    const m = /^(?:near|left-of|right-of|behind|front-of):\s*([\w.-]+)$/.exec(v.trim());
    const id = m ? m[1] : v.trim();
    if (cast[id]) out.add(id);
  };
  for (const k of ['who', 'to', 'from', 'at', 'on', 'target', 'actors', 'touch', 'contact']) add(b[k]);
  return out;
}

// frameInfo boxes are probed without the quick horizontal squash of a turn; drawFrame squashes around the contact.
function squashed(a) {
  const q = a.st.squash ?? 1;
  if (Math.abs(q - 1) < 1e-3) return a;
  const sx = a.contact.screen[0], X = v => sx + (v - sx) * q, box = b => { const p = X(b[0]), r = X(b[2]); return [Math.min(p, r), b[1], Math.max(p, r), b[3]]; };
  return { ...a, screenBox: box(a.screenBox), headBox: box(a.headBox), head: [X(a.head[0]), a.head[1]], hh: (a.headBox[2] - a.headBox[0]) / 1.2 };
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
 */
export function visibleFraction(plan, shot, t, info, a, st, states, { occlusion = true, region = null } = {}) {
  const W = plan.W, H = plan.H, cam = info.camera, z = cam.zoom, S = shot.set, alpha = st.alpha ?? 1;
  const mb = region ? inter(region, a.screenBox) : a.screenBox, [x0, y0, x1, y1] = mb, bw = x1 - x0, bh = y1 - y0;
  const inFrame = frac(mb, W, H) * alpha;
  if (!(bw > 0 && bh > 0) || inFrame <= 0 || !occlusion) return { frac: inFrame, frame: inFrame, blockers: [] };
  const k = Math.min(1, MASK / Math.max(bw, bh)), cw = Math.ceil(bw * k) + 2, ch = Math.ceil(bh * k) + 2;
  const x = maskCtx(cw, ch);
  const screen = () => x.setTransform(k, 0, 0, k, 1 - x0 * k, 1 - y0 * k);
  const world = () => x.setTransform(k * z, 0, 0, k * z, (W / 2 - cam.cx * z - x0) * k + 1, (H / 2 - cam.cy * z - y0) * k + 1);
  const clipPath = s => { s.clip.forEach(([px, py], i) => { const q = toScreen(cam, W, H, px, py); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath(); };
  const drawActor = (s, clipped = true) => {
    const sx = (s.x - cam.cx) * z + W / 2, sy = (s.y - cam.cy) * z + H / 2;
    x.save(); screen();
    if (clipped && s.clip) { x.beginPath(); clipPath(s); x.clip(); }
    s.R.draw(x, sx, sy, s.s * z, s.face, { ...s.st, shadow: false });
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
  const items = [];
  for (const p of S.propsSorted()) if (p.y > st.key) items.push({ key: p.y, id: p.id, draw: () => { world(); p.draw(x); }, box: p.bounds });
  for (const b of states.values()) if (b.id !== st.id && b.visible && b.mode !== 'off' && b.alpha > 0.5 && b.key > st.key) items.push({ key: b.key, id: b.id, draw: () => drawActor(b) });
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

// ───────────── the linter ─────────────
class Linter {
  constructor(plan, opts) {
    this.plan = plan; this.W = plan.W; this.H = plan.H; this.fps = plan.fps || 24;
    this.step = Number(opts.step) > 0 ? Number(opts.step) : 1 / 6;
    this.occlusion = opts.occlusion !== false;
    this.only = opts.rules ? new Set(opts.rules) : null;
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

  // A hit at the current sample. Consecutive hits with the same key extend one run.
  hit(c, h) {
    if (!this.on(h.rule)) return;
    const key = [h.rule, h.variant ?? '', h.actor ?? '', h.other ?? '', c.shot.id].join('|');
    const severity = h.severity ?? RULES[h.rule].severity;
    let run = this.open.get(key);
    // a run keeps the severity of its first sample (actors that came together on purpose stay a warning)
    if (run && run.last === c.si) { if ((h.metric ?? 0) > run.worst.metric) run.worst = { ...h, t: c.t, metric: h.metric ?? 0 }; return; }
    // a run that stopped less than mergeGap seconds ago in the same shot picks up again (no flicker around a limit)
    if (run && run.last !== c.si - 1 && run.shot === c.shot.id && c.t - run.t1 <= LIMITS.mergeGap) run.last = c.si - 1;
    if (!run || run.last !== c.si - 1) {
      run = { rule: h.rule, key, shot: c.shot.id, scene: c.shot.scene, actor: h.actor, other: h.other, t0: c.t, t1: c.t, n: 0, severity, worst: { ...h, t: c.t, metric: h.metric ?? 0 } };
      this.runs.push(run); this.open.set(key, run);
    }
    run.last = c.si; run.t1 = c.t; run.n++;
    if ((h.metric ?? 0) > run.worst.metric) run.worst = { ...h, t: c.t, metric: h.metric ?? 0 };
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
    const t0 = performance.now(), plan = this.plan;
    for (const shot of plan.shots || []) {
      for (const f of this.framesFor(shot)) {
        const t = f / this.fps, info = frameInfo(plan, t);
        if (info.shot !== shot.id || !info.camera) continue;
        const states = new Map(plan.actorsAt(t).map(a => [a.id, a]));
        const actors = info.actors.filter(a => states.has(a.id)).map(a => squashed({ ...a, st: states.get(a.id) })).map(a => ({ ...a, vis: frac(a.screenBox, this.W, this.H) }));
        const c = { t, f, si: this.si++, shot, info, states, actors, byId: new Map(actors.map(a => [a.id, a])), S: shot.set, cam: info.camera };
        this.samples++;
        this.actorRules(c);
        this.collisions(c);
        this.speakers(c);
        this.captionFace(c);
        this.subjectSize(c);
        this.axis(c);
      }
    }
    this.teleports();
    this.cutJumps();
    this.timing();
    return this.finish(performance.now() - t0);
  }

  // ── floating, inside-solid, in-water, scale ──
  actorRules(c) {
    const { S, cam, shot } = c, W = this.W, H = this.H;
    for (const a of c.actors) {
      if (a.vis <= 0.02 || a.alpha < 0.05) continue;           // not on screen: nothing to see
      const st = a.st, R = st.R, aloft = !!a.airborne, moving = MOVES.has(st.action), k = a.scale || 1;
      const where = pt(a.x, a.y), mark = { kind: 'point', point: a.contact.screen, label: a.mode };
      // floating
      if (!aloft) {
        let why = null;
        if (a.mode === 'ground') { if (!inRegion(S, a.x, a.y) && !S.onStone?.(a.x, a.y)) why = `stands on air at ${where}: outside the walkable ground of ${shot.setId}`; }
        else if (a.mode === 'air') why = `hangs in the air at ${where} without flying or jumping`;
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
      // in water
      if ((a.mode === 'ground' || a.mode === 'surface') && S.inWater?.(a.x, a.y) && !S.onStone?.(a.x, a.y) && !(R.swims || SWIMMERS.has(R.kind))) {
        this.hit(c, { rule: 'in-water', actor: a.id, metric: 1, message: `${a.id} (${R.kind}) stands in the water at ${where}; ${R.kind}s can't swim (use a stone or the bank)`, box: a.screenBox, marks: [{ kind: 'box', box: a.screenBox, label: a.id }, mark] });
      }
      // perspective scale (cast scale divided out; perched actors use their anchor's depth)
      if (this.on('scale')) {
        const an = a.mode !== 'ground' ? this.anchor(S, a.anchor) : null;
        const want = an ? an.s : S.scaleAt(a.x, a.y), got = a.s / k;
        if (want > 0 && Math.abs(got / want - 1) > LIMITS.scaleTol) {
          this.hit(c, { rule: 'scale', actor: a.id, metric: Math.abs(got / want - 1), message: `${a.id} is drawn at ${(got / want).toFixed(2)}× the set's scale at ${an ? `"${a.anchor}" (depth ${Math.round(an.depth)})` : where}: ${got.toFixed(2)} instead of ${want.toFixed(2)}${k !== 1 ? ` (cast scale ${k} divided out)` : ''}`, box: a.screenBox, marks: [{ kind: 'box', box: a.screenBox, label: a.id }] });
        }
      }
    }
  }

  // ── collision: footprints overlapping at similar depth ──
  footprint(a) {
    const R = a.st.R, params = a.st.st?.params || {}, b = profile(R, 'stand', params).box, w = rigSizes(R, params).width || (b[2] - b[0]);
    const cx = a.x + (a.face < 0 ? -1 : 1) * ((b[0] + b[2]) / 2) * a.s;
    return { cx, y: a.y, key: a.key, hl: Math.max(2, ((b[2] - b[0]) / 2) * a.s * 0.75), rd: Math.max(2, 0.15 * w * a.s) };
  }
  interacting(t, A, B) { return this.contacts.some(c => t >= c.t0 && t <= c.t1 && c.refs.has(A) && c.refs.has(B)); }
  collisions(c) {
    if (!this.on('collision')) return;
    const list = c.actors.filter(a => a.vis > 0.02 && a.alpha > 0.3 && !a.airborne && a.mode !== 'air' && a.mode !== 'hollow');
    const fp = list.map(a => this.footprint(a));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
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
      // what has to be seen depends on the shot size: the body in a wide shot, the head in a close-up
      const size = c.shot.size, region = framedRegion(a, size);
      const v = visibleFraction(this.plan, c.shot, c.t, c.info, a, a.st, c.states, { occlusion: this.occlusion, region });
      if (v.frac >= LIMITS.minVisible) continue;
      const parts = [], what = REGION_NAME[size] ? `${REGION_NAME[size]} ` : '';
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
  captionFace(c) {
    if (!this.on('caption-face')) return;
    const W = this.W, H = this.H;
    for (const cap of c.info.captions || []) for (const a of c.actors) {
      if (!a.speaking) continue;
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
    const subs = live.map(s => c.byId.get(s.id)).filter(Boolean).map(a => ({ a, g: framedRegion(a, size) }));
    if (!subs.length) return;
    const what = REGION_NAME[size] === 'body' ? 'body' : `${REGION_NAME[size]} region`;
    if (!subs.some(s => frac(s.g, W, H) >= 0.5)) {
      if (!live.some(s => s.action === 'enter' || s.action === 'exit')) {
        const s0 = subs[0];
        this.hit(c, { rule: 'subject-size', variant: 'absent', actor: s0.a.id, metric: 1, message: `${size} shot on ${ids.join(' + ')}, but ${subs.length > 1 ? 'none of their' : `${s0.a.id}'s`} ${what}${subs.length > 1 ? 's is' : ' is not'} in frame`, box: s0.g, marks: [{ kind: 'box', box: s0.g, label: s0.a.id }] });
      }
      return;
    }
    // the tallest framed region sets the zoom (also for subjects still walking in from off screen)
    const zoomK = this.srec.get(shot.id)?.def?.camera?.zoom ?? 1;
    const f = spec.f * zoomK, lo = 0.5 * f, hi = Math.min(1.35 * f, 1.15);
    let best = null, U = null;
    for (const { a, g } of subs) {
      const m = (g[3] - g[1]) / H;
      if (!best || m > best.m) best = { a, g, m };
      U = U ? [Math.min(U[0], a.screenBox[0]), Math.max(U[1], a.screenBox[2])] : [a.screenBox[0], a.screenBox[2]];
    }
    const big = best.m > hi;
    if (!big && best.m >= lo) return;
    if (!big) {
      if (live.length < ids.length) return;                            // someone not on yet: framed at their destination
      if (subs.length > 1 && (U[1] - U[0]) / W > 0.55 * spec.wmax) return;   // a two-shot fitted to the width
      if (shot.move === 'track') { const v = Math.max(0, ...[...this.motion(shot).values()].map(m => m.v)); if (v > 1 && c.cam.zoom <= (1.05 * W / v) * 1.03) return; }   // fast runners framed looser on purpose
    }
    const zmax = ZMAX * Math.max(1, Math.min(W, H) / 1080) * 0.98, fr = shot.frames || {};
    const capped = !big && Math.max(c.cam.zoom, fr.from?.zoom ?? 0, fr.to?.zoom ?? 0) >= zmax;
    // a subject crossing a static frame makes the camera frame the whole move
    const mo = this.motion(shot).get(best.a.id), bodyW = (best.a.screenBox[2] - best.a.screenBox[0]) / c.cam.zoom;
    const roams = !big && shot.move !== 'track' && mo && Math.max(mo.dx, mo.dy) > 1.5 * bodyW;
    this.hit(c, { rule: 'subject-size', variant: big ? 'big' : 'small', actor: best.a.id, metric: big ? best.m / hi - 1 : 1 - best.m / lo,
      message: `${size} shot: ${best.a.id}'s ${what} fills ${pct(best.m)} of the frame height (expected ${pct(lo)}–${pct(hi)})${capped ? '; the camera is already at its closest zoom, so the rig is too small for this size' : roams ? `; ${best.a.id} travels ${Math.round(Math.max(mo.dx, mo.dy))} px during the shot and the camera frames the whole move (try "move": "track")` : ''}`,
      box: best.g, marks: [{ kind: 'box', box: best.g, label: best.a.id }] });
  }

  // ── axis: talking pairs keep their left/right order across cuts ──
  axis(c) {
    if (!this.on('axis')) return;
    const talk = this.talkers.get(c.shot.scene); if (!talk || talk.size < 2) return;
    const g = this.group.get(c.shot.scene), ids = [...talk].sort(), W = this.W;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = c.byId.get(ids[i]), B = c.byId.get(ids[j]);
      if (!A || !B || A.vis < 0.4 || B.vis < 0.4) continue;
      const dx = A.contact.screen[0] - B.contact.screen[0];
      if (Math.abs(dx) < 0.03 * W) continue;
      const key = `${g}|${A.id}|${B.id}`, last = this.order.get(key), sign = Math.sign(dx);
      if (last && last.shot !== c.shot.id && last.sign !== sign) {
        const side = s => (s < 0 ? 'left' : 'right');
        this.hit(c, { rule: 'axis', actor: A.id, other: B.id, metric: 1, frames: [last.t, c.t],
          message: `${A.id} and ${B.id} swap sides across the cut: ${A.id} was ${side(last.sign)} of ${B.id} in ${last.shot}, now ${side(sign)} in ${c.shot.id}`,
          box: A.screenBox, marks: [{ kind: 'box', box: A.screenBox, label: A.id }, { kind: 'box', box: B.screenBox, label: B.id }] });
      }
      this.order.set(key, { sign, shot: c.shot.id, t: c.t });
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

  // ── cut-jump: consecutive shots with nearly the same framing ──
  cutJumps() {
    if (!this.on('cut-jump')) return;
    const shots = this.plan.shots || [], fps = this.fps, W = this.W, H = this.H;
    for (let i = 1; i < shots.length; i++) {
      const A = shots[i - 1], B = shots[i];
      if (A.setId !== B.setId || this.group.get(A.scene) !== this.group.get(B.scene)) continue;
      const ta = Math.max(A.t0, Math.round(A.t1 * fps) / fps - 1 / fps), tb = B.t0, a = A.cameraAt(ta), b = B.cameraAt(tb);
      const zr = Math.max(a.zoom / b.zoom, b.zoom / a.zoom), z = Math.min(a.zoom, b.zoom);
      const sx = Math.abs(a.cx - b.cx) * z / W, sy = Math.abs(a.cy - b.cy) * z / H;
      if (zr < LIMITS.cutZoom && sx < LIMITS.cutShift && sy < LIMITS.cutShift) {
        this.issue({ rule: 'cut-jump', shot: B.id, scene: B.scene, t: tb, metric: 1 / zr, frames: [ta, tb],
          message: `the cut ${A.id} → ${B.id} joins two nearly identical framings (zoom ×${zr.toFixed(2)}, shift ${pct(Math.max(sx, sy))} of the frame): change the size, the subject or the angle` });
      }
    }
  }

  // ── timing: short shots, overlapping dialogue, fast captions ──
  timing() {
    if (!this.on('timing')) return;
    const plan = this.plan;
    for (const s of plan.shots || []) {
      const d = s.t1 - s.t0;
      if (d < LIMITS.minShot - 1e-6) this.issue({ rule: 'timing', shot: s.id, scene: s.scene, t: (s.t0 + s.t1) / 2, t0: s.t0, t1: s.t1, metric: 1 - d / LIMITS.minShot, message: `shot ${s.id} lasts ${d.toFixed(2)} s (shorter than ${LIMITS.minShot} s)` });
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
    const out = this.runs.map(r => {
      const w = r.worst, span = r.t1 - r.t0 > 1e-6 && r.n > 1;
      const t = w.t ?? r.t0;
      const issue = { rule: r.rule, severity: r.severity, t, t0: r.t0, t1: r.t1, frame: Math.round(t * this.fps), shot: r.shot ?? null, scene: r.scene ?? null };
      if (r.actor) issue.actor = r.actor;
      if (r.other) issue.other = r.other;
      issue.message = span && !w.frames ? `${w.message} (${r.t0.toFixed(1)}–${r.t1.toFixed(1)} s)` : w.message;
      if (w.box) issue.box = w.box.map(r1);
      if (w.marks?.length) issue.marks = w.marks.map(m => ({ ...m, ...(m.box ? { box: m.box.map(r1) } : {}), ...(m.ellipse ? { ellipse: m.ellipse.map(r1) } : {}), ...(m.point ? { point: m.point.map(r1) } : {}) }));
      if (w.frames) issue.frames = w.frames.slice();
      issue.samples = r.n;
      return issue;
    }).sort((a, b) => a.t - b.t || ORDER.indexOf(a.rule) - ORDER.indexOf(b.rule) || String(a.actor).localeCompare(String(b.actor)));
    const errors = out.filter(i => i.severity === 'error'), warnings = out.filter(i => i.severity !== 'error');
    const byRule = Object.fromEntries(ORDER.map(r => [r, out.filter(i => i.rule === r).length]).filter(([, n]) => n));
    return { errors, warnings, stats: { samples: this.samples, step: r3(this.step), ms: Math.round(ms), byRule } };
  }
}

export { writeLintReport } from './report.mjs';
