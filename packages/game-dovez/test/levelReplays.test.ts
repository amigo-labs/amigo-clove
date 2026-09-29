/**
 * Regressionsschutz je Level: derselbe Bot spielt jedes der 27 Level mit fester Saat bis zum
 * Ende; alle 500 Ticks wird der Zustand geprüft (`stateHash`), dazu Ende, Ticks und Punkte. Ändert
 * sich die Simulation absichtlich, stellt `UPDATE_REPLAYS=1 bun test packages/game-dovez/test/levelReplays.test.ts`
 * die Datei `replays/levels.json` neu her (und der Unterschied gehört in die Beschreibung des Commits).
 * Beweist die Stabilität des Ports gegen sich selbst, nicht die Treue zum Original.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { NO_INPUT } from "../src/sim/player";
import { World } from "../src/sim/world";
import { LEVEL_SLUGS, loadTestLevel } from "./assets";
import { botFor } from "./levelBots";
import { stateHash } from "./stateHash";

const FILE = join(import.meta.dir, "replays/levels.json");
const STEP = 500;
const MAX = 60_000;

interface Replay {
  state: number;
  ticks: number;
  score: number;
  hashes: number[];
}

async function play(slug: string): Promise<Replay> {
  const { level, sprites } = await loadTestLevel(slug);
  const w = new World(level, sprites, { seed: 1 });
  const bot = botFor(slug);
  const hashes: number[] = [];
  let t = 0;
  for (; t < MAX && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = 2;
    w.step([bot(w), NO_INPUT]);
    w.events.length = 0;
    if ((t + 1) % STEP === 0) hashes.push(stateHash(w));
  }
  return { state: w.state, ticks: t, score: w.score[0] ?? 0, hashes };
}

const update = process.env["UPDATE_REPLAYS"] === "1";
const golden = update
  ? {}
  : ((await Bun.file(FILE)
      .json()
      .catch(() => ({}))) as Record<string, Replay>);
const written: Record<string, Replay> = {};

describe("Level-Replays (Bot, feste Saat)", () => {
  for (const slug of LEVEL_SLUGS) {
    test(
      slug,
      async () => {
        const run = await play(slug);
        if (update) {
          written[slug] = run;
          return;
        }
        const want = golden[slug];
        expect(
          want,
          `${slug}: kein Eintrag in replays/levels.json (UPDATE_REPLAYS=1)`,
        ).toBeDefined();
        expect({ state: run.state, ticks: run.ticks, score: run.score }).toEqual({
          state: want!.state,
          ticks: want!.ticks,
          score: want!.score,
        });
        expect(run.hashes).toEqual(want!.hashes);
      },
      120_000,
    );
  }

  test("Datei schreiben (nur mit UPDATE_REPLAYS=1)", async () => {
    if (!update) return;
    await Bun.write(FILE, `${JSON.stringify(written, null, 1)}\n`);
  });
});
