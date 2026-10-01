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
  Escape: "Esc",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Insert: "Ins",
  Delete: "Del",
};

/** Kurzer Name einer Taste (`KeyA` → „A“, `Numpad4` → „Num 4“); Leertaste siehe `keySpace`. */
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
