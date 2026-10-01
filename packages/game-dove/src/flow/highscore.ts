/**
 * Highscoreliste (`HighScore` `0x49D620`, `erstelleHighScoreS` `0x49FFE0`):
 * 9 Plätze, Standardliste mit gemischten Namen, Einfügen, Zeilenformat.
 * Reine Funktionen — der Speicher liegt beim Host (JSON statt `Highscore.dat`).
 */
import type { VbRnd } from "../sim/VbRnd";

export interface HighscoreEntry {
  readonly name: string;
  readonly score: number;
}

export const HIGHSCORE_SIZE = 9;
/** Höchstens 20 Zeichen Name (Eingabe und Anzeige `Left$(…, 20)`). */
export const NAME_MAX = 20;
/** Leerer Name bei der Eingabe (*mittel*). */
export const DEFAULT_NAME = "David Lee";

/** Standardliste `0x42F5C0` vor dem Mischen. */
const DEFAULTS: readonly HighscoreEntry[] = [
  { name: "David Lee", score: 100000 },
  { name: "Kauto", score: 80000 },
  { name: "xenion", score: 60000 },
  { name: "XPiRE", score: 50000 },
  { name: "MaKo", score: 40000 },
  { name: "HiBri", score: 30000 },
  { name: "Manuel Kempf", score: 20000 },
  { name: "Pickel", score: 15000 },
  { name: "Toxeen", score: 10000 },
];

/**
 * Standardliste: 101 Tausche (`For i = 0 To 100`) der **Namen** auf den Plätzen
 * 3–8, beide Indizes `Int(Rnd·6) + 3`; die Punkte bleiben stehen.
 */
export function defaultHighscores(rnd: VbRnd): HighscoreEntry[] {
  const names = DEFAULTS.map((e) => e.name);
  for (let i = 0; i <= 100; i++) {
    const a = rnd.below(6) + 2; // Platz 3…8 → Index 2…7
    const b = rnd.below(6) + 2;
    const t = names[a]!;
    names[a] = names[b]!;
    names[b] = t;
  }
  return DEFAULTS.map((e, i) => ({ name: names[i]!, score: e.score }));
}

/**
 * Platz 1…9 für eine Punktzahl oder 0, wenn sie nicht in die Liste kommt.
 * Wie `For i = 9 To 1 Step -1: If Punkte > P(i) Then Platz = i` (`0x49D941`):
 * der kleinste Platz, dessen Punkte echt übertroffen werden.
 */
export function rankFor(list: readonly HighscoreEntry[], score: number): number {
  let rank = 0;
  for (let i = HIGHSCORE_SIZE; i >= 1; i--) {
    const e = list[i - 1];
    if (e === undefined || score > e.score) rank = i;
  }
  return rank;
}

/** Fügt auf Platz `rank` (1…9) ein; der letzte Eintrag fällt heraus. */
export function insertHighscore(
  list: readonly HighscoreEntry[],
  rank: number,
  name: string,
  score: number,
): HighscoreEntry[] {
  const entry = { name: cleanName(name), score };
  const out = [...list.slice(0, rank - 1), entry, ...list.slice(rank - 1)];
  return out.slice(0, HIGHSCORE_SIZE);
}

/** Leerer Name → „David Lee“, sonst auf 20 Zeichen gekürzt. */
export function cleanName(name: string): string {
  const n = name.slice(0, NAME_MAX);
  return n.trim() === "" ? DEFAULT_NAME : n;
}

/** Englische Ordinalendung für „You placed N…“: st, nd, rd, sonst th. */
export function rankSuffix(rank: number): string {
  return rank === 1 ? "st" : rank === 2 ? "nd" : rank === 3 ? "rd" : "th";
}

/** Liste aus dem Speicher; ungültig oder fehlend → `undefined` (dann Standardliste). */
export function parseHighscores(json: string | null): HighscoreEntry[] | undefined {
  if (!json) return undefined;
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw) || raw.length !== HIGHSCORE_SIZE) return undefined;
    const list: HighscoreEntry[] = [];
    for (const e of raw as unknown[]) {
      const o = e as Partial<Record<keyof HighscoreEntry, unknown>>;
      if (typeof o.name !== "string" || typeof o.score !== "number" || !Number.isFinite(o.score))
        return undefined;
      list.push({ name: o.name.slice(0, NAME_MAX), score: Math.max(0, Math.floor(o.score)) });
    }
    return list;
  } catch {
    return undefined;
  }
}

export function serializeHighscores(list: readonly HighscoreEntry[]): string {
  return JSON.stringify(list);
}
