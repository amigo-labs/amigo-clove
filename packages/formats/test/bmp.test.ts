import { describe, expect, test } from "bun:test";
import { BmpError, applyColorKey, decodeBmp, paletteKeyReport } from "../src/index";
import { doveSpriteNames, readBytes, DOVE_DATA } from "./fixtures";
import { join } from "node:path";

interface BuildOptions {
  width: number;
  height: number;
  bpp: 1 | 4 | 8 | 16 | 24 | 32;
  /** Zeilen von oben nach unten; pro Pixel der Rohwert (Index bzw. gepackter Wert). */
  rows: number[][];
  palette?: [number, number, number][];
  topDown?: boolean;
  masks?: [number, number, number];
  coreHeader?: boolean;
}

/** Minimaler BMP-Encoder, nur für Tests. */
function buildBmp(o: BuildOptions): Uint8Array {
  const headerSize = o.coreHeader ? 12 : 40;
  const maskBytes = o.masks ? 12 : 0;
  const entry = o.coreHeader ? 3 : 4;
  const palBytes = (o.palette?.length ?? 0) * entry;
  const stride = Math.ceil((o.width * o.bpp) / 32) * 4;
  const offset = 14 + headerSize + maskBytes + palBytes;
  const buf = new Uint8Array(offset + stride * o.height);
  const v = new DataView(buf.buffer);
  buf[0] = 0x42;
  buf[1] = 0x4d;
  v.setUint32(2, buf.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, headerSize, true);
  if (o.coreHeader) {
    v.setUint16(18, o.width, true);
    v.setInt16(20, o.height, true);
    v.setUint16(22, 1, true);
    v.setUint16(24, o.bpp, true);
  } else {
    v.setInt32(18, o.width, true);
    v.setInt32(22, o.topDown ? -o.height : o.height, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, o.bpp, true);
    v.setUint32(30, o.masks ? 3 : 0, true);
    v.setUint32(46, o.palette?.length ?? 0, true);
  }
  let p = 14 + headerSize;
  for (const m of o.masks ?? []) {
    v.setUint32(p, m, true);
    p += 4;
  }
  for (const [r, g, b] of o.palette ?? []) {
    buf[p] = b;
    buf[p + 1] = g;
    buf[p + 2] = r;
    p += entry;
  }
  o.rows.forEach((row, y) => {
    const base = offset + (o.topDown ? y : o.height - 1 - y) * stride;
    row.forEach((value, x) => {
      if (o.bpp < 8) {
        const perByte = 8 / o.bpp;
        const shift = 8 - o.bpp * ((x % perByte) + 1);
        const i = base + Math.floor(x / perByte);
        buf[i] = (buf[i] as number) | (value << shift);
      } else if (o.bpp === 8) buf[base + x] = value;
      else if (o.bpp === 16) v.setUint16(base + x * 2, value, true);
      else if (o.bpp === 24) {
        buf[base + x * 3] = value & 0xff;
        buf[base + x * 3 + 1] = (value >> 8) & 0xff;
        buf[base + x * 3 + 2] = (value >> 16) & 0xff;
      } else v.setUint32(base + x * 4, value >>> 0, true);
    });
  });
  return buf;
}

function pixel(img: { width: number; rgba: Uint8Array }, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4;
  return Array.from(img.rgba.subarray(o, o + 4));
}

describe("decodeBmp — synthetische Bilder", () => {
  const pal: [number, number, number][] = [
    [0, 0, 0],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ];

  test("1 bpp, bottom-up, Zeilen-Padding", () => {
    const img = decodeBmp(
      buildBmp({
        width: 9,
        height: 2,
        bpp: 1,
        palette: [
          [0, 0, 0],
          [255, 255, 255],
        ],
        rows: [
          [1, 0, 0, 0, 0, 0, 0, 0, 1],
          [0, 1, 0, 0, 0, 0, 0, 1, 0],
        ],
      }),
    );
    expect([img.width, img.height, img.bitsPerPixel]).toEqual([9, 2, 1]);
    expect(pixel(img, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(img, 8, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(img, 1, 1)).toEqual([255, 255, 255, 255]);
    expect(pixel(img, 0, 1)).toEqual([0, 0, 0, 255]);
    expect(Array.from(img.indices ?? [])).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
  });

  test("4 bpp mit ungerader Breite", () => {
    const img = decodeBmp(
      buildBmp({ width: 3, height: 1, bpp: 4, palette: pal, rows: [[1, 2, 3]] }),
    );
    expect(pixel(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(img, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(img, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  test("8 bpp top-down", () => {
    const img = decodeBmp(
      buildBmp({
        width: 2,
        height: 2,
        bpp: 8,
        palette: pal,
        topDown: true,
        rows: [
          [1, 0],
          [3, 2],
        ],
      }),
    );
    expect(pixel(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(img, 0, 1)).toEqual([0, 0, 255, 255]);
    expect(pixel(img, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  test("8 bpp mit BITMAPCOREHEADER (3-Byte-Palette)", () => {
    const img = decodeBmp(
      buildBmp({ width: 2, height: 1, bpp: 8, palette: pal, coreHeader: true, rows: [[2, 3]] }),
    );
    expect(pixel(img, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(img, 1, 0)).toEqual([0, 0, 255, 255]);
  });

  test("16 bpp 555 mit Bit-Replikation", () => {
    // r=31, g=0, b=16 → 255, 0, 132 (16<<3 | 16>>2)
    const img = decodeBmp(buildBmp({ width: 1, height: 1, bpp: 16, rows: [[(31 << 10) | 16]] }));
    expect(pixel(img, 0, 0)).toEqual([255, 0, 132, 255]);
  });

  test("16 bpp 565 über BI_BITFIELDS", () => {
    // g=63 → 255, g=32 → 130 (32<<2 | 32>>4)
    const img = decodeBmp(
      buildBmp({
        width: 2,
        height: 1,
        bpp: 16,
        masks: [0xf800, 0x07e0, 0x001f],
        rows: [[63 << 5, 32 << 5]],
      }),
    );
    expect(pixel(img, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(img, 1, 0)).toEqual([0, 130, 0, 255]);
  });

  test("24 bpp mit Zeilen-Padding", () => {
    const img = decodeBmp(
      buildBmp({ width: 1, height: 2, bpp: 24, rows: [[0x102030], [0xa0b0c0]] }),
    );
    expect(pixel(img, 0, 0)).toEqual([0x10, 0x20, 0x30, 255]);
    expect(pixel(img, 0, 1)).toEqual([0xa0, 0xb0, 0xc0, 255]);
  });

  test("32 bpp: das vierte Byte ist Müll, Alpha ist immer 255", () => {
    const img = decodeBmp(buildBmp({ width: 1, height: 1, bpp: 32, rows: [[0x7f112233]] }));
    expect(pixel(img, 0, 0)).toEqual([0x11, 0x22, 0x33, 255]);
  });

  test("Colorkey: reines Schwarz wird transparent, Beinahe-Schwarz nicht", () => {
    const img = decodeBmp(
      buildBmp({ width: 3, height: 1, bpp: 24, rows: [[0x000000, 0x000001, 0x010000]] }),
    );
    const keyed = applyColorKey(img);
    expect([keyed[3], keyed[7], keyed[11]]).toEqual([0, 255, 255]);
    expect(img.rgba[3]).toBe(255);
  });

  test("Palettenbericht erkennt auseinanderfallendes Index- und RGB-Keying", () => {
    const clean = decodeBmp(
      buildBmp({ width: 2, height: 1, bpp: 8, palette: pal, rows: [[0, 1]] }),
    );
    expect(paletteKeyReport(clean)?.ambiguous).toBe(false);
    const twoBlacks = decodeBmp(
      buildBmp({ width: 2, height: 1, bpp: 8, palette: [...pal, [0, 0, 0]], rows: [[0, 4]] }),
    );
    expect(paletteKeyReport(twoBlacks)).toEqual({
      index0IsBlack: true,
      usedBlackIndices: [0, 4],
      ambiguous: true,
    });
    const redIndex0 = decodeBmp(
      buildBmp({ width: 1, height: 1, bpp: 8, palette: [[9, 0, 0]], rows: [[0]] }),
    );
    expect(paletteKeyReport(redIndex0)?.ambiguous).toBe(true);
  });

  test("Fehler statt stiller Fehldekodierung", () => {
    expect(() => decodeBmp(new Uint8Array(64))).toThrow(BmpError);
    const rle = buildBmp({ width: 1, height: 1, bpp: 8, palette: pal, rows: [[0]] });
    new DataView(rle.buffer).setUint32(30, 1, true);
    expect(() => decodeBmp(rle)).toThrow(/Kompression 1/);
    const cut = buildBmp({ width: 4, height: 4, bpp: 24, rows: [] }).subarray(0, 60);
    expect(() => decodeBmp(cut)).toThrow(/abgeschnitten/);
  });
});

/**
 * Palettierte Grafiken, bei denen Index-0-Keying und RGB-Schwarz-Keying
 * auseinanderfallen. Beide sind unkritisch, solange RGB-Keying gilt:
 * `Explosion.spr` hat Schwarz auf Index 255 (Index 0 ist Gelb, 18 Pixel) — ein
 * Index-0-Key wäre sichtbar falsch; `background5.spr` enthält kein Schwarz und
 * wird ohnehin nicht gekeyt. Jede weitere Datei hier ist ein neuer Befund.
 */
const KNOWN_PALETTE_KEY_AMBIGUITIES = ["Explosion.spr", "background5.spr"];

describe("decodeBmp — alle DOVE-Grafiken", () => {
  const names = doveSpriteNames();

  test("60 Grafiken vorhanden (dazu METROID.dat, kein Bild)", () => {
    expect(names).toHaveLength(60);
  });

  test.each(names)("%s dekodiert mit Header-Abmessungen", async (name) => {
    const bytes = await readBytes(join(DOVE_DATA, "Grafik", name));
    const img = decodeBmp(bytes);
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    expect(img.width).toBe(v.getInt32(18, true));
    expect(img.height).toBe(Math.abs(v.getInt32(22, true)));
    expect(img.rgba.length).toBe(img.width * img.height * 4);
    if (img.bitsPerPixel <= 8) {
      expect(paletteKeyReport(img)?.ambiguous).toBe(KNOWN_PALETTE_KEY_AMBIGUITIES.includes(name));
    }
  });
});
