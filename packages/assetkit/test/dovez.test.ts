import { describe, expect, test } from "bun:test";
import type { AtlasEntry, AtlasJson, Manifest } from "@clove/core";
import {
  applyAlphaMask,
  applyColorKey,
  decodeBmp,
  dovezSpriteKey,
  maskName,
  parseContourR,
  readContainer,
} from "@clove/formats";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { packRects } from "../src/atlas/maxrects";
import type { Job } from "../src/job";
import { MANIFEST_FILE, build, check, stale, verify } from "../src/pipeline";
import { readContour } from "../src/stages/atlas";
import { decodeWebp } from "../src/stages/image";

const ROOT = join(import.meta.dir, "../../..");
const ASSETS = join(ROOT, "assets/dovez");
const DATA = join(ROOT, "original-dovez/Data");

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "clove-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("MaxRects", () => {
  test("keine Überlappung, Rand eingehalten, deterministisch, Übergröße auf eigener Seite", () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      name: `s${i}`,
      width: 5 + ((i * 37) % 180),
      height: 3 + ((i * 53) % 150),
    }));
    items.push({ name: "riesig", width: 500, height: 3000 });
    const a = packRects(items, 512, 1);
    expect(packRects(items, 512, 1)).toEqual(a);
    const huge = a.placements.find((p) => p.name === "riesig")!;
    expect(a.pages[huge.page]).toEqual({ width: 500, height: 3000 });
    const byPage = new Map<number, (typeof a.placements)[number][]>();
    for (const p of a.placements) byPage.set(p.page, [...(byPage.get(p.page) ?? []), p]);
    for (const [page, list] of byPage) {
      const size = a.pages[page]!;
      for (const p of list) {
        expect(p.x + p.width <= size.width && p.y + p.height <= size.height).toBe(true);
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const p = list[i]!;
          const q = list[j]!;
          const apart =
            p.x + p.width + 1 <= q.x ||
            q.x + q.width + 1 <= p.x ||
            p.y + p.height + 1 <= q.y ||
            q.y + q.height + 1 <= p.y;
          expect(apart).toBe(true);
        }
      }
    }
  });
});

const hasAssets = existsSync(join(ASSETS, MANIFEST_FILE));
const manifest: Manifest | undefined = hasAssets
  ? (JSON.parse(await readFile(join(ASSETS, MANIFEST_FILE), "utf8")) as Manifest)
  : undefined;

describe.if(hasAssets)("committete DoveZ-Assets", () => {
  test("passen zu ihrem Manifest", async () => {
    expect(await verify(ASSETS)).toEqual([]);
  }, 60_000);

  test("Bundles: jedes Level hat Atlas, Konturen und Skript; Kern, Menü, Musik, Videos", () => {
    const m = manifest!;
    const bundles = new Set(m.entries.flatMap((e) => e.bundles));
    const levels = [...bundles].filter((b) => b.startsWith("level/"));
    expect(levels.length).toBe(27);
    for (const b of levels) {
      const slug = b.slice("level/".length);
      const ids = new Set(m.entries.filter((e) => e.bundles.includes(b)).map((e) => e.id));
      for (const id of [`atlas/${slug}`, `contours/${slug}`, `leveldat/${slug}`]) {
        expect([b, ids.has(id)]).toEqual([b, true]);
      }
    }
    expect([...bundles].filter((b) => b.startsWith("voice/")).length).toBe(16);
    expect([...bundles].filter((b) => b.startsWith("video/")).length).toBe(14);
    const core = m.entries.filter((e) => e.bundles.includes("core")).map((e) => e.id);
    expect(core).toContain("data/play");
    expect(core).toContain("atlas/spiel");
    expect(core.filter((id) => id.startsWith("sound/")).length).toBe(84);
    expect(m.entries.filter((e) => e.kind === "music").length).toBe(20);
  });

  test("jedes Sprite liegt pixelgenau im Atlas, jede Kontur gleich der .r-Datei", async () => {
    const m = manifest!;
    const files = new Map(m.entries.map((e) => [e.id, e.file]));
    const containers = m.entries.filter((e): e is AtlasEntry => e.kind === "atlas");
    expect(containers.length).toBe(33);
    let sprites = 0;
    let contours = 0;
    for (const atlas of containers) {
      const json = JSON.parse(
        await readFile(join(ASSETS, files.get(atlas.id)!), "utf8"),
      ) as AtlasJson;
      const source = atlas.sources[0]!.path;
      const entries = readContainer(
        new Uint8Array(await readFile(join(ROOT, source))),
        (b) => new Uint8Array(inflateSync(b)),
      );
      const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]));
      const pages = await Promise.all(
        json.pages.map(async (id) =>
          decodeWebp(new Uint8Array(await readFile(join(ASSETS, files.get(id)!)))),
        ),
      );
      for (const e of entries) {
        const name = e.name.toLowerCase();
        if (!name.endsWith(".bmp")) continue;
        const key = dovezSpriteKey(name);
        const sprite = json.sprites[key];
        if (!sprite) {
          // nur Masken fehlen als eigene Sprites
          expect([source, name, byName.has(name.replace(/a\.bmp$/, ".bmp"))]).toEqual([
            source,
            name,
            true,
          ]);
          continue;
        }
        const image = decodeBmp(e.data);
        // `interface*_energyA` ist ein eigenes Bild, keine Maske (NOT_MASKS in config.ts)
        const ownImage = /^interface\d_energy\.bmp$/.test(name);
        const mask = ownImage ? undefined : byName.get(maskName(name));
        expect([key, sprite.blend]).toEqual([key, mask ? "alpha" : "key"]);
        const expected = mask
          ? applyAlphaMask(
              image,
              decodeBmp(mask.data),
              image.width !== decodeBmp(mask.data).width ? { x: 0, y: 0 } : undefined,
            )
          : applyColorKey(image);
        const page = pages[sprite.page]!;
        let same = true;
        for (let y = 0; y < sprite.h && same; y++) {
          const row = page.rgba.subarray(
            ((sprite.y + y) * page.width + sprite.x) * 4,
            ((sprite.y + y) * page.width + sprite.x + sprite.w) * 4,
          );
          const want = expected.subarray(y * image.width * 4, (y + 1) * image.width * 4);
          for (let i = 0; i < row.length; i++) {
            // transparente Pixel: nur Alpha zählt
            if (
              row[i] !== want[i] &&
              !(want[i - (i % 4) + 3] === 0 && row[i - (i % 4) + 3] === 0)
            ) {
              same = false;
              break;
            }
          }
        }
        expect([source, key, same]).toEqual([source, key, true]);
        sprites++;
      }
      if (atlas.contours) {
        const bin = new Uint8Array(await readFile(join(ASSETS, files.get(atlas.contours)!)));
        const data = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
        for (const e of entries.filter((x) => x.name.toLowerCase().endsWith(".r"))) {
          const stored = parseContourR(e.data);
          const c = readContour(data, json.contours[dovezSpriteKey(e.name)]!);
          expect([c.width, c.height, c.top, c.bottom]).toEqual([
            stored.width,
            stored.height,
            stored.top,
            stored.bottom,
          ]);
          expect([...c.spans]).toEqual([...stored.spans]);
          contours++;
        }
      }
    }
    // 83 Dateien heißen wie Masken, vier davon (`interface*_energyA`) sind eigene Bilder
    expect(sprites).toBe(3232 - 79);
    expect(contours).toBe(2587);
  }, 300_000);
});

describe("volatile Jobs", () => {
  test("check übernimmt Videos aus dem Baum statt neu zu kodieren", async () => {
    await withTemp(async (root) => {
      await mkdir(join(root, "src"));
      await writeFile(join(root, "src/a.txt"), "quelle");
      let runs = 0;
      const job: Job = {
        bundles: [],
        sources: ["src/a.txt"],
        options: {},
        converterVersion: 1,
        volatile: true,
        outputs: [{ id: "video/a", kind: "video", ext: "webm", bundles: ["video/a"] }],
        run: async () => {
          runs++;
          // nicht reproduzierbar: jeder Lauf andere Bytes
          return [
            {
              id: "video/a",
              kind: "video",
              ext: "webm",
              bytes: new TextEncoder().encode(`lauf ${runs}`),
              meta: { width: 1, height: 1, duration: 1 },
            },
          ];
        },
      };
      const out = join(root, "out");
      await build([job], { root, out, game: "t" });
      expect(runs).toBe(1);
      await build([job], { root, out, game: "t", force: true });
      expect(runs).toBe(1);
      expect(await check([job], { root, out, game: "t" })).toEqual({
        missing: [],
        extra: [],
        changed: [],
      });
      expect(runs).toBe(1);
      const m = JSON.parse(await readFile(join(out, MANIFEST_FILE), "utf8")) as Manifest;
      expect(m.entries[0]!.bundles).toEqual(["video/a"]);

      // geänderte Quelle: check meldet das Video als fehlend statt es zu kodieren
      await writeFile(join(root, "src/a.txt"), "neu");
      const r = await check([job], { root, out, game: "t" });
      expect(runs).toBe(1);
      expect(r.missing.length + r.changed.length).toBeGreaterThan(0);
      await build([job], { root, out, game: "t" });
      expect(runs).toBe(2);
    });
  });
});

function dataJob(converterVersion: number, bundles: string[]): Job {
  return {
    bundles,
    sources: ["src/a.txt"],
    options: { q: 1 },
    converterVersion,
    outputs: [{ id: "data/a", kind: "data", ext: "json" }],
    run: async () => [
      {
        id: "data/a",
        kind: "data",
        ext: "json",
        bytes: new TextEncoder().encode("{}"),
        meta: {},
      },
    ],
  };
}

describe("Aktualität ohne Konvertierung", () => {
  test("stale meldet geänderte Quellen, Versionen, Bundles und verwaiste Einträge", async () => {
    await withTemp(async (root) => {
      await mkdir(join(root, "src"));
      await writeFile(join(root, "src/a.txt"), "quelle");
      const out = join(root, "out");
      await build([dataJob(1, ["core"])], { root, out, game: "t" });
      expect(await stale([dataJob(1, ["core"])], { root, out })).toEqual([]);
      expect(await stale([dataJob(2, ["core"])], { root, out })).toEqual([
        "data/a: Konverterversion 1 statt 2",
      ]);
      expect(await stale([dataJob(1, ["menu"])], { root, out })).toEqual([
        "data/a: Bundles geändert",
      ]);
      expect(await stale([], { root, out })).toEqual(["data/a: kein Job erzeugt es"]);
      await writeFile(join(root, "src/a.txt"), "neu");
      expect(await stale([dataJob(1, ["core"])], { root, out })).toEqual([
        "data/a: Quelle geändert",
      ]);
    });
  });
});

describe.if(existsSync(DATA))("Planung", () => {
  test("ein Job je Paket bzw. Musikstück, IDs eindeutig", async () => {
    const { planDoveZ } = await import("../src/dovez/config");
    const jobs = planDoveZ(ROOT);
    const ids = jobs.flatMap((j) => j.outputs.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
    // 52 Pakete + 16 Funktext-Jobs (D/E/R je Level) + 2 lose Intro-Videos + 20 Musikstücke
    expect(jobs.length).toBe(52 + 16 + 2 + 20);
    const radio = jobs.filter((j) => j.outputs.some((o) => o.id.startsWith("radio/")));
    expect(radio).toHaveLength(16);
    expect(radio.every((j) => j.outputs.length === 1 && j.bundles[0]?.startsWith("level/"))).toBe(
      true,
    );
  });
});
