// A performer turns a short script ("walk to there, turn to face her, crouch, wave") into
// a pose for every instant. It works in two layers:
//
// The PLAN. Each verb, when it is called, lays its part of the script out as footsteps on
// the floor with times, a path for the body, headings, crouch and sit keys, and the
// windows of the gestures and looks. Verbs follow one another: each starts where the
// last ended (`time`), unless it is given its own `t0`, and returns the time it ends.
// Nothing is posed while the plan is laid, so actors can ask the `world` where the others
// will be at any time (createWorld in motion.mjs).
//
// The PERFORMANCE. Everything is read off the plan as a function of time:
//   - a foot that is down stays exactly where it was put (it only rolls heel-to-toe);
//   - a foot in the air travels on an arc to its next mark;
//   - the hips ride between the feet, shift over the foot that carries the weight,
//     drop when the legs are spread and rise as a leg passes under;
//   - hips turn with the feet; the chest and head are sprung toward the heading, the
//     head quickest and the eyes before it, so a turn goes eyes, head, shoulders, hips;
//   - arms swing against the legs, a beat late; the body leans into speed changes on a
//     spring, so it tips into a start and rocks back and settles when it stops;
//   - the character's loose parts (its description's `loose` list: a belly, buns, a skirt)
//     follow the body late on their springs;
//   - idle life never stops: breathing, blinks, eye darts, a slow shift of the weight and
//     drift of the head, all from the actor's seed, so a hold is never a freeze; and the
//     steps, swings, jumps and waves vary a little each time.
import * as THREE from 'three/webgpu';
import { defaultPose, HANDS } from './biped.mjs';
import { curve, spring, springVec, followers, smooth, smoother, lerp, lerpAngle, clamp, ramp, rnd, wobble, soft, detour } from './motion.mjs';
import { throwTo } from './ball.mjs';
import { hangOn } from './hang.mjs';

const other = (s) => (s === 'L' ? 'R' : 'L');
const sgn = (s) => (s === 'L' ? 1 : -1);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// the fastest a look turns the head (rad/s): well under the gate on skull, chest and hips (checks.mjs TURN_GATE). At 6,
// with a quick spring, an 80 degree look went in 4 frames and read as a snap (Dad's turn to the house, round 3); at
// 3.5 it takes about half a second, eased, the eyes there first and the chest coming after (see springs: chestPt).
export const HEAD_TURN = 3.5;
// A walk or run to a mark further round than this (rad) turns to it on the spot first (compile.mjs does the same).
export const TURN_FIRST = 1.05;
// the springs the body's weight follows the feet by: sideways over the support foot (cycles/s, and how far ahead of
// the step it leans, s), and the hips' turn after the feet' (cycles/s)
const LAT_F = 1.3, LAT_LEAD = 0.08, HIPS_F = 2.2;
// 0 before t0, 1 from t0 + ein to t1 - eout, 0 after t1, eased at both ends
const win = (t, t0, t1, ein, eout = ein) => ramp(t, t0, t0 + ein) * (1 - ramp(t, t1 - eout, t1));

export function createPerformer(rig, opts = {}) {
  const P = { at: [0, 0], yaw: 0, width: rig.info.hipWidth * 1.05, stepTime: 0.5, stepLen: 0.5, seed: 1, armSwing: 0.5, armSpread: rig.character.desc.rig.armSpread ?? 0.22, toeOut: 0.13,
    crouchDepth: 0.43 * rig.info.legLength, size: rig.info.legLength / 0.72, idle: 1, ...opts };   // size: 1 for the man; scales heights of arcs and bounces
  const leftOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];
  const fwdOf = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  const place = (c, yaw, side) => { const l = leftOf(yaw), s = side === 'L' ? 1 : -1; return [c[0] + l[0] * P.width * s, c[1] + l[1] * P.width * s]; };
  const world = P.world;
  // a target to look at, point at or reach for: [x, y, z], a function of time, or the name of something in the world
  const pointOf = (target, t) => {
    if (typeof target !== 'string') return typeof target === 'function' ? target(t) : target;
    if (!world) throw new Error(`performer: to look at or reach for "${target}" it needs a world (createPerformer(rig, { world, name }))`);
    return world.head(target, t);
  };

  const tracks = {
    L: { init: { pos: place(P.at, P.yaw, 'L'), yaw: P.yaw + P.toeOut }, steps: [] },
    R: { init: { pos: place(P.at, P.yaw, 'R'), yaw: P.yaw - P.toeOut }, steps: [] },
  };
  const segments = [];                 // where the body's ground point is while it travels
  // which way the character means to face: [from when, heading, over how long]. A new heading is eased in over its
  // time, never switched: the head and chest springs chase it, and a heading that jumps half a turn in one step
  // whips them round at 20 to 50 rad/s (the head turned 19 rad/s in films/_test3d at 7.79 s).
  const headingKeys = [[-1e9, P.yaw, 0]];
  const face = (t, yaw, dur = 0.1 + 0.25 * Math.abs(yaw - headingKeys[headingKeys.length - 1][1])) => headingKeys.push([t, yaw, dur]);
  const crouchKeys = [[0, 0]];
  const sitKeys = [[0, 0]], seats = [];  // how far down onto a seat (0 standing, 1 sitting), and the seats
  const bowKeys = [[0, 0]];              // how far the body bends forward to sit or get up (0 to 1)
  const layers = [];                   // extra acting laid over the base pose
  const looks = [], blinks = [];       // where it looks, from when to when; extra blinks (at a turn, a new look)
  const cur = { pos: [...P.at], yaw: P.yaw, next: 'R' };
  let clock = 0, nStep = 0;            // clock: when the plan so far ends
  // every verb ends here: the springs and the loose parts' table are stepped again with the new plan
  const until = (t) => { clock = Math.max(clock, t); S = null; follow = null; return t; };

  // A foot may only leave the floor when the other one is down (except in a run, where
  // both are in the air for a moment between steps).
  function step(side, st) {
    const mine = tracks[side].steps, theirs = tracks[other(side)].steps;
    const lastMine = mine[mine.length - 1], lastTheirs = theirs[theirs.length - 1];
    if ((lastMine && st.t0 < lastMine.t1 - 1e-9) || (!st.air && lastTheirs && st.t0 < lastTheirs.t1 - 1e-9)) {
      throw new Error(`performer: step for foot ${side} at ${st.t0.toFixed(2)} s starts before the previous step has landed`);
    }
    // no two steps alike: a little more or less lift
    st.h *= 0.85 + 0.3 * rnd(nStep++, P.seed);
    mine.push(st);
  }

  // ---------- the plan: verbs ----------
  // close: false leaves out the last closing step: the walk ends with one foot ahead and the
  // body still arriving, so the next move (a turn) can start out of the walk without a pause.
  // In a world, the way bows round anyone who will be standing in it (motion.mjs detour), the steps and the
  // heading following the bend.
  function walk({ t0 = clock, to, stepTime = P.stepTime, stepLen = P.stepLen, first, close = true }) {
    const from = [...cur.pos], dx = to[0] - from[0], dz = to[1] - from[1], D = Math.hypot(dx, dz);
    const yaw = cur.yaw + wrap(Math.atan2(dx, dz) - cur.yaw);
    // (never a stride much longer than stepLen: 0.9 m at 0.6 rounded to one 0.9 m stride, the trailing foot was left a
    // stride behind and the hips sank 15 cm, then sprang up as it lifted)
    const n = Math.max(1, Math.round(D / stepLen), Math.ceil(D / (1.15 * stepLen))), L = D / n, T = stepTime, S = 0.8 * T;
    const way = detour(world, P.name, api.radius, from, to, (s) => t0 + T * s / L), bent = way.at(D / 2)[0] !== from[0] + dx / 2 || way.at(D / 2)[1] !== from[1] + dz / 2;
    // (a walk that sets off round to one side starts with the foot on the other side: the near foot, stepping out
    // across the way, left the far one behind on a long diagonal and dropped the hips 6 to 13 cm; films/_test3d s02)
    let side = first ?? (Math.abs(yaw - cur.yaw) > 0.2 ? (yaw > cur.yaw ? 'R' : 'L') : cur.next);
    const knots = [[t0, 0]];
    for (let k = 1; k <= n; k++) {
      const tA = t0 + (k - 1) * T, tB = tA + S, y = yaw + wrap(way.yaw(k * L) - yaw);
      step(side, { t0: tA, t1: tB, pos: place(way.at(k * L), y, side), yaw: y + sgn(side) * P.toeOut * 0.6, h: 0.05 + 0.08 * L, push: 0.6, strike: 0.32 });
      if (bent) face(tA - 0.1, y, 0.35);
      knots.push([tB, (k - 0.5) * L]);
      side = other(side);
    }
    const tA = t0 + n * T, tB = tA + S * 0.9;
    face(t0 - 0.1, yaw);
    if (bent) face(tA - 0.1, yaw, 0.35);
    cur.pos = [...to]; cur.yaw = yaw;
    if (!close) {
      // the body keeps coming and settles over the mark while the trailing foot is free to step
      knots.push([tA + T * 1.15, D]);
      const s = curve(knots);
      segments.push({ t0, t1: tA + T * 1.15, at: (t) => way.at(s(t)) });
      cur.next = side; cur.open = true;
      return until(tA);
    }
    step(side, { t0: tA, t1: tB, pos: place(to, yaw, side), yaw: yaw + sgn(side) * P.toeOut, h: 0.045, push: 0.5, strike: 0.08 });
    knots.push([tB + 0.12, D]);
    const s = curve(knots);
    segments.push({ t0, t1: tB + 0.12, at: (t) => way.at(s(t)) });
    cur.next = other(side); cur.open = false;
    return until(tB + 0.12);
  }

  // A run: quick steps whose swings overlap, so for a moment between steps neither foot
  // is down. The body passes over each foot in the middle of its short time on the floor.
  const runs = [];      // [t0, t1] spans, for the running posture
  const landings = [];  // when a running foot touches down (drives the bounce)
  function run({ t0 = clock, to, stepTime = 0.19, stepLen = 0.5 * P.size, air = 0.3, first, endYaw }) {
    const from = [...cur.pos], dx = to[0] - from[0], dz = to[1] - from[1], D = Math.hypot(dx, dz);
    const yaw = cur.yaw + wrap(Math.atan2(dx, dz) - cur.yaw), u = [dx / D, dz / D];
    const n = Math.max(2, Math.round(D / stepLen)), L = D / n, T = stepTime, S = T * (1 + air), C = T * (1 - air);
    let side = first ?? cur.next;
    const knots = [[t0, 0]];
    for (let k = 1; k < n; k++) {
      const tA = t0 + (k - 1) * T, tB = tA + S;
      step(side, { t0: tA, t1: tB, air: true, pos: place([from[0] + u[0] * k * L, from[1] + u[1] * k * L], yaw, side), yaw: yaw + sgn(side) * P.toeOut * 0.3, h: 0.16 * P.size, push: 0.85, strike: 0.1, pre: 0.07 });
      knots.push([tB + C / 2, k * L]);
      landings.push(tB);
      side = other(side);
    }
    // pull up: one braking step that lands a little past the mark's line, then the other foot closes
    // (with endYaw she swings round on these two steps to face that way as she stops; they
    // are given more time the further she has to swing, so the turn is never a snap)
    const yEnd = endYaw === undefined ? yaw : yaw + wrap(endYaw - yaw);
    const slow = 1 + 0.35 * Math.abs(yEnd - yaw);
    const tA = t0 + (n - 1) * T, tB = tA + S * 1.1 * slow;
    step(side, { t0: tA, t1: tB, air: true, pos: place(to, yEnd, side), yaw: yEnd + sgn(side) * P.toeOut, h: 0.1 * P.size, push: 0.7, strike: 0.3, pre: 0.07 });
    landings.push(tB);
    const tC = tB + 0.06, tD = tC + 0.26 * slow;
    step(other(side), { t0: tC, t1: tD, pos: place(to, yEnd, other(side)), yaw: yEnd - sgn(side) * P.toeOut, h: 0.05 * P.size, push: 0.5, strike: 0.05 });
    // (the body is still between the feet when the braking foot lands, and reaches the mark only as the other closes up:
    // carried past the trailing foot sooner, the legs would split and the hips drop)
    knots.push([tB, (n - 0.45) * L], [tD + 0.1, D]);
    const s = curve(knots);
    segments.push({ t0, t1: tD + 0.1, at: (t) => { const d = s(t); return [from[0] + u[0] * d, from[1] + u[1] * d]; } });
    runs.push([t0, tB]);
    face(t0 - 0.1, yaw);
    if (yEnd !== yaw) face(tA - 0.25, yEnd);
    cur.pos = [...to]; cur.yaw = yEnd; cur.next = side;
    return until(tD + 0.1);
  }

  // A jump on the spot: sink (squash), push off (stretch), fly on a true parabola, land
  // (squash), settle. height is how far the feet leave the floor. No two jumps are quite alike.
  const jumps = [];
  const G = 9.81;
  function jump({ t0 = clock, height = 0.2 * P.size, sink = 0.32, turn = 0 }) {
    const k = jumps.length, v = rnd(k, P.seed + 31);
    sink *= 0.88 + 0.24 * v;
    // The legs straighten with a steady push, so the body leaves the floor at full speed (v0), and take the
    // landing the same way: the speed at each change is kept, which is what keeps a jump from popping.
    const v0 = Math.sqrt(2 * G * height), D = sink * P.crouchDepth, D2 = 1.05 * D;
    const ant = 0.2, push = 2 * D / v0, land = 2 * D2 / v0, T = 2 * Math.sqrt(2 * height / G);
    const tT = t0 + ant + push, tL = tT + T, tE = tL + land;
    const sinkIn = curve([[t0, 0], [t0 + ant, sink]]), rise = curve([[tE, sink * 1.05], [tE + 0.14, sink * 0.25], [tE + 0.32, 0]]);
    const c = (t) => {
      if (t <= t0 + ant) return sinkIn(t);
      if (t <= tT) { const u = (t - t0 - ant) / push; return sink * (1 - u * u); }
      if (t <= tL) return 0;
      if (t <= tE) { const tau = t - tL; return (v0 * tau - 0.5 * (v0 / land) * tau * tau) / P.crouchDepth; }
      return rise(t);
    };
    // body proportions: 1 = normal, below 1 squashed, above 1 stretched
    const sq = curve([[t0, 1], [t0 + ant, 0.93], [tT + 0.03, 1.07], [tT + T * 0.5, 1.0], [tL - 0.03, 1.05], [tL + 0.09, 0.9], [tL + 0.26, 1.03], [tL + 0.45, 1]]);
    jumps.push({ t0, tT, tL, T, height, c, sq, end: tE + 0.33, turn, fling: 0.8 + 0.4 * rnd(k, P.seed + 37) });
    if (turn) {
      // a turn in the air: both feet leave where they stood and land turned
      face(tT - 0.12, cur.yaw + turn); cur.yaw += turn;
      for (const side of ['L', 'R']) step(side, { t0: tT, t1: tL, air: true, inJump: true, pos: place(cur.pos, cur.yaw, side), yaw: cur.yaw + sgn(side) * P.toeOut, h: 0, push: 0, strike: 0, pre: 0.01 });
    }
    return until(tE + 0.33);
  }
  const jumpAt = (t) => {
    let y = 0, c = 0, sq = 1, air = 0, toes = 0, height = 0.2 * P.size, up = 0, fling = 1;
    for (const j of jumps) {
      if (t < j.t0 || t > j.end) continue;
      c += j.c(t); sq *= j.sq(t); height = j.height; fling = j.fling;
      if (t > j.tT && t < j.tL) { const u = (t - j.tT) / j.T; y = Math.max(y, 4 * j.height * u * (1 - u)); air = 1; toes = 0.75; }
      else if (t <= j.tT) toes = Math.max(toes, 0.75 * smooth((t - (j.tT - 0.07)) / 0.07));          // up on the toes just before leaving
      else toes = Math.max(toes, 0.75 * (1 - smooth((t - j.tL) / 0.06)));
      // the arms: back on the sink, flung up through the flight, down again on the landing
      up = Math.max(up, win(t, j.tT - 0.1, j.tL + 0.08, 0.14, 0.2));
    }
    return { y, c, sq, air, toes, height, up, fling };
  };

  // yaw: the heading to end on (the short way round), or by: a signed amount to turn
  // (positive toward +x from +z), which may be the long way. per: most a pair of steps turns.
  function turn({ t0 = clock, yaw, by, stepTime = 0.44, per = 1.45 }) {
    const d = by ?? wrap(yaw - cur.yaw), pairs = Math.max(1, Math.ceil(Math.abs(d) / per - 1e-6)), T = stepTime, S = 0.72 * T;
    // the foot on the inside of the turn steps first; out of an open walk, the foot left behind
    const lead = cur.open ? cur.next : d > 0 ? 'L' : 'R', open = cur.open;
    let t = t0;
    for (let i = 1; i <= pairs; i++) {
      const y = cur.yaw + d * i / pairs;
      // (out of an open walk the first step brings the trailing foot up from a stride behind: a step, not a placing)
      step(lead, { t0: t, t1: t + S, pos: place(cur.pos, y, lead), yaw: y + sgn(lead) * P.toeOut, h: 0.04, push: 0.3, strike: 0.04, place: !(open && i === 1) });
      t += T;
      step(other(lead), { t0: t, t1: t + S, pos: place(cur.pos, y, other(lead)), yaw: y - sgn(lead) * P.toeOut, h: 0.05, push: 0.38, strike: 0.04, place: true });
      t += T;
    }
    face(t0 - 0.12, cur.yaw + d, 0.65 * (t - t0));     // (the head gets round about two thirds of the way through the steps)
    if (Math.abs(d) > 0.8) blinks.push(t0 - 0.1);     // a big turn starts with a blink
    cur.yaw += d; cur.next = lead; cur.open = false;
    return until(t);
  }

  // amount: 0 standing, 1 fully down. Goes through a spring, so it sinks, dips, settles.
  function crouch({ t0 = clock, dur = 0.7, amount = 1 }) {
    const last = crouchKeys[crouchKeys.length - 1];
    if (t0 > last[0]) crouchKeys.push([t0, last[1]]);
    // a small move the other way first (a breath up before sinking, a dip before rising)
    crouchKeys.push([t0 + dur * 0.2, last[1] - 0.07 * Math.sign(amount - last[1])]);
    crouchKeys.push([t0 + dur, amount]);
    return until(t0 + dur);
  }
  const layer = (fn) => { layers.push(fn); S = null; follow = null; };   // (the loose parts' table is stepped again with the new layer)

  // ---- the same verbs in the order a storyboard says them: each starts where the last ended ----
  const headingTo = (target, t, from = cur.pos) => { const p = typeof target === 'number' ? null : Array.isArray(target) && target.length === 2 ? [target[0], 0, target[1]] : pointOf(target, t); return p ? Math.atan2(p[0] - from[0], p[2] - from[1]) : target; };
  // to: [x, z]. face: a heading, a point or someone to turn to at the end (out of the last step, without a stop).
  function walkTo(to, o = {}) {
    let t0 = o.t0 ?? clock;
    const along = Math.atan2(to[0] - cur.pos[0], to[1] - cur.pos[1]);
    // (a mark more than 60 degrees round is turned to first, on the spot: a first step that pivots further leaves a
    // foot behind on a long diagonal and drops the hips; past 90 degrees it crossed the feet's heading in one frame)
    if (Math.hypot(to[0] - cur.pos[0], to[1] - cur.pos[1]) > 0.1 && Math.abs(wrap(along - cur.yaw)) > TURN_FIRST) t0 = turn({ t0, by: wrap(along - cur.yaw) });
    const turns = o.face !== undefined && Math.abs(wrap(headingTo(o.face, t0, to) - along)) > 0.3;
    const t = walk({ ...o, t0, to, close: !turns && (o.close ?? true) });
    return turns ? turnTo(o.face, { t0: t, stepTime: 0.32, per: 1.6, through: o.through }) : t;
  }
  function runTo(to, o = {}) { return run({ ...o, to, endYaw: o.face === undefined ? undefined : headingTo(o.face, o.t0 ?? clock, to) }); }
  // target: a heading, a point [x, z] or [x, y, z], or someone in the world. through: a point the turn should
  // pass facing (the camera, for a turn through a front view): it then goes the long way if it must.
  function turnTo(target, o = {}) {
    const t0 = o.t0 ?? clock, yaw = headingTo(target, t0);
    let by = wrap(yaw - cur.yaw);
    if (o.through) {
      const q = headingTo(o.through, t0), mid = wrap(q - cur.yaw);
      if (Math.sign(mid) !== Math.sign(by) || Math.abs(mid) > Math.abs(by)) by -= Math.sign(by) * 2 * Math.PI;
    }
    if (Math.abs(by) < 0.05) return until(t0);
    return turn({ ...o, t0, by });
  }
  const crouchTo = (amount, o = {}) => crouch({ ...o, amount });
  const wait = (dur) => until(clock + dur);

  // Sit on a seat: on = [x, y, z] the point of the seat under the hips (y = 0, or leave it out, for the floor).
  // The actor stands in front of the seat with its back to it (walkTo(..., { face })). On a seat, the feet first
  // step to where the shins will stand upright under the knees (back toward the seat, or forward); then the
  // weight goes back: the body bends forward as the hips go back and down, the hands slide down the thighs and
  // press on them, the feet stay planted, and it sits up as the seat takes it. On the floor the feet slide out in
  // front. stand() gets up again.
  function sit({ t0 = clock, on, dur = 1.1 } = {}) {
    // (a seat not behind it is turned from first, so that it sits back onto it)
    const away = on && Math.atan2(cur.pos[0] - on[0], cur.pos[1] - on[2]);
    if (on && Math.hypot(cur.pos[0] - on[0], cur.pos[1] - on[2]) > 0.15 && Math.abs(wrap(away - cur.yaw)) > 0.3) t0 = turn({ t0, yaw: away, stepTime: 0.36, per: 1.6 });
    const back = fwdOf(cur.yaw), floor = !on || on[1] < 0.15 * P.size;
    const seat = on ? [on[0], on[1], on[2]] : [cur.pos[0] - back[0] * 0.18 * P.size, 0, cur.pos[1] - back[1] * 0.18 * P.size];
    if (!floor) {
      const feet = [seat[0] + back[0] * 0.5 * rig.info.legLength, seat[2] + back[1] * 0.5 * rig.info.legLength], from = [...cur.pos];
      if (Math.hypot(feet[0] - from[0], feet[1] - from[1]) > 0.04) {
        // a shuffle: one foot, then the other, the body going with them
        for (const [k, side] of [[0, 'L'], [1, 'R']]) step(side, { t0: t0 + 0.32 * k, t1: t0 + 0.32 * k + 0.28, pos: place(feet, cur.yaw, side), yaw: cur.yaw + sgn(side) * P.toeOut, h: 0.03, push: 0.2, strike: 0.05 });
        const ease = curve([[t0, 0], [t0 + 0.65, 1]]);
        segments.push({ t0, t1: t0 + 0.65, at: (t) => [lerp(from[0], feet[0], ease(t)), lerp(from[1], feet[1], ease(t))] });
        cur.pos = feet; t0 += 0.6;
      }
    }
    seats.push({ t0, seat, floor, yaw: cur.yaw });
    sitKeys.push([t0, sitKeys[sitKeys.length - 1][1]], [t0 + dur, 1]);
    bowKeys.push([t0, 0], [t0 + 0.6 * dur, 1], [t0 + dur, 0.15], [t0 + dur + 0.3, 0]);
    if (floor) {
      // the legs go out in front, heels on the floor
      const ahead = [seat[0] + back[0] * 0.66 * rig.info.legLength, seat[2] + back[1] * 0.66 * rig.info.legLength];
      step('L', { t0: t0 + dur * 0.4, t1: t0 + dur * 0.65, pos: place(ahead, cur.yaw, 'L'), yaw: cur.yaw + P.toeOut, h: 0.03, push: 0, strike: 0.5, rest: -0.5 });
      step('R', { t0: t0 + dur * 0.67, t1: t0 + dur * 0.92, pos: place(ahead, cur.yaw, 'R'), yaw: cur.yaw - P.toeOut, h: 0.03, push: 0, strike: 0.5, rest: -0.5 });
    }
    return until(t0 + dur);
  }
  // Stand: hold for dur (idle life goes on); from a seat it first gets up: it leans forward until its weight is over
  // its feet (nose over toes), then pushes on its thighs and rises, coming upright as it straightens.
  function stand({ t0 = clock, dur = 0 } = {}) {
    let t = t0;
    if (sitKeys[sitKeys.length - 1][1] > 0) {
      const s = seats[seats.length - 1], up = 1.0;
      if (s.floor) {
        // feet come back under the body first
        step('L', { t0: t, t1: t + 0.25, pos: place(cur.pos, s.yaw, 'L'), yaw: s.yaw + P.toeOut, h: 0.04, push: 0, strike: 0.1 });
        step('R', { t0: t + 0.27, t1: t + 0.52, pos: place(cur.pos, s.yaw, 'R'), yaw: s.yaw - P.toeOut, h: 0.04, push: 0, strike: 0.1 });
        t += 0.35;
      }
      bowKeys.push([t, 0], [t + 0.35, 1], [t + 0.3 + 0.6 * up, 0.35], [t + 0.3 + up, 0]);
      sitKeys.push([t + 0.2, 1], [t + 0.2 + up, 0]);
      t += 0.2 + up;
    }
    return until(t + dur);
  }

  // ---------- gestures: layers with a time window (they do not move the clock) ----------
  // Arms are asked for in pose.hand (a point to reach, by inverse kinematics) or set as angles; a hand that
  // reaches is never asked for more than the arm's length.
  const afters = [];   // (pose, out, ctx, t) => set pose.hand from the solved body
  // ask for a hand; two asks for the same hand at the same time are mixed by their weights
  const setHand = (pose, s, want) => {
    const was = pose.hand[s];
    if (was) { const a = was.w / (was.w + want.w); want.to = want.to.map((v, i) => lerp(v, was.to[i], a)); want.w = 1 - (1 - was.w) * (1 - want.w); }
    pose.hand[s] = want;
  };
  // where the hands hold something: x to the left, y up, z forward, from between the shoulders, in metres for
  // a body of this size (written for the girl: the man's are scaled up)
  const k0 = P.size / 0.487;
  const chestOf = (fr) => {
    const r = rig.info.shoulder;
    return { mid: V(0, r[1], r[2]).applyQuaternion(fr.q.chest).add(fr.pos.chest), q: fr.q.chest };
  };
  const fromChest = (f, p) => V(...p).multiplyScalar(k0).applyQuaternion(f.q).add(f.mid);

  // Look at something: a point [x, y, z], a function of time, or someone/something in the world (its head).
  // The eyes get there first, the head follows with a lag, the chest a little. Looks may overlap: a later one
  // wins while it is on, and the gaze slides back when it ends. (The old form lookAt(pose, ctx, target, w), used inside a layer,
  // turns the head at once.)
  function lookAt(target, o, a3, a4) {
    if (target && target.pelvis) return lookAtPose(target, o, a3, a4);
    const t0 = o?.t0 ?? clock, t1 = o?.t1 ?? (o?.dur !== undefined ? t0 + o.dur : 1e9);
    looks.push({ target, t0, t1, ease: o?.ease ?? 0.35 });
    if (looks.length === 1) layers.unshift(lookLayer);
    blinks.push(t0 + 0.04);
    S = null; follow = null;
  }
  // A face: one of the character's expressions (character.mjs EXPRESSIONS: happy, worried, surprised, sad,
  // sleepy, angry) from t0 to t1, eased in and out over `ease`; amount 0..1. Overlapping ones mix.
  function express(name, { t0 = clock, t1, dur = 1.5, amount = 1, ease = 0.25 } = {}) {
    t1 ??= t0 + dur;
    layer((pose, t) => { const w = amount * win(t, t0, t1, ease); if (w > 0) pose.face.expr[name] = Math.max(pose.face.expr[name] ?? 0, w); });
    return t1;
  }
  // Tired, from t0 to t1, eased in and out over `ease`; amount 0..1: the shoulders drop and come forward, the chest
  // sinks, the head hangs a little, the arms hang heavy and swing less, the lids sit lower, the brows sag.
  function tired({ t0 = clock, t1 = 1e9, amount = 1, ease = 0.6 } = {}) {
    layer((pose, t) => {
      const w = amount * win(t, t0, t1, ease); if (w <= 0) return;
      pose.spine.pitch += 0.2 * w; pose.head.pitch += 0.16 * w;
      pose.pelvis.pos[1] -= 0.012 * P.size * w;
      for (const s of ['L', 'R']) {
        const a = pose['arm' + s];
        a.shrug = (a.shrug ?? 0) - 0.05 * P.size * w; a.swing = a.swing * (1 - 0.45 * w) + 0.06 * w; a.spread -= 0.05 * w; a.elbow += 0.06 * w; if (!Array.isArray(a.curl)) a.curl *= 1 - 0.3 * w;
      }
      pose.face.blink = Math.max(pose.face.blink, 0.22 * w); pose.face.browUp -= 0.15 * w; pose.face.browTilt -= 0.2 * w;
    });
    return t1;
  }
  // A sigh: the chest fills and lifts over the first 40 % of `dur`, then lets go, the shoulders and head dropping a
  // little below where they started and coming back; the lids lower as it goes out.
  function sigh({ t0 = clock, dur = 1.6 } = {}) {
    const t1 = t0 + dur, top = t0 + 0.4 * dur;
    layer((pose, t) => {
      if (t <= t0 || t >= t1) return;
      const w = t < top ? Math.sin(0.5 * Math.PI * (t - t0) / (top - t0)) : Math.cos(Math.PI * (t - top) / (t1 - top)) * 0.5 + 0.5;   // in: 0 to 1; out: 1 to 0
      const out = t < top ? 0 : Math.sin(Math.PI * (t - top) / (t1 - top));                                                             // the slump in the middle of the out-breath
      pose.spine.pitch += -0.06 * w + 0.07 * out; pose.head.pitch += -0.08 * w + 0.1 * out;
      pose.chestScale = (pose.chestScale ?? 1) + 0.02 * w;
      for (const s of ['L', 'R']) pose['arm' + s].shrug = (pose['arm' + s].shrug ?? 0) + (0.025 * w - 0.02 * out) * P.size;
      pose.face.blink = Math.max(pose.face.blink, 0.35 * out);
    });
    return t1;
  }
  // A laugh: the face laughs (eyes squeezed, mouth open in a smile), the head tips back a little and the chest and
  // shoulders shake with it about four and a half times a second, dying away at the end.
  function laugh({ t0 = clock, dur = 1.4 } = {}) {
    const t1 = t0 + dur;
    layer((pose, t) => {
      const w = win(t, t0, t1, 0.15, 0.5); if (w <= 0) return;
      const shake = Math.sin(2 * Math.PI * 4.5 * (t - t0)) ** 2 * (1 - 0.6 * (t - t0) / dur);
      pose.face.expr.laugh = Math.max(pose.face.expr.laugh ?? 0, w);
      pose.spine.pitch += (-0.05 + 0.05 * shake) * w; pose.head.pitch += (-0.1 + 0.04 * shake) * w;
      for (const s of ['L', 'R']) pose['arm' + s].shrug = (pose['arm' + s].shrug ?? 0) + 0.012 * P.size * shake * w;
    });
    return t1;
  }
  // A wave: the arm high, the forearm rocking from the elbow, the hand a beat behind; the body joins in.
  function wave({ t0 = clock, dur = 2.5, arm = 'R', rate = 2 } = {}) {
    const t1 = t0 + dur, m = arm === 'R' ? 1 : -1;
    layer((pose, t) => {
      const ww = win(t, t0, t1, 0.45); if (ww <= 0) return;
      const a = pose['arm' + arm], o = pose['arm' + other(arm)];
      const amp = 1 + 0.18 * wobble(t, 61, P.seed, 0.4), ph = 2 * Math.PI * rate * (t - t0) + 0.5 * wobble(t, 62, P.seed, 0.3);
      const rise = ramp(t, t0, t0 + 0.5), u = t - t0, over = 0.1 * Math.exp(-u / 0.25) * Math.sin(u * 9) * smooth(u / 0.2);   // up past its place, settles
      a.swing = lerp(a.swing, 2.72 + over + 0.06 * Math.sin(ph * 2), ww); a.spread = lerp(a.spread, 0.32 + 0.3 * amp * Math.sin(ph) * rise, ww); a.twist = lerp(a.twist, 0.25, ww);
      a.elbow = lerp(a.elbow, 0.38 + 0.2 * amp * Math.sin(ph - 0.7) * rise, ww); a.wrist = [lerp(a.wrist[0], -0.1, ww), 0.4 * amp * Math.sin(ph - 1.3) * ww, 0];
      a.curl = lerp(a.curl, 0.05, ww); a.fan = lerp(a.fan, 0.6, ww); a.thumb = lerp(a.thumb, 0.1, ww); a.shrug = (a.shrug ?? 0) + 0.02 * P.size * ww;
      pose.spine.roll -= m * (0.05 + 0.035 * Math.sin(ph - 0.4)) * ww; pose.face.browUp = Math.max(pose.face.browUp, ww);
      pose.head.roll -= m * 0.06 * Math.sin(ph * 0.5) * ww; pose.head.pitch += 0.03 * Math.sin(ph - 1.0) * ww;
      pose.pelvis.pos[1] -= 0.008 * P.size * (0.5 + 0.5 * Math.sin(ph)) * ww;
      o.spread += 0.1 * ww; o.elbow += 0.3 * ww; o.swing += 0.05 * Math.sin(ph - 0.9) * ww;
    });
    return t1;
  }
  // Point at something with one arm, the index finger out; the head looks along the arm.
  function point({ t0 = clock, dur = 1.5, at: target, arm = 'R' } = {}) {
    const t1 = t0 + dur;
    lookAt(target, { t0: t0 - 0.15, t1: t1 + 0.1, ease: 0.3 });
    afters.push((pose, out, ctx, t) => {
      const w = win(t, t0, t1, 0.35); if (w <= 0) return;
      const sh = out.joints['shoulder' + arm], q = V(...pointOf(target, t)).sub(sh), len = rig.info.armLength * 0.97;
      const over = 0.06 * Math.exp(-(t - t0) / 0.2) * Math.sin((t - t0) * 12) * smooth((t - t0) / 0.15);
      const to = sh.clone().addScaledVector(q.normalize(), len).add(V(0, over * P.size, 0));
      setHand(pose, arm, { to: to.toArray(), w, elbowDir: [0, -1, 0], wrist: [0, 0, 0], ...HANDS.point });
    });
    layer((pose, t) => { const w = win(t, t0, t1, 0.35); pose.spine.pitch += 0.04 * w; });
    return t1;
  }
  // Clap: the hands meet in front of the chest about three times a second, a little unevenly; higher in a jump, but
  // never more than three quarters of the way up from the shoulders to the mouth (a child's big head sits low on
  // its shoulders: a fixed lift brought his hands up to his mouth).
  const clapTop = Math.min(0.1, 0.75 * ((rig.character.desc.face?.mouth?.at[1] ?? Infinity) - rig.character.rest.chest.y - rig.info.shoulder[1]) / k0);
  // Each clap opens its own width (the clap's number picks it, so the width changes only when the palms meet). The
  // hands meet well in front of the chest, elbows down, thumbs up and palms facing, so the fingers point forward and
  // stop where they meet (they never cross).
  function clap({ t0 = clock, dur = 2, rate = 3.1 } = {}) {
    const t1 = t0 + dur;
    afters.push((pose, out, ctx, t) => {
      const cw = win(t, t0, t1, 0.25); if (cw <= 0) return;
      const ph = 2 * Math.PI * rate * (t - t0) + 0.35 * wobble(t, 71, P.seed, 0.5), beat = 0.5 + 0.5 * Math.cos(ph);
      const wide = 0.17 * (0.75 + 0.35 * wobble(Math.floor(ph / (2 * Math.PI) + 0.5), 72, P.seed, 0.9));
      const f = chestOf(rig.frames(pose)), lift = clapTop * clamp(ctx.jump.y / ctx.jump.height);
      for (const s of ['L', 'R']) {
        const sx = sgn(s);
        setHand(pose, s, { to: fromChest(f, [sx * (0.035 + wide * beat * beat), lift - 0.05, 0.2]).toArray(), w: cw, elbowDir: V(sx * 0.5, -0.85, -0.1).applyQuaternion(f.q).toArray(), wrist: [-0.1, 0, 0], curl: 0.1, fan: 0.1, thumb: 0.2 });
      }
    });
    return t1;
  }
  // Reach for something with one hand and bring the hand back: the hand chases the target on a spring (so a
  // flying ball is followed, not snapped to); it goes no farther than the arm can.
  function reach({ t0 = clock, dur = 1, to: target, arm = 'R', hold = 0.2 } = {}) {
    const t1 = t0 + dur;
    let chase = null;
    afters.push((pose, out, ctx, t) => {
      const w = win(t, t0, t1, 0.3, 0.45); if (w <= 0) return;
      chase ??= springVec((tt) => pointOf(target, Math.min(Math.max(tt, t0 - 0.5), t1)), { f: 3.2, z: 0.8, dt: 1 / 240 });
      const sh = out.joints['shoulder' + arm], q = V(...chase(t)).sub(sh), len = rig.info.armLength * 0.95;
      const to = sh.clone().add(q.setLength(Math.min(q.length(), len)));
      const sx = sgn(arm), fr = fwdOf(pose.pelvis.yaw), lf = leftOf(pose.pelvis.yaw);
      setHand(pose, arm, { to: to.toArray(), w, elbowDir: [lf[0] * sx * 0.6 - fr[0] * 0.3, -0.75, lf[1] * sx * 0.6 - fr[1] * 0.3], wrist: [-0.3, 0, 0], curl: 0.1, fan: 0.7, thumb: 0 });
    });
    return t1;
  }
  // Hold a ball (radius r) in both hands in front of the chest from t0 to t1; with release, throw it then:
  // pull it in and lean back, drive it up and out, let go, the hands follow it and drop. aim: { to: [x, z],
  // vy } or { to, time } sends it to land first at `to`. Returns { at(t), path }: where the ball is at any
  // time (path: its flight after the release, set at the first call that needs it).
  function holdBall({ t0 = clock, t1 = 1e9, r = 0.085, release, aim, ball: ballOpts = {} } = {}) {
    const carry = [0, -0.105, 0.155], pulled = [0, -0.14, 0.1], pushed = [0, 0.09, 0.2];
    const R = release ?? 1e9, wind = R - 0.58, push = R - 0.16, Dp = R - push;
    const holdAt = (t) => {
      if (t < wind) return carry;
      if (t < push) { const u = smooth((t - wind) / (push - wind - 0.06)); return carry.map((v, i) => lerp(v, pulled[i], u)); }
      const u = clamp((t - push) / Dp); return pulled.map((v, i) => lerp(v, pushed[i], u * u));   // accelerating: fastest at the release
    };
    const H = { path: null, P: null, v: null };
    // over the push the ball is carried along the start of its own flight, speeding up from rest, so that at the
    // release ball and hands have exactly the launch velocity
    const inHand = (f, t) => {
      const c = fromChest(f, holdAt(t));
      if (!H.v || t <= push) return c;
      const u = clamp((t - push) / Dp);
      return c.lerp(H.P.clone().addScaledVector(H.v, -(Dp / 2) * (1 - u * u)), smooth(u));
    };
    const heldAt = (t) => inHand(chestOf(rig.frames(poseAt(t, true, true).pose)), t);
    const launch = () => {
      if (H.path || release === undefined) return;
      H.P = heldAt(R);
      const p = throwTo({ t0: R, p0: H.P.toArray(), r, ...aim, ...ballOpts });
      H.path = p; H.v = V(...p.segs[0].v);
    };
    if (release !== undefined) {
      const lean = curve([[wind, 0], [push - 0.05, -0.36], [R, 0.4], [R + 0.22, 0.22], [R + 0.7, 0]]);
      const sink = curve([[wind, 0], [push - 0.05, 0.32], [R, -0.03], [R + 0.3, 0]]);
      const twist = curve([[wind, 0], [push - 0.05, -0.3], [R, 0.3], [R + 0.45, 0]]);
      layer((pose, t) => {
        if (t < wind - 0.1 || t > R + 1) return;
        pose.spine.pitch += lean(t) * 0.7; pose.pelvis.pitch += lean(t) * 0.3; pose.head.pitch -= lean(t) * 0.5;
        pose.pelvis.pos[1] -= sink(t) * 0.06 * k0; pose.spine.yaw += twist(t);
        const up = ramp(t, push, R) * (1 - ramp(t, R + 0.1, R + 0.4));
        for (const s of ['L', 'R']) { pose['foot' + s].pitch += 0.5 * up; pose['foot' + s].toe -= 0.4 * up; }
      });
    }
    afters.push((pose, out, ctx, t) => {
      const w = win(t, t0, Math.min(t1, R + 0.55), 0.3, release !== undefined ? 0.43 : 0.3); if (w <= 0) return;
      if (t > push) launch();
      const f = chestOf(rig.frames(pose));
      for (const s of ['L', 'R']) {
        const sx = sgn(s), side = (g, y, z) => V(sx * g, y, z).applyQuaternion(f.q);
        let to;
        if (t <= R) to = inHand(f, t).add(side(r * 0.93, -0.01, -0.012));
        else {
          // follow-through: the hands carry on the way the ball went, slowing, opening, then drop
          const tau = t - R;
          to = H.P.clone().addScaledVector(H.v, 0.05 * (1 - Math.exp(-tau / 0.05))).add(side(r * 0.93 + 0.05 * clamp(tau / 0.15), -0.01, -0.012));
          to.lerp(fromChest(f, [sx * 0.15, -0.13, 0.2]), ramp(t, R + 0.1, R + 0.5));
          const sh = out.joints['shoulder' + s], d = to.clone().sub(sh), len = 0.97 * rig.info.armLength;   // (as far as the arm goes, no farther)
          if (d.length() > len) to.copy(sh).add(d.setLength(len));
        }
        setHand(pose, s, { to: to.toArray(), w, elbowDir: side(0.8, -0.6, -0.25).toArray(), wrist: [-0.25, 0, 0.9], curl: 0.3, fan: 0.4, thumb: 0.3 });
      }
    });
    follow = null;
    return {
      path: () => { launch(); return H.path; },
      at(t) {
        if (t <= R) { const p = heldAt(t); return { pos: p.toArray(), angle: 0, axis: V(1, 0, 0), squash: 1, vel: [0, 0, 0] }; }
        launch(); return H.path.at(t);
      },
    };
  }

  // ---------- the performance: read-out ----------
  function footAt(side, t) {
    const tr = tracks[side];
    let from = tr.init, active = null, next = null;
    for (const s of tr.steps) {
      if (t >= s.t1) from = s;
      else if (t >= s.t0) { active = s; break; } else { next = s; break; }
    }
    if (active) {
      const u = (t - active.t0) / (active.t1 - active.t0), e = active.place ? smoother(u) : lerp(u, smooth(u), 0.75);
      // (a step that turns on the spot is set down, not struck: its foot comes to rest at the floor, or the hips, pulled
      // down by the reaching leg, stopped dead as it landed)
      const arc = active.place ? Math.sin(Math.PI * u) ** 2 : Math.sin(Math.PI * Math.pow(u, 0.85));
      const pitch = lerp(from.rest ?? active.push, -active.strike, smooth(u * 1.15));
      if (active.inJump) return { pos: [lerp(from.pos[0], active.pos[0], smooth(u)), lerp(from.pos[1], active.pos[1], smooth(u))], yaw: lerpAngle(from.yaw, active.yaw, smooth(u)), pitch: 0, toe: 0, support: 0, arc: 0 };
      const A0 = rig.ankleOf({ pos: from.pos, yaw: from.yaw, pitch: from.rest ?? active.push });
      const A1 = rig.ankleOf({ pos: active.pos, yaw: active.yaw, pitch: -active.strike });
      const ankle = A0.lerp(A1, e);
      ankle.y += active.h * arc;
      return {
        pos: [lerp(from.pos[0], active.pos[0], e), lerp(from.pos[1], active.pos[1], e)],
        yaw: lerpAngle(from.yaw, active.yaw, smooth(u)), pitch,
        toe: -active.push * (1 - smooth(u * 3.5)), ankle: ankle.toArray(), support: 0, arc,
      };
    }
    let pitch = from.rest ?? 0, support = 1;
    if (from.t1 !== undefined && from.rest === undefined) {
      const a = (t - from.t1) / 0.1;
      if (a < 1) pitch -= from.strike * (1 - smooth(a));
      support = Math.min(support, smooth((t - from.t1) / 0.18));
    }
    if (next) {
      // the heel peels up before the next step (not before this foot has landed: then it would land rolled)
      const pre = next.pre ?? 0.17;
      pitch += next.push * smooth((t - (next.t0 - pre)) / pre) * (from.t1 !== undefined ? smooth((t - from.t1) / 0.08) : 1);
      support = Math.min(support, 1 - smooth((t - (next.t0 - 0.16)) / 0.16));
    }
    return { pos: from.pos, yaw: from.yaw, pitch, toe: -Math.max(pitch, 0), support, arc: 0 };
  }

  function bodyAt(t) {
    let p = P.at;
    for (const s of segments) { if (t < s.t0) break; p = s.at(Math.min(t, s.t1)); }
    return p;
  }
  const heading = (t) => { let y = headingKeys[0][1]; for (const [kt, ky, d] of headingKeys) if (t >= kt) y = d > 0 ? lerp(y, ky, smooth((t - kt) / d)) : ky; return y; };

  // Springs are created on first use, after the script is complete.
  let S = null;
  function springs() {
    if (S) return S;
    const cr = curve(crouchKeys.length > 1 ? crouchKeys : [[0, 0], [1, 0]]);
    const h = 0.03;
    const vel = (t) => { const a = bodyAt(t - h), b = bodyAt(t + h); return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)]; };
    const fwdSpeed = (t) => { const v = vel(t), f = fwdOf(heading(t)); return v[0] * f[0] + v[1] * f[1]; };
    S = {
      crouch: spring(cr, { f: 2.1, z: 0.52 }),
      sit: sitKeys.length > 1 ? spring(curve(sitKeys), { f: 2, z: 0.8 }) : () => 0,
      bow: curve(bowKeys.length > 1 ? bowKeys : [[0, 0], [1, 0]]),
      head: spring(heading, { f: 2.6, z: 0.62 }),
      // (the hips go over the foot that carries the weight a little ahead of it and smoothly: the weight itself moves
      // from foot to foot in 0.16 s and holds, which moved the hips 12 cm sideways in 3 frames and then stopped them dead
      // at every step of a walk and of a turn on the spot)
      lat: spring((t) => weightAt(t + LAT_LEAD), { f: LAT_F, z: 0.8 }),
      // (the hips turn with the feet, but through a spring: tied to the feet's own yaw they turned in a burst with each
      // step of a turn on the spot and stopped as the foot came down)
      hips: spring((t) => lerpAngle(footAt('L', t).yaw, footAt('R', t).yaw, 0.5), { f: HIPS_F, z: 0.8 }),
      chest: spring((t) => heading(t - 0.1), { f: 1.9, z: 0.6 }),
      // (the push is limited, so a hard stop from a run rocks her back but does not sit her down)
      lean: spring((t) => clamp(0.055 * fwdSpeed(t) + 0.028 * (fwdSpeed(t + h) - fwdSpeed(t - h)) / (2 * h), -0.11, 0.2), { f: 1.5, z: 0.42 }),
      speed: (t) => Math.hypot(...vel(t)),   // (how fast, whichever way: the heading can change in a step, the speed may not)
    };
    // idle life: as much as the body is standing still on both feet, through a spring (it went in 0.16 s as a foot
    // lifted, and the drifting hips swung back to the middle in 4 frames as a turn or a walk set off; and the smaller
    // of the two feet's weights turned a corner as one foot's weight went and the other's came: a lurch in a frame)
    S.idle = spring((t) => { const fL = footAt('L', t), fR = footAt('R', t); return P.idle * fL.support * fR.support * clamp(1 - Math.abs(S.speed(t)) / 0.3) * (1 - runAmt(t)) * (1 - jumpAt(t).air); }, { f: 1.5, z: 1 });
    if (looks.length) {
      // where it means to look: the looks that are on, mixed by how far each is faded in; when none is, straight ahead
      const ahead = (t) => { const p = poseAt(t, false).pose.pelvis.pos, f = fwdOf(heading(t)); return [p[0] + f[0] * 3, p[1] + 0.6 * P.size, p[2] + f[1] * 3]; };
      // (mixed as angles from the eyes off the way it means to face, so that sliding from one look to another never
      // passes through the head. A target more than 80 degrees round is let go of, all of it by straight behind, so
      // the head does not hold on over one shoulder and flick to the other as the body turns.) → [yaw in the room
      // (unwound: it goes on counting past a whole turn, as the heading does), pitch up]
      const want = (t) => {
        const eye = headAt(t), h = heading(t);
        const angles = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]; return [wrap(Math.atan2(d[0], d[2]) - h), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; };
        const A = angles(ahead(t));
        let yaw = A[0], pitch = A[1];
        for (const L of looks) {
          const u = win(t, L.t0, L.t1, L.ease); if (u <= 0) continue;
          const [r, p] = angles(pointOf(L.target, t)), k = smooth((Math.PI - Math.abs(r)) / (Math.PI - 1.4));
          yaw = lerp(yaw, r * k, u); pitch = lerp(pitch, lerp(A[1], p, k), u);
        }
        return [h + yaw, pitch];
      };
      const toPoint = (t, [yaw, pitch]) => { const e = headAt(t), c = Math.cos(pitch); return [e[0] + 2.5 * c * Math.sin(yaw), e[1] + 2.5 * Math.sin(pitch), e[2] + 2.5 * c * Math.cos(yaw)]; };
      S.lookW = (t) => { let w = 0; for (const L of looks) w = lerp(w, 1, win(t, L.t0, L.t1, L.ease)); return w; };
      // (made at the first look, not before: what it looks at may not be in the world yet)
      let hp = null, ep = null;
      // (the head's is sprung as angles, and never turns faster than HEAD_TURN: a spring on a point in the room cuts
      // across a big turn close to the head, which turns it all the faster)
      S.headPt = (t) => toPoint(t, (hp ??= springVec(want, { f: 1.7, z: 0.85, dt: 1 / 120, vmax: HEAD_TURN }))(t));
      S.eyePt = (t) => toPoint(t, (ep ??= springVec(want, { f: 9, z: 0.9, dt: 1 / 120 }))(t));
      // (and the chest, a little of the way and late: the eyes lead, the head follows, the chest comes after)
      let cp = null;
      S.chestPt = (t) => toPoint(t, (cp ??= springVec(want, { f: 0.9, z: 0.9, dt: 1 / 120, vmax: HEAD_TURN * 0.6 }))(t));
    }
    return S;
  }

  // Where the weight is, sideways: between the feet, nearer the one that carries more (from the middle of the
  // feet, along the way they face). Each foot keeps a little weight even when it carries none, so that in the instant
  // when both are light the answer does not flip from one foot to the other; and the shift is never more than a stance
  // width, however far apart the feet are along the way it is going. (Running, more: both feet are light for long, and
  // as a run pulls up sideways onto the braking foot the weight swung across 8 cm in 30 ms.)
  const weightAt = (t) => {
    const fL = footAt('L', t), fR = footAt('R', t), left = leftOf(lerpAngle(fL.yaw, fR.yaw, 0.5)), w0 = 0.1 + 0.3 * runAmt(t);
    const wL = fL.support + w0, wR = fR.support + w0;
    return clamp(((fL.pos[0] - fR.pos[0]) * left[0] + (fL.pos[1] - fR.pos[1]) * left[1]) * (wL - wR) / (2 * (wL + wR)), -1.2 * P.width, 1.2 * P.width);
  };
  const stridePhase = (t) => {
    const a = footAt('L', t), b = footAt('R', t), f = fwdOf(lerpAngle(a.yaw, b.yaw, 0.5));
    return clamp(((a.pos[0] - b.pos[0]) * f[0] + (a.pos[1] - b.pos[1]) * f[1]) / P.stepLen, -1.2, 1.2);
  };

  // Blinks: one in each slot of 2.7 s at a seeded moment (sometimes twice), and at the start of a big turn or a
  // new look. A lid shuts quickly and opens more slowly.
  const lid = (u) => (u < 0 || u > 0.2 ? 0 : u < 0.06 ? smooth(u / 0.06) : 1 - smooth((u - 0.06) / 0.14));
  function blinkAt(t) {
    const sl = 2.7, k = Math.floor(t / sl);
    let b = 0;
    for (const j of [k - 1, k]) {
      const tb = j * sl + 0.3 + rnd(j, P.seed) * 2.1;
      b = Math.max(b, lid(t - tb), rnd(j, P.seed + 5) < 0.2 ? lid(t - tb - 0.3) : 0);
    }
    for (const tb of blinks) b = Math.max(b, lid(t - tb));
    return b;
  }
  // Eye darts: the eyes jump to a nearby spot now and then (in 50 ms) and rest there.
  const dartTo = (j) => [(rnd(j, P.seed + 11) - 0.5) * 0.3, (rnd(j, P.seed + 13) - 0.5) * 0.14];
  function dartAt(t) {
    const sl = 1.4, k = Math.floor(t / sl), at = (j) => j * sl + rnd(j, P.seed + 17) * sl;
    const j = t >= at(k) ? k : k - 1, u = smooth((t - at(j)) / 0.05), a = dartTo(j - 1), b = dartTo(j);
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
  }

  // 0 walking or standing, 1 running (eased in and out at the ends of a run)
  const runAmt = (t) => { let a = 0; for (const [a0, a1] of runs) a = Math.max(a, smooth((t - a0 + 0.1) / 0.25) * (1 - smooth((t - a1) / 0.3))); return a; };
  // the up-and-down of a run: lowest in the middle of each foot's time on the floor
  const runBounce = (t) => {
    let last = -1e9, next = 1e9;
    for (const tl of landings) { if (tl <= t) last = tl; else { next = tl; break; } }
    const span = next - last;
    if (span > 1) return 0;
    return -Math.cos(2 * Math.PI * (t - last) / span - 0.9);
  };

  function poseAt(t, withLayers = true, noLook = false) {
    const sp = springs();
    const fL = footAt('L', t), fR = footAt('R', t);
    const feetYaw = lerpAngle(fL.yaw, fR.yaw, 0.5);
    const left = leftOf(feetYaw), fwd = fwdOf(feetYaw);
    const J = jumpAt(t), run = runAmt(t);
    const phi = stridePhase(t), phiLate = stridePhase(t - 0.07), phiLater = stridePhase(t - 0.14);
    const lean = sp.lean(t);
    const breath = Math.sin(2 * Math.PI * t / 3.3 + 0.6 + P.seed);
    const cKnee = sp.crouch(t);                 // the scripted crouch (hands go to the knees)
    const c = cKnee + J.c;                      // plus the sink before and after a jump
    const cs = smooth(clamp(cKnee));
    const sit = sp.sit(t), seat = seats.findLast((s) => s.t0 <= t) ?? seats[0], ss = smooth(clamp(sit));
    const idle = sp.idle(t);
    const sway = idle * (0.42 * P.width * wobble(t, 1, P.seed, 0.12) + 0.1 * P.width * wobble(t, 2, P.seed, 0.45));   // the weight drifts from foot to foot (round 3: larger, so a listener at full shot is not a statue)
    const lat = sp.lat(t) + sway / 0.55;

    let B = bodyAt(t);
    const pose = defaultPose();
    let px = B[0] + left[0] * lat * 0.55 - fwd[0] * 0.05 * c * P.size, pz = B[1] + left[1] * lat * 0.55 - fwd[1] * 0.05 * c * P.size;
    // a walk rises as a leg passes under the body and sinks as the feet spread
    const walking = clamp(Math.abs(sp.speed(t)) / (0.6 * P.size)) * (1 - run);
    let py = rig.info.standHeight * (0.994 - 0.03 * run) - c * P.crouchDepth + J.y + 0.02 * P.size * run * runBounce(t) + 0.0045 * P.size * breath + 0.013 * P.size * walking * (1 - 2 * Math.min(1, phi * phi));
    let sitPitch = 0;
    if (seat && sit > 1e-4) {
      // onto the seat: the hips go back to it and down, the body tips forward on the way and sits up at the end
      const hips = [seat.seat[0], seat.seat[1] + 0.13 * P.size, seat.seat[2]];
      px = lerp(px, hips[0], smooth(clamp(sit * 1.25))); pz = lerp(pz, hips[2], smooth(clamp(sit * 1.25)));
      py = lerp(py, hips[1], ss);
      sitPitch = 0.8 * sp.bow(t) - 0.08 * ss;   // (bent at the hips more than the back: the weight goes back over the seat)
      // sitting still: it breathes and its weight drifts on the seat
      const drift = 0.2 * P.width * wobble(t, 13, P.seed, 0.1) * ss;
      px += left[0] * drift; pz += left[1] * drift; py += 0.004 * P.size * breath * ss;
    }
    pose.pelvis = {
      pos: [px, py, pz],
      yaw: sp.hips(t) - phi * 0.11 + 0.04 * idle * wobble(t, 3, P.seed, 0.1), pitch: 0.02 + lean + c * 0.16 + 0.1 * run + sitPitch * 0.75,
      roll: -0.07 * (fL.arc - fR.arc) + lat * 0.25 / P.size + 0.6 * sway / P.size,
    };
    const chestYaw = sp.chest(t) + phiLate * (0.1 + 0.12 * run) + 0.07 * idle * wobble(t, 4, P.seed, 0.15), headYaw = sp.head(t) + 0.1 * idle * wobble(t, 5, P.seed, 0.2);
    pose.spine = { yaw: soft(wrap(chestYaw - pose.pelvis.yaw), 0.9), pitch: 0.03 + lean * 0.8 + c * 0.3 + 0.12 * run - 0.012 * breath + sitPitch * 0.4, roll: 0.05 * (fL.arc - fR.arc) - lat * 0.3 / P.size - 0.9 * sway / P.size };
    pose.head = { yaw: soft(wrap(headYaw - chestYaw), 1.1), pitch: -0.02 - lean * 1.1 - c * 0.34 - 0.2 * run - sitPitch * 0.8 + 0.07 * idle * wobble(t, 6, P.seed, 0.17), roll: 0.05 * idle * wobble(t, 7, P.seed, 0.13) };
    const swingVar = 1 + 0.12 * wobble(t, 8, P.seed, 0.3);            // no two strides swing quite alike
    for (const [s, f] of [['L', fL], ['R', fR]]) {
      const lift = J.y + (J.air ? 0.04 * P.size * Math.sin(Math.PI * clamp(J.y / J.height) / 2) : 0);
      pose['foot' + s] = { pos: f.pos, yaw: f.yaw, pitch: f.pitch + cs * 0.55 + J.toes, toe: f.toe - cs * 0.55 - J.toes * 0.6,
        ankle: f.ankle && cKnee < 0.01 ? [f.ankle[0], f.ankle[1] + lift, f.ankle[2]] : undefined, lift, splay: 0.12 + cs * 0.42 + 0.3 * ss };
      const sg = s === 'L' ? -1 : 1;
      // arms swing with the stride, and less as the body slows (so a step on the spot does not fling them);
      // in a jump they go back on the sink and up through the flight
      const sw = sg * phiLate * P.armSwing * swingVar * (1 + 0.5 * run) * clamp(0.3 + 0.7 * Math.abs(sp.speed(t)) / (0.8 * P.size));
      const fling = J.fling * (J.up * 1.6 - 0.5 * clamp(J.c / 0.3) * (1 - J.up));
      pose['arm' + s] = {
        swing: sw + 0.05 + lean * 0.6 + fling + 0.03 * idle * wobble(t, 9 + (s === 'L' ? 0 : 1), P.seed, 0.2), spread: P.armSpread + 0.04 * Math.abs(sw) + 0.25 * J.up * J.fling, twist: 0.75,
        elbow: 0.38 + 0.3 * Math.max(0, sg * phiLater) + 0.08 * Math.abs(sw) + 1.0 * run + 0.3 * J.up, wrist: [0.12, 0, 0],
        curl: 0.5 + 0.1 * idle * wobble(t, 11 + (s === 'L' ? 0 : 1), P.seed, 0.15), thumb: 0.3, fan: 0.2, shrug: 0.008 * P.size * breath,
      };
    }
    // the eyes: a dart now and then, and ahead into a turn before the head gets there
    const dart = dartAt(t), into = clamp(wrap(heading(t + 0.25) - headYaw) * 1.4, -0.9, 0.9);
    pose.face = { gaze: [dart[0] + into, dart[1]], blink: blinkAt(t), squint: 0, wide: 0, browUp: 0, browTilt: 0, mouth: {}, expr: {} };
    pose.chestScale = 1 + 0.013 * (breath * 0.5 + 0.5);
    pose.squash = J.sq;
    const ctx = { c, cs, sit, ss, phi, lean, breath, idle, fL, fR, feetYaw, chestYaw, headYaw, run, jump: J, performer: api, noLook };
    if (withLayers) for (const fn of layers) fn(pose, t, ctx);
    return { pose, ctx };
  }

  // The looks (see lookAt): the head turns toward the slow point, the eyes toward the quick one.
  function lookLayer(pose, t, ctx) {
    if (ctx.noLook) return;
    const sp = springs(), w = sp.lookW(t);
    if (w <= 0) return;
    const hp = sp.headPt(t), e = sp.eyePt(t), cp = sp.chestPt(t);
    // the chest turns toward its own, later point (a fifth of the way); the head then turns the rest of the way to its
    const rc = wrap(Math.atan2(cp[0] - pose.pelvis.pos[0], cp[2] - pose.pelvis.pos[2]) - pose.pelvis.yaw - pose.spine.yaw);
    pose.spine.yaw += soft(rc, 1.25) * 0.22 * w * smooth((Math.PI - Math.abs(rc)) / (Math.PI - 1.4));
    lookAtPose(pose, ctx, hp, w, undefined, true);
    // (a look holds the head on its point, which took away the head's idle drift: a listener stood like a statue; it
    // drifts a little about the point instead)
    pose.head.yaw += w * ctx.idle * 0.08 * wobble(t, 15, P.seed, 0.23); pose.head.pitch += w * ctx.idle * 0.06 * wobble(t, 16, P.seed, 0.19); pose.head.roll += w * ctx.idle * 0.04 * wobble(t, 17, P.seed, 0.15);
    const yawW = Math.atan2(e[0] - pose.pelvis.pos[0], e[2] - pose.pelvis.pos[2]), headW = pose.pelvis.yaw + pose.spine.yaw + pose.head.yaw;
    const eyeY = pose.pelvis.pos[1] + (rig.character.rest.head.y + 0.12 * P.size - rig.info.standHeight);
    const pitchE = Math.atan2(e[1] - eyeY, Math.hypot(e[0] - pose.pelvis.pos[0], e[2] - pose.pelvis.pos[2])) + pose.pelvis.pitch + pose.spine.pitch + pose.head.pitch;
    const g = pose.face.gaze, behind = smooth((2.6 - Math.abs(wrap(yawW - headW))) / 0.6);
    pose.face.gaze = [lerp(g[0] * 0.5, clamp(wrap(yawW - headW) / 0.6, -1, 1) + g[0] * 0.3, w * behind), lerp(g[1] * 0.5, clamp(pitchE / 0.5, -1, 1) + g[1] * 0.3, w * behind)];
  }

  // Turn the head (and a little of the chest) to look at a point in the room, at once.
  // w: 0 leaves the pose alone, 1 looks straight at it. A point behind is let go of smoothly: fully held up to
  // 80 degrees off the chest, let go of by straight behind. (The letting go is spread over that whole range so
  // that, as the body turns toward someone behind it, the head never turns more than about twice as fast as the
  // chest; over a range of 0.5 rad it turned four times as fast and whipped.)
  function lookAtPose(pose, ctx, target, w = 1, eyeHeight = rig.character.rest.head.y + 0.12 * P.size, chestDone = false) {
    const dx = target[0] - pose.pelvis.pos[0], dz = target[2] - pose.pelvis.pos[2];
    const eyeY = pose.pelvis.pos[1] + (eyeHeight - rig.info.standHeight);
    const yawW = Math.atan2(dx, dz), pitchW = -Math.atan2(target[1] - eyeY, Math.hypot(dx, dz));
    const chestW = pose.pelvis.yaw + pose.spine.yaw;
    const r0 = wrap(yawW - chestW), rel = soft(r0, 1.25);
    w *= smooth((Math.PI - Math.abs(r0)) / (Math.PI - 1.4));
    if (!chestDone) pose.spine.yaw += rel * 0.18 * w;
    pose.head.yaw = lerp(pose.head.yaw, rel * (chestDone ? 1 : 0.82), w);
    pose.head.pitch = lerp(pose.head.pitch, pitchW - pose.pelvis.pitch - pose.spine.pitch > 0 ? soft(pitchW - pose.pelvis.pitch - pose.spine.pitch, 0.7) : soft(pitchW - pose.pelvis.pitch - pose.spine.pitch, 0.6), w);
  }

  // Loose parts. Each is a weight on a spring whose anchor is the part's rest place, carried by the bone it
  // hangs from (pelvis, spine, chest, neck or head). How far the weight is from its anchor, seen in that
  // bone's own axes, shifts, swings and stretches the part. All of it is read off the plan, so any frame can
  // be asked for on its own.
  const loose = rig.character.loose, tmpQ = new THREE.Quaternion();
  for (const l of loose) if (!['pelvis', 'spine', 'chest', 'neck', 'head'].includes(rig.character.desc.joints[l.bone].parent)) throw new Error(`performer: the loose part "${l.bone}" must hang from pelvis, spine, chest, neck or head`);
  const anchors = (fr) => loose.map((l) => { const p = rig.character.desc.joints[l.bone].parent; return rig.character.rest[l.bone].clone().sub(rig.character.rest[p]).applyQuaternion(fr.q[p]).add(fr.pos[p]).toArray(); });
  let follow = null;
  function looseAt(t, pose, ctx) {
    if (!loose.length) return undefined;
    follow ??= followers(loose, (tt) => anchors(rig.frames(poseAt(tt).pose)));
    const fr = rig.frames(pose), A = anchors(fr), X = follow(t), out = {};
    loose.forEach((l, j) => {
      const d = tmp.set(X[j][0] - A[j][0], X[j][1] - A[j][1], X[j][2] - A[j][2]).applyQuaternion(tmpQ.copy(fr.q[rig.character.desc.joints[l.bone].parent]).invert());
      const reach = l.reach ?? 0.03, sh = l.shift ?? 0, sw = l.swing ?? 0, b = (l.breath ?? 0) * ctx.breath;
      out[l.bone] = {
        shift: [clamp(d.x * sh, -reach, reach), clamp(d.y * sh, -reach, reach) + 0.7 * b, clamp(d.z * sh, -reach, reach) + b],
        swing: [clamp(d.z * sw, -0.4, 0.4), clamp(-d.x * sw, -0.4, 0.4)],
        stretch: 1 + clamp(d.y * (l.stretch ?? 0), -0.15, 0.15),
      };
    });
    return out;
  }

  // Pose the character at time t. Hands that rest on the knees or thighs or reach for a point in
  // the room need the body first, so the body is solved once, then again with the
  // hands aimed. A layer asks for a hand with
  //   pose.hand = { L: { to: [x, y, z], w: 0..1, elbowDir: [x, y, z], wrist, curl, thumb, fan }, R: ... }
  // or pose.after = (pose, out, ctx) => { ...set pose.hand from the solved body... }.
  const tmp = new THREE.Vector3();
  function apply(t) {
    const { pose, ctx } = poseAt(t);
    pose.loose = looseAt(t, pose, ctx);
    const b = rig.character.bones;
    b.chest.scale.setScalar(pose.chestScale ?? 1);
    const q = pose.squash ?? 1, iq = 1 / Math.sqrt(q);
    b.spine.scale.set(iq, q, iq);
    let out = rig.solve(pose);
    if (pose.after) pose.after(pose, out, ctx);
    if (afters.length) { pose.hand ??= {}; for (const fn of afters) fn(pose, out, ctx, t); }
    const restW = Math.max(ctx.cs, ctx.ss);
    if (restW > 0.001 || (pose.hand && Object.keys(pose.hand).length)) {
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1, arm = pose['arm' + s], want = pose.hand?.[s];
        if (arm.reach) continue;
        const kneeW = restW > 0.001 ? restW : 0, w = want ? clamp(want.w ?? 1) : 0;
        if (kneeW <= 0 && w <= 0) continue;
        const hand = b['hand' + s].getWorldPosition(tmp).clone();
        const elbowFK = b['foreArm' + s].getWorldPosition(new THREE.Vector3()).sub(out.joints['shoulder' + s]).normalize();
        const fw = fwdOf(pose.pelvis.yaw), lf = leftOf(pose.pelvis.yaw);
        let reach = hand.clone(), elbow = elbowFK.clone(), wrist = arm.wrist, curl = arm.curl;
        if (kneeW > 0) {
          // crouching: hands on the knees; sitting: on the thighs
          const knee = out.joints['knee' + s], onThigh = ctx.ss / Math.max(ctx.ss + ctx.cs, 1e-6);
          const target = knee.clone().lerp(out.joints['hip' + s], 0.4 * onThigh).add(new THREE.Vector3(fw[0] * 0.02 - lf[0] * sx * (0.03 - 0.1 * onThigh), 0.12 - 0.05 * onThigh, fw[1] * 0.02 - lf[1] * sx * (0.03 - 0.1 * onThigh)).multiplyScalar(P.size));
          reach.lerp(target, kneeW);
          const sh = out.joints['shoulder' + s], d = reach.clone().sub(sh), len = 0.97 * rig.info.armLength;   // (a knee too far below is reached for, not grabbed)
          if (d.length() > len) reach.copy(sh).add(d.setLength(len));
          elbow.lerp(new THREE.Vector3(lf[0] * sx * 0.9 - fw[0] * 0.5, 0.25, lf[1] * sx * 0.9 - fw[1] * 0.5), kneeW);
          wrist = [lerp(0.1, 0.55, kneeW), 0, 0]; curl = lerp(0.55, 0.7, kneeW);
        }
        if (w > 0) {
          reach.lerp(new THREE.Vector3(...want.to), w);
          if (want.elbowDir) elbow.lerp(new THREE.Vector3(...want.elbowDir).normalize(), w);
          if (want.wrist) wrist = wrist.map((v, i) => lerp(v, want.wrist[i], w));
          if (want.curl !== undefined) curl = Array.isArray(want.curl) ? want.curl.map((v) => lerp(curl, v, w)) : lerp(curl, want.curl, w);
          if (want.thumb !== undefined) arm.thumb = lerp(arm.thumb, want.thumb, w);
          if (want.fan !== undefined) arm.fan = lerp(arm.fan, want.fan, w);
        }
        arm.reach = reach.toArray(); arm.elbowDir = elbow.toArray(); arm.wrist = wrist; arm.curl = curl;
      }
      out = rig.solve(pose);
    }
    return { pose, out, ctx };
  }

  // For the world: where this actor stands, and where its eyes are, at any time (read off the plan, no layers).
  const where = (t) => { const p = poseAt(t, false).pose.pelvis.pos; return [p[0], 0, p[2]]; };
  const headAt = (t) => { const fr = rig.frames(poseAt(t, false).pose), h = fr.pos.head; return [h.x, h.y + 0.1 * P.size, h.z]; };

  const api = {
    walk, run, jump, turn, crouch, layer,
    walkTo, runTo, turnTo, crouchTo, sit, stand, wait,
    lookAt, express, tired, sigh, laugh, wave, point, clap, reach, holdBall, carry: (o) => holdBall({ ...o, release: undefined }),
    get time() { return clock; },
    radius: rig.info.shoulder[0] + 0.18 * P.size,   // (how far its body and swinging arms reach out from its middle, for others going round it)
    poseAt, apply, footAt, bodyAt, heading, where, headAt, tracks, cur, rig, opts: P,
  };
  // runArms { twist, spread }: laid on the arms in a run (a child's short arms round a round belly: turned in less and
  // held out more, or the hands go into it)
  if (P.runArms) layer((pose, t, ctx) => { for (const s of ['L', 'R']) { pose['arm' + s].twist += P.runArms.twist * ctx.run; pose['arm' + s].spread += P.runArms.spread * ctx.run; } });
  if (world && P.name) world.add(P.name, api);
  // (a thing hanging from a hand: the description's `hang` block, hang.mjs)
  return P.hang === false ? api : hangOn(api);
}
