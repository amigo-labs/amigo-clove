import { cint, f32 } from "./vb";

/**
 * Spielerschiffe (`Me.B48[p]`, 0x70; Typ-Record `Me.A7C[p]`, 0xAC).
 * Bewegung `SpielTastenCheck` (`0x5078D0`) und `SpielKeysDove` (`0x507DB0`),
 * Kontakt `SpielFeindberührung` (`0x50B710`), Tod `KillDove` (`0x50B0D0`).
 * Befund: `docs/measurements/dovez-runtime.md` („Spieler“).
 */

/** Hitbox relativ zur Schiffsecke, für alle Schiffstypen gleich. */
export const HIT_LEFT = 0;
export const HIT_TOP = 17;
export const HIT_RIGHT = 64;
export const HIT_BOTTOM = 54;
/** Box, in der Gegnerschüsse treffen (streng überlappend). */
export const SHOT_HIT = { left: 5, top: 20, right: 60, bottom: 45 } as const;
export const START_X = 100;
export const START_SPEED = 6;
export const MAX_ENERGY = 100;
export const SPAWN_INVULNERABLE = 100;
/** Ticks von KillDove bis zum Neustart. */
export const DEATH_TICKS = 100;

export interface PlayerInput {
  left: boolean;
  up: boolean;
  right: boolean;
  down: boolean;
  fire: boolean;
  beam: boolean;
  switchWeapon: boolean;
  switchBeam: boolean;
  rotate: boolean;
  nova: boolean;
}

export const NO_INPUT: Readonly<PlayerInput> = {
  left: false,
  up: false,
  right: false,
  down: false,
  fire: false,
  beam: false,
  switchWeapon: false,
  switchBeam: false,
  rotate: false,
  nova: false,
};

/** Mündung je Schiffstyp: x und obere/untere Mündung je Neigung (0 hoch … 4 runter). */
export const MUZZLE = [
  { x: 45, y1: [26, 30, 39, 46, 49], y2: [50, 48, 39, 25, 24] },
  { x: 43, y1: [23, 26, 34, 38, 49], y2: [41, 40, 34, 29, 23] },
  { x: 44, y1: [27, 30, 38, 41, 43], y2: [46, 43, 38, 31, 25] },
] as const;

export class Player {
  x: number;
  y: number;
  pushX = 0;
  pushY = 0;
  vx = 0;
  vy = 0;
  /** 0 ganz hoch, 2 waagerecht, 4 ganz runter. */
  tilt = 2;
  tiltTimer = 0;
  keyTicks = 0;
  glide = false;
  animFrame = 0;
  fireCooldown = 0;
  /** Schussstärke 1–3, 0: kann nicht feuern. */
  shotPower = 1;
  extraWeapon = 0;
  speed = START_SPEED;
  /** 0 lebt, ab 1 Todessequenz (bis `DEATH_TICKS`). */
  deathTimer = 0;
  energy = MAX_ENERGY;
  maxEnergy = MAX_ENERGY;
  invulnerable = SPAWN_INVULNERABLE;
  /** 0 Spiel, 1–3 Levelausflug. */
  exitState = 0;
  /** Energie zu Tickbeginn (Unverwundbarkeit setzt sie zurück). */
  startEnergy = MAX_ENERGY;

  constructor(
    readonly index: number,
    readonly shipType: number,
    players: number,
  ) {
    this.x = START_X;
    this.y = (2 * index - (players - 1)) * 32 + 260;
  }

  get alive(): boolean {
    return this.deathTimer === 0;
  }

  /** Hitbox (x1, y1, x2, y2) für Wände, Kontakt, Power-ups; mit CLng wie das Original. */
  hitbox(dx = 0): [number, number, number, number] {
    return [
      cint(this.x + HIT_LEFT),
      cint(this.y + HIT_TOP),
      cint(this.x + HIT_RIGHT + dx),
      cint(this.y + HIT_BOTTOM),
    ];
  }
}

export interface PlayerWorld {
  readonly terrainSpeed: number;
  /** Unter Wasser (Wasserlinie über der Hitbox-Oberkante oder ganzes Level). */
  underwater(p: Player): boolean;
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  kill(p: Player): void;
}

/** `SpielTastenCheck`: Tasten in Bewegung und Neigung (Arcade: ohne Trägheit). */
function keys(p: Player, input: PlayerInput, w: PlayerWorld): void {
  const oldX = p.x;
  const oldY = p.y;
  let s = cint(p.speed);
  if (w.underwater(p)) s = cint(p.speed - 3);
  if (s < 1) s = 1;
  let moved = false;
  if (input.right) {
    p.x = f32(p.x + s);
    p.keyTicks++;
    moved = true;
  }
  if (input.left) {
    p.x = f32(p.x - s);
    p.keyTicks++;
    moved = true;
  }
  let vert = false;
  if (input.up) {
    moved = true;
    vert = true;
    p.keyTicks++;
    p.y = f32(p.y - s);
    if (p.tiltTimer === 0) {
      p.tilt--;
      p.tiltTimer = 5;
    } else p.tiltTimer--;
    if (p.tilt < 0) p.tilt = 0;
  }
  if (input.down) {
    moved = true;
    vert = true;
    p.keyTicks++;
    p.y = f32(p.y + s);
    if (p.tiltTimer === 0) {
      p.tilt++;
      p.tiltTimer = 5;
    } else p.tiltTimer--;
    if (p.tilt > 4) p.tilt = 4;
  }
  if (!vert) {
    if (p.tilt > 3) {
      p.tilt--;
      p.tiltTimer = 15;
    } else if (p.tilt < 1) {
      p.tilt++;
      p.tiltTimer = 15;
    }
    if (p.tiltTimer > 0) p.tiltTimer -= 2;
    else {
      if (p.tilt < 2) p.tilt++;
      else if (p.tilt > 2) p.tilt--;
      p.tiltTimer = 0;
    }
  }
  if (!moved) {
    if (p.keyTicks >= 10) p.glide = true;
    p.keyTicks = 0;
    if (p.glide) {
      p.vx = f32(p.vx * 0.85);
      p.vy = f32(p.vy * 0.85);
      if (Math.abs(p.vx) < 1 && Math.abs(p.vy) < 1) p.glide = false;
    }
  } else {
    p.vx = f32(p.x - oldX);
    p.vy = f32(p.y - oldY);
    p.glide = false;
  }
}

/** `SpielKeysDove` für einen Spieler. */
export function updatePlayer(p: Player, input: PlayerInput, w: PlayerWorld): void {
  if (!p.alive) return;
  if (p.exitState >= 1) {
    exitFlight(p);
    return;
  }
  // Landschaft voraus schiebt das Schiff mit der Scrollgeschwindigkeit nach links
  const [bx1, by1, bx2, by2] = p.hitbox(w.terrainSpeed);
  if (w.terrain(bx1, by1, bx2, by2)) {
    p.x = f32(p.x - w.terrainSpeed);
    if (p.x < -HIT_LEFT) {
      w.kill(p);
      return;
    }
  }
  const oldX = p.x;
  const oldY = p.y;
  p.x = f32(p.x + p.pushX);
  p.pushX = 0;
  p.y = f32(p.y + p.pushY);
  p.pushY = 0;
  keys(p, input, w);
  if (p.x + HIT_RIGHT > 800) p.x = 800 - HIT_RIGHT;
  if (p.x + HIT_LEFT < 0) p.x = 0 - HIT_LEFT;
  if (p.y + HIT_TOP < 0) p.y = 0 - HIT_TOP;
  if (p.y + HIT_BOTTOM > 550) p.y = 550 - HIT_BOTTOM;
  // Wände sperren achsenweise: zurück auf die Position zu Tickbeginn
  const hitAt = (x: number, y: number) =>
    w.terrain(cint(x + HIT_LEFT), cint(y + HIT_TOP), cint(x + HIT_RIGHT), cint(y + HIT_BOTTOM));
  if (hitAt(p.x, p.y)) {
    if (hitAt(oldX, p.y)) {
      if (hitAt(p.x, oldY)) {
        p.x = oldX;
        p.y = oldY;
      } else p.y = oldY;
    } else p.x = oldX;
  }
}

/** Levelausflug: auf y 243 steuern, dann mit 15 px/Tick nach rechts. */
function exitFlight(p: Player): void {
  if (p.exitState === 1) {
    p.invulnerable = 500;
    p.exitState = 2;
  }
  const d = cint(p.y + 32 - 275);
  if (d === 0) {
    if (p.exitState === 2) {
      p.exitState = 3;
      p.tilt = 2;
    } else p.x = f32(p.x + 15);
    return;
  }
  const a = Math.abs(d);
  const step = a > 200 ? 10 : a > 100 ? 5 : a > 20 ? 3 : a > 10 ? 2 : 1;
  p.y = f32(p.y - Math.sign(d) * step);
  p.tilt = d > 0 ? (a > 100 ? 0 : 1) : a > 100 ? 4 : 3;
}

/** `KillDove`: nur wenn verwundbar und nicht schon im Sterben. */
export function killPlayer(p: Player): boolean {
  if (p.invulnerable > 0 || p.deathTimer !== 0) return false;
  p.deathTimer = 1;
  return true;
}
