// A synthetic frame source for testing the render pipeline without a film.
// The top half encodes the frame number (mod 256) as 8 black/white cells, MSB first; the bottom half shows a
// coloured square moving left to right, so a concat that drops or repeats a frame is detectable.
// `failAt` makes drawing throw at that frame (for testing error handling).
export function createSource({ width = 64, height = 36, fps = 24, duration = 2, shots = 2, failAt = null } = {}) {
  const shotList = Array.from({ length: shots }, (_, i) => ({ id: `tc-${String(i + 1).padStart(2, '0')}`, scene: 'tc', t0: (duration * i) / shots, t1: (duration * (i + 1)) / shots, size: 'wide' }));
  const plan = {
    W: width, H: height, fps, duration, title: 'Test card',
    scenes: [{ id: 'tc', t0: 0, t1: duration, set: null }],
    shots: shotList,
    lines: shotList.map((s, i) => ({ id: `line${i}`, who: 'narrator', text: `Shot ${i + 1} of ${shots}, frame by frame.`, t0: s.t0 + 0.1, t1: s.t1 - 0.1, narrator: true, shot: s.id })),
    captions: shotList.map((s, i) => ({ t0: s.t0 + 0.1, t1: s.t1 - 0.1, text: `Caption ${i + 1}: a moving square.`, style: 'narration' })),
    sfx: [], ambience: [], music: [],
    actorsAt: () => [],
  };
  const draw = failAt == null ? drawFrame : (ctx, p, t) => { if (Math.round(t * fps) === failAt) throw new Error(`test card: failing at frame ${failAt}`); drawFrame(ctx, p, t); };
  return { plan, drawFrame: draw };
}

export function drawFrame(ctx, plan, t) {
  const { W, H, fps } = plan, i = Math.round(t * fps), bits = 8, cw = W / bits, half = Math.floor(H / 2);
  for (let b = 0; b < bits; b++) {
    ctx.fillStyle = (i >> (bits - 1 - b)) & 1 ? '#ffffff' : '#000000';
    ctx.fillRect(Math.round(b * cw), 0, Math.round((b + 1) * cw) - Math.round(b * cw), half);
  }
  const u = plan.duration > 0 ? t / plan.duration : 0;
  ctx.fillStyle = `hsl(${Math.round(200 + 140 * u)}, 45%, 30%)`; ctx.fillRect(0, half, W, H - half);
  const s = Math.max(4, Math.round((H - half) * 0.6));
  ctx.fillStyle = `hsl(${Math.round(360 * u) % 360}, 85%, 60%)`;
  ctx.fillRect(Math.round(u * (W - s)), half + Math.round((H - half - s) / 2), s, s);
}

/** Decode the frame number from raw RGB24 pixels of one frame. */
export function decodeFrameNumber(rgb, W, H, bits = 8) {
  const cw = W / bits, y = Math.floor(H / 4); let v = 0;
  for (let b = 0; b < bits; b++) {
    const x = Math.floor((b + 0.5) * cw), p = (y * W + x) * 3, lum = (rgb[p] + rgb[p + 1] + rgb[p + 2]) / 3;
    v = (v << 1) | (lum > 127 ? 1 : 0);
  }
  return v;
}

export default createSource;
