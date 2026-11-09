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

// ───────────── streams ─────────────
// A stream seen from its bank, flowing toward the viewer. L and R are its banks as polylines sampled at the
// same y values, far end first. Positions across the water are v ∈ [−1, 1] (left bank → right bank).
export function streamGeom(L, R) {
  const y0 = L[0][1], dy = (L[L.length - 1][1] - y0) / (L.length - 1), n = L.length - 1;
  const at = (P, y) => { const f = Math.max(0, Math.min(n - 1e-9, (y - y0) / dy)), i = Math.floor(f), k = f - i; return P[i][0] + (P[i + 1][0] - P[i][0]) * k; };
  const xAt = (v, y) => { const a = at(L, y), b = at(R, y); return a + (b - a) * (v + 1) / 2; };
  return { L, R, y0, y1: L[n][1], xAt, half: y => (at(R, y) - at(L, y)) / 2, poly: [...L, ...R.slice().reverse()] };
}

// The painted (static) water of a stream, in soft gouache that holds up when upscaled: far water mirrors the
// sky and the far trees, near water shows its depth; a darker channel winds down the middle, the shallows
// along the banks show the bed (pebbles near the viewer), the grass on the banks darkens the margins, the bank
// on the light side throws its shadow across the water, broad sky streaks and colour dabs lie across it.
// The crisp, moving part (ripples, glints, current lines, wakes) is streamFlow(), drawn per frame on top.
export function paintStream(x, r, L, R, { sAt = () => 1, far = '#d3e7e4', mid = '#7fb6c3', deep = '#2f6a7d', bank = '#55703a', bankW = 10, light = [-0.6, -0.75],
  channel = '22,66,90', shallow = '120,128,78', margin = '54,86,52', shadow = '22,48,62', sky = '238,248,250', trees = '58,88,70', dabs = ['#5f9fb0', '#9fcad2', '#3f7f92', '#7fb0a8', '#b7d8d8', '#4c8a8a'] } = {}) {
  const G = streamGeom(L, R), P = G.poly, B = box(P), h = B.y1 - B.y0, k = Math.hypot(x.getTransform().a, x.getTransform().b) || 1;
  const band = (v0, v1, fill, blur = 0, ya = G.y0, yb = G.y1) => {
    const A = [], C = [];
    for (let y = ya; y <= yb + 1e-6; y += 10) { A.push([G.xAt(v0, y), y]); C.push([G.xAt(v1, y), y]); }
    if (blur) x.filter = `blur(${(blur * k).toFixed(1)}px)`;
    x.fillStyle = fill; path(x, [...A, ...C.reverse()]); x.fill(); x.filter = 'none';
  };
  // the earth lip just outside the water
  x.save(); x.strokeStyle = bank; x.lineWidth = bankW * 2; x.lineJoin = 'round'; path(x, P); x.stroke(); x.restore();
  x.save(); path(x, P); x.clip();
  const g = x.createLinearGradient(0, B.y0, 0, B.y1); g.addColorStop(0, far); g.addColorStop(0.3, mid); g.addColorStop(1, deep);
  x.fillStyle = g; x.fillRect(B.x0 - 10, B.y0 - 10, B.x1 - B.x0 + 20, h + 20);
  // the far trees mirrored in the far reach
  { const g2 = x.createLinearGradient(0, G.y0, 0, G.y0 + 90); g2.addColorStop(0, `rgba(${trees},.55)`); g2.addColorStop(1, `rgba(${trees},0)`); x.fillStyle = g2; x.fillRect(B.x0, G.y0 - 10, B.x1 - B.x0, 100); }
  // gouache variation laid across the current (wide and flat: perspective)
  for (let i = 0; i < (B.x1 - B.x0) * h / 1400; i++) {
    const y = G.y0 + Math.pow(r(), 0.8) * h, v = (r() * 2 - 1) * 0.95, s = sAt(y);
    x.globalAlpha = 0.14 + r() * 0.16; x.fillStyle = pick(r, dabs); blob(x, G.xAt(v, y), y, (20 + r() * 50) * s, (2 + r() * 4) * s, (r() - 0.5) * 0.12, r, 7);
  }
  x.globalAlpha = 1;
  // the deep channel down the middle, with darker pools
  band(-0.42, 0.32, `rgba(${channel},.32)`, 16);
  for (let i = 0; i < h / 60; i++) { const y = G.y0 + 40 + r() * (h - 40), s = sAt(y); x.filter = `blur(${(10 * k).toFixed(1)}px)`; x.fillStyle = `rgba(${channel},.28)`; blob(x, G.xAt((r() - 0.5) * 0.5, y), y, (40 + r() * 60) * s, (6 + r() * 8) * s, 0, r, 8); x.filter = 'none'; }
  // the shallows: the bed shows through along both banks; pebbles on it near the viewer
  band(-1, -0.7, `rgba(${shallow},.3)`, 10); band(0.7, 1, `rgba(${shallow},.3)`, 10);
  for (let i = 0; i < h / 3; i++) {
    const y = G.y0 + h * (0.25 + 0.75 * Math.pow(r(), 0.7)), side = r() < 0.5 ? -1 : 1, v = side * (0.66 + r() * 0.3), s = sAt(y), px = G.xAt(v, y), w = (3 + r() * 6) * s;
    x.fillStyle = pick(r, ['rgba(120,110,80,.35)', 'rgba(150,140,110,.3)', 'rgba(96,92,70,.32)']); blob(x, px, y, w, w * 0.45, 0, r, 7);
    x.fillStyle = 'rgba(210,214,190,.22)'; blob(x, px - w * 0.2, y - w * 0.12, w * 0.5, w * 0.18, 0, r, 6);
  }
  // the grass on the banks darkens the margins (its reflection); reed reflections hang into the water
  band(-1, -0.86, `rgba(${margin},.55)`, 5); band(0.86, 1, `rgba(${margin},.55)`, 5);
  for (const [P2, side] of [[L, -1], [R, 1]]) for (let i = 0; i < P2.length; i += 2) {
    if (r() < 0.45) continue; const [bx, by] = P2[i], s = sAt(by), len = (14 + r() * 40) * s;
    x.fillStyle = `rgba(${margin},${(0.25 + r() * 0.25).toFixed(2)})`; blob(x, bx - side * (2 + r() * 8) * s, by + len * 0.45, (1.4 + r() * 2.4) * s, len * 0.5, 0, r, 6);
  }
  // the bank on the light side shades the water beside it
  band(light[0] < 0 ? -1 : 0.55, light[0] < 0 ? -0.55 : 1, `rgba(${shadow},.3)`, 12);
  // broad sky streaks: the bright reflection lies mostly in the open middle of the far and middle reaches
  for (let i = 0; i < h / 7; i++) {
    const y = G.y0 + Math.pow(r(), 1.3) * h, v = (r() * 2 - 1) * 0.6, s = sAt(y);
    x.fillStyle = `rgba(${sky},${(0.12 + r() * 0.22).toFixed(2)})`; blob(x, G.xAt(v, y), y, (16 + r() * 46) * s, (1.2 + r() * 2.2) * s, (r() - 0.5) * 0.08, r, 7);
  }
  // depth at the banks, soft
  x.filter = `blur(${(8 * k).toFixed(1)}px)`; x.strokeStyle = 'rgba(20,52,50,.4)'; x.lineWidth = 18; path(x, P); x.stroke(); x.filter = 'none';
  x.restore();
  return G;
}

// The moving water of a stream, drawn every frame in world coordinates (crisp at any zoom): ripples (tapered
// crescents, bright where they catch the sky, dark in their troughs) drifting toward the viewer, faster in the
// channel; sun glints twinkling; and round every stone a shivering foam collar on its upstream side, rings
// spreading from its waterline and a faint V wake trailing downstream. Deterministic in t.
// stones: [{ x, base (waterline y), rx }].
export function streamFlow(ctx, G, t, { sAt = () => 1, seed = 5, n = 240, speed = 26, stones = [], col = '246,252,252', dark = '22,60,78', glints = 60, alpha = 1 } = {}) {
  const h = G.y1 - G.y0, z = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1, lw = (w, s) => Math.max(w * s, 0.7 / z);
  // a tapered crescent: an arc of half-width w bowing up (b > 0) by b, thickness th at the middle
  const crescent = (px, py, w, b, th) => { ctx.beginPath(); ctx.moveTo(px - w, py); ctx.quadraticCurveTo(px, py - b * 2, px + w, py); ctx.quadraticCurveTo(px, py - b * 2 + th * 2, px - w, py); ctx.fill(); };
  ctx.save(); path(ctx, G.poly); ctx.clip(); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const r = rng(seed * 7919 + i), v = (r() * 2 - 1) * 0.94, life = 2.2 + r() * 2.6, ph = r() * life, age = ((t + ph) % life) / life, bright = r() < 0.62;
    const cyc = Math.floor((t + ph) / life), r2 = rng(seed * 104729 + i * 31 + cyc), y0 = G.y0 + 10 + Math.pow(r2(), 0.75) * (h - 10);
    const s0 = sAt(y0), y = y0 + speed * s0 * (1 - Math.abs(v) * 0.6) * age * life * 0.5, s = sAt(y), px = G.xAt(v, y) + (r2() - 0.5) * 6 * s;
    const a = alpha * Math.sin(Math.PI * age) ** 2 * (bright ? 0.45 + 0.45 * r() : 0.3 + 0.3 * r()), w = (4 + r() * 13) * s * (1.2 - Math.abs(v) * 0.4);
    if (a < 0.03) continue;
    ctx.fillStyle = bright ? `rgba(${col},${a.toFixed(3)})` : `rgba(${dark},${a.toFixed(3)})`;
    crescent(px, y, w, (0.6 + r() * 1.2) * s, Math.max((bright ? 1.1 : 1.4) * s, 0.8 / z));
  }
  // glints of sun
  for (let i = 0; i < glints; i++) {
    const r = rng(seed * 4241 + i), y = G.y0 + Math.pow(r(), 1.4) * h, v = (r() * 2 - 1) * 0.6, s = sAt(y), f = 1.5 + r() * 3;
    const a = alpha * Math.max(0, Math.sin(t * f + r() * 6.28)) ** 10; if (a < 0.05) continue;
    const px = G.xAt(v, y), R = (1.2 + r() * 1.6) * s;
    ctx.fillStyle = `rgba(255,255,248,${a.toFixed(3)})`; ctx.beginPath(); ctx.ellipse(px, y, R * 2.2, R * 0.55, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px, y, R * 0.45, R * 1.3, 0, 0, 7); ctx.fill();
  }
  // round the stones: foam upstream, rings and a V wake downstream
  for (const [j, st] of stones.entries()) {
    const s = sAt(st.base), rx = st.rx, ry = rx * 0.28;
    for (let q = 0; q < 2; q++) {                                         // the collar: broken bright arcs that shiver
      const wob = Math.sin(t * 5.3 + q * 2.1 + j) * 0.05;
      ctx.strokeStyle = `rgba(${col},${(alpha * (0.7 - q * 0.3)).toFixed(3)})`; ctx.lineWidth = lw(1.5 - q * 0.5, s);
      ctx.beginPath(); ctx.ellipse(st.x, st.base - ry * 0.15, rx * (1.07 + q * 0.12), ry * (1 + q * 0.3), 0, Math.PI * (1.05 + wob + q * 0.06), Math.PI * (1.95 - q * 0.06 + wob)); ctx.stroke();
    }
    for (let q = 0; q < 2; q++) {                                         // rings spreading from the waterline
      const u = ((t * 0.5 + q / 2 + j * 0.37) % 1), a = alpha * 0.4 * (1 - u) ** 2;
      ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`; ctx.lineWidth = lw(0.9, s);
      ctx.beginPath(); ctx.ellipse(st.x + 2 * s, st.base + 2 + u * 3 * s, rx * (1.12 + u * 0.45), ry * (0.9 + u * 0.8), 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    }
    for (let q = 0; q < 5; q++) {                                         // the wake: short dashes drifting off downstream in a V
      const u = ((t * 0.35 + q / 5 + j * 0.21) % 1), a = alpha * 0.32 * Math.sin(Math.PI * u) ** 2, d = (10 + 46 * u) * s, yy = st.base + ry + d * 0.5;
      if (a < 0.03) continue;
      ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
      for (const side of [-1, 1]) crescent(st.x + side * rx * (0.65 + u * 0.9), yy, (3 + 4 * u) * s, 0.5 * s, 0.9 * s);
    }
  }
  ctx.restore();
}
