# DOVE — Bosses, level end, level scripts

Status: **determined statically from `DOVE.exe`** (M3/M4 preparatory work), `objdump -d -M intel`,
image base `0x400000`. Supplements [`dove-events.md`](dove-events.md) and
[`dove-enemies.md`](dove-enemies.md). Confidence *high* unless noted otherwise.
Method names come from the form's VB6 method table.

## Wiring

- **Correction:** vtable `0x7B8` (`0x445430`) is `LeftColision`, not the boss script; `0x7BC` is
  `RightColision`. Both look for the first obstacle in a row (boss, meteors, tiles, enemies) —
  presumably the range of a weapon (*medium*).
- Boss scripts `Endgegner1…10` (vtable `0x800`–`0x820`), called via `DoEndgegner` (`0x46DCE0`, vtable
  `0x824`) once per tick from the main loop (`0x47C181`, after the enemy loop), as long as `Me.39A`
  is set. Jump table `0x46DE30`:

L1 `0x460A20`, L2 `0x4612C0`, L3 `0x461ED0`, L4 `0x463F10`, L5 `0x465790`, L6 `0x462D90`,
L7 `0x466880`, L8 `0x46A4C0`, L10 `0x46B890`; Level 9 has no boss.

- **Boss start** (events at the boss tick, e.g. `0x43F698`): `Me.198 = 0` (background stands still), `Me.39A = True`,
  `Me.3B8 = 0` (init state), `PlayMusik "end1"` (L1, L3, L5) or `"end2"` (L2, L4, L6, L7, L8, L10). For the
  100 ticks before that, the music is faded out. **Level 5 does not set `Me.198` to 0** (`0x440475`) — the
  background keeps scrolling during the boss fight.

### Boss record `Me.3A0`

| Offset | Meaning |
|---|---|
| +0 / +4 | x / y (Long) |
| +8 / +C, +10 / +14 | x/y of part 2 or 3 (−1000 = not present) |
| +18 | state (= `Me.3B8`) |
| +1C … +30 | counters / substates (boss-dependent) |
| +34 / +38 | HP / HP maximum |
| +3C/+40, +44/+48 | HP/max of part 2 or 3 |
| +50 / +54 | frame / enemy type (1-based, record from `Me.42C`) |

`Me.3F8` = drawing allowed. Enemy definition: `Me.42C + (type−1)·0x8410`, within it
+0 l, +4 r, +8 t, +C b; frame f0/f1 as words at +0x83B0 / +0x83DA.
Sine/cosine tables in degrees: `Me.668` / `Me.684` (`0x4A9058`).

### Enemy shots: `AddGegnerS` and `AddEndS`

Both write into the pool `Me.5D8` (51 slots of 40 bytes: type, vx, vy, x, y, active,
rect l/t/r/b).

- `AddGegnerS(art, x, y)` (`0x43C4A0`), honors the option `Me.634`:

| art | shot |
|---|---|
| 1 | aimed bullet (21,85)–(28,92), speed 3, start (x−4, y−4) |
| 2 | fireball (0,136)–(34,150), vx −5, start (x, y−7) |
| 3 | straight bullet, vx −5, vy 0, start (x, y−4) |

E1, E4 and E5 set `Me.634 = 1` around their calls and restore the value afterwards — so their shots
fire even when "enemies shoot: off".
- `AddEndS(typ, x, y, vx, vy, l, t, r, b)` (`0x43C350`) **ignores the option**.
- Per tick `x += vx; y += vy`; removed on a wall hit or x < −w, x > 640, y > 410, y < −h. **Type 4**
  splits on a wall hit into two type-2 bullets at (x−vx, y+1) with (−vx/2, −vx/2) and (−vx/2, +vx/2)
  (`0x481A05`).

### Boss hit test (`CheckColision`, table `0x452154`)

- L1, 4, 5, 6, 10 use the shared test `0x448A3E`: row mask of the current frame (algorithm as
  for enemies) against `Me.3A0`.
- Hit: sparks `Addpartikel` (1, on damage ≥ 3: 10), **result 0** (shot absorbed), `HP −=
  damage`. Damage 500: `HP −= Me.260`, `Me.260 = 0` (special weapon, *medium*).
- **No state test**: the boss swallows shots even during the explosion.
- The player tests with damage 0 → result 0 → **touching a boss part is lethal**.

### Death (common pattern)

Per tick in the dying state: on Rnd < 0.1 `AddCircle` at (x + Rnd·w′, y + Rnd·h′),
radius `Int(Rnd·70)+30` (*medium*); one `AddExplosion` at
(x + Int(Rnd·A), y + Int(Rnd·B)); `Addpartikel` (x, y)–(x+C, y+D). Once,
points **+10000** (L10: +10000·`Me.638`; **L3: none**), then `Me.264 = True`.
The dying state keeps running until the level change.

## The bosses

### Level 1 — E1 "End-Rechts" (type 8, 198×150, 3 frames)

- Start (640, 100), HP 5000.
- State 1: x −= 2 until x ≤ 442, then vy = 1.
- State 2: frame every 5 ticks (0-1-2); y ± 1, reversal at y+vy < −f0 or y+vy+f1 > 410. Every 6 ticks 2 ×
  art 3 at (x, y+28) and (x, y+h−26). HP ≤ 0 → state 4.
- State 4: circles 145×90, explosions 230×100, particles up to (x+290, y+180), +10000, `Me.264`.

### Level 2 — E2 main part + two turrets

| Part | Type | Size | HP | Start | vx |
|---|---|---|---|---|---|
| Main "6 - Endgegner" | 6 | 165×142 | 6000 | (640, 140) | — |
| A "7 - End oben" | 7 | 130×75 | 1500 | (−130, 0) | −3 |
| B "8 - End unten" | 8 | 129×75 | 1500 | (−130, 340) | +2 |

- State 1: main x −= 1 until ≤ 475, both turrets x += 1.
- Turret cycle: timer +1/tick (+2 when main HP ≤ 1000). Timer 1…51: turrets move, reversal at x <
  −50 or x > 505. Timer 52: A fires `AddEndS` type 2 at (A.x+58, A.y+62), vy +4; B at (B.x+58, B.y), vy −4
  (bullet sprite). Timer ≥ 66 → 0. Cycle 66 or 33 ticks. If the timer is odd when switching to +2, the
  52 is skipped until the next reset (*medium*).
- Main part: angle +4°/tick, y = FpI4(sin·70 + 140). Every 200 ticks two rockets (`AddEndS` type 3,
  (0,151)–(42,167), vx −4) at (x+120, y+5) and (x+120, y+118).
- Hit order (`0x449350`): A (if HP > 0), B, main. The main part is vulnerable at all times. When a turret
  dies: overflow −HP (the shot flies on), `AddCircle` + 4 explosions; it is no longer
  drawn.
- Death (state 3): A.y −= 1, B.y += 1 per tick, explosions (w−40)×(h−40), +10000.

### Level 3 — E3 three fish "EndG<-- (16)" (106×96), do not shoot

- HP 4000 each; **the third fish exists only when `Me.638` > 1.1** (`0x462A93`), otherwise HP 0.
- Start x = 640 (fish 3: −106), y = 157.
- x and y run independently on paths in the object `Me.27E8`: at the segment end N = `Int(Rnd·100)+50` steps,
  target `Int(Rnd·640) − w/2` (or `Int(Rnd·410) − h/2`), position = round(p0 + half − half·cos(k·π/N)).
- Positions in `Me.3A0/3A4`, `3A8/3AC`, `3B0/3B4`.
- Hit test `0x44B44F`; a dead fish yields explosions and overflow.
- All HP ≤ 0 → `Me.264`. **No points.**

### Level 4 — E4 "14 - Endgegner" (283×161, HP 10000)

Start (180, −160). State 4 chooses `Int(Rnd·3)+1`:

1. **Ufos:** y runs toward 0 (+2 below 0, otherwise −1). At y = 0, **pattern #100** is written (`Me.40C +
   0xA1B8`, 414 bytes per pattern): (x+112, 128) → (x+112, 200) → 10 random points `(Int(Rnd·584),
   Int(Rnd·378))` → (x+112, −32) → end. On that, 10 × type 13 "kleines Ufo", one every 16 ticks. Then y −= 1
   until y < −170; as soon as no enemies are alive anymore (`Me.45C = −1`, highest occupied slot) → state 4.
2. **Aimed shots:** movement toward (180, 225) at 3/2/1 px depending on distance; then y −= 1/tick and every 11
   ticks art 1 at (x+140, y+80). After 30 shots → state 4.
3. **Beam:** y → 0; x swings ±5 between −100 and 460. After a random delay of 10…99, when the player stands below
   the emitter (x+100 < pX+35 and x+171 > pX): 30 ticks of charging; half-width w grows 0→35 (+1/tick), 30
   ticks of holding, 35→0; beam around x+142, y 161…410. Lethal on horizontal overlap when the ship is alive
   and `Me.15C = 255` (*medium*).

Death: state 5 (explosions 230×110).

### Level 5 — E5 "16 - Endgegner" (239×165, HP 8000)

- Every 255 ticks floor tile #1 (255×25) at (640, 384), vx −1: a scrolling floor.
- Start (640, 100). State 1: x −= 2 until 360.
- State 2: vy ± 2 between 0 and y+h = 384. Every 36 ticks 3 fireballs at (x+82, y+17), (x, y+82), (x+82,
  y+148) — the code uses (b−t)/2, w/2 was probably meant. Phase counter +1 per volley, at 30 → state 5. If
  the counter is negative, an additional cone drops per volley.
- State 5: y −= 10 until y < 0. State 6: y += 10, lands at y = 219.
- State 7: every 51 ticks a **cone** (type 7, 50×109, HP 100000, code −6 with vy 16 → falls 5 px/tick) at
  x = player X, y = −110. After 3 → state 2 with counter −4 (4 more cones in the next volleys).

### Level 6 — E6 "8/9 - Endgegner" (289×185, facing left/right)

- **Phase 1**, HP 4500: fly-in from 640 to x = 320 (2 px/tick), y = 12. Patrol y ± 4 between 0 and
  225. At cooldown 0 and y ≤ pY ≤ y+160: 9 ticks of wind-up, sound, **dash to the left at 14 px/tick** until x
  ≤ −212, then back to exactly 320 at +7. New cooldown `Int(Rnd·90)+10`.
- HP ≤ 0: dash with explosions, `Me.15C = 0` (player invulnerable); at x ≤ −200 → **phase 2**, HP 1200:
  fast fly-throughs at 15 px/tick at a random height (0…225), right→left (type 8), after 40 ticks
  left→right (type 9), rarely an aimed shot (Rnd < 0.002); sets `Me.15C =
  255` in the first 40 ticks.
- If phase 2 dies off-screen → **phase 3** = phase 1 again (HP 4500, flag +24 = 1); its death →
  state 4, +10000. Total HP 10200.

### Level 7 — E7 scanner/mirror boss (*medium*)

Types 10/11 (170×90), type 12 "Option" (38×39).

- **State 1** (551 ticks, score frozen): scan animation. At tick 199, ten stationary extras
  (`AddExtra2`): art 1/2/3 at x 400/450/500 × y 100/200/300 plus art 0 at (550, 200). Texts "Scaning
  DOVE", option count, beam type (Normal/Blue/Green/Red/Beam from `Me.540`/`Me.544`). At tick 441, all
  extras are removed, text "Scaning successfull".
- Then HP 3000, x = 700, y = 157; fly-in until x = 470. Attack state = 3 + scanned weapon:

| State | Weapon | Attack |
|---|---|---|
| 3 | Normal | bullet vx −6 every 10 ticks |
| 4 | Blue | every 30 ticks, plus a charged beam |
| 5 | Green | every 50 ticks, 4 falling tiles |
| 6 | Red | 5 shots every 15 ticks |
| 7 | Beam | charge at 100, lethal beam |

- Random movement (±3 for 5…54 ticks) within x 100/300…500, y −20…340.
- If the player has options (`Me.54C`), the boss gets 1–2 options on radius 150 (+3°/tick). They
  absorb shots without damage (`0x44DD95`).
- HP ≤ 0: `Me.15C = 100`, retreat x += 2 until 700, new scan. **Victory only on the
  2nd kill (factor < 1.1) or the 3rd (factor > 1.1)** (`0x469C84`). Victory → +10000, `Me.264`.

### Level 8 — E8 core "21 - real Endgegner" (108×154, HP 15000) + shell "20 - Endgegner" (182×216)

- Start (640, 315). State 1: x −= 5 until 535.
- State 2 (1000 ticks): y = FpI4(cos(a1)·187 + 128), a1 += 4°; x = FpI4(cos(a2)·100 + 435), a2 += 3°. Every
  4 ticks a **mine** (type 22, 18×20, HP 100, vx −7) at (x, y+72).
- State 3: core parks at (533, 128); the shell glides from x = −190 at +3 to 441 (y = 95).
- State 4 (~1020 ticks, **suction**): player X += (c−30)\10 for c < 100, then +7, +8 from 650, +9 from 700; active
  for c = 31…949. Particle streams from the shell; the core follows pY−66 at 10 px/tick with ±9 cos wobble.
- State 5: shell retracts (−8/tick), back to state 2.
- The shell is invulnerable and swallows shots (`0x44F726`).
- Death: state 6, +10000, the shell sinks (y + 1/tick).

### Level 10 — E10 "1" (330×302, HP 19020) (*medium*)

- Fly-in x −= 2 until 310, y = 54; every 20 ticks an aimed shot.
- State 2 (180 ticks): x = 260 + 50·sin(a); y = 54 + 151·sin(b) for one period, then 54. Every 20 ticks
  an aimed shot + fireball.
- State 3: vy ± 1 (upper bound 205 only). When pY is in one of three cannon bands (y+13…63, y+121…189,
  y+247…289) → state 4.
- State 4: c = 40 sound; c = 41…150 three lethal horizontal beams that grow 10 px/tick to the left;
  c = 200 three rockets (vx −4) → state 5.
- State 5: x += 1 until 700; **4 pursuing "2"** (46×49, HP 500, code −2) from the corners.
- State 6: wait for `Me.45C = −1` → state 1.
- Death: +10000·factor.

## Level end (`0x4716CF`–`0x471D6C`)

As long as `Me.264` is set and the ship is alive (`Me.644 = 0`), autopilot with
a local counter E:

- E = 0: `BeamAbschuss` (the charged beam fires), `Me.15C = 0` (255 ticks invulnerable), sound 13 off.
- E < 30: E += 1 (30-tick pause).
- After that pY → 195 with ±6/4/2/1 (lower thresholds 110/170/190, upper 300/220/200), tilt `Me.14C` 2 or 1.
- At pY = 195: sound 2 with random pan, then **pX += 9/tick until pX > 710** → `Me.690 = 3` ends the
  main loop. The keyboard is decoupled (*medium*).
- **No bonus points.**

After the loop (`0x48EDAF`):

- Tutorial (Level 0) → `Me.690 = 1`, back to the menu (*medium*). `Me.634 > 2` → 2.
- `Me.690 = 3`, `Data\level(n+1).dat` exists and n < 10: `Me.39A = 0`, `Me.530 = 0`, `F4 = 0`, level +=
  1; at `Me.2FC = 0` and `Me.638` > 1.0, the level is **unlocked** in the level select (`Me.2F0(n) =
  True`, `SaveData`). Then `LevelLaden`, `PlayMusik "S"&n`, `Get_Ready`.
- Otherwise: after Level 10 `HighScore` + **`ShowOutro`**; after Level 11 the run ends (`Me.690 = 2`).

Order 1 → 2 → … → 10. Level 11 is reachable only separately. Names from
`Get_Ready` (`0x45D934`):

0 Tutorial, 1 Lost In Space, 2 Factory, 3 Deep Blue See, 4 Back in Space, 5 Crystal Cave, 6 Speed,
7 The Unreal World, 8 DOVE INSIDE, 9 Final Level, 10 Final Fight, 11 ExtraLevel.

A level end without a boss sets `Me.264 = True` and `Me.15C = 0` (`0x441CB0`):
L0 at tick 4500, L11 at 7300, L9 at 8000 (factor < 1.1) otherwise 15600.

## Level scripts (events `0x43D6B0`, table `0x445400`)

### Level 0 — Tutorial

Language per `Me.350` (set = German). Keys are inserted
(uppercasing via a runtime function, *medium*).

| Tick | German | English |
|---|---|---|
| 0 | So, und los geht's! Du steuerst mit den Pfeiltasten oder dem Zifferblock | OK, let's go! You navigate the spaceship with the arrow keys or the key pad. |
| 50 | Uh, da kommt ein Gegner! Du schießt mit S! Mach ihn fertig! | Oh, an enemy is coming! You fire with S! Blow him away! |
| 420 (Erfolg) | Gut gemacht! | yeah! you made it! |
| 420 (Fehlschlag) | Ok, wir versuchen es nochmal! Drücke S zum schießen! | OK, try again! In order to fire press S. |
| 500 | Da sind zwei Extras! Sammel sie ein! | There're two Specials! Take them! |
| 1250 | OK, mit D kannst du deine Extrawaffe nach hinten ausrichten! Probier' es aus! Nur einmal drücken! | OK, press D to put your special weapon on the back! Try it! Press only once! |
| 1300 | Hast du gesehen, wie sich der Balken in deiner Anzeige bewegt hat? | Great! Did your see the bar on the screen move? |
| 1500 | Uh, hier sind Wände, nicht anstoßen! Sie können die DOVE zerstören! | Be careful, contacting the walls can destroy your spaceship! |
| 1800 | Du kannst Q oder F drücken um langsamer zu fliegen. | Press Q or F  to slow down. |
| 2200 | Mit W oder G Kannst du wieder schnell werden | Press W or G to speed up. |
| 2650 | Nun lade mit A deinen Beam komplett auf | Hold key A down to fill up your BigShot device completely. |
| 2800 | warte bis drei Beißer auf dem Bildschirm sind und lass dann A los | Wait for tree biter to enter the scenery, then take off from key A. |
| 3400 | Neben den zwei extraarten die du schon kennst gibt es noch zwei weitere | Besides these two special device, you learned about, there are two more. |
| 3800 | die bombe (das obere extra) und das schild, das schüsse der Gegner abwehrt | The bomb (the upper special) and the shield, that protects you from shots. |
| 4200 | So das war schon alles was man wissen muss! Viel Spaß und nicht verzweifeln! | OK, that's all you have to know to play the game! Have fun, and don't despair! |

The texts are at `0x40D8DC`–`0x40E6DC` (typos as in the original).
At ticks 2, 1200 and 2600 the text is cleared (*medium*).

Locks and back-jumps (direction of the conditions *medium*):

- 420: score = 0 → failure text and F4 := 50.
- 501…1180: as soon as `Me.54C = 1`, `Me.540 = 3`, `Me.544 = 0` → F4 := 1200. At 1181: reset weapons, F4
  := 500.
- 1251…1298: waits for `Me.25C` (special weapon pointed backward); at 1299 F4 := 1201.
- 1450: sets the weapon state.
- 2651…2798: F4 := 2800 as soon as `Me.354 = 200` (beam full); at 2799 F4 := 2651.
- 4500: level end.

### Level 1–11

Without their own script except fade + boss: L2 (boss 7850), L4 (8000), L10 (fade 650–749, boss 750). L1:
warp intro and meteors (see [`dove-events.md`](dove-events.md)), fade 6750–6849, boss 6850. L3 boss 8710,
L5 7500, L6 8000, L7 8100, L8 10300 (fade from 10200). L9: end conditions only; L11: end at 7300.

**Level 3:**

- Each tick, on Rnd < 0.002, a decoration object in the pool `Me.388` (6 slots, surface `Me.6A8`) at x =
  `Int(Rnd·940) − 150`, y = 410. Rises 1 px/tick with an x oscillation of 10·sin(t/10), removed at y < −179
  (*medium*).
- **Falling ceilings** (`0x43F985` ff.):

| Tick | Action |
|---|---|
| 4250 | tile slot 8: vy = 4, 2 × 50 particles |
| 4317 | slot 8: vy = 0, 100 particles |
| 5680 | slot 0: vy = 4 |
| 5690 | slot 8: vy = 4 |
| 5717 | slot 0: vy = 0 |
| 5765 | slot 8: vy = 0 |

**The code accesses fixed pool slots 0 and 8 of `Me.58C`** — the port must replicate the tile slot
assignment exactly.

**Level 5** (runs after the token loop, `0x444C71`, **also during the boss fight**):

- 2136: remembers the "riesen Pflanze" just spawned (`Me.64C = Me.458 − 1`) and tracks its position.
  If it disappears before tick 2835: 400 particles, wobble `Me.170 = 20`, 10 explosions on 217×136.
- 3949: remembers "Wand" and tile #2 (slot = `Me.598 − 1`). Once the wall is gone: wobble 5, then tile y +=
  1/tick until y = 155, then sound and wobble 10.

**Level 6** (warp):

- `Me.198 = 9.0` at ticks 0, 1882, 3000, 5122, 7800, 7900 (checkpoints and re-setting). At 1882 additionally:
  if `Me.348` is set, player Y = 60.
- Every 25 ticks before 7900: tile #1 "H-Oben" at (640, 0), vx −10 (fast ceiling). At 3400 and 6100 this
  tile gets vy = 2, plus sound and wobble 5.
- 1840 and 2350: tile #10 at (640, 44), vx −10.
- 1887: tile slot 0 deactivated (hint reset), 50 particles, 7 explosions, sound.
- 4700: tile #15 at (455, 128), vx −1, vy −1; `Me.64C = Me.598`. 4785: vy of this slot = 0, particles,
  wobble 5. **Off-by-one in the original**: `Me.598` is slot + 1 (`0x43BE44`), so the wrong slot is
  hit.
- 7981–7999: `Me.198 = (8000 − F4) \ 2`.

**Level 7:** `AddBand(x = 640, y = pY−25, w = 100, h = 70, speed 7)` at ticks 0,
1600, 2000, 2300, 2600, 2800, 3000, 4000, 5300, 6000, 7000, 7500. The band runs
at −7/tick as long as x > 100. When it overlaps the ship, the ship's
speed `Me.184` drops by 1 per tick, plus the text "Benutze W oder G um
wieder schneller zu fliegen" / "USE W or G to fly faster again" (`0x487146`).

**Level 8:** `AddWind(strength, x = 640, width)`; the zones scroll at 1 px/tick.
If pX+20 lies within a zone, `pY += strength` applies, provided the result stays in 0…410
(`0x439B5F`). Pool `Me.620`, 4 slots.

| Tick | Strength | Width |
|---|---|---|
| 4355 | 2 | 143 |
| 4608 | 2 | 286 |
| 4894 | −2 | 143 |
| 5037 | 2 | 286 |
| 8091 | 2 | 143 |
| 8234 | −2 | 143 |
| 8377 | 2 | 143 |
| 8520 | −2 | 143 |
| 8663 | 4 | 286 |
| 8806 | 2 | 143 |

The fan enemies at 4751, 5179 and 8666 have no wind (8666 versus 8663:
3-tick offset).

## Meteor pool `Me.214`

- Spawns only in Level 1 (`0x43F459`), 11 slots.
- Record 28 bytes: +0 x, +4 y, +8 HP 150, +C vx −4, +10 vy = `Int(Rnd·3) − 1` (re-rolled until (vx, vy)
  ≠ 0), +14 active, +18 points 150.
- Per tick `x += vx; y += vy`; removed at x > 639, x < −60, y < −60, y > 410 (`0x476C90`). Drawn
  60×60 from surface `Me.6AC`, no animation.
- Hit test in `CheckColision` at `0x4509FA`, after the boss and before the enemies, with round
  row masks `Me.7D0` / `Me.7EC`. Hit: `HP −= damage`.
- Death: points += `Int(150 · factor)` (also during the boss fight), particles, circle, sound with pan `Int(Rnd·101) −
  50`.
- Contact kills the player (damage-0 rule).

## Open

- Curtain transition B1–B5 not found; in the transition only `Get_Ready` and `FastFadeOut` seen.
- Argument order of `AddCircle`; first argument of `Addpartikel` (count or art).
- Exact beam hitboxes of E4, E7 and E10 (*medium*).
- E7: fully decode the Blue/Green/Red attacks and the Green tile trick (they hang off the weapon system).
- Meaning of `Me.348` (L6, tick 1882) and `Me.2FC` (suppresses the unlock; presumably a cheat or the
  level select).
- E10 state 3 has only an upper y bound; the boss could drift upward indefinitely (*low*).
- Unused records: L1 "End-Links" / "kleiner Endgegner" and L3 "EndG--> (17)" appear neither in the boss code
  nor in events.
- Tutorial: tick 1 (comparison via `__vbaVarCmpEq`) not interpreted (*low*).
