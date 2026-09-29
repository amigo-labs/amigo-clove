/** Osterei „LOV“ (`0x546C30`): Punkte, Herz, Glitzerregen, Text, `Rnd`-Verbrauch, Plasma. */
import { describe, expect, test } from "bun:test";
import {
  FADE_IN_TICKS,
  HEART_TICK,
  LoveLogic,
  NAME_ROWS,
  Plasma,
  RAIN_TICK,
  TEXT_MAX_GRAY,
  TEXT_TICK,
  heartTargets,
  namePoints,
} from "../src/game/love";
import { EnvList } from "../src/sim/envDraw";
import { COS_DEG, SIN_DEG, VbRnd, f32 } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

/** `VbRnd`, dessen `next` mitgezählt wird. */
function counted(seed?: number): { rnd: VbRnd; draws: () => number } {
  const rnd = new VbRnd(seed);
  let n = 0;
  const next = rnd.next.bind(rnd);
  rnd.next = () => {
    n++;
    return next();
  };
  return { rnd, draws: () => n };
}

/** Züge, die `f` verbraucht. */
function drawsOf(c: { draws: () => number }, f: () => void): number {
  const before = c.draws();
  f();
  return c.draws() - before;
}

describe("Schriftzug JULIA", () => {
  test("44 Punkte, zeilenweise, Ziele 32 · Spalte + 10 / 32 · Zeile + 180", () => {
    const pts = namePoints(new VbRnd());
    expect(pts.length).toBe(44);
    const dots = NAME_ROWS.map((r) => [...r].filter((c) => c === ".").length);
    expect(dots).toEqual([9, 7, 10, 8, 10]);
    expect(pts.slice(0, 5).map((p) => [p.tx, p.ty])).toEqual([
      [42, 180],
      [74, 180],
      [106, 180],
      [138, 180],
      [202, 180],
    ]);
    // letzter Punkt: Zeile 4, Spalte 21
    expect(pts.at(-1)).toMatchObject({ tx: 21 * 32 + 10, ty: 4 * 32 + 180 });
  });

  test("2 Rnd je Punkt: erst x = Rnd · 1032 − 132, dann y = Rnd · 832 − 132", () => {
    const c = counted();
    const pts = namePoints(c.rnd);
    expect(c.draws()).toBe(88);
    const ref = new VbRnd();
    for (const p of pts) {
      expect(p.x).toBe(f32(ref.next() * 1032 - 132));
      expect(p.y).toBe(f32(ref.next() * 832 - 132));
      expect(p.vx).toBe(0);
      expect(p.vy).toBe(0);
    }
  });

  test("Herz: 24 Ziele, spaltenweise (Spalte außen, Zeile innen), 16 · Spalte + 300 / 16 · Zeile + 250", () => {
    const h = heartTargets();
    expect(h.length).toBe(24);
    expect(h.slice(0, 4)).toEqual([
      { tx: 316, ty: 266 },
      { tx: 332, ty: 250 },
      { tx: 332, ty: 266 },
      { tx: 332, ty: 282 },
    ]);
    expect(h.at(-1)).toEqual({ tx: 428, ty: 266 });
  });
});

describe("Ablauf", () => {
  test("Rnd: 88 im Aufbau, 505 im ersten Durchlauf (Plasma), dann 0, ab 601 je 5", () => {
    const c = counted();
    const logic = new LoveLogic(c.rnd);
    expect(c.draws()).toBe(88);
    expect(drawsOf(c, () => logic.step(false))).toBe(505);
    for (let t = 2; t <= RAIN_TICK; t++) expect(drawsOf(c, () => logic.step(false))).toBe(0);
    expect(logic.t).toBe(RAIN_TICK);
    for (let t = RAIN_TICK + 1; t <= RAIN_TICK + 5; t++)
      expect(drawsOf(c, () => logic.step(false))).toBe(5);
  });

  test("Esc beendet am Kopf: kein Durchlauf, kein Rnd", () => {
    const c = counted();
    const logic = new LoveLogic(c.rnd);
    logic.step(false);
    const t = logic.t;
    expect(drawsOf(c, () => expect(logic.step(true)).toBe(false))).toBe(0);
    expect(logic.t).toBe(t);
  });

  test("Einblenden: Schwarz mit α (100 − t) / 100 in den ersten 99 Durchläufen", () => {
    const logic = new LoveLogic(new VbRnd());
    for (let t = 1; t <= FADE_IN_TICKS; t++) {
      logic.step(false);
      const first = logic.fg.cmds[0];
      if (t < FADE_IN_TICKS) {
        expect(first?.op === "strip" && first.key).toBe("weiss");
        const a = first?.op === "strip" ? first.v[0]!.a : -1;
        expect(a).toBe(f32((100 - t) / 100));
        expect(first?.op === "strip" && first.v[0]).toMatchObject({ r: 0, g: 0, b: 0 });
      } else expect(first?.op === "strip" && first.key).toBe("a_kreis2");
    }
  });

  test("Federn: erster Durchlauf rechnet Geschwindigkeit, Wackeln und Dämpfung wie das Original", () => {
    const logic = new LoveLogic(new VbRnd());
    const p = { ...logic.points[0]! };
    logic.step(false);
    let vx = f32((-p.x + p.tx) / 10);
    let vy = f32((-p.y + p.ty) / 8);
    const x = f32(p.x + vx + SIN_DEG[10]!);
    const y = f32(p.y + vy + COS_DEG[10]!);
    vx = f32(vx * 0.95);
    vy = f32(vy * 0.95);
    expect(logic.points[0]).toMatchObject({ x, y, vx, vy });
  });

  test("Zeichenbefehle: erst je Punkt rotes Leuchten, dann alle als Glitzer", () => {
    const logic = new LoveLogic(new VbRnd());
    for (let t = 1; t <= FADE_IN_TICKS; t++) logic.step(false);
    const keys = logic.fg.cmds.map((c) => (c.op === "strip" ? c.key : c.op));
    expect(keys).toEqual([...Array(44).fill("a_kreis2"), ...Array(44).fill("glitzer")]);
    const glow = logic.fg.cmds[0];
    expect(glow?.op === "strip" && glow.additive).toBe(true);
    expect(glow?.op === "strip" && glow.v[0]).toMatchObject({ r: 1, g: 0.2, b: 0.1, a: 0.7 });
    const star = logic.fg.cmds[44];
    expect(star?.op === "strip" && star.v[0]).toMatchObject({ r: 1, g: 1, b: 1, a: 0.2 });
  });

  test("die Punkte erreichen bis Durchlauf 399 ihr Ziel (Wackeln ±1 px)", () => {
    const logic = new LoveLogic(new VbRnd());
    for (let t = 1; t < HEART_TICK; t++) logic.step(false);
    for (const p of logic.points) {
      expect(Math.abs(p.x - p.tx)).toBeLessThan(3);
      expect(Math.abs(p.y - p.ty)).toBeLessThan(3);
    }
  });

  test("Durchlauf 400: die ersten 24 Punkte gehen zum Herzen, die übrigen 20 laufen nicht mehr", () => {
    const logic = new LoveLogic(new VbRnd());
    for (let t = 1; t < HEART_TICK; t++) logic.step(false);
    expect(logic.count).toBe(44);
    expect(logic.fg.cmds.length).toBe(88);
    const rest = logic.points.slice(24).map((p) => ({ ...p }));
    logic.step(false);
    expect(logic.count).toBe(24);
    expect(logic.fg.cmds.length).toBe(48);
    const goals = heartTargets();
    logic.points.slice(0, 24).forEach((p, i) => {
      expect(p.tx).toBe(goals[i]!.tx);
      expect(p.ty).toBe(goals[i]!.ty);
    });
    // Punkt 24 behält Ziel und Ort (er wird nicht mehr bewegt)
    expect(logic.points[24]).toEqual(rest[0]!);
    for (let t = 0; t < 200; t++) logic.step(false);
    for (const p of logic.points.slice(0, 24)) {
      expect(Math.abs(p.x - p.tx)).toBeLessThan(3);
      expect(Math.abs(p.y - p.ty)).toBeLessThan(3);
    }
    expect(logic.points[24]).toEqual(rest[0]!);
  });

  test("ab Durchlauf 601 je ein Glitzer (Art 14) aus den 5 Rnd", () => {
    const rnd = new VbRnd();
    const logic = new LoveLogic(rnd);
    for (let t = 1; t <= RAIN_TICK; t++) logic.step(false);
    expect(logic.fx.big.high).toBe(-1);
    expect(logic.fx.lists.big.quads.length).toBe(0);
    const ref = new VbRnd(rnd.seed);
    const calls: unknown[][] = [];
    const add = logic.fx.addBig.bind(logic.fx);
    logic.fx.addBig = (...a: Parameters<typeof add>) => {
      calls.push(a);
      return add(...a);
    };
    logic.step(false);
    const [r1, r2, r3, r4, r5] = [ref.next(), ref.next(), ref.next(), ref.next(), ref.next()];
    expect(calls).toEqual([
      [
        336,
        -128,
        r1 * 8 - 4,
        r2 * 10 + 5,
        1,
        r3 * 0.5 + 0.5,
        r4 * 0.2,
        128,
        0,
        50,
        14,
        r5 * 20 - 15,
      ],
    ]);
    // gezeichnet im selben Durchlauf: `glitzer`, additiv, mit α = Leben / Anfangsleben
    const q = logic.fx.lists.big.quads[0]!;
    expect(q).toMatchObject({ key: "glitzer", additive: true, rot: ((RAIN_TICK + 1) % 90) * 4 });
    expect(q.a).toBeCloseTo(49 / 50, 6);
    // nach 50 Durchläufen ist das Leben um
    for (let t = 0; t < 49; t++) logic.step(false);
    expect(logic.fx.big.items.filter((p) => p.active).length).toBe(49);
  });
});

describe("Text", () => {
  test("Grauwert 0 bis Durchlauf 750, dann +1 je Durchlauf bis 128", () => {
    const logic = new LoveLogic(new VbRnd());
    for (let t = 1; t <= TEXT_TICK; t++) {
      logic.step(false);
      expect(logic.textGray).toBe(0);
    }
    logic.step(false);
    expect(logic.textGray).toBe(1);
    for (let t = TEXT_TICK + 2; t <= TEXT_TICK + TEXT_MAX_GRAY + 20; t++) {
      logic.step(false);
      expect(logic.textGray).toBe(Math.min(t - TEXT_TICK, TEXT_MAX_GRAY));
    }
    expect(logic.textGray).toBe(128);
  });
});

describe("Plasma", () => {
  test("wie Modus 4 von SpielMoveHintergrund (Speicherbildschirm): Befehle und Rnd", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, {});
    w.enterSaveScreen();
    expect(w.background).toBe(4);
    const mine = new Plasma();
    const rnd = new VbRnd(0x1234);
    w.rnd.seed = 0x1234;
    for (let t = 0; t < 4; t++) {
      const out = new EnvList();
      mine.step(rnd, out);
      w.env.lists.bg.clear();
      w.env.moveBackground();
      expect(out.cmds).toEqual(w.env.lists.bg.cmds);
      expect(rnd.seed).toBe(w.rnd.seed);
    }
  });
});
