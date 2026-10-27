# DoveZ — generated assets (`assets/dovez/`)

Status: M6. Produced by `@clove/assetkit` (`bun run assets:build --game=dovez`,
table in `packages/assetkit/src/dovez/config.ts`), shown by the debug page
`#/dovez/debug/assets`. Format findings on the sources:
[`dovez-container.md`](dovez-container.md). Commands, file names, manifest and
cache as for DOVE: [`dove-assets.md`](dove-assets.md).

To **build**, in addition to Bun: **ffmpeg** with libopus and libvpx (Ubuntu
24.04: `apt install ffmpeg`). CI does not need it: `assets:verify` converts
nothing, and `assets:check` never re-encodes Opus/video (see "Sound, music,
video").

## Contents (147 MB, 425 files)

| Kind | Source | Target | Count | Size |
|---|---|---|---:|---:|
| `atlas` + `image` | 3153 BMPs + 79 masks from 33 packages | one atlas per package (JSON) + WebP-lossless pages | 33 + 44 | 58.3 MB |
| `binary` | 2587 `.r`, 27 `.dat` | contour sidecar per package, level script unchanged | 27 + 27 | 1.9 MB |
| `data` | radio texts D/E, `Play.txt` | JSON | 16 + 1 | < 0.1 MB |
| `sound` | 84 effects (`Sound.d2p`), 159 radio messages (`.dfp`) | Ogg Opus 64 kbit/s and 48 kbit/s mono respectively | 243 | 4.6 MB |
| `music` | `Data/Sound/*.ogg` | unchanged (Vorbis, streamed) | 20 | 61.7 MB |
| `video` | 12 AVIs from `Video.d2p`, `Data/Video/Intro{D,E}.avi` | WebM, VP9 CRF 44 + Opus 48 kbit/s | 14 | 19.9 MB |

The 257 MB of BMP become 58.3 MB of atlas pages (spec estimate ~52 MB), the
107 MB of WAV become 4.6 MB of Opus, the 193 MB of DivX videos become 19.9 MB of
WebM (spec ~25 MB). Video sample `SkyFight.avi` (6.8 MB): CRF 34 → 1.18 MB
(SSIM 0.974), CRF 40 → 0.71 MB (0.965), **CRF 44 → 0.52 MB (0.957)**, CRF 48 →
0.38 MB (0.949, textures visibly blur). CRF 44 mainly smooths the noise of the
DivX original.

## IDs and bundles

Names from file names via `dovezSlug` (`@clove/formats`): lowercase, drop the
extension, spaces → `_`, everything else outside `a–z0–9_-` → `-`. Space and
hyphen stay distinguishable, because `Sound.d2p` contains both `D phy green.wav`
and `d-phy green.wav`. The engine forms IDs with the same function.

| Bundle | Contents |
|---|---|
| `core` (2.2 MB) | atlases `spiel`, `standart`, `pause`; 84 effects `sound/<name>`; `data/play` |
| `menu` (3.2 MB) | atlases `menu`, `logo` (incl. `credits` 500×3000 on its own page) |
| `loading` (0.2 MB) | atlas `loading` (loading screens `take0–9`) |
| `level/<slug>` (0.1–6.5 MB) | `atlas/<slug>`, pages `image/<slug>/<n>`, `contours/<slug>`, `leveldat/<slug>`, and for 16 levels `radio/<slug>` |
| `voice/<slug>` (0.02–0.6 MB) | radio messages `voice/<slug>/<wav>`, English only (the only recordings) |
| `music` | `music/<name>`, 20 pieces, never preloaded |
| `video/<slug>` | one video per bundle, streamed, never preloaded |

With this a player loads ~2 MB at startup (`core`) and up to 7 MB per level
(level + voices); music and video are added streamed.

## Atlases

One job per package: all sprites (without the masks themselves) sorted by name,
MaxRects best-short-side-fit (`packages/assetkit/src/atlas/maxrects.ts`), pages
2048×2048 with 1 px spacing, cropped to the occupied area. Sprites over 2048 get
their own page at their size (only `credits`, 500×3000). By name instead of by
area, as in the spec: measured equally dense (75.3 % against 76.8 % fill rate,
44 against 43 pages).

The layout is computed at planning time from the BMP headers (so the page IDs
are fixed before the conversion); if the decoded dimensions differ from them, the
build aborts.

`atlas/<slug>` (type `AtlasJson` in `@clove/core`):

```json
{
  "version": 1,
  "pages": ["image/level1-1_skyfight/0"],
  "sprites": { "big cloud1": { "page": 0, "x": 65, "y": 0, "w": 256, "h": 256, "blend": "alpha" } },
  "contours": { "big cloud1": 1234 }
}
```

Sprite keys are the file names lowercase without `.bmp` (level scripts reference
BMP names). **Blending:** `key` — pure black becomes transparent, as for DOVE,
also for full-screen images (drawn over black this is the same as opaque);
`alpha` — alpha from the mask `XA.bmp` (except the four `interface*_energyA`,
which are their own images, see `dovez-container.md`). A test decodes every page
and compares every sprite pixel-for-pixel with the keyed or masked BMP.

Palettized sprites whose index and RGB keying diverge are reported by the build
as a warning (only `rauch1–7` in `Level5-3 Rumbler`); RGB keying is used.

## Contours

`contours/<slug>`: all `.r` of the package by name, as Int16 (LE) one after
another, per contour `width, height, top, bottom` and `height` pairs
`left, right` (empty `-1, -1`). `AtlasJson.contours` gives the offset in Int16
values. The values are those of the `.r` files, not recomputed from the pixels —
the original collides with the file.

## Sound, music, video

Opus via ffmpeg with `-fflags +bitexact`, without metadata. Manifest fields
`sampleRate`, `channels`, `frames` describe the source; `format: "opus"`.

**Opus and VP9 are not bit-exact across machines.** On the same machine Opus is
reproducible, but libopus (like libvpx) chooses SIMD paths at runtime: the first
CI run on a different runner encoded all 243 Opus files with different bytes.
Both job kinds are therefore **exempt from the hash gate** (`volatile` in the
job): `assets:check` carries over their outputs from the committed tree, provided
source, options and converter version match, instead of re-encoding — it reports
changed sources as stale. A normal build encodes them only on changes,
`--force-encode` forces it (~7 min, almost all video). The ffmpeg version is
consequently not part of the cache key.

## Run times (4 cores)

Full build ~7 min, most of it video — a one-time local run. `assets:verify`
(CI) for both games a few seconds, `assets:check` 48 s, both without ffmpeg; a
second build writes zero bytes (3 s).
