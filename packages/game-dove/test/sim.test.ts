import { describe, expect, test } from "bun:test";
import { fxFromInt } from "@clove/core";
import { SPAWN_KIND } from "@clove/formats";
import {
  Input,
  SHIP_MAX_Y,
  VbRnd,
  type World,
  contourHit,
  divRoundHalfEven,
  roundHalfEven,
  step,
} from "../src/sim";
import { newWorld, tinyLevel } from "./helpers";

const activeEnemies = (w: World) => [...w.enemies.active.keys()].filter((i) => w.enemies.active[i]);

describe("VB6-Rnd", () => {
  test("liefert mit dem VB-Startwert die bekannte Folge 0.7055475, 0.533424, 0.5795186", () => {
    const rnd = new VbRnd();
    for (const expected of [0.7055475, 0.533424, 0.5795186]) {
      expect(rnd.next() / 0x1000000).toBeCloseTo(expected, 6);
    }
  });
});

describe("Rundung wie VB6", () => {
  test("CLng rundet half-even", () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.25, 2.75].map((v) => roundHalfEven(v * 65536))).toEqual([
      0, 2, 2, 0, -2, 2, 3,
    ]);
    expect([divRoundHalfEven(5, 2), divRoundHalfEven(7, 2), divRoundHalfEven(-5, 2)]).toEqual([
      2, 4, -2,
    ]);
  });
});

describe("Event-Stream", () => {
  test("`;1 T 0!` bindet das erste folgende `§`; alleinstehende `§` spawnen nichts", () => {
    const w = tinyLevel([
      [0, 1, 1, 0],
      [0, SPAWN_KIND, 50, 0],
      [0, SPAWN_KIND, 70, 0],
      [1, SPAWN_KIND, 80, 0],
    ]);
    step(w, 0);
    let en = activeEnemies(w);
    expect(en.length).toBe(1);
    expect(w.enY[en[0]!]).toBe(fxFromInt(50));
    expect(w.enX[en[0]!]).toBe(fxFromInt(640 - 2)); // gespawnt bei 640, im selben Tick bewegt
    step(w, 0);
    en = activeEnemies(w);
    expect(en.length).toBe(1);
  });

  test("`;1 T −5!` startet links außerhalb und fliegt nach rechts", () => {
    const w = tinyLevel([
      [0, 1, 1, -5],
      [0, 0, 1, 30],
      [0, SPAWN_KIND, 90, 0],
    ]);
    step(w, 0);
    const [i] = activeEnemies(w);
    expect(w.enX[i!]).toBe(fxFromInt(-20 + 2));
    expect(w.enY[i!]).toBe(fxFromInt(90));
    expect(w.tiles.active.indexOf(1)).toBeGreaterThanOrEqual(0);
  });

  test("Pattern-Gegner starten am Rand und steuern den ersten Wegpunkt an", () => {
    const w = tinyLevel([[0, 1, 1, 1]]);
    step(w, 0);
    const [i] = activeEnemies(w);
    // Start (640, 50) → Wegpunkt (300, 50): vx = −p4, vy = 0
    expect(w.enVX[i!]).toBe(fxFromInt(-2));
    expect(w.enVY[i!]).toBe(0);
    for (let t = 0; t < 168; t++) step(w, 0); // x: 638 → 302
    expect(w.enWaypoint[i!]).toBe(0);
    step(w, 0);
    // Wegpunkt (300, 50) erreicht → Endpunkt links außerhalb (v1 = 2)
    expect(w.enWaypoint[i!]).toBe(1);
    expect(w.enVX[i!]).toBe(fxFromInt(-2));
    for (let t = 0; t < 200; t++) step(w, 0);
    expect(activeEnemies(w)).toEqual([]);
  });

  test("Tiles spawnen bei 640, scrollen 1 px/Tick und verschwinden links", () => {
    const w = tinyLevel([[0, 0, 1, 100]]);
    step(w, 0);
    const i = w.tiles.active.indexOf(1);
    expect(w.tileX[i]).toBe(639);
    for (let t = 0; t < 639 + 30; t++) step(w, 0);
    expect(w.tileX[i]).toBe(-30);
    expect(w.tiles.active[i]).toBe(1);
    step(w, 0);
    expect(w.tiles.active[i]).toBe(0);
  });

  test("Checkpoint `;3` setzt den Neustartpunkt", () => {
    const w = tinyLevel([[5, 3, 0, 0]]);
    for (let t = 0; t < 10; t++) step(w, 0);
    expect(w.checkpoint).toBe(5);
  });
});

describe("Spieler", () => {
  test("Dauerfeuer: ein Schuss alle 6 Ticks", () => {
    const w = tinyLevel([]);
    let fired = 0;
    for (let t = 0; t < 60; t++) {
      const before = w.shots.active.reduce((s, v) => s + v, 0);
      step(w, Input.Fire);
      if (w.shots.active.reduce((s, v) => s + v, 0) > before) fired++;
    }
    expect(fired).toBe(10);
    const i = w.shots.active.indexOf(1);
    expect(w.shotY[i]).toBe(100 + 7);
  });

  test("Bewegung mit Tempo 6, Grenzen, Q/W auf Tastendruck", () => {
    const w = tinyLevel([]);
    step(w, Input.Right);
    expect(w.px).toBe(106);
    for (let t = 0; t < 100; t++) step(w, Input.Down);
    expect(w.py).toBe(SHIP_MAX_Y);
    step(w, Input.Faster);
    step(w, Input.Faster); // gehalten: kein zweiter Schritt
    expect(w.speed).toBe(8);
    step(w, 0);
    step(w, Input.Faster);
    expect(w.speed).toBe(8);
    for (let k = 0; k < 5; k++) {
      step(w, Input.Slower);
      step(w, 0);
    }
    expect(w.speed).toBe(2);
  });

  test("Unverwundbarkeit nach dem Start dauert 55 Ticks", () => {
    const w = tinyLevel([]);
    for (let t = 0; t < 54; t++) step(w, 0);
    expect(w.invuln).toBe(254);
    step(w, 0);
    expect(w.invuln).toBe(255);
  });
});

describe("Konturkollision", () => {
  // Frame 10 Zeilen hoch, Kontur überall 5…14 relativ zur Gegnerkante, f0 = 2, f1 = 8.
  const rows = 11;
  const contours = Int16Array.from({ length: rows * 2 }, (_, i) => (i % 2 === 0 ? 5 : 14));
  const hit = (bx: number, by: number, bw = 2, bh = 2) =>
    contourHit(contours, 0, rows, 20, 2, 8, fxFromInt(100), fxFromInt(100), bx, by, bw, bh);

  test("x-Intervall inklusiv gegen min(left)…max(right)", () => {
    expect(hit(105, 104)).toBe(true);
    expect(hit(103, 104)).toBe(true); // 103 + 2 = 105 berührt
    expect(hit(102, 104)).toBe(false);
    expect(hit(114, 104)).toBe(true);
    expect(hit(115, 104)).toBe(false);
  });

  test("vertikal nur innerhalb f0…f1", () => {
    expect(hit(108, 100)).toBe(true); // 100 + 2 = 102 = ey + f0
    expect(hit(108, 99)).toBe(false);
    expect(hit(108, 108)).toBe(true);
    expect(hit(108, 109)).toBe(false);
  });
});

/** Einfacher Bot: Dauerfeuer, pendelt vertikal. */
const bot = (t: number) => Input.Fire | (Math.floor(t / 90) % 2 ? Input.Up : Input.Down);

async function hashRun(seed: number): Promise<number[]> {
  const w = await newWorld(1, seed);
  const hashes: number[] = [];
  for (let t = 0; t < 3000; t++) {
    step(w, bot(t));
    if (t % 64 === 63) hashes.push(w.hash());
  }
  return hashes;
}

describe("Level 1", () => {
  test("läuft mit Unverwundbarkeit bis zum Boss, besiegt ihn und fliegt hinaus", async () => {
    const w = await newWorld(1, 7, { invincible: true });
    let ticks = 0;
    while (w.exit !== 3 && ticks < 30_000) {
      step(w, bot(ticks));
      ticks++;
    }
    expect(w.bossMode).toBe(true);
    expect(w.levelDone).toBe(true);
    expect(w.exit).toBe(3);
    expect(w.px).toBeGreaterThan(710);
    expect(w.tick).toBeGreaterThan(6850);
    expect(w.score).toBeGreaterThan(1000);
    // Meteore ließen den Tick stillstehen: mehr Schleifendurchläufe als Level-Ticks.
    expect(ticks).toBeGreaterThan(w.tick);
  });

  test("deterministisch: gleiche Eingabe und Saat → gleiche Hashes", async () => {
    const a = await hashRun(3);
    expect(await hashRun(3)).toEqual(a);
    expect(await hashRun(4)).not.toEqual(a);
  });

  test("Tod: Neustart am Checkpoint mit einem Leben weniger", async () => {
    const w = await newWorld(1, 1);
    let t = 0;
    // Stillhalten, bis das Schiff getroffen wird.
    while (!w.dead && t < 20_000) {
      step(w, 0);
      t++;
    }
    expect(w.dead).toBe(1);
    const lives = w.lives;
    while (w.dead) step(w, 0);
    expect(w.lives).toBe(lives - 1);
    expect(w.tick).toBe(w.checkpoint);
    expect([w.px, w.py]).toEqual([100, 100]);
  });
});
