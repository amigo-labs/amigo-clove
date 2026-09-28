import type { KeyValueStore } from "@clove/core";
import {
  DEFAULT_NAME,
  HIGHSCORE_KEY,
  type HighscoreEntry,
  addHighscore,
  newGameId,
  parseHighscores,
  serializeHighscores,
} from "./highscore";

/**
 * Spieler eines Spiels über alle Level: Namen (`B48[p].68`, im Port ohne
 * Menü die Vorgabe „Bruce“), Spiel-IDs (`.6C`) und die Highscoreliste.
 */
export class Profile {
  highscores: HighscoreEntry[];
  readonly names: string[];
  readonly ids: number[];

  constructor(
    private readonly storage: KeyValueStore,
    players: number,
    /** Sichtprüfungen speichern nichts. */
    private readonly persist: boolean,
    saved?: { readonly names: readonly string[]; readonly ids: readonly number[] },
  ) {
    this.highscores = parseHighscores(storage.get(HIGHSCORE_KEY));
    this.names = Array.from({ length: players }, (_, p) => saved?.names[p] ?? DEFAULT_NAME);
    this.ids = [];
    for (let p = 0; p < players; p++) {
      const id = saved?.ids[p];
      if (id !== undefined) {
        this.ids.push(id);
        continue;
      }
      const taken = [...this.highscores, ...this.ids.map((i) => ({ name: "", score: 0, id: i }))];
      this.ids.push(newGameId(taken, Math.random));
    }
  }

  store(list: HighscoreEntry[]): void {
    this.highscores = list;
    if (this.persist) this.storage.set(HIGHSCORE_KEY, serializeHighscores(list));
  }

  /** `AddHighscore` für alle Spieler; die Plätze (1…10, 11 = nicht in der Liste). */
  addAll(scores: readonly number[]): number[] {
    let list = this.highscores;
    const ranks = this.names.map((name, p) => {
      const r = addHighscore(list, name, scores[p] ?? 0, this.ids[p]!);
      list = r.list;
      return r.rank;
    });
    this.store(list);
    return ranks;
  }
}
