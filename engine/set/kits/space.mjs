// Deep space: a starfield with the Milky Way and faint nebula washes, and no ground. Planets, moons and the Sun are
// actors (the `planet` rig) held at perch anchors on an invisible stage plane, so the camera frames, pushes in on and
// lints them like any character. The sky is screen space (it barely moves when the camera zooms), so a push-in on a
// planet reads as travelling toward it while the stars stay put; the backdrop is a deep navy, not black.
//
// Params: seed (another starfield), milky (0..1, the Milky Way's strength, default 1), nebula (0..1, default 1),
// tint ('violet' | 'blue' | 'teal': the nebula colour, default 'violet').
//
// Time: one of its own, `space` (makeSet times): no grade but the house vignette (the backdrop as painted) and no sun,
// and with no ground to shade (groundShadows false) nothing throws a shadow. Scenes here use "ambience": "none".
//
// Anchors (perch holds for bodies; the planet rig perches): centre, west, east (y 1000), far, far_west, far_east (y 600:
// a little smaller), near, near_west, near_east (y 1400: a little bigger); ground_<each> 60 px below each, on the
// walkable stage plane, for a stand-in or a walker. With no painted ground, a body may stand off the stage (DESIGN §10):
// give the scene actor a `z` (2400: behind the stage, at about half size; −900: in front, about 1.6×), and it passes
// behind or in front of the others by its depth and moves in parallax when the camera moves through depth (`zTo`).
import { rng, blob } from '../../core/lib.mjs';
import { makeSet } from '../set.mjs';
import { paper } from '../../paint/paint.mjs';

const TINTS = { violet: ['120,90,170', '70,110,190'], blue: ['70,110,200', '90,140,210'], teal: ['60,140,160', '90,110,190'] };

// The backdrop, w × h screen-space pixels (2400 × 1500, drawn to cover the frame).
function paintSpace(x, r, w, h, P = {}) {
  const milky = P.milky ?? 1, neb = P.nebula ?? 1, tint = TINTS[P.tint] || TINTS.violet;
  const g = x.createLinearGradient(0, 0, w * 0.3, h);
  g.addColorStop(0, '#0d1029'); g.addColorStop(0.5, '#111633'); g.addColorStop(1, '#0e1129');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // nebula: very soft gouache washes, two tints, low alpha, laid with screen
  x.save(); x.globalCompositeOperation = 'screen';
  for (let i = 0; i < 46 * neb; i++) {
    const c = r() < 0.55 ? tint[0] : tint[1], cx = w * (0.1 + 0.8 * r()), cy = h * (0.15 + 0.7 * r());
    x.fillStyle = `rgba(${c},${(0.008 + r() * 0.012).toFixed(3)})`; blob(x, cx, cy, 120 + r() * 260, 60 + r() * 160, r() * 3, r, 9);
  }
  x.restore();
  // the Milky Way: a band from lower left to upper right, with a darker dust lane along it
  const yAt = u => h * (0.9 - 0.66 * u + 0.09 * Math.sin(u * 4.2)), wAt = u => 0.45 + 0.55 * Math.abs(Math.sin(u * 5.3 + 1));
  x.save(); x.globalCompositeOperation = 'screen';
  for (let i = 0; i < 420 * milky; i++) {
    const u = r(), px = u * w, py = yAt(u) + (r() - 0.5) * 200 * r() * wAt(u);
    x.fillStyle = `rgba(150,160,215,${(0.006 + r() * 0.016).toFixed(3)})`; blob(x, px, py, 40 + r() * 120, 14 + r() * 40 * wAt(u), -0.5, r, 8);
  }
  x.restore();
  x.save(); x.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 90 * milky; i++) {
    const u = r(), px = u * w, py = yAt(u) + 18 + (r() - 0.5) * 50;
    x.fillStyle = `rgba(30,30,64,${(0.08 + r() * 0.1).toFixed(3)})`; blob(x, px, py, 30 + r() * 70, 6 + r() * 14, -0.5, r, 7);
  }
  x.restore();
  // stars: many faint ones, denser in the band; a few bright ones with a soft glow and a four-point glint
  const COLS = ['255,252,240', '255,252,240', '255,252,240', '210,226,255', '255,236,200', '255,214,180'];
  x.save(); x.globalCompositeOperation = 'screen';
  const star = (px, py, rad, al, c) => { x.fillStyle = `rgba(${c},${al.toFixed(3)})`; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); };
  for (let i = 0; i < 2200; i++) star(r() * w, r() * h, 0.5 + r() * 0.8, 0.25 + r() * 0.6, COLS[Math.floor(r() * COLS.length)]);
  for (let i = 0; i < 1600 * milky; i++) { const u = r(); star(u * w, yAt(u) + (r() - 0.5) * 220 * r() * r() * wAt(u), 0.45 + r() * 0.5, 0.2 + r() * 0.5, COLS[0]); }
  for (let i = 0; i < 26; i++) {
    const px = r() * w, py = r() * h, rad = 1.4 + r() * 1.4, c = COLS[Math.floor(r() * COLS.length)], al = 0.7 + r() * 0.3;
    const gl = x.createRadialGradient(px, py, 0, px, py, rad * 7);
    gl.addColorStop(0, `rgba(${c},${(0.35 * al).toFixed(3)})`); gl.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = gl; x.fillRect(px - rad * 7, py - rad * 7, rad * 14, rad * 14);
    star(px, py, rad, al, c);
    if (r() < 0.6) { x.strokeStyle = `rgba(${c},${(0.45 * al).toFixed(3)})`; x.lineWidth = 0.9; const L = rad * (4 + r() * 3); x.beginPath(); x.moveTo(px - L, py); x.lineTo(px + L, py); x.moveTo(px, py - L); x.lineTo(px, py + L); x.stroke(); }
  }
  x.restore();
  paper(x, 0.05);
}

// the stage spots: [name, x, y] (y: depth on the stage plane; far = a little smaller)
// (not "left" / "right": those are reserved targets for enter and exit, and an anchor with either name can't be used)
const SPOTS = [['centre', 1600, 1000], ['west', 900, 1000], ['east', 2300, 1000], ['far', 1600, 600], ['far_west', 800, 600], ['far_east', 2400, 600],
  ['near', 1600, 1400], ['near_west', 900, 1400], ['near_east', 2300, 1400]];
const hold = (x, y) => ({ type: 'perch', branch: { pts: [[x - 200, y], [x + 200, y]], w0: 0, w1: 0 }, at: 0.5 });

export default function space(params = {}) {
  const sky = (x, r, w, h) => paintSpace(x, rng(9001 + (params.seed || 0) * 131), w, h, params);
  return makeSet({
    id: 'space', W: 3200, H: 1800, refX: 1600, refY: 900, seed: params.seed || 0,
    area: { x0: -1600, x1: 4800, y0: -900, y1: 2700 },
    view: { x0: -200, x1: 3400, y0: 0, y1: 1800 },
    // an invisible stage plane: far things (small y) a little smaller, near ones a little bigger
    horizon: -3000, laneY: 1000, baseS: 1,
    skies: { space: sky }, times: { space: { grade: 'neutral', sun: null } }, defaultSky: 'space',
    groundShadows: false,
    layers: [],
    props: [],
    anchors: {
      ...Object.fromEntries(SPOTS.map(([n, x, y]) => [n, hold(x, y)])),
      // ground spots on the stage plane, for stand-ins (an invisible actor the camera frames) and walkers
      ...Object.fromEntries(SPOTS.map(([n, x, y]) => [`ground_${n}`, { x, y: y + 60 }])),
    },
    walk: { region: [[-1500, -400], [4700, -400], [4700, 2600], [-1500, 2600]] },
    ambience: { day: 'wind-hill', night: 'wind-hill' },     // (a kit names two; scenes in space use "ambience": "none")
    sampleRoute: ['ground_west', 'ground_east'],
  });
}
