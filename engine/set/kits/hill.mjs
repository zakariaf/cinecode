// The hill and the goal: a long grassy slope rising left to right to a crest with an old standing stone,
// a hawthorn beyond it, hazy ranges behind. A ridge set: actors walk a band just below the crest line.
// By night (S.night, 0..1, from the sky given to drawSky / drawBack) the hill re-lights itself for the moon, which
// stands where the sun did (upper right): the slope sinks into a cool shadow that deepens toward the viewer, the
// crest keeps a moonlit rim, its tussocks take the crest's shade whole (S.tufts: no lighter band across their feet), the
// far ranges drop back with the trees on their crests (as soft as the frame draws them), and the stone is washed with moonlight on its
// moonward face — so under the night grade the stone is the brightest shape on the land and the crest still reads.
import { smooth, clump, path } from '../../core/lib.mjs';
import { makeSet, resTier, scaleOf } from '../set.mjs';
import { paper, blades, contactShadow, RIGHT, GRASS, ridge, flowers, grassField, farHills, dirtPath, pathBand, standingStone, standingStoneMoon, standingStoneFoot, stoneSkirt, stoneTop, boulder, tuft, crown, paintTrunk, nightLevel } from '../../paint/paint.mjs';
import { worldCanvas } from '../../paint/structures.mjs';

export const hillGround = x => 1190 - 430 * smooth(300, 2150, x) + 8 * Math.sin(x / 260);
export const STONE = { x: 2420, w: 120, h: 270 };
STONE.base = hillGround(STONE.x); STONE.scarf = [STONE.x, STONE.base - STONE.h * 0.21];
export const BAND = 60;
export const STONE_RES = 8;   // the stone's sharpest sprite: close-ups frame its tip at zoom 8–10
const ROCKS = [{ id: 'rock_low', x: 900, w: 60, h: 26 }, { id: 'rock_mid', x: 1700, w: 46, h: 22 }, { id: 'rock_high', x: 2900, w: 70, h: 30 }];
const THORN = { x: 3120 };
// the grass at the stone's foot, in the slope's own sunlit greens
const STONE_GRASS = { back: ['#5a8a40', '#4f7d3a', '#679448'], front: ['#7aa856', '#88b462', '#94bc68', '#a2c870'], tips: ['#b8d08a', '#d4e2a0', '#c2da82'], ground: ['#88b05c', '#7aa452'] };
const PATH = [-900, 4400, x => hillGround(x) + 24, () => 15];
export const hillPath = pathBand(...PATH).P;

// the far ranges' crest lines (the night pass darkens them inside the same outlines)
const farA = px => 740 - 70 * Math.sin(px / 340) - 35 * Math.sin(px / 130 + 1), farB = px => 850 - 45 * Math.sin(px / 260 + 2), farC = px => 960 - 40 * Math.sin(px / 210 + 1) - 20 * Math.sin(px / 90);

export default function hill(params = {}) {
  const L = RIGHT, g = hillGround;
  const S = makeSet({
    id: 'hill', W: 3300, H: 1500, refX: 1650, refY: 800, seed: params.seed || 0,
    area: { x0: -500, x1: 3800, y0: -400, y1: 1700 },
    view: { x0: 800, x1: 2900, y0: 350, y1: 1250 },
    horizon: 600, laneY: 1000, baseS: 1.3, light: L, bandScale: 0.0025,
    defaultSky: 'golden',
    layers: [
      { k: 0.4, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, farA, { pal: ['#a9b0b2', '#b1b8b8', '#b9c0bc', '#a2aaae'], trees: ['#94a09c', '#9ca8a2', '#a6b0aa'], light: L, every: [50, 160] });
        farHills(x, r, E.x0, E.x1, farB, { pal: ['#93a48e', '#9bab94', '#a4b29a', '#8c9e88'], trees: ['#7c8e78', '#86987e', '#90a086'], light: L, every: [40, 120] });
        paper(x, 0.05);
      }, shade: S2 => S2._farShade?.(0.4) },
      { k: 0.7, paint(x, r, S, E) {
        farHills(x, r, E.x0, E.x1, farC, { pal: ['#7f9a72', '#88a27a', '#92aa82', '#7a946c'], trees: ['#5c7a56', '#66845e', '#729068'], light: L, every: [30, 90], size: [26, 60] });
        paper(x, 0.06);
      }, shade: S2 => S2._farShade?.(0.7) },
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
        // the lit crest: tussocks along the skyline, painted aside and laid in (the same picture) so the night pass can
        // shade each one whole (S.tufts)
        let ya = Infinity, yb = -Infinity; for (let px = E.x0; px <= E.x1; px += 12) { ya = Math.min(ya, g(px)); yb = Math.max(yb, g(px)); }
        const res = scaleOf(x);
        S.tufts = worldCanvas([E.x0, Math.floor(ya - 80), E.x1, Math.ceil(yb + 60)], res, t => {
          for (let px = E.x0; px < E.x1; px += 26 + r() * 34) clump(t, px, g(px) - 5, 44 + r() * 50, 16 + r() * 14, ['#7aa856', '#94bc68', '#b8d08a', '#d4e2a0'], 12, r, { size: 0.16, light: L });
        });
        x.drawImage(S.tufts.c, S.tufts.x0, S.tufts.y0, S.tufts.w, S.tufts.h);
        paper(x, 0.06);
      }, anim: (ctx, t, S2) => S2._nightLand?.(ctx) },
      { k: 1.3, front: true, paint(x, r, S, E) { blades(x, r, E.x0, E.x1, px => 1700 + 16 * Math.sin(px / 77), Math.round((E.x1 - E.x0) / 5), { len: [40, 160], w: 7, clumps: 1, pal: ['#4a7a34', '#5a8a3c', '#6a9a44', '#7aa84c'] }); } },
    ],
    props: [
      { id: 'standing_stone', x: STONE.x, y: STONE.base + 4, base: STONE.base, inkFloor: stoneSkirt(STONE).inkFloor, solid: { rx: 66, ry: 12 }, closeRes: STONE_RES, bounds: [STONE.x - 90, STONE.base - STONE.h - 20, STONE.x + 90, STONE.base + 20],
        paint: (x, r) => standingStone(x, r, STONE, { light: L, grass: STONE_GRASS }), ground: x => contactShadow(x, STONE.x - 20, STONE.base + 6, 110, 14, 0.42),
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
  return addNight(S);
}

// ───────────── night ─────────────
// S.night (0..1) follows the sky handed to drawSky / drawBack (opts.night overrides it); the passes are painted once,
// lazily, and laid over the ground layer (from its anim), on the far layers' own paint (their shade) and over the stone
// prop, faded by S.night.
function addNight(S) {
  const g = hillGround, X0 = S.area.x0 - 900, X1 = S.area.x1 + 900, Y1 = S.area.y1 + 200, cache = {};
  S.nightLevel = nightLevel; S.night = 0;
  const slope = () => { const P = [[X0, Y1]]; for (let px = X0; px <= X1; px += 12) P.push([px, g(px) - 6]); P.push([X1, Y1]); return P; };
  // the land: a cool shadow over the whole slope, lighter just under the crest and deepest toward the viewer (multiply)
  const band = (x, d0, d1) => { const Q = []; for (let px = X0; px <= X1; px += 12) Q.push([px, g(px) + d0]); for (let px = X1; px >= X0; px -= 12) Q.push([px, g(px) + d1]); path(x, Q); };
  const shadeK = () => cache.shade ??= worldCanvas([X0, 500, X1, Y1], 0.25, x => {
    band(x, 2, Y1 - 500); x.clip();
    x.fillStyle = '#9aa4c8'; x.fillRect(X0, 500, X1 - X0, Y1 - 500);
    x.filter = 'blur(12px)'; x.fillStyle = '#bcc4e2'; band(x, -20, 90); x.fill(); x.fillStyle = '#d2d8ee'; band(x, -20, 34); x.fill(); x.filter = 'none';
    const v = x.createLinearGradient(0, 950, 0, Y1); v.addColorStop(0, 'rgba(96,104,146,0)'); v.addColorStop(1, 'rgba(96,104,146,.75)');
    x.fillStyle = v; x.fillRect(X0, 950, X1 - X0, Y1 - 950);
    cutTufts(x);
  });
  // the crest's tussocks reach down over the slope: they take the crest's shade whole (crestK), never the slope's lighter
  // band or its rim across their feet, which would read as the hill showing through them
  const cutTufts = x => { const T = S.tufts; if (!T) return; x.save(); x.globalCompositeOperation = 'destination-out'; x.drawImage(T.c, T.x0, T.y0, T.w, T.h); x.restore(); };
  // the tussocks on the skyline: the same shade, on what the ground layer painted above the slope and on every tussock
  const crestK = () => cache.crest ??= (() => {
    const ly = S.L.find(l => l.k === 1 && !l.front), T = S.tufts;
    let ya = 1e9, yb = -1e9; for (let px = X0; px <= X1; px += 12) { ya = Math.min(ya, g(px)); yb = Math.max(yb, g(px)); }
    const R = [X0, ya - 90, X1, Math.max(yb + 8, T ? T.y0 + T.h : 0)];
    return worldCanvas(R, 1, x => {
      x.fillStyle = '#8e97c2'; band(x, -90, 6); x.fill();
      if (T) { x.drawImage(T.c, T.x0, T.y0, T.w, T.h); x.globalCompositeOperation = 'source-atop'; x.fillRect(R[0], R[1], R[2] - R[0], R[3] - R[1]); }
      x.globalCompositeOperation = 'destination-in'; x.drawImage(ly.c, ly.E.x0, ly.E.y0, ly.c.width / ly.res, ly.c.height / ly.res);
    });
  })();
  // the moonlit rim along the crest (screen): brightest on the skyline, gone a little way down the slope
  const rimK = () => cache.rim ??= worldCanvas([X0, 500, X1, 1300], 0.5, x => {
    x.save(); path(x, slope()); x.clip();
    x.filter = 'blur(6px)'; x.fillStyle = 'rgba(150,170,220,.5)'; band(x, -8, 14); x.fill(); x.filter = 'none';
    x.restore();
    cutTufts(x);
  });
  const lay = (x, K, op, a) => { if (!(a > 0.01)) return; x.save(); x.globalCompositeOperation = op; x.globalAlpha = Math.min(1, a); x.drawImage(K.c, K.x0, K.y0, K.w, K.h); x.restore(); };
  S._nightLand = x => { const n = S.night; if (!(n > 0.01)) return; lay(x, shadeK(), 'multiply', n); lay(x, crestK(), 'multiply', n); lay(x, rimK(), 'screen', n * 0.8); };
  // the far ranges drop back: a cool shade on all they painted, the trees on their crests too (set.mjs lays it on the
  // layer's own paint, as soft as the layer is drawn), so no tree stands day-bright against the night sky
  S._farShade = k => (S.night > 0.01 ? { rgb: k < 0.5 ? [110, 120, 164] : [126, 136, 178], a: S.night * 0.8 } : null);
  // the stone washed with moonlight (its foot grass left out), and the crest's night shade for that grass (multiply),
  // as sharp as the stone's own sprite at the scale drawn (1.5 at least)
  const SB = [STONE.x - STONE.w, STONE.base - STONE.h - 30, STONE.x + STONE.w, STONE.base + 40];
  const resAt = ctx => Math.max(1.5, resTier(1, STONE_RES, scaleOf(ctx)));
  const stone = res => cache[`stone@${res}`] ??= worldCanvas(SB, res, x => standingStoneMoon(x, STONE, { light: RIGHT, grass: STONE_GRASS }));
  const foot = res => cache[`foot@${res}`] ??= worldCanvas(SB, res, x => { standingStoneFoot(x, STONE, { grass: STONE_GRASS }); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#8e97c2'; x.fillRect(SB[0], SB[1], SB[2] - SB[0], SB[3] - SB[1]); });
  const level = opts => (opts?.night != null ? Math.max(0, Math.min(1, +opts.night)) : opts?.haze != null ? nightLevel(opts.haze) : opts?.sky != null ? nightLevel(opts.sky) : null);
  const sky0 = S.drawSky, back0 = S.drawBack, props0 = S.propsSorted;
  S.drawSky = (ctx, cam, sky, t) => { S.night = nightLevel(sky ?? S.defaultSky); return sky0(ctx, cam, sky, t); };
  S.drawBack = (ctx, cam, opts = {}) => { const l = level(opts); if (l != null) S.night = l; return back0(ctx, cam, opts); };
  S.propsSorted = () => props0().map(it => it.id !== 'standing_stone' ? it : { ...it, draw: ctx => { it.draw(ctx); if (S.night > 0.01) { const res = resAt(ctx); lay(ctx, stone(res), 'source-over', S.night); lay(ctx, foot(res), 'multiply', S.night); } } });
  return S;
}
