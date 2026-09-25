import { buildLevelAsset, decodeBmp, parseLevelDat } from "@clove/formats";

export const LEVEL_CONVERTER_VERSION = 1;

/** `LevelN.dat` + `landschaftN.spr` → Level-JSON + Binär-Sidecar. */
export function convertLevel(
  dat: Uint8Array,
  terrainBmp: Uint8Array,
): { json: Uint8Array; bin: Uint8Array } {
  const { json, bin } = buildLevelAsset(parseLevelDat(dat), decodeBmp(terrainBmp));
  return { json: new TextEncoder().encode(`${JSON.stringify(json)}\n`), bin };
}
