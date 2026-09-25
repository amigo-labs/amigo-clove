import { type Fx, fxFromInt } from "@clove/core";
import { SPAWN_KIND, type LevelAsset } from "@clove/formats";

/**
 * Laufzeitform eines Levels: aus dem Level-Asset vorbereitet, danach unveränderlich.
 * Rohindizes p0…p4 verlassen diese Datei nicht — hier stehen die benannten Felder
 * mit ihrer Herleitung (`docs/measurements/dove-enemies.md`).
 */
export interface EnemyType {
  readonly name: string;
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
  /** Breite `r − l` und Framehöhe `b − t` (RECTs rechts/unten exklusiv). */
  readonly w: number;
  readonly h: number;
  /** p0 + 1 */
  readonly frames: number;
  /** p1: Frame wechselt alle `animDelay + 1` Ticks. */
  readonly animDelay: number;
  /** p2: Trefferpunkte und Punktwert. */
  readonly hp: number;
  /** p3: 0 kein Schuss, 1–3 gezielt, 4 Feuerball. */
  readonly shot: number;
  /** p4: Geschwindigkeit in px/Tick. */
  readonly speed: number;
  readonly speedFx: Fx;
  /** Index des ersten Konturwerts; je Frame `2·(h+1)` Werte. */
  readonly contour: number;
  readonly f0: Int16Array;
  readonly f1: Int16Array;
}

/** Wegpunkte inkl. Start (Index 0), Endpunkt und Terminator x = −1. */
export interface Path {
  readonly x: Int16Array;
  readonly y: Int16Array;
}

export interface TileType {
  readonly l: number;
  readonly t: number;
  readonly w: number;
  readonly h: number;
}

export interface LevelData {
  readonly number: number;
  readonly background: string;
  /** `background1` wird nie gezeichnet — stattdessen ein Sternenfeld. */
  readonly starfield: boolean;
  readonly length: number;
  readonly tiles: readonly TileType[];
  readonly objects: readonly TileType[];
  readonly enemies: readonly EnemyType[];
  readonly paths: readonly Path[];
  readonly contours: Int16Array;
  readonly events: LevelAsset["events"];
  /** Erster Event-Index je Tick; `lineStart[t + 1]` ist das Ende von Tick t. */
  readonly lineStart: Int32Array;
  /** Meteor-Kontur (60 Zeilen), leer außer in Level 1. */
  readonly meteorContour: Int16Array;
}

const EDGE_X_RIGHT = 640;
const EDGE_Y_BOTTOM = 410;
/** −100 steht im Pattern für „links bzw. oben außerhalb“, beim Spawn −Breite/−Höhe. */
export const EDGE_OUTSIDE = -100;

function side(v: number, [x, y]: readonly [number, number]): [number, number] {
  switch (v) {
    case 0:
      return [EDGE_X_RIGHT, y];
    case 1:
      return [x, EDGE_Y_BOTTOM];
    case 2:
      return [EDGE_OUTSIDE, y];
    case 3:
      return [x, EDGE_OUTSIDE];
    default:
      return [x, y];
  }
}

/**
 * Start- und Endpunkt wie im Lader (`0x4368AD`, `0x436A26`): `v0`/`v1` wählen die
 * Seite (0 → x 640, 1 → y 410, 2 → x −100, 3 → y −100), die andere Koordinate
 * kommt vom ersten bzw. letzten Wegpunkt; ohne Wegpunkte liefert `end` das y.
 */
function buildPath(p: LevelAsset["patterns"][number]): Path {
  const wps = p.waypoints;
  const first = wps[0] ?? [0, p.end];
  const last = wps.at(-1) ?? first;
  const points = [side(p.values[0], first), ...wps, side(p.values[1], last), [-1, 0] as const];
  return {
    x: Int16Array.from(points, ([x]) => x),
    y: Int16Array.from(points, ([, y]) => y),
  };
}

function rect([l, t, r, b]: readonly number[]): TileType {
  return {
    l: l as number,
    t: t as number,
    w: (r as number) - (l as number),
    h: (b as number) - (t as number),
  };
}

export function prepareLevel(
  number: number,
  asset: LevelAsset,
  meteorContour: Int16Array = new Int16Array(0),
): LevelData {
  const enemies = asset.enemies.map((e): EnemyType => {
    const [l, t, r, b] = e.rect;
    const [p0, p1, p2, p3, p4] = e.params;
    if (e.frameHeaders.length !== p0 + 1) {
      throw new Error(`Gegner '${e.name}': ${e.frameHeaders.length} Frames, p0 = ${p0}`);
    }
    return {
      name: e.name,
      l,
      t,
      r,
      b,
      w: r - l,
      h: b - t,
      frames: p0 + 1,
      animDelay: p1,
      hp: p2,
      shot: p3,
      speed: p4,
      speedFx: fxFromInt(p4),
      contour: e.contour,
      f0: Int16Array.from(e.frameHeaders, ([f0]) => f0),
      f1: Int16Array.from(e.frameHeaders, ([, f1]) => f1),
    };
  });

  const { tick } = asset.events;
  const lineStart = new Int32Array(asset.length + 2);
  let i = 0;
  for (let t = 0; t <= asset.length + 1; t++) {
    while (i < tick.length && (tick[i] as number) < t) i++;
    lineStart[t] = i;
  }

  return {
    number,
    background: asset.background.toLowerCase(),
    starfield: asset.background.toLowerCase() === "background1",
    length: asset.length,
    tiles: asset.tiles.map((x) => rect(x.rect)),
    objects: asset.backgroundObjects.map((x) => rect(x.rect)),
    enemies,
    paths: asset.patterns.map(buildPath),
    contours: asset.contours,
    events: asset.events,
    lineStart,
    meteorContour,
  };
}

export { SPAWN_KIND };
