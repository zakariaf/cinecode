// A thrown ball, as exact physics worked out once: free flight under gravity, bounces
// that lose speed, then rolling with friction until it stops. The whole path is a
// short list of segments, each a formula of time, so any frame can ask where the ball
// is without stepping through the frames before it.
import * as THREE from 'three/webgpu';
import { paint } from './materials.mjs';
import { color, mix, smoothstep, abs, positionLocal } from 'three/tsl';

const G = 9.81;

// p0, v0: where and how fast it leaves the hand at time t0. r: radius.
// bounce: fraction of downward speed kept at each bounce; grip: fraction of forward
// speed kept; roll: how fast rolling slows (m/s^2); settle: a rebound slower than this
// does not leave the floor, the ball rolls instead.
function ballPath({ t0, p0, v0, r = 0.1, bounce = 0.55, grip = 0.72, roll = 1.0, settle = 0.9, spin = 5 }) {
  const segs = [];
  let t = t0, p = [...p0], v = [...v0], angle = 0;
  // (one set going along the floor only rolls: rollTo)
  for (let guard = p[1] <= r + 1e-9 && v[1] <= 0 ? 20 : 0; guard < 20; guard++) {
    // flight: y(τ) = p.y + v.y τ - g τ²/2, lands when y = r
    const tau = (v[1] + Math.sqrt(v[1] * v[1] + 2 * G * (p[1] - r))) / G;
    const vh = Math.hypot(v[0], v[2]);
    const w = segs.length === 0 ? spin : vh / r;         // spin rate: thrown with a little spin, then as fast as it travels
    segs.push({ kind: 'fly', t0: t, t1: t + tau, p: [...p], v: [...v], angle, w });
    angle += w * tau;
    const vyIn = v[1] - G * tau;
    p = [p[0] + v[0] * tau, r, p[2] + v[2] * tau]; t += tau;
    v = [v[0] * grip, -vyIn * bounce, v[2] * grip];
    segs[segs.length - 1].hit = -vyIn;
    if (v[1] < settle) break;
  }
  const vh = Math.hypot(v[0], v[2]), dur = vh / roll;
  segs.push({ kind: 'roll', t0: t, t1: t + dur, p: [...p], v: [v[0], 0, v[2]], angle, vh });
  const end = segs[segs.length - 1];
  const axisOf = (vx, vz) => { const l = Math.hypot(vx, vz) || 1; return new THREE.Vector3(vz / l, 0, -vx / l); };
  const axis = axisOf(v0[0], v0[2]);

  // position, turning and squash at time t (t >= t0)
  function at(time) {
    let s = segs[0];
    for (const g of segs) if (time >= g.t0) s = g;
    const tau = Math.min(Math.max(time - s.t0, 0), s.t1 - s.t0);
    let pos, ang, vel;
    if (s.kind === 'fly') {
      pos = [s.p[0] + s.v[0] * tau, s.p[1] + s.v[1] * tau - 0.5 * G * tau * tau, s.p[2] + s.v[2] * tau];
      vel = [s.v[0], s.v[1] - G * tau, s.v[2]];
      ang = s.angle + s.w * tau;
    } else {
      const d = s.vh * tau - 0.5 * roll * tau * tau, u = s.vh > 0 ? d / s.vh : 0;
      pos = [s.p[0] + s.v[0] * u, r, s.p[2] + s.v[2] * u];
      const k = s.vh > 0 && time < s.t1 ? (s.vh - roll * tau) / s.vh : 0;
      vel = [s.v[0] * k, 0, s.v[2] * k];
      ang = s.angle + d / r;
    }
    // a brief squash at each impact, strongest for the hardest hit
    let squash = 1;
    for (const g of segs) if (g.hit) { const x = (time - g.t1) / 0.04; squash -= Math.min(0.3, 0.05 * g.hit) * Math.exp(-x * x); }
    pos[1] = Math.max(pos[1] - r * (1 - squash), r * squash);
    return { pos, angle: ang, axis, squash, vel };
  }
  return { segs, at, t0, tStop: end.t1, rest: at(end.t1).pos, r };
}

// The ball itself: two colours in bands with a star cap, so its spin is visible.
export function ballMesh(r = 0.1) {
  const mat = paint({
    color: 0xffffff, mottle: 0.05, scatter: 0.35, rim: 1.4,
    pattern: () => {
      const n = positionLocal.normalize();
      const band = smoothstep(0.02, 0.05, abs(n.y).sub(0.33));
      const cap = smoothstep(0.02, 0.05, abs(n.y).sub(0.8));
      let c = mix(color(0xf6efe2), color(0x2f9aa3), band);
      c = mix(c, color(0xe8553f), cap);
      return c;
    },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// A throw solved backwards: from p0 at t0, land first at `to` ([x, z]) either at time `land` or with the upward
// speed `vy`; with `stop`, roll to rest exactly at that time (the friction is worked out from it). The other
// options are ballPath's. Returns a ballPath.
export function throwTo({ t0, p0, to, land, vy, stop, r = 0.1, ...rest }) {
  let T;
  if (land !== undefined) { T = land - t0; vy = ((r - p0[1]) + 0.5 * G * T * T) / T; }
  else T = (vy + Math.sqrt(vy * vy + 2 * G * (p0[1] - r))) / G;
  const v0 = [(to[0] - p0[0]) / T, vy, (to[1] - p0[2]) / T];
  let path = ballPath({ t0, p0, v0, r, ...rest });
  if (stop !== undefined) {
    const s = path.segs[path.segs.length - 1];
    if (stop <= s.t0 + 0.05) throw new Error(`throwTo: the ball is still bouncing until ${s.t0.toFixed(2)} s; it cannot stop at ${stop} s`);
    path = ballPath({ t0, p0, v0, r, ...rest, roll: s.vh / (stop - s.t0) });
  }
  return path;
}

// A ball set rolling along the floor from p0 ([x, z]) at t0 to come to rest on `to` ([x, z]): at `stop` if given (the
// friction is worked out from it), else slowing at `roll` m/s² (ballPath's default). Returns a ballPath.
export function rollTo({ t0, p0, to, stop, r = 0.1, roll = 1.0 }) {
  const D = Math.max(Math.hypot(to[0] - p0[0], to[1] - p0[1]), 1e-6), d = [(to[0] - p0[0]) / D, (to[1] - p0[1]) / D];
  const T = stop !== undefined ? stop - t0 : Math.sqrt(2 * D / roll), v = 2 * D / T;
  return ballPath({ t0, p0: [p0[0], r, p0[1]], v0: [d[0] * v, 0, d[1] * v], r, roll: v / T });
}

// A ball rolled along the floor by a performer sitting (or crouched) on it, from the hands it is held in: held in both
// hands in front of the chest (act.carry) from `from`, the body leans forward and the hands take it down to the floor
// past the feet over the last half second, push it off at `t0`, follow it a little and come back; it rolls to rest on
// `to` ([x, z]) at `stop` (by default slowing at 1 m/s²). → { at(t) } as a ballPath's, and `tStop`.
export function rollBall(act, { from = act.time, t0, to, stop, r = 0.085 } = {}) {
  const size = act.opts.size, down = t0 - 0.5, held = act.carry({ t0: from, t1: down + 0.1, r });
  const { pose } = act.poseAt(t0), y = pose.pelvis.yaw, f = [Math.sin(y), Math.cos(y)];
  const P = [pose.pelvis.pos[0] + f[0] * 0.58 * size, pose.pelvis.pos[2] + f[1] * 0.58 * size];   // on the floor, past the feet
  const path = rollTo({ t0, p0: P, to, stop, r });
  const at = (t) => {
    if (t <= down) return held.at(t);
    if (t > t0) return path.at(t);
    const u = (t - down) / 0.5, k = u * u * (3 - 2 * u), h = held.at(down).pos, q = [P[0], r, P[1]];
    return { pos: h.map((c, i) => c + (q[i] - c) * k), angle: 0, axis: path.at(t0).axis, squash: 1, vel: [0, 0, 0] };
  };
  // the hands go with the ball down to the floor and a hand's breadth after it, either side of it
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1, side = [Math.cos(y) * sx * r * 0.95, -Math.sin(y) * sx * r * 0.95];
    act.reach({ t0: down - 0.05, dur: 0.85, hold: 0.1, arm: s, to: (t) => { const p = at(Math.min(t, t0 + 0.12)).pos; return [p[0] + side[0], p[1] + 0.2 * r, p[2] + side[1]]; } });
  }
  act.layer((pose, t) => { const w = Math.max(0, Math.min((t - down + 0.2) / 0.35, 1, (t0 + 0.75 - t) / 0.5)); pose.spine.pitch += 0.4 * w; pose.head.pitch -= 0.15 * w; });
  return { at, tStop: path.tStop, rest: path.rest };
}

// A ball picked up off the floor (its centre at `at`, [x, y, z]) by a performer who crouches to it (the crouch is the
// caller's: down from t0, up again after `grab`): the right hand reaches for it from t0 and takes it at `grab`, and it
// is held in both hands in front of the chest (act.carry) from then. → { at(t) } (on the floor until the hand has it,
// then carried up into the hold).
export function pickUp(act, at, { t0, grab = t0 + 0.6, r = 0.085 } = {}) {
  // (the hand goes to the ball's right side, as rollBall's do: to its middle, the forearm passed 5 mm into the
  // crouched body at some breath phases)
  const y = act.poseAt(t0).pose.pelvis.yaw;
  act.reach({ t0, dur: grab - t0 + 0.35, to: [at[0] - Math.cos(y) * r * 0.95, at[1] + 0.2 * r, at[2] + Math.sin(y) * r * 0.95], arm: 'R' });
  const held = act.carry({ t0: grab + 0.05, r }), up = 0.45, still = { pos: at, angle: 0, axis: new THREE.Vector3(1, 0, 0), squash: 1, vel: [0, 0, 0] };
  const k = (t) => { const u = Math.min(Math.max((t - grab) / up, 0), 1); return u * u * (3 - 2 * u); };
  return { at: (t) => { if (t <= grab) return still; const h = held.at(t); return { ...h, pos: at.map((v, i) => v + (h.pos[i] - v) * k(t)) }; } };
}
