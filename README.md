# amigo-clove

Browser-Port der beiden deutschen Arcade-Shooter **DOVE** (1999–2003) und
**DoveZ – The Second Wave** (2004–2019) von Markus „Kauto" Madeja /
Intergenies — ein gemeinsamer Launcher, zwei Spiele, mit den Original-Assets.

## Stand

Meilensteine **M0** (Workspace, Tooling, CI), **M1** (`@clove/formats`:
BMP-Decoder, DOVE-Levelformat mit byte-identischem Round-Trip,
Kontur-Kreuzvalidierung), **M2** (Asset-Pipeline DOVE: WebP, PCM16,
Level-JSON mit Konturen, Manifest, Cache, CI-Gate), **M3** (erstes
spielbares Level, deterministische Replays) und **M4** (DOVE vollständig:
alle Waffen, Beam, Options, Schild, alle 12 Level mit Levelskripten, 9 Bosse,
Soundeffekte und Musik, Menüs, Intro, Continue, Highscore, Abspann) sind
umgesetzt. Die Mechanik ist statisch aus der EXE bestimmt
([`docs/measurements/`](docs/measurements/)); der Abgleich am laufenden
Original steht noch aus ([`docs/playtest-checklist.md`](docs/playtest-checklist.md)).
Die Original-Tickrate (14 ms) ist aus der EXE hergeleitet:
[`docs/measurements/tick-rate.md`](docs/measurements/tick-rate.md).

- **Design-Spec:** [`docs/specs/2026-09-07-dove-dovez-browser-port.md`](docs/specs/2026-09-07-dove-dovez-browser-port.md)
  — Formatbefunde, Architektur, Asset-Pipeline, Verifikationsstrategie,
  Meilensteine und Risiken.
- **DOVE-Levelformat:** [`docs/formats/dove-level-dat.md`](docs/formats/dove-level-dat.md)
- **DOVE-Assets:** [`docs/formats/dove-assets.md`](docs/formats/dove-assets.md)

## Entwicklung

Voraussetzung: [Bun](https://bun.sh) ≥ 1.3.11.

```sh
bun install
bun run check        # typecheck + lint + fmt:check + test
bun run typecheck    # tsc (strict, noUncheckedIndexedAccess)
bun run lint         # oxlint
bun run fmt          # oxfmt (schreibt), fmt:check prüft nur
bun run test         # bun test

bun run assets:build   # Originale → assets/dove/ (inkrementell)
bun run assets:check   # CI-Gate: frischer Build ≡ committeter Baum
bun run assets:verify  # Hashes gegen das Manifest
bun run assets:report  # Größen je Bundle
bun run smoke          # Browser-Smoke-Test (baut den Launcher, Chromium)

bun run --cwd packages/shell dev   # Launcher unter http://localhost:5173
```

DOVE starten: `http://localhost:5173/#/dove` (NEO-ARTS-Logo, Titelmenü).
Steuerung wie im Original:

- **Menüs:** Pfeiltasten, Bestätigen mit `Enter`/`S`/`A`/Leertaste, `Esc` zurück.
- **Spiel:** Pfeiltasten, `S`/Leertaste Dauerfeuer (Bomben feuern mit),
  `A` Beam laden (Loslassen feuert), `D` Options-Richtung umkehren,
  `Q`/`W` Tempo, `Esc` Pause.

URL-Optionen: `nosound` (ohne Ton), `nointro=1`, `seed`, `shots=0|1|2`, `walls=1`;
direkt ins Level mit `level=<n>`, zum Testen `invincible=1`, `from=<Tick>`,
`lives`, `score`, Ausrüstung `colour`/`stage`/`options`/`bomb=1`/`shield=1`
und `screen=<Name>` (intro, getready, continue, highscore, outro, options,
levelselect, info, farewell) für Sichtprüfungen einzelner Bildschirme.

## Verzeichnisse

| Pfad              | Inhalt                                       |
| ----------------- | -------------------------------------------- |
| `original-dove/`  | unveränderte Original-Installation DOVE 1.10 |
| `original-dovez/` | unveränderte Original-Installation DoveZ     |
| `packages/formats/` | `@clove/formats` — reine Parser/Serializer, ohne I/O |
| `packages/core/`  | `@clove/core` — mechanikfreie Bausteine: Takt, Q16.16, Rng, Hash, Replay, Assets, `GameModule` |
| `packages/pixi-kit/` | `@clove/pixi-kit` — Pixi-Adapter: ganzzahliges Scaling, Texturen |
| `packages/game-dove/` | `@clove/game-dove` — DOVE: Simulation (`src/sim`, Pixi-frei), Renderer, Replays |
| `packages/shell/` | `@clove/shell` — Launcher (Vite) |
| `packages/assetkit/` | `@clove/assetkit` — Asset-Pipeline (Bun, sharp) |
| `assets/dove/`    | generierte DOVE-Assets + `manifest.json`, nie von Hand ändern |
| `tests/`          | repo-weite Architekturtests                  |
| `docs/`           | Spezifikationen und Formatdokumentation      |

Die Originalverzeichnisse sind **read-only Referenz** und werden nie verändert.
`.gitattributes` schließt sie von jeder Zeilenenden-Konvertierung aus. Beim
ersten Commit hatte Git 20 Textdateien bereits auf LF normalisiert; sie sind
per `scripts/originals-crlf.ts reconstruct` auf CRLF zurückgeführt. Gegen eine
echte Installation prüfen bzw. übernehmen:

```sh
bun scripts/originals-crlf.ts verify  <DOVE-Ordner> <DoveZ-Ordner>
bun scripts/originals-crlf.ts restore <DOVE-Ordner> <DoveZ-Ordner>
```

## Rechtliches

Für beide Spiele liegt **keine** Freeware- oder Weitergabe-Erlaubnis vor; bei
DoveZ ist Vervielfältigung ohne schriftliche Genehmigung ausdrücklich untersagt.
Dieses Repository ist deshalb **privat**. Eine Veröffentlichung setzt eine
schriftliche Freigabe des Autors voraus. Details im Abschnitt „Rechtlicher
Befund" der Design-Spec.
