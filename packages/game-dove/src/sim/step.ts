import { fxFromInt, fxMul } from "@clove/core";
import {
  BG_SPEED_DEFAULT,
  BOSS_TICK,
  CHECKPOINT_PREROLL,
  DEATH_END,
  DEATH_STEP,
  END_TICK,
  ENEMY_FIREBALL_TICKS,
  ENEMY_SHOT_CHANCE,
  EXPLOSION_FRAMES,
  EXTRA_ANIM_TICKS,
  EXTRA_ART,
  FALLER_DROP,
  FIELD_H,
  FLAME_BOOST_END,
  FLAME_BOOST_STEP,
  FLAME_BOOST_TIMER,
  HOVER_FIRE_TICKS,
  HOVER_LEAVE_TICKS,
  HOVER_STOP_X,
  INVULN_DONE,
  INVULN_START,
  LIVES_START,
  METEOR_SIZE,
  SCREEN_W,
  SHIP_HIT,
  SHIP_MAX_X,
  SHIP_MAX_Y,
  SHIP_MIN_X,
  SHIP_MIN_Y,
  SHIP_SPEED_DEFAULT,
  SHIP_SPEED_MAX,
  SHIP_SPEED_MIN,
  SHIP_SPEED_STEP,
  SHIP_START_X,
  SHIP_START_Y,
  SHIP_WALL,
  STAR_COUNT,
  STAR_GROUPS,
} from "./constants";
import { hitTest, wallHit, wallHitFx } from "./collision";
import { ShotKind, addEnemyShot, addEnemyShotForced, updateEnemyShots } from "./enemyShots";
import { Sound, crashEnemy, handlers, killPlayer, sound } from "./actions";
import { SPAWN_KIND, type LevelData } from "./level";
import { BOSSES } from "./bosses";
import { scriptAfterEvents, scriptEvents, scriptKeyboard, scriptTick } from "./scripts";
import {
  aimEnemy,
  pathOf,
  spawnBuiltinEnemy,
  spawnExtra,
  spawnObject,
  spawnPatternEnemy,
  spawnTile,
} from "./spawn";
import {
  beamInput,
  releaseBeam,
  fireVolley,
  loseEquipment,
  pickupExtra,
  resetWeaponsOnRestart,
  touchesExtra,
  updateBeam,
  updateLaser,
  updateOrbiters,
  updatePod,
  updateShots,
} from "./weapons";
import { divRoundHalfEven, idiv, roundHalfEven } from "./math";
import { World } from "./world";

/** Eingabe eines Ticks als Bitmaske. */
export const Input = {
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
  Fire: 16,
  Faster: 32,
  Slower: 64,
  /** `A`: Beam laden. */
  Beam: 128,
  /** `D`: Waffenausrichtung vorn/hinten umkehren. */
  Swap: 256,
  /**
   * Erweiterung (Maus/Touch): Bits 10–19 und 20–28 tragen ein Ziel für den
   * Bezugspunkt des Schiffs; es ersetzt die Richtungstasten. Ohne dieses Bit
   * läuft alles wie im Original.
   */
  Target: 512,
} as const;

/** Tastenbits (ohne Ziel); nur sie zählen für Kanten und den Weltzustand. */
const BUTTONS = 0x1ff;

/** Eingabe mit Zeigerziel; Koordinaten werden auf den Bildschirm begrenzt. */
export function withTarget(buttons: number, x: number, y: number): number {
  const tx = Math.max(0, Math.min(SCREEN_W - 1, Math.round(x)));
  const ty = Math.max(0, Math.min(479, Math.round(y)));
  return (buttons & BUTTONS) | Input.Target | (tx << 10) | (ty << 20);
}

/** Ziel einer Eingabe oder `undefined`. */
export function targetOf(input: number): { x: number; y: number } | undefined {
  if (!(input & Input.Target)) return undefined;
  return { x: (input >>> 10) & 0x3ff, y: (input >>> 20) & 0x1ff };
}

const FX_640 = fxFromInt(SCREEN_W);

// ---------------------------------------------------------------- Level-Start

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

// ---------------------------------------------------------------- Events (0x43D6B0)

/** Levelskripte (`Select Case Me.[0x39C]`). Liefert `true`, wenn der Tick stillsteht. */
function levelScript(w: World): boolean {
  const t = w.tick;
  const n = w.level.number;
  if (scriptEvents(w)) return true;
  if (BOSS_TICK[n] === t) {
    // Level 5 lässt den Hintergrund im Bosskampf weiterlaufen (`0x440475`).
    if (n !== 5) w.bgSpeed = 0;
    w.bossMode = true;
    w.bossState = 0;
    w.boss = BOSSES[n];
  }
  // Level ohne Boss: Tutorial 4500, Level 11 7300, Level 9 bei 8000 (Faktor < 1,1) sonst 15600.
  const end = n === 9 ? (w.options.scoreFactor < 110 ? 8000 : 15600) : END_TICK[n];
  if (end === t) {
    w.levelDone = true;
    w.invuln = 0;
  }
  return false;
}

function processEvents(w: World): void {
  if (w.bossMode) {
    // Im Bosskampf läuft nur noch das Level-5-Skript (`0x43D876`).
    scriptAfterEvents(w);
    w.tick++;
    return;
  }
  if (levelScript(w)) return;
  const { events: ev, lineStart } = w.level;
  const t = w.tick;
  const end = lineStart[t + 1] as number;
  for (let e = lineStart[t] as number; e < end; e++) {
    const a = ev.a[e] as number;
    const b = ev.b[e] as number;
    switch (ev.kind[e]) {
      case 0:
        spawnTile(w, a, b);
        break;
      case 1:
        if (b > 0) {
          spawnPatternEnemy(w, a, b);
        } else {
          // Y aus dem ersten folgenden `v§` derselben Zeile (`InStr(pos+1, line, "§")`).
          for (let s = e + 1; s < end; s++) {
            if (ev.kind[s] === SPAWN_KIND) {
              spawnBuiltinEnemy(w, a, b, ev.a[s] as number);
              break;
            }
          }
        }
        break;
      case 2:
        spawnExtra(w, a, b);
        break;
      case 3:
        if (!w.dead) w.checkpoint = t;
        break;
      case 4:
        spawnObject(w, a, b);
        break;
      // SPAWN_KIND: alleinstehende `y§` wertet das Original nie aus.
    }
  }
  scriptAfterEvents(w);
  w.tick++;
}

// ---------------------------------------------------------------- Spieler

function shipWall(w: World, x: number, y: number): boolean {
  return wallHit(w, x, y + SHIP_WALL.dy, SHIP_WALL.w, SHIP_WALL.h);
}

/** Pfeiltasten des Originals. */
function move(w: World, input: number): void {
  if (input & Input.Up) {
    w.py = Math.max(SHIP_MIN_Y, w.py - w.speed);
    w.tilt = 1;
  }
  if (input & Input.Down) {
    w.py = Math.min(SHIP_MAX_Y, w.py + w.speed);
    w.tilt = 2;
  }
  if (input & Input.Left) w.px = Math.max(SHIP_MIN_X, w.px - w.speed);
  if (input & Input.Right) w.px = Math.min(SHIP_MAX_X, w.px + w.speed);
}

/**
 * Zeigersteuerung (keine Entsprechung im Original): geradlinig aufs Ziel, die
 * längere Achse mit Schiffstempo, die kürzere anteilig — also nie langsamer als
 * mit den Pfeiltasten und ohne Zittern am Ziel. Ganzzahlig und deterministisch.
 */
export function moveToward(w: World, tx: number, ty: number): void {
  // Ziel auf den erreichbaren Bereich: sonst bremst die gesperrte Achse die freie
  const dx = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, tx)) - w.px;
  const dy = Math.max(SHIP_MIN_Y, Math.min(SHIP_MAX_Y, ty)) - w.py;
  const major = Math.max(Math.abs(dx), Math.abs(dy));
  if (major === 0) return;
  const stepMajor = Math.min(w.speed, major);
  const sy = divRoundHalfEven(dy * stepMajor, major);
  if (sy < 0) {
    w.py = Math.max(SHIP_MIN_Y, w.py + sy);
    w.tilt = 1;
  } else if (sy > 0) {
    w.py = Math.min(SHIP_MAX_Y, w.py + sy);
    w.tilt = 2;
  }
  w.px = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, w.px + divRoundHalfEven(dx * stepMajor, major)));
}

function keyboard(w: World, input: number): void {
  const pressed = input & BUTTONS & ~w.prevInput;
  if (w.dead) {
    w.tilt = 0;
    return;
  }
  scriptKeyboard(w);
  w.tilt = 0;
  const target = targetOf(input);
  if (target) moveToward(w, target.x, target.y);
  else move(w, input);
  if (pressed & Input.Faster) {
    w.speed = Math.min(SHIP_SPEED_MAX, w.speed + SHIP_SPEED_STEP);
    w.flame = 4;
    w.flameTimer = FLAME_BOOST_TIMER;
    sound(w, Sound.Antrieb, w.rnd.below(101) - 50);
  }
  if (pressed & Input.Slower) {
    w.speed = Math.max(SHIP_SPEED_MIN, w.speed - SHIP_SPEED_STEP);
    sound(w, Sound.Antrieb, w.rnd.below(101) - 50);
  }
  if (pressed & Input.Swap) w.podDir = -w.podDir;
  const fire = (input & Input.Fire) !== 0;
  beamInput(w, (input & Input.Beam) !== 0, fire);
  if (fire) fireVolley(w);
}

/**
 * Levelende (`0x4716CF`): geladener Beam geht los, 255 Ticks unverwundbar,
 * 30 Ticks Pause, dann auf y = 195 steuern und mit 9 px/Tick hinausfliegen.
 */
function autopilotTick(w: World): void {
  w.tilt = 0;
  if (w.autopilot === 0) {
    releaseBeam(w);
    w.invuln = 0;
  }
  if (w.autopilot < 30) {
    w.autopilot++;
    return;
  }
  if (w.autopilot === 30) {
    const y = w.py;
    if (y < 195) {
      w.py += y < 110 ? 6 : y < 170 ? 4 : y < 190 ? 2 : 1;
      w.tilt = 2;
    } else if (y > 195) {
      w.py -= y > 300 ? 6 : y > 220 ? 4 : y > 200 ? 2 : 1;
      w.tilt = 1;
    } else {
      sound(w, Sound.Antrieb, w.rnd.below(101) - 50);
      w.autopilot = 31;
    }
    return;
  }
  w.px += 9;
  if (w.px > 710) w.exit = 3;
}

// ---------------------------------------------------------------- Welt bewegen

function scroll(w: World): void {
  const lvl = w.level;
  w.bgOffset += w.bgSpeed;
  if (w.bgOffset > FX_640) w.bgOffset -= FX_640;

  const moveStars = (from: number, to: number, factor: number) => {
    const d = fxMul(w.bgSpeed, factor);
    for (let i = from; i <= to; i++) {
      const x = (w.starX[i] as number) - d;
      if (x <= 0) {
        w.starX[i] = x + FX_640;
        w.starY[i] = w.rnd.below(FIELD_H);
      } else {
        w.starX[i] = x;
      }
    }
  };
  if (lvl.starfield)
    for (const [from, to, factor] of STAR_GROUPS.slice(1)) moveStars(from, to, factor);

  for (let i = 0; i < w.objects.capacity; i++) {
    if (!w.objects.active[i]) continue;
    const o = lvl.objects[w.objType[i] as number]!;
    const x = (w.objX[i] as number) - w.bgSpeed;
    w.objX[i] = x;
    const y = w.objY[i] as number;
    if (x < fxFromInt(-o.w) || x > FX_640 || y > FIELD_H || y < -o.h) w.objects.free(i);
  }

  if (lvl.starfield) {
    const [from, to, factor] = STAR_GROUPS[0]!;
    moveStars(from, to, factor);
  }

  updatePod(w);

  for (let i = 0; i < w.extras.capacity; i++) {
    if (!w.extras.active[i]) continue;
    const x = (w.extraX[i] as number) + (w.extraVX[i] as number);
    w.extraX[i] = x;
    const anim = (w.extraAnim[i] as number) + 1;
    if (anim >= EXTRA_ANIM_TICKS) {
      w.extraAnim[i] = 0;
      const max = EXTRA_ART[w.extraArt[i] as number]![1];
      w.extraFrame[i] = (w.extraFrame[i] as number) >= max ? 0 : (w.extraFrame[i] as number) + 1;
    } else {
      w.extraAnim[i] = anim;
    }
    const y = w.extraY[i] as number;
    if (x > SCREEN_W - 1 || x < -25 || y < -25 || y > FIELD_H) {
      w.extras.free(i);
    } else if (touchesExtra(w, x, y)) {
      w.extras.free(i);
      pickupExtra(w, w.extraArt[i] as number);
    }
  }

  for (let i = 0; i < w.meteors.capacity; i++) {
    if (!w.meteors.active[i]) continue;
    const x = (w.metX[i] as number) + (w.metVX[i] as number);
    const y = (w.metY[i] as number) + (w.metVY[i] as number);
    w.metX[i] = x;
    w.metY[i] = y;
    if (x > SCREEN_W - 1 || x < -METEOR_SIZE || y < -METEOR_SIZE || y > FIELD_H) w.meteors.free(i);
  }

  for (let i = 0; i < w.tiles.capacity; i++) {
    if (!w.tiles.active[i]) continue;
    const t = lvl.tiles[w.tileType[i] as number]!;
    const x = (w.tileX[i] as number) + (w.tileVX[i] as number);
    const y = (w.tileY[i] as number) + (w.tileVY[i] as number);
    w.tileX[i] = x;
    w.tileY[i] = y;
    if (x < -t.w || x > SCREEN_W || y > FIELD_H || y < -t.h) w.tiles.free(i);
  }
}

// ---------------------------------------------------------------- Gegner

/** Schleim (Code −1…−4): achsweise ±p4 zum Schiff, ohne Überschießen und Wand. */
function homing(w: World, i: number): void {
  const def = w.level.enemies[w.enType[i] as number]!;
  const s = def.speedFx;
  const cx = (w.enX[i] as number) + (fxFromInt(def.w) >> 1);
  const cy = (w.enY[i] as number) + (fxFromInt(def.h) >> 1);
  const dx = fxFromInt(w.px + 20) - cx;
  const dy = fxFromInt(w.py + 10) - cy;
  const x = w.enX[i] as number;
  const y = w.enY[i] as number;
  if (dx >= s && !wallHitFx(w, x + s, y, def.w, def.h)) w.enX[i] = x + s;
  else if (dx <= -s && !wallHitFx(w, x - s, y, def.w, def.h)) w.enX[i] = x - s;
  const nx = w.enX[i] as number;
  if (dy >= s && !wallHitFx(w, nx, y + s, def.w, def.h)) w.enY[i] = y + s;
  else if (dy <= -s && !wallHitFx(w, nx, y - s, def.w, def.h)) w.enY[i] = y - s;
}

function updateEnemies(w: World): void {
  const lvl = w.level;
  for (let i = 0; i < w.enemies.capacity; i++) {
    if (!w.enemies.active[i]) continue;
    const def = lvl.enemies[w.enType[i] as number]!;
    const pattern = w.enPattern[i] as number;

    const anim = (w.enAnim[i] as number) + 1;
    if (anim > def.animDelay) {
      w.enAnim[i] = 0;
      w.enFrame[i] =
        (w.enFrame[i] as number) + 1 > def.frames - 1 ? 0 : (w.enFrame[i] as number) + 1;
    } else {
      w.enAnim[i] = anim;
    }
    const frame = w.enFrame[i] as number;
    let shooting = true;

    if (pattern >= 0) {
      w.enX[i] = (w.enX[i] as number) + (w.enVX[i] as number);
      w.enY[i] = (w.enY[i] as number) + (w.enVY[i] as number);
      if (pattern >= 1) {
        const path = pathOf(w, pattern)!;
        const wp = (w.enWaypoint[i] as number) + 1;
        const tx = path.x[wp] as number;
        const ty = path.y[wp] as number;
        const vx = w.enVX[i] as number;
        const vy = w.enVY[i] as number;
        const cx = roundHalfEven(w.enX[i] as number);
        const cy = roundHalfEven(w.enY[i] as number);
        const reachedX = vx < 0 ? cx <= tx : vx > 0 ? cx >= tx : true;
        const reachedY = vy < 0 ? cy <= ty : vy > 0 ? cy >= ty : true;
        if (reachedX && reachedY) {
          w.enWaypoint[i] = wp;
          const nx = path.x[wp + 1];
          if (nx === undefined || nx === -1) w.enX[i] = fxFromInt(SCREEN_W + 1);
          else aimEnemy(w, i, nx, path.y[wp + 1] as number);
        }
      }
      if (
        def.speed !== 1 &&
        wallHitFx(
          w,
          w.enX[i] as number,
          w.enY[i] as number,
          def.w,
          (def.f1[frame] as number) - (def.f0[frame] as number),
        )
      ) {
        crashEnemy(w, i);
        continue;
      }
    } else if (pattern >= -4) {
      homing(w, i);
    } else if (pattern === -5) {
      const vy = w.enVY[i] as number;
      const x = w.enX[i] as number;
      const ny = (w.enY[i] as number) + vy;
      if (
        wallHitFx(w, x, ny, def.w, def.h) ||
        !(ny > 0 && ny + fxFromInt(def.h) < fxFromInt(FIELD_H))
      ) {
        w.enVY[i] = -vy;
      } else {
        w.enY[i] = ny;
      }
      if (x > fxFromInt(HOVER_STOP_X)) w.enX[i] = x - def.speedFx;
      const timer = (w.enAux[i] as number) + 1;
      w.enAux[i] = timer;
      if (timer > HOVER_LEAVE_TICKS) {
        w.enX[i] = (w.enX[i] as number) - def.speedFx;
        shooting = false;
      }
      if (wallHitFx(w, w.enX[i] as number, w.enY[i] as number, def.w, def.h)) {
        crashEnemy(w, i);
        continue;
      }
      if (shooting) {
        const st = (w.enShotTimer[i] as number) + 1;
        w.enShotTimer[i] = st >= HOVER_FIRE_TICKS ? 0 : st;
        if (st >= HOVER_FIRE_TICKS) {
          const fx0 = roundHalfEven(w.enX[i] as number) - 35;
          const fy = roundHalfEven(w.enY[i] as number);
          addEnemyShotForced(w, ShotKind.Fireball, fx0, fy);
          addEnemyShotForced(w, ShotKind.Fireball, fx0, fy + def.h);
        }
      }
      shooting = false;
    } else {
      // Faller (Code −6)
      w.enX[i] = (w.enX[i] as number) + (w.enVX[i] as number);
      const phase = w.enAux[i] as number;
      if (phase === 0) {
        if ((w.enX[i] as number) < fxFromInt(w.px + 40)) w.enAux[i] = 1;
      } else if (phase <= 15) {
        w.enX[i] = (w.enX[i] as number) + fxFromInt(phase & 1 ? 2 : -2);
        w.enAux[i] = phase + 1;
      } else {
        w.enY[i] = (w.enY[i] as number) + fxFromInt(FALLER_DROP);
      }
      if (wallHitFx(w, w.enX[i] as number, w.enY[i] as number, def.w, def.h)) {
        crashEnemy(w, i, Sound.IceExplosion);
        continue;
      }
    }

    if (shooting && def.shot >= 1 && def.shot <= 3) {
      if (w.rnd.less(ENEMY_SHOT_CHANCE[def.shot]!)) {
        const x = roundHalfEven((w.enX[i] as number) + (fxFromInt(def.w) >> 1));
        const y = roundHalfEven((w.enY[i] as number) + fxFromInt(idiv(def.h, 2)));
        addEnemyShot(w, ShotKind.Aimed, x, y);
      }
    } else if (shooting && def.shot === 4) {
      const st = (w.enShotTimer[i] as number) + 1;
      w.enShotTimer[i] = st >= ENEMY_FIREBALL_TICKS ? 0 : st;
      if (st >= ENEMY_FIREBALL_TICKS) {
        addEnemyShot(
          w,
          ShotKind.Fireball,
          roundHalfEven(w.enX[i] as number) - 35,
          roundHalfEven(w.enY[i] as number),
        );
      }
    }

    const x = w.enX[i] as number;
    const y = w.enY[i] as number;
    if (x < fxFromInt(-def.w) || x > FX_640 || y > fxFromInt(FIELD_H) || y < fxFromInt(-def.h)) {
      w.enemies.free(i);
    }
  }
}

// ---------------------------------------------------------------- Schüsse, Explosionen, HUD

function updateExplosions(w: World): void {
  for (let i = 0; i < w.explosions.capacity; i++) {
    if (!w.explosions.active[i]) continue;
    const f = (w.expFrame[i] as number) + 1;
    if (f > EXPLOSION_FRAMES) w.explosions.free(i);
    else w.expFrame[i] = f;
  }
}

function rollScore(w: World): void {
  const d = w.score - w.shownScore;
  const delta =
    d > 1000
      ? 511
      : d > 100
        ? 51
        : d > 11
          ? 11
          : d > 0
            ? 1
            : d < -1000
              ? -999
              : d < -100
                ? -99
                : d < -11
                  ? -9
                  : d < 0
                    ? -1
                    : 0;
  w.shownScore += delta;
  const target = w.speed * 10;
  if (w.gauge < target) w.gauge++;
  else if (w.gauge > target) w.gauge--;
  if (w.shake > 0) w.shake--;
}

// ---------------------------------------------------------------- Tick

/**
 * Ein Tick in der Reihenfolge des Originals (`docs/measurements/dove-player.md`).
 */
export function step(w: World, input: number): void {
  // Nach dem Levelende ist die Hauptschleife verlassen (`Me.690 = 3`).
  if (w.exit !== 0) return;
  w.laser = 0;
  // 1. Wand-Schub (Option „Wände töten“ aus)
  if (!w.options.wallsKill && !w.dead && w.px > SHIP_MIN_X && shipWall(w, w.px, w.py)) w.px -= 1;
  // 2.–4. Position merken, Tastatur, Wand-Rücknahme
  w.prevX = w.px;
  w.prevY = w.py;
  if (w.levelDone && !w.dead) autopilotTick(w);
  else keyboard(w, input);
  if (!w.options.wallsKill && !w.dead && !w.levelDone) {
    if (shipWall(w, w.px, w.prevY)) w.px = w.prevX;
    if (shipWall(w, w.px, w.py)) w.py = w.prevY;
  }
  w.prevInput = input & BUTTONS;
  // 5. Spielerkollision
  if (!w.dead && w.invuln === INVULN_DONE) {
    const r = hitTest(
      w,
      w.px,
      w.py + SHIP_HIT.dy,
      SHIP_HIT.w,
      SHIP_HIT.h,
      0,
      w.options.wallsKill,
      handlers,
    );
    if (r === 0) killPlayer(w);
  }
  // 6. Events
  processEvents(w);
  // 7. Flamme und Unverwundbarkeit
  if (w.flameTimer >= FLAME_BOOST_END) {
    w.flameTimer -= FLAME_BOOST_STEP;
  } else {
    w.flameTimer = 0;
    w.flame = w.flame >= 3 ? 1 : w.flame + 1;
  }
  if (w.invuln < INVULN_DONE) w.invuln++;
  // 8. Scrolling
  scroll(w);
  scriptTick(w);
  // 10.–12. Gegner, Spielerschüsse, Gegnerschüsse
  updateEnemies(w);
  if (w.bossMode && w.boss) w.boss.tick(w);
  updateShots(w);
  updateLaser(w);
  updateEnemyShots(w);
  updateOrbiters(w);
  updateBeam(w);
  updateExplosions(w);
  // 13. HUD
  rollScore(w);
  // Tod: Zähler bis 205, dann Leben abziehen und Neustart am Checkpoint.
  if (w.dead) {
    w.deathCounter += DEATH_STEP;
    if (w.deathCounter >= DEATH_END) {
      if (w.options.weaponLoss) loseEquipment(w);
      w.lives--;
      if (w.lives < 0) {
        w.lives = LIVES_START;
        w.score = 0;
      }
      restartAtCheckpoint(w);
    }
  }
}
