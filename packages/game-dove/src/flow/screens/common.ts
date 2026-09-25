import type { Gfx } from "../gfx";

/** DOVE-Logo `logo.spr`: 24 Frames à 235×100, 4 pro Zeile, alle 5 Aufrufe weiter (`Logo` `0x49D300`). */
export class LogoAnim {
  private calls = 0;
  private frame = 0;

  tick(): void {
    if (++this.calls >= 5) {
      this.calls = 0;
      if (++this.frame === 24) this.frame = 0;
    }
  }

  /** An (0, 10) mit Colorkey. */
  draw(g: Gfx, layer: number): void {
    const f = this.frame;
    g.blit(layer, "image/logo", (f % 4) * 235, Math.floor(f / 4) * 100, 235, 100, 0, 10);
  }
}
