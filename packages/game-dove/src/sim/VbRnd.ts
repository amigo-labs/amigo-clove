/**
 * VB6-`Rnd`: `seed = (seed · 1140671485 + 12820163) mod 2^24`, `Rnd = seed / 2^24`.
 *
 * Das Original säte per `Randomize` aus der Uhr; der Port sät aus dem Replay.
 * Alle Ableitungen rechnen exakt mit Ganzzahlen (bzw. exakten Double-Vergleichen
 * gegen `p · 2^24`), damit der Zufall auf jeder Plattform bitgleich ist.
 */
export const VB_RND_DEFAULT_SEED = 0x50000;

export class VbRnd {
  seed: number;

  constructor(seed = VB_RND_DEFAULT_SEED) {
    this.seed = seed & 0xffffff;
  }

  /** Nächster Rohwert in [0, 2^24). */
  next(): number {
    this.seed = (Math.imul(this.seed, 0x43fd43fd) + 0xc39ec3) & 0xffffff;
    return this.seed;
  }

  /** `Int(Rnd · n)`. */
  below(n: number): number {
    return Math.floor((this.next() * n) / 0x1000000);
  }

  /** `Rnd < p`. */
  less(p: number): boolean {
    return this.next() < p * 0x1000000;
  }

  /** `Rnd > p`. */
  greater(p: number): boolean {
    return this.next() > p * 0x1000000;
  }
}
