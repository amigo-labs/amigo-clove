import type { ControlRow, ControlsSheet, GamepadBindings, Locale, PadLayout } from "@clove/core";
import { h } from "./dom";
import type { GameRect, Stage } from "./overlay";
import { keyName, type SecondKeys } from "./keymap";
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

/** Ab so viel Platz rechts vom Spielbild steht die Übersicht daneben statt darüber. */
const SIDE_MIN = 300;
/** Kleinste Schrift (px) neben dem Spielbild; braucht es weniger, rückt die Übersicht ins Bild. */
const SIDE_FONT = 11;
/** Kleinste Schrift (px), auf die die Übersicht im Spielbild schrumpft, damit sie ganz hineinpasst. */
const MIN_FONT = 8;

export interface ControlsOptions {
  readonly t: ShellText;
  readonly locale: Locale;
  /** Pad-Belegung des Spiels; ohne sie entfällt die Gamepad-Spalte. */
  readonly gamepad?: GamepadBindings | undefined;
  readonly pads?: readonly (PadLayout | undefined)[] | undefined;
  /** Zweite Tasten aus den Einstellungen der Shell (Aktion → Code). */
  readonly second?: SecondKeys | undefined;
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
      const extra = o.second?.[row.id];
      const codes = extra && !row.codes.includes(extra) ? [...row.codes, extra] : row.codes;
      return {
        action: row.label[o.locale],
        keys: [...new Set(codes.map((c) => (c === "Space" ? o.t("keySpace") : keyName(c))))],
        pad: o.showPad && buttons ? padButtons(codes, buttons, layout?.directions) : [],
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

/**
 * Tastenübersicht während der Pause: liest einmal pro Bild `GameInstance.controls()`
 * und zeigt sie rechts neben dem Spielbild, wenn Platz ist, sonst darin (`GameModule.controlsAt`).
 */
export class ControlsView {
  private readonly root: HTMLElement;
  private raf = 0;
  private shown: ControlsSheet | null = null;

  constructor(
    private readonly stage: Stage,
    private readonly t: ShellText,
    private readonly source: () => ControlsSheet | null,
    private readonly options: () => ControlsOptions,
    /** Lage im Spielbild ohne Platz daneben (`GameModule.controlsAt`). */
    at: "top" | "center" | "bottom" = "center",
  ) {
    this.root = h("section", {
      class: "controls-overlay",
      hidden: true,
      "aria-label": t("controls"),
      "data-at": at,
    });
    stage.layer.append(this.root);
    stage.onLayout((r) => this.place(r));
    const tick = () => {
      this.update();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * Rechts daneben, wenn die Übersicht dort mit lesbarer Schrift ganz Platz hat,
   * sonst im Spielbild; verkleinert die Schrift, bis alles hineinpasst.
   */
  private place(r: GameRect): void {
    if (this.root.hidden) return;
    const right = this.stage.root.clientWidth - r.x - r.w;
    const fits = (layout: string, min: number) => {
      this.root.style.fontSize = "";
      this.root.dataset["layout"] = layout;
      let size = Number.parseFloat(getComputedStyle(this.root).fontSize);
      while (this.overflows() && size > min) {
        size -= 0.5;
        this.root.style.fontSize = `${size}px`;
      }
      return !this.overflows();
    };
    if (right < SIDE_MIN || !fits("side", SIDE_FONT)) fits("inside", MIN_FONT);
  }

  private overflows(): boolean {
    const el = this.root;
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  }

  private update(): void {
    const sheet = this.source();
    if (sheet === this.shown) return;
    this.shown = sheet;
    this.root.hidden = !sheet;
    if (!sheet) return;
    this.root.replaceChildren(
      h("h2", {}, this.t("controls")),
      controlsElement(controlsTables(sheet, this.options()), this.t),
    );
    this.place(this.stage.rect());
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }
}
