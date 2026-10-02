import type { TextureRegistry } from "@clove/pixi-kit";
import { Texture } from "pixi.js";

/**
 * Teiltexturen aus der `TextureRegistry`, einmal je Rechteck erzeugt. Die
 * Registry legt bei jedem `frame()` eine neue Textur an — ohne Cache liefe
 * der VRAM-Verbrauch mit jedem Bild weiter.
 */
export class FrameCache {
  private readonly frames = new Map<string, Texture>();

  constructor(readonly textures: TextureRegistry) {}

  get(id: string, x: number, y: number, w: number, h: number): Texture {
    if (w <= 0 || h <= 0) return Texture.EMPTY;
    const key = `${id}:${x},${y},${w},${h}`;
    let t = this.frames.get(key);
    if (!t) {
      t = this.textures.frame(id, x, y, w, h);
      this.frames.set(key, t);
    }
    return t;
  }

  clear(): void {
    this.frames.clear();
  }
}
