import type { HudSprite, UiText } from "@clove/core";
import { type Lang, pick } from "./lang";

/**
 * Abspann `ShowCredits` (`0x5566C0`): `credits` (500 × 3000, Atlas `logo`) mit
 * allen Mitwirkenden läuft 1 px je Durchlauf (`Wait 25`, 40 px/s) durch, Esc
 * beendet. Als Text-Bildschirm der Shell mit dem Originalbild; die Musik
 * (`Enhaced Credits.ogg`) spielt das Spiel.
 */
export const CREDITS_PX_PER_S = 40;

export function creditsScreen(lang: Lang, image: HudSprite | undefined): UiText {
  return {
    kind: "text",
    blocks: [],
    ...(image ? { image: { sprite: image, alt: "Credits" } } : {}),
    scroll: { pxPerSecond: CREDITS_PX_PER_S },
    done: pick(lang, "Weiter", "Continue", "Продолжить"),
    back: "done",
  };
}
