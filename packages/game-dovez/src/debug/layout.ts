/**
 * Rasterlayout der Asset-Ansicht (rein, testbar): Sprites zeilenweise in
 * gleich großen Zellen, große Sprites ganzzahlig verkleinert (Nearest), kleine
 * in Originalgröße — Konturen bleiben so pixelgenau ablesbar.
 */

export interface Cell {
  readonly name: string;
  /** Linke obere Ecke der Zelle. */
  readonly x: number;
  readonly y: number;
  /** Ganzzahliger Teiler, mit dem das Sprite gezeichnet wird (1 = Original). */
  readonly divisor: number;
}

export interface GridLayout {
  readonly cells: readonly Cell[];
  /** Gesamthöhe des Rasters in Pixeln. */
  readonly height: number;
}

export const LABEL_HEIGHT = 12;

export function layoutGrid(
  sprites: readonly { name: string; w: number; h: number }[],
  width: number,
  cell: number,
  gap = 6,
): GridLayout {
  const columns = Math.max(1, Math.floor((width + gap) / (cell + gap)));
  const cells: Cell[] = sprites.map((s, i) => ({
    name: s.name,
    x: (i % columns) * (cell + gap),
    y: Math.floor(i / columns) * (cell + LABEL_HEIGHT + gap),
    divisor: Math.max(1, Math.ceil(s.w / cell), Math.ceil(s.h / cell)),
  }));
  const rows = Math.ceil(sprites.length / columns);
  return { cells, height: rows * (cell + LABEL_HEIGHT + gap) };
}

/**
 * Umriss einer Kontur als Pixel (Sprite-Koordinaten): linker und rechter Rand
 * jeder belegten Zeile. Leere Zeilen (`-1, -1`) fehlen.
 */
export function contourEdges(spans: ArrayLike<number>, height: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    const l = spans[y * 2] as number;
    const r = spans[y * 2 + 1] as number;
    if (l < 0 || r < l) continue;
    out.push([l, y]);
    if (r !== l) out.push([r, y]);
  }
  return out;
}
