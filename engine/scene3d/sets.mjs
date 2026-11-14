// Surfaces for places: paint for floors and walls, by formula or drawn once on a canvas (no image files).
import * as THREE from 'three/webgpu';
import { paint } from './materials.mjs';
import { float, vec2, vec3, mix, texture, mx_noise_float, mx_fractal_noise_float, positionWorld } from 'three/tsl';
import { canvas, rng } from '../core/lib.mjs';
import { paper } from '../paint/atmos.mjs';

// A picture painted with ordinary 2D canvas calls, as a texture a surface can wear: draw(ctx, w, h) paints it once.
// cinecode's own 2D paint code (engine/paint, engine/core) works on ctx as it does in a 2D film.
// The picture repeats in both directions, so paint it to tile if the surface is larger than it.
function canvasTexture(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  draw(ctx, w, h);
  const t = new THREE.DataTexture(new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer), w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Wooden boards running along x, painted once on a canvas that repeats: 16 boards deep, two plank lengths wide.
export function woodFloor({ color = 0xb5844f, board = 0.16 } = {}) {
  const ROWS = 16, LEN = 1.4, N = 1024, r = rng(11), base = new THREE.Color(color).convertLinearToSRGB();
  const tone = (k, warm = 0) => `rgb(${[base.r * (1 + warm), base.g, base.b * (1 - warm)].map((v) => Math.round(Math.min(1, v * k) * 255)).join(',')})`;
  const tex = canvasTexture(N, N, (x) => {
    const bh = N / ROWS, pw = N / 2;
    for (let j = 0; j < ROWS; j++) {
      const off = r() * pw, y = j * bh;
      for (let i = -1; i < 2; i++) {
        const x0 = off + i * pw, k = 0.9 + 0.2 * r(), warm = (r() - 0.5) * 0.1;
        x.fillStyle = tone(k, warm); x.fillRect(x0, y, pw, bh);
        // the grain: long thin strokes along the board, a little lighter or darker than it
        for (let g = 0; g < 26; g++) {
          const gy = y + r() * bh, len = pw * (0.3 + 0.7 * r()), gx = x0 + r() * (pw - len), bend = (r() - 0.5) * 5;
          x.strokeStyle = tone(k * (r() < 0.5 ? 0.9 : 1.07), warm); x.globalAlpha = 0.35 + 0.3 * r(); x.lineWidth = 1 + 2.5 * r();
          x.beginPath(); x.moveTo(gx, gy); x.quadraticCurveTo(gx + len / 2, gy + bend, gx + len, gy); x.stroke();
        }
        x.globalAlpha = 1;
        x.fillStyle = tone(0.74); x.fillRect(x0 - 1.5, y, 3, bh);                // where two planks meet end to end
      }
      x.fillStyle = tone(0.7); x.fillRect(0, y - 1.5, N, 3); if (!j) x.fillRect(0, N - 1.5, N, 3);   // the gap between boards
    }
    paper(x, 0.1);      // gouache blotches and fibres from the 2D engine's paper
  });
  return paint({
    mottle: 0, scatter: 0, rim: 0.3,
    pattern: () => {
      const p = positionWorld;
      // large soft clouds of tone over the whole floor, so the repeat does not show
      const cloud = mx_fractal_noise_float(vec3(p.x.mul(0.9), p.z.mul(0.9), 3.0), 3, 2.0, 0.5).mul(0.5).add(0.5);
      return texture(tex, vec2(p.x.div(2 * LEN), p.z.div(ROWS * board))).rgb.mul(mix(float(0.92), float(1.07), cloud));
    },
  });
}

export function plaster({ color = 0xdccbb4 } = {}) {
  return paint({
    color, mottle: 0, scatter: 0, rim: 0,
    pattern: (_p, base) => {
      const p = positionWorld;
      const n = mx_fractal_noise_float(p.mul(0.9), 4, 2.0, 0.55).mul(0.5).add(0.5);
      const strokes = mx_noise_float(p.mul(vec3(13, 1.6, 13))).mul(0.5).add(0.5);   // long vertical brush marks
      const fine = mx_noise_float(p.mul(vec3(30, 30, 30))).mul(0.5).add(0.5);
      const c = base.mul(mix(float(0.88), float(1.07), n)).mul(mix(float(0.97), float(1.025), strokes)).mul(mix(float(0.98), float(1.02), fine));
      // cooler where darker, warmer where lighter
      return c.mul(vec3(mix(float(0.97), float(1.03), n), 1.0, mix(float(1.05), float(0.96), n)));
    },
  });
}

export function slab(w, h, d, material, pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(...pos); m.castShadow = m.receiveShadow = true;
  return m;
}
