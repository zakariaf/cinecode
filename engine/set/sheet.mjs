// Set sheets: every kit at a wide view, optionally with a debug overlay showing what the staging code
// sees — walk region, water, stepping stones, solid footprints, paths, anchors and a sample route.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canvas } from '../core/lib.mjs';
import { clampCamera, MIN_ZOOM } from './set.mjs';
import { getKit } from './kits/index.mjs';
import { grade as filmGrade, mixGrade } from '../film/grade.mjs';

// A small preview grade so night sheets read as night (the film module applies its own grade). A time a kit declares
// (makeSet times) is previewed under its own light, as the film grades it; a name with no light is an error.
const GRADE = {
  dawn: { sl: [255, 196, 160, 0.3], mul: [248, 238, 242], vig: 0.3 },
  morning: { sl: [255, 232, 190, 0.18], mul: [255, 255, 255], vig: 0.26 },
  noon: { sl: [255, 246, 220, 0.1], mul: [255, 255, 252], vig: 0.24 },
  afternoon: { sl: [255, 214, 150, 0.26], mul: [255, 248, 236], vig: 0.28 },
  golden: { sl: [255, 168, 90, 0.4], mul: [255, 232, 204], vig: 0.32 },
  sunset: { sl: [255, 128, 80, 0.42], mul: [246, 204, 192], vig: 0.38 },
  twilight: { sl: [150, 120, 210, 0.36], mul: [184, 174, 216], vig: 0.44 },
  night: { sl: [90, 110, 210, 0.4], mul: [104, 114, 168], vig: 0.5 },
};
export function previewGrade(ctx, time) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!Object.hasOwn(GRADE, time)) return filmGrade(ctx, mixGrade([[time, 1]]), 0, W, H);
  const g = GRADE[time];
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(${g.sl.slice(0, 3).join(',')},${g.sl[3]})`; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${g.mul.join(',')})`; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.2); v.addColorStop(0, 'rgba(30,25,45,0)'); v.addColorStop(1, `rgba(30,25,45,${g.vig})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

const TYPE_COL = { ground: '#ffd23f', surface: '#ff8c42', perch: '#7ae7ff', hollow: '#d98cff' };

function overlay(ctx, S, cam, W, H) {
  const z = cam.zoom, lw = 1 / z;
  const line = (P, col, w = 2, close = true, dash = null) => { ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.strokeStyle = col; ctx.lineWidth = w * lw; ctx.setLineDash(dash ? dash.map(d => d * lw) : []); ctx.stroke(); ctx.setLineDash([]); };
  if (S.region) { ctx.fillStyle = 'rgba(120,255,140,.10)'; ctx.beginPath(); S.region.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.fill(); line(S.region, 'rgba(90,240,120,.95)', 2.5, true, [10, 6]); }
  if (S.ridge) { const P = []; for (let x = S.area.x0; x <= S.area.x1; x += 10) P.push([x, S.groundAt(x)]); line(P, 'rgba(255,255,255,.9)', 2, false); }
  for (const P of S.walk.water) { ctx.fillStyle = 'rgba(60,140,255,.18)'; ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.fill(); line(P, '#3b8cff', 2.5); }
  for (const p of S.walk.paths) line(p.poly, 'rgba(255,230,160,.8)', 1.5, true, [4, 5]);
  for (const c of S.colliders()) { ctx.fillStyle = 'rgba(255,60,60,.28)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = 2 * lw; ctx.stroke(); }
  for (const s of S.stones) { ctx.strokeStyle = '#2ff0d0'; ctx.lineWidth = 2 * lw; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, 7); ctx.stroke(); }
  // sample route
  const R = S.def.sampleRoute;
  if (R) {
    const r = S.route(R[0], R[1]);
    line(r, 'rgba(20,20,20,.7)', 7, false); line(r, '#ffe14d', 3.5, false);
    r.forEach(([x, y], i) => { ctx.fillStyle = r.stones.includes(i) ? '#2ff0d0' : '#ffe14d'; ctx.beginPath(); ctx.arc(x, y, 6 * lw, 0, 7); ctx.fill(); });
  }
  // anchors
  ctx.font = `${Math.round(15 * lw)}px sans-serif`; ctx.textBaseline = 'middle';
  for (const a of S.anchors()) {
    const col = TYPE_COL[a.type] || '#fff';
    if (a.clip) line(a.clip, col, 2);
    if (a.branch) { const P = []; for (let x = a.range[0]; x <= a.range[1]; x += 6) { const y = a.topAt(x); if (y != null) P.push([x, y]); } line(P, col, 2.5, false); }
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(a.x, a.y, 8 * lw, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a.x, a.y, 5.5 * lw, 0, 7); ctx.fill();
    // a tick showing the actor height at that scale (118 units = a standing hare)
    ctx.strokeStyle = col; ctx.lineWidth = 2 * lw; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, a.y - 118 * a.s); ctx.stroke();
    const label = `${a.name} ${a.type[0]} s${a.s.toFixed(2)}`, tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10,10,20,.72)'; ctx.fillRect(a.x + 9 * lw, a.y - 10 * lw, tw + 8 * lw, 20 * lw);
    ctx.fillStyle = col; ctx.fillText(label, a.x + 13 * lw, a.y);
  }
}

// Render one set to a W×H canvas. cam defaults to the widest allowed view centred in the set's view; sky to morning, or
// for a kit with times of its own (makeSet times) its default, which it also shows for a time it doesn't have (its sky,
// haze and grade). → { canvas, cam, sky: the time shown }
export function renderSet(S, { W = 1920, H = 1080, cam = null, sky = null, t = 0, debug = false, grade = true, dof = 0, haze = true } = {}) {
  S.build();
  const has = n => (!S.def.times || S.skyNames.includes(n) ? n : S.defaultSky);
  sky = sky == null ? (S.def.times ? S.defaultSky : 'morning') : typeof sky === 'string' ? has(sky) : sky.map(([n, a]) => [has(n), a]);
  const v = S.view, c0 = cam || { cx: (v.x0 + v.x1) / 2, cy: (v.y0 + v.y1) / 2, zoom: MIN_ZOOM * (W / 1920) };
  const k = clampCamera(S, c0, W, H);
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  S.drawSky(ctx, k, sky, t);
  ctx.setTransform(k.zoom, 0, 0, k.zoom, W / 2 - k.cx * k.zoom, H / 2 - k.cy * k.zoom);
  const opts = { t, dof, haze: haze ? sky : null };
  S.drawBack(ctx, k, opts);
  for (const p of S.propsSorted()) p.draw(ctx);
  S.drawFront(ctx, k, opts);
  if (grade) previewGrade(ctx, typeof sky === 'string' ? sky : sky[0][0]);
  if (debug) overlay(ctx, S, k, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas: c, cam: k, sky };
}

// A labelled grid of kits, each under `sky` (default: morning, or a kit's own default time: renderSet). Returns the
// output path.
export function setSheet(kitNames, outPath, { debug = true, sky = null, cols = 2, cellW = 960, params = {} } = {}) {
  const names = kitNames && kitNames.length ? kitNames : [];
  const cellH = Math.round((cellW * 9) / 16), rows = Math.ceil(names.length / cols);
  const [c, ctx] = canvas(cellW * Math.min(cols, names.length), cellH * rows);
  ctx.fillStyle = '#16141c'; ctx.fillRect(0, 0, c.width, c.height);
  names.forEach((name, i) => {
    const S = getKit(name)(params[name] || {});
    const { canvas: img, cam, sky: shown } = renderSet(S, { sky, debug });
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    ctx.drawImage(img, x, y, cellW, cellH);
    ctx.fillStyle = 'rgba(10,10,20,.7)'; ctx.fillRect(x, y, cellW, 30);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(`${name} · ${shown} · zoom ${cam.zoom.toFixed(2)} · ${S.anchorNames.length} anchors · ambience ${S.ambience.day} / ${S.ambience.night}`, x + 10, y + 15);
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, c.toBuffer(outPath.endsWith('.png') ? 'image/png' : 'image/jpeg', 88));
  return outPath;
}
