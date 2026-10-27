# DOVE + DoveZ — All-in-One Browser Port

> Design spec. As of 2026-09-07, updated 2026-09-27.
> Status: **M0 through M8 implemented (comparison against the original pending), M9 in progress** (status per milestone in the table below).
> Implementation has corrected several assumptions of this document; the
> authoritative references are now [`docs/formats/dove-level-dat.md`](../formats/dove-level-dat.md),
> [`docs/formats/dove-assets.md`](../formats/dove-assets.md) and for DoveZ
> [`docs/formats/dovez-level-dat.md`](../formats/dovez-level-dat.md), for the
> mechanics `docs/measurements/dove-{events,player,enemies,weapons,bosses,audio,flow}.md` and
> `dovez-runtime.md`. Corrected passages are marked here with *(M1)* … *(M7)*.

## Context

The repository `amigo-clove` contains two German Windows arcade shooters as
unmodified original installations:

- `original-dove/` — **DOVE 1.10** (1999–2003) by Markus „Kauto" Madeja.
  2D side-scrolling shmup in R-Type style, 12 levels, ~1 MB of game data.
  Visual Basic 6 + DirectDraw7 + BASS 0.8, 640×480.
- `original-dovez/` — **DoveZ – The Second Wave** (2004, updates until 2019) by
  Markus Madeja's Intergenies. Successor, ~270 MB of game data, 27 level packages,
  two player ships, local coop, DE/EN/RU. Visual Basic 6 + DirectX 7
  (DxVBLib) + zlib + Ogg Vorbis, 800×600.

Both are native Win32 binaries, tied to Windows and only runnable on modern systems
with some coaxing. The goal is a **platform-independent
browser port**: one shared launcher from which both games can be started
— each with its own engine and its own look, but with the **original assets**
(graphics, sound, levels) extracted from the original files.

Both games were fully analyzed; the formats are decoded (DOVE completely,
DoveZ except for the field semantics of one section). This document
records the findings and the build plan.

### Constraints set by the user

| Decision | Choice |
|---|---|
| Fidelity | **1:1 port with original assets** |
| All-in-one | **One launcher, two games** — shared shell, separate engines |
| Renderer | **PixiJS** (WebGL 2D) |
| Game logic | **TypeScript** |
| Order | **DOVE first**, DoveZ as the second stage |
| Tracker music | **`libopenmpt.js` at runtime** (~4 MB of modules instead of 60–100 MB OGG) |
| DoveZ videos | **VP9/WebM** |
| Asset storage | **Normal Git blobs** (no LFS) |
| Repo visibility | **private** |
| Reference recordings | available — the originals already run on the machine |
| Lint + format | **oxc** — `oxlint` and `oxfmt` |

---

## DOVE analysis result

All formats are open — **no cracking required**.

| Asset | Actual format | Porting effort |
|---|---|---|
| `Data/Grafik/*.spr` (60 + `METROID.dat`, 29,8 MB) | **Uncompressed Windows BMP**, 24/8/4/1 bpp. On first launch the game converts the shipped JPG/GIF to BMP and names them `.spr` | trivial → WebP |
| `Data/Level0-11.dat` | **Pure CRLF ASCII** (VB6 `Write #`), CP1252. *(M1)* Normalized to LF by Git on the first commit, restored to CRLF via `scripts/originals-crlf.ts` | trivial → JSON |
| `Data/intro.dat` | pure ASCII, *(M1)* **its own** schema (header + rect records) | trivial |
| `Data/Musik/*.xm` (18) + `s4.IT` | FastTracker II / Impulse Tracker, 3,8 MB. *(M2)* 19 modules in total, not 20 | `libopenmpt.js` |
| `Data/Sound/*.wav` (209 KB) | *(M2)* 15× **MS-ADPCM**, 5× PCM 8 bit, all mono; `fact` chunks mostly outdated | → PCM16 (*(M2)* 0,6 MB) |
| `Data/1-5.dat` | 2880-entry permutation — *(M4)* not generated at runtime, but the key to the tile-wise scrambled ending images `B1–B5` | pipeline unscrambles the ending images |

### Level format (fully decoded and verified)

```
Section 1: landscape tiles       per record: "Name", l, t, r, b   (rect in landschaftN.spr)
"*"
Section 2: background objects     same schema
"*"
Section 3: enemy definitions      see below
"*"
Section 4: movement pattern       "Name", 2 VB booleans, 2 ints,
                                  waypoints (x,y), terminator "-1 <end>"
                                  (M1: end mostly 0, not in 5 patterns)
"*"
32000                             level length in ticks (identical in all 12 levels)
<32001 event lines>               one per tick (VB6 0 To 32000), mostly empty
"backgroundN"                     background image
```

**Enemy record — correction versus the first assumption: 5 parameters, not 7.**

```
name                       (quoted, CP1252)
l, t, r, b                 (atlas rect)
p0, p1, p2, p3, p4         (5 parameters)
per frame: f0, f1          (2 frame header values)
           (h+1) × (left, right)      where h = b - t
```

The **frame count appears nowhere** in the file — it follows from
`(recordLen - 5 - 5) / (2 + 2·(h+1))`. This division comes out exactly for **all 145
enemy records across all 12 levels**; with any other parameter count it fails.
A parser with 7 parameters falls out of step on every enemy with multiple
animation frames.

Further verified details:
- **The colorkey is provably pure black (0,0,0).** Cross-check of „Ufo" from
  `Level1.dat` (rect 66,400–129,434) against `feinde1.spr`: the non-black spans
  recomputed from the pixels match the `(left,right)` pairs stored in the level
  **exactly** in rows 0–30. That confirms in one go the colorkey, the BMP
  bottom-up flip, the rect interpretation and the edge inclusivity.
  *(M1)* Across **all** frames this does not hold exactly: only 68,8 % of the 19959
  contour rows match pixel-perfectly, the rest are wider (mostly 1 px) —
  but **never** narrower. The stored contour is without exception a superset
  of the pixel span; that is what the cross-validation now checks.
- **Empty contour rows** are encoded with `left > right` (e.g. `63 49` at
  width 64), not with `-1`. The sentinel drops out of every span comparison
  automatically — no special case needed.
- **Frames are stacked vertically** with stride `h`. The `(h+1)`-th row of
  each frame is an off-by-one of the original tool and protrudes into the next
  frame — ignore it.
- The event stream is **extremely sparse**: 20 (level 0) to 819 (level 9) populated
  rows out of 32000. Total across all levels: `;0`=771, `;1`=2105, `;2`=217,
  `;3`=40, `;4`=49, spawns=3915.

Event tokens per tick:

| Token | Meaning |
|---|---|
| `;0 <tile> <y>!` | place landscape tile (wall) |
| `;1 <gegner> <pattern>!` | **set** the current enemy type + movement pattern |
| `;2 <art> <y>!` | spawn extra, `art` ∈ {−2,−1,0,1,2,3} ≙ shield, bomb, option, red, green, blue |
| `;3 0 0!` | *(M1)* 0–8× per level (40 total) — presumably checkpoint |
| `;4 <obj> <y>!` | spawn background object |
| `<y>§` | enemy spawn at Y position (`§` = byte `0xA7`) |

*(M1)* Tile, enemy and object references are **1-based**; pattern `0` and
`−1…−7` are built-in movement types, `1…n` refer to section 4.

~~Important semantics: `;1` does not spawn~~ *(M3, from the EXE)*: `;1 T P!`
**spawns immediately**; at P ≤ 0 the first following `y§` on the same line provides
the Y position. The original never evaluates a standalone `y§` — 2460 of the 3915
`§` tokens are dead data (`docs/measurements/dove-events.md`).

### Game mechanics

- **Weapons:** three colors — red (spread laser), green (reflection balls),
  blue (twin laser). Same color repeatedly = upgrade, different color = reset.
- **Beam:** charge shot, penetrates walls, neutralizes enemy shots.
- **Equipment:** option (max. 2, orbits the ship, indestructible), bomb, shield.
- **Controls:** arrow keys, `S` continuous fire, `A` charge beam, `D` extra-weapon
  position front/back, `Q`/`W` brake/accelerate, `ESC` pause.
- **Options** (enemies fire full/half/off, wall collision on/off,
  equipment loss on/off) produce a **score factor**; >1 activates the
  hard mode in which levels are unlocked.
- 12 levels: Tutorial, Lost In Space, Factory, Deep Blue See, Back in Space,
  Crystal Cave, Speed, The Unreal World, DOVE INSIDE, Final Level, Final Fight,
  ExtraLevel. Boss handlers exist for levels 1–8 and 10.

---

## DoveZ analysis result

### Container format (`.dlp` / `.dfp` / `.d2p` — all identical)

No magic, no header, no directory. A sequential chain of zlib blocks:

```
Record := u32 uncompressedSize (LE)
          u32 compressedSize   (LE)
          byte[compressedSize] zlib stream (RFC1950)

File   := ( Record(fileName, CP1252) Record(fileContent) )*  until EOF
```

All 52 containers parse through completely, no padding, no overlay remnants. To
list them you must walk linearly and decompress every name block. Directly
readable in the browser with `DecompressionStream('deflate')`.

| Extension | Content |
|---|---|
| `.dlp` | 1 level `.dat` + BMPs + `.r` contours + radio texts `<Level>D/E/R.txt` |
| `.dfp` | WAVs only — the radio voice recordings of the level |
| `.d2p` | global packages: `Menu`, `Spiel`, `Standart`, `Loading`, `Logo`, `Pause`, `Sound`, `Video`, `Play` |

Complete inventory (6150 entries unpacked):

| Type | Count | uncompressed |
|---|---:|---:|
| `.bmp` | 3232 | 257,1 MB |
| `.wav` | 243 | 107,1 MB |
| `.avi` | 12 | 92,3 MB |
| `.r` | 2587 | 2,4 MB |
| `.dat` | 27 | 0,59 MB |
| `.txt` | 49 | 0,04 MB |

Plus loose: 20 Ogg Vorbis (61 MB), 2 intro AVIs (101 MB).

`Play.d2p` contains `Play.txt` — 413 bytes that define the **complete campaign
structure**: `Load <Level>,<Screen.bmp>`, `Play <video.avi>`, `Save`, `credits`.
Not in the script and therefore bonus content: `Level8-1 Jungle`,
`Spacestation Bonus`, `Level Bleistift`, `Epilog`.

### Further formats

- **`.r` files:** ~~`u32 width, height, bboxLeft, bboxRight, -1, -1`, then per
  image row `i32 left, right` (bottom-up)~~ *(M6, corrected)* `i32 width, height,
  top, bottom` (first/last populated row), then `height` pairs `left, right`
  **starting at the top** (empty `-1, -1`), terminated by `-1, -1`. 2525/2546 row-exact
  to the pixels. Structurally the same data structure as DOVE's contour rows.
  Details: `docs/formats/dovez-container.md`.
- **BMP depths: 1, 8, 16, 24 and 32 bpp.** 16 bpp (RGB555) and 32 bpp (XRGB with a
  garbage alpha byte) need their own decoder paths.
- **Alpha:** only **83 mask pairs** *(M8: 79; the four `interface*_energyA` are separate images)* (`X.bmp` + `XA.bmp`) versus 3026 pure
  colorkey sprites. Exactly one mask has differing dimensions:
  `atlantis_saule2.bmp` (190×520) vs. `atlantis_saule2A.bmp` (200×540) — that is
  a mandatory override, not a case for silent scaling.
- **Radio texts:** INI-like, `[Trigger]` + `Frame; <wav>; <ms>; <subtitle>`,
  optionally a second speaker block. Section names correspond to the radio IDs in the
  level script. *(M6)* Groups of four `speaker; WAV; ms; text` spanning rows,
  speaker `Frame` or `0`. **Recordings exist in English only** — D and E
  reference the same `…E_*.wav`; `R.txt` (CP1251) references missing
  `RU` files. The bundle is therefore called `voice/<level>`, not `voice/<lang>`.
  *(M8: the pipeline takes over D/E/R as `radio/<slug>` = `{ de, en, ru }`;
  Russian is subtitles only, see `docs/measurements/dovez-runtime.md`.)*
- **Video:** DivX 5 (`dx50`, MPEG-4 ASP) + MP3, 800×600, 3,2 Mbit/s. No browser
  plays MPEG-4 ASP — transcoding is mandatory.

### Level script `<Level>.dat` — largely decoded

> *(M7)* **Fully decoded**, specifically from `LadeDaten` in the
> (UPX-packed) `DoveZ.exe` rather than from the bytes. Some statements in this
> section are thereby outdated: the „spawn timeline" is seven
> timeline layers with fixed 5×i32 entries (no variable records), the
> „null fields" in the enemy record are 16 enemy flags, the section
> „movement patterns" is a bytecode with 45 instructions, and the 56-byte records
> referred to there as enemy parts are parts (sprite, weapon, route),
> not shot emitters. Authoritative: `docs/formats/dovez-level-dat.md`.

Magic ASCII `DOVE2 - V. 0.15`, VB6 serialization. Strings are `u32 len` +
CP1252 bytes.

**The decisive finding:** the format contains **three scalar types** —
`Long` (i32), `Single` (f32, IEEE-754 LE) and `Integer`/`Boolean` (i16, VB6
writes `True` as `-1`, i.e. `FF FF`). A parser that reads everything as `i32`
breaks the floats into noise and cannot, in principle, find the semantics.
That was the blocker of the analysis so far.

**Second finding:** all counters follow the VB6 idiom `ReDim arr(0 To n)`, so they
are **`count - 1`**. Sections are counter-prefixed, not terminated.

Corrected header grammar, verified against all 27 levels:

```
Header  := "DOVE2 - V. 0.15"      (15 B, no terminator)
           str  background         // file name OR numeric index as text
           i32  nGroups-1
Group[] := i32  slotId             // slot/reference ID, not position
           str  groupName
           i16  flag               // 0000 = enemy sprite, FFFF = effect/background
           i32  nFrames-1
Frame[] := str bmpName, i32 x, i32 y, i32 width, i32 height, i32 delayTicks
```

`delayTicks` takes values such as `1,2,3,5,9,10,15,56,60,120,155,170,9999,-1` —
`9999` means „stay here". Frame lists are already unrolled
ping-pong sequences. **27/27 files parse without error up to the exact end of the
section.**

**The section strides** are determined via the spacing of the plain-text names:

| Section | Stride | Interpretation |
|---|---|---|
| Enemy types | `132 + k·56` | base record 132 B + k sub-records of 56 B each (= shot emitters, cf. `AddGegnerSchussErzeuger` in the EXE) |
| Movement patterns | `28 + k·8` | header 28 B + k waypoints of 8 B each (counterpart to DOVE's waypoint patterns) |
| Weapon definitions | 58 | fixed |
| Shot types | 54 | fixed |
| Sound mapping | 4 | one `i32` per sound |
| Radio message IDs | 10 | fixed |

**The spawn timeline has been found** — the previously unexplained block between
radio triggers and weapon definitions. 156 records of **20 bytes** each, terminated
by `tick = -1`:

```
LevelSkriptEntry := i32 tick, i32 typeIdx, i32 param, i32 flag, i32 y
```

Evidence: field 1 increases strictly monotonically (2387, 2431, 4247, …, 8385,
then `-1`); field 2 lies in `[0,14]` with exactly 15 enemy types; field 5 lies in
`[190,447]`. The EXE correspondingly runs the procedures `LevelSkript` and `LTick`.

A huge advantage for the further decoding: **the section names are
in German and self-explanatory** — `Zeppelin(Taktik2)`, `Zecke stark`,
`Zeckenwerfer Speed3`, `ironeagle (beschleunigung)`, `Schuss: links oben`,
`Hinter der Wolke unten3`, `Einkreisen`. The author named the enemies after their
behavior; that is a free label set for the difference analysis.

**Remaining uncertainties** *(M7: both resolved, see above)*:
1. In one timeline record a `1.0f` falls into a column — either an
   offset shift or **variable record lengths** (different command types
   with extra payload, analogous to DOVE's five commands). The single largest risk,
   to be clarified early.
2. About 24 null fields in the 132-byte enemy record. Conjecture: the editor writes
   out the complete runtime structure, the fields are irrelevant.
   The error message „*Level im Editor laden, neu abspeichern und
   packen*" supports this — the editor was the game with a different frontend.

**`DoveZ.exe` is natively compiled VB6, not P-code** *(M7: additionally
UPX-packed; `upx -d` exposes the code)* (shown by
`__vbaExceptHandler`, `_CIcos`, `__vbaRedim`). A VB decompiler therefore yields
**no** source, only commented pseudo-assembly. Ghidra remains the fallback for the
last fields, but is no shortcut. Exactly four functions are worthwhile
there: `LadeDaten` (field layout), `SpielMoveEnemy`
(field semantics), `LevelSkript`/`SpielTick` (timeline opcodes), `LadeR`.

---

## Architecture

### Repo layout

```
amigo-clove/
├─ package.json                  # Bun workspaces
├─ tsconfig.base.json            # strict, noUncheckedIndexedAccess
├─ .oxlintrc.json                # lint (oxlint)
├─ .oxfmtrc.json                 # format (oxfmt)
├─ original-dove/  original-dovez/     # untouched, read-only reference
├─ packages/
│  ├─ core/       @clove/core      – mechanics-free building blocks, no Pixi, no DOM
│  ├─ formats/    @clove/formats   – pure parsers/serializers, isomorphic, no dependencies
│  ├─ pixi-kit/   @clove/pixi-kit  – Pixi adapter (scaling, atlas, debug overlay)
│  ├─ assetkit/   @clove/assetkit  – CLI converter (Node-only, ffmpeg/sharp)
│  ├─ game-dove/  game-dovez/      – the two engines
│  └─ shell/      @clove/shell     – launcher (Vite app, only deploy target)
├─ assets/                        # generated, committed, content-hashed
├─ tools/                         # throwaway analysis scripts (Python allowed)
└─ docs/
   ├─ specs/                      # this document
   ├─ formats/                    # dove-level-dat.md, dovez-dlp.md, dovez-level-dat.md
   ├─ determinism.md
   └─ playtest-checklist.md
```

**The most important cut is `formats` separated from `assetkit`.** `formats`
contains only `Uint8Array → object` and back — without `node:fs`, without
ffmpeg. Consequences: round-trip tests run without I/O in milliseconds, and the
parsers are **runnable in the browser**, so a debug mode can load original files via
drag & drop. That is worth its weight in gold for the DoveZ reverse engineering.

**`core` separated from `pixi-kit`:** the simulation must never see Pixi. This
boundary is enforced by a lint rule, not by convention (oxlint
`no-restricted-imports` as an override on `sim/**`).

### What is shared — and what explicitly is not

Rule for `@clove/core`: *a module belongs here only if it knows nothing about
enemies, weapons, levels or score.*

**Shared:** `FixedStepLoop`, `fx.ts` (Q16.16 fixed point), `Rng` (xorshift32),
**`ContourMask`** (DOVE's `(left,right)` row pairs and DoveZ's `.r` files are
structurally the same data structure — one span-overlap test serves both),
SoA pools, `BundleLoader`/`Manifest`, `AudioBus`/`SfxPool`/`ModulePlayer`,
`InputSource`, `SaveStore`, `Replay`/`Hash`, `GameModule`, i18n. Plus from
`pixi-kit`: `ScreenRoot` (integer scaling + letterbox), `AtlasRegistry`,
`BitmapFontLoader`, `DebugOverlay`.

**Explicitly not shared:** no common entity base class (DOVE is
tick-based with a fixed level length and forced auto-scroll, DoveZ
route-/tactics-based with 5-layer parallax and two players), no common
weapon system, no common collision *ruleset* (only the data structure),
no common level schema, no common HUD (640×390+100 vs. 800×600).
Video, radio system and multiplayer split input exist only in DoveZ.

> Rule of thumb for reviews: **if a module in `core` gets an `if (game === 'dove')`,
> it does not belong in `core`.**

### Asset pipeline

A CLI under Bun: `assets:build`, `assets:check`, `assets:verify`,
`assets:report`. A chain of stages of pure functions `(bytes, options) => bytes`:
`unpack → image → atlas → audio → music → video → level → manifest`.

| Source | Target | Rationale |
|---|---|---|
| BMP (both games) | **WebP lossless** | measured: DOVE 29,8 → 6,3 MB, DoveZ ~257 → ~52 MB. PNG would be 1,5× larger. Lossy is ruled out for a 1:1 port — the pixels *are* the game. `--image-format=png` as a debug switch |
| MS-ADPCM + PCM8 (DOVE, 209 KB) | **PCM16 WAV** (~0,8 MB) | browsers do not decode MS-ADPCM. At this size any lossy encoding would be self-mutilation |
| DoveZ WAVs (243, 107 MB) | **Opus** 48 kbit mono (voice) / 64 kbit (SFX) → ~6–9 MB | PCM is ruled out at 107 MB. All SFX are fully decoded into `AudioBuffer`, so the Opus latency is irrelevant |
| XM/IT (3,8 MB) | **unchanged**, `libopenmpt.js` at runtime | a factor of 15 smaller than a pre-render, seamless loops natively, original files stay untouched |
| DoveZ music (20 OGG, 61 MB) | **unchanged**, streamed | Vorbis is browser-native; no reason for a generation loss. Streaming via `MediaElementAudioSourceNode` — `decodeAudioData` would inflate 61 MB to ~600 MB PCM in RAM |
| DivX AVI (14, 193 MB) | **VP9/WebM** (~25 MB) | no browser plays MPEG-4 ASP |
| level `.dat` | **JSON + binary sidecars** | contours as an `Int16Array` blob, not as JSON — that would be millions of numbers. *(M2)* layout: `docs/formats/dove-assets.md` |

**Atlas packing: no for DOVE, yes for DoveZ.** That follows from the data, not
from inconsistency. DOVE's levels reference *absolute pixel rects* in
`feindeN.spr`, and animation frames are found via the implicit vertical stride
— a repack would destroy both. Per level only ~3 atlases are loaded anyway
(~5 MB VRAM). DoveZ, by contrast, has 3232 individual files, 45–238 per level;
without packing that would be hundreds of GPU textures. Packer: deterministic
MaxRects, sorted by name (not by area), 2048×2048, 1 px border.

**Transparency.** Default: RGB == (0,0,0) → `alpha = 0`. Special cases: for
paletted BMPs DirectDraw keys on the *index*, not on RGB — the converter
checks both and reports every file where index 0 and the resolved black
diverge. 16 bpp is expanded with bit replication (`v<<3 | v>>2`),
32 bpp gets a hard `alpha = 255` (the stored byte is garbage), then the
colorkey takes effect. No alpha bleeding, because `scaleMode: 'nearest'` throughout.

**Reproducibility.** Manifest with SHA-256 of all sources and outputs,
cache key `sha256(input) ⊕ sha256(options) ⊕ converterVersion`, content-hashed
file names. *(M6: CI runs `assets:verify`, which only hashes — assets are built
once locally; `assets:check` remains as the thorough local check.)* `assets:check` builds into a temp folder and fails
as soon as an output diverges from the committed one — that catches hand-edited
assets. Video is excluded from the hash gate (encoders are not bit-identical
across build versions) and only regenerated with `--force-video`. *(M6)* Likewise Opus: libopus
encodes differently on different CPUs (SIMD chosen at runtime); the flag is called
`--force-encode`, see `docs/formats/dovez-assets.md`.

~~**One special feature:** terrain collision masks~~ *(M3)* No longer applies: the
original tests walls via inclusive AABB against the tile rectangles, not
pixel-wise (`docs/measurements/dove-events.md`). M2 had generated masks; since
level asset version 2 they have been removed — the pipeline only converts now.

Tools: all TypeScript under Bun. **Own BMP decoder** (neither sharp nor
jimp handle 16 bpp and the palette cases reliably, and we need
exact control over the colorkey path), `sharp` for encoding, own
MaxRects, `ffmpeg` as an external binary (not ffmpeg.wasm — far too slow at
193 MB). Python only in `tools/`, never in the build path.

### DOVE engine

**Fixed step, separate from rendering.** Accumulator loop with a catch-up limit
(max. 5 ticks, then discard time instead of a salvo of sound), `document.hidden`
pauses instead of fast-forwarding, render interpolation **off** by default
(pixel exactness over smoothness).

**Original tick rate** *(M1)*: **`TICK_MS = 14`** (≈ 71,4 Hz), determined statically from the
main loop of `DOVE.exe` — `nextT = timeGetTime + 14`, one
level tick (`Me.F4 += 1`) per loop iteration. On machines with a coarse
system timer the original effectively ran at 15,6 ms. Derivation with addresses:
[`docs/measurements/tick-rate.md`](../measurements/tick-rate.md). `TICK_MS`
remains a single constant.

**Event stream** not as a `Map` with a lookup per tick, but unpacked at load time into
four flat arrays (`eventTicks`, `eventKind`, `eventA`, `eventB`) with
a single cursor. O(1) amortized, zero allocations — and the complete
stream state is **a single integer**, so trivial in a snapshot.

**Entities as a struct-of-arrays** with fixed capacities and a LIFO freelist
(128 enemies, 512 shots, 512 enemy shots, 1024 particles, …). Three reasons, and
all three count: zero GC in the simulation; the entire world state is a few
typed arrays, so `hash()` is a single pass; deterministic
iteration order via the index.

**All quantities are Q16.16 fixed point in `Int32Array`**, never float — positions,
velocities, beam charge, scroll offset. Sine/cosine from a
1024-entry table. That is the prerequisite for the tick hash being
bit-stable across browser, Bun and Node and for replays to serve as a regression net.

**Collision** *(M3, from the EXE)*: a single test for shot↔enemy and
player↔enemy — vertical exclusion via the frame rows `f0…f1`, then
min(left)/max(right) over the overlapping contour rows against the x interval
of the box (inclusive). No point-in-contour. Walls: inclusive AABB against the
tile rectangles. Details: `docs/measurements/dove-enemies.md`.

*(M3)* The parameters are documented from the EXE: p0 frame count − 1, p1
animation delay, p2 HP and score, p3 shot type, p4 speed
(`docs/measurements/dove-enemies.md`). The rules below still apply to
future open fields:

**The undocumented enemy parameters** — three rules:
1. **Raw indices never leave `data/EnemyDef.ts`.** There live named
   accessors with documented evidence and confidence
   (`score = d => d.p[2]` — values {20,100,150,300} correlate with role;
   `hp = d => d.p[4]` — evidence weak, `TODO(verify)`). Relabeling is
   then a one-line change.
2. `tools/analyze-enemy-params.ts` cross-tabulates all 145 records against
   sprite size, frame count, level and pattern assignment — hypotheses are
   checked statistically, not guessed.
3. `assets/dove/overrides/enemies.json` holds hand-corrected playtest values,
   without polluting the derived data.

**Rendering:** `antialias: false`, `roundPixels: true`, `scaleMode: 'nearest'`,
fixed layer order without `sortableChildren`. Bitmap fonts from `text.spr` and
`text2.spr` — never Pixi `Text` with a canvas font, that would not be a 1:1 port.
*(M3)* `text.spr`: 31×3 glyphs of 8×12 each, mapping from `GetLetter` (A–Z,
digits, punctuation, umlauts); sliced at runtime as sub-textures.

### Launcher shell

Contract `GameModule` in `@clove/core`: the **shell owns** the canvas,
AudioContext, SaveStore, input device layer, locale, loading screen and
routing, plus *(after M9)* all HTML screens outside the levels
(`GameHost.ui`, see „Menus as HTML"). The **game owns** flow, rules
and saves as well as everything in the canvas from `boot()` on — the Pixi
application on the passed canvas, levels, original animations. The game never touches
`location`, `document.title` or the creation of the canvas and AudioContext.

`dispose()` must clean up hard; in dev builds the shell verifies this via
a resource counter and throws if textures are still alive after `dispose()` —
otherwise repeated switching between the games eats up the VRAM.

Hash routing (`#/dove`, `#/dovez`, `#/settings`, `#/dovez/debug/assets`), no
server rewrite needed. Both games are separate Vite chunks via dynamic
`import()`; assets are never in the bundle.

**Lazy loading — the 270 MB problem.** The manifest groups into bundles:

| Game | Bundle | Size |
|---|---|---|
| DOVE | `core` (ss, konsole, explosion, fonts, SFX) | ~2 MB |
| DOVE | `music` (20 modules) | 3,8 MB |
| DOVE | `level{N}` | 2–6 MB |
| DoveZ | `core` | ~10 MB |
| DoveZ | `level/<slug>` | 2–20 MB |
| DoveZ | `voice/<lang>` *(M6: `voice/<level>`, English only, 0,02–0,6 MB)* | 2–3 MB per level |
| DoveZ | `video/<name>` / `music` | streamed, never preloaded |

Two levers cut DoveZ drastically: **load only one language** (the 107 MB
voice recordings are the largest single item; subtitle `.txt` files are tiny and
are always all loaded, so switching the language of the texts needs no reloading) and
**never preload video/music**. Effectively a DoveZ player loads ~10 MB at start
and 4–25 MB per level.

Persistence via the **Cache API**, not IndexedDB blobs — assets are
immutable and content-hashed, so `caches` fits exactly. A service
worker turns that into offline capability and allows an explicit
„Install game data" button with `navigator.storage.persist()`. At ~130 MB
that is a prerequisite for a tolerable second session, not a luxury.

Savegames in IndexedDB with a `localStorage` mirror for the settings, versioned
records with a migration chain, **export/import as a JSON file is mandatory** —
browser storage can be cleared at any time, and a played-through DoveZ
is hours of work. The `Save` command from `Play.txt` maps 1:1 to a
write.

*(M5)* Implementation: `GameModule.preload` names the bundles for the
loading screen (DOVE: `core` and `screens`, 3,5 MB; the flow loads music and levels
afterwards), `GameModule.gamepad` the pad binding per the W3C „standard"
mapping (D-pad and left stick are always the arrow keys; pads without
a standard mapping are ignored). The service worker is built from
`packages/shell/src/sw.ts` as a separately compiled classic script: app
files per build precached into `clove-app-<version>`, game assets cache-first in
a shared `clove-assets-v1` (content-hashed, so never stale;
„Install game data" clears files of older revisions), `manifest.json`
network-first. Reconciliation with `ignoreVary`, because servers like `vite preview`
send `Vary: Origin` and module scripts send `Origin` along. Saves for DOVE
live as `clove:<game>:<key>` in `localStorage`; the
export file (`amigo-clove-save`, version 1, migration chain) is defined by
`@clove/core`.

### Optional modernizations

*(after M9)* Additions over the original follow three rules: **can be turned off**,
**default original** (exceptions: HUD, scaling, pointer and the menus as HTML, which replace the original menus — the pointer only takes effect once the mouse or finger uses it, arrow keys take over at any time) and **bit-identical
simulation without the addition**, i.e. unchanged reference replays and level hashes.

- **Pointer:** `GameHost.pointer` (mouse/touch in logical canvas pixels),
  `PointerSteer` in `@clove/core` turns that into target and keys per tick. The target
  is part of the input and thus of the simulation: DOVE carries it in bits
  10–28 of the input number (`Input.Target`, replay format unchanged,
  `decodeInput` yields 32 bits), DoveZ as `PlayerInput.target` (player
  1 only). Both move in a straight line at ship speed (Chebyshev like the arrow keys);
  `prevInput` and the key path without a target stay unchanged. Reference
  replay `level1-pointer` secures the target path.
- **HUD:** `GameInstance.hud()` provides a snapshot of what the
  original HUD shows, plus boss health points; the shell shows it as HTML.
  With `hudMode = modern` the games do not draw their HUD and limit the
  visible height in the level to the playfield (`setView`, 410 or 550 px);
  DoveZ moves the radio image and ticker into the field. The bitmap font rule above
  still applies to everything in the canvas.
- **Display:** `GameHost.scaleMode` (default `fit` window-filling sharp, `integer` 1:1 pixels as before,
  `smooth`), grid lines as a CSS layer, fullscreen over the whole page.
  At an integer factor of device pixels per game pixel the browser scales the
  1× canvas exactly via `pixelated`; otherwise the canvas is m times the
  logical size (m integer, rounded up to the device pixels, at most 4;
  `@clove/pixi-kit` records the logical size as `data-logical-width/-height`).
  `GameHost.resolution` `original` then draws at 1× and scales up via
  nearest to m, the browser filters the rest (sharp-bilinear); `xbr` likewise draws
  at 1× and always scales up via the xBR shader (level 2, one pass,
  21 texels per target pixel) to m; `hd` draws at resolution m. The render targets
  of DoveZ follow the resolution, `blur`/`lens` stay 64 × 64. WebGL with
  `powerPreference: "high-performance"`; if the shell detects software rendering
  (renderer name or `failIfMajorPerformanceCaveat`), „Display" shows a
  note, the image stays the same.
- **Menus as HTML** *(not an option, replaces the original menus):* everything
  outside the levels — title/main menu, options, level select, info,
  highscores, name entry, load/save, loading screen, Get Ready, Pause,
  Continue, Credits, NEO-ARTS logo — the game describes as data (`UiScreen`
  in `core/src/shell/ui.ts`: menu, form, text, input, query, note,
  video) and waits with `GameHost.ui.show()` for the answer; the shell
  draws generic HTML building blocks and knows no game-specific pages.
  Launcher, settings, loading screen and error pages of the shell are
  the same building blocks (`UiHost` on a page instead of over the canvas).
  Flow, rules (score factor, unlocks, campaign) and
  save formats stay in the game and unchanged. In the canvas remain the
  levels and the original animations (DoveZ logos, story intro and
  credits images from DOVE, easter egg „LOV", radio image); DoveZ videos are played by the
  shell as `<video>`. As long as a screen is open, the game sees no
  keys and no pointer, and afterwards a key counts only after it is released.
  Level simulation, replays and level hashes are not affected by this.
- **One unified look for both games:** a design system (CSS tokens in
  `shell/index.html`; `data-game` sets the accent, DOVE gold, DoveZ the olive
  of its logo). `GameUi.brand` supplies the game logo for the header of each
  page, `UiMenu.logo` remains the large logo of the main menus (both with the
  highscores next to them). Similar screens are built the same way: Pause
  („Pause", the level as `subtitle`, `PAUSE_TEXTS`, key overview), Continue
  over the frozen level, Credits as sections per role (DoveZ transcribed from the
  original image, publisher logo and team photo as crops),
  Options with the shell's shared pages (`GameUi.settings`:
  key binding, audio, display; labels `SETTINGS_PAGES`).
- **In-level overlays** *(with `hudMode = modern`)*: `HudSnapshot.messages`
  carries the texts in the playfield — DOVE script and tutorial texts, scan messages
  of the level 7 boss, the DoveZ key hint „Drücke: …" and the radio ticker at
  the original positions in game pixels; the shell draws them, the game leaves
  them out of the canvas. `GameUi.caption` shows the story lines of the
  DOVE credits as subtitles. Purely presentation, the simulation stays the same.
- **Key binding** *(default original)*: the shell binds per game and action
  (`KeyAction`, with `group`, `player`, `nav`) up to three keys; templates
  „Arrow keys + left hand (original)" and „WASD + right hand" (weapons on
  J K L / U I O) in `keys.ts` of both games. `bindKeys` (`core/src/input/
  keyBindings.ts`) answers the game's query for an original code with
  the bound keys of the action; other codes (Esc, Enter, F keys) pass
  through, pad and touch feed in behind. DoveZ queries only the fixed keys
  `T1` (player 1: sets 0 and 1, player 2: set 2), the second keys of the
  old key configuration become the own binding once, likewise the
  second keys of DOVE. `GameHost.boundKeys` provides the bound keys for
  hint texts; with the original binding the texts of the original remain.
  The bound movement keys and the fire key also operate the
  HTML screens. Replay format and simulation are untouched.
- **Audio:** the shell controls master, music, effects and voice for both
  games (`AudioHost.voice` for the DoveZ radio voices); DoveZ keeps the
  mix ratio of its defaults, its volume page is dropped.
- **Comfort:** DOVE pauses on focus loss like DoveZ; `GameModule.pads`
  binds individual pads (DoveZ: pad 2 = set 2 for player 2); touch keys
  feed in ordinary key codes.

---

## Verification

Runner: **`bun test`** (native TS), `happy-dom` for DOM-near tests, **Playwright**
with `--use-angle=swiftshader` for everything involving WebGL.

**1. Byte-identical round-trip — the highest value.**
`serialize(parse(bytes)) === bytes` for all 12 DOVE levels. That proves the
parser consumes every byte and invented nothing. For DoveZ the
*decompressed* record stream is compared, not the container (zlib output depends
on the compressor).

And then the actual trick for DoveZ: the `.dat` parser models
`{ known fields } + { opaque remaining blobs }`. The round-trip thereby runs **green
over all 27 files from day 1**, even though the semantics are still unknown. Over
time, bytes migrate from `opaque` into named fields — the test never breaks
in the process. That makes RE progress monotone and measurable (metric `opaqueBytes/total`,
logged in CI). **This is the single most important technique in the whole plan.**

**2. Cross-validation asset ↔ data — the killer test.**
For every enemy in every level, recompute the `(left,right)` spans from the *converted
sprite* and compare them against the contour *stored* in the level.
A single test thereby checks the BMP decoder, the bottom-up flip,
the **colorkey choice**, the rect interpretation, the frame stride and the WebP conversion
all at once. *(M1)* Because the DOVE contours are not pixel-exact (see above), the hard
condition is „stored ⊇ pixels" across all 19959 rows; the exact share
(68,8 %) runs along as a metric with a lower bound.
145 records × ~50 rows ≈ 7000 assertions in seconds. For DoveZ the same with
the 2587 `.r` files against 3232 sprites. **This replaces the bulk of the need
for reference screenshots.** Blocking in CI.

**3. Deterministic replays.** Input recording + tick hash (xxhash32 over
all state arrays) every 64 ticks, headless in `bun test`, in seconds. Runs in
CI on **Bun and Node** — a divergence there is an early warning signal for
floating-point arithmetic that has crept in. Honesty note for `docs/`: this
verifies the port against itself and prevents regressions; it proves
no fidelity to the original. That is exactly why it needs points 2 and 4 alongside it.

**4. Reference screenshots — valuable, but selective.** The original already runs
on the machine: record with OBS and grab a handful of frames
(title image, console with each weapon color per stage, B1–B5 curtain, one boss),
comparison via `pixelmatch` against our render at the same tick. **Target count
~15 images for DOVE, ~10 for DoveZ**, as a smoke test „does it look right", not
as pixel proof. Explicitly *not* planned: frame-by-frame comparison of whole
levels (the VB6 timer resolution is not reproducible).

**5. Architecture tests.** Lint rule plus grep over `sim/**` for `pixi`,
`window`, `document`, `Math.random`, `Date.now`, `performance.`. Determinism
does not fall apart in a day, but over months through small conveniences —
only an automatic gate stops that.

**What is not testable** belongs honestly named in `docs/playtest-checklist.md`:
audio equivalence (BASS 0.8 and libopenmpt mix differently by design
— `interpolationfilter=1` comes closest to BASS; document, not fight),
bit-exact video, and „game feel" (accelerating, the beam charge curve, inertia).

---

## Milestones

Each one has exactly one verifiable result.

| # | Content | Effort | Result |
|---|---|---|---|
| **M0** | Bun workspace, tsconfig strict, oxlint + oxfmt, CI, gitattributes | 0,5–1 d | fresh clone: `bun install && typecheck && lint && fmt:check && test` green — *status: done* |
| **M1** | `@clove/formats`: BMP decoder (1/4/8/16/24/32 bpp), `LevelDat` parse **and** serialize, frame derivation. Measurement of the original tick rate | 2–3 d | byte-identical round-trip over 12 levels; cross-validation 145/145 green; `TICK_MS` is a **measured** number — *status: done; `TICK_MS = 14` derived from the EXE instead of measured, see `docs/measurements/tick-rate.md`* |
| **M2** | DOVE asset pipeline with manifest, cache, `--check` | 2 d | ~11 MB of assets; the second run writes zero bytes — *status: done; 10,8 MB, see `docs/formats/dove-assets.md`* |
| **M3** | ⭐ **First playable level.** Scope cut brutally: no menus, no music, **one** weapon, no beam/options/bombs/shield | 4–6 d | level 1 plays through in the browser; a recorded replay reproduces bit-identically — *status: done; mechanics statically from the EXE, two reference replays, browser smoke test in CI* |
| **M4** | DOVE feature-complete: all weapons + stages, beam, options, bombs, shield, all 12 levels, curtain, highscore, audio, the three options, easter egg | 1,5–2 w | playable from start to finish; playtest checklist ticked off — *status: implemented; all weapons, beam, options, shield, 12 levels with scripts, 9 bosses, audio (effects + modules), menus, intro, continue, highscore, credits. Open: playtest checklist against the original* |
| **M5** | Shell for real: menu, routing, settings, gamepad, save export, cache bundles, service worker, i18n | 3–4 d | deployable site; DOVE playable from a cold cache — *status: done; static build with relative paths, smoke test starts DOVE cold and after „Install game data" with the server stopped. Open: resource counter for `dispose()` in dev builds, savegames in IndexedDB (DOVE needs only key/value in `localStorage`)* |
| **M6** | DoveZ container + assets | 1 w | ~120 MB of assets; the debug page renders every sprite with the overlaid `.r` contour — *status: done; 147 MB (of which music 62 MB unchanged, video 20 MB), 33 atlases on 44 pages, `#/dovez/debug/assets`, see `docs/formats/dovez-assets.md`* |
| **M7** | ⚠ **Decode DoveZ `.dat`** (risk block) | 1–2 w | `opaque` below 5 %; the debug view draws routes and shot patterns — *status: done; grammar from `LadeDaten`, 27/27 byte-identical, **0 bytes open** (named or provably unread), route interpreter bit-identical to the reference simulator, `#/dovez/debug/level`, see `docs/formats/dovez-level-dat.md`. A start tick before 0 (`Me.560`) runs in the port (`from=` negative). Open: comparison against the original* |
| **M8** | DoveZ engine: parallax, both ships, coop, radio system, bosses, video, campaign | 3–5 w | campaign playable to the end — *status: implemented (no original to compare against); mechanics statically from the EXE (`docs/measurements/dovez-runtime.md`, tick 16 ms). Playable via `#/dovez`: timeline with lead-in, layers and landscape, effect animations, enemies with routes, parts and weapons, ship with main shot, hits, contact, power-ups, level excursion; death states with sparks, explosions, popups and shaking; checkpoint gate with snapshot and restart; HUD; audio, radio with ticker, streamed music; all 27 levels run through headless. Plus secondary weapons and all shot types, particles (D-Tonator) and force (D-Phyton), beam with combo, Super-Nova, boss finale (state 4), shockwave as a gameplay effect, ship drawing from SpielMoveDove, continue/pause with highscore list, coop input (`players=2`), procedural backgrounds, weather, water, overlays and special sequences (tutorial start). Campaign per `LevelSkript`: loading screen with progress or mosaic, transition of player values from level to level, save screen and 21 saves (JSON at the host), cutscenes as a `<video>` texture, outro, credits, `FadeOut`, epilogue from the second playthrough on. Start logos (glitch, tunnel), intro and main menu with all pages, name entry, bonus and options (volume levels, force key, auto-arrange). Inertia („Realistic") as coasting. Plus key configuration with recording, inertia „Realistic", kill counter, easter egg „LOV", debug ship 2 with drones (`ship=2`), vibration via gamepad motors, Russian (menu, ending, radio texts as subtitles), reduced-motion display. All 27 levels are playable to the end with bots (`levels.test.ts`, boss fights in `boss-*.test.ts`, regression replays in `levelReplays.test.ts`, level report `docs/measurements/dovez-levels.md`). Open: the comparison against the original (`docs/playtest-checklist.md`)*
| **M9** | Polish, performance, accessibility, deployment | 1 w | release — *status: DoveZ in the launcher and installable offline (smoke test), Content Security Policy and security headers, web app manifest with icon, „Motion" setting (`prefers-reduced-motion`), performance test (simulation ≈ 0,2 ms per tick at a 16 ms tick) and size budget in CI. Open: the written clearance from the rights holders (section „Legal finding"), measurements of the draw time on real devices*

**Shortest path to the first playable level:** M0 → M1 (only `LevelDat` +
`BmpDecoder`) → M2 (`--only=level1`, without audio) → M3. Realistically **~2 weeks**.
Accelerator: in M1/M2 convert only six files (`feinde1`, `landschaft1`,
`background1`, `ss`, `konsole`, `text`) instead of all 61.

Order within M3: (a) scaling + atlas + still image, (b) scrolling
terrain from the event stream, (c) player ship + movement + shot, (d)
enemy spawn + pattern + contour collision, (e) explosion + score + font.

---

## Risks

**R1 — DoveZ `.dat` semantics.** *Probability high, impact very high
(blocks M8).* Countermeasures: the opaque-remainder parser with round-trip from day 1
makes progress monotone and measurable; **build the debug viewer before the engine**
(a hypothesis like „these three i32 are a waypoint" is confirmed in the viewer in
seconds instead of in a running engine in hours); the 27 files are a
natural difference corpus; the German section names are a free label set;
Ghidra as an escape route for `LadeDaten` and `SpielMoveEnemy`.
**Hard scope limit, fixed now instead of later in frustration:** if `opaque` is
still above 30 % after two weeks, DoveZ is reduced to a level/gallery viewer
and DOVE is shipped alone. *(M7: not invoked — `opaque` is 0 %.
The decisive factor was not the viewer, but the EXE: after unpacking, the
sequence of `Get #` calls in `LadeDaten` yields the schema directly, and the
use of the runtime offsets in `DoRoute`, `SpielMoveEnemy` etc. provides the
meaning. R1 has thereby shrunk to the residual risk „the semantics are wrong in
detail", which M8 checks against the original.)*

**R2 — Repo size.** *Probability high, impact medium–high.* `.git` is
already **439 MB** today; ~130 MB of derived assets come on top, and blobs
never disappear. Since we deliberately work without LFS, the countermeasures are
discipline instead of technology: content-hashed file names (a changed asset is
a new file, old ones are removed in a deliberate cleanup commit),
frozen encoder options (re-encode only with `--force` plus review), and
`assets:verify` *(M6, previously `assets:check`)* as a CI gate against accidental rewriting of whole
asset trees. **Watch:** should the history become unwieldy, LFS or
offloading the videos as a release attachment are the obvious exits — the
architecture supports the latter without change, because video is lazily streamed anyway.

**R3 — Determinism.** *medium / high (destroys the replays, and those are the
complete regression net).* Q16.16 throughout, a seeded xorshift32, SoA pools
with an explicit freelist, a lint and grep gate over `sim/**`, a tick hash every 64
instead of only at the end (localizes a divergence immediately instead of „somewhere in 32000
ticks"), a replay suite in CI on Bun *and* Node.
*(M7)* DoveZ computes in `Single` in the original; the port reproduces that with
`Math.fround` instead of with Q16.16 (fixed point would falsify the routes).
IEEE arithmetic is the same everywhere, but `Math.cos/sin/atan` are not guaranteed
bit-identical between JS engines (JSC in Bun, V8 in Chrome). The routes use them
in MoveTo and angles; for replays M8 needs its own, deterministic
implementations or a table-based approach.

**R4 — Audio.** *medium–high / medium.* A single AudioContext, created by the shell
on the first user gesture (`latencyHint: 'interactive'`) behind a
„click to start" gate. SFX only via pre-decoded `AudioBuffer`, never
`<audio>`. Voice limiting to 8 voices with a cooldown per sound. libopenmpt in the
**AudioWorklet** (not `ScriptProcessor`), the `WebAssembly.Module` passed in via
`postMessage`, 3 quanta of lead, fallback to pre-rendered tracks if the worklet or
WASM fail. *The subtle bug that is guaranteed to happen:* on a catch-up of 5 ticks
five identical sounds fire simultaneously. That is why the loop collects
sim events and deduplicates **once per frame**, not per tick.

**R5 — Colorkey ambiguity.** *medium / medium.* Black pixels *inside*
a sprite become transparent; for paletted images DirectDraw keys on
the index; DoveZ has 16 bpp and 32 bpp with a garbage alpha byte. The countermeasure is the
cross-validation from point 2 of the verification — an **automatic,
exhaustive oracle** over 145 + 2587 records. If the colorkey were wrong,
the contours would not match; they demonstrably match (for DOVE as a superset,
see *(M1)* above). Paletted DOVE graphics with diverging index
and RGB keying: `Explosion.spr` (black on index 255) and `background5.spr`
(no black) — both uncritical with RGB keying, pinned down in the test. `atlantis_saule2` is a
**hard build error** with a mandatory override — silent scaling would be the
classic bug that subtly breaks a sprite and only shows up in playtesting.

**Smaller points:** original tick rate *(M1: determined from the EXE, 14 ms;
cross-check against the original optional)*; VB6 rounding semantics
(`\` integer division, `CInt` rounds banker's-style) to note as a candidate if
movement paths visibly drift; storage quota at ~130 MB DoveZ.

---

## Legal finding

**DOVE:** `Readme.txt`, `Liesmich.txt` and `Help Guide.htm` contain *no*
license or distribution statement whatsoever. The only rights notice is the
version resource of the EXE: `LegalCopyright: Markus Madeja 1999, 2000, 2003`.
Assets additionally come from several further authors (Kempf, Brinkmann,
Kollmann, Pröbsting, Nonte/Toxeen among others). Effectively „all rights reserved".
Contact: `Kauto@gmx.de`, `www.kauto.de`.

**DoveZ — clearer.** Verbatim from `Liesmich.txt`:

> „Sämtliche Rechte entsprechend der vorliegenden Software, Grafik, Musik, Sound
> Effekte und Texte sind vorbehalten und dürfen in keiner Form ohne schriftliche
> Genehmigung vervielfältigt, reproduziert oder verändert werden. […]
> © All rights reserved, 2004, 2005, 2006"

There is **explicitly no** freeware or distribution permission granted; the
free offering of 2019 does not change that. In addition, at least one
publisher (magnussoft) existed, which spreads rights further.

For private development in a private repo this is uncritical. **A
release requires written clearance** — to be clarified before M9,
not after. *(M8: repository and site have been public since 2026-09-28 by decision
of the repository owner; delivery via Cloudflare Workers Builds,
`wrangler.jsonc`.)*

---

## Critical files

**Reference and test corpus (existing):**
- `original-dove/Data/Level1.dat` — canonical example of the DOVE level format;
  basis for parser, round-trip and contour validation
- `original-dove/Data/Grafik/feinde1.spr` — the atlas for the
  contour cross-validation; reference for colorkey, flip and frame stride
- `original-dove/Readme.txt` — the only available specification of the
  DOVE mechanics
- `original-dovez/Data/Level1-1 Skyfight.dlp` — complete, small
  DoveZ package (223 entries, 4,68 MB); first target for the container parser,
  atlas packing and `.dat` decoding
- `original-dovez/Data/Epilog.dlp` — smallest `.dat` (3812 B, 7 groups);
  minimal round-trip test case
- `original-dovez/Data/Play.d2p` — the 413 bytes that define the entire
  DoveZ campaign structure

**To be created (in implementation order):**
- `packages/formats/src/dove/LevelDat.ts` — parser **and** serializer, the heart
  of the round-trip proof
- `packages/formats/src/bmp/BmpDecoder.ts` — 1/4/8/16/24/32 bpp, palettes,
  bottom-up, colorkey path
- `packages/assetkit/src/cli.ts` — the reproducible pipeline
- `packages/game-dove/src/sim/Sim.ts` — deterministic fixed-step simulation,
  Pixi-free
- `packages/core/src/shell/GameModule.ts` — the contract that separates both engines
