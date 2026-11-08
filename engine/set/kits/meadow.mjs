// The meadow at the forest edge: the owl's hollow tree with a low branch on the left, an old stump on the
// right, a small lily pond in the right foreground, the forest wall behind opening onto far hills.
import { lerp, smooth, rpoly } from '../../core/lib.mjs';
import { makeSet, ellipsePoly } from '../set.mjs';
import { paper, hazeBand, blades, fern, ridge, contactShadow, paintWater, lilyPad, waterShimmer, bankFringe, reeds,
  LEFT, meadowFloor, treeline, bigTree, hollowClip, stump, boulder, bush } from '../../paint/paint.mjs';

export const OWL_TREE = { x: 420, base: 1012, w: 150, top: -140, hollow: { cx: 436, cy: 560, rx: 34, ry: 46 } };
export const MEADOW_BRANCH = { pts: [[470, 712], [600, 690], [740, 664], [830, 650]], w0: 26, w1: 9 };
export const STUMP = { cx: 2050, top: 900, rx: 78, ry: 17, base: 1012 };
export const ROCKS = [{ id: 'rock_a', x: 1200, y: 1180, w: 64, h: 32 }, { id: 'rock_b', x: 2330, y: 1100, w: 48, h: 26 }, { id: 'rock_c', x: 780, y: 1262, w: 74, h: 36 }];
export const POND = { cx: 2500, cy: 1252, rx: 250, ry: 62 };
export const meadowGround = x => 1040 + 8 * Math.sin(x / 380);
const edge = x => 806 + 6 * Math.sin(x / 300) + 3 * Math.sin(x / 71);
const pondPoly = rpoly(ellipsePoly(POND.cx, POND.cy, POND.rx, POND.ry, 28).map(([x, y], i) => [x + (i % 3) * 6 - 6, y + (i % 4 === 0 ? 5 : 0)]), 30, { seed: 71, jit: 4, step: 10 });

export default function meadow(params = {}) {
  const L = LEFT, sAt = y => 0.45 + (y - 800) / 560;
  return makeSet({
    id: 'meadow', W: 2800, H: 1500, refX: 1400, refY: 850, seed: params.seed || 0,
    area: { x0: -400, x1: 3200, y0: -380, y1: 1700 },
    view: { x0: 500, x1: 2300, y0: 300, y1: 1400 },
    horizon: 700, laneY: 1040, baseS: 1.3, light: L, lane: meadowGround,
    defaultSky: 'morning',
    layers: [
      { k: 0.4, paint(x, r, S, E) {
        ridge(x, r, E.x0, E.x1, px => 668 - 46 * Math.sin(px / 430) - 26 * Math.sin(px / 170 + 1), { pal: ['#a9bfc0', '#b2c6c4', '#9fb6b8', '#bacbc6'] });
        ridge(x, r, E.x0, E.x1, px => 728 - 34 * Math.sin(px / 300 + 2), { pal: ['#9db7a6', '#a8c0ac', '#93ae9c', '#b4c8b2'] });
        for (let px = E.x0; px < E.x1; px += 40 + r() * 120) { const y = 728 - 34 * Math.sin(px / 300 + 2), h = 16 + r() * 22; x.fillStyle = '#87a392'; x.beginPath(); x.ellipse(px, y - h * 0.5, h * 0.45, h * 0.55, 0, 0, 7); x.fill(); }
        hazeBand(x, E.x0, E.x1, 640, 820, '236,242,232', 0.5);
        paper(x, 0.06);
      } },
      { k: 0.75, outline: { w: 1.6, color: '#2f4a3a', alpha: 0.55 }, paint(x, r, S, E) {
        const base = px => 812 + 8 * Math.sin(px / 210);
        const top = px => lerp(200, 600, smooth(1050, 1900, px)) + 40 * Math.sin(px / 160);
        // a solid understory band below the base so parallax never opens a gap under the trees
        x.fillStyle = '#41634a'; x.fillRect(E.x0, 820, E.x1 - E.x0, 240);
        treeline(x, r, E.x0, 1700, base, top, { light: L, crownW: [300, 480], step: [110, 190], trunkW: [24, 42], haze: '226,236,222', under: ['#3f6a44', '#4c7a4a', '#5c8a54', '#78a062'] });
        treeline(x, r, 1500, E.x1, base, px => 560 + 50 * Math.sin(px / 140) + 30 * Math.sin(px / 53), { light: L, crownW: [180, 300], step: [80, 150], trunkW: [12, 20], pal: ['#4a6e50', '#56795a', '#678a62', '#84a474', '#a8c08c'], density: 0.7, under: ['#466f48', '#557f50', '#66905a', '#86aa6a'] });
        paper(x, 0.07);
      } },
      { k: 1, paint(x, r, S, E) {
        meadowFloor(x, r, E, { edge, sAt, density: 1, flowerN: 1.1 });
        // the pond: bank, water, reflections of the far trees, lily pads and reeds
        paintWater(x, r, pondPoly, { far: '#b9d6d8', mid: '#7fb0bf', deep: '#4a8296', bank: '#5f7a3c', bankW: 9, ripples: 0.8,
          reflect: (c, B) => { c.fillStyle = 'rgba(40,70,60,.5)'; for (let i = 0; i < 14; i++) { const px = B.x0 + r() * (B.x1 - B.x0); c.beginPath(); c.ellipse(px, B.y0 + 6, 30 + r() * 50, 9, 0, 0, 7); c.fill(); } } });
        for (let i = 0; i < 7; i++) lilyPad(x, r, POND.cx - 150 + r() * 300, POND.cy - 30 + r() * 60, 1.5 + r() * 0.6, i % 3 === 0);
        bankFringe(x, r, pondPoly.filter(([, y]) => y < POND.cy - 20), { h: 46 });
        reeds(x, r, POND.cx + POND.rx - 30, POND.cy + 6, 16, 120, { spread: 70, heads: 0.5 });
        reeds(x, r, POND.cx - POND.rx + 20, POND.cy - 8, 10, 90, { spread: 40, heads: 0.4 });
        paper(x, 0.07);
      }, anim(ctx, t) { waterShimmer(ctx, pondPoly, t, { seed: 7, n: 40, flow: [6, 0], size: 1.6 }); } },
      { k: 1.3, front: true, paint(x, r, S, E) {
        x.fillStyle = '#4a7a3a'; x.fillRect(E.x0, 1690, E.x1 - E.x0, E.y1 - 1690);
        blades(x, r, E.x0, E.x1, px => 1690 + 10 * Math.sin(px / 67), Math.round((E.x1 - E.x0) / 2.5), { len: [50, 190], w: 8, clumps: 1 });
        fern(x, r, -300, 1640, 380, -0.95); fern(x, r, -200, 1700, 320, -0.6); fern(x, r, 3100, 1640, 380, -2.2); fern(x, r, 3000, 1700, 320, -2.5);
      } },
    ],
    props: [
      { id: 'owl_tree', x: OWL_TREE.x, y: 1000, base: OWL_TREE.base, solid: { rx: 96, ry: 24 }, bounds: [-280, -600, 1040, 1060],
        paint: (x, r) => bigTree(x, r, { ...OWL_TREE, light: L, hollow: OWL_TREE.hollow, branches: [MEADOW_BRANCH],
          back: [[200, -260, 900, 520]],
          canopy: [[420, -300, 1200, 620], [60, 60, 520, 340], [780, 40, 560, 320], [420, 230, 560, 260]],
          holes: 'rgba(200,225,235,.6)' }),
        ground: x => { contactShadow(x, OWL_TREE.x + 30, OWL_TREE.base + 4, 230, 36, 0.4); contactShadow(x, OWL_TREE.x + 200, OWL_TREE.base + 30, 420, 60, 0.18); },
        anchors: {
          owl_hollow: { type: 'hollow', x: OWL_TREE.hollow.cx, y: OWL_TREE.hollow.cy + OWL_TREE.hollow.ry - 2, clip: hollowClip(OWL_TREE.hollow), face: 'right' },
          low_branch: { type: 'perch', branch: MEADOW_BRANCH, at: 0.5 },
          branch_tip: { type: 'perch', branch: MEADOW_BRANCH, at: 0.86 },
        } },
      { id: 'stump', x: STUMP.cx, y: 996, base: STUMP.base, solid: { rx: 98, ry: 21 }, bounds: [1915, 860, 2185, 1040],
        paint: (x, r) => stump(x, r, STUMP, { light: L }),
        ground: x => contactShadow(x, STUMP.cx + 14, STUMP.base + 2, 130, 20, 0.45),
        anchors: { stump_top: { type: 'surface', x: STUMP.cx, y: STUMP.top + 1, surface: 'wood' } } },
      ...ROCKS.map(k => ({ id: k.id, x: k.x, y: k.y - k.h * 0.25, base: k.y, solid: { rx: k.w * 0.5, ry: k.h * 0.28 }, bounds: [k.x - k.w * 0.6, k.y - k.h - 6, k.x + k.w * 0.6, k.y + 6],
        paint: (x, r) => boulder(x, r, k.x, k.y, k.w, k.h, { light: L }),
        ground: x => contactShadow(x, k.x + 4, k.y, k.w * 0.7, k.h * 0.25, 0.4) })),
      { id: 'bush', x: 2720, y: 925, base: 935, solid: { rx: 118, ry: 22 }, bounds: [2560, 740, 2880, 960],
        paint: (x, r) => bush(x, r, 2720, 938, 300, 180, { light: L, berries: '#c8463a' }),
        ground: x => contactShadow(x, 2730, 936, 170, 22, 0.4) },
    ],
    anchors: {
      tree_foot: { x: 640, y: 1050 },
      stump_front: { x: 2050, y: 1075 },
      stump_side: { x: 1880, y: 1012 },
      meadow_centre: { x: 1400, y: 1060 },
      meadow_left: { x: 950, y: 1050 },
      meadow_right: { x: 1760, y: 1090 },
      far_meadow: { x: 1300, y: 900 },
      foreground: { x: 1550, y: 1260 },
      pond_edge: { x: 2200, y: 1200 },
      pond_far: { x: 2560, y: 1140 },
      bush_side: { x: 2540, y: 960 },
      rock_top: { type: 'surface', x: 1196, y: 1150, prop: 'rock_a', depth: 1181 },
    },
    walk: { region: [[-360, 850], [3160, 850], [3160, 1470], [-360, 1470]], water: [pondPoly] },
    ambience: { day: 'meadow-day', night: 'meadow-night' },
    sampleRoute: [[2380, 1360], 'pond_far'],
  });
}
