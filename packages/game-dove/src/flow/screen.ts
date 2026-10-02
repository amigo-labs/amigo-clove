import type { GameHost } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import type { Container } from "pixi.js";
import type { DoveAudio } from "../audio/DoveAudio";
import type { VbRnd } from "../sim/VbRnd";
import type { FrameCache } from "../render/FrameCache";
import type { KeyEdges } from "./input";

/** Gemeinsame Umgebung aller Bildschirme. */
export interface FlowEnv {
  readonly host: GameHost;
  readonly textures: TextureRegistry;
  readonly frames: FrameCache;
  readonly audio: DoveAudio | undefined;
  /** Deutsch (`Me.350`), sonst Englisch. */
  readonly german: boolean;
  /** Zufall der Bildschirme (Sterne, Partikel) — getrennt von der Simulation. */
  readonly rnd: VbRnd;
  readonly keys: KeyEdges;
}

/**
 * Ein Bildschirm des Programmablaufs. `update()` läuft im 14-ms-Takt des
 * Originals und liefert ein Ergebnis, sobald der Bildschirm fertig ist;
 * `render()` baut die Szene nach neuen Ticks oder einem Bildschirmwechsel auf.
 */
export interface Screen<R> {
  readonly root: Container;
  /** Bild-IDs, die vor dem ersten `update()` geladen sein müssen. */
  readonly images: readonly string[];
  update(): R | undefined;
  render(): void;
  /** Das Bild steht (Pause): Ticks ändern es nicht, `render` entfällt. */
  readonly frozen?: boolean;
  dispose(): void;
  /** Sichtbare Höhe (von oben); fehlt oder `null`: der ganze Bildschirm. */
  viewHeight?(): number | null;
}

/** `Rnd` als Zahl in [0, 1). */
export function rndFloat(rnd: VbRnd): number {
  return rnd.next() / 0x1000000;
}
