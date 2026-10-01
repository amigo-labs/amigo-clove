import { FixedStepLoop } from "@clove/core";
import { setView } from "@clove/pixi-kit";
import type { DoveIntro } from "@clove/formats";
import type { Container } from "pixi.js";
import { DoveAudio } from "../audio/DoveAudio";
import { loadLevel } from "../data/loadLevel";
import { spriteSheet } from "../hud";
import { TICK_MS } from "../sim/constants";
import { continueInNextLevel, restartAtCheckpoint, startLevel } from "../sim/step";
import { World, type SimOptions } from "../sim/world";
import {
  type HighscoreEntry,
  cleanName,
  defaultHighscores,
  insertHighscore,
  parseHighscores,
  rankFor,
  serializeHighscores,
} from "./highscore";
import {
  type Config,
  EXTRA_LEVEL,
  FINAL_LEVEL,
  TUTORIAL_LEVEL,
  hasLevelSelect,
  parseConfig,
  serializeConfig,
  simOptionsFor,
  unlockAfter,
} from "./rules";
import {
  MenuItem,
  type SpriteOf,
  configFrom,
  continueConfirm,
  creditsText,
  farewellNotice,
  getReadyNotice,
  highscoreInput,
  infoText,
  levelSelectMenu,
  logo,
  optionsForm,
  optionsMenu,
  titleMenu,
} from "./menus";
import { type FlowEnv, type Screen, rndFloat } from "./screen";
import { GameScreen, type TickRecorder } from "./screens/GameScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { NeoArtsScreen } from "./screens/NeoArtsScreen";
import { OutroScreen } from "./screens/OutroScreen";

const CONFIG_KEY = "config";
const HIGHSCORE_KEY = "highscores";

/** Direktstart eines Levels per URL (`#/dove?level=1&from=2100&invincible=1`). */
export interface DebugStart {
  readonly level: number;
  /** Start ab Tick wie von einem Checkpoint. */
  readonly from: number;
  /** Ausrüstung: colour, stage, options, bomb, shield. */
  readonly setup: (w: World) => void;
}

export interface FlowOptions {
  readonly seed: number;
  readonly invincible: boolean;
  /** `-nointro`: NEO-ARTS-Logo und Story-Intro überspringen. */
  readonly nointro: boolean;
  /** Überschreibt Optionen der Konfiguration (URL `shots`, `walls`). */
  readonly override: Partial<Pick<SimOptions, "enemyShots" | "wallsKill">>;
  readonly debug: DebugStart | undefined;
  /**
   * Debug: einen Bildschirm direkt zeigen (`screen=` intro, getready, continue,
   * highscore, outro, options, levelselect, info, farewell), danach Titel.
   */
  readonly screen: string | undefined;
  /** Replay-Mitschnitt: Beginn eines neuen Spiels und jeder Tick. */
  readonly onGameStart: (level: number, seed: number) => void;
  readonly record: TickRecorder;
}

/**
 * Der Programmablauf als Zustandsmaschine: genau ein Bildschirm ist aktiv und
 * tickt im 14-ms-Takt; die Übergänge stehen als `async`-Ablauf wie die
 * verschachtelten Schleifen des Originals (Titel → Spiel → Continue → Highscore …).
 */
export class Flow {
  private readonly loop = new FixedStepLoop(TICK_MS);
  private current: Screen<unknown> | undefined;
  private resolveCurrent: ((r: unknown) => void) | undefined;
  private disposed = false;
  /** Alle erzeugten, noch nicht freigegebenen Bildschirme (auch der pausierte Spielbildschirm). */
  private readonly live = new Set<Screen<unknown>>();
  private config: Config;
  private highscores: HighscoreEntry[];
  private readonly sprite: SpriteOf;

  constructor(
    private readonly env: FlowEnv,
    private readonly stage: Container,
    private readonly opts: FlowOptions,
  ) {
    const storage = env.host.storage;
    this.config = parseConfig(storage.get(CONFIG_KEY));
    this.highscores = parseHighscores(storage.get(HIGHSCORE_KEY)) ?? defaultHighscores(env.rnd);
    this.sprite = (id, r) => spriteSheet(env.host.assets, id)(r);
    // die Marke im Kopf aller Seiten, wie in DoveZ
    env.host.ui.brand?.({ name: "DOVE", logo: logo(this.sprite) });
  }

  /** Einmal pro Anzeigebild: fällige Ticks des aktiven Bildschirms, dann zeichnen. */
  frame(): void {
    const now = this.env.host.now();
    const screen = this.current;
    if (!screen) {
      this.loop.reset(now);
      return;
    }
    const ticks = this.loop.frame(now);
    for (let i = 0; i < ticks; i++) {
      this.env.keys.sample();
      const r = screen.update();
      if (r !== undefined) {
        this.finish(r);
        return;
      }
    }
    screen.render();
    setView(this.env.host.canvas, screen.viewHeight?.() ?? null);
  }

  /** Die Welt des laufenden Levels (auch in der Pause), sonst `undefined`. */
  get playing(): World | undefined {
    return this.current instanceof GameScreen ? this.current.world : undefined;
  }

  private finish(result: unknown): void {
    const screen = this.current;
    const resolve = this.resolveCurrent;
    this.current = undefined;
    this.resolveCurrent = undefined;
    if (screen) this.stage.removeChild(screen.root);
    resolve?.(result);
  }

  /** Zeigt einen Bildschirm, bis er ein Ergebnis liefert (ohne ihn freizugeben). */
  private async show<R>(screen: Screen<R>): Promise<R> {
    this.live.add(screen as Screen<unknown>);
    await this.env.textures.load(screen.images);
    if (this.disposed) return new Promise<R>(() => {});
    this.stage.addChild(screen.root);
    this.current = screen as Screen<unknown>;
    this.loop.reset(this.env.host.now());
    screen.render();
    return new Promise<R>((resolve) => {
      this.resolveCurrent = resolve as (r: unknown) => void;
    });
  }

  /** Zeigt einen Bildschirm und gibt ihn danach frei. */
  private async run<R>(screen: Screen<R>): Promise<R> {
    try {
      return await this.show(screen);
    } finally {
      this.release(screen);
    }
  }

  /** Bildschirm verwalten, der über mehrere `show()` lebt (Spiel während Continue). */
  private own<S extends Screen<unknown>>(screen: S): S {
    this.live.add(screen);
    return screen;
  }

  private release(screen: Screen<unknown>): void {
    if (this.live.delete(screen)) screen.dispose();
  }

  /** Readme-Zeilen je Sprache für den Info-Bildschirm (fehlt sie, nur der Kopf). */
  private async readme(): Promise<string[]> {
    const id = this.env.german ? "data/liesmich" : "data/readme";
    if (!this.env.host.assets.has(id)) return [];
    const { text } = await this.env.host.assets.json<{ text: string }>(id);
    return text.replace(/\t/g, "    ").split("\n");
  }

  private music(id: string): void {
    void this.env.audio?.playMusic(id);
  }

  private saveConfig(): void {
    this.env.host.storage.set(CONFIG_KEY, serializeConfig(this.config));
  }

  /** Hauptablauf ab dem Start (`Form_Load` → `ShowNEOARTS` → Titel). */
  async main(): Promise<void> {
    const env = this.env;
    if (this.opts.screen) {
      await this.showcase(this.opts.screen);
    } else if (this.opts.debug) {
      await this.playGame(this.opts.debug.level, this.opts.debug);
    } else if (!this.opts.nointro) {
      await this.run(new NeoArtsScreen(env));
    }
    let item: MenuItem = MenuItem.Play;
    const ui = env.host.ui;
    for (;;) {
      this.music("music/titel");
      const r = await ui.show(titleMenu(this.sprite, this.highscores, item));
      if (this.disposed) return;
      if (r.id === "escape" || r.id === String(MenuItem.Quit)) {
        await ui.show(farewellNotice(env.german));
        env.host.exit();
        return;
      }
      item = Number(r.id) as MenuItem;
      switch (item) {
        case MenuItem.Play: {
          let level = 1;
          if (hasLevelSelect(this.config)) {
            const sel = await ui.show(levelSelectMenu(this.sprite, this.config, env.german));
            if (sel.id === "back" || sel.id === "aborted") break;
            level = Number(sel.id);
          }
          await this.playGame(level);
          break;
        }
        case MenuItem.Extra:
          await this.playGame(EXTRA_LEVEL);
          break;
        case MenuItem.Tutorial:
          await this.playGame(TUTORIAL_LEVEL);
          break;
        case MenuItem.Info:
          await ui.show(infoText(await this.readme(), env.german));
          break;
        case MenuItem.Options:
          await this.optionsMenu(true);
          break;
        default:
          break;
      }
    }
  }

  /** Optionen: Spielregeln oder eine gemeinsame Seite der Shell, bis Zurück. */
  private async optionsMenu(persist: boolean): Promise<void> {
    const ui = this.env.host.ui;
    let selected = "rules";
    for (;;) {
      const r = await ui.show({
        ...optionsMenu(this.env.german, ui.settings !== undefined),
        selected,
      });
      if (this.disposed) return;
      selected = r.id;
      if (r.id === "rules") await this.options(persist);
      else if (r.id === "keys" || r.id === "audio" || r.id === "display") await ui.settings?.(r.id);
      else return;
    }
  }

  /**
   * Spielregeln: „Speichern“ schreibt die Konfiguration und zeigt „gespeichert“,
   * „Zurück“ übernimmt die Werte nur für diese Sitzung (wie das Original).
   */
  private async options(persist: boolean): Promise<void> {
    let saved = false;
    for (;;) {
      const r = await this.env.host.ui.show(optionsForm(this.config, this.env.german, saved));
      if (r.values) this.config = configFrom(this.config, r.values);
      if (r.id !== "save") return;
      if (persist) this.saveConfig();
      saved = true;
    }
  }

  /** Debug-Einstieg `screen=…` für Sichtprüfungen einzelner Bildschirme. */
  private async showcase(name: string): Promise<void> {
    const env = this.env;
    const ui = env.host.ui;
    switch (name) {
      case "intro":
        this.music("music/intro");
        await this.run(new IntroScreen(env, await env.host.assets.json<DoveIntro>("data/intro")));
        break;
      case "getready":
        this.music(this.levelMusic(1));
        await ui.show(getReadyNotice(this.sprite, 1, 0, 2, env.german));
        break;
      case "continue":
        this.music("music/gameover");
        await this.continueGame(42000);
        break;
      case "highscore":
        await this.enterHighscore(this.highscores[0]!.score + 1);
        break;
      case "outro":
        await this.outro();
        break;
      case "credits":
        await this.credits();
        break;
      case "options":
        await this.optionsMenu(false);
        break;
      case "levelselect":
        await ui.show(
          levelSelectMenu(this.sprite, { ...this.config, unlocked: [2, 3] }, env.german),
        );
        break;
      case "info":
        await ui.show(infoText(await this.readme(), env.german));
        break;
      case "farewell":
        await ui.show(farewellNotice(env.german));
        break;
      default:
        break;
    }
  }

  /** Abspann (`ShowOutro`): Story im Original, danach die Credits als HTML. */
  private async outro(): Promise<void> {
    await this.run(new OutroScreen(this.env, this.highscores[0]?.name ?? ""));
    await this.credits();
  }

  /** Credits mit allen Beteiligten, Musik `credits`. */
  private async credits(): Promise<void> {
    this.music("music/credits");
    await this.env.host.ui.show(creditsText(this.sprite, this.env.german));
  }

  /** Continue-Abfrage; `true` = weiterspielen. Sounds wie `ContinueScreen` (`0x4A0050`). */
  private async continueGame(score: number): Promise<boolean> {
    const { audio, rnd, german } = this.env;
    const r = await this.env.host.ui.show(
      continueConfirm(this.sprite, score, rankFor(this.highscores, score), german),
    );
    const yes = r.id === "yes";
    if (yes) audio?.effect(rndFloat(rnd) < 0.5 ? "yesjo" : "yesjo2", 50);
    else audio?.effect(rndFloat(rnd) < 0.5 ? "fertig" : "fertig2");
    return yes;
  }

  private simOptions(): SimOptions {
    const o = this.opts.override;
    const config = { ...this.config, ...o };
    return simOptionsFor(config, this.opts.invincible);
  }

  private levelMusic(level: number): string {
    return DoveAudio.levelMusic(level, this.opts.seed);
  }

  /**
   * `Spiel` (`0x46DE60`): Intro vor Level 1, Get Ready, Hauptschleife,
   * Levelwechsel, Continue, Highscore und nach Level 10 der Abspann.
   */
  private async playGame(first: number, debug?: DebugStart): Promise<void> {
    const env = this.env;
    const sim = this.simOptions();
    if (first === 1 && !debug && !this.opts.nointro) {
      const intro = await env.host.assets.json<DoveIntro>("data/intro");
      this.music("music/intro");
      await this.run(new IntroScreen(env, intro));
    }
    let world = new World(await loadLevel(env.host.assets, first), sim, this.opts.seed);
    startLevel(world);
    if (debug) {
      debug.setup(world);
      if (debug.from > 0) {
        world.checkpoint = debug.from;
        restartAtCheckpoint(world);
      }
    }
    this.opts.onGameStart(first, this.opts.seed);
    // `Spiel` blendet vor dem Levelstart die laufende Musik aus (Titel, Intro).
    await this.env.audio?.fadeOutMusic();
    this.music(this.levelMusic(first));
    if (!debug && (await this.getReady(world)) === "abort") {
      await this.enterHighscore(world.score);
      return;
    }
    let game = this.own(new GameScreen(env, world, this.opts.record));
    try {
      for (;;) {
        const r = await this.show(game);
        const level = world.level.number;
        if (r.kind === "complete") {
          const unlocked = unlockAfter(this.config, level, sim.scoreFactor, sim.invincible);
          if (unlocked) {
            this.config = unlocked;
            this.saveConfig();
          }
          if (level === TUTORIAL_LEVEL) return;
          if (level >= FINAL_LEVEL) {
            await this.enterHighscore(world.score);
            if (level === FINAL_LEVEL) await this.outro();
            return;
          }
          const next = await loadLevel(env.host.assets, level + 1);
          world = continueInNextLevel(world, next);
          this.release(game);
          game = this.own(new GameScreen(env, world, this.opts.record));
          this.music(this.levelMusic(level + 1));
          if ((await this.getReady(world)) === "abort") {
            await this.enterHighscore(world.score);
            return;
          }
        } else if (r.kind === "abort") {
          await this.enterHighscore(world.score);
          return;
        } else {
          this.music("music/gameover");
          if (!(await this.continueGame(r.score))) {
            await this.enterHighscore(r.score);
            return;
          }
          // YES: Checkpoint, Leben 2, Punkte 0 — die Simulation hat bereits zurückgesetzt.
          this.music(this.levelMusic(level));
        }
      }
    } finally {
      this.release(game);
    }
  }

  /** Get Ready vor jedem Level (`effect getready` wie im Original); ESC bricht ab. */
  private async getReady(world: World): Promise<"start" | "abort"> {
    const { audio, german } = this.env;
    audio?.effect("getready");
    const n = world.level.number;
    const r = await this.env.host.ui.show(
      getReadyNotice(this.sprite, n, world.score, world.lives, german),
    );
    return r.id === "back" ? "abort" : "start";
  }

  /** `HighScore`: nur wenn die Punkte in die Liste kommen; Name eingeben, speichern. */
  private async enterHighscore(score: number): Promise<void> {
    const rank = rankFor(this.highscores, score);
    if (rank === 0) return;
    this.music("music/highscore");
    const r = await this.env.host.ui.show(highscoreInput(rank, this.env.german));
    const name = cleanName(String(r.values?.["name"] ?? ""));
    this.highscores = insertHighscore(this.highscores, rank, name, score);
    this.env.host.storage.set(HIGHSCORE_KEY, serializeHighscores(this.highscores));
  }

  dispose(): void {
    this.disposed = true;
    this.current = undefined;
    this.resolveCurrent = undefined;
    for (const screen of this.live) {
      this.stage.removeChild(screen.root);
      screen.dispose();
    }
    this.live.clear();
  }
}
