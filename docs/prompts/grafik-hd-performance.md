# Prompt: Graphics to HD, max out performance

Template for an agent session (e.g. Claude Code) that brings the rendering of both
games to HD level and pushes performance to the limit, **without changing the
simulation and without changing the original look in the default**. Use the block below
as the prompt; if needed, narrow it to Part A (HD), Part B (performance) or Part C
(more work on the GPU), or to one game. Part B first is the safe order: it creates the
measurement tools and the budget that HD then consumes.

---

```text
You are working in the monorepo amigo-clove (Bun workspaces, TypeScript strict, Pixi.js 8,
browser port of DOVE and DoveZ). Task: bring the graphics of both games to HD and max
out performance to the last. Everything new can be turned off; without the new options,
simulation and image stay exactly as they are today.

## Starting situation (verify yourself before beginning)

- Logical resolution: DOVE 640×480 (DirectDraw7 blits, pixel art), DoveZ 800×600
  (Direct3D quads with rotation, scaling, color, alpha, additive, bilinear, plus
  DirectDraw blits).
- packages/pixi-kit/src/ScreenRoot.ts: Pixi with `resolution: 1`, `antialias: false`,
  `roundPixels: true`, `scaleMode: "nearest"`. The canvas keeps the logical size
  and is scaled up via CSS (`image-rendering: pixelated`). The default is `fit`
  (fractional): the browser scales up nearest, so the pixels become unequally wide.
  On HiDPI displays (devicePixelRatio > 1) not a single device pixel comes from Pixi.
- DoveZ draws, like the original, into a never-cleared back buffer
  (render/Compositor.ts, RenderTexture 800×600, capturing/copying in pixel coordinates,
  64×64 targets `blur`/`lens`). Further targets: game/screenTargets.ts, mosaic, loveView.ts.
- Assets: BMP → WebP lossless (packages/assetkit/src/stages/image.ts, atlas.ts;
  atlas pages 2048², padding 1, alpha only 0/255). Size: DOVE ≈ 11 MB, DoveZ ≈ 142 MB.
- Drawing already happens on the GPU (Pixi with WebGL, `preference: "webgl"`, an own
  shader in render/StripMesh.ts). On the CPU lie draw lists, sprite pools,
  vertex uploads per frame, text rasterization and the mosaic snapshots
  (game/mosaic.ts: synchronous read-back from the GPU, Canvas 2D, `toDataURL`).
- So far only the simulation is measured (`bun run perf`, on average ≈ 0.2 ms per tick
  at a 16 ms tick, p99 up to ≈ 2.2 ms; game-dovez/test/perf.test.ts). The draw time is
  not measured (spec, M9 open).

## Immovable invariants

1. The simulation stays bit-identical. All replays and state hashes must pass
   unchanged (game-dove/test/replay.test.ts with test/replays/*.json,
   game-dovez/test/levelReplays.test.ts with test/replays/levels.json,
   stateHash.ts). NEVER regenerate or adjust expected hashes, replays or golden
   files.
2. Determinism boundary: packages/*/src/sim/** imports no Pixi and uses neither
   window, document, performance, Math.random nor Date.now (.oxlintrc.json,
   tests/architecture.test.ts). Rendering only reads the world, it never changes it.
3. Logical coordinates remain the truth. Game, HUD overlay (`--px`,
   `--game-x/y`, LAYOUT_EVENT) and pointer compute in 640×480 or 800×600.
   Note: shell/src/pointer.ts, shell/src/overlay.ts and pixi-kit `viewHeight`
   currently read `canvas.width/height` as the logical size. With a larger backing
   store the pointer control would break, and the pointer target is part of the sim
   input (replay `level1-pointer`). So provide the logical size via an explicit API in
   pixi-kit, never derive it from `canvas.width`.
4. Rules of the spec "Optional modernizations": can be turned off, default original,
   bit-identical without the addition. With the "Original" setting the image stays
   pixel-identical to the baseline (screenshot comparison, see Verification).
   Pure sharpness without a look change (device pixels, clean final scaling) counts,
   like scaling, among the exceptions and may become the default, with justification in
   the report. Everything that changes the look (pixel-art upscaling) stays off by default.
5. Bitmap font rule (spec "Rendering"): no Pixi text with a Canvas font where the
   original has bitmap fonts. DoveZ GDI text (game/gdi.ts) stays Arial, but may
   be rasterized at HD resolution.
6. Do not touch: original-dove/, original-dovez/. Files in assets/ are created only
   via `bun run assets:build`, never by hand. docs/measurements/dovez-levels.md
   is created only via `bun run levels:report`.
7. No new runtime dependencies, new build dependencies only after asking.
   tsconfig strictness and lint rules stay, no new oxlint-disable,
   @ts-expect-error or @ts-ignore. Implement upscaling algorithms yourself
   (from the paper) or take code with an MIT, BSD or public-domain license and name
   the origin. No GPL/LGPL code (e.g. xBRZ, the HQx reference).
8. `dispose()` tears everything down hard, including HD textures and larger render
   targets. The shell's resource counter must report nothing after a game switch.
9. Keep the budgets: JS ≤ 450 KB gzip total, ≤ 120 KB per bundle, index.html ≤ 20 KB
   (`bun run budget`). `bun run perf` must not get worse, and
   `bun run assets:verify` stays green.

## Approach

0. Inventory and baseline measurement (do not change any behavior yet):
   - `bun install`, `bun run check`, `bun run smoke`, `bun run build && bun run budget`
     and `bun run perf` must be green, otherwise stop and report.
   - The first commit is the measurement tool `bun run perf:render` (scripts/, playwright-core
     against the build). It drives fixed scenes: DOVE e.g. `#/dove?level=<n>&nointro=1
     &invincible=1&seed=1`, DoveZ `#/dovez?level=<slug>&from=<tick>&invincible=1`, each
     with continuous fire and effect-heavy spots (beam, Nova, water, thunderstorm, bosses).
     Per scene it measures frame time p50/p95/p99/max, the share of frames over
     16.7 ms, the time in the frame callback (separated into simulation and drawing),
     render calls, draw calls and render-target switches per frame, texture uploads,
     the JS heap over time with GC pauses (CDP) and long tasks. Plus the URL option
     `stats=1` with a small runtime display (own code, no package).
   - Headless Chromium renders with SwiftShader, absolute times there are only
     relatively comparable. Optimization therefore targets device-independent quantities: draw
     calls, RT switches, allocations and uploads per frame. If possible, also measure with
     a GPU and ask the user for numbers from a real device.
   - Reference images for the "Original" mode: capture fixed scenes at a fixed tick count (seed,
     from, nointro, `screen=…` for screens) before every change. First
     check whether two captures are byte-identical. If so, make a comparison from it
     (extension of smoke.ts or an own script) that commits only hashes, no large PNGs.
1. Plan: a prioritized list of concrete steps, each with a measured or
   justified gain, risk and affected files. Quick wins without a look
   change come first (Part B, then C and A1), then A2 and A3.
2. Implementation in small, individually verifiable steps with one commit each in German
   in the style of the history. Every performance commit states its number before and
   after. An optimization without a measurable effect that makes the code more complex
   is reverted.

## Part A — Graphics to HD

A1 Output in device pixels (sharper, same look):
- The canvas backing store gets real device pixels (CSS size ×
  devicePixelRatio, ResizeObserver with `devicePixelContentBoxSize`, DPR change via
  matchMedia when moving between monitors), instead of letting the browser scale up via
  CSS.
- The final scaling is handled by the GPU: `integer` stays nearest and thus pixel-identical
  to today. `fit` becomes "sharp bilinear" (pre-scale by an integer with nearest, only the
  remainder linear), so there are no unequally wide pixels anymore. `smooth` stays
  linear.
- Scanlines optionally as a shader that falls exactly on the game rows (instead of the
  CSS layer), but only if it looks as good or better.
- Fullscreen, window size, `setView` (field without HUD) and the HTML HUD behave as
  before.

A2 Internal render resolution (setting "Resolution: Original | HD | Auto"):
- Pixi renders at a factor k (integer 2…4, matching the display size). All render
  targets (compositor `bb`/`tmp`/`still`, ScreenTargets, mosaic, LoveView) get the
  same resolution. Capture and copy rectangles (BltFast copies, water and
  escape strips) stay logical and are multiplied internally by k. `blur` and
  `lens` (64×64, bilinearly stretched) keep their original size, because the look
  depends on it.
- The DoveZ effects should benefit most: rotated and scaled D3D quads,
  additive effects, beam, Nova, `balken` lines, particles and GDI text are rasterized in
  the target resolution instead of scaled up from 800×600. Blits stay on the
  logical grid, D3D quads may sit at subpixel precision. First check what Pixi 8
  does with `roundPixels` at resolution > 1.
- Visual check per draw site (Renderer.ts `ORDER`) in SD and HD: every effect
  must look the same, only sharper. This applies especially to veils and trails in the
  never-cleared back buffer, water, thunderstorm, freeze frame, mosaic and fade-out.
- "Auto" is a dynamic resolution: k drops when the measured frame time breaks the
  budget, with hysteresis. Mind MAX_TEXTURE_SIZE and memory while doing so.

A3 HD sprites (setting "Pixel smoothing: off | on", default off):
- Upscaling at build time in assetkit, deterministic and reproducible: the
  converter version belongs in the cache key, `assets:verify` stays valid. A
  pixel-art algorithm (e.g. MMPX or ScaleFX/xBR-like from the paper) works on
  the keyed RGBA sources at ×2, for large images possibly ×4. Compare hard alpha edges and
  smoothed alpha and decide with justification; no color fringes may arise from the color
  key. Contours and collisions still come from the SD data,
  the simulation sees nothing of it.
- The output is a separate optional bundle alongside SD. The atlas JSON coordinates
  stay logical, the HD pages load with `TextureSource.resolution = 2` so the
  renderer stays unchanged. Only 2048 pages are guaranteed: so repack HD pages
  instead of assuming 4096 (or 4096 only after querying
  MAX_TEXTURE_SIZE).
- Measure the size (`bun run assets:report` before/after) and justify the encoding
  (lossless, near-lossless, lossy WebP, possibly AVIF). The HD bundle loads only with the
  option active and is not part of the mandatory offline installation. SD remains the
  fallback if HD is missing or does not fit.
- Full-screen images (loading screens, ending screens, DOVE story intro) run through the
  same pipeline or are omitted with justification. Videos are not part of the task.
- A real-time shader on the finished SD frame is only compared if the
  build-time variant fails on size. Its drawback (it also filters already
  filtered D3D layers) belongs in the report.

A4 Only check and report, do not implement: render interpolation via
`FixedStepLoop.alpha` for displays that do not run at 62.5 Hz. For DoveZ it is
probably not feasible because of the never-cleared back buffer.

## Part B — Max out performance

Goal: in HD at 60, 120 or 144 Hz no frame over budget, even on weak
hardware. In SD as little CPU and GPU load as possible (battery). In the steady
state there are no allocations per frame in the render path.

Suspected spots (prove each with the measurement tool first, then change):
1. DoveZ probably renders the stage twice per frame. game/Game.ts calls
   `app.render()` in its own ticker callback, and Pixi's TickerPlugin attaches `render`
   to the same ticker anyway with UPDATE_PRIORITY.LOW. `autoStart: false` does not prevent
   that, `app.ticker.start()` starts both. Count render calls and reduce to one;
   check DOVE likewise.
2. Frames without a new tick: DoveZ `Renderer.draw()` already skips them (protecting the
   back buffer), yet the stage is re-presented every frame. Render only when
   something has changed (tick, layout, setting, fade-out). In pause, menus and
   HTML screens, no continuous render loop.
3. Allocations per frame: candidates are the string keys per sprite in
   game-dove/render/FrameCache.ts, `o = {}` as a default in game-dovez/render/
   SpriteBatch.ts, keys in `Compositor.frame()`, `{ ...c, tex }` in
   `Compositor.expand()` and `Object.entries` in `Renderer.draw()`. The goal is zero,
   proven with heap sampling.
4. Render-target switches in the compositor: `play()` clears the layers before every capture
   and copy, `copy()` goes through `tmp`. Count switches and merge them where the
   order allows (the GPU copy itself is in C4).
5. Batching: measure draw calls per level. Batches break from atlas page switches,
   switches between additive and normal, masks (ticker), Graphics between sprites
   and invisible pool sprites that are iterated anyway. The draw
   order of the original stays, merging happens only within equal
   blend and layer boundaries. If needed, pack so that sprites drawn together
   lie on one page (asset rebuild via the pipeline).
6. Text (GDI, ticker) re-rasterize and upload only on change.
7. Level start: upload textures in advance (Pixi prepare/initSource), decoding off
   the main thread (createImageBitmap). No stutter in the first level frame;
   measure level switch time.
8. Shell HUD (shell/src/hud.ts, overlay.ts): write the DOM only on change, no
   layout read after a write in the same frame, `transform` instead of
   left/top for moving overlays, `contain` on overlays. Check style and layout per
   frame in the trace.
9. Check input latency: read input as late as possible before the tick,
   test `desynchronized`.
10. Simulation: investigate the spikes at p99 and max (GC? individual events?).
    Changes in sim/ only bit-identical and with `bun run perf` before/after.
11. Loading: measure time to playable (cold, warm, offline). Improve preload and code
    splitting within the budgets.

## Part C — More work on the GPU

Principle: the GPU only turns finished draw lists into pixels. Everything the
simulation computes stays on the CPU: positions, particles from sim/effects.ts
(they draw random numbers from `VbRnd`) and the environment lists from sim/envDraw.ts.
GPU floating point is not bit-identical across devices, and replays would then
no longer be reproducible. Every step is measured with `perf:render` (CPU time per
frame, draw calls, RT switches, uploads), and "Original" stays pixel-identical.

C1 Ensure hardware acceleration:
- Set `powerPreference: "high-performance"` so that laptops use the dedicated GPU.
- Detect software rendering at startup: a probe with
  `failIfMajorPerformanceCaveat` or the renderer string (WEBGL_debug_renderer_info:
  SwiftShader, llvmpipe, "Microsoft Basic Render Driver"). If it is software, the
  settings show a hint on how to turn on hardware acceleration in the browser,
  and "Auto" picks SD. Smoke and CI intentionally run with SwiftShader;
  there the hint must not block anything.

C2 WebGPU: Pixi 8 ships a WebGPU renderer (`preference: "webgpu"`, fallback
WebGL). Own shaders (StripMesh `GlProgram`, new shaders from A1/A3) then need a
WGSL version (`GpuProgram`). What is measured is the CPU time per frame (WebGPU has less
driver overhead) and image equality with WebGL in "Original" mode. WebGPU becomes the
default only with a clear gain and identical images.

C3 Keep transformations and batches on the GPU:
- Pixi 8 render groups (`isRenderGroup`) for layers that are moved
  as a whole (scrolling, shake via `screen.position`). The GPU then computes the
  layer transform, and unchanged layers do not rebuild their batches.
  Measure how often Pixi rebuilds the structure, and keep the pools so that
  the structure rarely changes.
- `ParticleContainer` for many similar sprites (sparks, stars, rain), when
  one atlas page and one blend mode suffice and the draw order stays the same.

C4 Copies and effects as GPU passes:
- `Compositor.copy()`: `renderer.renderTarget.copyToTexture` (present in Pixi 8.21)
  instead of the detour through `tmp` with a sprite render. Where source and target overlap
  (BltFast into itself), keep going through `tmp`, but only the affected rectangles
  instead of the full frame.
- Water, escape and distortion grid (StripMesh): vertex data in reused
  dynamic buffers, one upload per frame instead of per mesh.
- Final scaling, scanlines and pixel smoothing (A1, A3) as a shader, not as CSS
  or a CPU step.

C5 No synchronous GPU read-backs in the game: game/mosaic.ts reads the whole
800×600 image back with `renderer.extract.canvas` on every death and when opening the
pause. That blocks until the GPU is done. Then Canvas 2D shrinks the image, and
`toDataURL("image/webp")` encodes synchronously on the main thread. A stutter exactly at
the moment of death is to be expected, measure first. Better: shrink on the GPU into a
200×150 target, read back only that and encode asynchronously (`toBlob` or
`OffscreenCanvas.convertToBlob`, possibly in a worker). The tile must be ready before the
next loading screen and look visibly the same.

C6 GPU texture formats: KTX2/Basis and DDS (loaders present in Pixi 8) save VRAM and
upload time, but are lossy. So never for the "Original" mode, at most
for the HD bundle (A3) if VRAM and upload time at level start justify it and
the image comparison holds. Pixi loads the transcoders (JS + WASM) from
jsDelivr by default. CSP and offline operation forbid that, so they would have to be
shipped ourselves; only after asking. Mipmaps only where drawing is scaled down.

C7 Offload the main thread (only check and report with effort, prototype after
asking): Pixi 8 can render on an OffscreenCanvas in a worker via
`DOMAdapter.set(WebWorkerAdapter)`. But canvas, input, audio and the HTML HUD belong per
the GameModule contract to the shell. That would be a big rebuild; first measure how much
main-thread time per frame drawing even costs.

## Verification (after every step)

- `bun run check`. For sim/, also `bun run perf` before/after. For render and
  shell, `bun run smoke` and the screenshot comparison for "Original" (pixel-identical). For
  build changes, `bun run build && bun run budget`. For assets, locally
  `bun run assets:build`, then `bun run assets:verify`, commit the generated files.
- HD visual check: put comparison images SD/HD per scene into a non-committed folder
  and name them in the report.
- Switch between the games multiple times (resource counter). Toggle settings at
  runtime. Change window size, fullscreen and DPR. Simulate MAX_TEXTURE_SIZE 2048.
  Without WebGL the existing error message stays. With
  software rendering the hint from C1 appears, and WebGPU falls back cleanly to WebGL.
- Update the spec ("Rendering", "Optional modernizations") and README (rendering, scripts)
  accordingly. Add the setting texts in all languages of the shell (shell/src/texts.ts).

## What explicitly not

- No change to mechanics, timing or balance. No effects the original
  does not have (bloom, glow, extra particles).
- No AI upscaling with external models or services: not reproducible and
  not part of the build.
- No simulation computation on the GPU (compute shaders, particles, collisions),
  not even "just for effects", as long as it touches random numbers or sim state.
- The original default does not change without asking (exception per invariant 4).
- No micro-optimization without a measurement. Tests, budgets and limits in perf.test.ts
  are not weakened.

## Final report

- Measurement table before/after per scene: frame time p50/p99, render calls, draw calls
  and RT switches per frame, allocations per frame, level start and loading time,
  asset sizes SD/HD, each with the renderer (WebGL/WebGPU) and GPU string of the measurement.
- Implemented steps (one sentence each with files), new settings and their defaults
  with justification.
- Paths of the comparison images SD/HD.
- Discarded approaches with a measurement or reason (e.g. 4096 pages, real-time shader,
  WebGPU, compressed textures, worker rendering, interpolation).
- Open points (measurement on real devices) and suspected bugs found, not fixed outside
  the assignment.
- Result of check, smoke, budget, perf and perf:render.
```
