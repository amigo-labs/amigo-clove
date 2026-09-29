/**
 * Sprache des Spiels. Das Original kennt drei: `Me.588070` (`0x588070`) ist ein
 * String — „E“ beim Start (`0x4A60E0`), dann „D“, „E“ oder „R“ aus `config.cfg`
 * (`0x504E80`); jede Textstelle verzweigt darauf mit `StrCmp(Me.588070, "…")`.
 * Verzweigungen und Adressen: `docs/measurements/dovez-runtime.md` („Sprachen“).
 *
 * Der Port wählt sie aus der Locale des Hosts (`de`/`ru`, sonst Englisch) oder
 * mit der URL-Option `lang=de|en|ru`.
 */
export const LANGS = ["de", "en", "ru"] as const;
export type Lang = (typeof LANGS)[number];

/**
 * Text je Sprache. Wo das Original eine Sprache nicht eigens behandelt (die
 * Verzweigung kennt nur „D“ und sonst Englisch), steht der englische Text
 * auch an der russischen Stelle: `pick(lang, de, en, en)`.
 */
export function pick<T>(lang: Lang, de: T, en: T, ru: T): T {
  return lang === "de" ? de : lang === "ru" ? ru : en;
}

/** Der Buchstabe des Originals („D“/„E“/„R“), etwa in `Outro<Sprache>.avi`. */
export function langLetter(lang: Lang): "D" | "E" | "R" {
  return pick<"D" | "E" | "R">(lang, "D", "E", "R");
}

/**
 * Ё, А–я, ё: die Buchstaben, die CP1251 hinter 0xC0 kennt (`KeyAscii` 168, 184,
 * 192–255). In der Namenseingabe sind sie auf Russisch erlaubt, sonst nur ANSI bis 255.
 */
export const isCyrillic = (c: number): boolean =>
  c === 0x401 || c === 0x451 || (c >= 0x410 && c <= 0x44f);

/**
 * Vorsatz des Tastenhinweises im Spiel (`0x539DF7`, Arial 70): D „Drücke: “,
 * E „Press: “, R „Нажмите: “ — Größe und Lage sind in allen Sprachen gleich.
 */
export function hintPrefix(lang: Lang): string {
  return pick(lang, "Drücke: ", "Press: ", "Нажмите: ");
}

/**
 * „Loading“ (`LadeDaten` `0x4CAA33`, `Play` `0x54D851`, `credits` `0x54DC4B`):
 * System 18 weiß, y = 490; Russisch „Загрузка“ bei x = 372, sonst „Loading“ bei 376.
 */
export function loadingText(lang: Lang): { readonly text: string; readonly x: number } {
  return lang === "ru" ? { text: "Загрузка", x: 372 } : { text: "Loading", x: 376 };
}

/**
 * „Press any key to start!“ (`LadeDaten` `0x4CFB5B`, System 24, y = 470): auch die
 * deutsche Fassung zeigt den englischen Text (bei x = 294); Russisch
 * „Нажмите любую клавишу для старта!“ bei x = 214.
 */
export function pressAnyKeyText(lang: Lang): { readonly text: string; readonly x: number } {
  return lang === "ru"
    ? { text: "Нажмите любую клавишу для старта!", x: 214 }
    : { text: "Press any key to start!", x: 294 };
}

/**
 * Levelname in der Kurzform des Originals: `Left(Lvl, InStr(Lvl, "-") + 1)`,
 * z. B. `Level1-1 Skyfight` → `Level1-1` (ohne „-“ nur das erste Zeichen).
 */
export function levelShort(level: string): string {
  return level.slice(0, level.indexOf("-") + 2);
}

/**
 * Levelname auf Russisch (Pause `0x5275C1`, Spielstandbeschriftung `0x544AA9`):
 * `Replace(Left(Lvl, InStr(Lvl, "-") + 1), "Level", "Уровень", 1, -1, vbTextCompare)`.
 * `Level1-1 Skyfight` → `Уровень1-1`.
 */
export function levelRu(level: string): string {
  return levelShort(level).replace(/level/gi, "Уровень");
}

/** `lang=de|en|ru` (ohne Groß-/Kleinschreibung); alles andere ist keine Angabe. */
export function parseLang(value: string | undefined): Lang | undefined {
  const v = value?.trim().toLowerCase();
  return LANGS.find((l) => l === v);
}

/** Sprache einer Host-Locale (`de-AT` → Deutsch, `ru-RU` → Russisch, sonst Englisch). */
export function langOfLocale(locale: string): Lang {
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return base === "de" ? "de" : base === "ru" ? "ru" : "en";
}

/** URL-Option vor Host-Locale. */
export function resolveLang(option: string | undefined, locale: string): Lang {
  return parseLang(option) ?? langOfLocale(locale);
}
