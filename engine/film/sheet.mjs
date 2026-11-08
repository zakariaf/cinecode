// Debug stills and contact sheets for a film, with an optional geometry overlay (actor boxes, head boxes,
// contact points, colliders, caption box) from frameInfo().
//   node engine/film/sheet.mjs films/<slug> [out.jpg] [--t=1.5,4,9] [--debug] [--cols=4] [--tile=480] [--frame]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm } from './load.mjs';
import { compile } from './compile.mjs';
import { drawFrame, frameInfo } from './frame.mjs';

// Draw frameInfo geometry over a frame (screen space).
export function drawOverlay(ctx, info, W, H) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const u = Math.min(W, H) / 1080;
  ctx.lineWidth = 2 * u; ctx.font = `${Math.round(18 * u)}px Menlo, monospace`; ctx.textBaseline = 'top';
  const cam = info.camera;
  if (cam) for (const c of info.colliders) {
    const x = (c.x - cam.cx) * cam.zoom + W / 2, y = (c.y - cam.cy) * cam.zoom + H / 2;
    ctx.strokeStyle = 'rgba(255,60,60,.8)'; ctx.beginPath(); ctx.ellipse(x, y, c.rx * cam.zoom, c.ry * cam.zoom, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const a of info.actors) {
    const b = a.screenBox, h = a.headBox;
    ctx.strokeStyle = a.speaking ? 'rgba(255,220,0,.95)' : 'rgba(0,220,255,.9)'; ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.strokeStyle = 'rgba(255,0,200,.9)'; ctx.strokeRect(h[0], h[1], h[2] - h[0], h[3] - h[1]);
    const [cx, cy] = a.contact.screen;
    ctx.fillStyle = a.contact.kind === 'ground' ? '#00ff66' : a.contact.kind === 'air' ? '#ff9900' : '#ffee00';
    ctx.beginPath(); ctx.arc(cx, cy, 6 * u, 0, Math.PI * 2); ctx.fill();
    const label = `${a.id} ${a.contact.kind}${a.airborne ? ' air' : ''} s${a.s.toFixed(2)} ${a.action}`;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(b[0], b[3] + 4 * u, ctx.measureText(label).width + 8 * u, 24 * u);
    ctx.fillStyle = '#fff'; ctx.fillText(label, b[0] + 4 * u, b[3] + 7 * u);
  }
  if (info.captionBox) { const b = info.captionBox; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([8 * u, 6 * u]); ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.setLineDash([]); }
  const tag = `${info.shot ?? info.card ?? ''} ${info.size ?? ''} t=${info.t.toFixed(2)}${cam ? ` z=${cam.zoom.toFixed(2)} (${Math.round(cam.cx)},${Math.round(cam.cy)})` : ''}`;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(10 * u, 10 * u, ctx.measureText(tag).width + 16 * u, 28 * u);
  ctx.fillStyle = '#fff'; ctx.fillText(tag, 18 * u, 14 * u);
  ctx.restore();
}

/** One frame (optionally with the overlay) → JPEG/PNG file. */
export async function renderStill(plan, t, outPath, { debug = false, scale = 1 } = {}) {
  const c = createCanvas(plan.W, plan.H), x = c.getContext('2d');
  drawFrame(x, plan, t);
  if (debug) drawOverlay(x, frameInfo(plan, t), plan.W, plan.H);
  let out = c;
  if (scale !== 1) { out = createCanvas(Math.round(plan.W * scale), Math.round(plan.H * scale)); const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'; o.drawImage(c, 0, 0, out.width, out.height); }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, await out.encode(outPath.endsWith('.png') ? 'png' : 'jpeg', 90));
  return outPath;
}

/** Contact sheet of a film (middle of each shot, or the given times), optionally with the overlay. */
export async function filmSheet(plan, outPath, { times = null, debug = false, cols = 4, tileW = 480, title } = {}) {
  const { contactSheet } = await import('../render/sheet.mjs');
  const draw = (ctx, p, t) => { drawFrame(ctx, p, t); if (debug) drawOverlay(ctx, frameInfo(p, t), p.W, p.H); };
  return contactSheet({ plan, drawFrame: draw, outPath, times, cols, tileW, title: title ?? `${plan.title}${debug ? ' (debug)' : ''}` });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
  const pos = args.filter(a => !a.startsWith('--'));
  const film = await loadFilm(pos[0] || 'films/_test'), plan = compile(film);
  const times = opt.t ? String(opt.t).split(',').map(Number) : null;
  const out = pos[1] || join(film.dir, 'out', opt.frame ? 'frame.jpg' : 'sheet.jpg');
  const t0 = performance.now();
  if (opt.frame) for (const [i, t] of (times || [plan.duration / 2]).entries()) console.log(await renderStill(plan, t, times?.length > 1 ? out.replace(/(\.\w+)$/, `-${i}$1`) : out, { debug: !!opt.debug, scale: opt.scale ? +opt.scale : 1 }));
  else console.log((await filmSheet(plan, out, { times, debug: !!opt.debug, cols: +(opt.cols || 4), tileW: +(opt.tile || 480) })).path);
  console.log(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
