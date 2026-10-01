import type { KeyValueStore, UiImage } from "@clove/core";
import type { Renderer, RenderTexture } from "pixi.js";

/**
 * Das Ladebild ohne `Take`-Bild (`App\Loadingscreen.bmp`, Einzellevel und
 * Epilog): ein 4 × 4-Mosaik aus Momentaufnahmen à 200 × 150.
 * `NewPictureToLoadingscreen` (`0x520F50`) legt beim Öffnen der Pause und
 * nach jedem Tod eine an, reihum an Platz `Me.1CC` (in der Konfiguration
 * gespeichert). Der Port legt die Kacheln als WebP beim Host ab.
 */

export const MOSAIC_TILES = 16;
const TILE_W = 200;
const TILE_H = 150;
const tileKey = (i: number) => `loading/${i}`;
const NEXT_KEY = "loading/next";

export class Mosaic {
  constructor(
    private readonly storage: KeyValueStore,
    private readonly persist: boolean,
  ) {}

  /** Momentaufnahme aus `source` (800 × 600) verkleinert an den nächsten Platz. */
  add(renderer: Renderer, source: RenderTexture): void {
    if (!this.persist) return;
    try {
      const shot = renderer.extract.canvas({ target: source }) as HTMLCanvasElement;
      const doc = globalThis.document;
      if (!doc) return;
      const tile = doc.createElement("canvas");
      tile.width = TILE_W;
      tile.height = TILE_H;
      const g = tile.getContext("2d");
      if (!g) return;
      g.drawImage(shot, 0, 0, TILE_W, TILE_H);
      const at = Number(this.storage.get(NEXT_KEY) ?? 0) || 0;
      this.storage.set(tileKey(at % MOSAIC_TILES), tile.toDataURL("image/webp", 0.8));
      this.storage.set(NEXT_KEY, String((at + 1) % MOSAIC_TILES));
    } catch {
      // Speicher voll oder kein Canvas: das Mosaik bleibt, wie es ist
    }
  }

  /** Das Mosaik als 800 × 600-Bild für den Ladebildschirm der Shell (leere Plätze schwarz). */
  async image(): Promise<UiImage | undefined> {
    const doc = globalThis.document;
    if (!doc) return undefined;
    const canvas = doc.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, 800, 600);
    await Promise.all(
      Array.from({ length: MOSAIC_TILES }, async (_, i) => {
        const url = this.storage.get(tileKey(i));
        if (!url) return;
        const img = new Image();
        img.src = url;
        try {
          await img.decode();
          g.drawImage(img, (i % 4) * TILE_W, Math.trunc(i / 4) * TILE_H);
        } catch {
          // kaputte Kachel: schwarz
        }
      }),
    );
    try {
      return { url: canvas.toDataURL("image/webp", 0.85), w: 800, h: 600, alt: "" };
    } catch {
      return undefined;
    }
  }
}
