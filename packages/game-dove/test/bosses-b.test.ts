import { describe, expect, test } from "bun:test";
import { BOSS_TICK, restartAtCheckpoint, step, type World } from "../src/sim";
import { handlers } from "../src/sim/actions";
import { hitTest } from "../src/sim/collision";
import { partContourHit, partHeight, partWidth } from "../src/sim/bosses/common";
import { newWorld } from "./helpers";

/** Welt kurz vor dem Boss-Tick, dann bis zum ersten Bosstick (Init) laufen lassen. */
async function atBoss(n: number, invincible = true): Promise<World> {
  const w = await newWorld(n, 1, { invincible });
  w.checkpoint = (BOSS_TICK[n] as number) - 2;
  restartAtCheckpoint(w);
  for (let i = 0; i < 10 && !w.bossMode; i++) step(w, 0);
  expect(w.bossMode).toBe(true);
  // Der Tick, der `bossMode` setzt, führt das Bossskript schon aus (Init).
  return w;
}

/** Ein Punkt (4×4-Box) auf der Kontur eines Teils. */
function contourPoint(w: World, part: number): [number, number] {
  const x0 = w.bossX[part] as number;
  const y0 = w.bossY[part] as number;
  const cx = x0 + (partWidth(w, part) >> 1);
  const cy = y0 + (partHeight(w, part) >> 1);
  for (let d = 0; d < 80; d++) {
    for (const [x, y] of [
      [cx + d, cy],
      [cx - d, cy],
      [cx, cy + d],
      [cx, cy - d],
    ] as const) {
      if (partContourHit(w, part, x, y, 4, 4)) return [x, y];
    }
  }
  throw new Error("kein Konturpunkt");
}

function countEnemies(w: World, type: number): number {
  let n = 0;
  for (let i = 0; i < w.enemies.capacity; i++) {
    if (w.enemies.active[i] && w.enType[i] === type) n++;
  }
  return n;
}

function expectDeath(w: World, limit = 5): void {
  const score = w.score;
  w.bossHP[0] = 0;
  let t = 0;
  while (!w.levelDone && t < limit) {
    step(w, 0);
    t++;
  }
  expect(w.levelDone).toBe(true);
  expect(w.score - score).toBe(10000);
  // Einmalig: weitere Ticks bringen keine Punkte mehr.
  for (let i = 0; i < 5; i++) step(w, 0);
  expect(w.score - score).toBe(10000);
}

describe("Boss Level 4", () => {
  test("Init, Angriffswahl und Ufo-Pattern #100", async () => {
    const w = await atBoss(4);
    expect(w.bossX[0]).toBe(180);
    expect(w.bossY[0]).toBe(-160);
    expect(w.bossHP[0]).toBe(10000);
    expect(w.bossState).toBe(4);
    step(w, 0);
    expect([1, 2, 3]).toContain(w.bossState);

    // Ufo-Angriff erzwingen: y läuft auf 0, dann wird Pattern #100 geschrieben.
    w.bossState = 1;
    w.bossC.fill(0);
    w.bossY[0] = -4;
    step(w, 0);
    step(w, 0);
    expect(w.bossY[0]).toBe(0);
    expect(w.customPathLen).toBe(14);
    const x = (w.bossX[0] as number) + 112;
    expect([w.customPathX[0], w.customPathY[0], w.customPathX[1], w.customPathY[1]]).toEqual([
      x,
      128,
      x,
      200,
    ]);
    for (let i = 2; i <= 11; i++) {
      expect(w.customPathX[i]).toBeGreaterThanOrEqual(0);
      expect(w.customPathX[i]).toBeLessThan(584);
      expect(w.customPathY[i]).toBeGreaterThanOrEqual(0);
      expect(w.customPathY[i]).toBeLessThan(378);
    }
    expect([w.customPathX[12], w.customPathY[12], w.customPathX[13]]).toEqual([x, -32, -1]);

    // 10 kleine Ufos, eines alle 16 Ticks, auf dem dynamischen Pattern.
    const ufo = w.level.enemies.findIndex((e) => e.name === "kleines Ufo");
    let spawned = 0;
    for (let t = 0; t < 16 * 10 + 2; t++) {
      const before = countEnemies(w, ufo);
      step(w, 0);
      if (countEnemies(w, ufo) > before) spawned++;
    }
    expect(spawned).toBe(10);
    expect(w.bossC[2]).toBe(10);
    expect(w.bossC[0]).toBe(2);
  });

  test("Strahl wächst, tötet den Spieler darunter und verschwindet", async () => {
    const w = await atBoss(4, false);
    w.bossState = 3;
    w.bossC.fill(0);
    w.bossC[0] = 2; // Laden fertig
    w.bossY[0] = 0;
    w.bossX[0] = 100;
    w.px = 100 + 142 - 20;
    w.py = 300;
    w.invuln = 255;
    step(w, 0);
    expect(w.bossC[0]).toBe(3);
    step(w, 0);
    expect(w.bossBeamW[0]).toBe(1);
    expect(w.bossBeamX[0]).toBe(242);
    expect(w.bossBeamY[0]).toBe(161);
    expect(w.dead).toBe(1);
    // Aufbau bis Halbbreite 35, 30 Ticks halten, Abbau, dann Angriffswahl.
    let maxW = 0;
    let t = 0;
    while (w.bossState === 3 && t < 200) {
      step(w, 0);
      maxW = Math.max(maxW, w.bossBeamW[0] as number);
      t++;
    }
    expect(maxW).toBe(71);
    expect(t).toBeGreaterThan(35 + 30 + 35);
    step(w, 0);
    expect(w.bossBeamW[0]).toBe(0);
  });

  test("schluckt Schüsse und stirbt mit +10000", async () => {
    const w = await atBoss(4);
    w.bossY[0] = 100;
    const [x, y] = contourPoint(w, 0);
    expect(hitTest(w, x, y, 4, 4, 5, false, handlers)).toBe(0);
    expect(w.bossHP[0]).toBe(9995);
    expect(hitTest(w, 630, 5, 4, 4, 5, false, handlers)).toBe(-1);
    expectDeath(w);
    expect(w.bossState).toBe(5);
  });
});

describe("Boss Level 5", () => {
  test("Init, laufender Boden, Salve und Zapfen", async () => {
    const w = await atBoss(5);
    expect(w.bossX[0]).toBe(640);
    expect(w.bossY[0]).toBe(100);
    expect(w.bossHP[0]).toBe(8000);
    expect(w.bossState).toBe(1);
    // Bodenstück #1 im nächsten Tick an (640, 384), vx −1; dann alle 255 Ticks.
    const fresh = () => {
      for (let i = 0; i < w.tiles.capacity; i++) {
        if (w.tiles.active[i] && w.tileType[i] === 0 && w.tileY[i] === 384 && w.tileX[i] === 640)
          return i;
      }
      return -1;
    };
    expect(fresh()).toBe(-1);
    step(w, 0);
    const slot = fresh();
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(w.tileVX[slot]).toBe(-1);
    for (let t = 0; t < 254; t++) {
      step(w, 0);
      expect(fresh()).toBe(-1);
    }
    step(w, 0);
    expect(fresh()).toBeGreaterThanOrEqual(0);
    // Einflug endet bei x = 360.
    expect(w.bossState).toBe(2);
    expect(w.bossX[0]).toBe(360);

    // Salve: drei Feuerbälle, auch mit halbierter Option.
    w.bossC[0] = 35;
    const phase = w.bossC[4] as number;
    const shots = w.eshots.active.reduce((a, b) => a + b, 0);
    step(w, 0);
    expect(w.eshots.active.reduce((a, b) => a + b, 0)).toBe(shots + 3);
    expect(w.bossC[4]).toBe(phase + 1);

    // Zapfen: Zustand 7 wirft sofort einen an x = Spieler-X, y = −110, fällt 5 px/Tick.
    const zapfen = w.level.enemies.findIndex((e) => e.name === "Zapfen");
    w.bossState = 7;
    w.bossC[0] = 50;
    w.bossC[4] = 0;
    step(w, 0);
    let slotZ = -1;
    for (let i = 0; i < w.enemies.capacity; i++) {
      if (w.enemies.active[i] && w.enType[i] === zapfen) slotZ = i;
    }
    expect(slotZ).toBeGreaterThanOrEqual(0);
    expect(w.enX[slotZ]! >> 16).toBe(w.px);
    expect(w.enY[slotZ]! >> 16).toBe(-110);
    expect(w.enPattern[slotZ]).toBe(-6);
    expect(w.enHP[slotZ]).toBe(100000);
    step(w, 0);
    expect(w.enY[slotZ]! >> 16).toBe(-105);
    // Nach drei Zapfen zurück zu den Salven mit Zähler −4.
    for (let t = 0; t < 2 * 51; t++) step(w, 0);
    expect(w.bossState).toBe(2);
    expect(w.bossC[4]).toBe(-4);
  });

  test("schluckt Schüsse und stirbt mit +10000", async () => {
    const w = await atBoss(5);
    w.bossX[0] = 360;
    const [x, y] = contourPoint(w, 0);
    expect(hitTest(w, x, y, 4, 4, 7, false, handlers)).toBe(0);
    expect(w.bossHP[0]).toBe(7993);
    expectDeath(w);
    expect(w.bossState).toBe(4);
  });
});

describe("Boss Level 8", () => {
  test("Einflug, Lissajous mit Minen, Sog", async () => {
    const w = await atBoss(8);
    expect(w.bossX[0]).toBe(640);
    expect(w.bossY[0]).toBe(315);
    expect(w.bossHP[0]).toBe(15000);
    expect(w.bossX[1]).toBe(-1000);
    for (let t = 0; t < 21; t++) step(w, 0);
    expect(w.bossState).toBe(2);
    expect(w.bossX[0]).toBe(535);

    // Minen (Typ 22, vx −7) alle 4 Ticks an (x+10, y+72).
    const mine = w.level.enemies.findIndex((e) => e.name === "22 - Endg Mine");
    let spawned = 0;
    let slot = -1;
    for (let t = 0; t < 40; t++) {
      const before = countEnemies(w, mine);
      step(w, 0);
      if (countEnemies(w, mine) > before) {
        spawned++;
        for (let i = 0; i < w.enemies.capacity; i++) {
          if (w.enemies.active[i] && w.enType[i] === mine) slot = i;
        }
      }
    }
    expect(spawned).toBe(10);
    expect(w.enVX[slot]).toBe(-7 << 16);
    // Lissajous: x = FpI4(cos(a2)·100 + 435) bleibt in 335…535.
    expect(w.bossX[0]).toBeGreaterThanOrEqual(335);
    expect(w.bossX[0]).toBeLessThanOrEqual(535);

    // Hülle einfahren lassen, dann Sog: +7 px/Tick ab c = 100.
    w.bossC[3] = 999;
    step(w, 0);
    expect(w.bossState).toBe(3);
    expect(w.bossX[1]).toBe(-190);
    let t = 0;
    while (w.bossState === 3 && t < 400) {
      step(w, 0);
      t++;
    }
    expect(w.bossState).toBe(4);
    expect(w.bossX[1]).toBe(441);
    w.bossC[3] = 99;
    w.px = 100;
    w.py = 200;
    step(w, 0);
    expect(w.px).toBe(107);
    w.bossC[3] = 700;
    step(w, 0);
    expect(w.px).toBe(116);
    // Der Kern folgt pY − 66 (± 9 Wackeln), die Hülle hängt 33 px darüber.
    expect(w.bossY[1]).toBe((w.bossY[0] as number) - 33);
  });

  test("Hülle schluckt Schüsse ohne Schaden, Kern nimmt Schaden, Tod mit +10000", async () => {
    const w = await atBoss(8);
    // Kern rechts neben die Hülle, damit sich die Konturen nicht überdecken.
    w.bossX[0] = 700;
    w.bossY[0] = 128;
    w.bossX[1] = 441;
    w.bossY[1] = 95;
    w.bossVisible[1] = 1;
    const [sx, sy] = contourPoint(w, 1);
    expect(partContourHit(w, 0, sx, sy, 4, 4)).toBe(false);
    expect(hitTest(w, sx, sy, 4, 4, 5, false, handlers)).toBe(0);
    expect(w.bossHP[0]).toBe(15000);
    // Ohne Hülle trifft derselbe Weg den Kern.
    w.bossX[1] = -1000;
    w.bossX[0] = 533;
    const [cx, cy] = contourPoint(w, 0);
    expect(hitTest(w, cx, cy, 4, 4, 5, false, handlers)).toBe(0);
    expect(w.bossHP[0]).toBe(14995);
    expectDeath(w, 1);
    expect(w.bossState).toBe(6);
  });
});
