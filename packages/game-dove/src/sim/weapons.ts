import { fxFromInt, fxMul } from "@clove/core";
import { Effect, Sound, addScore, effect, handlers, sound } from "./actions";
import { hitTest } from "./collision";
import {
  ABSORB_SCORE,
  BEAM_BOSS_BUDGET,
  BEAM_KINDS,
  BEAM_MAX,
  BEAM_SPEED,
  BOMB_BOX,
  BOMB_DAMAGE,
  BOMB_MAX_Y,
  BOMB_VY,
  COLOUR_BLUE,
  COLOUR_GREEN,
  COLOUR_RED,
  ESHOT,
  EXTRA_PICKUP,
  EXTRA_SCORE,
  FIRE_BASE,
  FIRE_BOMB,
  FIRE_GREEN,
  FIRE_RED,
  FULL_BEAM_DAMAGE,
  GREEN_SIZES,
  GREEN_SPLIT_VY,
  GREEN_VX,
  LASER_FRONT_DAMAGE,
  LASER_REAR_DAMAGE,
  MAX_OPTIONS,
  MAX_STAGE,
  METEOR_SIZE,
  ORBIT_RX,
  ORBIT_RY,
  ORBIT_STEP,
  ORBITER_DAMAGE,
  ORBITER_SIZE,
  POD_FRONT,
  POD_REAR,
  RED_DAMAGE,
  RED_REAR_DAMAGE,
  RED_SIZE,
  SCREEN_W,
  SHIELD_TICKS,
  SHOT_DAMAGE,
  SHOT_DX,
  SHOT_DY,
  SHOT_MAX_X,
  SHOT_SIZE,
  SHOT_VX,
} from "./constants";
import { boxHit, roundHalfEven } from "./math";
import { cosDeg, sinDeg } from "./trig";
import type { World } from "./world";

/** Schusstypen der Spielerschuss-Schleife (`0x47C89D`, Sprungtabelle `0x4903E1`). */
export const ShotType = { Base: 0, Bomb: 1, Green: 2, Red: 3 } as const;

/** `AddSchuss` speichert (x − vx, y − vy); die Schleife bewegt im selben Tick. */
function addShot(
  w: World,
  type: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: number,
  damage: number,
): void {
  const i = w.shots.alloc();
  if (i < 0) return;
  w.shotType[i] = type;
  w.shotX[i] = x - vx;
  w.shotY[i] = y - vy;
  w.shotVX[i] = vx;
  w.shotVY[i] = vy;
  w.shotSize[i] = size;
  w.shotDamage[i] = damage;
}

// ---------------------------------------------------------------- Extras

/** Aufnahme-Test (`0x476299`): X+40 ≥ ex, X ≤ ex+20, Y+22 ≥ ey, Y ≤ ey+21, inklusiv. */
export function touchesExtra(w: World, ex: number, ey: number): boolean {
  return (
    !w.dead && w.px + 40 >= ex && w.px <= ex + EXTRA_PICKUP && w.py + 22 >= ey && w.py <= ey + 21
  );
}

export function pickupExtra(w: World, art: number): void {
  addScore(w, EXTRA_SCORE, true);
  sound(w, Sound.Jingle);
  switch (art) {
    case -2:
      w.shield = SHIELD_TICKS;
      break;
    case -1:
      w.bomb = 1;
      break;
    case 0:
      w.optionCount = Math.min(MAX_OPTIONS, w.optionCount + 1);
      break;
    default:
      // Gleiche Farbe → nächste Stufe, andere Farbe → Stufe 0.
      if (w.colour !== art) w.stage = -1;
      w.colour = art;
      w.stage = Math.min(MAX_STAGE, w.stage + 1);
  }
}

// ---------------------------------------------------------------- Feuern (NEUERSCHUSS 0x435110)

function due(w: World, timer: number, gap: number): boolean {
  if ((w.fireTimer[timer] as number) >= w.tick) return false;
  w.fireTimer[timer] = w.tick + gap;
  return true;
}

/** Eine Salve: Basisschuss immer nach vorn, Farbwaffe nur bei Ausrichtung 0 oder 80, Bombe. */
export function fireVolley(w: World): void {
  if (due(w, 0, FIRE_BASE)) {
    addShot(w, ShotType.Base, w.px + SHOT_DX, w.py + SHOT_DY, SHOT_VX, 0, 0, SHOT_DAMAGE);
    sound(w, Sound.Normal);
  }
  const front = w.pod === POD_FRONT;
  if (front || w.pod === POD_REAR) {
    const L = w.stage;
    if (w.colour === COLOUR_BLUE) {
      w.laser = 1;
    } else if (w.colour === COLOUR_GREEN && due(w, 1, FIRE_GREEN)) {
      const y = w.py + 4 - 5 * L;
      if (front) addShot(w, ShotType.Green, w.px + 40, y, GREEN_VX, 0, L + 1, L + 4);
      else addShot(w, ShotType.Green, w.px - 20, y, -GREEN_VX, 0, L + 1, L + 19);
      sound(w, Sound.Green, (L + 10) * 5);
    } else if (w.colour === COLOUR_RED && due(w, 1, FIRE_RED)) {
      const n = 3 * L + 2;
      for (let i = -n; i <= n; i += 2) {
        const vx = 9 - Math.abs(i);
        if (front) addShot(w, ShotType.Red, w.px + 40, w.py + 7, vx, i, 0, RED_DAMAGE);
        else addShot(w, ShotType.Red, w.px - 10, w.py + 7, -vx, i, 0, RED_DAMAGE);
      }
      if (!front) addShot(w, ShotType.Red, w.px - 10, w.py + 7, -9, 0, 0, RED_REAR_DAMAGE);
      sound(w, Sound.Red);
    }
  }
  if (w.bomb && due(w, 2, FIRE_BOMB)) {
    // AddSchuss(1, X+15, Y+22, 0, 5, …): gespeichert Y+17, die Schleife fällt mit 8 px/Tick.
    addShot(w, ShotType.Bomb, w.px + 15, w.py + 22, 0, 5, 0, BOMB_DAMAGE);
  }
}

/** Ausrichtung pro Tick um 1 Richtung 0 bzw. 80 (`0x475F0E`); ein Wechsel dauert 80 Ticks. */
export function updatePod(w: World): void {
  w.pod = Math.max(POD_REAR, Math.min(POD_FRONT, w.pod + w.podDir));
}

// ---------------------------------------------------------------- Beam

/** Laden mit `A` (max. 200), Auslösen beim Loslassen oder bei Feuer während des Ladens. */
export function beamInput(w: World, beamHeld: boolean, fireHeld: boolean): void {
  if (beamHeld && !w.beam && w.charge < BEAM_MAX) {
    w.charge++;
    if (w.charge === BEAM_MAX - 1) sound(w, Sound.Charge, 9990);
    else if (w.charge % 10 === 0 && w.charge < BEAM_MAX)
      sound(w, Sound.Charge, 10 * w.charge + 5000);
  }
  if (!beamHeld || w.beam || (fireHeld && w.charge > 0)) releaseBeam(w);
}

function releaseBeam(w: World): void {
  const c = w.charge;
  w.charge = 0;
  if (c === 0) return;
  if (c < 10) {
    fireVolley(w);
    return;
  }
  const kind = c >= BEAM_MAX ? 4 : c > 125 ? 3 : c > 75 ? 2 : 1;
  const k = BEAM_KINDS[kind]!;
  w.beam = kind;
  w.beamX = w.px + 40 - BEAM_SPEED;
  w.beamY = w.py + k.dy;
  w.beamDamage = kind === 4 ? FULL_BEAM_DAMAGE : c + k.bonus;
  w.bossBudget = BEAM_BOSS_BUDGET;
  if (kind === 4) {
    hitTest(w, w.px + 40, w.beamY, k.w, k.h, BEAM_BOSS_BUDGET, true, handlers);
    sound(w, Sound.Beam1, 50);
  } else {
    sound(w, Sound.Beam2, 50);
  }
}

/** Beam im Flug (`0x485E0D`): 10 px/Tick; der volle Beam durchdringt alles. */
export function updateBeam(w: World): void {
  if (!w.beam) return;
  const k = BEAM_KINDS[w.beam]!;
  w.beamX += BEAM_SPEED;
  if (w.beamX >= SCREEN_W) {
    w.beam = 0;
    return;
  }
  const r = hitTest(w, w.beamX, w.beamY, k.w, k.h, w.beamDamage, true, handlers);
  if (w.beam < 4) {
    if (r > 0) w.beamDamage = r;
    else if (r === 0) {
      w.beam = 0;
      return;
    }
  }
  // Gezielte Kugeln (Art 1) werden neutralisiert, Feuerbälle nicht.
  for (let i = 0; i < w.eshots.capacity; i++) {
    if (!w.eshots.active[i] || w.eshotKind[i] !== 1) continue;
    const s = ESHOT[1];
    if (
      boxHit(w.beamX, w.beamY, k.w, k.h, w.eshotX[i] as number, w.eshotY[i] as number, s.w, s.h)
    ) {
      w.eshots.free(i);
      addScore(w, ABSORB_SCORE, true);
    }
  }
}

// ---------------------------------------------------------------- Spielerschüsse (0x47C89D)

function splitGreen(w: World, i: number): void {
  const s = w.shotSize[i] as number;
  if (s <= 0) return;
  const x = w.shotX[i] as number;
  const y = w.shotY[i] as number;
  const vx = w.shotVX[i] as number;
  const vy = w.shotVY[i] as number;
  const dmg = 2 * s + 8;
  if (vy === 0) {
    addShot(w, ShotType.Green, x, y, -vx, GREEN_SPLIT_VY, s - 1, dmg);
    addShot(w, ShotType.Green, x, y, -vx, -GREEN_SPLIT_VY, s - 1, dmg);
  } else {
    addShot(w, ShotType.Green, x, y, -vx, vy, s - 1, dmg);
    addShot(w, ShotType.Green, x, y, vx, -vy, s - 1, dmg);
  }
}

export function updateShots(w: World): void {
  for (let i = 0; i < w.shots.capacity; i++) {
    if (!w.shots.active[i]) continue;
    const type = w.shotType[i] as number;
    let x = w.shotX[i] as number;
    let y = w.shotY[i] as number;
    let bw: number;
    let bh: number;
    let gone: boolean;
    switch (type) {
      case ShotType.Base:
        x += w.shotVX[i] as number;
        bw = bh = SHOT_SIZE;
        gone = x > SHOT_MAX_X;
        break;
      case ShotType.Bomb:
        y += BOMB_VY;
        bw = BOMB_BOX.w;
        bh = BOMB_BOX.h;
        gone = y > BOMB_MAX_Y;
        break;
      case ShotType.Green: {
        x += w.shotVX[i] as number;
        y += w.shotVY[i] as number;
        const g = GREEN_SIZES[w.shotSize[i] as number]!;
        bw = g.w;
        bh = g.h;
        gone = x > SCREEN_W - 1 || x < -bw || y - bh > 410 || y < -bh;
        break;
      }
      default:
        x += w.shotVX[i] as number;
        y += w.shotVY[i] as number;
        bw = bh = RED_SIZE;
        gone = x > SCREEN_W - 1 || x < -RED_SIZE || y > 410 - RED_SIZE || y < -RED_SIZE;
    }
    w.shotX[i] = x;
    w.shotY[i] = y;
    if (gone) {
      w.shots.free(i);
      continue;
    }
    const r = hitTest(w, x, y, bw, bh, w.shotDamage[i] as number, true, handlers);
    if (type === ShotType.Green) {
      if (r >= 0) {
        effect(w, Effect.ShotHit, x, y, bw, bh);
        splitGreen(w, i);
        w.shots.free(i);
      }
    } else if (r === 0) {
      effect(w, Effect.ShotHit, x, y, bw, bh);
      w.shots.free(i);
    } else if (r > 0) {
      w.shotDamage[i] = r;
    }
  }
}

// ---------------------------------------------------------------- Blauer Laser (0x47F65D)

/** Linke Kante des nächsten Hindernisses rechts von `x0` in Zeile `row`, sonst 640. */
function rightEdge(w: World, x0: number, row: number): number {
  let best = SCREEN_W;
  const lvl = w.level;
  for (let i = 0; i < w.tiles.capacity; i++) {
    if (!w.tiles.active[i]) continue;
    const t = lvl.tiles[w.tileType[i] as number]!;
    const tx = w.tileX[i] as number;
    const ty = w.tileY[i] as number;
    if (row >= ty && row <= ty + t.h && tx >= x0 && tx < best) best = tx;
  }
  const consider = (base: number, rows: number, ex: number, ey: number, contours: Int16Array) => {
    const r = row - ey;
    if (r < 0 || r >= rows) return;
    const l = contours[base + r * 2] as number;
    const rr = contours[base + r * 2 + 1] as number;
    if (l > rr) return;
    const edge = ex + l;
    if (edge >= x0 && edge < best) best = edge;
  };
  for (let i = 0; i < w.enemies.capacity; i++) {
    if (!w.enemies.active[i]) continue;
    const def = lvl.enemies[w.enType[i] as number]!;
    const rows = def.h + 1;
    consider(
      def.contour + (w.enFrame[i] as number) * rows * 2,
      rows,
      roundHalfEven(w.enX[i] as number),
      roundHalfEven(w.enY[i] as number),
      lvl.contours,
    );
  }
  for (let i = 0; i < w.meteors.capacity; i++) {
    if (w.meteors.active[i]) {
      consider(0, METEOR_SIZE, w.metX[i] as number, w.metY[i] as number, lvl.meteorContour);
    }
  }
  return best;
}

/** Rechte Kante des nächsten Hindernisses links von `x0` in Zeile `row`, sonst 0. */
function leftEdge(w: World, x0: number, row: number): number {
  let best = 0;
  const lvl = w.level;
  for (let i = 0; i < w.tiles.capacity; i++) {
    if (!w.tiles.active[i]) continue;
    const t = lvl.tiles[w.tileType[i] as number]!;
    const tx = w.tileX[i] as number;
    const ty = w.tileY[i] as number;
    const edge = tx + t.w;
    if (row >= ty && row <= ty + t.h && edge <= x0 && edge > best) best = edge;
  }
  const consider = (base: number, rows: number, ex: number, ey: number, contours: Int16Array) => {
    const r = row - ey;
    if (r < 0 || r >= rows) return;
    const l = contours[base + r * 2] as number;
    const rr = contours[base + r * 2 + 1] as number;
    if (l > rr) return;
    const edge = ex + rr;
    if (edge <= x0 && edge > best) best = edge;
  };
  for (let i = 0; i < w.enemies.capacity; i++) {
    if (!w.enemies.active[i]) continue;
    const def = lvl.enemies[w.enType[i] as number]!;
    const rows = def.h + 1;
    consider(
      def.contour + (w.enFrame[i] as number) * rows * 2,
      rows,
      roundHalfEven(w.enX[i] as number),
      roundHalfEven(w.enY[i] as number),
      lvl.contours,
    );
  }
  for (let i = 0; i < w.meteors.capacity; i++) {
    if (w.meteors.active[i]) {
      consider(0, METEOR_SIZE, w.metX[i] as number, w.metY[i] as number, lvl.meteorContour);
    }
  }
  return best;
}

/**
 * Zwei Strahlen (Y+4 und Y+17), je 2L+1 Zeilen dick, bis zur nächsten Kante.
 * Vorn 1 Schaden je Zeile, hinten 2. `w.laserY/From/To` halten die Zeilen für den Renderer.
 */
export function updateLaser(w: World): void {
  w.laserRows = 0;
  if (!w.laser || w.dead) return;
  const L = w.stage;
  const front = w.pod === POD_FRONT;
  const x0 = w.px + 20;
  for (let j = 0; j < 2; j++) {
    for (let i = -L; i <= L; i++) {
      const row = w.py + 4 + i + 13 * j;
      let from: number;
      let to: number;
      if (front) {
        const r = rightEdge(w, x0, row);
        from = w.px + 42;
        to = r;
        if (hitTest(w, r, row, 1, 1, LASER_FRONT_DAMAGE, true, handlers) >= 0) {
          effect(w, Effect.ShotHit, r, row, 1, 1);
        }
      } else {
        const l = leftEdge(w, x0, row);
        from = l;
        to = w.px - 2;
        if (hitTest(w, l - 1, row, 1, 1, LASER_REAR_DAMAGE, true, handlers) >= 0) {
          effect(w, Effect.ShotHit, l - 1, row, 1, 1);
        }
      }
      const k = w.laserRows++;
      w.laserY[k] = row;
      w.laserFrom[k] = from;
      w.laserTo[k] = to;
      w.laserTier[k] = Math.abs(i) === L ? 2 : Math.abs(i) === L - 1 ? 1 : 0;
    }
  }
}

// ---------------------------------------------------------------- Options und Schild

function orbiter(w: World, i: number, dx: number, dy: number, absorbAll: boolean): void {
  // x = X + 17 ± 40·cos a (Double), y = FpI4(Y + 10 ± 30·sin a)
  const x = roundHalfEven(fxFromInt(w.px + 17) + dx);
  const y = roundHalfEven(fxFromInt(w.py + 10) + dy);
  w.orbX[i] = x;
  w.orbY[i] = y;
  for (let s = 0; s < w.eshots.capacity; s++) {
    if (!w.eshots.active[s]) continue;
    const kind = w.eshotKind[s] as 1 | 2;
    if (!absorbAll && kind !== 1) continue;
    const k = ESHOT[kind];
    if (
      boxHit(
        x,
        y,
        ORBITER_SIZE,
        ORBITER_SIZE,
        w.eshotX[s] as number,
        w.eshotY[s] as number,
        k.w,
        k.h,
      )
    ) {
      w.eshots.free(s);
      addScore(w, ABSORB_SCORE, true);
    }
  }
  if (hitTest(w, x, y, ORBITER_SIZE, ORBITER_SIZE, ORBITER_DAMAGE, false, handlers) >= 0) {
    effect(w, Effect.ShotHit, x, y, ORBITER_SIZE, ORBITER_SIZE);
  }
}

/** Schild (`0x483893`) ersetzt die Options; sonst kreisen bis zu zwei Options (`0x48492A`). */
export function updateOrbiters(w: World): void {
  w.orbCount = 0;
  if (w.dead) return;
  const rx = fxFromInt(ORBIT_RX);
  const ry = fxFromInt(ORBIT_RY);
  const at = (deg: number, sign: number) =>
    [sign * fxMul(rx, cosDeg(deg)), sign * fxMul(ry, sinDeg(deg))] as const;
  if (w.shield > 0) {
    w.shield--;
    w.shieldAngle = (w.shieldAngle + Math.min(17, w.shield + 5)) % 360;
    const a = w.shieldAngle;
    const points = [at(a, 1), at(a, -1), at(a + 90, 1), at(a + 90, -1)];
    points.forEach(([dx, dy], k) => orbiter(w, k, dx, dy, true));
    w.orbCount = 4;
    w.orbVisible = w.shield > 90 || w.shield % 3 === 1 ? 1 : 0;
    return;
  }
  if (w.optionCount === 0) return;
  w.orbitAngle = (w.orbitAngle + ORBIT_STEP) % 360;
  const [dx, dy] = at(w.orbitAngle, 1);
  orbiter(w, 0, dx, dy, false);
  if (w.optionCount >= 2) orbiter(w, 1, -dx, -dy, false);
  w.orbCount = w.optionCount;
  w.orbVisible = 1;
}

/** Tod mit Option „Waffenverlust“: Bombe, Farbe, Stufe und Options weg (`0x48F438`). */
export function loseEquipment(w: World): void {
  w.bomb = 0;
  w.colour = 0;
  w.stage = 0;
  w.optionCount = 0;
}

/** Bei jedem (Neu-)Start (`0x46E49E`). */
export function resetWeaponsOnRestart(w: World): void {
  w.beam = 0;
  w.charge = 0;
  w.pod = POD_FRONT;
  w.podDir = 1;
  w.shield = 0;
  w.laser = 0;
  w.orbitAngle = 0;
  w.fireTimer.fill(w.checkpoint);
}
