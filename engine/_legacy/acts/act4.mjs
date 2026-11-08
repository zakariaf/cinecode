// Act IV — the hare far ahead: over the stream, then a nap by the wayside. (shots 15–17)
import { clamp, lerp, smooth } from '../lib.mjs';
import { makeAct, dust, splash, zzz, speedLines, motes } from '../engine.mjs';
import { stream, streamGround, STONES, FROG_ROCK, wayside, waysideGround, WAY_BRANCH, WAY_TREE, NAP } from '../sets.mjs';
import { branchTop } from '../paint.mjs';
import { drawFrog, drawMouse, drawSquirrel } from '../cast.mjs';
import { depth, butterflies, birdOn, runDist, HP, gallop, mixPose, drawHare } from './common.mjs';

// ── the stream ──
const sg = streamGround, ss = y => stream.sAt(y);
const ST = STONES[1], TAKE1 = 1080, LAND2 = 1640;
// The hare's run: piecewise in time. Returns position, pose and whether airborne.
function streamHare(lt) {
  const v = 900, tA = 0.5 + (TAKE1 - 500) / v;           // reaches the first take-off point
  if (lt < tA) { const x = 500 + (lt - 0.5) * v; return { x, y: sg(x), p: gallop(x / 124) }; }
  const j1 = 0.42, rest = 0.16, j2 = 0.5;
  if (lt < tA + j1) { const u = (lt - tA) / j1, x = lerp(TAKE1, ST.x, u), y = lerp(sg(TAKE1), ST.top, u), p = { ...HP.stretch, lift: Math.sin(Math.PI * u) * 70 }; return { x, y, p, air: 1 }; }
  if (lt < tA + j1 + rest) return { x: ST.x, y: ST.top, p: HP.bunch, landed: tA + j1 };
  if (lt < tA + j1 + rest + j2) { const u = (lt - tA - j1 - rest) / j2, x = lerp(ST.x, LAND2, u), y = lerp(ST.top, sg(LAND2), u), p = { ...HP.stretch, lift: Math.sin(Math.PI * u) * 95 }; return { x, y, p, air: 1, landed: tA + j1 }; }
  const t3 = lt - (tA + j1 + rest + j2), x = LAND2 + t3 * v; return { x, y: sg(x), p: gallop((x - LAND2) / 124), landed: tA + j1 };
}
const STREAM_T = { landed: 0.5 + (TAKE1 - 500) / 900 + 0.42 };
const frogOn = { x: FROG_ROCK.x, y: FROG_ROCK.top - 2 };
function frog(ctx, lt) {
  const t0 = STREAM_T.landed + 0.15, u = clamp((lt - t0) / 0.45);
  if (u <= 0) return drawFrog(ctx, frogOn.x, frogOn.y, 2.1, -1, {});
  if (u >= 1) return;
  drawFrog(ctx, lerp(frogOn.x, 1335, u), lerp(frogOn.y, 1168, u) - Math.sin(Math.PI * u) * 50, 2.1, -1, { jump: 1 });
}

// ── the wayside ──
const wg = waysideGround, ws = y => wayside.sAt(y), LANE = x => wg(x);
const STOP = 1180, SQX = 1250;
const squirrel = (ctx, st = {}) => drawSquirrel(ctx, SQX, branchTop(WAY_BRANCH, SQX), 1.25, -1, st);
const perchBirds = (ctx, lt) => { birdOn(ctx, WAY_BRANCH, 1130, 1.0, 1, '#6a4a3a', Math.max(0, Math.sin(lt * 4)) * 2 * (Math.sin(lt * 0.8) > 0.6)); birdOn(ctx, WAY_BRANCH, 1085, 0.95, 1, '#7a6a5a'); };
const sleepPose = lt => { const p = { ...HP.sleep }; p.bs *= 1 + 0.025 * Math.sin(lt * 2.4); return p; };
export const napHare = (ctx, lt, ex = { eyes: 'closed' }) => drawHare(ctx, NAP.x, NAP.y, ws(NAP.y), 1, sleepPose(lt), ex);
function treeShade(ctx, u, a = 0.22) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(60,80,70,${a})`; ctx.beginPath(); ctx.ellipse(WAY_TREE.x + lerp(-380, 380, u), WAY_TREE.base + 46, 520, 64, 0, 0, 7); ctx.fill(); ctx.restore(); }

function waysideHare(lt) {
  const runIn = runDist(lt, 1700, 900, 260), x = -520 + runIn;
  if (lt < 1.95) { const sk = smooth(1700 - 260, 1700, runIn); let p = gallop(runIn / 124, 1 - sk); if (sk > 0) p = mixPose(p, HP.skid, Math.min(1, sk * 1.5)); return { x, y: LANE(x), face: 1, p, ex: { eyes: 'open', mouth: 'smile' }, sk }; }
  if (lt < 3.8) return { x: STOP, y: LANE(STOP), face: -1, p: mixPose(HP.sit, HP.look, smooth(1.95, 2.4, lt)), ex: { eyes: 'open', mouth: 'smile' } };
  if (lt < 5.2) { const p = mixPose(HP.look, HP.laugh, smooth(3.8, 4.1, lt)); p.by -= Math.abs(Math.sin(lt * 14)) * 3; return { x: STOP, y: LANE(STOP), face: 1, p, ex: { eyes: 'happy', mouth: 'laugh' } }; }
  if (lt < 7.4) { const u = smooth(5.2, 7.4, lt), x = lerp(STOP, NAP.x, u), y = lerp(LANE(STOP), NAP.y, u); return { x, y, face: 1, p: gallop(u * 2.5, 0.4), ex: { eyes: 'half', mouth: 'smile' } }; }
  if (lt < 9.2) return { x: NAP.x, y: NAP.y, face: 1, p: mixPose(HP.sit, HP.yawn, smooth(7.5, 8.0, lt) * (1 - smooth(8.7, 9.2, lt))), ex: { eyes: lt > 7.7 && lt < 8.9 ? 'closed' : 'half', mouth: lt > 7.7 && lt < 8.9 ? 'yawn' : 'smile' } };
  return { x: NAP.x, y: NAP.y, face: 1, p: mixPose(HP.sit, sleepPose(lt), smooth(9.2, 10.2, lt)), ex: { eyes: lt > 9.6 ? 'closed' : 'half' } };
}

export default makeAct([
  // 15 · The stream: two bounds, stone to bank; the frog dives off its rock
  { d: 8, set: stream, grade: 'morning', cam: [[1300, 960, 1.25], [1420, 960, 1.28]],
    draw(ctx, lt) {
      const H = streamHare(lt), s = ss(H.y);
      const items = [{ y: frogOn.y, fn: c => frog(c, lt) },
        { y: 992, fn: c => drawMouse(c, 1660, 992, ss(992), -1, { pose: H.landed && lt > H.landed ? 'gasp' : 'idle' }) },
        { y: 998, fn: c => drawMouse(c, 1692, 998, ss(998), -1, { pose: H.landed && lt > H.landed + 0.2 ? 'gasp' : 'idle' }) }];
      if (H.x < 2600) items.push({ y: H.y, fn: c => { if (!H.air && H.x < TAKE1) speedLines(c, H.x - 30, H.y - 20, 1, lt, s); drawHare(c, H.x, H.y, s, 1, H.p, { eyes: H.air ? 'wide' : 'happy', mouth: H.air ? 'o' : 'smile' }); } });
      depth(ctx, items);
      splash(ctx, lt, STREAM_T.landed, ST.x, ST.top + 10, 1.2);
      splash(ctx, lt, STREAM_T.landed + 0.6, 1335, 1170, 1.0);
      if (lt > STREAM_T.landed + 1.1) dust(ctx, lt, STREAM_T.landed + 1.1, LAND2, sg, 1, 10, 1);
      butterflies(ctx, lt, [[900, 960, 120, 30, '#c9b8ec', 1], [1800, 1000, 100, 30, '#f2b24a', 3]]);
    } },
  // 16 · The wayside: he stops, looks back — nobody — laughs, saunters into the shade, yawns, lies down
  { d: 13, set: wayside, grade: 'morning', cam: [[1240, 900, 1.35], [1370, 925, 1.62]],
    draw(ctx, lt) {
      squirrel(ctx, { pose: 'hold', nibble: true, t: lt }); perchBirds(ctx, lt);
      treeShade(ctx, 0.2);
      const H = waysideHare(lt);
      depth(ctx, [{ y: H.y, fn: c => drawHare(c, H.x, H.y, ws(H.y), H.face, H.p, H.ex) }]);
      if (H.sk > 0) dust(ctx, lt, 1.4, H.x + 40, LANE, 1, 12, 1.1);
      if (lt > 10.6) zzz(ctx, [NAP.x + 30, NAP.y - 30], lt, 1.2);
      butterflies(ctx, lt, [[1650, 960, 150, 40, '#f6efe0', 1]]);
    } },
  // 17 · Time passes: the shade swings round the tree, clouds race over, the hare sleeps on
  { d: 7, set: wayside, grade: lt => ['morning', 'afternoon', lt / 7], skySpeed: 70, cam: [[1420, 860, 1.0], [1400, 870, 1.04]],
    draw(ctx, lt) {
      squirrel(ctx, { pose: 'hold', nibble: Math.floor(lt) % 3 === 0, t: lt }); perchBirds(ctx, lt);
      treeShade(ctx, 0.2 + 0.6 * lt / 7);
      napHare(ctx, lt); zzz(ctx, [NAP.x + 30, NAP.y - 30], lt, 1.1);
      motes(ctx, 61, 40, 900, 600, 1200, 400, lt, 0.5);
      butterflies(ctx, lt, [[1650, 960, 150, 40, '#f6efe0', 1], [1000, 1000, 150, 40, '#f2b24a', 3]]);
    } },
], [
  [15.5, 27.6, 'The Hare, lying down by the wayside, fell fast asleep.'],
]);
