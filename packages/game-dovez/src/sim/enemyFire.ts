import type { DovezLevel, DovezShot } from "@clove/formats";
import { newRouteActor, stepRoute, type RouteActor, type RouteHost } from "./route";
import type { Surface } from "./surfaces";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, winkel } from "./vb";

/**
 * Gegnerwaffen: Emitter (`Me.C0C`, 51 Slots, `AddGegnerSchussErzeuger`
 * `0x4AA6A0`, `SpielGegnerSchussErzeugen` `0x4AA0D0`) und Gegnerschüsse
 * (`Me.BE8`, 501 Slots, `AddGegnerS` `0x4AA8F0`, `SpielMoveGegnerS`
 * `0x4AAFE0`). Befund: `docs/measurements/dovez-runtime.md`.
 */

export const EMITTER_CAPACITY = 51;
export const ENEMY_SHOT_CAPACITY = 501;
/** Zielpunkt eines gezielten Schusses relativ zur linken oberen Ecke des Spielers. */
export const AIM_OFFSET_X = 28;
export const AIM_OFFSET_Y = 31;

export interface Emitter {
  active: boolean;
  weapon: number;
  /** Gegner und Teil, −1 für einen freien Emitter an (x, y). */
  enemy: number;
  part: number;
  x: number;
  y: number;
  target: number;
  readonly left: number[];
  readonly delay: number[];
  fired: number;
}

export interface EnemyShot {
  active: boolean;
  readonly actor: RouteActor;
  weapon: number;
  salvo: number;
  shotType: number;
  route: number;
  vx: number;
  vy: number;
  damage: number;
  frame: number;
  timer: number;
  /** Tick seit dem Abschuss (Spur, Debug); bei der Druckwelle das Alter (`+0x30`). */
  age: number;
  /** Druckwelle (`+0x2C = −1`): statt einer Kugel ein wachsender Ring ohne Bild. */
  shockwave: boolean;
  /** Wirkdauer der Druckwelle (`+0x34`, `L − L\4`). */
  life: number;
}

/** Wo ein Emitter an einem Gegnerteil sitzt: Bildmitte und Drehung. */
export interface MuzzleSource {
  muzzle(
    enemy: number,
    part: number,
  ): { cx: number; cy: number; w: number; h: number; rotation: number } | undefined;
}

export interface ShotWorld extends Omit<RouteHost, "effect"> {
  /** Schüsse ohne `ignoreWalls` prüfen die Landschaft. */
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  /** Treffer auf Spieler; `true`: der Schuss vergeht. */
  hitPlayers?(shot: EnemyShot, piercing: boolean): boolean;
  /** Zielpunkt einer gezielten Salve auf Spieler `t` (`CLng`, beim D-Phyton gestreut). */
  aimPoint?(target: number): [number, number];
  /** Druckwelle mit Mittelpunkt (cx, cy) und Radius `r` wirkt auf die Spieler. */
  shockwave?(cx: number, cy: number, r: number): void;
}

/** Maße eines Schusstyps: eingebaute Kugel 16×16, sonst erstes Bild der Gruppe. */
export function shotSize(
  surfaces: readonly Surface[][],
  shot: DovezShot | undefined,
): [number, number] {
  if (!shot || shot.kind === 0) return [16, 16];
  const r = surfaces[shot.group]?.[0]?.rect;
  return r && r.w > 0 ? [r.w, r.h] : [16, 16];
}

export class EnemyFire {
  readonly emitters: Emitter[] = Array.from({ length: EMITTER_CAPACITY }, () => ({
    active: false,
    weapon: 0,
    enemy: -1,
    part: -1,
    x: 0,
    y: 0,
    target: 0,
    left: [],
    delay: [],
    fired: 0,
  }));
  readonly shots: EnemyShot[] = Array.from({ length: ENEMY_SHOT_CAPACITY }, () => ({
    active: false,
    actor: newRouteActor({ x: 0, y: 0, speed: 0, hp: 0, width: 16, height: 16, spawnTick: 0 }),
    weapon: 0,
    salvo: 0,
    shotType: 0,
    route: -1,
    vx: 0,
    vy: 0,
    damage: 0,
    frame: 0,
    timer: 0,
    age: 0,
    shockwave: false,
    life: 0,
  }));
  /** Beobachter für Abschüsse (Debug-Spuren). */
  onFire?: (shot: EnemyShot) => void;

  constructor(
    private readonly level: DovezLevel,
    private readonly surfaces: readonly Surface[][],
  ) {}

  /** `AddGegnerSchussErzeuger`: an ein Teil (enemy, part ≥ 0) oder frei an (x, y). */
  addEmitter(
    weapon: number,
    enemy: number,
    part: number,
    x: number,
    y: number,
    target: number,
  ): void {
    const def = this.level.weapons[weapon];
    const e = this.emitters.find((m) => !m.active);
    if (!def || !e) return;
    e.active = true;
    e.weapon = weapon;
    e.enemy = enemy;
    e.part = part;
    e.x = f32(x);
    e.y = f32(y);
    e.target = target;
    e.left.length = 0;
    e.delay.length = 0;
    for (const s of def.salvos) {
      e.left.push(s.repeat);
      e.delay.push(s.startDelay);
    }
    e.fired = 0;
  }

  /** Emitter eines Gegners entfernen (Tod, `KillGegnerSchussErzeuger`). */
  killEmittersOf(enemy: number): void {
    for (const e of this.emitters) if (e.active && e.enemy === enemy) e.active = false;
  }

  /** `SpielGegnerSchussErzeugen`: Salven nach Plan abfeuern. */
  stepEmitters(world: ShotWorld, muzzles: MuzzleSource): void {
    for (const e of this.emitters) {
      if (!e.active) continue;
      let ox = e.x;
      let oy = e.y;
      const def = this.level.weapons[e.weapon]!;
      if (e.enemy >= 0) {
        const m = muzzles.muzzle(e.enemy, e.part);
        if (!m) {
          e.active = false;
          continue;
        }
        ox = m.cx;
        oy = m.cy;
        if (def.turret !== 0) {
          const d = degIndex(cint(m.rotation));
          ox = f32(ox - (m.w * COS_DEG[d]!) / 2);
          oy = f32(oy - (m.h * SIN_DEG[d]!) / 2);
        }
      }
      def.salvos.forEach((s, j) => {
        while (!((e.delay[j] as number) > 0 || (e.left[j] as number) < 0)) {
          this.fire(e, j, f32(ox + s.offsetX), f32(oy + s.offsetY), world);
          e.fired++;
          e.left[j] = (e.left[j] as number) - 1;
          if ((e.left[j] as number) >= 0) e.delay[j] = s.interval;
        }
        e.delay[j] = (e.delay[j] as number) - 1;
      });
      if (e.left.every((n) => n < 0)) e.active = false;
    }
  }

  /** `AddGegnerS`. */
  private fire(e: Emitter, j: number, x: number, y: number, world: ShotWorld): void {
    const s = this.level.weapons[e.weapon]!.salvos[j]!;
    const shot = this.shots.find((s2) => !s2.active);
    if (!shot) return;
    const [width, height] = shotSize(this.surfaces, this.level.shots[s.shotType]);
    const a = shot.actor;
    Object.assign(a, {
      x,
      y,
      vx: 0,
      vy: 0,
      wait: 0,
      ip: 0,
      speed: f32(s.speed),
      hp: f32(s.damage),
      width,
      height,
      spawnY: e.fired,
      spawnTick: 0,
      player: 0,
    });
    a.locals.fill(0);
    shot.active = true;
    shot.weapon = e.weapon;
    shot.salvo = j;
    shot.shotType = s.shotType;
    shot.route = s.route;
    shot.vx = 0;
    shot.vy = 0;
    shot.damage = f32(s.damage);
    shot.frame = 0;
    shot.timer = 0;
    shot.age = 0;
    shot.shockwave = false;
    if (s.aimed !== 0) {
      const p = world.players[e.target] ?? world.players[0];
      const [zx, zy] = world.aimPoint?.(e.target) ?? [
        (p?.x ?? 0) + AIM_OFFSET_X,
        (p?.y ?? 0) + AIM_OFFSET_Y,
      ];
      const ang = winkel(zx - x, zy - y);
      shot.vx = f32(Math.cos(ang) * s.speed);
      shot.vy = f32(Math.sin(ang) * s.speed);
      shot.route = -1;
    }
    this.onFire?.(shot);
  }

  /**
   * `AddGegnerS(−1, 0, L, cx, cy, Ziel)` (`0x4AAF04`): Druckwelle um den
   * Mittelpunkt, wirkt `L − L\4` Ticks; kein Ton, kein `Rnd`, kein Bild.
   */
  addShockwave(cx: number, cy: number, life: number): boolean {
    const shot = this.shots.find((s2) => !s2.active);
    if (!shot) return false;
    shot.active = true;
    shot.shockwave = true;
    shot.actor.x = f32(cx);
    shot.actor.y = f32(cy);
    shot.age = 0;
    shot.life = life - Math.trunc(life / 4);
    return true;
  }

  /** `SpielMoveGegnerS` (`0x4AAFE0`): Bewegung, Culling, Landschaft, Spielertreffer, Druckwellen. */
  stepShots(world: ShotWorld): void {
    const host: RouteHost = { ...world, effect: () => {} };
    for (const shot of this.shots) {
      if (!shot.active) continue;
      const a = shot.actor;
      if (shot.shockwave) {
        // 0x4AC33A: Radius 4 · Alter + 32, wirkt auf die Spieler
        world.shockwave?.(a.x, a.y, f32(shot.age * 4 + 32));
        shot.age++;
        if (shot.age >= shot.life) shot.active = false;
        continue;
      }
      const salvo = this.level.weapons[shot.weapon]?.salvos[shot.salvo];
      let ended = false;
      if (shot.route < 0) {
        a.x = f32(a.x + shot.vx);
        a.y = f32(a.y + shot.vy);
      } else {
        const r = this.level.routes[shot.route];
        ended = !r || stepRoute(r, a, host);
        if (ended && salvo?.onRouteEnd === 1) {
          this.addEmitter(
            salvo.spawnWeapon,
            -1,
            -1,
            cint(a.x + a.width / 2),
            cint(a.y + a.height / 2),
            0,
          );
        }
      }
      shot.age++;
      const cull = shot.route < 0 || (salvo?.cullOffscreen ?? 0) !== 0;
      const off = a.x < -a.width - 50 || a.x > 850 || a.y > 600 || a.y < -a.height - 50;
      const type = this.level.shots[shot.shotType];
      const wall =
        type?.ignoreWalls === 0 &&
        world.terrain(cint(a.x), cint(a.y), cint(a.x + a.width), cint(a.y + a.height));
      const absorbed = world.hitPlayers?.(shot, (salvo?.piercing ?? 0) !== 0) ?? false;
      if (ended || (cull && off) || wall || absorbed) shot.active = false;
    }
  }
}
