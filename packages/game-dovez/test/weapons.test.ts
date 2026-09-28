/** Spielerwaffen: Zweitwaffen, Partikel des D-Tonator, Force des D-Phyton, Schusstypen. */
import { describe, expect, test } from "bun:test";
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { ShotLayer } from "../src/sim/playerShots";
import { VbRnd } from "../src/sim/vb";
import { World, type Special } from "../src/sim/world";
import { loadTestLevel } from "./assets";

const fire: PlayerInput = { ...NO_INPUT, fire: true };

/** Ein Power-up direkt auf das Schiff legen und einsammeln lassen. */
function give(w: World, subtype: number, item: number, player = 0): void {
  const p = w.players[player]!;
  const s = w.specials.find((q) => !q.active) as Special;
  Object.assign(s, { active: true, subtype, item, x: p.x, y: p.y, vx: 0, frame: 0, timer: 0 });
  step(w, NO_INPUT);
}

function step(w: World, input: PlayerInput, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([input, NO_INPUT]);
    w.events.length = 0;
  }
}

const shotsOf = (w: World, type: number) =>
  w.playerShots.flatMap((l) => l.shots.filter((s) => s.active && s.type === type));

describe("Spielerwaffen", () => {
  test("VB6-Rnd: Rnd(−1) = 0,224007", () => {
    expect(new VbRnd().negative(-1)).toBeCloseTo(0.224007, 6);
  });

  test("KillSchuss senkt den höchsten Slot nie (Fehler des Originals)", () => {
    const l = new ShotLayer();
    l.add(0, 0, 0, 1, 0, 1, 1, 0);
    l.add(0, 0, 0, 1, 0, 1, 1, 0);
    l.kill(1);
    l.kill(0);
    expect([l.high, l.hint]).toEqual([1, 0]);
  });

  test("Bombe: Power-up 3/7, Abklingzeit 100, fällt und schlägt ein", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    give(w, 3, 7);
    expect(w.players[0]!.extraWeapon).toBe(1);
    step(w, fire);
    expect(shotsOf(w, 11).length).toBe(1);
    expect(w.players[0]!.secondaryCooldown).toBe(100);
    const bomb = shotsOf(w, 11)[0]!;
    const y0 = bomb.y;
    step(w, NO_INPUT, 5);
    expect(bomb.y).toBeGreaterThan(y0 + 15);
  });

  test("Hauptschuss: Ton und Mündungsfunken je Schusstick", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    const sparks = () =>
      w.fx.sparks.reduce((n, l) => n + l.items.filter((s) => s.active).length, 0);
    const before = sparks();
    w.step([fire]);
    expect(w.events.some((e) => e.kind === "sfx" && e.name === "normal")).toBe(true);
    expect(sparks() - before).toBeGreaterThanOrEqual(20);
  });

  test("D-Tonator: Extra 1 macht einen Platz zum Streuschuss, der feuert", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    // Plätze 0 und 1 aktiv und leer; Auto-Arrange wählt den leeren Platz 0
    give(w, 0, 1);
    const slot = w.particles.find((r) => r.kind === 2)!;
    expect(slot).toBeDefined();
    expect(slot.level).toBe(1);
    step(w, NO_INPUT, 30);
    const n = shotsOf(w, 1).length;
    step(w, fire);
    // Streuschuss (Sorte 2, Stufe 1): drei Schüsse vom Typ 1 aus dem Partikel
    expect(shotsOf(w, 1).length - n).toBe(3);
    // gleiche Sorte: Stufe steigt
    give(w, 0, 1);
    expect(slot.level).toBe(2);
  });

  test("D-Tonator: Schild kreist und schluckt Gegnerkugeln", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    give(w, 3, 1);
    expect(w.particles.some((r) => r.kind === -1)).toBe(true);
    const shield = w.particles.find((r) => r.kind === -1)!;
    step(w, NO_INPUT, 20);
    const shot = w.fire.shots[0]!;
    Object.assign(shot, { active: true, shockwave: false, weapon: 0, salvo: 0, damage: 5 });
    Object.assign(shot.actor, { x: shield.x + 8, y: shield.y + 8, width: 16, height: 16 });
    shot.route = -1;
    shot.vx = 0;
    shot.vy = 0;
    const score = w.score[0]!;
    step(w, NO_INPUT);
    expect(shot.active).toBe(false);
    expect(w.score[0]!).toBeGreaterThanOrEqual(score + 5);
  });

  test("D-Phyton: Force erscheint links, dockt an, D schießt sie ab", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, { ship: 1 });
    give(w, 4, 1);
    const f = w.force;
    expect([f.present, f.state, f.color, f.level]).toEqual([true, 5, 1, 0]);
    for (let t = 0; t < 600 && f.state > 2; t++) step(w, NO_INPUT);
    expect(f.state).toBeLessThanOrEqual(2);
    step(w, { ...NO_INPUT, switchWeapon: true });
    expect(f.state).toBeGreaterThanOrEqual(3);
    expect(w.events.length).toBe(0);
  });

  test("Zielsuchrakete (3/9) und Fallrakete (3/8) fliegen los", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    give(w, 3, 9);
    step(w, fire);
    expect(shotsOf(w, 13).length).toBe(1);
    give(w, 3, 8);
    w.players[0]!.secondaryCooldown = 0;
    step(w, fire);
    expect(shotsOf(w, 12).length).toBe(1);
  });
});

describe("Beam", () => {
  const beam: PlayerInput = { ...NO_INPUT, beam: true };

  test("Laden 0,9 je Tick bis 165 (184 Ticks), Loslassen feuert mit 8500 · Stufe", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    const b = w.beams[0]!;
    step(w, beam, 183);
    expect(b.charge).toBeLessThan(165);
    step(w, beam);
    expect(b.charge).toBe(165);
    step(w, NO_INPUT);
    expect(b.running).toBe(true);
    expect(b.damage).toBe(8500);
    const x = b.tipX;
    step(w, NO_INPUT);
    expect(b.tipX === x + 24 || !b.running).toBe(true);
  });

  test("Beam 2 voll: Kraftphase 500 Ticks, Hauptschuss doppelt, Hintergrund aus (1P)", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    const b = w.beams[0]!;
    const bg = w.background;
    step(w, { ...NO_INPUT, switchBeam: true });
    step(w, NO_INPUT);
    expect(b.type).toBe(1);
    step(w, beam, 184);
    step(w, NO_INPUT);
    expect(b.power).toBe(true);
    expect(w.background).toBe(0);
    step(w, NO_INPUT, 499);
    expect(b.power).toBe(false);
    expect(w.background).toBe(bg);
  });

  test("Abschuss in der Kraftphase: Zustand 1 (Spaltung), Kombo zählt", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    w.beams[0]!.power = true;
    let i = -1;
    for (let t = 0; t < 3000 && i < 0; t++) {
      step(w, NO_INPUT);
      w.beams[0]!.power = true;
      i = w.enemies.items.findIndex(
        (e) =>
          e?.alive &&
          !e.inState &&
          e.def.boss <= 0 &&
          e.def.explosionSpec <= 0 &&
          e.def.bigDeath <= 0 &&
          e.parts.some((p) => p.visible && p.def.armored === 0 && p.def.damagesBody !== 0),
      );
    }
    const e = w.enemies.items[i]!;
    const p = e.parts.find((q) => q.visible && q.def.armored === 0)!;
    const [x, y] = w.enemies.partPos(e, p);
    const s = w.enemies.surface(p)!;
    w.enemies.hit(
      Math.round(x),
      Math.round(y),
      Math.round(x + s.rect.w),
      Math.round(y + s.rect.h),
      1e9,
      0,
      w["makeEnemyWorld"](),
    );
    expect([e.inState, e.deathState]).toEqual([true, 1]);
    expect(w.comboHits[0]).toBe(1);
    for (let t = 0; t < 31; t++) {
      w.beams[0]!.power = true;
      step(w, NO_INPUT);
    }
    expect(e.alive).toBe(false);
  });
});
