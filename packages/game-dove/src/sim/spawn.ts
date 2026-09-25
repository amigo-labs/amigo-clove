import { FX_ONE, fxDiv, fxFromInt, fxMul } from "@clove/core";
import { EXTRA_ART, FIELD_H, SCREEN_W, TILE_VX } from "./constants";
import { EDGE_OUTSIDE, type Path } from "./level";
import { idiv } from "./math";
import type { World } from "./world";

/** Kennung des dynamischen Patterns (Boss 4 schreibt es zur Laufzeit). */
export const CUSTOM_PATTERN = 100;

const FX_640 = fxFromInt(SCREEN_W);

/**
 * `M78C(x, y, vx, vy, rect)`: Landschaftskachel `ref` (1-basiert) in den ersten
 * freien Slot. Liefert den Slot oder −1.
 */
export function spawnTile(
  w: World,
  ref: number,
  y: number,
  x: number = SCREEN_W,
  vx: number = TILE_VX,
  vy = 0,
): number {
  if (ref < 1 || ref > w.level.tiles.length) return -1;
  const i = w.tiles.alloc();
  if (i < 0) return -1;
  w.tileType[i] = ref - 1;
  w.tileX[i] = x;
  w.tileY[i] = y;
  w.tileVX[i] = vx;
  w.tileVY[i] = vy;
  return i;
}

export function spawnObject(w: World, ref: number, y: number, x?: number): void {
  if (ref < 1 || ref > w.level.objects.length) return;
  const i = w.objects.alloc();
  if (i < 0) return;
  w.objType[i] = ref - 1;
  // x = 640 + 0,5 − frac(Me.188) (`0x43C1E0`)
  w.objX[i] = x ?? FX_640 + (FX_ONE >> 1) - (w.bgOffset & 0xffff);
  w.objY[i] = y;
}

/** `M7A4(art, y)`: Extra bei x = 640 mit vx = −1; Bosse legen auch stehende ab (`vx = 0`). */
export function spawnExtra(w: World, art: number, y: number, x: number = SCREEN_W, vx = -1): void {
  if (!(art in EXTRA_ART)) return;
  const i = w.extras.alloc();
  if (i < 0) return;
  w.extraArt[i] = art;
  w.extraX[i] = x;
  w.extraY[i] = y;
  w.extraVX[i] = vx;
  w.extraFrame[i] = 0;
  w.extraAnim[i] = 0;
}

export function allocEnemy(w: World, type: number, pattern: number): number {
  const def = w.level.enemies[type];
  if (!def) return -1;
  const i = w.enemies.alloc();
  if (i < 0) return -1;
  w.enType[i] = type;
  w.enPattern[i] = pattern;
  w.enHP[i] = def.hp;
  w.enPoints[i] = def.hp;
  w.enFrame[i] = 0;
  w.enAnim[i] = 0;
  w.enWaypoint[i] = 0;
  w.enShotTimer[i] = 0;
  w.enAux[i] = 0;
  w.enVX[i] = 0;
  w.enVY[i] = 0;
  return i;
}

/** Hauptachse mit `speed`, Nebenachse skaliert (Spawn und Wegpunktwechsel). */
export function aimEnemy(w: World, i: number, tx: number, ty: number): void {
  const speed = w.level.enemies[w.enType[i] as number]!.speedFx;
  const dx = fxFromInt(tx) - (w.enX[i] as number);
  const dy = fxFromInt(ty) - (w.enY[i] as number);
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > ady) {
    w.enVX[i] = dx < 0 ? -speed : speed;
    w.enVY[i] = fxMul(fxDiv(dy, adx), speed);
  } else {
    w.enVY[i] = dy < 0 ? -speed : speed;
    w.enVX[i] = ady === 0 ? 0 : fxMul(fxDiv(dx, ady), speed);
  }
}

/** Pattern 1…n aus dem Level, 100 = das dynamische Pattern (`Me.40C + 0xA1B8`, Boss 4). */
export function pathOf(w: World, pattern: number): Path | undefined {
  if (pattern === CUSTOM_PATTERN)
    return {
      x: w.customPathX.subarray(0, w.customPathLen),
      y: w.customPathY.subarray(0, w.customPathLen),
    };
  return w.level.paths[pattern - 1];
}

/** `;1 T P!` mit P > 0: Pattern-Gegner (`0x43D090`). */
export function spawnPatternEnemy(w: World, ref: number, pattern: number): number {
  const path = pathOf(w, pattern);
  if (!path) return -1;
  const i = allocEnemy(w, ref - 1, pattern);
  if (i < 0) return -1;
  const def = w.level.enemies[ref - 1]!;
  const sx = path.x[0] as number;
  const sy = path.y[0] as number;
  w.enX[i] = fxFromInt(sx === EDGE_OUTSIDE ? -def.w : sx);
  w.enY[i] = fxFromInt(sy === EDGE_OUTSIDE ? -def.h : sy);
  aimEnemy(w, i, path.x[1] as number, path.y[1] as number);
  return i;
}

/** `;1 T P!` mit P ≤ 0 und gebundenem `v§` — Tabelle in `docs/measurements/dove-events.md`. */
export function spawnBuiltinEnemy(w: World, ref: number, pattern: number, v: number): void {
  const def = w.level.enemies[ref - 1];
  if (!def) return;
  const code = pattern === -5 ? 0 : pattern <= -6 ? pattern + 1 : pattern;
  const i = allocEnemy(w, ref - 1, code);
  if (i < 0) return;
  const s = def.speedFx;
  const editorX = idiv(v * 64, 41);
  let x = SCREEN_W;
  let y = v;
  let vx = -s;
  let vy = 0;
  switch (pattern) {
    case -1:
      x = editorX;
      y = FIELD_H;
      break;
    case -2:
      x = editorX;
      y = -def.h;
      break;
    case -4:
      x = -def.w;
      break;
    case -5:
      x = -def.w;
      vx = s;
      break;
    case -6:
      vx = 0;
      vy = -s;
      break;
  }
  w.enX[i] = fxFromInt(x);
  w.enY[i] = fxFromInt(y);
  w.enVX[i] = vx;
  w.enVY[i] = vy;
}

/**
 * Gegner direkt anlegen (Bosse: Minen, Zapfen, Helfer): Typ 0-basiert,
 * Position in Pixeln, Bewegungscode wie `enPattern`, Geschwindigkeit in Q16.16.
 */
export function spawnEnemyAt(
  w: World,
  type: number,
  x: number,
  y: number,
  code: number,
  vx = 0,
  vy = 0,
): number {
  const i = allocEnemy(w, type, code);
  if (i < 0) return -1;
  w.enX[i] = fxFromInt(x);
  w.enY[i] = fxFromInt(y);
  w.enVX[i] = vx;
  w.enVY[i] = vy;
  return i;
}
