// custom.mjs for The Last Strawberry.
//  - rigs: `strawberry`, a prop written as a static rig, so the camera can frame it (`on`), it is drawn in depth order
//    with the actors, and it can split (`pose: split`) and be eaten (`set` params `left` / `right` 1 → 0).
//  - custom beat `drips`: water dripping off a wet actor (Burr after his wade), with drip sounds.
// Deterministic and stateless: everything is drawn from the pose, the params, u and a seeded rng.
import { makeRig, mixPose } from '../../engine/cast/rig.mjs';
import { cel, line, smoothPts } from '../../engine/core/style.mjs';
import { rng } from '../../engine/core/lib.mjs';

// ───────────── the strawberry (a prop rig) ─────────────
// Local units: origin = the contact point, +x forward, up is negative y. About 14 units tall with its leaves
// (the frog is 19, the hedgehog 24).
const RIGHT = [[0, -11.0], [2.6, -11.5], [5.0, -10.7], [6.4, -8.7], [6.3, -6.2], [5.1, -3.7], [3.3, -1.5], [1.3, -0.15], [0, 0]];
const LEFT = RIGHT.map(([x, y]) => [-x, y]);
const WHOLE = [...RIGHT.slice(0, -1), [0, 0], ...LEFT.slice(1, -1).reverse()];   // clockwise from the top centre
// seeds: fixed spots inside the body
const SEEDS = (() => { const r = rng(77), out = []; for (let row = 0; row < 5; row++) { const y = -9.6 + row * 1.9, w = [5.2, 5.4, 4.8, 3.6, 2.0][row]; for (let x = -w + (row % 2) * 0.9; x <= w; x += 1.9) out.push([x + (r() - 0.5) * 0.8, y + (r() - 0.5) * 0.7]); } return out; })();
// sepals: tips of six pointed leaves fanning out from the top and drooping over the shoulders
const LEAVES = [[-7.0, -8.9], [-4.6, -12.6], [-1.3, -13.7], [1.6, -13.8], [4.9, -12.5], [7.1, -8.8]];

const rot = (P, a, ox, oy) => { const c = Math.cos(a), s = Math.sin(a); return P.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]); };
const scl = (P, k, ox, oy) => P.map(([x, y]) => [ox + (x - ox) * k, oy + (y - oy) * k]);
const move = (P, dx, dy) => P.map(([x, y]) => [x + dx, y + dy]);

function leaf(T, tip, side) {
  // a slim pointed sepal: rounded sides that meet in a sharp tip; width grows with length
  const bx = side * 0.5, by = -11.2, dx = tip[0] - bx, dy = tip[1] - by, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, w = Math.min(1.3, 0.2 * L + 0.35), P = [];
  const h = u => w * Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.3 * u);
  for (let i = 0; i <= 10; i++) { const u = i / 10; P.push([bx + dx * u + nx * h(u), by + dy * u + ny * h(u)]); }
  for (let i = 9; i >= 1; i--) { const u = i / 10; P.push([bx + dx * u - nx * h(u), by + dy * u - ny * h(u)]); }
  return P;
}

// Draw one piece: `body` outline points; `cut` true for a half (a pale cut face along x = 0 before the transform).
// xf maps points of the upright, unsplit strawberry to where this piece is now.
function piece(T, P, body, side, xf, k = 1) {
  const pts = smoothPts(T, xf(body), { closed: true, px: 2, corner: 1.2 });
  cel(T, pts, P.body, 0.9, 0.85, 31 + side);
  // cut face: a pale band along the cut (only for halves)
  if (side) {
    const face = smoothPts(T, xf(body.map(([x, y]) => [x * 0.3, y * 0.97 - 0.15])), { closed: true, px: 2 });
    T.save(); T.fillStyle = P.flesh; T.beginPath(); face.forEach(([x, y], i) => (i ? T.lineTo(x, y) : T.moveTo(x, y))); T.closePath(); T.fill(); T.restore();
    const core = smoothPts(T, xf(body.map(([x, y]) => [x * 0.1, y * 0.85 - 0.9])), { closed: true, px: 2 });
    T.save(); T.fillStyle = P.core; T.beginPath(); core.forEach(([x, y], i) => (i ? T.lineTo(x, y) : T.moveTo(x, y))); T.closePath(); T.fill(); T.restore();
  }
  // seeds on the skin
  T.save(); T.fillStyle = P.seed;
  for (const [sx, sy] of SEEDS) {
    if (side && Math.sign(sx) !== side) continue;
    if (side && Math.abs(sx) < 1.4) continue;               // not on the cut face
    const [[x, y]] = xf([[sx, sy]]);
    T.beginPath(); T.ellipse(x, y, 0.32 * k, 0.5 * k, 0.3 * side, 0, Math.PI * 2); T.fill();
  }
  T.restore();
  // highlight on the left shoulder
  if (side <= 0) {
    const [[hx, hy]] = xf([[-3.4, -8.4]]);
    T.save(); T.globalAlpha = 0.55; T.fillStyle = '#fff4ec'; T.beginPath(); T.ellipse(hx, hy, 0.7 * k, 1.5 * k, 0.5, 0, Math.PI * 2); T.fill(); T.restore();
  }
  // leaves (the calyx) and, on the left piece, the stalk
  for (const tip of LEAVES) {
    if (side && Math.sign(tip[0]) !== side) continue;
    const lp = smoothPts(T, xf(leaf(T, tip, Math.sign(tip[0]) || 1)), { closed: true, px: 2, corner: 1.4 });
    cel(T, lp, P.leaf, 0.6, 0.7, 41 + Math.round(tip[0]));
  }
  if (side <= 0) line(T, xf([[-0.2, -12.2], [-0.4, -13.6], [0.3, -15.0]]), 0.9, { color: P.stalk, seed: 5 });
}

const strawberry = makeRig({
  kind: 'strawberry', label: 'Strawberry',
  height: 14, headHeight: 14, width: 13,
  params: { body: '#d8303b', seed: '#f5d77a', leaf: '#4f8a36', stalk: '#3f6b2c', flesh: '#f6c4c0', core: '#fff0e8', left: 1, right: 1 },
  speeds: { walk: 1 }, stride: { walk: 1 },
  poses: { stand: { gap: 0 }, split: { gap: 1 } },
  gaits: { walk: () => ({ gap: 0 }) },
  gestures: { wobble: { dur: 0.6, at: (u, base) => mixPose(base, { ...base, wob: 1 }, Math.sin(Math.PI * u)) } },
  shadowW: 6,
  paint(T, p, F, o) {
    const P = o.P, g = Math.max(0, Math.min(1, p.gap || 0)), wob = (p.wob || 0) * 0.12 * Math.sin((o.t || 0) * 30);
    if (g < 0.02) {
      if ((P.left ?? 1) > 0.02 || (P.right ?? 1) > 0.02) piece(T, P, WHOLE, 0, pts => rot(pts, wob, 0, 0));
    } else {
      // each half slides out and leans away onto its back, staying on the ground
      for (const side of [-1, 1]) {
        const k = side < 0 ? (P.left ?? 1) : (P.right ?? 1);
        if (k <= 0.02) continue;
        const body = side < 0 ? [...LEFT].reverse() : RIGHT;
        const half = body;
        const xf = pts => {
          let q = rot(pts, side * 0.38 * g, 0, 0);
          const lowest = Math.max(...rot(half, side * 0.38 * g, 0, 0).map(([, y]) => y));
          q = move(q, side * 2.2 * g, -lowest);
          return scl(q, k, side * (2.2 * g + 3), 0);   // eaten: shrinks toward its own middle, on the ground
        };
        piece(T, P, half, side, xf, k);
      }
    }
    o.out.head = T.map(0, -8); o.out.mouth = T.map(0, -8);
  },
});
export const rigs = [strawberry];

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
