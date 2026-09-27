# DoveZ — Pakete, Konturen, Masken, Funktexte, Kampagne

Stand: M6. Parser in `packages/formats/src/dovez/`, geprüft von
`packages/formats/test/dovez.test.ts` gegen **alle** Originale in
`original-dovez/Data`. Das Level-Skript `<Level>.dat` ist Thema von M7 und
wird bis dahin unverändert ausgeliefert.

## Pakete `.dlp` / `.dfp` / `.d2p`

Kein Magic, kein Verzeichnis — eine Kette von zlib-Records bis zum Dateiende:

```
Record := u32 uncompressedSize (LE), u32 compressedSize (LE), byte[compressedSize] zlib (RFC 1950)
Datei  := ( Record(Dateiname, CP1252) Record(Dateiinhalt) )*
```

Alle 52 Pakete parsen restlos; jede entpackte Größe stimmt mit dem Header,
kein Name enthält Pfadtrenner, kein Name kommt in einem Paket doppelt vor
(ohne Groß-/Kleinschreibung). Im Browser entpackt `DecompressionStream("deflate")`
dieselben Bytes (`inflateWeb`).

| Paket | Inhalt |
|---|---|
| `<Level>.dlp` (27) | Level-Skript `.dat`, BMPs, `.r`-Konturen, Funktexte `…D/E/R.txt` (16 Level) |
| `<Level>.dfp` (16) | nur WAVs: die Funksprüche des Levels, **nur Englisch** |
| `Spiel`, `Standart`, `Pause` `.d2p` | Spielgrafik (Schiffe, Effekte, HUD), Pausenbild |
| `Menu`, `Logo`, `Loading` `.d2p` | Menü, Logos + Credits (500×3000), Ladebilder `Take0–9` |
| `Sound.d2p` | 84 Effekte (79 × 44,1 kHz Stereo, 5 × Mono 8–22 kHz) |
| `Video.d2p` | 12 Zwischensequenzen (DivX 5, 800×600) |
| `Play.d2p` | `Play.txt`, die Kampagne |

Lose Dateien: `Data/Sound/*.ogg` (20 Musikstücke), `Data/Video/Intro{D,E}.avi`.

Inventar entpackt: 3232 BMP, 243 WAV, 12 AVI, 2587 `.r`, 27 `.dat`, 49 `.txt`.
Gleichnamige Dateien in mehreren Paketen: 637 Namen, davon 443 byte-gleich
(9,8 MB) und 194 verschieden (z. B. `schwarz.bmp` in 20 Levels, `hintergrund.bmp`).
Namen gelten deshalb nur **innerhalb** eines Pakets.

BMP-Tiefen: 3122 × 24 bpp, 74 × 16 bpp, 20 × 8 bpp, 9 × 32 bpp, 7 × 1 bpp —
alle mit dem gemeinsamen `decodeBmp`. Größte Bilder: `mauer_oben/unten` 1300×170
(Atlantis), `credits.bmp` 500×3000.

## Konturen `.r`

**Korrektur der Spec:** Der Kopf hat vier Felder, nicht sechs.

```
i32 width, height          // Maße des BMP
i32 top, bottom            // erste und letzte belegte Zeile
height × (i32 left, i32 right)   // Spanne je Zeile, OBEN beginnend; leer = -1, -1
i32 -1, -1                 // Abschluss
```

Das in der Spec genannte `-1, -1` nach `bboxLeft, bboxRight` war die erste
(leere) Zeile vieler Sprites; `bboxLeft/Right` sind in Wahrheit `top/bottom`.
Belege über alle 2587 Dateien: Größe = `16 + 8·height + 8`, Abschluss immer
`-1, -1`, Round-Trip byte-identisch.

Kreuzvalidierung gegen die Pixel (Colorkey Schwarz): Von 2546 Konturen mit
BMP stimmen die Maße immer, **2525 zeilengenau** (99,2 %). Die übrigen 21 sind
veraltet oder gespiegelt gespeichert (z. B. `bfire1–6` in Midtown Madness II:
rechts statt links bündig) — das Original kollidiert mit der Datei, nicht mit
den Pixeln, der Port übernimmt die Datei. 41 `.r` haben kein BMP gleichen
Namens (u. a. `STARTER`, `360GRAD_DREH_14–16`).

## Alphamasken `X.bmp` + `XA.bmp`

83 Sprites haben eine Maske gleichen Namens mit angehängtem `A`. Die Maske ist
Alpha (0 = durchsichtig, 255 = deckend), 64 davon rein grau; als Alpha zählt der
Mittelwert der drei Kanäle (*geschätzt* für die 19 nicht grauen). Gemaskte
Sprites werden überblendet statt gekeyed (`blend: "alpha"` im Atlas).

Einzige Maske mit abweichenden Maßen: `atlantis_saule2` (Bild 190×520, Maske
200×540). Override in `packages/assetkit/src/dovez/config.ts`: Ausschnitt ab
oben links (88,3 % Übereinstimmung sichtbar ↔ Maske > 0), wie ein pixelweises
Lesen im Original ihn ergäbe. Der am besten deckende Versatz wäre (6, 0) mit
91,7 %, skaliert 90,2 %; zum Vergleich deckt `atlantis_saule1` 93,0 %. Am
Original prüfen (Playtest-Checkliste).

## Funktexte `<Name>D.txt` / `E.txt` / `R.txt`

```
[Funk-ID]
Sprecher; WAV; Dauer in ms; Untertitel [; Sprecher; WAV; Dauer; Untertitel]*
```

Zeilenumbrüche sind bedeutungslos, die Viergruppen laufen über Zeilen hinweg
(der nächste Sprecher steht meist am Zeilenanfang, gelegentlich mitten in der
Zeile). Sprecher ist `Frame` (Funkbild, Schreibweise gemischt) oder `0`
(ohne Bild; fast immer Bruce). Befunde:

- **D und E verweisen auf dieselben englischen Aufnahmen** (`…E_*.wav`);
  Abschnitte und WAVs sind in beiden gleich, jede WAV liegt in der `.dfp`.
- Die letzte Gruppe ist mehrfach abgeschnitten (`…;0;SkyfightE_Bruce_burn_baby.wav;`) —
  `ms: null`, leerer Text.
- `Spacestation2 [Asteroids]` vertauscht Dauer und WAV (`0; 1489; …wav; Text`);
  der Parser korrigiert und markiert `swapped: true`.
- `R.txt` ist CP1251 (`decodeCp1251`), verweist auf `…RU_*.wav`, die in keiner
  `.dfp` liegen, und enthält `;` im Untertitel — nicht eindeutig parsebar und
  ohne Ton ohnehin nicht nutzbar. Die Pipeline übernimmt nur D und E.

## Kampagne `Play.txt`

```
Load <Level>,<Ladebild.bmp>   Play <video.avi>   Save   credits
```

38 Anweisungen, 23 Level. Jedes Level liegt als `.dlp` vor, jedes Ladebild in
`Loading.d2p`, jedes Video in `Video.d2p` (Groß-/Kleinschreibung weicht ab:
`Missing_in_space.avi` ↔ `Missing_in_Space.avi`). Nicht in der Kampagne:
`Level8-1 Jungle`, `Spacestation Bonus`, `Level Bleistift`, `Epilog`.
