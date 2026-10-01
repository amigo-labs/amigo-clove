import type { GamepadBindings, KeyState, PadLayout } from "@clove/core";

/** Ausschnitt aus `Gamepad`, den die Abbildung braucht (testbar ohne Browser). */
export interface PadSnapshot {
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

/** Stick-Totzone: erst ab halbem Ausschlag zählt die Richtung als gedrückt. */
const DEADZONE = 0.5;

/** Steuerkreuz (Buttons 12–15) und linker Stick → Pfeiltasten: hoch, runter, links, rechts. */
const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

/**
 * Codes, die ein Pad gerade „hält“. Nur Pads mit Standardbelegung — bei
 * anderen sind Button-Indizes herstellerabhängig und die Abbildung wäre Raten.
 */
export function padKeys(
  pads: Iterable<PadSnapshot | null>,
  bindings: GamepadBindings,
  /** Eigene Belegung für das n-te Pad mit Standardbelegung (z. B. Spieler 2). */
  layouts: readonly (PadLayout | undefined)[] = [],
): Set<string> {
  const down = new Set<string>();
  let n = 0;
  for (const pad of pads) {
    if (!pad || pad.mapping !== "standard") continue;
    const layout = layouts[n++];
    const [up, dn, left, right] = layout?.directions ?? ARROWS;
    const dpad = { 12: [up], 13: [dn], 14: [left], 15: [right] };
    for (const map of [dpad, layout?.buttons ?? bindings]) {
      for (const [index, codes] of Object.entries(map)) {
        if (pad.buttons[Number(index)]?.pressed) for (const c of codes) down.add(c);
      }
    }
    const [x = 0, y = 0] = pad.axes;
    if (x <= -DEADZONE) down.add(left);
    if (x >= DEADZONE) down.add(right);
    if (y <= -DEADZONE) down.add(up);
    if (y >= DEADZONE) down.add(dn);
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
  layouts: readonly (PadLayout | undefined)[] = [],
): KeyState {
  let down = new Set<string>();
  let polled = -Infinity;
  return {
    isDown(code) {
      const t = now();
      if (t - polled >= interval) {
        polled = t;
        down = padKeys(getPads(), bindings, layouts);
      }
      return down.has(code);
    },
  };
}

/** Tastatur und Pad zusammen: eine Taste gilt als gehalten, wenn eine Quelle sie hält. */
export function combineKeys(...sources: readonly KeyState[]): KeyState {
  return { isDown: (code) => sources.some((s) => s.isDown(code)) };
}

/** Pad-Belegung der HTML-Seiten und Spielbildschirme: A und Start bestätigen, B zurück. */
export const NAV_BINDINGS: GamepadBindings = { 0: ["Enter"], 1: ["Escape"], 9: ["Enter"] };
