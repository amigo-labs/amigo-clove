import { fxFromInt } from "@clove/core";
import { Sound, killPlayer, sound } from "../actions";
import { INVULN_DONE, SCREEN_W } from "../constants";
import { RECT_FIREBALL, RECT_MISSILE, ShotKind, addBossShot, addEnemyShot } from "../enemyShots";
import { idiv, roundHalfEven } from "../math";
import { sinDeg } from "../trig";
import type { BossScript, World } from "../world";
import { dyingTick, finishBoss, genericHit, setPart, typeByName } from "./common";

/**
 * Level 10 — E10 „1“ (330×302, HP 19020), `Endgegner10` `0x46B890`
 * (Sprungtabelle der Zustände `0x46DCBC`).
 *
 * Zähler: c0 = `+1C` (Schuss-/Phasenzähler), c1 = `+20` (Winkel x bzw. vy),
 * c2 = `+24` (Winkel y). Zustand 100 = Explosion.
 */
const C_TICK = 0;
const C_A = 1;
const C_B = 2;
const DYING = 100;
const HP = 19020;
/** Mittellinie des Spielfelds: y = 205 − h/2. */
const MID_Y = 205;

/**
 * Die drei Kanonenbänder (`0x46BEF1`, `0x46C411`, `0x46C945`): rechter Rand x + r,
 * linker Rand x + l − 10·c (≥ 0), oben/unten y + t / y + b. Reihenfolge wie im
 * Original: Mitte, unten, oben.
 */
const BEAMS: readonly (readonly [r: number, l: number, t: number, b: number])[] = [
  [104, 504, 121, 189],
  [244, 644, 247, 289],
  [188, 588, 13, 63],
];

/** Raketen bei c = 200 (`0x46D371`): Startpunkt relativ zum Boss. */
const MISSILES: readonly (readonly [dx: number, dy: number])[] = [
  [188, 20],
  [104, 140],
  [244, 255],
];

/**
 * Helfer direkt in die Gegnerslots 0…3 (`0x46D72A`, überschreibt belegte Slots
 * wie das Original): Typ „2“, HP/Punkte aus dem Typ, vx = −Tempo (für
 * Code −1/−2 bedeutungslos).
 */
function putMinion(w: World, slot: number, type: number, x: number, y: number, code: number) {
  const def = w.level.enemies[type]!;
  w.enemies.active[slot] = 1;
  w.enType[slot] = type;
  w.enPattern[slot] = code;
  w.enHP[slot] = def.hp;
  w.enPoints[slot] = def.hp;
  w.enFrame[slot] = 0;
  w.enAnim[slot] = 0;
  w.enWaypoint[slot] = 0;
  w.enShotTimer[slot] = 0;
  w.enAux[slot] = 0;
  w.enX[slot] = fxFromInt(x);
  w.enY[slot] = fxFromInt(y);
  w.enVX[slot] = -def.speedFx;
  w.enVY[slot] = 0;
}

/** Strahlen: Rechteck setzen und gegen das Schiff prüfen (`0x46BF71`…). */
function beams(w: World, c: number): void {
  const x = w.bossX[0] as number;
  const y = w.bossY[0] as number;
  for (let k = 0; k < BEAMS.length; k++) {
    const [r, l0, t, b] = BEAMS[k]!;
    const right = x + r;
    const left = Math.max(0, x - 10 * c + l0);
    const top = y + t;
    const bottom = y + b;
    w.bossBeamX[k] = left;
    w.bossBeamY[k] = top;
    w.bossBeamW[k] = right - left;
    w.bossBeamH[k] = bottom - top;
    // Treffer: pY+3 ≤ B, pY+14 ≥ T, pX+4 ≤ R, pX+36 ≥ L, lebt, nicht unverwundbar.
    if (
      !w.dead &&
      w.invuln === INVULN_DONE &&
      w.py + 3 <= bottom &&
      w.py + 14 >= top &&
      w.px + 4 <= right &&
      w.px + 36 >= left
    ) {
      killPlayer(w);
    }
  }
}

export const boss10: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    w.bossBeamW.fill(0);
    const type = w.bossState === 0 ? typeByName(w, "1") : (w.bossType[0] as number);
    const bw = w.level.enemies[type]!.w;
    const bh = w.level.enemies[type]!.h;
    const halfH = idiv(bh, 2);
    switch (w.bossState) {
      case 0:
        // `0x46B9D7`: x = 640, y = 205 − h/2
        setPart(w, 0, type, SCREEN_W, MID_Y - halfH, HP);
        w.bossState = 1;
        c[C_TICK] = 0;
        break;
      case 1: {
        // Einflug bis x = 640 − w (`0x46BA18`), alle 20 Ticks gezielter Schuss.
        const x = w.bossX[0] as number;
        if (x > SCREEN_W - bw) {
          w.bossX[0] = x - 2;
        } else {
          w.bossState = 2;
          c[C_A] = 90;
          c[C_B] = 0;
        }
        c[C_TICK] = (c[C_TICK] as number) + 1;
        if ((c[C_TICK] as number) >= 20) {
          c[C_TICK] = 0;
          addEnemyShot(w, ShotKind.Aimed, w.bossX[0] as number, (w.bossY[0] as number) + halfH - 4);
        }
        break;
      }
      case 2: {
        // `0x46BB12`: Schuss + Feuerball alle 20 Ticks, x/y auf Sinusbahn.
        c[C_TICK] = (c[C_TICK] as number) + 1;
        if ((c[C_TICK] as number) >= 20) {
          c[C_TICK] = 0;
          const x = w.bossX[0] as number;
          const y = w.bossY[0] as number;
          addEnemyShot(w, ShotKind.Aimed, x, y + halfH - 4);
          addBossShot(w, ShotKind.Fireball, x, y + halfH - 7, -5, 0, RECT_FIREBALL);
        }
        c[C_A] = (c[C_A] as number) + 2;
        if ((c[C_A] as number) >= 450) {
          w.bossX[0] = SCREEN_W - bw;
          w.bossState = 3;
          c[C_A] = 1;
        } else {
          // x = I4(sin(a mod 360)·50 + (590 − w))
          w.bossX[0] = roundHalfEven(fxFromInt(590 - bw) + 50 * sinDeg((c[C_A] as number) % 360));
        }
        c[C_B] = (c[C_B] as number) + 3;
        if ((c[C_B] as number) >= 360) w.bossY[0] = MID_Y - halfH;
        // y = FpI4(h/2 · sin(b) + (205 − h/2)), eine Periode
        else
          w.bossY[0] = roundHalfEven(fxFromInt(MID_Y - halfH) + halfH * sinDeg(c[C_B] as number));
        break;
      }
      case 3: {
        // `0x46BE08`: y += vy, Umkehr nur an der unteren Kante (y ≥ 205).
        const y = (w.bossY[0] as number) + (c[C_A] as number);
        w.bossY[0] = y;
        if (y >= MID_Y) c[C_A] = -(c[C_A] as number);
        const py = w.py;
        if (
          (py > y + 13 && py + 20 < y + 63) ||
          (py > y + 121 && py + 20 < y + 189) ||
          (py > y + 247 && py + 20 < y + 289)
        ) {
          w.bossState = 4;
          c[C_TICK] = 0;
        }
        break;
      }
      case 4: {
        // `0x46BE89`: c = 40 Ladesound (Index 16), 41…150 Strahlen, 200 Raketen.
        const t = (c[C_TICK] as number) + 1;
        c[C_TICK] = t;
        if (t === 40) {
          sound(w, Sound.End3);
        } else if (t >= 41 && t <= 150) {
          beams(w, t);
        } else if (t === 200) {
          const x = w.bossX[0] as number;
          const y = w.bossY[0] as number;
          for (const [dx, dy] of MISSILES) {
            addBossShot(w, ShotKind.Straight, x + dx, y + dy, -4, 0, RECT_MISSILE);
          }
          w.bossState = 5;
        }
        break;
      }
      case 5: {
        // `0x46D719`: Abflug x += 1 bis 700, dann vier Verfolger aus den Ecken.
        const x = w.bossX[0] as number;
        if (x < 700) {
          w.bossX[0] = x + 1;
        } else {
          w.bossY[0] = MID_Y - halfH;
          w.bossState = 6;
          const mt = typeByName(w, "2");
          const def = w.level.enemies[mt]!;
          putMinion(w, 0, mt, 0, -def.h, -2);
          putMinion(w, 1, mt, SCREEN_W - def.w, -def.h, -2);
          putMinion(w, 2, mt, SCREEN_W - def.w, 410, -1);
          putMinion(w, 3, mt, 0, 410, -1);
        }
        break;
      }
      case 6:
        // `0x46DC0F`: warten bis kein Gegner mehr lebt (`Me.45C = −1`).
        if (w.enemies.active.indexOf(1) < 0) w.bossState = 1;
        break;
      default:
        break;
    }
    // `0x46CED7`: Tod prüfen, danach jeden Tick Explosionen.
    if ((w.bossHP[0] as number) <= 0) {
      if (w.bossState < DYING) {
        // Punkte + 10000 · Faktor (addScore multipliziert), `Me.264 = True`.
        // Level 10 multipliziert mit dem Punktefaktor (+10000·Me.638).
        finishBoss(w, 10000, true);
        w.bossState = DYING;
      }
      dyingTick(w, 0, bw - 40, bh - 40, bw, bh);
    }
  },
  hit: genericHit,
};
