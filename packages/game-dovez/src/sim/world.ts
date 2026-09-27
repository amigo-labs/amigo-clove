import type { DovezLevel, DovezTimelineEntry } from "@clove/formats";
import { AnimPool, prepareAnim } from "./anims";
import type { FrameState } from "./doAni";
import { doAni } from "./doAni";
import { EVENT_LAYER, LayerState, SCREEN_W, TERRAIN_LAYER, TILE_CAPACITY } from "./layers";
import { Enemies, type Enemy, type EnemyWorld } from "./enemies";
import { EnemyFire, type ShotWorld } from "./enemyFire";
import { Op, type RouteEffect } from "./route";
import { buildSurfaces, spanHit, type SpriteSource, type Surface } from "./surfaces";
import { VbRnd, cint, f32, vbInt } from "./vb";

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

export interface Checkpoint {
  active: boolean;
  x: number;
  y: number;
  size: number;
}

/** Ereignisse für Ton, Funk und Engine-Teile, die noch fehlen; die Engine leert sie je Frame. */
export type WorldEvent =
  | { readonly kind: "sound"; readonly sound: number; readonly mode: number }
  | { readonly kind: "stopSound"; readonly sound: number }
  | { readonly kind: "radio"; readonly radio: number }
  | {
      readonly kind: "explosion";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      /** Großer Ton (Punkte > 1499). */
      readonly big: boolean;
    }
  | { readonly kind: "effect"; readonly effect: RouteEffect };

/** Spielerposition, wie Routen und Gegner sie sehen (links oben am Schiff). */
export interface PlayerPos {
  x: number;
  y: number;
}

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
  readonly checkpoint: Checkpoint = { active: false, x: 0, y: 0, size: 0 };
  readonly background: BackgroundMode;
  /** Scrollposition des Hintergrundbilds (`Me.7C8`), (−800, 0]. */
  backgroundX = 0;
  tick = 0;
  /** 0 läuft, 2 Level geschafft (`Me.580`). */
  state: 0 | 1 | 2 = 0;
  /** Spieler − 1 (`0x5882A4`). */
  readonly playersMinus1: number;
  readonly rnd: VbRnd;
  events: WorldEvent[] = [];
  readonly enemies: Enemies;
  readonly fire: EnemyFire;
  readonly players: PlayerPos[];
  /** SetGlobal/GetGlobal der Routen (`Me.A64`). */
  readonly globals: number[] = [];
  score = [0, 0];

  constructor(
    readonly level: DovezLevel,
    sprites: SpriteSource,
    opts: { players?: 1 | 2; seed?: number; startTick?: number } = {},
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
    this.players =
      this.playersMinus1 === 0
        ? [{ x: 100, y: 260 }]
        : [
            { x: 100, y: 228 },
            { x: 100, y: 292 },
          ];
    this.tick = opts.startTick ?? 0;
    this.preroll();
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
    if (this.tick === this.level.levelLength) this.state = 2;
  }

  private dispatch(l: number, e: DovezTimelineEntry): void {
    const layer = this.layers[l]!;
    if (l === EVENT_LAYER) {
      if (e.kind === 0) this.enemies.add(e.p1, e.p2, this.tick, e.p3, SCREEN_W, this.rnd);
      else if (e.kind === 1) this.events.push({ kind: "sound", sound: e.p1, mode: e.p2 });
      else if (e.kind === 2) this.events.push({ kind: "radio", radio: e.p1 });
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
      terrain: (x1, y1, x2, y2, exclude) => this.hitsTerrain(x1, y1, x2, y2, exclude),
      effect: (i, fx) => this.routeEffect(i, fx),
      partFires: (i, j) => this.partFires(i, j),
      addScore: (points, player) => this.addScore(points, player),
      killed: (e, how) => this.enemyKilled(e, how),
    };
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
    };
  }

  /** Punkte: `score += Multiplikator · Punkte / (1 + 0,5 · zwei Spieler)` (Kombo folgt). */
  addScore(points: number, player: number): void {
    if (player < 0) return;
    this.score[player] = (this.score[player] ?? 0) + points / (1 + 0.5 * this.playersMinus1);
  }

  private enemyKilled(e: Enemy, how: "explode" | "silent"): void {
    this.fire.killEmittersOf(this.enemies.items.indexOf(e));
    if (how === "silent") return;
    const { x, y } = e.actor;
    this.events.push({
      kind: "explosion",
      x,
      y,
      w: e.actor.width,
      h: e.actor.height,
      big: e.score > 1499,
    });
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
        this.events.push({ kind: "sound", sound: cint(a[0] ?? 0), mode: (a[1] ?? 0) >= 1 ? 1 : 0 });
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

  /** Ein Tick. */
  step(): void {
    if (this.state !== 0) return;
    this.level.groups.forEach((g, i) => doAni(g, this.groupFrames[i]!));
    this.timeline();
    if (this.background === 1) {
      this.backgroundX = f32(this.backgroundX - this.layers[0]!.speed);
      if (this.backgroundX <= -SCREEN_W) this.backgroundX = f32(this.backgroundX + SCREEN_W);
    }
    for (const l of [0, 1, 2, 5]) {
      this.layers[l]!.move(this.surfaces, this.groupFrames);
      this.anims.move(l, this.level, this.layers);
    }
    this.moveSpecials();
    this.enemies.step(this.makeEnemyWorld());
    this.anims.move(4, this.level, this.layers);
    this.layers[3]!.move(this.surfaces, this.groupFrames);
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
    this.fire.stepShots(sw);
    this.layers[6]!.move(this.surfaces, this.groupFrames);
    this.anims.move(6, this.level, this.layers);
  }

  private moveSpecials(): void {
    for (const s of this.specials) {
      if (!s.active) continue;
      if (++s.timer > 2) {
        s.timer = 0;
        s.frame = (s.frame + 1) % 6;
      }
      s.x = f32(s.x + s.vx);
      if (s.x < -64) s.active = false;
    }
  }
}
