// A planet's night side: the half of a `planet` actor's globe turned away from the Sun, darkened (multiplied with a
// dark navy, so its seas and land still show faintly), behind a soft terminator. The house shading lights every globe
// from the upper left with only a thin cel crescent, which reads as a fully lit world; this gives a world a real night
// half where the story needs one ("that's our side, in the dark": Earth in 4.1-4.2; Mercury's day/night line;
// Uranus's dark winter half).
//
// Overlay params: who (a planet actor, required), from (where the sunlight comes from: [fx, fy], fractions of the
// frame, off the frame too, default [0, 0.4], the sunglow ladder's height; or an actor id, at its depth: the Sun),
// term (where the terminator crosses the globe's middle, in globe radii from the centre away from the Sun: 0 = half
// lit, default 0.15 = a little past the centre, so a little more than half is lit; negative = a crescent), a (how
// dark the night half is, 0..1, default 0.75), edge (the terminator's soft width either side, in globe radii,
// default 0.12), col (the night's rgb, default '16,20,46').
// The terminator is the half-ellipse a sphere's day/night line makes, square to the Sun's direction on the picture.
//
// Layer `world`, drawn in screen px over everything on the stage inside the globe's disc (a nearer body crossing the
// disc would be darkened with it), before the `grade` layer: a `skydot` on the night side (a town's lights) stays
// bright. Keep it to the shots that need it with the overlay's "shots".
import { globeOf } from 'cinecode/paint/planets';

const TAU = Math.PI * 2;

// the part of the globe past a terminator that crosses the axis at x = k (the frame: +x away from the Sun, the globe's
// centre at 0, radius R): right of the half-ellipse from (0, -R) through (k, 0) to (0, R)
function night(c, k, R) {
  const m = R * 1.1;
  c.beginPath();
  c.moveTo(0, -m);
  c.lineTo(0, -R);
  c.ellipse(0, 0, Math.max(Math.abs(k), R * 0.002), R, 0, -Math.PI / 2, Math.PI / 2, k < 0);
  c.lineTo(0, m); c.lineTo(m, m); c.lineTo(m, -m); c.closePath();
  c.fill();
}

export const overlays = {
  nightside: {
    layer: 'world',
    draw(ctx, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g || !(g.fade > 0) || !(g.sR > 0.5)) return;
      const W = api.W, H = api.H, [cx, cy] = g.sc, R = g.sR;
      let sx, sy;
      if (typeof p.from === 'string') {
        const s = api.actor(p.from); if (!s) return;
        [sx, sy] = api.project([s.head[0], s.head[1], s.z || 0]);
      } else { const f = Array.isArray(p.from) ? p.from : [0, 0.4]; sx = f[0] * W; sy = f[1] * H; }
      const dx = cx - sx, dy = cy - sy;
      if (!(Math.hypot(dx, dy) > 1)) return;
      const away = Math.atan2(dy, dx), A = Math.min(0.98, Math.max(0, p.a ?? 0.75)) * g.fade;
      const term = p.term ?? 0.15, edge = Math.max(0, p.edge ?? 0.12), col = p.col || '16,20,46';
      if (A <= 0) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R * g.ob, g.roll, 0, TAU); ctx.clip();
      ctx.translate(cx, cy); ctx.rotate(away);
      // the soft edge: n passes (one per 3 screen px of the edge, so no bands show), their terminators spread over
      // term ± edge, each as dark as makes A together
      const n = Math.max(6, Math.min(80, Math.ceil((2 * edge * R) / 3)));
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1 - Math.pow(1 - A, 1 / n);
      ctx.fillStyle = `rgb(${col})`;
      for (let i = 0; i < n; i++) night(ctx, (term + edge * (2 * (i + 0.5) / n - 1)) * R, R);
    },
  },
};
