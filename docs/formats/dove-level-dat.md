# DOVE `Data/LevelN.dat`

Stand: M1. Implementierung: `packages/formats/src/dove/LevelDat.ts` (Parser und
Serializer). Alle Aussagen hier sind durch Tests in `packages/formats/test/`
über alle 12 Level abgesichert, sofern nicht als *offen* markiert.

## Kodierung

- Text, eine Angabe pro Zeile, CP1252. Geschrieben mit VB6 `Write #`:
  Strings in `"…"` ohne Escaping, Ganzzahlen ohne Leerzeichen,
  Booleans als `#TRUE#` / `#FALSE#`.
- Zeilenende: CRLF. Git hatte die Dateien beim ersten Commit auf LF
  normalisiert; `scripts/originals-crlf.ts` hat das zurückgedreht (zunächst als
  Rekonstruktion LF → CRLF, mit `verify` gegen eine echte Installation prüfbar).
  `.gitattributes` verhindert seit M0 jede weitere Konvertierung. Der Parser
  erkennt das Zeilenende und der Serializer schreibt dasselbe zurück; LF ist
  zusätzlich synthetisch getestet.

## Aufbau

```
Sektion 1  Landschafts-Tiles        je Record: "Name", l, t, r, b
"*"
Sektion 2  Hintergrund-Objekte      je Record: "Name", l, t, r, b
"*"
Sektion 3  Gegner-Definitionen      siehe unten
"*"
Sektion 4  Bewegungs-Pattern        siehe unten
"*"
length                              Levellänge in Ticks, in allen 12 Leveln 32000
length + 1 Event-Zeilen             VB6 `0 To length`; die letzte ist überall leer
"backgroundN"                       Hintergrundbild ohne Endung
```

Keine Sektion hat einen Zähler; Records beginnen mit einer String-Zeile, das
Sektionsende ist `"*"`.

## Gegner-Record (Sektion 3)

```
"Name"
l, t, r, b                 Atlas-Rect in feindeN.spr
p0 … p4                    fünf Parameter, Semantik offen (p2 korreliert mit Punkten)
je Frame:
  f0, f1                   zwei Frame-Header-Werte
  (h+1) × (left, right)    Kontur, h = b - t
```

- **Framezahl** steht nirgends; sie ist `(Werte nach p4) / (2 + 2·(h+1))`. Die
  Division geht bei allen 145 Records auf (319 Frames); der Parser lehnt jede
  andere Länge ab.
- **Frames** liegen vertikal gestapelt mit Stride `h`: Frame `k` belegt die
  Zeilen `t + k·h … t + k·h + h − 1`. In x ist `r` **inklusiv** (Breite
  `r − l + 1`).
- Die `(h+1)`-te Konturzeile ist ein Off-by-one des Original-Editors und ragt
  ins nächste Frame — für Kollision ignorieren, für den Round-Trip behalten.
- **Leere Konturzeilen** haben `left > right` (z. B. `63, 47`), nicht `-1`.
- `f0, f1` sind in 221 von 319 Frames genau die erste und letzte belegte
  Konturzeile; Platzhalter-Gegner (1×1-Rect, z. B. „End-Links“, „Lampe“)
  haben `-1, -1`. Rest *offen*.
- Einzige Ausnahme beim Atlas-Rand: „14 - Endgegner“ (Level 4) hat `r = 696`
  bei einem 696 px breiten Atlas, reicht also eine Spalte hinaus.

### Kontur gegen Pixel

Die gespeicherten Konturen sind **nicht pixelgenau** aus `feindeN.spr`
ableitbar (Korrektur gegenüber der Design-Spec, die 145/145 exakte Treffer
annahm):

| | Zeilen | Anteil |
|---|---|---|
| exakt gleich | 13737 | 68,8 % |
| gespeichert breiter als die Pixelspanne | 6222 | 31,2 % |
| gespeichert schmaler / verschoben | **0** | 0 % |

Die gespeicherte Kontur enthält die Pixelspanne also **ausnahmslos**. Das
verträgt sich mit einem Editor, der die Konturen aus einer anderen Dekodierung
(JPG/GIF vor der BMP-Konvertierung) oder einer älteren Grafikfassung berechnet
hat. Konsequenzen:

- Der Kreuzvalidierungstest prüft hart „gespeichert ⊇ Pixel“ und führt den
  Exakt-Anteil als Metrik mit Untergrenze.
- Für die Engine ist die **gespeicherte** Kontur die Kollisionswahrheit — sie
  ist das, womit das Original gerechnet hat.
- Die Obermengen-Bedingung bestätigt zugleich Colorkey (reines Schwarz),
  Bottom-up-Flip, Rect-Interpretation und Frame-Stride: Jeder dieser Fehler
  verletzt sie in tausenden Zeilen.

## Bewegungs-Pattern (Sektion 4)

```
"Name"
flag0, flag1               VB-Booleans
v0, v1                     zwei Ganzzahlen, Semantik offen
(x, y)*                    Wegpunkte
-1, end                    Terminator
```

Der Terminator ist `x = -1`; der zweite Wert ist **nicht immer 0** (Korrektur
gegenüber der Spec): in 5 Patterns steht dort etwas anderes (z. B. Level 2
„unten“: 98, Level 7 „von hinten“: 100 bei null Wegpunkten). Semantik *offen*.

## Event-Stream

Eine Zeile pro Tick, meist leer (20–819 belegte Zeilen je Level, Level 10
nur 9). Tokens:

| Token | Bedeutung |
|---|---|
| `;0 <tile> <y>!` | Landschafts-Tile platzieren (Wand) |
| `;1 <gegner> <pattern>!` | aktuellen Gegnertyp + Pattern **setzen**, spawnt nicht |
| `;2 <art> <y>!` | Extra spawnen, `art` ∈ {−2…3} ≙ Schild, Bombe, Option, Rot, Grün, Blau |
| `;3 0 0!` | 0–8× pro Level; vermutlich Checkpoint (Liesmich 0.17) |
| `;4 <obj> <y>!` | Hintergrundobjekt spawnen |
| `<y>§` | Gegner des aktuellen Typs auf Y spawnen (`§` = Byte `0xA7`) |

- **Referenzen sind 1-basiert**: Tile-, Gegner- und Objektindizes laufen von 1
  bis zur Record-Anzahl.
- **Pattern** `1…n` verweisen 1-basiert auf Sektion 4; `0` und `−1…−7` sind
  eingebaute Bewegungsarten der Engine (Level 0 hat gar keine Patterns).
- **Trennregel**: Kommandos folgen direkt aufeinander, ein Spawn nach einem
  beliebigen Token bekommt genau ein Leerzeichen (`;1 4 0! 68§`, `68§ 133§`,
  `30§;1 4 0! 37§`). Der Parser prüft, dass jede Zeile in dieser kanonischen
  Form vorliegt.
- Zählung über alle Level: `;0`=771, `;1`=2105, `;2`=217, `;3`=40, `;4`=49,
  Spawns=3915.

## Nicht Teil dieses Formats

`Data/intro.dat` hat ein **anderes** Schema (Kopf `1`, `"background1.spr"`,
`2100`, `"intro.spr"`, `13`, dann Rect-Records) und wird mit der Intro-Szene
behandelt, nicht in M1.
