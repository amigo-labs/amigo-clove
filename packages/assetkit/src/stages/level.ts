import { buildLevelAsset, parseContourDat, parseLevelDat } from "@clove/formats";

/** 2: Konturen mit allen h+1 Zeilen, keine Terrain-Masken mehr (M3). */
export const LEVEL_CONVERTER_VERSION = 2;

/** `LevelN.dat` → Level-JSON + Binär-Sidecar mit den Gegnerkonturen. */
export function convertLevel(dat: Uint8Array): { json: Uint8Array; bin: Uint8Array } {
  const { json, bin } = buildLevelAsset(parseLevelDat(dat));
  return { json: new TextEncoder().encode(`${JSON.stringify(json)}\n`), bin };
}

export const CONTOUR_CONVERTER_VERSION = 1;

/** `METROID.dat` → JSON `{ spans: [left, right, …] }`. */
export function convertContour(dat: Uint8Array): Uint8Array {
  const spans = [...parseContourDat(dat)];
  return new TextEncoder().encode(`${JSON.stringify({ spans })}\n`);
}
