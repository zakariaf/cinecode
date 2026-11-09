# Set reference (kits)

Generated from the kit registry by `node .claude/skills/cinecode/scripts/inventory.mjs sets` (add `films/<slug>` to include custom kits). Rerun it when the engine changes. `node bin/cinecode.mjs set-sheet <kits> -o out/<name>.jpg` draws each kit with its anchors, solid footprints, walk region and water: look at it before you stage a scene.

Anchor types: ground (stand here), surface (stand on a prop top), perch (branch; perch rigs only), hollow (inside a prop, clipped), view (a far landmark to frame or look at, not to stand on). s = actor scale there.

### forest

4400×1400 world px, camera centre x 700–3700, horizon 720, lane y 1062; ambience forest-day / forest-night; solid props: oak, elm, log, boulder, brambles.

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

3300×1500 world px, camera centre x 800–2900, ridge set (ground follows a slope: give x only); ambience wind-hill / meadow-night; solid props: standing_stone, rock_low, rock_mid, rock_high, hawthorn.

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

2800×1500 world px, camera centre x 500–2300, horizon 700, lane y 1040; ambience meadow-day / meadow-night; solid props: owl_tree, stump, rock_a, rock_b, rock_c, bush.

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

2800×1400 world px, camera centre x 700–2100, horizon 700, lane y 1050; ambience stream / stream; solid props: bank_rock, willow_bush.

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

2800×1400 world px, camera centre x 1000–1800, horizon 600, lane y 1200; ambience meadow-day / meadow-night; solid props: lookout_rock, gorse.

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

2800×1500 world px, camera centre x 600–2300, horizon 660, lane y 1160; ambience village-day / village-night; solid props: cottage, bed_left, bed_right, fence_left, gate_post_l, gate_post_r, fence_right, fence_side_l1, fence_side_l2, fence_side_r1, fence_side_r2, well, bench, lantern, tree, apple_tree, wheelbarrow.

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

2800×1500 world px, camera centre x 700–2200, horizon 720, lane y 1080; ambience meadow-day / meadow-night; solid props: way_tree, signpost, mile_stone.

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

