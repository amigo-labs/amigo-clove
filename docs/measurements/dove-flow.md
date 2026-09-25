# DOVE — Programmablauf, Menüs, Bildschirme, Dateien

Status: **statisch bestimmt aus `DOVE.exe`** (M4-Vorarbeit), `objdump -d -M intel`,
Image-Base `0x400000`. Konfidenz *hoch*, wo nicht anders vermerkt. Audio-Details
in [`dove-audio.md`](dove-audio.md). Alle Bildschirme takten mit **14 ms/Frame**
(`timeGetTime + 14`).

**Achtung Methodennamen:** Die Namen aus der VB-Namensliste passen im Bereich
Vtable `0x6F8`–`0x74C` nicht (z. B. ist `0x42C7D0` der gif/jpg/bmp→`.spr`-
Konverter, `0x42AD20` das Flip). Ab `0x750` stimmen sie mit dem Code überein.

## Kommandozeile

| Batch | Inhalt | Wirkung |
|---|---|---|
| `Dove - NOSOUND.bat` | `Dove.exe -nosound` | `InStr(UCase(Command$), "NOSOUND")` → `Me.528 = False` (`0x431C42`) |
| `Dove - No Intro.bat` | `Dove.exe -nointro` | `"-NOINTRO"` → `PlayIntro` wird übersprungen (`0x49177A`) |
| (undokumentiert) | `GOTO<d>` | `Me.2DC = Val(Mid$(Command$, pos + 4, 1))` (`0x431D07`): **eine** Ziffer, Startlevel |

`LoadData` (`Config.cfg`) läuft nach dem Parsen (`0x4322E1`) und liest `Me.528`
erneut; ein gespeicherter Sound-Schalter überschreibt `NOSOUND` (*mittel*).

## Start

1. `Form_Load` (~`0x431100`): Kommandozeile, Standard-Highscores, `LoadData`.
   Startdialog mit Sprache DE/EN (`Me.350`, True = Deutsch), Fenstermodus
   (`Me.118`) und Sound (`Me.528`) (*mittel*: Dialogaufbau).
2. Start-Handler `0x4A9B60` (Thunk `0x409BF9`) ruft `0x4A7F70`: DirectDraw,
   `InitMusik`, Ladebildschirm `loading.spr`, `metroid.dat`, Samples laden mit
   Balken. Fehlertexte „Sry, bad graphic-card“, „Bitte installieren sie Direct X7
   oder höher“.
3. `ShowNEOARTS` (`0x4A7880`): NEO-ARTS-Logo aus `titel.spr` (0,0)–(224,241) und
   `PutTextA "presents"` (*mittel*: Zeiten).
4. `erstelleHighScoreS` (`0x49FFE0`): rendert die Highscoreliste in eine
   280×150-Offscreen-Surface (Zeilen „Platz. Name…….. |Punkte“, `text.spr`).
5. Titel.

## Titel

- **Sternenfeld**: 1000 Sterne, x = `Int(Rnd·640)`, y = `Int(Rnd·480)`,
  Tempo `Int(Rnd·4) + 1` (`0x4A9F7A`).
- **Easteregg „KATHA♥“** (`0x4AA39F`–`0x4AA87A`): fünf Zeilen ASCII-Art
  (`0x4128F4`, `0x41293C`, `0x412988`, `0x4129D4`, `0x412A1C`):

  ```
  *  *   *   ***** *  *   *     * *
  * *   * *    *   *  *  * *   * * *
  **   *****   *   **** *****  *   *
  * *  *   *   *   *  * *   *   * *
  *  * *   *   *   *  * *   *    *
  ```

  Jedes `*` wird zu einem Stern an x = 500 + 17·Spalte, y = 300 + 17·Zeile,
  Tempo 1,0, Farbe aus (84, 84, 64): der Schriftzug zieht mit dem Sternenfeld
  durchs Bild.
- **DOVE-Logo** (`Logo` `0x49D300`): `logo.spr` 940×600 = 24 Frames à 235×100,
  4 pro Zeile; alle 5 Aufrufe nächster Frame, Umbruch bei 24; Quelle
  ((f mod 4)·235, (f \ 4)·100).
- **Menü** (Grafik in `titel.spr` rechts oben): Cursor-y = 120 + 42·k,
  begrenzt 120…330. Tasten ↑/Num 8, ↓/Num 2/Num 5, Joystick. Bestätigen mit
  Enter, S, A, Leertaste, Joystick-Knopf: Antrieb-Sound, Animation x 400 → 640
  (+4/Frame), dann Sprung über die Tabelle `0x4AF742`/`0x4AF726`:

| k | y | Menüpunkt | Aktion |
|---|---|---|---|
| 0 | 120 | Let's go! | `ShowLevelSelect`, dann `Spiel` (außer `Me.690 = 5`) |
| 1 | 162 | Extralevel | `Me.39C = 11`, `Spiel` — immer verfügbar |
| 2 | 204 | Tutorial | Musik ausblenden, `Me.39C = 0`, `Spiel` |
| 3 | 246 | Info | `info` (`0x490430`): Readme-Anzeige (`liesmich.txt`/`readme.txt` je Sprache) mit Credits-Kopf |
| 4 | 288 | Options | `Schwierigkeitsgrad` (`0x457E80`) |
| 5 | 330 | Quit | `Me.690 = 1` |

- ESC im Titel → `Me.690 = 2`. Beides beendet die Titelschleife → Abschiedsbild
  (`0x4AD5B0`): „Hat's euch gefallen? …“, „Tipp: wenn der Punktefaktor ) 1 ist …
  kann man speichern!“, Großschrift „www“ „Kauto“ „de“; dann BASS frei, `End`.
- `PlaySecretIntro` (`0x4980A0`, Museumsdialog Markus/David/Lehrer) hat
  **keinen Aufrufer** — toter Code.

## Optionen und Punktefaktor

| Punkt | Werte | Feld |
|---|---|---|
| „Gegner schießen:“ | AUS / VOLL / HALB (0 / 1 / 2) | `Me.634` |
| „Kollision mit Wand:“ | Ja, klar / Nein | `Me.640` |
| „Waffenverlust nach dem Tod:“ | Ja / Nein | `Me.642` |
| „Einstellungen speichern“ | → „Einstellungen gespeichert!“, `SaveData` | |
| „Zurück“ | Titel | |

Englisch parallel („shooting enemies:“, „Touching walls destroys the ship :“ …).
Anzeige „Punktefaktor: “ & Faktor und, wenn Faktor ≥ 1,25, „Levels können
erspielt werden“ (`0x45A9AA`) (*mittel*: Positionen). Faktor `Me.638`
(`0x46DF6B`): `Me.634` 0 → 0,75, 1 → 1,25, sonst 1,0; −0,25 wenn Wände nicht
töten; +0,25 mit Waffenverlust, sonst −0,25. Standard 1,0.

## Levelauswahl und `Config.cfg`

- `ShowLevelSelect` (`0x45B220`): Ist **kein** Level 1–10 freigeschaltet,
  sofortige Rückkehr mit `Me.39C = Me.2DC` (Standard 1, siehe `GOTO`).
- Sonst Liste „1. Lost In Space“ … „10. Final Fight“ an (10, 100 + 20·i), nur
  freigeschaltete Level und das aktuelle, Cursor `)`; Vorschau
  `data\grafik\<L>.spr`. ESC → `Me.690 = 5`.
- Freischalten (`0x48F031`): bei Levelende, wenn `Me.2FC = 0` und Faktor > 1,0 →
  `Me.2F0(L + 1) = True`, `SaveData`.
- `Config.cfg` (`App.Path`, VB `Write #`, `LoadData` `0x457B30`): `Me.634`,
  `Me.640`, `Me.642`, dann **eine Zeile je Level 1…10**, die nur bei exakt
  diesem Satz freischaltet, zuletzt `Me.350`, `Me.118`, `Me.528`:

| Level | Satz |
|---|---|
| 1 | `TRUE` |
| 2 | `ASDDSA` |
| 3 | `123 in the place to be` |
| 4 | `baby baby come on come on` |
| 5 | `unsere Styles sind noch krasser` |
| 6 | `als die Namen von Pokémon!` |
| 7 | `und noch ein Schlüsselsatz` |
| 8 | `Mein Gott, ich muss zur Fahrschule!` |
| 9 | `Ich bin ein eingeschobenes Level %-)` |
| 10 | `Dieser Satz schaltet das geheime Level frei!` |

## `Spiel` (`0x46DE60`)

1. `Me.39C = 1` → `PlayIntro` (`0x46DF1F`).
2. Punktefaktor, Musik ausblenden, Leben `Me.114 = 2`, Punkte 0,
   Checkpoint `Me.530 = 0`, `LevelLaden`, `PlayMusik "S" & L`, **Get Ready**
   (`0x47081C`); ESC direkt danach → `Me.690 = 1`.
3. Hauptschleife (siehe [`tick-rate.md`](tick-rate.md)); Ende über `Me.690`:

| `Me.690` | Bedeutung | Folge |
|---|---|---|
| 3 | Level geschafft (`0x4719C0`) | `data\level<L+1>.dat` existiert und L < 10 → L + 1, Musik neu, Get Ready; L = 10 → `HighScore`, `ShowOutro` |
| 1 | Abbruch (Pause „Ende“) | `HighScore` |
| — | Leben < 0 | `Continue` (`0x48F597`): YES → Checkpoint, Leben 2, Punkte 0; NO → `HighScore` |
| 2 | Spiel vorbei | zurück zum Titel, `PlayMusik "Titel"` |

Tutorial (L 0) kehrt immer zum Titel zurück (`0x48EDB9`). `Me.634 > 2` wird auf
2 gekappt.

## Get Ready (`0x45D8A0`)

- Levelnamen (`0x45D934`): Tutorial, Lost In Space, Factory, Deep Blue See, Back
  in Space, Crystal Cave, Speed, The Unreal World, DOVE INSIDE, Final Level,
  Final Fight; L 11–19 „ExtraLevel 1…9“.
- Vorschau `data\grafik\<L>.spr` (320×240), sonst `Extralevel.spr`, an
  (160, 120), Rahmenlinien x 159/480, y 119/360; 100 Partikel.
- Laufschrift in `text2.spr`: `"           Level " & L & " - " & Name & " - GET
  READY Points:" & Punkte & " Ships:" & Leben & "             "`.
- Zähler +1/Frame, bei 20 Umschalten eines Blink-Flags; bei 0 wird `ss.spr`
  (81,116)–(194,137) zentriert an y = 230 gezeichnet, beim Wechsel auf 1
  erklingt `getready.wav` (*mittel*).
- Ende mit S, A, Enter oder Joystick-Knopf (*mittel*: kein Timeout gefunden).

## Pause (ESC im Spiel, `0x4708E6`)

Nur wenn der Todeszähler nicht läuft. `SetGlobalVolumes(25, 0, 25)`, warten auf
Loslassen von ESC/A/S/Leertaste/Enter. Panel `konsole.spr` (0,70)–(100,70+k)
(„Pause | Weiter / Ende“) fährt mit k = 0…30 (+1/Frame) an (270, 410 − k) hoch;
ein 48 px breiter Marker (100,70)–(148,…) wechselt zwischen den Zeilen
(Offset 3…14) (*mittel*). ↑/↓ wählen (`Me.690` 0 = Weiter, 1 = Ende),
Enter/A/S/Leertaste bestätigen, ESC setzt fort.

## Continue (`0x4549C0`)

Musik `gameover`; Grafik aus `titel.spr` (GAMEOVER, „Continue Game?“, „Yes, ya!“,
„No!“); „Score:“ & Punkte; wenn die Punkte in die Liste kommen: „Select 'NO' to
put your name on the rank list N.“. Auswahl 0 = YES (*mittel*).

## Highscore

- 9 Einträge, Namen `Me.2B4(1…9)`, Punkte `Me.2D0(1…9)` (Strings, kodiert).
- Standard (`0x42F5C0`): 1 David Lee 100000, 2 Kauto 80000, 3–8 xenion, XPiRE,
  MaKo, HiBri, Manuel Kempf, Pickel mit 60000/50000/40000/30000/20000/15000,
  9 Toxeen 10000; danach 101 Zufallstausche der **Namen** auf den Plätzen 3–8
  (Index `Int(Rnd·6) + 3`).
- `Highscore.dat` (`App.Path`, `HighLaden` `0x49FD00`, `Line Input`), Zeilen in
  dieser Reihenfolge: Name 2, Name 8, Name 7, Punkte 3, Punkte 9, Name 4,
  Punkte 5, `Me.2A0`, Name 6, Punkte 4, Name 9, Punkte 6, Punkte 7, Name 1,
  Punkte 8, Punkte 2, eine Variant-Zeile → Decode → `Me.300`, Name 5, Name 3,
  Punkte 1. Punkte über Encode `0x42EBE0` / Decode `0x42F0A0`; schlägt die
  Prüfung `0x42E9B0` fehl → Standardliste.
- Eingabe (`HighScore` `0x49D620`): Musik `Highscore`, Partikel, Großschrift
  „You placed“ N + st/nd/rd/th, „Enter your name here:“ + Name + `§` als Cursor,
  höchstens 20 Zeichen; leerer Name → „David Lee“ (*mittel*); Einfügen,
  `HighSpeichern`.

## Abspann: `B1`–`B5` und `1.dat`–`5.dat`

`B1.spr`–`B5.spr` sind **kein Vorhang zwischen den Leveln**, sondern die fünf
Abspann-Dias von `ShowOutro` (`0x4A0D00`), **verwürfelt gespeichert**.

- Bild 640×450 = **64 × 45 Kacheln à 10×10 px = 2880 Kacheln**.
- `data\<n>.dat` = 2880 × Int32 LE (11520 Byte), eine Permutation von 0…2879
  (`0x4A2427`–`0x4A2510`, `Get #`).
- Entwürfeln (`0x4A2736`–`0x4A294D`), i = 0…2879, p = perm[i]:
  Ziel (`(i mod 64)·10`, `(i \ 64)·10`) ← Quelle (`(p mod 64)·10`,
  `(p \ 64)·10`), je 10×10. Geprüft: ergibt ein korrektes Bild.
- Ablauf: Musik `over`, je Dia zwei Zeilen Story (DE/EN; „…ruft: <Name>,
  <Name>!“ aus `Me.2A0`, *mittel*), Überblendung; danach Musik `Credits`,
  Credit-Liste (`0x41158C` …), fliegendes Schiff (*niedrig*: Zeiten).

## `intro.dat` (`PlayIntro` `0x4916D0`)

VB-`Write #`-Text; der Parser verbraucht alle 780 Tokens (`String`, `Long` &,
`Integer` %, `Boolean` #):

```
header$                                  ' "1"
For s = 0 To 10                          ' 11 Szenenplätze
  bg$, dauerTicks&, sheet$, nRects%
  nRects × (name$, l&, t&, r&, b&)       ' Rects in sheet
  m& ;  (m+1) × (größe%, tick&, x%, y%)  ' Partikelexplosionen
  nObj% ; nObj × ( sprite&, nk& ,
      (nk+1) × (t&, sichtbar#, x%, y%, lerp%, skala%, frame0%, frames%, ticksProFrame%) )
  nSnd% ; (nSnd+1) × (tick&, name$)      ' ungenutzt
Next
```

- `lerp% = −1`: x, y und `skala` linear zum nächsten Keyframe interpolieren.
- `skala% = 100`: BltFast 1:1, sonst gestreckt auf B·s/100 × H·s/100 (*mittel*).
- Animationsframes liegen untereinander: Quell-top = t + frame·(b − t).
- Benutzt: Szene 0 (`background1.spr`, 2100 Ticks, 13 Rects „Erde“, „Raumschiff“,
  „Schuss“ …, 14 Objekte), 1 (`intro2.spr`, 500 Ticks, „Uhr“, „Antrieb“),
  2 (`background1.spr`, 300 Ticks, Standbild); 3–10 leer. Musik `Intro`,
  am Ende ausgeblendet.

## Großschrift `text2.spr`

`GetBigLetter` (`0x452180`): A–Z → 0–25, 0–9 → 26–35, `(` 36, `)` 37, `:` 38,
`-` 39, alles andere → 0 („A“). Zelle **60×75**, 5 pro Zeile (Datei 300×600):
Rect ((i mod 5)·60, (i \ 5)·75)–(+60, +75). `PutBigText(x, y, s)` (`0x452B40`):
Großbuchstaben, Zeichen k an x + 60·(k − 1), Leerzeichen rücken vor ohne
Zeichnen; BltFast mit Quell-Colorkey, rechts an x = 640 und links bei x < 0
geclippt.

## Funktionstasten im Spiel

| Taste | Wirkung (Meldung 300 Ticks, `Me.344`) | VA |
|---|---|---|
| F1 | Lasertransparenz („Effects1“) | `0x439E06` |
| F2 | Fastblt / Flip (`Me.648`) | `0x439EC6`, `0x430E34` |
| F3 | Infos zeigen/verbergen | `0x439F54` |
| F4 | Energie anzeigen („Show HP“) | `0x43A014` |
| F5 | Joystick/Gamepad an/aus (`Me.60`) | `0x43A0D4` |
| F6 | Audio an/aus (`Me.528`) | `0x430E60` |
| F7 | Partikeleffekt (`Me.3FA`) | `0x430EED` |
| F8 | Fenstergröße (nur mit `Me.118`) (*mittel*) | `0x430F09` |

## Offen

- Timeout des Get-Ready-Bildschirms; genaue Geometrie des Pause-Markers.
- Zeiten der Abspann-Dias, des Abschiedsbilds und von `ShowNEOARTS`.
- Ob die „KATHA♥“-Sterne beim Umbruch neue Zufalls-y bekommen (Schriftzug
  zerfällt) oder erhalten bleiben.
- Bedeutung von `Me.2FC`, `Me.300` und `Me.2A0` (Spielername?).
- Aufbau des Startdialogs (Steuerelemente `0x300`–`0x314`).
