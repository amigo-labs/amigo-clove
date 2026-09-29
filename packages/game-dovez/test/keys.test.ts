/** Tastenbelegung (`InitKeyConfig`, `Taste`, `KeyName`, `GetKeyText`) und ihre Konfiguration. */
import { afterEach, describe, expect, test } from "bun:test";
import type { GameHost } from "@clove/core";
import { DEFAULT_CONFIG, parseConfig } from "../src/game/config";
import {
  DEFAULT_KEYS,
  DIK,
  heldDiks,
  keyLabel,
  keyName,
  keyText,
  readInput,
  useKeys,
} from "../src/game/input";

const host = (...down: string[]): GameHost =>
  ({ keys: { isDown: (c: string) => down.includes(c), held: () => down } }) as unknown as GameHost;

afterEach(() => useKeys(DEFAULT_KEYS));

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

  test("Satz 1: IJKL und Pfeile; Satz 2: Ziffernblock, Num 5 und Num 2 runter", () => {
    expect(readInput(host("ArrowUp"), 1).up).toBe(true);
    expect(readInput(host("KeyI"), 1).up).toBe(true);
    expect(readInput(host("Numpad5"), 2).down).toBe(true);
    expect(readInput(host("Numpad2"), 2).down).toBe(true);
    expect(readInput(host("End"), 2).fire).toBe(true);
    expect(readInput(host("PageUp"), 2).nova).toBe(true);
    expect(readInput(host("KeyS"), 2).fire).toBe(false);
  });

  test("zweite Taste kommt dazu, die feste erste bleibt", () => {
    const keys = [...DEFAULT_KEYS];
    keys[4] = "KeyY";
    useKeys(keys);
    expect(readInput(host("KeyY")).fire).toBe(true);
    expect(readInput(host("KeyS")).fire).toBe(true);
    // Satz 1 bleibt unberührt
    expect(readInput(host("KeyY"), 1).fire).toBe(false);
    // ungültige Länge fällt auf die Vorgabe zurück
    useKeys(["KeyY"]);
    expect(readInput(host("KeyY")).fire).toBe(false);
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

  test("GetKeyText: „a“ oder „a / b“, Beschriftung des Tastenhinweises", () => {
    expect(keyText(0, 0)).toBe("Left");
    expect(keyText(1, 0)).toBe("J / Left");
    expect(keyText(2, 3)).toBe("Num. 5 / Num. 2");
    const keys = [...DEFAULT_KEYS];
    keys[4] = "KeyY";
    expect(keyText(0, 4, keys)).toBe("S / Z");
    expect(keyLabel(4)).toBe("S");
  });

  test("gehaltene Tasten als DIK-Codes aufsteigend, Unbekanntes entfällt", () => {
    expect(heldDiks(host("KeyS", "Escape", "Unbekannt", "ArrowLeft"))).toEqual([1, 31, 203]);
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
