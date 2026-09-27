import type { FrameState } from "./doAni";
import type { Surface } from "./surfaces";
import { f32 } from "./vb";

/**
 * Die sieben Zeitleisten-Ebenen mit ihren Kachel-Pools (Landschaft und
 * Hintergrundobjekte). Befund: `docs/measurements/dovez-runtime.md` („Ebenen“).
 * Ebene 3 ist die Landschaft (Kollision), Ebene 4 hat keine Kacheln.
 */

/** Pool-Größen je Ebene (`VariabelnInit`, `0x4A610F`). */
export const TILE_CAPACITY = [11, 51, 21, 101, 0, 21, 16] as const;
export const LAYER_COUNT = 7;
export const TERRAIN_LAYER = 3;
export const EVENT_LAYER = 4;
/** Zeichenreihenfolge der Ebenen (Spieler und Gegner liegen zwischen 5 und 4). */
export const LAYER_DRAW_ORDER = [0, 1, 2, 5, 4, 3, 6] as const;
export const SCREEN_W = 800;

export interface Tile {
  x: number;
  y: number;
  group: number;
  vx: number;
  vy: number;
  active: boolean;
}

export class LayerState {
  /** px/Tick; Routen ändern ihn (op 24/25). */
  speed: number;
  /** Nächster Zeitleisten-Eintrag. */
  cursor = 0;
  /** Nachkommarest des Scrollens, (−1, 1); neue Objekte starten bei 800 + scrollPos. */
  scrollPos = 0;
  readonly tiles: Tile[];
  highWater = -1;
  firstFree = 0;

  constructor(speed: number, capacity: number) {
    this.speed = f32(speed);
    this.tiles = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      group: 0,
      vx: 0,
      vy: 0,
      active: false,
    }));
  }

  /** `AddLandschaft` (`0x4EA200`): `slot` 0 erster freier, n > 0 ab highWater + n. */
  add(group: number, y: number, x: number, slot: number): void {
    const start = slot === 0 ? this.firstFree : this.highWater + slot;
    for (let i = Math.max(0, start); i < this.tiles.length; i++) {
      const t = this.tiles[i]!;
      if (t.active) continue;
      t.x = f32(this.scrollPos + x);
      t.y = f32(y);
      t.group = group;
      t.vx = f32(-this.speed);
      t.vy = 0;
      t.active = true;
      if (i > this.highWater) this.highWater = i;
      if (slot === 0) this.firstFree = i + 1;
      return;
    }
  }

  /** `KillLandschaft` (`0x4E9E90`). */
  kill(i: number): void {
    if (this.firstFree > i) this.firstFree = i;
    this.tiles[i]!.active = false;
    if (i === this.highWater) {
      let h = i - 1;
      while (h >= 0 && !this.tiles[h]!.active) h--;
      this.highWater = h;
    }
  }

  /** `SpielMoveLandschaft` ohne Zeichnen (`0x4E9F70`). */
  move(surfaces: readonly Surface[][], groupFrames: readonly FrameState[]): void {
    const v = f32(this.scrollPos - this.speed);
    this.scrollPos = f32(v - Math.trunc(v));
    for (let i = 0; i <= this.highWater; i++) {
      const t = this.tiles[i]!;
      if (!t.active) continue;
      t.x = f32(t.x + t.vx);
      t.y = f32(t.y + t.vy);
      const w = surfaces[t.group]?.[groupFrames[t.group]?.frame ?? 0]?.rect.w ?? 0;
      if (w + t.x < 0) this.kill(i);
    }
  }

  /** Route op 25: auch vorhandene Kacheln fahren mit der neuen Geschwindigkeit. */
  setScroll(speed: number): void {
    for (let i = 0; i <= this.highWater; i++) this.tiles[i]!.vx = f32(-speed);
    this.speed = f32(speed);
  }
}
