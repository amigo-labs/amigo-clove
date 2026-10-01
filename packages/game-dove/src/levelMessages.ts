import type { HudMessage } from "@clove/core";
import { GLYPH_W } from "./render/font";
import { E7_TEXTS, E7_WEAPON_NAMES } from "./sim/bosses/e7";
import { SCREEN_W } from "./sim/constants";
import type { World } from "./sim/world";

/**
 * Scan-Meldungen des Bosses in Level 7 (`bossC[7]` Meldung oben mittig, `[8]`
 * Optionen und `[9]` Waffe nahe am Schiff), mit den Positionen des Originals in
 * Spielpixeln für die 8-px-Schrift. Das Original-HUD zeichnet sie im Canvas,
 * das HTML-HUD der Shell zeigt dieselben Texte (`doveHud`).
 */
export function levelMessages(w: World): HudMessage[] {
  const out: HudMessage[] = [];
  if (w.level.number !== 7 || !w.bossMode) return out;
  const msg = E7_TEXTS[w.bossC[7]!];
  if (msg)
    out.push({
      id: "scan",
      text: msg,
      at: { x: Math.floor((SCREEN_W - msg.length * GLYPH_W) / 2), y: 60 },
    });
  const tx = w.px > 300 ? w.px - 100 : w.px + 60;
  if (w.bossC[8])
    out.push({
      id: "scanOptions",
      text: `${w.optionCount} Option${w.optionCount === 1 ? "" : "s"}`,
      at: { x: tx, y: w.py - 4 },
    });
  if (w.bossC[9])
    out.push({
      id: "scanWeapon",
      text: E7_WEAPON_NAMES[w.bossC[2]!] ?? "",
      at: { x: tx, y: w.py + 17 },
    });
  return out;
}
