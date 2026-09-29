import type { DovezEnemy, DovezLevel, DovezPart } from "@clove/formats";
import { doAni } from "./doAni";
import {
  newRouteActor,
  stepRoute,
  type RouteActor,
  type RouteEffect,
  type RouteHost,
} from "./route";
import type { Effects } from "./effects";
import { spanHit, type Surface } from "./surfaces";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, vbInt, winkelInGrad } from "./vb";

/**
 * Gegner-Instanzen (`[0x588110]`, 101 × 0xF0) und `SpielMoveEnemy`
 * (`0x4B5850`) in der Reihenfolge des Originals: Route, Selbstzerstörung,
 * je Teil Teilroute, Bild, Zielen, Landschaft, Rammen, Aufblitzen, Feuern.
 * Treffer: `CheckColisionWithEnemy` (`0x4C3E10`). Befund:
 * `docs/measurements/dovez-runtime.md`.
 *
 * Ein gewöhnlicher Abschuss lässt den Gegner sofort zerplatzen (`killBy`).
 * Todeszustände: 3 (Wrack), 5 (Sprengkörper), 6 (Abschuss durch den Beam)
 * und 7 (Kettenexplosion) sowie 1 (Spaltung in der Kraftphase), 4
 * (Boss-Finale), 2 (Nova-Tod), 0 (eingefroren) und −1 (während der Nova
 * versteckt) sind vollständig.
 */

export const ENEMY_CAPACITY = 101;
/** Mitte der Spieler-Hitbox (0, 17, 64, 54) relativ zur Schiffsecke. */
const PLAYER_HIT_CX = 32;
const PLAYER_HIT_CY = 17 + 18;

export const DeathState = {
  /** Während der Super-Nova nova-immun bzw. beim Start inaktiv: weder bewegt noch gezeichnet. */
  hidden: -1,
  /** Während der Super-Nova eingefroren: nur gezeichnet. */
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
  /** Umriss über die sichtbaren Teile (Zustand 6, `e+0x80…0x8C`): links, oben, Breite, Höhe. */
  bbox: [number, number, number, number];
  /** Wrackteile (Zustand 3): Flugwinkel (0 = fertig), Bild, Bildzeit. */
  pieces: { angle: number; frame: number; timer: number }[];
}

/** Was Gegner von der Welt brauchen. */
export interface EnemyWorld {
  readonly tick: number;
  readonly playersMinus1: number;
  readonly players: { x: number; y: number; energy: number; alive: boolean }[];
  readonly globals: number[];
  readonly rnd: RouteHost["rnd"];
  readonly surfaces: readonly Surface[][];
  readonly fx: Effects;
  readonly gravity: number;
  terrain(x1: number, y1: number, x2: number, y2: number, excludeEnemy: number): boolean;
  /** Route-Effekte (Waffen, Animationen, Ebenen, Töne); `enemy` ist der ausführende Gegner. */
  effect(enemy: number, e: RouteEffect): void;
  /** Teil feuert (Feuermodus): Waffe oder Kind-Gegner. */
  partFires(enemy: number, part: number): void;
  /** `AddPunkte`: Punkte, Wackeln, Popup bei (x, y) mit Steiggeschwindigkeit `vy`. */
  addPoints(points: number, x: number, y: number, vy: number, player: number): void;
  /** Abschusszähler `B48[0].54`: +1 je Explosion eines Teils (wandert in den Spielstand). */
  addKill(): void;
  /** `KillGegnerSchussErzeuger` für alle Waffen des Gegners. */
  killEmitters(enemy: number): void;
  /** Effekt-Ton aus `Sound.d2p` (Name wie das Asset `sound/<name>`). */
  sound(name: string): void;
  /** Druckwelle `AddGegnerS(−1, …)` um (cx, cy) mit Lebensdauer `life`. */
  shockwave(cx: number, cy: number, life: number, target: number): void;
  /** `AddForce` (`0x529870`): Joystick-Vibration, reine Ausgabe. */
  vibrate?(strength: number, ticks: number, player: number): void;
  /** Beam-Kraftphase des Spielers (`Me.CB0[p]+0x2E`). */
  beamPower(player: number): boolean;
  /** Super-Nova läuft (`Me.D6C`). */
  readonly nova: boolean;
  /** Kombo + 1 während der Kraftphase (`Me.59C`/`Me.5B8`). */
  comboUp(player: number): void;
  /** Kombo zurücksetzen (Multiplikator 1, Treffer und Bonus 0). */
  comboReset(player: number): void;
  /** Boss-Finale (Zustand 4): Hintergrund `Me.7CC`, Levelende, Overlays, Ton-Schleifen. */
  readonly boss: BossHooks;
}

export interface BossHooks {
  /** T = 1: beide Spieler 600 Ticks unverwundbar, im 1P eine Beam-Kraftphase beenden. */
  start(): void;
  /** Hintergrund `Me.7CC` lesen/setzen. */
  background(v?: number): number;
  /** T = 520: `Me.584 = Me.588 − 151` (Levelausflug im nächsten Tick). */
  jumpToLevelEnd(): void;
  /** Bildschirm-Overlays A (`Me.508`) und B (`Me.506`) von `OverlayEffekte`. */
  overlay(which: "a" | "b", on: boolean): void;
  /** Effekt-Ton als Schleife (`PlaySound …, 1`) bzw. `StopSound`. */
  loop(name: string, on: boolean): void;
}

export class Enemies {
  readonly items: Enemy[] = [];
  /** Erster freier Slot (`0x58811C`) und höchster belegter (`0x588120`). */
  hint = 0;
  high = -1;
  /** Gegner-Index, der gerade läuft (für Effekte aus Teilrouten). */
  current = -1;
  /**
   * „Boss lebt“ (`[0x5882A8]`): `AddEnemy` setzt es bei `boss = 1`, nur
   * `VariabelnLösch` löscht es (nicht der Boss-Tod, nicht der Schnappschuss).
   */
  bossFlag = false;

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
      bbox: [0, 0, 0, 0],
      pieces: [],
    };
    if (i > this.high) this.high = i;
    this.hint = i + 1;
    if (def.boss === 1) this.bossFlag = true;
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

  /** `KillEnemy` samt den Waffen des Gegners. */
  private destroy(i: number, w: EnemyWorld): void {
    w.killEmitters(i);
    this.kill(i);
  }

  private stepNormal(i: number, e: Enemy, w: EnemyWorld): void {
    const host = this.host(i, e, w);
    const route = this.level.routes[e.route];
    if (!route || stepRoute(route, e.actor, host)) {
      // Route zu Ende (meist aus dem Bild): still, ohne Punkte; ein entkommener Gegner beendet die Kombo
      if (e.def.noComboReset === 0 && e.def.solid === 0) {
        for (let p = 0; p <= w.playersMinus1; p++) if (w.beamPower(p)) w.comboReset(p);
      }
      this.destroy(i, w);
      return;
    }
    if (e.actor.hp < 0) {
      this.selfDestruct(i, e, w);
      return;
    }
    let crash = false;
    for (let j = 0; j < e.parts.length && !crash; j++) {
      const p = e.parts[j]!;
      if (!p.visible) continue;
      const pr = p.def.hasRoute !== 0 ? this.level.routes[p.def.route] : undefined;
      if (p.actor && pr) {
        if (stepRoute(pr, p.actor, host)) p.visible = false;
        if (p.actor.hp < 0) {
          w.sound(p.score > 1499 ? "explosion2" : "explosion1");
          this.burstPart(e, p, w, 150, 0, false);
          p.visible = false;
        }
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
          w.terrain(cint(x + s.minX), cint(y + s.topRow), cint(x + p.red), cint(y + s.bottomRow), i)
        ) {
          crash = true;
          break;
        }
      }
      if (e.def.ramsEnemies > 0 && s) {
        // Rammen: Restschaden wird die eigene Energie; ein Treffer ohne Abschuss kostet alles
        const k = e.def.ramsEnemies - 1;
        const rem = this.hit(
          cint(x + s.minX + k),
          cint(y + s.topRow + k),
          cint(x + s.maxX - k),
          cint(y + s.bottomRow - k),
          cint(e.actor.hp),
          -1,
          w,
          { exclude: i, sparks: true },
        );
        if (rem !== e.actor.hp) e.actor.hp = f32(rem);
        if (e.actor.hp <= 0) {
          crash = true;
          break;
        }
      }
      if (!e.alive) return;
      if (p.flash > 0) p.flash--;
      if (this.shouldFire(p, w)) w.partFires(i, j);
    }
    if (crash) this.crash(i, e, w);
  }

  /** §2.5: an Landschaft zerschellt oder beim Rammen gestorben — keine Punkte, kein Wrack. */
  private crash(i: number, e: Enemy, w: EnemyWorld): void {
    this.deathSpawn(e, w);
    for (const p of e.parts) if (p.visible) this.burstPart(e, p, w, 500, 0, false);
    w.sound("explosion2");
    this.destroy(i, w);
  }

  /** §2.2: Route setzt die Energie unter 0. Keine Punkte, kein Todes-Spawn. */
  private selfDestruct(i: number, e: Enemy, w: EnemyWorld): void {
    if (e.def.deathShockwave > 0) this.shockwave(e, w);
    if (e.def.bigDeath > 0) {
      this.enterState(e, DeathState.chain);
      w.sound("spalt");
      return;
    }
    w.sound(e.score > 1499 ? "explosion2" : "explosion1");
    for (const p of e.parts) if (p.visible) this.burstPart(e, p, w, 150, 0, true);
    if (e.def.wreckGroup > 0) this.enterState(e, DeathState.wreck);
    else this.destroy(i, w);
  }

  /** Kind-Gegner beim Tod (`deathSpawn`: Anzahl−1 · Typ · Route). */
  private deathSpawn(e: Enemy, w: EnemyWorld): void {
    const a9 = e.def.deathSpawn;
    if (a9 <= 0) return;
    const type = Math.trunc((a9 % 1000) / 10);
    const child = this.level.enemies[type];
    if (!child) return;
    const c = this.box(child);
    const { w: bw, h: bh } = this.box(e.def);
    for (let n = 0; n <= a9 % 10; n++) {
      this.add(
        type,
        Math.trunc(a9 / 1000),
        w.tick,
        cint(e.actor.y + idiv(bh, 2) - idiv(c.h, 2)),
        cint(e.actor.x + idiv(bw, 2) - idiv(c.w, 2)),
        w.rnd,
      );
    }
  }

  /** §6.4: Druckwelle (Spielwirkung bei der Welt) und ihr Ring (große Partikel Art 13). */
  private shockwave(e: Enemy, w: EnemyWorld): void {
    const { w: bw, h: bh } = this.box(e.def);
    const cx = f32(e.actor.x + idiv(bw, 2));
    const cy = f32(e.actor.y + idiv(bh, 2));
    w.shockwave(cx, cy, e.def.deathShockwave, e.actor.player);
    const r = w.rnd.next();
    w.fx.addBig(cx - 32, cy - 32, 0, 0, 1, 1, 1, 64, 0, e.def.deathShockwave, 13, r * 359);
  }

  /**
   * „Part burst“: Funken und Explosion über der Kontur eines Teils,
   * senkrecht um `dy` gestreckt (Zustand 6 mit t = 50: ein Fehler des
   * Originals, übernommen); optional Wackeln und Ton.
   */
  private burstPart(
    e: Enemy,
    p: PartState,
    w: EnemyWorld,
    count: number,
    dy: number,
    shake: boolean,
    sound = false,
  ): void {
    const s = this.surface(p);
    if (!s) return;
    const [px, py] = this.partPos(e, p);
    const x1 = px + s.minX;
    const x2 = px + s.maxX;
    const y1 = py - dy + s.topRow;
    const y2 = py + dy + s.bottomRow;
    w.fx.addSparks(1, count, cint(x1 + 5), cint(y1 + 5), cint(x2 - 5), cint(y2 - 5), false);
    w.fx.addExplosion(x1, y1, x2, y2);
    if (shake) w.addKill();
    // keine Erschütterung, solange im 1P die Kraftphase läuft
    if (shake && (!w.beamPower(0) || this.playersMinus1 === 1))
      w.fx.shake += idiv(p.score, 500) + 1;
    if (sound) w.sound(p.score > 1499 ? "explosion2" : "explosion1");
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
    switch (e.deathState) {
      case DeathState.normal:
        this.stepNormalKill(i, e, w);
        return;
      case DeathState.wreck:
        this.stepWreck(i, e, w);
        return;
      case DeathState.explosive:
        this.stepExplosive(i, e, w);
        return;
      case DeathState.chain:
        this.stepChain(i, e, w);
        return;
      case DeathState.boss:
        this.stepBoss(i, e, w);
        return;
      case DeathState.split:
        this.stepSplit(i, e, w);
        return;
      case DeathState.nova:
        this.stepNovaDeath(i, e, w);
        return;
      case DeathState.frozen:
      case DeathState.hidden:
        // 0: nur zeichnen (der Renderer, ohne Aufblitzen); −1: ganz übersprungen
        return;
    }
    if (e.stateTimer++ === 0) w.killEmitters(i);
  }

  /**
   * Zustand 2, Nova-Tod (`0x4B71C9`), 40 Ticks: im ersten Tick je großem
   * sichtbarem Teil Glitzer-Fragmente (Glut, Strich, Welle; 3 `Rnd` je
   * Stück) und die Waffen weg; bei 40 zerplatzt jedes Teil über seinem
   * Quellrechteck (nicht der Kontur) mit Wackeln und Ton. Keine Punkte (die
   * gab die Nova).
   */
  private stepNovaDeath(i: number, e: Enemy, w: EnemyWorld): void {
    const fx = w.fx;
    const origin = (p: PartState): [number, number] => [
      e.actor.x + (p.actor ? p.actor.x : p.def.x),
      e.actor.y + (p.actor ? p.actor.y : p.def.y),
    ];
    if (e.stateTimer === 0) {
      for (const p of e.parts) {
        const s = this.surface(p);
        if (!p.visible || !s) continue;
        if (!(s.maxX - s.minX > 30 && s.bottomRow - s.topRow > 30)) continue;
        const [ox, oy] = origin(p);
        // Bitmapgröße (+0x4/+0x6), nicht der Ausschnitt
        const n = Math.trunc(((s.bmpW ?? s.rect.w) + (s.bmpH ?? s.rect.h)) / 100) + 1;
        for (let m = 0; m <= n; m++) {
          const r1 = w.rnd.next();
          const x = f32(cint((s.maxX - s.minX - 30) * r1) + ox + s.minX + 15);
          const r2 = w.rnd.next();
          const y = f32(cint((s.bottomRow - s.topRow - 30) * r2) + oy + s.topRow + 15);
          fx.addBig(x - 20, y - 20, 0, 0, 1, 1, 1, 40, 40, 5, 1, 0);
          const r3 = w.rnd.next();
          fx.addBig(x, y, 0, 0, 1, 1, 1, 0, 10, 30, 4, cint(r3 * 360));
          fx.addBig(x, y, 0, 0, 1, 1, 1, 0, 0, 25, 2, 5);
        }
      }
      w.killEmitters(i);
    }
    if (++e.stateTimer !== 40) return;
    for (const p of e.parts) {
      const s = this.surface(p);
      if (!p.visible || !s) continue;
      const [ox, oy] = origin(p);
      fx.addSparks(
        1,
        150,
        cint(ox + s.left + 5),
        cint(oy + s.topRow + 5),
        cint(ox + s.right - 5),
        cint(oy + s.bottomRow - 5),
        false,
      );
      fx.addExplosion(ox + s.left, oy + s.topRow, ox + s.right, oy + s.bottomRow);
      w.addKill();
      if (!w.beamPower(0) || this.playersMinus1 === 1) fx.shake += idiv(p.score, 500) + 1;
      w.sound(p.score > 1499 ? "explosion2" : "explosion1");
    }
    this.kill(i);
  }

  /**
   * Zustand 4, Boss-Finale (`0x4B9394`…`0x4BCF9A`), 570 Ticks: Teile stehen
   * eingefroren (der Renderer zeichnet sie bis T = 500), Rauch, Funken und
   * Explosionen, Strahlenkranz (t = 120), Explosionsellipsen (t = 160…230),
   * implodierende Wellen ab T = 325, rote Glut und Wackeln (T = 430), zwei
   * weiße Vollbildblitze; T = 500 zerplatzen die Teile, T = 520 beginnt der
   * Levelausflug, T = 570 ist der Boss weg. Befund: `reports`/Doku „Bosse“.
   */
  private stepBoss(i: number, e: Enemy, w: EnemyWorld): void {
    const { w: bw, h: bh } = this.box(e.def);
    const x = e.actor.x;
    const y = e.actor.y;
    const rnd = w.rnd;
    const fx = w.fx;
    const out = fx.lists.enemies;
    const t = e.stateTimer;
    if (t < 500) {
      if (t % 2 === 0) {
        let X = f32(x + (bw - 64) * rnd.next());
        let Y = f32(y + (bh - 64) * rnd.next());
        if (X < 0) X = 0;
        if (Y < 0) Y = 0;
        if (X > 736) X = 736;
        if (Y > 486) Y = 486;
        fx.addBig(X, Y, 0, -1, 1, 1, 1, 64, 0, 20, 11, 0);
        fx.addExplosion(X, Y, f32(X + 64), f32(Y + 64));
      }
      for (let n = 0; n < 2; n++) {
        const r1 = rnd.next();
        const r2 = rnd.next();
        const r3 = rnd.next();
        const r4 = rnd.next();
        fx.addBig(
          f32(x + (bw - 8) * r1),
          f32(y + (bh - 16) * r2),
          0,
          -2,
          1,
          r3,
          f32(r4 / 2),
          8,
          0,
          16,
          10,
          0,
        );
      }
      fx.addSparks(1, 1, cint(x), cint(y), cint(x + bw), cint(y + bh), false);
    }
    if (t < 20) out.quad("weiss", 0, 0, 800, 550, 1, 1, 1, f32(1 - Math.abs(10 - t) / 10), true);
    const cx = x + bw / 2 - 15;
    const cy = y + bh / 2 - 15;
    if (t === 120) {
      for (let k = 0; k < 24; k++) {
        const a = cint(rnd.next() * 359);
        const r1 = rnd.next();
        const r2 = rnd.next();
        const r3 = rnd.next();
        const c = COS_DEG[a] ?? 0;
        const sn = SIN_DEG[a] ?? 0;
        fx.addBig(
          f32(cx + c * 600),
          f32(cy + sn * 600),
          f32(c * -15),
          f32(sn * -15),
          1,
          f32(r1 * 0.5 + 0.2),
          f32(r2 * 0.3),
          30,
          cint(r3 * 30),
          40,
          15,
          a,
        );
      }
      for (let a = 0; a < 360; a += 15) {
        const r = rnd.next();
        const c = COS_DEG[a] ?? 0;
        const sn = SIN_DEG[a] ?? 0;
        fx.addBig(
          f32(cx + c * 600),
          f32(cy + sn * 600),
          f32(c * -15),
          f32(sn * -15),
          1,
          f32(0.8),
          f32(0.3),
          30,
          cint(r * 30),
          40,
          15,
          a,
        );
      }
    }
    // ein Rnd jeden Tick, auch ohne Ton
    if (rnd.next() < 0.2 && t < 160 && t > 130) {
      w.sound("endgegnerw3");
      w.sound("endgegnerw3");
    }
    if (t === 170) {
      w.boss.overlay("b", true);
      w.boss.loop("endgegnerw2", true);
    }
    if (t === 290) {
      w.boss.overlay("a", true);
      w.boss.overlay("b", true);
      w.sound("endgegnerw4");
      w.sound("endgegnerw4");
    }
    if (t > 150 && t < 240 && t % 10 === 0) {
      const k = 2 * t - 280;
      for (let a = 0; a < 360; a += 15) {
        const X = f32(((SIN_DEG[a] ?? 0) + 1) * (bw / 2 + k) + x - k);
        const Y = f32(((COS_DEG[a] ?? 0) + 1) * (bh / 2 + k) + y - k);
        fx.addExplosion(X, Y, f32(X + 32), f32(Y + 32));
      }
    }
    if (t === 340) {
      w.boss.overlay("a", false);
      w.boss.overlay("b", false);
    }
    if (t === 260) {
      w.boss.overlay("b", false);
      w.boss.loop("endgegnerw2", false);
    }
    const T = ++e.stateTimer;
    if (T === 1) {
      w.boss.loop("endgegnerw5", true);
      w.killEmitters(i);
      w.boss.start();
    }
    if (T === 2) {
      for (let n = 0; n < 3; n++) fx.addBig(x, y, 0, 0, 0.1, 0.2, 1, bh, 0, 450, 0, bw);
      e.actor.locals[0] = w.boss.background();
      w.boss.background(0);
    }
    if (T === 325 || T === 365 || T === 395 || T === 415 || T === 425 || T === 427 || T === 429) {
      fx.addBig(
        f32(x + idiv(bw, 2) - 1000),
        f32(y + idiv(bh, 2) - 1000),
        0,
        0,
        1,
        1,
        1,
        2000,
        15,
        5,
        2,
        -100,
      );
      w.sound("endgegnerw1");
      w.sound("endgegnerw1");
    }
    if (T === 430) {
      fx.addBig(
        f32(x + idiv(bw, 2) - 1),
        f32(y + idiv(bh, 2) - 1),
        0,
        0,
        1,
        0,
        0,
        2,
        50,
        15,
        1,
        15,
      );
      fx.shake += 70;
      w.sound("endgegnerw6");
      w.sound("endgegnerw6");
    }
    if (T > 480) {
      const a = f32(1 - Math.abs(500 - T) / 10);
      if (a > 0) out.quad("weiss", 0, 0, 800, 550, 1, 1, 1, a);
    }
    if (T === 500) {
      w.boss.loop("endgegnerw5", false);
      w.boss.overlay("b", false);
      w.boss.background(cint(e.actor.locals[0] ?? 0));
      for (const p of e.parts) {
        const s = this.surface(p);
        if (!p.visible || !s) continue;
        const bx = x + (p.actor ? p.actor.x : p.def.x);
        const by = y + (p.actor ? p.actor.y : p.def.y);
        fx.addSparks(
          1,
          150,
          cint(bx + s.left + 5),
          cint(by + s.topRow + 5),
          cint(bx + s.right - 5),
          cint(by + s.bottomRow - 5),
          false,
        );
        fx.addExplosion(
          f32(bx + s.left),
          f32(by + s.topRow),
          f32(bx + s.right),
          f32(by + s.bottomRow),
        );
        w.addKill();
        if (!w.beamPower(0) || this.playersMinus1 === 1) fx.shake += idiv(p.score, 500) + 1;
        w.sound(p.score > 1499 ? "explosion2" : "explosion1");
      }
    }
    if (T === 520) w.boss.jumpToLevelEnd();
    if (T === 570) {
      w.sound("endgegnerw7");
      for (let n = 0; n < 3; n++) fx.addBig(x, y, 0, 0, 0.1, 0.2, 1, bh, 0, 10, 0, bw);
      this.kill(i);
    }
  }

  /**
   * Zustand 1, Spaltung (`0x4B5E8F`, Abschuss in der Beam-Kraftphase): weißer
   * Ring, jedes Teil in zwei Hälften, die je Tick 1 px auseinandergehen, mit
   * additivem Leuchtspalt; bei t = 30 zerplatzen die Teile, ohne Wrack.
   */
  private stepSplit(i: number, e: Enemy, w: EnemyWorld): void {
    const out = w.fx.lists.enemies;
    if (e.stateTimer === 0) {
      w.killEmitters(i);
      let [x1, y1, x2, y2] = [10000, 10000, -10000, -10000];
      for (const p of e.parts) {
        const s = this.surface(p);
        if (!s) continue;
        const [px, py] = this.partPos(e, p);
        x1 = Math.min(x1, f32(px + s.minX));
        y1 = Math.min(y1, f32(py + s.topRow));
        x2 = Math.max(x2, f32(px + s.maxX));
        y2 = Math.max(y2, f32(py + s.bottomRow));
      }
      const bw = x2 - x1;
      const bh = y2 - y1;
      const r = w.rnd.next();
      const q = cint(bh + bw);
      w.fx.addBig(
        Math.trunc(cint(bw) / 2) + x1 - Math.trunc(q / 4),
        Math.trunc(cint(bh) / 2) + y1 - Math.trunc(q / 4),
        0,
        0,
        1,
        1,
        1,
        Math.trunc(q / 2),
        10,
        20,
        13,
        r * 359,
      );
      e.actor.vx = 0;
      e.actor.vy = 0;
    }
    const t = ++e.stateTimer;
    for (const p of e.parts) {
      const s = this.surface(p);
      if (!p.visible || !s) continue;
      const [px, py] = this.partPos(e, p);
      const R = s.rect;
      const half = Math.trunc(R.h / 2);
      const col = [p.red, p.green, p.blue, p.alpha] as const;
      const x = cint(px);
      // obere Hälfte t px nach oben, untere t px nach unten (+ absoluter Quell-y, wie im Original)
      out.quad("", x, cint(py - t), x + R.w, cint(py - t) + half, ...col, false, 0, s, [
        0,
        0,
        R.w,
        half,
      ]);
      const yb = cint(py + t + half + R.y);
      out.quad("", x, yb, x + R.w, yb + R.h - half, ...col, false, 0, s, [
        0,
        half,
        R.w,
        R.h - half,
      ]);
      out.quad(
        "a_kreis2",
        cint(px + s.minX),
        yb - 2 * t,
        cint(px + s.maxX),
        yb,
        1,
        1,
        1,
        0.9,
        true,
      );
    }
    if (t === 30) {
      for (const p of e.parts) if (p.visible) this.burstPart(e, p, w, 150, 30, true, true);
      this.kill(i);
    }
  }

  /** Zustand 6 (`0x4BDFEB`): 50 Ticks grüne Zielerfassung, dann zerplatzen. */
  private stepNormalKill(i: number, e: Enemy, w: EnemyWorld): void {
    const t = e.stateTimer;
    const out = w.fx.lists.enemies;
    if (t === 0) {
      w.killEmitters(i);
      let l0 = 10000;
      let l1 = 10000;
      let r = -10000;
      let b = -10000;
      for (const p of e.parts) {
        const s = this.surface(p);
        if (!p.visible || !s) continue;
        const [px, py] = this.partPos(e, p);
        l0 = Math.min(l0, px + s.minX);
        l1 = Math.min(l1, py + s.topRow);
        r = Math.max(r, px + s.maxX);
        b = Math.max(b, py + s.bottomRow);
      }
      e.bbox = [l0, l1, r - l0, b - l1];
    }
    const [l0, l1, bw, bh] = e.bbox;
    if (t < 50) {
      const q = bw / bh;
      const q2 = 1 / q;
      const st = 4 * t;
      const c1 = [0, 1, 0, 1] as const;
      const c2 = [0.3, 1, 0.3, 0] as const;
      out.line(l0, l1 + bh, l0 + q * st, l1 + bh - q2 * st, 5, c1, c2);
      out.line(l0 + bw, l1 + bh, l0 + bw - q * st, l1 + bh - q2 * st, 5, c1, c2);
      out.line(l0, l1, l0 + q * st, l1 + q2 * st, 5, c1, c2);
      out.line(l0 + bw, l1, l0 + bw - q * st, l1 + q2 * st, 5, c1, c2);
      if (t > 20) {
        const cx = idiv(bw, 2) + l0;
        const cy = idiv(bh, 2) + l1;
        const px = cint(cx);
        const py = cint(cy);
        w.fx.addSparks(1, 10, px, py, px, py, false);
        const rad = 20 * (50 - t);
        const at = (k: number) => degIndex(10 * (t + 9 * k));
        const c = [0.5, 1, 0.5, 1] as const;
        for (const [ka, kb] of [
          [0, 1],
          [1, 2],
          [2, -1],
          [-1, 0],
        ] as const) {
          const a = at(ka);
          const bIdx = at(kb);
          out.line(
            cx + (SIN_DEG[a] ?? 0) * rad,
            cy + (COS_DEG[a] ?? 0) * rad,
            cx + (SIN_DEG[bIdx] ?? 0) * rad,
            cy + (COS_DEG[bIdx] ?? 0) * rad,
            10,
            c,
            c,
          );
        }
      }
    }
    if (t === 50) {
      for (const p of e.parts) if (p.visible) this.burstPart(e, p, w, 150, 50, true, true);
      this.kill(i);
    }
    e.stateTimer++;
  }

  /** Zustand 3 (`0x4B8117`): sechs Trümmer fliegen im Bogen, rauchen und zerplatzen. */
  private stepWreck(i: number, e: Enemy, w: EnemyWorld): void {
    const g = e.def.wreckGroup - 1;
    const group = this.level.groups[g];
    const { w: bw, h: bh } = this.box(e.def);
    const cx = e.actor.x + idiv(bw, 2);
    const cy = e.actor.y + idiv(bh, 2);
    if (e.stateTimer === 0) {
      w.killEmitters(i);
      for (const p of e.parts) p.visible = false;
      e.pieces = [];
      for (let k = 0; k < 6; k++) {
        const angle = cint(w.rnd.next() * 358) + 1;
        const frame = vbInt(w.rnd.next() * (group?.frames.length ?? 1));
        const st = { frame, timer: 9999 };
        doAni(group, st);
        e.pieces.push({ angle, frame: st.frame, timer: 0 });
      }
    }
    const t = ++e.stateTimer;
    let any = false;
    for (const piece of e.pieces) {
      if (piece.angle <= 0) continue;
      const a = degIndex(cint(piece.angle));
      const py = cint(cy + (SIN_DEG[a] ?? 0) * 5 * t + 0.5 * w.gravity * t * t);
      if (py > 550) {
        piece.angle = 0;
        continue;
      }
      const px = cint(cx + (COS_DEG[a] ?? 0) * 5 * t);
      doAni(group, piece);
      any = true;
      const s = this.surfaces[g]?.[piece.frame];
      const rw = s?.rect.w ?? 0;
      const rh = s?.rect.h ?? 0;
      if (t % 2 === 0) {
        const sz = cint((rw + rh) / 2);
        const r1 = w.rnd.next();
        const r2 = w.rnd.next();
        w.fx.addBig(
          px + idiv(rw - sz, 2),
          py + idiv(rh - sz, 2),
          r1 - 0.5,
          r2 - 0.5,
          1,
          1,
          1,
          sz,
          0,
          12,
          10,
          0,
        );
      }
      if (s) w.fx.lists.enemies.quad("", px, py, px + rw, py + rh, 1, 1, 1, 1, false, 0, s);
      let hit = s
        ? w.terrain(px + s.left, py + s.rect.y, px + s.right, py + s.rect.y + s.rect.h, -1)
        : false;
      if (!hit && s) {
        for (const pl of w.players) {
          if (!pl.alive) continue;
          if (
            px + s.right > pl.x &&
            px + s.left < pl.x + 64 &&
            py + s.bottomRow > pl.y + 17 &&
            py + s.topRow < pl.y + 54
          ) {
            pl.energy = f32(pl.energy - 0.1);
            hit = true;
          }
        }
      }
      if (hit || t === 160) {
        const x2 = px + (s ? s.maxX - s.minX : 0);
        const y2 = py + (s ? s.bottomRow - s.topRow : 0);
        w.fx.addExplosion(px, py, x2, y2);
        w.fx.addSparks(1, 150, px, py, x2, y2, false);
        w.sound("explosion2");
        piece.angle = 0;
      }
    }
    if (t === 160 || !any) this.kill(i);
  }

  /** Zustand 5 (`0x4BCF9B`): Zündung mit blauem Blitz, nach 15 Ticks Flächenexplosion mit Kettenreaktion. */
  private stepExplosive(i: number, e: Enemy, w: EnemyWorld): void {
    const { w: bw, h: bh } = this.box(e.def);
    const x = e.actor.x;
    const y = e.actor.y;
    if (e.stateTimer === 0) {
      w.killEmitters(i);
      for (let k = 0; k < 3; k++) w.fx.addBig(x, y, 0, 0, 0.1, 0.2, 1, bh, 0, 10, 0, bw);
    }
    const t = ++e.stateTimer;
    if (t !== 15) return;
    const a11 = e.def.explosionSpec;
    const r = Math.trunc(a11 / 10) % 1000;
    const [x1, y1, x2, y2] = [x - r, y - r, x + bw + r, y + bh + r];
    w.fx.addExplosion(x1, y1, x2, y2);
    const dp = (a11 % 10) - 1;
    if (dp > 0) {
      for (const pl of w.players) {
        if (!pl.alive) continue;
        if (pl.x + 60 > x1 && pl.x + 5 < x2 && pl.y + 45 > y1 && pl.y + 20 < y2) {
          w.sound("hit");
          pl.energy = f32(pl.energy - dp * 10);
        }
      }
    }
    let dmg = Math.trunc(a11 / 10000);
    for (;;) {
      const rem = this.hit(cint(x1), cint(y1), cint(x2), cint(y2), dmg, -1, w, {
        exclude: i,
        pierce: true,
      });
      const prev = dmg;
      dmg = rem;
      if (rem === prev || rem <= 0) break;
    }
    for (const p of e.parts) if (p.visible) this.burstPart(e, p, w, 150, 0, true, true);
    this.kill(i);
  }

  /** Zustand 7 (`0x4BFF78`): alle 10 Ticks fliegt ein Teil ab, vom letzten zum ersten. */
  private stepChain(i: number, e: Enemy, w: EnemyWorld): void {
    if (e.stateTimer === 0) w.killEmitters(i);
    e.stateTimer--;
    let flag = 0;
    for (let j = e.parts.length - 1; j >= 0; j--) {
      const p = e.parts[j]!;
      if (!p.visible) continue;
      if (flag === 0) flag = 1;
      const s = this.surface(p);
      const [px, py] = this.partPos(e, p);
      const rw = s?.rect.w ?? 0;
      const rh = s?.rect.h ?? 0;
      if (flag === 2)
        for (let k = 0; k < 3; k++) w.fx.addBig(px, py, 0, 0, 0, 0, 1, rw, 0, 30, 0, rh);
      if (e.stateTimer <= 0) {
        flag = 2;
        p.visible = false;
        e.stateTimer = 10;
        if (s) {
          w.fx.addSparks(
            1,
            150,
            cint(px + s.minX + 5),
            cint(py + s.topRow + 5),
            cint(px + s.maxX - 5),
            cint(py + s.bottomRow - 5),
            false,
          );
        }
        const d = w.fx.addBig(px, py, 0.2, -0.1, 1, 1, 1, 0, 0, 100, 12, idiv(rw, 2) - 10);
        if (d) Object.assign(d, { group: p.def.group, frame: p.frame, timer: p.timer, rot: 0 });
        w.fx.shake += idiv(p.score, 500) + 1;
        w.sound(p.score > 1499 ? "explosion2" : "explosion1");
      }
    }
    if (flag === 0) this.kill(i);
  }

  /**
   * `CheckColisionWithEnemy` (`0x4C3E10`): der erste Gegner in Slotreihenfolge,
   * dessen sichtbares Teil (vom letzten zum ersten) der Kasten nach Kontur
   * trifft; je Aufruf höchstens ein Teil. Rückgabe ist der **Restschaden**:
   * `damage` ohne Treffer, 0 wenn der Treffer verbraucht wird, bei einem
   * Abschuss der Überschuss (der Schuss fliegt damit weiter). Gepanzerte Teile
   * nehmen keinen Schaden; nur ein durchschlagender Aufrufer gegen einen Typ
   * mit `armorPassThrough` behält dann den vollen Schaden. `sparks`: zehn
   * blauweiße Funken je Treffer auf ein ungepanzertes Teil (Spielerschüsse, Rammen).
   */
  hit(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    damage: number,
    player: number,
    w: EnemyWorld,
    opts: {
      exclude?: number;
      pierce?: boolean;
      sparks?: boolean;
      /** Ausgaben `TeilOut`/`PanzerOut`: getroffener Gegner, Teil gepanzert. */
      out?: { enemy: number; armored: boolean };
    } = {},
  ): number {
    const exclude = opts.exclude ?? -1;
    const out = opts.out;
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
        if (out) {
          out.enemy = i;
          out.armored = p.def.armored !== 0;
        }
        if (damage < 0) return 0;
        let ret = e.def.armorPassThrough <= 0 || !opts.pierce ? 0 : damage;
        if (p.def.armored !== 0) return ret;
        const hx = cint(x);
        const hy = cint(y);
        if (opts.sparks) {
          w.fx.addSparks(1, 10, hx + s.left, hy + s.topRow, hx + s.right, hy + s.bottomRow, true);
        }
        if (e.def.hitFlash === 1) p.flash = 2;
        else if (e.def.hitFlash >= 2) for (const q of e.parts) q.flash = 2;
        if (p.def.damagesBody !== 0) {
          e.actor.hp = f32(e.actor.hp - damage);
          if (e.actor.hp > 0) return 0;
          ret = cint(-e.actor.hp);
          this.killBy(i, e, hx, hy, player, exclude, opts.pierce === true, w);
          return ret;
        }
        p.hp = f32(p.hp - damage);
        if (p.hp > 0) return ret;
        ret = cint(-p.hp);
        p.visible = false;
        // Teil zerstört: Funken, Punkte am Teil, Ton
        w.fx.addSparks(1, 100, hx + s.minX, hy + s.topRow, hx + s.maxX, hy + s.bottomRow, false);
        w.addPoints(p.score, hx + idiv(s.rect.w, 2), hy + idiv(s.rect.h, 2), -1, player);
        w.sound("explosion");
        if (p.def.vital !== 0 || !e.parts.some((q) => q.visible)) {
          this.killBy(i, e, hx, hy, player, exclude, opts.pierce === true, w);
        }
        return ret;
      }
    }
    return damage;
  }

  /**
   * Abschuss (`CheckColisionWithEnemy` `0x4C4C8F`…`0x4C5A5F`): Todes-Spawn,
   * dann Zustandswahl; `(hx, hy)` ist das getroffene Teil. Ein gewöhnlicher
   * Treffer (kein Boss, keine Beam-Kraftphase, nicht durchschlagend, keine
   * Nova) oder einer durch einen anderen Gegner lässt den Gegner sofort
   * zerplatzen; sonst Zustand 6, 1 (Kraftphase), 2 (Nova) oder 4 (Boss).
   */
  private killBy(
    i: number,
    e: Enemy,
    hx: number,
    hy: number,
    player: number,
    exclude: number,
    pierce: boolean,
    w: EnemyWorld,
  ): void {
    this.deathSpawn(e, w);
    // `AddForce(1, 20, Spieler)` (`0x4C4A87`), sobald der Gegner stirbt
    w.vibrate?.(1, 20, player);
    const { w: bw, h: bh } = this.box(e.def);
    const cx = idiv(bw, 2) + hx;
    const cy = idiv(bh, 2) + hy;
    const d = e.def;
    if (d.explosionSpec > 0 || d.bigDeath > 0) {
      if (d.deathShockwave > 0) this.shockwave(e, w);
      w.addPoints(e.score, cx, cy, 0, player);
      this.enterState(e, d.explosionSpec > 0 ? DeathState.explosive : DeathState.chain);
      w.sound("spalt");
      return;
    }
    const beam = player >= 0 && w.beamPower(player);
    const plain = d.boss <= 0 && !beam && !pierce && !w.nova;
    if (exclude !== -1 || plain) {
      if (d.deathShockwave > 0) this.shockwave(e, w);
      w.sound(e.score > 1499 ? "explosion2" : "explosion1");
      if (exclude === -1) w.addPoints(e.score, cx, cy, -1, player);
      for (const p of e.parts) {
        const s = this.surface(p);
        if (!p.visible || !s) continue;
        const [x, y] = this.partPos(e, p);
        const px = cint(x);
        const py = cint(y);
        w.fx.addSparks(
          1,
          150,
          px + s.minX + 5,
          py + s.topRow + 5,
          px + s.maxX - 5,
          py + s.bottomRow - 5,
          false,
        );
        w.fx.addExplosion(px + s.minX, py + s.topRow, px + s.maxX, py + s.bottomRow);
      }
      if (d.wreckGroup > 0) this.enterState(e, DeathState.wreck);
      else this.destroy(i, w);
      return;
    }
    if (beam) w.comboUp(player);
    w.addPoints(e.score, cx, cy, 0, player);
    let state: number = beam ? DeathState.split : DeathState.normal;
    if (w.nova) state = DeathState.nova;
    if (d.boss > 0) {
      state = DeathState.boss;
      if (this.playersMinus1 === 1) w.addPoints(e.score, cx, cy, 0, 1 - player);
    }
    this.enterState(e, state);
    w.sound("spalt");
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
