import { describe, expect, test } from "bun:test";
import { LABEL_HEIGHT, contourEdges, layoutGrid } from "../src/debug/layout";

describe("Asset-Ansicht", () => {
  test("Raster mit ganzzahliger Verkleinerung", () => {
    const g = layoutGrid(
      [
        { name: "a", w: 64, h: 64 },
        { name: "b", w: 300, h: 100 },
        { name: "c", w: 10, h: 129 },
      ],
      270,
      128,
      6,
    );
    expect(g.cells).toEqual([
      { name: "a", x: 0, y: 0, divisor: 1 },
      { name: "b", x: 134, y: 0, divisor: 3 },
      { name: "c", x: 0, y: 128 + LABEL_HEIGHT + 6, divisor: 2 },
    ]);
    expect(g.height).toBe(2 * (128 + LABEL_HEIGHT + 6));
  });

  test("Umriss: linker und rechter Rand, leere Zeilen fehlen", () => {
    expect(contourEdges([-1, -1, 2, 5, 3, 3], 3)).toEqual([
      [2, 1],
      [5, 1],
      [3, 2],
    ]);
  });
});
