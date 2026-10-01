import type { GameHost, GameInstance, GameModule } from "@clove/core";
import { DOVEZ_GAMEPAD, DOVEZ_PADS } from "./controls";
import { bootAssetViewer } from "./debug/AssetViewer";
import { bootLevelViewer } from "./debug/LevelViewer";
import { bootGame } from "./game/Game";

/**
 * DoveZ als `GameModule`. M8 im Aufbau: `#/dovez` zeigt Logos, Intro und das
 * Hauptmenü, daraus die Kampagne aus `Play.txt` (Ladebild, Level,
 * Speicherbildschirm, Videos, Outro, Abspann, Epilog), Bonuslevel und
 * Spielstände. Nur Level, Logos und Osterei zeichnet das Spiel im Canvas; alles
 * andere sind HTML-Bildschirme der Shell (`GameHost.ui`). URL-Optionen: `nointro=1` gleich ins Menü; ohne Menü
 * `level=<slug>` ein einzelnes Level, `step=<n>` Kampagne ab Anweisung n,
 * `load=<1…21>` Spielstand; `video=0` ohne Videos,
 * `from=<Tick>` wie die Kommandozeile `-Tick N` des Originals (erstes Level),
 * `ship=0|1|2` (2: Debug-Schiff mit Drohnen, im Original nur per Kommandozeile/
 * Debug-Dialog), `players=1|2`, `invincible=1`, `lang=de|en|ru` (Sprache
 * erzwingen; sonst die Locale des Hosts: `de`, `ru`, sonst Englisch). Esc/Fokusverlust: Pause; ohne
 * Leben: Continue. Sichtprüfung `screen=continue|pause|save|credits|love` (es wird
 * nichts gespeichert).
 * Debug-Ansichten: `#/dovez/debug/assets`, `#/dovez/debug/level`.
 */
const dovez: GameModule = {
  id: "dovez",
  title: "DoveZ",
  preload: ["core"],
  gamepad: DOVEZ_GAMEPAD,
  pads: DOVEZ_PADS,
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
      ship: options["ship"] === "2" ? 2 : options["ship"] === "1" ? 1 : 0,
      invincible: options["invincible"] === "1",
      players: options["players"] === "2" ? 2 : 1,
      step: num("step"),
      load: num("load"),
      lang: options["lang"] || undefined,
      videos: options["video"] !== "0",
      intro: options["nointro"] !== "1",
      screen:
        screen === "continue" ||
        screen === "pause" ||
        screen === "save" ||
        screen === "credits" ||
        screen === "love"
          ? screen
          : undefined,
    });
  },
};

export default dovez;
