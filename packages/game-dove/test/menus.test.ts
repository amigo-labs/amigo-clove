import { describe, expect, test } from "bun:test";
import type { HudSprite, UiField } from "@clove/core";
import { defaultHighscores } from "../src/flow/highscore";
import {
  MenuItem,
  configFrom,
  continueConfirm,
  creditsText,
  farewellNotice,
  getReadyNotice,
  highscoreInput,
  levelSelectMenu,
  optionsForm,
  pauseMenu,
  titleMenu,
} from "../src/flow/menus";
import { DEFAULT_CONFIG } from "../src/flow/rules";
import { creditLines } from "../src/flow/texts";
import { VbRnd } from "../src/sim";

const sprite = (id: string, [x, y, w, h]: readonly number[]): HudSprite => ({
  url: id,
  x: x!,
  y: y!,
  w: w!,
  h: h!,
  sheetW: 640,
  sheetH: 480,
});

const info = (fields: readonly UiField[] | void, id: string) =>
  fields?.find((f) => f.id === id && f.kind === "info");

describe("HTML-Bildschirme von DOVE", () => {
  test("Titel: sechs Menüpunkte wie in titel.spr, ESC, Highscores daneben", () => {
    const hs = defaultHighscores(new VbRnd());
    const m = titleMenu(sprite, hs, MenuItem.Info);
    expect(m.items.map((i) => i.label)).toEqual([
      "Let's go !",
      "Extralevel",
      "Tutorial",
      "Info",
      "Options",
      "Quit",
    ]);
    expect(m.selected).toBe(String(MenuItem.Info));
    expect(m.back).toBe("escape");
    const table = m.aside?.[0];
    expect(table?.kind === "table" && table.rows.length).toBe(9);
  });

  test("Optionen: Punktefaktor folgt den Schaltern, Freischalt-Hinweis ab 1,25", () => {
    const form = optionsForm(DEFAULT_CONFIG, true);
    expect(info(form.fields, "factor")).toMatchObject({ text: "Punktefaktor: 1" });
    expect(info(form.fields, "hint")).toBeUndefined();
    const values = { enemyShots: "1", wallsKill: "1", weaponLoss: "1" };
    const next = form.onChange?.(values, "enemyShots");
    expect(info(next, "factor")).toMatchObject({ text: "Punktefaktor: 1,5" });
    expect(info(next, "hint")).toBeDefined();
    expect(configFrom({ ...DEFAULT_CONFIG, unlocked: [3] }, values)).toEqual({
      enemyShots: 1,
      wallsKill: true,
      weaponLoss: true,
      unlocked: [3],
    });
    expect(form.actions.map((a) => a.id)).toEqual(["save", "back"]);
  });

  test("Levelauswahl: Level 1 und Freigeschaltete, je mit Vorschaubild", () => {
    const m = levelSelectMenu(sprite, { ...DEFAULT_CONFIG, unlocked: [2, 3] }, false);
    expect(m.items.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(m.items[1]).toMatchObject({ label: "2. Factory" });
    expect(m.items[1]?.image).toMatchObject({ sprite: { url: "image/2" } });
  });

  test("Get Ready, Continue, Namenseingabe, Pause", () => {
    expect(getReadyNotice(sprite, 3, 1200, 2, true)).toMatchObject({
      until: "key",
      back: "back",
      lines: ["Level 3 - Deep Blue See", "Points: 1200   Ships: 2"],
    });
    const c = continueConfirm(sprite, 42000, 4, true);
    expect(c.items.map((i) => i.label)).toEqual(["Yes, ya!", "No!"]);
    expect(c.lines?.[1]).toContain("Platz 4");
    expect(continueConfirm(sprite, 10, 0, true).lines).toEqual(["Score:10"]);
    expect(highscoreInput(2, false)).toMatchObject({
      title: "You placed 2nd",
      fields: [{ id: "name", max: 20 }],
    });
    const p = pauseMenu(true);
    expect(p).toMatchObject({ over: "level", back: "resume" });
    expect(p.items.map((i) => i.id)).toEqual(["resume", "abort"]);
    expect(p.aside?.[0]?.kind).toBe("controls");
  });

  test("Credits: alle Beteiligten aus dem Abspann, Abschied mit Homepage", () => {
    for (const german of [true, false]) {
      const lines = creditsText(sprite, german).blocks.flatMap((b) =>
        b.kind === "lines" ? b.lines : [],
      );
      expect(lines).toEqual(creditLines(german).slice(1));
      expect(lines.length).toBe(27);
    }
    expect(farewellNotice(true)).toMatchObject({ until: { ms: 5000 } });
    expect(farewellNotice(true).lines).toContain("www.Kauto.de");
  });
});
