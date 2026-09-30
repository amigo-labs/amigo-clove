import { describe, expect, test } from "bun:test";
import { PointerSteer, type PointerState } from "../src";

function pointer(p: Partial<PointerState> & { wheel?: number[] } = {}) {
  const wheel = [...(p.wheel ?? [])];
  const state = {
    active: true,
    kind: "mouse" as "mouse" | "touch",
    x: 0,
    y: 0,
    buttons: 0,
    touches: 0,
    ...p,
    takeWheel: () => wheel.shift() ?? 0,
    deactivate() {
      state.active = false;
    },
  };
  return state;
}

describe("PointerSteer", () => {
  test("Maus: Schiffsmitte unter den Zeiger, Tasten links/rechts/Mitte", () => {
    const s = new PointerSteer({ x: 20, y: 11 });
    const r = s.sample(pointer({ x: 300, y: 200, buttons: 5 }), { x: 0, y: 0 }, false);
    expect(r).toEqual({
      target: { x: 280, y: 189 },
      fire: true,
      beam: false,
      middle: true,
      wheel: 0,
    });
  });

  test("ohne Zeiger oder inaktiv: kein Ziel", () => {
    const s = new PointerSteer({ x: 0, y: 0 });
    expect(s.sample(undefined, undefined, false).target).toBeUndefined();
    expect(s.sample(pointer({ active: false }), undefined, false).target).toBeUndefined();
  });

  test("Richtungstasten legen den Zeiger still", () => {
    const s = new PointerSteer({ x: 0, y: 0 });
    const p = pointer({ x: 10, y: 10 });
    p.buttons = 1;
    expect(s.sample(p, undefined, true)).toMatchObject({ target: undefined, fire: true });
    expect(p.active).toBe(false);
  });

  test("Touch lenkt relativ zum Aufsetzpunkt, zwei Finger laden ohne Feuer", () => {
    const s = new PointerSteer({ x: 20, y: 11 });
    const p = pointer({ kind: "touch", touches: 1, x: 500, y: 300 });
    expect(s.sample(p, { x: 100, y: 100 }, false)).toMatchObject({
      target: { x: 100, y: 100 },
      fire: true,
    });
    p.x = 530;
    p.y = 280;
    expect(s.sample(p, { x: 104, y: 98 }, false).target).toEqual({ x: 130, y: 80 });
    p.touches = 2;
    expect(s.sample(p, { x: 110, y: 90 }, false)).toMatchObject({ fire: false, beam: true });
    p.touches = 0;
    expect(s.sample(p, { x: 130, y: 80 }, false).target).toBeUndefined();
    p.touches = 1;
    expect(s.sample(p, { x: 130, y: 80 }, false).target).toEqual({ x: 130, y: 80 });
  });

  test("Rad: ein Impuls je Raste, dazwischen ein Tick Pause", () => {
    const s = new PointerSteer({ x: 0, y: 0 });
    const p = pointer({ wheel: [2, 0, 0, 0, -1] });
    const pulses = Array.from({ length: 7 }, () => s.sample(p, undefined, false).wheel);
    expect(pulses).toEqual([1, 0, 1, 0, -1, 0, 0]);
  });
});
