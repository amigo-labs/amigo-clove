# amigo-clove

Browser-Port der beiden deutschen Arcade-Shooter **DOVE** (1999–2003) und
**DoveZ – The Second Wave** (2004–2019) von Markus „Kauto" Madeja /
Intergenies — ein gemeinsamer Launcher, zwei Spiele, mit den Original-Assets.

## Stand

Meilensteine **M0** (Workspace, Tooling, CI), **M1** (`@clove/formats`:
BMP-Decoder, DOVE-Levelformat mit byte-identischem Round-Trip,
Kontur-Kreuzvalidierung), **M2** (Asset-Pipeline DOVE: WebP, PCM16,
Level-JSON mit Konturen, Manifest, Cache, CI-Gate), **M3** (erstes
spielbares Level, Mechanik statisch aus der EXE bestimmt, deterministische
Replays) und **M4** (DOVE vollständig: alle Waffen, Bosse, Levelskripte,
Menüs, Highscore, Audio — der Abgleich am Original steht noch aus, siehe
[`docs/playtest-checklist.md`](docs/playtest-checklist.md)) sind umgesetzt.
**M5** (Shell) ebenso: Launcher, Einstellungen (Sprache, Lautstärken,
Gamepad), Spielstand-Export/-Import, Ladebildschirm mit Bundle-Vorladen und
Offline-Betrieb per Service Worker. Die Original-Tickrate (14 ms) ist aus der EXE hergeleitet:
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
bun run smoke          # Browser-Smoke-Test: Kaltstart, Shell, Offline-Start
bun run build          # statische Site nach packages/shell/dist/

bun run --cwd packages/shell dev   # Launcher unter http://localhost:5173
```

Der Launcher (`#/`) listet die Spiele, `#/settings` enthält Sprache,
Lautstärken, Gamepad, Spielstand-Export/-Import und „Spieldaten installieren“
(nur im Build, der Dev-Server registriert keinen Service Worker).
DOVE direkt ins Level: `http://localhost:5173/#/dove?level=1`. Steuerung wie im
Original — Pfeiltasten, `S`/Leertaste Dauerfeuer, `Q`/`W` Tempo, `Esc` Pause.
Weitere URL-Optionen: `seed`, `shots=0|1|2`, `walls=1`, zum Testen
`invincible=1` und `from=<Tick>`.

### Site ausliefern

`bun run build` erzeugt unter `packages/shell/dist/` eine rein statische Site
mit relativen Pfaden — sie läuft unter jedem Unterpfad ohne Server-Rewrite
(Hash-Routing). Für den Service Worker braucht es HTTPS (oder `localhost`).
Spielassets sind content-gehasht und dürfen unbegrenzt gecacht werden
(`Cache-Control: immutable`); `index.html`, `sw.js` und die
`manifest.json`-Dateien nicht. Veröffentlichen nur mit Freigabe, siehe unten.

## Verzeichnisse

| Pfad              | Inhalt                                       |
| ----------------- | -------------------------------------------- |
| `original-dove/`  | unveränderte Original-Installation DOVE 1.10 |
| `original-dovez/` | unveränderte Original-Installation DoveZ     |
| `packages/formats/` | `@clove/formats` — reine Parser/Serializer, ohne I/O |
| `packages/core/`  | `@clove/core` — mechanikfreie Bausteine: Takt, Q16.16, Rng, Hash, Replay, Assets, i18n, Spielstanddatei, `GameModule` |
| `packages/pixi-kit/` | `@clove/pixi-kit` — Pixi-Adapter: ganzzahliges Scaling, Texturen |
| `packages/game-dove/` | `@clove/game-dove` — DOVE: Simulation (`src/sim`, Pixi-frei), Renderer, Replays |
| `packages/shell/` | `@clove/shell` — Launcher (Vite): Routing, Einstellungen, Gamepad, Spielstände, Service Worker |
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
