// The automatic camera. A subject is { box: [x0, y0, x1, y1] (world), head: [x, y], hh (head size, world px),
// face }. Each shot size frames a region of every subject (the whole body, waist up, head and shoulders, the
// face) so that the union of those regions fills a set fraction of the frame height, with lead room in the
// direction the subjects face and size-dependent headroom. Moves interpolate between framings; every camera is
// clamped by the set so the frame never shows unpainted edges.
// Round 2 (DESIGN §9.1): a push-in / pull-out may end at another size ("to") on other subjects ("toOn"), or at
// "zoomTo" × the starting zoom; "moveAt" / "moveDur" confine any move to a window of the shot (eased, holding
// before and after). Zoom moves keep their subject gliding in a straight line on screen while the zoom changes
// geometrically. "offset" is frame fractions (|v| ≤ 2) or, larger, a world-pixel shift of the framing.
// Close shots compose the range a subject's resting head covers (sub.rest, with its look up / down applied:
// sub.heads) from the first to the last moment it is near where it stays longest: pacing about or stepping away and
// back stays in frame; the apex of a jump or gesture, a run out of the close-up or an arrival from afar does not.
// A gesture that holds the head somewhere for HOLD s or more (a mouse sitting up to gasp, a deer grazing) and would
// take it out of a static or handheld close shot's frame (not an extreme close-up) is followed: the frame eases out to
// hold it, with its crown (the ears), just before, and back after (followHeld); the rest of the shot keeps its
// composition.
// Placement: a framing that shows whole bodies with room to spare (a medium two-shot fitted to the width, a full
// shot of a low, long animal) sits on the lower part of the frame like a full / wide shot instead of hanging from
// the top; the framed region always stays inside the frame (an offset or the lead room can't push a head out), and
// every head stays above the caption band (CAPTION_BAND; feet may go into it), even with a "zoom" or a low angle.
// A low angle sits the subjects lower, under more sky; a high one higher, over more ground.
// A close shot keeps other actors that would come between the lens and its subject out of frame when it can.
// A zoom move with "zoomTo" zooms about its target (the subjects plus any offset): that point keeps its place. A move
// confined to a window ("moveAt" / "moveDur") to another size composes its first framing for what happens before the
// move and its last for what happens after it: where the subjects stay; if they then wander out of it (pacing after
// a push-in to a close-up), the camera eases back just before they would leave, to a framing that holds it all.
// A static shot never moves: one framing, composed once for everything its subjects do over the shot (a subject
// walking toward another stays whole in it from the first frame to the last; to tighten as they come together, a shot
// declares a push-in "to" a size; the one exception is following a held gesture in a close shot, above). A pan to
// someone who is leaving arrives while they are still whole in its last frame.
// buildCamera's reach (and frameSubjects'): how close the framing of the subjects together gets to the framing the
// hardest of them would get alone (compile warns when a two-shot's staging keeps it under half); reaches: the same
// for each subject on its own size (compile warns about an actor dwarfed by an anchor or a much bigger actor).
import { noise1 } from '../core/lib.mjs';
import { clamp, lerp, ease, easeIO } from './util.mjs';

// closest zoom (screen px per world px): enough for the head of a squirrel or a child-sized tortoise to fill a
// close-up; the painted set is that soft only behind the subject, where the depth of field blurs it anyway
export const ZMAX = 36;
// the top of the band burned-in captions use (fraction of the frame height): shots of bodies keep heads above it
export const CAPTION_BAND = 0.8;
export const SIZE_SPEC = {
  establishing: { f: 0, wmax: 1 },
  wide: { f: 0.18, wmax: 0.8, region: 'body', centerY: 0.6, lead: 0.07 },
  full: { f: 0.6, wmax: 0.82, region: 'body', centerY: 0.53, lead: 0.08 },
  medium: { f: 0.75, wmax: 0.86, region: 'waist', topY: 0.1, lead: 0.09 },
  close: { f: 0.7, wmax: 0.9, region: 'head', headY: 0.42, lead: 0.1 },
  'extreme-close': { f: 0.85, wmax: 0.95, region: 'face', headY: 0.47, lead: 0.06 },
};
export const LOOSER = { 'extreme-close': 'close', close: 'medium', medium: 'full', full: 'wide', wide: 'establishing', establishing: 'establishing' };

// The part of a subject a shot size frames (world box). sub.heads ([x0, y0, x1, y1], optional): the range the head
// covers over the shot; close shots frame all of it.
export function regionOf(sub, size) {
  const [x0, y0, x1, y1] = sub.box, [hx, hy] = sub.head, hh = sub.hh, [ha, hb, hc, hd] = sub.heads || [hx, hy, hx, hy];
  switch (SIZE_SPEC[size]?.region) {
    case 'waist': return [x0, y0, x1, y0 + Math.max(0.62 * (y1 - y0), Math.min(y1 - y0, hd + 0.9 * hh - y0))];
    case 'head': return [ha - 0.9 * hh, Math.max(y0, hb - 0.85 * hh), hc + 0.9 * hh, hd + 0.85 * hh];
    case 'face': return [ha - 0.6 * hh, hb - 0.5 * hh, hc + 0.6 * hh, hd + 0.5 * hh];
    default: return [x0, y0, x1, y1];
  }
}
const union = (A, B) => (A ? [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])] : B.slice());

/**
 * Frame subjects for a shot size. → { cx, cy, zoom, ref: [wx, wy], scr: [sx, sy] } where the world point `ref`
 * appears at screen point `scr` (so the same composition can be re-solved at another zoom with at()).
 * opts: { W, H, angle, lead (override), zoomK (multiplier), offset: [fx, fy] (frame fractions), S (set) }
 */
export function frameSubjects(subs, size, { W, H, angle = 'eye', zoomK = 1, offset = null, S = null, faceHint = 0, refH = null, refHs = null } = {}) {
  const spec = SIZE_SPEC[size] || SIZE_SPEC.wide;
  const px = offset && (Math.abs(offset[0]) > 2 || Math.abs(offset[1]) > 2) ? offset : null, frac = px ? null : offset;
  if (!subs.length || size === 'establishing') {
    let cx = S ? S.refX : 0, cy = S ? S.refY : 0, target = null;
    if (subs.length) { let R = null; for (const s of subs) R = union(R, s.box); cx = (R[0] + R[2]) / 2; target = [cx, (R[1] + R[3]) / 2]; cy = lerp(cy, target[1], 0.35); }
    if (px) { cx += px[0]; cy += px[1]; }
    // target: what a zoom from this view closes in on (the subjects, moved by the offset)
    target = target ? [target[0] + (px ? px[0] : 0), target[1] + (px ? px[1] : 0)] : [cx, cy];
    const widest = S ? S.clampCamera({ cx, cy, zoom: 0.01 }, W, H).zoom : 1;
    return { cx, cy, zoom: widest * zoomK, ref: [cx, cy], scr: [W / 2, H / 2], establishing: true, target };
  }
  const head = spec.region === 'head' || spec.region === 'face';
  let R = null, B = null, faces = 0, hmax = 0;
  for (const s of subs) { const g = regionOf(s, size); R = union(R, g); B = union(B, s.box); faces += s.face; hmax = Math.max(hmax, g[3] - g[1]); }
  const rw = Math.max(1, R[2] - R[0]), rh = Math.max(1, R[3] - R[1]);
  // the size sets the zoom from the subject's own height (refH: its typical height over the shot); the union of
  // everything the subjects do in the shot only has to fit inside the frame
  const hfit = head ? 0.94 : 0.88;
  // shots of bodies keep every head above the caption band (feet may go into it): the lowest head's bottom
  const HB = head ? null : Math.max(...subs.map(s => (s.heads ? s.heads[3] : s.head[1]) + 0.55 * s.hh));
  const bandZ = head ? Infinity : ((CAPTION_BAND - 0.05) * H) / Math.max(1, HB - R[1]);
  const sizeZ = (spec.f * H) / Math.max(1, refH ?? hmax);
  let zoom = Math.min(Math.min(sizeZ, (spec.wmax * W) / rw, (hfit * H) / rh) * zoomK, bandZ);
  // a close shot keeps every drawn head (±0.62 hh) over its whole range in frame, with air above it
  let K = null;
  if (spec.region === 'head') {
    for (const s of subs) { const [ha, hb, hc, hd] = s.heads || [...s.head, ...s.head], e = 0.62 * s.hh; K = union(K, [ha - e, hb - e, hc + e, hd + e]); }
    zoom = Math.min(zoom, (0.86 * H) / Math.max(1, K[3] - K[1]));
  }
  zoom = Math.min(zoom, ZMAX * Math.max(1, Math.min(W, H) / 1080));
  const face = Math.sign(faces || faceHint);
  // horizontal: the region's centre, pushed back against the lead (more room ahead of the subjects)
  const vw = W / zoom;
  let lead = (subs.length === 1 || Math.abs(faces) === subs.length ? spec.lead : spec.lead * 0.4) * vw * face;
  const slack = Math.max(0, (vw - rw) / 2 - 0.04 * vw);
  lead = clamp(lead, -slack, slack);
  const rcx = (R[0] + R[2]) / 2;
  let sx = W / 2 - lead * zoom;
  // vertical: size-dependent placement of the region (or of the head's range for close shots)
  let wy, sy;
  if (head) {
    wy = subs.reduce((a, s) => a + (s.heads ? (s.heads[1] + s.heads[3]) / 2 : s.head[1]), 0) / subs.length; sy = spec.headY * H;
  } else if (spec.region === 'waist') { wy = R[1]; sy = spec.topY * H; }
  else { wy = (R[1] + R[3]) / 2; sy = spec.centerY * H; }
  // a low camera looks up: the subjects sit lower, under more sky; a high one looks down on them
  if (angle === 'low') { sy += 0.07 * H; zoom = Math.min(zoom * 1.04, Math.max(zoom, bandZ)); }
  if (angle === 'high') { sy -= 0.07 * H; }
  // whole bodies with room to spare sit where a full or wide shot puts them (lower for smaller figures), not
  // hanging from the top of the frame over empty ground
  if (!head) {
    const hb = (B[3] - B[1]) * zoom, c0 = sy + ((B[1] + B[3]) / 2 - wy) * zoom;
    const want = H * (lerp(0.6, 0.53, clamp((hb / H - 0.18) / 0.42)) + (angle === 'low' ? 0.07 : angle === 'high' ? -0.07 : 0));
    if (want > c0) sy += want - c0;
  }
  if (frac) { sx += frac[0] * W; sy += frac[1] * H; }
  // the framed region stays inside the frame: headroom over the top of the heads (when it can't all fit, the frame
  // cuts the bottom, never the heads), a little air at the sides (centred when too wide)
  const fit = (s, lo, hi, a, b, top) => (b - a > hi - lo ? s + (top ? lo - a : ((lo + hi) - (a + b)) / 2) : s + Math.max(0, lo - a) - Math.max(0, b - hi));
  const ox = px ? px[0] : 0, oy = px ? px[1] : 0, V = K || R;
  sx = fit(sx, 0.02 * W, 0.98 * W, sx + (R[0] - rcx - ox) * zoom, sx + (R[2] - rcx - ox) * zoom);
  // (whole bodies keep a little ground under their feet)
  const lo = (K ? 0.07 : head ? 0.02 : 0.05) * H;
  sy = fit(sy, lo, (K ? 0.98 : spec.region === 'body' ? 0.94 : 1) * H, sy + (V[1] - wy - oy) * zoom, sy + (V[3] - wy - oy) * zoom, true);
  // (and the heads above the caption band, as far as the headroom allows)
  if (!head) sy -= Math.min(Math.max(0, sy + (HB - wy - oy) * zoom - CAPTION_BAND * H), Math.max(0, sy + (V[1] - wy - oy) * zoom - lo));
  // reach: how close the framing of them together gets to the framing the hardest of them to frame would get alone
  // (1: as close; well below 1: they stand too far apart, side by side or one above the other, for this size)
  const alone = Math.min(...subs.map(s => { const g = regionOf(s, size); return Math.min(sizeZ, (spec.wmax * W) / Math.max(1, g[2] - g[0]), (hfit * H) / Math.max(1, g[3] - g[1])); }));
  // reaches: the same for each subject on its own size (its typical framed height, refHs), so a small actor framed
  // with an anchor or a much bigger actor shows how small it reads (1: as big as it would be framed alone)
  const zcap = ZMAX * Math.max(1, Math.min(W, H) / 1080), reaches = {};
  for (const s of subs) {
    const g = regionOf(s, size), gh = Math.max(1, g[3] - g[1]), e = 0.62 * s.hh, [, hb, , hd] = s.heads || [...s.head, ...s.head];
    let z = Math.min((spec.f * H) / Math.max(1, refHs?.[s.id] ?? gh), (spec.wmax * W) / Math.max(1, g[2] - g[0]), (hfit * H) / gh) * zoomK;
    if (!head) z = Math.min(z, ((CAPTION_BAND - 0.05) * H) / Math.max(1, hd + 0.55 * s.hh - g[1]));
    if (spec.region === 'head') z = Math.min(z, (0.86 * H) / Math.max(1, hd - hb + 2 * e));
    reaches[s.id] = Math.min(1, zoom / Math.min(z, zcap));
  }
  return { ...at({ ref: [rcx + ox, wy + oy], scr: [sx, sy] }, zoom, W, H), reach: Math.min(1, zoom / (Math.min(alone, ZMAX) * zoomK)), reaches };
}
// Re-solve a composition at another zoom.
export function at(F, zoom, W, H) {
  return { cx: F.ref[0] - (F.scr[0] - W / 2) / zoom, cy: F.ref[1] - (F.scr[1] - H / 2) / zoom, zoom, ref: F.ref, scr: F.scr };
}

// The set's clamp keeps the camera centre inside its view rect. Tight shots (zoom > 1.6) may move the centre
// past it, toward subjects near the edge of the view, as long as the frame stays inside the painted area (eased in
// with the zoom, so a zoom move doesn't jolt where it starts or stops relaxing).
export function clampFrame(S, c, W, H) {
  const out = S.clampCamera({ cx: c.cx, cy: c.cy, zoom: c.zoom }, W, H), relax = ease((out.zoom - 1.6) / 1.2);
  if (relax > 0) {
    const A = S.area, hw = W / 2 / out.zoom, hh = H / 2 / out.zoom;
    out.cx = lerp(out.cx, clamp(c.cx, A.x0 + hw, A.x1 - hw), relax);
    out.cy = lerp(out.cy, clamp(c.cy, A.y0 + hh, A.y1 - hh), relax);
  }
  return { cx: out.cx, cy: out.cy, zoom: out.zoom };
}
const lerpCam = (a, b, u) => ({ cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), zoom: a.zoom * Math.pow(b.zoom / a.zoom, u) });
// A move between two cameras that keeps the world point P on a straight screen path while the zoom changes
// geometrically (a plain lerp of the centre lets the subject swing out of frame during a big zoom).
function anchored(a, b, P, W, H) {
  const sa = [(P[0] - a.cx) * a.zoom + W / 2, (P[1] - a.cy) * a.zoom + H / 2], sb = [(P[0] - b.cx) * b.zoom + W / 2, (P[1] - b.cy) * b.zoom + H / 2];
  return u => {
    const z = a.zoom * Math.pow(b.zoom / a.zoom, u);
    return { cx: P[0] - (lerp(sa[0], sb[0], u) - W / 2) / z, cy: P[1] - (lerp(sa[1], sb[1], u) - H / 2) / z, zoom: z };
  };
}

// How long a gesture must hold the head in one place (its offset from rest within FLAT head heights) for a close shot
// to follow it (s).
export const HOLD = 0.5, FLAT = 0.5;
// The part of each sample's head offset from its resting head (a gesture: the head as drawn minus the resting head,
// while standing still) that is held for HOLD s or more: per axis and direction, the largest offset that every sample
// of some HOLD-long stretch around it reaches (an opening: the min over the stretch, the max over the stretches), from
// the stretches where the head holds a place (their median offset within FLAT head heights of that level): a mouse
// sitting up to gasp, a deer grazing; not the arc of a jump or a nod's dip.
// subs: one subject's samples in time order; ts: their times. → [[dx, dy], ...]
export function heldOffsets(subs, ts) {
  const n = subs.length, d = subs.map(s => (s.moving || !s.rest ? [0, 0] : [s.head[0] - s.rest[0], s.head[1] - s.rest[1]]));
  // the stretches: from sample j to the first sample at least HOLD later (none when the samples end first)
  const ends = ts.map((t, j) => { let k = j; while (k < n - 1 && ts[k] - t < HOLD - 1e-6) k++; return ts[k] - t >= HOLD - 1e-6 ? k : -1; });
  const out = d.map(() => [0, 0]);
  for (const ax of [0, 1]) for (const sg of [1, -1]) {
    const f = d.map(v => Math.max(0, sg * v[ax]));
    for (let j = 0; j < n; j++) {
      if (ends[j] < 0) continue;
      const v = f.slice(j, ends[j] + 1).sort((a, b) => a - b), m = v[0];
      // (a sample is held one way or the other on an axis, never both)
      if (m > 0 && v[v.length >> 1] - m <= FLAT * subs[j].hh) for (let i = j; i <= ends[j]; i++) out[i][ax] = sg * Math.max(m, sg * out[i][ax]);
    }
  }
  return out;
}

// A static or handheld close shot following the gestures that hold a head out of its frame (heldOffsets). A held head
// (its resting head moved by the held offset, ±0.62 head heights, with its crown: how far the drawing goes over the
// resting head, the ears, 0.62 to 1.2 head heights) should stay in the frame with a little air, or as far in as the
// resting head is. Where it does not, the frame eases (over FOLLOW s or more, longer for a longer move) to one that
// holds every held head with its crown and every resting face over that stretch, the base frame moved and pulled back
// no more than that takes; holds it from just before the gesture leaves the base frame to just after it is back; and
// eases back (a stretch too near the cut holds that frame from the cut). Holding both, no head leaves the frame however
// the drawing times the gesture; a long move pulls back further (a deer grazing in a close-up is seen whole while it
// grazes). cam: the shot's frame (clamped); tracks: per subject, its samples at `times` (null where absent) and their
// held offsets (kept). → null when nothing has to move, else t → camera (not clamped).
export const FOLLOW = 0.5;
export function followHeld(cam, tracks, W, H, times) {
  const z = cam.zoom, n = times.length, ext = [W, H];
  if (n < 2) return null;
  const dt = (times[n - 1] - times[0]) / (n - 1), M = Math.max(1, Math.ceil(0.15 / dt));
  // (the crown: how far the drawing goes over the head at rest, its median; a gesture takes the ears along)
  const crowns = tracks.map(({ subs, kept }) => {
    const v = subs.flatMap((s, i) => (s && !s.moving && !kept[i][0] && !kept[i][1] ? [(s.head[1] - s.box[1]) / s.hh] : [])).sort((a, b) => a - b);
    return clamp(v.length ? v[v.length >> 1] : 0, 0.62, 1.2);
  });
  // per sample, each subject standing still, on screen: its resting head (face: f; with its crown: c) and its head
  // where it is held (with its crown; the resting face when it is not held)
  const heads = times.map((_, i) => tracks.flatMap(({ subs, kept }, j) => {
    const s = subs[i]; if (!s || s.moving) return [];
    const p = s.rest || s.head, [kx, ky] = kept[i], h = s.hh * z, x = (p[0] - cam.cx) * z + W / 2, y = (p[1] - cam.cy) * z + H / 2;
    const e = 0.62 * h, f = [x - e, y - e, x + e, y + e], c = [f[0], y - crowns[j] * h, f[2], f[3]];
    // (held: away from its resting place by more than a little)
    const tol = 0.15 * h, held = Math.hypot(kx, ky) * z > tol;
    return [{ f, c, b: held ? [c[0] + kx * z, c[1] + ky * z, c[2] + kx * z, c[3] + ky * z] : f, held, tol }];
  }));
  // where boxes may go: the frame less a little air, or as far out as the given resting boxes already are
  const area = (list, k) => [0, 1].map(a => [Math.min(0.02 * ext[a], ...list.map(o => o[k][a])), Math.max(0.98 * ext[a], ...list.map(o => o[k][a + 2]))]);
  // a held head goes further out of the frame than its resting head does (with their crowns)
  const need = heads.map(list => { const A = area(list, 'c'); return list.some(o => o.held && [0, 1].some(a => A[a][0] - o.b[a] > o.tol || o.b[a + 2] - A[a][1] > o.tol)); });
  if (!need.some(Boolean)) return null;
  // the frame for samples i0..i1: every held head with its crown and every resting face in it, the base frame pulled
  // back (about its centre) and moved no more than that takes (too tall for the frame: the crowns stay); its ease (s)
  const frameFor = (i0, i1) => {
    const list = heads.slice(i0, i1 + 1).flat(); let Q = null, Qh = null; for (const o of list) { Q = union(union(Q, o.b), o.f); if (o.held) Qh = union(Qh, o.b); }
    // (the held heads keep a little more room at the sides)
    const A = area(list, 'f'), Ah = [[Math.max(A[0][0], 0.05 * W), Math.min(A[0][1], 0.95 * W)], A[1]];
    const fitK = (B, R) => Math.min(1, (R[0][1] - R[0][0]) / (B[2] - B[0]), (R[1][1] - R[1][0]) / (B[3] - B[1]));
    const k = Math.min(fitK(Q, A), fitK(Qh, Ah));
    const sc = B => B.map((v, j) => ext[j % 2] / 2 + (v - ext[j % 2] / 2) * k), q = sc(Q), qh = sc(Qh);
    const sh = [0, 1].map(a => {
      const want = q[a + 2] - q[a] > A[a][1] - A[a][0] + 1e-6 ? A[a][0] - q[a] : Math.max(0, A[a][0] - q[a]) - Math.max(0, q[a + 2] - A[a][1]);
      return qh[a + 2] - qh[a] > Ah[a][1] - Ah[a][0] + 1e-6 ? Ah[a][0] - qh[a] : clamp(want, Ah[a][0] - qh[a], Ah[a][1] - qh[a + 2]);
    });
    const F = { cx: cam.cx - sh[0] / (z * k), cy: cam.cy - sh[1] / (z * k), zoom: z * k };
    return { F, T: Math.max(FOLLOW, Math.min(1.2, (Math.hypot(...sh) - 1.5 * H * Math.log(k)) / (1.2 * H))) };
  };
  // the stretches that need it (runs of samples), merged while their eases would meet
  let spans = [];
  need.forEach((v, i) => { if (!v) return; const L = spans[spans.length - 1]; if (L && L.i1 === i - 1) L.i1 = i; else spans.push({ i0: i, i1: i }); });
  const close = sp => { const { F, T } = frameFor(Math.max(0, sp.i0 - M), Math.min(n - 1, sp.i1 + M)); const a = times[Math.max(0, sp.i0 - M)], b = times[Math.min(n - 1, sp.i1 + M)]; return { ...sp, F, a: a - T < times[0] ? -Infinity : a, b: b + T > times[n - 1] ? Infinity : b, T }; };
  spans = spans.map(close);
  for (let j = 0; j + 1 < spans.length;) {
    if (spans[j].b + spans[j].T > spans[j + 1].a - spans[j + 1].T) spans.splice(j, 2, close({ i0: spans[j].i0, i1: spans[j + 1].i1 })); else j++;
  }
  return t => {
    const sp = spans.find(sp => t > sp.a - sp.T && t < sp.b + sp.T); if (!sp) return { ...cam };
    const w = t < sp.a ? easeIO((t - sp.a + sp.T) / sp.T) : t > sp.b ? easeIO((sp.b + sp.T - t) / sp.T) : 1;
    return lerpCam(cam, sp.F, w);
  };
}

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

// A close shot's frame moved (in screen px, as little as possible) so that actors in front of its subjects (nearer
// the lens: a larger depth key) leave the frame, as long as the subjects' framed region (and, for a close-up, the
// head with its air) stays in frame and the head no lower than the middle. When no small move clears them, the
// frame stays. subs: the subjects over the shot; others: [{ box (world, over the shot), key }].
export function clearView(cam, subs, others, size, W, H) {
  if (!subs.length || !others.length) return cam;
  const z = cam.zoom, X = x => (x - cam.cx) * z + W / 2, Y = y => (y - cam.cy) * z + H / 2;
  let R = null; for (const s of subs) R = union(R, regionOf(s, size));
  const key = Math.min(...subs.map(s => s.key ?? Infinity)), headY = subs.reduce((a, s) => a + Y(s.head[1]), 0) / subs.length;
  // the top that must stay in: the drawn heads with their air (a close-up), else the framed region
  const top = size === 'close' ? Math.min(...subs.map(s => Y((s.heads ? s.heads[1] : s.head[1]) - 0.62 * s.hh))) : Y(R[1]);
  // the content may move by dx ∈ [x0, x1], dy ∈ [y0, y1] (screen px)
  const lim = { x0: 0.02 * W - X(R[0]), x1: 0.98 * W - X(R[2]), y0: 0.07 * H - top, y1: 0.55 * H - headY };
  let dx = 0, dy = 0;
  for (const o of others) {
    if (!(o.key > key + 0.5)) continue;
    const b = [X(o.box[0]) + dx, Y(o.box[1]) + dy, X(o.box[2]) + dx, Y(o.box[3]) + dy];
    if (b[2] <= 0 || b[0] >= W || b[3] <= 0 || b[1] >= H) continue;
    // the four ways out of the frame, smallest first, that keep the subjects framed
    const ways = [[-b[2], 0], [W - b[0], 0], [0, -b[3]], [0, H - b[1]]]
      .map(([ex, ey]) => [dx + ex, dy + ey]).filter(([a, c]) => a >= Math.min(0, lim.x0) - 1e-6 && a <= Math.max(0, lim.x1) + 1e-6 && c >= Math.min(0, lim.y0) - 1e-6 && c <= Math.max(0, lim.y1) + 1e-6)
      .sort((p, q) => Math.hypot(p[0] - dx, p[1] - dy) - Math.hypot(q[0] - dx, q[1] - dy));
    if (ways.length) [dx, dy] = ways[0];
  }
  return dx || dy ? { ...cam, cx: cam.cx - dx / z, cy: cam.cy - dy / z } : cam;
}

/**
 * Build a shot's camera.
 *   spec: film camera block; subjectsAt(t, ids) → subjects; ids: subject ids (or [ids0, ids1] for a pan);
 *   t0, t1: shot times; S: set instance; W, H; seed; othersAt(t, ids) → the other visible actors as subjects (for
 *   keeping actors in front of a close shot's subject out of its frame)
 * → { cameraAt(t) → { cx, cy, zoom }, size, move, frames }
 */
export function buildCamera({ spec = {}, size, ids, subjectsAt: subjectsAt0, othersAt = null, t0, t1, S, W, H, seed = 1 }) {
  const move = spec.move || 'static', angle = spec.angle || 'eye', zoomK = spec.zoom || 1;
  // the subjects are sampled at the same times again and again (framings over windows of the shot): remember them
  const memo = new Map(), subjectsAt = (t, list) => { const k = `${t}|${list.join(',')}`; if (!memo.has(k)) memo.set(k, subjectsAt0(t, list)); return memo.get(k); };
  const opts = { W, H, angle, zoomK, S, offset: Array.isArray(spec.offset) ? spec.offset : null };
  const clampCam = c => clampFrame(S, c, W, H);
  const dur = Math.max(1e-3, t1 - t0);
  const N = Math.max(3, Math.min(72, Math.ceil(dur * 8) + 1));
  const times = Array.from({ length: N }, (_, i) => t0 + (dur * i) / (N - 1) - (i === N - 1 ? 1e-4 : 0));
  // one subject over the shot: the union of its boxes, its typical resting head (median over the samples) and the
  // range its resting head covers (a look up or down, a turn, sitting up: all of it stays in a close shot; the apex
  // of a jump or a gesture is not a resting head). That range runs from the first to the last moment the head is near
  // where it stays longest (within 2 head heights), so pacing about, or stepping away and coming back, stays in the
  // frame, while a run out of a close-up (it never comes back) or an arrival from afar does not widen it. A subject
  // on the move all shot long: the range of the whole move. stay: only where it stays longest.
  const unionSub = (subs, stayOnly = false) => {
    if (!subs.length) return [];
    let box = null, heads = null, hx = 0, hh = 0, face = 0, stay = [], cur = [];
    subs.forEach((s, i) => {
      box = union(box, s.box); hx += s.head[0]; hh = Math.max(hh, s.hh); face += s.face;
      if (s.moving) cur = []; else { cur.push(i); if (cur.length > stay.length) stay = cur; }
    });
    const pt = s => { const r = s.rest || s.head; return [r[0], r[1], r[0], r[1]]; };
    let i0 = 0, i1 = subs.length - 1;
    if (stay.length) {
      let home = null; for (const i of stay) home = union(home, pt(subs[i]));
      const m = 2 * hh, near = i => { const [x, y] = pt(subs[i]); return x >= home[0] - m && x <= home[2] + m && y >= home[1] - m && y <= home[3] + m; };
      i0 = stay[0]; i1 = stay[stay.length - 1];
      if (!stayOnly) for (let i = 0; i < i0; i++) if (near(i)) { i0 = i; break; }
      if (!stayOnly) for (let i = subs.length - 1; i > i1; i--) if (near(i)) { i1 = i; break; }
    }
    for (let i = i0; i <= i1; i++) heads = union(heads, pt(subs[i]));
    const ys = subs.map(s => (s.rest || s.head)[1]).sort((a, b) => a - b);
    return { id: subs[0].id, box, heads, head: [hx / subs.length, ys[ys.length >> 1]], hh, face: Math.sign(face), key: subs[subs.length >> 1].key };
  };
  // the samples inside a window of the shot (film times; the whole shot by default)
  const within = (win = null) => (win ? times.filter(t => t >= win[0] - 1e-6 && t <= win[1] + 1e-6) : times);
  // the union over time keeps each subject separate (regions per subject), so collect per id
  const perId = (list, win, stayOnly = false) => {
    const by = new Map();
    for (const t of within(win)) for (const s of subjectsAt(t, list)) { if (!by.has(s.id)) by.set(s.id, []); by.get(s.id).push(s); }
    return [...by.values()].map(subs => unionSub(subs, stayOnly));
  };
  // the subjects' typical framed height over the shot (median over samples of the tallest region)
  const refH = (list, sz = size, win) => {
    const hs = [];
    for (const t of within(win)) { let h = 0; for (const s of subjectsAt(t, list)) { const g = regionOf(s, sz); h = Math.max(h, g[3] - g[1]); } if (h > 0) hs.push(h); }
    hs.sort((a, b) => a - b); return hs.length ? hs[hs.length >> 1] : null;
  };
  // ... and each subject's own (for how big each reads in the framing of them together)
  const refHs = (list, sz = size, win) => {
    const by = {};
    for (const t of within(win)) for (const s of subjectsAt(t, list)) { const g = regionOf(s, sz); (by[s.id] ||= []).push(g[3] - g[1]); }
    for (const id in by) { const hs = by[id].sort((a, b) => a - b); by[id] = hs[hs.length >> 1]; }
    return by;
  };
  // the move's window: moveAt / moveDur (s from the shot start), else the whole shot
  const windowed = spec.moveAt !== undefined || spec.moveDur !== undefined;
  const mAt = clamp(spec.moveAt ?? 0, 0, dur), mDur = Math.max(1e-3, spec.moveDur ?? dur - mAt);
  const mu = t => easeIO((t - t0 - mAt) / mDur);
  // a move confined to a window composes its first framing for what happens before it and its last for what
  // happens after it (at least the first / last fifth of the shot)
  const span = Math.max(dur / 5, 3 / 8);
  const winA = windowed ? [t0, t0 + Math.max(mAt, span)] : null, winB = windowed ? [Math.min(t0 + mAt + mDur, t1 - span), t1] : null;
  let cameraAt, frames = {}, endF = null;
  const F = (list, sz = size, win = null, stayOnly = false) => frameSubjects(perId(list, win, stayOnly), sz, { ...opts, refH: refH(list, sz, win), refHs: refHs(list, sz, win) });
  // a subject's resting head is inside a camera's frame
  const headIn = (c, s) => {
    const [x, y] = s.rest || s.head, e = 0.5 * s.hh, X = v => (v - c.cx) * c.zoom + W / 2, Y = v => (v - c.cy) * c.zoom + H / 2;
    return X(x - e) >= 0 && X(x + e) <= W && Y(y - e) >= 0 && Y(y + e) <= H;
  };
  if (move === 'pan' && ids.length >= 2) {
    const last = ids[ids.length - 1], A = clampCam(F([ids[0]])), B = clampCam(F([last]));
    frames = { from: A, to: B };
    // a pan to someone who is leaving (an exit is framed where it starts) arrives while all of them is still in the
    // frame it pans to, a second before they reach its edge, so they are seen walking out of it
    let pa = t0 + 0.12 * dur, pb = t0 + 0.88 * dur;
    if (!windowed) {
      const [x0, y0, x1, y1] = viewRect(B, W, H), inB = b => b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1;
      const tOut = times.find(t => subjectsAt(t, [last]).some(s => s.now && !inB(s.now)));
      if (tOut !== undefined && tOut - 1 < pb && tOut - 1 > t0 + 0.8) { pb = tOut - 1; pa = Math.max(t0, Math.min(pa, pb - Math.max(1, 0.4 * (pb - t0)))); }
    }
    cameraAt = windowed ? t => clampCam(lerpCam(A, B, mu(t))) : t => clampCam(lerpCam(A, B, easeIO((t - pa) / (pb - pa))));
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
    const zoomMove = move === 'push-in' || move === 'pull-out';
    const toIds = spec.toOn ? (typeof spec.toOn === 'string' ? [spec.toOn] : spec.toOn) : null, toMove = zoomMove && (spec.to || toIds);
    const base = F(ids, size, toMove ? winA : null);
    let A = base, B = base, P = base.ref, re = null;
    endF = base;
    if (toMove) {
      // from this size's framing to another size's framing (of other subjects): the subject being left (pull-out)
      // or approached (push-in) glides straight on screen
      const list = toIds || ids, sz = spec.to || size;
      B = endF = F(list, sz, winB);
      if (windowed) {
        // the last framing is held after the move: it frames where the subjects stay, and when they later wander out
        // of it (pacing about after the line), the camera eases back just before they would leave to a framing that
        // holds all of it
        const tight = F(list, sz, winB, true), Tc = clampCam(tight), mEnd = t0 + mAt + mDur, dr = 0.8;
        const tLeave = tight.zoom > B.zoom * 1.12 ? within(winB).find(t => t > mEnd && subjectsAt(t, list).some(s => !headIn(Tc, s))) : undefined;
        if (tLeave !== undefined && tLeave - dr > mEnd) { re = { a: Tc, b: clampCam(B), t0: tLeave - dr, dur: dr, P: tight.ref }; B = tight; }
      }
      P = move === 'pull-out' ? base.ref : B.ref;
    } else if (zoomMove && spec.zoomTo) {
      // a zoom about the target (the subjects plus any offset): it stays where the (clamped) start shows it
      const A0 = clampCam(base);
      P = base.target || base.ref;
      B = at({ ref: P, scr: [(P[0] - A0.cx) * A0.zoom + W / 2, (P[1] - A0.cy) * A0.zoom + H / 2] }, A0.zoom * spec.zoomTo, W, H);
    }
    else if (move === 'push-in') { A = at(base, base.zoom / 1.3, W, H); }
    else if (move === 'pull-out') { B = at(base, base.zoom / 1.3, W, H); }
    else if (move === 'tilt-up' || move === 'tilt-down') {
      const vh = H / base.zoom, d = (move === 'tilt-up' ? 1 : -1) * 0.32 * vh;
      A = { ...base, cy: base.cy + d };
    }
    if (base.establishing && zoomMove && !spec.to && !toIds && !spec.zoomTo) {
      // establishing frames already show the widest view: push from it to 1.3× it (or pull back out to it)
      const tight = at(base, base.zoom * 1.3, W, H);
      if (move === 'push-in') { A = base; B = tight; } else { A = tight; B = base; }
    }
    if ((move === 'static' || move === 'handheld') && (size === 'close' || size === 'extreme-close') && othersAt) {
      const by = new Map();
      for (const t of times) for (const o of othersAt(t, ids)) { const q = by.get(o.id); by.set(o.id, q ? { ...q, box: union(q.box, o.box), key: Math.max(q.key, o.key) } : o); }
      B = clearView(clampCam(B), perId(ids), [...by.values()], size, W, H); A = B;
    }
    const Ac = clampCam(A), Bc = clampCam(B), path = anchored(Ac, Bc, P, W, H);
    frames = { from: Ac, to: re ? re.b : Bc };
    // a close shot follows the gestures that hold a head out of its frame (an actor's samples: its held offsets)
    let follow = null;
    if ((move === 'static' || move === 'handheld') && size === 'close') {
      const by = new Map();
      times.forEach((t, i) => { for (const s of subjectsAt(t, ids)) if (s.key !== undefined) { if (!by.has(s.id)) by.set(s.id, times.map(() => null)); by.get(s.id)[i] = s; } });
      const tracks = [...by.values()].map(subs => {
        const ix = subs.flatMap((s, i) => (s ? [i] : [])), k = heldOffsets(ix.map(i => subs[i]), ix.map(i => times[i])), kept = subs.map(() => [0, 0]);
        ix.forEach((i, j) => { kept[i] = k[j]; });
        return { subs, kept };
      });
      follow = followHeld(Bc, tracks, W, H, times);
    }
    if (move === 'handheld') {
      const nx = noise1(seed % 9973 + 11), ny = noise1(seed % 9973 + 23), nz = noise1(seed % 9973 + 37);
      cameraAt = t => {
        const c = follow ? follow(t) : { ...Bc }, vw = W / c.zoom, vh = H / c.zoom;
        c.cx += (nx(t * 0.55) - 0.5) * 0.016 * vw + (nx(t * 2.1 + 40) - 0.5) * 0.003 * vw;
        c.cy += (ny(t * 0.5) - 0.5) * 0.014 * vh + (ny(t * 2.3 + 40) - 0.5) * 0.003 * vh;
        c.zoom *= 1 + (nz(t * 0.3) - 0.5) * 0.012;
        return clampCam(c);
      };
    } else if (move === 'static') cameraAt = follow ? t => clampCam(follow(t)) : () => Bc;
    else if (re) {
      const back = anchored(re.a, re.b, re.P, W, H);
      cameraAt = t => clampCam(t < re.t0 ? path(mu(t)) : back(easeIO((t - re.t0) / re.dur)));
    } else cameraAt = t => clampCam(path(windowed ? mu(t) : easeIO((t - t0) / dur)));
  }
  // how close to its size the framing the shot ends on gets (reaches: per subject id)
  const reach = endF?.reach ?? 1, reaches = endF?.reaches ?? {};
  return { cameraAt, size, move, angle, frames, reach, reaches };
}

// World rect visible to a camera.
export const viewRect = (cam, W, H) => [cam.cx - W / 2 / cam.zoom, cam.cy - H / 2 / cam.zoom, cam.cx + W / 2 / cam.zoom, cam.cy + H / 2 / cam.zoom];
export const toScreen = (cam, W, H, x, y) => [(x - cam.cx) * cam.zoom + W / 2, (y - cam.cy) * cam.zoom + H / 2];
export const boxToScreen = (cam, W, H, b) => { const a = toScreen(cam, W, H, b[0], b[1]), c = toScreen(cam, W, H, b[2], b[3]); return [a[0], a[1], c[0], c[1]]; };
export { ease };
