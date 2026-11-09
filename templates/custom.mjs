// custom.mjs: drawing and sound that belong to this film only. cinecode loads it with film.json (`cinecode check`
// says ", custom.mjs" when it does). Every export is optional: delete what you don't use. See docs/effects.md.
//
// Rules for code in here, the same as for the engine:
//  - deterministic: no Math.random() or Date.now(); derive randomness from api.seed (or a fixed number) with a seeded
//    generator, so every render of a frame is identical;
//  - draw only from the arguments you get (time, params, the api), never from state kept between calls: frames are
//    drawn out of order, by several worker processes at once.

// A small seeded random generator (mulberry32). The engine has its own in engine/core/lib.mjs (rng); a film can
// import it from there too, with a relative path.
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ───────────── custom beats ─────────────
// Used in film.json as { "do": "custom", "name": "glints", "dur": 1.6, "who": "pip" }. The beat lasts `dur` seconds
// (default 1). draw(ctx, u, api) is called on every frame of the beat; u goes 0 → 1 across it. Every field of the
// beat (and of its "params" object) arrives in api.params. `sfx` lists sounds to play at seconds from the beat's start.
export const custom = {
  glints: {
    layer: 'world',                       // world coordinates, drawn after the actors (see docs/effects.md for layers)
    sfx: [{ at: 0, name: 'tiny-bell', gain: 0.6 }],
    draw(ctx, u, api) {
      const a = api.actor(api.params.who);   // the actor's draw state plus head, mouth and box in world coordinates
      if (!a) return;
      const [hx, hy] = a.head, s = a.s, r = rng(api.seed);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        // draw every random number before any `continue`, so each glint gets the same numbers on every frame
        const t0 = r() * 0.5, life = 0.45 + r() * 0.3, ang = -Math.PI / 2 + (r() - 0.5) * 1.6, dist = (30 + r() * 70) * s, size = 4 + r() * 5;
        const k = (u - t0) / life;            // each glint has its own start and life
        if (k <= 0 || k >= 1) continue;
        const x = hx + Math.cos(ang) * dist * k, y = hy - 20 * s + Math.sin(ang) * dist * k, R = size * s * (1 - k * 0.6);
        ctx.globalAlpha = Math.sin(Math.PI * k);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        for (let j = 0; j < 8; j++) { const q = (j * Math.PI) / 4, rr = j % 2 ? R * 0.3 : R; ctx.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
        ctx.closePath(); ctx.fill();
      }
    },
  },
};

// ───────────── overlays ─────────────
// Used in film.json on a scene: "overlays": ["sunbeams"] or [{ "name": "sunbeams", "params": { "rays": 4 } }].
// draw(ctx, api) is called on every frame of the scene. api.su goes 0 → 1 across the scene, api.params are the
// scene's params for it. This one is in screen space ('grade': after the colour grade, so it stays bright).
export const overlays = {
  sunbeams: {
    layer: 'grade',
    draw(ctx, api) {
      const { W, H, t, su, params } = api, n = params.rays ?? 5, k = (params.strength ?? 0.18) * (1 - 0.5 * su);
      const ox = W * 0.08, oy = -H * 0.2;
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < n; i++) {
        const a = 0.6 + i * 0.15 + 0.02 * Math.sin(t * 0.4 + i * 1.7), w = 0.03 + 0.012 * (i % 3);
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * W, oy + Math.sin(a) * W);
        g.addColorStop(0, `rgba(255,240,200,${k})`); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a - w) * W * 1.4, oy + Math.sin(a - w) * W * 1.4);
        ctx.lineTo(ox + Math.cos(a + w) * W * 1.4, oy + Math.sin(a + w) * W * 1.4);
        ctx.closePath(); ctx.fill();
      }
    },
  },
};

// ───────────── sounds ─────────────
// Used in film.json like any built-in effect: { "sfx": "tiny-bell" }, and in custom beats' `sfx` lists.
// ({ seed, dur, params }) → Float32Array, 48 kHz mono, peak well under 1 (the mixer does not normalise it).
export const sounds = {
  'tiny-bell': ({ dur } = {}) => {
    const sr = 48000, n = Math.round(sr * (dur || 1.6)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr, e = Math.min(1, t / 0.002) * Math.exp(-t * 3.2);
      out[i] = 0.12 * e * (Math.sin(2 * Math.PI * 2093 * t) + 0.45 * Math.sin(2 * Math.PI * 5370 * t) * Math.exp(-t * 6));
    }
    return out;
  },
};
