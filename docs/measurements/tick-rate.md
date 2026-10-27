# Original tick rate DOVE

Status: **determined statically from `DOVE.exe`: 14 ms per tick (≈ 71.4 Hz).**
A measurement against the running original is no longer needed, but still serves as
a cross-check (procedure below).

`DOVE.exe` is natively compiled VB6 (765 KB of x86 code, no P-code). The
addresses below are virtual addresses in this EXE (image base `0x400000`);
disassembled with `objdump -d -M intel`.

## Findings

### 1. The main loop ticks at 14 ms

The game loop is a `Do … Loop` in the large form method
`0x46DE60–0x490430`, loop body `0x4708B9–0x48ED45`, aborting on
`Me.[0x690] = 1` or when a counter `[ebp-0x1E4]` reaches 205.
`timeGetTime` (winmm, via the VB6 `Declare` stub `0x40A45C`) drives the
pace; reconstructed (`0x48EA74 ff.`):

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

Before the first iteration, `nextT = timeGetTime + 14` is set (`0x470899`).
The 14 is a fixed constant in the code, not an option. The constant 14 ms
appears throughout the whole program as the frame tick (menus, cutscenes:
`0x45705C`, `0x45AC62`, `0x45CFD1`, `0x4A7B02`, …), alongside 1000 ms for
the seconds counter and short waits of 4 and 10 ms.

If an iteration falls behind schedule, the next one is **not drawn** and
runs through without waiting; afterwards it waits until the old deadline + 30 ms. So
the logic catches up by up to one tick, while the frame skips it — exactly the
catch-up behavior that the spec prescribes for the port.

### 2. One iteration = one level tick = one event line

- The main loop calls the form method at vtable offset `0x7B4` exactly once
  per iteration (`0x472D3B`); no branch in the loop body jumps
  past this call except the loop abort. The method
  is at `0x43D6B0` (thunk `0x4099B5`, vtable entry `0x4090A8`; a VB6 form's
  own methods start at `0x6F8`).
- This method evaluates the event tokens (it holds the references to the
  string constant `§`) and ends with `Me.F4 = Me.F4 + 1` (`0x4451B9`). That is
  the **only** place where `Me.F4` is incremented.
- `Me.F4` is the level tick: the debug display (`0x48BF56`) prints
  `"TICK:" & Me.F4 & " TPS:" & ticksThisSecond & " FPS:" & framesThisSecond`;
  `TPS` and `FPS` are taken over and zeroed once per second (`timeGetTime + 1000`,
  `0x48EC8B`).
- At level start, `Me.F4` is set from `Me.[0x530]` (`0x46E81D`); under
  the condition `Me.[0x644] = 0`, `Me.[0x530] = Me.F4` is stored
  (`0x444935`). `Me.[0x530]` is thus presumably the checkpoint position.

**Exception:** A single path leaves the event method early without
`Me.F4 += 1` (`0x43F566`): in a script-controlled tick range (case 1
of the switch over `Me.[0x39C]`, presumably the level number),
an object with a random Y at x = 640 and vx = −4 is created and the method
ends immediately — the tick then stands still for this one iteration.
That belongs in the engine as a special case, not in the timing.

## Consequences for the port

- `TICK_MS = 14`. A level with 32000 tick lines lasts at most 7:28 min;
  the last events come early (Level 1: tick 6422 ≈ 1:30 min, Level 9:
  tick 15390 ≈ 3:35 min), after which the boss follows.
- **Timer resolution.** The code does not call `timeBeginPeriod`. On machines
  whose system timer runs coarse (typically 15.6 ms under Windows NT/XP without a
  program that raises the resolution), the busy loop waits until the next
  timer step: effectively 15.625 ms ≈ 64 Hz. Under Windows 9x, with
  DirectX/audio drivers that set the timer to 1 ms, it is the
  intended 14 ms. The port takes the **target value of 14 ms**; anyone who wants to
  reproduce the "slow XP feel" gets an option, not a
  default.
- Frame skip: at most one caught-up logic tick per drawn frame in the
  original; the spec (catch-up limit 5 ticks) is more generous, and that is
  intentional (browser tabs pause harder than VB6 windows).
- `Timer1` in the form (`Interval = 1`, form data from offset `0x28D2E`) is
  **not** the game timing.

## Cross-check against the original (optional)

1. Start the original, record Level 1 with OBS (60 fps).
2. Find two events with a known tick in the video, e.g. the first extra `;2`
   at tick 354 and the checkpoint at tick 5279.
3. `(t₂ − t₁) / (5279 − 354)` should yield 14 ms (or 15.6 ms with a coarse
   timer). Do not use `Q`/`W` meanwhile.
