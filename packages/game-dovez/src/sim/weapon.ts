import type { DovezLevel } from "@clove/formats";
import { EnemyFire, type EnemyShot, type ShotWorld } from "./enemyFire";
import type { Surface } from "./surfaces";
import { VbRnd } from "./vb";

/**
 * Schussmuster einer Gegnerwaffe für die Debug-Ansicht: ein freier Emitter,
 * fester Spieler, keine Landschaft und keine Treffer. Nutzt dieselben Pools
 * wie die Engine (`EnemyFire`).
 */

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

/** Surfaces nur aus den Gruppenmaßen im Skript (ohne Atlas), für Schussgrößen. */
function scriptSurfaces(level: DovezLevel): Surface[][] {
  return level.groups.map((g) =>
    g.frames.map((f) => ({
      key: f.bmp,
      rect: { x: 0, y: 0, w: Math.max(0, f.srcW - f.srcX), h: Math.max(0, f.srcH - f.srcY) },
      left: 0,
      right: 0,
      topRow: -1,
      bottomRow: -1,
      spans: new Int16Array(0),
    })),
  );
}

export function simulateWeapon(
  level: DovezLevel,
  weapon: number,
  opts: WeaponSimOptions,
): ShotTrace[] {
  const maxShots = opts.maxShots ?? 400;
  const fire = new EnemyFire(level, scriptSurfaces(level));
  const traces: ShotTrace[] = [];
  const live = new Map<EnemyShot, ShotTrace>();
  let tick = 0;
  fire.onFire = (shot) => {
    if (traces.length >= maxShots) {
      shot.active = false;
      return;
    }
    const a = shot.actor;
    const t: ShotTrace = {
      tick,
      weapon: shot.weapon,
      salvo: shot.salvo,
      index: a.spawnY,
      path: [[a.x, a.y]],
      width: a.width,
      height: a.height,
    };
    traces.push(t);
    live.set(shot, t);
  };
  const world: ShotWorld & { tick: number } = {
    tick: 0,
    playersMinus1: 0,
    players: [{ x: opts.player.x, y: opts.player.y }],
    playerA8: 0,
    globals: [],
    rnd: new VbRnd(),
    hitsLandscape: () => false,
    partDestroyed: () => false,
    terrain: () => false,
  };
  const noMuzzle = { muzzle: () => undefined };
  fire.addEmitter(weapon, -1, -1, opts.origin.x, opts.origin.y, 0);
  for (; tick < opts.ticks; tick++) {
    world.tick = tick;
    fire.stepEmitters(world, noMuzzle);
    fire.stepShots(world);
    for (const [shot, t] of live) {
      t.path.push([shot.actor.x, shot.actor.y]);
      if (!shot.active) live.delete(shot);
    }
    if (live.size === 0 && !fire.emitters.some((e) => e.active)) break;
  }
  return traces;
}
