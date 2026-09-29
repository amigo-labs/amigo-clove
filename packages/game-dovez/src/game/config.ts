import type { KeyValueStore } from "@clove/core";

/**
 * DoveZ-Optionen aus dem Menü (`config.cfg`, `SaveConfig` `0x505770`):
 * Pegel wie im Original — Musik 0…100 (`[0x588084]`, Vorgabe 90), Effekte
 * und Sprache in 1/100 dB (`[0x588088]` −1000, `[0x58808C]` 0; −10000 =
 * stumm) — und die drei Schalter der Grundeinstellungen. Der Port speichert
 * beim Ändern (das Original erst beim Programmende).
 */
export interface DovezConfig {
  readonly music: number;
  readonly sfx: number;
  readonly speech: number;
  /** `Me.512`: Force-Modus-Taste normal (sonst wirkt sie als Beamwechsel). */
  readonly qNormal: boolean;
  /** `Me.50E`: D-Tonator-Partikel automatisch anordnen. */
  readonly autoArrange: boolean;
  /** `Me.510`: Trägheit („Realistic“): Schiff gleitet nach dem Loslassen aus. */
  readonly realistic: boolean;
}

export const CONFIG_KEY = "config";

export const DEFAULT_CONFIG: DovezConfig = {
  music: 90,
  sfx: -1000,
  speech: 0,
  qNormal: false,
  autoArrange: true,
  realistic: false,
};

const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function parseConfig(json: string | null): DovezConfig {
  if (!json) return DEFAULT_CONFIG;
  try {
    const o = JSON.parse(json) as Partial<Record<keyof DovezConfig, unknown>>;
    const d = DEFAULT_CONFIG;
    return {
      music: num(o.music, d.music, 0, 100),
      sfx: num(o.sfx, d.sfx, -10000, 0),
      speech: num(o.speech, d.speech, -10000, 0),
      qNormal: bool(o.qNormal, d.qNormal),
      autoArrange: bool(o.autoArrange, d.autoArrange),
      realistic: bool(o.realistic, d.realistic),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function loadConfig(storage: KeyValueStore): DovezConfig {
  return parseConfig(storage.get(CONFIG_KEY));
}

export function saveConfig(storage: KeyValueStore, c: DovezConfig): void {
  storage.set(CONFIG_KEY, JSON.stringify(c));
}

/** DirectSound-Pegel (1/100 dB) als Verstärkung: `10^(v/2000)`, −10000 stumm. */
export function dbGain(v: number): number {
  return v <= -10000 ? 0 : 10 ** (v / 2000);
}

/** Verstärkungen für `DovezAudio`. */
export interface AudioGains {
  readonly sfx: number;
  readonly speech: number;
  readonly music: number;
}

export function audioGains(c: DovezConfig): AudioGains {
  return { sfx: dbGain(c.sfx), speech: dbGain(c.speech), music: c.music / 100 };
}
