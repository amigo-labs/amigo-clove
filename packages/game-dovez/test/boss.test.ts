/** Boss-Finale (Zustand 4), Abschusswahl und Druckwelle gegen die gebauten Assets. */
import { describe, expect, test } from "bun:test";
import { DeathState } from "../src/sim/enemies";
import { cint } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

/** Gegner i mit einem Treffer auf sein erstes sichtbares Teil töten (Spieler 0, nicht durchschlagend). */
function shoot(w: World, i: number): void {
  const e = w.enemies.items[i]!;
  const p = e.parts.find((q) => q.visible && q.def.armored === 0)!;
  const [x, y] = w.enemies.partPos(e, p);
  const s = w.enemies.surface(p)!;
  const ew = w["makeEnemyWorld"]();
  w.enemies.hit(cint(x), cint(y), cint(x + s.rect.w), cint(y + s.rect.h), 1e9, 0, ew);
}

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([]);
    w.events.length = 0;
  }
}

describe("Bosse", () => {
  test("Zeppelin: Abschuss → Zustand 4, Levelausflug ab T = 520, Level geschafft", async () => {
    const { level, sprites } = await loadTestLevel("level1-2_zeppelin_boss");
    const w = new World(level, sprites);
    for (let t = 0; t < 5000 && !w.bossAlive; t++) run(w, 1);
    expect(w.bossAlive).toBe(true);
    const i = w.enemies.items.findIndex((e) => e?.alive && e.def.boss === 1);
    shoot(w, i);
    const e = w.enemies.items[i]!;
    expect([e.inState, e.deathState]).toEqual([true, DeathState.boss]);
    run(w, 2);
    expect(w.background).toBe(0);
    expect(w.players[0]!.invulnerable).toBeGreaterThan(500);
    run(w, 518);
    expect(w.tick).toBe(level.levelLength - 151);
    run(w, 1);
    expect(w.players[0]!.exitState).toBeGreaterThan(0);
    run(w, 49);
    expect(e.alive).toBe(false);
    // das Flag bleibt nach dem Boss-Tod gesetzt
    expect(w.bossAlive).toBe(true);
    run(w, 200);
    expect(w.state).toBe(2);
  });

  test("gewöhnlicher Abschuss: sofort zerplatzt, mit Punkten", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    let i = -1;
    for (let t = 0; t < 3000 && i < 0; t++) {
      run(w, 1);
      i = w.enemies.items.findIndex(
        (e) =>
          e?.alive &&
          !e.inState &&
          e.def.boss <= 0 &&
          e.def.explosionSpec <= 0 &&
          e.def.bigDeath <= 0 &&
          e.def.wreckGroup <= 0 &&
          e.parts.some((p) => p.visible && p.def.armored === 0 && p.def.damagesBody !== 0),
      );
    }
    expect(i).toBeGreaterThanOrEqual(0);
    const before = w.score[0]!;
    shoot(w, i);
    expect(w.enemies.items[i]!.alive).toBe(false);
    expect(w.score[0]!).toBeGreaterThan(before);
  });

  test("Druckwelle: Radius 4 · Alter + 32, schiebt vom Zentrum weg, Energie −0,1", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    const p = w.players[0]!;
    // Mittelpunkt 40 px links der Hitbox-Mitte (x + 32, y + 35)
    w.fire.addShockwave(p.x + 32 - 40, p.y + 35, 20);
    const shot = w.fire.shots.find((s) => s.shockwave)!;
    expect(shot.life).toBe(15);
    const e0 = p.energy;
    w.fire.stepShots(w["shotWorld"]());
    // Alter 0: R = 32 < 40, keine Wirkung
    expect([p.pushX, p.energy]).toEqual([0, e0]);
    w.fire.stepShots(w["shotWorld"]());
    w.fire.stepShots(w["shotWorld"]());
    // Alter 2: R = 40, noch nicht streng innerhalb; Alter 3: R = 44, Tiefe 4 → Schub 0,8
    expect(p.pushX).toBe(0);
    w.fire.stepShots(w["shotWorld"]());
    expect(p.pushX).toBeCloseTo(0.8, 5);
    expect(Math.abs(p.pushY)).toBeLessThan(1e-6);
    expect(p.energy).toBeCloseTo(e0 - 0.1, 5);
    for (let k = 0; k < 11; k++) w.fire.stepShots(w["shotWorld"]());
    expect(shot.active).toBe(false);
  });
});
