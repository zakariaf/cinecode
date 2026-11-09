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
//                        eased rise (1.5 s) into full: brighter, longer tails, glow on the mist and clouds, more stars.
//                        During a time-lapse beat in the same scene the memory comet dims and slides to the faint place.
//   overlay hill-mist    layer 'front'. Height fog: a world-space density field (height above the slope, an extent along
//                        the slope, drifting value noise) laid over everything already drawn, so layers, props and
//                        actors fog by where they are on the slope and figures walk into it and out of it; plus a band
//                        of painted wisps along its top. params: from / to (world x where the mist begins / ends, soft;
//                        default 1500 / 2000 = the upper slope, crest clear; 4000 = over the crest, only the stone's tip
//                        above it, the default when `part` is given), top (height of the mist above the ground, world
//                        px), part (a mark: from it the field is displaced radially outward from the standing stone and
//                        clears). Close up it thins into drifting wisps so faces stay readable.
//   overlay stone-light  layer 'grade'. The gold sliver of the last sunlight on the standing stone (prop standing_stone,
//                        anchor stone_top): the stone's own paint lit gold above a shadow line that climbs as
//                        params.dayT goes from its first to its second value across the scene; params.out = a mark:
//                        the light reaches exactly 0 on that mark and never before. Hidden by actors and mist in front.
//   custom timelapse     layer 'grade' (shot 1.6). Days and nights over the land and sky, slow at first, then averaged
//                        into a smooth drifting colour (at most 3 full-frame brightness changes a second); season tints
//                        on the grass about once a second; eight ghosts of Nell in her green scarf at the stone.
// Heavy fields (comet body, mist, masks) are painted at half resolution and scaled up. Everything is seeded.
import { rng, clamp, lerp, smooth, easeInOut, canvas, blob } from '../../../engine/core/lib.mjs';
import { paper } from '../../../engine/paint/atmos.mjs';
import { getRig } from '../../../engine/cast/index.mjs';

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
  const { cam, W, H } = api, z = cam.zoom, sx = (a.x - cam.cx) * z + W / 2, sy = (a.y - cam.cy) * z + H / 2;
  x.save();
  if (a.squash != null && a.squash !== 1) { x.translate(sx, sy); x.scale(a.squash, 1); x.translate(-sx, -sy); }
  x.globalAlpha = clamp(a.alpha ?? 1);
  a.R.draw(x, sx, sy + (a.sink || 0) * z, a.s * z, a.face, { ...a.st, shadow: false });
  x.restore();
}
const worldT = (x, api, k) => { const { cam, W, H } = api, z = cam.zoom; x.setTransform(z * k, 0, 0, z * k, (W / 2 - cam.cx * z) * k, (H / 2 - cam.cy * z) * k); };

// What stands in front of the sky at this frame, as alpha, at resolution k: back layers, props, actors, front layers.
// One per frame (overlays on the same frame share it).
const COVER = { key: null };
export function coverMask(api, k = 0.5) {
  const key = `${api.shot?.id}|${api.t}|${api.W}x${api.H}|${k}`;
  if (COVER.key === key) return COVER.c;
  const w = Math.ceil(api.W * k), h = Math.ceil(api.H * k), [c, x] = scratch('cover', w, h), S = api.set;
  worldT(x, api, k);
  S.drawBack(x, api.cam, { t: api.t });
  for (const p of S.propsSorted()) p.draw(x);
  x.setTransform(k, 0, 0, k, 0, 0);
  for (const a of actorsOf(api)) drawActor(x, a, api);
  worldT(x, api, k);
  S.drawFront(x, api.cam, { t: api.t });
  COVER.key = key; COVER.c = c;
  return c;
}
// The set's cloud layer at this frame (as set.drawSky draws it), as alpha at resolution k.
const CLOUD = { key: null };
function cloudMask(api, k = 0.5) {
  const key = `${api.shot?.id}|${api.t}|${api.W}x${api.H}|${k}`;
  if (CLOUD.key === key) return CLOUD.c;
  const w = Math.ceil(api.W * k), h = Math.ceil(api.H * k), [c, x] = scratch('clouds', w, h), S = api.set;
  const sky = api.shot.skyAt ? api.shot.skyAt(api.t) : null, list = !sky ? [[S.defaultSky, 1]] : typeof sky === 'string' ? [[sky, 1]] : sky;
  const F = skyFrame(api), drift = ((((api.t * (S.def?.cloudSpeed ?? 5) + (api.cam.cx - S.refX) * 0.07) * F.s) % F.w) + F.w) % F.w;
  x.setTransform(k, 0, 0, k, 0, 0);
  let acc = 0;
  for (const [name, a] of list) {
    if (!(a > 0)) continue; acc += a;
    const cl = S.skyCanvases(name).clouds; x.globalAlpha = a / acc;
    x.drawImage(cl, F.x0 - drift, F.y0, F.w, F.h); x.drawImage(cl, F.x0 - drift + F.w, F.y0, F.w, F.h);
  }
  CLOUD.key = key; CLOUD.c = c;
  return c;
}

// ───────────── the mist ─────────────
export const MIST = { from: 1500, to: 2000, top: 250, edge: 260, drift: 7, color: [236, 238, 247], thin: [196, 204, 228], alpha: 0.84, veil: 0.2 };
const PART = { R: 1700, dur: 3, push: 0.4, fade: [0.3, 3.4], keep: 0.2 };
// The mist's parameters for a scene: its hill-mist overlay params with the defaults, and the parting time.
export function mistParams(api, params) {
  // mist that parts from the stone must reach it: with `part` and no `to`, the bank lies over the crest
  const p = { ...MIST, ...(params?.part != null && params.to == null ? { to: 4000 } : {}), ...(params || {}) };
  p.partT = typeof p.part === 'string' ? api.marks?.[p.part] ?? null : Number.isFinite(p.part) ? api.scene.t0 + p.part : null;
  return p;
}
const mistOverlay = api => (api.plan.overlays || []).find(o => o.scene === sceneOf(api) && o.name === 'hill-mist');
// The stone the mist parts from (world): the standing stone's middle, or the set's centre.
function stoneCentre(S) {
  const p = S.props?.find(q => q.id === 'standing_stone');
  if (p?.bounds) return [(p.bounds[0] + p.bounds[2]) / 2, (p.bounds[1] + p.bounds[3]) / 2];
  return [S.refX, S.refY];
}
// Soft steps: the mist is painted in three washes (like the cel-shaded clouds), not airbrushed.
const step = (v, th, e = 0.06) => smooth(th - e, th + e, v);
export const washes = (v, e = 0.06) => 0.42 * step(v, 0.1, e) + 0.32 * step(v, 0.4, e) + 0.26 * step(v, 0.7, e);
// Close up, the washes soften (the mist is near the lens and out of focus) and less of it stands between the camera and
// what it looks at: its opacity falls with the zoom.
export const mistLens = z => ({ e: clamp(0.06 * Math.max(1, z / 1.4) ** 0.8, 0.06, 0.2), a: clamp(1.15 - 0.08 * z, 0.32, 1), wisp: clamp((z - 1.8) / 4, 0, 0.6) });
/**
 * Mist density (0..1, before the washes) at world (x, y) and film time t: a bank lying on the slope from p.from to
 * p.to, `top` world px deep with a billowing top, thinning on the near face of the slope, drifting; plus a faint veil
 * further down the slope. After p.partT the field is pushed radially out from the stone (the opening grows, eased)
 * and thins. → { bank, veil }
 */
const NONE = Object.freeze({ bank: 0, veil: 0 });
export function mistDensity(S, p, t, seed = 7) {
  const n = fbm(seed), m = fbm(seed + 11), O = stoneCentre(S), g = x => S.groundAt(x) ?? S.laneY ?? 1000;
  const tp = p.partT != null ? t - p.partT : -1, R = tp > 0 ? PART.R * easeInOut(tp / PART.dur) : 0;
  // the pushed mist thins as it spreads, down to a faint remnant at the edges
  const thin = tp > 0 ? 1 - (1 - PART.keep) * smooth(PART.fade[0], PART.fade[1], tp) : 1, drift = t * p.drift;
  return (wx, wy) => {
    let x = wx, y = wy, k = thin;
    if (R > 0) {
      const dx = wx - O[0], dy = (wy - O[1]) * 1.6, d = Math.hypot(dx, dy) || 1e-6;
      // the field that was at d - push now shows at d: the opening grows from the stone and its mist moves outward
      const src = Math.max(0, d - R * PART.push), f = src / d;
      x = O[0] + dx * f; y = O[1] + (dy * f) / 1.6;
      k *= smooth(R * 0.7, R * 1.0, d) * (1 + 0.15 * Math.exp(-(((d - R) / (R * 0.15)) ** 2)));
    }
    if (k <= 0.001) return NONE;
    const gy = g(x), hag = gy - y;
    if (hag > p.top * 1.45) return NONE;                               // well above any mist
    const nn = n((x + drift) / 230, y / 70);
    // pushed mist still hugs the ground where it lands
    if (R > 0) { const h2 = g(wx) - wy; k *= 1 - smooth(p.top * 0.6, p.top * 1.1, h2); if (k <= 0.001) return NONE; }
    const face = hag >= -40 ? 1 : Math.exp((hag + 40) / 70);          // the slope's near face: thinner toward us
    const along = smooth(p.from - p.edge, p.from + p.edge, x) * (1 - smooth(p.to - p.edge * 0.6, p.to + p.edge * 0.6, x));
    let bank = 0;
    if (along > 0.001) {
      // a billowing top: the bank is shallow where it begins down the slope, deep over the crest, lumpy and drifting
      // the ends of the bank break up into separate puffs instead of tapering to a straight wedge
      const xm = x + drift * 1.6, top = p.top * (0.3 + 0.7 * along ** 1.1) * (0.78 + 0.3 * m(xm / 260, 3.7) + 0.14 * n(xm / 95, 7.1) + 0.12 * n(xm / 34, y / 40 + 2.3));
      const v = hag >= 0 ? 1 - smooth(top * 0.72, top * 1.0, hag + (nn - 0.5) * top * 0.3) : 1;
      const puffs = smooth(0.12, 0.42, along + 0.55 * (m(xm / 120 + 5, y / 55) - 0.5));
      bank = clamp(v * face * puffs * k * (0.3 + 0.95 * nn));
    }
    const low = smooth(p.from - p.edge * 4, p.from, x) * (1 - smooth(p.to - p.edge * 0.6, p.to + p.edge * 0.6, x));
    const veil = low > 0.001 ? p.veil * low * face * k * (1 - smooth(0, p.top, hag)) * (0.6 + 0.8 * m(x / 500 + 9, y / 200)) : 0;
    return { bank, veil };
  };
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
  const { cam, W, H } = api, z = cam.zoom, lens = mistLens(z), wn = fbm(seed + 23), dr = api.t * p.drift * 2.2;
  let any = 0;
  for (let j = 0; j < gh; j++) {
    const wy = (j * cell - H / 2) / z + cam.cy;
    for (let i = 0; i < gw; i++) {
      const wx = (i * cell - W / 2) / z + cam.cx, d = D(wx, wy), wb = washes(d.bank, lens.e), o = (j * gw + i) * 4;
      // close up, the mist reads as drifting horizontal wisps with clear gaps rather than a milky sheet
      let v = clamp(wb + d.veil * (1 - wb)) * lens.a;
      if (lens.wisp > 0 && v > 0) v *= 1 - lens.wisp * (1 - smooth(0.3, 0.68, wn((wx + dr) / 95, wy / 16)));
      grid[j * gw + i] = v; any = Math.max(any, v);
      img.data[o] = lerp(T[0], C[0], wb); img.data[o + 1] = lerp(T[1], C[1], wb); img.data[o + 2] = lerp(T[2], C[2], wb); img.data[o + 3] = Math.round(255 * v * p.alpha);
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
  paper(mx, 0.16);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(mc, 0, 0, W, H);
  ctx.restore();
}

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
  // ion tail: straight streamers fanning a little above the dust tail, with knots drifting out
  for (let i = 0; i < 6; i++) {
    const d = -0.06 + (r() - 0.5) * 0.035, len = Li * (0.7 + r() * 0.3), w = i ? 12 + r() * 26 : 6, a = i ? 0.08 + r() * 0.1 : 0.22;
    x.save(); x.rotate(d);
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, rgbStr(mixRGB(ION, NUC, 0.5), a)); g.addColorStop(0.3, rgbStr(ION, a * 0.8)); g.addColorStop(0.7, rgbStr(ION, a * 0.3)); g.addColorStop(1, rgbStr(ION, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(0, -1.2); x.quadraticCurveTo(len * 0.5, -w * 0.32, len, -w / 2); x.lineTo(len, w / 2); x.quadraticCurveTo(len * 0.5, w * 0.32, 0, 1.2); x.closePath(); x.fill();
    x.restore();
  }
  for (let i = 0; i < 6; i++) {
    const r2 = rng(seed * 7 + i), f = (r2() + tq * (0.02 + r2() * 0.015)) % 1, px = f * Li, a = 0.2 * (1 - f) ** 1.3 * smooth(0, 0.06, f);
    x.save(); x.rotate(-0.06); x.translate(px, 0); x.scale(1, 0.18);
    const R = 40 + f * 90, g = x.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, rgbStr(ION, a)); g.addColorStop(1, rgbStr(ION, 0));
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
function drawStarsOn(x, api, F, k, B) {
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < STARS_ON.n; i++) {
    const a = smooth(0, STARS_ON.fade, api.t - starOnTime(i, api.scene)); if (a <= 0) continue;
    const r = rng(9100 + i), u = r() * 2400, v = r() ** 1.3 * 900, big = i < 24, al = a * (big ? 0.95 : 0.4 + r() * 0.5) / Math.max(0.2, B);
    const X = (F.x0 + u * F.s) * k, Y = (F.y0 + v * F.s) * k, rad = (big ? 1.5 : 0.55 + r() * 0.5) * k * 1.6;
    x.fillStyle = `rgba(255,250,232,${Math.min(1, al).toFixed(3)})`; x.beginPath(); x.arc(X, Y, rad, 0, TAU); x.fill();
    if (big) { const gr = x.createRadialGradient(X, Y, 0, X, Y, rad * 5); gr.addColorStop(0, `rgba(255,248,226,${(al * 0.35).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,248,226,0)'); x.fillStyle = gr; x.fillRect(X - rad * 5, Y - rad * 5, rad * 10, rad * 10); }
  }
  x.restore();
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
  const ca = Math.cos(COMET.ang), sa = Math.sin(COMET.ang), spot = (u, R, a) => {
    const lx = u * COMET.dust.len * P.L, ly = COMET.dust.curve[0] * 2.5 * lx * lx, X = (P.hx + (lx * ca - ly * sa) * P.s) * k, Y = (P.hy + (lx * sa + ly * ca) * P.s) * k, RR = R * P.s * k;
    const g = lf.createRadialGradient(X, Y, 0, X, Y, RR); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, `rgba(255,255,255,${a * 0.35})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    lf.fillStyle = g; lf.fillRect(X - RR, Y - RR, 2 * RR, 2 * RR);
  };
  spot(0, 760, 0.9); for (const u of [0.25, 0.5, 0.75]) spot(u, 420, 0.4 * (1 - u * 0.7));
  // clouds: the rim toward the comet plus a little of the body, hidden behind the land
  const cover = coverMask(api, k), [cc, cx] = scratch('cloud-lit', w, h), [sc, sx] = scratch('cloud-shift', w, h), cm = cloudMask(api, k);
  cx.drawImage(cm, 0, 0); cx.globalCompositeOperation = 'destination-out'; cx.drawImage(cover, 0, 0);
  sx.drawImage(cc, 0, 0);
  const dx = W / 2 - P.hx, dy = H / 2 - P.hy, dl = Math.hypot(dx, dy) || 1, d = 5;
  cx.globalAlpha = 0.85; cx.drawImage(sc, (dx / dl) * d, (dy / dl) * d);
  cx.globalAlpha = 1; cx.globalCompositeOperation = 'destination-in'; cx.drawImage(lc, 0, 0);
  cx.globalCompositeOperation = 'source-in'; cx.fillStyle = rgbStr(WARM); cx.fillRect(0, 0, w, h);
  Lx.globalAlpha = clamp(st.glow * st.B * 1.1); Lx.drawImage(cc, 0, 0);
  // the comet as key light: a warm wash on the land, strongest toward it
  if (st.key > 0.01) {
    const [kc, kx] = scratch('comet-key', w, h), R = Math.hypot(W, H) * 1.1 * k, X = P.hx * k, Y = P.hy * k;
    kx.drawImage(cover, 0, 0); kx.globalCompositeOperation = 'source-in';
    const g = kx.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, rgbStr(WARM, 1)); g.addColorStop(0.5, rgbStr(WARM, 0.45)); g.addColorStop(1, rgbStr(WARM, 0.12));
    kx.fillStyle = g; kx.fillRect(0, 0, w, h);
    Lx.globalAlpha = clamp(0.12 * st.key); Lx.drawImage(kc, 0, 0);
  }
  // mist: glows where it is thin, more toward the comet
  const mo = mistOverlay(api), Fm = mo && fogField(api, mo.params, mo.seed);
  if (Fm && Fm.any > 0.004) {
    const [gc, gx] = scratch('mist-glow', Fm.gw, Fm.gh), img = gx.createImageData(Fm.gw, Fm.gh), R = 1300 * P.s;
    for (let j = 0; j < Fm.gh; j++) for (let i = 0; i < Fm.gw; i++) {
      const v = Fm.grid[j * Fm.gw + i]; if (v < 0.003) continue;
      const px = i * Fm.cell, py = j * Fm.cell, near = Math.exp(-Math.hypot(px - P.hx, (py - P.hy) * 0.8) / R);
      const g = v ** 0.75 * (1.15 - 0.55 * v) * (0.45 + 0.75 * near), o = (j * Fm.gw + i) * 4;
      img.data[o] = WARM[0]; img.data[o + 1] = WARM[1] * (0.96 + 0.04 * near); img.data[o + 2] = WARM[2] * (0.9 + 0.1 * near); img.data[o + 3] = Math.round(255 * clamp(g));
    }
    gx.putImageData(img, 0, 0);
    Lx.globalAlpha = clamp(st.glow * 0.62); Lx.setTransform(k, 0, 0, k, 0, 0); stretch(Lx, { ...Fm, c: gc }, W, H); Lx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(Lc, 0, 0, W, H); ctx.restore();
}

function drawComet(ctx, api) {
  const st = cometState(api);
  if (st.B < 0.005) return;
  const { W, H, t } = api, F = skyFrame(api), k = 0.5, w = Math.ceil(W * k), h = Math.ceil(H * k);
  const story = api.shot.gradeAt ? api.shot.gradeAt(t)?.story : null, tone = toner(story, story ? 0.86 : 1);
  const P = { hx: F.x0 + st.pos[0] * F.s, hy: F.y0 + st.pos[1] * F.s, s: F.s, L: st.L, B: st.B, t, seed: 4242 };
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
  // hidden by what stands in front: land, props, actors (fully), clouds (mostly), mist (by its density)
  cx.globalCompositeOperation = 'destination-out';
  cx.globalAlpha = 1; cx.drawImage(coverMask(api, k), 0, 0);
  cx.globalAlpha = 0.72; cx.drawImage(cloudMask(api, k), 0, 0);
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
const SPRITE_TOP = new WeakMap();
// The top of a prop's painted silhouette (world y), from its sprite's alpha.
function spriteTop(p) {
  if (SPRITE_TOP.has(p)) return SPRITE_TOP.get(p);
  const c = p.sprite, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let row = 0;
  outer: for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (d[(j * c.width + i) * 4 + 3] > 140) { row = j; break outer; }
  const y = p.sy + (row * p.sh) / c.height; SPRITE_TOP.set(p, y); return y;
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
function drawStoneLight(ctx, api) {
  const L = stoneLightAt(api);
  if (L.lit <= 0) return;
  const S = api.set, p = S.props?.find(q => q.id === 'standing_stone');
  if (!p?.sprite) return;
  const { W, H, cam } = api, z = cam.zoom, top = spriteTop(p), base = p.base ?? p.y, line = top + L.lit * (base - top);
  // work in a canvas over the lit part of the stone only (plus room for the glow)
  const pad = Math.ceil(Math.max(8, 14 * Math.sqrt(z))), X0 = Math.max(0, Math.floor((p.sx - cam.cx) * z + W / 2) - pad), Y0 = Math.max(0, Math.floor((top - 12 - cam.cy) * z + H / 2) - pad);
  const X1 = Math.min(W, Math.ceil((p.sx + p.sw - cam.cx) * z + W / 2) + pad), Y1 = Math.min(H, Math.ceil((line + 12 - cam.cy) * z + H / 2) + pad);
  if (X1 - X0 < 2 || Y1 - Y0 < 2) return;
  const ow = X1 - X0, oh = Y1 - Y0, local = x => x.setTransform(z, 0, 0, z, W / 2 - cam.cx * z - X0, H / 2 - cam.cy * z - Y0);
  const [c, x] = scratch('stone-lit', ow, oh), col = mixRGB(GOLD, EMBER, clamp(1 - L.lit / 0.17));
  // the stone's own paint, lit gold: multiplied by the light and lifted a little
  local(x);
  x.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = rgbStr(col); x.fillRect(p.sx, top - 4, p.sw, base - top + 8);
  x.globalCompositeOperation = 'screen'; x.fillStyle = rgbStr(col, 0.3); x.fillRect(p.sx, top - 4, p.sw, base - top + 8);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh);
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
  // hidden by the actors and the mist in front of the stone
  eraseActors(x, api, p.y, [X0, Y0, ow, oh]);
  const mo = mistOverlay(api);
  if (mo) { const F = fogField(api, mo.params, mo.seed); if (F.any > 0.004) { x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 0.92; x.translate(-X0, -Y0); stretch(x, F, W, H); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; } }
  // and its glow: the last light blooms a little (blurred locally: a filter on the frame itself costs a full layer)
  const [bc, bx] = scratch('stone-lit-glow', ow, oh);
  bx.filter = `blur(${Math.max(3, 6 * Math.sqrt(z)).toFixed(1)}px)`; bx.drawImage(c, 0, 0); bx.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.95; ctx.drawImage(c, X0, Y0);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55; ctx.drawImage(bc, X0, Y0);
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
//   ghost  the Nell drawn on this frame (index into GHOSTS) or -1.
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
  const ghost = GHOSTS.findIndex(G => f >= G.f && f < G.f + G.n);
  return { f, alpha, day, amp, phase: ph, season: { col: S.col, k: S.k * sk, q: S.q }, ghost };
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
    // the land takes the same light: by day it shows its own paint (ungraded, only the story grade's muting)
    const lit = s.amp * s.day + (1 - s.amp) * 0.5, land = coverMask(api, 1), [lc, lx] = scratch('tl-land', W, H);
    lx.drawImage(land, 0, 0);
    const story = api.shot.gradeAt ? api.shot.gradeAt(api.t)?.story : null;
    if (story) {
      if (story.sat < 1) { lx.globalCompositeOperation = 'saturation'; lx.fillStyle = `rgba(128,128,128,${(1 - story.sat).toFixed(3)})`; lx.fillRect(0, 0, W, H); }
      if (story.sepia) { lx.globalCompositeOperation = 'color'; lx.fillStyle = `rgba(176,136,92,${(story.sepia * 0.6).toFixed(3)})`; lx.fillRect(0, 0, W, H); }
      lx.globalCompositeOperation = 'destination-in'; lx.drawImage(land, 0, 0);
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = s.alpha;
    ctx.drawImage(sc, 0, 0, W, H);
    ctx.globalAlpha = s.alpha * lit * 0.8; ctx.drawImage(lc, 0, 0);
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
  if (s.ghost >= 0) drawGhost(ctx, api, GHOSTS[s.ghost]);
}
function drawGhost(ctx, api, G) {
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
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.3; ctx.drawImage(bc, 0, 0); ctx.restore();
}

// ───────────── overlays and custom beats ─────────────
export const overlays = {
  comet: { layer: 'grade', draw: drawComet },
  'hill-mist': { layer: 'front', draw: drawMist },
  'stone-light': { layer: 'grade', draw: drawStoneLight },
};
export const custom = { timelapse: { layer: 'grade', draw: drawTimelapse } };
