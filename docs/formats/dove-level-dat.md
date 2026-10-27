# DOVE `Data/LevelN.dat`

Status: M1. Implementation: `packages/formats/src/dove/LevelDat.ts` (parser and
serializer). Every claim here is backed by tests in `packages/formats/test/`
across all 12 levels, unless marked *open*.

## Encoding

- Text, one entry per line, CP1252. Written with VB6 `Write #`:
  strings in `"…"` without escaping, integers without whitespace,
  booleans as `#TRUE#` / `#FALSE#`.
- Line ending: CRLF. Git had normalized the files to LF on the first commit;
  `scripts/originals-crlf.ts` reverted that (initially as a reconstruction
  LF → CRLF, verifiable with `verify` against a real installation).
  `.gitattributes` has prevented any further conversion since M0. The parser
  detects the line ending and the serializer writes the same one back; LF is
  additionally tested synthetically.

## Layout

```
Section 1  landscape tiles          per record: "Name", l, t, r, b
"*"
Section 2  background objects       per record: "Name", l, t, r, b
"*"
Section 3  enemy definitions        see below
"*"
Section 4  movement patterns        see below
"*"
length                              level length in ticks, 32000 in all 12 levels
length + 1 event lines              VB6 `0 To length`; the last one is empty everywhere
"backgroundN"                       background image without extension
```

No section has a counter; records begin with a string line, the section end is
`"*"`.

## Enemy record (section 3)

```
"Name"
l, t, r, b                 atlas rect in feindeN.spr
p0 … p4                    five parameters, semantics open (p2 correlates with points)
per frame:
  f0, f1                   two frame-header values
  (h+1) × (left, right)    contour, h = b - t
```

- **Frame count** is stated nowhere; it is `(values after p4) / (2 + 2·(h+1))`.
  The division comes out even for all 145 records (319 frames); the parser
  rejects any other length.
- **Frames** are stacked vertically with stride `h`: frame `k` occupies the rows
  `t + k·h … t + k·h + h − 1`. In x, `r` is **inclusive** (width `r − l + 1`).
- The `(h+1)`-th contour row is an off-by-one of the original editor and reaches
  into the next frame — ignore it for collision, keep it for the round-trip.
- **Empty contour rows** have `left > right` (e.g. `63, 47`), not `-1`.
- `f0, f1` are exactly the first and last occupied contour row in 221 of 319
  frames; placeholder enemies (1×1 rect, e.g. "End-Links", "Lampe") have
  `-1, -1`. The rest is *open*.
- Only exception at the atlas edge: "14 - Endgegner" (level 4) has `r = 696` on
  a 696 px wide atlas, reaching one column past it.

### Contour against pixels

The stored contours are **not** derivable pixel-for-pixel from `feindeN.spr`
(a correction to the design spec, which assumed 145/145 exact matches):

| | Rows | Share |
|---|---|---|
| exactly equal | 13737 | 68.8 % |
| stored wider than the pixel span | 6222 | 31.2 % |
| stored narrower / shifted | **0** | 0 % |

So the stored contour contains the pixel span **without exception**. That is
consistent with an editor that computed the contours from a different decoding
(JPG/GIF before the BMP conversion) or an older graphic version. Consequences:

- The cross-validation test checks "stored ⊇ pixels" hard and tracks the exact
  share as a metric with a lower bound.
- For the engine the **stored** contour is the collision truth — it is what the
  original computed with.
- The superset condition simultaneously confirms color key (pure black),
  bottom-up flip, rect interpretation and frame stride: each of these errors
  would violate it in thousands of rows.

## Movement patterns (section 4)

```
"Name"
flag0, flag1               VB booleans
v0, v1                     two integers, semantics open
(x, y)*                    waypoints
-1, end                    terminator
```

The terminator is `x = -1`; the second value is **not always 0** (a correction
to the spec): in 5 patterns there is something else (e.g. level 2 "unten": 98,
level 7 "von hinten": 100 with zero waypoints). Semantics *open*.

## Event stream

One line per tick, mostly empty (20–819 occupied lines per level, level 10 only
9). Tokens:

| Token | Meaning |
|---|---|
| `;0 <tile> <y>!` | place landscape tile (wall) |
| `;1 <enemy> <pattern>!` | **set** current enemy type + pattern, does not spawn |
| `;2 <kind> <y>!` | spawn extra, `kind` ∈ {−2…3} ≙ shield, bomb, option, red, green, blue |
| `;3 0 0!` | 0–8× per level; presumably checkpoint (readme 0.17) |
| `;4 <obj> <y>!` | spawn background object |
| `<y>§` | spawn enemy of the current type at y (`§` = byte `0xA7`) |

- **References are 1-based**: tile, enemy and object indices run from 1 to the
  record count.
- **Patterns** `1…n` refer 1-based to section 4; `0` and `−1…−7` are built-in
  movement kinds of the engine (level 0 has no patterns at all).
- **Separator rule**: commands follow directly one after another, a spawn after
  any token gets exactly one space (`;1 4 0! 68§`, `68§ 133§`,
  `30§;1 4 0! 37§`). The parser checks that every line is in this canonical form.
- Counts across all levels: `;0`=771, `;1`=2105, `;2`=217, `;3`=40, `;4`=49,
  spawns=3915.

## Not part of this format

`Data/intro.dat` has a **different** schema (header `1`, `"background1.spr"`,
`2100`, `"intro.spr"`, `13`, then rect records) and is handled with the intro
scene, not in M1.
