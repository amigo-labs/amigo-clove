/** Rechteckwerte bis hier passen in 12 Bit (Atlasseiten sind höchstens 4096 Pixel breit). */
const RECT_LIMIT = 1 << 12;

const fits = (v: number) => Number.isInteger(v) && v >= 0 && v < RECT_LIMIT;

/**
 * Ausschnitt (x, y, w, h; w, h ab -1 = bis zum Rand) als eine Zahl, damit die
 * Suche je Sprite keinen Schlüssel-String baut; `NaN` für Werte außerhalb von 12 Bit.
 */
function packRect(x: number, y: number, w: number, h: number): number {
  if (!fits(x) || !fits(y) || !fits(w + 1) || !fits(h + 1)) return Number.NaN;
  return ((x * RECT_LIMIT + y) * RECT_LIMIT + w + 1) * RECT_LIMIT + h + 1;
}

/**
 * Werte je Bild-Schlüssel und Ausschnitt, z. B. Teiltexturen, die einmal je
 * Rechteck entstehen sollen. Gesucht wird mit dem Rechteck als einer Zahl;
 * seltene Rechtecke (gebrochen, negativ, zu groß) liegen unter einem String.
 */
export class RectCache<V> {
  private readonly byKey = new Map<string, Map<number, V>>();
  private readonly odd = new Map<string, V>();

  get(key: string, x: number, y: number, w: number, h: number): V | undefined {
    const packed = packRect(x, y, w, h);
    if (Number.isNaN(packed)) return this.odd.get(`${key}|${x},${y},${w},${h}`);
    return this.byKey.get(key)?.get(packed);
  }

  set(key: string, x: number, y: number, w: number, h: number, value: V): void {
    const packed = packRect(x, y, w, h);
    if (Number.isNaN(packed)) {
      this.odd.set(`${key}|${x},${y},${w},${h}`, value);
      return;
    }
    let byRect = this.byKey.get(key);
    if (!byRect) this.byKey.set(key, (byRect = new Map()));
    byRect.set(packed, value);
  }

  *values(): IterableIterator<V> {
    for (const byRect of this.byKey.values()) yield* byRect.values();
    yield* this.odd.values();
  }

  clear(): void {
    this.byKey.clear();
    this.odd.clear();
  }
}
