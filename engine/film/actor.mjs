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
// "down" only pitch the head (up: all the way; sky: SKY, a moderate look up; down: all the way) and keep the horizontal
// target of the look before them; a look beat's own tilt sets the pitch outright. An actor keeps its last look until
// a beat changes it: a glance at a speaker turns the head for the line and then back to the explicit look in force, or,
// with none, stays on the speaker (listening never resets the head); an explicit look eases from wherever the head is.
// Gestures layer in the order they start, each on the pose under it (an earlier gesture still running included), and
// one that doesn't start or end on that pose is eased in and out over GEST_MIN..GEST_MAX s (longer for a bigger move);
// a one-way gesture (its key drawings end on its last frame, keys include 1: the squirrel's dropped acorn) ends as the
// rig drew it.
// Expressions hold until a beat changes them, except a line's reaction (REACTIONS: a take, not a mood), which lasts the
// line and REACT_HOLD s after it (or to the cut, if that comes first) and then gives way to the expression under it. A
// change (except at a cut) happens behind a quick blink, and talk carries the mouth's openness across it (closing after
// the switch, opening before it), so the face never pops; a pose face hint crossing 0.5 (FACE_HINTS: a laugh's closed
// eyes, a gasp) switches the face too, so it gets the same blink. Changes whose blinks would overlap share one.
// A turn (a face flip) squashes the drawing through a narrow card over about six frames, so it reads as a turn.
// Slopes: on a set whose ground has a profile (S.groundAt: ridge / path sets like the hill; or a set whose def says
// laneSlope: true, its lane), a grounded actor's drawing is pitched about its contact point to the angle of the ground
// under its body (the chord from the back to the front of its footprint, width × s), clamped to ±SLOPE_MAX and eased
// over SLOPE_EASE s (a landing or a hop off a carrier settles instead of snapping; a place (a teleport) and an entrance
// come in already pitched); perched, surface, hollow and airborne actors ease back to level. Upright rigs (UPRIGHT
// kinds, or rig.upright === true) stay vertical; rig.upright === false makes any rig follow. A rider takes its
// carrier's pitch, and the riding point turns with the carrier. Flat ground gives exactly 0. `slope` (the ground's own
// angle under the actor, upright or not) lays shadows on the slope.
// Hovering: a flier can end a flight (or be placed) in the air; it holds there flapping, its feet at the hover's height
// with a gentle bob, and talks, gestures and is framed there; its next move flies on (see "hovering" below).
import { noise1 } from '../core/lib.mjs';
import { idle, FACES } from '../cast/index.mjs';
import { clamp, lerp, ease, rigPose, mixFor, contactKeys, rigSizes, hash32, mountPoint, profile as rigProfile, probe } from './util.mjs';

const BLEND_IN = 0.22, BLEND_OUT = 0.28, LOOK_BLEND = 0.28;
// an eyeline's pitch: the angle (rad) that makes a full tilt, and the most a look at someone uses (the extremes stay
// for an explicit "up" / "down"); "sky": a moderate look up (about 16° on the eyeline's scale, where a comet or the
// stars low over the land are), not the full tilt of "up"
export const PITCH = 0.8, PITCH_MAX = 0.9, SKY = 0.35;
// gestures: the shortest and longest ease (s) the actor gives a gesture that jumps away from the pose under it, the
// move (in rig heights) that takes the longest, and the least move (rig heights) that counts as one
export const GEST_MIN = 0.15, GEST_MAX = 0.3;
const GEST_FAR = 0.3, GEST_STILL = 0.004;
// an expression change: the blink that hides it (s: closing before the change, shut either side of it, opening after)
// and the time the mouth takes to ease to the new face's openness (talk carries it)
const SWAP_CLOSE = 0.0625, SWAP_HOLD = 0.021, SWAP_OPEN = 0.1, SWAP_MOUTH = 0.125;
// a line's reaction: an expression that is a take, not a mood; it lasts the line and REACT_HOLD s after it
export const REACTIONS = new Set(['surprised', 'laugh', 'laughing', 'scared']), REACT_HOLD = 0.4;
// pose face hints a rig switches the face on at 0.5 (rig.mjs faceOf: eh, closed laughing eyes; the human: laugh, gasp,
// joy), so a gesture or pose blend crossing 0.5 changes the face
const FACE_HINTS = ['eh', 'laugh', 'gasp', 'joy'];
// how open each expression's mouth is (the shared face table; the human's "laughing" is the table's "laugh")
const mouthOpen = e => FACES[e]?.open ?? FACES[{ laughing: 'laugh' }[e]]?.open ?? 0;
// the blink over an expression change, d s from it: shut from −SWAP_HOLD to +SWAP_HOLD, eased either side
function swapBlink(d) {
  if (d <= -SWAP_CLOSE || d >= SWAP_OPEN) return 0;
  if (Math.abs(d) <= SWAP_HOLD) return 1;
  return d < 0 ? ease((d + SWAP_CLOSE) / (SWAP_CLOSE - SWAP_HOLD)) : 1 - ease((d - SWAP_HOLD) / (SWAP_OPEN - SWAP_HOLD));
}
// the index of the last entry of a list sorted by t at or before t (−1 if none)
function lastAt(list, t) { let i = -1; for (let j = 0; j < list.length; j++) if (list[j].t <= t) i = j; else break; return i; }
// a turn: the squash's half-width (s) and its depth (the drawing's width at the flip = 1 − TURN_DEPTH)
export const TURN_HALF = 0.14, TURN_DEPTH = 0.7;
const VERTICAL = new Set(['up', 'sky', 'down']);
const frac = x => x - Math.floor(x);

// ───────────── slopes ─────────────
// the steepest a body is pitched (rad), the time (s) a change of pitch takes, and the rigs that stand upright on a slope
export const SLOPE_MAX = (28 * Math.PI) / 180, SLOPE_EASE = 0.2;
export const UPRIGHT = new Set(['human', 'owl', 'songbird', 'butterfly']);
export const followsSlope = rig => rig.upright === false || (rig.upright !== true && !UPRIGHT.has(rig.kind));
// The ground profile of a set (x → ground y), or null for flat ground (a perspective plane, where y is depth).
export function groundLine(S) {
  if (typeof S?.groundAt === 'function' && S.groundAt(S.refX ?? 0) != null) return S.groundAt;
  return S?.def?.laneSlope === true && typeof S.laneAt === 'function' ? S.laneAt : null;
}
// The angle (rad, screen: + = falling to the right) of the ground under a body of half-length hw (world px) at x: the
// chord from its back to its front, clamped to ±SLOPE_MAX. Exactly 0 on flat ground.
export function slopeAt(S, x, hw) {
  const g = groundLine(S); if (!g || !(hw > 0)) return 0;
  const a = g(x - hw), b = g(x + hw);
  return a == null || b == null || a === b ? 0 : clamp(Math.atan2(b - a, 2 * hw), -SLOPE_MAX, SLOPE_MAX);
}
const PITCH_SAMPLES = 8;

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
    // (from a hover, the jump starts at the hover's height)
    const alt = this.arc * Math.sin(Math.PI * w) + (1 - w) * (A.lift || 0) * A.s;
    // onto / off a carrier: behind it on the way up from behind, in front of it on the way down
    const key = air && (this.Afn || this.Bfn) ? (w < 0.5 ? A.key : B.key) : landed ? B.key : A.key;
    const p = { x, y, s, key, mode: air ? 'air' : P.mode, anchor: P.anchor, clip: landed ? B.clip : null, lift: alt / s, face: this.face1, airborne: air || (!landed && A.hover != null), surface: P.surface, ground: y };
    if (air) p.jump = { A, B, w };                        // (an airborne body turns from its take-off pitch to its landing's)
    if (!air && P.mode === 'mount') Object.assign(p, { carrier: P.carrier, ground: P.ground, waterY: P.waterY, slope: P.slope });
    return p;
  }
  pose(τ, rig) {
    const u = clamp(τ / this.T), base = rig.poses.stand;
    if (this.g) return this.g.at(u, base);
    const p = { ...base }; p.lift = (base.lift || 0) + 10 * Math.sin(Math.PI * clamp((u - 0.27) / 0.51)); return p;
  }
  airborne(τ) { const u = τ / this.T; return u > 0.27 && u < 0.78; }
}

// Flight: the ground track goes from A's depth line to B's; altitude = height above that track (a place's own lift
// counts: a flight may start or end hovering). A flight that ends hovering (B.hover) flaps on time all the way and
// settles into the hover instead of gliding down to land.
export class FlyLeg {
  constructor({ A, B, rig, sz, speed }) {
    this.type = 'fly'; this.A = A; this.B = B; this.rig = rig;
    this.gA = A.mode === 'ground' ? A.y : A.depth ?? A.key; this.gB = B.mode === 'ground' ? B.y : B.depth ?? B.key;
    this.altA = this.gA - A.y + (A.lift || 0) * A.s; this.altB = this.gB - B.y + (B.lift || 0) * B.s;
    const d = Math.hypot(B.x - A.x, this.gB - this.gA) + Math.abs(this.altB - this.altA) * 0.5;
    this.arc = clamp(d * 0.22, 30, 240) * (A.s + B.s) / 2 / 1.3;
    // into a hover the arc is a gentle swoop, never a climb far above where it stops
    if (B.hover != null) this.arc = Math.min(this.arc, d * 0.12);
    const v = speed * (A.s + B.s) / 2;
    this.T = d / Math.max(1, v) + 0.7;
    this.d = d; this.stride = (rig.stride?.fly || 60) * (A.s + B.s) / 2;
    this.rate = flapRate(rig, sz);
    this.face1 = Math.abs(B.x - A.x) > 2 ? Math.sign(B.x - A.x) : (A.face || 1);
    this.gait = rig.gaits?.fly ? 'fly' : rig.gaits?.glide ? 'glide' : null;
  }
  u(τ) { return ease(clamp(τ / this.T)); }
  at(τ) {
    const u = this.u(τ), A = this.A, B = this.B;
    const x = lerp(A.x, B.x, u), gy = lerp(this.gA, this.gB, u), s = lerp(A.s, B.s, u);
    const alt = lerp(this.altA, this.altB, u) + this.arc * Math.sin(Math.PI * u);
    const done = τ >= this.T - 1e-9;              // (a move's end, t1 − t0, may come back a hair short of T)
    if (done) return { ...B, face: this.face1, airborne: B.hover != null };
    return { x, y: gy, s, key: gy, mode: 'air', anchor: null, clip: null, lift: alt / s, face: this.face1, airborne: true, ground: gy };
  }
  pose(τ, rig) {
    // into a hover: flapping on time, the gait's wing-clearance lift fading out as it settles (hoverPose)
    if (this.B.hover != null && rig.gaits?.fly) return hoverPose(rig, τ * this.rate, ease(clamp((τ / this.T - 0.7) / 0.3)));
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

// ───────────── hovering ─────────────
// A flier can hold still in the air (a place with "height": pos.hover is the lift it holds, in units of its scale;
// y stays the ground line under it, like a flight). It flaps its fly gait on time at flapRate (the cadence of its
// flight: fly speed / fly stride); the lift the gait carries is centred on the hover point (its mean taken out, so the
// feet hover where the place says) and calmed to HOVER_FLUTTER of its swing per beat, and the whole bird bobs gently:
// HOVER_BOB × its height, a slow seeded swell, eased in over HOVER_EASE s after it arrives.
export const HOVER_BOB = 0.04, HOVER_FLUTTER = 0.3, HOVER_EASE = 0.8;
export const canHover = rig => !!(rig?.flies && rig.gaits?.fly);
export const flapRate = (rig, sz = rig) => (sz.speeds?.fly ?? rig.speeds?.fly ?? 150) / (sz.stride?.fly || rig.stride?.fly || 60);
const MEAN_LIFT = new WeakMap();
function meanFlyLift(rig) {
  if (!MEAN_LIFT.has(rig)) { let m = 0; for (let i = 0; i < 16; i++) m += rig.gaits.fly(i / 16).lift || 0; MEAN_LIFT.set(rig, m / 16); }
  return MEAN_LIFT.get(rig);
}
// The fly gait at phase ph (cycles), k of the way from flying to hovering: its lift (wing clearance) going from the
// gait's own to HOVER_FLUTTER of its swing about 0.
export function hoverPose(rig, ph, k = 1) {
  const p = { ...rig.gaits.fly(frac(ph)) }, m = meanFlyLift(rig), l = p.lift || 0;
  p.lift = lerp(l, (l - m) * HOVER_FLUTTER, k);
  return p;
}
// What a hovering flier's drawing covers, to frame it: like util.profile (units, scale 1, facing right; head: { tilt,
// look } poses the head, quantized the same way), but box is the union of its boxes over a wing beat, grown by the bob
// either way (the camera holds still while the wings beat); head and mouth are where the beat starts.
const HOVER_PROFILES = new WeakMap();
export function hoverProfile(rig, params = {}, head = null) {
  let m = HOVER_PROFILES.get(rig); if (!m) HOVER_PROFILES.set(rig, (m = new Map()));
  const tilt = Math.round((head?.tilt || 0) * 8) / 8, look = Math.round((head?.look || 0) * 4) / 4, key = `${JSON.stringify(params)}|${tilt}|${look}`;
  if (m.has(key)) return m.get(key);
  let p = null;
  for (let i = 0; i < 16; i++) {
    const r = probe(rig, 0, 0, 1, 1, { pose: hoverPose(rig, i / 16), params, shadow: false, t: 0, ...(tilt ? { tilt } : {}), ...(look ? { look } : {}) }), b = r.bounds;
    if (!p) p = { box: b.slice(), head: r.head.slice(), mouth: (r.mouth || r.head).slice() };
    else p.box = [Math.min(p.box[0], b[0]), Math.min(p.box[1], b[1]), Math.max(p.box[2], b[2]), Math.max(p.box[3], b[3])];
  }
  const bob = HOVER_BOB * rigSizes(rig, params).height;
  p.box[1] -= bob; p.box[3] += bob;
  m.set(key, p);
  return p;
}
// The hover's slow bob (units of lift) at t, for a body `height` units tall.
function hoverBob(t, height, seed) {
  const a = (seed % 997) / 997 * Math.PI * 2;
  return HOVER_BOB * height * (0.8 * Math.sin(Math.PI * 2 * t / 1.9 + a) + 0.2 * Math.sin(Math.PI * 2 * t / 0.83 + 2 * a));
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
    this.moves = []; this.poseEv = []; this.gest = []; this.exprEv = []; this.lookEv = [];
    this.glances = []; this.faceEv = []; this.talk = []; this.visEv = []; this.alphaEv = []; this.sleepEv = [];
    this.paramEv = []; this.blinks = []; this.place0 = null;
    this.pitches = followsSlope(rig) && !!groundLine(S);       // the drawing follows the ground's slope here
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
    if (mv.place) return this.hovering({ ...mv.place }, t, -Infinity);
    const tt = Math.min(t, this.end(mv)), r = this.legAt(mv, tt);
    const p = r.L.at(r.τ);
    if (t >= mv.t1 && mv.final) return { ...mv.final };
    return this.hovering(p, t, mv.t1);
  }
  // A hovering position bobs about its hover lift (eased in from `since`, the arrival).
  hovering(p, t, since) {
    if (p.hover == null) return p;
    p.lift = p.hover + ease(clamp((t - since) / HOVER_EASE)) * hoverBob(t, this.sz.height, this.seed);
    return p;
  }
  // Hovering at t (holding still in the air, not on a move).
  hoverAt(t) { return canHover(this.rig) && !this.moving(t) && this.posAt(t).hover != null; }
  moving(t) { const mv = this.moveAt(t); return !!(mv && !mv.place && t < this.end(mv)); }
  // The actor this one is riding at t (an Actor), or null.
  carrierAt(t) {
    const mv = this.moveAt(t);
    if (!mv) return this.place0?.mount ?? null;
    return mv.mount && (!mv.legs.length || t >= this.end(mv)) ? mv.mount : null;
  }
  // As a carrier: the riding point at t (rig.mount mirrored by face, squashed with a turn, lifted with a hop, sunk
  // with a wade, turned with the carrier's pitch on a slope) as a position for `rider`: its scale is the ground scale
  // here times the rider's cast scale; its ground is the slope's under the riding point.
  mountAt(t, rider = null) {
    let m = this._mount;
    if (!m || m.t !== t) {
      if (this._mounting) throw new Error(`${this.id}: riding loop (an actor cannot carry its own carrier)`);
      this._mounting = true;
      try {
        const pos = this.posAt(t), pose = this.poseAt(t), face = this.faceAt(t), q = this.squashAt(t), sink = pos.sink || 0;
        const [ux, uy] = mountPoint(this.rig, pose, this.paramsAt(t)), th = this.pitchAt(t), slope = this.slopeOf(pos);
        let dx = face * ux * q * pos.s, dy = (uy - (pos.lift || 0)) * pos.s, ground = pos.ground ?? pos.y;
        if (th) { const c = Math.cos(th), sn = Math.sin(th); [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c]; }
        if (slope) ground += Math.tan(slope) * dx;
        m = this._mount = { t, x: pos.x + dx, y: pos.y + sink + dy, gs: pos.s / this.k, key: pos.key + 0.01, ground, slope, waterY: sink > 0 ? pos.y : pos.waterY ?? null, face };
      } finally { this._mounting = false; }
    }
    return { x: m.x, y: m.y, s: m.gs * (rider?.k ?? 1), key: m.key, mode: 'mount', carrier: this.id, anchor: null, clip: null, lift: 0, ground: m.ground, slope: m.slope, waterY: m.waterY, surface: 'shell', carrierFace: m.face };
  }
  // ── slope ──
  // The ground's angle under this actor at a position: standing or airborne over sloped ground, the slope under its
  // footprint; riding, its carrier's; else 0.
  slopeOf(pos) {
    if (pos.mode === 'mount') return pos.slope || 0;
    return pos.mode === 'ground' || pos.mode === 'air' ? slopeAt(this.S, pos.x, (this.sz.width * pos.s) / 2) : 0;
  }
  // The pitch the drawing takes at a position, before easing: the slope when standing on the ground, the carrier's
  // pitch when riding, in a jump the take-off's turning into the landing's, else 0. Always 0 for upright rigs and on
  // flat ground.
  pitchFor(pos, t) {
    if (!this.pitches) return 0;
    if (pos.mode === 'mount') return this.others?.get(pos.carrier)?.pitchAt(t) ?? 0;
    if (pos.jump) { const { A, B, w } = pos.jump; return lerp(this.pitchFor(A, t), this.pitchFor(B, t), w); }
    return pos.mode === 'ground' ? this.slopeOf(pos) : 0;
  }
  // The drawing's pitch at t (rad, screen; the drawing turns by it about the contact point): pitchFor eased over the
  // last SLOPE_EASE s (weighted by the derivative of smoothstep, so a step in it eases in and out). The window never
  // reaches back past a place (a teleport, an entrance's start off screen): a placed or entering body comes in already
  // pitched, as if it had always stood there. A rider riding throughout takes its carrier's pitch as it is.
  pitchAt(t) {
    if (!this.pitches) return 0;
    const t0 = this.placedAt(t), C = this.carrierAt(t);
    if (C && C === this.carrierAt(Math.max(t - SLOPE_EASE, t0))) return C.pitchAt(t);
    let sum = 0, wt = 0;
    for (let i = 0; i < PITCH_SAMPLES; i++) {
      const u = (i + 0.5) / PITCH_SAMPLES, k = u * (1 - u), τ = Math.max(t - u * SLOPE_EASE, t0);
      sum += k * this.pitchFor(this.posAt(τ), τ); wt += k;
    }
    return sum / wt;
  }
  // The time of the latest place (a move that sets the position at once) at or before t, or -Infinity.
  placedAt(t) {
    let t0 = -Infinity;
    for (const mv of this.moves) { if (mv.t0 > t) break; if (mv.kind === 'place') t0 = mv.t0; }
    return t0;
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
  // The pose at rest: the base pose, or while hovering the fly gait flapping on, in step with the flight that brought
  // it there (hoverPose).
  restPoseAt(t) {
    if (!this.hoverAt(t)) return this.basePoseAt(t);
    const mv = this.moveAt(t);
    return hoverPose(this.rig, (t - (mv ? mv.t0 : 0)) * flapRate(this.rig, this.sz));
  }
  // upto: the pose under that gesture (the gestures that start before it only)
  poseAt(t, upto = null) {
    const mv = this.moveAt(t);
    let p = this.restPoseAt(t), moving = false, gait = null;
    if (mv && !mv.place && mv.legs.length) {
      const e = this.end(mv);
      if (t < e) {
        moving = true;
        p = this.legPose(mv, t);
        const r = this.legAt(mv, t); gait = r.L.type === 'route' && !r.L.hops ? r.L.gait : null;
        if (t - mv.t0 < BLEND_IN) p = this.mix(this.hoverAt(mv.t0 - 1e-6) ? this.restPoseAt(mv.t0 - 1e-6) : this.basePoseAt(mv.t0), p, ease((t - mv.t0) / BLEND_IN));
      } else if (t - e < BLEND_OUT && !mv.noBlendOut) {
        const last = this.legPose(mv, e);
        p = this.mix(last, p, ease((t - e) / BLEND_OUT));
      }
    }
    // gestures, in the order they start, each on the pose under it (so one that starts while another is on takes over
    // from that pose, and the first ending under it changes nothing), eased in and out where the rig's doesn't
    for (const g of this.gest) {
      if (g === upto) break;
      if (t < g.t0 || t >= g.t1) continue;
      const G = this.rig.gestures[g.name], u = (t - g.t0) / (g.t1 - g.t0);
      const q = G.at(clamp(u), p);
      if (moving && gait) { const keep = contactKeys(this.rig, gait); for (const k of keep) if (k in p) q[k] = p[k]; }
      const b = this.gestBlend(g), w = Math.min(b.tin > 0 ? ease((t - g.t0) / b.tin) : 1, b.tout > 0 ? ease((g.t1 - t) / b.tout) : 1);
      p = w >= 1 ? q : this.mix(p, q, w);
    }
    return p;
  }
  // How a gesture is eased in and out by the actor: { tin, tout } (s). A rig's gesture normally starts and ends on the
  // pose it is given (its own envelope): 0. One that jumps away from the pose under it at its start (or doesn't come
  // back to it at its end) is eased over GEST_MIN..GEST_MAX s, the longer the further the drawing has to move. A
  // one-way gesture, whose key drawings end on its last frame (keys include 1), ends as the rig drew it (tout 0): its
  // end is meant to differ from the pose (an acorn let go lies on the ground), and easing it back would undo it.
  gestBlend(g) {
    const ver = `${this.poseEv.length}|${this.moves.length}|${this.gest.length}|${this.paramEv.length}`;
    if (g.blend?.ver === ver) return g.blend;
    const G = this.rig.gestures[g.name], a = this.poseAt(g.t0, g), b = this.poseAt(g.t1 - 1e-6, g);
    const time = d => (d > GEST_STILL ? GEST_MIN + (GEST_MAX - GEST_MIN) * clamp((d - GEST_STILL) / GEST_FAR) : 0);
    const oneWay = (G.keys || []).includes(1);
    g.blend = { ver, tin: time(this.poseGap(a, G.at(0, a), g.t0)), tout: oneWay ? 0 : time(this.poseGap(b, G.at(1, b), g.t1)) };
    return g.blend;
  }
  // How far the drawing moves (in rig heights) from pose p to pose q: the largest shift of its head, mouth, hands and
  // bounds.
  poseGap(p, q, t) {
    const pts = pose => {
      const r = probe(this.rig, 0, 0, 1, 1, { pose, params: this.paramsAt(t), shadow: false, t: 0 }), B = r.bounds;
      return [r.head, r.mouth, ...(r.hands ? [r.hands.front, r.hands.back] : []), [B[0], B[1]], [B[2], B[3]]].filter(Boolean);
    };
    const A = pts(p), B = pts(q);
    let d = 0; for (let i = 0; i < Math.min(A.length, B.length); i++) d = Math.max(d, Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]));
    return d / Math.max(1, this.sz.height);
  }
  // ── expression, talk, look ──
  exprAt(t) {
    if (this.asleep(t)) return 'sleepy';
    const L = this.exprLine(), i = lastAt(L, t);
    return i < 0 ? 'neutral' : L[i].expr;
  }
  // The face's expression over time: { t, expr, cut } in time order. Each exprEv entry sets the expression; one with
  // `until` (a line's reaction) gives way at that time to the expression held under it (cut: e.untilCut), unless
  // another expression came first.
  exprLine() {
    if (this._expr?.n === this.exprEv.length) return this._expr.list;
    const ev = [];
    for (const e of this.exprEv) { ev.push({ t: e.t, e, end: false }); if (e.until != null) ev.push({ t: e.until, e, end: true }); }
    ev.sort((a, b) => a.t - b.t || b.end - a.end);   // at one instant: a reaction ends, then the next expression starts
    const list = []; let held = 'neutral', on = null;
    for (const { t, e, end } of ev) {
      if (end) { if (on === e) { on = null; list.push({ t, expr: held, cut: !!e.untilCut }); } continue; }
      if (e.until == null) held = e.expr;
      on = e.until == null ? null : e;
      list.push({ t, expr: e.expr, cut: !!e.cut });
    }
    this._expr = { n: this.exprEv.length, list };
    return list;
  }
  // The expression changes a viewer sees happen: { t, from, to } (not at a cut, where e.cut, nor asleep); changes at
  // the same instant are one.
  exprChanges() {
    const out = []; let x = null;
    for (const e of this.exprLine()) {
      if (x !== null && e.expr !== x && !e.cut && !this.asleep(e.t)) {
        const last = out[out.length - 1];
        if (last && Math.abs(last.t - e.t) < 1e-6) { last.to = e.expr; if (last.to === last.from) out.pop(); }
        else out.push({ t: e.t, from: x, to: e.expr });
      }
      x = e.expr;
    }
    return out;
  }
  // The mouth across an expression change (as talk): from the old face's openness to the new one's over SWAP_MOUTH s,
  // after the switch when it closes, before it when it opens (talk only ever opens a mouth further), so the switch
  // itself (behind the blink) never changes how open the mouth is.
  swapMouthAt(t) {
    let m = 0;
    for (const c of this.exprChanges()) {
      const a = mouthOpen(c.from), b = mouthOpen(c.to), d = t - c.t;
      if (Math.abs(a - b) < 0.15) continue;
      if (a > b && d >= 0 && d < SWAP_MOUTH) m = Math.max(m, lerp(a, b, ease(d / SWAP_MOUTH)));
      else if (a < b && d < 0 && d > -SWAP_MOUTH) m = Math.max(m, lerp(a, b, ease((d + SWAP_MOUTH) / SWAP_MOUTH)));
    }
    return m;
  }
  asleep(t) { let a = false; for (const e of this.sleepEv) if (e.t <= t) a = e.asleep; return a; }
  // the mouth: lip sync, and the ease across an expression change
  talkAt(t, fps) { return Math.max(this.lipAt(t, fps), this.swapMouthAt(t)); }
  lipAt(t, fps) {
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
  // The head's world position at t (base pose, facing, hop lift, wading sink and pitch on a slope): where eyelines
  // start and end.
  headAt(t) {
    const pos = this.posAt(t), h = rigProfile(this.rig, this.basePoseName(t), this.paramsAt(t)).head, th = this.pitchAt(t);
    const dx = this.faceAt(t) * h[0] * pos.s, dy = (h[1] - (pos.lift || 0)) * pos.s;
    if (!th) return [pos.x + dx, pos.y + (pos.sink || 0) + dy];
    const c = Math.cos(th), sn = Math.sin(th);
    return [pos.x + dx * c - dy * sn, pos.y + (pos.sink || 0) + dx * sn + dy * c];
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
  // Head pitch toward a target: "up" +1, "sky" SKY (a moderate look up), "down" −1, an actor or a point the angle of the
  // line from this head to it (± PITCH_MAX at most), other keywords 0. (A look beat's own tilt overrides it.)
  pitchValue(target, t) {
    if (target === 'up') return 1;
    if (target === 'sky') return SKY;
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
  // The look timeline: each change of where the head is aimed, in time order: { t, h (the horizontal target), p (the
  // pitch target), tilt (a look beat's own pitch, or undefined), glance }. An explicit look holds until the next one
  // and ends the glances still running; a glance at a speaker turns the head for the line, then back to the explicit
  // look in force, or, with none (never told where to look), it stays on the speaker: listening never resets the head.
  // "up" / "sky" / "down" keep the horizontal target the head rests on (the explicit look's, else the last glance's).
  // glances = false: the explicit looks only.
  lookChanges(glances = true) {
    const key = `${this.lookEv.length}|${this.glances.length}`, slot = glances ? 'all' : 'told';
    if (this._looks?.key !== key) this._looks = { key };
    if (this._looks[slot]) return this._looks[slot];
    const ev = this.lookEv.map(e => ({ t: e.t, k: 1, e }));
    if (glances) for (const g of this.glances) ev.push({ t: g.t0, k: 2, g }, { t: g.t1, k: 0, g });
    ev.sort((a, b) => a.t - b.t || a.k - b.k);   // at one instant: a glance ends, then a look, then a glance starts
    const list = [], on = [];
    let hold = null, rest = null;                 // the explicit look in force; with none, the target the head rests on
    for (const x of ev) {
      if (x.k === 1) {
        const tg = x.e.target;
        hold = { h: VERTICAL.has(tg) ? (hold ? hold.h : rest) : tg, p: tg, tilt: x.e.tilt };
        on.length = 0;
        list.push({ t: x.t, ...hold, glance: false });
      } else if (x.k === 2) {
        on.push(x.g); if (!hold) rest = x.g.target;
        list.push({ t: x.t, h: x.g.target, p: x.g.target, glance: true });
      } else {
        const j = on.indexOf(x.g); if (j < 0) continue;   // ended by an explicit look
        on.splice(j, 1);
        const top = on[on.length - 1];
        if (top) { if (!hold) rest = top.target; list.push({ t: x.t, h: top.target, p: top.target, glance: true }); }
        else if (hold) list.push({ t: x.t, ...hold, glance: true });
      }
    }
    this._looks[slot] = list;
    return list;
  }
  // A channel of the head along the look timeline at t: change i eases from the value the head had at its own time
  // (wherever it was, mid-change or not) to value(change, t) over T(change) s.
  lookChain(list, i, t, value, T) {
    if (i < 0) return 0;
    const c = list[i], u = ease((t - c.t) / T(c)), to = value(c, t);
    return u >= 1 ? to : lerp(this.lookChain(list, i - 1, c.t, value, T), to, u);
  }
  // Head turn (lookValue of the horizontal target): an explicit look eases over rig.lookTime (default LOOK_BLEND), a
  // glance and the way back from it over LOOK_BLEND.
  lookAt(t, pos) {
    if (this.asleep(t)) return 0;
    const list = this.lookChanges(), T = this.rig.lookTime ?? LOOK_BLEND;
    return this.lookChain(list, lastAt(list, t), t, (c, tt) => this.lookValue(c.h, tt, tt === t ? pos : this.posAt(tt)), c => (c.glance ? LOOK_BLEND : T));
  }
  // Head pitch (the look's tilt, else pitchValue of its target), eased over rig.lookTime (default 0.3 s), glances
  // included (glances = false: the explicit looks only).
  tiltAt(t, glances = true) {
    if (this.asleep(t)) return 0;
    const list = this.lookChanges(glances), T = this.rig.lookTime ?? 0.3;
    return this.lookChain(list, lastAt(list, t), t, (c, tt) => c.tilt ?? this.pitchValue(c.p, tt), () => T);
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
  // idle blinks, blink beats, and the quick blink an expression change happens behind
  blinkAt(t, idleBlink) {
    let b = idleBlink;
    for (const e of this.blinks) { const u = (t - e) / 0.16; if (u >= 0 && u <= 1) b = Math.max(b, Math.sin(Math.PI * u)); }
    // (changes whose blinks would overlap make one blink, shut from the first to the last: no flutter)
    const T = [...this.exprChanges().map(c => c.t), ...this.faceSwitches()].sort((x, y) => x - y);
    for (let i = 0, j = 0; i < T.length; i = ++j) {
      while (j + 1 < T.length && T[j + 1] - T[j] < SWAP_CLOSE + SWAP_OPEN) j++;
      b = Math.max(b, swapBlink(t < T[i] ? t - T[i] : t > T[j] ? t - T[j] : 0));
    }
    return b;
  }
  // The times the pose switches the face: a face hint (FACE_HINTS) crossing 0.5 during a gesture or a pose blend (a
  // laugh's closed eyes, a gasp), found to the frame (sampled at twice the frame rate) and refined by bisection.
  faceSwitches() {
    const ver = `${this.poseEv.length}|${this.moves.length}|${this.gest.length}|${this.paramEv.length}`;
    if (this._switches?.ver === ver) return this._switches.list;
    const on = t => { const p = this.poseAt(t); return FACE_HINTS.map(k => (p[k] || 0) > 0.5); }, found = [];
    const spans = [...this.gest.map(g => [g.t0, g.t1]), ...this.poseEv.filter(e => e.blend > 0 && e.t > -1e8).map(e => [e.t, e.t + e.blend])];
    for (const [a, b] of spans) {
      const n = Math.ceil((b - a) * 48) + 1;
      let t0 = a - 1e-3, s0 = on(t0);
      for (let i = 0; i <= n; i++) {
        const t1 = i === n ? b + 1e-3 : a + ((b - a) * i) / n, s1 = on(t1);
        s0.forEach((v, k) => {
          if (v === s1[k]) return;
          let lo = t0, hi = t1;
          for (let j = 0; j < 14; j++) { const m = (lo + hi) / 2; if (on(m)[k] === v) lo = m; else hi = m; }
          found.push(hi);
        });
        t0 = t1; s0 = s1;
      }
    }
    found.sort((x, y) => x - y);
    const list = found.filter((t, i) => i === 0 || t - found[i - 1] > 0.02);   // (spans that overlap find one twice)
    this._switches = { ver, list };
    return list;
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
      pitch: this.pitchAt(t), slope: this.slopeOf(pos),
    };
  }
}
