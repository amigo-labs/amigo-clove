/**
 * Windows-1251 (Kyrillisch). Die russischen DoveZ-Funktexte (`<Level>R.txt`)
 * sind so kodiert. 0x98 ist unbelegt und wird wie im WHATWG-Encoding-Standard
 * zu U+0098; damit ist `encode(decode(bytes))` für jede Bytefolge die Identität.
 */
const HIGH: readonly number[] = [
  0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021, 0x20ac, 0x2030, 0x0409, 0x2039,
  0x040a, 0x040c, 0x040b, 0x040f, 0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x0098, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f, 0x00a0, 0x040e, 0x045e, 0x0408,
  0x00a4, 0x0490, 0x00a6, 0x00a7, 0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
  0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7, 0x0451, 0x2116, 0x0454, 0x00bb,
  0x0458, 0x0405, 0x0455, 0x0457,
];

export function decodeCp1251(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += String.fromCharCode(
      b < 0x80 ? b : b < 0xc0 ? (HIGH[b - 0x80] as number) : 0x0410 + (b - 0xc0),
    );
  }
  return out;
}

const REVERSE = new Map<number, number>(HIGH.map((cp, i) => [cp, 0x80 + i]));

/** Umkehrung von `decodeCp1251`; nicht darstellbare Zeichen sind ein Fehler. */
export function encodeCp1251(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    const high = REVERSE.get(cp);
    if (cp < 0x80) out[i] = cp;
    else if (high !== undefined) out[i] = high;
    else if (cp >= 0x0410 && cp <= 0x044f) out[i] = 0xc0 + (cp - 0x0410);
    else {
      throw new RangeError(
        `Zeichen U+${cp.toString(16).padStart(4, "0")} ist in CP1251 nicht darstellbar`,
      );
    }
  }
  return out;
}
