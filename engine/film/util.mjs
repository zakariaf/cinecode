// Small shared helpers for the film module: hashing, easing, target parsing, rig lookups and probes.
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { clamp, lerp } from '../core/lib.mjs';
import { mixPose as mixPoseGeneric } from '../cast/index.mjs';

// FNV-1a 32-bit hash of a string (seeds per actor / line / beat).
export function hash32(v) {
  let h = 2166136261; const s = String(v);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Stable short id from any JSON-able parts (12 hex chars of sha1).
export const shortHash = (...parts) => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);

export const ease = u => { u = clamp(u); return u * u * (3 - 2 * u); };
export const easeIO = u => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u));
export const smoothWin = (a, b, x) => ease((x - a) / ((b - a) || 1e-9));
export const round3 = x => Math.round(x * 1000) / 1000;

// ───────────── targets ─────────────
// 'left' | 'right' | 'x:1500' | 'x:1500,y:1060' | 'near:fox' | 'left-of:fox' | 'right-of:fox' | anchor name | {x, y}
export function parseTarget(v) {
  if (v && typeof v === 'object' && Number.isFinite(v.x)) return { kind: Number.isFinite(v.y) ? 'xy' : 'x', x: v.x, y: v.y };
  if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) return { kind: 'xy', x: v[0], y: v[1] };
  if (typeof v !== 'string' || !v.trim()) return { kind: 'bad', raw: v };
  const s = v.trim();
  if (s === 'left' || s === 'right') return { kind: 'side', side: s };
  let m = /^x:\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*y:\s*(-?\d+(?:\.\d+)?))?$/.exec(s);
  if (m) return m[2] != null ? { kind: 'xy', x: +m[1], y: +m[2] } : { kind: 'x', x: +m[1] };
  m = /^(near|left-of|right-of|behind|front-of):\s*([\w.-]+)$/.exec(s);
  if (m) return { kind: m[1], who: m[2] };
  if (/^[\w.-]+$/.test(s)) return { kind: 'name', name: s };
  return { kind: 'bad', raw: v };
}

// ───────────── rigs ─────────────
const POSE_ALIASES = {
  stand: ['stand', 'idle'],
  sit: ['sit', 'sit-ground', 'perch', 'rest'],
  lie: ['lie', 'rest', 'sleep', 'sit-ground'],
  sleep: ['sleep', 'lie', 'rest'],
  rest: ['rest', 'lie', 'sit'],
  crouch: ['crouch', 'ready', 'kneel', 'sit'],
  perch: ['perch', 'sit', 'stand'],
  alert: ['alert', 'stand'],
};
// Resolve a pose name for a rig (with friendly aliases). → { name, pose } | null
export function rigPose(rig, name) {
  if (!name) return null;
  if (rig.poses?.[name]) return { name, pose: rig.poses[name] };
  for (const n of POSE_ALIASES[name] || []) if (rig.poses?.[n]) return { name: n, pose: rig.poses[n] };
  return null;
}
export const poseNames = rig => Object.keys(rig.poses || {});
export const mixFor = rig => (typeof rig.mixPose === 'function' ? rig.mixPose : mixPoseGeneric);

// Per-actor numbers: sizes may depend on params (the human rig exposes sizes(params)).
export function rigSizes(rig, params = {}) {
  const base = { height: rig.height, headHeight: rig.headHeight, width: rig.width, speeds: rig.speeds || {}, stride: rig.stride || {} };
  if (typeof rig.sizes === 'function') {
    try { const z = rig.sizes(params); return { ...base, ...z, speeds: { ...base.speeds, ...(z.speeds || {}) }, stride: { ...base.stride, ...(z.stride || {}) } }; } catch { /* fall back */ }
  }
  const k = params.size || 1;
  if (k === 1) return base;
  const sc = o => Object.fromEntries(Object.entries(o).map(([g, v]) => [g, v * k]));
  return { ...base, height: base.height * k, headHeight: base.headHeight * k, width: base.width * k, speeds: sc(base.speeds), stride: sc(base.stride) };
}

// Draw a rig without painting anything, to read its head/mouth anchors and bounds. Rigs built with makeRig
// accept a null context; others (the human rig) get a tiny scratch canvas.
let SCRATCH = null;
const nullOK = new WeakMap();
export function probe(rig, x, y, s, face, st) {
  if (nullOK.get(rig) !== false) {
    try { const r = rig.draw(null, x, y, s, face, st); nullOK.set(rig, true); return r; }
    catch (e) { if (nullOK.get(rig) === true) throw e; nullOK.set(rig, false); }
  }
  if (!SCRATCH) SCRATCH = createCanvas(4, 4).getContext('2d');
  SCRATCH.setTransform(1, 0, 0, 1, 0, 0);
  SCRATCH.save();
  try { return rig.draw(SCRATCH, x, y, s, face, st); } finally { SCRATCH.restore(); }
}

// Profile of a rig in a pose at scale 1, facing right: box [x0, y0, x1, y1], head [x, y], mouth (units).
const PROFILES = new WeakMap();
export function profile(rig, poseName, params = {}) {
  let m = PROFILES.get(rig); if (!m) PROFILES.set(rig, (m = new Map()));
  const key = `${poseName}|${JSON.stringify(params)}`;
  if (m.has(key)) return m.get(key);
  const rp = rigPose(rig, poseName) || rigPose(rig, 'stand') || { pose: Object.values(rig.poses || {})[0] };
  const r = probe(rig, 0, 0, 1, 1, { pose: rp.pose, params, shadow: false, t: 0 });
  const p = { box: r.bounds.slice(), head: r.head.slice(), mouth: (r.mouth || r.head).slice() };
  m.set(key, p);
  return p;
}

// Keys of a gait pose that move the feet: perturbing them changes rig.feet(). Gestures layered over a gait keep
// these from the gait so planted feet never slide. Rigs without feet() (the human) return an empty set.
const CONTACT = new WeakMap();
export function contactKeys(rig, gait) {
  let m = CONTACT.get(rig); if (!m) CONTACT.set(rig, (m = new Map()));
  if (m.has(gait)) return m.get(gait);
  const out = new Set();
  if (typeof rig.feet === 'function' && rig.gaits?.[gait]) {
    const P = [0.13, 0.41, 0.77].map(ph => rig.gaits[gait](ph));
    for (const p of P) {
      let f0; try { f0 = rig.feet(p); } catch { continue; }
      for (const k of Object.keys(p)) {
        if (typeof p[k] !== 'number' || out.has(k)) continue;
        let f1; try { f1 = rig.feet({ ...p, [k]: p[k] + 0.05 * (Math.abs(p[k]) > 1 ? Math.abs(p[k]) : 1) }); } catch { continue; }
        if (f1.some((q, i) => Math.abs(q[0] - f0[i][0]) + Math.abs(q[1] - f0[i][1]) > 1e-3)) out.add(k);
      }
    }
  }
  m.set(gait, out);
  return out;
}

export { clamp, lerp };
