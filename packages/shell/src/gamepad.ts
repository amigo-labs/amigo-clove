import type { GamepadBindings, KeyState } from "@clove/core";

/** Ausschnitt aus `Gamepad`, den die Abbildung braucht (testbar ohne Browser). */
export interface PadSnapshot {
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

/** Stick-Totzone: erst ab halbem Ausschlag zählt die Richtung als gedrückt. */
const DEADZONE = 0.5;

/** Steuerkreuz der Standardbelegung (Buttons 12–15) → Pfeiltasten. */
const DPAD: GamepadBindings = {
  12: ["ArrowUp"],
  13: ["ArrowDown"],
  14: ["ArrowLeft"],
  15: ["ArrowRight"],
};

/**
 * Codes, die ein Pad gerade „hält“. Nur Pads mit Standardbelegung — bei
 * anderen sind Button-Indizes herstellerabhängig und die Abbildung wäre Raten.
 */
export function padKeys(
  pads: Iterable<PadSnapshot | null>,
  bindings: GamepadBindings,
): Set<string> {
  const down = new Set<string>();
  for (const pad of pads) {
    if (!pad || pad.mapping !== "standard") continue;
    for (const map of [DPAD, bindings]) {
      for (const [index, codes] of Object.entries(map)) {
        if (pad.buttons[Number(index)]?.pressed) for (const c of codes) down.add(c);
      }
    }
    const [x = 0, y = 0] = pad.axes;
    if (x <= -DEADZONE) down.add("ArrowLeft");
    if (x >= DEADZONE) down.add("ArrowRight");
    if (y <= -DEADZONE) down.add("ArrowUp");
    if (y >= DEADZONE) down.add("ArrowDown");
  }
  return down;
}

/**
 * Pads als `KeyState`. Abgefragt wird träge: höchstens einmal pro `interval` ms,
 * beim ersten `isDown` danach — die Spiele fragen ohnehin einmal pro Tick ab.
 */
export function createPadState(
  getPads: () => Iterable<PadSnapshot | null>,
  now: () => number,
  bindings: GamepadBindings,
  interval = 4,
): KeyState {
  let down = new Set<string>();
  let polled = -Infinity;
  return {
    isDown(code) {
      const t = now();
      if (t - polled >= interval) {
        polled = t;
        down = padKeys(getPads(), bindings);
      }
      return down.has(code);
    },
  };
}

/** Tastatur und Pad zusammen: eine Taste gilt als gehalten, wenn eine Quelle sie hält. */
export function combineKeys(...sources: readonly KeyState[]): KeyState {
  return { isDown: (code) => sources.some((s) => s.isDown(code)) };
}

const NAV_BINDINGS: GamepadBindings = { 0: ["Enter"], 1: ["Escape"], 9: ["Enter"] };
const FOCUSABLE = "a[href], button:not([disabled]), select, input:not([type=hidden]):not([hidden])";

/**
 * Pad-Bedienung der HTML-Seiten (Launcher, Einstellungen): hoch/runter wandert
 * durch die Bedienelemente, links/rechts verstellt Schieberegler, A/Start
 * löst aus, B führt zurück zum Launcher. Läuft, bis `signal` endet.
 */
export function startPadNavigation(
  root: HTMLElement,
  enabled: () => boolean,
  back: () => void,
  signal: AbortSignal,
): void {
  let prev = new Set<string>();
  const step = () => {
    if (signal.aborted) return;
    const now = enabled()
      ? padKeys(navigator.getGamepads?.() ?? [], NAV_BINDINGS)
      : new Set<string>();
    const hit = (c: string) => now.has(c) && !prev.has(c);
    prev = now;
    const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const active = document.activeElement as HTMLElement | null;
    const at = active ? items.indexOf(active) : -1;
    const move = (d: number) => items[(at + d + items.length) % items.length]?.focus();
    // ohne Fokus: runter → erstes, hoch → letztes Element
    if (hit("ArrowDown")) move(1);
    if (hit("ArrowUp")) move(at < 0 ? 0 : -1);
    const d = (hit("ArrowRight") ? 1 : 0) - (hit("ArrowLeft") ? 1 : 0);
    if (d !== 0 && active instanceof HTMLInputElement && active.type === "range") {
      if (d > 0) active.stepUp();
      else active.stepDown();
      active.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (d !== 0 && active instanceof HTMLSelectElement) {
      const n = active.options.length;
      active.selectedIndex = (active.selectedIndex + d + n) % n;
      active.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (hit("Enter") && active && at >= 0 && !(active instanceof HTMLSelectElement)) active.click();
    if (hit("Escape")) back();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
