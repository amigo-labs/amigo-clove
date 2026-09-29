import { describe, expect, test } from "bun:test";
import { languageVideo } from "../src/game/campaign";
import { rankTexts } from "../src/game/continueScreen";
import {
  LANGS,
  hintPrefix,
  isCyrillic,
  langLetter,
  langOfLocale,
  levelRu,
  levelShort,
  loadingText,
  parseLang,
  pick,
  pressAnyKeyText,
  resolveLang,
} from "../src/game/lang";
import { pauseMenu, pauseTitle } from "../src/game/pauseScreen";
import { saveLabel } from "../src/game/saveGame";
import { saveStrings } from "../src/game/saveScreen";

describe("Sprache (Me.588070)", () => {
  test("pick wählt je Sprache, LANGS und Buchstaben des Originals", () => {
    expect(LANGS).toEqual(["de", "en", "ru"]);
    expect(pick("de", "a", "b", "c")).toBe("a");
    expect(pick("en", "a", "b", "c")).toBe("b");
    expect(pick("ru", "a", "b", "c")).toBe("c");
    expect(LANGS.map(langLetter)).toEqual(["D", "E", "R"]);
  });

  test("Locale → Sprache: de, ru, sonst Englisch; lang= gewinnt", () => {
    expect(langOfLocale("de")).toBe("de");
    expect(langOfLocale("de-AT")).toBe("de");
    expect(langOfLocale("DE_ch")).toBe("de");
    expect(langOfLocale("ru")).toBe("ru");
    expect(langOfLocale("ru-RU")).toBe("ru");
    expect(langOfLocale("en-US")).toBe("en");
    expect(langOfLocale("uk")).toBe("en");
    expect(langOfLocale("")).toBe("en");
    expect(parseLang("RU")).toBe("ru");
    expect(parseLang(" de ")).toBe("de");
    expect(parseLang("fr")).toBeUndefined();
    expect(parseLang(undefined)).toBeUndefined();
    expect(resolveLang("ru", "de-DE")).toBe("ru");
    expect(resolveLang("en", "ru-RU")).toBe("en");
    expect(resolveLang(undefined, "ru-RU")).toBe("ru");
    expect(resolveLang("xx", "de")).toBe("de");
  });

  test("Tastenhinweis, Ladebild und Videos (0x539DF7, 0x4CAA33, 0x4CFB5B, 0x54DD63)", () => {
    expect(LANGS.map(hintPrefix)).toEqual(["Drücke: ", "Press: ", "Нажмите: "]);
    // „Loading“ bei 376; Russisch „Загрузка“ bei 372
    expect(LANGS.map(loadingText)).toEqual([
      { text: "Loading", x: 376 },
      { text: "Loading", x: 376 },
      { text: "Загрузка", x: 372 },
    ]);
    // „Press any key to start!“ ist auch auf Deutsch englisch
    expect(LANGS.map(pressAnyKeyText)).toEqual([
      { text: "Press any key to start!", x: 294 },
      { text: "Press any key to start!", x: 294 },
      { text: "Нажмите любую клавишу для старта!", x: 214 },
    ]);
    expect(LANGS.map((l) => languageVideo("intro", l))).toEqual([
      "video/introd",
      "video/introe",
      "video/intror",
    ]);
    expect(LANGS.map((l) => languageVideo("outro", l))).toEqual([
      "video/outrod",
      "video/outroe",
      "video/outror",
    ]);
    expect(languageVideo("outro2", "ru")).toBe("video/outro2r");
  });

  test("Namenseingabe: kyrillische Buchstaben (CP1251) erkennen", () => {
    const yes = ["Ё", "ё", "А", "Я", "а", "я", "ж"].map((c) => isCyrillic(c.charCodeAt(0)));
    expect(yes.every(Boolean)).toBe(true);
    const no = ["A", "z", "ß", "ä", "€", "ґ", "1", " "].map((c) => isCyrillic(c.charCodeAt(0)));
    expect(no.some(Boolean)).toBe(false);
  });

  test("Levelname: Kurzform bis „-x“, Russisch mit „Уровень“ statt „Level“", () => {
    expect(levelShort("Level1-1 Skyfight")).toBe("Level1-1");
    expect(levelShort("Level7-5 Escape")).toBe("Level7-5");
    // ohne „-“ bleibt `Left(x, 1)`
    expect(levelShort("Spacestation Bonus")).toBe("S");
    expect(levelShort("Epilog")).toBe("E");
    expect(levelRu("Level1-1 Skyfight")).toBe("Уровень1-1");
    expect(levelRu("Level8-1 Jungle")).toBe("Уровень8-1");
    expect(levelRu("Level Bleistift")).toBe("L");
  });
});

describe("Bildschirme auf Russisch", () => {
  test("Pause: Menü und Titel (0x527187, 0x5275BF)", () => {
    expect(LANGS.map(pauseMenu)).toEqual([
      ["WEITER", "EXIT"],
      ["RESUME", "EXIT"],
      ["Продолжить", "Выход"],
    ]);
    const names = ["Bruce", "Kim"];
    expect(pauseTitle("Level1-1 Skyfight", names, "de")).toBe("Level1-1 Skyfight (Bruce & Kim)");
    expect(pauseTitle("Level1-1 Skyfight", names, "en")).toBe("Level1-1 Skyfight (Bruce & Kim)");
    expect(pauseTitle("Level1-1 Skyfight", ["Bruce"], "ru")).toBe("Уровень1-1 (Bruce)");
  });

  test("Continue: nur „D“ ist eigen, Russisch zeigt den englischen Text (0x5232B3)", () => {
    const ranks = [3];
    expect(rankTexts(["Bruce"], ranks, "de")[0]?.text).toBe("Bruce landet auf Platz 3!");
    expect(rankTexts(["Bruce"], ranks, "en")[0]?.text).toBe("Bruce ranked at place 3!");
    expect(rankTexts(["Bruce"], ranks, "ru")[0]?.text).toBe("Bruce ranked at place 3!");
  });

  test("Speicherbildschirm: Deutsch und Englisch unverändert, Russisch ohne Levelname und Platz", () => {
    const de = saveStrings("de");
    expect(de.cleared("Level1-1 Skyfight")).toBe("Level1-1 Skyfight geschafft!");
    expect(de.ask).toBe("Spiel speichern? ");
    expect(de.player(1, 1200, 3)).toBe("Spieler 1: 1200 (HIGHSCORE: 3. Platz!)");
    expect(de.player(2, 50, 11)).toBe("Spieler 2: 50");
    expect(de.dontSave).toBe("Nicht speichern");
    expect(de.saved).toEqual({ text: "Gespeichert", size: 150, y: 150 });
    const en = saveStrings("en");
    expect(en.cleared("Level1-1 Skyfight")).toBe("Level1-1 Skyfight Cleared!");
    expect(en.ask).toBe("Save Game? ");
    expect(en.player(1, 1200, 3)).toBe("Player 1: 1200 (HIGHSCORE: 3. Place!)");
    expect(en.dontSave).toBe("Don't Save");
    expect(en.saved).toEqual({ text: "Saved", size: 300, y: 120 });
    const ru = saveStrings("ru");
    expect(ru.cleared("Level1-1 Skyfight")).toBe("Уровень расчищен!");
    expect(ru.ask).toBe("Сохранить игру? ");
    // 0x412A74/0x412A8C: „1 игрок: “, „2 игрок: “ + Punkte, kein Highscore-Platz
    expect(ru.player(1, 1200, 3)).toBe("1 игрок: 1200");
    expect(ru.player(2, 50, 1)).toBe("2 игрок: 50");
    expect(ru.dontSave).toBe("Не сохранено");
    expect(ru.saved).toEqual({ text: "Сохранено", size: 170, y: 140 });
  });

  test("Spielstandbeschriftung: Russisch „Уровень“, Datum TT.MM.JJJJ (de, ru), M/T/JJJJ (en)", () => {
    const d = new Date(2026, 8, 28);
    expect(saveLabel(1, 0, 1, "Level1-2 Zeppelin Boss", d, "de")).toBe(
      "P1S1A - Level1-2  28.09.2026",
    );
    expect(saveLabel(2, 1, 30, "Level7-4 finalboss", d, "en")).toBe("P2S2Z - Level7-4  9/28/2026");
    expect(saveLabel(1, 0, 1, "Level1-2 Zeppelin Boss", d, "ru")).toBe(
      "P1S1A - Уровень1-2  28.09.2026",
    );
  });
});
