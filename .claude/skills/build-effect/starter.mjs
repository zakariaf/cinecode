// A starter effect file: one overlay, one custom beat and one sound, complete and passing `cinecode verify-effect`.
// Copy it to films/<slug>/effects/<name>.mjs (or <project>/cinecode/effects/<name>.mjs); every export is optional
// and has the same shape as in custom.mjs. Deterministic and stateless: draw only from api.t / u, api.seed, the
// params and a seeded rng whose numbers are all drawn up front (frames are drawn out of order, by several workers).
import { rng } from 'cinecode/lib';

// Overlay (a scene's "overlays": [{ "name": "glow", "params": { "who": "glim" } }]): a warm light that follows an
// actor. On the grade layer (screen pixels, after the time-of-day grade), so night doesn't turn it grey.
export const overlays = {
  glow: {
    layer: 'grade',
    draw(ctx, api) {
      const a = api.actor(api.params.who);                     // null while the actor is off stage
      if (!a || !a.box) return;
      const [x0, y0, x1, y1] = a.box, [sx, sy] = api.toScreen([(x0 + x1) / 2, (y0 + y1) / 2]);
      const R = (api.params.radius ?? 60) * a.s * api.cam.zoom, k = 0.85 + 0.15 * Math.sin(api.t * 2.4);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      g.addColorStop(0, `rgba(255,220,130,${0.45 * k})`); g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
    },
  },
};

// Custom beat ({ "do": "custom", "name": "puff", "who": "pip", "dur": 0.8 }): a puff of dust at an actor's feet,
// in world coordinates (after the actors). u goes 0 → 1 across the beat.
export const custom = {
  puff: {
    layer: 'world',
    sfx: [{ at: 0, name: 'twinkle', gain: 0.4 }],             // a built-in effect name or one of `sounds` below
    draw(ctx, u, api) {
      const a = api.actor(api.params.who);
      if (!a) return;
      const r = rng(api.seed), s = a.s || 1;
      for (let i = 0; i < 14; i++) {
        const ang = Math.PI + r() * Math.PI, sp = (20 + r() * 40) * s, size = (4 + r() * 6) * s, delay = r() * 0.3;   // every number first
        const k = (u - delay) / (1 - delay);
        if (k <= 0) continue;
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.fillStyle = '#c8b48a';
        ctx.beginPath(); ctx.arc(a.x + Math.cos(ang) * sp * k, a.y - 4 * s + Math.sin(ang) * sp * k * 0.4, size * (0.6 + k), 0, Math.PI * 2); ctx.fill();
      }
    },
  },
};

// Sound ({ "sfx": "twinkle" }): ({ seed, dur, params }) → Float32Array, 48 kHz mono, peak well under 1.
export const sounds = {
  twinkle: ({ dur = 0.8 } = {}) => {
    const sr = 48000, n = Math.round(sr * dur), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = 0.2 * Math.min(1, t / 0.003) * Math.exp(-t * 6) * Math.sin(2 * Math.PI * 1760 * t); }
    return out;
  },
};
