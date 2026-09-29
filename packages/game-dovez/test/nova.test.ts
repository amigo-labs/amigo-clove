/** Super-Nova (`SpielNova`): Auslösen, Verbrauch, Varianten, Gegnerzustände 0/2/−1, Ende, Pausen. */
import { describe, expect, test } from "bun:test";
import { DeathState } from "../src/sim/enemies";
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

const nova: PlayerInput = { ...NO_INPUT, nova: true };

function step(w: World, input: PlayerInput = NO_INPUT, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([input, NO_INPUT]);
    w.events.length = 0;
  }
}

const alive = (w: World) => w.enemies.items.filter((e) => e?.alive);
const activeShots = (w: World) => w.fire.shots.filter((s) => s.active).length;

/** Skyfight bis mindestens ein Gegner lebt und Gegnerschüsse fliegen. */
async function battle(ship: 0 | 1 = 0, seed?: number): Promise<World> {
  const { level, sprites } = await loadTestLevel("level1-1_skyfight");
  const w = new World(level, sprites, { ship, ...(seed !== undefined ? { seed } : {}) });
  for (let t = 0; t < 3000; t++) {
    step(w);
    if (alive(w).length >= 2 && activeShots(w) > 0) return w;
  }
  throw new Error("keine Gegner");
}

/** Bis die Nova vorbei ist (höchstens `max` Ticks); Anzahl der Ticks. */
function runOut(w: World, max = 2000): number {
  let n = 0;
  while (w.nova && n < max) {
    step(w);
    n++;
  }
  return n;
}

/** Lauf mit Blitz-Nova (Art 1) und 50 Ticks danach, als Zustandsabdruck. */
async function novaRun(): Promise<string> {
  const w = await battle(0, 1234);
  w.particles[0]!.kind = 1;
  step(w, nova);
  runOut(w);
  step(w, NO_INPUT, 50);
  return JSON.stringify({
    tick: w.tick,
    seed: w.rnd.seed,
    score: w.score,
    enemies: alive(w).map((e) => [e!.type, e!.actor.x, e!.actor.y, e!.actor.hp]),
  });
}

describe("Super-Nova", () => {
  test("Abschusszähler B48[0].54: die Nova zählt jede zerplatzende Gegnerbox", async () => {
    const w = await battle();
    const before = w.kills;
    w.particles[0]!.kind = 1;
    step(w, nova);
    runOut(w);
    step(w, NO_INPUT, 60);
    expect(w.kills).toBeGreaterThan(before);
  });

  test("Auslösen mit leerem Partikel: Variante 0, Partikel weg, Schüsse weg, Töne", async () => {
    const w = await battle();
    const p = w.players[0]!;
    expect(p.selected).toBe(0);
    expect(w.particles[0]!.present).toBe(true);
    expect(w.particles[0]!.kind).toBe(0);
    const bg = w.background;
    w.step([nova]);
    expect(w.nova).toBe(true);
    expect(w.novaState.variant).toBe(0);
    expect(w.particles[0]!.present).toBe(false);
    // NextPartikel wählt den nächsten aktiven Platz
    expect(p.selected).toBe(1);
    expect(activeShots(w)).toBe(0);
    expect(w.background).toBe(0);
    expect(w.novaState.savedBackground).toBe(bg);
    const sfx = w.events.flatMap((e) => (e.kind === "sfx" ? [e.name] : []));
    expect(sfx).toContain("nova");
    expect(sfx).toContain("novaschuss");
    expect(sfx).toContain("press_d");
    expect(w.events.some((e) => e.kind === "soundOff")).toBe(true);
    // wählbare Gegner eingefroren
    for (const e of alive(w)) expect([e!.inState, e!.deathState]).toEqual([true, 0]);
  });

  test("Partikel mit Waffe: Art wird die Variante, der Platz bleibt (Art 0)", async () => {
    const w = await battle();
    const r = w.particles[0]!;
    r.kind = 3;
    r.level = 2;
    w.step([nova]);
    expect(w.novaState.variant).toBe(3);
    expect([r.present, r.kind]).toEqual([true, 0]);
    expect(w.players[0]!.selected).toBe(0);
  });

  test("ohne Partikel bzw. ohne Force keine Nova", async () => {
    const w = await battle();
    for (const r of w.particles) r.present = false;
    w.players[0]!.selected = -1;
    step(w, nova, 3);
    expect(w.nova).toBe(false);
    const f = await battle(1);
    expect(f.force.present).toBe(false);
    step(f, nova, 3);
    expect(f.nova).toBe(false);
  });

  test("D-Phyton: Force wird verbraucht, Variante 6, 7 oder 8", async () => {
    const w = await battle(1);
    w.force.present = true;
    Object.assign(w.force, { x: 100, y: 200, state: 1 });
    w.step([nova]);
    expect(w.nova).toBe(true);
    expect(w.force.present).toBe(false);
    expect([6, 7, 8]).toContain(w.novaState.variant);
    expect(w.novaState.particle).toBe(-1);
    runOut(w);
    expect(w.nova).toBe(false);
  });

  test("gemeinsamer Riegel: gehalten löst nur einmal aus, erneut erst nach dem Loslassen", async () => {
    const w = await battle();
    let n = 0;
    do {
      step(w, nova);
      n++;
    } while (w.nova && n < 1000);
    expect(n).toBeGreaterThan(50);
    // Taste weiter gehalten: kein zweites Auslösen, obwohl Platz 1 noch da ist
    step(w, nova, 5);
    expect(w.nova).toBe(false);
    step(w);
    step(w, nova);
    expect(w.nova).toBe(true);
    expect(w.particles[1]!.present).toBe(false);
  });

  test("während der Nova ruhen Zeitleiste, Gegnerschüsse, Emitter und Steuerung", async () => {
    const w = await battle();
    const t0 = w.tick;
    step(w, nova);
    // Auslöse-Tick: die Zeitleiste lief noch
    expect(w.tick).toBe(t0 + 1);
    const shot = w.fire.shots[0]!;
    shot.active = true;
    shot.shockwave = false;
    shot.route = -1;
    Object.assign(shot.actor, { x: 400, y: 200 });
    shot.vx = -5;
    shot.vy = 0;
    const emitters = w.fire.emitters.map((e) => [...e.delay]);
    const p = w.players[0]!;
    const [px, py] = [p.x, p.y];
    step(w, { ...nova, left: true, up: true, fire: true }, 10);
    expect(w.nova).toBe(true);
    expect(w.tick).toBe(t0 + 1);
    expect([shot.actor.x, shot.actor.y]).toEqual([400, 200]);
    expect(w.fire.emitters.map((e) => [...e.delay])).toEqual(emitters);
    expect([p.x, p.y]).toEqual([px, py]);
    while (w.nova && w.novaState.counter > 0) step(w);
    // End-Tick: die Nova schaltet mitten im Tick ab, Gegnerschüsse laufen schon wieder
    const t1 = w.tick;
    step(w);
    expect(w.nova).toBe(false);
    expect(w.tick).toBe(t1);
    expect(shot.actor.x).toBe(395);
    step(w);
    expect(w.tick).toBe(t1 + 1);
  });

  test("Ring (Variante 0): Treffer −10000 auf die Gesamt-HP, Punkte; Ende setzt alles zurück", async () => {
    const w = await battle();
    const bg = w.background;
    const score = w.score[0]!;
    const hp = new Map(alive(w).map((e) => [e!, e!.actor.hp]));
    step(w, nova);
    const n = runOut(w);
    // Dauer C0 + 1 mit C0 ≥ 100
    expect(n + 1).toBeGreaterThanOrEqual(101);
    expect(w.nova).toBe(false);
    expect(w.background).toBe(bg);
    for (const [e, h] of hp) {
      if (e.alive) {
        expect(e.actor.hp).toBeCloseTo(h - 10000, 0);
        expect([e.inState, e.deathState]).toEqual([false, 0]);
      }
    }
    expect([...hp.keys()].some((e) => !e.alive)).toBe(true);
    expect(w.score[0]!).toBeGreaterThan(score);
  });

  test("nova-immune Gegner: Zustand −1 während der Nova, danach wieder normal", async () => {
    const w = await battle();
    const e = alive(w)[0]!;
    const def = { ...e.def, novaImmune: 1 };
    e.def = def;
    const hp = e.actor.hp;
    step(w, nova);
    // im Auslöse-Tick lief der Gegner noch, danach steht er
    const [x, y] = [e.actor.x, e.actor.y];
    expect([e.inState, e.deathState]).toEqual([true, DeathState.hidden]);
    runOut(w);
    expect(e.alive).toBe(true);
    expect(e.actor.hp).toBe(hp);
    expect([e.inState, e.deathState]).toEqual([false, 0]);
    // stand während der Nova still
    expect(e.actor.x).toBeCloseTo(x, 3);
    expect(e.actor.y).toBeCloseTo(y, 3);
  });

  test("Zielsuch-Schüsse (Art 5): Treffer → Zustand 2, 40 Ticks, dann weg", async () => {
    const w = await battle();
    w.particles[0]!.kind = 5;
    const targets = alive(w);
    step(w, nova);
    expect(w.novaState.variant).toBe(5);
    let seen2 = false;
    const t2 = new Map<object, number>();
    for (let t = 0; t < 1000 && w.nova; t++) {
      step(w);
      for (const e of targets) {
        if (e!.alive && e!.inState && e!.deathState === DeathState.nova) {
          seen2 = true;
          t2.set(e!, (t2.get(e!) ?? 0) + 1);
        }
      }
    }
    expect(seen2).toBe(true);
    // Treffer-Tick und 39 weitere; im 40. Zustandstick zerplatzt er
    for (const n of t2.values()) expect(n).toBe(40);
    expect(targets.every((e) => !e!.alive)).toBe(true);
  });

  test("Bildbruch (Art 3): Hintergrund −1, Blit-Listen, zurück am Ende", async () => {
    const w = await battle();
    const bg = w.background;
    w.particles[0]!.kind = 3;
    step(w, nova);
    expect(w.background).toBe(-1);
    expect(w.novaState.blits[1].length).toBeGreaterThan(0);
    expect(w.novaState.blits[1].length % 6).toBe(0);
    runOut(w);
    expect(w.background).toBe(bg);
    step(w);
    expect(w.novaState.blits[0].length + w.novaState.blits[1].length).toBe(0);
  });

  test("alle Partikel-Varianten laufen und enden", async () => {
    for (const kind of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const w = await battle();
      w.particles[0]!.kind = kind;
      w.force.x = 300;
      w.force.y = 200;
      step(w, nova);
      expect(w.nova).toBe(true);
      const n = runOut(w, 20000);
      expect(w.nova).toBe(false);
      expect(n).toBeGreaterThan(20);
      // eingefroren oder versteckt bleibt niemand
      for (const e of alive(w)) expect(e!.inState && e!.deathState <= 0).toBe(false);
    }
  });

  test("Boss-Finale verhindert das Auslösen", async () => {
    const w = await battle();
    w.enemies.enterState(alive(w)[0]!, DeathState.boss);
    w.step([nova]);
    expect(w.nova).toBe(false);
  });

  test("deterministisch: zwei Läufe mit Nova sind gleich", async () => {
    expect(await novaRun()).toBe(await novaRun());
  });
});
