// Contact sheet: one still per shot (its middle frame) or at given times, laid out as a labelled grid on paper.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { frameGrabber } from './encode.mjs';
import { clock } from './progress.mjs';

const PAPER = '#f1e8d6', INK = '#2a2130', MUTED = '#7a6c74', SERIF = 'Georgia, "Times New Roman", serif';

const shotAt = (plan, t) => plan.shots?.find(s => t >= s.t0 && t < s.t1) ?? plan.shots?.[plan.shots.length - 1] ?? null;
const textAt = (list, t) => (list || []).find(c => t >= c.t0 && t < c.t1)?.text ?? '';

/** The stills to draw: the middle frame of every shot, or the given times. → [{ t, shot, caption }] */
export function sheetItems(plan, times = null) {
  const snap = t => Math.min(Math.max(0, Math.floor(t * plan.fps) / plan.fps), Math.max(0, plan.duration - 1 / plan.fps));
  const ts = times?.length ? times.map(snap) : (plan.shots || []).map(s => snap((s.t0 + s.t1) / 2));
  return ts.map(t => ({ t, shot: shotAt(plan, t), caption: textAt(plan.captions, t) || textAt(plan.lines, t) }));
}

/** Grid geometry. Everything scales with the tile width (480 px = 1×). */
export function sheetLayout({ n, cols = 4, tileW = 480, W = 1920, H = 1080 }) {
  cols = Math.max(1, Math.min(cols, n || 1));
  const u = tileW / 480, tileH = Math.round((tileW * H) / W), rows = Math.max(1, Math.ceil(n / cols));
  const margin = Math.round(32 * u), gap = Math.round(24 * u), header = Math.round(70 * u), label = Math.round(82 * u);
  const width = 2 * margin + cols * tileW + (cols - 1) * gap;
  const height = margin + header + rows * (tileH + label) + (rows - 1) * gap + margin;
  return { u, cols, rows, tileW, tileH, margin, gap, header, label, width, height,
    cell: i => ({ x: margin + (i % cols) * (tileW + gap), y: margin + header + Math.floor(i / cols) * (tileH + label + gap) }) };
}

function fitLines(ctx, text, maxW, maxLines) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), lines = [], w = s => ctx.measureText(s).width;
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || w(next) <= maxW) cur = next; else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines && lines.every(l => w(l) <= maxW)) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[out.length - 1];
  while (last && w(`${last}…`) > maxW) last = last.slice(0, -1).trimEnd();
  out[out.length - 1] = `${last}…`;
  return out;
}

/**
 * Draw a contact sheet JPEG.
 *   plan, drawFrame, outPath, times (seconds; default: middle of each shot), cols = 4, tileW = 480, quality = 88, title, onProgress(i, n)
 * → { path, width, height, items }
 */
export async function contactSheet({ plan, drawFrame, outPath, times = null, cols = 4, tileW = 480, quality = 88, title = plan.title, onProgress }) {
  const items = sheetItems(plan, times);
  if (!items.length) throw new Error('contact sheet: nothing to draw (no shots and no times)');
  const L = sheetLayout({ n: items.length, cols, tileW, W: plan.W, H: plan.H }), u = L.u;
  const sheet = createCanvas(L.width, L.height), x = sheet.getContext('2d');
  x.fillStyle = PAPER; x.fillRect(0, 0, L.width, L.height);
  // a whisper of paper grain
  const grain = x.getImageData(0, 0, L.width, L.height), d = grain.data;
  let s = 0x9e3779b9;
  for (let p = 0; p < d.length; p += 4) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const n = ((s >>> 0) / 4294967296 - 0.5) * 7;
    d[p] += n; d[p + 1] += n; d[p + 2] += n;
  }
  x.putImageData(grain, 0, 0);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';

  // header
  x.textBaseline = 'alphabetic'; x.fillStyle = INK; x.textAlign = 'left';
  x.font = `bold ${Math.round(30 * u)}px ${SERIF}`;
  x.fillText(title || 'Untitled', L.margin, L.margin + Math.round(34 * u));
  x.font = `${Math.round(16 * u)}px ${SERIF}`; x.fillStyle = MUTED; x.textAlign = 'right';
  const shots = plan.shots?.length ?? 0;
  const count = times?.length ? `${items.length} stills · ${shots} shots` : `${shots} shots`;
  x.fillText(`${count} · ${clock(plan.duration)} · ${plan.W}×${plan.H} @ ${plan.fps} fps`, L.width - L.margin, L.margin + Math.round(34 * u));
  x.strokeStyle = INK; x.globalAlpha = 0.35; x.lineWidth = Math.max(1, u);
  x.beginPath(); x.moveTo(L.margin, L.margin + Math.round(50 * u)); x.lineTo(L.width - L.margin, L.margin + Math.round(50 * u)); x.stroke();
  x.globalAlpha = 1;

  const grab = frameGrabber(plan, drawFrame);
  for (const [i, it] of items.entries()) {
    const { x: cx, y: cy } = L.cell(i);
    const frame = grab.draw(it.t);
    // soft shadow, the still, a thin ink frame
    x.save(); x.shadowColor = 'rgba(42,33,48,0.28)'; x.shadowBlur = 10 * u; x.shadowOffsetY = 3 * u;
    x.fillStyle = INK; x.fillRect(cx, cy, L.tileW, L.tileH); x.restore();
    x.drawImage(frame, cx, cy, L.tileW, L.tileH);
    x.strokeStyle = INK; x.lineWidth = Math.max(1, 1.2 * u); x.strokeRect(cx + 0.5, cy + 0.5, L.tileW - 1, L.tileH - 1);

    // label: shot id · size · time, then the caption
    const ly = cy + L.tileH + Math.round(22 * u);
    x.textAlign = 'left'; x.fillStyle = INK; x.font = `bold ${Math.round(17 * u)}px ${SERIF}`;
    const id = it.shot?.id ?? '—';
    x.fillText(id, cx, ly);
    const idW = x.measureText(id).width;
    const meta = [it.shot?.size, it.shot ? `${(it.shot.t1 - it.shot.t0).toFixed(1)} s` : ''].filter(Boolean).join(' · ');
    if (meta) { x.font = `${Math.round(14 * u)}px ${SERIF}`; x.fillStyle = MUTED; x.fillText(`  ${meta}`, cx + idW, ly); }
    x.textAlign = 'right'; x.font = `${Math.round(15 * u)}px ${SERIF}`; x.fillStyle = MUTED;
    x.fillText(clock(it.t), cx + L.tileW, ly);
    if (it.caption) {
      x.textAlign = 'left'; x.fillStyle = '#3d3340'; x.font = `italic ${Math.round(15 * u)}px ${SERIF}`;
      fitLines(x, `“${it.caption}”`, L.tileW, 2).forEach((line, k) => x.fillText(line, cx, ly + Math.round((22 + 19 * k) * u)));
    }
    onProgress?.(i + 1, items.length);
  }


  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, await sheet.encode('jpeg', quality));
  return { path: outPath, width: L.width, height: L.height, items };
}
