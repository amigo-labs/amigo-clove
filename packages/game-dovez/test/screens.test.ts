/** Continue- und Pause-Bildschirm: Zustandslogik ohne Pixi. */
import { describe, expect, test } from "bun:test";
import {
  CONTINUE_MS,
  ContinueLogic,
  STEP_PASSES,
  applyContinue,
  continueRanks,
  rankTexts,
  type ContinueKeys,
} from "../src/game/continueScreen";
import {
  NOT_RANKED,
  addHighscore,
  emptyHighscores,
  parseHighscores,
  serializeHighscores,
} from "../src/game/highscore";
import { PauseLogic, wrapRadioLog, type PauseKeys } from "../src/game/pauseScreen";
import { VbRnd } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

const NONE: ContinueKeys = { ok: false, back: false, focus: true };

/** `VbRnd`, der die Aufrufe zählt. */
function countingRnd(): { next(): number; calls: number } {
  const r = new VbRnd();
  return {
    calls: 0,
    next() {
      this.calls++;
      return r.next();
    },
  };
}

describe("Continue", () => {
  test("Countdown: 28 Durchläufe à 40 ms je Schritt, die 0 steht einen Durchlauf", () => {
    const c = new ContinueLogic(new VbRnd());
    const digits: number[] = [];
    let passes = 0;
    while (!c.finishing) {
      const p = c.step(NONE);
      passes++;
      if (p.kind === "normal") digits.push(p.digit);
    }
    expect(passes).toBe(9 * STEP_PASSES);
    expect(passes * CONTINUE_MS).toBe(10_080);
    expect(digits.filter((d) => d === 9).length).toBe(STEP_PASSES - 1);
    expect(digits.filter((d) => d === 5).length).toBe(STEP_PASSES);
    expect(digits.filter((d) => d === 0).length).toBe(1);
    expect(c.result).toBeUndefined();
  });

  test("Ablauf ohne Bestätigung: 72 Durchläufe Ausschalten, dann „nein“", () => {
    const c = new ContinueLogic(new VbRnd());
    for (let i = 0; i < 9 * STEP_PASSES; i++) c.step(NONE);
    const shrink: (readonly number[])[] = [];
    const glow: (readonly number[])[] = [];
    let off = 0;
    while (c.result === undefined) {
      // Tasten zählen beim Ausschalten nicht mehr
      const p = c.step({ ok: true, back: true, focus: true });
      off++;
      if (p.kind !== "off") throw new Error("erwartet Ausschalten");
      if (p.shrink) shrink.push([p.shrink.x1, p.shrink.y1, p.shrink.x2, p.shrink.y2]);
      if (p.glow) glow.push([p.glow.x1, p.glow.y1, p.glow.x2, p.glow.y2]);
    }
    expect(off).toBe(72);
    expect(c.result).toBe(false);
    expect(shrink.length).toBe(50);
    expect(shrink[0]).toEqual([8, 6, 792, 594]);
    expect(shrink[49]).toEqual([400, 300, 400, 300]);
    expect(glow.length).toBe(7);
    expect(glow[0]).toEqual([320, 298, 480, 302]);
    expect(glow[6]).toEqual([-160, 286, 960, 314]);
  });

  test("Esc/D/Q halten: drei Durchläufe je Schritt", () => {
    const c = new ContinueLogic(new VbRnd());
    let passes = 0;
    while (!c.finishing) {
      c.step({ ok: false, back: true, focus: true });
      passes++;
    }
    expect(passes).toBe(27);
  });

  test("Bestätigen nur mit Fokus; die Schleife endet nach diesem Durchlauf", () => {
    const c = new ContinueLogic(new VbRnd());
    for (let i = 0; i < 40; i++) c.step({ ok: true, back: true, focus: false });
    expect(c.result).toBeUndefined();
    expect(c.count).toBe(8);
    c.step({ ok: true, back: false, focus: true });
    expect(c.result).toBe(true);
  });

  test("Rnd je Durchlauf wie im Original: 207…211 normal, 1 beim Ausschalten", () => {
    const r = countingRnd();
    const c = new ContinueLogic(r);
    for (let i = 0; i < 9 * STEP_PASSES; i++) {
      const before = r.calls;
      const p = c.step(NONE);
      if (p.kind !== "normal") throw new Error("erwartet normal");
      const n = r.calls - before;
      const jitter = c.sub < 15 ? 1 : 0;
      expect(n).toBe(1 + 202 + 3 + p.stripes.length + jitter + 1 + 1 + 1);
      expect(p.flakes.length).toBe(202);
      expect(p.digitY).toBeGreaterThanOrEqual(190);
      expect(p.digitY).toBeLessThanOrEqual(210);
      expect(p.blurAlpha).toBeGreaterThanOrEqual(0.1);
      expect(p.blurAlpha).toBeLessThan(0.6);
    }
    const before = r.calls;
    c.step(NONE);
    expect(r.calls - before).toBe(1);
  });

  test("Annehmen: Leben 4, Punkte ÷ 3, dann Neustart mit 3 Leben", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    w.score = [100_001, 0];
    w.lives = 0;
    w.state = 1;
    expect(w.respawn()).toBe(false);
    applyContinue(w);
    expect(w.lives).toBe(4);
    expect(w.score[0]).toBe(33_333);
    expect(w.extraLifeAt).toBe(3);
    expect([w.musicVolume, w.musicStep]).toEqual([0, 5]);
    expect(w.respawn()).toBe(true);
    expect(w.state as number).toBe(0);
    expect(w.lives).toBe(3);
    expect(w.score[0]).toBe(33_333);
    // Musik blendet in 20 Ticks ein
    for (let t = 0; t < 20; t++) w.step([]);
    expect(w.musicVolume).toBe(100);
  });

  test("Annehmen zu zweit: gemeinsame Leben 7 → 6, beide Punktestände ÷ 3", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, { players: 2 });
    w.score = [10, 20];
    w.lives = 0;
    w.state = 1;
    applyContinue(w);
    expect(w.lives).toBe(7);
    expect(w.respawn()).toBe(true);
    expect(w.lives).toBe(6);
    expect(w.score).toEqual([3, 6]);
  });
});

describe("Highscore", () => {
  test("Einsortieren, Gleichstand davor, ein Platz je Spiel", () => {
    let list = emptyHighscores();
    let r = addHighscore(list, "A", 500, 1);
    expect(r.rank).toBe(1);
    list = r.list;
    r = addHighscore(list, "B", 500, 2);
    expect(r.rank).toBe(1);
    list = r.list;
    expect(list.slice(0, 3).map((e) => e.name)).toEqual(["B", "A", ""]);
    // dasselbe Spiel schlechter: nicht eingetragen
    r = addHighscore(list, "B", 100, 2);
    expect(r.rank).toBe(NOT_RANKED);
    expect(r.list).toEqual(list);
    // dasselbe Spiel besser: alter Eintrag rückt heraus
    r = addHighscore(list, "A", 900, 1);
    expect(r.rank).toBe(1);
    expect(r.list.slice(0, 3).map((e) => [e.name, e.score])).toEqual([
      ["A", 900],
      ["B", 500],
      ["", 0],
    ]);
    expect(r.list.length).toBe(10);
    expect(parseHighscores(serializeHighscores(r.list))).toEqual(r.list);
    expect(parseHighscores("kaputt")).toEqual(emptyHighscores());
  });

  test("volle Liste: 11 = nicht platziert, kein Text", () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      name: `N${i}`,
      score: 1000 - i,
      id: i + 1,
    }));
    const r = continueRanks(list, [{ name: "Bruce", score: 5, id: 99 }]);
    expect(r.ranks).toEqual([NOT_RANKED]);
    expect(rankTexts(["Bruce"], r.ranks, "de")).toEqual([]);
  });

  test("zwei Spieler: Spieler 2 davor schiebt den Platz von Spieler 1", () => {
    const r = continueRanks(emptyHighscores(), [
      { name: "Bruce", score: 100, id: 1 },
      { name: "Kim", score: 300, id: 2 },
    ]);
    expect(r.ranks).toEqual([2, 1]);
    expect(rankTexts(["Bruce", "Kim"], r.ranks, "de")).toEqual([
      { text: "Bruce landet auf Platz 2!", player: 0 },
      { text: "Kim landet auf Platz 1!", player: 1 },
    ]);
    expect(rankTexts(["Bruce"], [3], "en")[0]!.text).toBe("Bruce ranked at place 3!");
  });
});

/** Feste Zeichenbreite 10 px. */
const measure = (s: string) => s.length * 10;

const P: PauseKeys = { ok: false, back: false, up: false, down: false, focus: true };

describe("Pause", () => {
  test("wartet auf das Loslassen von Esc, dann Menü; Esc setzt fort", () => {
    const p = new PauseLogic(new VbRnd());
    expect(p.step({ ...P, back: true })).toBeUndefined();
    expect(p.phase).toBe("enter");
    expect(p.step(P)?.sel).toBe(0);
    expect(p.step({ ...P, down: true })?.sel).toBe(1);
    // ohne Fokus zählen keine Tasten
    expect(p.step({ ...P, up: true, focus: false })?.sel).toBe(1);
    expect(p.step({ ...P, back: true, focus: false })).toBeDefined();
    expect(p.step({ ...P, up: true })?.sel).toBe(0);
    expect(p.step({ ...P, back: true })).toBeUndefined();
    // gehalten: noch nicht zurück
    expect(p.result).toBeUndefined();
    p.step(P);
    expect(p.result).toEqual({ exit: false, restore: true });
  });

  test("EXIT nur mit OK; Esc bei EXIT setzt ohne Ton fort", () => {
    const exit = new PauseLogic(new VbRnd());
    exit.step({ ...P, down: true });
    exit.step({ ...P, ok: true });
    expect(exit.result).toEqual({ exit: true, restore: false });
    const back = new PauseLogic(new VbRnd());
    back.step({ ...P, down: true });
    back.step({ ...P, back: true });
    back.step(P);
    expect(back.result).toEqual({ exit: false, restore: false });
    const ok = new PauseLogic(new VbRnd());
    ok.step({ ...P, ok: true });
    expect(ok.result).toEqual({ exit: false, restore: true });
  });

  test("Einblendung α 0,95 … 0,05, im 20. Bild 0; Abtastzeile 1…300", () => {
    const p = new PauseLogic(new VbRnd());
    const fades: (number | undefined)[] = [];
    const pos: number[] = [];
    for (let i = 0; i < 310; i++) {
      const s = p.step(P)!;
      fades.push(s.fade);
      pos.push(s.pos);
    }
    expect(fades[0]).toBeCloseTo(0.95, 5);
    expect(fades[18]).toBeCloseTo(0.05, 5);
    expect(fades[19]).toBe(0);
    expect(fades[20]).toBeUndefined();
    expect(pos[0]).toBe(1);
    expect(pos[299]).toBe(300);
    expect(pos[300]).toBe(1);
  });

  test("Linsenstörung: 45 Bilder, Stärke 3…15, Rauschen 3 · amp Rnd", () => {
    const r = countingRnd();
    const p = new PauseLogic(r);
    p.g = 1;
    p.pos = 30;
    const amps: number[] = [];
    while (p.g !== 0) {
      const before = r.calls;
      const s = p.step(P)!;
      const lens = s.lens!;
      amps.push(lens.amp);
      expect(s.noise.length).toBe(4 * lens.amp);
      const lines = Math.max(0, Math.trunc(lens.g / 45) - 1);
      expect(s.lines.length).toBe(lines);
      expect(r.calls - before).toBe(3 * lens.amp + 2 * lines);
    }
    expect(amps.length).toBe(45);
    expect(Math.min(...amps)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...amps)).toBeLessThanOrEqual(15);
    expect(amps.slice(0, 11).every((a) => a >= 3 && a <= 5)).toBe(true);
  });

  test("Funkprotokoll: vorne Wörter abnehmen, Rest unten, Trenner als Leerzeile", () => {
    const long = `${"a".repeat(30)} ${"b".repeat(30)} ${"c".repeat(20)}`;
    const lines = wrapRadioLog(["erste", " ".repeat(10), long], measure);
    expect(lines).toEqual([
      "",
      "",
      "",
      "erste",
      "",
      "a".repeat(30),
      `${"b".repeat(30)} ${"c".repeat(20)}`,
    ]);
    // ein einzelnes zu langes Wort bleibt stehen (kein Endlosumbruch)
    expect(wrapRadioLog(["x".repeat(80)], measure)[6]).toBe("x".repeat(80));
    // mehr als sieben Zeilen: die ältesten fallen weg
    const many = Array.from({ length: 9 }, (_, i) => `m${i}`);
    expect(wrapRadioLog(many, measure)).toEqual(many.slice(2));
  });
});
