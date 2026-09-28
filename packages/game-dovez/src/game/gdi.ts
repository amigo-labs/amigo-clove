import type { AtlasJson } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import {
  CanvasTextMetrics,
  Rectangle,
  Text,
  TextStyle,
  Texture,
  fontStringFromTextStyle,
} from "pixi.js";

/**
 * GDI-Text der Bildschirme (`SetFont`/`Text` `0x57DE40`/`0x57DD50`) mit Pixi:
 * `CreateFontA` mit positiver Höhe h = Zellhöhe (Ascent + Descent), (x, y) =
 * linke obere Ecke der Zelle. Für Arial ist em ≈ 0,8696 · h, die Grundlinie
 * liegt bei y + 0,787 · h. „Orbit-B BT“ (Continue) fehlt auch dem Original —
 * GDI nimmt dann eine TrueType-Ersatzschrift, hier wie dort Arial.
 */
export const GDI_FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif";
const EM = 2048 / 2355;
const BASELINE = 0.787;

export class GdiText {
  readonly text: Text;
  private cell = 0;

  constructor(height: number, color: number) {
    this.text = new Text({ text: "", style: gdiStyle(height, color) });
    this.setHeight(height);
  }

  setHeight(height: number): void {
    if (height === this.cell) return;
    this.cell = height;
    this.text.style.fontSize = height * EM;
  }

  /** Setzt Text und linke obere Zellenecke. */
  set(s: string, x: number, y: number): this {
    this.text.text = s;
    const ascent = CanvasTextMetrics.measureFont(fontStringFromTextStyle(this.text.style)).ascent;
    this.text.position.set(x, Math.round(y + BASELINE * this.cell - ascent));
    return this;
  }

  /** `TextExtent`: Breite in px. */
  width(s: string): number {
    return CanvasTextMetrics.measureText(s, this.text.style).width;
  }

  destroy(): void {
    this.text.destroy();
  }
}

export function gdiStyle(height: number, color: number): TextStyle {
  return new TextStyle({ fontFamily: GDI_FONT, fontSize: height * EM, fill: color });
}

/** Textur eines Atlas-Sprites (ganzes Bild). */
export function atlasTexture(
  textures: TextureRegistry,
  atlas: AtlasJson,
  key: string,
): Texture | undefined {
  const s = atlas.sprites[key];
  const page = s && atlas.pages[s.page];
  if (!s || !page) return undefined;
  return new Texture({
    source: textures.get(page).source,
    frame: new Rectangle(s.x, s.y, s.w, s.h),
  });
}
