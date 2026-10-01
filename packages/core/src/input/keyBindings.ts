import type { KeyAction, KeyState, LocalLabel } from "../shell/GameModule";

/**
 * Tastenbelegung der Shell, für alle Spiele gleich: je Aktion bis zu `MAX_KEYS`
 * Tasten (`KeyboardEvent.code`). Das Spiel fragt weiter nach seinen Originalcodes
 * (`KeyAction.codes`); `bindKeys` beantwortet die Frage mit den belegten Tasten.
 * Simulation und Replays sehen dieselben Codes wie zuvor.
 */
export type KeyBindings = Readonly<Record<string, readonly string[]>>;

/** Tasten je Aktion im Editor (Original-DOVE belegt „Runter“ dreifach). */
export const MAX_KEYS = 3;

/** Vorlage einer Belegung; die erste eines Spiels ist die Vorgabe (das Original). */
export interface KeyPreset {
  readonly id: string;
  readonly label: LocalLabel;
  readonly keys: KeyBindings;
}

/** Aktionen und Vorlagen eines Spiels (reine Daten, ohne das Spiel zu laden). */
export interface KeyLayout {
  readonly actions: readonly KeyAction[];
  readonly presets: readonly KeyPreset[];
}

/** Gespeicherte Wahl: eine Vorlage oder eigene Tasten (`CUSTOM_PRESET`). */
export interface StoredBindings {
  readonly preset: string;
  readonly keys?: KeyBindings;
}

export const CUSTOM_PRESET = "custom";

/** Namen der beiden Vorlagen, die beide Spiele anbieten. */
export const PRESET_LABELS = {
  arrows: {
    de: "Pfeiltasten + linke Hand (Original)",
    en: "Arrow keys + left hand (original)",
    ru: "Стрелки + левая рука (оригинал)",
  },
  wasd: { de: "WASD + rechte Hand", en: "WASD + right hand", ru: "WASD + правая рука" },
  custom: { de: "Eigene Belegung", en: "Custom", ru: "Своя раскладка" },
} as const satisfies Readonly<Record<string, LocalLabel>>;

/** Die Originaltasten als Vorlage. */
export function originalKeys(actions: readonly KeyAction[]): KeyBindings {
  return Object.fromEntries(actions.map((a) => [a.id, a.codes.slice(0, MAX_KEYS)]));
}

/** Belegung zur gespeicherten Wahl; fehlende oder ungültige Einträge nehmen die Vorgabe. */
export function resolveBindings(layout: KeyLayout, stored?: StoredBindings): KeyBindings {
  const base = layout.presets[0]?.keys ?? originalKeys(layout.actions);
  if (!stored) return base;
  const preset = layout.presets.find((p) => p.id === stored.preset);
  if (preset) return preset.keys;
  if (stored.preset !== CUSTOM_PRESET || !stored.keys) return base;
  const out: Record<string, readonly string[]> = {};
  for (const a of layout.actions) {
    const keys = stored.keys[a.id];
    out[a.id] = keys
      ? [...new Set(keys.filter((k) => k !== ""))].slice(0, MAX_KEYS)
      : (base[a.id] ?? []);
  }
  return out;
}

/** Dieselben Tasten, Reihenfolge egal. */
function sameKeys(a: readonly string[] = [], b: readonly string[] = []): boolean {
  return a.length === b.length && a.every((k) => b.includes(k));
}

/** Welche Vorlage genau dieser Belegung entspricht (sonst `CUSTOM_PRESET`). */
export function presetOf(layout: KeyLayout, keys: KeyBindings): string {
  const hit = layout.presets.find((p) =>
    layout.actions.every((a) => sameKeys(p.keys[a.id], keys[a.id])),
  );
  return hit?.id ?? CUSTOM_PRESET;
}

/**
 * Tastatur mit Belegung: ein Code, nach dem eine Aktion fragt, gilt genau dann als
 * gehalten, wenn eine der belegten Tasten einer solchen Aktion gehalten ist (die
 * Originaltaste selbst also nur, wenn sie belegt ist). Alle übrigen Codes (Esc,
 * Enter, Pad und Touch speisen nicht hier ein) reicht sie unverändert durch.
 */
export function bindKeys(
  keys: KeyState,
  actions: readonly KeyAction[],
  bindings: () => KeyBindings,
): KeyState {
  let cachedFor: KeyBindings | undefined;
  let table = new Map<string, readonly string[]>();
  const lookup = () => {
    const b = bindings();
    if (b !== cachedFor) {
      cachedFor = b;
      const t = new Map<string, Set<string>>();
      for (const a of actions) {
        const bound = b[a.id] ?? [];
        for (const c of a.codes) {
          const set = t.get(c) ?? new Set<string>();
          for (const k of bound) set.add(k);
          t.set(c, set);
        }
      }
      table = new Map([...t].map(([c, set]) => [c, [...set]]));
    }
    return table;
  };
  return {
    isDown: (code) => {
      const bound = lookup().get(code);
      return bound ? bound.some((k) => keys.isDown(k)) : keys.isDown(code);
    },
    ...(keys.held ? { held: keys.held.bind(keys) } : {}),
  };
}

export interface KeyIssues {
  /** Aktionen ohne Taste. */
  readonly missing: readonly string[];
  /** Tasten, die mehr als einer Aktion gehören → deren IDs. */
  readonly duplicates: ReadonlyMap<string, readonly string[]>;
}

/** Fehlende und doppelt belegte Tasten. */
export function keyIssues(actions: readonly KeyAction[], keys: KeyBindings): KeyIssues {
  const missing: string[] = [];
  const owners = new Map<string, string[]>();
  for (const a of actions) {
    const bound = keys[a.id] ?? [];
    if (bound.length === 0) missing.push(a.id);
    for (const k of bound) owners.set(k, [...(owners.get(k) ?? []), a.id]);
  }
  return { missing, duplicates: new Map([...owners].filter(([, ids]) => ids.length > 1)) };
}

/** Belegte Tasten → Navigation der HTML-Bildschirme (`KeyAction.nav`). */
export function navigationKeys(
  actions: readonly KeyAction[],
  keys: KeyBindings,
): ReadonlyMap<string, NonNullable<KeyAction["nav"]>> {
  const out = new Map<string, NonNullable<KeyAction["nav"]>>();
  for (const a of actions) {
    if (!a.nav) continue;
    for (const k of keys[a.id] ?? []) if (!out.has(k)) out.set(k, a.nav);
  }
  return out;
}

/**
 * Alte zweite Tasten (vor der freien Belegung): Original plus je Aktion eine
 * zusätzliche Taste. Liefert `undefined`, wenn nichts zusätzlich belegt war.
 */
export function withExtraKeys(
  layout: KeyLayout,
  extra: Readonly<Record<string, string>>,
): StoredBindings | undefined {
  const base = resolveBindings(layout);
  let any = false;
  const keys: Record<string, readonly string[]> = {};
  for (const a of layout.actions) {
    const cur = base[a.id] ?? [];
    const add = extra[a.id];
    if (add && !cur.includes(add)) {
      any = true;
      keys[a.id] = [...cur.slice(0, MAX_KEYS - 1), add];
    } else keys[a.id] = cur;
  }
  return any ? { preset: CUSTOM_PRESET, keys } : undefined;
}
