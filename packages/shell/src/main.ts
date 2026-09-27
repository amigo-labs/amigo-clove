import { AudioBus } from "@clove/audio";
import {
  AssetStore,
  resolveLocale,
  translator,
  type AudioHost,
  type GameInstance,
  type GameModule,
  type KeyState,
  type Locale,
} from "@clove/core";
import { h } from "./dom";
import { createPadState, startPadNavigation } from "./gamepad";
import { createKeyState } from "./keys";
import { registerServiceWorker } from "./offline";
import { parseRoute } from "./router";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { storageFor, webStorage } from "./storage";
import { TEXTS, mb, type ShellText, type TextKey } from "./texts";
import { launcherView } from "./views/launcher";
import { settingsView } from "./views/settings";

/**
 * Launcher. Hash-Routing: `#/` Spielauswahl, `#/settings` Einstellungen,
 * `#/dove?level=1` startet DOVE (URL-Optionen siehe `@clove/game-dove`).
 * Die Shell besitzt Canvas, AudioContext, Speicher, Eingabegeräte und Sprache.
 */
const GAMES: Readonly<
  Record<string, { title: string; subtitle: TextKey; load: () => Promise<GameModule> }>
> = {
  dove: {
    title: "DOVE",
    subtitle: "doveSub",
    load: async () => (await import("@clove/game-dove")).default,
  },
};

const screen = document.getElementById("screen") as HTMLDivElement;
const errorBox = document.getElementById("error") as HTMLDivElement;
const keyboard = createKeyState(window);
const storage = webStorage();
let settings: Settings = loadSettings(storage);
let locale: Locale = "en";
let t: ShellText = translator(TEXTS, locale);
let running: GameInstance | undefined;
let bus: AudioBus | undefined;
let view: AbortController | undefined;
/** Zählt Routenwechsel; ein langsamer Spielstart nach einem Wechsel wird verworfen. */
let generation = 0;

function applyLocale(): void {
  locale = resolveLocale(settings.language, navigator.languages ?? [navigator.language]);
  t = translator(TEXTS, locale);
  document.documentElement.lang = locale;
}

function applyVolume(): void {
  for (const ch of ["master", "music", "sfx"] as const) bus?.setVolume(ch, settings.volume[ch]);
}

function updateSettings(patch: Partial<Settings>): void {
  const languageChanged = patch.language !== undefined && patch.language !== settings.language;
  settings = { ...settings, ...patch };
  saveSettings(storage, settings);
  applyVolume();
  if (languageChanged) {
    applyLocale();
    void route().then(() => document.getElementById("language")?.focus());
  }
}

/**
 * Ein AudioContext für die ganze Sitzung, erzeugt beim ersten Spielstart.
 * Browser halten ihn bis zur ersten Nutzergeste an; jede Taste oder jeder
 * Klick setzt ihn fort. `?nosound` startet ohne Ton.
 */
function audioHost(params: Readonly<Record<string, string>>): AudioHost | undefined {
  if ("nosound" in params || typeof AudioContext === "undefined") return undefined;
  if (!bus) {
    const b = new AudioBus(new AudioContext({ latencyHint: "interactive" }));
    const resume = () => void b.resume();
    window.addEventListener("keydown", resume);
    window.addEventListener("pointerdown", resume);
    window.addEventListener("gamepadconnected", resume);
    resume();
    bus = b;
    applyVolume();
  }
  return {
    context: bus.context,
    music: bus.music,
    sfx: bus.sfx,
    moduleWorkletUrl: `${import.meta.env.BASE_URL}vendor/chiptune3/chiptune3.worklet.js`,
  };
}

/** Tastatur plus Pad; das Pad lässt sich in den Einstellungen abschalten. */
function keysFor(module: GameModule): KeyState {
  if (!module.gamepad || !navigator.getGamepads) return keyboard;
  const pad = createPadState(
    () => navigator.getGamepads(),
    () => performance.now(),
    module.gamepad,
  );
  return { isDown: (code) => keyboard.isDown(code) || (settings.gamepad && pad.isDown(code)) };
}

function showPage(page: HTMLElement, signal: AbortSignal): void {
  screen.replaceChildren(page);
  startPadNavigation(
    page,
    () => settings.gamepad,
    () => (location.hash = "#/"),
    signal,
  );
}

async function startGame(
  id: string,
  params: Readonly<Record<string, string>>,
  gen: number,
): Promise<void> {
  const game = GAMES[id];
  if (!game) return;
  const label = h("p", {}, t("loading", { title: game.title, loaded: "0", total: "…" }));
  const bar = h("progress", { max: "1", value: "0" });
  screen.replaceChildren(h("div", { id: "loading" }, label, bar));
  document.title = `${game.title} — amigo-clove`;
  try {
    const assets = await AssetStore.load(`${import.meta.env.BASE_URL}${id}/manifest.json`, (u) =>
      fetch(u),
    );
    const module = await game.load();
    await assets.preload(module.preload ?? [], (loaded, total) => {
      label.textContent = t("loading", {
        title: game.title,
        loaded: mb(loaded, locale),
        total: mb(total, locale),
      });
      bar.value = total ? loaded / total : 1;
    });
    if (gen !== generation) return;
    const canvas = document.createElement("canvas");
    screen.replaceChildren(canvas);
    const audio = audioHost(params);
    const instance = await module.boot(
      {
        canvas,
        assets,
        keys: keysFor(module),
        locale,
        now: () => performance.now(),
        storage: storageFor(storage, id),
        exit: () => {
          location.hash = "#/";
        },
        ...(audio ? { audio } : {}),
      },
      params,
    );
    if (gen !== generation) {
      instance.dispose();
      return;
    }
    running = instance;
    document.body.dataset["game"] = id;
  } catch (err) {
    if (gen !== generation) return;
    document.body.dataset["game"] = "error";
    console.error(err);
    screen.replaceChildren(
      h(
        "div",
        { id: "launcher" },
        h("p", {}, t("loadFailed", { title: game.title })),
        h("a", { class: "button secondary", href: "#/" }, t("back")),
      ),
    );
    errorBox.textContent = String(err instanceof Error ? (err.stack ?? err.message) : err);
  }
}

async function route(): Promise<void> {
  const gen = ++generation;
  running?.dispose();
  running = undefined;
  view?.abort();
  view = new AbortController();
  delete document.body.dataset["game"];
  errorBox.textContent = "";
  const r = parseRoute(location.hash, new Set(Object.keys(GAMES)));
  document.body.dataset["view"] = r.view;
  document.title = "amigo-clove";
  switch (r.view) {
    case "launcher":
      showPage(
        launcherView(t, [
          ...Object.entries(GAMES).map(([id, g]) => ({
            id,
            title: g.title,
            subtitle: t(g.subtitle),
            available: true,
          })),
          { id: "dovez", title: "DoveZ", subtitle: t("dovezSub"), available: false },
        ]),
        view.signal,
      );
      return;
    case "settings":
      document.title = `${t("settings")} — amigo-clove`;
      showPage(
        settingsView({
          t,
          locale,
          settings: () => settings,
          update: updateSettings,
          signal: view.signal,
          games: Object.entries(GAMES).map(([id, g]) => ({ id, title: g.title })),
        }),
        view.signal,
      );
      return;
    case "unknown":
      showPage(
        h(
          "div",
          { id: "launcher" },
          h("p", {}, t("notFound", { path: r.path })),
          h("a", { class: "button secondary", href: "#/" }, t("back")),
        ),
        view.signal,
      );
      return;
    case "game":
      await startGame(r.id, r.params, gen);
  }
}

applyLocale();
window.addEventListener("hashchange", () => void route());
void registerServiceWorker();
void route();
