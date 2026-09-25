import { Effect, Sound, effect, killPlayer, sound, spawnExplosion } from "../actions";
import { FIELD_H, INVULN_DONE } from "../constants";
import { ShotKind, addEnemyShotForced } from "../enemyShots";
import { CUSTOM_PATTERN, spawnPatternEnemy } from "../spawn";
import type { BossScript, World } from "../world";
import { genericHit, setPart, typeByName } from "./common";

/**
 * Level 4 — E4 „14 - Endgegner“ (283×161, HP 10000), `Endgegner4` `0x463F10`,
 * Zustandstabelle `0x465764`, Strahl-Unterzustände `0x46577C`.
 *
 * Zähler (`Me.3A0` +1C…+28): c0 Unterzustand (+1C), c1 Zähler bzw. Richtung
 * (+20; im Strahl die Halbbreite), c2 Zähler (+24), c3 Verzögerung (+28).
 * Zustände: 0 Init, 1 Ufos, 2 gezielte Schüsse, 3 Strahl, 4 Angriffswahl, 5 Tod.
 */

/** „kleines Ufo“ (1-basiert), `AddFeind(13, 100)` bei `0x464133`. */
const UFO_REF = 13;
/** Strahlmitte relativ zu x, Oberkante und Höhe (Quell-Rect t 194…443 bzw. 161…410). */
const BEAM_DX = 142;
const BEAM_Y = 161;

function noEnemies(w: World): boolean {
  // `Me.45C = −1`: höchster belegter Gegnerslot — kein Gegner lebt mehr.
  return w.enemies.active.indexOf(1) < 0;
}

/** y läuft gegen 0: +2 unter 0, sonst −1 (`0x464174`, `0x46461D`). */
function towardsTop(w: World): number {
  const y = w.bossY[0] as number;
  const ny = y < 0 ? y + 2 : y - 1;
  w.bossY[0] = ny;
  return ny;
}

/** Schrittweite 3/2/1 je nach Abstand zum Ziel; 0 = schon da (`0x4644BD`). */
function approach(d: number): number {
  if (d < -20) return 3;
  if (d < -5) return 2;
  if (d < 0) return 1;
  if (d === 0) return 0;
  if (d > 20) return -3;
  if (d > 5) return -2;
  return -1;
}

/** Zustand 1: Ufo-Welle über das dynamische Pattern #100 (`0x464011`). */
function ufos(w: World): void {
  const c = w.bossC;
  switch (c[0]) {
    case 0: {
      if (towardsTop(w) !== 0) break;
      // Pattern #100 schreiben (`Me.40C + 0xA1B8`, `0x46420E`): Start, Einflug,
      // 10 Zufallspunkte (erst x, dann y je Punkt), Ausflug nach oben, Ende.
      const x = (w.bossX[0] as number) + 112;
      const px = w.customPathX;
      const py = w.customPathY;
      px[0] = x;
      py[0] = 128;
      px[1] = x;
      py[1] = 200;
      for (let i = 1; i <= 10; i++) {
        px[i + 1] = w.rnd.below(584);
        py[i + 1] = w.rnd.below(378);
      }
      px[12] = x;
      py[12] = -32;
      // Terminator: nur x = −1 wird geschrieben, y bleibt wie es war.
      px[13] = -1;
      w.customPathLen = 14;
      c[1] = 0;
      c[2] = 0;
      c[0] = 1;
      break;
    }
    case 1:
      // Alle 16 Ticks ein Ufo, 10 Stück (`0x4640DB`).
      if (c[2] === 10) {
        c[0] = 2;
      } else if (c[1] === 0) {
        c[1] = 15;
        if ((c[2] as number) < 10) {
          c[2] = (c[2] as number) + 1;
          spawnPatternEnemy(w, UFO_REF, CUSTOM_PATTERN);
        }
      } else {
        c[1] = (c[1] as number) - 1;
      }
      break;
    case 2: {
      // Hinaus nach oben bis y < −170, dann warten, bis kein Gegner mehr lebt (`0x46402A`).
      const y = w.bossY[0] as number;
      if (y >= -170) w.bossY[0] = y - 1;
      if ((w.bossY[0] as number) < -170 && noEnemies(w)) w.bossState = 4;
      break;
    }
  }
}

/** Zustand 2: nach (180, 225), dann steigen und alle 11 Ticks gezielt schießen (`0x46439A`). */
function aimed(w: World): void {
  const c = w.bossC;
  if (c[0] === 0) {
    let reached = 0;
    const dx = approach((w.bossX[0] as number) - 180);
    if (dx === 0) reached++;
    else w.bossX[0] = (w.bossX[0] as number) + dx;
    const dy = approach((w.bossY[0] as number) - 225);
    if (dy === 0) reached++;
    else w.bossY[0] = (w.bossY[0] as number) + dy;
    if (reached === 2) {
      c[0] = 1;
      c[1] = 0;
      c[2] = 0;
    }
    return;
  }
  const y = (w.bossY[0] as number) - 1;
  w.bossY[0] = y;
  if (c[1] === 0) {
    // `Me.634 = 1` um den Aufruf (`0x4643D6`): schießt auch bei „Gegner schießen: aus“.
    addEnemyShotForced(w, ShotKind.Aimed, (w.bossX[0] as number) + 140, y + 80);
    c[2] = (c[2] as number) + 1;
    c[1] = 10;
    if (c[2] === 30) w.bossState = 4;
  } else {
    c[1] = (c[1] as number) - 1;
  }
}

/**
 * Strahl zeichnen und prüfen (`0x464965` Aufbau, `0x464E8B` Abbau): Halbbreite
 * c1 um x+142, y 161…410. Getroffen wird nur horizontal
 * (`pX ≤ x+c1+142 And pX+40 ≥ x−c1+142`), wenn das Schiff lebt (`Not Me.644`)
 * und `Me.15C = 255` ist — kein y-Test wie im Original.
 */
function beamTick(w: World): void {
  const half = w.bossC[1] as number;
  const cx = (w.bossX[0] as number) + BEAM_DX;
  w.bossBeamX[0] = cx - half;
  w.bossBeamY[0] = BEAM_Y;
  w.bossBeamW[0] = 2 * half + 1;
  w.bossBeamH[0] = FIELD_H - BEAM_Y;
  if (w.px <= cx + half && w.px + 40 >= cx - half && !w.dead && w.invuln === INVULN_DONE) {
    killPlayer(w);
  }
}

/** Zustand 3: Strahl (`0x46460A`, Unterzustände 0…4). */
function beam(w: World): void {
  const c = w.bossC;
  switch (c[0]) {
    case 0:
      if (towardsTop(w) !== 0) break;
      c[0] = 1;
      c[1] = 0;
      // Zufallsverzug Int(Rnd·90) + 10.
      c[3] = w.rnd.below(90) + 10;
      break;
    case 1: {
      // Pendeln ±5 zwischen −100 und 460 (`0x46470A`).
      const x = (w.bossX[0] as number) + (c[1] === 0 ? -5 : 5);
      w.bossX[0] = x;
      if (x <= -100) c[1] = 1;
      if (x >= 460) c[1] = 0;
      if (c[3] === 0) {
        // Spieler unter dem Emitter: x+100 < pX+35 And x+171 > pX.
        if (x + 100 < w.px + 35 && x + 171 > w.px) {
          c[0] = 2;
          c[3] = 30;
        }
      } else {
        c[3] = (c[3] as number) - 1;
      }
      break;
    }
    case 2:
      // 30 Ticks Laden, dann Sound (Index 16 „end3“, `Me.24C + 0x40`) und Strahl.
      if (c[3] === 0) {
        sound(w, Sound.End3);
        c[0] = 3;
        c[1] = 0;
        c[2] = 35;
        c[3] = 30;
      } else {
        c[3] = (c[3] as number) - 1;
      }
      break;
    case 3:
      beamTick(w);
      // Aufbau 0→35, dann 30 Ticks halten (`0x464DD7`).
      if (c[1] === 35) {
        if (c[3] === 0) {
          c[0] = 4;
          c[1] = 35;
        } else {
          c[3] = (c[3] as number) - 1;
        }
      } else {
        c[1] = (c[1] as number) + 1;
      }
      break;
    case 4:
      beamTick(w);
      // Abbau 35→0, dann Angriffswahl (`0x4652FD`).
      if (c[1] === 0) w.bossState = 4;
      else c[1] = (c[1] as number) - 1;
      break;
  }
}

/**
 * Zustand 5 (`0x465364`): Kreis bei Rnd < 0,1 fest an (x+140, y+80) mit Radius
 * `Int(Rnd·70)+30` (nur ein Rnd), Explosion an (x+Int(Rnd·230), y+Int(Rnd·110)),
 * Partikel bis (x+280, y+160), `Me.264 = True`.
 */
function dying(w: World): void {
  const x = w.bossX[0] as number;
  const y = w.bossY[0] as number;
  if (w.rnd.less(0.1)) {
    const r = w.rnd.below(70) + 30;
    effect(w, Effect.Crash, x + 140 - r, y + 80 - r, 2 * r, 2 * r);
  }
  const ex = x + w.rnd.below(230);
  const ey = y + w.rnd.below(110);
  spawnExplosion(w, ex, ey);
  effect(w, Effect.ShotHit, x, y, 280, 160);
  w.levelDone = true;
}

export const boss4: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    // Der Strahl wird nur in den Unterzuständen 3/4 gezeichnet.
    w.bossBeamW[0] = 0;
    switch (w.bossState) {
      case 0:
        setPart(w, 0, typeByName(w, "14 - Endgegner"), 180, -160, 10000);
        w.bossState = 4;
        c[0] = 0;
        break;
      case 1:
        ufos(w);
        break;
      case 2:
        aimed(w);
        break;
      case 3:
        beam(w);
        break;
      case 4:
        // Angriffswahl Int(Rnd·3)+1 (`0x465316`); c2/c3 bleiben stehen.
        w.bossState = w.rnd.below(3) + 1;
        c[0] = 0;
        c[1] = 0;
        break;
      default:
        dying(w);
    }
    // Gemeinsames Ende (`0x46567F`): HP ≤ 0 → Zustand 5 und sofort +10000
    // (`VarAdd` direkt auf `Me.104`, ohne Punktefaktor).
    if ((w.bossHP[0] as number) <= 0 && w.bossState !== 5) {
      w.bossState = 5;
      if (!w.bossScored) {
        w.bossScored = 1;
        w.score += 10000;
      }
    }
  },
  hit: genericHit,
};
