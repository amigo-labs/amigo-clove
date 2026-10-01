/** Continue- und Pause-Bildschirm: Abläufe mit den HTML-Bildschirmen der Shell, ohne Pixi. */
import { describe, expect, test } from "bun:test";
import { dovezControls } from "../src/controls";
import {
  CONTINUE_MS,
  DIGIT_MS,
  STEP_PASSES,
  applyContinue,
  continueRanks,
  rankTexts,
  runContinue,
} from "../src/game/continueScreen";
import {
  HIGHSCORE_KEY,
  NOT_RANKED,
  addHighscore,
  emptyHighscores,
  parseHighscores,
  serializeHighscores,
} from "../src/game/highscore";
import { creditsScreen } from "../src/game/credits";
import { loadingNotice } from "../src/game/loadingScreen";
import { runPause, wrapRadioLog } from "../src/game/pauseScreen";
import { Profile } from "../src/game/profile";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";
import { ScriptUi, memoryStore } from "./fakeUi";

const profile = (store = memoryStore()) =>
  new Profile(store, 1, true, { names: ["Bruce"], ids: [7] });

describe("Continue", () => {
  test("Abfrage über dem Level: Countdown 9 à 28 × 40 ms, Rang-Zeile, Highscore vorher gespeichert", async () => {
    const store = memoryStore();
    const ui = new ScriptUi([{ id: "yes" }]);
    const ok = await runContinue(ui, {
      lang: "de",
      profile: profile(store),
      score: [500],
      persist: true,
    });
    expect(ok).toBe(true);
    const s = ui.shown[0]!;
    expect(s.kind).toBe("confirm");
    if (s.kind !== "confirm") return;
    expect(s.over).toBe("level");
    expect(s.title).toBe("Continue");
    expect(s.countdown).toEqual({ from: 9, ms: STEP_PASSES * CONTINUE_MS, faster: 3 });
    expect(DIGIT_MS).toBe(1120);
    expect(s.items.map((i) => [i.id, i.label])).toEqual([
      ["yes", "Ja"],
      ["no", "Nein"],
    ]);
    expect(s.lines).toEqual(["Bruce landet auf Platz 1!"]);
    expect(parseHighscores(store.get(HIGHSCORE_KEY))[0]).toEqual({
      name: "Bruce",
      score: 500,
      id: 7,
    });
  });

  test("„Nein“, Ablauf und Abbruch: Game Over; Sichtprüfung speichert nichts", async () => {
    for (const id of ["no", "timeout", "aborted"]) {
      const store = memoryStore();
      const ok = await runContinue(new ScriptUi([{ id }]), {
        lang: "en",
        profile: profile(store),
        score: [10],
        persist: id !== "aborted",
      });
      expect(ok).toBe(false);
      expect(store.get(HIGHSCORE_KEY) !== null).toBe(id !== "aborted");
    }
    const ui = new ScriptUi([{ id: "timeout" }]);
    await runContinue(ui, { lang: "ru", profile: profile(), score: [0, 0], persist: false });
    const s = ui.shown[0]!;
    expect(s.kind === "confirm" && s.items.map((i) => i.label)).toEqual(["Да", "Нет"]);
  });

  test("Annehmen: Leben 4, Punkte ÷ 3, dann Neustart mit 3 Leben", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    w.score = [100_001, 0];
    w.lives = 0;
    w.state = 1;
    expect(w.respawn()).toBe(false);
    applyContinue(w);
    expect(w.lives).toBe(4);
    expect(w.score[0]).toBe(33_333);
    expect(w.extraLifeAt).toBe(3);
    expect([w.musicVolume, w.musicStep]).toEqual([0, 5]);
    expect(w.respawn()).toBe(true);
    expect(w.state as number).toBe(0);
    expect(w.lives).toBe(3);
    expect(w.score[0]).toBe(33_333);
    // Musik blendet in 20 Ticks ein
    for (let t = 0; t < 20; t++) w.step([]);
    expect(w.musicVolume).toBe(100);
  });

  test("Annehmen zu zweit: gemeinsame Leben 7 → 6, beide Punktestände ÷ 3", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, { players: 2 });
    w.score = [10, 20];
    w.lives = 0;
    w.state = 1;
    applyContinue(w);
    expect(w.lives).toBe(7);
    expect(w.respawn()).toBe(true);
    expect(w.lives).toBe(6);
    expect(w.score).toEqual([3, 6]);
  });
});

describe("Highscore", () => {
  test("Einsortieren, Gleichstand davor, ein Platz je Spiel", () => {
    let list = emptyHighscores();
    let r = addHighscore(list, "A", 500, 1);
    expect(r.rank).toBe(1);
    list = r.list;
    r = addHighscore(list, "B", 500, 2);
    expect(r.rank).toBe(1);
    list = r.list;
    expect(list.slice(0, 3).map((e) => e.name)).toEqual(["B", "A", ""]);
    // dasselbe Spiel schlechter: nicht eingetragen
    r = addHighscore(list, "B", 100, 2);
    expect(r.rank).toBe(NOT_RANKED);
    expect(r.list).toEqual(list);
    // dasselbe Spiel besser: alter Eintrag rückt heraus
    r = addHighscore(list, "A", 900, 1);
    expect(r.rank).toBe(1);
    expect(r.list.slice(0, 3).map((e) => [e.name, e.score])).toEqual([
      ["A", 900],
      ["B", 500],
      ["", 0],
    ]);
    expect(r.list.length).toBe(10);
    expect(parseHighscores(serializeHighscores(r.list))).toEqual(r.list);
    expect(parseHighscores("kaputt")).toEqual(emptyHighscores());
  });

  test("volle Liste: 11 = nicht platziert, kein Text", () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      name: `N${i}`,
      score: 1000 - i,
      id: i + 1,
    }));
    const r = continueRanks(list, [{ name: "Bruce", score: 5, id: 99 }]);
    expect(r.ranks).toEqual([NOT_RANKED]);
    expect(rankTexts(["Bruce"], r.ranks, "de")).toEqual([]);
  });

  test("zwei Spieler: Spieler 2 davor schiebt den Platz von Spieler 1", () => {
    const r = continueRanks(emptyHighscores(), [
      { name: "Bruce", score: 100, id: 1 },
      { name: "Kim", score: 300, id: 2 },
    ]);
    expect(r.ranks).toEqual([2, 1]);
    expect(rankTexts(["Bruce", "Kim"], r.ranks, "de")).toEqual([
      { text: "Bruce landet auf Platz 2!", player: 0 },
      { text: "Kim landet auf Platz 1!", player: 1 },
    ]);
    expect(rankTexts(["Bruce"], [3], "en")[0]!.text).toBe("Bruce ranked at place 3!");
  });
});

/** Feste Zeichenbreite 10 px. */
const measure = (s: string) => s.length * 10;

const runPauseWith = (reply: string, store = memoryStore(), persist = true) =>
  runPause(new ScriptUi([{ id: reply }]), {
    lang: "de",
    level: "Level1-1 Skyfight",
    profile: new Profile(store, 2, true, { names: ["Bruce", "Kim"], ids: [1, 2] }),
    score: [300, 100],
    log: ["Achtung!", "", "Feind voraus"],
    controls: dovezControls(2),
    persist,
  });

describe("Pause", () => {
  test("Menü über dem Level: Titel, WEITER/EXIT, Funkprotokoll, Tastenübersicht; Esc setzt fort", async () => {
    const ui = new ScriptUi([{ id: "resume" }]);
    const store = memoryStore();
    const r = await runPause(ui, {
      lang: "de",
      level: "Level1-1 Skyfight",
      profile: new Profile(store, 1, true, { names: ["Bruce"], ids: [1] }),
      score: [300],
      log: ["Achtung!"],
      controls: dovezControls(1),
      persist: true,
    });
    expect(r).toBe("resume");
    expect(store.get(HIGHSCORE_KEY)).toBeNull();
    const s = ui.shown[0]!;
    if (s.kind !== "menu") throw new Error("Menü erwartet");
    expect(s.over).toBe("level");
    expect(s.title).toBe("Level1-1 Skyfight (Bruce)");
    expect(s.items.map((i) => [i.id, i.label])).toEqual([
      ["resume", "WEITER"],
      ["exit", "EXIT"],
    ]);
    expect(s.back).toBe("resume");
    expect(s.blocks).toEqual([{ kind: "lines", lines: ["Achtung!"], tone: "dim" }]);
    expect(s.aside?.[0]?.kind).toBe("controls");
  });

  test("EXIT trägt beide Spieler in die Highscoreliste ein", async () => {
    const store = memoryStore();
    expect(await runPauseWith("exit", store)).toBe("exit");
    const list = parseHighscores(store.get(HIGHSCORE_KEY));
    expect(list.slice(0, 2).map((e) => [e.name, e.score, e.id])).toEqual([
      ["Bruce", 300, 1],
      ["Kim", 100, 2],
    ]);
    // Sichtprüfung: nichts gespeichert; abgebrochen: weiter
    const quiet = memoryStore();
    expect(await runPauseWith("exit", quiet, false)).toBe("exit");
    expect(quiet.get(HIGHSCORE_KEY)).toBeNull();
    expect(await runPauseWith("aborted")).toBe("resume");
  });

  test("Funkprotokoll: vorne Wörter abnehmen, Rest unten, Trenner als Leerzeile", () => {
    const long = `${"a".repeat(30)} ${"b".repeat(30)} ${"c".repeat(20)}`;
    const lines = wrapRadioLog(["erste", " ".repeat(10), long], measure);
    expect(lines).toEqual([
      "",
      "",
      "",
      "erste",
      "",
      "a".repeat(30),
      `${"b".repeat(30)} ${"c".repeat(20)}`,
    ]);
    // ein einzelnes zu langes Wort bleibt stehen (kein Endlosumbruch)
    expect(wrapRadioLog(["x".repeat(80)], measure)[6]).toBe("x".repeat(80));
    // mehr als sieben Zeilen: die ältesten fallen weg
    const many = Array.from({ length: 9 }, (_, i) => `m${i}`);
    expect(wrapRadioLog(many, measure)).toEqual(many.slice(2));
  });
});

describe("Ladebild und Abspann", () => {
  const sprite = { url: "x.webp", x: 0, y: 0, w: 500, h: 3000, sheetW: 500, sheetH: 3000 };

  test("Ladebild: mit Take-Bild bis zur Taste, Mosaik bis alles geladen ist", () => {
    const take = loadingNotice({
      lang: "de",
      image: { sprite },
      mosaic: false,
      progress: () => 0.5,
    });
    expect(take).toMatchObject({
      kind: "notice",
      lines: ["Loading"],
      until: "any",
      prompt: "Press any key to start!",
    });
    expect(take.progress?.()).toBe(0.5);
    const mosaic = loadingNotice({ lang: "ru", image: undefined, mosaic: true, progress: () => 1 });
    expect(mosaic).toMatchObject({ lines: ["Загрузка"], until: "progress" });
    expect(mosaic.prompt).toBeUndefined();
    expect(mosaic.image).toBeUndefined();
  });

  test("Abspann: das Originalbild mit 40 px/s (1 px je 25 ms), Esc beendet", () => {
    const c = creditsScreen("de", sprite);
    expect(c).toMatchObject({
      kind: "text",
      image: { sprite },
      scroll: { pxPerSecond: 1000 / 25 },
      done: "Weiter",
      back: "done",
    });
    expect(creditsScreen("en", undefined).image).toBeUndefined();
  });
});
