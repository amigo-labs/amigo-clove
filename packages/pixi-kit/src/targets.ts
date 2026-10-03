import { RenderTexture, type Renderer, Sprite } from "pixi.js";

/**
 * Render-Ziel auf die Auflösung des Renderers bringen (Umschalten auf HD, andere
 * Fenstergröße). Mit `keep` bleibt der Inhalt erhalten, vergrößert bzw.
 * verkleinert — für Ziele, die nie gelöscht werden (Backbuffer, Standbild).
 * `true`, wenn sich die Auflösung geändert hat.
 */
export function followResolution(
  renderer: Renderer,
  target: RenderTexture,
  keep: boolean,
): boolean {
  const resolution = renderer.resolution;
  const source = target.source;
  if (source.resolution === resolution) return false;
  const { width, height } = source;
  if (!keep) {
    target.resize(width, height, resolution);
    return true;
  }
  const copy = RenderTexture.create({
    width,
    height,
    resolution: source.resolution,
    scaleMode: source.scaleMode,
  });
  const sprite = new Sprite(target);
  renderer.render({ container: sprite, target: copy, clear: true });
  target.resize(width, height, resolution);
  sprite.texture = copy;
  renderer.render({ container: sprite, target, clear: true });
  sprite.destroy();
  copy.destroy(true);
  return true;
}
