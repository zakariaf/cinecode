// Places and props for Seventy-Six Summers (DESIGN §9.1 overlays and custom beats; merged by ../custom.mjs).
//
// The film's clock (screenplay, "The clock in code"): one value, dayT (0 dawn .. 1 full night), lights the far hill.
//   shadowLine(dayT)  height of the blue shadow climbing the hill from its foot, in hill heights (the crest is 1 and the
//                     standing stone spans 1 .. 1 + STONE_H); there is none until the sun gets low (dayT ≈ 0.56).
//   stoneLight(dayT)  the share of the stone still in sunlight, 1 .. 0. The stone is the highest point, so it keeps the
//                     gold after the hill has gone blue; it reaches 0 at dayT 1 and not before.
//   dayTAt(params, su) a number, or [from, to] across a scene (eased over its middle 80 %, like the sky crossfade).
//
//   overlay far-hill      layer 'sky'. The hill with its standing stone and a hawthorn on the horizon of every daytime
//                         scene, growing scene by scene (the visual clock). params: frac (the hill's height, foot to
//                         crest, as a share of the frame height at the set's widest zoom), dayT, x / y (world point of
//                         the hill's foot under the crest, on its own parallax plane; defaults per set in PLACE), k
//                         (parallax, default 0.22: farther than every painted layer, so the set's own layers overlap its
//                         foot), trail (0..1: her path of pressed grass up the lit face), haze (aerial perspective,
//                         default from frac). Painted once per size (gouache dabs along the slope, field hedges, trees,
//                         a hawthorn) and lit per frame from the clock: the sun-side wash, the far flank shaded, the
//                         blue shadow band climbing from below, gold on the stone, haze, a thin ink line.
//   overlay set-patch     layer 'back'. Paints out a feature of one set layer (params.k, its parallax; params.poly, world
//                         points on that layer's plane) by re-rendering what lies behind it there: the sky, the scene's
//                         far hill and the other back layers. The valley kit paints its own small standing stone on a
//                         knoll in front of the far hill; the patch removes it, so the film has one stone.
//   overlay empty-house   layer 'sky' (village). Nobody is home: keeps the kit's lamp level at 0, so the windows stay
//                         dark at dusk (the kit lights windows and lantern from the sky); the film lights the lantern.
//   overlay pressed-trail layer 'back' (village). A track of pressed, darker grass from the gate along the verge, past the
//                         lantern and away up the meadow toward the hill; faint until the scene's lantern-reveal beat
//                         starts, then clear over its rise (it was there all along; the glare hid it).
//   custom reflection     layer 'front' (3.2). The bank's edge across the frame just under Pebble's chin and, below it,
//                         the water: his mirrored head and a mirrored sky rippling in a slow sine; for a few frames
//                         (params.glint, s from the beat start; params.glintX, a frame fraction, default ahead of his
//                         face) the comet glints in the reflected sky and nowhere else.
//   custom lantern-reveal layer 'grade' (6.5 → the scene's end, so give it a long dur). The lantern was lit all along:
//                         its glass, flame and bloom rise as the ambient light falls (params.rise, s), drawn after the
//                         grade; one firefly lifts off it and drifts up along the trail.
//   custom crest-figure   layer 'sky' (6.6). Fidget's view of the far hill's crest: a tiny seated silhouette with one
//                         saturated fleck of moss-green scarf against the stone. While it plays the scene's far hill runs
//                         on the beat's clock (params.dayT [from, to], default [0.85, 0.87]), so the last sliver of gold
//                         slides up the stone.
//   custom eye-glint      layer 'grade' (6.8). A tiny gold point (the stone's last light) caught in Pebble's eye,
//                         found from his drawn head and mouth (api.actor); hidden while he blinks.
//   custom star-highlight layer 'grade' (9.3). A cool moon highlight gliding across the star marking on Pebble's shell
//                         (the rig's star position, through his pose's shell transform).
import { rng, noise1, clamp, lerp, smooth, canvas, blob, ink, path, quad } from '../../../engine/core/lib.mjs';
import { skyHaze } from '../../../engine/paint/sky.mjs';
import { glow, lanternBody, lampLevel, WARM } from '../../../engine/paint/structures.mjs';
import { LANTERN_G, villageScale } from '../../../engine/set/kits/village.mjs';

const ease = u => { u = clamp(u); return u * u * (3 - 2 * u); };
const INK = '42,33,48';

// ───────────── the clock ─────────────
export const STONE_H = 0.2;
// The hill's face holds gold through the village (6.1 .. 6.5); the line passes the crest at 0.855 and climbs the stone
// fast (6.6), leaving the thin sliver that scene 7 opens on (fx/sky.mjs stone-light: 0.17 at 0.87); then it lingers.
const SHADOW_KEYS = [[0, -0.1], [0.56, -0.1], [0.62, 0.05], [0.7, 0.35], [0.76, 0.48], [0.78, 0.53], [0.83, 0.7], [0.85, 0.86],
  [0.855, 1], [0.87, 1 + 0.83 * STONE_H], [0.9, 1 + 0.89 * STONE_H], [0.92, 1 + 0.925 * STONE_H], [1, 1 + STONE_H]];
const keyed = (K, x) => {
  if (x <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (x <= K[i][0]) { const [a, va] = K[i - 1], [b, vb] = K[i]; return lerp(va, vb, (x - a) / (b - a)); }
  return K[K.length - 1][1];
};
export const shadowLine = dayT => keyed(SHADOW_KEYS, clamp(dayT));
export const stoneLight = dayT => clamp((1 + STONE_H - shadowLine(dayT)) / STONE_H);
export function dayTAt(params, su = 0) {
  const d = params?.dayT ?? 0.4;
  return Array.isArray(d) ? lerp(d[0], d[1] ?? d[0], ease((su - 0.1) / 0.8)) : d;
}
// Sun and shade by dayT: side (+1 sun at frame right in the morning, -1 at frame left in the evening), dir (shading of
// the side away from the sun), sun (screen wash on the lit face), rim (crest edge toward the sun), sh (the climbing
// shadow, multiply), gold (the stone's gold accent).
const LIGHT = [
  [0.0, { side: 1, dir: 0.42, sun: [255, 200, 205, 0.06], rim: [255, 206, 196, 0.75], sh: [96, 100, 156, 0], gold: 0 }],
  [0.15, { side: 1, dir: 0.26, sun: [255, 236, 210, 0.1], rim: [255, 236, 206, 0.35], sh: [96, 100, 156, 0], gold: 0 }],
  [0.4, { side: 0, dir: 0.16, sun: [255, 250, 226, 0.14], rim: [255, 250, 232, 0.15], sh: [92, 100, 168, 0], gold: 0 }],
  [0.55, { side: -1, dir: 0.24, sun: [255, 232, 178, 0.2], rim: [255, 238, 196, 0.32], sh: [90, 100, 170, 0.45], gold: 0.25 }],
  [0.7, { side: -1, dir: 0.32, sun: [255, 208, 124, 0.32], rim: [255, 216, 144, 0.55], sh: [84, 92, 166, 0.6], gold: 0.65 }],
  [0.8, { side: -1, dir: 0.38, sun: [255, 182, 100, 0.38], rim: [255, 196, 116, 0.62], sh: [74, 78, 150, 0.68], gold: 0.9 }],
  [0.9, { side: -1, dir: 0.42, sun: [255, 164, 88, 0.4], rim: [255, 182, 104, 0.62], sh: [60, 62, 124, 0.72], gold: 1 }],
  [1.0, { side: -1, dir: 0.42, sun: [255, 150, 80, 0.3], rim: [255, 170, 96, 0.4], sh: [44, 48, 100, 0.76], gold: 1 }],
];
export function lightAt(dayT) {
  const d = clamp(dayT);
  let i = 1; while (i < LIGHT.length - 1 && LIGHT[i][0] < d) i++;
  const [a, A] = LIGHT[i - 1], [b, B] = LIGHT[i], u = clamp((d - a) / (b - a));
  const mix = k => (Array.isArray(A[k]) ? A[k].map((v, j) => lerp(v, B[k][j], u)) : lerp(A[k], B[k], u));
  return { side: mix('side'), dir: mix('dir'), sun: mix('sun'), rim: mix('rim'), sh: mix('sh'), gold: mix('gold') };
}
const rgba = (c, a = c[3] ?? 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a)})`;

// ───────────── the far hill: shape (hill units: x right of the crest, h up from the foot; crest at (0, 1)) ─────────────
const X0 = -3.1, X1 = 2.0, TOP = 1 + STONE_H + 0.06, BOT = -0.9;          // sprite extent
export const STONE = { x: 0.06, w: 0.09 };                                  // centre and width; height STONE_H
const THORN = { x: 0.5, w: 0.2, h: 0.12 };
export function hillTop(x) {
  if (x <= 0) {
    const u = Math.min(1.25, -x / 2.9);
    return 1 - Math.pow(u, 1.6) + 0.022 * Math.sin(x * 3.3 + 0.7) * smooth(-0.15, -0.9, x) * smooth(-3.4, -2.2, x);
  }
  return 1 - Math.pow(Math.min(1.3, x / 1.55), 1.7);
}
const stoneBase = hillTop(STONE.x);
// The stone's outline (hill units), the same silhouette as the hill kit's standing stone: its top tilts down to the right.
export const STONE_P = (() => {
  const c = STONE.x, w = STONE.w, h = STONE_H, b = stoneBase;
  const P = [[c - w / 2, b - 0.012], [c - w * 0.47, b + h * 0.78], [c - w * 0.22, b + h], [c + w * 0.27, b + h * 0.95], [c + w * 0.5, b + h * 0.6], [c + w * 0.5, b - 0.012]];
  // rounded corners, densely sampled (as rpoly, without its pixel-sized wobble)
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[(i - 1 + P.length) % P.length], p1 = P[i], p2 = P[(i + 1) % P.length], r = 0.012;
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const a = [p1[0] + (p0[0] - p1[0]) * Math.min(r, d1 / 2) / d1, p1[1] + (p0[1] - p1[1]) * Math.min(r, d1 / 2) / d1];
    const e = [p1[0] + (p2[0] - p1[0]) * Math.min(r, d2 / 2) / d2, p1[1] + (p2[1] - p1[1]) * Math.min(r, d2 / 2) / d2];
    out.push(...quad(a, p1, e, 5));
  }
  return out;
})();
// Default placement per set: the foot under the crest (world, on its own plane) where the stone clears the painted
// forest edge, the wayside tree's canopy and the cottage roof in the scenes' framings.
export const PLACE = {
  meadow: { x: 2154, y: 580 },
  stream: { x: 1286, y: 597 },
  wayside: { x: 2401, y: 753 },
  valley: { x: 2264, y: 768 },
  village: { x: 1676, y: 1320 },
};

/** Where the far hill is on screen: { sx, sy (the foot under the crest), U (px per hill unit), at(x, h) → [sx, sy] }. */
export function hillGeom(api, p = {}) {
  const S = api.set, cam = api.cam, W = api.W, H = api.H, def = PLACE[S.id] || {};
  const k = p.k ?? 0.22, frac = p.frac ?? 0.1;
  const zref = p.zref ?? S.clampCamera({ cx: S.refX, cy: S.refY, zoom: 0.01 }, W, H).zoom;
  const hw = (frac * H) / zref, x = p.x ?? def.x ?? S.refX + 600, y = p.y ?? def.y ?? S.horizon ?? 700;
  const z = cam.zoom, dx = (cam.cx - S.refX) * (1 - k), dy = (cam.cy - S.refY) * (1 - k) * 0.4;
  const sx = (x + dx - cam.cx) * z + W / 2, sy = (y + dy - cam.cy) * z + H / 2, U = hw * z;
  return { sx, sy, U, k, frac, hw, at: (u, h) => [sx + u * U, sy - h * U] };
}

// Scratch canvases (one per purpose and size).
const SCR = new Map();
function scratch(name, w, h) {
  const key = `${name}|${w}x${h}`;
  if (!SCR.has(key)) SCR.set(key, canvas(w, h));
  const [c, x] = SCR.get(key);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  return [c, x];
}
const clear = (x, b) => x.clearRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);

// The painted hill (albedo, before light): a canvas at P px per hill unit. Cached per size and trail.
const SPRITES = new Map();
const bucket = U => clamp(2 ** Math.ceil(Math.log2(Math.max(1, U))), 64, 1024);
function hillSprite(P, trail = 0) {
  const key = `${P}|${trail}`;
  if (SPRITES.has(key)) return SPRITES.get(key);
  const Wc = Math.ceil((X1 - X0) * P), Hc = Math.ceil((TOP - BOT) * P), [c, x] = canvas(Wc, Hc);
  const X = u => (u - X0) * P, Y = h => (TOP - h) * P, r = rng(7607), nz = noise1(77);
  const sil = [[X(X0), Y(BOT)]];
  for (let u = X0; u <= X1 + 1e-9; u += 0.01) sil.push([X(u), Y(hillTop(u))]);
  sil.push([X(X1), Y(BOT)]);
  const slopeAt = u => (hillTop(u + 0.02) - hillTop(u - 0.02)) / 0.04;
  x.fillStyle = '#8db463'; path(x, sil); x.fill();
  x.save(); path(x, sil); x.clip();
  // the land darkens and cools toward the foot, lightens along the crest
  const g = x.createLinearGradient(0, Y(1), 0, Y(0));
  g.addColorStop(0, 'rgba(196,222,140,.5)'); g.addColorStop(0.45, 'rgba(140,180,96,0)'); g.addColorStop(1, 'rgba(70,108,64,.45)');
  x.fillStyle = g; x.fillRect(0, 0, Wc, Hc);
  // gouache dabs laid along the slope
  const pal = ['#8db463', '#9ac06e', '#83a95a', '#a6c97a', '#7a9f55', '#b2d086'];
  for (let i = 0; i < 5200; i++) {
    const u = X0 + r() * (X1 - X0), dep = Math.pow(r(), 1.25) * 1.25, h = hillTop(u) - 0.008 - dep;
    x.fillStyle = pal[Math.floor(r() * pal.length)];
    blob(x, X(u), Y(h), (0.018 + r() * 0.05) * P, (0.004 + r() * 0.008) * P, -Math.atan(slopeAt(u)) * 0.8, r, 6);
  }
  // field hedges: dark dotted lines that follow the land on the long lit face, and a few round trees by them
  const hedges = [[-2.75, -0.35, 0.16], [-2.4, -0.55, 0.34], [-1.9, -0.95, 0.56], [-2.9, -1.6, 0.78]];
  for (const [a, b, dep] of hedges) {
    for (let u = a; u < b; u += 0.006) {
      const h = hillTop(u) - dep - 0.04 * Math.sin(u * 2.1 + dep * 9) - 0.02 * nz(u * 4);
      x.fillStyle = ['#4e7046', '#5a7c4c', '#46663f'][Math.floor(r() * 3)];
      blob(x, X(u), Y(h), (0.007 + r() * 0.006) * P, (0.005 + r() * 0.004) * P, 0, r, 6);
      if (r() < 0.012) { x.fillStyle = '#4a6a42'; blob(x, X(u), Y(h + 0.018), 0.022 * P, 0.026 * P, 0, r, 7); x.fillStyle = '#6e9056'; blob(x, X(u - 0.006), Y(h + 0.026), 0.012 * P, 0.012 * P, 0, r, 6); }
    }
  }
  // tussocks catching the light along the crest
  for (let u = -1.4; u < 1.1; u += 0.01 + r() * 0.02) { x.fillStyle = ['#a9cc7c', '#bdd890', '#96bb6c'][Math.floor(r() * 3)]; blob(x, X(u), Y(hillTop(u) - 0.006), 0.012 * P, 0.006 * P, -Math.atan(slopeAt(u)), r, 6); }
  // her path: pressed grass climbing the lit face to the stone
  if (trail > 0) {
    const pts = [];
    for (let i = 0; i <= 80; i++) { const v = i / 80, u = lerp(-1.75, STONE.x - STONE.w * 0.7, Math.pow(v, 0.85)) + 0.05 * Math.sin(v * 7.5) * (1 - v); pts.push([u, hillTop(u) - lerp(0.42, 0.012, Math.pow(v, 0.7))]); }
    for (const [i, [u, h]] of pts.entries()) {
      const w = lerp(0.016, 0.006, i / pts.length);
      x.fillStyle = `rgba(52,82,46,${0.42 * trail})`; blob(x, X(u), Y(h), w * P, w * 0.45 * P, -0.35, r, 6);
    }
  }
  x.restore();
  // the hawthorn beyond the stone: a short leaning trunk and a wind-shaped crown
  const tb = hillTop(THORN.x);
  x.fillStyle = '#4e3e30'; path(x, [[X(THORN.x - 0.008), Y(tb - 0.01)], [X(THORN.x + 0.004), Y(tb + 0.05)], [X(THORN.x + 0.016), Y(tb + 0.05)], [X(THORN.x + 0.008), Y(tb - 0.01)]]); x.fill();
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()), cx = THORN.x + 0.03 + Math.cos(a) * d * THORN.w * 0.5, cy = tb + 0.075 + Math.sin(a) * d * THORN.h * 0.42;
    x.fillStyle = ['#3e5a34', '#4a6a3c', '#5c7c46', '#6f8f50'][Math.floor(r() * 4)];
    blob(x, X(cx), Y(cy), (0.016 + r() * 0.02) * P, (0.012 + r() * 0.012) * P, 0, r, 7);
  }
  const out = { c, P, Wc, Hc, sil };
  SPRITES.set(key, out);
  return out;
}
// The stone's own sprite (albedo), so it can be lit apart from the hill and redrawn by the crest-figure beat.
const STONE_BOX = [STONE.x - STONE.w * 0.62, stoneBase - 0.02, STONE.x + STONE.w * 0.62, stoneBase + STONE_H + 0.02];
function stoneSprite(P) {
  const key = `stone|${P}`;
  if (SPRITES.has(key)) return SPRITES.get(key);
  const [u0, h0, u1, h1] = STONE_BOX, Wc = Math.ceil((u1 - u0) * P) + 2, Hc = Math.ceil((h1 - h0) * P) + 2, [c, x] = canvas(Wc, Hc);
  const X = u => (u - u0) * P + 1, Y = h => (h1 - h) * P + 1, r = rng(5113), poly = STONE_P.map(([u, h]) => [X(u), Y(h)]);
  x.fillStyle = '#a49e90'; path(x, poly); x.fill();
  x.save(); path(x, poly); x.clip();
  for (let i = 0; i < 60; i++) { x.fillStyle = ['rgba(180,190,110,.7)', 'rgba(220,200,120,.55)', 'rgba(120,130,80,.6)', 'rgba(196,190,170,.6)'][Math.floor(r() * 4)]; blob(x, X(STONE_BOX[0] + r() * (u1 - u0)), Y(stoneBase + r() * STONE_H), (0.004 + r() * 0.008) * P, (0.003 + r() * 0.005) * P, r(), r, 6); }
  x.strokeStyle = 'rgba(70,64,58,.55)'; x.lineWidth = Math.max(0.6, 0.004 * P); x.beginPath(); x.moveTo(X(STONE.x - 0.012), Y(stoneBase + STONE_H * 0.88)); x.quadraticCurveTo(X(STONE.x + 0.006), Y(stoneBase + STONE_H * 0.6), X(STONE.x - 0.006), Y(stoneBase + STONE_H * 0.3)); x.stroke();
  x.restore();
  const out = { c, P, Wc, Hc };
  SPRITES.set(key, out);
  return out;
}

// The sky's haze colour now (aerial perspective), as 'r,g,b'.
function hazeRGB(api) {
  const list = api.shot?.skyAt?.(api.t) ?? [['morning', 1]], L = typeof list === 'string' ? [[list, 1]] : list;
  let r = 0, g = 0, b = 0, n = 0;
  for (const [name, a] of L) { if (!(a > 0)) continue; const [cr, cg, cb] = skyHaze(name).split(',').map(Number); r += cr * a; g += cg * a; b += cb * a; n += a; }
  return n ? [r / n, g / n, b / n] : [236, 240, 230];
}
const hazeOf = p => p.haze ?? clamp(0.55 - (p.frac ?? 0.1) * 0.9, 0.06, 0.55);
const inkW = U => clamp(0.7 + U * 0.0022, 0.8, 2.4);

// The shadow band (screen polygon below the wavy line at height lineH, hill units).
function shadowPoly(G, lineH, u0, u1) {
  const nz = noise1(311), P = [];
  for (let u = u0; u <= u1 + 1e-9; u += 0.04) P.push(G.at(u, lineH + 0.012 * Math.sin(u * 6.3 + 1.1) + 0.012 * (nz(u * 2.7 + 5) - 0.5)));
  P.push(G.at(u1, BOT - 1), G.at(u0, BOT - 1));
  return P;
}

/** Draw the far hill (everything but the stone) into ctx (screen space). → the screen box drawn, or null. */
function drawHill(ctx, api, p, G, dayT) {
  const { W, H } = api, U = G.U, [bx0, by0] = G.at(X0, TOP), [bx1, by1] = G.at(X1, BOT);
  if (bx0 > W || bx1 < 0 || by0 > H || by1 < 0 || U < 2) return null;
  const L = lightAt(dayT), spr = hillSprite(bucket(U), p.trail ?? 0), haze = hazeOf(p), hz = hazeRGB(api);
  const box = [Math.max(0, Math.floor(bx0)), Math.max(0, Math.floor(by0)), Math.min(W, Math.ceil(bx1)), Math.min(H, Math.ceil(by1))];
  const [cv, x] = scratch('hill', W, H);
  clear(x, box);
  x.save(); x.beginPath(); x.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); x.clip();
  x.drawImage(spr.c, bx0, by0, bx1 - bx0, by1 - by0);
  const [cx0] = G.at(-0.5, 0), [cx1] = G.at(0.7, 0), [lx0] = G.at(-2.4, 0), [lx1] = G.at(0.35, 0);
  // the side away from the sun in cel shade: the far (right) flank in the evening, the long face at dawn
  x.globalCompositeOperation = 'multiply';
  const west = clamp(-L.side), east = clamp(L.side), top = by0, bot = by1;
  if (west > 0.01) { const g = x.createLinearGradient(cx0, 0, cx1, 0); g.addColorStop(0, 'rgba(154,140,196,0)'); g.addColorStop(0.55, `rgba(154,140,196,${L.dir * west})`); g.addColorStop(1, `rgba(140,128,190,${L.dir * west * 1.15})`); x.fillStyle = g; x.fillRect(box[0], top, box[2] - box[0], bot - top); }
  if (east > 0.01) { const g = x.createLinearGradient(lx1, 0, lx0, 0); g.addColorStop(0, 'rgba(154,140,196,0)'); g.addColorStop(0.3, `rgba(150,138,196,${L.dir * east})`); g.addColorStop(1, `rgba(150,138,196,${L.dir * east})`); x.fillStyle = g; x.fillRect(box[0], top, box[2] - box[0], bot - top); }
  if (L.side > -0.2 && L.side < 0.2) { x.fillStyle = `rgba(154,140,196,${L.dir})`; x.fillRect(G.at(0.25, 0)[0], top, box[2], bot - top); }
  // the climbing shadow: everything below the line goes blue (soft edged): a cool multiply, then a violet glaze
  const lineH = shadowLine(dayT);
  if (L.sh[3] > 0.01 && lineH > -0.05) {
    const edge = Math.max(2, 0.02 * U), [, ly] = G.at(0, lineH), poly = shadowPoly(G, lineH, X0, X1), lite = L.sh.map((v, i) => (i < 3 ? lerp(v, 255, 0.4) : v));
    for (const [col, a, op] of [[lite, L.sh[3], 'multiply'], [L.sh, L.sh[3] * 0.42, 'source-atop']]) {
      const g = x.createLinearGradient(0, ly - edge, 0, ly + edge);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
      x.globalCompositeOperation = op; x.fillStyle = g; path(x, poly); x.fill();
    }
  }
  // sunlight on the lit face above the line (screen), strongest toward the sun
  x.globalCompositeOperation = 'screen';
  if (L.sun[3] > 0.01) {
    const s0 = L.side <= 0 ? G.at(-2.2, 0)[0] : G.at(1.2, 0)[0], s1 = L.side <= 0 ? G.at(0.3, 0)[0] : G.at(-0.6, 0)[0];
    const g = x.createLinearGradient(s0, 0, s1, 0); g.addColorStop(0, rgba(L.sun, L.sun[3])); g.addColorStop(1, rgba(L.sun, L.sun[3] * 0.25));
    x.save();
    if (L.sh[3] > 0.01 && lineH > -0.05) { const [, ly] = G.at(0, lineH); x.beginPath(); x.rect(box[0], box[1], box[2] - box[0], Math.max(0, ly - box[1])); x.clip(); }
    x.fillStyle = g; x.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); x.restore();
  }
  // a rim of light along the crest on the sun's side, above the shadow
  if (L.rim[3] > 0.02) {
    const w = Math.max(1.2, 0.012 * U), a0 = L.side <= 0 ? -2.6 : -0.15, a1 = L.side <= 0 ? 0.12 : 1.4, pts = [];
    for (let u = a0; u <= a1; u += 0.02) { const h = hillTop(u); if (h > lineH + 0.02) pts.push(G.at(u, h - 0.006)); }
    if (pts.length > 2) { x.lineWidth = w; x.lineJoin = 'round'; x.strokeStyle = rgba(L.rim, L.rim[3]); x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
  }
  // ink along the crest (thin, faded by distance)
  x.globalCompositeOperation = 'source-over';
  const crest = []; for (let u = -2.7; u <= 1.5; u += 0.012) crest.push(G.at(u, hillTop(u)));
  ink(x, crest, inkW(U), { closed: false, color: `rgba(${INK},${0.75 * (1 - haze)})`, seed: 91, taper: true });
  // back inside the silhouette, then the haze (more toward the foot)
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(spr.c, bx0, by0, bx1 - bx0, by1 - by0);
  x.globalCompositeOperation = 'source-atop';
  const [, fy] = G.at(0, 0), [, cy] = G.at(0, 1), hg = x.createLinearGradient(0, cy, 0, fy);
  hg.addColorStop(0, rgba(hz, haze * 0.75)); hg.addColorStop(1, rgba(hz, Math.min(0.92, haze * 1.35)));
  x.fillStyle = hg; x.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  x.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cv, box[0], box[1], box[2] - box[0], box[3] - box[1], box[0], box[1], box[2] - box[0], box[3] - box[1]); ctx.restore();
  return box;
}

/** Draw the standing stone lit for dayT (its share of light from stoneLight unless `lit` is given). */
export function drawStone(ctx, api, p, G, dayT, lit = stoneLight(dayT)) {
  const { W, H } = api, U = G.U, [bx0, by0] = G.at(STONE_BOX[0], STONE_BOX[3]), [bx1, by1] = G.at(STONE_BOX[2], STONE_BOX[1]);
  if (bx0 > W || bx1 < 0 || by0 > H || by1 < 0 || U < 2) return;
  const L = lightAt(dayT), spr = stoneSprite(bucket(U)), haze = hazeOf(p), hz = hazeRGB(api);
  const pad = 2, box = [Math.max(0, Math.floor(bx0) - pad), Math.max(0, Math.floor(by0) - pad), Math.min(W, Math.ceil(bx1) + pad), Math.min(H, Math.ceil(by1) + pad)];
  if (box[2] <= box[0] || box[3] <= box[1]) return;
  const [cv, x] = scratch('stone', W, H), poly = STONE_P.map(([u, h]) => G.at(u, h)), sw = (bx1 - bx0) * spr.Wc / (spr.Wc - 2), sh = (by1 - by0) * spr.Hc / (spr.Hc - 2);
  const dx = bx0 - (1 / spr.P) * U, dy = by0 - (1 / spr.P) * U;
  clear(x, box);
  x.drawImage(spr.c, dx, dy, sw, sh);
  // cel shade: the side away from the sun (or, at noon, the right side)
  const sideS = L.side < -0.2 ? 1 : L.side > 0.2 ? -1 : 1, [mx] = G.at(STONE.x + 0.008 * sideS, 0), [ex] = G.at(STONE.x + STONE.w * 0.55 * sideS, 0);
  x.globalCompositeOperation = 'multiply';
  { const g = x.createLinearGradient(mx, 0, ex, 0); g.addColorStop(0, 'rgba(154,140,196,0)'); g.addColorStop(0.08, 'rgba(154,140,196,.62)'); g.addColorStop(1, 'rgba(140,128,190,.7)'); x.fillStyle = g; x.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); }
  const lineH = 1 + STONE_H * (1 - lit), [, ly] = G.at(0, lineH), e = Math.max(1, 0.006 * U), top = Math.max(0, ly - box[1]);
  // below the line the stone is in the hill's blue shadow; above it, the last gold (warm, brightest toward the sun)
  if (L.sh[3] > 0.01 && lit < 0.999) {
    const g = x.createLinearGradient(0, ly - e, 0, ly + e), c = L.sh.map((v, i) => (i < 3 ? lerp(v, 255, 0.3) : v));
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, Math.min(0.9, L.sh[3] * 1.15)));
    x.fillStyle = g; x.fillRect(box[0], ly - e, box[2] - box[0], box[3] - ly + e);
  }
  if (L.gold > 0.01 && lit > 0.001) {
    x.fillStyle = `rgba(255,190,110,${0.8 * L.gold})`; x.fillRect(box[0], box[1], box[2] - box[0], top);
    x.globalCompositeOperation = 'screen';
    const [gx0] = G.at(STONE.x - STONE.w * 0.5, 0), [gx1] = G.at(STONE.x + STONE.w * 0.5, 0), g = x.createLinearGradient(gx0, 0, gx1, 0);
    g.addColorStop(0, `rgba(255,180,80,${0.85 * L.gold})`); g.addColorStop(0.55, `rgba(255,160,64,${0.4 * L.gold})`); g.addColorStop(1, `rgba(255,140,60,${0.1 * L.gold})`);
    x.fillStyle = g; x.fillRect(box[0], box[1], box[2] - box[0], top);
    // a rim of light down the edge toward the sun
    const s = L.side <= 0 ? -1 : 1, rim = STONE_P.filter(([u, h]) => (u - STONE.x) * s > STONE.w * 0.3 && h > lineH).map(([u, h]) => G.at(u, h));
    if (rim.length > 1) { x.save(); x.beginPath(); x.rect(box[0], box[1], box[2] - box[0], top); x.clip(); x.strokeStyle = `rgba(255,232,170,${0.8 * L.gold})`; x.lineWidth = Math.max(1, 0.01 * U); x.lineJoin = 'round'; x.beginPath(); rim.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); x.restore(); }
  }
  // keep the stone above the turf (its foot stands in the grass), then the haze, then the ink (clipped the same way)
  const ground = [];
  for (let u = STONE_BOX[0] - 0.02; u <= STONE_BOX[2] + 0.02 + 1e-9; u += 0.005) ground.push(G.at(u, hillTop(u) - 0.004));
  ground.push(G.at(STONE_BOX[2] + 0.02, STONE_BOX[3] + 0.1), G.at(STONE_BOX[0] - 0.02, STONE_BOX[3] + 0.1));
  const [mc, mk] = scratch('stone-mask', W, H);
  clear(mk, box); mk.save(); path(mk, ground); mk.clip(); mk.fillStyle = '#000'; path(mk, poly); mk.fill(); mk.restore();
  x.globalCompositeOperation = 'destination-in'; x.drawImage(mc, box[0], box[1], box[2] - box[0], box[3] - box[1], box[0], box[1], box[2] - box[0], box[3] - box[1]);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = rgba(hz, haze * 0.7 * (1 - 0.6 * L.gold * Math.min(1, lit * 3))); x.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  x.globalCompositeOperation = 'source-over';
  x.save(); path(x, ground); x.clip();
  ink(x, [...poly, poly[0]], inkW(U) * 1.05, { closed: false, color: `rgba(${INK},${0.8 * (1 - haze)})`, seed: 64, taper: false });
  x.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cv, box[0], box[1], box[2] - box[0], box[3] - box[1], box[0], box[1], box[2] - box[0], box[3] - box[1]);
  // a soft bloom around the gold (the stone is the last thing the sun touches)
  if (L.gold > 0.3 && lit > 0.02) {
    const [gx, gy] = G.at(STONE.x - STONE.w * 0.15, Math.min(1 + STONE_H * 0.92, (lineH + 1 + STONE_H) / 2)), R = Math.max(4, STONE_H * U * (0.35 + 0.5 * lit));
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, gx, gy, 0, R, '255,190,110', 0.5 * L.gold * Math.sqrt(lit) * (1 - haze * 0.4));
  }
  ctx.restore();
}

// The far-hill overlay of the api's scene (its params), for beats that draw on the hill.
const farHillOf = api => (api.plan.overlays || []).find(o => o.scene === api.scene.id && o.name === 'far-hill');
// While a crest-figure beat plays, the hill runs on its clock (params.dayT [from, to] across the beat, eased).
const CREST_DAYT = [0.85, 0.87];
function crestDayT(api) {
  const c = (api.plan.custom || []).find(c => c.scene === api.scene.id && c.name === 'crest-figure' && api.t >= c.t0 && api.t < c.t1);
  if (!c) return null;
  const d = c.params?.dayT ?? CREST_DAYT;
  return Array.isArray(d) ? lerp(d[0], d[1] ?? d[0], ease((api.t - c.t0) / ((c.t1 - c.t0) || 1))) : d;
}

// ───────────── village helpers ─────────────
// The pressed-grass trail (world, village): from the gate along the verge in front of the fence, past the lantern, up
// between the lantern and the well and away across the back meadow toward the hill.
export const TRAIL = [[1050, 1094], [1110, 1092], [1230, 1090], [1340, 1092], [1430, 1094], [1500, 1086], [1548, 1060], [1566, 1028],
  [1560, 996], [1572, 962], [1612, 928], [1680, 900], [1766, 876], [1850, 860], [1930, 850]];
function polyAt(P, v) {                       // a point at arc-length fraction v (0..1) along a polyline
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const s = clamp(v) * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
  const u = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  return [lerp(P[i - 1][0], P[i][0], u), lerp(P[i - 1][1], P[i][1], u), Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])];
}
const revealBeat = api => (api.plan.custom || []).find(c => c.scene === api.scene.id && c.name === 'lantern-reveal');
function revealAt(api) {
  const c = revealBeat(api);
  if (!c || api.t < c.t0) return 0;
  return ease((api.t - c.t0) / (c.params?.rise ?? 2.5));
}

// ───────────── the reflection (3.2) ─────────────
function drawReflection(ctx, u, api) {
  const a = api.actor(api.params.who ?? 'pebble');
  if (!a) return;
  const { W, H, cam } = api, z = cam.zoom, R = a.R, ss = a.s * z, hh = (R.headHeight || 20) * ss;
  const [hx, hy] = api.toScreen(a.head), lip = Math.max(10, 0.28 * hh), wl = Math.round(hy + 0.45 * hh + lip);
  if (wl >= H - 4) return;
  const t = api.t, bt = api.bt ?? u * (api.dur || 1);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // the mirror source: the sky (soft), the comet's glint, the actor above the lip, the lip itself
  const [src, sx] = scratch('refl-src', W, H);
  sx.clearRect(0, 0, W, H);
  sx.filter = 'blur(3px)'; api.set.drawSky(sx, cam, api.shot.skyAt(t), t); sx.filter = 'none';
  const g0 = api.params.glint ?? 1.67, gd = api.params.glintDur ?? 0.42, gv = (bt - g0) / gd;
  // in the reflected sky ahead of his face (the head's own reflection is behind it)
  if (gv > 0 && gv < 1) glint(sx, W * (api.params.glintX ?? ((a.face || 1) > 0 ? 0.76 : 0.24)), wl - (H - wl) * 0.5, Math.sin(Math.PI * gv), H);
  sx.save(); sx.beginPath(); sx.rect(0, 0, W, wl - lip * 0.6); sx.clip();
  R.draw(sx, (a.x - cam.cx) * z + W / 2, (a.y + (a.sink || 0) - cam.cy) * z + H / 2, ss, a.face, { ...a.st, shadow: false });
  sx.restore();
  bankLip(sx, wl, lip, W, t, false);
  // mirrored about the waterline, then sliced into rows that sway in a slow sine (more with depth)
  const [mir, mx] = scratch('refl-mir', W, H);
  mx.clearRect(0, 0, W, H); mx.translate(0, 2 * wl); mx.scale(1, -1); mx.drawImage(src, 0, 0); mx.setTransform(1, 0, 0, 1, 0, 0);
  const water = ctx.createLinearGradient(0, wl, 0, H); water.addColorStop(0, '#9fc4cf'); water.addColorStop(1, '#4f8496');
  ctx.fillStyle = water; ctx.fillRect(0, wl, W, H - wl);
  const step = 3;
  for (let y = wl; y < H; y += step) {
    const d = (y - wl) / Math.max(1, H - wl), amp = (1.5 + 14 * d) * (H / 1080);
    const off = amp * Math.sin(y * 0.045 * (1080 / H) - t * 1.6) + amp * 0.35 * Math.sin(y * 0.11 * (1080 / H) + t * 2.3);
    ctx.drawImage(mir, 0, y, W, step, off, y, W, step);
  }
  // the water's own colour and depth over the reflection
  const tint = ctx.createLinearGradient(0, wl, 0, H); tint.addColorStop(0, 'rgba(62,112,128,.22)'); tint.addColorStop(1, 'rgba(36,74,92,.5)');
  ctx.fillStyle = tint; ctx.fillRect(0, wl, W, H - wl);
  // slow light ripples on the surface
  const r = rng(4411), nz = noise1(4412);
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 26; i++) {
    const y = wl + 6 + Math.pow(r(), 1.4) * (H - wl), d = (y - wl) / (H - wl), x0 = ((r() * 1.4 - 0.2) * W + t * (8 + 20 * d) * (r() < 0.5 ? 1 : -1)) % (W * 1.2);
    const len = (40 + r() * 160) * (0.5 + d), a = 0.12 + 0.18 * nz(t * 0.7 + i * 3.1);
    ctx.strokeStyle = `rgba(236,246,250,${a})`; ctx.lineWidth = Math.max(1, (1 + 2 * d) * (H / 1080));
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + len / 2, y - 2 * (H / 1080), x0 + len, y); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // the water at the bank's foot: a dark line where the earth meets it, then the bank itself in front of the body
  ctx.fillStyle = 'rgba(30,44,40,.45)'; ctx.fillRect(0, wl, W, Math.max(2, lip * 0.12));
  bankLip(ctx, wl, lip, W, t);
  ctx.restore();
}
// The near bank's edge: an earthen lip with grass hanging over it, inked where it meets the water.
function bankLip(x, wl, lip, W, t, grass = true) {
  const r = rng(9031), nz = noise1(9032), top = wl - lip, k = lip / 40;
  const edge = []; for (let px = -20; px <= W + 20; px += 16) edge.push([px, top + (nz(px * 0.01) - 0.5) * lip * 0.35]);
  x.fillStyle = '#6a5436'; x.beginPath(); x.moveTo(-20, wl + 1); edge.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(W + 20, wl + 1); x.closePath(); x.fill();
  const g = x.createLinearGradient(0, top, 0, wl); g.addColorStop(0, 'rgba(120,96,60,.6)'); g.addColorStop(1, 'rgba(40,30,22,.55)');
  x.fillStyle = g; x.fill();
  for (let i = 0; i < W / 9; i++) { x.fillStyle = ['rgba(150,120,80,.5)', 'rgba(70,54,36,.5)', 'rgba(110,90,60,.5)'][i % 3]; blob(x, r() * W, top + lip * (0.3 + r() * 0.6), (6 + r() * 14) * k, (1.5 + r() * 2.5) * k, 0, r, 6); }
  // grass along the top (short, so the head above stays clear), some blades hanging over the edge, swaying a little
  for (let i = 0; grass && i < W / 6; i++) {
    const bx = r() * W, by = top + (nz(bx * 0.01) - 0.5) * lip * 0.35 + 2, len = (8 + r() * 20) * k * 1.2, lean = (r() - 0.35) * 1.4 + 0.08 * Math.sin(t * 1.3 + i);
    const tipx = bx + lean * len * 0.6, tipy = by - len * (0.55 + r() * 0.5) + (r() < 0.25 ? len * 0.9 : 0);
    ink(x, quad([bx, by], [bx + lean * len * 0.15, by - len * 0.5], [tipx, tipy], 6), (2 + r() * 2) * k, { closed: false, color: ['#4f7d3a', '#5f8f44', '#3f6b32', '#77a050'][i % 4], seed: 900 + i });
  }
  const L = []; for (let px = -10; px <= W + 10; px += 12) L.push([px, wl - 1 + (nz(px * 0.02 + 7) - 0.5) * 2]);
  ink(x, L, Math.max(1.6, 2.2 * k), { closed: false, color: `rgba(${INK},.85)`, seed: 911, taper: false });
}
// A comet's glint: a small bright star with a short two-colour tail (k 0..1).
function glint(x, gx, gy, k, H) {
  if (k <= 0.01) return;
  const s = (H / 1080) * (0.8 + 0.4 * k);
  x.save(); x.globalCompositeOperation = 'screen';
  for (const [col, ang, len, w] of [['159,200,255', -2.55, 120, 6], ['255,211,138', -2.4, 90, 9]]) {
    const ex = gx + Math.cos(ang) * len * s, ey = gy + Math.sin(ang) * len * s, g = x.createLinearGradient(gx, gy, ex, ey);
    g.addColorStop(0, `rgba(${col},${0.7 * k})`); g.addColorStop(1, `rgba(${col},0)`);
    x.strokeStyle = g; x.lineWidth = w * s; x.lineCap = 'round'; x.beginPath(); x.moveTo(gx, gy); x.lineTo(ex, ey); x.stroke();
  }
  glow(x, gx, gy, 0, 46 * s * k, '255,243,214', 0.8 * k);
  x.fillStyle = `rgba(255,252,240,${k})`;
  for (const [a, l] of [[0, 26], [Math.PI / 2, 26], [Math.PI / 4, 11], [-Math.PI / 4, 11]]) { x.save(); x.translate(gx, gy); x.rotate(a); x.beginPath(); x.ellipse(0, 0, l * s * k, 1.6 * s, 0, 0, 7); x.fill(); x.restore(); }
  x.restore();
}

// ───────────── the lantern (6.5 on) ─────────────
function drawLantern(ctx, u, api) {
  const k = ease((api.bt ?? 0) / (api.params.rise ?? 2.5)), G = LANTERN_G, z = api.cam.zoom;
  if (k <= 0.001) return;
  // as the glare goes the flame shows: brighter as the ambient light falls
  const dark = clamp((lampLevel(api.shot.skyAt(api.t)) - 0.35) / 0.55), lvl = k * (0.45 + 0.55 * dark), nz = noise1(5501), fl = 1 - 0.1 * nz(api.t * 7.1) - 0.06 * nz(api.t * 2.3 + 9);
  ctx.save();
  ctx.setTransform(z, 0, 0, z, api.W / 2 - api.cam.cx * z, api.H / 2 - api.cam.cy * z);
  const g = G.glass;
  ctx.save(); ctx.beginPath(); ctx.rect(g.x0 - 1, g.y0 - 1, g.x1 - g.x0 + 2, g.y1 - g.y0 + 2); ctx.clip();
  ctx.globalAlpha = clamp(lvl * 1.15); lanternBody(ctx, rng(4106), G, 1); ctx.restore();
  // the flame
  const [lx, ly] = G.lamp, s = G.s;
  ctx.globalAlpha = clamp(lvl * 1.2);
  ctx.fillStyle = '#ffb44a'; ctx.beginPath(); ctx.ellipse(lx, ly - 1 * s, 3.2 * s * fl, 7 * s * fl, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.ellipse(lx, ly + 0.5 * s, 1.6 * s, 3.8 * s * fl, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  // bloom and the pool of light on the ground (screen)
  ctx.globalCompositeOperation = 'screen';
  glow(ctx, lx, ly, 2 * s, 210 * s * fl * (0.7 + 0.3 * lvl), WARM.rgb, 0.55 * lvl);
  glow(ctx, lx, ly, 0, 40 * s, '255,240,200', 0.75 * lvl);
  ctx.save(); ctx.translate(lx - 12, G.base + 14); ctx.scale(1, 0.28); glow(ctx, 0, 0, 4, 230 * s * fl, WARM.rgb, 0.4 * lvl); ctx.restore();
  // one firefly lifts off the lantern and drifts up along the trail
  const ft = (api.bt ?? 0) - (api.params.firefly ?? 0.9), fd = api.params.fireflyDur ?? 5.5;
  if (ft > 0 && ft < fd) {
    const v = ft / fd, [tx, ty] = polyAt(TRAIL.slice(6), Math.pow(v, 0.8));
    const from = [lx + 6 * s, ly + 4 * s], w = ease(v * 3), px = lerp(from[0], tx, w) + 14 * Math.sin(ft * 2.1) * s, py = lerp(from[1], ty - 70 * villageScale(ty) * (1 - v * 0.5), w) + 9 * Math.sin(ft * 3.3 + 1) * s;
    const blinkA = 0.55 + 0.45 * Math.sin(ft * 4.2) ** 2, a = blinkA * Math.min(1, ft / 0.4) * Math.min(1, (fd - ft) / 0.8), fs = villageScale(py);
    glow(ctx, px, py, 0, 26 * fs, '214,255,140', 0.55 * a);
    ctx.fillStyle = `rgba(246,255,200,${a})`; ctx.beginPath(); ctx.arc(px, py, 2.4 * fs, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ───────────── the crest figure (6.6) ─────────────
// Nell sitting with her back to the stone, facing left, as a simple dark shape; one fleck of her scarf.
function drawCrestFigure(ctx, u, api) {
  const o = farHillOf(api);
  if (!o) return;
  const p = o.params, G = hillGeom(api, p);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const q = 0.2 / 270, bx = STONE.x - STONE.w * 0.5 - 6 * q, by = hillTop(bx) - 0.004, U = G.U, haze = hazeOf(p), hz = hazeRGB(api);
  const P = (dx, dy) => G.at(bx + dx * q, by + dy * q);          // figure units (the rig's): x right, y up
  const sil = [[-104, 0], [-110, 12], [-96, 24], [-60, 30], [-40, 36], [-30, 70], [-26, 96], [-14, 104], [6, 104], [14, 92], [10, 58], [4, 18], [2, 0]].map(([a, b]) => P(a, b));
  const col = `rgb(${Math.round(lerp(40, hz[0], haze * 0.45))},${Math.round(lerp(38, hz[1], haze * 0.45))},${Math.round(lerp(58, hz[2], haze * 0.45))})`;
  ctx.fillStyle = col; ctx.beginPath(); sil.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
  const [hx, hy] = P(-8, 116), [bnx, bny] = P(4, 126), hr = 15 * q * U;
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(bnx, bny, hr * 0.5, 0, 7); ctx.fill();
  // the scarf: one saturated fleck at the neck, its end trailing down her back
  ctx.fillStyle = '#6f9a3c';
  ctx.beginPath(); const s0 = P(-18, 100), s1 = P(10, 102), s2 = P(14, 82), s3 = P(-12, 92);
  ctx.moveTo(...s0); ctx.lineTo(...s1); ctx.lineTo(...s2); ctx.lineTo(...s3); ctx.closePath(); ctx.fill();
  ctx.lineWidth = Math.max(1, 6 * q * U); ctx.strokeStyle = '#5e8a34'; ctx.beginPath(); ctx.moveTo(...P(-14, 96)); ctx.quadraticCurveTo(...P(-26, 80), ...P(-22, 64)); ctx.stroke();
  ctx.restore();
}

// ───────────── the eye glint (6.8) ─────────────
// The eye in the tortoise's head frame is at (4.6, -2.4) and the closed mouth at (6.5, 3.8): the drawn head and mouth
// give the head frame's rotation and scale on screen, so the glint follows the head as it lifts.
function drawEyeGlint(ctx, u, api) {
  const a = api.actor(api.params.who ?? 'pebble');
  if (!a) return;
  const f = a.face || 1, [hx, hy] = api.toScreen(a.head), [mx, my] = api.toScreen(a.mouth);
  const wm = [f * 6.5, 3.8], m = [mx - hx, my - hy], s = Math.hypot(...m) / Math.hypot(...wm);
  if (!(s > 0.05)) return;
  const phi = Math.atan2(m[1], m[0]) - Math.atan2(wm[1], wm[0]), loc = [f * 5.3, -2.25], c = Math.cos(phi), sn = Math.sin(phi);
  const ex = hx + s * (loc[0] * c - loc[1] * sn), ey = hy + s * (loc[0] * sn + loc[1] * c);
  const blinkHide = 1 - clamp(((a.st.blink ?? 0) - 0.25) / 0.35), k = ease((u - 0.1) / 0.22) * (1 - 0.5 * ease((u - 0.88) / 0.12)) * blinkHide;
  if (k <= 0.01) return;
  const r = Math.max(1.2, 0.42 * s), tw = 0.8 + 0.2 * Math.sin((api.bt ?? 0) * 5.3);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  glow(ctx, ex, ey, 0, r * 5, '255,196,96', 0.45 * k);
  ctx.fillStyle = `rgba(255,236,170,${k})`; ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(255,255,236,${k})`; ctx.beginPath(); ctx.arc(ex - r * 0.2, ey - r * 0.2, r * 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(255,226,150,${0.6 * k * tw})`;
  for (const ang of [0, Math.PI / 2]) { ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang + 0.3); ctx.beginPath(); ctx.ellipse(0, 0, r * 3.2 * tw, r * 0.22, 0, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.restore();
}

// ───────────── the moon on the star (9.3) ─────────────
// The star sits at (-16.2, -30.2) in the tortoise's shell frame (STAR_C in tortoise.mjs), radius 6.6 units; the shell
// frame turns by the pose's br about (0, -14) and drops by its by.
export function starPoint(a) {
  const p = a.st?.pose || {}, br = p.br ?? 0, by = p.by ?? 0, size = a.st?.params?.size ?? 1;
  const q = [-16.2, -30.2 + 14], r = [q[0] * Math.cos(br) - q[1] * Math.sin(br), q[0] * Math.sin(br) + q[1] * Math.cos(br)];
  const g = [r[0], r[1] - 14 + by - (p.lift || 0)];
  return { x: a.x + (a.face || 1) * g[0] * a.s * size, y: a.y + (a.sink || 0) + g[1] * a.s * size, r: 6.6 * a.s * size };
}
function drawStarHighlight(ctx, u, api) {
  const a = api.actor(api.params.who ?? 'pebble');
  if (!a) return;
  const st = starPoint(a), [x, y] = api.toScreen([st.x, st.y]), R = st.r * api.cam.zoom, k = ease(u / 0.25) * (api.params.strength ?? 1);
  if (k <= 0.01 || R < 1) return;
  const f = a.face || 1, glide = lerp(0.9, -0.5, ease(u)), ang = f > 0 ? -0.62 : 0.62, sx = x + Math.cos(ang) * glide * R * f, sy = y + Math.sin(ang) * glide * R;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  // the sheen: a long soft ellipse gliding across the scute
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(2.6, 0.55);
  glow(ctx, 0, 0, 0, R * 1.2, '214,228,255', 0.36 * k); ctx.restore();
  // the ghost star catches it: its five points pale, brightest where the sheen is
  const rot0 = -Math.PI / 2 + 0.17, P = [];
  for (let i = 0; i < 10; i++) { const t = rot0 + (i * Math.PI) / 5, r = i % 2 ? R * 0.42 : R * 0.95; P.push([x + Math.cos(t) * r * f, y + Math.sin(t) * r]); }
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.7);
  g.addColorStop(0, `rgba(226,234,255,${0.3 * k})`); g.addColorStop(1, `rgba(226,234,255,${0.05 * k})`);
  ctx.fillStyle = g; path(ctx, P); ctx.fill();
  ctx.restore();
}

/** The far hill and its stone for the api's frame (screen space), lit by the scene's clock. */
function drawFarHill(ctx, api, p) {
  const G = hillGeom(api, p), d = crestDayT(api) ?? dayTAt(p, api.su);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (drawHill(ctx, api, p, G, d)) drawStone(ctx, api, p, G, d);
  ctx.restore();
}

// ───────────── a patch over one set layer ─────────────
// The frame's depth-of-field switch as the engine sets it for the set's back layers (frame.mjs dofRadius > 0).
const dofOf = api => { const s = api.shot || {}; if (s.dof === false || s.dof === 0) return 0; return s.dof === true || typeof s.dof === 'number' || api.cam.zoom > 2.2 ? 2 : 0; };
/** Re-render what lies behind a painted feature of the set layer with parallax k (poly: world points on that layer's
 *  plane), inside the poly: the sky, the scene's far hill and every other back layer, without that layer. */
function drawPatch(ctx, api) {
  const p = api.params || {}, S = api.set, cam = api.cam, { W, H } = api, k = p.k ?? 1, z = cam.zoom;
  const dx = (cam.cx - S.refX) * (1 - k), dy = (cam.cy - S.refY) * (1 - k) * 0.4;
  const pts = (p.poly || []).map(([x, y]) => [(x + dx - cam.cx) * z + W / 2, (y + dy - cam.cy) * z + H / 2]);
  if (pts.length < 3 || pts.every(q => q[0] < 0) || pts.every(q => q[0] > W) || pts.every(q => q[1] < 0) || pts.every(q => q[1] > H)) return;
  const sky = api.shot.skyAt(api.t), all = S.L, hill = farHillOf(api);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.clip();
  S.drawSky(ctx, cam, sky, api.t);
  if (hill) drawFarHill(ctx, api, hill.params || {});
  ctx.setTransform(z, 0, 0, z, W / 2 - cam.cx * z, H / 2 - cam.cy * z);
  S.L = all.filter(ly => Math.abs(ly.k - k) > 1e-6 && !ly.front && ly.k <= 1);
  try { S.drawBack(ctx, cam, { t: api.t, dof: dofOf(api), haze: sky }); } finally { S.L = all; }
  ctx.restore();
}

export const overlays = {
  'far-hill': { layer: 'sky', draw(ctx, api) { drawFarHill(ctx, api, api.params || {}); } },
  'set-patch': { layer: 'back', draw: drawPatch },
  'empty-house': { layer: 'sky', draw(ctx, api) { if (api.set) api.set.lamps = 0; } },
  'pressed-trail': {
    layer: 'back',
    draw(ctx, api) {
      const k = (api.params.faint ?? 0.3) + (1 - (api.params.faint ?? 0.3)) * revealAt(api), r = rng(6200), n = 220;
      for (let i = 0; i < n; i++) {
        const [x, y, a] = polyAt(TRAIL, i / n + (r() - 0.5) * 0.004), s = villageScale(y), w = (16 + r() * 10) * s, off = (r() - 0.5) * 12 * s;
        ctx.fillStyle = `rgba(48,74,44,${(0.16 + r() * 0.12) * k})`;
        blob(ctx, x - Math.sin(a) * off, y + Math.cos(a) * off * 0.4, w * 0.9, w * 0.22, a, r, 7);
        if (r() < 0.35) { ctx.fillStyle = `rgba(190,206,150,${0.12 * k})`; blob(ctx, x - Math.sin(a) * off * 1.6, y + Math.cos(a) * off * 0.6 - 2 * s, w * 0.5, w * 0.1, a + 0.2, r, 6); }
      }
    },
  },
};

export const custom = {
  reflection: { layer: 'front', draw: drawReflection },
  'lantern-reveal': { layer: 'grade', draw: drawLantern },
  'crest-figure': { layer: 'sky', draw: drawCrestFigure },
  'eye-glint': { layer: 'grade', draw: drawEyeGlint },
  'star-highlight': { layer: 'grade', draw: drawStarHighlight },
};
