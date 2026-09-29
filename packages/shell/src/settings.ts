import { LOCALES, type LocalePreference, type ScaleMode } from "@clove/core";

/** Einstellungen der Shell, spielübergreifend. */
export interface Settings {
  readonly language: LocalePreference;
  /** Pegel 0…1. */
  readonly volume: { readonly master: number; readonly music: number; readonly sfx: number };
  readonly gamepad: boolean;
  /** Bewegungsarme Darstellung: nach dem System („auto“), an oder aus. */
  readonly motion: MotionPreference;
  /** Skalierung des Spielbilds (Vorgabe ganzzahlig wie im Original-Fenster). */
  readonly scale: ScaleMode;
  /** Rasterlinien über dem Spielbild (reine CSS-Schicht). */
  readonly scanlines: boolean;
  /** Maus und Touch steuern das Schiff (Erweiterung; ohne Zeigerbewegung wie das Original). */
  readonly pointer: boolean;
}

export const MOTION_PREFERENCES = ["auto", "reduce", "full"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const SCALE_MODES = ["integer", "fit", "smooth"] as const satisfies readonly ScaleMode[];

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  volume: { master: 1, music: 1, sfx: 1 },
  gamepad: true,
  motion: "auto",
  scale: "integer",
  scanlines: false,
  pointer: true,
};

/** Ist die bewegungsarme Darstellung aktiv? „auto“ folgt `prefers-reduced-motion`. */
export function reducedMotion(pref: MotionPreference, systemReduces: boolean): boolean {
  return pref === "reduce" || (pref === "auto" && systemReduces);
}

export const SETTINGS_KEY = "clove:settings";

function level(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

/** Nimmt aus beliebigem JSON nur, was gültig ist; der Rest fällt auf die Vorgabe zurück. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const v =
    typeof r["volume"] === "object" && r["volume"] !== null
      ? (r["volume"] as Record<string, unknown>)
      : {};
  const lang = r["language"];
  const d = DEFAULT_SETTINGS;
  return {
    language:
      lang === "auto" || LOCALES.some((l) => l === lang) ? (lang as LocalePreference) : d.language,
    volume: {
      master: level(v["master"], d.volume.master),
      music: level(v["music"], d.volume.music),
      sfx: level(v["sfx"], d.volume.sfx),
    },
    gamepad: typeof r["gamepad"] === "boolean" ? r["gamepad"] : d.gamepad,
    motion: MOTION_PREFERENCES.find((m) => m === r["motion"]) ?? d.motion,
    scale: SCALE_MODES.find((m) => m === r["scale"]) ?? d.scale,
    scanlines: typeof r["scanlines"] === "boolean" ? r["scanlines"] : d.scanlines,
    pointer: typeof r["pointer"] === "boolean" ? r["pointer"] : d.pointer,
  };
}

export function loadSettings(storage: Pick<Storage, "getItem"> | undefined): Settings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(text ? JSON.parse(text) : undefined);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: Pick<Storage, "setItem"> | undefined, s: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // privates Fenster / Speicher voll: Einstellung gilt nur für diese Sitzung
  }
}
