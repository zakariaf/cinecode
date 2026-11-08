// Act III — the start, and into the forest. (shots 11–14)
import { rng, clamp, lerp, smooth, ink, pick } from '../lib.mjs';
import { makeAct, dust, motes, speedLines, TWOS } from '../engine.mjs';
import { meadow, forest, forestGround, STUMP } from '../sets.mjs';
import { raysSprite } from '../paint.mjs';
import { drawDeer, drawHedgehog, drawMouse, drawBeetle, drawBird } from '../cast.mjs';
import { depth, butterflies, owlInHollow, squirrelOnMeadow, meadowBirds, crowdItems, birdFly, HP, gallop, mixPose, drawHare, drawTortoise, drawFox } from './common.mjs';

const S = meadow, sAt = y => S.sAt(y);
const X0 = 1700, HY = 1028, TY = 1152, FOXTOP = [STUMP.cx, STUMP.top + 3], FOX_S = sAt(STUMP.base);
const MICE = [[1480, 1186, 1], [1512, 1194, 1], [1240, 1150, 1]];
const line = ctx => { const r = rng(601); for (let y = 1000; y <= 1180; y += 9) { const x = X0 + 80 - (y - 1000) * 0.07 + (r() - 0.5) * 6, k = sAt(y); ctx.fillStyle = r() < 0.5 ? '#d8d0bc' : '#b8ae98'; ctx.beginPath(); ctx.ellipse(x, y, 5 * k, 2.4 * k, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(60,50,40,.35)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 2 * k, 5 * k, 1.4 * k, 0, 0, 7); ctx.fill(); } };
const fox = (point, ex) => ({ y: STUMP.base + 1, fn: c => drawFox(c, ...FOXTOP, FOX_S, -1, { pose: 'sit', shadow: false, point, ex }) });
function petals(ctx, t, x, y) { for (let i = 0; i < 26; i++) { const r = rng(700 + i), a = t * (1.2 + r()), px = x + (r() - 0.3) * 60 + a * (120 + r() * 200), py = y - 10 - a * (60 + r() * 90) + 140 * a * a; if (a > 1.4 || py > y + 10) continue; ctx.globalAlpha = 1 - a / 1.4; ctx.fillStyle = pick(r, ['#fbf7ee', '#f3b8c8', '#f6e27a', '#c9b8ec']); ctx.beginPath(); ctx.ellipse(px, py, 4, 2.2, a * 5 + i, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
function startScene(ctx, lt, { point, cheer, hare, tort }) {
  owlInHollow(ctx); squirrelOnMeadow(ctx, { nibble: false, t: lt }); meadowBirds(ctx, lt);
  line(ctx);
  depth(ctx, [...crowdItems(S, lt, { fox: false, alertDeer: true, cheer, mice: cheer ? 'cheer' : 'idle', micePos: MICE, hedge: [1580, 1236, 1] }), fox(point), hare, tort]);
}
forest.rays = raysSprite(1920, 1080, [1500, -300], [[1.95, 0.05, 0.22], [2.15, 0.035, 0.18], [1.8, 0.03, 0.16], [2.3, 0.03, 0.12]]);
const FS = forest.sAt(forest.laneY);
const fy = x => forestGround(x);
const TF = lt => 1480 + lt * 18;      // the tortoise's progress along the forest path (shots 13–14 continue)

export default makeAct([
  // 11 · The start line. The Fox on his stump raises a paw; the hare crouches, the tortoise is ready
  { d: 9, set: S, grade: ['dawn', 'morning', 0.65], cam: [[1880, 980, 1.35], [1850, 990, 1.45]],
    draw(ctx, lt) {
      const crouch = smooth(5, 5.8, lt);
      startScene(ctx, lt, {
        point: smooth(3.6, 4.4, lt),
        hare: { y: HY, fn: c => drawHare(c, X0, HY, sAt(HY), 1, mixPose(HP.sit, HP.ready, crouch), { eyes: crouch > 0.5 ? 'half' : 'open', mouth: 'smile' }) },
        tort: { y: TY, fn: c => drawTortoise(c, X0 - 20, TY, sAt(TY), 1, { ext: 3, headDy: -2, ex: { eyes: 'open' } }) },
      });
      butterflies(ctx, lt, [[2300, 1000, 120, 30, '#f6efe0', 2]]);
    } },
  // 11b · The owl hoots the start
  { d: 2, set: S, grade: ['dawn', 'morning', 0.65], dof: 4, cam: [[440, 548, 3.4], [440, 546, 3.5]],
    draw(ctx, lt) { owlInHollow(ctx, { eyes: 'open' }, lt > 0.5 && lt < 1.6 ? 1 : 0); } },
  // 12 · GO — the hare is gone in a burst of dust and petals; the tortoise sets off; the crowd cheers
  { d: 5, set: S, grade: ['dawn', 'morning', 0.65], cam: [[1850, 990, 1.45], [1880, 985, 1.42]],
    draw(ctx, lt) {
      const d = 260 * lt * lt + 900 * Math.max(0, lt - 0.4), hx = X0 + d, s = sAt(HY);
      const tx = X0 - 20 + lt * 16;
      startScene(ctx, lt, {
        point: 1 - smooth(0, 0.25, lt), cheer: lt > 0.5,
        hare: hx < 3000 ? { y: HY, fn: c => drawHare(c, hx, HY, s, 1, gallop(d / (95 * s)), { eyes: 'happy', mouth: 'smile' }) } : null,
        tort: { y: TY, fn: c => drawTortoise(c, tx, TY, sAt(TY), 1, { walking: true, phase: tx / 38, ext: 3, ex: { eyes: 'open' } }) },
      });
      dust(ctx, lt, 0.05, X0 + 20, () => HY, 1, 14, 1.3); petals(ctx, lt, X0 + 30, HY);
    } },
  // 13 · The forest path. The hare flashes past; the tortoise plods on beneath the big trunks
  { d: 9, set: forest, grade: 'morning', cam: [[1480, 900, 1.2], [1640, 900, 1.2]], ease: u => u,
    draw(ctx, lt) {
      ctx.save(); ctx.globalAlpha = 0.45; ctx.globalCompositeOperation = 'screen'; ctx.drawImage(forest.mist, -400 + lt * 12, 720); ctx.restore();
      const hx = 500 + (lt - 0.2) * 2300, tx = TF(lt);
      const items = [
        { y: 1004, fn: c => drawDeer(c, 1250, 1004, forest.sAt(1004) * 0.95, -1, { alpha: 0.8, col: '#a08670', graze: 0 }) },
        { y: 1120, fn: c => drawHedgehog(c, 2010, 1120, forest.sAt(1120), -1, {}) },
        { y: fy(tx), fn: c => drawTortoise(c, tx, fy(tx), FS, 1, { walking: true, phase: tx / 38, ex: { eyes: 'open' } }) },
      ];
      if (lt > 0.2 && hx < 3200) items.push({ y: fy(hx) - 2, fn: c => { speedLines(c, hx - 40, fy(hx) - 30, 1, lt, FS); drawHare(c, hx, fy(hx) - 2, FS, 1, gallop(hx / (95 * FS)), { eyes: 'happy', mouth: 'smile' }); } });
      depth(ctx, items);
      if (lt > 0.2 && lt < 1.6) dust(ctx, lt, 0.6, 1500, fy, 1, 10, 1);
      birdFly(ctx, 1100, 500, 2300, 440, 0.7, lt, 2, 6, '#4a3a30');
      motes(ctx, 41, 60, 900, 500, 1600, 500, lt, 0.7);
    },
    screen(ctx) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.8; ctx.drawImage(forest.rays, 0, 0); ctx.restore(); } },
  // 14 · Low and close: step after step, a beetle keeping her company
  { d: 7, set: forest, grade: 'morning', dof: 6, camFn: lt => ({ cx: TF(9 + lt) + 30, cy: 1016, s: 3.1 }), cam: [[0, 0, 1], [0, 0, 1]],
    draw(ctx, lt) {
      const tx = TF(9 + lt), bx = tx - 60 + lt * 14;
      depth(ctx, [
        { y: fy(tx), fn: c => drawTortoise(c, tx, fy(tx), FS, 1, { walking: true, phase: tx / 38, ext: 2, ex: { eyes: 'open' } }) },
        { y: fy(bx) + 16, fn: c => drawBeetle(c, bx, fy(bx) + 16, 1.6, 1, lt * 2.2) },
      ]);
      motes(ctx, 51, 30, tx - 300, 850, 600, 250, lt, 0.7);
    },
    screen(ctx) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6; ctx.drawImage(forest.rays, 0, 0); ctx.restore(); } },
], [
  [11.3, 15.8, 'the two started together.'],
  [25.6, 31.6, 'The Tortoise never for a moment stopped,'],
]);
