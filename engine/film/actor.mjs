// An actor's performance over a scene, as channels evaluated at any time t (seconds from film start):
// position (moves made of route / jump / fly legs), base pose (blended), gestures layered on top, face, head
// look (explicit looks + glances at speakers) and tilt (looking up / down), expression, talk (lip sync),
// visibility, opacity and sleep.
// Gait phase always comes from distance travelled / stride, so planted feet never slide.
// Riding: a rider's position is its carrier's riding point (rig.mount) at every instant, so it follows the
// carrier's walk bob, turns and wading sink; hops on and off are jump legs whose moving end tracks that point. A rider
// is visible only while its carrier is (it exits with it) and fades with it.
// Wading: a wade route carries a sink (world px) that grows with the distance travelled into the water.
// Eyelines: a look at an actor runs from this head to that head (an anchor or point: to the point), so it has a
// horizontal part (st.look) and a vertical one (st.tilt, the pitch of that line as a share of PITCH); "up" / "sky" /
// "down" only pitch the head and keep the horizontal target of the look before them.
// A turn (a face flip) squashes the drawing through a narrow card over about six frames, so it reads as a turn.
import { noise1 } from '../core/lib.mjs';
import { idle } from '../cast/index.mjs';
import { clamp, lerp, ease, rigPose, mixFor, contactKeys, rigSizes, hash32, mountPoint, profile as rigProfile } from './util.mjs';

const BLEND_IN = 0.22, BLEND_OUT = 0.28, LOOK_BLEND = 0.28;
// an eyeline's pitch: the angle (rad) that makes a full tilt, and the most a look at someone uses (the extremes stay
// for an explicit "up" / "down")
export const PITCH = 0.8, PITCH_MAX = 0.9;
// a turn: the squash's half-width (s) and its depth (the drawing's width at the flip = 1 − TURN_DEPTH)
export const TURN_HALF = 0.14, TURN_DEPTH = 0.7;
const VERTICAL = new Set(['up', 'sky', 'down']);
const frac = x => x - Math.floor(x);

// ───────────── positions ─────────────
// pos: { x, y, s, key, mode: 'ground'|'surface'|'perch'|'hollow'|'air'|'mount'|'off', anchor, clip, lift (units), surface,
//        sink (world px drawn below y, wading), waterY (world y of the waterline clip), carrier (id, riders) }
export function groundPos(S, x, y, k = 1) {
  return { x, y, s: S.scaleAt(x, y) * k, key: y, mode: 'ground', anchor: null, clip: null, lift: 0 };
}
export function anchorPos(S, name, k = 1) {
  const a = S.anchor(name);
  if (a.type === 'ground' || a.type === 'view') return { ...groundPos(S, a.x, a.y, k), anchor: name, face: a.face };
  const prop = a.prop ? S.props.find(p => p.id === a.prop) : null;
  const key = prop ? prop.y + 0.01 : a.depth;
  return { x: a.x, y: a.y, s: a.s * k, key, depth: a.depth, mode: a.type, anchor: name, clip: a.clip || null, lift: 0, face: a.face, topAt: a.topAt, surface: a.surface };
}

// Trapezoid speed profile: accelerate over `ta`, cruise at v, decelerate over `ta`. → { T, at(τ) → distance }
function profile(U, v, ta = 0.3, rampIn = true, rampOut = true) {
  if (U <= 1e-6) return { T: 0, at: () => 0 };
  const ra = rampIn ? ta : 0, rb = rampOut ? ta : 0;
  const cruise = U - v * (ra + rb) / 2;
  if (cruise >= 0) {                                    // the ramps cover v·r/2 each, the rest is cruising
    const Tc = cruise / v;
    return { T: ra + Tc + rb, at(τ) {
      τ = clamp(τ, 0, ra + Tc + rb);
      if (τ < ra) return (v * τ * τ) / (2 * ra);
      if (τ < ra + Tc) return (v * ra) / 2 + v * (τ - ra);
      const r = ra + Tc + rb - τ; return rb ? U - (v * r * r) / (2 * rb) : U - v * r;
    } };
  }
  // too short to reach cruise speed: scale the ramps down
  const k = Math.sqrt(U / (v * (ra + rb) / 2)), a2 = ra * k, b2 = rb * k, vp = v * k;
  return { T: a2 + b2, at(τ) {
    τ = clamp(τ, 0, a2 + b2);
    if (τ < a2) return (vp * τ * τ) / (2 * a2);
    const r = a2 + b2 - τ; return b2 ? U - (vp * r * r) / (2 * b2) : U - vp * r;
  } };
}

// A walk along a polyline on the ground. Samples carry the scale so distance can be measured in rig units
// (world length / scale): cadence = speed / stride stays constant while perspective changes the screen speed.
// wade: { depth (units, or null for 1.1 × rig height), height (rig units), sink0 (world px at the start) } lets the
// route cross water: inside a water polygon the actor sinks 0.6 px per px travelled from where it went in (or before
// where it comes out), up to depth × s.
export class RouteLeg {
  constructor(args) {
    const { S, pts, k, gait, speed, stride, phase0 = 0, rampIn = true, rampOut = true, face0 = 1, rig, cycleDur, wade = null } = args;
    this.type = 'route'; this.gait = gait; this.stride = stride; this.phase0 = phase0; this.rig = rig;
    this.args = args;                              // to rebuild the leg longer (an exit walking on out of frame)
    const X = [], Y = [], Sc = [], U = [], F = [];
    let u = 0, face = face0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 6));
      const dx = x1 - x0, dy = y1 - y0;
      if (Math.abs(dx) > 0.35 * Math.abs(dy) && Math.abs(dx) > 4) face = dx > 0 ? 1 : -1;
      for (let j = i ? 1 : 0; j <= n; j++) {
        const x = lerp(x0, x1, j / n), y = lerp(y0, y1, j / n), s = S.scaleAt(x, y) * k;
        if (X.length) u += Math.hypot(x - X[X.length - 1], y - Y[Y.length - 1]) / ((s + Sc[Sc.length - 1]) / 2);
        X.push(x); Y.push(y); Sc.push(s); U.push(u); F.push(face);
      }
    }
    if (!X.length) { const [x, y] = pts[0]; X.push(x); Y.push(y); Sc.push(S.scaleAt(x, y) * k); U.push(0); F.push(face0); }
    Object.assign(this, { X, Y, Sc, U, F, len: u });
    if (wade) this.sink = wadeSink(S, X, Y, Sc, wade);
    if (cycleDur) {           // hop-by-hop: whole jumps, the body moves only while airborne
      const n = Math.max(1, Math.round(u / stride)); this.stride = u / n; this.hops = n; this.cycleDur = cycleDur;
      this.T = n * cycleDur;
    } else {
      this.prof = profile(u, speed, Math.min(0.32, stride / speed * 0.6), rampIn, rampOut);
      this.T = this.prof.T;
    }
    this.face1 = F[F.length - 1];
  }
  uAt(τ) {
    if (this.hops) { const c = clamp(τ / this.cycleDur, 0, this.hops), i = Math.min(this.hops - 1, Math.floor(c)), f = c - i; return (i + ease(clamp((f - 0.27) / 0.5))) * this.stride; }
    return this.prof.at(τ);
  }
  phaseAt(τ) { return this.hops ? clamp(τ / this.cycleDur, 0, this.hops) : this.phase0 + this.uAt(τ) / this.stride; }
  at(τ) {
    const u = this.uAt(τ), U = this.U;
    let lo = 0, hi = U.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (U[m] <= u) lo = m; else hi = m; }
    const w = U[hi] > U[lo] ? clamp((u - U[lo]) / (U[hi] - U[lo])) : 0;
    const x = lerp(this.X[lo], this.X[hi], w), y = lerp(this.Y[lo], this.Y[hi], w), s = lerp(this.Sc[lo], this.Sc[hi], w);
    const p = { x, y, s, key: y, mode: 'ground', lift: 0, face: this.F[w < 0.5 ? lo : hi], phase: this.phaseAt(τ) };
    if (this.sink) { p.wade = true; p.sink = lerp(this.sink[lo], this.sink[hi], w); if (p.sink > 0.05) p.waterY = y; else p.sink = 0; }
    return p;
  }
  // time (from leg start) at which the gait reaches phase p (monotone search)
  timeOfPhase(p) {
    let a = 0, b = this.T;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (this.phaseAt(m) < p) a = m; else b = m; }
    return (a + b) / 2;
  }
  pose(τ, rig) {
    const ph = this.phaseAt(τ);
    if (this.hops) return rig.gestures.jump.at(frac(ph), rig.poses.stand);
    return rig.gaits[this.gait](frac(ph));
  }
  airborne(τ) { if (!this.hops) return false; const f = frac(this.phaseAt(τ)); return f > 0.27 && f < 0.78; }
}

// Sink along a wade route's samples (world px): 0.6 px per px from where the water was entered (or the starting sink)
// and to where it is left (none if the route ends in the water), capped at depth × s.
function wadeSink(S, X, Y, Sc, { depth = null, height = 40, sink0 = 0 }) {
  const n = X.length, D = new Float64Array(n), wet = X.map((x, i) => S.inWater(x, Y[i])), out = new Float64Array(n);
  for (let i = 1; i < n; i++) D[i] = D[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  const din = new Float64Array(n), dout = new Float64Array(n);
  // depth counts from the first wet sample (so dry ground never sinks); a route ending in the water stays down
  let enter = -Math.max(0, sink0) / 0.6;
  for (let i = 0; i < n; i++) { if (!wet[i]) enter = null; else { enter ??= D[i]; din[i] = D[i] - enter; } }
  let exit = Infinity;
  for (let i = n - 1; i >= 0; i--) { if (!wet[i]) exit = null; else { exit ??= D[i]; dout[i] = exit - D[i]; } }
  for (let i = 0; i < n; i++) if (wet[i]) out[i] = Math.min((depth ?? 1.1 * height) * Sc[i], 0.6 * Math.min(din[i], dout[i]));
  return out.some(v => v > 0) || sink0 > 0 ? out : null;
}

// A jump from one place to another (onto a stump, across stepping stones, down from a ledge). Afn / Bfn (τ → pos)
// make an end move with something (a carrier's riding point); A / B are then their snapshots, used for the timing.
export class JumpLeg {
  constructor({ A, B, rig, sz, Afn = null, Bfn = null }) {
    this.type = 'jump'; this.A = A; this.B = B; this.Afn = Afn; this.Bfn = Bfn;
    const g = rig.gestures?.jump, dist = Math.hypot(B.x - A.x, B.y - A.y), hpx = sz.height * Math.max(A.s, B.s);
    this.T = (g?.dur ?? 0.8) * clamp(Math.sqrt(dist / Math.max(1, hpx * 0.9)), 0.85, 1.7);
    this.rise = A.y - B.y;                                // > 0 when jumping up
    this.arc = Math.max(0, this.rise) * 0.3 + Math.max(0, -this.rise) * 0.08 + dist * 0.06;
    this.face1 = Math.abs(B.x - A.x) > 2 ? Math.sign(B.x - A.x) : (A.face || 1);
    this.g = g;
  }
  w(τ) { return ease(clamp((τ / this.T - 0.27) / 0.51)); }
  at(τ) {
    const A = this.Afn ? this.Afn(τ) : this.A, B = this.Bfn ? this.Bfn(τ) : this.B, w = this.w(τ), u = τ / this.T;
    const air = u > 0.27 && u < 0.78, landed = u >= 0.78, P = landed ? B : A;
    const x = lerp(A.x, B.x, w), y = lerp(A.y, B.y, w), s = lerp(A.s, B.s, w);
    const alt = this.arc * Math.sin(Math.PI * w);
    // onto / off a carrier: behind it on the way up from behind, in front of it on the way down
    const key = air && (this.Afn || this.Bfn) ? (w < 0.5 ? A.key : B.key) : landed ? B.key : A.key;
    const p = { x, y, s, key, mode: air ? 'air' : P.mode, anchor: P.anchor, clip: landed ? B.clip : null, lift: alt / s, face: this.face1, airborne: air, surface: P.surface, ground: y };
    if (!air && P.mode === 'mount') Object.assign(p, { carrier: P.carrier, ground: P.ground, waterY: P.waterY });
    return p;
  }
  pose(τ, rig) {
    const u = clamp(τ / this.T), base = rig.poses.stand;
    if (this.g) return this.g.at(u, base);
    const p = { ...base }; p.lift = (base.lift || 0) + 10 * Math.sin(Math.PI * clamp((u - 0.27) / 0.51)); return p;
  }
  airborne(τ) { const u = τ / this.T; return u > 0.27 && u < 0.78; }
}

// Flight: the ground track goes from A's depth line to B's; altitude = height above that track.
export class FlyLeg {
  constructor({ A, B, rig, sz, speed }) {
    this.type = 'fly'; this.A = A; this.B = B; this.rig = rig;
    this.gA = A.mode === 'ground' ? A.y : A.depth ?? A.key; this.gB = B.mode === 'ground' ? B.y : B.depth ?? B.key;
    this.altA = this.gA - A.y + (A.lift || 0) * A.s; this.altB = this.gB - B.y;
    const d = Math.hypot(B.x - A.x, this.gB - this.gA) + Math.abs(this.altB - this.altA) * 0.5;
    this.arc = clamp(d * 0.22, 30, 240) * (A.s + B.s) / 2 / 1.3;
    const v = speed * (A.s + B.s) / 2;
    this.T = d / Math.max(1, v) + 0.7;
    this.d = d; this.stride = (rig.stride?.fly || 60) * (A.s + B.s) / 2;
    this.face1 = Math.abs(B.x - A.x) > 2 ? Math.sign(B.x - A.x) : (A.face || 1);
    this.gait = rig.gaits?.fly ? 'fly' : rig.gaits?.glide ? 'glide' : null;
  }
  u(τ) { return ease(clamp(τ / this.T)); }
  at(τ) {
    const u = this.u(τ), A = this.A, B = this.B;
    const x = lerp(A.x, B.x, u), gy = lerp(this.gA, this.gB, u), s = lerp(A.s, B.s, u);
    const alt = lerp(this.altA, this.altB, u) + this.arc * Math.sin(Math.PI * u);
    const done = τ >= this.T;
    if (done) return { ...B, face: this.face1, airborne: false };
    return { x, y: gy, s, key: gy, mode: 'air', anchor: null, clip: null, lift: alt / s, face: this.face1, airborne: true, ground: gy };
  }
  pose(τ, rig) {
    const u = clamp(τ / this.T), ph = (u * this.d) / this.stride;
    const fly = this.gait ? rig.gaits[this.gait](frac(ph)) : rig.poses.stand;
    const glide = rig.gaits?.glide ? rig.gaits.glide(frac(ph)) : fly;
    const mix = mixFor(rig);
    let p = u > 0.72 ? mix(fly, glide, ease((u - 0.72) / 0.16)) : fly;
    // the flight gaits carry their own lift (wing clearance); fade it out as the bird lands
    if (u > 0.9) { const end = this.B.mode === 'perch' ? (rigPose(rig, 'perch')?.pose || rig.poses.stand) : rig.poses.stand; p = mix(p, end, ease((u - 0.9) / 0.1)); }
    return p;
  }
  airborne() { return true; }
}

// ───────────── the actor ─────────────
export class Actor {
  constructor({ id, rig, castDef = {}, S, sceneActors, seed }) {
    this.id = id; this.rig = rig; this.S = S; this.k = castDef.scale || 1; this.name = castDef.name || id;
    this.params0 = { ...(castDef.params || {}) };
    this.sz = rigSizes(rig, this.params0);
    this.seed = seed ?? hash32(id);
    this.mix = mixFor(rig);
    this.others = sceneActors;                   // Map id → Actor (for looks and relative targets)
    this.moves = []; this.poseEv = []; this.gest = []; this.exprEv = []; this.exprTmp = []; this.lookEv = [];
    this.glances = []; this.faceEv = []; this.talk = []; this.visEv = []; this.alphaEv = []; this.sleepEv = [];
    this.paramEv = []; this.blinks = []; this.place0 = null;
  }
  // ── setup ──
  init(t, pos, face, poseName, { visible = true, expr = 'neutral', mount = null } = {}) {
    this.place0 = { t, pos, mount };
    this.faceEv.push({ t: -1e9, face, src: 'init' });
    const rp = rigPose(this.rig, poseName) || rigPose(this.rig, 'stand');
    this.poseEv.push({ t: -1e9, name: rp.name, pose: rp.pose, blend: 0, src: 'init' });
    this.exprEv.push({ t: -1e9, expr });
    this.visEv.push({ t: -1e9, visible });
    this.sleepEv.push({ t: -1e9, asleep: rp.name === 'sleep' });
  }
  // ── position ──
  moveAt(t) { let m = null; for (const mv of this.moves) { if (mv.t0 <= t) m = mv; else break; } return m; }
  end(mv) { return mv.cut ?? mv.t1; }
  legAt(mv, t) {
    let τ = t - mv.t0;
    for (const L of mv.legs) { if (τ <= L.T || L === mv.legs[mv.legs.length - 1]) return { L, τ: Math.min(τ, L.T) }; τ -= L.T; }
    return null;
  }
  posAt(t) {
    const mv = this.moveAt(t);
    if (!mv) return this.place0.mount ? this.place0.mount.mountAt(t, this) : { ...this.place0.pos };
    if (mv.mount && (!mv.legs.length || t >= this.end(mv))) return mv.mount.mountAt(t, this);
    if (mv.place) return { ...mv.place };
    const tt = Math.min(t, this.end(mv)), r = this.legAt(mv, tt);
    const p = r.L.at(r.τ);
    if (t >= mv.t1 && mv.final) return { ...mv.final };
    return p;
  }
  moving(t) { const mv = this.moveAt(t); return !!(mv && !mv.place && t < this.end(mv)); }
  // The actor this one is riding at t (an Actor), or null.
  carrierAt(t) {
    const mv = this.moveAt(t);
    if (!mv) return this.place0?.mount ?? null;
    return mv.mount && (!mv.legs.length || t >= this.end(mv)) ? mv.mount : null;
  }
  // As a carrier: the riding point at t (rig.mount mirrored by face, squashed with a turn, lifted with a hop, sunk
  // with a wade) as a position for `rider`: its scale is the ground scale here times the rider's cast scale.
  mountAt(t, rider = null) {
    let m = this._mount;
    if (!m || m.t !== t) {
      if (this._mounting) throw new Error(`${this.id}: riding loop (an actor cannot carry its own carrier)`);
      this._mounting = true;
      try {
        const pos = this.posAt(t), pose = this.poseAt(t), face = this.faceAt(t), q = this.squashAt(t), sink = pos.sink || 0;
        const [ux, uy] = mountPoint(this.rig, pose, this.paramsAt(t));
        m = this._mount = { t, x: pos.x + face * ux * q * pos.s, y: pos.y + sink + (uy - (pos.lift || 0)) * pos.s, gs: pos.s / this.k, key: pos.key + 0.01, ground: pos.ground ?? pos.y, waterY: sink > 0 ? pos.y : pos.waterY ?? null, face };
      } finally { this._mounting = false; }
    }
    return { x: m.x, y: m.y, s: m.gs * (rider?.k ?? 1), key: m.key, mode: 'mount', carrier: this.id, anchor: null, clip: null, lift: 0, ground: m.ground, waterY: m.waterY, surface: 'shell', carrierFace: m.face };
  }
  addMove(mv) {
    // a new move interrupts any move still in progress; drop the interrupted move's end events
    for (const m of this.moves) if (m.t0 <= mv.t0 && this.end(m) > mv.t0) {
      m.cut = mv.t0;
      const keep = e => !(e.src === m && e.t > mv.t0 - 1e-9);
      this.poseEv = this.poseEv.filter(keep); this.faceEv = this.faceEv.filter(keep); this.visEv = this.visEv.filter(keep);
    }
    this.moves.push(mv); this.moves.sort((a, b) => a.t0 - b.t0);
  }
  // ── face ──
  faceAt(t) {
    const mv = this.moveAt(t);
    if (mv && !mv.place && t < this.end(mv)) {
      const r = this.legAt(mv, t);
      // an explicit turn during a move only counts once the move is over
      return r.L.at(r.τ).face ?? 1;
    }
    let f = 1; for (const e of this.faceEv) if (e.t <= t) f = e.face;
    return f;
  }
  // horizontal squash around a turn: the drawing narrows to a sliver at the flip and opens out mirrored (a card turn,
  // three frames each side at 24 fps), so a turn reads as a turn even in a close-up instead of a one-frame mirror
  squashAt(t) {
    let k = 1;
    for (const e of this.faceEv) if (e.flip && Math.abs(t - e.t) < TURN_HALF) k = Math.min(k, 1 - TURN_DEPTH * Math.cos((Math.PI / 2) * ((t - e.t) / TURN_HALF)));
    return k;
  }
  // ── poses ──
  basePoseAt(t) {
    let i = -1; for (let j = 0; j < this.poseEv.length; j++) if (this.poseEv[j].t <= t) i = j;
    if (i < 0) return this.poseEv[0].pose;
    const ev = this.poseEv[i];
    if (ev.blend > 0 && t < ev.t + ev.blend && i > 0) {
      if (!ev.from) ev.from = this.basePoseAt(ev.t - 1e-6);
      return this.mix(ev.from, ev.pose, ease((t - ev.t) / ev.blend));
    }
    return ev.pose;
  }
  basePoseName(t) { let n = this.poseEv[0].name; for (const e of this.poseEv) if (e.t <= t) n = e.name; return n; }
  setPose(t, name, blend, src) {
    const rp = rigPose(this.rig, name); if (!rp) return false;
    this.poseEv.push({ t, name: rp.name, pose: rp.pose, blend, src });
    this.poseEv.sort((a, b) => a.t - b.t);
    for (const e of this.poseEv) if (e.t > t) e.from = null;
    return true;
  }
  legPose(mv, t) {
    const r = this.legAt(mv, t), i = mv.legs.indexOf(r.L);
    let p = r.L.pose(r.τ, this.rig);
    if (i > 0 && r.τ < 0.16) { const prev = mv.legs[i - 1]; p = this.mix(prev.pose(prev.T, this.rig), p, ease(r.τ / 0.16)); }
    return p;
  }
  poseAt(t) {
    const mv = this.moveAt(t);
    let p = this.basePoseAt(t), moving = false, gait = null;
    if (mv && !mv.place && mv.legs.length) {
      const e = this.end(mv);
      if (t < e) {
        moving = true;
        p = this.legPose(mv, t);
        const r = this.legAt(mv, t); gait = r.L.type === 'route' && !r.L.hops ? r.L.gait : null;
        if (t - mv.t0 < BLEND_IN) p = this.mix(this.basePoseAt(mv.t0), p, ease((t - mv.t0) / BLEND_IN));
      } else if (t - e < BLEND_OUT && !mv.noBlendOut) {
        const last = this.legPose(mv, e);
        p = this.mix(last, p, ease((t - e) / BLEND_OUT));
      }
    }
    const g = this.gest.find(G => t >= G.t0 && t < G.t1);
    if (g) {
      const G = this.rig.gestures[g.name], u = (t - g.t0) / (g.t1 - g.t0);
      const q = G.at(clamp(u), p);
      if (moving && gait) { const keep = contactKeys(this.rig, gait); for (const k of keep) if (k in p) q[k] = p[k]; }
      p = q;
    }
    return p;
  }
  // ── expression, talk, look ──
  exprAt(t) {
    if (this.asleep(t)) return 'sleepy';
    for (const e of this.exprTmp) if (t >= e.t0 && t < e.t1) return e.expr;
    let x = 'neutral'; for (const e of this.exprEv) if (e.t <= t) x = e.expr;
    return x;
  }
  asleep(t) { let a = false; for (const e of this.sleepEv) if (e.t <= t) a = e.asleep; return a; }
  talkAt(t, fps) {
    for (const L of this.talk) {
      if (t < L.t0 || t >= L.t1) continue;
      const τ = t - L.t0;
      if (L.env && L.env.length) {
        const f = τ * fps, i = Math.floor(f), w = f - i;
        return clamp(lerp(L.env[Math.min(i, L.env.length - 1)] ?? 0, L.env[Math.min(i + 1, L.env.length - 1)] ?? 0, w));
      }
      // no voice yet: a seeded syllable flap (~4.3 per second) with word gaps, closing at the end
      if (!L.nz) { L.nz = noise1(L.seed % 100000); L.nz2 = noise1((L.seed >>> 8) % 100000 + 7); }
      const syl = Math.max(0, Math.sin(Math.PI * 2 * (4.3 * τ + L.nz2(τ * 1.3) * 0.8)));
      const gate = L.nz(τ * 2.2) > 0.18 ? 1 : 0.15;
      return clamp(Math.pow(syl, 0.7) * (0.35 + 0.6 * L.nz(τ * 5.1)) * gate * clamp((L.t1 - t) / 0.08) * clamp(τ / 0.05));
    }
    return 0;
  }
  speaking(t) { return this.talk.some(L => t >= L.t0 && t < L.t1); }
  // The head's world position at t (base pose, facing, hop lift and wading sink): where eyelines start and end.
  headAt(t) {
    const pos = this.posAt(t), h = rigProfile(this.rig, this.basePoseName(t), this.paramsAt(t)).head;
    return [pos.x + this.faceAt(t) * h[0] * pos.s, pos.y + (pos.sink || 0) + (h[1] - (pos.lift || 0)) * pos.s];
  }
  // What a look target is at t: another actor's head, or a point ({ x, y }); null for keywords and unknown ids.
  lookPoint(target, t) {
    if (target && typeof target === 'object') return Number.isFinite(target.x) ? [target.x, Number.isFinite(target.y) ? target.y : null] : null;
    const o = typeof target === 'string' ? this.others?.get(target) : null;
    return o && o !== this && o.place0 ? o.headAt(t) : null;
  }
  lookValue(target, t, pos) {
    if (!target || target === 'none' || target === 'camera') return 0;
    if (target === 'left') return -0.7;
    if (target === 'right') return 0.7;
    if (VERTICAL.has(target)) return 0;
    const p = this.lookPoint(target, t); if (!p) return 0;
    // head to head for an actor (a rider looking down at its carrier's face has the same contact x)
    const dx = p[0] - (typeof target === 'object' ? pos.x : this.headAt(t)[0]);
    return clamp(0.8 * Math.tanh(dx / (90 * pos.s)), -0.85, 0.85);
  }
  // Head pitch toward a target: "up" / "sky" +1, "down" −1, an actor or a point the angle of the line from this head
  // to it (± PITCH_MAX at most), other keywords 0.
  pitchValue(target, t) {
    if (target === 'up' || target === 'sky') return 1;
    if (target === 'down') return -1;
    const p = this.lookPoint(target, t); if (!p || p[1] == null) return 0;
    const [hx, hy] = this.headAt(t);
    return clamp(Math.atan2(hy - p[1], Math.abs(p[0] - hx) + 1e-6) / PITCH, -PITCH_MAX, PITCH_MAX);
  }
  // The horizontal target of look i: its own, or for "up" / "sky" / "down" that of the look before it.
  hTarget(i) {
    for (let j = i; j >= 0; j--) if (!VERTICAL.has(this.lookEv[j].target)) return this.lookEv[j].target;
    return null;
  }
  lookTargetAt(t) {
    let ev = null; for (const e of this.lookEv) if (e.t <= t) ev = e;
    const gl = this.glances.find(g => t >= g.t0 && t < g.t1 && !(ev && ev.t > g.t0));
    return { ev, gl };
  }
  lookAt(t, pos) {
    if (this.asleep(t)) return 0;
    const val = (tgt, tt) => this.lookValue(tgt, tt, pos);
    // persistent target with an eased change (slow lookers take rig.lookTime)
    let i = -1; for (let j = 0; j < this.lookEv.length; j++) if (this.lookEv[j].t <= t) i = j;
    let base = 0;
    if (i >= 0) {
      const e = this.lookEv[i], prev = i > 0 ? this.hTarget(i - 1) : null;
      const u = ease((t - e.t) / (this.rig.lookTime ?? LOOK_BLEND));
      base = lerp(val(prev, t), val(this.hTarget(i), t), u);
    }
    // glances at a speaker (ease in and out) unless an explicit look came later
    for (const g of this.glances) {
      if (t < g.t0 || t >= g.t1 + LOOK_BLEND) continue;
      if (i >= 0 && this.lookEv[i].t > g.t0) continue;
      const w = Math.min(ease((t - g.t0) / LOOK_BLEND), 1 - ease((t - g.t1) / LOOK_BLEND));
      base = lerp(base, val(g.target, t), w);
    }
    return base;
  }
  // Head pitch (pitchValue of the look target); each change blends from where the head was then over rig.lookTime
  // (default 0.3 s), and glances at a speaker pitch toward them the same way (glances = false: the explicit looks only).
  tiltAt(t, glances = true) {
    if (this.asleep(t)) return 0;
    const T = this.rig.lookTime ?? 0.3, ev = this.lookEv;
    const chain = (i, tt) => {
      if (i < 0) return 0;
      const e = ev[i], u = ease((tt - e.t) / T), to = this.pitchValue(e.target, tt);
      return u >= 1 ? to : lerp(chain(i - 1, e.t), to, u);
    };
    let i = -1; for (let j = 0; j < ev.length; j++) if (ev[j].t <= t) i = j;
    let v = chain(i, t);
    if (glances) for (const g of this.glances) {
      if (t < g.t0 || t >= g.t1 + T) continue;
      if (i >= 0 && ev[i].t > g.t0) continue;
      const w = Math.min(ease((t - g.t0) / T), 1 - ease((t - g.t1) / T));
      v = lerp(v, this.pitchValue(g.target, t), w);
    }
    return v;
  }
  // A rider is seen only while its carrier is (it leaves with a carrier that exits, and comes back with it).
  visibleAt(t) {
    let v = true; for (const e of this.visEv) if (e.t <= t) v = e.visible;
    const C = v ? this.carrierAt(t) : null;
    return C ? C.visibleAt(t) : v;
  }
  // A rider fades with its carrier.
  alphaAt(t) {
    let a = 1;
    for (const e of this.alphaEv) { if (t < e.t0) break; a = t >= e.t1 ? e.to : lerp(e.from, e.to, ease((t - e.t0) / (e.t1 - e.t0 || 1e-6))); }
    const C = this.carrierAt(t);
    return C ? a * C.alphaAt(t) : a;
  }
  paramsAt(t) { let p = this.params0; for (const e of this.paramEv) if (e.t <= t) p = { ...p, ...e.params }; return p; }
  blinkAt(t, idleBlink) {
    let b = idleBlink;
    for (const e of this.blinks) { const u = (t - e) / 0.16; if (u >= 0 && u <= 1) b = Math.max(b, Math.sin(Math.PI * u)); }
    return b;
  }
  actionAt(t) {
    const mv = this.moveAt(t);
    if (mv && !mv.place && t < this.end(mv)) return mv.kind;
    const g = this.gest.find(G => t >= G.t0 && t < G.t1); if (g) return `gesture:${g.name}`;
    if (this.speaking(t)) return 'say';
    if (this.asleep(t)) return 'sleep';
    return 'idle';
  }
  // ── the full draw state ──
  state(t, fps = 24) {
    const pos = this.posAt(t), face = this.faceAt(t), pose = this.poseAt(t), asleep = this.asleep(t);
    const id = idle(this.rig, asleep ? t * 0.55 : t, this.seed);
    const params = this.paramsAt(t), visible = this.visibleAt(t) && pos.mode !== 'off';
    const lift = (pos.lift || 0), sink = pos.sink || 0;
    const st = {
      pose, expr: this.exprAt(t), talk: this.talkAt(t, fps), blink: asleep ? 0 : this.blinkAt(t, id.blink), breath: id.breath,
      look: this.lookAt(t, pos), tilt: this.tiltAt(t), lift, params, t,
      shadow: !(pos.mode === 'perch' || pos.mode === 'hollow' || pos.mode === 'air' || pos.mode === 'mount' || sink > 0),
    };
    const mv = this.moveAt(t), r = mv && !mv.place && t < this.end(mv) ? this.legAt(mv, t) : null;
    const airborne = !!(pos.airborne || (r && r.L.airborne(r.τ)) || (pose.lift || 0) > 1.5);
    return {
      id: this.id, rig: this.rig.kind, R: this.rig, x: pos.x, y: pos.y, s: pos.s, face, st, visible, key: pos.key,
      perch: pos.mode === 'perch' || pos.mode === 'hollow' ? pos.anchor : null, mode: pos.mode, anchor: pos.anchor, clip: pos.clip,
      airborne, action: this.actionAt(t), asleep, alpha: this.alphaAt(t), squash: this.squashAt(t), ground: pos.ground ?? null,
      scale: this.k, speaking: this.speaking(t), sink, waterY: pos.waterY ?? null, wade: !!pos.wade, carrier: pos.carrier ?? null,
    };
  }
}
