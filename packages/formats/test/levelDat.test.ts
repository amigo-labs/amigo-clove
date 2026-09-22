import { describe, expect, test } from "bun:test";
import {
  EventOp,
  LevelDatError,
  encodeCp1252,
  formatEventLine,
  parseEventLine,
  parseLevelDat,
  serializeLevelDat,
  type DoveLevel,
} from "../src/index";
import { DOVE_LEVELS, doveLevelPath, readBytes } from "./fixtures";

const levels = new Map<number, { bytes: Uint8Array; level: DoveLevel }>();
for (const n of DOVE_LEVELS) {
  const bytes = await readBytes(doveLevelPath(n));
  levels.set(n, { bytes, level: parseLevelDat(bytes) });
}
const inRange = (v: number, max: number) => expect(v >= 1 && v <= max).toBe(true);
const dec = (b: Uint8Array) => new TextDecoder("windows-1252").decode(b);
const get = (n: number) => levels.get(n) as { bytes: Uint8Array; level: DoveLevel };

describe("LevelDat — Round-Trip über alle 12 Level", () => {
  test.each(DOVE_LEVELS)("Level%d: serialize(parse(bytes)) ist byte-identisch", (n) => {
    const { bytes, level } = get(n);
    const out = serializeLevelDat(level);
    expect(out.length).toBe(bytes.length);
    expect(Buffer.compare(out, bytes)).toBe(0);
  });
});

describe("LevelDat — Struktur", () => {
  const all = DOVE_LEVELS.map((n) => get(n).level);

  test("145 Gegner-Records mit zusammen 319 Frames", () => {
    expect(all.reduce((a, l) => a + l.enemies.length, 0)).toBe(145);
    expect(all.reduce((a, l) => a + l.enemies.reduce((b, e) => b + e.frames.length, 0), 0)).toBe(
      319,
    );
  });

  test("jede Kontur hat h+1 Zeilenpaare", () => {
    for (const l of all) {
      for (const e of l.enemies) {
        for (const f of e.frames) expect(f.spans.length).toBe(2 * (e.rect.b - e.rect.t + 1));
      }
    }
  });

  test("Levellänge 32000 und 32001 Event-Zeilen, die letzte leer", () => {
    for (const l of all) {
      expect(l.length).toBe(32000);
      expect(l.events).toHaveLength(32001);
      expect(l.events.at(-1)).toEqual([]);
    }
  });

  test("Event-Zählung über alle Level", () => {
    const count = new Map<string, number>();
    for (const l of all) {
      for (const line of l.events) {
        for (const e of line) {
          const key = e.kind === "spawn" ? "spawn" : `;${e.op}`;
          count.set(key, (count.get(key) ?? 0) + 1);
        }
      }
    }
    expect(Object.fromEntries(count)).toEqual({
      ";0": 771,
      ";1": 2105,
      ";2": 217,
      ";3": 40,
      ";4": 49,
      spawn: 3915,
    });
  });

  test("belegte Tick-Zeilen pro Level", () => {
    expect(all.map((l) => l.events.filter((e) => e.length > 0).length)).toEqual([
      20, 416, 190, 371, 218, 368, 363, 444, 563, 819, 9, 554,
    ]);
  });

  test("Event-Referenzen: Records 1-basiert, Pattern ≤ 0 sind eingebaute Bewegungen", () => {
    for (const l of all) {
      for (const line of l.events) {
        for (const e of line) {
          if (e.kind !== "command") continue;
          if (e.op === EventOp.Tile) inRange(e.a, l.tiles.length);
          if (e.op === EventOp.BackgroundObject) inRange(e.a, l.backgroundObjects.length);
          if (e.op === EventOp.SelectEnemy) {
            inRange(e.a, l.enemies.length);
            expect(e.b >= -7 && e.b <= l.patterns.length).toBe(true);
          }
          if (e.op === EventOp.Extra) expect([-2, -1, 0, 1, 2, 3]).toContain(e.a);
          if (e.op === EventOp.Marker) expect([e.a, e.b]).toEqual([0, 0]);
        }
      }
    }
  });

  test("Level 1 „Ufo“ — Stichprobe gegen die Spec", () => {
    const ufo = get(1).level.enemies.find((e) => e.name === "Ufo");
    expect(ufo?.rect).toEqual({ l: 66, t: 400, r: 129, b: 434 });
    expect(ufo?.params).toEqual([1, 5, 100, 1, 4]);
    expect(Array.from(ufo?.frames[0]?.spans.subarray(0, 4) ?? [])).toEqual([29, 32, 27, 34]);
  });

  test("Umlaute in Namen werden als CP1252 gelesen", () => {
    expect(get(1).level.enemies.map((e) => e.name)).toContain("Kreissäge");
  });

  test("Pattern-Terminator mit Wert ≠ 0 bleibt erhalten", () => {
    const unten = get(2).level.patterns.find((p) => p.name === "unten");
    expect(unten?.waypoints).toEqual([
      [559, 306],
      [559, 136],
    ]);
    expect(unten?.end).toBe(98);
  });
});

describe("Event-Zeilen", () => {
  test.each([
    "",
    "166§",
    ";3 0 0!",
    ";1 4 0! 68§",
    "68§ 133§",
    "30§;1 4 0! 37§",
    ";0 1 -20!;4 6 65!",
  ])("'%s' round-trippt", (line) => {
    expect(formatEventLine(parseEventLine(line))).toBe(line);
  });

  test("zerlegt Kommandos und Spawns", () => {
    expect(parseEventLine(";1 4 0! 68§")).toEqual([
      { kind: "command", op: 1, a: 4, b: 0 },
      { kind: "spawn", y: 68 },
    ]);
  });

  test.each(["68§  12§", " 68§", ";1 4 0!;", "x", ";1 4! 5§", "68§ ;1 4 0!"])(
    "lehnt nicht-kanonische Zeile '%s' ab",
    (line) => {
      expect(() => parseEventLine(line)).toThrow(LevelDatError);
    },
  );
});

describe("LevelDat — Fehlerfälle", () => {
  const enc = encodeCp1252;

  test("Konturlänge, die nicht aufgeht, wird gemeldet", () => {
    const src = '"*"\n"*"\n"G"\n0\n0\n4\n2\n1\n2\n3\n4\n5\n0\n1\n0\n1\n"*"\n"*"\n0\n\n"bg"\n';
    expect(() => parseLevelDat(enc(src))).toThrow(/kein Vielfaches von 8/);
  });

  test("Minimaldatei round-trippt", () => {
    const src = '"*"\n"*"\n"*"\n"*"\n1\n\n1§\n"bg"\n';
    const lvl = parseLevelDat(enc(src));
    expect(lvl.events).toEqual([[], [{ kind: "spawn", y: 1 }]]);
    expect(dec(serializeLevelDat(lvl))).toBe(src);
  });

  test("CRLF-Dateien behalten ihr Zeilenende", () => {
    const src = '"*"\r\n"*"\r\n"*"\r\n"*"\r\n0\r\n\r\n"bg"\r\n';
    const lvl = parseLevelDat(enc(src));
    expect(lvl.eol).toBe("\r\n");
    expect(dec(serializeLevelDat(lvl))).toBe(src);
  });

  test("abgeschnittene Datei", () => {
    expect(() => parseLevelDat(enc('"*"\n"*"\n"*"\n"*"\n5\n\n'))).toThrow(LevelDatError);
  });
});
