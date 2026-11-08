// "Paper Boat" (12 s, two shots). Afternoon in a park. Kids run and jump up and down a grassy hill.
// Shot 1 (wide): a kid crouched at the pond's edge sets a paper boat on the water.
// Shot 2 (closer): a duck paddles over and nudges the boat across the pond; the kid jumps up, laughs and waves.
import {
  rng, clamp, lerp, smooth, easeInOut, pick, canvas, poly, path, shift,
  ell, arcPts, rpoly, limb, quad, ink, blob, clump,
} from '../core/lib.mjs';

export const duration = 12;
const WW = 2880, WH = 1620, MG = 120;          // world size (shot 1 shows all of it, shot 2 a 1:1 crop)
const CUT = 5;
const TWOS = t => Math.floor(t * 12) / 12;
const LIGHT = [-0.6, -0.75];                    // sun at the upper left
const POND = { cx: 1750, cy: 1180, rx: 1050, ry: 230 };
const inPond = (x, y, k = 1) => ((x - POND.cx) / POND.rx) ** 2 + ((y - POND.cy) / POND.ry) ** 2 < k;
const hillY = x => 905 - 270 * Math.exp(-(((x - 1700) / 520) ** 2));
let L = {};

const layer = () => { const [c, x] = canvas(WW + 2 * MG, WH + 2 * MG); x.translate(MG, MG); return [c, x]; };
const BIG = [-MG, -MG, WW + 2 * MG, WH + 2 * MG];
const darken = (hex, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');

// ───────────────────────── painted backgrounds ─────────────────────────

function paintSky() {
  const [c, x] = layer(), r = rng(12);
  const g = x.createLinearGradient(0, -MG, 0, 900);
  [[0, '#4f8fcb'], [0.45, '#86bde3'], [0.8, '#c6e2ee'], [1, '#e9f1e6']].forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(...BIG);
  // big summer cumulus, lit from the upper left, lavender undersides
  for (const [cx, cy, w, h] of [[700, 260, 900, 330], [1900, 170, 1100, 300], [2650, 330, 600, 240], [1250, 470, 700, 160], [150, 470, 500, 160]]) {
    clump(x, cx, cy, w, h, ['#aeb6d2', '#c4cbe0', '#dde2ee', '#f3f5f8', '#ffffff', '#fffbef'], Math.round(w / 3), r, { size: 0.09, light: LIGHT });
  }
  return c;
}

function bigTree(x, r, tx, base, cw, ch) {
  const trunk = rpoly([[tx - 26, base], [tx - 16, base - ch * 0.55], [tx + 14, base - ch * 0.55], [tx + 30, base]], 10, { seed: tx, jit: 3 });
  x.fillStyle = '#6a5240'; path(x, trunk); x.fill();
  x.save(); path(x, trunk); x.clip(); x.fillStyle = 'rgba(40,30,30,.35)'; x.fillRect(tx, base - ch, 40, ch); x.restore();
  clump(x, tx, base - ch * 0.75, cw, ch * 0.75, ['#2f5a36', '#3d6d3d', '#4f8344', '#6c9c4c', '#9cbb5e', '#c8d47a'], Math.round(cw / 2.2), r, { size: 0.09, light: LIGHT });
}

function paintFar() {
  const [c, x] = layer(), r = rng(22);
  // distant tree line behind the hill
  for (let px = -MG; px < WW + MG; px += 40 + r() * 40) {
    const h = 120 + r() * 140;
    clump(x, px, 770 - h * 0.35, 120 + r() * 90, h, ['#6f9a86', '#7fa88e', '#93b795', '#b3cba0', '#d2dcb0'], 34, r, { size: 0.15, light: LIGHT });
  }
  // lawn
  const gnd = x.createLinearGradient(0, 760, 0, WH + MG);
  gnd.addColorStop(0, '#9cc766'); gnd.addColorStop(0.4, '#82b456'); gnd.addColorStop(1, '#5e9444');
  x.fillStyle = gnd; x.beginPath(); x.moveTo(-MG, 790);
  for (let px = -MG; px <= WW + MG; px += 40) x.lineTo(px, 778 + Math.sin(px * 0.006) * 10 + r() * 4);
  x.lineTo(WW + MG, WH + MG); x.lineTo(-MG, WH + MG); x.fill();
  // the hill the kids play on
  const hill = [[700, 940]]; for (let px = 700; px <= 2700; px += 20) hill.push([px, hillY(px)]); hill.push([2700, 940]);
  const hg = x.createLinearGradient(0, 630, 0, 940); hg.addColorStop(0, '#b4d872'); hg.addColorStop(1, '#86b958');
  x.fillStyle = hg; path(x, hill); x.fill();
  x.save(); path(x, hill); x.clip();
  x.fillStyle = 'rgba(70,110,60,.25)'; x.beginPath(); x.moveTo(1700, 600); for (let px = 1700; px <= 2700; px += 20) x.lineTo(px, hillY(px) + 8); x.lineTo(2700, 950); x.lineTo(1900, 950); x.fill();
  x.restore();
  // painted grass texture and flowers over the whole lawn
  for (let i = 0; i < 4200; i++) {
    const px = -MG + r() * (WW + 2 * MG), py = 640 + r() * (WH + MG - 640);
    if (py < hillY(px) - 2 && py < 790) continue;
    const k = 0.6 + (py / WH) * 0.9;
    x.fillStyle = pick(r, ['#8dbd5c', '#a6cd6c', '#74a64e', '#c2da82', '#689a47']);
    blob(x, px, py, (4 + r() * 9) * k, (1.5 + r() * 2.5) * k, (r() - 0.5) * 0.4, r, 6);
  }
  for (let i = 0; i < 260; i++) {
    const px = -MG + r() * (WW + 2 * MG), py = 700 + r() * (WH - 700);
    if (py < hillY(px)) continue;
    x.fillStyle = pick(r, ['#fbf7ee', '#f6e27a', '#f3b8c8']); x.beginPath(); x.arc(px, py, 2 + r() * 2.2, 0, 7); x.fill();
  }
  // gravel path between hill and pond
  const pth = quad([-MG, 960], [1300, 880], [WW + MG, 935], 60), pw = 26;
  x.fillStyle = '#d9c99c'; x.beginPath(); poly(x, [...pth.map(p => [p[0], p[1] - pw]), ...pth.reverse().map(p => [p[0], p[1] + pw])]); x.fill();
  for (let i = 0; i < 500; i++) { const p = pth[Math.floor(r() * pth.length)]; x.fillStyle = pick(r, ['#c7b688', '#e8dbb4', '#bba977']); blob(x, p[0] + (r() - 0.5) * 60, p[1] + (r() - 0.5) * pw * 1.6, 3 + r() * 5, 1.2 + r() * 1.5, 0, r, 6); }
  // bench and lamp post
  x.fillStyle = '#3f4a3c'; for (const lx of [2290, 2410]) x.fillRect(lx, 870, 7, 34);
  x.fillStyle = '#9a6b45'; for (const [yy, hh] of [[866, 9], [879, 7], [846, 7], [834, 7]]) x.fillRect(2275, yy, 150, hh);
  x.fillStyle = 'rgba(60,40,30,.3)'; x.fillRect(2275, 873, 150, 4);
  x.fillStyle = '#34443a'; x.fillRect(556, 680, 9, 260); x.fillRect(548, 936, 25, 8);
  x.fillStyle = '#2c3a33'; path(x, [[540, 690], [580, 690], [572, 650], [548, 650]]); x.fill();
  x.fillStyle = '#f4e6b4'; x.fillRect(551, 656, 18, 28);
  // big trees framing both sides
  bigTree(x, r, 200, 990, 760, 620); bigTree(x, r, 2720, 960, 620, 540);
  return c;
}

function paintWater() {
  const [c, x] = layer(), r = rng(32), P = ell(POND.cx, POND.cy, POND.rx, POND.ry, 3, 20);
  L.pondPts = P;
  x.save(); path(x, P); x.clip();
  const g = x.createLinearGradient(0, 950, 0, 1410);
  g.addColorStop(0, '#b4dbe2'); g.addColorStop(0.45, '#79b3c4'); g.addColorStop(1, '#3f7f92');
  x.fillStyle = g; x.fillRect(...BIG);
  // soft reflection of the hill, trees and sky, mirrored at the far bank
  x.save(); x.globalAlpha = 0.38; x.filter = 'blur(5px)'; x.translate(0, 2 * 950); x.scale(1, -1);
  x.drawImage(L.sky, -MG, -MG); x.drawImage(L.far, -MG, -MG); x.restore();
  const tint = x.createLinearGradient(0, 950, 0, 1410); tint.addColorStop(0, 'rgba(150,200,215,.15)'); tint.addColorStop(1, 'rgba(40,100,120,.55)');
  x.fillStyle = tint; x.fillRect(...BIG);
  // painted ripple strokes
  for (let i = 0; i < 420; i++) {
    const px = POND.cx + (r() - 0.5) * POND.rx * 2, py = 950 + r() * 460; if (!inPond(px, py, 0.96)) continue;
    x.fillStyle = r() < 0.5 ? 'rgba(230,245,248,.35)' : 'rgba(40,90,105,.3)';
    blob(x, px, py, 8 + r() * 30, 1 + r() * 1.6, 0, r, 6);
  }
  // darker water along the banks
  x.filter = 'blur(10px)'; x.strokeStyle = 'rgba(30,70,70,.45)'; x.lineWidth = 34; path(x, P); x.stroke(); x.filter = 'none';
  // lily pads at the far right
  for (let i = 0; i < 14; i++) {
    const px = 2350 + r() * 330, py = 1060 + r() * 200; if (!inPond(px, py, 0.85)) continue;
    const s = 14 + r() * 12;
    x.fillStyle = pick(r, ['#4f8a46', '#5f9a4e', '#6fa756']); x.beginPath(); x.ellipse(px, py, s, s * 0.32, 0, 0.3, Math.PI * 2 - 0.05); x.lineTo(px, py); x.fill();
    if (r() < 0.3) { x.fillStyle = '#f7d6e2'; x.beginPath(); x.arc(px - 2, py - 4, 4, 0, 7); x.fill(); }
  }
  x.restore();
  return c;
}

function reeds(x, r, cx, cy, n, spread) {
  for (let i = 0; i < n; i++) {
    const bx = cx + (r() - 0.5) * spread, by = cy + r() * 30, h = 50 + r() * 110;
    const pts = quad([bx, by], [bx + (r() - 0.5) * 20, by - h * 0.6], [bx + (r() - 0.5) * 40, by - h], 14);
    ink(x, pts, 4 + r() * 3, { closed: false, color: pick(r, ['#3f6b3a', '#4f7d42', '#5f8c48', '#6f9a4e']), seed: i + cx });
    if (r() < 0.25) { const tp = pts[pts.length - 4]; x.fillStyle = '#6b4a32'; x.beginPath(); x.ellipse(tp[0], tp[1], 4, 13, 0.1, 0, 7); x.fill(); }
  }
}

function paintBank() {
  const [c, x] = layer(), r = rng(42), P = L.pondPts;
  // grass tufts and stones overhanging the rim
  for (let i = 0; i < P.length; i += 2) {
    const [px, py] = P[i], near = py > POND.cy ? 1 : 0.6;
    x.fillStyle = pick(r, ['#5f9444', '#6fa44c', '#82b456', '#4f8040']);
    blob(x, px + (r() - 0.5) * 10, py + (py > POND.cy ? 4 : -2), (8 + r() * 14) * near, (3 + r() * 4) * near, 0, r, 6);
    if (r() < 0.06) { x.fillStyle = pick(r, ['#9a9a8c', '#b4b2a2']); blob(x, px, py + 3, 10 * near, 6 * near, 0, r, 7); }
  }
  reeds(x, r, 735, 1215, 26, 80); reeds(x, r, 680, 1150, 16, 70); reeds(x, r, 2760, 1150, 22, 90);
  return c;
}

function paintFG() {
  const [c, x] = layer(), r = rng(52);
  for (let i = 0; i < 380; i++) {
    const px = -MG + r() * (WW + 2 * MG), y0 = WH + 20 - 120 * Math.exp(-(((px + MG) / 360) ** 2)) - 120 * Math.exp(-(((WW + MG - px) / 360) ** 2));
    const len = 30 + r() * 80, pts = quad([px, y0 + 30], [px + (r() - 0.5) * 30, y0 - len * 0.5], [px + (r() - 0.5) * 50, y0 - len], 12);
    ink(x, pts, 6, { closed: false, color: pick(r, ['#3f6e35', '#4a7d3c', '#356030', '#5b8c45']), seed: 2000 + i });
  }
  return c;
}

// ───────────────────────── characters ─────────────────────────

const SHADE = '#c3b8dc';
function cel(ctx, P, col, sh, w = 1.15, seed = 1) {
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(-500, -500, 1000, 1000);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = SHADE;
  ctx.beginPath(); ctx.rect(-500, -500, 1000, 1000); poly(ctx, shift(P, sh[0], sh[1])); ctx.fill('evenodd');
  ctx.restore();
  ink(ctx, P, w, { seed });
}

const dirv = a => [Math.sin(a), Math.cos(a)];        // angle measured from straight down, + = forward
const at = (o, a, l) => { const d = dirv(a); return [o[0] + d[0] * l, o[1] + d[1] * l]; };
function joints(p) {
  const hip = [0, 0], up = [Math.sin(p.lean), -Math.cos(p.lean)];
  const sh = [up[0] * 24, up[1] * 24], neck = [up[0] * 27, up[1] * 27], ha = p.lean + p.tilt;
  const head = [neck[0] + Math.sin(ha) * 15, neck[1] - Math.cos(ha) * 15];
  const leg = (h, k) => { const knee = at(hip, h, 20); return { knee, foot: at(knee, h - k, 20) }; };
  const arm = (s, e) => { const el = at(sh, s, 15); return { el, hand: at(el, s + e, 14) }; };
  return { hip, sh, neck, head, ha, lf: leg(p.hipF, p.kneeF), lb: leg(p.hipB, p.kneeB), af: arm(p.shF, p.elF), ab: arm(p.shB, p.elB) };
}

function drawLeg(ctx, J, lk, back, sh, seed) {
  const f = back ? 0.86 : 1, skin = darken(lk.skin, f);
  cel(ctx, limb(...J.knee, ...J.foot, 4.3, 3.6, 2, seed), skin, sh, 1.1, seed);
  cel(ctx, limb(0, 0, ...J.knee, 5, 4.4, 2.5, seed + 1), skin, sh, 1.1, seed + 1);
  if (!lk.dress) { const m = [J.knee[0] * 0.6, J.knee[1] * 0.6]; cel(ctx, limb(0, 0, ...m, 6.4, 6, 2.5, seed + 2), darken(lk.shorts, f), sh, 1.1, seed + 2); }
  cel(ctx, ell(J.foot[0] + 3, J.foot[1] + 0.5, 6, 3.4, seed + 3, 0.2), darken(lk.shoes, f), sh, 1.1, seed + 3);
}
function drawArm(ctx, J, A, lk, back, sh, seed) {
  const f = back ? 0.86 : 1;
  cel(ctx, limb(...A.el, ...A.hand, 3.2, 2.8, 1.6, seed), darken(lk.skin, f), sh, 1, seed);
  cel(ctx, ell(A.hand[0], A.hand[1], 3.3, 3.3, seed + 1, 0.15), darken(lk.skin, f), sh, 1, seed + 1);
  cel(ctx, limb(...J.sh, ...A.el, 3.8, 3.3, 1.8, seed + 2), darken(lk.skin, f), sh, 1, seed + 2);
  const m = [lerp(J.sh[0], A.el[0], 0.55), lerp(J.sh[1], A.el[1], 0.55)];
  cel(ctx, limb(...J.sh, ...m, 4.5, 4.2, 2, seed + 3), darken(lk.shirt, f), sh, 1, seed + 3);
}
function drawHead(ctx, J, lk, face, sh) {
  ctx.save(); ctx.translate(...J.head); ctx.rotate(J.ha * 0.6);
  if (lk.ponytail) cel(ctx, ell(-15, 3, 5, 8.5, 41, 0.3, 0.4), lk.hair, sh, 1.1, 41);
  cel(ctx, ell(-1.5, -1, 15.5, 15, 42, 0.4), lk.hair, sh, 1.1, 42);
  cel(ctx, ell(1.2, 1.2, 13.2, 12.6, 43, 0.3), lk.skin, sh, 1.1, 43);
  cel(ctx, ell(-5, 2.5, 3, 3.8, 44, 0.2), lk.skin, sh, 0.9, 44);
  const fringe = [...arcPts(-1, -1, 15.4, 15, Math.PI * 1.05, Math.PI * 1.93, 2), [11, -4], [8.5, -7], [6, -3], [3, -6.5], [0.5, -2.5], [-3, -5.5], [-6, -1.5], [-11, 0]];
  cel(ctx, fringe, lk.hair, sh, 1.1, 45);
  // face: big anime eyes, blush, mouth
  ctx.fillStyle = 'rgba(240,130,130,.45)'; ctx.beginPath(); ctx.ellipse(7.5, 6, 2.6, 1.4, 0, 0, 7); ctx.fill();
  for (const [ex, rx] of [[8.5, 1.9], [2.2, 1.5]]) {
    if (face.eyes === 'open') {
      ctx.fillStyle = '#2a1e22'; ctx.beginPath(); ctx.ellipse(ex, 1, rx, 2.9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 0.5, -0.2, 0.75, 0, 7); ctx.fill();
    } else {
      const up = face.eyes === 'happy' ? -1 : 1;
      ink(ctx, [[ex - rx - 0.6, 1], [ex, 1 + up * 1.4], [ex + rx + 0.6, 1]], 0.9, { closed: false, seed: ex, taper: false });
    }
    ink(ctx, [[ex - 1.8, -3.6], [ex, -4.3], [ex + 1.8, -3.9]], 0.6, { closed: false, seed: ex + 5 });
  }
  if (face.mouth === 'open') { ctx.fillStyle = '#8b2f3b'; path(ctx, [[5.6, 6.4], [11, 6.2], [9.8, 9.6], [7, 9.8]]); ctx.fill(); ink(ctx, [[5.6, 6.4], [11, 6.2], [9.8, 9.6], [7, 9.8]], 0.7, { seed: 9 }); }
  else if (face.mouth === 'o') { ctx.fillStyle = '#8b2f3b'; ctx.beginPath(); ctx.ellipse(8.3, 7.6, 1.4, 1.8, 0, 0, 7); ctx.fill(); }
  else ink(ctx, [[6.2, 6.8], [8.2, 8], [10.2, 6.6]], 0.75, { closed: false, seed: 8 });
  if (lk.hat) {
    cel(ctx, ell(1.5, -5, 19, 4.8, 46, 0.3, -0.08), darken(lk.hat, 0.92), sh, 1.1, 46);
    cel(ctx, [...arcPts(0, -6, 13.5, 11, Math.PI, Math.PI * 2, 2), [13.5, -4], [-13.5, -4]], lk.hat, sh, 1.1, 47);
  }
  ctx.restore();
}

// Draws a kid with feet at (x, y). Returns the front hand's position in world space.
function drawKid(ctx, x, y, s, face, p, lk, expr) {
  const J = joints(p), g = Math.max(J.lf.foot[1], J.lb.foot[1]) + 3.4, lift = p.lift || 0, sh = [-2 * face, -2];
  ctx.save(); ctx.fillStyle = 'rgba(40,70,30,.28)'; ctx.beginPath(); ctx.ellipse(x + 6 * s * face, y + 1, 20 * s * (1 - lift / 80), 4.5 * s, 0, 0, 7); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s); ctx.translate(0, -g - lift);
  drawArm(ctx, J, J.ab, lk, true, sh, 10);
  drawLeg(ctx, J.lb, lk, true, sh, 20);
  const n = [Math.cos(p.lean), Math.sin(p.lean)], top = J.neck;
  const torso = rpoly([[-n[0] * 9, -n[1] * 9 + 3], [n[0] * 9, n[1] * 9 + 3], [top[0] + n[0] * 7, top[1] + n[1] * 7], [top[0] - n[0] * 7, top[1] - n[1] * 7]], 4, { seed: 30, jit: 0.3 });
  if (lk.dress) cel(ctx, rpoly([[-11, 12], [13, 12], [8, -6], [-7, -6]], 3, { seed: 31, jit: 0.3 }), lk.shirt, sh, 1.1, 31);
  else cel(ctx, ell(0, 1, 8.5, 6, 32, 0.2), lk.shorts, sh, 1.1, 32);
  cel(ctx, torso, lk.shirt, sh, 1.15, 30);
  drawLeg(ctx, J.lf, lk, false, sh, 40);
  drawHead(ctx, J, lk, expr, sh);
  drawArm(ctx, J, J.af, lk, false, sh, 50);
  ctx.restore();
  return [x + J.af.hand[0] * s * face, y + (J.af.hand[1] - g - lift) * s];
}

const POSES = {
  hold: { lean: 0.35, tilt: 0.3, hipF: 1.95, kneeF: 2.35, hipB: 1.55, kneeB: 2.45, shF: 1.05, elF: 0.35, shB: 0.95, elB: 0.45 },
  reach: { lean: 0.6, tilt: 0.45, hipF: 1.95, kneeF: 2.35, hipB: 1.55, kneeB: 2.45, shF: 0.55, elF: 0.15, shB: 0.5, elB: 0.2 },
  watch: { lean: 0.3, tilt: 0.15, hipF: 1.9, kneeF: 2.3, hipB: 1.5, kneeB: 2.4, shF: 0.7, elF: 0.9, shB: 0.6, elB: 0.9 },
  surprise: { lean: 0.08, tilt: -0.15, hipF: 1.9, kneeF: 2.3, hipB: 1.5, kneeB: 2.4, shF: 1.2, elF: 1.2, shB: 1.0, elB: 1.1 },
  anticip: { lean: 0.55, tilt: 0.1, hipF: 2.1, kneeF: 2.6, hipB: 1.7, kneeB: 2.7, shF: -0.3, elF: 0.2, shB: -0.4, elB: 0.2 },
  stand: { lean: 0.02, tilt: -0.1, hipF: 0.12, kneeF: 0.1, hipB: -0.12, kneeB: 0.15, shF: -0.25, elF: 0.35, shB: -0.35, elB: 0.3 },
  wave: { lean: -0.04, tilt: -0.22, hipF: 0.12, kneeF: 0.1, hipB: -0.12, kneeB: 0.15, shF: 2.1, elF: 0.6, shB: -0.4, elB: 0.35 },
};
const KEYS = [[0, 'hold'], [1.3, 'hold'], [1.9, 'reach'], [2.4, 'reach'], [3.0, 'watch'], [7.45, 'watch'], [7.6, 'surprise'], [8.0, 'surprise'], [8.2, 'anticip'], [8.6, 'stand'], [8.9, 'wave'], [99, 'wave']];
function heroPose(t) {
  let i = 0; while (KEYS[i + 1][0] <= t) i++;
  const [t0, a] = KEYS[i], [t1, b] = KEYS[i + 1], u = easeInOut((t - t0) / (t1 - t0)), p = {};
  for (const k in POSES[a]) p[k] = lerp(POSES[a][k], POSES[b][k], u);
  if (t > 8.9) { const w = Math.sin((t - 8.9) * Math.PI * 2 * 2.2); p.elF += 0.45 * w; p.shF += 0.1 * w; }
  if (t > 10 && t < 10.45) { const h = Math.sin(Math.PI * (t - 10) / 0.45); p.lift = 22 * h; p.hipF += 0.6 * h; p.kneeF += 1.0 * h; p.hipB += 0.5 * h; p.kneeB += 0.9 * h; }
  return p;
}
function heroFace(t) {
  const blink = (t > 3.6 && t < 3.75) || (t > 9.55 && t < 9.7);
  const happy = (t > 9.0 && t < 9.45) || (t > 10 && t < 10.5);
  return { eyes: happy ? 'happy' : blink ? 'closed' : 'open', mouth: t < 7.5 ? 'smile' : t < 8.2 ? 'o' : 'open' };
}

function runPose(ph) {
  const a = Math.PI * 2 * ph, s = Math.sin(a);
  return { lean: 0.25, tilt: -0.12, hipF: 0.85 * s, kneeF: 0.25 + 1.1 * Math.max(0, Math.sin(a + 1.9)), hipB: -0.85 * s, kneeB: 0.25 + 1.1 * Math.max(0, Math.sin(a + Math.PI + 1.9)), shF: -0.9 * s, elF: 1.4, shB: 0.9 * s, elB: 1.4, lift: 5 * Math.abs(s) };
}
function jumpPose(u) {
  if (u < 0.22 || u > 0.86) { const k = u < 0.22 ? 1 - u / 0.22 : (u - 0.86) / 0.14; return { lean: 0.15 * k, tilt: 0, hipF: 0.2 + 0.9 * k, kneeF: 0.2 + 1.6 * k, hipB: 0.1 + 0.8 * k, kneeB: 0.2 + 1.6 * k, shF: -0.5, elF: 0.4, shB: -0.6, elB: 0.4, lift: 0 }; }
  const v = (u - 0.22) / 0.64;
  return { lean: -0.05, tilt: -0.25, hipF: 0.35, kneeF: 0.7, hipB: 0.1, kneeB: 0.8, shF: 2.8, elF: 0.2, shB: 2.6, elB: 0.25, lift: 46 * Math.sin(Math.PI * v) };
}
const KIDS = [
  { lk: { skin: '#e8b894', hair: '#1f1a1a', shirt: '#4f8fd6', shorts: '#e8dcc0', shoes: '#3a3a48' }, off: 0 },
  { lk: { skin: '#f2cfb4', hair: '#7a4a2a', shirt: '#6fb38a', shoes: '#c0504a', dress: true, ponytail: true }, off: -190 },
  { lk: { skin: '#c98f6a', hair: '#151212', shirt: '#f0a5c0', shorts: '#4a4a5e', shoes: '#f4f1e6' }, jump: true },
];
const HERO = { skin: '#f6d2b8', hair: '#3a2a26', shirt: '#e0553f', shorts: '#2f4d7a', shoes: '#f5f1e6', hat: '#f2c94c' };

function playKids(ctx, t) {
  const tq = TWOS(t);
  for (const k of KIDS) {
    if (k.jump) {
      const u = ((tq + 0.3) % 0.8) / 0.8, x = 1985;
      drawKid(ctx, x, hillY(x) + 4, 0.9, -1, jumpPose(u), k.lk, { eyes: u > 0.3 && u < 0.8 ? 'happy' : 'open', mouth: 'open' });
      continue;
    }
    const span = 1000, d = ((tq * 235 + k.off) % (2 * span) + 2 * span) % (2 * span);
    const x = 1150 + (d < span ? d : 2 * span - d), face = d < span ? 1 : -1;
    drawKid(ctx, x, hillY(x) + 4, 0.9, face, runPose(((tq + k.off / 300) * 2.3) % 1 + 1), k.lk, { eyes: 'open', mouth: 'open' });
  }
}

// paper boat and duck, both drawn side-on with the waterline at y = 0
function boat(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.save(); ctx.globalAlpha = 0.28; ctx.scale(1, -0.6); ctx.fillStyle = '#e6eef0'; path(ctx, [[-20, -8], [20, -8], [13, 2], [-13, 2]]); ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-40, -60, 80, 61); ctx.clip();
  const sh = [-1.6, -1.6];
  cel(ctx, [[-11, -8], [0, -27], [11, -8]], '#f7f4ec', sh, 1.1, 61);
  cel(ctx, [[-21, -9], [21, -9], [13, 2], [-13, 2]], '#efebe2', sh, 1.2, 62);
  ink(ctx, [[0, -26], [0, -9]], 0.7, { closed: false, seed: 63 });
  ink(ctx, [[-17, -6], [17, -6]], 0.6, { closed: false, seed: 64 });
  ctx.restore();
  ctx.strokeStyle = 'rgba(240,250,250,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 1.5, 17, 2.2, 0, 0, Math.PI); ctx.stroke();
  ctx.restore();
}
function duck(ctx, x, y, s, dip, bob) {
  ctx.save(); ctx.translate(x, y + bob); ctx.scale(s, s);
  ctx.save(); ctx.globalAlpha = 0.25; ctx.scale(1, -0.55); ctx.fillStyle = '#5a6a5a'; path(ctx, ell(0, -7, 20, 9, 70, 0.2)); ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-60, -80, 120, 81); ctx.clip();
  const sh = [-1.5, -1.5];
  cel(ctx, [[-17, -10], [-27, -17], [-23, -9], [-15, -4]], '#2a2a2c', sh, 1, 71);
  cel(ctx, ell(0, -6, 20, 9.5, 72, 0.3), '#c4bfb2', sh, 1.2, 72);
  cel(ctx, ell(12, -8, 8, 8, 73, 0.2), '#7a4a35', sh, 1, 73);
  cel(ctx, [[-14, -10], [8, -12], [6, -5], [-12, -4]], '#8f877a', sh, 1, 74);
  ctx.fillStyle = '#3b5ba8'; path(ctx, [[-8, -7], [0, -8], [-1, -5.5], [-8, -5]]); ctx.fill();
  const hx = 16 + dip * 5, hy = -24 + dip * 10;
  cel(ctx, limb(12, -12, hx - 1, hy + 4, 5.5, 4.8, 2, 75), '#2f6b4a', sh, 1, 75);
  ctx.fillStyle = '#f4f1e6'; ctx.fillRect(10, -14, 8, 2);
  cel(ctx, ell(hx, hy, 7.5, 7, 76, 0.2), '#2f6b4a', sh, 1, 76);
  cel(ctx, [[hx + 6, hy - 1], [hx + 15, hy + 0.5 + dip * 2], [hx + 14, hy + 3 + dip * 2], [hx + 6, hy + 3]], '#e8b440', sh, 0.8, 77);
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(hx + 2.5, hy - 1.5, 1.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + 2.9, hy - 1.9, 0.45, 0, 7); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ───────────────────────── story timing ─────────────────────────

const REL = 2.25, NUDGE = 7.5, WS = [872, 1296];
const persp = y => lerp(1, 0.82, clamp((WS[1] - y) / 160));
function boatState(t, hand) {
  const bob = Math.sin(t * 3.1) * 1.4, rot = 0.06 * Math.sin(t * 2.3);
  if (t < REL - 0.3) return { x: hand[0] + 8, y: hand[1] + 6, rot: 0.05, s: 1.25, held: true };
  if (t < REL) { const u = easeInOut((t - (REL - 0.3)) / 0.3); return { x: lerp(hand[0] + 8, WS[0], u), y: lerp(hand[1] + 6, WS[1], u), rot: 0.05 * (1 - u), s: 1.25 }; }
  const drift = Math.min(t, NUDGE) - REL, u = Math.max(0, t - NUDGE);
  const push = 150 * (u - 0.3 * (1 - Math.exp(-u / 0.3)));
  const x = WS[0] + 9 * drift + push * 0.98, y = WS[1] - push * 0.2;
  const jolt = u > 0 && u < 0.5 ? 0.18 * Math.sin(u * 12) * (1 - u / 0.5) : 0;
  return { x, y: y + bob, rot: rot + jolt, s: 1.25 * persp(y) };
}
function duckState(t, b) {
  if (t < 5.6) return null;
  const tgt = [b.x - 58 * persp(b.y), b.y - 2];
  if (t < 7.35) { const u = easeInOut((t - 5.6) / 1.75); return { x: lerp(700, tgt[0], u), y: lerp(1218, tgt[1], u), dip: 0, moving: true }; }
  const dip = t > NUDGE - 0.05 && t < NUDGE + 0.35 ? Math.sin(Math.PI * (t - NUDGE + 0.05) / 0.4) : 0;
  return { x: tgt[0], y: tgt[1], dip, moving: t > NUDGE };
}
function ripples(ctx, t, events) {
  ctx.save();
  for (const [t0, x, y] of events) for (let k = 0; k < 3; k++) {
    const age = t - t0 - k * 0.28; if (age <= 0 || age > 1.8) continue;
    const rx = 8 + 60 * age; ctx.strokeStyle = `rgba(240,250,252,${0.7 * (1 - age / 1.8)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + 2, rx, rx * 0.26, 0, 0, 7); ctx.stroke();
  }
  ctx.restore();
}
function wake(ctx, x, y, s, len) {
  ctx.save(); ctx.strokeStyle = 'rgba(235,248,250,.55)'; ctx.lineWidth = 1.8;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + 14 * s, y + 1); ctx.quadraticCurveTo(x - len * 0.5, y + side * 5 * s + 1, x - len, y + side * 12 * s + 1); ctx.stroke(); }
  ctx.restore();
}

const SHIMMER = Array.from({ length: 240 }, (_, i) => { const r = rng(900 + i); let x, y; do { x = POND.cx + (r() - 0.5) * POND.rx * 2; y = 960 + r() * 440; } while (!inPond(x, y, 0.92)); return { x, y, w: 6 + r() * 22, ph: r(), f: 0.4 + r() * 0.8 }; });

export function build() {
  L.sky = paintSky(); L.far = paintFar(); L.water = paintWater(); L.bank = paintBank(); L.fg = paintFG();
  L.grain = Array.from({ length: 4 }, (_, k) => {
    const [c, x] = canvas(960, 540), img = x.createImageData(960, 540), r = rng(800 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() - 0.5) * 150; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0); return c;
  });
}

function camera(t) {
  if (t < CUT) { const u = easeInOut(t / CUT); return { cx: 1440, cy: 818, s: lerp(0.667, 0.705, u) }; }
  const u = easeInOut((t - CUT) / (duration - CUT)); return { cx: lerp(1160, 1300, u), cy: lerp(1010, 1000, u), s: lerp(1.35, 1.4, u) };
}

export function frame(ctx, t) {
  const c = camera(t), tq = TWOS(t);
  ctx.setTransform(c.s, 0, 0, c.s, 960 - c.cx * c.s, 540 - c.cy * c.s);
  const img = cv => ctx.drawImage(cv, -MG, -MG);
  ctx.save(); ctx.translate(t * 5, 0); img(L.sky); ctx.restore();
  img(L.far);
  playKids(ctx, t);
  img(L.water);

  // water life: shimmer on twos, ripples, wakes
  ctx.save(); ctx.fillStyle = '#f6fcff';
  for (const s of SHIMMER) { const a = Math.max(0, Math.sin(Math.PI * 2 * (tq * s.f + s.ph))); if (a < 0.05) continue; ctx.globalAlpha = 0.55 * a; ctx.fillRect(s.x + Math.sin(tq + s.ph * 6) * 4, s.y, s.w * a, 1.6); }
  ctx.restore();

  const pose = heroPose(tq), hand = joints(pose);
  // hand position is needed before drawing the kid (boat may be held); compute it with a dry run
  const HX = 790, HY = 1312, HS = 1.9;
  const g = Math.max(hand.lf.foot[1], hand.lb.foot[1]) + 3.4;
  const handW = [HX + hand.af.hand[0] * HS, HY + (hand.af.hand[1] - g - (pose.lift || 0)) * HS];
  const b = boatState(tq, handW), d = duckState(tq, b);
  ripples(ctx, t, [[REL, WS[0], WS[1]], [NUDGE, b.x - 30, b.y], [5.7, 712, 1220]]);
  if (d && d.moving) wake(ctx, d.x, d.y, persp(d.y) * 1.5, 70);
  if (tq > NUDGE + 0.2) wake(ctx, b.x, b.y, b.s, 40);
  if (!b.held) boat(ctx, b.x, b.y, b.s, b.rot);
  if (d) duck(ctx, d.x, d.y, 1.5 * persp(d.y), d.dip, d.moving ? Math.sin(tq * 9) * 0.8 : Math.sin(tq * 3) * 0.6);
  img(L.bank);
  drawKid(ctx, HX, HY, HS, 1, pose, HERO, heroFace(tq));
  if (b.held) boat(ctx, b.x, b.y, b.s, b.rot);
  img(L.fg);

  // grade: warm afternoon, vignette, grain
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,200,130,.28)'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(960, 540, 420, 960, 540, 1300); v.addColorStop(0, 'rgba(30,30,50,0)'); v.addColorStop(1, 'rgba(30,30,50,.35)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, 1920, 1080);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.06; ctx.drawImage(L.grain[Math.floor(t * 12) % 4], 0, 0, 1920, 1080);
  ctx.restore();
}
