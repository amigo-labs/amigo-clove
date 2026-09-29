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

export class EnvList {
  readonly cmds: EnvCmd[] = [];

  clear(): void {
    this.cmds.length = 0;
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
    let [u0, v0, u1, v1] = [0, 0, 1, 1];
    if (src) {
      const [w, h] = TARGET_SIZE[key] ?? [1, 1];
      [u0, v0, u1, v1] = [src[0] / w, src[1] / h, src[2] / w, src[3] / h];
    }
    const c = { r, g, b, a };
    this.strip(
      key,
      [
        { x: x1, y: y2, u: u0, v: v1, ...c },
        { x: x1, y: y1, u: u0, v: v0, ...c },
        { x: x2, y: y2, u: u1, v: v1, ...c },
        { x: x2, y: y1, u: u1, v: v0, ...c },
      ],
      additive,
    );
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
    const c = { r, g, b, a };
    this.strip(
      key,
      [
        { x: l, y: t, u: 0, v: 1, ...c },
        { x: r_, y: t, u: 0, v: 0, ...c },
        { x: l, y: b_, u: 1, v: 1, ...c },
        { x: r_, y: b_, u: 1, v: 0, ...c },
      ],
      additive,
    );
  }

  /** `Linie` (Balken quer zur Richtung, Farbverlauf entlang), aus einer Effekt-Zeichenliste. */
  segment(s: Segment): void {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = (-dy / len) * s.w;
    const ny = (dx / len) * s.w;
    const [r1, g1, b1, a1] = s.c1;
    const [r2, g2, b2, a2] = s.c2;
    this.strip(
      "balken",
      [
        { x: s.x1 + nx, y: s.y1 + ny, u: 0, v: 1, r: r1, g: g1, b: b1, a: a1 },
        { x: s.x1 - nx, y: s.y1 - ny, u: 0, v: 0, r: r1, g: g1, b: b1, a: a1 },
        { x: s.x2 + nx, y: s.y2 + ny, u: 1, v: 1, r: r2, g: g2, b: b2, a: a2 },
        { x: s.x2 - nx, y: s.y2 - ny, u: 1, v: 0, r: r2, g: g2, b: b2, a: a2 },
      ],
      s.additive,
    );
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
