import { COS_DEG, SIN_DEG, cint, degIndex, f32, vbInt } from "../sim/vb";
import type { Rnd } from "./continueScreen";

/**
 * Pause-Bildschirm (`Pause` `0x524610`), reine Logik ohne Pixi: Menü
 * WEITER/EXIT, Abtaststrich und Linsenstörung der Vorschau, Einblendung aus
 * dem Spielbild. Wie Continue zieht jeder Durchlauf die Zufallszahlen des
 * Originals in dessen Reihenfolge aus dem Spiel-`Rnd`; `pauseView.ts` zeichnet.
 * Befund: `docs/measurements/dovez-runtime.md` („Pause“).
 */

/** Takt der Schleife (`Wait 16`). */
export const PAUSE_MS = 16;
/** Vorschaufenster (Spielbild halb so groß). */
export const PREVIEW = { x1: 288, y1: 77, x2: 688, y2: 377 } as const;
/** Umbruchbreite und Zeilen des Funkprotokolls. */
export const LOG_WIDTH = 530;
export const LOG_ROWS = 7;

/** Tasten von Spieler 1 (Zustände). */
export interface PauseKeys {
  /** `TasteOK`: Feuer/Beam (ohne Levelausflug), Leertaste, Enter. */
  readonly ok: boolean;
  /** `TasteZurück`: Waffe wechseln, Beam-Modus, Esc. */
  readonly back: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly focus: boolean;
}

export interface PausePass {
  /** Gewählter Menüpunkt: 0 Weiter, 1 Exit. */
  readonly sel: number;
  /** Abtastzeile 1…300 in der Vorschau. */
  readonly pos: number;
  /** Linsenstörung: Phase `g` und Stärke `amp`; sonst Abtaststrich. */
  readonly lens: { readonly g: number; readonly amp: number } | undefined;
  /** Rauschpunkte: je (x, y, Breite, weiß 1/schwarz 0). */
  readonly noise: readonly number[];
  /** Senkrechte Linien (x in der Vorschau) und je ein Abdunkeln mit α. */
  readonly lines: readonly number[];
  readonly flicker: readonly number[];
  /** Einblendung: Spielbild mit diesem α darüber (fehlt: nicht gezeichnet). */
  readonly fade: number | undefined;
}

export interface PauseResult {
  /** „EXIT“ bestätigt: Highscore eintragen, zurück ins Hauptmenü. */
  readonly exit: boolean;
  /** Mit „WEITER“ gewählt (`sel = 0`): Musikpegel, `Pause.wav`, Funkstimme zurück. */
  readonly restore: boolean;
}

export class PauseLogic {
  /** `enter`: Esc/D/Q loslassen; `run`: Menü; `leave`: nochmals loslassen. */
  phase: "enter" | "run" | "leave" = "enter";
  sel = 0;
  pos = 0;
  g = 0;
  /** Einblende-Alpha `Me.518` und ihr Flag `Me.514`. */
  fadeAlpha = 1;
  fading = true;
  result: PauseResult | undefined;
  private decided: PauseResult | undefined;

  constructor(private readonly rnd: Rnd) {}

  /** Ein Durchlauf im 16-ms-Takt; `undefined`, wenn nichts gezeichnet wird. */
  step(keys: PauseKeys): PausePass | undefined {
    if (this.phase === "enter") {
      if (keys.back) return undefined;
      this.phase = "run";
    }
    if (this.phase === "run") {
      if ((keys.back || keys.ok) && keys.focus) {
        // #231: TasteOK erneut — „EXIT“ nur mit OK
        this.decided = { exit: keys.ok && this.sel === 1, restore: this.sel === 0 };
        this.phase = "leave";
      } else {
        if (keys.focus) {
          if (keys.up) this.sel = 0;
          if (keys.down) this.sel = 1;
        }
        return this.draw();
      }
    }
    if (!keys.back) this.result = this.decided;
    return undefined;
  }

  private draw(): PausePass {
    const rnd = this.rnd;
    this.pos++;
    if (this.pos > 300) this.pos = 1;
    const noise: number[] = [];
    const lines: number[] = [];
    const flicker: number[] = [];
    let lens: PausePass["lens"];
    if (this.g === 0) {
      if (this.pos > 20 && this.pos < 235 && rnd.next() < 0.02) this.g = 1;
    } else {
      const g = this.g;
      const c = f32(Math.abs(f32(f32(COS_DEG[degIndex(g * 5)]! / 2) + 0.5)));
      const amp = cint(f32(f32(f32(SIN_DEG[g]! * c) * 12) + 3));
      lens = { g, amp };
      const w = Math.trunc(g / 45) + 1;
      for (let k = 1; k <= amp; k++) {
        const x = cint(vbInt(398 * f32(rnd.next())) + 288);
        const y = cint(vbInt(f32(rnd.next() * 300)) + 77);
        noise.push(x, y, w, rnd.next() < 0.7 ? 1 : 0);
      }
      for (let k = 2; k <= Math.trunc(g / 45); k++) {
        lines.push(cint(f32(rnd.next() * 400)));
        flicker.push(f32(rnd.next() / 4));
      }
      this.g += 4;
      if (this.g >= 180) this.g = 0;
    }
    let fade: number | undefined;
    if (this.fading) {
      if (this.fadeAlpha === 0) this.fadeAlpha = 1;
      else {
        this.fadeAlpha = f32(this.fadeAlpha - 0.05);
        if (this.fadeAlpha <= 0) {
          this.fadeAlpha = 0;
          this.fading = false;
        }
        fade = this.fadeAlpha;
      }
    }
    return { sel: this.sel, pos: this.pos, lens, noise, lines, flicker, fade };
  }
}

/** VB `Trim`: nur Leerzeichen. */
function vbTrim(s: string): string {
  return s.replace(/^ +| +$/g, "");
}

/** `GetWord(s, n, " ")`: n-tes Wort von vorn, `" "`, wenn es weniger gibt. */
function getWord(s: string, n: number): string {
  const words = vbTrim(s)
    .split(" ")
    .filter((w) => w.length > 0);
  return words[n - 1] ?? " ";
}

/**
 * Funkprotokoll für die Pause (#20–#70): von der neuesten Meldung rückwärts,
 * je Meldung vorne Wörter abnehmen, bis der Rest in `LOG_WIDTH` passt; der
 * Rest steht unten, der Anfang darüber. Leere Einträge (Trenner des
 * Laufbands) werden zu einer Leerzeile, wenn darunter Text steht.
 */
export function wrapRadioLog(
  messages: readonly string[],
  measure: (s: string) => number,
): string[] {
  const lines = Array.from({ length: LOG_ROWS }, () => "");
  let line = LOG_ROWS - 1;
  for (let idx = messages.length - 1; line >= 0 && idx >= 0; idx--) {
    let s = vbTrim(messages[idx] ?? "");
    if (s.length === 0) {
      if (line < LOG_ROWS - 1 && lines[line + 1]!.length > 0) {
        lines[line] = "";
        line--;
      }
      continue;
    }
    for (;;) {
      let k = 0;
      let head = "";
      let w = measure(s);
      // Schutz: ein einzelnes zu langes Wort (das Original liefe hier in einen Fehler)
      while (w > LOG_WIDTH && head.length < s.length) {
        k++;
        head += `${getWord(s, k)} `;
        w = measure(vbTrim(s.slice(Math.min(head.length, s.length))));
      }
      if (head.length >= s.length) head = "";
      lines[line] = vbTrim(s.slice(head.length));
      line--;
      if (head.length > 0 && line >= 0) s = head;
      else break;
    }
  }
  return lines;
}

/** Titelzeile: `Levelname (Name[ & Name2])`. */
export function pauseTitle(level: string, names: readonly string[]): string {
  return `${level} (${names.join(" & ")})`;
}

/** Menüpunkte je Sprache (D „WEITER“, sonst „RESUME“; „EXIT“). */
export function pauseMenu(german: boolean): readonly [string, string] {
  return [german ? "WEITER" : "RESUME", "EXIT"];
}
