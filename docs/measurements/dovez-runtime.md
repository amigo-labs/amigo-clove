# DoveZ — Laufzeitstrukturen (statisch aus `DoveZ.exe`)

Stand: M8. Quelle: UPX-entpackte `DoveZ.exe`, `objdump -d -M intel`,
Image-Base `0x400000`; Methoden und Formatbefund in
[`../formats/dovez-level-dat.md`](../formats/dovez-level-dat.md). Nichts hier ist
am laufenden Original gemessen. Konfidenz *hoch*, wo nicht anders vermerkt.
Umsetzung: `packages/game-dovez/src/sim/` (`world.ts` Tick, `layers.ts`,
`anims.ts`, `enemies.ts`, `enemyFire.ts`, `player.ts`, `playerShots.ts`,
`weapons.ts`, `companions.ts`, `beam.ts`, `effects.ts`, `radio.ts`,
`snapshot.ts`, `environment.ts`/`special.ts` Umgebung), Ton in
`src/audio/DovezAudio.ts`, Backbuffer in `src/render/Compositor.ts`.

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
Ebenen, Eingabe, Schüsse, Power-ups, Emitter, Gegnerschüsse, Wetter, Kontakt —
Gegner, Partikel, Force, HUD laufen). Die elf Prüfungen fragen `Me.D6C` jeweils
an ihrer Stelle ab; die Nova schaltet in Schritt 9 mitten im Tick um (Abschnitt
„Super-Nova“):

1. Eingabe abfragen; `SpielObjektAnimationen` (DoAni für jede Gruppe, globaler
   Bildzähler der Kacheln).
2. außer Nova: Musik-Fade; Zeitleiste (`0x50C9F0`), am Ende `Me.584 += 1` und
   Levelende-Prüfungen. Gegner, die in Tick T spawnen, bewegen sich noch in T.
3. Hintergrund (`SpielMoveHintergrund` `0x50D490`, auch in der Nova).
4. außer Nova: Ebene 0 mit Animationen, `SpielSpezial(0)`, Ebenen 1, 2, 5 je
   mit ihren Animationen; Checkpoint;
   Spielereingabe und -bewegung (`SpielKeysDove` `0x507DB0`).
5. Partikel; Drohnen; außer Nova: Abfeuern (`SpielSchieß` `0x4E2C20`),
   Spielerschüsse Ebene 0; Funken 0; außer Nova: Power-ups.
6. Schiff zeichnen (`SpielMoveDove` `0x509110`), **Gegner** (`0x4B5850`, auch
   während Nova), Blasen.
7. außer Nova: Animationen der Ebene 4, **Ebene 3 (Landschaft, über Gegnern und
   Schiff gezeichnet)**.
8. außer Nova: Spielerschüsse Ebene 1, Animationen 3, Emitter, Beam.
9. **Super-Nova** (`SpielNova` `0x52A230`, jeden Tick), Partikel; außer Nova:
   **Gegnerschüsse**; Satelliten, Punkteanzeigen, Hupe.
10. außer Nova: Regen, Checkpoint, **Ebene 6** mit Animationen, Wasser,
    Schnee/Wolken/Regenschleier; `SpielSpezial(1)` (prüft die Nova selbst).
11. Erschütterung; außer Nova: **Kontakt** (`SpielFeindberührung` `0x50B710`);
    Overlays mit Rauschen; außer Nova: Abblenden in den letzten 50 Ticks; HUD.

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
Varianten (Abschnitt „Hintergründe“).

## Hintergründe (`SpielMoveHintergrund` `0x50D490`, `environment.ts`)

**Der Backbuffer wird nie gelöscht** (kein Clear in `RenderStart`/`Flip`);
jede Variante übermalt das vorige Bild ganz oder nur mit einem Schleier. Der
Port bildet das mit einer dauerhaften Render-Textur nach, in die jeder Frame
ohne Löschen zeichnet (`Compositor.ts`); gezeichnet wird nur nach einem
neuen Tick. Sprungtabelle über `Me.7CC + 2`, Sterne/Flecken in `Me.10C0`
(101 × 0x1C, im Checkpoint gesichert; `Me.10CC` legt sie neu aus):

| Modus | Level | Bild | `Rnd` |
|---|---|---|---|
| 1 Bild | die meisten | schwarz, Bild bei `CLng(x)` und `CLng(x + 800)` (bei x = 0 einmal) | – |
| 2 Sternfeld | 2-x, Bonus, Epilog | schwarz; 10 `feuer0`-Nebel (α 0,15, Farbe aus der Wanduhr `GetTickCount`) in die Ecke 64 × 64, nach `blur` erfasst, bilinear auf 800 × 600; 101 Sternschweife (`balken`, 2 px, nach rechts ausblendend, Tempo 0,1…10,1) | 303 beim Auslegen, 1 je umlaufendem Stern |
| 3 Eis | 6-1, 6-2 | nur ein Schleier (0,6/0,6/0,68, α 0,5) über dem vorigen Bild → Schlieren; `Me.520 = 1` | – |
| 4 Plasma | nur Speicherbildschirm | rote `a_kreis2`-Flecken über `blur` | 505 beim Auslegen |
| 5 Himmel | Skyfight | 101 weiße `feuer0`-Flecken (α ≤ 0,1) auf Dunkelblau in 64 × 64, bilinear auf 800 × 550; Abendrot (`balken` 1/0,5/0,25, α 2T/Länge); **jeden Tick `Me.520 = 2`** | 505 beim Auslegen |
| 6 Warp | 7-5 | schwarz, Schweife mit Tempo `(T − 50) \ 4`, begrenzt 1…8/10/12/14 | 202 beim Auslegen, 1 je Umlauf |
| 0 | Beam-Spur, Nova | 10 % schwarz über dem vorigen Bild, bei `Me.520 = 2` das alte Bild 8 px nach links | – |
| −1 / −2 | Nova | 10 % rgba(1, Rnd/2, 0) bzw. weiß über dem vorigen Bild | −1: 1 je Tick |

Damit hat **Skyfight den weißen Explosionsstil** (`AddExplosionsPartikel`
prüft nur `Me.520 ≠ 0`). Der Nebel läuft im Original mit der Wanduhr; der Port
nimmt 16 ms je Tick (*Näherung*, ohne `Rnd`). Die 16-Bit-Variante von Modus 5
(flaches Blau 0x6B87B3) nutzt der Port nicht. Mehrere Ticks in einem Frame
zeichnen nur den letzten (Schleier dann schwächer als im Original).

## Wetter (`SpielRegen` `0x536970`, `SpielSchnee` `0x537150`)

**Regen** bei `0 < weatherParticles < 500` (3-1: 16, 4-1: 10, 5-2: 12
Tropfen, außer Nova): Tropfen `Me.10D0[0…N]` fallen 8…10 px je Tick, frisch
4 `Rnd`, Neustart oben 3 `Rnd`; an Wasserlinie, Schiff (ohne Lebend-Prüfung)
oder Landschaft 7 graue Spritzer (`Add1Partikel`, je 1 `Rnd`, nur bei
`Me.7CC > 0`). Gezeichnet als 4 × 19 px `balken` quer, α 0,2. Ab 500 (3-2)
nur `Me.520 = 3`.

**`SpielSchnee`** nur bei `Me.520 > 0` und `Me.7CC > 0`: zuerst 1 `Rnd` für
den zufällig wandernden Windwinkel, dann je Stil 60 Datensätze `Me.10E4`
(nicht gesichert, nach jedem Neustart neu ausgelegt): 1 Schnee (6-1, 6-2)
`schnee1–3` additiv α 0,8 in drei Tempi, seitlich vom Wind; 2 Wolken
(Skyfight) 60 `feuer0`-Schwaden α 0,3, 240 `Rnd` beim Auslegen, 3 je
Neustart rechts; 3 Regenschleier (3-2) `regen1` additiv α 0,4 mit Ton `rain`
in Schleife.

## Wasser (`SpielWasser` `0x533390`)

Bei `waterHeight` W > 0 (5-1: 550, 5-2: 275, 5-3: 71, 7-2: 81, 8-1: 57),
außer Nova; im Original alles nur beim Zeichnen, im Port jeden Tick. W > 100:
das bisherige Bild unter der Wasserlinie in Streifen von 10…14 px (1 `Rnd` je
Streifen) um `CLng(k·SinusB(y + 2T))` verschoben (k = 5 bei W = 550, sonst
1/0/−1 … nach Tiefe \ 50). Ab hier nur bei `Me.7CC ≠ 0`: Oberfläche aus zwei
wogenden Verlaufsbändern (`waterTop` → `waterBottom`, α 0,4); an Schiffen,
die die Linie schneiden, Spritzer (additive Glut, 3 `Rnd`) und Ton
`water touch` in Schleife; Blasen mit 1 % (1 + 2 `Rnd`) an Schiffen und nicht
festen Gegnern, Spritzer an Drohnen, Force, Gegnern und Beam 1; alle 3 Ticks
`W \ 20 + 1` Schwebeteilchen (4 `Rnd`, Blau versehentlich aus `top.g`).

## Overlays (`OverlayEffekte` `0x538260`, `MakeSomeNoise` `0x4FEBC0`)

Glühen (`Me.508`) und Unschärfe (`Me.506`) steigen um 0,025 bis 0,5 und fallen
um 0,05; gezeichnet wird das auf 64 × 64 erfasste Bild (`blur`), additiv auf
(−50, −50)–(850, 600) bzw. normal, **mit Rückkopplung**: am Ende des Ticks
wird das Bild erneut erfasst (`Me.50A`), gezeichnet im nächsten. Der
**Checkpoint-„Blitz“ ist ein Standbild**: im Auslöse-Tick (bzw. am Ende der
Todessequenz, `Me.50C`) kopiert `OverlayEffekte` das Spielfeld nach `Me.774`
(`blur3`), danach blendet es die Kopie von α 1 in 20 Ticks (nach dem Neustart
0,6 in 30) aus — kein Weiß. `Blenden` (`0x4A9FA0`, Tutorial, Nova) tut
dasselbe mit α 1 → 0 in Schritten von 0,05. Rauschen: bei `Me.6D0 > 0` 4 × 3
Kacheln `noise` mit zufälligem, gespiegeltem Ausschnitt, **48 `Rnd`**, nur
beim Zeichnen. `Me.6D0` ist je Tick 0; **Route op 41 („AddFade“) addiert
Rauschen** (auf 0…1 geklemmt; 7-1, 7-2), dazu Spezial 7 und der Beam von
Schiff 2 (fehlt im Port). Der Port rendert nach einem Tod erst das Todesbild,
dann startet er neu (für das Standbild).

## Spezialabläufe (`SpielSpezial` `0x538CF0`, `special.ts`)

Route op 42 (`SetSpecial`): Typ und vier Parameter, aktiv bis der Ablauf sich
beendet oder ersetzt wird; nicht in der Nova. Pass 0 nach Ebene 0 (Typen 2, 3),
Pass 1 nach dem Wetter.

| Typ | Level | Ablauf | `Rnd` |
|---|---|---|---|
| 0 | Tutorial | Startsequenz 201 Ticks: Schiffe (Zustand 5, gedreht 270°) steigen mit Triebwerksglut auf, fliegen von links ein, weiße Blende, `SaveCheckpoint(0)`, `Blenden` | je Tick und Schiff |
| 1 | Tutorial, Skyfight, 7-4, Jungle | Tastenhinweis „Drücke: “ + Taste (GDI Arial 70), 300 Ticks | – |
| 2 | Tutorial | obere Bildhälfte glüht in 21 Lagen | – |
| 3 | 1-2, 3-2, 4-2 | Gewitter: Schleier α 0,5, je Tick 0,5 % Blitz (mit Ton 2× Donner mit Zufallsfrequenz, +1 `Rnd`); 49 Ticks Lichtkegel, zwei **gesäte** `Blitz` (`Rnd(−1)`, `Randomize`; danach ist die Folge eine Funktion eines gezogenen Werts), Glühen | Ruhe 1, Blitz 21 |
| 4 | 7-3 | Bild über `blur` mit wogendem 20 × 20-Gitter, α 0,3, Unschärfe an | – |
| 5 | Epilog | Abflug mit Triebwerksglut | 27 je Schiff |
| 6 | 7-4 | `Me.584 = Me.588 − 300`, Schiffe gesteuert, Glühen und Unschärfe | – |
| 7 | 7-5 | Flucht: Explosionen, rote Flammen, Donner bei T = 200 mit Rauschen, Blitze, „Schmelzen“ 600…690 (101 Spalten versetzt, 202 `Rnd`), Energie −0,1 links | viele, mit Ton mehr |

Zustand 5 (`B48[p].5C`) überspringt `SpielKeysDove` ganz und sperrt Beam und
Nova. Die `Rnd`, die von der Option „Ton an“ abhängen (Donnerfrequenz,
Explosionstöne der Flucht), zieht der Port wie mit Ton. *Näherungen:* die
Texturkoordinaten von Typ 4 (bis 800/257) sind auf das erfasste Bild
umgerechnet; die Felder `Me.BCC`/`Me.B8C` bei t = 200 von Typ 0 sind offen und
entfallen; `SpielHupe` (F11, `hupe` 40 Ticks, auch in der Nova) ist umgesetzt,
Browser fangen F11 aber meist ab.

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
Untertyp 0 (`Extra<a><f>`, nur D-Tonator): Partikelwaffe Sorte a + 1 auf einen
Platz; Untertyp 4 (`P2Extra`, nur D-Phyton): Force bzw. deren Stufe und Farbe
(„Begleitwaffen“); Untertyp 3 (`Pow<a><f>`): 0 neuer Partikel-Platz und 1 Schild
(beide nur D-Tonator), 2/3 Tempo ±1, 4 Schussstärke +1 für alle (max 3),
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
- **Zeichnen** (`SpielMoveDove` `0x509110`, Schritt 6, nur lebende Spieler):
  ab dem Levelausflug elf Nachbilder aus dem Verlauf `Me.B64` (α 1/12 … 1/2);
  Schild (`a_kreis2` innen und außen, je ein grauer Blitz, 12 `Rnd` je Tick),
  solange die Unverwundbarkeit > 10 oder ungerade ist — das Schiff selbst
  blinkt nicht; das Schiff; in der 2P-Kraftphase elf additive Kopien; eine
  additive Tönung (rot `1 − E/Emax`, grün bei mehr Energie als vor 10 Ticks,
  blau bei vollem Beam in geraden Ticks); ein magenta Blitz (10 `Rnd`), solange
  die Energie unter der von vor 10 Ticks liegt oder die Kraftphase läuft;
  Rauch unter halber Energie (ein Zähler für beide Spieler).
- **Punkte** (`AddPunkte` `0x50F750`): `score = CLng(Kombo · Punkte / (1 + 0,5 ·
  zwei Spieler) + score)`; der Kombo-Multiplikator wirkt auf alle Punkte des
  Spielers, solange er > 1 ist („Beam und Kombo“). Extraleben bei 300 000,
  600 000, 1 200 000 … (`Me.524` = 3 aus `DoveReset`, verdoppelt je Extraleben).

## Spielerwaffen

- **Pool** `Me.B8C`: 2 Ebenen × 1001 Slots à 0x34 (Typ, Parameter, Schaden, vx,
  vy, x, y, aktiv, Zähler A/B, Besitzer, Spur X()/Y()). Ebene 0 läuft vor den
  Gegnern, Ebene 1 danach. `AddSchuss` `0x4DD0F0`, `KillSchuss` `0x4D36D0` —
  mit einem Fehler: die Abwärtssuche trifft zuerst den noch aktiven Slot selbst,
  der höchste belegte Slot sinkt also nie. `SpielMoveSchuss` liest die Grenze
  einmal zu Schleifenbeginn; Kinder (Typen 4, 5, 10) werden im selben Tick noch
  bewegt, wenn ihr Slot hinter dem laufenden und unter der Grenze liegt.
- **Abfeuern** (`SpielSchieß` `0x4E2C20`), je Spieler vollständig, Feuer
  gehalten (keine Flanke), gesperrt, solange Spieler 1 im Levelausflug ist:
  Schiffsbild (nur beim Feuern, gemeinsamer Takt), Hauptschuss, Zweitwaffe,
  Partikel bzw. Force, dann **Mündungsfunken** (11 × 2 kleine Partikel mit
  je 3 `Rnd`, sie erben die Schiffsbewegung) — 66 `Rnd` je Schusstick.
  Schleifentöne `cyan` (Blitz), `yellow` (Sorte 3), `d-phy_yellow` (gelbe Force).
- **Hauptschuss:** Abkühlzeit 6 (Schiff 0, 2) bzw. 12 (Schiff 1) Ticks, vx 11,
  Ton `normal`/`normal2`. Waagerecht ein Schuss, geneigt zwei (obere/untere
  Mündung) mit halbem Schaden. Schaden Schiff 0/2 `40 · m · (Stufe + 2)`,
  Schiff 1 `m · (100 · Stufe + 140)`; `m` = 2 während der Beam-Kraftphase.
- **Zweitwaffen** (eigene Abklingzeit, Ebene 0): Bombe Typ 11 (`100 \ m`,
  Schaden 300 · Stufe + 700, fällt mit der Level-Schwerkraft), Fallrakete 12
  (`150 \ m`, 400 · Stufe + 1100, 16 Ticks Fall, dann bis 20 px/Tick mit
  Rauch), Zielsuchrakete 13 (`60 \ m`, 200 · Stufe, dreht höchstens 10° je
  Tick zum nächsten Teil, grüne Zielhilfe). Einschlag: 50 Funken,
  Standard-Explosion, Splash `CLng(Schaden) \ 2` im Kasten ± 32, `explosion`.
- **Schusstypen** (`SpielMoveSchuss` `0x4D37C0`): −2…1 Hauptschüsse und Drohnen
  (Kasten 16 × 16; bewegen → außerhalb → **zeichnen** → Gegner → Landschaft,
  ein im Tick verbrauchter Schuss ist also noch zu sehen; rückwärts fliegende
  Drohnenschüsse gedreht), 3 wachsender Feuerball (Flächenschaden jeden Tick,
  1 `Rnd` je gezeichnetem Tick), 4 Splitter (teilt sich beim Aufprall, 4
  `Rnd`), 5 Abpraller (Zünder 15…27, zerfällt in drei), 6–10 Laser der Force
  rot/blau/gelb/violett/grün mit Leuchtband (`Spur` `0x536110`; nach einem
  Treffer steht der Kopf, die Spur läuft aus), 11–13 Zweitwaffen, 14
  Beam-Suchgeschoss. Typ 2 hat keinen Erzeuger, Typ 15 (Debug-Drohnen) wird nie
  bewegt und belegt seinen Slot bis zum nächsten Leeren. Die Typen 6, 7, 9, 10
  setzen den gemeinsamen Kasten `L.304…L.310` nicht und erben im Außentest
  dessen Maße vom zuletzt bearbeiteten Schuss (im Port mitgeführt).
- **Treffer** `CheckColisionWithEnemy` (`0x4C3E10`): Gegner in Slotreihenfolge,
  Teile vom letzten zum ersten, Konturtest wie bei der Landschaft; je Aufruf
  höchstens ein Teil. Rückgabe ist der **Restschaden**: ohne Treffer der volle,
  bei verbrauchtem Treffer 0, bei einem Abschuss der Überschuss (der Schuss
  fliegt damit weiter). Gepanzerte Teile nehmen keinen Schaden; mit Schaden −1
  prüft der Aufruf nur, ob etwas überlappt (Force).
  `CheckWhereColisionRight/Left` (`0x4C6A60`/`0x4C64B0`) suchen die nächste
  Kante von Ebene 3 und allen sichtbaren Gegnerteilen (gelber Strahl, Blitz).

## Begleitwaffen

**Partikel des D-Tonator** (`Me.A98[0…3]` à 0x30; `SpielPartikelMove`
`0x4DFE20`, `NextPartikel` `0x4DD3D0`, `SpielPartikel` `0x4E09B0`): Platz 0
über, 1 unter dem Schiff, 2 vorn, 3 hinten (Ellipse 40 × 22, W dreht 2/3 um
180°, D wählt den nächsten aktiven Platz und lässt ihn 50 Ticks grün leuchten).
Plätze rasten ab Abstand ≤ 5 ein, sonst ziehen sie mit Verzug nach, aus Wänden
werden sie bis zu 20 × 2 px herausgeschoben. Sorten 1 Blitz (bis zur nächsten
Kante, `Rnd(−1)` + `Randomize`-Neusaat wie das Gewitter), 2 Streuschuss,
3 Feuerball, 4 Splitter, 5 Abpraller (6, 7 im Code, aber unerreichbar); je
Sorte bis Stufe 3. Die Abklingzeit zählt zweimal je Tick (auch in
`SpielPartikel`), bei gehaltenem Feuer gilt also ⌈N/2⌉. Schilde (Sorte −1,
Ellipse 52 × 42, 8° je Tick) treffen Gegner mit 50 Schaden je Tick und
schlucken Gegnerkugeln (Punkte = Kugelschaden). Einsammeln mit „Auto-Arrange“
(Vorgabe): gleiche Sorte zuerst, sonst leere Plätze in der Folge 2, 3, 0, 1.

**Force des D-Phyton** (`Me.AA8…ADC`, `SpielSateliet` `0x4DD5F0` — nicht die
Partikel): Die erste Kapsel bringt sie vom linken Rand im Rückruf; weitere
heben die Stufe (max. 2) und setzen die Farbe. D schießt sie ab (vx ±20,
`force_off`), erneut D ruft sie zurück (Ziel: die Schiffsposition von vor 10
Ticks, ab dem 3. Druck mit Schub), frei hält sie sich bei x ≈ 550 bzw. 50. Sie
dockt bei |dy| < 15 vorn oder hinten an (84 `Rnd`, `force_on`), löst
Landschaft achsenweise auf und schiebt sich aus Klemmen. Kontaktschaden `ADC`
halbiert sich je Treffer und wächst sonst um 25; sie schluckt Gegnerkugeln
(nach deren Bewegung). Schüsse je Farbe in `SpielSchieß` (angedockt nur ab
Stufe 1 oder in der Kraftphase; frei ein Fächer nach Stufe). Gegner zielen auf
einen D-Phyton gestreut über Schiff bzw. Force (1–2 `Rnd`) und runden den
Zielpunkt mit `CLng`. `AddForce`/`DoForce` sind Joystick-Vibration, nicht die
Force. Drohnen (`SpielDWeapons`) gibt es nur beim Debug-Schiff 2 (im Port nicht).

## Beam und Kombo

`SpielBeam` (`0x513940`), Beam-Record `Me.CB0[p]` (0x34). A lädt 0,9 je Tick
bis 165 (Ladeton `charge1`/`charge2` als Schleife, Frequenz `CLng(L · 120 +
10000)` bzw. `CLng(L · 100 + 1000)`, voll 30000/18000 Hz); gehaltenes Feuer
oder der Levelausflug gilt als Loslassen. Q wechselt den Typ (Option
„Force-Modus-Taste wirkt als Beamwechsel“, Vorgabe; der Typwechsel kostet die
Ladung). Schaden `CLng(L^1,6 · Stufe)`, voll `8500 · Stufe` (+1500 Schiff 1).

- **Beam 1:** Geschoss mit Schadensbudget, Schiff 0 24 px/Tick mit Körper
  (`balken`/`balkene`), Blitzen (ab Stufe 2) und vier Spiralspuren (voll, ab
  Stufe 3), Schiff 1 20 px/Tick mit blauen Feuerbällen. Treffer ohne Abschuss
  verbraucht ihn (Querschläger an Panzer), ein Abschuss gibt den Rest weiter
  (Kombo + 0,5, Breite schrumpft). Voll geht er durch Landschaft und durch
  Panzer von Typen mit `armorPassThrough` und tötet durchschlagend (Zustand 6).
  Danach 10 Ticks Nachglühen; dabei übergibt das Original für x und y dasselbe
  Feld der Spiralspuren (Band auf der Diagonalen, übernommen).
- **Beam 2:** unter 165 nur der Kollaps der Aura. Voll startet die
  **Kraftphase** (500 Ticks): Hauptschuss × 2, Zweitwaffen-Abklingzeit halbiert,
  Energie +0,03/Tick, im 1P ohne Hintergrund, weißer Blitz, kein Tempoabzug
  unter Wasser; jeder Abschuss spaltet den Gegner (Zustand 1) und zählt die
  Kombo (`Multiplikator = Treffer · 0,1 + 1` vor dem Zählen). Danach klingt der
  Balken in 825 Ticks aus, so lange ist kein Neuladen möglich.
- **Kombo** (`Me.59C` Multiplikator, `Me.5B8` Treffer, `Me.5D4` Bonus): Reset
  bei einem entkommenen Gegner (außer `noComboReset`/`solid`), am Ende der
  Kraftphase und im Nachglühen. Anzeige nur für Spieler 1: `combo` bei
  (730, 520) mit Zähler und Bonus, am Ende „Combo: N Hit B“ im Laufband.

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

**Todeszustand** beim Abschuss (`0x4C4C8F`…`0x4C5A5F`): `explosionSpec` → 5,
`bigDeath` → 7. Sonst zerplatzt der Gegner **sofort** (mit Punkten, Popup
steigt, `Explosion1/2`), wenn ein anderer Gegner ihn getötet hat oder der
Treffer gewöhnlich war (kein Boss, keine Beam-Kraftphase, nicht durchschlagend,
keine Nova). Nur sonst ein animierter Tod mit `spalt.wav`: **6** (durchschlagender
voller Beam 1, 50 Ticks grüne Zielerfassung), 1 in der Kraftphase (Spaltung,
Kombo + 1), 2 in der Nova, 4 für Bosse (Vorrang; im 2P bekommt der Partner die
Punkte auch). Dauern: 1 30 Ticks, 2 40, 3 bis 160 (Trümmer mit Schwerkraft),
4 570 (Boss-Finale), 5 15 (Zündung, blauer Blitz), 7 10 je Teil. Im 1P
wackelt der Bildschirm beim Zerplatzen nicht, solange die Kraftphase läuft.
Im Port vollständig: 1, 3, 4, 5 (mit Kettenreaktion über
`CheckColisionWithEnemy` mit `exclude`), 6 und 7; 0, 2 und −1 im Abschnitt
„Super-Nova“. Zustand 6 im Einzelnen: vier grüne Linien
wachsen aus den Ecken des Umrisses über die sichtbaren Teile, ab t = 21 je
Tick zehn Funken aus der Mitte und ein rotierendes, schrumpfendes Quadrat
(Radius 20·(50 − t)), bei t = 50 zerplatzt jedes Teil — mit einem um ±50 px
gestreckten Rechteck, ein Fehler des Originals, übernommen.

**Boss-Finale** (Zustand 4, `0x4B9394`…`0x4BCF9A`): 570 Ticks ohne Wirkung auf
andere Objekte. Die Teile stehen eingefroren bis T = 500; je Tick Rauch und ein
Funke, jeden zweiten eine 64er-Explosion und eine Blur-Blase, ein `Rnd` jeden
Tick (Ton `endgegnerw3` mit 20 % bei t 131…159); t = 120 Strahlenkranz, 160…230
Explosionsellipsen, ab T = 325 sieben implodierende Wellen, T = 430 rote Glut und
Wackeln + 70, zwei weiße Vollbildblitze; Overlays A/B (Glühen, Unschärfe;
Abschnitt „Overlays“), `endgegnerw1…7` (W5 und W2 als Schleife). T = 1:
beide Spieler 600 Ticks unverwundbar, im 1P endet ein laufender Beam 2; T = 2
bis 500 Hintergrund 0; T = 500 zerplatzen die Teile; **T = 520: `Me.584 =
Me.588 − 151`** (Levelausflug im nächsten Tick); T = 570 ist der Boss weg.
„Boss lebt“ (`[0x5882A8]`) setzt nur `AddEnemy` bei `boss = 1`, gelöscht wird es
nur in `VariabelnLösch` (nicht beim Boss-Tod, nicht im Schnappschuss); gelesen
nur vom 2P-Wiedereinstieg und von `KillDove` (Force). Einen Boss-Balken gibt es
nicht. Ein Boss, der anders als durch einen Spielertreffer stirbt, beendet das
Bosslevel nie.

**Explosion:** Funken (`AddPartikel`), Glut, Rauch und Feuerbälle
(`AddExplosionsPartikel`, Größe nach Rechteck), Ton `Explosion1.wav` bzw.
`Explosion2.wav` ab 1500 Punkten, `spalt.wav` beim animierten Abschuss.

## Super-Nova (`SpielNova` `0x52A230`)

Jeden Tick nach dem Beam (`nova.ts`). **Auslösen:** Nova-Taste (E; im 2P Satz
`p + 1`), Flanke über einen für alle Spieler **gemeinsamen** Riegel (wer die
Taste nicht hält, löst ihn jeden Tick). D-Tonator braucht einen gewählten
Partikel, D-Phyton die Force; nicht während der Nova, nicht tot, nicht, solange
ein Slot bis zum höchsten in Zustand 4 steht (Boss-Finale, auch ein toter).
Keine Ladung, kein HUD — verbraucht wird der Partikel (Art 0: Platz weg und
`NextPartikel`, sonst Art → 0) bzw. die Force. Beim Auslösen: alle 501
Gegnerschüsse weg (auch Druckwellen, Emitter bleiben), Hintergrund gesichert
und 0, Musik auf 1/10, `SpielSoundOFF`, `Nova.wav` + `NovaSchuss.wav`.

**Varianten** (`Me.109C`): Partikelart bzw. beim D-Phyton `Int(Rnd·3) + 6`;
Zähler `C` startet bei −1 und läuft je Tick um 1, Dauer `C₀ + 1`:

| Art | Name | Dauer | Wirkung |
|---|---|---|---|
| −1 (Schild) | Streuung | 71 (ohne Gegner 55) | 21 Striche, Overlay B, alle bei C = 36 |
| 0 (leer) | Ring | ≥ 101 | Welle 4 px/Tick vom Partikel, Treffer bei ¼ Abstand + 10 |
| 1 | Blitze | 201 | zwei Vollbildblitze je Tick, Wanderblitz, alle bei C = 36 |
| 2 | Feuerschlangen | 228 | drei Lissajous-Schlangen, Funken an jedem Gegner, alle bei C = 36 |
| 3 | Bildbruch | 5n + 96 | Hintergrund −1, Streifenversatz, Gegner k bei t = 5k + 49 |
| 4 | Funkenregen | 201 | Striche aus allen Gegnern und Streifenversatz bis C = 81, alle bei C = 36 |
| 6 | Force-Jagd | 15 je Ziel + 41 (ohne Ziel 31) | Kugel fliegt 15 Ticks je Ziel an, Tod → Zustand 1 |
| 7 | Schwarze Sonne | 251 | Hintergrund −2 (weiß), wachsende schwarze Scheibe, alle bei C = 70 |
| 8 | Durchflug | Ausflug + 9 je Ziel + 21 | das Schiff rast in 9 Ticks durch jedes Ziel, dann Rückflug |
| 5, ≥ 9 | Zielsuch-Schüsse | bis 50 nach dem letzten Treffer | Fadenkreuz, Schuss mit Kosinus-Einschwingen, Tod → Zustand 2 |

**Gegner:** am ersten Tick alle Slots bis zum höchsten in die Zustandsmaschine,
wählbare (`novaImmune = 0`, aktiv) in **Zustand 0** (nur gezeichnet, ohne
Aufblitzen), die übrigen in **Zustand −1** (weder bewegt noch gezeichnet —
nova-immune verschwinden und tauchen am Ende an derselben Stelle auf). Jeder
Treffer zieht pauschal 10000 von der Gesamt-HP ab (Teile unberührt), der Tod
gibt die Gesamtpunkte mit Popup an den Auslöser (keine Kombo) und ist meist
`KillEnemy` ohne Emitterabbruch (die Waffen feuern nach der Nova ihre Salven
zu Ende). **Zustand 2** (40 Ticks): im ersten Tick je Teil mit Kontur > 30 × 30
Glitzer-Fragmente (3 `Rnd` je Stück, Anzahl aus der BMP-Größe) und die Emitter
weg, bei 40 zerplatzt jedes Teil über seinem Quellrechteck. Am Ende laufen alle
aktiven Gegner normal weiter; wer mit HP ≤ 0 noch in Zustand 1/2 war, zerstört
sich im nächsten Tick selbst.

**Mitten im Tick:** Im Auslöse-Tick liefen Zeitleiste, Steuerung, Schüsse und
Gegner noch; ab `SpielNova` ruhen schon Gegnerschüsse, Ebene 6, Kontakt und
Abblende. Im End-Tick laufen diese wieder, ab dem Folgetick alles. Der Spieler
ist damit während der Nova unverwundbar; `Me.584` (Tick) steht.

**Bild:** Hintergrund −1 rgba(1, Rnd/2, 0) bzw. −2 weiß mit 10 % über dem
vorigen Bild (Nachzieh-Spuren, Abschnitt „Hintergründe“); Overlays wie beim
Boss; `Blenden` (C = 1) als Standbild-Überblendung. Den Bildbruch (Varianten
3/4, `BltFast` des Backbuffers auf sich selbst, senkrechte Streifen ±5 px mit
einem Fehler bei den Zielkoordinaten, dann waagerechte ±10 px) spielt der
Renderer auf den dauerhaften Backbuffer; die Versätze sammeln sich wie im
Original. Die Sperre `B48[0].5C` (Spezialabläufe, Levelausflug) gilt.

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

Todeszustände (`+0xE4`): −1 versteckt (Nova), 0 eingefroren (Nova), 1
Spaltung (Beam), 2 Nova-Tod, 3 Trümmer (`wreckGroup`), 4 Boss, 5 explosiv
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
| +0x2C | Long | Nummer im Emitter (`Var` 32760); −1: Druckwelle (+0x30 Alter, +0x34 Wirkdauer) |
| +0x30 / +0x34 | Long | Waffe / Salve |
| +0x38 | Single[8] | Lokale |
| +0x58 | Long[4] | Trefferbox |
| +0x68 / +0x9C / +0xD0 | [13] | Spur: x, y, Surface |
| +0x104 / +0x108 | Single | Alpha, Alpha-Schritt |
| +0x10C | Single | Wartezähler |
| +0x110 | Long | Zielspieler der Route; nie geschrieben, also immer Spieler 1 |

Gezielt: Winkel von der linken oberen Ecke zum Zielpunkt `CLng(Spieler + (28,
31))`; auf einen D-Phyton `y = CLng(Rnd · 64 + y)` und `x` an der Force (vorn
angedockt x, hinten x + 64, sonst `CLng(Rnd · 64 + x)`).

**Druckwelle** (`AddGegnerS(−1, 0, L, cx, cy, Ziel)`, `0x4AAF04`; Todeseffekt
von Typen mit `deathShockwave`): Radius `4 · Alter + 32`, wirkt `L − L\4` Ticks.
Je Tick verliert jeder Spieler (ohne Lebend- oder Unverwundbar-Prüfung) im Radius
0,1 Energie und bekommt den Schub `(R − d)/5` vom Zentrum weg (zugewiesen, wirkt
im nächsten Tick). Keine Wirkung auf Gegner und Schüsse, kein `Rnd`, kein
eigenes Bild (der Ring ist das große Partikel Art 13).

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

## Effekte (`effects.ts`)

Alles Sichtbare ohne Spielwirkung. Das Original zeichnet sofort (D3D) in
denselben Schleifen, die rechnen; einige Zeichenwege ziehen `Rnd`
(Wackeln, Blitze, Rauch des Schiffs, Abgas, Funkfenster), andere tun es auch
ohne Zeichnen. Der Port rechnet wie ein Rechner, der jeden Tick zeichnet, in
der Simulation und hinterlässt je Tick Zeichenlisten; der Renderer spielt sie
nur ab. Damit bleibt die gemeinsame Zufallsfolge mit den Routen gleich.

| Pool | Größe | Funktionen | Inhalt |
|---|---|---|---|
| kleine Partikel `Me.C30` | 2 Ebenen × 1501 × 0x30 | `AddPartikel` `0x4EDAE0`, `AddCircle` `0x4EA360`, `MovePartikel` `0x4EDF80` | 2×2-Funken aus `weiss`, Leben `Int(Rnd·20)+12` (+5), Tempo `(Int(Rnd·12)−6)/2`, Schwerkraft `gravity`; genau 9 `Rnd` je Funke |
| große Partikel `Me.C8C` | 4001 × 0x3C | `Add1BigPartikel` `0x4EA7E0`, `AddBigPartikel` `0x4EA920`, `MoveBigPartikel` `0x4EB7E0` | 18 Arten: Blitz (0), Glut `a_kreis2` (1, 16 additiv), Wellen (2, 3, 13 `wave2`), Striche (4, 5, 15), Feuerbälle `feuer0–3` (6–9, additiv), Rauch `rauch1–7` (10), Trümmer eines Teils (12), Glitzer (14) |
| Popups `Me.D34` | 101 × 0x18 | `AddPunkte` `0x50F750`, `SpielMovePunkte` `0x50FA00` | Ziffern `n0–n9` im Abstand 8, 30 Ticks, ab 1000 Punkten oder mit Kombo |
| Blasen `Me.D58` | 201 × 0x14 | `AddBlase` `0x50F670`, `SpielMoveBlase` `0x50F430` | nur unter Wasser, 1 `Rnd` je Blase und Tick |

**Standard-Explosion** `AddExplosionsPartikel` (`0x4EABE0`) über ein Rechteck
w×h: `N = CLng(2·w/64·h/64) + 1` Punkte, je Punkt zu 60 % Glut (64 px,
orange, wartet `D` Ticks) sonst schwarzer Rauch, dazu `CLng(3·w/64·h/64) + 2`
additive Feuerbälle. `D`/Leben 6/16 bei Kantenmittel ≤ 64, sonst 20/36.
Weißer Stil (`Me.520 ≠ 0`: Eis-Hintergrund 3, Himmel 5 in Skyfight,
Starkregen, im Original auch am 24. Dezember — im Port ohne Datum) mit weißem
Rauch und blauen Feuerbällen.

**Treffer:** jeder Spielerschuss auf ein ungepanzertes Teil zehn blauweiße
Funken im Teilrechteck (vor dem Schaden, 90 `Rnd`); der verbrauchte Schuss
hinterlässt 16 px Glut in Typfarbe, an der Landschaft zusätzlich einen Funken;
ein Schuss mit Überschuss fliegt ohne Glut weiter. Ab Waffenstufe 2 zieht
jeder Schuss eine Leuchtspur. Gegnerkugeln am Schiff: kleiner roter Blitz.
Kontakt mit Gegnern: Funkenring (60 Funken) und +4 Wackeln.

**Spieler:** `KillDove` (`0x50B0D0`) 500 orange und 100 blaue Funken und
blaue Feuerbälle, keine Standard-Explosion. Unter halber Energie Funken und
weißes Wölkchen, umso öfter, je weniger Energie. Abgas: drei additive
Glutflecken, länger beim Rückwärtsflug (`0x508AAD`).

**Wackeln** `SpielErschütterung` (`0x529BC0`): Zähler `Me.7D0` aus Explosionen
(`Punkte\500 + 1` je Teil), `AddPunkte` ab 1500 Punkten (`Punkte\500`) und
Kontakt; je Tick ±6 px (Zähler ≥ 19) bzw. ±3 px. Das Original blittet das
Spielfeld auf sich selbst; der freiwerdende Streifen behält die alten Pixel
(im Port bleibt er leer).

## Checkpoint und Neustart

**Tor** (`Me.CD8…CFC`, ein einziges Objekt): `SetCheckpoint` (`0x5202B0`) aus
Zeitleisten-Art 3 (nur 1P) bzw. 7 (nur 2P), x = `CLng(800 + p1\2 + scrollPos)`.
`SpielCheckpoint` (`0x51FAA0`) zeichnet 18 Glutpunkte auf einer atmenden,
drehenden Ellipse, Pass 0 hinter dem Schiff, Pass 1 davor; Pass 1 schiebt das
Tor mit Ebene 3 und löst aus, wenn ein lebender Spieler die Mitte überdeckt:
**erst sichern**, dann +50 Energie für beide, 1000 Punkte mit Popup,
`Checkpoint.wav`, Standbild-Überblendung (α 1 → 0 in 20 Ticks, Abschnitt
„Overlays“), das Tor weitet sich und
ist nach 80 Ticks weg.

**Schnappschuss** `SaveCheckPointSub` (`0x51DF40`): ein Platz, jeder neue
ersetzt den alten; fast die ganze Welt (Tick, Gegner, Animationen, Ebenen 1–6
mit Zeigern, Spieler, alle Schuss-, Partikel-, Popup-, Blasen- und
Power-up-Pools, Globale). **Nicht** gesichert: Ebene 0, das Tor, Wackeln,
`Rnd`, Funk-Zähler, Musik, Punkte. Er entsteht mitten im Tick (nach den
Gegnerschüssen, vor Ebene 6 und Kontakt), der gesicherte Tick ist N + 1. Der
erste Schnappschuss nach dem Vorlauf. Port: tiefe Kopie mit geteilten
unveränderlichen Daten (`snapshot.ts`).

**Tod → Neustart:** 99 Ticks nach `KillDove` endet die Schleife (`Me.580 = 1`,
jeden Tick `SpielSoundOFF`; ohne Leben blendet die Musik aus). Danach
`VariabelnLösch`, `LoadCheckpoint`, `DoveInit` beider Schiffe (volle
Energie, 100 Ticks unverwundbar, Position bleibt), ein Leben weniger, Punkte
und Kombo-Bestwerte vom Todeszeitpunkt, Überblendung des Todesbilds ab α 0,6,
Sterne aus dem Schnappschuss, Wetter neu ausgelegt, erneut sichern,
`SpielDoveWiedergeburt` (`0x50A620`: nur Partikel und `newborn1.wav`). Kein
Vorlauf, die Musik läuft weiter, der Funk bricht ab. 2P mit Leben und ohne
Boss: der Spieler ersteht allein beim Partner wieder, ohne Neustart; sonst
stirbt der Partner mit. Ohne Leben: Continue-Bildschirm (s. „Continue“).

## HUD `SpielDisplay` (`0x510E10`)

Jeden Tick nach der Abblende, nicht gewackelt. Logik: Extraleben bei 300 000,
600 000, 1 200 000 … Punkten (`n ≥ Me.524`, Start 3 aus `DoveReset` `0x4A6EC0`) (`Liveup.wav`, die Lebensziffer leuchtet 50 Ticks),
die angezeigten Punkte zählen in Schritten 5111/511/51/11/1 hoch. Zeichnen
(1P, Satz `I` = Schiffstyp, in 2P `interface3_*`):

| Element | Bild | Position |
|---|---|---|
| Grundbild | `interface{I}_grund` 800×75 | (0, 525), überdeckt 25 px des Spielfelds |
| Leben | `leben{min(n, 9)}` | (122, 555) |
| Energie | `interface{I}_energy`, Breite `CLng(E·w)\max` | (152, 556) |
| Beam | `interface{I}_beam{Typ}`, Breite `w·Ladung\165` | (170, 578) |
| Tempo | `interface{I}_s`, füllt von unten, Tempo 4 leer bis 10 voll | (623, 565) |
| Schussstärke | `interface{I}_p`, ab Stufe 2 halb, 3 voll | (587, 566) |
| Extrawaffe | `interface_extra{n−1}` | (647, 569) |
| Punkte | `n0–n9`, 8 px, ohne führende Nullen, mittig um 751 | y 578 |

Kein Boss-Balken, keine Energiewarnung im HUD. *(Asset-Befund)* Der
Energiebalken wird per DirectDraw mit Farbschlüssel geblittet;
`interface*_energyA` ist ein eigenes Hintergrundbild (nur mit einer Option
gezeichnet), keine Alphamaske — der Atlas behandelt es seit M8 so.

## Ton

DirectSound 7 über dx7vb: `LoadSound` (`0x4EE2E0`) legt je Sound
`extraVoices + 1` Puffer an, `PlaySound` (`0x4EEAA0`) nimmt sie reihum. Kein
Panorama, Frequenz nur beim Beam-Laden und Donner. Level-Töne (Zeitleiste
Art 1, Route `PlaySound`) sind Indizes in die `Sound`-Liste des Levels, die
Dateien liegen im globalen `Sound.d2p`. Zeitleiste: `p2` 0 einmal, 1 Schleife,
2 Stopp, ohne Rücklauf; Route mit Rücklauf. Zwei Pegelgruppen mit den
Vorgaben des Originals: Engine-Effekte und Schusstöne der Gegner −10 dB
(0,316), Level-Töne und Funkstimmen 0 dB. `SpielSoundOFF` (`0x50C790`) hält
Schleifen und Level-Töne an (Tod, Pause, Nova, Levelende), nicht die
Funkstimme. Die wichtigsten Engine-Töne: `Explosion1/2.wav` (ab 1500
Punkten), `spalt.wav` beim animierten Abschuss, `Explosion.wav` für Teile,
`Hit.wav`, `ExplosionDOVE.wav`, `newborn1.wav`, `Checkpoint.wav`,
`Extra.wav`/`Speed.wav`, `Liveup.wav`.

## Funk und Laufband (`radio.ts`)

`AddFunktion` (`0x4AC700`, Zeitleiste Art 2 und Route): keine Warteschlange,
ein neuer Spruch ersetzt den laufenden; `maxPlays` zählt beendete Sprüche
über Tode hinweg. `SpielFunkmeldung` (`0x5101E0`) jeden Tick aus dem HUD:
Gruppenstart ohne Bild (Stimme `voice/<Level>/<wav>` starten, Untertitel ins
Laufband), dann `ms\16` Ticks Anzeige; Dauer 0 beendet den Spruch
(abgeschnittene oder vertauschte Felder). Fenster (5, 542)–(84, 592):
Sprecher `0` zeichnet nichts, sonst 20 Ticks Rauschen (`noise`, zufällig
gespiegelt), dann Porträt `frame1–32` (alle 5 Ticks weiter, zu 10 % gestört)
unter Rauschen von 100 auf 30 %. Das Laufband (`AddMsg`/`ShowMSGS`,
`0x50FB90`/`0x50FCC0`) setzt alle Einträge mit Abstand zusammen und schiebt
sie von rechts herein (Courier 12, RGB(64, 255, 64), bei (575, 552)); ein
Neustart leert es. Texte in der Spielsprache, Stimmen nur englisch.

## Musik

vbogg streamt die Datei aus dem `music`-Feld des Levels und startet sie nach
dem Ende neu. Pegel je Tick `90 · Me.1C0 / 100`, `Me.1C0` fällt in den
letzten 50 Ticks um 2 je Tick, beim letzten Leben um 1. Kein Bosswechsel —
Bosse sind eigene Level mit eigener Musik. Continue spielt `Continue.ogg`
einmal, danach blendet die Levelmusik in 20 Ticks ein.

## Continue (`Continue` `0x521790`)

Nach dem Tod ohne Leben (SpielLoop #264, 2P: gemeinsame Leben): Funk aus,
`AddHighscore` (`0x577A90`) je Spieler mit dem **vollen** Stand, Platz 1…10
als „‹Name› landet auf Platz N!“ / „‹Name› ranked at place N!“ (Arial 24,
zentriert um x 400, y 490 + 20·p). Hintergrund: das letzte Spielbild mit 30 %
Schwarz; `Continue.ogg` einmal auf vollem Musikpegel. Eigene Schleife mit
`Wait 40` (25 Hz): Countdown 9 → 0, je Schritt 28 Durchläufe (1,12 s, zusammen
10,08 s), Esc/D/Q gehalten +9 je Durchlauf → 3 Durchläufe je Schritt. Die „0“
steht einen Durchlauf, dann schaltet der „Fernseher“ aus (50 Durchläufe
schrumpfendes Bild, 7 Leuchtstrich `a_kreis2`, 15 Nachlauf ≈ 2,9 s; nichts
wird gelöscht, nur um 15 % abgedunkelt) → Game Over → Hauptmenü. Bestätigen:
Feuer/Beam (ohne Levelausflug), Leertaste, Enter — gehaltene Tasten zählen
sofort, ohne Fokus keine. Je Durchlauf 101 Schneeflocken 2×2 und bis zu drei
1×600-Streifen (weiß α 0,8 additiv), „Continue“ und Ziffer (Zelle 128 px,
„Orbit-B BT“ fehlt → Arial, Schatten ±2 px, die Ziffer zittert in den ersten
15 Durchläufen um ±10 px), zu 10 % ein Bildriss, zuletzt das ganze Bild auf
64×64 vergröbert mit α `Rnd/2 + 0,1` darüber. „Ja“: `speech.wav` (0 dB),
Leben 4 (2P 7), Punkte `\ 3` je Spieler, Extraleben-Schwelle 3, Levelmusik
von vorn mit Einblenden über 20 Ticks, dann der normale Neustart (ein Leben
weniger → 3 bzw. 6).

**Zufall:** Beide Bildschirme ziehen im Original aus dem globalen `Rnd`
(Continue 207–211 Aufrufe je gezeichnetem Durchlauf, beim Ausschalten 1),
abhängig von Echtzeit und ausgelassenen Bildern. Der Port zieht dieselben
Aufrufe in derselben Reihenfolge aus `World.rnd`, als wäre jeder Durchlauf
gezeichnet — die Folge nach dem Continue hängt so nur von den Eingaben ab.
Gezeichnet wird je Anzeigebild nur der letzte fällige Durchlauf.
**Highscore:** 10 Plätze (Name, Punkte, Spiel-ID; ein Platz je Spiel), beim
Host gespeichert (`highscores`, JSON), Name „Bruce“ (Vorgabe bei leerem Namen;
der Port hat noch kein Namensmenü). Umsetzung: `src/game/continueScreen.ts`
(Logik), `continueView.ts`, `highscore.ts`; Sichtprüfung `#/dovez?screen=continue`.

## Pause (`Pause` `0x524610`)

Auslöser am Ende jedes Ticks: Esc (`TastePause`, Gamepad Start) oder
Fokusverlust (Port: `blur` des Fensters, verborgene Seite). Beim Eintritt
`SpielSoundOFF`, Funkstimme angehalten (Position gemerkt), Musik stumm (läuft
weiter), `Pause.wav` (−10 dB). Erst wenn Esc/D/Q losgelassen sind, läuft die
Schleife mit `Wait 16`: Schwarz, das Spielbild halb so groß in der Vorschau
(288, 77)–(688, 377) mit Abtaststrich (Zeile 2 px versetzt, `balken` α 0,1
additiv) und zufällig (2 % je Bild in Zeile 21…234) 45 Bilder Linsenstörung
mit Rauschpunkten und Linien, darüber `pausescreen` (Schwarz durchsichtig),
Menü „WEITER“/„RESUME“ und „EXIT“ (Arial, gewählt 26 px, sonst 21 px, bei
(118, 89)/(118, 120)), Titel „Level1-1 Skyfight (Bruce)“ (Arial 20, grün mit
Schatten, (120, 35)), Funkprotokoll (das Laufband, Arial 18, 7 Zeilen à
530 px ab (135, 412), neueste unten, vorne umgebrochen) und in den ersten 19
Bildern das Spielbild darüber (α 0,95 → 0,05). ↑/↓ wählen, sonst keine
Markierung. Esc/D/Q setzt immer fort; OK (Feuer/Beam, Leertaste, Enter) auf
EXIT trägt den Highscore ein → Hauptmenü, sonst weiter. Nur mit „WEITER“
verlassen: `Pause.wav`, Musikpegel und Funkstimme zurück. Danach nochmals
Loslassen abwarten; im Spiel blendet das letzte Pausebild (0…550) in 20 Ticks
aus, die Pausenzeit wird nicht nachgeholt. Nicht übernommen: `Screenshot.bmp`;
das Bild fürs Ladebild-Mosaik legt der Port an („Kampagne“). Die Schleifentöne der Waffen startet der Port nach der Pause
neu (das Original fragt ihren Puffer je Tick ab). Umsetzung:
`src/game/pauseScreen.ts` (Logik), `pauseView.ts`; Sichtprüfung
`#/dovez?screen=pause`.

## Kampagne (`LevelSkript` `0x54D3F0`, Hauptschleife `0x54E430`)

Die Programm-Hauptschleife ruft `LevelSkript` → `LadeDaten` → `SpielLoop` →
`LevelSkript` …; liefert `LevelSkript` False, geht es ins Hauptmenü.
`LevelSkript` liest `Play.txt` (in `Play.d2p`) bis Zeile `Me.115C`, zählt
weiter und prüft das erste Wort ohne Groß-/Kleinschreibung:

| Anweisung | Wirkung |
|---|---|
| `Load <Level>,<Bild>` | Levelname `[0x5880C4]`, Ladebild `Me.1160`, `DovePosSetup`, True → `LadeDaten` + `SpielLoop` |
| `Save` | `SaveGame` sofort (der Bildschirm ist die Rückfrage) |
| `Play <datei.avi>` | „Loading“ (System 18, weiß, 376/490), Flip, `PlayAVIFile(…, "Video.d2p")`, Schwarz |
| `credits` | Highscore, `[0x588080] = Me.6D8` falls größer, „Loading“, `Outro<Sprache>.avi` (ab Durchgang 2 `Outro2…`), `ShowCredits`; ab Durchgang 2 das Level **Epilog** (Ladebild leer), sonst Skriptende |
| Dateiende | `AddHighscore` für alle Spieler, False → Menü |

Neues Spiel: `Me.115C = 0` → `DoveReset`. Einzellevel (Bonus, `-Skip`)
setzen `Me.1158`: nach dem Level `Me.115C = 10000` (Ende). Ob ein Level
geschafft ist, steht nur in `mode`: `SpielLoop` endet bei `Me.580 = 2` mit
`mode = 0` (nächste Anweisung); Game Over (Continue „nein“) und Pause-„EXIT“
setzen `mode = 9` → `LevelSkript` gibt False (Menü). Am Levelende gibt es
keinen Bonus und keinen Jingle: Ausflug ab `Me.588 − 150`, Musik und
Abblende in den letzten 50 Ticks, danach `SpielSoundOFF`, `KillCheckpoint`,
`StopOgg`. `Me.6D8` ist der laufende Durchgang (`[0x588080] + 1` beim neuen
Spiel), `[0x588080]` der höchste geschaffte (Konfiguration).

**Was von Level zu Level bleibt:** Nur `DoveReset` (neues Spiel) setzt Leben
3/6, Punkte, Schussstärke 1, Tempo 6, Zweitwaffe, Max.-Energie 100,
Partikelplätze, Force, Drohnen, `Me.524 = 3` (Extraleben ab 300 000). Je Level
setzen `DovePosSetup` (Position, Neigung, Ausflug, Abklingzeiten, Kombo-
Bestwerte, Partikel auf die Schiffsmitte), `VariabelnLösch` (alle Pools,
Kombo, Beam, Funk, Nova) und `DoveInit` (Energie = Maximum, 100 Ticks
unverwundbar) zurück; alles andere geht über. Die `Rnd`-Folge läuft durch.
Port: `World.carry()`/Option `carry` (`sim/world.ts`), eine `VbRnd` je Spiel.

**Ladebildschirm** (`LadeDaten` `0x4C72C0`): mit Bild `Take<n>` aus
`Loading.d2p` (600 × 480, auf 800 × 600 gestreckt, *mittel*; `Take9` ist
8 × 8) je geladenem Levelbild Balken (290, 480)…(290 + 220·p) 6 px Schwarz →
RGB(137, 190, 255), weißer Rahmen (290, 476)–(510, 484), „nn%“ (System 16 bei
410 − 5·Len, 455), „Loading“ (376, 490); danach „Press any key to start!“
(System 24, Grau `CLng(Sin(k°)·63 + 192)`, 294/470, auch auf Deutsch englisch)
bis `TasteOK` oder Esc, Esc loslassen abwarten. Ohne Bild (Einzellevel,
Epilog) das Mosaik `Loadingscreen.bmp`: 16 Kacheln à 200 × 150 aus
`NewPictureToLoadingscreen` (`0x520F50`, beim Öffnen der Pause und nach jedem
Tod, reihum `Me.1CC`), 90 % Schwarz, additive Bänder und Leuchtkreise, Logo
(200, 120), „nn%“ (System 32); ohne Tastendruck. Kein Ton, kein `Rnd`. `p` ist
im Original der Anteil der Bildgruppen, im Port der geladenen Bytes.

**Video** (`PlayAVIFile` `0x551930`, DirectShow): Option Videos aus → nichts;
800 × 600 1:1, Ton 0 dB (unabhängig vom Musikpegel), ohne Ton stumm; Ende bei
`CLng(Position) ≥ CLng(Dauer)` (bis 0,5 s vor dem letzten Bild), Abbruch nur
mit Esc (sofort), danach Loslassen abwarten; keine Musik. Das Intro
(`introD/E.avi`, lose) läuft nur beim ersten Menüstart. Port: `<video>` als
Pixi-Textur, Ton über den Effekt-Bus, `video=0` schaltet ab.

**Speicherbildschirm** (`SaveGame` `0x541010`): Plätze der Spieler per
`AddHighscore` (2P: Gleichstand schiebt Spieler 1 hinter Spieler 2),
Hintergrund 4 (rotes Plasma, Sterne neu) und HUD laufen mit, `Save_Screen.ogg`
in Schleife, Logo fährt ein (`xLogo = CLng(xLogo / 4)` ab −400), Einblende
`1 − Me.584/50`. Texte Arial mit schwarzem Schatten +2/+2: „<Level>
geschafft!“/„Cleared!“ 24 (50, 170), „Spieler n: Punkte (HIGHSCORE: p.
Platz!)“ 18 (50, 180 + 20n), „Spiel speichern?“ 24 (50, 280), Top 10 rechts
(x 460, Punkte bündig 788, y 20n − 10, `QBColor(14)` gelb nur für Spieler 1
allein — die Bedingung schließt 2P aus), „Nicht speichern“ 16 (50, 310),
Plätze 3 × 7 (x 230·Spalte + 50, y 20·Zeile + 315, gewählt gelb und 17).
Tasten mit Flanke: hoch/runter 0…21 mit Umlauf, rechts/links ±7 (nur ab
Platz 1; 15 + 7 = 22 ist kein Platz, wird aber gehalten). OK bzw. Esc wirken
beim Loslassen; OK auf einem Platz speichert (ohne Rückfrage), dann
„Gespeichert“ (Arial 150, 20/150) bzw. „Saved“ (Arial 300, 20/120),
`Save.wav`; immer `FadeOut(0, False)`. Wer das Level mit gehaltenem Feuer
beendet, verlässt den Bildschirm beim Loslassen — wie im Original.

**Spielstand** `App\save\<1…21>.sav` (Version 4): Beschriftung „P<Spieler>
S<Schiff><Durchgang als Buchstabe> - <Level bis „-x“>  <Datum>“, dann zlib:
Spieleranzahl, `Me.1158/115C/1160`, `B48[0..1]`, `A7C[0..1]`, Force,
Partikelplätze, Beam-Block, `Me.524`, `Me.6D8` (keine Drohnen, keine Welt).
Der Index steht **nach** `Save`: Laden beginnt mit dem Zwischenvideo. Der Port
speichert denselben Inhalt als JSON beim Host (`save/<n>`, `saveGame.ts`);
Einstieg `#/dovez?load=<n>`.

**`FadeOut(richtung, abbrechbar)`** (`0x545C70`): 80 × `Wait 16`; das Bild
wird in ein um 16 px gestauchtes Rechteck kopiert (Richtung 0 oben und unten,
sonst eine Seite nach `Int(Rnd · 4)`, dazu ein unbenutztes `Rnd`), 20 %
abgedunkelt und das Anfangsbild mit α 0,95 − 0,05 je Durchlauf darübergelegt.

**Abspann** (`ShowCredits` `0x5566C0`): `credits` 500 × 3000 bei
(150, 600 − t) auf Schwarz, 1 px je `Wait 25` (40 Hz), t = 0…3600 (≈ 90 s);
alle 3 Durchläufe Glitzer (`Add1BigPartikel` Art 14, Größe 60, Verzögerung 3,
Leben 12) an hellen Pixeln (Blau ≥ 128, jede 6. Spalte) der Bildzeilen bei
y = 3 und y = 600; je Durchlauf `Rnd < 0,1` → goldener Funke (drei weitere
`Rnd`: x, y, Wachstum ·10); `balken` schwarz als weiche Kanten
(0, −50)–(800, 50) und (0, 550)–(800, 650); Musik `Enhaced Credits.ogg`; Esc
beendet sofort; danach `FadeOut(1, False)` und Musik in ~0,18 s aus. Port:
`src/game/campaign.ts` (Ablauf), `Game.ts`, `level.ts`, `loadingScreen.ts`,
`videoScene.ts`, `saveScreen.ts`, `credits.ts`, `fadeOut.ts`, `mosaic.ts`;
Sichtprüfung `#/dovez?screen=save|credits`.

Offen: das Byte-Layout des Beam-Blocks im `.sav`, ob die
`Take`-Bilder wirklich gestreckt werden.

## Hauptmenü (`MenuLoop` `0x559630`, `ShowMenu` `0x558890`, `ShowLogo` `0x553730`)

**Start** (nur beim ersten Aufruf): `LoadMenuSurfaces` würfelt den Hangar
(`Int(Rnd · 2)`, vor jedem Menü), dann drei `ShowLogo`: Intergenies
(42, 30, 0, −1) mit `Logo.wav` und Glitch-Vorspann — 91 Durchläufe à `Wait 31`:
schwarz, das Logo dreimal über `RenderVerzerrt` (Gitter 20 × 20, Texturkoordinaten
`(i/n − pu·D, j/n − pv·D)`, `D = sin 9i°·cos 9i°·sin 9j°·cos 9j°`; α 0,33,
normal/additiv/additiv; Winkel alle 5…15 Bilder neu, 3 `Rnd`), Rauschen
(α = sin 2t°/4 + 0,3·Rnd, 48 `Rnd`), Zeilenriss (61 Bänder à 7 px ab y = 90 um
`CLng(CLng((50 − 50·cos 4t°)·sin(y·0,3°)) + 5·Rnd)` px nach rechts, nur ab
3 px) —, dann 72 Bilder voll (`Wait 25`) und `FadeOut(0, True)`; Toxeen und
Clockwork (40, 30, 0, 0): 30 Bilder Einblenden, 40 Halten, 50 Bilder
Zoom-Tunnel (Bild auf (16, 16)–(784, 584) auf sich selbst, 10 % Schwarz, Logo
α 0,80 … 0). Jede Anzeige zieht 1 `Rnd`. Esc beendet jede Phase sofort (ohne
Loslassen). Danach `intro<D|E>.avi`, das Menü blendet aus dem nackten Hangar
ein (α 0,95 … 0), `intro.ogg` in Schleife. `Magnussoft` und `menu_logo` zeigt
das Original nie.

**Jeder Durchlauf** (`Wait 18`, kein Bildauslassen): schwarz, `hangar<h>`,
ab Durchlauf ≈ 101 `hangar_frozen<h>` darüber (α +0,01 je Bild, ab 1 allein)
und Rauschen (α bis 0,025, 48 `Rnd`), DoveZ-Logo (200, 0), Seite, Funken und
Glitzer, Überblende (`Blenden`: Bild erfassen, α 0,95 → 0), Rauschen. Die
Knopfleiste (`ShowMenu`) gleitet mit /4 zum Seitenziel (Start x = −1000):
rote (mit Lücken) und weiße Punktkette aus `a_kreis2` 3 × 3 (je Punkt 1 `Rnd`,
1 : 20 000 eine Garbe aus 10 Funken — 2·(⌊(67n + 82)/2⌋ + 1) `Rnd` je Bild,
352 im Hauptmenü), Lampen (50, 66 + 67i) grün für den gewählten, Knöpfe
(136 + Versatz, 83 + 67i; gewählt gleitet der Versatz auf 30, sonst −3),
`menu_topg`, `menu_bottomg`, Texte Arial 36 grau mit schwarzem Versatz +1/+1.
Tafeln `menu_back` fahren von rechts ein (k = 400/460/320/700 →
`CLng(0,75k − 1)`); Listen (`ShowList`) erst bei k = 0, Arial 24, Farben
QBColor 8 (inaktiv), 7 (wählbar), 15 (gewählt). Schiffsdrehung auf Seite 1:
`shipselect1…` rückwärts (D-Tonator) bzw. `shipselect0…` vorwärts, 2 Bilder
je Stufe, vier Schichten für Bewegungsunschärfe, bei (510 + k, 310).
Highscore-Seite: vier additive Leuchtbänder und je Bild ein Glitzer (7 `Rnd`).

**Seiten:** 3 Hauptmenü (Neu, Laden, Optionen, Highscore, Exit; Esc = Exit),
10 Spieleranzahl (2 Spieler ohne Überblende, so im Original), 1 Schiff (nur
Spieler 1 wählt, Spieler 2 fliegt das andere), 2 Name (`KeyAscii` ab 32,
höchstens 16, Backspace, Enter; leer → „Bruce“; Spiel-ID
`Int(Rnd · 10000) + Durchgänge · 10000`, eindeutig), 20 Spiel laden (Plätze
1–21, Vorauswahl „Zurück“), 30 Optionen (Bonus erst nach einem Durchgang),
31 Grundeinstellungen (Force-Taste `Me.512`, Auto-Arrange `Me.50E`, Trägheit
`Me.510`), 32 Lautstärke (Musik +5 mit Umlauf; Sound/Sprache +250 dB/100, über
0 stumm), 33 Tastenkonfiguration, 40 Bonus (Jungle, Space, Stift je nach
Durchgängen; als Einzellevel), 50 Highscore. ↑/↓ und OK mit Flanke, ohne
Wiederholung, mit Umlauf; Links/Rechts gibt es nicht; Zurück ist Esc/D/Q, im
Hauptmenü und auf den Seiten 1 und 2 nur Esc. Töne: OK `dude`, Umschalten
`plingding`, Sprachtest `speech`. Nach einem Spielstart `FadeOut(1, False)`;
Game Over, EXIT und Skriptende führen zurück ins Menü (ohne Logos), „Exit“
beendet das Programm (im Port: zurück zur Shell). Einen Credits-Eintrag gibt es
nicht; das Osterei „LOV“ fehlt im Port.

Port: `src/game/menu/` (`menuLogic.ts` Logik, `menuView.ts` Zeichnung,
`menuScene.ts` Takt, Töne, Zeicheneingabe, `logos.ts` Logos), Optionen in
`src/game/config.ts` (gespeichert beim Ändern). Abweichungen: Russisch fehlt;
die Tastenseite zeigt die Belegung nur an (Umbelegen fehlt noch); Trägheit
(„Realistic“) lässt sich schalten, wirkt aber noch nicht (der Port kennt nur
Arcade); keine Vibration. `#/dovez?nointro=1` startet ohne Logos und Intro.

