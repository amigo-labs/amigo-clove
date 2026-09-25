import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ScrambleError, descrambleTiles, parsePermutation } from "../src/index";
import { DOVE_DATA, readBytes } from "./fixtures";

describe("Endbilder B1–B5", () => {
  test.each([1, 2, 3, 4, 5])("Data/%i.dat ist eine Permutation von 0…2879", async (n) => {
    const perm = parsePermutation(await readBytes(join(DOVE_DATA, `${n}.dat`)));
    expect(perm.length).toBe(2880);
    expect(new Set(perm).size).toBe(2880);
  });

  test("Zielkachel i ← Quellkachel p[i]", () => {
    const rgba = new Uint8Array(640 * 450 * 4);
    // Quellkachel 5 markieren (x 50…59, y 0…9)
    for (let y = 0; y < 10; y++) for (let x = 50; x < 60; x++) rgba[(y * 640 + x) * 4] = 255;
    const perm = Int32Array.from({ length: 2880 }, (_, i) => i);
    perm[0] = 5;
    perm[5] = 0;
    const out = descrambleTiles(rgba, 640, 450, perm);
    expect(out[0]).toBe(255); // jetzt in Kachel 0
    expect(out[50 * 4]).toBe(0);
  });

  test("keine Permutation und falsche Größe werden abgelehnt", () => {
    expect(() => parsePermutation(new Uint8Array(2880 * 4))).toThrow(ScrambleError); // lauter Nullen
    expect(() => descrambleTiles(new Uint8Array(4), 1, 1, new Int32Array(2880))).toThrow(
      ScrambleError,
    );
  });
});
