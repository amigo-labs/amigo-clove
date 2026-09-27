import {
  HASH_INTERVAL,
  encodeInput,
  type GameHost,
  type GameInstance,
  type GameModule,
  type Replay,
} from "@clove/core";
import { TextureRegistry, createScreen } from "@clove/pixi-kit";
import { DoveAudio } from "./audio/DoveAudio";
import { Flow, type DebugStart, type FlowOptions } from "./flow/Flow";
import { FrameCache } from "./flow/gfx";
import { KeyEdges } from "./flow/input";
import type { FlowEnv } from "./flow/screen";
import { VbRnd } from "./sim/VbRnd";
import type { SimOptions, World } from "./sim/world";

export const SCREEN_WIDTH = 640;
export const SCREEN_HEIGHT = 480;

export interface DoveInstance extends GameInstance {
  /** Replay des laufenden bzw. letzten Spiels (Eingaben + Kontroll-Hashes). */
  replay(): Replay;
}

type Options = Readonly<Record<string, string>>;

/** URL `shots` (0/1/2) und `walls=1` überschreiben die gespeicherten Optionen. */
function parseOverride(o: Options): Partial<Pick<SimOptions, "enemyShots" | "wallsKill">> {
  const out: { enemyShots?: 0 | 1 | 2; wallsKill?: boolean } = {};
  const shots = Number(o["shots"]);
  if (o["shots"] !== undefined && (shots === 0 || shots === 1 || shots === 2)) {
    out.enemyShots = shots;
  }
  if (o["walls"] !== undefined) out.wallsKill = o["walls"] === "1";
  return out;
}

/** Direktstart per `level` (CI-Smoke-Test): ohne Titel, Intro und Get Ready. */
function parseDebug(o: Options): DebugStart | undefined {
  if (o["level"] === undefined) return undefined;
  return {
    level: Number(o["level"]),
    from: Number(o["from"] ?? 0),
    setup(world: World) {
      // Ausrüstung vorgeben (colour=1…3, stage=0…2, options=0…2, bomb=1, shield=1)
      if (o["colour"]) world.colour = Number(o["colour"]);
      if (o["stage"]) world.stage = Number(o["stage"]);
      if (o["options"]) world.optionCount = Number(o["options"]);
      if (o["bomb"] === "1") world.bomb = 1;
      if (o["shield"] === "1") world.shield = 500;
      // Continue/Highscore testen: lives=0 (nächster Tod → Continue), score=<Punkte>
      if (o["lives"] !== undefined) world.lives = Number(o["lives"]);
      if (o["score"] !== undefined) world.score = world.shownScore = Number(o["score"]);
    },
  };
}

/**
 * DOVE als `GameModule`: NEO-ARTS-Logo, Titel mit Menü, Optionen,
 * Levelauswahl, Story-Intro, Get Ready, Spiel mit Pause, Continue,
 * Highscore, Abspann und Abschiedsbild (`docs/measurements/dove-flow.md`).
 * URL-Optionen: `level` (Direktstart, überspringt Titel/Intro/Get Ready),
 * `nointro=1`, `seed`, `shots` (0/1/2), `walls=1`, Debug: `invincible=1`,
 * `from=<Tick>`, `lives`, `score`, Ausrüstung `colour`, `stage`, `options`, `bomb=1`,
 * `shield=1`, Sichtprüfung `screen=<Name>` (siehe `FlowOptions.screen`).
 */
const dove: GameModule = {
  id: "dove",
  title: "DOVE",
  // Grafik, Sounds und Menübilder; Musik und Level lädt der Ablauf bei Bedarf nach.
  preload: ["core", "screens"],
  // A Feuer/Bestätigen, B Beam, X Extrawaffe drehen, Y Enter (Namenseingabe),
  // Schultertasten Tempo, Start/Back Pause bzw. zurück.
  gamepad: {
    0: ["Space"],
    1: ["KeyA"],
    2: ["KeyD"],
    3: ["Enter"],
    4: ["KeyQ"],
    5: ["KeyW"],
    6: ["KeyQ"],
    7: ["KeyW"],
    8: ["Escape"],
    9: ["Escape"],
  },
  async boot(host: GameHost, options = {}): Promise<DoveInstance> {
    const app = await createScreen({
      canvas: host.canvas,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
    const textures = new TextureRegistry(host.assets);
    const audio = host.audio
      ? await DoveAudio.create(host.audio, host.assets).catch((e: unknown) => {
          console.warn("Audio nicht verfügbar:", e);
          return undefined;
        })
      : undefined;
    const env: FlowEnv = {
      host,
      textures,
      frames: new FrameCache(textures),
      audio,
      german: host.locale.toLowerCase().startsWith("de"),
      rnd: new VbRnd(Math.floor(host.now() * 1000)),
      keys: new KeyEdges(host.keys),
    };

    const seed = Number(options["seed"] ?? 1);
    let replayLevel = 0;
    let replaySeed = seed;
    let inputs: number[] = [];
    let hashes: number[] = [];
    const flowOptions: FlowOptions = {
      seed,
      invincible: options["invincible"] === "1",
      nointro: options["nointro"] === "1",
      override: parseOverride(options),
      debug: parseDebug(options),
      screen: options["screen"],
      onGameStart(level, s) {
        replayLevel = level;
        replaySeed = s;
        inputs = [];
        hashes = [];
      },
      record(input, world) {
        inputs.push(input);
        if (inputs.length % HASH_INTERVAL === 0) hashes.push(world.hash());
      },
    };
    const flow = new Flow(env, app.stage, flowOptions);
    const frame = () => flow.frame();
    app.ticker.add(frame);
    app.ticker.start();
    flow.main().catch((e: unknown) => console.error("DOVE-Ablauf abgebrochen:", e));

    return {
      replay: () => ({
        version: 1,
        game: "dove",
        level: `level${replayLevel}`,
        seed: replaySeed,
        ticks: inputs.length,
        input: encodeInput(inputs),
        hashes: [...hashes],
      }),
      dispose() {
        app.ticker.remove(frame);
        flow.dispose();
        audio?.dispose();
        env.frames.clear();
        app.destroy({ removeView: false }, { children: true });
        textures.destroy();
      },
    };
  },
};

export default dove;
