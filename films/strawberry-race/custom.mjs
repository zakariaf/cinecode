// custom.mjs for The Last Strawberry (the strawberry itself is a film-local rig: rigs/strawberry.mjs).
//  - custom beat `drips`: water dripping off a wet actor (Burr after his wade), with drip sounds.
//  - custom beat `glint`: one star of light on the strawberry's shoulder.
// Deterministic and stateless: everything is drawn from the params, u and a seeded rng.
import { rng } from 'cinecode/lib';

// ───────────── drips: water running off a wet actor ─────────────
// { "do": "custom", "name": "drips", "who": "burr", "dur": 3, "n": 10 }
const drop = (ctx, x, y, r, a) => {
  ctx.globalAlpha = a; ctx.fillStyle = 'rgba(190,225,245,0.95)';
  ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.quadraticCurveTo(x + r, y - r * 0.4, x, y + r); ctx.quadraticCurveTo(x - r, y - r * 0.4, x, y - r * 2.2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
};
export const custom = {
  drips: {
    layer: 'world',
    sfx: [{ at: 0.2, name: 'drip', gain: 0.5 }, { at: 0.9, name: 'drip', gain: 0.4 }, { at: 1.7, name: 'drip', gain: 0.35 }],
    draw(ctx, u, api) {
      const a = api.actor(api.params.who);
      if (!a || !a.box) return;
      const [x0, y0, x1] = a.box, gy = a.y, fwd = (a.face ?? 1) < 0 ? -1 : 1, n = api.params.n ?? 10, dur = api.dur || 1, r = rng(api.seed), s = a.s || 1;
      const fade = Math.min(1, (1 - u) * 4);
      for (let i = 0; i < n; i++) {
        // every random number first, so each drop is the same on every frame
        const t0 = r() * 0.85, life = 0.35 / dur, fx = 0.05 + r() * 0.55, fy = 0.3 + r() * 0.5, rad = (0.9 + r() * 0.6) * s;
        const k = (u - t0) / life;
        if (k <= 0 || k >= 1) continue;
        // from the back half only: drops by the face read as tears
        const x = fwd > 0 ? x0 + (x1 - x0) * fx : x1 - (x1 - x0) * fx, ys = y0 + (gy - y0) * fy, y = ys + (gy - ys) * k * k;
        drop(ctx, x, y, rad, 0.85 * fade);
      }
    },
  },
};

// ───────────── glint: one star of light on the strawberry's shoulder ─────────────
// { "do": "custom", "name": "glint", "who": "berry", "dur": 0.9 }. On the grade layer (emitted light), in screen pixels.
custom.glint = {
  layer: 'grade',
  sfx: [{ at: 0.05, name: 'sparkle', gain: 0.5 }],
  draw(ctx, u, api) {
    const a = api.actor(api.params.who);
    if (!a || !a.box) return;
    const [x0, y0, x1, y1] = a.box, [sx0, sy0] = api.toScreen([x0, y0]), [sx1, sy1] = api.toScreen([x1, y1]);
    const w = sx1 - sx0, h = sy1 - sy0, cx = sx0 + w * (api.params.fx ?? 0.3), cy = sy0 + h * (api.params.fy ?? 0.4);
    const k = Math.sin(Math.PI * Math.min(1, u * 1.15)), R = h * 0.32 * k, rot = 0.4 * u;
    if (R < 0.5) return;
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
    g.addColorStop(0, `rgba(255,248,225,${0.55 * k})`); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(255,252,240,${0.95 * k})`;
    ctx.beginPath();
    for (let j = 0; j < 8; j++) { const q = rot + (j * Math.PI) / 4, rr = j % 2 ? R * 0.14 : (j % 4 ? R * 0.55 : R); ctx.lineTo(cx + Math.cos(q) * rr, cy + Math.sin(q) * rr); }
    ctx.closePath(); ctx.fill();
  },
};
