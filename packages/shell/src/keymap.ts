import type { KeyAction, KeyState } from "@clove/core";

/** Zweite Tasten eines Spiels: Aktion → `KeyboardEvent.code`. */
export type SecondKeys = Readonly<Record<string, string>>;

/**
 * Tastatur mit zweiten Tasten: hält der Spieler die zweite Taste einer Aktion,
 * sieht das Spiel alle Originaltasten dieser Aktion gehalten. Die Originaltasten
 * bleiben gültig (wie `T2` in DoveZ), so kann keine Belegung das Spiel sperren.
 */
export function withSecondKeys(
  keys: KeyState,
  actions: readonly KeyAction[],
  second: () => SecondKeys | undefined,
): KeyState {
  let cachedFor: SecondKeys | undefined;
  let extra = new Map<string, string[]>();
  const table = () => {
    const map = second();
    if (map !== cachedFor) {
      cachedFor = map;
      extra = new Map();
      for (const a of actions) {
        const code = map?.[a.id];
        if (!code) continue;
        for (const c of a.codes) extra.set(c, [...(extra.get(c) ?? []), code]);
      }
    }
    return extra;
  };
  return {
    isDown: (code) =>
      keys.isDown(code) ||
      (table()
        .get(code)
        ?.some((c) => keys.isDown(c)) ??
        false),
    ...(keys.held ? { held: keys.held.bind(keys) } : {}),
  };
}

const NAMES: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "␣",
  Enter: "Enter",
  NumpadEnter: "Num Enter",
  ShiftLeft: "Shift",
  ShiftRight: "Shift ⇧",
  ControlLeft: "Strg/Ctrl",
  ControlRight: "Strg/Ctrl ⇧",
  AltLeft: "Alt",
  AltRight: "AltGr",
  Backspace: "⌫",
  Tab: "Tab",
};

/** Kurzer Name einer Taste für die Einstellungen (`KeyA` → „A“, `Numpad4` → „Num 4“). */
export function keyName(code: string): string {
  if (NAMES[code]) return NAMES[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1]!;
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

/** Tasten, die die Shell selbst braucht oder die nie gelten sollen. */
export function assignable(code: string): boolean {
  return code !== "Escape" && code !== "Tab" && code !== "F11" && !code.startsWith("Meta");
}
