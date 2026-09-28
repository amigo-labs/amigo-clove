import { type Container, RenderTexture, type Renderer, Sprite } from "pixi.js";

/**
 * Render-Ziele der Continue- und Pause-Bildschirme, einmal je Spiel angelegt:
 * `shot` (Kopie des letzten Spielbilds), `back` (der Backbuffer der
 * Bildschirme — beide zeichnen auf den Stand des vorigen Durchlaufs weiter),
 * `tmp` (Zeilenkopien innerhalb des Backbuffers), `blur` (`Blur.bmp` 64×64,
 * im Original als Render-Ziel benutzt) und `afterPause` (das letzte Pausebild,
 * Bereich 0…550, für die Überblende zurück ins Spiel).
 */
export class ScreenTargets {
  readonly shot = RenderTexture.create({ width: 800, height: 600 });
  readonly back = RenderTexture.create({ width: 800, height: 600 });
  readonly tmp = RenderTexture.create({ width: 800, height: 600 });
  readonly blur = RenderTexture.create({ width: 64, height: 64, scaleMode: "linear" });
  readonly afterPause = RenderTexture.create({ width: 800, height: 550 });
  private readonly blurDown = new Sprite(this.back);
  private readonly blurUp = new Sprite(this.blur);
  private readonly backCopy = new Sprite(this.back);

  constructor(readonly renderer: Renderer) {
    this.blurDown.scale.set(64 / 800, 64 / 600);
    this.blurUp.scale.set(800 / 64, 600 / 64);
  }

  /** Zeichnet `container` nach `target`; `clear` löscht vorher schwarz. */
  draw(container: Container, target: RenderTexture, clear = false): void {
    this.renderer.render({ container, target, clear, clearColor: [0, 0, 0, 1] });
  }

  /**
   * #176: das ganze Bild auf 64×64 verkleinern (Punktabtastung) und linear
   * gefiltert mit `alpha` über den Backbuffer legen.
   */
  blurOver(alpha: number): void {
    this.draw(this.blurDown, this.blur, true);
    this.blurUp.alpha = alpha;
    this.draw(this.blurUp, this.back);
  }

  /** Backbuffer nach `tmp` (Quelle für Blits innerhalb des Backbuffers). */
  copyBack(): void {
    this.draw(this.backCopy, this.tmp, true);
  }

  /** Das letzte Pausebild für die Überblende im Spiel. */
  keepAfterPause(): void {
    this.draw(this.backCopy, this.afterPause, true);
  }

  destroy(): void {
    for (const s of [this.blurDown, this.blurUp, this.backCopy]) s.destroy();
    for (const t of [this.shot, this.back, this.tmp, this.blur, this.afterPause]) t.destroy(true);
  }
}
