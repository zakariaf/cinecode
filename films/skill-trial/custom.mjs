// A Light for Tilly: the film's own firefly rig ("firefly") and the glow of its lantern tail ("glow" overlay, on the
// grade layer so the night grade doesn't grey it). Deterministic: everything is drawn from t, params and pose.
import { makeRig, mixPose, plus } from '../../engine/cast/rig.mjs';
import { cel, eye, brow, line, fillP, dot, darken, lighten, rgba } from '../../engine/core/style.mjs';
import { ell, clamp } from '../../engine/core/lib.mjs';

// Pose fields read by paint(): lift (units above the ground: the firefly always hovers), br body pitch (radians,
// + = nose down), el wing-cover opening (0 closed .. 1 open), lg leg dangle, hz wing buzz amount, gl lantern
// brightness multiplier.
const HOVER = 13;
const D = { lift: HOVER, br: -0.08, el: 0.75, lg: 1, hz: 1, gl: 1 };
const P0 = o => ({ ...D, ...o });
const POSES = {
  stand: P0({}),
  hover: P0({}),
  alert: P0({ br: -0.2, lift: HOVER + 2 }),
  sit: P0({ lift: 0, el: 0, hz: 0, br: 0, lg: 0.4 }),
  sleep: P0({ lift: 0, el: 0, hz: 0, br: 0.05, lg: 0.2, gl: 0.4 }),
};
POSES.rest = POSES.sit; POSES.perch = POSES.sit;

function fly(ph) { const c = Math.sin(Math.PI * 2 * ph); return P0({ br: 0.1 + 0.05 * c, lift: HOVER + 1.6 * c, lg: 0.5 }); }

function paint(T, p, F, o) {
  const { P, t } = o;
  const bob = p.lift > 1 ? 0.9 * Math.sin(t * 3.1) + 0.4 * Math.sin(t * 7.3) : 0;
  T.save(); T.translate(0, -3 + bob); T.rotate(p.br);
  // far wing: a translucent blur that buzzes (two blades at different phases read as fast wings at 24 fps)
  const wing = (a, alpha, sd) => {
    T.save(); T.translate(-0.6, -1.6); T.rotate(a);
    fillP(T, ell(-2.6, -3.4, 2.1, 4.2, sd, 0.05, 0.5), rgba('#f4f1ff', alpha));
    line(T, ell(-2.6, -3.4, 2.1, 4.2, sd, 0.05, 0.5).concat([ell(-2.6, -3.4, 2.1, 4.2, sd, 0.05, 0.5)[0]]), 0.25, { seed: sd, color: rgba('#c8c4e8', alpha * 1.4), taper: false });
    T.restore();
  };
  const buzz = p.hz * Math.sin(t * 2 * Math.PI * 5.7);
  if (p.hz > 0.05) { wing(-0.55 + 0.45 * buzz, 0.32, 401); wing(-1.25 - 0.3 * buzz, 0.18, 402); }
  // legs dangling under the thorax
  for (const [x, sd] of [[-0.6, 410], [0.6, 411], [1.6, 412]]) line(T, [[x, 1.2], [x - 0.5, 2.2 + p.lg * 0.6], [x - 0.2 + 0.3 * p.lg, 3 + p.lg * 0.9]], 0.3, { seed: sd, color: darken(P.body, 0.6), taper: false });
  // lantern tail: the glowing rear segments
  const glow = clamp(P.glow * p.gl, 0, 1.5);
  cel(T, ell(-5.6, 0.5, 1.9, 1.55, 403, 0.04), lighten(P.lamp, 0.15 * glow), 0.4, 0.55, 403);
  fillP(T, ell(-5.8, 0.6, 1.1, 0.9, 404, 0.03), rgba('#fffbe0', 0.85 * Math.min(1, glow)));
  // abdomen and wing covers (elytra), cover lifted at the back when flying
  cel(T, ell(-2.6, 0.3, 3.2, 1.7, 405, 0.05), darken(P.body, 0.9), 0.5, 0.6, 405);
  T.save(); T.translate(0.4, -0.8); T.rotate(-0.28 * p.el);
  cel(T, [[0.2, -0.3], [-1.6, -1.2], [-4.6, -1.1], [-6.4, -0.2], [-5.6, 0.6], [-2, 0.7], [0.3, 0.6]], P.body, 0.6, 0.6, 406);
  line(T, [[-0.4, -0.7], [-5, -0.5]], 0.25, { seed: 407, color: rgba(lighten(P.body, 0.6), 0.7) });
  fillP(T, [[-1.5, -0.9], [-5.2, -0.8], [-5.8, -0.3], [-5.3, 0.1], [-1.6, -0.3]], rgba(P.edge, 0.85));
  T.restore();
  // head shield (pronotum): red-orange with a dark spot, the firefly's mark
  cel(T, ell(1.1, -0.7, 1.75, 1.45, 408, 0.04), P.shield, 0.5, 0.6, 408);
  dot(T, 1.0, -1.1, 0.55, darken(P.shield, 0.45));
  // head, antennae, a big eye, a small mouth
  const hx = 2.7, hy = 0.2;
  const an = 0.25 * Math.sin(t * 2.3);
  for (const [dx, sd] of [[0, 413], [0.6, 414]]) line(T, [[hx + 0.3 + dx * 0.2, hy - 0.8], [hx + 1.6 + dx, hy - 2.6 - an], [hx + 3.0 + dx, hy - 3.3 - an * 1.4]], 0.28, { seed: sd, color: darken(P.body, 0.7), taper: false });
  cel(T, ell(hx, hy, 1.35, 1.25, 415, 0.03), P.face, 0.5, 0.55, 415);
  eye(T, hx + 0.35, hy - 0.25, 0.68, 0.76, F.eye, '#0c0c10', F.look * 0.18, F.lid, F.tilt, { sclera: '#fbf8ee', pupil: 0.7, w: 0.42 });
  brow(T, hx + 0.3, hy - 1.25, 1.1, F.browY * 0.5, F.browT * 0.8, lighten(P.face, 0.6), 0.35, 416);
  const op = clamp(F.open);
  if (op > 0.05) fillP(T, ell(hx + 0.95, hy + 0.75, 0.32, 0.12 + op * 0.32, 417, 0.01), '#7a2a36');
  else line(T, [[hx + 1.2, hy + 0.55], [hx + 0.95, hy + 0.75 + 0.18 * F.smile], [hx + 0.6, hy + 0.62]], 0.24, { seed: 418 });
  o.out.head = T.map(hx, hy); o.out.mouth = T.map(hx + 0.95, hy + 0.7);
  // near wing on top
  if (p.hz > 0.05) wing(-0.3 + 0.5 * Math.sin(t * 2 * Math.PI * 5.7 + 1.9) * p.hz, 0.28, 419);
  T.restore();
}

const env = (u, a = 0.2, b = 0.2) => clamp(u / a) * (1 - clamp((u - 1 + b) / b));
const g = (dur, at) => ({ dur, at });
const firefly = makeRig({
  kind: 'firefly', label: 'Firefly',
  height: 7, headHeight: 4, width: 11, shadowW: 3, shadowA: 0.12,
  perch: true, flies: true, breathPeriod: 0.8,
  params: { body: '#2e2620', face: '#3a3028', shield: '#d9562e', edge: '#e6c45a', lamp: '#f2e070', glow: 1 },
  speeds: { walk: 6, fly: 70, run: 70 }, stride: { walk: 3, fly: 26, run: 26 },
  poses: POSES,
  gaits: { fly, run: fly, walk: fly },
  gestures: {
    nod: g(0.6, (u, b = POSES.stand) => plus(b, { br: 0.25 * Math.sin(Math.PI * clamp(u / 0.5)) + 0.15 * Math.sin(Math.PI * clamp((u - 0.5) / 0.5)) })),
    laugh: g(1.0, (u, b = POSES.stand) => { const e = env(u); return plus(b, { lift: 1.5 * e * Math.abs(Math.sin(u * Math.PI * 6)), br: -0.15 * e }); }),
    // a loop-the-loop of joy: up and round
    jump: g(1.0, (u, b = POSES.stand) => plus(b, { lift: 6 * Math.sin(Math.PI * u), br: -2 * Math.PI * u * (u < 1 ? 1 : 0) })),
    // the lantern flares
    flash: g(1.0, (u, b = POSES.stand) => plus(b, { gl: 0.9 * Math.sin(Math.PI * u) })),
    wave: g(1.0, (u, b = POSES.stand) => plus(b, { br: 0.2 * env(u) * Math.sin(u * Math.PI * 6) })),
  },
  feet: p => [[0, -(p.lift || 0), 0]],
  paint,
});
export const rigs = [firefly];

// The lantern glow: an additive halo around each firefly's tail and a warm pool on the ground under it, drawn after
// the night grade. The tail sits at a fixed offset from the head in the rig's local units.
const TAIL = [-5.7 - 2.7, 0.6 - 0.2];               // tail minus head, local units
export const overlays = {
  glow: {
    layer: 'grade',
    draw(ctx, api) {
      const ids = api.params.who ? [].concat(api.params.who) : ['glim'];
      const k = api.params.strength ?? 1;
      for (const id of ids) {
        const a = api.actor(id);
        if (!a || !a.head) continue;
        const sc = a.s * (a.st?.params?.size || 1) * (a.scale || 1);
        const s = a.box ? Math.max(sc, (a.box[2] - a.box[0]) / 13) : sc;   // world px per unit
        const face = a.face < 0 ? -1 : 1;
        const tail = [a.head[0] + TAIL[0] * s * face, a.head[1] + TAIL[1] * s];
        const [sx, sy] = api.toScreen(tail), z = api.cam.zoom;
        const pulse = 0.85 + 0.15 * Math.sin(api.t * 2.6) + 0.05 * Math.sin(api.t * 7.1);
        const r = (api.params.radius ?? 120) * s * z * pulse;
        ctx.globalCompositeOperation = 'lighter';
        let gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(255,246,190,${0.75 * k})`);
        gr.addColorStop(0.08, `rgba(250,226,120,${0.45 * k})`);
        gr.addColorStop(0.35, `rgba(220,180,80,${0.14 * k})`);
        gr.addColorStop(1, 'rgba(200,160,60,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        // warm pool on the ground below
        const gy = api.toScreen([tail[0], a.y])[1], rr = r * 0.8;
        ctx.save(); ctx.translate(sx, gy); ctx.scale(1, 0.22);
        gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
        gr.addColorStop(0, `rgba(240,200,110,${0.22 * k * pulse})`); gr.addColorStop(1, 'rgba(240,200,110,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },
  },
};
