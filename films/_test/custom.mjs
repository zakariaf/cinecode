// Custom beats for the test film: a warm beam of morning light that sweeps across the stump.
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
