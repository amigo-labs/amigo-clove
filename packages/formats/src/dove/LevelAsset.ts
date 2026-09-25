import type { BmpImage } from "../bmp/BmpDecoder";
import { isKeyed } from "../bmp/colorKey";
import type { DoveLevel, Rect } from "./LevelDat";

/**
 * Ladeform eines DOVE-Levels für die Engine: JSON plus Binär-Sidecar.
 *
 * Erzeugt von der Asset-Pipeline aus `LevelN.dat` und `landschaftN.spr`.
 * Die Engine liest nur diese Form, nie das Original. Layout-Dokumentation:
 * `docs/formats/dove-assets.md`.
 *
 * Sidecar (little endian):
 * 1. Gegnerkonturen: `Int16`-Paare `left, right`, je Frame genau `h = b - t`
 *    Zeilen. Die `(h+1)`-te Zeile des Originals (Editor-Off-by-one) fehlt hier.
 *    Das ist die **gespeicherte** Kontur — die Kollisionswahrheit des Originals.
 * 2. Terrain-Masken: pro Tile 1 bit/px, zeilenweise, `ceil(w/8)` Byte pro Zeile,
 *    MSB = linkes Pixel, 1 = fest. Im Original gibt es sie nicht als Datei; sie
 *    sind die einzigen spiellogik-relevanten Daten, die die Pipeline *erzeugt*.
 */

export const LEVEL_ASSET_VERSION = 1;

/** Event-Arten im gepackten Stream: Kommandos behalten ihren Opcode, Spawns sind `-1`. */
export const SPAWN_KIND = -1;

export type RectTuple = readonly [l: number, t: number, r: number, b: number];

export interface TileAsset {
  readonly name: string;
  readonly rect: RectTuple;
  /** Maske über das inklusive Rect `(r-l+1) × (b-t+1)`; `offset` in Byte ab Maskenbeginn. */
  readonly mask: { readonly offset: number; readonly width: number; readonly height: number };
}

export interface EnemyAsset {
  readonly name: string;
  readonly rect: RectTuple;
  readonly params: readonly [number, number, number, number, number];
  readonly frameHeaders: readonly (readonly [number, number])[];
  /** Index des ersten `Int16` in `contours`; je Frame `2·h` Werte. */
  readonly contour: number;
}

export interface PatternAsset {
  readonly name: string;
  readonly flags: readonly [boolean, boolean];
  readonly values: readonly [number, number];
  readonly waypoints: readonly (readonly [number, number])[];
  readonly end: number;
}

export interface LevelAssetJson {
  readonly version: typeof LEVEL_ASSET_VERSION;
  readonly background: string;
  readonly length: number;
  readonly tiles: readonly TileAsset[];
  readonly backgroundObjects: readonly { readonly name: string; readonly rect: RectTuple }[];
  readonly enemies: readonly EnemyAsset[];
  readonly patterns: readonly PatternAsset[];
  /** Vier parallele Arrays, nach Tick sortiert; die Engine braucht einen einzigen Cursor. */
  readonly events: {
    readonly tick: readonly number[];
    readonly kind: readonly number[];
    readonly a: readonly number[];
    readonly b: readonly number[];
  };
  /** Byte-Längen der beiden Sidecar-Abschnitte. */
  readonly sidecar: { readonly contourBytes: number; readonly maskBytes: number };
}

export interface LevelAsset extends LevelAssetJson {
  readonly contours: Int16Array;
  readonly masks: Uint8Array;
}

export class LevelAssetError extends Error {
  override name = "LevelAssetError";
}

const tuple = (r: Rect): RectTuple => [r.l, r.t, r.r, r.b];

export function maskStride(width: number): number {
  return (width + 7) >> 3;
}

/** Baut JSON und Sidecar. `terrain` ist der dekodierte `landschaftN.spr`-Atlas. */
export function buildLevelAsset(
  level: DoveLevel,
  terrain: BmpImage,
): { json: LevelAssetJson; bin: Uint8Array } {
  const contourValues: number[] = [];
  const enemies: EnemyAsset[] = level.enemies.map((e) => {
    const h = e.rect.b - e.rect.t;
    const contour = contourValues.length;
    for (const f of e.frames) {
      for (let i = 0; i < h * 2; i++) contourValues.push(f.spans[i] as number);
    }
    return {
      name: e.name,
      rect: tuple(e.rect),
      params: e.params,
      frameHeaders: e.frames.map((f) => f.header),
      contour,
    };
  });

  const maskChunks: Uint8Array[] = [];
  let maskBytes = 0;
  const tiles: TileAsset[] = level.tiles.map((t) => {
    const { l, t: top, r, b } = t.rect;
    const width = r - l + 1;
    const height = b - top + 1;
    if (
      l < 0 ||
      top < 0 ||
      r >= terrain.width ||
      b >= terrain.height ||
      width <= 0 ||
      height <= 0
    ) {
      throw new LevelAssetError(
        `Tile '${t.name}' (${l},${top}–${r},${b}) liegt nicht im Atlas ${terrain.width}×${terrain.height}`,
      );
    }
    const stride = maskStride(width);
    const mask = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isKeyed(terrain.rgba, (top + y) * terrain.width + l + x)) {
          mask[y * stride + (x >> 3)]! |= 0x80 >> (x & 7);
        }
      }
    }
    const offset = maskBytes;
    maskChunks.push(mask);
    maskBytes += mask.length;
    return { name: t.name, rect: tuple(t.rect), mask: { offset, width, height } };
  });

  const tick: number[] = [];
  const kind: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  level.events.forEach((line, t) => {
    for (const ev of line) {
      tick.push(t);
      if (ev.kind === "spawn") {
        kind.push(SPAWN_KIND);
        a.push(ev.y);
        b.push(0);
      } else {
        kind.push(ev.op);
        a.push(ev.a);
        b.push(ev.b);
      }
    }
  });

  const contourBytes = contourValues.length * 2;
  const bin = new Uint8Array(contourBytes + maskBytes);
  const view = new DataView(bin.buffer);
  contourValues.forEach((v, i) => view.setInt16(i * 2, v, true));
  let p = contourBytes;
  for (const m of maskChunks) {
    bin.set(m, p);
    p += m.length;
  }

  const json: LevelAssetJson = {
    version: LEVEL_ASSET_VERSION,
    background: level.background,
    length: level.length,
    tiles,
    backgroundObjects: level.backgroundObjects.map((o) => ({ name: o.name, rect: tuple(o.rect) })),
    enemies,
    patterns: level.patterns.map((pt) => ({
      name: pt.name,
      flags: pt.flags,
      values: pt.values,
      waypoints: pt.waypoints,
      end: pt.end,
    })),
    events: { tick, kind, a, b },
    sidecar: { contourBytes, maskBytes },
  };
  return { json, bin };
}

/** Liest JSON und Sidecar; plattformunabhängig (explizit little endian). */
export function readLevelAsset(json: LevelAssetJson, bin: Uint8Array): LevelAsset {
  if (json.version !== LEVEL_ASSET_VERSION) {
    throw new LevelAssetError(`Level-Asset-Version ${String(json.version)} wird nicht unterstützt`);
  }
  const { contourBytes, maskBytes } = json.sidecar;
  if (bin.byteLength !== contourBytes + maskBytes) {
    throw new LevelAssetError(
      `Sidecar hat ${bin.byteLength} Byte, erwartet ${contourBytes + maskBytes}`,
    );
  }
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const contours = new Int16Array(contourBytes / 2);
  for (let i = 0; i < contours.length; i++) contours[i] = view.getInt16(i * 2, true);
  const masks = bin.slice(contourBytes);
  return { ...json, contours, masks };
}

/** Ist das Terrain-Pixel `(x, y)` relativ zur Tile-Ecke fest? */
export function tileMaskBit(asset: LevelAsset, tile: TileAsset, x: number, y: number): boolean {
  const { offset, width, height } = tile.mask;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const byte = asset.masks[offset + y * maskStride(width) + (x >> 3)] as number;
  return (byte & (0x80 >> (x & 7))) !== 0;
}
