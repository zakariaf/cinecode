// The Node host: WebGPU inside plain Node (Dawn, through the "webgpu" npm package).
// No browser, no window. This is the only file that starts a GPU device; everything
// else in scene3d imports three.js's classes and never touches one, so posing, planning
// and the motion checks run on a machine with no GPU.
//
// three.js's WebGPURenderer wants a <canvas> with a "webgpu" context. We hand it a
// plain object whose context returns a texture we own; after a frame is drawn we copy
// that texture into a buffer and read the bytes back.
import { create, globals } from 'webgpu';

Object.assign(globalThis, globals);
globalThis.self ??= globalThis;
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

let _gpu = null;
function gpu() {
  if (!_gpu) {
    _gpu = create([]);
    _gpu.getPreferredCanvasFormat = () => 'rgba8unorm';     // so three.js draws the last pass in the byte order we hand out
    Object.defineProperty(globalThis, 'navigator', { value: { gpu: _gpu, userAgent: 'node' }, configurable: true });
  }
  return _gpu;
}

// Can this machine draw at all?
export async function hasAdapter() {
  return !!(await gpu().requestAdapter());
}

// A drawing surface of width x height pixels: the device and canvas to give to
// three.js's renderer, read(into): the last frame drawn as tightly packed RGBA bytes (top
// row first), in a new Buffer or written into `into` (width * height * 4 bytes, reused by a
// render loop so that no frame allocates 8 MB), and close().
export async function createSurface(width, height) {
  const adapter = await gpu().requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  let tex = null, cfg = null;
  const ctx = {
    configure(c) { cfg = c; },
    unconfigure() {},
    getCurrentTexture() {
      if (cfg.format !== 'rgba8unorm') throw new Error(`the canvas was configured as ${cfg.format}, not rgba8unorm`);
      if (!tex) tex = device.createTexture({ size: [width, height], format: cfg.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      return tex;
    },
  };
  const canvas = { width, height, style: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {}, setAttribute() {} };
  ctx.canvas = canvas;

  const bpr = Math.ceil(width * 4 / 256) * 256;
  const buf = device.createBuffer({ size: bpr * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  async function read(into) {
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [width, height]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), out = into ?? Buffer.allocUnsafe(width * height * 4);
    for (let y = 0; y < height; y++) out.set(src.subarray(y * bpr, y * bpr + width * 4), y * width * 4);
    buf.unmap();
    return out;
  }
  function close() { buf.destroy(); tex?.destroy(); device.destroy(); }
  return { device, canvas, width, height, read, close };
}
