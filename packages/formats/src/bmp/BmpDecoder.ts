/**
 * Eigener Windows-BMP-Decoder für beide Spiele.
 *
 * Unterstützt 1/4/8 bpp (palettiert), 16 bpp (555 oder BI_BITFIELDS),
 * 24 bpp und 32 bpp (BI_RGB oder BI_BITFIELDS), bottom-up und top-down,
 * sowie BITMAPCOREHEADER / BITMAPINFOHEADER / V4 / V5. RLE-Kompression kommt in
 * den Originaldaten nicht vor und wird abgelehnt statt still falsch dekodiert.
 *
 * Der Decoder setzt **keinen** Colorkey: `rgba` ist immer voll deckend
 * (auch bei 32 bpp — das gespeicherte vierte Byte ist in den Originalen Müll).
 * Transparenz ist ein eigener, expliziter Schritt, siehe `colorKey.ts`.
 */

export interface BmpImage {
  readonly width: number;
  readonly height: number;
  readonly bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32;
  /** Zeilen von oben nach unten, 4 Byte pro Pixel, Alpha immer 255. */
  readonly rgba: Uint8Array;
  /** Nur bei palettierten Bildern: Palettenindex pro Pixel, oben nach unten. */
  readonly indices?: Uint8Array;
  /** Nur bei palettierten Bildern: RGBA-Palette (Alpha 255). */
  readonly palette?: Uint8Array;
}

export class BmpError extends Error {
  override name = "BmpError";
}

const BI_RGB = 0;
const BI_BITFIELDS = 3;
const BI_ALPHABITFIELDS = 6;

interface Mask {
  shift: number;
  bits: number;
}

function mask(m: number): Mask {
  if (m === 0) return { shift: 0, bits: 0 };
  let shift = 0;
  while (((m >>> shift) & 1) === 0) shift++;
  let bits = 0;
  while (((m >>> (shift + bits)) & 1) === 1) bits++;
  return { shift, bits };
}

/** Expandiert einen n-Bit-Kanal per Bit-Replikation auf 8 Bit (5 → `v<<3 | v>>2`). */
function expand(value: number, bits: number): number {
  if (bits === 0) return 0;
  if (bits >= 8) return value >>> (bits - 8);
  let out = 0;
  let filled = 0;
  while (filled < 8) {
    out = (out << bits) | value;
    filled += bits;
  }
  return (out >>> (filled - 8)) & 0xff;
}

export function decodeBmp(bytes: Uint8Array): BmpImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new BmpError("keine BMP-Datei (Signatur 'BM' fehlt)");
  }
  const dataOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);

  let width: number;
  let rawHeight: number;
  let bpp: number;
  let compression = BI_RGB;
  let colorsUsed = 0;
  let paletteEntrySize = 4;
  let masks: [number, number, number] | undefined;

  if (headerSize === 12) {
    width = view.getUint16(18, true);
    rawHeight = view.getInt16(20, true);
    bpp = view.getUint16(24, true);
    paletteEntrySize = 3;
  } else if (headerSize >= 40) {
    width = view.getInt32(18, true);
    rawHeight = view.getInt32(22, true);
    bpp = view.getUint16(28, true);
    compression = view.getUint32(30, true);
    colorsUsed = view.getUint32(46, true);
    if (compression === BI_BITFIELDS || compression === BI_ALPHABITFIELDS) {
      // Bei V4/V5 stehen die Masken im Header, bei V3 direkt dahinter — beides an Offset 54.
      masks = [view.getUint32(54, true), view.getUint32(58, true), view.getUint32(62, true)];
    }
  } else {
    throw new BmpError(`unbekannte Headergröße ${headerSize}`);
  }

  if (compression !== BI_RGB && compression !== BI_BITFIELDS && compression !== BI_ALPHABITFIELDS) {
    throw new BmpError(`Kompression ${compression} wird nicht unterstützt`);
  }
  if (bpp !== 1 && bpp !== 4 && bpp !== 8 && bpp !== 16 && bpp !== 24 && bpp !== 32) {
    throw new BmpError(`${bpp} bpp wird nicht unterstützt`);
  }
  if (width <= 0 || rawHeight === 0) {
    throw new BmpError(`ungültige Abmessungen ${width}×${rawHeight}`);
  }

  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const stride = Math.ceil((width * bpp) / 32) * 4;
  if (dataOffset + stride * height > bytes.byteLength) {
    throw new BmpError("Pixeldaten abgeschnitten");
  }

  const rgba = new Uint8Array(width * height * 4);

  if (bpp <= 8) {
    const paletteStart = 14 + headerSize;
    // Ohne biClrUsed gilt 2^bpp; manche Schreiber kürzen die Palette trotzdem —
    // dann zählt, was zwischen Header und Pixeldaten tatsächlich Platz hat.
    const count =
      colorsUsed || Math.min(1 << bpp, Math.floor((dataOffset - paletteStart) / paletteEntrySize));
    if (count === 0 || paletteStart + count * paletteEntrySize > dataOffset) {
      throw new BmpError("Palette überlappt die Pixeldaten");
    }
    const palette = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      const p = paletteStart + i * paletteEntrySize;
      palette[i * 4] = bytes[p + 2] as number;
      palette[i * 4 + 1] = bytes[p + 1] as number;
      palette[i * 4 + 2] = bytes[p] as number;
      palette[i * 4 + 3] = 255;
    }
    const indices = new Uint8Array(width * height);
    const perByte = 8 / bpp;
    const pixelMask = (1 << bpp) - 1;
    for (let y = 0; y < height; y++) {
      const row = dataOffset + (topDown ? y : height - 1 - y) * stride;
      for (let x = 0; x < width; x++) {
        const byte = bytes[row + Math.floor(x / perByte)] as number;
        const shift = 8 - bpp * ((x % perByte) + 1);
        const index = (byte >> shift) & pixelMask;
        if (index >= count) {
          throw new BmpError(`Palettenindex ${index} außerhalb der Palette (${count})`);
        }
        const o = y * width + x;
        indices[o] = index;
        rgba[o * 4] = palette[index * 4] as number;
        rgba[o * 4 + 1] = palette[index * 4 + 1] as number;
        rgba[o * 4 + 2] = palette[index * 4 + 2] as number;
        rgba[o * 4 + 3] = 255;
      }
    }
    return { width, height, bitsPerPixel: bpp, rgba, indices, palette };
  }

  if (bpp === 24) {
    for (let y = 0; y < height; y++) {
      const row = dataOffset + (topDown ? y : height - 1 - y) * stride;
      for (let x = 0; x < width; x++) {
        const p = row + x * 3;
        const o = (y * width + x) * 4;
        rgba[o] = bytes[p + 2] as number;
        rgba[o + 1] = bytes[p + 1] as number;
        rgba[o + 2] = bytes[p] as number;
        rgba[o + 3] = 255;
      }
    }
    return { width, height, bitsPerPixel: 24, rgba };
  }

  const defaults: [number, number, number] =
    bpp === 16 ? [0x7c00, 0x03e0, 0x001f] : [0x00ff0000, 0x0000ff00, 0x000000ff];
  const [r, g, b] = (masks ?? defaults).map(mask) as [Mask, Mask, Mask];
  for (let y = 0; y < height; y++) {
    const row = dataOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const v = bpp === 16 ? view.getUint16(row + x * 2, true) : view.getUint32(row + x * 4, true);
      const o = (y * width + x) * 4;
      rgba[o] = expand((v >>> r.shift) & ((1 << r.bits) - 1), r.bits);
      rgba[o + 1] = expand((v >>> g.shift) & ((1 << g.bits) - 1), g.bits);
      rgba[o + 2] = expand((v >>> b.shift) & ((1 << b.bits) - 1), b.bits);
      rgba[o + 3] = 255;
    }
  }
  return { width, height, bitsPerPixel: bpp, rgba };
}
