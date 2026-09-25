# DOVE — Event-Stream, Scrolling und Levelskripte

Status: **statisch bestimmt aus `DOVE.exe`** (M3-Vorarbeit), `objdump -d -M intel`,
Image-Base `0x400000`. Ergänzt [`tick-rate.md`](tick-rate.md). Konfidenz *hoch*,
wo nicht anders vermerkt.

## Die Event-Methode `0x43D6B0` (ein Aufruf pro Tick)

1. Ist `Me.[0x39A]` (Bossmodus) gesetzt, wird nur das Levelskript von Level 5
   ausgeführt und `F4 += 1` — keine Events mehr.
2. `Select Case Me.[0x39C]` (Levelnummer, Sprungtabelle `0x445400`): Levelskripte.
3. Token-Schleife (`0x441CDF`): `line = Me.98(F4)`; sucht mit `InStr` das nächste
   `;`, verzweigt über das Zeichen danach, setzt fort hinter dem `!` des Tokens.
4. `Me.F4 = Me.F4 + 1` (`0x4451B9`).

### Korrektur: `;1` spawnt sofort, `y§` allein tut nichts

Die Schleife sucht **nur `;`**. Ein `§` wird ausschließlich als *erstes `§` nach
einem `;1 T P!` mit P ≤ 0* gelesen (`InStr(pos+1, line, "§")`, `0x4427E0`) und
liefert dort die Y-Position. Folgen:

- `;1 T P!` **spawnt** den Gegner vom Typ `T` sofort — es „setzt“ keinen Typ.
- `P > 0`: Pattern-Gegner, Startpunkt aus dem Pattern (kein `§` nötig).
- `P ≤ 0`: Y aus dem ersten `§` hinter dem Token (auch hinter weiteren Tokens).
- Alleinstehende `y§`, weitere `§` nach dem ersten und `§` vor einem `;` werden
  **nie** ausgewertet. Über alle 12 Level: 1455 gebundene Spawns, 650
  Pattern-Spawns, **2460 verwaiste `§`**. Ob das Absicht des Autors war, ist
  offen; der Port folgt dem Code.

## `;0 tile y!` — Landschaft

- `M78C(x = 640, y, vx = −1, vy = 0, l, t, r, b)` (`0x442183`), Pool `Me.58C`,
  100 Slots, erster freier ab Hinweis `Me.598`.
- Pro Tick `x += vx; y += vy`, alles `Integer` (`0x47720B`): **1 px/Tick,
  konstant** — Q/W und die Hintergrundgeschwindigkeit wirken nicht darauf;
  Tiles scrollen auch im Bosskampf weiter.
- Entfernt bei `x < −(r−l)`, `x > 640`, `y > 410`, `y < −(b−t)` (`0x477259`).
- Gezeichnet per BltFast mit Quell-RECT `{l, t, r, b}` an `(x, y)`, `y` =
  Oberkante, geclippt auf das **640×410**-Spielfeld (`0x4774C5`). DirectDraw-RECTs
  sind rechts/unten exklusiv: **sichtbare Größe `(r−l)×(b−t)`**.
- Die Event-Methode läuft vor der Landschaftsschleife: ein neues Tile wird
  erstmals bei x = 639 gezeichnet.

## `;4 obj y!` — Hintergrundobjekte

- `M794(x = 640.0, y, l, t, r, b)`, Pool `Me.5FC`, 10 Slots, x als `Double`:
  `x = 640 + 0.5 − frac(Me.188)` (`0x43C1E0`).
- Pro Tick `x −= Me.198` (`0x4737D1`) — die Hintergrundgeschwindigkeit,
  Standard **0,5 px/Tick** (Parallaxe). Gezeichnet an `FpI4(x)` (Runden
  half-even). Entfernen wie bei Tiles. Quelle vermutlich dieselbe Surface wie die
  Tiles (*mittel*).

## Gegner-Spawn

Gegnerdefinition `Me.42C` (1-basiert). Der Lader liest die Frames
`For k = 0 To p0` — **p0 = Framezahl − 1**. Weitere Zuordnung: p2 → HP,
p4 → Geschwindigkeit, p1 → +18, p3 → +8404 (Semantik offen).

Pool `Me.44C`, 100 Slots: x, y, vx, vy als `Double`, HP = p2, Bewegungscode,
Typ, Wegpunktindex.

- **P > 0** (`M7B0`, `0x43D090`): Start am Wegpunkt „−1“, Geschwindigkeit
  Richtung Wegpunkt 0 mit Betrag p4 auf der dominanten Achse, die andere Achse
  skaliert mit dy/|dx| bzw. dx/|dy|. Der Lader deutet `v0`/`v1` des Patterns als
  Eintritts-/Austrittsseite: 0 → x 640, 1 → y 410, 2 → x −100, 3 → y −100;
  eine Koordinate −100 bedeutet −Breite bzw. −Höhe.
- **P ≤ 0**, `v` = Wert vor dem gebundenen `§`:

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

64/41 bildet den Editorbereich 0…410 auf 0…640 ab.

## `;2 art y!` — Extras

`M7A4(art, y)`, Pool `Me.230`, 13 Slots. Spawn x = 640, vx = −1. `art` → Atlas-x
in `ss.spr` / höchster Frameindex: −2 → 175/1, −1 → 325/7, 0 → 300/5,
1 → 100/3, 2 → 125/3, 3 → 150/3. Pro Tick x −= 1, Frame alle 6 Ticks weiter.
Entfernt bei x > 639, x < −25, y < −25, y > 410. Aufnahmebreite 20 px.

## `;3 0 0!` — Checkpoint

`If Me.644 = 0 Then Me.530 = Me.F4` (`0x44491F`) — nicht gespeichert, solange
das Schiff zerstört ist. Levelstart: `F4 = Me.530`; `Me.530 = 0` bei neuem Level.
Beim Start ab Checkpoint werden für `i = max(0, F4−1280) … F4−1` die `;0`-Tiles
an x = 640 + i − F4 und `;4`-Objekte an x = 640 + (i − F4) \ 2 vorab platziert.

## Hintergrund und Sterne

- Pro Tick `Me.188 += Me.198` (`0x472F81`). Hintergrundbild (alle 640 breit):
  Umbruch bei `Me.188 > 640`, zwei BltFasts ab `Int(Me.188)` — nahtlos,
  **0,5 px/Tick**, ganzzahliger Versatz.
- `background1` wird **nicht gezeichnet**: stattdessen 251 Ein-Pixel-Sterne,
  zufällig platziert, Geschwindigkeit × `Me.198`:
  0–62: ×1,5 (Palette 255) · 63–125: ×1 (192) · 126–186: ×0,5 (128) ·
  187–250: ×0,25 (64). Bei x ≤ 0 Umbruch um +640 mit neuem y = `Int(Rnd·410)`.
  Sterne 0–62 liegen vermutlich vor den Hintergrundobjekten (*mittel*).

## Levelskripte

- **Level 1, Warp-Intro:** Hintergrundgeschwindigkeit `Me.198` = F4 − 50 für
  Tick 51–70, 20 bis Tick 329, 350 − F4 für 330–349, ab 350 wieder 0,5; Sounds
  bei Tick 50 und 329.
- **Level 1, Meteore (980 ≤ F4 ≤ 1500):** `For i = 0 To 10`: freier Slot
  `Me.214(i)` und `Rnd > 0.98` → Objekt 60×60 an x = 640, y = `Int(Rnd·350)`,
  vx = −4, vy = `Int(Rnd·3) − 1`, dann **Rückkehr ohne `F4 += 1`** — der Tick steht
  still, seine Events laufen im nächsten Tick ohne Spawn. Vermutlich
  `metroid.spr` (*mittel*).
- **Boss:** Musik wird über 100 Ticks ausgeblendet; am Boss-Tick
  `Me.198 = 0`, `Me.39A = True`. Boss-Ticks: L1 6850, L2 7850, L3 8710, L4 8000,
  L5 7500, L6 8000, L7 8100, L8 10300, L10 750. Level 9 endet bei 15600 (bzw.
  8000 bei Punktefaktor < 1,1), Level 11 bei 7300.
- Level 3, 5, 6, 8 enthalten weitere Skriptereignisse (Explosionen, in Level 5
  ein wanderndes Tile) — *offen*.

## Zufall

`Rnd` ist das VB6-LCG `seed = (seed · 0x43FD43FD + 0xC39EC3) mod 2^24`,
`Rnd = seed / 2^24`. Der Port verwendet dasselbe LCG mit gesätem Startwert
(das Original säte per `Randomize` aus der Uhrzeit) — deterministisch und in
der Verteilung originalgetreu.

## Offen

- Bewegungscodes −1 … −6 und das Weiterschalten der Pattern-Wegpunkte.
- Ob die Wandkollision das exklusive Rect nutzt wie das Blitten.
- Reihenfolge der Sterne 0–62 beim Zeichnen.
