// The hill and the goal: a long grassy slope rising left to right to a crest with an old standing stone,
// a hawthorn beyond it, hazy ranges behind. A ridge set: actors walk a band just below the crest line.
import { smooth, clump } from '../../core/lib.mjs';
import { makeSet } from '../set.mjs';
import { paper, blades, contactShadow, RIGHT, GRASS, ridge, flowers, grassField, farHills, dirtPath, pathBand, standingStone, stoneTop, boulder, tuft, crown, paintTrunk } from '../../paint/paint.mjs';

export const hillGround = x => 1190 - 430 * smooth(300, 2150, x) + 8 * Math.sin(x / 260);
export const STONE = { x: 2420, w: 120, h: 270 };
STONE.base = hillGround(STONE.x); STONE.scarf = [STONE.x, STONE.base - STONE.h * 0.21];
export const BAND = 60;
const ROCKS = [{ id: 'rock_low', x: 900, w: 60, h: 26 }, { id: 'rock_mid', x: 1700, w: 46, h: 22 }, { id: 'rock_high', x: 2900, w: 70, h: 30 }];
const THORN = { x: 3120 };
const PATH = [-900, 4400, x => hillGround(x) + 24, () => 15];
export const hillPath = pathBand(...PATH).P;

export default function hill(params = {}) {
  const L = RIGHT, g = hillGround;
  return makeSet({
    id: 'hill', W: 3300, H: 1500, refX: 1650, refY: 800, seed: params.seed || 0,
    area: { x0: -500, x1: 3800, y0: -400, y1: 1700 },
    view: { x0: 800, x1: 2900, y0: 350, y1: 1250 },
    horizon: 600, laneY: 1000, baseS: 1.3, light: L, bandScale: 0.0025,
    defaultSky: 'golden',
    layers: [
      { k: 0.4, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, px => 740 - 70 * Math.sin(px / 340) - 35 * Math.sin(px / 130 + 1), { pal: ['#a9b0b2', '#b1b8b8', '#b9c0bc', '#a2aaae'], trees: ['#94a09c', '#9ca8a2', '#a6b0aa'], light: L, every: [50, 160] });
        farHills(x, r, E.x0, E.x1, px => 850 - 45 * Math.sin(px / 260 + 2), { pal: ['#93a48e', '#9bab94', '#a4b29a', '#8c9e88'], trees: ['#7c8e78', '#86987e', '#90a086'], light: L, every: [40, 120] });
        paper(x, 0.05);
      } },
      { k: 0.7, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, px => 960 - 40 * Math.sin(px / 210 + 1) - 20 * Math.sin(px / 90), { pal: ['#7f9a72', '#88a27a', '#92aa82', '#7a946c'], trees: ['#5c7a56', '#66845e', '#729068'], light: L, every: [30, 90], size: [26, 60] });
        paper(x, 0.06);
      } },
      { k: 1, paint(x, r, S, E) {
        const pts = ridge(x, r, E.x0, E.x1, px => g(px) - 6, { pal: ['#94bc64', '#a2c870', '#88b25c', '#b0d07c'], bottom: E.y1 + 20, strokes: 0.6 });
        const gr = x.createLinearGradient(0, 700, 0, E.y1); gr.addColorStop(0, 'rgba(255,240,190,.18)'); gr.addColorStop(1, 'rgba(40,80,40,.25)');
        x.save(); x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.clip();
        x.fillStyle = gr; x.fillRect(E.x0, 600, E.x1 - E.x0, E.y1 - 600);
        // modelling: the face of the slope turned from the light is cooler, the crest catches the sun
        const sh = x.createLinearGradient(-200, 0, 2600, 0); sh.addColorStop(0, 'rgba(60,70,110,.22)'); sh.addColorStop(1, 'rgba(60,70,110,0)');
        x.fillStyle = sh; x.fillRect(E.x0, 600, E.x1 - E.x0, E.y1 - 600);
        for (let px = E.x0; px < E.x1; px += 8) { const y = g(px); x.fillStyle = 'rgba(255,236,170,.18)'; x.fillRect(px, y - 6, 8, 60); }
        grassField(x, r, E.x0, E.x1, 700, E.y1, GRASS, 9000, py => 0.7 + (py - 700) / 700);
        flowers(x, r, E.x0, E.x1, 720, E.y1, 1100, py => 0.7 + (py - 700) / 600);
        dirtPath(x, r, ...PATH, { col: '#d9c99c', pal: ['#cbb88a', '#e6d8ae', '#bfae80'], grassEdge: GRASS });
        x.restore();
        // the lit crest: tussocks along the skyline
        for (let px = E.x0; px < E.x1; px += 26 + r() * 34) clump(x, px, g(px) - 5, 44 + r() * 50, 16 + r() * 14, ['#7aa856', '#94bc68', '#b8d08a', '#d4e2a0'], 12, r, { size: 0.16, light: L });
        paper(x, 0.06);
      } },
      { k: 1.3, front: true, paint(x, r, S, E) { blades(x, r, E.x0, E.x1, px => 1700 + 16 * Math.sin(px / 77), Math.round((E.x1 - E.x0) / 5), { len: [40, 160], w: 7, clumps: 1, pal: ['#4a7a34', '#5a8a3c', '#6a9a44', '#7aa84c'] }); } },
    ],
    props: [
      { id: 'standing_stone', x: STONE.x, y: STONE.base + 4, base: STONE.base, solid: { rx: 66, ry: 12 }, bounds: [STONE.x - 90, STONE.base - STONE.h - 20, STONE.x + 90, STONE.base + 20],
        paint: (x, r) => standingStone(x, r, STONE, { light: L }), ground: x => contactShadow(x, STONE.x - 20, STONE.base + 6, 110, 14, 0.42),
        anchors: { stone_top: { type: 'surface', x: STONE.x + 6, y: stoneTop(STONE, STONE.x + 6) + 2, depth: STONE.base + 5, surface: 'stone' } } },
      ...ROCKS.map(k => ({ id: k.id, x: k.x, y: g(k.x) + 2, base: g(k.x) + 6, solid: { rx: k.w * 0.5, ry: 8 }, bounds: [k.x - k.w * 0.6, g(k.x) - k.h - 6, k.x + k.w * 0.6, g(k.x) + 12],
        paint: (x, r) => boulder(x, r, k.x, g(k.x) + 6, k.w, k.h, { light: L }), ground: x => contactShadow(x, k.x - 4, g(k.x) + 6, k.w * 0.7, 7, 0.4) })),
      { id: 'hawthorn', x: THORN.x, y: g(THORN.x) - 2, base: g(THORN.x), solid: { rx: 30, ry: 8 }, bounds: [THORN.x - 220, g(THORN.x) - 320, THORN.x + 220, g(THORN.x) + 14],
        paint: (x, r) => { paintTrunk(x, r, THORN.x, 26, g(THORN.x) - 150, g(THORN.x) + 2, { col: '#5a4636', light: L, inkW: 0, roots: 2, lean: 30 }); crown(x, r, THORN.x + 40, g(THORN.x) - 210, 340, 200, ['#3e5a34', '#4a6a3c', '#5c7c46', '#7a9a58', '#a2b878'], { light: L, lobes: 5 }); tuft(x, r, THORN.x, g(THORN.x) + 6, 60, 18, { n: 9 }); },
        ground: x => contactShadow(x, THORN.x - 30, g(THORN.x) + 4, 60, 9, 0.4) },
    ],
    anchors: {
      hill_foot: { x: 250, y: g(250) + 30 },
      slope_low: { x: 800, y: g(800) + 30 },
      slope_mid: { x: 1400, y: g(1400) + 30 },
      slope_high: { x: 1900, y: g(1900) + 30 },
      crest: { x: 2200, y: g(2200) + 30 },
      stone_front: { x: STONE.x, y: STONE.base + 46 },
      stone_left: { x: STONE.x - 130, y: g(STONE.x - 130) + 24 },
      stone_right: { x: STONE.x + 140, y: g(STONE.x + 140) + 24 },
      beyond: { x: 2860, y: g(2860) + 40 },
      thorn_shade: { x: 3060, y: g(3060) + 30 },
    },
    walk: { ground: hillGround, band: BAND, range: [-300, 3600], paths: [{ poly: hillPath, surface: 'dirt' }] },
    ambience: { day: 'wind-hill', night: 'meadow-night' },
    sampleRoute: ['slope_low', 'stone_right'],
  });
}
