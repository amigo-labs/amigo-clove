import { FX_ONE, fxDiv, fxFromInt, fxMul } from "@clove/core";
import {
  BG_SPEED_DEFAULT,
  BOSS_TICK,
  CHECKPOINT_PREROLL,
  DEATH_END,
  DEATH_STEP,
  END_TICK,
  ENEMY_AIM_SPEED,
  ENEMY_FIREBALL_TICKS,
  ENEMY_SHOT_CHANCE,
  ESHOT,
  EXPLOSION_FRAMES,
  EXTRA_ANIM_TICKS,
  EXTRA_ART,
  FALLER_DROP,
  FIELD_H,
  FIREBALL_VX,
  FLAME_BOOST_END,
  FLAME_BOOST_STEP,
  FLAME_BOOST_TIMER,
  HOVER_FIRE_TICKS,
  HOVER_LEAVE_TICKS,
  HOVER_STOP_X,
  INVULN_DONE,
  INVULN_START,
  LIVES_START,
  METEOR_FIRST_TICK,
  METEOR_HP,
  METEOR_LAST_TICK,
  METEOR_SIZE,
  METEOR_VX,
  SCREEN_W,
  SHIP_HIT,
  SHIP_MAX_X,
  SHIP_MAX_Y,
  SHIP_MIN_X,
  SHIP_MIN_Y,
  SHIP_SHOT_BOX,
  SHIP_SPEED_DEFAULT,
  SHIP_SPEED_MAX,
  SHIP_SPEED_MIN,
  SHIP_SPEED_STEP,
  SHIP_START_X,
  SHIP_START_Y,
  SHIP_WALL,
  STAR_COUNT,
  STAR_GROUPS,
  TILE_VX,
} from "./constants";
import { hitTest, wallHit, wallHitFx } from "./collision";
import { Sound, crashEnemy, handlers, killPlayer, sound } from "./actions";
import { EDGE_OUTSIDE, SPAWN_KIND } from "./level";
import {
  beamInput,
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
import { boxHit, divRoundHalfEven, idiv, roundHalfEven } from "./math";
import type { World } from "./world";

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
} as const;

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
  w.finished = false;
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

// ---------------------------------------------------------------- Spawns

function spawnTile(w: World, ref: number, y: number, x: number = SCREEN_W): void {
  if (ref < 1 || ref > w.level.tiles.length) return;
  const i = w.tiles.alloc();
  if (i < 0) return;
  w.tileType[i] = ref - 1;
  w.tileX[i] = x;
  w.tileY[i] = y;
}

function spawnObject(w: World, ref: number, y: number, x?: number): void {
  if (ref < 1 || ref > w.level.objects.length) return;
  const i = w.objects.alloc();
  if (i < 0) return;
  w.objType[i] = ref - 1;
  // x = 640 + 0,5 − frac(Me.188) (`0x43C1E0`)
  w.objX[i] = x ?? FX_640 + (FX_ONE >> 1) - (w.bgOffset & 0xffff);
  w.objY[i] = y;
}

function spawnExtra(w: World, art: number, y: number): void {
  if (!(art in EXTRA_ART)) return;
  const i = w.extras.alloc();
  if (i < 0) return;
  w.extraArt[i] = art;
  w.extraX[i] = SCREEN_W;
  w.extraY[i] = y;
  w.extraFrame[i] = 0;
  w.extraAnim[i] = 0;
}

function allocEnemy(w: World, type: number, pattern: number): number {
  const def = w.level.enemies[type];
  if (!def) return -1;
  const i = w.enemies.alloc();
  if (i < 0) return -1;
  w.enType[i] = type;
  w.enPattern[i] = pattern;
  w.enHP[i] = def.hp;
  w.enPoints[i] = def.hp;
  w.enFrame[i] = 0;
  w.enAnim[i] = 0;
  w.enWaypoint[i] = 0;
  w.enShotTimer[i] = 0;
  w.enAux[i] = 0;
  w.enVX[i] = 0;
  w.enVY[i] = 0;
  return i;
}

/** Hauptachse mit `speed`, Nebenachse skaliert (Spawn und Wegpunktwechsel). */
function aimEnemy(w: World, i: number, tx: number, ty: number): void {
  const speed = w.level.enemies[w.enType[i] as number]!.speedFx;
  const dx = fxFromInt(tx) - (w.enX[i] as number);
  const dy = fxFromInt(ty) - (w.enY[i] as number);
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > ady) {
    w.enVX[i] = dx < 0 ? -speed : speed;
    w.enVY[i] = fxMul(fxDiv(dy, adx), speed);
  } else {
    w.enVY[i] = dy < 0 ? -speed : speed;
    w.enVX[i] = ady === 0 ? 0 : fxMul(fxDiv(dx, ady), speed);
  }
}

/** `;1 T P!` mit P > 0: Pattern-Gegner (`0x43D090`). */
function spawnPatternEnemy(w: World, ref: number, pattern: number): void {
  const path = w.level.paths[pattern - 1];
  if (!path) return;
  const i = allocEnemy(w, ref - 1, pattern);
  if (i < 0) return;
  const def = w.level.enemies[ref - 1]!;
  const sx = path.x[0] as number;
  const sy = path.y[0] as number;
  w.enX[i] = fxFromInt(sx === EDGE_OUTSIDE ? -def.w : sx);
  w.enY[i] = fxFromInt(sy === EDGE_OUTSIDE ? -def.h : sy);
  aimEnemy(w, i, path.x[1] as number, path.y[1] as number);
}

/** `;1 T P!` mit P ≤ 0 und gebundenem `v§` — Tabelle in `docs/measurements/dove-events.md`. */
function spawnBuiltinEnemy(w: World, ref: number, pattern: number, v: number): void {
  const def = w.level.enemies[ref - 1];
  if (!def) return;
  const code = pattern === -5 ? 0 : pattern <= -6 ? pattern + 1 : pattern;
  const i = allocEnemy(w, ref - 1, code);
  if (i < 0) return;
  const s = def.speedFx;
  const editorX = idiv(v * 64, 41);
  let x = SCREEN_W;
  let y = v;
  let vx = -s;
  let vy = 0;
  switch (pattern) {
    case -1:
      x = editorX;
      y = FIELD_H;
      break;
    case -2:
      x = editorX;
      y = -def.h;
      break;
    case -4:
      x = -def.w;
      break;
    case -5:
      x = -def.w;
      vx = s;
      break;
    case -6:
      vx = 0;
      vy = -s;
      break;
  }
  w.enX[i] = fxFromInt(x);
  w.enY[i] = fxFromInt(y);
  w.enVX[i] = vx;
  w.enVY[i] = vy;
}

// ---------------------------------------------------------------- Events (0x43D6B0)

/** Levelskripte (`Select Case Me.[0x39C]`). Liefert `true`, wenn der Tick stillsteht. */
function levelScript(w: World): boolean {
  const t = w.tick;
  const n = w.level.number;
  if (n === 1) {
    // Warp-Intro: Hintergrundtempo ramp up, halten, ramp down; Triebwerk bei 50 und 329.
    if (t === 50 || t === 329) sound(w, Sound.Antrieb, w.rnd.below(101) - 50);
    if (t >= 51 && t <= 70) w.bgSpeed = fxFromInt(t - 50);
    else if (t > 70 && t < 330) w.bgSpeed = fxFromInt(20);
    else if (t >= 330 && t <= 349) w.bgSpeed = fxFromInt(350 - t);
    else if (t === 350) w.bgSpeed = BG_SPEED_DEFAULT;
    // Meteore: ein Spawn lässt den Tick stillstehen (Rückkehr ohne F4 += 1).
    if (t >= METEOR_FIRST_TICK && t <= METEOR_LAST_TICK) {
      for (let i = 0; i < w.meteors.capacity; i++) {
        if (w.meteors.active[i] || !w.rnd.greater(0.98)) continue;
        w.meteors.active[i] = 1;
        w.metX[i] = SCREEN_W;
        w.metY[i] = w.rnd.below(350);
        w.metVX[i] = METEOR_VX;
        w.metVY[i] = w.rnd.below(3) - 1;
        w.metHP[i] = METEOR_HP;
        return true;
      }
    }
  }
  if (BOSS_TICK[n] === t) {
    w.bgSpeed = 0;
    w.bossMode = true;
  }
  if (END_TICK[n] === t) w.finished = true;
  return false;
}

function processEvents(w: World): void {
  if (w.bossMode) {
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
  w.tick++;
}

// ---------------------------------------------------------------- Spieler

function shipWall(w: World, x: number, y: number): boolean {
  return wallHit(w, x, y + SHIP_WALL.dy, SHIP_WALL.w, SHIP_WALL.h);
}

function keyboard(w: World, input: number): void {
  const pressed = input & ~w.prevInput;
  w.tilt = 0;
  if (w.dead) return;
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
    const x = (w.extraX[i] as number) - 1;
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
    const x = (w.tileX[i] as number) + TILE_VX;
    w.tileX[i] = x;
    const y = w.tileY[i] as number;
    if (x < -t.w || x > SCREEN_W || y > FIELD_H || y < -t.h) w.tiles.free(i);
  }
}

// ---------------------------------------------------------------- Gegner

function requestShot(w: World, force: boolean): boolean {
  if (force) return true;
  const mode = w.options.enemyShots;
  if (mode === 0) return false;
  if (mode === 2) {
    w.halfToggle ^= 1;
    return w.halfToggle === 0;
  }
  return true;
}

function fireAimed(w: World, x: number, y: number): void {
  const i = w.eshots.alloc();
  if (i < 0) return;
  const tx = w.px + 20;
  const ty = w.py + 7;
  const dx = tx - x;
  const dy = ty - y;
  let vx: number;
  let vy: number;
  if (Math.abs(dx) > Math.abs(dy)) {
    vx = dx < 0 ? -ENEMY_AIM_SPEED : ENEMY_AIM_SPEED;
    vy = divRoundHalfEven(dy * ENEMY_AIM_SPEED, Math.abs(dx));
  } else {
    vy = dy < 0 ? -ENEMY_AIM_SPEED : ENEMY_AIM_SPEED;
    vx = dy === 0 ? 0 : divRoundHalfEven(dx * ENEMY_AIM_SPEED, Math.abs(dy));
  }
  w.eshotKind[i] = 1;
  w.eshotX[i] = x - 4;
  w.eshotY[i] = y - 4;
  w.eshotVX[i] = vx;
  w.eshotVY[i] = vy;
}

function fireFireball(w: World, x: number, y: number): void {
  const i = w.eshots.alloc();
  if (i < 0) return;
  w.eshotKind[i] = 2;
  w.eshotX[i] = x;
  w.eshotY[i] = y - 7;
  w.eshotVX[i] = FIREBALL_VX;
  w.eshotVY[i] = 0;
}

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
        const path = lvl.paths[pattern - 1]!;
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
          fireFireball(w, fx0, fy);
          fireFireball(w, fx0, fy + def.h);
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
      if (w.rnd.less(ENEMY_SHOT_CHANCE[def.shot]!) && requestShot(w, false)) {
        const x = roundHalfEven((w.enX[i] as number) + (fxFromInt(def.w) >> 1));
        const y = roundHalfEven((w.enY[i] as number) + fxFromInt(idiv(def.h, 2)));
        fireAimed(w, x, y);
      }
    } else if (shooting && def.shot === 4) {
      const st = (w.enShotTimer[i] as number) + 1;
      w.enShotTimer[i] = st >= ENEMY_FIREBALL_TICKS ? 0 : st;
      if (st >= ENEMY_FIREBALL_TICKS && requestShot(w, false)) {
        fireFireball(w, roundHalfEven(w.enX[i] as number) - 35, roundHalfEven(w.enY[i] as number));
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

function updateEnemyShots(w: World): void {
  for (let i = 0; i < w.eshots.capacity; i++) {
    if (!w.eshots.active[i]) continue;
    const kind = ESHOT[w.eshotKind[i] as 1 | 2];
    const x = (w.eshotX[i] as number) + (w.eshotVX[i] as number);
    const y = (w.eshotY[i] as number) + (w.eshotVY[i] as number);
    w.eshotX[i] = x;
    w.eshotY[i] = y;
    if (x < -kind.w || x > SCREEN_W || y < -kind.h || y > FIELD_H) {
      w.eshots.free(i);
      continue;
    }
    if (
      !w.dead &&
      w.invuln === INVULN_DONE &&
      w.shield === 0 &&
      boxHit(
        w.px,
        w.py + SHIP_SHOT_BOX.dy0,
        SHIP_SHOT_BOX.w,
        SHIP_SHOT_BOX.dy1 - SHIP_SHOT_BOX.dy0,
        x,
        y,
        kind.w,
        kind.h,
      )
    ) {
      w.eshots.free(i);
      killPlayer(w);
    }
  }
}

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
  w.laser = 0;
  // 1. Wand-Schub (Option „Wände töten“ aus)
  if (!w.options.wallsKill && !w.dead && w.px > SHIP_MIN_X && shipWall(w, w.px, w.py)) w.px -= 1;
  // 2.–4. Position merken, Tastatur, Wand-Rücknahme
  w.prevX = w.px;
  w.prevY = w.py;
  keyboard(w, input);
  if (!w.options.wallsKill && !w.dead) {
    if (shipWall(w, w.px, w.prevY)) w.px = w.prevX;
    if (shipWall(w, w.px, w.py)) w.py = w.prevY;
  }
  w.prevInput = input;
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
  // 10.–12. Gegner, Spielerschüsse, Gegnerschüsse
  updateEnemies(w);
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
  if (
    w.bossMode &&
    !w.finished &&
    w.enemies.active.indexOf(1) < 0 &&
    w.tick > (BOSS_TICK[w.level.number] ?? 0) + 200
  ) {
    // M3: ohne Boss gilt das Level als geschafft, sobald das Feld leer ist.
    w.finished = true;
  }
}
