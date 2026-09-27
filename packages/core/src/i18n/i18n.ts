/**
 * Minimale Lokalisierung für Shell und Spiele: zwei Sprachen wie in beiden
 * Originalen (Deutsch, Englisch), Wörterbücher als flache Schlüssel/Text-Tabellen.
 */

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Spracheinstellung: fest oder aus den Browsersprachen abgeleitet. */
export type LocalePreference = Locale | "auto";

/**
 * Erste passende Browsersprache (`navigator.languages`), sonst Englisch.
 * Eine feste Einstellung gewinnt immer.
 */
export function resolveLocale(pref: LocalePreference, languages: readonly string[]): Locale {
  if (pref !== "auto") return pref;
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    const hit = LOCALES.find((l) => l === base);
    if (hit) return hit;
  }
  return "en";
}

export type Dictionary<K extends string> = Readonly<Record<K, string>>;

export type Translate<K extends string> = (
  key: K,
  vars?: Readonly<Record<string, string | number>>,
) => string;

/** Übersetzer für eine Sprache; `{name}` im Text wird aus `vars` ersetzt, Unbekanntes bleibt stehen. */
export function translator<K extends string>(
  dictionaries: Readonly<Record<Locale, Dictionary<K>>>,
  locale: Locale,
): Translate<K> {
  const dict = dictionaries[locale];
  return (key, vars) =>
    dict[key].replace(/\{(\w+)\}/g, (all, name: string) =>
      vars && name in vars ? String(vars[name]) : all,
    );
}
