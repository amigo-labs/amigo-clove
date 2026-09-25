import type { VbRnd } from "../sim/VbRnd";
import type { Gfx } from "./gfx";

export const STAR_COUNT = 1000;

/** Schriftzug „KATHA♥“ (`0x4128F4`…`0x412A1C`), jedes `*` wird ein Stern. */
export const KATHA: readonly string[] = [
  "*  *   *   ***** *  *   *     * *",
  "* *   * *    *   *  *  * *   * * *",
  "**   *****   *   **** *****  *   *",
  "* *  *   *   *   *  * *   *   * *",
  "*  * *   *   *   *  * *   *    *",
];

/** Farbe eines Titelsterns: Grau `64·Tempo − 1` (Tempo 1…4). */
export function starColor(speed: number): number {
  const g = 64 * speed - 1;
  return (g << 16) | (g << 8) | g;
}

/**
 * Sternenfeld des Titels (`0x4A9F7A`, Bewegung `0x4ABEAE`): 1000 Sterne,
 * x = Int(Rnd·640), y = Int(Rnd·480), Tempo Int(Rnd·4) + 1. Am linken Rand
 * neu mit x = 639 und frischem y/Tempo — auch die „KATHA“-Sterne, deren
 * Schriftzug nach einem Durchlauf zerfällt. Lebt über Titelaufrufe hinweg.
 */
export class TitleStars {
  readonly x = new Float64Array(STAR_COUNT);
  readonly y = new Int32Array(STAR_COUNT);
  readonly speed = new Float64Array(STAR_COUNT);
  readonly color = new Int32Array(STAR_COUNT);

  constructor(private readonly rnd: VbRnd) {
    for (let i = 0; i < STAR_COUNT; i++) {
      this.x[i] = rnd.below(640);
      this.y[i] = rnd.below(480);
      this.respeed(i);
    }
    // Easteregg (`0x4AA39F`): x = 500 + 17·Spalte, y = 300 + 17·Zeile, Tempo 1,0, RGB(84, 84, 64).
    let n = 0;
    KATHA.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        if (line[col] !== "*") continue;
        this.x[n] = 500 + 17 * col;
        this.y[n] = 300 + 17 * row;
        this.speed[n] = 1;
        this.color[n] = 0x545440;
        n++;
      }
    });
  }

  private respeed(i: number): void {
    const s = this.rnd.below(4) + 1;
    this.speed[i] = s;
    this.color[i] = starColor(s);
  }

  tick(): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = this.x[i]! - this.speed[i]!;
      if (x < 0) {
        this.x[i] = 639;
        this.y[i] = this.rnd.below(480);
        this.respeed(i);
      } else {
        this.x[i] = x;
      }
    }
  }

  draw(g: Gfx, layer: number): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      g.fill(layer, Math.floor(this.x[i]!), this.y[i]!, 1, 1, this.color[i]!);
    }
  }
}
