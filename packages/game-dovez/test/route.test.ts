/**
 * Routen-Interpreter gegen die Routen aller 27 Level und gegen kleine,
 * handgeschriebene Programme.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  parseDovezLevelDat,
  readContainer,
  type DovezLevel,
  type DovezRoute,
} from "@clove/formats";
import { VAR, newRouteActor, stepRoute, type RouteEffect, type RouteHost } from "../src/sim/route";
import { VbRnd, cint } from "../src/sim/vb";

const DATA = join(import.meta.dir, "../../../original-dovez/Data");
const levels = new Map<string, DovezLevel>();
for (const file of readdirSync(DATA).filter((f) => f.endsWith(".dlp"))) {
  const bytes = new Uint8Array(await Bun.file(join(DATA, file)).arrayBuffer());
  const dat = readContainer(bytes, (b) => new Uint8Array(inflateSync(b))).find((e) =>
    e.name.toLowerCase().endsWith(".dat"),
  )!;
  levels.set(file.replace(/\.dlp$/, ""), parseDovezLevelDat(dat.data));
}

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

function named(level: string, name: string): DovezRoute {
  const r = levels.get(level)!.routes.find((x) => x.name === name);
  if (!r) throw new Error(`${level}: Route ${name} fehlt`);
  return r;
}

/** Literal- und Variablenargumente wie im Level-Skript: Wert = Var(a) + Var(b). */
const lit = (a: number, b = 0) => ({ a, b });
const prog = (...ops: [number, ...{ a: number; b: number }[]][]): DovezRoute => ({
  name: "test",
  ops: ops.map(([op, ...args]) => ({ op, args })),
});

describe("Routen-Interpreter", () => {
  test("alle 519 Routen laufen 3000 Ticks ohne Ausnahme", () => {
    let n = 0;
    let ended = 0;
    for (const l of levels.values()) {
      for (const r of l.routes) {
        if (run(r, 3000).dead) ended++;
        n++;
      }
    }
    expect(n).toBe(519);
    console.log(`Routen: ${ended}/${n} enden oder sterben binnen 3000 Ticks`);
    expect(ended).toBeGreaterThan(350);
  });

  test("Referenzpfade: Prüfsumme aller Positionen (600 Ticks, bitgenau zum Python-Referenzsimulator)", () => {
    // Abgeglichen mit dem Python-Simulator aus der Analyse (519/519 bitgleich);
    // ändert sich die Zahl, hat sich die Semantik geändert.
    const bits = new Uint32Array(new Float32Array(1).buffer);
    const f = new Float32Array(bits.buffer);
    let hash = 0x811c9dc5;
    for (const name of [...levels.keys()].toSorted()) {
      for (const r of levels.get(name)!.routes) {
        for (const [x, y] of run(r, 600).path) {
          for (const v of [x, y]) {
            f[0] = v;
            hash = Math.imul(hash ^ (bits[0] as number), 0x01000193) >>> 0;
          }
        }
      }
    }
    expect(hash.toString(16)).toBe(ROUTE_HASH);
  });

  test("„Rechts nach Links“: vom rechten Rand bis −Breite, dann tot", () => {
    const r = run(named("Level Bleistift", "Rechts nach Links"), 2000);
    expect(r.path[0]).toEqual([800, 275]);
    expect(r.dead).toBe(true);
    expect(r.path.at(-1)).toEqual([-40, 275]);
  });

  test("„Zecken_von_oben“ kommt von oben, verlässt unten", () => {
    const r = run(named("Level1-1 Skyfight", "Zecken_von_oben"), 2000);
    expect(r.path[0]![1]).toBeLessThan(0);
    expect(r.dead).toBe(true);
    expect(r.path.at(-1)![1]).toBe(550);
  });

  test("„Einkreisen“ spiralt auf den Spieler zu", () => {
    const r = run(named("Level1-1 Skyfight", "Einkreisen"), 2000);
    const [x, y] = r.path.at(-1)!;
    expect(Math.hypot(x - 100, y - 275)).toBeLessThan(20);
  });

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

const ROUTE_HASH = "bd5cd484";
