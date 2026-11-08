// Act I — the valley at dawn, the meadow, the boast and the challenge. (shots 1–7)
import { clamp, lerp, smooth } from '../lib.mjs';
import { makeAct, cardText, dust, motes, TWOS } from '../engine.mjs';
import { valley, meadow, meadowGround, MEADOW_BRANCH } from '../sets.mjs';
import { acorn } from '../cast.mjs';
import { track, runDist, depth, birdLand, birdFly, butterflies, owlInHollow, squirrelOnMeadow, meadowBirds, crowdItems, SQ_X, HP, gallop, mixPose, drawHare, drawTortoise } from './common.mjs';
import { branchTop } from '../paint.mjs';

const S = meadow, sAt = y => S.sAt(y);
const TY = 1060, TX_END = 1330, HX = 1600;
const BFL = [[1150, 1000, 140, 40, '#f2b24a', 0], [1850, 1080, 120, 30, '#f6efe0', 2], [700, 1130, 100, 40, '#c9b8ec', 4]];

// The tortoise walks slowly; x is a function of the act time so shots cut together.
function tortoise(ctx, x, st = {}) { return { y: TY, fn: c => drawTortoise(c, x, TY, sAt(TY), 1, { walking: st.walking, phase: x / 38, ...st }) }; }
function hare(x, y, face, p, ex = {}) { return { y, fn: c => drawHare(c, x, y, sAt(y), face, p, ex) }; }
function mist(ctx, lt, a) { ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'screen'; ctx.drawImage(S.mist, -700 + lt * 10, 640); ctx.restore(); }
function perched(ctx, lt, st = {}) {
  owlInHollow(ctx, st.owl || { eyes: 'open' });
  squirrelOnMeadow(ctx, st.squirrel || { nibble: true, t: lt });
  if (st.landing) st.landing(ctx); else meadowBirds(ctx, lt);
}
function scene(ctx, lt, st, extra = []) {
  perched(ctx, lt, st);
  depth(ctx, [...crowdItems(S, lt, st.crowd || {}), ...extra]);
  butterflies(ctx, lt, BFL);
}

// Shot 3: the hare's showing-off loop — in from the right along the front, round the tortoise, skid to a stop facing her.
const LOOP = track([[2700, 1112], [1700, 1146], [1150, 1150], [985, 1066], [1150, 978], [1550, 968], [1815, 1000], [1800, 1050], [HX, 1060]]);
const V = 980, SKID = 170, T_IN = 0.9;
function loopHare(lt) {
  const d = runDist(lt - T_IN, LOOP.len, V, SKID), q = LOOP.at(d), face = q.dx < 0 ? -1 : 1;
  const s = sAt(q.y), sk = smooth(LOOP.len - SKID, LOOP.len, d), settle = smooth(0, 0.6, lt - T_IN - (LOOP.len - SKID) / V - 0.35);
  let p = gallop(d / (95 * s), 1 - sk); if (sk > 0) p = mixPose(p, HP.skid, Math.min(1, sk * 1.6)); if (settle > 0) p = mixPose(p, HP.sit, settle);
  return { q, face, p, sk, d };
}

export default makeAct([
  // 1 · Title over the valley at dawn
  { d: 8, set: valley, sky: 'dawn', grade: 'dawn', cam: [[1400, 760, 0.82], [1430, 735, 0.9]], fadeIn: 1.6, fadeOut: 0.8,
    draw(ctx, lt) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'screen'; ctx.drawImage(valley.mist, -500 + lt * 14, 760); ctx.restore();
      birdFly(ctx, 700, 520, 1900, 470, 0.55, lt, 0.5, 7.5, '#3a3048'); birdFly(ctx, 620, 560, 1820, 500, 0.45, lt, 0.9, 7.5, '#3a3048');
      motes(ctx, 11, 40, 900, 600, 1200, 400, lt, 0.5);
    },
    screen(ctx, lt) { const a = Math.min(smooth(1.4, 3, lt), 1 - smooth(6.6, 7.6, lt)); cardText(ctx, a, [['The Hare and the Tortoise', 104, 420, '#fff8e8', 'italic', true], ['a fable by Aesop  ·  translated by George Fyler Townsend', 34, 515, '#fff0d4', 'italic', true]]); } },

  // 2 · The meadow wakes: owl opens its eyes, birds settle on the branch, the tortoise is out early
  { d: 9, set: S, sky: lt => [['dawn', 1 - smooth(0, 8, lt)], ['morning', smooth(0, 8, lt)]], grade: ['dawn', 'morning'], cam: [[820, 800, 0.86], [1300, 870, 0.95]], fadeIn: 0.8,
    draw(ctx, lt) {
      mist(ctx, lt, 0.7 * (1 - smooth(2, 9, lt)));
      scene(ctx, lt, {
        owl: { eyes: lt < 2.6 ? 'closed' : lt < 3.4 ? 'half' : 'open' },
        landing: c => { birdLand(c, MEADOW_BRANCH, 735, 1.05, -1, '#6a4a3a', lt, 1.6, 2.4, 1250, 320); birdLand(c, MEADOW_BRANCH, 790, 1.0, -1, '#8a6a4a', lt, 3.2, 2.2, 1450, 380); },
        crowd: {},
      }, [tortoise(ctx, 1080 + lt * 11, { walking: true })]);
      motes(ctx, 21, 50, 300, 500, 2000, 500, lt, 0.5);
    } },

  // 3 · The hare arrives showing off: a loop round the tortoise, then a skid to a stop
  { d: 7, set: S, grade: 'morning', cam: [[1470, 955, 1.04], [1450, 965, 1.08]],
    draw(ctx, lt) {
      const H = loopHare(lt), tx = 1180 + lt * 17;
      const items = [tortoise(ctx, tx, { walking: true, headRot: H.d > 0 && H.d < LOOP.len ? clamp((H.q.x - tx) / 900, -0.25, 0.25) : 0 })];
      if (lt > T_IN) items.push(hare(H.q.x, H.q.y, H.face, H.p, { eyes: H.sk > 0.3 ? 'open' : 'happy', mouth: 'smile' }));
      scene(ctx, lt, { crowd: { alertDeer: lt > 1.8 } }, items);
      if (H.sk > 0) dust(ctx, lt, T_IN + (LOOP.len - SKID) / V, H.q.x + 30, () => H.q.y, H.face, 12, 1.1);
    } },

  // 4 · The mockery: points at her short feet, laughs, mimics her slow pace
  { d: 10, set: S, grade: 'morning', cam: [[1462, 990, 2.0], [1468, 990, 2.1]],
    draw(ctx, lt) {
      const tx = Math.min(TX_END, 1299 + lt * 17), walking = tx < TX_END;
      const look = smooth(1.4, 2, lt) * (1 - smooth(4, 4.6, lt));
      let p, ex, hx = HX;
      if (lt < 2.2) { p = mixPose(HP.sit, HP.mock, smooth(0.2, 0.8, lt)); ex = { eyes: 'half', mouth: 'smile' }; }
      else if (lt < 4.4) { p = mixPose(HP.mock, HP.laugh, smooth(2.2, 2.6, lt)); p.by -= Math.abs(Math.sin(lt * 14)) * 3; ex = { eyes: 'happy', mouth: 'laugh' }; }
      else if (lt < 7.8) { const k = Math.floor(TWOS(lt - 4.4) * 1.6) % 2; p = k ? HP.wiggle : HP.sit; hx = HX - Math.floor(TWOS(lt - 4.4) * 1.6) * 6; ex = { eyes: 'half', mouth: 'frown' }; }
      else { p = mixPose(HP.sit, HP.laugh, smooth(7.8, 8.2, lt)); p.by -= Math.abs(Math.sin(lt * 14)) * 3; hx = HX - 30; ex = { eyes: 'happy', mouth: 'laugh' }; }
      scene(ctx, lt, { crowd: { alertDeer: true } }, [tortoise(ctx, tx, { walking, headDy: look * 7, headRot: look * 0.5, ex: { eyes: 'open' } }), hare(hx, TY, -1, p, ex)]);
    } },

  // 5 · Close: the tortoise laughs, and answers
  { d: 8, set: S, grade: 'morning', dof: 5, cam: [[1372, 1002, 2.8], [1384, 1000, 3.0]],
    draw(ctx, lt) {
      const laugh = lt < 3.2, talk = !laugh && lt < 7.4 && Math.floor(lt * 7) % 3 !== 0;
      const st = { ex: { eyes: laugh ? 'happy' : 'open', mouth: laugh ? 'laugh' : talk ? 'talk' : undefined }, headRot: laugh ? -0.12 + Math.sin(lt * 12) * 0.06 : -0.05, ext: 3 + (laugh ? 0 : 4), headDy: laugh ? -2 : -4 };
      const hp = mixPose(HP.sit, HP.up, smooth(5, 6, lt));
      scene(ctx, lt, { crowd: { alertDeer: true } }, [tortoise(ctx, TX_END, st), hare(HX - 30, TY, -1, hp, { eyes: lt > 5.4 ? 'wide' : 'open', mouth: lt > 5.4 ? 'o' : 'smile' })]);
    } },

  // 6a · Reaction: the squirrel lets go of its acorn
  { d: 2.6, set: S, grade: 'morning', dof: 4, cam: [[656, 694, 2.4], [652, 690, 2.5]],
    draw(ctx, lt) {
      const drop = lt > 0.8, bt = branchTop(MEADOW_BRANCH, SQ_X);
      perched(ctx, lt, { squirrel: { pose: drop ? 'drop' : 'hold', nibble: !drop, t: lt, ex: { eyes: drop ? 'wide' : 'open' } } });
      if (drop) { const tau = lt - 0.8; ctx.save(); ctx.translate(SQ_X + 12 + tau * 30, bt - 20 + 900 * tau * tau); ctx.rotate(tau * 9); acorn(ctx, 0, 0, 1.35); ctx.restore(); }
    } },
  // 6b · the mice gasp
  { d: 2.2, set: S, grade: 'morning', dof: 4, cam: [[898, 1160, 4.4], [900, 1158, 4.6]],
    draw(ctx, lt) { scene(ctx, lt, { crowd: { mice: lt > 0.4 ? 'gasp' : 'idle' } }); } },
  // 6c · the owl's eyes go wide
  { d: 2.2, set: S, grade: 'morning', dof: 4, cam: [[440, 548, 3.4], [440, 546, 3.5]],
    draw(ctx, lt) { perched(ctx, lt, { owl: { eyes: lt < 0.5 ? 'open' : 'wide' } }); } },

  // 7 · Close on the hare: disbelief, a laugh, then he holds out his paw — agreed
  { d: 9, set: S, grade: 'morning', dof: 5, cam: [[1548, 962, 2.5], [1530, 966, 2.4]],
    draw(ctx, lt) {
      let p, ex;
      if (lt < 2.4) { p = mixPose(HP.sit, HP.up, smooth(0, 0.4, lt)); ex = { eyes: 'wide', mouth: 'o' }; }
      else if (lt < 5) { p = mixPose(HP.up, HP.laugh, smooth(2.4, 2.8, lt)); p.by -= Math.abs(Math.sin(lt * 14)) * 3; ex = { eyes: 'happy', mouth: 'laugh' }; }
      else { p = mixPose(HP.laugh, HP.offer, smooth(5, 5.6, lt)); ex = { eyes: 'open', mouth: 'smile' }; }
      const nod = smooth(6.6, 7.2, lt) * (1 - smooth(7.6, 8.2, lt));
      scene(ctx, lt, { crowd: { alertDeer: true } }, [tortoise(ctx, TX_END, { ext: 6 * smooth(6, 6.8, lt), headDy: nod * 5, ex: { eyes: 'open', mouth: nod > 0.5 ? 'talk' : undefined } }), hare(HX - 30, TY, -1, p, ex)]);
    } },
], [
  [24.5, 33.8, 'A Hare one day ridiculed the short feet and slow pace of the Tortoise,'],
  [34.3, 41.8, 'who replied, laughing: “Though you be swift as the wind, I will beat you in a race.”'],
  [49.4, 57.6, 'The Hare, believing her assertion to be simply impossible, assented to the proposal;'],
]);
