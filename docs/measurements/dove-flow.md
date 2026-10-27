# DOVE — Program flow, menus, screens, files

Status: **determined statically from `DOVE.exe`** (M4 groundwork), `objdump -d -M intel`,
image base `0x400000`. Confidence *high* unless noted otherwise. Audio details
in [`dove-audio.md`](dove-audio.md). All screens tick at **14 ms/frame**
(`timeGetTime + 14`).

**Note on method names:** The names from the VB name list do not match in the
vtable range `0x6F8`–`0x74C` (e.g. `0x42C7D0` is the gif/jpg/bmp→`.spr`
converter, `0x42AD20` the flip). From `0x750` on they agree with the code.

## Command line

| Batch | Content | Effect |
|---|---|---|
| `Dove - NOSOUND.bat` | `Dove.exe -nosound` | `InStr(UCase(Command$), "NOSOUND")` → `Me.528 = False` (`0x431C42`) |
| `Dove - No Intro.bat` | `Dove.exe -nointro` | `"-NOINTRO"` → `PlayIntro` is skipped (`0x49177A`) |
| (undocumented) | `GOTO<d>` | `Me.2DC = Val(Mid$(Command$, pos + 4, 1))` (`0x431D07`): **one** digit, start level |

`LoadData` (`Config.cfg`) runs after parsing (`0x4322E1`) and reads `Me.528`
again; a saved sound toggle overrides `NOSOUND` (*medium*).

## Start

1. `Form_Load` (~`0x431100`): command line, default highscores, `LoadData`.
   Startup dialog with language DE/EN (`Me.350`, True = German), windowed mode
   (`Me.118`) and sound (`Me.528`) (*medium*: dialog layout).
2. Start handler `0x4A9B60` (thunk `0x409BF9`) calls `0x4A7F70`: DirectDraw,
   `InitMusik`, loading screen `loading.spr`, `metroid.dat`, loading the samples
   with a bar. Error texts "Sry, bad graphic-card", "Bitte installieren sie Direct X7
   oder höher".
3. `ShowNEOARTS` (`0x4A7880`): NEO-ARTS logo from `titel.spr` (0,0)–(224,241) and
   `PutTextA "presents"` (*medium*: timings).
4. `erstelleHighScoreS` (`0x49FFE0`): renders the highscore list into a
   280×150 offscreen surface (rows "Platz. Name…….. |Punkte", `text.spr`).
5. Title.

## Title

- **Starfield**: 1000 stars, x = `Int(Rnd·640)`, y = `Int(Rnd·480)`,
  speed `Int(Rnd·4) + 1` (`0x4A9F7A`).
- **Easter egg "KATHA♥"** (`0x4AA39F`–`0x4AA87A`): five lines of ASCII art
  (`0x4128F4`, `0x41293C`, `0x412988`, `0x4129D4`, `0x412A1C`):

  ```
  *  *   *   ***** *  *   *     * *
  * *   * *    *   *  *  * *   * * *
  **   *****   *   **** *****  *   *
  * *  *   *   *   *  * *   *   * *
  *  * *   *   *   *  * *   *    *
  ```

  Each `*` becomes a star at x = 500 + 17·column, y = 300 + 17·row,
  speed 1.0, color from (84, 84, 64): the lettering drifts across the screen with
  the starfield.
- **DOVE logo** (`Logo` `0x49D300`): `logo.spr` 940×600 = 24 frames of 235×100,
  4 per row; every 5 calls the next frame, wrap at 24; source
  ((f mod 4)·235, (f \ 4)·100).
- **Menu** (graphic in `titel.spr`, top right): cursor y = 120 + 42·k,
  clamped 120…330. Keys ↑/Num 8, ↓/Num 2/Num 5, joystick. Confirm with
  Enter, S, A, space, joystick button: Antrieb sound, animation x 400 → 640
  (+4/frame), then a jump through the table `0x4AF742`/`0x4AF726`:

| k | y | Menu item | Action |
|---|---|---|---|
| 0 | 120 | Let's go! | `ShowLevelSelect`, then `Spiel` (except `Me.690 = 5`) |
| 1 | 162 | Extralevel | `Me.39C = 11`, `Spiel` — always available |
| 2 | 204 | Tutorial | fade out music, `Me.39C = 0`, `Spiel` |
| 3 | 246 | Info | `info` (`0x490430`): readme display (`liesmich.txt`/`readme.txt` per language) with a credits header |
| 4 | 288 | Options | `Schwierigkeitsgrad` (`0x457E80`) |
| 5 | 330 | Quit | `Me.690 = 1` |

- ESC on the title → `Me.690 = 2`. Either one ends the title loop → farewell
  screen (`0x4AD5B0`): "Hat's euch gefallen? …", "Tipp: wenn der Punktefaktor ) 1 ist …
  kann man speichern!", big text "www" "Kauto" "de"; then BASS freed, `End`.
- `PlaySecretIntro` (`0x4980A0`, museum dialog Markus/David/Lehrer) has
  **no caller** — dead code.

## Options and score factor

| Item | Values | Field |
|---|---|---|
| "Gegner schießen:" | AUS / VOLL / HALB (0 / 1 / 2) | `Me.634` |
| "Kollision mit Wand:" | Ja, klar / Nein | `Me.640` |
| "Waffenverlust nach dem Tod:" | Ja / Nein | `Me.642` |
| "Einstellungen speichern" | → "Einstellungen gespeichert!", `SaveData` | |
| "Zurück" | title | |

English parallel ("shooting enemies:", "Touching walls destroys the ship :" …).
Display "Punktefaktor: " & factor and, if factor ≥ 1.25, "Levels können
erspielt werden" (`0x45A9AA`) (*medium*: positions). Factor `Me.638`
(`0x46DF6B`): `Me.634` 0 → 0.75, 1 → 1.25, otherwise 1.0; −0.25 if walls do not
kill; +0.25 with weapon loss, otherwise −0.25. Default 1.0.

## Level select and `Config.cfg`

- `ShowLevelSelect` (`0x45B220`): if **no** level 1–10 is unlocked, immediate
  return with `Me.39C = Me.2DC` (default 1, see `GOTO`).
- Otherwise a list "1. Lost In Space" … "10. Final Fight" at (10, 100 + 20·i), only
  unlocked levels and the current one, cursor `)`; preview
  `data\grafik\<L>.spr`. ESC → `Me.690 = 5`.
- Unlocking (`0x48F031`): at level end, if `Me.2FC = 0` and factor > 1.0 →
  `Me.2F0(L + 1) = True`, `SaveData`.
- `Config.cfg` (`App.Path`, VB `Write #`, `LoadData` `0x457B30`): `Me.634`,
  `Me.640`, `Me.642`, then **one line per level 1…10**, which unlocks only on
  exactly this phrase, finally `Me.350`, `Me.118`, `Me.528`:

| Level | Phrase |
|---|---|
| 1 | `TRUE` |
| 2 | `ASDDSA` |
| 3 | `123 in the place to be` |
| 4 | `baby baby come on come on` |
| 5 | `unsere Styles sind noch krasser` |
| 6 | `als die Namen von Pokémon!` |
| 7 | `und noch ein Schlüsselsatz` |
| 8 | `Mein Gott, ich muss zur Fahrschule!` |
| 9 | `Ich bin ein eingeschobenes Level %-)` |
| 10 | `Dieser Satz schaltet das geheime Level frei!` |

## `Spiel` (`0x46DE60`)

1. `Me.39C = 1` → `PlayIntro` (`0x46DF1F`).
2. Score factor, fade out music, lives `Me.114 = 2`, score 0,
   checkpoint `Me.530 = 0`, `LevelLaden`, `PlayMusik "S" & L`, **Get Ready**
   (`0x47081C`); ESC right after → `Me.690 = 1`.
3. Main loop (see [`tick-rate.md`](tick-rate.md)); end via `Me.690`:

| `Me.690` | Meaning | Outcome |
|---|---|---|
| 3 | Level cleared (`0x4719C0`) | `data\level<L+1>.dat` exists and L < 10 → L + 1, new music, Get Ready; L = 10 → `HighScore`, `ShowOutro` |
| 1 | Abort (pause "Ende") | `HighScore` |
| — | Lives < 0 | `Continue` (`0x48F597`): YES → checkpoint, lives 2, score 0; NO → `HighScore` |
| 2 | Game over | back to the title, `PlayMusik "Titel"` |

The tutorial (L 0) always returns to the title (`0x48EDB9`). `Me.634 > 2` is
clamped to 2.

## Get Ready (`0x45D8A0`)

- Level names (`0x45D934`): Tutorial, Lost In Space, Factory, Deep Blue See, Back
  in Space, Crystal Cave, Speed, The Unreal World, DOVE INSIDE, Final Level,
  Final Fight; L 11–19 "ExtraLevel 1…9".
- Preview `data\grafik\<L>.spr` (320×240), otherwise `Extralevel.spr`, at
  (160, 120), frame lines x 159/480, y 119/360; 100 particles.
- Scrolling text in `text2.spr`: `"           Level " & L & " - " & Name & " - GET
  READY Points:" & Punkte & " Ships:" & Leben & "             "`.
- Counter +1/frame, at 20 a blink flag toggles; at 0 `ss.spr`
  (81,116)–(194,137) is drawn centered at y = 230, on the switch to 1
  `getready.wav` sounds (*medium*).
- Ends with S, A, Enter or joystick button (*medium*: no timeout found).

## Pause (ESC in-game, `0x4708E6`)

Only while the death counter is not running. `SetGlobalVolumes(25, 0, 25)`, wait
for ESC/A/S/space/Enter to be released. Panel `konsole.spr` (0,70)–(100,70+k)
("Pause | Weiter / Ende") slides up with k = 0…30 (+1/frame) at (270, 410 − k);
a 48 px wide marker (100,70)–(148,…) moves between the rows (offset 3…14)
(*medium*). ↑/↓ select (`Me.690` 0 = Weiter, 1 = Ende), Enter/A/S/space confirm,
ESC resumes.

## Continue (`0x4549C0`)

Music `gameover`; graphics from `titel.spr` (GAMEOVER, "Continue Game?", "Yes, ya!",
"No!"); "Score:" & Punkte; if the score makes the list: "Select 'NO' to
put your name on the rank list N.". Selection 0 = YES (*medium*).

## Highscore

- 9 entries, names `Me.2B4(1…9)`, scores `Me.2D0(1…9)` (strings, encoded).
- Default (`0x42F5C0`): 1 David Lee 100000, 2 Kauto 80000, 3–8 xenion, XPiRE,
  MaKo, HiBri, Manuel Kempf, Pickel with 60000/50000/40000/30000/20000/15000,
  9 Toxeen 10000; then 101 random swaps of the **names** at places 3–8
  (index `Int(Rnd·6) + 3`).
- `Highscore.dat` (`App.Path`, `HighLaden` `0x49FD00`, `Line Input`), lines in
  this order: name 2, name 8, name 7, score 3, score 9, name 4,
  score 5, `Me.2A0`, name 6, score 4, name 9, score 6, score 7, name 1,
  score 8, score 2, one Variant line → decode → `Me.300`, name 5, name 3,
  score 1. Scores via encode `0x42EBE0` / decode `0x42F0A0`; if the check
  `0x42E9B0` fails → default list.
- Entry (`HighScore` `0x49D620`): music `Highscore`, particles, big text
  "You placed" N + st/nd/rd/th, "Enter your name here:" + name + `§` as cursor,
  at most 20 characters; empty name → "David Lee" (*medium*); insert,
  `HighSpeichern`.

## Credits: `B1`–`B5` and `1.dat`–`5.dat`

`B1.spr`–`B5.spr` are **not a curtain between levels**, but the five credits
slides of `ShowOutro` (`0x4A0D00`), **stored scrambled**.

- Image 640×450 = **64 × 45 tiles of 10×10 px = 2880 tiles**.
- `data\<n>.dat` = 2880 × Int32 LE (11520 bytes), a permutation of 0…2879
  (`0x4A2427`–`0x4A2510`, `Get #`).
- Unscrambling (`0x4A2736`–`0x4A294D`), i = 0…2879, p = perm[i]:
  target (`(i mod 64)·10`, `(i \ 64)·10`) ← source (`(p mod 64)·10`,
  `(p \ 64)·10`), 10×10 each. Verified: produces a correct image.
- Sequence: music `over`, two lines of story per slide (DE/EN; "…ruft: <Name>,
  <Name>!" from `Me.2A0`, *medium*), cross-fade; then music `Credits`,
  credits list (`0x41158C` …), a flying ship (*low*: timings).

## `intro.dat` (`PlayIntro` `0x4916D0`)

VB `Write #` text; the parser consumes all 780 tokens (`String`, `Long` &,
`Integer` %, `Boolean` #):

```
header$                                  ' "1"
For s = 0 To 10                          ' 11 scene slots
  bg$, dauerTicks&, sheet$, nRects%
  nRects × (name$, l&, t&, r&, b&)       ' rects in sheet
  m& ;  (m+1) × (größe%, tick&, x%, y%)  ' particle explosions
  nObj% ; nObj × ( sprite&, nk& ,
      (nk+1) × (t&, sichtbar#, x%, y%, lerp%, skala%, frame0%, frames%, ticksProFrame%) )
  nSnd% ; (nSnd+1) × (tick&, name$)      ' unused
Next
```

- `lerp% = −1`: interpolate x, y and `skala` linearly to the next keyframe.
- `skala% = 100`: BltFast 1:1, otherwise stretched to B·s/100 × H·s/100 (*medium*).
- Animation frames lie stacked vertically: source top = t + frame·(b − t).
- Used: scene 0 (`background1.spr`, 2100 ticks, 13 rects "Erde", "Raumschiff",
  "Schuss" …, 14 objects), 1 (`intro2.spr`, 500 ticks, "Uhr", "Antrieb"),
  2 (`background1.spr`, 300 ticks, still image); 3–10 empty. Music `Intro`,
  faded out at the end.

## Big text `text2.spr`

`GetBigLetter` (`0x452180`): A–Z → 0–25, 0–9 → 26–35, `(` 36, `)` 37, `:` 38,
`-` 39, everything else → 0 ("A"). Cell **60×75**, 5 per row (file 300×600):
rect ((i mod 5)·60, (i \ 5)·75)–(+60, +75). `PutBigText(x, y, s)` (`0x452B40`):
uppercase letters, character k at x + 60·(k − 1), spaces advance without drawing;
BltFast with a source color key, clipped on the right at x = 640 and on the left
at x < 0.

## Function keys in-game

| Key | Effect (message 300 ticks, `Me.344`) | VA |
|---|---|---|
| F1 | laser transparency ("Effects1") | `0x439E06` |
| F2 | Fastblt / flip (`Me.648`) | `0x439EC6`, `0x430E34` |
| F3 | show/hide info | `0x439F54` |
| F4 | show energy ("Show HP") | `0x43A014` |
| F5 | joystick/gamepad on/off (`Me.60`) | `0x43A0D4` |
| F6 | audio on/off (`Me.528`) | `0x430E60` |
| F7 | particle effect (`Me.3FA`) | `0x430EED` |
| F8 | window size (only with `Me.118`) (*medium*) | `0x430F09` |

## Open

- Timeout of the Get Ready screen; exact geometry of the pause marker.
- Timings of the credits slides, the farewell screen, and of `ShowNEOARTS`.
- Whether the "KATHA♥" stars get new random y on wrap (the lettering falls apart)
  or are kept.
- Meaning of `Me.2FC`, `Me.300` and `Me.2A0` (player name?).
- Layout of the startup dialog (controls `0x300`–`0x314`).
