import type { DovezEnemy, DovezLevel, DovezPart } from "@clove/formats";
import { doAni } from "./doAni";
import {
  newRouteActor,
  stepRoute,
  type RouteActor,
  type RouteEffect,
  type RouteHost,
} from "./route";
import { spanHit, type Surface } from "./surfaces";
import { cint, f32, vbInt, winkelInGrad } from "./vb";

/**
 * Gegner-Instanzen (`[0x588110]`, 101 × 0xF0) und `SpielMoveEnemy`
 * (`0x4B5850`) in der Reihenfolge des Originals: Route, Selbstzerstörung,
 * je Teil Teilroute, Bild, Zielen, Landschaft, Rammen, Aufblitzen, Feuern.
 * Treffer: `CheckColisionWithEnemy` (`0x4C3E10`). Befund:
 * `docs/measurements/dovez-runtime.md`.
 *
 * Die Todeszustände 1–5 und 7 sind noch vereinfacht (Dauer und Ende, ohne
 * ihre Effekte); Zustand 6 (normaler Abschuss, 50 Ticks) ist vollständig.
 */

export const ENEMY_CAPACITY = 101;
/** Mitte der Spieler-Hitbox (0, 17, 64, 54) relativ zur Schiffsecke. */
const PLAYER_HIT_CX = 32;
const PLAYER_HIT_CY = 17 + 18;

export const DeathState = {
  frozen: 0,
  split: 1,
  nova: 2,
  wreck: 3,
  boss: 4,
  explosive: 5,
  normal: 6,
  chain: 7,
} as const;

export interface PartState {
  readonly def: DovezPart;
  visible: boolean;
  frame: number;
  timer: number;
  hp: number;
  readonly score: number;
  fireTimer: number;
  flash: number;
  rotation: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  /** Eigene Route (x/y relativ zum Gegner), sonst undefined. */
  readonly actor: RouteActor | undefined;
}

export interface Enemy {
  alive: boolean;
  type: number;
  def: DovezEnemy;
  route: number;
  readonly actor: RouteActor;
  parts: PartState[];
  /** Punkte beim Abschuss (+0x1C, ganzzahlige Lebenspunkte). */
  score: number;
  inState: boolean;
  deathState: number;
  stateTimer: number;
}

/** Was Gegner von der Welt brauchen. */
export interface EnemyWorld {
  readonly tick: number;
  readonly playersMinus1: number;
  readonly players: { x: number; y: number }[];
  readonly globals: number[];
  readonly rnd: RouteHost["rnd"];
  readonly surfaces: readonly Surface[][];
  terrain(x1: number, y1: number, x2: number, y2: number, excludeEnemy: number): boolean;
  /** Route-Effekte (Waffen, Animationen, Ebenen, Töne); `enemy` ist der ausführende Gegner. */
  effect(enemy: number, e: RouteEffect): void;
  /** Teil feuert (Feuermodus): Waffe oder Kind-Gegner. */
  partFires(enemy: number, part: number): void;
  addScore(points: number, player: number): void;
  killed(enemy: Enemy, how: "explode" | "silent"): void;
}

export class Enemies {
  readonly items: Enemy[] = [];
  /** Erster freier Slot (`0x58811C`) und höchster belegter (`0x588120`). */
  hint = 0;
  high = -1;
  /** Gegner-Index, der gerade läuft (für Effekte aus Teilrouten). */
  current = -1;

  constructor(
    private readonly level: DovezLevel,
    private readonly surfaces: readonly Surface[][],
    private readonly playersMinus1: number,
  ) {}

  /** Breite/Höhe eines Typs wie in `LadeDaten`: max(Teil-Offset + Bildbreite). */
  box(def: DovezEnemy): { w: number; h: number } {
    let w = 0;
    let h = 0;
    for (const p of def.parts) {
      const r = this.surfaces[p.group]?.[0]?.rect;
      w = Math.max(w, p.x + (r?.w ?? 0));
      h = Math.max(h, p.y + (r?.h ?? 0));
    }
    return { w, h };
  }

  /** `AddEnemy` (`0x575FF0`). */
  add(
    type: number,
    route: number,
    tick: number,
    y: number,
    x: number,
    rnd: RouteHost["rnd"],
  ): number {
    const def = this.level.enemies[type];
    if (!def) return -1;
    let i = this.hint;
    while (i < ENEMY_CAPACITY && this.items[i]?.alive) i++;
    if (i >= ENEMY_CAPACITY) return -1;
    const { w, h } = this.box(def);
    const hp = f32(def.hitPoints * (1 + 0.5 * this.playersMinus1));
    const regs = new Float32Array(14);
    const actor = newRouteActor({
      x,
      y,
      speed: def.speed,
      hp,
      width: w,
      height: h,
      spawnTick: tick,
      spawnY: cint(y),
      player: vbInt(rnd.next() * (this.playersMinus1 + 1)),
      regs,
    });
    const parts = def.parts.map((p, j): PartState => {
      const r = this.surfaces[p.group]?.[0]?.rect;
      return {
        def: p,
        visible: true,
        frame: 0,
        timer: 0,
        hp: f32(p.hitPoints),
        score: cint(p.hitPoints),
        fireTimer: 0,
        flash: 0,
        rotation: f32(p.rotation),
        red: f32(p.red),
        green: f32(p.green),
        blue: f32(p.blue),
        alpha: f32(p.alpha),
        actor:
          p.hasRoute !== 0
            ? newRouteActor({
                x: p.x,
                y: p.y,
                speed: 1,
                hp: p.hitPoints,
                width: r?.w ?? 0,
                height: r?.h ?? 0,
                spawnTick: tick,
                spawnY: j,
                regs,
              })
            : undefined,
      };
    });
    this.items[i] = {
      alive: true,
      type,
      def,
      route,
      actor,
      parts,
      score: cint(hp),
      inState: false,
      deathState: 0,
      stateTimer: 0,
    };
    if (i > this.high) this.high = i;
    this.hint = i + 1;
    return i;
  }

  /** `KillEnemy` (`0x4AC810`). */
  kill(i: number): void {
    const e = this.items[i];
    if (!e) return;
    e.alive = false;
    if (this.hint > i) this.hint = i;
    if (i === this.high) {
      let h = i - 1;
      while (h >= 0 && !this.items[h]?.alive) h--;
      this.high = h;
    }
  }

  /** Oberkante links eines Teils (Zeichen- und Kollisionsposition ohne Rundung). */
  partPos(e: Enemy, p: PartState): [number, number] {
    const px = p.actor ? p.actor.x : p.def.x;
    const py = p.actor ? p.actor.y : p.def.y;
    return [f32(e.actor.x + px), f32(e.actor.y + py)];
  }

  surface(p: PartState): Surface | undefined {
    return this.surfaces[p.def.group]?.[p.frame];
  }

  step(w: EnemyWorld): void {
    const hi = this.high;
    for (let i = 0; i <= hi; i++) {
      const e = this.items[i];
      if (!e?.alive) continue;
      this.current = i;
      if (e.inState) this.stepDeath(i, e, w);
      else this.stepNormal(i, e, w);
    }
    this.current = -1;
  }

  private host(i: number, e: Enemy, w: EnemyWorld): RouteHost {
    return {
      tick: w.tick,
      playersMinus1: w.playersMinus1,
      players: w.players,
      playerA8: 0,
      globals: w.globals,
      rnd: w.rnd,
      hitsLandscape: (x1, y1, x2, y2) => w.terrain(x1, y1, x2, y2, i),
      partDestroyed: (j) => !e.parts[j]?.visible,
      effect: (fx) => w.effect(i, fx),
    };
  }

  private stepNormal(i: number, e: Enemy, w: EnemyWorld): void {
    const host = this.host(i, e, w);
    const route = this.level.routes[e.route];
    if (!route || stepRoute(route, e.actor, host)) {
      this.kill(i);
      w.killed(e, "silent");
      return;
    }
    if (e.actor.hp < 0) {
      // Selbstzerstörung durch die Route: keine Punkte, kein Todes-Spawn
      if (e.def.bigDeath > 0) this.enterState(e, DeathState.chain);
      else if (e.def.wreckGroup > 0) this.enterState(e, DeathState.wreck);
      else {
        w.killed(e, "explode");
        this.kill(i);
      }
      return;
    }
    let destroy = false;
    for (let j = 0; j < e.parts.length && !destroy; j++) {
      const p = e.parts[j]!;
      if (!p.visible) continue;
      const pr = p.def.hasRoute !== 0 ? this.level.routes[p.def.route] : undefined;
      if (p.actor && pr) {
        if (stepRoute(pr, p.actor, host)) p.visible = false;
        if (p.actor.hp < 0) p.visible = false;
      }
      if (!p.visible) continue;
      if (e.def.directionalFrames > 0) {
        p.timer = -10;
        const f = dir8(e.actor.vx, e.actor.vy);
        if (f >= 0) p.frame = f;
      } else {
        doAni(this.level.groups[p.def.group], p);
      }
      const s = this.surface(p);
      const r = s?.rect ?? { w: 0, h: 0 };
      const [x, y] = this.partPos(e, p);
      if (p.def.weapon > -1 && (this.level.weapons[p.def.weapon]?.turret ?? 0) !== 0) {
        // Mitte der Spieler-Hitbox (0, 17)–(64, 54); x wie im Original ohne deren linken Rand
        const pl = w.players[e.actor.player] ?? w.players[0];
        if (pl) {
          p.rotation = f32(
            winkelInGrad(
              pl.x + PLAYER_HIT_CX - (x + vbInt(r.w / 2)),
              pl.y + PLAYER_HIT_CY - (y + vbInt(r.h / 2)),
            ),
          );
        }
      }
      if (e.def.collidesWithTerrain > 0 && s) {
        // rechter Rand aus `red` (+0x10) statt der Kontur — so im Original (0x4C21AC)
        if (
          w.terrain(cint(x + s.left), cint(y + s.topRow), cint(x + p.red), cint(y + s.bottomRow), i)
        ) {
          destroy = true;
          break;
        }
      }
      if (p.flash > 0) p.flash--;
      if (this.shouldFire(p, w)) w.partFires(i, j);
    }
    if (destroy) {
      w.killed(e, "explode");
      this.kill(i);
    }
  }

  private shouldFire(p: PartState, w: EnemyWorld): boolean {
    const m = p.def.fireMode;
    if (m >= 1 && m <= 3) {
      const chance = [0.002, 0.005, 0.02][m - 1]! + 0.005 * w.playersMinus1;
      return chance > w.rnd.next();
    }
    if (m >= 4 && m <= 6) {
      if (++p.fireTimer >= [25, 50, 100][m - 4]!) {
        p.fireTimer = 0;
        return true;
      }
      return false;
    }
    if (m === 7 && p.fireTimer === 0) {
      p.fireTimer = 1;
      return true;
    }
    return false;
  }

  enterState(e: Enemy, state: number): void {
    e.inState = true;
    e.deathState = state;
    e.stateTimer = 0;
  }

  private stepDeath(i: number, e: Enemy, w: EnemyWorld): void {
    const t = e.stateTimer++;
    const end =
      e.deathState === DeathState.normal
        ? 50
        : e.deathState === DeathState.split
          ? 30
          : e.deathState === DeathState.nova
            ? 40
            : e.deathState === DeathState.explosive
              ? 15
              : e.deathState === DeathState.chain
                ? 10 * e.parts.length
                : e.deathState === DeathState.wreck
                  ? 160
                  : e.deathState === DeathState.boss
                    ? 570
                    : Infinity;
    if (t >= end) {
      w.killed(e, "explode");
      this.kill(i);
    }
  }

  /**
   * `CheckColisionWithEnemy` (`0x4C3E10`): der erste Gegner in Slotreihenfolge,
   * dessen sichtbares Teil (vom letzten zum ersten) der Kasten nach Kontur
   * trifft; je Aufruf höchstens ein Teil. Rückgabe ist der **Restschaden**:
   * `damage` ohne Treffer, 0 wenn der Treffer verbraucht wird, bei einem
   * Abschuss der Überschuss (der Schuss fliegt damit weiter). Gepanzerte Teile
   * nehmen keinen Schaden; nur ein durchschlagender Aufrufer gegen einen Typ
   * mit `armorPassThrough` behält dann den vollen Schaden.
   */
  hit(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    damage: number,
    player: number,
    w: EnemyWorld,
    opts: { exclude?: number; pierce?: boolean } = {},
  ): number {
    const exclude = opts.exclude ?? -1;
    for (let i = 0; i <= this.high; i++) {
      const e = this.items[i];
      if (!e?.alive || e.inState || i === exclude) continue;
      for (let j = e.parts.length - 1; j >= 0; j--) {
        const p = e.parts[j]!;
        if (!p.visible) continue;
        const s = this.surface(p);
        if (!s) continue;
        const [x, y] = this.partPos(e, p);
        if (!spanHit(s, cint(x), cint(y), x1, y1, x2, y2)) continue;
        if (damage < 0) return 0;
        let ret = e.def.armorPassThrough <= 0 || !opts.pierce ? 0 : damage;
        if (p.def.armored !== 0) return ret;
        if (e.def.hitFlash === 1) p.flash = 2;
        else if (e.def.hitFlash >= 2) for (const q of e.parts) q.flash = 2;
        if (p.def.damagesBody !== 0) {
          e.actor.hp = f32(e.actor.hp - damage);
          if (e.actor.hp > 0) return 0;
          ret = cint(-e.actor.hp);
          this.killBy(e, player, w);
          return ret;
        }
        p.hp = f32(p.hp - damage);
        if (p.hp > 0) return ret;
        ret = cint(-p.hp);
        p.visible = false;
        w.addScore(p.score, player);
        if (p.def.vital !== 0 || !e.parts.some((q) => q.visible)) this.killBy(e, player, w);
        return ret;
      }
    }
    return damage;
  }

  /** Abschuss durch einen Spieler (Zustandswahl §4, ohne Beam/Nova). */
  private killBy(e: Enemy, player: number, w: EnemyWorld): void {
    w.addScore(e.score, player);
    if (e.def.explosionSpec > 0) this.enterState(e, DeathState.explosive);
    else if (e.def.bigDeath > 0) this.enterState(e, DeathState.chain);
    else if (e.def.boss > 0) this.enterState(e, DeathState.boss);
    else this.enterState(e, DeathState.normal);
  }
}

/** Richtungsbild 0–7 aus der Gegnergeschwindigkeit (0 oben, 2 rechts, 4 unten, 6 links). */
export function dir8(vx: number, vy: number): number {
  if (vx === 0 && vy === 0) return -1;
  const right = vx >= 0;
  if (vy === 0) return right ? 2 : 6;
  const r = Math.abs(vx / vy);
  if (vy < 0) return r < 0.5 ? 0 : r > 2 ? (right ? 2 : 6) : right ? 1 : 7;
  return r < 0.5 ? 4 : r > 2 ? (right ? 2 : 6) : right ? 3 : 5;
}
