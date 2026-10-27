# DOVE — Enemies, enemy shots, collision

Status: **determined statically from `DOVE.exe`** (M3). Confidence *high* unless
noted otherwise. Spawn table and pattern layout: [`dove-events.md`](dove-events.md).

## Parameters p0…p4

| | Meaning |
|---|---|
| p0 | frame count − 1 (loader reads `For k = 0 To p0`) |
| p1 | animation delay: frame changes every p1 + 1 ticks |
| p2 | hit points **and** point value (copy in +0x34); bosses 20 (script), 100000 ≈ indestructible |
| p3 | shot type: 0 none, 1/2/3 aimed with probability 0.002/0.005/0.02 per tick, 4 fireball every 21 ticks |
| p4 | speed in px/tick; p4 = 1 disables the wall crash (wall objects scroll along) |

## Movement per tick (`0x477A99`–`0x47C16B`)

- **Animation:** `cnt += 1; if cnt > p1 { cnt = 0; frame += 1; if frame > p0 then frame = 0 }`.
- **Pattern ≥ 0:** `x += vx; y += vy` — no scroll component.
- **Waypoints:** an axis counts as reached when (v < 0 and CLng(pos) ≤ target),
  (v > 0 and ≥ target) or v = 0. If both are reached: next waypoint; if its
  x = −1, x = 641 is set (→ removed), otherwise re-aim from the current
  position: |dx| > |dy| → vx = ±p4, vy = dy/|dx|·p4, otherwise the reverse.
  Coordinates are absolute screen positions. `flag0`/`flag1` are never read after
  loading. The loader builds the start and end point from `v0`/`v1` (0 → x 640,
  1 → y 410, 2 → x −100, 3 → y −100, the other coordinate from the first or last
  waypoint, respectively); with zero waypoints, `end` yields the start y.
- **Wall crash** (pattern ≥ 0, p4 ≠ 1): AABB (x, y, r−l, f1−f0) against tiles — y,
  not y+f0. On hit: particles, 3 explosions, removed, **no** score.
- **Code −1…−4 ("Schleim", homing):** each axis steps ±p4 toward the midpoint ↔
  (pX+20, pY+10), only without overshooting and if the new box (height b−t)
  touches no wall.
- **Code −5 (file −6, hovers):** y += vy, vy reverses at a wall or edge
  (0 < y+vy, y+vy+h < 410); x −= p4 while x > 400; vx serves as a counter +1/tick,
  past > 500 x −= p4 again and no more fire (it withdraws). Wall contact kills.
  Fires two fireballs every 31 ticks at y and y+h (regardless of the option).
- **Code −6 (file −7, "Faller"):** x += vx; at vy = 0 and x < pX+40 → vy = 1;
  for 1 ≤ vy ≤ 15 x wobbles by ±2, vy += 1; from vy = 16 on y += 5/tick. Wall → removed.
- **Removal:** x < −(r−l), x > 640, y > 410 or y < −(b−t).

## Drawing

Source rect (l, t + frame·(b−t), r, t + (frame+1)·(b−t)) from `feindeN.spr`,
clipped to 640×410, at `FpI4(x), FpI4(y)`.

## Enemy shots (`0x43C4A0`, 50 slots)

- p3 = 1…3 → kind 1 at (x + (r−l)/2 − 4, CLng(y + (b−t)\2) − 4): bullet `ss.spr`
  (21,85)–(28,92), aimed at (pX+20, pY+7) with speed **3** on the major axis;
  velocity as `Long` (minor axis rounded).
- p3 = 4 → kind 2 at (x − 35, y − 7): fireball `ss.spr` (0,136)–(34,150), vx = −5.
- Option "Gegner schießen" `Me.[0x634]`: 0 off, 1 full, 2 half (every second
  request discarded).
- Score factor `Me.[0x638]` (*medium*): full 1.25 / half 1.0 / off 0.75; −0.25 without
  wall collision; ±0.25 with/without weapon loss. Default 1.0.

## Hit test `HitTest` (`0x448910`)

1. Bosses (level-dependent) first.
2. Enemies in slot order: vertical rejection against [ey+f0, ey+f1] of the
   current frame; across the rows `max(y−ey, f0) … min(y+h−ey, f1)` (rounded)
   minL = min(left), maxR = max(right), start minL = r−l, maxR = 0, empty rows
   included; hit when x ≤ ex+maxR and x+w ≥ ex+minL (inclusive; the direction of
   the comparisons is *medium*).
3. Walls: inclusive AABB against the tiles, last.

Result −1 no hit, 0 absorbed, > 0 surplus (−HP).

## Death

HP −= damage; at HP ≤ 0: score (except in a boss fight), 150 particles, one
explosion at the midpoint − 25 and one at a random point of the box − 25, sound 1.
`Explosion.spr`: 32 frames of 50×50, 8 per row, one frame per tick.
