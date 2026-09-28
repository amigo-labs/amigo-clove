import type { AtlasJson, GameHost, GameInstance } from "@clove/core";
import { StreamPlayer } from "@clove/audio";
import type { PlayStep } from "@clove/formats";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import type { Texture } from "pixi.js";
import { Renderer } from "../render/Renderer";
import { VbRnd } from "../sim/vb";
import type { Carry } from "../sim/world";
import { Campaign, type CampaignAction } from "./campaign";
import { CreditsLogic, CreditsScene, creditsMask } from "./credits";
import { FadeLogic, FadeScene } from "./fadeOut";
import { atlasTexture } from "./gdi";
import { okKey, pauseKey, readInput } from "./input";
import { type GameContext, LevelScene, levelBundles } from "./level";
import { LoadingScene } from "./loadingScreen";
import { Mosaic } from "./mosaic";
import { Profile } from "./profile";
import {
  type SaveFile,
  parseSave,
  saveKey,
  saveLabel,
  serializeSave,
  slotLabels,
} from "./saveGame";
import { SaveScene, savePlaces } from "./saveScreen";
import type { Scene } from "./scene";
import { ScreenTargets } from "./screenTargets";
import { VideoScene } from "./videoScene";

/**
 * DoveZ spielen (M8): die Kampagne aus `Play.txt` wie die Hauptschleife des
 * Originals (`0x54E430`: `LevelSkript` → `LadeDaten` → `SpielLoop`), oder mit
 * `level` ein einzelnes Level (wie Bonus/`-Skip`). Ladebild, Level,
 * Speicherbildschirm, Zwischensequenzen, Outro, Abspann und Epilog; Game
 * Over, Pause „EXIT“ und das Skriptende kehren zur Shell zurück (das
 * Hauptmenü fehlt im Port noch). Befund: `docs/measurements/dovez-runtime.md`
 * („Kampagne“).
 */

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

export { keyLabel, readInput } from "./input";

export interface GameOptions {
  /** Einzellevel (Slug); ohne: Kampagne. */
  readonly level?: string | undefined;
  readonly from: number;
  readonly ship: 0 | 1;
  readonly invincible: boolean;
  readonly players: 1 | 2;
  /** Kampagne ab dieser Anweisung (`Me.115C`, zum Testen). */
  readonly step?: number | undefined;
  /** Spielstand laden (Platz 1…21). */
  readonly load?: number | undefined;
  /** Zwischensequenzen abspielen (Option „Videos“, `[0x58807C]`). */
  readonly videos: boolean;
  /** Sichtprüfung: Bildschirm gleich nach dem ersten Bild zeigen (nichts wird gespeichert). */
  readonly screen?: "continue" | "pause" | "save" | "credits" | undefined;
}

/** Höchster geschaffter Durchgang (`[0x588080]` in `config.cfg`). */
const PASSES_KEY = "passes";

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

export async function bootGame(host: GameHost, opts: GameOptions): Promise<GameInstance> {
  const app = await createScreen({
    canvas: host.canvas,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  });
  const textures = new TextureRegistry(host.assets);
  const globals = (await Promise.all(
    ["atlas/spiel", "atlas/standart", "atlas/pause"].map((id) => host.assets.json<AtlasJson>(id)),
  )) as [AtlasJson, AtlasJson, AtlasJson];
  await textures.load(Renderer.pageIds(globals.map((json) => ({ json }))));
  const standart = globals[1];
  const german = host.locale.toLowerCase().startsWith("de");
  const persist = opts.screen === undefined;
  const saved: SaveFile | undefined =
    opts.load !== undefined ? parseSave(host.storage.get(saveKey(opts.load))) : undefined;
  const players = saved?.players ?? opts.players;
  const ship = saved?.ship ?? opts.ship;
  const ctx: GameContext = {
    host,
    app,
    textures,
    globals,
    targets: new ScreenTargets(app.renderer),
    german,
    profile: new Profile(host.storage, players, persist, saved),
    mosaic: new Mosaic(host.storage, persist),
    players,
    ship,
  };

  let scene: Scene | undefined;
  let finish: (() => void) | undefined;
  let disposed = false;
  let music: StreamPlayer | undefined;
  /** Die Level-Szene, solange sie lebt (auch im Speicherbildschirm). */
  let current: LevelScene | undefined;

  /** Einen Abschnitt laufen lassen, bis er fertig ist (danach aufgeräumt). */
  const play = (s: Scene): Promise<void> =>
    new Promise((resolve) => {
      scene = s;
      finish = () => {
        scene = undefined;
        finish = undefined;
        s.destroy();
        resolve();
      };
    });
  /** Wie `play`, aber ohne aufzuräumen (die Level-Szene lebt im Speicherbildschirm weiter). */
  const run = (s: Scene): Promise<void> =>
    new Promise((resolve) => {
      scene = s;
      finish = () => {
        scene = undefined;
        finish = undefined;
        resolve();
      };
    });

  const frame = () => {
    if (disposed) return;
    const s = scene;
    if (s && s.frame(host.now())) finish?.();
    if (!disposed) app.render();
  };
  app.ticker.add(frame);
  app.ticker.start();

  const passesDone = persist ? Number(host.storage.get(PASSES_KEY) ?? 0) || 0 : 0;
  const steps = await host.assets.json<PlayStep[]>("data/play");
  const campaign = new Campaign(steps, {
    step: saved?.step ?? opts.step ?? 0,
    pass: saved?.pass,
    passesDone,
  });
  let carry: Carry | undefined = saved?.carry;
  const rnd = new VbRnd();

  /** Level laden (mit Ladebild) und spielen; `undefined` bei Game Over/EXIT. */
  const playLevel = async (
    a: Extract<CampaignAction, { kind: "level" }>,
    first: boolean,
  ): Promise<LevelScene | undefined> => {
    let image: Texture | undefined;
    if (a.loading) {
      const atlas = await host.assets.json<AtlasJson>("atlas/loading");
      await textures.load(atlas.pages);
      image = atlasTexture(textures, atlas, a.loading);
    }
    // ohne Ladebild (Einzellevel, Epilog): das Mosaik, ohne Tastendruck
    const mosaic = image === undefined;
    const loading = new LoadingScene(
      host,
      app,
      textures,
      standart,
      image ?? (await ctx.mosaic.texture()),
      mosaic,
    );
    const shown = play(loading);
    const bundles = levelBundles(a.slug).filter((b) => host.assets.bundle(b).length > 0);
    await host.assets.preload(bundles, (done, total) =>
      loading.progress(total > 0 ? done / total : 1),
    );
    const level = await LevelScene.create(ctx, {
      slug: a.slug,
      name: a.name,
      from: first ? opts.from : 0,
      invincible: opts.invincible,
      carry,
      rnd,
      screen:
        first && (opts.screen === "continue" || opts.screen === "pause") ? opts.screen : undefined,
    });
    if (disposed) {
      level.destroy();
      return undefined;
    }
    loading.finish();
    await shown;
    current = level;
    await run(level);
    if (level.result !== "done") {
      current = undefined;
      level.destroy();
      return undefined;
    }
    carry = level.world.carry();
    return level;
  };

  /** `SaveGame`: Speicherbildschirm auf dem geschafften Level, dann Abblende. */
  const saveScreen = async (level: LevelScene) => {
    const ranks = savePlaces(ctx.profile.addAll(level.world.score));
    const screen = new SaveScene(
      level,
      textures,
      standart,
      {
        german,
        level: level.name,
        scores: level.world.score.slice(0, players),
        places: ranks,
        highscores: ctx.profile.highscores,
        ids: ctx.profile.ids,
        slots: slotLabels(host.storage),
      },
      () => {
        const i = readInput(host, players === 2 ? 1 : 0);
        return {
          ok: okKey(host),
          esc: pauseKey(host),
          up: i.up,
          down: i.down,
          left: i.left,
          right: i.right,
        };
      },
    );
    await run(screen);
    const slot = screen.logic.result?.slot;
    if (slot !== undefined && persist) {
      const file: SaveFile = {
        version: 1,
        label: saveLabel(players, ship, campaign.pass, level.name, new Date(), german),
        step: campaign.step,
        pass: campaign.pass,
        players,
        ship,
        names: ctx.profile.names,
        ids: ctx.profile.ids,
        carry: level.world.carry(),
      };
      host.storage.set(saveKey(slot), serializeSave(file));
      screen.showSaved();
      level.renderer.drawBackdrop(screen.logic.fade);
    }
    await play(new FadeScene(app, ctx.targets, new FadeLogic(0, rnd)));
    screen.destroy();
  };

  /** Outro, Abspann, Abblende, Musik aus. */
  const credits = async (outro: string) => {
    if (opts.videos) await play(new VideoScene(host, app, outro));
    const logoAtlas = await host.assets.json<AtlasJson>("atlas/logo");
    await textures.load(logoAtlas.pages);
    const mask = await creditsMask(host, logoAtlas);
    if (host.audio) {
      music ??= new StreamPlayer(host.audio.context, host.audio.music);
      music.setVolume(0.9);
      if (host.assets.has("music/enhaced_credits"))
        music.play(host.assets.url("music/enhaced_credits"), false);
    }
    const logic = new CreditsLogic(rnd, mask);
    await play(new CreditsScene(host, app, ctx.targets, textures, logoAtlas, standart, logic));
    await play(new FadeScene(app, ctx.targets, new FadeLogic(1, rnd)));
    music?.setVolume(0, 0.18);
    await new Promise((r) => setTimeout(r, 180));
    music?.stop();
    textures.unload(logoAtlas.pages);
  };

  const flow = async () => {
    if (opts.screen === "credits") {
      await credits(`video/outro${german ? "d" : "e"}`);
      return;
    }
    let action: CampaignAction = opts.level
      ? campaign.single(levelName(host, opts.level))
      : campaign.next(german);
    if (action.kind === "level" && opts.level) action = { ...action, slug: opts.level };
    let first = true;
    for (;;) {
      if (disposed) return;
      switch (action.kind) {
        case "level": {
          const level = await playLevel(action, first);
          first = false;
          if (!level) return;
          let next = campaign.next(german);
          if (opts.screen === "save" || next.kind === "save") {
            await saveScreen(level);
            if (next.kind === "save") next = campaign.next(german);
          }
          current = undefined;
          level.destroy();
          action = next;
          break;
        }
        case "save":
          // Speicherbildschirm ohne geschafftes Level (Einstieg per `step`): übergehen
          action = campaign.next(german);
          break;
        case "video":
          if (opts.videos) await play(new VideoScene(host, app, action.id));
          action = campaign.next(german);
          break;
        case "credits":
          ctx.profile.addAll(carry?.score ?? []);
          if (persist) host.storage.set(PASSES_KEY, String(campaign.passesDone));
          await credits(action.outro);
          action = action.epilog ? campaign.epilog() : campaign.next(german);
          break;
        case "end":
          // Skriptende: Highscore, Hauptmenü
          ctx.profile.addAll(carry?.score ?? []);
          return;
      }
    }
  };

  void flow()
    .catch((e: unknown) => console.error(e))
    .finally(() => {
      if (!disposed) host.exit();
    });

  return {
    dispose() {
      disposed = true;
      app.ticker.remove(frame);
      if (scene !== current) scene?.destroy();
      scene = undefined;
      current?.destroy();
      music?.dispose();
      ctx.targets.destroy();
      app.destroy({ removeView: false }, { children: true });
      textures.destroy();
    },
  };
}
