// custom.mjs for The Kite: the kite, its tail and its string.
//
// The kite has no rig. A hidden hovering butterfly (cast "kite", faded to opacity 0 in shot 1.1) carries its position:
// fly beats move it, the camera can frame it. This overlay draws a diamond kite at that position, a bowed tail
// streaming downwind (to the right), and the string from June's front hand. Marks key the story:
//   "gust"  the kite starts its swoop (it spins as it dives)
//   "snag"  it is caught in the hawthorn: tilted, string slack, a puff of leaves, leaves over its edges.
// Deterministic and stateless: everything comes from api.t, api.marks and the actors' draw state.

import { rng } from '../../engine/core/lib.mjs';

const INK = '#2b2320';
const RED = '#c8443a', YEL = '#f2c94c', RED_D = '#9c2f28', YEL_D = '#d9a12e';
const LEAF = ['#3f6a35', '#4f7d3c', '#5d8c45'];

const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// June's front hand in world coordinates. api.actor has head and mouth but no hand, so ask the rig: the human rig's
// draw(null, …) returns its anchors (hand, hands, head) without drawing (engine/cast/human.mjs header).
function handOf(a) {
  try {
    const o = a.R.draw(null, a.x, a.y, a.s, a.face, a.st);
    if (o && o.hand) return o.hand;
  } catch { /* fall back below */ }
  const [x0, y0, x1, y1] = a.box;
  return [a.face > 0 ? x1 - 4 * a.s : x0 + 4 * a.s, y0 + (y1 - y0) * 0.45];
}

function diamond(ctx, H, lw) {
  const W = H * 0.72, top = -H * 0.42, bot = H * 0.58, mid = 0;
  const P = [[0, top], [W / 2, mid], [0, bot], [-W / 2, mid]];
  // four panels, two reds and two yellows, the far ones darker (light from the upper left)
  const panel = (a, b, c) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath(); };
  ctx.fillStyle = RED; panel(P[0], P[3], [0, mid]); ctx.fill();
  ctx.fillStyle = YEL; panel(P[0], P[1], [0, mid]); ctx.fill();
  ctx.fillStyle = YEL_D; panel(P[3], P[2], [0, mid]); ctx.fill();
  ctx.fillStyle = RED_D; panel(P[1], P[2], [0, mid]); ctx.fill();
  // spars and outline
  ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.moveTo(...P[0]); ctx.lineTo(...P[2]); ctx.moveTo(...P[3]); ctx.lineTo(...P[1]); ctx.stroke();
  ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(...P[0]); for (const p of [P[1], P[2], P[3]]) ctx.lineTo(...p); ctx.closePath(); ctx.stroke();
  // a gouache highlight on the upper-left panel
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff3d0';
  ctx.beginPath(); ctx.moveTo(-W * 0.06, top + H * 0.12); ctx.lineTo(-W * 0.3, -H * 0.04); ctx.lineTo(-W * 0.08, -H * 0.06); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  return { tail: [0, bot], bridle: [0, H * 0.02] };
}

function tail(ctx, x, y, H, t, wild, lw) {
  // a ribbon streaming right and down, a wave running along it; bows every few segments
  const n = 22, L = H * 2.4, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, d = u * L;
    const amp = H * (0.08 + 0.22 * u) * (1 + wild);
    const w = Math.sin(t * (7 + 5 * wild) - u * 9) * amp;
    pts.push([x + d * 0.78 + w * 0.3, y + d * 0.55 + w]);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
  for (let i = 5; i <= n; i += 5) {
    const [bx, by] = pts[i], [px, py] = pts[i - 1], a = Math.atan2(by - py, bx - px) + Math.PI / 2, r = H * 0.13;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
    ctx.fillStyle = (i / 5) % 2 ? RED : YEL;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r, -r * 0.6); ctx.lineTo(-r, r * 0.6); ctx.closePath();
    ctx.moveTo(0, 0); ctx.lineTo(r, -r * 0.6); ctx.lineTo(r, r * 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.6; ctx.stroke();
    ctx.restore();
  }
}

export const overlays = {
  kite: {
    layer: 'world',
    draw(ctx, api) {
      const k = api.actor(api.params.kite || 'kite');
      if (!k) return;
      const t = api.t, z = api.cam.zoom, lw = 2.2 / z;            // ink about 2 screen px at any zoom
      const gust = api.marks.gust ?? Infinity, snag = api.marks.snag ?? Infinity;
      const caught = t >= snag, diving = t >= gust && t < snag;
      const [bx0, by0, bx1, by1] = k.box;
      // the hidden butterfly's box centre is the kite's centre; the wind adds its own dance on top
      const calm = caught ? 0.25 : 1;
      let x = (bx0 + bx1) / 2 + calm * (14 * Math.sin(t * 1.3) + 6 * Math.sin(t * 3.1 + 1)) * k.s;
      let y = (by0 + by1) / 2 + calm * (9 * Math.sin(t * 1.7 + 2) + 4 * Math.sin(t * 4.3)) * k.s;
      const H = 40 * k.s;
      // tilt: leaning into the wind (toward the string) while flying; spinning as it dives; cocked when caught
      let rot = -0.32 + 0.12 * Math.sin(t * 2.2);
      if (diving) { const u = (t - gust) / Math.max(0.1, snag - gust); rot += smooth(u) * (Math.PI * 2 + 0.95) + 0.15 * Math.sin(u * 20); }
      if (caught) rot = 0.63 + 0.05 * Math.sin(t * 5.3);
      // the string: from June's hand to the bridle, sagging; slack once the kite is caught
      const j = api.actor(api.params.flyer || 'june');
      const bridle = [x + Math.sin(rot) * -H * 0.02, y + Math.cos(rot) * H * 0.02];
      if (j) {
        const [hx, hy] = handOf(j), dx = bridle[0] - hx, dy = bridle[1] - hy, D = Math.hypot(dx, dy);
        const sag = caught ? 0.28 * D : (diving ? 0.12 : 0.05) * D;
        const mx = (hx + bridle[0]) / 2 + (caught ? -0.05 * D : 0), my = (hy + bridle[1]) / 2 + sag;
        // a dark line reads against the pale sky; about 2.4 screen px wide at any zoom
        ctx.strokeStyle = 'rgba(48,38,34,0.9)'; ctx.lineWidth = 2.4 / z; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, ...bridle); ctx.stroke();
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const tailWild = caught ? 0.8 : diving ? 0.6 : 0;
      // the tail is drawn in the kite's frame but streams in world directions: undo the rotation for it
      ctx.save(); ctx.rotate(-rot);
      const tb = [-Math.sin(rot) * H * 0.58, Math.cos(rot) * H * 0.58];
      tail(ctx, tb[0], tb[1], H, t, tailWild, lw);
      ctx.restore();
      diamond(ctx, H, lw);
      ctx.restore();
      if (caught) {
        // hawthorn twigs and leaves over the kite's edges: it is in the crown, not in front of it
        const r = rng(7);
        for (let i = 0; i < 9; i++) {
          const a = r() * Math.PI * 2, d = H * (0.35 + r() * 0.25), lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d * 0.8;
          const sz = H * (0.1 + r() * 0.08), c = LEAF[Math.floor(r() * 3)], sw = 0.06 * Math.sin(t * 4 + i);
          ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.5;
          ctx.beginPath(); ctx.ellipse(lx, ly, sz, sz * 0.55, a + sw, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // the puff of leaves knocked loose, blowing off to the right for 1.6 s
        const pu = (t - snag) / 1.6;
        if (pu < 1) {
          const r2 = rng(11);
          for (let i = 0; i < 12; i++) {
            const ang = -Math.PI * 0.9 + r2() * Math.PI * 1.1, sp = (40 + r2() * 90) * k.s, spin = (r2() - 0.5) * 12, sz = H * (0.07 + r2() * 0.05), c = LEAF[Math.floor(r2() * 3)];
            const lx = x + Math.cos(ang) * sp * pu + 60 * k.s * pu * pu, ly = y + Math.sin(ang) * sp * pu + 50 * k.s * pu * pu;
            ctx.globalAlpha = 1 - pu;
            ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(lx, ly, sz, sz * 0.5, spin * pu, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
    },
  },
};
