import type { PointerState } from "@clove/core";
import { logicalSize } from "./dom";

/** So weit (CSS-Pixel) muss die Maus nach Tastensteuerung wandern, bis sie wieder lenkt. */
const WAKE_PX = 12;
/** Pixel-Rad: so viel `deltaY` ist eine Raste (Chromium und Firefox liefern 100 bzw. 3 Zeilen). */
const NOTCH = 100;

const noMenu = (e: Event) => e.preventDefault();

/**
 * Maus und Touch über dem Canvas als `PointerState` (Gegenstück zu `keys.ts`).
 * Koordinaten sind logische Spielpixel (`logicalSize`, nicht `canvas.width`:
 * der Canvas hat Gerätepixel); das Pixi-Kit schneidet nur per
 * `clip-path` ab, das Rechteck des Elements bleibt der ganze Canvas.
 */
export function createPointerState(
  canvas: HTMLCanvasElement,
  /** Empfängt die Ereignisse (Bühne um den Canvas): auch im Rand folgt das Schiff, begrenzt. */
  surface: HTMLElement = canvas,
): PointerState & { dispose(): void } {
  let active = false;
  let kind: "mouse" | "touch" = "mouse";
  let x = 0;
  let y = 0;
  let buttons = 0;
  let wheel = 0;
  let wheelAcc = 0;
  /** Aufliegende Finger; der erste lenkt, bis er abhebt. */
  const fingers = new Set<number>();
  let primary: number | undefined;
  /** Bildschirmposition beim Stilllegen durch Tasten. */
  let rest: { x: number; y: number } | undefined;

  const locate = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const { width, height } = logicalSize(canvas);
    x = Math.max(0, Math.min(width - 1, Math.floor(((e.clientX - r.left) * width) / r.width)));
    y = Math.max(0, Math.min(height - 1, Math.floor(((e.clientY - r.top) * height) / r.height)));
  };
  const wake = (e: PointerEvent, force: boolean) => {
    if (active) return;
    if (!force && rest && Math.hypot(e.clientX - rest.x, e.clientY - rest.y) < WAKE_PX) return;
    active = true;
    rest = undefined;
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      if (e.pointerId !== primary) return;
    } else {
      kind = "mouse";
      buttons = e.buttons;
      wake(e, false);
    }
    locate(e);
  };
  const onDown = (e: PointerEvent) => {
    // Knöpfe im Overlay (Vollbild, Touch-Tasten) bedienen sich selbst
    if (e.target instanceof Element && e.target.closest("button")) return;
    if (e.pointerType === "touch") {
      e.preventDefault();
      kind = "touch";
      fingers.add(e.pointerId);
      if (primary === undefined) {
        primary = e.pointerId;
        locate(e);
      }
    } else {
      kind = "mouse";
      buttons = e.buttons;
      locate(e);
    }
    wake(e, true);
    surface.setPointerCapture?.(e.pointerId);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      fingers.delete(e.pointerId);
      // hebt der lenkende Finger ab, zählt bis zum nächsten Aufsetzen keiner mehr
      if (e.pointerId === primary) {
        primary = undefined;
        fingers.clear();
      }
    } else buttons = e.buttons;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    wheelAcc += e.deltaMode === 0 ? e.deltaY : e.deltaY * (NOTCH / 3);
    while (Math.abs(wheelAcc) >= NOTCH) {
      const dir = Math.sign(wheelAcc);
      wheel += dir;
      wheelAcc -= dir * NOTCH;
    }
  };
  const onBlur = () => {
    buttons = 0;
    fingers.clear();
    primary = undefined;
  };

  const ac = new AbortController();
  const opts = { signal: ac.signal };
  surface.addEventListener("pointermove", onMove, opts);
  surface.addEventListener("pointerdown", onDown, opts);
  surface.addEventListener("pointerup", onUp, opts);
  surface.addEventListener("pointercancel", onUp, opts);
  surface.addEventListener("wheel", onWheel, { ...opts, passive: false });
  surface.addEventListener("contextmenu", noMenu, opts);
  window.addEventListener("blur", onBlur, opts);
  surface.style.touchAction = "none";
  canvas.style.cursor = "crosshair";

  return {
    get active() {
      return active;
    },
    get kind() {
      return kind;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get buttons() {
      return kind === "mouse" ? buttons : 0;
    },
    get touches() {
      return kind === "touch" ? fingers.size : 0;
    },
    takeWheel() {
      const n = wheel;
      wheel = 0;
      return n;
    },
    deactivate() {
      if (!active) return;
      active = false;
      // die Maus steht still: erst eine echte Bewegung übernimmt wieder
      const r = canvas.getBoundingClientRect();
      const { width, height } = logicalSize(canvas);
      rest = {
        x: r.left + ((x + 0.5) * r.width) / width,
        y: r.top + ((y + 0.5) * r.height) / height,
      };
    },
    dispose() {
      ac.abort();
    },
  };
}
