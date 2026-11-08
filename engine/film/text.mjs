// Words on screen: burned-in captions (wrapped, kept inside safe margins, moved to the top when they would
// cover a speaker's head), in-picture titles, and the parchment opening and end cards.
import { createCanvas } from '@napi-rs/canvas';
import { rng, ink, wobble, canvas } from '../core/lib.mjs';
import { paper } from '../paint/atmos.mjs';
import { clamp, ease } from './util.mjs';

export const SERIF = '"Hoefler Text", Georgia, "Times New Roman", serif';
const CAP_FONT = 'Georgia, "Times New Roman", serif';
const U = (W, H) => Math.min(W, H) / 1080;

export function captionStyle(style, W, H) {
  const u = U(W, H);
  if (style === 'narration') return { size: Math.round(42 * u), font: `italic ${Math.round(42 * u)}px ${CAP_FONT}`, color: '#f8ead0', band: 0.34 };
  if (style === 'sound') return { size: Math.round(34 * u), font: `italic ${Math.round(34 * u)}px ${CAP_FONT}`, color: '#efe6d6', band: 0 };
  return { size: Math.round(44 * u), font: `${Math.round(44 * u)}px ${CAP_FONT}`, color: '#fffaf0', band: 0 };
}
const maxWidth = (W, H) => Math.min(W * 0.84, 1500 * U(W, H));

let MEASURE = null;
const measurer = () => (MEASURE ||= createCanvas(8, 8).getContext('2d'));
export function wrapText(ctx, text, maxW) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  // balance a two-line caption so the lines are about the same length
  if (lines.length === 2) {
    const all = `${lines[0]} ${lines[1]}`.split(' ');
    let best = null;
    for (let i = 1; i < all.length; i++) {
      const a = all.slice(0, i).join(' '), b = all.slice(i).join(' '), wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
      if (wa > maxW || wb > maxW) continue;
      const score = Math.abs(wa - wb) + (wb > wa ? 0 : 6);
      if (!best || score < best.score) best = { score, l: [a, b] };
    }
    if (best) return best.l;
  }
  return lines;
}

/**
 * Split a caption into display chunks of at most two lines, timed in proportion to their length.
 * → [{ t0, t1, text, lines }]
 */
export function chunkCaption(text, style, t0, t1, W, H) {
  const ctx = measurer(), st = captionStyle(style, W, H); ctx.font = st.font;
  const lines = wrapText(ctx, text, maxWidth(W, H));
  if (lines.length <= 2) return [{ t0, t1, text, lines }];
  // regroup the words into chunks at sentence/clause boundaries where possible
  const chunks = [];
  for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2).join(' '));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let t = t0;
  return chunks.map(c => { const d = ((t1 - t0) * c.length) / total, out = { t0: t, t1: t + d, text: c, lines: wrapText(ctx, c, maxWidth(W, H)) }; t += d; return out; });
}

// Where a caption goes. avoid: screen boxes (speakers' heads) it should not cover. → { lines, box, top, st }
export function layoutCaption(cap, W, H, avoid = []) {
  const ctx = measurer(), st = captionStyle(cap.style, W, H); ctx.font = st.font;
  const lines = cap.lines || wrapText(ctx, cap.text, maxWidth(W, H));
  const lh = st.size * 1.28, w = Math.max(...lines.map(l => ctx.measureText(l).width)), pad = st.size * 0.4;
  const blockH = lines.length * lh;
  const at = top => { const y0 = top ? H * 0.065 : H - H * 0.07 - blockH; return [W / 2 - w / 2 - pad, y0 - pad * 0.6, W / 2 + w / 2 + pad, y0 + blockH + pad * 0.4]; };
  const hit = b => avoid.reduce((a, q) => a + Math.max(0, Math.min(b[2], q[2]) - Math.max(b[0], q[0])) * Math.max(0, Math.min(b[3], q[3]) - Math.max(b[1], q[1])), 0);
  const bottom = at(false), topB = at(true);
  const top = hit(bottom) > 0 && hit(topB) < hit(bottom);
  return { lines, box: top ? topB : bottom, top, st, lh };
}

export function drawCaption(ctx, L, alpha, W, H) {
  if (alpha <= 0) return;
  const { st, lh, lines, box } = L, u = U(W, H);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over';
  if (st.band) {
    const cy = (box[1] + box[3]) / 2, hh = (box[3] - box[1]) * 0.9 + 30 * u;
    const g = ctx.createLinearGradient(0, cy - hh, 0, cy + hh);
    g.addColorStop(0, 'rgba(20,14,12,0)'); g.addColorStop(0.5, `rgba(20,14,12,${st.band})`); g.addColorStop(1, 'rgba(20,14,12,0)');
    ctx.fillStyle = g; ctx.fillRect(Math.max(0, box[0] - 120 * u), cy - hh, Math.min(W, box[2] - box[0] + 240 * u), hh * 2);
  }
  ctx.font = st.font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const y0 = box[1] + (box[3] - box[1] - lines.length * lh) / 2 + st.size * 0.98;
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    ctx.shadowColor = 'rgba(15,10,8,.85)'; ctx.shadowBlur = 14 * u; ctx.fillStyle = st.color; ctx.fillText(l, W / 2, y);
    ctx.shadowBlur = 3 * u; ctx.lineWidth = 3.2 * u; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(24,16,14,.55)'; ctx.strokeText(l, W / 2, y);
    ctx.shadowBlur = 0; ctx.fillText(l, W / 2, y);
  });
  ctx.restore();
}

// A title over the picture (title beats): large glowing italic, centred in the upper half.
export function drawTitle(ctx, cap, t, W, H) {
  const u = U(W, H), a = Math.min(ease((t - cap.t0) / 0.7), 1 - ease((t - (cap.t1 - 0.7)) / 0.7));
  if (a <= 0) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ctxM = ctx; let size = Math.round(96 * u);
  ctxM.font = `italic ${size}px ${SERIF}`;
  while (ctxM.measureText(cap.text).width > W * 0.86 && size > 20) { size -= 4; ctxM.font = `italic ${size}px ${SERIF}`; }
  const y = H * 0.38;
  ctx.shadowColor = 'rgba(15,10,8,.85)'; ctx.shadowBlur = 22 * u; ctx.fillStyle = '#fff8e8'; ctx.fillText(cap.text, W / 2, y);
  ctx.shadowBlur = 6 * u; ctx.fillText(cap.text, W / 2, y);
  if (cap.sub) { ctx.font = `italic ${Math.round(36 * u)}px ${SERIF}`; ctx.shadowBlur = 14 * u; ctx.fillStyle = '#fff0d4'; ctx.fillText(cap.sub, W / 2, y + size * 0.85); }
  ctx.restore();
}

// ───────────── parchment cards ─────────────
const CARD = new Map();
function parchment(W, H) {
  const key = `${W}x${H}`;
  if (CARD.has(key)) return CARD.get(key);
  const [c, x] = canvas(W, H), u = U(W, H), r = rng(4242);
  const g = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.15, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, '#f7eed6'); g.addColorStop(0.6, '#ecdcb6'); g.addColorStop(1, '#cfb383');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // soft gouache blotches in the paper
  for (let i = 0; i < 70; i++) {
    const px = r() * W, py = r() * H, rad = (60 + r() * 220) * u, gg = x.createRadialGradient(px, py, 0, px, py, rad);
    const warm = r() < 0.5; gg.addColorStop(0, warm ? 'rgba(196,160,104,0.10)' : 'rgba(255,250,236,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  paper(x, 0.12);
  // a hand-inked double border
  const m = Math.min(W, H) * 0.06, rect = (k, seed) => {
    const P = [], x0 = m + k, y0 = m + k, x1 = W - m - k, y1 = H - m - k, n = 60;
    for (let i = 0; i < n; i++) P.push([x0 + ((x1 - x0) * i) / n, y0]);
    for (let i = 0; i < n; i++) P.push([x1, y0 + ((y1 - y0) * i) / n]);
    for (let i = 0; i < n; i++) P.push([x1 - ((x1 - x0) * i) / n, y1]);
    for (let i = 0; i < n; i++) P.push([x0, y1 - ((y1 - y0) * i) / n]);
    return wobble(P, seed, 2.2 * u);
  };
  ink(x, rect(0, 7), 2.6 * u, { color: 'rgba(74,52,38,.85)', seed: 7 });
  ink(x, rect(9 * u, 8), 1.1 * u, { color: 'rgba(74,52,38,.6)', seed: 8 });
  // corner sprigs
  const sprig = (cx, cy, dx, dy, seed) => {
    const rr = rng(seed), stem = []; for (let i = 0; i <= 12; i++) { const k = i / 12; stem.push([cx + dx * k * 70 * u + Math.sin(k * 3) * 6 * u * dy, cy + dy * k * 70 * u + Math.sin(k * 3) * 6 * u * dx]); }
    ink(x, stem, 1.6 * u, { closed: false, color: 'rgba(74,52,38,.8)', seed });
    for (let i = 2; i < 12; i += 2) {
      const [px, py] = stem[i], side = i % 4 ? 1 : -1, a = Math.atan2(dy, dx) + side * 0.9, L = (9 + rr() * 5) * u;
      x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = rr() < 0.5 ? 'rgba(122,140,84,.75)' : 'rgba(150,120,70,.7)';
      x.beginPath(); x.ellipse(L, 0, L, L * 0.38, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
  };
  const o = m + 20 * u;
  sprig(o, o, 1, 0.3, 11); sprig(W - o, o, -1, 0.3, 12); sprig(o, H - o, 1, -0.3, 13); sprig(W - o, H - o, -1, -0.3, 14);
  // vignette
  const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(60,40,20,0)'); v.addColorStop(1, 'rgba(60,40,20,0.28)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
  CARD.set(key, c);
  return c;
}
function rule(ctx, cx, y, w, u, seed) {
  const P = []; for (let i = 0; i <= 40; i++) { const k = i / 40; P.push([cx - w / 2 + w * k, y + Math.sin(k * Math.PI * 3) * 2.5 * u]); }
  ink(ctx, P, 2 * u, { closed: false, color: 'rgba(74,52,38,.8)', seed });
  ctx.fillStyle = 'rgba(74,52,38,.85)'; ctx.beginPath(); ctx.ellipse(cx, y, 5 * u, 5 * u, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
}
function fitFont(ctx, text, style, size, maxW, min = 18) {
  ctx.font = `${style} ${size}px ${SERIF}`;
  while (ctx.measureText(text).width > maxW && size > min) { size -= 2; ctx.font = `${style} ${size}px ${SERIF}`; }
  return size;
}
// Opening or end card at film time t. card: { kind, t0, t1, title, subtitle, lines }
export function drawCard(ctx, card, t, W, H) {
  const u = U(W, H), lt = t - card.t0;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(parchment(W, H), 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#3b2a20';
  const inkA = (d0, d = 0.9) => ease((lt - d0) / d);
  const maxW = W * 0.78;
  if (card.kind === 'open') {
    const a1 = inkA(0.5), a2 = inkA(1.3), a3 = inkA(1.8);
    const size = fitFont(ctx, card.title || '', 'italic', Math.round(108 * u), maxW);
    const lines = wrapText(ctx, card.title || '', maxW).slice(0, 3), lh = size * 1.12;
    const y0 = H * 0.46 - ((lines.length - 1) * lh) / 2 - (card.subtitle ? 20 * u : 0);
    ctx.globalAlpha = a1; lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
    const ry = y0 + (lines.length - 1) * lh + 48 * u;
    ctx.save(); ctx.globalAlpha = a2; ctx.beginPath(); ctx.rect(W / 2 - 160 * u, ry - 20 * u, 320 * u * clamp((lt - 1.3) / 0.8), 40 * u); ctx.clip(); rule(ctx, W / 2, ry, 300 * u, u, 31); ctx.restore();
    if (card.subtitle) { ctx.globalAlpha = a3; fitFont(ctx, card.subtitle, 'italic', Math.round(38 * u), maxW); ctx.fillStyle = '#5a4232'; ctx.fillText(card.subtitle, W / 2, ry + 66 * u); }
  } else {
    const L = card.lines?.length ? card.lines : ['The End'];
    let y = H * 0.47 - (L.length - 1) * 34 * u;
    L.forEach((l, i) => {
      ctx.globalAlpha = inkA(0.4 + i * 0.5);
      const size = fitFont(ctx, l, 'italic', Math.round((i === 0 ? 100 : 36) * u), maxW);
      ctx.fillStyle = i === 0 ? '#3b2a20' : '#5a4232'; ctx.fillText(l, W / 2, y);
      if (i === 0) { ctx.save(); ctx.globalAlpha = inkA(0.9); rule(ctx, W / 2, y + 42 * u, 240 * u, u, 33); ctx.restore(); y += 100 * u; } else y += size * 1.5;
    });
  }
  ctx.restore();
}
