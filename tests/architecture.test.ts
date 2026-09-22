/**
 * Architektur-Gate für die deterministische Simulation.
 *
 * oxlint (`.oxlintrc.json`, Override auf `packages/<pkg>/src/sim/`) sperrt Pixi-Importe
 * sowie `window`, `document` und `performance`. `Math.random` und `Date.now` sind
 * Eigenschaftszugriffe, die sich dort nicht zuverlässig sperren lassen — daher
 * zusätzlich dieses Grep über denselben Pfad.
 */
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const FORBIDDEN: readonly [RegExp, string][] = [
  [/\bfrom\s+["'](?:pixi\.js|@pixi\/|@clove\/pixi-kit)/, "Pixi-Import"],
  [/\bwindow\./, "window"],
  [/\bdocument\./, "document"],
  [/\bperformance\./, "performance"],
  [/\bMath\.random\b/, "Math.random"],
  [/\bDate\.now\b/, "Date.now"],
];

function simViolations(source: string): string[] {
  return FORBIDDEN.filter(([re]) => re.test(source)).map(([, what]) => what);
}

describe("Simulation bleibt deterministisch", () => {
  test("das Gate erkennt jede verbotene Form", () => {
    expect(
      simViolations(
        'import { Sprite } from "pixi.js";\nwindow.x; document.y; performance.now(); Math.random(); Date.now();',
      ),
    ).toEqual(["Pixi-Import", "window", "document", "performance", "Math.random", "Date.now"]);
    expect(simViolations("const rng = xorshift32(seed);")).toEqual([]);
  });

  test("kein sim/**-Modul verwendet verbotene APIs", async () => {
    const found: string[] = [];
    for await (const file of new Glob("packages/*/src/sim/**/*.ts").scan(ROOT)) {
      const hits = simViolations(await Bun.file(join(ROOT, file)).text());
      if (hits.length > 0) found.push(`${file}: ${hits.join(", ")}`);
    }
    expect(found).toEqual([]);
  });
});
