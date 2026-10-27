# DoveZ — packages, contours, masks, radio texts, campaign

Status: M6 (Russian: M8). Parsers in `packages/formats/src/dovez/`, checked by
`packages/formats/test/dovez.test.ts` against **all** originals in
`original-dovez/Data`. The level script `<Level>.dat` (M7) is described in
[`dovez-level-dat.md`](dovez-level-dat.md); it is shipped unchanged and parsed in
the browser.

## Packages `.dlp` / `.dfp` / `.d2p`

No magic, no directory — a chain of zlib records to the end of file:

```
Record := u32 uncompressedSize (LE), u32 compressedSize (LE), byte[compressedSize] zlib (RFC 1950)
File   := ( Record(fileName, CP1252) Record(fileContent) )*
```

All 52 packages parse completely; every decompressed size matches the header,
no name contains a path separator, no name appears twice in one package
(case-insensitive). In the browser `DecompressionStream("deflate")` decompresses
the same bytes (`inflateWeb`).

| Package | Contents |
|---|---|
| `<Level>.dlp` (27) | level script `.dat`, BMPs, `.r` contours, radio texts `…D/E/R.txt` (16 levels) |
| `<Level>.dfp` (16) | WAVs only: the radio messages of the level, **English only** |
| `Spiel`, `Standart`, `Pause` `.d2p` | game graphics (ships, effects, HUD), pause image |
| `Menu`, `Logo`, `Loading` `.d2p` | menu, logos + credits (500×3000), loading screens `Take0–9` |
| `Sound.d2p` | 84 effects (79 × 44.1 kHz stereo, 5 × mono 8–22 kHz) |
| `Video.d2p` | 12 cutscenes (DivX 5, 800×600) |
| `Play.d2p` | `Play.txt`, the campaign |

Loose files: `Data/Sound/*.ogg` (20 music pieces), `Data/Video/Intro{D,E}.avi`.

Inventory decompressed: 3232 BMP, 243 WAV, 12 AVI, 2587 `.r`, 27 `.dat`, 49
`.txt`. Same-named files in several packages: 637 names, of which 443 byte-equal
(9.8 MB) and 194 different (e.g. `schwarz.bmp` in 20 levels, `hintergrund.bmp`).
Names therefore apply only **within** a package.

BMP depths: 3122 × 24 bpp, 74 × 16 bpp, 20 × 8 bpp, 9 × 32 bpp, 7 × 1 bpp —
all with the shared `decodeBmp`. Largest images: `mauer_oben/unten` 1300×170
(Atlantis), `credits.bmp` 500×3000.

## Contours `.r`

**Correction to the spec:** the header has four fields, not six.

```
i32 width, height          // dimensions of the BMP
i32 top, bottom            // first and last occupied row
height × (i32 left, i32 right)   // span per row, starting at the TOP; empty = -1, -1
i32 -1, -1                 // terminator
```

The `-1, -1` the spec named after `bboxLeft, bboxRight` was the first (empty) row
of many sprites; `bboxLeft/Right` are in truth `top/bottom`. Evidence across all
2587 files: size = `16 + 8·height + 8`, terminator always `-1, -1`, round-trip
byte-identical.

Cross-validation against the pixels (color key black): of 2546 contours with a
BMP the dimensions always match, **2525 row-exact** (99.2 %). The remaining 21
are stale or stored mirrored (e.g. `bfire1–6` in Midtown Madness II: flush right
instead of left) — the original collides with the file, not with the pixels, the
port carries over the file. 41 `.r` have no BMP of the same name (among them
`STARTER`, `360GRAD_DREH_14–16`).

## Alpha masks `X.bmp` + `XA.bmp`

83 sprites have a file of the same name with an appended `A`. 79 of them are
masks: alpha (0 = transparent, 255 = opaque), 64 purely gray; the alpha is the
mean of the three channels (*estimated* for the non-gray ones). Masked sprites
are blended instead of keyed (`blend: "alpha"` in the atlas). *(M8)* The
remaining four, `interface{0–3}_energyA.bmp`, are their own images: `SpielDisplay`
blits the energy bar `…_energy` with a color key and `…_energyA` separately as
its background (`NOT_MASKS` in `packages/assetkit/src/dovez/config.ts`).

The only mask with differing dimensions: `atlantis_saule2` (image 190×520, mask
200×540). Override in `packages/assetkit/src/dovez/config.ts`: crop from the top
left (88.3 % agreement visible ↔ mask > 0), as a per-pixel read in the original
would yield it. The best-covering offset would be (6, 0) at 91.7 %, scaled
90.2 %; for comparison `atlantis_saule1` covers 93.0 %. Check against the
original (playtest checklist).

## Radio texts `<Name>D.txt` / `E.txt` / `R.txt`

```
[radio ID]
speaker; WAV; duration in ms; subtitle [; speaker; WAV; duration; subtitle]*
```

Line breaks are meaningless, the groups of four run across lines (the next
speaker is usually at the start of a line, occasionally mid-line). The speaker is
`Frame` (radio image, mixed spelling) or `0` (without image; almost always
Bruce). Findings:

- **D and E refer to the same English recordings** (`…E_*.wav`); the sections and
  WAVs are the same in both, and every WAV is in the `.dfp`.
- The last group is truncated several times (`…;0;SkyfightE_Bruce_burn_baby.wav;`) —
  `ms: null`, empty text.
- `Spacestation2 [Asteroids]` swaps duration and WAV (`0; 1489; …wav; text`); the
  parser corrects it and marks `swapped: true`.
- `R.txt` is CP1251 (`decodeCp1251`) and refers to `…RU_*.wav`, which are in no
  `.dfp` (only the three same-named `Escape_*.wav`): Russian has only subtitles,
  the audio stays off (`docs/measurements/dovez-runtime.md`, "Languages"). The
  sections match `E.txt` except for `[Bombers]` (Spacestation II, missing) and
  `[Credits]` in the epilogue (12 instead of 13 groups). **A `;` sits inside the
  subtitle** (`Industry1R.txt` [Harbor]:
  `…Кровавый ад;они прибыли до нас.;;0;`); the parser recognizes groups by
  speaker + WAV, joins the subtitle with "; " and discards the trailing `;;0;`
  (`parseRadioText`). The section names of the R files are CP1252 bytes as in the
  level scripts (`Drohnen schießen`, in CP1251 "…Я…"): `parseRadioTextRu`.
  The pipeline writes `radio/<slug>` = `{ de, en, ru }`.

## Campaign `Play.txt`

```
Load <Level>,<loadingImage.bmp>   Play <video.avi>   Save   credits
```

38 instructions, 23 levels. Each level is present as a `.dlp`, each loading image
in `Loading.d2p`, each video in `Video.d2p` (case differs:
`Missing_in_space.avi` ↔ `Missing_in_Space.avi`). Not in the campaign:
`Level8-1 Jungle`, `Spacestation Bonus`, `Level Bleistift`, `Epilog`.
