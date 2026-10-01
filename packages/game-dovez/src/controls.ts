import type {
  ControlGroup,
  ControlRow,
  ControlsSheet,
  GamepadBindings,
  LocalLabel,
  PadLayout,
} from "@clove/core";
import { ACTIONS, DEFAULT_KEYS, actionCodes, type Action } from "./game/keyTable";
import { menuTexts } from "./game/menu/menuTexts";

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

/** Beschriftung einer Aktion wie in der Tastenkonfiguration des Spiels. */
function label(a: number): LocalLabel {
  return {
    de: menuTexts("de").keys.labels[a]!,
    en: menuTexts("en").keys.labels[a]!,
    ru: menuTexts("ru").keys.labels[a]!,
  };
}

const HORN: LocalLabel = { de: "Hupe", en: "Horn", ru: "Гудок" };
const PAUSE: ControlRow = {
  id: "pause",
  label: { de: "Pause", en: "Pause", ru: "Пауза" },
  codes: ["Escape"],
};
const SOLO: LocalLabel = { de: "Einzelspieler", en: "Single player", ru: "Один игрок" };
const PLAYER: readonly LocalLabel[] = [
  { de: "Spieler 1", en: "Player 1", ru: "Игрок 1" },
  { de: "Spieler 2", en: "Player 2", ru: "Игрок 2" },
];

/** Zeilen eines Tastensatzes (0 allein, 1/2 im Zwei-Spieler-Spiel) samt Pause; Maus nur für Spieler 1. */
function rows(set: number, second: readonly string[], mouse: boolean): ControlRow[] {
  const out: ControlRow[] = ACTIONS.map((id, a) => {
    const pointer = mouse ? POINTER[id] : undefined;
    const codes = actionCodes(set, id, second);
    return pointer ? { id, label: label(a), codes, pointer } : { id, label: label(a), codes };
  });
  out.push({ id: "horn", label: HORN, codes: actionCodes(set, "horn", second) }, PAUSE);
  return out;
}

/** Die beiden Spieler im Zwei-Spieler-Spiel, jeder mit seinem Pad. */
function duo(second: readonly string[]): ControlGroup[] {
  return [
    { label: PLAYER[0]!, pad: 0, rows: rows(1, second, true) },
    { label: PLAYER[1]!, pad: 1, rows: rows(2, second, false) },
  ];
}

/**
 * Tastenübersicht der Pause: `second` sind die zweiten Tasten der Tastenkonfiguration
 * (30 Einträge, Vorgabe `DEFAULT_KEYS`); im Zwei-Spieler-Spiel je Spieler ein Abschnitt.
 * Reine Daten ohne Pixi, damit der Launcher sie lädt, ohne das Spiel zu laden.
 */
export function dovezControls(
  players: 1 | 2,
  second: readonly string[] = DEFAULT_KEYS,
): ControlsSheet {
  return players === 1 ? [{ rows: rows(0, second, true) }] : duo(second);
}

/** Für den Launcher: Einzelspieler und beide Spieler des Zwei-Spieler-Spiels (Vorgabetasten). */
export function dovezAllControls(): ControlsSheet {
  return [{ label: SOLO, rows: rows(0, DEFAULT_KEYS, true) }, ...duo(DEFAULT_KEYS)];
}
