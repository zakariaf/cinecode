// The stream: a brook winding from the far meadow toward the viewer, cutting the course path in two.
// Four stepping stones cross it; a frog's rock sits mid-stream; reeds and sedge line the banks.
import { makeSet } from '../set.mjs';
import { paper, blades, fern, reeds, contactShadow, paintWater, waterShimmer, bankFringe, LEFT, meadowFloor, dirtPath, pathBand, treeline, farHills, steppingStone, boulder, bush, crown } from '../../paint/paint.mjs';

export const streamX = y => 1300 + 60 * Math.sin((y - 720) / 120);
export const streamHW = y => Math.max(0, 20 + (y - 720) * 0.6);
export const STONES = [1170, 1270, 1370, 1470].map((x, i) => ({ id: `stone_${i + 1}`, x, top: 1043 + (i % 2) * 3, rx: 43, ry: 10 }));
export const FROG_ROCK = { x: 1430, top: 1118, rx: 24, ry: 7 };
export const BANKS = { left: 1070, right: 1580 };
export const streamGround = x => 1050 + 5 * Math.sin(x / 300);
const waterL = [], waterR = [];
for (let y = 790; y <= 1760; y += 10) { const w = streamHW(y) * (1 + 0.04 * Math.sin(y / 23)); waterL.push([streamX(y) - w, y]); waterR.push([streamX(y) + w, y]); }
export const WATER = [...waterL, ...waterR.reverse()];
const PATHS = [[-1200, 1300, streamGround, () => 26], [1300, 4400, streamGround, () => 26]];
export const streamPaths = PATHS.map(p => pathBand(...p).P);

export default function stream(params = {}) {
  const L = LEFT, sAt = y => 0.45 + (y - 800) / 520;
  return makeSet({
    id: 'stream', W: 2800, H: 1400, refX: 1400, refY: 860, seed: params.seed || 0,
    area: { x0: -400, x1: 3200, y0: -300, y1: 1700 },
    view: { x0: 700, x1: 2100, y0: 420, y1: 1350 },
    horizon: 700, laneY: 1050, baseS: 1.3, light: L, lane: streamGround,
    defaultSky: 'morning',
    layers: [
      { k: 0.42, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, px => 676 - 50 * Math.sin(px / 420) - 20 * Math.sin(px / 150), { pal: ['#a8c0b4', '#b2c8ba', '#9fb8ac', '#bccfc0'], trees: ['#8aa898', '#94b0a0', '#a4bcaa'], light: L });
        paper(x, 0.05);
      } },
      { k: 0.78, outline: { w: 1.5, color: '#2f4a3a', alpha: 0.5 }, paint(x, r, S, E) {
        const base = px => 806 + 6 * Math.sin(px / 190);
        x.fillStyle = '#4c7650'; x.fillRect(E.x0, 812, E.x1 - E.x0, 260);
        treeline(x, r, E.x0, E.x1, base, px => 480 + 60 * Math.sin(px / 170) + 30 * Math.sin(px / 61), { light: L, crownW: [220, 360], step: [110, 200], trunkW: [16, 28], pal: ['#3e6448', '#4a7050', '#5c845a', '#7a9e68', '#a3bc84'], haze: '226,236,222', density: 0.7 });
        paper(x, 0.06);
      } },
      { k: 1, paint(x, r, S, E) {
        meadowFloor(x, r, E, { edge: px => 800 + 4 * Math.sin(px / 210), sAt, density: 1, flowerN: 0.8 });
        for (const p of PATHS) dirtPath(x, r, ...p);
        paintWater(x, r, WATER, { far: '#d2e6e6', mid: '#8cbccb', deep: '#3d7a8e', bank: '#5a7a3a', bankW: 11, ripples: 1.2, flow: 1 });
        bankFringe(x, r, waterL, { h: 54, every: 10 }); bankFringe(x, r, waterR, { h: 54, every: 10 });
        for (let px = 1150; px < 1470; px += 26 + r() * 26) crown(x, r, px, 800 - r() * 6, 70 + r() * 50, 34 + r() * 14, ['#4f7a4c', '#5f8a56', '#76a062', '#a8c088'], { light: L, lobes: 3 });
        reeds(x, r, 1250, 812, 10, 60, { spread: 120, heads: 0.3 }); reeds(x, r, 1380, 812, 10, 56, { spread: 120, heads: 0.3 });
        for (const [cx, cy, n, h] of [[1040, 990, 12, 120], [1610, 1000, 12, 130], [990, 1190, 14, 150], [1700, 1230, 14, 160], [1560, 880, 8, 90], [1080, 870, 8, 80]]) reeds(x, r, cx, cy, n, h, { spread: 60, heads: 0.45 });
        paper(x, 0.06);
      }, anim(ctx, t) { waterShimmer(ctx, WATER, t, { seed: 3, n: 140, flow: [0, 34], size: 1.3, alpha: 0.6 }); } },
      { k: 1.3, front: true, paint(x, r, S, E) {
        blades(x, r, E.x0, E.x1, px => 1700 + 14 * Math.sin(px / 83), Math.round((E.x1 - E.x0) / 6), { len: [40, 170], w: 7, clumps: 1 });
        fern(x, r, 3060, 1660, 360, -2.3); fern(x, r, -260, 1680, 340, -0.8);
      } },
    ],
    props: [
      ...STONES.map(st => ({ id: st.id, x: st.x, y: st.top - 4, base: st.top, top: { x: st.x, y: st.top, rx: st.rx, ry: st.ry },
        bounds: [st.x - st.rx - 8, st.top - st.ry - 6, st.x + st.rx + 8, st.top + st.ry * 2.2], paint: (x, r) => steppingStone(x, r, st, { light: L }) })),
      { id: 'frog_rock', x: FROG_ROCK.x, y: FROG_ROCK.top - 4, base: FROG_ROCK.top, top: { x: FROG_ROCK.x, y: FROG_ROCK.top, rx: FROG_ROCK.rx, ry: FROG_ROCK.ry },
        bounds: [FROG_ROCK.x - 34, FROG_ROCK.top - 12, FROG_ROCK.x + 34, FROG_ROCK.top + 18], paint: (x, r) => steppingStone(x, r, FROG_ROCK, { light: L }) },
      { id: 'bank_rock', x: 2050, y: 1196, base: 1210, solid: { rx: 58, ry: 15 }, bounds: [1980, 1140, 2120, 1220],
        paint: (x, r) => boulder(x, r, 2050, 1210, 112, 58, { light: L }), ground: x => contactShadow(x, 2054, 1210, 76, 13, 0.45) },
      { id: 'willow_bush', x: 640, y: 950, base: 962, solid: { rx: 120, ry: 22 }, bounds: [480, 760, 800, 970],
        paint: (x, r) => bush(x, r, 640, 964, 300, 190, { light: L }), ground: x => contactShadow(x, 650, 964, 160, 22, 0.42) },
    ],
    anchors: {
      bank_left: { x: 1000, y: 1052 },
      bank_right: { x: 1660, y: 1054 },
      path_west: { x: 500, y: streamGround(500) },
      path_east: { x: 2300, y: streamGround(2300) },
      near_left: { x: 860, y: 1230 },
      near_right: { x: 1880, y: 1250 },
      far_bank: { x: 1640, y: 900 },
      stone_1: { type: 'surface', prop: 'stone_1', x: STONES[0].x, y: STONES[0].top, depth: STONES[0].top },
      stone_2: { type: 'surface', prop: 'stone_2', x: STONES[1].x, y: STONES[1].top, depth: STONES[1].top },
      stone_3: { type: 'surface', prop: 'stone_3', x: STONES[2].x, y: STONES[2].top, depth: STONES[2].top },
      stone_4: { type: 'surface', prop: 'stone_4', x: STONES[3].x, y: STONES[3].top, depth: STONES[3].top },
      frog_rock: { type: 'surface', prop: 'frog_rock', x: FROG_ROCK.x, y: FROG_ROCK.top - 2, depth: FROG_ROCK.top },
    },
    walk: { region: [[-360, 850], [3160, 850], [3160, 1460], [-360, 1460]], water: [WATER], stones: [...STONES.map(s => s.id), 'frog_rock'], hop: 34, paths: streamPaths.map(poly => ({ poly, surface: 'dirt' })) },
    ambience: { day: 'stream', night: 'stream' },
    sampleRoute: ['near_left', 'path_east'],
  });
}
