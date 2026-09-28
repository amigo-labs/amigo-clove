/** Umgebungseffekte (Hintergrund, Wetter, Wasser, Overlays, Spezialabläufe): `Rnd`-Züge und Levelspezifika. */
import { describe, expect, test } from "bun:test";
import { STAR_COUNT } from "../src/sim/environment";
import type { VbRnd } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

/** Zählt `Rnd`-Züge (auch die inneren von `Rnd(−1)`) und `Randomize`. */
function counter(rnd: VbRnd): { next: number; randomize: number } {
  const c = { next: 0, randomize: 0 };
  const next = rnd.next.bind(rnd);
  const randomize = rnd.randomize.bind(rnd);
  rnd.next = () => {
    c.next++;
    return next();
  };
  rnd.randomize = (n: number) => {
    c.randomize++;
    randomize(n);
  };
  return c;
}

async function world(
  slug: string,
  opts: ConstructorParameters<typeof World>[2] = {},
): Promise<World> {
  const { level, sprites } = await loadTestLevel(slug);
  return new World(level, sprites, opts);
}

/** `Rnd`-Züge eines Aufrufs. */
function draws(w: World, f: () => void): number {
  const c = counter(w.rnd);
  f();
  return c.next;
}

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([]);
    w.events.length = 0;
  }
}

describe("Hintergrund (SpielMoveHintergrund)", () => {
  test("Modus 2: 303 Rnd beim Auslegen, danach 1 je umlaufendem Stern", async () => {
    const w = await world("level2-1_spacestation_i");
    expect(w.background).toBe(2);
    expect(draws(w, () => w.env.moveBackground())).toBe(303);
    for (let t = 0; t < 200; t++) {
      const wraps = w.env.stars.filter((s) => s.x - s.speed + 50 < 0).length;
      expect(draws(w, () => w.env.moveBackground())).toBe(wraps);
    }
    // Graustufen nach Index, Stern 100 heller als 1 (geklemmt beim Zeichnen)
    expect(w.env.stars.length).toBe(STAR_COUNT);
  });

  test("Modus 6: 202 Rnd beim Auslegen, Tempo aus der Levelzeit", async () => {
    const w = await world("level7-5_escape");
    expect(w.background).toBe(6);
    expect(draws(w, () => w.env.moveBackground())).toBe(202);
    w.tick = 120;
    const wraps = w.env.stars.filter((s) => s.x - 17 + 50 < 0).length;
    expect(draws(w, () => w.env.moveBackground())).toBe(wraps);
    expect(w.env.stars[0]!.speed).toBe(8);
    expect(w.env.stars[99]!.speed).toBe(14);
  });

  test("Modus 5 (Skyfight): 505 Rnd beim Auslegen, dann keine; Stil 2 (weiße Explosionen)", async () => {
    const w = await world("level1-1_skyfight");
    expect(w.background).toBe(5);
    expect(w.fx.style).toBe(0);
    expect(draws(w, () => w.env.moveBackground())).toBe(505);
    expect(draws(w, () => w.env.moveBackground())).toBe(0);
    expect(w.fx.style).toBe(2);
  });

  test("Modus 3 (Eis): kein Rnd, Stil 1, Schleier über dem vorigen Bild", async () => {
    const w = await world("level6-1_ice_palace");
    expect(draws(w, () => w.env.moveBackground())).toBe(0);
    expect(w.fx.style).toBe(1);
    const cmd = w.env.lists.bg.cmds[0];
    expect(cmd?.op === "strip" && cmd.v[0]!.a).toBe(0.5);
  });

  test("Modi 0/−1/−2: nur −1 zieht ein Rnd; 0 verschiebt in Skyfight das alte Bild", async () => {
    const w = await world("level1-1_skyfight");
    w.env.moveBackground();
    for (const [mode, n] of [
      [0, 0],
      [-1, 1],
      [-2, 0],
    ] as const) {
      w.background = mode;
      w.env.lists.bg.clear();
      expect(draws(w, () => w.env.moveBackground())).toBe(n);
      expect(w.env.lists.bg.cmds.some((c) => c.op === "copy")).toBe(mode === 0);
    }
  });

  test("Modus 1: Bild scrollt mit Ebene 0, zwei Blits außer bei x = 0", async () => {
    const w = await world("level3-1_industry_harbor");
    expect(w.background).toBe(1);
    expect(draws(w, () => w.env.moveBackground())).toBe(0);
    const blits = w.env.lists.bg.cmds.filter((c) => c.op === "strip" && c.key === w.env.bgKey);
    expect(blits.length).toBe(w.backgroundX === 0 ? 1 : 2);
  });
});

describe("Wetter", () => {
  test("SpielRegen: 4 Rnd je frischem Tropfen, 3 je Neustart, 1 je Spritzer-Partikel", async () => {
    const w = await world("level3-1_industry_harbor");
    w.env.moveBackground();
    expect(w.env.drops.length).toBe(17);
    const sparks = () => w.fx.sparks[0].items.filter((p) => p.active).length;
    for (let t = 0; t < 300; t++) {
      const fresh = w.env.drops.filter((d) => d.x === 0 && d.y === 0).length;
      const before = sparks();
      const n = draws(w, () => w.env.rain());
      const restarted = w.env.drops.filter((d) => d.y === -15).length;
      expect(n).toBe(4 * fresh + 3 * restarted + (sparks() - before));
      w.fx.moveSparks(0, 0);
    }
  });

  test("Starkregen (3-2): SpielRegen setzt Stil 3, SpielSchnee zieht 1 Rnd (Wind)", async () => {
    const w = await world("level3-2_industry_harbor_ii");
    w.env.moveBackground();
    expect(draws(w, () => w.env.rain())).toBe(0);
    expect(w.fx.style).toBe(3);
    expect(draws(w, () => w.env.snow())).toBe(1);
    expect(w.env.weatherInit).toBe(false);
  });

  test("Schnee (6-1): 1 Rnd je Tick", async () => {
    const w = await world("level6-1_ice_palace");
    w.env.moveBackground();
    for (let t = 0; t < 5; t++) expect(draws(w, () => w.env.snow())).toBe(1);
  });

  test("Wolken (Skyfight): 1 + 240 Rnd beim Auslegen, dann 1 + 3 je Neustart", async () => {
    const w = await world("level1-1_skyfight");
    w.env.moveBackground();
    expect(draws(w, () => w.env.snow())).toBe(241);
    for (let t = 0; t < 200; t++) {
      const resets = w.env.veils.filter((c, k) => c.x < -(300 + 20 * (k % 3))).length;
      expect(draws(w, () => w.env.snow())).toBe(1 + 3 * resets);
    }
  });

  test("kein Wetter in der Nova oder bei Hintergrund 0", async () => {
    const w = await world("level6-1_ice_palace");
    w.env.moveBackground();
    w.background = 0;
    expect(draws(w, () => w.env.snow())).toBe(0);
  });
});

describe("Wasser (SpielWasser)", () => {
  test("5-3 (W = 71): Schwebeteilchen alle 3 Ticks, 4 Rnd je Teilchen, keine Verzerrung", async () => {
    const w = await world("level5-3_rumbler");
    expect(w.level.waterHeight).toBe(71);
    for (let t = 0; t < 6; t++) {
      w.tick = t;
      w.env.lists.water.clear();
      expect(draws(w, () => w.env.water())).toBe(t % 3 === 0 ? 4 * 4 : 0);
      expect(w.env.lists.water.cmds.filter((c) => c.op === "strip").length).toBe(4);
      expect(w.env.lists.water.cmds.some((c) => c.op === "copy")).toBe(false);
    }
  });

  test("5-1 (W = 550): Verzerrung in Streifen, Blasenprüfung je Spieler", async () => {
    const w = await world("level5-1_atlantis");
    w.tick = 1;
    const n = draws(w, () => w.env.water());
    // 550 px in Streifen von 10…14 px: 38…55 Rnd, dazu 1 (+2) für die Blase
    expect(n).toBeGreaterThanOrEqual(38 + 1);
    expect(n).toBeLessThanOrEqual(55 + 3);
    expect(w.env.lists.water.cmds[0]?.op).toBe("copy");
  });

  test("Spritzer und Berührungston, wenn das Schiff die Wasserlinie schneidet (5-2)", async () => {
    const w = await world("level5-2_canalisation");
    const p = w.players[0]!;
    p.y = 550 - 275 - 30;
    w.env.water();
    expect(w.env.waterTouch).toBe(true);
    expect(w.events.some((e) => e.kind === "sfxLoop" && e.name === "water_touch" && e.on)).toBe(
      true,
    );
    p.y = 100;
    w.env.water();
    expect(w.env.waterTouch).toBe(false);
  });

  test("ohne Wasser kein Rnd", async () => {
    const w = await world("level3-1_industry_harbor");
    expect(draws(w, () => w.env.water())).toBe(0);
  });
});

describe("Overlays (OverlayEffekte, MakeSomeNoise)", () => {
  test("Rauschen: 48 Rnd bei Stärke > 0, Route op 41 addiert geklemmt", async () => {
    const w = await world("level7-1_alienation");
    expect(draws(w, () => w.env.overlay())).toBe(0);
    w.env.addNoise(0.7);
    w.env.addNoise(0.7);
    expect(w.env.noise).toBe(1);
    expect(draws(w, () => w.env.overlay())).toBe(48);
    w.env.beginTick();
    expect(w.env.noise).toBe(0);
    // 7-1 und 7-2 rauschen jeden Tick über ihre Routen
    run(w, 50);
    expect(w.env.noise).toBeGreaterThan(0);
  });

  test("Checkpoint: Standbild erfassen, dann in 20 Ticks ausblenden (kein weißer Blitz)", async () => {
    const w = await world("level1-1_skyfight");
    const c = w.checkpoint;
    c.triggered = true;
    c.flashAlpha = 1;
    c.flashStep = -0.05;
    w["noFlash"] = true;
    w.env.overlay();
    expect(w.env.lists.overlay.cmds.some((x) => x.op === "capture" && x.target === "still")).toBe(
      true,
    );
    expect(c.flashAlpha).toBe(1);
    w["noFlash"] = false;
    let ticks = 0;
    while (c.flashStep !== 0 && ticks < 100) {
      w.env.lists.overlay.clear();
      w.env.overlay();
      ticks++;
    }
    expect(ticks).toBe(20);
    expect(w.env.lists.overlay.cmds.some((x) => x.op === "strip" && x.key === "@still")).toBe(true);
  });

  test("Glühen: Rampe +0,025 bis 0,5, Erfassen für den nächsten Tick", async () => {
    const w = await world("level1-1_skyfight");
    w.overlays.a = true;
    for (let t = 0; t < 30; t++) w.env.overlay();
    expect(w.overlays.alphaA).toBe(0.5);
    expect(w.env.captureBlur).toBe(true);
    w.overlays.a = false;
    for (let t = 0; t < 12; t++) w.env.overlay();
    expect(w.overlays.alphaA).toBe(0);
  });
});

describe("Spezialabläufe (SpielSpezial, Route op 42)", () => {
  test("Levelspezifika: Hintergrund, Stil, Wasser, Wetter und Spezialtyp zu Levelbeginn", async () => {
    const table: [string, number, number, number, number, number][] = [
      // Level, Modus, Stil nach 2 Ticks, Wasser, Wetter, Spezial (−1: keiner)
      ["epilog", 2, 0, 0, 0, 5],
      ["level0-1_tutorial", 1, 0, 0, 0, 0],
      ["level1-1_skyfight", 5, 2, 0, 0, -1],
      ["level1-2_zeppelin_boss", 1, 0, 0, 0, 3],
      ["level2-1_spacestation_i", 2, 0, 0, 0, -1],
      ["level3-1_industry_harbor", 1, 0, 0, 16, -1],
      ["level3-2_industry_harbor_ii", 1, 3, 0, 1000, 3],
      ["level4-1_midtown_madness", 1, 0, 0, 10, -1],
      ["level4-2_midtown_madness_ii", 1, 0, 0, 0, 3],
      ["level5-1_atlantis", 1, 0, 550, 0, -1],
      ["level5-2_canalisation", 1, 0, 275, 12, -1],
      ["level5-3_rumbler", 1, 0, 71, 0, -1],
      ["level6-1_ice_palace", 3, 1, 0, 0, -1],
      ["level6-2_caves", 3, 1, 0, 0, -1],
      ["level7-2_alienation_ii", 1, 0, 81, 0, -1],
      ["level7-3_final_endboss", 1, 0, 0, 0, 4],
      ["level7-5_escape", 6, 0, 0, 0, 7],
      ["level8-1_jungle", 1, 0, 57, 0, 1],
    ];
    for (const [slug, mode, style, water, weather, special] of table) {
      const w = await world(slug);
      run(w, 3);
      const s = w.env.special;
      expect([
        slug,
        w.background,
        w.fx.style,
        w.level.waterHeight,
        w.level.weatherParticles,
      ]).toEqual([slug, mode, style, water, weather]);
      expect([slug, s.active ? s.type : -1]).toEqual([slug, special]);
    }
  }, 30_000);

  test("Gewitter: in Ruhe 1 Rnd je Tick; im Blitz 21 Rnd und vier Neusaaten über `Blitz`", async () => {
    const w = await world("level1-2_zeppelin_boss");
    run(w, 2);
    const s = w.env.special;
    expect([s.active, s.type]).toEqual([true, 3]);
    s.counter = 0;
    s.fresh = false;
    let quiet = 0;
    for (let t = 0; t < 50 && s.counter === 0; t++) {
      const n = draws(w, () => w.env.stepSpecial(0));
      expect(n).toBe(s.counter === 0 ? 1 : 3);
      quiet++;
    }
    expect(quiet).toBeGreaterThan(0);
    s.counter = 5;
    s.p[1] = 400;
    const c = counter(w.rnd);
    w.env.stepSpecial(0);
    expect([c.next, c.randomize]).toEqual([21, 4]);
    expect(s.counter).toBe(6);
    // die Folge danach hängt nur vom gezogenen `alt` ab
    const w2 = await world("level1-2_zeppelin_boss", { seed: 12345 });
    run(w2, 2);
    Object.assign(w2.env.special, { counter: 5, fresh: false });
    w2.env.special.p[1] = 400;
    w2.rnd.seed = w.rnd.seed;
    expect(w2.rnd.next()).toBe(w.rnd.next());
  });

  test("Tutorial-Start: Schiffe 201 Ticks gesteuert (Zustand 5), dann frei, weiße Blende", async () => {
    const w = await world("level0-1_tutorial");
    run(w, 1);
    const p = w.players[0]!;
    expect([p.exitState, p.rotation]).toEqual([5, 270]);
    run(w, 199);
    // Einflug: x = COS[2·t]·170 − 70, zuletzt t = 1
    expect([p.exitState, p.rotation, p.y]).toEqual([5, 0, 260]);
    expect(p.x).toBeCloseTo(99.9, 1);
    run(w, 1);
    expect(p.exitState).toBe(0);
    expect(w.env.stillFade).toBe(true);
  });

  test("Epilog: 27 Rnd je Schiff und Tick, unabhängig vom Zeichnen", async () => {
    const w = await world("epilog");
    run(w, 2);
    expect(w.env.special.type).toBe(5);
    expect(draws(w, () => w.env.stepSpecial(1))).toBe(27);
  });

  test("Tastenhinweis: 300 Ticks, Grauwert blendet ein und aus", async () => {
    const w = await world("level8-1_jungle");
    run(w, 3);
    const s = w.env.special;
    expect(s.type).toBe(1);
    expect(w.env.hint?.action).toBe(4);
    run(w, 100);
    expect(w.env.hint?.grey).toBe(248);
    run(w, 250);
    expect(s.active && s.type === 1 && s.p[0] === 4).toBe(false);
  });

  test("Checkpoint-Neustart: Sterne aus dem Schnappschuss, Wetter neu ausgelegt", async () => {
    const w = await world("level1-1_skyfight");
    run(w, 5);
    const stars = w.env.stars.map((s) => s.phase);
    w.env.weatherInit = false;
    w.state = 1;
    w.respawn();
    expect(w.env.starsInit).toBe(false);
    expect(w.env.weatherInit).toBe(true);
    expect(w.env.stars.map((s) => s.phase)).not.toEqual(stars);
  });

  test("deterministisch mit allen Umgebungseffekten (3-2, 5-2, 7-5)", async () => {
    for (const slug of [
      "level3-2_industry_harbor_ii",
      "level5-2_canalisation",
      "level7-5_escape",
    ]) {
      const seeds = await Promise.all(
        [0, 1].map(async () => {
          const w = await world(slug, { seed: 99 });
          run(w, 800);
          return w.rnd.seed;
        }),
      );
      expect([slug, seeds[0]]).toEqual([slug, seeds[1]]);
    }
  });
});
