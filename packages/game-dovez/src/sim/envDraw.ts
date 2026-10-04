import type { Segment } from "./effects";

/**
 * Zeichenbefehle der Umgebungseffekte (Hintergrund, Wetter, Wasser,
 * Spezialabläufe, Overlays). Anders als die Effekt-Zeichenlisten
 * (`effects.ts`) brauchen sie frei gesetzte Vertizes mit eigener Farbe
 * (D3D-TL-Vertizes, Dreiecksstreifen) und Zugriff auf den Backbuffer, den
 * das Original **nie löscht**: Erfassen in eine Render-Textur (`blur`,
 * Standbild `Me.774`) und Umkopieren von Streifen (Wellen, Schmelzen). Die
 * Befehle laufen in der Reihenfolge ab, in der das Original sie ausführt;
 * der Renderer (`render/Compositor.ts`) spielt sie auf einen dauerhaften
 * Backbuffer ab.
 */

/**
 * Render-Ziele des Originals: `blur` 64×64 (`Me.770`), Standbild 800×600
 * (`Me.774`, `blur3`) und die zweite 64×64-Textur `Me.738` („Linse“ des
 * Beams und der Schockwelle des Debug-Schiffs, mit `a_kreis3` überblittet).
 */
export type RenderTarget = "blur" | "still" | "lens";

/** Schlüssel einer Textur: Atlas-Sprite oder `@blur`/`@still`/`@lens`/`@noise` (Rauschen mit Kachelwiederholung). */
export type TexKey = string;

/** TL-Vertex: Position, Texturkoordinate (0…1 über das Bild), Farbe 0…1 (geklemmt wie `0x577E70`). */
export interface Vtx {
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly v: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Dreiecksstreifen (4 Vertizes: v0 unten links, v1 oben links, v2 unten rechts, v3 oben rechts). */
export interface Strip {
  readonly op: "strip";
  readonly key: TexKey;
  readonly v: readonly Vtx[];
  readonly additive: boolean;
}

/** Das Bild bis hierher (Ausschnitt `src` x, y, w, h) gestreckt in ein Render-Ziel. */
export interface Capture {
  readonly op: "capture";
  readonly target: RenderTarget;
  readonly src: readonly [number, number, number, number];
  /** Danach dieses Atlas-Bild (Farbschlüssel) über das ganze Ziel blitten (`BltFast` mit `a_kreis3`). */
  readonly overlay?: TexKey | undefined;
}

/** `BltFast` Backbuffer → Backbuffer: Rechtecke (sx, sy, w, h) nach (dx, dy). */
export interface Copy {
  readonly op: "copy";
  readonly rects: readonly (readonly [number, number, number, number, number, number])[];
}

export type EnvCmd = Strip | Capture | Copy;

/** Texturgrößen der Render-Ziele (für Quellrechtecke in Pixeln). */
const TARGET_SIZE: Record<string, readonly [number, number]> = {
  "@blur": [64, 64],
  "@lens": [64, 64],
  "@still": [800, 600],
  "@noise": [256, 256],
};
const NO_SIZE = [1, 1] as const;

type MutableVtx = { -readonly [K in keyof Vtx]: Vtx[K] };
interface PooledStrip {
  readonly op: "strip";
  key: TexKey;
  readonly v: MutableVtx[];
  additive: boolean;
}

const vtx = (): MutableVtx => ({ x: 0, y: 0, u: 0, v: 0, r: 0, g: 0, b: 0, a: 0 });

function setVtx(
  t: MutableVtx,
  x: number,
  y: number,
  u: number,
  v: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  t.x = x;
  t.y = y;
  t.u = u;
  t.v = v;
  t.r = r;
  t.g = g;
  t.b = b;
  t.a = a;
}

export class EnvList {
  readonly cmds: EnvCmd[] = [];
  /**
   * Vierecke aus `rect`, `cross` und `segment`, über `clear()` hinweg
   * wiederverwendet: je Tick entstünden sonst Hunderte Vertex-Objekte. Ein
   * Befehl gilt bis zum nächsten `clear()`; der Renderer liest ihn davor.
   */
  private readonly quads: PooledStrip[] = [];
  private quadsUsed = 0;

  clear(): void {
    this.cmds.length = 0;
    this.quadsUsed = 0;
  }

  /** Nächstes Viereck aus dem Vorrat, als Befehl angehängt; die Vertizes setzt der Aufrufer. */
  private quad(key: TexKey, additive: boolean): MutableVtx[] {
    let s = this.quads[this.quadsUsed];
    if (!s) {
      s = { op: "strip", key, v: [vtx(), vtx(), vtx(), vtx()], additive };
      this.quads.push(s);
    }
    this.quadsUsed++;
    s.key = key;
    s.additive = additive;
    this.cmds.push(s);
    return s.v;
  }

  strip(key: TexKey, v: readonly Vtx[], additive = false): void {
    this.cmds.push({ op: "strip", key, v, additive });
  }

  /**
   * `SetUpRect` + `SetUpColor` + `Render`: Rechteck (x1, y1)–(x2, y2), Bild
   * aufrecht; optional mit Quellrechteck (links, oben, rechts, unten) in
   * Pixeln eines Render-Ziels (`SetUpGeom`, gespiegelt, wenn rechts < links).
   */
  rect(
    key: TexKey,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    a: number,
    additive = false,
    src?: readonly [number, number, number, number],
  ): void {
    let u0 = 0;
    let v0 = 0;
    let u1 = 1;
    let v1 = 1;
    if (src) {
      const size = TARGET_SIZE[key] ?? NO_SIZE;
      u0 = src[0] / size[0];
      v0 = src[1] / size[1];
      u1 = src[2] / size[0];
      v1 = src[3] / size[1];
    }
    const q = this.quad(key, additive);
    setVtx(q[0]!, x1, y2, u0, v1, r, g, b, a);
    setVtx(q[1]!, x1, y1, u0, v0, r, g, b, a);
    setVtx(q[2]!, x2, y2, u1, v1, r, g, b, a);
    setVtx(q[3]!, x2, y1, u1, v0, r, g, b, a);
  }

  /**
   * Vertizes direkt als v0 (L, T), v1 (R, T), v2 (L, B), v3 (R, B) gesetzt
   * (Regen, Gewitter): die Textur liegt quer, die Balken-Maske ist in der
   * Mitte der Breite hell.
   */
  cross(
    key: TexKey,
    l: number,
    t: number,
    r_: number,
    b_: number,
    r: number,
    g: number,
    b: number,
    a: number,
    additive = false,
  ): void {
    const q = this.quad(key, additive);
    setVtx(q[0]!, l, t, 0, 1, r, g, b, a);
    setVtx(q[1]!, r_, t, 0, 0, r, g, b, a);
    setVtx(q[2]!, l, b_, 1, 1, r, g, b, a);
    setVtx(q[3]!, r_, b_, 1, 0, r, g, b, a);
  }

  /** `Linie` (Balken quer zur Richtung, Farbverlauf entlang), aus einer Effekt-Zeichenliste. */
  segment(s: Segment): void {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = (-dy / len) * s.w;
    const ny = (dx / len) * s.w;
    const c1 = s.c1;
    const c2 = s.c2;
    const q = this.quad("balken", s.additive);
    setVtx(q[0]!, s.x1 + nx, s.y1 + ny, 0, 1, c1[0], c1[1], c1[2], c1[3]);
    setVtx(q[1]!, s.x1 - nx, s.y1 - ny, 0, 0, c1[0], c1[1], c1[2], c1[3]);
    setVtx(q[2]!, s.x2 + nx, s.y2 + ny, 1, 1, c2[0], c2[1], c2[2], c2[3]);
    setVtx(q[3]!, s.x2 - nx, s.y2 - ny, 1, 0, c2[0], c2[1], c2[2], c2[3]);
  }

  capture(
    target: RenderTarget,
    x: number,
    y: number,
    w: number,
    h: number,
    overlay?: TexKey,
  ): void {
    this.cmds.push({ op: "capture", target, src: [x, y, w, h], overlay });
  }

  copy(rects: Copy["rects"]): void {
    if (rects.length > 0) this.cmds.push({ op: "copy", rects });
  }
}

/** Zeichenstellen der Umgebung in der Reihenfolge von `SpielLoop`. */
export const ENV_SLOTS = [
  /** `SpielMoveHintergrund`, vor Ebene 0. */
  "bg",
  /** `SpielSpezial(0)`, nach Ebene 0 und ihren Animationen. */
  "special0",
  /** `SpielHupe` und `SpielRegen`, nach den Punkte-Popups. */
  "hupe",
  "rain",
  /** `SpielWasser`, `SpielSchnee`, `SpielSpezial(1)`, nach Ebene 6. */
  "water",
  "weather",
  "special1",
  /** `OverlayEffekte` mit `MakeSomeNoise`, zuletzt vor Abblende und HUD. */
  "overlay",
  /** Beam des Debug-Schiffs 2 (`SpielBeam`, nach dem Beam der übrigen Schiffe). */
  "beam",
  /** Schockwellen-Linse der großen Partikel (Art 17, nach `MoveBigPartikel`). */
  "big",
] as const;
export type EnvSlot = (typeof ENV_SLOTS)[number];
