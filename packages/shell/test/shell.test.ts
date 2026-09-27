import { describe, expect, test } from "bun:test";
import { combineKeys, createPadState, padKeys, type PadSnapshot } from "../src/gamepad";
import { parseRoute } from "../src/router";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings } from "../src/settings";
import { collectSaves, restoreSaves, storageFor } from "../src/storage";
import { TEXTS } from "../src/texts";

describe("Routing", () => {
  const games = new Set(["dove"]);

  test("Launcher, Einstellungen, Spiel mit Parametern, Unbekanntes", () => {
    expect(parseRoute("", games)).toEqual({ view: "launcher" });
    expect(parseRoute("#/", games)).toEqual({ view: "launcher" });
    expect(parseRoute("#/settings", games)).toEqual({ view: "settings" });
    expect(parseRoute("#/dove/?level=1&nosound", games)).toEqual({
      view: "game",
      id: "dove",
      sub: "",
      params: { level: "1", nosound: "" },
    });
    expect(parseRoute("#/dove/debug/assets?x=1", games)).toEqual({
      view: "game",
      id: "dove",
      sub: "debug/assets",
      params: { x: "1" },
    });
    expect(parseRoute("#/dovez", games)).toEqual({ view: "unknown", path: "dovez" });
  });
});

describe("Einstellungen", () => {
  test("Ungültiges fällt auf die Vorgabe zurück, Pegel werden begrenzt", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({ language: "fr", volume: { master: 2, music: -1, sfx: "x" }, gamepad: 0 }),
    ).toEqual({ ...DEFAULT_SETTINGS, volume: { master: 1, music: 0, sfx: 1 } });
    expect(sanitizeSettings({ language: "de", volume: { music: 0.25 }, gamepad: false })).toEqual({
      language: "de",
      volume: { master: 1, music: 0.25, sfx: 1 },
      gamepad: false,
    });
  });

  test("kaputtes JSON im Speicher schadet nicht", () => {
    expect(loadSettings({ getItem: () => "{kaputt" })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});

/** `Storage`-Ersatz über eine Map. */
function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("Spielstände", () => {
  test("Export sammelt je Spiel, ohne Einstellungen", () => {
    const s = fakeStorage({
      "clove:settings": "{}",
      "clove:dove:config": "a",
      "clove:dove:highscore": "b",
      "clove:dovez:save:1": "c",
      fremd: "x",
    });
    expect(collectSaves(s)).toEqual({
      dove: { config: "a", highscore: "b" },
      dovez: { "save:1": "c" },
    });
  });

  test("Import ersetzt enthaltene Spiele vollständig und lässt andere stehen", () => {
    const s = fakeStorage({
      "clove:settings": "{}",
      "clove:dove:config": "alt",
      "clove:dove:weg": "x",
      "clove:dovez:save": "bleibt",
    });
    restoreSaves(s, { dove: { config: "neu" } });
    expect(Object.fromEntries(s.map)).toEqual({
      "clove:settings": "{}",
      "clove:dove:config": "neu",
      "clove:dovez:save": "bleibt",
    });
  });

  test("storageFor schreibt mit Präfix und überlebt fehlenden Speicher", () => {
    const s = fakeStorage();
    storageFor(s, "dove").set("config", "1");
    expect(s.map.get("clove:dove:config")).toBe("1");
    const volatile = storageFor(undefined, "dove");
    volatile.set("k", "v");
    expect(volatile.get("k")).toBe("v");
    expect(volatile.get("nix")).toBeNull();
  });
});

function pad(pressed: number[], axes: number[] = [0, 0], mapping = "standard"): PadSnapshot {
  return {
    mapping,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes,
  };
}

describe("Gamepad", () => {
  const bindings = { 0: ["Space"], 9: ["Escape", "Enter"] };

  test("Steuerkreuz, Stick mit Totzone und Belegung", () => {
    expect([...padKeys([pad([0, 12])], bindings)].toSorted()).toEqual(["ArrowUp", "Space"]);
    expect([...padKeys([pad([9], [0.6, -0.4])], bindings)].toSorted()).toEqual([
      "ArrowRight",
      "Enter",
      "Escape",
    ]);
    expect([...padKeys([pad([], [-0.5, 0.5])], bindings)].toSorted()).toEqual([
      "ArrowDown",
      "ArrowLeft",
    ]);
  });

  test("Pads ohne Standardbelegung und leere Slots werden ignoriert", () => {
    expect(padKeys([null, pad([0], [1, 1], "")], bindings).size).toBe(0);
  });

  test("träge Abfrage höchstens einmal pro Intervall", () => {
    let polls = 0;
    let t = 0;
    let pressed = [0];
    const state = createPadState(
      () => {
        polls++;
        return [pad(pressed)];
      },
      () => t,
      bindings,
      4,
    );
    expect(state.isDown("Space")).toBe(true);
    pressed = [];
    t = 3;
    expect(state.isDown("Space")).toBe(true);
    t = 4;
    expect(state.isDown("Space")).toBe(false);
    expect(polls).toBe(2);
    const both = combineKeys(state, { isDown: (c) => c === "KeyS" });
    expect(both.isDown("KeyS")).toBe(true);
    expect(both.isDown("Space")).toBe(false);
  });
});

function vars(s: string): (string | undefined)[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).toSorted();
}

describe("Texte", () => {
  test("beide Sprachen haben dieselben Schlüssel und Platzhalter", () => {
    expect(Object.keys(TEXTS.en).toSorted()).toEqual(Object.keys(TEXTS.de).toSorted());
    for (const k of Object.keys(TEXTS.de) as (keyof typeof TEXTS.de)[]) {
      expect(vars(TEXTS.en[k])).toEqual(vars(TEXTS.de[k]));
    }
  });
});
