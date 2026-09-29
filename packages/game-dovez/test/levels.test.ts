/**
 * Alle 27 Level sind mit einem Bot bis zum Ende spielbar (Boss besiegt bzw. Levelende):
 * die Kampagne „Play.txt“ hängt an keiner Stelle. Der Standard-Bot (`bot.ts`) genügt für die
 * meisten Level; Bosse mit gepanzerten Teilen brauchen einen Bot, der auf die Schwachstelle
 * zielt (`botVulnerable.ts`, `lanebot.ts`). Die Bosskämpfe selbst prüfen `boss-*.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import type { PlayerInput } from "../src/sim/player";
import type { World } from "../src/sim/world";
import { runLevel } from "./bot";
import { botInputVulnerable } from "./botVulnerable";
import { hunterInput } from "./hunter";
import { laneInput } from "./lanebot";
import { LEVEL_SLUGS } from "./assets";

/** Level, in denen der Standard-Bot die Schwachstelle nicht trifft. */
const BOTS: Readonly<Record<string, (w: World) => PlayerInput>> = {
  "level3-3_saw_machine": laneInput,
  "level4-3_cityboss": hunterInput,
  "level5-3_rumbler": botInputVulnerable,
};

/** Höchstgrenze gleichzeitig lebender Gegner (ein Leck ließe sie ins Unendliche wachsen). */
const MAX_ENEMIES = 120;

describe("Alle Level spielbar", () => {
  test("27 Level", () => {
    expect(LEVEL_SLUGS.length).toBe(27);
  });

  for (const slug of LEVEL_SLUGS) {
    test(
      slug,
      async () => {
        const run = await runLevel(slug, undefined, BOTS[slug]);
        expect([slug, run.state]).toEqual([slug, 2]);
        expect([slug, run.peakEnemies < MAX_ENEMIES]).toEqual([slug, true]);
      },
      120_000,
    );
  }
});
