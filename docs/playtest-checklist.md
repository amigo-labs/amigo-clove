# Playtest-Checkliste DOVE

Was die automatischen Tests **nicht** beweisen können. Replays prüfen den Port
gegen sich selbst, die Kreuzvalidierung prüft Assets gegen Daten — die Treue
zum Original bei Timing, Gefühl und Darstellung braucht den Vergleich am
laufenden Original (Referenzaufnahme mit OBS, 60 fps).

## Stand M3 — gegen das Original abgleichen

- [ ] **Tickrate:** zwei Events mit bekanntem Tick im Video stoppen
      (`docs/measurements/tick-rate.md`, „Gegenprobe“).
- [ ] **Scrolltempo:** Landschaft 1 px/Tick, Hintergrundobjekte 0,5 px/Tick.
- [ ] **Warp-Intro Level 1** (Tick 51–350): Sterne beschleunigen, halten, bremsen.
- [ ] **Schiff:** Tempo 6 fühlt sich richtig an; Q/W-Stufen 2…8; Blinken nach Respawn.
- [ ] **Dauerfeuer:** 6 Ticks Abstand, Schusshöhe Y+7.
- [ ] **Gegnerbahnen:** Pattern-Gegner in Level 1 (Ufo, Kugel, Kreissäge, Walker)
      folgen denselben Bahnen; Schleim verfolgt, Faller wackelt und stürzt.
- [ ] **Kollision:** Treffer an den Rändern großer Sprites (Kontur statt Box).
- [ ] **Meteore** (Tick 980–1500): Häufigkeit, Flugrichtung, Zeichenreihenfolge.
- [ ] **Extras:** Sprite-Rechtecke (25×25 je Frame in `ss.spr`, *geschätzt*).
- [ ] **HUD:** Score-Hochzählen, Tempoanzeige, Position der Texte.

## Bewusst angenähert (reine Darstellung, beeinflusst die Simulation nicht)

- Funkenpartikel: Anzahl aus der EXE, Bewegung/Farbe/Lebensdauer geschätzt.
- Bildschirmwackeln: Dauer aus der EXE (5 Ticks), Amplitude geschätzt (±1 px).
- Sterne 0–62 vor den Hintergrundobjekten (Reihenfolge *mittel*).
- Laserfarben, Bremsbänder, Windzonen, Blasen (Level 3), Bossstrahlen und der
  Beam-Blitz von Boss 7 als einfache Flächen/Streifen.

## Stand M4 — zusätzlich abgleichen

- [ ] **Waffen:** blauer Laser (Farben geschätzt), grüne Bälle teilen sich,
      roter Fächer; Ausrichtung mit D (80 Ticks); Beam-Stufen und Ladegeräusch.
- [ ] **Options/Schild:** Umlaufbahn 40×30, Absorbieren gezielter Kugeln.
- [ ] **Bosse:** je Level Bewegung, Angriffe, Trefferzonen (Einzeilentest).
      Level 8: der Kern ist nur aus der offenen rechten Seite der Hülle
      treffbar (der Sog zieht das Schiff hinein) — prüfen, ob das Original
      genauso zu schlagen ist. Level 7: Sieg bei der 1. Niederlage (Faktor <
      1,1) bzw. der 2. — laut Disassembly, die Doku nannte 2./3.
- [ ] **Level 3:** fallende Decken auf den Tile-Slots 0/8 treffen die
      richtigen Kacheln (Slotvergabe mit Hinweis).
- [ ] **Level 6:** die Kachel bei Tick 4785 (Off-by-one des Originals).
- [ ] **Level 7/8:** Bremsbänder (Lebensdauer geschätzt), Windzonen.
- [ ] **Audio:** Lautstärken und Panoramen, Ausblenden vor dem Boss.
- [ ] **Colorkey im 16-Bit-Modus:** Lief das Original in 16 Bit Farbtiefe,
      keyte DirectDraw alles, was in RGB565 schwarz wird (r < 8, g < 4, b < 8),
      nicht nur exaktes Schwarz. Der Port keyt exakt RGB(0,0,0) — fast
      schwarze Ränder an Sprites (z. B. Menügrafik in titel.spr) vergleichen.

- [ ] **Ablauf (Menüs als HTML):** NEO-ARTS-Logo und Intro im Original; Titel,
      Optionen (Speichern, Punktefaktor, Freischalt-Hinweis), Levelauswahl,
      Info mit Readme, Abschied, Get Ready, Pause, Continue und
      Highscore-Eingabe als HTML mit Tastatur, Maus, Touch und Pad; Effekte
      (Get Ready, Yes/No) und Musik wie im Original, Musik blendet vor dem
      Levelstart aus.
- [ ] **Abspann:** Dia-Timings und Name von Platz 1 im Jubeltext; danach die
      Credits (alle Beteiligten) als HTML mit Musik `credits`.

## Stand M5 — Shell, auf echten Geräten prüfen

Der Smoke-Test deckt Chromium headless ab (Kaltstart, Sprachwechsel,
Offline-Start bei beendetem Server). Von Hand:

- [ ] **Gamepad:** Xbox- und PlayStation-Pad in Chrome und Firefox — Menüs der
      Shell (hoch/runter, A, B), DOVE-Belegung, Stick-Totzone.
- [ ] **Ton nur mit Pad:** Browser zählen Pad-Tasten meist nicht als
      Nutzergeste; ob der AudioContext ohne Tastatur/Klick anläuft, prüfen.
- [ ] **Offline:** Firefox und Safari — „Spieldaten installieren“, Flugmodus,
      Neustart des Browsers; `navigator.storage.persist()` wird gewährt?
- [ ] **Update:** neuer Build ausgeliefert — alter Tab spielt weiter, nach dem
      Schließen aller Tabs gilt die neue Version.
- [ ] **Spielstände:** Export, Browserdaten löschen, Import — Optionen,
      Freischaltungen und Highscores wieder da.

## Stand M6 — DoveZ-Assets am Original prüfen

- [ ] **`atlantis_saule2`:** Maske (200×540) größer als das Bild (190×520);
      der Port nimmt den Ausschnitt oben links. Säule im Original mit dem Port
      vergleichen — sitzt der Übergang versetzt (bester Versatz wäre 6 px)?
- [ ] **Rauch in Rumbler (`rauch1–7`):** palettiert, Index- und RGB-Keying
      fallen auseinander; der Port keyt auf RGB-Schwarz.
- [ ] **Masken nicht grau** (19 von 83): Alpha = Mittelwert der Kanäle,
      *geschätzt*.
- [ ] **Videos:** VP9 CRF 44 gegen das DivX-Original (Artefakte bei schnellen
      Schnitten, Ton synchron).
- [ ] **Safari:** Ogg Opus per `decodeAudioData` und Ogg-Vorbis-Streaming.

## Stand M8 — DoveZ am Original abgleichen

Die Mechanik ist statisch aus `DoveZ.exe` hergeleitet (`docs/measurements/dovez-runtime.md`);
nichts davon ist am laufenden Original gemessen. Was ein Vergleich am echten Spiel
klären müsste:

- [ ] **Takt:** 16 ms je Tick (`Wait(16 + Me.1C8)`); Steuerung und Scrolltempo fühlen
      sich wie im Original an (Frames überspringen bei Last).
- [ ] **Trägheit „Realistic“:** Ausgleiten nach dem Loslassen (×0,85 je Tick, ab 10
      Ticks Tastendruck) — Reihenfolge im Tick und Länge des Ausgleitens.
- [ ] **Tastenkonfiguration (HTML):** Aufnahme der zweiten Taste je Aktion und
      Satz, Übernehmen und Zurück (verwirft); Tastennamen (deutsche Beschriftung:
      DIK `0x15` = „Z“).
- [ ] **Super-Nova:** alle zehn Varianten (Dauer, Zeitpunkt der Kills, Rauschen),
      Abschusszähler `B48[0].54`.
- [ ] **Bosse:** Zustandsmaschinen und Finale (Zustand 4), Druckwelle als Spielwirkung.
- [ ] **Beam und Kombo:** Ladezeit (0,9 je Tick), Kraftphase, Kombo-Wertung.
- [ ] **Hintergründe, Wetter, Wasser, Overlays:** prozedurale Effekte (Partikelzahlen,
      Farben, Blendmodi) gegen Aufnahmen.
- [ ] **Videos und Ladebilder:** Ladebild bzw. Mosaik mit Fortschritt als HTML,
      Zwischensequenzen als `<video>`, Credits-Bild läuft mit 40 px/s (Original
      1 px je 25 ms).
- [ ] **Menü (HTML):** alle Seiten (Neu → Spieler → Schiff → Namen, Laden, Optionen,
      Lautstärke, Tasten, Vibration, Bonus, Highscore), Menümusik und Klänge, Osterei
      durch Tippen von „lov“; Speicherbildschirm, Continue (Esc zählt schneller) und
      Pause mit Funklog und Tastenübersicht.
- [ ] **Level vor Tick 0** (`-Tick N` mit N < 0): die 118 Einträge mit negativem Tick.
- [ ] **Vibration:** Stärke und Dauer je Quelle (siehe „Vibration“ in
      `dovez-runtime.md`), Gamepad-Motoren der Browser statt DirectInput-Kräfte.
## Stand M8 — DoveZ auf Russisch (`#/dovez?lang=ru`) am Original prüfen

- [ ] **Schrift:** kyrillische Texte in Arial (Original: GDI-Schrift mit
      Zeichensatz `[0x5886DC]`) — Breite der langen Zeilen („Управление
      режимом/Сменить Части“, „Нажмите любую клавишу для старта!“) und der
      Tafeln im Menü gegen das Original.
- [ ] **Hauptmenü:** ohne „Highscore“-Eintrag; nach einem Durchgang „Бонус“ (öffnet
      im HTML-Menü die Bonusliste, im Original die Highscore-Seite).
- [ ] **Speicherbildschirm:** „Уровень расчищен!“ ohne Levelnamen, Spielerzeile
      ohne Highscore-Platz, „Сохранено“ nach dem Speichern.
- [ ] **Pause:** Titel „Уровень1-1 (Bruce)“, „Продолжить“/„Выход“.
- [ ] **Funk:** Untertitel im Laufband, kein Ton (RU-Aufnahmen fehlen);
      [Harbor] in Level 3-1 vollständig.
- [ ] **Videos:** `introR`/`OutroR`/`Outro2R` fehlen in den Originaldaten — das
      Original übersprang sie; prüfen, ob eine russische Ausgabe sie mitbringt.
- [ ] **Datum** der Spielstandbeschriftung `TT.MM.JJJJ` (Annahme).

## Nicht testbar, nur dokumentieren

- Audio-Äquivalenz: BASS 0.8 und libopenmpt mischen unterschiedlich.
- Timerauflösung: Das Original lief auf groben Systemtimern mit 15,6 ms.
- Zufall: Das Original säte `Rnd` aus der Uhr; der Port verwendet dasselbe
  LCG mit fester Saat — gleiche Verteilung, andere Folge.
