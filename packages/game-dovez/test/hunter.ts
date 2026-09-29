/**
 * Jäger-Bot für Bosskämpfe: unverwundbar, Dauerfeuer, fliegt **in beiden Achsen** zu einer
 * Stelle, an der ein ungepanzertes Teil des Bosses als oberstes Teil getroffen wird.
 *
 * Der einfache Spielbot (fester x, nur y auf der Höhe des Gegners) trifft bei Bossen mit
 * gepanzerten Vorbauten nichts: ein Schuss trifft das oberste (höchster Teilindex) Teil an
 * seiner Stelle, und ein gepanzertes nimmt den Schuss ohne Schaden (`CheckColisionWithEnemy`
 * `0x4C3E10`, Rücksprung bei `[Teil+0x2E] ≠ 0`). Wer ein verdecktes Teil treffen will, muss
 * das Schiff dorthin bringen, wo der Schuss entsteht — so spielt es auch ein Mensch.
 */
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { spanHit } from "../src/sim/surfaces";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

/** Schusskasten der Hauptschüsse (16 × 16), Mündung bei (x + 45, y + 32) waagerecht, 11 px je Tick. */
const SHOT = 16;
const MUZZLE_X = 45;
const MUZZLE_Y = 32;
const SHOT_SPEED = 11;

export interface PartRef {
  readonly enemy: number;
  readonly part: number;
}

/** Das Teil, das ein Kasten (x, y, x + 16, y + 16) zuerst trifft — Reihenfolge wie `Enemies.hit`. */
export function topPartAt(w: World, x: number, y: number): PartRef | undefined {
  const en = w.enemies;
  for (let i = 0; i <= en.high; i++) {
    const e = en.items[i];
    if (!e?.alive || e.inState) continue;
    for (let j = e.parts.length - 1; j >= 0; j--) {
      const p = e.parts[j]!;
      if (!p.visible) continue;
      const s = en.surface(p);
      if (!s) continue;
      const [px, py] = en.partPos(e, p);
      if (spanHit(s, Math.trunc(px), Math.trunc(py), x, y, x + SHOT, y + SHOT)) {
        return { enemy: i, part: j };
      }
    }
  }
  return undefined;
}

/**
 * Ein Punkt (linke obere Ecke des Schusskastens), an dem Teil `part` von Gegner `enemy`
 * sicher das oberste Teil ist (auch 12 px links und rechts davon, die Teile bewegen sich).
 * Bevorzugt die Mitte des Teils. `undefined`, wenn nichts von ihm frei liegt.
 */
export function reachablePoint(
  w: World,
  enemy: number,
  part: number,
): [number, number] | undefined {
  const e = w.enemies.items[enemy];
  const p = e?.parts[part];
  if (!e || !p?.visible) return undefined;
  const s = w.enemies.surface(p);
  if (!s || s.topRow < 0) return undefined;
  const [qx, qy] = w.enemies.partPos(e, p);
  const cands: [number, number, number][] = [];
  for (let dy = 0; dy < s.rect.h - 8; dy += 8) {
    for (let dx = 0; dx < s.rect.w - 8; dx += 8) {
      const x = Math.trunc(qx) + dx;
      const y = Math.trunc(qy) + dy;
      if (x < 40 || x > 700 || y < 0 || y > 500) continue;
      cands.push([x, y, Math.hypot(dx + 8 - s.rect.w / 2, dy + 8 - s.rect.h / 2)]);
    }
  }
  cands.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of cands) {
    const ok = [-12, 0, 12].every((d) => {
      const t = topPartAt(w, x + d, y);
      return t?.enemy === enemy && t.part === part;
    });
    if (ok) return [x, y];
  }
  return undefined;
}

/** Das nächste Ziel: lebende Bosse zuerst, dann der Teilindex absteigend (oberste Teile zuerst). */
export function pickTarget(w: World): { ref: PartRef; at: [number, number] } | undefined {
  const en = w.enemies;
  const order: number[] = [];
  for (let i = 0; i <= en.high; i++) if (en.items[i]?.alive) order.push(i);
  order.sort((a, b) => (en.items[b]!.def.boss > 0 ? 1 : 0) - (en.items[a]!.def.boss > 0 ? 1 : 0));
  for (const i of order) {
    const e = en.items[i]!;
    if (e.inState || e.def.boss <= 0) continue;
    for (let j = e.parts.length - 1; j >= 0; j--) {
      const p = e.parts[j]!;
      if (!p.visible || p.def.armored !== 0) continue;
      const at = reachablePoint(w, i, j);
      if (at) return { ref: { enemy: i, part: j }, at };
    }
  }
  return undefined;
}

/** Eingabe für den nächsten Tick: Dauerfeuer, Schiff so, dass der erste Schusskasten auf dem Ziel liegt. */
export function hunterInput(w: World): PlayerInput {
  const p = w.players[0]!;
  const t = pickTarget(w);
  if (!t) return { ...NO_INPUT, fire: true };
  const [x, y] = t.at;
  const mx = p.x + MUZZLE_X + SHOT_SPEED;
  const my = p.y + MUZZLE_Y;
  return {
    ...NO_INPUT,
    fire: true,
    left: mx > x + 6,
    right: mx < x - 6,
    up: my > y + 6,
    down: my < y - 6,
  };
}

export interface HuntRun {
  readonly world: World;
  /** `World.state`: 0 läuft noch, 1 tot, 2 geschafft. */
  readonly state: number;
  readonly ticks: number;
  readonly bossSeen: boolean;
  readonly score: number;
  /** Höchste Zahl gleichzeitig lebender Gegner (Leck-Hinweis). */
  readonly peakEnemies: number;
}

/** Ein Level mit dem Jäger-Bot spielen, höchstens `maxTicks` Schleifendurchläufe. */
export async function runHunt(slug: string, maxTicks = 30000): Promise<HuntRun> {
  const { level, sprites } = await loadTestLevel(slug);
  const w = new World(level, sprites);
  let bossSeen = false;
  let peak = 0;
  let t = 0;
  for (; t < maxTicks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = 2;
    w.step([hunterInput(w), NO_INPUT]);
    w.events.length = 0;
    if (w.bossAlive) bossSeen = true;
    if (t % 50 === 0) peak = Math.max(peak, w.enemies.items.filter((e) => e?.alive).length);
  }
  return {
    world: w,
    state: w.state,
    ticks: t,
    bossSeen,
    score: w.score[0] ?? 0,
    peakEnemies: peak,
  };
}
