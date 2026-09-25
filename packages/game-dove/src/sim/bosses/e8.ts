import { Effect, effect, spawnExplosion } from "../actions";
import { roundHalfEven } from "../math";
import { spawnEnemyAt } from "../spawn";
import { cosDeg } from "../trig";
import type { BossScript, World } from "../world";
import { damagePart, partContourHit, setPart, typeByName } from "./common";

/**
 * Level 8 — E8 Kern „21 - real Endgegner“ (108×154, HP 15000) als Teil 0 und
 * die unverwundbare Hülle „20 - Endgegner“ (182×216) als Teil 1,
 * `Endgegner8` `0x46A4C0`, Zustandstabelle `0x46B868`.
 *
 * Zähler (`Me.3A0` +1C…+28): c0 Minentakt (+1C, 0 = aus), c1 Winkel a1 (+20),
 * c2 Winkel a2 (+24), c3 Phasenzähler (+28). Zustände: 0 Init, 1 Einflug,
 * 2 Lissajous + Minen, 3 Hülle fährt ein, 4 Sog, 5 Hülle fährt ab, 6 Tod.
 */

/** x der Hülle, wenn sie nicht da ist (`Me.3A8 = −1000`). */
const ABSENT = -1000;

const FX_ONE = 1 << 16;

/** `FpI4(cos(a)·k + d)` mit der Gradtabelle `Me.684`, in Q16.16. */
function cosLine(a: number, k: number, d: number): number {
  return roundHalfEven(cosDeg(a) * k + d * FX_ONE);
}

function setShellX(w: World, x: number): void {
  w.bossX[1] = x;
  w.bossVisible[1] = x > ABSENT ? 1 : 0;
}

/**
 * Sog-Partikel aus der Hülle (`Addpartikel` bei `0x46A8AC` ff.): Ströme von
 * (hx, hy+50) bis (hx, hy+98) und (hx, hy+120) bis (hx, hy+168). Nur Darstellung.
 */
function vacuumParticles(w: World): void {
  const hx = w.bossX[1] as number;
  const hy = w.bossY[1] as number;
  effect(w, Effect.ShotHit, hx, hy + 50, 1, 48);
  effect(w, Effect.ShotHit, hx, hy + 120, 1, 48);
}

/** Zustand 4 (`0x46A7BB`): Sog nach rechts, Kern folgt pY − 66 mit cos-Wackeln. */
function vacuum(w: World): void {
  const c = w.bossC;
  const t = (c[3] as number) + 1;
  c[3] = t;
  if (t > 30 && t < 950) {
    if (t < 100) {
      // (c − 30) \ 10 — hier immer positiv.
      w.px += Math.trunc((t - 30) / 10);
      vacuumParticles(w);
    } else {
      w.px += 7;
      vacuumParticles(w);
      if (t > 650) {
        w.px += 1;
        vacuumParticles(w);
      }
      if (t > 700) {
        w.px += 1;
        vacuumParticles(w);
      }
    }
  }
  // 1050 (0x41A) Ticks, dann fährt die Hülle ab.
  if (t === 1050) w.bossState = 5;
  const target = w.py - 66;
  const y = w.bossY[0] as number;
  if (y + 10 < target) w.bossY[0] = y + 10;
  else if (y - 10 > target) w.bossY[0] = y - 10;
  else w.bossY[0] = target;
  const a = (c[1] as number) + 4;
  c[1] = a >= 360 ? 0 : a;
  const ny = cosLine(c[1] as number, 9, w.bossY[0] as number);
  w.bossY[0] = ny;
  // Die Hülle hängt 33 px über dem Kern (`0x46AE95` → `0x46B332`).
  w.bossY[1] = ny - 33;
}

/**
 * Zustand 6 (`0x46B042`): Kreis bei Rnd < 0,1 (drei Rnd: x + Rnd·105,
 * y + Rnd·155, Radius `Int(Rnd·70)+30`), Explosion an (x+Int(Rnd·65),
 * y+Int(Rnd·115)), Partikel bis (x+105, y+155); die Hülle sinkt 1 px/Tick.
 */
function dying(w: World): void {
  const x = w.bossX[0] as number;
  const y = w.bossY[0] as number;
  if (w.rnd.less(0.1)) {
    const cx = x + w.rnd.below(105);
    const cy = y + w.rnd.below(155);
    const r = w.rnd.below(70) + 30;
    effect(w, Effect.Crash, cx - r, cy - r, 2 * r, 2 * r);
  }
  const ex = x + w.rnd.below(65);
  const ey = y + w.rnd.below(115);
  spawnExplosion(w, ex, ey);
  effect(w, Effect.ShotHit, x, y, 105, 155);
  w.bossY[1] = (w.bossY[1] as number) + 1;
}

/**
 * Mine (Typ 22, Code 0, vx = −p4 = −7) an (x+10, y+72); das Original sucht ab
 * `Me.458` den ersten freien Slot (`0x46B4AB`) — wie `HintPool.alloc`.
 */
function layMine(w: World): void {
  const type = typeByName(w, "22 - Endg Mine");
  const speed = w.level.enemies[type]!.speedFx;
  spawnEnemyAt(w, type, (w.bossX[0] as number) + 10, (w.bossY[0] as number) + 72, 0, -speed, 0);
}

export const boss8: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    switch (w.bossState) {
      case 0:
        setPart(w, 0, typeByName(w, "21 - real Endgegner"), 640, 315, 15000);
        setPart(w, 1, typeByName(w, "20 - Endgegner"), ABSENT, ABSENT, 0);
        setShellX(w, ABSENT);
        w.bossState = 1;
        c[0] = 0;
        c[1] = 0;
        c[2] = 0;
        // +28 bekommt beim Init die Option `Me.634` und dient dann als
        // Phasenzähler: die erste Lissajous-Phase ist um diesen Wert kürzer.
        c[3] = w.shotOption;
        break;
      case 1:
        // Einflug: x −= 5 bis 535 (`0x46A5C4`), dann Minen an.
        w.bossX[0] = (w.bossX[0] as number) - 5;
        if (w.bossX[0] === 535) {
          w.bossState = 2;
          c[0] = 1;
        }
        break;
      case 2: {
        // Lissajous (`0x46A5EB`): y = FpI4(cos(a1)·187 + 128), a1 += 4°;
        // x = FpI4(cos(a2)·100 + 435), a2 += 3°.
        const a1 = (c[1] as number) + 4;
        c[1] = a1 === 360 ? 0 : a1;
        w.bossY[0] = cosLine(c[1] as number, 187, 128);
        const a2 = (c[2] as number) + 3;
        c[2] = a2 === 360 ? 0 : a2;
        w.bossX[0] = cosLine(c[2] as number, 100, 435);
        c[3] = (c[3] as number) + 1;
        if ((c[3] as number) >= 1000) {
          w.bossState = 3;
          setShellX(w, -190);
          w.bossY[1] = 95;
          c[0] = 0;
        }
        break;
      }
      case 3: {
        // Kern parkt bei (533, 128), die Hülle gleitet mit +3 bis 441 (`0x46A687`).
        let moved = false;
        if ((w.bossX[0] as number) < 533) {
          w.bossX[0] = (w.bossX[0] as number) + 1;
          moved = true;
        }
        if ((w.bossY[0] as number) < 128) {
          w.bossY[0] = (w.bossY[0] as number) + 1;
          moved = true;
        }
        if ((w.bossX[0] as number) > 533) {
          w.bossX[0] = (w.bossX[0] as number) - 1;
          moved = true;
        }
        if ((w.bossY[0] as number) > 128) {
          w.bossY[0] = (w.bossY[0] as number) - 1;
          moved = true;
        }
        const hx = (w.bossX[1] as number) + 3;
        if (hx < 441) {
          setShellX(w, hx);
        } else {
          setShellX(w, 441);
          if (!moved) {
            w.bossState = 4;
            c[3] = 0;
          }
        }
        break;
      }
      case 4:
        vacuum(w);
        break;
      case 5: {
        // Kern zurück nach (535, 315), Hülle fährt mit −8 ab (`0x46AE9D`).
        let moved = false;
        if ((w.bossX[0] as number) < 535) {
          w.bossX[0] = (w.bossX[0] as number) + 1;
          moved = true;
        }
        if ((w.bossY[0] as number) < 205) {
          w.bossY[0] = (w.bossY[0] as number) + 2;
          moved = true;
        }
        if ((w.bossY[0] as number) < 305) {
          w.bossY[0] = (w.bossY[0] as number) + 1;
          moved = true;
        }
        if ((w.bossY[0] as number) < 315) {
          w.bossY[0] = (w.bossY[0] as number) + 1;
          moved = true;
        }
        if ((w.bossX[0] as number) > 535) {
          w.bossX[0] = (w.bossX[0] as number) - 1;
          moved = true;
        }
        if ((w.bossY[0] as number) > 315) {
          w.bossY[0] = (w.bossY[0] as number) - 1;
          moved = true;
        }
        const hx = (w.bossX[1] as number) - 8;
        if (hx > -180) {
          setShellX(w, hx);
        } else {
          setShellX(w, ABSENT);
          if (!moved) {
            w.bossState = 2;
            c[0] = 1;
            c[1] = 0;
            c[2] = 0;
            c[3] = 0;
          }
        }
        break;
      }
      default:
        dying(w);
    }
    // Gemeinsames Ende (`0x46B42F`): HP ≤ 0 und `Me.264` nicht gesetzt →
    // Zustand 6, Minen aus, +10000 (ohne Punktefaktor), `Me.264 = True`.
    if ((w.bossHP[0] as number) <= 0 && !w.levelDone) {
      w.bossState = 6;
      c[0] = 0;
      if (!w.bossScored) {
        w.bossScored = 1;
        w.score += 10000;
      }
      w.levelDone = true;
    }
    // Minen alle 4 Ticks, solange c0 > 0 (`0x46B493`).
    if ((c[0] as number) > 0) {
      c[0] = (c[0] as number) + 1;
      if ((c[0] as number) >= 5) {
        c[0] = 1;
        layMine(w);
      }
    }
  },
  /**
   * Trefferprüfung `0x44F726`: ist die Hülle da (x > −1000), schluckt sie den
   * Schuss ohne Schaden und ohne Funken (Ergebnis 0, `0x452069`); sonst
   * Kontur des Kerns, Schaden wie beim gemeinsamen Test.
   */
  hit(w: World, bx: number, by: number, bw: number, bh: number, damage: number): number {
    if ((w.bossX[1] as number) > ABSENT && partContourHit(w, 1, bx, by, bw, bh)) return 0;
    if (!partContourHit(w, 0, bx, by, bw, bh)) return -1;
    damagePart(w, 0, damage, bx, by);
    return 0;
  },
};
