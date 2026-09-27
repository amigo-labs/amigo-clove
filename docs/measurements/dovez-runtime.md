# DoveZ — Laufzeitstrukturen (statisch aus `DoveZ.exe`)

Stand: M8. Quelle: UPX-entpackte `DoveZ.exe`, `objdump -d -M intel`,
Image-Base `0x400000`; Methoden und Formatbefund in
[`../formats/dovez-level-dat.md`](../formats/dovez-level-dat.md). Nichts hier ist
am laufenden Original gemessen. Konfidenz *hoch*, wo nicht anders vermerkt.
Umsetzung: `packages/game-dovez/src/sim/` (`world.ts` Tick, `layers.ts`,
`anims.ts`, `enemies.ts`, `enemyFire.ts`, `player.ts`, `playerShots.ts`).

**Methodennamen:** Die Namensliste im VB-Objektkopf steht nicht in
vtable-Reihenfolge. Bis etwa `LadeDaten` passt sie, danach ist der echte Name
`names[Index + 3]` (vtable-Offset `0x6E0 + 4·Index`), ab Offset `0x940` `+5`, im
Bereich der `Taste*`-Methoden `+10`. Funktionen daher nach Inhalt bestimmen; die
hier genannten Adressen sind so geprüft.

## Hauptschleife `SpielLoop` (`0x53D170`)

**Takt 16 ms (62,5 Hz):** Jeder Durchlauf endet mit `Wait(16 + Me.1C8)`
(`0x53F772`), `Me.1C8` ist immer 0. Uhr `GetTickCount`. Liegt die Schleife mehr
als einen Takt zurück und wurde der letzte Tick gezeichnet, läuft der nächste
ohne Zeichnen (höchstens einer in Folge); ist sie danach noch zurück, wird der
Plan auf „jetzt“ gesetzt — verlorene Zeit wird nie nachgeholt. *(Der Port nutzt
`FixedStepLoop` mit bis zu 5 Ticks Aufholen; Abweichung nur bei Lastspitzen.)*

Reihenfolge je Tick („Nova“ = Super-Nova läuft, `Me.D6C`; dann ruhen Zeitleiste,
Ebenen, Eingabe, Schüsse, Emitter, Gegnerschüsse — Gegner, Partikel, HUD laufen):

1. Eingabe abfragen; `SpielObjektAnimationen` (DoAni für jede Gruppe, globaler
   Bildzähler der Kacheln).
2. außer Nova: Musik-Fade; Zeitleiste (`0x50C9F0`), am Ende `Me.584 += 1` und
   Levelende-Prüfungen. Gegner, die in Tick T spawnen, bewegen sich noch in T.
3. Hintergrund.
4. außer Nova: Ebenen 0, 1, 2, 5 je mit ihren Animationen; Checkpoint;
   Spielereingabe und -bewegung (`SpielKeysDove` `0x507DB0`).
5. Partikel; Drohnen; außer Nova: Abfeuern (`SpielSchieß` `0x4E2C20`),
   Spielerschüsse Ebene 0, Power-ups.
6. Schiff zeichnen (`SpielMoveDove` `0x509110`), **Gegner** (`0x4B5850`, auch
   während Nova), Blasen.
7. außer Nova: Animationen der Ebene 4, **Ebene 3 (Landschaft, über Gegnern und
   Schiff gezeichnet)**.
8. außer Nova: Spielerschüsse Ebene 1, Animationen 3, Emitter, Beam.
9. Nova, Partikel, außer Nova: **Gegnerschüsse**; Satelliten, Punkteanzeigen.
10. außer Nova: Wetter, Checkpoint, **Ebene 6** mit Animationen, Wasser.
11. Erschütterung; außer Nova: **Kontakt** (`SpielFeindberührung` `0x50B710`);
    Abblenden in den letzten 50 Ticks; HUD.

Zeichenreihenfolge der Ebenen damit 0, 1, 2, 5, [Schiff, Gegner], 4, 3, 6.

## Levelstart, Vorlauf, Levelende

- `Me.584 = Me.560`; `Me.560` ist 0, außer mit der Kommandozeile `-Tick N`
  (im Port die URL-Option `from=`).
- **Vorlauf** `SpielPastTicks` (`0x50D230`): Je Ebene mit Geschwindigkeit ≠ 0
  laufen die Ticks `T − Int(900 / speed) … T − 1` durch; Kacheln (kind 0) werden
  bei `x = 800 − Int(Alter · speed)` platziert, immer mit Slot-Modus 0. Das
  erklärt die **118 Einträge mit negativem Tick**: 117 sind vorplatzierte
  Kacheln, ein kind-1-Eintrag feuert nie.
- `Me.584 = Me.588 − 150`: Levelausflug der Spieler; `Me.588`: Level geschafft.
  Bosslevel (Länge 99999) enden über den Boss-Tod: Bei Zustandstimer 520 setzt
  er `Me.584 = Me.588 − 151`.
- Neustart nach Tod stellt einen Welt-Schnappschuss vom Checkpoint her, aber nur
  für die Ebenen 1–6 — Ebene 0 fehlt danach, bis ein neuer Eintrag kommt.
  *(Im Port noch nicht: Tod startet das Level neu.)*

## Ebenen, Kacheln, Hintergrund

Kachel-Pools je Ebene 11 / 51 / 21 / 101 / – / 21 / 16 Slots, Kachel 0x18 Byte:
x, y, Gruppe, vx = −speed beim Spawn, vy, aktiv. `AddLandschaft(Ebene, Gruppe,
y, x, slot)` (`0x4EA200`): x = scrollPos + 800; `slot` 0 erster freier, n > 0
ab highWater + n (liegt über allen vorhandenen). Je Tick
`scrollPos = Nachkomma(scrollPos − speed)`, Kacheln x += vx, entfernt erst
ganz links außerhalb. Route op 24 ändert nur künftige Kacheln, op 25 auch die
vorhandenen. Kacheln animieren über den **globalen** Bildzähler ihrer Gruppe.

Hintergrund (`Me.7CC`): Bild (Feld `background` ist ein Dateiname) wird mit
Periode 800 gekachelt und scrollt mit Ebene 0; Zahlen wählen prozedurale
Varianten: 2 Sternenfeld, 3 grauer Schleier, 5 Himmel mit Wolken, 6 Sterne
mit wachsendem Tempo (Details *mittel*; im Port bisher Farbflächen).

## Terrain-Kollision `CheckColisionWithLandschaft3` (`0x4C5EE0`)

Kasten [x1, x2) × [y1, y2) gegen die aktiven Kacheln **nur der Ebene 3** und die
sichtbaren Teile fester Gegner (`solid > 0`, lebend, nicht im Todeszustand,
nicht der ausgenommene). Je Objekt erst das Rechteck (Quell-RECT links/rechts,
belegte Zeilen oben/unten), dann die Zeilenspannen der überdeckten Zeilen zu
einem Intervall [min links, max rechts] vereinigt und mit dem Kasten verglichen
— **kein Pixeltest**. Positionen mit `CLng`, Zeichnen mit `Int`. Spannen aus
`LadeRänder` (`0x4EF710`, `.r`-Dateien), in BMP-Koordinaten.

## Power-ups (`AddSpezialObjekt`, `SpielMoveSpezialObjekt` `0x4D1910`)

Zeitleisten-Arten 2, 4, 5, 6 (nur Ebene 3) → Untertyp kind − 2. Pool 16 × 0x28.
6 Bilder zu je 3 Ticks, weg bei x < −64. Eingesammelt, wenn die Spieler-Hitbox
die mittleren 32 × 32 des 64 × 64-Sprites überlappt: 1000 Punkte plus Wirkung.
Untertyp 0 (`Extra<a><f>`, Schiff 0) und 4 (`P2Extra`, Schiff 1): Waffenstufen;
Untertyp 3 (`Pow<a><f>`): 2/3 Tempo ±1, 4 Schussstärke +1 für alle (max 3),
5 Energie +50, 6 Schild 200 Ticks, 7/8/9 Zweitwaffe. Mit einem Spieler
erscheinen Waffen-Power-ups nur für das gewählte Schiff.

## Spieler (`Me.B48[p]` 0x70, Typ-Record `Me.A7C[p]` 0xAC)

- **Eingabe:** DirectInput, je Tick in ein Tastenfeld nach DIK-Code. Aktionen
  links, hoch, rechts, runter, Feuer, Beam, Satellit/Partikel wechseln,
  Force/Beam-Modus, Partikel drehen, Super-Nova. Ein Spieler: Pfeile, S, A, D,
  Q, W, E. Zwei Spieler: IJKL bzw. Ziffernblock mit eigener Belegung.
- **Bewegung „Arcade“ (Vorgabe):** keine Trägheit, `CLng(speed)` px je Achse
  (Start 6, unter Wasser −3, mindestens 1), Diagonalen nicht normiert.
  „Realistisch“ gleitet nach dem Loslassen mit ×0,85 je Tick aus.
- Grenzen x 0…736, y −17…496; **Hitbox (0, 17)–(64, 54)** für alle Typen.
  Wände sperren achsenweise (Rücksprung auf die Position zu Tickbeginn);
  Landschaft voraus schiebt mit der Scrollgeschwindigkeit nach links, bei
  x < 0 zerdrückt.
- Start (100, 260), mit zwei Spielern (100, 228) und (100, 292). Neigung 0–4
  (2 waagerecht), wechselt sofort und dann alle 6 Ticks.
- **Schiffstypen** (`A.A8`, auch `Var` 32784): 0 „D-Tonator“ (Partikel), 1
  „D-Phyton“ (Force); 2 nur per Debug. Mit zwei Spielern bekommt Spieler 2 den
  anderen Typ. Sprites `dove{Typ}{Neigung+1}{Bild+1}` (64 × 64).
- **Schaden:** Gegnerschuss überlappt (x+5, y+20)–(x+60, y+45) → Energie −
  Schaden; Kontakt je Durchgang −2, der Gegner nimmt 15 (Schleife im selben
  Tick, bis nichts mehr trifft); Landschaft oder feste Gegner töten sofort;
  Energie < 0 tötet. Unverwundbar 100 Ticks nach jedem Spawn, 200 mit Schild,
  500 beim Levelausflug (Schaden wird im selben Tick zurückgesetzt).
- **Tod** (`KillDove` `0x50B0D0`): 99 Ticks Sequenz; ein Spieler: Checkpoint-
  Neustart, Leben −1 (Start 3); Leben 0 → Continue (Punkte ÷ 3). Zwei Spieler:
  gemeinsame Leben (6), Wiedereinstieg nach 100 Ticks an der Position des
  Partners; ohne Leben oder im Bosskampf stirbt der Partner mit.
- **Punkte** (`AddPunkte` `0x50F750`): `+= Multiplikator · Punkte / (1 + 0,5 ·
  zwei Spieler)`. Kombo (1 + 0,1 je Treffer) nur während eines voll geladenen
  Beams. Extraleben bei 200 000, 400 000, 800 000 …

## Spielerwaffen

- **Pool** `Me.B8C`: 2 Ebenen × 1001 Slots à 0x34 (Typ, Parameter, Schaden, vx,
  vy, x, y, aktiv, Zähler, Besitzer). Ebene 0 läuft vor den Gegnern, Ebene 1
  danach. `AddSchuss` `0x4DD0F0`, `KillSchuss` `0x4D36D0`.
- **Hauptschuss** (`SpielSchieß`): Abkühlzeit 6 (Schiff 0, 2) bzw. 12 (Schiff 1)
  Ticks, vx 11. Waagerecht ein Schuss, geneigt zwei (obere/untere Mündung) mit
  halbem Schaden. Schaden Schiff 0/2 `40 · m · (Stufe + 2)`, Schiff 1
  `m · (100 · Stufe + 140)`; `m` = 2 während der Beam-Kraftphase.
- **Bewegung Gruppe A** (Typen −2…1): Kasten 16 × 16; bewegen → außerhalb weg →
  zeichnen → Gegnertest → Landschaftstest.
- **Treffer** `CheckColisionWithEnemy` (`0x4C3E10`): Gegner in Slotreihenfolge,
  Teile vom letzten zum ersten, Konturtest wie bei der Landschaft; je Aufruf
  höchstens ein Teil. Rückgabe ist der **Restschaden**: ohne Treffer der volle,
  bei verbrauchtem Treffer 0, bei einem Abschuss der Überschuss (der Schuss
  fliegt damit weiter). Gepanzerte Teile nehmen keinen Schaden.
- Zweitwaffen (Bombe, Fallrakete, Zielsuchrakete), Partikel (Schiff 0), Force
  (Schiff 1), Beam (Aufladen 0,9 je Tick bis 165) und Super-Nova sind im
  Analysebericht erfasst, im Port noch offen.

## Gegner-Laufzeit `SpielMoveEnemy` (`0x4B5850`)

Gegner in Slotreihenfolge (zugleich Zeichenreihenfolge), **kein Culling** — ein
Gegner geht nur, wenn seine Route endet oder er stirbt. Je Gegner:

1. Route (Modus 0). Endet sie: still entfernen; war der Beam aktiv, endet die
   Kombo (außer `noComboReset`/`solid`).
2. HP < 0 nach der Route (Route hat sie gesetzt): Selbstzerstörung ohne Punkte.
3. Je sichtbarem Teil: Teilroute (HP < 0 → Teil explodiert), Richtungsbild
   oder DoAni, Zielen (Geschützturm), Landschaftstest (`collidesWithTerrain`;
   rechter Rand kurioserweise aus `red`), Rammen, Zeichnen, Aufblitzen −1,
   Feuern nach Feuermodus.
4. Landschafts- oder Rammtreffer zerstört den ganzen Gegner: Todes-Spawn,
   Funken, `Explosion2.wav`, keine Punkte.

**Zeichnen:** D3D-Gruppen mit Farbe/Alpha des Teils, gedreht über `SetUpGeom`;
Aufblitzen als zweiter additiver Durchgang. DirectDraw-Gruppen als
Colorkey-Blit, beim Aufblitzen das Negativ `_i`.

**Todeszustand** beim Abschuss: `explosionSpec` → 5, `bigDeath` → 7, durch
einen anderen Gegner getötet → sofort Explosion, sonst **6** (normaler Abschuss,
50 Ticks grüne Zielerfassung, dann Explosion); überschrieben zu 1 während des
Beams, 2 während Nova, 4 für Bosse. Dauern: 1 30 Ticks, 2 40, 3 bis 160
(Trümmer mit Schwerkraft), 4 570 (Boss-Finale), 5 15 (Zündung), 7 10 je Teil.
*(Im Port bisher Dauer und Ende; die Effekte folgen.)*

**Explosion:** Funken (`AddPartikel`), Glut, Rauch und Feuerbälle
(`AddExplosionsPartikel`, Größe nach Rechteck), Ton `Explosion1.wav` bzw.
`Explosion2.wav` ab 1500 Punkten, `spalt.wav` beim animierten Abschuss.

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
ist. Ursprung: Bildmitte des Teils (bei `turret` an den Rand gedreht)
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
