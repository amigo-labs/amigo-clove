# DoveZ `<Level>.dat` — the level script

Status: M7. Parser and serializer: `packages/formats/src/dovez/LevelDat.ts`
(schema-driven, `binarySchema.ts`), checked by
`packages/formats/test/dovezLevelDat.test.ts` against **all 27** levels. The
route interpreter lives in `packages/game-dovez/src/sim/route.ts`, the enemy
weapons in `sim/weapon.ts`, the debug page at `#/dovez/debug/level`.

## Result

- **The grammar is complete and comes from the program, not from the data.**
  `LadeDaten` (`0x4C72C0`) reads the file with a fixed sequence of `Get #` calls;
  their field sizes, `ReDim`s and loops yield the schema below. All 27 files
  parse completely, `serialize(parse(b)) === b`.
- **No byte has an open meaning.** Of 622 806 bytes, 555 431 are in named fields,
  63 204 are structure (counters, string lengths) and 4171 are in fields the
  program demonstrably never reads (`unused*`: group editor ID, radio speaker and
  flag). The spec's metric (`opaque` under 5 %) is thus 0 %; the test requires
  0 bytes `unknown*`.
- "Named" means: the meaning is **read from the machine code** (addresses below)
  and cross-checked against the data of all levels. Nothing is checked against
  the running original; entries with confidence *M* or *L* are confirmed only by
  M8.
- The spec suspected an open "spawn timeline" with variable record length and
  "24 null fields in the enemy record". Both resolve: there are seven timeline
  layers with fixed 5×i32 entries, and the "null fields" are 16 enemy flags that
  are 0 in most types.

## Origin: `DoveZ.exe`

`DoveZ.exe` is **UPX-packed** (`upx -d`, UPX 4.2), underneath it native VB6.
Disassembled with `objdump -d -M intel`, image base `0x400000`, file offset =
VA − `0x400000`. The names of the form methods are in the VB object header
(`VB5!` at `0x409154`); they are in slot order up to roughly `LadeDaten`, shifted
after that (so identify functions by content). Method calls go through the vtable
from `0x40ACC8` (`call [ecx+Offset]`).

| Function | Address | Role |
|---|---|---|
| `LadeDaten` | `0x4C72C0` | reads the script (grammar) |
| `GetAsciiStrFromFile` | `0x4C7010` | read a fixed-length string (vtable `0x778`) |
| `DoRoute` | `0x4ACC70` | route interpreter, jump table `0x4B5458` |
| `Var` | `0x4AC970` | resolve arguments |
| `SpielMoveEnemy` | `0x4B5850` | move, fire, kill enemy |
| `AddEnemy` | `0x575FF0` | create enemy instance |
| timeline player | `0x50C9F0` | once per tick, all 7 layers |
| `AddGegnerSchussErzeuger` / `SpielGegnerSchussErzeugen` | `0x4AA6A0` / `0x4AA0D0` | weapon emitters |
| `AddGegnerS` / `SpielMoveGegnerS` | `0x4AA8F0` / `0x4AAFE0` | enemy shots |
| `AddAnima` / `SpielMoveAnimation` | `0x4A88E0` / `0x4A8BB0` | effect animations |

`0x5882A4` is **number of players − 1** (menu "Zwei Spieler?", `0x54ED5D`), not
the difficulty as the spec assumed.

## Grammar

VB6 writes upper bounds (`ReDim a(0 To n)`), i.e. count − 1 (−1 = empty), and
sometimes before fields other than the elements themselves. `str` = i32 length +
CP1252. `Get` with 4 bytes does not distinguish Long and Single; the types below
come from the usage (`fld`/`fstp` vs. `mov`/`fild`).

```
"DOVE2 - V. 0.15"                 15 bytes
str   background                  file name or number as text
i32   nGroups-1,  Group[]
i32   nEnemies-1, Enemy[]
i32   nRoutes-1,  Route[]
      Layer[7]                    fixed count, no counter
i32   nAnims-1,   Anim[]
i32   nWeapons-1, Weapon[]
i32   nShots-1,   Shot[]
i32   nSounds-1,  Sound[]
str   radioPrefix
i32   nRadio-1,   Radio[]
i32 levelLength, i32 waterHeight, i32 weatherParticles, f32 gravity
str   music, str title
f32 × 6  waterTop RGB, waterBottom RGB
EOF
```

The field order of each record is in the schema (`LevelDat.ts`); the tables below
give field, type, runtime offset (evidence site) and meaning. Confidence:
**H** read from the code and matching the data, **M** mechanics read, game effect
inferred, **L** conjecture.

### Sprite group (`0x5880AC`, 0x18 bytes)

| Field | Type | Runtime | Meaning | C |
|---|---|---|---|---|
| `unusedEditorId` | i32 | — | read and discarded; groups are referenced by their position | H |
| `name` | str | +0x0 | editor name | H |
| `d3d` | i16 | +0x4 | ≠ 0: Direct3D quad (color, alpha, rotation, additive); 0: DirectDraw blit with color key, flash copies `<bmp>_i` | H |
| `frames` | list | +0x8 | images | H |
| └ `bmp` | str | +0x0 | BMP in the package; `"-"` ends the sequence, the previous image stays shown | H |
| └ `srcX…srcH` | i32 ×4 | — | source rectangle for `LoadSurface` | M |
| └ `delay` | i32 | +0x8 | ticks per image (`DoAni` `0x4B5520`) | H |

### Enemy type (`0x5880B4`, 0x60 bytes)

| Field | Type | Runtime | Meaning | C |
|---|---|---|---|---|
| `hitPoints` | i32 | +0xC (Single) | × (1 + 0.5 · two players); the integer form (+0x1C) is at the same time the points, > 1499 a large explosion sound | H |
| `name` | str | +0x8 | editor name | H |
| `speed` | f32 | +0x10 | px/tick; routes move with cos/sin · speed | H |
| `collidesWithTerrain` | i32 | +0x20 | > 0: test parts against landscape, a hit destroys | H |
| `ramsEnemies` | i32 | +0x24 | > 0: rams other enemies (rectangle inset by value − 1) | H |
| `directionalFrames` | i32 | +0x28 | > 0: one of 8 images by movement direction | H |
| `wreckGroup` | i32 | +0x2C | 1-based group for debris on death | H |
| `deathShockwave` | i32 | +0x30 | shockwave on death, pushes and damages the player | H |
| `armorPassThrough` | i32 | +0x34 | piercing shots pass through armored parts | L |
| `novaImmune` | i32 | +0x38 | not caught by the super nova | H |
| `spawnSpec` | i32 | +0x3C | parts with weapon −1 spit out type `v mod 1000` on route `v \ 1000` | H |
| `solid` | i32 | +0x40 | acts like landscape | H |
| `deathSpawn` | i32 | +0x44 | on death `(v mod 10) + 1` enemies of type `(v mod 1000) \ 10`, route `v \ 1000` | H |
| `hitFlash` | i32 | +0x48 | 0 no flash, 1 the hit part, 2 all parts | H |
| `explosionSpec` | i32 | +0x4C | barrels/mines: enemy damage · 10000 + radius · 10 + (player damage / 10 + 1) | H |
| `boss` | i32 | +0x50 | boss (sets `0x5882A8`, boss death) | H |
| `partDebris` | i32 | +0x54 | destroyed parts fly off as debris | M |
| `noComboReset` | i32 | +0x58 | escaping does not reset the combo multiplier | M |
| `bigDeath` | i32 | +0x5C | long chain explosion | H |
| `parts` | list | +0x0 | parts | H |

Computed at load time: +0x14/+0x18 width/height = max(part offset + image size).

### Enemy part (0x88 bytes)

| Field | Type | Runtime | Meaning | C |
|---|---|---|---|---|
| `alpha`, `blue`, `green`, `red` | f32 | +0x1C, +0x18, +0x14, +0x10 | color/alpha for D3D groups (default 1) | H |
| `vital` | i16 | +0x2C | destruction kills the whole enemy | H |
| `damagesBody` | i16 | +0x24 | hits subtract from the enemy; otherwise its own `hitPoints` | H |
| `hitPoints` | i32 | +0x28 (Single) | own hit points; the integer form the points for the part | H |
| `group` | i32 | +0x38 | sprite group | H |
| `route` | i32 | +0xC | own route, −1000 none | H |
| `hasRoute` | i16 | +0x8 | ≠ 0: run the route every tick relative to the enemy | H |
| `weapon` | i32 | +0x30 | enemy weapon; −1: spit out `spawnSpec` | H |
| `fireMode` | i32 | +0x34 | 0 never, 1–3 random per tick (p = 0.002/0.005/0.02, +0.005 per further player), 4–6 every 25/50/100 ticks, 7 once | H |
| `armored` | i16 | +0x2E | hits without damage | H |
| `rotation` | f32 | +0x20 | degrees; aimed weapons overwrite it every tick | H |
| `x`, `y` | i32 | +0x0, +0x4 (Single) | offset to the enemy | H |

Quirk of the original: the landscape test adds `red` (+0x10) to x (`0x4C21AC`),
presumably a typo — the port carries it over in M8.

### Route (`0x5880BC`, 0xC bytes)

`name`, then commands `op` (i32) with arguments `{a, b}` (each f32). Each argument
is **`Var(a) + Var(b)`**; magnitudes from 32748 on are variables, a negative sign
negates:

| Code | Value | Code | Value |
|---|---|---|---|
| < 32748 | literal | 32762 / 32763 | target player y / x |
| 32748…32755 | locals L7…L0 | 32764 / 32765 | 550 / 800 |
| 32756 | level tick | 32766 / 32767 | −height / −width |
| 32757 | speed | 32768 | hit points |
| 32758 / 32759 | y / x | 32769 | players − 1 |
| 32760 | spawn y (shots: running number) | 32770…32783 | registers R0…R13 (shared with the parts) |
| 32761 | spawn tick | 32784 | player field `+0xA8` (tutorial: control scheme) |

A tick runs commands until one yields: **SetPos, MoveTo\*, Step, Wait** and Goto
without label. The route ends (remove the object) at the end of the list, at
MoveToAndDie on reaching the target, at a route index < 0 and after 10 000
commands without yielding. Assignments to X/Y land in scratch fields and have no
effect; to the player position they do take effect (the zeppelin pulls the player
in).

| Op | Name | Arguments | Effect | C |
|---|---|---|---|---|
| 0 | SetPos | x, y | set, yields | H |
| 1 | MoveToAndDie | x, y | like MoveTo, ends at the target | H |
| 2 | MoveTo | x, y | move there at speed; re-aims when the target uses the player position; snaps in | H |
| 3 | MoveToAccel | x, y, a | like MoveTo, speed += a per tick, ends at speed ≤ 0 | H |
| 4 | Step | dx, dy | shift by one tick | H |
| 5 | Wait | n | n ticks | H |
| 6 | SetSpeed | v | speed | H |
| 7 | SetPartFrame | part, image | hold the image (< 0: animate) | H |
| 8 | Fire | part, weapon | attach weapon to the part; −1: spit out `spawnSpec` | H |
| 9 / 10 | Set / Random | target, v / n | assign / `Int(Rnd · n + 1)` | H |
| 11 / 12 | Label / Goto | id | jump to the first label with this id (searched at runtime) | H |
| 13 / 14 / 15 | If / Else / EndIf | a, cmp, b | cmp −2 `<`, −1 `<=`, 0 `==`, 1 `>=`, 2 `>` | H |
| 16 | IfHitsLandscape | dx, dy | block if the shifted box hits landscape | H |
| 17 / 18 | SetGlobal / GetGlobal | i, v | integers shared by all objects | H |
| 19 / 39 | SpawnAnimL4 / SpawnAnim | anim, x, y (, layer) | effect animation | M |
| 20 / 21 / 28 / 40 | Div / Mul / SetInt / Distance | target, … | arithmetic | H |
| 22 | PolarVec | dx, dy, degrees | cos/sin(degrees) · speed | H |
| 23 | AngleDeg | target, dx, dy | direction of (−dx, −dy) in degrees | H |
| 24 / 25 | SetLayerSpeed / SetLayerScroll | layer, v | scroll speed | M |
| 26 | AddLens | x, y, size, strength, flag | magnifier effect | M |
| 27 | SetPartProp | part, property, v | color/alpha/rotation of a part | M |
| 29 / 30 | PlaySound / StopSound | sound (, loop) | | M |
| 31 | SetRumble | n | shake | L |
| 32 | Nop | | separator | H |
| 33 / 34 | SpawnBigParticle / Lightning | 12 | particle / lightning (34 unused) | M |
| 35 / 36 | For / Next | var, from, to, step | loop | H |
| 37 / 38 | AddBubble / AddFunction | | bubbles / radio message | M |
| 41 / 42 | AddFade / SetSpecial | | darken / tutorial hints | L |
| 43 | SetTarget | player | target player | H |
| 44 | IfPartDestroyed | part | block if the part is destroyed | H |

Block jumps count the nesting (If family 13/16/44 with Else/EndIf, For/Next
separate). The argument count per opcode is fixed in all data; the only exception
is Step with a third, never-read argument 48 times.

`DoRoute` has three callers: enemies (mode 0), enemy parts (1, x/y relative to the
enemy) and enemy shots (2). The port computes in Single (`Math.fround`) like the
original; all 519 routes run tick by tick bit-identical to an independent
reference simulator from the analysis (checksum in the test).

### Timeline: 7 layers (`0x5880D8 + i · 0x14`)

Per layer `scrollSpeed` (f32, px/tick; routes change it) and entries
`tick, kind, p1, p2, p3`. The player (`0x50C9F0`) skips entries with a smaller
tick and runs those with the same one; all layers are sorted. Spawning happens at
the right edge (x = 800). Draw order 0, 1, 2, 5, 4, 3, 6; layer 3 is the
landscape, layer 4 the events.

| Layers | kind | Effect | p1 | p2 | p3 | C |
|---|---|---|---|---|---|---|
| 0–3, 5, 6 | 0 | tile/background object | group | slot/draw order | y | H (p2: L) |
| 0–3, 5, 6 | 1 | effect animation | (editor preview) | anim | y | H |
| 3 | 2, 4, 5, 6 | special object, subtype kind − 2 | parameter | parameter | y | M |
| 3 | 3 / 7 | checkpoint only with one / two players | size | — | y | H |
| 4 | 0 | enemy | type | route | y | H |
| 4 | 1 | sound: p2 0 play, 1 loop, 2 stop | sound | mode | — | M |
| 4 | 2 | radio message | radio index | — | — | H |

118 entries have negative ticks; they fire only if a level begins before tick 0
(`Me.584` starts with `Me.560`, in the port the URL option `from=` with a
negative value; `world.test.ts` "Start before tick 0"). In the game `Me.560`
stays 0, they are placed only by the preroll `SpielPastTicks`.

### Effect animation (`0x588124`, 0x20 bytes)

Multi-track keyframe effects, purely visual (warning signs, lightning, smoke,
fog, ice, wall pieces). `duration` (ticks), `loop`, `scrollWithLayer` (otherwise
screen-fixed), `notes` (occupied in no level, unread at runtime), tracks with
`group` and keyframes: `time`, `x`, `y`, `red…alpha` (0…1), `rotation`
(degrees), `scaleX/Y`, `frame` (−1: animate), `motion` of the segment that ends
here (0 hold, 1 linear, 2 constant speed with snap-in, 3 accelerate), `speed`,
`visible`, `additive`. Key 0 is a preroll guard (mostly a copy of the last key);
on load a guard is added at the end. All **H**; details and the runtime
structures in the analysis note (see below).

### Enemy weapon (`0x5880A4`) and shot type (`0x58809C`)

Weapon: `name`, `turret` (gun turret: the part rotates toward the player, the
muzzle sits at the rotated edge), salvos. A salvo fires `repeat + 1` shots from
`startDelay`, every `interval` ticks (0: all in the same tick — rings). The
emitter counts shots across all salvos; the number is `Var` 32760 of the shot
route (rings: angle = number · 18).

| Salvo field | Meaning | C |
|---|---|---|
| `onRouteEnd`, `spawnWeapon` | 1: at the route end detonate weapon `spawnWeapon` at the shot's center (splinters) | H |
| `cullOffscreen` | remove route shots outside (−w−50…850, −h−50…600) | H |
| `damage` | damage per hit (f32) | H |
| `route` | shot route, −1 straight ahead | H |
| `unblockable` | not intercepted by force and drones | M |
| `shotType` | shot type | H |
| `speed` | speed (f32) | H |
| `aimed` | aim once at player + (28, 31) | H |
| `offsetX/Y` | offset to the muzzle (f32) | H |
| `piercing` | flies on after hitting the player | H |

Shot type: `kind` (0 built-in blinking 16×16 ball, 1 sprite group `group`),
`red/green/blue` (M), `rotate` (rotate into flight direction), `trail` (0, 1
afterimages, 2 glow), hitbox `hitLeft…hitBottom`, `fadeIn`, `sound`,
`ignoreWalls`, `additive`.

### Sound, radio, level values

- **Sound:** `file` in `Sound.d2p`, `extraVoices` simultaneous copies. H
- **Radio:** text under `[id]` in `<radioPrefix><language>.txt` (see
  `dovez-container.md`), `maxPlays` (0 unlimited). `unusedSpeaker` is overwritten
  at runtime, `unusedFlag` is read by none of the three sites that use the radio
  array. H
- **Level values:** `levelLength` (99999 in boss levels, 150 ticks earlier the
  completion is triggered), `waterHeight` (from the bottom edge, 550 = all water),
  `weatherParticles` (rain-like particles, L), `gravity` (debris, particles, some
  shots), water colors top/bottom (M).

## Tools

- **Round-trip:** `bun test packages/formats/test/dovezLevelDat.test.ts`
  (logs the byte split).
- **Debug page `#/dovez/debug/level`:** ←/→ level, ↑/↓ route or weapon,
  M routes ↔ weapons, D command list. Routes start with the type, spawn y and
  speed of the first timeline spawn, as a part route relative to the enemy or as
  a shot route at the emitter (600, 275); the player stands at (100, 275), there
  is no landscape and no hits. Jumps (SetPos) are dashed.
- **Runtime structures** (enemy, shot, emitter and animation instances, death
  states) for M8: [`../measurements/dovez-runtime.md`](../measurements/dovez-runtime.md).
