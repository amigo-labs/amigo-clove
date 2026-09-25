import type { BossScript } from "../world";
import { boss1 } from "./e1";
import { placeholderBoss } from "./placeholder";

/** Bossskript je Levelnummer (`DoEndgegner`, Sprungtabelle `0x46DE30`); Level 9 hat keinen Boss. */
export const BOSSES: Readonly<Record<number, BossScript>> = {
  1: boss1,
  2: placeholderBoss,
  3: placeholderBoss,
  4: placeholderBoss,
  5: placeholderBoss,
  6: placeholderBoss,
  7: placeholderBoss,
  8: placeholderBoss,
  10: placeholderBoss,
};
