import type { GameHost } from "@clove/core";
import type { PlayerInput } from "../sim/player";

/**
 * Tastenbelegung wie im Original (`InitKeyConfig` `0x504BA0`, `Taste` `0x54FE40`):
 * je Satz (0 ein Spieler, 1 und 2 im Zwei-Spieler-Spiel) und Aktion zwei
 * DirectInput-Tasten. Eine Aktion gilt als gehalten, wenn **eine** der beiden
 * gehalten wird. Die erste (`T1`) ist fest, die zweite (`T2`) legt die
 * Tastenkonfiguration im Menü fest; dazu kommen feste Zusatztasten, die nicht in
 * der Tabelle stehen (Leertaste feuert im Einzelspiel, F11 hupt).
 */
export const ACTIONS = [
  "left",
  "up",
  "right",
  "down",
  "fire",
  "beam",
  "switchWeapon",
  "switchBeam",
  "rotate",
  "nova",
] as const;

type Action = (typeof ACTIONS)[number];

/** Erste Taste je Aktion (Reihenfolge `ACTIONS`) für die Sätze 0…2. */
const T1: readonly (readonly string[])[] = [
  [
    "ArrowLeft",
    "ArrowUp",
    "ArrowRight",
    "ArrowDown",
    "KeyS",
    "KeyA",
    "KeyD",
    "KeyQ",
    "KeyW",
    "KeyE",
  ],
  ["KeyJ", "KeyI", "KeyL", "KeyK", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyW", "KeyE"],
  [
    "Numpad4",
    "Numpad8",
    "Numpad6",
    "Numpad5",
    "End",
    "Delete",
    "PageDown",
    "Insert",
    "Home",
    "PageUp",
  ],
];

/** Vorgabe der zweiten Tasten: 3 Sätze × 10 Aktionen, `""` = keine. */
export const DEFAULT_KEYS: readonly string[] = [
  ...Array.from({ length: 10 }, () => ""),
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  ...Array.from({ length: 6 }, () => ""),
  "",
  "",
  "",
  "Numpad2",
  ...Array.from({ length: 6 }, () => ""),
];

/** Feste Zusatztasten je Satz und Aktion (nicht umbelegbar). */
const EXTRA: readonly Readonly<Partial<Record<keyof PlayerInput, readonly string[]>>>[] = [
  { fire: ["Space"], horn: ["F11"] },
  { horn: ["F11"] },
  { horn: ["F11"] },
];

/** `KeyboardEvent.code` → DirectInput-Code (DIK_*), soweit das Original die Taste kennt. */
export const DIK: Readonly<Record<string, number>> = {
  Escape: 1,
  Digit1: 2,
  Digit2: 3,
  Digit3: 4,
  Digit4: 5,
  Digit5: 6,
  Digit6: 7,
  Digit7: 8,
  Digit8: 9,
  Digit9: 10,
  Digit0: 11,
  Minus: 12,
  Equal: 13,
  Backspace: 14,
  Tab: 15,
  KeyQ: 16,
  KeyW: 17,
  KeyE: 18,
  KeyR: 19,
  KeyT: 20,
  KeyY: 21,
  KeyU: 22,
  KeyI: 23,
  KeyO: 24,
  KeyP: 25,
  BracketLeft: 26,
  BracketRight: 27,
  Enter: 28,
  ControlLeft: 29,
  KeyA: 30,
  KeyS: 31,
  KeyD: 32,
  KeyF: 33,
  KeyG: 34,
  KeyH: 35,
  KeyJ: 36,
  KeyK: 37,
  KeyL: 38,
  Semicolon: 39,
  Quote: 40,
  Backquote: 41,
  ShiftLeft: 42,
  Backslash: 43,
  KeyZ: 44,
  KeyX: 45,
  KeyC: 46,
  KeyV: 47,
  KeyB: 48,
  KeyN: 49,
  KeyM: 50,
  Comma: 51,
  Period: 52,
  Slash: 53,
  ShiftRight: 54,
  NumpadMultiply: 55,
  AltLeft: 56,
  Space: 57,
  CapsLock: 58,
  F1: 59,
  F2: 60,
  F3: 61,
  F4: 62,
  F5: 63,
  F6: 64,
  F7: 65,
  F8: 66,
  F9: 67,
  F10: 68,
  NumLock: 69,
  ScrollLock: 70,
  Numpad7: 71,
  Numpad8: 72,
  Numpad9: 73,
  NumpadSubtract: 74,
  Numpad4: 75,
  Numpad5: 76,
  Numpad6: 77,
  NumpadAdd: 78,
  Numpad1: 79,
  Numpad2: 80,
  Numpad3: 81,
  Numpad0: 82,
  NumpadDecimal: 83,
  IntlBackslash: 86,
  F11: 87,
  F12: 88,
  NumpadEnter: 156,
  ControlRight: 157,
  NumpadDivide: 181,
  PrintScreen: 183,
  AltRight: 184,
  Pause: 197,
  Home: 199,
  ArrowUp: 200,
  PageUp: 201,
  ArrowLeft: 203,
  ArrowRight: 205,
  End: 207,
  ArrowDown: 208,
  PageDown: 209,
  Insert: 210,
  Delete: 211,
};

/** DIK → `code` (Umkehrung von `DIK`). */
const CODE_OF = new Map(Object.entries(DIK).map(([code, dik]) => [dik, code]));

/** `KeyName` (`0x578820`): Tastennamen des Originals; alles andere zeigt die Nummer. */
const DIK_NAMES: Readonly<Record<number, string>> = {
  1: "Escape",
  2: "1",
  3: "2",
  4: "3",
  5: "4",
  6: "5",
  7: "6",
  8: "7",
  9: "8",
  10: "9",
  11: "0",
  14: "Backspace",
  15: "Tab",
  16: "Q",
  17: "W",
  18: "E",
  19: "R",
  20: "T",
  21: "Z",
  22: "U",
  23: "I",
  24: "O",
  25: "P",
  29: "L. Ctrl",
  30: "A",
  31: "S",
  32: "D",
  33: "F",
  34: "G",
  35: "H",
  36: "J",
  37: "K",
  38: "L",
  42: "L. Shift",
  44: "Y",
  45: "X",
  46: "C",
  47: "V",
  48: "B",
  49: "N",
  50: "M",
  54: "R. Shift",
  56: "L. Alt",
  57: "Space",
  58: "Capslock",
  71: "Num. 7",
  72: "Num. 8",
  73: "Num. 9",
  75: "Num. 4",
  76: "Num. 5",
  77: "Num. 6",
  78: "+",
  79: "Num. 1",
  80: "Num. 2",
  81: "Num. 3",
  82: "Num. 0",
  156: "Enter",
  157: "R. Ctrl",
  184: "R. Alt",
  199: "Pos 1",
  200: "Up",
  201: "Page Up",
  203: "Left",
  205: "Right",
  207: "End",
  208: "Down",
  209: "Page Down",
  210: "Insert",
  211: "Entf.",
};

/** Anzeigename einer Taste (`KeyName`); `""` ohne Taste. */
export function keyName(code: string): string {
  const dik = DIK[code];
  if (dik === undefined) return "";
  return DIK_NAMES[dik] ?? String(dik);
}

/** Ist das eine Taste, die die Tastenkonfiguration kennt (oder leer)? */
export function isKeyCode(code: unknown): code is string {
  return code === "" || (typeof code === "string" && code in DIK);
}

/** Codes gehaltener Tasten als DIK-Codes aufsteigend (Tasten, die das Original nicht kennt, fallen weg). */
export function heldDiks(host: GameHost): number[] {
  const out: number[] = [];
  for (const c of host.keys.held?.() ?? []) {
    const d = DIK[c];
    if (d !== undefined) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

/** DIK → `code` (`""` für unbekannte Codes). */
export function codeOfDik(dik: number): string {
  return CODE_OF.get(dik) ?? "";
}

/** Zweite Tasten, wie sie das Menü zuletzt gültig gemacht hat (30 Einträge, `DEFAULT_KEYS`). */
let secondKeys: readonly string[] = DEFAULT_KEYS;

/** Übernimmt die zweiten Tasten der Konfiguration für Menü und Spiel. */
export function useKeys(keys: readonly string[]): void {
  secondKeys = keys.length === DEFAULT_KEYS.length ? keys : DEFAULT_KEYS;
}

/** Tasten einer Aktion: fest, umbelegbar, Zusatz — leere entfallen. */
function codesOf(set: number, name: Action | "horn"): string[] {
  const s = T1[set] ? set : 0;
  const a = ACTIONS.indexOf(name as Action);
  const out: string[] = [];
  if (a >= 0) {
    out.push(T1[s]![a]!);
    const t2 = secondKeys[s * 10 + a];
    if (t2) out.push(t2);
  }
  out.push(...(EXTRA[s]?.[name] ?? []));
  return out;
}

/** Eingabe eines Spielers; `set` wie `T1` (0 allein, 1/2 im Zwei-Spieler-Spiel). */
export function readInput(host: GameHost, set = 0): PlayerInput {
  const down = (name: Action | "horn") => codesOf(set, name).some((c) => host.keys.isDown(c));
  return {
    left: down("left"),
    up: down("up"),
    right: down("right"),
    down: down("down"),
    fire: down("fire"),
    beam: down("beam"),
    switchWeapon: down("switchWeapon"),
    switchBeam: down("switchBeam"),
    rotate: down("rotate"),
    nova: down("nova"),
    horn: down("horn"),
  };
}

/** Tastenname einer Aktion für den Tastenhinweis (erste Taste des Satzes). */
export function keyLabel(action: number, set = 0): string {
  const name = ACTIONS[action];
  const code = name ? codesOf(set, name)[0] : undefined;
  return code ? keyName(code) : "?";
}

/** `GetKeyText(T1, T2)` (`0x559400`): „a“ bzw. „a / b“ mit den Tasten einer Aktion (0…9) im Satz 0…2. */
export function keyText(
  set: number,
  action: number,
  second: readonly string[] = secondKeys,
): string {
  const s = T1[set] ? set : 0;
  const first = keyName(T1[s]![action] ?? "");
  const t2 = keyName(second[s * 10 + action] ?? "");
  return t2 === "" ? first : `${first} / ${t2}`;
}

/** Tasten von Spieler 1 für Continue und Pause (`TasteOK`, `TasteZurück`, hoch/runter). */
export function screenKeys(host: GameHost, set: number, exitState: number, focus: boolean) {
  const i = readInput(host, set);
  const key = (code: string) => host.keys.isDown(code);
  return {
    ok: ((i.fire || i.beam) && exitState === 0) || key("Space") || key("Enter"),
    back: i.switchWeapon || i.switchBeam || key("Escape"),
    up: i.up,
    down: i.down,
    focus,
  };
}

/** `TasteOK(0)` außerhalb des Spiels (Ladebild): Feuer, Beam, Leertaste, Enter. */
export function okKey(host: GameHost): boolean {
  const i = readInput(host);
  return i.fire || i.beam || host.keys.isDown("Space") || host.keys.isDown("Enter");
}

/** `TastePause`: Esc (am Pad Start). */
export function pauseKey(host: GameHost): boolean {
  return host.keys.isDown("Escape");
}
