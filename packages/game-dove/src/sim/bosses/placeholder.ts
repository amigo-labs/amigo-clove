import type { BossScript } from "../world";

/**
 * Platzhalter für noch nicht portierte Bosse: das Level gilt am Boss-Tick als
 * geschafft, damit die Kampagne durchspielbar bleibt.
 */
export const placeholderBoss: BossScript = {
  tick(w) {
    w.levelDone = true;
  },
  hit: () => -1,
};
