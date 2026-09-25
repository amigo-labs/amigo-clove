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

## Noch nicht umgesetzt (M4)

Waffenfarben und Upgrades, Beam, Option, Bomben, Schild, Wirkung der Extras,
Endgegner, Level 0 und 2–11 samt Levelskripten, Audio, Menüs, Highscore,
Optionsbildschirm und Punktefaktor-Anzeige, Vorhang B1–B5, Easteregg.

## Nicht testbar, nur dokumentieren

- Audio-Äquivalenz: BASS 0.8 und libopenmpt mischen unterschiedlich.
- Timerauflösung: Das Original lief auf groben Systemtimern mit 15,6 ms.
- Zufall: Das Original säte `Rnd` aus der Uhr; der Port verwendet dasselbe
  LCG mit fester Saat — gleiche Verteilung, andere Folge.
