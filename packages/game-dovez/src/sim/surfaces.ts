import type { DovezLevel } from "@clove/formats";
import { frameRect, type FrameRect } from "./frames";

/**
 * Die Surface eines Gruppenbilds, wie sie das Original hält (`[0x58827C]`,
 * 0xB8 Byte): Quellrechteck im BMP und die Zeilenspannen für die Kollision
 * (`LadeRänder`, `0x4EF710`: erste und letzte nicht schwarze Spalte je Zeile,
 * aus den `.r`-Dateien). Spannen und Zeilen sind **BMP-Koordinaten**, wie im
 * Original; bei echten Ausschnitten (selten) weicht die Kollision dadurch vom
 * gezeichneten Bild ab — das übernimmt der Port.
 */
export interface Surface {
  /** BMP-Schlüssel im Atlas (klein, ohne Endung); leer für `"-"`. */
  readonly key: string;
  /** Gezeichneter Ausschnitt (x, y, Breite, Höhe). */
  readonly rect: FrameRect;
  /** Rohes Quellrechteck (+0xC…+0x18): links, oben, rechts, unten (exklusiv). */
  readonly left: number;
  readonly right: number;
  /** Erste/letzte belegte Zeile, auf das Rechteck beschnitten (+0xA8/+0xAC). */
  readonly topRow: number;
  readonly bottomRow: number;
  /** Je BMP-Zeile `left, right`; leer `-1, -1` (+0xA0/+0xA4). */
  readonly spans: Int16Array;
}

export interface SpriteSource {
  size(key: string): { w: number; h: number } | undefined;
  /** Kontur des BMP (`width, height, top, bottom, spans…`) oder undefined. */
  contour(key: string): Int16Array | undefined;
}

const EMPTY: Surface = {
  key: "",
  rect: { x: 0, y: 0, w: 0, h: 0 },
  left: 0,
  right: 0,
  topRow: -1,
  bottomRow: -1,
  spans: new Int16Array(0),
};

export function buildSurfaces(level: DovezLevel, source: SpriteSource): Surface[][] {
  return level.groups.map((g) =>
    g.frames.map((f) => {
      if (f.bmp.length <= 1) return EMPTY;
      const key = f.bmp.toLowerCase().replace(/\.bmp$/, "");
      const size = source.size(key);
      if (!size) return { ...EMPTY, key };
      const rect = frameRect(f, size.w, size.h);
      const c = source.contour(key);
      const rawBottom = rect.y + rect.h;
      return {
        key,
        rect,
        left: rect.x,
        right: rect.x + rect.w,
        topRow: c ? Math.max(c[2] as number, rect.y) : -1,
        bottomRow: c ? Math.min(c[3] as number, rawBottom) : -1,
        spans: c ? c.subarray(4, 4 + (c[1] as number) * 2) : new Int16Array(0),
      };
    }),
  );
}

/**
 * `SpanHit` aus `CheckColisionWithLandschaft3` (`0x4C5EE0`): Die Spannen aller
 * Zeilen, die der Kasten [x1, x2) × [y1, y2) überdeckt, werden zu einem
 * Intervall vereinigt — kein Pixeltest, konkave Formen sperren ihre ganze Zeile.
 */
export function spanHit(
  s: Surface,
  ox: number,
  oy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (s.topRow < 0) return false;
  if (s.left + ox >= x2 || s.right + ox <= x1) return false;
  if (s.topRow + oy >= y2 || s.bottomRow + oy <= y1) return false;
  const r0 = Math.max(y1 - oy, s.topRow);
  const r1 = Math.min(y2 - oy, s.bottomRow);
  let minL = 10000;
  let maxR = 0;
  for (let r = r0; r <= r1; r++) {
    const l = s.spans[r * 2];
    if (l === undefined || l <= -1) continue;
    if (l < minL) minL = l;
    const rr = s.spans[r * 2 + 1] as number;
    if (rr > maxR) maxR = rr;
  }
  return minL + ox < x2 && maxR + ox > x1;
}
