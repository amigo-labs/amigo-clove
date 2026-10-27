# DOVE — Player, shot, HUD

Status: **determined statically from `DOVE.exe`** (M3). Confidence *high* unless
noted otherwise. Form vtable `0x4088F4`; field names as `Me.[offset]`.

## Input

`user32.GetKeyboardState` (Declare stub `0x40A4B4`, only call `0x42E35D`), a key
is down when the byte is > `0x7F`. Joystick via `winmm.joyGetPos`.

| Action | Keys |
|---|---|
| up / down | `↑`, Num 8 / `↓`, Num 2, Num 5 |
| left / right | `←`, Num 4 / `→`, Num 6 |
| fire (continuous fire) | `S`, space |
| faster / slower | `W`, `G` / `Q`, `F` (on key press, not held) |

## Ship

- Start and respawn **(100, 100)**; integer positions, no inertia, diagonals
  not normalized (`Keyboard`, `0x4398D0`).
- Speed `Me.[0x184]`: start 6, W/Q ±2 in the range **2…8**; at level start
  and respawn set to 6 only if < 2 — so it survives death.
- Bounds: 6 ≤ X ≤ 597, 0 ≤ Y ≤ 388. **Playfield 640×410**, HUD below it 70 px.
- Sprite `ss.spr` (10, 22·tilt)–(50, 22·(tilt+1)), 40×22; tilt 0 level, 1 up,
  2 down, reset to 0 each tick. Invisible while dead; during invulnerability
  drawn only when the counter is even or 255 (blinking).
- Flame `ss.spr` (3, 8f−8)–(9, 8f) at (X−6, Y+9), only at speed > 2.
  f runs 1→3 per tick; W sets f = 4 and a timer 165, −8/tick, cycle from < 31.

## Base shot

- `S`/space held and `nextShot < F4` → `nextShot = F4 + 5`: **one shot
  every 6 ticks**. If the level tick stalls (the meteor special case), the fire
  stalls too.
- `AddSchuss(x = X+40, y = Y+7, vx = 9, vy = 0, damage 20)`, stored as x−vx,
  so the first draw point in the same tick is X+40. Pool 1000.
- Per tick x += 9; removed at x > 631. Sprite `ss.spr` (0,63)–(7,70), hit box
  (x, y, 7, 7).
- Collision result: −1 no hit; 0 hit (enemy survives, killed exactly,
  or a wall) → shot gone; > 0 surplus → shot flies on with the remainder.

## Collision and death

- Player ↔ enemy/meteors: `HitTest(X, Y+3, 40, 14, damage 0)` (`0x472874`,
  arguments verified at the call). Death at result 0, counter `Me.[0x15C]` = 255
  and not already dead. With damage 0, an enemy with p2 = 0 dies on contact.
- Player ↔ enemy shot: box X…X+40 × Y+5…Y+18 inclusive (`0x482354`), plus
  no shield.
- **Walls kill** (option `Me.[0x640]`, default **off**): off means the ship is
  pushed 1 px to the left while `CheckLandschaft(X, Y+3, 40, 16)` hits and
  X > 6, and a move that leads into a wall is undone per axis.
- Death: two particle clouds; counter +2/tick up to 205 (≈ 103 ticks), the world
  keeps running; then lives −1 and restart at the checkpoint. Lives start at 2;
  at −1 game over (Continue: lives 2, score 0).
- Invulnerability after (re)spawn: counter 200 → +1/tick → 255: **55 ticks**.

## Order within a tick (*medium*)

1. Wall push · 2. Save position · 3. Keyboard (movement, shots) ·
4. Wall undo · 5. Player collision · 6. Events (`F4 += 1`) ·
7. Flame and invulnerability counters · 8. Scrolling · 9. Draw ship ·
10. Enemies · 11. Player shots · 12. Enemy shots against the player · 13. HUD.

## Score

`score = Int(score + p2 · factor)` on an enemy's death, not in a boss fight;
factor `Me.[0x638]`, default 1.0. p2 ≥ 450 triggers 5 ticks of screen shake.
The HUD display lags the real value: difference > 1000 / 100 / 11 / 0 →
+511 / +51 / +11 / +1 per tick, negative correspondingly −999 / −99 / −9 / −1.

## HUD

- `konsole.spr` (0,0)–(640,70) opaque at (0, 410). The remaining 30 rows contain
  display elements (bars at y 386/394/402, *open*).
- `"SCORE:" & angezeigt` at (50, 414), `"SHIPS:" & Leben` at (540, 460).
- Speed display: g moves ±1/tick toward speed·10; `ss.spr` (g,100)–(80,126)
  at (241+g, 450).
- Font `text.spr`: glyphs **8×12**, rect (idx·8, row·12)–(+8, +12), characters
  uppercased, spaces skipped, advance 8 px. Row 0: A–Z
  (`@` = 27); row 1: 0–9, then `. | : ( ) - ' ! _ +` (idx 10–19), idx 20 unknown,
  `/ [ ] ^ & % , = $ #` (21–30); row 2: Ä Ö Ü ? ; (0–4), ß 6, § 7.
  Unknown characters → (64, 24).
