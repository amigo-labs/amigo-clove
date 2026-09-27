import { type Container, Sprite, type Texture } from "pixi.js";

export interface DrawOptions {
  /** Farbe 0…1 je Kanal (D3D-Sprites), Vorgabe weiß. */
  readonly red?: number;
  readonly green?: number;
  readonly blue?: number;
  readonly alpha?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  /** Drehung in Grad um die Bildmitte. */
  readonly rotation?: number;
  readonly additive?: boolean;
}

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/**
 * Wiederverwendete Sprites einer Zeichenebene: je Frame `begin()`, `put()`…,
 * `end()`. Position ist die linke obere Ecke des unskalierten Bilds; skaliert
 * und gedreht wird um die Bildmitte wie im Original (`SetUpGeom`).
 */
export class SpriteBatch {
  private readonly sprites: Sprite[] = [];
  private used = 0;

  constructor(private readonly layer: Container) {}

  begin(): void {
    this.used = 0;
  }

  put(texture: Texture, x: number, y: number, o: DrawOptions = {}): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(texture);
      s.anchor.set(0.5, 0.5);
      this.sprites.push(s);
      this.layer.addChild(s);
    }
    s.texture = texture;
    const w = texture.frame.width;
    const h = texture.frame.height;
    s.position.set(x + w / 2, y + h / 2);
    s.scale.set(o.scaleX ?? 1, o.scaleY ?? 1);
    s.angle = o.rotation ?? 0;
    const r = Math.round(clamp01(o.red ?? 1) * 255);
    const g = Math.round(clamp01(o.green ?? 1) * 255);
    const b = Math.round(clamp01(o.blue ?? 1) * 255);
    s.tint = (r << 16) | (g << 8) | b;
    s.alpha = clamp01(o.alpha ?? 1);
    s.blendMode = o.additive ? "add" : "normal";
    s.visible = true;
    this.used++;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }
}
