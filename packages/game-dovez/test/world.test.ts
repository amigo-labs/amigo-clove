/** DoveZ-Weltsimulation gegen die gebauten Assets aller Level. */
import { describe, expect, test } from "bun:test";
import { NO_INPUT, Player, updatePlayer, type PlayerInput } from "../src/sim/player";
import { World } from "../src/sim/world";
import { LEVEL_SLUGS, loadTestLevel } from "./assets";

const fire: PlayerInput = { ...NO_INPUT, fire: true };

/** Prüfsumme über Positionen von Kacheln, Gegnern, Schüssen, Spielern. */
function hash(w: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul((h ^ (Math.fround(v) * 1000)) | 0, 0x01000193) >>> 0;
  };
  const mix2 = (x: number, y: number) => {
    mix(x);
    mix(y);
  };
  for (const l of w.layers) for (const t of l.tiles) if (t.active) mix2(t.x, t.y);
  for (const e of w.enemies.items) {
    if (e?.alive) {
      mix2(e.actor.x, e.actor.y);
      mix(e.actor.hp);
    }
  }
  for (const s of w.fire.shots) if (s.active) mix2(s.actor.x, s.actor.y);
  for (const p of w.players) {
    mix2(p.x, p.y);
    mix(p.energy);
  }
  mix(w.score[0] ?? 0);
  return h;
}

describe("Welt", () => {
  test("Vorlauf platziert Kacheln mit negativem Tick (Tutorial: Tick −762 → x 38)", async () => {
    const { level, sprites } = await loadTestLevel("level0-1_tutorial");
    const entry = level.layers[3]!.entries.find((e) => e.tick === -762 && e.kind === 0)!;
    expect(entry).toBeDefined();
    const w = new World(level, sprites);
    const tiles = w.layers[3]!.tiles.filter((t) => t.active);
    expect(tiles.some((t) => t.x === 38 && t.y === entry.p3 && t.group === entry.p1)).toBe(true);
  });

  test("alle 27 Level laufen 3000 Ticks unverwundbar mit Dauerfeuer", async () => {
    for (const slug of LEVEL_SLUGS) {
      const { level, sprites } = await loadTestLevel(slug);
      const w = new World(level, sprites);
      for (let t = 0; t < 3000 && w.state === 0; t++) {
        for (const p of w.players) p.invulnerable = 2;
        w.step([fire]);
        w.events.length = 0;
      }
      expect([slug, w.state === 1]).toEqual([slug, false]);
    }
    expect(LEVEL_SLUGS.length).toBe(27);
  }, 60_000);

  test("deterministisch: zwei Läufe mit gleichem Seed und gleicher Eingabe sind gleich", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const run = () => {
      const w = new World(level, sprites, { seed: 7 });
      for (let t = 0; t < 1500; t++) {
        for (const p of w.players) p.invulnerable = 2;
        w.step([{ ...fire, up: t % 200 < 60, down: t % 200 > 140 }]);
      }
      return hash(w);
    };
    expect(run()).toBe(run());
  });

  test("Skyfight mit Dauerfeuer: Gegner sterben, Punkte steigen", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    for (let t = 0; t < 2000; t++) {
      for (const p of w.players) p.invulnerable = 2;
      w.step([fire]);
    }
    expect(w.score[0]).toBeGreaterThan(1000);
  });

  test("ohne Eingabe und verwundbar stirbt das Schiff irgendwann", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    for (let t = 0; t < 5000 && w.state === 0; t++) w.step();
    expect(w.state).toBe(1);
  });
});

describe("Spieler", () => {
  const open = {
    terrainSpeed: 2,
    underwater: () => false,
    terrain: () => false,
    kill: () => {},
  };

  test("Arcade: 6 px je Achse, Diagonale nicht normiert, Grenzen 0…736 × −17…496", () => {
    const p = new Player(0, 0, 1);
    expect([p.x, p.y]).toEqual([100, 260]);
    updatePlayer(p, { ...NO_INPUT, right: true, down: true }, open);
    expect([p.x, p.y]).toEqual([106, 266]);
    for (let i = 0; i < 200; i++) updatePlayer(p, { ...NO_INPUT, right: true, down: true }, open);
    expect([p.x, p.y]).toEqual([736, 496]);
    for (let i = 0; i < 200; i++) updatePlayer(p, { ...NO_INPUT, left: true, up: true }, open);
    expect([p.x, p.y]).toEqual([0, -17]);
  });

  test("Neigung: sofort beim Drücken, dann alle 6 Ticks; zurück zur Mitte", () => {
    const p = new Player(0, 0, 1);
    updatePlayer(p, { ...NO_INPUT, up: true }, open);
    expect(p.tilt).toBe(1);
    for (let i = 0; i < 5; i++) updatePlayer(p, { ...NO_INPUT, up: true }, open);
    expect(p.tilt).toBe(1);
    updatePlayer(p, { ...NO_INPUT, up: true }, open);
    expect(p.tilt).toBe(0);
    for (let i = 0; i < 30; i++) updatePlayer(p, NO_INPUT, open);
    expect(p.tilt).toBe(2);
  });

  test("Wand sperrt achsenweise; Landschaft voraus schiebt nach links", () => {
    const p = new Player(0, 0, 1);
    // Wand rechts von x = 180 (Hitbox bis x + 64)
    const wall = { ...open, terrain: (_x1: number, _y1: number, x2: number) => x2 > 180 };
    for (let i = 0; i < 10; i++) updatePlayer(p, { ...NO_INPUT, right: true, down: true }, wall);
    expect(p.x).toBeLessThanOrEqual(116);
    expect(p.y).toBeGreaterThan(260);
  });

  test("zwei Spieler starten bei y 228 und 292", () => {
    expect([new Player(0, 0, 2).y, new Player(1, 1, 2).y]).toEqual([228, 292]);
  });
});
