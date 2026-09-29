import type { KeyValueStore } from "@clove/core";
import type { Carry } from "../sim/world";
import { type Lang, levelRu, levelShort } from "./lang";

/**
 * Spielstände (`SaveGame` `0x541010`, `LoadGame` `0x540970`): 21 Plätze,
 * gespeichert nur an den `Save`-Stellen der Kampagne, also zwischen Leveln.
 * Das Original schreibt `App\save\<n>.sav` (Version 4: Beschriftung + zlib-
 * Rumpf mit Spieler-Records); der Port legt denselben Inhalt als JSON beim
 * Host ab (`save/<n>`). Byte-Kompatibilität ist nicht nötig.
 */

export const SAVE_SLOTS = 21;
export const SAVE_VERSION = 1;
/** Platz ohne Spielstand (`"---"`). */
export const EMPTY_SLOT = "---";

export interface SaveFile {
  readonly version: typeof SAVE_VERSION;
  /** Beschriftung wie im Original, z. B. „P1S1A - Level1-2  28.09.2026“. */
  readonly label: string;
  /** Kampagnenindex nach der `Save`-Anweisung (`Me.115C`). */
  readonly step: number;
  /** Durchgang (`Me.6D8`). */
  readonly pass: number;
  readonly players: 1 | 2;
  /** Schiffstyp von Spieler 1 (`A[0].A8`). */
  readonly ship: 0 | 1 | 2;
  readonly names: readonly string[];
  readonly ids: readonly number[];
  readonly carry: Carry;
}

export const saveKey = (slot: number): string => `save/${slot}`;

/**
 * Beschriftung (`0x544AA9`): `"P" & Spieler & "S" & Schiff & Chr(Durchgang + 64)`
 * (ab 27 „Z“) `& " - " & Left(Lvl, InStr(Lvl, "-") + 1) & "  " & Date`.
 * Russisch ersetzt im Levelnamen „Level“ durch „Уровень“ (`levelRu`). Das Datum
 * ist im Original das der Windows-Ländereinstellung (`Date`): der Port nimmt für
 * Deutsch und Russisch `TT.MM.JJJJ` (de-DE, ru-RU), für Englisch `M/T/JJJJ` (en-US).
 */
export function saveLabel(
  players: number,
  ship: number,
  pass: number,
  level: string,
  date: Date,
  lang: Lang,
): string {
  const letter = String.fromCharCode(pass > 26 ? 90 : pass + 64);
  const short = lang === "ru" ? levelRu(level) : levelShort(level);
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const day =
    lang === "en"
      ? `${m}/${d}/${y}`
      : `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  return `P${players}S${ship + 1}${letter} - ${short}  ${day}`;
}

export function serializeSave(s: SaveFile): string {
  return JSON.stringify(s);
}

/** Spielstand aus dem Speicher; fehlend oder ungültig → `undefined`. */
export function parseSave(json: string | null): SaveFile | undefined {
  if (!json) return undefined;
  try {
    const o = JSON.parse(json) as Partial<SaveFile>;
    if (
      o.version !== SAVE_VERSION ||
      typeof o.label !== "string" ||
      typeof o.step !== "number" ||
      typeof o.pass !== "number" ||
      (o.players !== 1 && o.players !== 2) ||
      (o.ship !== 0 && o.ship !== 1 && o.ship !== 2) ||
      !Array.isArray(o.names) ||
      !Array.isArray(o.ids) ||
      typeof o.carry !== "object" ||
      o.carry === null ||
      !Array.isArray(o.carry.players) ||
      !Array.isArray(o.carry.particles) ||
      !Array.isArray(o.carry.score)
    )
      return undefined;
    return o as SaveFile;
  } catch {
    return undefined;
  }
}

/** Beschriftungen der Plätze 1…21 (Index 0 = Platz 1), leer `"---"`. */
export function slotLabels(storage: KeyValueStore): string[] {
  return Array.from(
    { length: SAVE_SLOTS },
    (_, i) => parseSave(storage.get(saveKey(i + 1)))?.label ?? EMPTY_SLOT,
  );
}
