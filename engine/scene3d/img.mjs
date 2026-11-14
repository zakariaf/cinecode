// Pictures out: raw RGBA pixels -> jpg/png through ffmpeg (no image library needed).
import { execFileSync, spawn } from 'node:child_process';

export function saveImage(file, px, w, h, { scaleTo } = {}) {
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-'];
  if (scaleTo && scaleTo < w) args.push('-vf', `scale=${scaleTo}:-2:flags=lanczos`);
  args.push('-frames:v', '1', '-q:v', '2', file);
  execFileSync('ffmpeg', args, { input: px, maxBuffer: 1 << 30 });
}

// Tile equal-size pictures into one (cols across), optionally cropping each first.
export function tile(cells, w, h, cols, crop) {
  const cw = crop ? crop.w : w, ch = crop ? crop.h : h, cx = crop ? crop.x : 0, cy = crop ? crop.y : 0;
  const rows = Math.ceil(cells.length / cols);
  const W = cw * cols, H = ch * rows;
  const out = Buffer.alloc(W * H * 4, 255);
  cells.forEach((px, i) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    for (let y = 0; y < ch; y++) px.copy(out, ((oy + y) * W + ox) * 4, ((cy + y) * w + cx) * 4, ((cy + y) * w + cx + cw) * 4);
  });
  return { px: out, w: W, h: H };
}

// A video encoder fed raw frames in order.
export function encoder(file, w, h, fps = 24) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  return {
    write: (px) => new Promise((res) => ff.stdin.write(px, res)),
    end: () => new Promise((res) => { ff.on('close', res); ff.stdin.end(); }),
  };
}
