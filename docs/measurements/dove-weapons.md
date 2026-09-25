# DOVE — Waffen, Extras, Beam, Options, Schild

Status: **statisch bestimmt aus `DOVE.exe`** (M4). Konfidenz *hoch*, wo nicht
anders vermerkt. Formular-Vtable `0x4088F4`; Feldnamen als `Me.[offset]`.
Ergänzt [`dove-player.md`](dove-player.md) und [`dove-enemies.md`](dove-enemies.md).
Operandenkonvention der VB-Helfer (`__vbaVarSub/Add/Cmp*`): der **zuerst**
gepushte Operand ist der linke (an `X − Geschwindigkeit` verifiziert).

## Korrekturen

- **Farbzuordnung:** art 1 = **blau** („Konzentrierter Twinlaser“, Dauerlaser),
  art 2 = **grün** („Reflektionsbälle“), art 3 = **rot** („Streulaser“, Fächer).
  Belege: Extra-Sprites bei Atlas-x 100/125/150 sind blau/grün/rot, ebenso die
  HUD-Symbole; der Laser spielt `blue.wav` (Index 13), der Fächer `red.wav` (14);
  deckt sich mit der Hilfe. Die Vermutung in der Leveldoku (1 rot, 3 blau) ist
  vertauscht.
- **Felder:**

| Feld | Bedeutung |
|---|---|
| `Me.[0x540]` | Farbe 0 keine, 1 blau, 2 grün, 3 rot |
| `Me.[0x544]` | Stufe 0…2 |
| `Me.[0x548]` | Laser aktiv (jeden Tick vor `Keyboard` gelöscht, `0x4716BC`) |
| `Me.[0x54C]` | Anzahl Options 0…2 |
| `Me.[0x550]` | Bomben vorhanden |
| `Me.[0x25C]` / `Me.[0x25E]` | Ausrichtung 0…80 / Richtung ±1 |
| `Me.[0x352]` | **Beam fliegt** (nicht Option) |
| `Me.[0x354]` | Beam-Ladung 0…200 |
| `Me.[0x358]`/`[0x35C]` | Beam x/y; Rect `[0x360…0x36C]`; Schaden `[0x370]`; stoppt an Wänden `[0x374]` |
| `Me.[0x260]` | Beam-Budget gegen Bosse (1500) |
| `Me.[0x394]` | Schild-Timer |
| `Me.[0x642]` | Option „Ausrüstungsverlust“ |
| `Me.[0x12C](0…3)` | Schusstimer: Basis, Bombe, grün, rot |

## Sounds

Ladeliste `0x4335D2` (Index → Datei):

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Normal | Explosion | Antrieb | Jingle | Beam1 | Beam2 | charge | Yesjo | Fertig | End1 |

| 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|
| End2 | getready | IceExplosion | blue | red | green | End3 | Yesjo2 | fertig2 |

## Extras aufnehmen (`0x476162`–`0x476B61`)

Pro Tick und Slot (13 Slots): x += vx; Animation (Zähler > 5 → Frame + 1,
Umbruch nach dem letzten); **Aufnahmetest** (inklusiv, `0x476299`–`0x4763ED`):
`X+40 ≥ ex ∧ X ≤ ex+20 ∧ Y+22 ≥ ey ∧ Y ≤ ey+21 ∧ nicht tot (Me.[0x644])`;
danach Entfernen bei x > 639, x < −25, y < −25, y > 410; Zeichnen
(ax, 25f)–(ax+25, 25f+25).

Bei Aufnahme: Slot frei, `score = Int(score + 300 · Me.[0x638])`, Sound 3.

| art | Wirkung |
|---|---|
| −2 | Schild: `Me.[0x394] = 500` (gesetzt, nicht addiert) |
| −1 | Bomben: `Me.[0x550] = True` (dauerhaft, unbegrenzt) |
| 0 | Option: `Me.[0x54C] += 1`, max 2 |
| 1…3 | `If Me.540 ≠ art Then Me.544 = −1`; `Me.540 = art`; `Me.544 += 1`, max 2 |

Gleiche Farbe = Stufe hoch (0→1→2), andere Farbe = Stufe 0.

## Ausrichtung (Pod)

- `Me.[0x25C]`: 80 = vorn, 0 = hinten. Bei jedem (Neu-)Start 80, Richtung +1
  (`0x46E79A`). Pro Tick pos += dir, begrenzt auf 0…80 (`0x475F0E`); während
  0 < pos < 80 kosmetische Partikellinie bei X + pos\2.
- **D** (Flanke, Latch `Me.[0x1E0]`; Joystick-Bits 4/8) kehrt dir um. Die
  Bedingung bei `0x43AB72` ist immer wahr — D dreht also stets. Wechsel: 80 Ticks.
- **Farbwaffen feuern nur bei pos = 0 oder 80** (`0x43514A`). Der Basisschuss
  feuert immer nach vorn.
- Hinten montierte Waffen sind stärker (Laser 2 statt 1 je Zeile, grün L+19
  statt L+4, rot zusätzlich ein gerader 40er-Schuss).

## `AddSchuss` (`0x43CB00`)

`AddSchuss(typ, x, y, vx, vy, p6, schaden)`; gespeichert als (x−vx, y−vy), die
Schussschleife addiert im selben Tick. Datensatz 32 Byte: [0] Typ, [4] p6,
[8] Schaden (Integer), [0xC] vx, [0x10] vy, [0x14] x, [0x18] y, [0x1C] aktiv.
Pool 1000, Hinweis frei `Me.[0x5C0]`, höchster Slot `Me.[0x5C4]`.
Timer: feuern bei `timer < F4`, dann `timer = F4 + N` → alle N+1 Ticks.

## Waffen (`NEUERSCHUSS` `0x435110`, nur solange Feuer gehalten)

| Waffe | Typ | Start | v | Schaden | Takt | Sound |
|---|---|---|---|---|---|---|
| Basis | 0 | (X+40, Y+7) | (9, 0) | 20 | 6 | 0 |
| Bombe | 1 | (X+15, Y+22) | s. u. | 70 | 13 | — |
| grün vorn | 2 | (X+40, Y+4−5L) | (10, 0) | L+4 | 5 | 15 |
| grün hinten | 2 | (X−20, Y+4−5L) | (−10, 0) | L+19 | 5 | 15 |
| rot vorn | 3 | (X+40, Y+7) | (9−\|i\|, i) | 15 | 13 | 14 |
| rot hinten | 3 | (X−10, Y+7) | (−(9−\|i\|), i) | 15 | 13 | 14 |
| rot hinten, gerade | 3 | (X−10, Y+7) | (−9, 0) | 40 | 13 | — |

### Blau — Twinlaser (Farbe 1)

NEUERSCHUSS setzt nur `Me.[0x548] = True`; Verarbeitung nach der Schussschleife
(`0x47F65D`):

- Zeilen: für i = −L…L, j = 0…1 je eine 1-px-Zeile bei y = Y+4+i+13j — zwei
  Strahlen (Y+4, Y+17), je 2L+1 px dick.
- **Vorn** (pos 80): x = X+42 bis `r = RightColision(X+20, Zeile)` — nächste
  linke Kante in dieser Zeile von Meteor, Tile, Boss oder Gegner (Zeilenumriss),
  sonst 640. Treffer `HitTest(r, Zeile, 1, 1, Schaden 1)`.
- **Hinten** (pos 0): `LeftColision(X+20, Zeile)` … X−2;
  `HitTest(l−1, Zeile, 1, 1, Schaden 2)`.
- Partikel bei Treffer; Sound 13 läuft in Schleife, solange aktiv.
- Farben: äußerste Zeilen (|i| = L) `Me.[0x1550]`, |i| = L−1 `Me.[0x1560]`, sonst
  `Me.[0x1540]` (Werte nicht gefunden). Mit F1 „Lasertranzparenz“ werden die
  Pixel in den Blaukanal geodert.

### Grün — Reflektionsbälle (Farbe 2)

- Größe p6 = L+1. Sprite/Box nach Größe (Sprungtabelle `0x4903F1`):

| Größe | ss.spr | Box |
|---|---|---|
| 0 | (34,70)–(41,77) | 7×7 |
| 1 | (21,70)–(34,83) | 13×13 |
| 2 | (0,70)–(21,90) | 21×20 |
| 3 | (50,61)–(82,92) | 32×31 |

- Bewegung (`0x47DBE1`): x += vx, y += vy; entfernt bei x > 639, x < −w,
  y − h > 410 (sic), y < −h. **Kein** Abprallen am Bildrand.
- Treffer (`HitTest(x, y, w, h, Schaden) ≥ 0`, auch Wände): Partikel; bei
  Größe s > 0 zwei Kinder an der Position des Elternballs, Größe s−1, Schaden
  2s+8; vy = 0 → (−vx, +9) und (−vx, −9), sonst (−vx, vy) und (vx, −vy). Der
  Elternball wird immer entfernt. Kinder landen im ersten freien Slot; Slots
  > i laufen noch im selben Tick.

### Rot — Streulaser (Farbe 3)

- `For i = −(3L+2) To 3L+2 Step 2`: L0 3, L1 6, L2 9 Schüsse (vx 1…9, vy bis ±8).
- Bewegung x += vx, y += vy; Sprite (0,90)–(7,97), Box 7×7; entfernt bei
  x > 639, x < −7, y > 403, y < −7.
- Kollision wie Basisschuss: −1 nichts, 0 weg, > 0 Schaden = Rest, fliegt weiter.

### Bomben (Typ 1)

- Gespeichertes vy 5, die Bewegung ist aber **y += 8 konstant** (`0x47D201`);
  erster Zeichenpunkt y = Y+25. x bleibt bildschirmfest — fällt senkrecht,
  folgt nicht dem Gelände.
- Entfernt bei y > 404; Sprite (0,57)–(7,63), Box (x, y, 8, 6); 0 → weg,
  > 0 → fliegt mit Rest weiter. Unabhängig von der Ausrichtung.

## Beam

### Laden (`Keyboard` `0x43A919`)

A (Joystick-Taste 1) gehalten und kein Beam im Flug: `Me.[0x354] += 1`/Tick,
max 200. Sound 6 alle 10 Einheiten (Parameter 10c+5000, nicht bei 200); bei
199 mit 9990. Ladeeffekt (Pool `Me.[0x4A8]`, c\10 Ringe) kosmetisch (*offen*).

### Auslösen (`BeamAbschuss` `0x4392F0`)

Läuft in jedem Tick, in dem A nicht gehalten wird oder ein Beam fliegt, und bei
Feuer mit Ladung > 0 — **S während des Ladens feuert den Beam**. Stoppt den
Ladesound, danach Ladung = 0:

| Ladung | Wirkung |
|---|---|
| 0 | nichts |
| 1–9 | einmal NEUERSCHUSS (normale Salve) |
| 10–75 | (36,183)–(52,195), 16×12, an (X+40, Y+6); Schaden c+15 |
| 76–125 | (0,183)–(35,197), 35×14, an (X+40, Y+5); Schaden c+30 |
| 126–199 | (0,168)–(67,182), 67×14, an (X+40, Y+5); Schaden c+50 |
| 200 | (70,136)–(158,200), 88×64, an (X+40, Y−20); 500/Tick, **durchdringend**; Sound 4; sofort `HitTest(Box, 1500)` |

Stufen 10–199: Sound 5. Jeder Beam setzt `Me.[0x352] = True`, `Me.[0x260] = 1500`.

### Flug (`0x485E0D`)

- x += 10/Tick, y fest; entfernt bei x ≥ 640. Jeden Tick `HitTest(x, y, w, h, Schaden)`.
- Teilbeams: Rest > 0 → Schaden = Rest; 0 → Beam endet. Wände liefern 0 —
  Teilbeams enden an Wänden. Der volle Beam ignoriert das Ergebnis.
- Bosse (`0x44BE49`): ein Treffer mit Schaden 500 zieht `Me.[0x260]` ab und
  setzt es auf 0 — mit dem Auslösetreffer (1500) macht der volle Beam einem Boss
  **insgesamt 1500**.
- Ein fliegender Beam löscht Gegnerschüsse **nur der Art 1** (gezielte Kugeln)
  bei inklusiver AABB-Überlappung, je `score += Int(10 · Faktor)` (`0x48207B`).
  Feuerbälle bleiben.
- Keine Abklingzeit außer: kein Laden, solange ein Beam fliegt.

## Options (`0x48492A`)

Übersprungen bei aktivem Schild oder totem Schiff.

- Winkel a += 5°/Tick mod 360 (72 Ticks pro Umlauf), lokal, bei jedem
  (Neu-)Start 0. Tabellen `Me.[0x684]` = Cos, `Me.[0x668]` = Sin (`0x4A9058`).
- Option 1: x = X+17+40·cos a (Double), y = FpI4(Y+10+30·sin a); Option 2
  (Anzahl ≥ 2): x = X+17−40·cos a, y = FpI4(Y+10−30·sin a). Ellipse 40×30,
  auf dem Bildschirm im Uhrzeigersinn.
- Sprite (0,48)–(9,57), 9×9, immer gezeichnet.
- Schluckt Gegnerschüsse der **Art 1**, die die 9×9-Box inklusiv überlappen:
  entfernt, `score += Int(10 · Faktor)`. Die Schleife prüft das Aktiv-Flag des
  Schusses nicht (*mittel*, s. Offen).
- Kontakt: `HitTest(ox, oy, 9, 9, Schaden 30)` jeden Tick, Partikel bei
  Treffer. Unzerstörbar.

## Schild (`0x483893`)

- Solange `Me.[0x394] > 0` und Schiff lebt; ersetzt die Options.
- Pro Tick: Timer − 1; Winkel += min(17, Timer + 5).
- Vier Trabanten (Ellipse und Sprite wie Options): bei a (±) und a+90 (±).
  Gezeichnet, wenn Timer > 90 oder Timer mod 3 = 1 (Blinken in den letzten 90
  Ticks).
- Schlucken **alle** Gegnerschuss-Arten (+Int(10 · Faktor), gleiche
  Aktiv-Flag-Eigenheit); je 30 Schaden/Tick.
- Spieler ↔ Gegnerschuss verlangt `Me.[0x394] = 0` (`0x482458`): 500 Ticks immun
  gegen Schüsse. Kollision mit Gegnern und Wänden wird **nicht** verhindert.
- Bei jedem (Neu-)Start gelöscht (`0x46FAC6`).

## Tod und Ausrüstungsverlust (`0x48F438`)

- Todeszähler erreicht 205: ist `Me.[0x642]` gesetzt (Standard **an** laut
  Hilfe) → Bombe = False, Farbe = 0, Stufe = 0, Options = 0.
- Immer (Neustartpfad `0x46E49E`): Beam und Ladung gelöscht (`0x46E6EB`),
  Ausrichtung 80 / dir +1, Schild 0, Laser-Flag 0, Orbitwinkel 0, Timer
  `Me.[0x12C]` neu gesetzt (`0x46F3FB`).
- Neues Spiel (`0x46E398`) setzt alles zurück.

## HUD (`0x48C0FA`–`0x48CC2E`)

Alle Sprites aus `ss.spr`, BltFast mit Colorkey.

| Element | Quelle | Ziel |
|---|---|---|
| Option 1 / 2 | (50,20)–(71,40) | (465, 425) / (346, 425) |
| Bombe | (71,20)–(92,40) | (465, 457) |
| Farbe (L+1 mal, i = 0…L) | 1 (50,0)–(71,20), 2 (71,0)–(92,20), 3 (50,40)–(71,60) | (385+21i, 457) |
| Ausrichtung | (94,0)–(100,37) | (373+pos, 415) |
| Beam-Balken | Farbfüllung | (520,413)–(520+c\2, 423) |

Beam-Balken in RGB(c+20, 0, 0); bei c = 200 blinkt er RGB(255,128,128) in 5 von
10 Ticks (*mittel*: RGB-Helfer Methode `0x720`). `konsole.spr` Zeilen
386/394/402 werden vom Waffencode nicht gelesen.

## Schussschleife (`0x47C89D`–`0x47F650`)

- `For i = 0 To Me.[0x5C4]`, Sprungtabelle `0x4903E1` nach Typ:
  0 → `0x47C932`, 1 → `0x47D1FA`, 2 → `0x47DA7D`, 3 → `0x47ECDB`.
- Beim Freigeben: Hinweis `Me.[0x5C0]` aktualisieren; war i der höchste Slot,
  `Me.[0x5C4]` neu bestimmen.
- Kollision `CheckColision(&x, &y, w, h, &Schaden, &Ergebnis)`, Boxen je Typ
  wie oben.

## Reihenfolge im Tick (*mittel*)

Laser-Flag löschen → `Keyboard` → … → Ladeeffekt → Ausrichtung → Extras →
Tiles → Gegner → Spielerschüsse → Laser → Gegnerschüsse → Schild/Options →
Beam → Partikel → HUD.

## Offen

- Laserfarben `Me.[0x1540…0x1560]`: Werte nicht gefunden.
- Ladeeffekt (`Me.[0x4A8]`) nicht ausgewertet.
- Level-0-Skript (`0x43E02D`–`0x43E4CF`) überschreibt Waffen (einmal Farbe,
  Stufe, Options = 0; einmal Options 1, Farbe 3, Stufe 0) — genaue Ticks offen.
- Schild/Options ohne Aktiv-Prüfung: inaktive Slots ≤ `Me.[0x5E8]` mit alter
  Position könnten erneut „geschluckt“ werden und Punkte geben — am Original
  prüfen, bevor der Port das übernimmt (*mittel*).
