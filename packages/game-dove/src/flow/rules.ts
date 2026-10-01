/**
 * Reine Regeln des Programmablaufs (`docs/measurements/dove-flow.md`):
 * Punktefaktor, Optionen → `SimOptions`, Freischaltungen, Levelnamen.
 * Keine Pixi-, Audio- oder Host-Abhängigkeiten — unit-getestet.
 */
import { DEFAULT_OPTIONS, type SimOptions } from "../sim/world";

/** Letztes reguläres Level; danach Highscore und Abspann. */
export const FINAL_LEVEL = 10;
/** Menüpunkt „Extralevel“ (`Me.39C = 11`). */
export const EXTRA_LEVEL = 11;
/** Menüpunkt „Tutorial“ (`Me.39C = 0`). */
export const TUTORIAL_LEVEL = 0;

/** Gespeicherte Einstellungen (Original: `Config.cfg`, hier JSON im Host-Speicher). */
export interface Config {
  /** „Gegner schießen“ `Me.634`: 0 AUS, 1 VOLL, 2 HALB. */
  readonly enemyShots: 0 | 1 | 2;
  /** „Kollision mit Wand“ `Me.640`: Wände zerstören das Schiff. */
  readonly wallsKill: boolean;
  /** „Waffenverlust nach dem Tod“ `Me.642`. */
  readonly weaponLoss: boolean;
  /** Freigeschaltete Level 1…10 (`Me.2F0(L)`), aufsteigend. */
  readonly unlocked: readonly number[];
}

export const DEFAULT_CONFIG: Config = {
  enemyShots: DEFAULT_OPTIONS.enemyShots,
  wallsKill: DEFAULT_OPTIONS.wallsKill,
  weaponLoss: DEFAULT_OPTIONS.weaponLoss,
  unlocked: [],
};

/**
 * Punktefaktor `Me.638` in Hundertsteln (`Spiel` `0x46DF6B`): Gegner schießen
 * 0 → 0,75, 1 → 1,25, sonst 1,0; −0,25, wenn Wände nicht töten; +0,25 mit
 * Waffenverlust, sonst −0,25.
 */
export function pointFactor(o: Pick<Config, "enemyShots" | "wallsKill" | "weaponLoss">): number {
  let f = o.enemyShots === 0 ? 75 : o.enemyShots === 1 ? 125 : 100;
  if (!o.wallsKill) f -= 25;
  f += o.weaponLoss ? 25 : -25;
  return f;
}

/** Anzeige des Faktors wie VB `Str(Double)`: „1,25“ (deutsch) bzw. „1.25“, „1“ ohne Nachkomma. */
export function formatFactor(hundredths: number, german: boolean): string {
  const s = String(hundredths / 100);
  return german ? s.replace(".", ",") : s;
}

/** „Levels können erspielt werden“ erscheint ab Faktor 1,25 (`0x45A9AA`). */
export function showsUnlockHint(hundredths: number): boolean {
  return hundredths >= 125;
}

/** Simulationsoptionen aus der Konfiguration (`Me.634 > 2` wird auf 2 gekappt). */
export function simOptionsFor(config: Config, invincible = false): SimOptions {
  const shots = Math.min(2, Math.max(0, config.enemyShots)) as 0 | 1 | 2;
  const o = { enemyShots: shots, wallsKill: config.wallsKill, weaponLoss: config.weaponLoss };
  return { ...o, scoreFactor: pointFactor(o), invincible };
}

/**
 * Freischalten bei Levelende (`0x48F031`): nur ohne Cheat (`Me.2FC = 0`, hier:
 * Unverwundbarkeit) und mit Faktor > 1,0 wird Level L + 1 (höchstens 10) frei.
 * Liefert die neue Konfiguration oder `undefined`, wenn sich nichts ändert.
 */
export function unlockAfter(
  config: Config,
  level: number,
  factor: number,
  cheated: boolean,
): Config | undefined {
  const next = level + 1;
  if (cheated || factor <= 100 || level < 1 || next > FINAL_LEVEL) return undefined;
  if (config.unlocked.includes(next)) return undefined;
  return { ...config, unlocked: [...config.unlocked, next].toSorted((a, b) => a - b) };
}

/** Auswählbare Level der Levelauswahl: Level 1 und alle freigeschalteten. */
export function selectableLevels(config: Config): number[] {
  const set = new Set([1, ...config.unlocked.filter((l) => l >= 1 && l <= FINAL_LEVEL)]);
  return [...set].toSorted((a, b) => a - b);
}

/** `ShowLevelSelect` erscheint nur, wenn mindestens ein Level 1…10 freigeschaltet ist. */
export function hasLevelSelect(config: Config): boolean {
  return config.unlocked.some((l) => l >= 1 && l <= FINAL_LEVEL);
}

/** Konfiguration aus dem Speicher; Unbekanntes fällt auf die Standardwerte zurück. */
export function parseConfig(json: string | null): Config {
  if (!json) return DEFAULT_CONFIG;
  try {
    const o = JSON.parse(json) as Partial<Record<keyof Config, unknown>>;
    const shots = o.enemyShots;
    return {
      enemyShots: shots === 0 || shots === 1 || shots === 2 ? shots : DEFAULT_CONFIG.enemyShots,
      wallsKill: typeof o.wallsKill === "boolean" ? o.wallsKill : DEFAULT_CONFIG.wallsKill,
      weaponLoss: typeof o.weaponLoss === "boolean" ? o.weaponLoss : DEFAULT_CONFIG.weaponLoss,
      unlocked: Array.isArray(o.unlocked)
        ? [
            ...new Set(
              o.unlocked.filter(
                (l): l is number => Number.isInteger(l) && l >= 1 && l <= FINAL_LEVEL,
              ),
            ),
          ].toSorted((a, b) => a - b)
        : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config);
}

/** Levelnamen aus `Get_Ready` (`0x45D934`); 11–19 heißen „ExtraLevel 1…9“. */
export const LEVEL_NAMES: readonly string[] = [
  "Tutorial",
  "Lost In Space",
  "Factory",
  "Deep Blue See",
  "Back in Space",
  "Crystal Cave",
  "Speed",
  "The Unreal World",
  "DOVE INSIDE",
  "Final Level",
  "Final Fight",
];

export function levelName(level: number): string {
  return LEVEL_NAMES[level] ?? `ExtraLevel ${level - 10}`;
}

/** Einträge der Levelauswahl (`0x40F050`…), Schreibweise wie im Original. */
export const LEVEL_SELECT_NAMES: readonly string[] = [
  "",
  "1. Lost In Space",
  "2. Factory",
  "3. Deep Blue See",
  "4. Back in Space",
  "5. Crystal cave",
  "6. Speed",
  "7. The Unreal World",
  "8. DOVE INSIDE",
  "9. Final Level",
  "10. Final Fight",
];

/** Vorschaubild `data\grafik\<L>.spr`, sonst `Extralevel.spr`. */
export function previewImage(level: number): string {
  return level >= 0 && level <= FINAL_LEVEL ? `image/${level}` : "image/extralevel";
}
