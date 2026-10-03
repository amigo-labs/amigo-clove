import { describe, expect, test } from "bun:test";
import { resolveBindings, translator } from "@clove/core";
import { DOVE_CONTROLS, DOVE_GAMEPAD } from "@clove/game-dove/controls";
import { KEY_LAYOUT as DOVE_KEYS } from "@clove/game-dove/keys";
import { DOVEZ_GAMEPAD, DOVEZ_PADS, dovezControls } from "@clove/game-dovez/controls";
import { controlsTables, padButtons } from "../src/controls";
import { combineKeys, createPadState, padKeys, type PadSnapshot } from "../src/gamepad";
import { hudLayout } from "../src/hud";
import { keyName } from "../src/keymap";
import { parseRoute } from "../src/router";
import { DEFAULT_SETTINGS, loadSettings, reducedMotion, sanitizeSettings } from "../src/settings";
import { collectSaves, restoreSaves, storageFor } from "../src/storage";
import { TEXTS } from "../src/texts";
import { NavEdges, SecretMatcher, gateKeys, moveIndex } from "../src/ui/model";

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
    ).toEqual({ ...DEFAULT_SETTINGS, volume: { master: 1, music: 0, sfx: 1, voice: 1 } });
    expect(sanitizeSettings({ language: "de", volume: { music: 0.25 }, gamepad: false })).toEqual({
      ...DEFAULT_SETTINGS,
      language: "de",
      volume: { master: 1, music: 0.25, sfx: 1, voice: 1 },
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
    expect(sanitizeSettings({}).resolution).toBe("original");
    expect(sanitizeSettings({ resolution: "xbr" }).resolution).toBe("xbr");
    expect(sanitizeSettings({ resolution: "hd" }).resolution).toBe("hd");
    expect(sanitizeSettings({ resolution: "8k" }).resolution).toBe("original");
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

describe("Tastenbelegung in den Einstellungen", () => {
  test("Vorlage oder eigene Tasten; Ungültiges fällt weg", () => {
    const s = sanitizeSettings({
      keybindings: {
        dove: { preset: "wasd" },
        dovez: { preset: "custom", keys: { fire: ["KeyX", "<b>", "KeyX", 3], "x y": ["KeyA"] } },
        "": { preset: "arrows" },
        bad: { preset: "<script>" },
      },
    });
    expect(s.keybindings).toEqual({
      dove: { preset: "wasd" },
      dovez: { preset: "custom", keys: { fire: ["KeyX"] } },
    });
  });

  test("alte zweite Tasten werden zur eigenen Belegung (Original plus Taste)", () => {
    const s = sanitizeSettings(
      { keymap: { dove: { fire: "KeyX", beam: "<b>" }, other: { fire: "KeyY" } } },
      { dove: DOVE_KEYS },
    );
    expect(s.keybindings["dove"]?.preset).toBe("custom");
    const keys = resolveBindings(DOVE_KEYS, s.keybindings["dove"]);
    expect(keys["fire"]).toEqual(["KeyS", "Space", "KeyX"]);
    expect(keys["beam"]).toEqual(["KeyA"]);
    expect(s.keybindings["other"]).toBeUndefined();
    // eine neue Belegung gewinnt gegen die alte
    expect(
      sanitizeSettings(
        { keymap: { dove: { fire: "KeyX" } }, keybindings: { dove: { preset: "wasd" } } },
        { dove: DOVE_KEYS },
      ).keybindings["dove"],
    ).toEqual({ preset: "wasd" });
  });

  test("Tastennamen kurz", () => {
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

  test("DOVE: Tastennamen aus der Belegung, Pad aus den Codes des Spiels, Maus", () => {
    const [table] = controlsTables(DOVE_CONTROLS, {
      ...base,
      gamepad: DOVE_GAMEPAD,
      bindings: { ...resolveBindings(DOVE_KEYS), fire: ["KeyS", "Space", "KeyK"] },
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
    const [wasd] = controlsTables(DOVE_CONTROLS, {
      ...base,
      gamepad: DOVE_GAMEPAD,
      bindings: resolveBindings(DOVE_KEYS, { preset: "wasd" }),
    });
    expect(wasd?.lines.find((l) => l.action === "Feuer")).toMatchObject({
      keys: ["J", "Leertaste"],
      pad: ["A"],
    });
    expect(wasd?.lines.find((l) => l.action === "Hoch")).toMatchObject({
      keys: ["W"],
      pad: ["✚ ↑"],
    });
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
    expect(p1?.lines[0]).toMatchObject({ keys: ["←", "J"], pad: ["✚ ←"] });
    expect(p2?.label).toBe("Spieler 2");
    expect(p2?.pointer).toBe(false);
    expect(p2?.lines[0]).toMatchObject({ keys: ["Num 4"], pad: ["✚ ←"] });
    expect(p2?.lines[4]).toMatchObject({ keys: ["End"], pad: ["A"] });
  });
});

describe("HTML-Bildschirme", () => {
  test("Tastensperre: offen sieht das Spiel nichts, danach erst nach dem Loslassen", () => {
    const pressed = new Set<string>(["Enter"]);
    let state = { open: true, generation: 1 };
    const keys = gateKeys({ isDown: (c) => pressed.has(c) }, () => state);
    expect(keys.isDown("Enter")).toBe(false);
    state = { open: false, generation: 1 };
    // Enter wählte „Weiter“ und ist noch gedrückt
    expect(keys.isDown("Enter")).toBe(false);
    pressed.delete("Enter");
    expect(keys.isDown("Enter")).toBe(false);
    pressed.add("Enter");
    expect(keys.isDown("Enter")).toBe(true);
    // eine neu gedrückte Taste gilt, sobald sie einmal losgelassen abgefragt wurde
    expect(keys.isDown("KeyS")).toBe(false);
    pressed.add("KeyS");
    expect(keys.isDown("KeyS")).toBe(true);
    // nächster Bildschirm: wieder alles gesperrt bis zum Loslassen
    state = { open: false, generation: 2 };
    expect(keys.isDown("KeyS")).toBe(false);
  });

  test("ohne je geöffneten Bildschirm gelten Tasten sofort", () => {
    const keys = gateKeys({ isDown: (c) => c === "KeyS" }, () => ({ open: false, generation: 0 }));
    expect(keys.isDown("KeyS")).toBe(true);
  });

  test("Navigation in Liste und Raster, umlaufend", () => {
    expect(moveIndex(-1, 3, "down")).toBe(0);
    expect(moveIndex(-1, 3, "up")).toBe(2);
    expect(moveIndex(2, 3, "down")).toBe(0);
    expect(moveIndex(0, 3, "left")).toBe(0);
    // 3 Spalten × 3 Zeilen
    expect(moveIndex(1, 9, "down", 3)).toBe(4);
    expect(moveIndex(4, 9, "right", 3)).toBe(5);
    expect(moveIndex(0, 9, "up", 3)).toBe(6);
    expect(moveIndex(0, 0, "down")).toBe(-1);
  });

  test("Tippfolge und Kanten von Pad/Touch", () => {
    const secret = new SecretMatcher({ lov: "love" });
    expect(["x", "L", "o"].map((c) => secret.feed(c))).toEqual([undefined, undefined, undefined]);
    expect(secret.feed("v")).toBe("love");
    expect(secret.feed("v")).toBeUndefined();
    const edges = new NavEdges();
    expect(edges.next(new Set(["ArrowDown"]))).toEqual(["down"]);
    expect(edges.next(new Set(["ArrowDown", "Enter"]))).toEqual(["ok"]);
    expect(edges.next(new Set())).toEqual([]);
    expect(edges.next(new Set(["Escape", "KeyQ"]))).toEqual(["back"]);
  });
});
