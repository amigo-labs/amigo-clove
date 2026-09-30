import type { KeyAction } from "@clove/core";

/**
 * Aktionen und Originaltasten (`Keyboard`, `0x4398D0`) für die Tastenbelegung
 * der Shell. Reine Daten ohne Abhängigkeiten, damit die Einstellungsseite sie
 * lädt, ohne das Spiel zu laden.
 */
export const KEY_ACTIONS = [
  { id: "up", label: { de: "Hoch", en: "Up", ru: "Вверх" }, codes: ["ArrowUp", "Numpad8"] },
  {
    id: "down",
    label: { de: "Runter", en: "Down", ru: "Вниз" },
    codes: ["ArrowDown", "Numpad2", "Numpad5"],
  },
  { id: "left", label: { de: "Links", en: "Left", ru: "Влево" }, codes: ["ArrowLeft", "Numpad4"] },
  {
    id: "right",
    label: { de: "Rechts", en: "Right", ru: "Вправо" },
    codes: ["ArrowRight", "Numpad6"],
  },
  { id: "fire", label: { de: "Feuer", en: "Fire", ru: "Огонь" }, codes: ["KeyS", "Space"] },
  { id: "beam", label: { de: "Beam laden", en: "Charge beam", ru: "Заряд луча" }, codes: ["KeyA"] },
  {
    id: "swap",
    label: { de: "Extrawaffe drehen", en: "Turn special weapon", ru: "Развернуть доп. оружие" },
    codes: ["KeyD"],
  },
  {
    id: "faster",
    label: { de: "Schneller", en: "Faster", ru: "Быстрее" },
    codes: ["KeyW", "KeyG"],
  },
  {
    id: "slower",
    label: { de: "Langsamer", en: "Slower", ru: "Медленнее" },
    codes: ["KeyQ", "KeyF"],
  },
] as const satisfies readonly KeyAction[];

export type KeyActionId = (typeof KEY_ACTIONS)[number]["id"];
