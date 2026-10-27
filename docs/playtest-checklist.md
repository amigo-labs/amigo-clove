# Playtest checklist DOVE

What the automated tests **cannot** prove. Replays check the port
against itself, cross-validation checks assets against data — fidelity
to the original in timing, feel and rendering needs the comparison against the
running original (reference recording with OBS, 60 fps).

## Status M3 — reconcile against the original

- [ ] **Tick rate:** time two events with a known tick in the video
      (`docs/measurements/tick-rate.md`, "Gegenprobe").
- [ ] **Scroll speed:** landscape 1 px/tick, background objects 0.5 px/tick.
- [ ] **Warp intro Level 1** (tick 51–350): stars accelerate, hold, brake.
- [ ] **Ship:** speed 6 feels right; Q/W steps 2…8; blinking after respawn.
- [ ] **Continuous fire:** 6-tick spacing, shot height Y+7.
- [ ] **Enemy paths:** pattern enemies in Level 1 (Ufo, ball, circular saw, Walker)
      follow the same paths; the slime pursues, the faller wobbles and drops.
- [ ] **Collision:** hits at the edges of large sprites (contour instead of box).
- [ ] **Meteors** (tick 980–1500): frequency, flight direction, draw order.
- [ ] **Extras:** sprite rectangles (25×25 per frame in `ss.spr`, *estimated*).
- [ ] **HUD:** score count-up, speed display, position of the texts.

## Deliberately approximated (pure rendering, does not affect the simulation)

- Spark particles: count from the EXE, motion/color/lifetime estimated.
- Screen shake: duration from the EXE (5 ticks), amplitude estimated (±1 px).
- Stars 0–62 in front of the background objects (order *medium*).
- Laser colors, brake bands, wind zones, bubbles (Level 3), boss beams and the
  beam flash of boss 7 as simple areas/strips.

## Status M4 — additionally reconcile

- [ ] **Weapons:** blue laser (colors estimated), green balls split,
      red fan; aiming with D (80 ticks); beam stages and charge sound.
- [ ] **Options/shield:** orbit 40×30, absorbing aimed bullets.
- [ ] **Bosses:** per level, movement, attacks, hit zones (single-row test).
      Level 8: the core can only be hit from the open right side of the shell
      (the suction pulls the ship in) — check whether the original can be
      beaten the same way. Level 7: victory on the 1st defeat (factor <
      1.1) or the 2nd — per the disassembly; the docs had said 2nd/3rd.
- [ ] **Level 3:** the falling ceilings on tile slots 0/8 hit the
      right tiles (slot assignment with a note).
- [ ] **Level 6:** the tile at tick 4785 (off-by-one in the original).
- [ ] **Level 7/8:** brake bands (lifetime estimated), wind zones.
- [ ] **Audio:** volumes and pans, fade-out before the boss.
- [ ] **Color key in 16-bit mode:** if the original ran at 16-bit color depth,
      DirectDraw keyed everything that becomes black in RGB565 (r < 8, g < 4, b < 8),
      not just exact black. The port keys exactly RGB(0,0,0) — compare near-black
      edges on sprites (e.g. the menu graphic in titel.spr).

- [ ] **Flow (menus as HTML):** NEO-ARTS logo as HTML ("presents" animates in like
      in the original), intro from the original; title, options (game rules with
      saving, score factor, unlock hint; key bindings, sound and display of the shell), level select,
      info with readme, farewell, Get Ready, Pause, Continue and
      high score entry as HTML with keyboard, mouse, touch and pad; effects
      (Get Ready, Yes/No) and music as in the original, music fades out before the
      level start.
- [ ] **End credits:** slide timings and the name in first place in the cheer text (story lines as
      HTML subtitles); then the credits (everyone involved, per role) as HTML
      with music `credits`.
- [ ] **Tutorial with custom bindings:** template "WASD + rechte Hand" — the texts
      name the new keys (J, K, L, U/I), with the original HUD in the 8-px font.

## Status M5 — shell, test on real devices

The smoke test covers Chromium headless (cold start, language switch,
offline start with the server stopped). By hand:

- [ ] **Gamepad:** Xbox and PlayStation pad in Chrome and Firefox — launcher,
      settings and menus (up/down, left/right adjustment, A, B),
      DOVE binding, stick dead zone.
- [ ] **Key bindings:** both templates in both games, custom keys
      (record, backspace, ✕ with the mouse), warning on duplicate keys,
      "Apply" disabled without a key; WASD also navigates the menus.
- [ ] **Overall look:** launcher, settings and all screens of both games
      side by side (DOVE gold, DoveZ olive), narrow windows and touch.
- [ ] **Sound with pad only:** browsers usually do not count pad buttons as a
      user gesture; check whether the AudioContext starts without keyboard/click.
- [ ] **Offline:** Firefox and Safari — "Install game data", airplane mode,
      restart of the browser; is `navigator.storage.persist()` granted?
- [ ] **Update:** new build shipped — the old tab keeps playing, after
      closing all tabs the new version applies.
- [ ] **Save games:** export, clear browser data, import — options,
      unlocks and high scores back again.

## Status M6 — check DoveZ assets against the original

- [ ] **`atlantis_saule2`:** mask (200×540) larger than the image (190×520);
      the port takes the top-left crop. Compare the column in the original with the
      port — does the transition sit offset (best offset would be 6 px)?
- [ ] **Smoke in Rumbler (`rauch1–7`):** palettized, index and RGB keying
      diverge; the port keys on RGB black.
- [ ] **Masks not gray** (19 of 83): alpha = mean of the channels,
      *estimated*.
- [ ] **Videos:** VP9 CRF 44 against the DivX original (artifacts on fast
      cuts, audio in sync).
- [ ] **Safari:** Ogg Opus via `decodeAudioData` and Ogg Vorbis streaming.

## Status M8 — reconcile DoveZ against the original

The mechanics are derived statically from `DoveZ.exe` (`docs/measurements/dovez-runtime.md`);
none of it is measured against the running original. What a comparison against the real game
would need to clarify:

- [ ] **Timing:** 16 ms per tick (`Wait(16 + Me.1C8)`); controls and scroll speed feel
      like the original (frames skip under load).
- [ ] **Inertia "Realistic":** coasting after release (×0.85 per tick, from 10
      ticks of key press) — order within the tick and length of the coasting.
- [ ] **Key bindings (shell):** the original's key configuration is replaced by
      the shell's binding (Options → Key bindings); the template
      "Original" assigns set 0/1 like the single-player game and set 2 with the numpad
      and Num 2 — compare against the original whether the two-player game with IJKL
      is missed.
- [ ] **Super-Nova:** all ten variants (duration, timing of the kills, noise),
      kill counter `B48[0].54`.
- [ ] **Bosses:** state machines and finale (state 4), shock wave as a gameplay effect.
- [ ] **Beam and combo:** charge time (0.9 per tick), power phase, combo scoring.
- [ ] **Backgrounds, weather, water, overlays:** procedural effects (particle counts,
      colors, blend modes) against recordings.
- [ ] **Videos and loading screens:** loading screen or mosaic with progress as HTML,
      cutscenes as `<video>`, credits as text (transcribed from the original
      image) at 40 px/s (original 1 px per 25 ms) — check names and order
      against the image.
- [ ] **Menu (HTML):** all pages (New → Player → Ship → Names, Load, Options
      with basic settings, key bindings/sound/display of the shell, vibration,
      bonus, high score), menu music and sounds, Easter egg by typing "lov";
      save screen, Continue (Esc counts faster) and Pause with the radio log and
      the key overview. Volumes: the original's mixing ratio stays fixed,
      the levels come from the shell.
- [ ] **Levels before tick 0** (`-Tick N` with N < 0): the 118 entries with a negative tick.
- [ ] **Vibration:** strength and duration per source (see "Vibration" in
      `dovez-runtime.md`), the browsers' gamepad motors instead of DirectInput forces.
## Status M8 — check DoveZ in Russian (`#/dovez?lang=ru`) against the original

- [ ] **Font:** Cyrillic texts in Arial (original: GDI font with
      character set `[0x5886DC]`) — width of the long lines ("Управление
      режимом/Сменить Части", "Нажмите любую клавишу для старта!") and of the
      panels in the menu against the original.
- [ ] **Main menu:** without the "Highscore" entry; after one playthrough "Бонус" (opens
      the bonus list in the HTML menu, the high score page in the original).
- [ ] **Save screen:** "Уровень расчищен!" without the level name, player line
      without a high score rank, "Сохранено" after saving.
- [ ] **Pause:** "Пауза", below it "Уровень1-1 (Bruce)"; "Продолжить"/"Выйти из
      игры" (shared texts of both games instead of "Выход").
- [ ] **Radio:** subtitles in the ticker, no sound (RU recordings missing);
      [Harbor] in Level 3-1 complete.
- [ ] **Videos:** `introR`/`OutroR`/`Outro2R` missing from the original data — the
      original skipped them; check whether a Russian release ships them.
- [ ] **Date** of the save-game label `DD.MM.YYYY` (assumption).

## Not testable, document only

- Audio equivalence: BASS 0.8 and libopenmpt mix differently.
- Timer resolution: the original ran on coarse system timers at 15.6 ms.
- Randomness: the original seeded `Rnd` from the clock; the port uses the same
  LCG with a fixed seed — same distribution, different sequence.
