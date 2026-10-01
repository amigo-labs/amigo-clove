import { LoveLogic } from "./love";
import { LoveScene } from "./loveScene";
import type { AtlasJson, GameHost, GameInstance, UiImage, UiScreen } from "@clove/core";
import { StreamPlayer } from "@clove/audio";
import { dovezSlug, type PlayStep } from "@clove/formats";
import { TextureRegistry, createScreen, setView } from "@clove/pixi-kit";
import { Renderer } from "../render/Renderer";
import { VbRnd } from "../sim/vb";
import type { Carry } from "../sim/world";
import { Campaign, type CampaignAction, languageVideo } from "./campaign";
import { DEFAULT_CONFIG, type DovezConfig, loadConfig, saveConfig } from "./config";
import { creditsScreen } from "./credits";
import { FadeLogic, FadeScene } from "./fadeOut";
import { atlasTexture } from "./gdi";
import { parseHighscores, HIGHSCORE_KEY } from "./highscore";
import { keyLabel, pauseKey } from "./input";
import { atlasSprites, dovezHud } from "./hud";
import { type Lang, loadingText, resolveLang } from "./lang";
import { type GameContext, LevelScene, levelBundles } from "./level";
import { loadingNotice } from "./loadingScreen";
import { type MenuResult, htmlMenu } from "./menu/htmlMenu";
import { LogoGlitch, LogoShow, LogoTunnel } from "./menu/logos";
import { MenuAudio } from "./menu/menuAudio";
import { Mosaic } from "./mosaic";
import { Profile } from "./profile";
import { EMPTY_SLOT, type SaveFile, parseSave, saveKey, saveLabel, slotLabels } from "./saveGame";
import { runSaveScreen, savePlaces } from "./saveScreen";
import type { Scene } from "./scene";
import { ScreenTargets } from "./screenTargets";

/**
 * DoveZ spielen (M8) wie die Hauptschleife des Originals (`0x54E430`):
 * Start-Logos, Intro-Video und Hauptmenü (`MenuLoop`), daraus die Kampagne
 * aus `Play.txt` (`LevelSkript` → `LadeDaten` → `SpielLoop`), ein Bonuslevel
 * oder ein geladener Spielstand; Game Over, Pause „EXIT“ und das Skriptende
 * führen zurück ins Menü, „Exit“ im Menü zur Shell. Mit `level`, `step` oder
 * `load` geht es ohne Menü direkt ins Spiel (danach zur Shell). Befund:
 * `docs/measurements/dovez-runtime.md` („Kampagne“, „Hauptmenü“).
 *
 * Im Canvas laufen nur die Level, die Start-Logos und das Osterei. Menü,
 * Ladebild, Speicherbildschirm, Pause, Continue, Videos und Abspann sind
 * HTML-Bildschirme der Shell (`GameHost.ui`), gebaut aus den Texten und Bildern
 * des Originals.
 */

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;
/** Spielfeld ohne HUD-Leiste. */
const FIELD_H = 550;

export { keyLabel, readInput } from "./input";

export interface GameOptions {
  /** Einzellevel (Slug) ohne Menü. */
  readonly level?: string | undefined;
  readonly from: number;
  /** 0 D-Tonator, 1 D-Phyton, 2 Debug-Schiff (nur URL `ship=2`). */
  readonly ship: 0 | 1 | 2;
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
  readonly screen?: "continue" | "pause" | "save" | "credits" | "love" | undefined;
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
  readonly ship: 0 | 1 | 2;
  readonly names?: readonly string[] | undefined;
  readonly ids?: readonly number[] | undefined;
  readonly saved?: SaveFile | undefined;
  /** Einzellevel: Slug und Name. */
  readonly single?: { readonly slug: string; readonly name: string } | undefined;
  readonly step?: number | undefined;
}

/** Video der Original-Assets über die Shell; fehlt es, geht es gleich weiter. */
async function playVideo(
  host: GameHost,
  id: string,
  lang: Lang,
  /** „Loading“, bis es läuft (Kampagne, nicht beim Intro). */
  showLoading: boolean,
  signal: AbortSignal,
): Promise<void> {
  if (!host.assets.has(id)) return;
  await host.ui.show(
    {
      kind: "video",
      url: host.assets.url(id),
      ...(showLoading ? { loading: loadingText(lang).text } : {}),
    },
    signal,
  );
}

export async function bootGame(host: GameHost, opts: GameOptions): Promise<GameInstance> {
  const app = await createScreen({
    canvas: host.canvas,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    scale: () => host.scaleMode?.() ?? "integer",
  });
  const textures = new TextureRegistry(host.assets);
  const globals = (await Promise.all(
    ["atlas/spiel", "atlas/standart"].map((id) => host.assets.json<AtlasJson>(id)),
  )) as [AtlasJson, AtlasJson];
  await textures.load(Renderer.pageIds(globals.map((json) => ({ json }))));
  const standart = globals[1];
  /** Das DoveZ-Logo (`Standart.d2p`, wie auf dem Mosaik-Ladebild) für Menü und Speicherbildschirm. */
  const logoSprite = atlasSprites(host.assets, standart)("logo");
  const dovezLogo: UiImage | undefined = logoSprite
    ? { sprite: logoSprite, alt: "DoveZ" }
    : undefined;
  // die Marke im Kopf aller Seiten, wie in DOVE
  host.ui.brand?.({ name: "DoveZ", ...(dovezLogo ? { logo: dovezLogo } : {}) });
  /** `Me.588070`: `lang=` der URL, sonst die Locale des Hosts (`de`, `ru`, sonst Englisch). */
  const lang = resolveLang(opts.lang, host.locale);
  const persist = opts.screen === undefined;
  const targets = new ScreenTargets(app.renderer);
  const mosaic = new Mosaic(host.storage, persist);
  /** Die eine `Rnd`-Folge des Programms (Logos, Spiel-IDs, alle Level). */
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
  /** Schließt beim Beenden einen offenen HTML-Bildschirm. */
  const screens = new AbortController();
  const show = (screen: UiScreen) => host.ui.show(screen, screens.signal);
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
  /** Wie `play`, aber ohne aufzuräumen (das Level spielt im Speicherbildschirm noch die Musik). */
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
    if (disposed) return;
    setView(host.canvas, s instanceof LevelScene && s.fieldOnly ? FIELD_H : null);
    app.render();
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
      let sprite: UiImage | undefined;
      if (a.loading) {
        const atlas = await host.assets.json<AtlasJson>("atlas/loading");
        const take = atlasSprites(host.assets, atlas)(a.loading);
        if (take) sprite = { sprite: take };
      }
      // ohne Ladebild (Einzellevel, Epilog): das Mosaik, ohne Tastendruck
      const isMosaic = a.loading === undefined || sprite === undefined;
      const image = isMosaic ? await mosaic.image() : sprite;
      let loaded = 0;
      let ready = false;
      const shown = show(
        loadingNotice({
          lang,
          image,
          mosaic: isMosaic,
          progress: () => (ready ? 1 : Math.min(loaded, 0.99)),
        }),
      );
      const bundles = levelBundles(a.slug).filter((b) => host.assets.bundle(b).length > 0);
      await host.assets.preload(bundles, (done, total) => {
        loaded = total > 0 ? done / total : 1;
      });
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
      ready = true;
      await shown;
      if (disposed) {
        level.destroy();
        return undefined;
      }
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

    /**
     * `SaveGame`: Highscore eintragen, Speicherbildschirm der Shell mit
     * `Save_Screen.ogg`; gespeichert wird der Stand nach dem Level, danach
     * „Gespeichert“ mit `Save.wav`.
     */
    const saveScreen = async (level: LevelScene) => {
      const score = level.world.score;
      const ranks = savePlaces(ctx.profile.addAll(score));
      level.audio?.playSaveMusic();
      await runSaveScreen(host.ui, {
        lang,
        level: level.name,
        scores: score.slice(0, players),
        places: ranks,
        highscores: ctx.profile.highscores,
        ids: ctx.profile.ids,
        slots: slotLabels(host.storage),
        storage: host.storage,
        persist,
        file: () => ({
          version: 1,
          label: saveLabel(players, ship, campaign.pass, level.name, new Date(), lang),
          step: campaign.step,
          pass: campaign.pass,
          players,
          ship,
          names: ctx.profile.names,
          ids: ctx.profile.ids,
          carry: level.world.carry(),
        }),
        saved: () => {
          level.audio?.stopMusic();
          level.audio?.effect("save", true);
        },
        signal: screens.signal,
      });
      level.audio?.stopMusic();
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
          if (opts.videos) await playVideo(host, action.id, lang, true, screens.signal);
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

  /** Outro, Abspann mit dem Originalbild, Musik aus. */
  const credits = async (outro: string) => {
    if (opts.videos) await playVideo(host, outro, lang, true, screens.signal);
    if (disposed) return;
    const logoAtlas = await host.assets.json<AtlasJson>("atlas/logo");
    if (host.audio) {
      music ??= new StreamPlayer(host.audio.context, host.audio.music);
      music.setVolume(DEFAULT_CONFIG.music / 100);
      if (host.assets.has("music/enhaced_credits"))
        music.play(host.assets.url("music/enhaced_credits"), false);
    }
    await show(creditsScreen(lang, atlasSprites(host.assets, logoAtlas)("credits")));
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
      menuAudio?.play("logo", DEFAULT_CONFIG.sfx);
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

  /** Ein Aufruf von `MenuLoop` als HTML-Menü, mit `intro.ogg` in Schleife. */
  const menu = async (): Promise<MenuResult> => {
    const menuAtlas = await host.assets.json<AtlasJson>("atlas/menu");
    const menuSprite = atlasSprites(host.assets, menuAtlas);
    menuAudio?.startMusic(DEFAULT_CONFIG.music);
    const result = await htmlMenu({
      ui: host.ui,
      lang,
      rnd,
      passes: passes(),
      highscores: parseHighscores(host.storage.get(HIGHSCORE_KEY)),
      slots: slotLabels(host.storage).map((s) => (s === EMPTY_SLOT ? undefined : s)),
      config,
      players: lastPlayers,
      names: lastNames,
      ids: lastIds,
      onConfig: (c) => {
        config = c;
        if (persist) saveConfig(host.storage, c);
      },
      sound: (name) => menuAudio?.play(name, DEFAULT_CONFIG.sfx),
      pads: () => host.rumblePads?.() ?? 0,
      rumble: host.rumble,
      logo: dovezLogo,
      // erstes Bild der Schiffsdrehung: D-Tonator `shipselect1…`, D-Phyton `shipselect0…`
      shipImage: (ship) => {
        const s = menuSprite(`shipselect${ship === 0 ? 1 : 0}0000`);
        return s ? { sprite: s, alt: ship === 0 ? "D-Tonator" : "D-Phyton" } : undefined;
      },
      signal: screens.signal,
    });
    menuAudio?.music.stop();
    return result;
  };

  const menuFlow = async () => {
    let first = true;
    for (;;) {
      if (disposed) return;
      if (first && opts.intro) {
        await logos();
        if (opts.videos)
          await playVideo(host, languageVideo("intro", lang), lang, false, screens.signal);
      }
      first = false;
      if (disposed) return;
      const r = await menu();
      if (disposed || r.kind === "exit") return;
      if (r.kind === "love") {
        // „lov“ im Hauptmenü (`0x546C30`): Osterei, danach wie „Exit“ zurück zur Shell
        await play(new LoveScene(host, app, textures, standart, new LoveLogic(rnd)));
        await play(new FadeScene(app, targets, new FadeLogic(0, rnd)));
        return;
      }
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
    if (opts.screen === "love") {
      // Sichtprüfung des Osterei ohne Menü
      await play(new LoveScene(host, app, textures, standart, new LoveLogic(rnd)));
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

  const hudSprite = atlasSprites(host.assets, globals[0]);
  return {
    hud() {
      const level = current;
      if (!level || scene !== level || !level.playing) return null;
      return dovezHud(level.world, hudSprite, lang, (a, set) => keyLabel(host, a, set));
    },
    dispose() {
      disposed = true;
      screens.abort();
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
