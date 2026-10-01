import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Manifest } from "@clove/core";
import type { PlayStep } from "@clove/formats";
import { Campaign, type CampaignAction, videoId } from "../src/game/campaign";
import { FADE_TICKS, FadeLogic } from "../src/game/fadeOut";
import { parseSave, saveKey, saveLabel, serializeSave, type SaveFile } from "../src/game/saveGame";
import { emptyHighscores } from "../src/game/highscore";
import { runSaveScreen, saveMenu, savePlaces } from "../src/game/saveScreen";
import { VbRnd } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";
import { ScriptUi, memoryStore } from "./fakeUi";

const ROOT = join(import.meta.dir, "../../../assets/dovez");
const manifest = (await Bun.file(join(ROOT, "manifest.json")).json()) as Manifest;
const playFile = manifest.entries.find((e) => e.id === "data/play")!.file;
const steps = (await Bun.file(join(ROOT, playFile)).json()) as PlayStep[];

/** Alle Aktionen bis zum Skriptende, `credits` mit Epilog wie der Ablauf in `Game.ts`. */
function drain(c: Campaign): CampaignAction[] {
  const out: CampaignAction[] = [];
  for (let a = c.next("de"); ;) {
    out.push(a);
    if (a.kind === "end") return out;
    a = a.kind === "credits" && a.epilog ? c.epilog() : c.next("de");
  }
}

describe("Kampagne (LevelSkript)", () => {
  test("erster Durchgang: 23 Level, 6 Speicherpunkte, Outro, kein Epilog", () => {
    const c = new Campaign(steps);
    const all = drain(c);
    const levels = all.filter((a) => a.kind === "level");
    expect(levels).toHaveLength(23);
    expect(levels[0]).toEqual({
      kind: "level",
      slug: "level0-1_tutorial",
      name: "Level0-1 Tutorial",
      loading: "take0",
    });
    expect(all.filter((a) => a.kind === "save")).toHaveLength(6);
    expect(all[1]).toEqual({ kind: "video", id: "video/skyfight" });
    expect(all.at(-2)).toEqual({ kind: "credits", outro: "video/outrod", epilog: false });
    expect(c.passesDone).toBe(1);
    // alle Videos und Level gibt es als Asset
    const ids = new Set(manifest.entries.map((e) => e.id));
    for (const a of all) {
      if (a.kind === "video") expect(ids.has(a.id)).toBe(true);
      if (a.kind === "level") expect(ids.has(`leveldat/${a.slug}`)).toBe(true);
    }
  });

  test("ab dem zweiten Durchgang: Outro2 und danach das Epilog-Level", () => {
    const c = new Campaign(steps, { passesDone: 1 });
    expect(c.pass).toBe(2);
    const all = drain(c);
    expect(all.at(-3)).toEqual({ kind: "credits", outro: "video/outro2d", epilog: true });
    expect(all.at(-2)).toMatchObject({ kind: "level", slug: "epilog", loading: "" });
    expect(all.at(-1)).toEqual({ kind: "end" });
    expect(c.passesDone).toBe(2);
  });

  test("Einzellevel: Mosaik-Ladebild, danach Skriptende", () => {
    const c = new Campaign(steps);
    expect(c.single("Spacestation Bonus")).toEqual({
      kind: "level",
      slug: "spacestation_bonus",
      name: "Spacestation Bonus",
      loading: "",
    });
    expect(c.next("de")).toEqual({ kind: "end" });
  });

  test("Spielstand-Index: nach „Save“ geht es mit dem Zwischenvideo weiter", () => {
    const c = new Campaign(steps, { step: 5 });
    expect(c.next("en")).toEqual({ kind: "video", id: videoId("Missing_in_space.avi") });
    expect(videoId("Missing_in_space.avi")).toBe("video/missing_in_space");
  });
});

describe("Übergang zwischen Leveln", () => {
  test("Leben, Punkte, Waffen und Partikel bleiben, Position und Energie neu", async () => {
    const a = await loadTestLevel("level1-1_skyfight");
    const w = new World(a.level, a.sprites);
    expect(w.extraLifeAt).toBe(3);
    w.lives = 5;
    w.score = [123_456, 0];
    w.kills = 9;
    const p = w.players[0]!;
    p.shotPower = 3;
    p.speed = 8;
    p.maxEnergy = 150;
    p.energy = 20;
    p.x = 500;
    w.particles[2]!.present = true;
    w.particles[2]!.kind = 4;
    const carry = w.carry();
    const b = await loadTestLevel("level2-1_spacestation_i");
    const rnd = new VbRnd(1234);
    const v = new World(b.level, b.sprites, { carry, rnd });
    expect(v.rnd).toBe(rnd);
    expect(v.lives).toBe(5);
    expect(v.score[0]).toBe(123_456);
    expect(v.shownScore[0]).toBe(123_456);
    expect(v.kills).toBe(9);
    const q = v.players[0]!;
    expect([q.shotPower, q.speed, q.maxEnergy, q.energy]).toEqual([3, 8, 150, 150]);
    expect(q.x).toBe(100);
    expect(v.particles[2]).toMatchObject({ present: true, kind: 4 });
  });
});

const texts = (lang: "de" | "ru" = "de") => ({
  lang,
  level: "Level1-2 Zeppelin Boss",
  scores: [12_345],
  places: [1],
  highscores: [{ name: "Bruce", score: 12_345, id: 7 }, ...emptyHighscores().slice(1)],
  ids: [7],
  slots: Array.from({ length: 21 }, (_, i) => (i === 2 ? "P1S1A - Level1-1  01.01.2026" : "---")),
});

describe("Speicherbildschirm (SaveGame)", () => {
  test("Menü: Titel, Punkte mit Platz, Highscore daneben, „Nicht speichern“ und 21 Plätze in 3 Spalten", () => {
    const m = saveMenu(texts());
    expect(m.title).toBe("Level1-2 Zeppelin Boss geschafft!");
    expect(m.blocks).toEqual([
      { kind: "lines", lines: ["Spieler 1: 12345 (HIGHSCORE: 1. Platz!)"] },
      { kind: "lines", lines: ["Spiel speichern?"], tone: "accent" },
    ]);
    const table = m.aside?.[0];
    expect(table?.kind === "table" && [table.rows[0], table.highlight]).toEqual([
      ["1.", "Bruce", "12345"],
      0,
    ]);
    expect(m.items).toHaveLength(22);
    expect(m.items[0]).toEqual({ id: "none", label: "Nicht speichern" });
    expect(m.items[3]).toEqual({ id: "slot3", label: "P1S1A - Level1-1  01.01.2026" });
    expect([m.columns, m.selected, m.back]).toEqual([3, "none", "none"]);
    expect(saveMenu(texts("ru")).title).toBe("Уровень расчищен!");
  });

  test("ein Platz schreibt save/<n> und zeigt „Gespeichert“; „Nicht speichern“ schreibt nichts", async () => {
    const a = await loadTestLevel("level1-1_skyfight");
    const w = new World(a.level, a.sprites);
    const file = (): SaveFile => ({
      version: 1,
      label: "P1S1A - Level1-2  28.09.2026",
      step: 5,
      pass: 1,
      players: 1,
      ship: 0,
      names: ["Bruce"],
      ids: [7],
      carry: w.carry(),
    });
    const store = memoryStore();
    let saved = 0;
    const ui = new ScriptUi([{ id: "slot4" }, { id: "timeout" }]);
    const slot = await runSaveScreen(ui, {
      ...texts(),
      storage: store,
      persist: true,
      file,
      saved: () => saved++,
    });
    expect(slot).toBe(4);
    expect(saved).toBe(1);
    expect(parseSave(store.get(saveKey(4)))).toEqual(file());
    expect(ui.shown[1]).toMatchObject({ kind: "notice", title: "Gespeichert" });
    for (const id of ["none", "aborted"]) {
      const quiet = memoryStore();
      const r = await runSaveScreen(new ScriptUi([{ id }]), {
        ...texts(),
        storage: quiet,
        persist: true,
        file,
      });
      expect(r).toBeUndefined();
      expect(quiet.data.size).toBe(0);
    }
    // Sichtprüfung (`screen=save`): nichts gespeichert
    const view = memoryStore();
    await runSaveScreen(new ScriptUi([{ id: "slot1" }]), {
      ...texts(),
      storage: view,
      persist: false,
      file,
    });
    expect(view.data.size).toBe(0);
  });

  test("Plätze im 2P-Spiel und Beschriftung", () => {
    expect(savePlaces([3, 3])).toEqual([4, 3]);
    expect(savePlaces([2, 5])).toEqual([2, 5]);
    const d = new Date(2026, 8, 28);
    expect(saveLabel(1, 0, 1, "Level1-2 Zeppelin Boss", d, "de")).toBe(
      "P1S1A - Level1-2  28.09.2026",
    );
    expect(saveLabel(2, 1, 30, "Level7-4 finalboss", d, "en")).toBe("P2S2Z - Level7-4  9/28/2026");
  });

  test("Spielstand: Serialisieren und Prüfen", async () => {
    const a = await loadTestLevel("level1-1_skyfight");
    const w = new World(a.level, a.sprites);
    const file: SaveFile = {
      version: 1,
      label: "x",
      step: 5,
      pass: 1,
      players: 1,
      ship: 0,
      names: ["Bruce"],
      ids: [1],
      carry: w.carry(),
    };
    expect(parseSave(serializeSave(file))).toEqual(file);
    expect(parseSave("{}")).toBeUndefined();
    expect(parseSave("kaputt")).toBeUndefined();
    expect(parseSave(null)).toBeUndefined();
  });
});

describe("Abblende", () => {
  test("FadeOut: Richtung 0 staucht oben/unten, sonst zufällige Seite; 2 bzw. 1 Rnd", () => {
    const r = new VbRnd(99);
    const f0 = new FadeLogic(0, r);
    expect(f0.rect).toEqual([0, 16, 800, 584]);
    const seed = r.seed;
    const f1 = new FadeLogic(1, r);
    const probe = new VbRnd(seed);
    const side = Math.floor(probe.next() * 4);
    probe.next();
    expect(r.seed).toBe(probe.seed);
    const sides: (readonly number[])[] = [
      [16, 0, 800, 600],
      [0, 16, 800, 600],
      [0, 0, 784, 600],
      [0, 0, 800, 584],
    ];
    expect([...f1.rect]).toEqual([...sides[side]!]);
    for (let i = 0; i < FADE_TICKS; i++) f1.step();
    expect(f1.done).toBe(true);
    expect(f1.alpha).toBe(0);
  });
});
