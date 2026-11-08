// Sky and light for Seventy-Six Summers (stub: replaced in round 2).
const noop = { layer: 'sky', draw() {} };
export const overlays = { comet: noop, 'hill-mist': { ...noop, layer: 'front' }, 'stone-light': { ...noop, layer: 'world' } };
export const custom = { timelapse: { layer: 'screen', draw() {} } };
