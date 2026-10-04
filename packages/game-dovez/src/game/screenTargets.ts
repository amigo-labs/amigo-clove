import { followResolution } from "@clove/pixi-kit";
import { type Container, RenderTexture, type Renderer, Sprite } from "pixi.js";

/**
 * Render-Ziele der Canvas-Übergänge (Abblende, Start-Logos), einmal je Spiel
 * angelegt: `shot` (Kopie des letzten Bilds, auch die Momentaufnahme fürs
 * Mosaik), `back` (Backbuffer, auf dem jeder Durchlauf weiterzeichnet) und
 * `tmp` (Zeilenkopien innerhalb des Backbuffers).
 */
export class ScreenTargets {
  readonly shot = RenderTexture.create({ width: 800, height: 600 });
  readonly back = RenderTexture.create({ width: 800, height: 600 });
  readonly tmp = RenderTexture.create({ width: 800, height: 600 });
  private readonly backCopy = new Sprite(this.back);

  constructor(readonly renderer: Renderer) {}

  /** Zeichnet `container` nach `target`; `clear` löscht vorher schwarz. In HD folgen die Ziele der Auflösung. */
  draw(container: Container, target: RenderTexture, clear = false): void {
    for (const t of [this.shot, this.back, this.tmp])
      followResolution(this.renderer, t, t !== this.tmp);
    this.renderer.render({ container, target, clear, clearColor: [0, 0, 0, 1] });
  }

  /** Backbuffer nach `tmp` (Quelle für Blits innerhalb des Backbuffers). */
  copyBack(): void {
    this.draw(this.backCopy, this.tmp, true);
  }

  destroy(): void {
    this.backCopy.destroy();
    for (const t of [this.shot, this.back, this.tmp]) t.destroy(true);
  }
}
