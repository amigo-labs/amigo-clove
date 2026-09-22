/**
 * Windows-1252 ohne Informationsverlust.
 *
 * Die fünf in CP1252 unbelegten Bytes (0x81, 0x8D, 0x8F, 0x90, 0x9D) werden wie
 * im WHATWG-Encoding-Standard auf die gleichnamigen C1-Steuerzeichen abgebildet.
 * Damit ist `encode(decode(bytes))` für jede Bytefolge die Identität — die
 * Voraussetzung für byte-identische Round-Trips.
 */

const HIGH: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const REVERSE = new Map<number, number>(HIGH.map((cp, i) => [cp, 0x80 + i]));

export function decodeCp1252(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += String.fromCharCode(b >= 0x80 && b < 0xa0 ? (HIGH[b - 0x80] as number) : b);
  }
  return out;
}

export function encodeCp1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    const mapped = REVERSE.get(cp);
    if (mapped !== undefined) {
      out[i] = mapped;
    } else if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) {
      out[i] = cp;
    } else {
      throw new RangeError(
        `Zeichen U+${cp.toString(16).padStart(4, "0")} ist in CP1252 nicht darstellbar`,
      );
    }
  }
  return out;
}
