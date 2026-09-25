import type { Fx } from "@clove/core";

/**
 * cos(d°) in Q16.16 für d = 0…90, als Literal eingefroren (erzeugt mit
 * `Math.round(Math.cos(d·π/180)·65536)`). Die Simulation ruft nie `Math.cos`
 * auf: dessen letzte Stelle ist zwischen JS-Engines nicht garantiert gleich.
 * Das Original füllt dafür Tabellen `Me.[0x684]` (Cos) und `Me.[0x668]` (Sin).
 */
const COS_QUARTER: readonly number[] = [
  65536, 65526, 65496, 65446, 65376, 65287, 65177, 65048, 64898, 64729, 64540, 64332, 64104, 63856,
  63589, 63303, 62997, 62672, 62328, 61966, 61584, 61183, 60764, 60326, 59870, 59396, 58903, 58393,
  57865, 57319, 56756, 56175, 55578, 54963, 54332, 53684, 53020, 52339, 51643, 50931, 50203, 49461,
  48703, 47930, 47143, 46341, 45525, 44695, 43852, 42995, 42126, 41243, 40348, 39441, 38521, 37590,
  36647, 35693, 34729, 33754, 32768, 31772, 30767, 29753, 28729, 27697, 26656, 25607, 24550, 23486,
  22415, 21336, 20252, 19161, 18064, 16962, 15855, 14742, 13626, 12505, 11380, 10252, 9121, 7987,
  6850, 5712, 4572, 3430, 2287, 1144, 0,
];

/** cos in Q16.16 für ganzzahlige Grad (beliebiges Vorzeichen). */
export function cosDeg(deg: number): Fx {
  const d = ((deg % 360) + 360) % 360;
  if (d <= 90) return COS_QUARTER[d] as number;
  if (d <= 180) return -(COS_QUARTER[180 - d] as number);
  if (d <= 270) return -(COS_QUARTER[d - 180] as number);
  return COS_QUARTER[360 - d] as number;
}

export function sinDeg(deg: number): Fx {
  return cosDeg(deg - 90);
}
