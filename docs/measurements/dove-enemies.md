# DOVE — Gegner, Gegnerschüsse, Kollision

Status: **statisch bestimmt aus `DOVE.exe`** (M3). Konfidenz *hoch*, wo nicht
anders vermerkt. Spawn-Tabelle und Pattern-Aufbau: [`dove-events.md`](dove-events.md).

## Parameter p0…p4

| | Bedeutung |
|---|---|
| p0 | Framezahl − 1 (Lader liest `For k = 0 To p0`) |
| p1 | Animationsverzögerung: Frame wechselt alle p1 + 1 Ticks |
| p2 | Trefferpunkte **und** Punktwert (Kopie in +0x34); Bosse 20 (Skript), 100000 ≈ unzerstörbar |
| p3 | Schusstyp: 0 keiner, 1/2/3 gezielt mit Wahrscheinlichkeit 0,002/0,005/0,02 pro Tick, 4 Feuerball alle 21 Ticks |
| p4 | Geschwindigkeit in px/Tick; p4 = 1 schaltet den Wandcrash ab (Wandobjekte scrollen mit) |

## Bewegung pro Tick (`0x477A99`–`0x47C16B`)

- **Animation:** `cnt += 1; if cnt > p1 { cnt = 0; frame += 1; if frame > p0 then frame = 0 }`.
- **Pattern ≥ 0:** `x += vx; y += vy` — kein Scrollanteil.
- **Wegpunkte:** eine Achse gilt als erreicht bei (v < 0 und CLng(pos) ≤ Ziel),
  (v > 0 und ≥ Ziel) oder v = 0. Sind beide erreicht: nächster Wegpunkt; ist dessen
  x = −1, wird x = 641 gesetzt (→ entfernt), sonst neu zielen von der aktuellen
  Position: |dx| > |dy| → vx = ±p4, vy = dy/|dx|·p4, sonst umgekehrt. Koordinaten
  sind absolute Bildschirmpositionen. `flag0`/`flag1` werden nach dem Laden nie
  gelesen. Der Lader baut Start- und Endpunkt aus `v0`/`v1` (0 → x 640, 1 → y 410,
  2 → x −100, 3 → y −100, die andere Koordinate vom ersten bzw. letzten Wegpunkt);
  bei null Wegpunkten liefert `end` das Start-y.
- **Wandcrash** (Pattern ≥ 0, p4 ≠ 1): AABB (x, y, r−l, f1−f0) gegen Tiles — y,
  nicht y+f0. Treffer: Partikel, 3 Explosionen, entfernt, **keine** Punkte.
- **Code −1…−4 („Schleim“, verfolgt):** jede Achse schreitet ±p4 in Richtung
  Mittelpunkt ↔ (pX+20, pY+10), nur ohne Überschießen und wenn die neue Box
  (Höhe b−t) keine Wand berührt.
- **Code −5 (Datei −6, schwebt):** y += vy, vy kehrt um bei Wand oder Rand
  (0 < y+vy, y+vy+h < 410); x −= p4 solange x > 400; vx dient als Zähler +1/Tick,
  ab > 500 wieder x −= p4 und kein Feuer mehr (zieht ab). Wandkontakt tötet.
  Feuert alle 31 Ticks zwei Feuerbälle an y und y+h (unabhängig von der Option).
- **Code −6 (Datei −7, „Faller“):** x += vx; bei vy = 0 und x < pX+40 → vy = 1;
  für 1 ≤ vy ≤ 15 wackelt x um ±2, vy += 1; ab vy = 16 y += 5/Tick. Wand → entfernt.
- **Entfernen:** x < −(r−l), x > 640, y > 410 oder y < −(b−t).

## Zeichnen

Quell-Rect (l, t + frame·(b−t), r, t + (frame+1)·(b−t)) aus `feindeN.spr`,
geclippt auf 640×410, an `FpI4(x), FpI4(y)`.

## Gegnerschüsse (`0x43C4A0`, 50 Slots)

- p3 = 1…3 → Art 1 an (x + (r−l)/2 − 4, CLng(y + (b−t)\2) − 4): Kugel `ss.spr`
  (21,85)–(28,92), gezielt auf (pX+20, pY+7) mit Tempo **3** auf der Hauptachse;
  Geschwindigkeit als `Long` (Nebenachse gerundet).
- p3 = 4 → Art 2 an (x − 35, y − 7): Feuerball `ss.spr` (0,136)–(34,150), vx = −5.
- Option „Gegner schießen“ `Me.[0x634]`: 0 aus, 1 voll, 2 halb (jede zweite
  Anforderung verworfen).
- Punktefaktor `Me.[0x638]` (*mittel*): voll 1,25 / halb 1,0 / aus 0,75; −0,25 ohne
  Wandkollision; ±0,25 mit/ohne Waffenverlust. Standard 1,0.

## Trefferprüfung `HitTest` (`0x448910`)

1. Bosse (levelabhängig) zuerst.
2. Gegner in Slotreihenfolge: vertikaler Ausschluss gegen [ey+f0, ey+f1] des
   aktuellen Frames; über die Zeilen `max(y−ey, f0) … min(y+h−ey, f1)` (gerundet)
   minL = min(left), maxR = max(right), Start minL = r−l, maxR = 0, leere Zeilen
   eingeschlossen; Treffer bei x ≤ ex+maxR und x+w ≥ ex+minL (inklusiv; die
   Richtung der Vergleiche ist *mittel*).
3. Wände: inklusives AABB gegen die Tiles, zuletzt.

Ergebnis −1 kein Treffer, 0 absorbiert, > 0 Überschuss (−HP).

## Tod

HP −= Schaden; bei HP ≤ 0: Punkte (außer im Bosskampf), 150 Partikel, eine
Explosion am Mittelpunkt − 25 und eine an einem Zufallspunkt der Box − 25, Sound 1.
`Explosion.spr`: 32 Frames à 50×50, 8 pro Zeile, ein Frame pro Tick.
