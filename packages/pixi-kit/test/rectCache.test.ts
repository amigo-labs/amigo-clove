import { describe, expect, test } from "bun:test";
import { RectCache } from "../src/RectCache";

describe("RectCache", () => {
  test("Rechtecke je Schlüssel getrennt, -1 = bis zum Rand", () => {
    const c = new RectCache<string>();
    c.set("a", 0, 0, -1, -1, "ganz");
    c.set("a", 1, 2, 3, 4, "teil");
    c.set("b", 1, 2, 3, 4, "anderes Bild");
    expect(c.get("a", 0, 0, -1, -1)).toBe("ganz");
    expect(c.get("a", 1, 2, 3, 4)).toBe("teil");
    expect(c.get("b", 1, 2, 3, 4)).toBe("anderes Bild");
    expect(c.get("a", 1, 2, 4, 3)).toBeUndefined();
  });

  test("Rechtecke außerhalb von 12 Bit unter einem String", () => {
    const c = new RectCache<string>();
    c.set("a", 0.5, 0, 4, 4, "gebrochen");
    c.set("a", -1, 0, 4, 4, "negativ");
    c.set("a", 0, 0, 4095, 4, "breit");
    c.set("a", 0, 0, 4094, 4, "gepackt");
    expect(c.get("a", 0.5, 0, 4, 4)).toBe("gebrochen");
    expect(c.get("a", -1, 0, 4, 4)).toBe("negativ");
    expect(c.get("a", 0, 0, 4095, 4)).toBe("breit");
    expect(c.get("a", 0, 0, 4094, 4)).toBe("gepackt");
    expect([...c.values()].toSorted()).toEqual(["breit", "gebrochen", "gepackt", "negativ"]);
    c.clear();
    expect([...c.values()]).toEqual([]);
  });
});
