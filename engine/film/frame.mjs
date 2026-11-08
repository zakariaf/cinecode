// drawFrame(ctx, plan, t): sky → back layers → depth-sorted props and actors (perched actors right after their
// prop, hollow actors clipped to the hole) → world effects → front layers → grade → titles → fades → captions.
// Close shots get a depth-of-field pass: everything behind the subjects is drawn first and blurred.
// Actors are drawn in screen space at (world scale × zoom), so rigs thin their ink for close-ups the way a
// painter redraws a close-up instead of enlarging the wide shot.
// frameInfo(plan, t): the same frame's geometry (screen boxes, head boxes, contacts, caption box) for lint/sheets.
import { createCanvas } from '@napi-rs/canvas';
import { grade, black } from './grade.mjs';
import { drawEvent, rain, zzz, airShadow, ONE_SHOT } from './fx.mjs';
import { layoutCaption, drawCaption, drawTitle, drawCard } from './text.mjs';
import { viewRect, toScreen } from './camera.mjs';
import { clamp, ease, probe, rigSizes } from './util.mjs';

const DISSOLVE = 0.8, SCENE_FADE = 0.35, START_FADE = 0.8, END_FADE = 1.2, CARD_DISSOLVE = 1.0;

const SCRATCH = new Map();
function scratch(W, H, i) {
  const k = `${W}x${H}#${i}`;
  if (!SCRATCH.has(k)) SCRATCH.set(k, createCanvas(W, H));
  const c = SCRATCH.get(k), x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  x.clearRect(0, 0, W, H);
  return [c, x];
}
const reset = ctx => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; };
const sceneRecOf = (plan, shot) => plan._scenes?.find(s => s.id === shot.scene);
const HH = new WeakMap();
function headHeight(a) {
  let m = HH.get(a.R); if (!m) HH.set(a.R, (m = new WeakMap()));
  const key = a.st.params || a.R;
  if (!m.has(key)) m.set(key, rigSizes(a.R, a.st.params || {}).headHeight);
  return m.get(key);
}

// An actor in screen space: position, scale and clip under camera `cam`.
function onScreen(a, cam, W, H) {
  const z = cam.zoom, sx = (a.x - cam.cx) * z + W / 2, sy = (a.y - cam.cy) * z + H / 2;
  return { sx, sy, ss: a.s * z, clip: a.clip ? a.clip.map(([x, y]) => [(x - cam.cx) * z + W / 2, (y - cam.cy) * z + H / 2]) : null };
}
// Head box (screen) from a screen-space draw result.
const headBox = (a, r, z) => { const hh = headHeight(a) * a.s * z, [hx, hy] = r.head; return [hx - 0.6 * hh, hy - 0.62 * hh, hx + 0.6 * hh, hy + 0.55 * hh]; };

function paintActor(c, a, P) {
  c.save();
  if (P.clip) { c.beginPath(); P.clip.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip(); }
  if (a.squash !== 1) { c.translate(P.sx, P.sy); c.scale(a.squash, 1); c.translate(-P.sx, -P.sy); }
  if (a.mode === 'air') { const w = (a.R.shadowW ?? (a.R.width || 40) * 0.5) * P.ss * (a.st.params?.size || 1); airShadow(c, P.sx, P.sy, w, (a.st.lift || 0) * P.ss); }
  const r = a.R.draw(c, P.sx, P.sy, P.ss, a.face, a.st);
  c.restore();
  return r;
}
function drawActor(ctx, a, t, cam, W, H, drawn) {
  const P = onScreen(a, cam, W, H);
  reset(ctx);
  let r;
  if (a.alpha < 0.999) {
    if (a.alpha <= 0.001) return null;
    const [cv, x] = scratch(W, H, 'actor');
    r = paintActor(x, a, P);
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.drawImage(cv, 0, 0); ctx.restore();
  } else r = paintActor(ctx, a, P);
  if (a.asleep && r?.head) zzz(ctx, r.head, t, Math.min(P.ss * 0.9, 2.6));
  if (r) drawn.set(a.id, r);
  return r;
}

const GLOW = new Set(['fireflies']);

// Depth of field radius (screen px) for a shot at zoom z: explicit, or automatic once the painted set is
// enlarged enough to look soft.
function dofRadius(shot, z, H) {
  const k = H / 1080;
  if (shot.dof === false || shot.dof === 0) return 0;
  const auto = clamp((z - 2.2) * 1.6, 0, 14);
  if (typeof shot.dof === 'number') return Math.max(shot.dof * 1.6, auto) * k;
  return (shot.dof === true ? Math.max(5, auto) : auto) * k;
}

// The picture of a shot at time t (no captions, no fades). Returns the speakers' head boxes for captions.
function picture(ctx, plan, shot, t) {
  const W = plan.W, H = plan.H, S = shot.set, cam = shot.cameraAt(t), sky = shot.skyAt(t), z = cam.zoom;
  S.build();
  reset(ctx);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  S.drawSky(ctx, cam, sky, t);
  const world = () => ctx.setTransform(z, 0, 0, z, W / 2 - cam.cx * z, H / 2 - cam.cy * z);
  const dofPx = dofRadius(shot, z, H);
  world();
  S.drawBack(ctx, cam, { t, dof: dofPx > 0 ? 2 : 0, haze: sky });
  const actors = plan.actorsAt(t).filter(a => a.visible && a.mode !== 'off');
  const drawn = new Map();
  const scene = shot.scene, rect = viewRect(cam, W, H);
  const live = plan.fx.filter(e => e.scene === scene && t >= e.t0 && t < e.t1);
  const items = S.propsSorted().map(p => ({ key: p.y, ord: 0, draw: () => { world(); p.draw(ctx); } }));
  for (const a of actors) items.push({ key: a.key, ord: 1, actor: a, draw: () => drawActor(ctx, a, t, cam, W, H, drawn) });
  for (const e of live) if (ONE_SHOT.has(e.name)) items.push({ key: (e.key ?? e.y ?? 0) + 0.5, ord: 2, draw: () => { world(); drawEvent(ctx, e, t, { rect, zoom: z, W, H, S }); } });
  items.sort((a, b) => a.key - b.key || a.ord - b.ord);
  // depth of field: blur everything behind the subjects (fading out below their feet)
  let i0 = 0;
  if (dofPx > 0.5) {
    const subj = actors.filter(a => shot.on.includes(a.id));
    if (subj.length) {
      const focus = Math.min(...subj.map(a => a.key)) - 2, feet = Math.max(...subj.map(a => onScreen(a, cam, W, H).sy));
      while (i0 < items.length && items[i0].key < focus) items[i0++].draw();
      const [cv, x] = scratch(W, H, 'dof');
      x.filter = `blur(${dofPx.toFixed(1)}px)`; x.drawImage(ctx.canvas, 0, 0); x.filter = 'none';
      if (feet < H * 1.05) {
        const g = x.createLinearGradient(0, feet - H * 0.16, 0, feet + H * 0.02);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over';
      }
      reset(ctx); ctx.drawImage(cv, 0, 0);
    }
  }
  for (let i = i0; i < items.length; i++) items[i].draw();
  world();
  let screenFx = null;
  const field = e => ({ ...e, t0: e.fade === false ? -1e9 : e.t0, t1: e.fade === false ? 1e9 : e.t1 });
  for (const e of live) if (!ONE_SHOT.has(e.name) && !GLOW.has(e.name)) { world(); if (drawEvent(ctx, field(e), t, { rect, zoom: z, W, H, S }) === 'screen') screenFx = e; }
  // custom beats (world space unless they ask for 'front' or 'screen')
  const customs = plan.custom.filter(c => c.scene === scene && c.def?.draw && t >= c.t0 && t < c.t1);
  const api = c => ({ t, lt: t - c.t0, dur: c.t1 - c.t0, beat: c.beat, set: S, cam, W, H, plan, actor: id => actors.find(a => a.id === id) || null, anchor: n => S.anchor(n) });
  const runCustom = (layer, space) => { for (const c of customs) if ((c.def.layer || 'world') === layer) { space(); ctx.save(); c.def.draw(ctx, clamp((t - c.t0) / (c.t1 - c.t0)), api(c)); ctx.restore(); } };
  runCustom('world', world);
  world();
  S.drawFront(ctx, cam, { t, dof: dofPx > 0 ? Math.max(2, dofPx / z) : 0 });
  runCustom('front', world);
  reset(ctx);
  if (screenFx) rain(ctx, t, W, H, { a: clamp(Math.min((t - screenFx.t0) / 1.2, (screenFx.t1 - t) / 1.2)), seed: screenFx.seed });
  const g = shot.gradeAt(t);
  grade(ctx, g, t, W, H, g.story);
  // lights (fireflies) glow over the grade instead of being darkened by it
  for (const e of live) if (GLOW.has(e.name)) { world(); drawEvent(ctx, field(e), t, { rect, zoom: z, W, H, S }); }
  runCustom('screen', () => reset(ctx));
  reset(ctx);
  for (const c of plan.captions) if (c.style === 'title' && c.burn && t >= c.t0 && t < c.t1 && plan.shotAt(c.t0)?.scene === scene) drawTitle(ctx, c, t, W, H);
  const heads = [];
  for (const a of actors) if (a.speaking && drawn.has(a.id)) heads.push({ id: a.id, box: headBox(a, drawn.get(a.id), z) });
  return { cam, heads };
}

// Captions burned in at t, placed away from the speakers' heads.
// Several captions at once (a line and a sound caption) stack instead of overlapping.
export function captionLayouts(plan, t, heads) {
  const taken = [], gap = plan.H * 0.012;
  return plan.captions.filter(c => c.burn && c.style !== 'title' && t >= c.t0 && t < c.t1)
    .sort((a, b) => (a.style === 'sound') - (b.style === 'sound') || a.t0 - b.t0)
    .map(c => {
      const L = layoutCaption(c, plan.W, plan.H, heads.map(h => h.box));
      for (let k = 0; k < 4; k++) {
        const hit = taken.find(b => L.box[0] < b[2] && L.box[2] > b[0] && L.box[1] < b[3] && L.box[3] > b[1]);
        if (!hit) break;
        const dy = L.top ? hit[3] + gap - L.box[1] : hit[1] - gap - L.box[3];
        L.box = [L.box[0], L.box[1] + dy, L.box[2], L.box[3] + dy];
      }
      taken.push(L.box);
      return { c, L, alpha: Math.min(ease((t - c.t0) / 0.15), ease((c.t1 - t) / 0.15)) };
    });
}

function fadeAmount(plan, shot, t) {
  const scenes = plan._scenes || [], i = scenes.findIndex(s => s.id === shot.scene), rec = scenes[i];
  let a = 0;
  const open = plan.cards.find(c => c.kind === 'open'), end = plan.cards.find(c => c.kind === 'end');
  if (i === 0 && !open) a = Math.max(a, 1 - ease((t - rec.t0) / START_FADE));
  if (i > 0 && rec.transition === 'fade') a = Math.max(a, 1 - ease((t - rec.t0) / SCENE_FADE));
  const next = scenes[i + 1];
  if (next && next.transition === 'fade') a = Math.max(a, ease((t - (rec.t1 - SCENE_FADE)) / SCENE_FADE));
  if (!next && !end) a = Math.max(a, ease((t - (rec.t1 - END_FADE)) / END_FADE));
  if (shot.fadeIn > 0) a = Math.max(a, 1 - ease((t - shot.t0) / shot.fadeIn));
  if (shot.fadeOut > 0) a = Math.max(a, ease((t - (shot.t1 - shot.fadeOut)) / shot.fadeOut));
  return a;
}

// The full scene frame at t: picture, dissolve from the previous scene, fades. → heads for captions
function sceneFrame(ctx, plan, shot, t) {
  const W = plan.W, H = plan.H, out = picture(ctx, plan, shot, t);
  const rec = sceneRecOf(plan, shot), scenes = plan._scenes || [], i = scenes.indexOf(rec);
  if (rec && i > 0 && rec.transition === 'dissolve' && t - rec.t0 < DISSOLVE) {
    const prev = scenes[i - 1], pshot = [...plan.shots].reverse().find(s => s.scene === prev.id);
    if (pshot) {
      const [cv, x] = scratch(W, H, 'dissolve');
      picture(x, plan, pshot, t);
      reset(ctx); ctx.globalAlpha = 1 - ease((t - rec.t0) / DISSOLVE); ctx.drawImage(cv, 0, 0); reset(ctx);
    }
  }
  black(ctx, fadeAmount(plan, shot, t), W, H);
  return out;
}

/** Draw the frame at film time t into a W×H context. */
export function drawFrame(ctx, plan, t) {
  const W = plan.W, H = plan.H, tt = clamp(t, 0, Math.max(0, plan.duration - 1e-6));
  ctx.save();
  reset(ctx);
  try {
    const card = plan.cards.find(c => tt >= c.t0 && tt < c.t1);
    if (card) { drawCardFrame(ctx, plan, card, tt); return; }
    const shot = plan.shotAt(tt) ?? plan.shots[plan.shots.length - 1];
    if (!shot) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    const { heads } = sceneFrame(ctx, plan, shot, tt);
    reset(ctx);
    if (plan.captionMode !== 'none') for (const { L, alpha } of captionLayouts(plan, tt, heads)) drawCaption(ctx, L, alpha, W, H);
  } finally { ctx.restore(); }
}

function drawCardFrame(ctx, plan, card, t) {
  const W = plan.W, H = plan.H;
  if (card.kind === 'open') {
    const first = plan.shots[0], u = first ? ease((t - (card.t1 - CARD_DISSOLVE)) / CARD_DISSOLVE) : 0;
    if (u > 0) {
      sceneFrame(ctx, plan, first, first.t0);
      const [cv, x] = scratch(W, H, 'card'); drawCard(x, card, t, W, H);
      reset(ctx); ctx.globalAlpha = 1 - u; ctx.drawImage(cv, 0, 0); reset(ctx);
    } else drawCard(ctx, card, t, W, H);
    black(ctx, 1 - ease(t / START_FADE), W, H);
  } else {
    const last = plan.shots[plan.shots.length - 1], u = last ? ease((t - card.t0) / CARD_DISSOLVE) : 1;
    if (u < 1) {
      sceneFrame(ctx, plan, last, card.t0 - 1 / plan.fps);
      const [cv, x] = scratch(W, H, 'card'); drawCard(x, card, t, W, H);
      reset(ctx); ctx.globalAlpha = u; ctx.drawImage(cv, 0, 0); reset(ctx);
    } else drawCard(ctx, card, t, W, H);
    black(ctx, ease((t - (card.t1 - END_FADE)) / END_FADE), W, H);
  }
}

/**
 * Geometry of the frame at t, for lint and debug sheets.
 * → { t, shot, scene, set, size, camera, view, actors: [{ id, rig, x, y, s, scale, face, screenBox, worldBox, headBox,
 *     head, contact: { x, y, kind, screen }, airborne, perch, speaking, mode, key, alpha, action, anchor }],
 *     captionBox, captions, colliders }
 */
export function frameInfo(plan, t) {
  const W = plan.W, H = plan.H, shot = plan.shotAt(t);
  if (!shot) return { t, shot: null, scene: null, set: null, camera: null, actors: [], captionBox: null, captions: [], colliders: [], card: plan.cards.find(c => t >= c.t0 && t < c.t1)?.kind ?? null };
  const cam = shot.cameraAt(t), z = cam.zoom, heads = [];
  const toWorld = b => [(b[0] - W / 2) / z + cam.cx, (b[1] - H / 2) / z + cam.cy, (b[2] - W / 2) / z + cam.cx, (b[3] - H / 2) / z + cam.cy];
  const actors = plan.actorsAt(t).filter(a => a.visible && a.mode !== 'off' && a.alpha > 0.001).map(a => {
    const P = onScreen(a, cam, W, H), r = probe(a.R, P.sx, P.sy, P.ss, a.face, { ...a.st, shadow: false });
    const hb = headBox(a, r, z);
    if (a.speaking) heads.push({ id: a.id, box: hb });
    return {
      id: a.id, rig: a.rig, x: a.x, y: a.y, s: a.s, scale: a.scale, face: a.face, screenBox: r.bounds.slice(), worldBox: toWorld(r.bounds), headBox: hb,
      head: r.head.slice(), contact: { x: a.x, y: a.y, kind: a.mode === 'air' ? 'air' : a.mode, screen: [P.sx, P.sy] },
      airborne: a.airborne, perch: a.perch, speaking: a.speaking, mode: a.mode, key: a.key, alpha: a.alpha, action: a.action, anchor: a.anchor,
    };
  });
  const caps = plan.captionMode === 'none' ? [] : captionLayouts(plan, t, heads);
  return {
    t, shot: shot.id, scene: shot.scene, set: shot.setId, size: shot.size, camera: cam, view: viewRect(cam, W, H), actors,
    captionBox: caps[0]?.L.box ?? null, captions: caps.map(c => ({ text: c.c.text, style: c.c.style, box: c.L.box, top: c.L.top })),
    colliders: shot.set.colliders(),
  };
}
export { toScreen };
