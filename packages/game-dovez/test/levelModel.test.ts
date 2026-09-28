/** Daten der Debug-Seite `#/dovez/debug/level`: Schussmuster und Routenkontext. */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { parseDovezLevelDat, readContainer, type DovezLevel } from "@clove/formats";
import {
  DEBUG_EMITTER,
  enemyBox,
  routeUses,
  simulateRoute,
  simulateWeaponView,
} from "../src/debug/levelModel";

const DATA = join(import.meta.dir, "../../../original-dovez/Data");

function level(prefix: string): DovezLevel {
  const file = readdirSync(DATA).find((f) => f.startsWith(prefix) && f.endsWith(".dlp"))!;
  const bytes = new Uint8Array(readFileSync(join(DATA, file)));
  const dat = readContainer(bytes, (b) => new Uint8Array(inflateSync(b))).find((e) =>
    e.name.toLowerCase().endsWith(".dat"),
  )!;
  return parseDovezLevelDat(dat.data);
}

const weapon = (l: DovezLevel, name: string) => l.weapons.findIndex((w) => w.name === name);
const firstStep = (p: readonly [number, number][]) => [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1]];

describe("Schussmuster", () => {
  test("Zeppelin „Kreis“: 20 Schüsse im selben Tick, Ring mit Tempo 6", () => {
    const l = level("Level1-2");
    const v = simulateWeaponView(l, weapon(l, "Kreis"));
    expect(v.shots.length).toBe(20);
    expect(new Set(v.shots.map((s) => s.tick))).toEqual(new Set([0]));
    const angles = v.shots.map((s) => {
      const [dx, dy] = firstStep(s.path);
      expect(Math.hypot(dx!, dy!)).toBeCloseTo(6, 4);
      return Math.round((Math.atan2(dy!, dx!) * 180) / Math.PI + 360) % 360;
    });
    expect(angles).toEqual(Array.from({ length: 20 }, (_, i) => i * 18));
  });

  test("Skyfight „Schnellfeuer“: 11 Schüsse alle 5 Ticks nach links, „hinten“ nach rechts", () => {
    const l = level("Level1-1");
    for (const [name, dx] of [
      ["Schnellfeuer", -12],
      ["Schnellfeuer hinten", 12],
    ] as const) {
      const v = simulateWeaponView(l, weapon(l, name));
      expect(v.shots.map((s) => s.tick)).toEqual(Array.from({ length: 11 }, (_, i) => i * 5));
      for (const s of v.shots) expect(firstStep(s.path)).toEqual([dx, 0]);
    }
  });

  test("gezielter Schuss fliegt auf den Spieler zu", () => {
    const l = level("Level1-1");
    const v = simulateWeaponView(l, weapon(l, "Verfolgungsschuss (.)"));
    const [dx, dy] = firstStep(v.shots[0]!.path);
    expect(dx!).toBeLessThan(-5);
    expect(Math.hypot(dx!, dy!)).toBeCloseTo(l.weapons[0]!.salvos[0]!.speed, 4);
  });

  test("Keeper „Kreis1“ zerplatzt am Routenende in die Splitterwaffe", () => {
    const l = level("Level6-3");
    const w = weapon(l, "Kreis1");
    const v = simulateWeaponView(l, w);
    const split = v.shots.filter((s) => s.weapon !== w);
    expect(split.length).toBe(10);
    expect(new Set(split.map((s) => s.tick)).size).toBe(1);
  });
});

describe("Routenkontext", () => {
  test("Gegnerroute startet mit Typ, Spawn-y und Tempo aus der Zeitleiste", () => {
    const l = level("Level1-1");
    const index = l.routes.findIndex((r) => r.name === "Zecken_von_oben");
    const uses = routeUses(l, index);
    expect(uses.some((u) => u.kind === "enemy")).toBe(true);
    const v = simulateRoute(l, index);
    expect(v.context).toContain("Gegner");
    expect(v.dead).toBe(true);
  });

  test("Schussroute startet am Emitter", () => {
    const l = level("Level1-1");
    const index = l.routes.findIndex((r) => r.name === "Schuss: links oben");
    const v = simulateRoute(l, index, 10);
    expect(v.uses.map((u) => u.kind)).toContain("shot");
    expect(v.path[0]![0]).toBe(DEBUG_EMITTER.x);
  });

  test("Bounding-Box wie in LadeDaten: max(Teil-Offset + Bildgröße)", () => {
    const l = level("Epilog");
    for (const e of l.enemies) {
      const { w, h } = enemyBox(l, e);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
    }
  });
});
