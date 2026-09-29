import type { KeyState } from "@clove/core";
import { h } from "./dom";
import type { ShellText } from "./texts";

/** Virtuelle Tasten: Beschriftung, `KeyboardEvent.code`, Platz im Raster. */
const PAD = [
  ["▲", "ArrowUp", "up"],
  ["◀", "ArrowLeft", "left"],
  ["▶", "ArrowRight", "right"],
  ["▼", "ArrowDown", "down"],
] as const;

/**
 * Touch-Tasten im Overlay: Steuerkreuz links, OK (Enter) und Zurück/Pause (Esc)
 * rechts. Sie erscheinen, sobald ein Finger die Bühne berührt, und speisen
 * gewöhnliche Tastencodes ein — Menüs, Pause und Continue der Spiele
 * funktionieren damit ohne Änderung. Gelenkt wird im Spiel per Ziehen.
 */
export function createTouchKeys(
  stage: HTMLElement,
  layer: HTMLElement,
  t: ShellText,
): KeyState & { dispose(): void } {
  const down = new Set<string>();
  const ac = new AbortController();
  const signal = ac.signal;
  const button = (label: string, code: string, cls: string, aria?: string) => {
    const b = h("button", { type: "button", class: `touch-key ${cls}`, tabindex: "-1" }, label);
    if (aria) b.setAttribute("aria-label", aria);
    const press = (e: PointerEvent) => {
      e.preventDefault();
      down.add(code);
      b.setPointerCapture?.(e.pointerId);
    };
    const release = () => down.delete(code);
    b.addEventListener("pointerdown", press, { signal });
    b.addEventListener("pointerup", release, { signal });
    b.addEventListener("pointercancel", release, { signal });
    b.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
    return b;
  };
  const pad = h("div", { class: "touch-pad" }, ...PAD.map(([l, c, cls]) => button(l, c, cls)));
  const actions = h(
    "div",
    { class: "touch-actions" },
    button("OK", "Enter", "ok"),
    button("⏸", "Escape", "back", t("touchBack")),
  );
  const root = h("div", { class: "touch-keys", hidden: true }, pad, actions);
  layer.append(root);
  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") root.hidden = false;
      else if (e.pointerType === "mouse") root.hidden = true;
    },
    { signal, capture: true },
  );
  window.addEventListener("blur", () => down.clear(), { signal });
  return {
    isDown: (code) => down.has(code),
    dispose() {
      ac.abort();
      root.remove();
      down.clear();
    },
  };
}
