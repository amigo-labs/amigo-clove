/**
 * DoveZ-Highscoreliste (Tabelle `[0x58802C]`, `AddHighscore` `0x577A90`):
 * 10 Plätze à Name, Punkte, Spiel-ID. Ein Spiel (ID) belegt höchstens einen
 * Platz. Reine Funktionen — gespeichert wird beim Host (JSON statt der Datei
 * des Originals). Die Liste beginnt leer (0 Punkte).
 */

export interface HighscoreEntry {
  readonly name: string;
  readonly score: number;
  /** Spiel-ID (`B48[p]+0x6C`), 0 = leerer Platz. */
  readonly id: number;
}

export const HIGHSCORE_SIZE = 10;
/** Speicherschlüssel beim Host. */
export const HIGHSCORE_KEY = "highscores";
/** Name `String*16`. */
export const NAME_MAX = 16;
/** Leerer Spielername im Menü → „Bruce“. */
export const DEFAULT_NAME = "Bruce";
/** Rückgabe von `AddHighscore`, wenn der Stand nicht (besser) in die Liste kommt. */
export const NOT_RANKED = 11;

export function emptyHighscores(): HighscoreEntry[] {
  return Array.from({ length: HIGHSCORE_SIZE }, () => ({ name: "", score: 0, id: 0 }));
}

/**
 * `AddHighscore(Name, Punkte, ID)`: Platz 1…10 oder 11. Gleichstand: der neue
 * Eintrag kommt davor. Steht dieselbe ID schon besser da, bleibt die Liste
 * unverändert (11); steht sie schlechter, rückt ihr alter Eintrag heraus.
 */
export function addHighscore(
  list: readonly HighscoreEntry[],
  name: string,
  score: number,
  id: number,
): { list: HighscoreEntry[]; rank: number } {
  let rank = 1;
  while (rank <= HIGHSCORE_SIZE && score < (list[rank - 1]?.score ?? 0)) rank++;
  if (rank > HIGHSCORE_SIZE) return { list: [...list], rank };
  const out = [...list];
  const j = out.findIndex((e) => e.id === id);
  if (j >= 0) {
    if (j + 1 < rank) return { list: out, rank: NOT_RANKED };
    out.splice(j, 1);
    out.push({ name: "", score: 0, id: 0 });
  }
  out.splice(rank - 1, 0, { name: name.slice(0, NAME_MAX), score, id });
  return { list: out.slice(0, HIGHSCORE_SIZE), rank };
}

/** Neue Spiel-ID, eindeutig gegen die Liste (`CLng(Int(Rnd·10000) + …)`). */
export function newGameId(list: readonly HighscoreEntry[], random: () => number): number {
  for (;;) {
    const id = 1 + Math.floor(random() * 1e9);
    if (!list.some((e) => e.id === id)) return id;
  }
}

/** Liste aus dem Speicher; ungültig oder fehlend → leere Liste. */
export function parseHighscores(json: string | null): HighscoreEntry[] {
  if (!json) return emptyHighscores();
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw) || raw.length !== HIGHSCORE_SIZE) return emptyHighscores();
    const list: HighscoreEntry[] = [];
    for (const e of raw as unknown[]) {
      const o = e as Partial<Record<keyof HighscoreEntry, unknown>>;
      if (
        typeof o.name !== "string" ||
        typeof o.score !== "number" ||
        typeof o.id !== "number" ||
        !Number.isFinite(o.score) ||
        !Number.isFinite(o.id)
      )
        return emptyHighscores();
      list.push({ name: o.name.slice(0, NAME_MAX), score: Math.trunc(o.score), id: o.id });
    }
    return list;
  } catch {
    return emptyHighscores();
  }
}

export function serializeHighscores(list: readonly HighscoreEntry[]): string {
  return JSON.stringify(list);
}
