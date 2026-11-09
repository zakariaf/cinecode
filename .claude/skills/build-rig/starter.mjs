// A starter rig: a small two-legged bird (a chick), complete and passing `cinecode verify-rig`. Copy it to
// films/<slug>/rigs/<kind>.mjs (or <project>/cinecode/rigs/<kind>.mjs), rename `kind`, then reshape it.
// Local units: origin = the contact point (between the feet), +x = forward (the rig is mirrored for face -1),
// the ground is y = 0, up is negative y. Deterministic and stateless: draw only from the pose, F, o.P and o.t.
import { clamp, ell, rpoly } from 'cinecode/lib';
import { cel, line, eye, brow, darken, lighten } from 'cinecode/style';
import { makeRig, footAt, ik2, gest, jumpAt, pitchPose } from 'cinecode/rig';

// Every pose carries every key (a key missing from a pose pops when a gesture blends into it):
//  by body drop (+ = lower), ln lean (radians, + = nose down), hy head drop, hr head turn (radians), wg wing raise
//  0..1, f1x f1y / f2x f2y the near and far foot, c1 c2 1 while a foot is planted, lift (units above the ground),
//  face hints read by faceOf(): mo mouth open, sm smile, eh happy closed eyes, lid lid closure.
const D = { by: 0, ln: 0, hy: 0, hr: 0, wg: 0, f1x: 2.5, f1y: 0, f2x: -2.5, f2y: 0, c1: 1, c2: 1, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0 };
const P0 = o => ({ ...D, ...o });
const POSES = {
  stand: P0({}),
  alert: P0({ by: -1, hy: -1.5, wg: 0.15 }),
  sit: P0({ by: 4, f1x: 1.5, f2x: -1.5 }),                       // body down on its folded legs (not through the ground)
  sleep: P0({ by: 4, hy: 2, hr: 0.25, f1x: 1.5, f2x: -1.5, lid: 1 }),
};

// Gaits: phase 0..1 per stride. footAt() plants a foot for `duty` of the cycle and sweeps it back exactly one
// stride, so the feet don't slide when the actor moves stride × s per cycle; the other foot is half a cycle later.
const G = { walk: { stride: 10, speed: 20 }, run: { stride: 18, speed: 54 } };
function gait(stride, duty, lift, bob) {
  return ph => {
    const a = footAt(ph, 0, duty, stride, 1, lift), b = footAt(ph, 0.5, duty, stride, -1, lift);
    return P0({ f1x: a.x, f1y: a.y, c1: +a.down, f2x: b.x, f2y: b.y, c2: +b.down, by: -bob * Math.abs(Math.sin(Math.PI * 2 * ph)), ln: 0.06 });
  };
}

function legs(T, p, P, which) {
  for (const k of which) {
    const hip = [k === 1 ? 1.5 : -1, -7 + p.by * 0.6], foot = [p[`f${k}x`], p[`f${k}y`]];
    const knee = ik2(hip[0], hip[1], foot[0], foot[1] - 0.4, 4, 4.4, -1);
    const col = k === 1 ? P.leg : darken(P.leg, 0.8);
    line(T, [hip, knee, [foot[0], foot[1] - 0.4]], 0.9, { seed: 20 + k, color: col, taper: false });
    line(T, [[foot[0] - 1.2, foot[1] - 0.3], [foot[0] + 2.2, foot[1] - 0.3]], 0.7, { seed: 22 + k, color: col, taper: false });   // toes
  }
}

function paint(T, p0, F, o) {
  const P = o.P, p = pitchPose(p0, F.pitch, { hy: -1.2, hr: -0.35 }, { hy: 1.2, hr: 0.35 }), t = o.t;
  legs(T, p, P, [2]);                                          // far leg behind the body
  T.save(); T.translate(0, p.by); T.rotate(p.ln);
  const breathe = 0.4 * F.breath;
  cel(T, ell(0, -14, 10.5, 9.5 + breathe, 7, 1.2), P.body, 1.6, 1.1, 7);                    // body
  cel(T, ell(1.5, -11, 6, 5, 8, 0.6), P.belly, 0.6, 0, 8);                                     // belly patch, no ink
  const wing = rpoly([[-7, -16], [-1, -18 - 3 * p.wg], [2, -14], [-3, -10 + 2 * p.wg]], 2.5, { seed: 9, jit: 0.3, step: 3 });
  cel(T, wing, darken(P.body, 0.86), 0.8, 0.9, 9);                                           // near wing
  line(T, [[-10.5, -16], [-13.5, -18.5 + 0.6 * Math.sin(t * 2.1)]], 1.1, { seed: 10, color: darken(P.body, 0.7) });   // tail tuft
  // head: turned (hr) about the neck, dropped (hy)
  T.save(); T.translate(4, -21 + p.hy); T.rotate(p.hr);
  cel(T, ell(1, -4, 6.8, 6.4, 11, 0.8), P.body, 1.2, 1.05, 11);
  const op = clamp(F.open);
  cel(T, [[6.5, -4.6], [10.8, -3.6], [6.6, -2.6]], P.beak, 0.4, 0.8, 12);                   // upper beak
  cel(T, [[6.5, -2.9], [9.6, -2.6 + 2.6 * op], [6.4, -1.6 + 1.2 * op]], darken(P.beak, 0.9), 0.3, 0.8, 13);   // lower beak opens to talk
  eye(T, 3.2, -5.6, 1.5, 1.8, F.eye, P.eye, F.look * 0.35, F.lid, F.tilt, { cheek: F.cheek });
  brow(T, 3.2, -8.6, 3, F.browY, F.browT, darken(P.body, 0.55), 0.8, 14);
  o.out.head = T.map(1, -4); o.out.mouth = T.map(8, -2.6);    // framing and close-ups use head; talking, mouth
  T.restore();
  T.restore();
  legs(T, p, P, [1]);                                          // near leg in front
}

export default makeRig({
  kind: 'chick', label: 'Chick',
  height: 31, headHeight: 14, width: 24,                       // units at scale 1: framing, routing and lint use them
  shadowW: 9,
  params: { body: '#e8b84a', belly: lighten('#e8b84a', 0.45), beak: '#e0782e', leg: '#c8692a', eye: '#2a1a14' },
  speeds: { walk: G.walk.speed, run: G.run.speed },            // world px per second at scale 1
  stride: { walk: G.walk.stride, run: G.run.stride },          // px per gait cycle: speed / stride = steps per second
  steps: { walk: [0, 0.5], run: [0, 0.5] },                    // phases where a foot lands (footstep sounds)
  poses: POSES,
  gaits: { walk: gait(G.walk.stride, 0.6, 2, 0.6), run: gait(G.run.stride, 0.45, 4, 1.4) },
  gestures: {                                                  // gest(dur, [[u, deltas | null]]): starts and ends on its base pose
    nod: gest(0.8, [[0, null], [0.3, { hr: 0.35, hy: 1 }], [0.6, { hr: -0.05 }], [1, null]]),
    flap: gest(1.0, [[0, null], [0.2, { wg: 1 }], [0.4, { wg: 0.2 }], [0.6, { wg: 1 }], [0.8, { wg: 0.2 }], [1, null]]),
    laugh: gest(1.2, [[0, null], [0.2, { mo: 0.8, eh: 1, by: -0.6 }], [0.4, { mo: 0.5, eh: 1, by: 0.4 }], [0.6, { mo: 0.8, eh: 1, by: -0.6 }], [0.8, { mo: 0.4, eh: 1 }], [1, null]]),
    jump: { dur: 0.7, keys: [0.2, 0.45, 0.6, 0.85], at: (u, b = POSES.stand) => jumpAt(u, b, { h: 12, crouch: { by: 2 }, air: { wg: 1, f1y: -1.5, f2y: -1.5 } }) },
  },
  feet: p => [[p.f1x, p.f1y - (p.lift || 0), p.c1], [p.f2x, p.f2y - (p.lift || 0), p.c2]],
  paint,
});
