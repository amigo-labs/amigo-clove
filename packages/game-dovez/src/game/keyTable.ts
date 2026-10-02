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

export type Action = (typeof ACTIONS)[number];

/** Erste Taste je Aktion (Reihenfolge `ACTIONS`) für die Sätze 0…2. */
export const T1: readonly (readonly string[])[] = [
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
export const EXTRA: readonly Readonly<Partial<Record<keyof PlayerInput, readonly string[]>>>[] = [
  { fire: ["Space"], horn: ["F11"] },
  { horn: ["F11"] },
  { horn: ["F11"] },
];

/**
 * Tasten einer Aktion im Satz 0…2: die feste Taste aus `T1` und die Zusatztasten.
 * Zweite Tasten fragt das Spiel nicht ab; welche Taste der Spieler drückt, legt die
 * Tastenbelegung der Shell fest (`keys.ts`).
 */
export function actionCodes(set: number, name: Action | "horn"): string[] {
  const s = T1[set] ? set : 0;
  const a = ACTIONS.indexOf(name as Action);
  const out: string[] = [];
  if (a >= 0) out.push(T1[s]![a]!);
  out.push(...(EXTRA[s]?.[name] ?? []));
  return out;
}
