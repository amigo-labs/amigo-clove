import type {
  ControlRow,
  ControlsSheet,
  GamepadBindings,
  KeyBindings,
  Locale,
  PadLayout,
} from "@clove/core";
import { h } from "./dom";
import { keyName } from "./keymap";
import type { ShellText, TextKey } from "./texts";

/** Tasten der W3C-Standardbelegung (`Gamepad.buttons`) mit ihren üblichen Namen. */
const PAD_NAMES: readonly string[] = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start"];

/** Steuerkreuz und linker Stick sind ohne eigene Belegung die Pfeiltasten. */
const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
const ARROW_SIGNS = ["↑", "↓", "←", "→"] as const;

const POINTER_TEXT: Readonly<Record<NonNullable<ControlRow["pointer"]>, TextKey>> = {
  left: "mouseLeft",
  right: "mouseRight",
  middle: "mouseMiddle",
  wheel: "mouseWheel",
  wheelUp: "mouseWheelUp",
  wheelDown: "mouseWheelDown",
};

export interface ControlsOptions {
  readonly t: ShellText;
  readonly locale: Locale;
  /** Pad-Belegung des Spiels; ohne sie entfällt die Gamepad-Spalte. */
  readonly gamepad?: GamepadBindings | undefined;
  readonly pads?: readonly (PadLayout | undefined)[] | undefined;
  /** Tastenbelegung der Shell: Zeilen mit der ID einer Aktion zeigen deren Tasten. */
  readonly bindings?: KeyBindings | undefined;
  /** Gamepad- bzw. Maus-Spalte zeigen (Einstellungen). */
  readonly showPad: boolean;
  readonly showPointer: boolean;
}

export interface ControlsLine {
  readonly action: string;
  readonly keys: readonly string[];
  readonly pad: readonly string[];
  readonly pointer: string;
}

export interface ControlsTable {
  readonly label?: string;
  readonly pad: boolean;
  readonly pointer: boolean;
  readonly lines: readonly ControlsLine[];
}

/** Pad-Tasten, die das Spiel als eine der `codes` sieht (Steuerkreuz bzw. linker Stick zuerst, ✚). */
export function padButtons(
  codes: readonly string[],
  buttons: GamepadBindings,
  directions: readonly string[] = ARROWS,
): string[] {
  const out: string[] = [];
  directions.forEach((d, i) => {
    if (codes.includes(d)) out.push(`✚ ${ARROW_SIGNS[i]}`);
  });
  for (const [b, bound] of Object.entries(buttons)) {
    if (bound.some((c) => codes.includes(c))) out.push(PAD_NAMES[Number(b)] ?? `#${b}`);
  }
  return out;
}

/** Tastenübersicht als beschriftete Zeilen; leere Gamepad- und Maus-Spalten entfallen. */
export function controlsTables(sheet: ControlsSheet, o: ControlsOptions): ControlsTable[] {
  return sheet.map((group) => {
    const layout = o.pads?.[group.pad ?? 0];
    const buttons = layout?.buttons ?? o.gamepad;
    const lines = group.rows.map((row) => {
      // die Tasten zeigt die Belegung, die Pad-Tasten folgen den Codes des Spiels
      const bound = o.bindings?.[row.id] ?? row.codes;
      return {
        action: row.label[o.locale],
        keys: [...new Set(bound.map((c) => (c === "Space" ? o.t("keySpace") : keyName(c))))],
        pad: o.showPad && buttons ? padButtons(row.codes, buttons, layout?.directions) : [],
        pointer: o.showPointer && row.pointer ? o.t(POINTER_TEXT[row.pointer]) : "",
      };
    });
    return {
      ...(group.label ? { label: group.label[o.locale] } : {}),
      pad: lines.some((l) => l.pad.length > 0),
      pointer: lines.some((l) => l.pointer !== ""),
      lines,
    };
  });
}

function keys(list: readonly string[]): (Node | string)[] {
  return list.flatMap((k, i) => (i === 0 ? [h("kbd", {}, k)] : [" / ", h("kbd", {}, k)]));
}

/** Die Übersicht als HTML: je Abschnitt eine Tabelle Aktion | Tastatur | Gamepad | Maus. */
export function controlsElement(tables: readonly ControlsTable[], t: ShellText): HTMLElement {
  const box = h("div", { class: "controls-sheet" });
  for (const tab of tables) {
    const head = h(
      "tr",
      {},
      h("th", { scope: "col" }, t("colAction")),
      h("th", { scope: "col" }, t("colKeyboard")),
      tab.pad && h("th", { scope: "col" }, t("gamepad")),
      tab.pointer && h("th", { scope: "col" }, t("colMouse")),
    );
    const body = tab.lines.map((l) =>
      h(
        "tr",
        {},
        h("th", { scope: "row" }, l.action),
        h("td", {}, ...keys(l.keys)),
        tab.pad && h("td", {}, ...keys(l.pad)),
        tab.pointer && h("td", {}, l.pointer),
      ),
    );
    box.append(
      h(
        "table",
        {},
        tab.label && h("caption", {}, tab.label),
        h("thead", {}, head),
        h("tbody", {}, ...body),
      ),
    );
  }
  return box;
}
