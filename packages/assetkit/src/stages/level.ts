import {
  buildLevelAsset,
  decodeCp1252,
  parseContourDat,
  parseIntroDat,
  parseLevelDat,
} from "@clove/formats";
import { jsonBytes } from "../files";

/** 2: Konturen mit allen h+1 Zeilen, keine Terrain-Masken mehr (M3). */
export const LEVEL_CONVERTER_VERSION = 2;

/** `LevelN.dat` → Level-JSON + Binär-Sidecar mit den Gegnerkonturen. */
export function convertLevel(dat: Uint8Array): { json: Uint8Array; bin: Uint8Array } {
  const { json, bin } = buildLevelAsset(parseLevelDat(dat));
  return { json: jsonBytes(json), bin };
}

export const CONTOUR_CONVERTER_VERSION = 1;

/** `METROID.dat` → JSON `{ spans: [left, right, …] }`. */
export function convertContour(dat: Uint8Array): Uint8Array {
  const spans = [...parseContourDat(dat)];
  return jsonBytes({ spans });
}

export const INTRO_CONVERTER_VERSION = 1;

/** `intro.dat` → JSON (`DoveIntro`). */
export function convertIntro(dat: Uint8Array): Uint8Array {
  return jsonBytes(parseIntroDat(dat));
}

export const TEXT_CONVERTER_VERSION = 1;

/** Textdatei (CP1252, CRLF) → JSON `{ text }` mit LF-Zeilenenden. */
export function convertText(bytes: Uint8Array): Uint8Array {
  const text = decodeCp1252(bytes).replace(/\r\n/g, "\n");
  return jsonBytes({ text });
}
