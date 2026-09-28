import type { DovezLevel, DovezTimelineEntry } from "@clove/formats";
import { AnimPool, prepareAnim } from "./anims";
import { Effects, type EffectWorld } from "./effects";
import type { FrameState } from "./doAni";
import { doAni } from "./doAni";
import { EVENT_LAYER, LayerState, SCREEN_W, TERRAIN_LAYER, TILE_CAPACITY } from "./layers";
import { Enemies, type Enemy, type EnemyWorld } from "./enemies";
import { EnemyFire, type ShotWorld } from "./enemyFire";
import {
  DEATH_TICKS,
  NO_INPUT,
  Player,
  SHOT_HIT,
  SPAWN_INVULNERABLE,
  killPlayer,
  updatePlayer,
  type PlayerInput,
  type PlayerWorld,
} from "./player";
import { ShotLayer, firePrimary, moveShots, type ShotHost } from "./playerShots";
import { Op, type RouteEffect } from "./route";
import { collectShared, deepClone } from "./snapshot";
import { buildSurfaces, spanHit, type SpriteSource, type Surface } from "./surfaces";
import { COS_DEG, SIN_DEG, VbRnd, cint, degIndex, f32, idiv, vbInt } from "./vb";

/**
 * Weltzustand eines DoveZ-Levels und der Tick in der Reihenfolge von
 * `SpielLoop` (`0x53D170`, Befund `docs/measurements/dovez-runtime.md`).
 * Die Simulation zeichnet nie; der Renderer liest diesen Zustand.
 */

export const TICK_MS = 16;
export const PLAYFIELD_H = 550;
export const SPECIAL_CAPACITY = 16;
/** Vorlauf: Kacheln der letzten 900 px vor dem Start (`SpielPastTicks`, `0x50D230`). */
const PREROLL_PX = 900;

/** Hintergrund (`Me.7CC`): 1 Bild, sonst eine prozedurale Variante (2 All, 3, 5 Himmel, 6 Flucht). */
export type BackgroundMode = number;

export interface Special {
  active: boolean;
  /** 0 Waffe Schiff 1, 3 Extras, 4 Waffe Schiff 2 (2 unbenutzt). */
  subtype: number;
  item: number;
  x: number;
  y: number;
  vx: number;
  frame: number;
  timer: number;
}

/** Checkpoint-Tor (`Me.CD8…CFC`), ein einziges Objekt, nicht Teil des Schnappschusses. */
export interface Checkpoint {
  active: boolean;
  x: number;
  y: number;
  size: number;
  /** Drehphase 0…19 und Atemphase 0…179. */
  spin: number;
  pulse: number;
  /** 0 bis zum Durchflug, dann +10 je Tick; über 800 ist das Tor weg. */
  grow: number;
  triggered: boolean;
  /** Weißer Blitz über dem Spielfeld und seine Änderung je Tick. */
  flashAlpha: number;
  flashStep: number;
}

/** Stand beim letzten Checkpoint (`SaveCheckPointSub`). */
interface Saved {
  readonly tick: number;
  readonly enemies: Enemies;
  readonly anims: AnimPool["items"];
  /** Ebenen 1–6; Ebene 0 wird nie gesichert. */
  readonly layers: LayerState[];
  readonly backgroundX: number;
  readonly players: Player[];
  readonly playerShots: readonly ShotLayer[];
  readonly fire: EnemyFire;
  readonly sparks: Effects["sparks"];
  readonly big: Effects["big"];
  readonly bubbles: Effects["bubbles"];
  readonly popups: Effects["popups"];
  readonly specials: Special[];
  readonly globals: number[];
}

/** Ereignisse für Ton, Funk und Engine-Teile, die noch fehlen; die Engine leert sie je Frame. */
export type WorldEvent =
  /** Level-Ton `sounds[sound]`: `mode` 0 einmal, 1 Schleife (Zeitleiste ohne, Route mit Rücklauf). */
  | {
      readonly kind: "sound";
      readonly sound: number;
      readonly mode: number;
      readonly rewind: boolean;
    }
  | { readonly kind: "stopSound"; readonly sound: number }
  /** Effekt-Ton der Engine aus `Sound.d2p` (`sound/<name>`), SFX-Pegel. */
  | { readonly kind: "sfx"; readonly name: string }
  /** `SpielSoundOFF`: Schleifen und alle Level-Töne aus. */
  | { readonly kind: "soundOff" }
  | { readonly kind: "radio"; readonly radio: number }
  | { readonly kind: "effect"; readonly effect: RouteEffect }
  | {
      readonly kind: "pickup";
      readonly player: number;
      readonly subtype: number;
      readonly item: number;
    };

/** Glutfarbe eines Spielerschusses beim Einschlag (Typ-Index 0–3, `0x4DD0D0`). */
const SHOT_GLOW = [
  [0.6, 0.8, 1],
  [1, 0.3, 0.3],
  [0.4, 1, 0.4],
  [1, 1, 0],
] as const;

export class World {
  readonly surfaces: Surface[][];
  readonly layers: LayerState[];
  /** Globale Bildanimation je Gruppe (`group+0x10/+0x14`, `SpielObjektAnimationen`). */
  readonly groupFrames: FrameState[];
  readonly anims: AnimPool;
  readonly specials: Special[] = Array.from({ length: SPECIAL_CAPACITY }, () => ({
    active: false,
    subtype: 0,
    item: 0,
    x: 0,
    y: 0,
    vx: 0,
    frame: 0,
    timer: 0,
  }));
  readonly checkpoint: Checkpoint = {
    active: false,
    x: 0,
    y: 0,
    size: 0,
    spin: 0,
    pulse: 0,
    grow: 0,
    triggered: false,
    flashAlpha: 0,
    flashStep: 0,
  };
  readonly background: BackgroundMode;
  /** Scrollposition des Hintergrundbilds (`Me.7C8`), (−800, 0]. */
  backgroundX = 0;
  tick = 0;
  /** 0 läuft, 1 Spieler tot → Neustart am Checkpoint (`respawn`), 2 Level geschafft (`Me.580`). */
  state: 0 | 1 | 2 = 0;
  /** Musikpegel 0…100 (`Me.1C0`) und seine Änderung je Tick (`Me.1C4`). */
  musicVolume = 100;
  musicStep = 0;
  /** Nächstes Extraleben bei `extraLifeAt` · 100 000 Punkten (`Me.524`). */
  extraLifeAt = 2;
  /** Leuchten der Lebensziffer nach einem Extraleben, 50 → 1 (`Me.534`, für diesen Tick). */
  lifePulse = 0;
  /** Angezeigte, hochzählende Punkte (`Me.574`). */
  shownScore = [0, 0];
  /** `Me.50C`: in diesem Tick kein Blitz. */
  private noFlash = false;
  private saved: Saved | undefined;
  private shared: WeakSet<object> | undefined;
  /** Spieler − 1 (`0x5882A4`). */
  readonly playersMinus1: number;
  readonly rnd: VbRnd;
  events: WorldEvent[] = [];
  readonly enemies: Enemies;
  readonly fire: EnemyFire;
  readonly players: Player[];
  /** Spielerschüsse: Ebene 0 vor den Gegnern, Ebene 1 danach. */
  readonly playerShots = [new ShotLayer(), new ShotLayer()] as const;
  /** Gemeinsame Leben (`P[0].44`): 3 mit einem, 6 mit zwei Spielern. */
  lives: number;
  /** SetGlobal/GetGlobal der Routen (`Me.A64`). */
  readonly globals: number[] = [];
  score = [0, 0];
  /** Effekte (Partikel, Popups, Wackeln) und ihre Zeichenlisten. */
  readonly fx: Effects;
  /** Abschüsse (`P[0].+54`, immer Spieler 1). */
  kills = 0;

  constructor(
    readonly level: DovezLevel,
    sprites: SpriteSource,
    opts: { players?: 1 | 2; seed?: number; startTick?: number; ship?: 0 | 1 } = {},
  ) {
    this.surfaces = buildSurfaces(level, sprites);
    this.layers = level.layers.map((l, i) => new LayerState(l.scrollSpeed, TILE_CAPACITY[i] ?? 0));
    this.groupFrames = level.groups.map(() => ({ frame: 0, timer: 0 }));
    this.anims = new AnimPool(level.anims.map((a) => prepareAnim(a, this.surfaces)));
    const bg = level.background.trim();
    this.background = /^\d+$/.test(bg) ? Number(bg) : 1;
    this.playersMinus1 = (opts.players ?? 1) - 1;
    this.rnd = new VbRnd(opts.seed);
    this.enemies = new Enemies(level, this.surfaces, this.playersMinus1);
    this.fire = new EnemyFire(level, this.surfaces);
    this.fx = new Effects(this.rnd, level.waterHeight);
    this.fx.style = this.background === 3 ? 1 : level.weatherParticles >= 500 ? 3 : 0;
    const players = this.playersMinus1 + 1;
    const ship = opts.ship ?? 0;
    this.players = Array.from(
      { length: players },
      (_, i) => new Player(i, i === 0 ? ship : 1 - ship, players),
    );
    this.lives = players === 1 ? 3 : 6;
    this.tick = opts.startTick ?? 0;
    this.preroll();
    this.save(0);
  }

  /** `SpielPastTicks`: Kacheln, die zum Start schon auf dem Bildschirm wären. */
  private preroll(): void {
    this.layers.forEach((layer, l) => {
      layer.scrollPos = 0;
      if (layer.speed === 0) return;
      const entries = this.level.layers[l]!.entries;
      const start = this.tick;
      for (let t = start - vbInt(PREROLL_PX / layer.speed); t <= start - 1; t++) {
        const x = cint(SCREEN_W - vbInt((start - t) * layer.speed));
        while (layer.cursor < entries.length) {
          const e = entries[layer.cursor]!;
          if (e.tick < t) {
            layer.cursor++;
            continue;
          }
          if (e.tick > t) break;
          if (l !== EVENT_LAYER && e.kind === 0) layer.add(e.p1, e.p3, x, 0);
          layer.cursor++;
        }
      }
    });
  }

  /** Zeitleisten-Spieler (`0x50C9F0`), am Ende `tick += 1` und Levelende. */
  private timeline(): void {
    this.layers.forEach((layer, l) => {
      const entries = this.level.layers[l]!.entries;
      while (layer.cursor < entries.length) {
        const e = entries[layer.cursor]!;
        if (e.tick < this.tick) {
          layer.cursor++;
          continue;
        }
        if (e.tick > this.tick) break;
        this.dispatch(l, e);
        layer.cursor++;
      }
    });
    this.tick++;
    if (this.tick === this.level.levelLength - 150) for (const p of this.players) p.exitState = 1;
    if (this.tick === this.level.levelLength) this.state = 2;
  }

  private dispatch(l: number, e: DovezTimelineEntry): void {
    const layer = this.layers[l]!;
    if (l === EVENT_LAYER) {
      if (e.kind === 0) this.enemies.add(e.p1, e.p2, this.tick, e.p3, SCREEN_W, this.rnd);
      else if (e.kind === 1) {
        if (e.p2 === 2) this.events.push({ kind: "stopSound", sound: e.p1 });
        else this.events.push({ kind: "sound", sound: e.p1, mode: e.p2, rewind: false });
      } else if (e.kind === 2) this.events.push({ kind: "radio", radio: e.p1 });
      return;
    }
    switch (e.kind) {
      case 0:
        layer.add(e.p1, e.p3, SCREEN_W, e.p2);
        return;
      case 1:
        this.anims.add(l, e.p2, e.p3, undefined, this.layers);
        return;
      case 3:
      case 7:
        // Checkpoint nur mit einem (3) bzw. zwei Spielern (7)
        if ((e.kind === 3) === (this.playersMinus1 === 0)) {
          Object.assign(this.checkpoint, {
            active: true,
            x: cint(SCREEN_W + Math.trunc(e.p1 / 2) + layer.scrollPos),
            y: e.p3,
            size: e.p1,
            spin: 0,
            pulse: 0,
            grow: 0,
            triggered: false,
            flashAlpha: 0,
            flashStep: 0,
          });
        }
        return;
      case 2:
      case 4:
      case 5:
      case 6:
        this.addSpecial(e.kind - 2, e.p1, f32(e.p3), layer);
        return;
    }
  }

  private addSpecial(subtype: number, item: number, y: number, layer: LayerState): void {
    const s = this.specials.find((x) => !x.active);
    if (!s) return;
    Object.assign(s, {
      active: true,
      subtype,
      item,
      x: f32(layer.scrollPos + SCREEN_W),
      y,
      vx: f32(-layer.speed),
      frame: 0,
      timer: 0,
    });
  }

  /**
   * `CheckColisionWithLandschaft3` (`0x4C5EE0`): Kacheln der Ebene 3 und
   * sichtbare Teile fester Gegner (`solid`), außer `exclude`.
   */
  hitsTerrain(x1: number, y1: number, x2: number, y2: number, exclude = -1): boolean {
    const layer = this.layers[TERRAIN_LAYER]!;
    for (let i = 0; i <= layer.highWater; i++) {
      const t = layer.tiles[i]!;
      if (!t.active) continue;
      const s = this.surfaces[t.group]?.[this.groupFrames[t.group]?.frame ?? 0];
      if (s && spanHit(s, cint(t.x), cint(t.y), x1, y1, x2, y2)) return true;
    }
    const en = this.enemies;
    for (let i = 0; i <= en.high; i++) {
      const e = en.items[i];
      if (!e?.alive || e.inState || i === exclude || e.def.solid <= 0) continue;
      for (const p of e.parts) {
        if (!p.visible) continue;
        const s = en.surface(p);
        const [x, y] = en.partPos(e, p);
        if (s && spanHit(s, cint(x), cint(y), x1, y1, x2, y2)) return true;
      }
    }
    return false;
  }

  private makeEnemyWorld(): EnemyWorld {
    return {
      tick: this.tick,
      playersMinus1: this.playersMinus1,
      players: this.players,
      globals: this.globals,
      rnd: this.rnd,
      surfaces: this.surfaces,
      fx: this.fx,
      gravity: this.level.gravity,
      terrain: (x1, y1, x2, y2, exclude) => this.hitsTerrain(x1, y1, x2, y2, exclude),
      effect: (i, fx) => this.routeEffect(i, fx),
      partFires: (i, j) => this.partFires(i, j),
      addPoints: (points, x, y, vy, player) => this.addPoints(points, x, y, vy, player),
      killEmitters: (i) => this.fire.killEmittersOf(i),
      sound: (name) => this.sfx(name),
      // Spielwirkung der Druckwelle (Spieler wegschieben) ist noch nicht portiert
      shockwave: () => {},
    };
  }

  private effectWorld(): EffectWorld {
    return {
      tick: this.tick,
      gravity: this.level.gravity,
      groups: this.level.groups,
      surfaces: this.surfaces,
      terrain: (x1, y1, x2, y2) => this.hitsTerrain(x1, y1, x2, y2),
      sound: (name) => this.sfx(name),
    };
  }

  sfx(name: string): void {
    this.events.push({ kind: "sfx", name });
  }

  private shotWorld(): ShotWorld {
    return {
      tick: this.tick,
      playersMinus1: this.playersMinus1,
      players: this.players,
      playerA8: 0,
      globals: this.globals,
      rnd: this.rnd,
      hitsLandscape: (x1, y1, x2, y2) => this.hitsTerrain(x1, y1, x2, y2),
      partDestroyed: () => false,
      terrain: (x1, y1, x2, y2) => this.hitsTerrain(x1, y1, x2, y2),
      hitPlayers: (shot, piercing) => {
        const a = shot.actor;
        for (const p of this.players) {
          if (!p.alive) continue;
          const hit =
            a.x < p.x + SHOT_HIT.right &&
            a.x + a.width > p.x + SHOT_HIT.left &&
            a.y < p.y + SHOT_HIT.bottom &&
            a.y + a.height > p.y + SHOT_HIT.top;
          if (!hit) continue;
          this.sfx("hit");
          p.energy = f32(p.energy - shot.damage);
          // kleines Knistern (Blitz, 6 Bilder) bei kleinen Schüssen
          if (a.width < 20 && a.height < 20) {
            const type = this.level.shots[shot.shotType];
            const kind1 = type !== undefined && type.kind !== 0;
            this.fx.addBig(
              a.x - idiv(a.width, 2),
              a.y - idiv(a.height, 2),
              0,
              0,
              kind1 ? type.red : 1,
              kind1 ? type.green : 0.3,
              kind1 ? type.blue : 0.3,
              16,
              1,
              5,
              0,
              0,
            );
          }
          if (!piercing && p.energy >= 0) return true;
        }
        return false;
      },
    };
  }

  private shotHost(): ShotHost {
    const ew = this.makeEnemyWorld();
    const fx = this.fx;
    return {
      hitEnemies: (x1, y1, x2, y2, damage, owner) =>
        this.enemies.hit(x1, y1, x2, y2, damage, owner, ew, { sparks: true }),
      terrain: (x1, y1, x2, y2) => this.hitsTerrain(x1, y1, x2, y2),
      glow: (x, y, kind, terrain) => {
        if (terrain) fx.addSparks(1, 1, cint(x - 3), cint(y - 3), cint(x + 18), cint(y + 18), true);
        const [r, g, b] = SHOT_GLOW[kind] ?? SHOT_GLOW[0];
        fx.addBig(x, y, 0, 0, r, g, b, 16, 0, 9, 1, 0);
      },
      trail: (s) => {
        const r1 = this.rnd.next();
        const r2 = s.vy === 0 ? 0.5 : this.rnd.next();
        fx.addBig(s.x, s.y, 2 * r1 - 1, 2 * r2 - 1, 0.3 * s.param, 0.2, 1, 16, 0, 6, 1, 0);
      },
    };
  }

  private playerWorld(): PlayerWorld {
    return {
      terrainSpeed: this.layers[TERRAIN_LAYER]!.speed,
      underwater: (p) =>
        this.level.waterHeight === 550 || PLAYFIELD_H - this.level.waterHeight < p.y + 17,
      terrain: (x1, y1, x2, y2) => this.hitsTerrain(x1, y1, x2, y2),
      kill: (p) => this.killPlayer(p),
      exhaust: (p, dx) => this.exhaust(p, dx),
    };
  }

  /** Abgasflamme (`SpielKeysDove` `0x508AAD`): drei additive Glutflecken, länger beim Rückwärtsflug. */
  private exhaust(p: Player, dx: number): void {
    const [r, g, b] = p.shipType === 0 ? [0.3, 0.4, 1] : [1, 0.4, 0.3];
    for (let k = 0; k < 3; k++) {
      const q = 3 * this.rnd.next();
      const bb = 9 - q * q;
      const e = bb * 0.4 * (2 * this.rnd.next() - 1);
      this.fx.lists.exhaust.quad(
        "a_kreis2",
        p.x - 30 - 2 * dx + bb,
        p.y + 22 + e,
        p.x + 22 + bb,
        p.y + 42 + e,
        r,
        g,
        b,
        1,
        true,
      );
    }
  }

  /** `KillDove` (`0x50B0D0`): Funken und blaue Feuerbälle über der Hitbox, Explosionston. */
  killPlayer(p: Player): void {
    if (!killPlayer(p)) return;
    const [x1, y1, x2, y2] = [p.x, p.y + 17, p.x + 64, p.y + 54];
    this.fx.addSparks(1, 500, cint(x1), cint(y1), cint(x2), cint(y2), false);
    this.fx.addSparks(1, 100, cint(x1), cint(y1), cint(x2), cint(y2), true);
    this.fx.addFireballs(x1, y1, x2, y2, 0.2, 0.2, 1, 32, 10, 15);
    this.sfx("explosiondove");
  }

  /**
   * `SpielMoveDove` (`0x509110`), nur der Rauch unter halber Energie: je
   * niedriger die Energie, desto öfter vier Funken und ein weißes Wölkchen.
   */
  private moveDove(): void {
    for (const p of this.players) {
      if (!p.alive || p.exitState !== 0) continue;
      if (idiv(p.maxEnergy, 2) <= p.energy) continue;
      if (p.smoke > (10 * p.energy) / p.maxEnergy) {
        p.smoke = 0;
        const [x1, y1, x2, y2] = p.hitbox();
        this.fx.addSparks(1, 4, x1, y1, x2, y2, false);
        const r1 = this.rnd.next();
        const r2 = this.rnd.next();
        const r3 = this.rnd.next();
        const r4 = this.rnd.next();
        this.fx.addBig(
          p.x + 64 * r1 - 4,
          p.y + 17 + 37 * r2 - 4,
          r3 - 0.5,
          -2 - r4,
          1,
          1,
          1,
          8,
          0,
          6,
          10,
          0,
        );
      } else p.smoke++;
    }
  }

  /** `SpielFeindberührung`: Landschaft, Gegnerkontakt, Energie, Todessequenz. */
  private contact(): void {
    const ew = this.makeEnemyWorld();
    for (const p of this.players) {
      if (p.exitState !== 0) continue;
      if (!p.alive) {
        p.deathTimer++;
        this.dying(p);
        continue;
      }
      if (p.invulnerable > 0) {
        p.invulnerable--;
        p.energy = p.startEnergy;
        continue;
      }
      const [x1, y1, x2, y2] = p.hitbox();
      if (this.hitsTerrain(x1, y1, x2, y2)) {
        this.killPlayer(p);
        continue;
      }
      let rem: number;
      let touched = false;
      do {
        rem = this.enemies.hit(x1, y1, x2, y2, 15, p.index, ew);
        if (rem < 15) {
          p.energy = f32(p.energy - 2);
          touched = true;
        }
        if (p.energy < 0) {
          this.killPlayer(p);
          break;
        }
      } while (rem !== 15);
      if (touched) {
        this.fx.shake += 4;
        this.fx.addCircle(0, 6, 0, cint(p.x + idiv(64, 2)), cint(p.y + idiv(54 - 17, 2)), 100);
      }
      if (p.energy > p.maxEnergy) p.energy = p.maxEnergy;
    }
  }

  /**
   * Todessequenz (`SpielFeindberührung` `0x50BC4C`/`0x50C700`): 1P nach 99
   * Ticks Neustart am Checkpoint; 2P mit Leben und ohne Boss ersteht der
   * Spieler allein beim Partner wieder, sonst stirbt der Partner mit.
   */
  private dying(p: Player): void {
    const partner = this.players[1 - p.index];
    if (this.playersMinus1 === 1 && partner) {
      if (this.lives > 0 && !this.bossAlive) {
        if (p.deathTimer < DEATH_TICKS) return;
        this.events.push({ kind: "soundOff" });
        this.lives--;
        doveInit(p);
        let [x, y] = [partner.x, partner.y];
        while (this.hitsTerrain(cint(x), cint(y + 17), cint(x + 64), cint(y + 54))) {
          x = this.rnd.next() * 736;
          y = this.rnd.next() * 486;
        }
        p.x = f32(x);
        p.y = f32(y);
        this.rebirth(p);
        return;
      }
      if (partner.alive) {
        p.deathTimer = DEATH_TICKS;
        partner.invulnerable = 0;
        this.killPlayer(partner);
        return;
      }
      if (this.lives <= 0) this.musicStep = -1;
      if (p.deathTimer >= DEATH_TICKS && this.players.every((q) => q.deathTimer >= DEATH_TICKS)) {
        this.state = 1;
        this.noFlash = true;
      }
      return;
    }
    this.events.push({ kind: "soundOff" });
    if (this.lives <= 0) this.musicStep = -1;
    if (p.deathTimer >= DEATH_TICKS) {
      this.state = 1;
      this.noFlash = true;
    }
  }

  /** Boss lebt (`[0x5882A8]`): folgt mit den Bossen. */
  get bossAlive(): boolean {
    return false;
  }

  /** `SaveCheckpoint(p)` (`0x51EA00`): ein Schnappschuss, jeder neue ersetzt den alten. */
  private save(p: number): void {
    if (!this.players.some((q) => q.alive)) return;
    this.shared ??= collectShared([
      this.level,
      this.surfaces,
      this.anims.anims,
      this.rnd,
      this.fx.lists,
    ]);
    const memo = new Map<object, unknown>();
    const c = <T>(v: T): T => deepClone(v, this.shared!, memo);
    const players = c(this.players);
    const me = this.players[p];
    for (const q of players) {
      // Partner in der Landschaft: auf die Position des Auslösers
      if (q.index === p || !me) continue;
      if (this.hitsTerrain(...q.hitbox())) {
        q.x = me.x;
        q.y = me.y;
      }
    }
    this.saved = {
      tick: this.tick,
      enemies: c(this.enemies),
      anims: c(this.anims.items),
      layers: c(this.layers.slice(1)),
      backgroundX: this.backgroundX,
      players,
      playerShots: c(this.playerShots),
      fire: c(this.fire),
      sparks: c(this.fx.sparks),
      big: c(this.fx.big),
      bubbles: c(this.fx.bubbles),
      popups: c(this.fx.popups),
      specials: c(this.specials),
      globals: c(this.globals),
    };
  }

  /**
   * Nach dem Tod (`state === 1`, SpielLoop `0x53F97B`): ein Leben weniger,
   * Welt vom Checkpoint (`VariabelnLösch` + `LoadCheckpoint`), Schiffe voll
   * und 100 Ticks unverwundbar, Punkte bleiben. Ohne Leben: `false`
   * (Continue-Bildschirm bei der Engine).
   */
  respawn(): boolean {
    const s = this.saved;
    if (this.state !== 1 || !s) return false;
    if (this.lives <= 0) return false;
    this.state = 0;
    const lives = this.lives;
    const score = [...this.score];
    // VariabelnLösch: Ebene 0 leer, Tor weg, Wackeln aus
    const l0 = this.layers[0]!;
    for (const t of l0.tiles) t.active = false;
    Object.assign(l0, { highWater: -1, firstFree: 0, cursor: 0 });
    this.checkpoint.active = false;
    this.fx.shake = 0;
    // LoadCheckpoint (die Kopie wird verbraucht; gleich danach wird neu gesichert)
    this.tick = s.tick;
    Object.assign(this.enemies, s.enemies);
    this.anims.items.splice(0, this.anims.items.length, ...s.anims);
    s.layers.forEach((l, i) => Object.assign(this.layers[i + 1]!, l));
    this.backgroundX = s.backgroundX;
    s.players.forEach((q, i) => Object.assign(this.players[i]!, q));
    s.playerShots.forEach((l, i) => Object.assign(this.playerShots[i]!, l));
    Object.assign(this.fire, s.fire);
    this.fx.sparks.splice(0, 2, ...s.sparks);
    Object.assign(this.fx.big, s.big);
    Object.assign(this.fx.bubbles, s.bubbles);
    Object.assign(this.fx.popups, s.popups);
    this.specials.splice(0, this.specials.length, ...s.specials);
    this.globals.splice(0, this.globals.length, ...s.globals);
    Object.assign(this.checkpoint, { triggered: true, flashAlpha: 0.6, flashStep: -0.02 });
    for (const p of this.players) doveInit(p);
    this.lives = lives - 1;
    this.score = score;
    this.save(0);
    for (const p of this.players) this.rebirth(p);
    return true;
  }

  /** `SpielDoveWiedergeburt` (`0x50A620`): nur Effekt und Ton, das Schiff ist sofort steuerbar. */
  private rebirth(p: Player): void {
    const cx = p.x + 32;
    const cy = p.y + 32;
    const fx = this.fx;
    fx.addBig(cx - 32, cy - 32, 0, 0, 1, 0.5, 0.4, 64, 0, 50, 14, 16);
    fx.addBig(cx - 32, cy - 32, 0, 0, 0.9, 0.4, 0.3, 64, 0, 50, 14, 8);
    fx.addBig(cx - 32, cy - 32, 0, 0, 0.8, 0.4, 0.3, 64, 10, 40, 2, 6);
    const [r, g, b] = p.shipType === 0 ? [0.5, 0.7, 1] : [1, 0.7, 0.7];
    fx.addBig(p.x - 32, p.y - 32, 0, 0, r, g, b, 128, 0, 50, 16, 0);
    for (let a = 0; a <= 350; a += 10) {
      const sin = SIN_DEG[degIndex(a)] ?? 0;
      const cos = COS_DEG[degIndex(a)] ?? 0;
      fx.addBig(
        cx - 15 + sin * 600,
        cy - 15 + cos * 600,
        -sin * 20,
        -cos * 20,
        0.2,
        0.4,
        1,
        30,
        0,
        30,
        16,
        0,
      );
    }
    this.sfx("newborn1");
  }

  /**
   * `SpielCheckpoint(pass)` (`0x51FAA0`): ein atmender, drehender Ring aus
   * 18 Glutpunkten, Pass 0 hinter dem Schiff, Pass 1 davor. Pass 1 bewegt
   * das Tor mit der Landschaft und löst beim Durchflug aus: sichern, dann
   * +50 Energie, 1000 Punkte, Ton, weißer Blitz.
   */
  private checkpointPass(pass: 0 | 1): void {
    const c = this.checkpoint;
    if (!c.active) return;
    const out = this.fx.lists[pass === 0 ? "gate0" : "gate1"];
    const breath = SIN_DEG[c.pulse] ?? 0;
    for (let i = 9 * pass + 1; i <= 9 * pass + 9; i++) {
      const a = degIndex(cint(i * 20 + c.spin));
      const s = SIN_DEG[a] ?? 0;
      const h = 10 - s * 4;
      const x = c.x - (breath * 20 + idiv(c.size, 2) - 20 + c.grow) * s;
      const y = c.y + (breath * 40 + c.size - 40 + c.grow) * (COS_DEG[a] ?? 0);
      out.quad("a_kreis2", x, y, x + h, y + h, 1, 1, 1, 0.7, true);
    }
    if (pass === 0) return;
    c.spin++;
    c.pulse = (c.pulse + 1) % 180;
    if (c.spin === 20) c.spin = 0;
    c.x = cint(c.x - this.layers[TERRAIN_LAYER]!.speed);
    if (c.triggered) {
      c.grow += 10;
      if (c.grow > 800) {
        c.active = false;
        c.triggered = false;
      }
      return;
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const half = idiv(c.size, 2);
      if (p.x < c.x && c.x < p.x + 64 && p.y + 17 < c.y + half && c.y - half < p.y + 54) {
        this.save(p.index);
        this.sfx("checkpoint");
        this.sfx("checkpoint");
        c.triggered = true;
        this.noFlash = true;
        c.grow = 1;
        c.flashAlpha = 1;
        c.flashStep = -0.05;
        for (const q of this.players) q.energy = f32(q.energy + 50);
        this.addPoints(1000, c.x, c.y, -1, p.index);
      }
    }
  }

  /** Blitz nach Checkpoint oder Wiedergeburt (`OverlayEffekte` `0x5388A7`). */
  private flash(): void {
    const c = this.checkpoint;
    if (!c.triggered || c.flashStep === 0 || this.noFlash) return;
    c.flashAlpha = f32(c.flashAlpha + c.flashStep);
    if (c.flashAlpha <= 0) {
      c.flashStep = 0;
      c.flashAlpha = 0;
    }
    this.fx.lists.flash.quad("blur3", 0, 0, 800, 550, 1, 1, 1, c.flashAlpha);
  }

  /**
   * `AddPunkte` (`0x50F750`): `score = CLng(score + Multiplikator · Punkte /
   * (1 + 0,5 · zwei Spieler))`, ab 1500 Punkten Wackeln, ab 1000 ein Popup
   * (Kombo-Multiplikator folgt mit dem Beam).
   */
  addPoints(points: number, x: number, y: number, vy: number, player: number): void {
    if (player < 0) return;
    const mult = 1;
    this.score[player] = cint(
      (this.score[player] ?? 0) + (mult * points) / (1 + 0.5 * this.playersMinus1),
    );
    if (points >= 1500) this.fx.shake += idiv(points, 500);
    if (mult > 1 || points >= 1000) this.fx.addPopup(cint(points * mult), x, y, vy);
  }

  /** Teil feuert: Waffe anhängen oder Kind-Gegner (`spawnSpec`) ausspucken. */
  private partFires(i: number, j: number): void {
    const e = this.enemies.items[i]!;
    const p = e.parts[j]!;
    if (p.def.weapon !== -1) {
      this.fire.addEmitter(p.def.weapon, i, j, 0, 0, e.actor.player);
      return;
    }
    this.spawnChild(e, p, e.def.spawnSpec);
  }

  private spawnChild(e: Enemy, p: Enemy["parts"][number], spec: number): void {
    const type = spec % 1000;
    const child = this.level.enemies[type];
    if (!child) return;
    const { w, h } = this.enemies.box(child);
    const r = this.enemies.surface(p)?.rect ?? { w: 0, h: 0 };
    const [x, y] = this.enemies.partPos(e, p);
    // x mit der Bildhöhe, wie im Original (0x4C344C)
    this.enemies.add(
      type,
      Math.trunc(spec / 1000),
      this.tick,
      cint(y + vbInt(r.h / 2) - vbInt(h / 2)),
      cint(x + vbInt(r.h / 2) - vbInt(w / 2)),
      this.rnd,
    );
  }

  /** Route-Effekte (Opcodes mit Wirkung außerhalb der Bewegung). */
  private routeEffect(i: number, fx: RouteEffect): void {
    const e = this.enemies.items[i];
    const a = fx.args;
    const part = e?.parts[cint(a[0] ?? 0)];
    switch (fx.op) {
      case Op.SetPartFrame: {
        if (!part) return;
        const f = cint(a[1] ?? 0);
        if (f < 0) part.timer = 0;
        else {
          part.frame = f;
          part.timer = -1;
        }
        return;
      }
      case Op.Fire: {
        if (!e) return;
        const weapon = cint(a[1] ?? -1);
        const j = cint(a[0] ?? 0);
        if (weapon !== -1) this.fire.addEmitter(weapon, i, j, 0, 0, e.actor.player);
        else if (part) this.spawnChild(e, part, e.def.spawnSpec);
        return;
      }
      case Op.SpawnAnimL4:
        this.anims.add(4, cint(a[0] ?? 0), cint(a[2] ?? 0), a[1] ?? 0, this.layers);
        return;
      case Op.SpawnAnim:
        this.anims.add(cint(a[3] ?? 4), cint(a[0] ?? 0), cint(a[2] ?? 0), a[1] ?? 0, this.layers);
        return;
      case Op.SetLayerSpeed: {
        const l = this.layers[vbInt(a[0] ?? -1)];
        if (l) l.speed = f32(a[1] ?? 0);
        return;
      }
      case Op.SetLayerScroll:
        this.layers[vbInt(a[0] ?? -1)]?.setScroll(a[1] ?? 0);
        return;
      case Op.SetPartProp: {
        if (!part) return;
        const v = f32(a[2] ?? 0);
        const prop = cint(a[1] ?? -1);
        if (prop === 0) part.alpha = v;
        else if (prop === 1) part.red = v;
        else if (prop === 2) part.green = v;
        else if (prop === 3) part.blue = v;
        else if (prop === 4) part.rotation = cint(v % 360);
        return;
      }
      case Op.PlaySound:
        this.events.push({
          kind: "sound",
          sound: cint(a[0] ?? 0),
          mode: (a[1] ?? 0) >= 1 ? 1 : 0,
          rewind: true,
        });
        return;
      case Op.StopSound:
        this.events.push({ kind: "stopSound", sound: cint(a[0] ?? 0) });
        return;
      case Op.AddFunction:
        this.events.push({ kind: "radio", radio: cint(a[0] ?? 0) });
        return;
      default:
        this.events.push({ kind: "effect", effect: fx });
    }
  }

  /** Ein Tick; `inputs` je Spieler. */
  step(inputs: readonly PlayerInput[] = []): void {
    if (this.state !== 0) return;
    this.fx.beginTick();
    this.noFlash = false;
    for (const p of this.players) p.startEnergy = p.energy;
    this.level.groups.forEach((g, i) => doAni(g, this.groupFrames[i]!));
    this.musicVolume = Math.min(100, Math.max(0, this.musicVolume + this.musicStep));
    if (this.tick >= this.level.levelLength - 50) this.musicStep = -2;
    this.timeline();
    if (this.background === 1) {
      this.backgroundX = f32(this.backgroundX - this.layers[0]!.speed);
      if (this.backgroundX <= -SCREEN_W) this.backgroundX = f32(this.backgroundX + SCREEN_W);
    }
    for (const l of [0, 1, 2, 5]) {
      this.layers[l]!.move(this.surfaces, this.groupFrames);
      this.anims.move(l, this.level, this.layers);
    }
    this.checkpointPass(0);
    const pw = this.playerWorld();
    for (const p of this.players) updatePlayer(p, inputs[p.index] ?? NO_INPUT, pw);
    for (const p of this.players)
      firePrimary(p, inputs[p.index] ?? NO_INPUT, this.playerShots, false);
    const sh = this.shotHost();
    moveShots(this.playerShots[0], sh);
    this.fx.moveSparks(0, this.level.gravity);
    this.moveSpecials();
    this.moveDove();
    this.enemies.step(this.makeEnemyWorld());
    this.fx.moveBubbles(this.effectWorld(), this.background !== 0);
    this.anims.move(4, this.level, this.layers);
    this.layers[3]!.move(this.surfaces, this.groupFrames);
    moveShots(this.playerShots[1], sh);
    this.anims.move(3, this.level, this.layers);
    const sw = this.shotWorld();
    this.fire.stepEmitters(sw, {
      muzzle: (enemy, part) => {
        const e = this.enemies.items[enemy];
        const p = e?.parts[part];
        if (!e?.alive || !p?.visible) return undefined;
        const r = this.enemies.surface(p)?.rect ?? { w: 0, h: 0 };
        const [x, y] = this.enemies.partPos(e, p);
        return { cx: x + r.w / 2, cy: y + r.h / 2, w: r.w, h: r.h, rotation: p.rotation };
      },
    });
    this.fx.moveSparks(1, this.level.gravity);
    this.fx.moveBig(this.effectWorld());
    this.fire.stepShots(sw);
    this.fx.movePopups();
    this.checkpointPass(1);
    this.layers[6]!.move(this.surfaces, this.groupFrames);
    this.anims.move(6, this.level, this.layers);
    this.fx.stepShake();
    this.contact();
    this.flash();
    this.display();
  }

  /**
   * Logik von `SpielDisplay` (`0x510E10`), jeden Tick: Extraleben bei
   * 200 000, 400 000, 800 000 … Punkten, hochzählende Punkteanzeige.
   */
  private display(): void {
    if (this.lifePulse > 0) this.lifePulse--;
    let n = Math.trunc((this.score[0] ?? 0) / 100_000);
    if (this.playersMinus1 === 1) n += Math.trunc((this.score[1] ?? 0) / 100_000);
    if (n >= this.extraLifeAt && this.lifePulse === 0) {
      this.lives++;
      this.extraLifeAt *= 2;
      this.lifePulse = 50;
      this.sfx("liveup");
    }
    for (let p = 0; p <= this.playersMinus1; p++) {
      const d = (this.score[p] ?? 0) - (this.shownScore[p] ?? 0);
      const step =
        d > 10000
          ? 5111
          : d > 1000
            ? 511
            : d > 100
              ? 51
              : d > 11
                ? 11
                : d > 0
                  ? 1
                  : d < -10000
                    ? -9999
                    : d < -1000
                      ? -999
                      : d < -100
                        ? -99
                        : d < -11
                          ? -9
                          : d < 0
                            ? -1
                            : 0;
      this.shownScore[p] = (this.shownScore[p] ?? 0) + step;
    }
  }

  /** Wirkung eines Power-ups (Waffen-Slots und Satelliten folgen mit den Spielerwaffen). */
  private pickup(p: Player, s: Special): void {
    this.events.push({ kind: "pickup", player: p.index, subtype: s.subtype, item: s.item });
    if (s.subtype !== 3) return;
    switch (s.item) {
      case 2:
        p.speed = f32(p.speed + 1);
        return;
      case 3:
        p.speed = f32(p.speed - 1);
        return;
      case 4:
        for (const q of this.players) q.shotPower = Math.min(q.shotPower + 1, 3);
        return;
      case 5:
        p.energy = f32(p.energy + 50);
        return;
      case 6:
        p.invulnerable = 200;
        return;
      case 7:
      case 8:
      case 9:
        p.extraWeapon = s.item - 6;
        return;
    }
  }

  private moveSpecials(): void {
    for (const s of this.specials) {
      if (!s.active) continue;
      if (++s.timer > 2) {
        s.timer = 0;
        s.frame = (s.frame + 1) % 6;
      }
      s.x = f32(s.x + s.vx);
      if (s.x < -64) {
        s.active = false;
        continue;
      }
      for (const p of this.players) {
        const own = s.subtype === 0 ? p.shipType === 0 : s.subtype === 4 ? p.shipType === 1 : true;
        if (!own || !p.alive) continue;
        const [x1, y1, x2, y2] = p.hitbox();
        if (x1 < s.x + 48 && x2 > s.x + 16 && y1 < s.y + 48 && y2 > s.y + 16) {
          this.addPoints(1000, s.x + 32, s.y + 32, -1, p.index);
          this.sfx(s.subtype === 3 && (s.item === 2 || s.item === 3) ? "speed" : "extra");
          this.pickup(p, s);
          s.active = false;
          break;
        }
      }
    }
  }
}

/** `DoveInit(p)` (`0x4A6F10`): lebt, volle Energie, 100 Ticks unverwundbar; Position bleibt. */
function doveInit(p: Player): void {
  p.deathTimer = 0;
  p.energy = p.maxEnergy;
  p.invulnerable = SPAWN_INVULNERABLE;
}
