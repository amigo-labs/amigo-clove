# amigo-clove

Browser-Port der beiden deutschen Arcade-Shooter **DOVE** (1999–2003) und
**DoveZ – The Second Wave** (2004–2019) von Markus „Kauto" Madeja /
Intergenies — ein gemeinsamer Launcher, zwei Spiele, mit den Original-Assets.

## Stand

Meilensteine **M0** (Workspace, Tooling, CI) und **M1** (`@clove/formats`:
BMP-Decoder, DOVE-Levelformat mit byte-identischem Round-Trip,
Kontur-Kreuzvalidierung) sind umgesetzt. Offen aus M1 ist nur die Messung der
Original-Tickrate ([`docs/measurements/tick-rate.md`](docs/measurements/tick-rate.md)).

- **Design-Spec:** [`docs/specs/2026-09-07-dove-dovez-browser-port.md`](docs/specs/2026-09-07-dove-dovez-browser-port.md)
  — Formatbefunde, Architektur, Asset-Pipeline, Verifikationsstrategie,
  Meilensteine und Risiken.
- **DOVE-Levelformat:** [`docs/formats/dove-level-dat.md`](docs/formats/dove-level-dat.md)

## Entwicklung

Voraussetzung: [Bun](https://bun.sh) ≥ 1.3.11.

```sh
bun install
bun run check        # typecheck + lint + fmt:check + test
bun run typecheck    # tsc (strict, noUncheckedIndexedAccess)
bun run lint         # oxlint
bun run fmt          # oxfmt (schreibt), fmt:check prüft nur
bun run test         # bun test
```

## Verzeichnisse

| Pfad              | Inhalt                                       |
| ----------------- | -------------------------------------------- |
| `original-dove/`  | unveränderte Original-Installation DOVE 1.10 |
| `original-dovez/` | unveränderte Original-Installation DoveZ     |
| `packages/formats/` | `@clove/formats` — reine Parser/Serializer, ohne I/O |
| `tests/`          | repo-weite Architekturtests                  |
| `docs/`           | Spezifikationen und Formatdokumentation      |

Die Originalverzeichnisse sind **read-only Referenz** und werden nie verändert.

## Rechtliches

Für beide Spiele liegt **keine** Freeware- oder Weitergabe-Erlaubnis vor; bei
DoveZ ist Vervielfältigung ohne schriftliche Genehmigung ausdrücklich untersagt.
Dieses Repository ist deshalb **privat**. Eine Veröffentlichung setzt eine
schriftliche Freigabe des Autors voraus. Details im Abschnitt „Rechtlicher
Befund" der Design-Spec.
