import { type Container, Sprite, type Texture } from "pixi.js";

/** Wiederverwendete Sprites einer Ebene: pro Frame `begin()`, `put()`…, `end()`. */
export class SpritePool {
  private readonly sprites: Sprite[] = [];
  private used = 0;

  constructor(private readonly layer: Container) {}

  begin(): void {
    this.used = 0;
  }

  put(texture: Texture, x: number, y: number, tint = 0xffffff): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(texture);
      this.sprites.push(s);
      this.layer.addChild(s);
    }
    s.texture = texture;
    // Wiederverwendete Sprites können vorher per setSize skaliert worden sein.
    s.scale.set(1, 1);
    s.position.set(x, y);
    s.tint = tint;
    s.alpha = 1;
    s.visible = true;
    this.used++;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }
}
