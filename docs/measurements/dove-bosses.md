# DOVE — Endgegner, Levelende, Levelskripte

Status: **statisch bestimmt aus `DOVE.exe`** (M3/M4-Vorarbeit), `objdump -d -M intel`,
Image-Base `0x400000`. Ergänzt [`dove-events.md`](dove-events.md) und
[`dove-enemies.md`](dove-enemies.md). Konfidenz *hoch*, wo nicht anders vermerkt.
Methodennamen stammen aus der VB6-Methodentabelle des Formulars.

## Verdrahtung

- **Korrektur:** Vtable `0x7B8` (`0x445430`) ist `LeftColision`, nicht das Bossskript; `0x7BC` ist
  `RightColision`. Beide suchen das erste Hindernis in einer Zeile (Boss, Meteore, Tiles, Gegner) —
  vermutlich Reichweite einer Waffe (*mittel*).
- Bossskripte `Endgegner1…10` (Vtable `0x800`–`0x820`), aufgerufen über `DoEndgegner` (`0x46DCE0`, Vtable
  `0x824`) einmal pro Tick aus der Hauptschleife (`0x47C181`, nach der Gegnerschleife), solange `Me.39A`
  gesetzt ist. Sprungtabelle `0x46DE30`:

L1 `0x460A20`, L2 `0x4612C0`, L3 `0x461ED0`, L4 `0x463F10`, L5 `0x465790`, L6 `0x462D90`,
L7 `0x466880`, L8 `0x46A4C0`, L10 `0x46B890`; Level 9 hat keinen Boss.

- **Bossstart** (Evente am Boss-Tick, z. B. `0x43F698`): `Me.198 = 0` (Hintergrund steht), `Me.39A = True`,
  `Me.3B8 = 0` (Zustand Init), `PlayMusik "end1"` (L1, L3, L5) bzw. `"end2"` (L2, L4, L6, L7, L8, L10). Die
  100 Ticks davor wird die Musik ausgeblendet. **Level 5 setzt `Me.198` nicht auf 0** (`0x440475`) — der
  Hintergrund scrollt im Bosskampf weiter.

### Bossdatensatz `Me.3A0`

| Offset | Bedeutung |
|---|---|
| +0 / +4 | x / y (Long) |
| +8 / +C, +10 / +14 | x/y von Teil 2 bzw. 3 (−1000 = nicht vorhanden) |
| +18 | Zustand (= `Me.3B8`) |
| +1C … +30 | Zähler / Unterzustände (bossabhängig) |
| +34 / +38 | HP / HP-Maximum |
| +3C/+40, +44/+48 | HP/Max von Teil 2 bzw. 3 |
| +50 / +54 | Frame / Gegnertyp (1-basiert, Record aus `Me.42C`) |

`Me.3F8` = Zeichnen erlaubt. Gegnerdefinition: `Me.42C + (Typ−1)·0x8410`, darin
+0 l, +4 r, +8 t, +C b; Frame-f0/f1 als Words bei +0x83B0 / +0x83DA.
Sinus-/Kosinustabellen in Grad: `Me.668` / `Me.684` (`0x4A9058`).

### Gegnerschüsse: `AddGegnerS` und `AddEndS`

Beide schreiben in den Pool `Me.5D8` (51 Slots à 40 Byte: Typ, vx, vy, x, y, aktiv,
Rect l/t/r/b).

- `AddGegnerS(art, x, y)` (`0x43C4A0`), beachtet die Option `Me.634`:

| art | Schuss |
|---|---|
| 1 | gezielte Kugel (21,85)–(28,92), Tempo 3, Start (x−4, y−4) |
| 2 | Feuerball (0,136)–(34,150), vx −5, Start (x, y−7) |
| 3 | gerade Kugel, vx −5, vy 0, Start (x, y−4) |

E1, E4 und E5 setzen `Me.634 = 1` um ihre Aufrufe und stellen den Wert danach wieder her — ihre Schüsse
kommen also auch bei „Gegner schießen: aus".
- `AddEndS(typ, x, y, vx, vy, l, t, r, b)` (`0x43C350`) **ignoriert die Option**.
- Pro Tick `x += vx; y += vy`; entfernt bei Wandtreffer oder x < −w, x > 640, y > 410, y < −h. **Typ 4**
  zerfällt bei Wandtreffer in zwei Typ-2-Kugeln an (x−vx, y+1) mit (−vx/2, −vx/2) und (−vx/2, +vx/2)
  (`0x481A05`).

### Trefferprüfung Boss (`CheckColision`, Tabelle `0x452154`)

- L1, 4, 5, 6, 10 nutzen den gemeinsamen Test `0x448A3E`: Zeilenmaske des aktuellen Frames (Algorithmus wie
  bei Gegnern) gegen `Me.3A0`.
- Treffer: Funken `Addpartikel` (1, bei Schaden ≥ 3: 10), **Ergebnis 0** (Schuss absorbiert), `HP −=
  Schaden`. Schaden 500: `HP −= Me.260`, `Me.260 = 0` (Sonderwaffe, *mittel*).
- **Kein Zustandstest**: der Boss schluckt Schüsse auch während der Explosion.
- Der Spieler testet mit Schaden 0 → Ergebnis 0 → **Berührung eines Bossteils ist tödlich**.

### Tod (gemeinsames Muster)

Pro Tick im Sterbezustand: bei Rnd < 0,1 `AddCircle` an (x + Rnd·w′, y + Rnd·h′),
Radius `Int(Rnd·70)+30` (*mittel*); eine `AddExplosion` an
(x + Int(Rnd·A), y + Int(Rnd·B)); `Addpartikel` (x, y)–(x+C, y+D). Einmalig
Punkte **+10000** (L10: +10000·`Me.638`; **L3: keine**), dann `Me.264 = True`.
Der Sterbezustand läuft bis zum Levelwechsel weiter.

## Die Bosse

### Level 1 — E1 „End-Rechts" (Typ 8, 198×150, 3 Frames)

- Start (640, 100), HP 5000.
- Zustand 1: x −= 2 bis x ≤ 442, dann vy = 1.
- Zustand 2: Frame alle 5 Ticks (0-1-2); y ± 1, Umkehr bei y+vy < −f0 oder y+vy+f1 > 410. Alle 6 Ticks 2 ×
  art 3 an (x, y+28) und (x, y+h−26). HP ≤ 0 → Zustand 4.
- Zustand 4: Kreise 145×90, Explosionen 230×100, Partikel bis (x+290, y+180), +10000, `Me.264`.

### Level 2 — E2 Hauptteil + zwei Geschütze

| Teil | Typ | Größe | HP | Start | vx |
|---|---|---|---|---|---|
| Haupt „6 - Endgegner" | 6 | 165×142 | 6000 | (640, 140) | — |
| A „7 - End oben" | 7 | 130×75 | 1500 | (−130, 0) | −3 |
| B „8 - End unten" | 8 | 129×75 | 1500 | (−130, 340) | +2 |

- Zustand 1: Haupt x −= 1 bis ≤ 475, beide Geschütze x += 1.
- Geschützzyklus: Timer +1/Tick (+2 bei Haupt-HP ≤ 1000). Timer 1…51: Geschütze bewegen sich, Umkehr bei x <
  −50 oder x > 505. Timer 52: A feuert `AddEndS` Typ 2 an (A.x+58, A.y+62), vy +4; B an (B.x+58, B.y), vy −4
  (Kugel-Sprite). Timer ≥ 66 → 0. Zyklus 66 bzw. 33 Ticks. Ist der Timer beim Wechsel auf +2 ungerade,
  entfällt die 52 bis zum nächsten Reset (*mittel*).
- Hauptteil: Winkel +4°/Tick, y = FpI4(sin·70 + 140). Alle 200 Ticks zwei Raketen (`AddEndS` Typ 3,
  (0,151)–(42,167), vx −4) an (x+120, y+5) und (x+120, y+118).
- Trefferreihenfolge (`0x449350`): A (wenn HP > 0), B, Haupt. Der Hauptteil ist jederzeit verwundbar. Stirbt
  ein Geschütz: Überschuss −HP (Schuss fliegt weiter), `AddCircle` + 4 Explosionen; es wird nicht mehr
  gezeichnet.
- Tod (Zustand 3): A.y −= 1, B.y += 1 pro Tick, Explosionen (w−40)×(h−40), +10000.

### Level 3 — E3 drei Fische „EndG<-- (16)" (106×96), schießen nicht

- HP je 4000; **der dritte Fisch existiert nur bei `Me.638` > 1,1** (`0x462A93`), sonst HP 0.
- Start x = 640 (Fisch 3: −106), y = 157.
- x und y laufen unabhängig auf Pfaden im Objekt `Me.27E8`: am Segmentende N = `Int(Rnd·100)+50` Schritte,
  Ziel `Int(Rnd·640) − w/2` (bzw. `Int(Rnd·410) − h/2`), Position = round(p0 + half − half·cos(k·π/N)).
- Positionen in `Me.3A0/3A4`, `3A8/3AC`, `3B0/3B4`.
- Trefferprüfung `0x44B44F`; ein toter Fisch gibt Explosionen und Überschuss.
- Alle HP ≤ 0 → `Me.264`. **Keine Punkte.**

### Level 4 — E4 „14 - Endgegner" (283×161, HP 10000)

Start (180, −160). Zustand 4 wählt `Int(Rnd·3)+1`:

1. **Ufos:** y läuft gegen 0 (+2 unter 0, sonst −1). Bei y = 0 wird **Pattern #100** geschrieben (`Me.40C +
   0xA1B8`, 414 Byte pro Pattern): (x+112, 128) → (x+112, 200) → 10 Zufallspunkte `(Int(Rnd·584),
   Int(Rnd·378))` → (x+112, −32) → Ende. Darauf 10 × Typ 13 „kleines Ufo", eines alle 16 Ticks. Dann y −= 1
   bis y < −170; sobald keine Gegner mehr leben (`Me.45C = −1`, höchster belegter Slot) → Zustand 4.
2. **Gezielte Schüsse:** Bewegung nach (180, 225) mit 3/2/1 px je nach Abstand; dann y −= 1/Tick und alle 11
   Ticks art 1 an (x+140, y+80). Nach 30 Schüssen → Zustand 4.
3. **Strahl:** y → 0; x pendelt ±5 zwischen −100 und 460. Nach Zufallsverzug 10…99, wenn der Spieler unter
   dem Emitter steht (x+100 < pX+35 und x+171 > pX): 30 Ticks Laden; Halbbreite w wächst 0→35 (+1/Tick), 30
   Ticks halten, 35→0; Strahl um x+142, y 161…410. Tötet bei horizontaler Überlappung, wenn das Schiff lebt
   und `Me.15C = 255` ist (*mittel*).

Tod: Zustand 5 (Explosionen 230×110).

### Level 5 — E5 „16 - Endgegner" (239×165, HP 8000)

- Alle 255 Ticks Boden-Tile #1 (255×25) an (640, 384), vx −1: laufender Boden.
- Start (640, 100). Zustand 1: x −= 2 bis 360.
- Zustand 2: vy ± 2 zwischen 0 und y+h = 384. Alle 36 Ticks 3 Feuerbälle an (x+82, y+17), (x, y+82), (x+82,
  y+148) — der Code nutzt (b−t)/2, gemeint war wohl w/2. Phasenzähler +1 je Salve, bei 30 → Zustand 5. Ist
  der Zähler negativ, fällt je Salve zusätzlich ein Zapfen.
- Zustand 5: y −= 10 bis y < 0. Zustand 6: y += 10, landet bei y = 219.
- Zustand 7: alle 51 Ticks ein **Zapfen** (Typ 7, 50×109, HP 100000, Code −6 mit vy 16 → fällt 5 px/Tick) an
  x = Spieler-X, y = −110. Nach 3 → Zustand 2 mit Zähler −4 (4 weitere Zapfen in den nächsten Salven).

### Level 6 — E6 „8/9 - Endgegner" (289×185, Blick links/rechts)

- **Phase 1**, HP 4500: Einflug von 640 auf x = 320 (2 px/Tick), y = 12. Patrouille y ± 4 zwischen 0 und
  225. Bei Abklingzeit 0 und y ≤ pY ≤ y+160: 9 Ticks Anlauf, Sound, **Dash nach links mit 14 px/Tick** bis x
  ≤ −212, dann mit +7 zurück auf genau 320. Neue Abklingzeit `Int(Rnd·90)+10`.
- HP ≤ 0: Dash mit Explosionen, `Me.15C = 0` (Spieler unverwundbar); bei x ≤ −200 → **Phase 2**, HP 1200:
  schnelle Durchflüge mit 15 px/Tick in Zufallshöhe (0…225), rechts→links (Typ 8), nach 40 Ticks
  links→rechts (Typ 9), seltener gezielter Schuss (Rnd < 0,002); setzt in den ersten 40 Ticks `Me.15C =
  255`.
- Stirbt Phase 2 außerhalb des Bildes → **Phase 3** = Phase 1 erneut (HP 4500, Flag +24 = 1); deren Tod →
  Zustand 4, +10000. Gesamt-HP 10200.

### Level 7 — E7 Scanner-/Spiegelboss (*mittel*)

Typen 10/11 (170×90), Typ 12 „Option" (38×39).

- **Zustand 1** (551 Ticks, Punktestand eingefroren): Scan-Animation. Bei Tick 199 zehn stehende Extras
  (`AddExtra2`): Art 1/2/3 bei x 400/450/500 × y 100/200/300 sowie Art 0 an (550, 200). Texte „Scaning
  DOVE", Optionenzahl, Strahlart (Normal/Blue/Green/Red/Beam aus `Me.540`/`Me.544`). Bei Tick 441 werden
  alle Extras entfernt, Text „Scaning successfull".
- Dann HP 3000, x = 700, y = 157; Einflug bis x = 470. Angriffszustand = 3 + gescannte Waffe:

| Zustand | Waffe | Angriff |
|---|---|---|
| 3 | Normal | Kugel vx −6 alle 10 Ticks |
| 4 | Blue | alle 30 Ticks, plus geladener Strahl |
| 5 | Green | alle 50 Ticks, 4 fallende Tiles |
| 6 | Red | 5 Schüsse alle 15 Ticks |
| 7 | Beam | Laden bei 100, tödlicher Strahl |

- Zufallsbewegung (±3 für 5…54 Ticks) in x 100/300…500, y −20…340.
- Hat der Spieler Optionen (`Me.54C`), bekommt der Boss 1–2 Optionen auf Radius 150 (+3°/Tick). Sie
  absorbieren Schüsse ohne Schaden (`0x44DD95`).
- HP ≤ 0: `Me.15C = 100`, Rückzug x += 2 bis 700, neuer Scan. **Sieg erst beim
  2. Abschuss (Faktor < 1,1) bzw. 3. (Faktor > 1,1)** (`0x469C84`). Sieg → +10000, `Me.264`.

### Level 8 — E8 Kern „21 - real Endgegner" (108×154, HP 15000) + Hülle „20 - Endgegner" (182×216)

- Start (640, 315). Zustand 1: x −= 5 bis 535.
- Zustand 2 (1000 Ticks): y = FpI4(cos(a1)·187 + 128), a1 += 4°; x = FpI4(cos(a2)·100 + 435), a2 += 3°. Alle
  4 Ticks **Mine** (Typ 22, 18×20, HP 100, vx −7) an (x, y+72).
- Zustand 3: Kern parkt bei (533, 128); die Hülle gleitet von x = −190 mit +3 auf 441 (y = 95).
- Zustand 4 (~1020 Ticks, **Sog**): Spieler-X += (c−30)\10 für c < 100, dann +7, +8 ab 650, +9 ab 700; aktiv
  für c = 31…949. Partikelströme aus der Hülle; der Kern folgt pY−66 mit 10 px/Tick und ±9 cos-Wackeln.
- Zustand 5: Hülle fährt ab (−8/Tick), zurück zu Zustand 2.
- Die Hülle ist unverwundbar und schluckt Schüsse (`0x44F726`).
- Tod: Zustand 6, +10000, die Hülle sinkt (y + 1/Tick).

### Level 10 — E10 „1" (330×302, HP 19020) (*mittel*)

- Einflug x −= 2 bis 310, y = 54; alle 20 Ticks gezielter Schuss.
- Zustand 2 (180 Ticks): x = 260 + 50·sin(a); y = 54 + 151·sin(b) für eine Periode, dann 54. Alle 20 Ticks
  gezielter Schuss + Feuerball.
- Zustand 3: vy ± 1 (nur obere Grenze 205). Steht pY in einem von drei Kanonenbändern (y+13…63, y+121…189,
  y+247…289) → Zustand 4.
- Zustand 4: c = 40 Sound; c = 41…150 drei tödliche waagrechte Strahlen, die 10 px/Tick nach links wachsen;
  c = 200 drei Raketen (vx −4) → Zustand 5.
- Zustand 5: x += 1 bis 700; **4 verfolgende „2"** (46×49, HP 500, Code −2) aus den Ecken.
- Zustand 6: warten auf `Me.45C = −1` → Zustand 1.
- Tod: +10000·Faktor.

## Levelende (`0x4716CF`–`0x471D6C`)

Solange `Me.264` gesetzt ist und das Schiff lebt (`Me.644 = 0`), Autopilot mit
lokalem Zähler E:

- E = 0: `BeamAbschuss` (geladener Strahl geht los), `Me.15C = 0` (255 Ticks unverwundbar), Sound 13 aus.
- E < 30: E += 1 (30 Ticks Pause).
- Danach pY → 195 mit ±6/4/2/1 (Schwellen unten 110/170/190, oben 300/220/200), Neigung `Me.14C` 2 bzw. 1.
- Bei pY = 195: Sound 2 mit Zufalls-Pan, dann **pX += 9/Tick bis pX > 710** → `Me.690 = 3` beendet die
  Hauptschleife. Die Tastatur ist abgekoppelt (*mittel*).
- **Keine Bonuspunkte.**

Nach der Schleife (`0x48EDAF`):

- Tutorial (Level 0) → `Me.690 = 1`, zurück ins Menü (*mittel*). `Me.634 > 2` → 2.
- `Me.690 = 3`, `Data\level(n+1).dat` existiert und n < 10: `Me.39A = 0`, `Me.530 = 0`, `F4 = 0`, Level +=
  1; bei `Me.2FC = 0` und `Me.638` > 1,0 wird das Level in der Levelauswahl **freigeschaltet** (`Me.2F0(n) =
  True`, `SaveData`). Dann `LevelLaden`, `PlayMusik "S"&n`, `Get_Ready`.
- Sonst: nach Level 10 `HighScore` + **`ShowOutro`**; nach Level 11 endet der Lauf (`Me.690 = 2`).

Reihenfolge 1 → 2 → … → 10. Level 11 ist nur separat erreichbar. Namen aus
`Get_Ready` (`0x45D934`):

0 Tutorial, 1 Lost In Space, 2 Factory, 3 Deep Blue See, 4 Back in Space, 5 Crystal Cave, 6 Speed,
7 The Unreal World, 8 DOVE INSIDE, 9 Final Level, 10 Final Fight, 11 ExtraLevel.

Levelende ohne Boss setzt `Me.264 = True` und `Me.15C = 0` (`0x441CB0`):
L0 bei Tick 4500, L11 bei 7300, L9 bei 8000 (Faktor < 1,1) sonst 15600.

## Levelskripte (Evente `0x43D6B0`, Tabelle `0x445400`)

### Level 0 — Tutorial

Sprache nach `Me.350` (gesetzt = Deutsch). Tasten werden eingesetzt
(Großschreibung per Laufzeitfunktion, *mittel*).

| Tick | Deutsch | Englisch |
|---|---|---|
| 0 | So, und los geht's! Du steuerst mit den Pfeiltasten oder dem Zifferblock | OK, let's go! You navigate the spaceship with the arrow keys or the key pad. |
| 50 | Uh, da kommt ein Gegner! Du schießt mit S! Mach ihn fertig! | Oh, an enemy is coming! You fire with S! Blow him away! |
| 420 (Erfolg) | Gut gemacht! | yeah! you made it! |
| 420 (Fehlschlag) | Ok, wir versuchen es nochmal! Drücke S zum schießen! | OK, try again! In order to fire press S. |
| 500 | Da sind zwei Extras! Sammel sie ein! | There're two Specials! Take them! |
| 1250 | OK, mit D kannst du deine Extrawaffe nach hinten ausrichten! Probier' es aus! Nur einmal drücken! | OK, press D to put your special weapon on the back! Try it! Press only once! |
| 1300 | Hast du gesehen, wie sich der Balken in deiner Anzeige bewegt hat? | Great! Did your see the bar on the screen move? |
| 1500 | Uh, hier sind Wände, nicht anstoßen! Sie können die DOVE zerstören! | Be careful, contacting the walls can destroy your spaceship! |
| 1800 | Du kannst Q oder F drücken um langsamer zu fliegen. | Press Q or F  to slow down. |
| 2200 | Mit W oder G Kannst du wieder schnell werden | Press W or G to speed up. |
| 2650 | Nun lade mit A deinen Beam komplett auf | Hold key A down to fill up your BigShot device completely. |
| 2800 | warte bis drei Beißer auf dem Bildschirm sind und lass dann A los | Wait for tree biter to enter the scenery, then take off from key A. |
| 3400 | Neben den zwei extraarten die du schon kennst gibt es noch zwei weitere | Besides these two special device, you learned about, there are two more. |
| 3800 | die bombe (das obere extra) und das schild, das schüsse der Gegner abwehrt | The bomb (the upper special) and the shield, that protects you from shots. |
| 4200 | So das war schon alles was man wissen muss! Viel Spaß und nicht verzweifeln! | OK, that's all you have to know to play the game! Have fun, and don't despair! |

Die Texte stehen bei `0x40D8DC`–`0x40E6DC` (Tippfehler wie im Original).
Bei Tick 2, 1200 und 2600 wird der Text gelöscht (*mittel*).

Sperren und Rücksprünge (Richtung der Bedingungen *mittel*):

- 420: Punktestand = 0 → Fehlschlagtext und F4 := 50.
- 501…1180: sobald `Me.54C = 1`, `Me.540 = 3`, `Me.544 = 0` → F4 := 1200. Bei 1181: Waffen zurücksetzen, F4
  := 500.
- 1251…1298: wartet auf `Me.25C` (Extrawaffe nach hinten); bei 1299 F4 := 1201.
- 1450: setzt den Waffenzustand.
- 2651…2798: F4 := 2800, sobald `Me.354 = 200` (Beam voll); bei 2799 F4 := 2651.
- 4500: Levelende.

### Level 1–11

Ohne eigenes Skript außer Fade + Boss: L2 (Boss 7850), L4 (8000), L10 (Fade 650–749, Boss 750). L1:
Warp-Intro und Meteore (siehe [`dove-events.md`](dove-events.md)), Fade 6750–6849, Boss 6850. L3 Boss 8710,
L5 7500, L6 8000, L7 8100, L8 10300 (Fade ab 10200). L9: nur Endbedingungen; L11: Ende bei 7300.

**Level 3:**

- Jeden Tick bei Rnd < 0,002 ein Deko-Objekt im Pool `Me.388` (6 Slots, Surface `Me.6A8`) an x =
  `Int(Rnd·940) − 150`, y = 410. Steigt 1 px/Tick mit x-Schwingung 10·sin(t/10), entfernt bei y < −179
  (*mittel*).
- **Fallende Decken** (`0x43F985` ff.):

| Tick | Aktion |
|---|---|
| 4250 | Tile-Slot 8: vy = 4, 2 × 50 Partikel |
| 4317 | Slot 8: vy = 0, 100 Partikel |
| 5680 | Slot 0: vy = 4 |
| 5690 | Slot 8: vy = 4 |
| 5717 | Slot 0: vy = 0 |
| 5765 | Slot 8: vy = 0 |

**Der Code greift auf feste Pool-Slots 0 und 8 von `Me.58C` zu** — der Port muss die Slotvergabe der Tiles
exakt nachbilden.

**Level 5** (läuft nach der Token-Schleife, `0x444C71`, **auch im Bosskampf**):

- 2136: merkt sich die eben gespawnte „riesen Pflanze" (`Me.64C = Me.458 − 1`) und verfolgt ihre Position.
  Verschwindet sie vor Tick 2835: 400 Partikel, Wackeln `Me.170 = 20`, 10 Explosionen auf 217×136.
- 3949: merkt sich „Wand" und Tile #2 (Slot = `Me.598 − 1`). Ist die Wand weg: Wackeln 5, dann Tile-y +=
  1/Tick bis y = 155, danach Sound und Wackeln 10.

**Level 6** (Warp):

- `Me.198 = 9,0` bei Tick 0, 1882, 3000, 5122, 7800, 7900 (Checkpoints und Neusetzen). Bei 1882 zusätzlich:
  ist `Me.348` gesetzt, Spieler-Y = 60.
- Alle 25 Ticks vor 7900: Tile #1 „H-Oben" an (640, 0), vx −10 (schnelle Decke). Bei 3400 und 6100 bekommt
  dieses Tile vy = 2, dazu Sound und Wackeln 5.
- 1840 und 2350: Tile #10 an (640, 44), vx −10.
- 1887: Tile-Slot 0 deaktiviert (Hinweis zurückgesetzt), 50 Partikel, 7 Explosionen, Sound.
- 4700: Tile #15 an (455, 128), vx −1, vy −1; `Me.64C = Me.598`. 4785: vy dieses Slots = 0, Partikel,
  Wackeln 5. **Off-by-one im Original**: `Me.598` ist Slot + 1 (`0x43BE44`), getroffen wird also der falsche
  Slot.
- 7981–7999: `Me.198 = (8000 − F4) \ 2`.

**Level 7:** `AddBand(x = 640, y = pY−25, w = 100, h = 70, Tempo 7)` bei Tick 0,
1600, 2000, 2300, 2600, 2800, 3000, 4000, 5300, 6000, 7000, 7500. Das Band läuft
mit −7/Tick, solange x > 100. Überlappt es das Schiff, sinkt die
Schiffsgeschwindigkeit `Me.184` um 1 pro Tick, dazu der Text „Benutze W oder G um
wieder schneller zu fliegen" / „USE W or G to fly faster again" (`0x487146`).

**Level 8:** `AddWind(stärke, x = 640, breite)`; die Zonen scrollen mit 1 px/Tick.
Liegt pX+20 in einer Zone, gilt `pY += stärke`, sofern das Ergebnis in 0…410
bleibt (`0x439B5F`). Pool `Me.620`, 4 Slots.

| Tick | Stärke | Breite |
|---|---|---|
| 4355 | 2 | 143 |
| 4608 | 2 | 286 |
| 4894 | −2 | 143 |
| 5037 | 2 | 286 |
| 8091 | 2 | 143 |
| 8234 | −2 | 143 |
| 8377 | 2 | 143 |
| 8520 | −2 | 143 |
| 8663 | 4 | 286 |
| 8806 | 2 | 143 |

Die Lüfter-Gegner bei 4751, 5179 und 8666 haben keinen Wind (8666 gegenüber 8663:
3 Ticks Versatz).

## Meteor-Pool `Me.214`

- Spawnt nur in Level 1 (`0x43F459`), 11 Slots.
- Datensatz 28 Byte: +0 x, +4 y, +8 HP 150, +C vx −4, +10 vy = `Int(Rnd·3) − 1` (neu gewürfelt, bis (vx, vy)
  ≠ 0), +14 aktiv, +18 Punkte 150.
- Pro Tick `x += vx; y += vy`; entfernt bei x > 639, x < −60, y < −60, y > 410 (`0x476C90`). Gezeichnet
  60×60 aus Surface `Me.6AC`, keine Animation.
- Trefferprüfung in `CheckColision` bei `0x4509FA`, nach dem Boss und vor den Gegnern, mit runden
  Zeilenmasken `Me.7D0` / `Me.7EC`. Treffer: `HP −= Schaden`.
- Tod: Punkte += `Int(150 · Faktor)` (auch im Bosskampf), Partikel, Kreis, Sound mit Pan `Int(Rnd·101) −
  50`.
- Berührung tötet den Spieler (Schaden-0-Regel).

## Offen

- Vorhang-Übergang B1–B5 nicht gefunden; im Übergang nur `Get_Ready` und `FastFadeOut` gesehen.
- Argumentreihenfolge von `AddCircle`; erstes Argument von `Addpartikel` (Anzahl oder Art).
- Genaue Strahl-Trefferboxen von E4, E7 und E10 (*mittel*).
- E7: Angriffe Blue/Green/Red und der Green-Tile-Trick vollständig dekodieren (hängen am Waffensystem).
- Bedeutung von `Me.348` (L6, Tick 1882) und `Me.2FC` (unterdrückt die Freischaltung; vermutlich Cheat bzw.
  Levelauswahl).
- E10 Zustand 3 hat nur eine obere y-Grenze; der Boss könnte endlos nach oben driften (*niedrig*).
- Ungenutzte Records: L1 „End-Links" / „kleiner Endgegner" und L3 „EndG--> (17)" kommen weder im Bosscode
  noch in Events vor.
- Tutorial: Tick 1 (Vergleich über `__vbaVarCmpEq`) nicht gedeutet (*niedrig*).
