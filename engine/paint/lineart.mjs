// Line art (a film's format.style "lineart"): a colouring-book page, black ink on white paper, no fill and no shade.
// lineart(canvas, { res, colour }) turns one painted piece (a set layer, a prop sprite, one actor's drawing) into white
// where it is painted, with black lines; its alpha is kept, so a piece still hides what lies behind it (a figure's white
// hides the lines of the set behind it, as on the page). The lines are of two kinds:
// - ink: what the painting already inked (outlines, eyes, brows, folds): pixels darker than what is round them, kept
//   with their own weight and taper;
// - edges: where a shape meets another or the paper without ink (a hill against the sky, a wall against a door): a
//   Canny edge (one pixel, at the edge's steepest point) thickened to a light line; none beside an ink line (the two
//   sides of an ink line are edges too, and would double it). colour false: only the piece's silhouette (its alpha),
//   for actors, whose rigs ink every shape and whose cel shading would otherwise come out as lines.
// Specks (a grass dab, a flower dot, grain) are dropped. Then the pen: every line, however the painting drew it (a
// tapered ink ribbon, a filled mark, an edge), is thinned to its centre and drawn again at one even width (PEN × res),
// so the page holds lines, not paint: a face in a wide shot stays a face instead of a smudge. res: canvas pixels per world unit (or per screen pixel for an
// actor drawn in screen space), which scales every radius and threshold area. fill 'opaque': only the solidly painted
// part is white (effects: a painted patch hides what is under it, a wash or a glow leaves only its lines). Returns null
// when nothing is painted.
// mono(ctx, W, H): the frame's last pass: whatever an effect drew in colour (rain, dust, a glow) becomes black or white.
import { canvas } from '../core/lib.mjs';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// separable box blur of a Float32 plane, radius r (≥ 1), edges clamped
function box(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[row + x] = s / n; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
// Zhang–Suen thinning of a 0/1 mask, in place: what is left is each shape's one-pixel centre line.
function thin(S, w, h) {
  const del = new Int32Array(w * h);
  for (let changed = true; changed;) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      let n = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
        if (!S[i]) continue;
        const p2 = S[i - w], p3 = S[i - w + 1], p4 = S[i + 1], p5 = S[i + w + 1], p6 = S[i + w], p7 = S[i + w - 1], p8 = S[i - 1], p9 = S[i - w - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (a !== 1) continue;
        if (pass === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del[n++] = i;
      }
      for (let q = 0; q < n; q++) S[del[q]] = 0;
      if (n) changed = true;
    }
  }
}
export const PEN = 2.2;   // the pen's width at 1080p, screen px

const blur = (P, w, h, r) => (r < 1 ? P : box(box(P, w, h, r), w, h, r));   // (≈ a gaussian; box alone for small radii)

/** The line art of a painted canvas: a new canvas of the same size. */
export function lineart(src, { res = 1, colour = true, fill = true } = {}) {
  const w = src.width, h = src.height, N = w * h;
  if (!N) return null;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  // only the painted part (and a margin for the radii) is worked on: an effect often covers a corner of the frame
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0, j = 3; y < h; y++) for (let x = 0; x < w; x++, j += 4) if (d[j]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const m = Math.ceil(12 * res); x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) < 0.7 * N) {
    const [sub, sx] = canvas(x1 - x0 + 1, y1 - y0 + 1); sx.drawImage(src, -x0, -y0);
    const [out, ox] = canvas(w, h), la = lineart(sub, { res, colour, fill });
    if (la) ox.drawImage(la, x0, y0);
    return out;
  }
  const L = new Float32Array(N), A = new Float32Array(N), R = colour ? new Float32Array(N) : null, G = colour ? new Float32Array(N) : null, B = colour ? new Float32Array(N) : null;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const a = d[j + 3] / 255, r = d[j] * a + 255 * (1 - a), g = d[j + 1] * a + 255 * (1 - a), b = d[j + 2] * a + 255 * (1 - a);   // over white paper
    L[i] = 0.3 * r + 0.59 * g + 0.11 * b; A[i] = 255 * a;
    if (colour) { R[i] = r; G[i] = g; B[i] = b; }
  }
  const k = res, rr = n => Math.max(1, Math.round(n * k));

  // ink: darker than its surroundings, and dark
  const Ls = box(L, w, h, rr(0.6)), Lw = blur(L, w, h, rr(4));
  const V = new Float32Array(N);
  // (ink is near black: a dark coat, fur or grass blade is not; an actor's lighter linework, a face's or a hand's edge,
  // still counts)
  const [g0, g1] = colour ? [115, 70] : [160, 95];
  for (let i = 0; i < N; i++) V[i] = sstep(14, 40, Lw[i] - Ls[i]) * sstep(g0, g1, Ls[i]);

  // edges: Canny on the (slightly blurred) colour and alpha, or on the alpha alone
  const planes = (colour ? [R, G, B, A] : [A]).map(P => box(P, w, h, rr(1)));
  const M = new Float32Array(N), D = new Uint8Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; let best = 0, bx = 0, by = 0;
    for (const P of planes) {
      const gx = P[i - w + 1] + 2 * P[i + 1] + P[i + w + 1] - P[i - w - 1] - 2 * P[i - 1] - P[i + w - 1];
      const gy = P[i + w - 1] + 2 * P[i + w] + P[i + w + 1] - P[i - w - 1] - 2 * P[i - w] - P[i - w + 1];
      const m = gx * gx + gy * gy; if (m > best) { best = m; bx = gx; by = gy; }
    }
    M[i] = Math.sqrt(best) / 4;
    const ang = Math.atan2(by, bx), q = Math.round(((ang < 0 ? ang + Math.PI : ang) / Math.PI) * 4) % 4;   // 0: ─ gradient, 1: ╱, 2: │, 3: ╲
    D[i] = q;
  }
  const off = [[1, 0], [1, 1], [0, 1], [-1, 1]], lo = 12, hi = 30, E = new Uint8Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = M[i]; if (m < lo) continue;
    const [ox, oy] = off[D[i]], o = oy * w + ox;
    if (m >= M[i + o] && m > M[i - o]) E[i] = m >= hi ? 2 : 1;
  }
  // hysteresis: weak edges joined to a strong one stay
  const stack = new Int32Array(N); let sp = 0;
  for (let i = 0; i < N; i++) if (E[i] === 2) stack[sp++] = i;
  while (sp) {
    const i = stack[--sp], x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx; if (E[j] === 1) { E[j] = 2; stack[sp++] = j; }
    }
  }
  // no edge beside ink (an ink line's two sides): the ink, spread a little
  const inkNear = box(V.map(v => (v > 0.3 ? 1 : 0)), w, h, rr(1.6));
  const Ef = new Float32Array(N);
  for (let i = 0; i < N; i++) Ef[i] = E[i] === 2 && inkNear[i] < 0.02 ? 1 : 0;
  const Et = box(Ef, w, h, rr(0.6));
  for (let i = 0; i < N; i++) V[i] = Math.max(V[i], sstep(0.12, 0.42, Et[i]));

  // drop specks: connected line blobs smaller than minArea, or spanning less than minSpan (a grass blade, a dab); not
  // on an actor (colour false), whose small marks are its eyes, nostrils and buttons
  const minArea = 40 * k * k, minSpan = 18 * k, lab = new Uint8Array(N), comp = new Int32Array(N);
  if (colour) for (let s0 = 0; s0 < N; s0++) {
    if (V[s0] < 0.3 || lab[s0]) continue;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; sp = 0; stack[sp++] = s0; lab[s0] = 1;
    while (sp) {
      const i = stack[--sp]; comp[n++] = i;
      const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!lab[j] && V[j] >= 0.3) { lab[j] = 1; stack[sp++] = j; }
      }
    }
    if (n < minArea || Math.hypot(x1 - x0, y1 - y0) < minSpan) for (let q = 0; q < n; q++) V[comp[q]] = 0;
  }

  // the pen: the lines' centres (a tent across each, two box passes of radius rp, normalised so the centre is 1)
  const Sk = new Uint8Array(N); for (let i = 0; i < N; i++) Sk[i] = V[i] >= 0.4 ? 1 : 0;
  thin(Sk, w, h);
  const rp = Math.max(1, Math.round((PEN * k - 1) / 2)), T = blur(Float32Array.from(Sk), w, h, rp), nT = 2 * rp + 1;
  const [out, ox] = canvas(w, h), im = ox.createImageData(w, h), o = im.data;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const v = sstep(0.3, 0.9, T[i] * nT), c = Math.round(255 * (1 - v));
    o[j] = o[j + 1] = o[j + 2] = c; o[j + 3] = Math.max(Math.round(fill === 'opaque' ? A[i] * sstep(200, 250, A[i]) : A[i]), Math.round(255 * v));
  }
  ox.putImageData(im, 0, 0);
  return out;
}

/** A frame's last line-art pass: every pixel to black or white by its lightness (antialiased edges kept soft). */
export function mono(ctx, W, H) {
  const im = ctx.getImageData(0, 0, W, H), d = im.data;
  for (let j = 0; j < d.length; j += 4) {
    const c = Math.round(255 * sstep(70, 190, 0.3 * d[j] + 0.59 * d[j + 1] + 0.11 * d[j + 2]));
    d[j] = d[j + 1] = d[j + 2] = c;
  }
  ctx.putImageData(im, 0, 0);
}
