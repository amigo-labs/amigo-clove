import { describe, expect, test } from "bun:test";
import { BOSS_TICK, INVULN_DONE, type World, restartAtCheckpoint, step } from "../src/sim";
import { handlers } from "../src/sim/actions";
import { hitTest } from "../src/sim/collision";
import { pathValue } from "../src/sim/bosses/e3";
import { newWorld } from "./helpers";

/** Welt kurz vor dem Boss-Tick; läuft, bis der Boss initialisiert ist (Zustand 1). */
async function atBoss(level: number, scoreFactor = 100): Promise<World> {
  const w = await newWorld(level, 1, { invincible: true, scoreFactor });
  w.checkpoint = (BOSS_TICK[level] as number) - 2;
  restartAtCheckpoint(w);
  for (let t = 0; t < 10 && !w.bossMode; t++) step(w, 0);
  expect(w.bossMode).toBe(true);
  return w;
}

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks; t++) step(w, 0);
}

function runUntil(w: World, cond: () => boolean, max: number): number {
  let t = 0;
  while (!cond() && t < max) {
    step(w, 0);
    t++;
  }
  expect(cond()).toBe(true);
  return t;
}

/** Schussbox (7×7) mitten auf ein Bossteil. */
function hitPart(w: World, part: number, damage: number, dx: number, dy: number): number {
  const x = (w.bossX[part] as number) + dx;
  const y = (w.bossY[part] as number) + dy;
  return hitTest(w, x, y, 7, 7, damage, false, handlers);
}

describe("Boss Level 2", () => {
  test("Start, Einflug, Sinusbahn, Kugeln und Raketen", async () => {
    const w = await atBoss(2);
    expect(w.bossState).toBe(1);
    expect([w.bossX[0], w.bossY[0], w.bossHP[0]]).toEqual([640, 140, 6000]);
    expect([w.bossX[1], w.bossY[1], w.bossHP[1]]).toEqual([-130, 0, 1500]);
    expect([w.bossX[2], w.bossY[2], w.bossHP[2]]).toEqual([-130, 340, 1500]);
    expect(w.level.enemies[w.bossType[1] as number]!.name).toBe("7 - End oben");

    // Einflug: 165 Ticks bis x = 475, Geschütze +1/Tick.
    runUntil(w, () => w.bossState === 2, 200);
    expect(w.bossX[0]).toBe(475);
    expect(w.bossX[1]).toBe(35);

    const ys = new Set<number>();
    let bullets = 0;
    let missiles = 0;
    for (let t = 0; t < 200; t++) {
      step(w, 0);
      ys.add(w.bossY[0] as number);
      for (let i = 0; i < w.eshots.capacity; i++) {
        if (!w.eshots.active[i]) continue;
        if (w.eshotSY[i] === 151 && w.eshotVX[i] === -4) missiles++;
        if (w.eshotSY[i] === 85 && w.eshotVX[i] === 0) bullets++;
      }
    }
    // y = FpI4(sin·70 + 140) über eine volle Periode (90 Ticks à 4°).
    expect(Math.min(...ys)).toBe(70);
    expect(Math.max(...ys)).toBe(210);
    expect(bullets).toBeGreaterThan(0);
    expect(missiles).toBeGreaterThan(0);
    // Geschützframe wechselt alle 5 Ticks, der Hauptteil bleibt auf Frame 0.
    expect(w.bossFrame[0]).toBe(0);
  });

  test("Treffer: Hauptteil schluckt, Geschütz stirbt mit Überschuss, Tod gibt +10000", async () => {
    const w = await atBoss(2);
    runUntil(w, () => w.bossState === 2, 200);
    const hp = w.bossHP[0] as number;
    expect(hitPart(w, 0, 5, 80, 70)).toBe(0);
    expect(w.bossHP[0]).toBe(hp - 5);

    w.bossHP[1] = 3;
    const r = hitPart(w, 1, 8, 60, 30);
    expect(r).toBe(5);
    expect(w.bossHP[1]).toBe(-5);
    expect(w.explosions.active.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
    step(w, 0);
    expect(w.bossVisible[1]).toBe(0);
    // Totes Geschütz wird nicht mehr getestet.
    expect(hitPart(w, 1, 8, 60, 30)).toBe(-1);

    const score = w.score;
    w.bossHP[0] = 0;
    step(w, 0);
    expect(w.bossState).toBe(3);
    expect(w.levelDone).toBe(true);
    expect(w.score).toBe(score + 10000);
    run(w, 50);
    expect(w.score).toBe(score + 10000);
  });
});

describe("Boss Level 3", () => {
  test("Start: zwei Fische bei Faktor 1,0, drei bei Faktor > 1,1", async () => {
    const w = await atBoss(3);
    expect(w.level.enemies[w.bossType[0] as number]!.name).toBe("EndG<-- (16)");
    expect([w.bossX[0], w.bossY[0]]).toEqual([640, 157]);
    expect([...w.bossHP]).toEqual([4000, 4000, 0]);
    const w3 = await atBoss(3, 125);
    expect([...w3.bossHP]).toEqual([4000, 4000, 4000]);
    expect(w3.bossX[2]).toBe(-106);
  });

  test("Kosinus-Pfade: Segmente von Punkt zu Punkt, unabhängige Achsen", async () => {
    const w = await atBoss(3, 125);
    const seen = [new Set<number>(), new Set<number>(), new Set<number>()];
    for (let t = 0; t < 400; t++) {
      step(w, 0);
      for (let i = 0; i < 3; i++) {
        const x = w.bossX[i] as number;
        const y = w.bossY[i] as number;
        // Ziele liegen in [−53, 586] × [−48, 361]; Fisch 1/2 starten bei 640, Fisch 3 bei −106.
        expect(x).toBeGreaterThanOrEqual(-106);
        expect(x).toBeLessThanOrEqual(640);
        expect(y).toBeGreaterThanOrEqual(-48);
        expect(y).toBeLessThanOrEqual(361);
        seen[i]!.add(x);
      }
    }
    for (const s of seen) expect(s.size).toBeGreaterThan(50);
    // Keine Schüsse.
    expect(w.eshots.active.every((a) => a === 0)).toBe(true);
    // Segmentform: Start, Mitte (k = N/2) und Ende (k = N: p0 + 2·half).
    expect(pathValue(640, -200, 100, 0)).toBe(640);
    expect(pathValue(640, -200, 100, 50)).toBe(440);
    expect(pathValue(640, -200, 100, 100)).toBe(240);
    expect(pathValue(10, 7, 60, 60)).toBe(24);
  });

  test("Treffer und Sieg ohne Punkte", async () => {
    const w = await atBoss(3);
    run(w, 5);
    // Fisch 2 wird zuerst getestet und liegt anfangs deckungsgleich: beiseiteschieben.
    w.bossY[1] = 300;
    w.bossX[1] = 0;
    const hp = w.bossHP[0] as number;
    expect(hitPart(w, 0, 3, 50, 48)).toBe(0);
    expect(w.bossHP[0]).toBe(hp - 3);
    w.bossHP[1] = 2;
    expect(hitPart(w, 1, 6, 50, 48)).toBe(4);
    step(w, 0);
    expect(w.bossVisible[1]).toBe(0);
    expect(w.levelDone).toBe(false);
    const score = w.score;
    w.bossHP[0] = 0;
    step(w, 0);
    expect(w.levelDone).toBe(true);
    expect(w.score).toBe(score);
  });
});

describe("Boss Level 6", () => {
  test("Einflug, Patrouille, Dash nach links und Rückkehr", async () => {
    const w = await atBoss(6);
    expect(w.level.enemies[w.bossType[0] as number]!.name).toBe("8 - Endgegner");
    expect([w.bossX[0], w.bossY[0], w.bossHP[0]]).toEqual([640, 12, 4500]);
    runUntil(w, () => w.bossState === 2, 200);
    expect(w.bossX[0]).toBe(320);
    // Das Schiff steht bei y = 100 im Bereich y … y+160: nach 10 Ticks Anlauf der Dash.
    let minX = 320;
    const t = runUntil(
      w,
      () => {
        minX = Math.min(minX, w.bossX[0] as number);
        return w.bossC[1] === 0 && (w.bossC[3] as number) > 0;
      },
      300,
    );
    expect(minX).toBe(-212);
    expect(w.bossX[0]).toBe(320);
    expect(t).toBeGreaterThan(38 + 76);
    expect(w.bossC[3]).toBeGreaterThanOrEqual(10);
    expect(w.bossC[3]).toBeLessThanOrEqual(99);
  });

  test("Phasen 1 → 2 → 3 → Tod, Unverwundbarkeit und +10000", async () => {
    const w = await atBoss(6);
    runUntil(w, () => w.bossState === 2, 200);
    expect(hitPart(w, 0, 4, 144, 92)).toBe(0);
    expect(w.bossHP[0]).toBe(4496);

    // Phase 1 stirbt: Dash mit Explosionen, Schiff unverwundbar, dann Phase 2 mit HP 1200.
    runUntil(w, () => w.bossC[1] === 0, 300);
    expect(w.invuln).toBe(INVULN_DONE);
    w.bossHP[0] = 0;
    runUntil(w, () => w.bossState === 3, 200);
    expect(w.bossHP[0]).toBe(1200);
    expect(w.invuln).toBeLessThan(INVULN_DONE);

    // Phase 2: Durchflug links→rechts mit dem gespiegelten Typ.
    runUntil(w, () => w.bossC[0] === 42, 200);
    expect(w.invuln).toBe(INVULN_DONE);
    step(w, 0);
    expect(w.level.enemies[w.bossType[0] as number]!.name).toBe("9 - Endgegner");
    w.bossHP[0] = 0;
    runUntil(w, () => w.bossState === 1, 100);
    expect(w.bossC[2]).toBe(1);
    expect(w.bossHP[0]).toBe(4500);

    // Phase 3 stirbt → Zustand 4, +10000, Levelende.
    runUntil(w, () => w.bossState === 2, 200);
    const score = w.score;
    w.bossHP[0] = 0;
    runUntil(w, () => w.levelDone, 5);
    expect(w.bossState).toBe(4);
    expect(w.score).toBe(score + 10000);
  });
});
