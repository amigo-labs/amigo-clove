import type { AtlasEntry, AtlasJson, GameHost, GameInstance } from "@clove/core";
import { LABEL_HEIGHT, contourEdges, layoutGrid, type GridLayout } from "./layout";

/**
 * Debug-Seite `#/dovez/debug/assets` (M6): zeigt jedes Sprite eines Atlas mit
 * überlagerter `.r`-Kontur. Canvas 2D, kein Pixi — die Seite prüft Assets,
 * nicht die Engine.
 *
 * Bedienung: ←/→ Atlas wechseln, ↑/↓ bzw. Mausrad scrollen, C Konturen an/aus,
 * Esc zurück zum Launcher. Rot: Kontur, gelb gerahmt: Sprite ohne Kontur.
 */

export const VIEW_WIDTH = 800;
export const VIEW_HEIGHT = 600;
const HEADER = 44;
const CELL = 128;
const SCROLL_STEP = 48;

interface LoadedAtlas {
  readonly entry: AtlasEntry;
  readonly json: AtlasJson;
  readonly pages: readonly ImageBitmap[];
  readonly contours?: Int16Array;
  readonly names: readonly string[];
  readonly grid: GridLayout;
}

export async function bootAssetViewer(host: GameHost): Promise<GameInstance> {
  const canvas = host.canvas;
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  // in kleinen Fenstern verkleinern, nie über die Originalgröße hinaus
  canvas.style.maxWidth = "100%";
  canvas.style.maxHeight = "100%";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D nicht verfügbar");
  ctx.imageSmoothingEnabled = false;

  const atlases = host.assets.manifest.entries.filter((e): e is AtlasEntry => e.kind === "atlas");
  if (atlases.length === 0) throw new Error("Manifest enthält keine Atlanten");
  const cache = new Map<string, Promise<LoadedAtlas>>();
  let index = 0;
  let scroll = 0;
  let showContours = true;
  let current: LoadedAtlas | undefined;
  let disposed = false;

  const load = (entry: AtlasEntry): Promise<LoadedAtlas> => {
    let p = cache.get(entry.id);
    if (!p) {
      p = (async () => {
        const json = await host.assets.json<AtlasJson>(entry.id);
        const pages = await Promise.all(
          json.pages.map(async (id) =>
            createImageBitmap(new Blob([(await host.assets.bytes(id)) as Uint8Array<ArrayBuffer>])),
          ),
        );
        const contourBytes = entry.contours ? await host.assets.bytes(entry.contours) : undefined;
        const contours = contourBytes
          ? new Int16Array(
              contourBytes.buffer.slice(
                contourBytes.byteOffset,
                contourBytes.byteOffset + contourBytes.byteLength,
              ),
            )
          : undefined;
        const names = Object.keys(json.sprites);
        const grid = layoutGrid(
          names.map((name) => ({ name, w: json.sprites[name]!.w, h: json.sprites[name]!.h })),
          VIEW_WIDTH - 16,
          CELL,
        );
        return { entry, json, pages, ...(contours ? { contours } : {}), names, grid };
      })();
      cache.set(entry.id, p);
    }
    return p;
  };

  const checker = (() => {
    const tile = new OffscreenCanvas(16, 16);
    const t = tile.getContext("2d") as OffscreenCanvasRenderingContext2D;
    t.fillStyle = "#1c2230";
    t.fillRect(0, 0, 16, 16);
    t.fillStyle = "#232b3c";
    t.fillRect(0, 0, 8, 8);
    t.fillRect(8, 8, 8, 8);
    return ctx.createPattern(tile, "repeat");
  })();

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.font = "12px monospace";
    ctx.textBaseline = "top";
    const entry = atlases[index]!;
    ctx.fillStyle = "#fc6";
    ctx.fillText(
      `${index + 1}/${atlases.length}  ${entry.id}  [${entry.bundles.join(", ")}]`,
      8,
      6,
    );
    ctx.fillStyle = "#999";
    if (!current || current.entry !== entry) {
      ctx.fillText("lädt …", 8, 24);
      return;
    }
    const a = current;
    const withContour = a.names.filter((n) => n in a.json.contours).length;
    const orphan = Object.keys(a.json.contours).filter((n) => !(n in a.json.sprites)).length;
    ctx.fillText(
      `${a.names.length} Sprites, ${withContour} mit Kontur, ${orphan} Konturen ohne Sprite · ` +
        `←/→ Atlas  ↑/↓ scrollen  C Konturen ${showContours ? "aus" : "an"}  Esc zurück`,
      8,
      24,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER, VIEW_WIDTH, VIEW_HEIGHT - HEADER);
    ctx.clip();
    for (const cell of a.grid.cells) {
      const top = HEADER + cell.y - scroll;
      if (top > VIEW_HEIGHT || top + CELL + LABEL_HEIGHT < HEADER) continue;
      const s = a.json.sprites[cell.name]!;
      const x0 = 8 + cell.x;
      const w = Math.floor(s.w / cell.divisor);
      const h = Math.floor(s.h / cell.divisor);
      if (checker) ctx.fillStyle = checker;
      ctx.fillRect(x0, top, CELL, CELL);
      ctx.drawImage(a.pages[s.page]!, s.x, s.y, s.w, s.h, x0, top, w, h);
      const offset = a.json.contours[cell.name];
      if (offset === undefined) {
        ctx.strokeStyle = "#dd3";
        ctx.strokeRect(x0 + 0.5, top + 0.5, w - 1, h - 1);
      } else if (showContours && a.contours) {
        const height = a.contours[offset + 1] as number;
        const spans = a.contours.subarray(offset + 4, offset + 4 + height * 2);
        ctx.fillStyle = "rgba(255, 40, 40, 0.9)";
        for (const [px, py] of contourEdges(spans, height)) {
          ctx.fillRect(
            x0 + Math.floor(px / cell.divisor),
            top + Math.floor(py / cell.divisor),
            1,
            1,
          );
        }
      }
      ctx.fillStyle = "#aaa";
      const label = cell.divisor > 1 ? `${cell.name} ÷${cell.divisor}` : cell.name;
      ctx.fillText(label.length > 20 ? `${label.slice(0, 19)}…` : label, x0, top + CELL + 1);
    }
    ctx.restore();
  };

  const select = async (next: number) => {
    index = (next + atlases.length) % atlases.length;
    scroll = 0;
    draw();
    const loaded = await load(atlases[index]!);
    if (disposed || atlases[index] !== loaded.entry) return;
    current = loaded;
    draw();
  };

  const maxScroll = () => Math.max(0, (current?.grid.height ?? 0) - (VIEW_HEIGHT - HEADER) + 8);
  const scrollBy = (d: number) => {
    const next = Math.max(0, Math.min(maxScroll(), scroll + d));
    if (next !== scroll) {
      scroll = next;
      draw();
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    scrollBy(Math.sign(e.deltaY) * SCROLL_STEP * 2);
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // Tasten als Flanken aus dem gehaltenen Zustand der Shell
  const watched = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "KeyC",
    "Escape",
  ];
  let held = new Set<string>();
  let frame = 0;
  const poll = () => {
    if (disposed) return;
    const now = new Set(watched.filter((k) => host.keys.isDown(k)));
    const hit = (k: string) => now.has(k) && !held.has(k);
    if (hit("ArrowRight")) void select(index + 1);
    if (hit("ArrowLeft")) void select(index - 1);
    if (hit("KeyC")) {
      showContours = !showContours;
      draw();
    }
    if (now.has("ArrowDown")) scrollBy(SCROLL_STEP / 4);
    if (now.has("ArrowUp")) scrollBy(-SCROLL_STEP / 4);
    if (hit("PageDown")) scrollBy(VIEW_HEIGHT - HEADER);
    if (hit("PageUp")) scrollBy(-(VIEW_HEIGHT - HEADER));
    held = now;
    if (hit("Escape")) {
      host.exit();
      return;
    }
    frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);

  await select(0);
  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("wheel", onWheel);
      for (const p of cache.values()) void p.then((a) => a.pages.forEach((b) => b.close()));
      cache.clear();
    },
  };
}
