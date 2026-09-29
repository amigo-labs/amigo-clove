/**
 * Menütexte je Sprache (`MenuLoop` `0x559630`): Deutsch und Englisch wie bisher,
 * Russisch aus den Konstanten des Originals (CP1251 in UTF-16, dekodiert).
 */
import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../src/game/config";
import { emptyHighscores } from "../src/game/highscore";
import { LANGS, type Lang } from "../src/game/lang";
import { type MenuKeys, MenuLogic, type MenuOptions } from "../src/game/menu/menuLogic";
import { menuTexts } from "../src/game/menu/menuTexts";
import { VbRnd } from "../src/sim/vb";

const none: MenuKeys = {
  up: false,
  down: false,
  ok: false,
  back: false,
  pause: false,
  focus: true,
  char: 0,
};

function menu(lang: Lang, o: Partial<MenuOptions> = {}): MenuLogic {
  return new MenuLogic({
    lang,
    rnd: new VbRnd(1),
    passes: 0,
    highscores: emptyHighscores(),
    slots: Array.from({ length: 21 }, () => undefined),
    config: DEFAULT_CONFIG,
    playersMinus1: 0,
    names: [],
    ids: [],
    keyText: () => "?",
    ...o,
  });
}

function press(m: MenuLogic, k: Partial<MenuKeys>): void {
  m.step({ ...none, ...k });
  m.step(none);
}

/** Zeilen der Listenseite (Tafel eingeschoben); Seite 20 über „Laden“, die übrigen direkt. */
function listOf(lang: Lang, page: 20 | 31 | 32 | 33 | 50, o: Partial<MenuOptions> = {}): string[] {
  const m = menu(lang, o);
  if (page === 20) {
    m.step(none);
    press(m, { down: true });
    press(m, { ok: true });
  } else m.page = page;
  let rows: string[] = [];
  for (let i = 0; i < 40; i++) {
    const d = m.step(none);
    if (d.list) {
      rows = [];
      for (const r of d.list.rows) rows[r.index] = r.text;
    }
  }
  return rows;
}

describe("Hauptmenü in drei Sprachen", () => {
  test("Deutsch und Englisch: Texte wie im Port vor der Umstellung", () => {
    const de = menuTexts("de");
    const en = menuTexts("en");
    expect(de.main(false)).toEqual({
      title: "MENÜ",
      entries: ["Neu", "Laden", "Optionen", "Highscore", "Exit"],
    });
    expect(en.main(true)).toEqual({
      title: "MENU",
      entries: ["NEW", "LOAD", "OPTIONS", "SCORE", "EXIT"],
    });
    expect(de.players).toEqual({ title: "NEU", entries: ["1 Spieler", "2 Spieler", "Zurück"] });
    expect(en.players).toEqual({ title: "NEW", entries: ["1 PLAYER", "2 PLAYER", "BACK"] });
    expect(de.ship.entries).toEqual(["D-Tonator", "D-Phyton", "Zurück"]);
    expect(en.ship.entries).toEqual(["D-Tonator", "D-Phyton", "BACK"]);
    expect(de.namePrompt(2)).toBe("Name für Spieler 2:");
    expect(en.namePrompt(2)).toBe("Please insert Name, player 2:");
    expect(de.options(true).entries).toEqual([
      "Grundeins.",
      "Lautstärke",
      "Tastenkon.",
      "Bonus",
      "Zurück",
    ]);
    expect(en.options(false).entries).toEqual(["GAME", "SOUND", "KEYS", "BACK"]);
    expect([de.onOff(true), de.onOff(false), en.onOff(true), en.onOff(false)]).toEqual([
      "Ein",
      "Aus",
      "On",
      "Off",
    ]);
    expect(de.game.inertia(true)).toBe("Trägheit: Ein");
    expect(en.game.inertia(false)).toBe("Ship Movements: Arcade");
    expect([de.game.dashes, en.game.dashes, de.keys.dashes, en.keys.dashes]).toEqual([
      26, 19, 26, 19,
    ]);
  });

  test("Russisch: Hauptmenü (0x55A6B0) ohne Highscore, Bonus erst nach einem Durchgang", () => {
    const ru = menuTexts("ru");
    expect(ru.main(false)).toEqual({
      title: "Меню",
      entries: ["Новая", "Загрузить", "Настройки", "Выход"],
    });
    expect(ru.main(true).entries).toEqual(["Новая", "Загрузить", "Настройки", "Бонус", "Выход"]);
    const m = menu("ru");
    m.step(none);
    expect(m.title).toBe("Меню");
    expect(m.entries).toHaveLength(4);
    const b = menu("ru", { passes: 1 });
    b.step(none);
    expect(b.entries).toHaveLength(5);
    // Die Aktionen hängen am Index wie im Original: Eintrag 3 („Бонус“) öffnet die
    // Highscore-Seite, der letzte („Выход“) beendet.
    for (let i = 0; i < 3; i++) press(b, { down: true });
    press(b, { ok: true });
    expect(b.page).toBe(50);
    const e = menu("ru");
    e.step(none);
    for (let i = 0; i < 3; i++) press(e, { down: true });
    press(e, { ok: true });
    expect(e.result).toEqual({ kind: "exit" });
  });

  test("Russisch: Spieleranzahl, Schiff, Namenseingabe (nur „D“ ist eigen), Optionen", () => {
    const ru = menuTexts("ru");
    expect(ru.players).toEqual({ title: "Новая", entries: ['1 игрок"', "2 игрока", "Назад"] });
    expect(ru.ship).toEqual({ title: "КОРАБЛЬ", entries: ["D-Tonator", "D-Phyton", "Назад"] });
    expect(ru.namePrompt(1)).toBe("Please insert Name, player 1:");
    expect(ru.options(true)).toEqual({
      title: "Настройки",
      entries: ['Игра"', "Звуки", "Клавиши", "Назад"],
    });
    expect(ru.bonus).toEqual({ title: "Бонус", back: "Назад" });
    const m = menu("ru");
    m.step(none);
    press(m, { ok: true });
    expect(m.page).toBe(10);
    expect(m.entries).toEqual(['1 игрок"', "2 игрока", "Назад"]);
    press(m, { ok: true });
    expect(m.page).toBe(1);
    expect(m.title).toBe("КОРАБЛЬ");
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(2);
    for (let i = 0; i < 30; i++) m.step(none);
    expect(m.step(none).list?.rows[0]?.text).toBe("Please insert Name, player 1:");
  });

  test("Russisch: Optionen ohne Bonus, Bonus-Seite über das Hauptmenü nicht erreichbar", () => {
    const m = menu("ru", { passes: 3 });
    m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(30);
    expect(m.entries).toEqual(['Игра"', "Звуки", "Клавиши", "Назад"]);
    // Index 3 ist hier „Назад“ (der letzte Eintrag), nicht „Bonus“
    for (let i = 0; i < 3; i++) press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(3);
  });

  test("Russisch: Grundeinstellungen (Seite 31)", () => {
    const rows = listOf("ru", 31);
    expect(rows[0]).toBe("Настройка игры");
    expect(rows[1]).toBe("-".repeat(19));
    expect(rows[3]).toBe("Режим Супер Луч: Смена режима");
    expect(rows[4]).toBe("Апгрейд: Начальный");
    expect(rows[5]).toMatch(/^Инерция корабля: (Вкл\.|Выкл\.)$/);
    expect(rows[7]).toBe("Назад");
    const on = listOf("ru", 31, {
      config: { ...DEFAULT_CONFIG, qNormal: true, autoArrange: false },
    });
    expect(on[3]).toBe("Режим Супер Луч: Норма");
    expect(on[4]).toBe("Апгрейд: Продвинутый");
    const inertia = (realistic: boolean) =>
      listOf("ru", 31, { config: { ...DEFAULT_CONFIG, realistic } })[5];
    expect(inertia(true)).toBe("Инерция корабля: Вкл.");
    expect(inertia(false)).toBe("Инерция корабля: Выкл.");
  });

  test("Russisch: Lautstärke (Seite 32) mit „SFX“ und Tastenkonfiguration (Seite 33)", () => {
    const v = listOf("ru", 32);
    expect(v[0]).toBe('Уровень звука"');
    expect(v[1]).toBe("-".repeat(32));
    expect(v[3]).toBe(`Музыка: ${DEFAULT_CONFIG.music}`);
    expect(v[4]).toMatch(/^SFX: /);
    expect(v[5]).toMatch(/^Голоса: /);
    expect(v[7]).toBe("Назад");
    const k = listOf("ru", 33, { keyText: (set, action) => `k${set}${action}` });
    expect(k[0]).toBe("Конфигурация");
    expect(k[1]).toBe("-".repeat(20));
    expect(k[3]).toBe('Синглплеер"');
    expect(k[4]).toBe("Управление: Клавиатура");
    expect(k.slice(6, 16)).toEqual([
      "Влево: k00",
      "Вверх: k01",
      "Вправо: k02",
      "Вниз: k03",
      "Огонь: k04",
      "Навести: k05",
      "Управление режимом/Сменить Части: k06",
      "Режим Супер Луч: k07",
      "Поворот частей: k08",
      "Сверхновая звезда: k09",
    ]);
  });

  test("Spiel laden und Highscore: Titel und Zurück-Zeile je Sprache", () => {
    const titles = LANGS.map((l) => listOf(l, 20)[0]);
    expect(titles).toEqual(["Spiel laden", "Load Game", "Загрузить"]);
    const backs = LANGS.map((l) => listOf(l, 20)[25]);
    expect(backs).toEqual(["Zurück", "Back", "Назад"]);
    // Highscore-Seite: Russisch fällt wie Englisch auf „Back“
    expect(LANGS.map((l) => menuTexts(l).scoreBack)).toEqual(["Zurück", "Back", "Back"]);
    const score = listOf("ru", 50);
    expect(score.at(-1)).toBe("Back");
  });
});
