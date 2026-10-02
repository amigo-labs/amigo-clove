import { Effect, effect, spawnExplosion } from "../actions";
import { ShotKind, addEnemyShotForced } from "../enemyShots";
import { idiv } from "../math";
import { spawnEnemyAt, spawnTile } from "../spawn";
import type { BossScript, World } from "../world";
import { genericHit, partHeight, setPart, typeByName } from "./common";

/**
 * Level 5 — E5 „16 - Endgegner“ (239×165, HP 8000), `Endgegner5` `0x465790`,
 * Zustandstabelle `0x466858`. Der Hintergrund scrollt im Kampf weiter.
 *
 * Zähler (`Me.3A0` +1C…+2C): c0 Salven- bzw. Zapfentakt (+1C), c1 vy (+20),
 * c2 Bodentakt (+24), c3 gemerkte Option `Me.634` (+28), c4 Phasenzähler (+2C).
 * Zustände: 0 Init, 1 Einflug, 2 Salven, 3 (und > 7) nur zeichnen, 4 Tod,
 * 5 Sprung hoch, 6 Landung, 7 Zapfen.
 */

/** Unterkante der Bahn (y + h), zugleich Oberkante des laufenden Bodens. */
const FLOOR_Y = 384;

/**
 * Zapfen (Typ 7, Code −6 mit vy 16 → fällt sofort 5 px/Tick) an x = Spieler-X,
 * y = −110 (`0x465D44`, `0x4664CD`). Das Original sucht ab `Me.458` den ersten
 * freien Slot — wie `HintPool.alloc`.
 */
function dropIcicle(w: World): void {
  const i = spawnEnemyAt(w, typeByName(w, "Zapfen"), w.px, -110, -6);
  // Phase 16 = die vy-16-Stufe des Fallers: kein Wackeln, sofort fallen.
  if (i >= 0) w.enAux[i] = 16;
}

/**
 * Salve (`0x465AEA`): drei Feuerbälle an (x+82, y+17), (x, y+82), (x+82, y+148).
 * Der Code rechnet mit (b−t)/2 = 82 statt w/2 — so übernommen.
 */
function volley(w: World): void {
  const x = w.bossX[0] as number;
  const y = w.bossY[0] as number;
  const h = partHeight(w, 0);
  const half = idiv(h, 2);
  // `Me.634 = 1` um die Aufrufe, danach der beim Init gemerkte Wert (c3) —
  // gleichwertig mit `addEnemyShotForced`, das den laufenden Wert zurückschreibt.
  addEnemyShotForced(w, ShotKind.Fireball, x + half, y + 17);
  addEnemyShotForced(w, ShotKind.Fireball, x, y + half);
  addEnemyShotForced(w, ShotKind.Fireball, x + half, y + h - 17);
}

/**
 * Zustand 4 (`0x4660BD`): Kreis bei Rnd < 0,1 fest an (x+145, y+90) mit Radius
 * `Int(Rnd·70)+30`, Explosion an (x+Int(Rnd·230), y+Int(Rnd·100)), Partikel bis
 * (x+290, y+180); einmalig +10000 (solange `Me.264` nicht gesetzt), `Me.264 = True`.
 */
function dying(w: World): void {
  const x = w.bossX[0] as number;
  const y = w.bossY[0] as number;
  if (w.rnd.less(0.1)) {
    const r = w.rnd.below(70) + 30;
    effect(w, Effect.Crash, x + 145 - r, y + 90 - r, 2 * r, 2 * r);
  }
  const ex = x + w.rnd.below(230);
  const ey = y + w.rnd.below(100);
  spawnExplosion(w, ex, ey);
  effect(w, Effect.ShotHit, x, y, 290, 180);
  if (!w.levelDone && !w.bossScored) {
    // `VarAdd` direkt auf `Me.104`, ohne Punktefaktor.
    w.bossScored = 1;
    w.score += 10000;
  }
  w.levelDone = true;
}

export const boss5: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    // Laufender Boden vor der Zustandsauswahl (`0x4657CA`): alle 255 Ticks
    // Tile #1 (255×25) an (640, 384), vx −1.
    if ((c[2] as number) >= 254) {
      c[2] = 0;
      spawnTile(w, 1, FLOOR_Y, 640, -1, 0);
    } else {
      c[2] = (c[2] as number) + 1;
    }
    switch (w.bossState) {
      case 0:
        setPart(w, 0, typeByName(w, "16 - Endgegner"), 640, 100, 8000);
        w.bossState = 1;
        c[0] = 0;
        c[1] = 0;
        // 255: das erste Bodenstück kommt schon im nächsten Tick.
        c[2] = 255;
        c[3] = w.shotOption;
        c[4] = 0;
        break;
      case 1:
        // Einflug: x −= 2 bis 360 (`0x465983`).
        w.bossX[0] = (w.bossX[0] as number) - 2;
        if (w.bossX[0] === 360) {
          c[1] = 2;
          c[4] = 0;
          w.bossState = 2;
        }
        break;
      case 2: {
        // Auf und ab mit vy ±2 zwischen 0 und y+h = 384 (`0x4659AA`).
        const h = partHeight(w, 0);
        const y = w.bossY[0] as number;
        if (y + (c[1] as number) < 0 || y + h + (c[1] as number) > FLOOR_Y)
          c[1] = -(c[1] as number);
        w.bossY[0] = y + (c[1] as number);
        c[0] = (c[0] as number) + 1;
        if ((c[0] as number) > 35) {
          volley(w);
          c[0] = 0;
          // Negativer Phasenzähler: je Salve zusätzlich ein Zapfen.
          if ((c[4] as number) < 0) dropIcicle(w);
          c[4] = (c[4] as number) + 1;
          if (c[4] === 30) w.bossState = 5;
        }
        break;
      }
      case 4:
        dying(w);
        break;
      case 5:
        // Sprung: y −= 10 bis y < 0 (`0x46639B`).
        w.bossY[0] = (w.bossY[0] as number) - 10;
        if ((w.bossY[0] as number) < 0) w.bossState = 6;
        break;
      case 6: {
        // Landung: y += 10, bei y+h ≥ 384 auf y = 384 − h, Wackeln 10 (`0x4663B1`).
        const h = partHeight(w, 0);
        const y = (w.bossY[0] as number) + 10;
        w.bossY[0] = y;
        if (y + h >= FLOOR_Y) {
          w.bossY[0] = FLOOR_Y - h;
          w.bossState = 7;
          c[0] = 50;
          c[4] = 0;
          w.shake = 10;
        }
        break;
      }
      case 7:
        // Alle 51 Ticks ein Zapfen, nach 3 zurück zu den Salven mit Zähler −4 (`0x4664BB`).
        c[0] = (c[0] as number) + 1;
        if ((c[0] as number) > 50) {
          c[0] = 0;
          dropIcicle(w);
          c[4] = (c[4] as number) + 1;
          if ((c[4] as number) >= 3) {
            w.bossY[0] = (w.bossY[0] as number) - 1;
            c[1] = 2;
            c[4] = -4;
            w.bossState = 2;
          }
        }
        break;
      default:
        // Zustand 3 und > 7: nur zeichnen (`0x466036`).
        break;
    }
    // Gemeinsames Ende (`0x4660A6`): HP ≤ 0 → Zustand 4.
    if ((w.bossHP[0] as number) <= 0) w.bossState = 4;
  },
  hit: genericHit,
};
