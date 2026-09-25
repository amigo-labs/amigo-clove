/**
 * Replay = Startparameter + Eingabe pro Tick + Kontroll-Hashes.
 *
 * Eingaben sind Bitmasken (eine Zahl pro Tick, Semantik gehört dem Spiel) und
 * werden lauflängenkodiert gespeichert: Spieler halten Tasten über viele Ticks.
 */

export const HASH_INTERVAL = 64;

export interface Replay {
  readonly version: 1;
  readonly game: string;
  readonly level: string;
  readonly seed: number;
  readonly ticks: number;
  /** Lauflängen: `[mask, count, mask, count, …]`. */
  readonly input: readonly number[];
  /** Hash des Weltzustands nach jedem `HASH_INTERVAL`-ten Tick. */
  readonly hashes: readonly number[];
}

export function encodeInput(masks: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < masks.length; i++) {
    const m = masks[i] as number;
    const n = out.length;
    if (n > 0 && out[n - 2] === m) out[n - 1] = (out[n - 1] as number) + 1;
    else out.push(m, 1);
  }
  return out;
}

export function decodeInput(runs: readonly number[]): Uint16Array {
  let total = 0;
  for (let i = 1; i < runs.length; i += 2) total += runs[i] as number;
  const out = new Uint16Array(total);
  let p = 0;
  for (let i = 0; i < runs.length; i += 2) {
    out.fill(runs[i] as number, p, p + (runs[i + 1] as number));
    p += runs[i + 1] as number;
  }
  return out;
}

/** Erster Index in `hashes`, an dem `actual` abweicht, sonst -1. */
export function firstDivergence(expected: readonly number[], actual: readonly number[]): number {
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) if (expected[i] !== actual[i]) return i;
  return -1;
}
