import { describe, expect, test } from "bun:test";
import type { HudSprite } from "@clove/core";
import { doveHud } from "../src/hud";
import { BEAM_MAX } from "../src/sim";
import { tinyLevel } from "./helpers";

const sprite = ([x, y, w, h]: readonly number[]): HudSprite => ({
  url: "ss",
  x: x!,
  y: y!,
  w: w!,
  h: h!,
  sheetW: 400,
  sheetH: 200,
});

describe("DOVE-HUD", () => {
  test("Konsole als Daten: Punkte, Schiffe, Tempo, Beam, Waffe, Options, Bombe, Pod", () => {
    const w = tinyLevel([]);
    w.shownScore = 1234;
    w.colour = 2;
    w.stage = 1;
    w.optionCount = 2;
    w.bomb = 1;
    w.charge = BEAM_MAX;
    w.shield = 250;
    const hud = doveHud(w, sprite, true);
    expect(hud.lives).toBe(w.lives);
    const p = hud.players[0]!;
    expect(p.score).toBe(1234);
    expect(p.meters.find((m) => m.id === "beam")).toMatchObject({ full: true });
    expect(p.meters.find((m) => m.id === "shield")).toMatchObject({ value: 250, max: 500 });
    expect(p.icons.map((i) => i.label)).toEqual([
      "Grün 2",
      "Options 2",
      "Bombe",
      "Extrawaffe vorn",
    ]);
    expect(p.icons[0]).toMatchObject({ count: 2, sprite: { x: 71, y: 0 } });
    expect(hud.boss).toBeUndefined();
  });

  test("Boss-Lebenspunkte über die sichtbaren Teile", () => {
    const w = tinyLevel([]);
    w.bossMode = true;
    w.bossType.set([1, 2, -1]);
    w.bossVisible.set([1, 1, 1]);
    w.bossHP.set([300, 50, 999]);
    w.bossHPMax.set([400, 100, 999]);
    expect(doveHud(w, sprite, false).boss).toEqual({ hp: 350, max: 500 });
  });
});
