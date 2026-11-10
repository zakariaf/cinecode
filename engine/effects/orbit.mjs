// A planet's orbit: a dotted arc through the planet, around a sun off to one side, drawing itself in over the first
// 60% of the beat (the dots under the globe are left out). A custom beat; pair it with a sunglow on that side.
//
// Beat params: who (a planet actor, required), side (-1: the sun is to the left, default; 1: to the right), rx (the
// orbit's half-width, world px, default 14 globe radii), squash (its height / width, default 0.32: seen from a little
// above), span (radians of the arc either side of the planet, default 0.9).
// Layer `back`: behind the actors, at the planet's depth (it scales with it).
import { clamp, easeInOut } from '../core/lib.mjs';
import { globeOf, atDepth } from '../paint/planets.mjs';

const TAU = Math.PI * 2;

export const custom = {
  orbit: {
    layer: 'back',
    draw(ctx, u, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g || !(g.fade > 0)) return;
      const side = p.side ?? -1, sq = p.squash ?? 0.32, span = p.span ?? 0.9, Rx = p.rx ?? g.R * 14, Ry = Rx * sq;
      const C = [g.c[0] + side * Rx, g.c[1]];                 // the sun's side; the planet sits on the near end
      const reveal = easeInOut(clamp(u / 0.6)), s = atDepth(ctx, api, g.z), step = 0.012;
      ctx.globalAlpha *= g.fade;
      ctx.fillStyle = 'rgba(232,226,255,0.55)';
      const a0 = side < 0 ? 0 : Math.PI;
      for (let th = -span; th <= span; th += step) {
        const v = (th + span) / (2 * span);
        if (v > reveal) break;
        const x = C[0] + Math.cos(a0 + th) * Rx, y = C[1] + Math.sin(a0 + th) * Ry;
        if (Math.hypot(x - g.c[0], (y - g.c[1]) / g.ob) < g.R * 1.05) continue;
        ctx.beginPath(); ctx.arc(x, y, (2.2 * api.H / 1080) / s, 0, TAU); ctx.fill();
      }
    },
  },
};
