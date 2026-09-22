import type { BmpImage } from "../bmp/BmpDecoder";
import { isKeyed } from "../bmp/colorKey";
import type { EnemyDef } from "./LevelDat";

/**
 * Lage eines Animationsframes im Gegner-Atlas `feindeN.spr`.
 *
 * Frames liegen vertikal gestapelt mit Stride `h = rect.b - rect.t`. In x ist
 * `rect.r` inklusiv (Breite `r - l + 1`, Konturwerte reichen bis `r - l`), in y
 * umfasst ein Frame die Zeilen `t + k·h … t + k·h + h - 1`.
 */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function enemyFrameRect(enemy: EnemyDef, frame: number): FrameRect {
  const h = enemy.rect.b - enemy.rect.t;
  if (frame < 0 || frame >= enemy.frames.length) {
    throw new RangeError(`Gegner '${enemy.name}' hat kein Frame ${frame}`);
  }
  return {
    x: enemy.rect.l,
    y: enemy.rect.t + frame * h,
    width: enemy.rect.r - enemy.rect.l + 1,
    height: h,
  };
}

/** Sentinel für eine leere Konturzeile, erfüllt wie im Original `left > right`. */
export const EMPTY_SPAN_LEFT = 0x7fff;
export const EMPTY_SPAN_RIGHT = -1;

/**
 * Berechnet aus den Pixeln die Nicht-Colorkey-Spanne jeder Zeile eines Rechtecks,
 * relativ zu dessen linker Kante: `height` Paare `left, right`, verschachtelt.
 * Pixel außerhalb des Bildes gelten als transparent.
 */
export function contourFromPixels(image: BmpImage, rect: FrameRect): Int16Array {
  const out = new Int16Array(rect.height * 2);
  for (let row = 0; row < rect.height; row++) {
    const y = rect.y + row;
    let left = EMPTY_SPAN_LEFT;
    let right = EMPTY_SPAN_RIGHT;
    if (y >= 0 && y < image.height) {
      const x0 = Math.max(0, rect.x);
      const x1 = Math.min(image.width, rect.x + rect.width);
      for (let x = x0; x < x1; x++) {
        if (!isKeyed(image.rgba, y * image.width + x)) {
          if (left === EMPTY_SPAN_LEFT) left = x - rect.x;
          right = x - rect.x;
        }
      }
    }
    out[row * 2] = left;
    out[row * 2 + 1] = right;
  }
  return out;
}
