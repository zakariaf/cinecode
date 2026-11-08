// Seventy-Six Summers: film-specific drawing. Sky and light effects live in fx/sky.mjs,
// places and props in fx/land.mjs; this file only merges them for the engine (DESIGN §4, §9.1).
import * as sky from './fx/sky.mjs';
import * as land from './fx/land.mjs';

export const overlays = { ...sky.overlays, ...land.overlays };
export const custom = { ...sky.custom, ...land.custom };
export const sounds = { ...(sky.sounds || {}), ...(land.sounds || {}) };
