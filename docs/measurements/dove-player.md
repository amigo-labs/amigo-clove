# DOVE — Spieler, Schuss, HUD

Status: **statisch bestimmt aus `DOVE.exe`** (M3). Konfidenz *hoch*, wo nicht
anders vermerkt. Formular-Vtable `0x4088F4`; Feldnamen als `Me.[offset]`.

## Eingabe

`user32.GetKeyboardState` (Declare-Stub `0x40A4B4`, einziger Aufruf `0x42E35D`),
Taste gedrückt bei Byte > `0x7F`. Joystick über `winmm.joyGetPos`.

| Aktion | Tasten |
|---|---|
| hoch / runter | `↑`, Num 8 / `↓`, Num 2, Num 5 |
| links / rechts | `←`, Num 4 / `→`, Num 6 |
| Feuer (Dauerfeuer) | `S`, Leertaste |
| schneller / langsamer | `W`, `G` / `Q`, `F` (auf Tastendruck, nicht gehalten) |

## Schiff

- Start und Respawn **(100, 100)**; Ganzzahlpositionen, keine Trägheit, Diagonalen
  nicht normiert (`Keyboard`, `0x4398D0`).
- Geschwindigkeit `Me.[0x184]`: Start 6, W/Q ±2 im Bereich **2…8**; bei Levelstart
  und Respawn nur dann auf 6, wenn < 2 — überlebt also den Tod.
- Grenzen: 6 ≤ X ≤ 597, 0 ≤ Y ≤ 388. **Spielfeld 640×410**, HUD darunter 70 px.
- Sprite `ss.spr` (10, 22·tilt)–(50, 22·(tilt+1)), 40×22; tilt 0 gerade, 1 hoch,
  2 runter, jeden Tick auf 0 zurück. Unsichtbar solange tot; während der
  Unverwundbarkeit nur gezeichnet, wenn der Zähler gerade oder 255 ist (Blinken).
- Flamme `ss.spr` (3, 8f−8)–(9, 8f) an (X−6, Y+9), nur bei Geschwindigkeit > 2.
  f läuft 1→3 je Tick; W setzt f = 4 und einen Timer 165, −8/Tick, Zyklus ab < 31.

## Basisschuss

- `S`/Leertaste gehalten und `nextShot < F4` → `nextShot = F4 + 5`: **ein Schuss
  alle 6 Ticks**. Steht der Level-Tick (Meteor-Sonderfall), steht auch das Feuer.
- `AddSchuss(x = X+40, y = Y+7, vx = 9, vy = 0, Schaden 20)`, gespeichert als x−vx,
  sodass der erste Zeichenpunkt im selben Tick X+40 ist. Pool 1000.
- Pro Tick x += 9; entfernt bei x > 631. Sprite `ss.spr` (0,63)–(7,70), Trefferbox
  (x, y, 7, 7).
- Kollisionsergebnis: −1 kein Treffer; 0 Treffer (Gegner überlebt, exakt getötet,
  oder Wand) → Schuss weg; > 0 Überschuss → Schuss fliegt mit dem Rest weiter.

## Kollision und Tod

- Spieler ↔ Gegner/Meteore: `HitTest(X, Y+3, 40, 14, Schaden 0)` (`0x472874`,
  Argumente am Aufruf verifiziert). Tod bei Ergebnis 0, Zähler `Me.[0x15C]` = 255
  und nicht schon tot. Mit Schaden 0 stirbt ein Gegner mit p2 = 0 bei Berührung.
- Spieler ↔ Gegnerschuss: Box X…X+40 × Y+5…Y+18 inklusiv (`0x482354`), zusätzlich
  kein Schild.
- **Wände töten** (Option `Me.[0x640]`, Standard **aus**): aus heißt, das Schiff wird
  um 1 px nach links geschoben, solange `CheckLandschaft(X, Y+3, 40, 16)` trifft und
  X > 6, und eine Bewegung, die in eine Wand führt, wird achsweise zurückgenommen.
- Tod: zwei Partikelwolken; Zähler +2/Tick bis 205 (≈ 103 Ticks), die Welt läuft
  weiter; dann Leben −1 und Neustart am Checkpoint. Leben starten bei 2; bei −1
  Game Over (Continue: Leben 2, Punkte 0).
- Unverwundbarkeit nach (Re-)Spawn: Zähler 200 → +1/Tick → 255: **55 Ticks**.

## Reihenfolge innerhalb eines Ticks (*mittel*)

1. Wand-Schub · 2. Position merken · 3. Tastatur (Bewegung, Schüsse) ·
4. Wand-Rücknahme · 5. Spielerkollision · 6. Events (`F4 += 1`) ·
7. Flammen- und Unverwundbarkeitszähler · 8. Scrolling · 9. Schiff zeichnen ·
10. Gegner · 11. Spielerschüsse · 12. Gegnerschüsse gegen Spieler · 13. HUD.

## Punkte

`score = Int(score + p2 · Faktor)` beim Tod eines Gegners, nicht im Bosskampf;
Faktor `Me.[0x638]`, Standard 1,0. p2 ≥ 450 setzt 5 Ticks Bildschirmwackeln.
Die HUD-Anzeige läuft dem echten Wert nach: Differenz > 1000 / 100 / 11 / 0 →
+511 / +51 / +11 / +1 pro Tick, negativ entsprechend −999 / −99 / −9 / −1.

## HUD

- `konsole.spr` (0,0)–(640,70) opak an (0, 410). Die übrigen 30 Zeilen enthalten
  Anzeigeelemente (Balken an y 386/394/402, *offen*).
- `"SCORE:" & angezeigt` an (50, 414), `"SHIPS:" & Leben` an (540, 460).
- Tempoanzeige: g läuft ±1/Tick auf Geschwindigkeit·10 zu; `ss.spr` (g,100)–(80,126)
  an (241+g, 450).
- Schrift `text.spr`: Glyphen **8×12**, Rect (idx·8, row·12)–(+8, +12), Zeichen
  in Großbuchstaben, Leerzeichen übersprungen, Vorschub 8 px. Zeile 0: A–Z
  (`@` = 27); Zeile 1: 0–9, dann `. | : ( ) - ' ! _ +` (idx 10–19), idx 20 unbekannt,
  `/ [ ] ^ & % , = $ #` (21–30); Zeile 2: Ä Ö Ü ? ; (0–4), ß 6, § 7.
  Unbekannte Zeichen → (64, 24).
