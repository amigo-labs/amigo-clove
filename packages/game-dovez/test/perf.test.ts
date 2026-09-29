/** Simulationsbudget: ein Tick darf nur einen kleinen Teil des 16-ms-Takts brauchen (`bun run perf` zeigt die Werte). */
import { describe, expect, test } from "bun:test";
import { NO_INPUT } from "../src/sim/player";
import { World } from "../src/sim/world";
import { LEVEL_SLUGS, loadTestLevel } from "./assets";

describe("Simulationsbudget", () => {
  test("alle Level: Mittel unter 2 ms je Tick, 99. Perzentil unter 8 ms", async () => {
    // gemessen: Mittel ≤ 0,2 ms, p99 ≤ 2,2 ms — die Grenzen lassen der CI Luft
    for (const slug of LEVEL_SLUGS) {
      const { level, sprites } = await loadTestLevel(slug);
      const w = new World(level, sprites);
      const ms: number[] = [];
      for (let t = 0; t < 1200 && w.state === 0; t++) {
        for (const p of w.players) p.invulnerable = 2;
        const start = performance.now();
        w.step([{ ...NO_INPUT, fire: true }]);
        ms.push(performance.now() - start);
        w.events.length = 0;
      }
      const mean = ms.reduce((s, v) => s + v, 0) / ms.length;
      const p99 = ms.toSorted((a, b) => a - b)[Math.floor(ms.length * 0.99)] ?? 0;
      expect([slug, mean < 2]).toEqual([slug, true]);
      expect([slug, p99 < 8]).toEqual([slug, true]);
    }
  }, 120_000);
});
