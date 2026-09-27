import type { DovezAnim, DovezAnimKey, DovezLevel } from "@clove/formats";
import { doAni } from "./doAni";
import type { LayerState } from "./layers";
import type { Surface } from "./surfaces";
import { f32, winkel } from "./vb";

/**
 * Effekt-Animationen (`AddAnima` `0x4A88E0`, `SpielMoveAnimation`
 * `0x4A8BB0`): mehrspurige Keyframe-Sprites. `LadeDaten` ergänzt Wächter-Keys
 * und rechnet je Segment Deltas pro Tick vor (s0x161…s0x195); die Instanzen
 * addieren sie jeden Tick auf. Rein optisch, keine Kollision.
 */

export const ANIM_CAPACITY = 301;

/** Laufzeit-Key: Datei-Key plus vorberechnete Deltas des Segments zum nächsten Key. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface RuntimeKey extends Mutable<DovezAnimKey> {
  velX: number;
  accelX: number;
  velY: number;
  accelY: number;
  dRed: number;
  dGreen: number;
  dBlue: number;
  dAlpha: number;
  dRotation: number;
  dScaleX: number;
  dScaleY: number;
}

export interface PreparedTrack {
  readonly group: number;
  /** n + 2 Keys: Wächter 0, die Datei-Keys 1…n, Wächter n + 1. */
  readonly keys: RuntimeKey[];
}

export interface PreparedAnim {
  readonly source: DovezAnim;
  readonly tracks: readonly PreparedTrack[];
  /** Rand fürs Entfernen links außerhalb (+0x1C). */
  readonly cullExtent: number;
}

function runtimeKey(k: DovezAnimKey): RuntimeKey {
  return {
    ...k,
    velX: 0,
    accelX: 0,
    velY: 0,
    accelY: 0,
    dRed: 0,
    dGreen: 0,
    dBlue: 0,
    dAlpha: 0,
    dRotation: 0,
    dScaleX: 0,
    dScaleY: 0,
  };
}

export function prepareAnim(a: DovezAnim, surfaces: readonly Surface[][]): PreparedAnim {
  let cull = 0;
  const tracks = a.tracks.map((t) => {
    const keys = t.keys.map(runtimeKey);
    const n = keys.length - 1;
    const last = keys[n]!;
    if (a.loop !== 0 && n >= 1) {
      keys[0] = { ...last, time: last.time - (a.duration + 1) };
      keys.push({ ...keys[1]!, time: keys[1]!.time + a.duration + 1 });
    } else {
      keys[0]!.visible = 0;
      if (n >= 1) keys[0]!.time = keys[1]!.time - 1;
      keys.push({ ...last, motion: 0, time: last.time + 1 });
    }
    if (keys[0]!.time >= 0) keys[0]!.time = -1;
    const end = keys[keys.length - 1]!;
    if (end.time <= a.duration) end.time = a.duration + 1;
    for (let k = 0; k < keys.length - 1; k++) {
      const p = keys[k]!;
      const q = keys[k + 1]!;
      const dt = q.time - p.time;
      if (dt === 0) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (q.motion === 1) {
        p.velX = f32(dx / dt);
        p.velY = f32(dy / dt);
      } else if (q.motion === 2 || q.motion === 3) {
        const ang = winkel(dx, dy);
        const v0 = q.speed;
        p.velX = f32(Math.cos(ang) * v0);
        p.velY = f32(Math.sin(ang) * v0);
        if (q.motion === 3) {
          const acc = (2 * (Math.sqrt(dx * dx + dy * dy) - v0 * dt)) / (dt * dt);
          p.accelX = f32(Math.cos(ang) * acc);
          p.accelY = f32(Math.sin(ang) * acc);
        }
      }
      p.dRed = f32((q.red - p.red) / dt);
      p.dGreen = f32((q.green - p.green) / dt);
      p.dBlue = f32((q.blue - p.blue) / dt);
      p.dAlpha = f32((q.alpha - p.alpha) / dt);
      p.dRotation = f32((q.rotation - p.rotation) / dt);
      p.dScaleX = f32((q.scaleX - p.scaleX) / dt);
      p.dScaleY = f32((q.scaleY - p.scaleY) / dt);
    }
    const w0 = surfaces[t.group]?.[0]?.rect.w ?? 0;
    for (const k of keys) cull = Math.max(cull, k.x + (w0 * (k.scaleX + 1)) / 2);
    return { group: t.group, keys };
  });
  return { source: a, tracks, cullExtent: Math.trunc(cull) + 20 };
}

/** Zustand einer Spur (0x34 Byte). */
export interface TrackState {
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  rotation: number;
  frame: number;
  timer: number;
  visible: boolean;
  scaleX: number;
  scaleY: number;
  key: number;
}

export interface AnimInstance {
  active: boolean;
  layer: number;
  anim: number;
  originX: number;
  originY: number;
  time: number;
  readonly states: TrackState[];
}

export class AnimPool {
  readonly items: AnimInstance[] = Array.from({ length: ANIM_CAPACITY }, () => ({
    active: false,
    layer: 0,
    anim: 0,
    originX: 0,
    originY: 0,
    time: 0,
    states: [],
  }));

  constructor(readonly anims: readonly PreparedAnim[]) {}

  /** `AddAnima(Ebene, Anim, y, [x])`. */
  add(
    layer: number,
    anim: number,
    y: number,
    x: number | undefined,
    layers: readonly LayerState[],
  ): void {
    const a = this.anims[anim];
    if (!a) return;
    const inst = this.items.find((i) => !i.active);
    if (!inst) return;
    inst.active = true;
    inst.layer = layer;
    inst.anim = anim;
    inst.time = 0;
    if (x !== undefined) {
      inst.originX = f32(x);
      inst.originY = f32(y);
    } else if (a.source.scrollWithLayer !== 0) {
      inst.originX = f32(800 + (layers[layer]?.scrollPos ?? 0));
      inst.originY = f32(y);
    } else {
      inst.originX = 0;
      inst.originY = 0;
    }
    inst.states.length = 0;
    for (const _ of a.tracks) {
      inst.states.push({
        x: 0,
        y: 0,
        red: 1,
        green: 1,
        blue: 1,
        alpha: 1,
        rotation: 0,
        frame: 0,
        timer: 0,
        visible: false,
        scaleX: 1,
        scaleY: 1,
        key: 0,
      });
    }
  }

  /** `SpielMoveAnimation(Ebene)` ohne Zeichnen. */
  move(layer: number, level: DovezLevel, layers: readonly LayerState[]): void {
    for (const inst of this.items) {
      if (!inst.active || inst.layer !== layer) continue;
      const a = this.anims[inst.anim]!;
      if (a.source.scrollWithLayer !== 0) {
        inst.originX = f32(inst.originX - (layers[layer]?.speed ?? 0));
      }
      a.tracks.forEach((track, i) => stepTrack(track, inst.states[i]!, inst.time, level));
      inst.time++;
      if (inst.time > a.source.duration) {
        if (a.source.loop !== 0) {
          inst.time = 0;
          for (const s of inst.states) s.key = 0;
        } else {
          inst.active = false;
          continue;
        }
      }
      if (a.source.scrollWithLayer !== 0 && inst.originX < -a.cullExtent) inst.active = false;
    }
  }
}

function stepTrack(t: PreparedTrack, s: TrackState, time: number, level: DovezLevel): void {
  const keys = t.keys;
  while (s.key < keys.length - 1 && time >= keys[s.key + 1]!.time) s.key++;
  const k = keys[s.key]!;
  const next = keys[s.key + 1];
  if (time === k.time) {
    s.x = k.x;
    s.y = k.y;
    s.red = k.red;
    s.green = k.green;
    s.blue = k.blue;
    s.alpha = k.alpha;
    s.rotation = k.rotation;
    s.scaleX = k.scaleX;
    s.scaleY = k.scaleY;
    if (k.frame >= 0) {
      s.frame = k.frame;
      s.timer = 0;
    }
  } else {
    s.red = f32(s.red + k.dRed);
    s.green = f32(s.green + k.dGreen);
    s.blue = f32(s.blue + k.dBlue);
    s.alpha = f32(s.alpha + k.dAlpha);
    s.rotation = f32(s.rotation + k.dRotation);
    s.scaleX = f32(s.scaleX + k.dScaleX);
    s.scaleY = f32(s.scaleY + k.dScaleY);
    const mode = next?.motion ?? 0;
    if (mode === 1) {
      s.x = f32(s.x + k.velX);
      s.y = f32(s.y + k.velY);
    } else if (mode === 2 && next) {
      s.x = clampTo(s.x, k.velX, next.x);
      s.y = clampTo(s.y, k.velY, next.y);
    } else if (mode === 3) {
      const age = time - k.time;
      s.x = f32(s.x + k.velX + age * k.accelX);
      s.y = f32(s.y + k.velY + age * k.accelY);
    }
  }
  if (k.frame === -1) doAni(level.groups[t.group], s);
  s.visible = k.visible !== 0;
}

/** Konstantes Tempo, am Ziel einrasten (Modus 2). */
function clampTo(v: number, d: number, target: number): number {
  const n = f32(v + d);
  if (d > 0 && n > target) return target;
  if (d < 0 && n < target) return target;
  return n;
}
