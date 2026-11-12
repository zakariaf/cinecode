// A set: painted parallax layers, depth-sorted props, anchors, walkable ground, routing and a sky.
// Everything an actor can touch (ground, stump tops, branches, hollows, stones, water) is defined once,
// as data, and both the painting and the staging read that same data.
// Depth (DESIGN §10): S.lens (the kit's `lens`, default LENS), an anchor's `z` (its depth off the stage), layers
// drawn scaled by a camera's depth (cam.z) and faded as it reaches them, and a near field of specks at every depth
// (makeSet's `field`, S.fieldSpecks) that a camera moving through depth streams past.
import { rng, clamp, lerp, canvas } from '../core/lib.mjs';
import { branchTop } from '../paint/nature.mjs';
import { inkSilhouette } from '../paint/brush.mjs';
import { lineart } from '../paint/lineart.mjs';
import { SKY_TIMES, SKY_W, SKY_H, skyCanvases, skyHaze } from '../paint/sky.mjs';
import { declaredTime, declareTime, timeClash } from '../film/grade.mjs';

export { SKY_TIMES };
export const MIN_ZOOM = 0.6;                       // at 1920×1080
export const MAX_VIEW = { w: 1920 / MIN_ZOOM, h: 1080 / MIN_ZOOM };   // widest world rect a camera may show
export const INK_FADE = 24;                        // a prop's silhouette ink fades out over this many units above its inkFloor
export const CLOSE_PX = 24e6;                      // the most pixels one close sprite of a prop may hold (~96 MB)
// Depth (DESIGN §10): a camera at depth 0 stands LENS world px in front of the stage (z = 0; a kit's `lens` overrides
// it: about a 45° view across a 1920-px frame at zoom 1). Whatever is nearer the lens than NEAR × the lens is not drawn;
// it fades out from NEAR_FADE × the lens (nearFade: 0..1 at distance d from the lens D, eased).
export const LENS = 2304, NEAR = 0.1, NEAR_FADE = 0.25;
export const nearFade = (d, D) => { const u = clamp((d - NEAR * D) / ((NEAR_FADE - NEAR) * D)); return u * u * (3 - 2 * u); };
// Things off the stage (actors, effect pieces, a set's near field) pass the lens instead: drawn whole until PASS_FADE ×
// the lens from it (25× their size on the stage), faded out by PASS × it (passFade, eased). By then whatever is off the
// camera's axis has grown out of the frame, so only what the lens truly meets fades, briefly and filling the frame, never
// as a small see-through ghost in the middle of it. (A layer is the whole frame: it keeps NEAR / NEAR_FADE.)
export const PASS = 0.01, PASS_FADE = 0.04;
export const passFade = (d, D) => { const u = clamp((d - PASS * D) / ((PASS_FADE - PASS) * D)); return u * u * (3 - 2 * u); };
// A layer with parallax k seen from a camera at depth c (lens D): its scale about the frame centre relative to the
// stage, r, and its near fade, a (k = 0: the sky, at infinity).
export const layerDepth = (k, c, D) => ({ r: (D - c) / (D - k * c), a: k > 0 ? nearFade(D / k - c, D) : 1 });

// The near field (S.fieldSpecks): cells FIELD_CELL field units across and FIELD_CELLZ world px deep, FIELD_SHARE of
// them holding a speck at density 1, seen out to FIELD_REACH × the lens, and seen whole while the camera moves through
// depth at FIELD_GO × the lens a second or more; their colours (rgb).
const FIELD_CELL = 140, FIELD_CELLZ = 160, FIELD_SHARE = 0.33, FIELD_REACH = 1.5, FIELD_GO = 0.06;
const SPECKS = ['255,250,236', '255,250,236', '226,234,255', '255,238,206'];
const cellHash = (i, j, l, s) => {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(l, 0x9e3779b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

// The sprite resolution a prop drawn at screen scale `scale` (device px per world unit) uses: its base `res` until the
// sprite would be enlarged more than 1.25×, then the smallest of res·2, res·4, … (and `max` itself) that is not, up to
// `max`. It depends only on the scale drawn at, so a frame is the same whatever was drawn before it.
export function resTier(res, max, scale) {
  if (!(max > res) || !(scale > res * 1.25)) return res;
  let t = res;
  while (t * 1.25 < scale && t * 2 < max) t *= 2;
  return t * 1.25 < scale ? max : t;
}
// Device pixels per world unit under a context's current transform.
export const scaleOf = ctx => { const m = ctx.getTransform(); return Math.hypot(m.a, m.b); };

// ───────────── geometry ─────────────
export function pointInPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const inEllipse = (e, x, y, gx = 0, gy = 0) => { const dx = (x - e.x) / (e.rx + gx), dy = (y - e.y) / (e.ry + gy); return dx * dx + dy * dy < 1; };
export function polyBox(P) { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, x1, y0, y1 }; }
export const ellipsePoly = (cx, cy, rx, ry, n = 32) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
const pt = p => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]);
// A band polygon between two curves y = top(x) and y = bot(x).
export function bandPoly(x0, x1, top, bot, step = 16) {
  const T = [], B = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) { T.push([x, top(x)]); B.push([x, bot(x)]); }
  return [...T, ...B.reverse()];
}

// Tight pixel box of everything painted (alpha > 0) on a canvas, or null if empty.
export function alphaBox(c) {
  const { width: w, height: h } = c, d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) { const row = y * w * 4; for (let x = 0; x < w; x++) if (d[row + x * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Clamp a camera so its frame stays inside the painted area and its centre inside the set's view.
// Zoom is raised if the frame would show more world than the widest allowed view (MAX_VIEW, in world
// units: 3200×1800, i.e. zoom 0.6 at 1920×1080) or than the painted area.
export function clampCamera(S, cam, W = 1920, H = 1080) {
  const A = S.area, V = S.view;
  const z0 = cam.zoom ?? cam.s ?? 1;
  const zoom = Math.max(z0, W / Math.min(MAX_VIEW.w, A.x1 - A.x0), H / Math.min(MAX_VIEW.h, A.y1 - A.y0));
  const hw = W / 2 / zoom, hh = H / 2 / zoom;
  const fit = (c, a0, a1, v0, v1, h) => {
    const lo = a0 + h, hi = a1 - h, l = Math.max(lo, v0), u = Math.min(hi, v1);
    return l <= u ? clamp(c, l, u) : clamp(clamp(c, v0, v1), lo, hi);
  };
  const out = { ...cam, cx: fit(cam.cx, A.x0, A.x1, V.x0, V.x1, hw), cy: fit(cam.cy, A.y0, A.y1, V.y0, V.y1, hh), zoom };
  if ('s' in cam) out.s = zoom;
  return out;
}

// ───────────── times of day ─────────────
// A kit not under Earth's sky declares its own times (makeSet's `times`), and those are then all the times it has:
// { name: { grade, sun, haze } }, each with a painter in `skies` (an empty entry for one of Earth's eight, SKY_TIMES,
// which keeps the engine's light and sky).
//   grade: 'neutral' (default: the picture as painted, under the house vignette), one of Earth's eight (its grade), or
//          { sl, mul, vig, con } (as grade.mjs GR: soft-light wash rgba, multiply tint rgb, vignette, contrast ≥ 1;
//          what it leaves out is neutral)
//   sun:   null (default: no sun, so no cast shadows), one of Earth's eight (its sun), or { len, a } (as grade.mjs SUN)
//   haze:  [r, g, b], the colour far layers fade toward (default none: they are drawn as painted)
// The frame looks a time's light up by its name (grade.mjs), so a name means one light in the whole film: two kits may
// declare the same name only with the same light (the same once its defaults are filled in). A set's times are
// declared (declareTime) once the whole set has passed its checks.
// A set with no ground to shade (space: makeSet's `groundShadows: false`) takes no shadow at any time: no figure, flier
// or prop casts one, and no figure draws its contact shadow (frame.mjs).
const isRGB = (v, n) => Array.isArray(v) && v.length === n && v.every(c => Number.isFinite(c) && c >= 0 && c <= 255);
const GRADE_OK = { sl: v => Array.isArray(v) && v.length === 4 && isRGB(v.slice(0, 3), 3) && v[3] >= 0 && v[3] <= 1, mul: v => isRGB(v, 3), vig: v => Number.isFinite(v) && v >= 0 && v <= 1, con: v => Number.isFinite(v) && v >= 1 };
function declareTimes(id, times, skies) {
  const names = Object.keys(times);
  if (!names.length) throw new Error(`set ${id}: times: declare at least one time, or leave times out for Earth's eight`);
  for (const name of names) {
    const sp = times[name], bad = msg => { throw new Error(`set ${id}: times.${name}: ${msg}`); };
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) bad('must be an object { grade, sun, haze }');
    for (const k of Object.keys(sp)) if (!['grade', 'sun', 'haze'].includes(k)) bad(`unknown field "${k}" (grade, sun, haze)`);
    if (SKY_TIMES.includes(name)) { if (Object.keys(sp).length) bad(`"${name}" is one of Earth's times: its light is the engine's (give yours a name of its own)`); continue; }
    if (typeof skies?.[name] !== 'function') bad(`no sky painter (give the kit skies.${name}: (ctx, rnd, w, h) => …)`);
    const { grade: g, sun, haze } = sp;
    if (!(g == null || g === 'neutral' || SKY_TIMES.includes(g) || (g && typeof g === 'object' && !Array.isArray(g) && Object.entries(g).every(([k, v]) => Object.hasOwn(GRADE_OK, k) && GRADE_OK[k](v)))))
      bad(`grade must be 'neutral', one of ${SKY_TIMES.join(', ')}, or { sl: [r, g, b, a], mul: [r, g, b], vig, con }`);
    if (!(sun == null || sun === false || SKY_TIMES.includes(sun) || (sun && typeof sun === 'object' && Number.isFinite(sun.len) && sun.len >= 0 && Number.isFinite(sun.a) && sun.a >= 0 && sun.a <= 1)))
      bad(`sun must be null (no sun), one of ${SKY_TIMES.join(', ')}, or { len, a } (len ≥ 0, a 0..1)`);
    if (!(haze == null || isRGB(haze, 3))) bad('haze must be [r, g, b] (0..255)');
    const by = timeClash(name, sp);
    if (by) bad(`"${name}" is already declared with another light by set ${by} (a time's name means one light in a film)`);
  }
  return names;
}

// ───────────── the set ─────────────
export function makeSet(def) {
  const { id, W, H, refX, refY } = def;
  const area = { x0: 0, x1: W, y0: 0, y1: H, ...(def.area || {}) };
  const view = { x0: area.x0, x1: area.x1, y0: area.y0, y1: area.y1, ...(def.view || {}) };
  const light = def.light || [-0.6, -0.75];
  const seed = (def.seed || 0) * 7919;
  const walk = { region: null, ground: null, band: 0, water: [], stones: [], paths: [], cell: 8, hop: 26, ...(def.walk || {}) };
  const ridge = typeof walk.ground === 'function';
  const props = (def.props || []).map(p => {
    const y = p.y ?? p.solid?.y;
    return { ...p, y, solid: p.solid ? { id: p.id, x: p.solid.x ?? p.x, y: p.solid.y ?? y, rx: p.solid.rx, ry: p.solid.ry } : null };
  });
  const propById = Object.fromEntries(props.map(p => [p.id, p]));
  const anchorDefs = { ...def.anchors };
  for (const p of props) for (const [k, a] of Object.entries(p.anchors || {})) anchorDefs[k] = { prop: p.id, ...a };
  const stones = walk.stones.map(sid => { const p = propById[sid]; if (!p?.top) throw new Error(`set ${id}: stone "${sid}" needs a prop with a top ellipse`); return { id: sid, ...p.top }; });
  const water = walk.water.map(P => ({ P, box: polyBox(P) }));
  const paths = walk.paths.map(p => ({ ...p, box: polyBox(p.poly) }));

  // Ridge sets walk a band below the crest line ground(x).
  let region = walk.region;
  if (ridge && !region) {
    const [x0, x1] = walk.range || [area.x0, area.x1], band = Math.max(walk.band, 8);
    region = bandPoly(x0, x1, x => walk.ground(x) - 3, x => walk.ground(x) + band + 3, 12);
  }
  const regionBox = region ? polyBox(region) : { ...area };
  const times = def.times ? declareTimes(id, def.times, def.skies) : null;     // the kit's own times, or Earth's
  if (times && def.defaultSky && !times.includes(def.defaultSky)) throw new Error(`set ${id}: defaultSky "${def.defaultSky}" is not one of its times (${times.join(', ')})`);
  if (def.groundShadows !== undefined && typeof def.groundShadows !== 'boolean') throw new Error(`set ${id}: groundShadows must be true or false (false: no ground to shade, so no figure, flier or prop throws a shadow)`);
  const fd = def.field?.density ?? 1;
  if (def.field != null && !(typeof def.field === 'object' && !Array.isArray(def.field) && Number.isFinite(fd) && fd >= 0)) throw new Error(`set ${id}: field must be { density } (density ≥ 0, 1 the usual count of specks; 0 or no field: none)`);
  const field = def.field && fd > 0 ? { density: fd } : null;

  const S = {
    id, def, W, H, refX, refY, area, view, bounds: { ...view }, light, walk,
    horizon: def.horizon, laneY: def.laneY, baseS: def.baseS,
    ambience: { day: null, night: null, ...(def.ambience || {}) },
    skyNames: times ? times.slice() : Object.keys(def.skies || {}).length ? Object.keys(def.skies) : SKY_TIMES.slice(),
    defaultSky: def.defaultSky || (times ? times[0] : 'morning'),
    props, stones, region, ridge, built: false, L: [],
    lens: def.lens ?? LENS, field,
  };

  // ── perspective and ground ──
  S.groundAt = x => (ridge ? walk.ground(x) : null);
  S.scaleAt = (x, y) => {
    if (def.scaleAt) return def.scaleAt(x, y);
    if (ridge) return def.baseS * (1 + (y - walk.ground(x)) * (def.bandScale ?? 0.0025));
    return Math.max(0.05, (def.baseS * (y - def.horizon)) / (def.laneY - def.horizon));
  };
  S.laneAt = x => (def.lane ? def.lane(x) : ridge ? walk.ground(x) + walk.band * 0.5 : def.laneY);

  // ── walkable ground ──
  const stoneAt = (x, y, grow = 0) => { for (let i = 0; i < stones.length; i++) { const s = stones[i]; if (inEllipse(s, x, y, grow, grow * 0.5)) return i; } return -1; };
  S.onStone = (x, y) => stoneAt(x, y) >= 0;
  S.inWater = (x, y) => water.some(w => x >= w.box.x0 && x <= w.box.x1 && y >= w.box.y0 && y <= w.box.y1 && pointInPoly(w.P, x, y));
  const inRegion = (x, y) => (region ? pointInPoly(region, x, y) : x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1);
  const inSolid = (x, y, gx = 0, gy = 0) => props.some(p => p.solid && inEllipse(p.solid, x, y, gx, gy));
  S.inSolid = (x, y) => inSolid(x, y);
  S.isWalkable = (x, y) => {
    if (stoneAt(x, y) >= 0) return true;
    if (!inRegion(x, y) || S.inWater(x, y)) return false;
    return !inSolid(x, y);
  };
  S.surfaceAt = (x, y) => {
    if (stoneAt(x, y) >= 0) return 'stone';
    if (S.inWater(x, y)) return 'water';
    for (const p of paths) if (x >= p.box.x0 && x <= p.box.x1 && y >= p.box.y0 && y <= p.box.y1 && pointInPoly(p.poly, x, y)) return p.surface || 'dirt';
    return def.surface || 'grass';
  };
  S.colliders = () => props.filter(p => p.solid).map(p => ({ ...p.solid }));

  // ── anchors ──
  S.anchorNames = Object.keys(anchorDefs);
  S.anchor = name => {
    const a = anchorDefs[name];
    if (!a) throw new Error(`set ${id}: no anchor "${name}" (have: ${S.anchorNames.join(', ')})`);
    const type = a.type || 'ground', prop = a.prop ? propById[a.prop] : null, out = {};
    let x = a.x, y = a.y;
    if (type === 'perch') {
      const b = a.branch, n = b.pts.length - 1, xs = b.pts.map(p => p[0]);
      x = a.x ?? lerp(b.pts[0][0], b.pts[n][0], a.at ?? 0.5); y = branchTop(b, x);
      Object.assign(out, { branch: b, range: [Math.min(...xs), Math.max(...xs)], topAt: px => branchTop(b, px) });
    }
    if (y == null && ridge) y = walk.ground(x);
    if (y == null) y = S.laneAt(x);
    const depth = a.depth ?? (type === 'ground' ? y : prop ? (prop.base ?? prop.y) + 1 : y);
    const s = a.s ?? S.scaleAt(x, type === 'ground' ? y : depth);
    return { name, x, y, s, type, depth, ...(a.clip ? { clip: a.clip } : {}), ...(a.prop ? { prop: a.prop } : {}), ...(a.face ? { face: a.face } : {}), ...(a.k != null ? { k: a.k } : {}), ...(a.z ? { z: a.z } : {}), surface: a.surface || (type === 'ground' ? S.surfaceAt(x, y) : type === 'perch' ? 'wood' : 'stone'), ...out };
  };
  S.anchors = () => S.anchorNames.map(S.anchor);

  // ── routing: a walkability grid + A*, then string-pulled; stepping stones become hop waypoints ──
  const grids = new Map();
  const C = walk.cell;
  const gbox = { ...regionBox };
  for (const s of stones) { gbox.x0 = Math.min(gbox.x0, s.x - s.rx - 40); gbox.x1 = Math.max(gbox.x1, s.x + s.rx + 40); gbox.y0 = Math.min(gbox.y0, s.y - s.ry - 40); gbox.y1 = Math.max(gbox.y1, s.y + s.ry + 40); }
  const NX = Math.ceil((gbox.x1 - gbox.x0) / C), NY = Math.ceil((gbox.y1 - gbox.y0) / C);
  const cellOf = (x, y) => { const i = Math.floor((x - gbox.x0) / C), j = Math.floor((y - gbox.y0) / C); return i < 0 || j < 0 || i >= NX || j >= NY ? -1 : j * NX + i; };
  const cx = k => gbox.x0 + ((k % NX) + 0.5) * C, cy = k => gbox.y0 + (Math.floor(k / NX) + 0.5) * C;
  function grid(mx, my) {
    const key = `${mx}|${my}`; if (grids.has(key)) return grids.get(key);
    const G = new Uint8Array(NX * NY), SO = new Int16Array(NX * NY).fill(-1);
    for (let k = 0; k < NX * NY; k++) {
      const x = cx(k), y = cy(k), si = stoneAt(x, y);
      if (si >= 0) { G[k] = 2; SO[k] = si; continue; }
      if (!inRegion(x, y) || inSolid(x, y, mx, my)) continue;
      if (S.inWater(x, y)) { if (stoneAt(x, y, walk.hop) >= 0) G[k] = 3; continue; }
      G[k] = 1;
    }
    const g = { G, SO }; grids.set(key, g); return g;
  }
  const dryOK = (x, y, mx, my) => inRegion(x, y) && !S.inWater(x, y) && !inSolid(x, y, mx, my);
  const clear = (a, b, mx, my) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 3));
    for (let i = 0; i <= n; i++) if (!dryOK(lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n), mx, my)) return false;
    return true;
  };
  const nearestCell = (G, x, y) => {
    const k0 = cellOf(clamp(x, gbox.x0, gbox.x1 - 1e-3), clamp(y, gbox.y0, gbox.y1 - 1e-3)), i0 = k0 % NX, j0 = Math.floor(k0 / NX);
    if (G[k0] === 1 || G[k0] === 2) return k0;
    let best = -1, bd = Infinity;
    for (let R = 1; R < Math.max(NX, NY); R++) {
      for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== R || i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const k = j * NX + i; if (G[k] !== 1 && G[k] !== 2) continue;
        const d = Math.hypot(cx(k) - x, cy(k) - y); if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0 && bd < (R - 1) * C) break;
    }
    return best;
  };
  function astar(G, s, t) {
    const N = NX * NY, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const tx = cx(t), ty = cy(t), h = k => Math.hypot(cx(k) - tx, cy(k) - ty);
    const heap = [], push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] < f || (heap[p][0] === f && heap[p][1] <= k)) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; const lt = (a, b) => heap[a][0] < heap[b][0] || (heap[a][0] === heap[b][0] && heap[a][1] < heap[b][1]); if (l < heap.length && lt(l, m)) m = l; if (r < heap.length && lt(r, m)) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[s] = 0; push(h(s), s);
    let best = s, bh = h(s);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
      const hk = h(k); if (hk < bh && G[k] !== 3) { bh = hk; best = k; }
      if (k === t) break;
      const i = k % NX, j = Math.floor(k / NX);
      for (const [di, dj, w] of D) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue;
        const n = jj * NX + ii, gn = G[n]; if (!gn || closed[n]) continue;
        if (di && dj && (!G[j * NX + ii] || !G[jj * NX + i])) continue;   // no corner cutting
        const cost = C * w * (gn === 3 ? 5 : gn === 2 ? 1.6 : 1), ng = g[k] + cost;
        if (ng < g[n]) { g[n] = ng; from[n] = k; push(ng + h(n), n); }
      }
    }
    const end = closed[t] ? t : best, cells = [];
    for (let k = end; k >= 0; k = from[k]) cells.push(k);
    return { cells: cells.reverse(), reached: end === t };
  }
  S.route = (from, to, { rx = 26, ry = 9 } = {}) => {
    if (typeof from === 'string') { const a = S.anchor(from); from = [a.x, a.y]; }
    if (typeof to === 'string') { const a = S.anchor(to); to = [a.x, a.y]; }
    const A = pt(from), B = pt(to), { G, SO } = grid(rx, ry);
    const ks = nearestCell(G, A[0], A[1]), kt = nearestCell(G, B[0], B[1]);
    if (ks < 0 || kt < 0) return Object.assign([], { stones: [], blocked: true, length: 0 });
    const okEnd = (p, k) => (G[k] === 2 ? stoneAt(p[0], p[1]) === SO[k] : dryOK(p[0], p[1], rx, ry));
    const start = okEnd(A, ks) ? A : G[ks] === 2 ? [stones[SO[ks]].x, stones[SO[ks]].y] : [cx(ks), cy(ks)];
    const { cells, reached } = astar(G, ks, kt);
    const goal = reached && okEnd(B, kt) ? B : G[cells[cells.length - 1]] === 2 ? [stones[SO[cells[cells.length - 1]]].x, stones[SO[cells[cells.length - 1]]].y] : [cx(cells[cells.length - 1]), cy(cells[cells.length - 1])];
    // key points: dry cells (smoothable), stone tops (fixed), takeoff/landing cells (fixed)
    const items = [{ p: start, fixed: true, stone: G[ks] === 2 ? SO[ks] : -1 }];
    let prev = G[ks], last = G[ks] === 2 ? SO[ks] : -1;
    for (let i = 1; i < cells.length - 1; i++) {
      const k = cells[i], t = G[k];
      if ((t === 2 || t === 3) && prev === 1) items[items.length - 1].fixed = true;
      if (t === 2) { if (SO[k] !== last) { const s = stones[SO[k]]; items.push({ p: [s.x, s.y], fixed: true, stone: SO[k] }); last = SO[k]; } }
      else if (t === 1) { items.push({ p: [cx(k), cy(k)], fixed: prev !== 1, stone: -1 }); last = -1; }
      prev = t;
    }
    const kEnd = cells[cells.length - 1];
    if (G[kEnd] === 2 && SO[kEnd] !== last && (items.length > 1 || SO[kEnd] !== items[0].stone)) { items.push({ p: [stones[SO[kEnd]].x, stones[SO[kEnd]].y], fixed: true, stone: SO[kEnd] }); }
    if ((G[kEnd] === 2 || prev === 3) && G[kEnd] !== 2 && items.length) items[items.length - 1].fixed = true;
    const endItem = { p: goal, fixed: true, stone: G[kEnd] === 2 ? SO[kEnd] : -1 };
    if (!(endItem.stone >= 0 && items[items.length - 1].stone === endItem.stone)) items.push(endItem);
    else items[items.length - 1] = endItem;
    // string pulling over dry stretches
    const out = [items[0]];
    for (let i = 0; i < items.length - 1;) {
      let j = i + 1;
      if (items[i].stone < 0) for (let k = i + 1; k < items.length; k++) {
        if (items[k].stone >= 0) { if (k === i + 1) j = k; break; }
        if (clear(items[i].p, items[k].p, rx * 0.5, ry * 0.5)) j = k; else if (k > i + 1) break;
        if (items[k].fixed) break;
      }
      out.push(items[j]); i = j;
    }
    const P = out.map(o => [o.p[0], o.p[1]]);
    const dedup = P.filter((p, i) => i === 0 || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 0.5);
    const st = []; out.forEach((o, i) => { if (o.stone >= 0) st.push(i); });
    let len = 0; for (let i = 1; i < dedup.length; i++) len += Math.hypot(dedup[i][0] - dedup[i - 1][0], dedup[i][1] - dedup[i - 1][1]);
    return Object.assign(dedup, { stones: dedup.length === P.length ? st : st.filter(i => i < dedup.length), blocked: !reached, len });
  };
  S.nearestWalkable = (x, y, { rx = 0, ry = 0 } = {}) => {
    if (S.isWalkable(x, y) && !inSolid(x, y, rx, ry)) return [x, y];
    const { G, SO } = grid(rx, ry), k = nearestCell(G, x, y);
    if (k < 0) return null;
    return G[k] === 2 ? [stones[SO[k]].x, stones[SO[k]].y] : [cx(k), cy(k)];
  };

  // ── painting ──
  const ext = k => {
    const cxs = [Math.min(view.x0, area.x1 - MAX_VIEW.w / 2), Math.max(view.x1, area.x0 + MAX_VIEW.w / 2)];
    const cys = [Math.min(view.y0, area.y1 - MAX_VIEW.h / 2), Math.max(view.y1, area.y0 + MAX_VIEW.h / 2)];
    const sx = Math.max(...cxs.map(c => Math.abs(c - refX))), sy = Math.max(...cys.map(c => Math.abs(c - refY))), m = Math.abs(1 - k);
    const mx = Math.ceil(sx * m) + 40, my = Math.ceil(sy * m * 0.4) + 40;
    return { x0: area.x0 - mx, x1: area.x1 + mx, y0: area.y0 - my, y1: area.y1 + my };
  };
  S.layerExtent = ext;                 // world rect painted for a layer with parallax factor k
  S.build = () => {
    if (S.built) return S;
    const groundIdx = def.layers.findIndex(l => l.k === 1 && !l.front);
    for (const [i, ly] of def.layers.entries()) {
      const E = ext(ly.k), res = ly.res ?? def.res ?? 1;
      const [c, x] = canvas(Math.ceil((E.x1 - E.x0) * res), Math.ceil((E.y1 - E.y0) * res));
      x.setTransform(res, 0, 0, res, -E.x0 * res, -E.y0 * res);
      ly.paint(x, rng(seed + 1000 + i * 77), S, E);
      if (i === groundIdx) for (const [j, p] of props.entries()) if (p.ground) { x.save(); p.ground(x, rng(seed + 9000 + j * 31), S); x.restore(); }
      let cc = c;
      if (ly.outline) cc = inkSilhouette(c, ly.outline.w * res, { color: ly.outline.color, light, alpha: ly.outline.alpha ?? 1 });
      // keep only the painted part of the layer (front layers and far-layer skies are mostly transparent)
      const T = alphaBox(cc), pad = 24;
      if (T) {
        const tx0 = Math.max(0, T.x0 - pad), ty0 = Math.max(0, T.y0 - pad), tx1 = Math.min(cc.width, T.x1 + 1 + pad), ty1 = Math.min(cc.height, T.y1 + 1 + pad);
        if ((tx1 - tx0) * (ty1 - ty0) < cc.width * cc.height * 0.9) {
          const [t, tc] = canvas(tx1 - tx0, ty1 - ty0); tc.drawImage(cc, -tx0, -ty0);
          cc = t; E.x0 += tx0 / res; E.y0 += ty0 / res; E.x1 = E.x0 + t.width / res; E.y1 = E.y0 + t.height / res;
        }
      }
      S.L.push({ ...ly, c: S.lineart ? lineart(cc, { res }) ?? cc : cc, E, res, blur: new Map() });
    }
    for (const [j, p] of props.entries()) {
      // paint into a generous canvas around the bounds hint, then trim to what was actually painted
      const [hx0, hy0, hx1, hy1] = p.bounds, gx = Math.max(400, (hx1 - hx0) * 0.8), gy = Math.max(300, (hy1 - hy0) * 0.4);
      const bx0 = hx0 - gx, by0 = hy0 - gy, res = p.res ?? def.propRes ?? 1, iw = (p.inkW ?? 2.2) * 2 + 2;
      const [c, x] = canvas(Math.ceil((hx1 - hx0 + 2 * gx) * res), Math.ceil((hy1 - hy0 + 2 * gy) * res));
      x.setTransform(res, 0, 0, res, -bx0 * res, -by0 * res);
      p.paint(x, rng(seed + 5000 + j * 131), S);
      const T = alphaBox(c), pad = Math.ceil(iw * res);
      p.clipped = T && (T.x0 === 0 || T.y0 === 0 || T.x1 === c.width - 1 || T.y1 === c.height - 1);
      const tx0 = T ? Math.max(0, T.x0 - pad) : 0, ty0 = T ? Math.max(0, T.y0 - pad) : 0, tx1 = T ? Math.min(c.width, T.x1 + 1 + pad) : 1, ty1 = T ? Math.min(c.height, T.y1 + 1 + pad) : 1;
      const [t, tc] = canvas(tx1 - tx0, ty1 - ty0); tc.drawImage(c, -tx0, -ty0);
      p.sx = bx0 + tx0 / res; p.sy = by0 + ty0 / res; p.sw = t.width / res; p.sh = t.height / res;
      p.sprite = inked(p, t, res);
      p.box = [p.sx, p.sy, p.sx + p.sw, p.sy + p.sh];
      p.res = res;
    }
    S.built = true;
    return S;
  };
  // A prop's painted canvas (its top-left at world p.sy) with its silhouette ink. inkFloor (world y): the ink fades out
  // over the INK_FADE units above it (grass at a trunk's foot).
  const inked = (p, c, res) => {
    const fade = p.inkFloor != null ? [(p.inkFloor - INK_FADE - p.sy) * res, (p.inkFloor - p.sy) * res] : null;
    // (line art: a sprite redrawn for a close framing keeps a finer outline, as a close-up's figures do)
    const iw = (p.inkW ?? 2.2) * (S.lineart && p.res ? Math.sqrt(res * p.res) : res);
    const s = p.inkW === 0 ? c : inkSilhouette(c, iw, { light, fade });
    return S.lineart ? lineart(s, { res }) ?? s : s;
  };
  // Props that may be framed close (closeRes: the sharpest sprite resolution they may need) get sharper sprites for
  // close framings, painted the first time one is drawn at such a scale (resTier) into the base sprite's box only
  // and kept, so only the props a film actually frames close pay for them. CLOSE_PX caps a big prop's resolution.
  // S.propSprite(prop | id, scale) → { c, x, y, w, h }: the sprite to draw at that screen scale and its world rect.
  S.propSprite = (p, scale = 1) => {
    if (!S.built) S.build();
    if (typeof p === 'string') p = propById[p];
    // (line art: every prop is redrawn for a close framing, its lines then as fine as a wide shot's, within a smaller
    // budget: turning a sprite into line art holds several copies of it)
    const max = S.lineart ? Math.min(p.closeRes ?? 3, Math.sqrt(CLOSE_PX / 4 / (p.sw * p.sh))) : Math.min(p.closeRes ?? 0, Math.sqrt(CLOSE_PX / (p.sw * p.sh))), res = resTier(p.res, max, scale);
    if (res === p.res) return { c: p.sprite, x: p.sx, y: p.sy, w: p.sw, h: p.sh };
    const tiers = p.tiers ??= new Map();
    if (!tiers.has(res)) {
      const [c, x] = canvas(Math.ceil(p.sw * res), Math.ceil(p.sh * res));
      x.setTransform(res, 0, 0, res, -p.sx * res, -p.sy * res);
      p.paint(x, rng(seed + 5000 + props.indexOf(p) * 131), S);
      tiers.set(res, { c: inked(p, c, res), x: p.sx, y: p.sy, w: c.width / res, h: c.height / res });
    }
    return tiers.get(res);
  };
  const drawProp = (ctx, p) => { const k = S.propSprite(p, scaleOf(ctx)); ctx.drawImage(k.c, k.x, k.y, k.w, k.h); };

  // ── drawing (world transform already set on ctx by the caller, except for the sky) ──
  const blurred = (ly, px) => {
    if (ly.blur.has(px)) return ly.blur.get(px);
    const [c, x] = canvas(ly.c.width, ly.c.height); x.filter = `blur(${px * ly.res}px)`; x.drawImage(ly.c, 0, 0); x.filter = 'none';
    ly.blur.set(px, c); return c;
  };
  const dofPx = (ly, dof) => {
    if (!dof) return 0;
    const d = dof === true ? 3 : dof;
    if (ly.k < 0.98) return Math.max(1, Math.round(d * clamp((1 - ly.k) * 3, 0.6, 2)));
    if (ly.front || ly.k > 1.02) return Math.max(1, Math.round(d * clamp((ly.k - 1) * 4, 0.8, 2.5)));
    return 0;
  };
  const hazeList = h => (!h ? [] : typeof h === 'string' ? [[h, 1]] : h);
  // the haze colour of a crossfade and the share of it that hazes (a time a kit declares without a haze has none)
  const hazeOf = name => { const d = declaredTime(name); return d ? d.haze : skyHaze(name).split(',').map(Number); };
  const mixHaze = hz => {
    let r = 0, g = 0, b = 0, n = 0, all = 0;
    for (const [name, a] of hz) { if (!(a > 0)) continue; all += a; const c = hazeOf(name); if (!c) continue; const [cr, cg, cb] = c; r += cr * a; g += cg * a; b += cb * a; n += a; }
    return n ? [r / n, g / n, b / n, n / all] : [255, 255, 255, all ? 0 : 1];
  };
  // A layer's paint times a colour (rgb 0..255; its alpha kept, exactly), blurred like the layer: cached per colour and blur.
  const shaded = (ly, rgb, px) => {
    const key = `${rgb}|${px}`, M = (ly.shaded ??= new Map());
    if (M.has(key)) return M.get(key);
    let c = M.get(`${rgb}|0`);
    if (!c) {
      const [t, x] = canvas(ly.c.width, ly.c.height); x.drawImage(ly.c, 0, 0);
      const im = x.getImageData(0, 0, t.width, t.height), d = im.data, [r, g, b] = rgb.map(v => v / 255);
      for (let i = 0; i < d.length; i += 4) { d[i] *= r; d[i + 1] *= g; d[i + 2] *= b; }
      x.putImageData(im, 0, 0); M.set(`${rgb}|0`, (c = t));
    }
    if (px) { const [t, x] = canvas(c.width, c.height); x.filter = `blur(${px * ly.res}px)`; x.drawImage(c, 0, 0); M.set(key, (c = t)); }
    return c;
  };
  const scratch = { c: null, x: null };
  const drawLayers = (ctx, cam, front, opts = {}) => {
    if (!S.built) S.build();
    const t = opts.t ?? 0, haze = hazeList(opts.haze), hazeK = opts.hazeAmount ?? 0.55;
    for (const ly of S.L) {
      if ((!!ly.front || ly.k > 1) !== front) continue;           // k > 1 layers are nearer than the ground: front
      if (opts.layers && !opts.layers(ly)) continue;              // (some only: the frame's depth sort draws a layer on its own)
      // depth (DESIGN §10): a camera moved through depth (cam.z) draws the layer (at z = D(1/k − 1)) scaled about the
      // frame centre by (D − z)/(D − k·z), the p of its depth, fading it out as the camera comes near it
      const kd = cam.z ? layerDepth(ly.k, cam.z, cam.lens ?? S.lens) : null;
      if (kd && kd.a <= 0) continue;
      // (line art: a layer drawn much larger than it was painted would show fat, soft lines; it fades out instead, from
      // 1.6× to 2.4×, leaving a close-up's figures on the white page as a colouring book draws them)
      const fadeLA = S.lineart ? 1 - clamp((scaleOf(ctx) * (kd?.r ?? 1) / ly.res - 1.6) / 0.8) : 1;
      if (fadeLA <= 0) continue;
      if (kd) { ctx.save(); ctx.translate(cam.cx, cam.cy); ctx.scale(kd.r, kd.r); ctx.translate(-cam.cx, -cam.cy); ctx.globalAlpha *= kd.a; }
      const alpha0 = ctx.globalAlpha; ctx.globalAlpha *= fadeLA;
      // (line art: no depth-of-field blur, haze or shade: the page has no atmosphere)
      const dx = (cam.cx - refX) * (1 - ly.k), dy = (cam.cy - refY) * (1 - ly.k) * 0.4, b = S.lineart ? 0 : dofPx(ly, opts.dof);
      const img = b ? blurred(ly, b) : ly.c, w = ly.c.width / ly.res, h = ly.c.height / ly.res;
      const hm = !front && ly.k < 1 && haze.length && !S.lineart ? mixHaze(haze) : null, hz = hm && hm[3] > 0 ? hm : null;
      // a shade (ly.shade(S) → { rgb, a } | null: a far range by night): the layer's own paint times rgb, crossfaded in
      // by a, so it never darkens what lies behind the layer and a blurred edge takes it like the rest
      const sh = S.lineart ? null : ly.shade?.(S), sa = sh ? clamp(sh.a ?? 0) : 0;
      if (hz || sa > 0.004) {
        const cw = ctx.canvas.width, ch = ctx.canvas.height;
        if (!scratch.c || scratch.c.width !== cw || scratch.c.height !== ch) [scratch.c, scratch.x] = canvas(cw, ch);
        const sx = scratch.x; sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'copy'; sx.globalAlpha = sa > 0.004 ? 1 - sa : 1;
        sx.setTransform(ctx.getTransform()); sx.drawImage(img, ly.E.x0 + dx, ly.E.y0 + dy, w, h);
        if (sa > 0.004) { sx.globalCompositeOperation = 'lighter'; sx.globalAlpha = sa; sx.drawImage(shaded(ly, sh.rgb, b), ly.E.x0 + dx, ly.E.y0 + dy, w, h); sx.globalAlpha = 1; }
        sx.setTransform(1, 0, 0, 1, 0, 0);
        if (hz) {
          // (the haze is shaded with the paint, as if laid on the layer before its shade)
          const hc = hz.slice(0, 3).map((v, i) => Math.round(v * (sa > 0.004 ? 1 - sa * (1 - sh.rgb[i] / 255) : 1)));
          sx.globalCompositeOperation = 'source-atop'; sx.fillStyle = `rgba(${hc.join(',')},${hazeK * (1 - ly.k) * (def.hazeScale ?? 1) * hz[3]})`; sx.fillRect(0, 0, cw, ch);
        }
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scratch.c, 0, 0); ctx.restore();
      } else ctx.drawImage(img, ly.E.x0 + dx, ly.E.y0 + dy, w, h);
      ctx.globalAlpha = alpha0;
      if (ly.anim && !S.lineart) { ctx.save(); ctx.translate(dx, dy); ly.anim(ctx, t, S, opts); ctx.restore(); }   // (line art: no shimmer)
      if (kd) ctx.restore();
    }
  };
  S.drawBack = (ctx, cam, opts) => drawLayers(ctx, cam, false, opts);
  S.drawFront = (ctx, cam, opts) => drawLayers(ctx, cam, true, opts);
  // The painted layers in drawing order with their depths, for the frame's depth sort (DESIGN §10; D: the lens): a
  // layer with parallax k is at z = D(1/k − 1) (k ≤ 0: at infinity); a front one (k > 1, or marked front) is never behind
  // the stage. The stage's own (k 1: its ground) is a floor, not a wall: it reaches back to the nearest backdrop (the
  // nearest layer with 0 < k < 1; none: to infinity), so what is between the stage and that backdrop shows over it.
  S.layerDepths = (D = S.lens) => {
    if (!S.built) S.build();
    const zOf = k => (k > 0 ? D * (1 / k - 1) : Infinity), isFront = ly => !!ly.front || ly.k > 1;
    const backdrop = Math.min(Infinity, ...S.L.filter(ly => !isFront(ly) && ly.k > 0 && ly.k < 1).map(ly => zOf(ly.k)));
    return S.L.map(ly => ({ ly, front: isFront(ly), z: isFront(ly) ? Math.min(0, zOf(ly.k)) : ly.k === 1 ? backdrop : zOf(ly.k) }));
  };
  // The near field (makeSet's `field`, DESIGN §10): specks of dust and stars at every depth, so a camera moving through
  // depth streams past them (the nearer, the faster and bigger, streaking with the move) while the sky stays put. It
  // shows only while the camera moves through depth (faded in with its speed, whole from FIELD_GO × the lens a second):
  // a camera that holds, pans or zooms its lens sees none of it, so no speck ever sits on a planet like a star. An
  // endless grid of cells (FIELD_CELL field units across, FIELD_CELLZ world px deep), a share of them (FIELD_SHARE × the
  // density) holding one speck at a hashed spot: every frame finds the same specks. A shot sees the field scaled about
  // its first camera (ref): world x, y = ref's centre + field units × the lens / ref's Z per 1080 px of frame (Z = zoom ×
  // (lens − depth): screen px per world px at unit distance), a speck's size with them, so a shot starts with the same
  // amount of it at any zoom and resolution, and it stays put in the world through the shot. Specks are seen out to
  // FIELD_REACH × the lens (fading in over its last 40%) and pass the lens as things do (passFade).
  // S.fieldSpecks(cam, ref, prev, W, H, dt) → [{ id, x, y, z, r, a, streak, draw(ctx) }], farther first: each speck's
  // screen point, radius and alpha, and its streak (screen px) from where the camera at `prev`, dt s before, saw it;
  // draw(ctx) paints it in screen space. None without a `prev` dt > 0 s before or with no move through depth since.
  S.fieldSpecks = (cam, ref, prev, W, H, dt) => {
    if (!field || !prev || !(dt > 0)) return [];
    const D = cam.lens ?? S.lens, v = clamp(Math.abs((cam.z || 0) - (prev.z || 0)) / (dt * FIELD_GO * D)), go = v * v * (3 - 2 * v);
    if (!(go > 0)) return [];
    const k = H / 1080, q = Math.min(1, FIELD_SHARE * field.density), g = (ref.zoom * (D - (ref.z || 0))) / (D * k);
    // a camera's view of the field: the field point (X, Y) at depth z is at W/2 + (X − X0)·G/d, d = D + z − its depth
    const view = c => ({ c: c.z || 0, G: (c.zoom * (D - (c.z || 0))) / g, X0: (c.cx - ref.cx) * g, Y0: (c.cy - ref.cy) * g });
    const V = view(cam), P = view(prev), dMin = PASS * D, dMax = FIELD_REACH * D, out = [];
    const at = (v, X, Y, d) => [W / 2 + ((X - v.X0) * v.G) / d, H / 2 + ((Y - v.Y0) * v.G) / d];
    for (let iz = Math.floor((V.c - D + dMin) / FIELD_CELLZ); iz * FIELD_CELLZ < V.c - D + dMax; iz++) {
      // the cells of this slab the frame may show (with room for a streak coming in from outside it)
      const dF = Math.min(dMax, D + (iz + 1) * FIELD_CELLZ - V.c), m = 0.3 * W + 3 * k;
      const hx = ((W / 2 + m) * dF) / V.G, hy = ((H / 2 + m) * dF) / V.G;
      for (let iy = Math.floor((V.Y0 - hy) / FIELD_CELL); iy * FIELD_CELL < V.Y0 + hy; iy++) for (let ix = Math.floor((V.X0 - hx) / FIELD_CELL); ix * FIELD_CELL < V.X0 + hx; ix++) {
        const h = cellHash(ix, iy, iz, seed);
        if (h / 4294967296 >= q) continue;
        const r = rng(h ^ 0x5bd1e995), X = (ix + r()) * FIELD_CELL, Y = (iy + r()) * FIELD_CELL, z = (iz + r()) * FIELD_CELLZ, d = D + z - V.c;
        const r0 = 0.6 + 1.8 * r() ** 3, a0 = 0.55 + 0.45 * r(), col = SPECKS[Math.floor(r() * SPECKS.length)];
        if (d < dMin || d > dMax) continue;
        // its size (a speck is a speck: drawn 0.6 to 3 px across per 1080, one under that dimmed by its area), its fade in
        // from far away and out at the lens, and the camera's speed
        const [x, y] = at(V, X, Y, d), rad = (r0 * V.G) / d, rd = clamp(rad, 0.6 * k, 3 * k), u = clamp((dMax - d) / (0.4 * dMax));
        const a = go * a0 * u * u * (3 - 2 * u) * passFade(d, D) * Math.min(1, (rad / (0.6 * k)) ** 2);
        // the streak: from where it was a moment before (none when it was at the lens then), at most 0.3 of the frame
        const dp = D + z - P.c, [px, py] = dp > dMin ? at(P, X, Y, dp) : [x, y], L = Math.hypot(x - px, y - py), Lc = Math.min(L, 0.3 * W);
        const x0 = L > Lc ? x - ((x - px) * Lc) / L : px, y0 = L > Lc ? y - ((y - py) * Lc) / L : py, e = rd;
        if (a < 0.01 || Math.max(x, x0) < -e || Math.min(x, x0) > W + e || Math.max(y, y0) < -e || Math.min(y, y0) > H + e) continue;
        out.push({ id: `${ix},${iy},${iz}`, x, y, z, r: rad, a, streak: Lc, draw: c => {
          // a round dab, or a streak when it moves (its light spread along it)
          c.strokeStyle = `rgba(${col},${(a * Math.sqrt((2 * rd) / (2 * rd + Lc))).toFixed(3)})`; c.lineWidth = 2 * rd; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x + (Lc > 0.01 ? 0 : 0.01), y); c.stroke();
        } });
      }
    }
    return out.sort((A, B) => B.z - A.z);
  };
  S.propsSorted = () => {
    if (!S.built) S.build();
    return props.map(p => ({ y: p.y, id: p.id, kind: 'prop', solid: p.solid, bounds: p.bounds, draw: ctx => drawProp(ctx, p) })).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
  };

  // ── sky: screen space, slow drift; a list of [name, weight] crossfades ──
  const side = light[0] < 0 ? -1 : 1;
  S.skyCanvases = name => {
    if (times && !times.includes(name)) name = S.defaultSky;       // a kit with its own times shows its default for any other
    const custom = def.skies?.[name];
    if (typeof custom === 'function') {
      if (!S._sky) S._sky = new Map();
      if (!S._sky.has(name)) { const [b, bx] = canvas(SKY_W, SKY_H); custom(bx, rng(seed + 500 + name.length), SKY_W, SKY_H, S); const [c] = canvas(8, 8); S._sky.set(name, { back: b, clouds: c }); }
      return S._sky.get(name);
    }
    const known = SKY_TIMES.includes(name) ? name : S.defaultSky;
    return skyCanvases(known, { side, moonSide: def.moonSide ?? side, tint: def.skyTint || null });
  };
  S.drawSky = (ctx, cam, sky, t = 0) => {
    const list = !sky ? [[S.defaultSky, 1]] : typeof sky === 'string' ? [[sky, 1]] : sky;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (S.lineart) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.restore(); return; }   // (line art: the sky is the paper)
    const zoom = cam.zoom ?? cam.s ?? 1;
    const s = Math.max(cw / 1920, ch / 1080) * (1 + clamp(zoom - 1, -0.4, 3) * 0.04), w = SKY_W * s, h = SKY_H * s;
    const mx = (w - cw) / 2, my = (h - ch) / 2;
    const ox = clamp((cam.cx - refX) * 0.05 * s, -mx, mx), oy = clamp((cam.cy - refY) * 0.06 * s, -my, my);
    const x0 = (cw - w) / 2 - ox, y0 = (ch - h) / 2 - oy;
    const drift = ((((t * (def.cloudSpeed ?? 5) + (cam.cx - refX) * 0.07) * s) % w) + w) % w;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    let acc = 0;
    for (const [name, a] of list) {
      if (!(a > 0)) continue; acc += a;
      const k = S.skyCanvases(name);
      ctx.globalAlpha = a / acc;
      ctx.drawImage(k.back, x0, y0, w, h);
      ctx.drawImage(k.clouds, x0 - drift, y0, w, h); ctx.drawImage(k.clouds, x0 - drift + w, y0, w, h);
    }
    ctx.restore();
  };

  S.clampCamera = (cam, Wf = 1920, Hf = 1080) => clampCamera(S, cam, Wf, Hf);
  for (const n of times || []) if (!SKY_TIMES.includes(n)) declareTime(n, def.times[n], id);   // the set is whole: its times are the film's
  return S;
}
