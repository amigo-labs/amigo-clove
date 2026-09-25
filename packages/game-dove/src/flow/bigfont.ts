/**
 * Großschrift `text2.spr` (`GetBigLetter` `0x452180`, `PutBigText` `0x452B40`):
 * Zellen 60×75, 5 pro Zeile (Datei 300×600).
 */
export const BIG_W = 60;
export const BIG_H = 75;
const PER_ROW = 5;

/** A–Z → 0–25, 0–9 → 26–35, `(` 36, `)` 37, `:` 38, `-` 39, alles andere → 0 („A“). */
export function bigLetterIndex(ch: string): number {
  const c = ch.toUpperCase().charCodeAt(0);
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 48 && c <= 57) return c - 48 + 26;
  switch (ch) {
    case "(":
      return 36;
    case ")":
      return 37;
    case ":":
      return 38;
    case "-":
      return 39;
    default:
      return 0;
  }
}

/** Quellrechteck `[x, y]` der Zelle `i` in `text2.spr`. */
export function bigLetterRect(i: number): readonly [number, number] {
  return [(i % PER_ROW) * BIG_W, Math.floor(i / PER_ROW) * BIG_H];
}

/**
 * Glyphen einer Zeile wie `PutBigText(x, y, s)`: Zeichen k an x + 60·k,
 * Leerzeichen rücken vor ohne zu zeichnen. Liefert `[dx, sx, sy]` je Glyphe;
 * Glyphen ganz außerhalb von 0…640 entfallen (Clipping).
 */
export function layoutBigText(x: number, s: string, width = 640): [number, number, number][] {
  const out: [number, number, number][] = [];
  let k = 0;
  for (const ch of s) {
    const dx = x + BIG_W * k++;
    if (ch === " " || dx >= width || dx + BIG_W <= 0) continue;
    const [sx, sy] = bigLetterRect(bigLetterIndex(ch));
    out.push([dx, sx, sy]);
  }
  return out;
}
