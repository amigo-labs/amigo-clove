# DOVE — Weapons, extras, beam, options, shield

Status: **determined statically from `DOVE.exe`** (M4). Confidence *high* unless
noted otherwise. Form vtable `0x4088F4`; field names as `Me.[offset]`.
Supplements [`dove-player.md`](dove-player.md) and [`dove-enemies.md`](dove-enemies.md).
Operand convention of the VB helpers (`__vbaVarSub/Add/Cmp*`): the operand pushed
**first** is the left one (verified against `X − speed`).

## Corrections

- **Color assignment:** art 1 = **blue** ("Konzentrierter Twinlaser", continuous
  laser), art 2 = **green** ("Reflektionsbälle"), art 3 = **red** ("Streulaser", fan).
  Evidence: the extra sprites at atlas x 100/125/150 are blue/green/red, as are
  the HUD icons; the laser plays `blue.wav` (index 13), the fan `red.wav` (14);
  this agrees with the help. The guess in the level docs (1 red, 3 blue) is
  swapped.
- **Fields:**

| Field | Meaning |
|---|---|
| `Me.[0x540]` | color 0 none, 1 blue, 2 green, 3 red |
| `Me.[0x544]` | level 0…2 |
| `Me.[0x548]` | laser active (cleared each tick before `Keyboard`, `0x4716BC`) |
| `Me.[0x54C]` | number of options 0…2 |
| `Me.[0x550]` | bombs available |
| `Me.[0x25C]` / `Me.[0x25E]` | orientation 0…80 / direction ±1 |
| `Me.[0x352]` | **beam in flight** (not an option) |
| `Me.[0x354]` | beam charge 0…200 |
| `Me.[0x358]`/`[0x35C]` | beam x/y; rect `[0x360…0x36C]`; damage `[0x370]`; stops at walls `[0x374]` |
| `Me.[0x260]` | beam budget against bosses (1500) |
| `Me.[0x394]` | shield timer |
| `Me.[0x642]` | option "equipment loss" |
| `Me.[0x12C](0…3)` | shot timers: base, bomb, green, red |

## Sounds

Load list `0x4335D2` (index → file):

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Normal | Explosion | Antrieb | Jingle | Beam1 | Beam2 | charge | Yesjo | Fertig | End1 |

| 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|
| End2 | getready | IceExplosion | blue | red | green | End3 | Yesjo2 | fertig2 |

## Picking up extras (`0x476162`–`0x476B61`)

Per tick and slot (13 slots): x += vx; animation (counter > 5 → frame + 1,
wrap after the last); **pickup test** (inclusive, `0x476299`–`0x4763ED`):
`X+40 ≥ ex ∧ X ≤ ex+20 ∧ Y+22 ≥ ey ∧ Y ≤ ey+21 ∧ not dead (Me.[0x644])`;
then removal at x > 639, x < −25, y < −25, y > 410; drawing
(ax, 25f)–(ax+25, 25f+25).

On pickup: slot freed, `score = Int(score + 300 · Me.[0x638])`, sound 3.

| art | Effect |
|---|---|
| −2 | shield: `Me.[0x394] = 500` (set, not added) |
| −1 | bombs: `Me.[0x550] = True` (permanent, unlimited) |
| 0 | option: `Me.[0x54C] += 1`, max 2 |
| 1…3 | `If Me.540 ≠ art Then Me.544 = −1`; `Me.540 = art`; `Me.544 += 1`, max 2 |

Same color = level up (0→1→2), different color = level 0.

## Orientation (pod)

- `Me.[0x25C]`: 80 = front, 0 = rear. On every (re)start 80, direction +1
  (`0x46E79A`). Per tick pos += dir, clamped to 0…80 (`0x475F0E`); while
  0 < pos < 80 a cosmetic particle line at X + pos\2.
- **D** (edge, latch `Me.[0x1E0]`; joystick bits 4/8) reverses dir. The
  condition at `0x43AB72` is always true — so D always flips. Transition: 80 ticks.
- **Color weapons fire only at pos = 0 or 80** (`0x43514A`). The base shot
  always fires forward.
- Rear-mounted weapons are stronger (laser 2 instead of 1 per row, green L+19
  instead of L+4, red additionally one straight 40-damage shot).

## `AddSchuss` (`0x43CB00`)

`AddSchuss(typ, x, y, vx, vy, p6, schaden)`; stored as (x−vx, y−vy), the
shot loop adds in the same tick. Record 32 bytes: [0] type, [4] p6,
[8] damage (Integer), [0xC] vx, [0x10] vy, [0x14] x, [0x18] y, [0x1C] active.
Pool 1000, free hint `Me.[0x5C0]`, highest slot `Me.[0x5C4]`.
Timer: fire when `timer < F4`, then `timer = F4 + N` → every N+1 ticks.

## Weapons (`NEUERSCHUSS` `0x435110`, only while fire is held)

| Weapon | Type | Start | v | Damage | Tick | Sound |
|---|---|---|---|---|---|---|
| Base | 0 | (X+40, Y+7) | (9, 0) | 20 | 6 | 0 |
| Bomb | 1 | (X+15, Y+22) | see below | 70 | 13 | — |
| green front | 2 | (X+40, Y+4−5L) | (10, 0) | L+4 | 5 | 15 |
| green rear | 2 | (X−20, Y+4−5L) | (−10, 0) | L+19 | 5 | 15 |
| red front | 3 | (X+40, Y+7) | (9−\|i\|, i) | 15 | 13 | 14 |
| red rear | 3 | (X−10, Y+7) | (−(9−\|i\|), i) | 15 | 13 | 14 |
| red rear, straight | 3 | (X−10, Y+7) | (−9, 0) | 40 | 13 | — |

### Blue — Twinlaser (color 1)

NEUERSCHUSS only sets `Me.[0x548] = True`; processing after the shot loop
(`0x47F65D`):

- Rows: for i = −L…L, j = 0…1 one 1-px row each at y = Y+4+i+13j — two
  beams (Y+4, Y+17), each 2L+1 px thick.
- **Front** (pos 80): x = X+42 up to `r = RightColision(X+20, row)` — the next
  left edge in this row of a meteor, tile, boss or enemy (row contour),
  otherwise 640. Hit `HitTest(r, row, 1, 1, damage 1)`.
- **Rear** (pos 0): `LeftColision(X+20, row)` … X−2;
  `HitTest(l−1, row, 1, 1, damage 2)`.
- Particles on hit; sound 13 runs in a loop while active.
- Colors: outermost rows (|i| = L) `Me.[0x1550]`, |i| = L−1 `Me.[0x1560]`,
  otherwise `Me.[0x1540]` (values not found). With F1 "Lasertranzparenz" the
  pixels are OR-ed into the blue channel.

### Green — Reflektionsbälle (color 2)

- Size p6 = L+1. Sprite/box by size (jump table `0x4903F1`):

| Size | ss.spr | Box |
|---|---|---|
| 0 | (34,70)–(41,77) | 7×7 |
| 1 | (21,70)–(34,83) | 13×13 |
| 2 | (0,70)–(21,90) | 21×20 |
| 3 | (50,61)–(82,92) | 32×31 |

- Movement (`0x47DBE1`): x += vx, y += vy; removed at x > 639, x < −w,
  y − h > 410 (sic), y < −h. **No** bouncing off the screen edge.
- Hit (`HitTest(x, y, w, h, damage) ≥ 0`, walls too): particles; at
  size s > 0 two children at the parent ball's position, size s−1, damage
  2s+8; vy = 0 → (−vx, +9) and (−vx, −9), otherwise (−vx, vy) and (vx, −vy). The
  parent ball is always removed. Children land in the first free slot; slots
  > i still run in the same tick.

### Red — Streulaser (color 3)

- `For i = −(3L+2) To 3L+2 Step 2`: L0 3, L1 6, L2 9 shots (vx 1…9, vy up to ±8).
- Movement x += vx, y += vy; sprite (0,90)–(7,97), box 7×7; removed at
  x > 639, x < −7, y > 403, y < −7.
- Collision like the base shot: −1 nothing, 0 gone, > 0 damage = remainder, flies on.

### Bombs (type 1)

- Stored vy 5, but the movement is **y += 8 constant** (`0x47D201`);
  first draw point y = Y+25. x stays fixed to the screen — falls vertically,
  does not follow the terrain.
- Removed at y > 404; sprite (0,57)–(7,63), box (x, y, 8, 6); 0 → gone,
  > 0 → flies on with the remainder. Independent of the orientation.

## Beam

### Charging (`Keyboard` `0x43A919`)

A (joystick button 1) held and no beam in flight: `Me.[0x354] += 1`/tick,
max 200. Sound 6 every 10 units (parameter 10c+5000, not at 200); at
199 with 9990. Charge effect (pool `Me.[0x4A8]`, c\10 rings) cosmetic (*open*).

### Firing (`BeamAbschuss` `0x4392F0`)

Runs in every tick in which A is not held or a beam is in flight, and on
fire with charge > 0 — **S during charging fires the beam**. Stops the
charge sound, then charge = 0:

| Charge | Effect |
|---|---|
| 0 | nothing |
| 1–9 | one NEUERSCHUSS (normal salvo) |
| 10–75 | (36,183)–(52,195), 16×12, at (X+40, Y+6); damage c+15 |
| 76–125 | (0,183)–(35,197), 35×14, at (X+40, Y+5); damage c+30 |
| 126–199 | (0,168)–(67,182), 67×14, at (X+40, Y+5); damage c+50 |
| 200 | (70,136)–(158,200), 88×64, at (X+40, Y−20); 500/tick, **penetrating**; sound 4; immediately `HitTest(Box, 1500)` |

Levels 10–199: sound 5. Every beam sets `Me.[0x352] = True`, `Me.[0x260] = 1500`.

### Flight (`0x485E0D`)

- x += 10/tick, y fixed; removed at x ≥ 640. Each tick `HitTest(x, y, w, h, damage)`.
- Partial beams: remainder > 0 → damage = remainder; 0 → beam ends. Walls yield 0 —
  partial beams end at walls. The full beam ignores the result.
- Bosses (`0x44BE49`): a hit with damage 500 subtracts from `Me.[0x260]` and
  sets it to 0 — together with the triggering hit (1500), the full beam does a boss
  **1500 in total**.
- A beam in flight clears enemy shots **only of kind 1** (aimed bullets)
  on inclusive AABB overlap, `score += Int(10 · factor)` each (`0x48207B`).
  Fireballs remain.
- No cooldown except: no charging while a beam is in flight.

## Options (`0x48492A`)

Skipped with an active shield or a dead ship.

- Angle a += 5°/tick mod 360 (72 ticks per revolution), local, 0 on every
  (re)start. Tables `Me.[0x684]` = cos, `Me.[0x668]` = sin (`0x4A9058`).
- Option 1: x = X+17+40·cos a (Double), y = FpI4(Y+10+30·sin a); option 2
  (count ≥ 2): x = X+17−40·cos a, y = FpI4(Y+10−30·sin a). Ellipse 40×30,
  clockwise on screen.
- Sprite (0,48)–(9,57), 9×9, always drawn.
- Absorbs enemy shots of **kind 1** that overlap the 9×9 box inclusively:
  removed, `score += Int(10 · factor)`. The loop does not check the shot's active
  flag (*medium*, see Open).
- Contact: `HitTest(ox, oy, 9, 9, damage 30)` each tick, particles on hit.
  Indestructible.

## Shield (`0x483893`)

- While `Me.[0x394] > 0` and the ship is alive; replaces the options.
- Per tick: timer − 1; angle += min(17, timer + 5).
- Four satellites (ellipse and sprite like the options): at a (±) and a+90 (±).
  Drawn when timer > 90 or timer mod 3 = 1 (blinking in the last 90 ticks).
- Absorb **all** kinds of enemy shots (+Int(10 · factor), same active-flag
  quirk); 30 damage/tick each.
- Player ↔ enemy shot requires `Me.[0x394] = 0` (`0x482458`): 500 ticks immune
  to shots. Collision with enemies and walls is **not** prevented.
- Cleared on every (re)start (`0x46FAC6`).

## Death and equipment loss (`0x48F438`)

- Death counter reaches 205: if `Me.[0x642]` is set (default **on** per the
  help) → bomb = False, color = 0, level = 0, options = 0.
- Always (restart path `0x46E49E`): beam and charge cleared (`0x46E6EB`),
  orientation 80 / dir +1, shield 0, laser flag 0, orbit angle 0, timers
  `Me.[0x12C]` reset (`0x46F3FB`).
- New game (`0x46E398`) resets everything.

## HUD (`0x48C0FA`–`0x48CC2E`)

All sprites from `ss.spr`, BltFast with color key.

| Element | Source | Target |
|---|---|---|
| Option 1 / 2 | (50,20)–(71,40) | (465, 425) / (346, 425) |
| Bomb | (71,20)–(92,40) | (465, 457) |
| Color (L+1 times, i = 0…L) | 1 (50,0)–(71,20), 2 (71,0)–(92,20), 3 (50,40)–(71,60) | (385+21i, 457) |
| Orientation | (94,0)–(100,37) | (373+pos, 415) |
| Beam bar | color fill | (520,413)–(520+c\2, 423) |

Beam bar in RGB(c+20, 0, 0); at c = 200 it blinks RGB(255,128,128) in 5 of
10 ticks (*medium*: RGB helper method `0x720`). `konsole.spr` rows
386/394/402 are not read by the weapon code.

## Shot loop (`0x47C89D`–`0x47F650`)

- `For i = 0 To Me.[0x5C4]`, jump table `0x4903E1` by type:
  0 → `0x47C932`, 1 → `0x47D1FA`, 2 → `0x47DA7D`, 3 → `0x47ECDB`.
- On freeing: update the hint `Me.[0x5C0]`; if i was the highest slot,
  recompute `Me.[0x5C4]`.
- Collision `CheckColision(&x, &y, w, h, &Schaden, &Ergebnis)`, boxes per type
  as above.

## Order in the tick (*medium*)

Clear laser flag → `Keyboard` → … → charge effect → orientation → extras →
tiles → enemies → player shots → laser → enemy shots → shield/options →
beam → particles → HUD.

## Open

- Laser colors `Me.[0x1540…0x1560]`: values not found.
- Charge effect (`Me.[0x4A8]`) not analyzed.
- The level 0 script (`0x43E02D`–`0x43E4CF`) overwrites weapons (once color,
  level, options = 0; once options 1, color 3, level 0) — exact ticks open.
- Shield/options without an active check: inactive slots ≤ `Me.[0x5E8]` with a
  stale position could be "absorbed" again and award points — verify against the
  original before the port adopts this (*medium*).
