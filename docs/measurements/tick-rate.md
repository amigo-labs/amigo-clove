# Original-Tickrate DOVE

Status: **statisch bestimmt aus `DOVE.exe`: 14 ms pro Tick (≈ 71,4 Hz).**
Eine Messung am laufenden Original ist nicht mehr nötig, taugt aber als
Gegenprobe (Verfahren unten).

`DOVE.exe` ist nativ kompiliertes VB6 (765 KB x86-Code, kein P-Code). Die
Adressen unten sind virtuelle Adressen in dieser EXE (Image-Base `0x400000`);
disassembliert mit `objdump -d -M intel`.

## Befund

### 1. Die Hauptschleife taktet auf 14 ms

Die Spielschleife ist `Do … Loop` in der großen Formular-Methode
`0x46DE60–0x490430`, Schleifenkörper `0x4708B9–0x48ED45`, Abbruch bei
`Me.[0x690] = 1` oder wenn ein Zähler `[ebp-0x1E4]` 205 erreicht.
`timeGetTime` (winmm, über den VB6-`Declare`-Stub `0x40A45C`) steuert das
Tempo; rekonstruiert (`0x48EA74 ff.`):

```vb
now = timeGetTime
If nextT < now And drawFlag And lastOnTime Then   ' zu spät: nächsten Frame nicht zeichnen
    DoEvents
    nextT = nextT + 30
    drawFlag = False: lastOnTime = False
    GoTo Common
ElseIf drawFlag Then
    Do: DoEvents: Loop While nextT > timeGetTime  ' Busy-Wait
    nextT = timeGetTime + 14                      ' add edx,0xe @ 0x48EB91
    lastOnTime = True
Else
    DoEvents
End If
framesThisSecond += 1: drawFlag = True
Common:
ticksThisSecond += 1
```

Vor dem ersten Durchlauf wird `nextT = timeGetTime + 14` gesetzt (`0x470899`).
Die 14 ist eine feste Konstante im Code, keine Option. Die Konstante 14 ms
kommt im ganzen Programm als Frametakt vor (Menüs, Zwischensequenzen:
`0x45705C`, `0x45AC62`, `0x45CFD1`, `0x4A7B02`, …), daneben 1000 ms für
Sekundenzähler und kurze Wartezeiten von 4 und 10 ms.

Fällt ein Durchlauf hinter den Plan, wird der nächste **nicht gezeichnet** und
läuft ohne Warten durch; danach wird bis zur alten Frist + 30 ms gewartet. Die
Logik holt also bis zu einen Tick nach, das Bild lässt ihn aus — genau das
Catch-up-Verhalten, das die Spec für den Port vorsieht.

### 2. Ein Durchlauf = ein Level-Tick = eine Event-Zeile

- Die Hauptschleife ruft pro Durchlauf genau einmal die Formular-Methode
  vtable-Offset `0x7B4` auf (`0x472D3B`); keine Verzweigung im Schleifenkörper
  springt über diesen Aufruf hinweg außer dem Schleifenabbruch. Die Methode
  liegt bei `0x43D6B0` (Thunk `0x4099B5`, vtable-Eintrag `0x4090A8`; die
  eigenen Methoden eines VB6-Formulars beginnen bei `0x6F8`).
- Diese Methode wertet die Event-Tokens aus (sie enthält die Verweise auf die
  Stringkonstante `§`) und endet mit `Me.F4 = Me.F4 + 1` (`0x4451B9`). Das ist
  die **einzige** Stelle, an der `Me.F4` erhöht wird.
- `Me.F4` ist der Level-Tick: die Debug-Anzeige (`0x48BF56`) gibt
  `"TICK:" & Me.F4 & " TPS:" & ticksThisSecond & " FPS:" & framesThisSecond`
  aus; `TPS` und `FPS` werden einmal pro Sekunde (`timeGetTime + 1000`,
  `0x48EC8B`) übernommen und genullt.
- Beim Levelstart wird `Me.F4` aus `Me.[0x530]` gesetzt (`0x46E81D`); unter
  der Bedingung `Me.[0x644] = 0` wird `Me.[0x530] = Me.F4` gespeichert
  (`0x444935`). `Me.[0x530]` ist damit vermutlich die Checkpoint-Position.

**Ausnahme:** Ein einziger Pfad verlässt die Event-Methode vorzeitig ohne
`Me.F4 += 1` (`0x43F566`): In einem skriptgesteuerten Tick-Bereich (Case 1
der Fallunterscheidung über `Me.[0x39C]`, vermutlich die Levelnummer) wird
ein Objekt mit Zufalls-Y an x = 640 und vx = −4 erzeugt und die Methode
sofort beendet — der Tick steht dann für diesen einen Durchlauf still.
Das gehört als Sonderfall in die Engine, nicht in den Takt.

## Konsequenzen für den Port

- `TICK_MS = 14`. Ein Level mit 32000 Tick-Zeilen dauert höchstens 7:28 min;
  die letzten Events liegen früh (Level 1: Tick 6422 ≈ 1:30 min, Level 9:
  Tick 15390 ≈ 3:35 min), danach folgt der Endgegner.
- **Timerauflösung.** Der Code ruft kein `timeBeginPeriod` auf. Auf Rechnern,
  deren Systemtimer grob läuft (typisch 15,6 ms unter Windows NT/XP ohne ein
  Programm, das die Auflösung erhöht), wartet die Busy-Loop bis zum nächsten
  Timer-Schritt: effektiv 15,625 ms ≈ 64 Hz. Unter Windows 9x, mit
  DirectX/Audio-Treibern, die den Timer auf 1 ms setzen, sind es die
  vorgesehenen 14 ms. Der Port übernimmt den **Sollwert 14 ms**; wer das
  „langsame XP-Gefühl“ nachstellen will, bekommt eine Option, keinen
  Default.
- Frame-Skip: max. ein nachgeholter Logik-Tick pro gezeichnetem Frame im
  Original; die Spec (Catch-up-Limit 5 Ticks) ist großzügiger, das ist
  gewollt (Browser-Tabs pausieren härter als VB6-Fenster).
- `Timer1` im Formular (`Interval = 1`, Formdaten ab Offset `0x28D2E`) ist
  **nicht** der Spieltakt.

## Gegenprobe am Original (optional)

1. Original starten, Level 1 mit OBS (60 fps) aufnehmen.
2. Zwei Events mit bekanntem Tick im Video suchen, z. B. das erste Extra `;2`
   bei Tick 354 und den Checkpoint bei Tick 5279.
3. `(t₂ − t₁) / (5279 − 354)` sollte 14 ms (bzw. 15,6 ms bei grobem Timer)
   ergeben. `Q`/`W` währenddessen nicht benutzen.
