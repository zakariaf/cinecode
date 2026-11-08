// The cast. Every draw function takes (ctx, x, y, s, face, state): (x, y) is where the character touches
// the world — feet on the ground, or the perch point on a branch/stump/hollow. face = 1 looks right, -1 left.
import { rng, clamp, lerp, poly, path, shift, ell, arcPts, rpoly, limb, quad, ink, blob, INK } from '../core/lib.mjs';

export const SHADE = '#c3b8dc';
export const darken = (hex, f) => '#' + [1, 3, 5].map(i => Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * f)).toString(16).padStart(2, '0')).join('');
export function cel(ctx, P, col, sh, w = 1.15, seed = 1) {
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(-900, -900, 1800, 1800);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = SHADE;
  ctx.beginPath(); ctx.rect(-900, -900, 1800, 1800); poly(ctx, shift(P, sh[0], sh[1])); ctx.fill('evenodd');
  ctx.restore();
  if (w > 0) ink(ctx, P, w, { seed });
}
const fillP = (ctx, P, col) => { ctx.fillStyle = col; path(ctx, P); ctx.fill(); };
const dot = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
const dirv = a => [Math.sin(a), Math.cos(a)];
const at = (o, a, l) => { const d = dirv(a); return [o[0] + d[0] * l, o[1] + d[1] * l]; };
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mixPose = (a, b, u) => { const p = {}; for (const k in a) p[k] = typeof a[k] === 'number' ? lerp(a[k], b[k] ?? a[k], u) : (u < 0.5 ? a[k] : b[k]); return p; };
export function groundShadow(ctx, x, y, w, lift = 0, a = 0.28) {
  ctx.save(); ctx.fillStyle = `rgba(35,50,30,${a})`; ctx.beginPath();
  ctx.ellipse(x, y + 1, w * (1 - clamp(lift / 140, 0, 0.5)), w * 0.18, 0, 0, 7); ctx.fill(); ctx.restore();
}
const lightSh = face => [-2.2 * face, -2.2];
function eyeDraw(ctx, x, y, rx, ry, state, iris = '#2a1a14', look = 0) {
  if (state === 'closed' || state === 'happy') { ink(ctx, [[x - rx - 1, y], [x, y + (state === 'happy' ? -ry * 0.6 : ry * 0.5)], [x + rx + 1, y]], 1.1, { closed: false, seed: x * 7, taper: false }); return; }
  const k = state === 'wide' ? 1.3 : state === 'half' ? 0.45 : 1;
  if (state === 'wide') { const W = ell(x, y, rx * 1.6, ry * 1.35, 9, 0.1); fillP(ctx, W, '#fff'); ink(ctx, W, 0.8, { seed: 9 }); }
  ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(x + look, y, rx, ry * k, 0, 0, 7); ctx.fill();
  dot(ctx, x + look + rx * 0.35, y - ry * 0.4 * k, Math.max(0.5, rx * 0.38), '#fff');
  if (state === 'half') ink(ctx, [[x - rx - 1, y - ry * 0.45], [x + rx + 1, y - ry * 0.45]], 1.1, { closed: false, seed: 31, taper: false });
}

// ───────────── Hare ─────────────
const FUR = '#b08559', BELLY = '#efe2c8';
export const HP = {
  sit: { bx: 0, by: -30, br: -0.35, bs: 1, hx: 30, hy: -54, hr: -0.1, eF: 0.25, eB: 0.45, hindA: 0.6, foot: 0, hindA2: 0.6, foot2: 0, foreA: 0.1, foreA2: 0.15, lift: 0 },
  stretch: { bx: 0, by: -34, br: 0.05, bs: 1.25, hx: 44, hy: -42, hr: 0.1, eF: 1.15, eB: 1.3, hindA: -1.3, foot: Math.PI - 0.4, hindA2: -1.2, foot2: Math.PI - 0.5, foreA: 1.3, foreA2: 1.1, lift: 0 },
  bunch: { bx: 0, by: -36, br: -0.1, bs: 0.85, hx: 32, hy: -50, hr: -0.05, eF: 1.0, eB: 1.2, hindA: 0.95, foot: 0.2, hindA2: 0.9, foot2: 0.2, foreA: -0.6, foreA2: -0.8, lift: 0 },
  up: { bx: 0, by: -44, br: -1.25, bs: 1, hx: 9, hy: -86, hr: -0.15, eF: 0.05, eB: 0.3, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 0.4, foreA2: 0.2, lift: 0 },
  mock: { bx: 0, by: -42, br: -0.95, bs: 1, hx: 24, hy: -78, hr: 0.2, eF: 0.15, eB: 0.45, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 0.85, foreA2: 0.3, lift: 0 },
  laugh: { bx: 0, by: -44, br: -1.35, bs: 1, hx: 4, hy: -88, hr: -0.45, eF: 0.0, eB: 0.25, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 2.3, foreA2: -0.4, lift: 0 },
  wiggle: { bx: 0, by: -30, br: -0.4, bs: 1, hx: 28, hy: -56, hr: 0.15, eF: 0.2, eB: 0.4, hindA: 1.55, foot: -0.55, hindA2: 0.6, foot2: 0, foreA: 0.1, foreA2: 0.2, lift: 0 },
  offer: { bx: 0, by: -44, br: -1.2, bs: 1, hx: 11, hy: -86, hr: 0.05, eF: 0.1, eB: 0.35, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 1.6, foreA2: 0.2, lift: 0 },
  look: { bx: 0, by: -44, br: -1.25, bs: 1, hx: 10, hy: -86, hr: 0.0, eF: -0.05, eB: 0.2, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 2.75, foreA2: 0.2, lift: 0 },
  yawn: { bx: 0, by: -46, br: -1.3, bs: 1.05, hx: 6, hy: -90, hr: -0.45, eF: 0.1, eB: 0.35, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 3.0, foreA2: 2.8, lift: 0 },
  sleep: { bx: 0, by: -16, br: 0.1, bs: 1.15, hx: 36, hy: -16, hr: 0.35, eF: 1.55, eB: 1.65, hindA: 1.35, foot: 0.1, hindA2: 1.3, foot2: 0.1, foreA: 1.55, foreA2: 1.45, lift: 0 },
  alert: { bx: 0, by: -46, br: -1.3, bs: 1, hx: 9, hy: -90, hr: -0.05, eF: -0.15, eB: 0.05, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 1.0, foreA2: 0.8, lift: 0 },
  ready: { bx: 0, by: -24, br: 0.2, bs: 0.9, hx: 34, hy: -34, hr: 0.15, eF: 1.35, eB: 1.45, hindA: 0.95, foot: 0, hindA2: 0.95, foot2: 0, foreA: 0.2, foreA2: 0.3, lift: 0 },
  skid: { bx: 0, by: -36, br: -0.75, bs: 1, hx: 20, hy: -74, hr: -0.3, eF: -0.4, eB: -0.25, hindA: 1.3, foot: 0, hindA2: 1.25, foot2: 0, foreA: -0.4, foreA2: -0.6, lift: 0 },
  slump: { bx: 0, by: -30, br: -0.55, bs: 1, hx: 30, hy: -50, hr: 0.45, eF: 1.7, eB: 1.8, hindA: 0.6, foot: 0, hindA2: 0.6, foot2: 0, foreA: 0.05, foreA2: 0.1, lift: 0 },
};
export function gallop(ph, amp = 1) {
  const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * ph), p = mixPose(HP.bunch, HP.stretch, u);
  p.lift = 18 * amp * Math.max(0, Math.sin(Math.PI * 2 * ph - 0.6)); return p;
}
function hareEar(ctx, p, ang, far, sh) {
  const base = add([p.hx, p.hy], rot(far ? [-8, -8] : [-3, -9], p.hr)), a = -ang + p.hr * 0.5;
  const c = add(base, rot([0, -21], a)), E = ell(c[0], c[1], 5.5, 22, far ? 81 : 82, 0.3, a);
  cel(ctx, E, far ? darken(FUR, 0.85) : FUR, sh, 1.1, far ? 81 : 82);
  fillP(ctx, ell(c[0], c[1] + 2 * Math.cos(a), 2.6, 15, 83, 0.2, a), far ? '#c9918a' : '#e8a9a0');
  const tip = add(c, rot([0, -17], a)); fillP(ctx, ell(tip[0], tip[1], 3.6, 5, 84, 0.1, a), '#4a3428');
}
function hareHead(ctx, p, ex, sh) {
  ctx.save(); ctx.translate(p.hx, p.hy); ctx.rotate(p.hr);
  cel(ctx, ell(0, 0, 15, 12.5, 84, 0.3), FUR, sh, 1.15, 84);
  cel(ctx, [[-12, 4], [-17, 10], [-9, 9]], FUR, sh, 0.9, 99);                     // cheek tuft
  cel(ctx, ell(10, 4, 8.5, 7, 85, 0.2), FUR, sh, 1.1, 85);
  fillP(ctx, ell(9, 8, 6, 3.4, 86, 0.2), BELLY);
  fillP(ctx, [[16.5, -0.5], [19.5, 0.5], [17, 2.8]], '#d97a7a');
  eyeDraw(ctx, 5.5, -2, 2.5, 3.6, ex.eyes || 'open', '#3a2412');
  const m = ex.mouth;
  const M = [[12, 6.5], [18, 5.8], [16.5, 10.5], [13, 10.8]];
  if (m === 'laugh') { fillP(ctx, M, '#8b2f3b'); ink(ctx, M, 0.8, { seed: 90 }); }
  else if (m === 'o') dot(ctx, 15, 8, 2, '#8b2f3b');
  else if (m === 'yawn') { const Y = ell(14, 8, 4, 5.5, 91, 0.2); fillP(ctx, Y, '#8b2f3b'); ink(ctx, Y, 0.8, { seed: 91 }); }
  else if (m === 'frown') ink(ctx, [[12.5, 8.6], [14.5, 7.4], [16.5, 8.4]], 0.8, { closed: false, seed: 92 });
  else ink(ctx, [[12.5, 6.6], [14.5, 8], [16.8, 6.4]], 0.8, { closed: false, seed: 92 });
  for (const [ty, s] of [[2, 93], [5.5, 94], [8.5, 95]]) ink(ctx, [[15, 4.5], [29, ty]], 0.5, { closed: false, seed: s, color: 'rgba(42,33,48,.6)' });
  ctx.restore();
}
export function drawHare(ctx, x, y, s, face, p, ex = {}, opt = {}) {
  const B = [p.bx, p.by], H = add(B, rot([-18 * p.bs, 4], p.br)), S = add(B, rot([19 * p.bs, 5], p.br));
  const heel = at(H, p.hindA, 16), toe = [heel[0] + Math.cos(p.foot) * 22, heel[1] + Math.sin(p.foot) * 22];
  const H2 = add(H, [-4, -1]), heel2 = at(H2, p.hindA2, 16), toe2 = [heel2[0] + Math.cos(p.foot2) * 22, heel2[1] + Math.sin(p.foot2) * 22];
  const S2 = add(S, [-5, 0]), paw1 = at(S, p.foreA, 20), paw2 = at(S2, p.foreA2, 20);
  const g = Math.max(heel[1] + 3, toe[1] + 3, heel2[1] + 3, toe2[1] + 3, paw1[1] + 3, paw2[1] + 3), lift = p.lift || 0, sh = lightSh(face);
  if (opt.shadow !== false) groundShadow(ctx, x, y, 40 * s, lift);
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s); ctx.translate(0, -g - lift);
  hareEar(ctx, p, p.eB, true, sh);
  cel(ctx, limb(...S2, ...paw2, 4.4, 3.4, 2, 70), darken(FUR, 0.85), sh, 1.05, 70);
  cel(ctx, limb(...H2, ...heel2, 6, 4.2, 3, 69), darken(FUR, 0.85), sh, 1.05, 69);
  cel(ctx, limb(...heel2, ...toe2, 4, 3.4, 2, 71), darken(FUR, 0.85), sh, 1.05, 71);
  const body = ell(B[0], B[1], 26 * p.bs, 17 / Math.sqrt(p.bs), 72, 0.5, p.br);
  cel(ctx, body, FUR, sh, 1.2, 72);
  ctx.save(); path(ctx, body); ctx.clip(); const bp = add(B, rot([8, 12], p.br)); fillP(ctx, ell(bp[0], bp[1], 20, 9, 73, 0.3, p.br), BELLY);
  for (let i = 0; i < 6; i++) { const q = add(B, rot([-16 + i * 6, -10], p.br)); ink(ctx, [q, add(q, rot([3, 4], p.br))], 0.6, { closed: false, seed: 400 + i, color: 'rgba(90,60,40,.5)' }); }
  ctx.restore(); ink(ctx, body, 1.2, { seed: 72 });
  const tl = add(B, rot([-27 * p.bs, -5], p.br)); cel(ctx, ell(tl[0], tl[1], 6.5, 6, 74, 0.6), '#f6efe2', sh, 1, 74);
  cel(ctx, limb(...H, ...heel, 7, 4.6, 3, 75), FUR, sh, 1.1, 75);
  cel(ctx, limb(...heel, ...toe, 4.6, 4, 2, 76), FUR, sh, 1.1, 76);
  cel(ctx, ell(H[0], H[1], 15, 12.5, 77, 0.4, p.br), FUR, sh, 1.15, 77);
  hareHead(ctx, p, ex, sh);
  hareEar(ctx, p, p.eF, false, sh);
  cel(ctx, limb(...S, ...paw1, 4.6, 3.6, 2, 78), FUR, sh, 1.1, 78);
  cel(ctx, ell(paw1[0], paw1[1], 4.2, 3.4, 79, 0.2), FUR, sh, 1, 79);
  ctx.restore();
  const hx = rot([p.hx, p.hy], 0);
  return { head: [x + hx[0] * s * face, y + (hx[1] - g - lift) * s], eye: [x + (p.hx + 5) * s * face, y + (p.hy - 2 - g - lift) * s] };
}

// ───────────── Tortoise ─────────────
const SKIN = '#a7a36a', SHELL = '#6f8a46';
export function drawTortoise(ctx, x, y, s, face, st = {}) {
  const ph = st.phase || 0, w = st.walking ? 1 : 0, sw = Math.sin(Math.PI * 2 * ph), bob = w * 1.2 * Math.abs(Math.sin(Math.PI * 2 * ph));
  const sh = lightSh(face), tuck = st.sleep ? 1 : 0;
  if (st.shadow !== false) groundShadow(ctx, x, y, 50 * s, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s); ctx.translate(0, -bob + tuck * 4);
  const leg = (hx, dx, lift, col, seed) => { const ly = -lift + tuck * -3; cel(ctx, limb(hx, -12, hx + dx, ly, 7, 6, 3, seed), col, sh, 1.1, seed); cel(ctx, ell(hx + dx + 1, ly - 1, 7, 3.6, seed + 1, 0.2), col, sh, 1, seed + 1); for (let k = -1; k <= 1; k++) dot(ctx, hx + dx + 5 + k * 2.4, ly, 0.9, '#e8e0c0'); };
  leg(-14, -6 * sw * w, w * Math.max(0, -sw) * 4, darken(SKIN, 0.82), 101);
  leg(26, 6 * sw * w, w * Math.max(0, sw) * 4, darken(SKIN, 0.82), 103);
  cel(ctx, [[-36, -14], [-46, -10], [-36, -8]], SKIN, sh, 1, 105);
  const hx = 50 + (st.ext || 0) + w * 2 * sw - tuck * 8, hy = -22 + (st.headDy || 0) + tuck * 12;
  cel(ctx, limb(26, -16, hx - 6, hy + 2, 7, 6, 3, 106), SKIN, sh, 1.1, 106);
  const P = rpoly([...arcPts(0, -20, 38, 30, Math.PI, Math.PI * 2, 6), [38, -14], [-38, -12]], 6, { seed: 107, jit: 0.8 });
  cel(ctx, P, SHELL, sh, 1.4, 107);
  ctx.save(); path(ctx, P); ctx.clip();
  for (const [cx, cy, rr, col] of [[-22, -27, 11, '#7e9a4e'], [0, -38, 11, '#86a254'], [22, -27, 11, '#7e9a4e'], [-11, -22, 9, '#88a456'], [11, -22, 9, '#88a456'], [-30, -16, 8, '#738e48'], [30, -16, 8, '#738e48']]) {
    const hex = rpoly(Array.from({ length: 6 }, (_, k) => [cx + Math.cos(k * Math.PI / 3) * rr, cy + Math.sin(k * Math.PI / 3) * rr * 0.8]), 3, { seed: cx * 3 + cy, jit: 0.5 });
    fillP(ctx, hex, col); ink(ctx, hex, 0.9, { seed: cx + cy + 200 });
    ink(ctx, [[cx - rr * 0.4, cy - rr * 0.35], [cx + rr * 0.2, cy - rr * 0.5]], 0.6, { closed: false, seed: cx + 300, color: 'rgba(230,235,190,.55)' });
  }
  for (let i = 0; i < 8; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 8; ink(ctx, [[Math.cos(a) * 32, -20 + Math.sin(a) * 24], [Math.cos(a) * 38, -20 + Math.sin(a) * 30]], 0.8, { closed: false, seed: 310 + i }); }
  ctx.restore();
  cel(ctx, rpoly([[-40, -16], [40, -18], [37, -9], [-37, -8]], 4, { seed: 108, jit: 0.4 }), '#d8c58c', sh, 1.1, 108);
  leg(-20, 6 * sw * w, w * Math.max(0, sw) * 4, SKIN, 109);
  leg(20, -6 * sw * w, w * Math.max(0, -sw) * 4, SKIN, 111);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(st.headRot || 0);
  cel(ctx, ell(0, 0, 11, 8.6, 113, 0.3), SKIN, sh, 1.15, 113);
  for (const [px, py] of [[-4, -4], [-1, 3], [-6, 2]]) dot(ctx, px, py, 1.1, 'rgba(90,85,50,.5)');
  const ex = st.ex || {};
  if (ex.eyes === 'open' || !ex.eyes) { eyeDraw(ctx, 5, -2.4, 1.9, 2.5, 'open', '#2a1e16'); ink(ctx, [[2.4, -3.8], [7.8, -4.2]], 1, { closed: false, seed: 115, taper: false }); }
  else eyeDraw(ctx, 5, -2.4, 1.9, 2.5, ex.eyes, '#2a1e16');
  if (ex.mouth === 'talk' || ex.mouth === 'laugh') { ctx.fillStyle = '#6b3030'; ctx.beginPath(); ctx.ellipse(8, 3.6, 2.6, ex.mouth === 'laugh' ? 2.2 : 1.5, 0, 0, 7); ctx.fill(); }
  else ink(ctx, [[4, 3.2], [7.5, 4.6], [10.5, 2.8]], 0.8, { closed: false, seed: 116 });
  ctx.restore();
  ctx.restore();
  return { head: [x + hx * s * face, y + (hy - bob) * s] };
}

// ───────────── Fox (the judge) ─────────────
const RUSS = '#c8642e', CREAM = '#f4ede0', SOCK = '#2b2222';
function foxHead(ctx, hx, hy, r, ex, sh) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(r);
  cel(ctx, [[-1, -8], [2, -27], [9, -7]], darken(RUSS, 0.85), sh, 1, 120); fillP(ctx, [[1.5, -10], [3, -22], [6.5, -9]], '#3a2a26');
  cel(ctx, [[-9, -7], [-8, -26], [-1, -8]], darken(RUSS, 0.75), sh, 1, 121);
  const skull = ell(0, 0, 12, 10, 122, 0.3); cel(ctx, skull, RUSS, sh, 1.15, 122);
  const snout = [[5, -4], [23, 0], [22, 4.5], [4, 7]]; cel(ctx, rpoly(snout, 3, { seed: 123, jit: 0.3 }), RUSS, sh, 1.1, 123);
  fillP(ctx, rpoly([[2, 3], [21, 3.5], [19, 6.5], [1, 8]], 2.5, { seed: 124, jit: 0.3 }), CREAM);
  fillP(ctx, ell(-6, 5, 6, 4, 125, 0.2), CREAM);
  dot(ctx, 22.5, 1.5, 2.2, '#1d1515');
  eyeDraw(ctx, 6, -3, 1.9, 2.3, ex.eyes || 'open', '#8a5a14');
  ink(ctx, [[12, 6], [16, 6.6], [20, 5.6]], 0.7, { closed: false, seed: 126 });
  ctx.restore();
}
function foxTail(ctx, base, a, sh, curl) {
  ctx.save(); ctx.translate(...base); ctx.rotate(a);
  const T = rpoly([[0, -6], [-26, -14 - curl * 6], [-52, -8 - curl * 14], [-60, 2 - curl * 10], [-48, 8], [-22, 8], [0, 6]], 9, { seed: 130, jit: 0.6 });
  cel(ctx, T, RUSS, sh, 1.2, 130);
  ctx.save(); path(ctx, T); ctx.clip(); fillP(ctx, ell(-58, -2 - curl * 10, 12, 12, 131, 0.3), CREAM); ctx.restore(); ink(ctx, T, 1.2, { seed: 130 });
  ctx.restore();
}
// state: { pose: 'stand'|'walk'|'sit'|'leap', phase, point (0..1), nod (rad), ex }
export function drawFox(ctx, x, y, s, face, st = {}) {
  const sh = lightSh(face), ex = st.ex || {};
  if (st.shadow !== false) groundShadow(ctx, x, y, 44 * s, st.lift || 0);
  ctx.save(); ctx.translate(x, y - (st.lift || 0) * s); ctx.scale(s * face, s);
  let head;
  if (st.pose === 'sit') {
    foxTail(ctx, [-14, -6], 0.15, sh, -0.6);
    cel(ctx, limb(4, -46, 6, 0, 4.4, 3.6, 2, 132), darken(RUSS, 0.82), sh, 1, 132); fillP(ctx, limb(6, -12, 6, 0, 3.8, 3.6, 2, 133), SOCK);
    const body = ell(-4, -34, 17, 26, 134, 0.4, 0.25); cel(ctx, body, RUSS, sh, 1.2, 134);
    ctx.save(); path(ctx, body); ctx.clip(); fillP(ctx, ell(8, -44, 9, 16, 135, 0.3, 0.2), CREAM); ctx.restore(); ink(ctx, body, 1.2, { seed: 134 });
    cel(ctx, ell(-14, -12, 15, 12, 136, 0.3), RUSS, sh, 1.1, 136);
    cel(ctx, ell(-2, -2, 9, 3.6, 137, 0.2), SOCK, sh, 1, 137);
    const pa = lerp(0.05, 1.45, st.point || 0), paw = at([12, -46], pa, 30);
    cel(ctx, limb(12, -46, ...paw, 4.6, 3.8, 2, 138), RUSS, sh, 1.1, 138);
    cel(ctx, ell(paw[0], paw[1], 4.4, 3.6, 139, 0.2), SOCK, sh, 1, 139);
    head = [14, -72 + (st.nod || 0) * 8]; foxHead(ctx, ...head, (st.nod || 0) - 0.05, ex, sh);
  } else {
    const ph = st.phase || 0, wk = st.pose === 'walk' ? 1 : 0, lp = st.pose === 'leap' ? 1 : 0, sw = Math.sin(Math.PI * 2 * ph);
    const legs = (hx, a, col, seed) => { const ft = at([hx, -30], a, 30); cel(ctx, limb(hx, -30, ...ft, 5, 3.4, 2, seed), col, sh, 1.05, seed); fillP(ctx, limb(...at([hx, -30], a, 18), ...ft, 3.6, 3.4, 2, seed + 1), SOCK); };
    legs(-20, wk * -0.4 * sw + lp * -1.0, darken(RUSS, 0.82), 140); legs(18, wk * 0.4 * sw + lp * 1.1, darken(RUSS, 0.82), 142);
    foxTail(ctx, [-28, -40], -0.1 + lp * 0.3, sh, 0.4);
    const body = ell(0, -40, 31, 14, 144, 0.4, lp * -0.15); cel(ctx, body, RUSS, sh, 1.2, 144);
    ctx.save(); path(ctx, body); ctx.clip(); fillP(ctx, ell(14, -32, 18, 7, 145, 0.3), CREAM); ctx.restore(); ink(ctx, body, 1.2, { seed: 144 });
    legs(-14, wk * 0.4 * sw + lp * -1.1, RUSS, 146); legs(24, wk * -0.4 * sw + lp * 1.2, RUSS, 148);
    head = [38, -58 + (st.nod || 0) * 6]; foxHead(ctx, ...head, (st.nod || 0) + 0.1, ex, sh);
  }
  ctx.restore();
  return { head: [x + head[0] * s * face, y + head[1] * s] };
}

// ───────────── Owl (sits inside its hollow; clip = the hollow's opening) ─────────────
export function drawOwl(ctx, x, y, s, face, st = {}, clipP = null) {
  const sh = lightSh(face), ex = st.ex || {}, puff = 1 + (st.hoot || 0) * 0.06;
  ctx.save(); if (clipP) { path(ctx, clipP); ctx.clip(); }
  ctx.translate(x, y); ctx.scale(s * face * puff, s * puff);
  const body = ell(0, -16, 17, 22, 150, 0.4); cel(ctx, body, '#8a6a4a', sh, 1.2, 150);
  ctx.save(); path(ctx, body); ctx.clip(); fillP(ctx, ell(0, -8, 10, 14, 151, 0.3), '#d9c4a0');
  for (let i = 0; i < 9; i++) ink(ctx, [[-6 + (i % 3) * 6, -12 + Math.floor(i / 3) * 6], [-4 + (i % 3) * 6, -10 + Math.floor(i / 3) * 6]], 0.8, { closed: false, seed: 152 + i, color: '#6d5238' });
  ctx.restore(); ink(ctx, body, 1.2, { seed: 150 });
  cel(ctx, [[-14, -48], [-10, -60], [-5, -48]], '#7a5c40', sh, 1, 160); cel(ctx, [[14, -48], [10, -60], [5, -48]], '#7a5c40', sh, 1, 161);
  const head = ell(0, -40, 17, 14, 162, 0.3); cel(ctx, head, '#8a6a4a', sh, 1.2, 162);
  fillP(ctx, ell(-6.5, -40, 7.5, 7.5, 163, 0.2), '#e8d8b8'); fillP(ctx, ell(6.5, -40, 7.5, 7.5, 164, 0.2), '#e8d8b8');
  for (const ex2 of [-6.5, 6.5]) {
    if (ex.eyes === 'closed' || ex.eyes === 'half') { dot(ctx, ex2, -40, 5, '#f2c94c'); ctx.fillStyle = '#8a6a4a'; ctx.fillRect(ex2 - 6, -46, 12, ex.eyes === 'closed' ? 7 : 4.5); ink(ctx, [[ex2 - 5, ex.eyes === 'closed' ? -39.5 : -41.5], [ex2 + 5, ex.eyes === 'closed' ? -39.5 : -41.5]], 0.9, { closed: false, seed: ex2 + 170, taper: false }); }
    else { const r = ex.eyes === 'wide' ? 6 : 5; dot(ctx, ex2, -40, r, '#f2c94c'); ink(ctx, ell(ex2, -40, r, r, ex2 + 171, 0.1), 0.8, { seed: ex2 + 171 }); dot(ctx, ex2 + 0.5, -40, r * 0.5, '#1a1410'); dot(ctx, ex2 + 1.6, -41.5, 1, '#fff'); }
  }
  const bk = st.hoot ? [[-2.5, -35], [2.5, -35], [0, -28]] : [[-2.2, -35], [2.2, -35], [0, -30]];
  fillP(ctx, bk, '#e0a840'); ink(ctx, bk, 0.7, { seed: 172 });
  if (st.hoot) dot(ctx, 0, -31.5, 1.4, '#5a2a20');
  ctx.restore();
}

// ───────────── Squirrel (perched: (x,y) is a point on top of the branch) ─────────────
export function drawSquirrel(ctx, x, y, s, face, st = {}) {
  const sh = lightSh(face), ex = st.ex || {}, RED = '#b4542a', nib = st.nibble ? Math.sin(st.t * 18) * 1.2 : 0;
  ctx.save(); ctx.translate(x, y - (st.lift || 0) * s); ctx.scale(s * face, s);
  const tail = rpoly([[-4, -4], [-16, -14], [-20, -32], [-14, -46], [-4, -50], [-6, -42], [-11, -32], [-8, -16], [0, -8]], 8, { seed: 180, jit: 0.4 });
  cel(ctx, tail, darken(RED, 0.95), sh, 1.1, 180);
  ctx.save(); path(ctx, tail); ctx.clip(); for (let i = 0; i < 10; i++) ink(ctx, [[-16 + i, -16 - i * 3], [-12 + i, -18 - i * 3]], 0.6, { closed: false, seed: 181 + i, color: 'rgba(240,200,160,.6)' }); ctx.restore();
  cel(ctx, ell(-2, -2, 7, 3, 183, 0.2), darken(RED, 0.85), sh, 1, 183);
  const body = ell(0, -11, 7.5, 11, 184, 0.3, 0.15); cel(ctx, body, RED, sh, 1.1, 184);
  ctx.save(); path(ctx, body); ctx.clip(); fillP(ctx, ell(4, -9, 4, 8, 185, 0.2), '#f0dcc0'); ctx.restore(); ink(ctx, body, 1.1, { seed: 184 });
  const hy = -26 + nib;
  cel(ctx, [[0, hy - 5], [2, hy - 13], [5, hy - 5]], RED, sh, 0.9, 186);
  cel(ctx, ell(4, hy, 7, 6.2, 187, 0.2), RED, sh, 1.1, 187);
  fillP(ctx, ell(8, hy + 2, 3.5, 2.6, 188, 0.1), '#f0dcc0');
  eyeDraw(ctx, 6, hy - 1.5, 1.6, 2, ex.eyes || 'open', '#1a1210');
  dot(ctx, 10.8, hy + 0.8, 1, '#3a2020');
  const pose = st.pose || 'hold';
  const pawP = pose === 'shush' ? [9, hy + 3] : pose === 'drop' ? [9, -24] : [7, -16];
  cel(ctx, limb(3, -18, ...pawP, 2.2, 1.8, 1, 189), RED, sh, 0.9, 189);
  if (pose === 'hold') acorn(ctx, 9, -15, 1);
  if (pose === 'shush') ink(ctx, [[pawP[0] + 1, pawP[1] - 5], [pawP[0] + 1, pawP[1] + 1]], 1.4, { closed: false, seed: 190, taper: false, color: '#7a3018' });
  ctx.restore();
}
export function acorn(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const nut = ell(0, 1.2, 3, 3.6, 191, 0.1); fillP(ctx, nut, '#b08040'); ink(ctx, nut, 0.6, { seed: 191 });
  const cap = ell(0, -1.6, 3.6, 2, 192, 0.1); fillP(ctx, cap, '#6b4a2a'); ink(ctx, cap, 0.6, { seed: 192 });
  ctx.restore();
}

// ───────────── Hedgehog, mice, badger ─────────────
export function drawHedgehog(ctx, x, y, s, face, st = {}) {
  const sh = lightSh(face), lift = st.lift || 0;
  if (st.shadow !== false) groundShadow(ctx, x, y, 20 * s, lift);
  ctx.save(); ctx.translate(x, y - lift * s); ctx.scale(s * face, s);
  const dome = rpoly([...arcPts(0, -8, 17, 14, Math.PI, Math.PI * 2, 4), [17, -4], [-17, -3]], 4, { seed: 200, jit: 0.5 });
  cel(ctx, dome, '#7a604a', sh, 1.1, 200);
  for (let i = 0; i < 26; i++) { const a = Math.PI + 0.15 + (i / 25) * (Math.PI - 0.3), r0 = 8 + (i % 3) * 3; ink(ctx, [[Math.cos(a) * r0, -8 + Math.sin(a) * r0 * 0.8], [Math.cos(a) * (r0 + 10), -8 + Math.sin(a) * (r0 + 9) * 0.8]], 1.3, { closed: false, seed: 201 + i, color: i % 2 ? '#3e2e22' : '#5a4532' }); }
  const face_ = rpoly([[12, -12], [26, -6], [24, -2], [12, -1]], 4, { seed: 230, jit: 0.3 }); cel(ctx, face_, '#d8c09a', sh, 1, 230);
  dot(ctx, 25.5, -4.5, 1.8, '#1a1210'); eyeDraw(ctx, 17, -8, 1.3, 1.6, (st.ex || {}).eyes || 'open', '#1a1210');
  for (const fx of [-8, 8]) dot(ctx, fx, -1, 2.4, '#5a4532');
  ctx.restore();
}
export function drawMouse(ctx, x, y, s, face, st = {}) {
  const sh = lightSh(face), lift = st.lift || 0, pose = st.pose || 'idle', up = pose === 'gasp' || pose === 'cheer';
  if (st.shadow !== false) groundShadow(ctx, x, y, 10 * s, lift);
  ctx.save(); ctx.translate(x, y - lift * s); ctx.scale(s * face, s);
  ink(ctx, quad([-7, -3], [-18, -1], [-22, -8], 10), 0.9, { closed: false, seed: 240, color: '#b08a80' });
  const body = ell(0, up ? -8 : -5, up ? 5.5 : 7.5, up ? 8 : 5.5, 241, 0.2, up ? 0.2 : 0); cel(ctx, body, '#9a8a7c', sh, 1, 241);
  const hx = up ? 3 : 8, hy = up ? -18 : -8;
  cel(ctx, ell(hx - 2, hy - 5, 3.8, 3.8, 242, 0.1), '#9a8a7c', sh, 0.9, 242); fillP(ctx, ell(hx - 2, hy - 5, 2.2, 2.2, 243, 0.1), '#e8b0b0');
  cel(ctx, ell(hx, hy, 4.8, 4, 244, 0.1), '#a89888', sh, 1, 244);
  dot(ctx, hx + 4.6, hy + 0.6, 0.9, '#d88a8a'); eyeDraw(ctx, hx + 1.6, hy - 0.8, 0.9, 1.1, (st.ex || {}).eyes || 'open', '#1a1210');
  if (pose === 'gasp') for (const dy of [0, 1.6]) dot(ctx, hx + 4, hy + 2.5 + dy, 1.4, '#c0a8a0');
  if (pose === 'cheer') for (const k of [-1, 1]) ink(ctx, [[hx - 2 + k, hy + 6], [hx + k * 4, hy - 6]], 1.2, { closed: false, seed: 245 + k, taper: false, color: '#8a7a6c' });
  ctx.restore();
}
export function drawBadger(ctx, x, y, s, face, st = {}) {
  const sh = lightSh(face), cheer = st.pose === 'cheer' ? 1 : 0;
  if (st.shadow !== false) groundShadow(ctx, x, y, 30 * s, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
  if (cheer) {
    cel(ctx, ell(0, -24, 14, 22, 250, 0.3), '#8d8a86', sh, 1.2, 250); fillP(ctx, ell(3, -18, 7, 13, 251, 0.2), '#3a3634');
    for (const k of [-1, 1]) cel(ctx, limb(k * 6, -34, k * 14 + 4, -56, 3.6, 3, 1.5, 252 + k), '#3a3634', sh, 1, 252 + k);
    for (const k of [-6, 6]) cel(ctx, ell(k, -1, 5, 2.6, 254 + k, 0.1), '#3a3634', sh, 0.9, 254 + k);
    badgerHead(ctx, 3, -52, sh, st.ex);
  } else {
    for (const lx of [-14, 12]) cel(ctx, limb(lx, -10, lx + 2, 0, 4.4, 4, 2, 256 + lx), '#3a3634', sh, 1, 256 + lx);
    const body = ell(0, -15, 26, 13, 258, 0.4); cel(ctx, body, '#8d8a86', sh, 1.2, 258);
    ctx.save(); path(ctx, body); ctx.clip(); for (let i = 0; i < 12; i++) ink(ctx, [[-20 + i * 3.5, -26], [-19 + i * 3.5, -20]], 0.6, { closed: false, seed: 259 + i, color: 'rgba(240,240,235,.5)' }); ctx.restore();
    badgerHead(ctx, 26, -18, sh, st.ex);
  }
  ctx.restore();
}
function badgerHead(ctx, hx, hy, sh, ex = {}) {
  ctx.save(); ctx.translate(hx, hy);
  const hd = rpoly([[-8, -8], [6, -7], [16, 0], [6, 6], [-8, 6]], 5, { seed: 270, jit: 0.3 }); cel(ctx, hd, '#f2efe8', sh, 1.1, 270);
  ctx.save(); path(ctx, hd); ctx.clip(); fillP(ctx, [[-9, -4], [14, -1.5], [14, 1.5], [-9, 2]], '#2e2a28'); ctx.restore(); ink(ctx, hd, 1.1, { seed: 270 });
  cel(ctx, ell(-6, -8, 3, 2.6, 271, 0.1), '#2e2a28', sh, 0.8, 271);
  dot(ctx, 16, 0, 1.8, '#1a1414'); eyeDraw(ctx, 4, -0.5, 1.2, 1.4, ex.eyes || 'open', '#f2efe8');
  ctx.restore();
}

// ───────────── Deer (soft, far away), birds, frog, beetle, butterfly ─────────────
export function drawDeer(ctx, x, y, s, face, st = {}) {
  const g = st.graze || 0, col = st.col || '#a8907a';
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s); ctx.globalAlpha = st.alpha ?? 0.75; ctx.fillStyle = col;
  for (const lx of [-22, -16, 18, 24]) ctx.fillRect(lx, -40, 3.4, 40);
  blob(ctx, 0, -50, 32, 14, 0, rng(280), 10);
  ctx.save(); ctx.translate(26, -56); ctx.rotate(0.35 + g * 1.5); ctx.fillRect(-4, -26, 9, 28); ctx.translate(0, -28); blob(ctx, 4, 0, 9, 5.5, 0.4, rng(281), 8);
  ctx.fillRect(-2, -10, 2.4, 8); ctx.fillRect(1, -11, 2.4, 9); ctx.restore();
  ctx.restore();
}
const WINGS = {
  up: [[-4, -4], [-1, -20], [6, -31], [13, -21], [8, -3]], mid: [[-4, -4], [6, -13], [24, -15], [14, -4], [6, 0]],
  down: [[-4, -2], [1, 9], [8, 22], [12, 8], [8, 0]], glide: [[-4, -4], [4, -11], [26, -11], [14, -2]], fold: [[-7, -3], [13, -3], [19, 2], [3, 3]],
};
export function drawBird(ctx, x, y, s, face, pose = 'fold', col = '#5e4636') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
  const f = (P, c, w, sd) => { fillP(ctx, P, c); ink(ctx, P, w, { seed: sd }); };
  if (pose !== 'fold') { ctx.globalAlpha = 0.85; f(shift(WINGS[pose], 4, -2), darken(col, 0.7), 1.1, 9); ctx.globalAlpha = 1; }
  f([[9, -2], [25, -6], [26, 1], [10, 4]], darken(col, 0.85), 1.2, 4);
  if (pose === 'fold') for (const lx of [-3, 3]) ink(ctx, [[lx, 5], [lx - 1, 9]], 1.3, { closed: false, seed: lx + 20, taper: false });
  const body = ell(0, 0, 13, 7.5, 5, 0.3, -0.12); f(body, col, 1.3, 5);
  ctx.save(); path(ctx, body); ctx.clip(); ctx.fillStyle = '#d9b386'; ctx.beginPath(); ctx.ellipse(-3, 6, 12, 5, 0, 0, 7); ctx.fill(); ctx.restore();
  f(ell(-12, -5, 6, 5.5, 6, 0.3), col, 1.3, 6); f([[-17.2, -6.4], [-23, -4.6], [-17.2, -3.4]], '#e0ad5a', 0.9, 7);
  dot(ctx, -14, -6, 1.2, INK);
  f(WINGS[pose], darken(col, 0.8), 1.3, 8);
  ctx.restore();
}
export function drawFrog(ctx, x, y, s, face, st = {}) {
  const sh = lightSh(face), jump = st.jump || 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s); ctx.rotate(jump * 0.5);
  if (jump) cel(ctx, limb(-6, -4, -18, 4, 3, 2, 1, 290), '#5f8a34', sh, 0.9, 290);
  else cel(ctx, ell(-6, -3, 6, 3.4, 291, 0.1), '#5f8a34', sh, 0.9, 291);
  const body = ell(0, -6, 10, 6.4, 292, 0.2, -0.15); cel(ctx, body, '#6f9a3c', sh, 1.1, 292);
  for (const [px, py] of [[-3, -8], [2, -10], [-6, -5]]) dot(ctx, px, py, 1.2, '#4a6a2a');
  fillP(ctx, ell(4, -3, 6, 2.4, 293, 0.1), '#d8d8a0');
  cel(ctx, ell(6, -12, 3.4, 3.2, 294, 0.1), '#6f9a3c', sh, 1, 294); dot(ctx, 6.6, -12.4, 1.8, '#1a1a10'); dot(ctx, 7.2, -13, 0.6, '#fff');
  ink(ctx, [[8, -4], [12, -5.4]], 0.7, { closed: false, seed: 295 });
  ctx.restore();
}
export function drawBeetle(ctx, x, y, s, face, ph) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
  for (let i = 0; i < 3; i++) { const o = Math.sin(ph * Math.PI * 2 + i * 2) * 1.2; ink(ctx, [[-2 + i * 2, -1.5], [-3 + i * 2.4 + o, 0.5]], 0.6, { closed: false, seed: 300 + i, taper: false }); }
  const b = ell(0, -2.6, 4.2, 2.6, 303, 0.1); fillP(ctx, b, '#2e3a5a'); ink(ctx, b, 0.6, { seed: 303 });
  dot(ctx, 4.2, -2.4, 1.4, '#1a1a24'); dot(ctx, -0.8, -3.6, 0.8, 'rgba(160,200,255,.7)');
  ctx.restore();
}
export function drawButterfly(ctx, x, y, s, t, col = '#f2b24a') {
  const f = Math.abs(Math.sin(t * 16));
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  for (const k of [-1, 1]) { ctx.save(); ctx.scale(k * (0.25 + 0.75 * f), 1); fillP(ctx, ell(5, -3, 5, 4, 310, 0.1, -0.4), col); fillP(ctx, ell(4, 3, 3.4, 2.6, 311, 0.1, 0.4), darken(col, 0.8)); ctx.restore(); }
  ink(ctx, [[0, -4], [0, 4]], 0.8, { closed: false, seed: 312, taper: false });
  ctx.restore();
}
