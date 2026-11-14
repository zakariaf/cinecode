// Scene Zero: a living room in late-afternoon sun. A man walks in and turns right round,
// through a front view, to face a girl who runs in from the back of the room, behind him. He crouches
// to her height; she throws him the ball, it flies past his hand, bounces and rolls; the
// cat on the sofa watches it, hops down and follows it, and sits by it when it stops. He
// stands and waves while she jumps for joy, and the camera moves round them.
//
// It is written as a storyboard would say it (docs/scene3d-motion.md): each actor's verbs
// follow one another, gestures, looks and faces are laid over them, and the actors find
// each other and the ball through the world.
import { buildCharacter } from '../character.mjs';
import { createBiped } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
import { createQuadruped, createCritter } from '../quadruped.mjs';
import { livingRoom, ROOM } from '../room.mjs';
import { ballMesh } from '../ball.mjs';
import { createWorld, smoother, lerp, clamp } from '../motion.mjs';
import { man } from '../cast/man.mjs';
import { girl } from '../cast/girl.mjs';
import { cat } from '../cast/cat.mjs';

// ---- the beats (seconds) ----
const T = {
  girlArrive: 4.15,           // her run ends about here
  release: 5.28,              // she lets go of the ball
  ballStops: 7.5,             // and it rolls to rest
  manStand: 6.55, wave: [7.15, 9.75],
  jumps: [6.85, 7.8, 8.75],
  cam: [6.5, 9.9],
  catHop: 5.75,
};
// Floor marks (x, z). The man comes in from the left along the room; the girl waits at the
// back, between the sofa and the lamp, runs out behind him and stops at his other side, so he
// has to turn right round to face her: through the camera, never his back.
const MAN_FROM = [-4.2, -0.6], MAN_AT = [0.95, -0.45], GIRL_FROM = [1.52, -1.95], GIRL_AT = [-0.5, -0.45], BALL_R = 0.085;
const BALL_LANDS = [1.09, 0.385];   // where the throw first meets the floor: wide of the man, on the camera's side
const CAMERA = [0.12, 1.42, 7.45];  // where the camera stands until it moves

export default {
  fps: 24,
  duration: 10,
  stage: { rays: true },
  async build(stage) {
    const { THREE, scene } = stage;
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const room = livingRoom(stage);
    const world = createWorld();
    const add = (desc) => { const ch = buildCharacter(desc); scene.add(ch.group); return ch; };

    // ---------------- the girl: runs in with the ball, throws it, jumps for joy ----------------
    const girlCh = add(girl), girlRig = createBiped(girlCh);
    const g = createPerformer(girlRig, { world, name: 'girl', at: GIRL_FROM, yaw: Math.atan2(GIRL_AT[0] - GIRL_FROM[0], GIRL_AT[1] - GIRL_FROM[1]), armSpread: 0.62, armSwing: 0.6, seed: 5 });
    {
      const n = Math.round(Math.hypot(GIRL_AT[0] - GIRL_FROM[0], GIRL_AT[1] - GIRL_FROM[1]) / 0.4);
      g.runTo(GIRL_AT, { t0: T.girlArrive - 0.4 - n * 0.175, stepLen: 0.4, stepTime: 0.175, face: MAN_AT });
    }
    const ball = g.holdBall({ t0: -1, r: BALL_R, release: T.release, aim: { to: BALL_LANDS, vy: 3.4 }, ball: { grip: 0.55, stop: T.ballStops } });
    world.add('ball', (t) => ball.at(t).pos);
    // three jumps; she turns a little toward us on the first two, and claps
    [-0.42, -0.34, 0].forEach((turn, i) => g.jump({ t0: T.jumps[i], height: 0.22, turn }));
    g.clap({ t0: T.jumps[0] - 0.05, dur: 9.8 - T.jumps[0] });
    // she watches him as she comes to a stop, the ball as it goes, then him again
    g.lookAt('man', { t0: 0.6, ease: 0.5 });
    g.lookAt('ball', { t0: T.release - 0.05, t1: 6.5, ease: 0.25 });
    g.lookAt([0.3, 1.2, 4], { t0: T.jumps[1] - 0.2, t1: T.jumps[2] + 0.3, ease: 0.4 });   // a glance toward us between jumps
    g.express('happy', { t0: 0.9, t1: 4.4, amount: 0.7, ease: 0.4 });
    g.express('surprised', { t0: T.release - 0.05, t1: T.release + 0.9, amount: 0.8, ease: 0.15 });
    g.express('happy', { t0: T.release + 0.7, t1: 10.5, ease: 0.3 });

    // ---------------- the man: walks in, turns to her, crouches, misses the ball, stands, waves ----------------
    const manCh = add(man), manRig = createBiped(manCh);
    const m = createPerformer(manRig, { world, name: 'man', at: MAN_FROM, yaw: Math.atan2(MAN_AT[0] - MAN_FROM[0], MAN_AT[1] - MAN_FROM[1]), seed: 2 });
    // nine steps in, already walking when the shot starts; out of the last one he turns round to face her
    const turnSpan = [2.5, 0];
    turnSpan[1] = m.walkTo(MAN_AT, { t0: -0.78, stepLen: 0.6, stepTime: 0.42, face: GIRL_AT, through: CAMERA }) + 0.2;
    m.crouchTo(1, { t0: m.time + 0.05, dur: 0.85 });
    // down at her height, both hands come forward, open, asking for the ball; the near one swipes at it as it goes by
    const inFront = (side, y) => (t) => { const h = m.headAt(t), f = m.heading(t), sx = side === 'L' ? 1 : -1; return [h[0] + Math.sin(f) * 0.5 + Math.cos(f) * 0.24 * sx, h[1] - y, h[2] + Math.cos(f) * 0.5 - Math.sin(f) * 0.24 * sx]; };
    m.reach({ t0: 4.6, dur: 2.0, to: inFront('R', 0.55), arm: 'R' });
    m.reach({ t0: 4.6, dur: 0.95, to: inFront('L', 0.5), arm: 'L' });
    m.reach({ t0: T.release + 0.1, dur: 0.75, to: 'ball', arm: 'L' });
    m.crouchTo(0, { t0: T.manStand, dur: 0.9 });
    // standing again, he steps round to open himself toward us a little, and waves
    m.turnTo(m.cur.yaw + 0.35, { t0: T.manStand + 0.55, stepTime: 0.36 });
    m.wave({ t0: T.wave[0], dur: T.wave[1] - T.wave[0] });
    // looks: ahead while walking; the girl as soon as she runs past (his eyes and head lead the turn); the ball
    // as it flies by and rolls away; the girl again; a look at us in the middle of the wave
    m.lookAt('girl', { t0: 1.1, ease: 0.5 });
    m.lookAt('ball', { t0: T.release + 0.05, t1: 6.75, ease: 0.25 });
    m.lookAt(CAMERA, { t0: 8.1, t1: 9.0, ease: 0.3 });
    m.express('happy', { t0: 1.3, t1: 2.4, amount: 0.6 });
    m.express('surprised', { t0: 2.5, t1: 3.3, amount: 0.55 });
    m.express('happy', { t0: 3.4, t1: 5.2, amount: 0.7 });
    m.express('surprised', { t0: T.release + 0.15, t1: T.release + 1.0, ease: 0.15 });
    m.express('happy', { t0: T.release + 1.0, t1: 10.5, ease: 0.4 });

    // ---------------- the cat: watches from the sofa, follows the ball when it is down, sits by it ----------------
    const catCh = add(cat), catRig = createQuadruped(catCh);
    const seat = [ROOM.sofa.x - 0.35, ROOM.sofa.seatY + 0.01, ROOM.sofa.z + 0.2];
    const c = createCritter(catRig, { world, name: 'cat', at: seat, yaw: 0.3, sit: 1, tailSide: -1 });
    {
      // down off the sofa as the ball comes down, then after it along its path, and sit beside it once it stops
      const rest = ball.path().rest;
      c.hopTo([-0.15, 0, -0.88], { t0: T.catHop, yaw: 0.2 });
      c.trotTo([rest[0] - 0.34, 0, rest[2] - 0.25], { t0: c.time - 0.1, stride: 0.25, beat: 0.11 });
      c.sit({ t0: c.time + 0.08 });
    }
    c.alert([T.release - 0.1, 0], [T.release + 0.15, 1], [9.0, 1], [9.7, 0.35]);
    c.look('man', { t0: -1, t1: 2.6, ease: 0.3 });
    c.look('girl', { t0: 2.4, t1: T.release + 0.2, ease: 0.3 });
    c.look('ball', { t0: T.release, t1: 9.3, ease: 0.12 });
    c.look('girl', { t0: 9.1, t1: 10.5, ease: 0.4 });

    // ---------------- the ball ----------------
    // the ball sits in a holder that is stretched along its flight when it is fast (a smear, as an animator would draw it)
    const ballObj = ballMesh(BALL_R), ballHolder = new THREE.Group(); ballHolder.add(ballObj); scene.add(ballHolder);

    // ---------------- camera ----------------
    // Still for the first 6.5 s. Then it travels on an arc round the pair: closer, lower,
    // and about 21 degrees round to the left, so the room turns behind them.
    const camU = (time) => smoother((time - T.cam[0]) / (T.cam[1] - T.cam[0]));
    function camera(time) {
      const u = camU(time);
      const centre = [lerp(0.12, 0.5, u), lerp(1.12, 1.0, u), lerp(0.0, -0.2, u)];
      const ang = lerp(0.0, -0.37, u), dist = lerp(7.45, 6.2, u), h = lerp(1.42, 1.3, u);
      stage.setCamera({ pos: [centre[0] + Math.sin(ang) * dist, h, centre[2] + Math.cos(ang) * dist], target: centre, fov: 25 });
      stage.look.focus.value = dist + 0.3;      // the pair stay sharp; the window softens, and whatever comes close to the lens
    }

    return {
      cast: { man: { ch: manCh, rig: manRig, act: m }, girl: { ch: girlCh, rig: girlRig, act: g }, cat: { ch: catCh, rig: catRig, act: c } },
      marks: { turn: turnSpan, T },
      ball: ball.path(), world,
      update(time) {
        m.apply(time); g.apply(time); c.apply(time);
        const b = ball.at(time);
        ballHolder.position.set(...b.pos);
        const sp = Math.hypot(...b.vel), k = 1 + 0.42 * clamp((sp - 1.2) / 3.2);
        if (b.squash < 0.999 || sp < 1e-3) { ballHolder.quaternion.identity(); ballHolder.scale.set(1 / Math.sqrt(b.squash), b.squash, 1 / Math.sqrt(b.squash)); }
        else { ballHolder.quaternion.setFromUnitVectors(V(1, 0, 0), V(...b.vel).normalize()); ballHolder.scale.set(k, 1 / Math.sqrt(k), 1 / Math.sqrt(k)); }
        ballObj.quaternion.copy(ballHolder.quaternion).invert().multiply(new THREE.Quaternion().setFromAxisAngle(b.axis, b.angle));
        room.update(time);
        camera(time);
      },
    };
  },
};
