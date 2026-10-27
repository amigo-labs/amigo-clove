# DOVE — Event stream, scrolling, and level scripts

Status: **determined statically from `DOVE.exe`** (M3 groundwork), `objdump -d -M intel`,
image base `0x400000`. Supplements [`tick-rate.md`](tick-rate.md). Confidence *high*,
unless noted otherwise.

## The event method `0x43D6B0` (one call per tick)

1. If `Me.[0x39A]` (boss mode) is set, only the level 5 level script runs and
   `F4 += 1` — no further events.
2. `Select Case Me.[0x39C]` (level number, jump table `0x445400`): level scripts.
3. Token loop (`0x441CDF`): `line = Me.98(F4)`; uses `InStr` to find the next
   `;`, branches on the following character, continues after the token's `!`.
4. `Me.F4 = Me.F4 + 1` (`0x4451B9`).

### Correction: `;1` spawns immediately, `y§` alone does nothing

The loop searches **only for `;`**. A `§` is read only as the *first `§` after a
`;1 T P!` with P ≤ 0* (`InStr(pos+1, line, "§")`, `0x4427E0`) and there yields the
Y position. Consequences:

- `;1 T P!` **spawns** the enemy of type `T` immediately — it does not "set" a type.
- `P > 0`: pattern enemy, start point from the pattern (no `§` needed).
- `P ≤ 0`: Y from the first `§` after the token (even after further tokens).
- Standalone `y§`, further `§` after the first, and `§` before a `;` are **never**
  evaluated. Across all 12 levels: 1455 bound spawns, 650 pattern spawns,
  **2460 orphaned `§`**. Whether the author intended this is open; the port
  follows the code.

## `;0 tile y!` — terrain

- `M78C(x = 640, y, vx = −1, vy = 0, l, t, r, b)` (`0x442183`), pool `Me.58C`,
  100 slots, first free one from hint `Me.598`.
- Per tick `x += vx; y += vy`, all `Integer` (`0x47720B`): **1 px/tick,
  constant** — Q/W and the background speed do not affect it; tiles keep
  scrolling even during the boss fight.
- Removed at `x < −(r−l)`, `x > 640`, `y > 410`, `y < −(b−t)` (`0x477259`).
- Drawn via BltFast with source RECT `{l, t, r, b}` at `(x, y)`, `y` =
  top edge, clipped to the **640×410** playfield (`0x4774C5`). DirectDraw RECTs
  are exclusive on the right/bottom: **visible size `(r−l)×(b−t)`**.
- The event method runs before the terrain loop: a new tile is first drawn at
  x = 639.

## `;4 obj y!` — background objects

- `M794(x = 640.0, y, l, t, r, b)`, pool `Me.5FC`, 10 slots, x as `Double`:
  `x = 640 + 0.5 − frac(Me.188)` (`0x43C1E0`).
- Per tick `x −= Me.198` (`0x4737D1`) — the background speed, default
  **0.5 px/tick** (parallax). Drawn at `FpI4(x)` (half-even rounding). Removal as
  for tiles. Source is presumably the same surface as the tiles (*medium*).

## Enemy spawn

Enemy definition `Me.42C` (1-based). The loader reads the frames
`For k = 0 To p0` — **p0 = frame count − 1**. Further mapping: p2 → HP,
p4 → speed, p1 → +18, p3 → +8404 (semantics open).

Pool `Me.44C`, 100 slots: x, y, vx, vy as `Double`, HP = p2, movement code,
type, waypoint index.

- **P > 0** (`M7B0`, `0x43D090`): start at waypoint "−1", velocity toward
  waypoint 0 with magnitude p4 on the dominant axis, the other axis scaled by
  dy/|dx| or dx/|dy|, respectively. The loader reads the pattern's `v0`/`v1` as
  the entry/exit side: 0 → x 640, 1 → y 410, 2 → x −100, 3 → y −100;
  a coordinate of −100 means −width or −height, respectively.
- **P ≤ 0**, `v` = value before the bound `§`:

| P | x | y | vx | vy | Code |
|---|---|---|---|---|---|
| 0 | 640 | v | −p4 | 0 | 0 |
| −1 | `CLng(v·64) \ 41` | 410 | −p4 | 0 | −1 |
| −2 | `CLng(v·64) \ 41` | t−b | −p4 | 0 | −2 |
| −3 | 640 | v | −p4 | 0 | −3 |
| −4 | l−r | v | −p4 | 0 | −4 |
| −5 | l−r | v | +p4 | 0 | 0 |
| −6 | 640 | v | 0 | −p4 | −5 |
| −7 | 640 | v | −p4 | 0 | −6 |

64/41 maps the editor range 0…410 to 0…640.

## `;2 art y!` — extras

`M7A4(art, y)`, pool `Me.230`, 13 slots. Spawn x = 640, vx = −1. `art` → atlas x
in `ss.spr` / highest frame index: −2 → 175/1, −1 → 325/7, 0 → 300/5,
1 → 100/3, 2 → 125/3, 3 → 150/3. Per tick x −= 1, frame advances every 6 ticks.
Removed at x > 639, x < −25, y < −25, y > 410. Pickup width 20 px.

## `;3 0 0!` — checkpoint

`If Me.644 = 0 Then Me.530 = Me.F4` (`0x44491F`) — not saved while the ship is
destroyed. Level start: `F4 = Me.530`; `Me.530 = 0` on a new level.
When starting from a checkpoint, the `;0` tiles for `i = max(0, F4−1280) … F4−1`
are pre-placed at x = 640 + i − F4 and the `;4` objects at x = 640 + (i − F4) \ 2.

## Background and stars

- Per tick `Me.188 += Me.198` (`0x472F81`). Background image (640 wide each):
  wrap at `Me.188 > 640`, two BltFasts from `Int(Me.188)` — seamless,
  **0.5 px/tick**, integer offset.
- `background1` is **not drawn**: instead 251 one-pixel stars, placed randomly,
  speed × `Me.198`:
  0–62: ×1.5 (palette 255) · 63–125: ×1 (192) · 126–186: ×0.5 (128) ·
  187–250: ×0.25 (64). At x ≤ 0 wrap by +640 with a new y = `Int(Rnd·410)`.
  Stars 0–62 presumably lie in front of the background objects (*medium*).

## Level scripts

- **Level 1, warp intro:** background speed `Me.198` = F4 − 50 for tick 51–70,
  20 until tick 329, 350 − F4 for 330–349, from 350 on 0.5 again; sounds at tick
  50 and 329.
- **Level 1, meteors (980 ≤ F4 ≤ 1500):** `For i = 0 To 10`: free slot `Me.214(i)`
  and `Rnd > 0.98` → object 60×60 at x = 640, y = `Int(Rnd·350)`, vx = −4,
  vy = `Int(Rnd·3) − 1`, then **return without `F4 += 1`** — the tick stalls,
  its events run in the next tick without a spawn. Presumably `metroid.spr`
  (*medium*).
- **Boss:** music fades out over 100 ticks; at the boss tick `Me.198 = 0`,
  `Me.39A = True`. Boss ticks: L1 6850, L2 7850, L3 8710, L4 8000, L5 7500,
  L6 8000, L7 8100, L8 10300, L10 750. Level 9 ends at 15600 (or 8000 at a score
  factor < 1.1), level 11 at 7300.
- Levels 3, 5, 6, 8 contain further script events (explosions, in level 5 a
  wandering tile) — *open*.

## Randomness

`Rnd` is the VB6 LCG `seed = (seed · 0x43FD43FD + 0xC39EC3) mod 2^24`,
`Rnd = seed / 2^24`. The port uses the same LCG with a seeded start value
(the original seeded via `Randomize` from the clock time) — deterministic and
faithful in its distribution to the original.

## Open

- Movement codes −1 … −6 and the advancing of the pattern waypoints.
- Whether the wall collision uses the exclusive rect like the blitting.
- Draw order of the stars 0–62.
