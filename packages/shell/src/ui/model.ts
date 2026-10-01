import type { KeyState } from "@clove/core";

/** Bedienrichtungen und Aktionen der HTML-Bildschirme. */
export type NavAction = "up" | "down" | "left" | "right" | "ok" | "back";

/** Tastencodes (Tastatur, Touch-Tasten, Pad über die Navigationsbelegung) → Aktion. */
export const NAV_CODES: Readonly<Record<string, NavAction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Numpad8: "up",
  Numpad2: "down",
  Numpad4: "left",
  Numpad6: "right",
  Enter: "ok",
  NumpadEnter: "ok",
  Space: "ok",
  Escape: "back",
};

/** Zustand der HTML-Bildschirme für die Tastensperre. */
export interface UiGateState {
  /** Ein Bildschirm ist offen. */
  readonly open: boolean;
  /** Zählt geöffnete Bildschirme; ändert sich mit jedem `show`. */
  readonly generation: number;
}

/**
 * Tasten fürs Spiel, solange kein HTML-Bildschirm offen ist. Während einer offen ist,
 * sieht das Spiel nichts; danach gilt jede Taste erst, nachdem sie einmal losgelassen
 * wurde — das Enter, das „Weiter“ wählt, feuert im Level nicht weiter.
 */
export function gateKeys(keys: KeyState, state: () => UiGateState): KeyState {
  let generation = 0;
  let released: Set<string> | undefined;
  return {
    isDown(code) {
      const s = state();
      if (s.open) return false;
      if (s.generation !== generation) {
        generation = s.generation;
        released = new Set();
      }
      const down = keys.isDown(code);
      if (!released) return down;
      if (!down) released.add(code);
      return down && released.has(code);
    },
    ...(keys.held ? { held: keys.held.bind(keys) } : {}),
  };
}

/** Nächster Eintrag in einer Liste bzw. einem Raster mit `columns` Spalten (umlaufend). */
export function moveIndex(
  index: number,
  count: number,
  dir: "up" | "down" | "left" | "right",
  columns = 1,
): number {
  if (count <= 0) return -1;
  if (index < 0) return dir === "up" || dir === "left" ? count - 1 : 0;
  const cols = Math.max(1, columns);
  if (cols === 1 && (dir === "left" || dir === "right")) return index;
  const step = dir === "up" ? -cols : dir === "down" ? cols : dir === "left" ? -1 : 1;
  return (((index + step) % count) + count) % count;
}

/** Erkennt Tippfolgen (z. B. „lov“) aus einzelnen Buchstaben; liefert die zugehörige ID. */
export class SecretMatcher {
  private typed = "";
  private readonly longest: number;

  constructor(private readonly secrets: Readonly<Record<string, string>>) {
    this.longest = Math.max(0, ...Object.keys(secrets).map((s) => s.length));
  }

  feed(char: string): string | undefined {
    if (this.longest === 0) return undefined;
    this.typed = (this.typed + char.toLowerCase()).slice(-this.longest);
    for (const [word, id] of Object.entries(this.secrets)) {
      if (this.typed.endsWith(word)) {
        this.typed = "";
        return id;
      }
    }
    return undefined;
  }
}

/** Neu gedrückte Navigationscodes einer gepollten Quelle (Pad, Touch-Tasten). */
export class NavEdges {
  private prev = new Set<string>();

  next(down: ReadonlySet<string>): NavAction[] {
    const out: NavAction[] = [];
    for (const code of down) {
      const action = NAV_CODES[code];
      if (action && !this.prev.has(code)) out.push(action);
    }
    this.prev = new Set(down);
    return out;
  }
}
