import { ShotKind, addEnemyShotForced } from "../enemyShots";
import { FIELD_H } from "../constants";
import type { BossScript, World } from "../world";
import {
  dyingTick,
  finishBoss,
  genericHit,
  partHeight,
  partRows,
  setPart,
  typeByName,
} from "./common";

/**
 * Level 1 — E1 „End-Rechts“ (198×150, 3 Frames, HP 5000), `0x460A20`.
 * Zähler: c0 Framezähler, c1 Schusszähler, c2 vy.
 */
export const boss1: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    switch (w.bossState) {
      case 0:
        setPart(w, 0, typeByName(w, "End-Rechts"), 640, 100, 5000);
        w.bossState = 1;
        break;
      case 1:
        w.bossX[0] = (w.bossX[0] as number) - 2;
        if ((w.bossX[0] as number) <= 442) {
          c[2] = 1;
          w.bossState = 2;
        }
        break;
      case 2: {
        c[0] = (c[0] as number) + 1;
        if ((c[0] as number) >= 5) {
          c[0] = 0;
          w.bossFrame[0] = ((w.bossFrame[0] as number) + 1) % 3;
        }
        const [f0, f1] = partRows(w, 0);
        const y = w.bossY[0] as number;
        const vy = c[2] as number;
        if (y + vy < -f0 || y + vy + f1 > FIELD_H) c[2] = -vy;
        w.bossY[0] = y + (c[2] as number);
        c[1] = (c[1] as number) + 1;
        if ((c[1] as number) >= 6) {
          c[1] = 0;
          const x = w.bossX[0] as number;
          const by = w.bossY[0] as number;
          addEnemyShotForced(w, ShotKind.Straight, x, by + 28);
          addEnemyShotForced(w, ShotKind.Straight, x, by + partHeight(w, 0) - 26);
        }
        if ((w.bossHP[0] as number) <= 0) w.bossState = 4;
        break;
      }
      default:
        dyingTick(w, 0, 230, 100, 290, 180);
        finishBoss(w, 10000);
    }
  },
  hit: genericHit,
};
