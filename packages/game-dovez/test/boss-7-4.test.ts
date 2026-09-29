/**
 * Level 7-4 „Final Boss“: die Spinne ist kein `boss`-Gegner, sondern ein Skript. Ihre Route
 * (Nr. 3) vergleicht die Lebenspunkte mit der Literalmarke 100000; der Port las Literale über
 * 32784 als 0, die Route sah nie die Marke, und der Level lief endlos. Hier: `Var`-Literale,
 * die Route im Level (Einflug, Wartestellung, Hinweis auf die Super-Nova) und der ganze Ablauf
 * bis zum Levelende mit dem Bot.
 */
import { describe, expect, test } from "bun:test";
import type { DovezRoute } from "@clove/formats";
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { VAR, newRouteActor, stepRoute, type RouteHost } from "../src/sim/route";
import { VbRnd } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";
import { botInput } from "./bot";

const SLUG = "level7-4_finalboss";
/** Tastenaktion 9 = Super-Nova (Hinweis „Drücke: E“). */
const NOVA_ACTION = 9;

function host(): RouteHost & { tick: number } {
  return {
    tick: 0,
    playersMinus1: 0,
    players: [{ x: 100, y: 275 }],
    playerA8: 0,
    globals: [],
    rnd: new VbRnd(),
    hitsLandscape: () => false,
    partDestroyed: () => false,
    effect: () => undefined,
  };
}

/** Route aus Befehlen; Argumente als `[a, b]` (Wert = Var(a) + Var(b)). */
function route(...ops: [number, ...[number, number][]][]): DovezRoute {
  return {
    name: "test",
    ops: ops.map(([op, ...args]) => ({ op, args: args.map(([a, b]) => ({ a, b })) })),
  } as DovezRoute;
}

describe("Var: Literale über 32784", () => {
  test("Zuweisung mit 100000, −100000 und 32785 wie in Route 3 des Levels", () => {
    const h = host();
    const a = newRouteActor({ x: 0, y: 0, speed: 1, hp: 7, width: 1, height: 1, spawnTick: 0 });
    stepRoute(
      route(
        [9, [VAR.hp, 0], [100000, 0]],
        [9, [VAR.local0, 0], [-100000, 0]],
        [9, [VAR.local0 - 1, 0], [32785, 0]],
        [5, [1, 0]],
      ),
      a,
      h,
    );
    expect(a.hp).toBe(100000);
    expect(a.locals[0]).toBe(-100000);
    expect(a.locals[1]).toBe(32785);
  });

  test("If HP == 100000 hält die Route in der Warteschleife, bis die HP abweichen", () => {
    const h = host();
    const a = newRouteActor({
      x: 0,
      y: 0,
      speed: 1,
      hp: 100000,
      width: 1,
      height: 1,
      spawnTick: 0,
    });
    const r = route(
      [11, [0, 0]], // Label 0
      [13, [VAR.hp, 0], [0, 0], [100000, 0]], // If HP == 100000
      [5, [1, 0]],
      [12, [0, 0]], // Goto 0
      [15, [0, 0]], // EndIf
      [9, [VAR.hp, 0], [-1, 0]],
      [5, [1, 0]],
    );
    for (let t = 0; t < 5; t++) {
      expect(stepRoute(r, a, h)).toBe(false);
      expect(a.hp).toBe(100000);
    }
    a.hp = 90000;
    stepRoute(r, a, h);
    expect(a.hp).toBe(-1);
  });

  test("Variablencodes bleiben Variablen (32784 = Spielerfeld, nicht Literal)", () => {
    const h = { ...host(), playerA8: 3 };
    const a = newRouteActor({ x: 0, y: 0, speed: 1, hp: 1, width: 1, height: 1, spawnTick: 0 });
    stepRoute(route([9, [VAR.local0, 0], [VAR.playerA8, 0]], [5, [1, 0]]), a, h);
    expect(a.locals[0]).toBe(3);
  });
});

/** Ein Tick mit Bot-Eingabe (Dauerfeuer, unverwundbar); Nova nur auf Wunsch. */
function tick(w: World, nova: boolean): void {
  for (const p of w.players) p.invulnerable = 2;
  const inp: PlayerInput = { ...botInput(w), nova };
  w.step([inp, NO_INPUT]);
  w.events.length = 0;
}

const spider = (w: World) => w.enemies.items.find((e) => e?.alive);
/** Der Hinweis „Drücke: <Nova>“ steht im Bild; die Taste wird auf jeden zweiten Tick gedrückt (Flanke). */
const novaWanted = (w: World, t: number) => w.env.hint?.action === NOVA_ACTION && t % 2 === 0;

describe("Level 7-4: Ablauf der Spinne", () => {
  test("Einflug, Wartestellung bei x = 230, Hinweis auf die Super-Nova, Scrollstopp", async () => {
    const { level, sprites } = await loadTestLevel(SLUG);
    const w = new World(level, sprites);
    let sawEntry = false;
    for (let t = 0; t < 1200 && !w.env.special.active; t++) {
      tick(w, false);
      const e = spider(w);
      if (e && !sawEntry) {
        sawEntry = true;
        // Eintrag Ebene 4, Tick 220: Typ 0, Route 3, y = −53; die Route setzt x = 800 + 200
        expect(e.actor.x).toBeGreaterThan(900);
        expect(e.actor.y).toBe(-53);
        expect(e.actor.hp).toBe(100000);
      }
    }
    expect(sawEntry).toBe(true);
    const e = spider(w)!;
    expect(e.actor.x).toBe(230);
    // `boss` = 0 in den Daten: der Levelabschluss läuft über die Route, nicht über den Boss-Tod
    expect(w.bossAlive).toBe(false);
    expect(w.env.special.type).toBe(1);
    expect(w.env.special.p[0]).toBe(NOVA_ACTION);
    for (const l of w.layers) expect(l.speed).toBe(0);
    // Dauerfeuer ändert nichts: alle Teile sind gepanzert
    const t0 = w.tick;
    for (let t = 0; t < 100; t++) tick(w, false);
    expect(spider(w)).toBe(e);
    expect(e.actor.hp).toBe(100000);
    expect(e.actor.x).toBe(230);
    expect(w.tick).toBe(t0 + 100);
    expect(w.state).toBe(0);
  });

  test("Ohne Nova bleibt es bei der Wartestellung (der Hinweis läuft nach 300 Ticks ab)", async () => {
    const { level, sprites } = await loadTestLevel(SLUG);
    const w = new World(level, sprites);
    for (let t = 0; t < 2200; t++) tick(w, false);
    expect(w.state).toBe(0);
    expect(spider(w)?.actor.hp).toBe(100000);
    expect(w.env.special.active).toBe(false);
  });

  test("Super-Nova: 10000 Abzug, Route setzt HP −1, Spinne zerfällt, Zeitsprung, Level geschafft", async () => {
    const { level, sprites } = await loadTestLevel(SLUG);
    const w = new World(level, sprites);
    let novaTick = -1;
    let hit = false;
    let jumped = false;
    let deadAt = -1;
    for (let t = 0; t < 4000 && w.state === 0; t++) {
      tick(w, novaWanted(w, t));
      if (w.nova && novaTick < 0) novaTick = t;
      const e = spider(w);
      if (e && e.actor.hp === 90000) hit = true;
      if (!jumped && w.tick >= level.levelLength - 300) {
        jumped = true;
        // SetSpecial 6: `Me.584 = Me.588 − 300`, Schiffe gesteuert
        expect(w.env.special.type).toBe(6);
        expect(w.players[0]!.exitState).toBeGreaterThan(0);
      }
      if (novaTick >= 0 && !e && deadAt < 0) deadAt = t;
    }
    expect(novaTick).toBeGreaterThan(0);
    expect(hit).toBe(true);
    expect(jumped).toBe(true);
    expect(deadAt).toBeGreaterThan(novaTick);
    expect(w.state).toBe(2);
    expect(w.tick).toBeGreaterThanOrEqual(level.levelLength - 1);
  });
});

describe("Level 7-4: der Bot schafft es", () => {
  test("Bot mit Dauerfeuer und Nova auf den Hinweis: Level geschafft (state 2)", async () => {
    const { level, sprites } = await loadTestLevel(SLUG);
    const w = new World(level, sprites);
    let ticks = 0;
    for (; ticks < 20000 && w.state === 0; ticks++) tick(w, novaWanted(w, ticks));
    expect(w.state).toBe(2);
    expect(ticks).toBeLessThan(3000);
    expect(spider(w)).toBeUndefined();
  });
});
