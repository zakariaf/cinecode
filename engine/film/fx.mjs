// World effects, drawn in world coordinates under the camera transform (ported from the legacy engine and
// extended). One-shot effects (dust, splash, sparkle) take an age in seconds; fields (fireflies, leaves, motes,
// mist) are deterministic particle tilings over the world, so they stay put when the camera moves.
// Rain is drawn in screen space. Everything is seeded: the same t gives the same pixels.
import { rng, blob, pick, canvas, arcPts, wobble, ink } from '../core/lib.mjs';
import { mistSprite } from '../paint/atmos.mjs';
import { clamp, lerp } from './util.mjs';

export const FX_DUR = { dust: 1.3, splash: 1.2, sparkle: 1.6, leaves: 6, fireflies: 8, motes: 8, rain: 8, mist: 8 };
export const ONE_SHOT = new Set(['dust', 'splash', 'sparkle']);
const FONT = 'Georgia, "Times New Roman", serif';
const TWOS = t => Math.floor(t * 12 + 1e-6) / 12;        // effects animate on twos, like the drawn animation

const DUST = [224, 207, 166];                            // dust where no ground is known: a pale tan

// A puff of dust kicked up at (x, y): soft dabs that grow, rise and fade. dir = direction of travel (puffs trail).
// col: the ground it rises from, as dust ([r, g, b], from groundTone), so it takes the scene's light (on a moonlit
// path a dim grey-blue puff, never a pale glow); its dabs are soft-edged, so overlapping ones never show each other's
// outlines.
export function dust(ctx, age, x, y, s = 1, dir = 1, seed = 1, n = 9, col = DUST) {
  if (age < 0 || age > 1.3) return;
  ctx.save();
  for (let k = 0; k < n; k++) {
    const a = age - k * 0.03; if (a <= 0) continue;
    const r = rng(seed * 31 + k), px = x - dir * k * 7 * s + (r() - 0.5) * 18 * s, py = y - 3 * s - a * 26 * s - r() * 8 * s;
    const al = 0.5 * (1 - a / 1.3) ** 1.4, lift = 1 + 0.12 * r(), rad = (5 + 26 * a) * s * (0.7 + r() * 0.6);
    const c = col.map(v => Math.min(255, Math.round(v * lift))).join(',');
    ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.62);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, `rgba(${c},${al.toFixed(3)})`); g.addColorStop(0.5, `rgba(${c},${(al * 0.7).toFixed(3)})`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(-rad, -rad, 2 * rad, 2 * rad);
    ctx.restore();
  }
  ctx.restore();
}
// The colour of dust rising at world (x, y) of set S (s: its scale): the set's back alone (S.drawBack with opts, e.g.
// { t, haze, sky }, so its night passes and lamp pools are in it), painted in a row just under the contact, so no
// actor, shadow or prop standing there counts. Of that row, the ground of the contact's own surface (S.surfaceAt: the
// path, not the water or grass beside it), and of that the pixels between the middle and the 80th percentile of
// lightness (the dry top, not the cracks, reeds or painted shade in it, nor a stray pale pebble), averaged and turned
// a little greyer and lighter. It paints the set's back (and so sets the light the set keeps for the sky it is given):
// call it before a frame draws its own. [r, g, b]; a pale tan where the set paints nothing there.
export function groundTone(S, x, y, s = 1, opts = {}) {
  const w = 96, q = w / (80 * s), h = Math.ceil(6 * s * q), [, cx] = canvas(w, h), X0 = x - 40 * s, Y0 = y + 2 * s;
  cx.setTransform(q, 0, 0, q, -X0 * q, -Y0 * q);
  S.drawBack(cx, { cx: x, cy: y, zoom: q }, opts);
  const d = cx.getImageData(0, 0, w, h).data, surf = S.surfaceAt?.(x, y), all = [], own = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o = (j * w + i) * 4; if (d[o + 3] <= 128) continue;
    const p = [d[o], d[o + 1], d[o + 2], 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]];
    all.push(p); if (surf && S.surfaceAt(X0 + (i + 0.5) / q, Y0 + (j + 0.5) / q) === surf) own.push(p);
  }
  const P = (own.length >= 20 ? own : all).sort((a, b) => a[3] - b[3]);
  if (P.length < 20) return DUST;
  const top = P.slice(P.length >> 1, Math.ceil(P.length * 0.8)), m = [0, 1, 2].map(k => top.reduce((a, p) => a + p[k], 0) / top.length);
  const L = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  return m.map(v => Math.min(255, (v + (L - v) * 0.35) * 1.15 + 6));
}

// Rings and droplets when something lands in water.
export function splash(ctx, age, x, y, s = 1, seed = 1) {
  if (age < 0 || age > 1.2) return;
  ctx.save(); ctx.lineWidth = 2.2 * s;
  for (let k = 0; k < 3; k++) {
    const a2 = age - k * 0.18; if (a2 <= 0) continue;
    const rx = (10 + 60 * a2) * s;
    ctx.strokeStyle = `rgba(235,248,250,${(0.85 * (1 - age / 1.2)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(235,248,252,.92)';
  for (let i = 0; i < 16; i++) {
    const r = rng(seed * 97 + i), vx = (r() - 0.5) * 140 * s, vy = -(80 + r() * 140) * s;
    const px = x + vx * age, py = y + vy * age + 380 * s * age * age;
    if (py > y + 2) continue;
    ctx.globalAlpha = 1 - age / 1.2; ctx.beginPath(); ctx.arc(px, py, (1.6 + r() * 1.6) * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function star(ctx, x, y, R, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = rot + (i * Math.PI) / 4, rr = i % 2 ? R * 0.28 : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
// Twinkling four-point glints rising around a point (magic, delight).
export function sparkle(ctx, age, x, y, s = 1, seed = 1, color = '255,236,170') {
  if (age < 0 || age > 1.6) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const r = rng(seed * 53 + i), t0 = r() * 0.6, a = age - t0; if (a < 0 || a > 1) continue;
    const ang = r() * Math.PI * 2, d = (20 + r() * 70) * s;
    const px = x + Math.cos(ang) * d * (0.4 + a), py = y - 40 * s + Math.sin(ang) * d * 0.7 * (0.4 + a) - a * 30 * s;
    const R = (5 + r() * 9) * s * Math.sin(Math.PI * a);
    const g = ctx.createRadialGradient(px, py, 0, px, py, R * 2.4); g.addColorStop(0, `rgba(${color},${0.55 * Math.sin(Math.PI * a)})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(px - R * 2.4, py - R * 2.4, R * 4.8, R * 4.8);
    ctx.fillStyle = `rgba(255,252,236,${(0.95 * Math.sin(Math.PI * a)).toFixed(3)})`; star(ctx, px, py, R, a * 2 + r() * 3);
  }
  ctx.restore();
}

// Sleep: three soft z's drifting up from a head.
export function zzz(ctx, head, t, s = 1) {
  ctx.save(); ctx.font = `italic bold ${Math.max(6, Math.round(26 * s))}px ${FONT}`; ctx.lineWidth = 3 * s; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(60,50,80,.75)'; ctx.fillStyle = '#fbf6ea';
  for (let k = 0; k < 3; k++) {
    const ph = (TWOS(t) * 0.45 + k / 3) % 1, sc = 0.55 + ph * 0.9;
    ctx.globalAlpha = Math.sin(Math.PI * ph) * 0.95;
    ctx.save(); ctx.translate(head[0] + (12 + ph * 46) * s + Math.sin(ph * 6) * 4 * s, head[1] - (20 + ph * 74) * s); ctx.scale(sc, sc);
    ctx.strokeText('z', 0, 0); ctx.fillText('z', 0, 0); ctx.restore();
  }
  ctx.restore();
}

// Deterministic particle tiling: calls fn(r, cellX, cellY) for every cell of size C that meets the rect.
function cells(rect, C, seed, fn) {
  const [x0, y0, x1, y1] = rect;
  for (let j = Math.floor(y0 / C) - 1; j <= Math.floor(y1 / C) + 1; j++)
    for (let i = Math.floor(x0 / C) - 1; i <= Math.floor(x1 / C) + 1; i++) fn(rng(((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) >>> 0), i * C, j * C);
}

// Fireflies: soft green-gold glows that wander and pulse. rect = visible world rect; yMin keeps them near the ground.
export function fireflies(ctx, t, rect, { seed = 3, a = 1, zoom = 1, yMin = -Infinity, yMax = Infinity, density = 1 } = {}) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const k = 1 / Math.sqrt(Math.max(0.5, zoom));
  cells(rect, 420, seed, (r, cx, cy) => {
    const n = Math.round((3 + r() * 3) * density);
    for (let i = 0; i < n; i++) {
      const ph = r() * 6, sp = 0.6 + r() * 0.8, bx = cx + r() * 420, by = cy + r() * 420;
      if (by < yMin || by > yMax) { r(); continue; }
      const x = bx + Math.sin(t * 0.37 * sp + ph) * 36 + Math.sin(t * 1.1 + ph * 2) * 8, y = by + Math.cos(t * 0.29 * sp + ph) * 22;
      const g = a * Math.max(0, Math.sin(t * (0.9 + r() * 0.8) + ph)) ** 2; if (g < 0.03) continue;
      const R = 24 * k;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(250,255,200,${g.toFixed(3)})`); gr.addColorStop(0.12, `rgba(225,255,140,${(g * 0.75).toFixed(3)})`); gr.addColorStop(0.4, `rgba(200,255,110,${(g * 0.22).toFixed(3)})`); gr.addColorStop(1, 'rgba(180,255,100,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
  });
  ctx.restore();
}

// Falling leaves, tumbling on twos.
export function leaves(ctx, t, rect, { seed = 5, cols = ['#9aa64f', '#c2b45a', '#7f9446', '#d0a85a', '#b8743a'], density = 1, zoom = 1 } = {}) {
  const tq = TWOS(t), C = 520, k = 1 / Math.sqrt(Math.max(0.5, zoom)) * 1.2;
  cells(rect, C, seed, (r, cx, cy) => {
    const n = Math.round((1 + r() * 1.6) * density);
    for (let i = 0; i < n; i++) {
      const life = 7 + r() * 4, ph = r() * 6, x0 = cx + r() * C, sz = (5 + r() * 6) * k, col = pick(r, cols), off = r() * life;
      const age = (tq + off) % life, y = cy + (age / life) * C * 1.6 - C * 0.3;
      const x = x0 - 22 * age + 30 * Math.sin(age * 1.3 + ph);
      const flip = Math.cos(age * 2.6 + ph), rt = Math.sin(age * 1.7 + ph) * 1.3;
      ctx.save(); ctx.globalAlpha = clamp(Math.min(age, life - age)); ctx.translate(x, y); ctx.rotate(rt); ctx.scale(sz * (Math.abs(flip) * 0.8 + 0.2) * Math.sign(flip || 1), sz);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(0, -0.45, 1, 0); ctx.quadraticCurveTo(0, 0.45, -1, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,30,.5)'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(0.9, 0); ctx.stroke();
      ctx.restore();
    }
  });
}

// Dust motes drifting in sunlight.
export function motes(ctx, t, rect, { seed = 11, a = 0.6, zoom = 1, density = 1 } = {}) {
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#fff1cc';
  const k = 1 / Math.sqrt(Math.max(0.5, zoom));
  cells(rect, 300, seed, (r, cx, cy) => {
    const n = Math.round((3 + r() * 3) * density);
    for (let i = 0; i < n; i++) {
      const sp = 0.3 + r() * 0.7, ph = r() * 6, bx = cx + r() * 300, by = cy + r() * 300, rad = (0.8 + r() * 1.8) * k * 1.4;
      ctx.globalAlpha = a * (0.4 + 0.6 * Math.sin(t * 2 * sp + ph)) ** 2;
      ctx.beginPath(); ctx.arc(bx + Math.sin(t * sp + ph) * 14, by + Math.cos(t * sp * 0.8 + ph) * 10 - ((t * 6 * sp) % 40), rad, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.restore();
}

// Low drifting mist over the ground band.
let MIST = null;
export function mist(ctx, t, rect, { y = 0, a = 0.5 } = {}) {
  if (!MIST) MIST = mistSprite(2400, 420, 46, '250,246,236', 0.2, 41);
  const w = MIST.width, x0 = rect[0] - ((t * 9) % w) - w * 0.2;
  ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'screen';
  for (let x = x0; x < rect[2] + w; x += w) ctx.drawImage(MIST, x, y - MIST.height * 0.55);
  ctx.restore();
}

// Rain in screen space: two layers of slanted streaks plus a cool wash.
export function rain(ctx, t, W, H, { a = 1, seed = 9 } = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(200,210,228,${(0.5 * a).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
  const u = Math.min(W, H) / 1080, f = Math.floor(t * 24 + 1e-6);
  for (const [n, len, wdt, al, sp] of [[220, 26, 1.1, 0.28, 1500], [90, 46, 1.8, 0.4, 2100]]) {
    const r = rng(seed + n);
    ctx.strokeStyle = `rgba(230,238,250,${(al * a).toFixed(3)})`; ctx.lineWidth = wdt * u;
    ctx.beginPath();
    for (let i = 0; i < n * (W * H) / (1920 * 1080); i++) {
      const x0 = r() * W * 1.2, y0 = r() * H, v = sp * (0.85 + r() * 0.3) * u;
      const y = (y0 + (f / 24) * v) % (H + len * u * 2) - len * u, x = (x0 - (y + len * u) * 0.18) % (W * 1.2);
      ctx.moveTo(x, y); ctx.lineTo(x - len * u * 0.18, y + len * u);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Where a wading body breaks the water (screen space): a dark meniscus hugging the body, a broken pale highlight
// drawn as tapered brush strokes, two rings spreading and fading (on twos), and foam dabs at the sides.
// half: 'back' (drawn before the body) or 'front' (after it). The caller clips to the water.
export function ripple(ctx, { x, y, rx, a = 1, seed = 1, half = 'front', t = 0, s = 1 }) {
  const front = half === 'front', tq = TWOS(t), lw = Math.max(1.2, 1.7 * s), r = rng(seed * 131 + 7);
  const arc = (R, u0, u1, k) => wobble(arcPts(x, y, R, R * 0.26, Math.PI * u0, Math.PI * u1, 4), seed * 7 + k, Math.min(2.5, lw * 0.5), false);
  // pieces of an arc with seeded gaps; front arc angles 0..1 (× π), back 1..2
  const pieces = (u0, u1, n, k) => { const out = [], step = (u1 - u0) / n; for (let i = 0; i < n; i++) { const a0 = u0 + step * (i + 0.06 + r() * 0.12), a1 = u0 + step * (i + 0.82 + r() * 0.12); out.push([a0, a1, k + i]); } return out; };
  ctx.save();
  if (front) {
    // the meniscus: water darkened right against the body
    for (const [u0, u1, k] of pieces(0.02, 0.98, 2, 1)) ink(ctx, arc(rx * 0.97, u0, u1, k).map(([px, py]) => [px, py + lw * 0.5]), lw * 1.5, { closed: false, color: `rgba(32,58,74,${(0.42 * a).toFixed(3)})`, seed: seed + k });
    for (const [u0, u1, k] of pieces(0.04, 0.96, 3, 5)) ink(ctx, arc(rx, u0, u1, k), lw * 1.3, { closed: false, color: `rgba(240,250,252,${(0.85 * a).toFixed(3)})`, seed: seed + k });
  } else for (const [u0, u1, k] of pieces(1.08, 1.92, 2, 9)) ink(ctx, arc(rx * 0.98, u0, u1, k), lw * 0.9, { closed: false, color: `rgba(236,248,250,${(0.6 * a).toFixed(3)})`, seed: seed + k });
  // rings spreading out
  for (let k = 0; k < 2; k++) {
    const ph = (tq * 0.55 + k / 2 + (seed % 97) / 97) % 1, R = rx * (1.1 + 0.8 * ph), al = 0.5 * a * (1 - ph) ** 1.5;
    if (al < 0.02) continue;
    for (const [u0, u1, j] of pieces(front ? 0.08 : 1.12, front ? 0.92 : 1.88, 2, 20 + k * 4)) ink(ctx, arc(R, u0, u1, j), lw * (1.1 - 0.5 * ph), { closed: false, color: `rgba(232,246,250,${al.toFixed(3)})`, seed: seed + j });
  }
  if (front) {
    const q = rng(seed * 31 + Math.floor(tq * 6));
    ctx.fillStyle = `rgba(244,251,252,${(0.75 * a).toFixed(3)})`;
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) blob(ctx, x + side * rx * (0.9 + q() * 0.18), y + (q() - 0.4) * rx * 0.08, (1.1 + q() * 1.5) * lw, (0.7 + q() * 0.8) * lw, 0, q, 6);
  }
  ctx.restore();
}

// A ground shadow for something in the air: it shrinks and fades with height (alt, world px).
export function airShadow(ctx, x, y, w, alt, a = 0.26) {
  const k = clamp(1 - alt / 260);
  if (k <= 0.02) return;
  ctx.save(); ctx.fillStyle = `rgba(35,50,30,${(a * k).toFixed(3)})`; ctx.beginPath();
  ctx.ellipse(x, y + 1, w * lerp(0.45, 1, k), w * 0.18 * lerp(0.45, 1, k), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Draw one fx event at film time t. e: { name, t0, t1, x, y, s, dir, seed }. rect: visible world rect. tone: a dust
// event's colour (groundTone).
export function drawEvent(ctx, e, t, { rect, zoom, W, H, S, tone }) {
  const age = t - e.t0;
  switch (e.name) {
    case 'dust': return dust(ctx, age, e.x, e.y, e.s, e.dir || 1, e.seed, e.n || 9, tone);
    case 'splash': return splash(ctx, age, e.x, e.y, e.s, e.seed);
    case 'sparkle': return sparkle(ctx, age, e.x, e.y, e.s, e.seed, e.color);
    default: break;
  }
  const fade = clamp(Math.min((t - e.t0) / 1.2, (e.t1 - t) / 1.2));
  if (fade <= 0) return;
  if (e.name === 'fireflies') fireflies(ctx, t, rect, { seed: e.seed, a: fade, zoom, yMin: (S?.horizon ?? -Infinity) - 220, density: e.density || 1 });
  else if (e.name === 'leaves') { ctx.save(); ctx.globalAlpha = fade; leaves(ctx, t, rect, { seed: e.seed, zoom, density: e.density || 1 }); ctx.restore(); }
  else if (e.name === 'motes') motes(ctx, t, rect, { seed: e.seed, a: 0.6 * fade, zoom, density: e.density || 1 });
  else if (e.name === 'mist') mist(ctx, t, rect, { y: e.y ?? (S ? S.laneY - 60 : rect[3] - 200), a: 0.55 * fade });
  else if (e.name === 'rain') return 'screen';
}
export { canvas };
