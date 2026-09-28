import type { GameHost } from "@clove/core";
import type { PlayerInput } from "../sim/player";

/**
 * Tastenbelegungen aus `InitKeyConfig` (`0x504BA0`, Schema 0), je Aktion eine
 * oder zwei Tasten (DIK-Codes als `KeyboardEvent.code`): Satz 0 für ein
 * Spieler, 1 und 2 für Spieler 1 und 2 im Zwei-Spieler-Spiel.
 */
const KEY_SETS: readonly Readonly<Record<keyof PlayerInput, readonly string[]>>[] = [
  {
    left: ["ArrowLeft"],
    up: ["ArrowUp"],
    right: ["ArrowRight"],
    down: ["ArrowDown"],
    fire: ["KeyS", "Space"],
    beam: ["KeyA"],
    switchWeapon: ["KeyD"],
    switchBeam: ["KeyQ"],
    rotate: ["KeyW"],
    nova: ["KeyE"],
    horn: ["F11"],
  },
  {
    left: ["KeyJ", "ArrowLeft"],
    up: ["KeyI", "ArrowUp"],
    right: ["KeyL", "ArrowRight"],
    down: ["KeyK", "ArrowDown"],
    fire: ["KeyS"],
    beam: ["KeyA"],
    switchWeapon: ["KeyD"],
    switchBeam: ["KeyQ"],
    rotate: ["KeyW"],
    nova: ["KeyE"],
    horn: ["F11"],
  },
  {
    left: ["Numpad4"],
    up: ["Numpad8"],
    right: ["Numpad6"],
    down: ["Numpad5", "Numpad2"],
    fire: ["End"],
    beam: ["Delete"],
    switchWeapon: ["PageDown"],
    switchBeam: ["Insert"],
    rotate: ["Home"],
    nova: ["PageUp"],
    horn: ["F11"],
  },
];

/** Eingabe eines Spielers; `set` wie `KEY_SETS` (0 allein, 1/2 im Zwei-Spieler-Spiel). */
export function readInput(host: GameHost, set = 0): PlayerInput {
  const keys = KEY_SETS[set] ?? KEY_SETS[0]!;
  const down = (codes: readonly string[]) => codes.some((c) => host.keys.isDown(c));
  return {
    left: down(keys.left),
    up: down(keys.up),
    right: down(keys.right),
    down: down(keys.down),
    fire: down(keys.fire),
    beam: down(keys.beam),
    switchWeapon: down(keys.switchWeapon),
    switchBeam: down(keys.switchBeam),
    rotate: down(keys.rotate),
    nova: down(keys.nova),
    horn: down(keys.horn),
  };
}

/** Aktionen in der Reihenfolge der Belegungstabellen (`0x588174`, Index wie `SetSpecial` Typ 1). */
const ACTIONS = [
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

/** Tastenname einer Aktion für den Tastenhinweis (erste Taste des Satzes, `KeyS` → „S“). */
export function keyLabel(action: number, set = 0): string {
  const name = ACTIONS[action];
  const code = name ? (KEY_SETS[set] ?? KEY_SETS[0]!)[name][0] : undefined;
  return (code ?? "?").replace(/^Key|^Digit/, "").replace(/^Arrow/, "");
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
