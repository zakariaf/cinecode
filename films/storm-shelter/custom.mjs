// custom.mjs for Storm Shelter: the thunderstorm the engine doesn't have.
//  - storm-sky (overlay, sky layer): a dark rolling cloud deck over the painted sky, and forked bolts at `bolt*` marks
//  - storm-light (overlay, grade layer): a cold, desaturated storm grade and the lightning flash at `bolt*` marks
//  - shake (custom beat, world layer): spray flung off an actor (the badger rig has no shake gesture)
//  - thunder, rain-bed (sounds)
// Deterministic and stateless: everything is drawn from api.t, api.marks, api.params and seeded generators.
import { rng, noise1, clamp } from '../../engine/core/lib.mjs';

// lightning brightness at `dt` seconds after a strike: a bright first stroke, a dip, a re-strike, a fading tail
function flashEnv(dt) {
  if (dt < 0 || dt > 0.75) return 0;
  const p1 = Math.exp(-(((dt - 0.03) / 0.035) ** 2));
  const p2 = 0.8 * Math.exp(-(((dt - 0.19) / 0.05) ** 2));
  const tail = 0.25 * Math.exp(-dt / 0.18) * (dt > 0.05 ? 1 : 0);
  return clamp(p1 + p2 + tail);
}

// a jagged bolt from (x0, y0) down to y1, with a couple of side forks; returns polylines
function boltPaths(x0, y0, y1, seed) {
  const r = rng(seed), main = [[x0, y0]], forks = [];
  let x = x0, y = y0;
  const step = (y1 - y0) / 14;
  for (let i = 1; i <= 14; i++) {
    x += (r() - 0.5) * step * 1.4; y = y0 + step * i;
    main.push([x, y]);
    if ((i === 4 || i === 8) && r() < 0.9) {
      const f = [[x, y]]; let fx = x, fy = y; const dir = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < 5; j++) { fx += dir * step * (0.4 + r() * 0.5); fy += step * (0.5 + r() * 0.4); f.push([fx, fy]); }
      forks.push(f);
    }
  }
  return [main, ...forks];
}

function strokePaths(ctx, paths, w) {
  for (const P of paths) {
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
    ctx.lineWidth = w; ctx.stroke();
  }
}

export const overlays = {
  // A heavy slate cloud deck painted over the set's sky (land is drawn over it), drifting left, lit from below
  // by the flashes. params.bolts: { markName: strength } draws a forked bolt behind the land at that mark.
  'storm-sky': {
    layer: 'sky',
    draw(ctx, api) {
      const { W, H, t, cam, marks, params } = api;
      const flashes = params.bolts || {};
      let fl = 0;
      for (const [m, k] of Object.entries(flashes)) if (marks[m] != null) fl = Math.max(fl, k * flashEnv(t - marks[m]));
      // base: dark cloud ceiling to a paler band at the horizon
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#262a35'); g.addColorStop(0.45, '#3b414f'); g.addColorStop(0.8, '#5f6676'); g.addColorStop(1, '#717888');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // cloud masses: rows of soft dabs, parallax 0.12 of the camera, drifting left
      const zk = Math.sqrt(cam.zoom / 0.6);
      for (let row = 0; row < 4; row++) {
        const r = rng(9100 + row * 31), n = 9, y = H * (0.06 + row * 0.13), span = W * 1.9;
        for (let i = 0; i < n; i++) {
          const bx = r() * span, rx = (160 + r() * 220) * zk, ry = (55 + r() * 60) * zk, shade = r(), rot = (r() - 0.5) * 0.2;
          let x = bx - cam.cx * 0.12 * cam.zoom - t * (6 + row * 3);
          x = ((x % span) + span) % span - (span - W) / 2;
          const dark = 30 + row * 9 + shade * 14;
          ctx.fillStyle = `rgba(${dark},${dark + 4},${dark + 14},0.55)`;
          ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
          // pale lower edge, as if lit faintly from the horizon
          ctx.fillStyle = `rgba(150,160,180,${0.07 + 0.25 * fl})`;
          ctx.beginPath(); ctx.ellipse(x, y + ry * 0.55, rx * 0.8, ry * 0.25, rot, 0, Math.PI * 2); ctx.fill();
        }
      }
      // bolts: drawn at a world x (fixed in the set), from above the frame down to the horizon
      const X = { bolt1: 2560, bolt3: 960 };
      for (const [m, k] of Object.entries(flashes)) {
        if (marks[m] == null) continue;
        const dt = t - marks[m], e = flashEnv(dt);
        if (e < 0.05 || dt > 0.4) continue;
        const [sx] = api.toScreen([X[m] ?? 1500, 600]), [, hy] = api.toScreen([X[m] ?? 1500, 720]);
        const paths = boltPaths(sx, -20, Math.max(H * 0.2, hy), (m.length * 7919) | 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(150,180,255,${0.3 * e * k})`; strokePaths(ctx, paths, 34 * zk);
        ctx.strokeStyle = `rgba(210,225,255,${0.75 * e * k})`; strokePaths(ctx, paths, 11 * zk);
        ctx.strokeStyle = `rgba(255,255,255,${e * k})`; strokePaths(ctx, paths, 4.5 * zk);
        ctx.globalCompositeOperation = 'source-over';
      }
      // the whole cloud deck lights up in a flash
      if (fl > 0) { ctx.fillStyle = `rgba(190,205,240,${0.22 * fl})`; ctx.fillRect(0, 0, W, H); }
    },
  },

  // Storm light: the afternoon pushed cold, grey and dim (multiply + desaturate), and the lightning flash
  // (a cold screen wash). params.flashes: { markName: strength }; params.dim (default 1).
  'storm-light': {
    layer: 'grade',
    draw(ctx, api) {
      const { W, H, t, marks, params } = api, dim = params.dim ?? 1;
      let fl = 0;
      for (const [m, k] of Object.entries(params.flashes || {})) if (marks[m] != null) fl = Math.max(fl, k * flashEnv(t - marks[m]));
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${0.45 * dim})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply';
      const m = Math.round(255 - (255 - 178) * dim * (1 - 0.7 * fl));
      ctx.fillStyle = `rgb(${m - 8},${m},${Math.min(255, m + 14)})`; ctx.fillRect(0, 0, W, H);
      // a darker top, as under a low cloud deck
      const v = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      v.addColorStop(0, `rgba(70,76,92,${0.55 * dim})`); v.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      if (fl > 0) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(200,215,255,${0.55 * fl})`; ctx.fillRect(0, 0, W, H);
      }
    },
  },
};

export const custom = {
  // Spray flung off a wet animal shaking itself: drops thrown up and out from the back, falling under gravity.
  shake: {
    layer: 'world',
    sfx: [{ at: 0.05, name: 'drip', gain: 0.8, params: { count: 10 } }],
    draw(ctx, u, api) {
      const a = api.actor(api.params.who);
      if (!a) return;
      const [x0, y0, x1, y1] = a.box, cx = (x0 + x1) / 2, top = y0 + (y1 - y0) * 0.35, half = (x1 - x0) / 2;
      const r = rng(api.seed), dur = api.dur || 1, T = u * dur;
      ctx.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const t0 = r() * 0.55 * dur, side = r() < 0.5 ? -1 : 1, vx = side * (60 + r() * 160), vy = -(90 + r() * 170);
        const ox = (r() - 0.5) * half * 1.4, sz = 1.4 + r() * 2.2, life = 0.45 + r() * 0.3;
        const k = T - t0;
        if (k <= 0 || k > life) continue;
        const s = a.s, px = cx + ox + vx * k * s, py = top + (vy * k + 0.5 * 900 * k * k) * s;
        const al = Math.sin(Math.PI * clamp(k / life)) * 0.9;
        ctx.strokeStyle = `rgba(225,235,255,${al})`; ctx.lineWidth = sz * s;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - vx * 0.012 * s, py - (vy + 900 * k) * 0.012 * s); ctx.stroke();
      }
    },
  },
};

const SR = 48000;
export const sounds = {
  // Thunder: params.near 0..1 (1 = a crack right overhead, 0 = a far soft roll). About 4.5 s.
  thunder: ({ seed = 1, dur, params = {} } = {}) => {
    const near = clamp(params.near ?? 0.5), len = dur || (3.6 + 1.6 * near), n = Math.round(SR * len), out = new Float32Array(n);
    const r = rng((seed | 0) + 77), roll = noise1(((seed | 0) % 997) + 5);
    let lp1 = 0, lp2 = 0, hp = 0, prev = 0;
    const atk = 0.02 + 0.35 * (1 - near), a1 = 0.035 + 0.02 * near, a2 = 0.02;
    for (let i = 0; i < n; i++) {
      const t = i / SR, w = r() * 2 - 1;
      lp1 += a1 * (w - lp1); lp2 += a2 * (lp1 - lp2);            // rumble: twice low-passed noise
      hp = 0.97 * (hp + w - prev); prev = w;                       // crack: high-passed noise
      const env = clamp(t / atk) * Math.exp(-t / (0.9 + 0.8 * near)) * (0.55 + 0.9 * roll(t * 3.2));
      const crack = near * Math.exp(-t / 0.09) * (t < 0.4 ? 1 : 0);
      out[i] = (0.9 + 0.6 * near) * env * lp2 * 9 + 0.22 * crack * hp;
      if (i > n - 2400) out[i] *= (n - i) / 2400;
    }
    return out;
  },

  // Steady rain with a patter of near drops and slow gusts of wind. Use with a long `dur`.
  'rain-bed': ({ seed = 1, dur = 30, params = {} } = {}) => {
    const n = Math.round(SR * dur), out = new Float32Array(n), r = rng((seed | 0) + 4242), gust = noise1(31 + ((seed | 0) % 101));
    const level = params.level ?? 1;
    let lp = 0, hpPrev = 0, hp = 0, wl1 = 0, wl2 = 0, drop = 0, dropF = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, w = r() * 2 - 1;
      lp += 0.45 * (w - lp);                                       // hiss: noise low-passed ~5 kHz
      hp = 0.985 * (hp + lp - hpPrev); hpPrev = lp;                // …and high-passed ~120 Hz
      wl1 += 0.004 * (w - wl1); wl2 += 0.004 * (wl1 - wl2);        // wind: very low noise
      if (r() < 0.0009) { drop = 0.5 + r() * 0.5; dropF = 0.2 + r() * 0.5; }   // a near drop: a short tick
      drop *= 0.9965;
      const g = 0.6 + 0.5 * gust(t * 0.35);
      out[i] = level * (0.075 * hp * (0.85 + 0.25 * g) + 0.9 * wl2 * g * 6 + 0.05 * drop * (r() * 2 - 1) * dropF);
      if (t < 0.5) out[i] *= t / 0.5;
      if (i > n - SR) out[i] *= (n - i) / SR;
    }
    return out;
  },
};
