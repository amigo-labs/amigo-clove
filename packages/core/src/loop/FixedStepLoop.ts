/**
 * Fixed-Step-Takt, getrennt vom Rendering.
 *
 * Die Shell ruft `frame(now)` einmal pro `requestAnimationFrame` und führt so
 * viele Simulationsticks aus, wie zurückgegeben werden. Liegt die Simulation
 * mehr als `maxCatchUp` Ticks zurück (Tab im Hintergrund, Debugger), wird der
 * Rest verworfen statt nachgeholt — sonst feuerte eine Salve identischer Ticks
 * samt Sounds. Die Uhr wird übergeben, nie gelesen: der Takt selbst ist damit
 * deterministisch testbar.
 */
export class FixedStepLoop {
  private last: number | undefined;
  private accumulator = 0;

  constructor(
    readonly tickMs: number,
    readonly maxCatchUp = 5,
  ) {
    if (!(tickMs > 0)) throw new RangeError(`tickMs muss positiv sein, ist ${tickMs}`);
  }

  /** Anzahl auszuführender Ticks seit dem letzten Aufruf. */
  frame(now: number): number {
    if (this.last === undefined || now < this.last) {
      this.reset(now);
      return 0;
    }
    this.accumulator += now - this.last;
    this.last = now;
    const due = Math.floor(this.accumulator / this.tickMs);
    if (due > this.maxCatchUp) {
      this.accumulator = 0;
      return this.maxCatchUp;
    }
    this.accumulator -= due * this.tickMs;
    return due;
  }

  /** Nach Pause oder `document.hidden`: angesammelte Zeit verwerfen. */
  reset(now: number): void {
    this.last = now;
    this.accumulator = 0;
  }

  /** Anteil des nächsten Ticks, 0 ≤ alpha < 1 (für optionale Interpolation). */
  get alpha(): number {
    return this.accumulator / this.tickMs;
  }
}
