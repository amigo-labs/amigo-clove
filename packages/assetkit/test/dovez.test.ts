import { describe, expect, test } from "bun:test";
import type { Manifest } from "@clove/core";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packRects } from "../src/atlas/maxrects";
import type { Job } from "../src/job";
import { MANIFEST_FILE, build, check, stale, verify } from "../src/pipeline";

const ROOT = join(import.meta.dir, "../../..");
const ASSETS = join(ROOT, "assets/dovez");

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
