// Paper, mist, light rays and haze: the atmosphere that sits on top of every painted layer.
import { rng, canvas } from '../core/lib.mjs';

// A full-size paper tone canvas (legacy helper; kept for callers that multiply it themselves).
export const paperTex = (() => { let c; return (w, h) => {
  if (c && c.width >= w && c.height >= h) return c;
  const [cv, x] = canvas(w, h), img = x.createImageData(w, h), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = 208 + r() * 47; img.data[i] = v; img.data[i + 1] = v - 3; img.data[i + 2] = v - 9; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0); return (c = cv);
}; })();

// Seamless 2-D value noise on an s×s lattice that wraps (u, v in lattice units).
export function latticeNoise(s, seed) {
  const r = rng(seed), G = Array.from({ length: s * s }, r), m = a => ((a % s) + s) % s;
  const g = (i, j) => G[m(j) * s + m(i)], sm = f => f * f * (3 - 2 * f);
  return (u, v) => {
    const i = Math.floor(u), j = Math.floor(v), fu = sm(u - i), fv = sm(v - j);
    const a = g(i, j) + (g(i + 1, j) - g(i, j)) * fu, b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * fu;
    return a + (b - a) * fv;
  };
}

// A tileable paper grain: fine fibres plus soft gouache blotches, stored as dark pigment with alpha so it
// can be laid over a layer with `source-atop` (it only touches paint, never the transparent sky gaps).
const GRAIN = (() => { let c; return () => {
  if (c) return c;
  const N = 512, [cv, x] = canvas(N, N), img = x.createImageData(N, N), r = rng(77);
  const b8 = latticeNoise(8, 301), b20 = latticeNoise(20, 302);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const i = (py * N + px) * 4, u = px / N, v = py / N;
    const a = 0.34 * r() + 0.4 * b8(u * 8, v * 8) + 0.26 * b20(u * 20, v * 20);
    img.data[i] = 74; img.data[i + 1] = 60; img.data[i + 2] = 52; img.data[i + 3] = Math.round(255 * a * a * 0.9);
  }
  x.putImageData(img, 0, 0);
  // a few paper fibres, wrapped so the tile stays seamless
  x.strokeStyle = 'rgba(74,60,52,.35)'; x.lineWidth = 0.7;
  for (let i = 0; i < 90; i++) {
    const px = r() * N, py = r() * N, a = r() * Math.PI, L = 6 + r() * 16;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + Math.cos(a) * L * 0.5 + 2, py + oy + Math.sin(a) * L * 0.5, px + ox + Math.cos(a) * L, py + oy + Math.sin(a) * L); x.stroke(); }
  }
  return (c = cv);
}; })();

// Lay paper grain over whatever is painted on this context (transparent pixels stay transparent).
export function paper(x, a = 0.08) {
  const c = x.canvas;
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = Math.min(1, a * 2.2);
  x.fillStyle = x.createPattern(GRAIN(), 'repeat'); x.fillRect(0, 0, c.width, c.height);
  x.restore();
}

export function mistSprite(w, h, n, col = '252,244,226', a = 0.15, seed = 41) {
  const [c, x] = canvas(w, h), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = r() * w, py = h / 2 + (r() - 0.5) * h * 0.25, rad = 80 + r() * 220;
    x.save(); x.translate(px, py); x.scale(1, 0.3 + r() * 0.2);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(-rad, -rad, rad * 2, rad * 2); x.restore();
  }
  return c;
}

export function raysSprite(w, h, O, rays, col = '255,240,200') {
  const [tmp, t] = canvas(w, h), [c, x] = canvas(w, h);
  for (const [a, wa, al] of rays) {
    const L = Math.hypot(w, h) * 1.2, g = t.createLinearGradient(O[0], O[1], O[0] + Math.cos(a) * L, O[1] + Math.sin(a) * L);
    g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(0.65, `rgba(${col},${al * 0.45})`); g.addColorStop(1, `rgba(${col},0)`);
    t.fillStyle = g; t.beginPath(); t.moveTo(...O); t.lineTo(O[0] + Math.cos(a - wa) * L, O[1] + Math.sin(a - wa) * L); t.lineTo(O[0] + Math.cos(a + wa) * L, O[1] + Math.sin(a + wa) * L); t.fill();
  }
  x.filter = 'blur(16px)'; x.drawImage(tmp, 0, 0); return c;
}

// A soft horizontal band of haze (aerial perspective) between y0 and y1 that fades in toward y1.
export function hazeBand(x, x0, x1, y0, y1, col = '236,240,225', a = 0.4, up = false) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${col},${up ? a : 0})`); g.addColorStop(1, `rgba(${col},${up ? 0 : a})`);
  x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
}

// Tint everything already painted on a layer toward a colour (keeps alpha): distance haze.
export function hazeLayer(x, col, a) {
  if (a <= 0) return;
  const c = x.canvas; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop';
  x.fillStyle = `rgba(${col},${a})`; x.fillRect(0, 0, c.width, c.height); x.restore();
}
