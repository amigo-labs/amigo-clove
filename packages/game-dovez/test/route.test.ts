/**
 * Routen-Interpreter gegen kleine, handgeschriebene Programme.
 * Die Prüfungen gegen die Routen der Originallevel sind entfallen,
 * da die Originale nicht mehr im Repo liegen.
 */
import { describe, expect, test } from "bun:test";
import { type DovezRoute } from "@clove/formats";
import { VAR, newRouteActor, stepRoute, type RouteEffect, type RouteHost } from "../src/sim/route";
import { VbRnd, cint } from "../src/sim/vb";

function host(effects: RouteEffect[] = []): RouteHost & { tick: number } {
  return {
    tick: 0,
    playersMinus1: 0,
    players: [{ x: 100, y: 275 }],
    playerA8: 0,
    globals: [],
    rnd: new VbRnd(),
    hitsLandscape: () => false,
    partDestroyed: () => false,
    effect: (e) => effects.push(e),
  };
}

interface Run {
  readonly path: [number, number][];
  readonly dead: boolean;
}

function run(route: DovezRoute, ticks: number, x = 800, y = 275, speed = 2): Run {
  const h = host();
  const a = newRouteActor({ x, y, speed, hp: 100, width: 40, height: 40, spawnTick: 0 });
  const path: [number, number][] = [];
  for (let t = 0; t < ticks; t++) {
    h.tick++;
    const dead = stepRoute(route, a, h);
    path.push([a.x, a.y]);
    if (dead) return { path, dead: true };
  }
  return { path, dead: false };
}

/** Literal- und Variablenargumente wie im Level-Skript: Wert = Var(a) + Var(b). */
const lit = (a: number, b = 0) => ({ a, b });
const prog = (...ops: [number, ...{ a: number; b: number }[]][]): DovezRoute => ({
  name: "test",
  ops: ops.map(([op, ...args]) => ({ op, args })),
});

describe("Routen-Interpreter", () => {
  test("MoveTo zielt einmal, rastet am Ziel ein; Wait wartet n Ticks", () => {
    const r = run(
      prog([0, lit(0), lit(0)], [2, lit(10), lit(0)], [5, lit(3)], [1, lit(10), lit(20)]),
      100,
      0,
      0,
      4,
    );
    expect(r.path.slice(0, 7)).toEqual([
      [0, 0],
      [4, 0],
      [8, 0],
      [10, 0],
      [10, 0],
      [10, 0],
      [10, 0],
    ]);
    expect(r.dead).toBe(true);
    expect(r.path.at(-1)).toEqual([10, 20]);
  });

  test("Variablen: Set, If/Else, For/Next, Label/Goto", () => {
    const L0 = VAR.local0;
    const L1 = VAR.local0 - 1;
    // For L0 = 1 To 5: L1 = L1 + L0 · Next; If L1 >= 15 → x = 1 Else x = 2
    const p = prog(
      [35, lit(L0), lit(1), lit(5), lit(1)],
      [9, lit(L1), lit(L1, L0)],
      [36],
      [13, lit(L1), lit(1), lit(15)],
      [0, lit(1), lit(0)],
      [14],
      [0, lit(2), lit(0)],
      [15],
      [11, lit(7)],
      [5, lit(1)],
      [12, lit(7)],
    );
    const h = host();
    const a = newRouteActor({ x: 0, y: 0, speed: 1, hp: 1, width: 1, height: 1, spawnTick: 0 });
    expect(stepRoute(p, a, h)).toBe(false);
    expect(a.locals[1]).toBe(15);
    expect(a.x).toBe(1);
    // SetPos gibt nach; danach Else → hinter EndIf, Label, Wait 1 (ein Tick), Goto zurück
    for (let i = 0; i < 5; i++) {
      expect(stepRoute(p, a, h)).toBe(false);
      expect(a.ip).toBe(10);
    }
    expect(a.x).toBe(1);
  });

  test("Endlosschleife ohne Nachgeben beendet die Route; Effekte werden gemeldet", () => {
    const effects: RouteEffect[] = [];
    const h = host(effects);
    const a = newRouteActor({ x: 0, y: 0, speed: 1, hp: 1, width: 1, height: 1, spawnTick: 0 });
    expect(stepRoute(prog([29, lit(3), lit(1)], [11, lit(0)], [12, lit(0)]), a, h)).toBe(true);
    expect(effects).toEqual([{ op: 29, args: [3, 1] }]);
  });

  test("CInt rundet halbe Werte zur geraden Zahl", () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map(cint)).toEqual([0, 2, 2, -0, -2, 2, 3]);
  });
});
