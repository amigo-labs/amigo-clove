# DoveZ — generierte Assets (`assets/dovez/`)

Stand: M6. Erzeugt von `@clove/assetkit` (`bun run assets:build --game=dovez`,
Tabelle in `packages/assetkit/src/dovez/config.ts`), angezeigt von der
Debug-Seite `#/dovez/debug/assets`. Formatbefunde zu den Quellen:
[`dovez-container.md`](dovez-container.md). Befehle, Dateinamen, Manifest und
Cache wie bei DOVE: [`dove-assets.md`](dove-assets.md).

Zum **Bauen** zusätzlich zu Bun: **ffmpeg** mit libopus und libvpx (Ubuntu
24.04: `apt install ffmpeg`). `assets:check` braucht es nicht (siehe „Ton,
Musik, Video“).

## Inhalt (169 MB, 425 Dateien)

| Art | Quelle | Ziel | Anzahl | Größe |
|---|---|---|---:|---:|
| `atlas` + `image` | 3149 BMPs + 83 Masken aus 33 Paketen | je Paket ein Atlas (JSON) + WebP-lossless-Seiten | 33 + 44 | 58,3 MB |
| `binary` | 2587 `.r`, 27 `.dat` | Kontur-Sidecar je Paket, Level-Skript unverändert | 27 + 27 | 1,9 MB |
| `data` | Funktexte D/E, `Play.txt` | JSON | 16 + 1 | < 0,1 MB |
| `sound` | 84 Effekte (`Sound.d2p`), 159 Funksprüche (`.dfp`) | Ogg Opus 64 kbit/s bzw. 48 kbit/s mono | 243 | 4,6 MB |
| `music` | `Data/Sound/*.ogg` | unverändert (Vorbis, gestreamt) | 20 | 61,7 MB |
| `video` | 12 AVIs aus `Video.d2p`, `Data/Video/Intro{D,E}.avi` | WebM, VP9 CRF 34 + Opus 64 kbit/s | 14 | 42,0 MB |

Die 257 MB BMP werden zu 58,3 MB Atlasseiten (Spec-Schätzung ~52 MB), die
107 MB WAV zu 4,6 MB Opus. Die Videos liegen über der Spec-Schätzung (~25 MB):
CRF 34 statt 40 zugunsten der Qualität bei 800×600 (Probe `SkyFight.avi`:
6,8 MB → 1,18 MB bei CRF 34, 0,73 MB bei CRF 40).

## IDs und Bundles

Namen aus Dateinamen über `dovezSlug` (`@clove/formats`): klein, Endung weg,
Leerzeichen → `_`, sonst alles außer `a–z0–9_-` → `-`. Leerzeichen und
Bindestrich bleiben unterscheidbar, weil `Sound.d2p` sowohl `D phy green.wav`
als auch `d-phy green.wav` enthält. Die Engine bildet IDs mit derselben Funktion.

| Bundle | Inhalt |
|---|---|
| `core` (2,2 MB) | Atlanten `spiel`, `standart`, `pause`; 84 Effekte `sound/<name>`; `data/play` |
| `menu` (3,2 MB) | Atlanten `menu`, `logo` (inkl. `credits` 500×3000 auf eigener Seite) |
| `loading` (0,2 MB) | Atlas `loading` (Ladebilder `take0–9`) |
| `level/<slug>` (0,1–6,5 MB) | `atlas/<slug>`, Seiten `image/<slug>/<n>`, `contours/<slug>`, `leveldat/<slug>`, bei 16 Levels `radio/<slug>` |
| `voice/<slug>` (0,02–0,6 MB) | Funksprüche `voice/<slug>/<wav>`, nur Englisch (die einzigen Aufnahmen) |
| `music` | `music/<name>`, 20 Stücke, nie vorgeladen |
| `video/<slug>` | ein Video je Bundle, gestreamt, nie vorgeladen |

Ein Spieler lädt damit beim Start ~2 MB (`core`) und je Level bis 7 MB
(Level + Stimmen); Musik und Video kommen gestreamt dazu.

## Atlanten

Ein Job je Paket: alle Sprites (ohne die Masken selbst) nach Name sortiert,
MaxRects Best-Short-Side-Fit (`packages/assetkit/src/atlas/maxrects.ts`),
Seiten 2048×2048 mit 1 px Abstand, auf die belegte Fläche zugeschnitten.
Sprites über 2048 bekommen eine eigene Seite in ihrer Größe (nur `credits`,
500×3000). Nach Name statt nach Fläche, wie in der Spec: gemessen gleich dicht
(75,3 % gegen 76,8 % Füllgrad, 44 gegen 43 Seiten).

Das Layout wird bei der Planung aus den BMP-Köpfen berechnet (die IDs der
Seiten stehen damit vor der Konvertierung fest); weichen die dekodierten Maße
davon ab, bricht der Build ab.

`atlas/<slug>` (Typ `AtlasJson` in `@clove/core`):

```json
{
  "version": 1,
  "pages": ["image/level1-1_skyfight/0"],
  "sprites": { "big cloud1": { "page": 0, "x": 65, "y": 0, "w": 256, "h": 256, "blend": "alpha" } },
  "contours": { "big cloud1": 1234 }
}
```

Sprite-Schlüssel sind die Dateinamen klein ohne `.bmp` (Level-Skripte
referenzieren BMP-Namen). **Überblendung:** `key` — reines Schwarz wird
durchsichtig, wie bei DOVE, auch für Vollbilder (über Schwarz gezeichnet ist
das dasselbe wie opak); `alpha` — Alpha aus der Maske `XA.bmp`. Ein Test
dekodiert jede Seite und vergleicht jedes Sprite pixelgenau mit dem gekeyten
bzw. maskierten BMP.

Palettierte Sprites, bei denen Index- und RGB-Keying auseinanderfallen, meldet
der Build als Warnung (nur `rauch1–7` in `Level5-3 Rumbler`); verwendet wird
RGB-Keying.

## Konturen

`contours/<slug>`: alle `.r` des Pakets nach Name, als Int16 (LE)
hintereinander, je Kontur `width, height, top, bottom` und `height` Paare
`left, right` (leer `-1, -1`). `AtlasJson.contours` gibt den Offset in
Int16-Werten an. Die Werte sind die der `.r`-Dateien, nicht aus den Pixeln
neu berechnet — das Original kollidiert mit der Datei.

## Ton, Musik, Video

Opus über ffmpeg mit `-fflags +bitexact`, ohne Metadaten. Manifest-Felder
`sampleRate`, `channels`, `frames` beschreiben die Quelle; `format: "opus"`.

**Opus und VP9 sind nicht maschinenübergreifend bitgenau.** Auf derselben
Maschine ist Opus reproduzierbar, aber libopus (wie libvpx) wählt SIMD-Pfade
zur Laufzeit: Der erste CI-Lauf auf einem anderen Runner kodierte alle 243
Opus-Dateien mit anderen Bytes. Beide Jobarten sind deshalb **vom Hash-Gate
ausgenommen** (`volatile` im Job): `assets:check` übernimmt ihre Ausgaben aus
dem committeten Baum, sofern Quelle, Optionen und Konverterversion passen, statt
neu zu kodieren — geänderte Quellen meldet es als veraltet. Ein normaler Build
kodiert sie nur bei Änderungen, `--force-encode` erzwingt es (~11 min, fast nur
Video). Die ffmpeg-Version gehört folglich nicht zum Cache-Schlüssel.

## Laufzeiten (4 Kerne)

Voller Build 11 min, davon der Großteil Video; `assets:check` beider Spiele
48 s, ohne ffmpeg; ein zweiter Build schreibt null Bytes (3 s).
