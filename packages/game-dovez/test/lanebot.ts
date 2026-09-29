/**
 * Bahn-Pilot für Bosskämpfe mit gepanzerten Teilen (Level 3-3: Sägen und Schutzplatten).
 * Der einfache Bot in `bot.ts` zielt auf den nächsten lebenden Gegner und feuert aus
 * x = 100; gepanzerte Teile (`armored ≠ 0`) schlucken jeden Schuss, dort kommt nichts an.
 * Dieser Pilot sucht dagegen eine freie Bahn: Er fliegt bis kurz vor das vorderste
 * verwundbare Teil und stellt sich auf eine Höhe, auf der das erste Teil vor der
 * Mündung ungepanzert ist (Konturtest wie `CheckColisionWithEnemy`).
 * Unverwundbar, Dauerfeuer — wie der Bot ein Beweis der Spielbarkeit, kein Abbild des Originals.
 */
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { spanEdges } from "../src/sim/surfaces";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

/** Mündung eines waagerecht fliegenden Schiffs 0: Schuss-Oberkante `y + 32`, 14 Zeilen hoch. */
const BAND_TOP = 32;
const BAND_H = 14;
const MUZZLE_X = 45;
/** Abstand der Schiffsecke vor dem Ziel. */
const STANDOFF = 60;

/** Das Teil, das ein Schuss im Band [y0, y1) ab x0 zuerst träfe. */
export function firstAlong(
  w: World,
  x0: number,
  y0: number,
  y1: number,
): { armored: boolean; x: number; enemy: number } | undefined {
  let best: { armored: boolean; x: number; enemy: number } | undefined;
  for (const [i, e] of w.enemies.items.entries()) {
    if (!e?.alive || e.inState) continue;
    for (const p of e.parts) {
      if (!p.visible) continue;
      const s = w.enemies.surface(p);
      if (!s) continue;
      const [px, py] = w.enemies.partPos(e, p);
      const ed = spanEdges(s, Math.trunc(px), Math.trunc(py), x0, y0, 800, y1);
      if (!ed || ed[1] <= x0) continue;
      const x = Math.max(ed[0], x0);
      if (!best || x < best.x) best = { armored: p.def.armored !== 0, x, enemy: i };
    }
  }
  return best;
}

/** Eingabe für den nächsten Tick. */
export function laneInput(w: World): PlayerInput {
  const p = w.players[0]!;
  // x: kurz vor das vorderste verwundbare Teil
  let front = 700;
  for (const e of w.enemies.items) {
    if (!e?.alive || e.inState) continue;
    for (const q of e.parts) {
      const s = w.enemies.surface(q);
      if (!q.visible || q.def.armored !== 0 || !s) continue;
      const qx = w.enemies.partPos(e, q)[0] + s.left;
      if (qx > 0 && qx < front + STANDOFF) front = qx - STANDOFF;
    }
  }
  const wantX = Math.max(100, front);
  // y: nächste Höhe mit freier Bahn (erstes Teil ungepanzert)
  let lane = p.y;
  let best = Infinity;
  for (let y = 0; y <= 500; y += 4) {
    const h = firstAlong(w, wantX + MUZZLE_X, y + BAND_TOP, y + BAND_TOP + BAND_H);
    if (!h || h.armored) continue;
    const d = Math.abs(y - p.y);
    if (d < best) {
      best = d;
      lane = y;
    }
  }
  return {
    ...NO_INPUT,
    fire: true,
    up: p.y > lane + 3,
    down: p.y < lane - 3,
    left: p.x > wantX + 6,
    right: p.x < wantX - 6,
  };
}

export interface LaneRun {
  /** `World.state`: 0 läuft noch, 1 tot, 2 geschafft. */
  readonly state: number;
  readonly ticks: number;
  readonly world: World;
}

/** Ein Level mit dem Bahn-Pilot spielen (unverwundbar), höchstens `maxTicks`. */
export async function runLane(slug: string, maxTicks: number): Promise<LaneRun> {
  const { level, sprites } = await loadTestLevel(slug);
  const w = new World(level, sprites);
  let t = 0;
  for (; t < maxTicks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = 2;
    w.step([laneInput(w), NO_INPUT]);
    w.events.length = 0;
  }
  return { state: w.state, ticks: t, world: w };
}
