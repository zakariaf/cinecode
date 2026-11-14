// Timing tools. Everything here is a pure function of time, so any frame can be
// computed on its own, in any order, in any process.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const smoother = (u) => { u = clamp(u); return u * u * u * (u * (u * 6 - 15) + 10); };
// 0 before a, 1 after b, eased between
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
export const lerpAngle = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;

// Seeded random numbers (never Math.random): hash an integer to 0..1.
export function rnd(n, seed = 1) {
  let h = (n | 0) * 374761393 + (seed | 0) * 668265263; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// A smooth curve through (t, v) points that never overshoots them, flat at both ends. The points are in time order;
// one at or before the time of the point before it replaces that point (two keys at one time made 0 / 0: NaN).
export function curve(points) {
  const P = []; for (const p of points) { while (P.length && p[0] <= P.at(-1)[0]) P.pop(); P.push(p); }
  const n = P.length, t = P.map((p) => p[0]), v = P.map((p) => p[1]);
  const d = []; for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (t[i + 1] - t[i]));
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0; while (x > t[i + 1]) i++;
    const h = t[i + 1] - t[i], u = (x - t[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * v[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * v[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

// A spring that chases a target: the thing that makes motion overlap, overshoot and
// settle. target is a pure function of time. The spring is stepped at a fixed rate
// from t = 0 and its states are remembered, so asking for any time, in any order,
// always gives the same answer.
//   f: how fast it follows (cycles per second); z: damping (1 = no overshoot, 0.4 = bouncy);
//   vmax: the fastest it may move (units a second), however far the target jumps
export function spring(target, { f = 2, z = 0.6, dt = 1 / 240, vmax = Infinity } = {}) {
  const xs = [target(0)], vs = [0];
  const w = 2 * Math.PI * f;
  const upTo = (n) => {
    for (let i = xs.length; i <= n; i++) {
      const x = xs[i - 1], v = vs[i - 1];
      const a = w * w * (target(i * dt) - x) - 2 * z * w * v;
      const nv = clamp(v + a * dt, -vmax, vmax);   // semi-implicit Euler: stable at this step for the ranges used
      vs.push(nv); xs.push(x + nv * dt);
    }
  };
  const at = (t) => {
    const s = Math.max(t, 0) / dt, i = Math.floor(s), u = s - i;
    upTo(i + 1);
    return xs[i] + (xs[i + 1] - xs[i]) * u;
  };
  at.velocity = (t) => { const s = Math.max(t, 0) / dt, i = Math.floor(s); upTo(i + 1); return vs[i] + (vs[i + 1] - vs[i]) * (s - i); };
  return at;
}
// Same, for a target that returns an array of numbers (a point): each number on its own spring, the target asked once
// a step for all of them (a look's target poses another actor: asked once per number, it was most of the cost of posing).
export function springVec(target, { f = 2, z = 0.6, dt = 1 / 240, vmax = Infinity } = {}) {
  const xs = [target(0)], vs = [xs[0].map(() => 0)];
  const w = 2 * Math.PI * f;
  const upTo = (n) => {
    for (let i = xs.length; i <= n; i++) {
      const x = xs[i - 1], v = vs[i - 1], T = target(i * dt), nx = [], nv = [];
      for (let k = 0; k < x.length; k++) { nv.push(clamp(v[k] + (w * w * (T[k] - x[k]) - 2 * z * w * v[k]) * dt, -vmax, vmax)); nx.push(x[k] + nv[k] * dt); }
      xs.push(nx); vs.push(nv);
    }
  };
  return (t) => {
    const s = Math.max(t, 0) / dt, i = Math.floor(s), u = s - i;
    upTo(i + 1);
    return xs[i].map((a, k) => a + (xs[i + 1][k] - a) * u);
  };
}

// Loose weights that follow their anchors late and bounce (a belly, a bun, a skirt, a tail). Each has a spring
// { f, z, drag }: f cycles per second, z damping, drag 0 for a weight carried along with the body (it lags only
// when the body speeds up or slows) to 1 for one that trails behind as if through air. anchors(t) gives every
// weight's anchor point [x, y, z] at time t. All are stepped together at a fixed rate from t = 0 and
// remembered, like spring(). Returns at(t) -> every weight's point.
export function followers(specs, anchors, dt = 1 / 120) {
  const n = specs.length * 3, xs = [], vs = [];
  let prev = null;
  const upTo = (k) => {
    for (let i = xs.length; i <= k; i++) {
      const A = anchors(i * dt).flat();
      if (i === 0) { xs.push(Float64Array.from(A)); vs.push(new Float64Array(n)); prev = A; continue; }
      const x = xs[i - 1], v = vs[i - 1], nx = new Float64Array(n), nv = new Float64Array(n);
      for (let q = 0; q < n; q++) {
        const { f, z, drag = 0 } = specs[(q / 3) | 0], w = 2 * Math.PI * f;
        nv[q] = v[q] + (w * w * (A[q] - x[q]) - 2 * z * w * (v[q] - (1 - drag) * (A[q] - prev[q]) / dt)) * dt;
        nx[q] = x[q] + nv[q] * dt;
      }
      xs.push(nx); vs.push(nv); prev = A;
    }
  };
  return (t) => {
    const s = Math.max(t, 0) / dt, i = Math.floor(s), u = s - i;
    upTo(i + 1);
    return specs.map((_, j) => [0, 1, 2].map((c) => xs[i][j * 3 + c] + (xs[i + 1][j * 3 + c] - xs[i][j * 3 + c]) * u));
  };
}

// Slow, smooth, seeded wandering between about -1 and 1 at about f cycles a second: three sine waves of seeded
// rates and phases. i picks the channel (a different i gives an unrelated wander). For idle life and variation.
export function wobble(t, i, seed = 1, f = 0.25) {
  let s = 0;
  for (let j = 0; j < 3; j++) {
    const k = i * 3 + j;
    s += Math.sin(2 * Math.PI * f * (0.7 + 0.6 * rnd(k, seed)) * (1 + 0.73 * j) * t + 6.283 * rnd(k + 500, seed)) / (1 + j);
  }
  return s / 1.83;
}

// The world of a scene: where every actor and thing is at any time, so actors can look at, follow or reach for
// each other. world.add(name, actor) takes a performer or critter (it has where(t) and headAt(t)); a thing is a
// function of time that returns a point (a ball: t => path.at(t).pos). Read only after the plans are laid.
export function createWorld() {
  const things = new Map();
  const get = (name) => things.get(name) ?? (() => { throw new Error(`world: nothing called "${name}" (there is: ${[...things.keys()].join(', ')})`); })();
  return {
    add(name, thing) { things.set(name, thing); return thing; },
    // the ground point [x, 0, z] of an actor, or a thing's point
    where: (name, t) => { const x = get(name); return typeof x === 'function' ? x(t) : x.where(t); },
    // the eyes of an actor, or a thing's point: what to look at
    head: (name, t) => { const x = get(name); return typeof x === 'function' ? x(t) : x.headAt(t); },
    // how far an actor's feet and legs reach from its ground point (0 for a thing)
    radius: (name) => get(name).radius ?? 0,
    names: () => [...things.keys()],
  };
}

// A limit with no corner: x itself up to 60 % of the limit L, then bending smoothly to approach L. A hard clamp
// on a joint angle stops it dead in one step (a pop); this one slows it down.
export function soft(x, L) {
  const a = 0.6 * L, m = Math.abs(x);
  return m <= a ? x : Math.sign(x) * (a + (L - a) * Math.tanh((m - a) / (L - a)));
}

// A way from `from` to `to` (floor marks [x, z]) round whoever in the world will be standing near the straight line
// as the mover passes: each is kept its radius, the mover's own (r) and 4 cm away. The line bows out smoothly to the
// nearer side and back (a bump that starts and ends along the line, so the first and last steps go straight); up to
// three bumps for three in the way. Someone standing on the mark itself is not gone round. self: the mover's name in
// the world; when(s): the time it will be s metres along. → { at(s) → [x, z], yaw(s) } for s from 0 to the straight
// distance.
export function detour(world, self, r, from, to, when) {
  const D = Math.hypot(to[0] - from[0], to[1] - from[1]), u = [(to[0] - from[0]) / D, (to[1] - from[1]) / D], n = [u[1], -u[0]];   // n: to the left
  const bumps = [], w = (s, c) => (s <= c ? smooth(s / c) : smooth((D - s) / (D - c)));
  const at = (s) => { let x = from[0] + u[0] * s, z = from[1] + u[1] * s; for (const b of bumps) { const k = b.lat * w(s, b.s); x += n[0] * k; z += n[1] * k; } return [x, z]; };
  const others = world ? world.names().filter((m) => m !== self && world.radius(m) > 0) : [];
  for (let it = 0; it < 3 && D > 0.3; it++) {
    let worst = null;
    for (const m of others) {
      const c = world.radius(m) + r + 0.04;
      for (let s = 0.1; s <= D - 0.1; s += 0.05) {
        const p = at(s), q = world.where(m, when(s)), d = Math.hypot(p[0] - q[0], p[1] - q[2]);
        if (d < c && (!worst || d - c < worst.gap)) worst = { gap: d - c, s, q, c };
      }
    }
    if (!worst) break;
    const p = at(worst.s), l = (worst.q[0] - p[0]) * n[0] + (worst.q[2] - p[1]) * n[1];
    bumps.push({ s: clamp(worst.s, 0.2 * D, 0.8 * D), lat: l >= 0 ? l - worst.c : l + worst.c });
  }
  const yaw = (s) => { const a = at(Math.max(0, s - 0.01)), b = at(Math.min(D, s + 0.01)); return Math.atan2(b[0] - a[0], b[1] - a[1]); };
  return { at, yaw, D };
}
