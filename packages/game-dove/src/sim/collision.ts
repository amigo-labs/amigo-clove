import { fxFromInt } from "@clove/core";
import { METEOR_SIZE } from "./constants";
import { boxHit, roundHalfEven } from "./math";
import type { World } from "./world";

/**
 * Konturtest aus `HitTest` (`0x448910`), gemeinsam für Schüsse und Spieler:
 * vertikaler Ausschluss über die Frame-Zeilen `f0…f1`, dann min(left)/max(right)
 * über die überlappenden Konturzeilen gegen das x-Intervall der Box, inklusiv.
 * `ex`, `ey` sind Q16.16; die Box ist ganzzahlig.
 */
export function contourHit(
  contours: Int16Array,
  base: number,
  rows: number,
  w: number,
  f0: number,
  f1: number,
  ex: number,
  ey: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  if (!(ey + fxFromInt(f0) <= fxFromInt(by + bh) && ey + fxFromInt(f1) >= fxFromInt(by))) {
    return false;
  }
  const r0 = Math.max(roundHalfEven(fxFromInt(by) - ey), f0);
  const r1 = Math.min(roundHalfEven(fxFromInt(by + bh) - ey), f1);
  let minL = w;
  let maxR = 0;
  for (let row = Math.max(r0, 0); row <= Math.min(r1, rows - 1); row++) {
    const l = contours[base + row * 2] as number;
    const r = contours[base + row * 2 + 1] as number;
    if (l < minL) minL = l;
    if (r > maxR) maxR = r;
  }
  return ex + fxFromInt(minL) <= fxFromInt(bx + bw) && ex + fxFromInt(maxR) >= fxFromInt(bx);
}

/** Berührt die Box eine Landschaftskachel? Inklusives AABB (`0x451E38`). */
export function wallHit(w: World, x: number, y: number, bw: number, bh: number): boolean {
  const { tiles, tileType, tileX, tileY, level } = w;
  for (let i = 0; i < tiles.capacity; i++) {
    if (!tiles.active[i]) continue;
    const t = level.tiles[tileType[i] as number]!;
    if (boxHit(x, y, bw, bh, tileX[i] as number, tileY[i] as number, t.w, t.h)) return true;
  }
  return false;
}

/** Wie `wallHit`, aber mit Q16.16-Position der Box (Gegner). */
export function wallHitFx(w: World, x: number, y: number, bw: number, bh: number): boolean {
  const { tiles, tileType, tileX, tileY, level } = w;
  for (let i = 0; i < tiles.capacity; i++) {
    if (!tiles.active[i]) continue;
    const t = level.tiles[tileType[i] as number]!;
    const tx = fxFromInt(tileX[i] as number);
    const ty = fxFromInt(tileY[i] as number);
    if (
      x <= tx + fxFromInt(t.w) &&
      x + fxFromInt(bw) >= tx &&
      y <= ty + fxFromInt(t.h) &&
      y + fxFromInt(bh) >= ty
    ) {
      return true;
    }
  }
  return false;
}

export interface HitHandlers {
  killEnemy(w: World, slot: number): void;
  killMeteor(w: World, slot: number): void;
}

/**
 * `HitTest(x, y, w, h, damage)`: −1 kein Treffer, 0 Treffer absorbiert,
 * > 0 Überschuss (der Schuss fliegt mit diesem Schaden weiter).
 */
export function hitTest(
  w: World,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  damage: number,
  walls: boolean,
  on: HitHandlers,
): number {
  const { level } = w;
  // Reihenfolge wie `CheckColision`: Boss, Meteore, Gegner, Wände.
  if (w.bossMode && w.boss) {
    const r = w.boss.hit(w, bx, by, bw, bh, damage);
    if (r >= 0) return r;
  }
  if (level.meteorContour.length > 0) {
    for (let i = 0; i < w.meteors.capacity; i++) {
      if (!w.meteors.active[i]) continue;
      const hit = contourHit(
        level.meteorContour,
        0,
        METEOR_SIZE,
        METEOR_SIZE,
        0,
        METEOR_SIZE - 1,
        fxFromInt(w.metX[i] as number),
        fxFromInt(w.metY[i] as number),
        bx,
        by,
        bw,
        bh,
      );
      if (!hit) continue;
      const hp = (w.metHP[i] as number) - damage;
      w.metHP[i] = hp;
      if (hp <= 0) on.killMeteor(w, i);
      return hp < 0 ? -hp : 0;
    }
  }
  for (let i = 0; i < w.enemies.capacity; i++) {
    if (!w.enemies.active[i]) continue;
    const type = level.enemies[w.enType[i] as number]!;
    const frame = w.enFrame[i] as number;
    const rows = type.h + 1;
    const base = type.contour + frame * rows * 2;
    const hit = contourHit(
      level.contours,
      base,
      rows,
      type.w,
      type.f0[frame] as number,
      type.f1[frame] as number,
      w.enX[i] as number,
      w.enY[i] as number,
      bx,
      by,
      bw,
      bh,
    );
    if (!hit) continue;
    const hp = (w.enHP[i] as number) - damage;
    w.enHP[i] = hp;
    if (hp <= 0) on.killEnemy(w, i);
    return hp < 0 ? -hp : 0;
  }
  if (walls && wallHit(w, bx, by, bw, bh)) return 0;
  return -1;
}
