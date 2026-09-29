/**
 * Zielwahl des Bots auf die Schwachstelle: Die Vorgabe (`botInput`) fliegt auf `y + 30` des
 * Gegners — bei Bossen mit Panzerteilen trifft das nur Panzer. Diese Variante zielt auf die Mitte
 * der Kontur eines sichtbaren, ungepanzerten Teils; Gegner ohne ein solches Teil (Stalagmiten,
 * Schutzschilde) sind kein Ziel. Über `runLevel(slug, maxTicks, botInputVulnerable)` zu nutzen.
 */
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import type { World } from "../src/sim/world";

export function botInputVulnerable(w: World): PlayerInput {
  const p = w.players[0]!;
  const py = p.y + 35;
  let ty = 275;
  let best = Infinity;
  for (const e of w.enemies.items) {
    if (!e?.alive || e.inState) continue;
    for (const part of e.parts) {
      const s = w.enemies.surface(part);
      if (!part.visible || part.def.armored !== 0 || !s) continue;
      const [x, y] = w.enemies.partPos(e, part);
      if (x + s.minX < p.x - 20 || x > 800) continue;
      const ey = y + (s.topRow + s.bottomRow) / 2;
      const d = Math.abs(ey - py) * 2 + (x - p.x) * 0.2 + (e.def.boss > 0 ? 300 : 0);
      if (d < best) {
        best = d;
        ty = ey;
      }
    }
  }
  return { ...NO_INPUT, fire: true, up: py > ty + 8, down: py < ty - 8 };
}
