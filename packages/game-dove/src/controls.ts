import type { ControlRow, ControlsSheet, GamepadBindings } from "@clove/core";
import { KEY_ACTIONS, type KeyActionId } from "./keys";

/** Maus wie `input.ts`: links Feuer, rechts Beam, Mitte Extrawaffe, Rad Tempo. */
const POINTER: Readonly<Partial<Record<KeyActionId, ControlRow["pointer"]>>> = {
  fire: "left",
  beam: "right",
  swap: "middle",
  faster: "wheelUp",
  slower: "wheelDown",
};

/**
 * Tastenübersicht für Launcher und Pause: die Aktionen der Tastenbelegung (gleiche
 * IDs, die Shell ergänzt die zweiten Tasten) plus Pause. Reine Daten wie `keys.ts`.
 */
export const DOVE_CONTROLS: ControlsSheet = [
  {
    rows: [
      ...KEY_ACTIONS.map((a) => {
        const pointer = POINTER[a.id];
        return pointer ? { ...a, pointer } : a;
      }),
      {
        id: "pause",
        label: { de: "Pause / Zurück", en: "Pause / Back", ru: "Пауза / Назад" },
        codes: ["Escape"],
      },
    ],
  },
];

/**
 * A Feuer/Bestätigen, B Beam, X Extrawaffe drehen, Y Enter (Namenseingabe),
 * Schultertasten Tempo, Start/Back Pause bzw. zurück.
 */
export const DOVE_GAMEPAD: GamepadBindings = {
  0: ["Space"],
  1: ["KeyA"],
  2: ["KeyD"],
  3: ["Enter"],
  4: ["KeyQ"],
  5: ["KeyW"],
  6: ["KeyQ"],
  7: ["KeyW"],
  8: ["Escape"],
  9: ["Escape"],
};
