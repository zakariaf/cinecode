// Character painting style: cel shading with one hard lavender multiply shadow, hand-inked outlines,
// cartoon eyes and brows, and the soft ground shadow. Light comes from the upper left of the screen.
import { clamp, lerp, path, poly, shift, ink, INK } from './lib.mjs';

export const SHADE = '#c3b8dc';

// Line-weight multiplier. Rigs set it from their draw scale so close-ups get relatively finer lines
// (a painter redraws a close-up; they don't just enlarge the wide shot).
let LW = 1;
export const lineScale = () => LW;
export function setLineScale(k) { const prev = LW; LW = k; return prev; }
export const lineScaleFor = s => (s > 2 ? Math.pow(2 / s, 0.45) : 1);

// Screen pixels per local unit of ctx (a rig's Tee also knows the canvas transform underneath it).
const pxPerUnit = ctx => { if (!ctx) return 1; if (ctx.pxPerUnit) return ctx.pxPerUnit(); const m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); };

// An outline resampled as a smooth curve wherever the screen would show its facets: each segment longer than `px`
// screen pixels becomes a Hermite curve between its end points (Catmull-Rom directions with chord-length tangents, so
// no overshoot or loops where long and short segments meet). Vertices that turn by more than `corner` radians stay
// sharp (ear tips, beaks, the notches between fur tufts). Returns P itself when it is already fine enough, so wide
// shots draw exactly as before. Smooth a shape once and use the result for its fill, clip and ink alike.
export function smoothPts(ctx, P, { closed = true, px = 4, corner = 0.9 } = {}) {
  const n = P.length; if (n < 3) return P;
  const step = px / (pxPerUnit(ctx) || 1), segs = closed ? n : n - 1, at = i => P[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  let fine = true; for (let i = 0; i < segs && fine; i++) { const a = P[i], b = at(i + 1); if (Math.hypot(b[0] - a[0], b[1] - a[1]) > step) fine = false; }
  if (fine) return P;
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
  const tan = [];                                              // [incoming, outgoing] unit tangent at each vertex
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { const d = i ? dir(P[i - 1], P[i]) : dir(P[0], P[1]); tan.push([d, d]); continue; }
    const u = dir(at(i - 1), P[i]), v = dir(P[i], at(i + 1)), d = dir(at(i - 1), at(i + 1));
    tan.push(u[0] * v[0] + u[1] * v[1] < Math.cos(corner) ? [u, v] : [d, d]);
  }
  const out = [];
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = at(i + 1), L = Math.hypot(b[0] - a[0], b[1] - a[1]), ta = tan[i][1], tb = tan[(i + 1) % n][0], m = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t, h1 = 2 * t3 - 3 * t2 + 1, h2 = (t3 - 2 * t2 + t) * L, h3 = 3 * t2 - 2 * t3, h4 = (t3 - t2) * L;
      out.push([h1 * a[0] + h2 * ta[0] + h3 * b[0] + h4 * tb[0], h1 * a[1] + h2 * ta[1] + h3 * b[1] + h4 * tb[1]]);
    }
  }
  if (!closed) out.push(P[n - 1]);
  return out;
}

const hx2 = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const toHex = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
export const darken = (hex, f) => '#' + [1, 3, 5].map(i => toHex(hx2(hex, i) * f)).join('');
export const lighten = (hex, f) => '#' + [1, 3, 5].map(i => { const c = hx2(hex, i); return toHex(c + (255 - c) * f); }).join('');
export const mixHex = (a, b, u) => '#' + [1, 3, 5].map(i => toHex(lerp(hx2(a, i), hx2(b, i), u))).join('');
export const rgba = (hex, a) => `rgba(${hx2(hex, 1)},${hx2(hex, 3)},${hx2(hex, 5)},${a})`;

// Shadow offset in the current local frame. `sh` is either an explicit [dx, dy] (legacy) or a number:
// the offset in rig units, pointed at the upper left of the screen whatever the frame's rotation/flip.
function shadeShift(ctx, sh) {
  if (Array.isArray(sh)) return sh;
  if (!sh) return [0, 0];
  if (ctx.lightShift) return ctx.lightShift(sh);
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c || 1, k = Math.sqrt(Math.abs(det)) * sh;
  return [(-k * m.d + k * m.c) / det, (k * m.b - k * m.a) / det];
}

// Fill a shape, then darken (multiply) the part of it not covered by a copy shifted toward the light.
export function cel(ctx, P, col, sh = 2.2, w = 1.15, seed = 1) {
  const [dx, dy] = shadeShift(ctx, sh);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const m = Math.abs(dx) + Math.abs(dy) + 2;
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  if (dx || dy) {
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = SHADE;
    ctx.beginPath(); ctx.rect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m); poly(ctx, shift(P, dx, dy)); ctx.fill('evenodd');
  }
  ctx.restore();
  if (w > 0) ink(ctx, P, w * LW, { seed });
}

// Ink with the current line-weight multiplier.
export const line = (ctx, P, w, opt = {}) => ink(ctx, P, w * LW, { closed: false, ...opt });
export const outline = (ctx, P, w, seed = 1) => ink(ctx, P, w * LW, { seed });
export const fillP = (ctx, P, col) => { ctx.fillStyle = col; path(ctx, P); ctx.fill(); };
export const dot = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

export function groundShadow(ctx, x, y, w, lift = 0, a = 0.28) {
  ctx.save(); ctx.fillStyle = `rgba(35,50,30,${a * (1 - clamp(lift / 220, 0, 0.45))})`; ctx.beginPath();
  ctx.ellipse(x, y + 1, w * (1 - clamp(lift / 140, 0, 0.5)), w * 0.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// A cartoon eye in profile (or a front-facing eye). state: 'open' | 'wide' | 'half' | 'closed' | 'happy' | 'sad'.
// look: pupil offset (number = x, or [x, y]) in units. lid: 0..1 upper-lid closure (blink / sleepy).
// tilt: lid slant, +1 = front (snout-side) corner lower (angry), -1 = front corner higher (sad).
// opt.cheek 0..1: a smiling eye — the lower lid pushes up into a soft upward curve (the cheek rising), so a happy
// face reads warm instead of squinting from above; under a heavy lid (a tired or sleepy pose) the upper lid also
// arches up in the middle, so the eye becomes a fond ∩ crescent instead of a flat, weary half-moon.
// The lid's edge bows a little like the eyeball under it, and the catch-light stays in the open part of the eye
// (below the lid, above a smiling lower lid): a half-shut eye still shines.
export function eye(ctx, x, y, rx, ry, state = 'open', iris = '#2a1a14', look = 0, lid = 0, tilt = 0, opt = {}) {
  const lx = Array.isArray(look) ? look[0] : look, ly = Array.isArray(look) ? look[1] : 0, w = (opt.w ?? 1.1) * LW;
  if (state === 'half') lid = Math.max(lid, 0.55);
  if (state === 'happy' || state === 'laugh') {                 // ^  ^  closed, cheeks pushed up
    line(ctx, [[x - rx * 1.25, y + ry * 0.35], [x - rx * 0.4, y - ry * 0.45], [x + rx * 0.4, y - ry * 0.45], [x + rx * 1.25, y + ry * 0.35]], 1.15 * (opt.w ?? 1.1), { seed: 7, taper: true, color: opt.ink || INK });
    return;
  }
  if (state === 'closed' || lid >= 0.96) {                      // closed lid with a little lash curve
    const yl = y + ry * 0.25;
    line(ctx, [[x - rx * 1.2, yl - ry * 0.1 + tilt * ry * 0.2], [x, yl + ry * 0.45], [x + rx * 1.25, yl - ry * 0.15 - tilt * ry * 0.2]], 1.1 * (opt.w ?? 1.1), { seed: 8, taper: true, color: opt.ink || INK });
    return;
  }
  const wide = state === 'wide', k = wide ? 1.12 : 1, pr = opt.pupil ?? (wide ? 0.62 : 1);
  const top = y - ry * k * (wide ? 1.3 : 1), bot = y + ry * k * (wide ? 1.3 : 1), span = bot - top;
  // lid edge: a line across the eye at `lid` of its height, slanted by tilt
  const ex = rx * (wide ? 1.55 : 1.3);
  const yA = top + span * lid - tilt * span * 0.3 * Math.min(1, lid * 3), yB = top + span * lid + tilt * span * 0.3 * Math.min(1, lid * 3);
  const ch = clamp(opt.cheek || 0) * (1 - clamp((lid - 0.4) / 0.4)), cy = v => bot - span * ch * 0.4 * (1 - 0.5 * v * v);   // v -1..1 across
  const cheekLine = Array.from({ length: 9 }, (_, i) => { const v = -1 + i / 4; return [x + v * ex * 0.92, cy(v)]; });
  const ew = ex + 0.6, bow = span * (0.06 * (1 - lid) + 0.42 * clamp(opt.cheek || 0) * clamp(lid * 2));
  const lidY = v => lerp(yA, yB, (v + 1) / 2) - bow * (1 - v * v);                    // the lid's edge, v -1..1 across ±ew
  const lidAt = (v0, v1) => Array.from({ length: 9 }, (_, i) => { const v = lerp(v0, v1, i / 8); return [x + v * ew, lidY(v)]; });
  const lids = () => {
    if (lid > 0.02) { ctx.beginPath(); poly(ctx, [...lidAt(-1, 1), [x + ew, bot + 0.6], [x - ew, bot + 0.6]]); ctx.clip(); }
    if (ch > 0.02) { ctx.beginPath(); poly(ctx, [[x - ex - 0.6, top - span], [x + ex + 0.6, top - span], [x + ex + 0.6, cy(1)], ...cheekLine.slice().reverse(), [x - ex - 0.6, cy(-1)]]); ctx.clip(); }
  };
  ctx.save(); lids();
  if (wide || opt.sclera) {
    const sx = rx * (wide ? 1.55 : 1.3), sy = ry * (wide ? 1.32 : 1.12);
    ctx.fillStyle = opt.sclera || '#fbf8f0'; ctx.beginPath(); ctx.ellipse(x, y, sx, sy, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.save(); lids();
    ink(ctx, smoothPts(ctx, ellPts(x, y, sx, sy)), 0.75 * LW, { seed: 9 });
    ctx.beginPath(); ctx.ellipse(x, y, sx, sy, 0, 0, Math.PI * 2); ctx.clip();
  }
  const ir = rx * (wide || opt.sclera ? pr : 1), iry = ry * (wide || opt.sclera ? pr : 1) * k;
  ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(x + lx, y + ly, ir, iry, 0, 0, Math.PI * 2); ctx.fill();
  if (opt.pupilCol) { ctx.fillStyle = opt.pupilCol; ctx.beginPath(); ctx.ellipse(x + lx + ir * 0.08, y + ly, ir * 0.5, iry * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
  let hx = x + lx + ir * 0.35, hy = y + ly - iry * 0.42, hr = Math.max(0.1, ir * 0.36);
  if (lid > 0.02 || ch > 0.02) {                                // the catch-light stays in the open part of the eye
    const v = clamp((hx - x) / ew, -1, 1), hi = lid > 0.02 ? lidY(v) : -Infinity;
    const lo = Math.min(y + ly + iry, ch > 0.02 ? cy(clamp((hx - x) / (ex * 0.92), -1, 1)) : Infinity);
    hr = Math.min(hr, (lo - hi) / 2.8); hy = clamp(hy, hi + hr * 1.3, lo - hr * 1.3);
  }
  if (hr > 0.05) dot(ctx, hx, hy, hr, "#fff");
  if (ir > 1.6 && ch < 0.3) dot(ctx, x + lx - ir * 0.3, y + ly + iry * 0.4, ir * 0.13, 'rgba(255,255,255,.7)');
  ctx.restore();
  if (lid > 0.12) line(ctx, lidAt(-ex * 0.95 / ew, ex * 0.98 / ew), w, { seed: 10, taper: false, color: opt.ink || INK });
  if (ch > 0.02) line(ctx, cheekLine, w * 0.8, { seed: 12, taper: true, color: opt.ink || INK });
}
const ellPts = (cx, cy, rx, ry, n = 28) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 6.2832) * rx, cy + Math.sin((i / n) * 6.2832) * ry]);

// A short tapered brow stroke centred at (x, y), `w` long. raise: -1..1 (up), tilt: +1 = front end down (angry),
// -1 = front end up (sad/worried).
export function brow(ctx, x, y, w, raise = 0, tilt = 0, col = INK, wt = 1.2, seed = 11) {
  const yb = y - raise * w * 0.32;
  const P = [[x - w / 2, yb - tilt * w * 0.2 + Math.abs(tilt) * 0], [x - w * 0.05, yb - w * (0.16 - 0.1 * Math.abs(tilt))], [x + w / 2, yb + tilt * w * 0.26]];
  line(ctx, P, wt, { seed, taper: true, color: col });
}

// Blend helper for numeric pose-like objects.
export const lerpPt = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
