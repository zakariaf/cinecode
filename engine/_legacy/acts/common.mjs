// Shared staging helpers: paths, depth-sorted drawing, perched animals, the crowd, the scarf.
import { rng, clamp, lerp, smooth, path, ell, ink } from '../lib.mjs';
import { branchTop } from '../paint.mjs';
import { drawHare, drawTortoise, drawFox, drawOwl, drawSquirrel, drawBird, drawMouse, drawHedgehog, drawBadger, drawDeer, drawButterfly, HP, gallop, mixPose } from '../cast.mjs';
import { TWOS } from '../engine.mjs';
import { OWL_TREE, MEADOW_BRANCH } from '../sets.mjs';

// Catmull-Rom path through points, walked by distance.
export function track(P, n = 20) {
  const S = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const u = k / n, u2 = u * u, u3 = u2 * u; S.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3))); }
  }
  S.push(P[P.length - 1]);
  const L = [0]; for (let i = 1; i < S.length; i++) L.push(L[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  return {
    len: L[L.length - 1],
    at(d) {
      d = clamp(d, 0, L[L.length - 1]); let i = 1; while (i < L.length - 1 && L[i] < d) i++;
      const u = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), a = S[i - 1], b = S[i];
      return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), dx: b[0] - a[0], dy: b[1] - a[1] };
    },
  };
}
// Distance along a run at constant speed v that ends in a skid of length k.
export function runDist(t, len, v, k = 0) {
  const s0 = len - k; if (v * t < s0 || !k) return Math.min(len, v * t);
  const a = v * v / (2 * k), tau = Math.min(t - s0 / v, v / a); return s0 + v * tau - a * tau * tau / 2;
}
// Draw a list of { y, fn } back to front.
export const depth = (ctx, items) => items.filter(Boolean).sort((a, b) => a.y - b.y).forEach(i => i.fn(ctx));

// ── perched animals. A bird's feet are 9 units below its origin in the 'fold' pose. ──
export const birdOn = (ctx, b, px, s, face, col, hop = 0) => drawBird(ctx, px, branchTop(b, px) - 9 * s - hop * s, s, face, 'fold', col);
// A bird flying from (x0,y0) to land on branch b at px: flaps, glides in, folds. Returns true once landed.
export function birdLand(ctx, b, px, s, face, col, t, t0, dur, x0, y0) {
  const u = clamp((t - t0) / dur), e = 1 - (1 - u) * (1 - u), x1 = px, y1 = branchTop(b, px) - 9 * s;
  if (u >= 1) { drawBird(ctx, x1, y1, s, face, 'fold', col); return true; }
  if (t < t0) return false;
  const x = lerp(x0, x1, e), y = lerp(y0, y1, e) - Math.sin(Math.PI * e) * 60;
  const pose = u > 0.85 ? 'up' : ['up', 'mid', 'down', 'mid'][Math.floor(TWOS(t) * 12 / 2) % 4];
  drawBird(ctx, x, y, s, face, pose, col); return false;
}
// Free flight across the sky (never lands): used for birds high over the scene.
export function birdFly(ctx, x0, y0, x1, y1, s, t, t0, dur, col = '#4a3a30') {
  const u = (t - t0) / dur; if (u < 0 || u > 1) return;
  const pose = ['up', 'mid', 'down', 'mid', 'glide', 'glide'][Math.floor(TWOS(t) * 12 / 2) % 6];
  drawBird(ctx, lerp(x0, x1, u), lerp(y0, y1, u) + Math.sin(u * 9) * 8, s, Math.sign(x1 - x0), pose, col);
}
export function butterflies(ctx, t, list) {
  for (const [x, y, w, h, col, ph] of list) drawButterfly(ctx, x + Math.sin(t * 0.7 + ph) * w + Math.sin(t * 2.3 + ph) * 12, y + Math.sin(t * 1.1 + ph * 2) * h, 1.1, t + ph, col);
}

// ── the meadow: owl in its hollow, squirrel and birds on the low branch ──
export const HOLLOW = OWL_TREE.hollow;
export const hollowClip = () => ell(HOLLOW.cx, HOLLOW.cy, HOLLOW.rx, HOLLOW.ry, 52, 1);
export const owlInHollow = (ctx, ex = {}, hoot = 0) => drawOwl(ctx, HOLLOW.cx, HOLLOW.cy + HOLLOW.ry - 2, 1.15, 1, { ex, hoot }, hollowClip());
export const SQ_X = 640;
export const squirrelOnMeadow = (ctx, st = {}) => drawSquirrel(ctx, SQ_X, branchTop(MEADOW_BRANCH, SQ_X), 1.35, st.face ?? 1, st);
export const meadowBirds = (ctx, t, cols = ['#6a4a3a', '#8a6a4a']) => { birdOn(ctx, MEADOW_BRANCH, 735, 1.05, -1, cols[0], Math.max(0, Math.sin(t * 5)) * 2 * (Math.sin(t * 0.9) > 0.7)); birdOn(ctx, MEADOW_BRANCH, 790, 1.0, -1, cols[1]); };

// The crowd in the meadow. Nobody stands where the hare's loop or the lane runs, nothing behind a tree.
export const CROWD = {
  mice: [[880, 1182, 1], [912, 1190, 1]],
  hedgehog: [1770, 1212, -1],
  badger: [2330, 950, -1],
  deer: [[2480, 884, -1, 0], [2620, 892, -1, 1]],
  fox: [2210, 1040, -1],
};
export function crowdItems(S, t, st = {}) {
  const items = [];
  const mp = st.mice || 'idle';
  (st.micePos || CROWD.mice).forEach(([x, y, f], i) => items.push({ y, fn: c => drawMouse(c, x, y, S.sAt(y), f, { pose: mp, lift: mp === 'cheer' ? Math.abs(Math.sin(t * 9 + i)) * 6 : 0, ex: st.miceEx }) }));
  { const [x, y, f] = st.hedge || CROWD.hedgehog; items.push({ y, fn: c => drawHedgehog(c, x, y, S.sAt(y), f, { lift: st.cheer ? Math.abs(Math.sin(t * 8)) * 5 : 0 }) }); }
  { const [x, y, f] = CROWD.badger; items.push({ y, fn: c => drawBadger(c, x, y, S.sAt(y), f, { pose: st.cheer ? 'cheer' : 'stand' }) }); }
  CROWD.deer.forEach(([x, y, f, g], i) => items.push({ y, fn: c => drawDeer(c, x, y, S.sAt(y), f, { graze: st.alertDeer ? 0 : g * (0.5 + 0.5 * Math.sin(t * 0.6 + i)), alpha: 0.85 }) }));
  if (st.fox !== false) { const [x, y, f] = CROWD.fox; items.push({ y, fn: c => drawFox(c, x, y, S.sAt(y), f, { pose: 'sit', ...(st.foxSt || {}) }) }); }
  return items;
}

// ── the red scarf the Fox ties round the goal stone ──
export function scarf(ctx, S, t, tied = 1) {
  if (tied <= 0) return;
  const [sx, sy] = S.scarf, hw = S.w * 0.5;
  ctx.save(); ctx.globalAlpha = clamp(tied * 2);
  const band = [[sx - hw + 2, sy - 9], [sx, sy - 6], [sx + hw - 2, sy - 10], [sx + hw - 3, sy + 7], [sx, sy + 11], [sx - hw + 3, sy + 9]];
  ctx.fillStyle = '#c23a2e'; path(ctx, band); ctx.fill(); ctx.save(); path(ctx, band); ctx.clip(); ctx.fillStyle = 'rgba(80,10,10,.35)'; ctx.fillRect(sx + 10, sy - 12, hw, 26); ctx.restore(); ink(ctx, band, 1.1, { seed: 501 });
  const kx = sx - hw + 8, ky = sy; ctx.fillStyle = '#d4483a'; path(ctx, ell(kx, ky, 8, 7, 502, 0.3)); ctx.fill(); ink(ctx, ell(kx, ky, 8, 7, 502, 0.3), 1, { seed: 502 });
  for (const [k, len] of [[0, 46], [1, 38]]) {
    const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10, wv = Math.sin(t * 5 + u * 4 + k) * 6 * u; pts.push([kx - 4 - u * len * 0.55 + wv * 0.3, ky + 4 + u * len * 0.8 + wv]); }
    const W = [...pts.map(([x, y], i) => [x - 4 + i * 0.1, y]), ...pts.slice().reverse().map(([x, y], i) => [x + 4 - i * 0.1, y])];
    ctx.fillStyle = k ? '#b0342a' : '#c94034'; path(ctx, W); ctx.fill(); ink(ctx, W, 0.9, { seed: 503 + k });
  }
  ctx.restore();
}

export { HP, gallop, mixPose, drawHare, drawTortoise, drawFox };
