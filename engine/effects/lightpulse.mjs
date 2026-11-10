// Light travelling from the Sun to a planet: a bright pulse with a fading trail crosses the frame over the first 85%
// of the beat, eased, and flashes on the planet's lit limb as it arrives. A custom beat; time its `dur` to the line it
// illustrates ("with": "prev").
//
// Beat params: from (where the light leaves: an actor, at its depth, or [fx, fy], fractions of the frame), to (a planet
// actor, required), col (rgb, default a warm white).
// Layer `grade`: emitted light, after the grade.
import { clamp, lerp, easeInOut } from '../core/lib.mjs';
import { globeOf } from '../paint/planets.mjs';

export const custom = {
  lightpulse: {
    layer: 'grade',
    draw(ctx, u, api) {
      const p = api.params || {}, W = api.W, H = api.H, k = H / 1080, col = p.col || '255,236,180';
      const g = globeOf(api, p.to), src = Array.isArray(p.from) ? null : api.actor(p.from);
      if (!g || (!Array.isArray(p.from) && !src)) return;
      const A = src ? api.project([src.head[0], src.head[1], src.z || 0]) : [p.from[0] * W, p.from[1] * H];
      const c = g.sc, Rs = g.sR, L = Math.hypot(c[0] - A[0], c[1] - A[1]) || 1;
      const B = [c[0] - ((c[0] - A[0]) / L) * Rs * 0.95, c[1] - ((c[1] - A[1]) / L) * Rs * 0.95];
      const travel = clamp(u / 0.85), q = easeInOut(travel) * 0.6 + travel * 0.4;
      ctx.globalCompositeOperation = 'lighter';
      // the bright pulse and its trail
      for (let i = 0; i < 18; i++) {
        const v = q - i * 0.012;
        if (v < 0 || travel >= 1) break;
        const x = lerp(A[0], B[0], v), y = lerp(A[1], B[1], v), rr = (10 - i * 0.45) * k;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rr * 3);
        gr.addColorStop(0, `rgba(${col},${(0.9 * (1 - i / 18)).toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gr; ctx.fillRect(x - rr * 3, y - rr * 3, rr * 6, rr * 6);
      }
      // the flash on arrival
      if (u > 0.85) {
        const f = (u - 0.85) / 0.15, rr = Rs * (0.2 + 0.6 * f), a = 0.55 * (1 - f);
        const gr = ctx.createRadialGradient(B[0], B[1], 0, B[0], B[1], rr);
        gr.addColorStop(0, `rgba(${col},${a.toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gr; ctx.fillRect(B[0] - rr, B[1] - rr, rr * 2, rr * 2);
      }
    },
  },
};
