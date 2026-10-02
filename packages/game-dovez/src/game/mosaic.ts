import type { KeyValueStore, UiImage } from "@clove/core";
import type { Renderer, RenderTexture } from "pixi.js";

interface Pixels {
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
}

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

  /**
   * Momentaufnahme aus `source` (800 × 600) verkleinert an den nächsten Platz.
   * Zurückgelesen und kodiert wird im Hintergrund: synchron hielt das den Frame
   * an, bis die GPU fertig war (beim Tod und beim Öffnen der Pause). Der Platz
   * ist sofort vergeben, die Kachel folgt einige Millisekunden später.
   */
  add(renderer: Renderer, source: RenderTexture): void {
    if (!this.persist || !globalThis.document) return;
    try {
      const at = Number(this.storage.get(NEXT_KEY) ?? 0) || 0;
      this.storage.set(NEXT_KEY, String((at + 1) % MOSAIC_TILES));
      void readPixels(renderer, source)
        .then(tileUrl)
        .then((url) => {
          if (url) this.storage.set(tileKey(at % MOSAIC_TILES), url);
        })
        .catch(() => undefined);
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

/**
 * Pixis `getPixels`, aber ohne zu warten: `readPixels` in einen Pixel-Puffer,
 * abgeholt, sobald ein Fence meldet, dass die GPU so weit ist. Ohne WebGL
 * (WebGPU) synchron über `extract`.
 */
function readPixels(renderer: Renderer, source: RenderTexture): Promise<Pixels> {
  if (!("gl" in renderer)) {
    const { pixels, width, height } = renderer.extract.pixels({ target: source });
    return Promise.resolve({ pixels: new Uint8ClampedArray(pixels), width, height });
  }
  const gl = renderer.gl;
  const targets = renderer.renderTarget;
  const gpu = targets.getGpuRenderTarget(targets.getRenderTarget(source));
  const { width, height } = source.frame;
  targets.adaptor.bindFramebuffer(gpu.resolveTargetFramebuffer);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const state = sync && !gl.isContextLost() ? gl.clientWaitSync(sync, 0, 0) : gl.WAIT_FAILED;
      if (state === gl.TIMEOUT_EXPIRED) {
        setTimeout(poll, 8);
        return;
      }
      if (sync && !gl.isContextLost()) gl.deleteSync(sync);
      if (state === gl.WAIT_FAILED) {
        gl.deleteBuffer(buffer);
        reject(new Error("Rücklesen fehlgeschlagen"));
        return;
      }
      const pixels = new Uint8ClampedArray(width * height * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteBuffer(buffer);
      resolve({ pixels, width, height });
    };
    setTimeout(poll, 0);
  });
}

/** Die Kachel wie bisher (`drawImage` verkleinert, WebP 0,8), kodiert ohne den Frame anzuhalten. */
async function tileUrl({ pixels, width, height }: Pixels): Promise<string | undefined> {
  const doc = globalThis.document;
  const shot = doc.createElement("canvas");
  shot.width = width;
  shot.height = height;
  shot.getContext("2d")?.putImageData(new ImageData(pixels, width, height), 0, 0);
  const tile = doc.createElement("canvas");
  tile.width = TILE_W;
  tile.height = TILE_H;
  const g = tile.getContext("2d");
  if (!g) return undefined;
  g.drawImage(shot, 0, 0, TILE_W, TILE_H);
  const blob = await new Promise<Blob | null>((done) => tile.toBlob(done, "image/webp", 0.8));
  if (!blob) return undefined;
  return new Promise((done, fail) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => done(reader.result as string));
    reader.addEventListener("error", () => fail(reader.error));
    reader.readAsDataURL(blob);
  });
}
