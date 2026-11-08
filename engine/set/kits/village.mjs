// The village edge: a timber-and-plaster cottage under a thatched roof, its cottage garden behind a white
// picket fence with an open gate, a flagstone path to the door, a stone well, a bench under an old tree
// with a low branch, a lantern post by the gate and a cobbled lane; beyond a dry-stone wall, neighbours'
// cottages among the trees and a far village with a church spire on the hill.
// At dusk the windows and the lantern light up: they fade in on the props themselves (before the grade)
// and S.drawLights() adds them again as emitted light after the grade, hidden by whatever stands in front.
import { lerp, clamp, noise1, canvas, rpoly, rng } from '../../core/lib.mjs';
import { makeSet, bandPoly } from '../set.mjs';
import { paper, hazeBand, blades, fern, ridge, contactShadow, LEFT, meadowFloor, pathBand, dirtPath, farHills, bigTree, smallTree, crown, tuft, treeline } from '../../paint/paint.mjs';
import { stonework, cottage, cottageGeom, cottageLights, picketFence, fencePost, gateLeaf, stoneWell, wellGeom, bench, benchGeom, wheelbarrow, lanternPost, lanternGeom, lanternBody,
  cobbles, flagstones, vegBed, cottageFlower, smallCottage, farVillage, farWindowsLit, worldCanvas, glow, lampLevel, WARM } from '../../paint/structures.mjs';

// ───────────── geometry (shared by painting and staging) ─────────────
export const HORIZON = 660, LANE_Y = 1160, BASE_S = 1.3 * 500 / 420;             // scale 1.3 at y = 1080
export const villageScale = y => Math.max(0.05, (BASE_S * (y - HORIZON)) / (LANE_Y - HORIZON));
export const villageLane = x => 1158 + 24 * Math.sin((x + 300) / 820);           // the cobbled lane's centre line
const LANE_HW = x => 31 * villageScale(villageLane(x));
export const villagePath = pathBand(-1200, 4400, villageLane, LANE_HW).P;          // the lane (cobbles)

export const COTTAGE = {
  x0: 740, x1: 1300, base: 880, wallH: 262, depth: [84, -48], roofH: 224, over: 34, drop: 16, plinth: 30,
  door: { cx: 1050, w: 108, h: 188 },
  windows: [{ cx: 862, top: 694, w: 98, h: 92 }, { cx: 1210, top: 694, w: 78, h: 92 }],
  dormer: { cx: 1050, w: 120, h: 60, up: 0.42 },
  chimney: { u: 0.13, w: 58, h: 96, pierce: 50 },
  gableWindow: { r: 20 },
};
export const COTTAGE_G = cottageGeom(COTTAGE);
export const FENCE_H = 64;                                                        // picket height in units
export const GARDEN = { x0: 690, x1: 1400, front: 1062, gate: [994, 1106], back: 884 };
export const GATE = { x: 1050, y: 1098 };
export const DOOR = { x: COTTAGE.door.cx, y: 904 };
export const FLAG_PATH = [[1050, 1084], [1050, 896]];
export const BEDS = [
  { id: 'bed_left', x0: 716, x1: 982, y0: 936, y1: 1030, rows: ['cabbage', 'lettuce', 'carrot', 'onion'], back: [{ kind: 'beans', x: 762 }] },
  { id: 'bed_right', x0: 1120, x1: 1346, y0: 936, y1: 1030, rows: ['pumpkin', 'lettuce', 'cabbage', 'carrot'] },
];
export const WELL = { x: 1650, base: 975, rx: 78, wallH: 56, postH: 168 };
export const WELL_G = wellGeom(WELL);
export const BENCH = { x: 2160, base: 960, w: 186, seatH: 45, seatUnits: 45 / villageScale(960) };
export const BENCH_G = benchGeom(BENCH);
export const LANTERN = { x: 1446, base: 1074, h: 290 * villageScale(1074), arm: 1, s: villageScale(1074) };
export const LANTERN_G = lanternGeom(LANTERN);
export const VILLAGE_TREE = { x: 2450, base: 905, w: 150, top: 230 };
export const VILLAGE_BRANCH = { pts: [[2412, 652], [2340, 636], [2240, 618], [2130, 612], [2060, 618]], w0: 30, w1: 9, leaves: 0.6 };
export const APPLE_TREE = { x: 380, base: 900 };
export const WHEELBARROW = { x: 572, base: 1108, s: villageScale(1108) };
const SIDE_L = [[GARDEN.x0, GARDEN.front], [712, GARDEN.back]], SIDE_R = [[GARDEN.x1, GARDEN.front], [1348, 864]];

// The walkable ground: the meadow and lane, with the cottage garden cut out except for its flagstone path and
// the strip along the cottage wall (so the door and windows can be reached only through the gate).
export const VILLAGE_REGION = [
  [-360, 852], [676, 852], [676, 1078], [1004, 1078], [1004, 922], [752, 922], [752, 887], [1292, 887], [1292, 922], [1096, 922], [1096, 1078],
  [1416, 1078], [1362, 866], [1368, 852], [3160, 852], [3160, 1470], [-360, 1470],
];

// Split a receding fence run into bays (one depth-sorted prop each).
const bays = (a, b, n) => Array.from({ length: n }, (_, i) => [[lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)], [lerp(a[0], b[0], (i + 1) / n), lerp(a[1], b[1], (i + 1) / n)]]);

export default function village(params = {}) {
  const L = LEFT, sAt = villageScale, G = COTTAGE_G;
  const lit = { far: [], mid: [] };                                     // far window rects, filled while the layers paint
  const fenceProps = [];
  const sideBay = (id, [a, b], last) => {
    const ya = Math.max(a[1], b[1]), yb = Math.min(a[1], b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    return { id, x: mx, y: ya - 1, base: ya, solid: { x: mx, y: my, rx: 12 + Math.abs(a[0] - b[0]) / 2, ry: (ya - yb) / 2 + 5 }, bounds: [Math.min(a[0], b[0]) - 30, yb - 110, Math.max(a[0], b[0]) + 30, ya + 10], inkW: 1.8,
      paint: (x, r) => picketFence(x, r, a, b, { sAt, h: FENCE_H, posts: [false, last], light: L }) };
  };
  bays(...SIDE_L, 2).forEach((ab, i) => fenceProps.push(sideBay(`fence_side_l${i + 1}`, ab, true)));
  bays(...SIDE_R, 2).forEach((ab, i) => fenceProps.push(sideBay(`fence_side_r${i + 1}`, ab, true)));
  const [g0, g1] = GARDEN.gate, F = GARDEN.front;

  const S = makeSet({
    id: 'village', W: 2800, H: 1500, refX: 1400, refY: 850, seed: params.seed || 0,
    area: { x0: -400, x1: 3200, y0: -380, y1: 1700 },
    view: { x0: 600, x1: 2300, y0: 300, y1: 1350 },
    horizon: HORIZON, laneY: LANE_Y, baseS: BASE_S, light: L, lane: villageLane,
    defaultSky: 'morning', surface: 'grass',
    layers: [
      // far hills and a dark band of forest along the horizon
      { k: 0.4, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, px => 650 - 64 * Math.sin(px / 420 + 0.6) - 22 * Math.sin(px / 150 + 1), { pal: ['#a8bfb6', '#b3c7bc', '#9fb8ae', '#bdcec2'], trees: ['#8aa69a', '#94aea2', '#a2baac'], light: L });
        treeline(x, r, E.x0, E.x1, px => 712 + 6 * Math.sin(px / 200), px => 640 + 22 * Math.sin(px / 260) + 14 * Math.sin(px / 77), { light: L, pal: ['#7f9c8c', '#88a494', '#93ad9c', '#a2baa8', '#b4c8b4'], interior: '#728e80', trunkCol: '#7a8a80', under: ['#86a290', '#90aa98', '#9cb4a2'], crownW: [120, 200], step: [60, 110], trunkW: [6, 10], density: 0.5 });
        hazeBand(x, E.x0, E.x1, 600, 760, '232,240,232', 0.45);
        paper(x, 0.05);
      } },
      // the village on the hill: rooftops among trees and the church spire
      { k: 0.6, outline: { w: 1.1, color: '#4a5a58', alpha: 0.4 }, paint(x, r, S, E) {
        const hill = px => 742 - 46 * Math.sin((px - 300) / 520) - 12 * Math.sin(px / 160);
        ridge(x, r, E.x0, E.x1, hill, { pal: ['#9cb69c', '#a8c0a4', '#93ae94', '#b2c8ac'] });
        lit.far = [...farVillage(x, r, -300, 900, px => hill(px) - 4, { light: L, n: 8, spire: 380 }), ...farVillage(x, r, 2100, 3300, px => hill(px) - 4, { light: L, n: 7 })];
        for (let px = E.x0; px < E.x1; px += 60 + r() * 120) { const h = 18 + r() * 20; crown(x, r, px, hill(px) + 30 - h * 0.3, h * 2.2, h, ['#7f9e86', '#8aa890', '#98b49c', '#aac2aa'], { light: L, lobes: 3, density: 0.7 }); }
        hazeBand(x, E.x0, E.x1, 680, 820, '232,238,226', 0.35);
        paper(x, 0.05);
      }, anim: farLights(lit, 'far') },
      // hedgerow trees, an orchard and two neighbours' cottages just beyond the wall
      { k: 0.82, outline: { w: 1.4, color: '#2f4a3a', alpha: 0.5 }, paint(x, r, S, E) {
        const base = px => 808 + 6 * Math.sin(px / 230);
        x.fillStyle = '#5c8450'; x.fillRect(E.x0, 806, E.x1 - E.x0, 260);
        for (let px = E.x0; px < E.x1; px += 200 + r() * 260) if (px < 420 || px > 1560) smallTree(x, r, px, base(px) + r() * 6, 190 + r() * 130, 250 + r() * 140, { light: L });
        lit.mid = [...smallCottage(x, r, 300, 812, 170, 92, { roof: 'tile', light: L }), ...smallCottage(x, r, 1880, 816, 150, 84, { roof: 'thatch', light: L, windows: 2 })];
        smallTree(x, r, 1700, 822, 260, 300, { light: L }); smallTree(x, r, 2120, 818, 220, 280, { light: L });
        for (let px = E.x0; px < E.x1; px += 40 + r() * 70) crown(x, r, px, 806 + r() * 8, 90 + r() * 80, 40 + r() * 26, ['#557f4a', '#64904f', '#7aa060', '#a2c084'], { light: L, lobes: 3 });
        paper(x, 0.06);
      }, anim: farLights(lit, 'mid') },
      // the ground: meadow, dry-stone wall, the lane, the garden path, flowers along the verge
      { k: 1, paint(x, r, S, E) {
        meadowFloor(x, r, E, { edge: px => 812 + 4 * Math.sin(px / 230), sAt: y => clamp(sAt(y), 0.35, 2.6), density: 1, flowerN: 0.8, hazeTo: 120 });
        // the dry-stone wall at the back of the green
        for (const [a, b] of [[E.x0, 720], [1330, E.x1]]) {
          const top = px => 818 + 3 * Math.sin(px / 90), bot = px => 846 + 2 * Math.sin(px / 130);
          stonework(x, r, rpoly(bandPoly(a, b, top, bot, 20), 6, { seed: Math.round(a) & 0xffff, jit: 1.6 }), { size: 13, rowH: 0.6, light: L });
          for (let px = a; px < b; px += 30 + r() * 40) tuft(x, r, px, bot(px) + 3, 26, 10 + r() * 10, { n: 6 });
          for (let px = a; px < b; px += 120 + r() * 200) { x.fillStyle = 'rgba(110,140,70,.8)'; for (let i = 0; i < 4; i++) { const yy = top(px) + 2; x.beginPath(); x.ellipse(px + i * 7, yy, 9, 3, 0, 0, 7); x.fill(); } }
        }
        // the cobbled lane, with grass creeping over its edges
        cobbles(x, r, villagePath, { sAt: y => clamp(sAt(y), 0.4, 2.6), size: 15, light: L });
        { const { T, B } = pathBand(-1200, 4400, villageLane, LANE_HW); for (const Ed of [T, B]) for (const [px, py] of Ed) { if (r() < 0.3) continue; const s = sAt(py); x.fillStyle = ['#8dbd5c', '#74a64e', '#a6cd6c'][Math.floor(r() * 3)]; x.beginPath(); x.ellipse(px + (r() - 0.5) * 12, py + (r() - 0.5) * 6, (5 + r() * 9) * s, (1.6 + r() * 2) * s, 0, 0, 7); x.fill(); } }
        // the garden: a darker lawn inside the fence, flagstones from the gate to the door, a gravel strip by the wall
        x.fillStyle = 'rgba(70,110,50,.18)'; x.beginPath(); x.moveTo(GARDEN.x0, F); x.lineTo(GARDEN.x1, F); x.lineTo(SIDE_R[1][0], SIDE_R[1][1]); x.lineTo(712, GARDEN.back); x.fill();
        dirtPath(x, r, 736, 1306, px => 902 + 1.5 * Math.sin(px / 60), px => 16 * clamp(Math.min((px - 736) / 70, (1306 - px) / 70), 0.05, 1), { col: '#bfab80', pal: ['#ad9a70', '#d2c29a', '#a08e66', '#c4b38a'], pebbleN: 2.4 });
        flagstones(x, r, FLAG_PATH[0], FLAG_PATH[1], 40, { sAt, light: L });
        // flowers along the verge outside the fence
        for (let px = GARDEN.x0 - 20; px < GARDEN.x1 + 20; px += 9 + r() * 12) { if (px > g0 - 20 && px < g1 + 20) continue; cottageFlower(x, r, px, F + 12 + r() * 8, sAt(F + 14)); }
        paper(x, 0.07);
      }, anim: (ctx, t, S2) => S2._groundGlow?.(ctx, t) },
      // the nearest grass and a couple of foxgloves framing the bottom corners
      { k: 1.3, front: true, paint(x, r, S, E) {
        blades(x, r, E.x0, E.x1, px => 1700 + 14 * Math.sin(px / 91), Math.round((E.x1 - E.x0) / 3), { len: [40, 180], w: 7, clumps: 1 });
        fern(x, r, -260, 1660, 360, -0.9); fern(x, r, 3060, 1660, 360, -2.3);
        for (const [px, k] of [[-120, 2.4], [-60, 2.1], [3000, 2.3], [2930, 2.0]]) cottageFlower(x, r, px, 1710, k * 2.2, 'foxglove');
      } },
    ],
    props: [
      { id: 'cottage', x: (G.x0 + G.x1) / 2, y: COTTAGE.base, base: COTTAGE.base, solid: { x: 1062, y: 856, rx: 300, ry: 22 }, bounds: G.bounds, res: 1.5, inkW: 2.4,
        paint: (x, r) => { S._cottage = cottage(x, r, COTTAGE, { light: L }); },
        ground: x => { contactShadow(x, 1060, 884, 380, 26, 0.45); contactShadow(x, 1250, 900, 300, 40, 0.18); },
        anchors: {
          chimney_top: { type: 'surface', x: G.chimneyTop[0], y: G.chimneyTop[1], surface: 'stone' },
          roof_ridge: { type: 'surface', x: G.ridgeAt(0.62)[0], y: G.ridgeAt(0.62)[1], surface: 'thatch' },
        } },
      ...BEDS.map(b => ({ id: b.id, x: (b.x0 + b.x1) / 2, y: b.y1, base: b.y1, solid: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, rx: (b.x1 - b.x0) / 2, ry: (b.y1 - b.y0) / 2 }, bounds: [b.x0 - 10, b.y0 - 140, b.x1 + 10, b.y1 + 10], inkW: 1.4,
        paint: (x, r) => vegBed(x, r, b, { sAt, light: L }) })),
      { id: 'fence_left', x: (GARDEN.x0 + g0) / 2, y: F, base: F, solid: { x: (GARDEN.x0 + g0) / 2 + 6, y: F, rx: (g0 - GARDEN.x0) / 2 + 8, ry: 9 }, bounds: [GARDEN.x0 - 30, F - 140, g0 + 10, F + 12], inkW: 1.8,
        paint: (x, r) => picketFence(x, r, [GARDEN.x0, F], [g0 - 8, F], { sAt, h: FENCE_H, posts: [true, false], light: L, flowers: 0.35 }) },
      { id: 'gate_post_l', x: g0, y: F + 1, base: F, solid: { x: g0, y: F, rx: 12, ry: 7 }, bounds: [g0 - 120, F - 150, g0 + 30, F + 12], inkW: 1.8,
        paint: (x, r) => { gateLeaf(x, r, [g0 - 4, F - 3], 100, 1.12, { sAt, h: FENCE_H * 0.94, dir: -1, light: L }); fencePost(x, r, [g0, F], sAt(F), { h: FENCE_H * 1.3, light: L }); } },
      { id: 'gate_post_r', x: g1, y: F + 1, base: F, solid: { x: g1, y: F, rx: 12, ry: 7 }, bounds: [g1 - 30, F - 150, g1 + 30, F + 12], inkW: 1.8,
        paint: (x, r) => fencePost(x, r, [g1, F], sAt(F), { h: FENCE_H * 1.3, light: L }) },
      { id: 'fence_right', x: (g1 + GARDEN.x1) / 2, y: F, base: F, solid: { x: (g1 + GARDEN.x1) / 2 - 6, y: F, rx: (GARDEN.x1 - g1) / 2 + 8, ry: 9 }, bounds: [g1 - 10, F - 140, GARDEN.x1 + 30, F + 12], inkW: 1.8,
        paint: (x, r) => picketFence(x, r, [g1 + 8, F], [GARDEN.x1, F], { sAt, h: FENCE_H, posts: [false, true], light: L, flowers: 0.35 }) },
      ...fenceProps,
      { id: 'well', x: WELL.x, y: WELL.base, base: WELL.base, solid: { x: WELL.x, y: WELL.base, rx: WELL.rx + 4, ry: WELL_G.ry + 4 }, bounds: WELL_G.bounds, res: 1.25,
        paint: (x, r) => stoneWell(x, r, WELL, { light: L }),
        ground: x => { contactShadow(x, WELL.x + 10, WELL.base + 6, WELL.rx * 1.35, 26, 0.45); },
        anchors: { well_rim: { type: 'surface', x: WELL.x - 22, y: WELL_G.rimFront - 2, surface: 'stone', depth: WELL.base + WELL_G.ry + 2 } } },
      { id: 'bench', x: BENCH.x, y: BENCH.base - 2, base: BENCH.base, solid: { x: BENCH.x, y: BENCH.base - 8, rx: BENCH.w / 2 + 6, ry: 14 }, bounds: BENCH_G.bounds, res: 1.25, inkW: 2,
        paint: (x, r) => bench(x, r, BENCH, { light: L }),
        ground: x => contactShadow(x, BENCH.x + 8, BENCH.base, BENCH.w * 0.62, 14, 0.45),
        anchors: {
          bench_seat: { type: 'surface', x: BENCH.x, y: BENCH_G.y, depth: BENCH.base + 1, surface: 'wood' },
          bench_left: { type: 'surface', x: BENCH.x - BENCH.w * 0.27, y: BENCH_G.y, depth: BENCH.base + 1, surface: 'wood' },
          bench_right: { type: 'surface', x: BENCH.x + BENCH.w * 0.27, y: BENCH_G.y, depth: BENCH.base + 1, surface: 'wood' },
        } },
      { id: 'lantern', x: LANTERN.x, y: LANTERN.base, base: LANTERN.base, solid: { x: LANTERN.x, y: LANTERN.base, rx: 12, ry: 6 }, bounds: LANTERN_G.bounds, res: 1.5, inkW: 1.8,
        paint: (x, r) => lanternPost(x, r, LANTERN, { light: L }),
        ground: x => contactShadow(x, LANTERN.x + 4, LANTERN.base + 2, 24, 7, 0.45) },
      { id: 'tree', x: VILLAGE_TREE.x, y: 895, base: VILLAGE_TREE.base, solid: { x: VILLAGE_TREE.x, y: 900, rx: 100, ry: 24 }, bounds: [VILLAGE_TREE.x - 900, -600, VILLAGE_TREE.x + 800, 950],
        paint: (x, r) => bigTree(x, r, { ...VILLAGE_TREE, light: L, branches: [VILLAGE_BRANCH], roots: 5,
          back: [[VILLAGE_TREE.x + 40, -40, 1100, 520]],
          canopy: [[VILLAGE_TREE.x + 20, 20, 1100, 480], [VILLAGE_TREE.x - 400, 210, 520, 300], [VILLAGE_TREE.x + 400, 220, 560, 320], [VILLAGE_TREE.x + 60, 320, 500, 220], [VILLAGE_TREE.x + 560, 380, 360, 220]],
          holes: 'rgba(200,225,235,.6)' }),
        ground: x => { contactShadow(x, VILLAGE_TREE.x + 20, VILLAGE_TREE.base + 4, 240, 38, 0.42); contactShadow(x, VILLAGE_TREE.x - 160, 960, 420, 70, 0.16); },
        anchors: {
          low_branch: { type: 'perch', branch: VILLAGE_BRANCH, at: 0.45 },
          branch_tip: { type: 'perch', branch: VILLAGE_BRANCH, at: 0.86 },
        } },
      { id: 'apple_tree', x: APPLE_TREE.x, y: APPLE_TREE.base - 4, base: APPLE_TREE.base, solid: { x: APPLE_TREE.x, y: APPLE_TREE.base - 2, rx: 34, ry: 10 }, bounds: [APPLE_TREE.x - 260, 420, APPLE_TREE.x + 260, APPLE_TREE.base + 12],
        paint: (x, r) => appleTree(x, r, APPLE_TREE.x, APPLE_TREE.base, L),
        ground: x => contactShadow(x, APPLE_TREE.x + 16, APPLE_TREE.base + 2, 120, 18, 0.35) },
      { id: 'wheelbarrow', x: WHEELBARROW.x, y: WHEELBARROW.base - 4, base: WHEELBARROW.base, solid: { x: WHEELBARROW.x, y: WHEELBARROW.base - 6, rx: 100 * WHEELBARROW.s, ry: 16 }, bounds: [WHEELBARROW.x - 120 * WHEELBARROW.s, WHEELBARROW.base - 160 * WHEELBARROW.s, WHEELBARROW.x + 100 * WHEELBARROW.s, WHEELBARROW.base + 12],
        paint: (x, r) => wheelbarrow(x, r, WHEELBARROW, { light: L }),
        ground: x => contactShadow(x, WHEELBARROW.x + 10, WHEELBARROW.base + 2, 120 * WHEELBARROW.s, 14, 0.4) },
    ],
    anchors: {
      door_front: { x: DOOR.x, y: DOOR.y, face: 'left' },
      gate: { x: GATE.x, y: GATE.y },
      garden_path: { x: 1050, y: 990 },
      window_left: { x: COTTAGE.windows[0].cx, y: 904 },
      window_right: { x: COTTAGE.windows[1].cx, y: 904 },
      lantern_foot: { x: LANTERN.x + 64, y: 1094 },
      well_side: { x: WELL.x - 128, y: 1000 },
      well_front: { x: WELL.x, y: 1050 },
      bench_front: { x: BENCH.x, y: 1008 },
      tree_foot: { x: 2310, y: 950 },
      lane_west: { x: 300, y: villageLane(300) },
      lane_mid: { x: 1400, y: villageLane(1400) },
      lane_east: { x: 2500, y: villageLane(2500) },
      orchard: { x: 560, y: 940 },
      meadow_back: { x: 1900, y: 880 },
      foreground: { x: 1500, y: 1300 },
    },
    walk: { region: VILLAGE_REGION, paths: [{ poly: villagePath, surface: 'stone' }, { poly: [[1010, 1084], [1090, 1084], [1090, 896], [1010, 896]], surface: 'stone' }, { poly: [[746, 881], [1296, 881], [1296, 920], [746, 920]], surface: 'gravel' }] },
    ambience: { day: 'village-day', night: 'village-night' },
    sampleRoute: ['lane_west', 'door_front'],
  });
  S._lit = lit;
  return addLights(S);
}

// The far layers' lit windows, drawn right after their layer (inside drawBack), faded by the lamp level.
function farLights(lit, key) {
  let cache = null;
  return (ctx, t, S) => {
    const a = S.lamps || 0; if (a < 0.01 || !lit[key].length) return;
    if (!cache) cache = litRects(lit[key]);
    ctx.save(); ctx.globalAlpha = a; ctx.drawImage(cache.c, cache.x0, cache.y0, cache.w, cache.h); ctx.restore();
  };
}
function litRects(wins) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [wx, wy, ww, wh] of wins) { x0 = Math.min(x0, wx - 30); y0 = Math.min(y0, wy - 30); x1 = Math.max(x1, wx + ww + 30); y1 = Math.max(y1, wy + wh + 30); }
  return worldCanvas([x0, y0, x1, y1], 1, x => farWindowsLit(x, wins));
}

// A young apple tree with red apples.
function appleTree(x, r, cx, base, L) {
  smallTree(x, r, cx, base, 300, 420, { light: L, pal: ['#3e6a40', '#4a784a', '#5c8a52', '#76a05e', '#9cbc78', '#bcd496'], trunkCol: '#6a5240', inkW: 1.6 });
  for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()), px = cx + Math.cos(a) * d * 120, py = base - 420 * 0.68 + Math.sin(a) * d * 95; x.fillStyle = ['#c8382e', '#d84a34', '#b02a28'][i % 3]; x.beginPath(); x.arc(px, py, 5.5, 0, 7); x.fill(); x.fillStyle = 'rgba(255,220,190,.7)'; x.beginPath(); x.arc(px - 1.6, py - 1.8, 1.6, 0, 7); x.fill(); }
  for (let i = 0; i < 4; i++) { const px = cx - 90 + r() * 200; x.fillStyle = '#c8382e'; x.beginPath(); x.arc(px, base + 4 + r() * 10, 5, 0, 7); x.fill(); }
  tuft(x, r, cx, base + 6, 80, 16, { n: 10 });
}

// ───────────── lamps ─────────────
// S.lamps (0..1) is set from the sky passed to drawSky (or opts.lights / opts.sky in drawBack). The cottage
// windows and the lantern fade in on their props; S.drawLights() is the emitted light, for after the grade.
function addLights(S) {
  const G = COTTAGE_G, LG = LANTERN_G, nz = noise1(311);
  S.lightLevel = lampLevel;
  S.lamps = 0;
  const cache = {};
  const cottageLit = () => cache.cottage ??= worldCanvas([G.x0 - 60, G.ridgeY - 20, G.x1 + G.ox + 60, G.yb + 40], 1.5, x => cottageLights(x, rng(4105), G));
  const lanternLit = () => cache.lantern ??= worldCanvas([LG.glass.x0 - 30, LG.glass.y0 - 40, LG.glass.x1 + 30, LG.glass.y1 + 30], 2, x => lanternBody(x, rng(4106), LG, 1));
  const flick = (t, k = 1) => 1 - k * 0.12 * (nz(t * 7.3) * 0.7 + nz(t * 2.1 + 40) * 0.3);
  const lampHalo = (x, t, a) => { const [lx, ly] = LG.lamp, f = flick(t); glow(x, lx, ly, 3, 190 * LG.s * f, WARM.rgb, 0.5 * a * f); glow(x, lx, ly, 1, 46 * LG.s, '255,236,190', 0.7 * a); };
  const winHalo = (x, a) => { for (const w of G.windows) glow(x, w.cx, (w.y0 + w.y1) / 2, 4, w.w * 1.05, WARM.rgb, 0.24 * a); if (G.dormer) glow(x, G.dormer.cx, (G.dormer.y0 + G.dormer.y1) / 2 + 6, 4, G.dormer.w * 0.8, WARM.rgb, 0.2 * a); };
  const pool = (x, t, a) => { const f = flick(t); x.save(); x.translate(LG.lamp[0] - 10, LANTERN.base + 10); x.scale(1, 0.3); glow(x, 0, 0, 4, 200 * LG.s * f, WARM.rgb, 0.55 * a); x.restore(); };
  const draw = (x, k, a) => { x.save(); x.globalAlpha = a; x.drawImage(k.c, k.x0, k.y0, k.w, k.h); x.restore(); };
  const screen = (x, fn) => { x.save(); x.globalCompositeOperation = 'screen'; fn(); x.restore(); };

  // pre-grade: the ground pool (from the ground layer's anim), and the props' own lit state
  S._groundGlow = (ctx, t) => { const a = S.lamps; if (a > 0.01) screen(ctx, () => pool(ctx, t, a * 0.8)); };
  const level = opts => (opts?.lights != null ? clamp(+opts.lights) : opts?.sky != null ? lampLevel(opts.sky) : null);
  const sky0 = S.drawSky, back0 = S.drawBack, props0 = S.propsSorted;
  S.drawSky = (ctx, cam, sky, t) => { S.lamps = lampLevel(sky ?? S.defaultSky); return sky0(ctx, cam, sky, t); };
  S.drawBack = (ctx, cam, opts = {}) => { const l = level(opts); if (l != null) S.lamps = l; S._t = opts.t ?? 0; return back0(ctx, cam, opts); };
  S.propsSorted = () => props0().map(it => {
    if (it.id === 'cottage') return { ...it, draw: ctx => { it.draw(ctx); const a = S.lamps; if (a > 0.01) { draw(ctx, cottageLit(), a); screen(ctx, () => winHalo(ctx, a * 0.7)); } } };
    if (it.id === 'lantern') return { ...it, draw: ctx => { it.draw(ctx); const a = S.lamps; if (a > 0.01) { draw(ctx, lanternLit(), a); screen(ctx, () => lampHalo(ctx, S._t || 0, a * 0.6)); } } };
    return it;
  });

  // post-grade emitted light, occluded by layers, props and the caller's actors in depth order
  const emitByLayer = { 1: 'far', 2: 'mid' };
  const farCache = {};
  const buf = { c: null, x: null, m: null, mx: null };
  S.drawLights = (ctx, cam, opts = {}) => {
    const a = level(opts) ?? (opts.haze != null ? lampLevel(opts.haze) : S.lamps);
    if (!(a > 0.01)) return false;
    if (!S.built) S.build();
    const t = opts.t ?? 0, cw = ctx.canvas.width, ch = ctx.canvas.height, T = ctx.getTransform();
    if (!buf.c || buf.c.width !== cw || buf.c.height !== ch) { [buf.c, buf.x] = canvas(cw, ch); [buf.m, buf.mx] = canvas(cw, ch); }
    const x = buf.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, cw, ch); x.setTransform(T);
    const erase = (img, x0, y0, w, h) => { x.globalCompositeOperation = 'destination-out'; x.drawImage(img, x0, y0, w, h); x.globalCompositeOperation = 'source-over'; };
    for (const [i, ly] of S.L.entries()) {
      if (ly.front || ly.k > 1) continue;
      const dx = (cam.cx - S.refX) * (1 - ly.k), dy = (cam.cy - S.refY) * (1 - ly.k) * 0.4;
      erase(ly.c, ly.E.x0 + dx, ly.E.y0 + dy, ly.c.width / ly.res, ly.c.height / ly.res);
      const key = emitByLayer[i];
      if (key && S._lit[key].length) { const k = farCache[key] ??= litRects(S._lit[key]); x.save(); x.translate(dx, dy); x.drawImage(k.c, k.x0, k.y0, k.w, k.h); x.restore(); }
      if (ly.k === 1) pool(x, t, 0.9);
    }
    const items = [...S.props.map(p => ({ y: p.y, p })), ...(opts.occluders || []).map(o => ({ y: o.y, o }))].sort((u, v) => u.y - v.y || (u.p ? -1 : 1));
    for (const it of items) {
      if (it.p) {
        erase(it.p.sprite, it.p.sx, it.p.sy, it.p.sw, it.p.sh);
        if (it.p.id === 'cottage') { draw(x, cottageLit(), 1); winHalo(x, 1); }
        if (it.p.id === 'lantern') { draw(x, lanternLit(), 1); lampHalo(x, t, 1); }
      } else {
        const m = buf.mx; m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, cw, ch); m.setTransform(T); it.o.draw(m);
        x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(buf.m, 0, 0); x.restore();
      }
    }
    for (const ly of S.L) if (ly.front || ly.k > 1) { const dx = (cam.cx - S.refX) * (1 - ly.k), dy = (cam.cy - S.refY) * (1 - ly.k) * 0.4; erase(ly.c, ly.E.x0 + dx, ly.E.y0 + dy, ly.c.width / ly.res, ly.c.height / ly.res); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(a); ctx.drawImage(buf.c, 0, 0); ctx.restore();
    return true;
  };
  return S;
}
