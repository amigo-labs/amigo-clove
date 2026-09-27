import type { GameHost, GameInstance, GameModule } from "@clove/core";
import { bootAssetViewer } from "./debug/AssetViewer";
import { bootLevelViewer } from "./debug/LevelViewer";
import { bootGame } from "./game/Game";

/**
 * DoveZ als `GameModule`. M8 im Aufbau: `#/dovez` spielt ein Level
 * (URL-Optionen `level=<slug>` Vorgabe `level1-1_skyfight`, `from=<Tick>` wie
 * die Kommandozeile `-Tick N` des Originals, `ship=0|1`, `invincible=1`).
 * Debug-Ansichten: `#/dovez/debug/assets`, `#/dovez/debug/level`.
 */
const dovez: GameModule = {
  id: "dovez",
  title: "DoveZ",
  preload: ["core"],
  // A Feuer, B Beam, X Wechsel, Y Drehen, Schultertasten Force/Beam-Modus und Nova, Start Pause
  gamepad: {
    0: ["KeyS"],
    1: ["KeyA"],
    2: ["KeyD"],
    3: ["KeyW"],
    4: ["KeyQ"],
    5: ["KeyE"],
    9: ["Escape"],
  },
  async boot(host: GameHost, options = {}): Promise<GameInstance> {
    if (options["view"] === "debug/assets") return bootAssetViewer(host);
    if (options["view"] === "debug/level") return bootLevelViewer(host);
    return bootGame(host, {
      level: options["level"] ?? "level1-1_skyfight",
      from: Number(options["from"] ?? 0),
      ship: options["ship"] === "1" ? 1 : 0,
      invincible: options["invincible"] === "1",
    });
  },
};

export default dovez;
