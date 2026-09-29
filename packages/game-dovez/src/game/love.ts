import { Effects, type EffectWorld } from "../sim/effects";
import { EnvList } from "../sim/envDraw";
import { COS_DEG, SIN_DEG, degIndex, f32, type VbRnd } from "../sim/vb";

/**
 * Osterei „LOV“ (`0x546C30`, im Hauptmenü mit gehaltenem L + O + V, Modus 8):
 * der Schriftzug „JULIA“ aus 44 Leuchtpunkten, die aus zufälligen Orten
 * hineinfedern und wackeln; bei Durchlauf 400 formen die ersten 24 davon ein
 * Herz (die übrigen 20 verschwinden), ab 600 regnen Glitzer, ab 750 blendet
 * „Ich liebe dich“ ein. Hintergrund ist das rote Plasma des Speicherbildschirms
 * (Modus 4 von `SpielMoveHintergrund`). Esc beendet die Schleife. Die Funktion
 * spielt keinen Ton (die Menümusik ist zu dem Zeitpunkt schon gestoppt).
 * Befund: `docs/measurements/dovez-runtime.md` („Osterei LOV“).
 */

/** Durchlauftakt (`Wait 18`), jeder Durchlauf wird gezeichnet. */
export const LOVE_MS = 18;
/** Das `Wait 1000` vor der Schleife (schwarzer Bildschirm). */
export const LOVE_START_MS = 1000;

/** Schriftzug „JULIA“, `.` = ein Punkt (`0x412CD4`…`0x412D94`, je 21 Zeichen). */
export const NAME_ROWS: readonly string[] = [
  ".... .  . .   .   .  ",
  "   . .  . .   .  . . ",
  "   . .  . .   . .....",
  ".  . .  . .   . .   .",
  " ..   ..  ... . .   .",
];
/** Herz (`0x412DC4`…`0x412E24`). */
export const HEART_ROWS: readonly string[] = [" ..  ..", "........", " ......", "  ....", "   .."];

/** Schrittweite und Ursprung der Ziele: Schriftzug `32 · Spalte + 10`, `32 · Zeile + 180` (Spalte ab 1). */
const NAME_GRID = { step: 32, x: 10, y: 180 } as const;
/** Herz: `16 · Spalte + 300`, `16 · Zeile + 250`. */
const HEART_GRID = { step: 16, x: 300, y: 250 } as const;

/** Durchlauf, in dem das Herz entsteht (`Me.584 = 0x190`). */
export const HEART_TICK = 400;
/** Ab hier (`Me.584 > 0x258`) je Durchlauf ein Glitzerpartikel. */
export const RAIN_TICK = 600;
/** Ab hier (`Me.584 > 0x2EE`) der Text. */
export const TEXT_TICK = 750;
/** Einblenden aus Schwarz: `Me.584 < 100`. */
export const FADE_IN_TICKS = 100;
/** Grauwert des Textes wächst je Durchlauf um 1 bis 128. */
export const TEXT_MAX_GRAY = 128;

export const LOVE_TEXT = "Ich liebe dich";
/** GDI-Arial mit Zellhöhe 28 (`0x57DE40`), linke obere Ecke der mittleren (grauen) Zeile. */
export const TEXT_SIZE = 28;
export const TEXT_POS = { x: 621, y: 566 } as const;

/** Größe der Leuchtpunkte (Rechteck `x, y` bis `x + 64, y + 64`). */
export const GLOW_SIZE = 64;

/** Leuchtpunkt (Datensatz 0x18 Byte): Ort, Tempo und Ziel. */
export interface LovePoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
}

/**
 * Die Punkte des Schriftzugs in der Reihenfolge des Originals: Zeile für Zeile,
 * Spalte 1…Länge; je Punkt zwei `Rnd` (erst x = `Rnd · 1032 − 132`, dann
 * y = `Rnd · 832 − 132`).
 */
export function namePoints(rnd: VbRnd): LovePoint[] {
  const out: LovePoint[] = [];
  NAME_ROWS.forEach((row, r) => {
    for (let c = 1; c <= row.length; c++) {
      if (row[c - 1] !== ".") continue;
      const tx = c * NAME_GRID.step + NAME_GRID.x;
      const ty = r * NAME_GRID.step + NAME_GRID.y;
      const x = f32(rnd.next() * 1032 - 132);
      const y = f32(rnd.next() * 832 - 132);
      out.push({ x, y, vx: 0, vy: 0, tx, ty });
    }
  });
  return out;
}

/**
 * Ziele des Herzens in der Reihenfolge des Originals: **spaltenweise**
 * (Spalte 1…20 außen, Zeile 0…4 innen), im Gegensatz zum Schriftzug.
 */
export function heartTargets(): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let c = 1; c <= 20; c++)
    HEART_ROWS.forEach((row, r) => {
      if (row.length >= c && row[c - 1] === ".")
        out.push({
          tx: c * HEART_GRID.step + HEART_GRID.x,
          ty: r * HEART_GRID.step + HEART_GRID.y,
        });
    });
  return out;
}

/** Was die großen Partikel von der Welt brauchen: nichts außer dem Durchlaufzähler (Drehung der Glitzer). */
const QUIET: Omit<EffectWorld, "tick"> = {
  gravity: 0,
  groups: [],
  surfaces: [],
  terrain: () => false,
  sound: () => {},
};

/** Fleck des Plasmas (`Me.10C0`): Phase, Tempo, Frequenzen, Alpha, Ort. */
interface Blob {
  phase: number;
  speed: number;
  fx: number;
  fy: number;
  alpha: number;
  x: number;
  y: number;
}

/**
 * Hintergrund 4 von `SpielMoveHintergrund` (rotes Plasma, `0x50E0A6`), wie
 * `Environment.plasma` (`sim/environment.ts`): 101 Flecken, beim ersten
 * Durchlauf 5 `Rnd` je Fleck; danach keine. Schwarz, die Flecken `a_kreis2`
 * (rot) in die Ecke 64 × 64, nach `blur` erfasst und bilinear auf 800 × 600.
 */
export class Plasma {
  static readonly BLOBS = 101;
  readonly blobs: Blob[] = Array.from({ length: Plasma.BLOBS }, () => ({
    phase: 0,
    speed: 0,
    fx: 0,
    fy: 0,
    alpha: 0,
    x: 0,
    y: 0,
  }));
  /** `Me.10CC`: Flecken noch auszulegen. */
  private fresh = true;

  step(rnd: VbRnd, out: EnvList): void {
    if (this.fresh) {
      for (const s of this.blobs) {
        s.phase = f32(rnd.next() * 100);
        s.speed = f32(rnd.next() * 0.05 + 0);
        s.fx = f32(rnd.next() * 2 - 1);
        s.fy = f32(rnd.next() * 2 - 1);
        s.alpha = f32(rnd.next() / 10);
      }
      this.fresh = false;
    }
    for (const s of this.blobs) {
      s.phase = f32(s.speed + s.phase);
      s.x = f32(32 * Math.sin(s.phase * s.fx));
      s.y = f32(32 * Math.sin(s.phase * s.fy));
    }
    out.rect("weiss", 0, 0, 800, 600, 0, 0, 0, 1);
    for (const s of this.blobs)
      out.rect("a_kreis2", s.x, s.y, s.x + GLOW_SIZE, s.y + GLOW_SIZE, 1, 0, 0, s.alpha);
    out.capture("blur", 0, 0, 64, 64);
    out.rect("@blur", 0, 0, 800, 600, 1, 1, 1, 1, false, [0, 0, 64, 64]);
  }
}

/**
 * Ablauf von `0x546C30` nach dem Aufbau. `LoveLogic` zieht schon im
 * Konstruktor die `Rnd` der 44 Punkte (die Abblende `FadeOut(0, False)` davor
 * zieht 1 `Rnd` — also erst nach ihr anlegen).
 */
export class LoveLogic {
  /** `Me.584`, zählt vor jedem Durchlauf hoch. */
  t = 0;
  /** Punkte des Schriftzugs; nur die ersten `count` laufen (`For 0 To n`). */
  readonly points: LovePoint[];
  /** Zahl der laufenden Punkte: 44, ab Durchlauf 400 nur noch 24 (die Herzpunkte). */
  count: number;
  readonly fx: Effects;
  /** Hintergrund dieses Durchlaufs (Plasma). */
  readonly bg = new EnvList();
  /** Einblendung und Leuchtpunkte dieses Durchlaufs, nach dem Hintergrund. */
  readonly fg = new EnvList();
  /** Grauwert der Schrift dieses Durchlaufs (`Me.71C`, 1…128), 0 = kein Text. */
  textGray = 0;
  private readonly plasma = new Plasma();

  constructor(private readonly rnd: VbRnd) {
    this.points = namePoints(rnd);
    this.count = this.points.length;
    // `VariabelnLösch` ruft die Funktion nicht auf: leere Pools; `Me.520 = 1`
    this.fx = new Effects(rnd, 0);
    this.fx.style = 1;
  }

  /**
   * Ein Durchlauf der Schleife; `false`, wenn sie am Kopf endet (Esc, `Me.588018`
   * ≠ 0). Danach liegen `bg`, `fg`, `fx.lists.big` und `textGray` zum Zeichnen bereit.
   */
  step(esc: boolean): boolean {
    if (esc) return false;
    const { rnd, fx } = this;
    const t = ++this.t;
    if (t === HEART_TICK) this.formHeart();
    fx.beginTick();
    this.bg.clear();
    this.fg.clear();
    if (t > RAIN_TICK) this.rain();
    this.plasma.step(rnd, this.bg);
    if (t < FADE_IN_TICKS) this.fg.rect("weiss", 0, 0, 800, 600, 0, 0, 0, f32((100 - t) / 100));
    this.movePoints();
    this.textGray = t > TEXT_TICK ? Math.min(t - TEXT_TICK, TEXT_MAX_GRAY) : 0;
    fx.moveSparks(1, 0);
    fx.moveBig({ ...QUIET, tick: t });
    return true;
  }

  /**
   * Die Punkte 0…23 bekommen die Herzziele (spaltenweise); `n` wird dabei
   * neu gezählt, die Schleifen laufen danach nur noch über diese 24.
   */
  private formHeart(): void {
    const goals = heartTargets();
    goals.forEach((g, i) => {
      const p = this.points[i];
      if (p) {
        p.tx = g.tx;
        p.ty = g.ty;
      }
    });
    this.count = goals.length;
  }

  /** Glitzer: Art 14 bei (336, −128), Größe 128, Leben 50; 5 `Rnd` in dieser Reihenfolge. */
  private rain(): void {
    const { rnd } = this;
    const r1 = rnd.next();
    const r2 = rnd.next();
    const r3 = rnd.next();
    const r4 = rnd.next();
    const r5 = rnd.next();
    this.fx.addBig(
      336,
      -128,
      r1 * 8 - 4,
      r2 * 10 + 5,
      1,
      r3 * 0.5 + 0.5,
      r4 * 0.2,
      128,
      0,
      50,
      14,
      r5 * 20 - 15,
    );
  }

  /**
   * Erst alle Punkte federn (Geschwindigkeit `(Ziel − Ort) / 10` bzw. `/ 8`, dazu
   * `Sin`/`Cos` von `10 · (Me.584 + i)` Grad als Wackeln, Dämpfung 0,95) und je
   * Punkt ein rotes Leuchten `a_kreis2` (α 0,7, additiv) zeichnen, dann alle noch
   * einmal als weißer `glitzer` (α 0,2, additiv).
   */
  private movePoints(): void {
    const out = this.fg;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const p = this.points[i]!;
      p.vx = f32((-p.x + p.tx) / 10 + p.vx);
      p.vy = f32((-p.y + p.ty) / 8 + p.vy);
      const a = degIndex((this.t + i) * 10);
      p.x = f32(p.x + p.vx + SIN_DEG[a]!);
      p.y = f32(p.y + p.vy + COS_DEG[a]!);
      p.vx = f32(p.vx * 0.95);
      p.vy = f32(p.vy * 0.95);
      out.rect("a_kreis2", p.x, p.y, p.x + GLOW_SIZE, p.y + GLOW_SIZE, 1, 0.2, 0.1, 0.7, true);
    }
    for (let i = 0; i < n; i++) {
      const p = this.points[i]!;
      out.rect("glitzer", p.x, p.y, p.x + GLOW_SIZE, p.y + GLOW_SIZE, 1, 1, 1, 0.2, true);
    }
  }
}
