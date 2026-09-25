/**
 * Spielkonstanten aus `DOVE.exe`. Herleitung und Adressen:
 * `docs/measurements/{tick-rate,dove-events,dove-player,dove-enemies}.md`.
 */
import { fx } from "@clove/core";

/** Ein Tick = ein Durchlauf der Hauptschleife = eine Event-Zeile. */
export const TICK_MS = 14;

export const SCREEN_W = 640;
/** Spielfeldhöhe; darunter liegt das 70 px hohe HUD. */
export const FIELD_H = 410;

// Schiff
export const SHIP_START_X = 100;
export const SHIP_START_Y = 100;
export const SHIP_W = 40;
export const SHIP_H = 22;
export const SHIP_MIN_X = 6;
export const SHIP_MAX_X = 597;
export const SHIP_MIN_Y = 0;
export const SHIP_MAX_Y = 388;
export const SHIP_SPEED_DEFAULT = 6;
export const SHIP_SPEED_MIN = 2;
export const SHIP_SPEED_MAX = 8;
export const SHIP_SPEED_STEP = 2;
/** Trefferbox gegen Gegner: (X, Y+3, 40, 14). */
export const SHIP_HIT = { dy: 3, w: 40, h: 14 } as const;
/** Box gegen Wände (Schub und Rücknahme): (X, Y+3, 40, 16). */
export const SHIP_WALL = { dy: 3, w: 40, h: 16 } as const;
/** Box gegen Gegnerschüsse: X…X+40 × Y+5…Y+18. */
export const SHIP_SHOT_BOX = { dy0: 5, dy1: 18, w: 40 } as const;
export const INVULN_START = 200;
export const INVULN_DONE = 255;
export const DEATH_STEP = 2;
export const DEATH_END = 205;
export const LIVES_START = 2;
export const FLAME_BOOST_TIMER = 165;
export const FLAME_BOOST_STEP = 8;
export const FLAME_BOOST_END = 31;

// Basisschuss
export const SHOT_DX = 40;
export const SHOT_DY = 7;
export const SHOT_VX = 9;
export const SHOT_DAMAGE = 20;
export const SHOT_SIZE = 7;
export const SHOT_MAX_X = 631;

// Welt
export const TILE_VX = -1;
export const BG_SPEED_DEFAULT = fx(0.5);
export const CHECKPOINT_PREROLL = 1280;

// Extras: art → [Atlas-x in ss.spr, höchster Frameindex]
export const EXTRA_ART: Readonly<Record<number, readonly [number, number]>> = {
  [-2]: [175, 1],
  [-1]: [325, 7],
  0: [300, 5],
  1: [100, 3],
  2: [125, 3],
  3: [150, 3],
};
export const EXTRA_ANIM_TICKS = 6;
export const EXTRA_SIZE = 25;
export const EXTRA_PICKUP = 20;

// Gegner
export const ENEMY_SHOT_CHANCE: Readonly<Record<number, number>> = { 1: 0.002, 2: 0.005, 3: 0.02 };
export const ENEMY_FIREBALL_TICKS = 21;
export const ENEMY_AIM_SPEED = 3;
export const HOVER_STOP_X = 400;
export const HOVER_LEAVE_TICKS = 500;
export const HOVER_FIRE_TICKS = 31;
export const FALLER_DROP = 5;
export const SHAKE_POINTS = 450;
export const SHAKE_TICKS = 5;

/** Gegnerschuss-Arten: Sprite in ss.spr und Größe. */
export const ESHOT = {
  1: { sx: 21, sy: 85, w: 7, h: 7 },
  2: { sx: 0, sy: 136, w: 34, h: 14 },
} as const;
export const FIREBALL_VX = -5;

// Explosion.spr: 32 Frames à 50×50, 8 pro Zeile
export const EXPLOSION_FRAMES = 32;
export const EXPLOSION_SIZE = 50;

// Meteore (Level-1-Skript)
export const METEOR_SIZE = 60;
export const METEOR_SLOTS = 11;
export const METEOR_HP = 150;
export const METEOR_VX = -4;
export const METEOR_FIRST_TICK = 980;
export const METEOR_LAST_TICK = 1500;

/** Bosskampf beginnt (Hintergrund steht, Events enden), je Levelnummer. */
export const BOSS_TICK: Readonly<Record<number, number>> = {
  1: 6850,
  2: 7850,
  3: 8710,
  4: 8000,
  5: 7500,
  6: 8000,
  7: 8100,
  8: 10300,
  10: 750,
};
/** Level ohne Boss enden per Skript. */
export const END_TICK: Readonly<Record<number, number>> = { 9: 15600, 11: 7300 };

// Sterne statt background1: [erster Index, letzter Index, Faktor × Hintergrundtempo, Grauwert]
export const STAR_GROUPS: readonly (readonly [number, number, number, number])[] = [
  [0, 62, fx(1.5), 255],
  [63, 125, fx(1), 192],
  [126, 186, fx(0.5), 128],
  [187, 250, fx(0.25), 64],
];
export const STAR_COUNT = 251;

// Ausrüstung (docs/measurements/dove-weapons.md)
export const EXTRA_SCORE = 300;
export const SHIELD_TICKS = 500;
export const MAX_STAGE = 2;
export const MAX_OPTIONS = 2;
export const POD_FRONT = 80;
export const POD_REAR = 0;
export const COLOUR_BLUE = 1;
export const COLOUR_GREEN = 2;
export const COLOUR_RED = 3;
/** Feuer-Timer-Abstände (`timer = F4 + N` → alle N+1 Ticks). */
export const FIRE_BASE = 5;
export const FIRE_GREEN = 4;
export const FIRE_RED = 12;
export const FIRE_BOMB = 12;
export const BOMB_DAMAGE = 70;
export const BOMB_VY = 8;
export const BOMB_MAX_Y = 404;
export const BOMB_BOX = { w: 8, h: 6 } as const;
export const RED_DAMAGE = 15;
export const RED_REAR_DAMAGE = 40;
export const RED_SIZE = 7;
/** Grüne Bälle je Größe: Sprite in ss.spr und Trefferbox. */
export const GREEN_SIZES = [
  { sx: 34, sy: 70, w: 7, h: 7 },
  { sx: 21, sy: 70, w: 13, h: 13 },
  { sx: 0, sy: 70, w: 21, h: 20 },
  { sx: 50, sy: 61, w: 32, h: 31 },
] as const;
export const GREEN_VX = 10;
export const GREEN_SPLIT_VY = 9;
export const LASER_FRONT_DAMAGE = 1;
export const LASER_REAR_DAMAGE = 2;
export const BEAM_MAX = 200;
export const BEAM_SPEED = 10;
export const BEAM_BOSS_BUDGET = 1500;
/** Beam-Arten 1–4: Sprite, Lage relativ zum Schiff, Schaden = Ladung + bonus. */
export const BEAM_KINDS = [
  undefined,
  { sx: 36, sy: 183, w: 16, h: 12, dy: 6, bonus: 15 },
  { sx: 0, sy: 183, w: 35, h: 14, dy: 5, bonus: 30 },
  { sx: 0, sy: 168, w: 67, h: 14, dy: 5, bonus: 50 },
  { sx: 70, sy: 136, w: 88, h: 64, dy: -20, bonus: 0 },
] as const;
export const FULL_BEAM_DAMAGE = 500;
export const ABSORB_SCORE = 10;
export const ORBITER_SIZE = 9;
export const ORBITER_DAMAGE = 30;
export const ORBIT_RX = 40;
export const ORBIT_RY = 30;
export const ORBIT_STEP = 5;
