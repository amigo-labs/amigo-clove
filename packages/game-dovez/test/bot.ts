/**
 * Spielbot für Kopflos-Läufe: unverwundbar, Dauerfeuer, fliegt auf Höhe des nächsten
 * treffbaren Gegners. Beweist, dass ein Level (und sein Boss) im Port zu Ende gespielt
 * werden kann — nicht, dass es dem Original gleicht.
 */
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

/** Eingabe für den nächsten Tick: Feuer, dazu hoch/runter auf die Höhe des besten Ziels. */
export function botInput(w: World): PlayerInput {
  const p = w.players[0]!;
  const py = p.y + 35;
  let ty = 275;
  let best = Infinity;
  for (const e of w.enemies.items) {
    if (!e?.alive) continue;
    const ex = e.actor.x;
    const ey = e.actor.y + 30;
    if (ex < p.x - 20 || ex > 800) continue;
    const d =
      (e.actor.hp > 0 && ex > 0 ? 0 : 5000) +
      Math.abs(ey - py) * 2 +
      (ex - p.x) * 0.2 +
      (e.def.boss > 0 ? 300 : 0);
    if (d < best) {
      best = d;
      ty = ey;
    }
  }
  // Tastenhinweis „Drücke: Super-Nova“ (Aktion 9, Level 7-4): nur die Nova besiegt den Boss;
  // die Taste wird abwechselnd gedrückt und losgelassen (Auslösung an der Flanke)
  const nova = w.env.hint?.action === 9 && w.tick % 2 === 0;
  return { ...NO_INPUT, fire: true, up: py > ty + 8, down: py < ty - 8, nova };
}

export interface LevelRun {
  readonly slug: string;
  /** `World.state`: 0 läuft noch, 1 tot, 2 geschafft. */
  readonly state: number;
  readonly ticks: number;
  readonly bossSeen: boolean;
  readonly score: number;
  /** Höchste Zahl gleichzeitig lebender Gegner (Leck-Hinweis). */
  readonly peakEnemies: number;
}

/**
 * Ein Level mit dem Bot spielen, höchstens `maxTicks` (Vorgabe: Levellänge + 3000, bei Bosslevels 60000).
 * `input` ersetzt die Zielwahl für Level, in denen die Vorgabe die Schwachstelle nicht trifft.
 */
export async function runLevel(
  slug: string,
  maxTicks?: number,
  input: (w: World) => PlayerInput = botInput,
): Promise<LevelRun> {
  const { level, sprites } = await loadTestLevel(slug);
  const w = new World(level, sprites);
  const max = maxTicks ?? Math.min(level.levelLength + 3000, 60000);
  let bossSeen = false;
  let peak = 0;
  let t = 0;
  for (; t < max && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = 2;
    w.step([input(w), NO_INPUT]);
    w.events.length = 0;
    if (w.bossAlive) bossSeen = true;
    if (t % 50 === 0) peak = Math.max(peak, w.enemies.items.filter((e) => e?.alive).length);
  }
  return { slug, state: w.state, ticks: t, bossSeen, score: w.score[0] ?? 0, peakEnemies: peak };
}
