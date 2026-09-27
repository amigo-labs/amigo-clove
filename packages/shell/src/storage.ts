import type { KeyValueStore, SaveData } from "@clove/core";

/** Spielstände liegen in `localStorage` unter `clove:<spiel>:<schlüssel>`. */
const PREFIX = "clove:";

type WebStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** `localStorage`, falls zugänglich (privates Fenster, gesperrte Cookies: `undefined`). */
export function webStorage(): WebStorage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** Speicher eines Spiels; ohne `localStorage` bleibt alles flüchtig im Speicher. */
export function storageFor(storage: WebStorage | undefined, game: string): KeyValueStore {
  const memory = new Map<string, string>();
  const key = (k: string) => `${PREFIX}${game}:${k}`;
  return {
    get(k) {
      try {
        if (storage) return storage.getItem(key(k));
      } catch {
        // fällt auf den Speicher zurück
      }
      return memory.get(k) ?? null;
    },
    set(k, value) {
      memory.set(k, value);
      try {
        storage?.setItem(key(k), value);
      } catch {
        // Speicher voll oder gesperrt: gilt nur für diese Sitzung
      }
    },
  };
}

function keysOf(storage: WebStorage): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null) out.push(k);
  }
  return out;
}

/** Alle Spielstände für den Export (Einstellungen `clove:settings` gehören nicht dazu). */
export function collectSaves(storage: WebStorage): SaveData {
  const games: Record<string, Record<string, string>> = {};
  for (const k of keysOf(storage).toSorted()) {
    const m = /^clove:([a-z0-9-]+):(.+)$/.exec(k);
    const value = storage.getItem(k);
    if (!m || value === null) continue;
    const [, game = "", key = ""] = m;
    (games[game] ??= {})[key] = value;
  }
  return games;
}

/**
 * Import: jedes Spiel in der Datei ersetzt seine Stände vollständig, Spiele,
 * die in der Datei fehlen, bleiben unberührt.
 */
export function restoreSaves(storage: WebStorage, games: SaveData): void {
  for (const game of Object.keys(games)) {
    for (const k of keysOf(storage)) {
      if (k.startsWith(`${PREFIX}${game}:`)) storage.removeItem(k);
    }
  }
  for (const [game, entries] of Object.entries(games)) {
    for (const [k, v] of Object.entries(entries)) storage.setItem(`${PREFIX}${game}:${k}`, v);
  }
}
