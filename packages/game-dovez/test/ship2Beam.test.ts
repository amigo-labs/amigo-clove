/** Debug-Schiff 2: Beam (`SpielBeam`) — Laden, Flug, Nachwirkung, gegen eine selbstgebaute Umgebung. */
import { describe, expect, test } from "bun:test";
import { newBeam, newBeamShared, stepBeams, type BeamWorld } from "../src/sim/beam";
import { DrawList, Effects } from "../src/sim/effects";
import { EnvList, type Capture } from "../src/sim/envDraw";
import { NO_INPUT, Player, type PlayerInput } from "../src/sim/player";
import { ShotLayer } from "../src/sim/playerShots";
import { VbRnd } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

function beamEnv() {
  const rnd = new VbRnd(9);
  const fx = new Effects(rnd, 0);
  const p = new Player(0, 2, 1);
  p.x = 100;
  p.y = 260;
  const layers = [new ShotLayer(), new ShotLayer()] as const;
  const beams = [newBeam()];
  const env = new EnvList();
  const calls: { box: number[]; damage: number; pierce: boolean }[] = [];
  const state = {
    noise: 0,
    terrain: false,
    rest: undefined as undefined | ((dmg: number) => number),
  };
  const input: PlayerInput = { ...NO_INPUT };
  const w: BeamWorld = {
    tick: 100,
    rnd,
    fx,
    out: new DrawList(),
    env,
    layers,
    noise: (v) => void (state.noise += v),
    players: [p],
    playersMinus1: 0,
    beams,
    shared: newBeamShared(),
    combo: { mult: [1, 1], hits: [0, 0], bonus: [0, 0] },
    waterLine: 1000,
    qToggles: true,
    input: () => input,
    terrain: () => state.terrain,
    hitEnemies: (x1, y1, x2, y2, damage, _owner, pierce, out) => {
      calls.push({ box: [x1, y1, x2, y2], damage, pierce });
      out.enemy = 3;
      return state.rest ? state.rest(damage) : damage;
    },
    background: () => 0,
    sound: () => {},
    loop: () => {},
  };
  return { w, p, c: beams[0]!, input, layers, env, fx, rnd, calls, state };
}

type Env = ReturnType<typeof beamEnv>;

/** A halten bis `ticks`, dann loslassen: `fire` und der erste Flugtick laufen. */
function charged(e: Env, ticks: number): void {
  e.input.beam = true;
  for (let t = 0; t < ticks; t++) stepBeams(e.w);
  e.input.beam = false;
  stepBeams(e.w);
}

describe("Debug-Schiff 2: Beam", () => {
  test("Laden: Rauschen `Ladung · 0,05 / 165`, Linse vor der Nase, bunter Blitz darin", () => {
    const e = beamEnv();
    e.input.beam = true;
    for (let t = 0; t < 100; t++) stepBeams(e.w);
    expect(e.c.charge).toBeCloseTo(90, 3);
    // letzter Tick: Ladung 90 → Rauschen 90 · 0,05 / 165
    const before = e.state.noise;
    stepBeams(e.w);
    expect(e.state.noise - before).toBeCloseTo((e.c.charge * 0.05) / 165, 5);
    const cx = e.p.x + 96;
    const r = Math.round((e.c.charge * 27) / 165 + 5);
    const caps = e.env.cmds.filter((c) => c.op === "capture");
    const last = caps[caps.length - 1] as Capture;
    expect([last.target, last.overlay]).toEqual(["lens", "a_kreis3"]);
    expect(last.src[0]).toBe(Math.round(cx - r * 0.75));
    // Blitz-Partikel (Art 0) der Größe 2r in der Linsenmitte
    const big = e.fx.big.items.filter((q) => q.active && q.kind === 0 && q.size === 2 * r);
    expect(big.length).toBeGreaterThan(0);
    expect(big[0]!.x).toBeCloseTo(cx - r, 3);
    expect(big[0]!.y).toBeCloseTo(e.p.y + 32 - r, 3);
  });

  test("volle Ladung: zwei Geisterbilder dove2<n> mit Alpha 0,2, keine Einsaug-Funken mehr", () => {
    const e = beamEnv();
    e.input.beam = true;
    for (let t = 0; t < 200; t++) stepBeams(e.w);
    expect(e.c.charge).toBe(165);
    e.env.clear();
    stepBeams(e.w);
    const ghosts = e.env.cmds.filter(
      (c) => c.op === "strip" && c.additive === false && c.v[0]!.a === 0.2,
    );
    expect(ghosts.length).toBe(2);
  });

  test("Einsaug-Funken (Art 16) hinter aktiven Partikeln, fünf Rnd je Funke", () => {
    const e = beamEnv();
    e.input.beam = true;
    for (let t = 0; t < 20; t++) stepBeams(e.w);
    expect(e.w.shared.suck.some((s) => s.active)).toBe(true);
    const sparks = () => e.fx.big.items.filter((q) => q.active && q.kind === 16).length;
    const n = sparks();
    stepBeams(e.w);
    expect(sparks()).toBeGreaterThan(n);
  });

  test("Schaden 8500 · Stufe (ohne die +1500 des D-Phyton), Flug 20 px je Tick", () => {
    const e = beamEnv();
    charged(e, 200);
    expect(e.c.damage).toBe(8500);
    expect(e.c.running).toBe(true);
    const x0 = e.c.tipX;
    const seed = e.rnd.seed;
    stepBeams(e.w);
    expect(e.c.tipX).toBe(x0 + 20);
    // voller Beam: fünf Rnd der Regenbogen-Striche je Tick
    const r = new VbRnd(0);
    r.seed = seed;
    for (let k = 0; k < 5; k++) r.next();
    expect(e.rnd.seed).toBe(r.seed);
  });

  test("kein voller Beam: kein Rnd im Flug (Schiff 1 zieht eines für die Feuerbälle)", () => {
    const f = beamEnv();
    charged(f, 100);
    const s2 = f.rnd.seed;
    stepBeams(f.w);
    expect(f.rnd.seed).toBe(s2);
  });

  test("Treffertest mit Schaden − 2100 und Durchschlag nur beim vollen Beam", () => {
    const e = beamEnv();
    charged(e, 200);
    stepBeams(e.w);
    const call = e.calls[e.calls.length - 1]!;
    expect(call.damage).toBe(e.c.damage - 2100);
    expect(call.pierce).toBe(true);
    const f = beamEnv();
    charged(f, 120);
    stepBeams(f.w);
    expect(f.calls[f.calls.length - 1]!.pierce).toBe(false);
  });

  test("Treffer: glow −100, Schaden = Rest + 2100, Kombo +0,5 je Treffer, Strahl bleibt stehen", () => {
    const e = beamEnv();
    charged(e, 200);
    e.calls.length = 0;
    e.state.rest = (d) => (e.calls.length === 1 ? d - 500 : 0);
    stepBeams(e.w);
    // erster Aufruf trifft mit Rest, zweiter verbraucht: zwei Treffer, Kombo + 1
    expect(e.calls.length).toBe(2);
    expect(e.c.glow).toBe(-100);
    expect(e.w.combo.mult[0]).toBe(2);
    expect(e.c.damage).toBe(2100);
    expect(e.c.running).toBe(true);
    // Nachwirkung: acht Suchgeschosse Typ 14 mit Winkel 110…250 und Schaden `damage \ 7`
    e.state.rest = undefined;
    const dmg = e.c.damage;
    const x = e.c.tipX;
    stepBeams(e.w);
    const homing = e.layers[1].shots.filter((s) => s.active && s.type === 14);
    expect(homing.length).toBe(8);
    expect(homing.map((s) => s.param)).toEqual([110, 130, 150, 170, 190, 210, 230, 250]);
    expect(homing[0]!.damage).toBe(Math.trunc(dmg / 7));
    expect(homing[0]!.x).toBe(x);
    expect(Math.hypot(homing[0]!.vx, homing[0]!.vy)).toBeCloseTo(20, 4);
    expect(e.c.tipX).toBe(x);
    expect(e.c.glow).toBe(-99);
    // zwei Wellen: Linse (Art 17) und Glut (Art 16)
    const kinds = e.fx.big.items.filter((q) => q.active && q.size === 64).map((q) => q.kind);
    expect(kinds).toContain(17);
    expect(kinds).toContain(16);
    // 99 weitere Ticks bis 0: der Strahl endet, die Kombo wird zurückgesetzt
    for (let t = 0; t < 98; t++) stepBeams(e.w);
    expect(e.c.running).toBe(true);
    stepBeams(e.w);
    expect(e.c.running).toBe(false);
    expect([e.w.combo.mult[0], e.w.combo.hits[0]]).toEqual([1, 0]);
    // keine weiteren Suchgeschosse während der Nachwirkung
    expect(e.layers[1].shots.filter((s) => s.active && s.type === 14).length).toBe(8);
  });

  test("Nachwirkung eines kleinen Beams: glow = −Int(Breite), blendet aus, keine Suchgeschosse", () => {
    const e = beamEnv();
    charged(e, 120);
    const width = e.c.width;
    e.state.terrain = true;
    stepBeams(e.w);
    expect(e.c.glow).toBe(-100);
    e.state.terrain = false;
    stepBeams(e.w);
    expect(e.c.glow).toBe(-Math.floor(width) + 1);
    expect(e.layers[1].shots.some((s) => s.active && s.type === 14)).toBe(false);
    // Körper blendet mit −glow / 100 aus (erfasster Streifen als `@blur`)
    const strips = e.env.cmds.filter((c) => c.op === "strip" && c.key === "@blur");
    const a = strips[strips.length - 1]!;
    if (a.op !== "strip") throw new Error("Streifen erwartet");
    expect(a.v[0]!.a).toBeCloseTo((-e.c.glow + 1) / 100, 5);
    const n = -e.c.glow;
    for (let t = 0; t < n; t++) stepBeams(e.w);
    expect(e.c.glow).toBe(0);
    expect(e.c.running).toBe(false);
  });

  test("Landschaft stoppt den Beam nicht sofort (auch nicht bei voller Ladung)", () => {
    const e = beamEnv();
    charged(e, 200);
    e.state.terrain = true;
    stepBeams(e.w);
    expect(e.c.glow).toBe(-100);
    expect(e.c.running).toBe(true);
  });

  test("Flug: Linse am Kopf, Körper aus dem erfassten Streifen, additiver Balken", () => {
    const e = beamEnv();
    charged(e, 120);
    e.env.clear();
    stepBeams(e.w);
    const keys = e.env.cmds.map((c) =>
      c.op === "strip" ? c.key : `${c.op}:${(c as { target?: string }).target}`,
    );
    expect(keys.slice(0, 6)).toEqual([
      "capture:lens",
      "capture:blur",
      "@blur",
      "balken",
      "@lens",
      "a_kreis2",
    ]);
  });

  test("Bildschirmrand: nach x > 800 endet der Flug, Kombo zurückgesetzt", () => {
    const e = beamEnv();
    charged(e, 200);
    let n = 0;
    while (e.c.running && n++ < 100) stepBeams(e.w);
    expect(e.c.running).toBe(false);
    expect(e.c.tipX).toBeGreaterThan(800);
    expect(e.c.glow).toBe(0);
  });

  test("Weltlauf: voller Beam und Landschaftstreffer schicken acht Suchgeschosse los", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, { ship: 2, seed: 3 });
    const step = (i: PlayerInput, n = 1) => {
      for (let t = 0; t < n; t++) {
        for (const p of w.players) p.invulnerable = 5;
        w.step([i, NO_INPUT]);
        w.events.length = 0;
      }
    };
    const c = w.beams[0]!;
    step({ ...NO_INPUT, beam: true }, 190);
    step(NO_INPUT);
    expect(c.running).toBe(true);
    w.hitsTerrain = () => true;
    step(NO_INPUT, 2);
    expect(c.glow).toBeLessThan(0);
    const n14 = w.playerShots.flatMap((l) => l.shots.filter((s) => s.active && s.type === 14));
    expect(n14.length).toBe(8);
  });
});
