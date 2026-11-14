// The car as a thing that acts. Verbs lay out a plan (where it drives and when, the door, the engine, the lamps);
// apply(t) reads every pose off the plan, for any t in any order. The only memory is the body's springs, stepped
// at a fixed rate from t = 0 (motion.mjs spring).
//
//   const car = createCar({ at: [x, z], yaw, color });  stage.scene.add(car.group);
//   car.engine(true, { t0: 0 });
//   const t1 = car.driveTo([[x, z], [x, z]], { speed: 5, rolling: true });   // through the marks, stopping at the last
//   car.engine(false, { t0: t1 + 0.6 });
//   car.door(1, { t0, dur: 0 }); car.door(0, { t0: t0 + 0.3 });            // open at a cut, swing shut
//   car.apply(t);
//
// Marks are where the middle of the car passes (half way between the axles). The car steers like a car: its back
// axle follows a smooth path (curvature continuous), the front wheels turn to the angle that path asks of each
// (inner wheel more), every wheel turns by exactly the distance its contact point travels.
import * as THREE from 'three/webgpu';
import { spring, clamp, smooth } from '../motion.mjs';
import { buildCar, CAR } from './car.mjs';

const C = CAR, WB = C.axleF - C.axleR, BACK = -C.axleR;       // wheelbase; the back axle is BACK behind the middle
const DS = 0.02;                                              // the path is tabled every 2 cm
const SURGE = 0.8;                                            // m/s
const WHEEL_AT = { fl: [C.track, WB], fr: [-C.track, WB], rl: [C.track, 0], rr: [-C.track, 0] };   // [x, z] from the back axle's middle
const fwd = (yaw) => [Math.sin(yaw), Math.cos(yaw)];

// A cubic spline through points [x, z] by chord length: the first tangent given (the way the car faces), the
// last free. → (u) => [x, z, dx, dz, ddx, ddz], u from 0 to the total chord length.
function spline(pts, dir0) {
  const n = pts.length, u = [0];
  for (let i = 1; i < n; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const coord = (k) => {
    const y = pts.map((p) => p[k]), h = u.slice(1).map((v, i) => v - u[i]);
    // second derivatives M: clamped start (slope dir0[k]), natural end
    const a = new Array(n).fill(0), b = new Array(n).fill(0), c = new Array(n).fill(0), d = new Array(n).fill(0);
    b[0] = 2 * h[0]; c[0] = h[0]; d[0] = 6 * ((y[1] - y[0]) / h[0] - dir0[k]);
    for (let i = 1; i < n - 1; i++) { a[i] = h[i - 1]; b[i] = 2 * (h[i - 1] + h[i]); c[i] = h[i]; d[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1]); }
    b[n - 1] = 1; d[n - 1] = 0;
    for (let i = 1; i < n; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    const M = new Array(n); M[n - 1] = d[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) M[i] = (d[i] - c[i] * M[i + 1]) / b[i];
    return (s) => {
      let i = 0; while (i < n - 2 && s > u[i + 1]) i++;
      const H = h[i], A = (u[i + 1] - s) / H, B = (s - u[i]) / H;
      return [A * y[i] + B * y[i + 1] + ((A ** 3 - A) * M[i] + (B ** 3 - B) * M[i + 1]) * H * H / 6,
        (y[i + 1] - y[i]) / H + ((1 - 3 * A * A) * M[i] + (3 * B * B - 1) * M[i + 1]) * H / 6, A * M[i] + B * M[i + 1]];
    };
  };
  const X = coord(0), Z = coord(1);
  return { length: u[n - 1], at: (s) => { const x = X(s), z = Z(s); return [x[0], z[0], x[1], z[1], x[2], z[2]]; } };
}

// One drive (from: where the back axle starts): the back axle's path tabled by arc length (position, heading, curvature), the speed planned on it,
// the time at every table step, and the distance each wheel's contact point has travelled.
function plan({ from, yaw, marks, t0, speed, rolling, accel, brake, lateral }) {
  const f0 = fwd(yaw), back = (p, d) => [p[0] - d[0] * BACK, p[1] - d[1] * BACK];
  // the marks are for the car's middle: find the way it faces at each from a first path through the middles,
  // then put the back axle that far behind
  const mid = [[from[0] + f0[0] * BACK, from[1] + f0[1] * BACK], ...marks];
  const sp0 = spline(mid, f0), dirs = [f0];
  let acc = 0;
  for (let i = 1; i < mid.length; i++) {
    acc += Math.hypot(mid[i][0] - mid[i - 1][0], mid[i][1] - mid[i - 1][1]);
    const q = sp0.at(acc), l = Math.hypot(q[2], q[3]); dirs.push([q[2] / l, q[3] / l]);
  }
  // (the last back-axle point is set behind the last mark the way the path ends up facing there, so the car's middle
  // stops on the mark; the path ends straight, so it stops with its wheels straight)
  const pts = mid.map((p, i) => back(p, dirs[i]));
  let sp = spline(pts, f0);
  for (let k = 0; k < 4; k++) { const q = sp.at(sp.length), l = Math.hypot(q[2], q[3]); pts[pts.length - 1] = back(mid.at(-1), [q[2] / l, q[3] / l]); sp = spline(pts, f0); }
  // table the path by true arc length
  const fine = [], N = Math.ceil(sp.length / 0.002);
  let L = 0, prev = sp.at(0);
  fine.push([0, 0]);
  for (let i = 1; i <= N; i++) { const q = sp.at(sp.length * i / N); L += Math.hypot(q[0] - prev[0], q[1] - prev[1]); fine.push([L, sp.length * i / N]); prev = q; }
  const n = Math.max(2, Math.ceil(L / DS) + 1), ds = L / (n - 1), S = [], pos = [], hd = [], kap = [];
  for (let i = 0, j = 0; i < n; i++) {
    const s = i * ds; while (j < fine.length - 2 && fine[j + 1][0] < s) j++;
    const w = (s - fine[j][0]) / ((fine[j + 1][0] - fine[j][0]) || 1), uu = fine[j][1] + w * (fine[j + 1][1] - fine[j][1]);
    const [x, z, dx, dz, ddx, ddz] = sp.at(uu), sp2 = dx * dx + dz * dz;
    S.push(s); pos.push([x, z]); hd.push(Math.atan2(dx, dz)); kap.push((dz * ddx - dx * ddz) / sp2 ** 1.5);
  }
  for (let i = 1; i < n; i++) while (hd[i] - hd[i - 1] > Math.PI) hd[i] -= 2 * Math.PI; for (let i = 1; i < n; i++) while (hd[i] - hd[i - 1] < -Math.PI) hd[i] += 2 * Math.PI;
  // speed: no faster than asked, nor than the turn allows sideways; speeding up and slowing down at most accel and brake
  // (a driver slows for a bend before it and holds that speed through it: the lowest the turns allow over the next
  // 3 m and the last 2 m)
  const vk = kap.map((k) => Math.min(speed, Math.sqrt(lateral / Math.max(Math.abs(k), 1e-6)))), ahead = Math.round(3 / ds), behind = Math.round(2 / ds);
  const v = vk.map((_, i) => Math.min(...vk.slice(Math.max(0, i - behind), i + ahead + 1)));
  v[0] = rolling ? Math.min(v[0], speed) : 0; v[n - 1] = 0;
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * accel * ds));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * brake * ds));
  // nor does he speed up only to brake again: a rise of less than SURGE before the speed falls back is held level
  for (let p = 1; p < n - 1; p++) {
    if (!(v[p] > v[p + 1] && v[p] >= v[p - 1])) continue;
    let a = p; while (a > 0 && v[a - 1] <= v[a] + 1e-9) a--;
    if (v[p] - v[a] >= SURGE) continue;
    for (let k = a + 1; k < n && v[k] >= v[a]; k++) v[k] = v[a];
  }
  const T = [t0];
  for (let i = 1; i < n; i++) T.push(T[i - 1] + 2 * ds / (v[i - 1] + v[i]));
  // each wheel's contact point, step by step
  const dist = Object.fromEntries(Object.keys(WHEEL_AT).map((k) => [k, [0]]));
  const contact = (i, [wx, wz]) => { const s = Math.sin(hd[i]), c = Math.cos(hd[i]); return [pos[i][0] + c * wx + s * wz, pos[i][1] - s * wx + c * wz]; };
  for (const [k, w] of Object.entries(WHEEL_AT)) for (let i = 1; i < n; i++) { const a = contact(i - 1, w), b = contact(i, w); dist[k].push(dist[k][i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  // where along it at time t (each step at constant acceleration), how fast, how hard it speeds up
  // (read through T's length: stop() may cut the table short)
  const seg = (t) => { let lo = 0, hi = T.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return lo; };
  const at = (t) => {
    const n = T.length;
    if (t <= T[0]) return { i: 0, w: 0, v: v[0], a: 0 };
    if (t >= T[n - 1]) return { i: n - 2, w: 1, v: 0, a: 0 };
    const i = seg(t), tau = t - T[i], a = (v[i + 1] ** 2 - v[i] ** 2) / (2 * ds), s = v[i] * tau + 0.5 * a * tau * tau;
    return { i, w: clamp(s / ds), v: v[i] + a * tau, a };
  };
  return { t0, t1: T[n - 1], n, S, pos, hd, kap, v, T, dist, at, length: L, endPos: pos[n - 1], endYaw: hd[n - 1] };
}

/** A car that drives, opens its door, runs its engine and shows its lamps. */
export function createCar({ at = [0, 0], yaw = 0, color, speed = 5, accel = 1.6, brake = 2.6, lateral = 2.2, mesh = buildCar({ color }) } = {}) {
  // (mesh: null plans and poses without one, for timing; apply() then only reads the pose)
  const f = fwd(yaw);
  const start = { pos: [at[0] - f[0] * BACK, at[1] - f[1] * BACK], yaw };       // (the back axle's middle)
  const legs = [], doorKeys = [], engineKeys = [], lampKeys = [];
  let clock = 0, cur = { ...start };

  function driveTo(marks, { t0 = clock, speed: sp = speed, rolling = false } = {}) {
    const lg = plan({ from: cur.pos, yaw: cur.yaw, marks, t0, speed: sp, rolling, accel, brake, lateral });
    lg.base = Object.fromEntries(Object.keys(WHEEL_AT).map((k) => [k, (legs.at(-1)?.base[k] ?? 0) + (legs.at(-1)?.dist[k].at(-1) ?? 0)]));
    legs.push(lg);
    cur = { pos: lg.endPos, yaw: lg.endYaw };
    clock = Math.max(clock, lg.t1);
    return lg.t1;
  }
  // Brake now: from t0 the drive under way slows at the car's brake rate along its path and ends where it stands
  // still (its wheels as they are). Nothing happens if it is not moving then. → the time it stands still.
  function stop({ t0 = clock } = {}) {
    const l = legAt(t0);
    if (!l || t0 >= l.t1) return t0;
    const { i, w, v: v0 } = l.at(t0), s0 = l.S[i] + w * (l.S[i + 1] - l.S[i]);
    // (the table's steps after t0 brake from v0: v² = v0² − 2 brake (s − s0); it ends at the step where that reaches 0)
    let n = i + 1;
    while (n < l.n - 1 && v0 * v0 - 2 * brake * (l.S[n] - s0) > 0) n++;
    const end = Math.min(l.n - 1, n);
    l.n = end + 1;
    for (const k of ['S', 'pos', 'hd', 'kap', 'v', 'T']) l[k].length = l.n;
    for (const k of Object.keys(l.dist)) l.dist[k].length = l.n;
    for (let k = i + 1; k < l.n; k++) l.v[k] = Math.sqrt(Math.max(0, v0 * v0 - 2 * brake * (l.S[k] - s0)));
    l.v[l.n - 1] = 0;
    // (the time at each step: the step under way at t0 is entered at its own time, the rest at constant deceleration)
    for (let k = i + 1; k < l.n; k++) l.T[k] = l.T[k - 1] + 2 * (l.S[k] - l.S[k - 1]) / Math.max(l.v[k - 1] + l.v[k], 1e-6);
    l.t1 = l.T[l.n - 1]; l.endPos = l.pos[l.n - 1]; l.endYaw = l.hd[l.n - 1];
    cur = { pos: l.endPos, yaw: l.endYaw };
    clock = l.t1;
    return l.t1;
  }
  // The door swings open easing out (dur 0.9) or shut speeding up into the frame (dur 0.55); dur 0 at a cut.
  function door(open, { t0 = clock, dur = open ? 0.9 : 0.55 } = {}) { doorKeys.push({ t0, dur, to: open }); return t0 + dur; }
  const engine = (on, { t0 = clock } = {}) => { engineKeys.push({ t0, on }); return t0; };
  const lights = (on, { t0 = clock } = {}) => { lampKeys.push({ t0, on }); return t0; };
  const wait = (dur) => (clock += dur);

  // ---- reading the plan ----
  const legAt = (t) => legs.findLast((l) => l.t0 <= t) ?? null;
  // where the back axle is, which way it faces, its curvature, speed and acceleration at t
  function state(t) {
    const l = legAt(t);
    if (!l) return { pos: start.pos, yaw: start.yaw, k: 0, v: 0, a: 0, l: null };
    const { i, w, v, a } = l.at(t), j = i + 1;
    const lerp = (A, B) => A + (B - A) * w;
    return { pos: [lerp(l.pos[i][0], l.pos[j][0]), lerp(l.pos[i][1], l.pos[j][1])], yaw: lerp(l.hd[i], l.hd[j]), k: lerp(l.kap[i], l.kap[j]), v, a, l, i, w };
  }
  function doorAt(t) {
    let x = 0;
    for (const k of doorKeys) {
      if (t < k.t0) break;
      const u = k.dur > 0 ? clamp((t - k.t0) / k.dur) : 1, from = x;
      x = from + (k.to - from) * (k.to > from ? 1 - (1 - u) ** 2 : u * u);   // opening eases out; shutting speeds up and stops at the frame
    }
    return x;
  }
  const keyAt = (keys, t, d = false) => { let v = d; for (const k of keys) if (t >= k.t0) v = k.on; return v; };
  // the engine: running weight (eases over a quarter second) and a shudder when it starts or stops
  function engineAt(t) {
    let run = 0, kick = 0;
    for (const k of engineKeys) {
      if (t < k.t0) continue;
      const u = (t - k.t0) / 0.25;
      run = k.on ? smooth(clamp(u)) : run * (1 - smooth(clamp(u)));
      kick = Math.max(kick, Math.exp(-(t - k.t0) / 0.18) * (k.on ? 1 : 0.8));
    }
    return { run, kick };
  }
  // the springs of the body: pitch from speeding up and braking, roll from turning and from the door
  const dv = (fn, t, h = 1 / 240) => (fn(t + h) - fn(t - h)) / (2 * h);
  const accelAt = (t) => state(t).a, latAt = (t) => { const s = state(t); return s.v * s.v * s.k; };
  const pitch = spring((t) => -0.015 * accelAt(t), { f: 1.25, z: 0.36 });
  const roll = spring((t) => 0.02 * latAt(t) + 0.004 * clamp(dv(doorAt, t), -6, 6), { f: 1.6, z: 0.32 });   // (a door set open at a cut does not jolt it)
  const heave = spring((t) => -0.004 * Math.abs(accelAt(t)), { f: 1.4, z: 0.4 });

  const tmpQ = new THREE.Quaternion(), AX = new THREE.Vector3();
  function poseAt(t) {
    const s = state(t), e = engineAt(t), shake = e.run * 0.6 + e.kick * 2.2;
    const steer = {};
    for (const k of ['fl', 'fr']) { const x = WHEEL_AT[k][0]; steer[k] = Math.atan2(s.k * WB, 1 - s.k * x); }
    const wheels = {};
    for (const k of Object.keys(WHEEL_AT)) {
      let d = 0;
      if (s.l) { const D = s.l.dist[k]; d = s.l.base[k] + D[s.i] + (D[s.i + 1] - D[s.i]) * s.w; }
      wheels[k] = (k.endsWith('l') ? 1 : -1) * d / C.wheelR;
    }
    // the brake lamps: as hard as it slows, and full while it stands at the end of a drive with the engine running
    // (his foot on the brake), going out as the engine stops
    const held = s.l && t >= s.l.t1 ? e.run : 0, brake = Math.max(held, s.v > 0.05 && s.a < -0.3 ? smooth(clamp(-s.a / 1.2)) : 0);
    return {
      pos: s.pos, yaw: s.yaw, v: s.v, a: s.a, k: s.k,
      body: { pitch: pitch(t) + 0.0011 * shake * Math.sin(2 * Math.PI * 8.3 * t), roll: roll(t) + 0.0013 * shake * Math.sin(2 * Math.PI * 10.7 * t + 1.1),
        heave: heave(t) + 0.0012 * shake * Math.sin(2 * Math.PI * 7.1 * t + 2.3) },
      wheels, steer, wheel: -3 * (steer.fl + steer.fr) / 2, door: doorAt(t),
      head: keyAt(lampKeys, t) ? 1 : 0, tail: (keyAt(lampKeys, t) ? 0.4 : 0) + brake * 1.1,
    };
  }
  function apply(t) {
    const p = poseAt(t), fw = fwd(p.yaw);
    mesh.group.position.set(p.pos[0] + fw[0] * BACK, 0, p.pos[1] + fw[1] * BACK);
    mesh.group.rotation.set(0, p.yaw, 0);
    mesh.set(p);
    return p;
  }
  // a point given in the car (x, y, z from its middle on the ground) at t, in the world
  function toWorld(t, [x, y, z]) {
    const s = state(t), fw = fwd(s.yaw), c = [s.pos[0] + fw[0] * BACK, s.pos[1] + fw[1] * BACK];
    return [c[0] + Math.cos(s.yaw) * x + Math.sin(s.yaw) * z, y, c[1] - Math.sin(s.yaw) * x + Math.cos(s.yaw) * z];
  }
  return {
    group: mesh?.group, mesh, triangles: mesh?.triangles,
    driveTo, stop, door, engine, lights, wait, apply, poseAt, toWorld,
    get time() { return clock; },
    /** Where the car's middle is at t, [x, z]; which way it faces; how fast it goes (m/s). */
    where: (t) => { const w = toWorld(t, [0, 0, 0]); return [w[0], w[2]]; },
    heading: (t) => state(t).yaw, speed: (t) => state(t).v,
    /** Where the driver stands once out, beside the closed door and clear of its swing, facing the car. */
    driverOut: (t) => { const w = toWorld(t, [C.wid / 2 + 0.55, 0, -0.85]); return { at: [w[0], w[2]], yaw: state(t).yaw - Math.PI / 2 }; },
    legs,
  };
}
export { WHEEL_AT, WB, BACK };
