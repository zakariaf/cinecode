// Shared by the tools: load a scene named on the command line and open it. It is a scene file (.mjs) or a film
// folder (films/<slug> with "engine": "3d"), compiled to a scene the way a render compiles it.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openScene } from '../index.mjs';
import { compileScene } from '../compile.mjs';
import { loadPlan } from '../../render/film-source.mjs';

export async function open(file, size = '1280x720', opts = {}) {
  const [width, height] = size.split('x').map(Number);
  const scene = file.endsWith('.mjs') ? (await import(pathToFileURL(path.resolve(file)).href)).default : compileScene((await loadPlan(path.resolve(file))).plan);
  return openScene(scene, { width, height, ...opts });
}
