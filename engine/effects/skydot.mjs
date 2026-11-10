// A planet seen with the naked eye: a steady point of light in the night sky (planets shine without twinkling much),
// with a soft glow. Placed at a world point (x, y) or an anchor, so it sits where the telescope points in every shot of
// the scene; its size stays the same on screen whatever the zoom (it is a point source).
//
// Overlay params: x, y (world px, on the stage) or at (an anchor, at its depth), size (core radius in px at 1080p,
// default 3), col (core colour, default warm white), glow (the halo's rgb, default a pale gold, Saturn's), a (strength
// 0..1, default 1).
// Layer `grade`: emitted light, drawn after the night grade so it stays bright. Keep it clear of heads.
export const overlays = {
  skydot: {
    layer: 'grade',
    draw(ctx, api) {
      const p = api.params || {}, k = api.H / 1080, a = p.a ?? 1;
      const w = p.at ? api.anchor(p.at) : { x: p.x ?? 0, y: p.y ?? 0 }, [sx, sy] = api.project([w.x, w.y, w.z || 0]);
      const r = (p.size ?? 3) * k, glow = p.glow || '255,222,150';
      if (sx < -50 || sx > api.W + 50 || sy < -50 || sy > api.H + 50) return;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 9);
      g.addColorStop(0, `rgba(${glow},${(0.75 * a).toFixed(3)})`); g.addColorStop(0.3, `rgba(${glow},${(0.25 * a).toFixed(3)})`); g.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = g; ctx.fillRect(sx - r * 9, sy - r * 9, r * 18, r * 18);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a; ctx.fillStyle = p.col || '#fff6dc';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    },
  },
};
