/**
 * `text.spr`: Glyphen 8×12, Rect (idx·8, row·12). Zuordnung aus `GetLetter`
 * (`0x4523B0`), siehe `docs/measurements/dove-player.md`.
 */
export const GLYPH_W = 8;
export const GLYPH_H = 12;

const ROW1 = "0123456789.|:()-'!_+\\/[]^&%,=$#";
const ROW2: Record<string, number> = { Ä: 0, Ö: 1, Ü: 2, "?": 3, ";": 4, ß: 6, "§": 7 };

/** Quellposition der Glyphe oder `undefined` für Leerzeichen. Unbekannt → (64, 24). */
export function glyph(ch: string): readonly [number, number] | undefined {
  if (ch === " ") return undefined;
  const c = ch.toUpperCase();
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90) return [(code - 65) * GLYPH_W, 0];
  if (c === '"') return [26 * GLYPH_W, 0];
  if (c === "@") return [27 * GLYPH_W, 0];
  const i1 = ROW1.indexOf(c);
  if (i1 >= 0) return [i1 * GLYPH_W, GLYPH_H];
  const i2 = ROW2[c];
  if (i2 !== undefined) return [i2 * GLYPH_W, 2 * GLYPH_H];
  return [64, 24];
}
