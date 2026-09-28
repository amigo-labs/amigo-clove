import type { GameHost, GameInstance, GameModule } from "@clove/core";
import { bootAssetViewer } from "./debug/AssetViewer";
import { bootLevelViewer } from "./debug/LevelViewer";
import { bootGame } from "./game/Game";

/**
 * DoveZ als `GameModule`. M8 im Aufbau: `#/dovez` zeigt Logos, Intro und das
 * Hauptmenü, daraus die Kampagne aus `Play.txt` (Ladebild, Level,
 * Speicherbildschirm, Videos, Outro, Abspann, Epilog), Bonuslevel und
 * Spielstände. URL-Optionen: `nointro=1` gleich ins Menü; ohne Menü
 * `level=<slug>` ein einzelnes Level, `step=<n>` Kampagne ab Anweisung n,
 * `load=<1…21>` Spielstand; `video=0` ohne Videos,
 * `from=<Tick>` wie die Kommandozeile `-Tick N` des Originals (erstes Level),
 * `ship=0|1`, `players=1|2`, `invincible=1`. Esc/Fokusverlust: Pause; ohne
 * Leben: Continue. Sichtprüfung `screen=continue|pause|save|credits` (es wird
 * nichts gespeichert).
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
    const num = (k: string) => {
      const v = options[k];
      return v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
    };
    const screen = options["screen"];
    return bootGame(host, {
      level: options["level"] || undefined,
      from: num("from") ?? 0,
      ship: options["ship"] === "1" ? 1 : 0,
      invincible: options["invincible"] === "1",
      players: options["players"] === "2" ? 2 : 1,
      step: num("step"),
      load: num("load"),
      videos: options["video"] !== "0",
      intro: options["nointro"] !== "1",
      screen:
        screen === "continue" || screen === "pause" || screen === "save" || screen === "credits"
          ? screen
          : undefined,
    });
  },
};

export default dovez;
