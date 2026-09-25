import { fxFromInt } from "@clove/core";
import { Effect, Sound, effect, sound, spawnExplosion } from "../actions";
import { RECT_BULLET, RECT_MISSILE, ShotKind, addBossShot } from "../enemyShots";
import { idiv, roundHalfEven } from "../math";
import { sinDeg } from "../trig";
import type { BossScript, World } from "../world";
import { bossRowHit, damagePart, partHeight, partWidth, setPart, typeByName } from "./common";

// ------------------------------------------------------------------ gemeinsame Helfer (E2, E3, E6)
//
// Diese Helfer gehören eigentlich nach `common.ts`; sie liegen hier, weil die Bossdateien
// parallel entstehen. E3 und E6 importieren sie aus dieser Datei.

/**
 * Ein Teil wird zerstört (Geschütze von E2 `0x4497A5`, Fische von E3 `0x44BE89`): 150
 * Partikel, Kreis um den Mittelpunkt (Radius 70), vier Explosionen an (x, y), (x+40, y),
 * (x, y+40), (x+40, y+40), Explosionssound mit Zufalls-Pan `Int(Rnd·101) − 50`. Das Original
 * würfelt den Pan nur bei eingeschaltetem Sound; der Port würfelt immer (wie bei Gegnern).
 */
export function killBossPart(w: World, part: number): void {
  const x = w.bossX[part] as number;
  const y = w.bossY[part] as number;
  const pw = partWidth(w, part);
  const ph = partHeight(w, part);
  effect(w, Effect.EnemyKill, x, y, pw, ph);
  const cx = x + idiv(pw, 2);
  const cy = y + idiv(ph, 2);
  effect(w, Effect.Crash, cx - 70, cy - 70, 140, 140);
  spawnExplosion(w, x, y);
  spawnExplosion(w, x + 40, y);
  spawnExplosion(w, x, y + 40);
  spawnExplosion(w, x + 40, y + 40);
  sound(w, Sound.Explosion, w.rnd.below(101) - 50);
  w.bossVisible[part] = 0;
}

/**
 * Ein Tick der Todessequenz von E2 (`0x4618B4`) und E6 (`0x463A2C`): bei Rnd < 0,1 ein Kreis
 * an (x + Rnd·w, y + Rnd·h) mit Radius `Int(Rnd·70) + 30`; eine Explosion an
 * (x + Int(Rnd·(w−40)), y + Int(Rnd·(h−40))) — der erste Rnd gehört zu x —; Partikel im
 * Rechteck (x, y)–(x+w, y+h).
 */
export function bossDeathTick(w: World, part: number): void {
  const x = w.bossX[part] as number;
  const y = w.bossY[part] as number;
  const pw = partWidth(w, part);
  const ph = partHeight(w, part);
  if (w.rnd.less(0.1)) {
    // Nur Darstellung; das Original rechnet Rnd·w ohne Int — die drei Rnd-Aufrufe zählen.
    const cx = x + w.rnd.below(pw);
    const cy = y + w.rnd.below(ph);
    const r = w.rnd.below(70) + 30;
    effect(w, Effect.Crash, cx - r, cy - r, 2 * r, 2 * r);
  }
  const ex = x + w.rnd.below(pw - 40);
  const ey = y + w.rnd.below(ph - 40);
  spawnExplosion(w, ex, ey);
  effect(w, Effect.ShotHit, x, y, pw, ph);
}

/**
 * Sieg: einmalig `Me.104 += 10000` — **ohne** Punktefaktor (nur E10 multipliziert mit
 * `Me.638`) und ohne Sound —, dann `Me.264 = True`.
 */
export function bossVictory(w: World): void {
  if (!w.bossScored) {
    w.bossScored = 1;
    w.score += 10000;
  }
  w.levelDone = true;
}

// ------------------------------------------------------------------ Level 2

/**
 * Zähler (`Me.3A0` + Offset): c0 +1C vx Geschütz A, c1 +20 vx Geschütz B, c2 +24
 * Geschütztimer, c3 +28 Winkel des Hauptteils, c4 +2C Raketenzähler, c5 +4C Framezähler,
 * c6 +50 Frame (gilt für beide Geschütze).
 */
const A_VX = 0;
const B_VX = 1;
const TIMER = 2;
const ANGLE = 3;
const MISSILE = 4;
const FRAME_CNT = 5;
const FRAME = 6;

/** Geschütz A („7 - End oben“) ist Teil 1, B („8 - End unten“) Teil 2. */
const A = 1;
const B = 2;

function stateMove(w: World): void {
  const c = w.bossC;
  // Timer +1/Tick, +2 bei Haupt-HP ≤ 1000 (`0x461418`).
  const t = (c[TIMER] as number) + ((w.bossHP[0] as number) <= 1000 ? 2 : 1);
  c[TIMER] = t;
  if (t >= 0 && t <= 51) {
    // Geschütze bewegen sich; Umkehr bei x < −50 oder x > 505 (`0x461446`).
    const ax = (w.bossX[A] as number) + (c[A_VX] as number);
    const bx = (w.bossX[B] as number) + (c[B_VX] as number);
    w.bossX[A] = ax;
    w.bossX[B] = bx;
    if (ax < -50 || ax > 505) c[A_VX] = -(c[A_VX] as number);
    if (bx < -50 || bx > 505) c[B_VX] = -(c[B_VX] as number);
  } else if (t === 52) {
    // Lebende Geschütze feuern je eine Kugel senkrecht (`AddEndS` Typ 2, `0x461498`).
    if ((w.bossHP[A] as number) > 0) {
      const x = (w.bossX[A] as number) + 58;
      const y = (w.bossY[A] as number) + 62;
      addBossShot(w, ShotKind.Fireball, x, y, 0, 4, RECT_BULLET);
    }
    if ((w.bossHP[B] as number) > 0) {
      const x = (w.bossX[B] as number) + 58;
      addBossShot(w, ShotKind.Fireball, x, w.bossY[B] as number, 0, -4, RECT_BULLET);
    }
  } else if (t >= 66) {
    // Bei +2 und ungeradem Timer wird die 52 übersprungen: dann feuert erst der nächste Zyklus.
    c[TIMER] = 0;
  }
  // Hauptteil: Winkel +4°, y = FpI4(sin·70 + 140) (`0x461688`, Tabelle `Me.668`).
  let a = (c[ANGLE] as number) + 4;
  if (a >= 360) a = 0;
  c[ANGLE] = a;
  w.bossY[0] = roundHalfEven(sinDeg(a) * 70 + fxFromInt(140));
  // Alle 200 Ticks zwei Raketen (`AddEndS` Typ 3, vx −4, `0x4616D7`).
  const m = (c[MISSILE] as number) + 1;
  c[MISSILE] = m;
  if (m >= 200) {
    c[MISSILE] = 0;
    const x = (w.bossX[0] as number) + 120;
    const y = w.bossY[0] as number;
    addBossShot(w, ShotKind.Straight, x, y + 5, -4, 0, RECT_MISSILE);
    addBossShot(w, ShotKind.Straight, x, y + 118, -4, 0, RECT_MISSILE);
  }
}

/**
 * Level 2 — E2 (`0x4612C0`): Hauptteil „6 - Endgegner“ (165×142, HP 6000, Teil 0) und zwei
 * Geschütze „7 - End oben“/„8 - End unten“ (HP je 1500, Teile 1/2; Typ = Haupttyp + 1/+2).
 * Der Hauptteil wird stets mit Frame 0 gezeichnet und getestet, die Geschütze mit dem
 * gemeinsamen Wechselframe `+50`.
 */
export const boss2: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    switch (w.bossState) {
      case 0: {
        // `0x461359`; +2C und +4C setzt das Original nicht zurück (hier 0 vom Neustart).
        const main = typeByName(w, "6 - Endgegner");
        setPart(w, 0, main, 640, 140, 6000);
        setPart(w, A, main + 1, -130, 0, 1500);
        setPart(w, B, main + 2, -130, 340, 1500);
        c[A_VX] = -3;
        c[B_VX] = 2;
        c[TIMER] = 0;
        c[ANGLE] = 0;
        c[FRAME] = 0;
        w.bossState = 1;
        break;
      }
      case 1:
        // Einflug (`0x4613C4`): Haupt x −= 1 bis x ≤ 640 − w = 475, Geschütze x += 1.
        w.bossX[A] = (w.bossX[A] as number) + 1;
        w.bossX[0] = (w.bossX[0] as number) - 1;
        w.bossX[B] = (w.bossX[B] as number) + 1;
        if ((w.bossX[0] as number) <= 640 - partWidth(w, 0)) w.bossState = 2;
        break;
      case 2:
        stateMove(w);
        break;
      default:
        // Zustand 3 (`0x4618B4`): Explosionen, Geschütze driften auseinander.
        bossDeathTick(w, 0);
        w.bossY[A] = (w.bossY[A] as number) - 1;
        w.bossY[B] = (w.bossY[B] as number) + 1;
    }
    // In jedem Zustand (`0x461CE3`): Framewechsel alle 5 Ticks, Zeichnen nur lebender Geschütze.
    const fc = (c[FRAME_CNT] as number) + 1;
    c[FRAME_CNT] = fc;
    if (fc > 4) {
      c[FRAME_CNT] = 0;
      c[FRAME] = 1 - (c[FRAME] as number);
    }
    w.bossFrame[0] = 0;
    w.bossFrame[A] = c[FRAME] as number;
    w.bossFrame[B] = c[FRAME] as number;
    w.bossVisible[A] = (w.bossHP[A] as number) > 0 ? 1 : 0;
    w.bossVisible[B] = (w.bossHP[B] as number) > 0 ? 1 : 0;
    // Haupt-HP ≤ 0 → Zustand 3, +10000, `Me.264` (`0x461E06`).
    if ((w.bossHP[0] as number) <= 0 && w.bossState !== 3) {
      w.bossState = 3;
      bossVictory(w);
    }
  },

  /**
   * `0x449350`: A (wenn HP > 0), dann B, dann der Hauptteil. Geschütze: `HP −= Schaden` ohne
   * Funken und ohne Sonderfall 500; HP > 0 → 0, sonst Überschuss −HP und Zerstörung. Der
   * Hauptteil ist jederzeit verwundbar (gemeinsamer Schluss mit Funken und Beam-Budget).
   */
  hit(w, bx, by, bw, bh, damage) {
    for (let p = A; p <= B; p++) {
      if ((w.bossHP[p] as number) <= 0 || !bossRowHit(w, p, bx, by, bw, bh)) continue;
      const hp = (w.bossHP[p] as number) - damage;
      w.bossHP[p] = hp;
      if (hp > 0) return 0;
      killBossPart(w, p);
      return -hp;
    }
    if (!bossRowHit(w, 0, bx, by, bw, bh)) return -1;
    damagePart(w, 0, damage, bx, by);
    return 0;
  },
};
