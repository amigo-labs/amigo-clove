import type { PointerState } from "../shell/GameModule";

/** Was der Zeiger in einem Tick will, in Begriffen der Spiele. */
export interface PointerSample {
  /** Ziel für den Bezugspunkt des Schiffs (logische Pixel); fehlt, wenn Tasten steuern. */
  readonly target: { readonly x: number; readonly y: number } | undefined;
  /** Linke Maustaste bzw. genau ein Finger (Dauerfeuer beim Ziehen). */
  readonly fire: boolean;
  /** Rechte Maustaste bzw. ein zweiter Finger. */
  readonly beam: boolean;
  readonly middle: boolean;
  /** Rad-Impuls dieses Ticks; zwischen zwei Impulsen liegt immer ein Tick ohne (Tastenkante). */
  readonly wheel: -1 | 0 | 1;
}

const IDLE: PointerSample = {
  target: undefined,
  fire: false,
  beam: false,
  middle: false,
  wheel: 0,
};

/**
 * Übersetzt den Zeiger der Shell einmal pro Tick in Ziel und Tasten.
 *
 * Maus: das Schiff fährt so, dass `grip` (Schiffsmitte relativ zum Bezugspunkt)
 * unter dem Zeiger liegt. Touch lenkt relativ: Ziel ist die Schiffsposition beim
 * Aufsetzen plus der Fingerweg, so verdeckt der Finger das Schiff nicht.
 * Solange Richtungstasten gehalten werden, ruht der Zeiger bis zur nächsten Bewegung.
 */
export class PointerSteer {
  private anchor: { px: number; py: number; sx: number; sy: number } | undefined;
  private pendingWheel = 0;
  private pulsed = false;

  constructor(private readonly grip: { readonly x: number; readonly y: number }) {}

  sample(
    pointer: PointerState | undefined,
    ship: { readonly x: number; readonly y: number } | undefined,
    keysSteer: boolean,
  ): PointerSample {
    if (!pointer) return IDLE;
    if (keysSteer && pointer.active) pointer.deactivate();
    this.pendingWheel += pointer.takeWheel();
    const wheel = this.wheelPulse();
    if (pointer.kind === "mouse") {
      this.anchor = undefined;
      // Maustasten zählen immer (auch zu Pfeiltasten), das Ziel nur, solange die Maus lenkt
      return {
        target:
          keysSteer || !pointer.active
            ? undefined
            : { x: pointer.x - this.grip.x, y: pointer.y - this.grip.y },
        fire: (pointer.buttons & 1) !== 0,
        beam: (pointer.buttons & 2) !== 0,
        middle: (pointer.buttons & 4) !== 0,
        wheel,
      };
    }
    if (keysSteer || !pointer.active) {
      this.anchor = undefined;
      return wheel === 0 ? IDLE : { ...IDLE, wheel };
    }
    if (pointer.touches === 0 || !ship) {
      this.anchor = undefined;
      return { ...IDLE, wheel };
    }
    this.anchor ??= { px: pointer.x, py: pointer.y, sx: ship.x, sy: ship.y };
    const a = this.anchor;
    return {
      target: { x: a.sx + pointer.x - a.px, y: a.sy + pointer.y - a.py },
      // Feuer hielte den geladenen Beam nicht: mit zwei Fingern wird nur geladen
      fire: pointer.touches === 1,
      beam: pointer.touches >= 2,
      middle: false,
      wheel,
    };
  }

  private wheelPulse(): -1 | 0 | 1 {
    if (this.pulsed || this.pendingWheel === 0) {
      this.pulsed = false;
      return 0;
    }
    const dir = this.pendingWheel > 0 ? 1 : -1;
    this.pendingWheel -= dir;
    this.pulsed = true;
    return dir;
  }
}
