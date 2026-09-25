import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  ContourDatError,
  EventOp,
  IntroDatError,
  LevelAssetError,
  SPAWN_KIND,
  buildLevelAsset,
  parseContourDat,
  parseIntroDat,
  parseLevelDat,
  readLevelAsset,
  type LevelAssetJson,
} from "../src/index";
import { DOVE_DATA, DOVE_LEVELS, doveLevelPath, readBytes } from "./fixtures";

async function load(n: number) {
  return parseLevelDat(await readBytes(doveLevelPath(n)));
}

/** JSON-Round-Trip wie in der Pipeline: das Asset muss serialisierbar sein. */
function viaJson(json: LevelAssetJson): LevelAssetJson {
  return JSON.parse(JSON.stringify(json)) as LevelAssetJson;
}

describe.each(DOVE_LEVELS)("Level%i → Asset", (n) => {
  test("Events, Gegner, Konturen und Pattern bleiben erhalten", async () => {
    const level = await load(n);
    const { json, bin } = buildLevelAsset(level);
    const asset = readLevelAsset(viaJson(json), bin);

    expect(asset.length).toBe(level.length);
    expect(asset.background).toBe(level.background);
    expect(asset.tiles.length).toBe(level.tiles.length);
    expect(asset.patterns.length).toBe(level.patterns.length);
    expect(asset.backgroundObjects.length).toBe(level.backgroundObjects.length);

    // Event-Stream: gleiche Reihenfolge, nach Tick sortiert.
    const expected: [number, number, number, number][] = [];
    level.events.forEach((line, t) => {
      for (const ev of line) {
        expected.push(ev.kind === "spawn" ? [t, SPAWN_KIND, ev.y, 0] : [t, ev.op, ev.a, ev.b]);
      }
    });
    const { tick, kind, a, b } = asset.events;
    expect(tick.map((t, i) => [t, kind[i], a[i], b[i]])).toEqual(expected);

    // Konturen: je Frame alle h+1 Zeilen, wie gespeichert.
    level.enemies.forEach((e, i) => {
      const ea = asset.enemies[i]!;
      const rows = e.rect.b - e.rect.t + 1;
      expect(ea.frameHeaders.length).toBe(e.frames.length);
      e.frames.forEach((f, k) => {
        const start = ea.contour + k * rows * 2;
        expect([...asset.contours.subarray(start, start + rows * 2)]).toEqual([...f.spans]);
      });
    });
  });
});

describe("Level-Asset", () => {
  test("Spawn-Kind kollidiert mit keinem Opcode", () => {
    expect(SPAWN_KIND).not.toBeOneOf(Object.values(EventOp));
  });

  test("falsche Sidecar-Länge und Version werden abgelehnt", async () => {
    const { json, bin } = buildLevelAsset(await load(0));
    expect(() => readLevelAsset(json, bin.subarray(1))).toThrow(LevelAssetError);
    expect(() => readLevelAsset({ ...json, version: 1 } as unknown as LevelAssetJson, bin)).toThrow(
      LevelAssetError,
    );
  });
});

const enc = (s: string) => new TextEncoder().encode(s);

describe("METROID.dat", () => {
  test("60 Konturzeilen für den 60×60-Meteor", async () => {
    const spans = parseContourDat(await readBytes(join(DOVE_DATA, "Grafik/METROID.dat")));
    expect(spans.length).toBe(120);
    expect([...spans.subarray(0, 4)]).toEqual([18, 28, 15, 30]);
    for (let i = 0; i < 60; i++) {
      expect(spans[i * 2]!).toBeGreaterThanOrEqual(0);
      expect(spans[i * 2 + 1]!).toBeLessThan(60);
    }
  });

  test("fehlender Terminator und Müll werden abgelehnt", () => {
    expect(() => parseContourDat(enc(" 1 \r\n 2 \r\n"))).toThrow(ContourDatError);
    expect(() => parseContourDat(enc("x\r\n"))).toThrow(ContourDatError);
  });
});

describe("intro.dat", () => {
  test("verbraucht alle 780 Tokens: drei Szenen, acht leere Plätze", async () => {
    const intro = parseIntroDat(await readBytes(join(DOVE_DATA, "intro.dat")));
    expect(intro.scenes.length).toBe(11);
    expect(intro.scenes.map((s) => s.duration)).toEqual([2100, 500, 300, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(intro.scenes[0]!.rects[1]!.name).toBe("Raumschiff");
    expect(intro.scenes[0]!.objects.length).toBe(14);
  });

  test("Abweichungen im Schema werden erkannt", () => {
    expect(() => parseIntroDat(enc('1\r\n"a"\r\n'))).toThrow(IntroDatError);
  });
});
