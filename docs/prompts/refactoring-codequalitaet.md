# Prompt: Refactoring für Codequalität

Vorlage für eine Agenten-Sitzung (z. B. Claude Code), die die Codequalität im
Repository verbessert, **ohne Verhalten zu ändern**. Den Block unten als Prompt
verwenden; den Fokus bei Bedarf auf ein Paket oder einen Hotspot eingrenzen.

---

```text
Du arbeitest im Monorepo amigo-clove (Bun-Workspaces, TypeScript strict, Browser-Port
von DOVE und DoveZ). Aufgabe: die Codequalität verbessern – reines Refactoring, keine
Verhaltensänderung, keine neuen Features.

## Unverrückbare Invarianten

1. Die Simulation bleibt bit-gleich. Alle Replays und State-Hashes müssen unverändert
   bestehen (packages/game-dove/test/replay.test.ts mit test/replays/*.json,
   packages/game-dovez/test/levelReplays.test.ts mit test/replays/levels.json,
   stateHash.ts). Erwartete Hashes, Replays oder Golden-Dateien NIE neu erzeugen oder
   anpassen. Bricht ein Replay, ist das Refactoring falsch – zurücknehmen, nicht den
   Test ändern.
2. Determinismus-Grenze: packages/*/src/sim/** importiert kein Pixi und nutzt weder
   window, document, performance, Math.random noch Date.now (.oxlintrc.json,
   tests/architecture.test.ts). Auch Iterationsreihenfolge, Ganzzahl-/Q16.16-Arithmetik,
   Rundung und die Reihenfolge von Rng-Aufrufen bleiben exakt gleich.
3. @clove/formats und @clove/core bleiben isomorph und I/O-frei (kein node:*, bun,
   sharp, fs …); Dateisystem und Encoder gehören nach @clove/assetkit.
4. Nicht anfassen: original-dove/, original-dovez/ (read-only Referenz), assets/
   (generiert), docs/measurements/dovez-levels.md (nur per `bun run levels:report`).
5. Keine neuen Abhängigkeiten, keine Änderungen an tsconfig-Strenge oder Lint-Regeln,
   keine neuen oxlint-disable / @ts-expect-error / @ts-ignore.
6. Öffentliche Schnittstellen zwischen Paketen (GameModule, GameHost.ui, Exporte in
   den index.ts) nur ändern, wenn alle Aufrufer im selben Schritt mitziehen.

## Vorgehen

1. Bestandsaufnahme (erst lesen, noch nichts ändern):
   - `bun install` und `bun run check` – Ausgangszustand muss grün sein; sonst stoppen
     und berichten.
   - Hotspots nach Größe und Komplexität, u. a. game-dovez/src/sim/world.ts (~1800
     Zeilen), enemies.ts, beam.ts, effects.ts, nova.ts, playerShots.ts,
     environment.ts, game-dove/src/sim/step.ts, shell/src/ui/UiHost.ts,
     shell/src/main.ts.
   - Duplikate zwischen game-dove und game-dovez (Menüs, HUD, Eingabe, Flow), die
     mechanikfrei sind und nach @clove/core gehören könnten.
2. Plan: priorisierte Liste konkreter, kleiner Refactorings mit Nutzen und Risiko je
   Punkt. Niedriges Risiko und hoher Nutzen zuerst; alles, was Sim-Reihenfolge
   berühren könnte, als Risiko markieren.
3. Umsetzung in kleinen, einzeln prüfbaren Schritten. Nach JEDEM Schritt
   `bun run check` (typecheck + lint + fmt:check + test). Bei Änderungen an sim/
   zusätzlich `bun run perf` vorher/nachher vergleichen; bei Shell-/UI-Änderungen
   `bun run smoke`, bei Build-relevanten Änderungen `bun run build && bun run budget`.
4. Ein Commit pro abgeschlossenem Schritt, Commit-Nachricht auf Deutsch im Stil der
   bisherigen Historie (kurzer Satz, was und warum).

## Was verbessert werden soll

- Lange Funktionen und Klassen in benannte, zusammenhängende Teile zerlegen; große
  Dateien entlang fachlicher Grenzen aufteilen (ohne Import-Zyklen, import/no-cycle).
- Duplizierten Code zusammenführen – aber nur, wo die Fälle wirklich gleich sind.
  Zwei Spiele mit ähnlich aussehender, aber verschiedener Original-Mechanik bleiben
  getrennt.
- Magische Zahlen benennen. Werte aus der Original-EXE behalten ihren Wert exakt und
  bekommen, wo vorhanden, einen Verweis auf docs/measurements/ bzw. docs/formats/.
- Typen schärfen: unnötige `as`-Casts, Non-Null-`!` und breite Typen durch präzise
  Typen, Narrowing oder diskriminierte Unions ersetzen.
- Toten Code, ungenutzte Exporte, Parameter und Zustände entfernen (vorher per Suche
  über das ganze Repo bestätigen, auch Tests und scripts/).
- Benennung vereinheitlichen; Bezeichner bleiben englisch, Kommentare deutsch wie im
  übrigen Code. Kommentare erklären das Warum (Bezug zum Original), nicht das Was.
- Tests nur hinzufügen, wo ein Refactoring sonst ungeschützt wäre; bestehende Tests
  nie abschwächen, überspringen oder löschen.

## Was ausdrücklich nicht

- Keine Mechanik-, Timing-, Balance- oder Darstellungsänderungen, auch keine
  „offensichtlichen“ Bugfixes – mutmaßliche Bugs nur im Bericht notieren.
- Kein Umformatieren ganzer Dateien ohne inhaltliche Änderung, keine reinen
  Stil-Umbenennungen quer durchs Repo.
- Keine spekulativen Abstraktionen (Interfaces/Generics für einen einzigen Aufrufer).
- Keine Mikro-Optimierungen, die Lesbarkeit kosten; keine Verschlechterung bei
  `bun run perf` oder `bun run budget`.

## Abschlussbericht

Am Ende kurz berichten:
- umgesetzte Schritte (je ein Satz, mit Dateien),
- bewusst nicht umgesetzte Kandidaten und warum (Risiko für Determinismus, zu groß),
- gefundene mutmaßliche Bugs oder Abweichungen vom Original (nicht behoben),
- Ergebnis von `bun run check` sowie ggf. perf/smoke/budget vorher/nachher.
```
