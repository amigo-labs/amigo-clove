import { describe, expect, test } from "bun:test";
import { canvasFactor, scaleFor } from "../src/scale";

describe("Skalierung", () => {
  test("ganzzahlig rundet ab, darunter bruchteilig", () => {
    expect(scaleFor("integer", 1920, 1080, 640, 480)).toBe(2);
    expect(scaleFor("integer", 1920, 1080, 640, 410)).toBe(2);
    expect(scaleFor("integer", 2560, 1440, 640, 410)).toBe(3);
    expect(scaleFor("integer", 320, 480, 640, 480)).toBe(0.5);
  });

  test("füllen nutzt den ganzen Platz", () => {
    expect(scaleFor("fit", 1920, 1080, 640, 480)).toBe(2.25);
    expect(scaleFor("smooth", 1600, 1200, 800, 600)).toBe(2);
  });

  test("ohne Platz bleibt 1", () => {
    expect(scaleFor("fit", 0, 0, 640, 480)).toBe(1);
  });

  test("Canvas-Faktor: ganzzahlig aufgerundet, höchstens 4", () => {
    expect(canvasFactor(1)).toBe(1);
    expect(canvasFactor(0.5)).toBe(1);
    expect(canvasFactor(1.2)).toBe(2);
    expect(canvasFactor(2)).toBe(2);
    expect(canvasFactor(2.0000000001)).toBe(2);
    expect(canvasFactor(2.25 * 1.5)).toBe(4);
    expect(canvasFactor(6)).toBe(4);
  });
});
