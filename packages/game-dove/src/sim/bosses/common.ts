import { fxFromInt } from "@clove/core";
import { Effect, addScore, effect, spawnExplosion } from "../actions";
import { contourHit } from "../collision";
import { FULL_BEAM_DAMAGE } from "../constants";
import type { World } from "../world";

/**
 * Gemeinsame Bausteine der Bossskripte (`docs/measurements/dove-bosses.md`).
 * Teil 0 ist der Hauptkörper (`Me.3A0` +0/+4), Teile 1 und 2 die Zusatzteile
 * (+8/+C, +10/+14).
 */

/** Gegnertyp (0-basiert) über den Namen im Level; wirft, wenn er fehlt. */
export function typeByName(w: World, name: string): number {
  const i = w.level.enemies.findIndex((e) => e.name === name);
  if (i < 0) throw new Error(`Boss: Gegnertyp '${name}' fehlt in Level ${w.level.number}`);
  return i;
}

/** Teil anlegen: Typ, Position, HP. */
export function setPart(
  w: World,
  part: number,
  type: number,
  x: number,
  y: number,
  hp: number,
): void {
  w.bossType[part] = type;
  w.bossX[part] = x;
  w.bossY[part] = y;
  w.bossHP[part] = hp;
  w.bossHPMax[part] = hp;
  w.bossFrame[part] = 0;
  w.bossVisible[part] = 1;
}

export function partWidth(w: World, part: number): number {
  return w.level.enemies[w.bossType[part] as number]!.w;
}

export function partHeight(w: World, part: number): number {
  return w.level.enemies[w.bossType[part] as number]!.h;
}

/** f0/f1 des aktuellen Frames eines Teils. */
export function partRows(w: World, part: number): readonly [number, number] {
  const def = w.level.enemies[w.bossType[part] as number]!;
  const f = w.bossFrame[part] as number;
  return [def.f0[f] as number, def.f1[f] as number];
}

/** Konturtest gegen ein Bossteil (Zeilenmaske des aktuellen Frames, wie bei Gegnern). */
export function partContourHit(
  w: World,
  part: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  const type = w.bossType[part] as number;
  if (type < 0) return false;
  const def = w.level.enemies[type]!;
  const frame = w.bossFrame[part] as number;
  const rows = def.h + 1;
  return contourHit(
    w.level.contours,
    def.contour + frame * rows * 2,
    rows,
    def.w,
    def.f0[frame] as number,
    def.f1[frame] as number,
    fxFromInt(w.bossX[part] as number),
    fxFromInt(w.bossY[part] as number),
    bx,
    by,
    bw,
    bh,
  );
}

/**
 * Trefferprüfung eines Bossteils wie im Original (`0x448A3E`, `0x449350`, `0x44B44F`) —
 * **nicht** die Gegnerschleife mit min/max über alle Zeilen, sondern genau eine Konturzeile:
 *
 * 1. vertikal: ey + f0 ≤ by + bh und ey + f1 ≥ by (sonst kein Treffer);
 * 2. liegt die Oberkante der Box im Sprite (by − ey ≥ f0), zählt die Zeile by − ey;
 * 3. sonst, liegt die Unterkante im Sprite (by + bh − ey ≤ f1), die Zeile by + bh − ey;
 * 4. sonst (die Box überspannt das ganze Sprite) die volle Breite 0 … r − l.
 *
 * Treffer bei ex + links ≤ bx + bw und ex + rechts ≥ bx (inklusiv). Frame und Typ kommen aus
 * `bossFrame`/`bossType` des Teils.
 */
export function bossRowHit(
  w: World,
  part: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  const type = w.bossType[part] as number;
  if (type < 0) return false;
  const def = w.level.enemies[type]!;
  const frame = w.bossFrame[part] as number;
  const ex = w.bossX[part] as number;
  const ey = w.bossY[part] as number;
  const f0 = def.f0[frame] ?? 0;
  const f1 = def.f1[frame] ?? 0;
  if (!(ey + f0 <= by + bh && ey + f1 >= by)) return false;
  let row = -1;
  if (by - ey >= f0) row = by - ey;
  else if (by + bh - ey <= f1) row = by + bh - ey;
  let l = 0;
  let r = def.w;
  if (row >= 0 && row <= def.h) {
    const base = def.contour + frame * (def.h + 1) * 2 + row * 2;
    l = w.level.contours[base] as number;
    r = w.level.contours[base + 1] as number;
  }
  return ex + l <= bx + bw && ex + r >= bx;
}

/**
 * Treffer am Boss: Funken, `HP −= Schaden`; Schaden 500 (voller Beam) zieht
 * stattdessen das Beam-Budget `Me.260` ab und leert es.
 */
export function damagePart(w: World, part: number, damage: number, bx: number, by: number): void {
  if (damage === FULL_BEAM_DAMAGE) {
    w.bossHP[part] = (w.bossHP[part] as number) - w.bossBudget;
    w.bossBudget = 0;
  } else {
    w.bossHP[part] = (w.bossHP[part] as number) - damage;
  }
  effect(w, Effect.ShotHit, bx, by, damage >= 3 ? 10 : 1, 1);
}

/**
 * Gemeinsame Trefferprüfung `0x448A3E`: Einzeilentest (`bossRowHit`) an Teil 0;
 * Treffer wird absorbiert (Ergebnis 0), auch während der Explosion.
 */
export function genericHit(
  w: World,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  damage: number,
): number {
  if (!partContourHit(w, 0, bx, by, bw, bh)) return -1;
  damagePart(w, 0, damage, bx, by);
  return 0;
}

/**
 * Ein Tick der Todessequenz: selten ein Kreis (Rnd < 0,1), eine Explosion an
 * (x + Int(Rnd·A), y + Int(Rnd·B)), Partikel im Rechteck bis (x+C, y+D).
 */
export function dyingTick(
  w: World,
  part: number,
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  const x = w.bossX[part] as number;
  const y = w.bossY[part] as number;
  if (w.rnd.less(0.1)) {
    // AddCircle(x + Rnd·w′, y + Rnd·h′, Int(Rnd·70) + 30) — nur Darstellung, die Rnd-Aufrufe zählen.
    const cx = x + w.rnd.below(a);
    const cy = y + w.rnd.below(b);
    const r = w.rnd.below(70) + 30;
    effect(w, Effect.Crash, cx - r, cy - r, 2 * r, 2 * r);
  }
  spawnExplosion(w, x + w.rnd.below(a), y + w.rnd.below(b));
  effect(w, Effect.ShotHit, x, y, c, d);
}

/**
 * Einmalig Punkte und `Me.264 = True`. Die Bosse addieren ihre Punkte direkt
 * (`VarAdd` auf `Me.104`) — ohne Punktefaktor; nur Level 10 multipliziert
 * (`withFactor`).
 */
export function finishBoss(w: World, points: number, withFactor = false): void {
  if (w.bossScored) return;
  w.bossScored = 1;
  if (points > 0) {
    if (withFactor) addScore(w, points, true);
    else w.score += points;
  }
  w.levelDone = true;
}
