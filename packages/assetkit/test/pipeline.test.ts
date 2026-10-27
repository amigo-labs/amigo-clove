import { describe, expect, test } from "bun:test";
import type { Manifest } from "@clove/core";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isColorKeyed } from "../src/dove/config";
import { MANIFEST_FILE, verify } from "../src/pipeline";

const ROOT = join(import.meta.dir, "../../..");
const ASSETS = join(ROOT, "assets/dove");

async function readManifest(dir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8")) as Manifest;
}

describe("committete DOVE-Assets", () => {
  test("passen zu ihrem Manifest", async () => {
    expect(await verify(ASSETS)).toEqual([]);
  });

  test("Bundles: jedes Level hat Gegner, Terrain, Hintergrund und Leveldaten", async () => {
    const manifest = await readManifest(ASSETS);
    for (let n = 0; n < 12; n++) {
      const ids = manifest.entries.filter((e) => e.bundles.includes(`level${n}`)).map((e) => e.id);
      expect(ids).toContain(`image/feinde${n}`);
      expect(ids).toContain(`image/landschaft${n}`);
      expect(ids).toContain(`level/level${n}`);
      expect(ids).toContain(`levelData/level${n}`);
      expect(ids.filter((id) => id.startsWith("image/background")).length).toBe(1);
    }
    expect(manifest.entries.find((e) => e.id === "image/background1")?.bundles.length).toBe(6);
  });
});

describe("Colorkey-Zuordnung", () => {
  test("Sprites gekeyed, Vollbilder opak", () => {
    // titel und intro sind Sprite-Blätter, das Original blittet sie gekeyed.
    for (const name of [
      "feinde1",
      "landschaft3",
      "ss",
      "konsole",
      "explosion",
      "text",
      "logo",
      "titel",
      "intro",
    ]) {
      expect(isColorKeyed(name)).toBe(true);
    }
    for (const name of ["intro2", "loading", "0", "10", "b3", "background5", "extralevel"]) {
      expect(isColorKeyed(name)).toBe(false);
    }
  });
});
