import type { Texture } from "pixi.js";
import type { DrawList, Quad } from "../sim/effects";
import type { SpriteBatch } from "./SpriteBatch";

/** Farbverlauf einer Linie in so vielen Stücken. */
const GRADIENT_STEPS = 4;

/**
 * Zeichenliste der Effekte in eine `SpriteBatch`: gestreckte Rechtecke
 * (`quad`) und Balken-Linien (`Linie`, Textur `balken`, Breite 2·w, Farbe
 * von c1 nach c2 in Stücken). `texture` liefert die Textur eines Rechtecks.
 */
export function paintList(
  b: SpriteBatch,
  list: DrawList,
  texture: (q: Quad) => Texture | undefined,
  bar: Texture | undefined,
): void {
  for (const q of list.quads) {
    const tex = texture(q);
    if (!tex) continue;
    const fw = tex.frame.width;
    const fh = tex.frame.height;
    b.put(tex, (q.x1 + q.x2) / 2 - fw / 2, (q.y1 + q.y2) / 2 - fh / 2, {
      red: q.r,
      green: q.g,
      blue: q.b,
      alpha: q.a,
      scaleX: (q.x2 - q.x1) / fw,
      scaleY: (q.y2 - q.y1) / fh,
      rotation: q.rot,
      additive: q.additive,
    });
  }
  if (!bar) return;
  for (const l of list.segments) {
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const step = len / GRADIENT_STEPS;
    for (let k = 0; k < GRADIENT_STEPS; k++) {
      const f = (k + 0.5) / GRADIENT_STEPS;
      const mix = (i: 0 | 1 | 2 | 3) => l.c1[i] + (l.c2[i] - l.c1[i]) * f;
      const cx = l.x1 + dx * f;
      const cy = l.y1 + dy * f;
      b.put(bar, cx - bar.frame.width / 2, cy - bar.frame.height / 2, {
        red: mix(0),
        green: mix(1),
        blue: mix(2),
        alpha: mix(3),
        scaleX: step / bar.frame.width,
        scaleY: (2 * l.w) / bar.frame.height,
        rotation: angle,
        additive: l.additive,
      });
    }
  }
}
