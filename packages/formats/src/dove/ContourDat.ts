import { decodeCp1252 } from "../text/cp1252";

/**
 * `Data/Grafik/METROID.dat` — Kontur des Meteors aus Level 1 (`metroid.spr`, 60×60).
 *
 * Eine Zahl pro Zeile (VB6 `Print #`, mit Leerzeichen gepolstert): Paare
 * `left, right` je Bildzeile, abgeschlossen durch `0, 0`.
 */
export class ContourDatError extends Error {
  override name = "ContourDatError";
}

export function parseContourDat(bytes: Uint8Array): Int16Array {
  const numbers = decodeCp1252(bytes)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      if (!/^-?\d+$/.test(l)) throw new ContourDatError(`keine Zahl: '${l}'`);
      return Number(l);
    });
  if (numbers.length % 2 !== 0 || numbers.length < 2) {
    throw new ContourDatError(`ungerade Anzahl Werte (${numbers.length})`);
  }
  if (numbers.at(-2) !== 0 || numbers.at(-1) !== 0)
    throw new ContourDatError("Terminator 0, 0 fehlt");
  return Int16Array.from(numbers.slice(0, -2));
}
