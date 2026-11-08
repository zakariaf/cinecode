// Act VI — the hare wakes at dusk, runs, and finds the tortoise asleep at the goal. The moral. (shots 22–25)
import { clamp, lerp, smooth } from '../lib.mjs';
import { makeAct, zzz, dust, speedLines, fireflies, cardText, motes } from '../engine.mjs';
import { wayside, waysideGround, NAP, hill, hillGround, STONE } from '../sets.mjs';
import { depth, scarf, runDist, HP, gallop, mixPose, drawHare, drawTortoise } from './common.mjs';
import { hillCrowd, stoneBird, onSlope } from './act5.mjs';

const ws = y => wayside.sAt(y), TORT_X = 2276, g = hillGround;
const sleepP = lt => { const p = { ...HP.sleep }; p.bs *= 1 + 0.025 * Math.sin(lt * 2.4); return p; };
const tortoiseAsleep = lt => ({ y: g(TORT_X) + 2, fn: c => drawTortoise(c, TORT_X, g(TORT_X) + 2, 1.3, 1, { sleep: true, ex: { eyes: 'closed' } }) });

// shot 24: in at full speed, skid to a stop just short of her
const RUN = { x0: 1500, stop: 2110 }, RLEN = RUN.stop - RUN.x0;

export default makeAct([
  // 22 · Dusk at the wayside. One eye snaps open — he leaps up and is off
  { d: 5, set: wayside, sky: 'twilight', grade: 'twilight', dof: 5, cam: [[1418, 975, 3.3], [1430, 972, 3.0]],
    draw(ctx, lt) {
      const up = smooth(2.2, 2.6, lt), go = Math.max(0, lt - 3.6);
      let x = NAP.x, y = NAP.y, p, ex;
      if (lt < 1.7) { p = sleepP(lt); ex = { eyes: 'closed' }; }
      else if (lt < 2.2) { p = sleepP(lt); ex = { eyes: 'wide' }; }
      else if (!go) { p = mixPose(HP.sleep, HP.alert, up); ex = { eyes: 'wide', mouth: 'o' }; }
      else { const d = 420 * go * go + 400 * go; x = NAP.x + d; y = lerp(NAP.y, waysideGround(x), clamp(d / 300)); p = gallop(d / 124); ex = { eyes: 'wide', mouth: 'o' }; }
      fireflies(ctx, 91, 14, 1100, 850, 700, 250, lt, 0.45);
      drawHare(ctx, x, y, ws(y), 1, p, ex);
      if (lt < 1.7) zzz(ctx, [NAP.x + 30, NAP.y - 30], lt, 1.1);
      if (go) dust(ctx, lt, 3.6, NAP.x + 20, () => NAP.y, 1, 10, 1);
    } },
  // 23 · The sprint up the hill against the sunset
  { d: 7, set: hill, sky: 'twilight', grade: ['sunset', 'twilight', 0.35], camFn: lt => { const x = 200 + lt * 185; return { cx: x + 260, cy: g(x) - 170, s: 1.25 }; }, cam: [[0, 0, 1], [0, 0, 1]],
    draw(ctx, lt) {
      const x = 200 + lt * 185, s = 1.3;
      scarf(ctx, STONE, lt, 1); stoneBird(ctx, lt); depth(ctx, [...hillCrowd(ctx, lt, { gathered: true }), tortoiseAsleep(lt)]);
      speedLines(ctx, x - 20, g(x) - 20, 1, lt, s);
      onSlope(ctx, x, g, () => drawHare(ctx, x, g(x), s, 1, gallop(lt * 4.2), { eyes: 'wide', mouth: 'frown' }));
      dust(ctx, lt, Math.floor(lt * 3) / 3, x - 10, g, 1, 6, 0.8);
      fireflies(ctx, 93, 20, x - 600, g(x) - 300, 1400, 300, lt, 0.7);
    } },
  // 24 · The hilltop: in he comes, skids — she is already there, asleep by the stone. His ears droop
  { d: 10, set: hill, sky: 'twilight', grade: 'twilight', cam: [[2250, 650, 1.7], [2290, 660, 1.85]],
    draw(ctx, lt) {
      const d = runDist(lt, RLEN, 700, 200), x = RUN.x0 + d, sk = smooth(RLEN - 200, RLEN, d);
      let p, ex = { eyes: 'wide', mouth: 'o' };
      if (d < RLEN - 1) { p = gallop(d / 124, 1 - sk); if (sk > 0) p = mixPose(p, HP.skid, Math.min(1, sk * 1.5)); }
      else if (lt < 4.6) p = mixPose(HP.skid, HP.up, smooth(1.6, 2.2, lt));
      else { p = mixPose(HP.up, HP.slump, smooth(4.6, 5.6, lt)); ex = { eyes: lt > 5.2 ? 'half' : 'open', mouth: 'frown' }; }
      scarf(ctx, STONE, lt, 1); stoneBird(ctx, lt);
      depth(ctx, [...hillCrowd(ctx, lt, { gathered: true, nod: lt > 3 && lt < 4 ? Math.sin((lt - 3) * 7) * 0.14 : 0 }), tortoiseAsleep(lt), { y: g(x), fn: c => drawHare(c, x, g(x), 1.3, 1, p, ex) }]);
      if (sk > 0 && lt < 3) dust(ctx, lt, (RLEN - 200) / 700, x + 30, g, 1, 12, 1.1);
      zzz(ctx, [TORT_X + 50, g(TORT_X) - 30], lt, 1.1);
      fireflies(ctx, 95, 30, 1900, 500, 900, 300, lt, 0.8);
    } },
  // 25 · Night comes down over the hill; the moral; The End
  { d: 14, set: hill, sky: 'twilight', grade: lt => ['twilight', 'night', smooth(2, 12, lt) * 0.6], cam: [[2250, 640, 1.2], [2200, 560, 0.95]], fadeOut: 2.2,
    draw(ctx, lt) {
      scarf(ctx, STONE, lt + 10, 1); stoneBird(ctx, lt);
      depth(ctx, [...hillCrowd(ctx, lt, { gathered: true }), tortoiseAsleep(lt), { y: g(2110), fn: c => drawHare(c, 2110, g(2110), 1.3, 1, HP.slump, { eyes: 'half', mouth: 'frown' }) }]);
      zzz(ctx, [TORT_X + 50, g(TORT_X) - 30], lt, 1.1);
      fireflies(ctx, 97, 60, 1300, 400, 1900, 450, lt, 1);
    },
    screen(ctx, lt) {
      cardText(ctx, Math.min(smooth(3.2, 4.4, lt), 1 - smooth(8.6, 9.4, lt)), [['Slow but steady wins the race.', 84, 400, '#fff8e8', 'italic', true]]);
      cardText(ctx, smooth(9.8, 10.8, lt), [['The End', 96, 420, '#fff8e8', 'italic', true]]);
    } },
], [
  [0.5, 4.6, 'At last waking up,'],
  [5.4, 11.7, 'and moving as fast as he could,'],
  [13.4, 21.7, 'he saw the Tortoise had reached the goal, and was comfortably dozing after her fatigue.'],
]);
