// The six painted locations. Each set defines its geometry (ground lines, perches, stump, stones…) once,
// at the top, and both the painting and the characters use that same data.
import { rng, clamp, lerp, smooth, pick, canvas, poly, path, ell, arcPts, rpoly, quad, ink, blob, clump } from '../core/lib.mjs';
import { makeSet } from './engine.mjs';
import { paper, foliage, trunk, branchTop, paintBranch, oak, grassField, flowers, blades, fern, rock, skyGradient, clouds, hillsRow, mistSprite } from '../paint/paint.mjs';

const LEFT = [-0.6, -0.75], RIGHT = [0.6, -0.7];
const GRASS = ['#8dbd5c', '#a6cd6c', '#74a64e', '#c2da82', '#689a47'];
const sky = {
  morning: (x, r, w, h) => { skyGradient(x, w, h, [[0, '#4f8bc6'], [0.42, '#86bce2'], [0.62, '#cfe5ee'], [1, '#eef3e4']]); clouds(x, r, w, 9, 120, 620, ['#aeb6d2', '#c4cbe0', '#dde2ee', '#f3f5f8', '#ffffff'], LEFT); },
  dawn: (x, r, w, h) => {
    skyGradient(x, w, h, [[0, '#3d5888'], [0.35, '#9d97bf'], [0.55, '#f2c2a2'], [0.7, '#ffe0ae'], [1, '#fff0cc']]);
    const g = x.createRadialGradient(w * 0.62, h * 0.66, 10, w * 0.62, h * 0.66, 900); g.addColorStop(0, 'rgba(255,248,220,1)'); g.addColorStop(0.2, 'rgba(255,230,180,.6)'); g.addColorStop(1, 'rgba(255,220,170,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    clouds(x, r, w, 8, 150, 640, ['#9a8fb4', '#b4a6c4', '#d8bcc4', '#f6cdb0', '#fde0bf'], [0.4, 0.8]);
  },
  night: (x, r, w, h) => {
    skyGradient(x, w, h, [[0, '#0a1230'], [0.5, '#1c2a55'], [0.8, '#34406e'], [1, '#4a4f78']]);
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,240,${0.3 + r() * 0.7})`; x.beginPath(); x.arc(r() * w, r() * h * 0.75, r() < 0.06 ? 1.8 : 0.9, 0, 7); x.fill(); }
    const mx = w * 0.3, my = h * 0.3, g = x.createRadialGradient(mx, my, 20, mx, my, 260); g.addColorStop(0, 'rgba(230,235,255,.45)'); g.addColorStop(1, 'rgba(200,210,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f4f1e0'; x.beginPath(); x.arc(mx, my, 42, 0, 7); x.fill(); x.fillStyle = 'rgba(200,195,175,.5)'; for (const [a, b, c] of [[-12, -8, 9], [10, 6, 7], [-4, 16, 6]]) { x.beginPath(); x.arc(mx + a, my + b, c, 0, 7); x.fill(); }
  },
  golden: (x, r, w, h) => {
    skyGradient(x, w, h, [[0, '#6f86b4'], [0.4, '#c9a6a4'], [0.6, '#f4b67a'], [0.75, '#ffd396'], [1, '#ffe7b8']]);
    const sx = w * 0.72, sy = h * 0.7, g = x.createRadialGradient(sx, sy, 10, sx, sy, 800); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.15, 'rgba(255,210,140,.75)'); g.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff3d2'; x.beginPath(); x.arc(sx, sy, 46, 0, 7); x.fill();
    clouds(x, r, w, 7, 150, 600, ['#a3849a', '#c49aa0', '#e6b4a0', '#f8cc9e', '#ffe0b4'], [0.6, 0.6]);
  },
  twilight: (x, r, w, h) => {
    skyGradient(x, w, h, [[0, '#141c40'], [0.4, '#3c3c6c'], [0.62, '#86607e'], [0.76, '#e08a6c'], [1, '#f2b484']]);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,240,${(0.2 + r() * 0.7) * (1 - 0)})`; x.beginPath(); x.arc(r() * w, r() * h * 0.45, r() < 0.06 ? 1.6 : 0.8, 0, 7); x.fill(); }
    const mx = w * 0.22, my = h * 0.42, g = x.createRadialGradient(mx, my, 20, mx, my, 240); g.addColorStop(0, 'rgba(240,235,255,.4)'); g.addColorStop(1, 'rgba(220,210,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f6f0dc'; x.beginPath(); x.arc(mx, my, 34, 0, 7); x.fill();
    clouds(x, r, w, 5, 300, 640, ['#4a3c64', '#6a4c70', '#9a5c70', '#c87070'], [0.6, 0.6]);
  },
};

// ═══════════════ A. The valley (opening, the course seen from afar, night) ═══════════════
export const LANDMARKS = { forest: [380, 1100], stream: 1380, tree: 1680, stone: 2260 };
export const valley = makeSet({
  name: 'valley', W: 2800, H: 1400, refX: 1400, refY: 760, pan: [600, 2200], horizon: 600, laneY: 1200, baseS: 1, defaultSky: 'dawn',
  skies: { dawn: sky.dawn, night: sky.night, morning: sky.morning },
  layers: [
    { k: 0.45, paint: (x, r) => {
      hillsRow(x, r, -600, 3400, px => 690 - 80 * Math.sin(px / 430) - 50 * Math.sin(px / 170 + 1), ['#a3aec8', '#adb7cf', '#9aa6c2'], null);
      hillsRow(x, r, -600, 3400, px => 760 - 50 * Math.sin(px / 300 + 2), ['#93a8b6', '#9db2bf', '#a9bcc6'], ['#7f96a6', '#8aa0ae', '#9aaeba'], 0.8, RIGHT);
      paper(x, 0.06);
    } },
    { k: 0.7, paint: (x, r) => {
      const yAt = px => 860 - 40 * Math.sin(px / 380) - (px > 1950 && px < 2600 ? 120 * Math.sin(Math.PI * (px - 1950) / 650) : 0);
      hillsRow(x, r, -400, 3200, yAt, ['#7f9e7e', '#8aa886', '#96b28e'], null);
      for (let px = -300; px < 1150; px += 26 + r() * 20) { const h = 70 + r() * 70; foliage(x, px, yAt(px) - h * 0.2, h * 0.8, h, ['#3f6450', '#4d7458', '#5f8560', '#7d9e70', '#a3b888'], r, { light: RIGHT, density: 0.5 }); }
      // the stream winding down through the meadows
      const S = [...quad([1330, yAt(1330) + 2], [1470, 900], [1390, 960], 20), ...quad([1390, 960], [1300, 1010], [1400, 1120], 20)];
      x.lineCap = 'round'; x.strokeStyle = '#8fb6c4'; x.lineWidth = 7; x.beginPath(); S.forEach(([a, b], i) => { x.lineWidth = 5 + i * 0.6; i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke();
      for (let i = 1; i < S.length; i++) { x.strokeStyle = i % 2 ? '#9fc4d0' : '#b9d6dc'; x.lineWidth = 4 + i * 0.7; x.beginPath(); x.moveTo(...S[i - 1]); x.lineTo(...S[i]); x.stroke(); }
      x.strokeStyle = 'rgba(245,250,240,.8)'; x.lineWidth = 2; x.beginPath(); S.forEach(([a, b], i) => i ? x.lineTo(a + 2, b - 1) : x.moveTo(a + 2, b - 1)); x.stroke();
      // the course: a pale path from the forest's edge, over the stream, past the tree, up to the stone
      x.setLineDash([10, 9]); x.strokeStyle = 'rgba(240,226,184,.85)'; x.lineWidth = 3.5; x.beginPath();
      for (let px = 1080; px <= LANDMARKS.stone - 14; px += 10) { const py = yAt(px) + 26 - 22 * smooth(1950, LANDMARKS.stone, px); px === 1080 ? x.moveTo(px, py) : x.lineTo(px, py); } x.stroke(); x.setLineDash([]);
      // the wayside tree and the hill with the goal stone
      const ty = yAt(LANDMARKS.tree); x.fillStyle = '#4a3a30'; x.fillRect(LANDMARKS.tree - 5, ty - 46, 10, 50);
      foliage(x, LANDMARKS.tree, ty - 64, 110, 60, ['#3a5a40', '#46694a', '#567a52', '#7a9a62', '#a0b47a'], r, { light: RIGHT, density: 0.8 });
      const sy = yAt(LANDMARKS.stone); x.fillStyle = '#8a8478'; path(x, rpoly([[LANDMARKS.stone - 9, sy + 2], [LANDMARKS.stone - 8, sy - 38], [LANDMARKS.stone + 3, sy - 44], [LANDMARKS.stone + 10, sy - 34], [LANDMARKS.stone + 9, sy + 2]], 3, { seed: 43, jit: 0.4 })); x.fill();
      x.fillStyle = '#5e5a52'; x.fillRect(LANDMARKS.stone + 2, sy - 40, 7, 42);
      paper(x, 0.06);
    } },
    { k: 0.9, paint: (x, r) => {
      const yAt = px => 1010 - 30 * Math.sin(px / 260 + 1);
      hillsRow(x, r, -300, 3100, yAt, ['#5f8a58', '#6a9660', '#7aa66a'], null);
      for (let px = -300; px < 3100; px += 34 + r() * 30) { if (px > 1200 && px < 1700) continue; const h = 90 + r() * 90; foliage(x, px, yAt(px) - h * 0.25, h * 0.85, h, ['#2c4a36', '#38583e', '#4a6e48', '#6a8c58', '#94ac6e'], r, { light: RIGHT, density: 0.55 }); }
      paper(x, 0.06);
    } },
    { k: 1.1, front: true, paint: (x, r) => {
      for (const [cx, cy, w, h] of [[-80, 1250, 700, 620], [2900, 1230, 700, 640]]) foliage(x, cx, cy, w, h, ['#16281c', '#1f3524', '#28422c', '#3a5a3a', '#567848'], r, { light: RIGHT, density: 0.6 });
    } },
  ],
});
valley.mist = mistSprite(3600, 640, 150);

// ═══════════════ B. The meadow at the forest edge ═══════════════
export const OWL_TREE = { x: 420, base: 1010, w: 150, hollow: { cx: 436, cy: 560, rx: 34, ry: 46 } };
export const MEADOW_BRANCH = { pts: [[470, 712], [600, 690], [740, 664], [830, 650]], w0: 26, w1: 9 };
export const STUMP = { cx: 2050, top: 900, rx: 78, ry: 17, base: 1012 };
export const meadowGround = x => 1040 + 8 * Math.sin(x / 380);
export const meadow = makeSet({
  name: 'meadow', W: 2800, H: 1500, refX: 1400, refY: 850, pan: [500, 2300], horizon: 700, laneY: 1040, baseS: 1.3, defaultSky: 'morning',
  skies: { morning: sky.morning, dawn: sky.dawn },
  layers: [
    { k: 0.5, paint: (x, r) => {
      hillsRow(x, r, -900, 3700, px => 700 - 40 * Math.sin(px / 400), ['#a7c0a6', '#b2c9ae', '#bdd0b6'], ['#86a790', '#93b296', '#a4bea0'], 0.8, LEFT);
      const g = x.createLinearGradient(0, 620, 0, 800); g.addColorStop(0, 'rgba(240,240,225,0)'); g.addColorStop(1, 'rgba(240,240,225,.5)'); x.fillStyle = g; x.fillRect(-900, 620, 4600, 300);
      paper(x, 0.06);
    } },
    { k: 0.8, paint: (x, r) => {
      // the forest edge behind the meadow
      for (let px = -600; px < 3400; px += 110 + r() * 120) trunk(x, r, px, 26 + r() * 34, -300, 815 + r() * 20, { haze: 0.35, lit: -1 });
      for (let px = -700; px < 3500; px += 150 + r() * 120) foliage(x, px, 60 + r() * 220, 380 + r() * 200, 360 + r() * 160, ['#3f6447', '#4a704e', '#5a8058', '#76986a', '#9fb684'], r, { light: LEFT, density: 0.6 });
      for (let px = -600; px < 3400; px += 120 + r() * 100) foliage(x, px, 560 + r() * 160, 260 + r() * 160, 220 + r() * 120, ['#456b4c', '#517a54', '#628a5e', '#7e9f6c', '#a5bb88'], r, { light: LEFT, density: 0.6 });
      for (let px = -600; px < 3400; px += 60 + r() * 50) clump(x, px, 800, 120 + r() * 80, 60 + r() * 40, ['#4f7a4c', '#5f8a56', '#76a062', '#a8c088'], 26, r, { size: 0.13, light: LEFT });
      const g = x.createLinearGradient(0, 600, 0, 840); g.addColorStop(0, 'rgba(236,240,225,.0)'); g.addColorStop(1, 'rgba(236,240,225,.35)'); x.fillStyle = g; x.fillRect(-600, 600, 4000, 260);
      paper(x, 0.07);
    } },
    { k: 1, paint: (x, r) => {
      const g = x.createLinearGradient(0, 800, 0, 1500); g.addColorStop(0, '#9cc86a'); g.addColorStop(0.35, '#86b85a'); g.addColorStop(1, '#5f9446');
      x.fillStyle = g; x.beginPath(); x.moveTo(-400, 830); for (let px = -400; px <= 3200; px += 40) x.lineTo(px, 818 + Math.sin(px * 0.004) * 10 + r() * 4); x.lineTo(3200, 1800); x.lineTo(-400, 1800); x.fill();
      grassField(x, r, -400, 3200, 820, 1700, GRASS, 9000, py => 0.6 + (py - 800) / 600);
      flowers(x, r, -400, 3200, 840, 1500, 1100, py => 0.6 + (py - 800) / 500);
      // the owl's tree: hollow, a low branch for the squirrel, canopy above the frame
      const T = OWL_TREE; trunk(x, r, T.x, T.w, -400, T.base, { col: '#6a5444', dark: '#4c3c32', litCol: 'rgba(230,200,140,.55)', lit: -1 });
      const H = T.hollow; x.fillStyle = '#2a1e18'; path(x, ell(H.cx, H.cy, H.rx + 6, H.ry + 6, 51, 1.5)); x.fill();
      x.fillStyle = '#120c0a'; path(x, ell(H.cx, H.cy, H.rx, H.ry, 52, 1)); x.fill();
      x.strokeStyle = 'rgba(200,170,120,.5)'; x.lineWidth = 4; x.beginPath(); x.ellipse(H.cx - 3, H.cy - 2, H.rx + 4, H.ry + 4, 0, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
      paintBranch(x, MEADOW_BRANCH);
      foliage(x, 850, 610, 200, 120, ['#2f5a36', '#3d6d3d', '#4f8344', '#6c9c4c', '#9cbb5e'], r, { light: LEFT });
      foliage(x, T.x + 30, -60, 900, 520, ['#23452c', '#2f5a36', '#3d6d3d', '#527f45', '#7c9f55', '#a9bd6a'], r, { light: LEFT });
      clump(x, T.x, T.base, 260, 50, ['#4a7040', '#5a8048', '#74985a'], 40, r, { size: 0.12, light: LEFT });
      // the old stump where the Fox stands
      const P = STUMP, side = rpoly([[P.cx - P.rx, P.top], [P.cx + P.rx, P.top], [P.cx + P.rx + 14, P.base], [P.cx - P.rx - 16, P.base]], 10, { seed: 53, jit: 1.5 });
      x.fillStyle = '#6a5240'; path(x, side); x.fill();
      x.save(); path(x, side); x.clip(); x.fillStyle = '#4a382c'; x.fillRect(P.cx + 10, P.top - 5, 120, 140); for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(40,28,22,.4)'; blob(x, P.cx - P.rx + r() * P.rx * 2, P.top + r() * 100, 1.5, 8 + r() * 20, 0, r, 6); } x.restore();
      x.fillStyle = '#c9a77a'; path(x, ell(P.cx, P.top, P.rx, P.ry, 54, 1)); x.fill();
      for (const k of [0.75, 0.5, 0.25]) { x.strokeStyle = 'rgba(120,90,60,.6)'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(P.cx + 4, P.top, P.rx * k, P.ry * k, 0, 0, 7); x.stroke(); }
      clump(x, P.cx - 40, P.base - 4, 110, 26, ['#4a7040', '#5a8048', '#74985a'], 20, r, { size: 0.14, light: LEFT });
      for (const [cx, cy, w, h] of [[1200, 1180, 60, 30], [2380, 1100, 46, 24], [780, 1260, 70, 34]]) rock(x, r, cx, cy, w, h);
      paper(x, 0.07);
    } },
    { k: 1.3, front: true, paint: (x, r) => {
      blades(x, r, -600, 3600, () => 1560, 900, { len: [40, 150], w: 7 });
      fern(x, r, -40, 1500, 360, -0.95); fern(x, r, 60, 1560, 300, -0.6); fern(x, r, 2960, 1500, 360, -2.2); fern(x, r, 2860, 1560, 300, -2.5);
    } },
  ],
});
meadow.mist = mistSprite(3600, 640, 120, '245,248,240', 0.12);

// ═══════════════ C. The forest path ═══════════════
export const forestGround = x => 1062 + 6 * Math.sin(x / 300);
export const FOREST_FRONT_TRUNKS = [860, 1880, 2840, 3760];
export const forest = makeSet({
  name: 'forest', W: 4400, H: 1400, refX: 2100, refY: 850, pan: [500, 3800], horizon: 720, laneY: 1062, baseS: 1.3, defaultSky: 'morning',
  skies: { morning: (x, r, w, h) => skyGradient(x, w, h, [[0, '#a9c4b8'], [0.6, '#d8e4d0'], [1, '#eef0de']]) },
  layers: [
    { k: 0.45, paint: (x, r) => {
      for (let px = -1500; px < 5800; px += 40 + r() * 50) trunk(x, r, px, 14 + r() * 16, -300, 830, { col: '#9fb0a6', dark: '#93a49c', litCol: 'rgba(240,230,200,.4)', haze: 0.35, roots: false });
      const g = x.createLinearGradient(0, 300, 0, 900); g.addColorStop(0, 'rgba(225,235,215,.1)'); g.addColorStop(1, 'rgba(232,236,218,.75)'); x.fillStyle = g; x.fillRect(-1500, 0, 7300, 1000);
    } },
    { k: 0.7, paint: (x, r) => {
      for (let px = -800; px < 5000; px += 120 + r() * 140) trunk(x, r, px, 30 + r() * 30, -300, 900 + r() * 20, { col: '#66786a', dark: '#566a5e', litCol: 'rgba(240,220,170,.55)', haze: 0.18, lit: 1 });
      for (let px = -800; px < 5000; px += 70 + r() * 70) clump(x, px, 905, 150 + r() * 100, 70 + r() * 40, ['#4f7258', '#5c8062', '#729470', '#9ab48a'], 26, r, { size: 0.13, light: RIGHT });
      for (let px = -800; px < 5000; px += 160 + r() * 140) foliage(x, px, 40 + r() * 140, 420, 280, ['#2e4c3a', '#3a5c44', '#4c7050', '#6a8c60', '#93ac78'], r, { light: RIGHT, density: 0.45, holes: 'rgba(230,236,214,.9)' });
      paper(x, 0.06);
    } },
    { k: 0.9, paint: (x, r) => {
      for (let px = -300; px < 4700; px += 260 + r() * 260) trunk(x, r, px, 60 + r() * 40, -300, 990 + r() * 10, { col: '#55463a', dark: '#3e3429', litCol: 'rgba(240,210,150,.6)', lit: 1 });
      for (let px = -300; px < 4700; px += 90 + r() * 80) { fern(x, r, px, 1002, 70 + r() * 60, -1.2 - r() * 0.8, ['#3a5c3a', '#456a42', '#527a4a']); }
      for (let px = -300; px < 4700; px += 60 + r() * 60) clump(x, px, 1000, 90 + r() * 70, 36 + r() * 20, ['#3e6036', '#4c7040', '#62884c', '#8aa860'], 20, r, { size: 0.14, light: RIGHT });
    } },
    { k: 1, paint: (x, r) => {
      x.fillStyle = '#5f7a44'; x.fillRect(-300, 995, 5000, 700);
      grassField(x, r, -300, 4700, 1000, 1500, ['#5f7a44', '#6f8a4c', '#7c9452', '#4e6a3a', '#8a7a50'], 7000, py => 0.6 + (py - 1000) / 400);
      const top = [], bot = []; for (let px = -300; px <= 4700; px += 20) { top.push([px, forestGround(px) - 26 + Math.sin(px * 0.05) * 2]); bot.push([px, forestGround(px) + 30 + Math.sin(px * 0.037) * 3]); }
      x.fillStyle = '#a8946a'; x.beginPath(); poly(x, [...top, ...bot.reverse()]); x.fill();
      for (let i = 0; i < 2600; i++) { const px = -300 + r() * 5000, py = forestGround(px) + (r() - 0.5) * 50; x.fillStyle = pick(r, ['#957f58', '#b8a47a', '#8a7650', '#c4ae80', '#a08a5e']); blob(x, px, py, 2 + r() * 6, 1 + r() * 1.8, 0, r, 6); }
      for (let i = 0; i < 80; i++) { const px = -300 + r() * 5000, py = forestGround(px) + (r() < 0.5 ? -36 : 44); x.fillStyle = pick(r, ['#c94a3a', '#e6d6b0', '#d9a441']); x.beginPath(); x.ellipse(px, py - 6, 5, 3, 0, Math.PI, 0); x.fill(); x.fillStyle = '#efe6d0'; x.fillRect(px - 1.2, py - 6, 2.4, 6); }
      paper(x, 0.06);
    } },
    { k: 1.45, front: true, paint: (x, r) => {
      for (const tx of FOREST_FRONT_TRUNKS) trunk(x, r, tx, 150, -400, 1700, { col: '#2e2620', dark: '#1e1914', litCol: 'rgba(210,170,110,.45)', lit: 1, roots: false });
      for (let px = -900; px < 5800; px += 120 + r() * 100) fern(x, r, px, 1560, 180 + r() * 120, -1.0 - r() * 1.1, ['#16281a', '#1f3322', '#284028']);
    } },
  ],
});
forest.mist = mistSprite(4200, 640, 160, '240,244,230', 0.16);

// ═══════════════ D. The stream ═══════════════
export const streamX = y => 1300 + 60 * Math.sin((y - 720) / 120);
export const streamHW = y => Math.max(0, 20 + (y - 720) * 0.6);
export const STONES = [1170, 1270, 1370, 1470].map((x, i) => ({ x, top: 1043 + (i % 2) * 3, rx: 43, ry: 10 }));
export const FROG_ROCK = { x: 1430, top: 1118 };
export const BANKS = { left: 1070, right: 1580 };
export const streamGround = x => 1050 + 5 * Math.sin(x / 300);
export const stream = makeSet({
  name: 'stream', W: 2800, H: 1400, refX: 1400, refY: 860, pan: [900, 1900], horizon: 700, laneY: 1050, baseS: 1.3, defaultSky: 'morning',
  skies: { morning: sky.morning },
  layers: [
    { k: 0.5, paint: (x, r) => {
      hillsRow(x, r, -500, 3300, px => 700 - 50 * Math.sin(px / 420), ['#a6c0a8', '#b2caae', '#bcd2b6'], ['#86a790', '#93b296', '#a4bea0'], 0.8, LEFT);
      paper(x, 0.05);
    } },
    { k: 0.85, paint: (x, r) => {
      for (let px = -300; px < 3100; px += 150 + r() * 160) { if (Math.abs(px - streamX(760)) < 90) continue; oak(x, r, px, 800 + r() * 20, 220 + r() * 120, 260 + r() * 120, { light: LEFT, pal: ['#3e6448', '#4a7050', '#5c845a', '#7a9e68', '#a3bc84', '#c4d29c'] }); }
      for (let px = -300; px < 3100; px += 50 + r() * 50) clump(x, px, 808, 110 + r() * 70, 50 + r() * 30, ['#5a8450', '#6a925a', '#82a86a', '#aac48a'], 22, r, { size: 0.13, light: LEFT });
      paper(x, 0.06);
    } },
    { k: 1, paint: (x, r, S) => {
      const g = x.createLinearGradient(0, 790, 0, 1500); g.addColorStop(0, '#9ac46a'); g.addColorStop(1, '#5f9446'); x.fillStyle = g; x.fillRect(-300, 800, 3400, 900);
      grassField(x, r, -300, 3100, 800, 1600, GRASS, 7000, py => 0.6 + (py - 800) / 500);
      flowers(x, r, -300, 3100, 820, 1500, 700, py => 0.6 + (py - 800) / 500);
      // the course path on both banks
      for (const [a, b] of [[-300, BANKS.left + 20], [BANKS.right - 20, 3100]]) { x.fillStyle = '#d4c396'; x.beginPath(); x.moveTo(a, streamGround(a) - 24); x.lineTo(b, streamGround(b) - 24); x.lineTo(b, streamGround(b) + 30); x.lineTo(a, streamGround(a) + 30); x.fill(); }
      // water: a band winding from the far meadow to the foreground
      const L = [], R = []; for (let y = 740; y <= 1700; y += 10) { L.push([streamX(y) - streamHW(y), y]); R.push([streamX(y) + streamHW(y), y]); }
      const W = [...L, ...R.reverse()]; S.waterP = W;
      x.fillStyle = '#5f8c4a'; path(x, W.map(([px, py]) => [px + (px < streamX(py) ? -10 : 10), py])); x.fill();
      x.save(); path(x, W); x.clip();
      const wg = x.createLinearGradient(0, 740, 0, 1500); wg.addColorStop(0, '#d6e8ea'); wg.addColorStop(0.4, '#8cbccb'); wg.addColorStop(1, '#3d7a8e'); x.fillStyle = wg; x.fillRect(800, 700, 1200, 1000);
      for (let i = 0; i < 260; i++) { const py = 760 + r() * 900, px = streamX(py) + (r() - 0.5) * streamHW(py) * 1.8; x.fillStyle = r() < 0.5 ? 'rgba(235,248,250,.4)' : 'rgba(30,80,95,.3)'; blob(x, px, py, 6 + r() * 18 * (py / 1000), 1 + r() * 1.5, 0, r, 6); }
      x.filter = 'blur(8px)'; x.strokeStyle = 'rgba(25,60,55,.5)'; x.lineWidth = 30; path(x, W); x.stroke(); x.filter = 'none';
      x.restore();
      for (let i = 0; i < W.length; i += 2) { const [px, py] = W[i]; x.fillStyle = pick(r, ['#5f9444', '#6fa44c', '#4f8040', '#82b456']); blob(x, px, py, (8 + r() * 12) * py / 1000, (3 + r() * 4) * py / 1000, 0, r, 6); }
      for (const st of STONES) rock(x, r, st.x, st.top + st.ry * 1.6, st.rx * 2, st.ry * 2.4, { col: '#9c9a8e', dark: '#6a685e', lit: '#cfcbb8', moss: true });
      rock(x, r, FROG_ROCK.x, FROG_ROCK.top + 14, 46, 18, { col: '#8a887c', dark: '#5e5c54', lit: '#bbb7a6' });
      for (const [cx, cy] of [[1040, 980], [1600, 1000], [1000, 1180], [1700, 1220], [1560, 880]]) for (let i = 0; i < 12; i++) { const bx = cx + (r() - 0.5) * 60, h = 50 + r() * 90; ink(x, quad([bx, cy], [bx + (r() - 0.5) * 20, cy - h * 0.6], [bx + (r() - 0.5) * 40, cy - h], 12), 4, { closed: false, color: pick(r, ['#3f6b3a', '#4f7d42', '#5f8c48']), seed: i + cx }); }
      paper(x, 0.06);
    } },
    { k: 1.3, front: true, paint: (x, r) => { blades(x, r, -400, 3200, () => 1520, 700, { len: [40, 140], w: 7 }); fern(x, r, 2900, 1480, 340, -2.3); fern(x, r, -60, 1500, 320, -0.8); } },
  ],
});

// ═══════════════ E. The wayside tree ═══════════════
export const WAY_TREE = { x: 1560, base: 985, w: 175 };
export const WAY_BRANCH = { pts: [[1470, 640], [1330, 612], [1180, 600], [1060, 608]], w0: 34, w1: 10 };
export const NAP = { x: 1390, y: 1014 };
export const waysideGround = x => 1080 + 6 * Math.sin(x / 340);
export const wayside = makeSet({
  name: 'wayside', W: 2800, H: 1500, refX: 1400, refY: 850, pan: [900, 1900], horizon: 720, laneY: 1080, baseS: 1.3, defaultSky: 'morning',
  skies: { morning: sky.morning, golden: sky.golden, twilight: sky.twilight },
  layers: [
    { k: 0.5, paint: (x, r) => { hillsRow(x, r, -500, 3300, px => 720 - 60 * Math.sin(px / 380), ['#a4bfa4', '#b0c8ac', '#bccfb4'], ['#86a790', '#93b296', '#a4bea0'], 0.8, LEFT); paper(x, 0.05); } },
    { k: 0.85, paint: (x, r) => {
      for (let px = -300; px < 3100; px += 260 + r() * 300) oak(x, r, px, 830 + r() * 20, 180 + r() * 100, 220 + r() * 90, { light: LEFT, pal: ['#3e6448', '#4a7050', '#5c845a', '#7a9e68', '#a3bc84', '#c4d29c'] });
      for (let px = -300; px < 3100; px += 50 + r() * 60) clump(x, px, 840, 110 + r() * 70, 46 + r() * 30, ['#5a8450', '#6a925a', '#82a86a', '#aac48a'], 22, r, { size: 0.13, light: LEFT });
      paper(x, 0.06);
    } },
    { k: 1, paint: (x, r) => {
      const g = x.createLinearGradient(0, 840, 0, 1500); g.addColorStop(0, '#9cc86a'); g.addColorStop(1, '#5f9446'); x.fillStyle = g; x.fillRect(-300, 846, 3400, 900);
      grassField(x, r, -300, 3100, 850, 1600, GRASS, 8000, py => 0.6 + (py - 850) / 500);
      flowers(x, r, -300, 3100, 860, 1500, 900, py => 0.6 + (py - 850) / 450);
      const top = [], bot = []; for (let px = -300; px <= 3100; px += 20) { top.push([px, waysideGround(px) - 28]); bot.push([px, waysideGround(px) + 32]); }
      x.fillStyle = '#d4c396'; x.beginPath(); poly(x, [...top, ...bot.reverse()]); x.fill();
      for (let i = 0; i < 1600; i++) { const px = -300 + r() * 3400, py = waysideGround(px) + (r() - 0.5) * 54; x.fillStyle = pick(r, ['#c7b688', '#e8dbb4', '#bba977']); blob(x, px, py, 2 + r() * 5, 1 + r() * 1.6, 0, r, 6); }
      // the big old tree beside the course: roots spread on the grass, never across the path
      const T = WAY_TREE; trunk(x, r, T.x, T.w, -400, T.base, { col: '#6a5444', dark: '#4c3c32', litCol: 'rgba(230,200,140,.55)', lit: -1 });
      for (const [ax, ay, bx, by] of [[T.x - 120, T.base - 20, T.x - 260, T.base + 8], [T.x + 110, T.base - 20, T.x + 250, T.base + 6], [T.x - 40, T.base - 10, T.x - 120, T.base + 18]]) ink(x, quad([ax, ay], [(ax + bx) / 2, ay - 6], [bx, by], 16), 22, { closed: false, color: '#5a4636', seed: ax });
      paintBranch(x, WAY_BRANCH);
      foliage(x, 1060, 570, 220, 130, ['#2f5a36', '#3d6d3d', '#4f8344', '#6c9c4c', '#9cbb5e'], r, { light: LEFT });
      const CP = ['#23452c', '#2f5a36', '#3d6d3d', '#527f45', '#7c9f55', '#a9bd6a'];
      for (const [cx, cy, w, h] of [[T.x - 40, 60, 1300, 520], [T.x - 520, 250, 560, 300], [T.x + 420, 230, 600, 320], [T.x + 60, 330, 520, 220], [T.x - 180, 430, 700, 260], [T.x + 330, 470, 520, 240], [T.x + 620, 400, 380, 260]]) foliage(x, cx, cy, w, h, CP, r, { light: LEFT, holes: 'rgba(200,225,235,.7)' });
      paper(x, 0.07);
    } },
    { k: 1.3, front: true, paint: (x, r) => { blades(x, r, -400, 3200, () => 1560, 800, { len: [40, 150], w: 7 }); fern(x, r, -40, 1520, 340, -0.9); fern(x, r, 2940, 1520, 340, -2.3); } },
  ],
});

// ═══════════════ F. The hill and the goal ═══════════════
export const hillGround = x => 1190 - 430 * smooth(300, 2150, x) + 8 * Math.sin(x / 260);
export const STONE = { x: 2420, w: 120, h: 270 };
STONE.base = hillGround(STONE.x); STONE.scarf = [STONE.x, STONE.base - STONE.h * 0.21];
export const hill = makeSet({
  name: 'hill', W: 3300, H: 1500, refX: 1650, refY: 800, pan: [800, 2700], horizon: 600, laneY: 1000, baseS: 1.3, defaultSky: 'golden',
  skies: { golden: sky.golden, twilight: sky.twilight, morning: sky.morning },
  layers: [
    { k: 0.5, paint: (x, r) => {
      hillsRow(x, r, -800, 4100, px => 760 - 70 * Math.sin(px / 340) - 35 * Math.sin(px / 130 + 1), ['#a9b0a8', '#b1b7ae', '#b9beb4'], ['#94a096', '#9ca89c', '#a6b0a4'], 1.4, RIGHT);
      hillsRow(x, r, -800, 4100, px => 860 - 45 * Math.sin(px / 260 + 2), ['#93a48a', '#9bab90', '#a4b298'], ['#7c8e74', '#86987c', '#90a086'], 1.6, RIGHT);
      { const g = x.createLinearGradient(0, 560, 0, 1000); g.addColorStop(0, 'rgba(235,232,225,0)'); g.addColorStop(0.45, 'rgba(235,232,225,.3)'); g.addColorStop(1, 'rgba(235,232,225,0)'); x.fillStyle = g; x.fillRect(-800, 560, 4900, 440); }
      paper(x, 0.05);
    } },
    { k: 1, paint: (x, r) => {
      const pts = [[-400, 1800]]; for (let px = -400; px <= 3700; px += 16) pts.push([px, hillGround(px) - 6]); pts.push([3700, 1800]);
      const g = x.createLinearGradient(0, 700, 0, 1500); g.addColorStop(0, '#a8c870'); g.addColorStop(1, '#6a9a4c'); x.fillStyle = g; path(x, pts); x.fill();
      x.save(); path(x, pts); x.clip();
      grassField(x, r, -400, 3700, 700, 1700, GRASS, 9000, py => 0.7 + (py - 700) / 700);
      flowers(x, r, -400, 3700, 720, 1500, 1200, py => 0.7 + (py - 700) / 600);
      for (let px = -400; px < 3700; px += 4) { const y = hillGround(px); x.fillStyle = pick(r, ['#d9c99c', '#e6d8ae', '#cbb88a']); blob(x, px, y + 8, 4, 3, 0, r, 5); }
      x.restore();
      for (let px = -300; px < 3600; px += 30 + r() * 40) { const y = hillGround(px); clump(x, px, y - 4, 50 + r() * 50, 20 + r() * 16, ['#6a9a4c', '#7aa856', '#94bc68', '#b8d08a'], 14, r, { size: 0.16, light: RIGHT }); }
      for (const [cx, w, h] of [[900, 60, 26], [1700, 44, 20], [2800, 70, 30]]) rock(x, r, cx, hillGround(cx) + 4, w, h);
      // the goal: an old standing stone
      const S = STONE, sy = S.base;
      const P = rpoly([[S.x - S.w / 2, sy + 6], [S.x - S.w * 0.46, sy - S.h * 0.8], [S.x - S.w * 0.2, sy - S.h], [S.x + S.w * 0.28, sy - S.h * 0.94], [S.x + S.w * 0.5, sy - S.h * 0.6], [S.x + S.w * 0.5, sy + 6]], 18, { seed: 61, jit: 2 });
      x.fillStyle = '#9a9488'; path(x, P); x.fill();
      x.save(); path(x, P); x.clip(); x.fillStyle = '#6a665c'; x.fillRect(S.x - S.w * 0.55, sy - S.h - 10, S.w * 0.45, S.h + 20);
      x.fillStyle = '#c8c0aa'; x.fillRect(S.x + S.w * 0.28, sy - S.h, S.w * 0.24, S.h + 10);
      for (let i = 0; i < 40; i++) { x.fillStyle = pick(r, ['rgba(180,190,110,.7)', 'rgba(220,200,120,.6)', 'rgba(120,130,80,.6)']); blob(x, S.x - S.w / 2 + r() * S.w, sy - r() * S.h, 3 + r() * 8, 2 + r() * 5, r(), r, 6); }
      ink(x, quad([S.x - 10, sy - S.h * 0.9], [S.x + 4, sy - S.h * 0.6], [S.x - 6, sy - S.h * 0.3], 12), 1.6, { closed: false, color: 'rgba(60,55,50,.6)', seed: 62 });
      x.restore();
      clump(x, S.x, sy + 2, 180, 30, ['#6a9a4c', '#7aa856', '#94bc68'], 24, r, { size: 0.14, light: RIGHT });
      paper(x, 0.06);
    } },
    { k: 1.3, front: true, paint: (x, r) => { blades(x, r, -600, 3900, px => Math.max(1560, hillGround(px) + 420), 700, { len: [40, 130], w: 7 }); } },
  ],
});
