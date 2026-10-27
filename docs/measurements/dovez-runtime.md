# DoveZ — Runtime structures (static, from `DoveZ.exe`)

As of: M8. Source: UPX-unpacked `DoveZ.exe`, `objdump -d -M intel`,
image base `0x400000`; methods and format findings in
[`../formats/dovez-level-dat.md`](../formats/dovez-level-dat.md). Nothing here is
measured against the running original. Confidence *high* unless noted otherwise.
Implementation: `packages/game-dovez/src/sim/` (`world.ts` tick, `layers.ts`,
`anims.ts`, `enemies.ts`, `enemyFire.ts`, `player.ts`, `playerShots.ts`,
`weapons.ts`, `companions.ts`, `beam.ts`, `effects.ts`, `radio.ts`,
`snapshot.ts`, `environment.ts`/`special.ts` environment), audio in
`src/audio/DovezAudio.ts`, backbuffer in `src/render/Compositor.ts`.

**Method names:** The name list in the VB object header is not in
vtable order. Up to about `LadeDaten` it matches; after that the real name is
`names[Index + 3]` (vtable offset `0x6E0 + 4·Index`), from offset `0x940` on `+5`,
and in the range of the `Taste*` methods `+10`. Functions are therefore identified
by their contents; the addresses named here were checked that way.

## Main loop `SpielLoop` (`0x53D170`)

**Tick 16 ms (62.5 Hz):** Every pass ends with `Wait(16 + Me.1C8)`
(`0x53F772`), and `Me.1C8` is always 0. The clock is `GetTickCount`. If the loop
falls more than one tick behind and the last tick was drawn, the next one runs
without drawing (at most one in a row); if it is still behind afterwards, the
schedule is set to "now" — lost time is never made up. *(The port uses
`FixedStepLoop` with up to 5 ticks of catch-up; it diverges only under load spikes.)*

Order per tick ("Nova" = Super-Nova is running, `Me.D6C`; then the timeline,
layers, input, shots, power-ups, emitters, enemy shots, weather and contact rest
— enemies, particles, force and HUD still run). The eleven checks each test
`Me.D6C` at their own place; the Nova switches on mid-tick in step 9 (section
"Super-Nova"):

1. Poll input; `SpielObjektAnimationen` (DoAni for each group, global frame
   counter of the tiles).
2. except in the Nova: music fade; timeline (`0x50C9F0`), at the end `Me.584 += 1`
   and level-end checks. Enemies that spawn in tick T still move in T.
3. Background (`SpielMoveHintergrund` `0x50D490`, also in the Nova).
4. except in the Nova: layer 0 with its animations, `SpielSpezial(0)`, layers 1, 2,
   5 each with their animations; checkpoint;
   player input and movement (`SpielKeysDove` `0x507DB0`).
5. Particles; drones; except in the Nova: firing (`SpielSchieß` `0x4E2C20`),
   player shots layer 0; sparks 0; except in the Nova: power-ups.
6. draw the ship (`SpielMoveDove` `0x509110`), **enemies** (`0x4B5850`, also
   during the Nova), bubbles.
7. except in the Nova: animations of layer 4, **layer 3 (landscape, drawn over
   enemies and ship)**.
8. except in the Nova: player shots layer 1, animations 3, emitters, beam.
9. **Super-Nova** (`SpielNova` `0x52A230`, every tick), particles; except in the
   Nova: **enemy shots**; satellites, score popups, horn.
10. except in the Nova: rain, checkpoint, **layer 6** with its animations, water,
    snow/clouds/rain veil; `SpielSpezial(1)` (checks the Nova itself).
11. screen shake; except in the Nova: **contact** (`SpielFeindberührung` `0x50B710`);
    overlays with noise; except in the Nova: fade-out in the last 50 ticks; HUD.
12. Last, also in the Nova: ticker (`0x50FCC0`), `0x4D0D80` and
    the **vibration** (`0x5299B0`, `SpielLoop` `0x53F614`), see "Vibration".

Draw order of the layers is therefore 0, 1, 2, 5, [ship, enemies], 4, 3, 6.

## Level start, pre-roll, level end

- `Me.584 = Me.560`; `Me.560` is 0, except with the command line `-Tick N`
  (the URL option `from=` in the port).
- **Pre-roll** `SpielPastTicks` (`0x50D230`): for each layer with speed ≠ 0,
  ticks `T − Int(900 / speed) … T − 1` are run through; tiles (kind 0) are placed
  at `x = 800 − Int(age · speed)`, always with slot mode 0. This explains the
  **118 entries with a negative tick**: 117 are pre-placed tiles, and one kind-1
  entry never fires.
- `Me.584 = Me.588 − 150`: the players' exit flight; `Me.588`: level cleared.
  Boss levels (length 99999) end via the boss's death: at state timer 520 it sets
  `Me.584 = Me.588 − 151`.
- A restart after death restores a world snapshot from the checkpoint, but only
  for layers 1–6 — layer 0 is missing afterwards until a new entry arrives.
  *(Not yet in the port: death restarts the level.)*

## Layers, tiles, background

Tile pools per layer are 11 / 51 / 21 / 101 / – / 21 / 16 slots, a tile is 0x18
bytes: x, y, group, vx = −speed at spawn, vy, active. `AddLandschaft(Ebene, Gruppe,
y, x, slot)` (`0x4EA200`): x = scrollPos + 800; `slot` 0 is the first free one,
n > 0 goes from highWater + n on (above all existing ones). Each tick
`scrollPos = frac(scrollPos − speed)`, tiles x += vx, removed only once fully off
the left edge. Route op 24 changes only future tiles, op 25 the existing ones as
well. Tiles animate via the **global** frame counter of their group.

Background (`Me.7CC`): the image (the `background` field is a file name) is tiled
with period 800 and scrolls with layer 0; numbers select procedural variants
(section "Backgrounds").

## Backgrounds (`SpielMoveHintergrund` `0x50D490`, `environment.ts`)

**The backbuffer is never cleared** (no clear in `RenderStart`/`Flip`);
each variant paints over the previous image either wholly or only with a veil. The
port reproduces this with a persistent render texture that every frame draws into
without clearing (`Compositor.ts`); drawing happens only after a new tick. Jump
table via `Me.7CC + 2`, stars/spots in `Me.10C0` (101 × 0x1C, saved at the
checkpoint; `Me.10CC` lays them out anew):

| Mode | Level | Image | `Rnd` |
|---|---|---|---|
| 1 image | most | black, image at `CLng(x)` and `CLng(x + 800)` (once when x = 0) | – |
| 2 star field | 2-x, Bonus, Epilog | black; 10 `feuer0` nebulae (α 0.15, color from the wall clock `GetTickCount`) into the corner 64 × 64, captured via `blur`, bilinear onto 800 × 600; 101 star trails (`balken`, 2 px, fading out to the right, speed 0.1…10.1) | 303 at layout, 1 per wrapping star |
| 3 ice | 6-1, 6-2 | just a veil (0.6/0.6/0.68, α 0.5) over the previous image → streaks; `Me.520 = 1` | – |
| 4 plasma | save screen only | red `a_kreis2` spots via `blur` | 505 at layout |
| 5 sky | Skyfight | 101 white `feuer0` spots (α ≤ 0.1) on dark blue in 64 × 64, bilinear onto 800 × 550; sunset glow (`balken` 1/0.5/0.25, α 2T/length); **every tick `Me.520 = 2`** | 505 at layout |
| 6 warp | 7-5 | black, trails with speed `(T − 50) \ 4`, clamped 1…8/10/12/14 | 202 at layout, 1 per wrap |
| 0 | beam trail, Nova | 10% black over the previous image, and when `Me.520 = 2` the old image 8 px to the left | – |
| −1 / −2 | Nova | 10% rgba(1, Rnd/2, 0) or white, respectively, over the previous image | −1: 1 per tick |

So **Skyfight has the white explosion style** (`AddExplosionsPartikel`
only checks `Me.520 ≠ 0`). The nebula runs off the wall clock in the original; the
port uses 16 ms per tick (*approximation*, without `Rnd`). The port does not use
the 16-bit variant of mode 5 (flat blue 0x6B87B3). Several ticks in one frame
draw only the last (the veil is then weaker than in the original).

## Weather (`SpielRegen` `0x536970`, `SpielSchnee` `0x537150`)

**Rain** at `0 < weatherParticles < 500` (3-1: 16, 4-1: 10, 5-2: 12 drops,
except in the Nova): drops `Me.10D0[0…N]` fall 8…10 px per tick, 4 `Rnd` when
fresh, 3 `Rnd` on a restart at the top; at the waterline, the ship (without an
alive check) or landscape, 7 gray splashes (`Add1Partikel`, 1 `Rnd` each, only
when `Me.7CC > 0`). Drawn as a 4 × 19 px `balken` laid crosswise, α 0.2. From 500
on (3-2) only `Me.520 = 3`.

**`SpielSchnee`** only when `Me.520 > 0` and `Me.7CC > 0`: first 1 `Rnd` for
the randomly drifting wind angle, then, per style, 60 records `Me.10E4` (not
saved, laid out anew after each restart): 1 snow (6-1, 6-2) `schnee1–3` additive
α 0.8 at three speeds, carried sideways by the wind; 2 clouds (Skyfight) 60
`feuer0` wisps α 0.3, 240 `Rnd` at layout, 3 per restart at the right; 3 rain veil
(3-2) `regen1` additive α 0.4 with the `rain` sound looping.

## Water (`SpielWasser` `0x533390`)

At `waterHeight` W > 0 (5-1: 550, 5-2: 275, 5-3: 71, 7-2: 81, 8-1: 57),
except in the Nova; in the original all of this happens only while drawing, in the
port every tick. W > 100: the image so far below the waterline is shifted in
strips of 10…14 px (1 `Rnd` per strip) by `CLng(k·SinusB(y + 2T))` (k = 5 at
W = 550, otherwise 1/0/−1 … by depth \ 50). From here on only when `Me.7CC ≠ 0`:
the surface is made of two undulating gradient bands (`waterTop` → `waterBottom`,
α 0.4); at ships that cross the line, splashes (additive embers, 3 `Rnd`) and the
`water touch` sound looping; bubbles with 1% (1 + 2 `Rnd`) at ships and non-solid
enemies, splashes at drones, force, enemies and beam 1; every 3 ticks `W \ 20 + 1`
floating particles (4 `Rnd`, blue taken from `top.g` by mistake).

## Overlays (`OverlayEffekte` `0x538260`, `MakeSomeNoise` `0x4FEBC0`)

Glow (`Me.508`) and blur (`Me.506`) rise by 0.025 up to 0.5 and fall by 0.05;
what is drawn is the image captured at 64 × 64 (`blur`), additively onto
(−50, −50)–(850, 600) or normally, **with feedback**: at the end of the tick the
image is captured again (`Me.50A`) and drawn in the next. The **checkpoint "flash"
is a still image**: in the trigger tick (or at the end of the death sequence,
`Me.50C`) `OverlayEffekte` copies the playfield to `Me.774` (`blur3`), then fades
the copy out from α 1 over 20 ticks (0.6 over 30 after a restart) — no white.
`Blenden` (`0x4A9FA0`, tutorial, Nova) does the same with α 1 → 0 in steps of 0.05.
Noise: when `Me.6D0 > 0`, 4 × 3 `noise` tiles with a random, mirrored cutout,
**48 `Rnd`**, only while drawing. `Me.6D0` is 0 each tick; **route op 41 ("AddFade")
adds noise** (clamped to 0…1; 7-1, 7-2), as do special 7 and the charge of ship
2's beam (`World.env.addNoise`). After a death the port first renders the death
image, then restarts (for the still image).

## Special sequences (`SpielSpezial` `0x538CF0`, `special.ts`)

Route op 42 (`SetSpecial`): a type and four parameters, active until the sequence
ends or is replaced; not in the Nova. Pass 0 after layer 0 (types 2, 3), pass 1
after the weather.

| Type | Level | Sequence | `Rnd` |
|---|---|---|---|
| 0 | tutorial | start sequence, 201 ticks: ships (state 5, rotated 270°) rise with thruster glow, fly in from the left, white fade, `SaveCheckpoint(0)`, `Blenden` | per tick and ship |
| 1 | tutorial, Skyfight, 7-4, Jungle | key hint "Drücke: " + key (GDI Arial 70), 300 ticks | – |
| 2 | tutorial | the upper half of the screen glows in 21 passes | – |
| 3 | 1-2, 3-2, 4-2 | thunderstorm: veil α 0.5, 0.5% lightning per tick (with sound, 2× thunder at a random frequency, +1 `Rnd`); 49 ticks of light cone, two **seeded** `Blitz` (`Rnd(−1)`, `Randomize`; after that the sequence is a function of one drawn value), glow | idle 1, lightning 21 |
| 4 | 7-3 | image via `blur` with an undulating 20 × 20 grid, α 0.3, blur on | – |
| 5 | Epilog | departure with thruster glow | 27 per ship |
| 6 | 7-4 | `Me.584 = Me.588 − 300`, ships controlled, glow and blur | – |
| 7 | 7-5 | escape: explosions, red flames, thunder at T = 200 with noise, lightning, "melting" 600…690 (101 columns offset, 202 `Rnd`), energy −0.1 on the left | many, more with sound |

State 5 (`B48[p].5C`) skips `SpielKeysDove` entirely and locks out beam and
Nova. The `Rnd` calls that depend on the "sound on" option (thunder frequency, the
escape's explosion sounds) are drawn by the port as if sound were on.
*Approximations:* type 4's texture coordinates (up to 800/257) are converted to
the captured image; type 0's fields `Me.BCC`/`Me.B8C` at t = 200 are open and are
omitted; `SpielHupe` (F11, `hupe` 40 ticks, also in the Nova) is implemented, but
browsers usually intercept F11.

## Terrain collision `CheckColisionWithLandschaft3` (`0x4C5EE0`)

Box [x1, x2) × [y1, y2) against the active tiles **of layer 3 only** and the
visible parts of solid enemies (`solid > 0`, alive, not in a death state, not the
excluded one). Per object, first the rectangle (source RECT left/right, occupied
rows top/bottom), then the row spans of the covered rows unioned into one interval
[min left, max right] and compared against the box — **no pixel test**. Positions
with `CLng`, drawing with `Int`. Spans come from `LadeRänder` (`0x4EF710`, `.r`
files), in BMP coordinates.

## Power-ups (`AddSpezialObjekt`, `SpielMoveSpezialObjekt` `0x4D1910`)

Timeline kinds 2, 4, 5, 6 (layer 3 only) → subtype kind − 2. Pool 16 × 0x28.
6 frames of 3 ticks each, gone at x < −64. Collected when the player hitbox
overlaps the central 32 × 32 of the 64 × 64 sprite: 1000 points plus an effect.
Subtype 0 (`Extra<a><f>`, D-Tonator only): particle weapon of sort a + 1 onto one
slot; subtype 4 (`P2Extra`, D-Phyton only): the force, or its level and color
("companion weapons"); subtype 3 (`Pow<a><f>`): 0 a new particle slot and 1 a
shield (both D-Tonator only), 2/3 speed ±1, 4 shot power +1 for all (max 3),
5 energy +50, 6 shield 200 ticks, 7/8/9 secondary weapon. With one player,
weapon power-ups appear only for the chosen ship.

## Player (`Me.B48[p]` 0x70, type record `Me.A7C[p]` 0xAC)

- **Input:** DirectInput, written each tick into a key array indexed by DIK code.
  Actions: left, up, right, down, fire, beam, switch satellite/particle, force/beam
  mode, rotate particle, Super-Nova. One player: arrows, S, A, D, Q, W, E. Two
  players: IJKL or the numeric keypad with their own bindings.
- **"Arcade" movement (default):** no inertia, `CLng(speed)` px per axis
  (starting at 6, −3 underwater, at least 1), diagonals not normalized.
  "Realistic" coasts out after release (after ≥ 10 ticks of holding a key) at
  ×0.85 per tick until both velocities drop below 1; the port additionally adds the
  decaying velocity to the position (`PlayerWorld.realistic`, set from `Me.510`).
- Bounds x 0…736, y −17…496; **hitbox (0, 17)–(64, 54)** for all types.
  Walls block per axis (reverting to the position at the start of the tick);
  landscape ahead pushes the ship left at the scroll speed, and crushes it at
  x < 0.
- Start (100, 260), with two players (100, 228) and (100, 292). Tilt 0–4
  (2 is level), changes immediately and then every 6 ticks.
- **Ship types** (`A.A8`, also `Var` 32784): 0 "D-Tonator" (particle), 1
  "D-Phyton" (force); 2 "debug ship", only via the command line / debug dialog (in
  the port `?ship=2`, see "Debug ship 2 and drones"). With two players, player 2
  gets the other type. Sprites `dove{Typ}{Neigung+1}{Bild+1}` (64 × 64).
- **Damage:** an enemy shot overlapping (x+5, y+20)–(x+60, y+45) → energy −
  damage; contact is −2 per pass, and the enemy takes 15 (looped within the same
  tick until nothing hits anymore); landscape or solid enemies kill instantly;
  energy < 0 kills. Invulnerable for 100 ticks after each spawn, 200 with a shield,
  500 during the exit flight (damage is reset within the same tick).
- **Kill counter** `B48[0].54` (`Carry.kills`): +1 for every explosion of an
  enemy part in the death states (six places in `0x4B5850`, the same ones that add
  `Punkte \ 500 + 1` as screen shake: part burst with shake, state 5, boss finale)
  and per bursting enemy box of the Super-Nova (`0x4C3E10`, loop over `Me.1288.1A8`);
  it is read only on save (`0x53FDFF`), loaded at `0x54007D`, reset in `0x4A6912`
  (new game). It is always player 0's, even in co-op; no gameplay effect.
- **Death** (`KillDove` `0x50B0D0`): a 99-tick sequence; one player: checkpoint
  restart, lives −1 (starting at 3); lives 0 → Continue (score ÷ 3). Two players:
  shared lives (6), rejoin after 100 ticks at the partner's position; with no lives
  or in a boss fight the partner dies too.
- **Drawing** (`SpielMoveDove` `0x509110`, step 6, only living players):
  from the exit flight on, eleven afterimages from the history `Me.B64` (α 1/12 …
  1/2); shield (`a_kreis2` inner and outer, one gray flash each, 12 `Rnd` per tick),
  as long as invulnerability is > 10 or odd — the ship itself does not blink; the
  ship; eleven additive copies during the 2P power phase; an additive tint (red
  `1 − E/Emax`, green when energy is higher than 10 ticks ago, blue on a full beam
  in even ticks); a magenta flash (10 `Rnd`) as long as energy is below what it was
  10 ticks ago or the power phase is running; smoke below half energy (one counter
  for both players).
- **Score** (`AddPunkte` `0x50F750`): `score = CLng(Kombo · Punkte / (1 + 0,5 ·
  zwei Spieler) + score)`; the combo multiplier applies to all of the player's
  points as long as it is > 1 ("Beam and combo"). Extra lives at 300,000,
  600,000, 1,200,000 … (`Me.524` = 3 from `DoveReset`, doubled per extra life).

## Player weapons

- **Pool** `Me.B8C`: 2 layers × 1001 slots of 0x34 each (type, parameter, damage,
  vx, vy, x, y, active, counters A/B, owner, trail X()/Y()). Layer 0 runs before the
  enemies, layer 1 after. `AddSchuss` `0x4DD0F0`, `KillSchuss` `0x4D36D0` — with a
  bug: the downward search hits the still-active slot itself first, so the highest
  occupied slot never drops. `SpielMoveSchuss` reads the limit once at the start of
  the loop; children (types 4, 5, 10) are still moved in the same tick if their slot
  lies after the current one and below the limit.
- **Firing** (`SpielSchieß` `0x4E2C20`), done in full per player, fire held
  (no edge), blocked as long as player 1 is in the exit flight: ship frame (only
  while firing, shared cadence), main shot, secondary weapon, particle or force,
  then **muzzle sparks** (11 × 2 small particles with 3 `Rnd` each, inheriting the
  ship's movement) — 66 `Rnd` per firing tick. Looping sounds `cyan` (bolt),
  `yellow` (sort 3), `d-phy_yellow` (yellow force).
- **Main shot:** cooldown 6 (ship 0, 2) or 12 (ship 1) ticks, vx 11, sound
  `normal`/`normal2`. When flying level, one shot; when tilted, two (upper/lower
  muzzle) at half damage. Damage ship 0/2 `40 · m · (Stufe + 2)`, ship 1
  `m · (100 · Stufe + 140)`; `m` = 2 during the beam power phase.
- **Secondary weapons** (own cooldown, layer 0): bomb type 11 (`100 \ m`,
  damage 300 · Stufe + 700, falls with the level's gravity), drop rocket 12
  (`150 \ m`, 400 · Stufe + 1100, 16 ticks of fall, then up to 20 px/tick with
  smoke), homing rocket 13 (`60 \ m`, 200 · Stufe, turns at most 10° per tick toward
  the nearest part, green targeting aid). Impact: 50 sparks, standard explosion,
  splash `CLng(Schaden) \ 2` in the box ± 32, `explosion`.
- **Shot types** (`SpielMoveSchuss` `0x4D37C0`): −2…1 main shots and drones
  (box 16 × 16; move → off-screen → **draw** → enemies → landscape, so a shot
  consumed within the tick is still visible; backward-flying drone shots are
  rotated), 3 growing fireball (area damage every tick, 1 `Rnd` per drawn tick),
  4 splitter (splits on impact, 4 `Rnd`), 5 bouncer (fuse 15…27, breaks into three),
  6–10 the force's lasers red/blue/yellow/violet/green with a glowing band (`Spur`
  `0x536110`; after a hit the head stops and the trail runs out), 11–13 secondary
  weapons, 14 beam homing projectile (creator: ship 2's beam aftermath). Type 2 has
  no creator; type 15 (special weapon 2 of the debug drones, unreachable there) is
  never moved and occupies its slot until the next clear. Types 6, 7, 9, 10 do not
  set the shared box `L.304…L.310` and in the off-screen test inherit its dimensions
  from the most recently processed shot (carried along in the port).
- **Hits** `CheckColisionWithEnemy` (`0x4C3E10`): enemies in slot order, parts
  from last to first, contour test as for the landscape; at most one part per call.
  The return value is the **remaining damage**: the full amount on no hit, 0 on a
  consumed hit, the overflow on a kill (so the shot flies on). Armored parts take no
  damage; with damage −1 the call only checks whether something overlaps (force).
  `CheckWhereColisionRight/Left` (`0x4C6A60`/`0x4C64B0`) search for the nearest edge
  of layer 3 and of all visible enemy parts (yellow beam, lightning).

## Companion weapons

**The D-Tonator's particles** (`Me.A98[0…3]` of 0x30; `SpielPartikelMove`
`0x4DFE20`, `NextPartikel` `0x4DD3D0`, `SpielPartikel` `0x4E09B0`): slot 0 above,
1 below the ship, 2 in front, 3 behind (ellipse 40 × 22, W rotates 2/3 by 180°, D
selects the next active slot and makes it glow green for 50 ticks). Slots snap in at
a distance ≤ 5, otherwise they trail with a lag, and they are pushed out of walls by
up to 20 × 2 px. Sorts: 1 bolt (to the nearest edge, `Rnd(−1)` + `Randomize` reseed
like the thunderstorm), 2 scatter shot, 3 fireball, 4 splitter, 5 bouncer (6, 7 in
the code but unreachable); each sort up to level 3. The cooldown counts down twice
per tick (also in `SpielPartikel`), so with fire held ⌈N/2⌉ applies. Shields (sort
−1, ellipse 52 × 42, 8° per tick) hit enemies for 50 damage per tick and swallow
enemy bullets (points = bullet damage). Pickup with "Auto-Arrange" (default): the
same sort first, otherwise empty slots in the order 2, 3, 0, 1.

**The D-Phyton's force** (`Me.AA8…ADC`, `SpielSateliet` `0x4DD5F0` — not the
particles): the first capsule brings it in from the left edge on a recall; further
ones raise its level (max. 2) and set its color. D fires it off (vx ±20,
`force_off`), pressing D again recalls it (target: the ship's position 10 ticks ago,
with thrust from the 3rd press on), and when free it stays at x ≈ 550 or 50. It
docks at |dy| < 15 in front or behind (84 `Rnd`, `force_on`), dissolves landscape
per axis and pushes itself out of jams. Contact damage `ADC` halves per hit and
otherwise grows by 25; it swallows enemy bullets (after they move). Shots per color
in `SpielSchieß` (docked only from level 1 on or in the power phase; free, a fan
depending on level). Enemies aim at a D-Phyton spread across the ship or the force
(1–2 `Rnd`) and round the aim point with `CLng`. `AddForce`/`DoForce` are joystick
vibration (section "Vibration"), not the force. Drones (`SpielDWeapons`) exist only
on debug ship 2, see "Debug ship 2 and drones".

## Beam and combo

`SpielBeam` (`0x513940`), beam record `Me.CB0[p]` (0x34). A charges 0.9 per tick
up to 165 (charge sound `charge1`/`charge2` looping, frequency `CLng(L · 120 +
10000)` or `CLng(L · 100 + 1000)`, 30000/18000 Hz at full); held fire or the exit
flight counts as a release. Q switches the type (option "force-mode key acts as a
beam switch", default; switching the type costs the charge). Damage `CLng(L^1,6 ·
Stufe)`, `8500 · Stufe` at full (+1500 ship 1).

- **Beam 1:** a projectile with a damage budget, ship 0 24 px/tick with a body
  (`balken`/`balkene`), bolts (from level 2 on) and four spiral trails (at full,
  from level 3 on), ship 1 20 px/tick with blue fireballs. A hit without a kill
  consumes it (ricochet off armor), a kill passes the rest on (combo + 0.5, the
  width shrinks). At full it passes through landscape and through the armor of types
  with `armorPassThrough` and kills penetratingly (state 6). Then 10 ticks of
  afterglow; here the original passes the same field of the spiral trails for both
  x and y (a band on the diagonal, reproduced).
- **Beam 2:** below 165, only the collapse of the aura. At full it starts the
  **power phase** (500 ticks): main shot × 2, secondary-weapon cooldown halved,
  energy +0.03/tick, in 1P without a background, a white flash, no speed penalty
  underwater; each kill splits the enemy (state 1) and counts the combo
  (`Multiplikator = Treffer · 0,1 + 1` before counting). After that the bar decays
  over 825 ticks, and no recharge is possible for that long.
- **Beam ship 2** (debug): its own sequence, see "Debug ship 2 and drones".
- **Combo** (`Me.59C` multiplier, `Me.5B8` hits, `Me.5D4` bonus): reset when an
  enemy escapes (except `noComboReset`/`solid`), at the end of the power phase and
  during the afterglow. Displayed only for player 1: `combo` at (730, 520) with
  counter and bonus, "Combo: N Hit B" in the ticker at the end.

## Debug ship 2 and drones

Static only, from the EXE (no play test). Ship type 2 (`Me.A7C[p]+0xA8`)
is reachable in the original only via the command line or the debug dialog
(strings "Debug INIT", "-Level", "Schiff Nummer?" around `0x413500`); the menu
offers only 0 and 1. In the port the URL option **`?ship=2`** (player 1) selects
the type; the menu stays at 0/1 (`index.ts` → `Game` → `World`, option `ship`).
Code: `sim/drones.ts`, `sim/beam.ts` (`flight2`, `aftermath`, `chargeGraphics2`),
`sim/effects.ts` (kind 17), `sim/envDraw.ts`, `render/Compositor.ts`; tests
`test/ship2.test.ts`, `test/ship2Beam.test.ts`. Ships 0/1 stay bit-identical
(a regression run with a state hash before/after the change).

What type 2 does differently in the original (all places from a search for `+0xA8`):

- **Sprites** `dove2<Neigung+1><Bild+1>` (same scheme as 0/1); exhaust,
  rebirth, `KillDove`, water, HUD, power-ups, Nova, main shot and enemy aiming all
  treat type 2 like type 0/1 (already present in the port).
- **Drones** (`SpielDWeapons` `0x4E0ED0`, array `Me.B04`, 2 × 0x70 bytes,
  `ReDim 0 To 1`), per tick and type-2 player, after the particles (step 5 of
  `SpielLoop`), also in the Nova; without an alive check:
  1. *Chain:* drone 0 follows (ship + 16, +16), drone 1 the end of the previous
     one's history; history 11 values, the drone lagging 10 ticks behind; if the
     target is stationary (same position as the newest value), nothing happens
     except a rotation of 1° back toward 0°. Otherwise a rotation of at most 10° per
     tick toward the angle `WinkelInGrad(dx, dy) − 360` (`CLng`), the target angle
     moved up by 360 to approach the current one. Drawing: ember blob `a_kreis2`
     64 × 64 (0.2 / 0.1 / 0.1 / 0.8) normal and additive, direction stroke 3 px
     additive.
  2. *Target seeking* (`Me.B08`, initially True): the nearest part center within
     radius `Me.724` = 170 around (ship + 64, +32) (`CLng(Sqr(dx²+dy²))`, strict `<`,
     tie: the first; all parts of living, non-solid enemies with a contour,
     including invisible ones, but not armored ones). Four `Blitz` (two pairs, red
     10 px / black 5 px, start point ± 5 · cos(2 · tick) in y, segment count 4,
     spread 30, seed `CLng(Rnd · 10000)` per pair = **1 `Rnd` per pair**), then
     10 damage over 2 × 2 px around the center (with sparks).
  3. *Orbs* (`Me.B0A`, fire `Me.B0C`): two sprites `dw1-<Int(Tick/3) mod 10>`
     32 × 32 on the orbit (ship + 32 + cos(φ + 8 · Tick) · 60, ship + 32 +
     sin(9 · Tick + φ) · 55), φ = 0°/180°; a hit, 20 damage. Per orb 2 `Rnd` (5% roll,
     direction); only when both conditions hit and fire is held (action 4, blocked
     during the exit flight) a pair of type −2 shots (speed ±9, layer 1, damage
     `40 · Stufe + 50`).
  4. *Special weapons* `Me.B14[k]` (stock 30 / 4 / 0 from `DoveReset`
     `0x4A6D50`/`0x4A6E97`, cooldown `Me.B20[k]`), the D key, mode `Me.B2C`: 0 drop
     rocket type 12 (damage 1500, `Rnd`, cooldown 8, `rocketlaunch`), 1 twelve
     homing rockets type 13 in a 30° ring (cooldown 100), 2 21 type 15 shots
     "debug drones". **`Me.B2C` is written nowhere**, so 1 and 2 are unreachable in
     the original (reproduced in the port anyway, field `Drones.mode`).
- **Drone shots** (`SpielSchieß` `0x4E3D0F`, with fire held, in place of the
  branch for type 0/1): per drone every 8 ticks (`Me.B04[i].6C` = 7) one type 0
  shot, speed 9 in the facing direction, layer 1, from center + 8, damage
  `20 · Stufe + 50`.
- **Placement** `DovePosSetup` `0x4A6BF6`: all drones and their history onto
  player 1 + (16, 16), even if player 1 is not flying a type-2 ship.
- **Beam** (`SpielBeam` `0x514EDC`/`0x51A89B`), with `Schaden = CLng(L^1,6 ·
  Stufe)`, `8500 · Stufe` at full (without the D-Phyton's +1500):
  - *Charging* (`chargeGraphics2`): noise `Me.6D0 += Ladung · 0,05 / 165`; a
    lens in front of the nose (center ship + 96, +32, radius `Ladung · 27/165 + 5`):
    a cutout of the playfield with an `a_kreis3` overlay into a 64 × 64 target
    (`@lens`), inside it a colorful bolt particle (kind 0, size 2r, three `Rnd`
    for the color); at full charge two ghost images `dove2<n>` with α 0.2 and no
    more suck-in sparks (otherwise kind 16, five `Rnd` per spark). The suck-in
    target is (ship + 96, +32) instead of the nose of the other types.
  - *Flight* (`flight2`): only from `fired ≥ 10` on; 20 px per tick; a body from
    a captured strip (`@blur`) plus `balken` additive 0.3, a lens at the head
    (`@lens`, `a_kreis2` additive 0.3); at full charge 5 `Rnd` per tick and rainbow
    strokes (kind 4, from level 3 on kind 2, from level 2 on spiral trails); at the
    edge (x > 800) it ends (combo reset). Hit test with `Schaden − 2100`, penetration
    only on the full beam; landscape does not stop it immediately but triggers the
    aftermath. Per hit `glow = −100`, combo `+0,5`, `Schaden = Rest + 2100`;
    remainder 0 → flash and burst.
  - *Aftermath* (`aftermath`, `glow` −100 → 0): a full beam sends eight homing
    projectiles type 14 (angle 110…250 in 20° steps, speed 20, damage `Schaden \ 7`)
    and two waves (lens kind 17, embers kind 16); a small beam fades out over
    `Int(Breite)` ticks. After that the beam is free.
- **Kind 17** (`MoveBigPartikel`, shock lens): captures the cutout beneath the
  particle (`@lens`, overlay `a_kreis3`) and draws it enlarged by `k = Alter · p38`;
  age = start life − life (inferred from the register usage).
- **Two players:** `LoadSpielSurfaces` (`0x4F7290`/`0x4F77A0`) gives the second
  player, with ship 2 as the default, type −1 (`1 − 2`), i.e. no valid sprite (the
  original crashes there). The port then gives player 2 the D-Tonator.

Port wiring: the drones draw into the DrawList layer `drones` (between
`exhaust` and `weapons`), the beam uses the EnvList layers `beam` and `big`
(capture and strip to `Compositor`, third render target `@lens`). Rnd order as in
the original (drones immediately after the particles, then firing, then beam).

Confidence: drone logic (chain, target seeking, orbs, shots, special weapon 0)
high; beam simulation (damage, hits, aftermath, homing projectiles) high; charge
graphics medium to high; the exact image composition of the lenses (overlay
`a_kreis3`, age of kind 17) medium. Deviations and unknowns: the flags
`Me.4FC`/`Me.4F8` (drawing the drones) are ignored (drawing always on), the sounds
of special weapons 1/2 (`PlaySound` offsets 0/200) approximated by two simultaneous
events, capture outside the screen is clamped (the original reports a DirectDraw
error).

## Enemy runtime `SpielMoveEnemy` (`0x4B5850`)

Enemies in slot order (which is also the draw order), **no culling** — an enemy
leaves only when its route ends or it dies. Per enemy:

1. Route (mode 0). If it ends: remove silently; if the beam was active, the
   combo ends (except `noComboReset`/`solid`).
2. HP < 0 after the route (the route set it): self-destruction without points.
3. Per visible part: part route (HP < 0 → the part explodes), directional frame
   or DoAni, aiming (turret), landscape test (`collidesWithTerrain`; the right edge
   oddly from `red`), ramming, drawing, flash −1, firing per fire mode.
4. A landscape or ramming hit destroys the whole enemy: death spawn, sparks,
   `Explosion2.wav`, no points.

**Drawing:** D3D groups with the part's color/alpha, rotated via `SetUpGeom`;
flash as a second additive pass. DirectDraw groups as a color-key blit, the negative
`_i` on a flash.

**Death state** on a kill (`0x4C4C8F`…`0x4C5A5F`): `explosionSpec` → 5,
`bigDeath` → 7. Otherwise the enemy bursts **immediately** (with points, a popup
rises, `Explosion1/2`) if another enemy killed it or the hit was ordinary (no boss,
no beam power phase, not penetrating, no Nova). Only otherwise an animated death with
`spalt.wav`: **6** (a penetrating full beam 1, 50 ticks of green target lock), 1 in
the power phase (split, combo + 1), 2 in the Nova, 4 for bosses (priority; in 2P the
partner gets the points too). Durations: 1 is 30 ticks, 2 is 40, 3 up to 160 (debris
with gravity), 4 is 570 (boss finale), 5 is 15 (ignition, blue flash), 7 is 10 per
part. In 1P the screen does not shake on a burst while the power phase is running. In
the port complete: 1, 3, 4, 5 (with a chain reaction via `CheckColisionWithEnemy`
with `exclude`), 6 and 7; 0, 2 and −1 in the section "Super-Nova". State 6 in detail:
four green lines grow from the corners of the outline across the visible parts, from
t = 21 on ten sparks from the center per tick and a rotating, shrinking square
(radius 20·(50 − t)), and at t = 50 each part bursts — with a rectangle stretched by
±50 px, a bug in the original, reproduced.

**Boss finale** (state 4, `0x4B9394`…`0x4BCF9A`): 570 ticks with no effect on
other objects. The parts stand frozen until T = 500; per tick smoke and one spark,
every other one a 64 explosion and a blur bubble, one `Rnd` every tick (sound
`endgegnerw3` with 20% at t 131…159); t = 120 a halo of rays, 160…230 explosion
ellipses, from T = 325 on seven imploding waves, T = 430 red embers and shake + 70,
two white full-screen flashes; overlays A/B (glow, blur; section "Overlays"),
`endgegnerw1…7` (W5 and W2 looping). T = 1: both players invulnerable for 600 ticks,
in 1P a running beam 2 ends; T = 2 to 500 background 0; T = 500 the parts burst;
**T = 520: `Me.584 = Me.588 − 151`** (exit flight in the next tick); T = 570 the boss
is gone. "Boss alive" (`[0x5882A8]`) is set only by `AddEnemy` when `boss = 1`, and
cleared only in `VariabelnLösch` (not on boss death, not in the snapshot); read only
by the 2P rejoin and by `KillDove` (force). There is no boss bar. A boss that dies by
anything other than a player hit never ends the boss level.

### Level 7-4 "Final Boss" (`level7-4_finalboss`, length 99999)

*Finding (data analysis + `Var` `0x4AC970`), confidence high for the cause, medium
for the design intent.* The final boss is **not a `boss` enemy**: the only type
(`spider`, 8 parts, HP 100000, `boss = 0`, `bigDeath = 1`) creates neither the flag
"Boss alive" (`[0x5882A8]`) nor the boss death (state 4) nor the exit-flight chain at
T = 520. All parts are `armored` (player shots and the beam have no effect). The level
ends instead via the route and a special sequence:

1. Timeline layer 4, tick 220: type 0 on route 3 ("äh"), y = −53.
2. Route 3: `Set HP = 100000`, `SetPos(800 + 200, spawn-y)`, then `Step(−1, 0)`
   each tick as long as x > 230. At x ≤ 230: `SetLayerScroll(0…6, 0)` (all layers
   stop) and `SetSpecial(1, 9, 0, 0, 0)` = key hint "Drücke: <key of action 9>", which
   is the **Super-Nova** (actions 0…9, section "Key configuration"), 300 ticks.
3. After that the route waits in `Label 0; If HP == 100000: Wait 1; Goto 0`. Only
   the Super-Nova changes the HP (a flat −10000 per hit, section "Super-Nova";
   armored parts stop shots, the Nova ignores armor).
4. If the HP deviates: `Set HP = −1`, `SetSpecial(6)` (`Me.584 = Me.588 − 300`,
   ships controlled, glow and blur; section "Special sequences"), `Wait 1`. In the
   same tick the spider destroys itself (`HP < 0` after the route: self-destruction
   without points, `bigDeath`); 150 ticks later the ship leaves the screen, `Me.584`
   reaches the exit flight as in every boss level (state 2 in the port, then
   `Play.txt` continues to 7-5).

**Cause in the port:** `Var` (`0x4AC970`) returns, for operands **above 32784, the
operand itself** (case `0x4ACC1A` → `0x4ACC3C`: the value stays in `[ebp−0x18]`,
which `0x4AC9E6` preloaded with the operand; codes 32748…32784 are variables,
everything below and above is a literal). `route.ts` returned 0 there. The 100000
marker (route 3: `Set`, two `If`) was therefore 0 for the port: `Set HP = 100000`
set 0, and `If HP == 100000` (i.e. 0 == 0) was true until the first damage — so the
spider ran in and waited as in the original, only with HP 0. The bot sees this as
"lives forever with HP 0". But the Nova subtracted 10000 from 0 (−10000 ≤ 0): the
Nova state machine killed the spider (`KillEnemy`, points) before the route ever ran
again — `Set HP = −1` and `SetSpecial(6)` never came, and the level stalled even for
a player with the Nova. With 100000 the HP stays at 90000 > 0 after the hit, the
route continues after the Nova and ends the level. All other 26 levels have **no**
argument above 32784 (checked), and nothing else changes. Fix: `varValue` returns
`c` there.

The bot (continuous fire, invulnerable) clears the level only if it presses the
Nova on the hint (`test/boss-7-4.test.ts`); with shots alone it stays in the waiting
state (as in the original, which provides no other way; confidence medium — the
waiting state is read from the route and armor, no run of the original is
available). If the player misses the hint (300 ticks), the level stalls until they
trigger the Nova; it needs no particle here (the scatter variant with the shield).

**Explosion:** sparks (`AddPartikel`), embers, smoke and fireballs
(`AddExplosionsPartikel`, size by the rectangle), sound `Explosion1.wav` or
`Explosion2.wav` from 1500 points on, `spalt.wav` on an animated kill.

### Level 5-3 "Rumbler" (boss fight, `boss-5-3.test.ts`)

**Result: the port is correct, the fight is winnable; the bot aimed wrong.** The
symptom ("the main part never loses HP, steamers slow, type 6 almost not at all") is
the level mechanic, not lost damage. With player damage `40 · (Stufe + 2)` = 80 per
shot (cooldown 6), that is ≈ 13 HP per tick; each shot on an unarmored part subtracts
its full damage (measured: Dampfer_unten 35000 → 13040 in 1500 ticks). Confidence
**H** for the mechanic (data and code), **M** for "intended that way".

*Setup* (timeline layer 4, all at tick 0): four steamers and the boss.

| Type | Name | HP | Place | Route | Death child (`deathSpawn`) | Throw (`spawnSpec`) |
|---|---|---|---|---|---|---|
| 1 | Dampfer_unten | 35000 | (262, 419) | 6 | 12011: 2 × type 1 on route 12 | 14007: stalagmite (7) |
| 2 | Dampfer_oben | 35000 | (262, 75) | 4 | 10020: 1 × type 2 on route 10 | 8003: meteor (3) |
| 5 | Dampfer_oben2 | 40000 | (451, 75) | 5 | 11051: 2 × type 5 on route 11 | 9004: rotor (4) |
| 6 | Dampfer_unten2 | 40000 | (451, 419) | 7 | 13061: 2 × type 6 on route 13 | 16008: volcano (8) |
| 0 | boss (`boss = 1`) | 40000 | (800 → 521, 130) | 3 | – | – |

*Boss* (9 parts, all `damagesBody`): **only part 4 ("core", `boss_innen`,
offset (24, 115), visible at (545…644, 245…344)) is unarmored**, the other eight have
`armored = −1`. Part 8 ("shield", `boss_schutz`, offset (0, 52), contour spans
(524…659, 195…396)) lies in front of the core and is checked first as the last part;
a shot on an armored part is consumed (return 0, except penetrating against
`armorPassThrough`), so a shot from the left reaches the core only through a gap in
the shield. Shield frame 0 closes the core completely; frames 2…5 (`schutz1…4`,
6 ticks each) open it, frame 6 (`schutz5`, duration 9999) stays put (left edge 577
in the core rows; the core starts at 545). The core is the only place where the boss
takes damage; the core's `hitPoints` (500) are meaningless because of `damagesBody`.

*Flow* (route 3 "Main", `DoRoute` `0x4ACC70`, op numbers per
`dovez-level-dat.md`): ops 0…6 stop layers 1…6 (op 25) and set layer 3 to speed 1
(op 24); the boss flies from x = 800 to 521 (op 3 with a = −0.4, speed 15) and waits
200 ticks. Then the loop (label 0): the four globals 0…3 (`Me.A64`) are, per steamer,
0 = ready, 1 = attacking, 2 = dead. If none is 1 and not all are 2, the boss randomly
chooses (op 10, 1…4) a steamer with global 0, sets it to 1 and **waits 500 ticks**.
The steamer routes 4…7 wait for their global = 1, then play sound, rumble (op 31) and
fire (`Fire` with −1 = `spawnSpec`) stalagmites, meteors, rotors or volcanoes, set
their global back to 0 and stop the sound (op 30). **If a steamer dies**, its death
child (`deathSpawn`) spawns on route 10…13; it reads the global (if it was 1: rumble
off, sound off), sets it to **2** and ends (a child with no points and no effect; it
serves only this purpose). If all four are 2 (sum 8, op 29), the boss jumps to label
2 (**phase 2**): global 4 = 1, part 8 to frame 2, then animate (op 7 with −1) — the
shield opens —, and in label 3, every 50 + HP/500 ticks (130 at 40000 HP, 90 at
20000) a halo of rays with 50% (op 33), always weapon 6 ("core") at the core, and
with 50% additionally weapon 5 ("buckle") at parts 0 and 1. The core kill is the boss
kill (state 4, finale, `Me.584 = Me.588 − 151`). A boss kill before the steamers die
is impossible (shield closed, no other unarmored part); global 4 reads nothing, the
shield opens solely via the route.

*Bot:* `botInput` aims at the enemy's `y + 30` (160 here), which on the boss hits
only armored parts (1, 2, 5, with 8 behind) (boss HP never changed; after the
steamers died the bot sat still at y = 117). It got the four steamers after ≈ 10,800
ticks, because it follows the nearest target and does not exclude the stalagmites
(armored, no effect). `botVulnerable.ts` aims at the contour center of an unarmored
part: all four steamers dead after 2899, 4634, 8208, 16770 ticks, phase 2 at 17266
(wait time 500), boss finale at 19280, `state = 2` at 19952 ticks, 222200 points.
`runLevel(slug, maxTicks, input)` takes the target selection as its third parameter
(default unchanged).

*Verified in the original* (`CheckColisionWithEnemy` `0x4C3E10`): parts from back
to front (`0x4C4176` counts down); an armored part (`[Teil+0x2E]`, `0x4C424A`) sets
`PanzerOut = −1` and ends the call without damage (return 0 at `armorPassThrough ≤ 0`
or not penetrating, `0x4C4241`); `damagesBody` (`[Teil+0x24]`, `0x4C4350`) subtracts
`damage` from the enemy HP `[Gegner+0xC]` (`fisub` `0x4C43FF`), and the kill runs from
`0x4C4A4A` on (`AddForce(1, 20)`, death spawn from `[Gegner+0x44]`, `0x4C4AC0`).
`SetGlobal` (`0x4AEEB0`) allocates the array `Me.A64` (Single, upper bound `Me.A68`,
initially −1) on demand with `ReDim Preserve` (`0x4AEF24`); it does not handle
negative indices; `GetGlobal` (`0x4AF020`) returns 0 above the upper bound
(`0x4AF073`); the array is cleared at level start (`0x4A672E`). The port does all of
this (`enemies.ts` `hit`, `route.ts`). *Open (M):* whether the fight duration
(≈ 20,000 ticks for one player without upgrades) is meant to be as it is here in the
original depends on player damage and extras — the level has only one power-up
(layer 3, tick 12, y = 253, subtype 4: the D-Phyton's force).

## Super-Nova (`SpielNova` `0x52A230`)

Every tick after the beam (`nova.ts`). **Triggering:** the Nova key (E; set
`p + 1` in 2P), an edge via a latch **shared** across all players (whoever is not
holding the key releases it every tick). The D-Tonator needs a selected particle,
the D-Phyton the force; not during the Nova, not dead, and not while any slot up to
the highest is in state 4 (boss finale, even a dead one). No charge, no HUD — what is
consumed is the particle (kind 0: slot gone and `NextPartikel`, otherwise kind → 0)
or the force. On triggering: all 501 enemy shots gone (shockwaves too, emitters
remain), the background saved and 0, music to 1/10, `SpielSoundOFF`, `Nova.wav` +
`NovaSchuss.wav`.

**Variants** (`Me.109C`): the particle kind, or `Int(Rnd·3) + 6` for the
D-Phyton; counter `C` starts at −1 and advances by 1 per tick, duration `C₀ + 1`:

| Kind | Name | Duration | Effect |
|---|---|---|---|
| −1 (shield) | scatter | 71 (55 without enemies) | 21 strokes, overlay B, all at C = 36 |
| 0 (empty) | ring | ≥ 101 | wave 4 px/tick from the particle, hit at ¼ distance + 10 |
| 1 | bolts | 201 | two full-screen flashes per tick, a wandering bolt, all at C = 36 |
| 2 | fire snakes | 228 | three Lissajous snakes, sparks at each enemy, all at C = 36 |
| 3 | image break | 5n + 96 | background −1, strip offset, enemy k at t = 5k + 49 |
| 4 | spark rain | 201 | strokes from all enemies and strip offset until C = 81, all at C = 36 |
| 6 | force hunt | 15 per target + 41 (31 without a target) | the orb flies toward each target for 15 ticks, death → state 1 |
| 7 | black sun | 251 | background −2 (white), a growing black disc, all at C = 70 |
| 8 | flythrough | fly-out + 9 per target + 21 | the ship races through each target in 9 ticks, then flies back |
| 5, ≥ 9 | homing shots | up to 50 after the last hit | crosshair, a shot with cosine settling, death → state 2 |

**Enemies:** on the first tick all slots up to the highest go into the state
machine, the eligible ones (`novaImmune = 0`, active) into **state 0** (only drawn,
no flash), the rest into **state −1** (neither moved nor drawn — nova-immune ones
vanish and reappear at the same spot at the end). Each hit subtracts a flat 10000
from the total HP (parts untouched), death gives the full points with a popup to the
trigger (no combo) and is usually `KillEnemy` without aborting emitters (the weapons
finish their salvos after the Nova). **State 2** (40 ticks): on the first tick, per
part with a contour > 30 × 30, glitter fragments (3 `Rnd` each, count from the BMP
size) and the emitters gone, and at 40 each part bursts over its source rectangle. At
the end all active enemies continue normally; any that were still in state 1/2 with
HP ≤ 0 destroy themselves in the next tick.

**Mid-tick:** in the trigger tick the timeline, controls, shots and enemies still
ran; from `SpielNova` on, enemy shots, layer 6, contact and fade-out already rest. In
the end tick these run again, and from the following tick everything does. The player
is therefore invulnerable during the Nova; `Me.584` (the tick) stands still.

**Image:** background −1 rgba(1, Rnd/2, 0) or −2 white at 10% over the previous
image (trailing streaks, section "Backgrounds"); overlays as with the boss; `Blenden`
(C = 1) as a still-image crossfade. The image break (variants 3/4, `BltFast` of the
backbuffer onto itself, vertical strips ±5 px with a bug in the destination
coordinates, then horizontal ±10 px) the renderer plays onto the persistent
backbuffer; the offsets accumulate as in the original. The lock `B48[0].5C` (special
sequences, exit flight) applies.

## Enemy instance (`[0x588110]`, 101 × 0xF0)

`0x58811C` the first free slot, `0x588120` the highest occupied, `0x5882A8` boss
alive. `AddEnemy` (`0x575FF0`, arguments type, route, tick, y, x) copies the type
(0x60 bytes, parts deep-copied) and sets:

| Offset | Type | Meaning |
|---|---|---|
| +0x00…+0x5F | Type | copy of the enemy type; parts with runtime fields (see below) |
| +0x60 | Long | route |
| +0x64 / +0x68 | Single | x / y (timeline: x = 800) |
| +0x6C | Integer | active (−1) |
| +0x70 | Long | route instruction pointer |
| +0x74 / +0x78 | Single | vx / vy (also directional frames) |
| +0x7C | Single | wait counter |
| +0x80 | Single[8] | locals L0…L7 (L0…L5 zeroed at spawn) |
| +0xA0 | Single[14] | registers R0…R13 (shared with the parts) |
| +0xD8 | Long | spawn tick |
| +0xDC | Long | spawn y |
| +0xE0 | Long | state tick counter |
| +0xE4 | Long | death state 0–7 |
| +0xE8 | Integer | ≠ 0: state machine instead of route/drawing/collision |
| +0xEC | Long | target player, `Int(Rnd · Spielerzahl)` |

Runtime fields per part: +0x3C frame, +0x40 frame timer (−10 to hold), +0x44
visible/alive, +0x48 points (`CInt(hitPoints)`), +0x4C fire counter, +0x50…+0x5C
route state (ip, vx, vy, wait), +0x60 locals, +0x80 route speed (1.0), +0x84 flash
(ticks).

Death states (`+0xE4`): −1 hidden (Nova), 0 frozen (Nova), 1 split (beam), 2 Nova
death, 3 debris (`wreckGroup`), 4 boss, 5 explosive (`explosionSpec`, after 15 ticks),
6 normal explosion (points, combo + 1), 7 chain explosion (`bigDeath`).

### Level 3-3 "Saw Machine" (boss verification)

Length 99999, ends via the boss's death. **Finding: the port was correct, no
simulation change is needed.** The simple bot (`test/bot.ts`: continuous fire from
x = 100 at the nearest living enemy) fails because of the fight's design, not a bug:
armored parts swallow every shot, and the fight requires the player to dodge the saws
and pick a clear lane from up close. Confidence **H** (mechanic from data and code,
the bot run completes it); how a human plays it in the original has not been checked
against the running original.

**The shot rules** (`CheckColisionWithEnemy` `0x4C3E10`, part loop
`0x4C3F1D…0x4C4176`): an enemy's parts from **back to front** (`0x4C416B`: index − 1),
only visible ones (`+0x44`), contour as in the landscape test (`SpanHit`, unioned row
spans, no pixel test). The first hit ends the call: `damage < 0` returns 0
(`0x4C4200`, a probe with no effect); a part with `armored ≠ 0` (`0x4C424A`, word
`+0x2E`) sets `PanzerOut` = −1 (`0x4C4251`) and returns 0 — the shot is consumed,
without damage (`0x4C4243`; only a penetrating caller against `armorPassThrough > 0`
keeps the damage). An armored part therefore acts as a **shield for everything behind
it**, as long as its contour covers the lane. The frame is a switch: `SetPartFrame`
to a 1×1 frame (`Schwarz.bmp`, contour practically empty) "switches off the shield",
and the part stays armored and visible. The saw blades (255 × 255, circular contour)
together cover every height of the wall (y 131…415) whenever they stand between the
muzzle and the wall; with a swing range of x = 35…405 this is always the case for a
ship at x = 100. Their contour does **not** rotate with them (the contour test knows
no rotation, meaningless for a circle).

**Components** (the file's enemy types; route in parentheses):

| Type | HP | Parts | Role |
|---|---|---|---|
| Wand-3 (10) at x = 500 | 8000 | 1 (brick) | no shield, first |
| Wand-2 (9) at 550 | 30000 | brick + plate (`Wand Unzerstörbar`, frame 0 = wall, 2 = 1×1) | plate gone at global 0 = 1 |
| Wand-1 (8) at 600 | 45000 | brick + plate | plate gone at global 0 = 2 |
| Endgegner Main (3) at 650, y 95 | 16000 | 13, only part 5 (cannon, 5000, route 16) and 11 (turbine, `damagesBody`) unarmored | the turbine has plate part 12 (`Turbine unzerstörbar`, frame 10 = 1×1) until global 0 = 3 |
| Säge oben (14) / unten (15) | — | blade + motor, all armored | indestructible, block the lanes |
| Schienenkanone (12) | — | 2, armored | indestructible, fires weapon 7 (route 13) |

All walls are 54 × 284 and overlap in x (500 / 550 / 600); the walls drop in from
above with acceleration (speed 4, +0.3 per tick until y = 131), and the boss flies at
speed 1 from x = 800 to 650 (until about tick 150; only after that do its routes
continue).

**Flow** via the shared integer `Global[0]` (`SetGlobal`/`GetGlobal`, the file's
routes 8, 9, 3, 12, 14, 15, 16, 6):

1. Destroy Wand-3 (no shield). Its `deathSpawn` = 12050 calls the
   **Schienenkanone** on route 12: `Global[0] = 1`. Wand-2 swaps its plate to the
   1×1 frame.
2. Destroy Wand-2 (30000). `deathSpawn` = 14060: **Säge oben**, route 14 sets
   `Global[0] = 2` and `Global[1] = 1000`; the saw flies in from the left to x = 400
   and then swings with x = 220 + 185 · cos(a), a −= 1.2 per tick (period 300 ticks)
   at its height (85 or 218). The lower saw (route 15, spawned at level start) waits
   for `Global[0] ≥ 2` and does the same. Wand-1 swaps the plate. Wand-2 writes
   `Global[1] = (HP − 4000) / 500` each tick (clamped at 0 below); the Schienenkanone
   (route 13) reads it for its firing cadence.
3. Destroy Wand-1 (45000), **with the saws in front**: the saw blades together
   cover almost every height between the bot and the wall. `deathSpawn` = 7020:
   route 7 "Afterskript Letzte Mauer" sets `Global[0] = 3`. The saws fly off as soon
   as they see `Global[0] ≥ 3` in the swing phase (the upper one out the top, the
   lower one down; just under 100 ticks), boss part 10 (`Schwarzskript`) fires
   circular shots (weapon 5), and the plate on part 12 becomes the 1×1 frame.
4. Destroy the turbine (part 11, 16000 via `damagesBody`): state 4 (boss finale),
   ending as with the zeppelin (section "Boss finale").

**Why the simple bot fails** (with numbers from the run): it clears Wand-3 and
Wand-2 (Wand-2 falls at tick ≈ 1950, `Global[0] = 2`) as long as no saw is present.
After that Wand-1 loses about 2100 HP in the first 400 ticks (until the saws reach the
swing range), then it stalls at 42860: it aims at the nearest height of a living enemy
and picks the saws (HP 500, but armored), and its shot at height 157 hits the blade.
Even with a target selection restricted to vulnerable parts, Wand-1 stays at 42860 at
x = 100 (14000 ticks checked), because the lane is never clear. The boss (16000) and
saws stay untouched. The symptom's "small enemies" (type 6/7, HP 500, wandering) are
the saws, and the "second part" (type 1, 45000) is Wand-1.

**What works** (`test/lanebot.ts`, `test/boss-3-3.test.ts`): a pilot that flies up
to just in front of the frontmost vulnerable part (x = part − 60) and picks the
nearest height with a clear lane (the first part in front of the muzzle unarmored,
contour test as above, band `y + 32 … + 46`) clears the level invulnerable:
`Global[0]` = 1 at tick 451, 2 at 1951, 3 at 4357, boss state 4 at 5156, level cleared
at 5828 ticks (then `Play.txt` continues to 4-1, checked in the test).

**Open:** whether a human bypasses the saws differently in the original (e.g.
through the gap between the two blades at a certain swing phase) has not been checked;
the saw behavior on player contact (death on touch) is as with all enemies
(`SpielFeindberührung`) and is not tested in this section.

## Weapon emitter (`Me.C0C`, 51 × 0x78)

| Offset | Type | Meaning |
|---|---|---|
| +0x00 | Long | weapon |
| +0x04 / +0x08 | Long | enemy and part, −1: free emitter |
| +0x0C | Integer | active |
| +0x10 | Long[10] | remaining shots per salvo (start `repeat`) |
| +0x3C | Long[10] | delay per salvo (start `startDelay`) |
| +0x68 | Long | fired so far = number of the next shot |
| +0x6C / +0x70 | Single | origin of a free emitter |
| +0x74 | Long | target player |

Per tick and salvo `j`: as long as neither `delay[j] > 0` nor `left[j] < 0`:
fire, `fired++`, `left[j]--`, and if `left[j] ≥ 0` `delay[j] = interval`; afterwards
`delay[j]--`. The emitter dies when all salvos are empty or its part is dead. Origin:
the part's frame center (rotated to the edge for `turret`) plus `offsetX/Y`.

## Enemy shot (`Me.BE8`, 501 × 0x114)

| Offset | Type | Meaning |
|---|---|---|
| +0x00 / +0x04 | Single | x / y (top left) |
| +0x08 / +0x0C | Single | vx / vy |
| +0x10 | Integer | active |
| +0x14 | Single | damage (`Var` 32768) |
| +0x18 / +0x1C | Long | route (−1 straight ahead) / instruction pointer |
| +0x20 / +0x24 | Long | frame / frame timer |
| +0x28 | Single | speed |
| +0x2C | Long | number within the emitter (`Var` 32760); −1: shockwave (+0x30 age, +0x34 active duration) |
| +0x30 / +0x34 | Long | weapon / salvo |
| +0x38 | Single[8] | locals |
| +0x58 | Long[4] | hit box |
| +0x68 / +0x9C / +0xD0 | [13] | trail: x, y, surface |
| +0x104 / +0x108 | Single | alpha, alpha step |
| +0x10C | Single | wait counter |
| +0x110 | Long | the route's target player; never written, so always player 1 |

Aimed: angle from the top-left corner to the aim point `CLng(Spieler + (28,
31))`; at a D-Phyton `y = CLng(Rnd · 64 + y)` and `x` at the force (docked in front x,
behind x + 64, otherwise `CLng(Rnd · 64 + x)`).

**Shockwave** (`AddGegnerS(−1, 0, L, cx, cy, Ziel)`, `0x4AAF04`; death effect of
types with `deathShockwave`): radius `4 · Alter + 32`, active for `L − L\4` ticks.
Each tick every player in the radius (without an alive or invulnerability check) loses
0.1 energy and receives the push `(R − d)/5` away from the center (assigned, takes
effect next tick). No effect on enemies and shots, no `Rnd`, no image of its own (the
ring is the large particle kind 13).

## Effect animation (`0x588140`, 301 × 0x1C)

| Offset | Type | Meaning |
|---|---|---|
| +0x00 | Long | layer 0–6 |
| +0x04 | Long | animation |
| +0x08 | Integer | active |
| +0x0C / +0x10 | Single | origin |
| +0x14 | Array | track states of 0x34 each: x, y, r, g, b, a, rotation, frame, visible, scaleX, scaleY, Key, frame timer |
| +0x18 | Long | time since spawn |

`AddAnima(Ebene, Anim, y, [x])`: with `scrollWithLayer` the origin is
(800 + frac of the layer, y), otherwise (0, 0). Each tick it scrolls with the layer,
interpolates each track between the keys (deltas precomputed at load) and dies after
`duration` (except `loop`) or off the left edge. Draw path by group: a D3D quad with
color/rotation/blend, or a DirectDraw blit without those.

## Effects (`effects.ts`)

Everything visible with no gameplay effect. The original draws immediately (D3D)
in the same loops that compute; some draw paths draw `Rnd` (shake, bolts, the ship's
smoke, exhaust, radio window), others do so even without drawing. The port computes in
the simulation as a machine that draws every tick and leaves draw lists per tick; the
renderer merely plays them back. This keeps the shared random sequence aligned with
the routes.

| Pool | Size | Functions | Contents |
|---|---|---|---|
| small particles `Me.C30` | 2 layers × 1501 × 0x30 | `AddPartikel` `0x4EDAE0`, `AddCircle` `0x4EA360`, `MovePartikel` `0x4EDF80` | 2×2 sparks from `weiss`, life `Int(Rnd·20)+12` (+5), speed `(Int(Rnd·12)−6)/2`, gravity `gravity`; exactly 9 `Rnd` per spark |
| large particles `Me.C8C` | 4001 × 0x3C | `Add1BigPartikel` `0x4EA7E0`, `AddBigPartikel` `0x4EA920`, `MoveBigPartikel` `0x4EB7E0` | 18 kinds: bolt (0), embers `a_kreis2` (1, 16 additive), waves (2, 3, 13 `wave2`), strokes (4, 5, 15), fireballs `feuer0–3` (6–9, additive), smoke `rauch1–7` (10), debris of a part (12), glitter (14) |
| popups `Me.D34` | 101 × 0x18 | `AddPunkte` `0x50F750`, `SpielMovePunkte` `0x50FA00` | digits `n0–n9` spaced 8 apart, 30 ticks, from 1000 points on or with a combo |
| bubbles `Me.D58` | 201 × 0x14 | `AddBlase` `0x50F670`, `SpielMoveBlase` `0x50F430` | only underwater, 1 `Rnd` per bubble and tick |

**Standard explosion** `AddExplosionsPartikel` (`0x4EABE0`) over a rectangle
w×h: `N = CLng(2·w/64·h/64) + 1` points, each point 60% embers (64 px, orange, waits
`D` ticks) otherwise black smoke, plus `CLng(3·w/64·h/64) + 2` additive fireballs.
`D`/life 6/16 at an edge mean ≤ 64, otherwise 20/36. White style (`Me.520 ≠ 0`: ice
background 3, sky 5 in Skyfight, heavy rain, and in the original also on December 24 —
the port has no date) with white smoke and blue fireballs.

**Hits:** each player shot on an unarmored part, ten blue-white sparks in the
part rectangle (before the damage, 90 `Rnd`); the consumed shot leaves 16 px of embers
in the type's color, plus a spark at the landscape; a shot with overflow flies on
without embers. From weapon level 2 on, each shot draws a glowing trail. Enemy bullets
at the ship: a small red flash. Contact with enemies: a spark ring (60 sparks) and
+4 shake.

**Player:** `KillDove` (`0x50B0D0`) 500 orange and 100 blue sparks and blue
fireballs, no standard explosion. Below half energy, sparks and a small white cloud,
more often the less energy there is. Exhaust: three additive ember blobs, longer when
flying backward (`0x508AAD`).

**Shake** `SpielErschütterung` (`0x529BC0`): counter `Me.7D0` from explosions
(`Punkte\500 + 1` per part), `AddPunkte` from 1500 points on (`Punkte\500`) and
contact; per tick ±6 px (counter ≥ 19) or ±3 px. The original blits the playfield onto
itself; the freed strip keeps the old pixels (in the port it stays empty).

## Checkpoint and restart

**Gate** (`Me.CD8…CFC`, a single object): `SetCheckpoint` (`0x5202B0`) from
timeline kind 3 (1P only) or 7 (2P only), x = `CLng(800 + p1\2 + scrollPos)`.
`SpielCheckpoint` (`0x51FAA0`) draws 18 ember points on a breathing, rotating ellipse,
pass 0 behind the ship, pass 1 in front; pass 1 moves the gate with layer 3 and
triggers when a living player covers the center: **save first**, then +50 energy for
both, 1000 points with a popup, `Checkpoint.wav`, a still-image crossfade (α 1 → 0 over
20 ticks, section "Overlays"), and the gate widens and is gone after 80 ticks.

**Snapshot** `SaveCheckPointSub` (`0x51DF40`): one slot, each new one replaces
the old; almost the whole world (tick, enemies, animations, layers 1–6 with their
pointers, players, all shot, particle, popup, bubble and power-up pools, globals).
**Not** saved: layer 0, the gate, shake, `Rnd`, radio counter, music, score. It is
created mid-tick (after the enemy shots, before layer 6 and contact), and the saved
tick is N + 1. The first snapshot comes after the pre-roll. Port: a deep copy with
shared immutable data (`snapshot.ts`).

**Death → restart:** 99 ticks after `KillDove` the loop ends (`Me.580 = 1`,
`SpielSoundOFF` every tick; with no lives the music fades out). Then `VariabelnLösch`,
`LoadCheckpoint`, `DoveInit` of both ships (full energy, 100 ticks invulnerable,
position kept), one life fewer, score and combo best values from the moment of death, a
crossfade of the death image from α 0.6, stars from the snapshot, weather laid out
anew, save again, `SpielDoveWiedergeburt` (`0x50A620`: only particles and
`newborn1.wav`). No pre-roll, the music keeps playing, the radio breaks off. 2P with
lives and no boss: the player respawns alone at the partner, without a restart;
otherwise the partner dies too. With no lives: the Continue screen (see "Continue").

## HUD `SpielDisplay` (`0x510E10`)

Every tick after the fade-out, not shaken. Logic: extra lives at 300,000,
600,000, 1,200,000 … points (`n ≥ Me.524`, start 3 from `DoveReset` `0x4A6EC0`)
(`Liveup.wav`, the life digit glows for 50 ticks), the displayed score counts up in
steps of 5111/511/51/11/1. Drawing (1P, set `I` = ship type, in 2P `interface3_*`):

| Element | Image | Position |
|---|---|---|
| base image | `interface{I}_grund` 800×75 | (0, 525), covers 25 px of the playfield |
| lives | `leben{min(n, 9)}` | (122, 555) |
| energy | `interface{I}_energy`, width `CLng(E·w)\max` | (152, 556) |
| beam | `interface{I}_beam{Typ}`, width `w·Ladung\165` | (170, 578) |
| speed | `interface{I}_s`, fills from the bottom, empty at speed 4 up to full at 10 | (623, 565) |
| shot power | `interface{I}_p`, half from level 2 on, full at 3 | (587, 566) |
| extra weapon | `interface_extra{n−1}` | (647, 569) |
| score | `n0–n9`, 8 px, without leading zeros, centered around 751 | y 578 |

No boss bar, no energy warning in the HUD. *(Asset finding)* The energy bar is
blitted via DirectDraw with a color key; `interface*_energyA` is a separate background
image (drawn only with one option), not an alpha mask — the atlas treats it that way
since M8.

## Vibration (`AddForce` `0x529870`, `sim/rumble.ts`)

The original's joystick force feedback; in the port it is pure output
(`world.rumble`), the simulation never reads it and draws no `Rnd`. The host reads
`world.rumble.magnitude[Joystick]` after each tick (0…10000, 0 = off) and sets its
motors; it also owns `padOfPlayer` (joystick 1…2 per player, 0 for none; original
`Me.588270[Spieler + Spieleranzahl − 1]`), `rumbleBase` (base strength per joystick,
default 2500) and `rumbleOn`.

**Sources.** `AddForce(Stärke, Dauer, Spieler)` (method `0x91C`) enters a source
into the first free of the 21 slots (`Me.A0C` strength, `Me.A28` remaining duration in
ticks, `Me.A44` player; free = duration ≤ 0); a player outside 0…1 (−1 in the original)
calls itself for players 0 and 1 (two slots). If all slots are occupied, the source is
dropped. The arguments, as is usual in VB, stand as pointers right to left: player,
duration, strength.

**Tick** (`0x5299B0`, method `0x920`, at the end of every pass of `SpielLoop`,
**also in the Nova**, `0x53F614`): every source with duration > 0 counts down one tick
and adds its strength to the sum for its player's joystick (without a joystick it does
not count). The source therefore acts for `Dauer` ticks, starting in the tick it is
entered, if it is entered before the tick step (all triggers come before it in the
tick). A sum of 0 ends the force pulse (`DoForce` `0x57A190`); otherwise the sum is
clamped to 5 and the force pulse's strength, with the base strength `s` (500…10000,
default 2500), is `CLng((Summe − 1) · (10000 − s) / 4 + s)`, i.e. `s` at sum 1,
linearly up to 10000 at sum 5. It is set anew only if it changes and the joystick's
vibration is on.

**Triggers** (all callers of `0x91C`; player = the affected or triggering one):

| Original | Port | Strength | Duration | Condition |
|---|---|---|---|---|
| `CheckColisionWithEnemy` `0x4C4A87` | `enemies.ts` `killBy` (`vibrate`) | 1 | 20 | an enemy dies (a part with `vital` or the last part or body HP ≤ 0), player = shooter (−1 too: both) |
| `AddGegnerS` `0x4AAF51` | `world.ts` `makeEnemyWorld.shockwave` | 2 | 30 | a shockwave (type −1) is created (a free shot slot), player = the enemy's target |
| `SpielMoveGegnerS` `0x4AB9D9` | `world.ts` `shotWorld.hitPlayers` | 2 | 15 | an enemy shot hits a living player (regardless of invulnerability; after the hit sound) |
| `SpielMoveGegnerS` `0x4AC540` | `world.ts` `shotWorld.shockwave` | 1 | 1 | per tick of the shockwave for each player within the radius (`4·Alter + 32`) |
| `SpielKeysDove` `0x50824F` | `player.ts` `exitFlight` | 5 | 15 | exit flight: state 2 → 3 at the exit-flight height |
| `SpielDoveWiedergeburt` `0x50AFD5` | `world.ts` `rebirth` | 1 | 30 | rebirth after death (restart at the checkpoint, 2P alone) |
| `KillDove` `0x50B1AB` | `world.ts` `killPlayer` | 5 | 50 | death of the player (only when vulnerable and not already dying) |
| `SpielFeindberührung` `0x50BC18` | `world.ts` `contact` | 3 | 40 | enemy contact (energy −2 per touch; same tick as shake +4) |
| `SpielBeam` `0x5143A8` | `beam.ts` `fire` | 1 | 5 | the beam is released (charge > 0; after the sound, before damage) |
| `SpielErschütterung` `0x529C3D` | `world.ts` `shakeRumble` | 5 | 1 | shake counter `Me.7D0` > 50, both joysticks (player −1) |
| `SpielErschütterung` `0x529C72` | ditto | 3 | 1 | counter 20…50, player −1 |
| `SpielErschütterung` `0x529C98` | ditto | 1 | 1 | counter 1…19, player −1 |
| `SpielSpezial` `0x53C36F` | `special.ts` `escape` | 5 | 1 | special sequence 7 (escape): per player with `x < 150` (energy −0.1) |

The calls at `0x5298D4`/`0x529900` are the recursion of `AddForce` itself
(player −1). The shake vibrates regardless of the shake option (`Me.4FC`: the check
comes after the call); the counter is read before it is decremented, in the port in
`World.step` immediately before `stepShake`. All 13 callers outside `AddForce` have a
port counterpart; there is no debug-only caller.

The caller `0x5143A8` is in `SpielBeam` (`0x513940`), not in the HUD `0x510E10`
(that function extends to `0x513940`); it is not an energy-warning pulse but the beam
release. The sources are neither saved nor cleared at checkpoint, death and rebirth
(in the original too); only `World.step` in state ≠ 0 and the save screen's loop clear
them (`Rumble.clear`) so that the host reads 0.

Confidence: triggers, strengths, durations and the player argument from the
disassembly (high); the callers' conditions checked (high), for the enemy death and the
shockwave only the condition, not the exact place within the function (order relative
to effects and sound has no effect). The output formula from `0x5299B0`/`0x57A190`
(medium): the joystick → motor mapping and the effect of the strength (DirectInput
effect) depend on the device and are not reproduced in the port; `magnitude` is the
original's effect value (0…10000).

## Sound

DirectSound 7 via dx7vb: `LoadSound` (`0x4EE2E0`) allocates `extraVoices + 1`
buffers per sound, `PlaySound` (`0x4EEAA0`) takes them in turn. No panning, frequency
only on beam charging and thunder. Level sounds (timeline kind 1, route `PlaySound`)
are indices into the level's `Sound` list, the files live in the global `Sound.d2p`.
Timeline: `p2` 0 once, 1 loop, 2 stop, without rewind; route with rewind. Two volume
groups with the original's defaults: engine effects and enemy shot sounds at −10 dB
(0.316), level sounds and radio voices at 0 dB. `SpielSoundOFF` (`0x50C790`) stops
loops and level sounds (death, pause, Nova, level end), not the radio voice. The most
important engine sounds: `Explosion1/2.wav` (from 1500 points on), `spalt.wav` on an
animated kill, `Explosion.wav` for parts, `Hit.wav`, `ExplosionDOVE.wav`,
`newborn1.wav`, `Checkpoint.wav`, `Extra.wav`/`Speed.wav`, `Liveup.wav`.

## Radio and ticker (`radio.ts`)

`AddFunktion` (`0x4AC700`, timeline kind 2 and route): no queue, a new message
replaces the current one; `maxPlays` counts finished messages across deaths.
`SpielFunkmeldung` (`0x5101E0`) every tick from the HUD: group start without an image
(start the voice `voice/<Level>/<wav>`, subtitle into the ticker), then `ms\16` ticks of
display; duration 0 ends the message (truncated or swapped fields). Window
(5, 542)–(84, 592): speaker `0` draws nothing, otherwise 20 ticks of noise (`noise`,
randomly mirrored), then portrait `frame1–32` (advancing every 5 ticks, disturbed 10%
of the time) under noise from 100 to 30%. The ticker (`AddMsg`/`ShowMSGS`,
`0x50FB90`/`0x50FCC0`) assembles all entries with spacing and scrolls them in from the
right (Courier 12, RGB(64, 255, 64), at (575, 552)); a restart clears it. Texts in the
game language (D/E/R), voices only in English; for Russian there are only subtitles
("Languages").

## Music

vbogg streams the file from the level's `music` field and restarts it after it
ends. Volume per tick `90 · Me.1C0 / 100`, `Me.1C0` falls by 2 per tick in the last 50
ticks, by 1 on the last life. No boss switch — bosses are their own levels with their
own music. Continue plays `Continue.ogg` once, then the level music fades in over 20
ticks.

## Continue (`Continue` `0x521790`)

After death with no lives (SpielLoop #264, 2P: shared lives): radio off,
`AddHighscore` (`0x577A90`) per player with the **full** score, place 1…10 as
"‹Name› landet auf Platz N!" / "‹Name› ranked at place N!" (Arial 24, centered around
x 400, y 490 + 20·p). Background: the last game frame with 30% black; `Continue.ogg`
once at full music volume. Its own loop with `Wait 40` (25 Hz): countdown 9 → 0, 28
passes per step (1.12 s, 10.08 s in total), Esc/D/Q held +9 per pass → 3 passes per
step. The "0" stays for one pass, then the "television" switches off (50 passes of
shrinking image, 7 glow stroke `a_kreis2`, 15 trailing ≈ 2.9 s; nothing is cleared,
only darkened by 15%) → Game Over → main menu. Confirm: fire/beam (not during the exit
flight), space, Enter — held keys count immediately, none without focus. Per pass 101
snowflakes 2×2 and up to three 1×600 strips (white α 0.8 additive), "Continue" and the
digit (cell 128 px, "Orbit-B BT" missing → Arial, shadow ±2 px, the digit jitters by
±10 px in the first 15 passes), 10% of the time an image tear, and finally the whole
image coarsened to 64×64 with α `Rnd/2 + 0,1` over it. "Yes": `speech.wav` (0 dB),
lives 4 (2P 7), score `\ 3` per player, extra-life threshold 3, level music from the
start with a fade-in over 20 ticks, then the normal restart (one life fewer → 3 or 6).

**Randomness:** both screens draw from the global `Rnd` in the original (Continue
207–211 calls per drawn pass, 1 on switch-off), depending on real time and dropped
frames. The port draws the same calls in the same order from `World.rnd` as if every
pass were drawn — so the sequence after the Continue depends only on the inputs. Per
displayed frame only the last due pass is drawn.

**Highscore:** 10 places (name, score, game ID; one place per game), saved at the
host (`highscores`, JSON), name "Bruce" (default for an empty name; the port has no name
menu yet). Implementation: `src/game/continueScreen.ts` (logic), `continueView.ts`,
`highscore.ts`; visual check `#/dovez?screen=continue`.

## Pause (`Pause` `0x524610`)

Trigger at the end of every tick: Esc (`TastePause`, gamepad Start) or loss of
focus (port: window `blur`, hidden page). On entry `SpielSoundOFF`, the radio voice
paused (position remembered), music muted (keeps playing), `Pause.wav` (−10 dB). Only
once Esc/D/Q are released does the loop run with `Wait 16`: black, the game frame at
half size in the preview (288, 77)–(688, 377) with a scan stripe (every other row
offset by 2 px, `balken` α 0.1 additive) and, randomly (2% per frame in rows 21…234),
45 frames of lens distortion with noise dots and lines, over it `pausescreen` (black
transparent), the menu "WEITER"/"RESUME" and "EXIT" (Arial, selected 26 px, otherwise
21 px, at (118, 89)/(118, 120)), the title "Level1-1 Skyfight (Bruce)" (Arial 20, green
with shadow, (120, 35)), the radio log (the ticker, Arial 18, 7 lines of 530 px from
(135, 412), newest at the bottom, wrapped at the front) and, in the first 19 frames,
the game frame over it (α 0.95 → 0.05). ↑/↓ select, no other highlight. Esc/D/Q always
resumes; OK (fire/beam, space, Enter) on EXIT records the highscore → main menu,
otherwise continue. Leaving only via "WEITER": `Pause.wav`, music volume and radio
voice restored. Then wait for release again; in the game the last pause frame (0…550)
fades out over 20 ticks, the paused time is not made up. Not reproduced:
`Screenshot.bmp`; the port creates the image for the loading-screen mosaic
("Campaign"). The port restarts the weapons' looping sounds after the pause (the
original polls their buffer each tick). Implementation: `src/game/pauseScreen.ts`
(logic), `pauseView.ts`; visual check `#/dovez?screen=pause`.

## Campaign (`LevelSkript` `0x54D3F0`, main loop `0x54E430`)

The program's main loop calls `LevelSkript` → `LadeDaten` → `SpielLoop` →
`LevelSkript` …; if `LevelSkript` returns False, it goes to the main menu.
`LevelSkript` reads `Play.txt` (in `Play.d2p`) up to line `Me.115C`, counts on and
checks the first word case-insensitively:

| Instruction | Effect |
|---|---|
| `Load <level>,<image>` | level name `[0x5880C4]`, loading image `Me.1160`, `DovePosSetup`, True → `LadeDaten` + `SpielLoop` |
| `Save` | `SaveGame` immediately (the screen is the prompt) |
| `Play <file.avi>` | "Loading" (System 18, white, 376/490), Flip, `PlayAVIFile(…, "Video.d2p")`, black |
| `credits` | highscore, `[0x588080] = Me.6D8` if greater, "Loading", `Outro<language>.avi` (from run 2 on `Outro2…`), `ShowCredits`; from run 2 on the level **Epilog** (empty loading image), otherwise end of script |
| end of file | `AddHighscore` for all players, False → menu |

New game: `Me.115C = 0` → `DoveReset`. Single levels (bonus, `-Skip`) set
`Me.1158`: after the level `Me.115C = 10000` (end). Whether a level is cleared is held
only in `mode`: `SpielLoop` ends at `Me.580 = 2` with `mode = 0` (next instruction);
Game Over (Continue "no") and Pause "EXIT" set `mode = 9` → `LevelSkript` returns False
(menu). At level end there is no bonus and no jingle: exit flight from `Me.588 − 150`,
music and fade-out in the last 50 ticks, then `SpielSoundOFF`, `KillCheckpoint`,
`StopOgg`. `Me.6D8` is the current run (`[0x588080] + 1` at a new game), `[0x588080]`
the highest cleared (configuration).

**What carries from level to level:** only `DoveReset` (new game) sets lives 3/6,
score, shot power 1, speed 6, secondary weapon, max energy 100, particle slots, force,
drones, `Me.524 = 3` (extra lives from 300,000 on). Per level, `DovePosSetup`
(position, tilt, exit flight, cooldowns, combo best values, particles to the ship
center), `VariabelnLösch` (all pools, combo, beam, radio, Nova) and `DoveInit`
(energy = maximum, 100 ticks invulnerable) reset; everything else carries over. The
`Rnd` sequence runs through. Port: `World.carry()`/option `carry` (`sim/world.ts`), one
`VbRnd` per game.

**Loading screen** (`LadeDaten` `0x4C72C0`): with image `Take<n>` from
`Loading.d2p` (600 × 480, stretched to 800 × 600, *medium*; `Take9` is 8 × 8), per
loaded level image a bar (290, 480)…(290 + 220·p) 6 px black → RGB(137, 190, 255), a
white frame (290, 476)–(510, 484), "nn%" (System 16 at 410 − 5·Len, 455), "Loading"
(376, 490); then "Press any key to start!" (System 24, gray `CLng(Sin(k°)·63 + 192)`,
294/470, in English even in German) until `TasteOK` or Esc, wait for Esc release.
Without an image (single level, Epilog) the mosaic `Loadingscreen.bmp`: 16 tiles of
200 × 150 from `NewPictureToLoadingscreen` (`0x520F50`, on opening the pause and after
each death, in turn `Me.1CC`), 90% black, additive bands and glow circles, logo
(200, 120), "nn%" (System 32); no key press. No sound, no `Rnd`. `p` in the original is
the fraction of image groups, in the port of the loaded bytes.

**Video** (`PlayAVIFile` `0x551930`, DirectShow): option videos off → nothing;
800 × 600 1:1, sound 0 dB (independent of the music volume), silent without sound; ends
at `CLng(Position) ≥ CLng(Dauer)` (up to 0.5 s before the last frame), abort only with
Esc (immediately), then wait for release; no music. The intro (`introD/E.avi`, loose)
runs only at the first menu start. Port: `<video>` as a Pixi texture, sound through the
effect bus, `video=0` disables it.

**Save screen** (`SaveGame` `0x541010`): the players' places via `AddHighscore`
(2P: a tie puts player 1 behind player 2), background 4 (red plasma, fresh stars) and
the HUD run along, `Save_Screen.ogg` looping, the logo slides in (`xLogo = CLng(xLogo /
4)` from −400), fade-in `1 − Me.584/50`. Texts Arial with a black shadow +2/+2:
"<Level> geschafft!"/"Cleared!" 24 (50, 170), "Spieler n: Punkte (HIGHSCORE: p. Platz!)"
18 (50, 180 + 20n), "Spiel speichern?" 24 (50, 280), top 10 on the right (x 460, score
right-aligned 788, y 20n − 10, `QBColor(14)` yellow only for player 1 alone — the
condition excludes 2P), "Nicht speichern" 16 (50, 310), places 3 × 7 (x 230·column + 50,
y 20·row + 315, selected yellow and 17). Keys with edge: up/down 0…21 with wraparound,
right/left ±7 (only from place 1; 15 + 7 = 22 is not a place but is held). OK or Esc act
on release; OK on a place saves (without a prompt), then "Gespeichert" (Arial 150,
20/150) or "Saved" (Arial 300, 20/120), `Save.wav`; always `FadeOut(0, False)`. Whoever
ends the level with fire held leaves the screen on release — as in the original.

**Save** `App\save\<1…21>.sav` (version 4): label "P<player> S<ship><run as a
letter> - <level up to "-x">  <date>", then zlib: player count, `Me.1158/115C/1160`,
`B48[0..1]`, `A7C[0..1]`, force, particle slots, beam block, `Me.524`, `Me.6D8` (no
drones, no world). The index comes after `Save`: loading begins with the interstitial
video. The port saves the same content as JSON at the host (`save/<n>`, `saveGame.ts`);
entry `#/dovez?load=<n>`.

**`FadeOut(richtung, abbrechbar)`** (`0x545C70`): 80 × `Wait 16`; the image is
copied into a rectangle squeezed by 16 px (direction 0 top and bottom, otherwise one
side per `Int(Rnd · 4)`, plus one unused `Rnd`), darkened by 20% and the initial image
laid over it at α 0.95 − 0.05 per pass.

**Credits** (`ShowCredits` `0x5566C0`): `credits` 500 × 3000 at (150, 600 − t) on
black, 1 px per `Wait 25` (40 Hz), t = 0…3600 (≈ 90 s); every 3 passes glitter
(`Add1BigPartikel` kind 14, size 60, delay 3, life 12) at bright pixels (blue ≥ 128,
every 6th column) of the image rows at y = 3 and y = 600; per pass `Rnd < 0.1` → a
golden spark (three more `Rnd`: x, y, growth ·10); `balken` black as soft edges
(0, −50)–(800, 50) and (0, 550)–(800, 650); music `Enhaced Credits.ogg`; Esc ends
immediately; then `FadeOut(1, False)` and music off in ~0.18 s. Port:
`src/game/campaign.ts` (flow), `Game.ts`, `level.ts`, `loadingScreen.ts`,
`videoScene.ts`, `saveScreen.ts`, `credits.ts`, `fadeOut.ts`, `mosaic.ts`; visual check
`#/dovez?screen=save|credits`.

Open: the byte layout of the beam block in the `.sav`, and whether the `Take`
images are really stretched.

## Main menu (`MenuLoop` `0x559630`, `ShowMenu` `0x558890`, `ShowLogo` `0x553730`)

**Start** (only on the first call): `LoadMenuSurfaces` rolls the hangar
(`Int(Rnd · 2)`, before every menu), then three `ShowLogo`: Intergenies (42, 30, 0, −1)
with `Logo.wav` and a glitch intro — 91 passes of `Wait 31`: black, the logo three
times via `RenderVerzerrt` (grid 20 × 20, texture coordinates `(i/n − pu·D, j/n −
pv·D)`, `D = sin 9i°·cos 9i°·sin 9j°·cos 9j°`; α 0.33, normal/additive/additive; angle
renewed every 5…15 frames, 3 `Rnd`), noise (α = sin 2t°/4 + 0.3·Rnd, 48 `Rnd`), line
tear (61 bands of 7 px from y = 90, by `CLng(CLng((50 − 50·cos 4t°)·sin(y·0,3°)) +
5·Rnd)` px to the right, only from 3 px on) —, then 72 frames full (`Wait 25`) and
`FadeOut(0, True)`; Toxeen and Clockwork (40, 30, 0, 0): 30 frames fade-in, 40 hold, 50
frames zoom tunnel (image onto (16, 16)–(784, 584) onto itself, 10% black, logo α
0.80 … 0). Each display draws 1 `Rnd`. Esc ends each phase immediately (without
release). Then `intro<D|E>.avi`, the menu fades in from the bare hangar (α 0.95 … 0),
`intro.ogg` looping. The original never shows `Magnussoft` and `menu_logo`.

**Every pass** (`Wait 18`, no frame dropping): black, `hangar<h>`, from pass ≈ 101
on `hangar_frozen<h>` over it (α +0.01 per frame, alone from 1 on) and noise (α up to
0.025, 48 `Rnd`), the DoveZ logo (200, 0), the page, sparks and glitter, a crossfade
(`Blenden`: capture the image, α 0.95 → 0), noise. The button bar (`ShowMenu`) slides
with /4 toward the page target (start x = −1000): a red (with gaps) and white chain of
dots from `a_kreis2` 3 × 3 (1 `Rnd` per dot, 1 : 20,000 a burst of 10 sparks —
2·(⌊(67n + 82)/2⌋ + 1) `Rnd` per frame, 352 in the main menu), lamps (50, 66 + 67i)
green for the selected one, buttons (136 + offset, 83 + 67i; for the selected one the
offset slides to 30, otherwise −3), `menu_topg`, `menu_bottomg`, texts Arial 36 gray
with a black offset +1/+1. Panels `menu_back` slide in from the right
(k = 400/460/320/700 → `CLng(0,75k − 1)`); lists (`ShowList`) only at k = 0, Arial 24,
colors QBColor 8 (inactive), 7 (selectable), 15 (selected). Ship rotation on page 1:
`shipselect1…` backward (D-Tonator) or `shipselect0…` forward, 2 frames per level, four
layers for motion blur, at (510 + k, 310). Highscore page: four additive glow bands and
one glitter per frame (7 `Rnd`).

## Key configuration (page 33, `InitKeyConfig` `0x504BA0`, `Taste` `0x54FE40`)

**Model:** The binding is an array of 6 blocks × 10 `Long` at `0x588174`
(block = set for `T1`, block + 3 = `T2`; set 0 one player, 1 and 2 in the two-player
game). Actions 0…9: left, up, right, down, fire, beam, switch satellite/particle, force
mode, rotate particle, Supernova. `Taste(Satz, Aktion)` is true when `Keys(T1)`
**or** `Keys(T2)` is held (entries ≤ 0 do not count). `InitKeyConfig(Satz, Gerät)`
clears both blocks and fills, for device 0 (keyboard):

| Set | `T1` (DIK) | `T2` |
|---|---|---|
| 0 | ←, ↑, →, ↓, S, A, D, Q, W, E | – |
| 1 | J, I, L, K, S, A, D, Q, W, E | ←, ↑, →, ↓ |
| 2 | Num 4, Num 8, Num 6, Num 5, Ende, Entf, Bild ↓, Einfg, Pos 1, Bild ↑ | – (only down: Num 2) |

Extra keys are not in the array (space fires in single-player, F11 honks).
Device ≠ 0 (DirectInput joystick) fills the blocks with button numbers (`0x58838C`); in
the port this is dropped, a pad acts as a keyboard through the shell. `KeyName`
(`0x578820`) returns the names of the 69 known DIK codes (German labels: DIK `0x15` is
called "Z", `0x2C` "Y", `0x1D` "L. Ctrl", `0x4B` "Num. 4", `0xC7` "Pos 1", `0xD3`
"Entf."), otherwise the number; `GetKeyText(T1, T2)` (`0x559400`) turns that into "a" or
"a / b".

**Page** (list at (390, 130)): 0 title, 1 dashes, 2 empty, 3 "Steuerung für …"
(OK cycles the set 0→1→2→0), 4 "Gerät: Tastatur" (OK cycles through the devices; without
a joystick it stays the keyboard), 5 empty, 6…15 the ten actions with "Name: Tasten"
(selectable), 16…19 empty, 20 "Einstellungen übernehmen", 21 "Zurück". On entry (from
page 30) the binding is backed up (`CopyBytes` 264 bytes); changes take effect
immediately (also for menu control), **Apply** updates the backup, **Back** and Esc
restore it and leave the page. Sounds: lines 3 and 4 `plingding`, otherwise `dude`.

**Capture** (OK on 6…15): the loop waits (`DoEvents`) until OK is released, then
runs each pass: the highest held DIK number 1…211 (excluding Esc) becomes the key; if
Esc is held, abort (after Esc is released, binding unchanged); otherwise the action's
`T2` := 0, then := key, and as long as the key is held, every further held key (highest
number, excluding the first and Esc) replaces `T2`. During capture `ShowList` blocks
↑/↓ and the selected line blinks: the line's second color is yellow instead of white
when `(Me.584 \ 3) Mod 2 = 0`. OK and Back are free once the keys are released. Port:
`game/input.ts` (`readInput`, `keyName`, `keyText`, `useKeys`, DIK table),
`game/config.ts` (`keys`: the 30 `T2` entries as `KeyboardEvent.code`, `""` = none),
`menu/menuLogic.ts` (`stepCapture`, `working`); the shell supplies the held keys via
`KeyState.held()` (keyboard only, the pad shows no stick deflections to the capture).
The original's lines 16…18 (only with a joystick: fire button, vibration on/off,
strength) follow with vibration.

**Pages:** 3 main menu (New, Load, Options, Highscore, Exit; Esc = Exit), 10 player
count (2 players without a crossfade, as in the original), 1 ship (only player 1
chooses, player 2 flies the other), 2 name (`KeyAscii` from 32 on, at most 16,
Backspace, Enter; empty → "Bruce"; game ID `Int(Rnd · 10000) + Durchgänge · 10000`,
unique), 20 load game (places 1–21, default selection "Back"), 30 options (bonus only
after one playthrough), 31 basic settings (force key `Me.512`, auto-arrange `Me.50E`,
inertia `Me.510`), 32 volume (music +5 with wraparound; sound/voice +250 dB/100, muted
above 0), 33 key configuration, 40 bonus (Jungle, Space, Stift depending on
playthroughs; as single levels), 50 highscore. ↑/↓ and OK with edge, no repeat, with
wraparound; there is no left/right; Back is Esc/D/Q, in the main menu and on pages 1
and 2 only Esc. Sounds: OK `dude`, toggle `plingding`, voice test `speech`. After a game
start `FadeOut(1, False)`; Game Over, EXIT and end of script lead back to the menu
(without logos), "Exit" quits the program (in the port: back to the shell). There is no
credits entry; the Easter egg "LOV" is in the section "Easter egg LOV".

Port: `src/game/menu/` (`menuLogic.ts` logic, `menuView.ts` drawing, `menuScene.ts`
timing, sounds, character input, `logos.ts` logos), options in `src/game/config.ts`
(saved on change). Deviations: Russian is missing; inertia ("Realistic") acts as
coasting after release (the order within the tick not checked against the original);
the key page knows only the keyboard (see "Key configuration"); vibration: the
simulation provides `world.rumble.magnitude` (section "Vibration"). `#/dovez?nointro=1`
starts without logos and intro.

## Easter egg LOV (`0x546C30`, called via `Me+0x960` at the end of `MenuLoop`)

**Trigger** (`0x55BD55`–`0x55BDB5`, main menu): if L (DIK `0x26`), O (`0x18`)
and V (`0x2F`) are held at the same time (`[0x588300 + 2·DIK] ≠ 0`, all three),
`MenuLoop` sets `[0x588018] = 8` and leaves the loop (every pass counts, without an
edge, only on the main menu page). At the end of the loop, with "sound on", `StopOgg`
(stub `0x40D1CC`, the menu music ends) and `0x57A3C0` follow; the branch
`cmp [0x588018], 8` (`0x56998D`) sets `[0x588018] = 0`, calls `Me.960` and then
`[0x588018] = 0xA` — **program exit**, like "Exit". The function itself has no music or
sound call: the Easter egg runs silently.

**Setup** (once, before the loop):

1. `FadeOut(0, False)` (`Me.95C`, `0x545C70`) over the menu image (1 `Rnd`).
2. `Me.83C` (`0x4FCB10`) loads the standard surfaces: `Standart.d2p`, `Blur`,
   `Blur3`, `Glitzer` (`Me.72C`), `A_KREIS2` (`Me.730`), `weiss` (`Me.758`).
3. `Me.506 = False`, `Me.520 = 1` (explosion style white), `Me.584 = 0`.
4. **Lettering "JULIA"**: five lines of pixel font `0x412CD4`, `0x412D04`,
   `0x412D34`, `0x412D64`, `0x412D94` (21 characters each, `.` = dot; J, U, L, I, A,
   5 lines tall). Line by line (row 0…4, column 1…length) a record (0x18 bytes,
   `ReDim Preserve pts(0 To n)`, fields `x` +0, `y` +4, `vx` +8, `vy` +C, `tx` +10,
   `ty` +14) is created for each `.`: target `tx = 32 · Spalte + 10`, `ty = 32 · Zeile
   + 180`, start `x = Rnd · 1032 − 132`, then `y = Rnd · 832 − 132`, speed 0. That is
   **44 points** (9/7/10/8/10 per row), **88 `Rnd`**, in row order.
5. After that the five lines are overwritten with the heart lines (`0x412DC4`
   ` ..  ..`, `0x412DD8` `........`, `0x412DFC` ` ......`, `0x412E10` `  ....`,
   `0x412E24` `   ..`; the first copy of the lettering is no longer needed).
6. `Me.6DC…6E8 = (0, 0, 800, 600)` (source rectangle, unused here); a black
   full-screen rectangle on `weiss` (without `RenderStart`, the first loop frame covers
   it with black anyway); `Me.7CC = 4` (background 4, the save screen's red plasma),
   `Me.10CC = True` (lay out the spots anew), `Me.584 = 0`.
7. `Wait 1000` (`Me.85C`): one second of black.

**Loop** (`Wait 18`, ≈ 55.6 Hz, every pass is drawn — `Me.4FE` has no effect here,
the draw calls do not test `Me.4FC`). Head: runs as long as `[[0x588300] + 2] = 0`
(Esc, DIK 1, from the **previous** key read) and `[0x588018] = 0` (otherwise set by
other sections, e.g. on closing the window; nobody writes to it in the loop). Per pass,
in this order:

1. Read keys (`0x5780C0`), `Me.584 += 1` (so `t = 1, 2, …`).
2. `t = 400`: heart (below).
3. `t > 600`: glitter particles (below), **5 `Rnd`**.
4. `Me.50A = Me.50C = False`; `RenderStart` (`Me.874`, `0x506EA0`);
   `SpielMoveHintergrund` (`Me.8A8`, mode 4, as on the save screen: on the first pass
   505 `Rnd` for the 101 spots, none afterwards; black, 101 red `a_kreis2` spots into
   the corner 64 × 64, captured via `blur` and stretched to 800 × 600).
5. `t < 100`: `weiss` (0, 0)–(800, 600) in black, α = `(100 − t) / 100`, normal —
   fade-in from black over the first 99 passes.
6. **Points**, `For i = 0 To n` (`n` = count − 1, `Me.71C = i`):
   `vx += (tx − x) / 10`, `vy += (ty − y) / 8`;
   `x += vx + Sin(10 · (t + i)°)`, `y += vy + Cos(10 · (t + i)°)` (`Me.7D4`
   `0x4E9DF0` = table `Me.4C4` sine, `Me.7D0` `0x4E9D50` = `Me.4E0` cosine, integer
   degrees); then `vx, vy ·= 0,95` (all `Single`). Per point, right after, the red
   glow: `SetUpColor(A_KREIS2, 1, 0,2, 0,1, 0,7)`, `SetUpRect(x, y, x + 64, y + 64)`,
   `Render(…, additiv)`.
7. A second pass over the same points: `SetUpColor(Glitzer, 1, 1, 1, 0,2)`, the
   same rectangle, additive — a white star on each point.
8. `t > 750`: `RenderEnd` (`Me.878`), `GetDC` of the backbuffer (`Me.1E4`, +0x68),
   `SetFont(hdc, "Arial", 28)` (`0x57DE40`), three times `Text` (`0x57DD50`,
   transparent) "Ich liebe dich" (`0x412E34`): black at (620, 565), black at
   (622, 567), then in `RGB(g, g, g)` at (621, 566) with `g = min(t − 750, 128)`;
   `0x57DF40`, `ReleaseDC`, `RenderStart`.
9. `MovePartikel(1)` (`Me.800`, empty — no small particles are created),
   `MoveBigPartikel` (`Me.7F8`): the glitter (over the text). `Me.514` (still-image
   crossfade), `Me.50A`, `Me.50C` are off.
10. `RenderEnd`, `Flip` (`Me.794`), `Wait 18`.

**Heart** (`t = 400`, once): `n = −1`; column 1…20 **outer**, row 0…4 inner
(unlike the lettering!): if `Len(Zeile) ≥ Spalte` and the character is `.`, the next
record (0, 1, 2, …) gets the target `tx = 16 · Spalte + 300`, `ty = 16 · Zeile + 250`.
The heart has 24 points; **`n` is 23 afterwards** — the loops now only run over the
first 24 records, the remaining 20 (rest of J, U, L, I, A: rows 2…4) are no longer
moved or drawn and vanish. The 24 spring from the lettering to the heart in the center
of the screen (targets `(316…428, 250…314)` are top-left corners of the 64 px
rectangles, the circle center lies 32 px further down-right; heart center ≈ (404,
314)).

**Glitter rain** (`t > 600`, per pass): five `Rnd` in the order `r1…r5`, then
`Add1BigPartikel(336, −128, r1 · 8 − 4, r2 · 10 + 5, 1, r3 · 0,5 + 0,5, r4 · 0,2, Größe
128, Verzögerung 0, Leben 50, Art 14, Wachstum r5 · 20 − 15)`: a `glitzer` (kind 14,
additive, rotation `(t mod 90) · 4°`) falls from the top at (336, −128), changes its
size by `Wachstum` per tick (−15 … +5, mostly shrinking around the fixed center; the
size goes negative and mirrors the image — D3D draws without culling, `RenderStart`
sets `CULLMODE = NONE`), color orange to yellow (red 1, green 0.5…1, blue 0…0.2), speed
`vx = −4…4`, `vy = 5…15` (falls downward).

**End:** Esc (only Esc, without waiting for release; the test at the loop head sees
the state of the previous key read) → `FadeOut(0, False)` (not cancelable) →
`if [0x588018] = 2 then [0x588018] = 0` (`0x548C29`, no effect in the port) → return to
`MenuLoop`, which sets mode 0xA (program exit). The error branch from `0x548C48` on
(`DDERR_SURFACELOST` `0x887601C2`: restore all surfaces and continue the loop, otherwise
mode 0xA) is DirectDraw and is dropped in the port.

**Timeline** (pass at 18 ms, times from loop start, 1 s lead-in before): 0–1.8 s
fade-in (the points spring in from random places from the first pass on, they reach
their target after ≈ 3 s), 7.2 s heart (20 points vanish), 10.8 s glitter rain, 13.5 s
the text appears (dark) and brightens until 15.8 s (gray 128, half brightness; black
edges), then the image stays until Esc.

**Confidence:** flow, numbers, colors, rectangles and `Rnd` order high (the
function is fully read, 44 points and 24 heart points counted by script, the plasma and
particles are those of the save screen and the credits respectively). Medium: the font
size (28 as the GDI cell height as in the other `SetFont` calls), the actual length of
the `Wait 1000` (the clock `Me.544` has been running since the last `Wait`, the loading
of `Me.83C` counts toward it), whether sparks of the particle pools left over from the
menu in the original image reach into the first passes (the port starts with empty
pools), and whether the silence is really silent (there are no sound calls in
`0x546C30`; whether `0x57A3C0` or `StopOgg` at the end of the loop do anything else to
the menu music was not checked). Not verifiable without a run of the original:
anti-aliasing of the GDI text and the exact time intervals.

Port: `src/game/love.ts` (logic), `loveView.ts` (drawing via the `Compositor`),
`loveScene.ts` (timing, Esc); wiring in `Game.ts`: after the menu result "love"
`FadeScene(FadeLogic(0, rnd))`, then `LoveScene(host, app, textures, standart, new
LoveLogic(rnd))`, then `FadeScene(FadeLogic(0, rnd))` and back to the shell as with
"Exit". Test: `test/love.test.ts` (among others: `Rnd` draw per pass 88 / 505 / 0 / 5,
plasma same as `Environment.moveBackground` on the save screen). `src/game/config.ts`
(saved on change). Languages: see "Languages". Deviations: the key page only displays
the binding (rebinding is still missing); inertia ("Realistic") can be toggled but has
no effect yet (the port only knows Arcade); no vibration. `#/dovez?nointro=1` starts
without logos and intro.

## Languages (`Me.588070`: "D", "E", "R")

DoveZ knows three languages. `Me.588070` (`0x588070`) is a string holding the
letter: `0x4A60E0` sets "E" at startup (`0x40F814`), and `config.cfg` (`0x504E80`)
overwrites it — version 1 stores a boolean ("D" if true, otherwise "E"), from version 2
on the string itself is read (`Get #f`); that is how "R" gets in. The config dialog's
buttons set only "D" (`0x57D180`) and "E" (`0x57D220`); so "R" is in the `config.cfg` of
the Russian release. *(The default is therefore "E", not "D"; the port falls back to
English for an unknown locale.)* Every text spot compares with `StrCmp(Me.588070,
"D"/"E"/"R")` — usually as a chain D → E → R, at some spots only "R" against "everything
else" or only "D" against "everything else" (then even Russian shows English there).
For a different value the key hint and the Pause menu item "Weiter" stay empty.
Constants: `0x411414` = "D", `0x40F814` = "E", `0x410600` = "R".

**Russian texts:** in the program they are stored as UTF-16 constants whose
characters are actually CP1251 bytes (`0x415244` shows "Êîíôèãóðàöèÿ" =
"Конфигурация"); VB converts them back to the system code page with `StrToAnsi`, and
GDI draws them with `CreateFontA(…, Charset = [0x5886DC], …)` (`0x57DE7F`: only for "R"
the charset of the form font, otherwise 0). The port has decoded them (`menuTexts.ts`,
`saveScreen.ts`, `lang.ts`) and draws Unicode with Arial. Their order in the code is
the DE ↔ EN ↔ RU mapping per line.

### Switches and their branches

| Location | Function | Text or effect |
|---|---|---|
| `0x4CA9D8` | `LadeDaten` (`0x4C72C0`) | "Loading" (System 18, white, 376/490); **R** "Загрузка" at **372**/490. The same in `LevelSkript` at `Play` (`0x54D826`) and `credits` (`0x54DC21`) |
| `0x4CFB00` | `LadeDaten` | "Press any key to start!" (System 24, y 470): D and E English at x 294; **R** "Нажмите любую клавишу для старта!" at x **214** |
| `0x4CEFB9`, `0x4CF118` | `LadeDaten` | radio file `<name><D\|E\|R>.txt` (existence check, otherwise "Textdatei nicht gefunden") |
| `0x5232B3` | `Continue` (`0x521790`) | only "D": "… landet auf Platz N!", otherwise English — **R shows "ranked at place N!"** |
| `0x527187`/`0x527240`/`0x5272F9` | `Pause` (`0x524610`) | R "Продолжить", E "RESUME", D "WEITER" at (118, 89), Arial 26 selected/21 |
| `0x527413` | `Pause` | R "Выход", otherwise "EXIT" at (118, 120) |
| `0x5275BA` | `Pause` | title: R `Replace(Left(Lvl, InStr(Lvl, "-") + 1), "Level", "Уровень")` → "Уровень1-1 (Bruce)", otherwise the full name "Level1-1 Skyfight (Bruce)" |
| `0x539DF0` | `SpielSpezial` (`0x538CF0`) | key hint (Arial 70): R "Нажмите: ", E "Press: ", D "Drücke: " |
| `0x541183` | `SaveGame` (`0x541010`) | place 0: R "Не сохранено", E "Don't Save", D "Nicht speichern" |
| `0x541FE0` (R), `0x5425D2` (E), `0x542C5A` (D) | `SaveGame` | header and player lines, see below |
| `0x544AA2` | `SaveGame` | label: R replaces "Level" with "Уровень" in the level name (`Replace`, otherwise `Left(Lvl, InStr+1)` as before) |
| `0x544F06`/`0x545061`/`0x5451B5` | `SaveGame` | "Gespeichert" (Arial 150, 20/150), "Saved" (300, 20/120), **R "Сохранено" (Arial 170, 20/140)**, shadow +2/+2 |
| `0x54DD63`, `0x54DDD0`, `0x559BCA` | `LevelSkript`, `MenuLoop` | video file `Outro2<S>.avi`, `Outro<S>.avi`, `intro<S>.avi` with the language's letter |
| `0x559567`… | `OnOff` (`0x559530`) | D "Ein"/"Aus", E "On"/"Off", R "Вкл."/"Выкл." |
| `0x55A696`… `0x568BB4` | `MenuLoop` (`0x559630`) | 27 spots, table below |

**Save screen in Russian** (`0x541FE0`): the branch is a separate copy with the
same positions but different content: "Уровень расчищен!" **without the level name**
(24 at 50/170), "Сохранить игру? " (50/280), per player "1 игрок: "/"2 игрок: " + score
(18 at 50/200, 50/220) — **without** the highscore place "(HIGHSCORE: n. Platz!)". D
and E stay as they were.

**Main menu in Russian** (`menuTexts.ts`; the constants' addresses are there):

| Page | Russian (differences from D/E) |
|---|---|
| 3 main menu | "Меню": Новая, Загрузить, Настройки, **[Бонус]**, Выход — **no "Highscore" entry**; "Бонус" only if `[0x588080] ≠ 0` (n = 3 or 4) |
| 10 player count | "Новая": `1 игрок"`, "2 игрока", "Назад" |
| 1 ship | "КОРАБЛЬ": D-Tonator, D-Phyton, "Назад" |
| 2 name | only "D" is distinct: R shows "Please insert Name, player N:" |
| 20 load | title "Загрузить", Back "Назад" |
| 30 options | "Настройки": `Игра"`, Звуки, Клавиши, Назад — **without a bonus entry** |
| 31 | "Настройка игры", 19 dashes; "Режим Супер Луч: Норма"/"…: Смена режима", "Апгрейд: Начальный"/"…: Продвинутый", "Инерция корабля: Вкл./Выкл.", "Назад" |
| 32 | `Уровень звука"`, 32 dashes; "Музыка: ", **"SFX: "** (instead of "Sound: "), "Голоса: ", "Назад" |
| 33 | "Конфигурация", **20** dashes; `Синглплеер"`/"Мультиплеер: Игрок 1/2", "Управление: Клавиатура"; ten actions Влево, Вверх, Вправо, Вниз, Огонь, Навести, "Управление режимом/Сменить Части", "Режим Супер Луч", "Поворот частей", "Сверхновая звезда" (+ "Пауза", "Force Feedback", "Принять настройку", "Назад") |
| 40 bonus | "Бонус", level names JUNGLE/SPACE/STIFT, "Назад" |
| 50 highscore | the Back line is distinct only for "D": R "Back" |

Coordinates, panels and list positions each stand **before** the language switch
and are the same in all languages (`Me.zx/zy`, list 385/255, etc.); `ShowMenu`
(`0x558890`) and `ShowList` (`0x558500`) know no language. The actions depend on the
index (`sel = 3` opens "Highscore" on page 3, the last entry `Me.5F0` quits; on page 30
`sel = 3` opens "Bonus"): the Russian menu has fewer entries, so there "Бонус" opens the
**highscore page**, and the bonus levels are unreachable in the Russian version — the
port reproduces this literally (test `menuLang.test.ts`). The trailing `"` in `1 игрок"`,
`Игра"`, `Уровень звука"`, `Синглплеер"` (and "Несовместимая видео карта"") are in the
constants like that and are displayed too.

### Videos

`intro<S>.avi` (loose, `Data\Video`), `Outro<S>.avi` and `Outro2<S>.avi`
(`Video.d2p`) with `S` = "D"/"E"/"R" — the campaign's cutscenes (`Play <file>`) are
language-independent. The Russian files `introR`, `OutroR`, `Outro2R` are **not**
present in the original data (only D and E). If the file is missing, `PlayAVIFile`
(`0x551930`) runs into the error branch (`0x552D3C`, message "Video: <error>") and
returns: the sequence is skipped and the game continues right away. The port does the
same (`VideoScene`: unknown ID → continue); the IDs are `video/intror`, `video/outror`,
`video/outro2r`. If the files were in `Video.d2p` or `Data/Video`, only `assetkit` would
have to pick them up.

### Radio texts and voices

`<Name>R.txt` (CP1251) is loaded like D/E (`LadeDaten`, `0x4CEFB9`): line by line,
`[section]` = radio ID of the level script (byte comparison; the "ß" of "Drohnen
schießen" is a byte `DF` in the R file, which is "Я" in CP1251 — `parseRadioTextRu`
therefore reads the names as CP1252). `GetWord(Zeile, n, ";")` (`0x576270`) splits each
line at *every* `;`. The WAV names come unchanged from the file (`SkyfightRU_notruf.wav`)
and are unpacked from `<Level>.dfp` for playback (`0x56A2B7`, `0x4EE2E0`); if the file is
missing, the sound stays off (the original additionally reports "Sound Not Found:
<file>" to the ticker, `0x4EE5EB`, presumably — the port omits the message). In the
original data not a single `…RU_*.wav` is in any `.dfp` — **Russian: subtitles only**,
duration and subtitles from `R.txt` (the durations belong to the missing voice
recordings: 5001 instead of 4598 ms for Skyfight). Exception: `Escape_Bruce_oaah.wav`,
`…_Yeehaw.wav` (level 7-5) have the same name in E and R and are played. If a Russian
release ships the recordings in the `.dfp`, the port plays them unchanged (the pipeline
converts every WAV in the `.dfp`).

`R.txt` is the exact counterpart of `E.txt` except in three places (same sections,
speakers, order; WAV names `RU_` ↔ `E_`, Epilog `_ru` ↔ `_en`): [Bombers]
(Spacestation II) is missing, in the Epilog [Credits] has 12 instead of 13 groups, and
`Industry1R.txt` [Harbor] contains a **stray `;`** in the subtitle
(`…Кровавый ад;они прибыли до нас.;;0;`). The original would read a junk group there
(speaker "они прибыли до нас.", duration 0) and would show only "Укрытие. Кровавый ад".
The parser (`RadioText.ts`) recognizes groups by speaker + WAV; whatever lies between
is subtitle (joined with "; "), `;;0;` remnants at the end are dropped — yielding
"Укрытие. Кровавый ад; они прибыли до нас.". The pipeline writes `radio/<slug>` =
`{ de, en, ru }` (its own job per level, `RADIO_CONVERTER_VERSION`).

### In the port

- **Choice:** `lang=de|en|ru` in the URL (`#/dovez?lang=ru`) wins; otherwise the
  host's locale (`de-*` German, `ru-*` Russian, everything else English). The shell
  knows `ru` (`LOCALES`, its own shell texts, language choice in the settings); a game
  without Russian (DOVE) falls back to English.
- **Implementation:** `src/game/lang.ts` (`Lang`, `pick(lang, de, en, ru)`,
  loading-screen and key-hint texts, level abbreviations), `menu/menuTexts.ts` (tables
  per language), `saveScreen.ts` (`saveStrings`), `pauseScreen.ts`,
  `continueScreen.ts`, `saveGame.ts` (`saveLabel`), `campaign.ts` (`languageVideo`),
  `Renderer.ts` (key hint). Tests: `lang.test.ts`, `menuLang.test.ts`,
  `radioLang.test.ts`, `packages/formats/test/dovez.test.ts`.
- **Name input:** in Russian, Ё, А–я, ё are additionally allowed (CP1251 `KeyAscii`
  from 192 on).
- **Date** of the save label (in the original that of the Windows regional setting):
  German and Russian `DD.MM.YYYY`, English `M/D/YYYY` *(assumption)*.
- **Not reproduced:** the config dialog and error windows with Russian texts
  ("Несовместимая видео карта" `0x411844`, "Пожалуйста, вставьте CD" `0x411B24`,
  "DoveZ уже запущен" `0x41368C`, "800*600 Видео", "400*300 Видео", "32-bit цвет",
  "Отмена", "Видео", "Звук", "Полный экран", "В окне" …, `0x4FEE90`, `0x5027B0`,
  `0x57AA70`): the browser has no display mode, no CD check and no single-instance
  lock. The three hits for `push 0x410600` in `0x578820`, `0x57E030`, `0x57E730` are the
  **R key** of the key names, not the language.
- **Deviations not tied to Russian** (noticed during the comparison, D/E left
  unchanged): key page (33) — the dashes are D 27 / E 16 in the original (`0x414CE8`,
  `0x41501C`), the port shows 26/19; "Zurück" is at line 20 in the port, the action
  checks line 21 (in the original "Принять настройку" is at 20 and "Назад" at 21
  there); Pause, vibration and "Einstellungen übernehmen" are missing.

## Boss-level verification (headless bot)

A bot (`packages/game-dovez/test/`) plays through the levels invulnerable. The
simple bot holds x = 100, fires and follows the nearest enemy in y; that is not enough
for bosses with armored fronts. The **hunter bot** (`hunter.ts`) flies in both axes to a
spot where an unarmored part is the topmost part. One subsection per boss level.

### Level 4-3 (`level4-3_cityboss`)

Length 99999, ends via the boss's death (`Me.584 = Me.588 − 151` at state timer
520, section "Boss finale"). Test: `test/boss-4-3.test.ts`. **Nothing needed changing in
the port**; both symptoms of the simple bot are original behavior.

**Setup.** Layer 4: at tick 0 type 1 "Schwarz" (solid, 2 × 2, route 3 "Scroll":
sets all scroll speeds to 0, ends in the same tick), at tick 23 type 0 "Cityboss"
(route 4 "Main", y = 39, x = 800). Layer 3 has only two pre-placed roof tiles (group 17,
799 × 38, y = 513, x = 0 and 797): the only ground, x ≈ 0…1596. The boss has 21 parts
(energy 75,000); one part is unarmored and takes damage, a part with `damagesBody ≠ 0`
passes it on to the enemy:

| Part | Image | Location (x, y) | Role |
|---|---|---|---|
| 16 | Generatorhinten | 255, 317 | unarmored, its own 15,000, nothing above it |
| 8 + 9 | Brustgenerator + Deckel | 75, 130 | 40,000; Deckel (armored, same image) above |
| 14 + 15 | Generatorvorne + Deckel | 16, 332 | 30,000; likewise |
| 2 + 3 | Torso + Deckel | 73, 138 | 30,000; likewise |
| 0 | Hauptgenerator | 126, 181 | unarmored, **`damagesBody`**: subtracts the 75,000; beneath the Torso and arms |
| 1, 5, 6, 7, 4, 10–13, 17–20 | arms, launchers, chains, head | | armored (take no damage) |

The Deckel are armored parts with the image of the part beneath them; their frame 2
is `Schwarz.bmp` (2 × 2), and `SetPartFrame(Deckel, 2)` "opens" them.

**Phases** (route 4, register R9 = 32779 to the part routes): 0 pre-roll, x from 800
to the left at 0.5 px/tick until x = 0 (throw `SetGlobal 0, −5`, launcher part 10 with
route 6), back to the right to 500 (R9 = 2, throw `+3` to the right), then
`IfPartDestroyed(16)`: as long as the rear generator stands, the back-and-forth repeats
(wait time 50). Once it is gone, R9 jumps to 3 (throw −5 again), both front Deckel open
(`SetPartFrame 9, 2` and `15, 2`), after 100 ticks two destruction animations. Route 10
("Waffensysteme", part 0) waits for global 2. Once the chest and front generators are
destroyed (`IfPartDestroyed 8` and `14`), the route sets R7 = 1 (ends part 0's fire
loops), opens the Torso cover (`SetPartFrame 3, 2`), `SetGlobal 1, 1`, shake 50; route 7
("Explode", arms and hands parts 1, 5, 6, 7) then sets `HP = −1` — the arms burst. Once
the Torso falls, the last phase runs (speed 1.5, R9 = 4, endless fire loop). The
Hauptgenerator does the rest: 75,000 energy on the enemy → state 4 (boss finale).

**Symptom 1 (boss never loses energy): the bot, not the port.** Hit test
`CheckColisionWithEnemy` (`0x4C3E10`): parts from last to first, the first overlapping
part decides; an armored one (`[Teil+0x2E] ≠ 0`, jump `0x4C424A` → `0x4C4A4A` → end
`0x4C5E48`) consumes the shot without damage, and the search does **not** continue. The
rear generator lies behind the armored chains (parts 11, 13) and the scatter cannon
(part 17); from the left, at all heights and boss positions (tested: tick 400…2100,
x step 8, y step 4), only armored parts are the first thing a shot touches. The shot
originates at (x + 45, y + 32) of the ship; whoever stands **inside** the boss there
hits the topmost part at that spot — the rear generator is then exposed (part 16 has the
highest index among the parts there). The simple bot stays at x = 100, aims in y at
`actor.y + 30` (the boss's origin, at the top) and hits only the head and arms: points
stay at the shot-down grenades (≤ 2000). The hunter bot defeats the boss after ≈ 11,500
ticks (rear generator ≈ 1500, chest/front ≈ 3500…4000, Torso ≈ 7500, boss ≈ 11,500 — in
the bot's ticks, not time-critical), state 2, the campaign continues with
`level5-1_atlantis` (test against `Play.txt`). Confidence: high for the hit order and the
routes (code read, played through in the port), medium that a human solves it the same
way (the original not played).

**Symptom 2 (grenades fly forever): also in the original.** Type 2 "Granate"
(route 5) belongs to the boss (`spawnSpec` 5002, part 10 calls `Fire 10, −1`): first a
jump by 20 · L0 = −100 px and −30 px, then vy = −4 + 0.2 per tick, vx = L0 (−5 to the
left, otherwise +3 + `Rnd(3)`); each tick `IfHitsLandscape(vx, vy)` → `HP = −1`
(self-destruction, no points). The grenade bursts only at the roof (layer 3). If the
boss throws to the left at x ≲ 600, it lands at x < 0, where there is no ground
(pronounced in the first 1600 ticks of the trip to x = 0 and in the phase with throwing
to the left), and falls forever. Shown: `SpielMoveEnemy` (`0x4B5850`…`0x4C3CB0`) has no
position or screen check (the `fcomp` comparisons read apply to 0, counters and the
shake bounds 736/486 of the boss finale); `KillEnemy` (`0x4AC810`, vtable `+0x754`) has
16 callers, among them in `SpielMoveEnemy` `0x4C0E51` (route end), `0x4C1668`
(self-destruction without a wreck), `0x4C3C8E`, `0x4C0CD6` (end of the part loop with no
visible part) and in the death states (`0x4B9381`, `0x4BCF88`, `0x4BDFD8`, `0x4BFF51`) —
all tied to route end, death or a hit, none to a position; `DoRoute` (`0x4ACC70`) ends
only at the end of the list, on `MoveToAndDie`, route index < 0 and after 10,000
instructions without yielding (`0x4ACD48`). So there is no release outside the screen;
the leak is **bounded by the slot table**: `AddEnemy` (`0x575FF0`) searches from
`[0x58811C]` to slot 100 (`cmp ecx, 0x64`) and returns without error if there is no free
slot (port: −1). In the hunter run up to the boss's death, the number of living enemies
rose to 23 (about 3 grenades per 500 ticks); a run of 30,000 ticks without the boss's
death would fill the 101 slots, and the boss can then throw no more grenades. The
coordinates grow in the original as well (Single: y 4 · 10⁶ after 7500 ticks without a
loss of precision that matters for the route). The port reproduces this unchanged (tests
in `boss-4-3.test.ts`).

**Open.** The player's number of ticks in the original and the question whether a
human actually takes the boss out from inside (conjecture *M*); the part contours come
from the generated `.r` assets and are not checked against the original.
