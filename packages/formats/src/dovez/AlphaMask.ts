import type { BmpImage } from "../bmp/BmpDecoder";

/**
 * DoveZ-Alphamasken: zu 79 Sprites `X.bmp` gibt es `XA.bmp` mit Graustufen-Alpha
 * (0 = durchsichtig, 255 = deckend). Diese Sprites werden überblendet statt
 * gekeyed. 64 Masken sind rein grau; bei den übrigen zählt der Mittelwert der
 * drei Kanäle (*geschätzt*). Vier weitere `…A.bmp` (`interface*_energyA`) sind
 * eigene Bilder, keine Masken.
 */

export class AlphaMaskError extends Error {
  override name = "AlphaMaskError";
}

export interface MaskOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * RGBA des Sprites mit Alpha aus der Maske. Die Maße müssen übereinstimmen,
 * außer mit ausdrücklichem `offset`: dann wird ein Ausschnitt der größeren
 * Maske ab `offset` verwendet (einziger Fall: `atlantis_saule2`, 190×520 zu
 * 200×540).
 */
export function applyAlphaMask(image: BmpImage, mask: BmpImage, offset?: MaskOffset): Uint8Array {
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;
  if (!offset && (mask.width !== image.width || mask.height !== image.height)) {
    throw new AlphaMaskError(
      `Maske ${mask.width}×${mask.height} passt nicht zum Bild ${image.width}×${image.height}`,
    );
  }
  if (ox < 0 || oy < 0 || ox + image.width > mask.width || oy + image.height > mask.height) {
    throw new AlphaMaskError(`Ausschnitt ab (${ox}, ${oy}) liegt nicht in der Maske`);
  }
  const out = image.rgba.slice();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const m = ((y + oy) * mask.width + x + ox) * 4;
      const sum =
        (mask.rgba[m] as number) + (mask.rgba[m + 1] as number) + (mask.rgba[m + 2] as number);
      out[(y * image.width + x) * 4 + 3] = Math.round(sum / 3);
    }
  }
  return out;
}

/** Name der Maske zu einem Sprite (`Balken.bmp` → `balkena.bmp`), klein geschrieben. */
export function maskName(sprite: string): string {
  return sprite.toLowerCase().replace(/\.bmp$/, "a.bmp");
}
