import type { RenderResolution, ScaleMode } from "@clove/core";
import { Application, RenderTexture, Sprite, TextureSource } from "pixi.js";
import { canvasFactor, scaleFor } from "./scale";
import { XbrPresent } from "./xbr";

/**
 * Pixi-Application in fester logischer Auflösung (DOVE 640×480, DoveZ 800×600),
 * fensterfüllend in Gerätepixeln.
 *
 * Ist der Faktor Gerätepixel je Spielpixel ganzzahlig (`integer` bei
 * ganzzahliger Pixeldichte), vergrößert der Browser den Canvas in
 * Originalauflösung per `image-rendering: pixelated` exakt. Sonst (`fit`,
 * Pixeldichte 1,25 oder 1,5) wären so die Pixel ungleich breit: Dann hat der
 * Canvas das m-Fache der logischen Größe, m die Gerätepixel aufgerundet.
 * `original` zeichnet das Bild in Originalauflösung in eine Textur und
 * vergrößert es per Nearest auf m — jedes Spielpixel bleibt ein Quadrat, den
 * Rest bis zum Fenster filtert der Browser bilinear (scharf-bilinear). `xbr`
 * vergrößert ebenso, aber mit Kantenglättung (`XbrPresent`), auch bei
 * ganzzahligem Faktor. `hd` zeichnet gleich mit Auflösung m. `smooth` lässt den
 * Browser wie bisher aus der Originalauflösung filtern.
 *
 * Gezeichnet wird nur, wenn das Spiel `app.render()` aufruft: Pixi hängt sein
 * eigenes `render` sonst zusätzlich an den Ticker, und ein Spiel, das selbst
 * rendert, zeichnete jedes Bild zweimal. Bilder ohne neuen Tick braucht es nicht
 * neu zu zeichnen; der Canvas behält das letzte.
 *
 * Die logische Größe steht als `data-logical-width` und `data-logical-height`
 * am Canvas (für Zeiger und Overlay der Shell): `canvas.width` sind Canvas-Pixel.
 */
export interface ScreenOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Skalierung, bei jeder Größenänderung neu gelesen (Vorgabe `integer`). */
  readonly scale?: () => ScaleMode;
  /** Renderauflösung, ebenso gelesen (Vorgabe `original`). */
  readonly resolution?: () => RenderResolution;
}

/** Fensterereignis: die Darstellung (Skalierung) hat sich geändert, neu einpassen. */
export const DISPLAY_EVENT = "clove:display";
/** Canvas-Ereignis nach jedem Einpassen (Größe oder sichtbarer Ausschnitt geändert). */
export const LAYOUT_EVENT = "clove:layout";

interface View {
  height: number | null;
  readonly logicalHeight: number;
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
  const view = views.get(canvas);
  return view ? (view.height ?? view.logicalHeight) : canvas.height;
}

/** Ganzzahliger Faktor ab 1 (ohne Rundungsrauschen). */
const whole = (f: number) => f > 1 - 1e-6 && Math.abs(f - Math.round(f)) < 1e-6;

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
    // Laptops mit zwei GPUs: die schnelle nehmen
    powerPreference: "high-performance",
  });
  // gezeichnet wird nur auf `app.render()` des Spiels, nicht zusätzlich am Ticker
  app.ticker.remove(app.render, app);
  const canvas = options.canvas;
  canvas.dataset["logicalWidth"] = String(options.width);
  canvas.dataset["logicalHeight"] = String(options.height);

  /** Das Bild in Originalauflösung, per Nearest auf den Canvas vergrößert. */
  const frame = RenderTexture.create({ width: options.width, height: options.height });
  const present = new Sprite(frame);
  const xbr = new XbrPresent(frame, options.width, options.height);
  let factor = 1;
  let kind: RenderResolution = "original";
  const draw = app.render.bind(app);
  app.render = () => {
    if (kind === "hd" || factor === 1) {
      draw();
      return;
    }
    app.renderer.render({
      container: app.stage,
      target: frame,
      clear: true,
      clearColor: [0, 0, 0, 1],
    });
    app.renderer.render({ container: kind === "xbr" ? xbr.mesh : present });
  };

  const view: View = {
    height: null,
    logicalHeight: options.height,
    fit() {
      const mode = options.scale?.() ?? "integer";
      const want = options.resolution?.() ?? "original";
      const parent = canvas.parentElement;
      const availW = parent?.clientWidth ?? options.width;
      const availH = parent?.clientHeight ?? options.height;
      const visible = Math.min(options.height, view.height ?? options.height);
      const scale = scaleFor(mode, availW, availH, options.width, visible);
      const device = scale * (globalThis.devicePixelRatio || 1);
      // ganzzahlig: der Browser vergrößert per `pixelated` exakt, Original braucht keinen größeren Canvas
      const m =
        want === "original" && (mode === "smooth" || whole(device)) ? 1 : canvasFactor(device);
      if (m !== factor || want !== kind) {
        factor = m;
        kind = want;
        // `original`: der Canvas ist für Pixi eine große Fläche in Auflösung 1, auf
        // der nur das vergrößerte Bild liegt — Texte und Render-Ziele bleiben 1×.
        if (kind === "hd" || m === 1) app.renderer.resize(options.width, options.height, m);
        else app.renderer.resize(options.width * m, options.height * m, 1);
        present.scale.set(m);
        xbr.setScale(m);
        // Größenänderung löscht den Canvas: das letzte Bild gleich wieder zeigen
        app.render();
      }
      canvas.style.imageRendering = whole(device / m) && mode !== "smooth" ? "pixelated" : "auto";
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
  // Pixeldichte ändert sich beim Zoomen und beim Wechsel auf einen anderen Bildschirm
  let density: MediaQueryList | undefined;
  const watchDensity = () => {
    density?.removeEventListener("change", onDensity);
    density = globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
    density?.addEventListener("change", onDensity);
  };
  const onDensity = () => {
    watchDensity();
    fit();
  };
  watchDensity();
  const destroy = app.destroy.bind(app);
  app.destroy = ((...args: Parameters<Application["destroy"]>) => {
    observer.disconnect();
    globalThis.removeEventListener?.(DISPLAY_EVENT, fit);
    density?.removeEventListener("change", onDensity);
    views.delete(canvas);
    for (const p of ["clipPath", "marginBottom"] as const) canvas.style[p] = "";
    delete canvas.dataset["logicalWidth"];
    delete canvas.dataset["logicalHeight"];
    present.destroy();
    xbr.destroy();
    frame.destroy(true);
    destroy(...args);
  }) as Application["destroy"];
  return app;
}
