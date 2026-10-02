import type { DrawList, Effects, LineSink } from "./effects";
import type { EnvList } from "./envDraw";
import type { Player, PlayerInput } from "./player";
import { drawTrail, type ShotLayer } from "./playerShots";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, vbInt, winkel, type VbRnd } from "./vb";

/**
 * `SpielBeam` (`0x513940`): Laden (A gehalten), Abfeuern beim Loslassen,
 * Beam 1 als Geschoss mit Schadensbudget (Schiff 0, 1 und das Debug-Schiff 2
 * mit eigenem Flug, Ladegrafik und Nachwirkung), Beam 2 mit Kraftphase
 * (Hauptschuss × 2, Abschüsse spalten die Gegner, Kombo), Q wechselt den Typ.
 * Befund: `docs/measurements/dovez-runtime.md` („Beam und Kombo“, „Debug-Schiff 2
 * und Drohnen“).
 */

/** Beam-Record `Me.CB0[p]` (0x34). */
export interface Beam {
  /** Kraftphasen-Zeit (+0x00): +1 je Tick, 500 Ende, danach Ausklingen. */
  time: number;
  /** Spitze und Ursprung beim Abfeuern (+0x04…+0x10). */
  tipX: number;
  tipY: number;
  originX: number;
  originY: number;
  /** Typ 0: Breite = Ladung / 3; Typ 1: Drehwinkel der Aura (+0x14). */
  width: number;
  /** Gewählter (+0x18) und aktiver Typ (+0x1C). */
  selected: number;
  type: number;
  /** Ladung 0…165 (+0x20) und Ladung beim Abfeuern (+0x24). */
  charge: number;
  fired: number;
  /** Schaden bzw. Restschaden; bei voller Kraftphase der gesicherte Hintergrund (+0x28). */
  damage: number;
  /** Beam läuft (+0x2C) und Kraftphase (+0x2E). */
  running: boolean;
  power: boolean;
  /**
   * Nachglühen 10 → 0 (+0x30). Das Debug-Schiff 2 nutzt das Feld negativ: −100 nach einem
   * Treffer (Nachwirkung), zählt je Tick bis 0.
   */
  glow: number;
}

export const newBeam = (): Beam => ({
  time: 0,
  tipX: 0,
  tipY: 0,
  originX: 0,
  originY: 0,
  width: 0,
  selected: 0,
  type: 0,
  charge: 0,
  fired: 0,
  damage: 0,
  running: false,
  power: false,
  glow: 0,
});

/** `VariabelnLösch`: +0x00, +0x1C, +0x20, +0x2C, +0x2E. */
export function clearBeam(b: Beam): void {
  b.time = 0;
  b.type = 0;
  b.charge = 0;
  b.running = false;
  b.power = false;
}

/** Einsaug-Partikel beim Laden (`Me.CCC`, 0x18). */
interface Suck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  active: boolean;
}

/** Modul-Globale von `SpielBeam` (`Me.1288+0x5BC…0x620`), für beide Spieler gemeinsam. */
export interface BeamShared {
  qHeld: boolean[];
  auraOn: boolean;
  auraR: number;
  /** Vier Spiralspuren (xs, ys) à 21 Punkte. */
  spirals: [Float32Array, Float32Array][];
  suck: Suck[];
}

export const newBeamShared = (): BeamShared => ({
  qHeld: [false, false],
  auraOn: false,
  auraR: 0,
  spirals: Array.from({ length: 4 }, () => [
    new Float32Array(21).fill(-1),
    new Float32Array(21).fill(-1),
  ]),
  suck: Array.from({ length: 11 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, alpha: 0, active: false })),
});

export interface Combo {
  /** Multiplikator (`Me.59C`), Treffer (`Me.5B8`), Bonuspunkte (`Me.5D4`) je Spieler. */
  readonly mult: number[];
  readonly hits: number[];
  readonly bonus: number[];
}

export function resetCombo(c: Combo, p: number): void {
  c.mult[p] = 1;
  c.hits[p] = 0;
  c.bonus[p] = 0;
}

export interface BeamWorld {
  readonly tick: number;
  readonly rnd: VbRnd;
  readonly fx: Effects;
  readonly out: DrawList;
  /** Befehlsliste des Schiff-2-Beams (Erfassen und Zeichnen in Ausführungsreihenfolge). */
  readonly env: EnvList;
  /** Spielerschüsse (Beam-Suchgeschosse Typ 14 des Schiffs 2). */
  readonly layers: readonly [ShotLayer, ShotLayer];
  /** `Me.6D0 += v` (Rauschen, `MakeSomeNoise`). */
  noise(v: number): void;
  readonly players: readonly Player[];
  readonly playersMinus1: number;
  readonly beams: readonly Beam[];
  readonly shared: BeamShared;
  readonly combo: Combo;
  /** Wasserlinie `550 − Me.1D4`. */
  readonly waterLine: number;
  /** Option „Force-Modus-Taste wirkt als Beamwechsel“ (`Me.512 = 0`, Vorgabe). */
  readonly qToggles: boolean;
  input(p: number): PlayerInput | undefined;
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  /** `CheckColisionWithEnemy` mit Funken; `out.armored` = gepanzert getroffen. */
  hitEnemies(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    damage: number,
    owner: number,
    pierce: boolean,
    out: { enemy: number; armored: boolean },
  ): number;
  background(v?: number): number;
  sound(name: string): void;
  /** Schleife an/aus mit Abspielrate (Frequenz / 44100). */
  loop(name: string, on: boolean, rate?: number): void;
  /** `AddForce` (`0x529870`): Joystick-Vibration, reine Ausgabe. */
  vibrate?(strength: number, ticks: number, player: number): void;
}

const HIT_LEFT = 0;
const HIT_TOP = 17;
const HIT_RIGHT = 64;
const HIT_BOTTOM = 54;
const MID_Y = HIT_TOP + Math.trunc((HIT_BOTTOM - HIT_TOP) / 2);

/** Ein Tick `SpielBeam` für alle Spieler. */
export function stepBeams(w: BeamWorld): void {
  for (const p of w.players) {
    const i = p.index;
    const c = w.beams[i]!;
    if (!p.alive) continue;
    const input = w.input(i);
    const exitLock = (w.players[0]?.exitState ?? 0) !== 0;
    // 3.1 Typwahl
    if (w.qToggles) {
      if (input?.switchBeam) {
        if (!w.shared.qHeld[i]) {
          w.sound("press_q");
          c.selected = 1 - c.selected;
        }
        w.shared.qHeld[i] = true;
      } else w.shared.qHeld[i] = false;
    }
    if (c.selected !== c.type && !c.running) {
      w.loop(`charge${c.type + 1}`, false);
      c.type = 1 - c.type;
      c.charge = 0;
    }
    if (!w.qToggles) c.selected = input?.switchBeam ? 1 : 0;
    // Feuer gehalten oder Levelausflug gilt als losgelassen; Feuer und Beam sperrt der Ausflug von Spieler 1
    let charging: boolean;
    if (((input?.fire ?? false) && !exitLock) || p.exitState !== 0) charging = false;
    else
      charging =
        (!w.qToggles && (input?.switchBeam ?? false)) || ((input?.beam ?? false) && !exitLock);
    // 3.2 Laden / 3.3 Abfeuern
    if (charging) {
      if (!c.running) {
        c.charge = f32(c.charge + 0.9);
        if (c.charge > 165) c.charge = 165;
        c.fired = c.charge;
        const full = c.charge === 165;
        const hz =
          c.type === 0
            ? full
              ? 30000
              : cint(c.charge * 120 + 10000)
            : full
              ? 18000
              : cint(c.charge * 100 + 1000);
        w.loop(`charge${c.type + 1}`, true, hz / 44100);
      }
    } else if (!c.running && c.charge > 0) fire(w, p, c);
    if (c.glow > 0) afterglow(w, p, c);
    if (c.type === 0 && c.running) {
      if (p.shipType === 1) flight1(w, p, c);
      else if (p.shipType === 2) flight2(w, p, c);
      else flight0(w, p, c);
    } else if (c.type === 0 && c.charge > 0) chargeGraphics(w, p, c);
    if (c.type === 1) beam2(w, p, c);
    suckIn(w, p, c);
  }
}

/** §3.3 Loslassen: Ton, Schaden, Ursprung; Beam 2 voll startet die Kraftphase. */
function fire(w: BeamWorld, p: Player, c: Beam): void {
  w.loop(`charge${c.type + 1}`, false);
  if ((c.type === 0 && c.charge > 9) || (c.type === 1 && c.charge === 165))
    w.sound(`beam${c.type + 1}`);
  w.vibrate?.(1, 5, p.index); // `AddForce(1, 5, Spieler)` (`0x5143A8`)
  c.running = true;
  for (const [xs, ys] of w.shared.spirals) {
    xs.fill(-1);
    ys.fill(-1);
  }
  if (c.charge === 165) {
    c.damage = p.shotPower * 8500;
    if (c.type === 0) w.fx.shake += 10;
    if (p.shipType === 1) c.damage += 1500;
  } else {
    c.damage = cint(Math.pow(c.charge, f32(1.6)) * p.shotPower);
    if (c.type === 0) w.fx.shake = cint(c.charge / 20 + w.fx.shake);
  }
  c.tipX = f32(HIT_RIGHT + p.x);
  c.tipY = f32(p.y + MID_Y);
  c.originX = c.tipX;
  c.originY = c.tipY;
  c.fired = c.charge;
  c.charge = 0;
  if (c.type === 0) {
    c.width = f32(c.fired / 3);
    w.fx.addBig(p.x + 5, p.y + 5, -4, 0, 1, 1, 1, 54, 0, c.fired === 165 ? 10 : 5, 11, 0);
  } else if (c.fired === 165) {
    c.damage = w.background();
    if (w.playersMinus1 === 0) w.background(0);
    c.power = true;
  }
}

const beamGreen = (p: Player) => f32(p.shotPower * 0.2 + 0.4);

/** Strahlkörper `balken` + `balkene` vom Ursprung bis zur Spitze. */
function body(w: BeamWorld, p: Player, c: Beam, alpha: number): void {
  const h = idiv(c.width, 2);
  const y1 = f32(c.originY - h - 2);
  const y2 = f32(h + c.originY + 2);
  const g = beamGreen(p);
  w.out.quad("balken", c.originX + 15, y1, c.tipX + h, y2, 0.7, g, 1, alpha);
  w.out.quad("balkene", c.originX, y1, c.originX + 15, y2, 0.7, g, 1, alpha);
}

/** §3.4 Nachglühen: Kombo aus, Körper blendet aus, die Spiralen laufen aus (mit dem Fehler xs = ys). */
function afterglow(w: BeamWorld, p: Player, c: Beam): void {
  resetCombo(w.combo, p.index);
  body(w, p, c, c.glow / 10);
  c.glow--;
  for (const [xs] of w.shared.spirals)
    drawTrail(w.out, xs, xs, -1, -1, 15, c.width / 2, 0.7, 0.4, 1, true);
}

/** Zeichensenke: Rechtecke und Balken. */
interface Sink extends LineSink {
  quad(
    key: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r?: number,
    g?: number,
    b?: number,
    a?: number,
    additive?: boolean,
  ): void;
}

/** Schreibt in Ausführungsreihenfolge in eine Env-Liste, damit Erfassen und Zeichnen sich abwechseln. */
class EnvSink implements Sink {
  constructor(readonly list: EnvList) {}

  quad(
    key: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r = 1,
    g = 1,
    b = 1,
    a = 1,
    additive = false,
  ): void {
    this.list.rect(key, x1, y1, x2, y2, r, g, b, a, additive);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    c1: readonly [number, number, number, number],
    c2: readonly [number, number, number, number],
    additive = false,
  ): void {
    this.list.segment({ x1, y1, x2, y2, w, c1, c2, additive });
  }
}

/** Vier Spiralspuren um den vollen Beam und ihre Köpfe (Schiffsstärke ≥ 3 bzw. ≥ 2). */
function spirals(w: BeamWorld, c: Beam, out: Sink = w.out): void {
  const d = c.tipX - c.originX;
  const table: [number, number][] = [
    [0.8, 30],
    [0.8, -30],
    [0.5, 60],
    [0.5, -60],
  ];
  w.shared.spirals.forEach(([xs, ys], k) => {
    const [f, amp] = table[k]!;
    const hx = c.tipX;
    const hy = f32(c.tipY + amp * (SIN_DEG[degIndex(cint(d * f))] ?? 0));
    drawTrail(out, xs, ys, hx, hy, 15, c.width / 2, 0.7, 0.4, 1, true);
    const r = c.width / 2;
    out.quad("a_kreis2", hx - r, hy - r, hx + r, hy + r, 0.7, 0.4, 1, 1);
    out.quad("a_kreis2", hx - r, hy - r, hx + r, hy + r, 0.7, 0.4, 1, 1, true);
  });
}

/** Schadensbudget: Treffer verbraucht, Abschuss gibt den Rest weiter (Kombo + 0,5). */
function budget(
  w: BeamWorld,
  p: Player,
  c: Beam,
  box: [number, number, number, number],
  shrink: boolean,
): { spent: boolean; armored: boolean } {
  const i = p.index;
  const out = { enemy: -1, armored: false };
  for (;;) {
    const rest = w.hitEnemies(...box, c.damage, i, c.fired === 165, out);
    if (rest === 0) return { spent: true, armored: out.armored };
    if (rest === c.damage) return { spent: false, armored: out.armored };
    w.combo.mult[i] = f32((w.combo.mult[i] ?? 1) + 0.5);
    w.combo.hits[i] = (w.combo.hits[i] ?? 0) + 1;
    c.damage = cint(rest);
    if (shrink) {
      c.width = idiv(Math.pow(c.damage, f32(1 / f32(1.6))), 3);
      if (c.width > 55) c.width = 55;
    }
  }
}

/** Querschläger bzw. Glut beim Verbrauch. */
function spentBurst(w: BeamWorld, p: Player, c: Beam, armored: boolean, ship1: boolean): void {
  const rnd = w.rnd;
  const n = idiv(c.fired, 5);
  const x0 = idiv(c.width, 2) + c.tipX + (ship1 ? 20 : 0);
  const g = beamGreen(p);
  for (let k = 0; k <= n; k++) {
    if (armored) {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      const [y, size, life] = ship1 ? [c.tipY - 8, 16, 23] : [c.tipY - 16, 32, 13];
      w.fx.addBig(x0, y, 2 * r1 - 8, 6 * r2 - 3, 1, 0.4, 0.2, size, 0, life, 5, r3 * 360);
    } else {
      const r1 = rnd.next();
      const r2 = rnd.next();
      w.fx.addBig(x0, c.tipY, 5 * r1 - 4, 6 * r2 - 3, 0.7, g, 1, 8, 0, 23, 1, 0);
    }
  }
}

/** §3.5 Beam 1 im Flug, Schiff 0: 24 px/Tick, Körper, Blitze, Spiralen, Treffer. */
function flight0(w: BeamWorld, p: Player, c: Beam): void {
  const i = p.index;
  if (c.fired < 10) {
    abort(c);
    return;
  }
  c.tipX = f32(c.tipX + 24);
  const wd = c.width;
  const h = idiv(wd, 2);
  const g = beamGreen(p);
  if (c.fired === 165) w.fx.addBig(c.tipX + 12, c.tipY - h, -2, 0, 1, g, 1, cint(wd), 0, 15, 3, h);
  body(w, p, c, 1);
  if (p.shotPower >= 2) {
    for (let k = 1; k <= idiv(c.fired, 30); k++) {
      w.fx.lightning(
        w.out,
        c.originX,
        c.originY,
        c.tipX + h,
        c.originY,
        idiv(wd, 4),
        idiv(c.tipX - c.originX, 18),
        10,
        0.7,
        0.4,
        1,
        true,
      );
    }
  }
  if (c.fired === 165 && p.shotPower >= 3) spirals(w, c);
  if (c.tipX > 800) {
    c.glow = 10;
    c.running = false;
    return;
  }
  const box: [number, number, number, number] = [
    cint(c.tipX),
    cint(c.tipY - h),
    cint(wd + c.tipX),
    cint(h + c.tipY),
  ];
  w.out.quad("a_kreis2", box[0], box[1], box[2], box[3], 0.7, g, 1, 1);
  box[0] = cint(c.tipX - 24);
  if (c.fired < 165 && w.terrain(...box)) {
    c.running = false;
    c.glow = 10;
    w.fx.addBig(c.tipX, c.tipY - h, 0, 0, 0.7, g, 1, cint(wd), 0, 10, 1, 0);
  }
  w.combo.hits[i] = (w.combo.hits[i] ?? 0) + 1;
  const r = budget(w, p, c, box, true);
  if (r.spent) {
    c.running = false;
    c.glow = 10;
    w.fx.addBig(c.tipX, c.tipY - h, 0, 0, 0.7, g, 1, cint(c.width), 1, 10, 1, 0);
    spentBurst(w, p, c, r.armored, false);
  }
  w.combo.hits[i] = (w.combo.hits[i] ?? 0) - 1;
}

/** §3.5 Beam 1 im Flug, Schiff 1: blaue Feuerbälle, 20 px/Tick nach dem Treffertest. */
function flight1(w: BeamWorld, p: Player, c: Beam): void {
  const i = p.index;
  if (c.fired < 10) {
    abort(c);
    return;
  }
  const wd = c.width;
  const h = idiv(wd, 2);
  const g = beamGreen(p);
  const rnd = w.rnd;
  const box: [number, number, number, number] = [
    cint(c.tipX - 24),
    cint(c.tipY - h),
    cint(wd + c.tipX),
    cint(h + c.tipY),
  ];
  const r = rnd.next();
  w.fx.addFireballs(
    c.tipX,
    c.tipY - h,
    wd + c.tipX,
    h + c.tipY,
    0.2,
    0.2,
    1,
    32,
    cint(c.fired / 16),
    cint(2 * r + 5),
  );
  if (c.fired === 165) {
    const r1 = rnd.next();
    const r2 = rnd.next();
    w.fx.addBig(
      c.tipX,
      c.tipY - wd,
      0,
      0,
      0.1,
      0.1,
      1,
      cint(2 * wd),
      5,
      cint(2 * r1 + 15),
      4,
      r2 * 360,
    );
    if (p.shotPower >= 3)
      w.fx.addBig(
        c.tipX + 12,
        c.tipY - h,
        -2,
        0,
        0.3,
        f32(0.2 * p.shotPower + 0.2),
        1,
        cint(wd),
        0,
        15,
        2,
        idiv(wd, 3),
      );
    if (p.shotPower >= 2) spirals(w, c);
  }
  if (box[1] > w.waterLine) {
    const rb = rnd.next();
    w.fx.addBubble(c.tipX - 3, c.tipY - 3, cint(rb * 5 + 3));
  }
  if (c.tipX > 800) {
    c.running = false;
    resetCombo(w.combo, i);
    c.tipX = f32(c.tipX + 20);
    return;
  }
  if (c.fired < 165 && w.terrain(...box)) {
    c.running = false;
    resetCombo(w.combo, i);
    w.fx.addBig(c.tipX, c.tipY - h, 0, 0, 0.7, g, 1, cint(wd), 0, 10, 1, 0);
  }
  w.combo.hits[i] = (w.combo.hits[i] ?? 0) + 1;
  const res = budget(w, p, c, box, false);
  if (res.spent) {
    c.glow = 10;
    c.running = false;
    resetCombo(w.combo, i);
    w.fx.addBig(c.tipX, c.tipY - h, 0, 0, 0.7, g, 1, cint(c.width), 1, 10, 1, 0);
    spentBurst(w, p, c, res.armored, true);
  }
  w.combo.hits[i] = (w.combo.hits[i] ?? 0) - 1;
  c.tipX = f32(c.tipX + 20);
}

/**
 * Erfasst einen Ausschnitt des Backbuffers (`Blt`, links/oben inklusive, rechts/unten
 * exklusiv). Das Original meldet bei einem Rechteck außerhalb des Bildschirms einen
 * DirectDraw-Fehler; der Port klemmt es an den Bildschirm.
 */
function grab(
  env: EnvList,
  target: "blur" | "lens",
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  overlay?: string,
): void {
  const l = Math.max(0, x1);
  const t = Math.max(0, y1);
  const r = Math.min(800, x2);
  const b = Math.min(600, y2);
  if (r > l && b > t) env.capture(target, l, t, r - l, b - t, overlay);
}

/**
 * §3.5 Beam 1 im Flug, Debug-Schiff 2 (`0x514EDC`): wie Schiff 1 (20 px/Tick nach dem
 * Treffertest), aber mit Schadensbudget − 2100, ohne Feuerbälle, einer Linse aus dem
 * erfassten Bildschirm statt Körper und Blitzen, und einer Nachwirkung: jeder Treffer
 * (auch an der Landschaft) setzt `glow = −100`, danach steht der Strahl und klingt
 * `−glow` Ticks lang aus; ein voller Beam schickt dabei acht Suchgeschosse (Typ 14) los.
 */
function flight2(w: BeamWorld, p: Player, c: Beam): void {
  const i = p.index;
  if (c.fired < 10) {
    abort(c);
    return;
  }
  const out = new EnvSink(w.env);
  if (c.glow < 0) {
    aftermath(w, p, c, out);
    return;
  }
  const wd = c.width;
  const wi = cint(wd);
  const h = Math.trunc(wi / 2);
  const q = Math.trunc(wi / 4);
  const g = beamGreen(p);
  const rnd = w.rnd;
  const yTop = f32(c.tipY - h);
  const yBot = f32(h + c.tipY);
  // Linse am Kopf (Erfassen vor dem Kopf, mit a_kreis3 überblittet) und Körper aus dem erfassten Streifen
  grab(
    w.env,
    "lens",
    cint(h + c.tipX - q),
    cint(c.tipY - q),
    cint(q + (h + c.tipX)),
    cint(q + c.tipY),
    "a_kreis3",
  );
  grab(
    w.env,
    "blur",
    cint(h + c.originX - q),
    cint(c.tipY - q),
    cint(q + (c.tipX - h)),
    cint(q + c.tipY),
  );
  out.quad("@blur", c.originX, yTop, c.tipX, yBot, 1, 1, 1, 1);
  out.quad("balken", c.originX, yTop, c.tipX, yBot, 1, 1, 1, 0.3, true);
  out.quad("@lens", c.tipX, yTop, f32(wd + c.tipX), yBot, 1, 1, 1, 1);
  out.quad("a_kreis2", c.tipX, yTop, f32(wd + c.tipX), yBot, 1, 1, 1, 0.3, true);
  const box: [number, number, number, number] = [
    cint(c.tipX - 24),
    cint(c.tipY - h),
    cint(wd + c.tipX),
    cint(h + c.tipY),
  ];
  if (c.fired === 165) {
    // Regenbogen-Striche: vier Farb-/Lebenswürfe, dann die Drehung
    const r1 = rnd.next();
    const r2 = rnd.next();
    const r3 = rnd.next();
    const r4 = rnd.next();
    const r5 = rnd.next();
    w.fx.addBig(
      c.tipX,
      f32(c.tipY - wd),
      0,
      0,
      r1,
      r2,
      r3,
      cint(wd + wd),
      5,
      cint(2 * r4 + 15),
      4,
      f32(r5 * 360),
    );
    if (p.shotPower >= 3)
      w.fx.addBig(
        c.tipX + 12,
        c.tipY - h,
        -2,
        0,
        0.3,
        f32(0.2 * p.shotPower + 0.2),
        1,
        wi,
        0,
        15,
        2,
        Math.trunc(wi / 3),
      );
    if (p.shotPower >= 2) spirals(w, c, out);
  }
  if (box[1] > w.waterLine) {
    const rb = rnd.next();
    w.fx.addBubble(c.tipX - 3, c.tipY - 3, cint(rb * 5 + 3));
  }
  if (c.tipX > 800) {
    c.running = false;
    resetCombo(w.combo, i);
    c.tipX = f32(c.tipX + 20);
    return;
  }
  if (w.terrain(...box)) {
    c.glow = -100;
    w.fx.addBig(c.tipX, c.tipY - h, 0, 0, 0.7, g, 1, wi, 0, 10, 1, 0);
  }
  w.combo.hits[i] = (w.combo.hits[i] ?? 0) + 1;
  const res = { enemy: -1, armored: false };
  for (;;) {
    const passed = c.damage - 2100;
    const rest = w.hitEnemies(...box, passed, i, c.fired === 165, res);
    if (rest === passed) break;
    c.glow = -100;
    w.combo.mult[i] = f32((w.combo.mult[i] ?? 1) + 0.5);
    w.combo.hits[i] = (w.combo.hits[i] ?? 0) + 1;
    c.damage = cint(rest + 2100);
    if (rest !== 0) continue;
    w.fx.addBig(c.tipX, c.tipY - h, 0, 0, 0.7, g, 1, wi, 1, 10, 1, 0);
    spentBurst(w, p, c, res.armored, true);
    break;
  }
  w.combo.hits[i] = (w.combo.hits[i] ?? 0) - 1;
  c.tipX = f32(c.tipX + 20);
}

/**
 * Nachwirkung des Beams von Schiff 2 (`glow < 0`, `0x515236`): im ersten Tick (−100) acht
 * Suchgeschosse (Typ 14, Winkel 110°…250°, Schaden `damage \ 7`) bei einem vollen Beam,
 * sonst `glow = −Int(Breite)`; dazu zwei Wellen (Art 17 Linse, Art 16 Glut). Der Strahl
 * steht, sein erfasster Körper blendet mit `−glow / 100` aus; bei 0 endet er.
 */
function aftermath(w: BeamWorld, p: Player, c: Beam, out: EnvSink): void {
  const wi = cint(c.width);
  const h = Math.trunc(wi / 2);
  const q = Math.trunc(wi / 4);
  if (c.glow === -100) {
    if (c.fired === 165) {
      for (let k = 110; k <= 250; k += 20)
        w.layers[1].add(
          14,
          c.tipX,
          c.tipY,
          f32((COS_DEG[k] ?? 0) * 20),
          f32((SIN_DEG[k] ?? 0) * 20),
          k,
          Math.trunc(c.damage / 7),
          p.index,
        );
    } else c.glow = cint(-vbInt(c.width));
    const x = f32(f32(h + c.tipX) - 32);
    const y = f32(c.tipY - 32);
    w.fx.addBig(x, y, 0, 0, 1, 1, 1, 64, 0, wi, 17, 1);
    w.fx.addBig(x, y, 0, 0, 1, 1, 1, 64, 0, wi, 16, 1);
  }
  const yTop = f32(c.tipY - h);
  const yBot = f32(h + c.tipY);
  grab(
    w.env,
    "blur",
    cint(h + c.originX - q),
    cint(c.tipY - q),
    cint(q + (c.tipX - h)),
    cint(q + c.tipY),
  );
  out.quad("@blur", c.originX, yTop, c.tipX, yBot, 1, 1, 1, f32(-c.glow / 100));
  out.quad("balken", c.originX, yTop, c.tipX, yBot, 1, 1, 1, f32(-c.glow / 300), true);
  c.glow++;
  if (c.glow === 0) {
    c.running = false;
    resetCombo(w.combo, p.index);
  }
}

function abort(c: Beam): void {
  c.running = false;
  c.charge = 0;
  c.fired = 0;
}

/** §3.6 Lade-Grafik Beam 1 je Schiff (Ladekugel, Wellen, Striche bzw. Funken). */
function chargeGraphics(w: BeamWorld, p: Player, c: Beam): void {
  const rnd = w.rnd;
  const q = cint(c.charge);
  const x1 = cint(HIT_RIGHT + p.x - 4);
  const y1 = cint(p.y + MID_Y - Math.trunc(q / 6));
  const x2 = cint(Math.trunc(q / 3) + HIT_RIGHT + p.x - 4);
  const y2 = cint(Math.trunc(q / 6) + p.y + MID_Y);
  if (y1 > w.waterLine && rnd.next() < 0.4) {
    const r1 = rnd.next();
    const r2 = rnd.next();
    const r3 = rnd.next();
    w.fx.addBubble((x2 - x1) * r1 + x1 - 6, (y2 - y1) * r2 + y1 - 6, cint(r3 * 5 + 3));
  }
  if (p.shipType === 2) {
    chargeGraphics2(w, p, c);
    return;
  }
  if (p.shipType === 1) {
    const r = Array.from({ length: 7 }, () => rnd.next());
    w.fx.addBig(
      p.x + 64,
      p.y + 24 + 8 * r[0]!,
      2 * r[1]! - 10,
      4 * r[2]! - 2,
      r[3]!,
      r[4]!,
      r[5]!,
      8,
      0,
      cint(2 * r[6]! + 15),
      1,
      c.charge / 33,
    );
    const r8 = rnd.next();
    const r9 = rnd.next();
    w.fx.addBig(
      p.x + 32,
      p.y + 32,
      0,
      0,
      0.1,
      0.1,
      1,
      1,
      cint(c.charge / 16),
      cint(2 * r8 + 5),
      4,
      r9 * 360,
    );
    if (c.charge >= 160) {
      const rr = rnd.next();
      if (w.tick % 2 === 0)
        w.fx.addBig(p.x + 20, p.y + 20, -4, -5, 0.1, 0.1, 1, 4, 0, cint(2 * rr + 15), 1, 10);
      else w.fx.addBig(p.x + 20, p.y + 40, -4, 5, 0.1, 0.1, 1, 4, 0, cint(2 * rr + 15), 1, 10);
    }
    return;
  }
  const g2 = f32(0.2 * p.shotPower + 0.2);
  const out = w.out;
  out.quad("a_kreis2", x1, y1, x2, y2, 0.6, g2, 1, 1);
  if (c.charge > 150) out.quad("a_kreis2", x1, y1, x2, y2, 1, 1, 1, (c.charge - 150) / 25);
  if (c.charge !== 165) {
    const step = f32(Math.trunc(q / 32) + 1);
    const off = f32((q % cint(32 / step)) * step * 2);
    const bx = HIT_LEFT + p.x + off;
    const yt = HIT_TOP + p.y;
    const yb = HIT_BOTTOM + p.y;
    for (const [dx, dy, a] of [
      [-8, 11, 0.2],
      [-4, 8, 0.4],
      [0, 5, 0.6],
    ] as const)
      out.quad("wave", bx + dx, yt - dy, bx + 10, yb + dy, 0.9, g2, 1, a);
  }
  for (let k = 0; k < 4; k++) {
    const rot = cint(rnd.next() * 90 + 90 * k);
    out.quad("strich", x1 - 5, y1 - 5, x2 + 7, y2 + 7, 1, g2, 1, 0.3, false, rot);
  }
}

/**
 * §3.6 Lade-Grafik Beam 1, Debug-Schiff 2 (`0x51A89B`): Rauschen bis 0,05, eine Linse vor
 * der Nase (Mitte Schiff + (96, 32), Radius 5…32 aus der Ladung) mit einem bunten
 * Blitz darin, Funken hinter den einsaugenden Partikeln; bei voller Ladung zwei
 * schwache, zitternde Geisterbilder des Schiffs.
 */
function chargeGraphics2(w: BeamWorld, p: Player, c: Beam): void {
  const rnd = w.rnd;
  const out = new EnvSink(w.env);
  w.noise(f32(f32(c.charge * 0.05) / 165));
  const cx = f32(p.x + 96);
  const cy = f32(p.y + 32);
  const r = cint((c.charge * 27) / 165 + 5);
  const r1 = rnd.next();
  const r2 = rnd.next();
  const r3 = rnd.next();
  w.fx.addBig(cx - r, cy - r, 0, 0, r1, r2, r3, 2 * r, 1, 1, 0, 2 * r);
  const k = r * 0.75;
  grab(w.env, "lens", cint(cx - k), cint(cy - k), cint(k + cx), cint(k + cy), "a_kreis3");
  out.quad("@lens", cx - r, cy - r, cx + r, cy + r, 1, 1, 1, 1);
  out.quad("a_kreis2", cx - r, cy - r, cx + r, cy + r, 1, 1, 1, 0.3, true);
  if (c.charge < 165) {
    for (let n = 5 * p.index; n <= 5 * p.index + 5; n++) {
      const s = w.shared.suck[n]!;
      if (!s.active) continue;
      const q1 = rnd.next();
      const q2 = rnd.next();
      const q3 = rnd.next();
      const q4 = rnd.next();
      const q5 = rnd.next();
      w.fx.addBig(s.x - 8, s.y - 8, 2 * q1 - 1, 2 * q2 - 1, q3, q4, q5, 16, 3, 7, 16, 0);
    }
    return;
  }
  const key = `dove2${p.tilt + 1}${p.animFrame + 1}`;
  const t = w.tick;
  const sway = (a: number, b: number): [number, number] => [
    2 * (SIN_DEG[degIndex(a * t)] ?? 0),
    2 * (COS_DEG[degIndex(b * t)] ?? 0),
  ];
  const [dx1, dy1] = sway(2, 4);
  const [dx2, dy2] = sway(5, 6);
  out.quad(key, p.x + dx1, p.y + dy1, p.x + dx1 + 64, p.y + dy1 + 64, 1, 1, 1, 0.2);
  out.quad(key, p.x - dx2, p.y - dy2, p.x - dx2 + 64, p.y - dy2 + 64, 1, 1, 1, 0.2);
}

/** §3.7 Beam 2: Fehlschuss-Kollaps, Kraftphase (500 Ticks) und Ausklingen, Laden mit Blitzen, Aura. */
function beam2(w: BeamWorld, p: Player, c: Beam): void {
  const sh = w.shared;
  const rnd = w.rnd;
  if (c.running) {
    if (c.fired < 165) {
      sh.auraR -= 4;
      sh.auraOn = true;
      if (sh.auraR < -2) {
        c.running = false;
        c.charge = 0;
        c.fired = 0;
      }
    } else {
      if (sh.auraR > -2) {
        sh.auraR -= 1;
        sh.auraOn = false;
      }
      c.time++;
      const t = c.time;
      if (t < 10) w.out.quad("weiss", 0, 0, 800, 550, 1, 1, 1, t / 10);
      else if (t < 20) w.out.quad("weiss", 0, 0, 800, 550, 1, 1, 1, 2 - t / 10);
      if (c.time === 500) {
        w.background(c.damage);
        c.power = false;
        resetCombo(w.combo, p.index);
      }
      if (c.time > 500) {
        c.charge = f32(c.charge - 0.2);
        if (c.charge <= 0) {
          c.running = false;
          c.charge = 0;
          c.fired = 0;
          c.time = 0;
        }
      } else {
        p.energy = f32(p.energy + 0.03);
        c.charge = c.fired;
      }
    }
  } else if (c.charge > 0) {
    for (let k = 0; k <= idiv(c.charge, 30); k++) {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      const r4 = rnd.next();
      w.fx.lightning(
        w.out,
        p.x + HIT_LEFT + (HIT_RIGHT - HIT_LEFT) * r1,
        p.y + HIT_TOP + (HIT_BOTTOM - HIT_TOP) * r2,
        p.x + HIT_LEFT + (HIT_RIGHT - HIT_LEFT) * r3,
        p.y + HIT_TOP + (HIT_BOTTOM - HIT_TOP) * r4,
        5,
        5,
        10,
        0.6,
        0.6,
        1,
        true,
      );
    }
    sh.auraR = 30;
    sh.auraOn = true;
  } else sh.auraOn = false;
  const cx = f32(p.x + HIT_LEFT + Math.trunc((HIT_RIGHT - HIT_LEFT) / 2));
  const cy = f32(p.y + MID_Y);
  if (sh.auraOn) {
    c.width += 9;
    if (c.width > 359) c.width = cint(c.width) % 360;
    const R = sh.auraR;
    const rect = [cint(cx - R * 1.5), cint(cy - R), cint(R * 1.5 + cx), cint(cy + R)] as const;
    for (let a = 0; a <= 360; a += cint(178 - c.fired)) {
      w.out.quad("strich", ...rect, 1, 1, 0.3, 0.2, false, cint(a - c.width));
      const s = SIN_DEG[degIndex(cint(a + c.width))] ?? 0;
      const co = COS_DEG[degIndex(cint(a + c.width))] ?? 0;
      const x = f32(s * R * 1.5 + cx - 5);
      const y = f32(co * R + cy - 5);
      w.out.quad("a_kreis2", x, y, x + 5, y + 5, 1, 1, 0.5, 0.4);
    }
  }
}

/** §3.8 Ende: Einsaug-Partikel beim Laden bzw. Ausklingbalken nach der Kraftphase. */
function suckIn(w: BeamWorld, p: Player, c: Beam): void {
  if (!(c.charge > 0 && c.charge < 165)) return;
  const rnd = w.rnd;
  if (c.time !== 0) {
    const t = c.type;
    const top = cint(HIT_TOP + p.y - 10);
    const bot = cint(HIT_BOTTOM + p.y + 10);
    const y1 = c.charge > 155 ? cint(((c.charge - 155) / 10) * top) : 0;
    const y2 = c.charge > 155 ? cint((1 - (c.charge - 155) / 10) * (550 - bot) + bot) : 550;
    const a = c.charge / 200;
    w.out.quad("balken", 0, y1, 800, top, t, t, t, a);
    w.out.quad("balken", 0, bot, 800, y2, t, t, t, a);
    if (c.charge > 155) {
      w.out.quad("balken", 0, y1 - 5, 800, y1 + 5, t, t, t, a);
      w.out.quad("balken", 0, y2 - 5, 800, y2 + 5, t, t, t, a);
    }
    return;
  }
  // Ziel: Ladekugel (Beam 1, Schiff 0), Schiffsmitte (Schiff 1), Linse (Schiff 2) bzw. Hitbox-Mitte (Beam 2)
  let tx: number;
  let ty: number;
  if (c.type === 1) {
    tx = f32(p.x + HIT_LEFT + Math.trunc((HIT_RIGHT - HIT_LEFT) / 2));
    ty = f32(p.y + MID_Y);
  } else if (p.shipType === 2) {
    // die Linse vor der Nase (`ST.5C4/5C8` aus der Ladegrafik)
    tx = f32(p.x + 96);
    ty = f32(p.y + 32);
  } else if (p.shipType === 1) {
    tx = p.x + 32;
    ty = p.y + 32;
  } else {
    tx = f32(idiv(c.charge, 6) + HIT_RIGHT + p.x - 2);
    ty = f32(p.y + HIT_TOP + (HIT_BOTTOM - HIT_TOP) / 2 - 1);
  }
  for (let k = 5 * p.index; k <= 5 * p.index + 5; k++) {
    const s = w.shared.suck[k]!;
    if (s.active) {
      const dx = tx - s.x;
      const dy = ty - s.y;
      const a = winkel(dx, dy);
      s.vx = f32(Math.cos(a) * (p.speed + 1));
      s.vy = f32(Math.sin(a) * (p.speed + 1));
      s.alpha = f32((400 - Math.sqrt(dy * dy + dx * dx)) / 400);
      if (s.alpha >= 0.9) s.active = false;
      s.x = f32(s.x + s.vx);
      s.y = f32(s.y + s.vy);
      w.out.quad("a_kreis2", s.x - 5, s.y - 5, s.x + 5, s.y + 5, 1, 1, 1, s.alpha);
    } else if (c.charge < 140) {
      s.active = true;
      s.x = vbInt(rnd.next() * 800);
      s.y = vbInt(rnd.next() * 550);
    }
  }
}
