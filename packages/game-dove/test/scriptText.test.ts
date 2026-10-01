import { describe, expect, test } from "bun:test";
import { resolveBindings } from "@clove/core";
import { KEY_LAYOUT } from "../src/keys";
import { asciiKeyName, scriptText, type BoundKeys } from "../src/scriptText";
import { SCRIPT_TEXTS } from "../src/sim/scripts";

/** Belegte Tasten einer Vorlage mit einfachen Namen (wie die Shell, ohne Sprache). */
function boundFor(preset: string): BoundKeys {
  const keys = resolveBindings(KEY_LAYOUT, { preset });
  return (a) => (keys[a] ?? []).map((code) => ({ code, name: asciiKeyName(code, true) }));
}

describe("Skripttexte mit Tastennamen", () => {
  test("mit der Original-Belegung (und ohne Shell) der Text des Originals", () => {
    for (const [i, [de, en]] of Object.entries(SCRIPT_TEXTS)) {
      expect(scriptText(Number(i), true, boundFor("arrows"))).toBe(de);
      expect(scriptText(Number(i), false, boundFor("arrows"))).toBe(en);
      expect(scriptText(Number(i), true)).toBe(de);
    }
    expect(scriptText(99, true)).toBeUndefined();
  });

  test("WASD-Vorlage: die Texte nennen die neuen Tasten", () => {
    const b = boundFor("wasd");
    expect(scriptText(1, true, b)).toBe("So, und los geht's! Du steuerst mit W, A, S und D");
    expect(scriptText(2, true, b)).toBe(
      "Uh, da kommt ein Gegner! Du schießt mit J! Mach ihn fertig!",
    );
    expect(scriptText(2, false, b)).toBe("Oh, an enemy is coming! You fire with J! Blow him away!");
    expect(scriptText(6, true, b)).toContain("mit L kannst du");
    expect(scriptText(9, true, b)).toBe("Du kannst U drücken um langsamer zu fliegen.");
    expect(scriptText(11, false, b)).toBe(
      "Hold key K down to fill up your BigShot device completely.",
    );
    // Texte ohne Tasten bleiben
    expect(scriptText(3, true, b)).toBe(SCRIPT_TEXTS[3]![0]);
  });

  test("ohne Taste auf einer Aktion bleibt der Originaltext", () => {
    expect(scriptText(2, true, () => [])).toBe(SCRIPT_TEXTS[2]![0]);
  });

  test("ASCII-Namen für die 8-px-Schrift", () => {
    expect(
      ["KeyJ", "ArrowUp", "Space", "Numpad4", "Digit3"].map((c) => asciiKeyName(c, true)),
    ).toEqual(["J", "Hoch", "Leertaste", "Num 4", "3"]);
    expect(asciiKeyName("ArrowLeft", false)).toBe("Left");
  });
});
