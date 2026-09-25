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
| `level` + `levelData` | `LevelN.dat` + `landschaftN.spr` | JSON + Binär-Sidecar | 12 + 12 | 0,3 MB |

Nicht konvertiert: `Data/1-5.dat` (zur Laufzeit erzeugte Zufallspermutation),
`intro.dat` und `Grafik/METROID.dat` (eigene Schemata, folgen mit Intro bzw.
Easteregg in M4).

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
| `levelN` | `feindeN`, `landschaftN`, der im Level genannte Hintergrund, `level/levelN`, `levelData/levelN` |

`background1` gehört zu sechs Level-Bundles (0, 1, 4, 6, 9, 10), liegt aber
nur einmal im Baum. Jede Grafik muss in `packages/assetkit/src/dove/config.ts`
einem Bundle zugeordnet sein; eine unbekannte Datei bricht den Build ab.

## Bilder

BMP → `decodeBmp` → Colorkey → WebP lossless mit `exact` (libwebp darf die
RGB-Werte transparenter Pixel sonst verändern) und eingefrorenem `effort: 6`.
Ein Test dekodiert jede erzeugte WebP und vergleicht sie **pixelgenau** mit dem
gekeyten BMP.

**Colorkey:** reines Schwarz → Alpha 0, sonst 255 (`bmp/colorKey.ts`, dieselbe
Definition wie Konturen und Terrain-Masken). **Opak** bleiben die Vollbilder,
die nie über etwas anderem liegen: `titel`, `intro`, `intro2`, `loading`,
`0–10`, `Extralevel`, `B1–B5`, `background*`. Bei den meisten ist die Wahl
ohnehin belanglos (0 % reines Schwarz).

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
(`buildLevelAsset`, `readLevelAsset`, `tileMaskBit`).

### `level/levelN.*.json`

```
version             1
background          z. B. "background1"
length              32000
tiles[]             { name, rect: [l,t,r,b], mask: { offset, width, height } }
backgroundObjects[] { name, rect: [l,t,r,b] }
enemies[]           { name, rect, params[5], frameHeaders[[f0,f1]…], contour }
patterns[]          { name, flags[2], values[2], waypoints[[x,y]…], end }
events              { tick[], kind[], a[], b[] }   parallel, nach Tick sortiert
sidecar             { contourBytes, maskBytes }
```

Der Event-Stream ist schon in der Ladeform aus der Spec („Engine DOVE“): vier
flache Arrays mit einem Cursor. `kind` ist der Opcode (`0–4`, siehe
`EventOp`), Spawns haben `kind = -1` mit `a = y`.

### `levelData/levelN.*.bin` (little endian)

1. **Gegnerkonturen**, `contourBytes` Byte: `Int16`-Paare `left, right`, je
   Frame genau `h = b − t` Zeilen, Frames hintereinander; `enemies[i].contour`
   ist der Index des ersten `Int16`. Die `(h+1)`-te Zeile des Originals
   (Editor-Off-by-one) ist entfernt. Das ist die **gespeicherte** Kontur — die
   Kollisionswahrheit des Originals, nicht die aus Pixeln berechnete.
2. **Terrain-Masken**, `maskBytes` Byte: je Tile `ceil(w/8) · h` Byte,
   zeilenweise, MSB = linkes Pixel, 1 = fest. `tiles[i].mask.offset` zählt ab
   Beginn dieses Abschnitts.

### ⚠ Terrain-Masken sind erzeugte Spieldaten

DOVE-Tiles haben im Original keine Konturen; die Wandkollision lief pixelweise
gegen das Terrain. Die Pipeline berechnet deshalb pro Tile eine 1-Bit-Maske aus
`landschaftN.spr` nach dem Colorkey. Das ist die **einzige** Stelle, an der die
Pipeline spiellogik-relevante Daten erzeugt statt konvertiert. Ein Test prüft
jedes Maskenbit gegen den Colorkey des Atlas.

*Offen:* Ob Tile-Rects rechts/unten inklusiv sind, lässt sich aus den dicht
gepackten Atlanten nicht entscheiden (Inhalt liegt in 113 von 125 Tiles auf
Spalte `r`, aber in 92 auch auf `r + 1`). Die Maske deckt daher das
**inklusive** Rect `(r − l + 1) × (b − t + 1)` ab — eine Obermenge, die M3 bei
Bedarf um eine Spalte/Zeile beschneidet, sobald das Blitten gegen das Original
geprüft ist.
