# DOVE — generierte Assets (`assets/dove/`)

Stand: M2. Erzeugt von `@clove/assetkit` (`bun run assets:build`), gelesen von
der Engine ab M3. Die Originale in `original-dove/` bleiben unangetastet; alles
unter `assets/dove/` ist abgeleitet und wird **nie von Hand** geändert.

## Befehle

| Befehl | Wirkung |
|---|---|
| `bun run assets:build [--only=level1,core] [--force]` | konvertiert, was sich geändert hat; ein zweiter Lauf schreibt null Bytes |
| `bun run assets:check` | CI-Gate: frischer Build ohne Cache in einen Temp-Ordner, byteweiser Vergleich mit dem committeten Baum |
| `bun run assets:verify` | Größe und SHA-256 jeder Datei gegen das Manifest, keine verwaisten Dateien |
| `bun run assets:report` | Größen je Bundle und Asset-Art |

## Inhalt (10,8 MB)

| Art | Quelle | Ziel | Anzahl | Größe |
|---|---|---|---:|---:|
| `image` | `Data/Grafik/*.spr` (BMP) | WebP lossless | 60 | 6,2 MB |
| `sound` | `Data/Sound/*.wav` | PCM16-WAV, Originalabtastrate | 20 | 0,6 MB |
| `music` | `Data/Musik/*.xm`, `s4.IT` | unverändert | 19 | 3,7 MB |
| `level` + `levelData` | `LevelN.dat` | JSON + Binär-Sidecar | 12 + 12 | 0,2 MB |
| `data` | `Grafik/METROID.dat` | JSON | 1 | < 1 KB |

Nicht konvertiert: `intro.dat` (eigenes Schema, folgt mit dem Intro).
`Data/1–5.dat` sind keine Laufzeitdaten, sondern die Kachel-Permutationen der
verwürfelten Endbilder `B1–B5` — die Pipeline setzt die Bilder damit zusammen
(siehe „Bilder“).

## Dateinamen und Manifest

Jede Datei heißt `<id>.<sha256[0:8]>.<ext>`, z. B.
`image/feinde1.df65ce38.webp`. Ein geändertes Asset ist also eine neue Datei;
die alte löscht der nächste Build (verwaist).

`manifest.json` (Typen: `packages/core/src/asset/Manifest.ts`) listet nach `id`
sortiert je Asset:

| Feld | Bedeutung |
|---|---|
| `id` | stabile ID, z. B. `image/feinde1`, `sound/explosion`, `level/level1` |
| `bundles` | Bundles, die das Asset enthalten (Mehrfachzugehörigkeit erlaubt) |
| `kind`, `file`, `bytes`, `sha256` | Art, Dateiname relativ zum Manifest, Größe, Hash |
| `sources` | Quellpfade relativ zum Repo-Root mit SHA-256 |
| `optionsHash`, `converterVersion` | Rest des Cache-Schlüssels |
| je Art | `image`: `width`, `height`, `colorKeyed` · `sound`: `sampleRate`, `channels`, `frames` · `music`: `format` · `level`: `data` (ID des Sidecars) |

Der Cache braucht kein eigenes Verzeichnis: Ein Job wird übersprungen, wenn
Quellhashes, `optionsHash` und `converterVersion` im bestehenden Manifest
übereinstimmen und die Ausgabedatei mit dem erwarteten Hash vorliegt. Die
libwebp-Version ist Teil der Bildoptionen — ein sharp-Update invalidiert alle
Bilder, und `assets:check` meldet es, bevor es unbemerkt ins Repo gerät.

### Bundles

| Bundle | Inhalt |
|---|---|
| `core` | `ss`, `konsole`, `Explosion`, `text`, `text2`, `metroid`, alle 20 Sounds |
| `screens` | `titel`, `intro`, `intro2`, `loading`, `logo`, `logo2`, Levelvorschauen `0–10` und `Extralevel`, Vorhang `B1–B5` |
| `music` | alle 19 Module |
| `levelN` | `feindeN`, `landschaftN`, der im Level genannte Hintergrund, `level/levelN`, `levelData/levelN`; Level 1 zusätzlich `metroid` und `data/metroid` |

`background1` gehört zu sechs Level-Bundles (0, 1, 4, 6, 9, 10), liegt aber
nur einmal im Baum. Jede Grafik muss in `packages/assetkit/src/dove/config.ts`
einem Bundle zugeordnet sein; eine unbekannte Datei bricht den Build ab.

## Bilder

BMP → `decodeBmp` → Colorkey → WebP lossless mit `exact` (libwebp darf die
RGB-Werte transparenter Pixel sonst verändern) und eingefrorenem `effort: 6`.
Ein Test dekodiert jede erzeugte WebP und vergleicht sie **pixelgenau** mit dem
gekeyten BMP.

**Colorkey:** reines Schwarz → Alpha 0, sonst 255 (`bmp/colorKey.ts`, dieselbe
Definition wie die Konturableitung). **Opak** bleiben die Vollbilder,
die nie über etwas anderem liegen: `titel`, `intro`, `intro2`, `loading`,
`0–10`, `Extralevel`, `B1–B5`, `background*`. Bei den meisten ist die Wahl
ohnehin belanglos (0 % reines Schwarz).

**Endbilder B1–B5** (640×450) liegen im Original kachelweise verwürfelt vor.
`Data/N.dat` enthält 2880 `Int32` (LE), eine Permutation: Zielkachel `i` ←
Quellkachel `p[i]`, Kacheln 10×10 px, 64 pro Zeile (`ShowOutro` `0x4A0D00`).
Die Pipeline entwürfelt vor dem Encodieren (`descrambleTiles` in
`@clove/formats`); `Data/N.dat` ist zweite Quelle des Jobs, der Rücktest
entwürfelt ebenso.

Palettiert mit auseinanderfallendem Index- und RGB-Keying ist nur
`Explosion.spr` (Schwarz auf Index 255, Index 0 nicht schwarz). Der Build meldet
das als Warnung und keyt auf RGB — die Kreuzvalidierung aus M1 bestätigt
RGB-Keying.

## Sounds

`decodeWav` (`packages/formats/src/wav/Wav.ts`) dekodiert MS-ADPCM und PCM 8 bit
nach PCM16; geschrieben wird eine kanonische 44-Byte-Header-WAV. Die
Abtastraten (8000, 11025, 22050 Hz) bleiben; `decodeAudioData` resampelt im
Browser ohnehin.

Befund: **15× MS-ADPCM, 5× PCM 8 bit**, alle mono (die Spec nannte 14/6).
Der `fact`-Chunk der ADPCM-Dateien ist meist veraltet — die Dateien wurden nach
dem Kodieren gekürzt, `data` enthält nur ganze Blöcke, `fact` nennt mehr
Samples. Maßgeblich ist `data`; `fact` kürzt nur, verlängert nie.
`domination.wav` ist leer (0 Samples) und wird als leere WAV übernommen.

## Level: JSON + Sidecar

Typen und Builder: `packages/formats/src/dove/LevelAsset.ts`
(`buildLevelAsset`, `readLevelAsset`), Version 2 seit M3.

### `level/levelN.*.json`

```
version             2
background          z. B. "background1"
length              32000
tiles[]             { name, rect: [l,t,r,b] }
backgroundObjects[] { name, rect: [l,t,r,b] }
enemies[]           { name, rect, params[5], frameHeaders[[f0,f1]…], contour }
patterns[]          { name, flags[2], values[2], waypoints[[x,y]…], end }
events              { tick[], kind[], a[], b[] }   parallel, in Dateireihenfolge
sidecar             { contourBytes }
```

Der Event-Stream ist schon in der Ladeform: vier flache Arrays. `kind` ist der
Opcode (`0–4`, siehe `EventOp`), `y§`-Tokens haben `kind = -1` mit `a = y`. Die
Reihenfolge innerhalb eines Ticks bleibt erhalten, denn `;1 T P!` mit P ≤ 0
bindet das **erste folgende** `y§` derselben Zeile
(`docs/measurements/dove-events.md`).

### `levelData/levelN.*.bin` (little endian)

Gegnerkonturen: `Int16`-Paare `left, right`, je Frame **alle `h + 1` Zeilen**
(`h = b − t`) wie im Original, Frames hintereinander; `enemies[i].contour` ist
der Index des ersten `Int16`. Die letzte Zeile ragt ins nächste Frame, wird
aber von der Kollision gelesen — `f1` zeigt in 73 von 319 Frames genau auf
sie. Das ist die **gespeicherte** Kontur, die Kollisionswahrheit des Originals.

### Keine Terrain-Masken (Korrektur M3)

M2 erzeugte pro Tile eine 1-Bit-Maske, weil die Spec eine pixelweise
Wandkollision annahm. Die EXE-Analyse zeigt: Das Original testet Wände per
**inklusivem AABB gegen die Tile-Rechtecke** (Breite `r − l`, Höhe `b − t`,
RECTs rechts/unten exklusiv). Die Masken sind seit Level-Asset-Version 2
entfernt; die Pipeline erzeugt damit keine spiellogik-relevanten Daten mehr,
sie konvertiert nur.

## `data/metroid` — Meteor-Kontur

`Grafik/METROID.dat`: 60 Paare `left, right` (plus Terminator `0, 0`) für den
60×60-Meteor aus `metroid.spr`, den das Level-1-Skript zwischen Tick 980 und
1500 spawnt. JSON `{ "spans": [left, right, …] }`, Parser `parseContourDat`.
