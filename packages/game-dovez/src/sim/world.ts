import type { DovezLevel, DovezTimelineEntry } from "@clove/formats";
import { AnimPool, prepareAnim } from "./anims";
import type { FrameState } from "./doAni";
import { doAni } from "./doAni";
import { EVENT_LAYER, LayerState, SCREEN_W, TERRAIN_LAYER, TILE_CAPACITY } from "./layers";
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
  | { readonly kind: "radio"; readonly radio: number }
  | { readonly kind: "enemy"; readonly type: number; readonly route: number; readonly y: number };

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
      if (e.kind === 0) this.events.push({ kind: "enemy", type: e.p1, route: e.p2, y: e.p3 });
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

  /** Terrain-Test `CheckColisionWithLandschaft3` (nur Ebene 3; feste Gegner folgen mit den Gegnern). */
  hitsTerrain(x1: number, y1: number, x2: number, y2: number): boolean {
    const layer = this.layers[TERRAIN_LAYER]!;
    for (let i = 0; i <= layer.highWater; i++) {
      const t = layer.tiles[i]!;
      if (!t.active) continue;
      const s = this.surfaces[t.group]?.[this.groupFrames[t.group]?.frame ?? 0];
      if (s && spanHit(s, cint(t.x), cint(t.y), x1, y1, x2, y2)) return true;
    }
    return false;
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
    this.anims.move(4, this.level, this.layers);
    this.layers[3]!.move(this.surfaces, this.groupFrames);
    this.anims.move(3, this.level, this.layers);
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
