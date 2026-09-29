/** Vibration (`AddForce`/`0x5299B0`): Plätze, Summe, Stärke des Kraftstoßes. */
import { describe, expect, test } from "bun:test";
import { RUMBLE_SLOTS, Rumble } from "../src/sim/rumble";

const one = () => 1;
const base = () => 2500;
const on = () => true;

describe("Vibration", () => {
  test("eine Quelle: Grundstärke, dann nach der Dauer aus", () => {
    const r = new Rumble();
    r.add(1, 3, 0);
    for (let t = 0; t < 3; t++) {
      r.step(one, base, on);
      expect(r.magnitude[0]).toBe(2500);
    }
    r.step(one, base, on);
    expect(r.magnitude[0]).toBe(0);
  });

  test("Summe der Stärken bis 5: linear von der Grundstärke bis 10000", () => {
    const seen: number[] = [];
    for (const n of [1, 2, 3, 4, 5, 9]) {
      const r = new Rumble();
      for (let i = 0; i < n; i++) r.add(1, 5, 0);
      r.step(one, base, on);
      seen.push(r.magnitude[0]);
    }
    expect(seen).toEqual([2500, 4375, 6250, 8125, 10000, 10000]);
  });

  test("Spieler −1 wirkt auf beide, ohne Joystick bleibt es still", () => {
    const r = new Rumble();
    r.add(5, 2, -1);
    r.step((p) => p + 1, base, on);
    expect(r.magnitude).toEqual([10000, 10000]);
    const q = new Rumble();
    q.add(5, 2, 0);
    q.step(() => 0, base, on);
    expect(q.magnitude).toEqual([0, 0]);
  });

  test("ausgeschaltet: keine Ausgabe; 21 Plätze, weitere Quellen entfallen", () => {
    const r = new Rumble();
    r.add(5, 9, 0);
    r.step(one, base, () => false);
    expect(r.magnitude[0]).toBe(0);
    const s = new Rumble();
    for (let i = 0; i < RUMBLE_SLOTS + 4; i++) s.add(1, 100, 0);
    s.step(one, base, on);
    // 21 Quellen zählen, gedeckelt bei 5
    expect(s.magnitude[0]).toBe(10000);
    s.clear();
    s.step(one, base, on);
    expect(s.magnitude[0]).toBe(0);
  });
});
