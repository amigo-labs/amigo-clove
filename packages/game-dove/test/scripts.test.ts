import { describe, expect, test } from "bun:test";
import { Input, restartAtCheckpoint, step, type World } from "../src/sim";
import { newWorld, tinyLevel } from "./helpers";

async function at(level: number, tick: number, options = {}): Promise<World> {
  const w = await newWorld(level, 1, options);
  w.checkpoint = tick;
  restartAtCheckpoint(w);
  return w;
}

describe("Levelskripte", () => {
  test("Tutorial: ohne Treffer bei Tick 420 zurück zu 50 mit Wiederholungstext", async () => {
    const w = await at(0, 419);
    step(w, 0);
    step(w, 0);
    expect(w.scriptText).toBe(4);
    expect(w.tick).toBeLessThan(60);
  });

  test("Tutorial: Beam-Übung wiederholt sich, bis der Beam voll ist", async () => {
    const w = await at(0, 2790, { invincible: true });
    for (let t = 0; t < 20; t++) step(w, 0);
    expect(w.tick).toBeLessThan(2799); // auf 2651 zurückgesetzt
    const v = await at(0, 2700, { invincible: true });
    for (let t = 0; t < 250 && v.tick < 2800; t++) step(v, Input.Beam);
    expect(v.tick).toBeGreaterThanOrEqual(2800);
  });

  test("Level 6: alle 25 Ticks eine schnelle Decke (vx −10)", async () => {
    const w = await at(6, 99, { invincible: true });
    step(w, 0);
    step(w, 0);
    const slot = w.scriptC[0]!;
    expect(w.tiles.active[slot]).toBe(1);
    expect(w.tileVX[slot]).toBe(-10);
    // Warp-Tempo 9 ab Levelstart (und an den Checkpoints 1882, 3000, 5122, …)
    const start = await at(6, 0, { invincible: true });
    step(start, 0);
    expect(start.bgSpeed).toBe(9 * 65536);
  });

  test("Level 7: ein Band verlangsamt das Schiff", async () => {
    const w = await at(7, 0, { invincible: true });
    const speed = w.speed;
    for (let t = 0; t < 120; t++) step(w, 0);
    expect(w.speed).toBeLessThan(speed);
    expect(w.scriptText).toBe(16);
  });

  test("Level 8: Windzonen erscheinen zu ihren Ticks", async () => {
    const w = await at(8, 4354, { invincible: true });
    step(w, 0);
    step(w, 0);
    const i = w.winds.active.indexOf(1);
    expect([w.windS[i], w.windW[i]]).toEqual([2, 143]);
  });

  test("Wind: liegt pX+20 in der Zone, gilt pY += Stärke (innerhalb 0…410)", () => {
    const w = tinyLevel([]);
    const i = w.winds.alloc();
    w.windX[i] = 100;
    w.windW[i] = 143;
    w.windS[i] = -2;
    step(w, 0);
    expect(w.py).toBe(98);
    w.px = 300; // pX+20 = 320 außerhalb der Zone (x läuft mit 1 px/Tick)
    step(w, 0);
    expect(w.py).toBe(98);
  });

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
    "Level %i läuft 4000 Ticks ohne Fehler",
    async (n) => {
      const w = await newWorld(n, 3, { invincible: true });
      for (let t = 0; t < 4000; t++)
        step(w, Input.Fire | (Math.floor(t / 80) % 2 ? Input.Up : Input.Down));
      expect(w.tick).toBeGreaterThan(0);
    },
  );
});
