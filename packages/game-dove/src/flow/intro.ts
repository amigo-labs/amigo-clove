/**
 * Keyframe-Auswertung des Story-Intros (`PlayIntro` `0x4916D0`, `data/intro`).
 * Rein und deterministisch — der Bildschirm zeichnet nur, was hier herauskommt.
 */
import type { IntroKey, IntroObject } from "@clove/formats";

export interface IntroSpriteState {
  readonly x: number;
  readonly y: number;
  /** Prozent; 100 = 1:1 (BltFast), sonst gestreckt (Blt). */
  readonly scale: number;
  /** Animationsframe; Frames liegen im Blatt untereinander. */
  readonly frame: number;
}

/**
 * Zustand eines Objekts im lokalen Szenen-Tick `t`: maßgeblich ist der letzte
 * Keyframe mit `key.t ≤ t`. Unsichtbar vor dem ersten Keyframe und bei
 * `visible = false`. Mit `lerp = −1` laufen x, y und Skala linear zum nächsten
 * Keyframe. Animation: `frame0 + ⌊(t − key.t) / ticksPerFrame⌋ mod (frames + 1)`.
 */
export function introSpriteAt(obj: IntroObject, t: number): IntroSpriteState | undefined {
  const keys = obj.keys;
  let k = -1;
  for (let i = 0; i < keys.length; i++) if (keys[i]!.t <= t) k = i;
  if (k < 0) return undefined;
  const key = keys[k]!;
  if (!key.visible) return undefined;
  const next: IntroKey | undefined = keys[k + 1];
  let { x, y, scale } = key;
  if (key.lerp === -1 && next && next.t > key.t) {
    const f = (t - key.t) / (next.t - key.t);
    x = vbRound(key.x + (next.x - key.x) * f);
    y = vbRound(key.y + (next.y - key.y) * f);
    scale = vbRound(key.scale + (next.scale - key.scale) * f);
  }
  const period = Math.max(1, key.ticksPerFrame);
  const frame = key.frame0 + (Math.floor((t - key.t) / period) % (Math.max(0, key.frames) + 1));
  return { x, y, scale, frame };
}

/** VB `CInt`: halbe Werte zur geraden Zahl (Banker's Rounding). */
export function vbRound(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
