import { PointerSteer, type KeyState, type PointerState } from "@clove/core";
import { SHIP_HIT } from "./sim/constants";
import { Input, withTarget } from "./sim/step";

/** Tastenbelegung des Originals (`Keyboard`, `0x4398D0`) als `KeyboardEvent.code`. */
const BINDINGS: readonly (readonly [number, readonly string[]])[] = [
  [Input.Up, ["ArrowUp", "Numpad8"]],
  [Input.Down, ["ArrowDown", "Numpad2", "Numpad5"]],
  [Input.Left, ["ArrowLeft", "Numpad4"]],
  [Input.Right, ["ArrowRight", "Numpad6"]],
  [Input.Fire, ["KeyS", "Space"]],
  [Input.Faster, ["KeyW", "KeyG"]],
  [Input.Slower, ["KeyQ", "KeyF"]],
  [Input.Beam, ["KeyA"]],
  [Input.Swap, ["KeyD"]],
];

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
