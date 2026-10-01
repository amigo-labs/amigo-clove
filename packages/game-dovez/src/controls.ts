import type {
  ControlGroup,
  ControlRow,
  ControlsSheet,
  GamepadBindings,
  LocalLabel,
  PadLayout,
} from "@clove/core";
import { ACTIONS, type Action } from "./game/keyTable";
import { HORN_LABEL, KEY_ACTIONS, actionId } from "./keys";

/** A Feuer, B Beam, X Wechsel, Y Drehen, Schultertasten Force/Beam-Modus und Nova, Start Pause. */
export const DOVEZ_GAMEPAD: GamepadBindings = {
  0: ["KeyS"],
  1: ["KeyA"],
  2: ["KeyD"],
  3: ["KeyW"],
  4: ["KeyQ"],
  5: ["KeyE"],
  9: ["Escape"],
};

/** Zweites Pad: Spieler 2 im Zwei-Spieler-Spiel (Satz 2: Ziffernblock, Ende/Entf/Bild ab …). */
export const DOVEZ_PADS: readonly (PadLayout | undefined)[] = [
  undefined,
  {
    buttons: {
      0: ["End"],
      1: ["Delete"],
      2: ["PageDown"],
      3: ["Home"],
      4: ["Insert"],
      5: ["PageUp"],
      9: ["Escape"],
    },
    directions: ["Numpad8", "Numpad5", "Numpad4", "Numpad6"],
  },
];

/** Maus wie `PointerControl`: links Feuer, rechts Beam, Mitte Super-Nova, Rad Extrawaffe. */
const POINTER: Readonly<Partial<Record<Action, ControlRow["pointer"]>>> = {
  fire: "left",
  beam: "right",
  nova: "middle",
  switchWeapon: "wheel",
};

const PAUSE: ControlRow = {
  id: "pause",
  label: { de: "Pause", en: "Pause", ru: "Пауза" },
  codes: ["Escape"],
};
const PLAYER: readonly LocalLabel[] = [
  { de: "Spieler 1", en: "Player 1", ru: "Игрок 1" },
  { de: "Spieler 2", en: "Player 2", ru: "Игрок 2" },
];

/**
 * Zeilen eines Spielers samt Hupe und Pause, mit den IDs der Tastenbelegung
 * (`KEY_ACTIONS`): die Shell setzt die belegten Tasten ein, die Codes bestimmen
 * die Pad-Tasten. Maus nur für Spieler 1.
 */
function rows(player: number): ControlRow[] {
  const out: ControlRow[] = ACTIONS.map((a) => {
    const action = KEY_ACTIONS.find((k) => k.id === actionId(player, a))!;
    const pointer = player === 0 ? POINTER[a] : undefined;
    const row = { id: action.id, label: action.label, codes: action.codes };
    return pointer ? { ...row, pointer } : row;
  });
  out.push({ id: "horn", label: HORN_LABEL, codes: ["F11"] }, PAUSE);
  return out;
}

/** Die beiden Spieler im Zwei-Spieler-Spiel, jeder mit seinem Pad. */
function duo(): ControlGroup[] {
  return [
    { label: PLAYER[0]!, pad: 0, rows: rows(0) },
    { label: PLAYER[1]!, pad: 1, rows: rows(1) },
  ];
}

/**
 * Tastenübersicht der Pause; im Zwei-Spieler-Spiel je Spieler ein Abschnitt.
 * Reine Daten ohne Pixi, damit der Launcher sie lädt, ohne das Spiel zu laden.
 */
export function dovezControls(players: 1 | 2): ControlsSheet {
  return players === 1 ? [{ rows: rows(0) }] : duo();
}

/** Für den Launcher: Spieler 1 (allein wie zu zweit) und Spieler 2. */
export function dovezAllControls(): ControlsSheet {
  return duo();
}
