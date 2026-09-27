/**
 * Export/Import der Spielstände als JSON-Datei. Browser-Speicher kann jederzeit
 * gelöscht werden; die Datei ist die einzige Sicherung, die der Spieler selbst
 * in der Hand hat. Versioniert mit Migrationskette: ältere Dateien werden beim
 * Import Schritt für Schritt auf die aktuelle Version gehoben.
 */

export const SAVE_FORMAT = "amigo-clove-save";
export const SAVE_VERSION = 1;

/** Spielstände je Spiel-ID als Schlüssel/Wert-Paare (wie `KeyValueStore`). */
export type SaveData = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface SaveFile {
  readonly format: typeof SAVE_FORMAT;
  readonly version: typeof SAVE_VERSION;
  /** ISO-8601-Zeitpunkt des Exports (nur zur Anzeige). */
  readonly exported: string;
  readonly games: SaveData;
}

/**
 * `MIGRATIONS[v]` hebt eine Datei der Version `v` auf `v + 1`. Leer, solange es
 * nur Version 1 gibt; eine neue Version ergänzt hier genau einen Schritt.
 */
const MIGRATIONS: Readonly<
  Record<number, (file: Record<string, unknown>) => Record<string, unknown>>
> = {};

export function createSaveFile(games: SaveData, exported: Date): SaveFile {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, exported: exported.toISOString(), games };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkGames(v: unknown): SaveData {
  if (!isRecord(v)) throw new Error("Spielstanddatei: „games“ fehlt");
  const out: Record<string, Record<string, string>> = {};
  for (const [game, entries] of Object.entries(v)) {
    if (!isRecord(entries)) throw new Error(`Spielstanddatei: „${game}“ ist kein Objekt`);
    const kv: Record<string, string> = {};
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== "string")
        throw new Error(`Spielstanddatei: ${game}/${key} ist kein Text`);
      kv[key] = value;
    }
    out[game] = kv;
  }
  return out;
}

/** Liest und prüft eine Spielstanddatei; wirft mit lesbarer Meldung bei allem Fremden. */
export function parseSaveFile(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Spielstanddatei: kein gültiges JSON");
  }
  if (!isRecord(raw) || raw["format"] !== SAVE_FORMAT) {
    throw new Error("Spielstanddatei: unbekanntes Format");
  }
  let file = raw;
  let version = file["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("Spielstanddatei: ungültige Version");
  }
  if (version > SAVE_VERSION) {
    throw new Error(`Spielstanddatei: Version ${version} ist neuer als diese Fassung`);
  }
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`Spielstanddatei: keine Migration ab Version ${version}`);
    file = step(file);
    version++;
  }
  const exported = typeof file["exported"] === "string" ? file["exported"] : "";
  return { format: SAVE_FORMAT, version: SAVE_VERSION, exported, games: checkGames(file["games"]) };
}
