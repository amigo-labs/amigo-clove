import type { AtlasJson, GameHost, GameInstance } from "@clove/core";
import { StreamPlayer } from "@clove/audio";
import { dovezSlug, type PlayStep } from "@clove/formats";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import type { Texture } from "pixi.js";
import { Renderer } from "../render/Renderer";
import { VbRnd, vbInt } from "../sim/vb";
import type { Carry } from "../sim/world";
import { Campaign, type CampaignAction, languageVideo } from "./campaign";
import { type DovezConfig, loadConfig, saveConfig } from "./config";
import { CreditsLogic, CreditsScene, creditsMask } from "./credits";
import { FadeLogic, FadeScene } from "./fadeOut";
import { atlasTexture } from "./gdi";
import { parseHighscores, HIGHSCORE_KEY } from "./highscore";
import { keyText, okKey, pauseKey, readInput } from "./input";
import { resolveLang } from "./lang";
import { type GameContext, LevelScene, levelBundles } from "./level";
import { LoadingScene } from "./loadingScreen";
import { LogoGlitch, LogoShow, LogoTunnel } from "./menu/logos";
import { MenuLogic, type MenuResult } from "./menu/menuLogic";
import { MenuAudio, MenuScene } from "./menu/menuScene";
import { MenuView } from "./menu/menuView";
import { Mosaic } from "./mosaic";
import { Profile } from "./profile";
import {
  EMPTY_SLOT,
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
 * DoveZ spielen (M8) wie die Hauptschleife des Originals (`0x54E430`):
 * Start-Logos, Intro-Video und Hauptmenü (`MenuLoop`), daraus die Kampagne
 * aus `Play.txt` (`LevelSkript` → `LadeDaten` → `SpielLoop`), ein Bonuslevel
 * oder ein geladener Spielstand; Game Over, Pause „EXIT“ und das Skriptende
 * führen zurück ins Menü, „Exit“ im Menü zur Shell. Mit `level`, `step` oder
 * `load` geht es ohne Menü direkt ins Spiel (danach zur Shell). Befund:
 * `docs/measurements/dovez-runtime.md` („Kampagne“, „Hauptmenü“).
 */

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

export { keyLabel, readInput } from "./input";

export interface GameOptions {
  /** Einzellevel (Slug) ohne Menü. */
  readonly level?: string | undefined;
  readonly from: number;
  readonly ship: 0 | 1;
  readonly invincible: boolean;
  readonly players: 1 | 2;
  /** Kampagne ab dieser Anweisung (`Me.115C`, zum Testen), ohne Menü. */
  readonly step?: number | undefined;
  /** Spielstand laden (Platz 1…21), ohne Menü. */
  readonly load?: number | undefined;
  /** Zwischensequenzen abspielen (Option „Videos“, `[0x58807C]`). */
  readonly videos: boolean;
  /** Logos und Intro vor dem ersten Menü. */
  readonly intro: boolean;
  /** Sichtprüfung: Bildschirm gleich nach dem ersten Bild zeigen (nichts wird gespeichert). */
  readonly screen?: "continue" | "pause" | "save" | "credits" | undefined;
  /** URL-Option `lang=de|en|ru`: Sprache erzwingen (sonst aus `host.locale`). */
  readonly lang?: string | undefined;
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

/** Wie ein Spiel beginnt: neu (Kampagne oder Bonus), per Spielstand oder direkt (URL). */
interface Start {
  readonly players: 1 | 2;
  readonly ship: 0 | 1;
  readonly names?: readonly string[] | undefined;
  readonly ids?: readonly number[] | undefined;
  readonly saved?: SaveFile | undefined;
  /** Einzellevel: Slug und Name. */
  readonly single?: { readonly slug: string; readonly name: string } | undefined;
  readonly step?: number | undefined;
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
  /** `Me.588070`: `lang=` der URL, sonst die Locale des Hosts (`de`, `ru`, sonst Englisch). */
  const lang = resolveLang(opts.lang, host.locale);
  const persist = opts.screen === undefined;
  const targets = new ScreenTargets(app.renderer);
  const mosaic = new Mosaic(host.storage, persist);
  /** Die eine `Rnd`-Folge des Programms (Menü, Logos, alle Level). */
  const rnd = new VbRnd();
  let config: DovezConfig = loadConfig(host.storage);
  const menuAudio = await MenuAudio.create(host);
  /** Spieler aus dem letzten Spiel der Sitzung (`Me.1288.7B4`, `P[p].68`, `P[p].6C`). */
  let lastPlayers: 1 | 2 = opts.players;
  let lastNames: readonly string[] = [];
  let lastIds: readonly number[] = [];

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

  const steps = await host.assets.json<PlayStep[]>("data/play");
  const passes = () => (persist ? Number(host.storage.get(PASSES_KEY) ?? 0) || 0 : 0);

  /** Eine Kampagne (oder ein Einzellevel) bis Skriptende, Game Over oder EXIT. */
  const runCampaign = async (start: Start, firstFrom: number) => {
    const { saved, players, ship } = start;
    const ctx: GameContext = {
      host,
      app,
      textures,
      globals,
      targets,
      lang,
      profile: new Profile(
        host.storage,
        players,
        persist,
        saved ?? (start.names && start.ids ? { names: start.names, ids: start.ids } : undefined),
      ),
      mosaic,
      players,
      ship,
      config,
    };
    lastPlayers = players;
    lastNames = ctx.profile.names;
    lastIds = ctx.profile.ids;
    const campaign = new Campaign(steps, {
      step: saved?.step ?? start.step ?? 0,
      pass: saved?.pass,
      passesDone: passes(),
    });
    let carry: Carry | undefined = saved?.carry;

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
      const isMosaic = image === undefined;
      const loading = new LoadingScene(
        host,
        app,
        textures,
        standart,
        image ?? (await mosaic.texture()),
        isMosaic,
        lang,
      );
      const shown = play(loading);
      const bundles = levelBundles(a.slug).filter((b) => host.assets.bundle(b).length > 0);
      await host.assets.preload(bundles, (done, total) =>
        loading.progress(total > 0 ? done / total : 1),
      );
      const level = await LevelScene.create(ctx, {
        slug: a.slug,
        name: a.name,
        from: first ? firstFrom : 0,
        invincible: opts.invincible,
        carry,
        rnd,
        screen:
          first && (opts.screen === "continue" || opts.screen === "pause")
            ? opts.screen
            : undefined,
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
          lang,
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
          label: saveLabel(players, ship, campaign.pass, level.name, new Date(), lang),
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
      await play(new FadeScene(app, targets, new FadeLogic(0, rnd)));
      screen.destroy();
    };

    let action: CampaignAction = start.single
      ? { ...campaign.single(start.single.name), slug: start.single.slug }
      : campaign.next(lang);
    let first = true;
    for (;;) {
      if (disposed) return;
      switch (action.kind) {
        case "level": {
          const level = await playLevel(action, first);
          first = false;
          if (!level) return;
          let next = campaign.next(lang);
          if (opts.screen === "save" || next.kind === "save") {
            await saveScreen(level);
            if (next.kind === "save") next = campaign.next(lang);
          }
          current = undefined;
          level.destroy();
          action = next;
          break;
        }
        case "save":
          // Speicherbildschirm ohne geschafftes Level (Einstieg per `step`): übergehen
          action = campaign.next(lang);
          break;
        case "video":
          if (opts.videos) await play(new VideoScene(host, app, action.id, lang));
          action = campaign.next(lang);
          break;
        case "credits":
          ctx.profile.addAll(carry?.score ?? []);
          if (persist) host.storage.set(PASSES_KEY, String(campaign.passesDone));
          await credits(action.outro);
          action = action.epilog ? campaign.epilog() : campaign.next(lang);
          break;
        case "end":
          // Skriptende: Highscore, Hauptmenü
          ctx.profile.addAll(carry?.score ?? []);
          return;
      }
    }
  };

  /** Outro, Abspann, Abblende, Musik aus. */
  const credits = async (outro: string) => {
    if (opts.videos) await play(new VideoScene(host, app, outro, lang));
    const logoAtlas = await host.assets.json<AtlasJson>("atlas/logo");
    await textures.load(logoAtlas.pages);
    const mask = await creditsMask(host, logoAtlas);
    if (host.audio) {
      music ??= new StreamPlayer(host.audio.context, host.audio.music);
      music.setVolume(config.music / 100);
      if (host.assets.has("music/enhaced_credits"))
        music.play(host.assets.url("music/enhaced_credits"), false);
    }
    const logic = new CreditsLogic(rnd, mask);
    await play(new CreditsScene(host, app, targets, textures, logoAtlas, standart, logic));
    await play(new FadeScene(app, targets, new FadeLogic(1, rnd)));
    music?.setVolume(0, 0.18);
    await new Promise((r) => setTimeout(r, 180));
    music?.stop();
  };

  /** Die drei Start-Logos (`ShowLogo`). */
  const logos = async () => {
    const atlas = await host.assets.json<AtlasJson>("atlas/logo");
    await textures.load(atlas.pages);
    const logo = (key: string) => atlasTexture(textures, atlas, key);
    const noise = atlasTexture(textures, standart, "noise");
    const esc = () => pauseKey(host);
    const intergenies = logo("logo_intergenies");
    if (intergenies) {
      menuAudio?.play("logo", config.sfx);
      await play(new LogoGlitch(host, app, targets, intergenies, noise, rnd));
      await play(new LogoShow(host, app, intergenies, 42, 30, 0, rnd));
      await play(new FadeScene(app, targets, new FadeLogic(0, rnd), esc));
      menuAudio?.stop("logo");
      intergenies.destroy(false);
    }
    for (const key of ["logo_toxeen", "logo_clockwork"]) {
      const t = logo(key);
      if (!t) continue;
      await play(new LogoShow(host, app, t, 40, 30, 1, rnd));
      await play(new LogoTunnel(host, app, targets, t));
      t.destroy(false);
    }
    noise?.destroy(false);
  };

  /** Ein Aufruf von `MenuLoop`; `first`: nach dem Intro aus dem Hangar einblenden. */
  const menu = async (first: boolean, hangar: 0 | 1): Promise<MenuResult | undefined> => {
    const atlas = await host.assets.json<AtlasJson>("atlas/menu");
    await textures.load(atlas.pages);
    const view = new MenuView(app.renderer, textures, atlas, standart, hangar);
    if (first) {
      const h = atlasTexture(textures, atlas, `hangar${hangar}`);
      view.startStill(h);
      h?.destroy(false);
    }
    const logic = new MenuLogic({
      lang,
      rnd,
      passes: passes(),
      highscores: parseHighscores(host.storage.get(HIGHSCORE_KEY)),
      slots: slotLabels(host.storage).map((s) => (s === EMPTY_SLOT ? undefined : s)),
      config,
      playersMinus1: (lastPlayers - 1) as 0 | 1,
      names: lastNames,
      ids: lastIds,
      keyText,
    });
    app.stage.addChild(view.root);
    await play(
      new MenuScene(host, logic, view, menuAudio, (c) => {
        config = c;
        if (persist) saveConfig(host.storage, c);
      }),
    );
    // `mode = 1` → `FadeOut 1, False` über dem letzten Menübild
    if (logic.result && logic.result.kind !== "exit")
      await play(new FadeScene(app, targets, new FadeLogic(1, rnd)));
    view.destroy();
    textures.unload(atlas.pages);
    return logic.result;
  };

  const menuFlow = async () => {
    let first = true;
    for (;;) {
      if (disposed) return;
      // `LoadMenuSurfaces`: Hangar `Int(Rnd · 2)` vor dem Menü (und vor den Logos)
      const hangar = vbInt(rnd.next() * 2) as 0 | 1;
      if (first && opts.intro) {
        await logos();
        if (opts.videos)
          await play(new VideoScene(host, app, languageVideo("intro", lang), lang, false));
      }
      const r = await menu(first, hangar);
      first = false;
      if (!r || r.kind === "exit") return;
      if (r.kind === "load") {
        const saved = parseSave(host.storage.get(saveKey(r.slot)));
        if (!saved) continue;
        await runCampaign({ players: saved.players, ship: saved.ship, saved }, 0);
      } else
        await runCampaign(
          {
            players: r.players,
            ship: r.ship,
            names: r.names,
            ids: r.ids,
            single: r.bonus ? { slug: dovezSlug(r.bonus), name: r.bonus } : undefined,
          },
          0,
        );
    }
  };

  /** Ohne Menü (URL-Optionen `level`, `step`, `load`, Sichtprüfung des Abspanns). */
  const directFlow = async () => {
    if (opts.screen === "credits") {
      await credits(languageVideo("outro", lang));
      return;
    }
    const saved =
      opts.load !== undefined ? parseSave(host.storage.get(saveKey(opts.load))) : undefined;
    await runCampaign(
      {
        players: saved?.players ?? opts.players,
        ship: saved?.ship ?? opts.ship,
        saved,
        single: opts.level ? { slug: opts.level, name: levelName(host, opts.level) } : undefined,
        step: opts.step,
      },
      opts.from,
    );
  };

  const direct =
    opts.level !== undefined ||
    opts.step !== undefined ||
    opts.load !== undefined ||
    opts.screen !== undefined;
  void (direct ? directFlow() : menuFlow())
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
      menuAudio?.dispose();
      targets.destroy();
      app.destroy({ removeView: false }, { children: true });
      textures.destroy();
    },
  };
}
