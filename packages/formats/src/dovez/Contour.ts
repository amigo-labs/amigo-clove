import type { BmpImage } from "../bmp/BmpDecoder";
import { isKeyed } from "../bmp/colorKey";

/**
 * DoveZ-Konturdatei `<Sprite>.r` — die Kollisionsform eines Sprites.
 *
 * ```
 * i32 width, height      // Maße des zugehörigen BMP
 * i32 top, bottom        // erste und letzte belegte Zeile (-1/-1: leer)
 * height × (i32 left, i32 right)   // Spanne je Zeile, oben beginnend, leer = -1/-1
 * i32 -1, -1             // Abschluss
 * ```
 *
 * Die Spec (M0) nannte `bboxLeft, bboxRight, -1, -1` als Header; tatsächlich
 * sind es vier Felder, und das `-1, -1` war die erste (leere) Zeile.
 * Befund an allen 2587 Dateien: `docs/formats/dovez-container.md`.
 */

export class ContourError extends Error {
  override name = "ContourError";
}

/** Leere Zeile (auch in `top`/`bottom` eines leeren Sprites). */
export const R_EMPTY = -1;

export interface DovezContour {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
  /** `height` Paare `left, right`, verschachtelt; leer: `-1, -1`. */
  readonly spans: Int32Array;
}

export function parseContourR(bytes: Uint8Array): DovezContour {
  if (bytes.length < 24 || bytes.length % 4 !== 0) {
    throw new ContourError(`${bytes.length} Byte sind keine .r-Datei`);
  }
  const ints = new Int32Array(bytes.length / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < ints.length; i++) ints[i] = view.getInt32(i * 4, true);
  const [width = 0, height = 0, top = 0, bottom = 0] = ints;
  if (width <= 0 || height <= 0) throw new ContourError(`Maße ${width}×${height}`);
  if (ints.length !== 4 + 2 * height + 2) {
    throw new ContourError(`${bytes.length} Byte passen nicht zu Höhe ${height}`);
  }
  if (ints[4 + 2 * height] !== R_EMPTY || ints[5 + 2 * height] !== R_EMPTY) {
    throw new ContourError("Abschluss -1, -1 fehlt");
  }
  return { width, height, top, bottom, spans: ints.slice(4, 4 + 2 * height) };
}

export function serializeContourR(c: DovezContour): Uint8Array {
  const out = new Uint8Array(16 + c.spans.length * 4 + 8);
  const view = new DataView(out.buffer);
  const ints = [c.width, c.height, c.top, c.bottom, ...c.spans, R_EMPTY, R_EMPTY];
  ints.forEach((v, i) => view.setInt32(i * 4, v, true));
  return out;
}

/** Die Kontur, die sich aus den Pixeln ergäbe (Colorkey Schwarz), im `.r`-Schema. */
export function contourOfImage(image: BmpImage): DovezContour {
  const spans = new Int32Array(image.height * 2).fill(R_EMPTY);
  let top = R_EMPTY;
  let bottom = R_EMPTY;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (isKeyed(image.rgba, y * image.width + x)) continue;
      if (spans[y * 2] === R_EMPTY) spans[y * 2] = x;
      spans[y * 2 + 1] = x;
    }
    if (spans[y * 2] !== R_EMPTY) {
      if (top === R_EMPTY) top = y;
      bottom = y;
    }
  }
  return { width: image.width, height: image.height, top, bottom, spans };
}
