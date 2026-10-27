# DOVE — Audio (Samples, Music, Volumes)

Status: **determined statically from `DOVE.exe`** (M4 groundwork), `objdump -d -M intel`,
image base `0x400000`. Confidence *high* unless noted otherwise. Field names as
`Me.[offset]`. Supplements [`dove-flow.md`](dove-flow.md).

## BASS 0.8

`bass.dll` is accessed through VB6 `Declare` stubs (not an import): among others
`BASS_Init` `0x40B950`, `BASS_SetGlobalVolumes` `0x40B7C0`,
`BASS_GetGlobalVolumes` `0x40B810`, `BASS_MusicLoad` `0x40BF94`,
`BASS_MusicPlay` `0x40C0BC`, `BASS_SampleLoad` `0x40C248`, `BASS_SamplePlay`
`0x40C410`, `BASS_SamplePlayEx` `0x40C45C`, `BASS_SampleStop` `0x40C544`,
`BASS_StreamCreateFile` `0x40C5E0`, `BASS_StreamPlay` `0x40C714`.

- `InitMusik` (`0x433100`): version check `"0.8"` (otherwise `"BASS version 0.8
  was not loaded"` + `End`), `BASS_Init(-1, 44100, 0x10, hWnd)`, `BASS_Start`,
  `BASS_SetVolume(100)`, `BASS_SetGlobalVolumes(100, 100, 100)`. Any failure
  sets `Me.[0x528] = False`.
- `Me.[0x528]` = **audio on** (music *and* samples). Every playback call sits
  inline as `If Me.528 Then BASS_Sample…`; if a call fails, `Me.528 = False`.
  There is **no** shared "PlaySound" method.
- `BASS_SetGlobalVolumes(music, sample, stream)`, each 0–100.
- `BASS_SamplePlayEx(handle, start, freq, volume, pan, loop)`: `freq = −1` =
  original rate, `volume` 0–100. Pan values below are raw as in the code.

## Sample table

`LoadMusik` (`0x4332E0`) fills a name list (`0x4335D2`–`0x4336BE`) and loads
`For i = 0 To 18` with `BASS_SampleLoad(0, App.Path & "data\sound\" & name, 0, 0,
max = 3, flags = 0x20001)` (`0x433797`) into `Me.[0x24C](i)`. Flags =
`BASS_SAMPLE_8BITS | BASS_SAMPLE_OVER_POS`: **at most 3 simultaneous voices per
sample**, the longest-running one is replaced. While loading, the loading
screen's bar advances (`loading.spr`).

| Idx | File | Format | Idx | File | Format |
|---|---|---|---|---|---|
| 0 | `Normal.wav` | PCM 8 bit 22 kHz 0.18 s | 10 | `End2.wav` | ADPCM 22 kHz 1.38 s |
| 1 | `Explosion.wav` | ADPCM 22 kHz 0.73 s | 11 | `getready.wav` | ADPCM 8 kHz 1.44 s |
| 2 | `Antrieb.wav` | ADPCM 22 kHz 0.96 s | 12 | `IceExplosion.wav` | ADPCM 22 kHz 0.87 s |
| 3 | `Jingle.wav` | ADPCM 22 kHz 0.78 s | 13 | `blue.wav` | PCM 8 bit 22 kHz 0.44 s |
| 4 | `Beam1.wav` | ADPCM 22 kHz 0.51 s | 14 | `red.wav` | ADPCM 8 kHz 0.69 s |
| 5 | `Beam2.wav` | ADPCM 22 kHz 0.55 s | 15 | `green.wav` | PCM 8 bit 8 kHz 0.28 s |
| 6 | `charge.wav` | ADPCM 11 kHz 1.13 s | 16 | `End3.wav` | PCM 8 bit 22 kHz 0.57 s |
| 7 | `Yesjo.wav` | ADPCM 22 kHz 0.96 s | 17 | `Yesjo2.wav` | ADPCM 11 kHz 0.82 s |
| 8 | `Fertig.wav` | ADPCM 11 kHz 2.00 s | 18 | `fertig2.wav` | ADPCM 22 kHz 2.25 s |
| 9 | `End1.wav` | ADPCM 22 kHz 0.51 s | — | `domination.wav` | 58-byte stub, **never loaded** |

The casing in the code differs from the file names (Windows is
case-insensitive).

## Events → sample

"Ex(v, p)" = `SamplePlayEx(…, start 0, freq −1, vol v, pan p, loop 0)`;
"Play" = `BASS_SamplePlay` with the sample's default values; Rnd pan = `Int(Rnd·101) − 50`.

| Event | Sample | Parameters | VA |
|---|---|---|---|
| Normal shot (`NEUERSCHUSS`) | 0 Normal | Ex(50, 0) | `0x43576F` |
| Red shot | 14 red | Play | `0x4355CB` |
| Green shot | 15 green | Ex(`(Me.544 + 10)·5`, 0) | `0x435BBD` |
| Blue weapon fires (`Me.548`) | 13 blue | Ex(100, 0), **loop 1** | `0x472212` |
| Blue weapon ends / death / level end / music off | 13 blue | `SampleStop` | `0x472288`, `0x43A220`, `0x48EE2E` … |
| Beam charging (A held), every 10 charge points except 200 | 6 charge | vol 30, pan 0, **loop 1**, freq = `10·charge + 5000` Hz | `0x43A993` |
| Beam charge = 199 | 6 charge | vol 30, loop 1, freq 9990 | `0x43A9D4` |
| Beam released | 6 charge | `SampleStop` | `0x43936D` |
| Beam level 10–199 (three levels 10–75, 76–125, 126–199) | 5 Beam2 | vol 50, **pan +50**, freq −1 | `0x4394F2` |
| Beam full (200) | 4 Beam1 | vol 50, pan +50 | `0x439737` |
| Beam < 10 | — | normal shot | `0x439410` |
| Faster/slower (W/G or Q/F) | 2 Antrieb | Ex(50, Rnd pan) | `0x43A469`, `0x43A661` |
| Level 1 warp (tick 50 and 329) | 2 Antrieb | Ex(50, Rnd pan) | `0x43F1BA` |
| Fly-in counter = 30 after (re)start (*medium*) | 2 Antrieb | Ex(50, Rnd pan) | `0x4718B0` |
| Enemy/boss part destroyed (`HitTest`, 4 sites) | 1 Explosion | Ex(50, Rnd pan) | `0x449BAD`, `0x44DD69`, `0x45118E`, `0x451CC8` |
| Further explosions in the game (*low*: context) | 1 Explosion | Play | `0x478DC8`, `0x47B74D` |
| Level script level 6 | 1 Explosion | Play | `0x44099E`, `0x440CB2`, `0x44120E` |
| Level 5 boss phase, tile reaches x = 155 (*medium*) | 1 Explosion | Play | `0x444E97` |
| Object hits terrain (*low*: which object) | 12 IceExplosion | Play | `0x47BCB6` |
| Extra collected, score += `Int(300·factor)` (*medium*: "Extra") | 3 Jingle | Ex(50, 0) | `0x4764B0` |
| **Player death** (`Me.644` set) | 1 Explosion ×2 | Ex(50, **pan 1**) + Ex(50, **pan 99**), then Stop 6 and Stop 13 | `0x4729B3`/`0x4729FE`, `0x4825EB`, `0x482BFF`, `0x4832C1`, same in boss 4/7/10 |
| Boss level 6 reaches x = 640 (fly-in) | 9 End1 | Play | `0x462E8C` |
| Boss level 6 attack phase | 10 End2 | Play | `0x463727` |
| Boss level 4/7/10 attack phases (*medium*) | 16 End3 | Ex(100, 0) | `0x46489D`, `0x46874F`, `0x46985D`, `0x46BEB3` |
| Get Ready: entry | 11 getready | Play | `0x45E994` |
| Get Ready: on each blink toggle to 1 (every 40 frames, *medium*) | 11 getready | Play | `0x45FBC2` |
| Get Ready exit | 11 getready | `SampleStop` | `0x460000` |
| Continue "YES" (selection 0, *medium*) | 7 / 17 | `Rnd < 0.5` → Yesjo else Yesjo2, Ex(50, 0) | `0x455DA7`, `0x455E11` |
| Continue "NO" | 8 / 18 | `Rnd < 0.5` → Fertig else fertig2, Play | `0x456010`, `0x456070` |
| Title menu appears / selection confirmed | 2 Antrieb | Ex(30, 0) | `0x4AB606`, `0x4ABC82` |
| Intro scene 0, local tick 1520 and 1800 ("Schuss") | 16 End3 | Play | `0x495E9A` |
| Intro scene 0, tick 1633 and 1967 | 1 Explosion | Play | `0x495ED0` |
| Intro scene 2 | 2 Antrieb | Play | `0x495F5A` |

Consequence of the 3-voice limit: while charging the beam, up to three looped
`charge` copies with rising pitch run simultaneously, until `SampleStop` ends them all.

## Music — `PlayMusik(name)` (`0x432BE0`)

```vb
If Me.528 Then
  BASS_StreamFree Me.258: BASS_MusicFree Me.52C: Me.50 = name
  h = BASS_StreamCreateFile(0, App.Path & "data\musik\" & name & ".mp3", 0, 0, 0)
  If h Then BASS_StreamPlay h, 0, 4            ' Loop
  ElseIf Not Exists(".it") And Not Exists(".xm") Then
    If retry < 100 Then PlayMusik "S" & Int(Rnd * 10)   ' random fallback
  Else
    h = BASS_MusicLoad(0, …name & ".it", 0, 0, 5)       ' RAMP | LOOP
    If h = 0 Then h = BASS_MusicLoad(0, …name & ".xm", 0, 0, 5)
    BASS_MusicPlay h
  End If
End If
```

There is no `.mp3`; `.it` is tried before `.xm`. **All modules loop.**

| Situation | Name → file | VA |
|---|---|---|
| Title (also on every return) | `Titel` → `titel.xm` | `0x4AA8F0`, `0x4AAC8A`, `0x4AAD9A`, `0x4AAFFF` |
| Story intro (only start of level 1) | `Intro` → `intro.xm` | `0x49268C` |
| Level L = 0…10 | `"S" & L` → `s0`…`s10`; level 4 → `s4.IT` | `0x46E443`, `0x48F1EF`, `0x48F3D6`, `0x48F714` |
| Level 11 (ExtraLevel) | `S11` missing → **random S0–S9** | `0x432E33` |
| Boss level 1, 3, 5 | `end1` → `end1.xm` | `0x43F6CA`, `0x4401FA`, `0x44049D` |
| Boss level 2, 4, 6, 7, 8, 10 | `end2` → `END2.XM` | `0x43F7FC`, `0x44039D`, `0x440E3C`, `0x4415C1`, `0x441A44`, `0x441C5E` |
| Continue screen | `gameover` → `GameOver.xm` | `0x454DCB` |
| Highscore entry | `Highscore` → `Highscore.xm` | `0x49DB06` |
| Credits slides | `over` → `over.xm` | `0x4A1E87` |
| Credits | `Credits` → `credits.XM` | `0x4A5100` |

Level 9 (ends at tick 15600/8000) and level 11 have no boss transition.

## Volumes, fades, pause

- **Boss fade** (level scripts in `Evente`, shared call `0x441BE5`): for
  F4 ∈ [B−100, B−1], `SetGlobalVolumes(v, 100, v)` with
  `v = 100 − (F4 − (B − 101))` (99 → 0); samples stay at 100. At F4 = B:
  `PlayMusik "end1"/"end2"`, `SetGlobalVolumes(100, 100, 100)`, `Me.198 = 0`,
  `Me.39A = True`. Example level 1: 6750–6849, boss 6850 (`0x43F57E`–`0x43F6F5`).
  For boss ticks see [`dove-events.md`](dove-events.md).
- **New game** (`Spiel` `0x46E16B`) and the **Tutorial** menu item (`0x4AAE87`):
  `For i = 100 To 0: SetGlobalVolumes(i, 100, i)` with a 4 ms wait per step
  (≈ 0.4 s), then `StreamFree`/`MusicFree`.
- **Pause** (ESC in-game, `0x470910`): `SetGlobalVolumes(25, 0, 25)` — music at
  25 %, samples muted; on resume `(100, 100, 100)` (`0x4716A7`).
- **Focus loss / DDERR_SURFACELOST** (`0x887601C2`, on every screen):
  save volumes (`GetGlobalVolumes`), `(25, 0, 25)`, wait until restored,
  reload surfaces, restore volumes.
- **Intro end**: fade out music (`0x49781B`), then free it.
- **Level change/Continue**: free music, `(100, 100, 100)`, new level music.
- **F6** (`KeyDown` `0x430E6A`): `Me.528 = Not Me.528`; on → `PlayMusik Me.50`
  and `(100, 100, 100)`; off → free stream/music; message "Musik ein/aus" or
  "Listen to the Music"/"Allright, i turn the music off " for 300 ticks.
- There is **no music-volume option**. The `NOSOUND` command line and the
  sound toggle in the startup dialog / `Config.cfg` set `Me.528` (see
  [`dove-flow.md`](dove-flow.md)).

## Consequences for the port

- Reproduce a per-sample voice-pool limit of 3 with "replace oldest" (audible
  while charging the beam and during explosion chains).
- Keep the music and sample buses separate; boss fade and pause act only on the
  music bus (pause additionally mutes the sample bus).
- Level 11: draw the random music through the VB6 LCG (seed as in
  [`dove-events.md`](dove-events.md)).

## Open

- Pan semantics of BASS 0.8: beam +50 and death with 1/99 look off; whether the
  port takes this literally or maps it to −100…100 remains to be heard.
- Exact triggers of End1/End2/End3 in the bosses (phase counter) and of
  IceExplosion (`0x47BCB6`).
- Check the repeat rate of `getready.wav` (blink toggle every 20 frames).
- `Explosion` calls `0x478DC8`/`0x47B74D`: which object.
