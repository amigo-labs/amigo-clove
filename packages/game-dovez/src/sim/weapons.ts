import { fireDrones, type Drones } from "./drones";
import type { DrawList, Effects } from "./effects";
import { MUZZLE, type Player, type PlayerInput } from "./player";
import { SHOT_SPEED, type ShotLayer } from "./playerShots";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, vbInt, type VbRnd } from "./vb";

/**
 * `SpielSchieß` (`0x4E2C20`): das Abfeuern aller Spielerwaffen, je Spieler
 * vollständig (Haupt-, Zweit-, Schiffswaffe, Mündungsfunken), dann die
 * Schleifentöne. Feuer zählt gehalten, ohne Flanke; gesperrt, solange
 * Spieler 1 im Levelausflug ist. Befund: `docs/measurements/dovez-runtime.md`
 * („Spielerwaffen“). Beam und Nova lösen anderswo aus.
 */

/** Force des D-Phyton (`Me.AA8…AD8`), ein Objekt für beide Spieler. */
export interface Force {
  /** Abklingzeit der Force-Waffe (`Me.AA8`). */
  cooldown: number;
  /** Stufe 0…2 (`Me.AAC`). */
  level: number;
  x: number;
  y: number;
  /** Vorhanden (`Me.AB8`). */
  present: boolean;
  /** Farbe 0 blau, 1 rot, 2 gelb, 3 grün, 4 violett (`Me.ABC`). */
  color: number;
  /** 1 vorn angedockt, 2 hinten, 3/4 vor-/rückwärts abgeschossen, 5 frei (`Me.AD0`). */
  state: number;
  vx: number;
  vy: number;
  /** Kontaktschaden (`Me.ADC`): halbiert sich bei Treffern, wächst sonst um 25. */
  adc: number;
  /** Animationsbild 0…6 und Unterzähler (`Me.AC8`/`Me.ACC`). */
  frame: number;
  frameTimer: number;
}

/** Ein Partikel des D-Tonator (`Me.A98[k]`, 0x30). */
export interface Particle {
  cooldown: number;
  /** Stufe 1…3 (`+0x04`). */
  level: number;
  x: number;
  y: number;
  present: boolean;
  /** Sorte 1…7 (`+0x14`), 0/−1 leer. */
  kind: number;
  /** Winkel 0 vorwärts, 180 rückwärts; gefeuert wird nur bei genau diesen (`+0x18`). */
  angle: number;
  /** Drehgeschwindigkeit ±4 (`+0x1C`). */
  spin: number;
  /** Animation 0…5 und Unterzähler (`+0x20`/`+0x24`), Aufleuchten nach der Wahl (`+0x28`). */
  frame: number;
  frameTimer: number;
  highlight: number;
  /** Angezeigtes Bild `partikel{n}`, 0…13 (`+0x2C`). */
  image: number;
}

export const newForce = (): Force => ({
  cooldown: 0,
  level: 0,
  x: 0,
  y: 0,
  present: false,
  color: 0,
  state: 0,
  vx: 0,
  vy: 0,
  adc: 0,
  frame: 0,
  frameTimer: 0,
});

export const newParticles = (): Particle[] =>
  [180, 0, 90, 270].map((cooldown) => ({
    cooldown,
    level: 0,
    x: 0,
    y: 0,
    present: false,
    kind: 0,
    angle: 0,
    spin: 0,
    frame: 0,
    frameTimer: 0,
    highlight: 0,
    image: 11,
  }));

export interface WeaponWorld {
  readonly rnd: VbRnd;
  readonly fx: Effects;
  /** Zeichenliste der Blitze. */
  readonly out: DrawList;
  readonly layers: readonly [ShotLayer, ShotLayer];
  readonly players: readonly Player[];
  readonly force: Force;
  readonly particles: readonly Particle[];
  /** Drohnen des Debug-Schiffs 2 (`Me.B04`). */
  readonly drones: Drones;
  /** Beam-Kraftphase je Spieler (`Me.CB0[p]+0x2E`). */
  beamPower(p: number): boolean;
  sound(name: string): void;
  loop(name: string, on: boolean): void;
  /** `CheckWhereColisionRight/Left`. */
  whereRight(x1: number, y1: number, x2: number, y2: number): number;
  whereLeft(x1: number, y1: number, x2: number, y2: number): number;
  /** `CheckColisionWithEnemy` (Funken 0, durchschlagend 0, exclude −1). */
  hitEnemies(x1: number, y1: number, x2: number, y2: number, damage: number, owner: number): number;
}

/** Zustand von `SpielSchieß` über die Ticks (Statics `G.39C`, `G.3A8`). */
export interface FireState {
  /** Bildtakt des Schiffs, gemeinsam für alle Spieler. */
  frameTick: number;
  /** Saat der Blitze. */
  seed: number;
}

export const newFireState = (): FireState => ({ frameTick: 0, seed: 0 });

/** Ein Tick `SpielSchieß`. */
export function fireWeapons(
  w: WeaponWorld,
  st: FireState,
  inputs: readonly (PlayerInput | undefined)[],
): void {
  const flags = { cyan: false, yellow: false, forceYellow: false };
  const exitLock = (w.players[0]?.exitState ?? 0) !== 0;
  for (const p of w.players) {
    if (!p.alive) continue;
    const m = w.beamPower(p.index) ? 2 : 1;
    if (p.fireCooldown > 0) p.fireCooldown--;
    if (p.secondaryCooldown > 0) p.secondaryCooldown--;
    if (!(inputs[p.index]?.fire ?? false) || exitLock) continue;
    // Schiffsbild (`A.A4` Bilder: `dove2…1–3`, sonst eines), Takt für alle Spieler gemeinsam
    st.frameTick++;
    if (st.frameTick >= 2) {
      st.frameTick = 0;
      p.animFrame++;
      if (p.animFrame >= (p.shipType === 2 ? 3 : 1)) p.animFrame = 0;
    }
    let muzzleSparks = primary(w, p, m);
    secondary(w, p, m);
    if (p.shipType === 0) muzzleSparks = particles(w, st, p, m, flags) || muzzleSparks;
    else if (p.shipType === 1) force(w, p, m, flags);
    else if (p.shipType === 2) fireDrones(w.layers, w.drones, p);
    if (muzzleSparks) sparks(w, p);
  }
  w.loop("cyan", flags.cyan);
  w.loop("yellow", flags.yellow);
  w.loop("d-phy_yellow", flags.forceYellow);
}

/** §4.2 Hauptschuss: Abklingzeit 6 (Schiff 0, 2) bzw. 12 (Schiff 1). */
function primary(w: WeaponWorld, p: Player, m: number): boolean {
  const lvl = p.shotPower;
  if (p.fireCooldown !== 0 || lvl <= 0) return false;
  const mz = MUZZLE[p.shipType] ?? MUZZLE[0];
  let type: number;
  let dx = 0;
  let one: number;
  let twin: number;
  if (p.shipType === 1) {
    p.fireCooldown = 12;
    type = 1;
    one = m * (100 * lvl + 140);
    twin = m * (50 * lvl + 70);
    w.sound("normal2");
  } else {
    p.fireCooldown = 6;
    type = p.shipType === 2 ? -1 : 0;
    dx = p.shipType === 2 ? -5 : 0;
    one = 40 * m * (lvl + 2);
    twin = 20 * m * (lvl + 2);
    w.sound("normal");
  }
  const y1 = mz.y1[p.tilt] ?? 0;
  const y2 = mz.y2[p.tilt] ?? 0;
  const x = f32(mz.x + p.x + dx);
  const [l0, l1] = w.layers;
  if (y1 === y2) l1.add(type, x, f32(y1 + p.y - 7), SHOT_SPEED, 0, lvl, one, p.index);
  else {
    l0.add(type, x, f32(y2 + p.y - 7), SHOT_SPEED, 0, lvl, twin, p.index);
    l1.add(type, x, f32(y1 + p.y - 7), SHOT_SPEED, 0, lvl, twin, p.index);
  }
  return true;
}

/** §4.3 Zweitwaffe: 1 Bombe, 2 Fallrakete, 3 Zielsuchrakete, alle Ebene 0. */
function secondary(w: WeaponWorld, p: Player, m: number): void {
  if (p.secondaryCooldown > 0) return;
  const lvl = p.shotPower;
  const l0 = w.layers[0];
  switch (p.extraWeapon) {
    case 3:
      p.secondaryCooldown = Math.trunc(60 / m);
      l0.add(13, p.x, f32(p.y + 22), 6, 0, 0, 200 * lvl, p.index);
      w.sound("rocketlaunch");
      return;
    case 2:
      p.secondaryCooldown = Math.trunc(150 / m);
      l0.add(12, f32(p.x + 18), f32(p.y + 39), 0, 1, 0, 400 * lvl + 1100, p.index);
      w.sound("rocketlaunch");
      return;
    case 1:
      p.secondaryCooldown = Math.trunc(100 / m);
      l0.add(11, f32(p.x + 16), f32(p.y + 16), 0, 4, 0, 300 * lvl + 700, p.index);
      w.sound("bomb");
      return;
  }
}

/** §4.5 Force des D-Phyton: frei fliegend ein Fächer, angedockt nach Farbe. */
function force(w: WeaponWorld, p: Player, m: number, flags: { forceYellow: boolean }): void {
  const f = w.force;
  if (f.cooldown > 0) f.cooldown--;
  if (!f.present || f.cooldown > 0) return;
  const lvl = p.shotPower;
  const l0 = w.layers[0];
  const l1 = w.layers[1];
  const x = f32(f.x + 32);
  if (f.state >= 3) {
    f.cooldown = 12;
    w.sound("normal");
    const y = f32(f.y + 28);
    const d = 40 * (lvl + 1);
    const shot = (vx: number, vy: number, dmg: number) =>
      l1.add(0, x, y, vx, vy, lvl, dmg, p.index);
    if (f.level === 2) {
      shot(11, 0, d * m);
      shot(6, -6, d);
      shot(6, 6, d);
      shot(0, -11, d);
      shot(0, 11, d);
      if (m === 2) {
        shot(9, -4, d);
        shot(9, 4, d);
        shot(4, -9, d);
        shot(4, 9, d);
      }
    } else if (f.level === 1) {
      shot(9, -4, d * m);
      shot(9, 4, d * m);
      if (m === 2) shot(11, 0, 80 * (lvl + 1));
    } else shot(11, 0, d * m);
    return;
  }
  const g = f.state === 1 ? 1 : -1;
  const L = f.level;
  const S = m + L;
  const at = (dy: number) => f32(f.y + dy);
  switch (f.color) {
    case 0: {
      // blau: abprallende Laser
      f.cooldown = 70;
      if (m === 2) {
        const dmg = 150 * (L + 1) + 100 * lvl;
        l1.add(7, x, at(32), 11 * g, 5, 10, dmg, p.index);
        l1.add(7, x, at(32), 11 * g, -5, 10, dmg, p.index);
      }
      if (L > 0) {
        const base = lvl * (100 * L + 150);
        l1.add(7, x, at(32), 16 * g, 0, 10 * L - 5, m * (base + 200), p.index);
        l1.add(7, x, at(32), 8 * g, 8, 10 * L, base + 150, p.index);
        l1.add(7, x, at(32), 8 * g, -8, 10 * L, base + 150, p.index);
      }
      if (m === 2 || L > 0) w.sound("d-phyton_blue");
      return;
    }
    case 1: {
      // rot: zielsuchende Laser
      const shot = (dy: number, dmg: number) =>
        l1.add(6, x, at(dy), 10 * g, 0, m - 1, dmg, p.index);
      if (S === 4) {
        shot(16, 300 * lvl + 100);
        shot(48, 300 * lvl + 100);
        shot(32, 500 * lvl + 200);
      } else if (S === 3) {
        shot(16, 300 * lvl + 150);
        shot(48, 300 * lvl + 150);
      } else if (S === 2) shot(32, 300 * lvl + 150);
      else return;
      f.cooldown = 60;
      w.sound("d-phyton_red");
      return;
    }
    case 2: {
      // gelb: stehender Strahl, Ton als Schleife
      if (L > 0) {
        flags.forceYellow = true;
        f.cooldown = 1;
        l0.add(8, x, at(32), g, 0, (20 * L - 20) * m, ((L === 1 ? 7 : 3) - m) * lvl, p.index);
      } else if (m === 2) {
        flags.forceYellow = true;
        l0.add(8, x, at(32), g, 0, 0, 6, p.index);
      }
      return;
    }
    case 3: {
      // grün: Suchstrahl, der abknickt
      if (S <= 1) return;
      f.cooldown = 20;
      l1.add(10, x, at(32), 10 * g, 0, S - 1, 150 * lvl + 80, p.index);
      w.sound("d-phy_green");
      return;
    }
    case 4: {
      // violett: Bumerangs
      const pair = (vx: number, param: number, dmg: number) => {
        l1.add(9, x, at(32), vx * g, 5, param, dmg, p.index);
        l1.add(9, x, at(32), vx * g, -5, param, dmg, p.index);
      };
      if (S === 4) {
        pair(8, 10, 290 * lvl);
        pair(9, 7, 550 * lvl);
        pair(7, 5, 290 * lvl);
      } else if (S === 3) {
        pair(8, 10, 290 * lvl);
        pair(7, 5, 290 * lvl);
      } else if (S === 2) pair(7, 5, 290 * lvl);
      else return;
      f.cooldown = 50;
      w.sound("d-phy_violett");
      return;
    }
  }
}

/** §4.6 Partikel des D-Tonator; `true`: Sorte 4 hat gefeuert (Mündungsfunken). */
function particles(
  w: WeaponWorld,
  st: FireState,
  p: Player,
  m: number,
  flags: { cyan: boolean; yellow: boolean },
): boolean {
  const lvl = p.shotPower;
  const l1 = w.layers[1];
  let muzzle = false;
  for (const r of w.particles) {
    if (r.cooldown > 0) r.cooldown--;
    if (r.kind === 3) flags.yellow = true;
    if (r.cooldown > 0) continue;
    if (r.angle !== 0 && r.angle !== 180) continue;
    const a = r.angle === 0 ? 1 : 0;
    const g = 2 * a - 1;
    if (lvl <= 0) continue;
    switch (r.kind) {
      case 1:
        flags.cyan = true;
        r.cooldown = 0;
        lightningGun(w, st, p, r, a, g, m);
        break;
      case 2: {
        r.cooldown = 13;
        w.sound("red");
        const x = r.x + 27 * a;
        const y = r.y + 8;
        const s = (vx: number, vy: number, dmg: number) => l1.add(1, x, y, vx, vy, 0, dmg, p.index);
        s(8 * g, 0, 10 * m * (lvl + 3));
        s(7 * g, 2, 20);
        s(7 * g, -2, 20);
        if (m === 2) {
          s(7.5 * g, 1, 20);
          s(7.5 * g, -1, 20);
        }
        if (lvl > 1) {
          s(6 * g, 3, 20);
          s(6 * g, -3, 20);
          if (m === 2) {
            s(6.5 * g, 4.5, 20);
            s(6.5 * g, -4.5, 20);
          }
        }
        if (lvl > 2) {
          s(5 * g, 4, 20);
          s(5 * g, -4, 20);
          if (m === 2) {
            s(4 * g, 5, 20);
            s(4 * g, -5, 20);
          }
        }
        break;
      }
      case 3: {
        r.cooldown = 3;
        const r1 = w.rnd.next();
        const param = (lvl + 1) * m;
        l1.add(
          3,
          r.x + 31 * a,
          r.y + 15,
          7 * g,
          f32(2 * r1 - 1),
          param,
          (2 * lvl + 3) * m,
          p.index,
        );
        break;
      }
      case 4:
        r.cooldown = 14;
        muzzle = true;
        w.sound("green");
        l1.add(4, r.x + 27 * a, r.y + 8, 10 * g, 0, lvl + m - 1, (15 * lvl + 10) * m, p.index);
        break;
      case 5:
        r.cooldown = (16 - m) * 2;
        w.sound("violett");
        l1.add(5, r.x + 22 * a, r.y - 1, 5 * g, 0, lvl + m - 1, 80, p.index);
        break;
      case 6:
      case 7:
        r.cooldown = 7 - m * lvl;
        w.sound("red");
        for (let k = 0; k < 2; k++) {
          const ang = cint(w.rnd.next() * 170 + 5);
          const s = SIN_DEG[degIndex(ang)] ?? 0;
          const c = COS_DEG[degIndex(ang)] ?? 0;
          l1.add(1, r.x + 27 * a, r.y + 8, f32(g * s * 8), f32(c * 8), 0, 40 * m, p.index);
        }
        break;
    }
  }
  return muzzle;
}

/** §4.6.1 Sorte 1: Blitz bis zur nächsten Kante, trifft den ersten Gegner. */
function lightningGun(
  w: WeaponWorld,
  st: FireState,
  p: Player,
  r: Particle,
  a: number,
  g: number,
  m: number,
): void {
  const lvl = p.shotPower;
  const rnd = w.rnd;
  const x0 = r.x + 22 * a + 10;
  const y = r.y + 15;
  const jitter = (v: number) => vbInt(v * 6) * g + x0;
  const dmg = (5 * lvl + 4) * m;
  const amp = 3 * lvl + 7;
  const bolt = (x1: number, x2: number) => {
    w.fx.lightning(w.out, x1, y, x2, y, 5 * lvl, segs, amp, lvl * 0.2, lvl * 0.2, 1, true, st.seed);
    w.fx.lightning(w.out, x1, y, x2, y, 2, segs, amp, 1, 1, 1, true, st.seed);
  };
  let segs: number;
  if (a === 1) {
    const edge = w.whereRight(cint(jitter(rnd.next())), y, 800, y);
    segs = cint(idiv(edge - p.x + 32, 75) + 2 * rnd.next());
    st.seed = cint(rnd.next() * 10000);
    if (edge < 800) {
      bolt(x0, edge + 1);
      w.hitEnemies(cint(jitter(rnd.next())), y, edge + 1, y, dmg, p.index);
      w.fx.addSparks(1, 2, edge, y, edge, y, false);
    } else bolt(x0, 800);
    return;
  }
  const x = cint(jitter(rnd.next()));
  const edge = w.whereLeft(0, y, x, y);
  segs = cint(idiv(p.x + 32 - edge, 75) + 2 * rnd.next());
  st.seed = cint(rnd.next() * 10000);
  const from = edge > -1 ? edge - 1 : 0;
  // rückwärts endet jeder der beiden Blitze mit eigenem Zittern
  w.fx.lightning(
    w.out,
    from,
    y,
    jitter(rnd.next()),
    y,
    5 * lvl,
    segs,
    amp,
    lvl * 0.2,
    lvl * 0.2,
    1,
    true,
    st.seed,
  );
  w.fx.lightning(w.out, from, y, jitter(rnd.next()), y, 2, segs, amp, 1, 1, 1, true, st.seed);
  if (edge > -1) {
    w.hitEnemies(edge - 1, y, cint(jitter(rnd.next())), y, dmg, p.index);
    w.fx.addSparks(1, 2, edge, y, edge, y, false);
  }
}

/** §4.7 Mündungsfunken: 11 × 2 kleine Partikel mit je 3 `Rnd`, sie erben die Schiffsbewegung. */
function sparks(w: WeaponWorld, p: Player): void {
  const mz = MUZZLE[p.shipType] ?? MUZZLE[0];
  const rnd = w.rnd;
  for (let k = 0; k <= 10; k++) {
    for (const [layer, ym] of [
      [0, mz.y2[p.tilt] ?? 0],
      [1, mz.y1[p.tilt] ?? 0],
    ] as const) {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      w.fx.addSpark1(
        layer,
        f32(mz.x + p.x),
        f32(ym + p.y),
        f32(r1 * 1.5 + p.x - p.prevX),
        f32(r2 * 4 - 2 + p.y - p.prevY),
        1,
        f32(r3 * 0.5 + 0.5),
        0,
        1,
        3,
      );
    }
  }
}
