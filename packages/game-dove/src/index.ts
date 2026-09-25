import {
  FixedStepLoop,
  HASH_INTERVAL,
  encodeInput,
  type GameHost,
  type GameInstance,
  type GameModule,
  type Replay,
} from "@clove/core";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import { DoveAudio } from "./audio/DoveAudio";
import { loadLevel } from "./data/loadLevel";
import { readInput } from "./input";
import { Renderer } from "./render/Renderer";
import { TICK_MS } from "./sim/constants";
import { restartAtCheckpoint, step, startLevel } from "./sim/step";
import { DEFAULT_OPTIONS, World, type SimOptions } from "./sim/world";

export const SCREEN_WIDTH = 640;
export const SCREEN_HEIGHT = 480;

export interface DoveInstance extends GameInstance {
  /** Replay der bisherigen Sitzung (Eingaben + Kontroll-Hashes). */
  replay(): Replay;
}

function parseOptions(o: Readonly<Record<string, string>>): {
  level: number;
  seed: number;
  from: number;
  sim: SimOptions;
} {
  const shots = Number(o["shots"] ?? DEFAULT_OPTIONS.enemyShots);
  return {
    level: Number(o["level"] ?? 1),
    seed: Number(o["seed"] ?? 1),
    from: Number(o["from"] ?? 0),
    sim: {
      ...DEFAULT_OPTIONS,
      enemyShots: shots === 0 || shots === 1 || shots === 2 ? shots : DEFAULT_OPTIONS.enemyShots,
      wallsKill: o["walls"] === "1",
      invincible: o["invincible"] === "1",
    },
  };
}

/**
 * DOVE als `GameModule`. Stand M3: ein Level spielbar — Scrolling, Schiff,
 * Basisschuss, Gegner mit Pattern und Konturkollision, Explosionen, Punkte, HUD.
 * Steuerung wie im Original; `Esc` pausiert. URL-Optionen: `level`, `seed`,
 * `shots` (0/1/2), `walls=1`, Debug: `invincible=1`, `from=<Tick>`, Ausrüstung
 * `colour`, `stage`, `options`, `bomb=1`, `shield=1`.
 */
const dove: GameModule = {
  id: "dove",
  title: "DOVE",
  async boot(host: GameHost, options = {}): Promise<DoveInstance> {
    const cfg = parseOptions(options);
    const app = await createScreen({
      canvas: host.canvas,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
    const textures = new TextureRegistry(host.assets);
    const world = new World(await loadLevel(host.assets, cfg.level), cfg.sim, cfg.seed);
    startLevel(world);
    // Debug: Ausrüstung vorgeben (colour=1…3, stage=0…2, options=0…2, bomb=1, shield=1)
    if (options["colour"]) world.colour = Number(options["colour"]);
    if (options["stage"]) world.stage = Number(options["stage"]);
    if (options["options"]) world.optionCount = Number(options["options"]);
    if (options["bomb"] === "1") world.bomb = 1;
    if (options["shield"] === "1") world.shield = 500;
    if (cfg.from > 0) {
      // Debug: Start ab Tick `from` wie von einem Checkpoint (mit Landschafts-Vorlauf).
      world.checkpoint = cfg.from;
      restartAtCheckpoint(world);
    }
    await textures.load(Renderer.imageIds(world));
    const renderer = new Renderer(textures, world);
    app.stage.addChild(renderer.root);
    const audio = host.audio
      ? await DoveAudio.create(host.audio, host.assets).catch((e: unknown) => {
          console.warn("Audio nicht verfügbar:", e);
          return undefined;
        })
      : undefined;
    void audio?.playMusic(DoveAudio.levelMusic(cfg.level, cfg.seed));

    const loop = new FixedStepLoop(TICK_MS);
    const inputs: number[] = [];
    const hashes: number[] = [];
    let paused = false;
    let escHeld = false;

    const frame = () => {
      const esc = host.keys.isDown("Escape");
      if (esc && !escHeld) {
        paused = !paused;
        audio?.pause(paused);
        loop.reset(host.now());
      }
      escHeld = esc;
      const ticks = paused || world.finished ? (loop.reset(host.now()), 0) : loop.frame(host.now());
      for (let i = 0; i < ticks; i++) {
        const input = readInput(host.keys);
        step(world, input);
        inputs.push(input);
        if (inputs.length % HASH_INTERVAL === 0) hashes.push(world.hash());
      }
      audio?.update(world);
      renderer.render(paused ? "PAUSE" : world.finished ? "LEVEL GESCHAFFT!" : undefined);
    };
    app.ticker.add(frame);
    app.ticker.start();

    return {
      replay: () => ({
        version: 1,
        game: "dove",
        level: `level${cfg.level}`,
        seed: cfg.seed,
        ticks: inputs.length,
        input: encodeInput(inputs),
        hashes: [...hashes],
      }),
      dispose() {
        app.ticker.remove(frame);
        audio?.dispose();
        renderer.destroy();
        app.destroy({ removeView: false }, { children: true });
        textures.destroy();
      },
    };
  },
};

export default dove;
