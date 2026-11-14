// A four-legged animal: the rig (pose controls -> bone rotations) and a small
// performer that turns a script ("sit here, hop down to there, trot over there, sit")
// into a pose for any instant.
//
// The idea is the same as for people. Paws are put down at marks and stay exactly
// there until they step; the body rides on the paws (the chest over the front pair,
// the hips over the hind pair); the back is a two-bone chain that arches when chest
// and hips come together; the head looks at a point in the room; tail and ears follow
// on springs.
import * as THREE from 'three/webgpu';
import { applyWorld } from './character.mjs';
import { curve, spring, springVec, smooth, lerp, clamp, rnd, wobble, soft, detour } from './motion.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const Y = V(0, 1, 0), Z = V(0, 0, 1);
const euler = new THREE.Euler();
const ypr = (yaw = 0, pitch = 0, roll = 0) => Q().setFromEuler(euler.set(pitch, yaw, roll, 'YXZ'));
function basis(d, f) {
  const y = d.clone().normalize();
  const z = f.clone().addScaledVector(y, -f.dot(y));
  if (z.lengthSq() < 1e-10) z.copy(Math.abs(y.y) < 0.9 ? Y : Z).addScaledVector(y, -(Math.abs(y.y) < 0.9 ? y.y : y.z));
  z.normalize();
  return new THREE.Matrix4().makeBasis(y.clone().cross(z), y, z);
}
const aim = (restInv, d, f) => Q().setFromRotationMatrix(basis(d, f).multiply(restInv));
const SIDES = [['L', 1], ['R', -1]], PASSES = 5;
const softmin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export function createQuadruped(ch) {
  const { bones, rest } = ch;
  const tailN = Object.keys(bones).filter((n) => /^tail\d+$/.test(n)).length;
  const R = {
    a: rest.spine.distanceTo(rest.hips), b: rest.chest.distanceTo(rest.spine),
    hipsInv: basis(rest.spine.clone().sub(rest.hips), Y).invert(),
    spineInv: basis(rest.chest.clone().sub(rest.spine), Y).invert(),
  };
  const back = V(0, 0, -1);
  for (const [s, sx] of SIDES) {
    const sh = rest['fUpper' + s], el = rest['fLower' + s], wr = rest['fPaw' + s];
    const hp = rest['hThigh' + s], kn = rest['hShin' + s], hk = rest['hFoot' + s];
    const toe = V(sx * ch.desc.rig.hindToe[0], ch.desc.rig.hindToe[1], ch.desc.rig.hindToe[2]);
    R[s] = {
      sx,
      shOff: sh.clone().sub(rest.chest), f1: el.distanceTo(sh), f2: wr.distanceTo(el),
      fUpperInv: basis(el.clone().sub(sh), back).invert(), fLowerInv: basis(wr.clone().sub(el), back).invert(),
      hpOff: hp.clone().sub(rest.hips), h1: kn.distanceTo(hp), h2: hk.distanceTo(kn),
      hThighInv: basis(kn.clone().sub(hp), Z).invert(), hShinInv: basis(hk.clone().sub(kn), Z).invert(),
      footInv: basis(toe.clone().sub(hk), Z).invert(),
    };
    R.hockUp = hk.y - toe.y; R.hockBack = toe.z - hk.z;
  }
  const info = {
    tailN,
    wristH: rest.fPawL.y, bodyLen: R.a + R.b, shoulderH: rest.fUpperL.y, hipH: rest.hThighL.y,
    front: [rest.fPawL.x, rest.fPawL.z], hind: [ch.desc.rig.hindToe[0], ch.desc.rig.hindToe[2]], toeH: ch.desc.rig.hindToe[1],   // where the paws stand, from the body's middle
    chest: rest.chest.clone(), hips: rest.hips.clone(),
  };

  // Two-bone reach from a to target: returns the middle joint, bent toward pole.
  function reach(a, target, l1, l2, pole, leg) {
    const to = target.clone().sub(a);
    if (leg) out.miss[leg] = Math.max(0, to.length() - l1 - l2);     // how far past its full length the leg was asked to reach
    const dist = Math.min(Math.max(to.length(), Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999);
    const n = to.normalize();
    const pp = pole.clone().addScaledVector(n, -pole.dot(n)).normalize();
    const c = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), sn = Math.sqrt(Math.max(1 - c * c, 0));
    return { mid: a.clone().addScaledVector(n, l1 * c).addScaledVector(pp, l1 * sn), end: a.clone().addScaledVector(n, dist), pp };
  }

  const out = { joints: {}, miss: {} };   // the last solve (miss: how far each leg fell short of its paw)
  // pose: { hips:[x,y,z], chest:[x,y,z], roll, chestPitch, chestYaw, head:{yaw,pitch,roll},
  //         paws:{ FL:{pos:[x,y,z], pitch}, FR, HL:{pos, heel}, HR }, tail:[{yaw,pitch} per tail bone], ears:{L:{pitch,roll},R}, face:{gaze, blink, ...} }
  function solve(pose) {
    const H = V(...pose.hips), C = V(...pose.chest);
    // the back can bend but not stretch: if the chest is too far ahead, the hips are pulled after it
    const maxLen = (R.a + R.b) * 0.995;
    if (C.distanceTo(H) > maxLen) { const back = H.clone().sub(C).normalize(); H.copy(C).addScaledVector(back, maxLen); }
    const along = C.clone().sub(H);
    const yaw = Math.atan2(along.x, along.z);
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), left = V(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = Y.clone().applyAxisAngle(fwd, pose.roll ?? 0);
    const qChest = ypr(yaw + (pose.chestYaw ?? 0), pose.chestPitch ?? 0, pose.roll ?? 0);
    // A planted paw must stay on its mark, and a leg cannot be longer than it is: so the
    // body comes down as far as it has to for every paw to be reached (the chest for the
    // front pair, the hips for the hind pair). This is what makes it sink into a long step.
    const hockOf = (hpw) => {
      const heel = hpw.heel ?? 0;
      return V(...hpw.pos).add(V(0, info.toeH + lerp(R.hockUp, 0.006, heel), 0)).addScaledVector(fwd, -lerp(R.hockBack, Math.hypot(R.hockUp, R.hockBack), heel));
    };
    const fit = (joint, target, len) => target.y + Math.sqrt(Math.max(len * len - (joint.x - target.x) ** 2 - (joint.z - target.z) ** 2, 1e-5)) - joint.y;   // how far up this joint could still go
    // (if sinking is not enough, the body is drawn toward the paw: a cat landing on its front
    // paws is pulled over them. Only paws that are down count, by how much they are down: `down` is
    // true/false or a weight from 0 (high in the air: it goes where it likes) to 1, so that a paw coming
    // down takes hold of the body over a few frames, not in one.)
    const downOf = (p) => (p.down === undefined || p.down === true ? 1 : +p.down);
    const hold = (body, off, q, target, len, w) => {
      if (w <= 0) return;
      w = 1 - Math.pow(1 - w, 1 / PASSES);     // (so that over all the passes it holds by w)
      const j = off.clone().applyQuaternion(q).add(body);
      body.y += w * softmin(0, Math.max(fit(j, target, len), -0.04), 0.006);     // (it sinks 4 cm at most; past that it is drawn over)
      j.copy(off).applyQuaternion(q).add(body);
      const d = j.distanceTo(target);
      if (d > len) body.addScaledVector(target.clone().sub(j), w * (d - len) / d);
    };
    let sp, hipsQ;
    for (let pass = 0; pass < PASSES; pass++) {
      for (const [s] of SIDES) {
        const fp = pose.paws['F' + s];
        hold(C, R[s].shOff, qChest, V(...fp.pos).add(V(0, info.wristH, 0)), (R[s].f1 + R[s].f2) * 0.97, downOf(fp));
      }
      sp = reach(H, C, R.a, R.b, up);
      hipsQ = aim(R.hipsInv, sp.mid.clone().sub(H), up);
      for (const [s] of SIDES) {
        const hpw = pose.paws['H' + s];
        hold(H, R[s].hpOff, hipsQ, hockOf(hpw), (R[s].h1 + R[s].h2) * 0.97, downOf(hpw));
      }
      // the back cannot stretch either: the end whose paws are in the air gives way
      // (hips follow a chest that has landed); if both ends stand, they share it
      const gap = C.distanceTo(H) - maxLen;
      if (gap > 0) {
        const fDown = Math.max(downOf(pose.paws.FL), downOf(pose.paws.FR)), hDown = Math.max(downOf(pose.paws.HL), downOf(pose.paws.HR));
        const wH = (fDown + 1e-3) / (fDown + hDown + 2e-3), dir = C.clone().sub(H).normalize();
        C.addScaledVector(dir, -gap * (1 - wH)); H.addScaledVector(dir, gap * wH);
      }
    }
    sp = reach(H, C, R.a, R.b, up);
    const world = {};
    world.hips = aim(R.hipsInv, sp.mid.clone().sub(H), up);
    world.spine = aim(R.spineInv, C.clone().sub(sp.mid), up);
    world.chest = qChest;
    const hd = pose.head ?? {};
    const qHead = qChest.clone().multiply(ypr(hd.yaw ?? 0, hd.pitch ?? 0, hd.roll ?? 0));
    world.neck = qChest.clone().slerp(qHead, 0.45);
    world.head = qHead;
    bones.hips.position.copy(H);

    for (const [s, sx] of SIDES) {
      const r = R[s];
      // front leg: shoulder -> elbow -> wrist, elbow pointing back
      const fp = pose.paws['F' + s];
      const shW = r.shOff.clone().applyQuaternion(qChest).add(C);
      const wrist = V(...fp.pos).add(V(0, info.wristH, 0));
      const fl = reach(shW, wrist, r.f1, r.f2, fwd.clone().multiplyScalar(-1).addScaledVector(left, sx * 0.15).addScaledVector(Y, 0.3), 'F' + s);
      world['fUpper' + s] = aim(r.fUpperInv, fl.mid.clone().sub(shW), fl.pp);
      world['fLower' + s] = aim(r.fLowerInv, fl.end.clone().sub(fl.mid), fl.pp);
      world['fPaw' + s] = ypr(yaw + (fp.yaw ?? 0), fp.pitch ?? 0, 0);
      // hind leg: hip -> knee -> hock, knee pointing forward; the foot runs from the hock to the toes on the floor.
      // heel 0: up on the toes (standing, walking); 1: the whole foot flat on the floor (sitting)
      const hpw = pose.paws['H' + s], heel = hpw.heel ?? 0;
      const hipW = r.hpOff.clone().applyQuaternion(world.hips).add(H);
      const toe = V(...hpw.pos).add(V(0, info.toeH, 0));
      const hock = toe.clone().add(V(0, lerp(R.hockUp, 0.006, heel), 0)).addScaledVector(fwd, -lerp(R.hockBack, Math.hypot(R.hockUp, R.hockBack), heel));
      const hl = reach(hipW, hock, r.h1, r.h2, fwd.clone().addScaledVector(Y, 0.4).addScaledVector(left, sx * (0.1 + 0.5 * heel)), 'H' + s);
      world['hThigh' + s] = aim(r.hThighInv, hl.mid.clone().sub(hipW), hl.pp);
      world['hShin' + s] = aim(r.hShinInv, hl.end.clone().sub(hl.mid), hl.pp);
      world['hFoot' + s] = aim(r.footInv, toe.clone().sub(hl.end), fwd);
      // ears
      const e = pose.ears?.[s] ?? {};
      world['ear' + s] = qHead.clone().multiply(Q().setFromEuler(euler.set(e.pitch ?? 0, 0, sx * (e.roll ?? 0), 'YXZ')));
      out.joints['shoulder' + s] = shW; out.joints['hip' + s] = hipW;
    }
    for (const n of ['FL', 'FR', 'HL', 'HR']) if (downOf(pose.paws[n]) < 0.5) out.miss[n] = 0;   // (a paw in the air goes where its leg takes it)
    // tail: each bone turns a little from the one before
    let q = world.hips;
    for (let i = 1; i <= tailN; i++) {
      const tp = pose.tail?.[i - 1] ?? {};
      q = q.clone().multiply(ypr(tp.yaw ?? 0, tp.pitch ?? 0, 0));
      world['tail' + i] = q;
    }
    applyWorld(ch, world);
    ch.face.set(pose.face);
    ch.group.updateMatrixWorld(true);
    out.hips = H; out.chest = C; out.yaw = yaw; out.chestQ = qChest; out.headQ = qHead;
    return out;
  }
  return { solve, info, character: ch, out };
}

// ---------------------------------------------------------------------------------
// A critter: the same two layers as a performer (performer.mjs). Verbs lay the plan out as paw steps with
// times (each starts where the last ended, `time`, unless given `t0`, and returns its end time); the pose at
// any instant is read off them. Paws that are down stay exactly where they were put; the body rides on them
// through a spring; tail and ears trail on theirs; it breathes, blinks, flicks its ears and glances about
// when it holds still.
const PAWS = ['FL', 'FR', 'HL', 'HR'];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the fastest a look turns the head (rad/s): well under the gate on skull, chest and hips (checks.mjs TURN_GATE). At 6
// with a quicker spring the cat's head whipped round to the camera in 2 frames as it batted the ball (round 3).
const HEAD_TURN = 3.5;
const G = 9.81;
const win = (t, t0, t1, e) => smooth((t - t0) / e) * (1 - smooth((t - (t1 - e)) / e));
// the gaits: which paws step together, in order. A walk moves one paw at a time (hind, fore on the same side,
// then the other side); a trot moves diagonal pairs; a run is a fast trot whose steps overlap, so for a moment
// all four paws are off the floor (not a gallop). Strides are
// for the cat (a shoulder 19 cm high): longer legs take longer strides (pass stride).
const GAITS = {
  walk: { groups: [['HL'], ['FL'], ['HR'], ['FR']], stride: 0.2, beat: 0.15, swing: 1.9, h: 0.03 },
  trot: { groups: [['FL', 'HR'], ['FR', 'HL']], stride: 0.24, beat: 0.12, swing: 0.92, h: 0.035 },
  run: { groups: [['FL', 'HR'], ['FR', 'HL']], stride: 0.3, beat: 0.1, swing: 1.15, h: 0.04 },
};

export function createCritter(rig, opts = {}) {
  const P = { at: [0, 0, 0], yaw: 0, seed: 3, idle: 1, ...opts };
  const I = rig.info, world = P.world;
  // the springs of the loose parts come from the character's description
  const looseOf = (bone, or) => rig.character.loose.find((l) => l.bone === bone) ?? or;
  const tailS = looseOf('tail1', { f: 2.2, z: 0.35 }), earS = looseOf('earL', { f: 5, z: 0.4, swing: 0 });
  // where the four paws stand round a point, standing (sit = 0) or sitting (sit = 1); lying, the fore paws reach out
  const stance = (at, yaw, sit = 0, lie = 0) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const put = (x, z) => [at[0] + x * c + z * s, at[1], at[2] - x * s + z * c];
    const fx = lerp(I.front[0], 0.048, sit), fz = lerp(I.front[1], 0.085, sit) + 0.07 * lie, hx = lerp(I.hind[0], 0.094, sit) + 0.02 * lie, hz = lerp(I.hind[1], 0.03, sit);
    return { FL: put(fx, fz), FR: put(-fx, fz), HL: put(hx, hz), HR: put(-hx, hz) };
  };
  const first = stance(P.at, P.yaw, P.sit ?? 0);
  const tracks = Object.fromEntries(PAWS.map((n) => [n, { init: { pos: first[n] }, steps: [] }]));
  const sitKeys = [[0, P.sit ?? 0]], lieKeys = [[0, 0]], dipKeys = [[0, 0]], leaps = [], alertKeys = [[0, 0]], openKeys = [[0, 0]], looks = [], gaitSpans = [], meows = [], yawns = [];
  const cur = { at: [...P.at], yaw: P.yaw, sit: P.sit ?? 0, lie: 0 };
  let clock = 0, S = null, nStep = 0;
  const until = (t) => { clock = Math.max(clock, t); S = null; return t; };
  const step = (name, st) => { st.h *= 0.85 + 0.3 * rnd(nStep++, P.seed); tracks[name].steps.push(st); };
  const pointOf = (target, t) => {
    if (typeof target !== 'string') return typeof target === 'function' ? target(t) : target;
    if (!world) throw new Error(`critter: to look at "${target}" it needs a world (createCritter(rig, { world, name }))`);
    return world.head(target, t);
  };

  // A leap from where it is to a mark, lower or higher (off a sofa, up onto it), from 0.2 to 2 m or more. It gathers
  // itself (the body sinks), then from t0 the body is thrown: the hind legs push it from rest to its full speed over
  // a few centimetres, it flies on a true parabola high enough to clear the higher end, and the legs take it from full
  // speed to rest on landing, so its speed never changes in a step. The front paws leave first and land first. The
  // body's path is worked out exactly (springs()), not chased by the body's spring, which would lag the paws by
  // centimetres at these speeds. air: the time in the air (by default from the distance and the height).
  function hop({ t0 = clock, to, yaw = cur.yaw, air }) {
    const from = cur.at, land = stance(to, yaw, 0), Dh = Math.hypot(to[0] - from[0], to[2] - from[2]), dy = to[1] - from[1];
    const vy = Math.sqrt(2 * G * (Math.max(dy, 0) + 0.08 + 0.12 * Dh)), T = air ?? (vy + Math.sqrt(vy * vy - 2 * G * dy)) / G;
    // The push: the hind legs straighten by about 4 cm. The landing: the body comes down by A, more for a harder
    // landing, the legs bending under it; it sinks no further than that at the end (the dip), so the paws reach the
    // floor just as the legs reach it. (A guess of the speeds is enough to time them.)
    const vx = Dh / T, vyT = (dy + G * T * T / 2) / T, vyL = G * T - vyT;
    const p = clamp(0.08 / Math.hypot(vx, vyT), 0.02, 0.1), A = clamp(0.02 + 0.015 * vyL, 0.03, 0.08), q = clamp(2 * A / Math.max(vyL, 0.1), 0.04, 0.12);
    const L = { tA: t0, tT: t0 + p, tL: t0 + p + T, tE: t0 + p + T + q, p, q, T };
    leaps.push(L);
    sitKeys.push([t0 - 0.42, sitKeys[sitKeys.length - 1][1]], [t0 - 0.1, 0.35], [t0 + p + 0.12, 0]);   // (haunches down; up once the hind paws are off)
    // (and 1.5 cm more, so the legs meet the floor bent, and a little more for the front paws, which land on their
    // marks while the body is still a little behind them)
    const tr = vx * q / 2;
    dipKeys.push([t0 - 0.45, 0], [t0 - 0.1, 0.05], [L.tE, A + 0.015 + tr * tr / 0.34], [L.tE + 0.35, 0.005], [L.tE + 0.55, 0]);
    // the paws fly with the body (the front pair with the chest, the hind with the hips), tucked up a little
    // (`drop` marks a leap's steps for whoever reads the tracks: compile.mjs counts its landing as one footfall)
    for (const n of ['FL', 'FR']) step(n, { t0, t1: L.tL, pos: land[n], h: 0.03, leap: L, part: 0, drop: true });
    for (const n of ['HL', 'HR']) step(n, { t0: L.tT, t1: L.tL + Math.min(0.04, 0.6 * q), pos: land[n], h: 0.03, leap: L, part: 3, drop: true });
    cur.at = [...to]; cur.yaw = yaw; cur.sit = 0;
    return until(L.tE + 0.45);
  }
  // Paws stepping to a mark in a gait (see GAITS). Each group lands a little ahead of where the others stand
  // (every paw moves about one stride a step, the first few shorter, so it gets going rather than leaps off);
  // once the mark is reached the other groups close up to it with short steps.
  // A mark more than 30 degrees off the way it faces is turned to first, on the spot (turnTo). In a world, the way
  // bows round anyone who will be standing in it (motion.mjs detour).
  function gait(kind, { t0 = clock, to, stride, beat }) {
    const g = GAITS[kind]; stride ??= g.stride; beat ??= g.beat;
    const from = cur.at, dx = to[0] - from[0], dz = to[2] - from[2], D = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz), m = g.groups.length;
    if (D > 0.05 && Math.abs(wrap(yaw - cur.yaw)) > 0.5) t0 = turn({ t0, yaw });
    const ahead = [0];   // how far ahead each step lands, in parts of stride / m
    for (let k = 1; ahead[k - 1] * stride / m < D - stride / (2 * m) || k === 1; k++) ahead.push(ahead[k - 1] + Math.min(1, 0.55 + 0.15 * k) + (k === 1 ? 0.35 : 0));
    const n0 = ahead.length - 1, n = n0 + m - 1;
    const way = detour(world, P.name, 0.08, [from[0], from[2]], [to[0], to[2]], (s) => t0 + n0 * beat * s / Math.max(D, 1e-6));
    let t = t0;
    for (let k = 1; k <= n; k++) {
      const u = Math.min(1, ahead[Math.min(k, n0)] / ahead[n0]), p = D > 1e-6 ? way.at(u * D) : [to[0], to[2]];
      const st = stance([p[0], to[1], p[1]], D > 1e-6 ? way.yaw(u * D) : yaw, 0);
      for (const name of g.groups[(k - 1) % m]) step(name, { t0: t, t1: t + beat * g.swing, pos: st[name], h: g.h * (kind === 'run' ? 1 : D > 0.05 ? 1 : 0.5) });
      t += beat;
    }
    if (kind === 'run') dipKeys.push([t0, 0], [t0 + 0.15, 0.02], [t - beat, 0.02], [t + 0.1, 0]);
    gaitSpans.push([t0, t]);
    cur.at = [...to]; cur.yaw = yaw; cur.sit = 0;
    return until(t + beat * Math.max(0, g.swing - 1));
  }
  const trot = (o) => gait('trot', o);
  // Turn on the spot to the heading yaw (the short way) or by a signed amount: the paws step round the body's middle in
  // diagonal pairs, at most 0.5 rad a step, so the back never folds (a mark behind it, trotted to straight off,
  // folded the back to half its length). From sitting or lying it gets up first.
  function turn({ t0 = clock, yaw, by, beat = 0.13 }) {
    const d = by ?? wrap(yaw - cur.yaw), n = Math.ceil(Math.abs(d) / 0.5 - 1e-6);
    if (n === 0) return until(t0);
    if (cur.sit || cur.lie) t0 = stand({ t0 });
    let t = t0;
    for (let i = 1; i <= n; i++) {
      const st = stance(cur.at, cur.yaw + d * i / n, 0);
      for (const group of [['FL', 'HR'], ['FR', 'HL']]) { for (const name of group) step(name, { t0: t, t1: t + beat * 0.9, pos: st[name], h: 0.025 }); t += beat; }
    }
    cur.yaw += d;
    return until(t + 0.1);
  }
  // target: a heading, a floor mark [x, z], a point [x, y, z] or someone in the world
  const turnTo = (target, o = {}) => {
    const t0 = o.t0 ?? clock, p = typeof target === 'number' ? null : typeof target === 'string' ? world.where(target, t0) : target.length === 2 ? [target[0], 0, target[1]] : target;
    return turn({ ...o, t0, yaw: p ? Math.atan2(p[0] - cur.at[0], p[2] - cur.at[2]) : target });
  };
  // Sit down where it stands: the hind paws shuffle forward under the body, the haunches sink.
  function sit({ t0 = clock } = {}) {
    const st = stance(cur.at, cur.yaw, 1);
    step('HL', { t0, t1: t0 + 0.16, pos: st.HL, h: 0.02 }); step('HR', { t0: t0 + 0.18, t1: t0 + 0.34, pos: st.HR, h: 0.02 });
    step('FL', { t0: t0 + 0.1, t1: t0 + 0.24, pos: st.FL, h: 0.02 }); step('FR', { t0: t0 + 0.3, t1: t0 + 0.44, pos: st.FR, h: 0.02 });
    sitKeys.push([t0, sitKeys[sitKeys.length - 1][1]], [t0 + 0.55, 1]);
    cur.sit = 1;
    return until(t0 + 0.6);
  }
  // Lie down where it stands (or sits): fore paws slide out in front, the hind legs fold, the body sinks to the floor.
  function lie({ t0 = clock, dur = 1.2 } = {}) {
    const st = stance(cur.at, cur.yaw, 1, 1);
    step('FL', { t0: t0 + 0.2, t1: t0 + 0.45, pos: st.FL, h: 0.015 }); step('FR', { t0: t0 + 0.4, t1: t0 + 0.65, pos: st.FR, h: 0.015 });
    if (!cur.sit) { step('HL', { t0, t1: t0 + 0.2, pos: st.HL, h: 0.02 }); step('HR', { t0: t0 + 0.15, t1: t0 + 0.35, pos: st.HR, h: 0.02 }); }
    sitKeys.push([t0, sitKeys[sitKeys.length - 1][1]], [t0 + dur * 0.5, 1]);
    lieKeys.push([t0 + 0.2, 0], [t0 + dur, 1]);
    cur.sit = 1; cur.lie = 1;
    return until(t0 + dur);
  }
  // Stand: hold for dur; from sitting or lying it first gets up, paws back under the body.
  function stand({ t0 = clock, dur = 0 } = {}) {
    let t = t0;
    if (cur.sit || cur.lie) {
      const st = stance(cur.at, cur.yaw, 0);
      if (cur.lie) { lieKeys.push([t, 1], [t + 0.5, 0]); t += 0.2; }
      step('FL', { t0: t, t1: t + 0.2, pos: st.FL, h: 0.02 }); step('FR', { t0: t + 0.12, t1: t + 0.32, pos: st.FR, h: 0.02 });
      step('HL', { t0: t + 0.2, t1: t + 0.38, pos: st.HL, h: 0.02 }); step('HR', { t0: t + 0.3, t1: t + 0.48, pos: st.HR, h: 0.02 });
      sitKeys.push([t, 1], [t + 0.5, 0]);
      t += 0.55; cur.sit = 0; cur.lie = 0;
    }
    return until(t + dur);
  }
  // Bat something on the floor with a fore paw: the paw (the one on its side) reaches out low and touches `at`
  // ([x, y, z], the floor point it strikes) at t0, then comes back under the chest, its eyes on the point. → the time it is back.
  function bat({ t0 = clock, at, watch = true }) {
    // (it watches what it strikes, from a moment before the paw goes out until just after: a cat batting a ball while
    // looking up and away read as wrong; watch: false leaves its looks alone)
    // (a little ahead of the point, which lies almost under its chin: straight under the eyes the way to it swings
    // from side to side; and it wins over the looks the writer gives, which are laid on after the verbs)
    if (watch) { look([at[0] + Math.sin(cur.yaw) * 0.3, at[1], at[2] + Math.cos(cur.yaw) * 0.3], { t0: t0 - 0.4, t1: t0 + 0.2, ease: 0.15 }); looks[looks.length - 1].top = true; }
    const st = stance(cur.at, cur.yaw, 0), side = (at[0] - cur.at[0]) * Math.cos(cur.yaw) - (at[2] - cur.at[2]) * Math.sin(cur.yaw), n = side >= 0 ? 'FL' : 'FR';
    step(n, { t0: t0 - 0.14, t1: t0, pos: [at[0], cur.at[1], at[2]], h: 0.035 });
    step(n, { t0: t0 + 0.03, t1: t0 + 0.25, pos: st[n], h: 0.03 });
    return until(t0 + 0.25);
  }
  // A skid: it comes in too fast and slides on all four paws `dist` metres on the way it faces over `dur`, low,
  // the paws held flat on the floor. → the time it stands.
  function skid({ t0 = clock, dist = 0.22, dur = 0.35 } = {}) {
    const to = [cur.at[0] + Math.sin(cur.yaw) * dist, cur.at[1], cur.at[2] + Math.cos(cur.yaw) * dist], st = stance(to, cur.yaw, 0);
    for (const n of PAWS) step(n, { t0, t1: t0 + dur, pos: st[n], h: 0.002 });
    dipKeys.push([t0 - 0.05, 0], [t0 + 0.1, 0.035], [t0 + dur + 0.15, 0]);
    cur.at = to;
    return until(t0 + dur + 0.15);
  }
  // A meow (laid over whatever it does; the sound is the writer's): the chin lifts, the ears go back, the eyes narrow
  // and the tail tip curls, over `dur`. → the time it is done.
  function meow({ t0 = clock, dur = 0.7 } = {}) { meows.push([t0, dur]); return t0 + dur; }
  // How keen it is (0 calm, 1 alert): ears forward, tail quick. Keys are [time, amount].
  const alert = (...keys) => { alertKeys.push(...keys); S = null; };
  // How far the mouth is open (0 shut, 1 wide: a pant about 0.3, a yawn 1). Keys are [time, amount], as alert's.
  const opens = (...keys) => { openKeys.push(...keys); S = null; };
  // A yawn: the head tips up, the mouth opens wide and slowly shuts again, the eyes squeeze, over dur. → the time it is done.
  function yawn({ t0 = clock, dur = 1.6 } = {}) { yawns.push([t0, dur]); opens([t0, 0], [t0 + dur * 0.35, 1], [t0 + dur * 0.65, 1], [t0 + dur, 0]); return t0 + dur; }
  // Look at something: a point, a function of time, or someone/something in the world, from t0 to t1 (eased in
  // and out; a later look wins while it is on). look(fn) with no window watches fn(t) all the time (the old form).
  function look(target, o) {
    looks.push({ target, t0: o?.t0 ?? (o ? clock : -1e9), t1: o?.t1 ?? (o?.dur !== undefined ? (o.t0 ?? clock) + o.dur : 1e9), ease: o ? (o.ease ?? 0.3) : 1e-3 });
    S = null;
  }

  function pawAt(name, t) {
    const tr = tracks[name];
    let from = tr.init, active = null;
    for (const s of tr.steps) { if (t >= s.t1) from = s; else if (t >= s.t0) { active = s; break; } else break; }
    if (!active || t <= active.t0) return { pos: from.pos, ride: from.pos, arc: 0, air: 0 };
    if (active.leap) {
      // in a leap the paw is carried by the body: it keeps where it was from the chest (or hips) as it leaves, and
      // comes round to where it will be from it as it lands
      const u = (t - active.t0) / (active.t1 - active.t0), B = (tt) => active.leap.path(tt).slice(active.part, active.part + 3);
      const b0 = B(active.t0), b1 = B(active.t1), b = B(t), e = smooth(u), arc = Math.sin(Math.PI * u);
      const pos = [0, 1, 2].map((i) => b[i] + lerp(from.pos[i] - b0[i], active.pos[i] - b1[i], e) + (i === 1 ? active.h * arc * arc : 0));
      return { pos, ride: pos, arc, air: 1, u, leap: true };
    }
    // (a cat sets its paws down softly: the paw slows into its mark and comes down to it without a knock)
    const u = (t - active.t0) / (active.t1 - active.t0), e = lerp(u, smooth(u), 0.85);
    const arc = Math.pow(Math.sin(Math.PI * u), 1.4);
    const pos = [lerp(from.pos[0], active.pos[0], e), lerp(from.pos[1], active.pos[1], e) + active.h * arc, lerp(from.pos[2], active.pos[2], e)];
    // ride: what the body rides on (the paw lifts, the body stays level)
    return { pos, ride: [pos[0], pos[1] - active.h * arc, pos[2]], arc, air: 1, u };
  }

  function springs() {
    if (S) return S;
    const keys = (k) => curve(k.length > 1 ? k : [[0, k[0][1]], [1, k[0][1]]]);
    const sitC = keys(sitKeys), lieC = keys(lieKeys), dipC = keys(dipKeys), alertC = keys(alertKeys), openC = keys([...openKeys].sort((a, b) => a[0] - b[0]));
    const raw = (t) => {
      const p = Object.fromEntries(PAWS.map((n) => [n, pawAt(n, t)]));
      const F = [0, 1, 2].map((i) => (p.FL.ride[i] + p.FR.ride[i]) / 2), Hd = [0, 1, 2].map((i) => (p.HL.ride[i] + p.HR.ride[i]) / 2);
      // (on the move it carries itself a little lower, legs a little bent, so a long step is reached without
      // the body dipping at every footfall)
      let low = 0; for (const [a, b] of gaitSpans) low = Math.max(low, win(t, a - 0.1, b + 0.15, 0.25));
      const s = sitC(t), l = lieC(t), dip = dipC(t) + 0.026 * low;
      const yaw = Math.atan2(F[0] - Hd[0], F[2] - Hd[2]), fx = Math.sin(yaw), fz = Math.cos(yaw);
      // chest over the front paws, hips over the hind paws (behind and low when sitting); lying, both low
      const cz = lerp(-0.004, -0.016, s) - 0.05 * l, cy = lerp(lerp(I.chest.y, I.chest.y - 0.004, s), I.wristH + 0.075, l) - dip;
      const hz = lerp(-0.004, -0.108, s) + 0.02 * l, hy = lerp(lerp(I.hips.y, 0.1, s), 0.075, l) - dip * (1 - s) * 0.8;
      return [F[0] + fx * cz, F[1] + cy, F[2] + fz * cz, Hd[0] + fx * hz, Hd[1] + hy, Hd[2] + fz * hz];
    };
    // Leaps: from the start of the push to the end of the landing the body is on its worked-out path (leapPath); the
    // spring then follows what the paws say less how far the leaps have carried the body, so the body comes out of a
    // leap exactly where and as fast as it went in. (No two leaps may overlap.)
    for (const L of leaps) { L.r0 = raw(L.tA); L.r1 = raw(L.tE); L.path = leapPath(L); }
    const carried = (t) => {
      const o = [0, 0, 0, 0, 0, 0];
      for (const L of leaps) if (t > L.tA) { const p = t < L.tE ? L.path(t) : L.r1; for (let i = 0; i < 6; i++) o[i] += p[i] - L.r0[i]; }
      return o;
    };
    const inLeap = (t) => leaps.find((L) => t > L.tA && t < L.tE);
    const follow = springVec((t) => { const L = inLeap(t), r = L ? L.path(t) : raw(t), o = carried(t); return r.map((v, i) => v - o[i]); }, { f: 7, z: 0.62, dt: 1 / 240 });
    S = { sitC, lieC, dipC, alertC, openC, raw, body: (t) => { const b = follow(t), o = carried(t); return b.map((v, i) => v + o[i]); } };
    // things that trail: the tail follows the hips, the ears follow the head
    S.tailLag = springVec((t) => S.body(t).slice(3), { f: tailS.f, z: tailS.z, dt: 1 / 240 });
    S.earLag = spring((t) => S.body(t)[1], { f: earS.f, z: earS.z, dt: 1 / 240 });
    if (looks.length) {
      // where it means to look: the looks that are on, mixed; when none is, straight ahead
      const ahead = (t) => { const b = S.body(t), y = Math.atan2(b[0] - b[3], b[2] - b[5]); return [b[0] + Math.sin(y), b[1] + 0.05, b[2] + Math.cos(y)]; };
      S.lookW = (t) => { let w = 0; for (const L of looks) w = lerp(w, 1, win(t, L.t0, L.t1, L.ease)); return w; };
      // (mixed as angles from the eyes, the yaw off the way the body faces, so that sliding from one look to another
      // never passes through the head. A point more than 90 degrees round is let go of, all of it by straight behind,
      // so the head never flicks from one shoulder to the other as the body turns; and it is sprung as angles, never
      // turning faster than HEAD_TURN.) → [yaw off the body, pitch up]
      S.gaze = springVec((t) => {
        const b = S.body(t), yaw = Math.atan2(b[0] - b[3], b[2] - b[5]), eye = headAt(t);
        const angles = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]; return [wrap(Math.atan2(d[0], d[2]) - yaw), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; };
        const A = angles(ahead(t));
        let r = A[0], pitch = A[1];
        for (const L of [...looks.filter((l) => !l.top), ...looks.filter((l) => l.top)]) {
          const u = win(t, L.t0, L.t1, L.ease); if (u <= 0) continue;
          const [rr, pp] = angles(pointOf(L.target, t)), k = smooth((Math.PI - Math.abs(rr)) / (Math.PI - 1.6));
          r = lerp(r, rr * k, u); pitch = lerp(pitch, lerp(A[1], pp, k), u);
        }
        return [r, pitch];
      }, { f: 2.6, z: 0.8, dt: 1 / 240, vmax: HEAD_TURN });
    }
    return S;
  }

  // The body's path through a leap L, for chest and hips each ([chest x, y, z, hips x, y, z]): from rest at r0 it speeds
  // up steadily over the push (p) to the launch speed, flies under gravity for T, and slows steadily to rest at r1 over
  // the landing (q). The launch speed is what makes it end at r1.
  function leapPath({ r0, r1, p, q, T }) {
    const v = r0.map((a, i) => (r1[i] - a + (i % 3 === 1 ? G * (T * T / 2 + T * q / 2) : 0)) / (p / 2 + T + q / 2));
    return (t) => {
      const tau = t - leaps.find((L) => L.r0 === r0).tA;
      return r0.map((a, i) => {
        const g = i % 3 === 1 ? G : 0;
        if (tau <= p) return a + v[i] * tau * tau / (2 * p);
        const s = Math.min(tau - p, T), at = a + v[i] * p / 2 + v[i] * s - g * s * s / 2;
        if (tau <= p + T) return at;
        const vl = v[i] - g * T, w = Math.min(tau - p - T, q);
        return at + vl * w - vl * w * w / (2 * q);
      });
    };
  }

  // blinks in slots of 2.3 s at seeded moments; eye darts every second or so
  const lid = (u) => (u < 0 || u > 0.18 ? 0 : u < 0.05 ? smooth(u / 0.05) : 1 - smooth((u - 0.05) / 0.13));
  function blinkAt(t) {
    const k = Math.floor(t / 2.3); let b = 0;
    for (const j of [k - 1, k]) b = Math.max(b, lid(t - (j * 2.3 + 0.3 + rnd(j, P.seed) * 1.7)));
    return b;
  }
  const dartTo = (j) => [(rnd(j, P.seed + 11) - 0.5) * 0.4, (rnd(j, P.seed + 13) - 0.5) * 0.2];
  function dartAt(t) {
    const sl = 1.1, k = Math.floor(t / sl), at = (j) => j * sl + rnd(j, P.seed + 17) * sl;
    const j = t >= at(k) ? k : k - 1, u = smooth((t - at(j)) / 0.04), a = dartTo(j - 1), b = dartTo(j);
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
  }

  // how much a paw holds the body: fully while down, letting go as it lifts, taking hold again as it comes down
  // (a paw in a leap lets go at once: the body is thrown off it)
  const downAt = (p) => (p.leap ? 0 : p.air ? Math.max(1 - smooth(p.u / 0.3), smooth((p.u - 0.7) / 0.3)) : 1);
  function poseAt(t) {
    const sp = springs();
    const b = sp.body(t), s = sp.sitC(t), l = sp.lieC(t), al = sp.alertC(t);
    const paws = Object.fromEntries(PAWS.map((n) => [n, pawAt(n, t)]));
    const C = b.slice(0, 3), H = b.slice(3);
    const run = Math.hypot(C[0] - H[0], C[2] - H[2]) || 1e-6, slope = Math.atan2(C[1] - H[1], run);
    const yaw = Math.atan2(C[0] - H[0], C[2] - H[2]);
    const breath = Math.sin(2 * Math.PI * t / 2.1 + P.seed);
    // idle life, as much as the body is still: the weight drifts, the head wanders a little
    const b1 = sp.body(t + 0.04), b0 = sp.body(t - 0.04), idle = P.idle * smooth(clamp(1 - Math.hypot(b1[0] - b0[0], b1[2] - b0[2]) / 0.08 / 0.15));
    const sway = 0.004 * wobble(t, 1, P.seed, 0.2) * idle;
    const pose = {
      hips: [H[0] + Math.cos(yaw) * sway, H[1] + 0.0015 * breath, H[2] - Math.sin(yaw) * sway], chest: [C[0] + Math.cos(yaw) * sway * 0.6 + Math.sin(yaw) * 0.0015 * breath, C[1] + 0.002 * breath, C[2] - Math.sin(yaw) * sway * 0.6 + Math.cos(yaw) * 0.0015 * breath], roll: 0.5 * (paws.FL.arc - paws.FR.arc) * 0.06 + 2 * sway,
      chestPitch: -slope * 0.75, chestYaw: 0,
      paws: {
        FL: { pos: paws.FL.pos, pitch: 0.7 * paws.FL.arc, down: downAt(paws.FL) }, FR: { pos: paws.FR.pos, pitch: 0.7 * paws.FR.arc, down: downAt(paws.FR) },
        HL: { pos: paws.HL.pos, heel: s * (1 - paws.HL.arc), down: downAt(paws.HL) }, HR: { pos: paws.HR.pos, heel: s * (1 - paws.HR.arc), down: downAt(paws.HR) },
      },
      face: { blink: blinkAt(t), gaze: dartAt(t) },
    };
    // head: look where the gaze spring says, as far as the neck allows
    let hy = 0.12 * wobble(t, 2, P.seed, 0.15) * idle, hp = 0.06 - pose.chestPitch + 0.08 * wobble(t, 3, P.seed, 0.12) * idle - 0.15 * l;
    if (sp.gaze) {
      const [rel, up] = sp.gaze(t), w = sp.lookW(t);
      hy = lerp(hy, soft(rel, 1.5), w);
      hp = lerp(hp, soft(-up - pose.chestPitch, 0.7), w);
    }
    // (and it breathes through the neck too, a little, so a head held on a look is never dead still)
    pose.head = { yaw: hy, pitch: hp + 0.025 * breath, roll: -hy * 0.12 };
    // tail: held up in a soft S, swaying from the root to the tip with each bone a beat behind the last;
    // quicker when keen; it also trails behind the hips when the body moves; lying, it curls round on the floor
    const lag = sp.tailLag(t), side = (lag[0] - H[0]) * Math.cos(yaw) - (lag[2] - H[2]) * Math.sin(yaw), fall = lag[1] - H[1];
    const ahead = (lag[0] - H[0]) * Math.sin(yaw) + (lag[2] - H[2]) * Math.cos(yaw);
    pose.tail = [];
    for (let i = 0; i < I.tailN; i++) {
      const calm = 0.2 * Math.sin(2 * Math.PI * 0.42 * t * (1 + 0.15 * wobble(t, 4, P.seed, 0.1)) - i * 0.75 + P.seed), keen = 0.26 * Math.sin(2 * Math.PI * 1.25 * t - i * 0.85);
      const sway = lerp(calm, keen, al) * (0.45 + 0.2 * i) * (1 - 0.6 * l);
      pose.tail.push({
        yaw: sway - clamp(side * 2.5, -0.5, 0.5) + (P.tailSide ?? 1) * (0.42 * s * (1 - 0.5 * al) + 0.25 * l),
        pitch: (i === 0 ? 0.95 * slope - 0.35 * s * al - 0.5 * l : 0.05 * s - 0.1 * l) + clamp(fall * 2.2 + ahead * 1.6, -0.4, 0.45) * (i < 3 ? 1 : 0.5) + 0.05 * Math.sin(2 * Math.PI * 0.3 * t + i),
      });
    }
    // ears: forward when keen, a flick now and then, tipping with a head turn
    const flick = (k) => { let f = 0; for (let j = 0; j < 6; j++) { const tf = 0.9 + j * 1.9 + rnd(j * 7 + k, P.seed) * 1.4, u = (t - tf) / 0.16; if (u > 0 && u < 1) f = Math.sin(Math.PI * u) ** 2; } return f; };
    // ... and are left behind for a moment when the head drops or lands (their spring)
    const flop = clamp((sp.earLag(t) - C[1]) * earS.swing, -0.5, 0.5);
    pose.ears = { L: { pitch: 0.12 * al - 0.4 * flick(1) - flop, roll: -0.08 * al + 0.25 * flick(1) }, R: { pitch: 0.12 * al - 0.4 * flick(2) - flop, roll: -0.08 * al + 0.25 * flick(2) } };
    let mw = 0; for (const [m0, md] of meows) mw = Math.max(mw, win(t, m0, m0 + md, 0.15));
    let yw = 0; for (const [y0, yd] of yawns) yw = Math.max(yw, win(t, y0, y0 + yd, yd * 0.3));
    if (yw > 0) { pose.head.pitch -= 0.4 * yw; pose.face.blink = Math.max(pose.face.blink, 0.8 * yw); for (const s of ['L', 'R']) pose.ears[s].pitch -= 0.3 * yw; }
    if (mw > 0) {
      pose.head.pitch -= 0.32 * mw; pose.face.blink = Math.max(pose.face.blink, 0.45 * mw);
      for (const s of ['L', 'R']) { pose.ears[s].pitch -= 0.45 * mw; pose.ears[s].roll += 0.2 * mw; }
      pose.tail.forEach((b, i) => { if (i >= pose.tail.length - 3) b.pitch += 0.3 * mw; });
    }
    // the mouth: open over the meow itself (the call peaks about 0.25 s after the gesture starts; quick to open, slower
    // to close), a pant or a yawn (opens(): keys of [time, amount])
    let mo = 0; for (const [m0] of meows) mo = Math.max(mo, smooth((t - m0 - 0.02) / 0.08) * (1 - smooth((t - m0 - 0.38) / 0.16)));
    mo = Math.max(mo, sp.openC(t));
    if (mo > 0) pose.face.mouth = { open: 1.15 * mo, round: 0.35 * mo };
    return pose;
  }
  const apply = (t) => { const pose = poseAt(t); return { pose, out: rig.solve(pose) }; };
  // for the world: where it stands, and where its eyes are
  const where = (t) => { const c = springs().body(t); return [(c[0] + c[3]) / 2, 0, (c[2] + c[5]) / 2]; };
  const headAt = (t) => { const c = springs().body(t), y = Math.atan2(c[0] - c[3], c[2] - c[5]); return [c[0] + Math.sin(y) * 0.14, c[1] + 0.12, c[2] + Math.cos(y) * 0.14]; };
  const api = {
    hop, trot, turn, turnTo, sit, lie, stand, look, alert, opens, bat, skid, meow, yawn,
    hopTo: (to, o = {}) => hop({ ...o, to }), walkTo: (to, o = {}) => gait('walk', { ...o, to }), trotTo: (to, o = {}) => gait('trot', { ...o, to }), runTo: (to, o = {}) => gait('run', { ...o, to }),
    wait: (dur) => until(clock + dur), get time() { return clock; }, radius: 0.57 * I.bodyLen,   // (radius: how far it reaches from its middle, for others going round it)
    poseAt, apply, pawAt, where, headAt, tracks, cur, rig, stance,
  };
  if (world && P.name) world.add(P.name, api);
  return api;
}
