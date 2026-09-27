# DoveZ `<Level>.dat` — das Level-Skript

Stand: M7. Parser und Serializer: `packages/formats/src/dovez/LevelDat.ts`
(schemagetrieben, `binarySchema.ts`), geprüft von
`packages/formats/test/dovezLevelDat.test.ts` gegen **alle 27** Level. Der
Routen-Interpreter liegt in `packages/game-dovez/src/sim/route.ts`, die
Gegnerwaffen in `sim/weapon.ts`, die Debug-Seite unter `#/dovez/debug/level`.

## Ergebnis

- **Die Grammatik ist vollständig und stammt aus dem Programm, nicht aus den
  Daten.** `LadeDaten` (`0x4C72C0`) liest die Datei mit einer festen Folge von
  `Get #`-Aufrufen; deren Feldgrößen, `ReDim`s und Schleifen ergeben das Schema
  unten. Alle 27 Dateien parsen restlos, `serialize(parse(b)) === b`.
- **Kein Byte hat eine offene Bedeutung.** Von 622 806 Byte sind 555 431 in
  benannten Feldern, 63 204 Struktur (Zähler, Stringlängen) und 4171 in Feldern,
  die das Programm nachweislich nie liest (`unused*`: Gruppen-Editor-ID,
  Funk-Sprecher und -Flag). Die Metrik der Spec (`opaque` unter 5 %) ist damit
  0 %; der Test verlangt 0 Byte `unknown*`.
- „Benannt“ heißt: Die Bedeutung ist **aus dem Maschinencode gelesen** (Adressen
  unten) und an den Daten aller Level gegengeprüft. Gegen das laufende Original
  ist nichts geprüft; Einträge mit Konfidenz *M* oder *L* bestätigt erst M8.
- Die Spec vermutete eine offene „Spawn-Timeline“ mit variabler Recordlänge und
  „24 Nullfelder im Gegner-Record“. Beides löst sich auf: Es gibt sieben
  Zeitleisten-Ebenen mit festen 5×i32-Einträgen, und die „Nullfelder“ sind
  16 Gegner-Flags, die in den meisten Typen 0 sind.

## Herkunft: `DoveZ.exe`

`DoveZ.exe` ist **UPX-gepackt** (`upx -d`, UPX 4.2), darunter natives VB6.
Disassembliert mit `objdump -d -M intel`, Image-Base `0x400000`, Dateioffset =
VA − `0x400000`. Die Namen der Form-Methoden stehen im VB-Objektkopf
(`VB5!` bei `0x409154`); sie sind bis etwa `LadeDaten` in Slot-Reihenfolge, danach
verschoben (Funktionen daher nach Inhalt identifizieren). Methodenaufrufe laufen
über die vtable ab `0x40ACC8` (`call [ecx+Offset]`).

| Funktion | Adresse | Rolle |
|---|---|---|
| `LadeDaten` | `0x4C72C0` | liest das Skript (Grammatik) |
| `GetAsciiStrFromFile` | `0x4C7010` | String fester Länge lesen (vtable `0x778`) |
| `DoRoute` | `0x4ACC70` | Routen-Interpreter, Sprungtabelle `0x4B5458` |
| `Var` | `0x4AC970` | Argumente auflösen |
| `SpielMoveEnemy` | `0x4B5850` | Gegner bewegen, feuern, sterben |
| `AddEnemy` | `0x575FF0` | Gegner-Instanz anlegen |
| Zeitleisten-Spieler | `0x50C9F0` | einmal je Tick, alle 7 Ebenen |
| `AddGegnerSchussErzeuger` / `SpielGegnerSchussErzeugen` | `0x4AA6A0` / `0x4AA0D0` | Waffen-Emitter |
| `AddGegnerS` / `SpielMoveGegnerS` | `0x4AA8F0` / `0x4AAFE0` | Gegnerschüsse |
| `AddAnima` / `SpielMoveAnimation` | `0x4A88E0` / `0x4A8BB0` | Effekt-Animationen |

`0x5882A4` ist **Anzahl der Spieler − 1** (Menü „Zwei Spieler?“, `0x54ED5D`),
nicht die Schwierigkeit, wie die Spec annahm.

## Grammatik

VB6 schreibt Obergrenzen (`ReDim a(0 To n)`), also Anzahl − 1 (−1 = leer), und
bisweilen vor anderen Feldern als die Elemente selbst. `str` = i32 Länge + CP1252.
`Get` mit 4 Byte unterscheidet Long und Single nicht; die Typen unten kommen aus
der Verwendung (`fld`/`fstp` gegen `mov`/`fild`).

```
"DOVE2 - V. 0.15"                 15 Byte
str   background                  Dateiname oder Zahl als Text
i32   nGroups-1,  Group[]
i32   nEnemies-1, Enemy[]
i32   nRoutes-1,  Route[]
      Layer[7]                    feste Anzahl, kein Zähler
i32   nAnims-1,   Anim[]
i32   nWeapons-1, Weapon[]
i32   nShots-1,   Shot[]
i32   nSounds-1,  Sound[]
str   radioPrefix
i32   nRadio-1,   Radio[]
i32 levelLength, i32 waterHeight, i32 weatherParticles, f32 gravity
str   music, str title
f32 × 6  waterTop RGB, waterBottom RGB
EOF
```

Die Feldreihenfolge jedes Records steht im Schema (`LevelDat.ts`); die Tabellen
unten nennen Feld, Typ, Laufzeit-Offset (Belegstelle) und Bedeutung.
Konfidenz: **H** aus dem Code gelesen und zu den Daten passend, **M** Mechanik
gelesen, Spielwirkung gefolgert, **L** Vermutung.

### Sprite-Gruppe (`0x5880AC`, 0x18 Byte)

| Feld | Typ | Laufzeit | Bedeutung | K |
|---|---|---|---|---|
| `unusedEditorId` | i32 | — | gelesen und verworfen; Gruppen werden über ihre Position referenziert | H |
| `name` | str | +0x0 | Editor-Name | H |
| `d3d` | i16 | +0x4 | ≠ 0: Direct3D-Quad (Farbe, Alpha, Drehung, additiv); 0: DirectDraw-Blit mit Colorkey, Aufblitz-Kopien `<bmp>_i` | H |
| `frames` | Liste | +0x8 | Bilder | H |
| └ `bmp` | str | +0x0 | BMP im Paket; `"-"` beendet die Folge, das vorige Bild bleibt stehen | H |
| └ `srcX…srcH` | i32 ×4 | — | Quellrechteck für `LoadSurface` | M |
| └ `delay` | i32 | +0x8 | Ticks je Bild (`DoAni` `0x4B5520`) | H |

### Gegnertyp (`0x5880B4`, 0x60 Byte)

| Feld | Typ | Laufzeit | Bedeutung | K |
|---|---|---|---|---|
| `hitPoints` | i32 | +0xC (Single) | × (1 + 0,5 · zwei Spieler); ganzzahlig (+0x1C) zugleich die Punkte, > 1499 großer Explosionston | H |
| `name` | str | +0x8 | Editor-Name | H |
| `speed` | f32 | +0x10 | px/Tick; Routen bewegen mit cos/sin · speed | H |
| `collidesWithTerrain` | i32 | +0x20 | > 0: Teile gegen Landschaft testen, Treffer zerstört | H |
| `ramsEnemies` | i32 | +0x24 | > 0: rammt andere Gegner (Rechteck um Wert − 1 eingerückt) | H |
| `directionalFrames` | i32 | +0x28 | > 0: eins von 8 Bildern nach Bewegungsrichtung | H |
| `wreckGroup` | i32 | +0x2C | 1-basierte Gruppe für Trümmer beim Tod | H |
| `deathShockwave` | i32 | +0x30 | Druckwelle beim Tod, schiebt und schädigt Spieler | H |
| `armorPassThrough` | i32 | +0x34 | durchschlagende Schüsse passieren gepanzerte Teile | L |
| `novaImmune` | i32 | +0x38 | nicht von der Super-Nova erfasst | H |
| `spawnSpec` | i32 | +0x3C | Teile mit Waffe −1 spucken Typ `v mod 1000` auf Route `v \ 1000` | H |
| `solid` | i32 | +0x40 | wirkt wie Landschaft | H |
| `deathSpawn` | i32 | +0x44 | beim Tod `(v mod 10) + 1` Gegner Typ `(v mod 1000) \ 10`, Route `v \ 1000` | H |
| `hitFlash` | i32 | +0x48 | 0 kein Aufblitzen, 1 getroffenes Teil, 2 alle Teile | H |
| `explosionSpec` | i32 | +0x4C | Fässer/Minen: Gegnerschaden · 10000 + Radius · 10 + (Spielerschaden / 10 + 1) | H |
| `boss` | i32 | +0x50 | Boss (setzt `0x5882A8`, Boss-Tod) | H |
| `partDebris` | i32 | +0x54 | zerstörte Teile fliegen als Trümmer weg | M |
| `noComboReset` | i32 | +0x58 | Entkommen setzt den Kombo-Multiplikator nicht zurück | M |
| `bigDeath` | i32 | +0x5C | lange Kettenexplosion | H |
| `parts` | Liste | +0x0 | Teile | H |

Beim Laden berechnet: +0x14/+0x18 Breite/Höhe = max(Teil-Offset + Bildgröße).

### Gegnerteil (0x88 Byte)

| Feld | Typ | Laufzeit | Bedeutung | K |
|---|---|---|---|---|
| `alpha`, `blue`, `green`, `red` | f32 | +0x1C, +0x18, +0x14, +0x10 | Farbe/Alpha für D3D-Gruppen (Vorgabe 1) | H |
| `vital` | i16 | +0x2C | Zerstörung tötet den ganzen Gegner | H |
| `damagesBody` | i16 | +0x24 | Treffer ziehen vom Gegner ab; sonst eigene `hitPoints` | H |
| `hitPoints` | i32 | +0x28 (Single) | eigene Lebenspunkte; ganzzahlig Punkte fürs Teil | H |
| `group` | i32 | +0x38 | Sprite-Gruppe | H |
| `route` | i32 | +0xC | eigene Route, −1000 keine | H |
| `hasRoute` | i16 | +0x8 | ≠ 0: Route jeden Tick relativ zum Gegner ausführen | H |
| `weapon` | i32 | +0x30 | Gegnerwaffe; −1: `spawnSpec` ausspucken | H |
| `fireMode` | i32 | +0x34 | 0 nie, 1–3 zufällig je Tick (p = 0,002/0,005/0,02, +0,005 je weiterem Spieler), 4–6 alle 25/50/100 Ticks, 7 einmal | H |
| `armored` | i16 | +0x2E | Treffer ohne Schaden | H |
| `rotation` | f32 | +0x20 | Grad; gezielte Waffen überschreiben sie jeden Tick | H |
| `x`, `y` | i32 | +0x0, +0x4 (Single) | Versatz zum Gegner | H |

Eigenheit des Originals: Der Landschaftstest addiert `red` (+0x10) auf x
(`0x4C21AC`), vermutlich ein Tippfehler — der Port übernimmt ihn in M8.

### Route (`0x5880BC`, 0xC Byte)

`name`, dann Befehle `op` (i32) mit Argumenten `{a, b}` (je f32). Jedes Argument
ist **`Var(a) + Var(b)`**; Beträge ab 32748 sind Variablen, ein negatives
Vorzeichen negiert:

| Code | Wert | Code | Wert |
|---|---|---|---|
| < 32748 | Literal | 32762 / 32763 | Zielspieler y / x |
| 32748…32755 | Lokale L7…L0 | 32764 / 32765 | 550 / 800 |
| 32756 | Level-Tick | 32766 / 32767 | −Höhe / −Breite |
| 32757 | Tempo | 32768 | Lebenspunkte |
| 32758 / 32759 | y / x | 32769 | Spieler − 1 |
| 32760 | Spawn-y (Schüsse: laufende Nummer) | 32770…32783 | Register R0…R13 (mit den Teilen geteilt) |
| 32761 | Spawn-Tick | 32784 | Spielerfeld `+0xA8` (Tutorial: Steuerungsschema) |

Ein Tick führt Befehle aus, bis einer nachgibt: **SetPos, MoveTo\*, Step, Wait**
und Goto ohne Label. Die Route endet (Objekt entfernen) am Ende der Liste, bei
MoveToAndDie am Ziel, bei Routenindex < 0 und nach 10 000 Befehlen ohne
Nachgeben. Zuweisungen an X/Y landen in Scratch-Feldern und wirken nicht; an die
Spielerposition wirken sie (der Zeppelin zieht den Spieler heran).

| Op | Name | Argumente | Wirkung | K |
|---|---|---|---|---|
| 0 | SetPos | x, y | setzen, gibt nach | H |
| 1 | MoveToAndDie | x, y | wie MoveTo, am Ziel Ende | H |
| 2 | MoveTo | x, y | mit Tempo hin; zielt neu, wenn das Ziel die Spielerposition nutzt; rastet ein | H |
| 3 | MoveToAccel | x, y, a | wie MoveTo, Tempo += a je Tick, Ende bei Tempo ≤ 0 | H |
| 4 | Step | dx, dy | einen Tick verschieben | H |
| 5 | Wait | n | n Ticks | H |
| 6 | SetSpeed | v | Tempo | H |
| 7 | SetPartFrame | Teil, Bild | Bild festhalten (< 0: animieren) | H |
| 8 | Fire | Teil, Waffe | Waffe am Teil anhängen; −1: `spawnSpec` spucken | H |
| 9 / 10 | Set / Random | Ziel, v / n | zuweisen / `Int(Rnd · n + 1)` | H |
| 11 / 12 | Label / Goto | id | Sprung zum ersten Label mit dieser id (Suche zur Laufzeit) | H |
| 13 / 14 / 15 | If / Else / EndIf | a, cmp, b | cmp −2 `<`, −1 `<=`, 0 `==`, 1 `>=`, 2 `>` | H |
| 16 | IfHitsLandscape | dx, dy | Block, falls die verschobene Box Landschaft trifft | H |
| 17 / 18 | SetGlobal / GetGlobal | i, v | von allen Objekten geteilte Ganzzahlen | H |
| 19 / 39 | SpawnAnimL4 / SpawnAnim | Anim, x, y (, Ebene) | Effekt-Animation | M |
| 20 / 21 / 28 / 40 | Div / Mul / SetInt / Distance | Ziel, … | Arithmetik | H |
| 22 | PolarVec | dx, dy, Grad | cos/sin(Grad) · Tempo | H |
| 23 | AngleDeg | Ziel, dx, dy | Richtung von (−dx, −dy) in Grad | H |
| 24 / 25 | SetLayerSpeed / SetLayerScroll | Ebene, v | Scrollgeschwindigkeit | M |
| 26 | AddLens | x, y, Größe, Stärke, Flag | Lupeneffekt | M |
| 27 | SetPartProp | Teil, Eigenschaft, v | Farbe/Alpha/Drehung eines Teils | M |
| 29 / 30 | PlaySound / StopSound | Ton (, Schleife) | | M |
| 31 | SetRumble | n | Erschütterung | L |
| 32 | Nop | | Trenner | H |
| 33 / 34 | SpawnBigParticle / Lightning | 12 | Partikel / Blitz (34 unbenutzt) | M |
| 35 / 36 | For / Next | Var, von, bis, Schritt | Schleife | H |
| 37 / 38 | AddBubble / AddFunction | | Blasen / Funkspruch | M |
| 41 / 42 | AddFade / SetSpecial | | Abdunkeln / Tutorial-Hinweise | L |
| 43 | SetTarget | Spieler | Zielspieler | H |
| 44 | IfPartDestroyed | Teil | Block, falls das Teil zerstört ist | H |

Blocksprünge zählen die Verschachtelung (If-Familie 13/16/44 mit Else/EndIf,
For/Next getrennt). Die Argumentzahl je Opcode ist in allen Daten fest; einzige
Ausnahme ist Step mit 48 Mal einem dritten, nie gelesenen Argument.

`DoRoute` hat drei Aufrufer: Gegner (Modus 0), Gegnerteile (1, x/y relativ zum
Gegner) und Gegnerschüsse (2). Der Port rechnet in Single (`Math.fround`) wie das
Original; alle 519 Routen laufen Tick für Tick bitgleich zu einem unabhängigen
Referenzsimulator aus der Analyse (Prüfsumme im Test).

### Zeitleiste: 7 Ebenen (`0x5880D8 + i · 0x14`)

Je Ebene `scrollSpeed` (f32, px/Tick; Routen ändern ihn) und Einträge
`tick, kind, p1, p2, p3`. Der Spieler (`0x50C9F0`) überspringt Einträge mit
kleinerem Tick und führt die mit gleichem aus; alle Ebenen sind sortiert.
Gespawnt wird am rechten Rand (x = 800). Zeichenreihenfolge 0, 1, 2, 5, 4, 3, 6;
Ebene 3 ist die Landschaft, Ebene 4 die Ereignisse.

| Ebenen | kind | Wirkung | p1 | p2 | p3 | K |
|---|---|---|---|---|---|---|
| 0–3, 5, 6 | 0 | Kachel/Hintergrundobjekt | Gruppe | Slot/Zeichenreihenfolge | y | H (p2: L) |
| 0–3, 5, 6 | 1 | Effekt-Animation | (Editor-Vorschau) | Anim | y | H |
| 3 | 2, 4, 5, 6 | Spezialobjekt, Untertyp kind − 2 | Parameter | Parameter | y | M |
| 3 | 3 / 7 | Checkpoint nur mit einem / zwei Spielern | Größe | — | y | H |
| 4 | 0 | Gegner | Typ | Route | y | H |
| 4 | 1 | Ton: p2 0 spielen, 1 Schleife, 2 stoppen | Ton | Modus | — | M |
| 4 | 2 | Funkspruch | Funk-Index | — | — | H |

Offen bis M8: 118 Einträge haben negative Ticks; sie feuern nur, falls ein
Level vor Tick 0 beginnt (`Me.584` startet mit `Me.560`).

### Effekt-Animation (`0x588124`, 0x20 Byte)

Mehrspurige Keyframe-Effekte, rein optisch (Warnschilder, Blitze, Rauch, Nebel,
Eis, Wandstücke). `duration` (Ticks), `loop`, `scrollWithLayer` (sonst
bildschirmfest), `notes` (in keinem Level belegt, zur Laufzeit ungelesen), Spuren
mit `group` und Keyframes: `time`, `x`, `y`, `red…alpha` (0…1), `rotation` (Grad),
`scaleX/Y`, `frame` (−1: animieren), `motion` des Segments, das hier endet
(0 halten, 1 linear, 2 konstantes Tempo mit Einrasten, 3 beschleunigt),
`speed`, `visible`, `additive`. Key 0 ist ein Vorlauf-Wächter (meist Kopie des
letzten Keys); beim Laden kommt ein Wächter am Ende dazu. Alle **H**; Details
und die Laufzeitstrukturen in der Analyse-Notiz (siehe unten).

### Gegnerwaffe (`0x5880A4`) und Schusstyp (`0x58809C`)

Waffe: `name`, `muzzleRotated` (Mündung am Rand des gedrehten Teils), Salven.
Eine Salve feuert `repeat + 1` Schüsse ab `startDelay`, alle `interval` Ticks
(0: alle im selben Tick — Ringe). Der Emitter zählt Schüsse über alle Salven;
die Nummer ist `Var` 32760 der Schussroute (Ringe: Winkel = Nummer · 18).

| Salvenfeld | Bedeutung | K |
|---|---|---|
| `onRouteEnd`, `spawnWeapon` | 1: am Routenende Waffe `spawnWeapon` an der Schussmitte zünden (Splitter) | H |
| `cullOffscreen` | Routenschüsse außerhalb (−w−50…850, −h−50…600) entfernen | H |
| `damage` | Schaden je Treffer (f32) | H |
| `route` | Schussroute, −1 geradeaus | H |
| `unblockable` | nicht von Force und Drohnen abgefangen | M |
| `shotType` | Schusstyp | H |
| `speed` | Tempo (f32) | H |
| `aimed` | einmal auf Spieler + (28, 31) zielen | H |
| `offsetX/Y` | Versatz zur Mündung (f32) | H |
| `piercing` | fliegt nach Spielertreffer weiter | H |

Schusstyp: `kind` (0 eingebaute blinkende 16×16-Kugel, 1 Sprite-Gruppe `group`),
`red/green/blue` (M), `rotate` (in Flugrichtung drehen), `trail` (0, 1 Nachbilder,
2 Glühen), Trefferbox `hitLeft…hitBottom`, `fadeIn`, `sound`, `ignoreWalls`,
`additive`.

### Sound, Funk, Levelwerte

- **Sound:** `file` in `Sound.d2p`, `extraVoices` gleichzeitige Kopien. H
- **Funk:** Text unter `[id]` in `<radioPrefix><Sprache>.txt` (siehe
  `dovez-container.md`), `maxPlays` (0 unbegrenzt). `unusedSpeaker` wird zur
  Laufzeit überschrieben, `unusedFlag` von keiner der drei Stellen gelesen, die
  das Funk-Array benutzen. H
- **Levelwerte:** `levelLength` (99999 in Bosslevels, 150 Ticks vorher wird der
  Abschluss eingeleitet), `waterHeight` (vom unteren Rand, 550 = alles Wasser),
  `weatherParticles` (regenartige Partikel, L), `gravity` (Trümmer, Partikel,
  manche Schüsse), Wasserfarben oben/unten (M).

## Werkzeuge

- **Round-Trip:** `bun test packages/formats/test/dovezLevelDat.test.ts`
  (loggt die Byte-Aufteilung).
- **Debug-Seite `#/dovez/debug/level`:** ←/→ Level, ↑/↓ Route bzw. Waffe,
  M Routen ↔ Waffen, D Befehlsliste. Routen starten mit Typ, Spawn-y und Tempo
  des ersten Zeitleisten-Spawns, als Teilroute relativ zum Gegner oder als
  Schussroute am Emitter (600, 275); der Spieler steht bei (100, 275), es gibt
  keine Landschaft und keine Treffer. Sprünge (SetPos) sind gestrichelt.
- **Laufzeitstrukturen** (Gegner-, Schuss-, Emitter- und Animations-Instanzen,
  Todeszustände) für M8: [`../measurements/dovez-runtime.md`](../measurements/dovez-runtime.md).
