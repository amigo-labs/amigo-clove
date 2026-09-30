import type { ScaleMode } from "@clove/core";

/**
 * CSS-Faktor, mit dem `w`×`h` logische Pixel in `availW`×`availH` passen.
 * `integer` rundet ab, solange mindestens 1× passt; darunter (und bei `fit`,
 * `smooth`) bruchteilig, damit nie etwas aus dem Fenster ragt.
 */
export function scaleFor(
  mode: ScaleMode,
  availW: number,
  availH: number,
  w: number,
  h: number,
): number {
  const raw = Math.min(availW / w, availH / h);
  if (!(raw > 0)) return 1;
  return mode === "integer" && raw >= 1 ? Math.floor(raw) : raw;
}
