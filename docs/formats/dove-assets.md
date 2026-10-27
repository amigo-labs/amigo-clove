# DOVE — generated assets (`assets/dove/`)

Status: M2. Produced by `@clove/assetkit` (`bun run assets:build`), read by the
engine from M3 on. The originals in `original-dove/` stay untouched; everything
under `assets/dove/` is derived and is **never** edited by hand.

## Commands

| Command | Effect |
|---|---|
| `bun run assets:build [--only=level1,core] [--force]` | converts whatever changed; a second run writes zero bytes |
| `bun run assets:verify` | **CI gate, converts nothing:** size and SHA-256 of every file against the manifest, no orphaned files; source hashes, options, converter version and bundles of every planned job against the manifest (`stale`) |
| `bun run assets:check` | local, thorough: a fresh build without cache into a temp folder, byte-for-byte comparison with the committed tree (Opus/video carried over) |

Assets are built **once locally** and committed; CI only checks hashes (under
1 s for DOVE, a few seconds for DoveZ) and never rebuilds.
| `bun run assets:report` | sizes per bundle and asset kind |

## Contents (10.8 MB)

| Kind | Source | Target | Count | Size |
|---|---|---|---:|---:|
| `image` | `Data/Grafik/*.spr` (BMP) | WebP lossless | 60 | 6.2 MB |
| `sound` | `Data/Sound/*.wav` | PCM16 WAV, original sample rate | 20 | 0.6 MB |
| `music` | `Data/Musik/*.xm`, `s4.IT` | unchanged | 19 | 3.7 MB |
| `level` + `levelData` | `LevelN.dat` | JSON + binary sidecar | 12 + 12 | 0.2 MB |
| `data` | `Grafik/METROID.dat` | JSON | 1 | < 1 KB |

Not converted: `intro.dat` (its own schema, follows with the intro).
`Data/1–5.dat` are not runtime data but the tile permutations of the scrambled
ending images `B1–B5` — the pipeline uses them to reassemble the images (see
"Images").

## File names and manifest

Every file is named `<id>.<sha256[0:8]>.<ext>`, e.g.
`image/feinde1.df65ce38.webp`. A changed asset is therefore a new file; the next
build deletes the old one (orphaned).

`manifest.json` (types: `packages/core/src/asset/Manifest.ts`) lists, sorted by
`id`, per asset:

| Field | Meaning |
|---|---|
| `id` | stable ID, e.g. `image/feinde1`, `sound/explosion`, `level/level1` |
| `bundles` | bundles that contain the asset (membership in several is allowed) |
| `kind`, `file`, `bytes`, `sha256` | kind, file name relative to the manifest, size, hash |
| `sources` | source paths relative to the repo root, with SHA-256 |
| `optionsHash`, `converterVersion` | rest of the cache key |
| per kind | `image`: `width`, `height`, `colorKeyed` · `sound`: `sampleRate`, `channels`, `frames` · `music`: `format` · `level`: `data` (ID of the sidecar) |

The cache needs no directory of its own: a job is skipped when source hashes,
`optionsHash` and `converterVersion` match the existing manifest and the output
file is present with the expected hash. The libwebp version is part of the image
options — a sharp update invalidates every image, and `assets:verify` reports it
("options changed") before it slips unnoticed into the repo.

### Bundles

| Bundle | Contents |
|---|---|
| `core` | `ss`, `konsole`, `Explosion`, `text`, `text2`, `metroid`, all 20 sounds |
| `screens` | `titel`, `intro`, `intro2`, `loading`, `logo`, `logo2`, level previews `0–10` and `Extralevel`, curtain `B1–B5` |
| `music` | all 19 modules |
| `levelN` | `feindeN`, `landschaftN`, the background named in the level, `level/levelN`, `levelData/levelN`; level 1 additionally `metroid` and `data/metroid` |

`background1` belongs to six level bundles (0, 1, 4, 6, 9, 10) but sits in the
tree only once. Every graphic must be assigned to a bundle in
`packages/assetkit/src/dove/config.ts`; an unknown file aborts the build.

## Images

BMP → `decodeBmp` → color key → WebP lossless with `exact` (otherwise libwebp
may alter the RGB values of transparent pixels) and a frozen `effort: 6`. A test
decodes every produced WebP and compares it **pixel-for-pixel** with the keyed
BMP.

**Color key:** pure black → alpha 0, otherwise 255 (`bmp/colorKey.ts`, the same
definition as the contour derivation). The full-screen images that never lie on
top of anything else stay **opaque**: `titel`, `intro`, `intro2`, `loading`,
`0–10`, `Extralevel`, `B1–B5`, `background*`. For most of them the choice is
irrelevant anyway (0 % pure black).

**Ending images B1–B5** (640×450) are stored tile-scrambled in the original.
`Data/N.dat` holds 2880 `Int32` (LE), a permutation: target tile `i` ← source
tile `p[i]`, tiles 10×10 px, 64 per row (`ShowOutro` `0x4A0D00`). The pipeline
unscrambles before encoding (`descrambleTiles` in `@clove/formats`); `Data/N.dat`
is the job's second source, and the round-trip test unscrambles likewise.

The only palettized sprite whose index and RGB keying diverge is
`Explosion.spr` (black on index 255, index 0 not black). The build reports this
as a warning and keys on RGB — the cross-validation from M1 confirms RGB keying.

## Sounds

`decodeWav` (`packages/formats/src/wav/Wav.ts`) decodes MS-ADPCM and 8-bit PCM to
PCM16; a canonical 44-byte-header WAV is written. The sample rates (8000, 11025,
22050 Hz) are kept; `decodeAudioData` resamples in the browser anyway.

Finding: **15× MS-ADPCM, 5× 8-bit PCM**, all mono (the spec said 14/6). The
`fact` chunk of the ADPCM files is mostly stale — the files were truncated after
encoding, `data` holds only whole blocks, `fact` names more samples. `data` is
authoritative; `fact` only shortens, never lengthens. `domination.wav` is empty
(0 samples) and is carried over as an empty WAV.

## Level: JSON + sidecar

Types and builder: `packages/formats/src/dove/LevelAsset.ts`
(`buildLevelAsset`, `readLevelAsset`), version 2 since M3.

### `level/levelN.*.json`

```
version             2
background          e.g. "background1"
length              32000
tiles[]             { name, rect: [l,t,r,b] }
backgroundObjects[] { name, rect: [l,t,r,b] }
enemies[]           { name, rect, params[5], frameHeaders[[f0,f1]…], contour }
patterns[]          { name, flags[2], values[2], waypoints[[x,y]…], end }
events              { tick[], kind[], a[], b[] }   parallel, in file order
sidecar             { contourBytes }
```

The event stream is already in load form: four flat arrays. `kind` is the opcode
(`0–4`, see `EventOp`), `y§` tokens have `kind = -1` with `a = y`. The order
within a tick is preserved, because `;1 T P!` with P ≤ 0 binds the **first
following** `y§` of the same line (`docs/measurements/dove-events.md`).

### `levelData/levelN.*.bin` (little endian)

Enemy contours: `Int16` pairs `left, right`, per frame **all `h + 1` rows**
(`h = b − t`) as in the original, frames one after another; `enemies[i].contour`
is the index of the first `Int16`. The last row reaches into the next frame but
is read by the collision — `f1` points exactly at it in 73 of 319 frames. This
is the **stored** contour, the original's collision truth.

### No terrain masks (correction M3)

M2 produced a 1-bit mask per tile because the spec assumed per-pixel wall
collision. The EXE analysis shows: the original tests walls by **inclusive AABB
against the tile rectangles** (width `r − l`, height `b − t`, RECTs
right/bottom-exclusive). The masks have been removed since level-asset version 2;
the pipeline no longer produces any game-logic-relevant data, it only converts.

## `data/metroid` — meteor contour

`Grafik/METROID.dat`: 60 pairs `left, right` (plus terminator `0, 0`) for the
60×60 meteor from `metroid.spr`, which the level-1 script spawns between tick 980
and 1500. JSON `{ "spans": [left, right, …] }`, parser `parseContourDat`.
