/**
 * Hauptmenü als HTML-Bildschirme (`htmlMenu.ts`): Seitenfolge, Ergebnisse und
 * Optionen mit einer Shell, die aus einem Skript antwortet; dazu die Regeln aus
 * `MenuLoop` (Pegel, IDs, Namen) und die Texte je Sprache.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { UiField, UiForm, UiMenu } from "@clove/core";
import {
  DEFAULT_CONFIG,
  type DovezConfig,
  dbGain,
  loadConfig,
  saveConfig,
} from "../src/game/config";
import { DEFAULT_NAME, emptyHighscores, type HighscoreEntry } from "../src/game/highscore";
import { DEFAULT_KEYS, useKeys } from "../src/game/input";
import { LANGS } from "../src/game/lang";
import { type HtmlMenuOptions, htmlMenu, splitChoice } from "../src/game/menu/htmlMenu";
import {
  VOLUME_STEPS,
  newPlayerIds,
  playerName,
  volumeIndex,
  volumeLevel,
  volumeOfIndex,
  volumeStep,
} from "../src/game/menu/menuRules";
import { menuTexts } from "../src/game/menu/menuTexts";
import { VbRnd } from "../src/sim/vb";
import { ScriptUi, memoryStore, submitForm } from "./fakeUi";

afterEach(() => useKeys(DEFAULT_KEYS));

const SLOTS = Array.from({ length: 21 }, (_, i) => (i === 4 ? "P1S1A - Level1-2" : undefined));

function options(ui: ScriptUi, o: Partial<HtmlMenuOptions> = {}) {
  const store = memoryStore();
  const configs: DovezConfig[] = [];
  const opts: HtmlMenuOptions = {
    ui,
    lang: "de",
    rnd: new VbRnd(1),
    passes: 0,
    highscores: emptyHighscores(),
    slots: SLOTS,
    config: DEFAULT_CONFIG,
    players: 1,
    names: [],
    ids: [],
    onConfig: (c) => {
      configs.push(c);
      saveConfig(store, c);
    },
    ...o,
  };
  return { opts, store, configs };
}

const menuAt = (ui: ScriptUi, i: number): UiMenu => {
  const s = ui.shown[i];
  if (s?.kind !== "menu") throw new Error(`Menü erwartet an ${i}, nicht ${s?.kind}`);
  return s;
};
const formAt = (ui: ScriptUi, i: number): UiForm => {
  const s = ui.shown[i];
  if (s?.kind !== "form") throw new Error(`Formular erwartet an ${i}, nicht ${s?.kind}`);
  return s;
};
const field = (f: UiForm, id: string): UiField => {
  const x = f.fields.find((g) => g.id === id);
  if (!x) throw new Error(`Feld ${id} fehlt`);
  return x;
};

describe("Hauptmenü (HTML)", () => {
  test("Neu → 1 Spieler → D-Phyton → leerer Name: Spielstart als „Bruce“ mit ID", async () => {
    const ui = new ScriptUi([
      { id: "new" },
      { id: "1" },
      { id: "1" },
      { id: "ok", values: { name0: "   " } },
    ]);
    const { opts } = options(ui);
    const r = await htmlMenu(opts);
    expect(r).toEqual({
      kind: "new",
      players: 1,
      ship: 1,
      names: [DEFAULT_NAME],
      ids: newPlayerIds(new VbRnd(1), 1, 0, emptyHighscores()),
      bonus: undefined,
    });
    expect(ui.done).toBe(true);
    const main = menuAt(ui, 0);
    expect(main.title).toBe("MENÜ");
    expect(main.items.map((i) => [i.id, i.label])).toEqual([
      ["new", "Neu"],
      ["load", "Laden"],
      ["options", "Optionen"],
      ["score", "Highscore"],
      ["exit", "Exit"],
    ]);
    expect(main.back).toBe("exit");
    expect(main.secret).toEqual({ lov: "love" });
    expect(menuAt(ui, 1).items.map((i) => i.label)).toEqual(["1 Spieler", "2 Spieler", "Zurück"]);
    expect(menuAt(ui, 2).items.map((i) => i.label)).toEqual(["D-Tonator", "D-Phyton", "Zurück"]);
    const input = ui.shown[3]!;
    expect(input.kind === "input" && input.fields).toEqual([
      { id: "name0", label: "Name für Spieler 1:", max: 16, value: "" },
    ]);
  });

  test("zwei Spieler: zwei Namen (höchstens 16 Zeichen), verschiedene IDs; Zurück führt zurück", async () => {
    const ui = new ScriptUi([
      { id: "new" },
      { id: "2" },
      { id: "back" },
      { id: "2" },
      { id: "0" },
      { id: "ok", values: { name0: "Kim", name1: "x".repeat(20) } },
    ]);
    const { opts } = options(ui, { lang: "en", names: ["Old"], players: 2 });
    const r = await htmlMenu(opts);
    if (r.kind !== "new") throw new Error("Spielstart erwartet");
    expect(r.players).toBe(2);
    expect(r.ship).toBe(0);
    expect(r.names).toEqual(["Kim", "x".repeat(16)]);
    expect(r.ids[0]).not.toBe(r.ids[1]);
    // Vorauswahl aus dem letzten Spiel, Namen vorbelegt
    expect(menuAt(ui, 1).selected).toBe("2");
    expect(menuAt(ui, 2).title).toBe("SHIP");
    const input = ui.shown[5]!;
    expect(input.kind === "input" && input.fields.map((f) => [f.label, f.value])).toEqual([
      ["Please insert Name, player 1:", "Old"],
      ["Please insert Name, player 2:", ""],
    ]);
  });

  test("Laden: 21 Plätze im Raster, leere gesperrt, Vorauswahl „Zurück“", async () => {
    const ui = new ScriptUi([{ id: "load" }, { id: "slot5" }]);
    const r = await htmlMenu(options(ui).opts);
    expect(r).toEqual({ kind: "load", slot: 5 });
    const load = menuAt(ui, 1);
    expect(load.title).toBe("Spiel laden");
    expect(load.columns).toBe(3);
    expect(load.selected).toBe("back");
    expect(load.items).toHaveLength(22);
    expect(load.items[4]).toEqual({ id: "slot5", label: "P1S1A - Level1-2" });
    expect(load.items[0]).toEqual({ id: "slot1", label: "---", disabled: true });
    expect(load.items[21]).toEqual({ id: "back", label: "Zurück" });
  });

  test("Esc im Hauptmenü beendet, „lov“ startet das Osterei, Abbruch beendet", async () => {
    expect(await htmlMenu(options(new ScriptUi([{ id: "exit" }])).opts)).toEqual({ kind: "exit" });
    expect(await htmlMenu(options(new ScriptUi([{ id: "love" }])).opts)).toEqual({ kind: "love" });
    expect(await htmlMenu(options(new ScriptUi([{ id: "load" }, { id: "aborted" }])).opts)).toEqual(
      {
        kind: "exit",
      },
    );
  });

  test("Tastenkonfiguration: Übernehmen schreibt die zweite Taste in die Konfiguration", async () => {
    const ui = new ScriptUi([
      { id: "options" },
      { id: "keys" },
      submitForm("apply", { key4: "KeyY" }),
      { id: "back" },
      { id: "exit" },
    ]);
    const { opts, store } = options(ui);
    await htmlMenu(opts);
    expect(loadConfig(store).keys[4]).toBe("KeyY");
    expect(loadConfig(store).keys[0]).toBe(DEFAULT_KEYS[0]);
    const f = formAt(ui, 2);
    expect(f.title).toBe("Tastenkonfiguration");
    expect(f.actions.map((a) => a.id)).toEqual(["apply", "back"]);
    // 3 Sätze × 10 Aktionen, gruppiert; ohne Gamepad keine Vibration
    expect(f.fields).toHaveLength(30);
    expect(field(f, "key0")).toMatchObject({ kind: "key", label: "Links", group: "Einzelspieler" });
    expect(field(f, "key10")).toMatchObject({ group: "Zweispielermodus: Spieler 1" });
    expect(field(f, "key20")).toMatchObject({ group: "Zweispielermodus: Spieler 2" });
    expect(field(f, "key4")).toMatchObject({ text: "S" });
    expect(f.acceptKey?.("KeyY")).toBe(true);
    expect(f.acceptKey?.("Escape")).toBe(false);
    expect(f.acceptKey?.("MediaPlay")).toBe(false);
    expect(f.keyText?.("KeyY")).toBe("Z");
    // die Anzeige nach der Aufnahme: erste und zweite Taste
    const next = f.onChange?.({ key4: "KeyY" }, "key4");
    expect(next?.find((x) => x.id === "key4")).toMatchObject({ value: "KeyY", text: "S / Z" });
  });

  test("Tastenkonfiguration: Zurück verwirft die Änderungen", async () => {
    const ui = new ScriptUi([
      { id: "options" },
      { id: "keys" },
      submitForm("back", { key4: "KeyY" }),
      { id: "back" },
      { id: "exit" },
    ]);
    const { opts, configs } = options(ui);
    await htmlMenu(opts);
    expect(configs).toEqual([]);
  });

  test("Vibration nur mit Gamepad: Schalter und Stärke gelten sofort, mit Probeimpuls", async () => {
    const pulses: [number, number][] = [];
    const ui = new ScriptUi([
      { id: "options" },
      { id: "keys" },
      submitForm("back", { vibration0: "off", strength0: 3000 }),
      { id: "back" },
      { id: "exit" },
    ]);
    const { opts, store } = options(ui, {
      pads: () => 1,
      rumble: (pad, m) => pulses.push([pad, m]),
    });
    await htmlMenu(opts);
    const f = formAt(ui, 2);
    expect(f.fields).toHaveLength(32);
    expect(field(f, "vibration0")).toMatchObject({ kind: "choice", value: "on" });
    expect(field(f, "strength0")).toMatchObject({
      kind: "range",
      min: 500,
      max: 10000,
      step: 500,
      value: 2500,
      text: "2,5",
    });
    const c = loadConfig(store);
    expect(c.vibration).toEqual([false, true]);
    expect(c.vibrationStrength).toEqual([3000, 2500]);
    expect(pulses.slice(0, 2)).toEqual([
      [0, 1],
      [0, 0.3],
    ]);
  });

  test("Lautstärke: Regler in den Stufen des Originals, Musik in Fünfern", async () => {
    const sounds: string[] = [];
    const ui = new ScriptUi([
      { id: "options" },
      { id: "volume" },
      submitForm("back", { music: 50, sfx: VOLUME_STEPS, speech: 0 }),
      { id: "back" },
      { id: "exit" },
    ]);
    const { opts, store } = options(ui, { sound: (s) => sounds.push(s) });
    await htmlMenu(opts);
    await Promise.resolve();
    const f = formAt(ui, 2);
    expect(f.title).toBe("Lautstärkeeinstellungen");
    expect(field(f, "music")).toMatchObject({ min: 0, max: 100, step: 5, value: 90, text: "90" });
    expect(field(f, "sfx")).toMatchObject({ value: volumeIndex(-1000), text: "80" });
    expect(field(f, "speech")).toMatchObject({ value: VOLUME_STEPS, text: "100" });
    expect(loadConfig(store)).toMatchObject({ music: 50, sfx: 0, speech: -10000 });
    expect(sounds).toContain("speech");
  });

  test("Grundeinstellungen: drei Schalter, sofort gespeichert", async () => {
    const ui = new ScriptUi([
      { id: "options" },
      { id: "game" },
      submitForm("back", { forceKey: "on", arrange: "off" }),
      { id: "back" },
      { id: "exit" },
    ]);
    const { opts, store } = options(ui);
    await htmlMenu(opts);
    const f = formAt(ui, 2);
    expect(
      f.fields.map((x) => x.kind === "choice" && [x.label, x.options.map((o) => o.label)]),
    ).toEqual([
      ["Force Modus Taste", ["wird normal benutzt", "wirkt als Beamwechsel"]],
      ["D-Tonator", ["Automatische Waffenanordnung", "Manuelle Waffenanordnung"]],
      ["Trägheit", ["Ein", "Aus"]],
    ]);
    expect(loadConfig(store)).toMatchObject({
      qNormal: true,
      autoArrange: false,
      realistic: false,
    });
  });

  test("Bonus erst nach einem Durchgang; Start als Einzellevel", async () => {
    const zero = new ScriptUi([{ id: "options" }, { id: "back" }, { id: "exit" }]);
    await htmlMenu(options(zero).opts);
    expect(menuAt(zero, 1).items.map((i) => i.id)).toEqual(["game", "volume", "keys", "back"]);
    const ui = new ScriptUi([
      { id: "options" },
      { id: "bonus" },
      { id: "bonus1" },
      { id: "1" },
      { id: "0" },
      { id: "ok", values: { name0: "Kim" } },
    ]);
    const r = await htmlMenu(options(ui, { passes: 2 }).opts);
    expect(menuAt(ui, 2).items.map((i) => i.label)).toEqual(["JUNGLE", "SPACE", "BACK"]);
    expect(r).toMatchObject({ kind: "new", bonus: "Spacestation Bonus", names: ["Kim"] });
    // die IDs tragen den Durchgang
    if (r.kind === "new") expect(Math.trunc(r.ids[0]! / 10000)).toBe(2);
  });

  test("Russisch: „Бонус“ im Hauptmenü öffnet die Bonusseite", async () => {
    const ui = new ScriptUi([{ id: "bonus" }, { id: "back" }, { id: "exit" }]);
    await htmlMenu(options(ui, { lang: "ru", passes: 1 }).opts);
    expect(menuAt(ui, 0).items.map((i) => i.id)).toEqual([
      "new",
      "load",
      "options",
      "bonus",
      "exit",
    ]);
    expect(menuAt(ui, 1).title).toBe("Бонус");
    // zurück ins Hauptmenü, nicht in die Optionen
    expect(menuAt(ui, 2).title).toBe("Меню");
  });

  test("Highscore-Seite: Tabelle der zehn Plätze, Zurück", async () => {
    const list: HighscoreEntry[] = [
      { name: "Bruce", score: 500, id: 1 },
      ...emptyHighscores().slice(1),
    ];
    const ui = new ScriptUi([{ id: "score" }, { id: "back" }, { id: "exit" }]);
    await htmlMenu(options(ui, { highscores: list }).opts);
    const s = menuAt(ui, 1);
    expect(s.title).toBe("Highscore");
    const table = s.blocks?.[0];
    expect(table?.kind === "table" && table.rows[0]).toEqual(["1.", "Bruce", "500"]);
    expect(s.items).toEqual([{ id: "back", label: "Zurück" }]);
    expect(menuAt(ui, 2).selected).toBe("score");
  });
});

describe("Regeln aus MenuLoop", () => {
  test("Pegel: +250 dB/100 bis stumm, Reglerstufen auf denselben Werten", () => {
    let v = -1000;
    const seq: string[] = [];
    for (let i = 0; i < 6; i++) {
      v = volumeStep(v);
      seq.push(volumeLevel(v));
    }
    expect(seq).toEqual(["85", "90", "95", "100", "-100", "10"]);
    expect(dbGain(-10000)).toBe(0);
    expect(dbGain(0)).toBe(1);
    // jede Stufe des Reglers ist ein Wert, den `volumeStep` durchläuft
    const cycle = new Set<number>();
    let w = -10000;
    for (let i = 0; i < 25; i++) cycle.add((w = volumeStep(w)));
    for (let i = 0; i <= VOLUME_STEPS; i++) expect(cycle.has(volumeOfIndex(i))).toBe(true);
    expect(volumeIndex(volumeOfIndex(7))).toBe(7);
    expect([volumeIndex(-10000), volumeIndex(0), volumeIndex(-4600)]).toEqual([0, VOLUME_STEPS, 1]);
  });

  test("Namen: Steuerzeichen fallen weg, Kyrillisch nur auf Russisch, leer → „Bruce“", () => {
    expect(playerName("", "de")).toBe("Bruce");
    expect(playerName("Kim\u0007", "de")).toBe("Kim");
    expect(playerName("Жора", "de")).toBe("Bruce");
    expect(playerName("Жора", "ru")).toBe("Жора");
    expect(playerName("ä".repeat(20), "de")).toBe("ä".repeat(16));
  });

  test("Spiel-IDs: nicht in der Liste, verschieden, mit Durchgang", () => {
    const ids = newPlayerIds(new VbRnd(3), 2, 1, emptyHighscores(), [0, 0]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) expect(Math.trunc(id / 10000)).toBe(1);
    const probe = newPlayerIds(new VbRnd(3), 1, 0, emptyHighscores());
    const taken = [{ name: "x", score: 1, id: probe[0]! }, ...emptyHighscores().slice(1)];
    expect(newPlayerIds(new VbRnd(3), 1, 0, taken)[0]).not.toBe(probe[0]);
  });

  test("Umschaltzeilen: gemeinsame Wörter werden die Beschriftung", () => {
    expect(splitChoice("Force Mode Key: Normal", "Force Mode Key: Beam Alternation")).toEqual({
      label: "Force Mode Key",
      on: "Normal",
      off: "Beam Alternation",
    });
    expect(splitChoice("Апгрейд: Начальный", "Апгрейд: Продвинутый").label).toBe("Апгрейд");
    expect(splitChoice("An", "Aus")).toEqual({ label: "", on: "An", off: "Aus" });
  });
});

describe("Menütexte in drei Sprachen", () => {
  test("Deutsch und Englisch", () => {
    const de = menuTexts("de");
    const en = menuTexts("en");
    expect(en.main(true)).toEqual({
      title: "MENU",
      entries: ["NEW", "LOAD", "OPTIONS", "SCORE", "EXIT"],
    });
    expect(en.players).toEqual({ title: "NEW", entries: ["1 PLAYER", "2 PLAYER", "BACK"] });
    expect(de.options(true).entries).toEqual([
      "Grundeins.",
      "Lautstärke",
      "Tastenkon.",
      "Bonus",
      "Zurück",
    ]);
    expect(en.options(false).entries).toEqual(["GAME", "SOUND", "KEYS", "BACK"]);
    expect(de.game.inertia(true)).toBe("Trägheit: Ein");
    expect(en.game.inertia(false)).toBe("Ship Movements: Arcade");
  });

  test("Russisch: ohne Highscore im Hauptmenü, Bonus erst nach einem Durchgang, Optionen ohne Bonus", () => {
    const ru = menuTexts("ru");
    expect(ru.main(false)).toEqual({
      title: "Меню",
      entries: ["Новая", "Загрузить", "Настройки", "Выход"],
    });
    expect(ru.main(true).entries).toEqual(["Новая", "Загрузить", "Настройки", "Бонус", "Выход"]);
    expect(ru.players).toEqual({ title: "Новая", entries: ['1 игрок"', "2 игрока", "Назад"] });
    expect(ru.ship).toEqual({ title: "КОРАБЛЬ", entries: ["D-Tonator", "D-Phyton", "Назад"] });
    expect(ru.namePrompt(1)).toBe("Please insert Name, player 1:");
    expect(ru.options(true)).toEqual({
      title: "Настройки",
      entries: ['Игра"', "Звуки", "Клавиши", "Назад"],
    });
    expect(ru.game.forceKey(false)).toBe("Режим Супер Луч: Смена режима");
    expect(ru.volume).toEqual({
      title: 'Уровень звука"',
      music: "Музыка",
      sound: "SFX",
      voices: "Голоса",
    });
    expect(ru.keys.who[0]).toBe('Синглплеер"');
  });

  test("Spiel laden und Highscore: Titel und Zurück je Sprache", () => {
    expect(LANGS.map((l) => menuTexts(l).load.title)).toEqual([
      "Spiel laden",
      "Load Game",
      "Загрузить",
    ]);
    expect(LANGS.map((l) => menuTexts(l).back)).toEqual(["Zurück", "Back", "Назад"]);
    expect(LANGS.map((l) => menuTexts(l).scoreBack)).toEqual(["Zurück", "Back", "Back"]);
  });
});
