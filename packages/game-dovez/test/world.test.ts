/** DoveZ-Weltsimulation gegen die gebauten Assets aller Level. */
import { describe, expect, test } from "bun:test";
import { NO_INPUT, Player, updatePlayer, type PlayerInput } from "../src/sim/player";
import { World } from "../src/sim/world";
import { LEVEL_SLUGS, loadTestLevel, loadTestRadio } from "./assets";

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

  test("Start vor Tick 0 (`-Tick N` mit N < 0): läuft bis Tick 0 und weiter, ohne den Vorlauf zu stören", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, { startTick: -300 });
    expect(w.tick).toBe(-300);
    for (let t = 0; t < 400; t++) {
      for (const p of w.players) p.invulnerable = 2;
      w.step([fire]);
      w.events.length = 0;
    }
    expect(w.tick).toBe(100);
    expect(w.state).toBe(0);
    expect(w.layers.some((l) => l.tiles.some((t) => t.active))).toBe(true);
  });

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

/** Steuert zum Tor, solange eines offen ist. */
function toGate(w: World): PlayerInput {
  const p = w.players[0]!;
  const c = w.checkpoint;
  const open = c.active && !c.triggered;
  return { ...fire, up: open && p.y + 35 > c.y + 5, down: open && p.y + 35 < c.y - 5 };
}

describe("Checkpoint", () => {
  test("Durchflug: 1000 Punkte und Schnappschuss; Tod setzt dorthin zurück", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    let gateTick = -1;
    for (let t = 0; t < 3000 && gateTick < 0; t++) {
      for (const p of w.players) p.invulnerable = 2;
      const before = w.score[0]!;
      w.step([toGate(w)]);
      if (w.checkpoint.triggered) {
        gateTick = w.tick;
        expect(w.score[0]! - before).toBeGreaterThanOrEqual(1000);
      }
    }
    expect(gateTick).toBe(2616);
    // ohne Schutz und Eingabe stirbt das Schiff; Neustart am Tor
    for (let t = 0; t < 5000 && w.state === 0; t++) w.step();
    expect(w.state).toBe(1);
    const score = w.score[0];
    expect(w.respawn()).toBe(true);
    expect([w.tick, w.lives, w.score[0], w.players[0]!.alive]).toEqual([gateTick, 2, score, true]);
    expect(w.players[0]!.invulnerable).toBe(100);
    expect(w.checkpoint.active).toBe(false);
  }, 30_000);

  test("ohne Leben kein Neustart; zwei Läufe mit Toden sind gleich", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const run = () => {
      const w = new World(level, sprites, { seed: 3 });
      let respawns = 0;
      for (let t = 0; t < 40000 && w.state !== 2; t++) {
        w.step([{ ...fire, up: t % 300 < 40 }]);
        if (w.state === 1) {
          if (!w.respawn()) break;
          respawns++;
        }
      }
      return [respawns, w.lives, w.state, hash(w)];
    };
    const a = run();
    expect(a.slice(0, 3)).toEqual([3, 0, 1]);
    expect(run()).toEqual(a);
  }, 30_000);
});

describe("Funk", () => {
  test("Skyfight: Notruf mit Stimme, Untertitel im Laufband, höchstens einmal", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const radio = (await loadTestRadio("level1-1_skyfight"))!;
    const w = new World(level, sprites, { radioTexts: radio.de });
    const voices: [number, string][] = [];
    let ticker = "";
    let portrait = 0;
    for (let t = 0; t < 1200; t++) {
      for (const p of w.players) p.invulnerable = 2;
      w.step([fire]);
      for (const e of w.events) if (e.kind === "voice") voices.push([w.tick, e.wav]);
      w.events.length = 0;
      if (w.radio.ticker.includes("Spacestation")) ticker = w.radio.ticker;
      portrait += w.fx.lists.radio.quads.filter((q) => q.key.startsWith("frame")).length;
    }
    // Notruf: 4598 ms → 287 Ticks, danach Notruf2 mit zwei Gruppen
    expect(voices.slice(0, 2)).toEqual([
      [72, "SkyfightE_notruf.wav"],
      [917, "SkyfightE_notruf2.wav"],
    ]);
    expect(ticker).toContain("Spacestation steht unter feindlichem Beschuss");
    expect(portrait).toBeGreaterThan(200);
    // maxPlays 1: ein zweiter Auslöser bleibt stumm
    w.radio.trigger(0);
    w.step([fire]);
    expect(w.events.some((e) => e.kind === "voice")).toBe(false);
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

  const glideRun = (realistic: boolean) => {
    const p = new Player(0, 0, 1);
    const w = { ...open, realistic };
    for (let i = 0; i < 12; i++) updatePlayer(p, { ...NO_INPUT, right: true }, w);
    const x0 = p.x;
    updatePlayer(p, NO_INPUT, w);
    const first = p.x - x0;
    for (let i = 0; i < 60; i++) updatePlayer(p, NO_INPUT, w);
    return { first, total: p.x - x0 };
  };

  test("Realistic: gleitet nach dem Loslassen mit ×0,85 je Tick aus, Arcade bleibt stehen", () => {
    const arcade = glideRun(false);
    expect(arcade.total).toBe(0);
    const real = glideRun(true);
    expect(real.first).toBeCloseTo(6 * 0.85, 4);
    expect(real.total).toBeGreaterThan(real.first);
    expect(real.total).toBeLessThan((6 * 0.85) / (1 - 0.85) + 0.01);
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
