import {
  PAUSE_TEXTS,
  type ControlsSheet,
  type GameUi,
  type UiBlock,
  type UiMenu,
} from "@clove/core";
import { type HighscoreEntry, addHighscore } from "./highscore";
import { type Lang, levelRu } from "./lang";

/**
 * Pause-Bildschirm (`Pause` `0x524610`) als HTML-Menü der Shell über dem
 * eingefrorenen Spielbild, im Aufbau wie in DOVE: „Pause“, darunter
 * `Levelname (Namen)`, Weiter/Spiel beenden, das Funkprotokoll und die
 * Tastenübersicht. Esc setzt fort; „Spiel beenden“ (EXIT) trägt den
 * aktuellen Stand in die Highscoreliste ein und führt ins Hauptmenü.
 * Befund: `docs/measurements/dovez-runtime.md` („Pause“).
 */

/** Umbruchbreite (px, Arial 18) und Zeilen des Funkprotokolls. */
export const LOG_WIDTH = 530;
export const LOG_ROWS = 7;

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

/**
 * Titelzeile: `Levelname (Name[ & Name2])`. Russisch (`0x5275BF`) kürzt den
 * Levelnamen auf `Уровень1-1` (`levelRu`), die anderen Sprachen zeigen ihn ganz.
 */
export function pauseTitle(level: string, names: readonly string[], lang: Lang): string {
  return `${lang === "ru" ? levelRu(level) : level} (${names.join(" & ")})`;
}

/**
 * Menüpunkte je Sprache, wie in der Pause von DOVE (`PAUSE_TEXTS`); das Original
 * (`0x527187…0x527413`) zeigt „WEITER“/„RESUME“/„Продолжить“ und „EXIT“/„Выход“.
 */
export function pauseMenu(lang: Lang): readonly [string, string] {
  return [PAUSE_TEXTS.resume[lang], PAUSE_TEXTS.quit[lang]];
}

let measureCtx: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * Breite eines Textes in Arial 18 wie im Original (`OffscreenCanvas`, sonst
 * geschätzt mit 9 px je Zeichen, etwa in Tests ohne Browser).
 */
export function logTextWidth(s: string): number {
  if (measureCtx === undefined) {
    try {
      measureCtx =
        typeof OffscreenCanvas === "function" ? new OffscreenCanvas(1, 1).getContext("2d") : null;
      if (measureCtx) measureCtx.font = "18px Arial, Helvetica, 'Liberation Sans', sans-serif";
    } catch {
      measureCtx = null;
    }
  }
  return measureCtx ? measureCtx.measureText(s).width : s.length * 9;
}

/** Das Pausemenü: Weiter/Spiel beenden, Funkprotokoll darüber, Tastenübersicht daneben. */
export function pauseScreen(o: {
  readonly lang: Lang;
  readonly level: string;
  readonly names: readonly string[];
  readonly log: readonly string[];
  readonly controls?: ControlsSheet | undefined;
}): UiMenu {
  const [resume, exit] = pauseMenu(o.lang);
  // Leerzeilen vor der ersten Meldung tragen nichts
  const first = o.log.findIndex((l) => l !== "");
  const lines = first < 0 ? [] : o.log.slice(first);
  const blocks: UiBlock[] = lines.length > 0 ? [{ kind: "lines", lines, tone: "dim" }] : [];
  return {
    kind: "menu",
    over: "level",
    title: PAUSE_TEXTS.title[o.lang],
    subtitle: pauseTitle(o.level, o.names, o.lang),
    items: [
      { id: "resume", label: resume },
      { id: "exit", label: exit },
    ],
    selected: "resume",
    back: "resume",
    blocks,
    ...(o.controls ? { aside: [{ kind: "controls", sheet: o.controls }] } : {}),
  };
}

/** Was die Pause vom Spiel braucht (Highscore bei „EXIT“). */
export interface PauseProfile {
  readonly names: readonly string[];
  readonly ids: readonly number[];
  readonly highscores: readonly HighscoreEntry[];
  store(list: HighscoreEntry[]): void;
}

/**
 * Pause bis zur Antwort: `exit` trägt vorher alle Spieler mit ihrem Stand ein
 * (ohne `persist` nicht gespeichert); von außen geschlossen gilt „weiter“.
 */
export async function runPause(
  ui: GameUi,
  o: {
    readonly lang: Lang;
    readonly level: string;
    readonly profile: PauseProfile;
    readonly score: readonly number[];
    readonly log: readonly string[];
    readonly controls?: ControlsSheet | undefined;
    readonly persist: boolean;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<"resume" | "exit"> {
  const { profile } = o;
  const reply = await ui.show(
    pauseScreen({
      lang: o.lang,
      level: o.level,
      names: profile.names,
      log: wrapRadioLog(o.log, logTextWidth),
      controls: o.controls,
    }),
    o.signal,
  );
  if (reply.id !== "exit") return "resume";
  let list = [...profile.highscores];
  profile.names.forEach((name, p) => {
    list = addHighscore(list, name, o.score[p] ?? 0, profile.ids[p]!).list;
  });
  if (o.persist) profile.store(list);
  return "exit";
}
