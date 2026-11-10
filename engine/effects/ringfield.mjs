// Saturn's rings up close, as what they are made of: countless pieces of ice and rock lying IN the rings (not
// scattered over empty space like debris), from a haze of glinting dust to pebbles, a few boulders, and some chunks
// near the camera that rush past as the camera flies in (a dolly, `zTo`). Ring pieces keep to the ring material: inside
// a ring's edges (a piece is laid at least its own size in from them), never in the Cassini Division or the Encke Gap;
// they keep to the rings' ellipse (the planet's tilt and roll), go round slowly (the inner ones faster), sit in front of
// the planet on the near half and behind the globe on the far half, and are dark in the globe's shadow on the rings
// (ringShade in engine/paint/planets.mjs). The near chunks are pieces at their own depth (the depth sort), set at the
// start of the shot over the near half of the rings, so they open out past the lens during a dolly.
// A custom beat; give it the shot's length and "scope": "shot".
//
// Beat params: who (the ringed planet, required), n (ring pieces, default 420), dust (specks and glints of dust,
// default 1400), near (chunks near the camera, default 16), motes (grains of dust near the lens that stream past, soft
// and out of focus, default 200), ice (share of icy pieces, default 0.8), orbit (how fast they go round, rad/s at the B
// ring, default 0.035), dir (1 or -1).
// Layer `depth`.
import { rng, smooth, lerp, ink } from '../core/lib.mjs';
import { globeOf, lightIn, sunDir, ringShade } from '../paint/planets.mjs';

const TAU = Math.PI * 2;
const rot = (x, y, r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
const ICE = ['#f2f4f7', '#e6eaf0', '#efe7d6', '#ddd3bf', '#f6f0e2'], ROCK = ['#b3a487', '#978a76', '#80786f', '#a89a82'];
const NEARICE = ['#e3ddd0', '#d6cfc0', '#cdc6b8', '#e8e4dc'];
const RING = ['#efe3c4', '#e2d4b2', '#d6c6a2', '#f6eed8', '#c9b894'];

// a lumpy outline with a seeded character: round pebbles, flat slabs, angular shards
function lump(r, size, sides) {
  const b1 = r() * TAU, b2 = r() * TAU, sq = 0.5 + 0.45 * r(), a2 = 0.08 + 0.16 * r(), a3 = 0.04 + 0.12 * r(), pts = [];
  for (let j = 0; j < sides; j++) {
    const t = (j / sides) * TAU, rad = size * 0.5 * (0.82 + a2 * Math.sin(2 * t + b1) + a3 * Math.sin(3 * t + b2) + 0.1 * (r() - 0.5));
    pts.push([Math.cos(t) * rad, Math.sin(t) * rad * sq]);
  }
  return pts;
}

export const custom = {
  ringfield: {
    layer: 'depth',
    draw(ctx, u, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g || !g.B.rings?.length) return;
      const W = api.W, H = api.H, k = H / 1080, D = api.cam.lens ?? api.set.lens, bt = api.bt ?? u * (api.dur || 1);
      const env = smooth(0, 0.06, u) * (1 - smooth(0.96, 1, u));
      if (env <= 0.001) return;
      const st = Math.abs(Math.sin(g.tilt)), ct = Math.cos(g.tilt), R = g.R, Rp = R * g.ob, dir = p.dir ?? 1, om = p.orbit ?? 0.035;
      const iceShare = p.ice ?? 0.8, r = rng(api.seed || 37);
      // the shot's first camera: the near chunks are laid out as it sees them
      const c0 = api.shot.cameraAt(api.shot.t0), s0 = z => c0.zoom * ((D - (c0.z || 0)) / (D + z - (c0.z || 0)));
      const sPlanet0 = s0(g.z), px0 = k / sPlanet0;    // one screen pixel at the planet's depth, at the shot's start
      // a point of the ring plane (radius in globe radii, angle) → world, at the planet's depth
      const ringPt = (rr, th) => { const [x, y] = rot(Math.cos(th) * rr * R, Math.sin(th) * rr * R * st, g.roll); return [g.c[0] + x, g.c[1] + y]; };
      const behindGlobe = (rr, th) => { if (Math.sin(th) >= 0) return false; const x = Math.cos(th) * rr, y = Math.sin(th) * rr * st; return (x * x) + (y * y) / (g.ob * g.ob) < 1.02; };
      // a radius in the ring material (the rings that are not a division, by width × opacity), `half` (world px: half a
      // piece) in from its edges, measured where the ellipse is most foreshortened, and clear of a gap in it
      const mat = g.B.rings.filter(q => q.a >= 0.3), wsum = mat.reduce((s, q) => s + (q.r1 - q.r0) * q.a, 0);
      const pickR = (half = 0) => {
        const m = half / (R * Math.max(0.2, Math.abs(st))), v = r(), w = r();
        let x = v * wsum, q = mat[mat.length - 1];
        for (const b of mat) { x -= (b.r1 - b.r0) * b.a; if (x <= 0) { q = b; break; } }
        let rr = q.r1 - q.r0 > 2 * m ? lerp(q.r0 + m, q.r1 - m, w) : (q.r0 + q.r1) / 2;
        if (q.gap && rr > q.gap[0] - m && rr < q.gap[1] + m) rr = rr < (q.gap[0] + q.gap[1]) / 2 ? q.gap[0] - m : q.gap[1] + m;
        return rr;
      };
      const omega = rr => dir * om * Math.pow(1.75 / rr, 1.5);

      // where a point at depth z is on screen at the shot's start; pieces are laid only where the shot can see them
      const onScreen0 = (X, Y, z, m = 0.06) => { const s = s0(z), sx = W / 2 + (X - c0.cx) * s, sy = H / 2 + (Y - c0.cy) * s; return sx > -m * W && sx < (1 + m) * W && sy > -m * H && sy < (1 + m) * H; };
      const seen = (front, half) => { for (let tries = 0; tries < 60; tries++) { const rr = pickR(half), th = front ? (r() * 1.15 - 0.075) * Math.PI : r() * TAU; if (behindGlobe(rr, th)) continue; const [X, Y] = ringPt(rr, th); if (onScreen0(X, Y, g.z)) return [rr, th]; } return [pickR(half), Math.PI * 0.5]; };

      // 1. the ring itself, locked to it (drawn at the planet's scale, in front of it): a grain of dark and light specks,
      // glints of icy dust that twinkle, and pieces from pebbles to boulders
      const pieces = [];
      const nDust = p.dust ?? 1400, nRing = p.n ?? 420;
      for (let i = 0; i < nDust; i++) {
        const sz = (0.7 + 1.6 * r() * r()) * px0, [rr, th0] = seen(false, sz), dark = r() < 0.45, a = dark ? 0.18 + 0.25 * r() : 0.35 + 0.6 * r(), tw = !dark && r() < 0.45 ? 1.2 + 3.5 * r() : 0, ph = r() * TAU;
        pieces.push({ kind: 0, rr, th0, sz, a, tw, ph, col: dark ? '#6d604c' : '#fffaf0' });
      }
      for (let i = 0; i < nRing; i++) {
        const big = r(), sz = (3 + 9 * big * big + (big > 0.95 ? 16 * r() : 0)) * px0, [rr, th0] = seen(false, 0.65 * sz), ice = r() < iceShare, cr = r(), seed = Math.floor(r() * 1e6), sides = 7 + Math.floor(r() * 8);
        const spin = (r() - 0.5) * 0.6, rot0 = r() * TAU;
        pieces.push({ kind: 1, rr, th0, sz, ice, col: ice ? ICE[Math.floor(cr * ICE.length)] : ROCK[Math.floor(cr * ROCK.length)], seed, sides, spin, rot0 });
      }
      api.item([g.c[0], g.a.key, g.z - 1e-3], c => {
        // the Sun as the planet's painter has it (the light in the planet's rolled frame), for the globe's shadow
        const Lw = lightIn(c), cr0 = Math.cos(-g.roll), sr0 = Math.sin(-g.roll), S = sunDir([Lw[0] * cr0 - Lw[1] * sr0, Lw[0] * sr0 + Lw[1] * cr0], g.tilt);
        c.save();
        for (const q of pieces) {
          const th = q.th0 + omega(q.rr) * bt;
          if (behindGlobe(q.rr, th)) continue;
          const [X, Y] = ringPt(q.rr, th), dark = ringShade(S, g.ob, Math.cos(th) * q.rr, Math.sin(th) * q.rr);
          if (q.kind === 0) {
            const a = q.a * (q.tw ? 0.3 + 0.7 * Math.max(0, Math.sin(api.t * q.tw + q.ph)) : 1) * (1 - 0.85 * dark);
            c.globalAlpha = env * a; c.fillStyle = q.col; c.beginPath(); c.arc(X, Y, q.sz, 0, TAU); c.fill();
          } else {
            const pts = lump(rng(q.seed), q.sz, q.sides), ang = q.rot0 + q.spin * bt;
            c.save(); c.globalAlpha = env; c.translate(X, Y);
            // its shadow on the ring below it (light from the upper left; none where the globe's shadow already lies)
            c.fillStyle = `rgba(70,58,44,${(0.35 * (1 - dark)).toFixed(3)})`; c.beginPath(); c.ellipse(q.sz * 0.22, q.sz * 0.2, q.sz * 0.5, q.sz * 0.32, 0, 0, TAU); c.fill();
            c.rotate(ang); c.fillStyle = q.col; c.beginPath(); pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
            c.save(); c.clip(); c.globalCompositeOperation = 'multiply'; c.fillStyle = q.ice ? '#a7a4c4' : '#6a5e66';
            const [lx, ly] = rot(0.6, 0.75, -ang); c.beginPath(); c.arc(lx * q.sz * 0.32, ly * q.sz * 0.32, q.sz * 0.52, 0, TAU); c.fill();
            if (dark > 0) { c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgba(28,24,48,${(0.8 * dark).toFixed(3)})`; c.fillRect(-q.sz, -q.sz, 2 * q.sz, 2 * q.sz); }
            c.restore();
            if (q.sz / px0 > 6) ink(c, pts, Math.max(0.8 * px0, q.sz * 0.05), { seed: q.seed % 97, color: 'rgba(42,33,48,0.6)' });
            c.restore();
          }
        }
        c.restore();
      });

      // 2. chunks near the camera, at their own depths, over the near half of the rings as the shot starts
      const nNear = p.near ?? 16, nMotes = p.motes ?? 200;
      const place = (zf, rr, th) => {
        const z = zf * D, [X, Y] = ringPt(rr, th), q = s0(g.z) / s0(z);   // seen where that ring point is, at the start
        return [c0.cx + (X - c0.cx) * q, c0.cy + (Y - c0.cy) * q, z];
      };
      // a near piece that the dolly brings into the lens's near fade must have left the frame by then (else it turns
      // into a see-through ghost): start it far enough from the frame's centre
      const c1 = api.shot.cameraAt(api.shot.t1 - 1e-3), FADE = 0.25 * D;
      const clears = (zf, rr, th) => {
        const z = zf * D, dEnd = D + z - (c1.z || 0);
        if (dEnd > FADE * 1.05) return true;
        const [X, Y] = ringPt(rr, th), ox = Math.abs((X - c0.cx) * s0(g.z)) / (W / 2), oy = Math.abs((Y - c0.cy) * s0(g.z)) / (H / 2);
        return Math.max(ox, oy) * (D + z - (c0.z || 0)) / FADE > 1.15;
      };
      const nearSpot = zf => { let best = null; for (let tries = 0; tries < 40; tries++) { const [rr, th] = seen(true); best = [rr, th]; if (clears(zf, rr, th)) return best; } return null; };
      for (let i = 0; i < nMotes; i++) {
        const zf = lerp(-0.05, -0.6, r()), spot = nearSpot(zf), sz = (1.2 + 2.4 * r()) * k, a = 0.3 + 0.4 * r(), col = RING[Math.floor(r() * RING.length)];
        if (!spot) continue;
        // out of focus, as dust that near the lens is: a soft disc three times the grain, faint (a hard speck reads as a
        // piece lying in a gap of the rings or in the sky beyond them)
        const [X, Y, z] = place(zf, ...spot), w = (3 * sz) / s0(z), drift = dir * (8 + 30 * r()) * k / s0(z);
        api.item([X, Y, z], c => {
          const x = X + drift * bt, g = c.createRadialGradient(x, Y, 0, x, Y, w);
          g.addColorStop(0, col); g.addColorStop(0.4, col); g.addColorStop(1, `${col}00`);
          c.globalAlpha *= env * a * 0.4; c.fillStyle = g; c.beginPath(); c.arc(x, Y, w, 0, TAU); c.fill();
        });
      }
      for (let i = 0; i < nNear; i++) {
        const near = Math.pow(r(), 1.4), zf = lerp(-0.06, -0.55, near), spot = nearSpot(zf);
        const pxs = (10 + 55 * Math.pow(near, 1.5)) * (0.6 + 0.8 * r()) * k, ice = r() < iceShare, cr = r(), seed = Math.floor(r() * 1e6), sides = 8 + Math.floor(r() * 8);
        const spin = (r() - 0.5) * 0.5, rot0 = r() * TAU, facet = r(), driftV = dir * (10 + 40 * r()) * k;
        if (!spot) continue;
        const [X, Y, z] = place(zf, ...spot), size = pxs / s0(z), drift = driftV / s0(z);
        const col = ice ? NEARICE[Math.floor(cr * NEARICE.length)] : ROCK[Math.floor(cr * ROCK.length)];
        api.item([X, Y, z], (c, P) => {
          const rr2 = rng(seed), pts = lump(rr2, size, sides), ang = rot0 + spin * bt, onScreen = size * P.s;
          c.globalAlpha *= env; c.translate(X + drift * bt, Y); c.rotate(ang);
          c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
          c.save(); c.clip();
          // shade away from the upper-left light, and a lighter facet toward it
          c.globalCompositeOperation = 'multiply'; c.fillStyle = ice ? '#9c9ac0' : '#5a5060';
          const [lx, ly] = rot(-0.6, -0.75, -ang), o = size * 0.18;
          c.beginPath(); c.rect(-size, -size, size * 2, size * 2); pts.forEach(([x, y], j) => (j ? c.lineTo(x + lx * o, y + ly * o) : c.moveTo(x + lx * o, y + ly * o))); c.closePath(); c.fill('evenodd');
          if (onScreen > 14 * k) {
            c.globalCompositeOperation = 'screen'; const hx = lx * size * 0.2, hy = ly * size * 0.2, hg = c.createRadialGradient(hx, hy, 0, hx, hy, size * (0.3 + 0.2 * facet));
            hg.addColorStop(0, `rgba(255,255,255,${ice ? 0.55 : 0.25})`); hg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hg; c.fillRect(-size, -size, size * 2, size * 2);
          }
          c.restore();
          if (onScreen > 10 * k) ink(c, pts, Math.max(1, onScreen * 0.025) / P.s, { seed: seed % 97, color: 'rgba(42,33,48,0.7)' });
        });
      }
    },
  },
};
