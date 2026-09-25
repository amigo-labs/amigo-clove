import type { GameHost, GameInstance, GameModule } from "@clove/core";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import { Sprite } from "pixi.js";

export const SCREEN_WIDTH = 640;
export const SCREEN_HEIGHT = 480;

/**
 * DOVE als `GameModule`. Stand M3 (a): lädt das Level-Bundle und zeigt den
 * Hintergrund. Simulation, Terrain, Spieler und Gegner folgen.
 */
const dove: GameModule = {
  id: "dove",
  title: "DOVE",
  async boot(host: GameHost, options = {}): Promise<GameInstance> {
    const levelNo = Number(options["level"] ?? 1);
    const app = await createScreen({
      canvas: host.canvas,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
    const textures = new TextureRegistry(host.assets);
    const level = await host.assets.json<{ background: string }>(`level/level${levelNo}`);
    const backgroundId = `image/${level.background.toLowerCase()}`;
    await textures.load([backgroundId]);
    app.stage.addChild(new Sprite(textures.get(backgroundId)));
    app.render();
    return {
      dispose() {
        app.destroy({ removeView: false }, { children: true });
        textures.destroy();
      },
    };
  },
};

export default dove;
