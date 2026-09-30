/**
 * Erzeugt die Referenz-Replays `test/replays/level1-*.json` neu:
 * `level1-bot` (normale Regeln, der Bot stirbt und startet am Checkpoint neu),
 * `level1-invincible` (unverwundbar, bis zum Ende des Levels) und
 * `level1-pointer` (unverwundbar, Zeigersteuerung: Ziel statt Pfeiltasten).
 *
 *   bun packages/game-dove/scripts/record-replay.ts
 *
 * Nur nach einer **gewollten** Änderung der Simulation ausführen und die
 * Hash-Änderung im Commit begründen — das Replay ist das Regressionsnetz.
 */
import { encodeInput, type Replay } from "@clove/core";
import { join } from "node:path";
import { runReplay } from "../src/replay";
import { Input, withTarget } from "../src/sim/step";
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

/** Dreieckswelle zwischen `lo` und `hi` mit Periode `period` (ganzzahlig). */
function tri(t: number, period: number, lo: number, hi: number): number {
  const half = period >> 1;
  const p = t % period;
  return lo + Math.floor(((hi - lo) * (p < half ? p : period - p)) / half);
}

/**
 * Zeiger-Bot: das Ziel fährt eine Lissajous-Bahn aus Dreieckswellen ab, Dauerfeuer;
 * je 1000 Ticks 250 Ticks Beam laden (ohne Feuer), dazu Rad-Impulse fürs Tempo.
 */
export function pointerBotInput(t: number): number {
  const charging = t % 1000 >= 700 && t % 1000 < 950;
  let buttons = charging ? Input.Beam : Input.Fire;
  if (t % 1300 === 650) buttons |= Input.Faster;
  if (t % 1300 === 0 && t > 0) buttons |= Input.Slower;
  return withTarget(buttons, tri(t, 610, 20, 560), tri(t, 430, 0, 400));
}

export const REPLAYS = [
  { name: "level1-bot", seed: 1, options: {}, bot: botInput },
  { name: "level1-invincible", seed: 2, options: { invincible: true }, bot: botInput },
  { name: "level1-pointer", seed: 3, options: { invincible: true }, bot: pointerBotInput },
] as const;

if (import.meta.main) {
  for (const { name, seed, options, bot } of REPLAYS) {
    const inputs = Array.from({ length: BOT_TICKS }, (_, t) => bot(t));
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
