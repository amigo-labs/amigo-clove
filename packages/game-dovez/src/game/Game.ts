import { FixedStepLoop, type AtlasJson, type GameHost, type GameInstance } from "@clove/core";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import { loadLevelPack } from "../data/LevelPack";
import { Renderer } from "../render/Renderer";
import { NO_INPUT, type PlayerInput } from "../sim/player";
import type { SpriteSource } from "../sim/surfaces";
import { TICK_MS, World } from "../sim/world";

/**
 * Ein DoveZ-Level spielen (M8, erster Schnitt): Skript, Atlanten und
 * Konturen laden, Welt im 16-ms-Takt simulieren, zeichnen. Noch ohne
 * Kampagne und Continue-Bildschirm.
 */

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

/** Standardbelegung Spieler 1 (Ein-Spieler-Konfiguration aus `InitKeyConfig`). */
export function readInput(host: GameHost): PlayerInput {
  const k = (c: string) => host.keys.isDown(c);
  return {
    left: k("ArrowLeft"),
    up: k("ArrowUp"),
    right: k("ArrowRight"),
    down: k("ArrowDown"),
    fire: k("KeyS") || k("Space"),
    beam: k("KeyA"),
    switchWeapon: k("KeyD"),
    switchBeam: k("KeyQ"),
    rotate: k("KeyW"),
    nova: k("KeyE"),
  };
}

export interface GameOptions {
  readonly level: string;
  readonly from: number;
  readonly ship: 0 | 1;
  readonly invincible: boolean;
}

export async function bootGame(host: GameHost, opts: GameOptions): Promise<GameInstance> {
  const app = await createScreen({
    canvas: host.canvas,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  });
  const textures = new TextureRegistry(host.assets);
  const pack = await loadLevelPack(host.assets, opts.level);
  const globals = await Promise.all(
    ["atlas/spiel", "atlas/standart"].map((id) => host.assets.json<AtlasJson>(id)),
  );
  const atlases = [{ json: pack.atlas }, ...globals.map((json) => ({ json }))];
  await textures.load(Renderer.pageIds(atlases));
  const sprites: SpriteSource = {
    size: (key) => pack.atlas.sprites[key],
    contour: (key) => {
      const o = pack.atlas.contours[key];
      if (o === undefined) return undefined;
      const h = pack.contours[o + 1] as number;
      return pack.contours.subarray(o, o + 4 + h * 2);
    },
  };
  const world = new World(pack.level, sprites, { startTick: opts.from, ship: opts.ship });
  const renderer = new Renderer(textures, world, atlases);
  app.stage.addChild(renderer.root);
  const loop = new FixedStepLoop(TICK_MS);
  let over = false;

  const frame = () => {
    if (host.keys.isDown("Escape")) {
      host.exit();
      return;
    }
    const n = loop.frame(host.now());
    for (let i = 0; i < n && !over; i++) {
      const input = readInput(host);
      if (opts.invincible)
        for (const p of world.players) p.invulnerable = Math.max(p.invulnerable, 2);
      world.step([input, NO_INPUT]);
      world.events.length = 0;
      // Tod: Neustart am Checkpoint; ohne Leben ist vorerst Schluss (Continue folgt)
      if (world.state === 1 && !world.respawn()) over = true;
      else if (world.state === 2) over = true;
    }
    renderer.draw();
    app.render();
  };
  app.ticker.add(frame);
  app.ticker.start();
  return {
    dispose() {
      app.ticker.remove(frame);
      renderer.destroy();
      app.destroy({ removeView: false }, { children: true });
      textures.destroy();
    },
  };
}
