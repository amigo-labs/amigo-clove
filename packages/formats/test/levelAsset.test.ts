import { describe, expect, test } from "bun:test";
import {
  EventOp,
  LevelAssetError,
  SPAWN_KIND,
  buildLevelAsset,
  decodeBmp,
  isKeyed,
  parseLevelDat,
  readLevelAsset,
  tileMaskBit,
  type BmpImage,
  type LevelAssetJson,
} from "../src/index";
import { DOVE_LEVELS, doveLevelPath, doveSpritePath, readBytes } from "./fixtures";

async function load(n: number) {
  const level = parseLevelDat(await readBytes(doveLevelPath(n)));
  const terrain = decodeBmp(await readBytes(doveSpritePath(`landschaft${n}`)));
  return { level, terrain };
}

/** JSON-Round-Trip wie in der Pipeline: das Asset muss serialisierbar sein. */
function viaJson(json: LevelAssetJson): LevelAssetJson {
  return JSON.parse(JSON.stringify(json)) as LevelAssetJson;
}

describe.each(DOVE_LEVELS)("Level%i → Asset", (n) => {
  test("Events, Gegner, Konturen und Pattern bleiben erhalten", async () => {
    const { level, terrain } = await load(n);
    const { json, bin } = buildLevelAsset(level, terrain);
    const asset = readLevelAsset(viaJson(json), bin);

    expect(asset.length).toBe(level.length);
    expect(asset.background).toBe(level.background);
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
    expect(tick.every((t, i) => i === 0 || (tick[i - 1] as number) <= t)).toBe(true);

    // Konturen: je Frame genau h Zeilen, ohne die Off-by-one-Zeile.
    level.enemies.forEach((e, i) => {
      const ea = asset.enemies[i]!;
      const h = e.rect.b - e.rect.t;
      expect(ea.frameHeaders.length).toBe(e.frames.length);
      e.frames.forEach((f, k) => {
        const start = ea.contour + k * h * 2;
        expect([...asset.contours.subarray(start, start + h * 2)]).toEqual([
          ...f.spans.subarray(0, h * 2),
        ]);
      });
    });
    const totalRows = level.enemies.reduce(
      (s, e) => s + e.frames.length * (e.rect.b - e.rect.t),
      0,
    );
    expect(asset.contours.length).toBe(totalRows * 2);
  });

  test("Terrain-Maske ⇔ Colorkey des Atlas", async () => {
    const { level, terrain } = await load(n);
    const { json, bin } = buildLevelAsset(level, terrain);
    const asset = readLevelAsset(json, bin);
    for (const tile of asset.tiles) {
      const [l, t] = tile.rect;
      for (let y = 0; y < tile.mask.height; y++) {
        for (let x = 0; x < tile.mask.width; x++) {
          const solid = !isKeyed(terrain.rgba, (t + y) * terrain.width + l + x);
          if (tileMaskBit(asset, tile, x, y) !== solid) {
            throw new Error(`Level${n} '${tile.name}' (${x},${y})`);
          }
        }
      }
      expect(tileMaskBit(asset, tile, -1, 0)).toBe(false);
      expect(tileMaskBit(asset, tile, tile.mask.width, 0)).toBe(false);
    }
  });
});

describe("Level-Asset", () => {
  test("Opcodes der Kommandos bleiben die aus LevelDat", () => {
    expect(SPAWN_KIND).not.toBeOneOf(Object.values(EventOp));
  });

  test("Tile außerhalb des Atlas ist ein Fehler", async () => {
    const { level } = await load(1);
    const tiny: BmpImage = { width: 4, height: 4, bitsPerPixel: 24, rgba: new Uint8Array(64) };
    expect(() => buildLevelAsset(level, tiny)).toThrow(LevelAssetError);
  });

  test("falsche Sidecar-Länge und Version werden abgelehnt", async () => {
    const { level, terrain } = await load(0);
    const { json, bin } = buildLevelAsset(level, terrain);
    expect(() => readLevelAsset(json, bin.subarray(1))).toThrow(LevelAssetError);
    expect(() => readLevelAsset({ ...json, version: 2 } as unknown as LevelAssetJson, bin)).toThrow(
      LevelAssetError,
    );
  });
});
