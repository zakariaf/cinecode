// Custom code for the test film: a warm beam of morning light that sweeps across the stump (a custom beat),
// soft sun rays behind the hills (an overlay on the sky layer) and a tiny bell (a custom sound).
export const custom = {
  sunbeam: {
    layer: 'world',
    sfx: [{ at: 0, name: 'chime', gain: 0.3 }],
    draw(ctx, u, api) {
      const a = api.anchor('stump_top'), k = Math.sin(Math.PI * u);
      if (k <= 0) return;
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(a.x - 260, a.y - 700, a.x + 40, a.y + 20);
      g.addColorStop(0, `rgba(255,236,190,0)`); g.addColorStop(0.55, `rgba(255,232,170,${0.32 * k})`); g.addColorStop(1, 'rgba(255,232,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(a.x - 420, a.y - 760); ctx.lineTo(a.x - 140, a.y - 760); ctx.lineTo(a.x + 120, a.y + 40); ctx.lineTo(a.x - 90, a.y + 40); ctx.closePath(); ctx.fill();
    },
  },
};

export const overlays = {
  // fan of pale rays from a sun point up-left of the frame, breathing slowly; fades as the scene goes on
  sunrays: {
    layer: 'sky',
    draw(ctx, api) {
      const { W, H, su, t, params } = api, n = params.rays ?? 5, warm = params.warmth ?? 0.8, k = 0.22 * (1 - 0.6 * su);
      const ox = W * 0.12, oy = -H * 0.18;
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < n; i++) {
        const a = 0.55 + i * 0.16 + 0.02 * Math.sin(t * 0.4 + i * 1.7), w = 0.035 + 0.015 * ((i * 7) % 3);
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * W, oy + Math.sin(a) * W);
        g.addColorStop(0, `rgba(255,${Math.round(225 + 20 * warm)},${Math.round(200 - 40 * warm)},${k})`); g.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a - w) * W * 1.4, oy + Math.sin(a - w) * W * 1.4);
        ctx.lineTo(ox + Math.cos(a + w) * W * 1.4, oy + Math.sin(a + w) * W * 1.4);
        ctx.closePath(); ctx.fill();
      }
    },
  },
};

// a tiny bell: two inharmonic partials with a quick strike and a long decay (48 kHz mono, deterministic)
export const sounds = {
  'tiny-bell': ({ dur = 1.6 } = {}) => {
    const sr = 48000, n = Math.round(sr * dur), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr, e = Math.min(1, t / 0.002) * Math.exp(-t * 3.2);
      out[i] = 0.35 * e * (Math.sin(2 * Math.PI * 2093 * t) + 0.45 * Math.sin(2 * Math.PI * 5370 * t) * Math.exp(-t * 6));
    }
    return out;
  },
};
