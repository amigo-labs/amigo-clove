import { PRESET_LABELS, originalKeys, type KeyAction, type KeyLayout } from "@clove/core";

/**
 * Aktionen und Originaltasten (`Keyboard`, `0x4398D0`) für die Tastenbelegung
 * der Shell. Reine Daten ohne Abhängigkeiten, damit die Einstellungsseite sie
 * lädt, ohne das Spiel zu laden.
 */
export const KEY_ACTIONS = [
  {
    id: "up",
    label: { de: "Hoch", en: "Up", ru: "Вверх" },
    codes: ["ArrowUp", "Numpad8"],
    group: "move",
    nav: "up",
  },
  {
    id: "down",
    label: { de: "Runter", en: "Down", ru: "Вниз" },
    codes: ["ArrowDown", "Numpad2", "Numpad5"],
    group: "move",
    nav: "down",
  },
  {
    id: "left",
    label: { de: "Links", en: "Left", ru: "Влево" },
    codes: ["ArrowLeft", "Numpad4"],
    group: "move",
    nav: "left",
  },
  {
    id: "right",
    label: { de: "Rechts", en: "Right", ru: "Вправо" },
    codes: ["ArrowRight", "Numpad6"],
    group: "move",
    nav: "right",
  },
  {
    id: "fire",
    label: { de: "Feuer", en: "Fire", ru: "Огонь" },
    codes: ["KeyS", "Space"],
    group: "weapon",
    nav: "ok",
  },
  {
    id: "beam",
    label: { de: "Beam laden", en: "Charge beam", ru: "Заряд луча" },
    codes: ["KeyA"],
    group: "weapon",
  },
  {
    id: "swap",
    label: { de: "Extrawaffe drehen", en: "Turn special weapon", ru: "Развернуть доп. оружие" },
    codes: ["KeyD"],
    group: "weapon",
  },
  {
    id: "faster",
    label: { de: "Schneller", en: "Faster", ru: "Быстрее" },
    codes: ["KeyW", "KeyG"],
    group: "weapon",
  },
  {
    id: "slower",
    label: { de: "Langsamer", en: "Slower", ru: "Медленнее" },
    codes: ["KeyQ", "KeyF"],
    group: "weapon",
  },
] as const satisfies readonly KeyAction[];

export type KeyActionId = (typeof KEY_ACTIONS)[number]["id"];

/**
 * Vorlagen: das Original (Pfeiltasten rechts, Waffen links auf S A D / Q W) und
 * gespiegelt WASD links mit den Waffen rechts auf J K L / U I.
 */
export const KEY_LAYOUT: KeyLayout = {
  actions: KEY_ACTIONS,
  presets: [
    { id: "arrows", label: PRESET_LABELS.arrows, keys: originalKeys(KEY_ACTIONS) },
    {
      id: "wasd",
      label: PRESET_LABELS.wasd,
      keys: {
        up: ["KeyW"],
        down: ["KeyS"],
        left: ["KeyA"],
        right: ["KeyD"],
        fire: ["KeyJ", "Space"],
        beam: ["KeyK"],
        swap: ["KeyL"],
        faster: ["KeyI"],
        slower: ["KeyU"],
      } satisfies Record<KeyActionId, readonly string[]>,
    },
  ],
};
