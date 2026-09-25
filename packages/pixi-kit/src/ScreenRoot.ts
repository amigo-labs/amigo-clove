import { Application, TextureSource } from "pixi.js";

/**
 * Pixi-Application in fester logischer Auflösung, ganzzahlig hochskaliert.
 *
 * Gerendert wird immer in der Originalauflösung (DOVE 640×480); der Canvas
 * wird per CSS um den größten ganzzahligen Faktor vergrößert, der in den
 * Container passt, mit `image-rendering: pixelated`. So bleibt jedes
 * Original-Pixel ein scharfes Quadrat — kein Filtern, kein Subpixel-Versatz.
 */
export interface ScreenOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
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
  canvas.style.imageRendering = "pixelated";
  const fit = () => {
    const parent = canvas.parentElement;
    const availW = parent?.clientWidth ?? options.width;
    const availH = parent?.clientHeight ?? options.height;
    const scale = Math.max(
      1,
      Math.floor(Math.min(availW / options.width, availH / options.height)),
    );
    canvas.style.width = `${options.width * scale}px`;
    canvas.style.height = `${options.height * scale}px`;
  };
  fit();
  const observer = new ResizeObserver(fit);
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  const destroy = app.destroy.bind(app);
  app.destroy = ((...args: Parameters<Application["destroy"]>) => {
    observer.disconnect();
    destroy(...args);
  }) as Application["destroy"];
  return app;
}
