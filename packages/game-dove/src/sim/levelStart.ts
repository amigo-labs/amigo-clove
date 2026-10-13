import { fxFromInt } from "@clove/core";
import {
  BG_SPEED_DEFAULT,
  CHECKPOINT_PREROLL,
  FIELD_H,
  INVULN_START,
  LIVES_START,
  SCREEN_W,
  SHIP_SPEED_DEFAULT,
  SHIP_SPEED_MIN,
  SHIP_START_X,
  SHIP_START_Y,
  STAR_COUNT,
} from "./constants";
import type { LevelData } from "./level";
import { idiv } from "./math";
import { spawnObject, spawnTile } from "./spawn";
import { loseEquipment, resetWeaponsOnRestart } from "./weapons";
import { World } from "./world";

function initStars(w: World): void {
  for (let i = 0; i < STAR_COUNT; i++) {
    w.starX[i] = fxFromInt(w.rnd.below(SCREEN_W));
    w.starY[i] = w.rnd.below(FIELD_H);
  }
}

/** Levelstart bzw. Neustart am Checkpoint (`F4 = Me.530`, Vorlauf der Landschaft). */
export function restartAtCheckpoint(w: World): void {
  for (const pool of [
    w.tiles,
    w.objects,
    w.extras,
    w.enemies,
    w.meteors,
    w.shots,
    w.eshots,
    w.explosions,
  ]) {
    pool.clear();
  }
  w.tick = w.checkpoint;
  w.bossMode = false;
  w.levelDone = false;
  w.autopilot = 0;
  w.exit = 0;
  w.boss = undefined;
  w.bossState = 0;
  w.bossScored = 0;
  w.bossType.fill(-1);
  w.bossVisible.fill(0);
  w.bossC.fill(0);
  w.bossBeamW.fill(0);
  w.scriptC.fill(0);
  w.scriptText = 0;
  w.deco.clear();
  w.bands.clear();
  w.winds.clear();
  w.bgSpeed = BG_SPEED_DEFAULT;
  w.bgOffset = 0;
  w.shake = 0;
  w.px = SHIP_START_X;
  w.py = SHIP_START_Y;
  w.prevX = w.px;
  w.prevY = w.py;
  w.tilt = 0;
  w.invuln = INVULN_START;
  w.dead = 0;
  w.deathCounter = 0;
  resetWeaponsOnRestart(w);
  if (w.speed < SHIP_SPEED_MIN) w.speed = SHIP_SPEED_DEFAULT;
  if (w.level.starfield) initStars(w);

  // Vorlauf (`0x46FBxx`): Tiles und Objekte der letzten 1280 Ticks vorab platzieren.
  const { events, lineStart } = w.level;
  for (let t = Math.max(0, w.tick - CHECKPOINT_PREROLL); t < w.tick; t++) {
    for (let e = lineStart[t] as number; e < (lineStart[t + 1] as number); e++) {
      const kind = events.kind[e] as number;
      if (kind === 0) {
        spawnTile(w, events.a[e] as number, events.b[e] as number, SCREEN_W + t - w.tick);
      } else if (kind === 4) {
        spawnObject(
          w,
          events.a[e] as number,
          events.b[e] as number,
          fxFromInt(SCREEN_W + idiv(t - w.tick, 2)),
        );
      }
    }
  }
}

/**
 * Levelwechsel (`0x48EDAF`): Punkte, Leben, Tempo und Ausrüstung bleiben, der
 * Checkpoint beginnt bei 0. Der Zufall läuft weiter wie im Original (global).
 */
export function continueInNextLevel(prev: World, level: LevelData): World {
  const w = new World(level, prev.options, 0);
  w.rnd.seed = prev.rnd.seed;
  w.halfToggle = prev.halfToggle;
  w.score = prev.score;
  w.shownScore = prev.shownScore;
  w.lives = prev.lives;
  w.speed = prev.speed;
  w.gauge = prev.gauge;
  w.colour = prev.colour;
  w.stage = prev.stage;
  w.optionCount = prev.optionCount;
  w.bomb = prev.bomb;
  w.checkpoint = 0;
  restartAtCheckpoint(w);
  return w;
}

export function startLevel(w: World): void {
  w.checkpoint = 0;
  w.lives = LIVES_START;
  w.score = 0;
  w.shownScore = 0;
  w.speed = SHIP_SPEED_DEFAULT;
  w.gauge = SHIP_SPEED_DEFAULT * 10;
  loseEquipment(w);
  restartAtCheckpoint(w);
}
