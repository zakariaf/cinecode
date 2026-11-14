// What a storyboard may name when its film asks for the 3D engine ("format": { "engine": "3d" }): the rigs
// (a cast entry's "rig") and the kits (a set's "kit").
//
// The film compiler (engine/film/compile.mjs) lays every film out in time on a flat stage: it needs a rig (sizes,
// paces, the poses, gestures and expressions it has) and a set (anchors, walkable ground) to work out how long a walk
// takes, when a line is spoken, where "near:girl" is. So each 3D rig and kit comes with a flat stand-in for it
// (rig2d, kit2d): never drawn, only timed. The stand-in set is the 3D place's floor seen from above: 100 world px to
// the metre, its x the room's x, its y the room's z (bigger = nearer the camera), so "x:2095,y:955" in a 3D film's
// storyboard is the floor mark toM gives. A rig unit is a centimetre.
import { makeRig } from '../cast/rig.mjs';
import { makeSet } from '../set/set.mjs';
import { man } from './cast/man.mjs';
import { manWork } from './cast/man-work.mjs';
import { girl } from './cast/girl.mjs';
import { boy, boyWith } from './cast/boy.mjs';
import { cat } from './cast/cat.mjs';
import { livingRoom, ROOM, sofaSeat } from './room.mjs';
import { HOME_KIT } from './home/kit.mjs';
import { LIGHTS } from './light.mjs';

export const PX = 100, X0 = 2000, Y0 = 1000;
/** A floor mark [x, z] in metres ↔ the stand-in set's world px. */
export const toPx = ([x, z]) => [X0 + x * PX, Y0 + z * PX];
export const toM = (x, y) => [(x - X0) / PX, (y - Y0) / PX];
/** The heading of a storyboard "face": left or right across the picture, turned a little toward the camera. */
export const sideYaw = face => (face < 0 ? -1 : 1) * 1.05;

// ───────────── rigs ─────────────
// kind: 'biped' (createPerformer), 'quadruped' (createCritter), 'prop' (a ball: carried, thrown, rolled, picked up, at
// rest) or 'car' (car/drive.mjs createCar).
// height, head, width: metres. walk / run: the pace the performer moves at when the beat gives it room.
// gestures: name → seconds (what engine/scene3d/compile.mjs acts out); poses: the postures it can take.
// params: what a cast entry's "params" may say: name → '#' (a colour "#rrggbb") or the values it takes; look(params)
// → the description drawn (desc without params).
const GESTURES = { wave: 2.6, point: 1.6, clap: 1.6, jump: 1.15, sigh: 1.6, laugh: 1.4 };
// ("tired" is a posture held like a face: the shoulders and head low, until the next expression lifts it)
const EXPRESSIONS = ['neutral', 'happy', 'surprised', 'sad', 'angry', 'tired'];
const hex = (v) => (v === undefined ? undefined : parseInt(v.slice(1), 16));
export const RIGS = {
  // "params": { "wardrobe": "work" }: in his work clothes, a briefcase hanging from his right hand (cast/man-work.mjs)
  man: { kind: 'biped', desc: man, height: 1.98, head: 0.42, width: 0.62,
    walk: { stepLen: 0.6, stepTime: 0.42 }, run: { stepLen: 0.5, stepTime: 0.19 }, performer: {},
    poses: ['stand', 'crouch', 'sit'], gestures: GESTURES, expressions: EXPRESSIONS,
    params: { wardrobe: ['work'] }, look: (p) => (p.wardrobe === 'work' ? manWork : man) },
  girl: { kind: 'biped', desc: girl, height: 1.04, head: 0.36, width: 0.4,
    walk: { stepLen: 0.3, stepTime: 0.4 }, run: { stepLen: 0.4, stepTime: 0.175 }, performer: { armSpread: 0.62, armSwing: 0.6, seed: 5 },
    poses: ['stand', 'crouch', 'sit'], gestures: GESTURES, expressions: EXPRESSIONS },
  // Milo, a boy of about six (cast/boy.mjs); "params": { "skin", "hair", "shirt", "shorts" } colours "#rrggbb"
  boy: { kind: 'biped', desc: boy, height: 1.1, head: 0.33, width: 0.42,
    walk: { stepLen: 0.34, stepTime: 0.36 }, run: { stepLen: 0.42, stepTime: 0.17 }, performer: { armSwing: 0.6, toeOut: 0.2, seed: 11, runArms: { twist: -0.4, spread: 0.18 } },
    poses: ['stand', 'crouch', 'sit'], gestures: GESTURES, expressions: EXPRESSIONS,
    feet: 'socks', params: { skin: '#', hair: '#', shirt: '#', shorts: '#' }, look: (p) => boyWith({ skin: hex(p.skin), hair: hex(p.hair), shirt: hex(p.shirt), shorts: hex(p.shorts) }) },
  cat: { kind: 'quadruped', desc: cat, height: 0.5, head: 0.16, width: 0.68,
    walk: { stride: 0.26, beat: 0.16 }, run: { stride: 0.28, beat: 0.115 },
    poses: ['stand', 'sit'], gestures: { skid: 0.5, meow: 0.7 }, expressions: ['neutral'] },
  // a small rounded hatchback (car/): it drives along the place's road and drive; "params": { "color": "#rrggbb" }
  car: { kind: 'car', height: 1.72, head: 0.4, width: 1.9, params: { color: '#' },
    walk: { stepLen: 1, stepTime: 0.2 }, run: { stepLen: 1, stepTime: 0.2 },
    poses: ['stand'], gestures: {}, expressions: ['neutral'] },
  ball: { kind: 'prop', r: 0.085, height: 0.17, head: 0.17, width: 0.17,
    walk: { stepLen: 1, stepTime: 1 }, run: { stepLen: 1, stepTime: 0.5 },
    poses: ['stand'], gestures: {}, expressions: ['neutral'] },
};

/** The description a cast entry ({ rig, params }) is drawn with: its rig's, in the look its params give. */
export const descOf = (c) => { const R = RIGS[c.rig]; return R.look ? R.look(c.params ?? {}) : R.desc; };

const rigs2d = new Map();
/** The flat stand-in the film compiler times a 3D rig with, or undefined for a name with no 3D rig. */
export function rig2d(name) {
  const R = Object.hasOwn(RIGS, name) ? RIGS[name] : null;
  if (!R) return undefined;
  if (rigs2d.has(name)) return rigs2d.get(name);
  const h = R.height * PX, w = R.width * PX, hd = R.head * PX;
  const speed = p => (p.stride ? p.stride / 2 / p.beat : p.stepLen / p.stepTime) * PX;
  const rig = makeRig({
    kind: name, label: name, height: h, headHeight: hd, width: w, noShadow: true, upright: true, params: {},
    expressions: R.expressions,
    speeds: { walk: speed(R.walk), run: speed(R.run), hop: speed(R.run) }, stride: { walk: w, run: w, hop: w },
    poses: Object.fromEntries(R.poses.map(n => [n, { lift: 0 }])),
    gaits: { walk: () => ({ lift: 0 }), run: () => ({ lift: 0 }), hop: () => ({ lift: 0 }) },
    gestures: Object.fromEntries(Object.entries(R.gestures).map(([n, dur]) => [n, { dur, at: (u, b) => b }])),
    // what it carries is held in front of the chest
    mount: () => [w * 0.3, -h * 0.6],
    paint(T, p, F, o) {
      T.beginPath(); T.rect(-w / 2, -h, w, h); T.fill();
      o.out.head = T.map(0, -h + hd / 2); o.out.mouth = o.out.head;
    },
  });
  rig.feet = R.feet;   // ("socks": its steps are soft)
  rigs2d.set(name, rig);
  return rig;
}

// ───────────── kits ─────────────
// A 3D place: `floor` (where feet may go, metres), `stage` (the part of it the camera frames: an actor outside it is in
// the wings and is not framed), `anchors` (name → [x, z], the names a storyboard uses), `sides` (where an entrance
// from "left" / "right" starts and an exit to it ends, out of the picture), heightAt(x, z) (what stands there stands
// that high: a sofa seat), seat(x, z, leg) (where a two-legged actor whose legs are `leg` long sits at a mark on or
// just in front of a seat: { on: [x, y, z] under its hips, front: [x, z] where it stands first }, or null), `view` (the establishing camera, and the side every camera looks from), `bounds` (where a
// camera may be), `times` (the times of day it has a light for: rows of light.mjs LIGHTS), build(stage) →
// { update(t), light(time, area) } (the set, what moves in it, and its light at a time of day). A kit with `areas`
// (name → { view, stage, bounds }) is filmed from the area a set names ({ "kit": "home", "area": "outside" }).
export const KITS = {
  room: {
    floor: { x0: -4.4, x1: 2.3, z0: -1.95, z1: 5.2 },
    stage: { x0: -3.3, x1: 2.3, z0: -1.95, z1: 1.8 },
    anchors: {
      centre: [0.2, -0.3], rug_left: [-0.5, -0.45], rug_right: [0.95, -0.45], rug_front: [0.4, 0.45], rug_back: [0.12, -0.82],
      sofa: [ROOM.sofa.x - 0.35, ROOM.sofa.z + 0.2], window: [-2.4, -1.1], lamp: [1.5, -1.1],
      door_left: [-4.2, -0.6], by_camera: [1.95, 4.7],
    },
    sides: { left: [-4.2, -0.6], right: [1.95, 4.7] },
    heightAt: (x, z) => (Math.abs(x - ROOM.sofa.x) < 0.95 && Math.abs(z - ROOM.sofa.z - 0.1) < 0.4 ? ROOM.sofa.seatY + 0.01 : 0),
    seat: sofaSeat,
    view: { target: [0.12, 1.12, 0], az: 0, el: 0.04, dist: 7.45, fov: 25 },
    bounds: { x0: -4.3, x1: 2.2, y0: 0.25, y1: 2.9, z1: 9.2 },
    times: ['dawn', 'morning', 'noon', 'afternoon', 'golden', 'sunset', 'twilight', 'night'].filter(t => Object.hasOwn(LIGHTS, t)), defaultTime: 'golden',
    stageOptions: { rays: true },
    build(stage) {
      const room = livingRoom(stage);
      return { update: room.update, light(time) { stage.setLight(time); } };
    },
  },
  // the house round the living room, its garden, drive and street (home/kit.mjs): a set names an area, inside or outside
  home: HOME_KIT,
};

const kits2d = new Map();
/** The flat stand-in kit ((params) => set) the film compiler times a 3D kit with, or undefined. */
export function kit2d(name) {
  const K = Object.hasOwn(KITS, name) ? KITS[name] : null;
  if (!K) return undefined;
  if (!kits2d.has(name)) kits2d.set(name, () => {
    const F = K.floor, [x0, y0] = toPx([F.x0, F.z0]), [x1, y1] = toPx([F.x1, F.z1]), [, lane] = toPx(K.anchors.centre ?? [0, (F.z0 + F.z1) / 2]);
    // (the film compiler puts an actor who is "offstage" 600 px outside the area: about where the kit's sides are)
    const [sl] = toPx(K.sides.left), [sr] = toPx(K.sides.right);
    const S = makeSet({
      id: name, W: 1920, H: 1080, refX: X0, refY: lane - 100,
      area: { x0: Math.min(x0, sl + 600), x1: Math.max(x1, sr - 600), y0: y0 - 400, y1: y1 + 400 }, view: { x0, x1, y0: y0 - 400, y1 },
      horizon: lane - 1000, laneY: lane, baseS: 1, scaleAt: () => 1, surface: 'wood',
      times: Object.fromEntries(K.times.map(t => [t, {}])), defaultSky: K.defaultTime, groundShadows: false,
      layers: [], props: [],
      anchors: Object.fromEntries(Object.entries(K.anchors).map(([n, p]) => { const [x, y] = toPx(p); return [n, { x, y }]; })),
      walk: { region: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] },
    });
    // what the ground is at a mark (the footsteps' sound): the kit's own, or boards everywhere
    if (K.surface) S.surfaceAt = (x, y) => K.surface(...toM(x, y));
    return S;
  });
  return kits2d.get(name);
}
