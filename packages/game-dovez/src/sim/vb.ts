/**
 * VB6-Laufzeitsemantik, soweit DoveZ sie braucht. DoveZ rechnet in `Single`
 * (IEEE-754 binär32): jeder gespeicherte Zwischenwert läuft durch `f32`.
 */

export const f32 = Math.fround;

/** VB `CInt`/`CLng` (`__vbaFpI4`): halbe Werte zur geraden Zahl. */
export function cint(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** VB `Int`: abrunden. */
export const vbInt = Math.floor;

/** VB6-`Rnd` ohne `Randomize`: `seed = (seed · 0x43FD43FD + 0xC39EC3) mod 2^24`. */
export class VbRnd {
  constructor(public seed = 0x50000) {}

  next(): number {
    this.seed = (Math.imul(this.seed, 0x43fd43fd) + 0xc39ec3) & 0xffffff;
    return this.seed / 0x1000000;
  }
}

/** `Me.4B0`: π als Single. */
export const PI = f32(Math.atan(1) * 4);

/** Gradtabellen `Me.4C4` (sin) und `Me.4E0` (cos), 0…359 (`0x504330`). */
export const SIN_DEG = Float32Array.from({ length: 360 }, (_, d) => Math.sin((d * PI) / 180));
export const COS_DEG = Float32Array.from({ length: 360 }, (_, d) => Math.cos((d * PI) / 180));

/** `CosinusB`/`SinusB`: Tabellenzugriff mit auf 0…359 normiertem Winkel. */
export function degIndex(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** `Form1.Winkel` (`0x4A6FA0`): Richtung von (dx, dy) im Bogenmaß. */
export function winkel(dx: number, dy: number): number {
  if (dx === 0) return PI * (dy < 0 ? 1.5 : 0.5);
  const a = Math.atan(dy / dx);
  return dx < 0 ? a + PI : a;
}

/** `Form1.WinkelInGrad` (`0x4A7070`): Grad der Richtung (−dx, −dy), 0…360. */
export function winkelInGrad(dx: number, dy: number): number {
  let r: number;
  if (dx === 0) r = dy > 0 ? 270 : dy === 0 ? 0 : 90;
  else {
    r = (Math.atan(dy / dx) * 180) / PI;
    if (dx > 0) r += 180;
  }
  return r < 0 ? r + 360 : r;
}
