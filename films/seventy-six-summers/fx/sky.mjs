// Sky and light for Seventy-Six Summers (DESIGN §9.1 overlays and custom beats; merged by ../custom.mjs).
//
//   overlay comet        layer 'grade'. params.mode: memory | faint | dim | bloom | full (params.mark, default
//                        'bloom'). The comet is emitted light, so it is drawn after the grade (the night grade would
//                        turn it grey) and hidden by whatever stands in front of the sky (back layers, props, actors,
//                        front layers, clouds, mist) with a coverage mask, like the village lamps. It sits in sky
//                        space (the transform of set.drawSky), so the locked PROMISE compositions put it in the same
//                        place in the prologue and the finale. memory = full, muted by the shot's story grade (its
//                        saturation and sepia are applied to the comet's colours); faint = a low dawn smudge;
//                        dim = a smudge upper left that warms the mist; bloom = dim until plan.marks[mark], then one
//                        eased rise (1.5 s) into full: brighter, longer tails, a broader silver-gold lining on the
//                        clouds, the parted mist glowing gold, the starfield brightening and stars coming out one by one.
//                        Its light lines the clouds' edges facing it at full resolution, hugging each edge that faces the
//                        comet (brightest on it, falling off into the cloud, a faint glow just past it; none on edges
//                        turned away, none on clouds out in the dark beyond its light; fading near the land; cloudLight).
//                        Its key light falls on the land's own paint (added in proportion to it, more to the lit paint),
//                        so the lit land gains contrast and the night's darks stay dark; the standing stone catches it:
//                        its face toward the comet turns gold and brightens, with a gold line along that edge, rising
//                        with the bloom (drawStoneKey). In a shot with depth of field the comet and its
//                        occlusion masks are as soft as the frame (the same blur rule as engine/film/frame.mjs), and a
//                        head half hidden by the out-of-focus land rises into the clear sky just above (cometLift).
//                        During a time-lapse beat in the same scene the memory comet dims and slides to the faint place.
//   overlay hill-mist    layer 'front'. Ground fog: a world-space density field laid over everything already drawn, lying
//                        in level strata (it never climbs the slope): over the crest an opaque bank with a level, soft,
//                        uneven top that hides the stone's body (only its tip stands clear), level strands trailing out
//                        of it down the slope, each to its own torn end, thinning upward and outward, and on the slope
//                        only a shallow skin of ground mist (BANK, STRANDS, SKIN); no hard top anywhere; a
//                        pale stone in it fades as one shape (its ink line is veiled with its fill, not left as a hollow
//                        outline). A figure is veiled by only part of the local
//                        mist (params.through, default 0.5: the ground behind it is further away), so figures walk into
//                        it and step out of it readably. params: from / to (world x where the mist begins / ends, soft;
//                        default 1500 / 2000 = the upper slope, crest clear; 4000 = over the crest, the default when
//                        `part` is given), top (how high it can reach and the scale of its strata, world px), rise (the
//                        run up the slope from `from` over which its skin deepens and its strata end), part (a mark:
//                        on it the field is still the one before it; from it the mist slides outward along the ground
//                        from the standing stone into a widening ring of torn strands that keeps ahead of the 9.5
//                        pull-back and comes to rest on the slope below, clear round the stone; lit by the bloom it
//                        glows gold but stays a thin veil, so the night's land shows through, PART). Close up it thins
//                        into drifting wisps so faces stay readable (not in a close-up that frames no figure: the
//                        stone's tip above the mist). A figure fading in or out where the mist lies does it inside a
//                        drift of mist that gathers before it appears (emergeVeils).
//   overlay stone-light  layer 'grade'. The gold sliver of the last sunlight on the standing stone (prop standing_stone,
//                        anchor stone_top): the stone's own paint lit gold above a shadow line that climbs as
//                        params.dayT goes from its first to its second value across the scene; params.out = a mark:
//                        the light reaches exactly 0 on that mark and never before; its last moments (the last ~14
//                        frames before the mark in s09) are a thin pale-gold thread on the stone's tip (STONE_THREAD),
//                        laid over the inked edge so it reads at any size. Hidden by actors and mist in front. It and the
//                        comet's light on the stone follow the sprite the frame draws at that zoom (a sharper one close).
//   custom timelapse     layer 'grade' (shot 1.6). Days and nights over the land and sky, slow at first, then averaged
//                        into a smooth drifting colour (at most 3 full-frame brightness changes a second): the land is
//                        graded for the time of day its sky shows (dark under the nights, lit under the days); season
//                        tints on the grass about once a second; eight ghosts of Nell in her green scarf at the stone,
//                        timed to the beat's length (the old woman's 8 frames fade out and end GHOST_END.clear s before
//                        it ends: the beat cuts on the empty land, never on a fading ghost).
// Heavy fields (comet body, mist, masks) are painted at half resolution and scaled up (the clouds' lining, a thin line,
// at full resolution over the clouds' box only). Everything is seeded.
import { rng, clamp, lerp, smooth, easeInOut, canvas, blob } from '../../../engine/core/lib.mjs';
import { paper } from '../../../engine/paint/atmos.mjs';
import { getRig } from '../../../engine/cast/index.mjs';
import { grade, mixGrade } from '../../../engine/film/grade.mjs';

const TAU = Math.PI * 2;
const easeOut = u => 1 - (1 - clamp(u)) ** 3;
const TWOS = t => Math.floor(t * 12 + 1e-6) / 12;                 // drawn motion animates on twos

// ───────────── small shared helpers ─────────────
const POOL = new Map();
// A private scratch canvas (cleared, identity transform). Each name is one canvas.
function scratch(name, w, h, clear = true) {
  let e = POOL.get(name);
  if (!e || e.c.width !== w || e.c.height !== h) { const [c, x] = canvas(w, h); e = { c, x }; POOL.set(name, e); }
  const x = e.x;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  if (clear) x.clearRect(0, 0, w, h);
  return [e.c, x];
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbStr = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')},${(+a).toFixed(4)})`;
const mixRGB = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));

// Integer-lattice value noise in 2-D (smooth, deterministic), and a 3-octave sum in 0..1.
export function vnoise(seed) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(seed) {
  const n = [vnoise(seed), vnoise(seed + 1), vnoise(seed + 2)];
  return (x, y) => n[0](x, y) * 0.57 + n[1](x * 2.03 + 17, y * 2.03 + 5) * 0.29 + n[2](x * 4.1 + 3, y * 4.1 + 41) * 0.14;
}

// The story grade's muting (DESIGN grade.mjs STORY: sat, sepia) applied to a colour, for light drawn after the grade.
function toner(story, dim = 1) {
  if (!story) return c => c.map(v => v * dim);
  const sat = story.sat ?? 1, sep = (story.sepia ?? 0) * 0.6, SEP = [176, 136, 92];
  return c => {
    const L = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    let o = c.map(v => lerp(L, v, sat));
    const Ls = 0.3 * SEP[0] + 0.59 * SEP[1] + 0.11 * SEP[2];
    o = o.map((v, i) => lerp(v, SEP[i] * (L / Ls), sep));
    return o.map(v => v * dim);
  };
}

// Sky space: the screen transform set.drawSky uses for its sky canvases (2400 × 1500), so overlays placed in it
// keep their place with the stars and the moon. → { x0, y0, s, w } ; sky (u, v) → screen (x0 + u s, y0 + v s)
export function skyFrame(api) {
  const { W, H, cam, set: S } = api, zoom = cam.zoom ?? 1;
  const s = Math.max(W / 1920, H / 1080) * (1 + clamp(zoom - 1, -0.4, 3) * 0.04), w = 2400 * s, h = 1500 * s;
  const mx = (w - W) / 2, my = (h - H) / 2;
  const ox = clamp((cam.cx - S.refX) * 0.05 * s, -mx, mx), oy = clamp((cam.cy - S.refY) * 0.06 * s, -my, my);
  return { x0: (W - w) / 2 - ox, y0: (H - h) / 2 - oy, s, w, h };
}

const sceneOf = api => api.scene?.id ?? api.shot?.scene;
const actorsOf = api => (api.plan.actorsAt ? api.plan.actorsAt(api.t, sceneOf(api)) : []).filter(a => a.visible && a.mode !== 'off' && a.alpha > 0.02);
// An actor's silhouette in screen space (the context carries any extra scale).
function drawActor(x, a, api) {
  if (api.silhouette) { x.save(); x.globalAlpha = clamp(a.alpha ?? 1); api.silhouette(x, a); x.restore(); return; }  // the frame's own placement (slope pitch on a rider, too)
  const { cam, W, H } = api, z = cam.zoom, sx = (a.x - cam.cx) * z + W / 2, sy = (a.y - cam.cy) * z + H / 2;
  x.save();
  if (a.squash != null && a.squash !== 1) { x.translate(sx, sy); x.scale(a.squash, 1); x.translate(-sx, -sy); }
  x.globalAlpha = clamp(a.alpha ?? 1);
  a.R.draw(x, sx, sy + (a.sink || 0) * z, a.s * z, a.face, { ...a.st, shadow: false });
  x.restore();
}
const worldT = (x, api, k) => { const { cam, W, H } = api, z = cam.zoom; x.setTransform(z * k, 0, 0, z * k, (W / 2 - cam.cx * z) * k, (H / 2 - cam.cy * z) * k); };

// The frame's depth-of-field blur radius (screen px) for this shot and camera: the same rule as engine/film/frame.mjs
// (which blurs everything behind the framed subjects when the painted set is enlarged), so light drawn after it (the
// comet, its masks) is as soft as the sky and the far hills it sits among. 0 when the frame has no blur.
export function dofOf(api) {
  const shot = api.shot, z = api.cam.zoom, kH = api.H / 1080;
  if (!shot || shot.dof === false || shot.dof === 0) return 0;
  const auto = clamp((z - 2.2) * 1.6, 0, 14);
  const r = (typeof shot.dof === 'number' ? Math.max(shot.dof * 1.6, auto) : shot.dof === true ? Math.max(5, auto) : auto) * kH;
  if (!(r > 0.5)) return 0;
  // the frame blurs only when one of the framed subjects is on stage
  const on = shot.on || [];
  return actorsOf(api).some(a => on.includes(a.id)) ? r : 0;
}

// Whether the shot frames a figure that is on stage (its `on` names one; true when there is no plan to ask).
const framesFigure = api => { const on = api.shot?.on || []; return !api.plan?.actorsAt || actorsOf(api).some(a => on.includes(a.id)); };

// The actors' silhouettes (alpha) at resolution k, one per frame; `solid`: only the actors not fading in or out.
const ACTORS = new Map();
function actorMask(api, k = 0.5, solid = false) {
  const all = actorsOf(api), list = solid ? all.filter(a => a.alpha >= 0.98) : all;
  if (solid && list.length === all.length) return actorMask(api, k);
  const key = `${api.shot?.id}|${api.t}|${api.W}x${api.H}`, name = `${k}|${solid}`, hit = ACTORS.get(name);
  if (hit?.key === key) return hit.c;
  let c = null;
  if (list.length) { const [mc, x] = scratch(`actor-mask@${name}`, Math.ceil(api.W * k), Math.ceil(api.H * k)); x.setTransform(k, 0, 0, k, 0, 0); for (const a of list) drawActor(x, a, api); c = mc; }
  ACTORS.set(name, { key, c });
  return c;
}

// What stands in front of the sky at this frame, as alpha, at resolution k: back layers, props, actors, front layers.
// In a shot with depth of field the back layers and props are as soft as the frame draws them (actors and front layers
// stay sharp). One per frame and name (overlays on the same frame share it; another name is another canvas).
const COVER = new Map();
export function coverMask(api, k = 0.5, name = 'cover') {
  const blur = dofOf(api) * k, key = `${api.shot?.id}|${api.t}|${api.W}x${api.H}|${blur}`, id = `${name}@${k}`, hit = COVER.get(id);
  if (hit?.key === key) return hit.c;
  const w = Math.ceil(api.W * k), h = Math.ceil(api.H * k), [c, x] = scratch(id, w, h), S = api.set;
  if (blur > 0.3) {
    // painted with a margin so the blur doesn't thin the mask along the frame's edges
    const pad = Math.ceil(blur * 2.5) + 2, [bc, bx] = scratch(`${id}-back`, w + 2 * pad, h + 2 * pad), [fc, fx] = scratch(`${id}-blur`, w + 2 * pad, h + 2 * pad);
    worldT(bx, api, k); const m = bx.getTransform(); bx.setTransform(m.a, m.b, m.c, m.d, m.e + pad, m.f + pad);
    S.drawBack(bx, api.cam, { t: api.t, dof: 2 });                    // the far layers' own blur, as the frame asks for it
    for (const p of S.propsSorted()) p.draw(bx);
    fx.filter = `blur(${blur.toFixed(2)}px)`; fx.drawImage(bc, 0, 0); fx.filter = 'none';
    x.drawImage(fc, -pad, -pad);
  } else {
    worldT(x, api, k);
    S.drawBack(x, api.cam, { t: api.t });
    for (const p of S.propsSorted()) p.draw(x);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  const am = actorMask(api, k); if (am) x.drawImage(am, 0, 0);
  worldT(x, api, k);
  S.drawFront(x, api.cam, { t: api.t });
  COVER.set(id, { key, c });
  return c;
}
// The set's cloud layer at this frame (as set.drawSky draws it), as alpha at resolution k; as soft as the frame's sky
// in a shot with depth of field.
const CLOUD = new Map();
function cloudMask(api, k = 0.5) {
  const blur = dofOf(api) * k, key = `${api.shot?.id}|${api.t}|${api.W}x${api.H}|${k}|${blur}`, hit = CLOUD.get(k);
  if (hit?.key === key) return hit.c;
  const w = Math.ceil(api.W * k), h = Math.ceil(api.H * k), [c, x] = scratch(`clouds@${k}`, w, h), S = api.set;
  const sky = api.shot.skyAt ? api.shot.skyAt(api.t) : null, list = !sky ? [[S.defaultSky, 1]] : typeof sky === 'string' ? [[sky, 1]] : sky;
  const F = skyFrame(api), drift = ((((api.t * (S.def?.cloudSpeed ?? 5) + (api.cam.cx - S.refX) * 0.07) * F.s) % F.w) + F.w) % F.w;
  x.setTransform(k, 0, 0, k, 0, 0);
  let acc = 0;
  for (const [name, a] of list) {
    if (!(a > 0)) continue; acc += a;
    const cl = S.skyCanvases(name).clouds; x.globalAlpha = a / acc;
    x.drawImage(cl, F.x0 - drift, F.y0, F.w, F.h); x.drawImage(cl, F.x0 - drift + F.w, F.y0, F.w, F.h);
  }
  if (blur > 0.3) {
    const [bc, bx] = scratch(`clouds-blur@${k}`, w, h); bx.filter = `blur(${blur.toFixed(2)}px)`; bx.drawImage(c, 0, 0); bx.filter = 'none';
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.clearRect(0, 0, w, h); x.drawImage(bc, 0, 0);
  }
  CLOUD.set(k, { key, c });
  return c;
}

// ───────────── the mist ─────────────
// top: how high the mist can reach (world px; the field is 0 above top × 1.45), and the scale of its strata; rise: the
// run up the slope from `from` over which its skin deepens and its strata end; through: how much of the local mist stands in front of an actor (the ground behind a
// figure is further away, so more mist lies between it and the camera than between the figure and the camera).
// alpha: the drawn opacity of the mist at full density; core: of its dense body over the crest (it hides the stone).
export const MIST = { from: 1500, to: 2000, top: 250, edge: 260, rise: 900, drift: 7, color: [222, 230, 236], thin: [196, 206, 226], alpha: 0.8, core: 0.985, veil: 0.16, through: 0.5 };
// The parting at the bloom: the opening's radius grows as R (1 − e^−(t/tau)^grow) + creep·t, slow at first so the
// close-up on the stone sees the wisps below its tip begin to move, then fast enough to stay ahead of the 9.5 pull-back,
// coming to rest round the extreme wide (then creeping on). It clears inside `clear` × the radius; the mist that lay there
// is pushed into a ring out to the radius, densest (`pile`) near its front, just inside the widening frame. The mist
// slides outward along the ground (it keeps its height above the ground: it never climbs the stone or stands up as a wall
// down the slope) and flattens as it goes (twice as shallow after `settle` × top of travel); where the ring has passed
// it thins (fade, s after the mark) to `keep` of itself: a lit veil that stays on the slope, and tears into drifting
// strands (`tear` of it, over the first `tearIn` s): lit wisps with the land showing between them, not a filled sheet.
// On the mark the field is the one before it.
export const PART = { R: 1500, tau: 2.6, grow: 2, creep: 14, settle: 2.6, clear: 0.6, pile: 0.3, fade: [0.6, 6], keep: 0.6, tear: 0.85, tearIn: [0.2, 1.4] };
export const partRadius = tp => (tp > 0 ? PART.R * (1 - Math.exp(-((tp / PART.tau) ** PART.grow))) + PART.creep * tp : 0);
// The mist lies in level strata (fog settles in level layers; it does not climb a slope): over the crest a BANK, full from
// the ground to a level top with a soft shoulder (it hides the stone to about 0.7 of its height and clears below its
// tip); level STRANDS, flat-cored lenses broken along their length, lying in it and trailing out of it down the slope,
// each to its own end, thinning as they go; and on the slope only a shallow skin of ground mist. Its top stays level and
// thins outward, so nothing in it runs up the slope as a straight line. Levels are heights above the ground at the stone,
// sizes are × top, ends are where along the slope it runs out (× rise past `from`), thinning over its last `tail` × TORN ×
// rise (the rows of it end at their own places, torn). BANK: [level, shoulder width, strength, end, tail, drift speed, seed];
// STRANDS: [level, half-thickness, strength, end, tail, drift speed, seed] (the highest crosses the stone just under its
// tip; none above the ground skin reaches where Nell stops below the bank); SKIN: [depth where the mist begins and on the
// crest, strength].
export const BANK = [0.74, 0.34, 1, 0.66, 1, 1.6, 21];
export const STRANDS = [
  [0.6, 0.075, 0.36, 0.48, 0.8, 2.2, 5], [0.38, 0.075, 0.38, 0.56, 1.4, 1.7, 11], [0.16, 0.07, 0.36, 0.42, 0.8, 1.2, 9],
  [-0.12, 0.08, 0.36, 0.2, 2, 0.8, 4], [0.84, 0.1, 0.24, 0.64, 1, 2.6, 23], [0.93, 0.1, 0.16, 0.9, 1, 2.4, 17],
];
export const SKIN = [0.12, 0.24, 0.75];
const TORN = 0.14;
// The mist once the bloomed comet lights it: its colour (before the grade) and how much of it takes that colour, how
// much of the mist's veil is left (lit mist glows rather than hides: the land shows through), the gain of the gold
// glow screened onto it, how far its light turns it toward gold (a hue shift at its own value: a tint; more turns the thin
// mist lying on the dark slope into an orange-tan streak), and how much less of it veils a figure (× through; all at the
// full bloom).
export const MIST_LIT = { col: [255, 234, 196], tint: 0.6, veil: 0.45, glow: 0.42, warm: 0.4, through: 0.6 };
// The mist's parameters for a scene: its hill-mist overlay params with the defaults, the parting time, and the drifts
// round any figure fading in or out in it (emergeVeils).
export function mistParams(api, params) {
  // mist that parts from the stone must reach it: with `part` and no `to`, the bank lies over the crest
  const p = { ...MIST, ...(params?.part != null && params.to == null ? { to: 4000 } : {}), ...(params || {}) };
  p.partT = typeof p.part === 'string' ? api.marks?.[p.part] ?? null : Number.isFinite(p.part) ? api.scene.t0 + p.part : null;
  p.veils = emergeVeils(api, p);
  return p;
}
// A figure that fades in or out where the mist lies does it inside a drift of mist (a fade in open air reads as a
// see-through ghost): the mist gathers round it `ahead` s before it appears and thins as it becomes solid, as
// (1 - alpha)^pow, so the audience sees it step out of the mist. → [{ x, feet, h, w, k }] (world; k 0..1)
export const EMERGE = { ahead: 0.9, pow: 0.5, width: 0.42 };
export function emergeVeils(api, p) {
  const at = api.plan?.actorsAt, sc = sceneOf(api), out = [];
  if (!at || !api.actor) return out;
  let soon = null;
  for (const a of at(api.t, sc)) {
    if (!a.visible || a.mode === 'off' || !(a.alpha < 0.98)) continue;
    soon ??= at(api.t + EMERGE.ahead, sc);
    const al = clamp(a.alpha), next = clamp(soon.find(q => q.id === a.id)?.alpha ?? 0);
    const where = smooth(p.from - p.edge * 2, p.from, a.x) * (1 - smooth(p.to, p.to + p.edge, a.x));
    const k = (1 - al) ** EMERGE.pow * smooth(0.02, 0.5, Math.max(al, next)) * where, g = api.actor(a.id)?.box;
    if (k < 0.01 || !g) continue;
    const h = g[3] - g[1];
    out.push({ x: (g[0] + g[2]) / 2, feet: g[3], h, w: Math.max((g[2] - g[0]) / 2, EMERGE.width * h), k });
  }
  return out;
}
const mistOverlay = api => (api.plan.overlays || []).find(o => o.scene === sceneOf(api) && o.name === 'hill-mist');
// The stone the mist parts from (world): the standing stone's middle, or the set's centre.
function stoneCentre(S) {
  const p = S.props?.find(q => q.id === 'standing_stone');
  if (p?.bounds) return [(p.bounds[0] + p.bounds[2]) / 2, (p.bounds[1] + p.bounds[3]) / 2];
  return [S.refX, S.refY];
}
// Soft steps: three washes (like the cel-shaded clouds). 0 where there is no mist, whatever the softness.
const step = (v, th, e = 0.06) => smooth(th - e, th + e, v);
export const washes = (v, e = 0.06) => v <= 0 ? 0 : (0.42 * step(v, 0.1, e) + 0.32 * step(v, 0.4, e) + 0.26 * step(v, 0.7, e)) * smooth(0, 0.1, v);
// The mist's opacity for a density: the density itself (its bands are already shaped like washes) with a little of the
// stepped washes laid over it for a painted layering, but no step at its thin end (that would draw it a hard top).
export const glaze = (v, e = 0.06) => v <= 0 ? 0 : clamp(0.8 * v + 0.2 * washes(v, Math.max(e, 0.1)));
// Close up, the washes soften (the mist is near the lens and out of focus) and less of it stands between the camera and
// what it looks at: its opacity falls with the zoom. That is for faces: a close-up that frames no figure (the stone's
// tip above the mist) keeps most of it (`faces` false).
export const mistLens = (z, faces = true) => {
  const a = clamp(1.15 - 0.08 * z, 0.32, 1), wisp = clamp((z - 1.8) / 4, 0, 0.6);
  return { e: clamp(0.06 * Math.max(1, z / 1.4) ** 0.8, 0.06, 0.2), a: faces ? a : Math.max(a, 0.85), wisp: faces ? wisp : Math.min(wisp, 0.3) };
};
/**
 * Mist density (0..1, before the washes) at world (x, y) and film time t: ground fog lying on the slope from p.from to
 * p.to, in level strata (BANK, STRANDS, SKIN): a shallow skin on the ground everywhere; over the crest an opaque bank
 * up to a level, soft, uneven top that hides the stone up to its tip; level strands lying in it and trailing out of it
 * down the slope, each to its own torn end. No hard top anywhere: every edge thins smoothly; thinner on the near face
 * of the slope; plus a faint veil on the ground further down. After p.partT the field is
 * pushed out from the stone along the ground (a widening ring, partRadius, see PART), flattens and thins. → { bank, veil }
 */
const NONE = Object.freeze({ bank: 0, veil: 0 });
export function mistDensity(S, p, t, seed = 7) {
  const n = fbm(seed), m = fbm(seed + 11), b = fbm(seed + 29), tw = fbm(seed + 41), O = stoneCentre(S), g = x => S.groundAt(x) ?? S.laneY ?? 1000, Yc = g(O[0]);
  const tp = p.partT != null ? t - p.partT : -1, R = partRadius(tp);
  // the pushed mist thins as it spreads, down to a faint remnant at the edges
  const thin = tp > 0 ? 1 - (1 - PART.keep) * smooth(PART.fade[0], PART.fade[1], tp) : 1, drift = t * p.drift;
  const rise = p.rise ?? MIST.rise, tau = TORN * rise;
  const lay = ([c, h, a, e, len, sp, sd]) => [c * p.top, h * p.top, a, p.from + e * rise, len, sp, sd], bankL = lay(BANK), strands = STRANDS.map(lay);
  // how much of a level layer reaches x: it thins over its last stretch, each row of it ending at its own place
  const reach = (x, y, end, len, sd, xs) => smooth(end - tau * len, end + tau, x + (b(y / 90 + sd, xs / 800) - 0.5) * 1.2 * tau);
  const field = (wx, wy) => {
    let x = wx, y = wy, k = 1;
    if (R > 0) {
      const dx = wx - O[0], dy = (wy - O[1]) * 1.6, d = Math.hypot(dx, dy) || 1e-6, c = PART.clear;
      // the ring from c·R to R holds the mist that lay between the stone and R, pushed outward (the mist at src now shows
      // at d): it slides along the ground, keeping its height above it, and flattens the further it travelled; inside
      // c·R it is gone, beyond R the bank is still whole (on the mark R = 0: the field is the one before it)
      const src = d >= R ? d : Math.max(0, (d - c * R) / (1 - c)), mv = d - src, hh = g(wx) - wy;
      x = wx - (dx / d) * mv; y = g(x) - hh * (1 + mv / (p.top * PART.settle));
      k *= smooth(c * R, c * R + 0.12 * R, d) * (1 + PART.pile * Math.exp(-(((d - R * 0.88) / (R * 0.1)) ** 2)));
      // where the ring has passed, the mist is torn into strands carried outward with it (the pattern is in the pushed
      // field's own coordinates) and thins
      const hit = smooth(R * 1.05, R * 0.8, d), tear = PART.tear * smooth(PART.tearIn[0], PART.tearIn[1], tp) * hit;
      k *= lerp(1, thin, hit);
      if (tear > 0) k *= 1 - tear * (1 - smooth(0.36, 0.62, tw(x / 430 + drift / 260, y / 44)));
    }
    if (k <= 0.001) return NONE;
    const gy = g(x), hag = gy - y;
    if (hag > p.top * 1.45) return NONE;                               // well above any mist
    const face = hag >= -20 ? 1 : Math.exp((hag + 20) / 45);          // the slope's near face: thinner toward us
    const along = smooth(p.from - p.edge, p.from + p.edge, x) * (1 - smooth(p.to - p.edge * 0.6, p.to + p.edge * 0.6, x));
    const h = Math.max(0, hag), fade = 1 - smooth(p.top * 0.9, p.top * 1.45, h);
    let bank = 0;
    if (along > 0.001) {
      const lv = Yc - y, thick = smooth(p.from - p.edge, p.from + rise, x);
      // the skin of ground mist: full on the ground, a soft shoulder a little deeper up the slope, streaked
      const sk = p.top * lerp(SKIN[0], SKIN[1], thick), us = h / sk;
      let clear = us > 2.6 ? 1 : 1 - SKIN[2] * Math.exp(-(us ** 2.2)) * (1 - 0.35 * smooth(0.3, 1, us) * (1 - smooth(0.3, 0.7, n((x + drift) / 480, h / (sk * 0.9) + 1.3))));
      // the bank: full from the ground to its level top (which undulates gently), then a soft shoulder (no edge), streaked
      // into drifting horizontal strata under it; down the slope it thins away level, in torn rows
      {
        const [c, w, a, end, len, sp, sd] = bankL, xs = x + drift * sp, u = (lv - c - p.top * lerp(0.024, 0.07, smooth(100, 500, Math.abs(x - O[0]))) * (2 * m(xs / 420 + sd, sd) - 1)) / w;
        // (its strata: the dense ones reach further down the slope than the thin ones between them)
        const st = u >= 1 ? 0 : smooth(0.3, 0.7, n(xs / 560, lv / (p.top * 0.3) + sd)), r = u >= 1 ? 0 : reach(x, y, end + (st - 0.5) * 0.5 * tau, len, sd, xs);
        if (r > 0) clear *= 1 - a * r * (1 - smooth(0, 1, u)) * (1 - 0.34 * smooth(-0.4, 0.1, u) * (1 - st));
      }
      // the strands: flat-cored level lenses with soft edges, broken along their length, each drifting at its own speed
      for (const [c, hh, a, end, len, sp, sd] of strands) {
        const xs = x + drift * sp, u = (lv - c - p.top * 0.03 * (2 * m(xs / 520 + sd, sd) - 1)) / (hh * (0.9 + 0.3 * b(x / 380 + sd, sd * 2)));
        if (Math.abs(u) > 2.6) continue;
        clear *= 1 - a * reach(x, y, end, len, sd, xs) * Math.exp(-(Math.abs(u) ** 2.4)) * lerp(0.3, 1, smooth(0.3, 0.6, b(xs / 340 + sd * 3, sd)));
      }
      bank = clamp((1 - clear) * along * face * k * fade);
    }
    const low = smooth(p.from - p.edge * 4, p.from, x) * (1 - smooth(p.to - p.edge * 0.6, p.to + p.edge * 0.6, x));
    const veil = low > 0.001 ? p.veil * low * face * k * Math.exp(-h / (p.top * 0.16)) * (0.6 + 0.8 * m(x / 500 + 9, y / 200)) : 0;
    return { bank, veil };
  };
  if (!p.veils?.length) return field;
  // the drifts round figures fading in or out (emergeVeils): a drift, not a pillar: wide and ragged on the ground,
  // narrowing to a torn, domed top a little above the head, made of level strands that reach out sideways and never
  // open enough to show the figure through them
  const veil = (wx, wy) => {
    let q = 0;
    for (const v of p.veils) {
      const u = (v.feet - wy) / v.h; if (u < -0.3 || u > 1.6) continue;
      const row = b(wy / 32 + 3, drift / 70 + 5), width = v.w * (1.9 - 0.9 * clamp(u, 0, 1)) * (0.7 + 0.8 * row);
      const dx = (wx - v.x) / width; if (Math.abs(dx) > 3) continue;
      const top = 1 - smooth(0.75, 1.3, u + 0.3 * dx * dx + 0.25 * (m(wx / 80, 5 + drift / 120) - 0.5));
      const strands = lerp(0.8, 1, smooth(0.35, 0.65, n((wx + drift * 3) / 150, wy / 24 + 11)));
      q = 1 - (1 - q) * (1 - v.k * Math.exp(-dx * dx * 1.2) * smooth(-0.3, 0.05, u) * top * strands * lerp(1, 0.85, clamp(u)));
    }
    return q;
  };
  return (wx, wy) => { const d = field(wx, wy), q = veil(wx, wy); return q > 0.001 ? { bank: 1 - (1 - d.bank) * (1 - q), veil: d.veil } : d; };
}
// The mist over the frame (screen space) at 1/cell resolution: `grid` = drawn opacity / alpha (0..1, after the
// washes), and an RGBA canvas of it. One per frame and parameter set.
const FOG = { key: null };
export function fogField(api, params, seed = 7, cell = 6) {
  const key = `${api.shot?.id}|${api.t}|${api.W}x${api.H}|${cell}|${seed}|${JSON.stringify(params || {})}`;
  if (FOG.key === key) return FOG.v;
  const p = mistParams(api, params), D = mistDensity(api.set, p, api.t, seed % 9973);
  const gw = Math.ceil(api.W / cell) + 1, gh = Math.ceil(api.H / cell) + 1, grid = new Float32Array(gw * gh);
  const [c, x] = scratch('fog', gw, gh), img = x.createImageData(gw, gh), C = p.color, T = p.thin;
  const { cam, W, H } = api, z = cam.zoom, lens = mistLens(z, framesFigure(api)), wn = fbm(seed + 23), dr = api.t * p.drift * 2.2;
  let any = 0;
  for (let j = 0; j < gh; j++) {
    const wy = (j * cell - H / 2) / z + cam.cy;
    for (let i = 0; i < gw; i++) {
      const wx = (i * cell - W / 2) / z + cam.cx, d = D(wx, wy), wb = glaze(d.bank, lens.e), o = (j * gw + i) * 4;
      // close up, the mist reads as drifting horizontal wisps with clear gaps rather than a milky sheet
      let v = clamp(wb + d.veil * (1 - wb)) * lens.a;
      if (lens.wisp > 0 && v > 0) v *= 1 - lens.wisp * (1 - smooth(0.3, 0.68, wn((wx + dr) / 95, wy / 16)));
      grid[j * gw + i] = v; any = Math.max(any, v);
      // (the dense body over the crest is near opaque: it hides what stands in it, the stone below its tip)
      img.data[o] = lerp(T[0], C[0], wb); img.data[o + 1] = lerp(T[1], C[1], wb); img.data[o + 2] = lerp(T[2], C[2], wb); img.data[o + 3] = Math.round(255 * v * lerp(p.alpha, p.core ?? p.alpha, smooth(0.6, 0.95, wb)));
    }
  }
  x.putImageData(img, 0, 0);
  FOG.key = key; FOG.v = { grid, gw, gh, cell, c, any, p, D };
  return FOG.v;
}
// Draw a fog-sized canvas (gw × gh cells) stretched over the frame.
const stretch = (ctx, F, W, H, c = F.c) => { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.drawImage(c, 0, 0, F.gw, F.gh, 0, 0, F.gw * F.cell, F.gh * F.cell); };

function drawMist(ctx, api) {
  const F = fogField(api, api.params, api.seed ?? 7);
  if (F.any < 0.004) return;
  const { W, H } = api, k = 0.5, [mc, mx] = scratch('mist', Math.ceil(W * k), Math.ceil(H * k));
  mx.setTransform(k, 0, 0, k, 0, 0); stretch(mx, F, W, H); mx.setTransform(1, 0, 0, 1, 0, 0);
  // once the comet blooms its light, not the moon's, is in the mist: a warm cream (the night grade would turn the
  // moonlit silver into lilac, which no light screened on afterwards can make gold)
  const co = (api.plan.overlays || []).find(o => o.scene === sceneOf(api) && o.name === 'comet'), rise = co ? cometState({ ...api, params: co.params }).rise : 0;
  // a figure stands in front of most of the mist behind it: only part of the local mist veils it, so it stays readable
  // (less still of the lit mist, which glows round it); a figure fading in or out stays inside its drift
  const am = actorMask(api, k, true), through = (F.p.through ?? MIST.through) * lerp(1, MIST_LIT.through, rise);
  if (am && through < 1) { mx.globalCompositeOperation = 'destination-out'; mx.globalAlpha = 1 - through; mx.drawImage(am, 0, 0); mx.globalAlpha = 1; mx.globalCompositeOperation = 'source-over'; }
  if (rise > 0.01) { mx.globalCompositeOperation = 'source-atop'; mx.globalAlpha = MIST_LIT.tint * rise; mx.fillStyle = rgbStr(MIST_LIT.col); mx.fillRect(0, 0, mc.width, mc.height); mx.globalAlpha = 1; mx.globalCompositeOperation = 'source-over'; }
  paper(mx, 0.16);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'low';
  ctx.globalAlpha = lerp(1, MIST_LIT.veil, rise);
  // a pale stone in the mist has a fill much like the veiled mist round it, so its ink line alone would read (a hollow
  // outline): over the stones the mist first lifts the darks toward itself ('lighten': the line, not the pale fill), so
  // the stone fades into it as one shape
  const stones = api.set.propsSorted().filter(q => STONES.test(q.id));
  if (stones.length) {
    const [pc, px] = scratch('mist-stones', mc.width, mc.height);
    worldT(px, api, k); for (const q of stones) q.draw(px); px.setTransform(1, 0, 0, 1, 0, 0);
    const all = actorMask(api, k); if (all) { px.globalCompositeOperation = 'destination-out'; px.drawImage(all, 0, 0); }
    px.globalCompositeOperation = 'source-in'; px.drawImage(mc, 0, 0);
    ctx.globalCompositeOperation = 'lighten'; ctx.drawImage(pc, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(mc, 0, 0, W, H);
  ctx.restore();
}
export const STONES = /rock|stone/;                                // the props the mist veils as stones (by id)

// ───────────── the comet ─────────────
// Sky-space placement (sky canvas units, 2400 × 1500): the head upper left, the tails sweeping right over the stone.
export const COMET = {
  head: [640, 470], faint: [500, 540], ang: -0.17,
  ion: { len: 1500, col: '#9FC8FF' }, dust: { len: 1260, col: '#FFD38A', curve: [0.00004, 0.00036] },
  coma: '#FFF3D6', nucleus: '#FFFBEA',
};
const MODES = {
  full: { B: 1, L: 1, glow: 0.7, stars: 0.55, key: 1 }, memory: { B: 0.92, L: 1, glow: 0.9, stars: 0, key: 0.8 },
  dim: { B: 0.34, L: 0.3, glow: 0.42, stars: 0, key: 0.12 }, faint: { B: 0.42, L: 0.24, glow: 0.2, stars: 0, key: 0 },
};
export const BLOOM_RISE = 1.5;
// the share of the ion tail's length, from the head, that lies over the dust tail and is painted warm (paintComet)
export const ION_WARM = 0.24;
// The comet's key light at full, on the land toward it: + v (a + b v) × gain for a paint value v (0..1): the lit paint
// gains more than the dark (the night keeps its darks), about +50% on the lit land.
const KEY = { gain: 0.62, a: 0.5, b: 1.2 };
/**
 * The comet's state at this frame: brightness B (0..1), tail length L (0..1), mist/cloud glow, sky position (sky units),
 * and `rise` (0..1 progress of the bloom). Pure (no drawing): the brightness curve is tested.
 */
export function cometState(api) {
  const p = api.params || {}, mode = p.mode || 'full';
  let st = { ...(MODES[mode] || MODES.full), pos: mode === 'faint' ? COMET.faint : COMET.head, rise: 0 };
  if (mode === 'bloom') {
    const tm = api.marks?.[p.mark || 'bloom'], u = tm == null ? 0 : easeInOut((api.t - tm) / BLOOM_RISE), D = MODES.dim, F = MODES.full;
    st = { B: lerp(D.B, F.B, u), L: lerp(D.L, F.L, easeOut(tm == null ? 0 : (api.t - tm) / (BLOOM_RISE * 1.3))), glow: lerp(D.glow, F.glow, u), pos: COMET.head, rise: u, stars: u * F.stars, key: lerp(D.key, F.key, u) };
  }
  // a time-lapse in this scene carries the memory comet away: it dims and slides to where the dawn smudge hangs
  const tl = (api.plan.custom || []).find(c => c.name === 'timelapse' && c.scene === sceneOf(api) && api.t >= c.t0);
  if (tl && mode !== 'faint') {
    const u = easeInOut((api.t - tl.t0) / Math.min(1.8, (tl.t1 - tl.t0) * 0.45)), f = MODES.faint;
    st = { ...st, B: lerp(st.B, f.B, u), L: lerp(st.L, f.L, u), glow: lerp(st.glow, f.glow, u), key: lerp(st.key, f.key, u), pos: mixRGB(st.pos, COMET.faint, u) };
  }
  return st;
}

// The comet in sky space, painted into a half-resolution context (k = its scale): the gold dust tail is a curved
// scimitar of gouache ribbons, dabs and striations, brightest along its leading edge; the pale-blue ion tail is a few
// straight streamers with knots drifting outward; then the coma and the particles. Paint layers with source-over so
// the colours stay gold and blue instead of burning to white; only the coma adds light.
function paintComet(x, P, k, tone) {
  const { hx, hy, s, L, B, t, seed } = P, r = rng(seed), tq = TWOS(t);
  const ION = tone(hex(COMET.ion.col)), DUST = tone(hex(COMET.dust.col)), COMA = tone(hex(COMET.coma)), NUC = tone(hex(COMET.nucleus));
  const DEEP = tone([238, 168, 84]), CREAM = tone([255, 236, 196]);
  const [c0, c1] = COMET.dust.curve, Ld = COMET.dust.len * L, Li = COMET.ion.len * L;
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.translate(hx * k, hy * k); x.rotate(COMET.ang); x.scale(s * k, s * k);
  const curvePt = (c, px) => [px, c * px * px];
  const ribbon = (c, len, w0, w1, col, a, N = 22) => {
    const g = x.createLinearGradient(0, 0, len, c * len * len);
    // bright where it leaves the coma, dissolving along its length (a lamp's beam would stay even)
    g.addColorStop(0, rgbStr(col, 0)); g.addColorStop(0.05, rgbStr(col, a)); g.addColorStop(0.2, rgbStr(col, a * 0.78)); g.addColorStop(0.45, rgbStr(col, a * 0.38)); g.addColorStop(0.75, rgbStr(col, a * 0.1)); g.addColorStop(1, rgbStr(col, 0));
    x.fillStyle = g; x.beginPath();
    const bot = [];
    for (let q = 0; q <= N; q++) {
      const u = q / N, px = u * len, py = c * px * px, sl = 2 * c * px, nl = Math.hypot(1, sl), w = lerp(w0, w1, u ** 0.85) / 2 * (1 + 0.14 * Math.sin(u * 9 + c * 4e4));
      const ax = px - (sl / nl) * w, ay = py + w / nl; if (q) x.lineTo(ax, ay); else x.moveTo(ax, ay);
      bot.push([px + (sl / nl) * w, py - w / nl]);
    }
    for (let q = N; q >= 0; q--) x.lineTo(bot[q][0], bot[q][1]);
    x.closePath(); x.fill();
  };
  // dust tail: broad wash ribbons across the fan (dimmer toward the trailing, more curved edge)
  for (let i = 0; i < 14; i++) {
    const f = (i + 0.5) / 14, c = lerp(c0, c1, f), len = Ld * lerp(1, 0.72, f) * (0.92 + r() * 0.16);
    ribbon(c, len, 22, 70 + 120 * f, mixRGB(DUST, DEEP, f * 0.7), 0.3 * (1 - f) ** 0.9 + 0.06);
  }
  // gouache dabs along the fan: elongated with the flow, a few lighter cream ones near the leading edge
  for (let i = 0; i < 380; i++) {
    const f = r() ** 1.6, u = r() ** 1.35, c = lerp(c0, c1, f), px = u * Ld * lerp(1, 0.75, f), [qx, qy] = curvePt(c, px);
    const ang = Math.atan(2 * c * px), rx = 14 + 70 * u * (0.5 + r()), ry = 2.5 + 10 * u * r();
    const a = 0.2 * (1 - u) ** 1.1 * (1 - f) ** 0.8 * (0.4 + r() * 0.8);
    if (a < 0.006) continue;
    x.fillStyle = rgbStr(f < 0.2 && r() < 0.5 ? CREAM : mixRGB(DUST, DEEP, r() * 0.6), a);
    blob(x, qx, qy + (r() - 0.5) * 18 * u, rx, ry, ang, r, 8);
  }
  // striations: thin brighter streaks along a few synchrones of the fan
  x.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const f = 0.04 + 0.7 * r() ** 1.3, c = lerp(c0, c1, f), len = Ld * (0.45 + r() * 0.45) * lerp(1, 0.75, f);
    const g = x.createLinearGradient(0, 0, len, c * len * len);
    g.addColorStop(0, rgbStr(CREAM, 0)); g.addColorStop(0.1, rgbStr(CREAM, 0.14 * (1 - f))); g.addColorStop(1, rgbStr(DUST, 0));
    x.strokeStyle = g; x.lineWidth = 2 + r() * 3; x.beginPath();
    for (let q = 0; q <= 20; q++) { const [qx, qy] = curvePt(c, (q / 20) * len); if (q) x.lineTo(qx, qy); else x.moveTo(qx, qy); }
    x.stroke();
  }
  // ion tail: straight streamers fanning a little above the dust tail, with knots drifting out. Near the head, where
  // they lie over the dust tail, they are the coma's cream and thinner (blue over the thinning gold would mix into
  // parallel pink and blue-white bands); they turn blue as they leave it (ION_WARM: the share of the length that is warm)
  for (let i = 0; i < 6; i++) {
    const d = -0.06 + (r() - 0.5) * 0.035, len = Li * (0.7 + r() * 0.3), w = i ? 12 + r() * 26 : 6, a = i ? 0.08 + r() * 0.1 : 0.22;
    x.save(); x.rotate(d);
    const g = x.createLinearGradient(0, 0, len, 0), wu = ION_WARM * Li / len;
    g.addColorStop(0, rgbStr(CREAM, a * 0.5)); g.addColorStop(wu * 0.6, rgbStr(mixRGB(CREAM, ION, 0.25), a * 0.45)); g.addColorStop(wu, rgbStr(mixRGB(CREAM, ION, 0.7), a * 0.6));
    g.addColorStop(Math.max(wu + 0.05, 0.4), rgbStr(ION, a * 0.7)); g.addColorStop(0.7, rgbStr(ION, a * 0.3)); g.addColorStop(1, rgbStr(ION, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(0, -1.2); x.quadraticCurveTo(len * 0.5, -w * 0.32, len, -w / 2); x.lineTo(len, w / 2); x.quadraticCurveTo(len * 0.5, w * 0.32, 0, 1.2); x.closePath(); x.fill();
    x.restore();
  }
  for (let i = 0; i < 6; i++) {
    const r2 = rng(seed * 7 + i), f = (r2() + tq * (0.02 + r2() * 0.015)) % 1, px = f * Li, a = 0.2 * (1 - f) ** 1.3 * smooth(0, 0.06, f);
    x.save(); x.rotate(-0.06); x.translate(px, 0); x.scale(1, 0.18);
    const R = 40 + f * 90, g = x.createRadialGradient(0, 0, 0, 0, 0, R), kc = mixRGB(CREAM, ION, smooth(0.6 * ION_WARM, ION_WARM, f));
    g.addColorStop(0, rgbStr(kc, a)); g.addColorStop(1, rgbStr(kc, 0));
    x.fillStyle = g; x.fillRect(-R, -R, 2 * R, 2 * R); x.restore();
  }
  // coma (adds light) and the nucleus
  x.globalCompositeOperation = 'lighter';
  let g = x.createRadialGradient(8, 0, 0, 8, 0, 200);
  g.addColorStop(0, rgbStr(COMA, 0.3)); g.addColorStop(0.25, rgbStr(COMA, 0.1)); g.addColorStop(1, rgbStr(COMA, 0));
  x.fillStyle = g; x.fillRect(-200, -200, 400, 400);
  x.save(); x.scale(1.3, 1);
  g = x.createRadialGradient(3, 0, 0, 3, 0, 46);
  g.addColorStop(0, rgbStr(NUC, 1)); g.addColorStop(0.18, rgbStr(COMA, 0.8)); g.addColorStop(0.55, rgbStr(COMA, 0.22)); g.addColorStop(1, rgbStr(COMA, 0));
  x.fillStyle = g; x.fillRect(-50, -50, 100, 100); x.restore();
  // particles drifting outward along both tails, twinkling slowly
  const n = Math.round(220 * L);
  for (let i = 0; i < n; i++) {
    const r3 = rng(seed * 131 + i), ion = r3() < 0.12, f = (r3() + tq * (0.008 + r3() * 0.018)) % 1;
    const px = f * (ion ? Li : Ld), c = ion ? 0 : lerp(c0, c1, r3() ** 1.4), py = ion ? -0.06 * px + (r3() - 0.5) * (6 + px * 0.02) : c * px * px + (r3() - 0.5) * (8 + px * 0.1);
    const tw = 0.6 + 0.4 * Math.sin(tq * (0.7 + r3() * 1.4) + r3() * TAU), a = 0.8 * (1 - f) ** 1.5 * tw * (0.3 + r3() * 0.7) * smooth(0, 0.04, f);
    if (a < 0.03) continue;
    x.fillStyle = rgbStr(ion ? ION : r3() < 0.35 ? NUC : DUST, Math.min(1, a));
    const rad = (0.55 + r3() * r3() * 1.1) / (s * k);
    x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fill();
  }
  x.restore();
}
// The comet's screen bounding box (generous), for compositing only where it is.
function cometBox(P, W, H) {
  const ca = Math.cos(COMET.ang), sa = Math.sin(COMET.ang), pts = [[-260, -260], [-260, 260], [COMET.ion.len * P.L, -120], [COMET.dust.len * P.L, COMET.dust.curve[1] * (COMET.dust.len * P.L) ** 2 + 260], [COMET.ion.len * P.L, 260]];
  const X = pts.map(([u, v]) => P.hx + (u * ca - v * sa) * P.s), Y = pts.map(([u, v]) => P.hy + (u * sa + v * ca) * P.s);
  const b = [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)].map(Math.round);
  return [clamp(b[0], 0, W), clamp(b[1], 0, H), clamp(b[2], 0, W), clamp(b[3], 0, H)];
}

// A head half hidden by the out-of-focus land in a shot with depth of field reads as a smudge round a dark core (the
// blurred bush in front of it): when the land covers the head's centre (more than LIFT.hid) with open sky beside it
// (somewhere in a disc of LIFT.r px less than LIFT.open covered), the comet rises into the clear sky just above, by the
// least lift that clears the disc (at most LIFT.clear covered) within LIFT.max × H, worked out once per shot from the land
// at the shot's middle so it holds still. Wide shots, heads in clear sky and heads deep behind the land (no sky near
// them) keep the locked sky position. → screen px to move the comet up.
export const LIFT = { r: 40, hid: 0.35, clear: 0.12, open: 0.3, max: 0.3 };
const LIFTS = new WeakMap();
export function cometLift(api) {
  const shot = api.shot, key = `${api.W}x${api.H}`, seen = LIFTS.get(shot) ?? new Map();
  LIFTS.set(shot, seen);
  if (seen.has(key)) return seen.get(key);
  let lift = 0;
  const t = (shot.t0 + shot.t1) / 2, at = { ...api, t, cam: shot.cameraAt?.(t) ?? api.cam };
  if (shot.cameraAt && dofOf(at) > 0) {
    const F = skyFrame(at), pos = cometState(at).pos, k = 0.25, m = coverMask(at, k, 'lift'), d = m.getContext('2d').getImageData(0, 0, m.width, m.height).data;
    const R = Math.max(2, Math.round(LIFT.r * (api.H / 1080) * k)), X = Math.round((F.x0 + pos[0] * F.s) * k), Y = Math.round((F.y0 + pos[1] * F.s) * k);
    // the land's coverage in the disc round (X, y): its least and its most (outside the frame counts as covered)
    const disc = y => { let lo = 255, hi = 0; for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { if (i * i + j * j > R * R) continue; const x = X + i, yy = y + j, a = x < 0 || yy < 0 || x >= m.width || yy >= m.height ? 255 : d[(yy * m.width + x) * 4 + 3]; if (a < lo) lo = a; if (a > hi) hi = a; } return [lo, hi]; };
    const [lo] = disc(Y), at0 = X >= 0 && Y >= 0 && X < m.width && Y < m.height ? d[(Y * m.width + X) * 4 + 3] : 255;
    if (at0 > 255 * LIFT.hid && lo < 255 * LIFT.open) for (let y = Y - 1; y >= Y - LIFT.max * api.H * k; y--) if (disc(y)[1] <= 255 * LIFT.clear) { lift = (Y - y) / k; break; }
  }
  seen.set(key, lift);
  return lift;
}

// Extra stars that come out when the comet blooms (sky space, deterministic; drawn into the half-res comet layer).
let STARS = null;
function starfield() {
  if (STARS) return STARS;
  const [c, x] = canvas(1200, 750), r = rng(9071);
  for (let i = 0; i < 1100; i++) {
    const px = r() * 1200, py = r() ** 1.25 * 600, big = r() < 0.06, a = (0.25 + r() * 0.75) * (1 - py / 640) ** 0.6;
    x.fillStyle = `rgba(${r() < 0.2 ? '255,236,200' : r() < 0.3 ? '210,226,255' : '255,252,240'},${a.toFixed(3)})`;
    x.beginPath(); x.arc(px, py, big ? 1.3 : 0.45 + r() * 0.45, 0, TAU); x.fill();
  }
  return (STARS = c);
}

// Stars switching on one by one across the scene (brightest first), each fading in over 0.4 s: sky space, into the
// half-res comet layer (which is composited at brightness B, hence the 1 / B).
export const STARS_ON = { n: 240, from: 0.05, to: 0.85, fade: 0.4 };
export function starOnTime(i, scene) { const r = rng(7001 + i), u = (i + r()) / STARS_ON.n; return scene.t0 + (scene.t1 - scene.t0) * lerp(STARS_ON.from, STARS_ON.to, u); }
// At the bloom the same stars come out over its rise instead, brightest first, from just after the mark.
export const BLOOM_STARS = { after: 0.2, span: 2.6 };
export function bloomStarTime(i, tm) { const r = rng(7001 + i), u = (i + r()) / STARS_ON.n; return tm + BLOOM_STARS.after + BLOOM_STARS.span * u; }
function drawStarsOn(x, api, F, k, B, on = i => starOnTime(i, api.scene)) {
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < STARS_ON.n; i++) {
    const a = smooth(0, STARS_ON.fade, api.t - on(i)); if (a <= 0) continue;
    const r = rng(9100 + i), u = r() * 2400, v = r() ** 1.3 * 900, big = i < 24, al = a * (big ? 0.95 : 0.4 + r() * 0.5) / Math.max(0.2, B);
    const X = (F.x0 + u * F.s) * k, Y = (F.y0 + v * F.s) * k, rad = (big ? 1.5 : 0.55 + r() * 0.5) * k * 1.6;
    x.fillStyle = `rgba(255,250,232,${Math.min(1, al).toFixed(3)})`; x.beginPath(); x.arc(X, Y, rad, 0, TAU); x.fill();
    if (big) { const gr = x.createRadialGradient(X, Y, 0, X, Y, rad * 5); gr.addColorStop(0, `rgba(255,248,226,${(al * 0.35).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,248,226,0)'); x.fillStyle = gr; x.fillRect(X - rad * 5, Y - rad * 5, rad * 10, rad * 10); }
  }
  x.restore();
}

// The comet's light on the clouds, at full resolution (a thin bright line on a dark cloud shows a half-res mask's pixels
// as steps): it hugs each cloud's edge facing the comet, brightest right on the edge and falling off into the cloud
// over `depth` (the cloud times the share of its copies, moved straight away from the comet by 0..depth, that do not
// cover it: an edge turned away from the comet is covered by every copy and gets none, and a soft, out-of-focus cloud
// is lit over a depth widened by the frame's blur, never as a ring), softened a little so it straddles the edge, with
// a little light on the cloud's body and, as the comet comes into full, a faint glow just past the lit edge. Hidden
// behind the land; times the light's falloff around the comet (half-res, `falloff`, within the screen box `reach`);
// coloured `col`. → { c, x, y } (a canvas over the clouds' box and its place on the frame) or null. LINING (screen px at
// 1080p; dim → full): the lit depth, how many copies and how they crowd toward the edge (> 1: a bright line falling off
// into a soft tail), its softening, the body's share, the outer glow's radius and strength, the light's gain, how far
// from the land it fades (a lobe just peeking over a ridge, rimmed, would read as a lit bump on the hill), and the
// falloff over which it comes in.
export const LINING = { depth: [7, 10], steps: 7, crowd: 1.7, soft: 0.6, body: 0.12, halo: [3, 0.25], gain: 1.45, near: 12, within: [0.3, 0.55] };
export function cloudLight(api, st, P, falloff, col, reach = null) {
  const { W, H } = api, u = H / 1080, full = clamp(st.key), hk = 0.5, dof = dofOf(api);
  // only round the clouds (their box in the half-res mask), within the light's reach: a full frame costs ~3x more
  const pad = Math.ceil(24 * u), hm = cloudMask(api, hk), mw = hm.width, mh = hm.height, hd = hm.getContext('2d').getImageData(0, 0, mw, mh).data;
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let j = 0; j < mh; j++) for (let i = 0, o = j * mw * 4 + 3; i < mw; i++, o += 4) if (hd[o] > 6) { if (i < bx0) bx0 = i; if (i > bx1) bx1 = i; if (j < by0) by0 = j; if (j > by1) by1 = j; }
  if (bx1 < 0) return null;
  let X0 = Math.max(0, Math.floor(bx0 / hk) - pad), Y0 = Math.max(0, Math.floor(by0 / hk) - pad), X1 = Math.min(W, Math.ceil((bx1 + 1) / hk) + pad), Y1 = Math.min(H, Math.ceil((by1 + 1) / hk) + pad);
  if (reach) { X0 = Math.max(X0, Math.floor(reach[0])); Y0 = Math.max(Y0, Math.floor(reach[1])); X1 = Math.min(X1, Math.ceil(reach[2])); Y1 = Math.min(Y1, Math.ceil(reach[3])); }
  const bw = X1 - X0, bh = Y1 - Y0;
  if (bw < 2 || bh < 2) return null;
  // (from the whole cloud: cut by the land first, the cut would light up as an edge too)
  const [ac, ax] = scratch('lining-a', bw, bh);
  ax.drawImage(cloudMask(api, 1), -X0, -Y0);
  // the band: at each point of the cloud, its cover less the mean cover of the points 0..D straight toward the comet from
  // it (crowded toward it): 1 on the edge facing the comet, falling off into the cloud, 0 on an edge turned away or running
  // along the light (a difference, not a product: an anti-aliased edge along the light would keep a faint rim)
  const D = lerp(LINING.depth[0], LINING.depth[1], full) * u + 2 * dof, N = LINING.steps, ds = Array.from({ length: N }, (_, i) => D * ((i + 1) / N) ** LINING.crowd);
  const [bc, bx] = scratch('lining-band', bw, bh), A = ax.getImageData(0, 0, bw, bh), a = A.data, src = new Uint8Array(bw * bh);
  for (let i = 0; i < src.length; i++) src[i] = a[i * 4 + 3];
  const at = (x, y) => {
    if (x < 0 || y < 0 || x > bw - 1 || y > bh - 1) return 0;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, o = j * bw + i, i1 = i < bw - 1 ? 1 : 0, j1 = j < bh - 1 ? bw : 0;
    return (src[o] * (1 - fx) + src[o + i1] * fx) * (1 - fy) + (src[o + j1] * (1 - fx) + src[o + j1 + i1] * fx) * fy;
  };
  for (let y = 0, o = 0; y < bh; y++) for (let x = 0; x < bw; x++, o++) {
    const v = src[o]; a[o * 4] = a[o * 4 + 1] = a[o * 4 + 2] = 255;
    if (!v) { a[o * 4 + 3] = 0; continue; }
    const vx = x + X0 - P.hx, vy = y + Y0 - P.hy, l = Math.hypot(vx, vy) || 1, nx = vx / l, ny = vy / l;
    let m = 0; for (const d of ds) m += at(x - nx * d, y - ny * d);
    a[o * 4 + 3] = Math.max(0, v - m / N);
  }
  bx.putImageData(A, 0, 0);
  // softened so it straddles the edge, then the body's light
  const [ec, ex] = scratch('lining', bw, bh);
  ex.filter = `blur(${(LINING.soft * u + 0.3 * dof).toFixed(2)}px)`; ex.drawImage(bc, 0, 0); ex.filter = 'none';
  ex.globalCompositeOperation = 'lighter'; ex.globalAlpha = LINING.body; ex.drawImage(ac, 0, 0); ex.globalAlpha = 1;
  if (full > 0.05) {
    // the glow just past the edge (outside the cloud only)
    const hw = Math.ceil(bw * hk), hh = Math.ceil(bh * hk), [hc, hx] = scratch('lining-halo', hw, hh);
    hx.filter = `blur(${((LINING.halo[0] * u + dof) * hk * (0.6 + 0.4 * full)).toFixed(2)}px)`; hx.drawImage(bc, 0, 0, hw, hh); hx.filter = 'none';
    hx.globalCompositeOperation = 'destination-out'; hx.drawImage(ac, 0, 0, hw, hh);
    ex.globalAlpha = LINING.halo[1] * full; ex.drawImage(hc, 0, 0, bw, bh); ex.globalAlpha = 1;
  }
  const cm = coverMask(api, hk), [nc, ncx] = scratch('lining-near', cm.width, cm.height);
  ncx.filter = `blur(${(LINING.near * u * hk).toFixed(2)}px)`; ncx.drawImage(cm, 0, 0); ncx.filter = 'none';
  ex.globalCompositeOperation = 'destination-out'; ex.drawImage(cm, -X0, -Y0, W, H); ex.drawImage(nc, -X0, -Y0, W, H); ex.drawImage(nc, -X0, -Y0, W, H);
  // (only the clouds well inside the comet's light are lined, LINING.within of its falloff: a dim cloud out in the dark
  // sky does not read, and its rim alone would float there as a lone arc)
  const [fc, fx] = scratch('lining-falloff', falloff.width, falloff.height), FI = falloff.getContext('2d').getImageData(0, 0, falloff.width, falloff.height), fd = FI.data;
  for (let i = 3; i < fd.length; i += 4) fd[i] = Math.round(fd[i] * smooth(LINING.within[0], LINING.within[1], fd[i] / 255));
  fx.putImageData(FI, 0, 0);
  ex.globalCompositeOperation = 'destination-in'; ex.drawImage(fc, -X0, -Y0, W, H);
  ex.globalCompositeOperation = 'source-in'; ex.fillStyle = rgbStr(col); ex.fillRect(0, 0, bw, bh);
  return { c: ec, x: X0, y: Y0 };
}

// The comet's light on the clouds (their edges facing it, and a little of their body) and on the mist (thin parts
// glow more), screen-blended after the grade.
function cometLight(ctx, api, st, P, k, tone) {
  const { W, H } = api, w = Math.ceil(W * k), h = Math.ceil(H * k), WARM = tone([255, 214, 156]);
  // all of it goes into one half-res light layer, screened onto the frame once
  const [Lc, Lx] = scratch('comet-lights', w, h);
  Lx.globalCompositeOperation = 'lighter';
  // light falloff around the head and along the dust tail
  const [lc, lf] = scratch('comet-falloff', w, h);
  lf.globalCompositeOperation = 'lighter';
  // (screen px: [x, y, radius] of the light's pool at u along the dust tail)
  const ca = Math.cos(COMET.ang), sa = Math.sin(COMET.ang), spotAt = (u, R) => {
    const lx = u * COMET.dust.len * P.L, ly = COMET.dust.curve[0] * 2.5 * lx * lx;
    return [P.hx + (lx * ca - ly * sa) * P.s, P.hy + (lx * sa + ly * ca) * P.s, R * P.s];
  };
  const reach = [Infinity, Infinity, -Infinity, -Infinity], spot = (u, R, a) => {
    const [X, Y, RR] = spotAt(u, R); reach[0] = Math.min(reach[0], X - RR); reach[1] = Math.min(reach[1], Y - RR); reach[2] = Math.max(reach[2], X + RR); reach[3] = Math.max(reach[3], Y + RR);
    const g = lf.createRadialGradient(X * k, Y * k, 0, X * k, Y * k, RR * k); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, `rgba(255,255,255,${a * 0.35})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    lf.fillStyle = g; lf.fillRect((X - RR) * k, (Y - RR) * k, 2 * RR * k, 2 * RR * k);
  };
  spot(0, 760, 0.9); for (const u of [0.25, 0.5, 0.75]) spot(u, 420, 0.4 * (1 - u * 0.7));
  // clouds: a line of light along their edges facing the comet, at full resolution (cloudLight)
  const cover = coverMask(api, k), lining = cloudLight(api, st, P, lc, WARM, reach);
  // the comet as key light on the land, strongest toward it: light falls on the paint (the frame's own colours times a
  // warm light, added, more on the lit paint than on the dark: KEY), so lit grass, stone and figures brighten while the
  // night's darks stay dark. A wash screened over the land would grey the shadows and flatten the night.
  if (st.key > 0.01) {
    const [kc, kx] = scratch('comet-key', w, h), R = Math.hypot(W, H) * 1.1 * k, X = P.hx * k, Y = P.hy * k;
    kx.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, w, h);
    // its value, not its night-blue hue, takes the light (else the lit stone would only turn a brighter blue)
    kx.globalCompositeOperation = 'saturation'; kx.fillStyle = '#808080'; kx.fillRect(0, 0, w, h);
    // v (a + b v): the value times a + b × itself
    const [vc, vx] = scratch('comet-key-v', w, h);
    vx.fillStyle = rgbStr([255 * KEY.a, 255 * KEY.a, 255 * KEY.a]); vx.fillRect(0, 0, w, h); vx.globalCompositeOperation = 'lighter';
    for (let b = KEY.b; b > 0.001; b -= 1) { vx.globalAlpha = Math.min(1, b); vx.drawImage(kc, 0, 0); }
    kx.globalCompositeOperation = 'multiply'; kx.drawImage(vc, 0, 0);
    const g = kx.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, rgbStr(WARM)); g.addColorStop(0.5, rgbStr(WARM.map(v => v * 0.5))); g.addColorStop(1, rgbStr(WARM.map(v => v * 0.16)));
    kx.fillStyle = g; kx.fillRect(0, 0, w, h);
    kx.globalCompositeOperation = 'destination-in'; kx.drawImage(cover, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(KEY.gain * st.key * st.B);
    ctx.drawImage(kc, 0, 0, W, H); ctx.restore();
  }
  // mist: glows where it is thin, more toward the comet
  const mo = mistOverlay(api), Fm = mo && fogField(api, mo.params, mo.seed);
  let warmMist = null;
  // at the bloom the mist that is pushed out from the stone catches the comet: deeper gold toward it
  if (Fm && Fm.any > 0.004) {
    const [gc, gx] = scratch('mist-glow', Fm.gw, Fm.gh), img = gx.createImageData(Fm.gw, Fm.gh), R = 1300 * P.s, GOLD = tone([255, 188, 110]), rise = st.rise ?? 0;
    for (let j = 0; j < Fm.gh; j++) for (let i = 0; i < Fm.gw; i++) {
      const v = Fm.grid[j * Fm.gw + i]; if (v < 0.003) continue;
      const px = i * Fm.cell, py = j * Fm.cell, near = Math.exp(-Math.hypot(px - P.hx, (py - P.hy) * 0.8) / R);
      const g = v ** 0.75 * (1.15 - 0.55 * v) * (0.45 + 0.75 * near), o = (j * Fm.gw + i) * 4, c = mixRGB(WARM, GOLD, rise * (0.85 + 0.15 * near));
      img.data[o] = c[0]; img.data[o + 1] = c[1] * (0.96 + 0.04 * near); img.data[o + 2] = c[2] * (0.9 + 0.1 * near); img.data[o + 3] = Math.round(255 * clamp(g));
    }
    gx.putImageData(img, 0, 0);
    // as thin over the figures as the mist itself is
    const [mg, mgx] = scratch('mist-glow-k', w, h), am = actorMask(api, k, true), through = (Fm.p.through ?? MIST.through) * lerp(1, MIST_LIT.through, rise);
    mgx.setTransform(k, 0, 0, k, 0, 0); stretch(mgx, { ...Fm, c: gc }, W, H); mgx.setTransform(1, 0, 0, 1, 0, 0);
    if (am && through < 1) { mgx.globalCompositeOperation = 'destination-out'; mgx.globalAlpha = 1 - through; mgx.drawImage(am, 0, 0); }
    Lx.globalAlpha = clamp(st.glow * lerp(0.62, MIST_LIT.glow, rise)); Lx.drawImage(mg, 0, 0);
    // the light screened onto the night-blue mist alone would only turn it pale lilac: the comet first turns the mist it
    // lights toward its own gold (a hue shift at the frame's own value: a multiply would darken the land under thin
    // mist), so the glow reads gold
    if (rise > 0.01) warmMist = { c: mg, a: clamp(MIST_LIT.warm * rise * st.glow / MODES.full.glow) };
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (warmMist) { ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = warmMist.a; ctx.drawImage(warmMist.c, 0, 0, W, H); ctx.globalAlpha = 1; }
  ctx.globalCompositeOperation = 'screen'; ctx.drawImage(Lc, 0, 0, W, H);
  if (lining) { ctx.globalAlpha = clamp(st.glow * st.B * LINING.gain); ctx.drawImage(lining.c, lining.x, lining.y); }
  ctx.restore();
}

function drawComet(ctx, api) {
  const st = cometState(api);
  if (st.B < 0.005) return;
  const { W, H, t } = api, F = skyFrame(api), k = 0.5, w = Math.ceil(W * k), h = Math.ceil(H * k);
  const story = api.shot.gradeAt ? api.shot.gradeAt(t)?.story : null, tone = toner(story, story ? 0.86 : 1);
  const P = { hx: F.x0 + st.pos[0] * F.s, hy: F.y0 + st.pos[1] * F.s - cometLift(api), s: F.s, L: st.L, B: st.B, t, seed: 4242 };
  let box = cometBox(P, W, H);
  if (box[2] - box[0] < 2 || box[3] - box[1] < 2) box = [0, 0, 0, 0];
  const [cc, cx] = scratch('comet', w, h);
  paintComet(cx, P, k, tone);
  // blur only around the comet (half-res box, padded for the blur)
  const R0 = [Math.max(0, Math.floor(box[0] * k) - 24), Math.max(0, Math.floor(box[1] * k) - 24)], R1 = [Math.min(w, Math.ceil(box[2] * k) + 24), Math.min(h, Math.ceil(box[3] * k) + 24)];
  const rw = R1[0] - R0[0], rh = R1[1] - R0[1];
  if (rw > 0 && rh > 0) {
    // a dim comet is a smudge: its paint is softened
    if (st.L < 0.6) { const [tc, tx] = scratch('comet-soft', rw, rh); tx.drawImage(cc, R0[0], R0[1], rw, rh, 0, 0, rw, rh); cx.clearRect(R0[0], R0[1], rw, rh); cx.filter = `blur(${(1 + 5 * (0.6 - st.L)).toFixed(2)}px)`; cx.drawImage(tc, R0[0], R0[1]); cx.filter = 'none'; }
    // the glow: a soft copy under the paint (at quarter resolution)
    const [gc, gx] = scratch('comet-glow', Math.ceil(rw / 2), Math.ceil(rh / 2));
    gx.filter = 'blur(6px)'; gx.drawImage(cc, R0[0], R0[1], rw, rh, 0, 0, rw / 2, rh / 2); gx.filter = 'none';
    cx.globalCompositeOperation = 'destination-over'; cx.globalAlpha = 0.9; cx.drawImage(gc, 0, 0, rw / 2, rh / 2, R0[0], R0[1], rw, rh);
  }
  cx.globalAlpha = 1; paper(cx, 0.1);
  // the starfield brightens with the bloom (its own alpha: the comet layer is drawn at the comet's brightness)
  if (st.stars > 0.01) {
    cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = clamp(st.stars / Math.max(0.05, st.B));
    cx.drawImage(starfield(), F.x0 * k, F.y0 * k, F.w * k, F.h * k); box = [0, 0, W, H];
  }
  // at twilight the stars come out one by one (params.stars: 'on' | false; default on in a twilight scene)
  const starsOn = api.params?.stars ?? (JSON.stringify(api.scene?.time ?? '').includes('twilight') ? 'on' : false);
  if (starsOn === 'on') { drawStarsOn(cx, api, F, k, st.B); box = [0, 0, W, H]; }
  else if (st.rise > 0) { const tm = api.marks[api.params.mark || 'bloom']; drawStarsOn(cx, api, F, k, st.B, i => bloomStarTime(i, tm)); box = [0, 0, W, H]; }
  // in a shot with depth of field the comet is as out of focus as the sky behind the subjects
  const dof = dofOf(api) * k;
  if (dof > 0.3 && box[2] - box[0] >= 2 && box[3] - box[1] >= 2) {
    const pad = Math.ceil(dof * 2.5), b0 = [Math.max(0, Math.floor(box[0] * k) - pad), Math.max(0, Math.floor(box[1] * k) - pad)], b1 = [Math.min(w, Math.ceil(box[2] * k) + pad), Math.min(h, Math.ceil(box[3] * k) + pad)];
    const bw = b1[0] - b0[0], bh = b1[1] - b0[1], [dc, dx] = scratch('comet-dof', bw, bh);
    dx.filter = `blur(${dof.toFixed(2)}px)`; dx.drawImage(cc, b0[0], b0[1], bw, bh, 0, 0, bw, bh); dx.filter = 'none';
    cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.clearRect(b0[0], b0[1], bw, bh); cx.drawImage(dc, b0[0], b0[1]); cx.restore();
    box = [b0[0] / k, b0[1] / k, b1[0] / k, b1[1] / k].map((v, i) => clamp(v, 0, i % 2 ? H : W));
  }
  // hidden by what stands in front: land, props, actors (fully), clouds (mostly, with a feathered edge so the bright
  // coma never shows the cloud's outline as a cut), mist (by its density)
  cx.globalCompositeOperation = 'destination-out';
  cx.globalAlpha = 1; cx.drawImage(coverMask(api, k), 0, 0);
  cx.globalAlpha = 0.8; cx.filter = `blur(${(1.5 * W / 1920).toFixed(2)}px)`; cx.drawImage(cloudMask(api, k), 0, 0); cx.filter = 'none';
  const mo = mistOverlay(api);
  if (mo) { const Fm = fogField(api, mo.params, mo.seed); if (Fm.any > 0.004) { cx.globalAlpha = 0.85; cx.setTransform(k, 0, 0, k, 0, 0); stretch(cx, Fm, W, H); cx.setTransform(1, 0, 0, 1, 0, 0); } }
  cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
  if (box[2] - box[0] >= 2 && box[3] - box[1] >= 2) {
    const s0 = [Math.floor(box[0] * k), Math.floor(box[1] * k), Math.ceil(box[2] * k), Math.ceil(box[3] * k)];
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(st.B);
    ctx.drawImage(cc, s0[0], s0[1], s0[2] - s0[0], s0[3] - s0[1], s0[0] / k, s0[1] / k, (s0[2] - s0[0]) / k, (s0[3] - s0[1]) / k);
    ctx.restore();
  }
  cometLight(ctx, api, st, P, k, tone);
  drawStoneKey(ctx, api, st, P, tone);
}

// The standing stone catches the comet's light: its own paint turned toward gold and lit, strongest on the face toward
// the comet (its far side keeps the night), and a gold line along its edge facing it, all rising with the comet's key
// (none for the dim smudge, all of it once it has bloomed); hidden by the figures and the mist in front of it.
// STONE_KEY: how far the lit face turns gold (a hue shift at its own value), the light's gain on it, the line's width
// (screen px at 1080p, a little wider close up) and strength.
export const STONE_KEY = { hue: 0.45, face: 0.5, line: 3, edge: 0.8 };
export const stoneKeyAt = st => clamp((st.key - MODES.dim.key) / (MODES.full.key - MODES.dim.key)) * clamp(st.B);
function drawStoneKey(ctx, api, st, P, tone) {
  const a = stoneKeyAt(st), p = api.set.props?.find(q => q.id === 'standing_stone');
  if (a < 0.01 || !p?.sprite) return;
  const { W, H, cam } = api, z = cam.zoom, lw = STONE_KEY.line * (H / 1080) * Math.max(1, Math.sqrt(z / 2));
  const pad = Math.ceil(lw + 2), X0 = Math.max(0, Math.floor((p.sx - cam.cx) * z + W / 2) - pad), Y0 = Math.max(0, Math.floor((p.sy - cam.cy) * z + H / 2) - pad);
  const X1 = Math.min(W, Math.ceil((p.sx + p.sw - cam.cx) * z + W / 2) + pad), Y1 = Math.min(H, Math.ceil((p.sy + p.sh - cam.cy) * z + H / 2) + pad);
  if (X1 - X0 < 2 || Y1 - Y0 < 2) return;
  const ow = X1 - X0, oh = Y1 - Y0, sp = propSprite(api.set, p, z), sprite = (x, dx = 0, dy = 0) => { x.setTransform(z, 0, 0, z, W / 2 - cam.cx * z - X0 + dx, H / 2 - cam.cy * z - Y0 + dy); x.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h); x.setTransform(1, 0, 0, 1, 0, 0); };
  // toward the comet on screen, from the stone's middle
  const mx = (p.sx + p.sw / 2 - cam.cx) * z + W / 2, my = (p.sy + p.sh / 2 - cam.cy) * z + H / 2, dl = Math.hypot(P.hx - mx, P.hy - my) || 1, nx = (P.hx - mx) / dl, ny = (P.hy - my) / dl;
  const WARM = tone([255, 214, 156]), LINE = tone([255, 206, 128]), HUE = tone([255, 192, 112]);
  // the face: the frame's own paint (its value) times the warm light, full on the side toward the comet, little beyond
  const [fc, fx] = scratch('stone-key', ow, oh);
  fx.drawImage(ctx.canvas, X0, Y0, ow, oh, 0, 0, ow, oh);
  fx.globalCompositeOperation = 'saturation'; fx.fillStyle = '#808080'; fx.fillRect(0, 0, ow, oh);
  const r = Math.hypot(ow, oh) / 2, g = fx.createLinearGradient(ow / 2 + nx * r, oh / 2 + ny * r, ow / 2 - nx * r, oh / 2 - ny * r);
  g.addColorStop(0, rgbStr(WARM)); g.addColorStop(0.5, rgbStr(WARM.map(v => v * 0.45))); g.addColorStop(1, rgbStr(WARM.map(v => v * 0.08)));
  fx.globalCompositeOperation = 'multiply'; fx.fillStyle = g; fx.fillRect(0, 0, ow, oh);
  fx.globalCompositeOperation = 'destination-in'; sprite(fx);
  // its hue on the lit face (the night grade left it blue: light added alone would only whiten it)
  const [hc, hx] = scratch('stone-key-hue', ow, oh), gh = hx.createLinearGradient(ow / 2 + nx * r, oh / 2 + ny * r, ow / 2 - nx * r, oh / 2 - ny * r);
  gh.addColorStop(0, rgbStr(HUE, 1)); gh.addColorStop(0.55, rgbStr(HUE, 0.4)); gh.addColorStop(1, rgbStr(HUE, 0));
  hx.fillStyle = gh; hx.fillRect(0, 0, ow, oh); hx.globalCompositeOperation = 'destination-in'; sprite(hx);
  // the edge facing the comet: the stone minus itself moved away from it
  const [ec, ex] = scratch('stone-key-edge', ow, oh);
  sprite(ex); ex.globalCompositeOperation = 'destination-out'; sprite(ex, -nx * lw, -ny * lw);
  ex.globalCompositeOperation = 'source-in'; ex.fillStyle = rgbStr(LINE); ex.fillRect(0, 0, ow, oh);
  // hidden by the figures and the mist in front of the stone
  const mo = mistOverlay(api), F = mo && fogField(api, mo.params, mo.seed);
  for (const x of [fx, hx, ex]) {
    x.globalCompositeOperation = 'source-over';
    eraseActors(x, api, p.y, [X0, Y0, ow, oh]);
    if (F && F.any > 0.004) { x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 0.92; x.translate(-X0, -Y0); stretch(x, F, W, H); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; }
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = clamp(STONE_KEY.hue * a); ctx.drawImage(hc, X0, Y0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(STONE_KEY.face * a); ctx.drawImage(fc, X0, Y0);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(STONE_KEY.edge * a); ctx.drawImage(ec, X0, Y0);
  ctx.restore();
}

// ───────────── the last light on the stone ─────────────
// stoneLit(dayT, dark) → the fraction of the stone's height, from the top, still in the sun. The shadow line reaches the
// stone's foot at dayT 0.80 and climbs it fast, then the last thread lingers: past 0.92 it shrinks as a square root, so
// it is still visible a moment before `dark` and goes out exactly there (and never before).
export const STONE_LIGHT = { knots: [[0.8, 1], [0.85, 0.35], [0.87, 0.17], [0.9, 0.11], [0.915, 0.085], [0.92, 0.075]], dark: 0.95 };
export function stoneLit(d, dark = STONE_LIGHT.dark) {
  if (!(d < dark)) return 0;
  const K = STONE_LIGHT.knots, table = v => {
    if (v <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) if (v <= K[i][0]) return lerp(K[i - 1][1], K[i][1], (v - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
    return K[K.length - 1][1];
  };
  const dt = Math.min(K[K.length - 1][0], dark - 0.015);
  return d <= dt ? table(d) : table(dt) * Math.sqrt((dark - d) / (dark - dt));
}
// The stone light's state for a frame: { dayT, dark, lit } from params.dayT ([from, to] across the scene, or one value)
// and params.out (a mark: the dayT at that instant is where the light goes out).
export function stoneLightAt(api) {
  const p = api.params || {}, D = Array.isArray(p.dayT) ? p.dayT : [p.dayT ?? 0.88, p.dayT ?? 0.88], sc = api.scene;
  const span = (sc.t1 - sc.t0) || 1, dayAt = t => lerp(D[0], D[1], (t - sc.t0) / span), dayT = dayAt(clamp(api.t, sc.t0, sc.t1));
  const tm = typeof p.out === 'string' ? api.marks?.[p.out] : null;
  const dark = tm != null ? (api.t >= tm ? -Infinity : dayAt(tm)) : p.dark ?? STONE_LIGHT.dark;
  return { dayT, dark, lit: dark === -Infinity ? 0 : stoneLit(dayT, dark) };
}
// A prop's sprite as the frame draws it at screen scale z (a close framing draws a sharper one, whose ink lies a little
// differently: light laid on the base sprite would float off the drawn edge): { c, x, y, w, h } (its world rect).
const propSprite = (S, p, z) => (S.propSprite ? S.propSprite(p, z) : { c: p.sprite, x: p.sx, y: p.sy, w: p.sw, h: p.sh });
const SPRITE_TOP = new WeakMap();
// The top of a sprite's painted silhouette (world y), from its alpha.
function spriteTop(k) {
  if (SPRITE_TOP.has(k.c)) return SPRITE_TOP.get(k.c);
  const c = k.c, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let row = 0;
  outer: for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (d[(j * c.width + i) * 4 + 3] > 140) { row = j; break outer; }
  const y = k.y + (row * k.h) / c.height; SPRITE_TOP.set(c, y); return y;
}
// Erase the actors standing in front of a depth `key` from a local screen-space canvas whose (0, 0) is screen
// (ox, oy) (rigs shade with multiply, so each is painted into its own scratch first, then cut out).
function eraseActors(x, api, key, [ox, oy, ow, oh]) {
  const { W, H } = api, z = api.cam.zoom;
  for (const a of actorsOf(api)) {
    if (!(a.key > key) || a.alpha < 0.3) continue;
    const g = api.actor?.(a.id)?.box;
    if (g) { const b = [(g[0] - api.cam.cx) * z + W / 2, (g[1] - api.cam.cy) * z + H / 2, (g[2] - api.cam.cx) * z + W / 2, (g[3] - api.cam.cy) * z + H / 2]; if (b[2] < ox || b[0] > ox + ow || b[3] < oy || b[1] > oy + oh) continue; }
    const [ac, ax] = scratch('actor-cut', ow, oh); ax.translate(-ox, -oy); drawActor(ax, a, api);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(ac, 0, 0); x.restore();
  }
}
const GOLD = [255, 200, 112], EMBER = [255, 138, 84];
// The last thread of light (drawn over the lit paint, which is drawn at 0.95): its colour and strength, reached once the
// lit part is `full` of the stone's height (the last ~14 frames before `out` in s09), from none at `from`.
export const STONE_THREAD = { col: '#FFD38A', a: 0.9, from: 0.06, full: 0.02 };
function drawStoneLight(ctx, api) {
  const L = stoneLightAt(api);
  if (L.lit <= 0) return;
  const S = api.set, p = S.props?.find(q => q.id === 'standing_stone');
  if (!p?.sprite) return;
  const { W, H, cam } = api, z = cam.zoom, sp = propSprite(S, p, z), top = spriteTop(sp), base = p.base ?? p.y, line = top + L.lit * (base - top);
  // work in a canvas over the lit part of the stone only (plus room for the glow)
  const pad = Math.ceil(Math.max(8, 14 * Math.sqrt(z))), X0 = Math.max(0, Math.floor((p.sx - cam.cx) * z + W / 2) - pad), Y0 = Math.max(0, Math.floor((top - 12 - cam.cy) * z + H / 2) - pad);
  const X1 = Math.min(W, Math.ceil((p.sx + p.sw - cam.cx) * z + W / 2) + pad), Y1 = Math.min(H, Math.ceil((line + 12 - cam.cy) * z + H / 2) + pad);
  if (X1 - X0 < 2 || Y1 - Y0 < 2) return;
  const ow = X1 - X0, oh = Y1 - Y0, local = x => x.setTransform(z, 0, 0, z, W / 2 - cam.cx * z - X0, H / 2 - cam.cy * z - Y0);
  const [c, x] = scratch('stone-lit', ow, oh), col = mixRGB(GOLD, EMBER, clamp(1 - L.lit / 0.17));
  // the stone's own paint, lit gold: multiplied by the light and lifted a little; the last thread lies on the stone's
  // inked edge, which multiplied alone would stay dark, so the light is laid over the ink more as it thins
  const thread = clamp(1 - L.lit / 0.08);
  local(x);
  x.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = rgbStr(col); x.fillRect(p.sx, top - 4, p.sw, base - top + 8);
  x.globalCompositeOperation = 'screen'; x.fillStyle = rgbStr(col, 0.3 + 0.4 * thread); x.fillRect(p.sx, top - 4, p.sw, base - top + 8);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
  // only above the shadow line (soft, a little uneven), and more on the sunward (left) face
  const feather = Math.max(1.6 / z, 2.5), seg = 24, nz = vnoise(31);
  const [mc, mx] = scratch('stone-lit-mask', ow, oh);
  local(mx);
  const g = mx.createLinearGradient(p.sx, 0, p.sx + p.sw, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  mx.fillStyle = g; mx.beginPath(); mx.moveTo(p.sx - 2, top - 10);
  // the terminator follows the stone's round: lower on the sunward (left) side, curling up on the far side
  const hs = base - top, sag = Math.min(hs * 0.06, 4 + L.lit * hs * 0.25);
  for (let i = 0; i <= seg; i++) { const u = i / seg, px = p.sx + u * p.sw; mx.lineTo(px, line + sag * (0.35 - u) - sag * 0.6 * Math.sin(Math.PI * u) + (nz(u * 5, 2.3) - 0.5) * Math.min(4, 1 + L.lit * 20)); }
  mx.lineTo(p.sx + p.sw + 2, top - 10); mx.closePath(); mx.fill();
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in'; x.filter = `blur(${(feather * z * 0.5).toFixed(2)}px)`; x.drawImage(mc, 0, 0); x.filter = 'none';
  x.globalCompositeOperation = 'source-over';
  // the last thread: as the sliver thins to a few px (too thin for the feathered, sagging terminator above, which would
  // leave it dark on the ink) the stone's top above the level shadow line is laid in pale gold, clipped to the stone
  const ta = STONE_THREAD.a * smooth(STONE_THREAD.from, STONE_THREAD.full, L.lit);
  if (ta > 0.004) {
    const [tc, tx] = scratch('stone-thread', ow, oh), tl = top + L.lit * hs, f = Math.max(0.6 / z, 0.2), TC = hex(STONE_THREAD.col);
    local(tx);
    const gt = tx.createLinearGradient(0, tl - f, 0, tl + f); gt.addColorStop(0, rgbStr(TC)); gt.addColorStop(1, rgbStr(TC, 0));
    tx.fillStyle = gt; tx.fillRect(p.sx, top - 12, p.sw, tl + f - top + 12);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
    x.globalAlpha = ta; x.drawImage(tc, 0, 0); x.globalAlpha = 1;
  }
  // hidden by the actors and the mist in front of the stone
  eraseActors(x, api, p.y, [X0, Y0, ow, oh]);
  const mo = mistOverlay(api);
  if (mo) { const F = fogField(api, mo.params, mo.seed); if (F.any > 0.004) { x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 0.92; x.translate(-X0, -Y0); stretch(x, F, W, H); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; } }
  // and its glow: the last light blooms a little (blurred locally: a filter on the frame itself costs a full layer)
  const [bc, bx] = scratch('stone-lit-glow', ow, oh);
  bx.filter = `blur(${Math.max(3, 6 * Math.sqrt(z)).toFixed(1)}px)`; bx.drawImage(c, 0, 0); bx.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.95; ctx.drawImage(c, X0, Y0);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55 + 0.35 * thread; ctx.drawImage(bc, X0, Y0);
  ctx.restore();
}

// ───────────── the time-lapse (shot 1.6) ─────────────
// timelapseAt(bt, dur, fps) → the state of the time-lapse bt seconds into the beat (pure; tested):
//   alpha  how much of the drawn sky / light replaces the frame's own (0 at both ends: it starts on the prologue's night
//          and lands on the dawn of shot 1.7);
//   day    0 (midnight) .. 1 (noon) of the cycling days, slow at first (under one day a second);
//   amp    how much of the cycling is still visible: it fades into the average colour before the days speed up, so the
//          frame changes brightness at most twice a second (the film's limit is 3);
//   season { col, k } the tint on the grass (summer, autumn gold, winter pale, spring green), about once a second;
//   ghost  the Nell drawn on this frame (index into GHOSTS) or -1, and ghostA its strength (0..1).
// GHOSTS: the frame each one appears on (at 24 fps in a 4 s beat; a shorter or longer beat moves them with it) and how
// many frames she stays. The last, the old woman, is held 8 frames as the time-lapse slows into dawn, fading over her
// last GHOST_END.fade frames like ink lifting off the page, and is gone GHOST_END.clear s before the beat ends: its last
// frames are the empty dawn of the cut to 1.7 (she used to hang there, see-through, until the cut).
export const GHOST_END = { clear: 0.25, fade: 3 };
export const GHOSTS = [
  { f: 22, n: 5, age: 'child' }, { f: 30, n: 5, age: 'child' }, { f: 44, n: 5, age: 'teen' }, { f: 52, n: 5, age: 'teen' },
  { f: 64, n: 5, age: 'adult' }, { f: 71, n: 5, age: 'adult' }, { f: 80, n: 5, age: 'elder' }, { f: 87, n: 8, age: 'elder' },
];
const SUMMERS = [[28, 1], [50, 2], [70, 3], [90, 4]];      // frames where the grass is at high summer (season phase)
const SEASONS = [
  { q: 0, col: [106, 154, 64], k: 0 }, { q: 0.25, col: [206, 160, 70], k: 0.48 }, { q: 0.5, col: [228, 222, 204], k: 0.55 },
  { q: 0.75, col: [150, 200, 80], k: 0.3 }, { q: 1, col: [106, 154, 64], k: 0 },
];
const rateAt = bt => 0.85 * smooth(0.3, 0.6, bt) + 2 * smooth(2.3, 3.2, bt);   // days a second: a day takes 1.2 s, then they blur
export function dayPhase(bt) {
  let ph = 0; const n = Math.max(1, Math.ceil(bt / 0.01)), h = bt / n;
  for (let i = 0; i < n; i++) ph += rateAt((i + 0.5) * h) * h;
  return ph;
}
export function seasonAt(f) {
  const K = SUMMERS;
  let ph;
  if (f <= K[0][0]) ph = K[0][1] + (f - K[0][0]) / (K[1][0] - K[0][0]);
  else if (f >= K[K.length - 1][0]) ph = K[K.length - 1][1] + (f - K[K.length - 1][0]) / (K[K.length - 1][0] - K[K.length - 2][0]);
  else for (let i = 1; i < K.length; i++) if (f <= K[i][0]) { ph = lerp(K[i - 1][1], K[i][1], (f - K[i - 1][0]) / (K[i][0] - K[i - 1][0])); break; }
  const q = ((ph % 1) + 1) % 1, i = SEASONS.findIndex((S, j) => j > 0 && q <= S.q), A = SEASONS[i - 1], B = SEASONS[i], u = (q - A.q) / (B.q - A.q);
  return { q, col: mixRGB(A.col, B.col, u), k: lerp(A.k, B.k, u) };
}
export function timelapseAt(bt, dur = 4, fps = 24) {
  const f = Math.floor(bt * fps + 1e-6), end = dur;
  const alpha = 0.86 * smooth(0.25, 0.75, bt) * (1 - smooth(end - 1.05, end - 0.1, bt));
  const ph = dayPhase(bt), day = 0.5 - 0.5 * Math.cos(TAU * ph), amp = 1 - smooth(1.95, 2.65, bt);
  const S = seasonAt(f), sk = smooth(0.7, 1.3, bt) * (1 - smooth(end - 0.6, end - 0.05, bt));
  // the old woman ends GHOST_END.clear s before the beat's end; the others keep their places in proportion
  const G7 = GHOSTS[GHOSTS.length - 1], n7 = Math.round(G7.n * fps / 24), at = (Math.round(dur * fps) - Math.round(GHOST_END.clear * fps) - n7) / G7.f;
  const span = G => { const n = Math.round(G.n * fps / 24), g0 = Math.round(G.f * at); return [g0, g0 + n]; };
  const ghost = GHOSTS.findIndex(G => { const [g0, g1] = span(G); return f >= g0 && f < g1; });
  const ghostA = ghost === GHOSTS.length - 1 ? clamp((span(G7)[1] - f) / (GHOST_END.fade + 1)) : ghost >= 0 ? 1 : 0;
  return { f, alpha, day, amp, phase: ph, season: { col: S.col, k: S.k * sk, q: S.q }, ghost, ghostA };
}
// The full-frame light of the time-lapse sky and land at a state (0..1): what the photosensitivity test counts.
export const timelapseLight = s => s.alpha * (s.amp * s.day + (1 - s.amp) * 0.5);

const NIGHT_SKY = [[12, 20, 50], [44, 54, 98]], DAY_SKY = [[84, 140, 206], [206, 228, 238]], DUSK = [240, 178, 140];
const GHOST_LOOK = {
  child: { age: 'child', hairStyle: 'braids', hair: '#3b2a20', bottom: 'dress', dress: '#d9a441', shirt: '#d9a441', shoes: null },
  teen: { age: 'teen', hairStyle: 'braids', hair: '#3b2a20', bottom: 'skirt', dress: '#7a6a8c', shirt: '#d8c49a', shoes: '#4a3a2c' },
  adult: { age: 'adult', hairStyle: 'bun', hair: '#4a3426', bottom: 'skirt', dress: '#5f6f8c', shirt: '#c8b494', shoes: '#4a3a2c' },
  elder: { age: 'elder', build: 'slight', hairStyle: 'bun', hair: '#d9d6d0', glasses: '#b08a3a', bottom: 'skirt', dress: '#5f6f8c', shirt: '#cdbfa3', shoes: '#4a3a2c' },
};
export const SCARF = '#5e7b3f';
function drawTimelapse(ctx, u, api) {
  const dur = api.dur ?? 4, s = timelapseAt(api.bt ?? u * dur, dur, api.plan.fps || 24);
  const { W, H, set: S, cam } = api, k = 0.5, w = Math.ceil(W * k), h = Math.ceil(H * k);
  const cover = coverMask(api, k);
  // the sky: days and nights, then their drifting average
  if (s.alpha > 0.003) {
    const drift = 0.08 * Math.sin(api.t * 1.3) + 0.05 * Math.sin(api.t * 0.7 + 1);
    const avg = i => mixRGB(mixRGB(NIGHT_SKY[i], DAY_SKY[i], 0.5 + drift), [150, 130, 170], 0.18);
    const cyc = i => { let c = mixRGB(NIGHT_SKY[i], DAY_SKY[i], s.day); if (i === 1) c = mixRGB(c, DUSK, 0.55 * 4 * s.day * (1 - s.day) * (1 - s.day)); return c; };
    const top = mixRGB(avg(0), cyc(0), s.amp), hor = mixRGB(avg(1), cyc(1), s.amp);
    const [sc, sx] = scratch('tl-sky', w, h), g = sx.createLinearGradient(0, 0, 0, h * 0.75);
    g.addColorStop(0, rgbStr(top)); g.addColorStop(1, rgbStr(hor)); sx.fillStyle = g; sx.fillRect(0, 0, w, h);
    sx.globalCompositeOperation = 'destination-out'; sx.drawImage(cover, 0, 0);
    // the land takes the same light as the sky: its own paint graded for the time of day the sky shows (night to noon,
    // with the shot's story grade), over the frame's own grade as much as the sky is (else the land keeps the shot's
    // night-to-dawn light while the sky turns, and shines under a night sky)
    const lit = s.amp * s.day + (1 - s.amp) * 0.5, land = coverMask(api, 1), [lc, lx] = scratch('tl-land', W, H);
    lx.drawImage(land, 0, 0);
    grade(lx, mixGrade([['night', 1 - lit], ['noon', lit]]), api.t, W, H, api.shot.gradeAt ? api.shot.gradeAt(api.t)?.story : null);
    lx.globalCompositeOperation = 'destination-in'; lx.drawImage(land, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = s.alpha;
    ctx.drawImage(sc, 0, 0, W, H); ctx.drawImage(lc, 0, 0);
    ctx.restore();
  }
  // seasons on the grass (not on the stone)
  if (s.season.k > 0.004) {
    const [tc, tx] = scratch('tl-season', w, h), p = S.props?.find(q => q.id === 'standing_stone');
    tx.drawImage(cover, 0, 0);
    if (p?.sprite) { worldT(tx, api, k); tx.globalCompositeOperation = 'destination-out'; tx.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh); tx.setTransform(1, 0, 0, 1, 0, 0); }
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = rgbStr(s.season.col); tx.fillRect(0, 0, w, h);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = clamp(s.season.k * 0.85);
    ctx.drawImage(tc, 0, 0, W, H);
    if (s.season.q > 0.3 && s.season.q < 0.7) { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(s.season.k * 0.22 * Math.sin(Math.PI * (s.season.q - 0.3) / 0.4)); ctx.drawImage(tc, 0, 0, W, H); }
    ctx.restore();
  }
  // a ghost of Nell at the stone, out of focus, at about 30%
  if (s.ghost >= 0) drawGhost(ctx, api, GHOSTS[s.ghost], s.ghostA);
}
function drawGhost(ctx, api, G, a = 1) {
  const { W, H, cam, set: S } = api, z = cam.zoom, R = getRig('human'), at = S.anchor('stone_left');
  const params = { ...GHOST_LOOK[G.age], skin: '#c99a72', scarf: SCARF };
  const sx = (at.x - cam.cx) * z + W / 2, sy = (at.y - cam.cy) * z + H / 2, ss = S.scaleAt(at.x, at.y) * z;
  const [gc, gx] = scratch('ghost', W, H);
  R.draw(gx, sx, sy, ss, -1, { pose: R.poses['sit-ground'], params, expr: 'happy', blink: 0, breath: 0.5, t: api.t, shadow: false });
  // lit like the frame around it: the grade's tint, then out of focus
  const g = api.shot.gradeAt ? api.shot.gradeAt(api.t) : null;
  if (g?.mul) { gx.globalCompositeOperation = 'source-atop'; gx.globalAlpha = 0.4; gx.fillStyle = `rgb(${g.mul.map(Math.round).join(',')})`; gx.fillRect(0, 0, W, H); }
  const [bc, bx] = scratch('ghost-blur', W, H);
  bx.filter = `blur(${Math.max(1.6, 2.4 * (H / 1080) * Math.sqrt(Math.max(0.5, z))).toFixed(1)}px)`; bx.drawImage(gc, 0, 0); bx.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.3 * a; ctx.drawImage(bc, 0, 0); ctx.restore();
}

// ───────────── overlays and custom beats ─────────────
export const overlays = {
  comet: { layer: 'grade', draw: drawComet },
  'hill-mist': { layer: 'front', draw: drawMist },
  'stone-light': { layer: 'grade', draw: drawStoneLight },
};
export const custom = { timelapse: { layer: 'grade', draw: drawTimelapse } };
