import type { DovezEnemy, DovezLevel } from "@clove/formats";
import { newRouteActor, stepRoute, type RouteEffect, type RouteHost } from "../sim/route";
import { VbRnd } from "../sim/vb";
import { simulateWeapon, type ShotTrace } from "../sim/weapon";

/**
 * Daten der Debug-Seite `#/dovez/debug/level`: simulierte Routen und
 * Schussmuster eines Levels, ohne DOM. Spieler steht fest, keine Landschaft,
 * alle Teile leben — die Ansicht prüft den Bytecode, nicht das Spiel.
 */

export const PLAYFIELD_W = 800;
export const PLAYFIELD_H = 550;
/** Fester Spieler (linke obere Ecke) und Emitter für die Schussmuster. */
export const DEBUG_PLAYER = { x: 100, y: 275 } as const;
export const DEBUG_EMITTER = { x: 600, y: 275 } as const;
/** Ungefähre Maße des Spielerschiffs (Zielpunkt +28/+31 liegt in der Mitte). */
export const PLAYER_W = 56;
export const PLAYER_H = 62;

/** Bounding-Box eines Gegnertyps wie in `LadeDaten`: max(Teil-Offset + Bildgröße). */
export function enemyBox(level: DovezLevel, e: DovezEnemy): { w: number; h: number } {
  let w = 1;
  let h = 1;
  for (const p of e.parts) {
    const f = level.groups[p.group]?.frames[0];
    w = Math.max(w, p.x + (f?.srcW ?? 0));
    h = Math.max(h, p.y + (f?.srcH ?? 0));
  }
  return { w, h };
}

export interface RouteUse {
  readonly kind: "enemy" | "part" | "shot";
  readonly label: string;
}

export interface TimedEffect extends RouteEffect {
  readonly tick: number;
}

export interface RouteView {
  readonly index: number;
  readonly name: string;
  readonly uses: readonly RouteUse[];
  /** Wie simuliert wurde (Gegnertyp und Spawn, Salve, oder Vorgabe). */
  readonly context: string;
  readonly width: number;
  readonly height: number;
  /** Verschiebung der Pfadkoordinaten (Teilrouten laufen relativ zum Gegner). */
  readonly offset: { readonly x: number; readonly y: number };
  readonly path: readonly [number, number][];
  readonly dead: boolean;
  readonly effects: readonly TimedEffect[];
}

export function routeUses(level: DovezLevel, index: number): RouteUse[] {
  const uses: RouteUse[] = [];
  const spawns = new Map<number, number>();
  for (const e of level.layers[4]?.entries ?? []) {
    if (e.kind === 0 && e.p2 === index) spawns.set(e.p1, (spawns.get(e.p1) ?? 0) + 1);
  }
  for (const [type, n] of spawns) {
    uses.push({ kind: "enemy", label: `${level.enemies[type]?.name ?? type} ×${n}` });
  }
  level.enemies.forEach((e) =>
    e.parts.forEach((p, j) => {
      if (p.route === index) uses.push({ kind: "part", label: `${e.name} Teil ${j}` });
    }),
  );
  level.weapons.forEach((w) =>
    w.salvos.forEach((s, j) => {
      if (s.aimed === 0 && s.route === index) uses.push({ kind: "shot", label: `${w.name} #${j}` });
    }),
  );
  return uses;
}

export function simulateRoute(level: DovezLevel, index: number, ticks = 1500): RouteView {
  const route = level.routes[index]!;
  const uses = routeUses(level, index);
  let x = PLAYFIELD_W;
  let y = PLAYFIELD_H / 2;
  let speed = 2;
  let hp = 100;
  let width = 40;
  let height = 40;
  let offset = { x: 0, y: 0 };
  let context = "Vorgabe: x 800, y 275, Tempo 2";
  const spawn = level.layers[4]?.entries.find((e) => e.kind === 0 && e.p2 === index);
  const part = level.enemies
    .flatMap((e) => e.parts.map((p) => ({ e, p })))
    .find(({ p }) => p.route === index);
  const salvo = level.weapons
    .flatMap((w) => w.salvos.map((s) => ({ w, s })))
    .find(({ s }) => s.aimed === 0 && s.route === index);
  if (spawn && level.enemies[spawn.p1]) {
    const e = level.enemies[spawn.p1]!;
    ({ w: width, h: height } = enemyBox(level, e));
    y = spawn.p3;
    speed = e.speed;
    hp = e.hitPoints;
    context = `Gegner ${e.name}, Spawn Tick ${spawn.tick} bei y ${spawn.p3}, Tempo ${speed}`;
  } else if (part) {
    const f = level.groups[part.p.group]?.frames[0];
    width = f?.srcW ?? 40;
    height = f?.srcH ?? 40;
    x = part.p.x;
    y = part.p.y;
    speed = 1;
    hp = part.p.hitPoints;
    offset = { x: 400, y: 200 };
    context = `Teil von ${part.e.name}, relativ zum Gegner (hier bei 400, 200)`;
  } else if (salvo) {
    x = DEBUG_EMITTER.x + salvo.s.offsetX;
    y = DEBUG_EMITTER.y + salvo.s.offsetY;
    speed = salvo.s.speed;
    hp = salvo.s.damage;
    width = 16;
    height = 16;
    context = `Schuss aus ${salvo.w.name}, Emitter 600, 275, Tempo ${speed}`;
  }
  const effects: TimedEffect[] = [];
  const host: RouteHost & { tick: number } = {
    tick: 0,
    playersMinus1: 0,
    players: [{ ...DEBUG_PLAYER }],
    playerA8: 0,
    globals: [],
    rnd: new VbRnd(),
    hitsLandscape: () => false,
    partDestroyed: () => false,
    effect: (e) => effects.push({ ...e, tick: host.tick }),
  };
  const actor = newRouteActor({ x, y, speed, hp, width, height, spawnTick: spawn?.tick ?? 0 });
  const path: [number, number][] = [[actor.x, actor.y]];
  let dead = false;
  for (let t = 0; t < ticks && !dead; t++) {
    host.tick = (spawn?.tick ?? 0) + t;
    dead = stepRoute(route, actor, host);
    path.push([actor.x, actor.y]);
  }
  return { index, name: route.name, uses, context, width, height, offset, path, dead, effects };
}

export interface WeaponView {
  readonly index: number;
  readonly name: string;
  readonly shots: readonly ShotTrace[];
  /** Waffen, die Teile tragen: „Gegner Teil j“. */
  readonly carriers: readonly string[];
}

export function simulateWeaponView(level: DovezLevel, index: number, ticks = 300): WeaponView {
  const carriers: string[] = [];
  level.enemies.forEach((e) =>
    e.parts.forEach((p, j) => {
      if (p.weapon === index) carriers.push(`${e.name} Teil ${j}`);
    }),
  );
  return {
    index,
    name: level.weapons[index]!.name,
    shots: simulateWeapon(level, index, { origin: DEBUG_EMITTER, player: DEBUG_PLAYER, ticks }),
    carriers,
  };
}
