# DOVE + DoveZ — All-in-One Browser-Port

> Design-Spec. Stand: 2026-09-07, fortgeschrieben 2026-09-27.
> Status: **M0 bis M7 umgesetzt, M8 im Aufbau** (Stand je Meilenstein in der Tabelle unten).
> Die Umsetzung hat einige Annahmen dieses Dokuments korrigiert; maßgeblich
> sind jetzt [`docs/formats/dove-level-dat.md`](../formats/dove-level-dat.md),
> [`docs/formats/dove-assets.md`](../formats/dove-assets.md) und für DoveZ
> [`docs/formats/dovez-level-dat.md`](../formats/dovez-level-dat.md), für die
> Mechanik `docs/measurements/dove-{events,player,enemies,weapons,bosses,audio,flow}.md` und
> `dovez-runtime.md`. Korrigierte Stellen sind hier mit *(M1)* … *(M7)* markiert.

## Context

Im Repository `amigo-clove` liegen zwei deutsche Windows-Arcade-Shooter als
unveränderte Original-Installationen:

- `original-dove/` — **DOVE 1.10** (1999–2003) von Markus „Kauto" Madeja.
  2D-Sidescroll-Shmup im R-Type-Stil, 12 Level, ~1 MB Spieldaten.
  Visual Basic 6 + DirectDraw7 + BASS 0.8, 640×480.
- `original-dovez/` — **DoveZ – The Second Wave** (2004, Updates bis 2019) von
  Markus Madeja's Intergenies. Nachfolger, ~270 MB Spieldaten, 27 Level-Pakete,
  zwei Spielerschiffe, lokaler Coop, DE/EN/RU. Visual Basic 6 + DirectX 7
  (DxVBLib) + zlib + Ogg Vorbis, 800×600.

Beides sind native Win32-Binaries, an Windows gebunden und auf modernen Systemen
nur mit Nachhilfe lauffähig. Ziel ist ein **plattformunabhängiger
Browser-Port**: ein gemeinsamer Launcher, aus dem heraus beide Spiele startbar
sind — jedes mit eigener Engine und eigenem Look, aber mit den **Original-Assets**
(Grafik, Sound, Level), die aus den Originaldateien extrahiert werden.

Beide Spiele wurden vollständig analysiert; die Formate sind entschlüsselt
(DOVE restlos, DoveZ bis auf die Feldsemantik einer Sektion). Dieses Dokument
hält den Befund und den Bauplan fest.

### Vom Nutzer festgelegte Rahmenbedingungen

| Entscheidung | Wahl |
|---|---|
| Zieltreue | **1:1-Port mit Original-Assets** |
| All-in-One | **Ein Launcher, zwei Spiele** — gemeinsame Shell, getrennte Engines |
| Renderer | **PixiJS** (WebGL-2D) |
| Spiel-Logik | **TypeScript** |
| Reihenfolge | **DOVE zuerst**, DoveZ als zweite Ausbaustufe |
| Tracker-Musik | **`libopenmpt.js` zur Laufzeit** (~4 MB Module statt 60–100 MB OGG) |
| DoveZ-Videos | **VP9/WebM** |
| Asset-Ablage | **Normale Git-Blobs** (kein LFS) |
| Repo-Sichtbarkeit | **privat** |
| Referenzaufnahmen | verfügbar — die Originale laufen bereits auf der Maschine |
| Lint + Format | **oxc** — `oxlint` und `oxfmt` |

---

## Analyse-Ergebnis DOVE

Alle Formate sind offen — es ist **kein Cracking nötig**.

| Asset | Tatsächliches Format | Port-Aufwand |
|---|---|---|
| `Data/Grafik/*.spr` (60 + `METROID.dat`, 29,8 MB) | **Unkomprimiertes Windows-BMP**, 24/8/4/1 bpp. Das Spiel konvertiert beim ersten Start ausgelieferte JPG/GIF nach BMP und benennt sie `.spr` | trivial → WebP |
| `Data/Level0-11.dat` | **Reiner CRLF-ASCII** (VB6 `Write #`), CP1252. *(M1)* Von Git beim ersten Commit auf LF normalisiert, per `scripts/originals-crlf.ts` auf CRLF zurückgeführt | trivial → JSON |
| `Data/intro.dat` | reiner ASCII, *(M1)* **eigenes** Schema (Kopf + Rect-Records) | trivial |
| `Data/Musik/*.xm` (18) + `s4.IT` | FastTracker II / Impulse Tracker, 3,8 MB. *(M2)* 19 Module insgesamt, nicht 20 | `libopenmpt.js` |
| `Data/Sound/*.wav` (209 KB) | *(M2)* 15× **MS-ADPCM**, 5× PCM 8 bit, alle mono; `fact`-Chunks meist veraltet | → PCM16 (*(M2)* 0,6 MB) |
| `Data/1-5.dat` | 2880er-Permutation — *(M4)* nicht zur Laufzeit erzeugt, sondern der Schlüssel der kachelweise verwürfelten Endbilder `B1–B5` | Pipeline entwürfelt die Endbilder |

### Levelformat (vollständig dekodiert und verifiziert)

```
Sektion 1: Landschafts-Tiles     je Record: "Name", l, t, r, b   (Rect in landschaftN.spr)
"*"
Sektion 2: Hintergrund-Objekte   gleiches Schema
"*"
Sektion 3: Gegner-Definitionen   siehe unten
"*"
Sektion 4: Bewegungs-Pattern     "Name", 2 VB-Booleans, 2 Ints,
                                 Wegpunkte (x,y), Terminator "-1 <end>"
                                 (M1: end meist 0, in 5 Patterns nicht)
"*"
32000                            Levellänge in Ticks (in allen 12 Leveln identisch)
<32001 Event-Zeilen>             eine pro Tick (VB6 0 To 32000), überwiegend leer
"backgroundN"                    Hintergrundbild
```

**Gegner-Record — Korrektur gegenüber der ersten Annahme: 5 Parameter, nicht 7.**

```
name                       (quoted, CP1252)
l, t, r, b                 (Atlas-Rect)
p0, p1, p2, p3, p4         (5 Parameter)
je Frame:  f0, f1          (2 Frame-Header-Werte)
           (h+1) × (left, right)      wobei h = b - t
```

Die **Framezahl steht nirgends** in der Datei — sie ergibt sich aus
`(recordLen - 5 - 5) / (2 + 2·(h+1))`. Diese Division geht bei **allen 145
Gegner-Records in allen 12 Leveln** glatt auf; mit jeder anderen Parameterzahl
scheitert sie. Ein Parser mit 7 Parametern läuft bei jedem mehrfach animierten
Gegner aus dem Takt.

Weitere verifizierte Details:
- **Colorkey ist beweisbar reines Schwarz (0,0,0).** Gegenprobe „Ufo" aus
  `Level1.dat` (Rect 66,400–129,434) gegen `feinde1.spr`: die aus den Pixeln neu
  berechneten Nicht-Schwarz-Spannen stimmen in Zeile 0–30 **exakt** mit den im
  Level gespeicherten `(left,right)`-Paaren überein. Das bestätigt in einem Zug
  Colorkey, BMP-Bottom-up-Flip, Rect-Interpretation und Kanten-Inklusivität.
  *(M1)* Über **alle** Frames gilt das nicht exakt: Nur 68,8 % der 19959
  Konturzeilen stimmen pixelgenau, die übrigen sind breiter (meist 1 px) —
  aber **nie** schmaler. Die gespeicherte Kontur ist ausnahmslos eine Obermenge
  der Pixelspanne; darauf prüft jetzt die Kreuzvalidierung.
- **Leere Konturzeilen** sind mit `left > right` kodiert (z. B. `63 49` bei
  Breite 64), nicht mit `-1`. Der Sentinel fällt aus jedem Span-Vergleich
  automatisch heraus — kein Sonderfall nötig.
- **Frames liegen vertikal gestapelt** mit Stride `h`. Die `(h+1)`-te Zeile
  jedes Frames ist ein Off-by-one des Original-Tools und ragt ins nächste
  Frame — ignorieren.
- Der Event-Stream ist **extrem dünn**: 20 (Level 0) bis 819 (Level 9) belegte
  Zeilen von 32000. Gesamt über alle Level: `;0`=771, `;1`=2105, `;2`=217,
  `;3`=40, `;4`=49, Spawns=3915.

Event-Tokens pro Tick:

| Token | Bedeutung |
|---|---|
| `;0 <tile> <y>!` | Landschafts-Tile platzieren (Wand) |
| `;1 <gegner> <pattern>!` | aktuellen Gegnertyp + Bewegungspattern **setzen** |
| `;2 <art> <y>!` | Extra spawnen, `art` ∈ {−2,−1,0,1,2,3} ≙ Schild, Bombe, Option, Rot, Grün, Blau |
| `;3 0 0!` | *(M1)* 0–8× pro Level (40 gesamt) — vermutlich Checkpoint |
| `;4 <obj> <y>!` | Hintergrundobjekt spawnen |
| `<y>§` | Gegner-Spawn auf Y-Position (`§` = Byte `0xA7`) |

*(M1)* Tile-, Gegner- und Objektreferenzen sind **1-basiert**; Pattern `0` und
`−1…−7` sind eingebaute Bewegungsarten, `1…n` verweisen auf Sektion 4.

~~Wichtige Semantik: `;1` spawnt nicht~~ *(M3, aus der EXE)*: `;1 T P!`
**spawnt sofort**; bei P ≤ 0 liefert das erste folgende `y§` derselben Zeile die
Y-Position. Alleinstehende `y§` wertet das Original nie aus — 2460 der 3915
`§`-Tokens sind tote Daten (`docs/measurements/dove-events.md`).

### Spielmechanik

- **Waffen:** drei Farben — Rot (Streulaser), Grün (Reflektionsbälle),
  Blau (Twinlaser). Gleiche Farbe mehrfach = Upgrade, andere Farbe = Reset.
- **Beam:** Aufladeschuss, durchdringt Wände, neutralisiert gegnerische Schüsse.
- **Ausrüstung:** Option (max. 2, umkreist das Schiff, unzerstörbar), Bombe, Schild.
- **Steuerung:** Pfeiltasten, `S` Dauerfeuer, `A` Beam laden, `D` Extrawaffen-
  Position vorne/hinten, `Q`/`W` bremsen/beschleunigen, `ESC` Pause.
- **Optionen** (Gegner schießen Voll/Halb/Aus, Wandkollision An/Aus,
  Ausrüstungsverlust An/Aus) ergeben einen **Punktefaktor**; >1 aktiviert den
  Hard Mode, in dem Level freigespielt werden.
- 12 Level: Tutorial, Lost In Space, Factory, Deep Blue See, Back in Space,
  Crystal Cave, Speed, The Unreal World, DOVE INSIDE, Final Level, Final Fight,
  ExtraLevel. Endgegner-Handler existieren für Level 1–8 und 10.

---

## Analyse-Ergebnis DoveZ

### Containerformat (`.dlp` / `.dfp` / `.d2p` — alle identisch)

Kein Magic, kein Header, kein Directory. Eine sequentielle Kette von zlib-Blöcken:

```
Record := u32 uncompressedSize (LE)
          u32 compressedSize   (LE)
          byte[compressedSize] zlib-Stream (RFC1950)

Datei  := ( Record(Dateiname, CP1252) Record(Dateiinhalt) )*  bis EOF
```

Alle 52 Container parsen restlos durch, kein Padding, keine Overlay-Reste. Zum
Auflisten muss linear durchlaufen und jeder Namensblock entpackt werden. Im
Browser direkt mit `DecompressionStream('deflate')` lesbar.

| Endung | Inhalt |
|---|---|
| `.dlp` | 1 Level-`.dat` + BMPs + `.r`-Konturen + Funktexte `<Level>D/E/R.txt` |
| `.dfp` | ausschließlich WAVs — die Funkspruch-Sprachaufnahmen des Levels |
| `.d2p` | globale Pakete: `Menu`, `Spiel`, `Standart`, `Loading`, `Logo`, `Pause`, `Sound`, `Video`, `Play` |

Vollständiges Inventar (6150 Einträge entpackt):

| Typ | Anzahl | unkomprimiert |
|---|---:|---:|
| `.bmp` | 3232 | 257,1 MB |
| `.wav` | 243 | 107,1 MB |
| `.avi` | 12 | 92,3 MB |
| `.r` | 2587 | 2,4 MB |
| `.dat` | 27 | 0,59 MB |
| `.txt` | 49 | 0,04 MB |

Plus lose: 20 Ogg Vorbis (61 MB), 2 Intro-AVIs (101 MB).

`Play.d2p` enthält `Play.txt` — 413 Byte, die die **komplette Kampagnenstruktur**
definieren: `Load <Level>,<Screen.bmp>`, `Play <video.avi>`, `Save`, `credits`.
Nicht im Skript und damit Bonus-Inhalt: `Level8-1 Jungle`,
`Spacestation Bonus`, `Level Bleistift`, `Epilog`.

### Weitere Formate

- **`.r`-Dateien:** ~~`u32 width, height, bboxLeft, bboxRight, -1, -1`, danach pro
  Bildzeile `i32 left, right` (bottom-up)~~ *(M6, korrigiert)* `i32 width, height,
  top, bottom` (erste/letzte belegte Zeile), dann `height` Paare `left, right`
  **oben beginnend** (leer `-1, -1`), Abschluss `-1, -1`. 2525/2546 zeilengenau
  zu den Pixeln. Strukturell dieselbe Datenstruktur wie DOVEs Konturzeilen.
  Details: `docs/formats/dovez-container.md`.
- **BMP-Tiefen: 1, 8, 16, 24 und 32 bpp.** 16 bpp (RGB555) und 32 bpp (XRGB mit
  Müll-Alphabyte) brauchen eigene Decoder-Pfade.
- **Alpha:** nur **83 Masken-Paare** *(M8: 79; die vier `interface*_energyA` sind eigene Bilder)* (`X.bmp` + `XA.bmp`) gegenüber 3026 reinen
  Colorkey-Sprites. Genau eine Maske hat abweichende Maße:
  `atlantis_saule2.bmp` (190×520) vs. `atlantis_saule2A.bmp` (200×540) — das ist
  ein Pflicht-Override, kein Fall für stilles Skalieren.
- **Funktexte:** INI-artig, `[Trigger]` + `Frame; <wav>; <ms>; <Untertitel>`,
  optional ein zweiter Sprecher-Block. Section-Namen entsprechen den Funk-IDs im
  Level-Skript. *(M6)* Viergruppen `Sprecher; WAV; ms; Text` über Zeilen hinweg,
  Sprecher `Frame` oder `0`. **Aufnahmen gibt es nur auf Englisch** — D und E
  verweisen auf dieselben `…E_*.wav`; `R.txt` (CP1251) verweist auf fehlende
  `RU`-Dateien. Das Bundle heißt daher `voice/<level>`, nicht `voice/<lang>`.
- **Video:** DivX 5 (`dx50`, MPEG-4 ASP) + MP3, 800×600, 3,2 Mbit/s. Kein Browser
  spielt MPEG-4 ASP — Transkodierung ist Pflicht.

### Level-Skript `<Level>.dat` — weitgehend dekodiert

> *(M7)* **Vollständig dekodiert**, und zwar aus `LadeDaten` in der
> (UPX-gepackten) `DoveZ.exe` statt aus den Bytes. Einige Aussagen dieses
> Abschnitts sind dadurch überholt: Die „Spawn-Timeline“ sind sieben
> Zeitleisten-Ebenen mit festen 5×i32-Einträgen (keine variablen Records), die
> „Nullfelder“ im Gegner-Record sind 16 Gegner-Flags, die Sektion
> „Bewegungsmuster“ ist ein Bytecode mit 45 Befehlen, und die dort als
> Gegnerteile bezeichneten 56-Byte-Records sind Teile (Sprite, Waffe, Route),
> keine Schuss-Erzeuger. Maßgeblich: `docs/formats/dovez-level-dat.md`.

Magic ASCII `DOVE2 - V. 0.15`, VB6-Serialisierung. Strings sind `u32 len` +
CP1252-Bytes.

**Der entscheidende Befund:** Das Format enthält **drei Skalartypen** —
`Long` (i32), `Single` (f32, IEEE-754 LE) und `Integer`/`Boolean` (i16, VB6
schreibt `True` als `-1`, also `FF FF`). Ein Parser, der alles als `i32` liest,
zerlegt die Floats in Rauschen und kann die Semantik prinzipiell nicht finden.
Das war der Blocker der bisherigen Analyse.

**Zweiter Befund:** Alle Zähler folgen dem VB6-Idiom `ReDim arr(0 To n)`, sind
also **`count - 1`**. Sektionen sind zählerpräfixiert, nicht terminiert.

Korrigierte, an allen 27 Levels verifizierte Grammatik des Kopfteils:

```
Header  := "DOVE2 - V. 0.15"      (15 B, ohne Terminator)
           str  hintergrund        // Dateiname ODER numerischer Index als Text
           i32  nGroups-1
Group[] := i32  slotId             // Slot-/Referenz-ID, nicht Position
           str  gruppenname
           i16  flag               // 0000 = Gegner-Sprite, FFFF = Effekt/Hintergrund
           i32  nFrames-1
Frame[] := str bmpName, i32 x, i32 y, i32 width, i32 height, i32 delayTicks
```

`delayTicks` nimmt u. a. `1,2,3,5,9,10,15,56,60,120,155,170,9999,-1` an —
`9999` bedeutet „hier stehenbleiben". Frame-Listen sind bereits ausgerollte
Ping-Pong-Sequenzen. **27/27 Dateien parsen fehlerfrei bis zum exakten
Sektionsende.**

**Die Sektions-Strides** sind über die Abstände der Klartext-Namen bestimmt:

| Sektion | Stride | Deutung |
|---|---|---|
| Gegnertypen | `132 + k·56` | Basis-Record 132 B + k Sub-Records à 56 B (= Schuss-Erzeuger, vgl. `AddGegnerSchussErzeuger` in der EXE) |
| Bewegungsmuster | `28 + k·8` | Header 28 B + k Wegpunkte à 8 B (Gegenstück zu DOVEs Wegpunkt-Patterns) |
| Waffendefinitionen | 58 | fix |
| Schusstypen | 54 | fix |
| Sound-Zuordnung | 4 | ein `i32` je Sound |
| Funkspruch-IDs | 10 | fix |

**Die Spawn-Timeline ist gefunden** — der zuvor unerklärte Block zwischen
Funk-Triggern und Waffendefinitionen. 156 Records à **20 Byte**, terminiert
durch `tick = -1`:

```
LevelSkriptEntry := i32 tick, i32 typeIdx, i32 param, i32 flag, i32 y
```

Belege: Feld 1 steigt streng monoton (2387, 2431, 4247, …, 8385, dann `-1`);
Feld 2 liegt in `[0,14]` bei genau 15 Gegnertypen; Feld 5 liegt in `[190,447]`.
Die EXE führt passend die Prozeduren `LevelSkript` und `LTick`.

Ein enormer Vorteil für die weitere Dekodierung: **die Sektionsnamen sind
deutschsprachig und selbsterklärend** — `Zeppelin(Taktik2)`, `Zecke stark`,
`Zeckenwerfer Speed3`, `ironeagle (beschleunigung)`, `Schuss: links oben`,
`Hinter der Wolke unten3`, `Einkreisen`. Der Autor hat die Gegner nach ihrem
Verhalten benannt; das ist ein geschenktes Label-Set für die Differenzanalyse.

**Verbleibende Unklarheiten** *(M7: beide aufgelöst, siehe oben)*:
1. In einem Timeline-Record fällt eine `1.0f` in eine Spalte — entweder ein
   Offset-Versatz oder **variable Record-Längen** (verschiedene Kommandotypen
   mit Extra-Payload, analog zu DOVEs fünf Befehlen). Größtes Einzelrisiko,
   früh zu klären.
2. Rund 24 Nullfelder im 132-Byte-Gegner-Record. Vermutung: Der Editor schreibt
   schlicht die komplette Laufzeit-Struktur mit, die Felder sind irrelevant.
   Dafür spricht die Fehlermeldung „*Level im Editor laden, neu abspeichern und
   packen*" — der Editor war das Spiel mit anderem Frontend.

**`DoveZ.exe` ist nativ kompiliertes VB6, kein P-Code** *(M7: zusätzlich
UPX-gepackt; `upx -d` legt den Code frei)* (belegt durch
`__vbaExceptHandler`, `_CIcos`, `__vbaRedim`). Ein VB-Decompiler liefert daher
**keinen** Quelltext, nur kommentierte Pseudo-Assembly. Ghidra bleibt
Rückfallebene für die letzten Felder, ist aber keine Abkürzung. Lohnend sind
dort genau vier Funktionen: `LadeDaten` (Feldlayout), `SpielMoveEnemy`
(Feldsemantik), `LevelSkript`/`SpielTick` (Timeline-Opcodes), `LadeR`.

---

## Architektur

### Repo-Layout

```
amigo-clove/
├─ package.json                  # Bun workspaces
├─ tsconfig.base.json            # strict, noUncheckedIndexedAccess
├─ .oxlintrc.json                # Lint (oxlint)
├─ .oxfmtrc.json                 # Format (oxfmt)
├─ original-dove/  original-dovez/     # unangetastet, read-only Referenz
├─ packages/
│  ├─ core/       @clove/core      – mechanikfreie Bausteine, kein Pixi, kein DOM
│  ├─ formats/    @clove/formats   – reine Parser/Serializer, isomorph, ohne Abhängigkeiten
│  ├─ pixi-kit/   @clove/pixi-kit  – Pixi-Adapter (Scaling, Atlas, Debug-Overlay)
│  ├─ assetkit/   @clove/assetkit  – CLI-Konverter (Node-only, ffmpeg/sharp)
│  ├─ game-dove/  game-dovez/      – die beiden Engines
│  └─ shell/      @clove/shell     – Launcher (Vite-App, einziges Deploy-Target)
├─ assets/                        # generiert, committet, content-gehasht
├─ tools/                         # Wegwerf-Analyseskripte (Python erlaubt)
└─ docs/
   ├─ specs/                      # dieses Dokument
   ├─ formats/                    # dove-level-dat.md, dovez-dlp.md, dovez-level-dat.md
   ├─ determinism.md
   └─ playtest-checklist.md
```

**Der wichtigste Schnitt ist `formats` getrennt von `assetkit`.** `formats`
enthält ausschließlich `Uint8Array → Objekt` und zurück — ohne `node:fs`, ohne
ffmpeg. Folgen: Round-Trip-Tests laufen ohne I/O in Millisekunden, und die
Parser sind **im Browser lauffähig**, sodass ein Debug-Modus Originaldateien per
Drag & Drop laden kann. Das ist beim DoveZ-Reverse-Engineering Gold wert.

**`core` getrennt von `pixi-kit`:** Die Simulation darf Pixi nie sehen. Diese
Grenze wird per Lint-Regel erzwungen, nicht per Konvention (oxlint
`no-restricted-imports` als Override auf `sim/**`).

### Was geteilt wird — und was ausdrücklich nicht

Regel für `@clove/core`: *Ein Modul gehört nur dann hierher, wenn es nichts von
Gegnern, Waffen, Leveln oder Punkten weiß.*

**Geteilt:** `FixedStepLoop`, `fx.ts` (Q16.16-Festkomma), `Rng` (xorshift32),
**`ContourMask`** (DOVEs `(left,right)`-Zeilenpaare und DoveZ' `.r`-Dateien sind
strukturell dieselbe Datenstruktur — ein Span-Overlap-Test dient beiden),
SoA-Pools, `BundleLoader`/`Manifest`, `AudioBus`/`SfxPool`/`ModulePlayer`,
`InputSource`, `SaveStore`, `Replay`/`Hash`, `GameModule`, i18n. Dazu aus
`pixi-kit`: `ScreenRoot` (ganzzahliges Scaling + Letterbox), `AtlasRegistry`,
`BitmapFontLoader`, `DebugOverlay`.

**Ausdrücklich nicht geteilt:** keine gemeinsame Entity-Basisklasse (DOVE ist
tickbasiert mit fester Levellänge und erzwungenem Auto-Scroll, DoveZ
routen-/taktikbasiert mit 5-Ebenen-Parallax und zwei Spielern), kein gemeinsames
Waffensystem, kein gemeinsames Kollisions*regelwerk* (nur die Datenstruktur),
kein gemeinsames Level-Schema, kein gemeinsames HUD (640×390+100 vs. 800×600).
Video, Funksystem und Multiplayer-Splitinput existieren nur in DoveZ.

> Faustregel für Reviews: **Wenn ein Modul in `core` ein `if (game === 'dove')`
> bekommt, gehört es nicht nach `core`.**

### Asset-Pipeline

Ein CLI unter Bun: `assets:build`, `assets:check`, `assets:verify`,
`assets:report`. Stufenkette aus reinen Funktionen `(bytes, options) => bytes`:
`unpack → image → atlas → audio → music → video → level → manifest`.

| Quelle | Ziel | Begründung |
|---|---|---|
| BMP (beide Spiele) | **WebP lossless** | gemessen: DOVE 29,8 → 6,3 MB, DoveZ ~257 → ~52 MB. PNG wäre 1,5× größer. Verlustbehaftet ist bei einem 1:1-Port ausgeschlossen — die Pixel *sind* das Spiel. `--image-format=png` als Debug-Schalter |
| MS-ADPCM + PCM8 (DOVE, 209 KB) | **PCM16-WAV** (~0,8 MB) | Browser dekodieren MS-ADPCM nicht. Bei der Größe wäre jede verlustbehaftete Kodierung Selbstverstümmelung |
| DoveZ-WAVs (243, 107 MB) | **Opus** 48 kbit mono (Sprache) / 64 kbit (SFX) → ~6–9 MB | PCM ist bei 107 MB ausgeschlossen. Alle SFX werden vollständig in `AudioBuffer` dekodiert, die Opus-Latenz ist damit irrelevant |
| XM/IT (3,8 MB) | **unverändert**, `libopenmpt.js` zur Laufzeit | Faktor 15 kleiner als Vorab-Render, nahtlose Loops nativ, Originaldateien bleiben unangetastet |
| DoveZ-Musik (20 OGG, 61 MB) | **unverändert**, gestreamt | Vorbis ist browser-nativ; kein Grund für Generationsverlust. Streaming über `MediaElementAudioSourceNode` — `decodeAudioData` würde 61 MB zu ~600 MB PCM im RAM aufblasen |
| DivX-AVI (14, 193 MB) | **VP9/WebM** (~25 MB) | MPEG-4 ASP spielt kein Browser |
| Level-`.dat` | **JSON + Binär-Sidecars** | Konturen als `Int16Array`-Blob, nicht als JSON — das wären Millionen Zahlen. *(M2)* Layout: `docs/formats/dove-assets.md` |

**Atlas-Packing: für DOVE nein, für DoveZ ja.** Das folgt aus den Daten, nicht
aus Inkonsistenz. DOVEs Level referenzieren *absolute Pixel-Rects* in
`feindeN.spr`, und Animationsframes werden über den impliziten vertikalen Stride
gefunden — ein Repack zerstörte beides. Pro Level werden ohnehin nur ~3 Atlanten
geladen (~5 MB VRAM). DoveZ dagegen hat 3232 Einzeldateien, 45–238 pro Level;
ohne Packing wären das hunderte GPU-Texturen. Packer: deterministisches
MaxRects, Sortierung nach Name (nicht nach Fläche), 2048×2048, 1 px Rand.

**Transparenz.** Default: RGB == (0,0,0) → `alpha = 0`. Sonderfälle: bei
palettierten BMPs keyt DirectDraw auf den *Index*, nicht auf RGB — der Konverter
prüft beides und meldet jede Datei, bei der Index 0 und aufgelöstes Schwarz
auseinanderfallen. 16 bpp wird mit Bit-Replikation (`v<<3 | v>>2`) expandiert,
32 bpp bekommt hart `alpha = 255` (das gespeicherte Byte ist Müll), dann greift
der Colorkey. Kein Alpha-Bleeding, weil durchgängig `scaleMode: 'nearest'`.

**Reproduzierbarkeit.** Manifest mit SHA-256 aller Quellen und Ausgaben,
Cache-Key `sha256(input) ⊕ sha256(options) ⊕ converterVersion`, content-gehashte
Dateinamen. *(M6: CI läuft `assets:verify`, das nur hasht — Assets werden einmal
lokal gebaut; `assets:check` bleibt als gründliche lokale Prüfung.)* `assets:check` baut in einen Temp-Ordner und schlägt
fehl, sobald ein Output vom Committeten abweicht — das fängt handeditierte
Assets. Video wird vom Hash-Gate ausgenommen (Encoder sind über Buildversionen
nicht bit-identisch) und nur mit `--force-video` neu erzeugt. *(M6)* Ebenso Opus: libopus
kodiert auf verschiedenen CPUs verschieden (SIMD zur Laufzeit gewählt); das Flag heißt
`--force-encode`, siehe `docs/formats/dovez-assets.md`.

~~**Eine Besonderheit:** Terrain-Kollisionsmasken~~ *(M3)* Entfällt: Das
Original testet Wände per inklusivem AABB gegen die Tile-Rechtecke, nicht
pixelweise (`docs/measurements/dove-events.md`). M2 hatte Masken erzeugt, seit
Level-Asset-Version 2 sind sie entfernt — die Pipeline konvertiert nur noch.

Werkzeuge: alles TypeScript unter Bun. **Eigener BMP-Decoder** (weder sharp noch
jimp behandeln 16 bpp und die Palettenfälle zuverlässig, und wir brauchen
exakte Kontrolle über den Colorkey-Pfad), `sharp` zum Enkodieren, eigenes
MaxRects, `ffmpeg` als externes Binary (nicht ffmpeg.wasm — viel zu langsam bei
193 MB). Python nur in `tools/`, nie im Build-Pfad.

### Engine DOVE

**Fixed-Step, getrennt vom Rendering.** Akkumulator-Schleife mit Catch-up-Limit
(max. 5 Ticks, danach Zeit verwerfen statt einer Ton-Salve), `document.hidden`
pausiert statt vorzuspulen, Render-Interpolation standardmäßig **aus**
(Pixel-Exaktheit vor Glätte).

**Original-Tickrate** *(M1)*: **`TICK_MS = 14`** (≈ 71,4 Hz), statisch aus der
Hauptschleife von `DOVE.exe` bestimmt — `nextT = timeGetTime + 14`, ein
Level-Tick (`Me.F4 += 1`) pro Schleifendurchlauf. Auf Rechnern mit grobem
Systemtimer lief das Original effektiv mit 15,6 ms. Herleitung mit Adressen:
[`docs/measurements/tick-rate.md`](../measurements/tick-rate.md). `TICK_MS`
bleibt eine einzelne Konstante.

**Event-Stream** nicht als `Map` mit Lookup pro Tick, sondern zur Ladezeit in
vier flache Arrays entpackt (`eventTicks`, `eventKind`, `eventA`, `eventB`) mit
einem einzigen Cursor. O(1) amortisiert, null Allokationen — und der komplette
Stream-Zustand ist **eine Ganzzahl**, also trivial im Snapshot.

**Entities als Struct-of-Arrays** mit festen Kapazitäten und LIFO-Freelist
(128 Gegner, 512 Schüsse, 512 Gegnerschüsse, 1024 Partikel, …). Drei Gründe, und
alle drei zählen: null GC in der Simulation; der gesamte Weltzustand sind wenige
Typed Arrays, also ist `hash()` ein Durchlauf; deterministische
Iterationsreihenfolge über den Index.

**Alle Größen sind Q16.16-Festkomma in `Int32Array`**, nie Float — Positionen,
Geschwindigkeiten, Beam-Ladung, Scroll-Offset. Sinus/Kosinus aus einer
1024-Einträge-Tabelle. Das ist die Voraussetzung dafür, dass der Tick-Hash über
Browser, Bun und Node bit-stabil ist und Replays als Regressionsnetz taugen.

**Kollision** *(M3, aus der EXE)*: ein einziger Test für Schuss↔Gegner und
Spieler↔Gegner — vertikaler Ausschluss über die Frame-Zeilen `f0…f1`, dann
min(left)/max(right) über die überlappenden Konturzeilen gegen das x-Intervall
der Box (inklusiv). Kein Punkt-in-Kontur. Wände: inklusives AABB gegen die
Tile-Rechtecke. Details: `docs/measurements/dove-enemies.md`.

*(M3)* Die Parameter sind aus der EXE belegt: p0 Framezahl − 1, p1
Animationsverzögerung, p2 HP und Punkte, p3 Schusstyp, p4 Tempo
(`docs/measurements/dove-enemies.md`). Die Regeln unten gelten weiter für
künftige offene Felder:

**Die unbelegten Gegner-Parameter** — drei Regeln:
1. **Rohindizes verlassen nie `data/EnemyDef.ts`.** Dort stehen benannte
   Accessoren mit dokumentierter Evidenz und Konfidenz
   (`score = d => d.p[2]` — Werte {20,100,150,300} korrelieren mit Rolle;
   `hp = d => d.p[4]` — Evidenz schwach, `TODO(verify)`). Umetikettieren ist
   dann eine Einzeilenänderung.
2. `tools/analyze-enemy-params.ts` kreuztabelliert alle 145 Records gegen
   Spritegröße, Framezahl, Level und Patternzuordnung — Hypothesen werden
   statistisch geprüft, nicht geraten.
3. `assets/dove/overrides/enemies.json` nimmt handkorrigierte Playtest-Werte
   auf, ohne die abgeleiteten Daten zu verunreinigen.

**Rendering:** `antialias: false`, `roundPixels: true`, `scaleMode: 'nearest'`,
feste Layerreihenfolge ohne `sortableChildren`. Bitmap-Fonts aus `text.spr` und
`text2.spr` — niemals Pixi `Text` mit Canvas-Font, das wäre kein 1:1-Port.
*(M3)* `text.spr`: 31×3 Glyphen à 8×12, Zuordnung aus `GetLetter` (A–Z,
Ziffern, Satzzeichen, Umlaute); geschnitten zur Laufzeit als Teiltexturen.

### Launcher-Shell

Vertrag `GameModule` in `@clove/core`: Die **Shell besitzt** Canvas,
AudioContext, SaveStore, Input-Geräteschicht, Locale, Ladebildschirm und
Routing. Das **Spiel besitzt** alles ab `boot()` — Pixi-Application auf dem
übergebenen Canvas, Szenen, Pausenoverlay (DoveZ hat ein eigenes
`Pause.d2p`-Bild). Das Spiel fasst nie `location`, `document.title` oder die
Erzeugung von Canvas und AudioContext an.

`dispose()` muss hart aufräumen; in Dev-Builds verifiziert die Shell das über
einen Ressourcenzähler und wirft, wenn nach `dispose()` noch Texturen leben —
sonst frisst wiederholtes Wechseln zwischen den Spielen den VRAM.

Hash-Routing (`#/dove`, `#/dovez`, `#/settings`, `#/dovez/debug/assets`), kein
Server-Rewrite nötig. Beide Spiele sind getrennte Vite-Chunks per dynamischem
`import()`; Assets liegen nie im Bundle.

**Lazy Loading — das 270-MB-Problem.** Das Manifest gruppiert in Bundles:

| Spiel | Bundle | Größe |
|---|---|---|
| DOVE | `core` (ss, konsole, explosion, Fonts, SFX) | ~2 MB |
| DOVE | `music` (20 Module) | 3,8 MB |
| DOVE | `level{N}` | 2–6 MB |
| DoveZ | `core` | ~10 MB |
| DoveZ | `level/<slug>` | 2–20 MB |
| DoveZ | `voice/<lang>` *(M6: `voice/<level>`, nur Englisch, 0,02–0,6 MB)* | 2–3 MB je Level |
| DoveZ | `video/<name>` / `music` | gestreamt, nie vorgeladen |

Zwei Hebel schneiden DoveZ drastisch: **nur eine Sprache laden** (die 107 MB
Sprachaufnahmen sind der größte Einzelposten; Untertitel-`.txt` sind winzig und
werden immer alle geladen, Sprachumschaltung der Texte also ohne Nachladen) und
**Video/Musik nie vorladen**. Effektiv lädt ein DoveZ-Spieler beim Start ~10 MB
und pro Level 4–25 MB.

Persistenz über die **Cache API**, nicht IndexedDB-Blobs — Assets sind
unveränderlich und content-gehasht, also passt `caches` genau. Ein Service
Worker macht daraus Offline-Fähigkeit und erlaubt einen expliziten
„Spieldaten installieren"-Button mit `navigator.storage.persist()`. Bei ~130 MB
ist das Voraussetzung für eine erträgliche zweite Sitzung, kein Luxus.

Savegames in IndexedDB mit `localStorage`-Spiegel für die Settings, versionierte
Datensätze mit Migrationskette, **Export/Import als JSON-Datei ist Pflicht** —
Browser-Storage kann jederzeit gelöscht werden, und ein durchgespieltes DoveZ
sind Stunden Arbeit. Der `Save`-Befehl aus `Play.txt` mappt 1:1 auf einen
Schreibvorgang.

*(M5)* Umsetzung: `GameModule.preload` nennt die Bundles für den
Ladebildschirm (DOVE: `core` und `screens`, 3,5 MB; Musik und Level lädt der
Ablauf nach), `GameModule.gamepad` die Pad-Belegung nach dem W3C-„standard“-
Mapping (Steuerkreuz und linker Stick sind immer die Pfeiltasten; Pads ohne
Standardmapping werden ignoriert). Der Service Worker entsteht aus
`packages/shell/src/sw.ts` als einzeln übersetztes klassisches Skript: App-
Dateien je Build vorab in `clove-app-<version>`, Spielassets Cache-zuerst in
einem gemeinsamen `clove-assets-v1` (content-gehasht, also nie veraltet;
„Spieldaten installieren“ räumt Dateien älterer Stände ab), `manifest.json`
Netz-zuerst. Abgleich mit `ignoreVary`, weil Server wie `vite preview`
`Vary: Origin` senden und Modul-Skripte `Origin` mitschicken. Spielstände
liegen für DOVE als `clove:<spiel>:<schlüssel>` in `localStorage`; die
Exportdatei (`amigo-clove-save`, Version 1, Migrationskette) definiert
`@clove/core`.

---

## Verifikation

Runner: **`bun test`** (nativ TS), `happy-dom` für DOM-nahe Tests, **Playwright**
mit `--use-angle=swiftshader` für alles mit WebGL.

**1. Round-Trip byte-identisch — der höchste Wert.**
`serialize(parse(bytes)) === bytes` für alle 12 DOVE-Level. Das beweist, dass der
Parser jedes Byte konsumiert und nichts erfunden hat. Für DoveZ wird der
*dekomprimierte* Recordstrom verglichen, nicht der Container (zlib-Ausgabe hängt
vom Kompressor ab).

Und dann der eigentliche Trick für DoveZ: Der `.dat`-Parser modelliert
`{ bekannte Felder } + { opake Restblobs }`. Der Round-Trip läuft damit **ab Tag 1
grün über alle 27 Dateien**, obwohl die Semantik noch unbekannt ist. Im weiteren
Verlauf wandern Bytes aus `opaque` in benannte Felder — der Test bricht dabei
nie. Das macht RE-Fortschritt monoton und messbar (Metrik `opaqueBytes/total`,
in CI geloggt). **Das ist die wichtigste einzelne Technik im ganzen Plan.**

**2. Kreuzvalidierung Asset ↔ Daten — der Killer-Test.**
Für jeden Gegner in jedem Level die `(left,right)`-Spannen aus dem *konvertierten
Sprite* neu berechnen und gegen die im Level *gespeicherte* Kontur vergleichen.
Ein einziger Test prüft damit gleichzeitig BMP-Decoder, Bottom-up-Flip,
**Colorkey-Wahl**, Rect-Interpretation, Frame-Stride und WebP-Konvertierung.
*(M1)* Weil die DOVE-Konturen nicht pixelgenau sind (siehe oben), ist die harte
Bedingung „gespeichert ⊇ Pixel“ in allen 19959 Zeilen; der Exakt-Anteil
(68,8 %) läuft als Metrik mit Untergrenze mit.
145 Records × ~50 Zeilen ≈ 7000 Assertions in Sekunden. Für DoveZ dasselbe mit
den 2587 `.r`-Dateien gegen 3232 Sprites. **Das ersetzt den Großteil des Bedarfs
an Referenz-Screenshots.** Blockierend in CI.

**3. Deterministische Replays.** Input-Aufzeichnung + Tick-Hash (xxhash32 über
alle State-Arrays) alle 64 Ticks, headless in `bun test`, in Sekunden. Läuft in
CI auf **Bun und Node** — eine Abweichung dort ist ein Frühwarnsignal für
eingeschlichene Fließkommaarithmetik. Ehrlichkeitshinweis für `docs/`: Das
verifiziert den Port gegen sich selbst und verhindert Regressionen; es beweist
keine Treue zum Original. Genau deshalb braucht es Punkt 2 und 4 daneben.

**4. Referenz-Screenshots — wertvoll, aber selektiv.** Das Original läuft bereits
auf der Maschine: mit OBS aufzeichnen und eine Handvoll Frames greifen
(Titelbild, Konsole mit jeder Waffenfarbe je Stufe, B1–B5-Vorhang, ein Boss),
Vergleich per `pixelmatch` gegen unseren Render zum selben Tick. **Zielgröße
~15 Bilder für DOVE, ~10 für DoveZ**, als Smoke-Test „sieht es richtig aus", nicht
als Pixelbeweis. Ausdrücklich *nicht* geplant: Frame-für-Frame-Vergleich ganzer
Level (die VB6-Timerauflösung ist nicht reproduzierbar).

**5. Architekturtests.** Lint-Regel plus Grep über `sim/**` nach `pixi`,
`window`, `document`, `Math.random`, `Date.now`, `performance.`. Determinismus
zerfällt nicht an einem Tag, sondern über Monate durch kleine Bequemlichkeiten —
nur ein automatisches Gate hält das auf.

**Was nicht testbar ist**, gehört ehrlich benannt in `docs/playtest-checklist.md`:
Audio-Äquivalenz (BASS 0.8 und libopenmpt mischen konstruktionsbedingt
unterschiedlich — `interpolationfilter=1` kommt BASS am nächsten; dokumentieren,
nicht bekämpfen), bit-genaues Video, und „Spielgefühl" (Beschleunigen,
Beam-Ladekurve, Trägheit).

---

## Meilensteine

Jeder hat genau ein überprüfbares Ergebnis.

| # | Inhalt | Aufwand | Ergebnis |
|---|---|---|---|
| **M0** | Bun-Workspace, tsconfig strict, oxlint + oxfmt, CI, gitattributes | 0,5–1 d | frischer Clone: `bun install && typecheck && lint && fmt:check && test` grün — *Stand: erledigt* |
| **M1** | `@clove/formats`: BMP-Decoder (1/4/8/16/24/32 bpp), `LevelDat` parse **und** serialize, Frame-Ableitung. Messung der Original-Tickrate | 2–3 d | Round-Trip byte-identisch über 12 Level; Kreuzvalidierung 145/145 grün; `TICK_MS` ist eine **gemessene** Zahl — *Stand: erledigt; `TICK_MS = 14` statt gemessen aus der EXE hergeleitet, siehe `docs/measurements/tick-rate.md`* |
| **M2** | Asset-Pipeline DOVE mit Manifest, Cache, `--check` | 2 d | ~11 MB Assets; zweiter Lauf schreibt null Bytes — *Stand: erledigt; 10,8 MB, siehe `docs/formats/dove-assets.md`* |
| **M3** | ⭐ **Erstes spielbares Level.** Scope brutal geschnitten: keine Menüs, keine Musik, **eine** Waffe, kein Beam/Options/Bomben/Schild | 4–6 d | Level 1 läuft im Browser durch; aufgezeichnetes Replay reproduziert bit-identisch — *Stand: erledigt; Mechanik statisch aus der EXE, zwei Referenz-Replays, Browser-Smoke-Test in CI* |
| **M4** | DOVE feature-complete: alle Waffen + Stufen, Beam, Options, Bomben, Schild, alle 12 Level, Vorhang, Highscore, Audio, die drei Optionen, Easteregg | 1,5–2 w | von Anfang bis Ende durchspielbar; Playtest-Checkliste abgehakt — *Stand: umgesetzt; alle Waffen, Beam, Options, Schild, 12 Level mit Skripten, 9 Bosse, Audio (Effekte + Module), Menüs, Intro, Continue, Highscore, Abspann. Offen: Playtest-Checkliste gegen das Original* |
| **M5** | Shell echt: Menü, Routing, Settings, Gamepad, Save-Export, Cache-Bundles, Service Worker, i18n | 3–4 d | deploybare Site; DOVE aus kaltem Cache spielbar — *Stand: erledigt; statischer Build mit relativen Pfaden, Smoke-Test startet DOVE kalt und nach „Spieldaten installieren“ bei beendetem Server. Offen: Ressourcenzähler für `dispose()` in Dev-Builds, Savegames in IndexedDB (DOVE braucht nur Schlüssel/Wert in `localStorage`)* |
| **M6** | DoveZ Container + Assets | 1 w | ~120 MB Assets; Debug-Seite rendert jedes Sprite mit überlagerter `.r`-Kontur — *Stand: erledigt; 147 MB (davon Musik 62 MB unverändert, Video 20 MB), 33 Atlanten auf 44 Seiten, `#/dovez/debug/assets`, siehe `docs/formats/dovez-assets.md`* |
| **M7** | ⚠ **DoveZ `.dat` dekodieren** (Risikoblock) | 1–2 w | `opaque` unter 5 %; Debug-Ansicht zeichnet Routen und Schussmuster — *Stand: erledigt; Grammatik aus `LadeDaten`, 27/27 byte-identisch, **0 Byte offen** (benannt oder nachweislich ungelesen), Routen-Interpreter bitgleich zum Referenzsimulator, `#/dovez/debug/level`, siehe `docs/formats/dovez-level-dat.md`. Offen für M8: Abgleich am Original, Start-Tick vor 0 (`Me.560`)* |
| **M8** | DoveZ Engine: Parallax, beide Schiffe, Coop, Funksystem, Bosse, Video, Kampagne | 3–5 w | Kampagne durchspielbar — *Stand: im Aufbau; Mechanik statisch aus der EXE (`docs/measurements/dovez-runtime.md`, Takt 16 ms). Spielbar über `#/dovez`: Zeitleiste mit Vorlauf, Ebenen und Landschaft, Effekt-Animationen, Gegner mit Routen, Teilen und Waffen, Schiff mit Hauptschuss, Treffer, Kontakt, Power-ups, Levelausflug; Todeszustände mit Funken, Explosionen, Popups und Wackeln; Checkpoint-Tor mit Schnappschuss und Neustart; HUD; Ton, Funk mit Laufband, gestreamte Musik; alle 27 Level laufen kopflos durch. Dazu Zweitwaffen und alle Schusstypen, Partikel (D-Tonator) und Force (D-Phyton), Beam mit Kombo, Super-Nova, Boss-Finale (Zustand 4), Druckwelle als Spielwirkung, Schiffzeichnung aus SpielMoveDove, Continue/Pause mit Highscoreliste, Coop-Eingabe (`players=2`), prozedurale Hintergründe, Wetter, Wasser, Overlays und Spezialabläufe (Tutorial-Start). Kampagne nach `LevelSkript`: Ladebild mit Fortschritt bzw. Mosaik, Übergang der Spielerwerte von Level zu Level, Speicherbildschirm und 21 Spielstände (JSON beim Host), Zwischensequenzen als `<video>`-Textur, Outro, Abspann, `FadeOut`, Epilog ab dem zweiten Durchgang. Offen: Hauptmenü und Intro, Abschusszähler der Nova (`B48[0].54`), zweites Schiff im Port* |
| **M9** | Politur, Performance, Barrierefreiheit, Deployment | 1 w | Release |

**Kürzester Weg zum ersten spielbaren Level:** M0 → M1 (nur `LevelDat` +
`BmpDecoder`) → M2 (`--only=level1`, ohne Audio) → M3. Realistisch **~2 Wochen**.
Beschleuniger: in M1/M2 nur sechs Dateien konvertieren (`feinde1`, `landschaft1`,
`background1`, `ss`, `konsole`, `text`) statt aller 61.

Reihenfolge innerhalb M3: (a) Scaling + Atlas + Standbild, (b) scrollendes
Terrain aus dem Eventstream, (c) Spielerschiff + Bewegung + Schuss, (d)
Gegner-Spawn + Pattern + Konturkollision, (e) Explosion + Punkte + Font.

---

## Risiken

**R1 — DoveZ-`.dat`-Semantik.** *Wahrscheinlichkeit hoch, Wirkung sehr hoch
(blockiert M8).* Gegenmaßnahmen: der Opake-Rest-Parser mit Round-Trip ab Tag 1
macht Fortschritt monoton und messbar; **Debug-Viewer vor der Engine bauen** (eine
Hypothese wie „diese drei i32 sind ein Wegpunkt" ist im Viewer in Sekunden
bestätigt statt in einer laufenden Engine in Stunden); die 27 Dateien sind ein
natürliches Differenzkorpus; die deutschen Sektionsnamen sind ein geschenktes
Label-Set; Ghidra als Fluchtweg für `LadeDaten` und `SpielMoveEnemy`.
**Harte Scope-Schranke, jetzt festgelegt statt später im Frust:** Ist `opaque`
nach zwei Wochen noch über 30 %, wird DoveZ auf einen Level-/Galerie-Viewer
reduziert und DOVE allein ausgeliefert. *(M7: nicht gezogen — `opaque` ist 0 %.
Den Ausschlag gab nicht der Viewer, sondern die EXE: Nach dem Entpacken ergibt
die Folge der `Get #`-Aufrufe in `LadeDaten` das Schema direkt, und die
Verwendung der Laufzeit-Offsets in `DoRoute`, `SpielMoveEnemy` usw. liefert die
Bedeutung. R1 ist damit auf das Restrisiko „Semantik stimmt im Detail nicht“
geschrumpft, das M8 am Original prüft.)*

**R2 — Repo-Größe.** *Wahrscheinlichkeit hoch, Wirkung mittel–hoch.* `.git` ist
heute schon **439 MB**; ~130 MB abgeleitete Assets kommen dazu, und Blobs
verschwinden nie. Da bewusst ohne LFS gearbeitet wird, sind die Gegenmaßnahmen
Disziplin statt Technik: content-gehashte Dateinamen (ein geändertes Asset ist
eine neue Datei, alte werden in einem bewussten Aufräum-Commit entfernt),
eingefrorene Encoder-Optionen (Re-Encode nur mit `--force` plus Review), und
`assets:verify` *(M6, vorher `assets:check`)* als CI-Gate gegen versehentliches Neuschreiben ganzer
Asset-Bäume. **Beobachten:** Sollte die Historie unhandlich werden, sind LFS oder
das Auslagern der Videos als Release-Attachment die naheliegenden Auswege — die
Architektur trägt Letzteres ohne Änderung, weil Video ohnehin lazy gestreamt wird.

**R3 — Determinismus.** *mittel / hoch (zerstört die Replays, und die sind das
komplette Regressionsnetz).* Q16.16 durchgängig, gesäter xorshift32, SoA-Pools
mit expliziter Freelist, Lint- und Grep-Gate über `sim/**`, Tick-Hash alle 64
statt nur am Ende (lokalisiert eine Divergenz sofort statt „irgendwo in 32000
Ticks"), Replay-Suite in CI auf Bun *und* Node.
*(M7)* DoveZ rechnet im Original in `Single`; der Port bildet das mit
`Math.fround` nach statt mit Q16.16 (Fixpunkt würde die Routen verfälschen).
IEEE-Arithmetik ist überall gleich, `Math.cos/sin/atan` aber nicht garantiert
bitgleich zwischen JS-Engines (JSC in Bun, V8 in Chrome). Die Routen nutzen sie
in MoveTo und Winkel; für Replays braucht M8 eigene, deterministische
Implementierungen oder einen Tabellenweg.

**R4 — Audio.** *mittel–hoch / mittel.* Ein einziger AudioContext, von der Shell
bei der ersten Nutzergeste erzeugt (`latencyHint: 'interactive'`) hinter einem
„Klicken zum Starten"-Gate. SFX nur über vorab dekodierte `AudioBuffer`, nie
`<audio>`. Voice-Limiting auf 8 Stimmen mit Cooldown pro Sound. libopenmpt im
**AudioWorklet** (nicht `ScriptProcessor`), `WebAssembly.Module` per
`postMessage` hineingereicht, 3 Quanten Vorlauf, Fallback auf vorgerenderte
Tracks wenn Worklet oder WASM scheitern.
*Der subtile Fehler, der garantiert passiert:* Bei einem Catch-up von 5 Ticks
feuern fünf identische Sounds gleichzeitig. Deshalb sammelt die Schleife
Sim-Events und dedupliziert **einmal pro Frame**, nicht pro Tick.

**R5 — Colorkey-Mehrdeutigkeit.** *mittel / mittel.* Schwarze Pixel *innerhalb*
eines Sprites werden transparent; bei palettierten Bildern keyt DirectDraw auf
den Index; DoveZ hat 16 bpp und 32 bpp mit Müll-Alphabyte. Gegenmaßnahme ist die
Kreuzvalidierung aus Punkt 2 der Verifikation — ein **automatisches,
erschöpfendes Orakel** über 145 + 2587 Records. Wäre der Colorkey falsch, würden
die Konturen nicht passen; sie passen nachweislich (für DOVE als Obermenge,
siehe *(M1)* oben). Palettierte DOVE-Grafiken mit auseinanderfallendem Index-
und RGB-Keying: `Explosion.spr` (Schwarz auf Index 255) und `background5.spr`
(kein Schwarz) — beide unkritisch bei RGB-Keying, im Test festgeschrieben. `atlantis_saule2` ist ein
**harter Buildfehler** mit Pflicht-Override — stilles Skalieren wäre der
klassische Fehler, der ein Sprite subtil kaputtmacht und erst im Playtest auffällt.

**Kleinere Punkte:** Original-Tickrate *(M1: aus der EXE bestimmt, 14 ms;
Gegenprobe am Original optional)*; VB6-Rundungssemantik
(`\`-Ganzzahldivision, `CInt` rundet banker's-style) als Kandidat notieren, falls
Bewegungspfade sichtbar driften; Speicherquote bei ~130 MB DoveZ.

---

## Rechtlicher Befund

**DOVE:** In `Readme.txt`, `Liesmich.txt` und `Help Guide.htm` steht *keinerlei*
Lizenz- oder Weitergabe-Aussage. Die einzige Rechteangabe ist die
Versionsressource der EXE: `LegalCopyright: Markus Madeja 1999, 2000, 2003`.
Assets stammen zusätzlich von mehreren weiteren Urhebern (Kempf, Brinkmann,
Kollmann, Pröbsting, Nonte/Toxeen u. a.). Faktisch „all rights reserved".
Kontakt: `Kauto@gmx.de`, `www.kauto.de`.

**DoveZ — deutlicher.** Wörtlich aus `Liesmich.txt`:

> „Sämtliche Rechte entsprechend der vorliegenden Software, Grafik, Musik, Sound
> Effekte und Texte sind vorbehalten und dürfen in keiner Form ohne schriftliche
> Genehmigung vervielfältigt, reproduziert oder verändert werden. […]
> © All rights reserved, 2004, 2005, 2006"

Es ist **explizit keine** Freeware- oder Weitergabe-Erlaubnis eingeräumt; das
Gratis-Angebot von 2019 ändert daran nichts. Zudem existierte mindestens ein
Publisher (magnussoft), was Rechte weiter verteilt.

Für die private Entwicklung im privaten Repo ist das unkritisch. **Eine
Veröffentlichung setzt eine schriftliche Freigabe voraus** — zu klären vor M9,
nicht danach. *(M8: Repository und Site sind seit dem 28.09.2026 auf Entscheidung
des Repository-Inhabers öffentlich; Auslieferung über Cloudflare Workers Builds,
`wrangler.jsonc`.)*

---

## Kritische Dateien

**Referenz und Testkorpus (bestehend):**
- `original-dove/Data/Level1.dat` — kanonisches Beispiel des DOVE-Levelformats;
  Grundlage für Parser, Round-Trip und Konturvalidierung
- `original-dove/Data/Grafik/feinde1.spr` — der Atlas für die
  Kontur-Kreuzvalidierung; Referenz für Colorkey, Flip und Frame-Stride
- `original-dove/Readme.txt` — einzige verfügbare Spezifikation der
  DOVE-Mechanik
- `original-dovez/Data/Level1-1 Skyfight.dlp` — vollständiges, kleines
  DoveZ-Paket (223 Einträge, 4,68 MB); Erst-Target für Container-Parser,
  Atlas-Packing und `.dat`-Dekodierung
- `original-dovez/Data/Epilog.dlp` — kleinstes `.dat` (3812 B, 7 Gruppen);
  minimaler Round-Trip-Testfall
- `original-dovez/Data/Play.d2p` — die 413 Byte, die die gesamte
  DoveZ-Kampagnenstruktur definieren

**Neu anzulegen (in Implementierungsreihenfolge):**
- `packages/formats/src/dove/LevelDat.ts` — Parser **und** Serializer, Herzstück
  des Round-Trip-Beweises
- `packages/formats/src/bmp/BmpDecoder.ts` — 1/4/8/16/24/32 bpp, Paletten,
  Bottom-up, Colorkey-Pfad
- `packages/assetkit/src/cli.ts` — die reproduzierbare Pipeline
- `packages/game-dove/src/sim/Sim.ts` — deterministische Fixed-Step-Simulation,
  Pixi-frei
- `packages/core/src/shell/GameModule.ts` — der Vertrag, der beide Engines trennt
