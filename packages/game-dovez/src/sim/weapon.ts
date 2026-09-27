import type { DovezLevel, DovezShot } from "@clove/formats";
import { newRouteActor, stepRoute, type RouteActor, type RouteHost } from "./route";
import { VbRnd, cint, f32, winkel } from "./vb";

/**
 * Gegnerwaffen: Salvenplan (`SpielGegnerSchussErzeugen`, `0x4AA0D0`),
 * Schusserzeugung (`AddGegnerS`, `0x4AA8F0`) und Bewegung
 * (`SpielMoveGegnerS`, `0x4AAFE0`), ohne Kollisionen. Für die Debug-Ansicht
 * der Schussmuster; die Engine (M8) übernimmt dieselben Regeln.
 */

/** Zielpunkt eines gezielten Schusses relativ zur linken oberen Ecke des Spielers. */
export const AIM_OFFSET_X = 28;
export const AIM_OFFSET_Y = 31;

export interface ShotTrace {
  /** Tick des Abschusses, 0-basiert ab Waffenstart. */
  readonly tick: number;
  readonly weapon: number;
  readonly salvo: number;
  /** Laufende Nummer im Emitter (`Var` 32760: Ringschüsse rechnen damit Winkel). */
  readonly index: number;
  /** Linke obere Ecke je Tick ab dem Abschuss. */
  readonly path: [number, number][];
  readonly width: number;
  readonly height: number;
}

export interface WeaponSimOptions {
  readonly origin: { readonly x: number; readonly y: number };
  readonly player: { readonly x: number; readonly y: number };
  readonly ticks: number;
  /** Obergrenze für Schüsse insgesamt (Splitterwaffen vervielfachen sich). */
  readonly maxShots?: number;
}

interface Emitter {
  readonly weapon: number;
  readonly x: number;
  readonly y: number;
  readonly left: number[];
  readonly delay: number[];
  fired: number;
}

interface LiveShot {
  readonly trace: ShotTrace;
  readonly actor: RouteActor;
  readonly route: number;
  readonly cull: boolean;
  readonly onRouteEnd: number;
  readonly spawnWeapon: number;
  vx: number;
  vy: number;
}

/** Maße eines Schusstyps: eingebaute Kugel 16×16, sonst erstes Bild der Gruppe. */
export function shotSize(level: DovezLevel, shot: DovezShot | undefined): [number, number] {
  if (!shot || shot.kind === 0) return [16, 16];
  const frame = level.groups[shot.group]?.frames[0];
  return frame && frame.srcW > 0 ? [frame.srcW, frame.srcH] : [16, 16];
}

export function simulateWeapon(
  level: DovezLevel,
  weapon: number,
  opts: WeaponSimOptions,
): ShotTrace[] {
  const maxShots = opts.maxShots ?? 400;
  const traces: ShotTrace[] = [];
  const emitters: Emitter[] = [];
  const shots: LiveShot[] = [];
  const player = { x: opts.player.x, y: opts.player.y };
  const host: RouteHost & { tick: number } = {
    tick: 0,
    playersMinus1: 0,
    players: [player],
    playerA8: 0,
    globals: [],
    rnd: new VbRnd(),
    hitsLandscape: () => false,
    partDestroyed: () => false,
    effect: () => {},
  };

  const addEmitter = (w: number, x: number, y: number) => {
    const def = level.weapons[w];
    if (!def) return;
    emitters.push({
      weapon: w,
      x,
      y,
      left: def.salvos.map((s) => s.repeat),
      delay: def.salvos.map((s) => s.startDelay),
      fired: 0,
    });
  };

  const fire = (e: Emitter, j: number, tick: number) => {
    const s = level.weapons[e.weapon]!.salvos[j]!;
    const [width, height] = shotSize(level, level.shots[s.shotType]);
    const x = f32(e.x + s.offsetX);
    const y = f32(e.y + s.offsetY);
    const trace: ShotTrace = {
      tick,
      weapon: e.weapon,
      salvo: j,
      index: e.fired,
      path: [[x, y]],
      width,
      height,
    };
    traces.push(trace);
    // Var 32760 liefert bei Schüssen die laufende Nummer (shot+0x2C)
    const actor = newRouteActor({
      x,
      y,
      speed: s.speed,
      hp: s.damage,
      width,
      height,
      spawnTick: 0,
      spawnY: e.fired,
    });
    let vx = 0;
    let vy = 0;
    let route = s.route;
    if (s.aimed !== 0) {
      const a = winkel(player.x + AIM_OFFSET_X - x, player.y + AIM_OFFSET_Y - y);
      vx = f32(Math.cos(a) * s.speed);
      vy = f32(Math.sin(a) * s.speed);
      route = -1;
    }
    shots.push({
      trace,
      actor,
      route,
      cull: route < 0 || s.cullOffscreen !== 0,
      onRouteEnd: s.onRouteEnd,
      spawnWeapon: s.spawnWeapon,
      vx,
      vy,
    });
  };

  addEmitter(weapon, opts.origin.x, opts.origin.y);
  for (let tick = 0; tick < opts.ticks; tick++) {
    host.tick = tick;
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i]!;
      const salvos = level.weapons[e.weapon]!.salvos;
      for (let j = 0; j < salvos.length; j++) {
        while (!((e.delay[j] as number) > 0 || (e.left[j] as number) < 0)) {
          if (traces.length >= maxShots) break;
          fire(e, j, tick);
          e.fired++;
          e.left[j] = (e.left[j] as number) - 1;
          if ((e.left[j] as number) >= 0) e.delay[j] = salvos[j]!.interval;
        }
        e.delay[j] = (e.delay[j] as number) - 1;
      }
      if (e.left.every((n) => n < 0)) emitters.splice(i, 1);
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]!;
      const a = s.actor;
      let ended = false;
      if (s.route < 0) {
        a.x = f32(a.x + s.vx);
        a.y = f32(a.y + s.vy);
      } else {
        const r = level.routes[s.route];
        ended = !r || stepRoute(r, a, host);
        if (ended && s.onRouteEnd === 1) {
          addEmitter(s.spawnWeapon, cint(a.x + a.width / 2), cint(a.y + a.height / 2));
        }
      }
      s.trace.path.push([a.x, a.y]);
      const off = a.x < -a.width - 50 || a.x > 850 || a.y > 600 || a.y < -a.height - 50;
      if (ended || (s.cull && off)) shots.splice(i, 1);
    }
    if (emitters.length === 0 && shots.length === 0) break;
  }
  return traces;
}
