import { AssetStore, type GameInstance, type GameModule } from "@clove/core";
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

function showLauncher(): void {
  screen.innerHTML = `<div id="launcher"><h1>amigo-clove</h1><ul>${Object.entries(GAMES)
    .map(([id, g]) => `<li><a href="#/${id}">${g.title}</a></li>`)
    .join("")}</ul></div>`;
}

async function route(): Promise<void> {
  running?.dispose();
  running = undefined;
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
    running = await module.boot(
      { canvas, assets, keys, locale: navigator.language, now: () => performance.now() },
      Object.fromEntries(new URLSearchParams(query)),
    );
  } catch (err) {
    console.error(err);
    errorBox.textContent = String(err instanceof Error ? (err.stack ?? err.message) : err);
  }
}

window.addEventListener("hashchange", () => void route());
void route();
