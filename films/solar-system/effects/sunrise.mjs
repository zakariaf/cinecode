// The Sun coming up behind the set's far hills (Part 12, 12.4–12.5: the hill at dawn, the Sun at the left).
//
// Two pieces:
// - the `sunrise` custom beat paints the disc (a warm white-gold core in an orange halo) on the `sky` layer, behind
//   every set layer, so the hills hide its lower part. Over the beat it rises by `rise` disc radii (eased): from just
//   below the skyline to its upper limb clear of it.
// - the `sunrise-light` overlay lights the frame from it, after the grade: the part of the disc that shows, kept
//   white-gold (the dawn grade would turn it pink), a gentle bloom round it and a soft warm wash from its side (soft
//   light: it warms, it never bleaches a face). It draws only while a sunrise beat is drawing and takes that beat's
//   params and time, so list it once on the scene. Without it the disc is only a pale pink smudge under the grade.
//
// The Sun is fixed to the set's farthest layer (the hill's far ranges, parallax 0.4), not to the stage or the frame: a
// pan or a pull-out carries it with the far hills, so it holds its place on the horizon. Its size stays the same on
// screen, as sunglow's and skydot's do. A medium on the sitting pair is so tight (about 280 world px across) that any
// point of it lies right behind them in a wide, so give each shot its own beat ("scope": "shot") with its own `x`, and
// let the later one start where the first left off (`risen`). As tested (the conventions' blocking, a plain medium on
// nell and gran, then a wide pulled out to establishing):
//
//   "overlays": [{ "name": "sunrise-light", "shots": ["12.4", "12.5"] }]
//   12.4: { "do": "custom", "name": "sunrise", "at": 0, "dur": <the shot>, "hold": false, "scope": "shot",
//           "x": 1816, "r": 46, "rise": 1.6 }      (between them, coming up over the crest's tussocks)
//   12.5: { "do": "custom", "name": "sunrise", "at": 0, "dur": <the shot>, "hold": false, "scope": "shot",
//           "x": 1394, "r": 30, "risen": 1.2, "rise": 0.8 }      (over the downslope, in a dip of the far ranges)
//
// Params (on the beat): x (where it rises, in the far layer's own world px: on the hill, stage x − (camera cx − 1650)
// × 0.6; default 1394, over the downslope in a wide), y (the line it rises from, in the same px; default the skyline
// across the disc at x as the beat's first frame shows it: the far ranges, or the crest where that is higher), r (the
// disc's radius in px at 1080p, default 40), rise (how far it comes up over the beat, in disc radii, default 1.2),
// risen (how far it is already up at the beat's start, default 0), a (strength 0..1, default 1), wash (the warm wash's
// strength 0..1, default 0.3).
import { canvas, clamp } from 'cinecode/lib';
import { layerDepth } from 'cinecode/set';

const ease = u => { u = clamp(u); return u * u * (3 - 2 * u); };

// The set's back layers (parallax k ≤ 1, not in front of the actors), and the farthest of them.
const backLayers = S => (S.L || []).filter(l => !l.front && l.k > 0 && l.k <= 1);
const farLayer = S => backLayers(S).reduce((a, l) => (l.k < 1 && (!a || l.k < a.k) ? l : a), null);

// The top of what a layer painted at x (its own world px): the first row that is mostly opaque.
function top(ly, x) {
  const col = Math.round((x - ly.E.x0) * ly.res);
  if (col < 0 || col >= ly.c.width) return null;
  const d = ly.c.getContext('2d').getImageData(col, 0, 1, ly.c.height).data;
  for (let i = 0; i < ly.c.height; i++) if (d[i * 4 + 3] > 160) return ly.E.y0 + i / ly.res;
  return null;
}
// The line of a layer's tops across x ± half (its own world px): their median, so a
// tree on a crest or a gap between tussocks doesn't move it.
function crest(ly, x, half) {
  const v = [];
  for (let i = -4; i <= 4; i++) { const y = top(ly, x + (i * half) / 4); if (y != null) v.push(y); }
  return v.length ? v.sort((a, b) => a - b)[v.length >> 1] : null;
}

// The screen transform of a layer with parallax k under a camera (its zoom, the layer shifted by (camera − ref) ×
// (1 − k), vertically × 0.4 more, and a camera moved through depth scaling it about the frame centre), as set.mjs
// draws it.
function layerMatrix(api, k, cam = api.cam) {
  const S = api.set, z = cam.zoom, W = api.W, H = api.H;
  const dx = (cam.cx - S.refX) * (1 - k), dy = (cam.cy - S.refY) * (1 - k) * 0.4;
  const r = cam.z ? layerDepth(k, cam.z, cam.lens ?? S.lens).r : 1, s = z * r;
  return [s, 0, 0, s, W / 2 + ((dx - cam.cx) * z) * r, H / 2 + ((dy - cam.cy) * z) * r];
}
const apply = (m, x, y) => [m[0] * x + m[4], m[3] * y + m[5]];

// The skyline across the disc at x (far-layer px) as the frame drew it when the beat began (t0): the highest of every
// back layer's tops there, given back in the far layer's px. So by default the Sun comes up from behind whatever is
// the horizon where it stands (the far ranges over the downslope, the crest's tussocks in a medium on the crest), and
// stays fixed to the far layer from there.
function skyline(api, far, x, R, t0) {
  const cam = (api.plan.shotAt?.(t0) ?? api.shot).cameraAt(t0), mf = layerMatrix(api, far.k, cam), sx = mf[0] * x + mf[4];
  let best = Infinity;
  for (const ly of backLayers(api.set)) {
    const m = layerMatrix(api, ly.k, cam), y = crest(ly, (sx - m[4]) / m[0], R / m[0]);
    if (y != null) best = Math.min(best, m[3] * y + m[5]);
  }
  return Number.isFinite(best) ? (best - mf[5]) / mf[3] : null;
}

// Where the Sun is this frame (its beat began at t0): its centre and radius, the hills' line under it (screen px), how
// much of the disc is above that line (0..1) and its strength.
function sunAt(api, u, p, t0) {
  const far = farLayer(api.set), k = far ? far.k : 1, x = p.x ?? 1394, R = (p.r ?? 40) * (api.H / 1080);
  const y = p.y ?? (far && skyline(api, far, x, R, t0)) ?? api.set.horizon ?? 700;
  const [cx, line] = apply(layerMatrix(api, k), x, y);
  const cy = line + R * 1.05 - ((p.risen ?? 0) + (p.rise ?? 1.2) * ease(u)) * R;
  return { cx, cy, R, line, up: clamp((line - (cy - R)) / (2 * R)), a: clamp(p.a ?? 1) };
}

// A soft round light: a radial falloff with no edge.
function soft(ctx, x, y, R, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  for (const [o, k] of [[0, 1], [0.12, 0.8], [0.25, 0.52], [0.4, 0.28], [0.6, 0.11], [0.8, 0.03], [1, 0]]) g.addColorStop(o, `rgba(${rgb},${(a * k).toFixed(4)})`);
  ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
}
// The disc: white-hot in the middle, warming to gold at the limb.
function disc(ctx, cx, cy, R) {
  const g = ctx.createRadialGradient(cx - R * 0.12, cy - R * 0.16, 0, cx, cy, R);
  g.addColorStop(0, '#fffef8'); g.addColorStop(0.6, '#fff8e2'); g.addColorStop(0.9, '#fff0c6'); g.addColorStop(1, '#ffe4aa');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
}

// the disc and its halo, behind the land
function sky(ctx, u, api) {
  const { cx, cy, R, a } = sunAt(api, u, api.params || {}, api.t - api.bt);
  if (!(a > 0) || cx < -R * 6 || cx > api.W + R * 6 || cy - R * 6 > api.H || cy + R * 6 < 0) return;
  ctx.globalCompositeOperation = 'lighter';
  soft(ctx, cx, cy, R * 6, '255,160,90', 0.3 * a);
  soft(ctx, cx, cy, R * 2.4, '255,196,124', 0.42 * a);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  disc(ctx, cx, cy, R);
}

// The sunrise beat drawing now in this scene (as the frame picks its beats: a "scope": "shot" one only in its shot).
const drawing = api => api.plan.custom.find(c => c.name === 'sunrise' && c.scene === api.scene.id && api.t >= c.t0 && api.t < c.t1 && (c.beat?.scope !== 'shot' || (c.shot === api.shot.id && api.t < api.shot.t1)));

// The part of the disc that shows, on a canvas of its box: the disc less what the frame draws over it (every back
// layer of the set, every prop and every actor), drawn as a mask first (rigs and props shade with their own
// compositing, so they can't erase directly).
function shown(api, cx, cy, R) {
  const m = Math.ceil(R + 2), bx = Math.floor(cx - m), by = Math.floor(cy - m), n = 2 * m, [mask, k] = canvas(n, n), [c, x] = canvas(n, n);
  for (const ly of backLayers(api.set)) { k.setTransform(1, 0, 0, 1, -bx, -by); k.transform(...layerMatrix(api, ly.k)); k.drawImage(ly.c, ly.E.x0, ly.E.y0, ly.c.width / ly.res, ly.c.height / ly.res); }
  k.setTransform(1, 0, 0, 1, -bx, -by); k.transform(...layerMatrix(api, 1));
  for (const p of api.set.propsSorted()) { k.save(); p.draw(k); k.restore(); }
  for (const a of api.plan.actorsAt(api.t, api.scene.id)) if (a.visible && a.mode !== 'off') { k.setTransform(1, 0, 0, 1, -bx, -by); api.silhouette(k, a); }
  x.translate(-bx, -by); disc(x, cx, cy, R);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(mask, 0, 0);
  return [c, bx, by];
}
// The depth of field the frame blurs what lies behind the subjects with (frame.mjs, dofRadius).
function dof(api) {
  const d = api.shot.dof, auto = clamp((api.cam.zoom - 2.2) * 1.6, 0, 14);
  return (d === false || d === 0 ? 0 : typeof d === 'number' ? Math.max(d * 1.6, auto) : d === true ? Math.max(5, auto) : auto) * api.H / 1080;
}

// the visible disc kept white-gold, the bloom round it and the warm wash from its side, after the grade
function light(ctx, api) {
  const c = drawing(api); if (!c) return;
  const p = c.params || {}, { cx, cy, R, line, up, a } = sunAt(api, clamp((api.t - c.t0) / ((c.t1 - c.t0) || 1e-6)), p, c.t0), W = api.W, H = api.H;
  if (!(a > 0) || cx < -R * 8 || cx > W + R * 8 || cy - R * 8 > H || cy + R * 8 < 0) return;
  const wash = clamp(p.wash ?? 0.3) * a;
  if (wash > 0) {
    ctx.globalCompositeOperation = 'soft-light';
    soft(ctx, cx, line, Math.max(W, H) * 1.2, '255,176,104', wash * 1.4);
  }
  // the bloom, on the part that shows (the middle of the disc above the line)
  const by = Math.min(cy, line) - R * 0.2 * up, k = (0.3 + 0.7 * up) * a;
  ctx.globalCompositeOperation = 'lighter';
  soft(ctx, cx, by, R * 3.2, '255,192,120', 0.34 * k);
  if (up > 0) {
    const [img, bx, by0] = shown(api, cx, cy, R), b = dof(api);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9 * a;
    if (b > 0.5) ctx.filter = `blur(${b.toFixed(1)}px)`;
    ctx.drawImage(img, bx, by0);
  }
}

export const custom = { sunrise: { layer: 'sky', draw: sky } };
export const overlays = { 'sunrise-light': { layer: 'grade', draw: light } };
