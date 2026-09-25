import { fxFromInt } from "@clove/core";
import { Effect, Sound, effect, killPlayer, sound, spawnExplosion } from "../actions";
import { INVULN_DONE, SCREEN_W } from "../constants";
import { RECT_BULLET, type ShotRect, ShotKind, addBossShot } from "../enemyShots";
import { divRoundHalfEven, idiv, roundHalfEven } from "../math";
import { spawnExtra, spawnTile } from "../spawn";
import { cosDeg, sinDeg } from "../trig";
import type { BossScript, World } from "../world";
import { damagePart, partContourHit, typeByName } from "./common";

/**
 * Level 7 — E7 Scanner-/Spiegelboss, `Endgegner7` `0x466880` (Zustandstabelle
 * `0x46A460`), Trefferprüfung `0x44DD95`.
 *
 * Teil 0 „11 - Endg“ (171×90), Teile 1/2 „12 - Option“ (Umlauf, schlucken
 * Schüsse). Zustände: 0 Init → 10 (Neu-)Scan-Vorbereitung → 1 Scan (551 Ticks)
 * → 2 Einflug → 3…7 Angriff je nach gescannter Waffe → 9 Rückzug (→ 10) bzw.
 * 11 besiegt.
 *
 * Zähler (`Me.3A0`): c0 `+1C`, c1 `+20`, c2 `+24` (im Scan die Waffe 0…4,
 * im Angriff dx), c3 `+28` (dy), c4 `+2C` (Scan-Runde), c5 `+30` (Winkel der
 * Optionen), c6 `Me.34C` (eingefrorener Punktestand). Darstellung: c7 Text
 * (`Me.340`: 0 leer, 1 „Scaning DOVE“, 2 „Scaning successfull“), c8 = 1 zeigt
 * „n Option(s)“, c9 = 1 zeigt den Waffennamen `E7_WEAPON_NAMES[c2]`.
 */
export const E7_WEAPON_NAMES: readonly string[] = ["Normal", "Blue", "Green", "Red", "Beam"];
export const E7_TEXTS: readonly string[] = ["", "Scaning DOVE", "Scaning successfull"];

const C_TICK = 0;
const C_T2 = 1;
const C_DX = 2;
const C_DY = 3;
const C_ROUND = 4;
const C_ANGLE = 5;
const C_SCORE = 6;
const C_TEXT = 7;
const C_TEXT_OPTIONS = 8;
const C_TEXT_WEAPON = 9;

const S_SCAN = 1;
const S_ENTRY = 2;
const S_ATTACK = 3;
const S_RETREAT = 9;
const S_RESCAN = 10;
const S_WON = 11;

/** „Nicht vorhanden“ (`&HFFFFFC18`). */
const OFF = -1000;
const HP = 3000;
const ORBIT_R = 150;
const RND_ONE = 0x1000000;
/** Grüne Kugel (35,83)–(44,92) im Schusssprite. */
const RECT_GREEN: ShotRect = { sx: 35, sy: 83, w: 9, h: 9 };
/** Rote Fünferstreuung (`0x46914A`): (vx, vy). */
const RED_SPREAD: readonly (readonly [number, number])[] = [
  [-5, 0],
  [-3, -2],
  [-3, 2],
  [-1, -4],
  [-1, 4],
];
/** Stehende Extras bei Scan-Tick 199 (`0x46713D`, `AddExtra2(art, x, y)`). */
const SCAN_EXTRAS: readonly (readonly [art: number, x: number, y: number])[] = [
  [1, 400, 100],
  [2, 400, 200],
  [3, 400, 300],
  [1, 450, 100],
  [2, 450, 200],
  [3, 450, 300],
  [1, 500, 100],
  [2, 500, 200],
  [3, 500, 300],
  [0, 550, 200],
];
/** Grüne Wand: Kachel 17 („Cylinder lang Y 32“) ×4 bei x = −23, vx = +1 (`0x467D5E`). */
const WALL_TILE = 17;

/** `FpI4(Rnd · mul + add)` exakt (Rnd ist ein Single mit 24 Bit, Runden half-even). */
function rndRound(w: World, mul: number, add: number): number {
  return divRoundHalfEven(w.rnd.next() * mul + add * RND_ONE, RND_ONE);
}

/** `FpI4(base + (size − 40) · Rnd)` für die Rückzugs-/Todesexplosionen. */
function roundedExplosion(w: World, bw: number, bh: number): void {
  const r1 = w.rnd.next();
  const r2 = w.rnd.next();
  const x = w.bossX[0] as number;
  const y = w.bossY[0] as number;
  spawnExplosion(
    w,
    divRoundHalfEven(x * RND_ONE + r1 * (bw - 40), RND_ONE),
    divRoundHalfEven(y * RND_ONE + r2 * (bh - 40), RND_ONE),
  );
}

/**
 * Zufallsbewegung der Angriffszustände: Schritt (c2, c3), solange die neue
 * Position im Rechteck liegt; sonst (oder bei c1 = 0) neue Richtung
 * `FpI4(Rnd·6 − 3)` (nicht beide 0) und c1 = `FpI4(Rnd·durMul + 5)`.
 * `countdown`: c1 zählt pro Schritt herunter (Green/Red); Normal/Blue nutzen c1
 * nur als „Richtung gewählt“.
 */
function walk(
  w: World,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  durMul: number,
  countdown: boolean,
): void {
  const c = w.bossC;
  if (c[C_T2] !== 0) {
    const nx = (w.bossX[0] as number) + (c[C_DX] as number);
    const ny = (w.bossY[0] as number) + (c[C_DY] as number);
    if (nx >= xMin && nx <= xMax && ny >= yMin && ny <= yMax) {
      w.bossX[0] = nx;
      w.bossY[0] = ny;
      if (countdown) c[C_T2] = (c[C_T2] as number) - 1;
      return;
    }
  }
  do {
    c[C_DX] = rndRound(w, 6, -3);
    c[C_DY] = rndRound(w, 6, -3);
  } while (c[C_DX] === 0 && c[C_DY] === 0);
  c[C_T2] = rndRound(w, durMul, 5);
}

function shoot(w: World, kind: number, cy: number, vx: number, vy: number, r: ShotRect): void {
  addBossShot(w, kind, (w.bossX[0] as number) - 5, cy, vx, vy, r);
}

function parkParts(w: World): void {
  for (let p = 0; p < 3; p++) {
    w.bossX[p] = OFF;
    w.bossY[p] = OFF;
  }
}

/** Zustand 1 (`0x466C3F`): Scan, 551 Ticks, Punktestand eingefroren. */
function scan(w: World, bh: number): void {
  const c = w.bossC;
  if ((c[C_T2] as number) < 200) c[C_T2] = (c[C_T2] as number) + 1;
  const t = c[C_TICK] as number;
  if (t === 199) {
    for (const [art, x, y] of SCAN_EXTRAS) spawnExtra(w, art, y, x, 0);
  } else if (t >= 200 && t <= 440) {
    c[C_TEXT] = 1;
    const phase = idiv(t - 200, 60);
    if (phase > 0) c[C_TEXT_OPTIONS] = 1;
    if (phase > 1) {
      // `0x4677BB`: Ladung > 10 → Beam, sonst die Farbwaffe (`Me.540`).
      if (w.charge > 10) c[C_DX] = 4;
      else if (w.colour <= 3) c[C_DX] = w.colour;
      c[C_TEXT_WEAPON] = 1;
    }
  } else if (t >= 441 && t <= 550) {
    c[C_TEXT] = 2;
    // `0x46796A`: Extras 0…10 entfernen.
    if (t === 441) for (let i = 0; i <= 10; i++) w.extras.free(i);
    c[C_TEXT_OPTIONS] = 1;
    c[C_TEXT_WEAPON] = 1;
  } else if (t === 551) {
    // `0x467CDD`: Angriff vorbereiten.
    c[C_TEXT] = 0;
    w.bossState = S_ENTRY;
    c[C_TICK] = -1;
    c[C_T2] = 0;
    w.bossX[0] = 700;
    w.bossY[0] = 205 - idiv(bh, 2);
    w.bossHP[0] = HP;
    w.bossHPMax[0] = HP;
    if (c[C_DX] === 2) {
      for (let k = 0; k < 4; k++) spawnTile(w, WALL_TILE, 128 * k, -23, 1, 0);
    }
  }
  c[C_TICK] = (c[C_TICK] as number) + 1;
  w.score = c[C_SCORE] as number;
}

export const boss7: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    w.bossBeamW.fill(0);
    w.bossVisible.fill(0);
    c[C_TEXT_OPTIONS] = 0;
    c[C_TEXT_WEAPON] = 0;
    const body = typeByName(w, "11 - Endg");
    const opt = typeByName(w, "12 - Option");
    const bw = w.level.enemies[body]!.w;
    const bh = w.level.enemies[body]!.h;
    const cy = (w.bossY[0] as number) + idiv(bh, 2);

    switch (w.bossState) {
      case 0:
        // `0x46697F`
        parkParts(w);
        w.bossState = S_RESCAN;
        c.fill(0);
        c[C_SCORE] = w.score;
        w.bossType[0] = body;
        w.bossType[1] = opt;
        w.bossType[2] = opt;
        w.bossFrame.fill(0);
        w.bossHP.fill(0);
        w.bossHPMax.fill(0);
        break;
      case S_RESCAN:
        // `0x466C0B`: nächste Runde
        parkParts(w);
        c[C_ROUND] = (c[C_ROUND] as number) + 1;
        w.bossState = S_SCAN;
        c[C_TICK] = 0;
        c[C_T2] = 0;
        c[C_DX] = 0;
        w.bossFrame[0] = 0;
        break;
      case S_SCAN:
        scan(w, bh);
        break;
      case S_ENTRY: {
        // `0x46822D`: x −= 2 bis 640 − w, dann Zustand 3 + Waffe.
        const x = (w.bossX[0] as number) - 2;
        w.bossX[0] = x;
        if (x <= SCREEN_W - bw) {
          w.bossX[0] = SCREEN_W - bw;
          w.bossState = S_ATTACK + (c[C_DX] as number);
        }
        // Grüne Wand hält an, sobald Kachel 0 bei x = 0 steht.
        if (c[C_DX] === 2 && w.tileX[0] === 0) w.tileVX.fill(0, 0, 4);
        break;
      }
      case 3: {
        // Normal (`0x468327`): Kugel vx −6 alle 10 Ticks.
        c[C_TICK] = (c[C_TICK] as number) + 1;
        if ((c[C_TICK] as number) >= 10) {
          c[C_TICK] = 0;
          shoot(w, ShotKind.Fireball, cy, -6, 0, RECT_BULLET);
        }
        walk(w, 100, 500, -20, 340, 10, false);
        break;
      }
      case 4: {
        // Blue (`0x468563`): Kugel vx −5 alle 30 Ticks; Laden, wenn das Schiff auf Höhe ist.
        c[C_TICK] = (c[C_TICK] as number) + 1;
        if ((c[C_TICK] as number) >= 30) {
          shoot(w, ShotKind.Fireball, cy, -5, 0, RECT_BULLET);
          c[C_TICK] = 0;
        }
        if (cy >= w.py && cy <= w.py + 21) c[C_T2] = 100;
        if ((c[C_T2] as number) > 90) {
          const t2 = (c[C_T2] as number) - 1;
          c[C_T2] = t2;
          if (t2 === 95) sound(w, Sound.End3);
          if (t2 <= 95) {
            // Strahl von x = 0 bis Boss-x + 10, Höhe ±(96 − c1)·10 um die Bossmitte.
            const d = (96 - t2) * 10;
            const x = w.bossX[0] as number;
            w.bossBeamX[0] = 0;
            w.bossBeamY[0] = cy - d;
            w.bossBeamW[0] = x + 10;
            w.bossBeamH[0] = 2 * d;
            if (
              !w.dead &&
              w.invuln === INVULN_DONE &&
              w.py <= cy + d &&
              w.py >= cy - d &&
              w.px <= x
            ) {
              killPlayer(w);
            }
          }
          if (t2 === 90) c[C_T2] = 0;
        } else {
          walk(w, 300, 500, -20, 340, 30, false);
        }
        break;
      }
      case 5: {
        // Green (`0x468EF3`): teilende Kugel (Art 4) vx −6 alle 50 Ticks.
        c[C_TICK] = (c[C_TICK] as number) + 1;
        if ((c[C_TICK] as number) >= 50) {
          c[C_TICK] = 0;
          shoot(w, ShotKind.Splitter, cy, -6, 0, RECT_GREEN);
        }
        walk(w, 100, 500, -20, 340, 50, true);
        break;
      }
      case 6: {
        // Red (`0x469138`): Fünferfächer alle 15 Ticks.
        c[C_TICK] = (c[C_TICK] as number) + 1;
        if ((c[C_TICK] as number) >= 15) {
          c[C_TICK] = 0;
          for (const [vx, vy] of RED_SPREAD) shoot(w, ShotKind.Fireball, cy, vx, vy, RECT_BULLET);
        }
        walk(w, 300, 500, 0, 320, 50, true);
        break;
      }
      case 7: {
        // Beam (`0x46982B`): 100 Ticks zitternd laden, dann Vollbild-Blitz.
        const t2 = c[C_T2] as number;
        if (t2 <= 150) c[C_T2] = t2 + 1;
        const now = c[C_T2] as number;
        if (now >= 100) {
          // Das Original spielt den Ladesound jeden Tick ab c1 ≥ 100 (läuft weiter).
          if (now === 100) {
            sound(w, Sound.End3);
            // Tödlich für jedes lebende Schiff — ohne Test auf Unverwundbarkeit.
            if (!w.dead) killPlayer(w);
          }
        } else {
          w.bossX[0] = divRoundHalfEven(w.rnd.next() * 4 + (SCREEN_W - bw - 4) * RND_ONE, RND_ONE);
          w.bossY[0] = divRoundHalfEven(
            w.rnd.next() * 4 + (205 - idiv(bh, 2) - 2) * RND_ONE,
            RND_ONE,
          );
        }
        break;
      }
      case S_RETREAT: {
        // `0x469C84`: Sieg in Runde > 1 bei Faktor > 1,1 bzw. Runde > 0 bei Faktor < 1,1.
        const round = c[C_ROUND] as number;
        const f = w.options.scoreFactor;
        if ((round > 1 && f > 110) || (round > 0 && f < 110)) {
          w.bossState = S_WON;
          w.score += 10000;
          w.bossScored = 1;
          w.levelDone = true;
        }
        roundedExplosion(w, bw, bh);
        const x = (w.bossX[0] as number) + 2;
        w.bossX[0] = x;
        if (x >= 700) w.bossState = S_RESCAN;
        break;
      }
      case S_WON: {
        // `0x469E2A`: Explosion, Partikel, selten ein Kreis.
        roundedExplosion(w, bw, bh);
        const x = w.bossX[0] as number;
        const y = w.bossY[0] as number;
        effect(w, Effect.ShotHit, x, y, bw, bh);
        if (w.rnd.less(0.1)) {
          const ex = x + w.rnd.below(bw);
          const ey = y + w.rnd.below(bh);
          const r = w.rnd.below(70) + 30;
          effect(w, Effect.Crash, ex - r, ey - r, 2 * r, 2 * r);
        }
        break;
      }
      default:
        break;
    }

    // `0x4669D9`: Zeichnen, Optionen und Tod nur in den Zuständen 2…9 und 11.
    const s = w.bossState;
    if (!((s >= 2 && s <= 9) || s === S_WON)) return;
    w.bossVisible[0] = 1;
    if (w.optionCount > 0) {
      let a = (c[C_ANGLE] as number) + 3;
      if (a >= 360) a = 0;
      c[C_ANGLE] = a;
      const ow = w.level.enemies[opt]!.w;
      const oh = w.level.enemies[opt]!.h;
      const mx = fxFromInt((w.bossX[0] as number) + idiv(bw, 2) - idiv(ow, 2));
      const my = fxFromInt((w.bossY[0] as number) + idiv(bh, 2) - idiv(oh, 2));
      const sx = ORBIT_R * sinDeg(a);
      const sy = ORBIT_R * cosDeg(a);
      if (w.optionCount === 2) {
        w.bossX[2] = roundHalfEven(mx - sx);
        w.bossY[2] = roundHalfEven(my - sy);
        w.bossVisible[2] = 1;
      } else {
        w.bossX[2] = OFF;
        w.bossY[2] = OFF;
      }
      w.bossX[1] = roundHalfEven(mx + sx);
      w.bossY[1] = roundHalfEven(my + sy);
      w.bossVisible[1] = 1;
    } else {
      for (let p = 1; p < 3; p++) {
        w.bossX[p] = OFF;
        w.bossY[p] = OFF;
      }
    }
    if ((w.bossHP[0] as number) <= 0 && s < S_RETREAT) {
      // `0x46A2BB`: Kacheln 0…3 fahren ab, Rückzug, Schiff kurz unverwundbar.
      w.tileVX.fill(-1, 0, 4);
      w.bossState = S_RETREAT;
      w.invuln = 100;
    }
  },

  /** `0x44DD95`: Optionen schlucken Schüsse ohne Schaden, dann der Körper. */
  hit(w: World, bx: number, by: number, bw: number, bh: number, damage: number): number {
    if (partContourHit(w, 1, bx, by, bw, bh)) return 0;
    if (partContourHit(w, 2, bx, by, bw, bh)) return 0;
    if (!partContourHit(w, 0, bx, by, bw, bh)) return -1;
    damagePart(w, 0, damage, bx, by);
    return 0;
  },
};
