// Water: ponds and streams painted in gouache (bank, depth gradient, sky reflection, ripples) and
// an animated shimmer drawn per frame inside the same polygon.
import { rng, pick, path, blob, ink, quad } from '../core/lib.mjs';

const box = P => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };

// Paint a body of water inside polygon P. `far` is the colour at the far edge (reflecting the sky),
// `deep` the colour nearest the viewer; `reflect(x)` optionally paints dark reflections of the far bank.
export function paintWater(x, r, P, { far = '#cfe4e6', mid = '#8cbccb', deep = '#3d7a8e', bank = '#5a6a3a', bankW = 10, ripples = 1, reflect = null, flow = 0 } = {}) {
  const B = box(P), h = B.y1 - B.y0, w = B.x1 - B.x0;
  // wet bank: a darker rim just outside the water
  x.save(); x.strokeStyle = bank; x.lineWidth = bankW * 2; x.lineJoin = 'round'; path(x, P); x.stroke(); x.restore();
  x.save(); path(x, P); x.clip();
  const g = x.createLinearGradient(0, B.y0, 0, B.y1); g.addColorStop(0, far); g.addColorStop(0.45, mid); g.addColorStop(1, deep);
  x.fillStyle = g; x.fillRect(B.x0 - 10, B.y0 - 10, w + 20, h + 20);
  if (reflect) { x.globalAlpha = 0.5; reflect(x, B); x.globalAlpha = 1; }
  // ripple strokes: horizontal (still water) or along the flow
  const n = Math.round((w * h) / 2600 * ripples);
  for (let i = 0; i < n; i++) {
    const py = B.y0 + Math.pow(r(), 0.8) * h, px = B.x0 + r() * w, k = 0.5 + (py - B.y0) / h;
    x.fillStyle = r() < 0.55 ? 'rgba(240,250,250,.38)' : 'rgba(20,60,75,.22)';
    blob(x, px, py, (6 + r() * 20) * k, (0.8 + r() * 1.3) * k, flow * (r() - 0.5) * 0.3, r, 6);
  }
  // shade along the edges (depth at the banks), soft
  x.filter = 'blur(10px)'; x.strokeStyle = 'rgba(20,52,50,.45)'; x.lineWidth = 26; path(x, P); x.stroke(); x.filter = 'none';
  x.restore();
}

// A lily pad with an optional flower.
export function lilyPad(x, r, cx, cy, s, flower = false) {
  const a0 = r() * Math.PI * 2;
  x.fillStyle = pick(r, ['#5f8f45', '#6f9e4f', '#57863f']);
  x.beginPath(); x.ellipse(cx, cy, 14 * s, 5 * s, 0, a0 + 0.35, a0 + Math.PI * 2 - 0.05); x.lineTo(cx, cy); x.closePath(); x.fill();
  x.fillStyle = 'rgba(200,230,170,.35)'; x.beginPath(); x.ellipse(cx - 3 * s, cy - 1 * s, 7 * s, 2 * s, 0, 0, 7); x.fill();
  if (flower) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.fillStyle = i % 2 ? '#f6d6e2' : '#fbeef2'; blob(x, cx + Math.cos(a) * 3.5 * s, cy - 3 * s + Math.sin(a) * 1.4 * s, 3.4 * s, 1.8 * s, a, r, 6); }
    x.fillStyle = '#f2c84a'; x.beginPath(); x.arc(cx, cy - 3.6 * s, 1.6 * s, 0, 7); x.fill();
  }
}

// Animated shimmer: short bright dashes drifting along the flow (or bobbing in place on still water),
// fading in and out. Draw in world coordinates; deterministic in t.
export function waterShimmer(ctx, P, t, { seed = 1, n = 60, flow = [0, 0], col = '255,255,250', size = 1, alpha = 0.55 } = {}) {
  const B = box(P);
  ctx.save(); path(ctx, P); ctx.clip();
  for (let i = 0; i < n; i++) {
    const r = rng(seed * 1000 + i), life = 2 + r() * 3, ph = r() * life, age = ((t + ph) % life) / life;
    const u = r(), v = r(), k = 0.5 + v;
    const px = B.x0 + u * (B.x1 - B.x0) + flow[0] * ((t + ph) % life), py = B.y0 + v * (B.y1 - B.y0) + flow[1] * ((t + ph) % life);
    const a = alpha * Math.sin(Math.PI * age) ** 2;
    if (a < 0.02) continue;
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.beginPath(); ctx.ellipse(px, py, (4 + r() * 10) * k * size, 1.1 * k * size, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// A sedge/reed fringe along a polyline (bank), denser at random clumps.
export function bankFringe(x, r, pts, { pal = ['#3f6b3a', '#4f7d42', '#5f8c48', '#6f9a50'], h = 40, every = 14 } = {}) {
  for (let i = 0; i < pts.length; i += 1) {
    if (r() > 14 / every * 0.5) continue;
    const [bx, by] = pts[i], H = h * (0.4 + r() * 0.8), lean = (r() - 0.5) * 0.7;
    ink(x, quad([bx, by + 3], [bx + lean * H * 0.3, by - H * 0.5], [bx + lean * H, by - H], 8), 2.2 + r() * 2, { closed: false, color: pick(r, pal), seed: Math.round(bx * 3 + by) });
  }
}
