import type { GameUi, UiConfirm } from "@clove/core";
import { NOT_RANKED, addHighscore, type HighscoreEntry } from "./highscore";
import { type Lang, pick } from "./lang";

/**
 * Continue-Bildschirm (`Continue` `0x521790`) als HTML-Abfrage der Shell über
 * dem eingefrorenen Spielbild: zuerst der Highscore-Eintrag mit dem vollen
 * Stand, dann „Continue“ mit Countdown 9 → 0 (je Schritt 28 Durchläufe à 40 ms)
 * und den Rang-Zeilen. „Ja“ setzt fort (`applyContinue`), „Nein“ oder der
 * Ablauf des Countdowns führen ins Hauptmenü.
 * Befund: `docs/measurements/dovez-runtime.md` („Continue“).
 */

/** Takt der Schleife des Originals (`Wait 40`, 25 Durchläufe/s). */
export const CONTINUE_MS = 40;
/** Durchläufe je Countdown-Schritt. */
export const STEP_PASSES = 28;
/** Dauer einer Ziffer des Countdowns. */
export const DIGIT_MS = STEP_PASSES * CONTINUE_MS;

/** Spieler, wie `Continue` ihn für den Highscore-Eintrag liest. */
export interface ContinuePlayer {
  readonly name: string;
  readonly score: number;
  readonly id: number;
}

/**
 * #3–#7: `AddHighscore` mit dem vollen Stand je Spieler. Kommt Spieler 2 vor
 * Spieler 1, rückt dessen Platz um eins.
 */
export function continueRanks(
  list: readonly HighscoreEntry[],
  players: readonly ContinuePlayer[],
): { list: HighscoreEntry[]; ranks: number[] } {
  let out = [...list];
  const ranks: number[] = [];
  for (const p of players) {
    const r = addHighscore(out, p.name, p.score, p.id);
    out = r.list;
    ranks.push(r.rank);
  }
  if (players.length === 2 && ranks[1]! <= ranks[0]!) ranks[0]!++;
  return { list: out, ranks };
}

/**
 * Rang-Zeilen (Arial 24, zentriert um x = 400, y = 490 + 20·p), nur Platz 1…10.
 * Das Original (`0x5232B3`) unterscheidet nur „D“; Russisch zeigt den englischen Text.
 */
export function rankTexts(
  names: readonly string[],
  ranks: readonly number[],
  lang: Lang,
): { readonly text: string; readonly player: number }[] {
  const out: { text: string; player: number }[] = [];
  ranks.forEach((rank, p) => {
    if (rank >= NOT_RANKED) return;
    const name = names[p] ?? "";
    out.push({
      text:
        lang === "de" ? `${name} landet auf Platz ${rank}!` : `${name} ranked at place ${rank}!`,
      player: p,
    });
  });
  return out;
}

/** Was „Continue“ an der Welt ändert (Felder von `World`). */
export interface ContinueTarget {
  lives: number;
  score: number[];
  extraLifeAt: number;
  musicVolume: number;
  musicStep: number;
  readonly playersMinus1: number;
}

/**
 * SpielLoop nach „ja“ (#271–#297): Leben 4 (2P 7), Punkte `\ 3` je Spieler,
 * Extraleben-Schwelle 3, Levelmusik blendet von 0 in 20 Ticks ein. Danach
 * zieht der normale Neustart (`World.respawn`) ein Leben ab → 3 bzw. 6.
 */
export function applyContinue(w: ContinueTarget): void {
  w.lives = w.playersMinus1 === 0 ? 4 : 7;
  w.score = w.score.map((s, p) => (p <= w.playersMinus1 ? Math.trunc(s / 3) : s));
  w.extraLifeAt = 3;
  w.musicVolume = 0;
  w.musicStep = 5;
}

/** „Ja“/„Nein“ der Abfrage (im Original nur Feuer bzw. Ablauf). */
export function continueItems(lang: Lang): readonly [string, string] {
  return [pick(lang, "Ja", "Yes", "Да"), pick(lang, "Nein", "No", "Нет")];
}

/** Die Abfrage: Titel „Continue“ (in allen Sprachen), Rang-Zeilen, Countdown ab 9. */
export function continueConfirm(lines: readonly string[], lang: Lang): UiConfirm {
  const [yes, no] = continueItems(lang);
  return {
    kind: "confirm",
    over: "level",
    title: "Continue",
    lines,
    items: [
      { id: "yes", label: yes },
      { id: "no", label: no },
    ],
    selected: "yes",
    // Zurück (Esc, D, Q im Original) zählt dreimal so schnell herunter
    countdown: { from: 9, ms: DIGIT_MS, faster: 3 },
  };
}

/** Was Continue vom Spiel braucht: Spieler, Highscoreliste und deren Speicher. */
export interface ContinueProfile {
  readonly names: readonly string[];
  readonly ids: readonly number[];
  readonly highscores: readonly HighscoreEntry[];
  store(list: HighscoreEntry[]): void;
}

/**
 * Ablauf ohne Leben: Highscore eintragen (#3–#7, ohne `persist` nicht
 * gespeichert), Abfrage zeigen; `true` = weiterspielen. Wird der Bildschirm von
 * außen geschlossen, gilt „nein“.
 */
export async function runContinue(
  ui: GameUi,
  o: {
    readonly lang: Lang;
    readonly profile: ContinueProfile;
    readonly score: readonly number[];
    readonly persist: boolean;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<boolean> {
  const { names, ids } = o.profile;
  const players = names.map((name, p) => ({ name, score: o.score[p] ?? 0, id: ids[p]! }));
  const r = continueRanks(o.profile.highscores, players);
  if (o.persist) o.profile.store(r.list);
  const lines = rankTexts(names, r.ranks, o.lang).map((t) => t.text);
  const reply = await ui.show(continueConfirm(lines, o.lang), o.signal);
  return reply.id === "yes";
}
