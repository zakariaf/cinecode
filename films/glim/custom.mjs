// custom.mjs for Glim: the firefly's glow. Glim is the butterfly rig in dark wings with a yellow body; this overlay
// draws his light on the `grade` layer (after the night grade, so it stays warm): a soft halo that lights the dark
// around him and a bright core on his body, breathing slowly. Deterministic: it reads only api.t and the actor.

export const overlays = {
  'firefly-glow': {
    layer: 'grade',
    draw(ctx, api) {
      const a = api.actor(api.params.who || 'glim');
      if (!a || !a.box) return;
      const [x0, y0, x1, y1] = a.box;
      const [sx, sy] = api.toScreen([(x0 + x1) / 2, (y0 + y1) / 2 + (y1 - y0) * 0.1]);
      const z = api.cam.zoom, s = a.s || 1;
      const pulse = 0.82 + 0.18 * Math.sin(api.t * 3.1) * Math.sin(api.t * 1.3 + 0.7);
      const halo = (api.params.halo ?? 70) * s * z, core = (api.params.core ?? 7) * s * z;
      ctx.globalCompositeOperation = 'screen';
      let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, halo);
      g.addColorStop(0, `rgba(255,214,110,${0.42 * pulse})`);
      g.addColorStop(0.35, `rgba(255,190,80,${0.16 * pulse})`);
      g.addColorStop(1, 'rgba(255,180,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, halo, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, core * 2.2);
      g.addColorStop(0, `rgba(255,250,210,${0.95 * pulse})`);
      g.addColorStop(0.4, `rgba(255,226,120,${0.55 * pulse})`);
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, core * 2.2, 0, Math.PI * 2); ctx.fill();
    },
  },
};

// The payoff: from the `lights` mark, fireflies wake one by one all around Tilly's oak (world positions spread
// around an anchor), drift a little and blink. Every random number is drawn up front for every firefly, so each
// frame gets the same sequence (stateless, see docs/effects.md).
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

overlays['firefly-swarm'] = {
  layer: 'grade',
  draw(ctx, api) {
    const t0 = api.marks[api.params.mark || 'lights'];
    if (t0 == null || api.t < t0) return;
    const c = api.anchor(api.params.at || 'den');
    if (!c) return;
    const n = api.params.n ?? 46, spread = api.params.spread ?? 1500, rise = api.params.rise ?? 560;
    const r = rng(7331), z = api.cam.zoom, since = api.t - t0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const dx = (r() - 0.5) * spread, dy = 70 - Math.pow(r(), 0.8) * rise, delay = r() * 2.4, ph = r() * 6.28, w = 1.2 + r() * 1.8, sz = 2.4 + r() * 2.2;
      const k = Math.min(1, Math.max(0, (since - delay) / 0.8));
      if (k <= 0) continue;
      const x = c.x + dx + 22 * Math.sin(api.t * 0.45 + ph), y = c.y + dy + 14 * Math.cos(api.t * 0.37 + ph * 1.3);
      const blink = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(api.t * w + ph), 2);
      const [sx, sy] = api.toScreen([x, y]), R = sz * z;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 4);
      g.addColorStop(0, `rgba(255,248,190,${0.95 * k * blink})`);
      g.addColorStop(0.25, `rgba(230,240,120,${0.45 * k * blink})`);
      g.addColorStop(1, 'rgba(200,230,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, R * 4, 0, Math.PI * 2); ctx.fill();
    }
  },
};
