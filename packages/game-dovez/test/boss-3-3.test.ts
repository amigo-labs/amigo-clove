/**
 * Level 3-3 „Saw Machine“: Mauern (3 → 2 → 1), Sägen, Schutzplatten und Turbine des Bosses.
 * Befund: `docs/measurements/dovez-runtime.md` („Level 3-3“). Der Port war richtig; der
 * einfache Bot scheiterte, weil er auf gepanzerte Sägen zielte und aus x = 100 schoss.
 */
import { describe, expect, test } from "bun:test";
import { Campaign } from "../src/game/campaign";
import { DeathState, type Enemy } from "../src/sim/enemies";
import { cint } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadPlaySteps, loadTestLevel } from "./assets";
import { runLane } from "./lanebot";

const SLUG = "level3-3_saw_machine";

async function fresh(): Promise<World> {
  const { level, sprites } = await loadTestLevel(SLUG);
  return new World(level, sprites);
}

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([]);
    w.events.length = 0;
  }
}

function named(w: World, name: string): Enemy {
  const e = w.enemies.items.find((q) => q?.alive && q.def.name === name);
  if (!e) throw new Error(`${name} fehlt`);
  return e;
}

/** Schuss von `damage` auf den Punkt (x, y); gibt zurück, ob er auf ein gepanzertes Teil traf. */
function poke(w: World, x: number, y: number, damage: number): { armored: boolean; enemy: number } {
  const out = { enemy: -1, armored: false };
  const ew = w["makeEnemyWorld"]();
  w.enemies.hit(cint(x), cint(y), cint(x + 3), cint(y + 3), damage, 0, ew, { out });
  return out;
}

/**
 * Punkt in der Mauer (Teil 0 = Ziegel, Teil 1 = Schutzplatte, 54 × 284), x + 20: Die Mauern
 * stehen bei 500 / 550 / 600 und überlappen sich, dort trifft nur die eigene.
 */
function wallPoint(e: Enemy): [number, number] {
  return [e.actor.x + 20, e.actor.y + 140];
}

describe("Level 3-3: Aufbau", () => {
  test("Boss: nur Turbine (11) und Kanone (5) sind verwundbar, die Turbine hat eine Schutzplatte", async () => {
    const { level } = await loadTestLevel(SLUG);
    expect(level.levelLength).toBe(99999);
    const boss = level.enemies.find((e) => e.boss === 1)!;
    expect(boss.hitPoints).toBe(16000);
    const open = boss.parts.flatMap((p, i) => (p.armored === 0 ? [i] : []));
    expect(open).toEqual([5, 11]);
    // Teil 11: Turbine, Treffer ziehen vom Boss ab; Teil 12: Platte darüber, gepanzert
    expect(boss.parts[11]!.damagesBody).not.toBe(0);
    expect(boss.parts[12]!.armored).not.toBe(0);
    expect(boss.parts[12]!.damagesBody).not.toBe(0);
    // Platte: Bild 10 ist das schwarze 1×1-Bild (Schutz weg), Bild 9 das Ende der Folge „-“
    const g = level.groups[boss.parts[12]!.group]!;
    expect(g.frames[9]!.bmp).toBe("-");
    expect(g.frames[10]!.bmp.toLowerCase()).toBe("schwarz.bmp");
  });

  test("Mauern: HP 8000 / 30000 / 45000, Todes-Spawn Schienenkanone / Säge oben / Skript Letzte Mauer", async () => {
    const { level } = await loadTestLevel(SLUG);
    const by = (n: string) => level.enemies.find((e) => e.name === n)!;
    expect([by("Wand-3").hitPoints, by("Wand-2").hitPoints, by("Wand-1").hitPoints]).toEqual([
      8000, 30000, 45000,
    ]);
    // deathSpawn = Route · 1000 + Typ · 10 + (Anzahl − 1)
    const spawn = (n: string) => {
      const v = by(n).deathSpawn;
      return {
        type: level.enemies[Math.trunc((v % 1000) / 10)]!.name,
        route: level.routes[Math.trunc(v / 1000)]!.name,
      };
    };
    expect(spawn("Wand-3")).toEqual({ type: "Schienenkanone", route: "Schienenkanone Main" });
    expect(spawn("Wand-2")).toEqual({ type: "Säge oben", route: "Säge Oben" });
    expect(spawn("Wand-1")).toEqual({ type: "Schwarz", route: "Afterskript Letzte Mauer" });
    // Wand-3 hat keine Schutzplatte, Wand-2 und Wand-1 haben eine (Teil 1, gepanzert)
    expect(by("Wand-3").parts).toHaveLength(1);
    for (const n of ["Wand-2", "Wand-1"]) {
      expect(by(n).parts[0]!.armored).toBe(0);
      expect(by(n).parts[1]!.armored).not.toBe(0);
    }
    // die Sägen sind unzerstörbar: alle Teile gepanzert
    for (const n of ["Säge oben", "Säge unten"]) {
      expect(by(n).parts.every((p) => p.armored !== 0)).toBe(true);
    }
  });
});

describe("Level 3-3: Ablauf der Mauern", () => {
  test("Schutzplatten: Wand-2 erst ab Global 0 = 1, Wand-1 ab 2, Turbine ab 3; jeder Schuss vorher verpufft", async () => {
    const w = await fresh();
    run(w, 200);
    const w1 = named(w, "Wand-1");
    const w2 = named(w, "Wand-2");
    const w3 = named(w, "Wand-3");
    const boss = named(w, "Endgegner Main");
    expect(w.globals[0] ?? 0).toBe(0);
    // Wand-3 ohne Platte: sofort verwundbar
    const [x3, y3] = wallPoint(w3);
    expect(poke(w, x3, y3, 100).armored).toBe(false);
    expect(w3.actor.hp).toBe(7900);
    // Wand-2 und Wand-1: Platte davor, Schuss wird geschluckt, HP unverändert
    const [x2, y2] = wallPoint(w2);
    expect(w2.actor.x).toBeLessThan(w1.actor.x);
    expect(poke(w, x2, y2, 100)).toEqual({ enemy: w.enemies.items.indexOf(w2), armored: true });
    expect(w2.actor.hp).toBe(30000);
    const [x1, y1] = wallPoint(w1);
    expect(poke(w, x1, y1, 100)).toEqual({ enemy: w.enemies.items.indexOf(w1), armored: true });
    expect(w1.actor.hp).toBe(45000);
    // Turbine des Bosses (Teil 11 bei +18/+183, 122 × 77): Platte davor
    const ti = w.enemies.items.indexOf(boss);
    expect(poke(w, boss.actor.x + 18 + 60, boss.actor.y + 183 + 38, 100)).toEqual({
      enemy: ti,
      armored: true,
    });
    expect(boss.actor.hp).toBe(16000);

    // Wand-3 fällt: Schienenkanone setzt Global 0 = 1, Wand-2 öffnet sich
    poke(w, x3, y3, 1e9);
    run(w, 3);
    expect(w.globals[0]).toBe(1);
    expect(w2.parts[1]!.frame).toBe(2);
    expect(poke(w, x2, y2, 100).armored).toBe(false);
    expect(w2.actor.hp).toBe(29900);
    expect(poke(w, x1, y1, 100).armored).toBe(true);

    // Wand-2 fällt: Säge oben setzt Global 0 = 2, Wand-1 öffnet sich
    poke(w, x2, y2, 1e9);
    run(w, 3);
    expect(w.globals[0]).toBe(2);
    expect(w1.parts[1]!.frame).toBe(2);
    expect(poke(w, x1, y1, 100).armored).toBe(false);
    expect(w1.actor.hp).toBe(44900);
    expect(poke(w, boss.actor.x + 78, boss.actor.y + 221, 100).armored).toBe(true);

    // Wand-1 fällt: Skript Letzte Mauer setzt Global 0 = 3, Sägen ziehen ab, Turbine öffnet sich
    poke(w, x1, y1, 1e9);
    run(w, 3);
    expect(w.globals[0]).toBe(3);
    expect(boss.parts[12]!.frame).toBe(10);
    expect(poke(w, boss.actor.x + 78, boss.actor.y + 221, 100).armored).toBe(false);
    expect(boss.actor.hp).toBe(15900);
    // Sägen fliegen erst nach dem Anflug bis x = 400 (Schwingphase) ab, oben hinaus bzw. unten hinaus
    run(w, 1000);
    expect(w.enemies.items.some((e) => e?.alive && e.def.name.startsWith("Säge"))).toBe(false);
  });

  test("Sägen sind gepanzert: sie schlucken Schüsse und bleiben ganz", async () => {
    const w = await fresh();
    run(w, 60);
    poke(w, ...wallPoint(named(w, "Wand-3")), 1e9);
    run(w, 3);
    poke(w, ...wallPoint(named(w, "Wand-2")), 1e9);
    run(w, 150);
    const saw = named(w, "Säge oben");
    expect(saw.actor.x).toBeGreaterThan(0);
    // Blattmitte: Sägeblatt 255 × 255 bei (0, 2)
    const at = { x: saw.actor.x + 127, y: saw.actor.y + 129 };
    const r = poke(w, at.x, at.y, 1e9);
    expect(r).toEqual({ enemy: w.enemies.items.indexOf(saw), armored: true });
    expect(saw.alive).toBe(true);
    expect(saw.parts.map((p) => p.hp)).toEqual([500, 500]);
  });

  test("Boss: Abschuss der Turbine nach der letzten Mauer → Zustand 4, Level geschafft, weiter zu 4-1", async () => {
    const w = await fresh();
    run(w, 200);
    for (const n of ["Wand-3", "Wand-2", "Wand-1"]) {
      const e = named(w, n);
      const [x, y] = wallPoint(e);
      poke(w, x, y, 1e9);
      run(w, 3);
    }
    const boss = named(w, "Endgegner Main");
    poke(w, boss.actor.x + 78, boss.actor.y + 221, 1e9);
    expect([boss.inState, boss.deathState]).toEqual([true, DeathState.boss]);
    run(w, 800);
    expect(w.state).toBe(2);

    // Kampagne: nach 3-3 folgt 4-1
    const c = new Campaign(await loadPlaySteps());
    const levels: string[] = [];
    for (
      let a = c.next("de");
      a.kind !== "end";
      a = a.kind === "credits" && a.epilog ? c.epilog() : c.next("de")
    ) {
      if (a.kind === "level") levels.push(a.slug);
    }
    expect(levels[levels.indexOf(SLUG) + 1]).toBe("level4-1_midtown_madness");
  });
});

describe("Level 3-3: Pilot", () => {
  test("Bahn-Pilot besiegt den Boss und schließt das Level ab", async () => {
    const r = await runLane(SLUG, 30000);
    expect(r.state).toBe(2);
    expect(r.ticks).toBeLessThan(10000);
    const boss = r.world.enemies.items.find((e) => e?.def.boss === 1)!;
    expect([boss.inState, boss.deathState]).toEqual([true, DeathState.boss]);
    expect(r.world.globals[0]).toBe(3);
  }, 60000);
});
