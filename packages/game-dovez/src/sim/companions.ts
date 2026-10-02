import type { DrawList, Effects } from "./effects";
import type { EnemyShot } from "./enemyFire";
import type { Player, PlayerInput } from "./player";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, type VbRnd } from "./vb";
import type { Force, Particle } from "./weapons";

/**
 * Begleitwaffen: die vier Partikel-Plätze des D-Tonator (`SpielPartikelMove`
 * `0x4DFE20`, `NextPartikel` `0x4DD3D0`, `SpielPartikel` `0x4E09B0`) und die
 * Force des D-Phyton (`SpielSateliet` `0x4DD5F0`), dazu ihre Power-ups aus
 * `SpielMoveSpezialObjekt`. Abgefeuert wird in `weapons.ts`. Befund:
 * `docs/measurements/dovez-runtime.md` („Begleitwaffen“).
 */

export interface CompanionWorld {
  readonly tick: number;
  readonly rnd: VbRnd;
  readonly fx: Effects;
  readonly players: readonly Player[];
  readonly playersMinus1: number;
  readonly particles: Particle[];
  readonly force: Force;
  readonly terrainSpeed: number;
  /** Option „Auto-Arrange“ (`Me.50E`, Vorgabe an). */
  readonly autoArrange: boolean;
  input(p: number): PlayerInput | undefined;
  /** `CheckColisionWithLandschaft3` mit `exclude = −1`. */
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  /** `CheckColisionWithEnemy` (Funken 0, durchschlagend 0, exclude −1). */
  hitEnemies(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    damage: number,
    owner: number,
    out?: { enemy: number; armored: boolean },
  ): number;
  /** Geschwindigkeit des Gegners `i` (`+0x74/+0x78`) und ob er fest ist. */
  enemyMotion(i: number): { vx: number; vy: number; solid: boolean };
  /** Gegnerschüsse, die Schilde und Force schlucken können. */
  shots(): readonly EnemyShot[];
  unblockable(shot: EnemyShot): boolean;
  addPoints(points: number, x: number, y: number, vy: number, player: number): void;
  sound(name: string): void;
}

/** D-Tonator-Spieler (`G.360`/`G.370`): im 2P der zweite, wenn der erste keiner ist. */
export function tonator(w: CompanionWorld): Player | undefined {
  const q = w.playersMinus1 === 1 && (w.players[0]?.shipType ?? 0) !== 0 ? 1 : 0;
  const p = w.players[q];
  return p?.shipType === 0 ? p : undefined;
}

/** Force-Besitzer (`G.350`): nur ein D-Phyton. */
export function phyton(w: CompanionWorld): Player | undefined {
  const q = w.playersMinus1 === 1 && (w.players[0]?.shipType ?? 1) !== 1 ? 1 : 0;
  const p = w.players[q];
  return p?.shipType === 1 ? p : undefined;
}

/**
 * `DoveReset` + `DovePosSetup` der Plätze: 0 und 1 aktiv und leer, 2 und 3
 * inaktiv mit Sorte −1; alle an der Schiffsmitte, Bild 11.
 */
export function resetParticles(particles: Particle[], ship: Player): void {
  particles.forEach((r, i) => {
    Object.assign(r, {
      cooldown: [180, 0, 90, 270][i]!,
      level: 0,
      x: cint(ship.x),
      y: cint(ship.y + 2),
      present: i < 2,
      kind: i < 2 ? 0 : -1,
      angle: 0,
      spin: 0,
      frame: 0,
      frameTimer: 0,
      highlight: 0,
      image: 11,
    });
  });
  ship.selected = 0;
}

/** `NextPartikel(p)`: nächsten aktiven Platz wählen, er leuchtet 50 Ticks grün. */
export function nextParticle(w: CompanionWorld, p: Player): void {
  w.sound("press_d");
  const ps = w.particles;
  if (ps.some((r) => r.present)) {
    do {
      p.selected++;
      if (p.selected === 4) p.selected = 0;
    } while (!ps[p.selected]!.present);
    ps[p.selected]!.highlight = 50;
  } else p.selected = -1;
}

/** Tastenriegel der Begleiter (`G.35C`, `G.35E`, `G.348`, `G.344`). */
export interface CompanionKeys {
  switchHeld: boolean;
  rotateHeld: boolean;
  /** Force: D war losgelassen (`G.348`) und Druckzähler im Rückruf (`G.344`). */
  forceReleased: boolean;
  forcePresses: number;
  /** Umlaufwinkel der Schilde (`Me.AA4`). */
  orbit: number;
}

export const newCompanionKeys = (): CompanionKeys => ({
  switchHeld: false,
  rotateHeld: false,
  forceReleased: false,
  forcePresses: 0,
  orbit: 0,
});

/** Sollposition eines Platzes (§2.1): Ellipse um die Schiffsmitte. */
function slotTarget(ship: Player, r: Particle, i: number, w: number): [number, number] {
  const fx = r.kind === -1 ? 52 : 40;
  const fy = (r.kind === 0 && i > 1) || r.kind < 0 ? 42 : 22;
  const d = degIndex(w);
  return [
    f32(fx * (SIN_DEG[d] ?? 0) + (32 + ship.x - 16)),
    f32(18 + ship.y - fy * (COS_DEG[d] ?? 0)),
  ];
}

/** `SpielPartikelMove`: Wechsel- und Drehtaste, Plätze nachführen, aus Wänden schieben. */
export function moveParticles(w: CompanionWorld, keys: CompanionKeys): void {
  const ship = tonator(w);
  if (!ship || !ship.alive) return;
  const input = w.input(ship.index);
  if (input?.switchWeapon) {
    if (!keys.switchHeld) {
      keys.switchHeld = true;
      nextParticle(w, ship);
    }
  } else keys.switchHeld = false;
  if (input?.rotate) {
    if (!keys.rotateHeld) {
      w.sound("item_switch");
      keys.rotateHeld = true;
      for (const r of w.particles) {
        if (r.spin === 0) r.spin = r.angle === 0 ? 4 : -4;
        else r.spin = -r.spin;
      }
    }
  } else keys.rotateHeld = false;
  keys.orbit += 8;
  w.particles.forEach((r, i) => {
    if (!r.present) return;
    let a: number;
    if (r.kind === -1) {
      r.cooldown = keys.orbit + [0, 180, 90, 270][i]!;
      if (r.cooldown >= 360) r.cooldown %= 360;
      a = r.cooldown;
    } else {
      a = (i % 2) * 180;
      if (r.kind > 0) {
        r.angle = f32(r.angle + r.spin);
        if (r.angle < 0) {
          r.spin = 0;
          r.angle = 0;
        }
        if (r.angle > 180) {
          r.spin = 0;
          r.angle = 180;
        }
        if (i === 2) a = cint(90 - r.angle);
        if (i === 3) a = cint(r.angle + 90);
      }
      if (a < 0) a += 360;
    }
    let [tx, ty] = slotTarget(ship, r, i, a);
    const d = idiv(Math.sqrt((r.x - tx) ** 2 + (r.y - ty) ** 2), 6) + 1;
    if ((d <= 5 && r.kind !== 0) || d > 20) {
      r.x = cint(tx);
      r.y = cint(ty);
    } else {
      const hx = ship.prevX;
      const hy = ship.prevY;
      if (ship.y < hy && i % 2 === 0) ty = f32(ty + ship.speed);
      if (ship.y > hy && i % 2 === 1) ty = f32(ty - ship.speed);
      if (ship.x < hx && i > 1) tx = f32(tx + ship.speed);
      if (ship.x > hx && i > 1) tx = f32(tx - ship.speed);
      const n = cint(Math.sqrt((r.x - tx) ** 2 + (r.y - ty) ** 2) / 3 + 1);
      if (r.x > tx) r.x -= n;
      if (r.x < tx) r.x += n;
      if (r.y > ty) r.y -= n;
      if (r.y < ty) r.y += n;
    }
    if (r.kind === -1) {
      if (w.terrain(r.x, r.y, r.x + 32, r.y + 32))
        w.fx.addSparks(1, 2, r.x + 32, r.y + 32, r.x + 32, r.y + 32, true);
      return;
    }
    const cx = f32(32 + ship.x - 16);
    const cy = f32(18 + ship.y);
    for (let k = 0; k < 20 && w.terrain(r.x, r.y, r.x + 32, r.y + 32); k++) {
      if (r.x > cx) r.x -= 2;
      if (r.x < cx) r.x += 2;
      if (r.y > cy) r.y -= 2;
      if (r.y < cy) r.y += 2;
    }
  });
}

/**
 * `SpielPartikel`: Animation, Schilde (50 Schaden je Tick, schlucken
 * Gegnerkugeln), das zweite Abkühlen der Waffen, Zeichnen.
 */
export function stepParticles(w: CompanionWorld, out: DrawList): void {
  const ship = tonator(w);
  if (!ship || !ship.alive) return;
  w.particles.forEach((r, i) => {
    if (!r.present) return;
    r.frameTimer++;
    if (r.frameTimer >= 5) {
      r.frameTimer = 0;
      r.frame++;
    }
    if (r.frame > 5) r.frame = 0;
    let b: number;
    if (r.kind < 0) {
      w.hitEnemies(r.x, r.y, r.x + 32, r.y + 32, 50, ship.index);
      swallow(w, r.x, r.y, r.x + 32, r.y + 32, r.x + 16, r.y + 16, ship.index);
      b = 13;
    } else if (r.kind === 0) b = 11;
    else {
      b = r.frame;
      r.cooldown--;
    }
    if (r.frameTimer === 0) {
      if (b > r.image) r.image++;
      else if (b < r.image) {
        if (r.image === 5 && b === 0) r.image = 0;
        else r.image--;
      }
    }
    if (r.highlight > 0) r.highlight--;
    if (r.image > 13) r.image = 0;
    const f = f32((50 - r.highlight) / 50);
    const rot = cint((2 * (i % 2) - 1) * r.angle);
    out.quad(`partikel${r.image}`, r.x, r.y, r.x + 32, r.y + 32, f, 1, f, 1, false, rot);
  });
}

/** Gegnerkugeln im Kasten schlucken: Punkte = Kugelschaden; `true`, wenn eine geschluckt wurde. */
function swallow(
  w: CompanionWorld,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number,
  owner: number,
): boolean {
  let any = false;
  for (const s of w.shots()) {
    if (!s.active || s.shockwave || w.unblockable(s)) continue;
    const a = s.actor;
    if (a.x < x2 && a.x + a.width > x1 && a.y < y2 && a.y + a.height > y1) {
      w.addPoints(cint(s.damage), f32(px), f32(py), -1, owner);
      s.active = false;
      any = true;
    }
  }
  return any;
}

/** Wirkung der Power-ups auf Partikel und Force; `false`: nicht für diesen Spieler. */
export function pickupCompanion(
  w: CompanionWorld,
  p: Player,
  subtype: number,
  item: number,
): boolean {
  const ps = w.particles;
  if (subtype === 0) {
    // Extra: Waffe auf einen Platz
    if (p.shipType !== 0 || !p.alive) return false;
    if (p.selected < 0) return true;
    if (w.autoArrange) {
      let n = ps.filter((r) => !r.present || r.kind === 0).length;
      if (n === 4) {
        if (ps[2]!.present) p.selected = 2;
        else n = 0;
      }
      if (n < 4) {
        let found = false;
        for (let i = 3; i >= 0; i--) {
          const r = ps[i]!;
          if (r.present && r.kind === item + 1 && r.level < 3) {
            p.selected = i;
            found = true;
          }
        }
        if (!found) {
          let k = 4;
          for (const i of [1, 0, 3, 2]) if (ps[i]!.present && ps[i]!.kind === 0) k = i;
          if (k < 4) p.selected = k;
        }
      }
    }
    const r = ps[p.selected]!;
    if (r.kind === item + 1) {
      if (r.level < 3) r.level++;
    } else r.level = 1;
    r.kind = cint(item + 1);
    r.cooldown = 0;
    if (w.autoArrange) {
      const first = w.players[0];
      if (first) nextParticle(w, first);
    }
    return true;
  }
  if (subtype === 3 && item === 0) {
    // neuer Platz
    if (p.shipType !== 0) return false;
    const i = ps.findIndex((r) => !r.present);
    if (i < 0) return true;
    const r = ps[i]!;
    r.present = true;
    r.kind = 0;
    r.cooldown = 0;
    r.x = cint(p.x);
    r.y = cint(p.y + 2);
    if (i === 3) {
      r.spin = -ps[0]!.spin;
      r.angle = f32(180 - ps[0]!.angle);
    }
    if (p.selected === -1) nextParticle(w, p);
    return true;
  }
  if (subtype === 3 && item === 1) {
    // Schild
    if (p.shipType !== 0 || p.selected <= -1) return false;
    if (w.autoArrange) {
      const n = ps.filter((r) => !r.present || r.kind === 0).length;
      if (n === 4) {
        if (ps[2]!.present) p.selected = 2;
        if (ps[3]!.present) p.selected = 3;
      } else {
        let k = 4;
        for (let i = 3; i >= 0; i--) if (ps[i]!.kind === 0) k = i;
        if (k < 4) p.selected = k;
      }
    }
    const r = ps[p.selected]!;
    r.kind = -1;
    r.level = 0;
    if (w.autoArrange) {
      nextParticle(w, p);
      if (ps.filter((q) => q.present && q.kind !== 0).length === 4) {
        ps.forEach((q, i) => {
          if (q.present && q.kind > 0) p.selected = i;
        });
      }
    }
    return true;
  }
  if (subtype === 4) {
    // P2Extra: Force erscheinen lassen bzw. Stufe und Farbe
    if (p.shipType !== 1) return false;
    const f = w.force;
    f.cooldown = 1;
    f.color = cint(item);
    if (f.level < 2) f.level++;
    if (!f.present) {
      f.present = true;
      f.x = -64;
      f.y = p.y;
      f.state = 5;
      f.level = 0;
    }
    return true;
  }
  return true;
}

/** `KillDove`-Anteil: Partikel sprühen Funken, die Force bleibt zurück (2P, Stufe > 0) oder zerplatzt. */
export function killCompanions(w: CompanionWorld, p: Player, bossAlive: boolean): void {
  const f = w.force;
  if (p.shipType === 1 && f.present) {
    if (f.level > 0 && w.playersMinus1 === 1 && !bossAlive) {
      if (f.state === 1 || f.state === 5) f.state = 3;
      else if (f.state === 2) f.state = 4;
      f.level = 0;
    } else {
      w.fx.addFireballs(f.x, f.y, f.x + 64, f.y + 64, 1, 0.2, 0.3, 32, 10, 15);
      f.present = false;
    }
  }
  if (p.shipType === 0) {
    for (const r of w.particles)
      if (r.present) w.fx.addSparks(1, 50, r.x + 32, r.y + 32, r.x + 32, r.y + 32, true);
  }
}

/** `SpielSateliet`: die Force (Tasten, angedockt/frei, Kontakt, Kugelblock, Zeichnen). */
export function stepForce(w: CompanionWorld, keys: CompanionKeys, out: DrawList): void {
  const f = w.force;
  const ship = phyton(w);
  if (!f.present || !ship) return;
  let hitFlash = false;
  const input = w.input(ship.index);
  if (input?.switchWeapon) {
    if (keys.forceReleased) {
      switch (f.state) {
        case 1:
          f.vx = 20;
          f.state = 3;
          w.sound("force_off");
          f.cooldown = 10;
          break;
        case 2:
          f.vx = -20;
          f.state = 4;
          w.sound("force_off");
          f.cooldown = 10;
          break;
        case 3:
        case 4:
          f.state = 5;
          if (f.x + 70 < ship.x) f.vx = 12;
          if (ship.x + 64 < f.x - 70) f.vx = -12;
          if (f.y + 50 < ship.y) f.vy = 12;
          if (ship.y + 64 < f.y - 50) f.vy = -12;
          keys.forcePresses = 0;
          break;
        case 5:
          keys.forcePresses++;
          if (keys.forcePresses >= 3) {
            if (f.x + 70 < ship.x) {
              f.x = f32(f.x + 5);
              f.vx = 10;
            }
            if (ship.x + 64 < f.x - 70) {
              f.x = f32(f.x - 5);
              f.vx = -10;
            }
            if (f.y + 20 < ship.y) {
              f.y = f32(f.y + 5);
              f.vy = 10;
            }
            if (f.y - 20 > ship.y) {
              f.y = f32(f.y - 5);
              f.vy = -10;
            }
          }
          break;
      }
    }
    keys.forceReleased = false;
  } else keys.forceReleased = true;
  const lvl = ship.shotPower;
  const out2 = { enemy: -1, armored: false };
  const box = () => [cint(f.x + 16), cint(f.y + 16), cint(f.x + 48), cint(f.y + 48)] as const;
  if (f.state <= 2) {
    f.vx = 0;
    f.vy = 0;
    f.y = ship.y;
    f.x = f32(ship.x + (f.state === 1 ? 60 : -60));
    const rest = w.hitEnemies(...box(), f.adc, ship.index, out2);
    if (rest < f.adc) {
      f.adc = Math.trunc(f.adc / 2);
      if (f.adc < 10 * (lvl + 2)) f.adc = 10 * (lvl + 2);
      if (!out2.armored) hitFlash = true;
    } else {
      f.adc += 25;
      if (f.adc > 50 * (lvl + 4)) f.adc = 50 * (lvl + 4);
    }
  } else hitFlash = freeForce(w, f, ship, out2) || hitFlash;
  drawForce(w, f, out, hitFlash, ship.index);
}

/** §3.4: frei fliegende Force (Zustände 3, 4, 5); `true`, wenn sie ein ungepanzertes Teil traf. */
function freeForce(
  w: CompanionWorld,
  f: Force,
  ship: Player,
  out2: { enemy: number; armored: boolean },
): boolean {
  const fx = w.fx;
  const lvl = ship.shotPower;
  let hitFlash = false;
  if (Math.abs(f.vx) > 0) fx.addBig(f.x, f.y, 0, 0, 1, 0.2, 0.3, 64, 0, 5, 1, 0);
  else if (f.state === 3) {
    if (f.x < 548) f.vx = 3;
    else if (f.x > 552) f.vx = -3;
    if (ship.x + 32 > f.x) f.state = 4;
  } else if (f.state === 4) {
    if (f.x > 52) f.vx = -3;
    else if (f.x < 48) f.vx = 3;
    if (ship.x + 32 < f.x) f.state = 3;
  }
  const box = () => [cint(f.x + 16), cint(f.y + 16), cint(f.x + 48), cint(f.y + 48)] as const;
  const L = () => w.terrain(...box());
  const toShip = () => {
    if (ship.x + 35 < f.x) f.vx = -5;
    if (ship.x + 29 > f.x) f.vx = 5;
    if (ship.y + 3 < f.y) f.vy = -5;
    if (ship.y - 3 > f.y) f.vy = 5;
  };
  const wave = (life: number) =>
    fx.addBig(
      f.x,
      f.y,
      0,
      0,
      f32(1.3 - 0.5 * f.level),
      0.2,
      f32(0.5 * f.level + 0.3),
      64,
      0,
      life,
      2,
      10,
    );
  f.x = f32(f.x + f.vx);
  f.y = f32(f.y + f.vy);
  if (L()) {
    f.x = f32(f.x - f.vx);
    if (L()) {
      f.x = f32(f.x + f.vx);
      f.y = f32(f.y - f.vy);
      if (L()) {
        f.x = f32(f.x - f.vx);
        if (L()) {
          const v3 = w.terrainSpeed;
          f.x = f32(f.x - 2 * v3);
          if (L()) {
            f.vx = 0;
            f.vy = 0;
            f.x = f32(f.x + 2 * v3);
            toShip();
            f.x = f32(f.x + f.vx);
            f.y = f32(f.y + f.vy);
            if (w.tick % 10 === 0) wave(20);
          }
        }
      }
    }
  }
  const rest = w.hitEnemies(...box(), f.adc, ship.index, out2);
  if (rest < f.adc) {
    f.adc = Math.trunc(f.adc / 2);
    if (f.adc < 15 * (lvl + 1)) f.adc = 15 * (lvl + 1);
    f.x = f32(f.x - f.vx);
    if (!out2.armored) hitFlash = true;
    const probe = () => w.hitEnemies(...box(), -1, ship.index, out2) === 0;
    if (probe()) {
      f.y = f32(f.y - f.vy);
      f.x = f32(f.x + f.vx);
      if (probe()) {
        f.x = f32(f.x - f.vx);
        if (probe()) {
          const m = w.enemyMotion(out2.enemy);
          const hx = m.vx / 2;
          const hy = m.vy / 2;
          f.vx = f32(hx + 2 * Math.sign(hx));
          f.vy = f32(hy + 2 * Math.sign(hy));
          const stuck = m.solid && out2.armored;
          if (f.vy === 0 && (f.vx === 0 || stuck)) toShip();
          f.x = f32(f.x + f.vx);
          f.y = f32(f.y + f.vy);
          if (!stuck) wave(12);
        }
      }
    }
  } else {
    f.adc += 25;
    if (f.adc > 250) f.adc = 250;
  }
  const hx = ship.histX[0] ?? ship.x;
  const hy = ship.histY[0] ?? ship.y;
  if (Math.abs(f.vx) > 3) f.vx = f32(f.vx - Math.sign(f.vx));
  else {
    f.vx = 0;
    if (f.state === 5) {
      if (hx + 2 < f.x) f.vx = -3;
      if (hx - 2 > f.x) f.vx = 3;
    }
  }
  if (Math.abs(f.vy) > 3) f.vy = f32(f.vy - Math.sign(f.vy));
  else {
    f.vy = 0;
    if (f.state === 5) {
      if (hy + 2 < f.y) f.vy = -3;
      if (hy - 2 > f.y) f.vy = 3;
    } else {
      if (hy + 1 < f.y) f.vy = -2;
      if (hy - 1 > f.y) f.vy = 2;
    }
  }
  if (f.x < -64) f.x = -64;
  if (f.x > 736) f.x = 736;
  if (f.y < -20) f.y = -20;
  if (f.y > 506) f.y = 506;
  if (ship.y - 15 < f.y && ship.y + 15 > f.y) {
    if (f.x >= ship.x && ship.x + 74 > f.x) dock(w, f, ship, 1);
    else if (ship.x - 74 < f.x && f.x < ship.x) dock(w, f, ship, 2);
  }
  return hitFlash;
}

/** Andocken vorn (1) oder hinten (2): 21 Glutfunken mit je 4 `Rnd`, Welle, `force_on`. */
function dock(w: CompanionWorld, f: Force, ship: Player, z: 1 | 2): void {
  f.state = z;
  const rnd = w.rnd;
  const xs = z === 1 ? ship.x + 58 : ship.x - 4;
  for (let k = 0; k <= 20; k++) {
    const r1 = rnd.next();
    const r2 = rnd.next();
    const r3 = rnd.next();
    const r4 = rnd.next();
    const gx = z === 1 ? r3 * 6 - 5 : r3 * 6 - 1;
    w.fx.addBig(
      f32(r1 * 6 + xs),
      f32(r2 * 60 + ship.y),
      f32(gx),
      f32(r4 * 6 - 3),
      1,
      0.8,
      0.8,
      4,
      5,
      10,
      1,
      1,
    );
  }
  const wx = z === 1 ? ship.x + 62 : ship.x - 2;
  w.fx.addBig(wx, f32(ship.y + 30), z === 1 ? -3 : 5, 0, 1, 0.2, 0.3, 4, 3, 10, 3, 2);
  w.sound("force_on");
}

/** §3.5: Animation, Aura, Sprite, Glitzer-Ringe, Kern; Kugelblock; Treffer-Rückmeldung. */
function drawForce(
  w: CompanionWorld,
  f: Force,
  out: DrawList,
  hitFlash: boolean,
  owner: number,
): void {
  f.frameTimer++;
  if (f.frameTimer >= 4) {
    f.frameTimer = 0;
    f.frame++;
    if (f.frame >= 7) f.frame = 0;
  }
  const d = (2 - f.level) * 8;
  out.quad(
    "a_kreis2",
    f.x + d,
    f.y + d,
    f.x + 64 - d,
    f.y + 64 - d,
    f32(1 - 0.5 * f.level + 0.3),
    0.2,
    f32(0.5 * f.level + 0.3),
    1,
    true,
  );
  const key = `force_0${f.level + 1}000${f.frame}`;
  const x = cint(f.x);
  const y = cint(f.y);
  out.quad(key, x, y, x + 64, y + 64);
  for (let j = 1; j <= 2 * f.level + 3; j++) {
    for (let k = 1; k <= 10; k++) {
      const a = (w.tick + k) * 2 * j;
      const gx = f32((30 - Math.trunc(d / 2)) * (SIN_DEG[degIndex(a)] ?? 0) + f.x + 28);
      const gy = f32(30 * (COS_DEG[degIndex(cint(a * 0.6))] ?? 0) + f.y + 28);
      out.quad("a_kreis2", gx, gy, gx + 8, gy + 8, 1, 1, 0.2, k / 20);
    }
  }
  out.quad("a_kreis2", f.x + 8 + d, f.y + 8 + d, f.x + 56 - d, f.y + 56 - d, 1, 1, 1, 0.7, true);
  if (swallow(w, f.x + 16, f.y + 16, f.x + 48, f.y + 48, f.x + 32, f.y + 32, owner))
    w.fx.addBig(f.x, f.y, 0, 0, 1, 1, 0.2, 64, 0, 20, 2, 10);
  if (hitFlash) {
    if (w.tick % 5 === 0) w.fx.addBig(f.x, f.y, 0, 0, 1, 1, 1, 64, 6, 8, 2, 10);
    out.quad(
      "a_kreis2",
      f.x + 8 + d,
      f.y + 8 + d,
      f.x + 56 - d,
      f.y + 56 - d,
      1,
      0.1,
      0.1,
      1,
      true,
    );
    // das additive Force-Bild landet im Original am HUD-Symbol (unter dem HUD, unsichtbar)
  }
}
