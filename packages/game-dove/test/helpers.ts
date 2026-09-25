import { AssetStore, type Fetch } from "@clove/core";
import { join } from "node:path";
import { loadLevel } from "../src/data/loadLevel";
import type { LevelAsset } from "@clove/formats";
import {
  DEFAULT_OPTIONS,
  World,
  prepareLevel,
  startLevel,
  type LevelData,
  type SimOptions,
} from "../src/sim";

const ASSETS = join(import.meta.dir, "../../../assets");

const fileFetch: Fetch = async (url) => {
  const file = Bun.file(join(ASSETS, url));
  const ok = await file.exists();
  return { ok, status: ok ? 200 : 404, arrayBuffer: () => file.arrayBuffer() };
};

let store: Promise<AssetStore> | undefined;
export function assets(): Promise<AssetStore> {
  store ??= AssetStore.load("dove/manifest.json", fileFetch);
  return store;
}

const levels = new Map<number, Promise<LevelData>>();
export function level(n: number): Promise<LevelData> {
  let l = levels.get(n);
  if (!l) {
    l = assets().then((a) => loadLevel(a, n));
    levels.set(n, l);
  }
  return l;
}

export async function newWorld(
  n: number,
  seed = 1,
  options: Partial<SimOptions> = {},
): Promise<World> {
  const w = new World(await level(n), { ...DEFAULT_OPTIONS, ...options }, seed);
  startLevel(w);
  return w;
}

/** Minimales Level: ein Gegnertyp (20×10, 1 Frame, Tempo 2), ein Tile, frei wählbare Events. */
export function tinyLevel(
  events: [tick: number, kind: number, a: number, b: number][],
  options: Partial<SimOptions> = {},
): World {
  const h = 10;
  const asset: LevelAsset = {
    version: 2,
    background: "background2",
    length: 100,
    tiles: [{ name: "T", rect: [0, 0, 30, 20] }],
    backgroundObjects: [],
    enemies: [
      {
        name: "E",
        rect: [0, 0, 20, h],
        params: [0, 0, 20, 0, 2],
        frameHeaders: [[0, h]],
        contour: 0,
      },
    ],
    patterns: [
      { name: "P", flags: [false, false], values: [0, 2], waypoints: [[300, 50]], end: 0 },
    ],
    events: {
      tick: events.map((e) => e[0]),
      kind: events.map((e) => e[1]),
      a: events.map((e) => e[2]),
      b: events.map((e) => e[3]),
    },
    sidecar: { contourBytes: (h + 1) * 4 },
    contours: Int16Array.from({ length: (h + 1) * 2 }, (_, i) => (i % 2 === 0 ? 0 : 19)),
  };
  const w = new World(prepareLevel(2, asset), { ...DEFAULT_OPTIONS, ...options }, 1);
  startLevel(w);
  return w;
}
