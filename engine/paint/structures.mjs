// Village structures in the storybook style: a timber-and-plaster cottage under a thatched roof, picket
// fences and gates, a stone well, a garden bench, a hanging lantern on a post, cobbles and flagstones,
// vegetable beds, cottage-garden flowers and distant rooftops. Every painter works in world coordinates,
// inks its own interior lines (the set adds the silhouette ink), lays one hard lavender multiply shadow on
// the side away from the light, and returns the geometry the staging code needs (doors, seats, rims, lamps,
// window panes for the night glow). Pure geometry helpers (cottageGeom, fenceStations, …) never paint.
import { canvas, clamp, lerp, pick, path, ell, rpoly, quad, ink, blob, clump } from '../core/lib.mjs';
import { celShade, SET_SHADE } from './brush.mjs';
import { tuft } from './nature.mjs';

const L0 = [-0.6, -0.75];
const SHADE = SET_SHADE;
const lit = l => (l[0] < 0 ? -1 : 1);                  // -1: lit from the left
export const WARM = { rgb: '255,196,112', hot: '#fff4cc', mid: '#ffd486', edge: '#f2a24a', deep: '#c8662e' };
export const WOOD = { col: '#8a5e3c', dark: '#5e3f2a', lit: '#c4945e', grain: ['rgba(60,38,24,.35)', 'rgba(150,110,70,.3)', 'rgba(80,52,34,.3)'] };
export const TIMBER = { col: '#5c4130', dark: '#3e2b20', lit: 'rgba(214,170,120,.55)' };
export const THATCH = { pal: ['#c99a50', '#d9ae62', '#b8883f', '#e6c27a', '#a97a38'], under: '#6f5130', cap: '#b38a46', capDark: '#8e6a34' };

// How strongly lamps and windows are lit for a sky name, or for a crossfade list [[name, weight]…].
export const LAMP_LEVEL = { dawn: 0.35, morning: 0, noon: 0, afternoon: 0, golden: 0.12, sunset: 0.55, twilight: 0.9, night: 1 };
export function lampLevel(sky) {
  if (sky == null) return 0;
  if (typeof sky === 'number') return clamp(sky);
  if (typeof sky === 'string') return LAMP_LEVEL[sky] ?? 0;
  let a = 0, n = 0; for (const [name, w] of sky) { if (!(w > 0)) continue; a += (LAMP_LEVEL[name] ?? 0) * w; n += w; }
  return n ? a / n : 0;
}

// ───────────── small shared helpers ─────────────
const box = P => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };
const shadeIn = (x, P, a = 0.55, col = SHADE) => { x.save(); path(x, P); x.clip(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = a; x.fillStyle = col; const B = box(P); x.fillRect(B.x0 - 2, B.y0 - 2, B.x1 - B.x0 + 4, B.y1 - B.y0 + 4); x.restore(); };
const shadePoly = (x, clipP, P, a = 0.55) => { x.save(); path(x, clipP); x.clip(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = a; x.fillStyle = SHADE; path(x, P); x.fill(); x.restore(); };
const seedOf = (...v) => Math.round(v.reduce((a, b) => a * 31 + b, 7)) & 0xffff;
const along = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];

// A warm radial glow (lamps, windows). Paints with the current composite operation.
export function glow(x, cx, cy, r0, R, rgb = WARM.rgb, a = 0.6) {
  const g = x.createRadialGradient(cx, cy, r0, cx, cy, R);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.3, `rgba(${rgb},${a * 0.42})`); g.addColorStop(0.65, `rgba(${rgb},${a * 0.12})`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2);
}

// A straight timber (beam or post) from a to b, w thick: grain, a lit edge toward the light, ink.
export function beam(x, r, a, b, w, { col = TIMBER.col, light = L0, inkW = 1.6, seed = 0, jit = 0.8 } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d * w / 2, ny = dx / d * w / 2;
  const P = rpoly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], Math.min(3, w * 0.25), { seed: seed || seedOf(a[0], a[1], b[0]), jit, step: 6 });
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let i = 0; i < d / 9; i++) { const u = r(), o = (r() - 0.5) * 0.8; x.fillStyle = pick(r, WOOD.grain); blob(x, a[0] + dx * u + nx * o * 2, a[1] + dy * u + ny * o * 2, Math.max(3, d * 0.06) * (0.5 + r()), 0.8 + r() * 0.8, Math.atan2(dy, dx), r, 6); }
  // the edge facing the light catches a warm stripe
  const side = (nx * light[0] + ny * light[1]) < 0 ? 1 : -1;
  x.strokeStyle = TIMBER.lit; x.lineWidth = Math.max(1.4, w * 0.18); x.beginPath(); x.moveTo(a[0] - side * nx * 0.62, a[1] - side * ny * 0.62); x.lineTo(b[0] - side * nx * 0.62, b[1] - side * ny * 0.62); x.stroke();
  x.restore();
  if (inkW) ink(x, P, inkW, { seed: seedOf(a[0], b[1]) });
  return P;
}

// Irregular rounded stones filling polygon P in courses (plinths, wells, walls, chimneys).
export function stonework(x, r, P, { size = 18, pal = ['#b3aa98', '#a39b8a', '#c4bba6', '#958e80', '#bcb39c'], mortar = '#7d766a', light = L0, rowH = 0.62, curve = null, inkA = 0.55 } = {}) {
  const B = box(P);
  x.fillStyle = mortar; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let y = B.y1 + size * rowH * 0.3, row = 0; y > B.y0 - size; row++) {
    const h = size * rowH * (0.85 + r() * 0.3);
    for (let px = B.x0 - size * (0.5 + (row % 2) * 0.5 + r() * 0.3); px < B.x1 + size;) {
      const w = size * (0.8 + r() * 0.7), cx = px + w / 2, cy = y - h / 2 + (curve ? curve(cx) : 0);
      const S = rpoly([[cx - w / 2 + 1.5, cy - h / 2 + 1.2], [cx + w / 2 - 1.5, cy - h / 2 + 1.2], [cx + w / 2 - 1.5, cy + h / 2 - 1.2], [cx - w / 2 + 1.5, cy + h / 2 - 1.2]], Math.min(w, h) * 0.38, { seed: seedOf(cx, cy), jit: 0.9, step: 4 });
      x.fillStyle = pick(r, pal); path(x, S); x.fill();
      x.fillStyle = 'rgba(255,248,226,.35)'; blob(x, cx + light[0] * w * 0.18, cy + light[1] * h * 0.2, w * 0.28, h * 0.18, 0, r, 6);
      x.strokeStyle = `rgba(52,44,40,${inkA})`; x.lineWidth = 1.1; path(x, S); x.stroke();
      px += w;
    }
    y -= h;
  }
  x.restore();
}

// Brick courses filling polygon P.
export function brickwork(x, r, P, { bw = 22, bh = 9, pal = ['#a85a44', '#b8664c', '#9a4e3c', '#c27458'], mortar = '#d8c4a8' } = {}) {
  const B = box(P);
  x.fillStyle = mortar; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let y = B.y0, row = 0; y < B.y1 + bh; y += bh, row++) for (let px = B.x0 - (row % 2) * bw * 0.5 - bw; px < B.x1 + bw; px += bw) {
    x.fillStyle = pick(r, pal); x.fillRect(px + 1, y + 1, bw - 2, bh - 2);
    if (r() < 0.3) { x.fillStyle = 'rgba(60,30,20,.25)'; x.fillRect(px + 1, y + bh - 3, bw - 2, 2); }
  }
  x.restore();
}

// Plaster: a creamy fill with gouache dabs, a few hairline cracks.
export function plaster(x, r, P, { col = '#f0e2c2', pal = ['#ead9b4', '#f6ead0', '#e4d1aa', '#f3e6c8'], cracks = 3 } = {}) {
  const B = box(P);
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let i = 0; i < ((B.x1 - B.x0) * (B.y1 - B.y0)) / 700; i++) { x.fillStyle = pick(r, pal); blob(x, B.x0 + r() * (B.x1 - B.x0), B.y0 + r() * (B.y1 - B.y0), 10 + r() * 26, 4 + r() * 9, (r() - 0.5) * 0.3, r, 7); }
  for (let i = 0; i < cracks; i++) { const sx = B.x0 + r() * (B.x1 - B.x0), sy = B.y0 + r() * (B.y1 - B.y0), pts = [[sx, sy]]; for (let k = 0; k < 4; k++) { const [px, py] = pts[pts.length - 1]; pts.push([px + (r() - 0.5) * 14, py + 6 + r() * 10]); } ink(x, pts, 1, { closed: false, color: 'rgba(120,96,70,.55)', seed: seedOf(sx, sy) }); }
  x.restore();
}

// ───────────── the cottage ─────────────
// Pure geometry of a cottage C = { x0, x1, base, wallH, depth: [ox, oy] (oblique offset of the back wall;
// ox > 0 shows the right gable end), roofH, over, drop, door: { cx, w, h }, windows: [{ cx, top, w, h }],
// dormer: { cx, w, h, up }, chimney: { u, w, h }, gableWindow: { r } }.
export function cottageGeom(C) {
  const { x0, x1, base: yb, wallH } = C, [ox, oy] = C.depth || [80, -46];
  const roofH = C.roofH ?? 230, over = C.over ?? 34, drop = C.drop ?? 16, ye = yb - wallH;
  const ridgeY = ye + oy / 2 - roofH;
  const eaveL = [x0 - over, ye + drop], eaveR = [x1 + over, ye + drop];
  const ridgeL = [x0 - over * 0.6 + ox / 2, ridgeY], ridgeR = [x1 + over + ox / 2, ridgeY], eaveBack = [x1 + over + ox, ye + oy + drop];
  const gH = roofH - 34;
  const front = [[x0, yb], [x1, yb], [x1, ye], [x0, ye]];
  const side = [[x1, yb], [x1 + ox, yb + oy], [x1 + ox, ye + oy], [x1 + ox / 2, ye + oy / 2 - gH], [x1, ye]];
  const roof = [eaveL, eaveR, ridgeR, ridgeL];
  const D = C.door ? { ...C.door, x0: C.door.cx - C.door.w / 2, x1: C.door.cx + C.door.w / 2, top: yb - C.door.h, base: yb } : null;
  const windows = (C.windows || []).map(w => ({ ...w, x0: w.cx - w.w / 2, x1: w.cx + w.w / 2, y0: w.top, y1: w.top + w.h }));
  const slopeAt = (px, u) => lerp(ye + drop, ridgeY, u) + 0 * px;             // y on the front slope at height fraction u
  // a gabled dormer: a little timber-framed wall (face) standing on the slope, its casement window (win),
  // under a thatched hood whose two thick arms meet over the apex
  const dormer = C.dormer ? (() => {
    const d = C.dormer, cy = slopeAt(0, d.up ?? 0.45), y0 = cy - d.h / 2, y1 = cy + d.h / 2, fw = d.w * 0.62, fe = y0 + 6, apex = fe - fw * 0.46;
    const face = [[d.cx - fw / 2, y1 + 2], [d.cx - fw / 2, fe], [d.cx, apex], [d.cx + fw / 2, fe], [d.cx + fw / 2, y1 + 2]];
    const ww = fw - 20, win = { cx: d.cx, x0: d.cx - ww / 2, x1: d.cx + ww / 2, y0: fe + 5, y1: y1 - 2, w: ww, h: y1 - 2 - fe - 5, bars: [2, 2] };
    return { ...d, x0: d.cx - d.w / 2, x1: d.cx + d.w / 2, y0, y1, fw, eave: fe, apex, face, win };
  })() : null;
  const ch = C.chimney ? (() => { const c = C.chimney, cx = lerp(ridgeL[0], ridgeR[0], c.u ?? 0.12); return { x: cx, w: c.w ?? 56, top: ridgeY - (c.h ?? 90), pierce: ridgeY + (c.pierce ?? 52) }; })() : null;
  const gw = C.gableWindow ? { cx: x1 + ox / 2, cy: ye + oy / 2 - gH * 0.42, r: C.gableWindow.r ?? 22 } : null;
  return {
    x0, x1, yb, ye, ox, oy, roofH, over, drop, ridgeY, eaveL, eaveR, ridgeL, ridgeR, eaveBack, gH, front, side, roof, door: D, windows, dormer, chimney: ch, gableWindow: gw,
    footprint: [[x0, yb], [x1, yb], [x1 + ox, yb + oy], [x0 + ox, yb + oy]],
    chimneyTop: ch ? [ch.x, ch.top - 26] : null,                                // top of the pots: where smoke starts and birds sit
    ridgeAt: u => [lerp(ridgeL[0], ridgeR[0], u), ridgeY - 14],                 // the top of the ridge cap
    bounds: [x0 - over - 30, (ch ? ch.top - 40 : ridgeY - 40), x1 + over + ox + 30, yb + 20],
  };
}

// Window glass: a cool reflective pane by day, a warm lamplit room when lit (curtains in silhouette).
function windowGlass(x, r, w, litK, round = false) {
  const P = round ? ell(w.cx, w.cy, w.r, w.r, seedOf(w.cx), 0.6) : rpoly([[w.x0, w.y0], [w.x1, w.y0], [w.x1, w.y1], [w.x0, w.y1]], w.arch ? [w.w * 0.5, w.w * 0.5, 2, 2] : 2, { seed: seedOf(w.cx, w.y0), jit: 0.4 });
  const B = box(P), cx = (B.x0 + B.x1) / 2;
  x.save(); path(x, P); x.clip();
  if (!litK) {
    const g = x.createLinearGradient(0, B.y0, 0, B.y1); g.addColorStop(0, '#c8dbe0'); g.addColorStop(0.45, '#7f9ba6'); g.addColorStop(1, '#3e4f5c');
    x.fillStyle = g; x.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    x.fillStyle = 'rgba(36,40,52,.55)'; x.fillRect(B.x0, B.y0 + (B.y1 - B.y0) * 0.55, B.x1 - B.x0, B.y1 - B.y0);
    x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.moveTo(B.x0 + (B.x1 - B.x0) * 0.15, B.y1); x.lineTo(B.x0 + (B.x1 - B.x0) * 0.42, B.y0); x.lineTo(B.x0 + (B.x1 - B.x0) * 0.56, B.y0); x.lineTo(B.x0 + (B.x1 - B.x0) * 0.29, B.y1); x.fill();
  } else {
    const g = x.createRadialGradient(cx, B.y0 + (B.y1 - B.y0) * 0.55, 2, cx, B.y0 + (B.y1 - B.y0) * 0.5, Math.max(B.x1 - B.x0, B.y1 - B.y0) * 0.75);
    g.addColorStop(0, WARM.hot); g.addColorStop(0.45, WARM.mid); g.addColorStop(1, WARM.edge);
    x.fillStyle = g; x.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
  }
  // curtains drawn back to each side
  if (!round && w.w > 40) for (const s of [-1, 1]) {
    const ex = s < 0 ? B.x0 : B.x1, cw = (B.x1 - B.x0) * 0.2;
    const C = [[ex, B.y0], [ex - s * cw, B.y0], [ex - s * cw * 0.55, B.y0 + (B.y1 - B.y0) * 0.55], [ex - s * cw * 0.9, B.y1], [ex, B.y1]];
    x.fillStyle = litK ? 'rgba(196,96,52,.75)' : '#e9dcc0'; path(x, C); x.fill();
    if (!litK) { x.fillStyle = 'rgba(200,80,70,.55)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(ex - s * cw * (0.2 + r() * 0.5), B.y0 + r() * (B.y1 - B.y0), 1.6, 0, 7); x.fill(); } }
  }
  if (litK && !round && w.w > 40) { x.fillStyle = 'rgba(150,64,30,.6)'; blob(x, cx + (B.x1 - B.x0) * 0.12, B.y1 - 6, 9, 7, 0, r, 7); x.fillRect(cx + (B.x1 - B.x0) * 0.12 - 1, B.y1 - 20, 2, 12); blob(x, cx + (B.x1 - B.x0) * 0.12, B.y1 - 22, 8, 6, 0, r, 7); }
  x.restore();
  return P;
}
// Window frame and glazing bars (white-painted wood).
function windowFrame(x, r, w, { round = false, col = '#f2ece0', bars = [2, 2] } = {}) {
  if (round) {
    x.strokeStyle = col; x.lineWidth = 6; x.beginPath(); x.arc(w.cx, w.cy, w.r, 0, 7); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.moveTo(w.cx - w.r, w.cy); x.lineTo(w.cx + w.r, w.cy); x.moveTo(w.cx, w.cy - w.r); x.lineTo(w.cx, w.cy + w.r); x.stroke();
    ink(x, ell(w.cx, w.cy, w.r + 3, w.r + 3, seedOf(w.cx, 3), 0.5), 1.6, { seed: seedOf(w.cx, 4) });
    return;
  }
  const t = Math.max(4, w.w * 0.06), [nc, nr] = bars;
  x.fillStyle = col;
  const P = rpoly([[w.x0, w.y0], [w.x1, w.y0], [w.x1, w.y1], [w.x0, w.y1]], w.arch ? [w.w * 0.5, w.w * 0.5, 2, 2] : 2, { seed: seedOf(w.cx, w.y0), jit: 0.4 });
  x.strokeStyle = col; x.lineWidth = t; path(x, P); x.stroke();
  x.lineWidth = Math.max(2.4, t * 0.55);
  for (let i = 1; i < nc; i++) { const px = lerp(w.x0, w.x1, i / nc); x.beginPath(); x.moveTo(px, w.y0 + (w.arch ? w.w * 0.1 : 0)); x.lineTo(px, w.y1); x.stroke(); }
  for (let j = 1; j < nr; j++) { const py = lerp(w.y0 + (w.arch ? w.w * 0.35 : 0), w.y1, j / nr); x.beginPath(); x.moveTo(w.x0, py); x.lineTo(w.x1, py); x.stroke(); }
  ink(x, P, 1.6, { seed: seedOf(w.cx, w.y1) });
  const I = rpoly([[w.x0 + t * 0.5, w.y0 + t * 0.5], [w.x1 - t * 0.5, w.y0 + t * 0.5], [w.x1 - t * 0.5, w.y1 - t * 0.5], [w.x0 + t * 0.5, w.y1 - t * 0.5]], w.arch ? [w.w * 0.45, w.w * 0.45, 1, 1] : 1, { seed: seedOf(w.cx, 9), jit: 0.3 });
  ink(x, I, 0.9, { seed: seedOf(w.cx, 10), color: 'rgba(42,33,48,.7)' });
}
// Shutters with a heart cut-out, a sill and a window box of geraniums.
function windowDressing(x, r, w, { shutter = '#7ea2ad', light = L0, box: wb = true } = {}) {
  const sw = w.w * 0.42;
  for (const s of [-1, 1]) {
    const sx0 = s < 0 ? w.x0 - sw - 5 : w.x1 + 5, sx1 = sx0 + sw;
    const P = rpoly([[sx0, w.y0 - 2], [sx1, w.y0 - 2], [sx1, w.y1 + 2], [sx0, w.y1 + 2]], 2, { seed: seedOf(sx0, w.y0), jit: 0.6 });
    x.fillStyle = shutter; path(x, P); x.fill();
    x.save(); path(x, P); x.clip();
    x.strokeStyle = 'rgba(40,60,70,.35)'; x.lineWidth = 1.2; for (let k = 1; k < 3; k++) { const px = lerp(sx0, sx1, k / 3); x.beginPath(); x.moveTo(px, w.y0); x.lineTo(px, w.y1); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(sx0, w.y0, sw * 0.25, w.y1 - w.y0);
    // Z brace
    x.strokeStyle = 'rgba(52,72,80,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(sx0, w.y0 + 10); x.lineTo(sx1, w.y0 + 10); x.lineTo(sx0, w.y1 - 10); x.lineTo(sx1, w.y1 - 10); x.stroke();
    x.restore();
    // a heart cut into the top of each shutter
    const hx = (sx0 + sx1) / 2, hy = w.y0 + (w.y1 - w.y0) * 0.22, hs = Math.min(sw * 0.18, 7);
    x.fillStyle = '#2c2630'; x.beginPath(); x.moveTo(hx, hy + hs); x.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.6, hy - hs * 1.3, hx, hy - hs * 0.35); x.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.3, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs); x.fill();
    if (s > 0) shadeIn(x, P, 0.4);
    ink(x, P, 1.5, { seed: seedOf(sx1, w.y1) });
  }
  // sill
  const S = rpoly([[w.x0 - 9, w.y1 + 1], [w.x1 + 9, w.y1 + 1], [w.x1 + 6, w.y1 + 9], [w.x0 - 6, w.y1 + 9]], 2, { seed: seedOf(w.cx, 21), jit: 0.5 });
  x.fillStyle = '#d8ccb4'; path(x, S); x.fill(); shadePoly(x, S, [[w.x0 - 20, w.y1 + 6], [w.x1 + 20, w.y1 + 6], [w.x1 + 20, w.y1 + 20], [w.x0 - 20, w.y1 + 20]], 0.5); ink(x, S, 1.3, { seed: seedOf(w.cx, 22) });
  if (!wb) return;
  // window box with geraniums and trailing ivy
  const by0 = w.y1 + 9, bh = Math.max(14, w.h * 0.2), B = rpoly([[w.x0 - 4, by0], [w.x1 + 4, by0], [w.x1 + 1, by0 + bh], [w.x0 - 1, by0 + bh]], 2, { seed: seedOf(w.cx, 31), jit: 0.6 });
  for (let i = 0; i < w.w / 7; i++) { const px = w.x0 + r() * w.w; ink(x, quad([px, by0 + 2], [px + (r() - 0.5) * 10, by0 + bh * 0.8], [px + (r() - 0.5) * 16, by0 + bh + 6 + r() * 24], 8), 2.2, { closed: false, color: pick(r, ['#4c7a3a', '#5e8c44', '#3f6a34']), seed: seedOf(px, i) }); }
  clump(x, w.cx, by0 - 6, w.w * 1.05, 26, ['#2f5a30', '#3e6e38', '#4f8044', '#6a9a50'], Math.round(w.w / 3), r, { size: 0.12, light });
  for (let i = 0; i < w.w / 9; i++) { const px = w.x0 + 6 + r() * (w.w - 12), py = by0 - 8 - r() * 14; x.fillStyle = pick(r, ['#d8403a', '#e8584a', '#c42e34', '#f07a6a']); blob(x, px, py, 4 + r() * 2.4, 3.4 + r() * 2, 0, r, 7); x.fillStyle = 'rgba(255,220,200,.6)'; x.beginPath(); x.arc(px - 1.2, py - 1.2, 1.2, 0, 7); x.fill(); }
  x.fillStyle = '#9a6a44'; path(x, B); x.fill();
  x.save(); path(x, B); x.clip(); x.strokeStyle = 'rgba(70,44,28,.4)'; x.lineWidth = 1.2; for (let k = 1; k < 3; k++) { const py = by0 + (bh * k) / 3; x.beginPath(); x.moveTo(w.x0 - 4, py); x.lineTo(w.x1 + 4, py); x.stroke(); } x.restore();
  celShade(x, B, { light, amount: 0.45, bias: -0.25, seed: seedOf(w.cx, 33) });
  ink(x, B, 1.5, { seed: seedOf(w.cx, 34) });
  for (let i = 0; i < w.w / 14; i++) { const px = w.x0 + r() * w.w; ink(x, quad([px, by0 + bh - 2], [px + (r() - 0.5) * 8, by0 + bh + 8], [px + (r() - 0.5) * 14, by0 + bh + 10 + r() * 22], 8), 2, { closed: false, color: pick(r, ['#4c7a3a', '#5e8c44']), seed: seedOf(px, i, 2) }); x.fillStyle = '#5e8c44'; blob(x, px + (r() - 0.5) * 10, by0 + bh + 8 + r() * 18, 3.4, 2.4, r(), r, 6); }
}

// A round-topped plank door with strap hinges, a knob and a little glazed light.
function cottageDoor(x, r, D, { col = '#4f7d78', light = L0 } = {}) {
  const fr = 8, F = rpoly([[D.x0 - fr, D.base], [D.x0 - fr, D.top + D.w * 0.5], [D.cx, D.top - fr], [D.x1 + fr, D.top + D.w * 0.5], [D.x1 + fr, D.base]], [2, D.w * 0.55, D.w * 0.55, D.w * 0.55, 2], { seed: seedOf(D.cx, 1), jit: 0.7 });
  x.fillStyle = TIMBER.col; path(x, F); x.fill(); ink(x, F, 1.8, { seed: seedOf(D.cx, 2) });
  const P = rpoly([[D.x0, D.base], [D.x0, D.top + D.w * 0.5], [D.cx, D.top], [D.x1, D.top + D.w * 0.5], [D.x1, D.base]], [1, D.w * 0.5, D.w * 0.5, D.w * 0.5, 1], { seed: seedOf(D.cx, 3), jit: 0.5 });
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  const n = 5; for (let i = 1; i < n; i++) { const px = lerp(D.x0, D.x1, i / n) + (r() - 0.5) * 2; x.strokeStyle = 'rgba(24,44,44,.5)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(px, D.top); x.lineTo(px, D.base); x.stroke(); }
  for (let i = 0; i < 40; i++) { x.fillStyle = pick(r, ['rgba(255,255,255,.08)', 'rgba(20,40,40,.15)']); blob(x, D.x0 + r() * D.w, D.top + r() * (D.base - D.top), 1, 6 + r() * 14, 0, r, 6); }
  x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(D.x0, D.top, D.w * 0.18, D.base - D.top);
  x.restore();
  // little window in the door
  const lw = D.w * 0.36, lh = D.w * 0.3, ly = D.top + D.w * 0.36, Wn = { cx: D.cx, x0: D.cx - lw / 2, x1: D.cx + lw / 2, y0: ly, y1: ly + lh, w: lw, h: lh };
  windowGlass(x, r, Wn, 0); windowFrame(x, r, Wn, { col: '#dcd2bc', bars: [2, 1] });
  // strap hinges
  for (const hy of [D.top + D.w * 0.95, D.base - D.w * 0.55]) { const H = rpoly([[D.x0 - 2, hy - 3.5], [D.x0 + D.w * 0.62, hy - 2.5], [D.x0 + D.w * 0.66, hy], [D.x0 + D.w * 0.62, hy + 2.5], [D.x0 - 2, hy + 3.5]], 1.5, { seed: seedOf(hy), jit: 0.3 }); x.fillStyle = '#2d2a2c'; path(x, H); x.fill(); for (const k of [0.1, 0.3, 0.5]) { x.fillStyle = '#6a6460'; x.beginPath(); x.arc(D.x0 + D.w * k, hy, 1.3, 0, 7); x.fill(); } }
  x.fillStyle = '#d6a84a'; x.beginPath(); x.arc(D.x1 - D.w * 0.15, D.base - (D.base - D.top) * 0.46, 4, 0, 7); x.fill(); x.fillStyle = '#fff1b8'; x.beginPath(); x.arc(D.x1 - D.w * 0.15 - 1.2, D.base - (D.base - D.top) * 0.46 - 1.2, 1.4, 0, 7); x.fill();
  ink(x, [[D.x1 - D.w * 0.15 + 4, D.base - (D.base - D.top) * 0.46], [D.x1 - D.w * 0.15 - 4, D.base - (D.base - D.top) * 0.46]], 0.8, { closed: false, seed: 5 });
  celShade(x, P, { light: [light[0], -0.2], amount: 0.35, bias: -0.32, seed: seedOf(D.cx, 7) });
  ink(x, P, 1.8, { seed: seedOf(D.cx, 8) });
  // a worn stone step
  const S = rpoly([[D.x0 - 20, D.base - 4], [D.x1 + 20, D.base - 4], [D.x1 + 26, D.base + 8], [D.x0 - 26, D.base + 8]], 4, { seed: seedOf(D.cx, 11), jit: 1 });
  x.fillStyle = '#b9b1a0'; path(x, S); x.fill();
  x.fillStyle = 'rgba(255,250,230,.4)'; x.fillRect(D.x0 - 18, D.base - 4, D.w + 36, 3);
  shadePoly(x, S, [[D.x0 - 30, D.base + 2], [D.x1 + 30, D.base + 2], [D.x1 + 30, D.base + 12], [D.x0 - 30, D.base + 12]], 0.5);
  ink(x, S, 1.6, { seed: seedOf(D.cx, 12) });
  return P;
}

// A thatch surface: long straws running down the slope (direction dir), laid in courses whose lower edges
// catch a little light above a dark tuck line, over a few broad gouache washes.
function thatchFill(x, r, P, dir, { pal = THATCH.pal, courses = 34, straw = 1 } = {}) {
  const B = box(P), d = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / d, uy = dir[1] / d;
  x.fillStyle = pal[0]; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let i = 0; i < ((B.x1 - B.x0) * (B.y1 - B.y0)) / 2400; i++) { x.fillStyle = pick(r, ['rgba(255,236,170,.22)', 'rgba(150,104,48,.16)', 'rgba(230,190,110,.25)']); blob(x, B.x0 + r() * (B.x1 - B.x0), B.y0 + r() * (B.y1 - B.y0), 40 + r() * 80, 14 + r() * 30, (r() - 0.5) * 0.4, r, 8); }
  const n = ((B.x1 - B.x0) * (B.y1 - B.y0)) / 26 * straw;
  x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const px = B.x0 + r() * (B.x1 - B.x0), py = B.y0 + r() * (B.y1 - B.y0), L = (12 + r() * 26) * (courses / 34), bend = (r() - 0.5) * 3;
    const v = r(); x.strokeStyle = v < 0.34 ? pick(r, [pal[2], pal[4]]) : v < 0.8 ? pick(r, [pal[0], pal[1]]) : pal[3];
    x.globalAlpha = 0.55 + r() * 0.45; x.lineWidth = 0.9 + r() * 1.4;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + ux * L * 0.5 + bend, py + uy * L * 0.5, px + ux * L, py + uy * L); x.stroke();
  }
  x.globalAlpha = 1;
  // courses: a dark tuck line with a sunlit lip of straw ends just above it
  for (let y = B.y0 + courses * (0.5 + r() * 0.3); y < B.y1 + 4; y += courses * (0.85 + r() * 0.3)) {
    const ph = r() * 9, yy = px => y + Math.sin(px / 53 + ph) * 3 + Math.sin(px / 19 + ph) * 1.2;
    x.strokeStyle = 'rgba(112,76,36,.5)'; x.lineWidth = 2.2; x.beginPath(); for (let px = B.x0 - 10; px <= B.x1 + 10; px += 8) px === B.x0 - 10 ? x.moveTo(px, yy(px)) : x.lineTo(px, yy(px)); x.stroke();
    for (let px = B.x0 - 10; px < B.x1 + 10; px += 3 + r() * 5) { if (r() < 0.25) continue; x.strokeStyle = r() < 0.75 ? 'rgba(240,210,140,.5)' : 'rgba(255,238,190,.7)'; x.lineWidth = 0.8 + r() * 1.2; const L = 2 + r() * 7, y0 = yy(px) - 1 - r() * 2; x.beginPath(); x.moveTo(px + (r() - 0.5) * 2, y0 - L); x.lineTo(px + ux * 2, y0); x.stroke(); }
    x.strokeStyle = 'rgba(255,236,180,.35)'; x.lineWidth = 3; x.beginPath(); for (let px = B.x0 - 10; px <= B.x1 + 10; px += 8) px === B.x0 - 10 ? x.moveTo(px, yy(px) - 4) : x.lineTo(px, yy(px) - 4); x.stroke();
  }
  x.lineCap = 'butt';
  x.restore();
}
// A thick rounded thatch edge band along polyline E (the eave lip), thickness t, with cut straw ends.
function thatchLip(x, r, E, t, { light = L0, seed = 1 } = {}) {
  const T = E, Bt = E.map(([px, py]) => [px, py + t]).reverse();
  const P = rpoly([...T, ...Bt], t * 0.45, { seed, jit: 1.6, step: 6 });
  x.fillStyle = '#d7ad66'; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  const B = box(P);
  for (let i = 0; i < (B.x1 - B.x0) * 1.6; i++) { const u = r(), k = Math.min(E.length - 2, Math.floor(u * (E.length - 1))), f = u * (E.length - 1) - k, [px, py] = along(E[k], E[k + 1], f); const yy = py + t * (0.15 + r() * 0.8); x.fillStyle = pick(r, ['#e8c483', '#c49650', '#b0823c', '#f2d494']); x.fillRect(px + (r() - 0.5) * 3, yy, 1.4, 3 + r() * 5); }
  // the underside in shadow, then a dark line where the straw tucks under
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.55; x.fillStyle = SHADE; path(x, E.map(([px, py]) => [px, py + t * 0.62]).concat(Bt.map(([px, py]) => [px, py + 6]))); x.fill();
  x.restore();
  ink(x, P, 2, { seed: seed + 1 });
  return P;
}

// The cottage prop. Returns cottageGeom(C) with the painted polygons and the pane polygons (for glow).
export function cottage(x, r, C, { light = L0, plasterCol = '#f0e2c2', door = '#4f7d78', shutter = '#7ea2ad', roses = true, hollyhocks = true } = {}) {
  const G = cottageGeom(C), { x0, x1, yb, ye, ox, oy, eaveL, eaveR, ridgeL, ridgeR, eaveBack, drop } = G;
  const plinthH = C.plinth ?? 30, panes = [];
  // ── gable end (in shade) ──
  const side = G.side;
  plaster(x, r, side, { col: plasterCol, cracks: 1 });
  stonework(x, r, [[x1, yb], [x1 + ox, yb + oy], [x1 + ox, yb + oy - plinthH], [x1, yb - plinthH]], { size: 16, curve: px => (px - x1) * (oy / ox) * 0 });
  x.save(); path(x, side); x.clip();
  const sk = (px, py) => [px, py + (px - x1) * (oy / ox)];                           // skew a point along the gable wall
  beam(x, r, sk(x1 + 6, yb - plinthH), sk(x1 + 6, ye), 12, { light });
  beam(x, r, sk(x1 + ox - 6, yb - plinthH), sk(x1 + ox - 6, ye), 12, { light });
  beam(x, r, sk(x1, ye + 6), sk(x1 + ox, ye + 6), 11, { light });
  beam(x, r, sk(x1, yb - plinthH - 4), sk(x1 + ox, yb - plinthH - 4), 11, { light });
  beam(x, r, [x1 + 6, ye + 4], [x1 + ox / 2, ye + oy / 2 - G.gH + 8], 10, { light }); beam(x, r, [x1 + ox - 6, ye + oy + 4], [x1 + ox / 2, ye + oy / 2 - G.gH + 8], 10, { light });
  x.restore();
  if (G.gableWindow) { const w = G.gableWindow; panes.push(windowGlass(x, r, w, 0, true)); windowFrame(x, r, w, { round: true }); }
  shadeIn(x, side, 0.62);
  ink(x, side, 1.8, { seed: seedOf(x1, 1) });
  // ── front wall ──
  const F = G.front;
  plaster(x, r, F, { col: plasterCol, cracks: 4 });
  x.save(); path(x, F); x.clip();
  // a patch where the plaster has fallen away, showing brick
  const bp = [[x0 + (x1 - x0) * 0.08, ye + 60], [x0 + (x1 - x0) * 0.13, ye + 48], [x0 + (x1 - x0) * 0.17, ye + 58], [x0 + (x1 - x0) * 0.15, ye + 78], [x0 + (x1 - x0) * 0.09, ye + 80]];
  brickwork(x, r, rpoly(bp, 6, { seed: 41, jit: 2 }), { bw: 14, bh: 6 }); ink(x, rpoly(bp, 6, { seed: 41, jit: 2 }), 1, { seed: 42, color: 'rgba(110,80,60,.7)' });
  x.restore();
  stonework(x, r, [[x0, yb], [x1, yb], [x1, yb - plinthH], [x0, yb - plinthH]], { size: 17 });
  // timber frame: posts at the corners and beside every opening, rails at sill, window and plate heights
  const D = G.door, Wn = G.windows, top = ye + drop + 6, sill = yb - plinthH - 5;
  const posts = [x0 + 7, x1 - 7]; if (D) posts.push(D.x0 - 14, D.x1 + 14); for (const w of Wn) posts.push(w.x0 - w.w * 0.42 - 12, w.x1 + w.w * 0.42 + 12);
  const rails = [sill, top];
  const midY = Wn.length ? Wn[0].y1 + 34 : null;
  for (const px of posts) beam(x, r, [px + (r() - 0.5) * 2, sill], [px + (r() - 0.5) * 2, top], 13, { light });
  if (midY) { const xs = [x0, ...posts.slice().sort((a, b) => a - b), x1]; for (let i = 0; i < xs.length - 1; i++) { if (D && xs[i] >= D.x0 - 15 && xs[i + 1] <= D.x1 + 15) continue; if (xs[i + 1] - xs[i] > 40) beam(x, r, [xs[i], midY + (r() - 0.5) * 3], [xs[i + 1], midY + (r() - 0.5) * 3], 11, { light }); } }
  // diagonal braces in the wide panels between the corner posts and the windows
  if (Wn.length) {
    const wl = Wn[0], wr = Wn[Wn.length - 1], pl = wl.x0 - wl.w * 0.42 - 12, pr = wr.x1 + wr.w * 0.42 + 12;
    if (pl - x0 > 50) beam(x, r, [x0 + 12, sill - 4], [pl - 6, midY + 6], 10, { light });
    if (x1 - pr > 50) beam(x, r, [x1 - 12, sill - 4], [pr + 6, midY + 6], 10, { light });
    for (const w of Wn) { const a = w.x0 - w.w * 0.42 - 12, b = w.x1 + w.w * 0.42 + 12; if (b - a > 60) { beam(x, r, [a + 6, w.y0 - 12], [lerp(a, b, 0.5), top + 6], 9, { light }); beam(x, r, [b - 6, w.y0 - 12], [lerp(a, b, 0.5), top + 6], 9, { light }); } }
  }
  for (const y of rails) beam(x, r, [x0, y], [x1, y], 14, { light });
  // openings
  for (const w of Wn) { windowDressing(x, r, w, { shutter, light }); panes.push(windowGlass(x, r, w, 0)); windowFrame(x, r, w, { bars: w.bars || [2, 2] }); }
  if (D) { cottageDoor(x, r, D, { col: door, light }); const lw = D.w * 0.36, lh = D.w * 0.3, ly = D.top + D.w * 0.36; panes.push(rpoly([[D.cx - lw / 2, ly], [D.cx + lw / 2, ly], [D.cx + lw / 2, ly + lh], [D.cx - lw / 2, ly + lh]], 2, { seed: seedOf(D.cx, ly), jit: 0.4 })); }
  // the eave throws a hard lavender shadow down the top of both walls
  shadePoly(x, F, [[x0 - 40, ye - 10], [x1 + 40, ye - 10], [x1 + 40, ye + drop + 34], [x0 - 40, ye + drop + 22]], 0.6);
  shadePoly(x, side, [[x1 - 4, ye - 200], [x1 + ox + 20, ye + oy - 200], [x1 + ox + 20, ye + oy + drop + 26], [x1 - 4, ye + drop + 30]], 0.35);
  ink(x, F, 2, { seed: seedOf(x0, yb) });
  // climbing roses round the door
  if (roses && D) {
    const vine = quad([D.x0 - 26, yb - 6], [D.x0 - 46, D.top - 10], [D.cx + D.w * 0.2, D.top - 34], 24);
    for (const [i, [px, py]] of vine.entries()) { if (i % 2) continue; const k = 1 - i / vine.length * 0.4; clump(x, px + (r() - 0.5) * 10, py, 34 * k, 28 * k, ['#2b5230', '#386638', '#4a7a40', '#6a9a4c'], 10, r, { size: 0.2, light }); }
    for (const [i, [px, py]] of vine.entries()) { if (r() < 0.45) continue; x.fillStyle = pick(r, ['#e87a9a', '#f29ab0', '#d85a7c', '#fbd0dc']); blob(x, px + (r() - 0.5) * 22, py + (r() - 0.5) * 18, 4.5, 4, 0, r, 7); x.fillStyle = 'rgba(140,30,70,.5)'; x.beginPath(); x.arc(px + (r() - 0.5) * 2, py, 1.3, 0, 7); }
    ink(x, vine.slice(0, 18), 2.2, { closed: false, color: '#4e3a2a', seed: 77 });
  }
  // ── roof ──
  // the gable's thatch verge: a thick band from the front eave up to the ridge and down to the back eave,
  // its thickness measured across the steep arms; the underside in shade
  const bt = 34, inner = [[eaveBack[0] - bt * 0.95, eaveBack[1] + 6], [ridgeR[0] + 2, ridgeR[1] + bt * 1.7], [eaveR[0] + bt * 0.8, eaveR[1] + 4]];
  const BP = rpoly([eaveR, ridgeR, [eaveBack[0] + 4, eaveBack[1]], [eaveBack[0] - 2, eaveBack[1] + 12], ...inner], [10, bt * 0.5, 8, 6, 8, bt * 0.4, 8], { seed: seedOf(x1, 77), jit: 1.4 });
  thatchFill(x, r, BP, [ox * 0.2, 1]);
  x.save(); path(x, BP); x.clip(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.55; x.fillStyle = SHADE;
  path(x, [[eaveBack[0] - bt * 0.45, eaveBack[1] + 14], [ridgeR[0] + 2, ridgeR[1] + bt * 1.05], [eaveR[0] + bt * 0.35, eaveR[1] + 10], [eaveR[0] + bt, eaveR[1] + 40], [ridgeR[0] + 2, ridgeR[1] + bt * 2.4], [eaveBack[0] - bt * 1.2, eaveBack[1] + 40]]); x.fill(); x.restore();
  ink(x, BP, 2, { seed: seedOf(x1, 78) });
  // front slope
  const RP = rpoly([[eaveL[0], eaveL[1]], [eaveR[0], eaveR[1]], [ridgeR[0], ridgeR[1]], [ridgeL[0], ridgeL[1]]], [20, 14, 26, 30], { seed: seedOf(x0, 91), jit: 2 });
  thatchFill(x, r, RP, [-0.1, 1]);
  // soft light gradient: the top catches the sun, the lower roof is a touch deeper
  x.save(); path(x, RP); x.clip(); const gR = x.createLinearGradient(0, G.ridgeY, 0, eaveL[1]); gR.addColorStop(0, 'rgba(255,236,180,.28)'); gR.addColorStop(1, 'rgba(120,80,40,.12)'); x.fillStyle = gR; x.fillRect(eaveL[0] - 50, G.ridgeY - 10, eaveR[0] - eaveL[0] + 200, eaveL[1] - G.ridgeY + 20); x.restore();
  celShade(x, RP, { light: [light[0], 0.15], amount: 0.3, bias: -0.42, seed: 92, wob: 0.03 });
  // the gabled dormer: its wall and window, a thatch apron where it meets the slope, then the hood
  if (G.dormer) {
    const d = G.dormer, W = d.win, hw = d.fw / 2, cx = d.cx, fe = d.eave, ap = d.apex, ls = lit(light);
    // the dormer's shadow falls on the slope beside it, away from the light
    shadePoly(x, RP, [[cx, ap - 6], [cx - ls * (hw + 30), fe + 16], [cx - ls * (hw + 34), d.y1 - 4], [cx - ls * (hw + 6), d.y1 + 6], [cx - ls * hw * 0.6, d.y1 + 4], [cx - ls * hw * 0.6, ap + 20]], 0.36);
    const F = rpoly(d.face, [2, 2, 6, 2, 2], { seed: 95, jit: 0.6 });
    plaster(x, r, F, { cracks: 0 });
    x.save(); path(x, F); x.clip();
    beam(x, r, [cx - hw + 4, d.y1 + 4], [cx - hw + 4, fe], 8, { light }); beam(x, r, [cx + hw - 4, d.y1 + 4], [cx + hw - 4, fe], 8, { light });
    beam(x, r, [cx - hw, fe + 2], [cx + hw, fe + 2], 7, { light });
    x.restore();
    panes.push(windowGlass(x, r, W, 0)); windowFrame(x, r, W, { bars: W.bars });
    // the hood shades the top of the wall
    shadePoly(x, F, [[cx - hw - 4, ap - 20], [cx + hw + 4, ap - 20], [cx + hw + 4, fe + 12], [cx - hw - 4, fe + 6]], 0.5);
    shadeIn(x, F, 0.12);
    ink(x, F, 1.5, { seed: 96 });
    // the roof's thatch is tucked up against the sill: a dark tuck line, then a fringe of straw ends over it
    const lap = []; for (let i = 0; i <= 16; i++) { const u = i / 16; lap.push([lerp(cx - hw - 6, cx + hw + 6, u), d.y1 + 2 + Math.sin(u * 19) * 1.2]); }
    ink(x, lap, 2.2, { closed: false, seed: 97, color: 'rgba(92,62,30,.8)' });
    x.lineCap = 'round';
    for (let px = cx - hw - 8; px < cx + hw + 8; px += 1.6 + r() * 2.2) { const py = d.y1 + 3 + (r() - 0.5) * 2, L = 3 + r() * 6; x.strokeStyle = pick(r, ['#e6c27a', '#d9ae62', '#f2d494', '#c99a50']); x.lineWidth = 1 + r() * 1.2; x.beginPath(); x.moveTo(px, py - L * 0.4); x.lineTo(px + (r() - 0.5) * 2, py + L); x.stroke(); }
    x.lineCap = 'butt';
    // the hood: two thick thatch arms from beyond each eave of the little gable up to a rounded crown
    const t = 24, ov = 24, L0p = [cx - hw - ov, fe + ov * 0.55], R0p = [cx + hw + ov, fe + ov * 0.55], top = [cx, ap - 9];
    const outer = [L0p, ...quad([cx - hw * 0.55, ap + (fe - ap) * 0.4 - 6], [cx - hw * 0.12, ap - 13], top, 6).slice(0, -1), ...quad(top, [cx + hw * 0.12, ap - 13], [cx + hw * 0.55, ap + (fe - ap) * 0.4 - 6], 6), R0p];
    const inner = [[R0p[0] - 4, R0p[1] + t * 0.75], [cx + 2, ap + t * 0.62], [cx - 2, ap + t * 0.62], [L0p[0] + 4, L0p[1] + t * 0.75]];
    const HP = rpoly([...outer, ...inner], 5, { seed: 98, jit: 1.2, step: 5 });
    thatchFill(x, r, HP, [0, 1], { courses: 18, straw: 1.2 });
    x.save(); path(x, HP); x.clip();
    // the arm turned from the light in shade, and the underside of both arms
    x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.42; x.fillStyle = SHADE; x.fillRect(ls < 0 ? cx : cx - hw - ov - 10, ap - 30, hw + ov + 12, fe - ap + 60);
    x.globalAlpha = 0.5; path(x, [[L0p[0] - 6, L0p[1] + t * 0.42], [cx, ap + t * 0.3], [R0p[0] + 6, R0p[1] + t * 0.42], [R0p[0] + 6, R0p[1] + 40], [L0p[0] - 6, L0p[1] + 40]]); x.fill();
    x.restore();
    // cut straw ends along the lower edge
    x.strokeStyle = 'rgba(255,232,170,.55)'; x.lineWidth = 1.4;
    for (const [a, b] of [[inner[3], inner[2]], [inner[1], inner[0]]]) for (let i = 0; i <= 12; i++) { const [px, py] = along(a, b, i / 12); x.beginPath(); x.moveTo(px, py - 5); x.lineTo(px + (r() - 0.5) * 2, py - 1); x.stroke(); }
    ink(x, HP, 1.9, { seed: 99 });
  }
  ink(x, RP, 2.2, { seed: seedOf(x0, 93) });
  // ridge cap with a scalloped edge and criss-cross liggers
  const capT = 28, rl = [ridgeL[0] + 14, ridgeL[1] - 4], rr = [ridgeR[0] - 6, ridgeR[1] - 4], n = Math.round((rr[0] - rl[0]) / 34);
  const capTop = [], capBot = [];
  for (let i = 0; i <= n * 4; i++) { const u = i / (n * 4), [px, py] = along(rl, rr, u); capTop.push([px, py - 6 + Math.sin(u * 40) * 0.8]); capBot.push([px, py + capT * 0.6 + (i % 4 === 2 ? capT * 0.55 : i % 4 === 0 ? 0 : capT * 0.4)]); }
  const CP = rpoly([...capTop, ...capBot.reverse()], 4, { seed: 101, jit: 1, step: 5 });
  thatchFill(x, r, CP, [1, 0], { pal: ['#b88c48', '#c99c56', '#a87c3a', '#d6ae68'], courses: 400 });
  x.save(); path(x, CP); x.clip(); x.strokeStyle = 'rgba(92,64,34,.7)'; x.lineWidth = 1.6;
  for (let i = 0; i < n; i++) { const a = along(rl, rr, i / n), b = along(rl, rr, (i + 1) / n); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1] + capT * 0.5); x.moveTo(a[0], a[1] + capT * 0.5); x.lineTo(b[0], b[1]); x.stroke(); }
  x.restore(); ink(x, CP, 1.8, { seed: 102 });
  // chimney (brick, with a thatch collar and two pots)
  if (G.chimney) {
    const c = G.chimney, hw = c.w / 2, sw = c.w * 0.32;
    const front = rpoly([[c.x - hw, c.pierce], [c.x - hw, c.top], [c.x + hw, c.top], [c.x + hw, c.pierce]], 2, { seed: 111, jit: 0.8 });
    const sideF = rpoly([[c.x + hw, c.pierce], [c.x + hw, c.top], [c.x + hw + sw, c.top - sw * 0.6], [c.x + hw + sw, c.pierce - sw * 0.6]], 2, { seed: 112, jit: 0.8 });
    brickwork(x, r, front, { bw: 16, bh: 7 }); brickwork(x, r, sideF, { bw: 10, bh: 7 }); shadeIn(x, sideF, 0.6);
    x.save(); path(x, front); x.clip(); x.fillStyle = 'rgba(40,30,30,.35)'; x.fillRect(c.x - hw, c.top, c.w, 10); x.restore();
    ink(x, front, 1.8, { seed: 113 }); ink(x, sideF, 1.6, { seed: 114 });
    const cap = rpoly([[c.x - hw - 7, c.top + 2], [c.x - hw - 7, c.top - 9], [c.x + hw + sw + 4, c.top - 9 - sw * 0.3], [c.x + hw + sw + 4, c.top + 2]], 2, { seed: 115, jit: 0.6 });
    x.fillStyle = '#b7ae9c'; path(x, cap); x.fill(); shadePoly(x, cap, [[c.x + hw, c.top - 30], [c.x + hw + 40, c.top - 30], [c.x + hw + 40, c.top + 10], [c.x + hw, c.top + 10]], 0.5); ink(x, cap, 1.6, { seed: 116 });
    for (const [k, h] of [[-0.3, 24], [0.32, 18]]) { const px = c.x + k * c.w, P = rpoly([[px - 7, c.top - 8], [px - 5, c.top - 8 - h], [px + 5, c.top - 8 - h], [px + 7, c.top - 8]], 2, { seed: seedOf(px, h), jit: 0.5 }); x.fillStyle = '#c0683e'; path(x, P); x.fill(); shadePoly(x, P, [[px + 1, c.top - 60], [px + 20, c.top - 60], [px + 20, c.top], [px + 1, c.top]], 0.5); x.fillStyle = '#2a2020'; x.beginPath(); x.ellipse(px, c.top - 8 - h, 5, 1.8, 0, 0, 7); x.fill(); ink(x, P, 1.4, { seed: seedOf(px, 9) }); }
    const col = quad([c.x - hw - 16, c.pierce + 6], [c.x + sw * 0.5, c.pierce - 22], [c.x + hw + sw + 14, c.pierce + 2 - sw * 0.6], 16);
    thatchLip(x, r, col, 14, { light, seed: 117 });
  }
  // the thick eave lip along the front
  const lip = []; for (let i = 0; i <= 30; i++) { const u = i / 30, [px, py] = along([eaveL[0] - 4, eaveL[1] - 14], [eaveR[0] + 4, eaveR[1] - 14], u); lip.push([px, py + Math.sin(u * Math.PI * 5) * 1.5]); }
  thatchLip(x, r, lip, 24, { light, seed: 121 });
  // ── wall-foot planting ──
  if (hollyhocks) {
    for (let i = 0; i < 5; i++) { const px = x0 + 14 + i * 16 + r() * 8; hollyhock(x, r, px, yb + 4, 150 + r() * 70, pick(r, ['#e2708e', '#f2a2b4', '#c84a6a', '#f6e2e6'])); }
    for (let i = 0; i < 3; i++) hollyhock(x, r, x1 - 26 - i * 18, yb + 4, 120 + r() * 60, pick(r, ['#e2708e', '#f6e2e6', '#d65a5a']));
  }
  // grass where the walls meet the ground
  for (let px = x0 - 10; px < x1 + ox; px += 22) { if (D && px > D.x0 - 34 && px < D.x1 + 34) continue; const gy = px > x1 ? yb + (px - x1) * (oy / ox) : yb; tuft(x, r, px, gy + 4, 26, 12 + r() * 10, { n: 6 }); }
  return { ...G, panes };
}

// The lit state of a cottage: warm panes, curtains in silhouette, the glazing bars redrawn over them, and a
// soft spill of light on the sills and wall below each window. Paint into its own canvas; the kit fades it
// in with the lamp level and adds it again (screen) after the grade.
export function cottageLights(x, r, G) {
  const all = [...G.windows];
  if (G.dormer) all.push(G.dormer.win);
  for (const w of all) {
    x.save(); x.globalCompositeOperation = 'screen'; glow(x, w.cx, w.y1 + 6, 4, w.w * 0.95, WARM.rgb, 0.32); x.restore();
    windowGlass(x, r, w, 1); windowFrame(x, r, w, { bars: w.bars || [2, 2], col: '#7a5636' });
  }
  if (G.door) { const D = G.door, lw = D.w * 0.36, lh = D.w * 0.3, ly = D.top + D.w * 0.36, w = { cx: D.cx, x0: D.cx - lw / 2, x1: D.cx + lw / 2, y0: ly, y1: ly + lh, w: lw, h: lh }; windowGlass(x, r, w, 1); windowFrame(x, r, w, { col: '#7a5636', bars: [2, 1] }); }
  if (G.gableWindow) { const w = G.gableWindow; x.save(); x.globalCompositeOperation = 'screen'; glow(x, w.cx, w.cy, 2, w.r * 2.2, WARM.rgb, 0.3); x.restore(); windowGlass(x, r, w, 1, true); windowFrame(x, r, w, { round: true, col: '#7a5636' }); x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.35; x.fillStyle = SHADE; x.beginPath(); x.arc(w.cx, w.cy, w.r + 2, 0, 7); x.fill(); x.restore(); }
  return all;
}

// A hollyhock: a tall leafy stem with cup flowers up its top two thirds.
export function hollyhock(x, r, cx, base, h, col = '#e2708e') {
  const lean = (r() - 0.5) * 0.18, top = [cx + lean * h, base - h];
  const stem = quad([cx, base], [cx + lean * h * 0.3, base - h * 0.5], top, 16);
  ink(x, stem, 2.6, { closed: false, color: '#4a6e34', seed: seedOf(cx, h) });
  for (let i = 2; i < 10; i++) { const [px, py] = stem[i]; x.fillStyle = pick(r, ['#3f6a34', '#4f7c3c', '#5e8a44']); blob(x, px + (i % 2 ? 9 : -9), py + 2, 10, 6, (i % 2 ? 0.4 : -0.4), r, 7); }
  for (let i = 5; i < stem.length; i++) {
    const [px, py] = stem[i], k = 1 - (i - 5) / (stem.length - 5) * 0.55;
    if (i > stem.length - 3) { x.fillStyle = '#7da350'; blob(x, px, py, 3.5 * k + 1, 4 * k + 1, 0, r, 6); continue; }
    for (const s of [-1, 1]) { if (r() < 0.25) continue; const fx = px + s * 6 * k, fy = py + (r() - 0.5) * 4; x.fillStyle = col; blob(x, fx, fy, 7 * k, 6.4 * k, 0, r, 8); x.fillStyle = 'rgba(120,30,60,.45)'; x.beginPath(); x.arc(fx, fy, 2 * k, 0, 7); x.fill(); x.fillStyle = '#f6e48a'; x.beginPath(); x.arc(fx, fy, 0.9 * k, 0, 7); x.fill(); }
  }
}

// ───────────── fences ─────────────
// Picket positions along the ground segment a → b: each picket's foot, its scale and its width/height.
export function fenceStations(a, b, { sAt = () => 1, pw = 13, gap = 0.62, h = 92 } = {}) {
  const out = [], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let u = 0;
  while (u <= 1 + 1e-9) {
    const p = along(a, b, u), s = sAt(p[1]); out.push({ x: p[0], y: p[1], s, w: pw * s, h: h * s, u });
    // step one picket + gap, measured in screen space (a receding run packs tighter)
    const dx = Math.abs(b[0] - a[0]) / len, step = pw * s * (1 + gap) / Math.max(0.35, dx + Math.abs(b[1] - a[1]) / len * 1.1);
    u += step / len;
  }
  return out;
}
function picket(x, r, px, base, w, h, { col = '#f2ece0', light = L0, inkW = 1.2, seed = 0 } = {}) {
  const tip = w * 0.55, P = rpoly([[px - w / 2, base + 2], [px - w / 2, base - h + tip], [px, base - h], [px + w / 2, base - h + tip], [px + w / 2, base + 2]], [1, w * 0.25, w * 0.2, w * 0.25, 1], { seed, jit: 0.35, step: 4 });
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  x.fillStyle = 'rgba(160,140,110,.25)'; for (let i = 0; i < 3; i++) blob(x, px + (r() - 0.5) * w * 0.6, base - r() * h, w * 0.12, h * 0.12, 0, r, 6);
  x.fillStyle = 'rgba(120,150,80,.35)'; x.fillRect(px - w, base - h * 0.14, w * 2, h * 0.14);
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.5; x.fillStyle = SHADE; x.fillRect(px + (light[0] < 0 ? w * 0.12 : -w), base - h - 4, w * 0.9, h + 8);
  x.restore();
  ink(x, P, inkW, { seed: seed + 1 });
}
// A run of picket fence from ground point a to b, with two rails, posts at both ends (unless posts: false)
// and grass at the foot. Pickets are painted far to near, so a receding run overlaps correctly.
export function picketFence(x, r, a, b, { sAt = () => 1, h = 92, pw = 13, gap = 0.62, col = '#f2ece0', light = L0, posts = [true, true], flowers = 0 } = {}) {
  const st = fenceStations(a, b, { sAt, pw, gap, h }).filter(p => p.u > 0.02 && p.u < 0.98);
  const ordered = st.slice().sort((p, q) => p.y - q.y);
  // rails behind the pickets
  for (const k of [0.3, 0.72]) {
    const sa = sAt(a[1]), sb = sAt(b[1]), A = [a[0], a[1] - h * sa * k], B = [b[0], b[1] - h * sb * k], t0 = 7 * sa, t1 = 7 * sb;
    const R = rpoly([[A[0], A[1] - t0 / 2], [B[0], B[1] - t1 / 2], [B[0], B[1] + t1 / 2], [A[0], A[1] + t0 / 2]], 1.5, { seed: seedOf(a[0], k * 10), jit: 0.4 });
    x.fillStyle = '#d6cdbb'; path(x, R); x.fill(); shadePoly(x, R, [[A[0], A[1]], [B[0], B[1]], [B[0], B[1] + 20], [A[0], A[1] + 20]], 0.5); ink(x, R, 1, { seed: seedOf(b[0], k * 10) });
  }
  for (const p of ordered) picket(x, r, p.x, p.y, p.w, p.h, { col, light, seed: seedOf(p.x, p.y) });
  for (const [i, on] of posts.entries()) if (on) fencePost(x, r, i ? b : a, sAt((i ? b : a)[1]), { h: h * 1.24, light });
  for (const p of ordered) if (r() < 0.6) tuft(x, r, p.x + (r() - 0.5) * p.w * 2, p.y + 3, 18 * p.s, (8 + r() * 12) * p.s, { n: 5 });
  if (flowers) for (const p of ordered) if (r() < flowers) cottageFlower(x, r, p.x + (r() - 0.5) * 14 * p.s, p.y + 4 * p.s, p.s);
  return st;
}
// A square fence/gate post with a little cap.
export function fencePost(x, r, at, s, { h = 104, w = 18, light = L0, col = '#e9e1cf' } = {}) {
  const [px, base] = at, W = w * s, H = h * s;
  const P = rpoly([[px - W / 2, base + 3], [px - W / 2, base - H], [px + W / 2, base - H], [px + W / 2, base + 3]], 2, { seed: seedOf(px, base), jit: 0.5 });
  x.fillStyle = col; path(x, P); x.fill();
  shadePoly(x, P, [[px + (light[0] < 0 ? W * 0.1 : -W), base - H - 20], [px + (light[0] < 0 ? W : -W * 0.1), base - H - 20], [px + (light[0] < 0 ? W : -W * 0.1), base + 10], [px + (light[0] < 0 ? W * 0.1 : -W), base + 10]], 0.5);
  ink(x, P, 1.5, { seed: seedOf(px, 2) });
  const cap = ell(px, base - H - 3 * s, W * 0.62, 5 * s, seedOf(px, 3), 0.4);
  x.fillStyle = '#d8cfbb'; path(x, cap); x.fill(); ink(x, cap, 1.2, { seed: seedOf(px, 4) });
  const ball = ell(px, base - H - 9 * s, 5 * s, 5 * s, seedOf(px, 5), 0.3);
  x.fillStyle = '#f4efe4'; path(x, ball); x.fill(); shadePoly(x, ball, [[px + 1, base - H - 20 * s], [px + 10 * s, base - H - 20 * s], [px + 10 * s, base - H], [px + 1, base - H]], 0.5); ink(x, ball, 1.1, { seed: seedOf(px, 6) });
  tuft(x, r, px, base + 4, 26 * s, 16 * s, { n: 6 });
}
// An open gate leaf hinged at `hinge`, swung `ang` radians back into the garden (toward smaller y).
export function gateLeaf(x, r, hinge, width, ang, { sAt = () => 1, h = 86, dir = -1, light = L0 } = {}) {
  const end = [hinge[0] + dir * Math.cos(ang) * width, hinge[1] - Math.sin(ang) * width * 0.42];
  const st = fenceStations(hinge, end, { sAt, pw: 12, gap: 0.5, h }).filter(p => p.u > 0.04 && p.u < 0.97);
  for (const k of [0.22, 0.78]) { const sa = sAt(hinge[1]), sb = sAt(end[1]); const A = [hinge[0], hinge[1] - h * sa * k], B = [end[0], end[1] - h * sb * k]; beam(x, r, A, B, 7 * (sa + sb) / 2, { col: '#ddd3bf', light, inkW: 1 }); }
  { const sa = sAt(hinge[1]), sb = sAt(end[1]); beam(x, r, [hinge[0], hinge[1] - h * sa * 0.22], [end[0], end[1] - h * sb * 0.78], 6 * sa, { col: '#d4cab4', light, inkW: 1 }); }
  for (const p of st.sort((p, q) => p.y - q.y)) picket(x, r, p.x, p.y - 6 * p.s, p.w, p.h * 0.94, { light, seed: seedOf(p.x, p.y, 5), col: '#ece5d4' });
  return end;
}

// ───────────── the well ─────────────
// A round stone well with a shingled roof on two posts, a windlass, rope and bucket.
// Wl = { x, base, rx, wallH, postH }. Returns { rimY, rimRx, rimRy, roofTop, bounds }.
export function wellGeom(Wl) {
  const { x: cx, base, rx, wallH = 0.7 * rx, postH = 2.2 * rx } = Wl, ry = rx * 0.3, rimY = base - wallH;
  return { cx, base, rx, ry, wallH, postH, rimY, rimRx: rx + 5, rimRy: ry + 3, rimFront: rimY + ry + 3, roofTop: rimY - postH - rx * 0.62, bounds: [cx - rx * 1.6, rimY - postH - rx * 0.8, cx + rx * 1.6, base + 14] };
}
export function stoneWell(x, r, Wl, { light = L0 } = {}) {
  const G = wellGeom(Wl), { cx, base, rx, ry, rimY, postH } = G;
  // body: the front half of a cylinder
  const body = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); body.push([cx + Math.cos(a) * rx, base + Math.sin(a) * ry]); }
  for (let i = 24; i >= 0; i--) { const a = Math.PI * (i / 24); body.push([cx + Math.cos(a) * rx, rimY + Math.sin(a) * ry]); }
  const Bp = rpoly(body.reverse(), 3, { seed: seedOf(cx, 1), jit: 1.2, step: 6 });
  stonework(x, r, Bp, { size: rx * 0.34, rowH: 0.62, curve: px => Math.sqrt(Math.max(0, 1 - ((px - cx) / rx) ** 2)) * ry * 0.9 });
  x.save(); path(x, Bp); x.clip();
  x.fillStyle = 'rgba(110,140,70,.6)'; for (let i = 0; i < 18; i++) blob(x, cx - rx + r() * rx * 2, base - r() * (base - rimY) * 0.5, 4 + r() * 8, 2 + r() * 3, 0, r, 6);
  // cylinder shading: a hard lavender band on the right third, a soft lit band on the left
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.55; x.fillStyle = SHADE; x.beginPath(); x.moveTo(cx + rx * 0.32, rimY - 20); x.quadraticCurveTo(cx + rx * 0.4, (rimY + base) / 2, cx + rx * 0.28, base + ry + 10); x.lineTo(cx + rx + 20, base + ry + 10); x.lineTo(cx + rx + 20, rimY - 20); x.fill();
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = 'rgba(255,246,220,.16)'; x.fillRect(cx - rx * 0.85, rimY, rx * 0.35, base - rimY + ry);
  x.restore();
  ink(x, Bp, 2.2, { seed: seedOf(cx, 2) });
  // posts behind the opening (the back half of the rim hides their feet)
  const px0 = cx - rx * 0.86, px1 = cx + rx * 0.86, ptop = rimY - postH, pw = rx * 0.13;
  // the rim: an annulus of cap stones with the dark shaft inside
  const outer = ell(cx, rimY, rx + 5, ry + 3, seedOf(cx, 3), 0.8), innerE = ell(cx, rimY + 1, rx - rx * 0.16, ry - ry * 0.18, seedOf(cx, 4), 0.6);
  x.fillStyle = '#c2b9a4'; path(x, outer); x.fill();
  x.save(); path(x, outer); x.clip();
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; x.strokeStyle = 'rgba(80,72,64,.6)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx + Math.cos(a) * (rx - rx * 0.16), rimY + Math.sin(a) * (ry - ry * 0.18)); x.lineTo(cx + Math.cos(a) * (rx + 6), rimY + Math.sin(a) * (ry + 4)); x.stroke(); }
  x.fillStyle = 'rgba(255,250,232,.35)'; x.beginPath(); x.ellipse(cx - rx * 0.3, rimY - ry * 0.55, rx * 0.5, ry * 0.3, 0, 0, 7); x.fill();
  x.restore();
  x.fillStyle = '#1b2226'; path(x, innerE); x.fill();
  x.save(); path(x, innerE); x.clip(); x.fillStyle = 'rgba(80,110,130,.55)'; x.beginPath(); x.ellipse(cx + rx * 0.1, rimY + ry * 0.35, rx * 0.5, ry * 0.25, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(210,230,240,.5)'; x.beginPath(); x.ellipse(cx - rx * 0.15, rimY + ry * 0.4, rx * 0.16, ry * 0.08, 0, 0, 7); x.fill(); x.restore();
  ink(x, outer, 2, { seed: seedOf(cx, 5) }); ink(x, innerE, 1.4, { seed: seedOf(cx, 6) });
  for (const px of [px0, px1]) beam(x, r, [px, rimY + ry * 0.5], [px, ptop], pw * 2, { col: WOOD.col, light, inkW: 1.8 });
  // windlass with rope and a crank
  const ay = ptop + rx * 0.32;
  beam(x, r, [px0 - 6, ay], [px1 + 10, ay], rx * 0.13, { col: '#7a5236', light, inkW: 1.5 });
  x.fillStyle = '#b8a070'; for (let i = 0; i < 8; i++) { x.fillRect(cx - rx * 0.28 + i * rx * 0.07, ay - rx * 0.1, rx * 0.05, rx * 0.2); }
  ink(x, [[cx - rx * 0.3, ay - rx * 0.1], [cx + rx * 0.28, ay - rx * 0.1]], 1, { closed: false, seed: 8 });
  const kx = px1 + 10, crank = [[kx, ay], [kx + rx * 0.12, ay + rx * 0.24], [kx + rx * 0.22, ay + rx * 0.24]];
  ink(x, crank, 3.2, { closed: false, color: '#3a3330', seed: 9, taper: false });
  // rope down to a bucket resting on the rim
  const bx = cx + rx * 0.42, by = rimY + 2;
  ink(x, quad([cx + rx * 0.1, ay + rx * 0.08], [cx + rx * 0.3, (ay + by) / 2], [bx, by - rx * 0.36], 10), 1.6, { closed: false, color: '#9a8458', seed: 10 });
  const bk = rpoly([[bx - rx * 0.2, by - rx * 0.32], [bx + rx * 0.2, by - rx * 0.32], [bx + rx * 0.15, by], [bx - rx * 0.15, by]], 2, { seed: 11, jit: 0.5 });
  x.fillStyle = '#8f6440'; path(x, bk); x.fill(); x.strokeStyle = '#3a3330'; x.lineWidth = 2; for (const k of [0.25, 0.75]) { x.beginPath(); x.moveTo(bx - rx * 0.2, by - rx * 0.32 * (1 - k)); x.lineTo(bx + rx * 0.2, by - rx * 0.32 * (1 - k)); x.stroke(); }
  shadePoly(x, bk, [[bx + 1, by - 40], [bx + 30, by - 40], [bx + 30, by + 4], [bx + 1, by + 4]], 0.5); ink(x, bk, 1.4, { seed: 12 });
  ink(x, quad([bx - rx * 0.2, by - rx * 0.32], [bx, by - rx * 0.62], [bx + rx * 0.2, by - rx * 0.32], 10), 1.2, { closed: false, seed: 13, color: '#3a3330' });
  // shingled roof: a front-facing gable
  const rw = rx * 1.45, eave = ptop + rx * 0.06, peak = ptop - rx * 0.62;
  const R = rpoly([[cx - rw, eave], [cx, peak], [cx + rw, eave], [cx + rw - 6, eave + 7], [cx, peak + 12], [cx - rw + 6, eave + 7]], [3, 5, 3, 2, 4, 2], { seed: seedOf(cx, 14), jit: 0.8 });
  const tri = rpoly([[cx - rw + 14, eave], [cx, peak + 10], [cx + rw - 14, eave]], 3, { seed: seedOf(cx, 15), jit: 0.6 });
  x.fillStyle = '#6a4a34'; path(x, tri); x.fill();
  x.save(); path(x, tri); x.clip();
  for (let y = eave - 4, row = 0; y > peak; y -= 9, row++) for (let px = cx - rw + (row % 2) * 7; px < cx + rw; px += 14) { const S = rpoly([[px, y - 9], [px + 13, y - 9], [px + 13, y - 2], [px + 6.5, y + 1], [px, y - 2]], 2.5, { seed: seedOf(px, y), jit: 0.4, step: 3 }); x.fillStyle = pick(r, ['#9a6440', '#8a5838', '#a8704a', '#7c5032']); path(x, S); x.fill(); x.strokeStyle = 'rgba(50,30,20,.6)'; x.lineWidth = 0.9; path(x, S); x.stroke(); }
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.5; x.fillStyle = SHADE; x.beginPath(); x.moveTo(cx + 2, peak); x.lineTo(cx + rw + 10, eave + 10); x.lineTo(cx + 2, eave + 10); x.fill();
  x.restore(); ink(x, tri, 1.6, { seed: seedOf(cx, 16) });
  x.fillStyle = '#5a3e2a'; path(x, R); x.fill(); ink(x, R, 1.8, { seed: seedOf(cx, 17) });
  for (let i = 0; i < 6; i++) tuft(x, r, cx - rx + (i / 5) * rx * 2, base + ry * 0.7 + Math.sin((i / 5) * Math.PI) * ry * 0.3, rx * 0.4, 14 + r() * 12, { n: 7 });
  fern(x, r, cx - rx * 0.9, base + ry * 0.6, rx * 0.7, -2.4);
  return G;
}
// A small fern frond from (cx, cy) at angle ang.
function fern(x, r, cx, cy, len, ang) {
  const tip = [cx + Math.cos(ang) * len, cy + Math.sin(ang) * len], pts = quad([cx, cy], [cx + Math.cos(ang - 0.35) * len * 0.6, cy + Math.sin(ang - 0.35) * len * 0.6], tip, 16);
  ink(x, pts, 2.4, { closed: false, color: '#2f5a30', seed: seedOf(cx, cy) });
  for (let k = 2; k < pts.length - 1; k++) { const u = k / pts.length, s = (1 - u) * len * 0.22 + 3, [px, py] = pts[k]; for (const sd of [-1, 1]) { const a = ang + sd * 1.15; x.fillStyle = pick(r, ['#2f5a30', '#3d6d3d', '#4a7d44']); blob(x, px + Math.cos(a) * s * 0.5, py + Math.sin(a) * s * 0.5, s * 0.55, s * 0.2, a, r, 6); } }
}

// ───────────── the bench ─────────────
// A slatted wooden garden bench seen from the front. B = { x, base, w, seatH, depth, backH }, all in world px
// at the bench's depth. Returns the seat: { y (top of the seat, where a sitter's contact point goes), front, back }.
export function benchGeom(B) {
  const { x: cx, base, w, seatH, depth = seatH * 0.32, backH = seatH * 0.95 } = B, front = base - seatH;
  return { cx, base, w, seatH, depth, backH, front, back: front - depth, y: front - depth * 0.45, x0: cx - w / 2, x1: cx + w / 2, bounds: [cx - w / 2 - 20, front - depth - backH - 20, cx + w / 2 + 20, base + 12] };
}
export function bench(x, r, B, { light = L0, col = '#a87a4e' } = {}) {
  const G = benchGeom(B), { cx, base, w, seatH, depth, backH, front, back } = G, x0 = cx - w / 2, x1 = cx + w / 2;
  const t = Math.max(3.5, seatH * 0.12), lw = Math.max(4.5, seatH * 0.13), inset = w * 0.07, slat = Math.max(4, backH * 0.17);
  const wood = { col, light, inkW: 1.3 }, dark = { col: '#7a5434', light, inkW: 1.3 };
  // back legs rise into the backrest posts; they stand a little behind (higher than) the front legs
  const bl = [x0 + inset + depth * 0.3, x1 - inset - depth * 0.3];
  for (const px of bl) beam(x, r, [px, base - depth * 0.8], [px, back - backH], lw, dark);
  // backrest: two wide slats and a top rail, with gaps the background shows through
  for (const k of [0.3, 0.62]) beam(x, r, [bl[0] - lw * 0.6, back - backH * k], [bl[1] + lw * 0.6, back - backH * k], slat, wood);
  beam(x, r, [bl[0] - lw, back - backH + slat * 0.2], [bl[1] + lw, back - backH + slat * 0.2], slat * 1.15, wood);
  // the seat, seen a little from above: three slats with dark gaps, a thin front rail below
  const seatP = rpoly([[x0, front], [x0 + depth * 0.3, back], [x1 - depth * 0.3, back], [x1, front]], 1.5, { seed: seedOf(cx, 1), jit: 0.4 });
  x.fillStyle = '#c4945e'; path(x, seatP); x.fill();
  x.save(); path(x, seatP); x.clip();
  for (const k of [0.36, 0.69]) { const y = lerp(front, back, k); x.fillStyle = 'rgba(52,34,22,.75)'; x.fillRect(x0, y - 0.9, w, 1.8); }
  for (let i = 0; i < w / 6; i++) { x.fillStyle = pick(r, WOOD.grain); blob(x, x0 + r() * w, lerp(front, back, r()), 6 + r() * 12, 0.6, 0, r, 5); }
  x.fillStyle = 'rgba(255,240,200,.3)'; x.fillRect(x0, front - depth * 0.3, w, depth * 0.3);
  x.restore();
  ink(x, seatP, 1.4, { seed: seedOf(cx, 2) });
  const rail = rpoly([[x0 - 1, front], [x1 + 1, front], [x1, front + t], [x0, front + t]], 1, { seed: seedOf(cx, 3), jit: 0.3 });
  x.fillStyle = col; path(x, rail); x.fill(); shadeIn(x, rail, 0.4); ink(x, rail, 1.3, { seed: seedOf(cx, 4) });
  // front legs, the far side of each in lavender shade
  for (const px of [x0 + inset, x1 - inset]) beam(x, r, [px, front + t * 0.5], [px, base + 1], lw * 1.05, wood);
  // a stretcher between the front legs
  beam(x, r, [x0 + inset, base - seatH * 0.28], [x1 - inset, base - seatH * 0.28], lw * 0.6, dark);
  // arm rests from the back posts to the front legs
  for (const [i, s] of [-1, 1].entries()) {
    const fx = s < 0 ? x0 + inset : x1 - inset, ay = front - seatH * 0.46;
    beam(x, r, [fx, front], [fx, ay], lw, wood);
    beam(x, r, [bl[i] - s * lw * 0.2, back - seatH * 0.5], [fx + s * lw * 0.9, ay], lw * 1.1, wood);
  }
  for (const px of [x0 + inset, x1 - inset, bl[0], bl[1]]) tuft(x, r, px, base + 3, 16, 9 + r() * 7, { n: 5 });
  return G;
}

// ───────────── the lantern post ─────────────
// A wooden post with a curled iron bracket and a hanging four-pane lantern. L = { x, base, h, arm (+1 right) }.
export function lanternGeom(L) {
  const { x: px, base, h, arm = 1, s = 1 } = L, top = base - h, ax = px + arm * 44 * s, hook = [ax, top + 14 * s];
  const lw = 22 * s, lh = 34 * s, ly0 = hook[1] + 14 * s;
  return { x: px, base, h, top, arm, s, hook, glass: { x0: ax - lw / 2, x1: ax + lw / 2, y0: ly0 + 8 * s, y1: ly0 + 8 * s + lh }, lamp: [ax, ly0 + 8 * s + lh * 0.55], bounds: [Math.min(px, ax) - 40 * s, top - 30 * s, Math.max(px, ax) + 40 * s, base + 12] };
}
export function lanternPost(x, r, L, { light = L0 } = {}) {
  const G = lanternGeom(L), { x: px, base, top, arm, s, hook, glass: g } = G, pw = 11 * s;
  beam(x, r, [px, base + 2], [px, top - 6 * s], pw, { col: '#4e3d32', light, inkW: 1.8 });
  const capP = rpoly([[px - pw * 0.9, top - 4 * s], [px, top - 16 * s], [px + pw * 0.9, top - 4 * s]], 2, { seed: seedOf(px, 1), jit: 0.4 });
  x.fillStyle = '#3a3330'; path(x, capP); x.fill(); ink(x, capP, 1.2, { seed: seedOf(px, 2) });
  // the bracket: a straight arm with a curl underneath
  ink(x, [[px, top + 4 * s], [hook[0] + arm * 4 * s, top + 4 * s]], 3.2 * s, { closed: false, color: '#2e2a2c', seed: 3, taper: false });
  const curl = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * 0.5 + (i / 24) * Math.PI * 1.6, rr = 13 * s * (1 - i / 34); curl.push([px + arm * (16 * s + Math.cos(a) * rr * -1), top + 18 * s + Math.sin(a) * rr * -1 + 0]); }
  ink(x, [[px, top + 30 * s], ...quad([px, top + 30 * s], [px + arm * 30 * s, top + 26 * s], [hook[0] - arm * 4 * s, top + 6 * s], 10)], 2.2 * s, { closed: false, color: '#2e2a2c', seed: 4 });
  ink(x, curl, 1.8 * s, { closed: false, color: '#2e2a2c', seed: 5 });
  ink(x, [hook, [hook[0], g.y0 - 14 * s]], 1.6 * s, { closed: false, color: '#2e2a2c', seed: 6, taper: false });
  lanternBody(x, r, G, 0);
  tuft(x, r, px, base + 4, 30 * s, 18 * s, { n: 8 });
  return G;
}
// The lantern itself; litK 0 = cold glass by day, 1 = burning.
export function lanternBody(x, r, G, litK = 0) {
  const { s, glass: g } = G, cx = (g.x0 + g.x1) / 2, hw = (g.x1 - g.x0) / 2;
  const roof = rpoly([[g.x0 - 6 * s, g.y0], [cx, g.y0 - 14 * s], [g.x1 + 6 * s, g.y0]], 2, { seed: 21, jit: 0.4 });
  const base = rpoly([[g.x0 - 3 * s, g.y1], [g.x1 + 3 * s, g.y1], [g.x1, g.y1 + 6 * s], [g.x0, g.y1 + 6 * s]], 1.5, { seed: 22, jit: 0.3 });
  const glassP = rpoly([[g.x0, g.y0], [g.x1, g.y0], [g.x1 - 2 * s, g.y1], [g.x0 + 2 * s, g.y1]], 1, { seed: 23, jit: 0.3 });
  if (litK) {
    const gr = x.createRadialGradient(cx, g.y0 + (g.y1 - g.y0) * 0.6, 1, cx, g.y0 + (g.y1 - g.y0) * 0.5, hw * 2);
    gr.addColorStop(0, WARM.hot); gr.addColorStop(0.5, WARM.mid); gr.addColorStop(1, WARM.edge); x.fillStyle = gr; path(x, glassP); x.fill();
    x.fillStyle = '#fffbe8'; blob(x, cx, g.y1 - (g.y1 - g.y0) * 0.42, 3 * s, 6 * s, 0, r, 8);
  } else {
    x.fillStyle = '#8fa6aa'; path(x, glassP); x.fill();
    x.save(); path(x, glassP); x.clip(); x.fillStyle = 'rgba(40,46,56,.45)'; x.fillRect(cx, g.y0, hw, g.y1 - g.y0); x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(g.x0 + hw * 0.25, g.y0 + 3, hw * 0.25, g.y1 - g.y0 - 6); x.restore();
    x.fillStyle = '#efe6d0'; x.fillRect(cx - 2.5 * s, g.y1 - 12 * s, 5 * s, 10 * s); x.fillStyle = '#3a3030'; x.fillRect(cx - 0.5 * s, g.y1 - 15 * s, 1 * s, 3 * s);
  }
  x.strokeStyle = '#2e2a2c'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(cx, g.y0); x.lineTo(cx, g.y1); x.stroke();
  ink(x, glassP, 1.6 * s, { seed: 24 });
  x.fillStyle = '#2e2a2c'; path(x, roof); x.fill(); path(x, base); x.fill();
  x.strokeStyle = '#2e2a2c'; x.lineWidth = 1.6 * s; x.beginPath(); x.arc(cx, g.y0 - 17 * s, 3.5 * s, 0, 7); x.stroke();
  if (!litK) { x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(g.x0 - 4 * s, g.y0); x.lineTo(cx, g.y0 - 12 * s); x.lineTo(cx, g.y0 - 8 * s); x.fill(); }
}

// ───────────── paths and garden ─────────────
// Cobbles filling polygon P; their size follows depth (sAt).
export function cobbles(x, r, P, { sAt = () => 1, size = 15, pal = ['#b9b1a0', '#a8a08f', '#c8c0ac', '#9b9484', '#b4a993', '#c2b49a'], mortar = '#857b68', light = L0, moss = 0.12 } = {}) {
  const B = box(P);
  x.fillStyle = mortar; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let y = B.y0 - 4; y < B.y1 + 10;) {
    const s = sAt(y), h = size * s * 0.62;
    for (let px = B.x0 - r() * size * s; px < B.x1 + 10;) {
      const w = size * s * (0.75 + r() * 0.5), cx = px + w / 2, cy = y + h / 2 + (r() - 0.5) * h * 0.2;
      x.fillStyle = 'rgba(50,44,36,.35)'; blob(x, cx + w * 0.06, cy + h * 0.12, w * 0.46, h * 0.44, 0, r, 7);
      x.fillStyle = pick(r, pal); blob(x, cx, cy, w * 0.44, h * 0.4, (r() - 0.5) * 0.3, r, 7);
      x.fillStyle = 'rgba(255,250,232,.4)'; blob(x, cx + light[0] * w * 0.14, cy + light[1] * h * 0.18, w * 0.2, h * 0.12, 0, r, 6);
      if (r() < moss) { x.fillStyle = 'rgba(96,130,60,.65)'; blob(x, cx + w * 0.42, cy + h * 0.3, w * 0.18, h * 0.12, 0, r, 6); }
      px += w;
    }
    y += h;
  }
  x.restore();
}
// Big irregular flagstones from a to b (a garden path), each laid across the path's width hw (at a's depth).
export function flagstones(x, r, a, b, hw, { sAt = () => 1, pal = ['#c9c1ad', '#bdb4a0', '#d4ccb8', '#b2a994'], light = L0 } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), out = [];
  for (let u = 0; u < 1;) {
    const p = along(a, b, u), s = sAt(p[1]), d = 26 * s * (0.8 + r() * 0.4), w = hw * (s / sAt(a[1])) * (0.85 + r() * 0.2), q = along(a, b, Math.min(1, u + d / len));
    const cx = (p[0] + q[0]) / 2 + (r() - 0.5) * 6 * s, cy = (p[1] + q[1]) / 2;
    const P = rpoly([[cx - w, cy - d * 0.42], [cx + w * (0.8 + r() * 0.2), cy - d * 0.45], [cx + w, cy + d * 0.4], [cx - w * (0.85 + r() * 0.15), cy + d * 0.42]], 5 * s, { seed: seedOf(cx, cy), jit: 1.2 * s });
    x.fillStyle = 'rgba(60,54,40,.4)'; path(x, P.map(([px, py]) => [px + 2, py + 2])); x.fill();
    x.fillStyle = pick(r, pal); path(x, P); x.fill();
    x.save(); path(x, P); x.clip(); x.fillStyle = 'rgba(255,250,236,.35)'; x.fillRect(cx - w, cy - d * 0.5, w * 0.6, d * 0.3); x.fillStyle = 'rgba(110,140,70,.5)'; for (let i = 0; i < 3; i++) blob(x, cx + (r() - 0.5) * w * 1.6, cy + d * 0.38, 3 * s, 1.5 * s, 0, r, 6); x.restore();
    x.strokeStyle = 'rgba(70,60,50,.55)'; x.lineWidth = 1.2; path(x, P); x.stroke();
    out.push(P); u += (d * 1.08) / len;
  }
  return out;
}
// One cottage-garden flower plant (daisy, foxglove, lavender or poppy) at scale s.
export function cottageFlower(x, r, px, py, s = 1, kind = null) {
  const k = kind || pick(r, ['daisy', 'foxglove', 'lavender', 'poppy', 'daisy']);
  if (k === 'foxglove') { const h = (40 + r() * 30) * s; ink(x, [[px, py], [px + (r() - 0.5) * 4, py - h]], 1.8 * s, { closed: false, color: '#4a6e34', seed: seedOf(px, py) }); const c = pick(r, ['#c86ab0', '#e2a0d0', '#f2e6f0']); for (let i = 0; i < 7; i++) { x.fillStyle = c; blob(x, px + (i % 2 ? 2.5 : -2.5) * s, py - h * (0.35 + i * 0.09), 2.8 * s, 2.2 * s, 0, r, 6); } return; }
  if (k === 'lavender') { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.18, L = (22 + r() * 10) * s, tip = [px + Math.cos(a) * L, py + Math.sin(a) * L]; ink(x, [[px, py], tip], 1.2 * s, { closed: false, color: '#6a8a5a', seed: seedOf(px, i) }); x.fillStyle = pick(r, ['#8a78c8', '#9c8ad6', '#7464b4']); blob(x, tip[0], tip[1] + 3 * s, 1.8 * s, 5 * s, a + Math.PI / 2, r, 6); } return; }
  if (k === 'poppy') { const h = (24 + r() * 14) * s; ink(x, quad([px, py], [px + 4 * s, py - h * 0.6], [px + 2 * s, py - h], 8), 1.4 * s, { closed: false, color: '#5a7a3a', seed: seedOf(px, py, 1) }); x.fillStyle = '#e0402e'; blob(x, px + 2 * s, py - h, 5 * s, 4 * s, 0, r, 7); x.fillStyle = '#2a1e1e'; x.beginPath(); x.arc(px + 2 * s, py - h, 1.2 * s, 0, 7); x.fill(); return; }
  const h = (18 + r() * 12) * s; ink(x, [[px, py], [px + (r() - 0.5) * 3, py - h]], 1.2 * s, { closed: false, color: '#5a7a3a', seed: seedOf(px, py, 2) });
  for (let j = 0; j < 6; j++) { const a = j / 6 * 6.28; x.fillStyle = '#fbf7ee'; x.beginPath(); x.arc(px + Math.cos(a) * 2.6 * s, py - h + Math.sin(a) * 2.6 * s, 1.8 * s, 0, 7); x.fill(); }
  x.fillStyle = '#e8b83a'; x.beginPath(); x.arc(px, py - h, 1.5 * s, 0, 7); x.fill();
}

// One vegetable plant (cabbage, lettuce, carrot, onion, pumpkin, beans) standing at (px, py), scale s.
export function vegetable(x, r, kind, px, py, s, light) {
  if (kind === 'cabbage') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r() * 0.4; x.fillStyle = pick(r, ['#6f9e7a', '#5e8e70', '#86b08c']); blob(x, px + Math.cos(a) * 8 * s, py - 6 * s + Math.sin(a) * 4 * s, 9 * s, 6 * s, a, r, 7); }
    const H = ell(px, py - 9 * s, 8.5 * s, 7.5 * s, seedOf(px, py), 0.4);
    x.fillStyle = '#a8cc98'; path(x, H); x.fill(); x.save(); path(x, H); x.clip(); x.strokeStyle = 'rgba(70,110,80,.6)'; x.lineWidth = 1; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(px + (i - 1) * 4 * s, py - 4 * s, 7 * s, Math.PI * 1.2, Math.PI * 1.8); x.stroke(); } x.restore();
    shadePoly(x, H, [[px + 1, py - 20 * s], [px + 12 * s, py - 20 * s], [px + 12 * s, py], [px + 1, py]], 0.4); ink(x, H, 1, { seed: seedOf(px, 1) });
  } else if (kind === 'lettuce') {
    for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.05 + 0.9 * r()); x.fillStyle = pick(r, ['#9cc860', '#b4d870', '#86b450', '#c8e488']); blob(x, px + Math.cos(a) * 5 * s, py - 5 * s + Math.sin(a) * 5 * s, 6 * s, 4 * s, a, r, 8); }
  } else if (kind === 'carrot') {
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.22, L = (14 + r() * 8) * s; ink(x, [[px, py - 1], [px + Math.cos(a) * L, py + Math.sin(a) * L]], 1.3 * s, { closed: false, color: pick(r, ['#5a9a3a', '#6aaa44', '#4e8a34']), seed: seedOf(px, i) }); x.fillStyle = '#6aaa44'; blob(x, px + Math.cos(a) * L, py + Math.sin(a) * L, 3 * s, 2 * s, a, r, 6); }
    x.fillStyle = '#e8873a'; blob(x, px, py, 3 * s, 2 * s, 0, r, 6);
  } else if (kind === 'onion') {
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.25; ink(x, [[px, py - 2 * s], [px + Math.cos(a) * 18 * s, py + Math.sin(a) * 18 * s]], 1.6 * s, { closed: false, color: '#7aa08a', seed: seedOf(px, i, 3) }); }
    x.fillStyle = '#e6d6b0'; blob(x, px, py - 1, 4 * s, 3.4 * s, 0, r, 7);
  } else if (kind === 'pumpkin') {
    for (let i = 0; i < 3; i++) { const a = -Math.PI * (0.15 + 0.35 * i); x.fillStyle = pick(r, ['#4f8040', '#5e8e48', '#3f6e36']); blob(x, px + Math.cos(a) * 14 * s, py - 4 * s + Math.sin(a) * 8 * s, 12 * s, 8 * s, a, r, 8); }
    const P = ell(px, py - 8 * s, 12 * s, 9 * s, seedOf(px, py, 4), 0.5);
    x.fillStyle = '#e8862e'; path(x, P); x.fill(); x.save(); path(x, P); x.clip(); x.strokeStyle = 'rgba(160,70,20,.6)'; x.lineWidth = 1.2; for (const k of [-0.5, 0, 0.5]) { x.beginPath(); x.ellipse(px + k * 9 * s, py - 8 * s, 4 * s, 9 * s, 0, 0, 7); x.stroke(); } x.fillStyle = 'rgba(255,220,150,.45)'; x.beginPath(); x.ellipse(px - 4 * s, py - 12 * s, 4 * s, 2.4 * s, 0, 0, 7); x.fill(); x.restore();
    shadePoly(x, P, [[px + 2 * s, py - 30 * s], [px + 20 * s, py - 30 * s], [px + 20 * s, py + 2], [px + 2 * s, py + 2]], 0.45); ink(x, P, 1.2, { seed: seedOf(px, 5) });
    x.fillStyle = '#5a4a2a'; x.fillRect(px - 1.2 * s, py - 19 * s, 2.4 * s, 4 * s);
  } else if (kind === 'beans') {
    // a wigwam of bean poles with climbing leaves and red flowers
    const h = 120 * s, top = [px, py - h];
    for (const dx of [-16, -5, 6, 17]) ink(x, [[px + dx * s, py], top], 2.4 * s, { closed: false, color: '#8a6a44', seed: seedOf(px, dx) });
    for (let i = 0; i < 40; i++) { const u = r(), dx = pick(r, [-16, -5, 6, 17]) * s * (1 - u), yy = py - h * u; x.fillStyle = pick(r, ['#3f6e36', '#4f8040', '#6a9a50']); blob(x, px + dx + (r() - 0.5) * 8 * s, yy, 5 * s, 3.6 * s, r() * 3, r, 6); if (r() < 0.2) { x.fillStyle = '#d8402e'; blob(x, px + dx + (r() - 0.5) * 6 * s, yy - 2 * s, 2 * s, 1.6 * s, 0, r, 6); } }
  }
}
// A vegetable bed: tilled soil edged with boards, rows of vegetables parallel to the front edge.
// bed = { x0, x1, y0, y1, rows: ['cabbage', 'carrot', …] (back row first), back: [{ kind, x }] (tall plants
// along the back edge, e.g. a bean wigwam, painted behind the rows) }. Returns the soil polygon.
export function vegBed(x, r, bed, { sAt = () => 1, light = L0 } = {}) {
  const { x0, x1, y0, y1 } = bed, P = rpoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 6, { seed: seedOf(x0, y0), jit: 1.2 });
  x.fillStyle = '#6a4a34'; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let i = 0; i < ((x1 - x0) * (y1 - y0)) / 40; i++) { x.fillStyle = pick(r, ['#5a3e2c', '#7a5840', '#4c3426', '#8a6a4c']); blob(x, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 3 + r() * 6, 1 + r() * 1.6, 0, r, 6); }
  const rows = bed.rows || ['cabbage', 'carrot'];
  for (let i = 0; i < rows.length; i++) { const y = lerp(y0 + 8, y1 - 6, rows.length === 1 ? 0.5 : i / (rows.length - 1)); x.strokeStyle = 'rgba(40,26,18,.45)'; x.lineWidth = 2 * sAt(y); x.beginPath(); x.moveTo(x0, y + 2); x.lineTo(x1, y + 2); x.stroke(); }
  x.restore();
  // board edging along the front
  const Bd = rpoly([[x0 - 3, y1 - 3], [x1 + 3, y1 - 3], [x1 + 3, y1 + 5 * sAt(y1)], [x0 - 3, y1 + 5 * sAt(y1)]], 1.5, { seed: seedOf(x1, y1), jit: 0.5 });
  x.fillStyle = '#9a7048'; path(x, Bd); x.fill(); ink(x, Bd, 1.2, { seed: seedOf(x1, 2) });
  for (const b of bed.back || []) vegetable(x, r, b.kind, b.x, y0 + 4, sAt(y0 + 4), light);
  for (let i = 0; i < rows.length; i++) {
    const y = lerp(y0 + 8, y1 - 6, rows.length === 1 ? 0.5 : i / (rows.length - 1)), s = sAt(y), kind = rows[i];
    const step = { cabbage: 26, lettuce: 20, carrot: 13, onion: 12, pumpkin: 46, beans: 70 }[kind] * s;
    for (let px = x0 + step * 0.6; px < x1 - step * 0.4; px += step * (0.9 + r() * 0.2)) vegetable(x, r, kind, px, y, s, light);
  }
  return P;
}

// A wooden wheelbarrow full of potted flowers, wheel to the right. Wb = { x, base, s }.
export function wheelbarrow(x, r, Wb, { light = L0 } = {}) {
  const { x: cx, base, s = 1 } = Wb, k = v => v * s;
  const wheel = [cx + k(62), base - k(19)], wr = k(19);
  const trayTop = base - k(64), trayBot = base - k(30);
  // handles and legs (behind the tray)
  beam(x, r, [cx - k(96), base - k(52)], [cx + k(40), trayBot + k(4)], k(5), { col: WOOD.dark, light, inkW: 1.4 });
  for (const lx of [cx - k(40), cx - k(22)]) beam(x, r, [lx, trayBot], [lx - k(4), base + 1], k(5), { col: WOOD.dark, light, inkW: 1.4 });
  // pots and flowers
  const pots = [[-28, 0.9], [2, 1.05], [30, 0.85]];
  for (const [dx, sz] of pots) {
    const px = cx + k(dx), py = trayTop + k(6), h = k(22) * sz, w = k(14) * sz;
    clump(x, px, py - h - k(6) * sz, k(34) * sz, k(22) * sz, ['#2f5a30', '#3e6e38', '#4f8044', '#6a9a50'], 12, r, { size: 0.16, light });
    for (let i = 0; i < 7; i++) { x.fillStyle = pick(r, dx < 0 ? ['#e8584a', '#d8403a', '#f07a6a'] : dx > 20 ? ['#fbf7ee', '#f6e27a'] : ['#c86ab0', '#e2a0d0', '#f3b8c8']); blob(x, px + (r() - 0.5) * k(28) * sz, py - h - k(4) - r() * k(16) * sz, k(3.4), k(3), 0, r, 7); }
    const P = rpoly([[px - w, py - h], [px + w, py - h], [px + w * 0.75, py], [px - w * 0.75, py]], 2, { seed: seedOf(px, py), jit: 0.5 });
    x.fillStyle = '#c8683e'; path(x, P); x.fill(); x.fillStyle = '#d87a4e'; x.fillRect(px - w, py - h, w * 2, k(4)); shadeIn(x, rpoly([[px + w * 0.15, py - h], [px + w, py - h], [px + w * 0.75, py], [px + w * 0.1, py]], 1, { jit: 0 }), 0.45); ink(x, P, 1.3, { seed: seedOf(px, 2) });
  }
  // the tray: a tapering wooden box
  const T = rpoly([[cx - k(52), trayTop], [cx + k(52), trayTop], [cx + k(40), trayBot], [cx - k(38), trayBot]], k(3), { seed: seedOf(cx, base), jit: 0.6 });
  x.fillStyle = '#9a6a44'; path(x, T); x.fill();
  x.save(); path(x, T); x.clip(); x.strokeStyle = 'rgba(60,38,24,.5)'; x.lineWidth = 1.3; for (const f of [0.34, 0.67]) { const y = lerp(trayTop, trayBot, f); x.beginPath(); x.moveTo(cx - k(60), y); x.lineTo(cx + k(60), y); x.stroke(); } x.fillStyle = 'rgba(255,230,180,.25)'; x.fillRect(cx - k(52), trayTop, k(104), k(5)); x.restore();
  celShade(x, T, { light, amount: 0.45, bias: -0.2, seed: seedOf(cx, 7) }); ink(x, T, 1.8, { seed: seedOf(cx, 8) });
  // the wheel
  const Wp = ell(wheel[0], wheel[1], wr, wr, seedOf(cx, 9), 0.4);
  x.fillStyle = '#6e4c32'; path(x, Wp); x.fill();
  x.fillStyle = '#a07450'; path(x, ell(wheel[0], wheel[1], wr * 0.72, wr * 0.72, seedOf(cx, 10), 0.3)); x.fill();
  x.strokeStyle = '#5a3e2a'; x.lineWidth = k(2.2); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; x.beginPath(); x.moveTo(wheel[0], wheel[1]); x.lineTo(wheel[0] + Math.cos(a) * wr * 0.72, wheel[1] + Math.sin(a) * wr * 0.72); x.stroke(); }
  shadePoly(x, Wp, [[wheel[0], wheel[1] - wr * 2], [wheel[0] + wr * 2, wheel[1] - wr * 2], [wheel[0] + wr * 2, wheel[1] + wr * 2], [wheel[0] - wr * 0.2, wheel[1] + wr * 2]], 0.4);
  ink(x, Wp, 1.8, { seed: seedOf(cx, 11) }); x.fillStyle = '#3a2a20'; x.beginPath(); x.arc(wheel[0], wheel[1], k(3), 0, 7); x.fill();
  tuft(x, r, wheel[0], base + 3, k(30), k(12), { n: 6 }); tuft(x, r, cx - k(30), base + 3, k(36), k(12), { n: 6 });
  return { bounds: [cx - k(110), trayTop - k(70), cx + k(90), base + 10] };
}

// ───────────── distance ─────────────
// A small simple cottage for the middle distance (no ink of its own: the layer outline inks it).
// Returns its window rectangles for the night glow.
export function smallCottage(x, r, cx, base, w, h, { roof = 'thatch', wall = '#e6d8bc', roofPal = null, light = L0, chimney = true, windows = 2 } = {}) {
  const rh = h * 0.9, x0 = cx - w / 2, x1 = cx + w / 2, ye = base - h, side = w * 0.22, out = [];
  const S = [[x1, base], [x1 + side, base - side * 0.5], [x1 + side, ye - side * 0.5], [x1 + side / 2, ye - side * 0.25 - rh * 0.7], [x1, ye]];
  x.fillStyle = wall; path(x, S); x.fill(); shadeIn(x, S, 0.6);
  const F = [[x0, base], [x1, base], [x1, ye], [x0, ye]];
  x.fillStyle = wall; path(x, F); x.fill();
  x.save(); path(x, F); x.clip(); for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(120,96,70,.12)'; blob(x, x0 + r() * w, ye + r() * h, 10 + r() * 20, 4 + r() * 6, 0, r, 6); } x.restore();
  if (roof === 'tile') x.fillStyle = '#5a4434'; else x.fillStyle = '#6a5038';
  for (const px of [x0 + 3, x1 - 3]) x.fillRect(px - 2.5, ye, 5, h);
  const dw = w * 0.14, dx = cx + (r() - 0.3) * w * 0.3; x.fillStyle = pick(r, ['#4f7d78', '#8a4a3a', '#5a6a8a']); x.fillRect(dx - dw / 2, base - h * 0.55, dw, h * 0.55);
  for (let i = 0; i < windows; i++) { const wx = lerp(x0 + w * 0.2, x1 - w * 0.2, windows === 1 ? 0.5 : i / (windows - 1)); if (Math.abs(wx - dx) < dw * 1.4) continue; const ww = w * 0.12, wh = h * 0.24, wy = ye + h * 0.3; x.fillStyle = '#3e4f5c'; x.fillRect(wx - ww / 2, wy, ww, wh); x.fillStyle = 'rgba(200,220,228,.6)'; x.fillRect(wx - ww / 2, wy, ww * 0.4, wh); x.strokeStyle = '#efe8d8'; x.lineWidth = 2; x.strokeRect(wx - ww / 2, wy, ww, wh); out.push([wx - ww / 2, wy, ww, wh]); }
  const pal = roofPal || (roof === 'tile' ? ['#a85a44', '#b8664c', '#9a4e3c', '#c27458', '#8a4232'] : THATCH.pal);
  const R = rpoly([[x0 - w * 0.08, ye + 6], [x1 + w * 0.08, ye + 6], [x1 + w * 0.08 + side / 2, ye - side * 0.25 - rh], [x0 - w * 0.04 + side / 2, ye - side * 0.25 - rh]], roof === 'tile' ? 3 : 14, { seed: seedOf(cx, base), jit: 1.2 });
  if (roof === 'tile') { x.fillStyle = pal[0]; path(x, R); x.fill(); x.save(); path(x, R); x.clip(); const B = box(R); for (let y = B.y0; y < B.y1; y += 8) for (let px = B.x0 - (Math.round(y / 8) % 2) * 6; px < B.x1; px += 12) { x.fillStyle = pick(r, pal); x.fillRect(px + 1, y + 1, 10, 6.5); } x.restore(); }
  else thatchFill(x, r, R, [0, 1], { courses: 22 });
  celShade(x, R, { light: [light[0], 0.1], amount: 0.3, bias: -0.4, seed: seedOf(cx, 1) });
  const BR = [[x1 + w * 0.08, ye + 6], [x1 + w * 0.08 + side / 2, ye - side * 0.25 - rh], [x1 + w * 0.08 + side, ye - side * 0.5 + 6], [x1 + w * 0.08 + side - 4, ye - side * 0.5 + 14], [x1 + w * 0.08 + side / 2, ye - side * 0.25 - rh + 12], [x1 + w * 0.08 - 2, ye + 14]];
  x.fillStyle = roof === 'tile' ? pal[4] : THATCH.pal[4]; path(x, BR); x.fill();
  if (chimney) { const chx = x0 + w * 0.22 + side * 0.3, cy0 = ye - side * 0.25 - rh * 0.8; const C = [[chx - 7, cy0 + 16], [chx - 7, cy0 - 24], [chx + 7, cy0 - 24], [chx + 7, cy0 + 16]]; brickwork(x, r, C, { bw: 8, bh: 5 }); shadePoly(x, C, [[chx + 2, cy0 - 40], [chx + 20, cy0 - 40], [chx + 20, cy0 + 20], [chx + 2, cy0 + 20]], 0.5); }
  return out;
}
// Distant rooftops on a rise along y = yAt(x), with a church spire and tree clumps. Returns the window
// rectangles (tiny) for the night glow.
export function farVillage(x, r, x0, x1, yAt, { light = L0, n = 9, spire = null, wall = ['#d8ccb4', '#cfc2a8', '#e0d4bc'], roofs = ['#9a6a5a', '#a87868', '#8c7a62', '#b08a6a', '#7f6a5c'], trees = ['#7d9a86', '#8aa892', '#98b49c'] } = {}) {
  const out = [], xs = []; for (let i = 0; i < n; i++) xs.push(lerp(x0, x1, (i + 0.15 + r() * 0.7) / n));
  for (const px of xs) { const g = yAt(px), h = 16 + r() * 8; clump(x, px - 30 - r() * 20, g - h * 0.5, h * 1.6, h * 1.4, trees, 14, r, { size: 0.2, light }); }
  if (spire != null) {
    const g = yAt(spire) + 4, tw = 22, th = 58;
    x.fillStyle = '#cfc4b0'; x.fillRect(spire - tw / 2, g - th, tw, th + 6);
    x.fillStyle = 'rgba(154,140,196,.45)'; x.fillRect(spire + 2, g - th, tw / 2 - 2, th + 6);
    x.fillStyle = '#7a6a64'; x.beginPath(); x.moveTo(spire - tw / 2 - 3, g - th); x.lineTo(spire, g - th - 64); x.lineTo(spire + tw / 2 + 3, g - th); x.fill();
    x.fillStyle = '#d8ccb4'; x.fillRect(spire + tw * 0.6, g - 30, 60, 36); x.fillStyle = '#8a6a5c'; x.beginPath(); x.moveTo(spire + tw * 0.6 - 4, g - 30); x.lineTo(spire + tw * 0.6 + 30, g - 52); x.lineTo(spire + tw * 0.6 + 64, g - 30); x.fill();
    x.fillStyle = '#4a4a5a'; x.fillRect(spire - 3, g - th + 12, 6, 10); out.push([spire - 3, g - th + 12, 6, 10]);
    for (const k of [0.25, 0.6]) { x.fillStyle = '#4a4a5a'; x.fillRect(spire + tw * 0.6 + 60 * k, g - 22, 5, 9); out.push([spire + tw * 0.6 + 60 * k, g - 22, 5, 9]); }
  }
  for (const px of xs) {
    const g = yAt(px) + 6, w = 34 + r() * 26, h = 18 + r() * 10, rh = 14 + r() * 10, roof = pick(r, roofs);
    x.fillStyle = pick(r, wall); x.fillRect(px - w / 2, g - h, w, h + 4);
    x.fillStyle = 'rgba(154,140,196,.45)'; x.fillRect(px + w * 0.2, g - h, w * 0.3, h + 4);
    x.fillStyle = roof; x.beginPath(); x.moveTo(px - w / 2 - 4, g - h + 2); x.lineTo(px - w * 0.3, g - h - rh); x.lineTo(px + w * 0.3, g - h - rh); x.lineTo(px + w / 2 + 4, g - h + 2); x.fill();
    if (r() < 0.6) { x.fillStyle = '#8a6a5a'; x.fillRect(px - w * 0.2, g - h - rh - 8, 5, 12); }
    for (let k = 0; k < 2; k++) { if (r() < 0.25) continue; const wx = px - w * 0.3 + k * w * 0.4; x.fillStyle = '#4a4a5a'; x.fillRect(wx, g - h * 0.65, 5, 6); out.push([wx, g - h * 0.65, 5, 6]); }
  }
  for (let i = 0; i < n * 1.5; i++) { const px = lerp(x0, x1, r()), g = yAt(px) + 14, h = 12 + r() * 10; clump(x, px, g - h * 0.2, h * 1.8, h, trees, 12, r, { size: 0.22, light }); }
  return out;
}
// Paint the tiny far windows lit (warm dots with a faint halo).
export function farWindowsLit(x, wins, { a = 1 } = {}) {
  for (const [wx, wy, ww, wh] of wins) {
    x.save(); x.globalCompositeOperation = 'screen'; glow(x, wx + ww / 2, wy + wh / 2, 1, Math.max(ww, wh) * 3.2, WARM.rgb, 0.45 * a); x.restore();
    x.fillStyle = `rgba(255,214,130,${a})`; x.fillRect(wx, wy, ww, wh);
  }
}

// A canvas helper for lit overlays: paint fn(x) in world coordinates over rect [x0, y0, x1, y1] at res.
export function worldCanvas(rect, res, fn) {
  const [x0, y0, x1, y1] = rect, [c, x] = canvas(Math.max(1, Math.ceil((x1 - x0) * res)), Math.max(1, Math.ceil((y1 - y0) * res)));
  x.setTransform(res, 0, 0, res, -x0 * res, -y0 * res); fn(x);
  return { c, x0, y0, w: x1 - x0, h: y1 - y0 };
}
