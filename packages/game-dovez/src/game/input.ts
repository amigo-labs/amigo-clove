import { PointerSteer, type GameHost } from "@clove/core";
import { HIT_BOTTOM, HIT_LEFT, HIT_RIGHT, HIT_TOP, type PlayerInput } from "../sim/player";
import { actionId } from "../keys";
import { ACTIONS, actionCodes, type Action } from "./keyTable";

export { ACTIONS, DEFAULT_KEYS } from "./keyTable";

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

/** Eingabe eines Spielers; `set` wie `T1` (0 allein, 1/2 im Zwei-Spieler-Spiel). */
export function readInput(host: GameHost, set = 0): PlayerInput {
  const down = (name: Action | "horn") => actionCodes(set, name).some((c) => host.keys.isDown(c));
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

/**
 * Tastenname einer Aktion für den Tastenhinweis: die erste belegte Taste
 * (Satz 2 gehört Spieler 2), sonst der Originalname der festen Taste.
 */
export function keyLabel(host: GameHost, action: number, set = 0): string {
  const name = ACTIONS[action];
  if (!name) return "?";
  const bound = host.boundKeys?.(actionId(set === 2 ? 1 : 0, name))[0];
  if (bound) return bound.name;
  const code = actionCodes(set, name)[0];
  return code ? keyName(code) : "?";
}

/** `TastePause`: Esc (am Pad Start). */
export function pauseKey(host: GameHost): boolean {
  return host.keys.isDown("Escape");
}

/**
 * Maus/Touch für Spieler 1 (Erweiterung): die Maus legt die Schiffsmitte unter
 * den Zeiger, links Feuer, rechts Beam, Mitte Super-Nova, Rad wechselt die
 * Extrawaffe. Touch zieht das Schiff relativ, ein Finger feuert, zwei laden.
 */
export class PointerControl {
  private readonly steer = new PointerSteer({
    x: (HIT_LEFT + HIT_RIGHT) >> 1,
    y: (HIT_TOP + HIT_BOTTOM) >> 1,
  });

  apply(
    host: GameHost,
    input: PlayerInput,
    ship: { readonly x: number; readonly y: number } | undefined,
  ): PlayerInput {
    const keysSteer = input.left || input.right || input.up || input.down;
    const p = this.steer.sample(host.pointer, ship, keysSteer);
    if (!p.target && !p.fire && !p.beam && !p.middle && p.wheel === 0) return input;
    return {
      ...input,
      fire: input.fire || p.fire,
      beam: input.beam || p.beam,
      nova: input.nova || p.middle,
      switchWeapon: input.switchWeapon || p.wheel !== 0,
      // ganze Pixel: die Simulation bleibt mit jeder Eingabequelle reproduzierbar
      target: p.target && { x: Math.round(p.target.x), y: Math.round(p.target.y) },
    };
  }
}
