# DoveZ — Laufzeitstrukturen (statisch aus `DoveZ.exe`)

Stand: M7-Vorarbeit für M8. Quelle: UPX-entpackte `DoveZ.exe`,
`objdump -d -M intel`, Image-Base `0x400000`; Methoden und Formatbefund in
[`../formats/dovez-level-dat.md`](../formats/dovez-level-dat.md). Nichts hier ist
am laufenden Original gemessen. Konfidenz *hoch*, wo nicht anders vermerkt.

## Gegner-Instanz (`[0x588110]`, 101 × 0xF0)

`0x58811C` erster freier Slot, `0x588120` höchster belegter, `0x5882A8` Boss lebt.
`AddEnemy` (`0x575FF0`, Argumente Typ, Route, Tick, y, x) kopiert den Typ
(0x60 Byte, Teile tief kopiert) und setzt:

| Offset | Typ | Bedeutung |
|---|---|---|
| +0x00…+0x5F | Typ | Kopie des Gegnertyps; Teile mit Laufzeitfeldern (s. u.) |
| +0x60 | Long | Route |
| +0x64 / +0x68 | Single | x / y (Zeitleiste: x = 800) |
| +0x6C | Integer | aktiv (−1) |
| +0x70 | Long | Befehlszeiger der Route |
| +0x74 / +0x78 | Single | vx / vy (auch Richtungsbilder) |
| +0x7C | Single | Wartezähler |
| +0x80 | Single[8] | Lokale L0…L7 (L0…L5 beim Spawn genullt) |
| +0xA0 | Single[14] | Register R0…R13 (mit den Teilen geteilt) |
| +0xD8 | Long | Spawn-Tick |
| +0xDC | Long | Spawn-y |
| +0xE0 | Long | Zustands-Tickzähler |
| +0xE4 | Long | Todeszustand 0–7 |
| +0xE8 | Integer | ≠ 0: Zustandsmaschine statt Route/Zeichnen/Kollision |
| +0xEC | Long | Zielspieler, `Int(Rnd · Spielerzahl)` |

Laufzeitfelder je Teil: +0x3C Bild, +0x40 Bildtimer (−10 halten), +0x44
sichtbar/lebt, +0x48 Punkte (`CInt(hitPoints)`), +0x4C Feuerzähler,
+0x50…+0x5C Routenzustand (ip, vx, vy, Warten), +0x60 Lokale, +0x80
Routentempo (1,0), +0x84 Aufblitzen (Ticks).

Todeszustände (`+0xE4`): 0 eingefroren (Nova), 1 und 2 besondere
Spielerzustände, 3 Trümmer (`wreckGroup`), 4 Boss, 5 explosiv
(`explosionSpec`, nach 15 Ticks), 6 normale Explosion (Punkte, Kombo + 1),
7 Kettenexplosion (`bigDeath`).

## Waffen-Emitter (`Me.C0C`, 51 × 0x78)

| Offset | Typ | Bedeutung |
|---|---|---|
| +0x00 | Long | Waffe |
| +0x04 / +0x08 | Long | Gegner und Teil, −1: freier Emitter |
| +0x0C | Integer | aktiv |
| +0x10 | Long[10] | verbleibende Schüsse je Salve (Start `repeat`) |
| +0x3C | Long[10] | Verzögerung je Salve (Start `startDelay`) |
| +0x68 | Long | bisher gefeuert = Nummer des nächsten Schusses |
| +0x6C / +0x70 | Single | Ursprung eines freien Emitters |
| +0x74 | Long | Zielspieler |

Je Tick und Salve `j`: solange weder `delay[j] > 0` noch `left[j] < 0`:
feuern, `fired++`, `left[j]--`, bei `left[j] ≥ 0` `delay[j] = interval`; danach
`delay[j]--`. Der Emitter stirbt, wenn alle Salven leer sind oder sein Teil tot
ist. Ursprung: Bildmitte des Teils (bei `muzzleRotated` an den Rand gedreht)
plus `offsetX/Y`.

## Gegnerschuss (`Me.BE8`, 501 × 0x114)

| Offset | Typ | Bedeutung |
|---|---|---|
| +0x00 / +0x04 | Single | x / y (links oben) |
| +0x08 / +0x0C | Single | vx / vy |
| +0x10 | Integer | aktiv |
| +0x14 | Single | Schaden (`Var` 32768) |
| +0x18 / +0x1C | Long | Route (−1 geradeaus) / Befehlszeiger |
| +0x20 / +0x24 | Long | Bild / Bildtimer |
| +0x28 | Single | Tempo |
| +0x2C | Long | Nummer im Emitter (`Var` 32760); −1: Druckwelle (*mittel*) |
| +0x30 / +0x34 | Long | Waffe / Salve |
| +0x38 | Single[8] | Lokale |
| +0x58 | Long[4] | Trefferbox |
| +0x68 / +0x9C / +0xD0 | [13] | Spur: x, y, Surface |
| +0x104 / +0x108 | Single | Alpha, Alpha-Schritt |
| +0x10C | Single | Wartezähler |
| +0x110 | Long | Zielspieler der Route; nie geschrieben, also immer Spieler 1 |

Gezielt: Winkel von der linken oberen Ecke zum Spieler + (28, 31). Ist beim
Spieler `+0xA8 = 1` gesetzt (vermutlich getarnt), streut der Zielpunkt um 64 px.

## Effekt-Animation (`0x588140`, 301 × 0x1C)

| Offset | Typ | Bedeutung |
|---|---|---|
| +0x00 | Long | Ebene 0–6 |
| +0x04 | Long | Animation |
| +0x08 | Integer | aktiv |
| +0x0C / +0x10 | Single | Ursprung |
| +0x14 | Array | Spurzustände à 0x34: x, y, r, g, b, a, Drehung, Bild, sichtbar, scaleX, scaleY, Key, Bildtimer |
| +0x18 | Long | Zeit seit Spawn |

`AddAnima(Ebene, Anim, y, [x])`: mit `scrollWithLayer` Ursprung
(800 + Nachkomma der Ebene, y), sonst (0, 0). Je Tick scrollt sie mit der Ebene,
interpoliert jede Spur zwischen den Keys (Deltas beim Laden vorberechnet) und
stirbt nach `duration` (außer `loop`) oder links außerhalb. Zeichenpfad nach
Gruppe: D3D-Quad mit Farbe/Drehung/Blend oder DirectDraw-Blit ohne diese.
