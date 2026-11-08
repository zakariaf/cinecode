// The forest path: a dirt path winding left to right between big trunks, misty depths behind,
// an old oak with a den between its roots, a fallen log, a mossy boulder, dappled light on the floor.
import { pick, blob, clump } from '../../core/lib.mjs';
import { makeSet } from '../set.mjs';
import { paper, fern, contactShadow, mushroom, RIGHT, meadowFloor, dirtPath, pathBand, paintTrunk, canopy, canopyBand, lightShafts, boulder, log, bush, hollowClip, bigTree } from '../../paint/paint.mjs';

export const forestGround = x => 1062 + 6 * Math.sin(x / 300);
export const OAK = { x: 1500, base: 1004, w: 128, top: -260, den: { cx: 1488, cy: 976, rx: 30, ry: 22 } };
export const ELM = { x: 3150, base: 996, w: 104, top: -220 };
export const LOG = { x0: 2230, x1: 2580, y: 1122, rad: 25 };
export const BOULDER = { x: 820, y: 1170, w: 120, h: 62 };
const FLOOR = ['#5f7a44', '#6f8a4c', '#7c9452', '#4e6a3a', '#8a7a50'];
const PATH = [-1200, 5800, forestGround, px => 27 + 3 * Math.sin(px / 170)];
export const forestPath = pathBand(...PATH).P;

export default function forest(params = {}) {
  const L = RIGHT, sAt = y => 0.5 + (y - 990) / 420;
  return makeSet({
    id: 'forest', W: 4400, H: 1400, refX: 2100, refY: 850, seed: params.seed || 0,
    area: { x0: -300, x1: 4700, y0: -520, y1: 1660 },
    view: { x0: 700, x1: 3700, y0: 380, y1: 1350 },
    horizon: 720, laneY: 1062, baseS: 1.3, light: L, lane: forestGround,
    defaultSky: 'morning', skyTint: ['214,230,208', 0.45], hazeScale: 0.7,
    layers: [
      { k: 0.3, res: 0.5, paint(x, r, S, E) {
        // an opaque misty depth: no open sky in a forest except through the leaves
        const g = x.createLinearGradient(0, -200, 0, 900); g.addColorStop(0, '#a9bfae'); g.addColorStop(0.55, '#cfdccb'); g.addColorStop(1, '#e6ead8');
        x.fillStyle = g; x.fillRect(E.x0, E.y0, E.x1 - E.x0, E.y1 - E.y0);
        for (let px = E.x0; px < E.x1; px += 50 + r() * 110) { const w = 8 + r() * r() * 46; x.globalAlpha = 0.25 + r() * 0.25; paintTrunk(x, r, px, w, E.y0, 870, { col: '#8fa597', lit: 'rgba(240,236,214,.4)', inkW: 0, roots: false, shade: 0, lean: (r() - 0.5) * 30 }); }
        x.globalAlpha = 1;
        canopyBand(x, r, E.x0, E.x1, E.y0, () => 240 + r() * 120, { pal: ['#97ae9a', '#a2b8a2', '#b0c4ac', '#c2d2b8', '#d2dec6'], light: L, gaps: 1.4, size: [300, 520] });
        lightShafts(x, r, 2600, -300, 14, { a: 0.16, dir: 1.95, len: 1500 });
        x.fillStyle = '#dbe3d0'; x.fillRect(E.x0, 860, E.x1 - E.x0, E.y1 - 860);
      } },
      { k: 0.55, res: 0.75, paint(x, r, S, E) {
        for (let px = E.x0; px < E.x1; px += 130 + r() * 260) { const w = 18 + r() * r() * 70; paintTrunk(x, r, px, w, E.y0, 910 + r() * 14, { col: pick(r, ['#76887a', '#6f8274', '#7f8f7c']), lit: 'rgba(240,226,180,.45)', inkW: 0, roots: w > 40 ? 2 : false, shade: 0.28, light: L, lean: (r() - 0.5) * 40 }); }
        for (let px = E.x0; px < E.x1; px += 70 + r() * 70) clump(x, px, 912, 150 + r() * 120, 60 + r() * 50, ['#6a8a6e', '#76967a', '#8aa886', '#adc4a0'], 26, r, { size: 0.13, light: L });
        canopyBand(x, r, E.x0, E.x1, E.y0, px => 260 + 60 * Math.sin(px / 230), { pal: ['#5a7a62', '#66866c', '#7a9a7a', '#94b08e', '#b4c8a6'], light: L, gaps: 0.9 });
        const g = x.createLinearGradient(0, 200, 0, 940); g.addColorStop(0, 'rgba(222,232,214,0)'); g.addColorStop(1, 'rgba(226,234,216,.55)'); x.fillStyle = g; x.save(); x.globalCompositeOperation = 'source-atop'; x.fillRect(E.x0, E.y0, E.x1 - E.x0, E.y1 - E.y0); x.restore();
        x.fillStyle = '#8fa684'; x.fillRect(E.x0, 930, E.x1 - E.x0, E.y1 - 930);
        paper(x, 0.06);
      } },
      { k: 0.8, outline: { w: 1.4, color: '#24342a', alpha: 0.45 }, paint(x, r, S, E) {
        for (let px = E.x0; px < E.x1; px += 240 + r() * 300) { const w = 40 + r() * 50; paintTrunk(x, r, px, w, E.y0, 994 + r() * 10, { col: pick(r, ['#5a4a3c', '#615040', '#54483a']), lit: 'rgba(244,214,150,.55)', inkW: 0, roots: 4, shade: 0.45, light: L, lean: (r() - 0.5) * 30 }); }
        canopyBand(x, r, E.x0, E.x1, E.y0, px => 190 + 80 * Math.sin(px / 300 + 1) + 40 * Math.sin(px / 97), { pal: ['#2c4632', '#36563c', '#486c4a', '#638c5c', '#8cac70'], light: L, gaps: 0.7, size: [500, 800] });
        for (let px = E.x0; px < E.x1; px += 40 + r() * 90) clump(x, px, 1000, 80 + r() * 140, 30 + r() * 36, ['#3e6036', '#4c7040', '#62884c', '#8aa860'], 20, r, { size: 0.14, light: L });
        for (let px = E.x0; px < E.x1; px += 200 + r() * 420) for (let k = 0; k < 2 + r() * 4; k++) fern(x, r, px + (r() - 0.5) * 90, 1008, 50 + r() * 70, -0.7 - r() * 1.7, ['#3a5c3a', '#456a42', '#527a4a']);
        x.fillStyle = '#5d7845'; x.fillRect(E.x0, 1010, E.x1 - E.x0, E.y1 - 1010);
        paper(x, 0.06);
      } },
      { k: 1, paint(x, r, S, E) {
        meadowFloor(x, r, E, { edge: () => 994, grad: [[0, '#6c8a4a'], [0.3, '#5f7d42'], [1, '#48653a']], pal: FLOOR, density: 0.9, flowerN: 0.15, sAt, patches: ['rgba(40,60,30,.2)', 'rgba(150,140,80,.18)'], hazeTo: 90, hazeCol: '214,226,204' });
        // leaf litter and moss
        for (let i = 0; i < 2600; i++) { const px = E.x0 + r() * (E.x1 - E.x0), py = 1000 + Math.pow(r(), 0.8) * (E.y1 - 1000), k = sAt(py); x.fillStyle = pick(r, ['#9a7a4a', '#b08850', '#7a6a3a', '#c09a5a', '#6a8a3a']); blob(x, px, py, (2 + r() * 4) * k, (1 + r() * 1.5) * k, r() * 3, r, 5); }
        dirtPath(x, r, ...PATH, { col: '#a8946a', pal: ['#957f58', '#b8a47a', '#8a7650', '#c4ae80', '#a08a5e'], grassEdge: ['#5f7a44', '#6f8a4c', '#4e6a3a'] });
        for (let i = 0; i < 60; i++) { const px = E.x0 + r() * (E.x1 - E.x0), py = forestGround(px) + (r() < 0.5 ? -40 - r() * 20 : 46 + r() * 40); mushroom(x, r, px, py, 0.8 + r() * 0.6, pick(r, ['#c94a3a', '#e6d6b0', '#d9a441'])); }
        // dappled sunlight pools on the floor and path
        x.save(); x.globalCompositeOperation = 'soft-light';
        for (let i = 0; i < 70; i++) { const px = E.x0 + r() * (E.x1 - E.x0), py = 1010 + r() * 360, k = sAt(py); x.fillStyle = 'rgba(255,236,170,.55)'; blob(x, px, py, (30 + r() * 70) * k, (6 + r() * 12) * k, 0, r, 9); }
        x.restore();
        paper(x, 0.07);
      } },
      { k: 1.45, front: true, paint(x, r, S, E) {
        for (let px = E.x0; px < E.x1; px += 300 + r() * 500) for (let k = 0; k < 3 + r() * 4; k++) fern(x, r, px + (r() - 0.5) * 160, 1700 + r() * 30, 180 + r() * 160, -0.6 - r() * 1.9, ['#16281a', '#1f3322', '#284028']);
      } },
    ],
    props: [
      { id: 'oak', x: OAK.x, y: 994, base: OAK.base, solid: { rx: 92, ry: 22 }, bounds: [OAK.x - 700, -560, OAK.x + 500, 1040],
        paint: (x, r) => { bigTree(x, r, { ...OAK, light: L, roots: 5, bark: { col: '#64503e' }, hollow: OAK.den }); canopy(x, r, [[OAK.x, -40, 820, 360], [OAK.x - 200, -260, 700, 360]], { light: L, pal: ['#28432e', '#33533a', '#456a48', '#618a5a', '#8cac70'], shade: 0.35 }); },
        ground: x => contactShadow(x, OAK.x - 20, OAK.base + 6, 200, 30, 0.45),
        anchors: { den: { type: 'hollow', x: OAK.den.cx, y: OAK.den.cy + OAK.den.ry - 3, clip: hollowClip(OAK.den), face: 'right' } } },
      { id: 'elm', x: ELM.x, y: 987, base: ELM.base, solid: { rx: 76, ry: 20 }, bounds: [ELM.x - 450, -560, ELM.x + 700, 1030],
        paint: (x, r) => { paintTrunk(x, r, ELM.x, ELM.w, ELM.top, ELM.base, { col: '#5e4c3c', light: L, inkW: 0, roots: 4 }); canopy(x, r, [[ELM.x, 0, 680, 320], [ELM.x + 160, -220, 640, 340]], { light: L, pal: ['#28432e', '#33533a', '#456a48', '#618a5a', '#8cac70'], shade: 0.35 }); },
        ground: x => contactShadow(x, ELM.x - 20, ELM.base + 6, 170, 26, 0.45) },
      { id: 'log', x: (LOG.x0 + LOG.x1) / 2, y: LOG.y - 10, base: LOG.y, solid: { rx: (LOG.x1 - LOG.x0) / 2 + 6, ry: 14 }, bounds: [LOG.x0 - 20, LOG.y - 2 * LOG.rad - 30, LOG.x1 + 20, LOG.y + 12],
        paint: (x, r) => log(x, r, LOG, { light: L }),
        ground: x => contactShadow(x, (LOG.x0 + LOG.x1) / 2, LOG.y + 2, (LOG.x1 - LOG.x0) * 0.6, 16, 0.45),
        anchors: { log_top: { type: 'surface', x: 2400, y: LOG.y - 2 * LOG.rad + 2, surface: 'wood' } } },
      { id: 'boulder', x: BOULDER.x, y: BOULDER.y - 14, base: BOULDER.y, solid: { rx: 62, ry: 16 }, bounds: [BOULDER.x - 70, BOULDER.y - BOULDER.h - 10, BOULDER.x + 70, BOULDER.y + 8],
        paint: (x, r) => boulder(x, r, BOULDER.x, BOULDER.y, BOULDER.w, BOULDER.h, { light: L }),
        ground: x => contactShadow(x, BOULDER.x - 8, BOULDER.y, 80, 14, 0.45),
        anchors: { boulder_top: { type: 'surface', x: BOULDER.x - 8, y: BOULDER.y - BOULDER.h + 4 } } },
      { id: 'brambles', x: 3620, y: 1128, base: 1138, solid: { rx: 120, ry: 20 }, bounds: [3470, 960, 3770, 1150],
        paint: (x, r) => bush(x, r, 3620, 1140, 290, 150, { light: L, pal: ['#253e28', '#30502f', '#41663a', '#5a8248', '#82a65e'], berries: '#3a2a4a' }),
        ground: x => contactShadow(x, 3610, 1140, 160, 20, 0.45) },
    ],
    anchors: {
      path_west: { x: 700, y: forestGround(700) },
      path_mid: { x: 2100, y: forestGround(2100) },
      path_east: { x: 3500, y: forestGround(3500) },
      oak_front: { x: 1560, y: 1090 },
      log_front: { x: 2420, y: 1185 },
      clearing: { x: 1900, y: 1190 },
      fern_corner: { x: 3300, y: 1230 },
      boulder_side: { x: 980, y: 1160 },
    },
    walk: { region: [[-250, 1022], [4650, 1022], [4650, 1440], [-250, 1440]], paths: [{ poly: forestPath, surface: 'dirt' }] },
    ambience: { day: 'forest-day', night: 'forest-night' },
    surface: 'grass',
    sampleRoute: ['path_west', 'log_front'],
  });
}
