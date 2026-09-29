/** Debug-Schiff 2: Drohnen (`SpielDWeapons`), Schüsse, Beam und Zeichenschlüssel. */
import { describe, expect, test } from "bun:test";
import { newDrones, placeDrones, stepDrones, type DroneWorld } from "../src/sim/drones";
import { DrawList, Effects } from "../src/sim/effects";
import { NO_INPUT, Player, type PlayerInput } from "../src/sim/player";
import { ShotLayer } from "../src/sim/playerShots";
import { VbRnd } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

const fire: PlayerInput = { ...NO_INPUT, fire: true };

function step(w: World, input: PlayerInput = NO_INPUT, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([input, NO_INPUT]);
    w.events.length = 0;
  }
}

const shotsOf = (w: World, type: number) =>
  w.playerShots.flatMap((l) => l.shots.filter((s) => s.active && s.type === type));

async function ship2(seed?: number): Promise<World> {
  const { level, sprites } = await loadTestLevel("level1-1_skyfight");
  return new World(level, sprites, { ship: 2, ...(seed !== undefined ? { seed } : {}) });
}

async function longRun(): Promise<[number, number | undefined]> {
  const w = await ship2(11);
  let h = 0;
  for (let t = 0; t < 1500 && w.state === 0; t++) {
    step(w, { ...fire, switchWeapon: t % 40 < 5, up: t % 200 < 60, down: t % 200 > 140 });
    h = (h * 31 + w.score[0]! + w.playerShots[1].high + w.drones.ammo[0]!) | 0;
  }
  return [h, w.score[0]];
}

describe("Debug-Schiff 2: Drohnen", () => {
  test("DoveReset: zwei Drohnen, Vorräte 30/4/0, Flags an, Sonderwaffe 0", () => {
    const d = newDrones();
    expect(d.list.length).toBe(2);
    expect(d.ammo).toEqual([30, 4, 0]);
    expect([d.aim, d.orbit, d.orbitFire, d.mode]).toEqual([true, true, true, 0]);
  });

  test("DovePosSetup: Drohnen und Verlauf auf Schiff 1 + (16, 16)", async () => {
    const w = await ship2();
    const p = w.players[0]!;
    expect(p.shipType).toBe(2);
    for (const r of w.drones.list) {
      expect([r.x, r.y]).toEqual([p.x + 16, p.y + 16]);
      expect(r.xh.every((v) => v === p.x + 16)).toBe(true);
    }
  });

  test("Kette: Drohne 1 folgt dem Schiff 10 Ticks später, Drohne 2 der ersten", async () => {
    const w = await ship2();
    const p = w.players[0]!;
    const x0 = p.x;
    const path: number[] = [];
    for (let t = 0; t < 30; t++) {
      step(w, { ...NO_INPUT, down: true });
      path.push(p.y);
    }
    const [a, b] = w.drones.list;
    // Ziel der ersten: Schiffsmitte dieses Ticks; Position = Verlaufsende vor dem Schieben (11 Ticks zurück)
    expect(a!.xh[0]).toBe(p.x + 16);
    expect(a!.yh[0]).toBe(p.y + 16);
    expect(a!.y).toBe(path[path.length - 12]! + 16);
    // die zweite folgt dem Verlaufsende der ersten (weitere 10 Ticks Verzug)
    expect(b!.yh[0]).toBe(a!.yh[10]);
    expect(b!.y).toBeLessThan(a!.y);
    expect(p.x).toBe(x0);
  });

  test("Drehung: höchstens 10° je Tick zur Flugrichtung, im Stand 1° zurück auf 0°", async () => {
    const w = await ship2();
    const r = w.drones.list[0]!;
    r.angle = 0;
    step(w, { ...NO_INPUT, up: true });
    step(w, { ...NO_INPUT, up: true });
    // nach oben: Richtung 90° (Bogen y nach oben, `WinkelInGrad` 0…360)
    expect(r.angle).toBeGreaterThan(0);
    expect(r.angle).toBeLessThanOrEqual(20);
    r.angle = 100;
    r.xh.fill(w.players[0]!.x + 16);
    r.yh.fill(w.players[0]!.y + 16);
    step(w, NO_INPUT);
    // Ziel steht: Zielwinkel 0 → nächster Vertreter 360, 100 → 101 (+1 zur 360 hin)
    expect(r.angle).toBeCloseTo(99, 5);
  });

  test("Feuer: jede Drohne alle 8 Ticks ein Schuss vom Typ 0 (Ebene 1) in Blickrichtung", async () => {
    const w = await ship2();
    step(w, fire, 1);
    const first = shotsOf(w, 0).filter((s) => s.vx !== 11);
    expect(first.length).toBe(2);
    for (const s of first) expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(9, 4);
    step(w, fire, 7);
    expect(shotsOf(w, 0).filter((s) => Math.abs(Math.hypot(s.vx, s.vy) - 9) < 1e-3).length).toBe(2);
    step(w, fire, 1);
    expect(shotsOf(w, 0).filter((s) => Math.abs(Math.hypot(s.vx, s.vy) - 9) < 1e-3).length).toBe(4);
    for (const r of w.drones.list) expect(r.cooldown).toBe(7);
  });

  test("Sonderwaffe 0 (D): Fallrakete Typ 12, Schaden 1500, Vorrat −1, Pause 8", async () => {
    const w = await ship2();
    step(w, { ...NO_INPUT, switchWeapon: true });
    const rockets = shotsOf(w, 12);
    expect(rockets.length).toBe(1);
    expect(rockets[0]!.damage).toBe(1500);
    expect(w.drones.ammo).toEqual([29, 4, 0]);
    expect(w.drones.reload[0]).toBe(8);
    step(w, { ...NO_INPUT, switchWeapon: true }, 8);
    expect(shotsOf(w, 12).length).toBe(1);
    step(w, { ...NO_INPUT, switchWeapon: true });
    expect(shotsOf(w, 12).length).toBe(2);
  });

  test("Sonderwaffe leer: kein Schuss mehr", async () => {
    const w = await ship2();
    w.drones.ammo[0] = 0;
    step(w, { ...NO_INPUT, switchWeapon: true }, 3);
    expect(shotsOf(w, 12).length).toBe(0);
  });

  test("Kugeln kreisen: 60 · cos(8T), 55 · sin(9T) um Schiff + 32, Sprite dw1-n", async () => {
    const w = await ship2();
    step(w, NO_INPUT);
    const p = w.players[0]!;
    const quads = w.fx.lists.drones.quads.filter((q) => q.key.startsWith("dw1-"));
    expect(quads.length).toBe(2);
    const t = w.tick;
    const cos = Math.cos((8 * t * Math.PI) / 180);
    const sin = Math.sin((9 * t * Math.PI) / 180);
    const x = p.x + 32 + cos * 60;
    const y = p.y + 32 + sin * 55;
    expect(quads[0]!.x1).toBe(Math.round(x - 16));
    expect(quads[0]!.y1).toBe(Math.round(y - 16));
    expect(quads[0]!.key).toBe(`dw1-${Math.trunc(t / 3) % 10}`);
    // zweite Kugel 180° versetzt
    expect(quads[1]!.x1).toBe(Math.round(p.x + 32 - cos * 60 - 16));
  });

  test("ohne Gegner nur Glutflecken und Richtungsstriche, keine Blitze", async () => {
    const w = await ship2();
    step(w, NO_INPUT);
    const l = w.fx.lists.drones;
    expect(l.quads.filter((q) => q.key === "a_kreis2").length).toBe(4);
    // je Drohne ein Richtungsstrich
    expect(l.segments.length).toBe(2);
  });

  test("deterministisch mit Dauerfeuer und D über 1500 Ticks", async () => {
    const a = await longRun();
    expect(a).toEqual(await longRun());
    expect(a[1]!).toBeGreaterThan(0);
  });

  test("Kampagne: Vorrat und Drehung gehen ins nächste Level, die Lage nicht", async () => {
    const w = await ship2();
    w.drones.ammo[0] = 7;
    w.drones.list[1]!.angle = 123;
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w2 = new World(level, sprites, { ship: 2, carry: w.carry() });
    expect(w2.drones.ammo[0]).toBe(7);
    expect(w2.drones.list[1]!.angle).toBe(123);
    const p = w2.players[0]!;
    expect(w2.drones.list[1]!.x).toBe(p.x + 16);
  });

  test("Zeichenschlüssel des Schiffs: dove2<Neigung+1><Bild+1> (waagerecht 3), drei Bilder beim Feuern", async () => {
    const w = await ship2();
    const seen = new Set<string>();
    for (let t = 0; t < 12; t++) {
      step(w, fire);
      for (const q of w.fx.lists.ship.quads) if (q.key.startsWith("dove")) seen.add(q.key);
    }
    expect([...seen].toSorted()).toEqual(["dove231", "dove232", "dove233"]);
  });
});

// --- Bausteine ohne Welt: Drohnen gegen eine selbstgebaute Umgebung -------------------------

function droneEnv(targets: { x: number; y: number; w: number; h: number }[] = []) {
  const rnd = new VbRnd(5);
  const fx = new Effects(rnd, 0);
  const p = new Player(0, 2, 1);
  const layers = [new ShotLayer(), new ShotLayer()] as const;
  const hits: number[][] = [];
  const sounds: string[] = [];
  let input: PlayerInput = NO_INPUT;
  const w = {
    tick: 40,
    rnd,
    fx,
    out: new DrawList(),
    players: [p],
    layers,
    input: () => input,
    targets: () => targets,
    hitEnemies: (...a: number[]) => {
      hits.push(a);
      return a[4]!;
    },
    sound: (n: string) => void sounds.push(n),
  } satisfies DroneWorld & { tick: number };
  const d = newDrones();
  placeDrones(d, p);
  return {
    w,
    d,
    p,
    rnd,
    layers,
    hits,
    sounds,
    setInput: (i: PlayerInput) => (input = i),
  };
}

describe("Drohnen: Zielsuche und Kugeln", () => {
  test("nächste Teil-Mitte im Umkreis 170: vier Blitze (rot mit schwarzem Kern) und 10 Schaden", () => {
    // Mitte (Schiff + 64, +32) = (164, 292): Ziel 100 rechts, ein zweites weiter weg
    const e = droneEnv([
      { x: 250, y: 260, w: 32, h: 64 },
      { x: 500, y: 260, w: 32, h: 64 },
    ]);
    e.w.tick = 50;
    stepDrones(e.w, e.d);
    // Mitte des ersten Ziels: (250 + 16, 260 + 32) = (266, 292)
    const segs = e.w.out.segments;
    // vier Blitze à fünf Balken (`Blitz` mit 4 Zwischenpunkten) und zwei Richtungsstriche
    expect(segs.length).toBe(4 * 5 + 2);
    const bolts = segs.filter((s) => s.x2 === 266 && s.y2 === 292);
    expect(bolts.length).toBe(4);
    const reds = bolts.filter((s) => s.w === 10);
    const blacks = bolts.filter((s) => s.w === 5);
    expect([reds.length, blacks.length]).toEqual([2, 2]);
    expect(reds[0]!.c1).toEqual([0.7, 0, 0, 1]);
    expect(blacks[0]!.c1).toEqual([0, 0, 0, 1]);
    expect(reds[0]!.additive).toBe(false);
    // Schaden 10 auf 2 × 2 px um die Mitte, dazu je Kugel ein Treffer mit 20
    const aim = e.hits.find((h) => h[4] === 10)!;
    expect(aim.slice(0, 4)).toEqual([265, 291, 267, 293]);
    expect(e.hits.filter((h) => h[4] === 20).length).toBe(2);
  });

  test("Ziel außerhalb 170 px: keine Blitze, kein Zielschaden", () => {
    const e = droneEnv([{ x: 700, y: 100, w: 32, h: 32 }]);
    stepDrones(e.w, e.d);
    expect(e.hits.some((h) => h[4] === 10)).toBe(false);
    // nur die zwei Richtungsstriche der Drohnen
    expect(e.w.out.segments.length).toBe(2);
  });

  test("Rnd: ohne Ziel zwei Würfe je Tick (5 %-Wurf der zwei Kugeln), mit Ziel mehr", () => {
    const a = droneEnv([{ x: 250, y: 260, w: 32, h: 64 }]);
    const b = droneEnv([]);
    stepDrones(a.w, a.d);
    stepDrones(b.w, b.d);
    const c = new VbRnd(5);
    c.next();
    c.next();
    expect(b.rnd.seed).toBe(c.seed);
    expect(a.rnd.seed).not.toBe(b.rnd.seed);
  });

  test("Kugeln feuern bei gehaltenem Feuer: Paare Typ −2 mit 40 · Stufe + 50", () => {
    const e = droneEnv();
    e.setInput({ ...NO_INPUT, fire: true });
    for (let t = 0; t < 400; t++) {
      e.w.tick = 40 + t;
      stepDrones(e.w, e.d);
    }
    const shots = e.layers[1].shots.filter((s) => s.active && s.type === -2);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.length % 2).toBe(0);
    for (const s of shots) {
      expect(s.damage).toBe(40 * e.p.shotPower + 50);
      expect(Math.abs(s.vx)).toBe(9);
      expect(s.vy).toBe(0);
      expect(s.param).toBe(1);
    }
    // ohne Feuer keine
    const f = droneEnv();
    for (let t = 0; t < 400; t++) stepDrones(f.w, f.d);
    expect(f.layers[1].shots.some((s) => s.active)).toBe(false);
  });

  test("Sonderwaffen 1 und 2 sind erst mit `Me.B2C` erreichbar (im Original nie gesetzt)", () => {
    const e = droneEnv();
    e.setInput({ ...NO_INPUT, switchWeapon: true });
    e.d.mode = 1;
    stepDrones(e.w, e.d);
    // Slot 0 ≠ Modus 1: nichts; Slot 1 feuert zwölf Zielsuchraketen (Typ 13)
    expect(e.layers[0].shots.filter((s) => s.active && s.type === 13).length).toBe(12);
    expect(e.d.ammo).toEqual([30, 3, 0]);
    e.d.mode = 2;
    e.d.ammo[2] = 1;
    stepDrones(e.w, e.d);
    expect(e.layers[0].shots.filter((s) => s.active && s.type === 15).length).toBe(21);
  });

  test("Zeichnen: erst Glutflecken der Drohnen, dann die Kugeln dw1-n", () => {
    const e = droneEnv();
    stepDrones(e.w, e.d);
    const keys = e.w.out.quads.map((q) => q.key);
    const frame = `dw1-${Math.trunc(40 / 3) % 10}`;
    expect(keys).toEqual(["a_kreis2", "a_kreis2", "a_kreis2", "a_kreis2", frame, frame]);
  });
});
