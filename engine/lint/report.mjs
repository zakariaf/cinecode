// The lint report: lint.json (every issue) and lint.jpg, a contact sheet on paper with a timeline of the film
// (shots, scenes and where each issue happens) and one numbered tile per issue: the frame at the issue's worst
// moment with the offending boxes, footprints and contact points outlined (an arrow on the edge for anything
// off frame, a magnified inset when the marks are small), then its rule, shot, time span and message. Issues
// about a cut (cut-jump, axis) show the frame after the cut with the frame before it as an inset.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { drawFrame } from '../film/frame.mjs';
import { RULES, LIMITS } from './lint.mjs';

const PAPER = '#f1e8d6', INK = '#2a2130', MUTED = '#7a6c74';
const SEV = { error: '#c4372c', warning: '#d58a12' };
const SERIF = 'Georgia, "Times New Roman", serif', MONO = 'Menlo, "DejaVu Sans Mono", monospace';
const clock = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const range = i => (i.t1 - i.t0 > 0.05 ? `${clock(i.t0)}–${clock(i.t1)}` : clock(i.t));

/**
 * Write outDir/lint.json and outDir/lint.jpg.
 * opts: { maxTiles = 48, cols = 3, tile = 640 (px, longer side of a still), quality = 88 } → { json, jpg, tiles, omitted }
 */
export async function writeLintReport(plan, result, outDir, opts = {}) {
  mkdirSync(outDir, { recursive: true });
  const errors = result.errors || [], warnings = result.warnings || [];
  const json = join(outDir, 'lint.json'), jpg = join(outDir, 'lint.jpg');
  writeFileSync(json, `${JSON.stringify({
    title: plan.title ?? '', format: { width: plan.W, height: plan.H, fps: plan.fps }, duration: plan.duration, shots: (plan.shots || []).length,
    counts: { errors: errors.length, warnings: warnings.length }, stats: result.stats ?? null, limits: LIMITS,
    rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.severity])), errors, warnings,
  }, null, 2)}\n`);
  const all = [...errors, ...warnings];
  const tiles = all.slice(0, opts.maxTiles ?? 48);
  const sheet = drawSheet(plan, result, tiles, all.length - tiles.length, opts);
  writeFileSync(jpg, await sheet.encode('jpeg', opts.quality ?? 88));
  return { json, jpg, tiles: tiles.length, omitted: all.length - tiles.length };
}

// ───────────── layout ─────────────
function drawSheet(plan, result, tiles, omitted, opts) {
  const W = plan.W, H = plan.H, long = opts.tile ?? 640;
  // stills fit a long × 0.5625·long box on their long side (16:9 → 640×360, 9:16 → 360×640)
  const k = W >= H ? Math.min(long / W, (long * 0.5625) / H) : Math.min((long * 0.5625) / W, long / H), tw = Math.round(W * k), th = Math.round(H * k);
  const cols = Math.max(1, Math.min(opts.cols ?? (W >= H ? 3 : 4), tiles.length || 1));
  const u = long / 640, margin = Math.round(40 * u), gap = Math.round(28 * u);
  const header = Math.round(96 * u), timeline = Math.round(92 * u), label = Math.round(112 * u);
  const width = Math.max(2 * margin + cols * tw + (cols - 1) * gap, Math.round(1200 * u));
  const rows = Math.ceil(tiles.length / cols);
  const body = tiles.length ? rows * (th + label) + (rows - 1) * gap : Math.round(120 * u);
  const height = margin + header + timeline + body + (omitted ? Math.round(40 * u) : 0) + margin;
  const c = createCanvas(width, height), x = c.getContext('2d');
  paper(x, width, height);

  // header
  const errors = result.errors || [], warnings = result.warnings || [];
  x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.fillStyle = INK;
  x.font = `bold ${Math.round(34 * u)}px ${SERIF}`;
  x.fillText(`Lint · ${plan.title || 'Untitled'}`, margin, margin + Math.round(36 * u));
  x.font = `${Math.round(18 * u)}px ${SERIF}`;
  let cx = margin;
  const chip = (n, word, col) => {
    const s = `${n} ${word}${n === 1 ? '' : 's'}`;
    x.fillStyle = n ? col : MUTED; x.font = `bold ${Math.round(18 * u)}px ${SERIF}`; x.fillText(s, cx, margin + Math.round(68 * u));
    cx += x.measureText(s).width + Math.round(18 * u);
  };
  chip(errors.length, 'error', SEV.error); chip(warnings.length, 'warning', SEV.warning);
  const st = result.stats || {}, shots = (plan.shots || []).length;
  x.font = `${Math.round(16 * u)}px ${SERIF}`; x.fillStyle = MUTED;
  x.fillText(`${clock(plan.duration)} · ${shots} shot${shots === 1 ? '' : 's'} · ${W}×${H} @ ${plan.fps} fps${st.samples ? ` · ${st.samples} samples every ${(+st.step).toFixed(2)} s, teleports every frame` : ''}`, cx + Math.round(6 * u), margin + Math.round(68 * u));
  x.strokeStyle = INK; x.globalAlpha = 0.35; x.lineWidth = Math.max(1, u);
  x.beginPath(); x.moveTo(margin, margin + header - Math.round(12 * u)); x.lineTo(width - margin, margin + header - Math.round(12 * u)); x.stroke(); x.globalAlpha = 1;

  // timeline
  drawTimeline(x, plan, tiles, [...errors, ...warnings], { x0: margin, y0: margin + header, w: width - 2 * margin, h: timeline - Math.round(28 * u), u });

  // tiles
  const top = margin + header + timeline;
  if (!tiles.length) {
    x.textAlign = 'center'; x.fillStyle = INK; x.font = `italic ${Math.round(26 * u)}px ${SERIF}`;
    x.fillText('No staging or editing problems found.', width / 2, top + Math.round(64 * u));
  }
  const frame = createCanvas(W, H), fx = frame.getContext('2d');
  tiles.forEach((issue, i) => {
    const px = margin + (i % cols) * (tw + gap), py = top + Math.floor(i / cols) * (th + label + gap);
    drawTile(x, plan, issue, i + 1, { px, py, tw, th, k, u, frame, fx });
  });
  if (omitted) {
    x.textAlign = 'left'; x.fillStyle = MUTED; x.font = `italic ${Math.round(17 * u)}px ${SERIF}`;
    x.fillText(`+ ${omitted} more issue${omitted === 1 ? '' : 's'} in lint.json`, margin, height - margin - Math.round(6 * u));
  }
  return c;
}

function paper(x, w, h) {
  x.fillStyle = PAPER; x.fillRect(0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  let s = 0x2545f491;
  for (let p = 0; p < d.length; p += 4) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n = ((s >>> 0) / 4294967296 - 0.5) * 7; d[p] += n; d[p + 1] += n; d[p + 2] += n; }
  x.putImageData(img, 0, 0);
}

// Shots as alternating bands (scene changes get a darker rule), issue spans and numbered pins above.
function drawTimeline(x, plan, tiles, all, { x0, y0, w, h, u }) {
  const D = Math.max(1e-3, plan.duration), X = t => x0 + (t / D) * w, barY = y0 + Math.round(30 * u), barH = h - Math.round(30 * u);
  x.save();
  x.fillStyle = '#e6dac2'; x.fillRect(x0, barY, w, barH);
  for (const c of plan.cards || []) { x.fillStyle = '#d8c9ad'; x.fillRect(X(c.t0), barY, X(c.t1) - X(c.t0), barH); }
  (plan.shots || []).forEach((s, i) => {
    x.fillStyle = i % 2 ? '#efe4cf' : '#e3d5bb'; x.fillRect(X(s.t0), barY, Math.max(1, X(s.t1) - X(s.t0)), barH);
    const prev = plan.shots[i - 1], scene = !prev || prev.scene !== s.scene;
    x.fillStyle = INK; x.globalAlpha = scene ? 0.7 : 0.18; x.fillRect(X(s.t0) - (scene ? u : 0.5 * u), barY, scene ? 2 * u : u, barH); x.globalAlpha = 1;
    const lw = X(s.t1) - X(s.t0);
    x.font = `${Math.round(11 * u)}px ${MONO}`;
    if (x.measureText(s.id).width + 6 * u < lw) { x.fillStyle = MUTED; x.textAlign = 'left'; x.fillText(s.id, X(s.t0) + 3 * u, barY + barH - 5 * u); }
  });
  x.strokeStyle = INK; x.globalAlpha = 0.5; x.lineWidth = Math.max(1, u); x.strokeRect(x0 + 0.5, barY + 0.5, w - 1, barH - 1); x.globalAlpha = 1;
  // issue spans (all of them), then numbered pins (the ones with tiles)
  for (const i of all) { x.fillStyle = SEV[i.severity] || SEV.warning; x.globalAlpha = 0.55; x.fillRect(X(i.t0), barY + 3 * u, Math.max(2 * u, X(i.t1) - X(i.t0)), Math.round(8 * u)); x.globalAlpha = 1; }
  // pins in time order; crowded ones slide right and keep a leader line to their moment
  let last = -Infinity;
  tiles.map((i, n) => ({ i, n })).sort((p, q) => p.i.t - q.i.t || p.n - q.n).forEach(({ i, n }) => {
    const r = Math.round(10 * u), tx = X(i.t), px = Math.min(x0 + w - r, Math.max(tx, last + 2 * r + 2 * u)), py = barY - r - 6 * u;
    last = px;
    x.strokeStyle = SEV[i.severity]; x.lineWidth = Math.max(1, u); x.beginPath(); x.moveTo(px, py + r); x.lineTo(tx, barY + 3 * u); x.stroke();
    pin(x, px, py, r, n + 1, SEV[i.severity], u);
  });
  x.restore();
}
function pin(x, cx, cy, r, n, col, u) {
  x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,250,240,.9)'; x.lineWidth = Math.max(1, 1.5 * u); x.stroke();
  x.fillStyle = '#fffaf0'; x.font = `bold ${Math.round(r * (n > 9 ? 0.95 : 1.15))}px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(n), cx, cy + 0.5 * u); x.textBaseline = 'alphabetic';
}

// ───────────── one issue ─────────────
function still(plan, t, frame, fx) {
  try { drawFrame(fx, plan, t); }
  catch (e) { fx.setTransform(1, 0, 0, 1, 0, 0); fx.fillStyle = '#333'; fx.fillRect(0, 0, frame.width, frame.height); fx.fillStyle = '#fff'; fx.font = `${Math.round(frame.height / 20)}px ${SERIF}`; fx.fillText(`frame failed: ${e.message}`.slice(0, 80), 20, frame.height / 2); }
  return frame;
}
function drawTile(x, plan, issue, n, { px, py, tw, th, k, u, frame, fx }) {
  const col = SEV[issue.severity] || SEV.warning;
  x.save();
  x.shadowColor = 'rgba(42,33,48,0.3)'; x.shadowBlur = 12 * u; x.shadowOffsetY = 3 * u;
  x.fillStyle = INK; x.fillRect(px, py, tw, th);
  x.restore();
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  const cut = issue.frames?.length === 2, W = plan.W, H = plan.H;
  x.drawImage(still(plan, cut ? issue.frames[1] : issue.t, frame, fx), px, py, tw, th);
  overlay(x, issue, { ox: px, oy: py, s: k, w: tw, h: th, col, u });
  const U = marksBox(issue), iw = Math.round(tw * 0.4), ih = Math.round(iw * th / tw), m = Math.round(10 * u);
  // the inset goes in the corner farthest from what is marked (the number pin owns the top-left)
  const corner = () => {
    const C = [[px + tw - iw - m, py + m], [px + tw - iw - m, py + th - ih - m], [px + m, py + th - ih - m], [px + m, py + m]];
    const hit = ([cx, cy]) => !U ? 0 : Math.max(0, Math.min(cx + iw, px + U[2] * k) - Math.max(cx, px + U[0] * k)) * Math.max(0, Math.min(cy + ih, py + U[3] * k) - Math.max(cy, py + U[1] * k));
    return C.map((c, i) => ({ c, v: hit(c) + i * 1e-3 })).sort((p, q) => p.v - q.v)[0].c;
  };
  if (cut) {
    // picture in picture: the frame before the cut
    const [ix, iy] = corner();
    inset(x, () => x.drawImage(still(plan, issue.frames[0], frame, fx), ix, iy, iw, ih), ix, iy, iw, ih, u);
    chipText(x, `before the cut · ${clock(issue.frames[0])}`, ix + 6 * u, iy + ih - 26 * u, u, ix + iw - 4 * u);
    chipText(x, `after the cut · ${clock(issue.frames[1])}`, px + 10 * u, py + th - 30 * u, u, px + tw - 4 * u);
  } else if (U) {
    // a magnified detail when what is marked is small in the tile
    const bw = U[2] - U[0], bh = U[3] - U[1], aspect = tw / th;
    let cw = Math.max(bw * 1.35, (bh * 1.35) * aspect, W / 5), ch = cw / aspect;
    const mag = (iw / cw) / k;
    const inside = Math.max(0, Math.min(W, U[2]) - Math.max(0, U[0])) * Math.max(0, Math.min(H, U[3]) - Math.max(0, U[1])) / Math.max(1, bw * bh);
    if (mag >= 1.4 && Math.max(bw / W, bh / H) < 0.3 && inside > 0.5) {
      let cx0 = (U[0] + U[2]) / 2 - cw / 2, cy0 = (U[1] + U[3]) / 2 - ch / 2;
      cx0 = Math.max(0, Math.min(W - cw, cx0)); cy0 = Math.max(0, Math.min(H - ch, cy0));
      const [ix, iy] = corner(), si = iw / cw;
      inset(x, () => { x.drawImage(frame, cx0, cy0, cw, ch, ix, iy, iw, ih); overlay(x, issue, { ox: ix - cx0 * si, oy: iy - cy0 * si, s: si, w: iw, h: ih, col, u: u * 0.8, clip: [ix, iy, iw, ih], labels: false }); }, ix, iy, iw, ih, u);
      // where the detail comes from
      x.save(); x.strokeStyle = 'rgba(255,250,240,.85)'; x.setLineDash([4 * u, 3 * u]); x.lineWidth = Math.max(1, u);
      x.strokeRect(px + cx0 * k, py + cy0 * k, cw * k, ch * k); x.restore();
      chipText(x, `×${mag.toFixed(1)}`, ix + 6 * u, iy + ih - 26 * u, u);
    }
  }
  // severity frame and number
  x.strokeStyle = col; x.lineWidth = Math.round(4 * u); x.strokeRect(px + 2 * u, py + 2 * u, tw - 4 * u, th - 4 * u);
  pin(x, px + Math.round(22 * u), py + Math.round(22 * u), Math.round(14 * u), n, col, u);

  // label: severity · rule · shot · time, then the message
  let ly = py + th + Math.round(26 * u);
  x.textAlign = 'left';
  const sev = issue.severity === 'error' ? 'ERROR' : 'WARNING';
  x.font = `bold ${Math.round(12 * u)}px ${SERIF}`;
  const sw = x.measureText(sev).width + 12 * u;
  x.fillStyle = col; roundRect(x, px, ly - 15 * u, sw, 20 * u, 4 * u); x.fill();
  x.fillStyle = '#fffaf0'; x.fillText(sev, px + 6 * u, ly);
  x.fillStyle = INK; x.font = `bold ${Math.round(19 * u)}px ${SERIF}`;
  x.fillText(issue.rule, px + sw + 9 * u, ly + u);
  const used = sw + 9 * u + x.measureText(issue.rule).width + 12 * u;
  x.font = `${Math.round(15 * u)}px ${SERIF}`; x.fillStyle = MUTED;
  const meta = [issue.shot, range(issue)].filter(Boolean).join(' · ');
  let lines = 3;
  // shot and time on the first line when they fit, else on a line of their own
  if (used + x.measureText(meta).width <= tw) { x.textAlign = 'right'; x.fillText(meta, px + tw, ly); x.textAlign = 'left'; }
  else { ly += Math.round(21 * u); x.fillText(meta, px, ly); lines = 2; }
  ly += Math.round(24 * u);
  x.fillStyle = '#3d3340'; x.font = `${Math.round(15.5 * u)}px ${SERIF}`;
  const msg = String(issue.message).replace(/ \(\d+(\.\d+)?–\d+(\.\d+)? s\)$/, '');      // the span is in the meta line
  for (const line of wrap(x, msg, tw, lines)) { x.fillText(line, px, ly); ly += Math.round(20 * u); }
}

// Outlines in the issue's colour with a dark halo so they read on any background; labels on chips.
// ox, oy, s map plan pixels to the sheet; the visible window is [ox, oy, w, h] or `clip` ([x, y, w, h], for insets).
function overlay(x, issue, { ox, oy, s, w, h, col, u, clip = null, labels: withLabels = true }) {
  const marks = issue.marks?.length ? issue.marks : issue.box ? [{ kind: 'box', box: issue.box, label: issue.actor }] : [];
  const [vx, vy, vw, vh] = clip || [ox, oy, w, h];
  x.save();
  x.beginPath(); x.rect(vx, vy, vw, vh); x.clip();
  const T = ([a, b]) => [ox + a * s, oy + b * s];
  const halo = (draw, lw, color, dash = []) => {
    x.setLineDash(dash.map(d => d * u)); x.lineJoin = 'round';
    x.strokeStyle = 'rgba(20,14,24,.75)'; x.lineWidth = lw + 3 * u; draw(); x.stroke();
    x.strokeStyle = color; x.lineWidth = lw; draw(); x.stroke(); x.setLineDash([]);
  };
  const labels = [];
  for (const m of marks) {
    if (m.kind === 'box' || m.kind === 'caption') {
      const [a, b] = T([m.box[0], m.box[1]]), [c2, d] = T([m.box[2], m.box[3]]);
      if (!(c2 > vx && a < vx + vw && d > vy && b < vy + vh)) { if (withLabels) offArrow(x, (a + c2) / 2, (b + d) / 2, { ox: vx, oy: vy, w: vw, h: vh, col, u, label: m.label }); continue; }
      if (m.kind === 'caption') halo(() => { x.beginPath(); x.rect(a, b, c2 - a, d - b); }, 2 * u, '#fffaf0', [7, 5]);
      else halo(() => { x.beginPath(); roundRect(x, a, b, c2 - a, d - b, 6 * u); }, 3 * u, col);
      if (m.label) labels.push({ x: Math.max(vx + 4 * u, a), y: Math.max(vy + 4 * u, b - 24 * u), text: m.label });
    } else if (m.kind === 'ellipse') {
      const [ex, ey] = T([m.ellipse[0], m.ellipse[1]]), rx = m.ellipse[2] * s, ry = m.ellipse[3] * s;
      halo(() => { x.beginPath(); x.ellipse(ex, ey, Math.max(2, rx), Math.max(1.5, ry), 0, 0, Math.PI * 2); }, 2.5 * u, col, [8, 5]);
      if (m.label) labels.push({ x: ex + rx + 4 * u, y: ey - 10 * u, text: m.label });
    } else if (m.kind === 'point') {
      const [qx, qy] = T(m.point), r = 7 * u;
      halo(() => { x.beginPath(); x.arc(qx, qy, r, 0, Math.PI * 2); x.moveTo(qx - 2 * r, qy); x.lineTo(qx + 2 * r, qy); x.moveTo(qx, qy - 2 * r); x.lineTo(qx, qy + 2 * r); }, 2 * u, '#fff3a0');
      if (m.label && m.label !== 'ground') labels.push({ x: qx + 2 * r + 3 * u, y: qy - 8 * u, text: m.label });
    }
  }
  if (withLabels) {
    x.font = `bold ${Math.round(13 * u)}px ${SERIF}`; x.textAlign = 'left';
    for (const L of labels) {
      const tw = x.measureText(L.text).width + 10 * u, lx = Math.min(L.x, vx + vw - tw - 4 * u);
      x.fillStyle = 'rgba(20,14,24,.78)'; roundRect(x, lx, L.y, tw, 20 * u, 4 * u); x.fill();
      x.fillStyle = '#fffaf0'; x.fillText(L.text, lx + 5 * u, L.y + 14.5 * u);
    }
  }
  x.restore();
}
// Union of what an issue marks (plan pixels), for insets.
function marksBox(issue) {
  let B = null;
  const add = b => { B = B ? [Math.min(B[0], b[0]), Math.min(B[1], b[1]), Math.max(B[2], b[2]), Math.max(B[3], b[3])] : b.slice(); };
  for (const m of issue.marks || []) {
    if (m.kind === 'box' || m.kind === 'caption') add(m.box);
    else if (m.kind === 'ellipse') add([m.ellipse[0] - m.ellipse[2], m.ellipse[1] - m.ellipse[3], m.ellipse[0] + m.ellipse[2], m.ellipse[1] + m.ellipse[3]]);
    else if (m.kind === 'point') add([m.point[0] - 4, m.point[1] - 4, m.point[0] + 4, m.point[1] + 4]);
  }
  if (!B && issue.box) add(issue.box);
  return B;
}
// A framed inset with a soft shadow.
function inset(x, draw, ix, iy, iw, ih, u) {
  x.save(); x.shadowColor = 'rgba(20,14,24,.55)'; x.shadowBlur = 10 * u; x.shadowOffsetY = 2 * u; x.fillStyle = INK; x.fillRect(ix, iy, iw, ih); x.restore();
  x.save(); x.beginPath(); x.rect(ix, iy, iw, ih); x.clip(); draw(); x.restore();
  x.strokeStyle = '#fffaf0'; x.lineWidth = Math.max(1, 2 * u); x.strokeRect(ix, iy, iw, ih);
}
function chipText(x, text, lx, ly, u, right = Infinity) {
  x.font = `bold ${Math.round(12.5 * u)}px ${SERIF}`; x.textAlign = 'left';
  if (lx + x.measureText(text).width + 10 * u > right) text = text.replace(' the cut', '');   // narrow insets
  const tw = x.measureText(text).width + 10 * u;
  x.fillStyle = 'rgba(20,14,24,.78)'; roundRect(x, lx, ly, tw, 20 * u, 4 * u); x.fill();
  x.fillStyle = '#fffaf0'; x.fillText(text, lx + 5 * u, ly + 14.5 * u);
}
// An arrow on the frame edge pointing at something outside it.
function offArrow(x, tx, ty, { ox, oy, w, h, col, u, label }) {
  const cx = ox + w / 2, cy = oy + h / 2, dx = tx - cx, dy = ty - cy, m = 22 * u;
  const f = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(dx)), (h / 2 - m) / Math.max(1e-6, Math.abs(dy)));
  const ax = cx + dx * f, ay = cy + dy * f, ang = Math.atan2(dy, dx), L = 16 * u;
  x.save(); x.translate(ax, ay); x.rotate(ang);
  x.beginPath(); x.moveTo(L * 0.7, 0); x.lineTo(-L * 0.6, -L * 0.55); x.lineTo(-L * 0.6, L * 0.55); x.closePath();
  x.fillStyle = col; x.strokeStyle = 'rgba(20,14,24,.8)'; x.lineWidth = 2 * u; x.fill(); x.stroke();
  x.restore();
  if (label) {
    x.font = `bold ${Math.round(13 * u)}px ${SERIF}`;
    const tw = x.measureText(`${label} (off frame)`).width + 10 * u, th = 20 * u;
    // the chip sits on the inner side of the arrow
    const side = Math.abs(dx) * (h / 2 - m) > Math.abs(dy) * (w / 2 - m);
    let lx = ax - tw / 2, ly = ay - th / 2;
    if (side) lx = dx > 0 ? ax - L - 6 * u - tw : ax + L + 6 * u; else ly = dy > 0 ? ay - L - 6 * u - th : ay + L + 6 * u;
    lx = Math.max(ox + 4 * u, Math.min(lx, ox + w - tw - 4 * u)); ly = Math.max(oy + 4 * u, Math.min(ly, oy + h - th - 4 * u));
    x.fillStyle = 'rgba(20,14,24,.78)'; roundRect(x, lx, ly, tw, 20 * u, 4 * u); x.fill();
    x.fillStyle = '#fffaf0'; x.textAlign = 'left'; x.fillText(`${label} (off frame)`, lx + 5 * u, ly + 14.5 * u);
  }
}
function roundRect(x, a, b, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
function wrap(x, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean), out = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (x.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length <= maxLines) return out;
  const keep = out.slice(0, maxLines);
  let last = keep[maxLines - 1];
  while (last && x.measureText(`${last}…`).width > maxW) last = last.slice(0, -1).trimEnd();
  keep[maxLines - 1] = `${last}…`;
  return keep;
}
