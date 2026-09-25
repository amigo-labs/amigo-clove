import type { BossScript } from "../world";
import { boss1 } from "./e1";
import { boss10 } from "./e10";
import { boss2 } from "./e2";
import { boss3 } from "./e3";
import { boss4 } from "./e4";
import { boss5 } from "./e5";
import { boss6 } from "./e6";
import { boss7 } from "./e7";
import { boss8 } from "./e8";

/** Bossskript je Levelnummer (`DoEndgegner`, Sprungtabelle `0x46DE30`); Level 9 hat keinen Boss. */
export const BOSSES: Readonly<Record<number, BossScript>> = {
  1: boss1,
  2: boss2,
  3: boss3,
  4: boss4,
  5: boss5,
  6: boss6,
  7: boss7,
  8: boss8,
  10: boss10,
};
