import type { GameUi, KeyValueStore, UiImage, UiMenu } from "@clove/core";
import type { HighscoreEntry } from "./highscore";
import type { Lang } from "./lang";
import { SAVE_SLOTS, type SaveFile, saveKey, serializeSave } from "./saveGame";

/**
 * Speicherbildschirm `SaveGame` (`0x541010`), sofort bei der Anweisung
 * `Save` (nach den Bosslevels): Highscore eintragen, „<Level> geschafft!
 * Spiel speichern?“, Top 10, „Nicht speichern“ und 21 Plätze in 3 × 7 — als
 * HTML-Menü der Shell. Das Original zeichnet dazu das rote Plasma des Levels
 * und lässt das Logo einfahren; Musik `Save_Screen.ogg`, nach dem Speichern
 * „Gespeichert“ und `Save.wav`.
 */

/** Plätze der Spieler in der Highscoreliste (2P: Gleichstand schiebt Spieler 1 nach hinten). */
export function savePlaces(ranks: readonly number[]): number[] {
  const out = [...ranks];
  if (out.length === 2 && out[1]! <= out[0]!) out[0]! += 1;
  return out;
}

/** ` (HIGHSCORE: n. Platz!)` bei Platz 1…10. */
const rank = (place: number, suffix: string) =>
  place < 11 ? ` (HIGHSCORE: ${place}${suffix}` : "";

/** Texte des Speicherbildschirms in einer Sprache (`SaveGame` `0x541010`). */
export interface SaveStrings {
  /** „<Level> geschafft!“ */
  cleared(level: string): string;
  ask: string;
  /** Zeile eines Spielers: Punkte, dahinter bei Platz 1…10 der Highscore-Platz. */
  player(n: number, score: number, place: number): string;
  dontSave: string;
  /** „Gespeichert“: Text, Arial-Größe und y (x = 20). */
  saved: { readonly text: string; readonly size: number; readonly y: number };
}

/**
 * Deutsch und Englisch wie bisher (Arial 24/18/16). **Russisch** (Zweig ab
 * `0x541FE6`): „Уровень расчищен!“ ohne Levelnamen, `„1 игрок: “`/`„2 игрок: “`
 * mit den Punkten, aber ohne Highscore-Platz; „Сохранено“ in Arial 170 bei
 * (20, 140) — die Positionen der übrigen Zeilen sind gleich.
 */
export function saveStrings(lang: Lang): SaveStrings {
  switch (lang) {
    case "de":
      return {
        cleared: (level) => `${level} geschafft!`,
        ask: "Spiel speichern? ",
        player: (n, score, place) => `Spieler ${n}: ${score}${rank(place, ". Platz!)")}`,
        dontSave: "Nicht speichern",
        saved: { text: "Gespeichert", size: 150, y: 150 },
      };
    case "en":
      return {
        cleared: (level) => `${level} Cleared!`,
        ask: "Save Game? ",
        player: (n, score, place) => `Player ${n}: ${score}${rank(place, ". Place!)")}`,
        dontSave: "Don't Save",
        saved: { text: "Saved", size: 300, y: 120 },
      };
    case "ru":
      return {
        cleared: () => "Уровень расчищен!",
        ask: "Сохранить игру? ",
        player: (n, score) => `${n} игрок: ${score}`,
        dontSave: "Не сохранено",
        saved: { text: "Сохранено", size: 170, y: 140 },
      };
  }
}

export interface SaveTexts {
  readonly lang: Lang;
  readonly level: string;
  readonly scores: readonly number[];
  readonly places: readonly number[];
  readonly highscores: readonly HighscoreEntry[];
  readonly ids: readonly number[];
  /** Beschriftungen der Plätze 1…21. */
  readonly slots: readonly string[];
  readonly logo?: UiImage | undefined;
}

/** Antwort-ID des Platzes `n` (1…21). */
export const slotId = (n: number): string => `slot${n}`;

/** Gewählter Platz aus der Antwort (`undefined`: nicht speichern). */
export function chosenSlot(id: string): number | undefined {
  const n = Number(/^slot(\d+)$/.exec(id)?.[1]);
  return n >= 1 && n <= SAVE_SLOTS ? n : undefined;
}

/**
 * Das Menü des Speicherbildschirms: Punkte der Spieler, Frage, daneben die
 * Highscoreliste (der eigene Eintrag hervorgehoben), „Nicht speichern“ (Vorgabe,
 * auch Esc) und die 21 Plätze im Raster.
 */
export function saveMenu(d: SaveTexts): UiMenu {
  const str = saveStrings(d.lang);
  const own = d.highscores.findIndex((e) => e.id !== 0 && d.ids.includes(e.id));
  return {
    kind: "menu",
    title: str.cleared(d.level),
    ...(d.logo ? { logo: d.logo } : {}),
    blocks: [
      {
        kind: "lines",
        lines: d.scores.map((score, p) => str.player(p + 1, score, d.places[p] ?? 11)),
      },
      { kind: "lines", lines: [str.ask.trim()], tone: "accent" },
    ],
    aside: [
      {
        kind: "table",
        rows: d.highscores.map((e, i) => [`${i + 1}.`, e.name, String(e.score)]),
        ...(own >= 0 ? { highlight: own } : {}),
      },
    ],
    items: [
      { id: "none", label: str.dontSave },
      ...Array.from({ length: SAVE_SLOTS }, (_, i) => ({
        id: slotId(i + 1),
        label: d.slots[i] ?? "---",
      })),
    ],
    columns: 3,
    selected: "none",
    back: "none",
  };
}

/** „Gespeichert“ steht so lange wie die Abblende danach im Original (80 Durchläufe à 16 ms). */
export const SAVED_MS = 1300;

/**
 * Speicherbildschirm bis zur Wahl: auf einem Platz wird `file()` als
 * `save/<n>` geschrieben (ohne `persist` nichts), dann `saved` (Ton) und
 * „Gespeichert“. Ergebnis: der Platz oder `undefined`.
 */
export async function runSaveScreen(
  ui: GameUi,
  o: SaveTexts & {
    readonly storage: KeyValueStore;
    readonly persist: boolean;
    readonly file: () => SaveFile;
    readonly saved?: (() => void) | undefined;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<number | undefined> {
  const reply = await ui.show(saveMenu(o), o.signal);
  const slot = chosenSlot(reply.id);
  if (slot === undefined || !o.persist || o.signal?.aborted) return undefined;
  o.storage.set(saveKey(slot), serializeSave(o.file()));
  o.saved?.();
  await ui.show(
    { kind: "notice", title: saveStrings(o.lang).saved.text, until: { ms: SAVED_MS } },
    o.signal,
  );
  return slot;
}
