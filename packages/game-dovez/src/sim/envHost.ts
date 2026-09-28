import type { Beam } from "./beam";
import type { Effects } from "./effects";
import type { Enemies } from "./enemies";
import type { EnvList, EnvSlot } from "./envDraw";
import type { Player } from "./player";
import type { VbRnd } from "./vb";
import type { Force, Particle } from "./weapons";

/** Schnittstellen der Umgebungseffekte (`environment.ts`, `special.ts`) zur Welt. */

/** Tastenhinweis (`SpielSpezial` Typ 1): Aktion (Tabellenindex) und Grauwert 0…248. */
export interface Hint {
  readonly action: number;
  readonly grey: number;
}

/** Was die Umgebung von der Welt braucht. */
export interface EnvWorld {
  /** `Me.584`, vom Spezialablauf 6 umgesetzt. */
  tick: number;
  readonly levelLength: number;
  readonly rnd: VbRnd;
  readonly fx: Effects;
  readonly players: readonly Player[];
  readonly playersMinus1: number;
  /** Tempo der Ebene 0 (Bild-Scrollen). */
  readonly layer0Speed: number;
  /** `Me.7CC` und `Me.7C8`. */
  background: number;
  backgroundX: number;
  readonly nova: boolean;
  /** `Me.508` (a, Glühen) und `Me.506` (b, Unschärfe) mit ihren Alphas `Me.1288.758/75C`. */
  readonly overlays: { a: boolean; b: boolean; alphaA: number; alphaB: number };
  /** Checkpoint-Blitz: ausgelöst (`Me.CFC`), Alpha (`Me.CE8`) und Schritt (`Me.CEC`). */
  readonly checkpoint: { triggered: boolean; flashAlpha: number; flashStep: number };
  /** `Me.50C`: in diesem Tick das Standbild erfassen (Checkpoint, Todesende). */
  readonly stillCapture: boolean;
  readonly enemies: Enemies;
  readonly beams: readonly Beam[];
  readonly force: Force;
  readonly particles: readonly Particle[];
  /** Taste F11 (Hupe, `[0x588300 + 0x57]`). */
  readonly horn: boolean;
  spriteSize(key: string): { w: number; h: number } | undefined;
  terrain(x1: number, y1: number, x2: number, y2: number): boolean;
  sound(name: string, rate?: number): void;
  loop(name: string, on: boolean): void;
  /** `SaveCheckpoint(0)` (Ende der Tutorial-Startsequenz). */
  saveCheckpoint(): void;
}

/** `Me.1138…0x1154`: aktiv, Typ, Parameter `1140…114C`, Zähler `1150`, „neu“ `1154`. */
export interface SpecialState {
  active: boolean;
  type: number;
  /** `Me.1140`, `1144`, `1148`, `114C`. */
  p: number[];
  counter: number;
  fresh: boolean;
}

export const newSpecial = (): SpecialState => ({
  active: false,
  type: 0,
  p: [0, 0, 0, 0],
  counter: 0,
  fresh: false,
});

/** Was die Spezialabläufe von der Umgebung brauchen. */
export interface SpecialEnv {
  readonly w: EnvWorld;
  readonly special: SpecialState;
  readonly lists: Record<EnvSlot, EnvList>;
  readonly soundOn: boolean;
  hint: Hint | undefined;
  captureBlur: boolean;
  noise: number;
  blenden(): void;
}
