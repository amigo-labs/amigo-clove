import { FixedStepLoop, type AtlasJson, type GameHost } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import type { Application } from "pixi.js";
import { DovezAudio } from "../audio/DovezAudio";
import { loadLevelPack } from "../data/LevelPack";
import { Renderer } from "../render/Renderer";
import { NO_INPUT } from "../sim/player";
import type { SpriteSource } from "../sim/surfaces";
import type { VbRnd } from "../sim/vb";
import { type Carry, TICK_MS, World } from "../sim/world";
import { dovezControls } from "../controls";
import { applyContinue, runContinue } from "./continueScreen";
import { PointerControl, currentKeys, keyLabel, readInput } from "./input";
import type { Lang } from "./lang";
import { type DovezConfig, audioGains } from "./config";
import type { Mosaic } from "./mosaic";
import { runPause } from "./pauseScreen";
import type { Profile } from "./profile";
import type { Scene } from "./scene";
import type { ScreenTargets } from "./screenTargets";

/** Was alle Abschnitte eines Spiels teilen (einmal je `bootGame`). */
export interface GameContext {
  readonly host: GameHost;
  readonly app: Application;
  readonly textures: TextureRegistry;
  /** Atlanten `spiel` und `standart`. */
  readonly globals: readonly [AtlasJson, AtlasJson];
  readonly targets: ScreenTargets;
  /** Spielsprache (`Me.588070`). */
  readonly lang: Lang;
  readonly profile: Profile;
  readonly mosaic: Mosaic;
  readonly players: 1 | 2;
  readonly ship: 0 | 1 | 2;
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

/** Spiel läuft, oder ein HTML-Bildschirm der Shell steht über dem eingefrorenen Bild. */
type Mode = "play" | "pause" | "continue";

/** Bundles eines Levels (Ladefortschritt). */
export const levelBundles = (slug: string): string[] => [`level/${slug}`, `voice/${slug}`];

/**
 * Ein Level spielen (`SpielLoop` `0x53D170`): Welt im 16-ms-Takt, Zeichnen,
 * Ton und Funk; Esc oder Fokusverlust öffnet die Pause, ohne Leben folgt der
 * Continue-Bildschirm — beide als HTML der Shell über dem eingefrorenen Bild
 * (`over: "level"`), solange steht die Welt. Ergebnis `done` (Level geschafft,
 * `Me.580 = 2`) oder `exit` (Game Over, Pause „EXIT“: `mode = 9` → Hauptmenü).
 */
export class LevelScene implements Scene {
  result: "done" | "exit" | undefined;
  private readonly loop = new FixedStepLoop(TICK_MS);
  private mode: Mode = "play";
  private showcase: "continue" | "pause" | undefined;
  private windowFocus = true;
  private readonly win: Window | null;
  private readonly onBlur = () => (this.windowFocus = false);
  private readonly onFocus = () => (this.windowFocus = true);
  /** Schließt einen offenen HTML-Bildschirm, wenn das Level vorher endet. */
  private readonly screens = new AbortController();
  private readonly pages: string[];
  private readonly pointer = new PointerControl();

  private constructor(
    private readonly ctx: GameContext,
    private readonly opts: LevelOptions,
    readonly world: World,
    readonly renderer: Renderer,
    readonly audio: DovezAudio | undefined,
    private readonly music: string,
    pages: readonly string[],
  ) {
    this.pages = [...pages];
    this.showcase = opts.screen;
    // Fokus (`GetFocus() = hWnd`): Fokusverlust öffnet die Pause, ohne Fokus zählen keine Tasten
    this.win = ctx.host.canvas.ownerDocument.defaultView;
    this.win?.addEventListener("blur", this.onBlur);
    this.win?.addEventListener("focus", this.onFocus);
  }

  /** Erst mit dem ersten eigenen Bild auf die Bühne (vorher steht noch das Ladebild). */
  private attached = false;
  private attach(): void {
    this.attached = true;
    this.ctx.app.stage.addChild(this.renderer.root);
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
    // Vibration: Spieler p steuert das p-te Gamepad mit Motor (`Me.588270`), Einstellung je Pad
    const pads = () => ctx.host.rumblePads?.() ?? 0;
    world.padOfPlayer = (p) => (p < pads() ? p + 1 : 0);
    world.rumbleOn = [ctx.config.vibration[0], ctx.config.vibration[1]];
    world.rumbleBase = [ctx.config.vibrationStrength[0], ctx.config.vibrationStrength[1]];
    const renderer = new Renderer(textures, world, atlases, ctx.app.renderer, {
      lang,
      keyLabel,
      calm: () => host.reducedMotion === true,
      modernHud: () => host.hudMode?.() === "modern",
    });
    // Seiten, die nur dieses Level braucht (die globalen bleiben geladen)
    const shared = new Set(Renderer.pageIds(globals.map((json) => ({ json }))));
    const pages = own.filter((id) => !shared.has(id));
    return new LevelScene(ctx, opts, world, renderer, audio, pack.level.music, pages);
  }

  private focused(): boolean {
    return this.windowFocus && !this.ctx.host.canvas.ownerDocument.hidden;
  }

  /** `NewPictureToLoadingscreen`: das letzte Spielbild ins Mosaik. */
  private snapshot(): void {
    const { app, targets, mosaic } = this.ctx;
    targets.draw(app.stage, targets.shot, true);
    mosaic.add(app.renderer, targets.shot);
  }

  /** Vibration je Tick erneuern (der Motorimpuls des Hosts ist kurz), Ende einmal melden. */
  private readonly rumbleSent: [number, number] = [0, 0];
  private rumble(stop = false): void {
    const out = this.ctx.host.rumble;
    if (!out) return;
    for (let j = 0; j < 2; j++) {
      const m = stop ? 0 : (this.world.rumble.magnitude[j] ?? 0);
      if (m > 0 || this.rumbleSent[j] !== 0) out(j, m / 10000);
      this.rumbleSent[j] = m;
    }
  }

  private get persist(): boolean {
    return !this.opts.screen;
  }

  /** `Pause`: Ton anhalten, Momentaufnahme, dann das Pausemenü der Shell. */
  private enterPause(): void {
    const { ctx, world } = this;
    this.rumble(true);
    this.audio?.pause();
    this.snapshot();
    this.mode = "pause";
    void runPause(ctx.host.ui, {
      lang: ctx.lang,
      level: this.opts.name,
      profile: ctx.profile,
      score: world.score,
      log: world.radio.log,
      controls: dovezControls(ctx.players, currentKeys()),
      persist: this.persist,
      signal: this.screens.signal,
    }).then((r) => this.leavePause(r === "exit"));
  }

  private leavePause(exit: boolean): void {
    if (this.screens.signal.aborted) return;
    this.mode = "play";
    if (exit) {
      // „EXIT“: der Highscore steht schon, dann Hauptmenü
      this.result = "exit";
      return;
    }
    this.audio?.resume(true);
    this.loop.reset(this.ctx.host.now());
  }

  /** `Continue`: Highscore eintragen, `Continue.ogg`, die Abfrage der Shell. */
  private enterContinue(): void {
    const { ctx, world } = this;
    this.audio?.stopVoice();
    this.audio?.playContinueMusic();
    this.mode = "continue";
    void runContinue(ctx.host.ui, {
      lang: ctx.lang,
      profile: ctx.profile,
      score: world.score,
      persist: this.persist,
      signal: this.screens.signal,
    }).then((ok) => this.leaveContinue(ok));
  }

  private leaveContinue(ok: boolean): void {
    if (this.screens.signal.aborted) return;
    this.mode = "play";
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

  /** Das Spielfeld läuft (keine Pause, kein Continue, nicht fertig). */
  get playing(): boolean {
    return this.mode === "play" && this.result === undefined;
  }

  /** Mit dem HTML-HUD zeigt das Level nur das Spielfeld (800 × 550), auch eingefroren unter Pause und Continue. */
  get fieldOnly(): boolean {
    return this.result === undefined && this.ctx.host.hudMode?.() === "modern";
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
    // Pause und Continue: die Welt steht, bis die Shell antwortet
    if (this.mode !== "play") return this.result !== undefined;
    let next: "pause" | "continue" | undefined;
    const n = this.loop.frame(now);
    // Tod: Neustart erst nach dem gezeichneten Todesbild (Standbild für die Überblendung)
    if (world.state === 1) {
      // NewPictureToLoadingscreen: das Todesbild ins Mosaik
      if (n > 0) this.snapshot();
      if (!world.respawn()) next = "continue";
    }
    let done = false;
    const running = () => world.state === 0;
    for (let i = 0; i < n && !next && running(); i++) {
      const inputs =
        ctx.players === 2 ? [readInput(host, 1), readInput(host, 2)] : [readInput(host), NO_INPUT];
      const p1 = world.players[0];
      inputs[0] = this.pointer.apply(host, inputs[0]!, p1?.alive ? p1 : undefined);
      if (this.opts.invincible)
        for (const p of world.players) p.invulnerable = Math.max(p.invulnerable, 2);
      world.step(inputs);
      this.rumble();
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
    if (done) {
      // SpielSoundOFF, `StopOgg`
      this.audio?.stopLevel();
      this.result = "done";
      return true;
    }
    if (!next) return false;
    if (next === "pause") this.enterPause();
    else this.enterContinue();
    return false;
  }

  destroy(): void {
    this.screens.abort();
    this.rumble(true);
    this.win?.removeEventListener("blur", this.onBlur);
    this.win?.removeEventListener("focus", this.onFocus);
    this.audio?.dispose();
    this.renderer.destroy();
    this.ctx.textures.unload(this.pages);
  }
}
