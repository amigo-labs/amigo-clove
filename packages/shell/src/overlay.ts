import { h } from "./dom";
import type { ShellText } from "./texts";

/** Fensterereignis: eine Darstellungs-Einstellung hat sich geändert (siehe `@clove/pixi-kit`). */
export const DISPLAY_EVENT = "clove:display";
/** Canvas-Ereignis des Pixi-Kits nach jedem Einpassen. */
const LAYOUT_EVENT = "clove:layout";
/** So lange bleibt der Vollbild-Knopf nach der letzten Zeigerbewegung sichtbar. */
const IDLE_MS = 2500;

/** Sichtbares Rechteck des Canvas in der Bühne (CSS-Pixel) und CSS-Pixel je Spielpixel. */
export interface GameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly px: number;
}

export interface Stage {
  /** Wurzel: füllt `#screen`, zentriert den Canvas. */
  readonly root: HTMLElement;
  /** Schicht über dem Canvas für Anzeigen der Shell (HUD, Touch-Tasten). */
  readonly layer: HTMLElement;
  rect(): GameRect;
  /** Meldet jede Änderung des Rechtecks; liefert die Abmeldung. */
  onLayout(fn: (r: GameRect) => void): () => void;
  dispose(): void;
}

export interface StageOptions {
  readonly t: ShellText;
  readonly scanlines: () => boolean;
}

export function fullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === "function";
}

/** Vollbild der ganzen Seite an/aus (Canvas und Overlay kommen gemeinsam mit). */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else if (fullscreenSupported())
    void document.documentElement.requestFullscreen().catch(() => undefined);
}

/**
 * Bühne um den Spiel-Canvas: Canvas und darüber eine Overlay-Schicht, deren
 * CSS-Variablen `--game-x/y/w/h` und `--px` immer dem sichtbaren Canvas folgen.
 * Das Pixi-Kit schneidet unten ab (Spielfeld ohne Original-HUD) per negativem
 * Außenabstand; dessen Betrag zählt hier nicht zur sichtbaren Höhe.
 */
export function createStage(canvas: HTMLCanvasElement, options: StageOptions): Stage {
  const scan = h("div", { class: "scanlines", "aria-hidden": "true" });
  const full = h("button", { class: "fullscreen", type: "button", tabindex: "-1" }, "⛶");
  const layer = h("div", { class: "overlay" }, scan);
  if (fullscreenSupported()) layer.append(full);
  const root = h("div", { class: "stage" }, canvas, layer);
  const listeners = new Set<(r: GameRect) => void>();
  let current: GameRect = { x: 0, y: 0, w: 0, h: 0, px: 1 };

  const label = () => {
    const t = options.t(document.fullscreenElement ? "fullscreenExit" : "fullscreen");
    full.title = `${t} (Alt+Enter)`;
    full.setAttribute("aria-label", t);
  };
  const layout = () => {
    const w = canvas.offsetWidth;
    const cut = -(Number.parseFloat(canvas.style.marginBottom) || 0);
    const r: GameRect = {
      x: canvas.offsetLeft,
      y: canvas.offsetTop,
      w,
      h: Math.max(0, canvas.offsetHeight - cut),
      px: canvas.width > 0 ? w / canvas.width : 1,
    };
    current = r;
    for (const [k, v] of [
      ["--game-x", r.x],
      ["--game-y", r.y],
      ["--game-w", r.w],
      ["--game-h", r.h],
    ] as const)
      layer.style.setProperty(k, `${v}px`);
    layer.style.setProperty("--px", String(r.px));
    // unter 2 CSS-Pixeln je Zeile verschwimmen Rasterlinien zu grauem Schleier
    scan.hidden = !options.scanlines() || r.px < 2;
    for (const fn of listeners) fn(r);
  };

  let idle: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    full.dataset["visible"] = "true";
    clearTimeout(idle);
    idle = setTimeout(() => delete full.dataset["visible"], IDLE_MS);
  };
  full.addEventListener("click", () => {
    toggleFullscreen();
    canvas.focus?.();
  });
  label();

  const ac = new AbortController();
  const signal = ac.signal;
  canvas.addEventListener(LAYOUT_EVENT, layout, { signal });
  window.addEventListener("resize", layout, { signal });
  window.addEventListener(DISPLAY_EVENT, layout, { signal });
  document.addEventListener("fullscreenchange", label, { signal });
  root.addEventListener("pointermove", wake, { signal });
  root.addEventListener("pointerdown", wake, { signal });
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(layout);
  observer?.observe(canvas);
  queueMicrotask(layout);

  return {
    root,
    layer,
    rect: () => current,
    onLayout(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      ac.abort();
      observer?.disconnect();
      clearTimeout(idle);
      listeners.clear();
    },
  };
}
