import { describe, expect, test } from "bun:test";
import { scaleFor } from "../src/scale";

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
});
