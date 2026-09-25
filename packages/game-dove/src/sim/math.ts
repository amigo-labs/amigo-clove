import { FX_SHIFT, type Fx } from "@clove/core";

/** VB6 `CLng`/`FpI4` auf Q16.16: Runden auf die nächste Ganzzahl, bei .5 zur geraden. */
export function roundHalfEven(a: Fx): number {
  const int = a >> FX_SHIFT;
  const frac = a & 0xffff;
  if (frac > 0x8000) return int + 1;
  if (frac === 0x8000) return int + (int & 1);
  return int;
}

/** `CLng(n / d)` für Ganzzahlen, d ≠ 0 — exakt, Runden half-even. */
export function divRoundHalfEven(n: number, d: number): number {
  if (d < 0) return divRoundHalfEven(-n, -d);
  const q = Math.floor(n / d);
  const r2 = 2 * (n - q * d);
  if (r2 > d) return q + 1;
  if (r2 === d) return q + (q & 1);
  return q;
}

/** VB6 `a \ b`: Ganzzahldivision mit Abschneiden Richtung 0. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Inklusiver AABB-Test, wie ihn das Original für Wände und Boxen verwendet. */
export function boxHit(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax <= bx + bw && ax + aw >= bx && ay <= by + bh && ay + ah >= by;
}
