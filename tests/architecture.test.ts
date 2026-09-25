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

/**
 * `@clove/formats` und `@clove/core` laufen im Browser (Debug-Modus lädt
 * Originaldateien per Drag & Drop, die Engine liest Manifest und Level-Assets).
 * Dateisystem, Bun-APIs und native Encoder gehören nach `@clove/assetkit`.
 */
const NODE_ONLY = /\bfrom\s+["'](?:node:[^"']+|bun|sharp|fs|path|os|crypto)["']|\bBun\./;

describe("isomorphe Pakete bleiben I/O-frei", () => {
  test("das Gate erkennt Node-, Bun- und sharp-Importe", () => {
    for (const src of [
      'import { readFileSync } from "node:fs";',
      'import { Glob } from "bun";',
      'import sharp from "sharp";',
      'import { join } from "path";',
      "await Bun.file(p).bytes();",
    ]) {
      expect(NODE_ONLY.test(src)).toBe(true);
    }
    expect(NODE_ONLY.test('import { decodeBmp } from "./bmp/BmpDecoder";')).toBe(false);
  });

  test("packages/{formats,core}/src importieren nichts Node-Spezifisches", async () => {
    const found: string[] = [];
    for await (const file of new Glob("packages/{formats,core}/src/**/*.ts").scan(ROOT)) {
      if (NODE_ONLY.test(await Bun.file(join(ROOT, file)).text())) found.push(file);
    }
    expect(found).toEqual([]);
  });
});
