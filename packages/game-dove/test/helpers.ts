import { AssetStore, type Fetch } from "@clove/core";
import { join } from "node:path";
import { loadLevel } from "../src/data/loadLevel";
import { DEFAULT_OPTIONS, World, startLevel, type LevelData, type SimOptions } from "../src/sim";

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
