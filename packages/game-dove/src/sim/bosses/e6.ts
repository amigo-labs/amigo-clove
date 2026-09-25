import { Sound, sound, spawnExplosion } from "../actions";
import { INVULN_DONE } from "../constants";
import { ShotKind, addEnemyShot } from "../enemyShots";
import type { BossScript, World } from "../world";
import { damagePart, partHeight, setPart, typeByName } from "./common";
import { bossRowHit } from "./common";
import { bossDeathTick, bossVictory } from "./e2";

/**
 * Zähler (`Me.3A0` + Offset): c0 +1C (Phase 1: Richtung y, 1 = abwärts; Phase 2: Ablaufzähler),
 * c1 +20 Unterzustand Phase 1 (0 Patrouille, 1…10 Anlauf, 11 Dash, 12 Rückkehr), c2 +24
 * Flag „Phase 3 läuft“, c3 +28 Abklingzeit bis zum nächsten Dash.
 */
const DIR = 0;
const SUB = 1;
const PHASE3 = 2;
const COOLDOWN = 3;

const HP_PHASE1 = 4500;
const HP_PHASE2 = 1200;

/** Explosion bei HP ≤ 0: (x + Int(Rnd·230), y + Int(Rnd·100)) — der erste Rnd gehört zu x. */
function dyingExplosion(w: World): void {
  const ex = (w.bossX[0] as number) + w.rnd.below(230);
  const ey = (w.bossY[0] as number) + w.rnd.below(100);
  spawnExplosion(w, ex, ey);
}

/** Phase 3 = Phase 1 erneut (`0x4634C8`, `0x463825`): Typ 8, x = 640, HP 4500; y bleibt. */
function startPhase3(w: World, t8: number): void {
  w.bossC[PHASE3] = 1;
  w.bossState = 1;
  w.bossType[0] = t8;
  w.bossX[0] = 640;
  w.bossFrame[0] = 0;
  w.bossHP[0] = HP_PHASE1;
  w.bossHPMax[0] = HP_PHASE1;
}

/** Zustand 2 (`0x462F4E`): Patrouille, Anlauf, Dash nach links, Rückkehr. */
function phase1(w: World): void {
  const c = w.bossC;
  const sub = c[SUB] as number;
  if (sub === 0) {
    // y ± 4 zwischen 0 und 410 − h = 225.
    let y = (w.bossY[0] as number) + ((c[DIR] as number) === 1 ? 4 : -4);
    w.bossY[0] = y;
    if (y <= 0) c[DIR] = 1;
    if (y >= 410 - partHeight(w, 0)) c[DIR] = 0;
    if ((c[COOLDOWN] as number) > 0) c[COOLDOWN] = (c[COOLDOWN] as number) - 1;
    // Dash, wenn das Schiff auf Höhe ist: y ≤ pY und y + 180 ≥ pY + 20 (`0x46302D`).
    y = w.bossY[0] as number;
    if ((c[COOLDOWN] as number) === 0 && y <= w.py && y + 180 >= w.py + 20) c[SUB] = 1;
    if ((w.bossHP[0] as number) <= 0) c[SUB] = 11;
  } else if (sub >= 1 && sub <= 9) {
    c[SUB] = sub + 1;
  } else if (sub === 10) {
    c[SUB] = 11;
    sound(w, Sound.End1);
  } else if (sub === 11) {
    // Dash mit 14 px/Tick bis x ≤ −200 (`0x4631B8`).
    const x = (w.bossX[0] as number) - 14;
    w.bossX[0] = x;
    if (x <= -200) c[SUB] = 12;
    if ((w.bossHP[0] as number) > 0) return;
    // Tot: Spieler wird unverwundbar (`Me.15C = 0`, nur wenn er gerade verwundbar ist).
    if (w.invuln === INVULN_DONE) w.invuln = 0;
    dyingExplosion(w);
    if (x <= -200) {
      w.bossState = 3;
      c[DIR] = 0;
      w.bossHP[0] = HP_PHASE2;
      w.bossHPMax[0] = HP_PHASE2;
    }
    // Tod von Phase 3 → Zustand 4; `Me.15C = 0` bedingungslos (`0x463380`).
    if ((c[PHASE3] as number) === 1) {
      w.bossState = 4;
      w.invuln = 0;
    }
  } else if (sub === 12) {
    // Rückkehr mit +7 auf genau 320, neue Abklingzeit Int(Rnd·90) + 10 (`0x4633C1`).
    const x = (w.bossX[0] as number) + 7;
    w.bossX[0] = x;
    if (x === 320) {
      c[SUB] = 0;
      c[COOLDOWN] = w.rnd.below(90) + 10;
    }
  }
}

/** Zustand 3 (`0x4634A0`): schnelle Durchflüge, rechts→links (Typ 8) und links→rechts (Typ 9). */
function phase2(w: World, t8: number, t9: number): void {
  const c = w.bossC;
  const k = c[DIR] as number;
  if (k === 0) {
    // Durchflug nach links mit 15 px/Tick bis x ≤ −300.
    const x = (w.bossX[0] as number) - 15;
    w.bossX[0] = x;
    if (x <= -300) {
      c[DIR] = 1;
      if ((w.bossHP[0] as number) <= 0) {
        startPhase3(w, t8);
        return;
      }
    }
    if ((w.bossHP[0] as number) <= 0) dyingExplosion(w);
  } else if (k >= 1 && k <= 40) {
    // Wartezeit links außerhalb; macht das Schiff wieder verwundbar (`0x46362C`).
    if (w.invuln < INVULN_DONE) w.invuln = INVULN_DONE;
    c[DIR] = k + 1;
  } else if (k === 41) {
    // Start links: x = −290, y = Int(Rnd·(410 − h)), Sound (`0x46368A`).
    w.bossX[0] = -290;
    w.bossY[0] = w.rnd.below(410 - partHeight(w, 0));
    c[DIR] = 42;
    sound(w, Sound.End2);
  } else if (k === 42) {
    // Durchflug nach rechts (gespiegelter Typ 9), selten gezielter Schuss (`0x463750`).
    const x = (w.bossX[0] as number) + 15;
    w.bossX[0] = x;
    if (w.rnd.less(0.002)) {
      addEnemyShot(w, ShotKind.Aimed, x + 145, (w.bossY[0] as number) + 90);
    }
    if ((w.bossX[0] as number) >= 640) {
      c[DIR] = 43;
      if ((w.bossHP[0] as number) <= 0) startPhase3(w, t8);
    }
    // Das Original setzt den Typ danach bedingungslos auf 9 — auch nach dem Wechsel in
    // Phase 3; Zustand 1 stellt ihn im nächsten Tick wieder auf 8.
    w.bossType[0] = t9;
    if ((w.bossHP[0] as number) <= 0) dyingExplosion(w);
  } else if (k >= 43 && k <= 84) {
    c[DIR] = k + 1;
  } else if (k === 85) {
    // Start rechts: Typ 8, x = 640, y = Int(Rnd·(410 − h)), Sound (`0x4639A7`).
    w.bossType[0] = t8;
    w.bossX[0] = 640;
    w.bossY[0] = w.rnd.below(410 - partHeight(w, 0));
    c[DIR] = 0;
    sound(w, Sound.End2);
  }
}

/**
 * Level 6 — E6 (`0x462D90`): „8 - Endgegner“ (289×185, Blick links) bzw. „9 - Endgegner“
 * (Blick rechts). Phase 1 (HP 4500) patrouilliert und stößt nach links vor, Phase 2 (HP 1200)
 * fliegt schnelle Durchgänge in beide Richtungen, Phase 3 wiederholt Phase 1 (Flag +24);
 * deren Tod → Zustand 4 mit +10000. Trefferprüfung: gemeinsamer Test `0x448A3E`.
 */
export const boss6: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    const t8 = typeByName(w, "8 - Endgegner");
    const t9 = typeByName(w, "9 - Endgegner");
    switch (w.bossState) {
      case 0:
        // `0x462E1F`: Teile 2 und 3 gibt es nicht (HP 0).
        setPart(w, 0, t8, 640, 12, HP_PHASE1);
        c[DIR] = 0;
        c[PHASE3] = 0;
        w.bossState = 1;
        break;
      case 1: {
        // Einflug von 640 auf 320 mit 2 px/Tick, Sound beim Start (`0x462E5F`).
        w.bossFrame[0] = 0;
        w.bossType[0] = t8;
        if ((w.bossX[0] as number) === 640) sound(w, Sound.End1);
        const x = (w.bossX[0] as number) - 2;
        w.bossX[0] = x;
        if (x === 320) {
          w.bossState = 2;
          c[DIR] = 1;
          c[SUB] = 0;
          c[COOLDOWN] = 0;
        }
        break;
      }
      case 2:
        phase1(w);
        break;
      case 3:
        phase2(w, t8, t9);
        break;
      default:
        // Zustand 4 (`0x463A2C`): Explosionen an Ort und Stelle (links außerhalb), +10000.
        bossDeathTick(w, 0);
        bossVictory(w);
    }
    w.bossVisible[0] = 1;
  },

  hit(w, bx, by, bw, bh, damage) {
    if (!bossRowHit(w, 0, bx, by, bw, bh)) return -1;
    damagePart(w, 0, damage, bx, by);
    return 0;
  },
};
