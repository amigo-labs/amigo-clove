import { FixedStepLoop, type AtlasJson, type GameHost } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { type Application, Graphics, Sprite } from "pixi.js";
import { DovezAudio } from "../audio/DovezAudio";
import { loadLevelPack } from "../data/LevelPack";
import { Renderer } from "../render/Renderer";
import { NO_INPUT } from "../sim/player";
import type { SpriteSource } from "../sim/surfaces";
import { f32, type VbRnd } from "../sim/vb";
import { type Carry, TICK_MS, World } from "../sim/world";
import {
  CONTINUE_MS,
  ContinueLogic,
  applyContinue,
  continueRanks,
  rankTexts,
} from "./continueScreen";
import { ContinueView } from "./continueView";
import { GdiText, atlasTexture } from "./gdi";
import { addHighscore } from "./highscore";
import { keyLabel, readInput, screenKeys } from "./input";
import type { Lang } from "./lang";
import { type DovezConfig, audioGains } from "./config";
import type { Mosaic } from "./mosaic";
import { PAUSE_MS, PauseLogic, pauseMenu, pauseTitle, wrapRadioLog } from "./pauseScreen";
import { PauseView } from "./pauseView";
import type { Profile } from "./profile";
import type { Scene } from "./scene";
import type { ScreenTargets } from "./screenTargets";

/** Was alle Abschnitte eines Spiels teilen (einmal je `bootGame`). */
export interface GameContext {
  readonly host: GameHost;
  readonly app: Application;
  readonly textures: TextureRegistry;
  /** Atlanten `spiel`, `standart`, `pause`. */
  readonly globals: readonly [AtlasJson, AtlasJson, AtlasJson];
  readonly targets: ScreenTargets;
  /** Spielsprache (`Me.588070`). */
  readonly lang: Lang;
  readonly profile: Profile;
  readonly mosaic: Mosaic;
  readonly players: 1 | 2;
  readonly ship: 0 | 1;
  /** Optionen aus dem Menü (Pegel, Force-Taste, Auto-Arrange). */
  readonly config: DovezConfig;
}

export interface LevelOptions {
  readonly slug: string;
  /** Levelname wie im Original (`Level1-1 Skyfight`, Pause und Speicherbildschirm). */
  readonly name: string;
  readonly from: number;
  readonly invincible: boolean;
  readonly carry?: Carry | undefined;
  readonly rnd?: VbRnd | undefined;
  /** Sichtprüfung: Bildschirm gleich nach dem ersten Bild zeigen (Highscore nicht gespeichert). */
  readonly screen?: "continue" | "pause" | undefined;
}

type Mode =
  | { readonly kind: "play" }
  | {
      readonly kind: "pause";
      readonly logic: PauseLogic;
      readonly view: PauseView;
      readonly loop: FixedStepLoop;
    }
  | {
      readonly kind: "continue";
      readonly logic: ContinueLogic;
      readonly view: ContinueView;
      readonly loop: FixedStepLoop;
    };

/** Bundles eines Levels (Ladefortschritt). */
export const levelBundles = (slug: string): string[] => [`level/${slug}`, `voice/${slug}`];

/**
 * Ein Level spielen (`SpielLoop` `0x53D170`): Welt im 16-ms-Takt, Zeichnen,
 * Ton und Funk; Esc oder Fokusverlust öffnet die Pause, ohne Leben folgt der
 * Continue-Bildschirm. Ergebnis `done` (Level geschafft, `Me.580 = 2`) oder
 * `exit` (Game Over, Pause „EXIT“: `mode = 9` → Hauptmenü).
 */
export class LevelScene implements Scene {
  result: "done" | "exit" | undefined;
  private readonly loop = new FixedStepLoop(TICK_MS);
  private mode: Mode = { kind: "play" };
  private showcase: "continue" | "pause" | undefined;
  /** `Me.518` nach der Pause: α des letzten Pausebilds, −0,05 je Tick (`OverlayEffekte`). */
  private afterPauseAlpha = 0;
  private windowFocus = true;
  private readonly win: Window | null;
  private readonly onBlur = () => (this.windowFocus = false);
  private readonly onFocus = () => (this.windowFocus = true);
  private readonly afterPause: Sprite;
  private readonly screenSprite: Sprite;
  private readonly darken = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
  private readonly logFont = new GdiText(18, 0);
  private readonly kreis;
  private readonly balken;
  private readonly pauseImage;
  private readonly pages: string[];

  private constructor(
    private readonly ctx: GameContext,
    private readonly opts: LevelOptions,
    readonly world: World,
    readonly renderer: Renderer,
    readonly audio: DovezAudio | undefined,
    private readonly music: string,
    pages: readonly string[],
  ) {
    const { targets, textures, globals } = ctx;
    this.pages = [...pages];
    this.showcase = opts.screen;
    const [, standart, pauseAtlas] = globals;
    this.kreis = atlasTexture(textures, standart, "a_kreis2");
    this.balken = atlasTexture(textures, standart, "balken");
    this.pauseImage = atlasTexture(textures, pauseAtlas, "pausescreen");
    this.afterPause = new Sprite(targets.afterPause);
    this.screenSprite = new Sprite(targets.back);
    this.afterPause.visible = false;
    this.screenSprite.visible = false;
    this.darken.alpha = 0.3;
    // Fokus (`GetFocus() = hWnd`): Fokusverlust öffnet die Pause, ohne Fokus zählen keine Tasten
    this.win = ctx.host.canvas.ownerDocument.defaultView;
    this.win?.addEventListener("blur", this.onBlur);
    this.win?.addEventListener("focus", this.onFocus);
  }

  /** Erst mit dem ersten eigenen Bild auf die Bühne (vorher steht noch das Ladebild). */
  private attached = false;
  private attach(): void {
    this.attached = true;
    this.ctx.app.stage.addChild(this.renderer.root, this.afterPause, this.screenSprite);
    this.audio?.playMusic(this.music);
    this.loop.reset(this.ctx.host.now());
  }

  static async create(ctx: GameContext, opts: LevelOptions): Promise<LevelScene> {
    const { host, textures, globals, lang } = ctx;
    const pack = await loadLevelPack(host.assets, opts.slug);
    const atlases = [{ json: pack.atlas }, ...globals.map((json) => ({ json }))];
    const own = Renderer.pageIds([{ json: pack.atlas }]);
    await textures.load(Renderer.pageIds(atlases));
    const sprites: SpriteSource = {
      size: (key) => pack.atlas.sprites[key],
      contour: (key) => {
        const o = pack.atlas.contours[key];
        if (o === undefined) return undefined;
        const h = pack.contours[o + 1] as number;
        return pack.contours.subarray(o, o + 4 + h * 2);
      },
    };
    const radioTexts = pack.radio?.[lang];
    const world = new World(pack.level, sprites, {
      startTick: opts.from,
      ship: ctx.ship,
      players: ctx.players,
      ...(radioTexts ? { radioTexts } : {}),
      ...(opts.carry ? { carry: opts.carry } : {}),
      ...(opts.rnd ? { rnd: opts.rnd } : {}),
    });
    const audio = host.audio
      ? await DovezAudio.create(host.audio, host.assets, pack.slug, audioGains(ctx.config)).catch(
          () => undefined,
        )
      : undefined;
    // `Me.512` (normal) und `Me.50E` aus den Grundeinstellungen
    world.qToggles = !ctx.config.qNormal;
    world.autoArrange = ctx.config.autoArrange;
    world.realistic = ctx.config.realistic;
    const renderer = new Renderer(textures, world, atlases, ctx.app.renderer, { lang, keyLabel });
    // Seiten, die nur dieses Level braucht (die globalen bleiben geladen)
    const shared = new Set(Renderer.pageIds(globals.map((json) => ({ json }))));
    const pages = own.filter((id) => !shared.has(id));
    return new LevelScene(ctx, opts, world, renderer, audio, pack.level.music, pages);
  }

  private focused(): boolean {
    return this.windowFocus && !this.ctx.host.canvas.ownerDocument.hidden;
  }

  private keys() {
    const { host, players } = this.ctx;
    return screenKeys(
      host,
      players === 2 ? 1 : 0,
      this.world.players[0]?.exitState ?? 0,
      this.focused(),
    );
  }

  /** Letztes Spielbild nach `shot` (Continue: mit 30 % Schwarz überdeckt). */
  private captureShot(dark: boolean): void {
    const { app, targets } = this.ctx;
    this.screenSprite.visible = false;
    targets.draw(app.stage, targets.shot, true);
    if (dark) targets.draw(this.darken, targets.shot);
  }

  private showScreen(on: boolean): void {
    this.screenSprite.visible = on;
    this.renderer.root.visible = !on;
    if (on) this.afterPause.visible = false;
  }

  private enterPause(): void {
    const { ctx, world } = this;
    this.audio?.pause();
    this.captureShot(false);
    // NewPictureToLoadingscreen beim Öffnen der Pause
    ctx.mosaic.add(ctx.app.renderer, ctx.targets.shot);
    const log = wrapRadioLog(world.radio.log, (s) => this.logFont.width(s));
    const view = new PauseView(ctx.targets, this.balken, this.pauseImage, {
      menu: pauseMenu(ctx.lang),
      title: pauseTitle(this.opts.name, ctx.profile.names, ctx.lang),
      log,
    });
    const logic = new PauseLogic(world.rnd);
    this.mode = { kind: "pause", logic, view, loop: new FixedStepLoop(PAUSE_MS) };
  }

  private leavePause(view: PauseView, exit: boolean, restore: boolean): void {
    const { ctx } = this;
    ctx.targets.keepAfterPause();
    view.destroy();
    this.showScreen(false);
    this.mode = { kind: "play" };
    if (exit) {
      // „EXIT“: Highscore mit dem aktuellen Stand, dann Hauptmenü
      let list = ctx.profile.highscores;
      ctx.profile.names.forEach((name, p) => {
        list = addHighscore(list, name, this.world.score[p] ?? 0, ctx.profile.ids[p]!).list;
      });
      if (!this.opts.screen) ctx.profile.store(list);
      this.result = "exit";
      return;
    }
    this.audio?.resume(restore);
    this.afterPauseAlpha = 1;
    this.loop.reset(ctx.host.now());
  }

  private enterContinue(): void {
    const { ctx, world } = this;
    this.audio?.stopVoice();
    const { names, ids } = ctx.profile;
    const players = names.map((name, p) => ({ name, score: world.score[p] ?? 0, id: ids[p]! }));
    const r = continueRanks(ctx.profile.highscores, players);
    if (!this.opts.screen) ctx.profile.store(r.list);
    this.captureShot(true);
    const view = new ContinueView(ctx.targets, this.kreis, rankTexts(names, r.ranks, ctx.lang));
    this.audio?.playContinueMusic();
    const logic = new ContinueLogic(world.rnd);
    this.mode = { kind: "continue", logic, view, loop: new FixedStepLoop(CONTINUE_MS) };
  }

  private leaveContinue(view: ContinueView, ok: boolean): void {
    view.destroy();
    this.showScreen(false);
    this.mode = { kind: "play" };
    this.audio?.stopMusic();
    if (!ok) {
      // Game Over → Hauptmenü (der Highscore steht schon)
      this.result = "exit";
      return;
    }
    this.audio?.effect("speech", true);
    if (this.world.state === 1) {
      applyContinue(this.world);
      this.world.respawn();
    }
    this.audio?.playMusic(this.music, true);
    this.loop.reset(this.ctx.host.now());
  }

  /**
   * `n` fällige Durchläufe des laufenden Bildschirms. Die Logik (und ihr
   * `Rnd`) läuft jeden Durchlauf; gezeichnet wird wie beim Bildauslassen des
   * Originals nur der letzte je Anzeigebild.
   */
  private runScreen(n: number): void {
    let pending: (() => void) | undefined;
    const flush = () => {
      pending?.();
      pending = undefined;
    };
    for (let i = 0; i < n; i++) {
      if (this.result) return;
      const m = this.mode;
      if (m.kind === "pause") {
        const pass = m.logic.step(this.keys());
        if (pass)
          pending = () => {
            m.view.draw(pass);
            this.showScreen(true);
          };
        const r = m.logic.result;
        if (r) {
          flush();
          this.leavePause(m.view, r.exit, r.restore);
          return;
        }
      } else if (m.kind === "continue") {
        // Die Schleife endet erst nach dem Durchlauf (und `Wait 40`), in dem `ok` bzw. das Ende fiel
        if (m.logic.result !== undefined) {
          flush();
          this.leaveContinue(m.view, m.logic.result);
          return;
        }
        const pass = m.logic.step(this.keys());
        pending = () => {
          m.view.draw(pass);
          this.showScreen(true);
        };
      } else break;
    }
    flush();
  }

  /** Levelname wie im Original (`[0x5880C4]`). */
  get name(): string {
    return this.opts.name;
  }

  frame(now: number): boolean {
    if (this.result) return true;
    if (!this.attached) this.attach();
    const { ctx, world } = this;
    const { host } = ctx;
    if (this.mode.kind !== "play") {
      this.runScreen(this.mode.loop.frame(now));
      return this.result !== undefined;
    }
    let next: "pause" | "continue" | undefined;
    const n = this.loop.frame(now);
    // Tod: Neustart erst nach dem gezeichneten Todesbild (Standbild für die Überblendung)
    if (world.state === 1) {
      // NewPictureToLoadingscreen: das Todesbild ins Mosaik
      if (n > 0) {
        this.captureShot(false);
        ctx.mosaic.add(ctx.app.renderer, ctx.targets.shot);
      }
      if (!world.respawn()) next = "continue";
    }
    let done = false;
    const running = () => world.state === 0;
    for (let i = 0; i < n && !next && running(); i++) {
      const inputs =
        ctx.players === 2 ? [readInput(host, 1), readInput(host, 2)] : [readInput(host), NO_INPUT];
      if (this.opts.invincible)
        for (const p of world.players) p.invulnerable = Math.max(p.invulnerable, 2);
      world.step(inputs);
      if (this.afterPauseAlpha > 0)
        this.afterPauseAlpha = Math.max(0, f32(this.afterPauseAlpha - 0.05));
      // Tod: Neustart am Checkpoint im nächsten Frame, ohne Leben der Continue-Bildschirm
      if (world.state === 1) break;
      // Level geschafft (`Me.580 = 2`): der Tick läuft zu Ende, die Schleife bricht ab
      if (world.state === 2) done = true;
      // `TastePause` oder Fokusverlust am Ende des Ticks
      else if (host.keys.isDown("Escape") || !this.focused()) next = "pause";
    }
    // Sichtprüfung: nach dem ersten Tick (das Schiff entsteht erst im Tick)
    if (n > 0 && this.showcase) {
      next ??= this.showcase;
      this.showcase = undefined;
    }
    this.audio?.update(world);
    world.events.length = 0;
    this.renderer.draw();
    this.afterPause.visible = this.afterPauseAlpha > 0;
    this.afterPause.alpha = this.afterPauseAlpha;
    if (done) {
      // SpielSoundOFF, `StopOgg`
      this.audio?.stopLevel();
      this.result = "done";
      return true;
    }
    if (!next) return false;
    if (next === "pause") this.enterPause();
    else this.enterContinue();
    this.runScreen(1);
    return this.result !== undefined;
  }

  destroy(): void {
    this.win?.removeEventListener("blur", this.onBlur);
    this.win?.removeEventListener("focus", this.onFocus);
    if (this.mode.kind !== "play") this.mode.view.destroy();
    this.audio?.dispose();
    this.renderer.destroy();
    this.logFont.destroy();
    this.darken.destroy();
    this.afterPause.destroy();
    this.screenSprite.destroy();
    for (const t of [this.kreis, this.balken, this.pauseImage]) t?.destroy(false);
    this.ctx.textures.unload(this.pages);
  }
}
