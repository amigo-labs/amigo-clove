import type { DrawList, Effects } from "./effects";
import type { Player, PlayerInput } from "./player";
import type { ShotLayer, ShotTarget } from "./playerShots";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, winkelInGrad, type VbRnd } from "./vb";

/**
 * Drohnen des Debug-Schiffs 2 (`SpielDWeapons` `0x4E0ED0`, Drohnen-Array
 * `Me.B04`, Schüsse in `SpielSchieß` `0x4E3D0F`). Nur Spieler mit
 * `A7C[p].A8 = 2` (per Kommandozeile/Debug-Dialog, im Port `ship=2`).
 * Befund: `docs/measurements/dovez-runtime.md` („Debug-Schiff 2 und Drohnen“).
 *
 * Je Tick und Typ-2-Spieler, ohne Prüfung auf Leben oder Nova:
 * 1. zwei Drohnen ziehen als Kette nach (Verlauf von 11 Positionen, die Drohne
 *    liegt 10 Ticks hinter dem Ziel) und drehen sich um höchstens 10° je Tick in
 *    die Flugrichtung (`Me.B04[i].60`),
 * 2. die nächste Gegnerteil-Mitte im Umkreis von 170 px um (Schiff + 64, +32)
 *    bekommt vier `Blitz` (zwei Paare, rot mit schwarzem Kern) und 10 Schaden,
 * 3. zwei Kugeln (`dw1-0…9`) kreisen um das Schiff (Phase 0° und 180°), treffen
 *    mit 20 Schaden und feuern bei gehaltenem Feuer zufällig Paare von Schüssen
 *    (Typ −2),
 * 4. die drei Sonderwaffen `Me.B14[k]` (D-Taste); erreichbar ist nur die erste
 *    (`Me.B2C` wird nie gesetzt).
 */

/** Zwei Drohnen (`ReDim Me.B04(0 To Me.B10)`, `Me.B10 = 1`). */
export const DRONE_COUNT = 2;
/** Verlauf je Drohne: 11 Werte, der letzte (Index 10) ist die Drohnenposition der Folgedrohne. */
export const TRAIL = 11;
/** Anfangsvorrat der Sonderwaffen (`DoveReset` `0x4A6E97`: `Me.B14 = 30`, `Me.B18 = 4`, `Me.B1C = 0`). */
export const AMMO_START = [30, 4, 0] as const;
/** Radius der Zielsuche (`Me.724`, Start 170) und Ziel-Abstand der Bahnen. */
const AIM_RANGE = 170;

/** Eine Drohne (`Me.B04[i]`, 0x70). */
export interface Drone {
  /** Position (+0x00/+0x04): der jeweils älteste Wert des Verlaufs. */
  x: number;
  y: number;
  /** Verlauf (+0x08…+0x30 bzw. +0x34…+0x5C), Index 0 = neuester Zielpunkt. */
  xh: number[];
  yh: number[];
  /** Drehung in Grad (+0x60), Single. */
  angle: number;
  /** Feuerpause (+0x6C) der Schüsse aus `SpielSchieß`. */
  cooldown: number;
}

export interface Drones {
  /** `Me.B04(0 To 1)`. */
  readonly list: Drone[];
  /** Zielsuche mit Blitzen (`Me.B08`), Kugeln (`Me.B0A`) und ihr Feuer (`Me.B0C`), beim Start True. */
  aim: boolean;
  orbit: boolean;
  orbitFire: boolean;
  /** Vorrat (`Me.B14[k]`) und Abklingzeit (`Me.B20[k]`) der Sonderwaffen. */
  readonly ammo: number[];
  readonly reload: number[];
  /** Gewählte Sonderwaffe (`Me.B2C`); wird im Original nie gesetzt, bleibt 0. */
  mode: number;
}

const newDrone = (): Drone => ({
  x: 0,
  y: 0,
  xh: Array.from({ length: TRAIL }, () => 0),
  yh: Array.from({ length: TRAIL }, () => 0),
  angle: 0,
  cooldown: 0,
});

/** `DoveReset` (neues Spiel): Drohnen leer, Vorräte gefüllt. */
export const newDrones = (): Drones => ({
  list: Array.from({ length: DRONE_COUNT }, newDrone),
  aim: true,
  orbit: true,
  orbitFire: true,
  ammo: [...AMMO_START],
  reload: [0, 0, 0],
  mode: 0,
});

/** Tiefe Kopie (Kampagne, Spielstand). */
export function cloneDrones(d: Drones): Drones {
  return {
    list: d.list.map((r) => ({ ...r, xh: [...r.xh], yh: [...r.yh] })),
    aim: d.aim,
    orbit: d.orbit,
    orbitFire: d.orbitFire,
    ammo: [...d.ammo],
    reload: [...d.reload],
    mode: d.mode,
  };
}

/**
 * `DovePosSetup` (`0x4A6BF6`): jede Drohne und ihr ganzer Verlauf auf
 * (Schiff 0 + 16, +16) — immer Spieler 1, auch wenn der kein Typ-2-Schiff ist.
 */
export function placeDrones(d: Drones, p0: Player | undefined): void {
  if (!p0) return;
  const x = f32(p0.x + 16);
  const y = f32(p0.y + 16);
  for (const r of d.list) {
    r.xh.fill(x);
    r.yh.fill(y);
    r.x = x;
    r.y = y;
  }
}

export interface DroneWorld {
  readonly tick: number;
  readonly rnd: VbRnd;
  readonly fx: Effects;
  /** Zeichenliste der Drohnen (Schritt 5 von `SpielLoop`, vor `SpielSchieß`). */
  readonly out: DrawList;
  readonly players: readonly Player[];
  readonly layers: readonly [ShotLayer, ShotLayer];
  input(p: number): PlayerInput | undefined;
  /** Teile lebender, nicht fester Gegner ohne Panzerung und mit Kontur — auch unsichtbare. */
  targets(): readonly ShotTarget[];
  /** `CheckColisionWithEnemy` mit Funken, ohne Durchschlag, `exclude` −1. */
  hitEnemies(x1: number, y1: number, x2: number, y2: number, damage: number, owner: number): number;
  sound(name: string): void;
}

const cos = (deg: number) => COS_DEG[degIndex(deg)] ?? 0;
const sin = (deg: number) => SIN_DEG[degIndex(deg)] ?? 0;

/** `SpielDWeapons`: ein Tick für alle Spieler mit Schiff 2. */
export function stepDrones(w: DroneWorld, d: Drones): void {
  for (const p of w.players) {
    if (p.shipType !== 2) continue;
    for (let i = 0; i < d.list.length; i++) follow(w, d, p, i);
    if (d.aim) aim(w, p);
    if (d.orbit) orbit(w, d, p);
    specials(w, d, p);
  }
}

/** Fire-Taste `Me.X99c` (Aktion 4): gesperrt, solange Spieler 1 im Levelausflug oder Spezialablauf ist. */
function fireHeld(w: DroneWorld, p: Player): boolean {
  return (w.input(p.index)?.fire ?? false) && (w.players[0]?.exitState ?? 0) === 0;
}

/** Ziel einer Drohne: die erste folgt dem Schiff (+16, +16), jede weitere dem Verlaufsende der vorigen. */
function follow(w: DroneWorld, d: Drones, p: Player, i: number): void {
  const r = d.list[i]!;
  const prev = d.list[i - 1];
  const tx = prev ? prev.xh[TRAIL - 1]! : f32(p.x + 16);
  const ty = prev ? prev.yh[TRAIL - 1]! : f32(p.y + 16);
  let step: number;
  let target = 0;
  if (r.xh[0] === tx && r.yh[0] === ty) {
    // Ziel steht: Feld `+0x64` (nie gesetzt, 0) → mit 1° je Tick zurück auf 0°
    step = 1;
  } else {
    r.x = r.xh[TRAIL - 1]!;
    r.y = r.yh[TRAIL - 1]!;
    for (let j = TRAIL - 1; j >= 1; j--) {
      r.xh[j] = r.xh[j - 1]!;
      r.yh[j] = r.yh[j - 1]!;
    }
    r.xh[0] = tx;
    r.yh[0] = ty;
    const dy = f32(ty - r.yh[1]!);
    const dx = f32(tx - r.xh[1]!);
    target = cint(f32(winkelInGrad(dx, dy)) - 360);
    step = 10;
  }
  // Drehung zum Ziel: das Ziel nach oben an den aktuellen Winkel heranrücken, höchstens `step` je Tick
  while (Math.abs(target + 360 - r.angle) < Math.abs(target - r.angle)) target += 360;
  const dist = target - r.angle;
  let a: number;
  if (dist > 0) a = step < dist ? r.angle + step : target;
  else a = step < r.angle - target ? r.angle - step : target;
  r.angle = f32(a);
  if (r.angle <= 0) r.angle = f32(r.angle + 360);
  draw(w, r);
}

/** Glutfleck (64 × 64, normal und additiv) und Richtungsstrich (3 px, additiv) einer Drohne. */
function draw(w: DroneWorld, r: Drone): void {
  const out = w.out;
  const [x1, y1, x2, y2] = [f32(r.x - 16), f32(r.y - 16), f32(r.x + 48), f32(r.y + 48)];
  out.quad("a_kreis2", x1, y1, x2, y2, 0.2, 0.1, 0.1, 0.8, false);
  out.quad("a_kreis2", x1, y1, x2, y2, 0.2, 0.1, 0.1, 0.8, true);
  const a = cint(r.angle);
  const cx = f32(r.x + 16);
  const cy = f32(r.y + 16);
  out.line(
    cx,
    cy,
    f32(cx + cos(a) * 16),
    f32(cy + sin(a) * 16),
    3,
    [1, 1, 0.3, 0.5],
    [1, 1, 1, 0.1],
    true,
  );
}

/**
 * Zielsuche: nächste Teil-Mitte (`CLng(Sqr(dx² + dy²))` < 170, bei Gleichstand
 * das erste) um (Schiff + 64, +32); vier `Blitz` und 10 Schaden auf 2 × 2 px um
 * die Mitte.
 */
function aim(w: DroneWorld, p: Player): void {
  const rx = f32(p.x + 64);
  const ry = f32(p.y + 32);
  let best = AIM_RANGE;
  let found: [number, number] | undefined;
  for (const t of w.targets()) {
    const dx = f32(Math.trunc(t.w / 2) + t.x - rx);
    const dy = f32(Math.trunc(t.h / 2) + t.y - ry);
    const dist = cint(Math.sqrt(dx * dx + dy * dy));
    if (dist < best) {
      best = dist;
      found = [f32(dx + rx), f32(ry + dy)];
    }
  }
  if (!found) return;
  const [bx, by] = found;
  const rnd = w.rnd;
  const bolts = (sign: number) => {
    // Sinus der Doppeltick-Phase schaukelt den Startpunkt in y (`CosinusB(2 · Me.584)`)
    const c = cos(2 * w.tick);
    const y1 = f32(ry + sign * c * 5);
    const seed = cint(rnd.next() * 10000);
    w.fx.lightning(w.out, rx, y1, bx, by, 10, 4, 30, 0.7, 0, 0, false, seed);
    w.fx.lightning(w.out, rx, y1, bx, by, 5, 4, 30, 0, 0, 0, false, seed);
  };
  bolts(-1);
  bolts(1);
  w.hitEnemies(cint(bx - 1), cint(by - 1), cint(bx + 1), cint(by + 1), 10, p.index);
}

/** Zwei Kugeln auf der Bahn 60 · cos, 55 · sin um (Schiff + 32, +32), Phase 0° und 180°. */
function orbit(w: DroneWorld, d: Drones, p: Player): void {
  const frame = Math.trunc(w.tick / 3) % 10;
  for (const k of [0, 180]) {
    const x = f32(p.x + 32 + cos(k + 8 * w.tick) * 60);
    const y = f32(p.y + 32 + sin(9 * w.tick + k) * 55);
    const sx = cint(x - 16);
    const sy = cint(y - 16);
    w.out.quad(`dw1-${frame}`, sx, sy, sx + 32, sy + 32);
    w.hitEnemies(sx, sy, cint(x + 16), cint(y + 16), 20, p.index);
    const held = fireHeld(w, p);
    // erst der Wurf (5 %), dann — nur bei Treffer aller Bedingungen — die Richtung
    const chance = w.rnd.next() < 0.05;
    if (!(d.orbitFire && chance && held)) continue;
    const right = w.rnd.next() < 0.5;
    const damage = 40 * p.shotPower + 50;
    const shoot = (sx0: number, vx: number) =>
      w.layers[1].add(-2, sx0, f32(y - 8), vx, 0, 1, damage, p.index);
    if (right) {
      shoot(f32(x - 8), 9);
      shoot(x, 9);
    } else {
      shoot(f32(x - 8), -9);
      shoot(f32(x - 16), -9);
    }
  }
}

/** Sonderwaffen `k = 0…2` (D-Taste): Abklingzeit läuft, sonst feuert die gewählte (`Me.B2C`). */
function specials(w: DroneWorld, d: Drones, p: Player): void {
  for (let k = 0; k <= 2; k++) {
    if (d.reload[k]! > 0) {
      d.reload[k]!--;
      continue;
    }
    if (!(w.input(p.index)?.switchWeapon ?? false)) continue;
    if (k !== d.mode) continue;
    if (d.ammo[k]! <= 0) continue;
    const l0 = w.layers[0];
    const cx = f32(p.x + 16);
    const cy = f32(p.y + 16);
    switch (d.mode) {
      case 0: {
        // Fallrakete (Typ 12) mit zufälliger Anfangsgeschwindigkeit, Schaden 1500
        d.ammo[k]!--;
        d.reload[k] = 8;
        const r = w.rnd.next();
        l0.add(12, f32(p.x + 18), f32(p.y + 39), 0, f32(r + r + 0.5), 0, 1500, p.index);
        w.sound("rocketlaunch");
        break;
      }
      case 1:
        // zwölf Zielsuchraketen (Typ 13) im 30°-Ring (im Original unerreichbar)
        d.ammo[k]!--;
        d.reload[k] = 100;
        for (let a = 0; a <= 359; a += 30)
          l0.add(13, cx, cy, f32(cos(a) * 10), f32(sin(a) * 10), 0, 250, p.index);
        w.sound("rocketlaunch");
        w.sound("rocketlaunch");
        break;
      default:
        // 21 Typ-15-Schüsse „Debug-Drohnen“ (im Original unerreichbar, bewegen sich nie)
        d.ammo[k]!--;
        d.reload[k] = 100;
        for (let a = 0; a <= 20; a++)
          l0.add(15, cx, cy, f32(cos(a) * 10), f32(sin(a) * 10), a, 180, p.index);
        w.sound("rocketlaunch");
        w.sound("rocketlaunch");
    }
  }
}

/**
 * `SpielSchieß` (`0x4E3D0F`), Schiff 2 bei gehaltenem Feuer: jede Drohne
 * feuert alle 8 Ticks (Pause 7) in ihre Blickrichtung einen Schuss vom Typ 0,
 * Tempo 9, Ebene 1, Schaden `20 · Stufe + 50`, ab Mitte + 8.
 */
export function fireDrones(layers: readonly [ShotLayer, ShotLayer], d: Drones, p: Player): void {
  for (const r of d.list) {
    if (r.cooldown > 0) {
      r.cooldown--;
      continue;
    }
    r.cooldown = 7;
    const a = cint(r.angle);
    layers[1].add(
      0,
      f32(r.x + 8),
      f32(r.y + 8),
      f32(cos(a) * 9),
      f32(sin(a) * 9),
      1,
      20 * p.shotPower + 50,
      p.index,
    );
  }
}
