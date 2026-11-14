// The plain studio the character sheets are shot in: a floor, a back wall, a soft even light.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStage } from '../stage.mjs';
import { woodFloor, plaster, slab } from '../sets.mjs';
import { saveImage, tile } from '../img.mjs';
import { LIGHTS } from '../light.mjs';

export async function studio(width, height) {
  const stage = await createStage({ width, height });
  stage.scene.background = new stage.THREE.Color(0x40364a);
  stage.scene.add(slab(10, 0.2, 10, woodFloor(), [0, -0.1, 0]));
  stage.scene.add(slab(10, 5, 0.2, plaster({ color: 0x8f8296 }), [0, 2.5, -1.6]));
  // well under a film's light, so pale things (a white cat, a collar) keep their form
  const M = LIGHTS.morning;
  stage.setLight({ ...M, sun: { ...M.sun, power: 1.2 }, sky: { ...M.sky, power: 0.4 }, shade: { ...M.shade, power: 0.45 }, ground: { ...M.ground, power: 0.35 }, bounce: 0, air: { ...M.air, density: 0 } });
  stage.look.ink.value = 0;
  // light from the front left, on a subject `size` metres across standing at `at`
  stage.aim = (at, size) => stage.setSun({ dir: [0.45, -0.5, -0.74], center: at, extent: Math.max(1.2, size * 1.6), depth: 14 });
  // tile the cells into one picture and save it
  stage.sheet = (file, cells, cols, scaleTo = 2000) => { const s = tile(cells, width, height, cols); saveImage(file, s.px, s.w, s.h, { scaleTo }); stage.close(); };
  return stage;
}

// A character named on the command line: a cast name (man, girl, cat) or a file that exports one description.
export async function loadCast(name) {
  const mod = await import(name.endsWith('.mjs') ? pathToFileURL(path.resolve(name)).href : `../cast/${name}.mjs`);
  const desc = Object.values(mod).find((v) => v && v.joints && v.parts);
  if (!desc) throw new Error(`${name}: exports no character description (an object with joints and parts)`);
  return desc;
}
