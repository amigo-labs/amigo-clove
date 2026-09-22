import type { BmpImage } from "./BmpDecoder";

/**
 * Der Colorkey beider Spiele: reines Schwarz (0,0,0) ist transparent.
 *
 * Eine einzige Definition, die Konvertierung (Alpha), Konturableitung und
 * Terrain-Kollisionsmasken gemeinsam benutzen — weichen diese voneinander ab,
 * passt die Kollision nicht mehr zum Bild.
 */
export function isKeyed(rgba: Uint8Array, pixel: number): boolean {
  const o = pixel * 4;
  return rgba[o] === 0 && rgba[o + 1] === 0 && rgba[o + 2] === 0;
}

/** Kopie von `image.rgba` mit Alpha 0 auf allen Colorkey-Pixeln. */
export function applyColorKey(image: BmpImage): Uint8Array {
  const out = image.rgba.slice();
  const pixels = image.width * image.height;
  for (let i = 0; i < pixels; i++) {
    if (isKeyed(out, i)) out[i * 4 + 3] = 0;
  }
  return out;
}

export interface PaletteKeyReport {
  /** Palettenindex 0 löst zu reinem Schwarz auf. */
  readonly index0IsBlack: boolean;
  /** Tatsächlich benutzte Indizes, die zu reinem Schwarz auflösen. */
  readonly usedBlackIndices: readonly number[];
  /**
   * `true`, wenn ein Keying auf Index 0 (DirectDraw bei palettierten Surfaces)
   * ein anderes Ergebnis liefert als ein Keying auf RGB-Schwarz.
   */
  readonly ambiguous: boolean;
}

/**
 * Prüft bei palettierten Bildern, ob Index-Keying und RGB-Keying auseinanderfallen.
 * Liefert `undefined` für Truecolor-Bilder.
 */
export function paletteKeyReport(image: BmpImage): PaletteKeyReport | undefined {
  const { indices, palette } = image;
  if (!indices || !palette) return undefined;
  const used = new Set<number>(indices);
  const black = (i: number) =>
    palette[i * 4] === 0 && palette[i * 4 + 1] === 0 && palette[i * 4 + 2] === 0;
  const usedBlackIndices = [...used].filter(black).toSorted((a, b) => a - b);
  const index0IsBlack = black(0);
  const ambiguous = (used.has(0) && !index0IsBlack) || usedBlackIndices.some((i) => i !== 0);
  return { index0IsBlack, usedBlackIndices, ambiguous };
}
