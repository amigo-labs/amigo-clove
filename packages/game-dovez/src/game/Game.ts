import { FixedStepLoop, type AtlasJson, type GameHost, type GameInstance } from "@clove/core";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import { Graphics, Sprite } from "pixi.js";
import { DovezAudio } from "../audio/DovezAudio";
import { loadLevelPack } from "../data/LevelPack";
import { Renderer } from "../render/Renderer";
import { NO_INPUT, type PlayerInput } from "../sim/player";
import type { SpriteSource } from "../sim/surfaces";
import { f32 } from "../sim/vb";
import { TICK_MS, World } from "../sim/world";
import {
  CONTINUE_MS,
  ContinueLogic,
  applyContinue,
  continueRanks,
  rankTexts,
} from "./continueScreen";
import { ContinueView } from "./continueView";
import { GdiText, atlasTexture } from "./gdi";
import {
  DEFAULT_NAME,
  HIGHSCORE_KEY,
  type HighscoreEntry,
  addHighscore,
  newGameId,
  parseHighscores,
  serializeHighscores,
} from "./highscore";
import { PAUSE_MS, PauseLogic, pauseMenu, pauseTitle, wrapRadioLog } from "./pauseScreen";
import { PauseView } from "./pauseView";
import { ScreenTargets } from "./screenTargets";

/**
 * Ein DoveZ-Level spielen (M8, erster Schnitt): Skript, Atlanten und
 * Konturen laden, Welt im 16-ms-Takt simulieren, zeichnen, Ton und Funk
 * (Texte in der Sprache der Shell, Stimmen nur englisch). Esc oder
 * Fokusverlust öffnet die Pause, ohne Leben folgt der Continue-Bildschirm;
 * „EXIT“ bzw. Game Over kehren zur Shell zurück. Noch ohne Kampagne.
 */

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

/**
 * Tastenbelegungen aus `InitKeyConfig` (`0x504BA0`, Schema 0), je Aktion eine
 * oder zwei Tasten (DIK-Codes als `KeyboardEvent.code`): Satz 0 für ein
 * Spieler, 1 und 2 für Spieler 1 und 2 im Zwei-Spieler-Spiel.
 */
const KEY_SETS: readonly Readonly<Record<keyof PlayerInput, readonly string[]>>[] = [
  {
    left: ["ArrowLeft"],
    up: ["ArrowUp"],
    right: ["ArrowRight"],
    down: ["ArrowDown"],
    fire: ["KeyS", "Space"],
    beam: ["KeyA"],
    switchWeapon: ["KeyD"],
    switchBeam: ["KeyQ"],
    rotate: ["KeyW"],
    nova: ["KeyE"],
  },
  {
    left: ["KeyJ", "ArrowLeft"],
    up: ["KeyI", "ArrowUp"],
    right: ["KeyL", "ArrowRight"],
    down: ["KeyK", "ArrowDown"],
    fire: ["KeyS"],
    beam: ["KeyA"],
    switchWeapon: ["KeyD"],
    switchBeam: ["KeyQ"],
    rotate: ["KeyW"],
    nova: ["KeyE"],
  },
  {
    left: ["Numpad4"],
    up: ["Numpad8"],
    right: ["Numpad6"],
    down: ["Numpad5", "Numpad2"],
    fire: ["End"],
    beam: ["Delete"],
    switchWeapon: ["PageDown"],
    switchBeam: ["Insert"],
    rotate: ["Home"],
    nova: ["PageUp"],
  },
];

/** Eingabe eines Spielers; `set` wie `KEY_SETS` (0 allein, 1/2 im Zwei-Spieler-Spiel). */
export function readInput(host: GameHost, set = 0): PlayerInput {
  const keys = KEY_SETS[set] ?? KEY_SETS[0]!;
  const down = (codes: readonly string[]) => codes.some((c) => host.keys.isDown(c));
  return {
    left: down(keys.left),
    up: down(keys.up),
    right: down(keys.right),
    down: down(keys.down),
    fire: down(keys.fire),
    beam: down(keys.beam),
    switchWeapon: down(keys.switchWeapon),
    switchBeam: down(keys.switchBeam),
    rotate: down(keys.rotate),
    nova: down(keys.nova),
  };
}

export interface GameOptions {
  readonly level: string;
  readonly from: number;
  readonly ship: 0 | 1;
  readonly invincible: boolean;
  readonly players: 1 | 2;
  /** Sichtprüfung: Bildschirm gleich nach dem ersten Bild zeigen (Highscore nicht gespeichert). */
  readonly screen?: "continue" | "pause" | undefined;
}

/** Tasten von Spieler 1 für Continue und Pause (`TasteOK`, `TasteZurück`, hoch/runter). */
function screenKeys(host: GameHost, set: number, exitState: number, focus: boolean) {
  const i = readInput(host, set);
  const key = (code: string) => host.keys.isDown(code);
  return {
    ok: ((i.fire || i.beam) && exitState === 0) || key("Space") || key("Enter"),
    back: i.switchWeapon || i.switchBeam || key("Escape"),
    up: i.up,
    down: i.down,
    focus,
  };
}

/** Levelname wie im Original (`Level1-1 Skyfight`): Paketname aus dem Manifest. */
function levelName(host: GameHost, slug: string): string {
  const id = `leveldat/${slug}`;
  const path = host.assets.has(id) ? host.assets.entry(id).sources[0]?.path : undefined;
  return (
    path
      ?.split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? slug
  );
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

export async function bootGame(host: GameHost, opts: GameOptions): Promise<GameInstance> {
  const app = await createScreen({
    canvas: host.canvas,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  });
  const textures = new TextureRegistry(host.assets);
  const pack = await loadLevelPack(host.assets, opts.level);
  const globals = await Promise.all(
    ["atlas/spiel", "atlas/standart", "atlas/pause"].map((id) => host.assets.json<AtlasJson>(id)),
  );
  const [, standart, pauseAtlas] = globals as [AtlasJson, AtlasJson, AtlasJson];
  const atlases = [{ json: pack.atlas }, ...globals.map((json) => ({ json }))];
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
  const german = host.locale.toLowerCase().startsWith("de");
  const radioTexts = pack.radio ? (german ? pack.radio.de : pack.radio.en) : undefined;
  const world = new World(pack.level, sprites, {
    startTick: opts.from,
    ship: opts.ship,
    players: opts.players,
    ...(radioTexts ? { radioTexts } : {}),
  });
  const audio = host.audio
    ? await DovezAudio.create(host.audio, host.assets, pack.slug).catch(() => undefined)
    : undefined;
  audio?.playMusic(pack.level.music);
  const renderer = new Renderer(textures, world, atlases);
  app.stage.addChild(renderer.root);
  const loop = new FixedStepLoop(TICK_MS);
  let over = false;
  let done = false;

  // Continue und Pause: Render-Ziele, Bilder, Überblende nach der Pause
  const targets = new ScreenTargets(app.renderer);
  const kreis = atlasTexture(textures, standart, "a_kreis2");
  const balken = atlasTexture(textures, standart, "balken");
  const pauseImage = atlasTexture(textures, pauseAtlas, "pausescreen");
  const afterPause = new Sprite(targets.afterPause);
  const screenSprite = new Sprite(targets.back);
  afterPause.visible = false;
  screenSprite.visible = false;
  app.stage.addChild(afterPause, screenSprite);
  const darken = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
  darken.alpha = 0.3;
  const logFont = new GdiText(18, 0);
  /** `Me.518` nach der Pause: α des letzten Pausebilds, −0,05 je Tick (`OverlayEffekte`). */
  let afterPauseAlpha = 0;
  let mode: Mode = { kind: "play" };
  let showcase = opts.screen;

  // Spieler: Name aus dem Menü (fehlt im Port → Vorgabe „Bruce“), Spiel-ID wie bei der Namenseingabe
  let highscores = parseHighscores(host.storage.get(HIGHSCORE_KEY));
  const names = Array.from({ length: opts.players }, () => DEFAULT_NAME);
  const ids: number[] = [];
  for (let p = 0; p < opts.players; p++) {
    const taken = [...highscores, ...ids.map((id) => ({ name: "", score: 0, id }))];
    ids.push(newGameId(taken, Math.random));
  }
  const storeHighscores = (list: HighscoreEntry[]) => {
    highscores = list;
    if (!opts.screen) host.storage.set(HIGHSCORE_KEY, serializeHighscores(list));
  };

  // Fokus (`GetFocus() = hWnd`): Fokusverlust öffnet die Pause, ohne Fokus zählen keine Tasten
  const win = host.canvas.ownerDocument.defaultView;
  let windowFocus = true;
  const onBlur = () => {
    windowFocus = false;
  };
  const onFocus = () => {
    windowFocus = true;
  };
  win?.addEventListener("blur", onBlur);
  win?.addEventListener("focus", onFocus);
  const focused = () => windowFocus && !host.canvas.ownerDocument.hidden;
  const keys = () =>
    screenKeys(host, opts.players === 2 ? 1 : 0, world.players[0]?.exitState ?? 0, focused());

  /** Letztes Spielbild nach `shot` (Continue: mit 30 % Schwarz überdeckt). */
  const captureShot = (dark: boolean) => {
    screenSprite.visible = false;
    targets.draw(app.stage, targets.shot, true);
    if (dark) targets.draw(darken, targets.shot);
  };
  const showScreen = (on: boolean) => {
    screenSprite.visible = on;
    renderer.root.visible = !on;
    if (on) afterPause.visible = false;
  };

  const enterPause = () => {
    audio?.pause();
    captureShot(false);
    const log = wrapRadioLog(world.radio.log, (s) => logFont.width(s));
    const view = new PauseView(targets, balken, pauseImage, {
      menu: pauseMenu(german),
      title: pauseTitle(levelName(host, pack.slug), names),
      log,
    });
    const logic = new PauseLogic(world.rnd);
    mode = { kind: "pause", logic, view, loop: new FixedStepLoop(PAUSE_MS) };
  };

  const leavePause = (view: PauseView, exit: boolean, restore: boolean) => {
    targets.keepAfterPause();
    view.destroy();
    showScreen(false);
    mode = { kind: "play" };
    if (exit) {
      // „EXIT“: Highscore mit dem aktuellen Stand, dann Hauptmenü
      let list = highscores;
      names.forEach((name, p) => {
        list = addHighscore(list, name, world.score[p] ?? 0, ids[p]!).list;
      });
      storeHighscores(list);
      done = true;
      host.exit();
      return;
    }
    audio?.resume(restore);
    afterPauseAlpha = 1;
    loop.reset(host.now());
  };

  const enterContinue = () => {
    audio?.stopVoice();
    const players = names.map((name, p) => ({ name, score: world.score[p] ?? 0, id: ids[p]! }));
    const r = continueRanks(highscores, players);
    storeHighscores(r.list);
    captureShot(true);
    const view = new ContinueView(targets, kreis, rankTexts(names, r.ranks, german));
    audio?.playContinueMusic();
    const logic = new ContinueLogic(world.rnd);
    mode = { kind: "continue", logic, view, loop: new FixedStepLoop(CONTINUE_MS) };
  };

  const leaveContinue = (view: ContinueView, ok: boolean) => {
    view.destroy();
    showScreen(false);
    mode = { kind: "play" };
    audio?.stopMusic();
    if (!ok) {
      // Game Over → Hauptmenü (der Highscore steht schon)
      done = true;
      host.exit();
      return;
    }
    audio?.effect("speech", true);
    if (world.state === 1) {
      applyContinue(world);
      world.respawn();
    }
    audio?.playMusic(pack.level.music, true);
    loop.reset(host.now());
  };

  /**
   * `n` fällige Durchläufe des laufenden Bildschirms. Die Logik (und ihr
   * `Rnd`) läuft jeden Durchlauf; gezeichnet wird wie beim Bildauslassen des
   * Originals nur der letzte je Anzeigebild.
   */
  const runScreen = (n: number) => {
    let pending: (() => void) | undefined;
    const flush = () => {
      pending?.();
      pending = undefined;
    };
    for (let i = 0; i < n; i++) {
      if (done) return;
      const m = mode;
      if (m.kind === "pause") {
        const pass = m.logic.step(keys());
        if (pass)
          pending = () => {
            m.view.draw(pass);
            showScreen(true);
          };
        const r = m.logic.result;
        if (r) {
          flush();
          leavePause(m.view, r.exit, r.restore);
          return;
        }
      } else if (m.kind === "continue") {
        // Die Schleife endet erst nach dem Durchlauf (und `Wait 40`), in dem `ok` bzw. das Ende fiel
        if (m.logic.result !== undefined) {
          flush();
          leaveContinue(m.view, m.logic.result);
          return;
        }
        const pass = m.logic.step(keys());
        pending = () => {
          m.view.draw(pass);
          showScreen(true);
        };
      } else break;
    }
    flush();
  };

  const frame = () => {
    if (done) return;
    const now = host.now();
    if (mode.kind !== "play") {
      runScreen(mode.loop.frame(now));
      if (!done) app.render();
      return;
    }
    if (over && host.keys.isDown("Escape")) {
      done = true;
      host.exit();
      return;
    }
    let next: "pause" | "continue" | undefined;
    const n = loop.frame(now);
    for (let i = 0; i < n && !over && !next; i++) {
      const inputs =
        opts.players === 2 ? [readInput(host, 1), readInput(host, 2)] : [readInput(host), NO_INPUT];
      if (opts.invincible)
        for (const p of world.players) p.invulnerable = Math.max(p.invulnerable, 2);
      world.step(inputs);
      if (afterPauseAlpha > 0) afterPauseAlpha = Math.max(0, f32(afterPauseAlpha - 0.05));
      // Tod: Neustart am Checkpoint; ohne Leben der Continue-Bildschirm
      if (world.state === 1 && !world.respawn()) next = "continue";
      else if (world.state === 2) over = true;
      // `TastePause` oder Fokusverlust am Ende des Ticks
      else if (host.keys.isDown("Escape") || !focused()) next = "pause";
    }
    next ??= showcase;
    showcase = undefined;
    audio?.update(world);
    world.events.length = 0;
    renderer.draw();
    afterPause.visible = afterPauseAlpha > 0;
    afterPause.alpha = afterPauseAlpha;
    app.render();
    if (!next) return;
    if (next === "pause") enterPause();
    else enterContinue();
    runScreen(1);
    if (!done) app.render();
  };
  app.ticker.add(frame);
  app.ticker.start();
  return {
    dispose() {
      app.ticker.remove(frame);
      win?.removeEventListener("blur", onBlur);
      win?.removeEventListener("focus", onFocus);
      if (mode.kind !== "play") mode.view.destroy();
      audio?.dispose();
      renderer.destroy();
      logFont.destroy();
      darken.destroy();
      targets.destroy();
      for (const t of [kreis, balken, pauseImage]) t?.destroy(false);
      app.destroy({ removeView: false }, { children: true });
      textures.destroy();
    },
  };
}
