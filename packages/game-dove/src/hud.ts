import type { AssetStore, HudIcon, HudMeter, HudSnapshot, HudSprite } from "@clove/core";
import { BEAM_MAX, SHIELD_TICKS } from "./sim/constants";
import type { World } from "./sim/world";

/** Symbole der Konsole in `ss.spr` (x, y, w, h), wie sie `Renderer.drawHud` zeichnet. */
const OPTION = [50, 20, 21, 20] as const;
const BOMB = [71, 20, 21, 20] as const;
const COLOURS = [undefined, [50, 0, 21, 20], [71, 0, 21, 20], [50, 40, 21, 20]] as const;

type Rect = readonly [number, number, number, number];

/** Ausschnitte eines Bildes aus dem Manifest als `HudSprite`. */
export function spriteSheet(assets: AssetStore, id: string): (r: Rect) => HudSprite {
  const e = assets.entry(id);
  const url = assets.url(id);
  const sheetW = e.kind === "image" ? e.width : 0;
  const sheetH = e.kind === "image" ? e.height : 0;
  return ([x, y, w, h]) => ({ url, x, y, w, h, sheetW, sheetH });
}

/**
 * Alles, was die Konsole zeigt, als Daten für das HTML-HUD der Shell:
 * Punkte (hochzählend), Schiffe, Tempo, Beam, Waffe mit Stufe, Options, Bombe,
 * Pod-Richtung; dazu Schild-Restzeit und Boss-Lebenspunkte.
 */
export function doveHud(w: World, sprite: (r: Rect) => HudSprite, german: boolean): HudSnapshot {
  const meters: HudMeter[] = [
    // Tempo 2…8 als Zeiger 20…80 (`gauge` läuft dem Tempo nach)
    { id: "speed", value: Math.max(0, w.gauge - 10), max: 70 },
    { id: "beam", value: w.charge, max: BEAM_MAX, full: w.charge >= BEAM_MAX },
  ];
  if (w.shield > 0) meters.push({ id: "shield", value: w.shield, max: SHIELD_TICKS });
  const icons: HudIcon[] = [];
  const colour = COLOURS[w.colour];
  if (colour) {
    const names = german ? ["", "Blau", "Grün", "Rot"] : ["", "Blue", "Green", "Red"];
    icons.push({
      sprite: sprite(colour),
      count: w.stage + 1,
      label: `${names[w.colour]} ${w.stage + 1}`,
    });
  }
  if (w.optionCount > 0) {
    icons.push({ sprite: sprite(OPTION), count: w.optionCount, label: `Options ${w.optionCount}` });
  }
  if (w.bomb) icons.push({ sprite: sprite(BOMB), label: german ? "Bombe" : "Bomb" });
  const front = w.pod !== 0;
  icons.push({
    text: front ? "▶" : "◀",
    label: german
      ? front
        ? "Extrawaffe vorn"
        : "Extrawaffe hinten"
      : front
        ? "Pod front"
        : "Pod rear",
  });
  let hp = 0;
  let max = 0;
  if (w.bossMode) {
    for (let p = 0; p < 3; p++) {
      if (w.bossType[p]! < 0 || !w.bossVisible[p]) continue;
      hp += Math.max(0, w.bossHP[p]!);
      max += Math.max(0, w.bossHPMax[p]!);
    }
  }
  return {
    lives: w.lives,
    players: [{ score: w.shownScore, meters, icons }],
    ...(max > 0 ? { boss: { hp, max } } : {}),
  };
}
