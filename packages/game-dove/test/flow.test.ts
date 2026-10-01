import type { DoveIntro, IntroObject } from "@clove/formats";
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_NAME,
  HIGHSCORE_SIZE,
  cleanName,
  defaultHighscores,
  insertHighscore,
  parseHighscores,
  rankFor,
  rankSuffix,
  serializeHighscores,
} from "../src/flow/highscore";
import { KeyEdges } from "../src/flow/input";
import { introSpriteAt, vbRound } from "../src/flow/intro";
import {
  type Config,
  DEFAULT_CONFIG,
  formatFactor,
  hasLevelSelect,
  levelName,
  parseConfig,
  pointFactor,
  previewImage,
  selectableLevels,
  serializeConfig,
  showsUnlockHint,
  simOptionsFor,
  unlockAfter,
} from "../src/flow/rules";
import { DEFAULT_OPTIONS, VbRnd } from "../src/sim";
import { assets } from "./helpers";

const cfg = (o: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...o });

describe("Punktefaktor (0x46DF6B)", () => {
  test("alle zwölf Kombinationen", () => {
    const expected: Record<string, number> = {};
    for (const shots of [0, 1, 2] as const) {
      const base = shots === 0 ? 75 : shots === 1 ? 125 : 100;
      for (const walls of [false, true]) {
        for (const loss of [false, true]) {
          const f = base + (walls ? 0 : -25) + (loss ? 25 : -25);
          expected[`${shots}${walls}${loss}`] = f;
          expect(pointFactor({ enemyShots: shots, wallsKill: walls, weaponLoss: loss })).toBe(f);
        }
      }
    }
    expect(expected["1truetrue"]).toBe(150);
    expect(expected["0falsefalse"]).toBe(25);
  });

  test("Standard = 1,0 und passt zu DEFAULT_OPTIONS der Simulation", () => {
    expect(pointFactor(DEFAULT_CONFIG)).toBe(100);
    expect(simOptionsFor(DEFAULT_CONFIG)).toEqual(DEFAULT_OPTIONS);
  });

  test("SimOptions übernehmen Faktor und Unverwundbarkeit", () => {
    const o = simOptionsFor(cfg({ enemyShots: 1, wallsKill: true }), true);
    expect(o).toEqual({
      enemyShots: 1,
      wallsKill: true,
      weaponLoss: true,
      scoreFactor: 150,
      invincible: true,
    });
  });

  test("Anzeige wie VB Str(Double) je Sprache, Hinweis ab 1,25", () => {
    expect(formatFactor(125, true)).toBe("1,25");
    expect(formatFactor(125, false)).toBe("1.25");
    expect(formatFactor(100, true)).toBe("1");
    expect(formatFactor(50, false)).toBe("0.5");
    expect(showsUnlockHint(125)).toBe(true);
    expect(showsUnlockHint(100)).toBe(false);
  });
});

describe("Freischalten und Levelauswahl", () => {
  test("nur mit Faktor > 1,0, ohne Cheat, bis Level 10", () => {
    expect(unlockAfter(cfg(), 1, 100, false)).toBeUndefined();
    expect(unlockAfter(cfg(), 1, 125, true)).toBeUndefined();
    expect(unlockAfter(cfg(), 1, 125, false)?.unlocked).toEqual([2]);
    expect(unlockAfter(cfg({ unlocked: [2] }), 1, 125, false)).toBeUndefined();
    expect(unlockAfter(cfg({ unlocked: [5] }), 2, 150, false)?.unlocked).toEqual([3, 5]);
    expect(unlockAfter(cfg(), 9, 125, false)?.unlocked).toEqual([10]);
    expect(unlockAfter(cfg(), 10, 125, false)).toBeUndefined();
    expect(unlockAfter(cfg(), 11, 125, false)).toBeUndefined();
    expect(unlockAfter(cfg(), 0, 125, false)).toBeUndefined();
  });

  test("Levelauswahl erst mit Freischaltung; Level 1 immer wählbar", () => {
    expect(hasLevelSelect(cfg())).toBe(false);
    expect(hasLevelSelect(cfg({ unlocked: [3] }))).toBe(true);
    expect(selectableLevels(cfg({ unlocked: [3, 2] }))).toEqual([1, 2, 3]);
  });

  test("Konfiguration: Rundreise und robuste Fehlerbehandlung", () => {
    const c = cfg({ enemyShots: 0, wallsKill: true, weaponLoss: false, unlocked: [2, 4] });
    expect(parseConfig(serializeConfig(c))).toEqual(c);
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("kaputt{")).toEqual(DEFAULT_CONFIG);
    expect(
      parseConfig(JSON.stringify({ enemyShots: 7, wallsKill: "ja", unlocked: [4, 4, 11, 0, 2] })),
    ).toEqual({ ...DEFAULT_CONFIG, unlocked: [2, 4] });
  });
});

describe("Levelnamen und Get Ready", () => {
  test("Namen aus 0x45D934, Extralevel ab 11", () => {
    expect(levelName(0)).toBe("Tutorial");
    expect(levelName(3)).toBe("Deep Blue See");
    expect(levelName(10)).toBe("Final Fight");
    expect(levelName(11)).toBe("ExtraLevel 1");
    expect(levelName(19)).toBe("ExtraLevel 9");
  });

  test("Vorschaubilder", () => {
    expect(previewImage(0)).toBe("image/0");
    expect(previewImage(10)).toBe("image/10");
    expect(previewImage(11)).toBe("image/extralevel");
  });
});

describe("Highscore", () => {
  test("Standardliste: Plätze 1, 2, 9 fest, Namen 3–8 gemischt, Punkte unverändert", () => {
    const list = defaultHighscores(new VbRnd());
    expect(list.map((e) => e.score)).toEqual([
      100000, 80000, 60000, 50000, 40000, 30000, 20000, 15000, 10000,
    ]);
    expect(list.map((e) => e.name)).toEqual([
      "David Lee",
      "Kauto",
      "MaKo",
      "XPiRE",
      "Pickel",
      "xenion",
      "HiBri",
      "Manuel Kempf",
      "Toxeen",
    ]);
    const other = defaultHighscores(new VbRnd(12345));
    expect(other[0]!.name).toBe("David Lee");
    expect(other[1]!.name).toBe("Kauto");
    expect(other[8]!.name).toBe("Toxeen");
    expect(
      other
        .slice(2, 8)
        .map((e) => e.name)
        .toSorted(),
    ).toEqual(["HiBri", "MaKo", "Manuel Kempf", "Pickel", "XPiRE", "xenion"]);
  });

  test("Platz: kleinster Platz, der echt übertroffen wird", () => {
    const list = defaultHighscores(new VbRnd());
    expect(rankFor(list, 100001)).toBe(1);
    expect(rankFor(list, 100000)).toBe(2);
    expect(rankFor(list, 42000)).toBe(5);
    expect(rankFor(list, 10001)).toBe(9);
    expect(rankFor(list, 10000)).toBe(0);
    expect(rankFor(list, 0)).toBe(0);
  });

  test("Einfügen verdrängt den letzten Eintrag", () => {
    const list = defaultHighscores(new VbRnd());
    const out = insertHighscore(list, 2, "Katha", 90000);
    expect(out).toHaveLength(HIGHSCORE_SIZE);
    expect(out[1]).toEqual({ name: "Katha", score: 90000 });
    expect(out[2]).toEqual(list[1]);
    expect(out[8]).toEqual(list[7]);
    expect(insertHighscore(list, 9, "", 11000)[8]).toEqual({ name: DEFAULT_NAME, score: 11000 });
  });

  test("Namen: leer → David Lee, höchstens 20 Zeichen", () => {
    expect(cleanName("   ")).toBe(DEFAULT_NAME);
    expect(cleanName("abcdefghijklmnopqrstuvwxyz")).toBe("abcdefghijklmnopqrst");
  });

  test("Ordinalendungen", () => {
    expect([1, 2, 3, 4, 9].map(rankSuffix)).toEqual(["st", "nd", "rd", "th", "th"]);
  });

  test("Speicher: Rundreise, ungültig → undefined", () => {
    const list = defaultHighscores(new VbRnd(7));
    expect(parseHighscores(serializeHighscores(list))).toEqual(list);
    expect(parseHighscores(null)).toBeUndefined();
    expect(parseHighscores("[]")).toBeUndefined();
    expect(parseHighscores("{")).toBeUndefined();
    expect(
      parseHighscores(JSON.stringify(list.map((e) => ({ ...e, score: "1" })))),
    ).toBeUndefined();
  });
});

const introKey = (t: number, x: number, lerp: number, more: object = {}) => ({
  t,
  visible: true,
  x,
  y: 100,
  lerp,
  scale: 100,
  frame0: 0,
  frames: 0,
  ticksPerFrame: 5,
  ...more,
});

describe("Intro-Keyframes (PlayIntro)", () => {
  test("unsichtbar vor dem ersten Keyframe und bei visible = false", () => {
    const obj: IntroObject = {
      sprite: 1,
      keys: [introKey(10, 0, 0), { ...introKey(20, 0, 0), visible: false }],
    };
    expect(introSpriteAt(obj, 9)).toBeUndefined();
    expect(introSpriteAt(obj, 10)).toEqual({ x: 0, y: 100, scale: 100, frame: 0 });
    expect(introSpriteAt(obj, 25)).toBeUndefined();
  });

  test("lerp = −1 interpoliert x, y und Skala, sonst Sprung", () => {
    const obj: IntroObject = {
      sprite: 1,
      keys: [introKey(0, 500, -1, { scale: 0, y: 400 }), introKey(80, 100, 0, { y: 0 })],
    };
    expect(introSpriteAt(obj, 20)).toEqual({ x: 400, y: 300, scale: 25, frame: 0 });
    expect(introSpriteAt(obj, 80)).toEqual({ x: 100, y: 0, scale: 100, frame: 0 });
    expect(introSpriteAt(obj, 500)).toEqual({ x: 100, y: 0, scale: 100, frame: 0 });
    const hold: IntroObject = { sprite: 1, keys: [introKey(0, 500, 0), introKey(80, 100, 0)] };
    expect(introSpriteAt(hold, 79)?.x).toBe(500);
  });

  test("Animation frame0 + ⌊Δt / ticksPerFrame⌋ mod (frames + 1)", () => {
    const obj: IntroObject = {
      sprite: 9,
      keys: [introKey(1520, 270, -1, { frames: 3, ticksPerFrame: 2 })],
    };
    expect([1520, 1521, 1522, 1524, 1526, 1528].map((t) => introSpriteAt(obj, t)?.frame)).toEqual([
      0, 0, 1, 2, 3, 0,
    ]);
  });

  test("VB-Rundung zur geraden Zahl", () => {
    expect([0.5, 1.5, 2.5, -1.5, 2.4, 2.6].map(vbRound)).toEqual([0, 2, 2, -2, 2, 3]);
  });

  test("echte intro.dat: Erde wächst in Szene 0 aus dem Nichts", async () => {
    const intro = await (await assets()).json<DoveIntro>("data/intro");
    const scene = intro.scenes[0]!;
    expect(scene.duration).toBe(2100);
    const earth = scene.objects.find((o) => scene.rects[o.sprite - 1]?.name === "Erde")!;
    expect(introSpriteAt(earth, 0)).toEqual({ x: 500, y: 400, scale: 0, frame: 0 });
    expect(introSpriteAt(earth, 81)).toEqual({ x: 210, y: 130, scale: 100, frame: 0 });
    const used = intro.scenes.filter((s) => s.duration > 0).map((s) => s.background);
    expect(used).toEqual(["background1.spr", "intro2.spr", "background1.spr"]);
  });
});

describe("Tastenflanken", () => {
  test("beim Start gehaltene Tasten lösen erst nach dem Loslassen aus", () => {
    const down = new Set(["Enter"]);
    const k = new KeyEdges({ isDown: (c) => down.has(c) });
    k.sample();
    expect(k.hit("confirm")).toBe(false);
    expect(k.held("confirm")).toBe(true);
    down.delete("Enter");
    k.sample();
    down.add("Enter");
    k.sample();
    expect(k.hit("confirm")).toBe(true);
    k.sample();
    expect(k.hit("confirm")).toBe(false);
  });
});
