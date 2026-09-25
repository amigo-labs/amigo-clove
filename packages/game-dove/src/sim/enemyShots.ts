import { killPlayer } from "./actions";
import { wallHit } from "./collision";
import {
  ENEMY_AIM_SPEED,
  FIELD_H,
  FIREBALL_VX,
  INVULN_DONE,
  SCREEN_W,
  SHIP_SHOT_BOX,
} from "./constants";
import { boxHit, divRoundHalfEven } from "./math";
import type { World } from "./world";

/**
 * Gegnerschüsse (Pool `Me.5D8`), gemeinsam für Gegner und Bosse
 * (`docs/measurements/dove-enemies.md`, `dove-bosses.md`).
 *
 * Art (Typfeld des Datensatzes): 1 gezielte Kugel (von Options/Beam
 * absorbierbar), 2 Feuerball bzw. Boss-Kugel, 3 gerade Kugel, 4 teilt sich an
 * der Wand in zwei Art-2-Kugeln. Jeder Schuss trägt sein Sprite-Rechteck.
 */
export const ShotKind = { Aimed: 1, Fireball: 2, Straight: 3, Splitter: 4 } as const;

export interface ShotRect {
  readonly sx: number;
  readonly sy: number;
  readonly w: number;
  readonly h: number;
}

export const RECT_BULLET: ShotRect = { sx: 21, sy: 85, w: 7, h: 7 };
export const RECT_FIREBALL: ShotRect = { sx: 0, sy: 136, w: 34, h: 14 };
export const RECT_MISSILE: ShotRect = { sx: 0, sy: 151, w: 42, h: 16 };

/** Option „Gegner schießen“: 0 aus, 1 voll, 2 halb (jede zweite Anforderung verworfen). */
function allowed(w: World): boolean {
  const mode = w.shotOption;
  if (mode === 0) return false;
  if (mode === 2) {
    w.halfToggle ^= 1;
    return w.halfToggle === 0;
  }
  return true;
}

function put(
  w: World,
  kind: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  r: ShotRect,
): void {
  const i = w.eshots.alloc();
  if (i < 0) return;
  w.eshotKind[i] = kind;
  w.eshotX[i] = x;
  w.eshotY[i] = y;
  w.eshotVX[i] = vx;
  w.eshotVY[i] = vy;
  w.eshotSX[i] = r.sx;
  w.eshotSY[i] = r.sy;
  w.eshotW[i] = r.w;
  w.eshotH[i] = r.h;
}

/**
 * `AddGegnerS(kind, x, y)` (`0x43C4A0`): beachtet die Option. Art 1 zielt mit
 * Tempo 3 auf (pX+20, pY+7), Geschwindigkeit als `Long` gerundet.
 */
export function addEnemyShot(w: World, kind: number, x: number, y: number): void {
  if (!allowed(w)) return;
  if (kind === ShotKind.Aimed) {
    const dx = w.px + 20 - x;
    const dy = w.py + 7 - y;
    let vx: number;
    let vy: number;
    if (Math.abs(dx) > Math.abs(dy)) {
      vx = dx < 0 ? -ENEMY_AIM_SPEED : ENEMY_AIM_SPEED;
      vy = divRoundHalfEven(dy * ENEMY_AIM_SPEED, Math.abs(dx));
    } else {
      vy = dy < 0 ? -ENEMY_AIM_SPEED : ENEMY_AIM_SPEED;
      vx = dy === 0 ? 0 : divRoundHalfEven(dx * ENEMY_AIM_SPEED, Math.abs(dy));
    }
    put(w, kind, x - 4, y - 4, vx, vy, RECT_BULLET);
  } else if (kind === ShotKind.Fireball) {
    put(w, kind, x, y - 7, FIREBALL_VX, 0, RECT_FIREBALL);
  } else {
    put(w, ShotKind.Straight, x, y - 4, FIREBALL_VX, 0, RECT_BULLET);
  }
}

/** Wie `addEnemyShot`, aber mit „voll“ erzwungen (Bosse E1/E4/E5 und der Schweber). */
export function addEnemyShotForced(w: World, kind: number, x: number, y: number): void {
  const saved = w.shotOption;
  w.shotOption = 1;
  addEnemyShot(w, kind, x, y);
  w.shotOption = saved;
}

/** `AddEndS(type, x, y, vx, vy, rect)` (`0x43C350`): Boss-Schuss, ignoriert die Option. */
export function addBossShot(
  w: World,
  kind: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  rect: ShotRect,
): void {
  put(w, kind, x, y, vx, vy, rect);
}

/** Pro Tick: bewegen, an Wänden und Rändern entfernen, gegen das Schiff prüfen. */
export function updateEnemyShots(w: World): void {
  for (let i = 0; i < w.eshots.capacity; i++) {
    if (!w.eshots.active[i]) continue;
    const vx = w.eshotVX[i] as number;
    const vy = w.eshotVY[i] as number;
    const x = (w.eshotX[i] as number) + vx;
    const y = (w.eshotY[i] as number) + vy;
    const sw = w.eshotW[i] as number;
    const sh = w.eshotH[i] as number;
    w.eshotX[i] = x;
    w.eshotY[i] = y;
    if (wallHit(w, x, y, sw, sh)) {
      const kind = w.eshotKind[i] as number;
      w.eshots.free(i);
      // Art 4 zerfällt an der Wand in zwei Kugeln (`0x481A05`).
      if (kind === ShotKind.Splitter) {
        const h = Math.trunc(-vx / 2);
        addBossShot(w, ShotKind.Fireball, x - vx, y + 1, h, h, RECT_BULLET);
        addBossShot(w, ShotKind.Fireball, x - vx, y + 1, h, -h, RECT_BULLET);
      }
      continue;
    }
    if (x < -sw || x > SCREEN_W || y < -sh || y > FIELD_H) {
      w.eshots.free(i);
      continue;
    }
    if (
      !w.dead &&
      w.invuln === INVULN_DONE &&
      w.shield === 0 &&
      boxHit(
        w.px,
        w.py + SHIP_SHOT_BOX.dy0,
        SHIP_SHOT_BOX.w,
        SHIP_SHOT_BOX.dy1 - SHIP_SHOT_BOX.dy0,
        x,
        y,
        sw,
        sh,
      )
    ) {
      w.eshots.free(i);
      killPlayer(w);
    }
  }
}
