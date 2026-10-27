# Prompt: Refactoring for code quality

Template for an agent session (e.g. Claude Code) that improves the code quality in the
repository **without changing behavior**. Use the block below as the prompt; narrow
the focus to one package or hotspot if needed.

---

```text
You are working in the monorepo amigo-clove (Bun workspaces, TypeScript strict, browser port
of DOVE and DoveZ). Task: improve the code quality – pure refactoring, no
behavior change, no new features. Guideline: simplify wherever possible,
and build nothing yourself that an already existing library or platform API
can already do.

## Immovable invariants

1. The simulation stays bit-identical. All replays and state hashes must pass unchanged
   (packages/game-dove/test/replay.test.ts with test/replays/*.json,
   packages/game-dovez/test/levelReplays.test.ts with test/replays/levels.json,
   stateHash.ts). NEVER regenerate or adjust expected hashes, replays or golden files.
   If a replay breaks, the refactoring is wrong – revert it, do not change the test.
2. Determinism boundary: packages/*/src/sim/** imports no Pixi and uses neither
   window, document, performance, Math.random nor Date.now (.oxlintrc.json,
   tests/architecture.test.ts). Iteration order, integer/Q16.16 arithmetic,
   rounding and the order of Rng calls also stay exactly the same.
3. @clove/formats and @clove/core stay isomorphic and I/O-free (no node:*, bun,
   sharp, fs …); file system and encoders belong in @clove/assetkit.
4. Do not touch: original-dove/, original-dovez/ (read-only reference), assets/
   (generated), docs/measurements/dovez-levels.md (only via `bun run levels:report`).
5. No new dependencies, no changes to tsconfig strictness or lint rules,
   no new oxlint-disable / @ts-expect-error / @ts-ignore.
6. Public interfaces between packages (GameModule, GameHost.ui, exports in
   the index.ts) only change if all callers move along in the same step.

## Approach

1. Inventory (read first, change nothing yet):
   - `bun install` and `bun run check` – the baseline must be green; otherwise stop
     and report.
   - Hotspots by size and complexity, including game-dovez/src/sim/world.ts (~1800
     lines), enemies.ts, beam.ts, effects.ts, nova.ts, playerShots.ts,
     environment.ts, game-dove/src/sim/step.ts, shell/src/ui/UiHost.ts,
     shell/src/main.ts.
   - Duplicates between game-dove and game-dovez (menus, HUD, input, flow) that
     are mechanics-free and could belong in @clove/core.
   - Inventory of the existing building blocks (see "Use existing libraries") and a
     list of the spots that reimplement something from them by hand.
2. Plan: prioritized list of concrete, small refactorings with benefit and risk per
   item. Low risk and high benefit first; mark everything that could touch sim
   order as a risk.
3. Implementation in small, individually verifiable steps. After EVERY step
   `bun run check` (typecheck + lint + fmt:check + test). For changes to sim/,
   also compare `bun run perf` before/after; for shell/UI changes
   `bun run smoke`, for build-relevant changes `bun run build && bun run budget`.
4. One commit per completed step, commit message in German in the style of the
   previous history (a short sentence, what and why).

## Simplify where possible

For each file, ask: can this be done with less code, less state, less
indirection – with exactly the same behavior? If so, simplify. Typical cases:
- replace nested if/else with early returns, guard clauses or a lookup table;
  merge duplicate conditions,
- do not store derived state, compute it instead (unless it is part of the
  sim state that goes into hash/snapshot/replay),
- eliminate unnecessary intermediate variables, wrapper functions, single-caller
  helper functions, classes without state and options that are never set differently,
- replace long parameter lists with an existing object or an existing type,
  flag parameters with two clearly named functions,
- replace own loops with standard methods (map/filter/some/find/findLast,
  Array.from, Object.entries …) – in sim/ only if the order and number of
  calls stay identical and `bun run perf` does not get worse; hot loops
  in sim/ stay as they are when in doubt.
The result must be shorter or clearer, ideally both. A simplification
that only moves code is not one.

## Use existing libraries

Available are (add no new ones):
- own packages: @clove/core (tick/loop, Q16.16 math, Rng, hash, replay, assets,
  i18n, input, save-game file, GameModule, shell UI building blocks), @clove/formats
  (parser/serializer), @clove/pixi-kit (scaling, textures), @clove/audio,
- external: pixi.js 8 (Container, Sprite, Ticker, Assets, Rectangle, Matrix …),
  chiptune3 (music), sharp (image conversion in assetkit), vite (build),
  playwright-core (smoke),
- runtime: Bun APIs (only in assetkit, scripts/, tests: Bun.file, Glob, Bun.hash,
  CryptoHasher, bun:test matchers), web platform (DataView, TextDecoder/TextEncoder,
  URLSearchParams, structuredClone, Web Audio, Gamepad API, AbortController,
  Element.animate …), ES2023 standard library.

Approach:
1. For each package, check which helper functions reimplement something that one of these
   building blocks can already do (e.g. own clamp/hash/clone/byte reader/query parser/timer,
   own fixed-point or Rng variants alongside @clove/core, own texture or
   scaling logic alongside @clove/pixi-kit, own parsers alongside @clove/formats,
   own event/ticker logic alongside Pixi).
2. Replace only if the semantics are provably identical – check edge cases like
   rounding, overflow, endianness, order, prototypes when cloning (structuredClone
   loses classes), shared references and error behavior. When in doubt, write
   a small comparison test that checks the old and new variant against each other
   before the old one is deleted.
3. In sim/ only bit-identity counts: do not swap platform functions whose result
   depends on the engine or floating point (Math.sin/cos/pow, Intl, sorting with an
   unstable comparison) for deliberately integer in-house implementations.
4. Report the reverse: spots where an existing library would fit but is not used because
   it would pull Pixi/DOM into sim/ or bring I/O into core/formats – that stays as is.

## What should be improved

- Break long functions and classes into named, cohesive parts; split large
  files along domain boundaries (without import cycles, import/no-cycle).
- Merge duplicated code – but only where the cases are truly the same.
  Two games with similar-looking but different original mechanics stay separate.
- Name magic numbers. Values from the original EXE keep their exact value and
  get, where available, a reference to docs/measurements/ or docs/formats/.
- Sharpen types: replace unnecessary `as` casts, non-null `!` and broad types with
  precise types, narrowing or discriminated unions.
- Remove dead code, unused exports, parameters and state (confirm beforehand with a search
  over the whole repo, including tests and scripts/).
- Unify naming; identifiers stay English, comments German as in the rest of the code.
  Comments explain the why (relation to the original), not the what.
- Add tests only where a refactoring would otherwise be unprotected; never weaken,
  skip or delete existing tests.

## What explicitly not

- No mechanics, timing, balance or rendering changes, no "obvious" bug fixes
  either – note suspected bugs only in the report.
- No reformatting of whole files without a substantive change, no pure
  style renames across the repo.
- No speculative abstractions (interfaces/generics for a single caller).
- No micro-optimizations that cost readability; no regression in
  `bun run perf` or `bun run budget`.

## Final report

Report briefly at the end:
- implemented steps (one sentence each, with files) and the net line balance
  (`git diff --stat` against the baseline),
- replaced in-house implementations with the library/API that now takes them over, as well as
  checked but deliberately kept in-house implementations with justification,
- deliberately not implemented candidates and why (risk to determinism, too large),
- suspected bugs or deviations from the original found (not fixed),
- result of `bun run check` and, if applicable, perf/smoke/budget before/after.
```
