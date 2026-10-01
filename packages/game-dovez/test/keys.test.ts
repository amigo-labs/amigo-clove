/** Tastenbelegung (`InitKeyConfig`, `Taste`, `KeyName`, `GetKeyText`) und ihre Konfiguration. */
import { describe, expect, test } from "bun:test";
import { bindKeys, keyIssues, resolveBindings, withExtraKeys, type GameHost } from "@clove/core";
import { dovezAllControls, dovezControls } from "../src/controls";
import { DEFAULT_CONFIG, parseConfig } from "../src/game/config";
import {
  ACTIONS,
  DEFAULT_KEYS,
  DIK,
  keyLabel,
  keyName,
  PointerControl,
  readInput,
} from "../src/game/input";
import { KEY_ACTIONS, KEY_LAYOUT, legacyExtraKeys } from "../src/keys";
import { NO_INPUT } from "../src/sim/player";

const host = (...down: string[]): GameHost =>
  ({ keys: { isDown: (c: string) => down.includes(c), held: () => down } }) as unknown as GameHost;

/** Eingabe von Satz `set` mit der Vorlage WASD, eine Taste gehalten. */
const at = (code: string, set = 0) => readInput(bound("wasd", code), set);

/** Tastatur mit der Belegung der Shell (Vorlage `preset`). */
const bound = (preset: string, ...down: string[]): GameHost =>
  ({
    keys: bindKeys({ isDown: (c: string) => down.includes(c) }, KEY_ACTIONS, () =>
      resolveBindings(KEY_LAYOUT, { preset }),
    ),
  }) as unknown as GameHost;

describe("Tastenbelegung", () => {
  test("Vorgabe: Einzelspiel mit Pfeilen, S/Leertaste, A, D, Q, W, E; F11 hupt", () => {
    expect(readInput(host("ArrowLeft"))).toMatchObject({ left: true, right: false });
    expect(readInput(host("KeyS")).fire).toBe(true);
    expect(readInput(host("Space")).fire).toBe(true);
    expect(readInput(host("KeyA")).beam).toBe(true);
    expect(readInput(host("KeyD")).switchWeapon).toBe(true);
    expect(readInput(host("KeyQ")).switchBeam).toBe(true);
    expect(readInput(host("KeyW")).rotate).toBe(true);
    expect(readInput(host("KeyE")).nova).toBe(true);
    expect(readInput(host("F11")).horn).toBe(true);
    // IJKL gehört zum ersten Spieler im Zwei-Spieler-Spiel
    expect(readInput(host("KeyJ")).left).toBe(false);
    expect(readInput(host("KeyJ"), 1).left).toBe(true);
  });

  test("das Spiel fragt nur die festen Tasten: Satz 1 IJKL, Satz 2 Ziffernblock", () => {
    expect(readInput(host("KeyI"), 1).up).toBe(true);
    expect(readInput(host("ArrowUp"), 1).up).toBe(false);
    expect(readInput(host("Numpad5"), 2).down).toBe(true);
    expect(readInput(host("Numpad2"), 2).down).toBe(false);
    expect(readInput(host("End"), 2).fire).toBe(true);
    expect(readInput(host("PageUp"), 2).nova).toBe(true);
    expect(readInput(host("KeyS"), 2).fire).toBe(false);
  });

  test("Vorlage Original: Pfeile in beiden Sätzen von Spieler 1, Num 2 für Spieler 2", () => {
    expect(readInput(bound("arrows", "ArrowUp"), 1).up).toBe(true);
    expect(readInput(bound("arrows", "ArrowUp")).up).toBe(true);
    expect(readInput(bound("arrows", "Space")).fire).toBe(true);
    expect(readInput(bound("arrows", "KeyE")).nova).toBe(true);
    expect(readInput(bound("arrows", "Numpad2"), 2).down).toBe(true);
    expect(readInput(bound("arrows", "Numpad5"), 2).down).toBe(true);
    expect(readInput(bound("arrows", "F11")).horn).toBe(true);
  });

  test("Vorlage WASD: links bewegen, rechts J K L / U I O; Pfeile wirken nicht mehr", () => {
    expect(at("KeyD")).toMatchObject({ right: true, switchWeapon: false });
    expect(at("KeyA")).toMatchObject({ left: true, beam: false });
    expect(at("KeyS")).toMatchObject({ down: true, fire: false });
    expect(at("KeyW")).toMatchObject({ up: true, rotate: false });
    expect(at("KeyJ")).toMatchObject({ fire: true, left: false });
    expect(at("KeyJ", 1)).toMatchObject({ fire: true, left: false });
    expect(at("Space").fire).toBe(true);
    expect(at("KeyK").beam).toBe(true);
    expect(at("KeyL").switchWeapon).toBe(true);
    expect(at("KeyU").switchBeam).toBe(true);
    expect(at("KeyI")).toMatchObject({ rotate: true, up: false });
    expect(at("KeyI", 1)).toMatchObject({ rotate: true, up: false });
    expect(at("KeyO").nova).toBe(true);
    expect(at("ArrowRight").right).toBe(false);
    expect(at("End", 2).fire).toBe(true);
    expect(keyIssues(KEY_ACTIONS, resolveBindings(KEY_LAYOUT, { preset: "wasd" }))).toEqual({
      missing: [],
      duplicates: new Map(),
    });
  });

  test("alte zweite Tasten werden zur eigenen Belegung", () => {
    const keys = [...DEFAULT_KEYS];
    keys[4] = "KeyY";
    keys[24] = "KeyX";
    expect(legacyExtraKeys(keys)).toEqual({ fire: "KeyY", fire2: "KeyX" });
    const stored = withExtraKeys(KEY_LAYOUT, legacyExtraKeys(keys));
    expect(stored?.preset).toBe("custom");
    expect(stored?.keys?.["fire"]).toEqual(["KeyS", "Space", "KeyY"]);
    expect(withExtraKeys(KEY_LAYOUT, legacyExtraKeys(DEFAULT_KEYS))).toBeUndefined();
    expect(readInput(host("KeyY"), 0).fire).toBe(false);
  });

  test("KeyName: Namen des Originals, deutsche Belegung, sonst die Nummer", () => {
    expect(keyName("KeyS")).toBe("S");
    // DIK 0x15 (US „Y“) trägt im Original die Beschriftung „Z“
    expect(keyName("KeyY")).toBe("Z");
    expect(keyName("KeyZ")).toBe("Y");
    expect(keyName("Numpad4")).toBe("Num. 4");
    expect(keyName("ArrowLeft")).toBe("Left");
    expect(keyName("Home")).toBe("Pos 1");
    expect(keyName("Delete")).toBe("Entf.");
    expect(keyName("F1")).toBe("59");
    expect(keyName("Nix")).toBe("");
    expect(DIK.Escape).toBe(1);
  });

  test("Tastenhinweis: erste belegte Taste der Shell, sonst der Originalname", () => {
    expect(keyLabel(host(), 4)).toBe("S");
    expect(keyLabel(host(), 0, 2)).toBe("Num. 4");
    const named = {
      boundKeys: (a: string) =>
        a === "fire"
          ? [{ code: "KeyJ", name: "J" }]
          : a === "fire2"
            ? [{ code: "End", name: "Ende" }]
            : [],
    } as unknown as GameHost;
    expect(keyLabel(named, 4)).toBe("J");
    expect(keyLabel(named, 4, 2)).toBe("Ende");
    expect(keyLabel(named, 5)).toBe("A");
  });

  test("Konfiguration: Belegung wird gelesen, ungültige Werte fallen auf die Vorgabe", () => {
    const keys = [...DEFAULT_KEYS];
    keys[0] = "KeyY";
    const c = parseConfig(JSON.stringify({ ...DEFAULT_CONFIG, keys }));
    expect(c.keys[0]).toBe("KeyY");
    expect(parseConfig(JSON.stringify({ keys: ["x"] })).keys).toEqual(DEFAULT_KEYS);
    expect(parseConfig(JSON.stringify({ keys: keys.map(() => "Kaputt") })).keys).toEqual(
      DEFAULT_KEYS,
    );
    expect(parseConfig(null).keys).toEqual(DEFAULT_KEYS);
  });
});

const withMouse = (buttons: number, wheel = 0, ...down: string[]): GameHost => {
  let w = wheel;
  return {
    keys: { isDown: (c: string) => down.includes(c) },
    pointer: {
      active: true,
      kind: "mouse",
      x: 432,
      y: 335,
      buttons,
      touches: 0,
      takeWheel: () => {
        const n = w;
        w = 0;
        return n;
      },
      deactivate() {},
    },
  } as unknown as GameHost;
};

describe("Maus für Spieler 1", () => {
  test("Schiffsmitte unter den Zeiger, links Feuer, rechts Beam, Mitte Nova, Rad Wechsel", () => {
    const h = withMouse(7, 1);
    const i = new PointerControl().apply(h, readInput(h), { x: 0, y: 0 });
    expect(i).toMatchObject({
      target: { x: 400, y: 300 },
      fire: true,
      beam: true,
      nova: true,
      switchWeapon: true,
    });
  });

  test("ohne Zeiger bleibt die Eingabe unverändert, Pfeiltasten haben Vorrang", () => {
    const plain = { keys: { isDown: () => false } } as unknown as GameHost;
    expect(new PointerControl().apply(plain, NO_INPUT, undefined)).toBe(NO_INPUT);
    const h = withMouse(0, 0, "ArrowLeft");
    expect(new PointerControl().apply(h, readInput(h), undefined).target).toBeUndefined();
  });
});

describe("Tastenübersicht", () => {
  test("Einzelspiel: alle Aktionen mit Zusatztasten, Hupe und Pause", () => {
    const [solo] = dovezControls(1);
    expect(solo?.rows.map((r) => r.id)).toEqual([...ACTIONS, "horn", "pause"]);
    expect(solo?.rows.find((r) => r.id === "fire")).toMatchObject({
      codes: ["KeyS", "Space"],
      pointer: "left",
    });
    expect(solo?.rows.find((r) => r.id === "horn")?.codes).toEqual(["F11"]);
  });

  test("zu zweit je Spieler ein Abschnitt mit den IDs der Tastenbelegung", () => {
    const [p1, p2] = dovezControls(2);
    expect(p1).toMatchObject({ pad: 0 });
    expect(p1?.rows[0]).toMatchObject({ id: "left", codes: ["ArrowLeft", "KeyJ"] });
    expect(p2).toMatchObject({ pad: 1 });
    expect(p2?.rows[3]).toMatchObject({ id: "down2", codes: ["Numpad5"] });
    expect(p2?.rows.some((r) => r.pointer)).toBe(false);
  });

  test("Launcher: beide Spieler", () => {
    expect(dovezAllControls().map((g) => g.label?.de)).toEqual(["Spieler 1", "Spieler 2"]);
  });
});
