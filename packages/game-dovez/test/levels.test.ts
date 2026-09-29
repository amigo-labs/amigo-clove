/**
 * Alle 27 Level sind mit einem Bot bis zum Ende spielbar (Boss besiegt bzw. Levelende):
 * die Kampagne „Play.txt“ hängt an keiner Stelle. Der Standard-Bot (`bot.ts`) genügt für die
 * meisten Level; Bosse mit gepanzerten Teilen brauchen einen Bot, der auf die Schwachstelle
 * zielt (`botVulnerable.ts`, `lanebot.ts`). Die Bosskämpfe selbst prüfen `boss-*.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import { runLevel } from "./bot";
import { LEVEL_SLUGS } from "./assets";
import { botFor } from "./levelBots";

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
        const run = await runLevel(slug, undefined, botFor(slug));
        expect([slug, run.state]).toEqual([slug, 2]);
        expect([slug, run.peakEnemies < MAX_ENEMIES]).toEqual([slug, true]);
      },
      120_000,
    );
  }
});
