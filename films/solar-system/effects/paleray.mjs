// The Pale Blue Dot (shot 11.5): Earth as one pale blue point inside a faint ray of scattered sunlight, as Voyager 1
// saw it in 1990 ("shows Earth within a scattered ray of sunlight"). A faint, broad band of light leaves the far Sun at
// the left and crosses the black to the right edge: soft edges, a few faint parallel streaks inside it, the faintest
// warm-tan and blue tints (scattered light in a camera). It is about as wide all the way (never a beam or a cone); only
// where it comes out of the Sun does it narrow to the Sun's point. It fades in over the first `fadeIn` of the beat; at
// `dotAt` one steady pale blue point appears in it: a tiny core with a small soft halo, no twinkle.
//
// A custom beat. To keep it in the fading picture of a dissolve into the next scene, give it "scope": "scene" and a
// dur past the cut by the dissolve: { "do": "custom", "name": "paleray", "at": 0, "dur": <shot + 1>, "hold": false,
// "scope": "scene" }. Pair it with a sunglow at `from` (Part 11: x 0.045, y 0.4, r 0.003) as a scene overlay with
// "shots": [the shot], which also carries into the dissolve.
// Params: from ([fx, fy], fractions of the frame: the Sun, default [0.045, 0.4]), to (where the band goes: an angle in
// degrees, 0 = straight right, + = down, or a point [fx, fy] its middle passes through, e.g. an edge point; default
// through the dot), w (the band's width, a fraction of the frame height, default 0.15), a (its peak opacity, default
// 0.17: faint; it tops out at 0.5), streaks (how many faint streaks in it, default 7), dot ([fx, fy], default [0.62, 0.55]), dotAt (when the
// dot appears, 0..1 of the beat, default 0.25), dotCol (default '#bcd8ff'), dotSize (the dot's core radius in px at
// 1080p, as skydot's size, default 2), fadeIn (0..1 of the beat, default 0.2). dotAt and fadeIn are fractions of the
// whole dur, the part past the cut included.
// Layer `grade`: emitted light, after the grade. Deterministic: its streaks come from api.seed.
import { canvas, rng, clamp, smooth, easeInOut } from 'cinecode/lib';

const TAU = Math.PI * 2;
const TAN = '226,196,152', WARM = '236,222,198', BLUE = '160,190,238';
// across the band, top to bottom: tan, a warm white in the middle, blue (the colours of light scattered in a lens)
const tint = t => {
  const [a, b, k] = t < 0.5 ? [TAN, WARM, t / 0.5] : [WARM, BLUE, (t - 0.5) / 0.5], A = a.split(',').map(Number), B = b.split(',').map(Number);
  const e = k * k * (3 - 2 * k);
  return A.map((v, i) => Math.round(v + (B[i] - v) * e)).join(',');
};
const rgbOf = c => {
  if (typeof c !== 'string') return '188,216,255';
  if (c[0] !== '#') return c;
  const h = c.length === 4 ? c.slice(1).replace(/./g, x => x + x) : c.slice(1, 7), n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

function band(ctx, u, api) {
  const p = api.params || {}, W = api.W, H = api.H, k = H / 1080;
  const f = p.from || [0.045, 0.4], d = p.dot || [0.62, 0.55], A = [f[0] * W, f[1] * H], D = [d[0] * W, d[1] * H];
  const T = Array.isArray(p.to) ? [p.to[0] * W, p.to[1] * H] : D;
  const ang = typeof p.to === 'number' ? (p.to * Math.PI) / 180 : Math.atan2(T[1] - A[1], T[0] - A[0]);
  const ux = Math.cos(ang), uy = Math.sin(ang), hw = ((p.w ?? 0.15) * H) / 2, E = 1.5 * hw;
  // where the band's middle leaves the frame (the along fade is measured on it)
  const exit = [ux > 1e-6 ? (W - A[0]) / ux : Infinity, ux < -1e-6 ? -A[0] / ux : Infinity, uy > 1e-6 ? (H - A[1]) / uy : Infinity, uy < -1e-6 ? -A[1] / uy : Infinity];
  const Lv = Math.max(0.25 * W, Math.min(...exit)), L = Lv + 2 * E;
  // every random number first: the streaks
  const r = rng((api.seed ?? 1) * 7919 + 13), n = Math.max(0, Math.round(p.streaks ?? 7)), streaks = [];
  for (let i = 0; i < n; i++) {
    const wide = i % 3 === 0;
    streaks.push({
      y: (r() * 2 - 1) * (wide ? 0.45 : 0.6) * hw,
      h: wide ? (0.12 + r() * 0.12) * hw : (2 + r() * 3) * k,
      b: wide ? 0.08 + r() * 0.08 : 0.1 + r() * 0.12,
      s0: (0.05 + r() * 0.3) * Lv, s1: (0.75 + r() * 0.5) * Lv,
      col: [TAN, WARM, BLUE][Math.floor(r() * 3)],
      wav: [r(), r(), r(), r()],
    });
  }
  // the offscreen: the band's box on the frame, at the canvas's own resolution
  const m = ctx.getTransform(), sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const at = (s, o) => [A[0] + ux * s - uy * o, A[1] + uy * s + ux * o], box = [at(0, E), at(0, -E), at(L, E), at(L, -E)];
  const x0 = Math.max(0, Math.floor(Math.min(...box.map(v => v[0])))), y0 = Math.max(0, Math.floor(Math.min(...box.map(v => v[1]))));
  const x1 = Math.min(W, Math.ceil(Math.max(...box.map(v => v[0])))), y1 = Math.min(H, Math.ceil(Math.max(...box.map(v => v[1]))));
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  const [o, x] = canvas(Math.ceil((x1 - x0) * sc), Math.ceil((y1 - y0) * sc));
  x.scale(sc, sc); x.translate(-x0, -y0); x.translate(A[0], A[1]); x.rotate(ang);
  // across: soft, brightest along its middle, warm tan on the upper side, a breath of blue on the lower
  const cg = x.createLinearGradient(0, -E, 0, E);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, q = Math.abs(t * 2 - 1) * 1.5, v = Math.exp(-Math.pow(q / 0.72, 2));
    cg.addColorStop(t, `rgba(${tint(t)},${(0.5 * v).toFixed(3)})`);   // half: the streaks add on top, never clipping
  }
  x.fillStyle = cg; x.fillRect(0, -E, L, 2 * E);
  // the streaks: faint lines and softer sub-bands along it, each soft across (a gaussian) and fading in and out along
  // its length at its own places; each is painted on a strip of its own, then laid along the band
  x.globalCompositeOperation = 'lighter';
  for (const s of streaks) {
    const len = s.s1 - s.s0, [c, y] = canvas(Math.ceil(len * sc), Math.max(2, Math.ceil(4 * s.h * sc)));
    y.scale(sc, sc);
    const cg = y.createLinearGradient(0, 0, 0, 4 * s.h);
    for (let i = 0; i <= 12; i++) { const q = (i / 12) * 4 - 2; cg.addColorStop(i / 12, `rgba(${s.col},${(s.b * Math.exp(-q * q * 1.6)).toFixed(3)})`); }
    y.fillStyle = cg; y.fillRect(0, 0, len, 4 * s.h);
    const lg = y.createLinearGradient(0, 0, len, 0);
    for (const [t, v] of [[0, 0], [0.12, 1], [0.3, 0.55 + 0.45 * s.wav[0]], [0.5, 0.55 + 0.45 * s.wav[1]], [0.7, 0.55 + 0.45 * s.wav[2]], [0.88, 0.7 + 0.3 * s.wav[3]], [1, 0]]) lg.addColorStop(t, `rgba(0,0,0,${v.toFixed(3)})`);
    y.globalCompositeOperation = 'destination-in'; y.fillStyle = lg; y.fillRect(0, 0, len, 4 * s.h);
    x.drawImage(c, s.s0, s.y - 2 * s.h, len, 4 * s.h);
  }
  // along: dimmer at the Sun, full a little way out, a slow fall toward the right edge
  x.globalCompositeOperation = 'destination-in';
  const lg = x.createLinearGradient(0, 0, L, 0), ramp = 0.12 * Lv;
  for (let i = 0; i <= 24; i++) { const s = (L * i) / 24; lg.addColorStop(i / 24, `rgba(0,0,0,${((0.45 + 0.55 * smooth(0, ramp, s)) * (1 - 0.4 * clamp(s / Lv))).toFixed(3)})`); }
  x.fillStyle = lg; x.fillRect(0, -E, L, 2 * E);
  // out of the Sun: a narrow neck at the Sun's point that opens to the full band within a seventh of the way (a soft
  // wedge about an apex just behind the Sun; past that it is wider than the band and leaves it alone)
  const st = 0.14 * Lv, h0 = 0.06 * hw, back = (st * h0) / (E - h0), th1 = Math.atan2(E, st + back), th0 = th1 * 1.8;
  const kg = x.createConicGradient(0, -back, 0);
  for (const [a, v] of [[0, 1], [th1, 1], [(th1 + th0) / 2, 0.3], [th0, 0]]) {
    const s = a / TAU; kg.addColorStop(s, `rgba(0,0,0,${v})`); if (s > 0) kg.addColorStop(1 - s, `rgba(0,0,0,${v})`);
  }
  kg.addColorStop(0.5, 'rgba(0,0,0,0)'); kg.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = kg; x.fillRect(0, -E, L, 2 * E);
  // laid on as light
  const fade = Math.sin((Math.PI / 2) * clamp(u / Math.max(1e-6, p.fadeIn ?? 0.2)));   // eased out: light coming on
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(2 * (p.a ?? 0.17) * fade);
  ctx.drawImage(o, x0, y0, x1 - x0, y1 - y0);
}

function dot(ctx, u, api) {
  const p = api.params || {}, W = api.W, H = api.H, k = H / 1080, dur = api.dur || 10;
  const at = p.dotAt ?? 0.25, dk = easeInOut(clamp(((u - at) * dur) / 0.5));
  if (dk <= 0) return;
  const d = p.dot || [0.62, 0.55], sx = d[0] * W, sy = d[1] * H, r = (p.dotSize ?? 2) * k, col = rgbOf(p.dotCol || '#bcd8ff');
  // a tiny soft halo, in the dot's own blue (brighter than a star's, so it is the point the eye finds in the ray)
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
  const R = r * 7, g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
  g.addColorStop(0, `rgba(${col},${(0.8 * dk).toFixed(3)})`); g.addColorStop(0.2, `rgba(${col},${(0.32 * dk).toFixed(3)})`);
  g.addColorStop(0.5, `rgba(${col},${(0.07 * dk).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.fillRect(sx - R, sy - R, 2 * R, 2 * R);
  // the steady core: the dot's colour, lighter at its middle (a point of light, not a painted disc)
  const c = ctx.createRadialGradient(sx, sy, 0, sx, sy, r), lit = col.split(',').map(v => Math.round(+v + (255 - v) * 0.6)).join(',');
  c.addColorStop(0, `rgb(${lit})`); c.addColorStop(0.45, `rgb(${lit})`); c.addColorStop(1, `rgb(${col})`);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = dk; ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
}

export const custom = {
  paleray: {
    layer: 'grade',
    draw(ctx, u, api) {
      ctx.save(); band(ctx, u, api); ctx.restore();
      ctx.save(); dot(ctx, u, api); ctx.restore();
    },
  },
};
