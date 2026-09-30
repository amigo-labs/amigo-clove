import { describe, expect, test } from "bun:test";
import { decodeInput, firstDivergence, type Replay } from "@clove/core";
import { runReplay } from "../src/replay";
import { BOT_TICKS, REPLAYS } from "../scripts/record-replay";
import { level } from "./helpers";

describe.each(REPLAYS.map((r) => [r.name, r.bot] as const))("Referenz-Replay %s", (name, bot) => {
  const load = async () =>
    (await Bun.file(`${import.meta.dir}/replays/${name}.json`).json()) as Replay;

  test("die gespeicherten Eingaben sind die des Bots", async () => {
    const r = await load();
    expect(r.ticks).toBe(BOT_TICKS);
    const inputs = decodeInput(r.input);
    for (let t = 0; t < BOT_TICKS; t++) if (inputs[t] !== bot(t)) throw new Error(`Tick ${t}`);
  });

  test("reproduziert jeden Kontroll-Hash bit-identisch", async () => {
    const r = await load();
    const { hashes } = runReplay(await level(1), r);
    const at = firstDivergence(r.hashes, hashes);
    if (at >= 0) {
      throw new Error(
        `Simulation weicht ab ab Tick ${at * 64}–${at * 64 + 63}. Gewollt? Dann ` +
          "`bun packages/game-dove/scripts/record-replay.ts` ausführen und im Commit begründen.",
      );
    }
    expect(hashes.length).toBe(r.hashes.length);
  });
});
