// Time of day: sky crossfades and the colour grade (ported from the legacy engine: a soft-light wash, a multiply
// tint, a vignette and animated film grain), plus a few story grades (memory, dream) layered on top; mixStory blends
// two story grades (a shot's grade → gradeTo).
import { rng, canvas } from '../core/lib.mjs';
import { clamp, lerp, ease } from './util.mjs';

export const GR = {
  dawn: { sl: [255, 196, 160, 0.38], mul: [246, 234, 240], vig: 0.36 },
  morning: { sl: [255, 232, 190, 0.22], mul: [255, 255, 255], vig: 0.3 },
  noon: { sl: [255, 246, 220, 0.12], mul: [255, 255, 252], vig: 0.28 },
  afternoon: { sl: [255, 214, 150, 0.32], mul: [255, 246, 232], vig: 0.32 },
  golden: { sl: [255, 168, 90, 0.46], mul: [255, 228, 198], vig: 0.36 },
  sunset: { sl: [255, 128, 80, 0.5], mul: [246, 198, 186], vig: 0.42 },
  twilight: { sl: [150, 120, 210, 0.4], mul: [178, 168, 212], vig: 0.48 },
  night: { sl: [90, 110, 210, 0.45], mul: [92, 102, 156], vig: 0.56 },
};
// Story grades applied after the time-of-day grade: { sat (saturation 0..1), sepia (0..1), bloom, vig }
export const STORY = {
  memory: { sat: 0.55, sepia: 0.45, vig: 0.22, bloom: 0.18 },
  dream: { sat: 0.8, sepia: 0.1, vig: 0.12, bloom: 0.3 },
  none: null,
};
export const isNight = name => name === 'night' || name === 'twilight';

export function mixGrade(list) {
  let tot = 0; const g = { sl: [0, 0, 0, 0], mul: [0, 0, 0], vig: 0 };
  for (const [name, a] of list) {
    const G = GR[name] || GR.morning; if (!(a > 0)) continue; tot += a;
    for (let i = 0; i < 4; i++) g.sl[i] += G.sl[i] * a;
    for (let i = 0; i < 3; i++) g.mul[i] += G.mul[i] * a;
    g.vig += G.vig * a;
  }
  if (!tot) return { ...GR.morning };
  g.sl = g.sl.map(v => v / tot); g.mul = g.mul.map(v => v / tot); g.vig /= tot;
  return g;
}

// Blend of two story grades (null = no story grade): saturation, sepia, vignette and bloom move linearly.
const NO_STORY = { sat: 1, sepia: 0, vig: 0, bloom: 0 };
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

let GRAIN = null;
function grain() {
  if (!GRAIN) GRAIN = Array.from({ length: 4 }, (_, k) => {
    const [c, x] = canvas(960, 540), im = x.createImageData(960, 540), r = rng(800 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() - 0.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); return c;
  });
  return GRAIN;
}

// Grade the frame in screen space. g: mixGrade() result; story: STORY entry or null; t: film time (grain at 12 fps).
export function grade(ctx, g, t, W, H, story = null) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(${g.sl.slice(0, 3).map(Math.round).join(',')},${g.sl[3].toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${g.mul.map(Math.round).join(',')})`; ctx.fillRect(0, 0, W, H);
  if (story) {
    if (story.sat < 1) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${(1 - story.sat).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (story.sepia) { ctx.globalCompositeOperation = 'color'; ctx.fillStyle = `rgba(176,136,92,${(story.sepia * 0.6).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (story.bloom) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,240,214,${(story.bloom * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  }
  ctx.globalCompositeOperation = 'source-over';
  const D = Math.hypot(W, H) / 2, vig = g.vig + (story?.vig || 0);
  const v = ctx.createRadialGradient(W / 2, H / 2, D * 0.38, W / 2, H / 2, D * 1.18);
  v.addColorStop(0, 'rgba(30,25,45,0)'); v.addColorStop(1, `rgba(30,25,45,${vig.toFixed(3)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.055;
  ctx.drawImage(grain()[Math.floor(t * 12 + 1e-6) % 4], 0, 0, W, H);
  ctx.restore();
}

// Fade to black (a = 0..1) over the whole frame.
export function black(ctx, a, W, H) {
  if (!(a > 0)) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0,0,0,${clamp(a).toFixed(4)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
}
export { lerp };
