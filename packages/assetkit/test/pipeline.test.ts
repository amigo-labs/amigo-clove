import { describe, expect, test } from "bun:test";
import type { ImageEntry, Manifest } from "@clove/core";
import { applyColorKey, decodeBmp } from "@clove/formats";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isColorKeyed, planDove } from "../src/dove/config";
import { MANIFEST_FILE, build, listTree, verify } from "../src/pipeline";
import { decodeWebp } from "../src/stages/image";

const ROOT = join(import.meta.dir, "../../..");
const ASSETS = join(ROOT, "assets/dove");

async function readManifest(dir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8")) as Manifest;
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "clove-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("committete DOVE-Assets", () => {
  test("passen zu ihrem Manifest", async () => {
    expect(await verify(ASSETS)).toEqual([]);
  });

  test("jede WebP dekodiert pixelgenau zum (gekeyten) BMP", async () => {
    const manifest = await readManifest(ASSETS);
    const images = manifest.entries.filter((e): e is ImageEntry => e.kind === "image");
    expect(images.length).toBe(60);
    for (const e of images) {
      const bmp = decodeBmp(new Uint8Array(await readFile(join(ROOT, e.sources[0]!.path))));
      const expected = e.colorKeyed ? applyColorKey(bmp) : bmp.rgba;
      const webp = await decodeWebp(new Uint8Array(await readFile(join(ASSETS, e.file))));
      expect([webp.width, webp.height]).toEqual([bmp.width, bmp.height]);
      if (Buffer.compare(webp.rgba, expected) !== 0) throw new Error(`${e.file} weicht ab`);
    }
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
    for (const name of ["feinde1", "landschaft3", "ss", "konsole", "explosion", "text", "logo"]) {
      expect(isColorKeyed(name)).toBe(true);
    }
    for (const name of [
      "titel",
      "intro",
      "intro2",
      "loading",
      "0",
      "10",
      "b3",
      "background5",
      "extralevel",
    ]) {
      expect(isColorKeyed(name)).toBe(false);
    }
  });
});

describe("Pipeline", () => {
  const jobs = planDove(ROOT);

  test("zweiter Lauf schreibt null Bytes; Teilbuild lässt Fremdes stehen", async () => {
    await withTemp(async (out) => {
      const opts = { root: ROOT, out, game: "dove", only: ["level1"] };
      const first = await build(jobs, opts);
      expect(first.converted).toBe(6); // Level1-Daten, Meteor-Kontur, feinde1, landschaft1, background1, metroid
      expect(first.bytesWritten).toBeGreaterThan(0);

      const second = await build(jobs, opts);
      expect(second).toMatchObject({ converted: 0, reused: 6, filesWritten: 0, bytesWritten: 0 });

      // Ein weiterer Teilbuild ergänzt, statt level1 zu verwerfen.
      await build(jobs, { ...opts, only: ["level0"] });
      const ids = (await readManifest(out)).entries.map((e) => e.id);
      expect(ids).toContain("level/level1");
      expect(ids).toContain("level/level0");
      expect(await verify(out)).toEqual([]);
    });
  }, 60_000);

  test("geänderte Ausgabe wird neu erzeugt, verwaiste Datei entfernt", async () => {
    await withTemp(async (out) => {
      const opts = { root: ROOT, out, game: "dove", only: ["level0"] };
      await build(jobs, opts);
      const manifest = await readManifest(out);
      const entry = manifest.entries.find((e) => e.id === "level/level0")!;
      await writeFile(join(out, entry.file), "kaputt");
      await writeFile(join(out, "image/verwaist.webp"), "x");
      expect(await verify(out)).toHaveLength(2);

      const again = await build(jobs, opts);
      expect(again.converted).toBe(1);
      expect(again.removed).toEqual(["image/verwaist.webp"]);
      expect(await verify(out)).toEqual([]);
      expect(await listTree(out)).not.toContain("image/verwaist.webp");
    });
  }, 60_000);

  test("unbekanntes Bundle ist ein Fehler", async () => {
    await withTemp(async (out) => {
      await expect(
        build(jobs, { root: ROOT, out, game: "dove", only: ["gibtsnicht"] }),
      ).rejects.toThrow();
    });
  });
});
