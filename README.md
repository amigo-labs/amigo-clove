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
**M5** (Shell) ebenso: Launcher, Einstellungen (Sprache, Lautstärken,
Gamepad), Spielstand-Export/-Import, Ladebildschirm mit Bundle-Vorladen und
Offline-Betrieb per Service Worker. **M6** (DoveZ-Pakete und -Assets):
Parser für Pakete, `.r`-Konturen, Masken, Funktexte und Kampagne,
Asset-Pipeline mit Atlanten, Opus, Musik und Video, Debug-Seite
`#/dovez/debug/assets`. **M7** (DoveZ-`.dat` vollständig dekodiert) ist
fertig. **M8** (DoveZ-Engine) ist umgesetzt: `#/dovez` zeigt Logos, Intro und das
Hauptmenü (Neu mit Schiff und Namen, Laden, Optionen mit Tastenkonfiguration,
Bonus, Highscore) und spielt die Kampagne aus `Play.txt` mit Ladebildern,
Zwischensequenzen, Speicherbildschirm und Spielständen, Outro, Abspann und
Epilog; alle 27 Level mit Gegnern, Bossen, allen Waffen, Beam, Super-Nova, Coop,
Continue/Pause, Hintergründen, Wetter, Vibration und Russisch. Jedes Level ist
mit Bots bis zum Ende spielbar ([`docs/measurements/dovez-levels.md`](docs/measurements/dovez-levels.md)).
Die Original-Tickrate (16 ms) ist aus der EXE hergeleitet:
[`docs/measurements/tick-rate.md`](docs/measurements/tick-rate.md). **M9**
(Politur) läuft: DoveZ ist im Launcher und offline installierbar, es gibt
Sicherheits-Header, Größenbudget und Leistungstest; offen ist die schriftliche
Freigabe der Rechteinhaber und der Abgleich am Original (das nicht spielbar vorliegt).

- **Design-Spec:** [`docs/specs/2026-09-07-dove-dovez-browser-port.md`](docs/specs/2026-09-07-dove-dovez-browser-port.md)
  — Formatbefunde, Architektur, Asset-Pipeline, Verifikationsstrategie,
  Meilensteine und Risiken.
- **DOVE-Levelformat:** [`docs/formats/dove-level-dat.md`](docs/formats/dove-level-dat.md)
- **DOVE-Assets:** [`docs/formats/dove-assets.md`](docs/formats/dove-assets.md)
- **DoveZ-Formate und -Assets:** [`docs/formats/dovez-container.md`](docs/formats/dovez-container.md),
  [`docs/formats/dovez-assets.md`](docs/formats/dovez-assets.md)

## Entwicklung

Voraussetzung: [Bun](https://bun.sh) ≥ 1.3.11; zum Bauen der DoveZ-Assets
zusätzlich ffmpeg mit libopus und libvpx (Ubuntu 24.04: `apt install ffmpeg`).

```sh
bun install
bun run check        # typecheck + lint + fmt:check + test
bun run typecheck    # tsc (strict, noUncheckedIndexedAccess)
bun run lint         # oxlint
bun run fmt          # oxfmt (schreibt), fmt:check prüft nur
bun run test         # bun test

bun run assets:build   # Originale → assets/dove/, assets/dovez/ (inkrementell; --game=…)
bun run assets:verify  # CI-Gate ohne Konvertierung: Dateien ≡ Manifest ≡ Quellen/Optionen
bun run assets:check   # lokal, gründlich: frischer Build ≡ committeter Baum
bun run assets:report  # Größen je Bundle
bun run smoke          # Browser-Smoke-Test: Kaltstart, Shell, Offline-Start
bun run build          # statische Site nach packages/shell/dist/
bun run budget         # Größenbudget der gebauten Site (nach build)
bun run perf           # Simulationszeit je Tick, alle DoveZ-Level
bun run levels:report  # docs/measurements/dovez-levels.md neu erzeugen

bun run --cwd packages/shell dev   # Launcher unter http://localhost:5173
```

Der Launcher (`#/`) listet die Spiele, `#/settings` enthält Sprache,
Lautstärken, Darstellung (HUD, Skalierung, Rasterlinien), Bewegung, Steuerung
(Maus/Touch), zweite Tasten für DOVE, Gamepad, Spielstand-Export/-Import und
„Spieldaten installieren“ (nur im Build, der Dev-Server registriert keinen
Service Worker).
DOVE starten: `http://localhost:5173/#/dove` (NEO-ARTS-Logo, Titelmenü).

**Menüs als HTML:** Alles außerhalb der Level zeigt die Shell als HTML über bzw.
statt des Spielbilds — Titel- und Hauptmenü, Optionen, Levelauswahl, Info,
Highscores, Namenseingabe, Laden/Speichern, Ladebildschirm, Get Ready, Pause,
Continue und die Credits mit allen Beteiligten. Die Spiele beschreiben diese
Bildschirme als Daten (`GameHost.ui.show()`, `packages/core/src/shell/ui.ts`)
und behalten Ablauf, Regeln und Speicherstände; im Canvas laufen nur noch die
Level und die Original-Animationen (Logos, Story-Intro und -Abspann, Osterei).
DoveZ-Videos spielt die Shell als `<video>`. Bedienung überall: Pfeiltasten,
`Enter`/Leertaste bestätigen, `Esc` zurück; dazu Maus/Touch und Gamepad
(Steuerkreuz, A/Start bestätigen, B zurück).

Steuerung im Spiel wie im Original (DOVE): Pfeiltasten, `S`/Leertaste
Dauerfeuer (Bomben feuern mit), `A` Beam laden (Loslassen feuert), `D`
Options-Richtung umkehren, `Q`/`W` Tempo, `Esc` Pause.

Die vollständige Belegung (Tastatur, Gamepad, Maus) zeigt der Launcher je Spiel
unter „Steuerung“ zum Aufklappen und das Pausemenü jedes Spiels; DoveZ zeigt
dort die im Spiel umbelegten Tasten, DOVE die zweiten Tasten aus den
Einstellungen.

Weitere Modernisierungen (abschaltbar; ohne sie läuft die Simulation bit-gleich
wie im Original, siehe Spec „Optionale Modernisierungen“). Vorgabe ist das
Original bis auf HUD, Skalierung und Zeiger; der Zeiger wirkt erst, wenn Maus
oder Finger ihn benutzen:

- **Maus:** das Schiff folgt dem Zeiger, links Feuer, rechts Beam, Mitte
  Extrawaffe drehen (DOVE) bzw. Super-Nova (DoveZ), Rad Tempo (DOVE) bzw.
  Extrawaffe (DoveZ). Pfeiltasten übernehmen jederzeit.
- **Touch:** Ziehen lenkt relativ und feuert, ein zweiter Finger lädt den
  Beam; Steuerkreuz, OK und Pause erscheinen im Overlay.
- **HUD:** Vorgabe ist das HTML-HUD der Shell neben bzw. unter dem Spielfeld
  mit Boss-Lebensbalken; das Original-HUD lässt sich zurückholen.
- **Darstellung:** Vollbild (`Alt+Enter` oder ⛶), Skalierung fensterfüllend
  scharf (Vorgabe) oder weich bzw. ganzzahlig (1:1-Pixel), Rasterlinien.
- **Komfort:** DOVE pausiert bei Fokusverlust; zweite Tasten je Aktion für
  DOVE; in DoveZ steuert das zweite Gamepad Spieler 2.

URL-Optionen: `nosound` (ohne Ton), `nointro=1`, `seed`, `shots=0|1|2`, `walls=1`;
direkt ins Level mit `level=<n>`, zum Testen `invincible=1`, `from=<Tick>`,
`lives`, `score`, Ausrüstung `colour`/`stage`/`options`/`bomb=1`/`shield=1`
und `screen=<Name>` (intro, getready, continue, highscore, outro, credits,
options, levelselect, info, farewell) für Sichtprüfungen einzelner Bildschirme.

### Site ausliefern

`bun run build` erzeugt unter `packages/shell/dist/` eine rein statische Site
mit relativen Pfaden — sie läuft unter jedem Unterpfad ohne Server-Rewrite
(Hash-Routing). Für den Service Worker braucht es HTTPS (oder `localhost`).
Spielassets sind content-gehasht und dürfen unbegrenzt gecacht werden
(`Cache-Control: immutable`); `index.html`, `sw.js` und die
`manifest.json`-Dateien nicht. Der Build schreibt diese Regeln als `_headers`.

Öffentlich ausgeliefert wird über **Cloudflare Workers Builds** (nur statische
Assets, kein Worker-Skript): `wrangler.jsonc` im Wurzelverzeichnis baut mit
`bun install --frozen-lockfile && bun run build` und lädt
`packages/shell/dist/` hoch; jeder PR bekommt eine Vorschau. Lokal prüfen:
`npx wrangler dev` (liefert die Site samt `_headers` unter `localhost:8787`).

## Verzeichnisse

| Pfad              | Inhalt                                       |
| ----------------- | -------------------------------------------- |
| `original-dove/`  | unveränderte Original-Installation DOVE 1.10 |
| `original-dovez/` | unveränderte Original-Installation DoveZ     |
| `packages/formats/` | `@clove/formats` — reine Parser/Serializer, ohne I/O |
| `packages/core/`  | `@clove/core` — mechanikfreie Bausteine: Takt, Q16.16, Rng, Hash, Replay, Assets, i18n, Spielstanddatei, `GameModule` |
| `packages/pixi-kit/` | `@clove/pixi-kit` — Pixi-Adapter: ganzzahliges Scaling, Texturen |
| `packages/game-dove/` | `@clove/game-dove` — DOVE: Simulation (`src/sim`, Pixi-frei), Renderer, Replays |
| `packages/game-dovez/` | `@clove/game-dovez` — DoveZ (M8 im Aufbau): `#/dovez` Logos, Intro, Hauptmenü und Kampagne (`nointro=1` gleich ins Menü, `video=0` ohne Videos); ohne Menü `step=<n>` ab Anweisung n, `load=<1…21>` Spielstand, `level=…&from=…` ein einzelnes Level; Esc Pause, ohne Leben Continue (`screen=continue\|pause\|save\|credits\|love` zur Sichtprüfung); Debug-Ansichten |
| `packages/shell/` | `@clove/shell` — Launcher (Vite): Routing, Einstellungen, Gamepad, Spielstände, Service Worker |
| `packages/assetkit/` | `@clove/assetkit` — Asset-Pipeline (Bun, sharp) |
| `assets/dove/`, `assets/dovez/` | generierte Assets + `manifest.json`, nie von Hand ändern |
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
Repository und Site sind seit dem 28.09.2026 auf Entscheidung des
Repository-Inhabers **öffentlich**. Der rechtliche Befund (Abschnitt
„Rechtlicher Befund" der Design-Spec) bleibt davon unberührt.
