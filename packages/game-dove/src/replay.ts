import { HASH_INTERVAL, decodeInput, type Replay } from "@clove/core";
import { step, startLevel } from "./sim/step";
import { DEFAULT_OPTIONS, World, type SimOptions } from "./sim/world";
import type { LevelData } from "./sim/level";

/** Spielt ein Replay headless ab und liefert die Kontroll-Hashes (einer je 64 Ticks). */
export function runReplay(
  level: LevelData,
  replay: Pick<Replay, "seed" | "input" | "options">,
): { hashes: number[]; world: World } {
  const options: SimOptions = { ...DEFAULT_OPTIONS, ...(replay.options as Partial<SimOptions>) };
  const world = new World(level, options, replay.seed);
  startLevel(world);
  const inputs = decodeInput(replay.input);
  const hashes: number[] = [];
  for (let t = 0; t < inputs.length; t++) {
    step(world, inputs[t] as number);
    if ((t + 1) % HASH_INTERVAL === 0) hashes.push(world.hash());
  }
  return { hashes, world };
}
