import { MUZZLE, type Player, type PlayerInput } from "./player";
import { cint, f32 } from "./vb";

/**
 * Spielerschüsse (`Me.B8C`, 2 Ebenen × 1001 Slots, `AddSchuss` `0x4DD0F0`,
 * `KillSchuss` `0x4D36D0`), Abfeuern `SpielSchieß` (`0x4E2C20`) und die
 * Gruppe A der Bewegung (`SpielMoveSchuss` `0x4D37C0`: Typen −2…1, alle
 * Hauptschüsse). Ebene 0 läuft vor den Gegnern, Ebene 1 danach.
 *
 * Noch nicht portiert: Zweitwaffen (Typ 11–13), Partikel, Force, Beam, Nova.
 */

export const SHOT_SLOTS = 1001;
export const SHOT_BOX = 16;
export const SHOT_SPEED = 11;

export interface PlayerShot {
  active: boolean;
  type: number;
  /** Waffenstufe (Typ-Parameter). */
  param: number;
  damage: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
  owner: number;
}

export class ShotLayer {
  readonly shots: PlayerShot[] = Array.from({ length: SHOT_SLOTS }, () => ({
    active: false,
    type: 0,
    param: 0,
    damage: 0,
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
    owner: 0,
  }));
  hint = 0;
  high = -1;

  add(
    type: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    param: number,
    damage: number,
    owner: number,
  ): void {
    for (let i = this.hint; i < SHOT_SLOTS; i++) {
      const s = this.shots[i]!;
      if (s.active) continue;
      Object.assign(s, {
        active: true,
        type,
        x: f32(x),
        y: f32(y),
        vx: f32(vx),
        vy: f32(vy),
        param: f32(param),
        damage: f32(damage),
        owner,
      });
      if (i > this.high) this.high = i;
      this.hint = i + 1;
      return;
    }
  }

  kill(i: number): void {
    if (this.hint > i) this.hint = i;
    this.shots[i]!.active = false;
    if (i === this.high) {
      let h = i - 1;
      while (h >= 0 && !this.shots[h]!.active) h--;
      this.high = h;
    }
  }
}

export interface ShotHost {
  /** Restschaden nach `CheckColisionWithEnemy`. */
  hitEnemies(x1: number, y1: number, x2: number, y2: number, damage: number, owner: number): number;
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  /** Glut beim Einschlag (Typfarbe); an der Landschaft zusätzlich ein Funke. */
  glow(x: number, y: number, kind: number, terrain: boolean): void;
  /** Leuchtspur ab Waffenstufe 2, vor der Bewegung. */
  trail(s: PlayerShot): void;
}

/** `SpielSchieß`, nur der Hauptschuss: Abkühlzeit 6 (Schiff 0, 2) bzw. 12 (Schiff 1). */
export function firePrimary(
  p: Player,
  input: PlayerInput,
  layers: readonly ShotLayer[],
  beamPower: boolean,
): void {
  if (!p.alive) return;
  if (p.fireCooldown > 0) p.fireCooldown--;
  if (!input.fire || p.fireCooldown !== 0 || p.shotPower <= 0) return;
  const lvl = p.shotPower;
  const mult = beamPower ? 2 : 1;
  const m = MUZZLE[p.shipType] ?? MUZZLE[0];
  const y1 = m.y1[p.tilt] ?? 0;
  const y2 = m.y2[p.tilt] ?? 0;
  let type: number;
  let dx = 0;
  let one: number;
  let twin: number;
  if (p.shipType === 1) {
    p.fireCooldown = 12;
    type = 1;
    one = mult * (100 * lvl + 140);
    twin = mult * (50 * lvl + 70);
  } else {
    p.fireCooldown = 6;
    type = p.shipType === 2 ? -1 : 0;
    dx = p.shipType === 2 ? -5 : 0;
    one = 40 * mult * (lvl + 2);
    twin = 20 * mult * (lvl + 2);
  }
  const x = p.x + m.x + dx;
  if (y1 === y2) layers[1]!.add(type, x, p.y + y1 - 7, SHOT_SPEED, 0, lvl, one, p.index);
  else {
    layers[0]!.add(type, x, p.y + y2 - 7, SHOT_SPEED, 0, lvl, twin, p.index);
    layers[1]!.add(type, x, p.y + y1 - 7, SHOT_SPEED, 0, lvl, twin, p.index);
  }
}

/** `SpielMoveSchuss(Ebene)`, Gruppe A: bewegen, aussortieren, Gegner, Landschaft. */
export function moveShots(layer: ShotLayer, host: ShotHost): void {
  for (let i = 0; i <= layer.high; i++) {
    const s = layer.shots[i]!;
    if (!s.active || s.type < -2 || s.type > 1) continue;
    const kind = s.type >= 0 ? s.type : Math.abs(s.type) + 1;
    if (s.param > 1) host.trail(s);
    s.x = f32(s.x + s.vx);
    s.y = f32(s.y + s.vy);
    if (s.x > 800 || s.x + SHOT_BOX < 0 || s.y > 550 || s.y + SHOT_BOX < 0) {
      layer.kill(i);
      continue;
    }
    const x1 = cint(s.x);
    const y1 = cint(s.y);
    const rem = host.hitEnemies(x1, y1, x1 + SHOT_BOX, y1 + SHOT_BOX, cint(s.damage), s.owner);
    s.damage = f32(rem);
    if (rem === 0) {
      layer.kill(i);
      host.glow(s.x, s.y, kind, false);
      continue;
    }
    if (host.terrain(x1, y1, x1 + SHOT_BOX, y1 + SHOT_BOX)) {
      layer.kill(i);
      host.glow(s.x, s.y, kind, true);
    }
  }
}
