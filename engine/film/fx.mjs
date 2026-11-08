// World effects, drawn in world coordinates under the camera transform (ported from the legacy engine and
// extended). One-shot effects (dust, splash, sparkle) take an age in seconds; fields (fireflies, leaves, motes,
// mist) are deterministic particle tilings over the world, so they stay put when the camera moves.
// Rain is drawn in screen space. Everything is seeded: the same t gives the same pixels.
import { rng, blob, pick, canvas } from '../core/lib.mjs';
import { mistSprite } from '../paint/atmos.mjs';
import { clamp, lerp } from './util.mjs';

export const FX_DUR = { dust: 1.3, splash: 1.2, sparkle: 1.6, leaves: 6, fireflies: 8, motes: 8, rain: 8, mist: 8 };
export const ONE_SHOT = new Set(['dust', 'splash', 'sparkle']);
const FONT = 'Georgia, "Times New Roman", serif';
const TWOS = t => Math.floor(t * 12 + 1e-6) / 12;        // effects animate on twos, like the drawn animation

// A puff of dust kicked up at (x, y): dabs that grow, rise and fade. dir = direction of travel (puffs trail).
export function dust(ctx, age, x, y, s = 1, dir = 1, seed = 1, n = 9) {
  if (age < 0 || age > 1.3) return;
  ctx.save();
  for (let k = 0; k < n; k++) {
    const a = age - k * 0.03; if (a <= 0) continue;
    const r = rng(seed * 31 + k), px = x - dir * k * 7 * s + (r() - 0.5) * 18 * s, py = y - 3 * s - a * 26 * s - r() * 8 * s;
    ctx.globalAlpha = 0.55 * (1 - a / 1.3) ** 1.4; ctx.fillStyle = pick(r, ['#e8d9b2', '#dccb9f', '#f1e6c8', '#d6c49a']);
    const rad = (5 + 26 * a) * s * (0.7 + r() * 0.6);
    blob(ctx, px, py, rad, rad * 0.62, 0, r, 8);
  }
  ctx.restore();
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

// A ground shadow for something in the air: it shrinks and fades with height (alt, world px).
export function airShadow(ctx, x, y, w, alt, a = 0.26) {
  const k = clamp(1 - alt / 260);
  if (k <= 0.02) return;
  ctx.save(); ctx.fillStyle = `rgba(35,50,30,${(a * k).toFixed(3)})`; ctx.beginPath();
  ctx.ellipse(x, y + 1, w * lerp(0.45, 1, k), w * 0.18 * lerp(0.45, 1, k), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Draw one fx event at film time t. e: { name, t0, t1, x, y, s, dir, seed }. rect: visible world rect.
export function drawEvent(ctx, e, t, { rect, zoom, W, H, S }) {
  const age = t - e.t0;
  switch (e.name) {
    case 'dust': return dust(ctx, age, e.x, e.y, e.s, e.dir || 1, e.seed, e.n || 9);
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
