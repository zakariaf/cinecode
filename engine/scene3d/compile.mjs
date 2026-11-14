// The second compile step of a 3D film: the timed plan of engine/film/compile.mjs → the scene description the 3D
// engine draws (index.mjs openScene: { fps, duration, stage, build(stage) → { cast, update(t) } }).
//
// The film compiler lays the film out on the kit's flat stand-in (library.mjs), and times every action on the 3D motion
// system as it goes (createTiming): each beat's action starts at its time (or, when its actor is still busy with the
// one before, as soon as that ends) and takes as long as the 3D actor really needs from where it stands, so the plan,
// its captions and sound cues and the picture agree. This step reads that and draws the 3D performance, scene by
// scene, in the scene's own time (so a spring starts with its scene, not with the film):
//   the place    the set's kit → KITS[kit].build(stage), its light by the scene's time of day
//   the actors   a cast entry's rig → a character (buildCharacter + createBiped / createQuadruped), a prop (a ball) or
//                a car (car/drive.mjs createCar; a two-legged actor may ride in it, at the wheel: car/driver.mjs)
//   the acting   each actor's part as the timing laid it out (enter, exit, walk, run (a cat trots), hop (a cat's leap or
//                pounce; a carried ball's throw; a ball picked up: hop "on:<actor>"), roll (a ball), drive and stop (a
//                car), place (a rider out of its car), turn, sit (on a seat or the floor) and stand, pose crouch, gesture
//                jump and a cat's skid, a cat's bat (a ball rolled "from" it)), the car's lamps, engine and door and the
//                place's front door (set, open, close), with wave, point and
//                clap laid over it; and read off the actor's tracks at every instant: look (head and eyes), the
//                expression held, the mouth of a spoken line (the same lip signal a 2D film draws), blinks
//   the camera   size, on, move, angle, turn → a framing solved from the subjects' joints over the shot (cameraFor)
//
// Nothing here needs a GPU: build(stage) lays the plans, update(t) poses. unbuilt(film) lists, for `cinecode check`,
// what a storyboard asks for that the 3D engine does not do yet.
import * as THREE from 'three/webgpu';
import { buildCharacter } from './character.mjs';
import { createBiped } from './biped.mjs';
import { createPerformer, TURN_FIRST } from './performer.mjs';
import { createQuadruped, createCritter } from './quadruped.mjs';
import { throwTo, rollTo, rollBall, pickUp, ballMesh } from './ball.mjs';
import { createCar } from './car/drive.mjs';
import { buildCar, CAR } from './car/car.mjs';
import { seatDriver } from './car/driver.mjs';
import { smoother, clamp } from './motion.mjs';
import { RIGS, KITS, toM, toPx, sideYaw, rig2d, kit2d, descOf } from './library.mjs';
import { layoutCaption } from '../film/text.mjs';
import { DO } from '../film/validate.mjs';

export { rig2d, kit2d };
export const rigNames = () => Object.keys(RIGS).sort();
export const kitNames = () => Object.keys(KITS).sort();

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const faceVal = f => (f === 'left' || f === -1 ? -1 : f === 'right' || f === 1 ? 1 : 0);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ───────────── what is not built yet ─────────────
// What each kind of rig can be told to do.
const CAN = {
  biped: ['walk', 'run', 'enter', 'exit', 'turn', 'look', 'pose', 'sit', 'stand', 'gesture', 'emote', 'blink', 'place'],
  quadruped: ['walk', 'run', 'hop', 'enter', 'exit', 'turn', 'look', 'sit', 'stand', 'emote', 'gesture'],
  prop: ['hop', 'roll'],
  car: ['drive', 'stop', 'set'],
};
// the actions only a 3D film has (validate.mjs takes them for a 3D film: ctx.do3); open and close name no actor
const OWN = ['drive', 'stop', 'roll', 'open', 'close'];
/** Every action some 3D rig can be told to do (what an unknown action's message lists). */
export const verbNames = () => [...new Set([...Object.values(CAN).flat(), ...OWN])];
const POINT = /^x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)$/;
const CAMERA_KEYS = ['size', 'on', 'move', 'angle', 'to', 'toOn', 'zoom', 'zoomTo', 'moveAt', 'moveDur', 'area', 'turn'];
// a car's states a "set" beat changes ("params": { "lights": "on", "engine": "off" })
const CAR_SET = { lights: ['on', 'off'], engine: ['on', 'off'] };
const onOff = v => v === true || v === 'on';

/** Problems ({ path, message }, as validate.mjs lists them) for everything a 3D film's storyboard asks that is not built. */
export function unbuilt(film) {
  const out = [], P = (path, what) => out.push({ path, message: `${path}: ${what} is not built for the 3D engine yet` });
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const kind = id => RIGS[obj(obj(film.cast)[id]).rig]?.kind;
  if (obj(film.format).style === 'lineart') P('format.style', 'line art');
  // (the picture is drawn twice as large each way: stage.mjs SS; a GPU texture is at most 8192 px)
  for (const k of ['width', 'height']) if (obj(film.format)[k] > 4096) P(`format.${k}`, `a picture more than 4096 px ${k === 'width' ? 'wide' : 'high'}`);
  for (const [id, c] of Object.entries(obj(film.cast))) {
    if (!kind(id)) continue;
    // (the params its rig takes: a car's paint "color": "#3a908e", the man's "wardrobe": "work", the boy's colours)
    const spec = RIGS[c.rig].params ?? {}, has = Object.keys(spec);
    for (const [k, v] of Object.entries(obj(c.params))) {
      const at = `cast.${id}.params.${k}`;
      if (!Object.hasOwn(spec, k)) P(at, `the param "${k}" for the rig "${c.rig}"${has.length ? ` (it has: ${has.join(', ')})` : ''}`);
      else if (spec[k] === '#' ? !/^#[0-9a-f]{6}$/i.test(v) : !spec[k].includes(v)) out.push({ path: at, message: `${at}: must be ${spec[k] === '#' ? 'a colour "#rrggbb"' : spec[k].map(x => `"${x}"`).join(' or ')} (got ${JSON.stringify(v)})` });
    }
    if (c.scale !== undefined && c.scale !== 1) P(`cast.${id}.scale`, 'a cast scale');
  }
  for (const [id, s] of Object.entries(obj(film.sets))) if (Object.keys(obj(s?.params)).length) P(`sets.${id}.params`, `params for the kit "${s.kit}"`);
  const scenes = Array.isArray(film.scenes) ? film.scenes.filter(s => obj(s) === s) : [];
  // (sets of one kit: the areas of one place, such as home's inside and outside)
  const kitsUsed = new Set(scenes.map(s => obj(obj(film.sets)[s.set]).kit));
  if (kitsUsed.size > 1) P('scenes', `more than one kit in a film (${[...kitsUsed].join(', ')})`);
  for (const [id, s] of Object.entries(obj(film.sets))) {
    const areas = KITS[obj(s).kit]?.areas;
    if (obj(s).area !== undefined && !Object.hasOwn(areas ?? {}, s.area)) out.push({ path: `sets.${id}.area`, message: `sets.${id}.area: the kit "${s.kit}" has ${areas ? `the areas ${Object.keys(areas).join(', ')}` : 'no areas'} (got ${JSON.stringify(s.area)})` });
  }
  scenes.forEach((sc, si) => {
    const sp = `scenes[${si}]`, prev = scenes[si - 1];
    if (obj(sc.time) === sc.time) P(`${sp}.time`, 'a time of day that changes over the scene');
    for (const k of ['grade', 'overlays', 'fx', 'rim']) if (sc[k] !== undefined && sc[k] !== 'none' && !(Array.isArray(sc[k]) && !sc[k].length)) P(`${sp}.${k}`, `a scene's "${k}"`);
    if (sc.transition === 'dissolve' || (prev && sc.transition === undefined && JSON.stringify(prev.time) !== JSON.stringify(sc.time)))
      P(`${sp}.transition`, 'a dissolve between scenes (the default when the time of day changes: give "transition": "cut" or "fade")');
    for (const [id, a] of Object.entries(obj(sc.actors))) {
      const ap = `${sp}.actors.${id}`, k = kind(id);
      if (!k || obj(a) !== a) continue;
      if (a.on !== undefined && !((k === 'prop' || k === 'biped') && kind(a.on) === (k === 'prop' ? 'biped' : 'car'))) P(`${ap}.on`, 'riding (only a prop held by a two-legged rig, or a two-legged rig at the wheel of a car)');
      if (a.on !== undefined && k === 'biped' && Object.entries(obj(sc.actors)).some(([o, b]) => o !== id && obj(b).on === a.on && kind(o) === 'biped')) out.push({ path: `${ap}.on`, message: `${ap}.on: a car takes one rider (its driver), and "${a.on}" has another` });
      if (a.pose !== undefined && !(a.pose === 'stand' || (k === 'quadruped' && a.pose === 'sit') || (k === 'biped' && (a.pose === 'sit' || a.pose === 'crouch')))) P(`${ap}.pose`, `starting in the pose "${a.pose}"`);
      for (const f of ['z', 'height']) if (a[f] !== undefined) P(`${ap}.${f}`, `a scene actor's "${f}"`);
      if (k === 'prop' && a.offstage !== undefined) P(`${ap}.offstage`, 'a prop that starts offstage');
      // (a face that names a place: an anchor of its kit, a point "x:…,y:…" or another actor of the scene)
      if (typeof a.face === 'string' && a.face !== 'left' && a.face !== 'right' && !(Object.hasOwn(KITS[obj(obj(film.sets)[sc.set]).kit]?.anchors ?? {}, a.face) || POINT.test(a.face) || (a.face !== id && obj(sc.actors)[a.face]?.at !== undefined)))
        out.push({ path: `${ap}.face`, message: `${ap}.face: "left", "right", or what it faces as the scene starts: an anchor of the set, a point "x:…,y:…" or another actor of the scene that stands "at" a place (got ${JSON.stringify(a.face)})` });
    }
    (Array.isArray(sc.shots) ? sc.shots : []).forEach((sh, hi) => {
      const hp = `${sp}.shots[${hi}]`;
      if (obj(sh) !== sh) return;
      for (const k of ['time', 'grade', 'gradeTo']) if (sh[k] !== undefined) P(`${hp}.${k}`, `a shot's "${k}"`);
      for (const k of Object.keys(obj(sh.camera))) if (!CAMERA_KEYS.includes(k)) P(`${hp}.camera.${k}`, `camera "${k}"`);
      const ar = obj(sh.camera).area, areas = KITS[obj(obj(film.sets)[sc.set]).kit]?.areas;
      if (ar !== undefined && !Object.hasOwn(areas ?? {}, ar)) out.push({ path: `${hp}.camera.area`, message: `${hp}.camera.area: the kit "${obj(obj(film.sets)[sc.set]).kit}" has ${areas ? `the areas ${Object.keys(areas).join(', ')}` : 'no areas'} (got ${JSON.stringify(ar)})` });
      const turn = obj(sh.camera).turn;
      if (turn !== undefined && !(Number.isFinite(turn) && Math.abs(turn) <= 180)) out.push({ path: `${hp}.camera.turn`, message: `${hp}.camera.turn: degrees from -180 to 180 that the camera swings round its subjects, + to its right (got ${JSON.stringify(turn)})` });
      (Array.isArray(sh.beats) ? sh.beats : []).forEach((b, bi) => {
        const bp = `${hp}.beats[${bi}]`;
        if (obj(b) !== b) return;
        if (b.fx !== undefined) P(`${bp}.fx`, `the effect "${b.fx}"`);
        if (b.say !== undefined && !b.vo && kind(b.say) && kind(b.say) !== 'biped') P(`${bp}.say`, `a line spoken on screen by the rig "${obj(film.cast)[b.say].rig}" (its mouth does not move: "vo": true makes it a voice-over)`);
        if (b.do === undefined) return;
        const k = kind(b.who), rig = obj(film.cast)[b.who]?.rig;
        if (b.do === 'custom') { P(`${bp}.do`, 'a custom beat'); return; }
        const E = (f, m) => out.push({ path: `${bp}.${f}`, message: `${bp}.${f}: ${m}` });
        // open / close: the place's front door ("to": "door") or a car's door ("to": its cast id); no one does it
        if (b.do === 'open' || b.do === 'close') {
          const doors = Object.keys(KITS[obj(obj(film.sets)[sc.set]).kit]?.doors ?? {});
          // ("who": a two-legged actor of the scene whose hand is on the door's handle as it swings: it pulls it open, or
          // pushes it shut; the door swings as it would without it)
          if (b.who !== undefined && kind(b.who) !== 'biped') E('who', `whose hand opens or closes the door: a two-legged actor of the cast (got ${JSON.stringify(b.who)}); with none, the door swings by itself`);
          if (!(doors.includes(b.to) || kind(b.to) === 'car')) E('to', `what to ${b.do}: ${[...doors.map(d => `"${d}"`), 'a car of the cast'].join(' or ')} (got ${JSON.stringify(b.to)})`);
          return;
        }
        if (!k || !(DO.includes(b.do) || OWN.includes(b.do))) return;   // (an unknown action: validate.mjs says so)
        if (!CAN[k].includes(b.do)) { P(`${bp}.do`, `"${b.do}" for the rig "${rig}" (it can: ${CAN[k].join(', ')})`); return; }
        for (const f of ['gait', 'wade', 'depth', 'height', 'fly', 'z', 'tilt', 'end', 'alpha', 'params']) if (b[f] !== undefined && !(f === 'params' && k === 'car' && b.do === 'set')) P(`${bp}.${f}`, `"${f}" on a ${b.do}`);
        if (k === 'car' && b.do === 'set') {
          for (const [f, v] of Object.entries(obj(b.params))) { if (!CAR_SET[f]) E(`params.${f}`, `a car's "set" changes ${Object.keys(CAR_SET).join(', ')}`); else if (!(CAR_SET[f].includes(v) || typeof v === 'boolean')) E(`params.${f}`, `must be "on" or "off" (got ${JSON.stringify(v)})`); }
          for (const f of ['pose', 'expr']) if (b[f] !== undefined) E(f, `a car has no ${f === 'pose' ? 'pose' : 'expression'}`);
        }
        if (b.pose !== undefined && b.do !== 'pose' && b.do !== 'set') P(`${bp}.pose`, `"pose" on a ${b.do}`);
        if (typeof b.to === 'string' && b.to.startsWith('on:') && !(k === 'prop' && b.do === 'hop' && kind(b.to.slice(3)) === 'biped')) P(`${bp}.to`, 'getting onto another actor (but a ball picked up: "hop" to "on:<a two-legged actor>")');
        if (b.do === 'gesture' && k === 'quadruped' && !['skid', 'meow'].includes(b.name)) E('name', `a cat's gesture is "skid" or "meow" (got ${JSON.stringify(b.name)})`);
        if (b.do === 'roll' && b.from !== undefined && kind(b.from) !== 'quadruped') E('from', `who bats the ball: a cat in the scene (got ${JSON.stringify(b.from)}; a person rolls it from the hands it is in, or picks it up)`);
        if (b.arrive !== undefined && !(b.do === 'drive' && typeof b.arrive === 'number' && b.arrive > 0)) E('arrive', b.do === 'drive' ? 'must be the seconds from the shot\'s start at which the car stops on its mark' : `only a drive arrives at a time (a ${b.do} cannot)`);
        if (b.dur !== undefined && ['drive', 'roll'].includes(b.do) && !(typeof b.dur === 'number' && b.dur > 0)) E('dur', `must be how many seconds the ${b.do === 'drive' ? 'drive' : 'roll'} takes (more than 0)`);
        if (b.do === 'drive' && b.dur !== undefined && b.arrive !== undefined) E('arrive', 'give the drive a "dur" or an "arrive", not both');
      });
    });
  });
  return out;
}

// ───────────── the timing ─────────────
// The film compiler asks createTiming, beat by beat as it lays the film out, how long each action really takes in 3D
// from where the actor stands then, and when an actor still busy with its previous action can start the next. It acts
// the beats out on performers of its own (no GPU, never drawn) and keeps, for each actor of each scene (rec.three),
// what it told the performer: the build replays exactly that on the drawn characters, so the plan and the picture agree.

/** A storyboard asks for something the 3D engine cannot play as written (its message names what). */
export class StoryError extends Error { name = 'StoryError'; }
/** Anything else thrown while a 3D film is staged is a fault of the engine: it reads as one, with its stack. */
export const engineFault = e => (e instanceof StoryError ? e : new Error(`a fault in the 3D engine (not in the storyboard): ${e?.stack ?? e}`, { cause: e }));

// The actions that move an actor's clock: each waits for the one before it to end. Looks, faces, lines, the gestures
// wave, point and clap, a cat's meow, a car's lamps and engine, the doors, a car's stop (it brakes during its drive) and a ball's
// roll (a ball still rolling is batted on from where it is) are laid over whatever the actor is doing.
const VERBS = { biped: ['walk', 'run', 'enter', 'exit', 'turn', 'pose', 'sit', 'stand'], quadruped: ['walk', 'run', 'enter', 'exit', 'hop', 'turn', 'sit', 'stand', 'gesture'], prop: ['hop'], car: ['drive'] };
const isVerb = (kind, b) => (VERBS[kind].includes(b.do) && !(b.do === 'gesture' && b.name === 'meow')) || (kind === 'biped' && b.do === 'gesture' && b.name === 'jump');

// the characters the timing lays plans on (built once a process for each rig and look, never drawn)
const RIGS3 = new Map();
const timingRig = c => {
  const key = JSON.stringify([c.rig, c.params ?? {}]);
  if (!RIGS3.has(key)) { const R = RIGS[c.rig], ch = R.desc ? buildCharacter(descOf(c)) : null; RIGS3.set(key, { R, ch, rig: ch && (R.kind === 'biped' ? createBiped(ch) : createQuadruped(ch)) }); }
  return RIGS3.get(key);
};
const spotOf = (A, t) => { const p = A.posAt(t); return toM(p.x, p.y); };

// Where an actor starts in a scene: at its place; in the wings (offstage) on the side its entrance (`enter`: { beat,
// t }) names; a prop on the floor or in someone's hands (carriedBy); a car on the place's road or drive as the kit
// stands it (carStart); a two-legged actor at the wheel of a car (riding: drawn in it until a "place" puts it out).
function startOf(rec, id, K, enter, kind) {
  const A = rec.actors.get(id), p0 = A.place0, f = rec.sc.actors[id]?.face, T = typeof f === 'string' && POINT.exec(f), o = rec.actors.get(f)?.place0?.pos;
  // (a face that names a place: turned to it; else left or right, three quarters toward the inside's cameras)
  const there = T ? toM(+T[1], +T[2]) : K.anchors[f] ?? (o && toM(o.x, o.y)), here = toM(p0.pos.x, p0.pos.y);
  const yaw0 = there && f !== 'left' && f !== 'right' ? Math.atan2(there[0] - here[0], there[1] - here[1]) : sideYaw(A.faceEv[0].face);
  if (kind === 'prop') return p0.mount ? { carriedBy: p0.mount.id } : { at: toM(p0.pos.x, p0.pos.y) };
  if (kind === 'car') { const at = toM(p0.pos.x, p0.pos.y); return K.carStart?.(at, yaw0) ?? { at, yaw: yaw0 }; }
  if (p0.mount) return { at: toM(p0.pos.x, p0.pos.y), yaw: yaw0, off: true, riding: p0.mount.id };
  const off = p0.pos.mode === 'off', from = enter?.beat.from, side = /^(left|right)$/.test(from ?? '') ? from : A.offSide || 'left';
  const at = !off ? toM(p0.pos.x, p0.pos.y) : from !== undefined && from !== side ? spotOf(A, enter.t + 1e-3) : K.sides[side];
  const pose = A.poseEv[0].name;
  return { at, off, yaw: off ? sideYaw(side === 'left' ? 1 : -1) : yaw0, sit: pose === 'sit', crouch: pose === 'crouch' };
}
// An actor's part in a scene: where it starts, the performer calls in order ([verb, [args]]), the gestures laid over
// them, when it is in the picture; and while the timing runs, `busy` (when its last action ends). A ball's part keeps
// what is done with it (ops) and, while the timing runs, its path so far (legs).
const partOf = (kind, start) => ({ kind, start, calls: [], gestures: [], busy: 0, shown: start.off ? Infinity : -Infinity, hidden: Infinity, sitting: !!start.sit, crouched: !!start.crouch, ops: [] });

function performerOf({ R, rig }, start, K) {
  if (R.kind === 'car') return createCar({ at: start.at, yaw: start.yaw, mesh: null });
  if (R.kind === 'biped') {
    // (a scene that opens with it sitting or crouched: it sat down, or crouched, before the scene began, so it is
    // settled by its first frame; on a seat it stands in front of it first)
    const seat = start.sit && K.seat(...start.at, rig.info.legLength);
    const act = createPerformer(rig, { ...R.performer, at: seat ? seat.front : start.at, yaw: start.yaw, stepLen: R.walk.stepLen, stepTime: R.walk.stepTime });
    if (start.sit) act.sit({ t0: -3.5, on: seat?.on });
    else if (start.crouch) act.crouch({ t0: -2, dur: 0.7, amount: 1 });
    return act;
  }
  return createCritter(rig, { at: [start.at[0], K.heightAt(...start.at), start.at[1]], yaw: start.yaw, sit: start.sit ? 1 : 0, tailSide: -1 });
}

// A ball held in both hands by `act` from the start; with a release, thrown then to land short of `mark` on the line to
// it and roll on to rest on it (the aim found by bisection). → holdBall's { at(t), path() }
function holdBall(act, r, release, mark) {
  const aim = { vy: 3.4 }, ball = act.holdBall({ t0: -1, r, release, aim, ball: { grip: 0.55 } });
  if (release === undefined) return ball;
  const P = ball.at(release).pos, dx = mark[0] - P[0], dz = mark[1] - P[2], L = Math.hypot(dx, dz);
  const restAt = s => { const q = throwTo({ t0: release, p0: P, to: [P[0] + dx * s, P[2] + dz * s], vy: aim.vy, r, grip: 0.55 }).rest; return Math.hypot(q[0] - P[0], q[2] - P[2]) / L; };
  let lo = 0.01, hi = 1;
  for (let i = 0; i < 40; i++) { const s = (lo + hi) / 2; if (restAt(s) < 1) lo = s; else hi = s; }
  aim.to = [P[0] + dx * lo, P[2] + dz * lo];   // (holdBall throws with it at its first pose after the release)
  return ball;
}
// One thing done with a ball, laid on the performers actOf(id) gives (the hands' part: layers, which move no clock):
//   ['hold', by]                 held in both hands all along
//   ['throw', by, release, mark] held, then thrown at `release` to come to rest on `mark`
//   ['hand', by, t0, mark, stop] held, then rolled along the floor by a sitting (or crouched) actor, pushed off at t0
//   ['roll', t0, p0, mark, stop] set rolling along the floor from p0 ([x, z]) at t0 (batted, or out from under a pounce)
//   ['pick', by, t0, grab, at]   picked up off the floor at `at` ([x, y, z]): reached for from t0, carried from grab
//   ['rest', at]                 lying on the floor at `at` ([x, y, z])
// → { t0 (from when the ball is where this says), at(t) → { pos, angle, axis, squash, vel }, tStop (when it rests) }
const STILL = new THREE.Vector3(1, 0, 0);
function ballOp(op, actOf, r) {
  switch (op[0]) {
    case 'hold': return { t0: -Infinity, at: holdBall(actOf(op[1]), r).at, tStop: Infinity };
    case 'throw': { const b = holdBall(actOf(op[1]), r, op[2], op[3]); return { t0: -Infinity, at: b.at, tStop: b.path().tStop }; }
    case 'hand': { const b = rollBall(actOf(op[1]), { from: -1, t0: op[2], to: op[3], stop: op[4], r }); return { t0: -Infinity, at: b.at, tStop: b.tStop }; }
    case 'roll': { const b = rollTo({ t0: op[1], p0: op[2], to: op[3], stop: op[4], r }); return { t0: op[1], at: b.at, tStop: b.tStop }; }
    case 'pick': return { t0: op[3], at: pickUp(actOf(op[1]), op[4], { t0: op[2], grab: op[3], r }).at, tStop: Infinity };
    default: { const still = { pos: op[1], angle: 0, axis: STILL, squash: 1, vel: [0, 0, 0] }; return { t0: -Infinity, at: () => still, tStop: -Infinity }; }
  }
}
// where a ball is at t on its path so far (legs: ballOp's, in order)
const ballAt = (legs, t) => (legs.findLast(l => l.t0 <= t) ?? legs[0]).at(t);
// the ball's legs in a scene (ops: what is done with it; start: where it starts; in someone's hands, held until the
// first op unless that throws or rolls it), on the performers actOf(id) gives
const ballLegs = (ops, start, r, K, actOf) => [
  ...(start.carriedBy ? (['throw', 'hand'].includes(ops[0]?.[0]) ? [] : [['hold', start.carriedBy]]) : [['rest', [start.at[0], K.heightAt(...start.at) + r, start.at[1]]]]),
  ...ops,
].map(op => ballOp(op, actOf, r));

// Where the move from p to q ([x, z], scene times t0 to t1) passes through one of the place's walls (K.walls): through a
// door only while it stands open (doorAt(film time) at least 3/4), never where the wall has no opening.
function throughWalls(K, id, p, q, t0, t1, T0, doorAt) {
  const fmt = v => `[${v.map(x => x.toFixed(2)).join(', ')}]`;
  for (const w of K.walls ?? []) {
    const d = [q[0] - p[0], q[1] - p[1]], e = [w.b[0] - w.a[0], w.b[1] - w.a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const u = ((w.a[0] - p[0]) * e[1] - (w.a[1] - p[1]) * e[0]) / den, v = ((w.a[0] - p[0]) * d[1] - (w.a[1] - p[1]) * d[0]) / den;
    if (u <= 0 || u >= 1 || v < 0 || v > 1) continue;
    const x = w.a[0] + e[0] * v, z = w.a[1] + e[1] * v, t = T0 + t0 + (t1 - t0) * u;
    if (w.gap && z >= w.gap[0] && z <= w.gap[1]) continue;
    if (w.door && Math.abs(x - w.door.at) <= w.door.half) {
      const o = doorAt(t);
      if (o >= 0.75) continue;
      throw new StoryError(`${id} goes through the front door at ${t.toFixed(2)} s while it is ${o > 0.02 ? 'only part open' : 'shut'}: open it before ({ "do": "open", "to": "door" })`);
    }
    throw new StoryError(`${id}'s way from ${fmt(p)} to ${fmt(q)} goes through ${w.name}: go by "${w.via}" (two moves)`);
  }
}

// One beat acted out by actor `id` at scene time a (part: its part, act: its performer, or a car's plan; C: its rig).
// → the scene time it ends, or undefined when it is laid over the actor's doing (it then takes the flat stage's time).
function play(b, a, { id, part, act, C, A, K, actOf, partIn, t, T0, shotT0, doorAt, film }) {
  const call = (verb, ...args) => { part.calls.push([verb, args]); return act[verb](...args); };
  // (an action another actor plays for this beat: kept with that actor's own calls)
  const callOn = (who, verb, ...args) => { partIn(who).calls.push([verb, args]); return actOf(who)[verb](...args); };
  const mv = A.moves.find(m => Math.abs(m.t0 - t) < 1e-6 && (m.kind === b.do || OWN.includes(b.do)));
  const to = () => (mv ? toM(mv.end.x, mv.end.y) : spotOf(A, t + 1e-3)), face = faceVal(b.face), speed = b.speed ?? 1;
  const side = b.do === 'exit' && /^(left|right)$/.test(b.to ?? '') ? K.sides[b.to] : null, R = C.R;
  const walls = (p, q, t0, t1) => throughWalls(K, id, p, q, t0, t1, T0, doorAt);
  // a ball the beat goes to ("near:<ball>"): its part
  const ball = (/^near:(.+)$/.exec(b.to ?? '') ?? [])[1], ballPart = ball && RIGS[film.cast[ball]?.rig]?.kind === 'prop' ? partIn(ball) : null;
  const ballPos = (q, tt) => { if (!q.legs.length) throw new StoryError(`${ball} is in ${q.start.carriedBy}'s hands at ${(tt + T0).toFixed(2)} s: it can be gone to once it is on the floor`); return ballAt(q.legs, tt).pos; };
  if (R.kind === 'prop') {
    const by = part.start.carriedBy, held = by && !part.ops.length, r = R.r;
    // (each op's leg laid once on the timing's performers, as the drawn ones get it: ballLegs)
    const P = tt => ballPos(part, tt), add = op => { part.ops.push(op); part.legs.push(ballOp(op, actOf, r)); return part.legs.at(-1); };
    if (part.picked) throw new StoryError(`${id} is in ${part.picked}'s hands (it picked it up): it is carried to the end of the scene`);
    // picked up: the actor goes to it if it is out of reach, crouches, takes it with the right hand and stands with it
    if (b.do === 'hop' && b.to?.startsWith('on:')) {
      const who = b.to.slice(3), q = partIn(who), w = actOf(who);
      if (held) throw new StoryError(`${id} is in ${by}'s hands: a ball is picked up off the floor`);
      if (q.sitting) throw new StoryError(`${who} is sitting: give it a "stand" before it picks up ${id}`);
      let s = Math.max(a, q.busy, part.legs.at(-1).tStop);
      const at = P(s), p = w.cur.pos, d = Math.hypot(at[0] - p[0], at[2] - p[1]), near = 0.4 * w.opts.size;
      if (d > near * 1.3) { const goal = [at[0] - (at[0] - p[0]) / d * near, at[2] - (at[2] - p[1]) / d * near]; s = callOn(who, 'walkTo', goal, { t0: s, face: [at[0], at[2]] }); throughWalls(K, who, p, goal, a, s, T0, doorAt); }
      const grab = s + 0.6;
      callOn(who, 'crouch', { t0: s, dur: 0.55, amount: 0.9 });
      const end = callOn(who, 'crouch', { t0: grab + 0.1, dur: 0.6, amount: 0 });
      add(['pick', who, s, grab, at]); part.picked = who;
      q.busy = Math.max(q.busy, end); q.shown = Math.min(q.shown, a - 0.05);
      return end;
    }
    if (b.do === 'hop') {
      if (!held) throw new StoryError(`${id} is not in anyone's hands (a 3D prop is thrown from the hands it starts in: "on": "<actor>" in the scene's actors)`);
      // the hands wind up for 0.6 s, then let go; the throw ends when the ball comes to rest on its mark
      return add(['throw', by, a + 0.6, to()]).tStop;
    }
    // roll: from the hands it is in (a sitting or crouched actor: the hands take it down to the floor and push it off),
    // or along the floor from where it is then, batted by the cat named in "from" (its paw meets it as it sets off)
    const mark = to(), dur = b.dur;
    if (held) {
      const q = partIn(by);
      if (!q.sitting && !q.crouched) throw new StoryError(`${by} is standing: it rolls ${id} along the floor sitting or crouched (a "sit", or "pose": "crouch", first), or throws it (a "hop")`);
      const t0 = Math.max(a, q.busy) + 0.6;
      q.busy = Math.max(q.busy, t0 + 0.75);
      return add(['hand', by, t0, mark, dur && t0 + dur]).tStop;
    }
    let t0 = a;
    if (b.from !== undefined) {
      const q = partIn(b.from), cat = actOf(b.from);
      if (q.sitting) throw new StoryError(`${b.from} is sitting: give it a "stand" before it bats ${id}`);
      // (the paw goes out as soon as it is down: written "with" a pounce, it knocks the ball on as the cat lands)
      t0 = Math.max(a, ...['FL', 'FR'].map(n => cat.tracks[n].steps.at(-1)?.t1 ?? -Infinity)) + 0.14;
      const p = P(t0), st = cat.stance(cat.cur.at, cat.cur.yaw, 0), f = [(st.FL[0] + st.FR[0]) / 2, (st.FL[2] + st.FR[2]) / 2], gap = Math.hypot(p[0] - f[0], p[2] - f[1]);
      if (gap > 0.3) throw new StoryError(`${b.from}'s front paws are ${gap.toFixed(2)} m from ${id} at ${(t0 + T0).toFixed(2)} s: a cat bats a ball 0.3 m from them at most (bring it "near:${id}" first)`);
      const L = Math.hypot(mark[0] - p[0], mark[1] - p[2]) || 1, k = (r + 0.02) / L;
      q.busy = Math.max(q.busy, callOn(b.from, 'bat', { t0, at: [p[0] - (mark[0] - p[0]) * k, 0, p[2] - (mark[1] - p[2]) * k] }));
    }
    const p = P(t0);
    return add(['roll', t0, [p[0], p[2]], mark, dur && t0 + dur]).tStop;
  }
  if (R.kind === 'car') {
    switch (b.do) {
      // along the place's road and drive (K.route) to its mark; at its own pace (speed scales it), or taking `dur`, or
      // arriving `arrive` seconds into the shot (the speed found by bisection). The first drive at a scene's very start
      // comes in at speed.
      case 'drive': {
        const from = act.where(a), yaw = act.heading(a), r = K.route ? K.route(from, yaw, to()) : { marks: [to()] };
        if (r.error) throw new StoryError(`${id} cannot drive to ${b.to}: ${r.error}`);
        const rolling = a < 0.05 && !part.calls.some(c => c[0] === 'driveTo');
        const trial = v => createCar({ at: from, yaw, mesh: null }).driveTo(r.marks, { t0: a, speed: v, rolling }) - a;
        const want = b.dur ?? (b.arrive !== undefined ? shotT0 + b.arrive - (T0 + a) : undefined);
        let v = 5 * speed;
        if (want !== undefined) {
          if (!(want > 0)) throw new StoryError(`${id}'s drive starts at ${(T0 + a - shotT0).toFixed(2)} s into the shot, after its "arrive" (${b.arrive} s)`);
          const fast = trial(25), slow = trial(0.4);
          if (fast > want + 0.02) throw new StoryError(`${id} cannot drive to ${b.to} in ${want.toFixed(2)} s: it takes at least ${fast.toFixed(2)} s (it speeds up, brakes and takes its bends as a car can)`);
          if (slow < want) throw new StoryError(`${id}'s drive to ${b.to} takes ${slow.toFixed(2)} s at its slowest: give it less time than ${want.toFixed(2)} s, or a "wait" first`);
          let lo = 0.4, hi = 25;
          for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (trial(m) > want) lo = m; else hi = m; }
          v = hi;
        }
        return call('driveTo', r.marks, { t0: a, speed: v, rolling });
      }
      case 'stop': return call('stop', { t0: a });
      case 'set':
        for (const [k, val] of Object.entries(b.params ?? {})) call(k, onOff(val), { t0: a });
        return undefined;
      default: return undefined;
    }
  }
  if (R.kind === 'quadruped') {
    const to3 = p => [p[0], K.heightAt(...p), p[1]], front = C.rig.info.front[1];
    // where a cat stands to have a ball at its front paws, coming at it from where it is
    const atBall = (q, cur) => { const L = Math.hypot(q[0] - cur[0], q[2] - cur[2]) || 1, k = (front + ballPart.start.r + 0.03) / L; return [q[0] - (q[0] - cur[0]) * k, q[2] - (q[2] - cur[2]) * k]; };
    // a trot to a floor mark at the rig's pace (walk or run); to a ball, to where it comes to rest
    const trot = (pace, p, t0) => {
      if (part.sitting) throw new StoryError(`${id} is sitting: give it a stand (or a hop) first`);
      if (ballPart) p = atBall(ballPos(ballPart, Math.max(t0, ballPart.legs.at(-1)?.tStop ?? t0)), act.cur.at);
      if (far([act.cur.at[0], act.cur.at[2]], p) < 0.05) return t0;
      if (part.shown === Infinity) part.shown = t0 - 0.05;
      const from = [act.cur.at[0], act.cur.at[2]], e = call('trot', { t0, to: to3(p), stride: pace.stride, beat: pace.beat / speed });
      walls(from, p, t0, e);
      return e;
    };
    // (a turn on the spot; from a sit it gets up first)
    const turn = (yaw, t0) => { if (Math.abs(wrap(yaw - act.cur.yaw)) < 0.05) return t0; part.sitting = false; return call('turn', { t0, yaw }); };
    switch (b.do) {
      case 'walk': case 'run': return trot(R[b.do], to(), a);
      case 'enter': return trot(R[b.run ? 'run' : 'walk'], to(), a);
      case 'exit': return (part.hidden = trot(R[b.run ? 'run' : 'walk'], side ?? to(), a));
      // a leap to a mark, down off a seat, up onto one or along the floor, of 0.2 to 2 m: turned to first when it is
      // more than 1 rad off (less, it twists in the air), it gathers itself for 0.45 s and leaps. At a ball
      // ("near:<ball>"): a pounce, to land with its front paws where the ball will be then.
      case 'hop': {
        const c = act.cur.at;
        let p = to();
        if (ballPart) {
          let land = a + 1;
          for (let i = 0; i < 6; i++) {
            const q = ballPos(ballPart, land), D = Math.hypot(q[0] - c[0], q[2] - c[2]), vy = Math.sqrt(19.62 * (0.08 + 0.12 * D));
            p = atBall(q, c); land = a + 0.45 + 0.06 + 2 * vy / 9.81;
          }
        }
        const D = far([c[0], c[2]], p), yaw = Math.atan2(p[0] - c[0], p[1] - c[2]);
        if (D > 2.05) throw new StoryError(`${id}'s hop is ${D.toFixed(1)} m: a 3D leap is at most 2 m (hop to a nearer mark, then walk)`);
        const t0 = Math.abs(wrap(yaw - act.cur.yaw)) > 1 ? turn(yaw, a) : a;
        part.sitting = false;
        const e = call('hop', { t0: t0 + 0.45, to: to3(p), yaw });
        walls([c[0], c[2]], p, t0, e);
        return e;
      }
      case 'turn': return turn(sideYaw(face || A.faceAt(t + 0.2)), a);
      case 'sit': { if (part.sitting) return a; part.sitting = true; return call('sit', { t0: a }); }
      case 'stand': { if (!part.sitting) return a; part.sitting = false; return call('stand', { t0: a }); }
      // a skid: it slides on, low, on all four paws (it came in too fast); a meow is laid over whatever it does
      case 'gesture':
        if (b.name === 'meow') { call('meow', { t0: a }); return undefined; }
        if (part.sitting) throw new StoryError(`${id} is sitting: it skids only on the move`); return call('skid', { t0: a });
      default: return undefined;   // look: read off the actor's track (finish)
    }
  }
  // two legs: a walk or a run at the rig's pace (with "face", turning at the end out of the last steps); a mark on a seat
  // (the kit's seat(x, z)) is walked to in front of it
  const up = () => { if (part.sitting) throw new StoryError(`${id} is sitting: give it a "stand" first`); part.crouched = false; };
  const turnTo = (yaw, t0) => (up(), Math.abs(wrap(yaw - act.cur.yaw)) > 0.6 ? call('turn', { t0, yaw, stepTime: 0.3, per: 1.6 }) : t0);
  const move = (verb, p, t0, f = 0) => {
    up();
    if (K.heightAt(...p) > 0) p = K.seat(...p, C.rig.info.legLength)?.front ?? p;
    if (far(act.cur.pos, p) < 0.05) return f ? turnTo(sideYaw(f), t0) : t0;
    if (part.shown === Infinity) part.shown = t0 - 0.05;
    const from = [...act.cur.pos];
    // (a walk to a mark well round is turned to first, on the spot, as the performer's walkTo does)
    const along = Math.atan2(p[0] - act.cur.pos[0], p[1] - act.cur.pos[1]);
    if (verb === 'walk' && Math.abs(wrap(along - act.cur.yaw)) > TURN_FIRST) t0 = call('turn', { t0, yaw: along, stepTime: 0.3, per: 1.6 });
    const pace = R[verb], e = call(verb, { t0, to: p, stepLen: pace.stepLen, stepTime: pace.stepTime / speed, ...(verb === 'run' && f ? { endYaw: sideYaw(f) } : {}) });
    walls(from, p, t0, e);
    return verb === 'walk' && f ? turnTo(sideYaw(f), e) : e;
  };
  const crouch = (amount, dur) => { up(); part.crouched = amount > 0; return call('crouch', { t0: a, dur: clamp(dur, 0.5, 0.9), amount }); };
  // sit: on the seat it stands in front of (it turns its back to it and steps back first), or on the floor
  const sit = () => { if (part.sitting) return a; part.sitting = true; return call('sit', { t0: a, on: K.seat(...act.cur.pos, C.rig.info.legLength)?.on }); };
  const stand = () => { if (!part.sitting) return crouch(0, 0.7); part.sitting = false; return call('stand', { t0: a }); };
  switch (b.do) {
    case 'walk': case 'run': return move(b.do, to(), a, face);
    case 'enter': return move(b.run ? 'run' : 'walk', to(), a, face);
    case 'exit': return (part.hidden = move(b.run ? 'run' : 'walk', side ?? to(), a));
    case 'turn': return turnTo(sideYaw(face || A.faceAt(t + 0.2)), a);   // (the beat's own face: the stand-in's track can lag it)
    case 'pose': return b.pose === 'sit' ? sit() : b.pose === 'stand' && part.sitting ? stand() : crouch(b.pose === 'crouch' ? 1 : 0, b.dur ?? 0.8);
    case 'sit': return sit();
    case 'stand': return stand();
    case 'place': throw new StoryError(`in 3D a "place" is only for a rider getting out of a car: walk ${id} there`);
    // jump moves the performer's clock; wave, point (straight ahead) and clap are laid over whatever it does
    case 'gesture':
      if (b.name === 'jump') return (up(), call('jump', { t0: a, height: Math.max(0.2 * act.opts.size, 0.16) }));
      part.gestures.push({ name: b.name, t0: a, dur: R.gestures[b.name] });
      return undefined;
    default: return undefined;   // look, emote, blink: read off the actor's tracks (finish)
  }
}

/**
 * The 3D side of laying out a film (engine/film/compile.mjs, for a film with "engine": "3d"):
 *   free(rec, b, t)    → when the beat at film time t can start: t, or the end of what its actor is still doing
 *   act(rec, b, t, shotT0) → how long the beat takes in 3D, acted out from where its actor stands (undefined: an action
 *                        laid over others, timed as on the flat stage); throws a StoryError for what cannot be played.
 *                        shotT0: when its shot starts (a drive's "arrive" counts from it)
 *   footfalls(rec, id) → [{ t, x, y, kind: 'step' | 'paw' | 'land' }] (film time, world px of the flat stand-in) of its feet ('paw': a four-legged actor's step)
 * The doors a film opens and closes are kept on its scenes (rec.doors: [{ t, to, w }] in film time, the place's
 * doorSwing cues).
 */
export function createTiming(film) {
  const acts = new WeakMap(), cues = [];
  const kit = rec => KITS[film.sets[rec.sc.set].kit];
  const doorAt = t => (kit0.doors?.door ? kit0.doors.door(cues)(t) : 1), kit0 = KITS[film.sets[film.scenes[0].set].kit];
  // an actor's part in the scene, made the first time it is asked for (enter: the beat, if that is its entrance)
  const partIn = (rec, id, enter) => {
    rec.three ??= new Map();
    if (!rec.three.has(id)) {
      if (!rec.actors.get(id)?.place0) throw new StoryError(`${id} is not in this scene (add it to the scene's actors)`);
      const C = timingRig(film.cast[id]), start = startOf(rec, id, kit(rec), enter, C.R.kind), part = partOf(C.R.kind, start);
      rec.three.set(id, part);
      if (C.R.kind === 'prop') { start.r = C.R.r; part.legs = start.carriedBy ? [] : ballLegs([], start, C.R.r, kit(rec)); }
      else acts.set(part, performerOf(C, start, kit(rec)));
    }
    return rec.three.get(id);
  };
  // open / close: the place's door (a cue of its swing) or a car's (its plan): laid over everything
  const door = (rec, b, t) => {
    const K = kit(rec), open = b.do === 'open';
    // (an actor's hand on it: laid over whatever the actor does, from a moment before it swings: biped finish)
    if (b.who !== undefined) {
      if (!rec.actors.get(b.who)?.place0) throw new StoryError(`${b.who} is not in this scene: its hand cannot ${b.do} the door`);
      const q = partIn(rec, b.who);
      if (q.kind !== 'biped') throw new StoryError(`${b.who} has no hands to ${b.do} a door with (a two-legged actor does)`);
      (q.holds ??= []).push({ to: b.to, t: t - rec.t0, open });
    }
    if (K.doors?.[b.to]) {
      const cue = { t, to: open ? 1 : 0, ...(b.dur === 0 ? { w: 400 } : b.speed ? { w: (open ? 11 : 5) * b.speed } : {}) };
      (rec.doors ??= []).push(cue); cues.push(cue);
      return;
    }
    if (!rec.actors.get(b.to)?.place0) throw new StoryError(`${b.to} is not in this scene: its door cannot be ${open ? 'opened' : 'closed'}`);
    const part = partIn(rec, b.to), args = [open ? 1 : 0, { t0: t - rec.t0, ...(b.dur !== undefined ? { dur: b.dur } : b.speed ? { dur: (open ? 0.9 : 0.55) / b.speed } : {}) }];
    part.calls.push(['door', args]); acts.get(part).door(...args);
  };
  return {
    free(rec, b, t) { const p = b.who !== undefined && rec.three?.get(b.who); return p && isVerb(p.kind, b) ? Math.max(t, p.busy + rec.t0) : t; },
    act(rec, b, t, shotT0 = t) {
      try {
        if (b.do === 'open' || b.do === 'close') return door(rec, b, t);
        const A = rec.actors.get(b.who);
        if (b.do === undefined || !A?.place0) return undefined;
        const part = partIn(rec, b.who, b.do === 'enter' ? { beat: b, t } : null), a = t - rec.t0, K = kit(rec);
        // a rider at the wheel gets out between shots: a "place" puts it beside the stopped car, standing
        if (part.start.riding !== undefined && part.out === undefined) {
          if (b.do !== 'place') throw new StoryError(`${b.who} is at the wheel of ${part.start.riding}: give it a "place" beside the car first (it gets out between shots)`);
          const car = acts.get(partIn(rec, part.start.riding)), v = car.speed(a);
          if (v > 0.05) throw new StoryError(`${b.who} gets out of ${part.start.riding} at ${t.toFixed(2)} s while it still moves (${v.toFixed(1)} m/s): place it once the car has stopped`);
          const C = timingRig(film.cast[b.who]);
          part.start = { at: spotOf(A, t + 1e-3), yaw: b.face ? sideYaw(faceVal(b.face)) : car.heading(a) };
          part.out = a; part.shown = a;
          acts.set(part, performerOf(C, part.start, K));
          return 0;
        }
        const end = play(b, a, { id: b.who, part, act: acts.get(part), C: timingRig(film.cast[b.who]), A, K, t, T0: rec.t0, shotT0, doorAt, film,
          actOf: id => acts.get(partIn(rec, id)), partIn: id => partIn(rec, id) });
        if (end === undefined) return undefined;
        // (a stop cuts the drive short: the car is free from then)
        part.busy = b.do === 'stop' ? end : Math.max(part.busy, end);
        return Math.max(0, end - a);
      } catch (e) { throw engineFault(e); }
    },
    footfalls(rec, id) {
      const part = rec.three?.get(id), act = part && acts.get(part);
      if (!act || part.kind === 'car') return part ? [] : null;
      const px = p => { const [x, y] = toPx(p.length === 3 ? [p[0], p[2]] : p); return { x, y }; };
      // two feet: every step's landing; four: the fore paws' (a leap's landing once)
      const steps = part.kind === 'biped' ? [...act.tracks.L.steps, ...act.tracks.R.steps] : [...act.tracks.FL.steps, ...act.tracks.FR.steps.filter(s => !s.drop)];
      // A kit with areas (home: inside and outside): a foot that lands in the other area than the one the shot is filmed
      // from is not heard (steps in the hall, with the camera in the garden), unless it lands within 1.5 m of the front
      // door while it stands at least half open. The area a shot is filmed from: its camera's "area", else the set's.
      const K = kit(rec), areas = K.areas, sa = film.sets[rec.sc.set].area;
      const areaAt = ([x, z]) => Object.keys(areas).find(n => { const s = areas[n].stage; return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1; });
      const heard = (t, p) => {
        if (!areas) return true;
        const sh = rec.shots.find(s => t < (s.t1 ?? Infinity)) ?? rec.shots.at(-1), cam = sh?.def.camera?.area ?? sa, here = areaAt(p);
        if (!cam || !here || here === cam) return true;
        const d = K.anchors.door;
        return !!(d && K.doors?.door && doorAt(t) >= 0.5 && far(p, d) < 1.5);
      };
      return steps.filter(s => s.t1 > 0).map(s => ({ t: s.t1 + rec.t0, p: s.pos.length === 3 ? [s.pos[0], s.pos[2]] : s.pos, s }))
        .filter(f => heard(f.t, f.p)).map(({ t, s }) => ({ t, ...px(s.pos), kind: s.drop ? 'land' : part.kind === 'biped' ? 'step' : 'paw' }));
    },
  };
}

// ───────────── the actors ─────────────
// A driver is one actor in one scene, drawn: its performer replays the actor's part (the timing's calls), then
// finish() lays what is read off the actor's tracks over it as layers of the motion system (gestures, looks, faces,
// blinks, the mouth of a spoken line), and pose(t) poses it. points() gives the camera its joints.

// The look beats of an actor (lookEv: the film compiler's track) as windows: [{ t0, t1, at(t) → [x, y, z] }], each
// held until the next look beat.
function looksOf(A, T0, world, here, ahead) {
  const ev = A.lookEv.map(e => ({ t: e.t - T0, to: e.target }));
  const point = (to, t) => {
    const p = here(t);
    if (typeof to === 'object') { const [x, z] = toM(to.x, to.y); return [x, world.K.heightAt(x, z) + 0.5, z]; }
    if (to === 'left' || to === 'right') return [p[0] + (to === 'left' ? -3 : 3), p[1], p[2]];
    if (to === 'camera') return world.eye;
    if (to === 'up' || to === 'sky' || to === 'down') { const a = ahead(t); return [p[0] + a[0] * 1.5, to === 'down' ? 0 : p[1] + 2.5, p[2] + a[1] * 1.5]; }
    return world.head(to, t) ?? p;
  };
  return ev.flatMap((e, i) => (e.to && e.to !== 'none' ? [{ t0: e.t, t1: ev[i + 1]?.t ?? 1e9, at: t => point(e.to, t) }] : []));
}

// Where a hand holds a door (a beat's "who" on an open or close): a point on the leaf near its free edge (the one away
// from the hinge), at handle height, just off the face on the side the actor stands. entry: the door as a group's
// userData.doors names it ({ leaf }); set(v): poses the leaf open v (0 shut, 1 open) at once, for finding the hinge;
// poseAt(t): poses it (and what carries it) as at the scene's time t. → (t, at [x, z]) → [x, y, z] in the world.
function doorHandle(entry, set, poseAt, height) {
  const leaf = entry.leaf, b = (leaf.geometry.computeBoundingBox(), leaf.geometry.boundingBox), c = b.getCenter(V()), e = b.getSize(V()).multiplyScalar(0.5);
  const wa = e.x >= e.z ? 'x' : 'z', ta = wa === 'x' ? 'z' : 'x', M = new THREE.Matrix4(), inv = new THREE.Matrix4();
  // (the leaf's place in the world, from its own and its parents' matrices: a hinge's pivot is set by hand and not
  // marked for the scene's update, so matrixWorld is not to be trusted between frames)
  const pose = () => { M.identity(); const chain = []; for (let o = leaf; o; o = o.parent) chain.unshift(o); for (const o of chain) { if (o.matrixAutoUpdate) o.updateMatrix(); M.multiply(o.matrix); } };
  const P = (w, y, th) => { const v = V(); v[wa] = w; v.y = y; v[ta] = th; return v.applyMatrix4(M); };
  let free = null;
  return (t, at) => {
    if (free === null) {
      // (the free edge is the end that moves between shut and open)
      const ends = v => { set(v); pose(); return [P(b.min[wa], c.y, c[ta]), P(b.max[wa], c.y, c[ta])]; };
      const s = ends(0), o = ends(1);
      free = s[0].distanceTo(o[0]) > s[1].distanceTo(o[1]) ? b.min[wa] : b.max[wa];
    }
    poseAt(t); pose();
    const w = free + (free > c[wa] ? -0.09 : 0.09), y0 = P(w, b.min.y, c[ta]).y, y1 = P(w, b.max.y, c[ta]).y;
    const y = b.min.y + (b.max.y - b.min.y) * clamp((Math.min(height, y1 - 0.12) - y0) / (y1 - y0 || 1));
    const me = V(at[0], (y0 + y1) / 2, at[1]).applyMatrix4(inv.copy(M).invert());
    return P(w, y, c[ta] + Math.sign(me[ta] - c[ta] || 1) * (e[ta] + 0.06)).toArray();
  };
}

function biped(id, C, A, world, part) {
  const { R, ch, rig } = C, act = performerOf(C, part.start, world.K), T0 = world.T0;
  for (const [verb, args] of part.calls) act[verb](...args);
  const headUp = (ch.rest.head.y - rig.info.standHeight) * 1.22, crown = R.height - ch.rest.head.y;
  const ahead = t => { const p = D.head(t), y = act.heading(t); return [p[0] + 3 * Math.sin(y), p[1] - 0.2 * act.opts.size, p[2] + 3 * Math.cos(y)]; };
  const D = {
    id, kind: 'biped', act, ch, R, face: true,
    visibleAt: t => t >= part.shown && t < part.hidden,
    at: t => { const p = act.poseAt(t, false).pose.pelvis.pos; return [p[0], p[2]]; },
    head: t => { const p = act.poseAt(t, false).pose.pelvis.pos; return [p[0], p[1] + headUp, p[2]]; },
    pose: t => act.apply(t),
    // the joints a camera frames, after pose(t): the whole body, waist up, head and shoulders, the face; the head; the hands
    points() {
      const b = ch.bones, w = n => b[n].getWorldPosition(V()), top = b.head.localToWorld(V(0, crown, 0)), feet = ['footL', 'footR'].map(n => w(n).setY(0));
      return { body: [top, ...feet, w('upperArmL'), w('upperArmR')], waist: [top, w('pelvis'), w('upperArmL'), w('upperArmR')], bust: [top, w('chest'), w('upperArmL'), w('upperArmR')],
        face: [top, w('head')], head: b.head.localToWorld(V(0, crown * 0.5, 0)), hands: [w('handL'), w('handR')] };
    },

    finish() {
      // the gestures (point: straight ahead), looks (the eyes lead, the head follows), each expression held until the next
      for (const g of part.gestures) act[g.name]({ t0: g.t0, dur: g.dur, ...(g.name === 'point' ? { at: ahead } : {}) });
      for (const l of looksOf(A, T0, world, D.head, t => { const y = act.heading(t); return [Math.sin(y), Math.cos(y)]; })) act.lookAt(l.at, { t0: l.t0, t1: l.t1, ease: 0.45 });
      const exprs = A.exprLine().map(e => ({ ...e, t: e.t - T0 }));
      // ("tired" is the body's: it comes on over 0.6 s (at a cut it is there already: it came on before) and lets go
      // from the next expression on, over 0.6 s, as the shoulders lift; a posture is never switched in a frame)
      exprs.forEach((e, i) => {
        const t1 = exprs[i + 1]?.t ?? 1e9;
        if (e.expr === 'tired') act.tired({ t0: e.cut ? e.t - 0.6 : e.t, t1: t1 + 0.6 });
        else if (e.expr !== 'neutral') act.express(e.expr, { t0: e.t, t1, ease: e.cut ? 0.04 : 0.25 });
      });
      // a hand on a door it opens or closes ("who" on an open / close): from half a second before the door swings, the hand on
      // its handle, following it while it is in reach and letting go as it swings out of reach (a pull that flings the
      // front door open, a push that sends a car's door shut); the free hand, not one that carries something
      for (const h of part.holds ?? []) {
        const handle = world.doorHandle(h.to), L = rig.info.armLength, busy = new Set((C.desc?.hang ?? []).map(g => g.hand));
        let arm = null;
        const from = act.where(h.t), at = [from[0], from[2]], q0 = handle(h.t, at), q1 = handle(h.t + 0.1, at);
        // a door whose handle sets off toward the actor is pulled: the hand on it, a tug as it starts, and the hand
        // lets go and comes back out of its way; one that sets off away is pushed: the hand goes with it while it can
        const pull = (q1[0] - q0[0]) * (at[0] - q0[0]) + (q1[2] - q0[2]) * (at[1] - q0[2]) > 0;
        act.layer((pose, t) => {
          const w0 = smoother((t - h.t + 0.5) / 0.4) * (1 - smoother((t - h.t - (pull ? -0.2 : 1.1)) / (pull ? 0.25 : 0.35)));
          if (w0 <= 0) return;
          const prev = pose.after;
          pose.after = (p, out, ctx) => {
            prev?.(p, out, ctx);
            const q = V(...handle(t, at));
            arm ??= ['L', 'R'].filter(s => !busy.has(s)).sort((a, b) => out.joints['shoulder' + a].distanceTo(q) - out.joints['shoulder' + b].distanceTo(q))[0] ?? 'L';
            const sh = out.joints['shoulder' + arm], d = q.clone().sub(sh), n = d.length();
            // (a handle a little out of reach is reached for, the arm out straight at it; farther, the hand lets go)
            const w = w0 * (1 - smoother((n - 1.15 * L) / (0.45 * L)));
            if (w <= 0) return;
            p.hand ??= {};
            p.hand[arm] = { to: sh.clone().add(d.setLength(Math.min(n, 0.95 * L))).toArray(), w, elbowDir: [0, -1, 0], wrist: [0.2, 0, 0], curl: 0.45, fan: 0.2, thumb: 0.3 };
          };
        });
      }
      // the mouth of a spoken line (the same lip signal a 2D film draws; it opens over any expression) and the blink beats
      act.layer((pose, t) => {
        pose.face.mouth = 0.15 + 0.75 * A.lipAt(t + T0, world.fps);
        for (const tb of A.blinks) { const u = (t + T0 - tb) / 0.16; if (u > 0 && u < 1) pose.face.blink = Math.max(pose.face.blink, Math.sin(Math.PI * u)); }
      });
    },
  };
  return D;
}

function quadruped(id, C, A, world, part) {
  const { R, ch } = C, start = part.start, y = world.K.heightAt(...start.at), T0 = world.T0, act = performerOf(C, start, world.K);
  for (const [verb, args] of part.calls) act[verb](...args);
  const D = {
    id, kind: 'quadruped', act, ch, R, face: true,
    visibleAt: t => t >= part.shown && t < part.hidden,
    at: t => { const c = act.poseAt(t).chest; return [c[0], c[2]]; },
    head: t => { const c = act.poseAt(t).chest; return [c[0], c[1] + 0.08, c[2]]; },
    pose: t => act.apply(t),
    points() {
      const b = ch.bones, w = n => b[n].getWorldPosition(V()), top = w('head').add(V(0, 0.1, 0)), floor = w('hips').y > 0.3 ? w('fPawL').y - 0.03 : 0;
      const body = [top, w('tail5'), ...['fPawL', 'fPawR', 'hFootL', 'hFootR'].map(n => w(n).setY(floor))], near = [top, w('head').add(V(0, -0.1, 0)), w('chest')];
      return { body, waist: body, bust: near, face: near, head: w('head'), hands: [] };
    },
    finish() {
      // (up, down: from where it starts, the way it faces)
      const ahead = [start.at[0] + Math.sin(start.yaw), y + 0.25, start.at[1] + Math.cos(start.yaw)];
      const looks = looksOf(A, T0, world, () => ahead, () => [Math.sin(start.yaw), Math.cos(start.yaw)]);
      for (const l of looks) act.look(l.at, { t0: l.t0, t1: l.t1, ease: 0.5 });
      if (looks.length) act.alert(...looks.flatMap(l => [[Math.max(0, l.t0 - 0.1), 0], [l.t0 + 0.15, 1]]));
    },
  };
  return D;
}

// A ball: on the floor, or in the hands of a two-legged actor (the motion system's holdBall), and then what is done
// with it (ops, as the timing laid them: ballLegs): thrown, rolled, batted, picked up.
function prop(id, { R, holder, mesh }, A, world, part) {
  const r = R.r;
  const first = part.ops[0], leaves = ['throw', 'hand'].includes(first?.[0]) ? first[2] : Infinity, pick = part.ops.find(o => o[0] === 'pick');
  let legs = null, by = null, picker = null;
  const D = {
    id, kind: 'prop', r, face: false,
    // (once everyone's plans are laid) into the hands, and the hands' part of what is done with it
    launch(drivers) {
      by = part.start.carriedBy ? drivers.get(part.start.carriedBy) : null; picker = pick && drivers.get(pick[1]);
      legs = ballLegs(part.ops, part.start, r, world.K, n => drivers.get(n).act);
    },
    // (in someone's hands, it is seen when they are)
    visibleAt: t => (!by || t > leaves || by.visibleAt(t)) && (!picker || t < pick[3] || picker.visibleAt(t)),
    at: t => { const p = D.head(t); return [p[0], p[2]]; },
    // (a look at it that is read while its legs are still being laid, from the hands that bat or pick it up, sees it
    // where it lay: it has not moved before they reach it)
    head: t => {
      if (legs) return ballAt(legs, t).pos;
      if (part.start.at) return [part.start.at[0], r, part.start.at[1]];
      // (in someone's hands while the legs are laid: a look at it then, read from the hands that roll it, sees it
      // under the holder's chin)
      const h = world.head(part.start.carriedBy, t) ?? [0, r, 0]; return [h[0], h[1] - 0.3, h[2]];
    },
    // (after the one who holds it has been posed)
    pose(t) {
      // stretched along its flight when it is fast (a smear), squashed at each bounce
      const b = ballAt(legs, t), sp = Math.hypot(...b.vel), k = 1 + 0.42 * clamp((sp - 1.2) / 3.2);
      holder.position.set(...b.pos);
      if (b.squash < 0.999 || sp < 1e-3) { holder.quaternion.identity(); holder.scale.set(1 / Math.sqrt(b.squash), b.squash, 1 / Math.sqrt(b.squash)); }
      else { holder.quaternion.setFromUnitVectors(V(1, 0, 0), V(...b.vel).normalize()); holder.scale.set(k, 1 / Math.sqrt(k), 1 / Math.sqrt(k)); }
      mesh.quaternion.copy(holder.quaternion).invert().multiply(new THREE.Quaternion().setFromAxisAngle(b.axis, b.angle));
    },
    points() { const p = holder.position, pts = [p.clone().add(V(0, r, 0)), p.clone().add(V(0, -r, 0)), p.clone().add(V(r, 0, 0)), p.clone().add(V(-r, 0, 0))]; return { body: pts, waist: pts, bust: pts, face: pts, head: null, hands: [] }; },
    finish() {},
  };
  return D;
}

// A car: its plan as the timing laid it (drive, stop, its lamps, engine and door), on the one car body the film built;
// the actor riding in it (a scene actor "on" it) drawn at the wheel (car/driver.mjs) until a "place" puts it out.
function car(id, C, A, world, part) {
  const plan = createCar({ at: part.start.at, yaw: part.start.yaw, mesh: C.mesh });
  for (const [verb, args] of part.calls) plan[verb](...args);
  const rider = world.riderOf(id), seated = rider && seatDriver(plan, world.seated(rider));
  seated?.leave(world.outAt(rider));
  let last = 0;
  const box = t => [-1, 1].flatMap(x => [0, CAR.belt + 0.7].flatMap(y => [-1, 1].map(z => V(...plan.toWorld(t, [x * CAR.wid / 2, y, z * CAR.len / 2])))));
  return {
    id, kind: 'car', act: plan, face: false,
    visibleAt: () => true,
    at: t => plan.where(t),
    head: t => plan.toWorld(t, [0, CAR.belt + 0.6, 0]),
    pose(t) { last = t; plan.apply(t); seated?.apply(t); },
    points() { const pts = box(last); return { body: pts, waist: pts, bust: pts, face: pts, head: null, hands: [] }; },
    finish() {},
  };
}

// ───────────── the camera ─────────────
// How much of the frame's height the framed part of the subjects fills, which part that is, and where its middle sits
// (in half-heights below the frame's middle).
const SIZES = {
  wide: { part: 'body', fill: 0.36, drop: 0.12 }, full: { part: 'body', fill: 0.6, drop: 0.1 }, medium: { part: 'waist', fill: 0.74, drop: 0.12 },
  close: { part: 'bust', fill: 0.7, drop: 0.14 }, 'extreme-close': { part: 'face', fill: 0.8, drop: 0 },
};
const ELEVATION = { eye: 0.04, low: -0.1, high: 0.4 };

// A camera on the kit's side of the stage, `el` above the level, that holds `pts` (world points) at a size: their
// middle across the frame, their height `fill` of the frame's. `heads` are kept inside the frame and above `cap` (the
// top of the caption band, in half-heights from the middle). → { target, dist, d (from the target to the lens), up, right }
function frame(pts, heads, { fill, drop }, { az, el, fov, aspect, cap }) {
  const d = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)), right = V(Math.cos(az), 0, -Math.sin(az)), up = d.clone().cross(right);
  const tv = Math.tan(fov * Math.PI / 360), th = tv * aspect, box = new THREE.Box3().setFromPoints(pts), target = box.getCenter(V());
  // where a point is in the picture from `dist` away: [across, up] in half-widths and half-heights
  const see = (p, dist) => { const v = p.clone().sub(target), z = dist - v.dot(d); return [v.dot(right) / (z * th), v.dot(up) / (z * tv)]; };
  let dist = 0.5;
  for (let i = 0; i < 4; i++) {
    dist = 0.5;
    for (const p of pts) { const v = p.clone().sub(target), a = v.dot(d); dist = Math.max(dist, a + Math.abs(v.dot(up)) / (fill * tv), a + Math.abs(v.dot(right)) / (0.86 * th)); }
    const s = pts.map(p => see(p, dist)), xs = s.map(q => q[0]), ys = s.map(q => q[1]);
    target.addScaledVector(right, (Math.min(...xs) + Math.max(...xs)) / 2 * dist * th).addScaledVector(up, ((Math.min(...ys) + Math.max(...ys)) / 2 + drop) * dist * tv);
  }
  // heads above the captions: lift the picture; if that pushes its top out of the frame, step back
  for (let i = 0; i < 8 && heads.length; i++) {
    const low = Math.min(...heads.map(p => see(p, dist)[1])), top = Math.max(...pts.map(p => see(p, dist)[1]));
    if (low >= cap + 0.06) break;
    const lift = cap + 0.06 - low;
    if (top + lift > 0.94) dist *= 1.12; else target.addScaledVector(up, -lift * dist * tv);
  }
  return { target, dist, d, up, right, tv };
}

/** Where a world point is in a camera's picture: [across, up] in half-widths and half-heights from the middle. */
export function project(cam, p, aspect) {
  const f = V(...cam.target).sub(V(...cam.pos)).normalize(), r = f.clone().cross(V(0, 1, 0)).normalize(), u = r.clone().cross(f);
  const v = p.clone().sub(V(...cam.pos)), z = v.dot(f), tv = Math.tan(cam.fov * Math.PI / 360);
  return [v.dot(r) / (z * tv * aspect), v.dot(u) / (z * tv)];
}

// The camera of one shot: at(t) → { pos, target, fov, focus } at the scene's time t (solved at the first call);
// step() solves one more sixth of a second of it ahead of that, → how many are left (0: all done).
function cameraFor(shot, scene, world) {
  const K = world.K, c = shot.def.camera || {}, size = c.size || 'wide', move = c.move || 'static', t0 = shot.t0 - world.T0, t1 = shot.t1 - world.T0;
  // (turn: the camera swings round its subjects from the side its area's cameras look from, in degrees, + to its right)
  const lens = { az: K.view.az + (c.turn ?? 0) * Math.PI / 180, el: ELEVATION[c.angle || 'eye'], fov: K.view.fov, aspect: world.aspect, cap: world.cap };
  const inside = ([x, z]) => x >= K.stage.x0 && x <= K.stage.x1 && z >= K.stage.z0 && z <= K.stage.z1;
  // the subjects: the actors the shot is on (everyone when it names none), and places (an anchor, a point) as posts 1 m high
  const list = v => (v === undefined ? null : typeof v === 'string' ? [v] : v);
  const subject = n => {
    if (scene.drivers.has(n)) return scene.drivers.get(n);
    const T = /^x:\s*(-?[\d.]+)\s*(?:,\s*y:\s*(-?[\d.]+))?$/.exec(n), [x, z] = T ? toM(+T[1], T[2] === undefined ? NaN : +T[2]) : K.anchors[n] ?? [];
    if (!Number.isFinite(x)) return null;
    const zz = Number.isFinite(z) ? z : K.anchors.centre[1], y = K.heightAt(x, zz), pts = [V(x, y, zz), V(x, y + 1, zz)];
    return { face: false, visibleAt: () => true, at: () => [x, zz], points: () => ({ body: pts, waist: pts, bust: pts, face: pts, head: null }) };
  };
  const on = (list(c.on) ?? [...scene.drivers.keys()]).map(subject).filter(Boolean), toOn = list(c.toOn)?.map(subject).filter(Boolean) ?? on;
  // every subject's joints at each sixth of a second of the shot, while it is in the picture's part of the place. A
  // camera that does not follow is composed for where its subjects stand: the moments one is on its way somewhere
  // (faster than 0.25 m/s) are left out, so it walks into the picture, or across it from one mark to the other. One
  // that never stands still in the shot is framed all the way. (step() takes one sixth, about 3 ms: a render takes
  // the next shot's a little at a time while it draws this one, so no frame waits for a whole shot's.)
  const times = []; for (let t = t0; t < t1 - 1e-6; t += 1 / 6) times.push(t);
  const subjects = [...new Set([...on, ...toOn])], seen = [], rests = new Map(subjects.map(s => [s, []]));
  const still = (s, t) => far(s.at(t + 0.1), s.at(t - 0.1)) < 0.05;
  const step = () => {
    if (seen.length === times.length) return 0;
    const t = times[seen.length];
    scene.pose(t);
    seen.push(new Map(subjects.filter(s => s.visibleAt(t) && inside(s.at(t))).map(s => [s, s.points()])));
    for (const s of subjects) rests.get(s).push(still(s, t));
    return times.length - seen.length;
  };
  // (solving poses the scene at other times: the pose it stood in is put back, or a frame posed before it asked for its
  // camera would be drawn in the wrong pose)
  let cam = null;
  return { step, at: t => { if (!cam) { const back = scene.last; cam = solve(); if (back !== undefined) scene.pose(back); } return cam(t); } };
  function solve() {
  while (step());
  const gather = (who, part, rows) => {
    const pts = [], heads = [];
    for (const s of who) {
      const r = rests.get(s), any = !rows && r.some((v, i) => v && seen[i].has(s));
      (rows ?? seen).forEach((row, i) => { const p = row.get(s); if (p && (!any || r[i])) { pts.push(...p[part]); if (s.face && p.head) heads.push(p.head); } });
    }
    return { pts, heads };
  };
  const fit = (who, sz, rows) => { const g = gather(who, SIZES[sz].part, rows); return g.pts.length ? frame(g.pts, g.heads, SIZES[sz], lens) : null; };
  const whole = () => { const f = frame([V(...K.view.target)], [], { fill: 1, drop: 0 }, { ...lens, el: K.view.el }); f.dist = K.view.dist; return f; };
  const A = (size === 'establishing' ? null : fit(on, size)) ?? whole();
  let B = A, path = null;
  if (move === 'push-in' || move === 'pull-out') {
    const k = c.zoomTo ?? (move === 'push-in' ? 1.3 : 1 / 1.3);
    B = (c.to && c.to !== 'establishing' ? fit(toOn, c.to) : c.to ? whole() : null) ?? { ...A, target: A.target.clone(), dist: A.dist / k };
  } else if (move === 'pan' && on.length > 1) {
    const a = fit([on[0]], size), b = fit([on[on.length - 1]], size);
    if (a && b) { path = [a, b]; }
  } else if (move === 'track') {
    // the frame's middle follows the subjects, at the distance that holds them at every moment
    const each = seen.map(row => fit(on, size, [row])), known = each.filter(Boolean);
    if (known.length) { const dist = Math.max(...known.map(f => f.dist)); path = each.map((f, i) => ({ ...(f ?? each.slice(i).find(Boolean) ?? known.at(-1)), dist })); }
  } else if (move === 'tilt-up' || move === 'tilt-down') {
    // (it starts a quarter of the frame's height below the framing, or above it, and ends on it)
    path = [{ ...A, target: A.target.clone().addScaledVector(A.up, (move === 'tilt-up' ? -0.5 : 0.5) * A.dist * A.tv) }, A];
  }
  const m0 = t0 + (c.moveAt ?? 0), m1 = c.moveDur ? m0 + c.moveDur : t1, zoom = c.zoom ?? 1, B0 = K.bounds;
  const seed = [...shot.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
  return t => {
    const u = smoother((t - m0) / (m1 - m0));
    let target, dist;
    if (move === 'track' && path) {
      // (between the sixths, averaged over the ones around, so a step does not shake the frame)
      const s = clamp((t - t0) * 6, 0, path.length - 1), at = i => path[Math.round(clamp(i, 0, path.length - 1))].target;
      target = V(); for (let k = -3; k <= 3; k++) { const a = at(Math.floor(s) + k), b = at(Math.floor(s) + k + 1); target.addScaledVector(a.clone().lerp(b, s - Math.floor(s)), 1 / 7); }
      dist = path[0].dist;
    } else {
      const [a, b] = path ?? [A, B];
      target = a.target.clone().lerp(b.target, u); dist = a.dist * Math.pow(b.dist / a.dist, u);
    }
    if (move === 'handheld') target.addScaledVector(A.right, 0.012 * dist * Math.sin(1.3 * t + seed)).addScaledVector(A.up, 0.009 * dist * Math.sin(1.9 * t + 2 * seed));
    dist /= zoom;
    // the lens stays inside the place; held so much nearer than the framing wants (a high angle under a ceiling) that
    // the framed part would fill more than 80 % of the frame's height, it takes a wider lens
    // (a tilt turns the lens where it stands, the framing's: moving it with the aim took it under the floor)
    const d = A.d, limit = (p, v, lo, hi) => (v > 1e-6 ? (hi - p) / v : v < -1e-6 ? (lo - p) / v : Infinity), want = dist;
    const from = move === 'tilt-up' || move === 'tilt-down' ? A.target : target;
    dist = Math.min(dist, limit(from.x, d.x, B0.x0, B0.x1), limit(from.y, d.y, B0.y0, B0.y1), limit(from.z, d.z, -Infinity, B0.z1));
    const k = (SIZES[size]?.fill ?? 0.5) * want / dist / 0.8, fov = k > 1 ? Math.min(70, 360 / Math.PI * Math.atan(Math.tan(lens.fov * Math.PI / 360) * k)) : lens.fov;
    return { pos: from.clone().addScaledVector(d, dist).toArray(), target: target.toArray(), fov, focus: dist };
  };
  }
}

// ───────────── a scene ─────────────
function stageScene(rec, plan, K0, cast, place) {
  // (a kit with areas, inside and outside, as one of them sees it: its view (the side the cameras look from), the part a
  // camera frames, where a camera may stand)
  const set = plan.film.sets[rec.sc.set], seen = area => { const A = K0.areas?.[area]; return A ? { ...K0, view: A.view, stage: A.stage, bounds: A.bounds } : K0; };
  const K = seen(set.area), T0 = rec.t0, drivers = new Map();
  // (who rides in a car: the scene actor "on" it; out of it from its "place")
  const riderOf = id => [...rec.actors].find(([n, A]) => A.place0?.mount?.id === id && cast[n].R.kind === 'biped')?.[0];
  const world = {
    K, T0, fps: plan.fps, aspect: plan.W / plan.H, riderOf, seated: cast.seated, outAt: id => rec.three?.get(id)?.out ?? Infinity,
    // the top of a two-line caption at the bottom of the frame, in half-heights from the frame's middle
    cap: 1 - 2 * layoutCaption({ style: 'dialogue', lines: ['X', 'X'] }, plan.W, plan.H, [], false).box[1] / plan.H,
    eye: V(...K.view.target).add(V(Math.sin(K.view.az), K.view.el, Math.cos(K.view.az)).multiplyScalar(K.view.dist)).toArray(),
    head: (id, t) => drivers.get(id)?.head(t),
    // a door's handle (doorHandle) by its storyboard name: the place's front door ("door") or a car of the cast (its id)
    doorHandle(to) {
      const doors = [], scene = (cast[to]?.mesh?.group ?? place.home?.group)?.parent;
      scene?.traverse(o => { for (const d of o.userData?.doors ?? []) doors.push(d); });
      if (cast[to]?.R.kind === 'car') {
        const m = cast[to].mesh, entry = doors.find(d => d.root === m.group);
        return doorHandle(entry, v => m.set({ door: v }), t => drivers.get(to).pose(t), 1.62);
      }
      const H = place.home, entry = H && doors.find(d => d.root === H.door.group);
      if (!entry) throw new StoryError(`no door "${to}" here for a hand to hold`);
      return doorHandle(entry, v => H.door.pose({ door: v }), t => H.door.pose({ door: H.swing(t + T0) }), 0.98);
    },
  };
  // who is in the scene: each plays its part as the timing laid it out (one that never acts starts where it is)
  for (const [id, A] of rec.actors) {
    if (!A.place0) continue;
    const C = cast[id], part = rec.three?.get(id) ?? partOf(C.R.kind, startOf(rec, id, K, null, C.R.kind));
    drivers.set(id, { biped, quadruped, prop, car }[C.R.kind](id, C, A, world, part));
  }
  for (const D of drivers.values()) D.finish();
  // (the ones that are held last: they are where the hands are)
  const order = [...drivers.values()].sort((a, b) => (a.kind === 'prop') - (b.kind === 'prop'));
  const scene = { drivers, last: undefined, pose(t) { scene.last = t; for (const D of order) D.pose(t); } };
  for (const D of order) D.launch?.(drivers);
  // (on: the actors a shot's camera is on, everyone when it names none)
  const named = s => [s.def.camera?.on ?? [...drivers.keys()]].flat().filter(n => drivers.has(n));
  // (framed(t): the actors whose heads the shot keeps in the picture at scene time t: a pan lets go of the first once it
  // is under way and takes up the last as it ends; a push-in or pull-out to others (toOn) lets go of the rest)
  const framed = s => {
    const c = s.def.camera ?? {}, on = named(s), to = c.toOn ? [c.toOn].flat().filter(n => drivers.has(n)) : on, m0 = s.t0 - T0 + (c.moveAt ?? 0), m1 = c.moveDur ? m0 + c.moveDur : s.t1 - T0;
    return t => { const u = (t - m0) / (m1 - m0); return c.move === 'pan' && on.length > 1 ? (u < 0.3 ? [on[0]] : u > 0.7 ? [on.at(-1)] : []) : u < 0.3 ? on : to; };
  };
  // The area a shot is framed from (a kit with areas): its camera's "area"; else the one its subjects (the ones it is
  // on, everyone when it names none) mostly stand in over the shot; the set's area, or the kit's first, when that
  // does not tell. A camera inside sees out through the windows and one outside sees in: the place is one.
  const areaOf = s => {
    const c = s.def.camera ?? {}, votes = {};
    if (!K0.areas) return undefined;
    if (c.area) return c.area;
    for (const n of [c.on ?? [...drivers.keys()]].flat()) for (const u of [0.1, 0.5, 0.9]) {
      const tt = s.t0 + (s.t1 - s.t0) * u, A = rec.actors.get(n), T = /^x:\s*(-?[\d.]+)\s*(?:,\s*y:\s*(-?[\d.]+))?$/.exec(n);
      const p = A?.place0 ? spotOf(A, tt) : T ? toM(+T[1], T[2] === undefined ? toPx(K0.anchors.centre)[1] : +T[2]) : K0.anchors[n];
      if (p) for (const [name, ar] of Object.entries(K0.areas)) if (p[0] >= ar.stage.x0 && p[0] <= ar.stage.x1 && p[1] >= ar.stage.z0 && p[1] <= ar.stage.z1) votes[name] = (votes[name] ?? 0) + 1;
    }
    const top = Math.max(0, ...Object.values(votes)), tied = Object.keys(votes).filter(k => votes[k] === top);
    return tied.includes(set.area) ? set.area : tied[0] ?? set.area ?? Object.keys(K0.areas)[0];
  };
  scene.shots = rec.shots.map(s => {
    const area = areaOf(s), Ks = seen(area), c = cameraFor(s, scene, { ...world, K: Ks });
    return { id: s.id, t0: s.t0, t1: s.t1, area, stage: Ks.stage, on: named(s), framed: framed(s), camera: c.at, solve: c.step };
  });
  scene.camera = t => (scene.shots.find(s => t + T0 < s.t1) ?? scene.shots.at(-1)).camera(t);
  return scene;
}

/** The scene description of a compiled 3D film (a plan of engine/film/compile.mjs), for openScene. */
export function compileScene(plan) {
  const film = plan.film, recs = plan._scenes, K = KITS[film.sets[recs[0].sc.set].kit];
  return {
    fps: plan.fps, duration: plan.duration, stage: K.stageOptions,
    build(stage) {
      // (the doors the film opens and closes: the place's swing, a pure function of the film's time)
      const place = K.build(stage, { door: recs.flatMap(r => r.doors ?? []) }), cast = {};
      for (const id of new Set(recs.flatMap(r => [...r.actors].filter(([, A]) => A.place0).map(([n]) => n)))) {
        const R = RIGS[film.cast[id].rig], color = film.cast[id].params?.color;
        if (R.kind === 'prop') { const mesh = ballMesh(R.r), holder = new THREE.Group(); holder.add(mesh); stage.scene.add(holder); cast[id] = { R, holder, mesh, group: holder }; }
        else if (R.kind === 'car') { const mesh = buildCar(color ? { color: parseInt(color.slice(1), 16) } : {}); stage.scene.add(mesh.group); cast[id] = { R, mesh, group: mesh.group }; }
        else { const desc = descOf(film.cast[id]), ch = buildCharacter(desc); stage.scene.add(ch.group); cast[id] = { R, desc, ch, group: ch.group, rig: R.kind === 'biped' ? createBiped(ch) : createQuadruped(ch) }; }
      }
      // (an actor at the wheel of a car is drawn as a second body of it, seated in the car: built when first needed)
      Object.defineProperty(cast, 'seated', { value: id => (cast[id].seated ??= buildCharacter(cast[id].desc)), enumerable: false });
      // A scene is staged (its performers' plans laid; each shot's camera is solved when it is first asked for, about
      // 3 ms a sixth of a second) when it is first asked for, and let go once update(t) has moved past it, so a long
      // film neither pays for every scene up front nor keeps them all. Each update(t) also solves a little of the next
      // shot's camera (before anything is posed for t), so the frame where it starts does not wait for all of it.
      // Staging and solving are pure functions of the plan: a scene staged again, or first at any frame, is the same.
      const scenes = recs.map(rec => {
        let s = null;
        const get = () => (s ??= stageScene(rec, plan, K, cast, place));
        const area = film.sets[rec.sc.set].area;
        return { id: rec.id, t0: rec.t0, t1: rec.t1, time: typeof rec.time === 'string' ? rec.time : K.defaultTime, area, stage: K.areas?.[area]?.stage ?? K.stage,
          get drivers() { return get().drivers; }, get shots() { return get().shots; }, pose: t => get().pose(t), camera: t => get().camera(t), drop() { s = null; } };
      });
      const shotList = recs.flatMap((r, i) => r.shots.map((s, j) => ({ i, j, t1: s.t1 })));
      return {
        cast, scenes,
        // every shot is drawn with the cheap motion blur, and the shutter stays inside its shot
        shot(t) { const s = plan.shots.find(s => t < s.t1) ?? plan.shots.at(-1); return { blur: 'vector', t0: s.t0, t1: s.t1 }; },
        update(t) {
          const k = scenes.findIndex(s => t < s.t1), i = k < 0 ? scenes.length - 1 : k, sc = scenes[i], tt = clamp(t, sc.t0, sc.t1) - sc.t0;
          for (let j = 0; j < i - 1; j++) scenes[j].drop();   // (the one before stays: a caption across the cut reads it)
          // (as many sixths a call as finish it before this shot ends: two calls a frame with the vector blur)
          const n = shotList.findIndex(s => t < s.t1), next = n >= 0 && shotList[n + 1];
          if (next) {
            const sh = scenes[next.i].shots[next.j], calls = Math.max(1, (shotList[n].t1 - t) * plan.fps * 2);
            for (let left = sh.solve(), k = Math.ceil(left / calls); k > 0 && left; k--) left = sh.solve();
          }
          // (the light of the area the shot is framed from)
          place.light(sc.time, (sc.shots.find(s => t < s.t1) ?? sc.shots.at(-1)).area ?? sc.area);
          for (const [id, C] of Object.entries(cast)) { C.group.visible = !!sc.drivers.get(id)?.visibleAt(tt); if (C.seated) C.seated.group.visible = false; }
          sc.pose(tt);
          place.update(t);
          const c = sc.camera(tt);
          stage.setCamera(c); stage.look.focus.value = c.focus;
        },
      };
    },
  };
}
