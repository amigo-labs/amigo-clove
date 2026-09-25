/**
 * Q16.16-Festkomma in 32-bit-Ganzzahlen.
 *
 * Die Simulation rechnet ausschließlich hiermit, nie mit Fließkomma: Nur so ist
 * der Tick-Hash über Browser, Bun und Node bit-stabil. Alle Funktionen sind
 * exakt (keine Rundung durch Doubles) und runden Richtung −∞.
 */

export type Fx = number;

export const FX_SHIFT = 16;
export const FX_ONE: Fx = 1 << FX_SHIFT;
export const FX_HALF: Fx = FX_ONE >> 1;

/** Ganzzahl oder exakter Literalwert → Fx. Nur für Konstanten und Ladezeit gedacht. */
export function fx(value: number): Fx {
  return Math.round(value * FX_ONE) | 0;
}

/** Fx → Ganzzahl, abgerundet (Pixelposition). */
export function fxFloor(a: Fx): number {
  return a >> FX_SHIFT;
}

/** Fx → Ganzzahl, kaufmännisch gerundet (.5 nach +∞). */
export function fxRound(a: Fx): number {
  return (a + FX_HALF) >> FX_SHIFT;
}

export function fxFromInt(n: number): Fx {
  return (n << FX_SHIFT) | 0;
}

/** `floor(a · b / 2^16)`, exakt: in 16-bit-Hälften zerlegt, alle Teilprodukte < 2^53. */
export function fxMul(a: Fx, b: Fx): Fx {
  const ah = a >> 16;
  const al = a & 0xffff;
  const bh = b >> 16;
  const bl = b & 0xffff;
  return ((Math.imul(ah, bh) << 16) + ah * bl + al * bh + ((al * bl) >>> 16)) | 0;
}

/** `floor(a · 2^16 / b)`. Exakt, weil |a · 2^16| < 2^47 und der Abstand zur nächsten Ganzzahl ≥ 1/|b|. */
export function fxDiv(a: Fx, b: Fx): Fx {
  if (b === 0) throw new RangeError("fxDiv durch 0");
  return Math.floor((a * FX_ONE) / b) | 0;
}
