import type { TextureRegistry } from "@clove/pixi-kit";
import { Texture } from "pixi.js";

/**
 * Teiltexturen aus der `TextureRegistry`, einmal je Rechteck erzeugt. Die
 * Registry legt bei jedem `frame()` eine neue Textur an — ohne Cache liefe
 * der VRAM-Verbrauch mit jedem Bild weiter. Gesucht wird je Bild-ID mit dem
 * Rechteck als einer Zahl, damit kein Schlüssel-String je Sprite entsteht.
 */
export class FrameCache {
  private readonly frames = new Map<string, Map<number, Texture>>();
  /** Rechtecke, die nicht in 12 Bit je Wert passen (gebrochen oder negativ). */
  private readonly odd = new Map<string, Texture>();

  constructor(readonly textures: TextureRegistry) {}

  get(id: string, x: number, y: number, w: number, h: number): Texture {
    if (w <= 0 || h <= 0) return Texture.EMPTY;
    const packed = packRect(x, y, w, h);
    if (Number.isNaN(packed)) {
      const key = `${id}:${x},${y},${w},${h}`;
      let t = this.odd.get(key);
      if (!t) this.odd.set(key, (t = this.textures.frame(id, x, y, w, h)));
      return t;
    }
    let byRect = this.frames.get(id);
    if (!byRect) this.frames.set(id, (byRect = new Map()));
    let t = byRect.get(packed);
    if (!t) byRect.set(packed, (t = this.textures.frame(id, x, y, w, h)));
    return t;
  }

  clear(): void {
    this.frames.clear();
    this.odd.clear();
  }
}

const fits = (v: number) => Number.isInteger(v) && v >= 0 && v < 4096;

function packRect(x: number, y: number, w: number, h: number): number {
  if (!fits(x) || !fits(y) || !fits(w) || !fits(h)) return Number.NaN;
  return ((x * 4096 + y) * 4096 + w) * 4096 + h;
}
