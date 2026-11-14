// The storyboard's kit "home" (the shape of library.mjs KITS entries), with the two sides of the place: `inside`
// (the living room and the hall) and `outside` (the front garden, the drive and the street). Each side has its own
// establishing view, the side its cameras look from, the part a camera frames and where a camera may stand; the
// anchors, the floor and the light are the place's. Floor marks are [x, z] in metres (room axes: the garden is -z).
import { ROOM, sofaSeat } from '../room.mjs';
import { buildHome, doorSwing, HOME_LIGHTS, HOME as H } from './home.mjs';

const onSeat = (x, z) => Math.abs(x - H.seat.x) < 0.9 && z > ROOM.back && z < ROOM.back + 0.46;
const onSofa = (x, z) => Math.abs(x - ROOM.sofa.x) < 0.95 && Math.abs(z - ROOM.sofa.z - 0.1) < 0.4;

export const HOME_KIT = {
  floor: { x0: -30, x1: 30, z0: -18.8, z1: 5.2 },
  anchors: {
    // centre: the middle of the room (compile.mjs and kit2d read it: an anchorless subject's depth, the stand-in set's lane)
    centre: [0.4, -0.1],
    // inside
    rug: [0.4, -0.1], sofa: [ROOM.sofa.x - 0.35, ROOM.sofa.z + 0.2], window_seat: [H.seat.x, H.seat.z], window: [-2.4, -1.35],
    // door_inside: beside the front door on its latch side, clear of the leaf's swing at every pose
    hall: [2.15, 0.3], door_inside: [2.95, -1.8],
    // outside
    door: [H.door.x, -2.68], step: [H.door.x, -3.0], path: [H.door.x, -6.2], gate: [H.door.x, H.hedge.z], lawn: [-0.2, -6.0],
    // drive: the car's middle, parked facing the house (+z); drive_door: where its driver stands on his side (+x), clear of the door's swing
    drive: [6.5, -5.4], drive_door: [8.15, -6.05], street_left: [24, -12.8], street_right: [-24, -12.8], pavement: [H.door.x, -10.45],
  },
  // what stands there stands that high: the window seat, the sofa's seat (the doorstep is flush with the ground)
  heightAt: (x, z) => (onSeat(x, z) ? H.seat.top : onSofa(x, z) ? ROOM.sofa.seatY + 0.01 : 0),
  seat: sofaSeat,     // (a two-legged actor sits on the sofa; on the window seat, only the cat)
  // the ground underfoot, for the footsteps' sound: boards in the room, tiles in the hall, paving on the step, the
  // path, the pavement and the road, gravel in the drive, grass elsewhere outside
  surface(x, z) {
    const inR = (r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    if (z > H.front) return x > H.hall.x0 && x < H.wing.x1 ? 'stone' : 'wood';
    if (inR(H.drive)) return 'dirt';
    if (inR({ ...H.path, z1: H.front }) || z < H.pavement[1]) return 'stone';
    return 'grass';
  },
  // where an entrance from "left" / "right" starts (the street's ends, as seen from the garden looking at the house)
  sides: { left: [24, -12.8], right: [-24, -12.8] },
  // the two areas a scene is in (a set names one: { "kit": "home", "area": "outside" }); the kit's own view, stage
  // and bounds are the inside's
  areas: {
    inside: {
      stage: { x0: -3.6, x1: 4.5, z0: -2.0, z1: 1.8 },
      view: { target: [0.12, 1.12, 0], az: 0, el: 0.04, dist: 7.45, fov: 25 },
      bounds: { x0: -4.3, x1: 4.4, y0: 0.25, y1: 2.9, z1: 9.2 },
    },
    outside: {
      stage: { x0: -7.4, x1: 9.0, z0: -17, z1: -2.55 },
      view: { target: [2.0, 1.6, -3.0], az: Math.PI + 0.074, el: 0.074, dist: 13.6, fov: 40 },
      bounds: { x0: -30, x1: 30, y0: 0.3, y1: 12, z1: -2.6 },
    },
  },
  get view() { return this.areas.inside.view; }, get stage() { return this.areas.inside.stage; }, get bounds() { return this.areas.inside.bounds; },
  // named viewpoints for staging and checking: { pos, target, fov }
  cameras: {
    room_wide: { pos: [0.12, 1.42, 7.45], target: [0.12, 1.12, 0], fov: 25 },
    window: { pos: [-1.0, 1.15, 1.7], target: [-2.45, 1.1, -2.2], fov: 38 },
    window_seat_out: { pos: [-2.45, 0.85, -1.5], target: [-2.0, 1.05, -9], fov: 50 },
    // behind_milo (shot 1.7): from the room's left, so the glass shows the drive's mouth and the street beyond it
    behind_milo: { pos: [-4.3, 1.1, -0.6], target: [-1.8, 1.0, -2.5], fov: 40 },
    to_door: { pos: [-1.8, 1.4, 2.8], target: [2.6, 1.05, 0.3], fov: 38 },
    hall: { pos: [3.95, 1.45, 0.95], target: [3.76, 1.1, -2.4], fov: 50 },
    // lawn_wide (shots 2.1, 3.2): from across the street, high enough to see the house's foot over the hedge; the drive and the car in it are in frame
    lawn_wide: { pos: [1.0, 2.6, -16.5], target: [2.0, 1.6, -3.0], fov: 40 },
    street: { pos: [0.5, 1.6, -18.2], target: [1.8, 2.4, -2.5], fov: 34 },
    door_close: { pos: [2.9, 1.25, -6.3], target: [3.76, 1.05, -2.6], fov: 30 },
    window_in: { pos: [-2.3, 1.35, -5.0], target: [-2.4, 1.15, -1.2], fov: 32 },
    drive: { pos: [1.6, 1.5, -8.6], target: [6.5, 0.9, -4.6], fov: 34 },
    // car_door (shot 2.2): down the driver's side of the parked car, from the street end of the drive
    car_door: { pos: [8.7, 1.5, -10.2], target: [7.6, 1.1, -5.2], fov: 34 },
    scale: { pos: [-1.5, 1.5, -7.6], target: [3.76, 1.0, -5.6], fov: 52 },
    step_out: { pos: [3.6, 1.55, -2.9], target: [1.0, 0.9, -14], fov: 45 },
  },
  // the doors a storyboard opens and closes (a beat's "to"): name → (cues) → its swing at film time t, 0 shut to 1 open
  // (build(stage, { door: cues }) draws the front door so)
  doors: { door: doorSwing },
  // the walls a move may not pass through ([x, z] ends); `door`: the front door's opening in it (its middle, and how far
  // either side of it a body's middle may pass), `gap`: an opening with no door ([z0, z1] along the wall); `via`: the
  // anchor to go by instead
  walls: [
    { a: [H.left, H.front], b: [H.wing.x1, H.front], door: { at: H.door.x, half: 0.35 }, via: 'door_inside', name: 'the front of the house' },
    { a: [H.right, H.front], b: [H.right, H.wing.z1], gap: [H.opening.z0 + 0.15, H.opening.z1 - 0.15], via: 'hall', name: 'the wall between the room and the hall' },
    { a: [H.wing.x1, H.front], b: [H.wing.x1, H.wing.z1], via: 'door_inside', name: 'the side of the house' },
    { a: [H.left, H.front], b: [H.left, H.back], via: 'door_inside', name: 'the side of the house' },
  ],
  // The car's way to a mark ([x, z]) from where it stands (`from`, facing `yaw`): along the middle of the road, and
  // into the drive from the road. → { marks } (for car/drive.mjs driveTo), or { error } (what it cannot do).
  route(from, yaw, to) {
    const lane = -13.8, onRoad = (p) => Math.abs(p[1] - lane) < 1.6, inDrive = (p) => p[0] > H.drive.x0 && p[0] < H.drive.x1 && p[1] > H.drive.z0 && p[1] < H.drive.z1;
    const ahead = (p) => (p[0] - from[0]) * Math.sin(yaw) + (p[1] - from[1]) * Math.cos(yaw) > 0.5;
    if (inDrive(from) && !inDrive(to)) return { error: 'it stands in the drive facing the house, and a car drives forward only' };
    if (onRoad(from) && onRoad(to)) return ahead([to[0], lane]) ? { marks: [[to[0], lane]] } : { error: 'that is behind it on the road, and a car drives forward only' };
    if (onRoad(from) && inDrive(to)) {
      // (the turn in: the front wheels turn at most about 32 of their 40 degrees; from the other end, the same mirrored)
      const s = Math.sign(from[0] - 7.1) || 1, mouth = [[7.1 + s * 8.9, lane], [7.1 + s * 3.7, -13.4], [7.1, -9.6]];
      if (!ahead(mouth[2])) return { error: 'it has passed the drive, and a car drives forward only' };
      return { marks: [...mouth.filter((p, i) => i === 2 || ahead(p)), to] };
    }
    return { marks: [to] };
  },
  // where and which way a car stands at a mark when a scene starts: on the road, in its middle heading toward the
  // place's middle; in the drive, facing the house; elsewhere as given. → { at, yaw }
  carStart([x, z], yaw) {
    if (Math.abs(z + 13.8) < 1.6) return { at: [x, -13.8], yaw: x > 0 ? -Math.PI / 2 : Math.PI / 2 };
    return { at: [x, z], yaw: x > H.drive.x0 && x < H.drive.x1 && z > H.drive.z0 && z < H.drive.z1 ? 0 : yaw };
  },
  // the area a named viewpoint is in
  side: (name) => (['scale', 'lawn_wide', 'street', 'door_close', 'window_in', 'drive', 'car_door', 'step_out'].includes(name) ? 'outside' : 'inside'),
  times: Object.keys(HOME_LIGHTS), defaultTime: 'golden',
  stageOptions: { rays: true },
  build(stage, opts) {
    const home = buildHome(stage, opts);
    return { update: home.update, light(time, side = 'inside') { home.light(time, side); }, home };
  },
};
