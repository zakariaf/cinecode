// Act II — the Fox is chosen as judge, shows the course, marks the goal; night falls and the day of the race dawns. (shots 8–10)
import { clamp, lerp, smooth } from '../lib.mjs';
import { makeAct, motes, fireflies } from '../engine.mjs';
import { valley, meadow, hill, hillGround, STONE, STUMP } from '../sets.mjs';
import { groundShadow } from '../cast.mjs';
import { depth, butterflies, owlInHollow, squirrelOnMeadow, meadowBirds, crowdItems, scarf, birdFly, HP, mixPose, drawHare, drawTortoise, drawFox } from './common.mjs';

const S = meadow, sAt = y => S.sAt(y), TY = 1060;
const FOX0 = [2210, 1040], FOXTOP = [STUMP.cx, STUMP.top + 3], FOX_S = sAt(STUMP.base);
// The fox on (or jumping onto) the stump. Scale stays that of the stump's footing, the stump's depth.
function fox(lt, tJump, after = {}) {
  const u = clamp((lt - tJump) / 0.7);
  if (u <= 0) return { y: FOX0[1], fn: c => drawFox(c, ...FOX0, sAt(FOX0[1]), -1, { pose: 'sit' }) };
  if (u < 1) {
    const x = lerp(FOX0[0], FOXTOP[0], u), y = lerp(FOX0[1], FOXTOP[1], u) - Math.sin(Math.PI * u) * 70, s = lerp(sAt(FOX0[1]), FOX_S, u);
    return { y: STUMP.base + 1, fn: c => { groundShadow(c, x, lerp(FOX0[1], STUMP.base, u), 40 * s, 60, 0.18); drawFox(c, x, y, s, -1, { pose: 'leap', shadow: false }); } };
  }
  const sitting = lt - tJump > 1.3;
  return { y: STUMP.base + 1, fn: c => drawFox(c, ...FOXTOP, FOX_S, after.face ?? -1, { pose: sitting ? 'sit' : 'stand', shadow: false, ...after }) };
}
const H = (x, p, ex) => ({ y: TY, fn: c => drawHare(c, x, TY, sAt(TY), -1, p, ex) });
const T = st => ({ y: TY, fn: c => drawTortoise(c, 1330, TY, sAt(TY), 1, st) });

export default makeAct([
  // 8 · The Fox is chosen; he springs up onto the old stump
  { d: 8, set: S, grade: 'morning', cam: [[1820, 960, 1.4], [1880, 950, 1.45]],
    draw(ctx, lt) {
      owlInHollow(ctx); squirrelOnMeadow(ctx, { nibble: true, t: lt }); meadowBirds(ctx, lt);
      const look = smooth(0.6, 1.2, lt);
      depth(ctx, [...crowdItems(S, lt, { fox: false, alertDeer: true }), fox(lt, 1.4), T({ headRot: -0.15 * look, ext: 4 * look }), H(1570, mixPose(HP.offer, HP.up, smooth(0, 0.6, lt)), { eyes: 'open', mouth: 'smile' })]);
      butterflies(ctx, lt, [[1850, 1080, 120, 30, '#f6efe0', 2]]);
    } },
  // 9a · Close: from the stump the Fox points out the course
  { d: 4, set: S, grade: 'morning', dof: 5, cam: [[2070, 840, 2.6], [2080, 836, 2.7]],
    draw(ctx, lt) {
      depth(ctx, [...crowdItems(S, lt, { fox: false, alertDeer: true }), { y: STUMP.base + 1, fn: c => drawFox(c, ...FOXTOP, FOX_S, 1, { pose: 'sit', shadow: false, point: smooth(0.5, 1.2, lt), nod: lt > 2.4 ? Math.sin((lt - 2.4) * 6) * 0.1 : 0 }) }]);
    } },
  // 9b · The course seen from above the meadow: into the forest, over the stream, past the old tree, up the hill to the stone
  { d: 9, set: valley, sky: 'morning', grade: 'morning', cam: [[900, 820, 1.25], [2150, 790, 1.3]],
    draw(ctx, lt) {
      ctx.save(); ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'screen'; ctx.drawImage(valley.mist, -600 + lt * 14, 760); ctx.restore();
      birdFly(ctx, 900, 560, 2300, 520, 0.6, lt, 0, 9, '#4a3a30');
      motes(ctx, 31, 40, 700, 600, 1800, 400, lt, 0.4);
    } },
  // 9c · On the hilltop the Fox ties a red scarf round the old standing stone: the goal
  { d: 6, set: hill, sky: 'morning', grade: 'morning', cam: [[2330, 640, 2.1], [2360, 650, 2.2]],
    draw(ctx, lt) {
      const fx = lerp(2160, 2306, smooth(0, 1.8, lt)), walking = lt < 1.8, y = hillGround(fx), s = 1.3;
      const tied = smooth(2.8, 3.4, lt), reach = smooth(2.0, 2.6, lt) * (1 - smooth(3.6, 4.2, lt));
      scarf(ctx, STONE, lt, tied);
      if (reach > 0.2 && tied < 1) scarf(ctx, { ...STONE, w: STONE.w * 0.3, scarf: [fx + 54, y - 55] }, lt, 1 - tied);
      drawFox(ctx, fx, y, s, 1, walking ? { pose: 'walk', phase: fx / 70 } : { pose: 'sit', point: reach, nod: lt > 4.4 ? Math.sin((lt - 4.4) * 5) * 0.12 : 0 });
      butterflies(ctx, lt, [[2200, 600, 80, 30, '#f2b24a', 1]]);
    } },
  // 10 · Night over the valley, then the dawn of the race day
  { d: 8, set: valley, sky: lt => [['night', 1 - smooth(3, 7, lt)], ['dawn', smooth(3, 7, lt)]], grade: lt => ['night', 'dawn', smooth(3, 7, lt)], cam: [[1400, 760, 0.86], [1420, 740, 0.92]], fadeIn: 0.6,
    draw(ctx, lt) {
      fireflies(ctx, 77, 40, 300, 850, 2200, 300, lt, 1 - smooth(3, 6, lt));
      ctx.save(); ctx.globalAlpha = 0.4 * smooth(4, 7, lt); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(valley.mist, -500 + lt * 14, 760); ctx.restore();
    } },
], [
  [0.4, 11.6, 'and they agreed that the Fox should choose the course and fix the goal.'],
  [28.4, 34.6, 'On the day appointed for the race'],
]);
