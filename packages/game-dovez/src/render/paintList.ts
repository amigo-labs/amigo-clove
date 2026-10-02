import type { Texture } from "pixi.js";
import type { DrawList, Quad } from "../sim/effects";
import { scratchOptions, type SpriteBatch } from "./SpriteBatch";

/** Farbverlauf einer Linie in so vielen Stücken. */
const GRADIENT_STEPS = 4;

const o = scratchOptions();

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
    o.red = q.r;
    o.green = q.g;
    o.blue = q.b;
    o.alpha = q.a;
    o.scaleX = (q.x2 - q.x1) / fw;
    o.scaleY = (q.y2 - q.y1) / fh;
    o.rotation = q.rot;
    o.additive = q.additive;
    b.put(tex, (q.x1 + q.x2) / 2 - fw / 2, (q.y1 + q.y2) / 2 - fh / 2, o);
  }
  if (!bar) return;
  for (const l of list.segments) {
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const step = len / GRADIENT_STEPS;
    const { c1, c2 } = l;
    for (let k = 0; k < GRADIENT_STEPS; k++) {
      const f = (k + 0.5) / GRADIENT_STEPS;
      const cx = l.x1 + dx * f;
      const cy = l.y1 + dy * f;
      o.red = c1[0] + (c2[0] - c1[0]) * f;
      o.green = c1[1] + (c2[1] - c1[1]) * f;
      o.blue = c1[2] + (c2[2] - c1[2]) * f;
      o.alpha = c1[3] + (c2[3] - c1[3]) * f;
      o.scaleX = step / bar.frame.width;
      o.scaleY = (2 * l.w) / bar.frame.height;
      o.rotation = angle;
      o.additive = l.additive;
      b.put(bar, cx - bar.frame.width / 2, cy - bar.frame.height / 2, o);
    }
  }
}
