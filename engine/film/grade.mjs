// Time of day: sky crossfades and the colour grade (ported from the legacy engine: a soft-light wash, a multiply
// tint, a vignette and animated film grain), plus a few story grades (memory, dream) layered on top; mixStory blends
// two story grades (a shot's grade → gradeTo). Night and twilight end with a contrast stretch about a dark pivot (con),
// so a moonlit close-up keeps real darks instead of going flat and milky; a story grade's bloom is part of the scene's
// light (darkened by night like everything else), and at night a close shot's vignette closes in around its subject.
// Dawn grades the land too (a rose-gold light over the meadow, not only a pink sky). SUN / sunOf: how long and how
// strong the sun's cast shadows are at each time of day (frame.mjs throws them). The memory grade is a sepia storybook
// plate inside a torn cream page edge (deckle, drawn last over the picture; mixStory narrows it away with the grade).
import { rng, canvas, noise1 } from '../core/lib.mjs';
import { paper } from '../paint/atmos.mjs';
import { clamp, lerp, ease } from './util.mjs';

export const GR = {
  dawn: { sl: [255, 182, 168, 0.5], mul: [255, 214, 224], vig: 0.36 },
  morning: { sl: [255, 232, 190, 0.22], mul: [255, 255, 255], vig: 0.3 },
  noon: { sl: [255, 246, 220, 0.12], mul: [255, 255, 252], vig: 0.28 },
  afternoon: { sl: [255, 214, 150, 0.32], mul: [255, 246, 232], vig: 0.32 },
  golden: { sl: [255, 168, 90, 0.46], mul: [255, 228, 198], vig: 0.36 },
  sunset: { sl: [255, 128, 80, 0.5], mul: [246, 198, 186], vig: 0.42 },
  twilight: { sl: [150, 120, 210, 0.4], mul: [178, 168, 212], vig: 0.48, con: 1.12 },
  night: { sl: [90, 110, 210, 0.45], mul: [92, 102, 156], vig: 0.56, con: 1.6 },
};
// con: contrast slope after the tint, about a dark pivot (CON_PIVOT of full scale): the multiply that makes night
// squeezes every value into the bottom third, so close shots (all mid-tone skin and soft set) go flat and milky;
// stretching about a low pivot gives back real darks and brighter moonlit lights without lifting the whole frame.
export const CON_PIVOT = 0.2;
// Story grades applied after the time-of-day grade: { sat (saturation 0..1), sepia (0..1), bloom, vig, deckle (0..1:
// the torn page edge round the picture, at full width when 1) }
export const STORY = {
  memory: { sat: 0.5, sepia: 0.68, vig: 0.22, bloom: 0.18, deckle: 1 },
  dream: { sat: 0.8, sepia: 0.1, vig: 0.12, bloom: 0.3 },
  none: null,
};
export const isNight = name => name === 'night' || name === 'twilight';

// The sun's cast shadows: len = shadow length as a share of the caster's height (short at noon, long at dawn, golden
// hour and sunset), a = strength (none at twilight and night: the moon's are too faint to paint).
export const SUN = {
  dawn: { len: 1.2, a: 0.3 }, morning: { len: 0.7, a: 0.38 }, noon: { len: 0.25, a: 0.42 }, afternoon: { len: 0.8, a: 0.42 },
  golden: { len: 1.5, a: 0.46 }, sunset: { len: 1.9, a: 0.36 }, twilight: { len: 1.9, a: 0 }, night: { len: 0, a: 0 },
};
// A sky crossfade list → { len, a }.
export function sunOf(list) {
  let len = 0, a = 0, tot = 0;
  for (const [name, w] of list || []) { const S = SUN[name] || SUN.morning; if (!(w > 0)) continue; len += S.len * w; a += S.a * w; tot += w; }
  return tot ? { len: len / tot, a: a / tot } : { ...SUN.morning };
}

export function mixGrade(list) {
  let tot = 0; const g = { sl: [0, 0, 0, 0], mul: [0, 0, 0], vig: 0, con: 0 };
  for (const [name, a] of list) {
    const G = GR[name] || GR.morning; if (!(a > 0)) continue; tot += a;
    for (let i = 0; i < 4; i++) g.sl[i] += G.sl[i] * a;
    for (let i = 0; i < 3; i++) g.mul[i] += G.mul[i] * a;
    g.vig += G.vig * a; g.con += (G.con ?? 1) * a;
  }
  if (!tot) return { ...GR.morning, con: 1 };
  g.sl = g.sl.map(v => v / tot); g.mul = g.mul.map(v => v / tot); g.vig /= tot; g.con /= tot;
  return g;
}

// Blend of two story grades (null = no story grade): saturation, sepia, vignette and bloom move linearly.
const NO_STORY = { sat: 1, sepia: 0, vig: 0, bloom: 0, deckle: 0 };
export function mixStory(a, b, u) {
  if (a === b) return a;
  if (u <= 0) return a; if (u >= 1) return b;
  const A = a || NO_STORY, B = b || NO_STORY, o = {};
  for (const k of Object.keys(NO_STORY)) o[k] = lerp(A[k] ?? NO_STORY[k], B[k] ?? NO_STORY[k], u);
  return o;
}

// Progress of a change over a span: eased across its middle 80% (a scene's or a shot's time of day, a gradeTo).
export const spanU = (t0, t1, t) => ease((t - t0 - (t1 - t0) * 0.1) / ((t1 - t0) * 0.8 || 1));

// A time spec → sky crossfade list at time t. A {from, to} change happens over the middle 80% of the span.
export function skyList(time, t0, t1, t, fallback = 'morning') {
  if (!time) return [[fallback, 1]];
  if (typeof time === 'string') return [[time, 1]];
  const u = spanU(t0, t1, t);
  if (u <= 0) return [[time.from, 1]];
  if (u >= 1) return [[time.to, 1]];
  return [[time.from, 1 - u], [time.to, u]];
}

// y = p + (x - p)·k as CSS filters (contrast pivots at 0.5, brightness scales): brightness b = k(1 − 2p) + 2p, contrast k / b.
export function contrastFilter(k, p = CON_PIVOT) {
  const b = k * (1 - 2 * p) + 2 * p;
  return `contrast(${(k / b).toFixed(4)}) brightness(${b.toFixed(4)})`;
}
const COPY = new Map();
function copyOf(ctx, W, H) {
  const key = `${W}x${H}`;
  if (!COPY.has(key)) COPY.set(key, canvas(W, H));
  const [c, x] = COPY.get(key);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.filter = 'none';
  x.drawImage(ctx.canvas, 0, 0);
  return c;
}

let GRAIN = null;
function grain() {
  if (!GRAIN) GRAIN = Array.from({ length: 4 }, (_, k) => {
    const [c, x] = canvas(960, 540), im = x.createImageData(960, 540), r = rng(800 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() - 0.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); return c;
  });
  return GRAIN;
}

// Grade the frame in screen space. g: mixGrade() result; story: STORY entry or null; t: film time (grain at 12 fps);
// focus: { x, y, r, k } the subject of a close shot (screen centre and radius of its heads, k 0..1 how much to light it).
export function grade(ctx, g, t, W, H, story = null, focus = null) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(${g.sl.slice(0, 3).map(Math.round).join(',')},${g.sl[3].toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  // a story grade's bloom is a haze in the scene's light: the time of day's tint darkens it with everything else, so
  // a remembered night keeps its blacks
  if (story?.bloom) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,240,214,${(story.bloom * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${g.mul.map(Math.round).join(',')})`; ctx.fillRect(0, 0, W, H);
  if (story) {
    if (story.sat < 1) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${(1 - story.sat).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (story.sepia) { ctx.globalCompositeOperation = 'color'; ctx.fillStyle = `rgba(176,136,92,${(story.sepia * 0.6).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  }
  // night keeps its darks: a contrast stretch about a dark pivot (after any story grade, so its bloom can't fog it)
  if ((g.con ?? 1) > 1.005 && ctx.canvas) {
    const c = copyOf(ctx, W, H);
    ctx.globalCompositeOperation = 'copy'; ctx.filter = contrastFilter(g.con); ctx.drawImage(c, 0, 0); ctx.filter = 'none';
  }
  ctx.globalCompositeOperation = 'source-over';
  // at night a close shot's subject sits in a pool of moonlight: the vignette centres on its heads and closes in, so
  // the enlarged, soft set around it falls off into the dark instead of filling the frame with a flat mid-tone
  const D = Math.hypot(W, H) / 2, n = focus ? clamp(((g.con ?? 1) - 1) / 0.6) * clamp(focus.k ?? 1) : 0;
  const vx = lerp(W / 2, focus?.x ?? W / 2, n), vy = lerp(H / 2, focus?.y ?? H / 2, n);
  const r0 = lerp(D * 0.38, Math.min(focus?.r ?? 0, D * 0.5), n), r1 = lerp(D * 1.18, Math.min(focus?.r ?? 0, D * 0.5) + D * 0.6, n);
  const vig = Math.min(0.9, g.vig + (story?.vig || 0) + 0.3 * n);
  const v = ctx.createRadialGradient(vx, vy, r0, vx, vy, r1);
  v.addColorStop(0, 'rgba(30,25,45,0)'); v.addColorStop(1, `rgba(30,25,45,${vig.toFixed(3)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.055;
  ctx.drawImage(grain()[Math.floor(t * 12 + 1e-6) % 4], 0, 0, W, H);
  ctx.restore();
}

// The torn page edge of a storybook plate: cream paper with its grain, a fibrous torn inner edge and the faint shadow
// that edge throws on the picture; about DECKLE_W of the frame height deep. k (0..1) narrows it out past the frame edge.
export const DECKLE_W = 0.03;
const DECKLE = new Map();
function deckleCanvas(W, H) {
  const key = `${W}x${H}`;
  if (DECKLE.has(key)) return DECKLE.get(key);
  const u = Math.min(W, H) / 1080, bw = DECKLE_W * H, r = rng(7171), slow = noise1(7172), fine = noise1(7173), step = 5 * u;
  // the inner edge: its depth wanders slowly, with a fine torn jitter and a few fibres reaching into the picture
  const depth = s => bw * (0.62 + 0.42 * (slow(s * 0.004) - 0.5) + 0.32 * (fine(s * 0.07) - 0.5)) + (r() < 0.05 ? r() * 0.35 * bw : 0);
  // (each side's run stops short of the corners, which the closing diagonals cut inside the paper)
  const P = [], c0 = 1.6 * bw;
  for (let x = c0; x <= W - c0; x += step) P.push([x, depth(x)]);
  for (let y = c0; y <= H - c0; y += step) P.push([W - depth(W + y), y]);
  for (let x = W - c0; x >= c0; x -= step) P.push([x, H - depth(2 * W + H - x)]);
  for (let y = H - c0; y >= c0; y -= step) P.push([depth(3 * W + 2 * H - y), y]);
  const path = c => { c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const [c, x] = canvas(W, H);
  x.fillStyle = '#efe4cc'; x.fillRect(0, 0, W, H);
  // warm blotches toward the outer edge, then the grain
  const g = x.createLinearGradient(0, 0, 0, bw * 1.4);
  g.addColorStop(0, 'rgba(196,170,124,0.35)'); g.addColorStop(1, 'rgba(196,170,124,0)');
  for (const [tx, ty, rot, len] of [[0, 0, 0, W], [W, 0, Math.PI / 2, H], [W, H, Math.PI, W], [0, H, -Math.PI / 2, H]]) {
    x.save(); x.translate(tx, ty); x.rotate(rot); x.fillStyle = g; x.fillRect(0, 0, len, bw * 1.4); x.restore();
  }
  paper(x, 0.2);
  // the torn fibres: a hairline of darker paper just outside the cut, then the cut itself
  x.save(); path(x); x.lineWidth = 2.2 * u; x.strokeStyle = 'rgba(150,118,76,0.45)'; x.stroke(); x.restore();
  x.save(); path(x); x.globalCompositeOperation = 'destination-out'; x.fill(); x.restore();
  // the page's shadow on the picture, just inside the edge
  x.save(); x.globalCompositeOperation = 'destination-over'; x.filter = `blur(${(5 * u).toFixed(1)}px)`;
  path(x); x.lineWidth = 7 * u; x.strokeStyle = 'rgba(30,20,12,0.42)'; x.stroke(); x.restore();
  DECKLE.set(key, c);
  return c;
}
export function deckle(ctx, k, W, H) {
  if (!(k > 0.002)) return;
  const c = deckleCanvas(W, H), bw = DECKLE_W * H, d = Math.min(1, k);
  // narrowing: the page is drawn larger about the centre so its inner edge sits at d of its depth
  const kx = (W / 2 - bw * d) / (W / 2 - bw), ky = (H / 2 - bw * d) / (H / 2 - bw);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.drawImage(c, W / 2 - (W / 2) * kx, H / 2 - (H / 2) * ky, W * kx, H * ky);
  ctx.restore();
}

// Fade to black (a = 0..1) over the whole frame.
export function black(ctx, a, W, H) {
  if (!(a > 0)) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0,0,0,${clamp(a).toFixed(4)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
}
export { lerp };
