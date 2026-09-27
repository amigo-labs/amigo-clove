import type { KeyState } from "@clove/core";

/** Tastengruppen der Menüs wie im Original (`GetKeyboardState`-Codes → `KeyboardEvent.code`). */
export const KEYS = {
  up: ["ArrowUp", "Numpad8"],
  down: ["ArrowDown", "Numpad2", "Numpad5"],
  left: ["ArrowLeft", "Numpad4"],
  right: ["ArrowRight", "Numpad6"],
  /** Bestätigen: Enter, S, A, Leertaste. */
  confirm: ["Enter", "NumpadEnter", "KeyS", "KeyA", "Space"],
  escape: ["Escape"],
} as const;

export type KeyGroup = keyof typeof KEYS;

/** Codes der Namenseingabe: Buchstaben, Ziffern, Satzzeichen, Löschen, Umschalt. */
export const NAME_KEYS: readonly string[] = [
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
  "Space",
  "Minus",
  "Period",
  "Comma",
  "Backspace",
  "ShiftLeft",
  "ShiftRight",
];

const ALL = [...new Set([...Object.values(KEYS).flat(), ...NAME_KEYS])];

/**
 * Tastenflanken pro 14-ms-Tick. `sample()` einmal zu Beginn jedes Ticks;
 * `hit()` ist wahr, wenn eine Taste der Gruppe in diesem Tick neu gedrückt wurde.
 * Der Zustand überlebt Bildschirmwechsel — eine gehaltene Bestätigungstaste
 * löst im nächsten Menü nicht erneut aus. Was beim Start schon gehalten ist
 * (Enter oder Pad-A auf „Spielen“ im Launcher), zählt erst nach dem Loslassen.
 */
export class KeyEdges {
  private prev = new Set<string>();
  private now: Set<string>;

  constructor(readonly keys: KeyState) {
    this.now = this.read();
  }

  private read(): Set<string> {
    const down = new Set<string>();
    for (const c of ALL) if (this.keys.isDown(c)) down.add(c);
    return down;
  }

  sample(): void {
    this.prev = this.now;
    this.now = this.read();
  }

  held(g: KeyGroup): boolean {
    return KEYS[g].some((c) => this.now.has(c));
  }

  hit(g: KeyGroup): boolean {
    return KEYS[g].some((c) => this.now.has(c) && !this.prev.has(c));
  }

  /** Flanke eines einzelnen Codes aus `KEYS` oder `NAME_KEYS`. */
  hitCode(code: string): boolean {
    return this.now.has(code) && !this.prev.has(code);
  }

  isDown(code: string): boolean {
    return this.now.has(code);
  }
}
