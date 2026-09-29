/** Vibration in der Simulation: Auslöser von `AddForce` und der Tick-Schritt (`0x5299B0`). */
import { describe, expect, test } from "bun:test";
import { NO_INPUT, Player, updatePlayer, type PlayerInput } from "../src/sim/player";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

const fire: PlayerInput = { ...NO_INPUT, fire: true };

type Call = [strength: number, ticks: number, player: number];

/** Zeichnet jeden `AddForce`-Aufruf der Welt auf (die Quelle wird trotzdem eingetragen). */
function spy(w: World): Call[] {
  const calls: Call[] = [];
  const add = w.rumble.add.bind(w.rumble);
  w.rumble.add = (s, t, p) => {
    calls.push([s, t, p]);
    add(s, t, p);
  };
  return calls;
}

const has = (calls: Call[], c: Call) =>
  calls.some((x) => x[0] === c[0] && x[1] === c[1] && x[2] === c[2]);

async function skyfight(): Promise<World> {
  const { level, sprites } = await loadTestLevel("level1-1_skyfight");
  return new World(level, sprites);
}

/** Kopflos-Lauf; Ergebnis: Prüfsumme und nächster Zufallswert. */
async function run(wired: boolean): Promise<number[]> {
  const w = await skyfight();
  if (wired) {
    w.padOfPlayer = (p) => p + 1;
    w.rumbleBase = [500, 9000];
    w.rumbleOn = [true, false];
  }
  let h = 0;
  for (let t = 0; t < 1500; t++) {
    for (const p of w.players) p.invulnerable = t % 400 < 300 ? 2 : 0;
    w.step([{ ...fire, up: t % 200 < 60, down: t % 200 > 140 }]);
    const p = w.players[0]!;
    h = (Math.imul(h, 31) + Math.round(p.x * 8 + p.y + (w.score[0] ?? 0))) | 0;
    h = (Math.imul(h, 31) + Math.round(p.energy * 100)) | 0;
    w.events.length = 0;
  }
  return [h, w.rnd.next()];
}

describe("Vibration: Auslöser", () => {
  test("Gegnerabschuss: Stärke 1, 20 Ticks, Spieler des Schützen", async () => {
    const w = await skyfight();
    const calls = spy(w);
    for (let t = 0; t < 2000; t++) {
      for (const p of w.players) p.invulnerable = 2;
      w.step([fire]);
    }
    expect(w.score[0]).toBeGreaterThan(0);
    expect(has(calls, [1, 20, 0])).toBe(true);
  });

  test("Tod (KillDove): Stärke 5, 50 Ticks; Kontakt: Stärke 3, 40 Ticks", async () => {
    const w = await skyfight();
    const calls = spy(w);
    for (let t = 0; t < 5000 && w.state === 0; t++) w.step();
    expect(w.state).toBe(1);
    expect(calls.filter((c) => c[0] === 5 && c[1] === 50)).toEqual([[5, 50, 0]]);
    expect(has(calls, [3, 40, 0])).toBe(true);
  });

  test("Wackeln: Stärke 5 über 50, 3 über 19, sonst 1; je 1 Tick, beide Spieler", async () => {
    for (const [shake, strength] of [
      [60, 5],
      [51, 5],
      [50, 3],
      [20, 3],
      [19, 1],
      [1, 1],
    ] as const) {
      const w = await skyfight();
      w.fx.shake = shake;
      w.players[0]!.invulnerable = 10;
      const calls = spy(w);
      w.step();
      expect(calls.filter((c) => c[2] === -1)).toEqual([[strength, 1, -1]]);
    }
    // ohne Wackeln keine Quelle
    const w = await skyfight();
    const calls = spy(w);
    w.step();
    expect(calls.filter((c) => c[2] === -1)).toHaveLength(0);
  });

  test("Druckwelle wirkt: Stärke 1, 1 Tick je getroffenem Spieler", async () => {
    const w = await skyfight();
    const p = w.players[0]!;
    const calls = spy(w);
    w.fire.addShockwave(p.x + 32 - 40, p.y + 35, 20);
    for (let k = 0; k < 4; k++) w.fire.stepShots(w["shotWorld"]());
    expect(calls).toEqual([[1, 1, 0]]);
  });

  test("Schuss trifft den Spieler: Stärke 2, 15 Ticks", async () => {
    const w = await skyfight();
    const p = w.players[0]!;
    const calls = spy(w);
    const shot = w.fire.shots[0]!;
    shot.active = true;
    shot.shockwave = false;
    shot.route = -1;
    shot.damage = 1;
    shot.shotType = 0;
    shot.actor.x = p.x + 20;
    shot.actor.y = p.y + 30;
    Object.assign(shot.actor, { width: 8, height: 8 });
    w.fire.stepShots(w["shotWorld"]());
    expect(calls).toContainEqual([2, 15, 0]);
  });

  test("Levelausflug: Stärke 5, 15 Ticks beim Einschwenken auf die Ausflugshöhe", () => {
    const calls: Call[] = [];
    const world = {
      terrainSpeed: 0,
      underwater: () => false,
      terrain: () => false,
      kill: () => {},
      vibrate: (s: number, t: number, p: number) => calls.push([s, t, p]),
    };
    const p = new Player(1, 0, 2);
    p.exitState = 1;
    p.y = 243;
    updatePlayer(p, NO_INPUT, world);
    expect(p.exitState).toBe(3);
    expect(calls).toEqual([[5, 15, 1]]);
    // im weiteren Flug keine neue Quelle
    updatePlayer(p, NO_INPUT, world);
    expect(calls).toHaveLength(1);
  });

  test("Spezialablauf 7 (Flucht): Stärke 5, 1 Tick je Spieler links von x 150", async () => {
    const { level, sprites } = await loadTestLevel("level7-5_escape");
    const w = new World(level, sprites, { players: 2 });
    w.env.setSpecial([7, 0, 0, 0, 0]);
    const [a, b] = w.players as [Player, Player];
    a.x = 100;
    b.x = 300;
    a.invulnerable = b.invulnerable = 10;
    const calls = spy(w);
    w.step();
    expect(calls).toContainEqual([5, 1, 0]);
    expect(has(calls, [5, 1, 1])).toBe(false);
  });

  test("Wiedergeburt: Stärke 1, 30 Ticks", async () => {
    const w = await skyfight();
    const calls = spy(w);
    w["rebirth"](w.players[0]!);
    expect(calls).toEqual([[1, 30, 0]]);
  });

  test("Beam loslassen: Stärke 1, 5 Ticks", async () => {
    const w = await skyfight();
    const calls = spy(w);
    const beam: PlayerInput = { ...NO_INPUT, beam: true };
    for (let t = 0; t < 30; t++) {
      w.players[0]!.invulnerable = 2;
      w.step([beam]);
    }
    expect(calls.filter((c) => c[0] === 1 && c[1] === 5)).toHaveLength(0);
    w.players[0]!.invulnerable = 2;
    w.step([NO_INPUT]);
    expect(calls).toContainEqual([1, 5, 0]);
  });
});

describe("Vibration: Ausgabe und Bitgleichheit", () => {
  test("Joystick verdrahtet: Tod erzeugt Summe 5 → 10000, nach der Dauer wieder 0", async () => {
    const w = await skyfight();
    w.padOfPlayer = (p) => p + 1;
    let peak = 0;
    let died = -1;
    let after = -1;
    for (let t = 0; t < 5000 && w.state === 0; t++) {
      w.step();
      peak = Math.max(peak, w.rumble.magnitude[0]);
      if (died < 0 && w.players[0]!.deathTimer > 0) died = t;
      if (died >= 0 && t === died + 60) after = w.rumble.magnitude[0];
    }
    expect(peak).toBe(10000);
    expect(after).toBe(0);
    expect(w.rumble.magnitude[1]).toBe(0);
  });

  test("ohne Joystick oder ausgeschaltet bleibt die Ausgabe 0", async () => {
    const w = await skyfight();
    const off = await skyfight();
    off.padOfPlayer = () => 1;
    off.rumbleOn = [false, false];
    for (let t = 0; t < 200; t++) {
      w.fx.shake = 60;
      off.fx.shake = 60;
      w.step();
      off.step();
      expect(w.rumble.magnitude).toEqual([0, 0]);
      expect(off.rumble.magnitude).toEqual([0, 0]);
    }
  });

  test("Grundstärke skaliert die Ausgabe (Summe 1 → Grundstärke, Summe 5 → 10000)", async () => {
    const w = await skyfight();
    w.padOfPlayer = (p) => p + 1;
    w.rumbleBase = [4000, 4000];
    w.players[0]!.invulnerable = 10;
    w.fx.shake = 5;
    w.step();
    expect(w.rumble.magnitude).toEqual([4000, 4000]);
    w.fx.shake = 60;
    w.step();
    expect(w.rumble.magnitude).toEqual([10000, 10000]);
  });

  test("die Simulation hängt nicht von der Vibration ab (Kopflos-Lauf bitgleich)", async () => {
    expect(await run(true)).toEqual(await run(false));
  });
});
