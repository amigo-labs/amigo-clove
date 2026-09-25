import { fxFromInt } from "@clove/core";
import { Effect, Sound, addScore, effect, sound, spawnExplosion } from "../actions";
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
 * Gemeinsame Trefferprüfung `0x448A3E`: Kontur von Teil 0; Treffer wird
 * absorbiert (Ergebnis 0), auch während der Explosion.
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

/** Einmalig Punkte und `Me.264 = True`. */
export function finishBoss(w: World, points: number): void {
  if (w.bossScored) return;
  w.bossScored = 1;
  if (points > 0) addScore(w, points, true);
  w.levelDone = true;
  sound(w, Sound.Explosion);
}
