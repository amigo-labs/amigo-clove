import type { GameHost, GameInstance, GameModule } from "@clove/core";
import { VIEW_HEIGHT, VIEW_WIDTH, bootAssetViewer } from "./debug/AssetViewer";

/**
 * DoveZ als `GameModule`. Die Engine folgt ab M8; bis dahin gibt es nur die
 * Debug-Ansicht der Assets (`view=debug/assets`, Shell-Route
 * `#/dovez/debug/assets`) und einen Hinweis.
 */
const dovez: GameModule = {
  id: "dovez",
  title: "DoveZ",
  async boot(host: GameHost, options = {}): Promise<GameInstance> {
    if (options["view"] === "debug/assets") return bootAssetViewer(host);
    const canvas = host.canvas;
    canvas.width = VIEW_WIDTH;
    canvas.height = VIEW_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      ctx.fillStyle = "#fc6";
      ctx.font = "16px monospace";
      const german = host.locale.startsWith("de");
      ctx.fillText(
        german ? "DoveZ ist noch nicht spielbar." : "DoveZ is not playable yet.",
        40,
        60,
      );
      ctx.fillStyle = "#999";
      ctx.fillText("#/dovez/debug/assets", 40, 90);
    }
    return { dispose() {} };
  },
};

export default dovez;
