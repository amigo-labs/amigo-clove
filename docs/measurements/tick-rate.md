# Messung: Original-Tickrate DOVE

Status: **offen, braucht das laufende Original.** Bis zur Messung gibt es im Code
keine Tickrate; die Engine (M3) führt `TICK_MS` als einzelne Konstante, die auf
diese Datei verweist.

## Was feststeht

- Jedes Level hat 32000 Tick-Zeilen. Bei 60 Hz wären das 8,9 min, bei 100 Hz
  5,3 min.
- Das letzte belegte Event liegt früh: in Level 9 bei Tick 15390, in allen
  anderen bei höchstens 10193 (Level 1: 6422). Ob das Level nach dem letzten Event (Endgegner)
  endet oder bis 32000 weiterläuft, ist Teil der Messung.
- **Statischer Befund aus `DOVE.exe`** (VB6-Formdaten ab Offset `0x28D2E`): Das
  Formular enthält `Timer1` mit `Interval = 1` ms (Property-Byte `03`, Wert
  `01 00`). Ein VB6-Timer mit 1 ms feuert in der Praxis mit der Auflösung des
  Systemtimers (typisch 15,6 ms ≈ 64 Hz, mit `timeBeginPeriod` feiner). Die EXE
  importiert zusätzlich `timeGetTime` und enthält Debug-Strings `TICK:` und
  `FPS:` — die eigentliche Taktung läuft also vermutlich über `timeGetTime`
  mit eigener Schwelle. Der Befund ist ein Hinweis, **kein** Messwert.

## Messverfahren

1. Original starten, Optionen auf Standard (Punktefaktor 1).
2. Level 1 per OBS aufnehmen, 60 fps, ab „Get Ready“ bis zum Levelende.
3. Zwei eindeutige Ereignisse mit bekanntem Tick im Video suchen. Level 1:
   erstes Extra `;2` bei Tick 354, Checkpoints `;3` bei 350, 2798, 5279, 6185,
   letztes Event bei 6422.
4. `TICK_MS = (t₂ − t₁) / (tick₂ − tick₁)` aus den Videozeitstempeln.
5. Gegenprobe auf einem zweiten Level. `Q`/`W` (Bremsen/Beschleunigen)
   während der Aufnahme nicht benutzen.

Ergebnis hier eintragen, mit Rechner/Windows-Version und Video-Datei.
