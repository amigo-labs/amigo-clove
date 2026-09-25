import { describe, expect, test } from "bun:test";
import { fxFromInt } from "@clove/core";
import { SPAWN_KIND } from "@clove/formats";
import { Input, step, type World } from "../src/sim";
import { tinyLevel } from "./helpers";

const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);

/** Extra der Art `art` direkt vor das Schiff legen und einsammeln. */
function collect(w: World, art: number): void {
  const i = w.extras.alloc();
  w.extraArt[i] = art;
  w.extraX[i] = w.px + 10;
  w.extraY[i] = w.py;
  w.extraFrame[i] = 0;
  w.extraAnim[i] = 0;
  step(w, 0);
}

describe("Extras", () => {
  test("gleiche Farbe steigert die Stufe (max. 2), andere Farbe beginnt bei 0", () => {
    const w = tinyLevel([]);
    collect(w, 3);
    expect([w.colour, w.stage]).toEqual([3, 0]);
    collect(w, 3);
    collect(w, 3);
    collect(w, 3);
    expect([w.colour, w.stage]).toEqual([3, 2]);
    collect(w, 1);
    expect([w.colour, w.stage]).toEqual([1, 0]);
    expect(w.score).toBe(5 * 300);
  });

  test("Option bis 2, Bombe dauerhaft, Schild 500 Ticks", () => {
    const w = tinyLevel([]);
    collect(w, 0);
    collect(w, 0);
    collect(w, 0);
    expect(w.optionCount).toBe(2);
    collect(w, -1);
    expect(w.bomb).toBe(1);
    collect(w, -2);
    expect(w.shield).toBe(499); // im Aufnahmetick schon einmal heruntergezählt
  });

  test("Aufnahmebox: X+40 ≥ ex, X ≤ ex+20, Y+22 ≥ ey, Y ≤ ey+21", () => {
    const w = tinyLevel([]);
    const i = w.extras.alloc();
    w.extraArt[i] = 0;
    w.extraX[i] = w.px + 41 + 1; // nach dem Scrollen (−1) genau X+41: knapp daneben
    w.extraY[i] = w.py;
    step(w, 0);
    expect(w.optionCount).toBe(0);
    step(w, 0); // jetzt X+40
    expect(w.optionCount).toBe(1);
  });
});

describe("Farbwaffen", () => {
  test("rote Streuung: Stufe 0 = 3 Schüsse alle 13 Ticks, fächerförmig", () => {
    const w = tinyLevel([]);
    w.colour = 3;
    const vy = new Set<number>();
    let volleys = 0;
    for (let t = 0; t < 40; t++) {
      step(w, Input.Fire);
      for (let i = 0; i < w.shots.capacity; i++) {
        if (w.shots.active[i] && w.shotType[i] === 3) vy.add(w.shotVY[i]!);
      }
      if (w.sounds.includes(14)) volleys++;
      w.sounds.length = 0;
    }
    expect([...vy].toSorted((a, b) => a - b)).toEqual([-2, 0, 2]);
    expect(volleys).toBe(3); // Tick 1, 14, 27
  });

  test("Waffenausrichtung: D kehrt um, 80 Ticks bis hinten; dazwischen feuert die Farbwaffe nicht", () => {
    const w = tinyLevel([]);
    w.colour = 3;
    step(w, Input.Swap);
    expect(w.podDir).toBe(-1);
    for (let t = 0; t < 30; t++) step(w, 0);
    const before = count(w.shots.active);
    for (let t = 0; t < 20; t++) step(w, Input.Fire);
    // nur Basisschüsse, keine roten
    for (let i = 0; i < w.shots.capacity; i++) if (w.shots.active[i]) expect(w.shotType[i]).toBe(0);
    expect(count(w.shots.active)).toBeGreaterThan(before);
    for (let t = 0; t < 40; t++) step(w, 0);
    expect(w.pod).toBe(0);
    step(w, Input.Fire);
    const rear = [...w.shots.active.keys()].filter((i) => w.shots.active[i] && w.shotType[i] === 3);
    expect(rear.length).toBe(4); // 3 Fächer + 1 gerader Schuss mit Schaden 40
    expect(rear.every((i) => w.shotVX[i]! < 0)).toBe(true);
  });

  test("grüner Ball teilt sich am Gegner in zwei kleinere", () => {
    const w = tinyLevel([
      [0, 1, 1, 0],
      [0, SPAWN_KIND, 100, 0],
    ]);
    w.colour = 2;
    w.stage = 2;
    w.pod = 80;
    // Gegner steht still vor dem Schiff
    step(w, 0);
    const e = w.enemies.active.indexOf(1);
    w.enVX[e] = 0;
    w.enX[e] = fxFromInt(200);
    w.enY[e] = fxFromInt(96);
    w.enHP[e] = 100_000;
    let split = false;
    for (let t = 0; t < 30 && !split; t++) {
      step(w, t === 0 ? Input.Fire : 0);
      const sizes = [...w.shots.active.keys()]
        .filter((i) => w.shots.active[i] && w.shotType[i] === 2)
        .map((i) => w.shotSize[i]);
      split = sizes.length === 2 && sizes.every((s) => s === 2);
    }
    expect(split).toBe(true);
  });

  test("blauer Laser: zwei Strahlen à 2L+1 Zeilen bis zur Wand", () => {
    const w = tinyLevel([[0, 0, 1, 90]]); // Tile 30×20 bei y 90
    w.colour = 1;
    w.stage = 1;
    step(w, Input.Fire);
    expect(w.laserRows).toBe(6);
    // Zeilen Y+4±1 = 103…105 liegen im Tile (90…110) → Ende an dessen linker Kante
    const row = [...w.laserY.subarray(0, 6)].indexOf(104);
    expect(w.laserTo[row]).toBe(w.tileX[w.tiles.active.indexOf(1)]);
    expect(w.laserFrom[row]).toBe(w.px + 42);
  });

  test("Bombe fällt mit 8 px/Tick senkrecht", () => {
    const w = tinyLevel([]);
    w.bomb = 1;
    step(w, 0); // Tick 0: kein Timer ist < F4
    step(w, Input.Fire);
    const b = [...w.shots.active.keys()].find((i) => w.shots.active[i] && w.shotType[i] === 1)!;
    expect([w.shotX[b], w.shotY[b]]).toEqual([w.px + 15, w.py + 25]);
    const x = w.shotX[b];
    step(w, 0);
    expect([w.shotX[b], w.shotY[b]]).toEqual([x, w.py + 33]);
  });
});

describe("Beam", () => {
  test("volle Ladung (200) ergibt den durchdringenden Beam", () => {
    const w = tinyLevel([]);
    for (let t = 0; t < 250; t++) step(w, Input.Beam);
    expect(w.charge).toBe(200);
    step(w, 0);
    expect(w.beam).toBe(4);
    expect(w.beamX).toBe(w.px + 40);
    expect(w.beamDamage).toBe(500);
  });

  test("Teilladung: Schaden = Ladung + Bonus; Feuer während des Ladens löst aus", () => {
    const w = tinyLevel([]);
    for (let t = 0; t < 50; t++) step(w, Input.Beam);
    step(w, Input.Beam | Input.Fire);
    expect(w.beam).toBe(1);
    // Im Auslösetick wird zuerst noch geladen (51), dann ausgelöst.
    expect(w.beamDamage).toBe(51 + 15);
    expect(w.charge).toBe(0);
  });
});

describe("Options und Schild", () => {
  test("zwei Options gegenüber auf der 40×30-Ellipse, 5° pro Tick", () => {
    const w = tinyLevel([]);
    w.optionCount = 2;
    step(w, 0);
    expect(w.orbitAngle).toBe(5);
    expect(w.orbCount).toBe(2);
    // x = X+17 ± 40·cos 5°, y = Y+10 ± 30·sin 5°
    expect([w.orbX[0], w.orbY[0]]).toEqual([w.px + 17 + 40, w.py + 10 + 3]);
    expect([w.orbX[1], w.orbY[1]]).toEqual([w.px + 17 - 40, w.py + 10 - 3]);
  });

  test("Tod mit Waffenverlust nimmt Farbe, Stufe, Options und Bombe", () => {
    const w = tinyLevel([]);
    Object.assign(w, { colour: 2, stage: 2, optionCount: 2, bomb: 1, dead: 1, deathCounter: 204 });
    step(w, 0);
    expect([w.colour, w.stage, w.optionCount, w.bomb]).toEqual([0, 0, 0, 0]);
    const keep = tinyLevel([], { weaponLoss: false });
    Object.assign(keep, { colour: 2, stage: 2, dead: 1, deathCounter: 204 });
    step(keep, 0);
    expect([keep.colour, keep.stage]).toEqual([2, 2]);
  });
});
