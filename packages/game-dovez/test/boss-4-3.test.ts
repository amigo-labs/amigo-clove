/**
 * Level 4-3 (`level4-3_cityboss`): der Cityboss, Länge 99999 — das Level endet über den Boss-Tod.
 * Befund und Adressen: `docs/measurements/dovez-runtime.md`, Abschnitt „Level 4-3“.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Manifest } from "@clove/core";
import type { PlayStep } from "@clove/formats";
import { Campaign, type CampaignAction } from "../src/game/campaign";
import { DeathState, ENEMY_CAPACITY } from "../src/sim/enemies";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";
import { reachablePoint, runHunt } from "./hunter";

const SLUG = "level4-3_cityboss";

/** Teilindizes des Cityboss (`Cityboss`, 21 Teile). */
const P = {
  hauptgenerator: 0,
  arm1: 1,
  torso: 2,
  torsoDeckel: 3,
  magnetarm: 5,
  oberarm: 6,
  raketenhand: 7,
  brustgenerator: 8,
  brustDeckel: 9,
  generatorVorn: 14,
  vornDeckel: 15,
  generatorHinten: 16,
} as const;

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([]);
    w.events.length = 0;
  }
}

function runUntil(w: World, done: () => boolean, max: number): number {
  let t = 0;
  for (; t < max && !done(); t++) run(w, 1);
  return t;
}

async function newWorld(): Promise<World> {
  const { level, sprites } = await loadTestLevel(SLUG);
  return new World(level, sprites);
}

function bossIndex(w: World): number {
  return w.enemies.items.findIndex((e) => e?.alive && e.def.boss === 1);
}

/** Ein Spielertreffer (16 × 16) auf das Teil `part`, dort, wo es das oberste Teil ist. */
function strike(w: World, part: number, damage: number): number {
  const i = bossIndex(w);
  const at = reachablePoint(w, i, part);
  if (!at) throw new Error(`Teil ${part} liegt nicht frei`);
  const ew = w["makeEnemyWorld"]();
  return w.enemies.hit(at[0], at[1], at[0] + 16, at[1] + 16, damage, 0, ew);
}

const free = (w: World, part: number) => reachablePoint(w, bossIndex(w), part) !== undefined;

describe("Level 4-3: Cityboss", () => {
  test("Rückenschutz: von links (Schiff bei x = 100) trifft kein Schuss ein ungepanzertes Teil", async () => {
    const w = await newWorld();
    const ew = w["makeEnemyWorld"]();
    let checked = 0;
    for (const at of [400, 900, 1300, 1700, 2100]) {
      run(w, at - w.tick);
      const bi = bossIndex(w);
      expect(bi).toBeGreaterThanOrEqual(0);
      for (let y = 0; y < 500; y += 4) {
        for (let x = 156; x < 800; x += 8) {
          const out = { enemy: -1, armored: false };
          // Schaden −1: nur prüfen, ob etwas überlappt (Force-Prüfung), `out` nennt das oberste Teil
          w.enemies.hit(x, y, x + 16, y + 16, -1, 0, ew, { out });
          if (out.enemy < 0) continue;
          if (out.enemy === bi) {
            expect(out.armored).toBe(true);
            checked++;
          }
          break;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  test("hinten offen: der Generator hinten (Teil 16) ist von innen erreichbar, die anderen sind verdeckt", async () => {
    const w = await newWorld();
    run(w, 1000);
    const b = w.enemies.items[bossIndex(w)]!;
    // Deckel (Teile 3, 9, 15) zeigen das Bild des Teils darunter, gepanzert
    for (const c of [P.torsoDeckel, P.brustDeckel, P.vornDeckel]) {
      expect(b.parts[c]!.def.armored).not.toBe(0);
      expect(b.parts[c]!.frame).toBe(0);
    }
    expect(free(w, P.generatorHinten)).toBe(true);
    for (const p of [P.torso, P.brustgenerator, P.generatorVorn, P.hauptgenerator]) {
      expect(free(w, p)).toBe(false);
    }
    // ein Treffer zieht dem Teil, nicht dem Gegner Energie ab (`damagesBody` = 0)
    const hp = b.parts[P.generatorHinten]!.hp;
    strike(w, P.generatorHinten, 120);
    expect(b.parts[P.generatorHinten]!.hp).toBe(hp - 120);
    expect(b.actor.hp).toBe(75000);
  });

  test("Phasen: Generator hinten → Brust- und Frontgenerator → Torso → Hauptgenerator → Tod", async () => {
    const w = await newWorld();
    run(w, 1000);
    const i = bossIndex(w);
    const b = w.enemies.items[i]!;
    const part = (j: number) => b.parts[j]!;

    strike(w, P.generatorHinten, 1e9);
    expect(part(P.generatorHinten).visible).toBe(false);
    // die Route prüft das erst nach dem Hin- und Rückweg (~2300 Ticks); dann öffnen sich die Deckel
    expect(part(P.brustDeckel).frame).toBe(0);
    expect(runUntil(w, () => part(P.brustDeckel).frame === 2, 6000)).toBeLessThan(6000);
    expect(part(P.vornDeckel).frame).toBe(2);
    expect(part(P.torsoDeckel).frame).toBe(0);
    expect(runUntil(w, () => free(w, P.brustgenerator) && free(w, P.generatorVorn), 600)).toBe(0);
    expect(free(w, P.torso)).toBe(false);

    strike(w, P.brustgenerator, 1e9);
    strike(w, P.generatorVorn, 1e9);
    expect(runUntil(w, () => part(P.torsoDeckel).frame === 2, 3000)).toBeLessThan(3000);
    expect(runUntil(w, () => free(w, P.torso), 600)).toBeLessThan(600);
    expect(free(w, P.hauptgenerator)).toBe(false);

    strike(w, P.torso, 1e9);
    // `Explode` (Route 7) sprengt Arme und Waffenhände, sobald der Torso weg ist
    const arms = [P.arm1, P.magnetarm, P.oberarm, P.raketenhand];
    expect(runUntil(w, () => arms.every((a) => !part(a).visible), 3000)).toBeLessThan(3000);
    expect(runUntil(w, () => free(w, P.hauptgenerator), 600)).toBeLessThan(600);

    // der Hauptgenerator zieht dem ganzen Gegner Energie ab (`damagesBody` ≠ 0)
    expect(b.actor.hp).toBe(75000);
    strike(w, P.hauptgenerator, 74999);
    expect(b.actor.hp).toBe(1);
    expect(b.inState).toBe(false);
    strike(w, P.hauptgenerator, 120);
    expect([b.inState, b.deathState]).toEqual([true, DeathState.boss]);
    // Finale: 520 Ticks bis zum Levelausflug, dann Level geschafft
    run(w, 1200);
    expect(w.state).toBe(2);
  });

  test("Jäger-Bot spielt das Level durch: Boss besiegt, Zustand 2, Gegnerzahl begrenzt", async () => {
    const r = await runHunt(SLUG, 30000);
    expect(r.bossSeen).toBe(true);
    expect(r.state).toBe(2);
    expect(r.ticks).toBeLessThan(30000);
    expect(r.world.enemies.items.some((e) => e?.alive && e.def.boss === 1)).toBe(false);
    // 190 000 = Energie des Bosses (75 000) und seiner vier Generatoren (115 000), dazu Kleinteile
    expect(r.score).toBeGreaterThanOrEqual(190000);
    // gemessen 23; ohne Culling wächst es nur um ein paar Granaten je 500 Ticks, nie über die Slots
    expect(r.peakEnemies).toBeLessThan(60);
    expect(r.peakEnemies).toBeLessThanOrEqual(ENEMY_CAPACITY);
  });

  test("Kampagne: nach 4-3 kommt 5-1", async () => {
    const root = join(import.meta.dir, "../../../assets/dovez");
    const manifest = (await Bun.file(join(root, "manifest.json")).json()) as Manifest;
    const play = manifest.entries.find((e) => e.id === "data/play")!.file;
    const steps = (await Bun.file(join(root, play)).json()) as PlayStep[];
    const c = new Campaign(steps);
    const levels: string[] = [];
    for (let a: CampaignAction = c.next(true); a.kind !== "end"; a = c.next(true)) {
      if (a.kind === "level") levels.push(a.slug);
    }
    const k = levels.indexOf(SLUG);
    expect(k).toBeGreaterThan(0);
    expect(levels[k + 1]).toBe("level5-1_atlantis");
  });
});

/** Eine Granate (Typ 2, Route 5) bei (x, 100), Wurf nach links (`SetGlobal 0, −5` des Werfers). */
async function grenade(x: number): Promise<{ w: World; i: number }> {
  const w = await newWorld();
  run(w, 60);
  w.globals[0] = -5;
  const i = w.enemies.add(2, 5, w.tick, 100, x, w.rnd);
  expect(i).toBeGreaterThanOrEqual(0);
  return { w, i };
}

describe("Level 4-3: Granaten (Route 5) ohne Culling", () => {
  test("fällt auf das Dach (Ebene 3, y = 513, x 0…1596) und zerplatzt still", async () => {
    const { w, i } = await grenade(700);
    const e = w.enemies.items[i]!;
    run(w, 30);
    expect(e.alive).toBe(true);
    expect(runUntil(w, () => !e.alive, 400)).toBeLessThan(400);
    expect(e.actor.y).toBeGreaterThan(400);
    expect(e.actor.y).toBeLessThan(560);
  });

  test("landet sie links von x = 0, fehlt der Boden: sie fällt ewig (das Original löscht nicht)", async () => {
    const { w, i } = await grenade(300);
    const e = w.enemies.items[i]!;
    run(w, 1500);
    expect(e.alive).toBe(true);
    expect(e.actor.x).toBeLessThan(-1000);
    expect(e.actor.y).toBeGreaterThan(5000);
    run(w, 1500);
    expect(e.alive).toBe(true);
    expect(e.actor.y).toBeGreaterThan(20000);
  });

  test("Slottabelle: 101 Gegner, dann liefert AddEnemy still −1 (0x575FF0)", async () => {
    const w = await newWorld();
    let last = 0;
    for (let k = 0; k < 150; k++) last = w.enemies.add(2, 5, w.tick, 100, 300, w.rnd);
    expect(last).toBe(-1);
    expect(w.enemies.items.filter((e) => e?.alive)).toHaveLength(ENEMY_CAPACITY);
  });
});
