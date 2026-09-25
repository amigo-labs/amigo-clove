import { describe, expect, test } from "bun:test";
import { BOSS_TICK, INVULN_DONE, Input, type World, restartAtCheckpoint, step } from "../src/sim";
import { handlers } from "../src/sim/actions";
import { hitTest } from "../src/sim/collision";
import { ShotKind } from "../src/sim/enemyShots";
import { newWorld } from "./helpers";
import type { SimOptions } from "../src/sim";

async function atBoss(n: number, options: Partial<SimOptions> = {}): Promise<World> {
  const w = await newWorld(n, 1, options);
  w.checkpoint = BOSS_TICK[n]! - 2;
  restartAtCheckpoint(w);
  for (let i = 0; i < 10 && !w.bossMode; i++) step(w, 0);
  expect(w.bossMode).toBe(true);
  return w;
}

function stepUntil(w: World, pred: () => boolean, max: number, input = 0): void {
  for (let i = 0; i < max && !pred(); i++) step(w, input);
  expect(pred()).toBe(true);
}

const shots = (w: World) =>
  [...w.eshots.active.keys()]
    .filter((i) => w.eshots.active[i])
    .map((i) => ({
      kind: w.eshotKind[i]!,
      x: w.eshotX[i]!,
      y: w.eshotY[i]!,
      vx: w.eshotVX[i]!,
      vy: w.eshotVY[i]!,
      w: w.eshotW[i]!,
    }));

const activeExtras = (w: World) => [...w.extras.active].filter((a) => a).length;

/** E7 bis zum Angriffszustand; `setup` läuft vor jedem Tick des Scans. */
async function e7Attack(
  setup: (w: World) => void = () => {},
  options: Partial<SimOptions> = { invincible: true },
  input = 0,
): Promise<World> {
  const w = await atBoss(7, options);
  const attacking = () => w.bossState >= 3 && w.bossState <= 7;
  for (let i = 0; i < 1000 && !attacking(); i++) {
    setup(w);
    step(w, input);
  }
  expect(attacking()).toBe(true);
  return w;
}

describe("Level 7 — E7 Scanner", () => {
  test("Scan: eingefrorener Punktestand, Extras bei 199/441, Texte, dann Einflug mit HP 3000", async () => {
    const w = await atBoss(7, { invincible: true });
    const c = w.bossC;
    expect(w.bossState).toBe(10); // Boss-Tick selbst: Init
    step(w, 0);
    expect([w.bossState, c[4]]).toEqual([1, 1]); // erste Runde
    const frozen = c[6]!;
    stepUntil(w, () => c[0] === 201, 300);
    expect(activeExtras(w)).toBe(10);
    for (let i = 0; i < 10; i++) expect(w.extraVX[i]).toBe(0);
    expect(c[7]).toBe(1); // „Scaning DOVE“
    w.score += 999;
    step(w, 0);
    expect(w.score).toBe(frozen);
    stepUntil(w, () => c[0] === 330, 200);
    expect(c[8]).toBe(1); // „n Option(s)“
    expect(c[9]).toBe(1); // Waffenname
    expect(c[2]).toBe(0); // Normal
    stepUntil(w, () => c[0] === 442, 200);
    expect(activeExtras(w)).toBe(0);
    expect(c[7]).toBe(2); // „Scaning successfull“
    stepUntil(w, () => w.bossState === 2, 200);
    expect(c[7]).toBe(0);
    expect([w.bossX[0], w.bossY[0], w.bossHP[0]]).toEqual([700, 160, 3000]);
    expect(w.bossVisible[0]).toBe(1);
    stepUntil(w, () => w.bossState === 3, 200);
    expect(w.bossX[0]).toBe(640 - 171);
  });

  test("Normal: Kugel vx −6 alle 10 Ticks aus der Bossmitte", async () => {
    const w = await e7Attack();
    expect(w.bossState).toBe(3);
    const y = w.bossY[0]!;
    stepUntil(w, () => shots(w).length > 0, 12);
    const s = shots(w)[0]!;
    expect([s.kind, s.vx, s.vy, s.y]).toEqual([ShotKind.Fireball, -6, 0, y + 45]);
  });

  test("Red: Fünferfächer alle 15 Ticks", async () => {
    const w = await e7Attack((v) => {
      v.colour = 3;
    });
    expect(w.bossState).toBe(6);
    stepUntil(w, () => shots(w).length >= 5, 17);
    expect(shots(w).map((s) => [s.vx, s.vy])).toEqual([
      [-5, 0],
      [-3, -2],
      [-3, 2],
      [-1, -4],
      [-1, 4],
    ]);
  });

  test("Green: Wand aus vier Kacheln bleibt bei x = 0 stehen, teilende Kugeln", async () => {
    const w = await e7Attack((v) => {
      v.colour = 2;
    });
    expect(w.bossState).toBe(5);
    const wall = [...w.tiles.active.keys()].filter((i) => w.tiles.active[i]);
    expect(wall).toEqual([0, 1, 2, 3]);
    expect(wall.map((i) => [w.tileX[i], w.tileY[i], w.tileVX[i]])).toEqual([
      [0, 0, 0],
      [0, 128, 0],
      [0, 256, 0],
      [0, 384, 0],
    ]);
    stepUntil(w, () => shots(w).length > 0, 52);
    expect(shots(w)[0]!.kind).toBe(ShotKind.Splitter);
    expect(shots(w)[0]!.w).toBe(9);
  });

  test("Blue: geladener Strahl tötet ein verwundbares Schiff", async () => {
    const w = await e7Attack(
      (v) => {
        v.colour = 1;
      },
      { invincible: false },
    );
    expect(w.bossState).toBe(4);
    const cy = w.bossY[0]! + 45;
    w.invuln = INVULN_DONE;
    w.py = cy - 5; // auf Höhe → Laden
    step(w, 0);
    expect(w.bossC[1]).toBe(99);
    w.py = cy + 5; // weg, aber im Strahl
    stepUntil(w, () => w.bossBeamW[0]! > 0 || w.dead === 1, 6);
    expect(w.bossBeamW[0]).toBe(w.bossX[0]! + 10);
    expect(w.dead).toBe(1);
  });

  test("Beam: 100 Ticks zittern, dann tötet der Blitz", async () => {
    const w = await e7Attack(() => {}, { invincible: false }, Input.Beam);
    expect(w.bossState).toBe(7);
    stepUntil(w, () => w.bossC[1] === 50, 60);
    expect(Math.abs(w.bossX[0]! - 467)).toBeLessThanOrEqual(2);
    expect(Math.abs(w.bossY[0]! - 160)).toBeLessThanOrEqual(2);
    expect(w.dead).toBe(0);
    w.invuln = 100; // der Blitz prüft keine Unverwundbarkeit
    stepUntil(w, () => w.bossC[1] === 100, 60);
    expect(w.dead).toBe(1);
  });

  test("Optionen umkreisen den Boss (r = 150) und schlucken Schüsse ohne Schaden", async () => {
    const w = await e7Attack((v) => {
      v.optionCount = 2;
    });
    step(w, 0);
    const mx = w.bossX[0]! + 85 - 19;
    const my = w.bossY[0]! + 45 - 19;
    const d1 = Math.hypot(w.bossX[1]! - mx, w.bossY[1]! - my);
    const d2 = Math.hypot(w.bossX[2]! - mx, w.bossY[2]! - my);
    expect(Math.round(d1)).toBe(150);
    expect(Math.round(d2)).toBe(150);
    expect(w.bossVisible[1]! + w.bossVisible[2]!).toBe(2);
    const hp = w.bossHP[0]!;
    expect(hitTest(w, w.bossX[1]!, w.bossY[1]!, 38, 39, 20, false, handlers)).toBe(0);
    expect(hitTest(w, w.bossX[2]!, w.bossY[2]!, 38, 39, 20, false, handlers)).toBe(0);
    expect(w.bossHP[0]).toBe(hp);
    expect(hitTest(w, w.bossX[0]!, w.bossY[0]!, 171, 90, 20, false, handlers)).toBe(0);
    expect(w.bossHP[0]).toBe(hp - 20);
  });

  test("Sieg bei Faktor < 1,1 schon beim ersten Abschuss (+10000)", async () => {
    const w = await e7Attack();
    const score = w.score;
    w.bossHP[0] = 0;
    step(w, 0);
    expect(w.bossState).toBe(9);
    expect(w.invuln).toBeGreaterThanOrEqual(100);
    step(w, 0);
    expect(w.bossState).toBe(11);
    expect(w.levelDone).toBe(true);
    expect(w.score).toBe(score + 10000);
  });

  test("Faktor > 1,1: Rückzug und neuer Scan, Sieg erst beim zweiten Abschuss", async () => {
    const w = await e7Attack(() => {}, { invincible: true, scoreFactor: 125 });
    w.bossHP[0] = -5;
    step(w, 0);
    expect(w.bossState).toBe(9);
    stepUntil(w, () => w.bossState === 1, 200);
    expect(w.levelDone).toBe(false);
    expect(w.bossC[4]).toBe(2);
    stepUntil(w, () => w.bossState >= 3 && w.bossState <= 7, 800);
    w.bossHP[0] = 0;
    stepUntil(w, () => w.bossState === 11, 3);
    expect(w.levelDone).toBe(true);
  });
});

describe("Level 10 — E10 „1“", () => {
  test("Einflug bis x = 310 mit gezielten Schüssen, danach Sinusphase mit Feuerbällen", async () => {
    const w = await atBoss(10, { invincible: true, enemyShots: 1 });
    expect([w.bossX[0], w.bossY[0], w.bossHP[0], w.bossState]).toEqual([640, 54, 19020, 1]);
    stepUntil(w, () => shots(w).length > 0, 25);
    expect(shots(w)[0]!.kind).toBe(ShotKind.Aimed);
    stepUntil(w, () => w.bossState === 2, 200);
    expect(w.bossX[0]).toBe(310);
    w.eshots.clear();
    stepUntil(w, () => shots(w).some((s) => s.kind === ShotKind.Fireball), 25);
    const fb = shots(w).find((s) => s.kind === ShotKind.Fireball)!;
    expect([fb.vx, fb.w]).toEqual([-5, 34]);
    // 30 Ticks nach Beginn: a = 150°, b = 90° → x = 285, y = 54 + 151
    stepUntil(w, () => w.bossC[2] === 90, 40);
    expect([w.bossX[0], w.bossY[0]]).toEqual([285, 205]);
    stepUntil(w, () => w.bossState === 3, 200);
    expect([w.bossX[0], w.bossY[0]]).toEqual([310, 54]);
  });

  test("Kanonenband → drei wachsende Strahlen töten das Schiff", async () => {
    const w = await atBoss(10, { invincible: false });
    w.bossState = 3;
    w.bossX[0] = 310;
    w.bossY[0] = 54;
    w.bossC[1] = 1;
    w.invuln = INVULN_DONE;
    w.py = 54 + 131; // mittleres Band y+121…189
    step(w, 0);
    expect(w.bossState).toBe(4);
    const y = w.bossY[0]!;
    stepUntil(w, () => w.bossC[0] === 41, 45);
    expect([w.bossBeamX[0], w.bossBeamW[0], w.bossBeamY[0], w.bossBeamH[0]]).toEqual([
      404,
      10,
      y + 121,
      68,
    ]);
    expect(w.bossBeamW[1]).toBe(10);
    expect(w.bossBeamW[2]).toBe(10);
    step(w, 0);
    expect(w.bossBeamW[0]).toBe(20);
    expect(w.dead).toBe(0);
    // Linke Kante x + 504 − 10c erreicht pX + 36 = 136 bei c = 68.
    stepUntil(w, () => w.dead === 1, 30);
    expect(w.bossC[0]).toBe(68);
  });

  test("Raketen bei c = 200, Abflug und vier Verfolger, dann neuer Einflug", async () => {
    const w = await atBoss(10, { invincible: true });
    w.bossState = 4;
    w.bossX[0] = 310;
    w.bossC[0] = 199;
    w.eshots.clear();
    step(w, 0);
    expect(w.bossState).toBe(5);
    expect(shots(w).map((s) => [s.kind, s.vx, s.w])).toEqual([
      [3, -4, 42],
      [3, -4, 42],
      [3, -4, 42],
    ]);
    stepUntil(w, () => w.bossState === 6, 400);
    const ids = [0, 1, 2, 3];
    for (const i of ids) expect(w.enemies.active[i]).toBe(1);
    expect(ids.map((i) => w.enPattern[i])).toEqual([-2, -2, -1, -1]);
    expect(ids.map((i) => w.enHP[i])).toEqual([500, 500, 500, 500]);
    w.enemies.clear();
    step(w, 0);
    expect(w.bossState).toBe(1);
  });

  test("HP 0: Level geschafft, +10000", async () => {
    const w = await atBoss(10, { invincible: true });
    const score = w.score;
    w.bossHP[0] = 0;
    step(w, 0);
    expect(w.bossState).toBe(100);
    expect(w.levelDone).toBe(true);
    expect(w.score).toBe(score + 10000);
    step(w, 0);
    expect(w.score).toBe(score + 10000);
  });
});
