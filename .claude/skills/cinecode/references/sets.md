# Set reference (kits)

Generated from the kit registry by `node .claude/skills/cinecode/scripts/inventory.mjs sets` (add `films/<slug>` to include custom kits); the notes at the end are by hand. Rerun it when the engine changes. `node bin/cinecode.mjs set-sheet <kits> -o out/<name>.jpg` draws each kit with its anchors, solid footprints, walk region and water: look at it before you stage a scene.

Anchor types: ground (stand here), surface (stand on a prop top: walk there and the actor jumps up), perch (branch; perch rigs only), hollow (an opening in a prop: the actor jumps in and is drawn clipped to it, in front of a dark hole), view (a far landmark to frame or look at, not to stand on). s = actor scale there.

### forest

4400×1400 world px, camera centre x 700–3700, horizon 720, lane y 1062; ambience forest-day / forest-night.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): oak* 800–2000 × -560–1040, elm* 2700–3850 × -560–1030, log* 2210–2600 × 1042–1134, boulder* 750–890 × 1098–1178, brambles* 3470–3770 × 960–1150.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| path_west | ground | 700 | 1066 | 1.32 | dirt |
| path_mid | ground | 2100 | 1066 | 1.31 | dirt |
| path_east | ground | 3500 | 1057 | 1.28 | dirt |
| oak_front | ground | 1560 | 1090 | 1.41 | grass |
| log_front | ground | 2420 | 1185 | 1.77 | grass |
| clearing | ground | 1900 | 1190 | 1.79 | grass |
| fern_corner | ground | 3300 | 1230 | 1.94 | grass |
| boulder_side | ground | 980 | 1160 | 1.67 | grass |
| den | hollow (oak) | 1488 | 995 | 1.08 | stone |
| log_top | surface (log) | 2400 | 1074 | 1.53 | wood |
| boulder_top | surface (boulder) | 812 | 1112 | 1.71 | stone |

### hill

3300×1500 world px, camera centre x 800–2900, horizon 600, ridge set (ground follows a slope: give x only); ambience wind-hill / meadow-night.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): standing_stone* 2330–2510 × 471–781, rock_low* 864–936 × 1049–1093, rock_mid* 1672–1728 × 798–838, rock_high* 2858–2942 × 716–764, hawthorn* 2900–3340 × 436–770.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| hill_foot | ground | 250 | 1227 | 1.40 | dirt |
| slope_low | ground | 800 | 1143 | 1.40 | dirt |
| slope_mid | ground | 1400 | 938 | 1.40 | dirt |
| slope_high | ground | 1900 | 818 | 1.40 | dirt |
| crest | ground | 2200 | 797 | 1.40 | dirt |
| stone_front | ground | 2420 | 807 | 1.45 | grass |
| stone_left | ground | 2290 | 789 | 1.38 | dirt |
| stone_right | ground | 2560 | 781 | 1.38 | dirt |
| beyond | ground | 2860 | 792 | 1.43 | dirt |
| thorn_shade | ground | 3060 | 784 | 1.40 | dirt |
| stone_top | surface (standing_stone) | 2426 | 501 | 1.32 | stone |

### meadow

2800×1500 world px, camera centre x 500–2300, horizon 700, lane y 1040; ambience meadow-day / meadow-night.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): owl_tree* -280–1040 × -600–1060, stump* 1915–2185 × 860–1040, rock_a* 1162–1238 × 1142–1186, rock_b* 2301–2359 × 1068–1106, rock_c* 736–824 × 1220–1268, bush* 2560–2880 × 740–960.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| tree_foot | ground | 640 | 1050 | 1.34 | grass |
| stump_front | ground | 2050 | 1075 | 1.43 | grass |
| stump_side | ground | 1880 | 1012 | 1.19 | grass |
| meadow_centre | ground | 1400 | 1060 | 1.38 | grass |
| meadow_left | ground | 950 | 1050 | 1.34 | grass |
| meadow_right | ground | 1760 | 1090 | 1.49 | grass |
| far_meadow | ground | 1300 | 900 | 0.76 | grass |
| foreground | ground | 1550 | 1260 | 2.14 | grass |
| pond_edge | ground | 2200 | 1200 | 1.91 | grass |
| pond_far | ground | 2560 | 1140 | 1.68 | grass |
| bush_side | ground | 2540 | 960 | 0.99 | grass |
| rock_top | surface (rock_a) | 1196 | 1150 | 1.84 | stone |
| owl_hollow | hollow (owl_tree) | 436 | 604 | 1.20 | stone |
| low_branch | perch (owl_tree) | 650 | 672 | 1.20 | wood |
| branch_tip | perch (owl_tree) | 780 | 652 | 1.20 | wood |
| stump_top | surface (stump) | 2050 | 901 | 1.20 | wood |

### stream

2800×1400 world px, camera centre x 700–2100, horizon 700, lane y 1050; ambience stream / stream.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): stone_1 1124–1217 × 1029–1077, stone_2 1231–1309 × 1033–1076, stone_3 1327–1414 × 1029–1075, stone_4 1421–1520 × 1031–1082, frog_rock 1394–1466 × 1106–1146, bank_rock* 1980–2120 × 1140–1220, willow_bush* 480–800 × 760–970.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| bank_left | ground | 1000 | 1052 | 1.31 | dirt |
| bank_right | ground | 1660 | 1054 | 1.31 | dirt |
| path_west | ground | 500 | 1055 | 1.32 | dirt |
| path_east | ground | 2300 | 1055 | 1.32 | dirt |
| near_left | ground | 860 | 1230 | 1.97 | grass |
| near_right | ground | 1880 | 1250 | 2.04 | grass |
| far_bank | ground | 1640 | 900 | 0.74 | grass |
| stone_1 | surface (stone_1) | 1170 | 1043 | 1.27 | stone |
| stone_2 | surface (stone_2) | 1270 | 1046 | 1.29 | stone |
| stone_3 | surface (stone_3) | 1370 | 1043 | 1.27 | stone |
| stone_4 | surface (stone_4) | 1470 | 1046 | 1.29 | stone |
| frog_rock | surface (frog_rock) | 1430 | 1116 | 1.55 | stone |

### valley

2800×1400 world px, camera centre x 1000–1800, horizon 600, lane y 1200; ambience meadow-day / meadow-night.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): lookout_rock* 1790–1970 × 1160–1250, gorse* 720–1000 × 1000–1170.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| lookout | ground | 1400 | 1200 | 1.00 | grass |
| knoll_left | ground | 1060 | 1190 | 0.98 | grass |
| knoll_right | ground | 2080 | 1250 | 1.08 | grass |
| path_down | ground | 1440 | 1330 | 1.22 | grass |
| near | ground | 1250 | 1360 | 1.27 | grass |
| view_forest | view | 500 | 860 | 0.43 | stone |
| view_stream | view | 1380 | 960 | 0.60 | stone |
| view_tree | view | 1680 | 858 | 0.43 | stone |
| view_stone | view | 2260 | 733 | 0.22 | stone |
| lookout_rock | surface (lookout_rock) | 1866 | 1170 | 1.07 | stone |

### village

2800×1500 world px, camera centre x 600–2300, horizon 660, lane y 1160; ambience village-day / village-night.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): cottage* 676–1448 × 234–900, bed_left* 706–992 × 796–1040, bed_right* 1110–1356 × 796–1040, fence_left* 660–1004 × 922–1074, gate_post_l* 874–1024 × 912–1074, gate_post_r* 1076–1136 × 912–1074, fence_right* 1096–1430 × 922–1074, fence_side_l1* 660–731 × 863–1072, fence_side_l2* 671–742 × 774–983, fence_side_r1* 1344–1430 × 853–1072, fence_side_r2* 1318–1404 × 754–973, well* 1525–1775 × 689–989, bench* 2047–2273 × 838–972, lantern* 1395–1554 × 664–1086, tree* 1550–3250 × -600–950, apple_tree* 120–640 × 420–912, wheelbarrow* 406–711 × 886–1120.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| door_front | ground | 1050 | 904 | 0.76 | stone |
| gate | ground | 1050 | 1098 | 1.36 | grass |
| garden_path | ground | 1050 | 990 | 1.02 | stone |
| window_left | ground | 862 | 904 | 0.76 | gravel |
| window_right | ground | 1210 | 904 | 0.76 | gravel |
| lantern_foot | ground | 1510 | 1094 | 1.34 | grass |
| well_side | ground | 1522 | 1000 | 1.05 | grass |
| well_front | ground | 1650 | 1050 | 1.21 | grass |
| bench_front | ground | 2160 | 1008 | 1.08 | grass |
| tree_foot | ground | 2310 | 950 | 0.90 | grass |
| lane_west | ground | 300 | 1174 | 1.59 | stone |
| lane_mid | ground | 1400 | 1179 | 1.61 | stone |
| lane_east | ground | 2500 | 1152 | 1.52 | stone |
| orchard | ground | 560 | 940 | 0.87 | grass |
| meadow_back | ground | 1900 | 880 | 0.68 | grass |
| foreground | ground | 1500 | 1300 | 1.98 | grass |
| chimney_top | surface (cottage) | 841 | 248 | 0.68 | stone |
| roof_ridge | surface (cottage) | 1143 | 356 | 0.68 | thatch |
| well_rim | surface (well) | 1628 | 943 | 1.05 | stone |
| bench_seat | surface (bench) | 2160 | 909 | 0.93 | wood |
| bench_left | surface (bench) | 2110 | 909 | 0.93 | wood |
| bench_right | surface (bench) | 2210 | 909 | 0.93 | wood |
| low_branch | perch (tree) | 2254 | 610 | 0.76 | wood |
| branch_tip | perch (tree) | 2109 | 607 | 0.76 | wood |

### wayside

2800×1500 world px, camera centre x 700–2200, horizon 720, lane y 1080; ambience meadow-day / meadow-night.

Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): way_tree* 560–2460 × -600–1030, signpost* 2140–2340 × 874–1054, mile_stone* 700–820 × 1100–1170.

| anchor | type | x | y | s | surface |
|---|---|---|---|---|---|
| nap | ground | 1390 | 1014 | 1.06 | grass |
| tree_shade | ground | 1200 | 1030 | 1.12 | grass |
| roots_front | ground | 1600 | 1040 | 1.16 | grass |
| path_west | ground | 500 | 1086 | 1.32 | dirt |
| path_mid | ground | 1400 | 1075 | 1.28 | dirt |
| path_east | ground | 2400 | 1084 | 1.32 | dirt |
| sign | ground | 2160 | 1095 | 1.35 | dirt |
| meadow_near | ground | 1300 | 1240 | 1.88 | grass |
| far_field | ground | 2000 | 930 | 0.76 | grass |
| way_branch | perch (way_tree) | 1310 | 600 | 0.96 | wood |
| branch_end | perch (way_tree) | 1128 | 597 | 0.96 | wood |
| branch_base | perch (way_tree) | 1447 | 622 | 0.96 | wood |

## Notes that the tables don't show

- **`x:` alone is the main lane** (the `lane y` above). For any other ground spot give both: `x:1530,y:1028`. Points
  inside a solid prop's footprint move to the nearest walkable spot.
- **Hollows** (`den`, `owl_hollow`): `run`/`walk` to one goes to the foot of the prop and jumps in (a flier flies in);
  `enter` with `"from": "den"` appears in it. The occupant is clipped to the opening in front of a dark hole: at
  night it reads only by the scene's `rim` light or a glow you draw. The forest `den` is a 60 × 44 px opening at the
  foot of the oak, mouse-sized (taller rigs are cut by it); the nearest ground is just in front, about
  `x:1490–1550,y:1028`, 30 px below it, close enough for a two-shot of small rigs. `owl_hollow` is 360 px up its tree:
  owl or other fliers, and cut between it and the ground.
- **Anchors as camera subjects** (`"on": ["den"]`) are framed as a box about 120 × 110 px × s (a standing hare), so a
  small actor framed with an anchor comes out small; `warnings.mjs` warns when it gets under 45% of its own size (not
  in wide shots), and lint's `subject-size` catches the rest.
- **The air.** Every anchor and point is somewhere to stand, and a flight ends on one of them (or `on:<actor>`)
  unless it gives `"height"`: then the flier hovers that many units above it (above a perch or surface anchor's
  point), and the point is taken as given, over water or a stone too. A point in the air is `height` = (ground y −
  its y) ÷ the scale there.
- **Props without anchors.** The "Props" line of each kit is the painted extent (custom code: `api.set.props`). The
  hill's hawthorn crown is about x 2990–3330, y 440–650; a flier at `"x:3160"` with `"height": 160` hovers in the
  middle of it (a kite snagged there).
- **The front layer** (foreground grass blades, ferns, low branches) is drawn over the actors with its own parallax
  and is not on the set sheet: in a low or close shot a small actor near the bottom of the frame can be crossed by
  blades (the stream's banks, at a strawberry's height). Check those shots on a contact sheet.
