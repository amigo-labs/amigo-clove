import type { Enemies } from "./enemies";

/**
 * Lebenspunkte der kämpfenden Bosse (Erweiterung fürs HUD, reine Abfrage):
 * alle lebenden Gegner mit `boss = 1`, die noch nicht im Todesablauf sind.
 * Das Maximum rechnet wie `AddEnemy` (`hitPoints · (1 + 0,5 · Spieler−1)`).
 */
export function bossStatus(
  enemies: Enemies,
  playersMinus1: number,
): { hp: number; max: number } | undefined {
  let hp = 0;
  let max = 0;
  for (const e of enemies.items) {
    if (!e?.alive || e.inState || e.def.boss !== 1) continue;
    hp += Math.max(0, e.actor.hp);
    max += e.def.hitPoints * (1 + 0.5 * playersMinus1);
  }
  return max > 0 ? { hp: Math.min(hp, max), max } : undefined;
}
