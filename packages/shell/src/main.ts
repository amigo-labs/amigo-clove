import { AudioBus } from "@clove/audio";
import { AssetStore, type AudioHost, type GameInstance, type GameModule } from "@clove/core";
import { createKeyState } from "./keys";

/**
 * Launcher (M3: minimal). Hash-Routing: `#/` Auswahl, `#/dove?level=1` startet DOVE.
 * Menü, Settings, Save-Export und Service Worker folgen in M5.
 */
const GAMES: Record<string, { title: string; load: () => Promise<GameModule> }> = {
  dove: { title: "DOVE", load: async () => (await import("@clove/game-dove")).default },
};

const screen = document.getElementById("screen") as HTMLDivElement;
const errorBox = document.getElementById("error") as HTMLDivElement;
const keys = createKeyState(window);
let running: GameInstance | undefined;
let bus: AudioBus | undefined;

/**
 * Ein AudioContext für die ganze Sitzung, erzeugt beim ersten Spielstart.
 * Browser halten ihn bis zur ersten Nutzergeste an; jede Taste oder jeder
 * Klick setzt ihn fort. `?nosound` startet ohne Ton.
 */
function audioHost(query: URLSearchParams): AudioHost | undefined {
  if (query.has("nosound") || typeof AudioContext === "undefined") return undefined;
  if (!bus) {
    const b = new AudioBus(new AudioContext({ latencyHint: "interactive" }));
    const resume = () => void b.resume();
    window.addEventListener("keydown", resume);
    window.addEventListener("pointerdown", resume);
    resume();
    bus = b;
  }
  const b = bus;
  return {
    context: b.context,
    music: b.music,
    sfx: b.sfx,
    moduleWorkletUrl: `${import.meta.env.BASE_URL}vendor/chiptune3/chiptune3.worklet.js`,
  };
}

function showLauncher(): void {
  screen.innerHTML = `<div id="launcher"><h1>amigo-clove</h1><ul>${Object.entries(GAMES)
    .map(([id, g]) => `<li><a href="#/${id}">${g.title}</a></li>`)
    .join("")}</ul></div>`;
}

async function route(): Promise<void> {
  running?.dispose();
  running = undefined;
  delete document.body.dataset["game"];
  errorBox.textContent = "";
  const [path = "", query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const game = GAMES[path];
  if (!game) {
    showLauncher();
    return;
  }
  screen.innerHTML = "";
  const canvas = document.createElement("canvas");
  screen.append(canvas);
  try {
    const assets = await AssetStore.load(`${import.meta.env.BASE_URL}${path}/manifest.json`, (u) =>
      fetch(u),
    );
    const module = await game.load();
    const params = new URLSearchParams(query);
    const audio = audioHost(params);
    running = await module.boot(
      {
        canvas,
        assets,
        keys,
        locale: navigator.language,
        now: () => performance.now(),
        ...(audio ? { audio } : {}),
      },
      Object.fromEntries(params),
    );
    document.body.dataset["game"] = path;
  } catch (err) {
    document.body.dataset["game"] = "error";
    console.error(err);
    errorBox.textContent = String(err instanceof Error ? (err.stack ?? err.message) : err);
  }
}

window.addEventListener("hashchange", () => void route());
void route();
