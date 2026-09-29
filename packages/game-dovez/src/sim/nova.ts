import type { DrawList, Effects } from "./effects";
import { DeathState, type Enemies, type Enemy } from "./enemies";
import type { EnemyShot } from "./enemyFire";
import type { Player, PlayerInput } from "./player";
import { COS_DEG, PI, SIN_DEG, cint, degIndex, f32, idiv, vbInt, type VbRnd } from "./vb";
import type { Force, Particle } from "./weapons";

/**
 * Super-Nova `SpielNova` (`0x52A230`), jeden Tick nach `SpielBeam`: Auslösen
 * mit der Nova-Taste (Schiff 0 verbraucht den gewählten Partikel, Schiff 1
 * die Force), dann eine von zehn Varianten mit Zähler `Me.1098`. Während der
 * Nova (`Me.D6C`, `World.nova`) ruhen Zeitleiste, Ebenen, Steuerung,
 * Schüsse, Emitter, Gegnerschüsse, Wetter und Kontakt (elf Prüfungen in
 * `SpielLoop`, siehe `World.step`). Gegner stehen in Zustand 0
 * (eingefroren) bzw. −1 (nova-immun, unsichtbar); jeder Nova-Treffer zieht
 * 10000 von der Gesamt-HP ab. Befund: `docs/measurements/dovez-runtime.md`
 * („Super-Nova“).
 *
 * Bildeffekte, die im Original den Backbuffer auf sich selbst blitten
 * (Varianten 3 und 4), legt der Port als Blit-Listen in `NovaState.blits`
 * ab; der Renderer spielt sie als Kopie des Spielfelds ab. Die `Rnd`-Züge
 * dafür laufen immer.
 */

/** Zustand von `SpielNova` über die Ticks (`Me.D70…10AC` und die Statics `G.684…6AC`). */
export interface NovaState {
  /** Tasten-Riegel für alle Spieler gemeinsam (`G.684`). */
  latch: boolean;
  /** Zähler `C` (`Me.1098`): −1 im Auslöse-Tick, Ende, wenn er nach `C − 1` −1 wird. */
  counter: number;
  /** Variante (`Me.109C`). */
  variant: number;
  /** Verbrauchter Partikel (`Me.10A0`), −1 beim D-Phyton. */
  particle: number;
  /** Gesicherter Hintergrund (`Me.10A4`) und Spielerposition beim Auslösen (`Me.10A8/10AC`). */
  savedBackground: number;
  savedX: number;
  savedY: number;
  /** Auslösender Spieler (`G.6AC`). */
  player: number;
  /** Verzögerung je Gegnerslot (`Me.D70[101]`). */
  readonly delays: Float32Array;
  /**
   * Gemeinsamer Arbeitsbereich `Me.F04…1094` (101 Singles): [0]/[1]/[2] =
   * `F04/F08/F0C`, Variante 2 sechs Arrays à 15 ab [0] und Phasen ab [91],
   * Variante 7 Winkel [0…25], „Else“ je Gegner [j].
   */
  readonly work: Float32Array;
  /** Arbeits-x/y (`G.688`/`G.68C`, Single) und Hilfsgrößen `G.698`, `G.6A0` (Long). */
  gx: number;
  gy: number;
  g698: number;
  g6A0: number;
  /** Nova-Taste des letzten Spielers dieses Ticks (`[ebp−0xE0]`, Variante 8). */
  keyHeld: boolean;
  /**
   * Bildbruch dieses Ticks (`BltFast` des Backbuffers auf sich selbst):
   * erst senkrechte, dann waagerechte Streifen, je sechs Zahlen
   * `dx, dy, sx, sy, w, h`.
   */
  readonly blits: [number[], number[]];
}

export const newNovaState = (): NovaState => ({
  latch: false,
  counter: 0,
  variant: 0,
  particle: -1,
  savedBackground: 0,
  savedX: 0,
  savedY: 0,
  player: 0,
  delays: new Float32Array(101),
  work: new Float32Array(101),
  gx: 0,
  gy: 0,
  g698: 0,
  g6A0: 0,
  keyHeld: false,
  blits: [[], []],
});

/** Was die Nova von der Welt braucht. */
export interface NovaWorld {
  readonly rnd: VbRnd;
  readonly fx: Effects;
  /** Zeichenliste der Nova (nach dem Beam). */
  readonly out: DrawList;
  readonly players: readonly Player[];
  readonly playersMinus1: number;
  readonly inputs: readonly (PlayerInput | undefined)[];
  readonly particles: readonly Particle[];
  readonly force: Force;
  readonly enemies: Enemies;
  readonly shots: readonly EnemyShot[];
  /** Overlays A (`Me.508`) und B (`Me.506`) von `OverlayEffekte`. */
  readonly overlays: { a: boolean; b: boolean };
  /** `Me.D6C` lesen/setzen (mitten im Tick). */
  running(): boolean;
  setRunning(on: boolean): void;
  /** Hintergrund `Me.7CC` lesen/setzen. */
  background(v?: number): number;
  /** `NextPartikel(p)` (mit Ton `press_d`). */
  nextParticle(p: Player): void;
  addPoints(points: number, x: number, y: number, vy: number, player: number): void;
  /** Abschusszähler `B48[0].54`. */
  addKill(): void;
  sound(name: string): void;
  /** `SpielSoundOFF`. */
  soundOff(): void;
  /** `Blenden` (`0x4A9FA0`): Standbild erfassen und ausblenden (`OverlayEffekte`). */
  noFlash(): void;
}

/** Nova-Treffer: pauschal auf die Gesamt-HP (`E.C`), die Teile bleiben. */
const NOVA_DAMAGE = 10000;
/** Rechter Rand der Hitbox (`A.6C`), für alle Schiffstypen 64. */
const HIT_RIGHT = 64;

/** Ein Tick `SpielNova`. */
export function stepNova(w: NovaWorld, st: NovaState): void {
  st.blits[0].length = 0;
  st.blits[1].length = 0;
  trigger(w, st);
  if (!w.running()) return;
  switch (st.variant) {
    case -1:
      scatter(w, st);
      break;
    case 0:
      ring(w, st);
      break;
    case 1:
      lightnings(w, st);
      break;
    case 2:
      fireSnakes(w, st);
      break;
    case 3:
      screenBreak(w, st);
      break;
    case 4:
      sparkRain(w, st);
      break;
    case 6:
      forceHunt(w, st);
      break;
    case 7:
      blackSun(w, st);
      break;
    case 8:
      flyThrough(w, st);
      break;
    default:
      homingShots(w, st);
  }
  // Schwanz (0x52C779)
  st.counter--;
  if (st.counter > -1) return;
  w.setRunning(false);
  w.background(st.savedBackground);
  const en = w.enemies;
  for (let j = 0; j <= en.high; j++) {
    const e = en.items[j];
    if (!e?.alive) continue;
    e.inState = false;
    e.deathState = 0;
  }
}

// --- Auslösen ---------------------------------------------------------------

/** §4: Taste, Riegel, Voraussetzungen, Verbrauch, Gegnerschüsse weg, Töne. */
function trigger(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  for (let i = 0; i <= w.playersMinus1; i++) {
    const p = w.players[i];
    // Sperre `B48[0].5C` (Levelausflug, Spezialabläufe): immer Spieler 1
    const pressed = (w.inputs[i]?.nova ?? false) && (w.players[0]?.exitState ?? 0) === 0;
    st.keyHeld = pressed;
    if (!pressed) {
      st.latch = false;
      continue;
    }
    if (st.latch || !p) continue;
    const t = p.shipType;
    if (t <= 0 && p.selected <= -1) continue;
    if (t === 1 && !w.force.present) continue;
    if (w.running()) continue;
    if (!p.alive) continue;
    // Boss-Finale: auch tote Slots bis `hi` zählen (E8/E4 bleiben stehen)
    for (let j = 0; j <= en.high; j++) {
      const e = en.items[j];
      if (e?.inState && e.deathState === DeathState.boss) return;
    }
    st.latch = true;
    w.setRunning(true);
    if (t === 0) {
      const s = p.selected;
      const r = w.particles[s]!;
      st.particle = s;
      st.variant = r.kind;
      if (r.kind === 0) {
        r.present = false;
        r.kind = 0;
        w.nextParticle(p);
      } else r.kind = 0;
    } else if (t === 1) {
      w.force.present = false;
      st.particle = -1;
      st.variant = cint(vbInt(w.rnd.next() * 3) + 6);
    }
    st.player = i;
    st.counter = -1;
    st.savedBackground = w.background();
    st.savedX = p.x;
    st.savedY = p.y;
    w.background(0);
    for (const s of w.shots) s.active = false;
    // Musik auf 1/10 übernimmt der Ton über `World.nova`
    w.soundOff();
    w.sound("nova");
    w.sound("novaschuss");
  }
}

// --- gemeinsame Bausteine -----------------------------------------------------

/** `elig(j)`: nicht nova-immun und aktiv. */
function elig(e: Enemy | undefined): e is Enemy {
  return e !== undefined && e.alive && e.def.novaImmune === 0;
}

/** Alle Slots bis `hi` in die Zustandsmaschine: wählbare eingefroren (0), die übrigen versteckt (−1). */
function freeze(w: NovaWorld): void {
  const en = w.enemies;
  const hi = en.high;
  for (let j = 0; j <= hi; j++) setFrozen(en.items[j]);
}

function setFrozen(e: Enemy | undefined): boolean {
  if (!e) return false;
  const ok = elig(e);
  e.inState = true;
  e.deathState = ok ? DeathState.frozen : DeathState.hidden;
  return ok;
}

function size(w: NovaWorld, e: Enemy): { bw: number; bh: number } {
  const { w: bw, h: bh } = w.enemies.box(e.def);
  return { bw, bh };
}

/** `Box(j)`: (E.64, E.68)–(E.64 + E.14, E.68 + E.18). */
function explodeBox(w: NovaWorld, e: Enemy): void {
  const { bw, bh } = size(w, e);
  const x = e.actor.x;
  const y = e.actor.y;
  w.fx.addExplosion(x, y, f32(x + bw), f32(y + bh));
  w.addKill();
}

/** `Mitte(j)`: `f32((E.14 \ 2) + E.64)`, `f32((E.18 \ 2) + E.68)`. */
function mid(w: NovaWorld, e: Enemy): [number, number] {
  const { bw, bh } = size(w, e);
  return [f32(idiv(bw, 2) + e.actor.x), f32(idiv(bh, 2) + e.actor.y)];
}

function points(w: NovaWorld, st: NovaState, e: Enemy): void {
  const [cx, cy] = mid(w, e);
  w.addPoints(e.score, cx, cy, -1, st.player);
}

function hit(e: Enemy): void {
  e.actor.hp = f32(e.actor.hp - NOVA_DAMAGE);
}

/** Tod über die Zeit (Varianten 0, 3): Explosion, Punkte, `KillEnemy`, Ton nach Punkten. */
function hitTimed(w: NovaWorld, st: NovaState, j: number, e: Enemy): void {
  hit(e);
  if (e.actor.hp > 0) return;
  explodeBox(w, e);
  points(w, st, e);
  w.enemies.kill(j);
  w.sound(e.score > 1499 ? "explosion2" : "explosion1");
}

/** `KillAll36`: alle wählbaren getroffen, Explosion auch für Überlebende. */
function killAll(w: NovaWorld, st: NovaState, sound: boolean): void {
  const en = w.enemies;
  const hi = en.high;
  for (let j = 0; j <= hi; j++) {
    const e = en.items[j];
    if (!elig(e)) continue;
    hit(e);
    explodeBox(w, e);
    if (e.actor.hp <= 0) {
      points(w, st, e);
      en.kill(j);
    }
    if (sound) w.sound("explosion2");
  }
}

function particle(w: NovaWorld, st: NovaState): { x: number; y: number } {
  return w.particles[st.particle] ?? { x: 0, y: 0 };
}

/** Zwei Glutkreise am verbrauchten Partikel. */
function aura(w: NovaWorld, st: NovaState, r: number, g: number, b: number, delay: number): void {
  const s = particle(w, st);
  w.fx.addBig(s.x + 8, s.y + 8, 0, 0, r, g, b, 16, delay, 10, 1, 0);
  w.fx.addBig(s.x, s.y, 0, 0, r, g, b, 32, 10, 10, 2, 2);
}

function explosion2x2(w: NovaWorld, st: NovaState): void {
  if (st.counter !== 31) return;
  w.sound("explosion2");
  w.sound("explosion2");
}

function blend(w: NovaWorld, st: NovaState): void {
  if (st.counter !== 1) return;
  w.noFlash();
}

/** Nächster wählbarer Slot ab `F04` (`Do While F04 <= hi …`). */
function seekTarget(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  while (st.work[0]! <= en.high) {
    if (elig(en.items[cint(st.work[0]!)])) return;
    st.work[0] = f32(st.work[0]! + 1);
  }
}

function shipKey(p: Player): string {
  return `dove${p.shipType}${p.tilt + 1}${p.animFrame + 1}`;
}

/** `SchiffNeu(po)`: das Schiff des Auslösers über den Bildbruch. */
function shipOnTop(w: NovaWorld, st: NovaState): void {
  const p = w.players[st.player];
  if (p) w.out.quad(shipKey(p), p.x, p.y, p.x + 64, p.y + 64);
}

/**
 * §5.5a Verzerrung: senkrechte Streifen 10–14 px breit, ±5 px versetzt
 * (bei d ≥ 0 mit vertauschten Zielkoordinaten und dem waagerechten Versatz
 * des vorigen Ticks, sic), dann waagerechte Streifen ±10 px. `BltFast` mit
 * Ziel außerhalb des 800 × 600-Backbuffers schlägt fehl (kein Blit).
 */
function distort(w: NovaWorld, st: NovaState): void {
  const rnd = w.rnd;
  let x = 0;
  do {
    const sw = 800 - x <= 15 ? 800 - x : cint(rnd.next() * 5) + 10;
    const d = f32(cint(rnd.next() * 11) - 5);
    st.gy = d;
    if (d < 0) blit(st.blits[0], x, 0, x, -d, sw, 550 + d);
    else if (st.gx > 0) blit(st.blits[0], cint(st.gx), x, x, d, sw, 550 - 2 * d);
    x += sw;
  } while (x !== 800);
  let y = 0;
  do {
    const sh = 550 - y <= 15 ? 550 - y : cint(rnd.next() * 5) + 10;
    const d = f32(cint(rnd.next() * 21) - 10);
    st.gx = d;
    if (d < 0) blit(st.blits[1], 0, y, -d, y, 800 + d, 10);
    else if (d > 0) blit(st.blits[1], d, y, 0, y, 800 - d, 10);
    y += sh;
  } while (y !== 550);
}

function blit(
  out: number[],
  dx: number,
  dy: number,
  sx: number,
  sy: number,
  bw: number,
  bh: number,
): void {
  if (bw <= 0 || bh <= 0 || dx < 0 || dy < 0 || dx + bw > 800 || dy + bh > 600) return;
  out.push(dx, dy, sx, sy, bw, bh);
}

// --- Varianten ----------------------------------------------------------------

/** §5.1 Variante −1 „Streuung“ (Schild): 21 Striche vom Schiff, Kills bei C = 36. */
function scatter(w: NovaWorld, st: NovaState): void {
  const rnd = w.rnd;
  w.overlays.b = true;
  if (st.counter === -1) {
    st.counter = 70;
    freeze(w);
    aura(w, st, 0.5, 0.5, 1, st.counter - 10);
    const p = w.players[st.player]!;
    for (let k = 0; k <= 20; k++) {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      const r4 = rnd.next();
      w.fx.addBig(p.x, p.y, 0, 0, r1, r2, r3, 64, 30, 10, 5, cint(r4 * 360));
    }
  }
  if (st.counter === 36) {
    if (w.enemies.high === -1) st.counter = 20;
    killAll(w, st, false);
  }
  explosion2x2(w, st);
  if (st.counter === 0) w.overlays.b = false;
}

/** §5.2 Variante 0 „Ring“ (leerer Partikel): Welle mit 4 px je Tick vom Partikel aus. */
function ring(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  const s = particle(w, st);
  const W = st.work;
  w.fx.shake = 1;
  if (st.counter === -1) {
    st.counter = 100;
    W[0] = 1;
    W[1] = 0;
    const hi = en.high;
    for (let j = 0; j <= hi; j++) {
      const e = en.items[j];
      if (!setFrozen(e)) continue;
      const { bw, bh } = size(w, e!);
      st.gx = f32(s.x + 16 - (idiv(bw, 2) + e!.actor.x));
      st.gy = f32(s.y + 16 - (idiv(bh, 2) + e!.actor.y));
      st.delays[j] = idiv(Math.sqrt(st.gx * st.gx + st.gy * st.gy), 4) + 10;
      if (st.delays[j]! + 10 > st.counter) st.counter = cint(st.delays[j]! + 10);
    }
    aura(w, st, 0.5, 0.5, 1, 10);
  }
  st.gx = f32(s.x + 16);
  st.gy = f32(s.y + 16);
  W[0] = f32(W[0]! + 4);
  W[1] = f32(W[1]! + 2);
  const r = W[0]!;
  w.out.quad("a_kreis2", st.gx - r, st.gy - r, st.gx + r, st.gy + r, 1, 0, 0, 0.7);
  for (let k = 0; k <= 359; k += 30) {
    const r1 = w.rnd.next();
    const r2 = w.rnd.next();
    const r3 = w.rnd.next();
    const a = degIndex(cint(k + W[1]!));
    const x = st.gx + (COS_DEG[a] ?? 0) * r;
    const y = st.gy + (SIN_DEG[a] ?? 0) * r;
    const h = Math.trunc(cint(r) / 2);
    w.out.quad("a_kreis2", x - h, y - h, x + h, y + h, r1, r2, r3, 0.7, true);
  }
  const hi = en.high;
  for (let j = 0; j <= hi; j++) {
    st.delays[j] = f32(st.delays[j]! - 1);
    const e = en.items[j];
    if (st.delays[j] === 0 && elig(e)) hitTimed(w, st, j, e);
  }
  blend(w, st);
}

/** §5.3 Variante 1 „Blitze“: zwei Vollbild-Blitze je Tick, ein wandernder bis C = 41. */
function lightnings(w: NovaWorld, st: NovaState): void {
  const rnd = w.rnd;
  const W = st.work;
  if (st.counter === -1) {
    st.counter = 200;
    freeze(w);
    aura(w, st, 0.5, 0.5, 1, st.counter - 10);
    st.gx = f32(rnd.next() * 800);
    st.gy = f32(rnd.next() * 550);
  }
  const r1 = rnd.next();
  const r2 = rnd.next();
  w.fx.lightning(w.out, f32(r1 * 800), 0, f32(r2 * 800), 550, 20, 20, 20, 0.6, 0.6, 1, true);
  const r3 = rnd.next();
  const r4 = rnd.next();
  w.fx.lightning(w.out, 0, f32(r3 * 550), 800, f32(r4 * 550), 20, 15, 20, 0.6, 0.6, 1, true);
  w.fx.shake = 1;
  if (st.counter > 40) {
    if (st.counter % 10 === 0) {
      W[0] = st.gx;
      W[1] = st.gy;
      st.gx = f32(rnd.next() * 800);
      st.gy = f32(rnd.next() * 550);
      w.fx.addBig(st.gx - 5, st.gy - 5, 0, 0, 0.5, 0.5, 1, 10, 0, 50, 1, 10);
    }
    w.fx.lightning(w.out, W[0]!, W[1]!, st.gx, st.gy, 5, 10, 10, 0.4, 0.6, 1, true);
  }
  if (st.counter === 36) {
    w.fx.shake = 5;
    killAll(w, st, false);
  }
  explosion2x2(w, st);
}

/** Phasenschritte der Variante 2 (`Me.1070…108C`). */
const SNAKE_STEPS = [0.1, 0.02, 0.05, 0.12, 0.11, 0.13, 0.21, 0.03] as const;
const PH = 91;

/** §5.4 Variante 2 „Feuerschlangen“: drei Lissajous-Schlangen um den Partikel, Funken an allen Gegnern. */
function fireSnakes(w: NovaWorld, st: NovaState): void {
  const W = st.work;
  const s = particle(w, st);
  const en = w.enemies;
  if (st.counter === -1) {
    st.counter = 227;
    freeze(w);
    const X = s.x + 32;
    const Y = s.y + 32;
    for (let k = 0; k <= 14; k++) for (let n = 0; n < 6; n++) W[15 * n + k] = n % 2 === 0 ? X : Y;
    for (let n = 0; n < 8; n++) W[PH + n] = 0;
    aura(w, st, 1, 0.3, 0.2, st.counter - 10);
  }
  for (st.g6A0 = 0; st.g6A0 <= 1; st.g6A0++) {
    for (let k = 0; k <= 14; k++) for (let n = 0; n < 6; n++) W[15 * n + k] = W[15 * n + k + 1]!;
    for (let n = 0; n < 8; n++) W[PH + n] = f32(W[PH + n]! + SNAKE_STEPS[n]!);
    const ph = (n: number) => W[PH + n]!;
    const X = s.x + 32;
    const Y = s.y + 32;
    W[14] = f32(X + Math.sin(ph(1)) * Math.cos(ph(0)) * 700);
    W[29] = f32(Y + Math.sin(ph(3)) * Math.cos(ph(2)) * 400);
    W[44] = f32(X - Math.sin(ph(5)) * Math.cos(ph(4)) * 700);
    W[59] = f32(Y - Math.sin(ph(7)) * Math.cos(ph(6)) * 400);
    W[74] = f32(X + Math.sin(ph(2)) * Math.cos(ph(0)) * 700);
    W[89] = f32(Y + Math.sin(ph(6)) * Math.cos(ph(4)) * 400);
  }
  for (let k = 0; k <= 13; k++) {
    const a1 = f32(k / 14);
    const a2 = f32((k + 1) / 14);
    for (let n = 0; n < 6; n += 2) {
      const u = 15 * n;
      const v = 15 * (n + 1);
      w.out.line(
        W[u + k]!,
        W[v + k]!,
        W[u + k + 1]!,
        W[v + k + 1]!,
        12,
        [0.8, 0.4, 0.2, a1],
        [0.8, 0.4, 0.2, a2],
        true,
      );
    }
  }
  const glow = (r: number, g: number, b: number) => {
    const r1 = w.rnd.next();
    const r2 = w.rnd.next();
    w.fx.addBig(r1 * 800, r2 * 550, -18, -7, r, g, b, 2, 0, 15, 1, 4);
  };
  glow(1, 0.6, 0.4);
  glow(0.8, 0.4, 0.2);
  glow(0.8, 0.4, 0.2);
  w.fx.shake = 1;
  const hi = en.high;
  for (let j = 0; j <= hi; j++) {
    const e = en.items[j];
    if (!elig(e)) continue;
    const { bw, bh } = size(w, e);
    const x = e.actor.x;
    const y = e.actor.y;
    w.fx.addSparks(1, 1, cint(x), cint(y), cint(x + bw), cint(y + bh), false);
  }
  blend(w, st);
  if (st.counter === 36) {
    w.fx.shake = 5;
    killAll(w, st, false);
  }
  explosion2x2(w, st);
}

/** §5.5 Variante 3 „Bildbruch“: Hintergrund −1, Gegner sterben nacheinander alle 5 Ticks. */
function screenBreak(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  w.overlays.b = true;
  if (st.counter === -1) {
    w.background(-1);
    st.work[0] = 0;
    st.counter = 50;
    let n = 0;
    const hi = en.high;
    for (let j = 0; j <= hi; j++) {
      const e = en.items[j];
      if (setFrozen(e)) {
        st.delays[j] = (n + 10) * 5;
        n++;
        st.counter = cint(st.delays[j]! + 50);
      } else st.delays[j] = 0;
    }
    aura(w, st, 0.5, 0.5, 1, st.counter - 10);
    w.fx.addBig(400, 275, 0, 0, 1, 1, 1, 0, 0, st.counter - 50, 2, 2);
  }
  distort(w, st);
  shipOnTop(w, st);
  const hi = en.high;
  for (let j = 0; j <= hi; j++) {
    st.delays[j] = f32(st.delays[j]! - 1);
    const e = en.items[j];
    if (st.delays[j] === 0 && elig(e)) hitTimed(w, st, j, e);
  }
  blend(w, st);
  if (st.counter === 0) w.overlays.b = false;
}

/** §5.6 Variante 4 „Funkenregen + Bildbruch“: bis C = 81 Striche aus allen Gegnern, Kills bei C = 36. */
function sparkRain(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  const rnd = w.rnd;
  w.overlays.b = true;
  if (st.counter === -1) {
    st.counter = 200;
    freeze(w);
    aura(w, st, 0.5, 0.5, 1, st.counter - 10);
    const s = particle(w, st);
    w.fx.addBig(s.x, s.y, 0, 0, 0.5, 0.5, 1, 32, 0, 150, 2, 10);
  }
  if (st.counter > 80) {
    const hi = en.high;
    for (let j = 0; j <= hi; j++) {
      const e = en.items[j];
      if (!elig(e)) continue;
      const [cx, cy] = mid(w, e);
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      const r4 = rnd.next();
      w.fx.addBig(
        cx,
        cy,
        f32(r1 * 10 - 5),
        f32(r2 * 10 - 5),
        1,
        1,
        0.2,
        10,
        0,
        cint(r3 * 10 + 20),
        5,
        f32(r4 * 360),
      );
    }
    distort(w, st);
    shipOnTop(w, st);
  }
  if (st.counter === 36) {
    w.fx.shake = 5;
    killAll(w, st, false);
  }
  explosion2x2(w, st);
  blend(w, st);
  if (st.counter === 0) w.overlays.b = false;
}

/** Glut der Force-Kugel (Stufe 0 → Farbe 1,3/0,2/0,3). */
function forceGlow(w: NovaWorld, x: number, y: number): void {
  w.fx.addBig(x + 32, y + 32, 0, 0, 1.3, 0.2, 0.3, 64, 10, 20, 5, 0);
  w.fx.addBig(x, y, 0, 0, 1.3, 0.2, 0.3, 64, 10, 20, 16, 5);
}

/** §5.7 Variante 6 „Force-Jagd“ (D-Phyton): die Kugel fliegt in 15 Ticks jedes Ziel an. */
function forceHunt(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  const f = w.force;
  const W = st.work;
  if (st.counter === -1) {
    const hi = en.high;
    for (let j = 0; j <= hi; j++) if (setFrozen(en.items[j])) st.counter += 15;
    st.counter += 1000;
    W[0] = 0;
    W[1] = 0;
    W[2] = 1;
    seekTarget(w, st);
    f.level = 0;
    if (W[0]! > en.high) {
      w.fx.addFireballs(f.x, f.y, f.x + 64, f.y + 64, 1, 0.2, 0.3, 32, 5, 15);
      forceGlow(w, f.x, f.y);
      st.counter = 30;
    }
  }
  if (!(W[0]! > en.high || W[0]! < 0)) {
    const t = cint(W[0]!);
    const e = en.items[t]!;
    st.g698 = t;
    [st.gx, st.gy] = mid(w, e);
    f.x = f32(f.x - 32 + (st.gx - f.x) / (15 - W[1]!));
    f.y = f32(f.y - 32 + (st.gy - f.y) / (15 - W[1]!));
    w.fx.addBig(f.x, f.y, 0, 0, 1.3, 0.2, 0.3, 64, 10, 5, 1, 1);
    w.fx.addBig(f.x + 4, f.y + 4, 0, 0, 1, 1, 1, 56, 2, 10, 16, 1);
    W[1] = f32(W[1]! + 1);
    if (W[1] === 15) {
      forceGlow(w, f.x, f.y);
      hit(e);
      if (e.actor.hp <= 0) {
        e.deathState = DeathState.split;
        e.stateTimer = 0;
        points(w, st, e);
      } else explodeBox(w, e);
      w.sound("explosion2");
      W[1] = 0;
      W[0] = f32(W[0]! + 1);
      seekTarget(w, st);
      if (W[0]! > en.high) {
        w.fx.addBig(f.x, f.y, 0, 0, 1.3, 0.2, 0.3, 64, 0, 30, 2, 20);
        st.counter = 40;
      }
    }
  }
  blend(w, st);
}

/** Farbe aus sechs `Rnd`: (q1, q2, q3, 1) → (q4, q5, q6, 1). */
function rndColors(
  rnd: VbRnd,
): [readonly [number, number, number, number], readonly [number, number, number, number]] {
  const q = [rnd.next(), rnd.next(), rnd.next(), rnd.next(), rnd.next(), rnd.next()];
  return [
    [q[0]!, q[1]!, q[2]!, 1],
    [q[3]!, q[4]!, q[5]!, 1],
  ];
}

/** §5.8 Variante 7 „Schwarze Sonne“ (D-Phyton): Hintergrund −2, wachsende schwarze Scheibe, Kills bei C = 70. */
function blackSun(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  const rnd = w.rnd;
  const W = st.work;
  const out = w.out;
  if (st.counter === -1) {
    w.background(-2);
    W[0] = 0;
    st.counter = 250;
    const hi = en.high;
    for (let j = 0; j <= hi; j++) if (!setFrozen(en.items[j])) st.delays[j] = 0;
    for (let k = 0; k <= 20; k++) W[k] = f32(rnd.next() * PI * 2);
    st.gx = f32(w.force.x + 32);
    st.gy = f32(w.force.y + 32);
  }
  const C = st.counter;
  const [gx, gy] = [st.gx, st.gy];
  w.fx.shake++;
  st.g698 = 250 - C;
  const black = [0, 0, 0, 1] as const;
  if (C < 70) {
    st.g698 = (st.g698 + 56) * 5 - 1000;
    w.overlays.b = true;
    w.overlays.a = true;
    st.g6A0 = Math.trunc((250 - C) / 10);
    // k > 20 liest hinter die 21 Winkel (Altwerte des Arbeitsbereichs)
    for (let k = 1; k <= st.g6A0; k++) {
      const a = W[k]!;
      out.line(
        gx,
        gy,
        gx + Math.sin(a) * 900,
        gy + Math.cos(a) * 700,
        f32(st.g6A0 + 10),
        black,
        black,
      );
    }
  } else {
    const y = cint(rnd.next() * 550);
    const [c1, c2] = rndColors(rnd);
    out.line(0, y, 800, y, 3, c1, c2);
    const x = cint(rnd.next() * 800);
    const [c3, c4] = rndColors(rnd);
    out.line(x, 0, x, 550, 3, c3, c4);
    const a = vbInt(rnd.next() * 360);
    const [c5, c6] = rndColors(rnd);
    // Strahlbreite aus `G.6A0` der letzten Nova (sic)
    out.line(
      gx,
      gy,
      gx + Math.sin(a) * 900,
      gy + Math.cos(a) * 700,
      f32(st.g6A0 + 10),
      c5,
      c6,
      true,
    );
    const p1 = rnd.next();
    const p2 = rnd.next();
    const p3 = rnd.next();
    const p4 = rnd.next();
    w.fx.addBig(
      gx - 5,
      gy - 5,
      f32(p1 * 18 - 9),
      f32(p2 * 18 - 9),
      0,
      0,
      0,
      10,
      cint(p3 * 10 + 10),
      cint(p4 * 20 + 60),
      1,
      0,
    );
  }
  const r = st.g698;
  for (let n = 0; n < 2; n++) out.quad("a_kreis2", gx - r, gy - r, gx + r, gy + r, 0, 0, 0, 1);
  if (C === 70) {
    w.fx.shake = 5;
    const big = w.fx.big;
    for (const b of big.items) b.active = false;
    big.hint = 0;
    big.high = -1;
    killAll(w, st, true);
  }
  blend(w, st);
  if (C === 0) {
    w.overlays.b = false;
    w.overlays.a = false;
  }
}

/** §5.8 Variante 8 „Durchflug“ (D-Phyton): das Schiff rast durch jedes Ziel und kehrt zurück. */
function flyThrough(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  const f = w.force;
  const W = st.work;
  const p = w.players[st.player]!;
  if (st.counter === -1) {
    const hi = en.high;
    for (let j = 0; j <= hi; j++) if (setFrozen(en.items[j])) st.counter += 8;
    st.counter += 10000;
    W[0] = -1;
    W[1] = 0;
    W[2] = 1;
    w.fx.addFireballs(f.x, f.y, f.x + 64, f.y + 64, 1, 0.2, 0.3, 32, 5, 15);
  }
  if (W[0]! > en.high) {
    // Rückflug: Kosinus-Tabelle direkt (CLng(C · 4,5) ≤ 94)
    p.x = f32((COS_DEG[cint(st.counter * 4.5)] ?? 0) * (st.savedX + HIT_RIGHT) - HIT_RIGHT);
    p.y = st.savedY;
  } else if (W[0]! < 0) {
    if (W[0] === -1) {
      p.x = f32(p.x + W[2]!);
      W[2] = f32(W[2]! * 2);
      if (p.x > 800) {
        W[0] = 0;
        W[1] = 0;
        seekTarget(w, st);
        if (W[0]! > en.high) st.counter = 21;
      }
    }
  } else {
    const t = cint(W[0]!);
    const e = en.items[t]!;
    st.g698 = t;
    [st.gx, st.gy] = mid(w, e);
    p.y = f32(st.gy - 32);
    W[1] = f32(W[1]! + 1);
    p.x = f32(W[1]! * 100);
    if (p.x >= st.gx && e.deathState === DeathState.frozen) {
      hit(e);
      if (e.actor.hp <= 0) {
        e.deathState = DeathState.split;
        e.stateTimer = 0;
        points(w, st, e);
      } else explodeBox(w, e);
      w.sound("explosion2");
    }
    const r = w.rnd.next();
    p.x = f32(p.x - r * 50);
    const x0 = (W[1]! - 1) * 100;
    const key = shipKey(p);
    for (let k = 0; k <= 10; k++) {
      w.fx.addBig(x0 + k * 10, f32(p.y + k / 2), -2, 0, 0.3, 0.7, 1, 64 - k, 0, 10 - k, 3, 32);
      // additiv genau dann, wenn die Nova-Taste des letzten Spielers gehalten wird (sic)
      const x = x0 + k * 10;
      w.out.quad(key, x, p.y, x + 64, p.y + 64, 1, 1, 1, k * 0.1, st.keyHeld);
    }
    if (W[1] === 9) {
      W[1] = 0;
      W[0] = f32(W[0]! + 1);
      seekTarget(w, st);
      if (W[0]! > en.high) st.counter = 21;
    }
  }
  blend(w, st);
}

/** §5.10 „Else“ (Varianten 5, ≥ 9): Zielsuch-Schüsse aus dem Partikel, Treffer → Zustand 2. */
function homingShots(w: NovaWorld, st: NovaState): void {
  const en = w.enemies;
  const W = st.work;
  const D = st.delays;
  const dist = () => idiv(Math.sqrt(st.gx * st.gx + st.gy * st.gy), 8);
  if (st.counter === -1) {
    const hi = en.high;
    for (let j = 0; j <= hi; j++) {
      const e = en.items[j];
      if (setFrozen(e)) {
        [st.gx, st.gy] = mid(w, e!);
        D[j] = 2 * j + 5;
        W[j] = -1;
        // Abstand zur Bildschirmecke (0, 0), nicht zum Partikel (sic)
        const d = dist();
        if (st.counter - 50 < d + D[j]!) st.counter = cint(d + D[j]! + 50);
      } else D[j] = -1;
    }
    if (st.counter === -1) st.counter = 50;
    aura(w, st, 0.5, 0.5, 1, st.counter - 10);
  }
  const hi = en.high;
  for (let j = 0; j <= hi; j++) {
    const e = en.items[j];
    if (!elig(e)) continue;
    [st.gx, st.gy] = mid(w, e);
    const { gx, gy } = st;
    D[j] = f32(D[j]! - 1);
    if (D[j]! < 0) {
      if (W[j] === -1) {
        D[j] = dist();
        W[j] = D[j]!;
        w.sound("novaschuss");
      }
    } else if (W[j] === -1) {
      if (D[j]! <= 10)
        w.out.quad(
          "fadenkreuz",
          cint(gx - 64),
          cint(gy - 64),
          cint(gx + 64),
          cint(gy + 64),
          1,
          1,
          1,
          0.7,
          false,
          cint(D[j]! * 3),
        );
    } else if (D[j] === 0) {
      hit(e);
      if (e.actor.hp <= 0) {
        e.deathState = DeathState.nova;
        e.stateTimer = 0;
        points(w, st, e);
      } else explodeBox(w, e);
      w.sound("explosion2");
    } else {
      w.out.quad(
        "fadenkreuz",
        cint(gx - 64),
        cint(gy - 64),
        cint(gx + 64),
        cint(gy + 64),
        1,
        1,
        1,
        0.5,
      );
      const c = COS_DEG[degIndex(cint((D[j]! / W[j]!) * 90))] ?? 0;
      const s = particle(w, st);
      const X = s.x + 32;
      const Y = s.y + 32;
      w.fx.addBig(
        f32((gx - X) * c + X - 5),
        f32((gy - Y) * c + Y - 5),
        0,
        0,
        1,
        1,
        1,
        10,
        0,
        10,
        1,
        0,
      );
    }
  }
}
