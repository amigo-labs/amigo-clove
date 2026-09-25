import type { DoveLevel, Rect } from "./LevelDat";

/**
 * Ladeform eines DOVE-Levels für die Engine: JSON plus Binär-Sidecar.
 *
 * Erzeugt von der Asset-Pipeline aus `LevelN.dat`; die Engine liest nur diese
 * Form, nie das Original. Layout-Dokumentation: `docs/formats/dove-assets.md`.
 *
 * Sidecar (little endian): Gegnerkonturen als `Int16`-Paare `left, right`, je
 * Frame alle **`h + 1`** Zeilen (`h = b − t`) wie im Original. Die letzte Zeile
 * ragt ins nächste Frame, wird aber von der Kollision gelesen: `f1` zeigt in 73
 * von 319 Frames genau auf sie (`docs/measurements/dove-enemies.md`). Das ist
 * die **gespeicherte** Kontur — die Kollisionswahrheit des Originals.
 *
 * Version 2 (M3): keine Terrain-Masken mehr — das Original testet Wände per
 * AABB gegen die Tile-Rechtecke, nicht pixelweise.
 */

export const LEVEL_ASSET_VERSION = 2;

/** Event-Arten im gepackten Stream: Kommandos behalten ihren Opcode, `y§` ist `-1`. */
export const SPAWN_KIND = -1;

export type RectTuple = readonly [l: number, t: number, r: number, b: number];

export interface EnemyAsset {
  readonly name: string;
  readonly rect: RectTuple;
  readonly params: readonly [number, number, number, number, number];
  readonly frameHeaders: readonly (readonly [number, number])[];
  /** Index des ersten `Int16` in `contours`; je Frame `2·(h+1)` Werte. */
  readonly contour: number;
}

export interface PatternAsset {
  readonly name: string;
  readonly flags: readonly [boolean, boolean];
  readonly values: readonly [number, number];
  readonly waypoints: readonly (readonly [number, number])[];
  readonly end: number;
}

export interface NamedRectAsset {
  readonly name: string;
  readonly rect: RectTuple;
}

export interface LevelAssetJson {
  readonly version: typeof LEVEL_ASSET_VERSION;
  readonly background: string;
  readonly length: number;
  readonly tiles: readonly NamedRectAsset[];
  readonly backgroundObjects: readonly NamedRectAsset[];
  readonly enemies: readonly EnemyAsset[];
  readonly patterns: readonly PatternAsset[];
  /**
   * Vier parallele Arrays in Dateireihenfolge (nach Tick sortiert, innerhalb
   * eines Ticks in Zeilenreihenfolge — die Bindung `;1 … P≤0` an das folgende
   * `y§` hängt davon ab).
   */
  readonly events: {
    readonly tick: readonly number[];
    readonly kind: readonly number[];
    readonly a: readonly number[];
    readonly b: readonly number[];
  };
  readonly sidecar: { readonly contourBytes: number };
}

export interface LevelAsset extends LevelAssetJson {
  readonly contours: Int16Array;
}

export class LevelAssetError extends Error {
  override name = "LevelAssetError";
}

const tuple = (r: Rect): RectTuple => [r.l, r.t, r.r, r.b];
const named = (r: { name: string; rect: Rect }): NamedRectAsset => ({
  name: r.name,
  rect: tuple(r.rect),
});

export function buildLevelAsset(level: DoveLevel): { json: LevelAssetJson; bin: Uint8Array } {
  const contourValues: number[] = [];
  const enemies: EnemyAsset[] = level.enemies.map((e) => {
    const contour = contourValues.length;
    for (const f of e.frames) for (const v of f.spans) contourValues.push(v);
    return {
      name: e.name,
      rect: tuple(e.rect),
      params: e.params,
      frameHeaders: e.frames.map((f) => f.header),
      contour,
    };
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

  const bin = new Uint8Array(contourValues.length * 2);
  const view = new DataView(bin.buffer);
  contourValues.forEach((v, i) => view.setInt16(i * 2, v, true));

  const json: LevelAssetJson = {
    version: LEVEL_ASSET_VERSION,
    background: level.background,
    length: level.length,
    tiles: level.tiles.map(named),
    backgroundObjects: level.backgroundObjects.map(named),
    enemies,
    patterns: level.patterns.map((pt) => ({
      name: pt.name,
      flags: pt.flags,
      values: pt.values,
      waypoints: pt.waypoints,
      end: pt.end,
    })),
    events: { tick, kind, a, b },
    sidecar: { contourBytes: bin.length },
  };
  return { json, bin };
}

/** Liest JSON und Sidecar; plattformunabhängig (explizit little endian). */
export function readLevelAsset(json: LevelAssetJson, bin: Uint8Array): LevelAsset {
  if (json.version !== LEVEL_ASSET_VERSION) {
    throw new LevelAssetError(`Level-Asset-Version ${String(json.version)} wird nicht unterstützt`);
  }
  if (bin.byteLength !== json.sidecar.contourBytes) {
    throw new LevelAssetError(
      `Sidecar hat ${bin.byteLength} Byte, erwartet ${json.sidecar.contourBytes}`,
    );
  }
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const contours = new Int16Array(bin.byteLength / 2);
  for (let i = 0; i < contours.length; i++) contours[i] = view.getInt16(i * 2, true);
  return { ...json, contours };
}
