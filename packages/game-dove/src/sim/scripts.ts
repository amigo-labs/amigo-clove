import { fxFloor, fxFromInt, fxMul } from "@clove/core";
import { Effect, Sound, effect, sound, spawnExplosion } from "./actions";
import {
  BG_SPEED_DEFAULT,
  FIELD_H,
  METEOR_FIRST_TICK,
  METEOR_HP,
  METEOR_LAST_TICK,
  METEOR_VX,
  SCREEN_W,
} from "./constants";
import { idiv } from "./math";
import { spawnTile } from "./spawn";
import { sinDeg } from "./trig";
import type { World } from "./world";

/**
 * Levelskripte aus `Select Case Me.[0x39C]` in der Event-Methode
 * (`docs/measurements/dove-bosses.md`, „Levelskripte“; Level 1: `dove-events.md`).
 */

/** Skripttexte: [Deutsch, Englisch] (`0x40D8DC`–`0x40E6DC`, Tippfehler wie im Original). */
export const SCRIPT_TEXTS: Readonly<Record<number, readonly [string, string]>> = {
  1: [
    "So, und los geht's! Du steuerst mit den Pfeiltasten oder dem Zifferblock",
    "OK, let's go! You navigate the spaceship with the arrow keys or the key pad.",
  ],
  2: [
    "Uh, da kommt ein Gegner! Du schießt mit S! Mach ihn fertig!",
    "Oh, an enemy is coming! You fire with S! Blow him away!",
  ],
  3: ["Gut gemacht!", "yeah! you made it!"],
  4: [
    "Ok, wir versuchen es nochmal! Drücke S zum schießen!",
    "OK, try again! In order to fire press S.",
  ],
  5: ["Da sind zwei Extras! Sammel sie ein!", "There're two Specials! Take them!"],
  6: [
    "OK, mit D kannst du deine Extrawaffe nach hinten ausrichten! Probier' es aus! Nur einmal drücken!",
    "OK, press D to put your special weapon on the back! Try it! Press only once!",
  ],
  7: [
    "Hast du gesehen, wie sich der Balken in deiner Anzeige bewegt hat?",
    "Great! Did your see the bar on the screen move?",
  ],
  8: [
    "Uh, hier sind Wände, nicht anstoßen! Sie können die DOVE zerstören!",
    "Be careful, contacting the walls can destroy your spaceship!",
  ],
  9: ["Du kannst Q oder F drücken um langsamer zu fliegen.", "Press Q or F  to slow down."],
  10: ["Mit W oder G Kannst du wieder schnell werden", "Press W or G to speed up."],
  11: [
    "Nun lade mit A deinen Beam komplett auf",
    "Hold key A down to fill up your BigShot device completely.",
  ],
  12: [
    "warte bis drei Beißer auf dem Bildschirm sind und lass dann A los",
    "Wait for tree biter to enter the scenery, then take off from key A.",
  ],
  13: [
    "Neben den zwei extraarten die du schon kennst gibt es noch zwei weitere",
    "Besides these two special device, you learned about, there are two more.",
  ],
  14: [
    "die bombe (das obere extra) und das schild, das schüsse der Gegner abwehrt",
    "The bomb (the upper special) and the shield, that protects you from shots.",
  ],
  15: [
    "So das war schon alles was man wissen muss! Viel Spaß und nicht verzweifeln!",
    "OK, that's all you have to know to play the game! Have fun, and don't despair!",
  ],
  16: ["Benutze W oder G um wieder schneller zu fliegen", "USE W or G to fly faster again"],
};

/** Deko-Blase Level 3 in ss.spr (Rechteck geschätzt, entfernt bei y < −179). */
export const DECO_RECT = { sx: 203, sy: 0, w: 85, h: 179 } as const;
export const BAND_SIZE = { w: 100, h: 70 } as const;

const TUTORIAL_TEXT_AT: Readonly<Record<number, number>> = {
  0: 1,
  50: 2,
  500: 5,
  1250: 6,
  1300: 7,
  1500: 8,
  1800: 9,
  2200: 10,
  2650: 11,
  2800: 12,
  3400: 13,
  3800: 14,
  4200: 15,
};

/** Level 0: Texte und Sperren; setzt den Tick zurück, bis die Übung geschafft ist. */
function tutorial(w: World): void {
  const t = w.tick;
  const text = TUTORIAL_TEXT_AT[t];
  if (text !== undefined) w.scriptText = text;
  if (t === 2 || t === 1200 || t === 2600) w.scriptText = 0;
  if (t === 420) {
    if (w.score === 0) {
      w.scriptText = 4;
      w.tick = 50;
    } else {
      w.scriptText = 3;
    }
  }
  // 501…1180: weiter, sobald eine Option und Rot Stufe 0 eingesammelt sind.
  if (t > 500 && t <= 1180 && w.optionCount === 1 && w.colour === 3 && w.stage === 0) w.tick = 1200;
  if (t === 1181) {
    w.colour = 0;
    w.stage = 0;
    w.optionCount = 0;
    w.tick = 500;
  }
  // 1251…1298: warten, bis die Extrawaffe nach hinten zeigt.
  if (t > 1250 && t < 1299 && w.pod === 0) w.tick = 1300;
  if (t === 1299) w.tick = 1201;
  if (t === 1450) {
    w.optionCount = 1;
    w.colour = 3;
    w.stage = 0;
  }
  // 2651…2798: weiter, sobald der Beam voll geladen ist.
  if (t > 2650 && t < 2799 && w.charge === 200) w.tick = 2800;
  if (t === 2799) w.tick = 2651;
}

/** Level 1: Warp-Intro und Meteore (ein Spawn lässt den Tick stillstehen). */
function level1(w: World): boolean {
  const t = w.tick;
  if (t === 50 || t === 329) sound(w, Sound.Antrieb, w.rnd.below(101) - 50);
  if (t >= 51 && t <= 70) w.bgSpeed = fxFromInt(t - 50);
  else if (t > 70 && t < 330) w.bgSpeed = fxFromInt(20);
  else if (t >= 330 && t <= 349) w.bgSpeed = fxFromInt(350 - t);
  else if (t === 350) w.bgSpeed = BG_SPEED_DEFAULT;
  if (t >= METEOR_FIRST_TICK && t <= METEOR_LAST_TICK) {
    for (let i = 0; i < w.meteors.capacity; i++) {
      if (w.meteors.active[i] || !w.rnd.greater(0.98)) continue;
      w.meteors.active[i] = 1;
      w.metX[i] = SCREEN_W;
      w.metY[i] = w.rnd.below(350);
      w.metVX[i] = METEOR_VX;
      w.metVY[i] = w.rnd.below(3) - 1;
      w.metHP[i] = METEOR_HP;
      return true;
    }
  }
  return false;
}

/** Level 3: aufsteigende Blasen und fallende Decken auf den festen Tile-Slots 0 und 8. */
function level3(w: World): void {
  if (w.rnd.less(0.002)) {
    const i = w.deco.alloc();
    if (i >= 0) {
      const x = w.rnd.below(940) - 150;
      w.decoX0[i] = x;
      w.decoX[i] = x;
      w.decoY[i] = FIELD_H;
      w.decoT[i] = 0;
    }
  }
  const setVY = (slot: number, vy: number) => {
    if (w.tiles.active[slot]) w.tileVY[slot] = vy;
  };
  switch (w.tick) {
    case 4250:
      setVY(8, 4);
      effect(w, Effect.EnemyKill, w.tileX[8] as number, w.tileY[8] as number, 100, 20);
      break;
    case 4317:
      setVY(8, 0);
      effect(w, Effect.EnemyKill, w.tileX[8] as number, w.tileY[8] as number, 100, 20);
      break;
    case 5680:
      setVY(0, 4);
      break;
    case 5690:
      setVY(8, 4);
      break;
    case 5717:
      setVY(0, 0);
      break;
    case 5765:
      setVY(8, 0);
      break;
  }
}

/** Level 6: Warp-Tempo, schnelle Decke, Einzeltiles — inklusive Off-by-one bei 4700/4785. */
function level6(w: World): void {
  const t = w.tick;
  if (t === 0 || t === 1882 || t === 3000 || t === 5122 || t === 7800 || t === 7900)
    w.bgSpeed = fxFromInt(9);
  if (t < 7900 && t % 25 === 0) {
    const slot = spawnTile(w, 1, 0, SCREEN_W, -10, 0);
    if (slot >= 0) w.scriptC[0] = slot;
  }
  if (t === 3400 || t === 6100) {
    const slot = w.scriptC[0] as number;
    if (w.tiles.active[slot]) w.tileVY[slot] = 2;
    sound(w, Sound.Explosion);
    w.shake = Math.max(w.shake, 5);
  }
  if (t === 1840 || t === 2350) spawnTile(w, 10, 44, SCREEN_W, -10, 0);
  if (t === 1887) {
    w.tiles.free(0);
    effect(w, Effect.EnemyKill, w.tileX[0] as number, w.tileY[0] as number, 60, 40);
    for (let k = 0; k < 7; k++)
      spawnExplosion(w, (w.tileX[0] as number) + 8 * k, w.tileY[0] as number);
    sound(w, Sound.Explosion);
  }
  if (t === 4700) {
    spawnTile(w, 15, 128, 455, -1, -1);
    // Me.64C = Me.598 — das ist Slot + 1 (`0x43BE44`); das Original trifft bei 4785 den falschen Slot.
    w.scriptC[1] = w.tiles.hint;
  }
  if (t === 4785) {
    const slot = w.scriptC[1] as number;
    if (slot < w.tiles.capacity && w.tiles.active[slot]) w.tileVY[slot] = 0;
    effect(w, Effect.EnemyKill, w.tileX[slot] ?? 0, w.tileY[slot] ?? 0, 60, 40);
    w.shake = Math.max(w.shake, 5);
  }
  if (t >= 7981 && t <= 7999) w.bgSpeed = fxFromInt(idiv(8000 - t, 2));
}

const BAND_TICKS = new Set([0, 1600, 2000, 2300, 2600, 2800, 3000, 4000, 5300, 6000, 7000, 7500]);

/** Level 7: Bremsbänder, die das Schiff verlangsamen (`AddBand`). */
function level7(w: World): void {
  if (!BAND_TICKS.has(w.tick)) return;
  const i = w.bands.alloc();
  if (i < 0) return;
  w.bandX[i] = SCREEN_W;
  w.bandY[i] = w.py - 25;
}

const WINDS: readonly (readonly [tick: number, strength: number, width: number])[] = [
  [4355, 2, 143],
  [4608, 2, 286],
  [4894, -2, 143],
  [5037, 2, 286],
  [8091, 2, 143],
  [8234, -2, 143],
  [8377, 2, 143],
  [8520, -2, 143],
  [8663, 4, 286],
  [8806, 2, 143],
];

/** Level 8: Windzonen (`AddWind`). */
function level8(w: World): void {
  for (const [tick, strength, width] of WINDS) {
    if (tick !== w.tick) continue;
    const i = w.winds.alloc();
    if (i < 0) continue;
    w.windX[i] = SCREEN_W;
    w.windW[i] = width;
    w.windS[i] = strength;
  }
}

/** Vor der Token-Schleife. Liefert `true`, wenn der Tick stillsteht (Level 1, Meteor). */
export function scriptEvents(w: World): boolean {
  switch (w.level.number) {
    case 0:
      tutorial(w);
      return false;
    case 1:
      return level1(w);
    case 3:
      level3(w);
      return false;
    case 6:
      level6(w);
      return false;
    case 7:
      level7(w);
      return false;
    case 8:
      level8(w);
      return false;
    default:
      return false;
  }
}

/**
 * Level 5 nach der Token-Schleife (`0x444C71`), auch im Bosskampf: „riesen
 * Pflanze“ (Tick 2136) und „Wand“ mit nachrutschender Decke (Tick 3949).
 * scriptC: 2 Pflanzen-Slot+1, 3 Wand-Slot+1, 4 Tile-Slot+1, 5 Phase der Decke.
 */
export function scriptAfterEvents(w: World): void {
  if (w.level.number !== 5) return;
  const c = w.scriptC;
  const t = w.tick;
  if (t === 2136) c[2] = w.enemies.hint; // Me.64C = Me.458 − 1, hier +1 gespeichert
  if (c[2]) {
    const slot = (c[2] as number) - 1;
    if (!w.enemies.active[slot]) {
      c[2] = 0;
      if (t < 2835) {
        const x = fxFloor(w.enX[slot]!);
        const y = fxFloor(w.enY[slot]!);
        effect(w, Effect.PlayerDeath, x, y, 217, 136);
        w.shake = Math.max(w.shake, 20);
        for (let k = 0; k < 10; k++) spawnExplosion(w, x + w.rnd.below(217), y + w.rnd.below(136));
      }
    }
  }
  if (t === 3949) {
    c[3] = w.enemies.hint;
    c[4] = w.tiles.hint;
    c[5] = 1;
  }
  if (c[5] === 1 && c[3] && !w.enemies.active[(c[3] as number) - 1]) {
    w.shake = Math.max(w.shake, 5);
    c[5] = 2;
  }
  if (c[5] === 2) {
    const slot = (c[4] as number) - 1;
    if (slot >= 0 && w.tiles.active[slot] && (w.tileY[slot] as number) < 155) {
      w.tileY[slot] = (w.tileY[slot] as number) + 1;
    } else {
      sound(w, Sound.Explosion);
      w.shake = Math.max(w.shake, 10);
      c[5] = 3;
    }
  }
}

/** In `Keyboard` vor der Bewegung: Wind in Level 8 (`0x439B5F`). */
export function scriptKeyboard(w: World): void {
  for (let i = 0; i < w.winds.capacity; i++) {
    if (!w.winds.active[i]) continue;
    const cx = w.px + 20;
    const x = w.windX[i] as number;
    if (cx >= x && cx < x + (w.windW[i] as number)) {
      const y = w.py + (w.windS[i] as number);
      if (y >= 0 && y <= FIELD_H) w.py = y;
    }
  }
}

/** Einmal pro Tick nach dem Scrollen: Blasen, Bänder, Windzonen. */
export function scriptTick(w: World): void {
  for (let i = 0; i < w.deco.capacity; i++) {
    if (!w.deco.active[i]) continue;
    const t = (w.decoT[i] as number) + 1;
    w.decoT[i] = t;
    w.decoY[i] = (w.decoY[i] as number) - 1;
    // x-Schwingung 10·sin(t/10) (Bogenmaß) — in Grad: t/10 rad ≈ 5,73·t°
    w.decoX[i] =
      (w.decoX0[i] as number) + fxFloor(fxMul(fxFromInt(10), sinDeg(idiv(t * 573, 100))));
    if ((w.decoY[i] as number) < -DECO_RECT.h) w.deco.free(i);
  }
  for (let i = 0; i < w.bands.capacity; i++) {
    if (!w.bands.active[i]) continue;
    // Das Band läuft mit −7/Tick bis x = 100 und verschwindet dann (*niedrig*).
    if ((w.bandX[i] as number) > 100) w.bandX[i] = (w.bandX[i] as number) - 7;
    else {
      w.bands.free(i);
      continue;
    }
    const bx = w.bandX[i] as number;
    const by = w.bandY[i] as number;
    if (
      !w.dead &&
      w.px + 40 >= bx &&
      w.px <= bx + BAND_SIZE.w &&
      w.py + 22 >= by &&
      w.py <= by + BAND_SIZE.h
    ) {
      w.speed = Math.max(0, w.speed - 1);
      w.scriptText = 16;
    }
  }
  for (let i = 0; i < w.winds.capacity; i++) {
    if (!w.winds.active[i]) continue;
    w.windX[i] = (w.windX[i] as number) - 1;
    if ((w.windX[i] as number) + (w.windW[i] as number) < 0) w.winds.free(i);
  }
}
