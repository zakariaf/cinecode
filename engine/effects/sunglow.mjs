// The Sun's glow: a white-hot core in warm halos, laid on with light. At a planet actor (who: the Sun as a `planet`
// rig, body 'sun') it follows the actor at its depth; or at a point of the frame (x, y, fractions; it may be off the
// frame, so only the halo shows at an edge).
//
// An overlay (the whole scene, or the scene overlay's "shots") or a custom beat (pin it "at": 0 with a dur at least the
// shot's and "scope": "shot", for one shot).
// Params: who (an actor) | x, y (fractions of the frame, default -0.1, 0.35) and r (the core's radius, a fraction of
// the frame height, default 0.22); a (strength 0..1, default 1).
// Layer `grade`: emitted light, after the grade, so a dark grade never dims it.
import { globeOf } from '../paint/planets.mjs';

function sunglow(ctx, api) {
  const p = api.params || {}, W = api.W, H = api.H, a = p.a ?? 1;
  let cx, cy, r;
  if (p.who) { const g = globeOf(api, p.who); if (!g) return; [cx, cy] = g.sc; r = g.sR; }
  else { cx = (p.x ?? -0.1) * W; cy = (p.y ?? 0.35) * H; r = (p.r ?? 0.22) * H; }
  ctx.globalCompositeOperation = 'lighter';
  const halo = (r0, r1, rgb, al) => { const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1); g.addColorStop(0, `rgba(${rgb},${(al * a).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(cx - r1, cy - r1, r1 * 2, r1 * 2); };
  halo(r * 0.9, r * 4.5, '255,190,110', 0.28);
  halo(r * 0.6, r * 2.0, '255,226,160', 0.5);
  halo(0, r * 1.15, '255,250,232', 0.95);
}

export const overlays = { sunglow: { layer: 'grade', draw: sunglow } };
export const custom = { sunglow: { layer: 'grade', draw: (ctx, u, api) => sunglow(ctx, api) } };
