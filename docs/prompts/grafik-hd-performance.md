# Prompt: Grafik auf HD, Performance ausreizen

Vorlage für eine Agenten-Sitzung (z. B. Claude Code), die die Darstellung beider
Spiele auf HD-Niveau bringt und die Performance bis ans Limit treibt, **ohne die
Simulation und ohne den Original-Look in der Vorgabe zu ändern**. Den Block unten
als Prompt verwenden; bei Bedarf auf Teil A (HD), Teil B (Performance) oder Teil C
(mehr Arbeit auf die GPU) bzw. auf ein Spiel eingrenzen. Teil B zuerst ist die
sichere Reihenfolge: er schafft die Messwerkzeuge und das Budget, das HD danach
verbraucht.

---

```text
Du arbeitest im Monorepo amigo-clove (Bun-Workspaces, TypeScript strict, Pixi.js 8,
Browser-Port von DOVE und DoveZ). Aufgabe: die Grafik beider Spiele auf HD bringen
und die Performance bis zum Letzten ausreizen. Alles Neue ist abschaltbar; ohne die
neuen Optionen bleiben Simulation und Bild exakt wie heute.

## Ausgangslage (vor Beginn selbst nachprüfen)

- Logische Auflösung: DOVE 640×480 (DirectDraw7-Blits, Pixel-Art), DoveZ 800×600
  (Direct3D-Quads mit Drehung, Skalierung, Farbe, Alpha, additiv, bilinear, dazu
  DirectDraw-Blits).
- packages/pixi-kit/src/ScreenRoot.ts: Pixi mit `resolution: 1`, `antialias: false`,
  `roundPixels: true`, `scaleMode: "nearest"`. Der Canvas behält die logische Größe
  und wird per CSS vergrößert (`image-rendering: pixelated`). Vorgabe ist `fit`
  (bruchteilig): Der Browser vergrößert nearest, also werden die Pixel ungleich breit.
  Auf HiDPI-Displays (devicePixelRatio > 1) kommt kein einziges Gerätepixel aus Pixi.
- DoveZ zeichnet wie das Original in einen nie gelöschten Backbuffer
  (render/Compositor.ts, RenderTexture 800×600, Erfassen/Kopieren in Pixelkoordinaten,
  64×64-Ziele `blur`/`lens`). Weitere Ziele: game/screenTargets.ts, Mosaik, loveView.ts.
- Assets: BMP → WebP lossless (packages/assetkit/src/stages/image.ts, atlas.ts;
  Atlasseiten 2048², Padding 1, Alpha nur 0/255). Größe: DOVE ≈ 11 MB, DoveZ ≈ 142 MB.
- Gezeichnet wird bereits auf der GPU (Pixi mit WebGL, `preference: "webgl"`, eigener
  Shader in render/StripMesh.ts). Auf der CPU liegen Zeichenlisten, Sprite-Pools,
  Vertex-Uploads je Frame, Text-Rasterung und die Mosaik-Momentaufnahmen
  (game/mosaic.ts: synchrones Zurücklesen von der GPU, Canvas 2D, `toDataURL`).
- Gemessen wird bisher nur die Simulation (`bun run perf`, im Mittel ≈ 0,2 ms je Tick
  bei 16 ms Takt, p99 bis ≈ 2,2 ms; game-dovez/test/perf.test.ts). Die Zeichenzeit ist
  nicht gemessen (Spec, M9 offen).

## Unverrückbare Invarianten

1. Die Simulation bleibt bit-gleich. Alle Replays und State-Hashes müssen unverändert
   bestehen (game-dove/test/replay.test.ts mit test/replays/*.json,
   game-dovez/test/levelReplays.test.ts mit test/replays/levels.json, stateHash.ts).
   Erwartete Hashes, Replays oder Golden-Dateien NIE neu erzeugen oder anpassen.
2. Determinismus-Grenze: packages/*/src/sim/** importiert kein Pixi und nutzt weder
   window, document, performance, Math.random noch Date.now (.oxlintrc.json,
   tests/architecture.test.ts). Rendering liest die Welt nur, es verändert sie nie.
3. Logische Koordinaten bleiben die Wahrheit. Spiel, HUD-Overlay (`--px`,
   `--game-x/y`, LAYOUT_EVENT) und Zeiger rechnen in 640×480 bzw. 800×600.
   Achtung: shell/src/pointer.ts, shell/src/overlay.ts und pixi-kit `viewHeight` lesen
   heute `canvas.width/height` als logische Größe. Bei größerem Backing-Store bräche
   die Zeigersteuerung, und das Zeigerziel ist Teil der Sim-Eingabe (Replay
   `level1-pointer`). Die logische Größe deshalb über eine ausdrückliche API in
   pixi-kit liefern, nie aus `canvas.width` ableiten.
4. Regeln der Spec „Optionale Modernisierungen“: abschaltbar, Vorgabe Original, ohne
   den Zusatz bit-gleich. Mit der Einstellung „Original“ bleibt das Bild
   pixelgleich zum Ausgangsstand (Screenshot-Vergleich, siehe Verifikation).
   Reine Schärfe ohne Look-Änderung (Gerätepixel, saubere Endskalierung) zählt wie
   die Skalierung zu den Ausnahmen und darf Vorgabe werden, mit Begründung im
   Bericht. Alles, was den Look ändert (Pixel-Art-Upscaling), bleibt Vorgabe aus.
5. Bitmap-Font-Regel (Spec „Rendering“): kein Pixi-Text mit Canvas-Font, wo das
   Original Bitmap-Fonts hat. DoveZ-GDI-Text (game/gdi.ts) bleibt Arial, darf aber
   in HD-Auflösung gerastert werden.
6. Nicht anfassen: original-dove/, original-dovez/. Dateien in assets/ entstehen nur
   über `bun run assets:build`, nie von Hand. docs/measurements/dovez-levels.md
   entsteht nur über `bun run levels:report`.
7. Keine neuen Laufzeit-Abhängigkeiten, neue Bau-Abhängigkeiten nur nach Rückfrage.
   tsconfig-Strenge und Lint-Regeln bleiben, keine neuen oxlint-disable,
   @ts-expect-error oder @ts-ignore. Upscaling-Algorithmen selbst implementieren
   (nach Paper) oder Code mit MIT-, BSD- oder Public-Domain-Lizenz übernehmen und die
   Herkunft nennen. Kein GPL-/LGPL-Code (z. B. xBRZ, die HQx-Referenz).
8. `dispose()` räumt alles hart ab, auch HD-Texturen und größere Render-Ziele. Der
   Ressourcenzähler der Shell darf nach einem Spielwechsel nichts melden.
9. Budgets halten: JS ≤ 450 KB gzip gesamt, ≤ 120 KB je Bundle, index.html ≤ 20 KB
   (`bun run budget`). `bun run perf` darf nicht schlechter werden, und
   `bun run assets:verify` bleibt grün.

## Vorgehen

0. Bestandsaufnahme und Ausgangsmessung (noch nichts am Verhalten ändern):
   - `bun install`, `bun run check`, `bun run smoke`, `bun run build && bun run budget`
     und `bun run perf` müssen grün sein, sonst stoppen und berichten.
   - Erster Commit ist das Messwerkzeug `bun run perf:render` (scripts/, playwright-core
     gegen den Build). Es fährt feste Szenen an: DOVE z. B. `#/dove?level=<n>&nointro=1
     &invincible=1&seed=1`, DoveZ `#/dovez?level=<slug>&from=<tick>&invincible=1`, je
     mit Dauerfeuer und effektreichen Stellen (Beam, Nova, Wasser, Gewitter, Bosse).
     Je Szene misst es Frame-Zeit p50/p95/p99/max, den Anteil der Frames über
     16,7 ms, die Zeit im Frame-Callback (getrennt nach Simulation und Zeichnen),
     Render-Aufrufe, Draw-Calls und Render-Target-Wechsel je Frame, Textur-Uploads,
     den JS-Heap-Verlauf mit GC-Pausen (CDP) und Long Tasks. Dazu kommt die URL-Option
     `stats=1` mit einer kleinen Laufzeitanzeige (eigener Code, kein Paket).
   - Headless-Chromium rendert mit SwiftShader, absolute Zeiten sind dort nur
     relativ vergleichbar. Optimiert wird deshalb auf geräteunabhängige Größen: Draw-
     Calls, RT-Wechsel, Allokationen und Uploads je Frame. Wenn möglich zusätzlich mit
     GPU messen und den Nutzer um Zahlen von einem echten Gerät bitten.
   - Referenzbilder für den Modus „Original“: feste Szenen bei fester Tickzahl (seed,
     from, nointro, `screen=…` für Bildschirme) vor jeder Änderung aufnehmen. Zuerst
     prüfen, ob zwei Aufnahmen bytegleich sind. Wenn ja, wird daraus ein Vergleich
     (Erweiterung von smoke.ts oder eigenes Skript), der nur Hashes committet, keine
     großen PNGs.
1. Plan: eine priorisierte Liste konkreter Schritte, je mit gemessenem oder
   begründetem Gewinn, Risiko und betroffenen Dateien. Schnelle Gewinne ohne Look-
   Änderung kommen zuerst (Teil B, dann C und A1), danach A2 und A3.
2. Umsetzung in kleinen, einzeln prüfbaren Schritten mit je einem Commit auf Deutsch
   im Stil der Historie. Jeder Performance-Commit nennt seine Zahl vorher und
   nachher. Eine Optimierung ohne messbaren Effekt, die den Code komplexer macht,
   wird zurückgenommen.

## Teil A — Grafik auf HD

A1 Ausgabe in Gerätepixeln (schärfer, gleicher Look):
- Der Backing-Store des Canvas bekommt echte Gerätepixel (CSS-Größe ×
  devicePixelRatio, ResizeObserver mit `devicePixelContentBoxSize`, DPR-Wechsel per
  matchMedia beim Verschieben zwischen Monitoren), statt den Browser per CSS
  vergrößern zu lassen.
- Die Endskalierung übernimmt die GPU: `integer` bleibt nearest und damit pixelgleich
  zu heute. `fit` wird „sharp bilinear“ (ganzzahlig nearest vorvergrößern, nur den
  Rest linear), damit es keine ungleich breiten Pixel mehr gibt. `smooth` bleibt
  linear.
- Rasterlinien optional als Shader, der exakt auf die Spielzeilen fällt (statt der
  CSS-Schicht), aber nur wenn er gleich gut oder besser aussieht.
- Vollbild, Fenstergröße, `setView` (Feld ohne HUD) und HTML-HUD verhalten sich wie
  vorher.

A2 Interne Renderauflösung (Einstellung „Auflösung: Original | HD | Auto“):
- Pixi rendert mit Faktor k (ganzzahlig 2…4, passend zur Anzeigegröße). Alle Render-
  Ziele (Compositor `bb`/`tmp`/`still`, ScreenTargets, Mosaik, LoveView) bekommen
  dieselbe Auflösung. Capture- und Copy-Rechtecke (BltFast-Kopien, Wasser- und
  Fluchtstreifen) bleiben logisch und werden intern mit k multipliziert. `blur` und
  `lens` (64×64, bilinear gestreckt) behalten ihre Originalgröße, weil der Look daran
  hängt.
- Gewinnen sollen vor allem die DoveZ-Effekte: gedrehte und skalierte D3D-Quads,
  additive Effekte, Beam, Nova, `balken`-Linien, Partikel und GDI-Text werden in
  Zielauflösung gerastert statt aus 800×600 vergrößert. Blits liegen weiter auf dem
  logischen Raster, D3D-Quads dürfen subpixelgenau liegen. Vorher prüfen, was Pixi 8
  mit `roundPixels` bei resolution > 1 macht.
- Sichtprüfung je Zeichenstelle (Renderer.ts `ORDER`) in SD und HD: Jeder Effekt
  muss gleich aussehen, nur schärfer. Das gilt besonders für Schleier und Spuren im
  nie gelöschten Backbuffer, Wasser, Gewitter, Standbild, Mosaik und Abblende.
- „Auto“ ist eine dynamische Auflösung: k sinkt, wenn die gemessene Frame-Zeit das
  Budget reißt, mit Hysterese. Dabei MAX_TEXTURE_SIZE und Speicher beachten.

A3 HD-Sprites (Einstellung „Pixel-Glättung: aus | an“, Vorgabe aus):
- Upscaling zur Bauzeit in assetkit, deterministisch und reproduzierbar: Die
  Konverterversion gehört in den Cache-Schlüssel, `assets:verify` bleibt gültig. Ein
  Pixel-Art-Algorithmus (z. B. MMPX oder ScaleFX/xBR-artig nach Paper) arbeitet auf
  den gekeyten RGBA-Quellen mit ×2, für große Bilder ggf. ×4. Harte Alpha-Kanten und
  geglättete Alpha vergleichen und begründet entscheiden; es dürfen keine Farbsäume
  aus dem Colorkey entstehen. Konturen und Kollisionen kommen weiter aus den SD-Daten,
  die Simulation sieht davon nichts.
- Die Ausgabe ist ein eigenes optionales Bundle neben SD. Die Atlas-JSON-Koordinaten
  bleiben logisch, die HD-Seiten laden mit `TextureSource.resolution = 2`, damit der
  Renderer unverändert bleibt. Garantiert sind nur 2048er-Seiten: HD-Seiten
  deshalb neu packen, statt 4096 vorauszusetzen (oder 4096 nur nach Abfrage von
  MAX_TEXTURE_SIZE).
- Größe messen (`bun run assets:report` vorher/nachher) und die Kodierung begründen
  (lossless, near-lossless, lossy WebP, ggf. AVIF). Das HD-Bundle lädt nur bei
  aktiver Option und ist nicht Teil der Pflicht-Offline-Installation. SD bleibt der
  Fallback, wenn HD fehlt oder nicht passt.
- Vollbilder (Ladebilder, Endbilder, DOVE-Story-Intro) laufen durch dieselbe
  Pipeline oder werden begründet ausgelassen. Videos sind nicht Teil der Aufgabe.
- Ein Echtzeit-Shader auf dem fertigen SD-Frame wird nur verglichen, falls die
  Bauzeit-Variante an der Größe scheitert. Sein Nachteil (er filtert auch schon
  gefilterte D3D-Ebenen) gehört in den Bericht.

A4 Nur prüfen und berichten, nicht umsetzen: Render-Interpolation über
`FixedStepLoop.alpha` für Bildschirme, die nicht mit 62,5 Hz laufen. Bei DoveZ ist
sie wegen des nie gelöschten Backbuffers wahrscheinlich nicht machbar.

## Teil B — Performance ausreizen

Ziel: in HD bei 60, 120 oder 144 Hz kein Frame über Budget, auch auf schwacher
Hardware. In SD möglichst wenig CPU- und GPU-Last (Akku). Im eingeschwungenen
Zustand gibt es keine Allokationen je Frame im Render-Pfad.

Verdachtsstellen (jede erst mit dem Messwerkzeug belegen, dann ändern):
1. DoveZ rendert die Stage vermutlich zweimal je Frame. game/Game.ts ruft im eigenen
   Ticker-Callback `app.render()` auf, und Pixis TickerPlugin hängt `render` ohnehin
   mit UPDATE_PRIORITY.LOW an denselben Ticker. `autoStart: false` verhindert das
   nicht, `app.ticker.start()` startet beides. Render-Aufrufe zählen und auf einen
   reduzieren; DOVE ebenso prüfen.
2. Frames ohne neuen Tick: DoveZ `Renderer.draw()` überspringt sie bereits (Schutz des
   Backbuffers), die Stage wird trotzdem jeden Frame neu präsentiert. Nur rendern, wenn
   sich etwas geändert hat (Tick, Layout, Einstellung, Abblende). In Pause, Menüs und
   HTML-Bildschirmen keine Dauer-Renderschleife.
3. Allokationen je Frame: Kandidaten sind die String-Schlüssel je Sprite in
   game-dove/render/FrameCache.ts, `o = {}` als Vorgabe in game-dovez/render/
   SpriteBatch.ts, Schlüssel in `Compositor.frame()`, `{ ...c, tex }` in
   `Compositor.expand()` und `Object.entries` in `Renderer.draw()`. Ziel ist null,
   belegt mit Heap-Sampling.
4. Render-Target-Wechsel im Compositor: `play()` leert die Ebenen vor jedem Erfassen
   und Kopieren, `copy()` geht über `tmp`. Wechsel zählen und zusammenlegen, wo die
   Reihenfolge es erlaubt (die GPU-Kopie selbst steht in C4).
5. Batching: Draw-Calls je Level messen. Batches brechen durch Wechsel der Atlasseite,
   Wechsel zwischen additiv und normal, Masken (Laufband), Graphics zwischen Sprites
   und unsichtbare Pool-Sprites, die trotzdem durchlaufen werden. Die Zeichen-
   reihenfolge des Originals bleibt, zusammengefasst wird nur innerhalb gleicher
   Blend- und Ebenengrenzen. Bei Bedarf so packen, dass gemeinsam gezeichnete Sprites
   auf einer Seite liegen (Asset-Neubau über die Pipeline).
6. Text (GDI, Laufband) nur bei Änderung neu rastern und hochladen.
7. Levelstart: Texturen vorab hochladen (Pixi prepare/initSource), Dekodierung außerhalb
   des Hauptthreads (createImageBitmap). Kein Ruckler im ersten Levelframe;
   Levelwechselzeit messen.
8. Shell-HUD (shell/src/hud.ts, overlay.ts): DOM nur bei Änderung schreiben, keine
   Layout-Lesung nach einem Schreibzugriff im selben Frame, `transform` statt
   left/top für bewegte Einblendungen, `contain` auf Overlays. Style und Layout je
   Frame im Trace prüfen.
9. Eingabelatenz prüfen: Eingabe so spät wie möglich vor dem Tick lesen,
   `desynchronized` testen.
10. Simulation: Die Spitzen bei p99 und max untersuchen (GC? einzelne Ereignisse?).
    Änderungen in sim/ nur bit-gleich und mit `bun run perf` vorher/nachher.
11. Laden: Zeit bis spielbar messen (kalt, warm, offline). Preload und Codesplitting
    innerhalb der Budgets verbessern.

## Teil C — Mehr Arbeit auf die GPU

Grundsatz: Die GPU macht nur aus fertigen Zeichenlisten Pixel. Alles, was die
Simulation berechnet, bleibt auf der CPU: Positionen, Partikel aus sim/effects.ts
(sie ziehen Zufallszahlen aus `VbRnd`) und die Umgebungslisten aus sim/envDraw.ts.
GPU-Gleitkomma ist zwischen Geräten nicht bit-gleich, und Replays wären dann
nicht mehr reproduzierbar. Jeder Schritt wird mit `perf:render` gemessen (CPU-Zeit je
Frame, Draw-Calls, RT-Wechsel, Uploads), und „Original“ bleibt pixelgleich.

C1 Hardwarebeschleunigung sicherstellen:
- `powerPreference: "high-performance"` setzen, damit Laptops die dedizierte GPU
  nehmen.
- Software-Rendering beim Start erkennen: eine Probe mit
  `failIfMajorPerformanceCaveat` bzw. den Renderer-String (WEBGL_debug_renderer_info:
  SwiftShader, llvmpipe, „Microsoft Basic Render Driver“). Ist es Software, zeigen die
  Einstellungen einen Hinweis, wie man die Hardwarebeschleunigung im Browser
  einschaltet, und „Auto“ wählt SD. Smoke und CI laufen absichtlich mit SwiftShader;
  dort darf der Hinweis nichts blockieren.

C2 WebGPU: Pixi 8 bringt einen WebGPU-Renderer mit (`preference: "webgpu"`, Fallback
WebGL). Eigene Shader (StripMesh `GlProgram`, neue Shader aus A1/A3) brauchen dann eine
WGSL-Fassung (`GpuProgram`). Gemessen wird die CPU-Zeit je Frame (WebGPU hat weniger
Treiber-Overhead) und die Bildgleichheit mit WebGL im Modus „Original“. Vorgabe wird
WebGPU nur bei klarem Gewinn und identischen Bildern.

C3 Transformationen und Batches auf der GPU halten:
- Pixi-8-Render-Groups (`isRenderGroup`) für Ebenen, die als Ganzes verschoben
  werden (Scrollen, Wackeln über `screen.position`). Die GPU rechnet dann die
  Ebenentransformation, und unveränderte Ebenen bauen ihre Batches nicht neu.
  Messen, wie oft Pixi die Struktur neu aufbaut, und die Pools so führen, dass sich
  die Struktur selten ändert.
- `ParticleContainer` für viele gleichartige Sprites (Funken, Sterne, Regen), wenn
  eine Atlasseite und ein Blend-Modus genügen und die Zeichenreihenfolge gleich bleibt.

C4 Kopien und Effekte als GPU-Pässe:
- `Compositor.copy()`: `renderer.renderTarget.copyToTexture` (in Pixi 8.21 vorhanden)
  statt Umweg über `tmp` mit Sprite-Render. Wo sich Quelle und Ziel überlappen
  (BltFast in sich selbst), weiter über `tmp`, aber nur die betroffenen Rechtecke
  statt des Vollbilds.
- Wasser, Flucht und Verzerrungsgitter (StripMesh): Vertexdaten in wiederverwendeten
  dynamischen Buffern, ein Upload je Frame statt je Mesh.
- Endskalierung, Rasterlinien und Pixel-Glättung (A1, A3) als Shader, nicht als CSS
  oder CPU-Schritt.

C5 Keine synchronen GPU-Rücklesungen im Spiel: game/mosaic.ts liest bei jedem Tod und
beim Öffnen der Pause das ganze 800×600-Bild mit `renderer.extract.canvas` zurück.
Das blockiert, bis die GPU fertig ist. Danach verkleinert Canvas 2D das Bild, und
`toDataURL("image/webp")` kodiert synchron auf dem Hauptthread. Ein Ruckler genau im
Todesmoment ist zu erwarten, erst messen. Besser: auf der GPU in ein 200×150-Ziel
verkleinern, nur das zurücklesen und asynchron kodieren (`toBlob` bzw.
`OffscreenCanvas.convertToBlob`, ggf. im Worker). Die Kachel muss vor dem nächsten
Ladebild fertig sein und sichtbar gleich aussehen.

C6 GPU-Texturformate: KTX2/Basis und DDS (Loader in Pixi 8 vorhanden) sparen VRAM und
Upload-Zeit, sind aber verlustbehaftet. Für den Modus „Original“ deshalb nie, höchstens
für das HD-Bundle (A3), wenn VRAM und Upload-Zeit beim Levelstart das rechtfertigen und
der Bildvergleich passt. Pixi lädt die Transcoder (JS + WASM) standardmäßig von
jsDelivr. Das verbieten CSP und Offline-Betrieb, sie müssten also selbst ausgeliefert
werden; nur nach Rückfrage. Mipmaps nur dort, wo verkleinert gezeichnet wird.

C7 Hauptthread entlasten (nur prüfen und mit Aufwand berichten, Prototyp nach
Rückfrage): Pixi 8 kann über `DOMAdapter.set(WebWorkerAdapter)` auf einem
OffscreenCanvas im Worker rendern. Canvas, Eingabe, Audio und HTML-HUD gehören laut
GameModule-Vertrag aber der Shell. Das wäre ein großer Umbau; zuerst messen, wie viel
Hauptthread-Zeit je Frame das Zeichnen überhaupt kostet.

## Verifikation (nach jedem Schritt)

- `bun run check`. Bei sim/ zusätzlich `bun run perf` vorher/nachher. Bei Render und
  Shell `bun run smoke` und der Screenshot-Vergleich für „Original“ (pixelgleich). Bei
  Build-Änderungen `bun run build && bun run budget`. Bei Assets lokal
  `bun run assets:build`, dann `bun run assets:verify`, generierte Dateien committen.
- HD-Sichtprüfung: Vergleichsbilder SD/HD je Szene in einen nicht committeten Ordner
  legen und im Bericht nennen.
- Mehrfach zwischen den Spielen wechseln (Ressourcenzähler). Einstellungen zur
  Laufzeit umschalten. Fenstergröße, Vollbild und DPR ändern. MAX_TEXTURE_SIZE 2048
  simulieren. Ohne WebGL bleibt es bei der bisherigen Fehlermeldung. Mit
  Software-Rendering erscheint der Hinweis aus C1, und WebGPU fällt sauber auf WebGL
  zurück.
- Spec („Rendering“, „Optionale Modernisierungen“) und README (Darstellung, Skripte)
  nachziehen. Einstellungstexte in allen Sprachen der Shell (shell/src/texts.ts)
  ergänzen.

## Was ausdrücklich nicht

- Keine Änderung an Mechanik, Timing oder Balance. Keine Effekte, die das Original
  nicht hat (Bloom, Glow, zusätzliche Partikel).
- Kein KI-Upscaling mit externen Modellen oder Diensten: nicht reproduzierbar und
  nicht Teil des Builds.
- Keine Simulationsrechnung auf der GPU (Compute-Shader, Partikel, Kollisionen),
  auch nicht „nur für Effekte“, solange sie Zufallszahlen oder Sim-Zustand berührt.
- Die Original-Vorgabe ändert sich nicht ohne Rückfrage (Ausnahme laut Invariante 4).
- Keine Mikro-Optimierung ohne Messwert. Tests, Budgets und Grenzen in perf.test.ts
  werden nicht abgeschwächt.

## Abschlussbericht

- Messtabelle vorher/nachher je Szene: Frame-Zeit p50/p99, Render-Aufrufe, Draw-Calls
  und RT-Wechsel je Frame, Allokationen je Frame, Levelstart- und Ladezeit,
  Asset-Größen SD/HD, jeweils mit Renderer (WebGL/WebGPU) und GPU-String der Messung.
- Umgesetzte Schritte (je ein Satz mit Dateien), neue Einstellungen und ihre Vorgaben
  mit Begründung.
- Pfade der Vergleichsbilder SD/HD.
- Verworfene Ansätze mit Messwert oder Grund (z. B. 4096er-Seiten, Echtzeit-Shader,
  WebGPU, komprimierte Texturen, Worker-Rendering, Interpolation).
- Offene Punkte (Messung auf echten Geräten) und gefundene mutmaßliche Bugs, außerhalb
  des Auftrags nicht behoben.
- Ergebnis von check, smoke, budget, perf und perf:render.
```
