import { idiv, roundHalfEven } from "./math";
import { METEOR_HP, METEOR_SIZE, SHAKE_POINTS, SHAKE_TICKS } from "./constants";
import type { HitHandlers } from "./collision";
import type { World } from "./world";

/** Effekte für den Renderer (Partikel); nicht Teil des Zustands. */
export const Effect = { EnemyKill: 1, ShotHit: 2, PlayerDeath: 3, Crash: 4 } as const;

/**
 * Soundindizes des Originals (Ladeliste `0x4335D2`) → Asset-ID.
 * Die Simulation meldet nur Index und Parameter; abgespielt wird außerhalb.
 */
export const Sound = {
  Normal: 0,
  Explosion: 1,
  Antrieb: 2,
  Jingle: 3,
  Beam1: 4,
  Beam2: 5,
  Charge: 6,
  Yesjo: 7,
  Fertig: 8,
  End1: 9,
  End2: 10,
  GetReady: 11,
  IceExplosion: 12,
  Blue: 13,
  Red: 14,
  Green: 15,
  End3: 16,
  Yesjo2: 17,
  Fertig2: 18,
} as const;

export const SOUND_FILES: readonly string[] = [
  "normal",
  "explosion",
  "antrieb",
  "jingle",
  "beam1",
  "beam2",
  "charge",
  "yesjo",
  "fertig",
  "end1",
  "end2",
  "getready",
  "iceexplosion",
  "blue",
  "red",
  "green",
  "end3",
  "yesjo2",
  "fertig2",
];

/**
 * Meldet einen Sound. `param` je nach Sound: Panorama (Explosion, Antrieb, Beam),
 * Lautstärke 0–100 (grün) oder Frequenz in Hz (Laden) — siehe `DoveAudio`.
 */
export function sound(w: World, id: number, param = 0): void {
  w.sounds.push(id, param);
}

export function effect(w: World, kind: number, x: number, y: number, bw: number, bh: number): void {
  w.effects.push(kind, x, y, bw, bh);
}

export function spawnExplosion(w: World, x: number, y: number): void {
  const i = w.explosions.alloc();
  if (i < 0) return;
  w.expX[i] = x;
  w.expY[i] = y;
  w.expFrame[i] = 1;
}

/** `score = Int(score + points · Faktor)` — nicht im Bosskampf, wenn `always` fehlt. */
export function addScore(w: World, points: number, always = false): void {
  if (w.bossMode && !always) return;
  w.score = Math.floor(w.score + (points * w.options.scoreFactor) / 100);
}

export const handlers: HitHandlers = {
  killEnemy(w, i) {
    const def = w.level.enemies[w.enType[i] as number]!;
    const x = roundHalfEven(w.enX[i] as number);
    const y = roundHalfEven(w.enY[i] as number);
    const points = w.enPoints[i] as number;
    addScore(w, points);
    if (points >= SHAKE_POINTS) w.shake = Math.max(w.shake, SHAKE_TICKS);
    effect(w, Effect.EnemyKill, x, y, def.w, def.h);
    spawnExplosion(w, x + idiv(def.w, 2) - 25, y + idiv(def.h, 2) - 25);
    spawnExplosion(w, x + w.rnd.below(def.w) - 25, y + w.rnd.below(def.h) - 25);
    sound(w, Sound.Explosion, w.rnd.below(101) - 50);
    w.enemies.free(i);
  },
  killMeteor(w, i) {
    const x = w.metX[i] as number;
    const y = w.metY[i] as number;
    addScore(w, METEOR_HP);
    effect(w, Effect.EnemyKill, x, y, METEOR_SIZE, METEOR_SIZE);
    spawnExplosion(w, x + METEOR_SIZE / 2 - 25, y + METEOR_SIZE / 2 - 25);
    spawnExplosion(w, x + w.rnd.below(METEOR_SIZE) - 25, y + w.rnd.below(METEOR_SIZE) - 25);
    sound(w, Sound.Explosion, w.rnd.below(101) - 50);
    w.meteors.free(i);
  },
};

/**
 * Gegner zerschellt an einer Wand: Explosionen, keine Punkte. Faller spielen
 * `IceExplosion` (`0x47BCB6`), alle anderen `Explosion` ohne Panorama.
 */
export function crashEnemy(w: World, i: number, snd: number = Sound.Explosion): void {
  const def = w.level.enemies[w.enType[i] as number]!;
  const x = roundHalfEven(w.enX[i] as number);
  const y = roundHalfEven(w.enY[i] as number);
  effect(w, Effect.Crash, x, y, def.w, def.h);
  for (let k = 0; k < 3; k++) {
    spawnExplosion(w, x + w.rnd.below(def.w) - 25, y + w.rnd.below(def.h) - 25);
  }
  sound(w, snd);
  w.enemies.free(i);
}

export function killPlayer(w: World): void {
  if (w.options.invincible) return;
  w.dead = 1;
  w.deathCounter = 0;
  effect(w, Effect.PlayerDeath, w.px, w.py, 40, 22);
  // Zwei gleichzeitige Explosionen, Panorama roh 1 und 99 (`0x4729B3`).
  sound(w, Sound.Explosion, 1);
  sound(w, Sound.Explosion, 99);
}
