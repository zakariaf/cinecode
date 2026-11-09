// A starter set kit: a glade (far hills, a tree line, a meadow floor, a big boulder you can stand on, a bush and
// foreground grass), complete and passing `cinecode verify-kit`. Copy it to films/<slug>/kits/<name>.mjs (or
// <project>/cinecode/kits/<name>.mjs): the file name is the kit name used in film.json ("kit": "<name>").
// World units are set pixels, y down. Paint only with the seeded `r()` each paint function is given (no Math.random):
// layers and props are painted once and cached, so every frame and every render is the same picture.
import { lerp, smooth } from 'cinecode/lib';
import { makeSet } from 'cinecode/set';
import { paper, hazeBand, ridge, meadowFloor, treeline, boulder, bush, contactShadow, blades, LEFT } from 'cinecode/paint/paint';

const ROCK = { x: 1900, y: 1090, w: 220, h: 150 };                 // the boulder: foot at y, top at y - h
const lane = x => 1040 + 10 * Math.sin(x / 340);                  // where `x:<n>` stands an actor (the main lane)
const edge = x => 800 + 6 * Math.sin(x / 280) + 3 * Math.sin(x / 67);   // the far edge of the meadow floor

export default function glade(params = {}) {
  return makeSet({
    id: 'glade', W: 2800, H: 1500, refX: 1400, refY: 850, seed: params.seed || 0,
    area: { x0: -400, x1: 3200, y0: -380, y1: 1700 },              // the painted world: at least 3200 × 1800 (the widest view)
    view: { x0: 500, x1: 2300, y0: 300, y1: 1400 },                 // where the camera centre may go
    horizon: 700, laneY: 1040, baseS: 1.3, lane, light: LEFT,      // actor scale = baseS × (y − horizon) / (laneY − horizon)
    layers: [
      { k: 0.4, paint(x, r, S, E) {                                 // far hills (parallax 0.4: moves least)
        ridge(x, r, E.x0, E.x1, px => 660 - 50 * Math.sin(px / 420) - 24 * Math.sin(px / 160 + 1), { pal: ['#a9bfc0', '#b2c6c4', '#9fb6b8', '#bacbc6'] });
        hazeBand(x, E.x0, E.x1, 620, 820, '236,242,232', 0.5);
        paper(x, 0.06);
      } },
      { k: 0.75, outline: { w: 1.6, color: '#2f4a3a', alpha: 0.55 }, paint(x, r, S, E) {   // a tree line behind the glade
        x.fillStyle = '#41634a'; x.fillRect(E.x0, 812, E.x1 - E.x0, 240);                 // understory: no gap under the trees
        treeline(x, r, E.x0, E.x1, px => 806 + 8 * Math.sin(px / 210), px => lerp(420, 620, smooth(0, 2800, px)) + 40 * Math.sin(px / 150), { light: LEFT, crownW: [220, 380], step: [100, 170], haze: '226,236,222' });
        paper(x, 0.07);
      } },
      { k: 1, paint(x, r, S, E) {                                   // the ground the actors stand on
        meadowFloor(x, r, E, { edge, sAt: y => 0.45 + (y - 800) / 560, density: 1, flowerN: 1 });
        paper(x, 0.07);
      } },
      { k: 1.3, front: true, paint(x, r, S, E) {                    // foreground grass, drawn over the actors
        x.fillStyle = '#4a7a3a'; x.fillRect(E.x0, 1690, E.x1 - E.x0, E.y1 - 1690);
        blades(x, r, E.x0, E.x1, px => 1690 + 10 * Math.sin(px / 67), Math.round((E.x1 - E.x0) / 2.5), { len: [50, 180], w: 8, clumps: 1 });
      } },
    ],
    props: [                                                        // sorted in depth with the actors by y
      { id: 'boulder', x: ROCK.x, y: ROCK.y - 30, base: ROCK.y, solid: { rx: ROCK.w * 0.46, ry: 26 }, bounds: [ROCK.x - ROCK.w * 0.6, ROCK.y - ROCK.h - 10, ROCK.x + ROCK.w * 0.6, ROCK.y + 10],
        paint: (x, r) => boulder(x, r, ROCK.x, ROCK.y, ROCK.w, ROCK.h, { light: LEFT }),
        ground: x => contactShadow(x, ROCK.x + 10, ROCK.y, ROCK.w * 0.6, 26, 0.4),
        anchors: { boulder_top: { type: 'surface', x: ROCK.x - 10, y: ROCK.y - ROCK.h + 14, surface: 'stone' } } },
      { id: 'bush', x: 700, y: 935, base: 945, solid: { rx: 110, ry: 22 }, bounds: [540, 760, 860, 960],
        paint: (x, r) => bush(x, r, 700, 948, 280, 170, { light: LEFT }),
        ground: x => contactShadow(x, 710, 946, 160, 22, 0.4) },
    ],
    anchors: {                                                      // ground anchors default to type 'ground'
      glade_centre: { x: 1400, y: 1060 },
      glade_left: { x: 950, y: 1050 },
      glade_right: { x: 2250, y: 1080 },
      boulder_front: { x: 1880, y: 1150 },
      far_glade: { x: 1300, y: 900 },
      foreground: { x: 1500, y: 1260 },
    },
    walk: { region: [[-360, 850], [3160, 850], [3160, 1470], [-360, 1470]] },   // the walkable ground, as a polygon
    ambience: { day: 'meadow-day', night: 'meadow-night' },        // beds for "ambience": "auto"
    sampleRoute: ['glade_left', 'glade_right'],                     // drawn on the set sheet
  });
}
