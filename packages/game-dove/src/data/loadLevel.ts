import type { AssetStore } from "@clove/core";
import { readLevelAsset, type LevelAssetJson } from "@clove/formats";
import { prepareLevel, type LevelData } from "../sim/level";

/** Lädt `level/levelN` samt Sidecar (und in Level 1 die Meteor-Kontur) aus dem Asset-Store. */
export async function loadLevel(assets: AssetStore, n: number): Promise<LevelData> {
  const json = await assets.json<LevelAssetJson>(`level/level${n}`);
  const bin = await assets.bytes(`levelData/level${n}`);
  const meteor = assets.bundle(`level${n}`).includes("data/metroid")
    ? Int16Array.from((await assets.json<{ spans: number[] }>("data/metroid")).spans)
    : undefined;
  return prepareLevel(n, readLevelAsset(json, bin), meteor);
}
