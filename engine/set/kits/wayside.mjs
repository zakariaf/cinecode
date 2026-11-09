// The wayside: a great old tree beside the course path, a long low branch reaching left over a shady nap
// spot among its roots, a signpost at the fork, open meadow and soft hills beyond.
import { makeSet } from '../set.mjs';
import { paper, blades, fern, contactShadow, LEFT, meadowFloor, dirtPath, pathBand, farHills, bigTree, treeSkirt, boulder, signpost, smallTree, crown } from '../../paint/paint.mjs';

export const WAY_TREE = { x: 1560, base: 985, w: 175, top: 260 };
export const WAY_BRANCH = { pts: [[1515, 648], [1470, 640], [1330, 612], [1180, 600], [1060, 608]], w0: 34, w1: 10, leaves: 0.62 };
export const NAP = { x: 1390, y: 1014 };
export const waysideGround = x => 1080 + 6 * Math.sin(x / 340);
const PATH = [-1200, 4400, waysideGround, () => 28];
export const waysidePath = pathBand(...PATH).P;
const SIGN = { x: 2240, base: 1044 };

export default function wayside(params = {}) {
  const L = LEFT, sAt = y => 0.45 + (y - 850) / 520;
  return makeSet({
    id: 'wayside', W: 2800, H: 1500, refX: 1400, refY: 850, seed: params.seed || 0,
    area: { x0: -400, x1: 3200, y0: -380, y1: 1700 },
    view: { x0: 700, x1: 2200, y0: 350, y1: 1350 },
    horizon: 720, laneY: 1080, baseS: 1.3, light: L, lane: waysideGround,
    defaultSky: 'morning',
    layers: [
      { k: 0.4, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, px => 690 - 70 * Math.sin(px / 380) - 24 * Math.sin(px / 140 + 1), { pal: ['#a9c0b2', '#b4c9b8', '#9fb8aa', '#c0d1c0'], trees: ['#8aa898', '#94b0a0', '#a4bcaa'], light: L });
        farHills(x, r, E.x0, E.x1, px => 760 - 40 * Math.sin(px / 300 + 2), { pal: ['#98b494', '#a4bea0', '#8eac8c', '#b0c8aa'], trees: ['#7c9c80', '#86a688', '#94b094'], light: L, every: [40, 140] });
        paper(x, 0.05);
      } },
      { k: 0.8, outline: { w: 1.4, color: '#2f4a3a', alpha: 0.5 }, paint(x, r, S, E) {
        x.fillStyle = '#5a8250'; x.fillRect(E.x0, 846, E.x1 - E.x0, 240);
        for (let px = E.x0; px < E.x1; px += 300 + r() * 380) smallTree(x, r, px, 846 + r() * 10, 200 + r() * 120, 260 + r() * 110, { light: L });
        for (let px = E.x0; px < E.x1; px += 46 + r() * 70) crown(x, r, px, 836, 110 + r() * 90, 46 + r() * 26, ['#5a8450', '#6a925a', '#82a86a', '#aac48a'], { light: L, lobes: 3 });
        paper(x, 0.06);
      } },
      { k: 1, paint(x, r, S, E) {
        meadowFloor(x, r, E, { edge: px => 846 + 4 * Math.sin(px / 230), sAt, density: 1, flowerN: 1 });
        dirtPath(x, r, ...PATH);
        // the tree's shade pool on the grass under the branch (soft, cool)
        contactShadow(x, 1420, 1010, 360, 52, 0.22, '30,50,40');
        paper(x, 0.07);
      } },
      { k: 1.3, front: true, paint(x, r, S, E) {
        blades(x, r, E.x0, E.x1, px => 1700 + 14 * Math.sin(px / 91), Math.round((E.x1 - E.x0) / 3), { len: [40, 180], w: 7, clumps: 1 });
        fern(x, r, -260, 1660, 360, -0.9); fern(x, r, 3060, 1660, 360, -2.3);
      } },
    ],
    props: [
      { id: 'way_tree', x: WAY_TREE.x, y: 975, base: WAY_TREE.base, inkFloor: treeSkirt(WAY_TREE).inkFloor, solid: { rx: 112, ry: 26 }, bounds: [WAY_TREE.x - 1000, -600, WAY_TREE.x + 900, 1030],
        paint: (x, r) => bigTree(x, r, { ...WAY_TREE, light: L, branches: [WAY_BRANCH], roots: 5,
          back: [[WAY_TREE.x - 60, -60, 1300, 560]],
          canopy: [[WAY_TREE.x - 40, 40, 1300, 520], [WAY_TREE.x - 520, 250, 560, 300], [WAY_TREE.x + 420, 230, 600, 320], [WAY_TREE.x + 60, 330, 520, 220], [WAY_TREE.x + 330, 420, 520, 220], [WAY_TREE.x + 620, 380, 380, 240]],
          holes: 'rgba(200,225,235,.6)' }),
        ground: x => { contactShadow(x, WAY_TREE.x + 20, WAY_TREE.base + 4, 260, 40, 0.42); },
        anchors: {
          way_branch: { type: 'perch', branch: WAY_BRANCH, at: 0.45 },
          branch_end: { type: 'perch', branch: WAY_BRANCH, at: 0.85 },
          branch_base: { type: 'perch', branch: WAY_BRANCH, at: 0.15 },
        } },
      { id: 'signpost', x: SIGN.x, y: SIGN.base - 4, base: SIGN.base, solid: { rx: 16, ry: 6 }, bounds: [SIGN.x - 100, SIGN.base - 170, SIGN.x + 100, SIGN.base + 10],
        paint: (x, r) => signpost(x, r, SIGN.x, SIGN.base, { light: L, h: 150 }), ground: x => contactShadow(x, SIGN.x + 4, SIGN.base, 30, 7, 0.45) },
      { id: 'mile_stone', x: 760, y: 1150, base: 1162, solid: { rx: 44, ry: 12 }, bounds: [700, 1100, 820, 1170],
        paint: (x, r) => boulder(x, r, 760, 1162, 86, 50, { light: L }), ground: x => contactShadow(x, 764, 1162, 56, 10, 0.45) },
    ],
    anchors: {
      nap: { x: NAP.x, y: NAP.y },
      tree_shade: { x: 1200, y: 1030 },
      roots_front: { x: 1600, y: 1040 },
      path_west: { x: 500, y: waysideGround(500) },
      path_mid: { x: 1400, y: waysideGround(1400) },
      path_east: { x: 2400, y: waysideGround(2400) },
      sign: { x: 2160, y: 1095 },
      meadow_near: { x: 1300, y: 1240 },
      far_field: { x: 2000, y: 930 },
    },
    walk: { region: [[-360, 892], [3160, 892], [3160, 1460], [-360, 1460]], paths: [{ poly: waysidePath, surface: 'dirt' }] },
    ambience: { day: 'meadow-day', night: 'meadow-night' },
    sampleRoute: ['tree_shade', 'far_field'],
  });
}
