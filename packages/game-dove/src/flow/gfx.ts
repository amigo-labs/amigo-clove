import type { TextureRegistry } from "@clove/pixi-kit";
import { Container, Filter, GlProgram, type Sprite, Texture, defaultFilterVert } from "pixi.js";
import { GLYPH_H, GLYPH_W, glyph } from "../render/font";
import { SpritePool } from "../render/SpritePool";
import { BIG_H, BIG_W, layoutBigText } from "./bigfont";

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

/**
 * Quell-Colorkey wie DirectDraw im 16-Bit-Modus: alles, was in RGB565 zu
 * Schwarz wird (r < 8, g < 4, b < 8), ist durchsichtig. Für Blätter, die das
 * Asset-Build opak ablegt (`titel`, `intro`), das Original aber gekeyed blittet.
 */
const COLOR_KEY_FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  bool key = c.r < 8.0 / 255.0 && c.g < 4.0 / 255.0 && c.b < 8.0 / 255.0;
  finalColor = key ? vec4(0.0) : c;
}`;

export function colorKeyFilter(): Filter {
  return new Filter({
    glProgram: GlProgram.from({
      vertex: defaultFilterVert,
      fragment: COLOR_KEY_FRAG,
      name: "dove-colorkey",
    }),
    resources: {},
    resolution: 1,
  });
}

export interface LayerOptions {
  /** Colorkey-Filter auf der Ebene (siehe `colorKeyFilter`). */
  readonly keyed?: boolean;
}

/**
 * Zeichenfläche eines Bildschirms: Ebenen mit je einem `SpritePool`, pro Bild
 * `begin()` … Zeichenbefehle … `end()`. Positionen ganzzahlig, Texte aus
 * `text.spr` (8×12) und `text2.spr` (60×75).
 */
export class Gfx {
  readonly root = new Container();
  private readonly pools: SpritePool[] = [];
  private readonly filters: Filter[] = [];

  constructor(
    readonly frames: FrameCache,
    layers: readonly LayerOptions[] = [{}],
  ) {
    for (const opt of layers) {
      const c = new Container();
      if (opt.keyed) {
        const f = colorKeyFilter();
        this.filters.push(f);
        c.filters = [f];
      }
      this.root.addChild(c);
      this.pools.push(new SpritePool(c));
    }
  }

  begin(): void {
    for (const p of this.pools) p.begin();
  }

  end(): void {
    for (const p of this.pools) p.end();
  }

  /** Rechteck (sx, sy, w, h) aus Bild `id` nach (dx, dy). */
  blit(
    layer: number,
    id: string,
    sx: number,
    sy: number,
    w: number,
    h: number,
    dx: number,
    dy: number,
  ): Sprite {
    const t = this.frames.get(id, sx, sy, w, h);
    return this.pools[layer]!.put(t, Math.round(dx), Math.round(dy));
  }

  /** Gefülltes Rechteck (BltColorFill). */
  fill(layer: number, x: number, y: number, w: number, h: number, color: number): Sprite {
    const s = this.pools[layer]!.put(Texture.WHITE, Math.round(x), Math.round(y), color);
    s.setSize(Math.max(0, w), Math.max(0, h));
    return s;
  }

  /** `PutText(x, y, s)`: `text.spr`, 8 px Vorschub, Leerzeichen ohne Glyphe. */
  text(layer: number, s: string, x: number, y: number, advance = GLYPH_W): void {
    let cx = x;
    for (const ch of s) {
      const g = glyph(ch);
      if (g) this.blit(layer, "image/text", g[0], g[1], GLYPH_W, GLYPH_H, cx, y);
      cx += advance;
    }
  }

  /** `PutBigText(x, y, s)`: `text2.spr`, 60 px je Zeichen, Clipping an 0…640. */
  bigText(layer: number, s: string, x: number, y: number): void {
    for (const [dx, sx, sy] of layoutBigText(x, s)) {
      this.blit(layer, "image/text2", sx, sy, BIG_W, BIG_H, dx, y);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
    for (const f of this.filters) f.destroy();
  }
}

/** Breite eines `text.spr`-Texts in Pixeln (für Zentrierung). */
export function textWidth(s: string): number {
  return [...s].length * GLYPH_W;
}

/**
 * Das Spielerschiff wie `Raumschiff` (`0x454390`): `ss.spr` (10, 22·Neigung)
 * 40×22, Flamme (3, 8·Flamme − 8) 6×8 links daneben. Neigung 0 gerade,
 * 1 steigend, 2 sinkend; Flamme 1…3.
 */
export function drawShip(
  g: Gfx,
  layer: number,
  x: number,
  y: number,
  tilt: number,
  flame: number,
): void {
  g.blit(layer, "image/ss", 10, 22 * tilt, 40, 22, x, y);
  if (flame >= 1 && flame <= 3) g.blit(layer, "image/ss", 3, 8 * flame - 8, 6, 8, x - 6, y + 9);
}
