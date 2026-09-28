import type { DovezGroup } from "@clove/formats";
import { doAni } from "./doAni";
import type { Surface } from "./surfaces";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, vbInt, winkelInGrad, type VbRnd } from "./vb";

/**
 * Sichtbare Effekte ohne Spielwirkung: kleine Partikel (`Me.C30`, Funken),
 * große Partikel (`Me.C8C`: Glut, Rauch, Feuerbälle, Ringe, Blitze,
 * Trümmer), Punkte-Popups (`Me.D34`), Blasen (`Me.D58`) und das
 * Bildschirmwackeln (`Me.7D0`). Befund: `docs/measurements/dovez-runtime.md`
 * („Effekte“).
 *
 * Das Original zeichnet sofort (D3D) und rechnet in denselben Schleifen;
 * einige Zeichenwege ziehen `Rnd`. Damit die gemeinsame Zufallsfolge wie
 * bei einem Rechner stimmt, der jeden Tick zeichnet, läuft das hier in der
 * Simulation und hinterlässt je Tick Zeichenlisten, die der Renderer nur
 * abspielt.
 */

export const SPARK_SLOTS = 1501;
export const BIG_SLOTS = 4001;
export const POPUP_SLOTS = 101;
export const BUBBLE_SLOTS = 201;

/** Ein gestrecktes Rechteck (`SetUpRect`/`SetUpGeom` + `Render`). */
export interface Quad {
  /** Atlas-Schlüssel, oder `surface` für ein Gruppenbild. */
  key: string;
  surface?: Surface | undefined;
  /** Ausschnitt im Bild (x, y, Breite, Höhe), sonst das ganze Bild. */
  src?: readonly [number, number, number, number] | undefined;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** Drehung in Grad um die Mitte. */
  rot: number;
  additive: boolean;
}

/** `Linie`: Balken von (x1, y1) nach (x2, y2), halbe Breite `w`, Farbverlauf. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  c1: readonly [number, number, number, number];
  c2: readonly [number, number, number, number];
  additive: boolean;
}

export class DrawList {
  readonly quads: Quad[] = [];
  readonly segments: Segment[] = [];

  clear(): void {
    this.quads.length = 0;
    this.segments.length = 0;
  }

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
    rot = 0,
    surface?: Surface,
    src?: readonly [number, number, number, number],
  ): void {
    this.quads.push({ key, surface, src, x1, y1, x2, y2, r, g, b, a, rot, additive });
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    c1: Segment["c1"],
    c2: Segment["c2"],
    additive = false,
  ): void {
    this.segments.push({ x1, y1, x2, y2, w, c1, c2, additive });
  }
}

/** Zeichenstellen in der Reihenfolge von `SpielLoop`. */
export const DRAW_SLOTS = [
  /** Checkpoint-Tor, hintere Hälfte. */
  "gate0",
  /** Abgasflamme (`SpielKeysDove`), vor den Spielerschüssen. */
  "exhaust",
  /** Blitze der Partikelwaffe (`SpielSchieß`). */
  "weapons",
  /** Spielerschüsse Ebene 0 (`SpielMoveSchuss(0)`, unter Schiff und Gegnern). */
  "shots0",
  /** Kleine Partikel Ebene 0 (vor Schiff und Gegnern). */
  "sparks0",
  /** Linien, Trümmer und Glut aus den Todeszuständen (`SpielMoveEnemy`). */
  "enemies",
  "bubbles",
  /** Partikel des D-Tonator (`SpielPartikel`, über der Landschaft). */
  "particles",
  /** Spielerschüsse Ebene 1 (`SpielMoveSchuss(1)`, über der Landschaft). */
  "shots1",
  /** Kleine Partikel Ebene 1 (nach der Landschaft). */
  "sparks1",
  "big",
  /** Force des D-Phyton (`SpielSateliet`, nach den Gegnerschüssen). */
  "force",
  "popups",
  /** Checkpoint-Tor, vordere Hälfte (vor Ebene 6). */
  "gate1",
  /** Weißer Blitz nach Checkpoint und Wiedergeburt. */
  "flash",
  /** Funkfenster im HUD (zeichnet der Renderer mit dem HUD). */
  "radio",
] as const;
export type DrawSlot = (typeof DRAW_SLOTS)[number];

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  size: number;
  life: number;
  initLife: number;
}

interface Big {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  size: number;
  delay: number;
  life: number;
  initLife: number;
  kind: number;
  p38: number;
  /** Nur Art 12 (Teiltrümmer): Gruppe, Bild, Bildzeit, Drehung. */
  group: number;
  frame: number;
  timer: number;
  rot: number;
}

interface Popup {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  age: number;
  value: number;
}

interface Bubble {
  active: boolean;
  x: number;
  y: number;
  size: number;
  angle: number;
}

class Pool<T extends { active: boolean }> {
  readonly items: T[];
  /** Erster freier Slot und höchster belegter (−1 leer). */
  hint = 0;
  high = -1;

  constructor(n: number, make: () => T) {
    this.items = Array.from({ length: n }, make);
  }

  free(i: number): void {
    this.items[i]!.active = false;
    if (i < this.hint) this.hint = i;
    if (i === this.high) {
      let h = i - 1;
      while (h >= 0 && !this.items[h]!.active) h--;
      this.high = h;
    }
  }

  take(i: number): void {
    if (i > this.high) this.high = i;
  }
}

/** Was die großen Partikel von der Welt brauchen. */
export interface EffectWorld {
  readonly tick: number;
  readonly gravity: number;
  readonly groups: readonly DovezGroup[];
  readonly surfaces: readonly Surface[][];
  /** `Landschaft3`-Test (Blasen). */
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  sound(name: string): void;
}

export class Effects {
  readonly sparks = [0, 1].map(
    () =>
      new Pool<Spark>(SPARK_SLOTS, () => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 0,
        g: 0,
        b: 0,
        size: 0,
        life: 0,
        initLife: 0,
      })),
  ) as [Pool<Spark>, Pool<Spark>];
  readonly big = new Pool<Big>(BIG_SLOTS, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 0,
    g: 0,
    b: 0,
    size: 0,
    delay: 0,
    life: 0,
    initLife: 0,
    kind: 0,
    p38: 0,
    group: 0,
    frame: 0,
    timer: 0,
    rot: 0,
  }));
  readonly popups = new Pool<Popup>(POPUP_SLOTS, () => ({
    active: false,
    x: 0,
    y: 0,
    vy: 0,
    age: 0,
    value: 0,
  }));
  readonly bubbles = new Pool<Bubble>(BUBBLE_SLOTS, () => ({
    active: false,
    x: 0,
    y: 0,
    size: 0,
    angle: 0,
  }));
  /** Wackelzähler (`Me.7D0`) und Versatz dieses Ticks. */
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  /**
   * Explosionsstil (`Me.520`): 0 normal, sonst weiß (Eis-Hintergrund 3,
   * starkes Wetter). Der 24. Dezember des Originals entfällt (Port ohne Datum).
   */
  style = 0;
  readonly lists = Object.fromEntries(DRAW_SLOTS.map((s) => [s, new DrawList()])) as Record<
    DrawSlot,
    DrawList
  >;

  constructor(
    private readonly rnd: VbRnd,
    /** `Me.1D4`: Wasserhöhe (Blasen unter Wasser). */
    private readonly waterHeight: number,
  ) {}

  /** Zu Tickbeginn: Zeichenlisten leeren. */
  beginTick(): void {
    for (const l of Object.values(this.lists)) l.clear();
    this.shakeX = 0;
    this.shakeY = 0;
  }

  // --- kleine Partikel ----------------------------------------------------

  /**
   * `AddPartikel` (`0x4EDAE0`): `count` Funken gleichverteilt im Rechteck,
   * 9 `Rnd` je Funke; bei vollem Pool fallen die restlichen weg.
   */
  addSparks(
    layer: 0 | 1,
    count: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    colored: boolean,
  ): void {
    const pool = this.sparks[layer];
    const rnd = this.rnd;
    let added = 0;
    for (let i = pool.hint; i < SPARK_SLOTS; i++) {
      const p = pool.items[i]!;
      if (p.active) continue;
      added++;
      p.x = f32(vbInt(rnd.next() * (x2 - x1)) + x1);
      p.y = f32(vbInt(rnd.next() * (y2 - y1)) + y1);
      p.size = 2;
      const l = vbInt(rnd.next() * 20) + 12;
      p.initLife = l;
      p.life = l + 5;
      p.active = true;
      // zwei Zufallswerte für die DirectDraw-Farbe, die D3D nicht benutzt
      rnd.next();
      rnd.next();
      if (colored) {
        p.r = f32(rnd.next() * 0.75);
        p.g = f32(rnd.next() * 0.75);
        p.b = 1;
      } else {
        p.r = 1;
        p.g = f32(rnd.next() / 2 + 0.5);
        p.b = f32(rnd.next() / 2);
      }
      p.vx = f32((vbInt(rnd.next() * 12) - 6) / 2);
      p.vy = f32((vbInt(rnd.next() * 12) - 6) / 2);
      pool.take(i);
      if (added === count) {
        pool.hint = i + 1;
        return;
      }
    }
  }

  /** `Add1Partikel` (`0x4EA610`): ein kleiner Partikel mit festen Werten, ohne `Rnd`. */
  addSpark1(
    layer: 0 | 1,
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    g: number,
    b: number,
    size: number,
    life: number,
  ): void {
    const pool = this.sparks[layer];
    for (let i = pool.hint; i < SPARK_SLOTS; i++) {
      const p = pool.items[i]!;
      if (p.active) continue;
      Object.assign(p, {
        active: true,
        x: f32(x),
        y: f32(y),
        vx: f32(vx),
        vy: f32(vy),
        r: f32(r),
        g: f32(g),
        b: f32(b),
        size,
        life,
        initLife: life,
      });
      pool.take(i);
      pool.hint = i + 1;
      return;
    }
  }

  /** `AddCircle` (`0x4EA360`): Funkenring aus `(cx, cy)`, je `step` Grad einer. */
  addCircle(layer: 0 | 1, step: number, r0: number, cx: number, cy: number, life: number): void {
    const pool = this.sparks[layer];
    const rnd = this.rnd;
    let a = 0;
    for (let i = pool.hint; i < SPARK_SLOTS; i++) {
      const p = pool.items[i]!;
      if (p.active) continue;
      rnd.next();
      rnd.next();
      p.r = f32(rnd.next());
      p.g = f32(rnd.next() / 2 + 0.5);
      p.b = f32(rnd.next());
      p.size = 2;
      p.life = p.initLife = idiv(life, 6) - 4;
      p.active = true;
      p.vx = f32((SIN_DEG[a] ?? 0) * 6 - r0);
      p.vy = f32((COS_DEG[a] ?? 0) * 6);
      p.x = f32(cx + p.vx * 4);
      p.y = f32(cy + p.vy * 4);
      a += step;
      pool.take(i);
      if (a >= 360) {
        pool.hint = i + 1;
        return;
      }
    }
  }

  /** `MovePartikel(Ebene)` (`0x4EDF80`): zeichnen, dann altern und bewegen (mit Schwerkraft). */
  moveSparks(layer: 0 | 1, gravity: number): void {
    const pool = this.sparks[layer];
    const out = this.lists[layer === 0 ? "sparks0" : "sparks1"];
    const hi = pool.high;
    for (let i = 0; i <= hi; i++) {
      const p = pool.items[i]!;
      if (!p.active) continue;
      if (p.x < 0 || p.x + p.size >= 800 || p.y < 0 || p.y + p.size >= 600) p.life = -1;
      else {
        out.quad("weiss", p.x, p.y, p.x + p.size, p.y + p.size, p.r, p.g, p.b, p.life / p.initLife);
        p.life--;
      }
      if (p.life < 0) pool.free(i);
      else {
        p.x = f32(p.x + p.vx);
        p.y = f32(p.y + p.vy);
        p.vy = f32(p.vy + gravity);
      }
    }
  }

  // --- große Partikel -----------------------------------------------------

  /** `Add1BigPartikel` (`0x4EA7E0`), ohne `Rnd`. */
  addBig(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    g: number,
    b: number,
    size: number,
    delay: number,
    life: number,
    kind: number,
    p38: number,
  ): Big | undefined {
    const pool = this.big;
    for (let i = pool.hint; i < BIG_SLOTS; i++) {
      const p = pool.items[i]!;
      if (p.active) continue;
      Object.assign(p, {
        active: true,
        x: f32(x),
        y: f32(y),
        vx: f32(vx),
        vy: f32(vy),
        r: f32(r),
        g: f32(g),
        b: f32(b),
        size: cint(size),
        delay: cint(delay),
        life: cint(life),
        initLife: cint(life),
        kind,
        p38: f32(p38),
      });
      pool.take(i);
      pool.hint = i + 1;
      return p;
    }
    return undefined;
  }

  /** `AddBigPartikel` (`0x4EA920`): Feuerbälle (Arten 6–9) im Rechteck, 5 `Rnd` je Stück. */
  addFireballs(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    size: number,
    delay: number,
    life: number,
  ): void {
    const w = x2 - x1;
    const h = y2 - y1;
    const half = idiv(size, 2);
    const n = cint(3 * (w / size) * (h / size)) + 1;
    const rnd = this.rnd;
    for (let k = 0; k <= n; k++) {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      const r4 = rnd.next();
      const r5 = rnd.next();
      this.addBig(
        x1 + (w - half) * r1 - idiv(half, 2),
        y1 + (h - half) * r2 - idiv(half, 2),
        2 * r3 - 1,
        2 * r4 - 1,
        r,
        g,
        b,
        2 * half,
        delay,
        life,
        6 + vbInt(r5 * 4),
        0,
      );
    }
  }

  /** `AddExplosionsPartikel` (`0x4EABE0`): die Standard-Explosion über ein Rechteck. */
  addExplosion(x1: number, y1: number, x2: number, y2: number): void {
    const rnd = this.rnd;
    const w = x2 - x1;
    const h = y2 - y1;
    const bigBox = (w + h) / 2 > 64;
    const d = bigBox ? 20 : 6;
    const l = bigBox ? 36 : 16;
    const n = cint(2 * (w / 64) * (h / 64)) + 1;
    const cx = cint(x1 + idiv(w - 64, 2));
    const cy = cint(y1 + idiv(h - 64, 2));
    if (this.style === 0) {
      for (let k = 1; k <= n; k++) {
        const px = cint((w - 64) * rnd.next() + x1);
        const py = cint((h - 64) * rnd.next() + y1);
        const dx = Math.abs(cx - px);
        const dy = Math.abs(cy - py);
        let f: number;
        if (dx < dy) f = cy === y1 ? 1 : 1 - dy / (cy - y1);
        else f = cx - x1 === 0 ? 1 : 1 - dx / (cx - x1);
        if (rnd.next() < 0.6) {
          const r1 = rnd.next();
          const r2 = rnd.next();
          const r3 = rnd.next();
          const r4 = rnd.next();
          this.addBig(
            px,
            py,
            f * (2 * r1 - 1),
            f * (2 * r2 - 1),
            1,
            0.4 + 0.2 * r3,
            0.3 + 0.2 * r4,
            64,
            d,
            l - 5,
            1,
            0,
          );
        } else {
          const r1 = rnd.next();
          const r2 = rnd.next();
          const r3 = rnd.next();
          this.addBig(
            px,
            py,
            f * (2 * r1 - 1),
            f * (2 * r2 - 1),
            0,
            0,
            0,
            64,
            0,
            l + d,
            10,
            r3 / 2,
          );
        }
      }
      this.addFireballs(x1, y1, x2, y2, 0.9, 0.42, 0.25, 64, d, l);
    } else {
      for (let k = 1; k <= 5 * n; k++) {
        const px = cint((w - 64) * rnd.next() + x1);
        const py = cint((h - 64) * rnd.next() + y1);
        const vx = rnd.next() * 8 - 4;
        const vy = rnd.next() * 8 - 4;
        for (const dl of [0, 2, 4, 6])
          this.addBig(px + 8, py + 8, vx, vy, 1, 1, 1, 32, dl, l - 5, 10, 0);
      }
      this.addFireballs(x1, y1, x2, y2, 0.45, 0.3, 0.9, 64, d, l);
    }
    if (550 - this.waterHeight < y1 + idiv(h, 2)) {
      for (let k = 0; k <= n; k++) {
        const size = cint(rnd.next() * 10 + 8);
        const r1 = rnd.next();
        const r2 = rnd.next();
        this.addBubble(x1 + w * r1 - idiv(size, 2), y1 + h * r2 - idiv(size, 2), size);
      }
    }
  }

  /**
   * `Blitz` (`0x5353A0`): Zickzack aus `nSeg + 1` Balken, je Zwischenpunkt
   * ein `Rnd` für den Versatz quer zur Richtung. Mit `seed` zieht er die
   * Versätze aus einer eigenen Folge (`Rnd(−1)`, `Randomize seed`) und sät die
   * Hauptfolge danach mit dem zuerst gezogenen Wert neu.
   */
  lightning(
    out: DrawList,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    nSeg: number,
    jitter: number,
    r: number,
    g: number,
    b: number,
    additive: boolean,
    seed?: number,
  ): void {
    const rnd = this.rnd;
    const saved = vbInt(rnd.next() * 10000);
    if (seed !== undefined) {
      rnd.negative(-1);
      rnd.randomize(vbInt(seed));
      rnd.next();
    }
    const n = nSeg + 1;
    const angle = cint(winkelInGrad(x2 - x1, y2 - y1));
    const cos = COS_DEG[degIndex(angle - 90)] ?? 0;
    const sin = SIN_DEG[degIndex(angle - 90)] ?? 0;
    let px = x1;
    let py = y1;
    const c = [r, g, b, 1] as const;
    for (let i = 1; i <= n; i++) {
      let qx = x2;
      let qy = y2;
      if (i !== n) {
        const off = cint(rnd.next() * jitter * 2 - jitter);
        qx = x1 + ((x2 - x1) / n) * i + off * cos;
        qy = y1 + ((y2 - y1) / n) * i + off * sin;
      }
      out.line(px, py, qx, qy, w, c, c, additive);
      px = qx;
      py = qy;
    }
    if (seed !== undefined) {
      rnd.negative(-1);
      rnd.randomize(saved);
      rnd.next();
    }
  }

  /** `MoveBigPartikel` (`0x4EB7E0`): je Slot bewegen, altern, nach Art zeichnen und wachsen. */
  moveBig(w: EffectWorld): void {
    const pool = this.big;
    const out = this.lists.big;
    const rnd = this.rnd;
    const hi = pool.high;
    for (let i = 0; i <= hi; i++) {
      const p = pool.items[i]!;
      if (!p.active) continue;
      if (p.delay > 0) p.delay--;
      else {
        p.x = f32(p.x + p.vx);
        p.y = f32(p.y + p.vy);
        p.life--;
      }
      if (p.life <= 0) {
        pool.free(i);
        continue;
      }
      const a = p.life / p.initLife;
      const x2 = p.x + p.size;
      const y2 = p.y + p.size;
      switch (p.kind) {
        case 0: {
          // Blitz; das erste Rnd läuft auch ohne Zeichnen
          const r = rnd.next();
          const n = idiv(p.size, 10) + 1;
          let bx1: number, by1: number, bx2: number, by2: number;
          if (r < 0.25) {
            bx1 = p.x + rnd.next() * p.p38;
            by1 = p.y;
            bx2 = p.x + rnd.next() * p.p38;
            by2 = p.y + p.size;
          } else if (r > 0.75) {
            bx1 = p.x;
            by1 = p.y + rnd.next() * p.size;
            bx2 = p.x + p.p38;
            by2 = p.y + rnd.next() * p.size;
          } else {
            bx1 = p.x + rnd.next() * p.p38;
            by1 = p.y + rnd.next() * p.size;
            bx2 = p.x + rnd.next() * p.p38;
            by2 = p.y + rnd.next() * p.size;
          }
          this.lightning(out, bx1, by1, bx2, by2, 8, n, 5, p.r, p.g, p.b, true);
          break;
        }
        case 1:
        case 2:
        case 16:
          out.quad(
            p.kind === 2 ? "wave" : "a_kreis2",
            p.x,
            p.y,
            x2,
            y2,
            p.r,
            p.g,
            p.b,
            0.7 * a,
            p.kind === 16,
          );
          this.grow(p);
          break;
        case 3:
          out.quad("wave", p.x, p.y, p.x + p.p38, y2, p.r, p.g, p.b, a);
          p.p38 = f32(p.p38 + 4);
          p.size += 8;
          p.x = f32(p.x - 2);
          p.y = f32(p.y - 4);
          break;
        case 4:
        case 5:
          out.quad(
            "strich",
            cint(p.x),
            cint(p.y),
            cint(x2),
            cint(y2),
            p.r,
            p.g,
            p.b,
            p.kind === 4 ? 0.2 : 0.5 * a,
            true,
            cint(p.p38),
          );
          if (p.kind === 4) {
            p.x = f32(p.x - 5);
            p.y = f32(p.y - 5);
            p.size += 10;
          } else {
            const cx = p.x + p.size / 2;
            const cy = p.y + p.size / 2;
            p.size = cint(p.size * 1.15);
            p.x = f32(cx - p.size / 2);
            p.y = f32(cy - p.size / 2);
          }
          break;
        case 6:
        case 7:
        case 8:
        case 9: {
          const grow = p.delay > 0 ? 4 : 1;
          p.size += grow;
          p.x = f32(p.x - grow / 2);
          p.y = f32(p.y - grow / 2);
          out.quad(
            `feuer${p.kind - 6}`,
            p.x,
            p.y,
            p.x + p.size,
            p.y + p.size,
            p.r,
            p.g,
            p.b,
            a,
            true,
          );
          break;
        }
        case 10: {
          const f = cint(6 - 6 * a);
          out.quad(`rauch${f + 1}`, p.x, p.y, x2, y2, p.r, p.g, p.b, Math.sqrt(Math.sqrt(a)));
          this.grow(p);
          break;
        }
        case 11:
          out.quad("blur", p.x, p.y, x2, y2, 1, 1, 1, a);
          break;
        case 12:
          this.moveDebris(p, a, w);
          break;
        case 13:
          out.quad(
            "wave2",
            cint(p.x),
            cint(p.y),
            cint(x2),
            cint(y2),
            p.r,
            p.g,
            p.b,
            0.7 * a,
            false,
            cint(p.p38),
          );
          p.x = f32(p.x - 4);
          p.y = f32(p.y - 4);
          p.size += 8;
          break;
        case 14:
          out.quad("glitzer", p.x, p.y, x2, y2, p.r, p.g, p.b, a, true, (w.tick % 90) * 4);
          this.grow(p);
          break;
        case 15:
          if (p.delay <= 0)
            out.quad("strich", p.x, p.y, x2, y2, p.r, p.g, p.b, a, true, cint(p.p38));
          break;
      }
    }
  }

  /** Wachstum der Arten 1, 2, 10, 14, 16 um `p38` je Tick, mittig. */
  private grow(p: Big): void {
    p.size = cint(p.size + p.p38);
    p.x = f32(p.x - p.p38 / 2);
    p.y = f32(p.y - p.p38 / 2);
  }

  /** Art 12: fliegendes Teil mit Rauchspur, explodiert im letzten Tick. */
  private moveDebris(p: Big, a: number, w: EffectWorld): void {
    const group = w.groups[p.group];
    if (group) doAni(group, p);
    p.rot = f32(p.rot - 0.6);
    p.x = f32(p.x + p.vx);
    p.y = f32(p.y + p.vy);
    p.vy = f32(p.vy + w.gravity);
    const s = w.surfaces[p.group]?.[p.frame];
    const bw = s?.rect.w ?? 0;
    const bh = s?.rect.h ?? 0;
    if (p.life === 1) {
      this.addExplosion(p.x, p.y, p.x + bw, p.y + bh);
      w.sound("explosion");
    }
    if (p.life % 2 === 0) {
      const r1 = this.rnd.next();
      const r2 = this.rnd.next();
      const sz = cint(p.p38);
      this.addBig(
        p.x + idiv(bw, 2) - idiv(sz, 2),
        p.y + idiv(bh, 2) - idiv(sz, 2),
        2 * r1 - 1,
        2 * r2 - 1,
        1,
        1,
        1,
        sz,
        0,
        12,
        10,
        0,
      );
    }
    if (s) this.lists.big.quad("", p.x, p.y, p.x + bw, p.y + bh, 1, 1, 1, 2 * a, false, p.rot, s);
  }

  // --- Punkte-Popups, Blasen, Wackeln -------------------------------------

  /** Popup aus `AddPunkte` (`0x50F750`): Wert erscheint 4 px über `y`. */
  addPopup(value: number, x: number, y: number, vy: number): void {
    const pool = this.popups;
    for (let i = pool.hint; i < POPUP_SLOTS; i++) {
      const p = pool.items[i]!;
      if (p.active) continue;
      Object.assign(p, { active: true, x: f32(x), y: f32(y - 4), vy: f32(vy), age: 0, value });
      pool.take(i);
      pool.hint = i + 1;
      return;
    }
  }

  /** `SpielMovePunkte` (`0x50FA00`): Ziffern von rechts nach links, 8 px Abstand, 30 Ticks. */
  movePopups(): void {
    const pool = this.popups;
    const out = this.lists.popups;
    for (let i = 0; i <= pool.high; i++) {
      const p = pool.items[i]!;
      if (!p.active) continue;
      let v = p.value;
      let off = 4;
      do {
        const x = cint(p.x - off);
        const y = cint(p.y);
        out.quad(`n${v % 10}`, x, y, x + 8, y + 12);
        off += 8;
        v = Math.trunc(v / 10);
      } while (v > 0);
      p.y = f32(p.y + p.vy);
      if (++p.age === 30) pool.free(i);
    }
  }

  /** `AddBlase` (`0x50F670`). */
  addBubble(x: number, y: number, size: number): void {
    const pool = this.bubbles;
    for (let i = pool.hint; i < BUBBLE_SLOTS; i++) {
      const p = pool.items[i]!;
      if (p.active) continue;
      Object.assign(p, { active: true, x: f32(x), y: f32(y), size, angle: 0 });
      pool.take(i);
      pool.hint = i + 1;
      return;
    }
  }

  /** `SpielMoveBlase` (`0x50F430`): steigen und pendeln, platzen an Landschaft oder Wasserlinie. */
  moveBubbles(w: EffectWorld, draw: boolean): void {
    const pool = this.bubbles;
    for (let i = 0; i <= pool.high; i++) {
      const p = pool.items[i]!;
      if (!p.active) continue;
      const r = this.rnd.next();
      p.y = f32(p.y - 1 - r / 4);
      p.angle = (p.angle + 4) % 360;
      p.x = f32(p.x + (SIN_DEG[p.angle] ?? 0));
      const [x1, y1] = [cint(p.x), cint(p.y)];
      if (
        w.terrain(x1, y1, cint(p.x + p.size), cint(p.y + p.size)) ||
        p.y <= 550 - this.waterHeight
      )
        pool.free(i);
      else if (draw) this.lists.bubbles.quad("blase", p.x, p.y, p.x + p.size, p.y + p.size);
    }
  }

  /** `SpielErschütterung` (`0x529BC0`): Versatz ±6 (Zähler ≥ 19) bzw. ±3 px. */
  stepShake(): void {
    if (this.shake <= 0) return;
    this.shake--;
    const big = this.shake >= 19;
    const m = big ? 13 : 7;
    const o = big ? 6 : 3;
    this.shakeX = cint(this.rnd.next() * m) - o;
    this.shakeY = cint(this.rnd.next() * m) - o;
  }
}
