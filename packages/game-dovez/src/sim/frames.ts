import type { DovezFrame } from "@clove/formats";

/**
 * Rechteck eines Gruppenbilds im BMP. Das Skript speichert vier Zahlen, die
 * `LoadSurface` als DirectDraw-`RECT` (links, oben, rechts, unten; rechts und
 * unten exklusiv) bekommt (`LoadSurface`, `0x4F3700`): Liegt rechts bzw. unten
 * höchstens 1 px unter der BMP-Größe, gilt das ganze Bild — so werden die 1197
 * Bilder mit (0, 0, B−1, H−1) voll. Echte Ausschnitte sind selten, etwa
 * `rocket.bmp` (9, 26, 54, 37). Gezeichnet wird der Ausschnitt 1:1.
 */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function frameRect(frame: DovezFrame | undefined, bmpW: number, bmpH: number): FrameRect {
  if (!frame || (frame.srcW === 0 && frame.srcH === 0)) return { x: 0, y: 0, w: bmpW, h: bmpH };
  const x = Math.max(0, frame.srcX);
  const y = Math.max(0, frame.srcY);
  const right = frame.srcW >= bmpW - 1 ? bmpW : frame.srcW;
  const bottom = frame.srcH >= bmpH - 1 ? bmpH : frame.srcH;
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}
