// The place "home" (home/kit.mjs) from one of its named viewpoints, for the tools (look, perf, determinism, strip),
// set by environment variables:
//   HOME_VIEW   a camera of the kit (default lawn_wide; its area, inside or outside, is the kit's side(view)), or
//               pos@target@fov ("3.2,0.5,-4.6@3.76,0.1,-3.2@30"), lit as outside
//   HOME_TIME   golden | twilight (default golden)
//   HOME_CAST=1 the man, the girl and the cat stand in view (the man by the car's door outside)
//   HOME_CAR=1  the car comes along the street with the man at the wheel, turns into the drive and stops at 6.0 s;
//               the engine stops; at 8.5 s he is out (a cut) and the door swings shut
//   HOME_BARE=1 the engine's living room alone (what the place adds is measured against it)
import { HOME_KIT as K } from '../home/kit.mjs';
import { livingRoom } from '../room.mjs';
import { buildCharacter } from '../character.mjs';
import { createBiped } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
import { createQuadruped, createCritter } from '../quadruped.mjs';
import { createCar } from '../car/drive.mjs';
import { seatDriver } from '../car/driver.mjs';
import { man } from '../cast/man.mjs';
import { girl } from '../cast/girl.mjs';
import { cat } from '../cast/cat.mjs';

const E = process.env, view = E.HOME_VIEW ?? 'lawn_wide', time = E.HOME_TIME ?? 'golden';
const cam = K.cameras[view] ?? (([p, q, f]) => ({ pos: p.split(',').map(Number), target: q.split(',').map(Number), fov: Number(f) }))(view.split('@'));
const side = K.cameras[view] ? K.side(view) : 'outside';
export default {
  fps: 24, duration: 20, stage: K.stageOptions,
  build(stage) {
    let place;
    if (E.HOME_BARE) place = livingRoom(stage);
    else { place = K.build(stage); place.light(time, side); }
    const acts = [];
    let car = null, driver = null;
    if (E.HOME_CAR) {
      const A = K.anchors;
      car = createCar({ at: [A.street_left[0], -13.8], yaw: -Math.PI / 2 }); stage.scene.add(car.group);   // (in the road's middle: room to swing into the drive)
      driver = seatDriver(car, man);
      car.engine(true, { t0: 0 });
      const stop = car.driveTo([[16, -13.8], [10.8, -13.4], [7.1, -9.6], A.drive], { t0: 0, speed: 6, rolling: true });   // (the front wheels turn at most 32 degrees of their 40)
      car.engine(false, { t0: stop + 0.7 });
      car.door(1, { t0: 8.5, dur: 0 }); car.door(0, { t0: 8.95 });
      driver.leave(8.5);
    }
    if (E.HOME_CAST) {
      const spots = side === 'inside' ? [[0.9, -0.3], [-0.2, 0.1], [0.4, -0.9]] : [K.anchors.drive_door, [3.76, -3.3], [2.6, -3.6]];
      for (const [desc, at] of [[man, spots[0]], [girl, spots[1]], [cat, spots[2]]]) {
        const ch = buildCharacter(desc); stage.scene.add(ch.group);
        const yaw = Math.atan2(cam.pos[0] - at[0], cam.pos[2] - at[1]);
        acts.push(desc === cat ? createCritter(createQuadruped(ch), { at: [at[0], 0, at[1]], yaw }) : createPerformer(createBiped(ch), { at, yaw }));
      }
    }
    return {
      car, driver,
      update(t) {
        place.update(t);
        if (car) { car.apply(t); driver.apply(t); }
        for (const a of acts) a.apply(t);
        stage.setCamera(cam); stage.look.focus.value = Math.hypot(...cam.pos.map((v, i) => v - cam.target[i]));
      },
    };
  },
};
