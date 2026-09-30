import type { ScaleMode } from "@clove/core";
import { Application, TextureSource } from "pixi.js";
import { scaleFor } from "./scale";

/**
 * Pixi-Application in fester logischer Auflösung, hochskaliert.
 *
 * Gerendert wird immer in der Originalauflösung (DOVE 640×480); der Canvas
 * wird per CSS vergrößert. Vorgabe ist der größte ganzzahlige Faktor, der in
 * den Container passt, mit `image-rendering: pixelated`. So bleibt jedes
 * Original-Pixel ein scharfes Quadrat — kein Filtern, kein Subpixel-Versatz.
 * Auf Wunsch (`scale`) füllt der Canvas den Container bruchteilig, scharf
 * (`fit`) oder gefiltert (`smooth`). Passt nicht einmal 1× hinein, wird
 * immer bruchteilig verkleinert.
 */
export interface ScreenOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Skalierung, bei jeder Größenänderung neu gelesen (Vorgabe `integer`). */
  readonly scale?: () => ScaleMode;
}

/** Fensterereignis: die Darstellung (Skalierung) hat sich geändert, neu einpassen. */
export const DISPLAY_EVENT = "clove:display";
/** Canvas-Ereignis nach jedem Einpassen (Größe oder sichtbarer Ausschnitt geändert). */
export const LAYOUT_EVENT = "clove:layout";

interface View {
  height: number | null;
  fit(): void;
}

const views = new WeakMap<HTMLCanvasElement, View>();

/**
 * Sichtbare Höhe begrenzen (von oben gezählt), `null` zeigt alles. Der Rest
 * wird abgeschnitten und das Einpassen rechnet mit der sichtbaren Höhe — so
 * wird z. B. das Spielfeld ohne HUD-Leiste größer. Koordinaten bleiben gleich.
 */
export function setView(canvas: HTMLCanvasElement, height: number | null): void {
  const view = views.get(canvas);
  if (!view || view.height === height) return;
  view.height = height;
  view.fit();
}

/** Aktuell sichtbare logische Höhe des Canvas. */
export function viewHeight(canvas: HTMLCanvasElement): number {
  return views.get(canvas)?.height ?? canvas.height;
}

export async function createScreen(options: ScreenOptions): Promise<Application> {
  TextureSource.defaultOptions.scaleMode = "nearest";
  const app = new Application();
  await app.init({
    canvas: options.canvas,
    width: options.width,
    height: options.height,
    resolution: 1,
    antialias: false,
    roundPixels: true,
    background: 0x000000,
    autoStart: false,
    preference: "webgl",
  });
  const canvas = options.canvas;
  const view: View = {
    height: null,
    fit() {
      const mode = options.scale?.() ?? "integer";
      const parent = canvas.parentElement;
      const availW = parent?.clientWidth ?? options.width;
      const availH = parent?.clientHeight ?? options.height;
      const visible = Math.min(options.height, view.height ?? options.height);
      const scale = scaleFor(mode, availW, availH, options.width, visible);
      canvas.style.imageRendering = mode === "smooth" ? "auto" : "pixelated";
      canvas.style.width = `${options.width * scale}px`;
      canvas.style.height = `${options.height * scale}px`;
      // abgeschnittener Rest: unsichtbar und ohne Platzbedarf (die Zentrierung sieht nur das Sichtbare)
      const cut = (options.height - visible) * scale;
      canvas.style.clipPath = cut > 0 ? `inset(0 0 ${cut}px 0)` : "";
      canvas.style.marginBottom = cut > 0 ? `${-cut}px` : "";
      canvas.dispatchEvent(new Event(LAYOUT_EVENT));
    },
  };
  views.set(canvas, view);
  view.fit();
  const fit = () => view.fit();
  const observer = new ResizeObserver(fit);
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  globalThis.addEventListener?.(DISPLAY_EVENT, fit);
  const destroy = app.destroy.bind(app);
  app.destroy = ((...args: Parameters<Application["destroy"]>) => {
    observer.disconnect();
    globalThis.removeEventListener?.(DISPLAY_EVENT, fit);
    views.delete(canvas);
    for (const p of ["clipPath", "marginBottom"] as const) canvas.style[p] = "";
    destroy(...args);
  }) as Application["destroy"];
  return app;
}
