// The frame source of a 3D film for engine/render: { plan, pixels(t), canvas(t, debug), close() }, beside a 2D film's
// { plan, drawFrame(ctx, plan, t) }. pixels(t) resolves to the finished frame at film time t: the 3D picture with the
// cards, titles, captions and fades of overlay.mjs laid over it, as width × height raw bytes in the canvas's byte
// order (engine/render/encode.mjs pixelOrder), which is what the encoder's pipe is told to expect.
// The first frame that shows the picture starts the GPU; a frame that is all card does not draw it. canvas(t, true)
// also draws what the overlay and lint go by (`cinecode sheet --debug`): the faces and hands, the words' boxes, the
// shot and its camera.
import v8 from 'node:v8';
import vm from 'node:vm';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { openScene } from './index.mjs';
import { compileScene } from './compile.mjs';
import { pictureTime, createOverlay, marksAt } from './overlay.mjs';
import { pixelOrder } from '../render/encode.mjs';

/** plan: a compiled 3D film (engine/film/compile.mjs). width, height: the frame's size (default: the plan's). */
export async function createSource(plan, { width = plan.W, height = plan.H } = {}) {
  const scene = await openScene(compileScene(plan), { width, height });
  const W = plan.W, H = plan.H, out = createCanvas(width, height), ox = out.getContext('2d'), over = createOverlay(plan, scene.built);
  // (at another size than the plan's, the overlay is drawn at the plan's size on a sheet of its own and laid on scaled)
  const sheet = width === W && height === H ? null : createCanvas(W, H), sx = sheet?.getContext('2d');
  let warm = false;
  const debug = (ctx, t) => {
    if (pictureTime(plan, t) !== t) return;
    const u = Math.min(W, H) / 1080, shot = plan.shotAt(t), sc = scene.built.scenes.find(s => t < s.t1) ?? scene.built.scenes.at(-1), cam = sc.camera(t - sc.t0);
    const rect = b => ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 2 * u;
    for (const m of marksAt(plan, scene.built, t)) { ctx.strokeStyle = m.kind === 'head' ? 'rgba(255,0,200,.9)' : 'rgba(255,220,0,.9)'; rect(m.box); }
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.setLineDash([8 * u, 6 * u]); for (const w of over.words(t)) rect(w.box); ctx.setLineDash([]);
    const d = Math.hypot(...cam.pos.map((v, i) => v - cam.target[i]));
    const tag = `${shot?.id ?? ''} ${shot?.size} ${shot?.move}${shot?.angle && shot.angle !== 'eye' ? ' ' + shot.angle : ''} t=${t.toFixed(2)} fov ${cam.fov} d ${d.toFixed(2)} m`;
    ctx.font = `${Math.round(18 * u)}px Menlo, monospace`; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(10 * u, 10 * u, ctx.measureText(tag).width + 16 * u, 28 * u);
    ctx.fillStyle = '#fff'; ctx.fillText(tag, 18 * u, 14 * u);
    ctx.restore();
  };
  // The 3D picture at film time `at`, read back into `img` (one buffer for every frame: a render allocates no 8 MB a frame).
  const img = new ImageData(width, height), raw = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  async function picture(at) {
    // (the first picture is drawn once with the whole cast in it and nothing left out for being outside the camera's or
    // the sun's view, plainly and with the motion blur, so the GPU builds every pipeline the film needs now and not
    // at the frame where something first comes into view: that cost 0.1 to 1 s mid-film)
    if (!warm) {
      warm = true;
      const S = scene.stage, culled = [];
      scene.built.update(at);
      for (const C of Object.values(scene.built.cast)) C.group.visible = true;
      for (const root of [S.scene, S.air]) root.traverse(o => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
      await S.render(0); await S.render(0, { blur: 'vector', pose: () => {} });
      for (const o of culled) o.frustumCulled = true;
    }
    await scene.pixels(at, img.data);
  }
  const clampT = t => Math.min(Math.max(t, 0), Math.max(0, plan.duration - 1e-6));
  // the finished frame at t as a canvas (the same one every time: copy it to keep it)
  async function canvas(t, withDebug = false) {
    const tt = clampT(t), at = pictureTime(plan, tt);
    if (at === null) { ox.fillStyle = '#000'; ox.fillRect(0, 0, width, height); }
    else { await picture(at); ox.putImageData(img, 0, 0); }
    const lay = x => { over.draw(x, tt); if (withDebug) debug(x, tt); };
    if (!sheet) lay(ox);
    else { sx.clearRect(0, 0, W, H); lay(sx); ox.drawImage(sheet, 0, 0, width, height); }
    return out;
  }
  // The finished frame's bytes. Where nothing lies over the picture they are the picture's own, with no canvas between
  // (the same bytes: the picture is opaque and the canvas holds RGBA where encode.mjs pixelOrder() is 'rgba'). Valid
  // until the next call: the encoder writes them out before it asks for the next frame.
  const direct = !sheet && pixelOrder() === 'rgba';
  // A full garbage collection after every second of frames: three.js and the GPU's wrappers (about 40 command encoders
  // and passes a frame) leave about 1.4 MB a frame in the old heap, which V8 otherwise sweeps in one stop of 50 to
  // 120 ms every 5 or 6 s (frames of 120 to 210 ms); taken as it comes, each costs about 11 ms.
  v8.setFlagsFromString('--expose-gc');
  const collect = vm.runInNewContext('gc');
  let drawn = 0;
  async function pixels(t) {
    if (++drawn % plan.fps === 0) collect();
    const tt = clampT(t);
    if (direct && over.bare(tt)) { await picture(tt); return raw; }
    return (await canvas(t)).data();
  }
  return { plan, scene, overlay: over, canvas, pixels, close: () => scene.close() };
}
