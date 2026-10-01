import { describe, expect, test } from "bun:test";
import { translator } from "@clove/core";
import { DOVE_CONTROLS, DOVE_GAMEPAD } from "@clove/game-dove/controls";
import { DOVEZ_GAMEPAD, DOVEZ_PADS, dovezControls } from "@clove/game-dovez/controls";
import { controlsTables, padButtons } from "../src/controls";
import { combineKeys, createPadState, padKeys, type PadSnapshot } from "../src/gamepad";
import { hudLayout } from "../src/hud";
import { keyName, withSecondKeys } from "../src/keymap";
import { parseRoute } from "../src/router";
import { DEFAULT_SETTINGS, loadSettings, reducedMotion, sanitizeSettings } from "../src/settings";
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
      ...DEFAULT_SETTINGS,
      language: "de",
      volume: { master: 1, music: 0.25, sfx: 1 },
      gamepad: false,
      motion: "auto",
    });
    expect(sanitizeSettings({ motion: "reduce" }).motion).toBe("reduce");
    expect(sanitizeSettings({ motion: "viel" }).motion).toBe("auto");
    expect(sanitizeSettings({ scale: "smooth", scanlines: true })).toMatchObject({
      scale: "smooth",
      scanlines: true,
    });
    expect(sanitizeSettings({}).hud).toBe("modern");
    expect(sanitizeSettings({ hud: "original", pointer: false })).toMatchObject({
      hud: "original",
      pointer: false,
    });
    expect(sanitizeSettings({ hud: "bunt" }).hud).toBe("modern");
    expect(sanitizeSettings({ scale: "riesig", scanlines: "ja" })).toMatchObject({
      scale: "fit",
      scanlines: false,
    });
  });

  test("bewegungsarm: fest an oder aus, sonst nach dem System", () => {
    expect(reducedMotion("reduce", false)).toBe(true);
    expect(reducedMotion("full", true)).toBe(false);
    expect(reducedMotion("auto", true)).toBe(true);
    expect(reducedMotion("auto", false)).toBe(false);
    expect(sanitizeSettings({ language: "ru" }).language).toBe("ru");
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

const rect = (x: number, y: number, w: number, hh: number) => ({ x, y, w, h: hh, px: 1 });

describe("HUD-Layout", () => {
  test("neben dem Spielfeld, darunter oder darin — nach dem freien Platz", () => {
    expect(hudLayout(rect(320, 155, 640, 410), 1280, 720)).toBe("side");
    expect(hudLayout(rect(0, 35, 640, 410), 640, 480)).toBe("inside");
    expect(hudLayout(rect(0, 0, 640, 410), 640, 600)).toBe("below");
  });
});

const held = (...down: string[]) => ({ isDown: (c: string) => down.includes(c) });

describe("Zweite Tasten", () => {
  const actions = [
    { id: "fire", label: { de: "Feuer", en: "Fire", ru: "Огонь" }, codes: ["KeyS", "Space"] },
    { id: "beam", label: { de: "Beam", en: "Beam", ru: "Луч" }, codes: ["KeyA"] },
  ];

  test("die zweite Taste hält alle Originaltasten der Aktion, die Originale bleiben", () => {
    const kb = withSecondKeys(held("KeyX"), actions, () => ({ fire: "KeyX" }));
    expect([kb.isDown("KeyS"), kb.isDown("Space"), kb.isDown("KeyA")]).toEqual([true, true, false]);
    expect(withSecondKeys(held("KeyS"), actions, () => ({ fire: "KeyX" })).isDown("KeyS")).toBe(
      true,
    );
    expect(withSecondKeys(held("KeyX"), actions, () => undefined).isDown("KeyS")).toBe(false);
  });

  test("Einstellungen: nur gültige Codes, Tastennamen kurz", () => {
    expect(
      sanitizeSettings({ keymap: { dove: { fire: "KeyX", beam: "<b>", "x y": "KeyA" }, "": {} } })
        .keymap,
    ).toEqual({ dove: { fire: "KeyX" } });
    expect(["KeyA", "Digit3", "Numpad4", "ArrowUp", "F5"].map(keyName)).toEqual([
      "A",
      "3",
      "Num 4",
      "↑",
      "F5",
    ]);
  });
});

describe("Pad-Belegung je Spieler", () => {
  test("das zweite Pad nutzt seine eigene Belegung, das erste die gemeinsame", () => {
    const layouts = [
      undefined,
      {
        buttons: { 0: ["End"] },
        directions: ["Numpad8", "Numpad5", "Numpad4", "Numpad6"] as const,
      },
    ];
    const both = padKeys([pad([0], [-1, 0]), pad([0, 12], [1, 0])], { 0: ["KeyS"] }, layouts);
    expect([...both].toSorted()).toEqual(["ArrowLeft", "End", "KeyS", "Numpad6", "Numpad8"]);
  });
});

describe("Tastenübersicht", () => {
  const t = translator(TEXTS, "de");
  const base = { t, locale: "de" as const, showPad: true, showPointer: true };

  test("Pad-Tasten aus der Belegung: Steuerkreuz zuerst, mehrere Tasten je Aktion", () => {
    expect(padButtons(["KeyS", "Space"], DOVE_GAMEPAD)).toEqual(["A"]);
    expect(padButtons(["Escape"], DOVE_GAMEPAD)).toEqual(["Back", "Start"]);
    expect(padButtons(["ArrowUp", "Numpad8"], DOVE_GAMEPAD)).toEqual(["✚ ↑"]);
    expect(padButtons(["KeyJ"], DOVE_GAMEPAD)).toEqual([]);
  });

  test("DOVE: Tastennamen, zweite Taste aus den Einstellungen, Maus", () => {
    const [table] = controlsTables(DOVE_CONTROLS, {
      ...base,
      gamepad: DOVE_GAMEPAD,
      second: { fire: "KeyK" },
    });
    expect(table?.pad).toBe(true);
    expect(table?.pointer).toBe(true);
    const fire = table?.lines.find((l) => l.action === "Feuer");
    expect(fire).toEqual({
      action: "Feuer",
      keys: ["S", "Leertaste", "K"],
      pad: ["A"],
      pointer: "linke Taste",
    });
    expect(table?.lines.at(-1)).toMatchObject({ keys: ["Esc"], pad: ["Back", "Start"] });
  });

  test("ausgeschaltete Geräte und leere Spalten entfallen", () => {
    const [table] = controlsTables(DOVE_CONTROLS, {
      ...base,
      gamepad: DOVE_GAMEPAD,
      showPad: false,
      showPointer: false,
    });
    expect(table).toMatchObject({ pad: false, pointer: false });
    expect(table?.lines.every((l) => l.pad.length === 0 && l.pointer === "")).toBe(true);
    const [noPad] = controlsTables(DOVE_CONTROLS, base);
    expect(noPad?.pad).toBe(false);
  });

  test("DoveZ zu zweit: Spieler 2 mit eigenem Pad und Ziffernblock, ohne Maus", () => {
    const [p1, p2] = controlsTables(dovezControls(2), {
      ...base,
      gamepad: DOVEZ_GAMEPAD,
      pads: DOVEZ_PADS,
    });
    expect(p1?.label).toBe("Spieler 1");
    expect(p1?.lines[0]).toMatchObject({ keys: ["J", "←"], pad: ["✚ ←"] });
    expect(p2?.label).toBe("Spieler 2");
    expect(p2?.pointer).toBe(false);
    expect(p2?.lines[0]).toMatchObject({ keys: ["Num 4"], pad: ["✚ ←"] });
    expect(p2?.lines[4]).toMatchObject({ keys: ["End"], pad: ["A"] });
  });
});
