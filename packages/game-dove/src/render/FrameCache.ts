import { RectCache, type TextureRegistry } from "@clove/pixi-kit";
import { Texture } from "pixi.js";

/**
 * Teiltexturen aus der `TextureRegistry`, einmal je Rechteck erzeugt. Die
 * Registry legt bei jedem `frame()` eine neue Textur an — ohne Cache liefe
 * der VRAM-Verbrauch mit jedem Bild weiter.
 */
export class FrameCache {
  private readonly frames = new RectCache<Texture>();

  constructor(readonly textures: TextureRegistry) {}

  get(id: string, x: number, y: number, w: number, h: number): Texture {
    if (w <= 0 || h <= 0) return Texture.EMPTY;
    let t = this.frames.get(id, x, y, w, h);
    if (!t) this.frames.set(id, x, y, w, h, (t = this.textures.frame(id, x, y, w, h)));
    return t;
  }

  clear(): void {
    this.frames.clear();
  }
}
