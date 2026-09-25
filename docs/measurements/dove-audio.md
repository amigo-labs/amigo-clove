# DOVE — Audio (Samples, Musik, Lautstärken)

Status: **statisch bestimmt aus `DOVE.exe`** (M4-Vorarbeit), `objdump -d -M intel`,
Image-Base `0x400000`. Konfidenz *hoch*, wo nicht anders vermerkt. Feldnamen als
`Me.[offset]`. Ergänzt [`dove-flow.md`](dove-flow.md).

## BASS 0.8

`bass.dll` wird über VB6-`Declare`-Stubs angesprochen (kein Import): u. a.
`BASS_Init` `0x40B950`, `BASS_SetGlobalVolumes` `0x40B7C0`,
`BASS_GetGlobalVolumes` `0x40B810`, `BASS_MusicLoad` `0x40BF94`,
`BASS_MusicPlay` `0x40C0BC`, `BASS_SampleLoad` `0x40C248`, `BASS_SamplePlay`
`0x40C410`, `BASS_SamplePlayEx` `0x40C45C`, `BASS_SampleStop` `0x40C544`,
`BASS_StreamCreateFile` `0x40C5E0`, `BASS_StreamPlay` `0x40C714`.

- `InitMusik` (`0x433100`): Versionsprüfung `"0.8"` (sonst `"BASS version 0.8
  was not loaded"` + `End`), `BASS_Init(-1, 44100, 0x10, hWnd)`, `BASS_Start`,
  `BASS_SetVolume(100)`, `BASS_SetGlobalVolumes(100, 100, 100)`. Jeder Fehler
  setzt `Me.[0x528] = False`.
- `Me.[0x528]` = **Audio an** (Musik *und* Samples). Jeder Abspielaufruf steht
  inline als `If Me.528 Then BASS_Sample…`; schlägt ein Aufruf fehl, wird
  `Me.528 = False`. Es gibt **keine** gemeinsame „PlaySound“-Methode.
- `BASS_SetGlobalVolumes(music, sample, stream)`, je 0–100.
- `BASS_SamplePlayEx(handle, start, freq, volume, pan, loop)`: `freq = −1` =
  Originalrate, `volume` 0–100. Pan-Werte unten roh wie im Code.

## Sample-Tabelle

`LoadMusik` (`0x4332E0`) füllt eine Namensliste (`0x4335D2`–`0x4336BE`) und lädt
`For i = 0 To 18` mit `BASS_SampleLoad(0, App.Path & "data\sound\" & name, 0, 0,
max = 3, flags = 0x20001)` (`0x433797`) nach `Me.[0x24C](i)`. Flags =
`BASS_SAMPLE_8BITS | BASS_SAMPLE_OVER_POS`: **höchstens 3 gleichzeitige Stimmen
pro Sample**, die am längsten laufende wird ersetzt. Während des Ladens läuft der
Balken des Ladebildschirms (`loading.spr`).

| Idx | Datei | Format | Idx | Datei | Format |
|---|---|---|---|---|---|
| 0 | `Normal.wav` | PCM 8 bit 22 kHz 0,18 s | 10 | `End2.wav` | ADPCM 22 kHz 1,38 s |
| 1 | `Explosion.wav` | ADPCM 22 kHz 0,73 s | 11 | `getready.wav` | ADPCM 8 kHz 1,44 s |
| 2 | `Antrieb.wav` | ADPCM 22 kHz 0,96 s | 12 | `IceExplosion.wav` | ADPCM 22 kHz 0,87 s |
| 3 | `Jingle.wav` | ADPCM 22 kHz 0,78 s | 13 | `blue.wav` | PCM 8 bit 22 kHz 0,44 s |
| 4 | `Beam1.wav` | ADPCM 22 kHz 0,51 s | 14 | `red.wav` | ADPCM 8 kHz 0,69 s |
| 5 | `Beam2.wav` | ADPCM 22 kHz 0,55 s | 15 | `green.wav` | PCM 8 bit 8 kHz 0,28 s |
| 6 | `charge.wav` | ADPCM 11 kHz 1,13 s | 16 | `End3.wav` | PCM 8 bit 22 kHz 0,57 s |
| 7 | `Yesjo.wav` | ADPCM 22 kHz 0,96 s | 17 | `Yesjo2.wav` | ADPCM 11 kHz 0,82 s |
| 8 | `Fertig.wav` | ADPCM 11 kHz 2,00 s | 18 | `fertig2.wav` | ADPCM 22 kHz 2,25 s |
| 9 | `End1.wav` | ADPCM 22 kHz 0,51 s | — | `domination.wav` | 58-Byte-Stub, **nie geladen** |

Die Groß-/Kleinschreibung im Code weicht von den Dateinamen ab (Windows ist
case-insensitiv).

## Ereignisse → Sample

„Ex(v, p)“ = `SamplePlayEx(…, start 0, freq −1, vol v, pan p, loop 0)`;
„Play“ = `BASS_SamplePlay` mit Sample-Standardwerten; Rnd-Pan = `Int(Rnd·101) − 50`.

| Ereignis | Sample | Parameter | VA |
|---|---|---|---|
| Normaler Schuss (`NEUERSCHUSS`) | 0 Normal | Ex(50, 0) | `0x43576F` |
| Roter Schuss | 14 red | Play | `0x4355CB` |
| Grüner Schuss | 15 green | Ex(`(Me.544 + 10)·5`, 0) | `0x435BBD` |
| Blaue Waffe feuert (`Me.548`) | 13 blue | Ex(100, 0), **loop 1** | `0x472212` |
| Blaue Waffe endet / Tod / Levelende / Musik aus | 13 blue | `SampleStop` | `0x472288`, `0x43A220`, `0x48EE2E` … |
| Beam laden (A gehalten), alle 10 Ladepunkte außer 200 | 6 charge | vol 30, pan 0, **loop 1**, freq = `10·Ladung + 5000` Hz | `0x43A993` |
| Beam-Ladung = 199 | 6 charge | vol 30, loop 1, freq 9990 | `0x43A9D4` |
| Beam loslassen | 6 charge | `SampleStop` | `0x43936D` |
| Beam Stufe 10–199 (drei Stufen 10–75, 76–125, 126–199) | 5 Beam2 | vol 50, **pan +50**, freq −1 | `0x4394F2` |
| Beam voll (200) | 4 Beam1 | vol 50, pan +50 | `0x439737` |
| Beam < 10 | — | normaler Schuss | `0x439410` |
| Schneller/langsamer (W/G bzw. Q/F) | 2 Antrieb | Ex(50, Rnd-Pan) | `0x43A469`, `0x43A661` |
| Level 1 Warp (Tick 50 und 329) | 2 Antrieb | Ex(50, Rnd-Pan) | `0x43F1BA` |
| Einflug-Zähler = 30 nach (Re-)Start (*mittel*) | 2 Antrieb | Ex(50, Rnd-Pan) | `0x4718B0` |
| Gegner/Bossteil zerstört (`HitTest`, 4 Stellen) | 1 Explosion | Ex(50, Rnd-Pan) | `0x449BAD`, `0x44DD69`, `0x45118E`, `0x451CC8` |
| Weitere Explosionen im Spiel (*niedrig*: Kontext) | 1 Explosion | Play | `0x478DC8`, `0x47B74D` |
| Levelskript Level 6 | 1 Explosion | Play | `0x44099E`, `0x440CB2`, `0x44120E` |
| Level 5 Bossphase, Tile erreicht x = 155 (*mittel*) | 1 Explosion | Play | `0x444E97` |
| Objekt trifft Landschaft (*niedrig*: welches Objekt) | 12 IceExplosion | Play | `0x47BCB6` |
| Extra eingesammelt, Punkte += `Int(300·Faktor)` (*mittel*: „Extra“) | 3 Jingle | Ex(50, 0) | `0x4764B0` |
| **Spielertod** (`Me.644` gesetzt) | 1 Explosion ×2 | Ex(50, **pan 1**) + Ex(50, **pan 99**), dann Stop 6 und Stop 13 | `0x4729B3`/`0x4729FE`, `0x4825EB`, `0x482BFF`, `0x4832C1`, in Boss 4/7/10 gleich |
| Boss Level 6 erreicht x = 640 (Einflug) | 9 End1 | Play | `0x462E8C` |
| Boss Level 6 Angriffsphase | 10 End2 | Play | `0x463727` |
| Boss Level 4/7/10 Angriffsphasen (*mittel*) | 16 End3 | Ex(100, 0) | `0x46489D`, `0x46874F`, `0x46985D`, `0x46BEB3` |
| Get Ready: Eintritt | 11 getready | Play | `0x45E994` |
| Get Ready: bei jedem Blink-Wechsel auf 1 (alle 40 Frames, *mittel*) | 11 getready | Play | `0x45FBC2` |
| Get Ready verlassen | 11 getready | `SampleStop` | `0x460000` |
| Continue „YES“ (Auswahl 0, *mittel*) | 7 / 17 | `Rnd < 0,5` → Yesjo sonst Yesjo2, Ex(50, 0) | `0x455DA7`, `0x455E11` |
| Continue „NO“ | 8 / 18 | `Rnd < 0,5` → Fertig sonst fertig2, Play | `0x456010`, `0x456070` |
| Titelmenü erscheint / Auswahl bestätigt | 2 Antrieb | Ex(30, 0) | `0x4AB606`, `0x4ABC82` |
| Intro Szene 0, lokaler Tick 1520 und 1800 („Schuss“) | 16 End3 | Play | `0x495E9A` |
| Intro Szene 0, Tick 1633 und 1967 | 1 Explosion | Play | `0x495ED0` |
| Intro Szene 2 | 2 Antrieb | Play | `0x495F5A` |

Folge der 3-Stimmen-Grenze: beim Beam-Laden laufen bis zu drei geloopte
`charge`-Kopien mit steigender Tonhöhe gleichzeitig, bis `SampleStop` alle beendet.

## Musik — `PlayMusik(name)` (`0x432BE0`)

```vb
If Me.528 Then
  BASS_StreamFree Me.258: BASS_MusicFree Me.52C: Me.50 = name
  h = BASS_StreamCreateFile(0, App.Path & "data\musik\" & name & ".mp3", 0, 0, 0)
  If h Then BASS_StreamPlay h, 0, 4            ' Loop
  ElseIf Not Exists(".it") And Not Exists(".xm") Then
    If retry < 100 Then PlayMusik "S" & Int(Rnd * 10)   ' Zufallsersatz
  Else
    h = BASS_MusicLoad(0, …name & ".it", 0, 0, 5)       ' RAMP | LOOP
    If h = 0 Then h = BASS_MusicLoad(0, …name & ".xm", 0, 0, 5)
    BASS_MusicPlay h
  End If
End If
```

Es gibt keine `.mp3`; `.it` wird vor `.xm` probiert. **Alle Module loopen.**

| Situation | Name → Datei | VA |
|---|---|---|
| Titel (auch bei jeder Rückkehr) | `Titel` → `titel.xm` | `0x4AA8F0`, `0x4AAC8A`, `0x4AAD9A`, `0x4AAFFF` |
| Story-Intro (nur Start von Level 1) | `Intro` → `intro.xm` | `0x49268C` |
| Level L = 0…10 | `"S" & L` → `s0`…`s10`; Level 4 → `s4.IT` | `0x46E443`, `0x48F1EF`, `0x48F3D6`, `0x48F714` |
| Level 11 (ExtraLevel) | `S11` fehlt → **zufällig S0–S9** | `0x432E33` |
| Boss Level 1, 3, 5 | `end1` → `end1.xm` | `0x43F6CA`, `0x4401FA`, `0x44049D` |
| Boss Level 2, 4, 6, 7, 8, 10 | `end2` → `END2.XM` | `0x43F7FC`, `0x44039D`, `0x440E3C`, `0x4415C1`, `0x441A44`, `0x441C5E` |
| Continue-Bildschirm | `gameover` → `GameOver.xm` | `0x454DCB` |
| Highscore-Eingabe | `Highscore` → `Highscore.xm` | `0x49DB06` |
| Abspann-Dias | `over` → `over.xm` | `0x4A1E87` |
| Credits | `Credits` → `credits.XM` | `0x4A5100` |

Level 9 (Ende bei Tick 15600/8000) und Level 11 haben keinen Bosswechsel.

## Lautstärken, Fades, Pause

- **Boss-Fade** (Levelskripte in `Evente`, gemeinsamer Aufruf `0x441BE5`): für
  F4 ∈ [B−100, B−1] gilt `SetGlobalVolumes(v, 100, v)` mit
  `v = 100 − (F4 − (B − 101))` (99 → 0); Samples bleiben bei 100. Bei F4 = B:
  `PlayMusik "end1"/"end2"`, `SetGlobalVolumes(100, 100, 100)`, `Me.198 = 0`,
  `Me.39A = True`. Beispiel Level 1: 6750–6849, Boss 6850 (`0x43F57E`–`0x43F6F5`).
  Boss-Ticks siehe [`dove-events.md`](dove-events.md).
- **Neues Spiel** (`Spiel` `0x46E16B`) und Menüpunkt **Tutorial** (`0x4AAE87`):
  `For i = 100 To 0: SetGlobalVolumes(i, 100, i)` mit 4 ms Wartezeit je Schritt
  (≈ 0,4 s), danach `StreamFree`/`MusicFree`.
- **Pause** (ESC im Spiel, `0x470910`): `SetGlobalVolumes(25, 0, 25)` — Musik
  25 %, Samples stumm; beim Fortsetzen `(100, 100, 100)` (`0x4716A7`).
- **Fokusverlust / DDERR_SURFACELOST** (`0x887601C2`, in jedem Bildschirm):
  Lautstärken sichern (`GetGlobalVolumes`), `(25, 0, 25)`, warten bis
  wiederhergestellt, Surfaces neu laden, Lautstärken zurück.
- **Intro-Ende**: Musik ausblenden (`0x49781B`), dann freigeben.
- **Levelwechsel/Continue**: Musik frei, `(100, 100, 100)`, neue Levelmusik.
- **F6** (`KeyDown` `0x430E6A`): `Me.528 = Not Me.528`; an → `PlayMusik Me.50`
  und `(100, 100, 100)`; aus → Stream/Musik frei; Meldung „Musik ein/aus“ bzw.
  „Listen to the Music“/„Allright, i turn the music off “ 300 Ticks lang.
- Es gibt **keine Musiklautstärke-Option**. Kommandozeile `NOSOUND` und der
  Sound-Schalter im Startdialog / `Config.cfg` setzen `Me.528` (siehe
  [`dove-flow.md`](dove-flow.md)).

## Konsequenzen für den Port

- Pro Sample eine Voice-Pool-Grenze von 3 mit „älteste ersetzen“ nachbilden
  (hörbar beim Beam-Laden und bei Explosionsketten).
- Musik- und Sample-Bus getrennt; Boss-Fade und Pause wirken nur auf den
  Musikbus (Pause stummt zusätzlich den Samplebus).
- Level 11: Zufallsmusik über das VB6-LCG ziehen (Seed wie in
  [`dove-events.md`](dove-events.md)).

## Offen

- Pan-Semantik von BASS 0.8: Beam +50 und Tod mit 1/99 wirken schief; ob der
  Port das wörtlich übernimmt oder auf −100…100 abbildet, ist zu hören.
- Genaue Auslöser von End1/End2/End3 in den Bossen (Phasenzähler) und von
  IceExplosion (`0x47BCB6`).
- Wiederholrate von `getready.wav` (Blink-Wechsel alle 20 Frames) prüfen.
- `Explosion`-Aufrufe `0x478DC8`/`0x47B74D`: welches Objekt.
