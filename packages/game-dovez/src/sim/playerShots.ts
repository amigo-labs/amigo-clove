import type { DrawList, Effects, LineSink } from "./effects";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, vbInt, winkelInGrad, type VbRnd } from "./vb";

/**
 * Spielerschüsse (`Me.B8C`, 2 Ebenen × 1001 Slots à 0x34, `AddSchuss`
 * `0x4DD0F0`, `KillSchuss` `0x4D36D0`) und ihre Bewegung `SpielMoveSchuss(E)`
 * (`0x4D37C0`) für alle Typen −2…14. Ebene 0 läuft vor den Gegnern, Ebene 1
 * danach. Gezeichnet wird wie im Original in derselben Schleife (vor dem
 * Treffertest); die Zeichenlisten `shots0`/`shots1` spielt der Renderer ab.
 * Befund: `docs/measurements/dovez-runtime.md` („Spielerwaffen“).
 */

export const SHOT_SLOTS = 1001;
export const SHOT_BOX = 16;
export const SHOT_SPEED = 11;

export interface PlayerShot {
  active: boolean;
  type: number;
  /** Typ-Parameter (Waffenstufe, Spurlänge, Teilungen, Startwinkel …). */
  param: number;
  damage: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
  owner: number;
  /** Zähler A (`+0x20`) und B (`+0x24`), beim Anlegen 0; Bedeutung je Typ. */
  a: number;
  b: number;
  /** Leuchtband X()/Y() (`+0x2C`/`+0x30`), `InitSpur` legt es an. */
  trailX: Float32Array | undefined;
  trailY: Float32Array | undefined;
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
    a: 0,
    b: 0,
    trailX: undefined,
    trailY: undefined,
  }));
  /** Suchstart (`Me.BB0[E]`) und höchster je belegter Slot (`Me.BCC[E]`). */
  hint = 0;
  high = -1;

  /** `AddSchuss`: erster freier Slot ab `hint`; die Spur-Felder bleiben unberührt. */
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
      s.active = true;
      s.type = type;
      s.x = f32(x);
      s.y = f32(y);
      s.vx = f32(vx);
      s.vy = f32(vy);
      s.param = f32(param);
      s.damage = f32(damage);
      s.owner = owner;
      s.a = 0;
      s.b = 0;
      if (i > this.high) this.high = i;
      this.hint = i + 1;
      return;
    }
  }

  /**
   * `KillSchuss`: Der Abwärtssuche des Originals trifft zuerst den noch
   * aktiven Slot selbst, `high` sinkt daher nie (bis `VariabelnLösch`).
   */
  kill(i: number): void {
    if (this.hint > i) this.hint = i;
    this.shots[i]!.active = false;
  }
}

/** Ein Gegnerteil als Ziel der Suchwaffen (linke obere Ecke und Maße des Bilds). */
export interface ShotTarget {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ShotHost {
  readonly tick: number;
  readonly rnd: VbRnd;
  readonly fx: Effects;
  /** Level-Schwerkraft (`Me.1D8`) und Scrolltempo der Landschaft (Ebene 3). */
  readonly gravity: number;
  readonly terrainSpeed: number;
  /** `CheckColisionWithEnemy` (durchschlagend 0, exclude −1): Restschaden. */
  hitEnemies(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    damage: number,
    owner: number,
    sparks: boolean,
  ): number;
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  /** `CheckWhereColisionRight/Left`: nächste Kante rechts (800: keine) bzw. links (−1). */
  whereRight(x1: number, y1: number, x2: number, y2: number): number;
  whereLeft(x1: number, y1: number, x2: number, y2: number): number;
  /** Ziele der Suchwaffen: sichtbare, ungepanzerte Teile lebender, nicht fester Gegner. */
  targets(): readonly ShotTarget[];
  /** Kombo-Multiplikator des Spielers und Treffer des Beam-Suchgeschosses. */
  combo(owner: number): number;
  comboHit(owner: number): void;
  sound(name: string): void;
  /** Maße eines Atlas-Bilds (Rakete). */
  spriteSize(key: string): { w: number; h: number } | undefined;
}

/** Gemeinsamer Kasten `L.304…L.310` (relativ zu x, y): einige Typen setzen ihn nicht. */
export interface ShotBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const newShotBox = (): ShotBox => ({ x1: 0, y1: 0, x2: 0, y2: 0 });

/** Glutfarbe je Hauptschuss-Typ 0, 1, −1, −2 (Index `kind`). */
const GLOW = [
  [0.6, 0.8, 1],
  [1, 0.3, 0.3],
  [0.4, 1, 0.4],
  [1, 1, 0],
] as const;
const BALL = ["ballschuss", "ballschuss2", "ballschuss3", "ballschuss4"] as const;

const cos = (d: number) => COS_DEG[degIndex(d)] ?? 0;
const sin = (d: number) => SIN_DEG[degIndex(d)] ?? 0;

/** `InitSpur(X, Y, n)` (`0x536030`): `ReDim X(0 To CLng(n))`, alles −1. */
function initTrail(s: PlayerShot, n: number): void {
  const len = cint(n) + 1;
  s.trailX = new Float32Array(len).fill(-1);
  s.trailY = new Float32Array(len).fill(-1);
}

/**
 * `Spur` (`0x536110`): additives Leuchtband aus `balken`-Vierecken, Alpha
 * steigt zum Kopf; `shift` schiebt erst (x, y) nach. Näherung: Balken je
 * Glied mit Farbverlauf, ohne die Winkelglättung an den Knicken. `Y` darf
 * dasselbe Feld wie `X` sein (der Beam übergibt beim Nachglühen beides gleich).
 */
export function drawTrail(
  out: LineSink,
  X: Float32Array,
  Y: Float32Array,
  x: number,
  y: number,
  n: number,
  w: number,
  r: number,
  g: number,
  b: number,
  shift: boolean,
): void {
  const N = cint(n);
  if (shift) {
    for (let k = 0; k <= cint(n - 1); k++) {
      X[k] = X[k + 1] ?? -1;
      Y[k] = Y[k + 1] ?? -1;
    }
    X[N] = x;
    Y[N] = y;
  }
  for (let k = 1; k <= N; k++) {
    const px = X[k - 1] ?? -1;
    const qx = X[k] ?? -1;
    if (qx === -1 || px === -1) continue;
    out.line(
      px,
      Y[k - 1] ?? -1,
      qx,
      Y[k] ?? -1,
      w,
      [r, g, b, f32((k - 1) / n)],
      [r, g, b, f32(k / n)],
      true,
    );
  }
}

/** Leuchtband eines Schusses (Spur-Felder `+0x2C`/`+0x30`). */
function trail(
  out: DrawList,
  s: PlayerShot,
  x: number,
  y: number,
  n: number,
  w: number,
  r: number,
  g: number,
  b: number,
  shift: boolean,
): void {
  if (s.trailX && s.trailY) drawTrail(out, s.trailX, s.trailY, x, y, n, w, r, g, b, shift);
}

/** Nächstes Ziel zur Mitte (x, y): Abstand `CLng(Sqr(dx² + dy²))` < bisher (Start 10000). */
function nearest(host: ShotHost, x: number, y: number): ShotTarget | undefined {
  let best = 10000;
  let found: ShotTarget | undefined;
  for (const t of host.targets()) {
    const dx = t.x + idiv(t.w, 2) - x;
    const dy = t.y + idiv(t.h, 2) - y;
    const d = cint(Math.sqrt(dx * dx + dy * dy));
    if (d < best) {
      best = d;
      found = t;
    }
  }
  return found;
}

/** Drehung zum Ziel um höchstens 10° je Tick (Typ 13, 14). */
function steer(s: PlayerShot, x: number, y: number, t: ShotTarget): void {
  const tx = t.x + idiv(t.w, 2);
  const ty = t.y + idiv(t.h, 2);
  let a = cint(winkelInGrad(x - tx, y - ty) - 360);
  while (Math.abs(a - s.a) > Math.abs(a - s.a + 360)) a += 360;
  const d = a - s.a;
  if (d > 0) s.a = d > 10 ? s.a + 10 : a;
  else s.a = s.a - a > 10 ? s.a - 10 : a;
  if (s.a <= 0) s.a += 360;
}

/** `SpielMoveSchuss(Ebene)`; `box` ist der gemeinsame Kasten `L.304…L.310`. */
export function moveShots(
  layer: ShotLayer,
  e: 0 | 1,
  host: ShotHost,
  box: ShotBox,
  out: DrawList,
): void {
  const fx = host.fx;
  const rnd = host.rnd;
  const setBox = (x1: number, y1: number, x2: number, y2: number) => {
    box.x1 = x1;
    box.y1 = y1;
    box.x2 = x2;
    box.y2 = y2;
  };
  const outside = (s: PlayerShot) =>
    s.x > 800 || s.x + (box.x2 - box.x1) < 0 || s.y > 550 || s.y + (box.y2 - box.y1) < 0;
  const glow = (x: number, y: number, r: number, g: number, b: number, delay: number, life = 9) =>
    fx.addBig(x, y, 0, 0, r, g, b, 16, delay, life, 1, 0);
  const spark = (x1: number, y1: number, x2: number, y2: number, colored: boolean) =>
    fx.addSparks(1, 1, cint(x1), cint(y1), cint(x2), cint(y2), colored);
  // Rechteck relativ zu (x, y) im Original CLng je Ecke
  const hit = (s: PlayerShot, x1: number, y1: number, x2: number, y2: number, sparks = true) =>
    host.hitEnemies(cint(x1), cint(y1), cint(x2), cint(y2), cint(s.damage), s.owner, sparks);
  const land = (x1: number, y1: number, x2: number, y2: number) =>
    host.terrain(cint(x1), cint(y1), cint(x2), cint(y2));
  /** Einschlag der Zweitwaffen 12–14: Funken, Explosion, Splash, Ton. */
  const blast = (i: number, s: PlayerShot) => {
    const [x1, y1, x2, y2] = [s.x + box.x1, s.y + box.y1, s.x + box.x2, s.y + box.y2];
    fx.addSparks(1, 50, cint(x1), cint(y1), cint(x2), cint(y2), false);
    fx.addExplosion(f32(x1), f32(y1), f32(x2), f32(y2));
    host.hitEnemies(
      cint(x1 - 32),
      cint(y1 - 32),
      cint(x2 + 32),
      cint(y2 + 32),
      idiv(s.damage, 2),
      s.owner,
      true,
    );
    host.sound("explosion");
    layer.kill(i);
  };
  const head = (s: PlayerShot) => out.quad("a_kreis2", s.x, s.y - 8, s.x + 16, s.y + 8);
  /** Sterbephase der Laser 6/7/9/10: Kopf steht, die Spur läuft aus. */
  const dying = (i: number, s: PlayerShot, n: number, r: number, g: number, b: number) => {
    trail(out, s, -1, -1, n, 8, r, g, b, true);
    trail(out, s, -1, -1, n, 4, 1, 1, 1, false);
    head(s);
    s.a--;
    if (s.a === 0) {
      s.trailX = undefined;
      s.trailY = undefined;
      layer.kill(i);
    }
  };

  const hi = layer.high;
  for (let i = 0; i <= hi; i++) {
    const s = layer.shots[i]!;
    if (!s.active) continue;
    switch (s.type) {
      case -2:
      case -1:
      case 0:
      case 1: {
        const kind = s.type >= 0 ? s.type : Math.abs(s.type) + 1;
        setBox(0, 0, SHOT_BOX, SHOT_BOX);
        if (s.param > 1) {
          const r1 = rnd.next();
          const r2 = s.vy === 0 ? 0.5 : rnd.next();
          fx.addBig(s.x, s.y, 2 * r1 - 1, 2 * r2 - 1, 0.3 * s.param, 0.2, 1, 16, 0, 6, 1, 0);
        }
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        if (outside(s)) {
          layer.kill(i);
          break;
        }
        const ang = cint(winkelInGrad(-s.vx, -s.vy));
        const x = cint(s.x);
        const y = cint(s.y);
        const rot = s.type === 1 || ang === 0 ? 0 : ang;
        out.quad(BALL[kind]!, x, y, x + 16, y + 16, 1, 1, 1, 1, false, rot);
        const [r, g, b] = GLOW[kind]!;
        const rest = hit(s, s.x, s.y, s.x + 16, s.y + 16);
        s.damage = f32(rest);
        if (rest === 0) {
          glow(s.x, s.y, r, g, b, 0);
          layer.kill(i);
          break;
        }
        if (land(s.x, s.y, s.x + 16, s.y + 16)) {
          layer.kill(i);
          spark(s.x - 3, s.y - 3, s.x + 18, s.y + 18, true);
          glow(s.x, s.y, r, g, b, 0);
        }
        break;
      }
      case 3: {
        // wachsender Feuerball, Flächenschaden jeden Tick
        const r = idiv(s.a + 10, 2);
        setBox(s.x - r, s.y - r, s.x + r, s.y + r);
        const [bx1, by1, bx2, by2] = [box.x1, box.y1, box.x2, box.y2];
        const k = vbInt(rnd.next() * 4);
        const v = Math.abs(s.vy);
        out.quad("feuer0", bx1, by1, bx2, by2, 1, (1 - v) / 4 + 0.5, (1 - v) / 6 + 0.1, 0.7);
        out.quad(`feuer${k}`, bx1, by1, bx2, by2, 1, 0.4, 0.3, 1, true);
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        s.a = cint(s.a + s.param);
        if (idiv(s.a, s.param) === 20) {
          layer.kill(i);
          break;
        }
        host.hitEnemies(cint(bx1), cint(by1), cint(bx2), cint(by2), cint(s.damage), s.owner, false);
        break;
      }
      case 4: {
        // Splitter: teilt sich beim Aufprall in zwei
        setBox(0, 0, 16, 16);
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        if (outside(s)) {
          layer.kill(i);
          break;
        }
        const p4 = 4 * s.param;
        out.quad("ballschuss2", s.x - p4, s.y - p4, s.x + 16 + p4, s.y + 16 + p4);
        const split = () => {
          if (s.param <= 0) return;
          const [x, y] = [s.x - s.vx, s.y - s.vy];
          const dmg = 20 * s.param;
          const p = s.param - 1;
          if (s.vy === 0) {
            const r1 = rnd.next();
            const r2 = rnd.next();
            layer.add(4, x, y, vbInt(3 * r1) - s.vx - 1, -vbInt(3 * r2) - 5, p, dmg, s.owner);
            const r3 = rnd.next();
            const r4 = rnd.next();
            layer.add(4, x, y, vbInt(3 * r3) - s.vx - 1, vbInt(3 * r4) + 5, p, dmg, s.owner);
          } else {
            const r1 = rnd.next();
            const r2 = rnd.next();
            layer.add(4, x, y, vbInt(3 * r1) + s.vx - 1, vbInt(3 * r2) - s.vy - 1, p, dmg, s.owner);
            const r3 = rnd.next();
            const r4 = rnd.next();
            layer.add(4, x, y, vbInt(3 * r3) - s.vx - 1, vbInt(3 * r4) + s.vy - 1, p, dmg, s.owner);
          }
        };
        const rest = hit(s, s.x, s.y, s.x + 16, s.y + 16);
        s.damage = f32(rest);
        if (rest === 0) {
          glow(s.x, s.y, 1, 0.5, 0.5, 9);
          split();
          layer.kill(i);
          break;
        }
        if (land(s.x, s.y, s.x + 16, s.y + 16)) {
          spark(s.x - 3, s.y - 3, s.x + 18, s.y + 18, true);
          glow(s.x, s.y, 1, 0.3, 0.3, 0);
          split();
          layer.kill(i);
        }
        break;
      }
      case 5: {
        // Abpraller: Zünder 15…27 Ticks, zerfällt in drei
        if (s.b === 0) s.a = cint(rnd.next() * 12 + 15);
        const full = s.param > 0;
        if (full) setBox(7, 7, 25, 25);
        else setBox(9, 9, 23, 23);
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        s.a--;
        s.b += 10;
        if (s.a === 0) {
          if (s.param === 0) {
            layer.kill(i);
            break;
          }
          const add = (d: number) =>
            layer.add(5, s.x, s.y, 5 * sin(d), 5 * cos(d), s.param - 1, s.damage, s.owner);
          add(s.b);
          add(s.b + 120);
          layer.kill(i);
          add(s.b + 240);
          break;
        }
        const [x, y] = [cint(s.x), cint(s.y)];
        if (full) out.quad("abprallerzusammen", x, y, x + 32, y + 32, 1, 1, 1, 1, false, s.b);
        else out.quad("abprallereinzeln", x, y, x + 32, y + 32, 1, 1, 1, Math.min(s.a, 15) / 15);
        const rest = hit(s, s.x + box.x1, s.y + box.y1, s.x + box.x2, s.y + box.y2);
        s.damage = f32(rest);
        if (rest === 0) {
          glow(s.x + 8, s.y + 8, 0.8, 0.6, 1, 0);
          layer.kill(i);
          break;
        }
        if (land(s.x + box.x1, s.y + box.y1, s.x + box.x2, s.y + box.y2)) {
          layer.kill(i);
          spark(s.x + 5, s.y + 5, s.x + 26, s.y + 26, true);
          glow(s.x + 8, s.y + 8, 0.8, 0.6, 1, 0);
        }
        break;
      }
      case 6: {
        // zielsuchender Laser, rot
        if (s.b === 0) {
          s.b = 1;
          s.a = 0;
          initTrail(s, 25);
        } else {
          let best = 10000;
          for (const t of host.targets()) {
            const dy = cint(t.y + idiv(t.h, 2) - s.y);
            if (Math.abs(dy) < Math.abs(best) && Math.sign(t.x - s.x) === Math.sign(s.vx))
              best = dy;
          }
          if (best === 10000) best = 0;
          if (Math.abs(best) < 4) best = 0;
          s.vy = f32(Math.sign(best) * 4);
        }
        if (s.a > 0) {
          dying(i, s, 25, 1, 0.1, 0.2);
          break;
        }
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        trail(out, s, s.x + 8, s.y, 25, 8, 1, 0.1, 0.2, true);
        trail(out, s, s.x + 8, s.y, 25, 4, 1, 1, 1, false);
        if (s.param === 1) s.y = f32(s.y + 2 * sin(host.tick * 10));
        if (outside(s)) {
          s.a = 24;
          break;
        }
        head(s);
        laserHit(s, 24, 1, 0.3, 0.4);
        break;
      }
      case 7: {
        // abprallender Laser, blau
        if (s.b === 0) {
          s.a = 0;
          initTrail(s, s.param);
          s.b = 1;
        }
        if (s.a > 0) {
          dying(i, s, s.param, 0.2, 0.1, 1);
          break;
        }
        for (let k = 0; k < 2; k++) {
          s.x = f32(s.x + s.vx / 2);
          s.y = f32(s.y + s.vy / 2);
          if (land(s.x, s.y - 8, s.x + 16, s.y + 8)) {
            fx.addBig(s.x + 5, s.y, 0, 0, 1, 1, 1, 6, 0, 14, 2, 4);
            s.vy = -s.vy;
            if (land(s.x, s.y - 8 + s.vy, s.x + 16, s.y + 8 + s.vy)) {
              s.vy = -s.vy;
              s.vx = -s.vx;
              if (s.vx < 0) s.x = f32(s.x - host.terrainSpeed);
            }
            s.b++;
            if (s.b > 40) s.a = cint(s.param - 1);
          }
        }
        trail(out, s, s.x + 8, s.y, s.param, 8, 0.2, 0.1, 1, true);
        trail(out, s, s.x + 8, s.y, s.param, 4, 1, 1, 1, false);
        if (outside(s)) {
          s.a = cint(s.param - 1);
          break;
        }
        head(s);
        const rest = hit(s, s.x, s.y - 8, s.x + 16, s.y + 8);
        s.damage = f32(rest);
        if (rest === 0) {
          s.a = cint(s.param - 1);
          fx.addBig(s.x, s.y - 8, 0, 0, 0.4, 0.3, 1, 16, 0, cint(s.param + 1), 1, 0);
        }
        break;
      }
      case 8: {
        // stehender Laserstrahl bis zur nächsten Kante
        let alpha: number;
        if (s.b === 0) {
          s.b = 1;
          s.a = cint(s.param);
          alpha = 1;
        } else alpha = f32(s.a / 75 + 0.15);
        const c = [1, 1, 0.2, alpha] as const;
        const white = [1, 1, 1, 1] as const;
        const first = s.a === s.param;
        const x = cint(s.x);
        const y = cint(s.y);
        const sparkle = host.tick % 4 === 0 || (host.tick % 2 === 0 && s.param === 0);
        const glowAt = (xe: number) =>
          out.quad("a_kreis2", xe - 8, s.y - 8, xe + 8, s.y + 8, 1, 1, 0.2, alpha);
        const burst = (xe: number, g: number) => {
          const d = cint(5 * rnd.next());
          fx.addBig(
            xe - 10 - 15 * cos(g),
            s.y - 10 - 15 * sin(g),
            -10 * cos(g),
            -10 * sin(g),
            1,
            1,
            0.2,
            20,
            d,
            10,
            15,
            g,
          );
        };
        if (s.vx === 1) {
          const xe = host.whereRight(x, y, 800, y);
          const end = xe < 800 ? xe : 800;
          out.line(s.x, s.y, end, s.y, 6, c, c);
          if (first) out.line(s.x, s.y, end, s.y, 3, white, white, true);
          if (xe < 800) {
            if (sparkle) burst(xe, cint(rnd.next() * 90 - 45));
            glowAt(xe);
            host.hitEnemies(x, y, xe + 1, cint(s.y + 1), cint(s.damage), s.owner, false);
          }
        } else {
          const xe = host.whereLeft(0, y, x, y);
          const start = xe > -1 ? xe : 0;
          out.line(start, s.y, s.x, s.y, 6, c, c);
          if (first) out.line(start, s.y, s.x, s.y, 3, white, white, true);
          if (xe > -1) {
            if (sparkle) burst(xe, cint(rnd.next() * 90 + 135));
            glowAt(xe);
            host.hitEnemies(xe - 1, y, x, cint(s.y + 1), cint(s.damage), s.owner, false);
          }
        }
        s.a--;
        if (s.a <= 0) layer.kill(i);
        break;
      }
      case 9: {
        // Bumerang, violett
        if (s.b === 0) {
          s.a = 0;
          initTrail(s, 15);
        }
        if (s.b === s.param) {
          s.vx = f32(-2 * s.vx);
          s.vy = 0;
          s.x = f32(s.x - s.vx);
        }
        s.b++;
        if (s.a > 0) {
          dying(i, s, 15, 1, 0.1, 1);
          break;
        }
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        trail(out, s, s.x + 8, s.y, 15, 8, 1, 0.1, 1, true);
        trail(out, s, s.x + 8, s.y, 15, 4, 1, 1, 1, false);
        const w = box.x2 - box.x1;
        const h = box.y2 - box.y1;
        if (s.x > 952 || s.x + w < -120 || s.y > 550 || s.y + h < 0) {
          s.a = 14;
          break;
        }
        head(s);
        laserHit(s, 14, 1, 0.3, 1);
        break;
      }
      case 10: {
        // Suchstrahl, der senkrecht abknickt, grün
        if (s.b === 0) {
          s.b = 1;
          s.a = 0;
          initTrail(s, 5);
        } else if (s.vx !== 0) {
          for (const t of host.targets()) {
            const cx = t.x + idiv(t.w, 2);
            if (!(cx - 20 <= s.x && s.x <= cx)) continue;
            s.vy = t.y < s.y ? -15 : 15;
            if (s.param > 0) {
              layer.add(10, s.x + s.vx, s.y, s.vx, 0, s.param - 1, s.damage, s.owner);
              host.sound("d-phy_green");
            }
            s.vx = 0;
            fx.addBig(s.x, s.y, 0, 0, 0.3, 1, 0.4, 0, 0, 18, 2, 4);
            fx.addBig(s.x, s.y, 0, 0, 0.3, 1, 0.4, 0, 0, 18, 2, 6);
            break;
          }
        }
        if (s.a > 0) {
          dying(i, s, 5, 0.3, 1, 0.4);
          break;
        }
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        trail(out, s, s.x + 8, s.y, 5, 8, 0.3, 1, 0.4, true);
        trail(out, s, s.x + 8, s.y, 5, 4, 1, 1, 1, false);
        if (outside(s)) {
          s.a = 24;
          break;
        }
        head(s);
        laserHit(s, 24, 0.3, 1, 0.4);
        break;
      }
      case 11: {
        // Bombe: fällt mit der Level-Schwerkraft, neigt sich bis 70°
        setBox(7, 22, 57, 42);
        s.vy = f32(s.vy + host.gravity / 4);
        if (s.a < 90) s.a = cint(s.a + (90 - s.a) / 40);
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        if (outside(s)) {
          layer.kill(i);
          break;
        }
        const [x, y] = [cint(s.x), cint(s.y)];
        out.quad("bombe", x, y, x + 32, y + 32, 1, 1, 1, 1, false, s.a);
        const rest = hit(s, s.x + 7, s.y + 22, s.x + 57, s.y + 42);
        if (rest !== cint(s.damage) || land(s.x + 7, s.y + 22, s.x + 57, s.y + 42)) {
          fx.addSparks(1, 50, x, y, cint(s.x + 32), cint(s.y + 32), false);
          fx.addExplosion(f32(s.x + 7), f32(s.y + 22), f32(s.x + 57), f32(s.y + 42));
          host.hitEnemies(
            cint(s.x - 32),
            cint(s.y - 32),
            cint(s.x + 64),
            cint(s.y + 64),
            idiv(s.damage, 2),
            s.owner,
            true,
          );
          host.sound("explosion");
          layer.kill(i);
        }
        break;
      }
      case 12: {
        // Fallrakete: 16 Ticks fallen, dann beschleunigen
        const size = host.spriteSize("rakete") ?? { w: 32, h: 17 };
        setBox(0, 0, size.w, size.h);
        if (s.a > 15) {
          for (let k = 0; k < 2; k++) {
            const r1 = rnd.next();
            const r2 = rnd.next();
            const r3 = rnd.next();
            fx.addSpark1(0, s.x, s.y + r1 * 17, -1, 2 * r2 - 1, 1, r3, 0.2, 2, 10);
          }
          if (s.vx < 20) s.vx = f32(s.vx + 0.5);
          s.vy = 0;
        } else s.a++;
        s.x = f32(s.x + s.vx);
        s.y = f32(s.y + s.vy);
        if (outside(s)) {
          layer.kill(i);
          break;
        }
        const [x, y] = [cint(s.x), cint(s.y)];
        out.quad("rakete", x, y, x + size.w, y + size.h);
        secondaryHit(i, s);
        break;
      }
      case 13:
      case 14: {
        // Zielsuchrakete (13) und Beam-Suchgeschoss (14)
        const beam = s.type === 14;
        if (s.b === 0) {
          if (beam) {
            s.b = 1;
            initTrail(s, 10);
          } else s.b = cint(Math.sqrt(s.vx * s.vx + s.vy * s.vy));
          s.a = cint(s.param);
        }
        setBox(7, 7, 25, 25);
        s.x = f32(s.x + 16);
        s.y = f32(s.y + 16);
        const t = nearest(host, s.x, s.y);
        if (t) {
          if (!beam) {
            const c = [0.2, 1, 0.2, 0.2] as const;
            out.line(s.x, s.y, t.x + idiv(t.w, 2), t.y + idiv(t.h, 2), 5, c, c);
          }
          steer(s, s.x, s.y, t);
        }
        const speed = beam ? 15 : s.b;
        s.vx = f32(speed * cos(s.a));
        s.vy = f32(speed * sin(s.a));
        if (beam) {
          trail(out, s, s.x, s.y, 10, 8, 0, 0, 1, true);
          trail(out, s, s.x, s.y, 10, 8, 1, 1, 1, false);
        } else {
          const r1 = rnd.next();
          const r2 = rnd.next();
          const r3 = rnd.next();
          fx.addBig(
            s.x - 5 - 2 * s.vx,
            s.y - 5 - 2 * s.vy,
            -s.vx / 6 - 0.5 + r1,
            -s.vy / 6 - 0.5 + r2,
            1,
            r3,
            0.2,
            7,
            0,
            10,
            1,
            0,
          );
        }
        s.x = f32(s.x - 16 + s.vx);
        s.y = f32(s.y - 16 + s.vy);
        if (outside(s)) {
          layer.kill(i);
          break;
        }
        if (beam) {
          out.quad("a_kreis2", s.x, s.y, s.x + 32, s.y + 32, 0, 0, 1, 1, true);
          out.quad("a_kreis2", s.x, s.y, s.x + 32, s.y + 32, 1, 1, 1, 1, true);
        } else {
          const [x, y] = [cint(s.x), cint(s.y)];
          out.quad("rakete2", x, y, x + 32, y + 32, 1, 1, 1, 1, false, s.a);
        }
        secondaryHit(i, s);
        break;
      }
      // 2 (ohne Erzeuger) und 15 (wird nie bewegt) fehlen im Original ebenso
    }
  }

  /** Treffer der Laser 6/9/10: Kopf steht `dieTicks` lang, Glut in Typfarbe. */
  function laserHit(s: PlayerShot, dieTicks: number, r: number, g: number, b: number): void {
    const rest = hit(s, s.x, s.y - 8, s.x + 16, s.y + 8);
    s.damage = f32(rest);
    if (rest === 0) {
      s.a = dieTicks;
      fx.addBig(s.x, s.y - 8, 0, 0, r, g, b, 16, 0, dieTicks, 1, 0);
      return;
    }
    if (land(s.x, s.y - 8, s.x + 16, s.y + 8)) {
      s.a = dieTicks;
      spark(s.x - 3, s.y - 3, s.x + 18, s.y + 18, true);
      fx.addBig(s.x, s.y - 8, 0, 0, r, g, b, 16, 0, dieTicks, 1, 0);
    }
  }

  /** Treffertest der Zweitwaffen 12–14: Treffer oder Landschaft → Einschlag. */
  function secondaryHit(i: number, s: PlayerShot): void {
    const [x1, y1, x2, y2] = [s.x + box.x1, s.y + box.y1, s.x + box.x2, s.y + box.y2];
    const dmg = cint(s.damage);
    const rest = host.hitEnemies(cint(x1), cint(y1), cint(x2), cint(y2), dmg, s.owner, true);
    if (rest !== dmg) {
      if (s.type === 14 && host.combo(s.owner) > 1 && rest > 0) host.comboHit(s.owner);
      blast(i, s);
      return;
    }
    if (land(x1, y1, x2, y2)) blast(i, s);
  }
}
