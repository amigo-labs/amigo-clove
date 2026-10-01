import { describe, expect, test } from "bun:test";
import {
  CUSTOM_PRESET,
  bindKeys,
  keyIssues,
  navigationKeys,
  originalKeys,
  presetOf,
  resolveBindings,
  withExtraKeys,
  type KeyAction,
  type KeyLayout,
} from "../src";

const label = { de: "x", en: "x", ru: "x" };
const ACTIONS: readonly KeyAction[] = [
  { id: "left", label, codes: ["ArrowLeft", "Numpad4"], group: "move", nav: "left" },
  { id: "fire", label, codes: ["KeyS", "Space"], group: "weapon", nav: "ok" },
  { id: "beam", label, codes: ["KeyA"], group: "weapon" },
];
const LAYOUT: KeyLayout = {
  actions: ACTIONS,
  presets: [
    { id: "arrows", label, keys: originalKeys(ACTIONS) },
    { id: "wasd", label, keys: { left: ["KeyA"], fire: ["KeyJ", "Space"], beam: ["KeyK"] } },
  ],
};
const held = (...down: string[]) => ({ isDown: (c: string) => down.includes(c) });

describe("Tastenbelegung", () => {
  test("das Spiel sieht seine Codes, wenn eine belegte Taste gehalten ist", () => {
    const wasd = resolveBindings(LAYOUT, { preset: "wasd" });
    const kb = (...down: string[]) => bindKeys(held(...down), ACTIONS, () => wasd);
    // A ist jetzt links: das Spiel fragt nach ArrowLeft bzw. Numpad4
    expect([kb("KeyA").isDown("ArrowLeft"), kb("KeyA").isDown("Numpad4")]).toEqual([true, true]);
    // die Originaltaste von Beam (A) löst Beam nicht mehr aus, K schon
    expect(kb("KeyA").isDown("KeyA")).toBe(false);
    expect(kb("KeyK").isDown("KeyA")).toBe(true);
    // Pfeile sind frei
    expect(kb("ArrowLeft").isDown("ArrowLeft")).toBe(false);
    // Codes ohne Aktion gehen durch
    expect([kb("Escape").isDown("Escape"), kb("Enter").isDown("Enter")]).toEqual([true, true]);
  });

  test("die Belegung wird live gelesen", () => {
    let keys = resolveBindings(LAYOUT);
    const kb = bindKeys(held("KeyJ"), ACTIONS, () => keys);
    expect(kb.isDown("KeyS")).toBe(false);
    keys = resolveBindings(LAYOUT, { preset: "wasd" });
    expect(kb.isDown("KeyS")).toBe(true);
  });

  test("Vorlagen, eigene Tasten und Vorgabe", () => {
    expect(resolveBindings(LAYOUT)).toBe(LAYOUT.presets[0]!.keys);
    expect(resolveBindings(LAYOUT, { preset: "gibtsnicht" })).toBe(LAYOUT.presets[0]!.keys);
    const custom = resolveBindings(LAYOUT, {
      preset: CUSTOM_PRESET,
      keys: { fire: ["KeyX", "KeyX", "", "KeyY", "KeyZ", "KeyQ"] },
    });
    expect(custom).toEqual({
      left: ["ArrowLeft", "Numpad4"],
      fire: ["KeyX", "KeyY", "KeyZ"],
      beam: ["KeyA"],
    });
    expect(presetOf(LAYOUT, custom)).toBe(CUSTOM_PRESET);
    expect(
      presetOf(LAYOUT, { left: ["Numpad4", "ArrowLeft"], fire: ["Space", "KeyS"], beam: ["KeyA"] }),
    ).toBe("arrows");
  });

  test("fehlende und doppelte Tasten", () => {
    const issues = keyIssues(ACTIONS, { left: ["KeyA"], fire: [], beam: ["KeyA"] });
    expect(issues.missing).toEqual(["fire"]);
    expect([...issues.duplicates]).toEqual([["KeyA", ["left", "beam"]]]);
  });

  test("Navigation der Bildschirme folgt der Belegung", () => {
    const nav = navigationKeys(ACTIONS, resolveBindings(LAYOUT, { preset: "wasd" }));
    expect([...nav]).toEqual([
      ["KeyA", "left"],
      ["KeyJ", "ok"],
      ["Space", "ok"],
    ]);
  });

  test("alte zweite Tasten: Original plus Zusatztaste, sonst nichts", () => {
    expect(withExtraKeys(LAYOUT, {})).toBeUndefined();
    expect(withExtraKeys(LAYOUT, { fire: "KeyS" })).toBeUndefined();
    expect(withExtraKeys(LAYOUT, { beam: "KeyB" })).toEqual({
      preset: CUSTOM_PRESET,
      keys: { left: ["ArrowLeft", "Numpad4"], fire: ["KeyS", "Space"], beam: ["KeyA", "KeyB"] },
    });
  });
});
