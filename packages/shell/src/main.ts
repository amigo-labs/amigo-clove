import { AudioBus } from "@clove/audio";
import {
  AssetStore,
  bindKeys,
  navigationKeys,
  resolveBindings,
  resolveLocale,
  translator,
  withExtraKeys,
  type AudioHost,
  type ControlsSheet,
  type GameInstance,
  type GameModule,
  type GameUi,
  type GamepadBindings,
  type KeyBindings,
  type KeyLayout,
  type KeyState,
  type Locale,
  type PadLayout,
  type StoredBindings,
} from "@clove/core";
import { DOVE_CONTROLS, DOVE_GAMEPAD } from "@clove/game-dove/controls";
import { KEY_LAYOUT as DOVE_KEYS } from "@clove/game-dove/keys";
import { DOVEZ_GAMEPAD, DOVEZ_PADS, dovezAllControls } from "@clove/game-dovez/controls";
import { KEY_LAYOUT as DOVEZ_KEYS, legacyExtraKeys } from "@clove/game-dovez/keys";
import { controlsElement, controlsTables } from "./controls";
import { h } from "./dom";
import { NAV_BINDINGS, createPadState, padKeys } from "./gamepad";
import { HudView } from "./hud";
import { createKeyState } from "./keys";
import { DISPLAY_EVENT, createStage, toggleFullscreen, type Stage } from "./overlay";
import { registerServiceWorker } from "./offline";
import { runPage, type PageContext } from "./pages/context";
import { keyLabel } from "./pages/keys";
import { settingsMenu, settingsPage } from "./pages/settingsMenu";
import { createPointerState } from "./pointer";
import { createTouchKeys } from "./touchKeys";
import { parseRoute } from "./router";
import { loadSettings, reducedMotion, saveSettings, type Settings } from "./settings";
import { storageFor, webStorage } from "./storage";
import { TEXTS, type ShellText, type TextKey } from "./texts";
import { launcherMenu } from "./views/launcher";
import { NAV_CODES, gateKeys, type NavAction } from "./ui/model";
import { UiHost } from "./ui/UiHost";

/**
 * Launcher. Hash-Routing: `#/` Spielauswahl, `#/settings` Einstellungen,
 * `#/dove?level=1` startet DOVE (URL-Optionen siehe `@clove/game-dove`).
 * Die Shell besitzt Canvas, AudioContext, Speicher, Eingabegeräte und Sprache.
 */
interface DebugLink {
  readonly path: string;
  readonly label: TextKey;
}

interface GameInfo {
  readonly title: string;
  readonly subtitle: TextKey;
  /** Im Launcher startbar und offline installierbar. */
  readonly playable: boolean;
  /** Debug-Ansichten (Unterpfad und Beschriftung), im Launcher verlinkt. */
  readonly debug?: readonly DebugLink[];
  /** Aktionen und Vorlagen der Tastenbelegung (Einstellungen und Optionen des Spiels). */
  readonly keys?: KeyLayout;
  /** Tastenübersicht im Launcher, mit der Pad-Belegung des Spiels (ohne es zu laden). */
  readonly controls?: {
    readonly sheet: ControlsSheet;
    readonly gamepad: GamepadBindings;
    readonly pads?: readonly (PadLayout | undefined)[];
  };
  load(): Promise<GameModule>;
}

const GAMES: Readonly<Record<string, GameInfo>> = {
  dove: {
    title: "DOVE",
    subtitle: "doveSub",
    playable: true,
    keys: DOVE_KEYS,
    controls: { sheet: DOVE_CONTROLS, gamepad: DOVE_GAMEPAD },
    load: async () => (await import("@clove/game-dove")).default,
  },
  dovez: {
    title: "DoveZ",
    subtitle: "dovezSub",
    playable: true,
    debug: [
      { path: "debug/assets", label: "debugAssets" },
      { path: "debug/level", label: "debugLevel" },
    ],
    keys: DOVEZ_KEYS,
    controls: { sheet: dovezAllControls(), gamepad: DOVEZ_GAMEPAD, pads: DOVEZ_PADS },
    load: async () => (await import("@clove/game-dovez")).default,
  },
};

const screen = document.getElementById("screen") as HTMLDivElement;
const errorBox = document.getElementById("error") as HTMLDivElement;
const keyboard = createKeyState(window);
/** Systemwunsch nach weniger Bewegung (`prefers-reduced-motion`). */
const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const storage = webStorage();
const LAYOUTS: Readonly<Record<string, KeyLayout>> = Object.fromEntries(
  Object.entries(GAMES).flatMap(([id, g]) => (g.keys ? [[id, g.keys]] : [])),
);
let settings: Settings = migrateDovezKeys(loadSettings(storage, LAYOUTS));
let locale: Locale = "en";
let t: ShellText = translator(TEXTS, locale);
let running: GameInstance | undefined;
let stage: Stage | undefined;
let bus: AudioBus | undefined;
let view: AbortController | undefined;
/** Zählt Routenwechsel; ein langsamer Spielstart nach einem Wechsel wird verworfen. */
let generation = 0;

/**
 * Die alte Tastenkonfiguration von DoveZ (zweite Tasten im Spiel) wird einmalig
 * zur Belegung der Shell: Original plus diese Tasten.
 */
function migrateDovezKeys(s: Settings): Settings {
  if (s.keybindings["dovez"]) return s;
  let keys: unknown;
  try {
    keys = (
      JSON.parse(storage?.getItem("clove:dovez:config") ?? "null") as { keys?: unknown } | null
    )?.keys;
  } catch {
    return s;
  }
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) return s;
  const stored = withExtraKeys(DOVEZ_KEYS, legacyExtraKeys(keys));
  if (!stored) return s;
  const next = { ...s, keybindings: { ...s.keybindings, dovez: stored } };
  saveSettings(storage, next);
  return next;
}

/** Belegung je Spiel; dieselbe Instanz, solange sich die Einstellung nicht ändert. */
const resolved = new Map<string, { from: StoredBindings | undefined; keys: KeyBindings }>();
function bindingsFor(id: string): KeyBindings | undefined {
  const layout = GAMES[id]?.keys;
  if (!layout) return undefined;
  const from = settings.keybindings[id];
  const hit = resolved.get(id);
  if (hit && hit.from === from) return hit.keys;
  const keys = resolveBindings(layout, from);
  resolved.set(id, { from, keys });
  return keys;
}

/** Navigationstasten der HTML-Bildschirme aus der Belegung (WASD, Feuer bestätigt). */
const navCache = new Map<string, { from: KeyBindings; nav: ReadonlyMap<string, NavAction> }>();
function navKeysFor(id: string): ReadonlyMap<string, NavAction> {
  const keys = bindingsFor(id);
  const layout = GAMES[id]?.keys;
  if (!keys || !layout) return new Map();
  const hit = navCache.get(id);
  if (hit?.from === keys) return hit.nav;
  const nav = navigationKeys(layout.actions, keys);
  navCache.set(id, { from: keys, nav });
  return nav;
}

function applyLocale(): void {
  locale = resolveLocale(settings.language, navigator.languages ?? [navigator.language]);
  t = translator(TEXTS, locale);
  document.documentElement.lang = locale;
}

function applyVolume(): void {
  for (const ch of ["master", "music", "sfx", "voice"] as const)
    bus?.setVolume(ch, settings.volume[ch]);
}

function updateSettings(patch: Partial<Settings>): void {
  const languageChanged = patch.language !== undefined && patch.language !== settings.language;
  settings = { ...settings, ...patch };
  saveSettings(storage, settings);
  applyVolume();
  window.dispatchEvent(new Event(DISPLAY_EVENT));
  if (languageChanged) {
    applyLocale();
    void route();
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
    voice: bus.voice,
    moduleWorkletUrl: `${import.meta.env.BASE_URL}vendor/chiptune3/chiptune3.worklet.js`,
  };
}

/** Pads mit Vibrationsmotor in der Reihenfolge, in der der Browser sie meldet. */
function rumblePads(): Gamepad[] {
  if (!settings.gamepad) return [];
  return [...(navigator.getGamepads?.() ?? [])].filter(
    (p): p is Gamepad => p !== null && p.mapping === "standard" && p.vibrationActuator != null,
  );
}

/** Kurze Motorimpulse, jeden Tick erneuert: 0 beendet, sonst starker Motor voll, schwacher zu 60 %. */
function rumble(pad: number, magnitude: number): void {
  const actuator = rumblePads()[pad]?.vibrationActuator;
  if (!actuator) return;
  if (magnitude <= 0) {
    void actuator.reset().catch(() => undefined);
    return;
  }
  const m = Math.min(1, magnitude);
  void actuator
    .playEffect("dual-rumble", {
      startDelay: 0,
      duration: 48,
      strongMagnitude: m,
      weakMagnitude: 0.6 * m,
    })
    .catch(() => undefined);
}

/** Tastenübersicht eines Spiels als HTML nach den aktuellen Einstellungen. */
function controlsFor(
  sheet: ControlsSheet,
  id: string,
  gamepad: GamepadBindings | undefined,
  pads: readonly (PadLayout | undefined)[] | undefined,
): HTMLElement {
  return controlsElement(
    controlsTables(sheet, {
      t,
      locale,
      gamepad,
      pads,
      bindings: bindingsFor(id),
      showPad: settings.gamepad,
      showPointer: settings.pointer,
    }),
    t,
  );
}

/** Gehaltene Tastaturtasten für die Tastenaufnahme (ohne Pad und Touch). */
const held = () => keyboard.held?.() ?? [];

/**
 * Tastatur (mit der Tastenbelegung der Einstellungen) plus Pad (abschaltbar)
 * plus Touch-Tasten. Pad und Touch speisen die Codes des Spiels direkt ein,
 * an der Belegung vorbei.
 */
function keysFor(id: string, module: GameModule, touch: KeyState): KeyState {
  const layout = GAMES[id]?.keys;
  const kb = layout ? bindKeys(keyboard, layout.actions, () => bindingsFor(id) ?? {}) : keyboard;
  if (!module.gamepad || !navigator.getGamepads)
    return { isDown: (code) => kb.isDown(code) || touch.isDown(code), held };
  const pad = createPadState(
    () => navigator.getGamepads(),
    () => performance.now(),
    module.gamepad,
    4,
    module.pads,
  );
  // aufgenommen werden nur Tastaturtasten: das Pad zeigt der Aufnahme keine Stick-Ausschläge
  return {
    isDown: (code) =>
      kb.isDown(code) || touch.isDown(code) || (settings.gamepad && pad.isDown(code)),
    held,
  };
}

/** Pad (Navigationsbelegung) und Touch-Tasten für die HTML-Bildschirme. */
function polledNav(touch?: KeyState): () => ReadonlySet<string> {
  const navCodes = Object.keys(NAV_CODES);
  return () => {
    const down = settings.gamepad
      ? padKeys(navigator.getGamepads?.() ?? [], NAV_BINDINGS)
      : new Set<string>();
    if (touch) for (const c of navCodes) if (touch.isDown(c)) down.add(c);
    return down;
  };
}

/**
 * Eine Seite der Shell (Launcher, Einstellungen, Laden, Fehler) aus denselben
 * HTML-Bausteinen wie die Spielbildschirme; `game` setzt dessen Akzent.
 */
function showPage(signal: AbortSignal, game?: string): UiHost {
  const root = h("div", { class: "page", ...(game ? { "data-game": game } : {}) });
  screen.replaceChildren(root);
  const ui = new UiHost({
    mount: root,
    frame: root,
    polled: polledNav(),
    controls: (sheet, id) => {
      const g = id ? GAMES[id] : undefined;
      return controlsFor(sheet, id ?? "", g?.controls?.gamepad, g?.controls?.pads);
    },
    ...(game ? { navKeys: () => navKeysFor(game) } : {}),
  });
  signal.addEventListener("abort", () => ui.dispose());
  return ui;
}

/** Kontext der Einstellungsseiten (unter `#/settings` und aus den Spielen). */
function pageContext(signal: AbortSignal | undefined): PageContext {
  return {
    t: () => t,
    locale: () => locale,
    settings: () => settings,
    update: updateSettings,
    games: Object.entries(GAMES)
      .filter(([, g]) => g.playable)
      .map(([id, g]) => ({ id, title: g.title, ...(g.keys ? { keys: g.keys } : {}) })),
    signal,
  };
}

/** Meldung mit Zurück zum Launcher. */
async function messagePage(text: string, signal: AbortSignal, game?: string): Promise<void> {
  const ui = showPage(signal, game);
  const r = await ui.show(
    {
      kind: "menu",
      title: "amigo-clove",
      blocks: [{ kind: "lines", lines: [text], tone: "accent" }],
      items: [{ id: "back", label: t("back") }],
      back: "back",
    },
    signal,
  );
  if (r.id === "back") location.hash = "#/";
}

/** Zuletzt gewählter Eintrag im Launcher bzw. in den Einstellungen (Vorwahl beim Zurückkehren). */
let launcherChoice: string | undefined;
let settingsChoice: string | undefined;

async function startGame(
  id: string,
  params: Readonly<Record<string, string>>,
  gen: number,
): Promise<void> {
  const game = GAMES[id];
  if (!game) return;
  document.title = `${game.title} — amigo-clove`;
  document.body.dataset["loading"] = id;
  const loading = new AbortController();
  const loadingUi = showPage(loading.signal, id);
  let fraction = 0;
  void loadingUi.show(
    {
      kind: "notice",
      title: game.title,
      lines: [t("loadingBar")],
      progress: () => fraction,
      until: "progress",
    },
    loading.signal,
  );
  try {
    const assets = await AssetStore.load(`${import.meta.env.BASE_URL}${id}/manifest.json`, (u) =>
      fetch(u),
    );
    const module = await game.load();
    await assets.preload(module.preload ?? [], (loaded, total) => {
      // ganz voll erst mit dem Spiel: „progress“ schlösse den Hinweis sonst vorher
      fraction = total ? Math.min(0.999, loaded / total) : 0;
    });
    loading.abort();
    if (gen !== generation) return;
    const canvas = document.createElement("canvas");
    // Das Spiel zeichnet nur auf den Canvas: Name und Bedienung für Screenreader
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", t("gameCanvas", { title: game.title }));
    const s = createStage(canvas, { t, scanlines: () => settings.scanlines });
    stage = s;
    s.root.dataset["game"] = id;
    screen.replaceChildren(s.root);
    const pointer = createPointerState(canvas, s.root);
    const touch = createTouchKeys(s.root, s.layer, t);
    s.onDispose(() => {
      pointer.dispose();
      touch.dispose();
    });
    const audio = audioHost(params);
    const ui = new UiHost({
      mount: s.layer,
      frame: s.root,
      audio,
      // Pad (Navigationsbelegung) und Touch-Tasten; die Tastatur liest der UiHost selbst
      polled: polledNav(touch),
      controls: (sheet, other) =>
        other && other !== id
          ? controlsFor(sheet, other, GAMES[other]?.controls?.gamepad, GAMES[other]?.controls?.pads)
          : controlsFor(sheet, id, module.gamepad, module.pads),
      navKeys: () => navKeysFor(id),
    });
    s.onDispose(() => ui.dispose());
    const pages = pageContext(undefined);
    const gameUi: GameUi = {
      show: (screen2, signal) => ui.show(screen2, signal),
      brand: (b) => ui.brand(b),
      caption: (text) => ui.caption(text),
      settings: (page, signal) =>
        runPage(() =>
          settingsPage(
            ui,
            { ...pages, signal },
            page,
            pages.games.find((g) => g.id === id),
          ),
        ),
    };
    const instance = await module.boot(
      {
        canvas,
        assets,
        ui: gameUi,
        boundKeys: (action) =>
          (bindingsFor(id)?.[action] ?? []).map((code) => ({ code, name: keyLabel(t, code) })),
        keys: gateKeys(keysFor(id, module, touch), () => ui.state()),
        locale,
        rumble,
        rumblePads: () => rumblePads().length,
        scaleMode: () => settings.scale,
        hudMode: () => settings.hud,
        // über HTML-Bildschirmen klickt der Zeiger Knöpfe, nicht ins Spiel
        get pointer() {
          return settings.pointer && !ui.state().open ? pointer : undefined;
        },
        // folgt der Einstellung auch während des Spiels
        get reducedMotion() {
          return reducedMotion(settings.motion, motionQuery?.matches ?? false);
        },
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
    if (instance.hud) {
      const hud = instance.hud.bind(instance);
      const hudView = new HudView(s, t, hud, () => settings.hud === "modern");
      s.onDispose(() => hudView.dispose());
    }
    document.body.dataset["game"] = id;
  } catch (err) {
    loading.abort();
    if (gen !== generation) return;
    document.body.dataset["game"] = "error";
    console.error(err);
    errorBox.textContent = String(err instanceof Error ? (err.stack ?? err.message) : err);
    if (view) void messagePage(t("loadFailed", { title: game.title }), view.signal, id);
  } finally {
    delete document.body.dataset["loading"];
  }
}

async function route(): Promise<void> {
  const gen = ++generation;
  running?.dispose();
  running = undefined;
  stage?.dispose();
  stage = undefined;
  view?.abort();
  view = new AbortController();
  delete document.body.dataset["game"];
  errorBox.textContent = "";
  const r = parseRoute(location.hash, new Set(Object.keys(GAMES)));
  document.body.dataset["view"] = r.view;
  document.title = "amigo-clove";
  const signal = view.signal;
  switch (r.view) {
    case "launcher": {
      const ui = showPage(signal);
      const target = await launcherMenu(
        ui,
        t,
        Object.entries(GAMES).map(([id, g]) => ({
          id,
          title: g.title,
          subtitle: t(g.subtitle),
          available: g.playable,
          ...(g.controls ? { controls: g.controls.sheet } : {}),
          ...(g.debug ? { debug: g.debug.map((d) => ({ path: d.path, label: t(d.label) })) } : {}),
        })),
        signal,
        launcherChoice,
      );
      if (target && !signal.aborted) {
        launcherChoice = target;
        location.hash = target;
      }
      return;
    }
    case "settings": {
      document.title = `${t("settings")} — amigo-clove`;
      const ui = showPage(signal);
      await runPage(() =>
        settingsMenu(
          ui,
          pageContext(signal),
          settingsChoice,
          (choice) => (settingsChoice = choice),
        ),
      );
      if (!signal.aborted) location.hash = "#/";
      return;
    }
    case "unknown":
      await messagePage(t("notFound", { path: r.path }), signal);
      return;
    case "game":
      await startGame(r.id, r.sub ? { ...r.params, view: r.sub } : r.params, gen);
  }
}

applyLocale();
window.addEventListener("hashchange", () => void route());
// Alt+Enter wie in Windows-Spielen: F11 ist in DoveZ die Hupe, F/G sind in DOVE belegt
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && e.altKey && !e.repeat) {
    e.preventDefault();
    toggleFullscreen();
  }
});
void registerServiceWorker();
void route();
