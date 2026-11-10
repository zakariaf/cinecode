// Travelling through space: stars stream out from a vanishing point and past the camera, as streaks that lengthen as
// they near the edges. A custom beat: it builds up over the first fifth of its `dur`, holds, and dies away over the
// last third.
//
// Beat params: fx, fy (the vanishing point, fractions of the frame, default the centre), n (streaks, default 240),
// speed (default 1), col (rgb, default a cool white).
// Layer `sky`: over the backdrop, under everything in the scene (a planet ahead stays in front of the streaks).
import { rng, clamp, smooth } from '../core/lib.mjs';

export const custom = {
  starstream: {
    layer: 'sky',
    sfx: [{ at: 0, name: 'wind-swell', gain: 0.35 }],
    draw(ctx, u, api) {
      const p = api.params || {}, W = api.W, H = api.H, k = H / 1080, n = p.n ?? 240, sp = p.speed ?? 1, col = p.col || '225,232,255';
      const env = smooth(0, 0.2, u) * (1 - smooth(0.66, 1, u)), bt = api.bt ?? u * (api.dur || 1);
      if (env <= 0.001) return;
      const cx = (p.fx ?? 0.5) * W, cy = (p.fy ?? 0.5) * H, far = Math.hypot(W, H) * 0.6, r = rng(api.seed || 7);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        // every random number first, so each streak is the same on every frame
        const ang = r() * Math.PI * 2, off = r(), rate = 0.35 + 0.65 * r(), w = 0.6 + 1.6 * r() * r(), br = 0.35 + 0.65 * r();
        const ph = (off + bt * 0.45 * sp * rate) % 1, d0 = far * Math.pow(ph, 2.2), d1 = far * Math.pow(Math.min(1, ph + 0.05 + 0.1 * rate * sp), 2.2);
        const x0 = cx + Math.cos(ang) * d0, y0 = cy + Math.sin(ang) * d0, x1 = cx + Math.cos(ang) * d1, y1 = cy + Math.sin(ang) * d1;
        const a = env * br * clamp(ph * 4) * (1 - smooth(0.85, 1, ph));
        if (a <= 0.01) continue;
        ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`; ctx.lineWidth = w * k * (0.6 + 1.4 * ph);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    },
  },
};
