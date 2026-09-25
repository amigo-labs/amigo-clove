/**
 * xorshift32 — der einzige Zufall der Simulation. Der Zustand ist eine Zahl
 * und gehört in den Snapshot; `Math.random` ist in `sim/**` verboten.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0 || 0x9e3779b9;
  }

  /** Nächster Wert in [1, 2^32). */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s;
  }

  /** Gleichverteilt genug in [0, n) für Spielzwecke (Modulo-Bias < 2^-24 bei n < 256). */
  int(n: number): number {
    if (!(n >= 1)) throw new RangeError(`Rng.int(${n})`);
    return this.next() % n;
  }
}
