// Sunlight on its way from the Sun to a planet, drawn as light, not as a travelling ball (lightpulse) or a tube: one soft
// shaft of warm light reaches out from the Sun toward the planet over the first 85% of the beat (eased), brightest along
// its middle and fading smoothly to its edges, lit all the way back to the Sun, its front fading out over a third of the
// way (no head, no cap), and as wide as the planet's globe where it arrives. The light stops at the globe's limb (it falls
// on the planet, it is not drawn over it), and the planet's sunward side brightens, gently (screened, never bleached), and
// stays brighter. It fades out over the beat's last 6%. A custom beat; time its dur to the line it illustrates. (The
// Saturn chapter's own effects/sunbeam.mjs is this effect before its fixes.)
//
// Beat params: from (where the light leaves: [fx, fy], fractions of the frame, default [-0.06, 0.3], or an actor, at its
// depth: the Sun's centre), to (a planet actor, required), col (rgb, default a warm white), w0 (the shaft's half-width at
// the Sun, a fraction of the frame height, default 0.035).
// Layer `grade`: emitted light, after the grade. Pair it with a sunglow at the same point.
import { createCanvas } from '@napi-rs/canvas';
import { clamp, easeInOut, smooth } from '../core/lib.mjs';
import { globeOf } from '../paint/planets.mjs';

const TAU = Math.PI * 2;

export const custom = {
  lightbeam: {
    layer: 'grade',
    draw(ctx, u, api) {
      const p = api.params || {}, W = api.W, H = api.H, col = p.col || '255,236,190';
      const g = globeOf(api, p.to), src = p.from !== undefined && !Array.isArray(p.from) ? api.actor(p.from) : null;
      if (!g || !(g.fade > 0) || (p.from !== undefined && !Array.isArray(p.from) && !src)) return;
      const f = p.from || [-0.06, 0.3], A = src ? api.project([src.head[0], src.head[1], src.z || 0]) : [f[0] * W, f[1] * H];
      const C = g.sc, Rs = g.sR, L = Math.hypot(C[0] - A[0], C[1] - A[1]);
      if (!(L > Rs)) return;
      const ux = (C[0] - A[0]) / L, uy = (C[1] - A[1]) / L, nx = -uy, ny = ux, ang = Math.atan2(uy, ux);
      // the shaft: a wedge from an apex behind the Sun, half-width w0 at the Sun and Rs at the planet's centre
      const w1 = Rs, w0 = Math.min((p.w0 ?? 0.035) * H, 0.9 * w1), back = (w0 * L) / (w1 - w0), th = Math.atan2(w1, L + back);
      // its front: d along the axis from the Sun, fading out over F behind it; at the end it is past the planet's centre
      const travel = clamp(u / 0.85), q = easeInOut(travel) * 0.45 + travel * 0.55, F = 0.35 * L, d = q * (L + F);
      const fade = g.fade * (1 - smooth(0.94, 1, u));
      if (d < 2 || fade <= 0.001) return;
      const at = (s, o) => [A[0] + ux * s + nx * o, A[1] + uy * s + ny * o], hw = s => (s + back) * Math.tan(th) * 2;
      const end = Math.min(d, L), quad = [at(0, hw(0)), at(end, hw(end)), at(end, -hw(end)), at(0, -hw(0))];
      // drawn off screen (the cross-section times the envelope along it), on the frame's pixels inside the shaft's box
      const m = ctx.getTransform(), k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      const x0 = Math.max(0, Math.floor(Math.min(...quad.map(v => v[0])))), y0 = Math.max(0, Math.floor(Math.min(...quad.map(v => v[1]))));
      const x1 = Math.min(W, Math.ceil(Math.max(...quad.map(v => v[0])))), y1 = Math.min(H, Math.ceil(Math.max(...quad.map(v => v[1]))));
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      const o = createCanvas(Math.ceil((x1 - x0) * k), Math.ceil((y1 - y0) * k)), x = o.getContext('2d');
      x.scale(k, k); x.translate(-x0, -y0);
      // across: a conic gradient about the apex, brightest on the axis, nothing past 1.9 half-angles
      const cg = x.createConicGradient(ang, A[0] - ux * back, A[1] - uy * back), a = 0.34;
      for (const [t, v] of [[0, 1], [0.5, 0.72], [1, 0.3], [1.4, 0.07], [1.9, 0]]) {
        const s = (t * th) / TAU, c = `rgba(${col},${(a * v).toFixed(3)})`;
        cg.addColorStop(s, c); if (s > 0) cg.addColorStop(1 - s, c);
      }
      cg.addColorStop(1, `rgba(${col},${a})`);
      x.fillStyle = cg; x.beginPath(); quad.forEach(([qx, qy], i) => (i ? x.lineTo(qx, qy) : x.moveTo(qx, qy))); x.closePath(); x.fill();
      // along: faint at the Sun (its glow is there), full a little way out, fading out over F before the front
      const lg = x.createLinearGradient(A[0], A[1], A[0] + ux * d, A[1] + uy * d);
      for (let i = 0; i <= 12; i++) { const s = (d * i) / 12; lg.addColorStop(i / 12, `rgba(0,0,0,${((0.35 + 0.65 * smooth(0, 0.15 * L, s)) * (1 - smooth(d - F, d, s))).toFixed(3)})`); }
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = lg; x.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.save();
      // the light stops at the globe: everything but its disc
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.ellipse(C[0], C[1], Rs, Rs * g.ob, g.roll, 0, TAU); ctx.clip('evenodd');
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = fade;
      ctx.drawImage(o, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      // arrival: the planet's sunward side brightens as the light reaches its limb, and stays so
      const lit = smooth(L - Rs, L - Rs + F, d);
      if (lit > 0) {
        const B = [C[0] - ux * Rs * 0.8, C[1] - uy * Rs * 0.8], gl = ctx.createRadialGradient(B[0], B[1], 0, B[0], B[1], Rs * 1.15);
        gl.addColorStop(0, `rgba(${col},${(0.3 * lit).toFixed(3)})`); gl.addColorStop(0.6, `rgba(${col},${(0.1 * lit).toFixed(3)})`); gl.addColorStop(1, `rgba(${col},0)`);
        ctx.save(); ctx.beginPath(); ctx.ellipse(C[0], C[1], Rs, Rs * g.ob, g.roll, 0, TAU); ctx.clip();
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = fade; ctx.fillStyle = gl; ctx.fillRect(C[0] - Rs, C[1] - Rs, 2 * Rs, 2 * Rs);
        ctx.restore();
      }
    },
  },
};
