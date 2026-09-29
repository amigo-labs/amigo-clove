# DoveZ — Levelbericht

Erzeugt von `scripts/dovez-levels.ts` (`bun run levels:report`) aus den gebauten Assets;
nicht von Hand ändern. Die Tests `packages/game-dovez/test/levels.test.ts` spielen jedes
dieser Level mit einem Bot bis zum Ende (Boss besiegt bzw. Levelende erreicht).

| Level | Titel | Länge (Ticks) | Musik | Gegnertypen | Spawns | Boss | Funk | Waffen | Routen |
|---|---|---|---|---|---|---|---|---|---|
| `epilog` | Epilog | 5700 | Jamming.ogg | 3 | 7 | – | 2 | 5 | 7 |
| `level0-1_tutorial` | Level 0-1: Tutorial | 9200 | Tutorial.ogg | 8 | 40 | – | 5 | 7 | 18 |
| `level1-1_skyfight` | Level 1-1: Skyfight | 7350 | Sky Fight.ogg | 15 | 109 | – | 6 | 9 | 40 |
| `level1-2_zeppelin_boss` | Level1-2: Zeppelin Boss | Boss | Hyperblast Boss.ogg | 4 | 7 | Zeppelin (45000 HP, 8 Teile) | 0 | 7 | 9 |
| `level2-1_spacestation_i` | Level 2-1: Spacestation | 10400 | Space Adventure.ogg | 8 | 247 | – | 6 | 5 | 23 |
| `level2-2_spacestation_ii` | Level 2-2: Space Station II | 11600 | Space Adventure.ogg | 16 | 266 | – | 9 | 5 | 24 |
| `level2-3_station_defender` | Level 2-3: Station Defender | Boss | Hyperblast Boss.ogg | 1 | 1 | Schwabbelmonster (14000 HP, 10 Teile) | 0 | 9 | 11 |
| `level3-1_industry_harbor` | Level 3-1: Industry Harbor | 11450 | Tech X.ogg | 10 | 286 | – | 4 | 5 | 20 |
| `level3-2_industry_harbor_ii` | Level 3-2: Dark Harbor | 11850 | Tech X.ogg | 12 | 310 | – | 7 | 5 | 18 |
| `level3-3_saw_machine` | Level 3-3: Saw Machine | Boss | Endboss.ogg | 8 | 5 | Endgegner Main (16000 HP, 13 Teile) | 0 | 8 | 17 |
| `level4-1_midtown_madness` | Level4-1: Midtown City | 9500 | Midtown Madness.ogg | 12 | 282 | – | 5 | 6 | 28 |
| `level4-2_midtown_madness_ii` | Level 4-2: Midtown City II | 9850 | Midtown Madness.ogg | 11 | 284 | – | 7 | 7 | 17 |
| `level4-3_cityboss` | Level4-3 Cityboss | Boss | Endboss.OGG | 3 | 2 | Cityboss (75000 HP, 21 Teile) | 0 | 8 | 12 |
| `level5-1_atlantis` | Level 5-1: Atlantis | 9900 | underwater worldz.ogg | 16 | 152 | – | 9 | 8 | 21 |
| `level5-2_canalisation` | Level 5-2: Canalisation | 10000 | underwater worldz.ogg | 16 | 147 | – | 6 | 10 | 29 |
| `level5-3_rumbler` | Level5-3 Rumbler | Boss | Underwater Worldz Boss.ogg | 10 | 5 | Boss (40000 HP, 9 Teile) | 0 | 7 | 19 |
| `level6-1_ice_palace` | Level 6-1: Ice Palace | 9500 | Ice Palace.ogg | 11 | 203 | – | 10 | 5 | 22 |
| `level6-2_caves` | Level 6-2: Ice Caves | 11700 | Ice Palace.ogg | 19 | 172 | – | 5 | 7 | 21 |
| `level6-3_keeper` | Level 6-3: Ice Keeper | Boss | Underwater Worldz Boss.ogg | 3 | 1 | Reaktor (180000 HP, 1 Teile) | 0 | 8 | 9 |
| `level7-1_alienation` | Level 7-1: Alienation | 12500 | Organic Motions.ogg | 15 | 84 | – | 2 | 8 | 20 |
| `level7-2_alienation_ii` | Level 7-2: Alienation II | 12700 | Organic Motions.ogg | 21 | 184 | – | 3 | 13 | 40 |
| `level7-3_final_endboss` | Level 7-3: Final Endboss | Boss | Finalboss.ogg | 2 | 2 | Feind (400000 HP, 10 Teile) | 0 | 7 | 9 |
| `level7-4_finalboss` | REAL Final Boss | Boss | Finalboss.ogg | 1 | 1 | – | 0 | 5 | 4 |
| `level7-5_escape` |  | 1100 | Escape.ogg | 3 | 3 | – | 2 | 5 | 5 |
| `level8-1_jungle` | Jungle Crisis | 12100 | African Crisis.ogg | 9 | 158 | – | 0 | 7 | 30 |
| `level_bleistift` | Level Bleistift | 10000 | To the Top.ogg | 14 | 585 | – | 0 | 6 | 22 |
| `spacestation_bonus` | Spacestation Bonus | 5500 | Space Adventure.ogg | 16 | 163 | – | 0 | 5 | 24 |

Länge „Boss“: das Level endet mit dem Tod des Bosses (`levelLength` 99999).
