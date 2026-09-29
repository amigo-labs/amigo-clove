/**
 * Level 5-3 „Rumbler“: Vier Dampfer und der Boss mit Schutzschild. Der Kern (Teil 4) ist das
 * einzige ungepanzerte Teil des Hauptteils und liegt hinter dem Schild (Teil 8); der Schild
 * öffnet sich erst, wenn alle vier Dampfer tot sind (`SetGlobal 0…3 = 2` durch ihre
 * Todes-Kinder). Befund: `docs/measurements/dovez-runtime.md`, „Level 5-3“.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Manifest } from "@clove/core";
import type { PlayStep } from "@clove/formats";
import { Campaign } from "../src/game/campaign";
import { DeathState, type Enemy } from "../src/sim/enemies";
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { cint } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";
import { runLevel } from "./bot";
import { botInputVulnerable } from "./botVulnerable";

const SLUG = "level5-3_rumbler";
/** Typen im Level: Boss, Dampfer unten/oben (klein), unten2/oben2 (groß). */
const T = { boss: 0, unten: 1, oben: 2, oben2: 5, unten2: 6 } as const;
const DAMPFER_TYPES: readonly number[] = [T.unten, T.oben, T.oben2, T.unten2];
const CORE = 4;
const SHIELD = 8;

async function newWorld(): Promise<World> {
  const { level, sprites } = await loadTestLevel(SLUG);
  return new World(level, sprites);
}

function run(w: World, ticks: number, input: PlayerInput = NO_INPUT): void {
  for (let t = 0; t < ticks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([input, NO_INPUT]);
    w.events.length = 0;
  }
}

const boss = (w: World): Enemy => w.enemies.items.find((e) => e?.alive && e.def.boss === 1)!;
const dampfer = (w: World): Enemy[] =>
  w.enemies.items.filter((e): e is Enemy => !!e?.alive && DAMPFER_TYPES.includes(e.type));

/** Ein Spielerschuss (Schaden `damage`, nicht durchschlagend) auf die Oberkante links von Teil `part`. */
function shootPart(w: World, e: Enemy, part: number, damage: number): number {
  const p = e.parts[part]!;
  const [x, y] = w.enemies.partPos(e, p);
  const s = w.enemies.surface(p)!;
  const row = cint((s.topRow + s.bottomRow) / 2);
  const l = s.spans[row * 2] as number;
  const ew = w["makeEnemyWorld"]();
  // 4 × 4 px auf der ersten belegten Spalte der mittleren Zeile
  return w.enemies.hit(
    cint(x) + l,
    cint(y) + row,
    cint(x) + l + 4,
    cint(y) + row + 4,
    damage,
    0,
    ew,
  );
}

describe("Level 5-3 Rumbler: Aufbau", () => {
  test("fünf Gegner bei Tick 0: vier Dampfer und der Boss", async () => {
    const w = await newWorld();
    run(w, 2);
    const alive = w.enemies.items.filter((e) => e?.alive);
    expect(alive.map((e) => e!.type).toSorted()).toEqual([0, 1, 2, 5, 6]);
    expect(
      dampfer(w)
        .map((e) => [e.type, e.actor.x, e.actor.y].join(","))
        .toSorted(),
    ).toEqual(["1,262,419", "2,262,75", "5,451,75", "6,451,419"]);
    expect(boss(w).actor.hp).toBe(40000);
  });

  test("Boss: 9 Teile, nur der Kern ist ungepanzert und nimmt Schaden vom Körper", async () => {
    const w = await newWorld();
    run(w, 1);
    const b = boss(w);
    expect(b.parts).toHaveLength(9);
    expect(b.parts.map((p) => p.def.armored !== 0)).toEqual([
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(b.parts.every((p) => p.def.damagesBody !== 0)).toBe(true);
    expect(b.def.boss).toBe(1);
  });

  test("Boss fliegt bis x = 521 ein und bleibt dort", async () => {
    const w = await newWorld();
    run(w, 600);
    expect([boss(w).actor.x, boss(w).actor.y]).toEqual([521, 130]);
    run(w, 3000);
    expect([boss(w).actor.x, boss(w).actor.y]).toEqual([521, 130]);
  });
});

describe("Level 5-3 Rumbler: Schutzschild und Dampfer", () => {
  test("Schuss auf den Kern in Phase 1: vom Schild verschluckt, Boss unverletzt", async () => {
    const w = await newWorld();
    run(w, 700);
    const b = boss(w);
    expect(b.parts[SHIELD]!.frame).toBe(0);
    // Kern-Mitte, Schuss von links: der Schild (Teil 8, gepanzert) wird zuerst geprüft
    const p = b.parts[CORE]!;
    const [x, y] = w.enemies.partPos(b, p);
    const ew = w["makeEnemyWorld"]();
    const rest = w.enemies.hit(cint(x) + 40, cint(y) + 45, cint(x) + 60, cint(y) + 55, 999, 0, ew);
    expect(rest).toBe(0);
    expect(b.actor.hp).toBe(40000);
    // auch ein Schuss auf den Schild selbst
    expect(shootPart(w, b, SHIELD, 999)).toBe(0);
    expect(b.actor.hp).toBe(40000);
  });

  test("Dampfer sind ungepanzert; ein Treffer zieht vom Körper ab, sein Tod setzt Global i = 2", async () => {
    const w = await newWorld();
    run(w, 2);
    const d = dampfer(w).find((e) => e.type === T.unten)!;
    const idx = w.enemies.items.indexOf(d);
    const hp = d.actor.hp;
    expect(shootPart(w, d, 0, 1000)).toBe(0);
    expect(d.actor.hp).toBe(hp - 1000);
    expect(w.globals[2]).toBeUndefined();
    // Abschuss: gewöhnlicher Tod (kein Boss, keine Nova) — der Dampfer zerplatzt sofort
    shootPart(w, d, 0, 1e9);
    expect(w.enemies.items[idx]?.alive).toBe(false);
    // Todes-Kinder (deathSpawn 12011: Typ 1, Route 12, zwei Stück) laufen Route 12 und melden den Tod
    run(w, 3);
    expect(w.globals[2]).toBe(2);
    expect(dampfer(w).filter((e) => e.type === T.unten)).toHaveLength(0);
  });

  test("jeder Dampfer meldet seinen Tod in seinem eigenen Global (0 oben-, 1 oben2-, 2 unten-, 3 unten2)", async () => {
    for (const [type, slot] of [
      [T.oben, 0],
      [T.oben2, 1],
      [T.unten, 2],
      [T.unten2, 3],
    ] as const) {
      const w = await newWorld();
      run(w, 2);
      const d = dampfer(w).find((e) => e.type === type)!;
      shootPart(w, d, 0, 1e9);
      run(w, 3);
      expect(w.globals[slot]).toBe(2);
      for (const other of [0, 1, 2, 3].filter((s) => s !== slot)) {
        expect(w.globals[other] ?? 0).not.toBe(2);
      }
    }
  });

  test("Boss weckt immer nur einen Dampfer (Global = 1) und wartet dann 500 Ticks", async () => {
    const w = await newWorld();
    let firstAt = -1;
    for (let t = 0; t < 1500; t++) {
      run(w, 1);
      const ones = [0, 1, 2, 3].filter((i) => w.globals[i] === 1).length;
      expect(ones).toBeLessThanOrEqual(1);
      if (ones === 1 && firstAt < 0) firstAt = t;
    }
    expect(firstAt).toBeGreaterThan(200);
    expect(firstAt).toBeLessThan(700);
  });

  test("alle vier Dampfer tot: Phase 2 — Global 4 = 1, Schild öffnet sich (Bild 2…6), Kern trifft", async () => {
    const w = await newWorld();
    run(w, 700);
    const b = boss(w);
    const coreHp = b.parts[CORE]!.hp;
    for (const d of dampfer(w)) shootPart(w, d, 0, 1e9);
    // Todes-Kinder melden, die Boss-Schleife erkennt 4 × 2 = 8 und springt in Phase 2
    // (der Boss beendet ggf. erst eine laufende Wartezeit von 500 Ticks)
    for (let t = 0; t < 600 && w.globals[4] !== 1; t++) run(w, 1);
    run(w, 1);
    expect(w.globals.slice(0, 5)).toEqual([2, 2, 2, 2, 1]);
    expect(dampfer(w)).toHaveLength(0);
    // Bild 2…5 je 6 Ticks, Bild 6 (`schutz5`, Dauer 9999) bleibt stehen
    expect(b.parts[SHIELD]!.frame).toBeGreaterThanOrEqual(2);
    run(w, 40);
    expect(b.parts[SHIELD]!.frame).toBe(6);
    // jetzt trifft ein Schuss von links den Kern und zieht vom Körper ab; der Kern selbst behält 500
    const [x, y] = w.enemies.partPos(b, b.parts[CORE]!);
    const ew = w["makeEnemyWorld"]();
    const rest = w.enemies.hit(cint(x) + 20, cint(y) + 45, cint(x) + 40, cint(y) + 55, 300, 0, ew);
    expect(rest).toBe(0);
    expect(b.actor.hp).toBe(39700);
    expect(b.parts[CORE]!.hp).toBe(coreHp);
    expect(b.parts[CORE]!.visible).toBe(true);
  });

  test("Kern-Treffer auf 0 Körper-HP: Boss-Finale (Zustand 4)", async () => {
    const w = await newWorld();
    run(w, 700);
    for (const d of dampfer(w)) shootPart(w, d, 0, 1e9);
    for (let t = 0; t < 600 && w.globals[4] !== 1; t++) run(w, 1);
    run(w, 60);
    const b = boss(w);
    const [x, y] = w.enemies.partPos(b, b.parts[CORE]!);
    const ew = w["makeEnemyWorld"]();
    w.enemies.hit(cint(x) + 20, cint(y) + 45, cint(x) + 40, cint(y) + 55, 1e9, 0, ew);
    expect([b.inState, b.deathState]).toEqual([true, DeathState.boss]);
  });
});

describe("Level 5-3 Rumbler: Bot", () => {
  test("Zielwahl: der Schwachstellen-Bot fliegt auf die Kernmitte", async () => {
    const w = await newWorld();
    run(w, 700);
    for (const d of dampfer(w)) shootPart(w, d, 0, 1e9);
    for (let t = 0; t < 600 && w.globals[4] !== 1; t++) run(w, 1);
    run(w, 60);
    const b = boss(w);
    const s = w.enemies.surface(b.parts[CORE]!)!;
    const coreMid = b.actor.y + b.parts[CORE]!.def.y + (s.topRow + s.bottomRow) / 2;
    const p = w.players[0]!;
    p.y = 40;
    const inp = botInputVulnerable(w);
    expect(inp.down).toBe(true);
    expect(inp.up).toBe(false);
    p.y = coreMid - 35;
    const inp2 = botInputVulnerable(w);
    expect([inp2.up, inp2.down]).toEqual([false, false]);
  });

  test("Bot schafft das Level: Dampfer, Schild, Kern, Boss-Finale, Level geschafft", async () => {
    const r = await runLevel(SLUG, 30000, botInputVulnerable);
    expect(r.state).toBe(2);
    expect(r.bossSeen).toBe(true);
    expect(r.ticks).toBeLessThan(30000);
    expect(r.score).toBeGreaterThan(200000);
  }, 60000);

  test("danach führt Play.txt weiter zu Level 6-1", async () => {
    const ROOT = join(import.meta.dir, "../../../assets/dovez");
    const manifest = (await Bun.file(join(ROOT, "manifest.json")).json()) as Manifest;
    const file = manifest.entries.find((e) => e.id === "data/play")!.file;
    const steps = (await Bun.file(join(ROOT, file)).json()) as PlayStep[];
    const c = new Campaign(steps);
    const slugs: string[] = [];
    for (
      let a = c.next("de");
      a.kind !== "end";
      a = a.kind === "credits" ? c.next("de") : c.next("de")
    ) {
      if (a.kind === "level") slugs.push(a.slug);
    }
    const i = slugs.indexOf(SLUG);
    expect(i).toBeGreaterThan(0);
    expect(slugs[i + 1]).toBe("level6-1_ice_palace");
  });
});
