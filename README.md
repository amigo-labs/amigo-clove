# amigo-clove

Browser port of the two German arcade shooters **DOVE** (1999–2003) and
**DoveZ – The Second Wave** (2004–2019) by Markus „Kauto" Madeja /
Intergenies — one shared launcher, two games, with the original assets.

## Status

Milestones **M0** (workspace, tooling, CI), **M1** (`@clove/formats`:
BMP decoder, DOVE level format with byte-identical round-trip,
contour cross-validation), **M2** (DOVE asset pipeline: WebP, PCM16,
level JSON with contours, manifest, cache, CI gate), **M3** (first
playable level, deterministic replays) and **M4** (DOVE complete:
all weapons, beam, options, shield, all 12 levels with level scripts, 9 bosses,
sound effects and music, menus, intro, continue, highscore, credits) are
done. The mechanics were derived statically from the EXE
([`docs/measurements/`](docs/measurements/)); the comparison against the running
original is still pending ([`docs/playtest-checklist.md`](docs/playtest-checklist.md)).
**M5** (shell) likewise: launcher, settings (language, volumes, key bindings,
gamepad), save export/import, loading screen with bundle preloading and
offline operation via service worker. **M6** (DoveZ packages and assets):
parsers for packages, `.r` contours, masks, radio texts and campaign,
asset pipeline with atlases, Opus, music and video, debug page
`#/dovez/debug/assets`. **M7** (DoveZ `.dat` fully decoded) is
done. **M8** (DoveZ engine) is implemented: `#/dovez` shows logos, intro and the
main menu (New with ship and name, Load, Options with vibration,
Bonus, Highscore) and plays the campaign from `Play.txt` with loading screens,
cutscenes, save screen and saves, outro, credits and
epilogue; all 27 levels with enemies, bosses, all weapons, beam, Super-Nova, coop,
continue/pause, backgrounds, weather, vibration and Russian. Every level is
playable to the end with bots ([`docs/measurements/dovez-levels.md`](docs/measurements/dovez-levels.md)).
The original tick rate (16 ms) was derived from the EXE:
[`docs/measurements/tick-rate.md`](docs/measurements/tick-rate.md). **M9**
(polish) is in progress: DoveZ is in the launcher and installable offline, there are
security headers, a size budget and a performance test; still open are the written
clearance from the rights holders and the comparison against the original (which is not available to play).

- **Design spec:** [`docs/specs/2026-09-07-dove-dovez-browser-port.md`](docs/specs/2026-09-07-dove-dovez-browser-port.md)
  — format findings, architecture, asset pipeline, verification strategy,
  milestones and risks.
- **DOVE level format:** [`docs/formats/dove-level-dat.md`](docs/formats/dove-level-dat.md)
- **DOVE assets:** [`docs/formats/dove-assets.md`](docs/formats/dove-assets.md)
- **DoveZ formats and assets:** [`docs/formats/dovez-container.md`](docs/formats/dovez-container.md),
  [`docs/formats/dovez-assets.md`](docs/formats/dovez-assets.md)

## Development

Prerequisite: [Bun](https://bun.sh) ≥ 1.3.11; to build the DoveZ assets
additionally ffmpeg with libopus and libvpx (Ubuntu 24.04: `apt install ffmpeg`).

```sh
bun install
bun run check        # typecheck + lint + fmt:check + test
bun run typecheck    # tsc (strict, noUncheckedIndexedAccess)
bun run lint         # oxlint
bun run fmt          # oxfmt (writes), fmt:check only checks
bun run test         # bun test

bun run assets:build   # originals → assets/dove/, assets/dovez/ (incremental; --game=…)
bun run assets:verify  # CI gate without conversion: files ≡ manifest ≡ sources/options
bun run assets:check   # local, thorough: fresh build ≡ committed tree
bun run assets:report  # sizes per bundle
bun run smoke          # browser smoke test: cold start, shell, offline start
bun run build          # static site into packages/shell/dist/
bun run budget         # size budget of the built site (after build)
bun run perf           # simulation time per tick, all DoveZ levels
bun run perf:render    # drawing in the browser per scene: frame callbacks, draw calls, uploads, allocations
bun run frames         # reference frames of fixed scenes against packages/shell/scripts/frames.json
bun run levels:report  # regenerate docs/measurements/dovez-levels.md

bun run --cwd packages/shell dev   # launcher at http://localhost:5173
```

`perf:render` and `frames` run in Chromium with SwiftShader (WebGL on the CPU):
compare times there only relatively; the per-frame counts (draw calls,
render-target switches, uploads, allocations) hold regardless of device. `frames`
pins each displayed frame to exactly one tick (Playwright's clock) and checks that
optimizations do not change the image; `--write` only on an intended image change.
The hashes depend on the Chromium version of playwright-core, which is why
`frames` runs locally and not in CI.

The launcher (`#/`) lists the games (with the key overview of the chosen
mapping next to them), `#/settings` contains language, audio (master, music, effects, voice),
display (HUD, scaling, resolution, grid lines, motion), controls (mouse/touch,
gamepad), the key bindings per game, save export/import and
„Install game data" (only in the build, the dev server registers no
service worker).
Start DOVE: `http://localhost:5173/#/dove` (NEO-ARTS logo, title menu).

**Everything outside the levels as HTML, identical for both games:** launcher,
settings, loading screen, title and main menu, options, level select,
info, highscores, name entry, load/save, Get Ready, Pause, Continue,
Credits and the NEO-ARTS logo are rendered by the shell from the same HTML building blocks
(`GameHost.ui`, `packages/core/src/shell/ui.ts`; design system as CSS tokens in
`packages/shell/index.html`, DoveZ with its own accent via `data-game`). Both
games supply their logo as the brand for the header of each page; similar
screens (main menu with highscores, options, pause, continue over the
level, credits per role) are built the same way. The games retain flow,
rules and saves; only the levels and the original animations run in the canvas
(DoveZ logos, story intro and credits images from DOVE with
HTML subtitles, easter egg, radio image). With the HTML HUD, the in-field texts
are HTML too: tutorial and script texts, boss messages, the DoveZ
key hint and the radio ticker. DoveZ videos are played by the shell as
`<video>`. Controls everywhere: arrow keys (and the bound movement keys),
`Enter`/Space or the fire key to confirm, `Esc` to go back; plus
mouse/touch and gamepad (D-pad, A/Start to confirm, B to go back).

**Key bindings:** free per game and action (up to three keys), under
`#/settings` and in the options of both games, with two templates:

| Template | Move | Weapons DOVE | Weapons DoveZ |
| --- | --- | --- | --- |
| Arrow keys + left hand (original, default) | Arrows, numpad | `S`/Space fire, `A` beam, `D` rotate extra weapon, `W`/`Q` speed | `S` `A` `D` `Q` `W` `E` |
| WASD + right hand | `W` `A` `S` `D` | `J`/Space fire, `K` beam, `L` rotate, `I`/`U` speed | `J` `K` `L` `U` `I` `O` |

DoveZ player 2 has the numpad set in both. The games keep querying
their original keys, the shell translates (`bindKeys`); simulation and
replays stay the same. Texts that name keys („Du schießt mit S!") name
the bound key. The full binding (keyboard, gamepad, mouse) is shown by
the launcher and the pause menu of each game.

Further modernizations (can be turned off; without them the simulation runs bit-identical
to the original, see spec „Optional modernizations"). The default is the
original except for HUD, scaling and pointer; the pointer only takes effect once the mouse
or finger uses it:

- **Mouse:** the ship follows the pointer, left fires, right beam, middle
  rotates the extra weapon (DOVE) or Super-Nova (DoveZ), wheel speed (DOVE) or
  extra weapon (DoveZ). Arrow keys take over at any time.
- **Touch:** dragging steers relatively and fires, a second finger charges the
  beam; D-pad, OK and pause appear in the overlay.
- **HUD:** the default is the shell's HTML HUD next to or below the playfield
  with a boss health bar; the original HUD can be brought back.
- **Display:** fullscreen (`Alt+Enter` or ⛶), scaling window-filling
  sharp (default) or smooth or integer (1:1 pixels), grid lines.
  The canvas has device pixels: the image is scaled up by an integer factor, the browser
  filters the rest — no more unevenly wide pixels. Resolution
  „Original" (default) draws at the game's resolution, „Smoothed edges"
  likewise, but scales up via an xBR shader (rounds off the stair-stepping on diagonal edges),
  „HD" draws at the screen's resolution (rotations, cross-fades,
  lines and text sharper). DOVE looks the same in HD: it draws only
  unrotated sprites on whole pixels. Pixi wants the fast GPU
  (`high-performance`); if the browser draws without a graphics card, the
  „Display" page points this out.
- **Comfort:** DOVE pauses on focus loss; free key binding (see
  above); in DoveZ the second gamepad controls player 2.

URL options: `nosound` (no audio), `nointro=1`, `seed`, `shots=0|1|2`, `walls=1`;
straight into the level with `level=<n>`, for testing `invincible=1`, `from=<tick>`,
`lives`, `score`, equipment `colour`/`stage`/`options`/`bomb=1`/`shield=1`
and `screen=<name>` (intro, getready, continue, highscore, outro, credits,
options, levelselect, info, farewell) for visual checks of individual screens.

### Serving the site

`bun run build` produces a purely static site under `packages/shell/dist/`
with relative paths — it runs under any sub-path without server rewrite
(hash routing). The service worker needs HTTPS (or `localhost`).
Game assets are content-hashed and may be cached indefinitely
(`Cache-Control: immutable`); `index.html`, `sw.js` and the
`manifest.json` files are not. The build writes these rules as `_headers`.

Public delivery goes through **Cloudflare Workers Builds** (static assets
only, no worker script): `wrangler.jsonc` in the root directory builds with
`bun install --frozen-lockfile && bun run build` and uploads
`packages/shell/dist/`; every PR gets a preview. Check locally:
`npx wrangler dev` (serves the site including `_headers` at `localhost:8787`).

## Directories

| Path              | Content                                      |
| ----------------- | -------------------------------------------- |
| `original-dove/`  | Original installation DOVE 1.10 — **not in the repo**, place locally (see below) |
| `original-dovez/` | Original installation DoveZ — **not in the repo**, place locally (see below) |
| `packages/formats/` | `@clove/formats` — pure parsers/serializers, without I/O |
| `packages/core/`  | `@clove/core` — mechanics-free building blocks: tick, Q16.16, Rng, Hash, Replay, Assets, i18n, save file, `GameModule` |
| `packages/pixi-kit/` | `@clove/pixi-kit` — Pixi adapter: integer scaling, textures |
| `packages/game-dove/` | `@clove/game-dove` — DOVE: simulation (`src/sim`, Pixi-free), renderer, replays |
| `packages/game-dovez/` | `@clove/game-dovez` — DoveZ (M8 in progress): `#/dovez` logos, intro, main menu (HTML) and campaign (`nointro=1` straight to the menu, `video=0` without videos); without the menu `step=<n>` from instruction n, `load=<1…21>` save, `level=…&from=…` a single level; Esc pause, no lives means Continue (`screen=continue\|pause\|save\|credits\|love` for visual checks); debug views |
| `packages/shell/` | `@clove/shell` — launcher (Vite): routing, settings, gamepad, saves, service worker |
| `packages/assetkit/` | `@clove/assetkit` — asset pipeline (Bun, sharp) |
| `assets/dove/`, `assets/dovez/` | generated assets + `manifest.json`, never edit by hand |
| `tests/`          | repo-wide architecture tests                 |
| `docs/`           | specifications and format documentation      |

The original installations are **not in the repo** (they are in `.gitignore`).
They are a read-only reference and the sole source of the asset pipeline: `assets/dove/`
and `assets/dovez/` are generated from them and committed. Anyone who rebuilds the assets
(`assets:build`/`assets:check`) or wants to run the byte-exact format checks
places the originals locally in `original-dove/` or `original-dovez/`.
Without them `assets:verify` skips the source comparison (the committed
assets remain verifiable through their manifest) and the tests that rely on the
originals have been removed — `bun run check` and CI run through without the
originals.

`.gitattributes` excludes the directories from any line-ending conversion.
To check a real installation against the expected (CRLF) line endings or
bring it onto them:

```sh
bun scripts/originals-crlf.ts verify  <DOVE folder> <DoveZ folder>
bun scripts/originals-crlf.ts restore <DOVE folder> <DoveZ folder>
```

## Legal

For both games there is **no** freeware or distribution permission; for
DoveZ, reproduction without written permission is explicitly prohibited.
Repository and site have been **public** since 2026-09-28 by decision of the
repository owner. The legal finding (section
„Legal finding" of the design spec) is unaffected by this.
