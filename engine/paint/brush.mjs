// The storybook finish shared by every painted prop: one hard lavender multiply shadow, inked silhouettes,
// soft contact shadows where things meet the ground.
import { canvas, noise1, path, INK } from '../core/lib.mjs';

export const SET_SHADE = '#9a8cc4';            // lavender, laid with multiply
export const SET_INK = INK;

const unit = ([a, b]) => { const d = Math.hypot(a, b) || 1; return [a / d, b / d]; };
const centroid = P => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
const size = P => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return Math.max(x1 - x0, y1 - y0); };

// One hard cel shadow on the side of polygon P away from the light. `bias` moves the terminator
// toward the light (+) or away from it (−), in fractions of the shape size.
export function celShade(x, P, { light = [-0.6, -0.75], amount = 0.55, bias = -0.05, seed = 1, col = SET_SHADE, wob = 0.04 } = {}) {
  const d = unit(light), c = centroid(P), R = size(P), T = [c[0] + d[0] * bias * R, c[1] + d[1] * bias * R];
  const t = [-d[1], d[0]], nz = noise1(seed + 9), L = [], n = 24, BIG = R * 3;
  for (let i = 0; i <= n; i++) {
    const u = (i / n - 0.5) * 2 * R, o = (nz(i * 0.7) - 0.5) * 2 * wob * R;
    L.push([T[0] + t[0] * u + d[0] * o, T[1] + t[1] * u + d[1] * o]);
  }
  const H = [...L, [L[n][0] - d[0] * BIG, L[n][1] - d[1] * BIG], [L[0][0] - d[0] * BIG, L[0][1] - d[1] * BIG]];
  x.save(); path(x, P); x.clip();
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = amount; x.fillStyle = col; path(x, H); x.fill();
  x.restore();
}

// Shade a whole painted sprite (e.g. a tree crown): everything outside the lit ellipse gets the shadow.
export function celShadeSprite(x, cx, cy, rx, ry, { light = [-0.6, -0.75], amount = 0.5, col = SET_SHADE, shift = 0.28, seed = 3 } = {}) {
  const c = x.canvas, [t, tx] = canvas(c.width, c.height), d = unit(light), m = x.getTransform();
  tx.setTransform(m);
  tx.fillStyle = col; tx.fillRect(cx - rx * 3, cy - ry * 3, rx * 6, ry * 6);
  tx.globalCompositeOperation = 'destination-out';
  const nz = noise1(seed), E = [];
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, k = 1 + (nz(i * 0.5) - 0.5) * 0.12; E.push([cx + d[0] * rx * shift + Math.cos(a) * rx * k, cy + d[1] * ry * shift + Math.sin(a) * ry * k]); }
  path(tx, E); tx.fill();
  tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(c, 0, 0);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'multiply'; x.globalAlpha = amount; x.drawImage(t, 0, 0); x.restore();
}

// Ink line round a sprite's silhouette: the alpha mask dilated, heavier on the side away from the light.
// `fade: [y0, y1]` (canvas px) fades the ink out downward: full above y0, none below y1 — so a prop standing
// in grass has no hard line where it meets the ground.
export function inkSilhouette(src, w = 2.4, { color = INK, light = [-0.6, -0.75], alpha = 1, heavy = 0.7, fade = null } = {}) {
  const [m, mx] = canvas(src.width, src.height);
  mx.drawImage(src, 0, 0); mx.globalCompositeOperation = 'source-in'; mx.fillStyle = color; mx.fillRect(0, 0, src.width, src.height);
  const [o, ox] = canvas(src.width, src.height), d = unit(light);
  ox.globalAlpha = alpha;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, k = 1 + heavy * Math.max(0, -(Math.cos(a) * d[0] + Math.sin(a) * d[1]));
    ox.drawImage(m, Math.cos(a) * w * k, Math.sin(a) * w * k);
  }
  ox.globalAlpha = 1;
  if (fade) {
    const g = ox.createLinearGradient(0, fade[0], 0, Math.max(fade[0] + 1, fade[1]));
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ox.globalCompositeOperation = 'destination-out'; ox.fillStyle = g; ox.fillRect(0, 0, src.width, src.height); ox.globalCompositeOperation = 'source-over';
  }
  ox.drawImage(src, 0, 0);
  return o;
}
// In place: outline everything already painted on context x.
export function inkAround(x, w, opts) {
  const c = x.canvas, o = inkSilhouette(c, w, opts);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.drawImage(o, 0, 0); x.restore();
}

// Soft occlusion where an object meets the ground.
export function contactShadow(x, cx, cy, rx, ry, a = 0.38, col = '40,48,52') {
  x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.6, `rgba(${col},${a * 0.55})`); g.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, Math.PI * 2); x.fill(); x.restore();
}

// Paint into a temporary canvas, keep it only where this context already has paint, then composite it.
export function paintInside(x, fn, { op = 'source-over', alpha = 1 } = {}) {
  const c = x.canvas, [t, tx] = canvas(c.width, c.height);
  tx.setTransform(x.getTransform()); fn(tx);
  tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(c, 0, 0);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = op; x.globalAlpha = alpha; x.drawImage(t, 0, 0); x.restore();
}
