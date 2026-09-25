/**
 * Erzeugt die Referenz-Replays `test/replays/level1-*.json` neu:
 * `level1-bot` (normale Regeln, der Bot stirbt und startet am Checkpoint neu)
 * und `level1-invincible` (unverwundbar, bis zum Ende des Levels).
 *
 *   bun packages/game-dove/scripts/record-replay.ts
 *
 * Nur nach einer **gewollten** Änderung der Simulation ausführen und die
 * Hash-Änderung im Commit begründen — das Replay ist das Regressionsnetz.
 */
import { encodeInput, type Replay } from "@clove/core";
import { join } from "node:path";
import { runReplay } from "../src/replay";
import { Input } from "../src/sim/step";
import { level } from "../test/helpers";

export const BOT_TICKS = 12_000;

/** Deterministischer Bot: Dauerfeuer, Auf/Ab-Pendeln, Vor/Zurück, gelegentlich Q/W. */
export function botInput(t: number): number {
  let m = Input.Fire;
  m |= Math.floor(t / 70) % 2 ? Input.Up : Input.Down;
  const phase = Math.floor(t / 250) % 4;
  if (phase === 1) m |= Input.Right;
  if (phase === 3) m |= Input.Left;
  if (t % 900 === 450) m |= Input.Faster;
  if (t % 900 === 0 && t > 0) m |= Input.Slower;
  return m;
}

export const REPLAYS = [
  { name: "level1-bot", seed: 1, options: {} },
  { name: "level1-invincible", seed: 2, options: { invincible: true } },
] as const;

if (import.meta.main) {
  const inputs = Array.from({ length: BOT_TICKS }, (_, t) => botInput(t));
  for (const { name, seed, options } of REPLAYS) {
    const input = encodeInput(inputs);
    const { hashes, world } = runReplay(await level(1), { seed, input, options });
    const replay: Replay = {
      version: 1,
      game: "dove",
      level: "level1",
      seed,
      options,
      ticks: inputs.length,
      input,
      hashes,
    };
    const out = join(import.meta.dir, `../test/replays/${name}.json`);
    await Bun.write(out, `${JSON.stringify(replay)}\n`);
    console.log(
      `${name}: ${replay.ticks} Ticks, ${hashes.length} Hashes, Level-Tick ${world.tick}, ` +
        `Punkte ${world.score}, Leben ${world.lives}, Checkpoint ${world.checkpoint}, ` +
        `Boss ${world.bossMode}, geschafft ${world.exit === 3}`,
    );
  }
}
