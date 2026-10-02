import {
  CUSTOM_PRESET,
  LOCALES,
  MAX_KEYS,
  withExtraKeys,
  type HudMode,
  type KeyLayout,
  type LocalePreference,
  type ScaleMode,
  type StoredBindings,
} from "@clove/core";

/** Einstellungen der Shell, spielübergreifend. */
export interface Settings {
  readonly language: LocalePreference;
  /** Pegel 0…1; `voice` ist die Sprachausgabe (DoveZ-Funk). */
  readonly volume: {
    readonly master: number;
    readonly music: number;
    readonly sfx: number;
    readonly voice: number;
  };
  readonly gamepad: boolean;
  /** Bewegungsarme Darstellung: nach dem System („auto“), an oder aus. */
  readonly motion: MotionPreference;
  /** Skalierung des Spielbilds (Vorgabe: fensterfüllend scharf; `integer` für 1:1-Pixel). */
  readonly scale: ScaleMode;
  /** Rasterlinien über dem Spielbild (reine CSS-Schicht). */
  readonly scanlines: boolean;
  /** Maus und Touch steuern das Schiff (Erweiterung; ohne Zeigerbewegung wie das Original). */
  readonly pointer: boolean;
  /** HUD der Shell (Vorgabe) oder das Original-HUD im Spielbild. */
  readonly hud: HudMode;
  /** Tastenbelegung je Spiel: Vorlage oder eigene Tasten (fehlt = Original). */
  readonly keybindings: Readonly<Record<string, StoredBindings>>;
}

export const MOTION_PREFERENCES = ["auto", "reduce", "full"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const HUD_MODES = ["modern", "original"] as const satisfies readonly HudMode[];

export const SCALE_MODES = ["integer", "fit", "smooth"] as const satisfies readonly ScaleMode[];

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  volume: { master: 1, music: 1, sfx: 1, voice: 1 },
  gamepad: true,
  motion: "auto",
  scale: "fit",
  scanlines: false,
  pointer: true,
  hud: "modern",
  keybindings: {},
};

/** Ist die bewegungsarme Darstellung aktiv? „auto“ folgt `prefers-reduced-motion`. */
export function reducedMotion(pref: MotionPreference, systemReduces: boolean): boolean {
  return pref === "reduce" || (pref === "auto" && systemReduces);
}

export const SETTINGS_KEY = "clove:settings";

function level(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

const CODE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const ID = /^[a-z][a-zA-Z0-9]{0,31}$/;

function record(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Alte zweite Tasten (`keymap`, vor der freien Belegung): Spiel → Aktion → Code. */
function legacyKeymap(v: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [game, actions] of Object.entries(record(v))) {
    if (!ID.test(game)) continue;
    const keys: Record<string, string> = {};
    for (const [a, code] of Object.entries(record(actions))) {
      if (ID.test(a) && typeof code === "string" && CODE.test(code)) keys[a] = code;
    }
    out[game] = keys;
  }
  return out;
}

function stored(v: unknown): StoredBindings | undefined {
  const r = record(v);
  const preset = r["preset"];
  if (typeof preset !== "string" || !ID.test(preset)) return undefined;
  if (preset !== CUSTOM_PRESET) return { preset };
  const keys: Record<string, string[]> = {};
  for (const [a, codes] of Object.entries(record(r["keys"]))) {
    if (!ID.test(a) || !Array.isArray(codes)) continue;
    keys[a] = [
      ...new Set(codes.filter((c): c is string => typeof c === "string" && CODE.test(c))),
    ].slice(0, MAX_KEYS);
  }
  return { preset, keys };
}

/**
 * Belegungen je Spiel; fehlt eine, aber gibt es alte zweite Tasten, werden sie mit
 * den Aktionen aus `layouts` zur eigenen Belegung (Original plus zweite Taste).
 */
function keybindings(
  v: unknown,
  legacy: unknown,
  layouts: Readonly<Record<string, KeyLayout>>,
): Settings["keybindings"] {
  const out: Record<string, StoredBindings> = {};
  for (const [game, b] of Object.entries(record(v))) {
    const s = ID.test(game) ? stored(b) : undefined;
    if (s) out[game] = s;
  }
  for (const [game, extra] of Object.entries(legacyKeymap(legacy))) {
    const layout = layouts[game];
    if (out[game] || !layout) continue;
    const s = withExtraKeys(layout, extra);
    if (s) out[game] = s;
  }
  return out;
}

/** Nimmt aus beliebigem JSON nur, was gültig ist; der Rest fällt auf die Vorgabe zurück. */
export function sanitizeSettings(
  raw: unknown,
  layouts: Readonly<Record<string, KeyLayout>> = {},
): Settings {
  const r = record(raw);
  const v = record(r["volume"]);
  const lang = r["language"];
  const d = DEFAULT_SETTINGS;
  return {
    language:
      lang === "auto" || LOCALES.some((l) => l === lang) ? (lang as LocalePreference) : d.language,
    volume: {
      master: level(v["master"], d.volume.master),
      music: level(v["music"], d.volume.music),
      sfx: level(v["sfx"], d.volume.sfx),
      voice: level(v["voice"], d.volume.voice),
    },
    gamepad: typeof r["gamepad"] === "boolean" ? r["gamepad"] : d.gamepad,
    motion: MOTION_PREFERENCES.find((m) => m === r["motion"]) ?? d.motion,
    scale: SCALE_MODES.find((m) => m === r["scale"]) ?? d.scale,
    scanlines: typeof r["scanlines"] === "boolean" ? r["scanlines"] : d.scanlines,
    pointer: typeof r["pointer"] === "boolean" ? r["pointer"] : d.pointer,
    hud: HUD_MODES.find((m) => m === r["hud"]) ?? d.hud,
    keybindings: keybindings(r["keybindings"], r["keymap"], layouts),
  };
}

export function loadSettings(
  storage: Pick<Storage, "getItem"> | undefined,
  layouts: Readonly<Record<string, KeyLayout>> = {},
): Settings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(text ? JSON.parse(text) : undefined, layouts);
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
