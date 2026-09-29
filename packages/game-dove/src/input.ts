import { PointerSteer, type KeyState, type PointerState } from "@clove/core";
import { KEY_ACTIONS, type KeyActionId } from "./keys";
import { SHIP_HIT } from "./sim/constants";
import { Input, withTarget } from "./sim/step";

const BITS: Readonly<Record<KeyActionId, number>> = {
  up: Input.Up,
  down: Input.Down,
  left: Input.Left,
  right: Input.Right,
  fire: Input.Fire,
  beam: Input.Beam,
  swap: Input.Swap,
  faster: Input.Faster,
  slower: Input.Slower,
};

/** Tastenbelegung des Originals (`Keyboard`, `0x4398D0`) als `KeyboardEvent.code`. */
const BINDINGS = KEY_ACTIONS.map((a) => [BITS[a.id], a.codes] as const);

const DIRECTIONS = Input.Up | Input.Down | Input.Left | Input.Right;

export function readInput(keys: KeyState): number {
  let mask = 0;
  for (const [bit, codes] of BINDINGS) if (codes.some((c) => keys.isDown(c))) mask |= bit;
  return mask;
}

/**
 * Tastatur plus Zeiger (Erweiterung): die Maus lenkt die Schiffsmitte auf den
 * Zeiger, links Feuer, rechts Beam, Mitte Extrawaffe drehen, Rad Tempo.
 * Touch zieht das Schiff relativ, ein Finger feuert, zwei laden den Beam.
 */
export class DoveInput {
  private readonly steer = new PointerSteer({
    x: SHIP_HIT.w >> 1,
    y: SHIP_HIT.dy + (SHIP_HIT.h >> 1),
  });

  constructor(
    private readonly keys: KeyState,
    private readonly pointer: () => PointerState | undefined,
  ) {}

  read(ship: { readonly x: number; readonly y: number }): number {
    const mask = readInput(this.keys);
    const p = this.steer.sample(this.pointer(), ship, (mask & DIRECTIONS) !== 0);
    let buttons = mask;
    if (p.fire) buttons |= Input.Fire;
    if (p.beam) buttons |= Input.Beam;
    if (p.middle) buttons |= Input.Swap;
    if (p.wheel < 0) buttons |= Input.Faster;
    if (p.wheel > 0) buttons |= Input.Slower;
    return p.target ? withTarget(buttons, p.target.x, p.target.y) : buttons;
  }
}
