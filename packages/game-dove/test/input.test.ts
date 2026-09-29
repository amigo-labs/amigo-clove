import { describe, expect, test } from "bun:test";
import type { KeyState, PointerState } from "@clove/core";
import { DoveInput } from "../src/input";
import { Input, targetOf } from "../src/sim";

const keys = (...down: string[]): KeyState => ({ isDown: (c) => down.includes(c) });

function mouse(x: number, y: number, buttons = 0, wheel = 0): PointerState {
  let w = wheel;
  return {
    active: true,
    kind: "mouse",
    x,
    y,
    buttons,
    touches: 0,
    takeWheel: () => {
      const n = w;
      w = 0;
      return n;
    },
    deactivate() {},
  };
}

describe("DOVE-Eingabe mit Zeiger", () => {
  test("ohne Zeiger nur Tasten", () => {
    const input = new DoveInput(keys("ArrowUp", "KeyS"), () => undefined);
    expect(input.read({ x: 100, y: 100 })).toBe(Input.Up | Input.Fire);
  });

  test("Maus: Schiffsmitte unter den Zeiger, Tasten auf Feuer/Beam/Drehen, Rad aufs Tempo", () => {
    const m = new DoveInput(keys(), () => mouse(320, 200, 1 | 2 | 4, -1)).read({ x: 0, y: 0 });
    expect(targetOf(m)).toEqual({ x: 300, y: 190 });
    expect(m & 0x1ff).toBe(Input.Fire | Input.Beam | Input.Swap | Input.Faster);
  });

  test("Richtungstasten haben Vorrang", () => {
    const m = new DoveInput(keys("ArrowLeft"), () => mouse(320, 200)).read({ x: 0, y: 0 });
    expect(targetOf(m)).toBeUndefined();
    expect(m).toBe(Input.Left);
  });
});
