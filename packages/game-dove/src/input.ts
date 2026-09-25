import type { KeyState } from "@clove/core";
import { Input } from "./sim/step";

/** Tastenbelegung des Originals (`Keyboard`, `0x4398D0`) als `KeyboardEvent.code`. */
const BINDINGS: readonly (readonly [number, readonly string[]])[] = [
  [Input.Up, ["ArrowUp", "Numpad8"]],
  [Input.Down, ["ArrowDown", "Numpad2", "Numpad5"]],
  [Input.Left, ["ArrowLeft", "Numpad4"]],
  [Input.Right, ["ArrowRight", "Numpad6"]],
  [Input.Fire, ["KeyS", "Space"]],
  [Input.Faster, ["KeyW", "KeyG"]],
  [Input.Slower, ["KeyQ", "KeyF"]],
];

export function readInput(keys: KeyState): number {
  let mask = 0;
  for (const [bit, codes] of BINDINGS) if (codes.some((c) => keys.isDown(c))) mask |= bit;
  return mask;
}
