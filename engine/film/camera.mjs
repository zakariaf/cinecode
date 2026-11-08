// The automatic camera. A subject is { box: [x0, y0, x1, y1] (world), head: [x, y], hh (head size, world px),
// face }. Each shot size frames a region of every subject (the whole body, waist up, head and shoulders, the
// face) so that the union of those regions fills a set fraction of the frame height, with lead room in the
// direction the subjects face and size-dependent headroom. Moves interpolate between framings; every camera is
// clamped by the set so the frame never shows unpainted edges.
import { noise1 } from '../core/lib.mjs';
import { clamp, lerp, ease, easeIO } from './util.mjs';

export const ZMAX = 12;             // closest zoom (screen px per world px); depth of field hides the soft set beyond ~2.5
export const SIZE_SPEC = {
  establishing: { f: 0, wmax: 1 },
  wide: { f: 0.18, wmax: 0.8, region: 'body', centerY: 0.6, lead: 0.07 },
  full: { f: 0.6, wmax: 0.82, region: 'body', centerY: 0.53, lead: 0.08 },
  medium: { f: 0.75, wmax: 0.86, region: 'waist', topY: 0.1, lead: 0.09 },
  close: { f: 0.7, wmax: 0.9, region: 'head', headY: 0.42, lead: 0.1 },
  'extreme-close': { f: 0.85, wmax: 0.95, region: 'face', headY: 0.47, lead: 0.06 },
};
export const LOOSER = { 'extreme-close': 'close', close: 'medium', medium: 'full', full: 'wide', wide: 'establishing', establishing: 'establishing' };

// The part of a subject a shot size frames (world box).
export function regionOf(sub, size) {
  const [x0, y0, x1, y1] = sub.box, [hx, hy] = sub.head, hh = sub.hh;
  switch (SIZE_SPEC[size]?.region) {
    case 'waist': return [x0, y0, x1, y0 + Math.max(0.62 * (y1 - y0), Math.min(y1 - y0, hy + 0.9 * hh - y0))];
    case 'head': return [hx - 0.9 * hh, Math.max(y0, hy - 0.85 * hh), hx + 0.9 * hh, hy + 0.85 * hh];
    case 'face': return [hx - 0.6 * hh, hy - 0.5 * hh, hx + 0.6 * hh, hy + 0.5 * hh];
    default: return [x0, y0, x1, y1];
  }
}
const union = (A, B) => (A ? [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])] : B.slice());

/**
 * Frame subjects for a shot size. → { cx, cy, zoom, ref: [wx, wy], scr: [sx, sy] } where the world point `ref`
 * appears at screen point `scr` (so the same composition can be re-solved at another zoom with at()).
 * opts: { W, H, angle, lead (override), zoomK (multiplier), offset: [fx, fy] (frame fractions), S (set) }
 */
export function frameSubjects(subs, size, { W, H, angle = 'eye', zoomK = 1, offset = null, S = null, faceHint = 0, refH = null } = {}) {
  const spec = SIZE_SPEC[size] || SIZE_SPEC.wide;
  if (!subs.length || size === 'establishing') {
    let cx = S ? S.refX : 0, cy = S ? S.refY : 0;
    if (subs.length) { let R = null; for (const s of subs) R = union(R, s.box); cx = (R[0] + R[2]) / 2; cy = lerp(cy, (R[1] + R[3]) / 2, 0.35); }
    const widest = S ? S.clampCamera({ cx, cy, zoom: 0.01 }, W, H).zoom : 1;
    return { cx, cy, zoom: widest * zoomK, ref: [cx, cy], scr: [W / 2, H / 2], establishing: true };
  }
  let R = null, faces = 0, hmax = 0;
  for (const s of subs) { const g = regionOf(s, size); R = union(R, g); faces += s.face; hmax = Math.max(hmax, g[3] - g[1]); }
  const rw = Math.max(1, R[2] - R[0]), rh = Math.max(1, R[3] - R[1]);
  // the size sets the zoom from the subject's own height (refH: its typical height over the shot); the union of
  // everything the subjects do in the shot only has to fit inside the frame
  const hfit = spec.region === 'head' || spec.region === 'face' ? 0.94 : 0.86;
  let zoom = Math.min((spec.f * H) / Math.max(1, refH ?? hmax), (spec.wmax * W) / rw, (hfit * H) / rh) * zoomK;
  zoom = Math.min(zoom, ZMAX * Math.max(1, Math.min(W, H) / 1080));
  const face = Math.sign(faces || faceHint);
  // horizontal: the region's centre, pushed back against the lead (more room ahead of the subjects)
  const vw = W / zoom;
  let lead = (subs.length === 1 || Math.abs(faces) === subs.length ? spec.lead : spec.lead * 0.4) * vw * face;
  const slack = Math.max(0, (vw - rw) / 2 - 0.04 * vw);
  lead = clamp(lead, -slack, slack);
  const rcx = (R[0] + R[2]) / 2;
  let sx = W / 2 - lead * zoom;
  // vertical: size-dependent placement of the region (or of the head for close shots)
  let wy, sy;
  if (spec.region === 'head' || spec.region === 'face') {
    const hy = subs.reduce((a, s) => a + s.head[1], 0) / subs.length;
    wy = hy; sy = spec.headY * H;
  } else if (spec.region === 'waist') { wy = R[1]; sy = spec.topY * H; }
  else { wy = (R[1] + R[3]) / 2; sy = spec.centerY * H; }
  if (angle === 'low') { sy += 0.07 * H; zoom *= 1.04; }
  if (angle === 'high') { sy -= 0.07 * H; }
  if (offset) { sx += offset[0] * W; sy += offset[1] * H; }
  return at({ ref: [rcx, wy], scr: [sx, sy] }, zoom, W, H);
}
// Re-solve a composition at another zoom.
export function at(F, zoom, W, H) {
  return { cx: F.ref[0] - (F.scr[0] - W / 2) / zoom, cy: F.ref[1] - (F.scr[1] - H / 2) / zoom, zoom, ref: F.ref, scr: F.scr };
}

// The set's clamp keeps the camera centre inside its view rect. Tight shots (zoom > 1.6) may move the centre
// past it, toward subjects near the edge of the view, as long as the frame stays inside the painted area.
export function clampFrame(S, c, W, H) {
  const out = S.clampCamera({ cx: c.cx, cy: c.cy, zoom: c.zoom }, W, H), relax = clamp((out.zoom - 1.6) / 1.2);
  if (relax > 0) {
    const A = S.area, hw = W / 2 / out.zoom, hh = H / 2 / out.zoom;
    out.cx = lerp(out.cx, clamp(c.cx, A.x0 + hw, A.x1 - hw), relax);
    out.cy = lerp(out.cy, clamp(c.cy, A.y0 + hh, A.y1 - hh), relax);
  }
  return { cx: out.cx, cy: out.cy, zoom: out.zoom };
}
const lerpCam = (a, b, u) => ({ cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), zoom: a.zoom * Math.pow(b.zoom / a.zoom, u) });

// Gaussian-smoothed track through sampled framings.
function smoothTrack(samples, sigma) {
  return samples.map((s, i) => {
    let wx = 0, wy = 0, wz = 0, n = 0;
    for (let j = 0; j < samples.length; j++) {
      const d = samples[j].t - s.t; if (Math.abs(d) > sigma * 3) continue;
      const w = Math.exp(-(d * d) / (2 * sigma * sigma)); wx += samples[j].cx * w; wy += samples[j].cy * w; wz += Math.log(samples[j].zoom) * w; n += w;
    }
    return { t: s.t, cx: wx / n, cy: wy / n, zoom: Math.exp(wz / n) };
  });
}

/**
 * Build a shot's camera.
 *   spec: film camera block; subjectsAt(t, ids) → subjects; ids: subject ids (or [ids0, ids1] for a pan);
 *   t0, t1: shot times; S: set instance; W, H; seed
 * → { cameraAt(t) → { cx, cy, zoom }, size, move, frames }
 */
export function buildCamera({ spec = {}, size, ids, subjectsAt, t0, t1, S, W, H, seed = 1 }) {
  const move = spec.move || 'static', angle = spec.angle || 'eye', zoomK = spec.zoom || 1;
  const opts = { W, H, angle, zoomK, S, offset: Array.isArray(spec.offset) ? spec.offset : null };
  const clampCam = c => clampFrame(S, c, W, H);
  const dur = Math.max(1e-3, t1 - t0);
  const N = Math.max(3, Math.min(72, Math.ceil(dur * 8) + 1));
  const times = Array.from({ length: N }, (_, i) => t0 + (dur * i) / (N - 1) - (i === N - 1 ? 1e-4 : 0));
  const unionSub = subs => {
    if (!subs.length) return [];
    let box = null, head = [0, 0], hh = 0, face = 0;
    for (const s of subs) { box = union(box, s.box); head = [head[0] + s.head[0], head[1] + s.head[1]]; hh = Math.max(hh, s.hh); face += s.face; }
    return { box, head: [head[0] / subs.length, Math.min(...subs.map(s => s.head[1]))], hh, face: Math.sign(face) };
  };
  // the union over time keeps each subject separate (regions per subject), so collect per id
  const perId = list => {
    const by = new Map();
    for (const t of times) for (const s of subjectsAt(t, list)) { if (!by.has(s.id)) by.set(s.id, []); by.get(s.id).push(s); }
    return [...by.values()].map(unionSub);
  };
  // the subjects' typical framed height over the shot (median over samples of the tallest region)
  const refH = list => {
    const hs = [];
    for (const t of times) { let h = 0; for (const s of subjectsAt(t, list)) { const g = regionOf(s, size); h = Math.max(h, g[3] - g[1]); } if (h > 0) hs.push(h); }
    hs.sort((a, b) => a - b); return hs.length ? hs[hs.length >> 1] : null;
  };
  let cameraAt, frames = {};
  const F = list => frameSubjects(perId(list), size, { ...opts, refH: refH(list) });
  if (move === 'pan' && ids.length >= 2) {
    const A = clampCam(F([ids[0]])), B = clampCam(F([ids[ids.length - 1]]));
    frames = { from: A, to: B };
    cameraAt = t => clampCam(lerpCam(A, B, easeIO(((t - t0) / dur - 0.12) / 0.76)));
  } else if (move === 'track') {
    // follow the subjects at a constant zoom: sample every frame, smooth, then keep them inside the frame
    const NT = Math.max(3, Math.min(480, Math.ceil(dur * 24) + 1));
    const tt = Array.from({ length: NT }, (_, i) => t0 + (dur * i) / (NT - 1) - (i === NT - 1 ? 1e-4 : 0));
    const subsAt = tt.map(t => subjectsAt(t, ids));
    let z = (() => { const zs = subsAt.map(subs => frameSubjects(subs, size, opts).zoom).sort((a, b) => a - b); return zs[zs.length >> 1]; })();
    // fast subjects: never let the background sweep faster than about a frame width a second (no strobing)
    const vmax = Math.max(0, ...subsAt.flatMap(subs => subs.map(s => Math.abs(s.vx || 0))));
    if (vmax > 1) z = Math.min(z, (1.05 * W) / vmax);
    const raw = tt.map((t, i) => {
      const subs = subsAt[i], vel = subs.reduce((a, s) => a + (s.vx || 0), 0);
      const f = frameSubjects(subs.map(s => ({ ...s, face: Math.abs(vel) > 5 ? Math.sign(vel) : s.face })), size, opts);
      return { t, ...at(f, f.establishing ? f.zoom : z, W, H) };
    });
    const sm = smoothTrack(raw, Math.min(0.35, dur / 4)).map((c, i) => {
      // containment: shift the frame so every subject's framed region stays inside it (with a margin)
      const subs = subsAt[i]; if (!subs.length) return c;
      let R = null; for (const s of subs) R = union(R, regionOf(s, size === 'establishing' ? 'wide' : size));
      const hw = W / 2 / c.zoom, hh = H / 2 / c.zoom, mx = hw * 0.12, my = hh * 0.08;
      let { cx, cy } = c;
      if (R[2] - R[0] > 2 * (hw - mx)) cx = (R[0] + R[2]) / 2; else { if (R[0] < cx - hw + mx) cx = R[0] + hw - mx; if (R[2] > cx + hw - mx) cx = R[2] - hw + mx; }
      if (R[3] - R[1] > 2 * (hh - my)) cy = (R[1] + R[3]) / 2; else { if (R[1] < cy - hh + my) cy = R[1] + hh - my; if (R[3] > cy + hh - my) cy = R[3] - hh + my; }
      return { ...c, cx, cy };
    });
    const fin = smoothTrack(sm, Math.min(0.1, dur / 8));
    frames = { from: fin[0], to: fin[fin.length - 1] };
    cameraAt = t => {
      const u = clamp((t - t0) / dur) * (fin.length - 1), i = Math.min(fin.length - 2, Math.floor(u)), w = u - i;
      return clampCam(lerpCam(fin[i], fin[i + 1], w));
    };
  } else {
    const base = F(ids);
    let A = base, B = base;
    if (move === 'push-in') { A = at(base, base.zoom / 1.3, W, H); }
    else if (move === 'pull-out') { B = at(base, base.zoom / 1.3, W, H); }
    else if (move === 'tilt-up' || move === 'tilt-down') {
      const vh = H / base.zoom, d = (move === 'tilt-up' ? 1 : -1) * 0.32 * vh;
      A = { ...base, cy: base.cy + d };
    }
    if (base.establishing && (move === 'push-in' || move === 'pull-out')) {
      // establishing frames already show the widest view: push from it to 1.3× it (or pull back out to it)
      const tight = at(base, base.zoom * 1.3, W, H);
      if (move === 'push-in') { A = base; B = tight; } else { A = tight; B = base; }
    }
    const Ac = clampCam(A), Bc = clampCam(B);
    frames = { from: Ac, to: Bc };
    if (move === 'handheld') {
      const nx = noise1(seed % 9973 + 11), ny = noise1(seed % 9973 + 23), nz = noise1(seed % 9973 + 37);
      cameraAt = t => {
        const c = { ...Bc }, vw = W / c.zoom, vh = H / c.zoom;
        c.cx += (nx(t * 0.55) - 0.5) * 0.016 * vw + (nx(t * 2.1 + 40) - 0.5) * 0.003 * vw;
        c.cy += (ny(t * 0.5) - 0.5) * 0.014 * vh + (ny(t * 2.3 + 40) - 0.5) * 0.003 * vh;
        c.zoom *= 1 + (nz(t * 0.3) - 0.5) * 0.012;
        return clampCam(c);
      };
    } else if (move === 'static') cameraAt = () => Bc;
    else cameraAt = t => clampCam(lerpCam(Ac, Bc, easeIO((t - t0) / dur)));
  }
  return { cameraAt, size, move, angle, frames };
}

// World rect visible to a camera.
export const viewRect = (cam, W, H) => [cam.cx - W / 2 / cam.zoom, cam.cy - H / 2 / cam.zoom, cam.cx + W / 2 / cam.zoom, cam.cy + H / 2 / cam.zoom];
export const toScreen = (cam, W, H, x, y) => [(x - cam.cx) * cam.zoom + W / 2, (y - cam.cy) * cam.zoom + H / 2];
export const boxToScreen = (cam, W, H, b) => { const a = toScreen(cam, W, H, b[0], b[1]), c = toScreen(cam, W, H, b[2], b[3]); return [a[0], a[1], c[0], c[1]]; };
export { ease };
