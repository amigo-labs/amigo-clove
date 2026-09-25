import {
  applyColorKey,
  decodeBmp,
  descrambleTiles,
  paletteKeyReport,
  parsePermutation,
} from "@clove/formats";
import sharp from "sharp";

/** Bei jeder Änderung an der Bildstufe erhöhen — invalidiert den Cache. */
export const IMAGE_CONVERTER_VERSION = 1;

export interface ImageOptions {
  readonly colorKeyed: boolean;
  /** libwebp-Aufwand 0–6; eingefroren, eine Änderung schreibt alle Bilder neu. */
  readonly effort: number;
  /** Encoder-Version gehört zum Cache-Schlüssel: anderes libwebp, andere Bytes. */
  readonly libwebp: string;
  /** Endbild B1–B5: Kacheln entwürfeln (Permutation als dritter Parameter). */
  readonly descramble?: boolean;
}

export const LIBWEBP_VERSION: string = sharp.versions.webp ?? "unknown";

export interface ImageResult {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Gesetzt, wenn Index-Keying (DirectDraw, palettiert) und RGB-Keying auseinanderfallen. */
  readonly warning?: string;
}

/**
 * BMP → WebP lossless. `exact` erhält auch die RGB-Werte transparenter Pixel,
 * damit die Dekodierung bytegleich zum gekeyten RGBA ist (sonst dürfte libwebp
 * sie beliebig ändern). Alpha ist ausschließlich 0 oder 255.
 */
export async function convertImage(
  bmp: Uint8Array,
  options: ImageOptions,
  permutation?: Uint8Array,
): Promise<ImageResult> {
  const image = decodeBmp(bmp);
  let rgba = options.colorKeyed ? applyColorKey(image) : image.rgba;
  // Endbilder B1–B5: Kacheln mit der Permutation aus Data/N.dat zurücksortieren.
  if (permutation)
    rgba = descrambleTiles(rgba, image.width, image.height, parsePermutation(permutation));
  const bytes = await sharp(rgba, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .webp({ lossless: true, exact: true, effort: options.effort })
    .toBuffer();
  const report = options.colorKeyed ? paletteKeyReport(image) : undefined;
  return {
    bytes: new Uint8Array(bytes),
    width: image.width,
    height: image.height,
    ...(report?.ambiguous
      ? {
          warning:
            `Index- und RGB-Keying fallen auseinander (Index 0 schwarz: ${report.index0IsBlack}, ` +
            `schwarze Indizes: ${report.usedBlackIndices.join(",") || "keine"}) — RGB-Keying verwendet`,
        }
      : {}),
  };
}

/** Dekodiert eine erzeugte WebP zurück nach RGBA (für Tests und `verify`). */
export async function decodeWebp(
  bytes: Uint8Array,
): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width: info.width, height: info.height };
}
