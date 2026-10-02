import {
  PRESET_LABELS,
  type KeyAction,
  type KeyBindings,
  type KeyLayout,
  type LocalLabel,
} from "@clove/core";
import { ACTIONS, DEFAULT_KEYS, EXTRA, T1, type Action } from "./game/keyTable";
import { menuTexts } from "./game/menu/menuTexts";

/**
 * Tastenbelegung der Shell für DoveZ. Das Spiel fragt je Satz nach den festen
 * Tasten `T1` (plus Leertaste und F11); Spieler 1 umfasst Satz 0 (allein) und
 * Satz 1 (zu zweit), Spieler 2 Satz 2. Die zweiten Tasten der alten
 * Tastenkonfiguration entfallen, die Shell belegt die Aktionen frei.
 * Reine Daten ohne Pixi.
 */

/** Beschriftung einer Aktion wie in der Tastenkonfiguration des Originals. */
export function actionLabel(a: number): LocalLabel {
  return {
    de: menuTexts("de").keys.labels[a]!,
    en: menuTexts("en").keys.labels[a]!,
    ru: menuTexts("ru").keys.labels[a]!,
  };
}

export const HORN_LABEL: LocalLabel = { de: "Hupe", en: "Horn", ru: "Гудок" };

const GROUP: Readonly<Record<Action, "move" | "weapon">> = {
  left: "move",
  up: "move",
  right: "move",
  down: "move",
  fire: "weapon",
  beam: "weapon",
  switchWeapon: "weapon",
  switchBeam: "weapon",
  rotate: "weapon",
  nova: "weapon",
};

const NAV: Readonly<Partial<Record<Action, NonNullable<KeyAction["nav"]>>>> = {
  left: "left",
  up: "up",
  right: "right",
  down: "down",
  fire: "ok",
};

/** ID der Aktion `a` für Spieler 0 bzw. 1 (`left`, `left2`). */
export function actionId(player: number, a: Action): string {
  return player === 0 ? a : `${a}2`;
}

function codesFor(player: number, a: Action): string[] {
  const i = ACTIONS.indexOf(a);
  const sets = player === 0 ? [0, 1] : [2];
  const out = sets.map((s) => T1[s]![i]!);
  for (const s of sets) out.push(...(EXTRA[s]?.[a as keyof (typeof EXTRA)[number]] ?? []));
  return [...new Set(out)];
}

export const KEY_ACTIONS: readonly KeyAction[] = [
  ...[0, 1].flatMap((player) =>
    ACTIONS.map((a, i) => {
      const nav = player === 0 ? NAV[a] : undefined;
      return {
        id: actionId(player, a),
        label: actionLabel(i),
        codes: codesFor(player, a),
        group: GROUP[a],
        player,
        ...(nav ? { nav } : {}),
      };
    }),
  ),
  { id: "horn", label: HORN_LABEL, codes: ["F11"], group: "system" },
];

/** Satz 2 des Originals mit seiner zweiten Vorgabetaste (Num 2 runter). */
function player2(): Record<string, readonly string[]> {
  return Object.fromEntries(
    ACTIONS.map((a, i) => {
      const t2 = DEFAULT_KEYS[20 + i];
      return [actionId(1, a), t2 ? [T1[2]![i]!, t2] : [T1[2]![i]!]];
    }),
  );
}

/** Vorlage: Spieler 1 mit `keys` (je Aktion in der Reihenfolge von `ACTIONS`), Spieler 2 und Hupe fest. */
function preset(keys: readonly (readonly string[])[]): KeyBindings {
  return {
    ...Object.fromEntries(ACTIONS.map((a, i) => [actionId(0, a), keys[i]!])),
    ...player2(),
    horn: ["F11"],
  };
}

/** Original: Pfeile, Waffen S A D Q W E (Leertaste feuert mit); Spieler 2 Ziffernblock. */
const ARROWS = preset([
  ["ArrowLeft"],
  ["ArrowUp"],
  ["ArrowRight"],
  ["ArrowDown"],
  ["KeyS", "Space"],
  ["KeyA"],
  ["KeyD"],
  ["KeyQ"],
  ["KeyW"],
  ["KeyE"],
]);

/** WASD links, Waffen rechts auf J K L / U I O. */
const WASD = preset([
  ["KeyA"],
  ["KeyW"],
  ["KeyD"],
  ["KeyS"],
  ["KeyJ", "Space"],
  ["KeyK"],
  ["KeyL"],
  ["KeyU"],
  ["KeyI"],
  ["KeyO"],
]);

export const KEY_LAYOUT: KeyLayout = {
  actions: KEY_ACTIONS,
  presets: [
    { id: "arrows", label: PRESET_LABELS.arrows, keys: ARROWS },
    { id: "wasd", label: PRESET_LABELS.wasd, keys: WASD },
  ],
};

/**
 * Zweite Tasten der alten Tastenkonfiguration im Spiel (30 Einträge) als
 * Zusatztasten je Aktion: Satz 0 → Spieler 1, Satz 2 → Spieler 2. Satz 1
 * (Spieler 1 zu zweit, Vorgabe die Pfeile) geht auf, wenn Satz 0 nichts hat.
 */
export function legacyExtraKeys(second: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (second.length !== DEFAULT_KEYS.length) return out;
  ACTIONS.forEach((a, i) => {
    const solo = second[i];
    const duo = second[10 + i];
    const p1 = solo || (duo !== DEFAULT_KEYS[10 + i] ? duo : "");
    if (p1) out[actionId(0, a)] = p1;
    const p2 = second[20 + i];
    if (p2 && p2 !== DEFAULT_KEYS[20 + i]) out[actionId(1, a)] = p2;
  });
  return out;
}
