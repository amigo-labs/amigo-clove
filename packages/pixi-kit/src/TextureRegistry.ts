import type { AssetStore } from "@clove/core";
import { Assets, Rectangle, Texture, type TextureSource } from "pixi.js";

/** Der Teil des Pixi-Renderers, der eine Textur auf die GPU bringt. */
export interface TextureUploader {
  readonly texture: { initSource(source: TextureSource): void };
}

/**
 * Lädt Bild-Assets per ID und schneidet Teilrechtecke daraus.
 *
 * Besitzt alle erzeugten Texturen und gibt sie in `destroy()` frei — die Shell
 * wechselt zwischen Spielen, und jede vergessene Textur bleibt im VRAM.
 * Mit `gpu` lädt `load` die Bilder gleich hoch: Pixi täte es erst beim ersten
 * Zeichnen, und eine Atlasseite mitten im Level kostet ein Bild.
 */
export class TextureRegistry {
  private readonly sources = new Map<string, Texture>();
  private readonly frames: Texture[] = [];

  constructor(
    private readonly assets: AssetStore,
    private readonly gpu?: TextureUploader,
  ) {}

  async load(ids: readonly string[]): Promise<void> {
    await Promise.all(
      ids
        .filter((id) => !this.sources.has(id))
        .map(async (id) => {
          const url = this.assets.url(id);
          const texture = await Assets.load<Texture>({ src: url, parser: "texture" });
          texture.source.scaleMode = "nearest";
          this.gpu?.texture.initSource(texture.source);
          this.sources.set(id, texture);
        }),
    );
  }

  get(id: string): Texture {
    const t = this.sources.get(id);
    if (!t) throw new Error(`Textur ${id} ist nicht geladen`);
    return t;
  }

  /** Teiltextur `x, y, width, height` in Pixeln des Atlas. */
  frame(id: string, x: number, y: number, width: number, height: number): Texture {
    const source = this.get(id).source;
    const t = new Texture({ source, frame: new Rectangle(x, y, width, height) });
    this.frames.push(t);
    return t;
  }

  /** Gibt einzelne Bilder frei (z. B. die Atlasseiten eines Levels beim Levelwechsel). */
  unload(ids: readonly string[]): void {
    for (const id of ids) {
      if (!this.sources.delete(id)) continue;
      void Assets.unload(this.assets.url(id));
    }
  }

  destroy(): void {
    for (const t of this.frames) t.destroy(false);
    this.frames.length = 0;
    for (const id of this.sources.keys()) void Assets.unload(this.assets.url(id));
    this.sources.clear();
  }
}
