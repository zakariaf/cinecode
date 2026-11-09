// drawFrame(ctx, plan, t): sky → [sky overlays] → back layers → [back overlays] → depth-sorted props and actors
// (perched actors right after their prop, hollow actors clipped to the hole, riders just in front of their carrier,
// wading actors sunk and clipped at the waterline with a ripple ring) → world effects → [world overlays, custom
// beats] → front layers → [front] → grade → rim light → [grade] → glowing effects → [screen] → titles → fades →
// captions. [layer] = custom.mjs overlays of the scene and custom beats drawn on that layer (DESIGN §9.1).
// Close shots get a depth-of-field pass: everything behind the subjects is drawn first and blurred (and, at night,
// darkened: the moon lights the figure, not the soft world behind it); at night a close or medium shot's vignette
// centres on its subjects' heads. Captions avoid every head in the picture, a speaker's most (captionLayouts).
// Actors are drawn in screen space at (world scale × zoom), so rigs thin their ink for close-ups the way a
// painter redraws a close-up instead of enlarging the wide shot.
// A dissolve draws the outgoing scene with that scene's own actors, overlays and rim light.
// The sun casts shadows by time of day (castShadow, propShadow): every grounded figure's and solid prop's silhouette
// laid across the ground away from the set's light. A memory plate ends with its torn page edge (grade.mjs deckle).
// Titles sit where their beat's "place" says, else in the calmest band of the picture under them inside title-safe
// (titleY), centred over the shot's subjects (titleX).
// frameInfo(plan, t): the same frame's geometry (screen boxes, head boxes, contacts, caption box) for lint/sheets;
// boxes include the quick squash of a turn and a wading actor's sink (visibleBox: the part above the waterline).
import { createCanvas } from '@napi-rs/canvas';
import { grade, black, deckle, sunOf } from './grade.mjs';
import { drawEvent, rain, zzz, airShadow, ripple, ONE_SHOT } from './fx.mjs';
import { layoutCaption, drawCaption, drawTitle, drawCard, titleBlock, TITLE_PLACES } from './text.mjs';
import { viewRect, toScreen } from './camera.mjs';
import { clamp, ease, probe, rigSizes, hash32 } from './util.mjs';
import { canvas, rng } from '../core/lib.mjs';

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

// An actor in screen space: position, scale, clip, wading sink (screen px drawn below the contact) and waterline.
function onScreen(a, cam, W, H) {
  const z = cam.zoom, sx = (a.x - cam.cx) * z + W / 2, sy = (a.y - cam.cy) * z + H / 2;
  return {
    sx, sy, ss: a.s * z, clip: a.clip ? a.clip.map(([x, y]) => [(x - cam.cx) * z + W / 2, (y - cam.cy) * z + H / 2]) : null,
    sink: (a.sink || 0) * z, wl: a.waterY != null ? (a.waterY - cam.cy) * z + H / 2 : null,
  };
}
// Head box (screen) from a screen-space draw result.
const headBox = (a, r, z) => { const hh = headHeight(a) * a.s * z, [hx, hy] = r.head; return [hx - 0.6 * hh, hy - 0.62 * hh, hx + 0.6 * hh, hy + 0.55 * hh]; };

// silhouette: no shadows (the rim light paints from it)
function paintActor(c, a, P, silhouette = false) {
  c.save();
  if (P.clip) { c.beginPath(); P.clip.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip(); }
  if (P.wl != null) { c.beginPath(); if (P.under) c.rect(-1e5, P.wl, 2e5, 2e5); else c.rect(-1e5, -1e5, 2e5, P.wl + 1e5); c.clip(); }
  if (a.squash !== 1) { c.translate(P.sx, P.sy); c.scale(a.squash, 1); c.translate(-P.sx, -P.sy); }
  if (a.mode === 'air' && !silhouette) { const w = (a.R.shadowW ?? (a.R.width || 40) * 0.5) * P.ss * (a.st.params?.size || 1); airShadow(c, P.sx, P.sy, w, (a.st.lift || 0) * P.ss); }
  const r = a.R.draw(c, P.sx, P.sy + P.sink, P.ss, a.face, silhouette ? { ...a.st, shadow: false } : a.st);
  c.restore();
  return r;
}
// The ripple ring where a wading actor (or a rider sunk with its carrier) meets the water: the back half before the
// actor, the front half after it. Faint once the actor is entirely under.
function rippleOf(a, P, t, half) {
  if (P.wl == null) return null;
  const top = P.sy + P.sink - rigSizes(a.R, a.st.params || {}).height * P.ss * 1.05;
  if (P.sy + P.sink <= P.wl + 0.5) return null;                       // feet above the water
  const w = rigSizes(a.R, a.st.params || {}).width * P.ss;
  return { x: P.sx, y: P.wl, rx: Math.max(6, w * 0.42), a: top < P.wl ? 1 : 0.35, seed: hash32(a.id), half, t, s: P.ss };
}
// The set's water in screen space, as a clip.
function clipWater(c, S, cam, W, H) {
  const z = cam.zoom; c.beginPath();
  for (const P of S?.walk?.water || []) P.forEach(([x, y], i) => { const sx = (x - cam.cx) * z + W / 2, sy = (y - cam.cy) * z + H / 2; if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); });
  c.clip();
}
// The part of a wading body below the waterline, seen faintly through the water: tinted, fading with depth.
function underwater(c, a, P, S, cam, W, H) {
  const [cv, x] = scratch(W, H, 'under'), hh = rigSizes(a.R, a.st.params || {}).height * P.ss;
  paintActor(x, a, { ...P, under: true }, true);
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(58,104,124,0.72)'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, P.wl, 0, P.wl + Math.max(8, hh * 0.9));
  g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, W, H);
  c.save(); clipWater(c, S, cam, W, H); c.drawImage(cv, 0, 0); c.restore();
}
function drawActor(ctx, a, t, cam, W, H, drawn, S, shade = 0) {
  const P = onScreen(a, cam, W, H);
  reset(ctx);
  if (a.alpha <= 0.001) return null;
  const back = rippleOf(a, P, t, 'back'), front = back && { ...back, half: 'front' };
  const wet = (c, fn) => { c.save(); clipWater(c, S, cam, W, H); fn(c); c.restore(); };
  const paint = c => {
    if (back) wet(c, x => ripple(x, back));
    let r;
    if (P.wl == null) r = paintActor(c, a, P);
    else {
      // hide the body below the waterline only where it is over the water (a hind leg still on the bank stays)
      const [cv, x] = scratch(W, H, 'wade');
      r = paintActor(x, a, { ...P, wl: null });
      x.save(); clipWater(x, S, cam, W, H); x.globalCompositeOperation = 'destination-out'; x.fillRect(-1, P.wl, W + 2, H - P.wl + 1); x.restore();
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(cv, 0, 0); c.restore();
      underwater(c, a, P, S, cam, W, H);
    }
    if (front) wet(c, x => ripple(x, front));
    return r;
  };
  let r;
  // fading, or standing in a prop's shade (drawn darker and a little cooler): painted aside, then laid in at once
  if (a.alpha < 0.999 || shade > 0.01) {
    const [cv, x] = scratch(W, H, 'actor');
    r = paint(x);
    ctx.save(); ctx.globalAlpha = a.alpha;
    if (shade > 0.01) ctx.filter = `brightness(${(1 - 0.75 * shade).toFixed(3)}) saturate(${(1 - 0.3 * shade).toFixed(3)})`;
    // (only the drawing's own region: a full-frame pass per figure is slow)
    const b = r?.bounds, m = b ? 0.3 * (b[3] - b[1]) + 8 : 0;
    const [x0, y0, x1, y1] = b ? [clamp(Math.floor(b[0] - m), 0, W), clamp(Math.floor(b[1] - m), 0, H), clamp(Math.ceil(b[2] + m), 0, W), clamp(Math.ceil(b[3] + m), 0, H)] : [0, 0, W, H];
    if (x1 > x0 && y1 > y0) ctx.drawImage(cv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  } else r = paint(ctx);
  if (a.asleep && r?.head) zzz(ctx, r.head, t, Math.min(P.ss * 0.9, 2.6));
  if (r) drawn.set(a.id, r);
  return r;
}

// ───────────── cast shadows ─────────────
// The sun lays each grounded figure's silhouette (and each solid prop's) on the ground away from the set's light: it is
// sheared sideways by len × the height above the ground and falls a little toward the lens (the light is above and
// behind the scene: an upper-left light throws shadows to the lower right), softened more for taller casters, fading
// toward its tip, and multiplied over whatever lies under it. Its length and strength follow the time of day (SUN in
// grade.mjs: short at noon, long at dawn and golden hour, none at night). Perched, hollow-bound and wading actors
// throw none; a rider's falls from its carrier's ground. A prop's is cached per set, prop and sun; a tall prop's (a
// tree's canopy) is dappled with light, and a figure standing in a prop's shade is drawn that much darker (shadeAt).
const SHADOW_RGB = '74,68,112';
export function sunFor(S, sky) {
  const s = sunOf(typeof sky === 'string' ? [[sky, 1]] : sky);
  if (!(s.a > 0.004) || !(s.len > 0)) return null;
  const dir = (S?.light?.[0] ?? -0.6) < 0 ? 1 : -1;
  return { a: s.a, len: s.len, dx: dir * 0.87 * s.len, dy: Math.max(0.05, 0.18 * s.len) };
}
// the shear about a ground line gy: (x, y) → (x + dx·(gy − y), gy + dy·(gy − y))
const shear = (c, sun, gy) => c.transform(1, 0, -sun.dx, -sun.dy, sun.dx * gy, gy * (1 + sun.dy));
function castShadow(ctx, a, P, sun, cam, W, H) {
  if (!sun || a.alpha < 0.05 || a.mode === 'perch' || a.mode === 'hollow' || P.wl != null || (a.sink || 0) > 0) return;
  const gy = a.ground != null ? (a.ground - cam.cy) * cam.zoom + H / 2 : P.sy;
  // softened by painting it smaller and laying it in enlarged (a blur filter would cost a full-frame pass per figure):
  // 1/k resolution, more for taller casters
  const k = clamp(Math.round(a.s * cam.zoom * 0.9), 2, 4), [cv, x] = scratch(Math.ceil(W / k), Math.ceil(H / k), 'cast');
  x.scale(1 / k, 1 / k); shear(x, sun, gy);
  const r = paintActor(x, a, P, true), b = r?.bounds;
  if (!b) return;
  const hgt = Math.max(1, gy - Math.min(b[1], gy)), m = 2 * k;
  const xs = [b[0], b[2]].flatMap(X => [b[1], b[3]].map(Y => X + sun.dx * (gy - Y))), ys = [b[1], b[3]].map(Y => gy + sun.dy * (gy - Y));
  const x0 = clamp(Math.floor((Math.min(...xs) - m) / k), 0, cv.width), x1 = clamp(Math.ceil((Math.max(...xs) + m) / k), 0, cv.width);
  const y0 = clamp(Math.floor((Math.min(...ys) - m) / k), 0, cv.height), y1 = clamp(Math.ceil((Math.max(...ys) + m) / k), 0, cv.height);
  if (x1 <= x0 || y1 <= y0) return;
  x.setTransform(1 / k, 0, 0, 1 / k, 0, 0); x.globalCompositeOperation = 'source-in';
  const g = x.createLinearGradient(P.sx, gy, P.sx + sun.dx * hgt, gy + sun.dy * hgt);
  g.addColorStop(0, `rgba(${SHADOW_RGB},1)`); g.addColorStop(1, `rgba(${SHADOW_RGB},0.5)`);
  x.fillStyle = g; x.fillRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k); x.globalCompositeOperation = 'source-over';
  ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = clamp(sun.a * a.alpha); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, x0, y0, x1 - x0, y1 - y0, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
  ctx.restore();
}
const PROP_SHADOW = new WeakMap();
function propShadowSprite(p, sun) {
  const py = p.y, hgt = Math.max(1, py - p.sy), X = (x, y) => x + sun.dx * (py - y), Y = y => py + sun.dy * (py - y);
  const blur = clamp(hgt * 0.012, 1.5, 12), pad = blur * 3;
  const xs = [X(p.sx, p.sy), X(p.sx + p.sw, p.sy), X(p.sx, py), X(p.sx + p.sw, py)], ys = [Y(p.sy), py];
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const res = clamp(700 / Math.max(x1 - x0, y1 - y0), 0.15, 1), w = Math.ceil((x1 - x0) * res), h = Math.ceil((y1 - y0) * res);
  const [c, x] = canvas(w, h);
  x.setTransform(res, 0, 0, res, -x0 * res, -y0 * res); shear(x, sun, py);
  x.save(); x.beginPath(); x.rect(p.sx - 1, p.sy - 1, p.sw + 2, py - p.sy + 1); x.clip();     // only what stands above the ground
  x.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh); x.restore();
  x.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
  const bx = (p.sx + p.sw / 2), g = x.createLinearGradient(bx, py, X(bx, p.sy), Y(p.sy));
  g.addColorStop(0, `rgba(${SHADOW_RGB},1)`); g.addColorStop(1, `rgba(${SHADOW_RGB},0.8)`);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
  // dapples: sun through the leaves of a tall prop, in the part of its shadow away from its foot
  if (hgt > 300) {
    const r = rng(hash32(p.id) % 100000 + 17), n = Math.round(clamp(hgt / 12, 30, 140));
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) {
      const v = 0.35 + 0.65 * r(), sx = p.sx + p.sw * r(), wx = X(sx, py - v * hgt), wy = Y(py - v * hgt), rad = hgt * (0.012 + 0.03 * r());
      const d = x.createRadialGradient(wx, wy, 0, wx, wy, rad); d.addColorStop(0, `rgba(0,0,0,${(0.45 + 0.35 * r()).toFixed(2)})`); d.addColorStop(1, 'rgba(0,0,0,0)');
      x.save(); x.translate(wx, wy); x.scale(1, 0.45); x.translate(-wx, -wy); x.fillStyle = d; x.fillRect(wx - rad, wy - rad, 2 * rad, 2 * rad); x.restore();
    }
  }
  const [o, ox] = canvas(w, h); ox.filter = `blur(${(blur * res).toFixed(2)}px)`; ox.drawImage(c, 0, 0); ox.filter = 'none';
  const A = ox.getImageData(0, 0, w, h).data;
  // how deep the shade is at a world point (0..1), for the figures standing in it
  const at = (wx, wy) => { const i = Math.floor((wx - x0) * res), j = Math.floor((wy - y0) * res); return i < 0 || j < 0 || i >= w || j >= h ? 0 : A[(j * w + i) * 4 + 3] / 255; };
  return { c: o, x0, y0, w: x1 - x0, h: y1 - y0, at };
}
// The cached shadow of a solid prop for a sun (null for props that throw none).
function propShadowOf(S, id, sun) {
  const p = S.props?.find(q => q.id === id);
  if (!sun || !p || !p.solid || !p.sprite || !(p.y > p.sy)) return null;
  let m = PROP_SHADOW.get(S); if (!m) PROP_SHADOW.set(S, (m = new Map()));
  const q = v => Math.round(v * 20) / 20, key = `${id}|${q(sun.dx)}|${q(sun.dy)}`;
  if (!m.has(key)) m.set(key, propShadowSprite(p, { dx: q(sun.dx), dy: q(sun.dy) }));
  return m.get(key);
}
// How far an actor stands in the props' shade (0..1 × the sun's strength): it is drawn that much darker.
function shadeAt(S, a, sun) {
  if (!sun || a.mode === 'perch' || a.mode === 'hollow' || a.mode === 'air') return 0;
  let k = 0;
  for (const p of S.props || []) { if (!p.solid || p.y >= a.key) continue; const e = propShadowOf(S, p.id, sun); if (e) k = Math.max(k, e.at(a.x, a.ground ?? a.y)); }
  return k * sun.a;
}
// (world transform set by the caller)
function propShadow(ctx, S, id, sun) {
  const e = propShadowOf(S, id, sun);
  if (!e) return;
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = clamp(sun.a); ctx.drawImage(e.c, e.x0, e.y0, e.w, e.h); ctx.restore();
}

// ───────────── rim light ─────────────
// Each visible actor's silhouette edge that faces the light glows (screen blend) after the grade, so night doesn't
// kill it: the band = silhouette minus the silhouette shifted toward the light, softened inward, with a little
// bloom outside. Actors in front mask the rims of those behind.
const RIM_DIR = { left: [-1, 0], right: [1, 0], top: [0, -1], 'upper-left': [-Math.SQRT1_2, -Math.SQRT1_2], 'upper-right': [Math.SQRT1_2, -Math.SQRT1_2] };
export function rimStrength(rim, t) {
  if (!rim || t < rim.t0) return 0;
  return (rim.strength ?? 0.8) * (rim.rise > 0 ? ease((t - rim.t0) / rim.rise) : 1);
}
function rimLight(ctx, rim, actors, t, cam, W, H, drawn) {
  const k = rimStrength(rim, t);
  if (k <= 0.004 || !actors.length) return;
  // width: `width` screen px (at least 2) at 1080p, the same in every shot size (never under 1.2 px, so small
  // previews still show it)
  const d = RIM_DIR[rim.dir] || RIM_DIR['upper-left'], u = H / 1080, w = Math.max(1.2, Math.max(2, rim.width ?? 3) * u);
  const [cvS, xs] = scratch(W, H, 'rimS'), [cvB, xb] = scratch(W, H, 'rimB');
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i], r = drawn.get(a.id);
    if (!r || a.alpha <= 0.01) continue;
    const P = onScreen(a, cam, W, H), m = Math.ceil(w * 4 + 4), b = r.bounds, x0 = Math.max(0, Math.floor(b[0] - m)), y0 = Math.max(0, Math.floor(b[1] - m));
    const x1 = Math.min(W, Math.ceil(b[2] + m)), y1 = Math.min(H, Math.ceil(b[3] + m)), bw = x1 - x0, bh = y1 - y0;
    if (bw <= 0 || bh <= 0) continue;
    // the band: the silhouette minus itself moved toward the light (softened so it fades inward). The moved copy is
    // painted, not shifted as an image, so a body cut by the frame edge gets no false rim along that edge.
    xb.clearRect(x0, y0, bw, bh); paintActor(xb, a, P, true);
    xs.clearRect(x0, y0, bw, bh); paintActor(xs, a, { ...P, sx: P.sx - d[0] * w, sy: P.sy - d[1] * w, wl: P.wl == null ? null : P.wl - d[1] * w }, true);
    xb.globalCompositeOperation = 'destination-out'; xb.filter = `blur(${(w * 0.45).toFixed(2)}px)`;
    xb.drawImage(cvS, x0, y0, bw, bh, x0, y0, bw, bh);
    xb.filter = 'none';
    // actors in front hide this one's rim (their silhouettes are drawn normally, then erase: rigs shade with
    // 'multiply', which would paint instead of erase if drawn straight into the band)
    for (let j = i + 1; j < actors.length; j++) {
      const o = actors[j], ro = drawn.get(o.id); if (!ro || o.alpha < 0.5) continue;
      const q = ro.bounds; if (q[0] > x1 || q[2] < x0 || q[1] > y1 || q[3] < y0) continue;
      xs.clearRect(x0, y0, bw, bh); paintActor(xs, o, onScreen(o, cam, W, H), true);
      xb.drawImage(cvS, x0, y0, bw, bh, x0, y0, bw, bh);
    }
    xb.globalCompositeOperation = 'source-in'; xb.fillStyle = rim.color || '#fff1d6'; xb.fillRect(x0, y0, bw, bh);
    xb.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(k * a.alpha); ctx.drawImage(cvB, x0, y0, bw, bh, x0, y0, bw, bh);
    ctx.globalAlpha = clamp(k * a.alpha * 0.4); ctx.filter = `blur(${(w * 1.5).toFixed(2)}px)`; ctx.drawImage(cvB, x0, y0, bw, bh, x0, y0, bw, bh);
    ctx.restore();
  }
}

// ───────────── overlays and custom beats ─────────────
// The api handed to custom.mjs overlays and custom beats (DESIGN §9.1). actor(id) is the actor's draw state plus its
// world head / mouth / box; toScreen / toWorld map points between the world and the screen.
function layerRunner(ctx, plan, shot, t, cam, actors) {
  const scene = plan.scenes.find(s => s.id === shot.scene), W = plan.W, H = plan.H, z = cam.zoom, S = shot.set;
  const overlays = (plan.overlays || []).filter(o => o.scene === shot.scene);
  const customs = plan.custom.filter(c => c.scene === shot.scene && c.def?.draw && t >= c.t0 && t < c.t1);
  if (!overlays.length && !customs.length) return () => {};
  const geo = new Map();
  const actor = id => {
    const a = actors.find(x => x.id === id); if (!a) return null;
    if (!geo.has(id)) {
      const q = probe(a.R, a.x, a.y + (a.sink || 0), a.s, a.face, { ...a.st, shadow: false });
      geo.set(id, { ...a, head: q.head.slice(), mouth: (q.mouth || q.head).slice(), box: q.bounds.slice() });
    }
    return geo.get(id);
  };
  const base = {
    t, st: t - scene.t0, su: clamp((t - scene.t0) / ((scene.t1 - scene.t0) || 1)), lt: t - shot.t0, scene, shot, set: S, cam, W, H, plan,
    marks: plan.marks || {}, actor, anchor: n => S.anchor(n),
    toScreen: ([x, y]) => [(x - cam.cx) * z + W / 2, (y - cam.cy) * z + H / 2],
    toWorld: ([x, y]) => [(x - W / 2) / z + cam.cx, (y - H / 2) / z + cam.cy],
  };
  return (layer, space) => {
    for (const o of overlays) if (o.layer === layer) { space(); ctx.save(); o.def.draw(ctx, { ...base, params: o.params, seed: o.seed, name: o.name }); ctx.restore(); }
    for (const c of customs) if ((c.def.layer || 'world') === layer) {
      const u = clamp((t - c.t0) / ((c.t1 - c.t0) || 1e-6));
      space(); ctx.save();
      c.def.draw(ctx, u, { ...base, u, bt: t - c.t0, dur: c.t1 - c.t0, beat: c.beat, params: c.params || c.beat, seed: c.seed ?? 1, name: c.name });
      ctx.restore();
    }
  };
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
// The actors are those of the shot's own scene (so the outgoing scene of a dissolve keeps its cast).
function picture(ctx, plan, shot, t, titles = true) {
  const W = plan.W, H = plan.H, S = shot.set, cam = shot.cameraAt(t), sky = shot.skyAt(t), z = cam.zoom;
  S.build();
  reset(ctx);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  S.drawSky(ctx, cam, sky, t);
  const world = () => ctx.setTransform(z, 0, 0, z, W / 2 - cam.cx * z, H / 2 - cam.cy * z), screen = () => reset(ctx);
  const actors = plan.actorsAt(t, shot.scene).filter(a => a.visible && a.mode !== 'off');
  const layer = layerRunner(ctx, plan, shot, t, cam, actors);
  layer('sky', screen);
  const dofPx = dofRadius(shot, z, H);
  world();
  S.drawBack(ctx, cam, { t, dof: dofPx > 0 ? 2 : 0, haze: sky });
  layer('back', world);
  const drawn = new Map();
  const scene = shot.scene, rect = viewRect(cam, W, H);
  const live = plan.fx.filter(e => e.scene === scene && t >= e.t0 && t < e.t1);
  const sun = sunFor(S, sky);
  const items = S.propsSorted().map(p => ({ key: p.y, ord: 0, draw: () => { world(); propShadow(ctx, S, p.id, sun); world(); p.draw(ctx); } }));
  for (const a of actors) items.push({ key: a.key, ord: 1, actor: a, draw: () => { castShadow(ctx, a, onScreen(a, cam, W, H), sun, cam, W, H); drawActor(ctx, a, t, cam, W, H, drawn, S, shadeAt(S, a, sun)); } });
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
      // at night what lies behind the subjects falls off into the dark (the moon lights the figure, not the soft
      // world behind it), so a close shot of a figure on enlarged ground doesn't turn into a flat mid-tone
      const night = clamp(((shot.gradeAt(t).con ?? 1) - 1) / 0.6) * clamp(dofPx / (6 * H / 1080));
      if (night > 0.01) { x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgba(0,0,0,${(0.38 * night).toFixed(3)})`; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
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
  // overlays and custom beats on the world layer, then the front layers
  layer('world', world);
  world();
  S.drawFront(ctx, cam, { t, dof: dofPx > 0 ? Math.max(2, dofPx / z) : 0 });
  layer('front', world);
  reset(ctx);
  if (screenFx) rain(ctx, t, W, H, { a: clamp(Math.min((t - screenFx.t0) / 1.2, (screenFx.t1 - t) / 1.2)), seed: screenFx.seed });
  const g = shot.gradeAt(t);
  grade(ctx, g, t, W, H, g.story, gradeFocus(shot, actors, drawn, z));
  rimLight(ctx, sceneRecOf(plan, shot)?.rim, actors, t, cam, W, H, drawn);
  layer('grade', screen);
  // lights (fireflies) glow over the grade instead of being darkened by it
  for (const e of live) if (GLOW.has(e.name)) { world(); drawEvent(ctx, field(e), t, { rect, zoom: z, W, H, S }); }
  layer('screen', screen);
  deckle(ctx, g.story?.deckle, W, H);
  reset(ctx);
  if (titles) for (const c of plan.captions) if (c.style === 'title' && c.burn && t >= c.t0 && t < c.t1 && plan.shotAt(c.t0)?.scene === scene) drawTitle(ctx, c, t, W, H, titleY(plan, c), titleX(plan, c));
  const heads = [];
  for (const a of actors) if (drawn.has(a.id)) heads.push({ id: a.id, box: headBox(a, drawn.get(a.id), z), speaking: !!a.speaking });
  return { cam, heads };
}

// What a close or medium shot is about, for the grade: the centre of its subjects' heads in the picture and a radius
// that holds them (k: 1 for close shots, less for a medium). null when no subject is drawn.
function gradeFocus(shot, actors, drawn, z) {
  const k = { close: 1, 'extreme-close': 1, medium: 0.6 }[shot.size];
  if (!k) return null;
  const hb = actors.filter(a => shot.on.includes(a.id) && drawn.has(a.id)).map(a => headBox(a, drawn.get(a.id), z));
  if (!hb.length) return null;
  const x0 = Math.min(...hb.map(b => b[0])), y0 = Math.min(...hb.map(b => b[1])), x1 = Math.max(...hb.map(b => b[2])), y1 = Math.max(...hb.map(b => b[3]));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0.5 * Math.hypot(x1 - x0, y1 - y0) * 1.6, k };
}

// ───────────── title placement ─────────────
// A title beat goes where its "place" says (a TITLE_PLACES name or a fraction of the frame height), else into the
// calmest band of the picture it is laid over: the picture is drawn (without titles) at two moments of the title,
// shrunk, and every height the lettering could sit at is scored by its edges (a standing stone, a tree, a comet's
// tail), its unevenness and its brightness (cream lettering needs a darker ground), with a mild preference for the
// upper middle. A measured title stays inside title-safe (TITLE_SAFE of the frame on every side). Horizontally a title
// is centred over its shot's subjects (the camera's "on": a stone, a figure) as far as title-safe allows, else on the
// frame. Computed once per title, from the same frames in every worker, so it never jumps.
export const TITLE_SAFE = 0.1;
const TITLE_Y = new WeakMap(), TITLE_X = new WeakMap();
export function titleY(plan, c) {
  if (TITLE_Y.has(c)) return TITLE_Y.get(c);
  const H = plan.H, p = c.place;
  const y = typeof p === 'number' ? clamp(p, 0.05, 0.95) * H : TITLE_PLACES[p] !== undefined ? TITLE_PLACES[p] * H : calmTitleY(plan, c);   // null / 'auto': measured
  TITLE_Y.set(c, y);
  return y;
}
// The screen x a title is centred on: its shot's subjects (actors' contact points, anchors) at the title's middle.
export function titleX(plan, c) {
  if (TITLE_X.has(c)) return TITLE_X.get(c);
  const W = plan.W, t = (c.t0 + c.t1) / 2, shot = plan.shotAt(t), half = titleBlock(c, W, plan.H).w / 2;
  let x = W / 2;
  if (shot?.on?.length) {
    const cam = shot.cameraAt(t), S = shot.set, actors = plan.actorsAt(t, shot.scene), xs = [];
    for (const id of shot.on) {
      const a = actors.find(q => q.id === id && q.visible);
      if (a) xs.push(a.x); else if (S.anchorNames?.includes(id)) xs.push(S.anchor(id).x);
    }
    const lo = TITLE_SAFE * W + half, hi = (1 - TITLE_SAFE) * W - half;
    if (xs.length && lo <= hi) x = clamp(((xs.reduce((a, v) => a + v, 0) / xs.length) - cam.cx) * cam.zoom + W / 2, lo, hi);
  }
  TITLE_X.set(c, x);
  return x;
}
export function titleScores(plan, c) {
  const W = plan.W, H = plan.H, w = 192, h = Math.max(2, Math.round((w * H) / W)), L = new Float32Array(w * h);
  const [cv] = scratch(W, H, 'title'), small = scratch(w, h, 'title-small')[1];
  let n = 0;
  for (const u of [0.3, 0.75]) {
    const t = c.t0 + (c.t1 - c.t0) * u, shot = plan.shotAt(t);
    if (!shot) continue;
    const x = cv.getContext('2d'); reset(x); x.clearRect(0, 0, W, H);
    picture(x, plan, shot, t, false);
    small.clearRect(0, 0, w, h); small.drawImage(cv, 0, 0, w, h);
    const d = small.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) L[i] += (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    n++;
  }
  if (!n) return [];
  for (let i = 0; i < L.length; i++) L[i] /= n;
  const B = titleBlock(c, W, H), k = w / W, pad = 0.025 * H, cx = titleX(plan, c);
  const x0 = Math.max(0, Math.floor((cx - B.w / 2 - pad) * k)), x1 = Math.min(w - 1, Math.ceil((cx + B.w / 2 + pad) * k));
  const out = [];
  for (let f = 0.12; f <= 0.861; f += 0.01) {
    const yc = f * H, y0 = Math.max(0, Math.floor((yc - B.above - pad) * k)), y1 = Math.min(h - 2, Math.ceil((yc + B.below + pad) * k));
    if ((yc - B.above) < TITLE_SAFE * H - 1e-6 || (yc + B.below) > (1 - TITLE_SAFE) * H + 1e-6) continue;
    let g = 0, m = 0, m2 = 0, cnt = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const v = L[yy * w + xx]; g += Math.abs(L[yy * w + xx + 1] - v) + Math.abs(L[(yy + 1) * w + xx] - v); m += v; m2 += v * v; cnt++;
    }
    m /= cnt; const sd = Math.sqrt(Math.max(0, m2 / cnt - m * m));
    out.push({ f, y: yc, score: (g / cnt) * 12 + sd * 2 + Math.max(0, m - 0.45) * 1.5 + 0.35 * Math.abs(f - 0.34), edge: g / cnt, sd, lum: m });
  }
  return out;
}
function calmTitleY(plan, c) {
  const S = titleScores(plan, c);
  if (!S.length) return plan.H * 0.38;
  return S.reduce((a, b) => (b.score < a.score ? b : a)).y;
}

// Captions burned in at t, placed away from the heads in the picture (a speaker's counts three times a listener's).
// Several captions at once (a line and a sound caption) stack instead of overlapping.
export function captionLayouts(plan, t, heads) {
  const avoid = heads.map(h => ({ box: h.box, w: h.speaking === false ? 1 / 3 : 1 }));
  const taken = [], gap = plan.H * 0.012;
  return plan.captions.filter(c => c.burn && c.style !== 'title' && t >= c.t0 && t < c.t1)
    .sort((a, b) => (a.style === 'sound') - (b.style === 'sound') || a.t0 - b.t0)
    .map(c => {
      const L = layoutCaption(c, plan.W, plan.H, avoid);
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
 *     visibleBox, head, contact: { x, y, kind ('ground' | 'surface' | 'perch' | 'hollow' | 'air' | 'mount'), screen,
 *     carrier? }, airborne, perch, speaking, mode, key, alpha, action, anchor, squash, sink, waterline, wade,
 *     carrier, tilt }], captionBox, captions, colliders }
 * screenBox / headBox / head already include the turn squash (squash) and the wading sink; visibleBox is the part
 * above the waterline (screen y `waterline`, null when not wading).
 */
export function frameInfo(plan, t) {
  const W = plan.W, H = plan.H, shot = plan.shotAt(t);
  if (!shot) return { t, shot: null, scene: null, set: null, camera: null, actors: [], captionBox: null, captions: [], colliders: [], card: plan.cards.find(c => t >= c.t0 && t < c.t1)?.kind ?? null };
  const cam = shot.cameraAt(t), z = cam.zoom, heads = [];
  const toWorld = b => [(b[0] - W / 2) / z + cam.cx, (b[1] - H / 2) / z + cam.cy, (b[2] - W / 2) / z + cam.cx, (b[3] - H / 2) / z + cam.cy];
  const actors = plan.actorsAt(t, shot.scene).filter(a => a.visible && a.mode !== 'off' && a.alpha > 0.001).map(a => {
    const P = onScreen(a, cam, W, H), r = probe(a.R, P.sx, P.sy + P.sink, P.ss, a.face, { ...a.st, shadow: false });
    // the drawing squashes horizontally around the contact point during a turn
    const q = a.squash ?? 1, X = v => P.sx + (v - P.sx) * q, b0 = r.bounds;
    const box = q === 1 ? b0.slice() : [Math.min(X(b0[0]), X(b0[2])), b0[1], Math.max(X(b0[0]), X(b0[2])), b0[3]], head = [X(r.head[0]), r.head[1]];
    const hb = headBox(a, { head }, z);
    heads.push({ id: a.id, box: hb, speaking: !!a.speaking });
    // wading (or riding a wading carrier): the drawing below the waterline is hidden
    const vis = P.wl == null ? box.slice() : [box[0], Math.min(box[1], P.wl), box[2], Math.min(box[3], P.wl)];
    return {
      id: a.id, rig: a.rig, x: a.x, y: a.y, s: a.s, scale: a.scale, face: a.face, screenBox: box, worldBox: toWorld(box), headBox: hb,
      visibleBox: vis, head, contact: { x: a.x, y: a.y, kind: a.mode === 'air' ? 'air' : a.mode, screen: [P.sx, P.sy], ...(a.carrier ? { carrier: a.carrier } : {}) },
      airborne: a.airborne, perch: a.perch, speaking: a.speaking, mode: a.mode, key: a.key, alpha: a.alpha, action: a.action, anchor: a.anchor,
      squash: q, sink: a.sink || 0, waterline: P.wl, wade: a.wade, carrier: a.carrier, tilt: a.st.tilt ?? 0,
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
