/**
 * Deterministischer MaxRects-Packer (Best Short Side Fit, Jylänki 2010).
 *
 * Reine Funktion der Eingabereihenfolge: gleiche Liste, gleiche Anordnung —
 * Voraussetzung für reproduzierbare Atlanten (`assets:check`). Jedes Rechteck
 * bekommt `padding` Pixel Abstand nach rechts und unten; Rechtecke, die größer
 * als eine Seite sind, landen allein auf einer Seite in eigener Größe.
 */

export interface PackItem {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly name: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PackedPage {
  /** Auf die belegte Fläche zugeschnitten. */
  readonly width: number;
  readonly height: number;
}

export interface PackResult {
  readonly pages: readonly PackedPage[];
  readonly placements: readonly Placement[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class Bin {
  free: Rect[];
  usedW = 0;
  usedH = 0;

  constructor(readonly size: number) {
    this.free = [{ x: 0, y: 0, w: size, h: size }];
  }

  /** Bester freier Platz für w×h oder `undefined`. */
  find(w: number, h: number): { x: number; y: number; score: [number, number] } | undefined {
    let best: { x: number; y: number; score: [number, number] } | undefined;
    for (const f of this.free) {
      if (w > f.w || h > f.h) continue;
      const short = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      if (
        !best ||
        short < best.score[0] ||
        (short === best.score[0] && long < best.score[1]) ||
        (short === best.score[0] &&
          long === best.score[1] &&
          (f.y < best.y || (f.y === best.y && f.x < best.x)))
      ) {
        best = { x: f.x, y: f.y, score: [short, long] };
      }
    }
    return best;
  }

  place(r: Rect): void {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w)
        next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h)
        next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    // enthaltene freie Rechtecke entfernen
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            i !== j &&
            a.x >= b.x &&
            a.y >= b.y &&
            a.x + a.w <= b.x + b.w &&
            a.y + a.h <= b.y + b.h &&
            // bei Gleichheit bleibt das erste
            (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || j < i),
        ),
    );
    this.usedW = Math.max(this.usedW, r.x + r.w);
    this.usedH = Math.max(this.usedH, r.y + r.h);
  }
}

export function packRects(items: readonly PackItem[], pageSize = 2048, padding = 1): PackResult {
  // Innen mit Rand packen; der Rand der letzten Spalte/Zeile wird abgeschnitten.
  const bins: (Bin | { oversize: PackedPage })[] = [];
  const placements: Placement[] = [];
  for (const item of items) {
    if (item.width <= 0 || item.height <= 0) throw new Error(`${item.name}: leeres Rechteck`);
    const w = item.width + padding;
    const h = item.height + padding;
    if (item.width > pageSize || item.height > pageSize) {
      bins.push({ oversize: { width: item.width, height: item.height } });
      placements.push({
        name: item.name,
        page: bins.length - 1,
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
      });
      continue;
    }
    let placed = false;
    for (const [page, bin] of bins.entries()) {
      if (!(bin instanceof Bin)) continue;
      const spot = bin.find(w, h);
      if (!spot) continue;
      bin.place({ x: spot.x, y: spot.y, w, h });
      placements.push({
        name: item.name,
        page,
        x: spot.x,
        y: spot.y,
        width: item.width,
        height: item.height,
      });
      placed = true;
      break;
    }
    if (!placed) {
      const bin = new Bin(pageSize + padding);
      bins.push(bin);
      bin.place({ x: 0, y: 0, w, h });
      placements.push({
        name: item.name,
        page: bins.length - 1,
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
      });
    }
  }
  const pages = bins.map((b) =>
    b instanceof Bin ? { width: b.usedW - padding, height: b.usedH - padding } : b.oversize,
  );
  return { pages, placements };
}
