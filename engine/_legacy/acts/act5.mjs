// Act V — slow and steady: the stepping stones, past the sleeping hare, up the hill to the goal. (shots 18–21)
import { clamp, lerp, smooth } from '../lib.mjs';
import { makeAct, splash, zzz, motes } from '../engine.mjs';
import { stream, streamGround, STONES, FROG_ROCK, BANKS, wayside, waysideGround, WAY_BRANCH, NAP, hill, hillGround, STONE } from '../sets.mjs';
import { branchTop } from '../paint.mjs';
import { drawFrog, drawSquirrel, drawMouse, drawBadger, drawHedgehog, drawDeer, drawBird } from '../cast.mjs';
import { depth, butterflies, birdOn, scarf, drawHare, drawTortoise, drawFox, HP } from './common.mjs';
import { napHare } from './act4.mjs';

// Something standing on a slope: rotate about its footing so it leans with the ground.
export function onSlope(ctx, x, gy, fn) { const a = Math.atan2(gy(x + 20) - gy(x - 20), 40); ctx.save(); ctx.translate(x, gy(x)); ctx.rotate(a * 0.8); ctx.translate(-x, -gy(x)); fn(); ctx.restore(); }
// The gathering on the hilltop round the stone. Everyone stands on the grass, the bird on the top of the stone.
export const STONE_TOP = (() => { const x = STONE.x + 6; return [x, STONE.base - STONE.h + (x - (STONE.x - STONE.w * 0.2)) / (STONE.w * 0.48) * STONE.h * 0.06 + 3]; })();
export function hillCrowd(ctx, lt, st = {}) {
  const g = hillGround;
  if (st.gathered) {   // later, everyone has come round to the winner's side of the stone
    const items = [
      { y: g(2392) + 44, fn: c => drawMouse(c, 2392, g(2392) + 44, 1.55, -1, { pose: st.mice || 'idle' }) },
      { y: g(2424) + 48, fn: c => drawMouse(c, 2424, g(2424) + 48, 1.6, -1, { pose: st.mice || 'idle' }) },
      { y: g(2690) + 14, fn: c => drawBadger(c, 2690, g(2690) + 14, 1.25, -1, {}) },
      { y: g(2620) + 40, fn: c => drawHedgehog(c, 2620, g(2620) + 40, 1.5, -1, {}) },
      { y: g(2540) + 6, fn: c => drawFox(c, 2540, g(2540) + 6, 1.3, -1, { pose: 'sit', nod: st.nod || 0 }) },
    ];
    return items;
  }
  const items = [
    { y: g(2060) + 34, fn: c => drawMouse(c, 2060, g(2060) + 34, 1.5, 1, { pose: st.cheer ? 'cheer' : 'idle', lift: st.cheer ? Math.abs(Math.sin(lt * 9)) * 6 : 0 }) },
    { y: g(2092) + 40, fn: c => drawMouse(c, 2092, g(2092) + 40, 1.55, 1, { pose: st.cheer ? 'cheer' : 'idle', lift: st.cheer ? Math.abs(Math.sin(lt * 9 + 1)) * 6 : 0 }) },
    { y: g(1990) + 14, fn: c => drawBadger(c, 1990, g(1990) + 14, 1.25, 1, { pose: st.cheer ? 'cheer' : 'stand' }) },
    { y: g(2620) + 40, fn: c => drawHedgehog(c, 2620, g(2620) + 40, 1.5, -1, {}) },
  ];
  if (st.fox !== false) items.push({ y: g(2540) + 6, fn: c => drawFox(c, 2540, g(2540) + 6, 1.3, -1, { pose: 'sit', nod: st.nod || 0, ex: st.foxEx }) });
  return items;
}
export const stoneBird = (ctx, lt, pose = 'fold') => drawBird(ctx, STONE_TOP[0], STONE_TOP[1] - 9 * 1.1, 1.1, -1, pose, '#5e4636');

// ── shot 18: the stepping stones ──
const sg = streamGround, TS = stream.sAt(stream.laneY);
const W0 = 1100, W1 = 1545, STONE_Y = (STONES[0].top + STONES[1].top) / 2 - 1;
const ty18 = x => lerp(sg(x), STONE_Y, smooth(W0 - 30, W0 + 10, x) * (1 - smooth(W1 - 10, W1 + 30, x)));
const tx18 = lt => 1000 + lt * 60;

// ── shot 19: past the sleeping hare ──
const SQX = 1250, wg = waysideGround, ws = wayside.sAt(wayside.laneY);
// ── shots 20–21: the hill ──
const tx20 = lt => 1150 + lt * 80, tx21 = lt => Math.min(2276, 2150 + lt * 46);

export default makeAct([
  // 18 · Stone by stone across the stream; the frog, back on its rock, watches her go
  { d: 9, set: stream, grade: 'noon', camFn: lt => ({ cx: tx18(lt) + 30, cy: 975, s: 1.9 }), cam: [[0, 0, 1], [0, 0, 1]],
    draw(ctx, lt) {
      const tx = tx18(lt), ty = ty18(tx);
      depth(ctx, [
        { y: FROG_ROCK.top - 2, fn: c => drawFrog(c, FROG_ROCK.x, FROG_ROCK.top - 2, 2.1, -1, {}) },
        { y: ty, fn: c => drawTortoise(c, tx, ty, TS, 1, { walking: true, phase: tx / 38, ex: { eyes: 'open' } }) },
      ]);
      for (const st of STONES) { const tIn = (st.x - 40 - 1000) / 60; splash(ctx, lt, tIn, st.x - 30, st.top + 8, 0.4); }
      butterflies(ctx, lt, [[1300, 940, 160, 30, '#7ab8e0', 1], [1600, 980, 100, 30, '#f2b24a', 3]]);
    } },
  // 19 · Past the sleeping hare. Up on the branch the squirrel puts a finger to its lips
  { d: 10, set: wayside, grade: 'afternoon', cam: [[1300, 830, 1.36], [1440, 835, 1.4]],
    draw(ctx, lt) {
      const tx = 980 + lt * 72, look = smooth(3, 4, lt) * (1 - smooth(6, 7, lt));
      drawSquirrel(ctx, SQX, branchTop(WAY_BRANCH, SQX), 1.25, -1, { pose: lt > 2 ? 'shush' : 'hold', ex: { eyes: 'open' } });
      birdOn(ctx, WAY_BRANCH, 1130, 1.0, 1, '#6a4a3a'); birdOn(ctx, WAY_BRANCH, 1085, 0.95, 1, '#7a6a5a');
      depth(ctx, [
        { y: NAP.y, fn: c => napHare(c, lt) },
        { y: wg(tx), fn: c => drawTortoise(c, tx, wg(tx), ws, 1, { walking: true, phase: tx / 38, headRot: -0.28 * look, ex: { eyes: 'open' } }) },
      ]);
      zzz(ctx, [NAP.x + 30, NAP.y - 30], lt, 1.1);
      butterflies(ctx, lt, [[1700, 960, 150, 40, '#f6efe0', 1]]);
    } },
  // 20 · The long climb in the golden light, the watchers waiting up by the stone
  { d: 9, set: hill, sky: 'golden', grade: 'golden', camFn: lt => { const x = tx20(lt); return { cx: x + 380, cy: hillGround(x) - 150, s: 1.25 }; }, cam: [[0, 0, 1], [0, 0, 1]],
    draw(ctx, lt) {
      const tx = tx20(lt);
      scarf(ctx, STONE, lt, 1); stoneBird(ctx, lt);
      depth(ctx, [...hillCrowd(ctx, lt), { y: hillGround(tx), fn: c => onSlope(c, tx, hillGround, () => drawTortoise(c, tx, hillGround(tx), 1.3, 1, { walking: true, phase: tx / 38, ext: 3, headDy: -2, ex: { eyes: 'open' } })) }]);
      motes(ctx, 71, 50, tx - 400, hillGround(tx) - 500, 1400, 500, lt, 0.8);
    } },
  // 21 · She reaches the stone. The Fox nods: the goal. She settles beside it and dozes
  { d: 8, set: hill, sky: 'golden', grade: 'golden', cam: [[2330, 640, 1.75], [2350, 650, 1.85]],
    draw(ctx, lt) {
      const tx = tx21(lt), arrived = lt > 2.8, sleep = smooth(4.4, 5.2, lt);
      scarf(ctx, STONE, lt, 1); stoneBird(ctx, lt);
      depth(ctx, [...hillCrowd(ctx, lt, { cheer: lt > 3 && lt < 4.6, nod: lt > 3.1 && lt < 4 ? Math.sin((lt - 3.1) * 7) * 0.14 : 0 }),
        { y: hillGround(tx) + 2, fn: c => drawTortoise(c, tx, hillGround(tx) + 2, 1.3, 1, { walking: !arrived, phase: tx / 38, sleep: sleep > 0.5, ex: { eyes: sleep > 0.3 ? 'closed' : 'open' } }) }]);
      if (lt > 5.4) zzz(ctx, [tx + 50, hillGround(tx) - 30], lt, 1.1);
      motes(ctx, 81, 40, 1900, 300, 900, 500, lt, 0.8);
    } },
], [
  [0.5, 8.6, 'but went on with a slow but steady pace'],
  [19.4, 27.6, 'straight to the end of the course.'],
]);
