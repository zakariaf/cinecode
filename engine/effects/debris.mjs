// Chunks of ice and rock drifting past the camera at many depths: ring particles, or an asteroid belt with more rock.
// Most are small and far, a few big and near; each is a lumpy inked shape, shaded away from the upper-left light, the
// icy ones frosted. It builds up over the first 12% of the beat and thins out over the last 10%. A custom beat.
//
// Beat params: n (chunks, default 70), ice (0..1, the share of icy chunks, default 0.85; an asteroid belt: 0.2),
// dir (-1: they drift right to left, default; 1: left to right), speed (default 1).
// Layer `depth`: every chunk is a piece at its own depth, from just in front of the lens's near fade (the big ones) to
// beyond the stage (the small ones), spread over what the shot's camera sees at that depth from its first frame to its
// last; so a planet hides the chunks behind it, a pan shows them in parallax and a dolly (`zTo`) flies through them.
import { rng, smooth, lerp, ink } from '../core/lib.mjs';
import { NEAR } from '../set/set.mjs';

const TAU = Math.PI * 2;
const rot = (x, y, r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
const Z_NEAR = -0.72, Z_FAR = 0.35;   // the nearest and farthest chunks' depths, × the lens (the near fade starts at −0.75)

export const custom = {
  debris: {
    layer: 'depth',
    draw(ctx, u, api) {
      const p = api.params || {}, W = api.W, H = api.H, k = H / 1080, n = p.n ?? 70, iceShare = p.ice ?? 0.85, dir = p.dir ?? -1, sp = p.speed ?? 1;
      const env = smooth(0, 0.12, u) * (1 - smooth(0.9, 1, u)), bt = api.bt ?? u * (api.dur || 1), r = rng(api.seed || 21);
      if (env <= 0.001) return;
      // the shot's camera at its first and last frame: a chunk's field covers both views at its depth
      const D = api.cam.lens ?? api.set.lens, views = [api.shot.cameraAt(api.shot.t0), api.shot.cameraAt(api.shot.t1 - 1e-3)];
      const scaleAt = (c, z) => c.zoom * ((D - (c.z || 0)) / (D + z - (c.z || 0)));
      for (let i = 0; i < n; i++) {
        // every random number first, so each chunk is the same on every frame
        const depth = Math.pow(r(), 2.6), px = (2.5 + 130 * depth) * k * (0.6 + 0.8 * r()), x0 = r(), y0 = r(), spin = (r() - 0.5) * 0.8, rot0 = r() * TAU;
        const ice = r() < iceShare, seed = Math.floor(r() * 1e6), sides = 11 + Math.floor(r() * 6), lum = r();
        // its depth, and its size and drift in world px there (as many screen px as the first view in front of it shows)
        const a = env * (0.35 + 0.65 * Math.min(1, depth * 3)), z = lerp(Z_FAR, Z_NEAR, depth) * D, seen = views.filter(c => D + z - (c.z || 0) > NEAR * D);
        if (a <= 0.01 || !seen.length) continue;
        const s0 = scaleAt(seen[0], z), size = px / s0, v = ((0.02 + 0.16 * depth) * sp * W) / s0;
        const xs = seen.flatMap(c => { const h = W / 2 / scaleAt(c, z); return [c.cx - h, c.cx + h]; }), ys = seen.flatMap(c => { const h = H / 2 / scaleAt(c, z); return [c.cy - h, c.cy + h]; });
        const left = Math.min(...xs) - size - 20 / s0, span = Math.max(...xs) - Math.min(...xs) + 2 * size + 40 / s0;
        const x = left + ((((x0 * span + dir * v * bt) % span) + span) % span), y = Math.min(...ys) - size / 2 + y0 * (Math.max(...ys) - Math.min(...ys) + size);
        api.item([x, y, z], (c, P) => {
          const rr = rng(seed), pts = [], ang = rot0 + spin * bt;
          // a lumpy outline: two slow bumps and a little jitter, squashed a little (no two alike)
          const b1 = rr() * TAU, b2 = rr() * TAU, sq = 0.62 + 0.3 * rr();
          for (let j = 0; j < sides; j++) { const t = (j / sides) * TAU, rad = size * 0.5 * (0.8 + 0.14 * Math.sin(2 * t + b1) + 0.1 * Math.sin(3 * t + b2) + 0.06 * rr()); pts.push([Math.cos(t) * rad, Math.sin(t) * rad * sq]); }
          const base = ice ? ['#e6eaf0', '#d9d4c9', '#cbc3b4', '#eef0f3'][Math.floor(lum * 4)] : (lum < 0.5 ? '#8f877b' : '#a39684');
          const shade = ice ? '#9c9ac0' : '#5a5060', onScreen = size * P.s;
          c.globalAlpha *= a; c.translate(x, y); c.rotate(ang);
          c.fillStyle = base; c.beginPath(); pts.forEach(([qx, qy], j) => (j ? c.lineTo(qx, qy) : c.moveTo(qx, qy))); c.closePath(); c.fill();
          // shade away from the upper-left light (the shading turns with the chunk: undo its rotation for the offset)
          c.save(); c.clip(); c.globalCompositeOperation = 'multiply'; c.fillStyle = shade;
          const [lx, ly] = rot(-0.6, -0.75, -ang), o = size * 0.16;
          c.beginPath(); c.rect(-size, -size, size * 2, size * 2); pts.forEach(([qx, qy], j) => (j ? c.lineTo(qx + lx * o, qy + ly * o) : c.moveTo(qx + lx * o, qy + ly * o))); c.closePath(); c.fill('evenodd');
          c.restore();
          // frost: a soft highlight toward the light on the icy ones
          if (ice && onScreen > 6 * k) { c.save(); c.clip(); c.globalCompositeOperation = 'screen'; const hx = -size * 0.15, hy = -size * 0.12, hg = c.createRadialGradient(hx, hy, 0, hx, hy, size * 0.45); hg.addColorStop(0, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hg; c.fillRect(-size, -size, size * 2, size * 2); c.restore(); }
          if (onScreen > 10 * k) ink(c, pts, Math.max(1, onScreen * 0.03) / P.s, { seed: seed % 97, color: 'rgba(42,33,48,0.75)' });
        });
      }
    },
  },
};
