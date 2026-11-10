// The view through a telescope's eyepiece: everything outside a round field is black, with a soft inner edge and a
// faint cool rim; or the field widening until it fills the frame: the round view opens into the scene.
//
// A custom beat: pin it `"at": 0` with a `dur` at least the shot's and `"scope": "shot"` (it ends at the cut), so the
// whole shot is seen through the eyepiece; a later beat with `"open": true` widens the field over its `dur` until it
// fills the frame. (An overlay would cover the whole scene.)
// Beat params: r (the field's radius, a fraction of the frame height, default 0.36), open (true: widen it), dx, dy
// (the field's centre offset, fractions of the frame).
// Layer `screen`: over the picture (and the grade), under the captions, so a caption reads on the black.
import { easeInOut, lerp } from '../core/lib.mjs';

const TAU = Math.PI * 2;

function field(ctx, api, r) {
  const p = api.params || {}, W = api.W, H = api.H, cx = W / 2 + (p.dx || 0) * W, cy = H / 2 + (p.dy || 0) * H, k = H / 1080;
  ctx.fillStyle = '#04040b';
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, r, 0, TAU); ctx.fill('evenodd');
  const g = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r);
  g.addColorStop(0, 'rgba(4,4,11,0)'); g.addColorStop(0.75, 'rgba(4,4,11,0.35)'); g.addColorStop(1, 'rgba(4,4,11,0.96)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(150,170,230,0.22)'; ctx.lineWidth = 2.2 * k;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.986, 0, TAU); ctx.stroke();
}

export const custom = {
  eyepiece: {
    layer: 'screen',
    draw(ctx, u, api) {
      const p = api.params || {}, R0 = (p.r ?? 0.36) * api.H;
      if (!p.open) return field(ctx, api, R0);
      if (u >= 1) return;
      field(ctx, api, lerp(R0, Math.hypot(api.W, api.H) * 0.62, easeInOut(u)));
    },
  },
};
