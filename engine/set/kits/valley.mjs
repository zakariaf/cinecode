// The valley: a lookout knoll above a wide valley — the forest's edge on the left, a stream winding down
// through the meadows, the course path crossing it, the wayside tree and the hill with its standing stone
// far off on the right. Used for openings, journeys seen from afar, and night skies.
import { smooth, quad, path, rpoly, pick, blob, clump } from '../../core/lib.mjs';
import { makeSet } from '../set.mjs';
import { paper, foliage, contactShadow, RIGHT, meadowFloor, farHills, treeline, boulder, bush, blades, mistSprite } from '../../paint/paint.mjs';

export const LANDMARKS = { forest: [380, 1100], stream: 1380, tree: 1680, stone: 2260 };
const valleyY = px => 860 - 40 * Math.sin(px / 380) - (px > 1950 && px < 2600 ? 120 * Math.sin(Math.PI * (px - 1950) / 650) : 0);
const knoll = px => 1080 + 26 * Math.sin(px / 520 + 0.6) + 8 * Math.sin(px / 140);
export const valleyMist = () => mistSprite(3600, 640, 150);

export default function valley(params = {}) {
  const L = RIGHT, sAt = y => 0.5 + (y - 1060) / 420;
  return makeSet({
    id: 'valley', W: 2800, H: 1400, refX: 1400, refY: 760, seed: params.seed || 0,
    area: { x0: -400, x1: 3200, y0: -400, y1: 1700 },
    view: { x0: 1000, x1: 1800, y0: 450, y1: 1150 },
    horizon: 600, laneY: 1200, baseS: 1, light: L, lane: knoll,
    defaultSky: 'dawn',
    layers: [
      { k: 0.38, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, px => 690 - 80 * Math.sin(px / 430) - 50 * Math.sin(px / 170 + 1), { pal: ['#a3aec8', '#adb7cf', '#9aa6c2', '#b6bfd4'], light: L });
        farHills(x, r, E.x0, E.x1, px => 760 - 50 * Math.sin(px / 300 + 2), { pal: ['#93a8b6', '#9db2bf', '#a9bcc6', '#8ca2b2'], trees: ['#7f96a6', '#8aa0ae', '#9aaeba'], light: L });
        paper(x, 0.05);
      } },
      { k: 0.66, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, valleyY, { pal: ['#86a67e', '#90ae86', '#9cb88e', '#7e9e78'], light: L });
        for (let i = 0; i < 26; i++) { const px = E.x0 + r() * (E.x1 - E.x0), py = valleyY(px) + 30 + r() * 200; x.fillStyle = pick(r, ['rgba(170,190,110,.35)', 'rgba(120,150,90,.3)', 'rgba(200,190,120,.25)']); blob(x, px, py, 80 + r() * 160, 14 + r() * 26, 0, r, 8); }
        for (let i = 0; i < 9; i++) { const px = E.x0 + r() * (E.x1 - E.x0), py = valleyY(px) + 40 + r() * 180, L2 = 120 + r() * 260; for (let k = 0; k < L2; k += 9) clump(x, px + k, py + k * 0.05, 14, 9, ['#4f7650', '#5c8458', '#6a9060'], 4, r, { size: 0.3, light: L }); }
        for (let px = E.x0; px < 1150; px += 26 + r() * 20) { const h = 70 + r() * 70; foliage(x, px, valleyY(px) - h * 0.2, h * 0.8, h, ['#3f6450', '#4d7458', '#5f8560', '#7d9e70', '#a3b888'], r, { light: L, density: 0.5 }); }
        // the stream winding down through the meadows
        const S1 = [...quad([1330, valleyY(1330) + 2], [1470, 900], [1390, 960], 20), ...quad([1390, 960], [1300, 1010], [1400, 1120], 20)];
        x.lineCap = 'round';
        x.strokeStyle = '#5f7a50'; x.lineWidth = 12; x.beginPath(); S1.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
        for (let i = 1; i < S1.length; i++) { x.strokeStyle = i % 2 ? '#8fbccb' : '#a9d0da'; x.lineWidth = 5 + i * 0.9; x.beginPath(); x.moveTo(...S1[i - 1]); x.lineTo(...S1[i]); x.stroke(); }
        x.strokeStyle = 'rgba(245,250,240,.8)'; x.lineWidth = 2; x.beginPath(); S1.forEach(([a, b], i) => (i ? x.lineTo(a + 2, b - 1) : x.moveTo(a + 2, b - 1))); x.stroke();
        // the course: a pale path from the forest's edge, over the stream, past the tree, up to the stone
        x.setLineDash([12, 8]); x.strokeStyle = 'rgba(246,232,190,.95)'; x.lineWidth = 4.5; x.beginPath();
        for (let px = 1080; px <= LANDMARKS.stone - 14; px += 10) { const py = valleyY(px) + 26 - 22 * smooth(1950, LANDMARKS.stone, px); px === 1080 ? x.moveTo(px, py) : x.lineTo(px, py); }
        x.stroke(); x.setLineDash([]);
        const ty = valleyY(LANDMARKS.tree); x.fillStyle = '#4a3a30'; x.fillRect(LANDMARKS.tree - 5, ty - 46, 10, 50);
        foliage(x, LANDMARKS.tree, ty - 64, 110, 60, ['#3a5a40', '#46694a', '#567a52', '#7a9a62', '#a0b47a'], r, { light: L, density: 0.8 });
        const sy = valleyY(LANDMARKS.stone); x.fillStyle = '#8a8478'; path(x, rpoly([[LANDMARKS.stone - 9, sy + 2], [LANDMARKS.stone - 8, sy - 38], [LANDMARKS.stone + 3, sy - 44], [LANDMARKS.stone + 10, sy - 34], [LANDMARKS.stone + 9, sy + 2]], 3, { seed: 43, jit: 0.4 })); x.fill();
        x.fillStyle = '#5e5a52'; x.fillRect(LANDMARKS.stone - 8, sy - 38, 7, 40);
        paper(x, 0.06);
      } },
      { k: 0.86, outline: { w: 1.5, color: '#203a2a', alpha: 0.55 }, paint(x, r, S, E) {
        // only the flanks: a copse on each side frames the open valley without hiding it
        const base = px => 1050 - 20 * Math.sin(px / 260 + 1);
        for (const [a, b] of [[E.x0, 820], [2060, E.x1]]) {
          const env = px => (a === E.x0 ? 1 - smooth(b - 420, b, px) : smooth(a, a + 420, px));
          treeline(x, r, a, b, base, px => base(px) - 40 - (190 + 50 * Math.sin(px / 90)) * env(px), { light: L, crownW: [160, 260], step: [70, 120], trunkW: [8, 14], pal: ['#2c4a36', '#38583e', '#4a6e48', '#6a8c58', '#94ac6e'], interior: '#2a4232', density: 0.8 });
        }
        paper(x, 0.06);
      } },
      { k: 1, paint(x, r, S, E) {
        meadowFloor(x, r, E, { edge: knoll, sAt, grad: [[0, '#9cc66c'], [0.4, '#7fb058'], [1, '#5a8c44']], density: 1, flowerN: 0.9, hazeTo: 60 });
        paper(x, 0.07);
      } },
      { k: 1.12, front: true, paint(x, r, S, E) {
        for (const [cx, cy, w, h] of [[-120, 1400, 760, 640], [2960, 1380, 760, 660]]) foliage(x, cx, cy, w, h, ['#16281c', '#1f3524', '#28422c', '#3a5a3a', '#567848'], r, { light: L, density: 0.6 });
        blades(x, r, E.x0, E.x1, px => 1700 + 14 * Math.sin(px / 81), Math.round((E.x1 - E.x0) / 4), { len: [40, 150], w: 7, clumps: 1 });
      } },
    ],
    props: [
      { id: 'lookout_rock', x: 1880, y: 1226, base: 1240, solid: { rx: 78, ry: 18 }, bounds: [1790, 1160, 1970, 1250],
        paint: (x, r) => boulder(x, r, 1880, 1242, 156, 78, { light: L }), ground: x => contactShadow(x, 1870, 1242, 100, 16, 0.45),
        anchors: { lookout_rock: { type: 'surface', x: 1866, y: 1170, surface: 'stone' } } },
      { id: 'gorse', x: 860, y: 1150, base: 1162, solid: { rx: 100, ry: 20 }, bounds: [720, 1000, 1000, 1170],
        paint: (x, r) => bush(x, r, 860, 1164, 260, 150, { light: L, berries: '#e8c43a' }), ground: x => contactShadow(x, 868, 1164, 140, 18, 0.42) },
    ],
    anchors: {
      lookout: { x: 1400, y: 1200 },
      knoll_left: { x: 1060, y: 1190 },
      knoll_right: { x: 2080, y: 1250 },
      path_down: { x: 1440, y: 1330 },
      near: { x: 1250, y: 1360 },
      view_forest: { type: 'view', x: 500, y: 860, k: 0.66 },
      view_stream: { type: 'view', x: LANDMARKS.stream, y: 960, k: 0.66 },
      view_tree: { type: 'view', x: LANDMARKS.tree, y: valleyY(LANDMARKS.tree) - 40, k: 0.66 },
      view_stone: { type: 'view', x: LANDMARKS.stone, y: valleyY(LANDMARKS.stone) - 20, k: 0.66 },
    },
    walk: { region: [[-360, 1130], [3160, 1130], [3160, 1470], [-360, 1470]] },
    ambience: { day: 'meadow-day', night: 'meadow-night' },
    sampleRoute: ['knoll_left', 'knoll_right'],
  });
}
