import { codeOfDik, keyText } from "../src/game/input";
import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, dbGain, parseConfig } from "../src/game/config";
import { emptyHighscores } from "../src/game/highscore";
import {
  type MenuKeys,
  MenuLogic,
  type MenuOptions,
  qbColor,
  rollNoise,
  volumeLevel,
  volumeStep,
} from "../src/game/menu/menuLogic";
import { VbRnd } from "../src/sim/vb";

const none: MenuKeys = {
  up: false,
  down: false,
  ok: false,
  back: false,
  pause: false,
  focus: true,
  char: 0,
  held: [],
};

function menu(o: Partial<MenuOptions> = {}): MenuLogic {
  return new MenuLogic({
    german: true,
    rnd: new VbRnd(1),
    passes: 0,
    highscores: emptyHighscores(),
    slots: Array.from({ length: 21 }, () => undefined),
    config: DEFAULT_CONFIG,
    playersMinus1: 0,
    names: [],
    ids: [],
    keyText: (set, a, keys) => keyText(set, a, keys),
    codeOfDik,
    ...o,
  });
}

/** Taste für einen Durchlauf drücken, dann loslassen (Flanke). */
function press(m: MenuLogic, k: Partial<MenuKeys>): void {
  m.step({ ...none, ...k });
  m.step(none);
}

function type(m: MenuLogic, s: string): void {
  for (const c of s) m.step({ ...none, char: c.charCodeAt(0) });
}

describe("Hauptmenü (MenuLoop)", () => {
  test("ShowMenu zieht 2 · (⌊(67n + 82)/2⌋ + 1) Rnd je Durchlauf", () => {
    const rnd = new VbRnd(7);
    const m = menu({ rnd });
    const probe = new VbRnd(7);
    m.step(none);
    // Hauptmenü D/E: n = 4 → 352, noch ohne Rauschen (Hangar noch nicht vereist)
    for (let i = 0; i < 352; i++) probe.next();
    expect(rnd.seed).toBe(probe.seed);
  });

  test("Rauschen ab dem Vereisen des Hangars (48 Rnd), α bis 0,025", () => {
    const m = menu();
    let first = -1;
    let last = 0;
    for (let i = 1; i <= 260; i++) {
      const d = m.step(none);
      if (d.noiseTiles.length > 0 && first < 0) first = i;
      last = d.noise;
      if (d.noiseTiles.length > 0) expect(d.noiseTiles).toHaveLength(12);
    }
    expect(first).toBeGreaterThan(98);
    expect(first).toBeLessThan(103);
    expect(last).toBeCloseTo(0.025, 5);
    expect(rollNoise(new VbRnd(3))).toHaveLength(12);
  });

  test("Neu → 1 Spieler → D-Phyton → Name: Spielstart mit ID, leer → „Bruce“", () => {
    const m = menu({ passes: 2 });
    m.step(none);
    press(m, { ok: true });
    expect(m.page).toBe(10);
    press(m, { ok: true });
    expect(m.page).toBe(1);
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(2);
    expect(m.ship).toBe(1);
    m.step({ ...none, char: 13 });
    expect(m.result).toMatchObject({ kind: "new", players: 1, ship: 1, names: ["Bruce"] });
    const id = m.result?.kind === "new" ? m.result.ids[0]! : 0;
    // `Int(Rnd · 10000) + Durchgänge · 10000`
    expect(id).toBeGreaterThanOrEqual(20000);
    expect(id).toBeLessThan(30000);
    expect(m.result?.kind === "new" && m.result.bonus).toBe(undefined);
  });

  test("zwei Spieler geben nacheinander ihren Namen ein (höchstens 16 Zeichen, Backspace)", () => {
    const m = menu();
    m.step(none);
    press(m, { ok: true });
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.np1).toBe(1);
    press(m, { ok: true });
    type(m, "Kauto");
    m.step({ ...none, char: 8 });
    m.step({ ...none, char: 13 });
    expect(m.result).toBeUndefined();
    type(m, "x".repeat(20));
    m.step({ ...none, char: 13 });
    expect(m.result).toMatchObject({
      kind: "new",
      players: 2,
      ship: 0,
      names: ["Kaut", "x".repeat(16)],
    });
    const ids = m.result?.kind === "new" ? m.result.ids : [];
    expect(ids[0]).not.toBe(ids[1]);
  });

  test("Esc im Hauptmenü beendet, D/Q dort nicht; Zurück auf Unterseiten auch mit D/Q", () => {
    const a = menu();
    a.step(none);
    press(a, { back: true });
    expect(a.result).toBeUndefined();
    press(a, { pause: true, back: true });
    expect(a.result).toEqual({ kind: "exit" });
    const b = menu();
    b.step(none);
    press(b, { ok: true });
    expect(b.page).toBe(10);
    press(b, { back: true });
    expect(b.page).toBe(3);
  });

  test("Spiel laden: Vorauswahl „Zurück“, leere Plätze werden übersprungen", () => {
    const slots: (string | undefined)[] = Array.from({ length: 21 }, () => undefined);
    slots[4] = "P1S1A - Level2-3  01.01.2026";
    const m = menu({ slots });
    m.step(none);
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(20);
    // Tafel einschieben: erst bei off = 0 bewegt sich die Liste
    for (let i = 0; i < 20; i++) m.step(none);
    const d = m.step(none);
    expect(d.list?.rows.find((r) => r.index === 25)?.text).toBe("Zurück");
    press(m, { up: true });
    press(m, { ok: true });
    expect(m.result).toEqual({ kind: "load", slot: 5 });
  });

  test("Lautstärke: Musik +5 mit Umlauf, Sound/Sprache +250 dB/100 bis stumm", () => {
    let v = -1000;
    const seq: string[] = [];
    for (let i = 0; i < 6; i++) {
      v = volumeStep(v);
      seq.push(volumeLevel(v));
    }
    expect(seq).toEqual(["85", "90", "95", "100", "-100", "10"]);
    expect(dbGain(-10000)).toBe(0);
    expect(dbGain(0)).toBe(1);
    const m = menu();
    m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(30);
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(32);
    press(m, { ok: true });
    expect(m.config.music).toBe(95);
    press(m, { ok: true });
    press(m, { ok: true });
    expect(m.config.music).toBe(0);
    // ↑/↓ in der Liste erst, wenn die Tafel steht (off = 0)
    for (let i = 0; i < 20; i++) m.step(none);
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.config.sfx).toBe(-750);
    expect(m.sounds.map((s) => s.name)).toContain("plingding");
  });

  test("Bonus erst nach einem Durchgang, Einträge je Durchgang, Start als Einzellevel", () => {
    const zero = menu();
    zero.step(none);
    press(zero, { down: true });
    press(zero, { down: true });
    press(zero, { ok: true });
    expect(zero.entries).toEqual(["Grundeins.", "Lautstärke", "Tastenkon.", "Zurück"]);
    const m = menu({ passes: 2 });
    m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.entries).toHaveLength(5);
    for (let i = 0; i < 3; i++) press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(40);
    expect(m.entries).toEqual(["JUNGLE", "SPACE", "BACK"]);
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(10);
    press(m, { ok: true });
    press(m, { ok: true });
    m.step({ ...none, char: 13 });
    expect(m.result).toMatchObject({ kind: "new", bonus: "Spacestation Bonus" });
  });

  test("Tastenkonfiguration: Aufnahme setzt die zweite Taste, übernehmen sichert, Zurück verwirft", () => {
    const m = menu();
    m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.page).toBe(33);
    for (let i = 0; i < 20; i++) m.step(none);
    // 3 „Steuerung für“, 4 „Gerät“, 5 leer, 6 „Links“
    press(m, { down: true });
    press(m, { down: true });
    // OK lösen, dann die Taste Y (DIK 21) halten: Aufnahme, Loslassen beendet sie
    m.step({ ...none, ok: true });
    m.step(none);
    m.step({ ...none, held: [21] });
    expect(m.keyMap[0]).toBe("KeyY");
    expect(m.config.keys[0]).toBe("");
    m.step(none);
    m.step(none);
    // gehaltene Taste + weitere: die weitere gewinnt
    press(m, { ok: true });
    m.step({ ...none, held: [44] });
    m.step({ ...none, held: [44, 45] });
    m.step(none);
    expect(m.keyMap[0]).toBe("KeyX");
    m.step(none);
    // Esc bricht ab und lässt die Belegung, wie sie war
    press(m, { ok: true });
    m.step({ ...none, pause: true });
    m.step(none);
    expect(m.keyMap[0]).toBe("KeyX");
    expect(m.page).toBe(33);
    m.step(none);
    expect(m.page).toBe(33);
    // Zurück ohne Übernehmen verwirft
    press(m, { back: true });
    expect(m.page).toBe(30);
    expect(m.keyMap[0]).toBe("");
  });

  test("Tastenkonfiguration: Übernehmen sichert den Arbeitsstand in der Konfiguration", () => {
    const m = menu();
    m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    for (let i = 0; i < 20; i++) m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    m.step({ ...none, ok: true });
    m.step(none);
    m.step({ ...none, held: [21] });
    m.step(none);
    // Zeile 20 „Einstellungen übernehmen“: ↑ von 6 läuft über 4 und 3 zu 21, dann 20
    press(m, { up: true });
    press(m, { up: true });
    press(m, { up: true });
    press(m, { up: true });
    press(m, { ok: true });
    expect(m.config.keys[0]).toBe("KeyY");
    press(m, { back: true });
    expect(m.page).toBe(30);
    expect(m.keyMap[0]).toBe("KeyY");
    expect(parseConfig(JSON.stringify(m.config)).keys[0]).toBe("KeyY");
  });

  test("Osterei: L, O und V zugleich im Hauptmenü, nicht auf anderen Seiten", () => {
    const a = menu();
    a.step(none);
    a.step({ ...none, held: [38, 24] });
    expect(a.result).toBeUndefined();
    a.step({ ...none, held: [24, 38, 47] });
    expect(a.result).toEqual({ kind: "love" });
    const b = menu();
    b.step(none);
    press(b, { ok: true });
    expect(b.page).toBe(10);
    b.step({ ...none, held: [24, 38, 47] });
    expect(b.result).toBeUndefined();
  });

  test("Grundeinstellungen schalten die drei Optionen um", () => {
    const m = menu();
    m.step(none);
    press(m, { down: true });
    press(m, { down: true });
    press(m, { ok: true });
    press(m, { ok: true });
    expect(m.page).toBe(31);
    press(m, { ok: true });
    expect(m.config.qNormal).toBe(true);
    for (let i = 0; i < 20; i++) m.step(none);
    press(m, { down: true });
    press(m, { ok: true });
    expect(m.config.autoArrange).toBe(false);
    expect(parseConfig(JSON.stringify(m.config))).toEqual(m.config);
    expect(parseConfig("kaputt")).toEqual(DEFAULT_CONFIG);
  });

  test("Farben und Gleiten", () => {
    expect([qbColor(8), qbColor(7), qbColor(15), qbColor(14)]).toEqual([
      0x808080, 0xc0c0c0, 0xffffff, 0xffff00,
    ]);
    const m = menu();
    for (let i = 0; i < 40; i++) m.step(none);
    expect(m.mx).toBeCloseTo(155, 0);
    expect(m.my).toBeCloseTo(165, 0);
    expect(m.offsets[0]).toBeCloseTo(30, 1);
  });
});
