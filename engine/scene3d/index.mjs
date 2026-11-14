// The door into the 3D engine for the rest of cinecode.
//
//   const src = await openScene(scene, { width: 1920, height: 1080 });
//   const rgba = await src.pixels(t);     // the frame at t seconds: width * height * 4 bytes, RGBA, top row first
//   src.close();
//
// `scene` is a scene description (see scenes/zero.mjs): { fps, duration, stage, build(stage) }.
// Opening a scene builds it (meshes, plans) and starts no GPU device; the device starts at
// the first pixels(t). So src.built (the cast and their plans) can be posed with
// src.built.update(t) and checked on a machine with no GPU.
//
// Motion blur: the shot at t chooses it. built.shot(t), if the scene has it, gives { blur, t0, t1 }: the mode
// ('none', 'vector' or 'moments:N', see stage.render) and the shot's span, so the shutter never reaches across a
// cut. Without it the scene is one shot with 'vector'. openScene's `blur` overrides every shot (for the tools).
import { createStage } from './stage.mjs';

const SHUTTER = 0.5;      // the shutter is open for half of each frame (a 180 degree shutter)

export async function openScene(scene, { width, height, blur }) {
  const stage = await createStage({ width, height, ...scene.stage });
  const built = await scene.build(stage);
  // The light of a shot is the stage's alone (stage.setLight): a light a scene adds by hand is switched off.
  stage.scene.traverse((o) => { if (o.isLight && o !== stage.sun && o !== stage.fill && o !== stage.lamp) o.visible = false; });
  return {
    width, height, fps: scene.fps, duration: scene.duration, stage, built,
    async pixels(t, into) {
      const shot = built.shot?.(t) ?? { blur: 'vector', t0: 0, t1: scene.duration };
      // a moment of the shutter outside the shot is taken from the other side of t
      const at = (x) => (x < shot.t0 || x >= shot.t1 ? Math.min(Math.max(2 * t - x, shot.t0), shot.t1 - 1e-6) : x);
      return stage.render(Math.round(t * scene.fps), { blur: blur ?? shot.blur ?? 'vector', shutter: SHUTTER / scene.fps, pose: (dt) => built.update(at(t + dt)), into });
    },
    close() { stage.close(); },
  };
}
