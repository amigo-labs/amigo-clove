import { FixedStepLoop } from "@clove/core";
import type { DoveIntro } from "@clove/formats";
import type { Container } from "pixi.js";
import { DoveAudio } from "../audio/DoveAudio";
import { loadLevel } from "../data/loadLevel";
import { TICK_MS } from "../sim/constants";
import { continueInNextLevel, restartAtCheckpoint, startLevel } from "../sim/step";
import { World, type SimOptions } from "../sim/world";
import {
  type HighscoreEntry,
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
import type { FlowEnv, Screen } from "./screen";
import { ContinueScreen } from "./screens/ContinueScreen";
import { GameScreen, type TickRecorder } from "./screens/GameScreen";
import { GetReadyScreen } from "./screens/GetReadyScreen";
import { HighscoreScreen } from "./screens/HighscoreScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { OutroScreen } from "./screens/OutroScreen";
import {
  FarewellScreen,
  InfoScreen,
  LevelSelectScreen,
  NeoArtsScreen,
  OptionsScreen,
} from "./screens/simple";
import { MenuItem, type TitleResult, TitleScreen } from "./screens/TitleScreen";
import { TitleStars } from "./stars";

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
  private readonly stars: TitleStars;

  constructor(
    private readonly env: FlowEnv,
    private readonly stage: Container,
    private readonly opts: FlowOptions,
  ) {
    const storage = env.host.storage;
    this.config = parseConfig(storage.get(CONFIG_KEY));
    this.highscores = parseHighscores(storage.get(HIGHSCORE_KEY)) ?? defaultHighscores(env.rnd);
    this.stars = new TitleStars(env.rnd);
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
    for (;;) {
      this.music("music/titel");
      const r: TitleResult = await this.run(
        new TitleScreen(env, this.stars, this.highscores, item),
      );
      if (r === "escape" || r === MenuItem.Quit) {
        await this.run(new FarewellScreen(env));
        env.host.exit();
        return;
      }
      item = r;
      switch (r) {
        case MenuItem.Play: {
          let level = 1;
          if (hasLevelSelect(this.config)) {
            const sel = await this.run(new LevelSelectScreen(env, this.config, 1));
            if (sel.level === undefined) break;
            level = sel.level;
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
          await this.run(new InfoScreen(env));
          break;
        case MenuItem.Options: {
          const o = await this.run(
            new OptionsScreen(env, this.config, (c) => {
              this.config = c;
              this.saveConfig();
            }),
          );
          this.config = o.config;
          break;
        }
        default:
          break;
      }
    }
  }

  /** Debug-Einstieg `screen=…` für Sichtprüfungen einzelner Bildschirme. */
  private async showcase(name: string): Promise<void> {
    const env = this.env;
    switch (name) {
      case "intro":
        this.music("music/intro");
        await this.run(new IntroScreen(env, await env.host.assets.json<DoveIntro>("data/intro")));
        break;
      case "getready":
        this.music(this.levelMusic(1));
        await this.run(new GetReadyScreen(env, 1, 0, 2));
        break;
      case "continue":
        this.music("music/gameover");
        await this.run(new ContinueScreen(env, 42000, rankFor(this.highscores, 42000)));
        break;
      case "highscore":
        await this.enterHighscore(this.highscores[0]!.score + 1);
        break;
      case "outro":
        await this.run(new OutroScreen(env, this.highscores[0]?.name ?? ""));
        break;
      case "options":
        this.config = (await this.run(new OptionsScreen(env, this.config, () => {}))).config;
        break;
      case "levelselect":
        await this.run(new LevelSelectScreen(env, { ...this.config, unlocked: [2, 3] }, 1));
        break;
      case "info":
        await this.run(new InfoScreen(env));
        break;
      case "farewell":
        await this.run(new FarewellScreen(env));
        break;
      default:
        break;
    }
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
            if (level === FINAL_LEVEL) {
              await this.run(new OutroScreen(env, this.highscores[0]?.name ?? ""));
            }
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
          const yes = await this.run(
            new ContinueScreen(env, r.score, rankFor(this.highscores, r.score)),
          );
          if (!yes) {
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

  private getReady(world: World): Promise<"start" | "abort"> {
    const n = world.level.number;
    return this.run(new GetReadyScreen(this.env, n, world.score, world.lives));
  }

  /** `HighScore`: nur wenn die Punkte in die Liste kommen; Name eingeben, speichern. */
  private async enterHighscore(score: number): Promise<void> {
    const rank = rankFor(this.highscores, score);
    if (rank === 0) return;
    this.music("music/highscore");
    const name = await this.run(new HighscoreScreen(this.env, rank));
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
